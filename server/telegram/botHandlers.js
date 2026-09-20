/**
 * Telegram Bot Command & Interaction Handlers
 * 
 * Handles:
 * - /start and key linking (L2-WORKER / L1-BOSS / SUB-...)
 * - /scan and "🔍 Scan for Orders" (5-minute active liveness radar)
 * - Auto-expiry notification when 0 orders found
 * - Order alerts to priority workers (Min 5 scans + Success Rate ranking)
 * - Order claiming, QR code image sending, status updates
 * - Mistake reporting and appeal submissions
 * - FastScan Message Bot feedback forwarding
 */

import { db } from '../db.js';
import { priorityQueue } from './priorityQueue.js';
import { TelegramClient } from './telegramClient.js';

export class TelegramBotService {
  constructor(client = null) {
    this.client = client || new TelegramClient();
    this.userStates = new Map(); // chatId -> { action: 'awaiting_utr' | 'awaiting_key', data }

    // Connect expiry callback from priorityQueue
    priorityQueue.setExpiryCallback((session) => {
      this.handleSessionExpired(session);
    });
  }

  setToken(token) {
    this.client.setToken(token);
  }

  /**
   * Main router for all incoming Telegram updates
   */
  async handleUpdate(update) {
    if (!update) return;

    // 1. Message handling
    if (update.message) {
      await this.handleMessage(update.message);
      return;
    }

    // 2. Callback query handling (inline buttons)
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }
  }

  /**
   * Handle text messages and commands
   */
  async handleMessage(msg) {
    const chatId = msg.chat?.id;
    const text = (msg.text || '').trim();
    if (!chatId || !text) return;

    // Check user state (e.g. typing UTR for appeal or entering key)
    const state = this.userStates.get(chatId);
    if (state && state.action === 'awaiting_appeal_utr') {
      await this.processAppealUtrInput(chatId, text, state.data);
      this.userStates.delete(chatId);
      return;
    }

    // Find if user is already linked to this telegram chat
    const linkedUser = db.getUsers().find(u => u.telegram_chat_id === chatId);

    // Command: /start
    if (text === '/start' || text.startsWith('/start ')) {
      const startArg = text.split(' ')[1];
      if (startArg) {
        await this.linkUserByKey(chatId, startArg);
        return;
      }

      if (linkedUser) {
        await this.sendDashboard(chatId, linkedUser);
      } else {
        await this.client.sendMessage(
          chatId,
          `👋 <b>Welcome to FastScan UPI Platform Bot!</b>\n\n` +
          `To link your account and start claiming UPI scan tasks, please reply with your <b>Joining Key</b>.\n\n` +
          `🔑 <i>Example:</i> <code>L2-WORKER-RAHUL-7821</code> or <code>SUB-ALEX-4921</code>`,
          { parse_mode: 'HTML' }
        );
      }
      return;
    }

    // If message looks like a Joining Key or worker is not linked yet
    if (text.startsWith('KEY-') || text.startsWith('L1-') || text.startsWith('L2-') || text.startsWith('SUB-') || (!linkedUser && text !== '/start')) {
      await this.linkUserByKey(chatId, text);
      return;
    }

    // Worker commands (requires linked worker)
    if (linkedUser) {
      if (text === '/scan' || text.includes('Scan for Orders') || text.includes('Scan Again')) {
        await this.startWorkerRadar(chatId, linkedUser);
        return;
      }

      if (text === '/stop' || text.includes('Stop Scanning')) {
        priorityQueue.stopScanningSession(linkedUser.id, true);
        await this.client.sendMessage(
          chatId,
          `🔴 <b>Scanning Radar Stopped.</b> You are now offline.\nTap <b>🔍 Scan for Orders</b> whenever you are ready to resume.`,
          {
            parse_mode: 'HTML',
            reply_markup: this.getMainKeyboard(linkedUser)
          }
        );
        return;
      }

      if (text === '/balance' || text.includes('Balance') || text.includes('Stats')) {
        await this.sendStats(chatId, linkedUser);
        return;
      }

      if (text === '/tasks' || text.includes('Active Tasks')) {
        await this.sendActiveTasks(chatId, linkedUser);
        return;
      }

      // User Requirement: "claim upto 3 orders at a time click on request 3 orders"
      if (text === '/request3' || text.includes('Request 3 Orders') || text.includes('Request Orders')) {
        await this.handleBatchClaim(chatId, linkedUser, 3);
        return;
      }
    }

    // Unrecognized text fallback
    if (linkedUser) {
      await this.sendDashboard(chatId, linkedUser);
    } else {
      await this.client.sendMessage(
        chatId,
        `⚠️ <i>Account not linked yet.</i>\nPlease enter your Joining Key (e.g. <code>L2-WORKER-XXXX</code>) to activate.`,
        { parse_mode: 'HTML' }
      );
    }
  }

  /**
   * Link Telegram Chat to existing user or redeem new key
   */
  async linkUserByKey(chatId, rawKey) {
    const cleanKey = rawKey.trim();
    let keyRecord = db.getKeys().find(k => k.key && k.key.toUpperCase() === cleanKey.toUpperCase());
    let user = null;

    if (keyRecord) {
      if (keyRecord.used_by) {
        user = db.getUser(keyRecord.used_by);
      } else if (keyRecord.created_by) {
        user = db.getUser(keyRecord.created_by);
      }
    } else {
      user = db.getUser(cleanKey) || 
             db.getUser(cleanKey.toLowerCase()) || 
             db.getUsers().find(u => u.joining_key && u.joining_key.toUpperCase() === cleanKey.toUpperCase()) ||
             db.getUsers().find(u => u.name && u.name.toLowerCase() === cleanKey.toLowerCase());
    }

    if (!keyRecord && !user) {
      await this.client.sendMessage(
        chatId,
        `❌ <b>Invalid Joining Key or Worker ID:</b> <code>${cleanKey}</code>\nPlease verify your key and try again.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (!user && keyRecord) {
      // Find user by key's assigned_name or create new worker/agent
      const assignedName = keyRecord.assigned_name || (keyRecord.role === 'boss' ? 'Agent Boss' : 'Worker');
      const prefix = keyRecord.role === 'boss' ? 'agent_' : 'worker_';
      const userId = `${prefix}${Date.now().toString(36)}`;

      user = {
        id: userId,
        role: keyRecord.role === 'boss' ? 'agent' : 'worker',
        name: assignedName,
        level: keyRecord.role === 'boss' ? 1 : (keyRecord.target_level || 2),
        parent_id: keyRecord.created_by || null,
        balance: 0.00,
        total_personal_completed: 0,
        total_team_completed: 0,
        consecutive_failures: 0,
        is_banned: false,
        timeout_until: null,
        is_online: false,
        joining_key: keyRecord.key,
        telegram_chat_id: chatId
      };

      db.addUser(user);
      db.updateKey(keyRecord.key, {
        is_used: true,
        used_by: user.id,
        used_by_name: user.name,
        used_at: new Date().toISOString()
      });
    } else if (user) {
      // Link chat ID to existing user
      db.updateUser(user.id, { telegram_chat_id: chatId });
    }

    const metrics = priorityQueue.calculateWorkerMetrics(user.id) || {
      totalScans: 0,
      successfulCount: 0,
      successRate: 0,
      isPriorityEligible: false
    };

    await this.client.sendMessage(
      chatId,
      `🎉 <b>Account Linked Successfully!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>Name:</b> ${user.name}\n` +
      `💼 <b>Role:</b> ${user.role === 'worker' ? `L${user.level} Worker` : 'L1 Boss (Agent)'}\n` +
      `💰 <b>Balance:</b> $${(user.balance || 0).toFixed(2)}\n\n` +
      `📊 <b>Performance & Priority Status:</b>\n` +
      `• Settled Scans: <b>${metrics.totalScans}</b>\n` +
      `• Success Rate: <b>${metrics.successRate}%</b>\n` +
      `• Priority Queue: <b>${metrics.isPriorityEligible ? '⭐ ELIGIBLE (Min 5 Scans Met)' : `🟡 BEGINNER (${metrics.totalScans}/5 scans to unlock)`}</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Tap <b>🔍 Scan for Orders</b> to start your 5-minute active scanning window.`,
      {
        parse_mode: 'HTML',
        reply_markup: this.getMainKeyboard(user)
      }
    );
  }

  /**
   * Start 5-minute active liveness scanning radar for worker
   */
  async startWorkerRadar(chatId, user) {
    if (user.is_banned) {
      await this.client.sendMessage(chatId, `🚫 <b>Account Banned:</b> You cannot claim orders due to consecutive failure strikes.`);
      return;
    }

    if (user.timeout_until && new Date(user.timeout_until).getTime() > Date.now()) {
      const remainingSecs = Math.ceil((new Date(user.timeout_until).getTime() - Date.now()) / 1000);
      await this.client.sendMessage(chatId, `⏳ <b>Timeout Active:</b> Please wait ${remainingSecs} seconds before scanning.`);
      return;
    }

    // Start 5-minute radar session
    const session = priorityQueue.startScanningSession(user.id, chatId, 300);
    const metrics = priorityQueue.calculateWorkerMetrics(user.id);

    await this.client.sendMessage(
      chatId,
      `🟢 <b>ACTIVE SCANNING RADAR STARTED</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⏱️ <b>Liveness Timer:</b> 5 minutes (auto-stops if idle)\n` +
      `🎯 <b>Priority Tier:</b> ${metrics.isPriorityEligible ? `⭐ High Priority (${metrics.successRate}% Success)` : `Beginner Fleet (${metrics.totalScans}/5 Scans)`}\n` +
      `📡 <b>Status:</b> Listening for real-time UPI orders\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `<i>Keep your notification volume ON! When an order is published, you will receive an instant claim button here.</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛑 Stop Radar / Go Offline', callback_data: `stop_radar:${user.id}` }],
            [{ text: '📊 My Stats & Balance', callback_data: `view_stats:${user.id}` }]
          ]
        }
      }
    );

    // Immediately check if there is an existing unclaimed order in the pool
    const pendingOrders = db.getOrders().filter(o => o.status === 'pending');
    if (pendingOrders.length > 0) {
      // Offer the oldest/most urgent pending order
      const order = pendingOrders[0];
      await this.notifyOrderToWorker(chatId, order, metrics);
    }
  }

  /**
   * Triggered when a worker's 5-minute radar session expires with 0 orders claimed
   * User Requirement: "stops after 5 mins itself and returns 0 order found or omsething start again so ensuring user is online"
   */
  async handleSessionExpired(session) {
    if (!session || !session.chatId) return;

    await this.client.sendMessage(
      session.chatId,
      `⏱️ <b>SCANNING RADAR TIMEOUT (00:00)</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ <b>Session Timer Ended (00:00):</b> 0 orders found during this 5-minute search window.\n\n` +
      `To ensure you are still actively online at your device and ready to scan, please <b>confirm you are online</b> to resume:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ YES, I AM ONLINE — RESUME SCANNING', callback_data: `start_radar:${session.workerId}` }],
            [{ text: '📥 Request 3 Orders (Batch Claim)', callback_data: `request_batch:${session.workerId}:3` }],
            [{ text: '💰 View Balance & Stats', callback_data: `view_stats:${session.workerId}` }]
          ]
        }
      }
    );
  }

  /**
   * Notify an order to an actively scanning worker
   */
  async notifyOrderToWorker(chatId, order, metrics) {
    const rate = (order.worker_rate || 0.40).toFixed(2);
    const duration = order.duration_seconds || 300;

    await this.client.sendMessage(
      chatId,
      `🚨 <b>NEW UPI SCAN ORDER AVAILABLE!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🏷️ <b>Ref:</b> <code>${order.merchant_reference || order.id}</code>\n` +
      `💰 <b>Worker Reward:</b> <b>+$${rate}</b>\n` +
      `⏱️ <b>Timer Duration:</b> ${duration} seconds\n` +
      `🎯 <b>Matched via:</b> ${metrics?.isPriorityEligible ? `⭐ Priority Success Rate (${metrics.successRate}%)` : 'Active Radar'}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⚡ <i>Be the fastest to claim this order!</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `⚡ CLAIM ORDER (+$${rate})`, callback_data: `claim_order:${order.id}` },
              { text: '❌ Pass', callback_data: `pass_order:${order.id}` }
            ]
          ]
        }
      }
    );
  }

  /**
   * Handle Inline Keyboard Callbacks
   */
  async handleCallbackQuery(cb) {
    const callbackId = cb.id;
    const chatId = cb.message?.chat?.id;
    const data = cb.data || '';
    const linkedUser = db.getUsers().find(u => u.telegram_chat_id === chatId);

    if (!linkedUser) {
      await this.client.answerCallbackQuery(callbackId, 'Please enter your Joining Key first.', true);
      return;
    }

    // 1. Claim Order
    if (data.startsWith('claim_order:') || data.startsWith('claim_order_')) {
      const orderId = data.startsWith('claim_order:') ? data.replace('claim_order:', '') : data.replace('claim_order_', '');
      await this.processOrderClaim(chatId, linkedUser, orderId, callbackId);
      return;
    }

    // 2. Pass Order
    if (data.startsWith('pass_order:') || data.startsWith('pass_order_')) {
      await this.client.answerCallbackQuery(callbackId, 'Order passed.');
      await this.client.sendMessage(chatId, `Order passed. Keeping radar active for next incoming task.`);
      return;
    }

    // 3. Complete Task (Worker marks completed or expired)
    if (data.startsWith('complete_task:') || data.startsWith('complete_order_') || data.startsWith('complete_task_')) {
      let orderId, result;
      if (data.startsWith('complete_task:')) {
        [, orderId, result] = data.split(':');
      } else if (data.startsWith('complete_order_')) {
        orderId = data.replace('complete_order_', '');
        result = 'success';
      } else {
        const parts = data.split('_');
        orderId = parts[2];
        result = parts[3] || 'success';
      }
      await this.processTaskCompletion(chatId, linkedUser, orderId, result || 'success', callbackId);
      return;
    }

    // 4. Open Appeal Mistake Modal / Prompt
    if (data.startsWith('appeal_prompt:')) {
      const orderId = data.replace('appeal_prompt:', '');
      await this.promptAppealMistake(chatId, linkedUser, orderId, callbackId);
      return;
    }

    // 5. Select Mistake Category for Appeal
    if (data.startsWith('appeal_reason:')) {
      const [, orderId, mistakeType] = data.split(':');
      await this.promptAppealUtr(chatId, linkedUser, orderId, mistakeType, callbackId);
      return;
    }

    // 6. Start / Restart Radar
    if (data.startsWith('start_radar:')) {
      await this.client.answerCallbackQuery(callbackId, 'Starting 5-minute radar...');
      await this.startWorkerRadar(chatId, linkedUser);
      return;
    }

    // 7. Stop Radar
    if (data.startsWith('stop_radar:')) {
      priorityQueue.stopScanningSession(linkedUser.id, true);
      await this.client.answerCallbackQuery(callbackId, 'Radar stopped.');
      await this.client.sendMessage(chatId, `🔴 Scanning radar stopped. You are now offline.`);
      return;
    }

    // 8. View Stats
    if (data.startsWith('view_stats:')) {
      await this.client.answerCallbackQuery(callbackId);
      await this.sendStats(chatId, linkedUser);
      return;
    }

    // 9. Batch Request Up to 3 Orders (User Requirement: "claim upto 3 orders at a time click on request 3 orders")
    if (data.startsWith('request_batch:') || data === 'request_3_orders') {
      const parts = data.split(':');
      const count = parts[2] ? parseInt(parts[2], 10) : 3;
      await this.handleBatchClaim(chatId, linkedUser, count, callbackId);
      return;
    }

    await this.client.answerCallbackQuery(callbackId);
  }

  /**
   * Handle batch order claim (up to 3 orders)
   */
  async handleBatchClaim(chatId, user, count = 3, callbackId = null) {
    if (callbackId) {
      await this.client.answerCallbackQuery(callbackId, 'Requesting orders batch...');
    }

    const existingActive = db.getOrders().filter(o => 
      o.claimed_by === user.id && 
      (o.status === 'claimed' || o.status === 'awaiting_confirmation')
    );

    const slotsAvailable = Math.max(0, 3 - existingActive.length);
    if (slotsAvailable === 0) {
      await this.client.sendMessage(
        chatId,
        `⚠️ <b>Limit Reached:</b> You already have <b>3 active tasks</b> in progress!\nPlease finish or report your current tasks before claiming more.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const claimCount = Math.min(slotsAvailable, count);
    const nowTime = Date.now();
    const availablePending = db.getOrders()
      .filter(o => o.status === 'pending' && (!o.expires_at || new Date(o.expires_at).getTime() > nowTime))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (availablePending.length === 0) {
      await this.client.sendMessage(
        chatId,
        `⏳ <b>0 Pending Orders Found:</b> There are no unclaimed tasks in the pool right now.\nWe have activated your 5-minute radar so incoming orders will pop up instantly!`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🟢 Keep Radar Active', callback_data: `start_radar:${user.id}` }]
            ]
          }
        }
      );
      priorityQueue.startScanningSession(user.id, chatId, 300);
      return;
    }

    const ordersToClaim = availablePending.slice(0, claimCount);
    const now = new Date().toISOString();

    for (const ord of ordersToClaim) {
      const updated = db.updateOrder(ord.id, {
        status: 'claimed',
        claimed_by: user.id,
        claimed_by_name: user.name,
        claimed_by_level: user.level,
        claimed_by_parent_id: user.parent_id,
        claimed_at: now
      });

      await this.sendClaimedOrderConfirmation(chatId, updated);
    }

    await this.client.sendMessage(
      chatId,
      `🎉 <b>Batch Claim Succeeded!</b> Claimed <b>${ordersToClaim.length}</b> new order(s). (Active tasks: <b>${existingActive.length + ordersToClaim.length} / 3</b>)\nScan the QR photo(s) above and mark completed!`,
      { parse_mode: 'HTML' }
    );
  }

  /**
   * Process order claim from Telegram
   */
  async processOrderClaim(chatId, worker, orderId, callbackId) {
    const order = db.getOrder(orderId);
    if (!order) {
      await this.client.answerCallbackQuery(callbackId, 'Order no longer exists.', true);
      return;
    }

    if (order.status !== 'pending') {
      await this.client.answerCallbackQuery(callbackId, 'Too late! Another worker claimed this order.', true);
      return;
    }

    // Lock order to worker
    const now = new Date().toISOString();
    const updatedOrder = db.updateOrder(orderId, {
      status: 'claimed',
      claimed_by: worker.id,
      claimed_by_name: worker.name,
      claimed_by_level: worker.level || 1,
      claimed_at: now
    });

    await this.client.answerCallbackQuery(callbackId, 'Order claimed successfully!');

    // Generate QR Code URL
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(order.upi_link)}`;
    const reward = (order.worker_rate || 0.40).toFixed(2);

    // Send QR Code Image with interactive action buttons
    await this.client.sendPhoto(
      chatId,
      qrUrl,
      `🎯 <b>ORDER CLAIMED SUCCESSFULLY!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🏷️ <b>Ref:</b> <code>${order.merchant_reference || order.id}</code>\n` +
      `💰 <b>Payout Reward:</b> <b>+$${reward}</b>\n` +
      `⏱️ <b>Time Limit:</b> ${order.duration_seconds || 300} seconds\n\n` +
      `🔗 <b>UPI Link:</b>\n<code>${order.upi_link}</code>\n\n` +
      `📲 <i>Scan via Google Pay, PhonePe, Paytm, or BHIM.</i>\n` +
      `When finished, mark completed below:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Completed (Paid)', callback_data: `complete_task:${order.id}:success` },
              { text: '❌ Expired / Failed', callback_data: `complete_task:${order.id}:failed` }
            ],
            [
              { text: '⚠️ Mistake? Appeal to Agent', callback_data: `appeal_prompt:${order.id}` }
            ]
          ]
        }
      }
    );
  }

  /**
   * Process worker marking task completed or expired
   */
  async processTaskCompletion(chatId, worker, orderId, result, callbackId) {
    const order = db.getOrder(orderId);
    if (!order) {
      await this.client.answerCallbackQuery(callbackId, 'Order not found.', true);
      return;
    }

    const now = new Date().toISOString();
    if (result === 'success') {
      db.updateOrder(orderId, {
        status: 'awaiting_confirmation',
        worker_status: 'success',
        worker_completed_at: now
      });

      await this.client.answerCallbackQuery(callbackId, 'Submitted as Completed!');
      await this.client.sendMessage(
        chatId,
        `✅ <b>Task Submitted!</b> Awaiting confirmation from Agent / Merchant.\n` +
        `Once confirmed, <b>+$${(order.worker_rate || 0.40).toFixed(2)}</b> will be credited to your balance.\n\n` +
        `Tap <b>🔍 Scan for Orders</b> to continue scanning.`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔍 Scan for Next Order (5 Min)', callback_data: `start_radar:${worker.id}` }]
            ]
          }
        }
      );
    } else {
      // Marked failed
      const strikes = (worker.consecutive_failures || 0) + 1;
      db.updateUser(worker.id, { consecutive_failures: strikes });
      db.updateOrder(orderId, {
        status: 'trial_not_activated',
        worker_status: 'failed',
        worker_completed_at: now
      });

      await this.client.answerCallbackQuery(callbackId, 'Marked as Expired/Failed.');
      await this.client.sendMessage(
        chatId,
        `❌ <b>Task Marked as Expired / Failed.</b>\n` +
        `Failure strikes: <b>${strikes} / 6</b> (2=2m, 4=30m, 6=Ban).\n\n` +
        `⚠️ <i>Did you make a mistake? If payment actually went through, tap Appeal below to submit your bank UTR:</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⚠️ Appeal Mistake with UTR', callback_data: `appeal_prompt:${order.id}` }],
              [{ text: '🔍 Scan Next Order (5 Min)', callback_data: `start_radar:${worker.id}` }]
            ]
          }
        }
      );
    }
  }

  /**
   * Prompt worker to select mistake category for appeal
   */
  async promptAppealMistake(chatId, worker, orderId, callbackId) {
    await this.client.answerCallbackQuery(callbackId);

    const order = db.getOrder(orderId);
    if (!order) {
      await this.client.sendMessage(chatId, 'Order not found.');
      return;
    }

    if ((order.appeal_count || 0) >= 3) {
      await this.client.sendMessage(chatId, '❌ Maximum 3 normal appeals reached for this task.');
      return;
    }

    await this.client.sendMessage(
      chatId,
      `🛡️ <b>Submit Task Appeal & Mistake Report</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🏷️ Order: <code>${order.merchant_reference || order.id}</code>\n` +
      `Remaining Appeals: <b>${3 - (order.appeal_count || 0)} / 3</b>\n\n` +
      `<b>Select the mistake that occurred:</b>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '1️⃣ Paid but clicked Expired by mistake', callback_data: `appeal_reason:${order.id}:paid_marked_failed` }],
            [{ text: '2️⃣ UPI succeeded (I have bank UTR proof)', callback_data: `appeal_reason:${order.id}:utr_proof` }],
            [{ text: '3️⃣ Network glitch / App freeze timed out', callback_data: `appeal_reason:${order.id}:network_glitch` }],
            [{ text: '4️⃣ Disputing rejection decision', callback_data: `appeal_reason:${order.id}:status_discrepancy` }]
          ]
        }
      }
    );
  }

  /**
   * Prompt worker to enter UTR proof for the appeal
   */
  async promptAppealUtr(chatId, worker, orderId, mistakeType, callbackId) {
    await this.client.answerCallbackQuery(callbackId);

    this.userStates.set(chatId, {
      action: 'awaiting_appeal_utr',
      data: { orderId, mistakeType, workerId: worker.id }
    });

    await this.client.sendMessage(
      chatId,
      `📝 <b>Step 2: Enter Bank UTR / Reference Number</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Please reply with your <b>12-digit UTR number</b> from PhonePe/GooglePay/Paytm (or type your explanation note).\n\n` +
      `<i>Example:</i> <code>429182736450 - Paid INR 500 successfully</code>`,
      { parse_mode: 'HTML' }
    );
  }

  /**
   * Process incoming text as UTR and submit appeal
   */
  async processAppealUtrInput(chatId, utrText, data) {
    const { orderId, mistakeType, workerId } = data;
    const order = db.getOrder(orderId);
    const worker = db.getUser(workerId);

    if (!order || !worker) return;

    const currentAppeals = order.appeal_count || 0;
    const newAppealCount = currentAppeals + 1;
    const newAppealOrderId = `ord_appeal_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    // Extract potential 12 digit UTR
    const utrMatch = utrText.match(/\b\d{12}\b/);
    const utr = utrMatch ? utrMatch[0] : null;

    // Update order
    db.updateOrder(orderId, {
      appeal_count: newAppealCount,
      appeals_remaining: 3 - newAppealCount,
      last_appeal_order_id: newAppealOrderId,
      last_appeal_at: now,
      status: 'manual_review'
    });

    // Create appeal ticket
    const appealRecord = {
      id: newAppealOrderId,
      original_order_id: order.id,
      merchant_reference: `${order.merchant_reference || order.id} (Appeal #${newAppealCount})`,
      worker_id: worker.id,
      worker_name: worker.name,
      publisher_id: order.publisher_id,
      publisher_name: order.publisher_name,
      upi_link: order.upi_link,
      rate: order.rate,
      appeal_number: newAppealCount,
      appeals_remaining: 3 - newAppealCount,
      mistake_type: mistakeType,
      utr: utr || utrText.substring(0, 30),
      worker_message: utrText,
      status: 'pending',
      created_at: now,
      resolved_at: null,
      resolution: null
    };

    db.addAppeal(appealRecord);

    await this.client.sendMessage(
      chatId,
      `✅ <b>Appeal #${newAppealCount} Submitted to Agent!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🎫 <b>Appeal Order ID:</b> <code>${newAppealOrderId}</code>\n` +
      `🔢 <b>UTR Proof:</b> ${appealRecord.utr || 'Attached in message'}\n` +
      `💬 <b>Notes:</b> "${utrText}"\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🤖 <i>Your Agent will review your proof and send approval/rejection feedback directly to you via FastScan Message Bot here.</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 Scan Next Order (5 Min)', callback_data: `start_radar:${worker.id}` }]
          ]
        }
      }
    );
  }

  /**
   * Forward FastScan Message Bot feedback from Agent to Worker's Telegram
   */
  async forwardBotMessage(botMessage) {
    if (!botMessage || !botMessage.recipient_id) return;
    const worker = db.getUser(botMessage.recipient_id);
    if (!worker || !worker.telegram_chat_id) return;

    const isApproved = botMessage.status === 'approved';
    const symbol = isApproved ? '✅' : '❌';

    await this.client.sendMessage(
      worker.telegram_chat_id,
      `🤖 <b>FastScan Message Bot: Agent Review Feedback</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${symbol} <b>Status:</b> <b>${isApproved ? 'APPEAL APPROVED' : 'APPEAL REJECTED'}</b>\n` +
      `👤 <b>Reviewing Agent:</b> ${botMessage.agent_name || 'Agent'}\n` +
      `🏷️ <b>Order:</b> <code>${botMessage.merchant_reference || botMessage.order_id}</code>\n\n` +
      `💬 <b>Agent Notes & Feedback:</b>\n` +
      `<i>"${botMessage.content}"</i>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      (isApproved ? `💰 <i>Earnings have been credited to your wallet balance!</i>` : `⚠️ <i>Review notes above from your agent.</i>`),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 Start 5-Min Radar Scan', callback_data: `start_radar:${worker.id}` }],
            [{ text: '💰 View Wallet Balance', callback_data: `view_stats:${worker.id}` }]
          ]
        }
      }
    );
  }

  /**
   * Broadcast newly published order to highest priority active scanning workers
   */
  async onNewOrderAvailable(newOrder) {
    const ranking = priorityQueue.rankWorkersForOrder(newOrder);

    // If active workers are scanning, notify the top priority candidates
    if (ranking.all.length > 0) {
      // Notify top candidate or top priority tier
      const candidatesToAlert = ranking.tier1Priority.length > 0
        ? ranking.tier1Priority.slice(0, 3) // Top 3 priority workers
        : ranking.tier2Beginner.slice(0, 3); // Fallback to beginner tier

      for (const candidate of candidatesToAlert) {
        if (candidate.chatId) {
          await this.notifyOrderToWorker(candidate.chatId, newOrder, candidate);
        }
      }
    }
  }

  /**
   * Send worker dashboard
   */
  async sendDashboard(chatId, user) {
    const metrics = priorityQueue.calculateWorkerMetrics(user.id);
    const isRadarActive = priorityQueue.isSessionActive(user.id);
    const remainingSecs = priorityQueue.getRemainingSeconds(user.id);

    await this.client.sendMessage(
      chatId,
      `⚡ <b>FASTSCAN UPI PLATFORM</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>User:</b> ${user.name} (${user.role === 'worker' ? 'L2 Worker' : 'L1 Boss'})\n` +
      `💰 <b>Wallet Balance:</b> <b>$${(user.balance || 0).toFixed(2)}</b>\n` +
      `📡 <b>Radar Status:</b> ${isRadarActive ? `🟢 Active (${Math.floor(remainingSecs / 60)}m ${remainingSecs % 60}s left)` : '⚪ Idle / Offline'}\n\n` +
      `🎯 <b>Priority Queue Rating:</b>\n` +
      `• Total Scans: <b>${metrics.totalScans}</b>\n` +
      `• Success Rate: <b>${metrics.successRate}%</b>\n` +
      `• Status: <b>${metrics.isPriorityEligible ? '⭐ Tier 1 Priority' : `🟡 Beginner (${metrics.totalScans}/5 to unlock)`}</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Tap <b>🔍 Scan for Orders</b> to start your 5-minute search window.`,
      {
        parse_mode: 'HTML',
        reply_markup: this.getMainKeyboard(user)
      }
    );
  }

  /**
   * Send balance and stats
   */
  async sendStats(chatId, user) {
    const metrics = priorityQueue.calculateWorkerMetrics(user.id);
    await this.client.sendMessage(
      chatId,
      `📊 <b>YOUR STATS & PERFORMANCE</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💰 <b>Current Balance:</b> $${(user.balance || 0).toFixed(2)}\n` +
      `✅ <b>Successful Scans:</b> ${metrics.successfulCount}\n` +
      `❌ <b>Failed / Expired:</b> ${metrics.failedCount}\n` +
      `📈 <b>Success Rate:</b> <b>${metrics.successRate}%</b>\n` +
      `🎖️ <b>Queue Status:</b> ${metrics.isPriorityEligible ? '⭐ Priority Queue (Top Ranking)' : `Beginner Queue (${metrics.totalScans}/5 Scans)`}\n` +
      `⚡ <b>Strike Meter:</b> ${metrics.consecutiveFailures} / 6 strikes\n` +
      `━━━━━━━━━━━━━━━━━━`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 Start 5-Min Radar Scan', callback_data: `start_radar:${user.id}` }]
          ]
        }
      }
    );
  }

  /**
   * Send active tasks
   */
  async sendActiveTasks(chatId, user) {
    const activeTasks = db.getOrders().filter(o =>
      o.claimed_by === user.id &&
      (o.status === 'claimed' || o.status === 'awaiting_confirmation')
    );

    if (activeTasks.length === 0) {
      await this.client.sendMessage(
        chatId,
        `📋 <b>No Active Tasks</b>\nTap <b>🔍 Scan for Orders</b> to claim a new UPI task.`,
        {
          parse_mode: 'HTML',
          reply_markup: this.getMainKeyboard(user)
        }
      );
      return;
    }

    for (const task of activeTasks) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(task.upi_link)}`;
      await this.client.sendPhoto(
        chatId,
        qrUrl,
        `📋 <b>ACTIVE TASK:</b> <code>${task.merchant_reference || task.id}</code>\n` +
        `💰 Reward: $${(task.worker_rate || 0.40).toFixed(2)}\n` +
        `Status: <b>${task.status.toUpperCase()}</b>\n\n` +
        `🔗 <code>${task.upi_link}</code>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Completed', callback_data: `complete_task:${task.id}:success` },
                { text: '❌ Expired', callback_data: `complete_task:${task.id}:failed` }
              ],
              [{ text: '⚠️ Appeal Mistake', callback_data: `appeal_prompt:${task.id}` }]
            ]
          }
        }
      );
    }
  }

  /**
   * Persistent Reply Keyboard for Telegram mobile client
   */
  getMainKeyboard(user) {
    return {
      keyboard: [
        [{ text: '🔍 Scan for Orders (5 Min)' }, { text: '📥 Request 3 Orders' }],
        [{ text: '📋 Active Tasks' }, { text: '💰 Balance & Stats' }],
        [{ text: '🛑 Stop Scanning' }]
      ],
      resize_keyboard: true
    };
  }
}

export const telegramBotService = new TelegramBotService();
