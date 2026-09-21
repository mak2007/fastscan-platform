import express from 'express';
import { db, generateMerchantReference } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { getIO } from '../sockets/socketHandler.js';
import { findMainWorker } from './workers.js';
import { telegramBotService } from '../telegram/botHandlers.js';

const router = express.Router();

// 1. UPI Validation helper: confirms "upi" substring exists in link
export function validateUPILink(link) {
  if (!link || typeof link !== 'string') return false;
  const trimmed = link.trim().toLowerCase();
  // Check that it contains "upi" (e.g. upi://, /upi, ?pa=...&upi..., or upi in url)
  return trimmed.includes('upi');
}

// 2. Publish a new UPI order
router.post('/publish', (req, res) => {
  const { publisher_id, upi_link, duration_seconds, merchant_reference, worker_rate } = req.body;
  const config = db.getConfig();

  if (!publisher_id) {
    return res.status(400).json({ error: 'Publisher ID is required' });
  }

  const publisher = db.getUser(publisher_id);
  if (!publisher || publisher.role !== 'agent') {
    return res.status(404).json({ error: 'Publisher agent not found' });
  }

  // UPI Link Validation
  if (!validateUPILink(upi_link)) {
    return res.status(400).json({
      error: 'Invalid UPI link! Link must contain "upi" (e.g., upi://pay?... or UPI payment URL).'
    });
  }

  // Agent Balance Check & Tiered Pricing:
  // User Requirement: "agents they will pay on each scan let them add balance in the website like 5$ one time and they can scan 0.7$ per scan loan 10$ and scan at 0.67$ like that"
  const agentBalance = +(publisher.balance || 0).toFixed(2);
  const scanRate = publisher.scan_rate !== undefined 
    ? publisher.scan_rate 
    : ((publisher.active_tier && publisher.active_tier.includes('10')) || agentBalance >= 10 ? 0.67 : 0.70);

  if (agentBalance < scanRate) {
    return res.status(402).json({
      error: `Insufficient prepaid balance! Your balance is $${agentBalance.toFixed(2)}, but scan fee is $${scanRate.toFixed(2)}. Please add balance ($5 for $0.70/scan or take a $10 loan for $0.67/scan) to publish.`,
      needs_topup: true,
      balance: agentBalance,
      scan_rate: scanRate,
      suggested_packages: [
        { amount: 5, scan_rate: 0.70, label: 'Add $5 (Scan at $0.70/scan)' },
        { amount: 10, is_loan: true, scan_rate: 0.67, label: 'Take $10 Loan (Scan at $0.67/scan)' }
      ]
    });
  }

  const rate = scanRate;

  // Worker Payout Rate per scan: custom per order OR publisher default OR system default
  const assignedWorkerRate = worker_rate !== undefined && !isNaN(parseFloat(worker_rate))
    ? parseFloat(worker_rate)
    : (publisher.worker_rate !== undefined ? publisher.worker_rate : (config.worker_payout_per_scan || 0.40));

  // Expiry time (Default 5 minutes = 300 seconds)
  const duration = parseInt(duration_seconds, 10) || config.default_timer_seconds || 300;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + duration * 1000).toISOString();

  // Merchant Reference matching screenshots format: e.g. Karnataka-97-RobertHooper23936yAY_outlook.com-f81ed8516d
  const ref = (merchant_reference && merchant_reference.trim()) || generateMerchantReference(publisher.name);

  const newOrder = {
    id: `ord_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    merchant_reference: ref,
    publisher_id: publisher.id,
    publisher_name: publisher.name,
    upi_link: upi_link.trim(),
    duration_seconds: duration,
    rate,
    worker_rate: assignedWorkerRate,
    status: 'pending', // available in pool for fastest worker
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

  // Broadcast real-time event to all connected workers
  const io = getIO();
  if (io) {
    io.emit('new_order_available', newOrder);
    io.emit('orders_refresh');
  }

  // Alert highest priority active scanning workers on Telegram
  try {
    telegramBotService.onNewOrderAvailable(newOrder);
  } catch (err) {
    console.error('[orders] Error notifying telegram bot:', err.message);
  }

  res.status(201).json({
    message: 'Order published successfully and broadcasted to online workers!',
    order: newOrder,
    rateApplied: rate,
    scanRate: rate,
    activeTier: publisher.active_tier || 'starter_5'
  });
});

// 3. Claim an order (Fastest-finger race)
router.post('/:id/claim', (req, res) => {
  const { worker_id } = req.body;
  const orderId = req.params.id;

  if (!worker_id) {
    return res.status(400).json({ error: 'Worker ID is required' });
  }

  const worker = db.getUser(worker_id);
  if (!worker || worker.role !== 'worker') {
    return res.status(404).json({ error: 'Worker not found' });
  }

  // Check worker Ban status
  if (worker.is_banned) {
    return res.status(403).json({
      error: 'Your account is permanently banned due to 6 consecutive failed orders. Contact Super Boss for resolution.'
    });
  }

  // Check worker Timeout status
  if (worker.timeout_until) {
    const timeoutRemaining = new Date(worker.timeout_until).getTime() - Date.now();
    if (timeoutRemaining > 0) {
      const remainingSeconds = Math.ceil(timeoutRemaining / 1000);
      return res.status(403).json({
        error: `You are temporarily timed out! Please wait ${remainingSeconds} seconds before claiming new orders.`,
        timeoutRemainingSeconds: remainingSeconds
      });
    } else {
      // Clear expired timeout
      db.updateUser(worker.id, { timeout_until: null });
      worker.timeout_until = null;
    }
  }

  // Check worker online status
  if (worker.is_online === false) {
    return res.status(403).json({
      error: 'You are currently OFFLINE! Toggle to Online status to claim orders.'
    });
  }

  // Enforce max 3 concurrent active tasks
  const activeOrders = db.getOrders().filter(o => 
    o.claimed_by === worker.id && 
    (o.status === 'claimed' || o.status === 'awaiting_confirmation')
  );
  if (activeOrders.length >= 3) {
    return res.status(400).json({
      error: 'You already have 3 active orders in progress! Complete them before claiming more.'
    });
  }

  // Atomic check for order availability
  const order = db.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.status !== 'pending') {
    return res.status(409).json({
      error: 'Order was already claimed by another worker! Be faster next time.'
    });
  }

  // Check if order has expired
  if (new Date(order.expires_at).getTime() <= Date.now()) {
    db.updateOrder(orderId, { status: 'expired' });
    return res.status(410).json({ error: 'Order has already expired.' });
  }

  // Atomic claim
  const now = new Date().toISOString();
  const updatedOrder = db.updateOrder(orderId, {
    status: 'claimed',
    claimed_by: worker.id,
    claimed_by_name: worker.name,
    claimed_by_level: worker.level,
    claimed_by_parent_id: worker.parent_id,
    claimed_at: now
  });

  const io = getIO();
  if (io) {
    io.emit('order_claimed', {
      orderId: order.id,
      claimedBy: worker.name,
      claimedById: worker.id
    });
    io.emit('orders_refresh');
  }

  // Notify publisher via Telegram if publisher has telegram_chat_id
  const publisher = db.getUser(order.publisher_id);
  if (publisher && publisher.telegram_chat_id) {
    telegramBotService.client.sendMessage(
      publisher.telegram_chat_id,
      `⚡ <b>Order Picked Up!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🆔 <b>Order ID:</b> <code>${order.id}</code>\n` +
      `🏷️ <b>Ref:</b> <code>${order.merchant_reference || order.id}</code>\n` +
      `👤 <b>Worker:</b> ${worker.name}\n` +
      `⏳ <b>Status:</b> 🔵 <i>In Progress (Worker Scanning)...</i>`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }

  res.json({
    message: 'Order successfully claimed!',
    order: updatedOrder
  });
});

// 3b. Batch Request / Claim Up to 3 Orders (User Requirement: "they can claim upto 3 orders at a time click on request 3 orders")
router.post('/request-batch', (req, res) => {
  const { worker_id, count = 3 } = req.body;
  const requestedCount = Math.min(3, Math.max(1, parseInt(count, 10) || 3));

  const worker = db.getUser(worker_id);
  if (!worker || worker.role !== 'worker') {
    return res.status(404).json({ error: 'Worker not found' });
  }

  if (worker.is_banned) {
    return res.status(403).json({ error: 'Your account is currently banned from claiming orders.' });
  }

  if (worker.timeout_until) {
    if (new Date(worker.timeout_until).getTime() > Date.now()) {
      return res.status(403).json({
        error: 'Account in cooldown penalty! Try again later.'
      });
    } else {
      db.updateUser(worker.id, { timeout_until: null });
      worker.timeout_until = null;
    }
  }

  // Count existing active orders
  const existingActive = db.getOrders().filter(o =>
    o.claimed_by === worker.id &&
    (o.status === 'claimed' || o.status === 'awaiting_confirmation')
  );

  const slotsAvailable = Math.max(0, 3 - existingActive.length);
  if (slotsAvailable === 0) {
    return res.status(400).json({
      error: 'You already have 3 active orders in progress! Complete them before claiming more.'
    });
  }

  const claimCount = Math.min(slotsAvailable, requestedCount);
  const nowTime = Date.now();

  // Find oldest pending orders that are not expired
  const allOrders = db.getOrders();
  const availablePending = allOrders
    .filter(o => o.status === 'pending' && (!o.expires_at || new Date(o.expires_at).getTime() > nowTime))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (availablePending.length === 0) {
    return res.status(404).json({
      error: '0 orders found. No pending orders are currently available in the task pool.',
      claimed_orders: [],
      claimed_count: 0
    });
  }

  const ordersToClaim = availablePending.slice(0, claimCount);
  const now = new Date().toISOString();
  const claimedResults = [];

  for (const ord of ordersToClaim) {
    const updated = db.updateOrder(ord.id, {
      status: 'claimed',
      claimed_by: worker.id,
      claimed_by_name: worker.name,
      claimed_by_level: worker.level,
      claimed_by_parent_id: worker.parent_id,
      claimed_at: now
    });
    claimedResults.push(updated);
  }

  const io = getIO();
  if (io) {
    for (const claimed of claimedResults) {
      io.emit('order_claimed', {
        orderId: claimed.id,
        claimedBy: worker.name,
        claimedById: worker.id
      });
    }
    io.emit('orders_refresh');
  }

  res.json({
    message: `Successfully claimed ${claimedResults.length} order(s)!`,
    claimed_orders: claimedResults,
    claimed_count: claimedResults.length,
    active_total: existingActive.length + claimedResults.length
  });
});

// 4. Worker marks task as Success or Failed
router.post('/:id/complete-task', (req, res) => {
  const { worker_id, result } = req.body; // result: 'success' | 'failed'
  const orderId = req.params.id;

  if (!worker_id || !result || !['success', 'failed'].includes(result)) {
    return res.status(400).json({ error: 'Valid worker_id and result ("success" | "failed") are required.' });
  }

  const order = db.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.claimed_by !== worker_id) {
    return res.status(403).json({ error: 'You are not the assigned worker for this order.' });
  }

  if (order.status !== 'claimed') {
    return res.status(400).json({ error: `Cannot submit task in status '${order.status}'.` });
  }

  const now = new Date().toISOString();
  const updatedOrder = db.updateOrder(orderId, {
    status: 'awaiting_confirmation',
    worker_status: result,
    worker_completed_at: now
  });

  const io = getIO();
  if (io) {
    io.emit('order_awaiting_confirmation', {
      orderId: order.id,
      workerId: worker_id,
      workerResult: result
    });
    io.emit('orders_refresh');
  }

  // Notify publisher via Telegram if publisher has telegram_chat_id
  const publisher = db.getUser(order.publisher_id);
  if (publisher && publisher.telegram_chat_id) {
    const worker = db.getUser(worker_id);
    telegramBotService.client.sendMessage(
      publisher.telegram_chat_id,
      `🔔 <b>Worker Submitted Task!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🆔 <b>Order ID:</b> <code>${order.id}</code>\n` +
      `🏷️ <b>Ref:</b> <code>${order.merchant_reference || order.id}</code>\n` +
      `👤 <b>Worker:</b> ${worker?.name || worker_id}\n` +
      `💰 <b>Scan Fee:</b> $${(order.rate || 0.70).toFixed(2)}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Please verify whether the payment was received:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `✅ Confirm Success (-$${(order.rate || 0.70).toFixed(2)})`, callback_data: `agent_verify:${order.id}:success` },
              { text: '❌ Reject / Unsuccess (-$0.05)', callback_data: `agent_verify:${order.id}:failed` }
            ]
          ]
        }
      }
    ).catch(() => {});
  }

  res.json({
    message: 'Task submitted! Now awaiting confirmation from the publisher.',
    order: updatedOrder
  });
});

// 5. Publisher/Agent confirms or rejects task
router.post('/:id/confirm', (req, res) => {
  const { publisher_id, action } = req.body; // action: 'confirm_success' | 'confirm_failed' (or trial not activated)
  const orderId = req.params.id;

  const order = db.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Publisher verification (or Boss override)
  if (order.publisher_id !== publisher_id && publisher_id !== 'boss_admin') {
    return res.status(403).json({ error: 'Only the publisher or Boss can confirm this order.' });
  }

  if (order.status !== 'awaiting_confirmation' && order.status !== 'claimed') {
    return res.status(400).json({ error: `Cannot confirm order in status '${order.status}'.` });
  }

  const config = db.getConfig();
  const now = new Date().toISOString();
  const worker = db.getUser(order.claimed_by);
  const publisher = db.getUser(order.publisher_id);

  if (action === 'confirm_success') {
    // --- SUCCESS PATH ---
    const updatedOrder = db.updateOrder(orderId, {
      status: 'success',
      confirmed_at: now
    });

    // 1. Update Publisher metrics & deduct scan fee from prepaid balance
    // User Requirement: "agents they will pay on each scan"
    if (publisher) {
      const scanFee = +(order.rate || 0.70);
      const newBal = Math.max(0, +((publisher.balance || 0) - scanFee).toFixed(2));
      const newTotal = (publisher.total_scans || 0) + 1;
      const newSpent = +((publisher.total_spent || 0) + scanFee).toFixed(2);

      db.updateUser(publisher.id, {
        balance: newBal,
        total_scans: newTotal,
        total_spent: newSpent
      });

      const io = getIO();
      if (io) {
        io.emit('publisher_balance_updated', {
          publisherId: publisher.id,
          balance: newBal,
          scanFeeDeducted: scanFee,
          scanRate: publisher.scan_rate || scanFee
        });
      }
    }

    // 2. Update Worker metrics
    if (worker) {
      // Success resets consecutive failures counter!
      const personalDone = (worker.total_personal_completed || 0) + 1;

      // Handle payout / team rollup
      // "if the 1st in the pyramid is the considered boss and 2nd 3rd doesnt gets payment option every order is success under subworker also show overall done by main worker"
      const mainWorker = findMainWorker(worker.id);
      const reward = order.worker_rate !== undefined ? order.worker_rate : (config.worker_payout_per_scan || 0.40);
      const workerNewBal = +(worker.balance || 0) + reward;

      if (mainWorker && mainWorker.id !== worker.id) {
        const mainTeamDone = (mainWorker.total_team_completed || 0) + 1;

        db.updateUser(mainWorker.id, {
          total_team_completed: mainTeamDone
        });

        db.updateUser(worker.id, {
          consecutive_failures: 0,
          timeout_until: null,
          total_personal_completed: personalDone,
          balance: +workerNewBal.toFixed(2)
        });
      } else {
        db.updateUser(worker.id, {
          consecutive_failures: 0,
          timeout_until: null,
          total_personal_completed: personalDone,
          balance: +workerNewBal.toFixed(2)
        });
      }
    }

    const io = getIO();
    if (io) io.emit('orders_refresh');

    return res.json({
      message: 'Order verified as SUCCESS!',
      order: updatedOrder
    });

  } else {
    // --- FAILED / TRIAL NOT ACTIVATED PATH ---
    const unsuccessFee = 0.05;
    const updatedOrder = db.updateOrder(orderId, {
      status: 'trial_not_activated',
      confirmed_at: now,
      unsuccess_fee: unsuccessFee
    });

    // Deduct $0.05 unsuccess fee from Publisher
    // User Requirement: "deduct there 0.05 if its unsuccess"
    if (publisher) {
      const newBal = Math.max(0, +((publisher.balance || 0) - unsuccessFee).toFixed(2));
      const newSpent = +((publisher.total_spent || 0) + unsuccessFee).toFixed(2);
      db.updateUser(publisher.id, {
        balance: newBal,
        total_spent: newSpent
      });

      const io = getIO();
      if (io) {
        io.emit('publisher_balance_updated', {
          publisherId: publisher.id,
          balance: newBal,
          unsuccessFeeDeducted: unsuccessFee
        });
      }
    }

    // Worker Penalty & strikes:
    if (worker) {
      const workerNewBal = Math.max(0, +((worker.balance || 0) - unsuccessFee).toFixed(2));
      const newFailures = (worker.consecutive_failures || 0) + 1;
      let newTimeout = null;
      let isBanned = false;
      let penaltyMessage = '';

      if (newFailures >= 6) {
        isBanned = true;
        penaltyMessage = '6 consecutive failed orders: Worker account is permanently BANNED!';
      } else if (newFailures >= 4) {
        newTimeout = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
        penaltyMessage = '4 consecutive failed orders: 30 minutes timeout applied!';
      } else if (newFailures >= 2) {
        newTimeout = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 minutes
        penaltyMessage = '2 consecutive failed orders: 2 minutes timeout applied!';
      }

      db.updateUser(worker.id, {
        balance: workerNewBal,
        consecutive_failures: newFailures,
        timeout_until: newTimeout,
        is_banned: isBanned
      });

      const io = getIO();
      if (io) {
        io.emit('orders_refresh');
        io.emit('worker_penalty', {
          workerId: worker.id,
          consecutiveFailures: newFailures,
          isBanned,
          timeoutUntil: newTimeout,
          message: penaltyMessage
        });
      }

      return res.json({
        message: 'Order marked as Failed / Unsuccessful ($0.05 unsuccess fee deducted).',
        order: updatedOrder,
        unsuccessFee,
        workerPenalty: penaltyMessage
      });
    }

    const io = getIO();
    if (io) io.emit('orders_refresh');

    return res.json({
      message: 'Order marked as Failed / Unsuccessful ($0.05 unsuccess fee deducted).',
      order: updatedOrder,
      unsuccessFee
    });
  }
});

// 5b. Worker requests manual review from Agent (if unable to scan or needs verification assistance)
router.post('/:id/request-manual-review', (req, res) => {
  const { worker_id, reason } = req.body;
  const orderId = req.params.id;

  const order = db.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.claimed_by !== worker_id) {
    return res.status(403).json({ error: 'You are not the assigned worker for this order.' });
  }

  const updatedOrder = db.updateOrder(orderId, {
    status: 'manual_review',
    manual_review_requested: true,
    manual_review_requested_at: new Date().toISOString(),
    manual_review_reason: reason || 'Worker requested manual review'
  });

  const io = getIO();
  if (io) {
    io.emit('order_manual_review_requested', {
      orderId: order.id,
      workerId: worker_id,
      publisherId: order.publisher_id
    });
    io.emit('orders_refresh');
  }

  res.json({
    message: 'Task escalated for Agent Manual Review. Agent has been notified to verify.',
    order: updatedOrder
  });
});

// 5c. Agent Manual Verification:
// "if the wworker doesnt verify it by himself then the agent gets manual option to verify it"
router.post('/:id/manual-verify', (req, res) => {
  const { publisher_id, action, notes } = req.body; // action: 'confirm_success' | 'confirm_failed'
  const orderId = req.params.id;

  const order = db.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Verify that caller is the publisher of this order or the platform Super Boss
  const publisher = db.getUser(publisher_id);
  if (!publisher || (publisher.id !== order.publisher_id && publisher.role !== 'boss')) {
    return res.status(403).json({ error: 'Only the publisher of this order or Super Boss can manually verify it.' });
  }

  const config = db.getConfig();
  const now = new Date().toISOString();
  const worker = order.claimed_by ? db.getUser(order.claimed_by) : null;
  const orderPublisher = db.getUser(order.publisher_id);

  if (action === 'confirm_success') {
    // --- MANUAL SUCCESS ---
    const updatedOrder = db.updateOrder(orderId, {
      status: 'success',
      confirmed_at: now,
      is_manually_verified: true,
      manually_verified_by: publisher.name,
      manually_verified_at: now,
      manual_verification_notes: notes || 'Manually verified as Success by Agent'
    });

    // 1. Update Publisher metrics & deduct scan fee from prepaid balance
    // User Requirement: "agents they will pay on each scan"
    if (orderPublisher) {
      const scanFee = +(order.rate || 0.70);
      const newBal = Math.max(0, +((orderPublisher.balance || 0) - scanFee).toFixed(2));
      const newTotal = (orderPublisher.total_scans || 0) + 1;
      const newSpent = +((orderPublisher.total_spent || 0) + scanFee).toFixed(2);

      db.updateUser(orderPublisher.id, {
        balance: newBal,
        total_scans: newTotal,
        total_spent: newSpent
      });

      const io = getIO();
      if (io) {
        io.emit('publisher_balance_updated', {
          publisherId: orderPublisher.id,
          balance: newBal,
          scanFeeDeducted: scanFee,
          scanRate: orderPublisher.scan_rate || scanFee
        });
      }
    }

    // 2. Update Worker metrics (credited without strikes)
    if (worker) {
      const personalDone = (worker.total_personal_completed || 0) + 1;
      const mainWorker = findMainWorker(worker.id);
      const reward = order.worker_rate !== undefined ? order.worker_rate : (config.worker_payout_per_scan || 0.40);
      const workerNewBal = +(worker.balance || 0) + reward;

      if (mainWorker && mainWorker.id !== worker.id) {
        const mainTeamDone = (mainWorker.total_team_completed || 0) + 1;

        db.updateUser(mainWorker.id, {
          total_team_completed: mainTeamDone
        });

        db.updateUser(worker.id, {
          consecutive_failures: 0,
          timeout_until: null,
          total_personal_completed: personalDone,
          balance: +workerNewBal.toFixed(2)
        });
      } else {
        db.updateUser(worker.id, {
          consecutive_failures: 0,
          timeout_until: null,
          total_personal_completed: personalDone,
          balance: +workerNewBal.toFixed(2)
        });
      }
    }

    const io = getIO();
    if (io) {
      io.emit('order_manually_verified', {
        orderId,
        status: 'success',
        verifiedBy: publisher.name
      });
      io.emit('orders_refresh');
    }

    return res.json({
      message: 'Order manually verified as SUCCESS by Agent!',
      order: updatedOrder
    });

  } else {
    // --- MANUAL FAILED / TRIAL NOT ACTIVATED ---
    const unsuccessFee = 0.05;
    const updatedOrder = db.updateOrder(orderId, {
      status: 'trial_not_activated',
      confirmed_at: now,
      is_manually_verified: true,
      manually_verified_by: publisher.name,
      manually_verified_at: now,
      manual_verification_notes: notes || 'Manually marked as Failed / Trial Not Activated by Agent',
      unsuccess_fee: unsuccessFee
    });

    // Deduct $0.05 unsuccess fee from Publisher
    // User Requirement: "deduct there 0.05 if its unsuccess"
    if (publisher) {
      const newBal = Math.max(0, +((publisher.balance || 0) - unsuccessFee).toFixed(2));
      const newSpent = +((publisher.total_spent || 0) + unsuccessFee).toFixed(2);
      db.updateUser(publisher.id, {
        balance: newBal,
        total_spent: newSpent
      });

      const io = getIO();
      if (io) {
        io.emit('publisher_balance_updated', {
          publisherId: publisher.id,
          balance: newBal,
          unsuccessFeeDeducted: unsuccessFee
        });
      }
    }

    if (worker) {
      const workerNewBal = Math.max(0, +((worker.balance || 0) - unsuccessFee).toFixed(2));
      db.updateUser(worker.id, { balance: workerNewBal });
    }

    const io = getIO();
    if (io) {
      io.emit('order_manually_verified', {
        orderId,
        status: 'trial_not_activated',
        verifiedBy: publisher.name
      });
      io.emit('orders_refresh');
    }

    return res.json({
      message: 'Order manually marked as Failed / Trial Not Activated by Agent ($0.05 unsuccess fee deducted).',
      order: updatedOrder,
      unsuccessFee
    });
  }
});

// 5d. Undo Verification:
// "allow agents to undo if they made error in verifying"
router.post('/:id/undo-verify', (req, res) => {
  const { publisher_id, reason } = req.body;
  const orderId = req.params.id;

  const order = db.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Verify caller is publisher or boss_admin
  const publisher = db.getUser(publisher_id);
  if (!publisher || (publisher.id !== order.publisher_id && publisher.role !== 'boss')) {
    return res.status(403).json({ error: 'Only the publisher of this order or Super Boss can undo verification.' });
  }

  // Can only undo orders that were completed/verified
  if (order.status !== 'success' && order.status !== 'trial_not_activated') {
    return res.status(400).json({ error: `Cannot undo verification for order currently in status '${order.status}'.` });
  }

  const previousStatus = order.status;
  const config = db.getConfig();
  const worker = order.claimed_by ? db.getUser(order.claimed_by) : null;
  const orderPublisher = db.getUser(order.publisher_id);
  const reward = order.worker_rate !== undefined ? order.worker_rate : (config.worker_payout_per_scan || 0.40);
  const now = new Date().toISOString();

  // 1. If previous status was 'success', roll back credited earnings and completed counts
  if (previousStatus === 'success') {
    if (orderPublisher) {
      const newUnpaid = Math.max(0, (orderPublisher.scans_completed_unpaid || 0) - 1);
      const newTotal = Math.max(0, (orderPublisher.total_scans || 0) - 1);
      const newSpent = Math.max(0, +(orderPublisher.total_spent || 0) - +(order.rate || 0.55));
      const isLocked = newUnpaid >= (config.scan_lock_limit || 3);

      db.updateUser(orderPublisher.id, {
        scans_completed_unpaid: newUnpaid,
        total_scans: newTotal,
        total_spent: +newSpent.toFixed(2),
        is_locked: isLocked
      });
    }

    if (worker) {
      const personalDone = Math.max(0, (worker.total_personal_completed || 0) - 1);
      const mainWorker = findMainWorker(worker.id);

      if (mainWorker && mainWorker.id !== worker.id) {
        const mainTeamDone = Math.max(0, (mainWorker.total_team_completed || 0) - 1);
        const mainNewBal = Math.max(0, +(mainWorker.balance || 0) - reward);

        db.updateUser(mainWorker.id, {
          total_team_completed: mainTeamDone,
          balance: +mainNewBal.toFixed(2)
        });

        db.updateUser(worker.id, {
          total_personal_completed: personalDone
        });
      } else {
        const newBal = Math.max(0, +(worker.balance || 0) - reward);
        db.updateUser(worker.id, {
          total_personal_completed: personalDone,
          balance: +newBal.toFixed(2)
        });
      }
    }
  }

  // 2. If previous status was 'trial_not_activated', rollback worker strikes and refund $0.05
  if (previousStatus === 'trial_not_activated') {
    if (orderPublisher) {
      const restoredBal = +((orderPublisher.balance || 0) + 0.05).toFixed(2);
      const newSpent = Math.max(0, +((orderPublisher.total_spent || 0) - 0.05).toFixed(2));
      db.updateUser(orderPublisher.id, {
        balance: restoredBal,
        total_spent: newSpent
      });
      const io = getIO();
      if (io) {
        io.emit('publisher_balance_updated', {
          publisherId: orderPublisher.id,
          balance: restoredBal
        });
      }
    }

    if (worker) {
      const strikes = Math.max(0, (worker.consecutive_failures || 0) - 1);
      const restoredWorkerBal = +((worker.balance || 0) + 0.05).toFixed(2);
      db.updateUser(worker.id, {
        balance: restoredWorkerBal,
        consecutive_failures: strikes,
        timeout_until: null,
        is_banned: false
      });
    }
  }

  // 3. Reset order status back to 'awaiting_confirmation'
  const updatedOrder = db.updateOrder(orderId, {
    status: 'awaiting_confirmation',
    confirmed_at: null,
    is_manually_verified: false,
    verification_undone: true,
    undone_at: now,
    undone_by: publisher.name,
    undo_reason: reason || 'Agent undid verification due to error'
  });

  const io = getIO();
  if (io) {
    io.emit('order_verification_undone', {
      orderId,
      previousStatus,
      undoneBy: publisher.name
    });
    io.emit('orders_refresh');
  }

  res.json({
    message: `Verification undone successfully! Order returned to review queue and all balances/penalties were safely reversed.`,
    order: updatedOrder,
    previousStatus
  });
});

// 6. Get orders with filters and 24h metrics
// "there are 3 things shown on recent orders - 1 success 2 expired 3- trial not activated"
// "and the agents should be abe to see the todays successful orders completed in last 24 hours"
router.get('/recent', (req, res) => {
  const { publisher_id, worker_id, status } = req.query;
  let allOrders = db.getOrders();

  if (publisher_id) {
    allOrders = allOrders.filter(o => o.publisher_id === publisher_id);
  }
  if (worker_id) {
    allOrders = allOrders.filter(o => o.claimed_by === worker_id);
  }

  // Calculate 1h, 24h, and total successful orders out of total done
  // User Requirement: "send last 1hr and 24hrs total count out of total done"
  const now = Date.now();
  const last1hTimestamp = now - 60 * 60 * 1000;
  const last24hTimestamp = now - 24 * 60 * 60 * 1000;

  const totalDone = allOrders.filter(o => o.status === 'success').length;
  const last1hSuccessful = allOrders.filter(o =>
    o.status === 'success' &&
    new Date(o.confirmed_at || o.created_at).getTime() >= last1hTimestamp
  ).length;
  const last24hSuccessful = allOrders.filter(o =>
    o.status === 'success' &&
    new Date(o.confirmed_at || o.created_at).getTime() >= last24hTimestamp
  ).length;

  const onlineWorkersCount = db.getUsers().filter(u => u.role === 'worker' && u.is_online !== false).length;

  // Filter by requested category if provided
  let filtered = allOrders;
  if (status) {
    filtered = allOrders.filter(o => o.status === status);
  }

  // Breakdown for quick UI tabs
  const successOrders = allOrders.filter(o => o.status === 'success');
  const expiredOrders = allOrders.filter(o => o.status === 'expired');
  const trialNotActivatedOrders = allOrders.filter(o => o.status === 'trial_not_activated');
  const pendingOrders = allOrders.filter(o => o.status === 'pending');
  const awaitingOrders = allOrders.filter(o => o.status === 'awaiting_confirmation');
  const manualReviewOrders = allOrders.filter(o => o.status === 'manual_review');
  const claimedOrders = allOrders.filter(o => o.status === 'claimed');

  // Sort tasks from expiring soon to least soon (most urgent first - User Requirement)
  filtered.sort((a, b) => {
    const timeA = new Date(a.expires_at || a.created_at).getTime();
    const timeB = new Date(b.expires_at || b.created_at).getTime();
    return timeA - timeB;
  });

  res.json({
    orders: filtered,
    stats24h: {
      successful_count: last24hSuccessful,
      last1h_count: last1hSuccessful,
      last24h_count: last24hSuccessful,
      total_done: totalDone,
      online_workers: onlineWorkersCount
    },
    online_workers_count: onlineWorkersCount,
    counts: {
      all: allOrders.length,
      success: successOrders.length,
      expired: expiredOrders.length,
      trial_not_activated: trialNotActivatedOrders.length,
      pending: pendingOrders.length,
      awaiting_confirmation: awaitingOrders.length,
      manual_review: manualReviewOrders.length,
      claimed: claimedOrders.length
    }
  });
});

// 7. Worker Appeals:
// "the worker can also appeal and message gets send to agent 3 normal appeal and each is new order id"
router.post('/:id/appeal', (req, res) => {
  const { worker_id, message, mistake_type, utr } = req.body;
  const orderId = req.params.id;

  const order = db.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.claimed_by !== worker_id) {
    return res.status(403).json({ error: 'You are not the worker who claimed this order.' });
  }

  const currentAppeals = order.appeal_count || 0;
  if (currentAppeals >= 3) {
    return res.status(400).json({ error: 'Maximum 3 normal appeals reached for this task.' });
  }

  const newAppealCount = currentAppeals + 1;
  const newAppealOrderId = `ord_appeal_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  // Update original order
  db.updateOrder(orderId, {
    appeal_count: newAppealCount,
    appeals_remaining: 3 - newAppealCount,
    last_appeal_order_id: newAppealOrderId,
    last_appeal_at: now,
    status: 'manual_review'
  });

  // Create new appeal ticket with its own unique order ID as requested
  const appealRecord = {
    id: newAppealOrderId,
    original_order_id: order.id,
    merchant_reference: `${order.merchant_reference || order.id} (Appeal #${newAppealCount})`,
    worker_id: worker_id,
    worker_name: order.claimed_by_name,
    publisher_id: order.publisher_id,
    publisher_name: order.publisher_name,
    upi_link: order.upi_link,
    rate: order.rate,
    appeal_number: newAppealCount,
    appeals_remaining: 3 - newAppealCount,
    mistake_type: mistake_type || 'unspecified_error',
    utr: utr || null,
    worker_message: message || 'Worker submitted appeal for payment verification',
    status: 'pending',
    created_at: now,
    resolved_at: null,
    resolution: null
  };

  db.addAppeal(appealRecord);

  const io = getIO();
  if (io) {
    io.emit('new_appeal_submitted', appealRecord);
    io.emit('orders_refresh');
  }

  res.status(201).json({
    message: `Appeal #${newAppealCount} submitted to Agent! New Appeal Order ID: ${newAppealOrderId}`,
    appeal: appealRecord,
    appeals_remaining: 3 - newAppealCount
  });
});

// Get Appeals for publisher or worker
router.get('/appeals/list', (req, res) => {
  const { publisher_id, worker_id } = req.query;
  let appeals = db.getAppeals();

  if (publisher_id) {
    appeals = appeals.filter(a => a.publisher_id === publisher_id);
  }
  if (worker_id) {
    appeals = appeals.filter(a => a.worker_id === worker_id);
  }

  res.json({ appeals });
});

// Resolve an Appeal by Agent
router.post('/appeals/:id/resolve', (req, res) => {
  const { publisher_id, action, agent_notes } = req.body; // action: 'approve' | 'reject'
  const appealId = req.params.id;

  const appeal = db.getAppeal(appealId);
  if (!appeal) {
    return res.status(404).json({ error: 'Appeal not found' });
  }

  if (appeal.publisher_id !== publisher_id && publisher_id !== 'boss_admin') {
    return res.status(403).json({ error: 'Only the assigned publisher can resolve this appeal.' });
  }

  const now = new Date().toISOString();
  const config = db.getConfig();
  const originalOrder = db.getOrder(appeal.original_order_id);
  const worker = db.getUser(appeal.worker_id);

  const isApproved = action === 'approve';
  const updatedAppeal = db.updateAppeal(appealId, {
    status: isApproved ? 'approved' : 'rejected',
    resolved_at: now,
    resolution: agent_notes || (isApproved ? 'Approved by Agent' : 'Rejected by Agent upon verification')
  });

  if (isApproved) {
    // 2. Mark original order success
    if (originalOrder) {
      db.updateOrder(originalOrder.id, {
        status: 'success',
        confirmed_at: now,
        is_manually_verified: true,
        manually_verified_by: appeal.publisher_name,
        manually_verified_at: now,
        manual_verification_notes: `Approved via Appeal ${appealId}: ${agent_notes || 'Transaction verified'}`
      });
    }

    // 3. Credit worker
    if (worker) {
      const reward = (originalOrder && originalOrder.worker_rate !== undefined) 
        ? originalOrder.worker_rate 
        : (config.worker_payout_per_scan || 0.40);
      const mainWorker = findMainWorker(worker.id);

      if (mainWorker && mainWorker.id !== worker.id) {
        db.updateUser(mainWorker.id, {
          total_team_completed: (mainWorker.total_team_completed || 0) + 1,
          balance: +((mainWorker.balance || 0) + reward).toFixed(2)
        });
        db.updateUser(worker.id, {
          consecutive_failures: 0,
          timeout_until: null,
          total_personal_completed: (worker.total_personal_completed || 0) + 1
        });
      } else {
        db.updateUser(worker.id, {
          balance: +((worker.balance || 0) + reward).toFixed(2),
          consecutive_failures: 0,
          timeout_until: null,
          total_personal_completed: (worker.total_personal_completed || 0) + 1
        });
      }
    }
  }

  // 4. Create and dispatch Message Bot feedback to the worker
  // User Requirement: "agent reviews and sends him feedback via message bot"
  const botMsgId = `msg_bot_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const feedbackContent = agent_notes && agent_notes.trim()
    ? agent_notes.trim()
    : (isApproved
        ? 'Your appeal has been reviewed and verified by the agent. Payout has been credited to your balance.'
        : 'Your appeal was reviewed, but the agent was unable to verify the transaction in the bank records.');

  const botMessage = {
    id: botMsgId,
    type: 'appeal_resolution',
    sender_type: 'bot',
    bot_name: 'FastScan Message Bot',
    agent_id: publisher_id,
    agent_name: appeal.publisher_name || 'Reviewing Agent',
    recipient_id: appeal.worker_id,
    recipient_name: appeal.worker_name,
    order_id: appeal.original_order_id,
    merchant_reference: originalOrder ? originalOrder.merchant_reference : null,
    appeal_id: appeal.id,
    appeal_number: appeal.appeal_number,
    mistake_type: appeal.mistake_type || 'unspecified_error',
    utr: appeal.utr || null,
    worker_message: appeal.worker_message,
    status: isApproved ? 'approved' : 'rejected',
    title: isApproved
      ? `✅ Appeal Approved: Order #${originalOrder?.merchant_reference || appeal.original_order_id}`
      : `❌ Appeal Rejected: Order #${originalOrder?.merchant_reference || appeal.original_order_id}`,
    content: feedbackContent,
    created_at: now,
    is_read: false,
    read_at: null
  };

  db.addMessage(botMessage);

  const io = getIO();
  if (io) {
    io.emit('appeal_resolved', {
      appealId,
      status: isApproved ? 'approved' : 'rejected',
      workerId: appeal.worker_id,
      botMessage
    });
    io.emit('bot_message_received', botMessage);
    io.emit('orders_refresh');
  }

  // Forward feedback to worker on Telegram if linked
  try {
    telegramBotService.forwardBotMessage(botMessage);
  } catch (err) {
    console.error('[orders] Error forwarding bot message to Telegram:', err.message);
  }

  return res.json({
    message: isApproved 
      ? 'Appeal approved, earnings credited, and feedback sent via Message Bot!' 
      : 'Appeal rejected and feedback sent to worker via Message Bot.',
    appeal: updatedAppeal,
    bot_message: botMessage
  });
});

// 8. Get single order by id
router.get('/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json({ order });
});

export default router;
