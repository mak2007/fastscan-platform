import express from 'express';
import { db } from '../db.js';
import { getIO, getPresenceStats } from '../sockets/socketHandler.js';

const router = express.Router();

// Get full system overview for Boss
router.get('/overview', (req, res) => {
  const config = db.getConfig();
  const users = db.getUsers();
  const orders = db.getOrders();
  const payouts = db.getPayoutRequests();
  const keys = db.getKeys();
  const presence = getPresenceStats();

  const publishers = users.filter(u => u.role === 'agent');
  const workers = users.filter(u => u.role === 'worker');

  const pendingPayouts = payouts.filter(p => p.status === 'pending');
  const lockedPublishers = publishers.filter(p => p.is_locked || (p.scans_completed_unpaid || 0) >= config.scan_lock_limit);

  const usersWithPresence = users.map(u => {
    if (u.role === 'worker') {
      const isOnline = presence.onlineWorkerIds ? presence.onlineWorkerIds.includes(u.id) : (u.is_online !== false);
      return { ...u, is_online: isOnline };
    }
    return u;
  });

  res.json({
    config,
    stats: {
      totalOrders: orders.length,
      successOrders: orders.filter(o => o.status === 'success').length,
      expiredOrders: orders.filter(o => o.status === 'expired').length,
      trialNotActivatedOrders: orders.filter(o => o.status === 'trial_not_activated').length,
      pendingOrders: orders.filter(o => o.status === 'pending').length,
      awaitingOrders: orders.filter(o => o.status === 'awaiting_confirmation').length,
      totalPublishers: publishers.length,
      totalWorkers: workers.length,
      pendingPayoutsCount: pendingPayouts.length,
      lockedPublishersCount: lockedPublishers.length,
      onlineWorkers: presence.onlineWorkers,
      onlinePublishers: presence.onlinePublishers
    },
    users: usersWithPresence,
    orders,
    payouts,
    keys
  });
});

// Update platform settings / limits / pricing:
// "and i can set the limit to 5 or something"
// "the agent should pay 0.55 and i can change it like allow there 1st 3 links for 0.55 ... then after 3 set it to 0.60"
router.post('/config', (req, res) => {
  const {
    scan_lock_limit,
    promo_scan_count,
    promo_scan_rate,
    regular_scan_rate,
    default_timer_seconds,
    worker_payout_per_scan,
    boss_upi_id,
    boss_binance_id
  } = req.body;

  const updates = {};
  if (scan_lock_limit !== undefined) updates.scan_lock_limit = parseInt(scan_lock_limit, 10);
  if (promo_scan_count !== undefined) updates.promo_scan_count = parseInt(promo_scan_count, 10);
  if (promo_scan_rate !== undefined) updates.promo_scan_rate = parseFloat(promo_scan_rate);
  if (regular_scan_rate !== undefined) updates.regular_scan_rate = parseFloat(regular_scan_rate);
  if (default_timer_seconds !== undefined) updates.default_timer_seconds = parseInt(default_timer_seconds, 10);
  if (worker_payout_per_scan !== undefined) updates.worker_payout_per_scan = parseFloat(worker_payout_per_scan);
  if (boss_upi_id !== undefined) updates.boss_upi_id = boss_upi_id.trim();
  if (boss_binance_id !== undefined) updates.boss_binance_id = boss_binance_id.trim();

  const updatedConfig = db.updateConfig(updates);

  const io = getIO();
  if (io) io.emit('config_updated', updatedConfig);

  res.json({ message: 'Settings updated successfully!', config: updatedConfig });
});

// Unlock publisher after Boss confirms payment
// "show them please pay for current orders and then i confirm and unlock him okay"
router.post('/publishers/:id/unlock', (req, res) => {
  const publisherId = req.params.id;
  const publisher = db.getUser(publisherId);

  if (!publisher || publisher.role !== 'agent') {
    return res.status(404).json({ error: 'Publisher not found' });
  }

  const updated = db.updateUser(publisherId, {
    is_locked: false,
    scans_completed_unpaid: 0, // reset unpaid counter
    unlock_requested: false,
    unlock_request_note: '',
    last_unlocked_at: new Date().toISOString()
  });

  const io = getIO();
  if (io) {
    io.emit('publisher_unlocked', { publisherId, name: publisher.name });
    io.emit('users_updated');
  }

  res.json({
    message: `Publisher ${publisher.name} has been confirmed and unlocked for new orders!`,
    publisher: updated
  });
});

// Approve or reject payout
router.post('/payouts/:id/resolve', (req, res) => {
  const payoutId = req.params.id;
  const { action, admin_notes } = req.body; // action: 'approve' | 'reject'

  const payout = db.getPayoutRequests().find(p => p.id === payoutId);
  if (!payout) {
    return res.status(404).json({ error: 'Payout request not found' });
  }

  if (payout.status !== 'pending') {
    return res.status(400).json({ error: `Payout is already ${payout.status}.` });
  }

  const worker = db.getUser(payout.worker_id);

  if (action === 'approve') {
    if (worker) {
      const newBal = Math.max(0, +(worker.balance - payout.amount).toFixed(2));
      db.updateUser(worker.id, { balance: newBal });
    }

    const updated = db.updatePayoutRequest(payoutId, {
      status: 'approved',
      resolved_at: new Date().toISOString(),
      admin_notes: admin_notes || 'Approved by Super Boss'
    });

    const io = getIO();
    if (io) io.emit('payout_resolved', updated);

    return res.json({ message: 'Payout approved successfully!', payout: updated });
  } else {
    const updated = db.updatePayoutRequest(payoutId, {
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      admin_notes: admin_notes || 'Rejected by Super Boss'
    });

    const io = getIO();
    if (io) io.emit('payout_resolved', updated);

    return res.json({ message: 'Payout rejected.', payout: updated });
  }
});

// Worker management: Unban / Reset strikes / Reset timeout
router.post('/workers/:id/reset-penalties', (req, res) => {
  const workerId = req.params.id;
  const worker = db.getUser(workerId);

  if (!worker || worker.role !== 'worker') {
    return res.status(404).json({ error: 'Worker not found' });
  }

  const updated = db.updateUser(workerId, {
    consecutive_failures: 0,
    timeout_until: null,
    is_banned: false
  });

  const io = getIO();
  if (io) io.emit('users_updated');

  res.json({ message: `Penalties and strikes reset for ${worker.name}`, worker: updated });
});

// Superadmin generates an L1 Boss Panel Access Key (supports naming the key)
// "allow naming new joinging key but login using the key only"
router.post('/generate-boss-key', (req, res) => {
  const { label, name } = req.body;
  const assignedName = (name || label || '').trim();
  const rand1 = Math.floor(1000 + Math.random() * 9000);
  const rand2 = Math.floor(1000 + Math.random() * 9000);
  const keyStr = `L1-BOSS-${rand1}-${rand2}`;

  const newKey = {
    key: keyStr,
    type: 'l1_boss',
    created_by: 'boss_admin',
    created_by_name: 'Super Boss (Admin)',
    target_role: 'agent',
    assigned_name: assignedName || 'L1 Boss Member',
    label: assignedName || 'L1 Boss Member',
    description: assignedName 
      ? `L1 Boss Panel Key for ${assignedName} (Issued by Superadmin)`
      : 'L1 Boss Panel Key (Issued by Superadmin)',
    created_at: new Date().toISOString(),
    used_by: null,
    used_by_name: null,
    status: 'active'
  };

  db.addKey(newKey);

  const io = getIO();
  if (io) io.emit('keys_updated', { type: 'l1_boss', key: keyStr });

  res.json({
    message: assignedName 
      ? `L1 Boss Key for "${assignedName}" generated successfully!`
      : 'L1 Boss Panel Key generated successfully!',
    key: newKey
  });
});

// Get all L1 Boss keys
router.get('/boss-keys', (req, res) => {
  const allKeys = db.getKeys();
  const bossKeys = allKeys.filter(k => k.type === 'l1_boss' || k.key.startsWith('L1-BOSS-'));
  res.json({ keys: bossKeys });
});

export default router;
