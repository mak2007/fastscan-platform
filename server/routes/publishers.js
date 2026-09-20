import express from 'express';
import { db } from '../db.js';
import { getIO } from '../sockets/socketHandler.js';

const router = express.Router();

// Get publisher status and limits
router.get('/:id', (req, res) => {
  const publisher = db.getUser(req.params.id);
  if (!publisher || publisher.role !== 'agent') {
    return res.status(404).json({ error: 'Publisher not found' });
  }

  const config = db.getConfig();
  const balance = +(publisher.balance || 0).toFixed(2);
  
  // Tier & scan rate:
  // $5 deposit -> $0.70/scan (~7 scans)
  // $10 loan / deposit -> $0.67/scan (~15 scans)
  let activeTier = publisher.active_tier || (balance >= 10 ? 'volume_10' : 'starter_5');
  let scanRate = publisher.scan_rate !== undefined ? publisher.scan_rate : (activeTier.includes('10') || balance >= 10 ? 0.67 : 0.70);
  const scansRemaining = scanRate > 0 ? Math.floor(balance / scanRate) : 0;
  const currentWorkerRate = publisher.worker_rate !== undefined ? publisher.worker_rate : (config.worker_payout_per_scan || 0.40);

  res.json({
    publisher: {
      ...publisher,
      balance,
      scan_rate: scanRate,
      active_tier: activeTier,
      loan_balance: publisher.loan_balance || 0,
      scans_remaining: scansRemaining,
      is_locked: false,
      worker_rate: currentWorkerRate
    },
    packages: {
      starter: { amount: 5, scan_rate: 0.70, estimated_scans: 7, label: '$5 Starter Pack' },
      volume_loan: { amount: 10, scan_rate: 0.67, estimated_scans: 15, is_loan: true, label: '$10 Credit Loan / Volume Pack' }
    },
    pricing: {
      currentRate: scanRate,
      scanRate,
      balance,
      scansRemaining,
      activeTier,
      workerRate: currentWorkerRate
    },
    limits: {
      lockLimit: 9999,
      unpaidScans: 0,
      unpaidAmount: 0,
      isLocked: false
    },
    bossPaymentInfo: {
      upi_id: config.boss_upi_id,
      binance_id: config.boss_binance_id
    }
  });
});

/**
 * POST /api/publishers/:id/topup
 * Add balance or activate $10 credit loan
 * User Requirement: "agents they will pay on each scan let them add balance in the website like 5$ one time and they can scan 0.7$ per scan loan 10$ and scan at 0.67$ like that"
 */
router.post('/:id/topup', (req, res) => {
  const publisherId = req.params.id;
  const { amount, is_loan, method, payment_ref } = req.body;
  const publisher = db.getUser(publisherId);
  if (!publisher || publisher.role !== 'agent') {
    return res.status(404).json({ error: 'Publisher agent not found' });
  }

  const topupAmount = parseFloat(amount);
  if (isNaN(topupAmount) || topupAmount <= 0) {
    return res.status(400).json({ error: 'Please enter a valid balance top-up amount (e.g. $5.00 or $10.00).' });
  }

  let scanRate = 0.70;
  let activeTier = 'starter_5';

  if (is_loan || topupAmount >= 10) {
    scanRate = 0.67;
    activeTier = is_loan ? 'volume_loan_10' : 'volume_10';
  } else {
    scanRate = 0.70;
    activeTier = 'starter_5';
  }

  const currentBalance = publisher.balance || 0;
  const newBalance = +(currentBalance + topupAmount).toFixed(2);
  const currentLoan = publisher.loan_balance || 0;
  const newLoan = is_loan ? +(currentLoan + topupAmount).toFixed(2) : currentLoan;

  const updated = db.updateUser(publisherId, {
    balance: newBalance,
    scan_rate: scanRate,
    active_tier: activeTier,
    loan_balance: newLoan,
    is_locked: false,
    scans_completed_unpaid: 0,
    total_deposited: +((publisher.total_deposited || 0) + (is_loan ? 0 : topupAmount)).toFixed(2)
  });

  const scansRemaining = Math.floor(newBalance / scanRate);

  const io = getIO();
  if (io) {
    io.emit('publisher_balance_updated', {
      publisherId,
      balance: newBalance,
      scanRate,
      activeTier,
      scansRemaining,
      isLoan: Boolean(is_loan)
    });
    io.emit('users_updated');
  }

  res.json({
    message: is_loan 
      ? `🎉 $${topupAmount.toFixed(2)} Instant Credit Loan activated! You can now scan at $${scanRate.toFixed(2)}/scan (${scansRemaining} scans available).`
      : `🎉 Balance successfully credited with $${topupAmount.toFixed(2)}! Active scan rate: $${scanRate.toFixed(2)}/scan (${scansRemaining} scans available).`,
    publisher: updated,
    balance: newBalance,
    scan_rate: scanRate,
    active_tier: activeTier,
    scans_remaining: scansRemaining
  });
});

// Update Publisher's Worker Payout Rate
// "set the rate for workers according to me allow me to modify it also okay"
router.post('/:id/worker-rate', (req, res) => {
  const { worker_rate } = req.body;
  const publisher = db.getUser(req.params.id);
  if (!publisher || publisher.role !== 'agent') {
    return res.status(404).json({ error: 'Publisher not found' });
  }

  const rate = parseFloat(worker_rate);
  if (isNaN(rate) || rate < 0) {
    return res.status(400).json({ error: 'Please enter a valid worker payout rate (e.g. 0.40, 0.50).' });
  }

  const updated = db.updateUser(publisher.id, { worker_rate: rate });

  const io = getIO();
  if (io) io.emit('publisher_rate_updated', { publisherId: publisher.id, worker_rate: rate });

  res.json({
    message: `Worker payout rate successfully updated to $${rate.toFixed(2)} / completed scan!`,
    worker_rate: rate,
    publisher: updated
  });
});

// Publisher requests unlock after paying
router.post('/:id/request-unlock', (req, res) => {
  const { note, payment_method, transaction_ref } = req.body;
  const publisher = db.getUser(req.params.id);
  if (!publisher || publisher.role !== 'agent') {
    return res.status(404).json({ error: 'Publisher not found' });
  }

  const updated = db.updateUser(publisher.id, {
    unlock_requested: true,
    unlock_request_note: note || `Payment submitted via ${payment_method || 'UPI/Binance'} (Ref: ${transaction_ref || 'N/A'})`,
    unlock_requested_at: new Date().toISOString()
  });

  const io = getIO();
  if (io) {
    io.emit('publisher_unlock_requested', {
      publisherId: publisher.id,
      publisherName: publisher.name
    });
  }

  res.json({
    message: 'Unlock request submitted! Boss has been notified to verify your payment.',
    publisher: updated
  });
});

// L1 Boss generates an L2 Worker Key to invite workers (supports naming the key)
// "allow naming new joinging key but login using the key only"
router.post('/:id/generate-worker-key', (req, res) => {
  const { label, name } = req.body;
  const publisher = db.getUser(req.params.id);
  if (!publisher || publisher.role !== 'agent') {
    return res.status(404).json({ error: 'Publisher (L1 Boss) not found' });
  }

  const assignedName = (name || label || '').trim();
  const rand1 = Math.floor(1000 + Math.random() * 9000);
  const rand2 = Math.floor(1000 + Math.random() * 9000);
  const keyStr = `L2-WORKER-${rand1}-${rand2}`;

  const newKey = {
    key: keyStr,
    type: 'l2_worker',
    created_by: publisher.id,
    created_by_name: publisher.name,
    created_by_role: 'agent',
    target_role: 'worker',
    target_level: 2,
    assigned_name: assignedName || 'L2 Worker Member',
    label: assignedName || 'L2 Worker Member',
    description: assignedName 
      ? `L2 Worker Key for ${assignedName} (Issued by L1 Boss: ${publisher.name})`
      : `L2 Worker Invite Key (Issued by L1 Boss: ${publisher.name})`,
    created_at: new Date().toISOString(),
    used_by: null,
    used_by_name: null,
    status: 'active'
  };

  db.addKey(newKey);

  const io = getIO();
  if (io) io.emit('keys_updated', { type: 'l2_worker', key: keyStr, publisherId: publisher.id });

  res.json({
    message: assignedName 
      ? `L2 Worker Key for "${assignedName}" generated successfully!` 
      : 'L2 Worker Key generated successfully!',
    key: newKey
  });
});

// Get L2 Worker keys generated by this L1 Boss
router.get('/:id/worker-keys', (req, res) => {
  const publisherId = req.params.id;
  const allKeys = db.getKeys();
  const keys = allKeys.filter(k => k.created_by === publisherId && (k.type === 'l2_worker' || k.key.startsWith('L2-WORKER-')));
  res.json({ keys });
});

// Get L2 Workers recruited under this L1 Boss
router.get('/:id/team-workers', (req, res) => {
  const publisherId = req.params.id;
  const allUsers = db.getUsers();
  // Workers recruited by this publisher or all active workers available
  const workers = allUsers.filter(u => u.role === 'worker');
  res.json({ workers });
});

export default router;
