import express from 'express';
import { db } from '../db.js';
import { getIO } from '../sockets/socketHandler.js';

const router = express.Router();

// Universal Key Redemption:
// Superadmin issues L1 Boss key -> user enters key -> gets L1 Boss Panel.
// L1 Boss issues L2 Worker key -> user enters key -> gets L2 Worker Panel.
router.post('/redeem-key', (req, res) => {
  const { key, name, user_name } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Invite key is required to log in.' });
  }

  const normalizedKey = key.trim().toUpperCase();
  const keyRecord = db.getKey(normalizedKey);

  if (!keyRecord) {
    return res.status(404).json({ error: 'Invalid invitation key. Please check the code and try again.' });
  }

  // If key was already redeemed, allow logging back in with this key!
  if (keyRecord.status === 'used' && keyRecord.used_by && !normalizedKey.includes('DEMO')) {
    const existingUser = db.getUser(keyRecord.used_by);
    if (existingUser) {
      return res.json({
        message: `Welcome back, ${existingUser.name}! Logged in successfully using key.`,
        role: existingUser.role,
        panel_tier: existingUser.panel_tier || (keyRecord.type === 'l1_boss' ? 'L1' : 'L2'),
        user: existingUser
      });
    }
  }

  // Resolve user name: custom name passed OR pre-assigned name from key creation OR role default
  const resolvedName = (name || user_name || keyRecord.assigned_name || keyRecord.label || (keyRecord.type === 'l1_boss' ? 'L1 Boss' : 'L2 Worker')).trim();
  const cleanName = resolvedName;
  const now = new Date().toISOString();
  const io = getIO();

  // 1. L1 BOSS KEY (Issued by Superadmin)
  if (keyRecord.type === 'l1_boss' || normalizedKey.startsWith('L1-BOSS-')) {
    const newBossId = `agent_${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`;
    const newBoss = {
      id: newBossId,
      role: 'agent',
      panel_tier: 'L1',
      name: `${cleanName} (L1 Boss)`,
      scans_completed_unpaid: 0,
      total_scans: 0,
      total_spent: 0.00,
      is_locked: false,
      unlock_requested: false,
      unlock_request_note: '',
      created_at: now
    };

    db.addUser(newBoss);
    db.updateKey(keyRecord.key, {
      used_by: newBoss.id,
      used_by_name: newBoss.name,
      status: 'used',
      used_at: now
    });

    if (io) {
      io.emit('users_updated');
      io.emit('keys_updated');
    }

    return res.json({
      message: 'L1 Boss Panel activated successfully! You can now publish links, manually verify orders, and recruit L2 workers.',
      role: 'agent',
      panel_tier: 'L1',
      user: newBoss
    });
  }

  // 2. L2 WORKER KEY (Issued by L1 Boss)
  if (keyRecord.type === 'l2_worker' || normalizedKey.startsWith('L2-WORKER-') || keyRecord.type === 'subworker' || normalizedKey.startsWith('SUB-')) {
    const newWorkerId = `worker_${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`;
    const newWorker = {
      id: newWorkerId,
      role: 'worker',
      panel_tier: 'L2',
      name: `${cleanName} (L2 Worker)`,
      level: keyRecord.target_level || 2,
      parent_id: keyRecord.created_by,
      balance: 0.00,
      consecutive_failures: 0,
      timeout_until: null,
      is_banned: false,
      total_personal_completed: 0,
      total_team_completed: 0,
      is_online: true,
      created_at: now
    };

    db.addUser(newWorker);
    db.updateKey(keyRecord.key, {
      used_by: newWorker.id,
      used_by_name: newWorker.name,
      status: 'used',
      used_at: now
    });

    if (io) {
      io.emit('users_updated');
      io.emit('keys_updated');
    }

    return res.json({
      message: 'L2 Worker Panel activated successfully! You are now in the UPI Scan task hall.',
      role: 'worker',
      panel_tier: 'L2',
      user: newWorker
    });
  }

  return res.status(400).json({ error: 'Unrecognized key type.' });
});

export default router;
