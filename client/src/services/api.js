const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : '/api';

export const api = {
  // --- ORDERS ---
  async publishOrder(data) {
    const res = await fetch(`${BASE_URL}/orders/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to publish order');
    return json;
  },

  async claimOrder(orderId, workerId) {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: workerId })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to claim order');
    return json;
  },

  async requestBatchOrders(workerId, count = 3) {
    const res = await fetch(`${BASE_URL}/orders/request-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: workerId, count })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to batch claim orders');
    return json;
  },

  async completeTask(orderId, workerId, result) {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/complete-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: workerId, result })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to complete task');
    return json;
  },

  async confirmOrder(orderId, publisherId, action) {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publisher_id: publisherId, action })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to confirm order');
    return json;
  },

  async manualVerifyOrder(orderId, publisherId, action, notes) {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/manual-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publisher_id: publisherId, action, notes })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to manually verify order');
    return json;
  },

  async undoVerifyOrder(orderId, publisherId, reason) {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/undo-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publisher_id: publisherId, reason })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to undo verification');
    return json;
  },

  async requestManualReview(orderId, workerId, reason) {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/request-manual-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: workerId, reason })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to request manual review');
    return json;
  },

  async getRecentOrders(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE_URL}/orders/recent?${query}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch orders');
    return json;
  },

  // --- APPEALS ---
  async submitAppeal(orderId, workerId, message, extra = {}) {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/appeal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: workerId, message, ...extra })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to submit appeal');
    return json;
  },

  async getAppeals(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE_URL}/orders/appeals/list?${query}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch appeals');
    return json;
  },

  async resolveAppeal(appealId, publisherId, action, agentNotes) {
    const res = await fetch(`${BASE_URL}/orders/appeals/${appealId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publisher_id: publisherId, action, agent_notes: agentNotes })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to resolve appeal');
    return json;
  },

  // --- MESSAGE BOT & FEEDBACK ---
  // User Requirement: "agent reviews and sends him feedback via message bot"
  async getBotMessages(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE_URL}/messages?${query}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch bot messages');
    return json;
  },

  async sendBotMessage(data) {
    const res = await fetch(`${BASE_URL}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to send bot message');
    return json;
  },

  async markBotMessageRead(messageId) {
    const res = await fetch(`${BASE_URL}/messages/${messageId}/read`, {
      method: 'POST'
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to mark message as read');
    return json;
  },

  async markAllBotMessagesRead(recipientId) {
    const res = await fetch(`${BASE_URL}/messages/mark-all-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: recipientId })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to mark all messages read');
    return json;
  },

  // --- WORKERS ---
  async getWorker(workerId) {
    const res = await fetch(`${BASE_URL}/workers/${workerId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch worker');
    return json;
  },

  async generateWorkerKey(workerId) {
    const res = await fetch(`${BASE_URL}/workers/${workerId}/generate-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to generate key');
    return json;
  },

  async registerSubworker(key, name) {
    const res = await fetch(`${BASE_URL}/workers/register-subworker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, name })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to register subworker');
    return json;
  },

  async toggleWorkerStatus(workerId, isOnline) {
    const res = await fetch(`${BASE_URL}/workers/${workerId}/toggle-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_online: isOnline })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to toggle status');
    return json;
  },

  // --- PUBLISHERS ---
  async getPublisher(publisherId) {
    const res = await fetch(`${BASE_URL}/publishers/${publisherId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch publisher');
    return json;
  },

  async requestPublisherUnlock(publisherId, data) {
    const res = await fetch(`${BASE_URL}/publishers/${publisherId}/request-unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to request unlock');
    return json;
  },

  async topupPublisherBalance(publisherId, data) {
    const res = await fetch(`${BASE_URL}/publishers/${publisherId}/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to top up balance');
    return json;
  },

  // --- PAYOUTS ---
  async getPayouts(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE_URL}/payouts?${query}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch payouts');
    return json;
  },

  async requestPayout(formData) {
    const res = await fetch(`${BASE_URL}/payouts/request`, {
      method: 'POST',
      body: formData // FormData for file upload
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to submit payout');
    return json;
  },

  // --- ADMIN / BOSS ---
  async getAdminOverview() {
    const res = await fetch(`${BASE_URL}/admin/overview`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch admin overview');
    return json;
  },

  async updateAdminConfig(configUpdates) {
    const res = await fetch(`${BASE_URL}/admin/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configUpdates)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update config');
    return json;
  },

  async unlockPublisher(publisherId) {
    const res = await fetch(`${BASE_URL}/admin/publishers/${publisherId}/unlock`, {
      method: 'POST'
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to unlock publisher');
    return json;
  },

  async resolvePayout(payoutId, action, admin_notes) {
    const res = await fetch(`${BASE_URL}/admin/payouts/${payoutId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, admin_notes })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to resolve payout');
    return json;
  },

  async resetWorkerPenalties(workerId) {
    const res = await fetch(`${BASE_URL}/admin/workers/${workerId}/reset-penalties`, {
      method: 'POST'
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to reset worker penalties');
    return json;
  },

  async generateBossKey(label = '') {
    const res = await fetch(`${BASE_URL}/admin/generate-boss-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, name: label })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to generate L1 Boss key');
    return json;
  },

  async getAdminBossKeys() {
    const res = await fetch(`${BASE_URL}/admin/boss-keys`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch L1 Boss keys');
    return json;
  },

  // --- L1 BOSS / WORKER KEYS & TEAM ---
  async generateL2WorkerKey(publisherId, label = '') {
    const res = await fetch(`${BASE_URL}/publishers/${publisherId}/generate-worker-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, name: label })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to generate L2 Worker key');
    return json;
  },

  async setPublisherWorkerRate(publisherId, workerRate) {
    const res = await fetch(`${BASE_URL}/publishers/${publisherId}/worker-rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_rate: workerRate })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update worker rate');
    return json;
  },

  async getPublisherWorkerKeys(publisherId) {
    const res = await fetch(`${BASE_URL}/publishers/${publisherId}/worker-keys`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch worker keys');
    return json;
  },

  async getPublisherWorkers(publisherId) {
    const res = await fetch(`${BASE_URL}/publishers/${publisherId}/team-workers`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch team workers');
    return json;
  },

  // --- AUTH / REDEEM KEY (Key-only or optional name) ---
  async redeemKey(key, name = '') {
    const res = await fetch(`${BASE_URL}/auth/redeem-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, name: name || undefined })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to redeem invitation key');
    return json;
  },

  // --- TELEGRAM BOT & PRIORITY QUEUE ---
  async getTelegramStatus() {
    const res = await fetch(`${BASE_URL}/telegram/status`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch Telegram status');
    return json;
  },

  async updateTelegramConfig(data) {
    const res = await fetch(`${BASE_URL}/telegram/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update Telegram config');
    return json;
  },

  async getWorkerPriorityMetrics(workerId) {
    const res = await fetch(`${BASE_URL}/telegram/metrics/${workerId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch worker priority metrics');
    return json;
  },

  async startTelegramRadar(workerId, chatId, durationSeconds = 300) {
    const res = await fetch(`${BASE_URL}/telegram/radar/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: workerId, chat_id: chatId, duration_seconds: durationSeconds })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to start radar session');
    return json;
  },

  async stopTelegramRadar(workerId) {
    const res = await fetch(`${BASE_URL}/telegram/radar/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: workerId })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to stop radar session');
    return json;
  },

  async sendTelegramSimulatedUpdate(update) {
    const res = await fetch(`${BASE_URL}/telegram/test-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to send test webhook');
    return json;
  }
};
