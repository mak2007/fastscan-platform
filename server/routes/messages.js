import express from 'express';
import { db } from '../db.js';
import { getIO } from '../sockets/socketHandler.js';
import { telegramBotService } from '../telegram/botHandlers.js';

const router = express.Router();

// 1. Get messages for worker or agent
router.get('/', (req, res) => {
  const { recipient_id, order_id } = req.query;
  let allMessages = db.getMessages();

  if (recipient_id) {
    allMessages = allMessages.filter(m => m.recipient_id === recipient_id);
  }
  if (order_id) {
    allMessages = allMessages.filter(m => m.order_id === order_id);
  }

  const unreadCount = allMessages.filter(m => !m.is_read).length;

  res.json({
    messages: allMessages,
    unread_count: unreadCount
  });
});

// 2. Send Message Bot dispatch (Agent to Worker or System Bot)
router.post('/send', (req, res) => {
  const {
    recipient_id,
    agent_id,
    order_id,
    appeal_id,
    title,
    content,
    status = 'info',
    type = 'agent_feedback'
  } = req.body;

  if (!recipient_id || !content) {
    return res.status(400).json({ error: 'recipient_id and content are required' });
  }

  const recipient = db.getUser(recipient_id);
  const agent = agent_id ? db.getUser(agent_id) : null;
  const order = order_id ? db.getOrder(order_id) : null;
  const now = new Date().toISOString();

  const msgId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  const messageRecord = {
    id: msgId,
    type,
    sender_type: 'bot',
    bot_name: 'FastScan Message Bot',
    agent_id: agent_id || null,
    agent_name: agent ? agent.name : 'System Agent',
    recipient_id,
    recipient_name: recipient ? recipient.name : 'Worker',
    order_id: order_id || null,
    merchant_reference: order ? order.merchant_reference : null,
    appeal_id: appeal_id || null,
    status, // 'approved' | 'rejected' | 'info' | 'disputed'
    title: title || `Feedback from ${agent ? agent.name : 'Agent'} on Order #${order_id || 'Task'}`,
    content: content.trim(),
    created_at: now,
    is_read: false,
    read_at: null
  };

  db.addMessage(messageRecord);

  const io = getIO();
  if (io) {
    io.emit('bot_message_received', messageRecord);
  }

  try {
    telegramBotService.forwardBotMessage(messageRecord);
  } catch (err) {
    console.error('[messages] Error forwarding to Telegram:', err.message);
  }

  res.status(201).json({
    message: 'Feedback message dispatched via Message Bot!',
    bot_message: messageRecord
  });
});

// 3. Mark message as read
router.post('/:id/read', (req, res) => {
  const updated = db.markMessageRead(req.params.id);
  if (!updated) {
    return res.status(404).json({ error: 'Message not found' });
  }
  res.json({ message: 'Marked as read', bot_message: updated });
});

// 4. Mark all messages read for recipient
router.post('/mark-all-read', (req, res) => {
  const { recipient_id } = req.body;
  if (!recipient_id) {
    return res.status(400).json({ error: 'recipient_id required' });
  }

  const allMessages = db.getMessages();
  const now = new Date().toISOString();
  let updatedCount = 0;

  for (const m of allMessages) {
    if (m.recipient_id === recipient_id && !m.is_read) {
      db.updateMessage(m.id, { is_read: true, read_at: now });
      updatedCount++;
    }
  }

  res.json({ message: `Marked ${updatedCount} messages as read`, updated_count: updatedCount });
});

export default router;
