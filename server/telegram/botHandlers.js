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

import fs from 'fs';
import path from 'path';
import { db, generateMerchantReference } from '../db.js';
import { priorityQueue } from './priorityQueue.js';
import { TelegramClient } from './telegramClient.js';
import { getIO } from '../sockets/socketHandler.js';

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
   * Handle text messages, photo uploads, and commands
   */
  async handleMessage(msg) {
    const chatId = msg.chat?.id;
    if (!chatId) return;

    // 1. Check for Photo or Image Document upload (Agent Publishing in Telegram)
    const photos = msg.photo;
    const document = msg.document;
    const isImageDoc = document && document.mime_type && document.mime_type.startsWith('image/');
    const hasPhoto = (photos && photos.length > 0) || Boolean(isImageDoc);

    // Find if user is already linked to this telegram chat
    let linkedUser = db.getUsers().find(u => u.telegram_chat_id === chatId);

    if (hasPhoto) {
      // User sent a photo -> Handle as Agent QR Task Upload!
      await this.handlePhotoUpload(chatId, msg, linkedUser);
      return;
    }

    const text = (msg.text || '').trim();
    if (!text) return;

    // Check user state (e.g. typing UTR for appeal or entering key)
    const state = this.userStates.get(chatId);
    if (state && state.action === 'awaiting_appeal_utr') {
      await this.processAppealUtrInput(chatId, text, state.data);
      this.userStates.delete(chatId);
      return;
    }

    // Switch or Link as Agent Mode
    if (text === '/agent' || text === '/publisher' || text.toLowerCase() === 'agent mode') {
      await this.linkOrCreateAgent(chatId, msg.from);
      return;
    }

    // Switch or Link as Worker Mode
    if (text === '/worker' || text.toLowerCase() === 'worker mode') {
      if (linkedUser && linkedUser.role === 'agent') {
        db.updateUser(linkedUser.id, { role: 'worker' });
        linkedUser = db.getUser(linkedUser.id);
      }
      await this.sendDashboard(chatId, linkedUser);
      return;
    }

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
          `You can use this bot as an <b>Agent (Publisher)</b> or a <b>Worker (Scanner)</b>.\n\n` +
          `• <b>Publishers / Agents:</b> Send <code>/agent</code> or reply with your Agent Key (<code>L1-BOSS-DEMO-991</code>) to start uploading UPI QR codes directly here!\n` +
          `• <b>Workers / Scanners:</b> Reply with your Worker Joining Key (e.g. <code>L2-WORKER-DEMO-442</code>) to scan & earn.\n\n` +
          `👇 <i>Choose your portal below to begin immediately:</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🏢 Enter Agent Portal (Upload QR)', callback_data: 'activate_agent' }],
                [{ text: '👥 Enter Worker Portal (Scan & Earn)', callback_data: 'activate_worker' }]
              ]
            }
          }
        );
      }
      return;
    }

    // If message looks like a Joining Key
    if (text.startsWith('KEY-') || text.startsWith('L1-') || text.startsWith('L2-') || text.startsWith('SUB-')) {
      await this.linkUserByKey(chatId, text);
      return;
    }

    // ==========================================
    // AGENT / PUBLISHER COMMANDS
    // ==========================================
    if (linkedUser && (linkedUser.role === 'agent' || linkedUser.role === 'boss')) {
      if (text === '/upload' || text.includes('Upload QR Task')) {
        await this.client.sendMessage(
          chatId,
          `📸 <b>UPLOAD UPI QR TASK</b>\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `Please send or forward your <b>UPI QR Code Photo</b> directly into this chat.\n\n` +
          `💡 <i>Optional Caption Format:</i>\n` +
          `<code>150 paytm@okaxis 5m</code>\n` +
          `<i>(Amount, UPI link/ID, and Expiry minutes)</i>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (text === '/online' || text.includes('Online Workers')) {
        await this.sendOnlineWorkerStats(chatId);
        return;
      }

      if (text === '/balance' || text === '/topup' || text.includes('Balance') || text.includes('Top-up')) {
        await this.sendAgentBalanceAndTopup(chatId, linkedUser);
        return;
      }

      if (text === '/tasks' || text === '/agenttasks' || text.includes('My Tasks Status')) {
        await this.sendAgentTasks(chatId, linkedUser);
        return;
      }

      if (text.includes('Refresh')) {
        await this.sendAgentDashboard(chatId, linkedUser);
        return;
      }
    }

    // ==========================================
    // WORKER COMMANDS (Requires linked worker)
    // ==========================================
    if (linkedUser && linkedUser.role === 'worker') {
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

    // Fallback if not recognized
    if (linkedUser) {
      await this.sendDashboard(chatId, linkedUser);
    } else {
      await this.client.sendMessage(
        chatId,
        `⚠️ <i>Account not linked yet.</i>\nSend <code>/agent</code> to publish tasks, or enter your Worker Key (e.g. <code>L2-WORKER-DEMO-442</code>).`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏢 Activate Agent Account', callback_data: 'activate_agent' }],
              [{ text: '👥 Activate Worker Account', callback_data: 'activate_worker' }]
            ]
          }
        }
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
    let linkedUser = db.getUsers().find(u => u.telegram_chat_id === chatId);

    // 0. Activation / Switch Portal (Works even if not linked yet)
    if (data === 'activate_agent') {
      linkedUser = await this.linkOrCreateAgent(chatId, cb.from);
      await this.client.answerCallbackQuery(callbackId, 'Welcome to Agent Portal!');
      return;
    }

    if (data === 'activate_worker') {
      linkedUser = await this.linkOrCreateWorker(chatId, cb.from);
      await this.client.answerCallbackQuery(callbackId, 'Welcome to Worker Portal!');
      return;
    }

    if (!linkedUser) {
      await this.client.answerCallbackQuery(callbackId, 'Please link your account first.', true);
      return;
    }

    // Agent Upload Prompt
    if (data === 'agent_upload_prompt') {
      await this.client.answerCallbackQuery(callbackId);
      await this.client.sendMessage(
        chatId,
        `📸 <b>SEND QR CODE PHOTO</b>\n\nPlease send or forward your UPI QR code image right here.\nOptional caption: <code>150 paytm@okaxis 5m</code>`
      );
      return;
    }

    // Agent Top-up $5 ($0.70/scan)
    if (data.startsWith('agent_topup:')) {
      const parts = data.split(':');
      const amount = parseFloat(parts[2] || parts[1]) || 5;
      const targetUser = linkedUser || db.getUser(parts[1]);
      if (targetUser) {
        const newBal = +((targetUser.balance || 0) + amount).toFixed(2);
        db.updateUser(targetUser.id, {
          balance: newBal,
          scan_rate: 0.70,
          active_tier: 'starter_5'
        });
        await this.client.answerCallbackQuery(callbackId, `Added $${amount}! Rate: $0.70/scan`);
        await this.client.sendMessage(
          chatId,
          `🎉 <b>Top-up Successful!</b>\n` +
          `💰 Added: <b>+$${amount}.00</b>\n` +
          `💳 New Balance: <b>$${newBal.toFixed(2)}</b>\n` +
          `⚡ Active Scan Rate: <b>$0.70/scan</b>\n\n` +
          `📸 You can now send any QR Code photo to publish immediately!`,
          { parse_mode: 'HTML', reply_markup: this.getMainKeyboard(targetUser) }
        );
      }
      return;
    }

    // Agent $10 Loan ($0.67/scan)
    if (data.startsWith('agent_loan:')) {
      const parts = data.split(':');
      const amount = parseFloat(parts[2] || parts[1]) || 10;
      const targetUser = linkedUser || db.getUser(parts[1]);
      if (targetUser) {
        const newBal = +((targetUser.balance || 0) + amount).toFixed(2);
        db.updateUser(targetUser.id, {
          balance: newBal,
          scan_rate: 0.67,
          active_tier: 'instant_loan_10'
        });
        await this.client.answerCallbackQuery(callbackId, `Activated $10 Loan! Rate: $0.67/scan`);
        await this.client.sendMessage(
          chatId,
          `🚀 <b>Instant $10 Credit Loan Activated!</b>\n` +
          `💰 Balance: <b>$${newBal.toFixed(2)}</b>\n` +
          `⚡ Discounted Rate: <b>$0.67/scan</b> (Tier Loan)\n\n` +
          `📸 Send any QR Code photo now to broadcast to online workers!`,
          { parse_mode: 'HTML', reply_markup: this.getMainKeyboard(targetUser) }
        );
      }
      return;
    }

    // Agent Verify Task
    if (data.startsWith('agent_verify:')) {
      const [, orderId, result] = data.split(':');
      await this.processAgentVerification(chatId, linkedUser, orderId, result, callbackId);
      return;
    }

    // Agent Undo Verification
    if (data.startsWith('agent_undo:')) {
      const orderId = data.replace('agent_undo:', '');
      await this.processAgentUndo(chatId, linkedUser, orderId, callbackId);
      return;
    }

    // Agent Order Status
    if (data.startsWith('agent_order_status:')) {
      const orderId = data.replace('agent_order_status:', '');
      const ord = db.getOrder(orderId);
      if (ord) {
        const statusText = ord.status === 'pending' ? '🟡 Waiting for Pickup'
          : ord.status === 'claimed' ? `🔵 In Progress (Claimed by ${ord.claimed_by_name || 'Worker'})`
          : ord.status === 'awaiting_confirmation' ? '🟣 Completed by worker (Waiting your approval)'
          : ord.status === 'success' ? '🟢 Verified & Paid'
          : ord.status;
        await this.client.answerCallbackQuery(callbackId, `Status: ${statusText}`, true);
      } else {
        await this.client.answerCallbackQuery(callbackId, 'Order not found.', true);
      }
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
   * Link or switch chat to Agent Portal
   */
  async linkOrCreateAgent(chatId, fromUser) {
    let agent = db.getUsers().find(u => u.telegram_chat_id === chatId);
    if (!agent) {
      // Find default agent or create new agent
      const defaultAgent = db.getUsers().find(u => u.id === 'agent_prime');
      if (defaultAgent && !defaultAgent.telegram_chat_id) {
        agent = defaultAgent;
        db.updateUser(agent.id, { telegram_chat_id: chatId });
      } else {
        const agentName = fromUser?.first_name ? `${fromUser.first_name} (Agent)` : 'Alpha Agent';
        agent = {
          id: `agent_tg_${chatId}`,
          role: 'agent',
          name: agentName,
          balance: 10.00,
          scan_rate: 0.67,
          active_tier: 'instant_loan_10',
          telegram_chat_id: chatId,
          created_at: new Date().toISOString()
        };
        db.addUser(agent);
      }
    } else if (agent.role !== 'agent' && agent.role !== 'boss') {
      db.updateUser(agent.id, {
        role: 'agent',
        balance: agent.balance && agent.balance >= 5 ? agent.balance : 10.00,
        scan_rate: 0.67,
        active_tier: 'instant_loan_10'
      });
      agent = db.getUser(agent.id);
    }

    await this.sendAgentDashboard(chatId, agent);
    return agent;
  }

  /**
   * Link or switch chat to Worker Portal
   */
  async linkOrCreateWorker(chatId, fromUser) {
    let worker = db.getUsers().find(u => u.telegram_chat_id === chatId);
    if (!worker) {
      const defaultWorker = db.getUsers().find(u => u.id === 'worker_alex');
      if (defaultWorker && !defaultWorker.telegram_chat_id) {
        worker = defaultWorker;
        db.updateUser(worker.id, { telegram_chat_id: chatId });
      } else {
        const workerName = fromUser?.first_name ? `${fromUser.first_name} (Worker)` : 'Alex Worker';
        worker = {
          id: `worker_tg_${chatId}`,
          role: 'worker',
          name: workerName,
          level: 1,
          parent_id: null,
          balance: 0.00,
          consecutive_failures: 0,
          timeout_until: null,
          is_banned: false,
          total_personal_completed: 0,
          total_team_completed: 0,
          is_online: false,
          telegram_chat_id: chatId,
          created_at: new Date().toISOString()
        };
        db.addUser(worker);
      }
    } else if (worker.role !== 'worker') {
      db.updateUser(worker.id, { role: 'worker' });
      worker = db.getUser(worker.id);
    }

    await this.sendDashboard(chatId, worker);
    return worker;
  }

  /**
   * Handle Photo Upload from Agent (Publishing QR task in Telegram)
   * User Requirement: "and i want agent to upload in telegram only"
   */
  async handlePhotoUpload(chatId, msg, user) {
    const photos = msg.photo;
    const document = msg.document;
    const largestPhoto = photos && photos.length > 0 ? photos[photos.length - 1] : document;
    const caption = (msg.caption || '').trim();

    // If unlinked, auto-link as Agent
    let agent = user;
    if (!agent || (agent.role !== 'agent' && agent.role !== 'boss')) {
      agent = await this.linkOrCreateAgent(chatId, msg.from);
    }

    const agentBalance = +(agent.balance || 0).toFixed(2);
    const scanRate = agent.scan_rate !== undefined ? agent.scan_rate : (agentBalance >= 10 ? 0.67 : 0.70);

    if (agentBalance < scanRate) {
      await this.client.sendMessage(
        chatId,
        `⚠️ <b>Insufficient Prepaid Balance!</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💰 Current Balance: <b>$${agentBalance.toFixed(2)}</b>\n` +
        `⚡ Required Scan Rate: <b>$${scanRate.toFixed(2)}/scan</b>\n\n` +
        `Please top up balance or take an instant loan below to publish:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🟢 Add $5 ($0.70/scan)', callback_data: `agent_topup:${agent.id}:5` }],
              [{ text: '🚀 Take $10 Instant Loan ($0.67/scan)', callback_data: `agent_loan:${agent.id}:10` }]
            ]
          }
        }
      );
      return;
    }

    // Try downloading the photo
    let savedLocalPath = null;
    if (largestPhoto && largestPhoto.file_id) {
      try {
        const fileInfo = await this.client.getFile(largestPhoto.file_id);
        if (fileInfo && fileInfo.file_path) {
          const buffer = await this.client.downloadFile(fileInfo.file_path);
          if (buffer) {
            const uploadsDir = path.join(process.cwd(), 'server', 'uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            const filename = `qr_tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.jpg`;
            fs.writeFileSync(path.join(uploadsDir, filename), buffer);
            savedLocalPath = `/uploads/${filename}`;
          }
        }
      } catch (err) {
        console.error('[botHandlers] Failed to download photo:', err.message);
      }
    }

    // Parse caption for duration, UPI ID, or amount
    let duration = 300;
    const minMatch = caption.match(/(\d+)\s*(?:m|min|mins|minutes)/i);
    const secMatch = caption.match(/(\d+)\s*(?:s|sec|seconds)/i);
    if (minMatch) duration = parseInt(minMatch[1], 10) * 60;
    else if (secMatch) duration = parseInt(secMatch[1], 10);

    let upiLink = '';
    const upiMatch = caption.match(/(upi:\/\/[^\s]+)/i);
    const paMatch = caption.match(/pa=([a-zA-Z0-9.\-_@]+)/i);
    const upiIdMatch = caption.match(/\b([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)\b/);
    const amMatch = caption.match(/(?:am|amount|rs|inr|\₹)\s*[:=]?\s*([0-9.]+)/i) || caption.match(/\b([0-9]{2,6}(?:\.[0-9]{1,2})?)\b/);

    if (upiMatch) {
      upiLink = upiMatch[1];
    } else if (paMatch || upiIdMatch) {
      const pa = paMatch ? paMatch[1] : upiIdMatch[1];
      const am = amMatch ? amMatch[1] : '150.00';
      upiLink = `upi://pay?pa=${pa}&pn=${encodeURIComponent(agent.name)}&am=${am}&cu=INR`;
    } else {
      const amount = amMatch ? amMatch[1] : '150.00';
      upiLink = `upi://pay?pa=merchant_${agent.id.substring(0, 8)}@okaxis&pn=${encodeURIComponent(agent.name)}&am=${amount}&cu=INR`;
    }

    const ref = generateMerchantReference(agent.name);
    const orderId = `ord_tg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration * 1000).toISOString();

    const newOrder = {
      id: orderId,
      merchant_reference: ref,
      publisher_id: agent.id,
      publisher_name: agent.name,
      upi_link: upiLink,
      qr_image_url: savedLocalPath || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiLink)}`,
      duration_seconds: duration,
      rate: scanRate,
      worker_rate: agent.worker_rate || 0.40,
      status: 'pending',
      claimed_by: null,
      claimed_by_name: null,
      claimed_by_level: null,
      claimed_by_parent_id: null,
      worker_status: 'none',
      created_at: now.toISOString(),
      claimed_at: null,
      worker_completed_at: null,
      confirmed_at: null,
      expires_at: expiresAt
    };

    db.addOrder(newOrder);

    // Broadcast to web socket workers
    try {
      const io = getIO();
      if (io) {
        io.emit('new_order_available', newOrder);
        io.emit('orders_refresh');
      }
    } catch (e) {}

    // Alert Telegram active radar workers
    this.onNewOrderAvailable(newOrder);

    const stats = priorityQueue.getOnlineWorkerStats();
    await this.client.sendMessage(
      chatId,
      `✅ <b>QR TASK UPLOADED & LIVE!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🆔 <b>Order ID:</b> <code>${newOrder.id}</code>\n` +
      `🏷️ <b>Ref:</b> <code>${newOrder.merchant_reference}</code>\n` +
      `⏱️ <b>Timer:</b> ${Math.round(duration / 60)} Minutes (Priority Queue)\n` +
      `💰 <b>Scan Fee:</b> $${scanRate.toFixed(2)} (deducted on confirmed scan)\n` +
      `👥 <b>Fleet Radar:</b> <b>${stats.onlineWorkers} workers online</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⏳ <b>Status:</b> 🟡 <i>Waiting for worker pickup...</i>\n\n` +
      `<i>⚡ You will receive an instant alert right here the moment a worker picks up this QR!</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Track Order Status', callback_data: `agent_order_status:${newOrder.id}` }],
            [{ text: '📤 Upload Another QR', callback_data: 'agent_upload_prompt' }]
          ]
        }
      }
    );
  }

  /**
   * Send Agent Portal Dashboard
   */
  async sendAgentDashboard(chatId, agent) {
    const stats = priorityQueue.getOnlineWorkerStats();
    const balance = +(agent.balance || 0).toFixed(2);
    const scanRate = agent.scan_rate !== undefined ? agent.scan_rate : (balance >= 10 ? 0.67 : 0.70);

    const myOrders = db.getOrders().filter(o => o.publisher_id === agent.id);
    const waitingCount = myOrders.filter(o => o.status === 'pending').length;
    const inProgressCount = myOrders.filter(o => o.status === 'claimed').length;
    const completedCount = myOrders.filter(o => o.status === 'success').length;

    await this.client.sendMessage(
      chatId,
      `🏢 <b>AGENT / PUBLISHER PORTAL</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>Agent:</b> ${agent.name}\n` +
      `💰 <b>Prepaid Balance:</b> <b>$${balance.toFixed(2)}</b>\n` +
      `⚡ <b>Scan Rate:</b> <b>$${scanRate.toFixed(2)}/scan</b>\n\n` +
      `👥 <b>Worker Fleet Radar:</b>\n` +
      `• Online Right Now: <b>${stats.onlineWorkers} workers</b>\n` +
      `• Last 1hr Completed: <b>${stats.doneLast1h}</b> / ${stats.totalLast1h}\n` +
      `• Last 24hr Completed: <b>${stats.doneLast24h}</b> / ${stats.totalLast24h}\n\n` +
      `📊 <b>Your Tasks:</b>\n` +
      `• 🟡 Waiting for Pickup: <b>${waitingCount}</b>\n` +
      `• 🔵 In Progress: <b>${inProgressCount}</b>\n` +
      `• 🟢 Completed: <b>${completedCount}</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📸 <b>TO PUBLISH A TASK:</b>\n` +
      `<b>Send any QR Code image directly into this chat!</b>\n` +
      `<i>(Optional: Add caption like "150 myupi@okaxis 5m")</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: this.getMainKeyboard(agent)
      }
    );
  }

  /**
   * Send Online Worker Fleet statistics to Agent
   * User Requirement: "show the agent how many workers are online okay so they can decide if they want to send or not and send last 1hr and 24hrs total count out of total done"
   */
  async sendOnlineWorkerStats(chatId) {
    const stats = priorityQueue.getOnlineWorkerStats();
    await this.client.sendMessage(
      chatId,
      `👥 <b>WORKER FLEET RADAR & ANALYTICS</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🟢 <b>Online Workers Right Now:</b> <b>${stats.onlineWorkers} active</b>\n` +
      `📡 <b>Active 5-Min Radars:</b> ${stats.radarOnlineCount} scanning\n\n` +
      `📊 <b>Scan Activity History:</b>\n` +
      `• Last 1 Hour: <b>${stats.doneLast1h} completed</b> (out of ${stats.totalLast1h} submitted)\n` +
      `• Last 24 Hours: <b>${stats.doneLast24h} completed</b> (out of ${stats.totalLast24h} submitted)\n` +
      `• All-Time Done: <b>${stats.totalDoneAllTime} scans</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `✅ <i>Workers are online! You can safely send QR tasks now.</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 Upload QR Task Now', callback_data: 'agent_upload_prompt' }]
          ]
        }
      }
    );
  }

  /**
   * Send Agent Balance and Top-up packages
   * User Requirement: "agents they will pay on each scan let them add balance in the website like 5$ one time and they can scan 0.7$ per scan loan 10$ and scan at 0.67$ like that"
   */
  async sendAgentBalanceAndTopup(chatId, agent) {
    const balance = +(agent.balance || 0).toFixed(2);
    const scanRate = agent.scan_rate !== undefined ? agent.scan_rate : (balance >= 10 ? 0.67 : 0.70);

    await this.client.sendMessage(
      chatId,
      `💰 <b>AGENT PREPAID BALANCE</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💳 <b>Current Balance:</b> <b>$${balance.toFixed(2)}</b>\n` +
      `⚡ <b>Active Scan Rate:</b> <b>$${scanRate.toFixed(2)}/scan</b>\n\n` +
      `<b>Choose a package to top-up:</b>\n` +
      `• <b>$5 Starter:</b> Scan rate = <b>$0.70/scan</b>\n` +
      `• <b>$10 Instant Credit Loan:</b> Scan rate = <b>$0.67/scan</b> (Max Savings)\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `<i>Fees are only deducted when a worker scan is successfully confirmed.</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🟢 Add $5 ($0.70/scan)', callback_data: `agent_topup:${agent.id}:5` }],
            [{ text: '🚀 Take $10 Loan ($0.67/scan)', callback_data: `agent_loan:${agent.id}:10` }]
          ]
        }
      }
    );
  }

  /**
   * Send Agent published tasks list
   */
  async sendAgentTasks(chatId, agent) {
    const myOrders = db.getOrders()
      .filter(o => o.publisher_id === agent.id)
      .slice(-6)
      .reverse();

    if (myOrders.length === 0) {
      await this.client.sendMessage(
        chatId,
        `📋 <b>No Tasks Published Yet</b>\n\nSend any QR Code photo directly into this chat to publish your first task!`,
        { parse_mode: 'HTML', reply_markup: this.getMainKeyboard(agent) }
      );
      return;
    }

    let msg = `📊 <b>YOUR RECENT PUBLISHED TASKS:</b>\n━━━━━━━━━━━━━━━━━━\n`;
    for (const ord of myOrders) {
      const statusIcon = ord.status === 'pending' ? '🟡 Waiting for Pickup'
        : ord.status === 'claimed' ? `🔵 In Progress (${ord.claimed_by_name || 'Claimed'})`
        : ord.status === 'awaiting_confirmation' ? `🟣 Worker Submitted UTR (Review)`
        : ord.status === 'success' ? '🟢 Verified & Paid'
        : '⚪ ' + ord.status;

      msg += `🆔 <code>${ord.id}</code>\n`;
      msg += `🏷️ ${ord.merchant_reference || ord.id}\n`;
      msg += `⏳ Status: <b>${statusIcon}</b>\n`;
      msg += `💰 Fee: $${(ord.rate || 0.70).toFixed(2)}\n`;
      msg += `──────────────────\n`;
    }

    await this.client.sendMessage(chatId, msg, {
      parse_mode: 'HTML',
      reply_markup: this.getMainKeyboard(agent)
    });
  }

  /**
   * Process Agent manual verification from Telegram
   */
  async processAgentVerification(chatId, agent, orderId, result, callbackId) {
    const order = db.getOrder(orderId);
    if (!order) {
      await this.client.answerCallbackQuery(callbackId, 'Order not found.', true);
      return;
    }

    const now = new Date().toISOString();
    const config = db.getConfig();
    const publisher = db.getUser(order.publisher_id);
    const worker = order.claimed_by ? db.getUser(order.claimed_by) : null;
    const scanFee = order.rate || 0.70;
    const reward = order.worker_rate || config.worker_payout_per_scan || 0.40;

    if (result === 'success') {
      if (publisher) {
        const newBal = Math.max(0, +(publisher.balance || 0) - scanFee);
        db.updateUser(publisher.id, {
          balance: +newBal.toFixed(2),
          total_spent: +((publisher.total_spent || 0) + scanFee).toFixed(2),
          total_scans: (publisher.total_scans || 0) + 1
        });
      }

      if (worker) {
        db.updateUser(worker.id, {
          balance: +((worker.balance || 0) + reward).toFixed(2),
          total_personal_completed: (worker.total_personal_completed || 0) + 1,
          consecutive_failures: 0
        });

        if (worker.telegram_chat_id) {
          await this.client.sendMessage(
            worker.telegram_chat_id,
            `🎉 <b>Payment Verified by Agent!</b>\nOrder <code>${order.id}</code> confirmed.\n<b>+$${reward.toFixed(2)}</b> credited to your balance!`
          );
        }
      }

      db.updateOrder(orderId, {
        status: 'success',
        confirmed_at: now,
        manually_verified_by: agent ? agent.name : 'Agent via Telegram',
        is_manually_verified: true
      });

      try {
        const io = getIO();
        if (io) {
          io.emit('order_confirmed', { orderId, status: 'success' });
          io.emit('orders_refresh');
        }
      } catch (e) {}

      await this.client.answerCallbackQuery(callbackId, 'Verified as SUCCESS!');
      await this.client.sendMessage(
        chatId,
        `✅ <b>Order ${order.id} Confirmed as SUCCESS!</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💰 Scan fee of <b>$${scanFee.toFixed(2)}</b> deducted.\n` +
        `💳 Remaining Balance: <b>$${(publisher?.balance || 0).toFixed(2)}</b>\n` +
        `👤 Worker: <b>${worker?.name || 'Worker'}</b> credited +$${reward.toFixed(2)}.\n\n` +
        `<i>Made a mistake? Tap Undo below to revert:</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '↩️ Undo Verify', callback_data: `agent_undo:${order.id}` }]
            ]
          }
        }
      );
    } else {
      // Reject / Unsuccess
      const unsuccessFee = 0.05;
      if (publisher) {
        const newBal = Math.max(0, +((publisher.balance || 0) - unsuccessFee).toFixed(2));
        db.updateUser(publisher.id, {
          balance: newBal,
          total_spent: +((publisher.total_spent || 0) + unsuccessFee).toFixed(2)
        });
      }

      if (worker) {
        const workerNewBal = Math.max(0, +((worker.balance || 0) - unsuccessFee).toFixed(2));
        db.updateUser(worker.id, { balance: workerNewBal });
      }

      db.updateOrder(orderId, {
        status: 'trial_not_activated',
        confirmed_at: now,
        is_manually_verified: true,
        manually_verified_by: agent ? agent.name : 'Agent via Telegram',
        unsuccess_fee: unsuccessFee
      });

      try {
        const io = getIO();
        if (io) {
          io.emit('order_manually_verified', {
            orderId,
            status: 'trial_not_activated',
            verifiedBy: agent ? agent.name : 'Agent via Telegram'
          });
          io.emit('orders_refresh');
        }
      } catch (e) {}

      if (worker && worker.telegram_chat_id) {
        await this.client.sendMessage(
          worker.telegram_chat_id,
          `⚠️ <b>Order ${order.id} Rejected:</b> Agent marked payment as not received.\nIf this was a mistake, you can submit an Appeal with UTR proof.`
        );
      }

      await this.client.answerCallbackQuery(callbackId, 'Marked as Rejected ($0.05 fee deducted).');
      await this.client.sendMessage(
        chatId,
        `❌ <b>Order ${order.id} Marked as Failed / Unsuccessful.</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💸 <b>$0.05 unsuccess fee</b> deducted.\n` +
        `💳 Remaining Balance: <b>$${(publisher?.balance || 0).toFixed(2)}</b>\n\n` +
        `<i>Made a mistake? Tap Undo below to revert:</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '↩️ Undo Reject', callback_data: `agent_undo:${order.id}` }]
            ]
          }
        }
      );
    }
  }

  /**
   * Process Agent undoing verification
   * User Requirement: "allow agents to undo if they made error in verifying"
   */
  async processAgentUndo(chatId, agent, orderId, callbackId) {
    const order = db.getOrder(orderId);
    if (!order) {
      await this.client.answerCallbackQuery(callbackId, 'Order not found.', true);
      return;
    }

    const config = db.getConfig();
    const publisher = db.getUser(order.publisher_id);
    const worker = order.claimed_by ? db.getUser(order.claimed_by) : null;
    const isPreviousSuccess = order.status === 'success';
    const feeToRefund = isPreviousSuccess ? (order.rate || 0.70) : 0.05;
    const reward = order.worker_rate || config.worker_payout_per_scan || 0.40;

    if (publisher) {
      const restoredBal = +((publisher.balance || 0) + feeToRefund).toFixed(2);
      db.updateUser(publisher.id, {
        balance: restoredBal,
        total_spent: Math.max(0, +((publisher.total_spent || 0) - feeToRefund).toFixed(2)),
        total_scans: isPreviousSuccess ? Math.max(0, (publisher.total_scans || 0) - 1) : (publisher.total_scans || 0)
      });
    }

    if (worker) {
      if (isPreviousSuccess) {
        db.updateUser(worker.id, {
          balance: Math.max(0, +((worker.balance || 0) - reward).toFixed(2)),
          total_personal_completed: Math.max(0, (worker.total_personal_completed || 0) - 1)
        });
      } else {
        db.updateUser(worker.id, {
          balance: +((worker.balance || 0) + 0.05).toFixed(2)
        });
      }
    }

    db.updateOrder(orderId, {
      status: 'awaiting_confirmation',
      confirmed_at: null,
      is_manually_verified: false
    });

    try {
      const io = getIO();
      if (io) io.emit('orders_refresh');
    } catch (e) {}

    await this.client.answerCallbackQuery(callbackId, 'Verification Undone!');
    await this.client.sendMessage(
      chatId,
      `↩️ <b>Verification Undone for ${order.id}!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💰 <b>$${feeToRefund.toFixed(2)} refunded</b> to your prepaid balance.\n` +
      `💳 Current Balance: <b>$${(publisher?.balance || 0).toFixed(2)}</b>\n` +
      `Order status reverted to <i>Awaiting Review</i>.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `✅ Re-confirm Success (-$${(order.rate || 0.70).toFixed(2)})`, callback_data: `agent_verify:${order.id}:success` },
              { text: '❌ Reject / Unsuccess (-$0.05)', callback_data: `agent_verify:${order.id}:failed` }
            ]
          ]
        }
      }
    );
  }

  /**
   * Persistent Reply Keyboard for Telegram client
   */
  getMainKeyboard(user) {
    if (user && (user.role === 'agent' || user.role === 'boss')) {
      return {
        keyboard: [
          [{ text: '📤 Upload QR Task' }, { text: '👥 Online Workers' }],
          [{ text: '💰 Balance & Top-up' }, { text: '📊 My Tasks Status' }],
          [{ text: '🔄 Refresh Dashboard' }]
        ],
        resize_keyboard: true
      };
    }

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
