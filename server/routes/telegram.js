import express from 'express';
import { db } from '../db.js';
import { telegramBotService } from '../telegram/botHandlers.js';
import { priorityQueue } from '../telegram/priorityQueue.js';

const router = express.Router();

/**
 * GET /api/telegram/status
 * Check Telegram Bot health, polling status, and active radar sessions
 */
router.get('/status', (req, res) => {
  const config = db.getConfig();
  const allUsers = db.getUsers();
  const linkedWorkers = allUsers.filter(u => u.role === 'worker' && u.telegram_chat_id);
  const queueStatus = priorityQueue.getStatus();

  res.json({
    status: 'online',
    has_token: telegramBotService.client.hasToken(),
    token_preview: config.telegram_bot_token ? `${config.telegram_bot_token.substring(0, 8)}...` : null,
    is_polling: telegramBotService.client.isPolling,
    linked_workers_count: linkedWorkers.length,
    linked_workers: linkedWorkers.map(w => ({
      id: w.id,
      name: w.name,
      chat_id: w.telegram_chat_id,
      is_online: w.is_online,
      is_scanning_radar_active: priorityQueue.isSessionActive(w.id),
      radar_remaining_seconds: priorityQueue.getRemainingSeconds(w.id),
      metrics: priorityQueue.calculateWorkerMetrics(w.id)
    })),
    priority_queue: queueStatus
  });
});

/**
 * POST /api/telegram/config
 * Save Telegram Bot Token and settings in database configuration
 */
router.post('/config', (req, res) => {
  const { token, min_scans_required, session_duration_seconds } = req.body;

  const currentConfig = db.getConfig();
  const updates = {};

  if (token !== undefined) {
    updates.telegram_bot_token = token.trim();
    telegramBotService.setToken(token.trim());

    // If valid token provided and not polling yet, start polling
    if (telegramBotService.client.hasToken() && !telegramBotService.client.isPolling) {
      telegramBotService.client.startPolling((update) => {
        telegramBotService.handleUpdate(update);
      });
    }
  }

  if (min_scans_required !== undefined) {
    updates.telegram_min_scans_priority = parseInt(min_scans_required, 10) || 5;
  }

  if (session_duration_seconds !== undefined) {
    updates.telegram_session_duration = parseInt(session_duration_seconds, 10) || 300;
  }

  const updatedConfig = db.updateConfig(updates);

  res.json({
    message: 'Telegram Bot configuration updated successfully',
    config: updatedConfig,
    has_token: telegramBotService.client.hasToken(),
    is_polling: telegramBotService.client.isPolling
  });
});

/**
 * POST /api/telegram/test-webhook
 * Test simulator allowing automated scripts or testing tools to send simulated
 * Telegram updates (messages, button callbacks) directly to the bot.
 */
router.post('/test-webhook', async (req, res) => {
  try {
    const update = req.body.update || req.body;
    await telegramBotService.handleUpdate(update);
    res.json({ success: true, message: 'Update handled by Telegram bot service' });
  } catch (err) {
    console.error('[telegramRouter] test-webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/telegram/radar/start
 * Allow triggering a radar session for a worker via API
 */
router.post('/radar/start', (req, res) => {
  const { worker_id, chat_id, duration_seconds } = req.body;
  const worker = db.getUser(worker_id);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  const session = priorityQueue.startScanningSession(
    worker_id,
    chat_id || worker.telegram_chat_id || 123456789,
    duration_seconds || 300
  );

  const metrics = priorityQueue.calculateWorkerMetrics(worker_id);

  res.json({
    message: '5-minute scanning radar started successfully',
    session,
    metrics
  });
});

/**
 * POST /api/telegram/radar/stop
 * Allow stopping a radar session
 */
router.post('/radar/stop', (req, res) => {
  const { worker_id } = req.body;
  const session = priorityQueue.stopScanningSession(worker_id, true);
  res.json({ message: 'Scanning radar stopped', session });
});

/**
 * GET /api/telegram/metrics/:workerId
 * Get worker's success rate, scans count, and priority queue eligibility
 */
router.get('/metrics/:workerId', (req, res) => {
  const metrics = priorityQueue.calculateWorkerMetrics(req.params.workerId);
  if (!metrics) return res.status(404).json({ error: 'Worker not found' });
  res.json({ metrics });
});

export default router;
