import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function generateMerchantReference(name = 'RobertHooper') {
  const regions = ['Karnataka', 'Maharashtra', 'Delhi', 'TamilNadu', 'Gujarat', 'Telangana'];
  const region = regions[Math.floor(Math.random() * regions.length)];
  const num = Math.floor(10 + Math.random() * 90);
  const cleanName = (name || 'Merchant').replace(/[^a-zA-Z0-9]/g, '');
  const randTag = Math.random().toString(36).substring(2, 7);
  const randHash = Math.random().toString(16).substring(2, 12);
  return `${region}-${num}-${cleanName}${randTag}_outlook.com-${randHash}`;
}

export const DEFAULT_WORKER_DAILY_TIERS = [
  { slot: 1, min: 1, max: 5, rate: 25, unit: 'rs', emoji: '🪙🪙🪙', label: '1-5 scans: 25rs 🪙🪙🪙', title: 'Starter Fleet' },
  { slot: 2, min: 6, max: 10, rate: 28, unit: 'rs', emoji: '💸💸💸', label: '6-10 scans: 28rs 💸💸💸', title: 'Bronze Hustler' },
  { slot: 3, min: 11, max: 20, rate: 38, unit: 'rs', emoji: '💰💰💰', label: '11-20 scans: 38rs 💰💰💰', title: 'Silver Earner' },
  { slot: 4, min: 21, max: 40, rate: 40, unit: 'rs', emoji: '🪎🪎🪎', label: '20+ scans: 40rs 🪎🪎🪎', title: 'Gold Pro Scanner' },
  { slot: 5, min: 41, max: 999999, rate: 42, unit: 'rs', emoji: '🧸🧸🧸', label: '40+ scans: 42rs 🧸🧸🧸', title: 'Diamond Boss Fleet' }
];

const DEFAULT_DB = {
  config: {
    scan_lock_limit: 3, // Block publisher after 3 successful scans until Boss unlocks
    promo_scan_count: 3, // First 3 links promo
    promo_scan_rate: 0.55,
    regular_scan_rate: 0.60,
    default_timer_seconds: 300, // 5 minutes
    worker_payout_per_scan: 25.00, // Default base rate in RS
    worker_daily_rate_tiers: DEFAULT_WORKER_DAILY_TIERS,
    boss_upi_id: "boss@okaxis",
    boss_binance_id: "987654321"
  },
  users: [
    {
      id: "boss_admin",
      role: "boss",
      name: "Super Boss (Admin)",
      balance: 1450.00
    },
    {
      id: "agent_prime",
      role: "agent",
      name: "Alpha Publisher",
      scans_completed_unpaid: 0,
      total_scans: 0,
      total_spent: 0.00,
      is_locked: false,
      unlock_requested: false,
      unlock_request_note: ""
    },
    {
      id: "agent_beta",
      role: "agent",
      name: "Beta Merchant",
      scans_completed_unpaid: 0,
      total_scans: 0,
      total_spent: 0.00,
      is_locked: false,
      unlock_requested: false,
      unlock_request_note: ""
    },
    {
      id: "worker_alex",
      role: "worker",
      name: "Alex (Main Worker L1)",
      level: 1,
      parent_id: null,
      balance: 18.40,
      consecutive_failures: 0,
      timeout_until: null,
      is_banned: false,
      total_personal_completed: 12,
      total_team_completed: 28
    },
    {
      id: "worker_leo",
      role: "worker",
      name: "Leo (Sub-worker L2)",
      level: 2,
      parent_id: "worker_alex",
      balance: 0.00,
      consecutive_failures: 0,
      timeout_until: null,
      is_banned: false,
      total_personal_completed: 9,
      total_team_completed: 9
    },
    {
      id: "worker_sam",
      role: "worker",
      name: "Sam (Sub-worker L3)",
      level: 3,
      parent_id: "worker_leo",
      balance: 0.00,
      consecutive_failures: 0,
      timeout_until: null,
      is_banned: false,
      total_personal_completed: 7,
      total_team_completed: 7
    }
  ],
  orders: [
    {
      id: "ord_init_001",
      merchant_reference: "Karnataka-97-RobertHooper23936yAY_outlook.com-f81ed8516d",
      publisher_id: "agent_prime",
      publisher_name: "Alpha Publisher",
      upi_link: "upi://pay?pa=merchant88@okicici&pn=AlphaStore&am=150.00&cu=INR",
      duration_seconds: 300,
      rate: 0.55,
      status: "success",
      claimed_by: "worker_alex",
      claimed_by_name: "Alex (Main Worker L1)",
      claimed_by_level: 1,
      claimed_by_parent_id: null,
      worker_status: "success",
      created_at: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
      claimed_at: new Date(Date.now() - 3600 * 1000 * 4 + 10000).toISOString(),
      worker_completed_at: new Date(Date.now() - 3600 * 1000 * 4 + 45000).toISOString(),
      confirmed_at: new Date(Date.now() - 3600 * 1000 * 4 + 55000).toISOString(),
      expires_at: new Date(Date.now() - 3600 * 1000 * 4 + 300000).toISOString()
    },
    {
      id: "ord_init_002",
      merchant_reference: "Maharashtra-42-QuickPayHDFC91aK_outlook.com-c92a10b42f",
      publisher_id: "agent_prime",
      publisher_name: "Alpha Publisher",
      upi_link: "upi://pay?pa=quickpay@hdfcbank&pn=AlphaDigital&am=99.00&cu=INR",
      duration_seconds: 300,
      rate: 0.55,
      status: "trial_not_activated",
      claimed_by: "worker_leo",
      claimed_by_name: "Leo (Sub-worker L2)",
      claimed_by_level: 2,
      claimed_by_parent_id: "worker_alex",
      worker_status: "failed",
      created_at: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      claimed_at: new Date(Date.now() - 3600 * 1000 * 2 + 15000).toISOString(),
      worker_completed_at: new Date(Date.now() - 3600 * 1000 * 2 + 80000).toISOString(),
      confirmed_at: new Date(Date.now() - 3600 * 1000 * 2 + 90000).toISOString(),
      expires_at: new Date(Date.now() - 3600 * 1000 * 2 + 300000).toISOString()
    },
    {
      id: "ord_init_003",
      merchant_reference: "Delhi-15-TimeoutPaytm83nB_outlook.com-7a33ef921c",
      publisher_id: "agent_prime",
      publisher_name: "Alpha Publisher",
      upi_link: "upi://pay?pa=timeout@paytm&pn=AlphaOnline&am=25.00&cu=INR",
      duration_seconds: 180,
      rate: 0.55,
      status: "expired",
      claimed_by: null,
      claimed_by_name: null,
      claimed_by_level: null,
      claimed_by_parent_id: null,
      worker_status: "none",
      created_at: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
      claimed_at: null,
      worker_completed_at: null,
      confirmed_at: null,
      expires_at: new Date(Date.now() - 3600 * 1000 * 6 + 180000).toISOString()
    }
  ],
  subworker_keys: [
    {
      key: "L1-BOSS-DEMO-991",
      type: "l1_boss",
      created_by: "boss_admin",
      created_by_name: "Super Boss (Admin)",
      target_role: "agent",
      created_at: new Date(Date.now() - 86400 * 1000 * 1).toISOString(),
      used_by: null,
      status: "active"
    },
    {
      key: "L2-WORKER-DEMO-442",
      type: "l2_worker",
      created_by: "agent_prime",
      created_by_name: "Alpha Publisher",
      target_role: "worker",
      created_at: new Date(Date.now() - 86400 * 1000 * 1).toISOString(),
      used_by: null,
      status: "active"
    },
    {
      key: "KEY-ALEX-771",
      type: "subworker",
      created_by: "worker_alex",
      created_by_name: "Alex (Main Worker L1)",
      target_level: 2,
      created_at: new Date(Date.now() - 86400 * 1000 * 3).toISOString(),
      used_by: "worker_leo",
      status: "used"
    },
    {
      key: "KEY-LEO-992",
      type: "subworker",
      created_by: "worker_leo",
      created_by_name: "Leo (Sub-worker L2)",
      target_level: 3,
      created_at: new Date(Date.now() - 86400 * 1000 * 2).toISOString(),
      used_by: "worker_sam",
      status: "used"
    }
  ],
  payout_requests: [
    {
      id: "payout_001",
      worker_id: "worker_alex",
      worker_name: "Alex (Main Worker L1)",
      worker_level: 1,
      amount: 15.00,
      method: "upi",
      upi_id: "alex@upi",
      beneficiary_name: "Alex Kumar",
      qr_code_url: "/uploads/sample_qr.png",
      binance_id: null,
      status: "approved",
      created_at: new Date(Date.now() - 86400 * 1000 * 1).toISOString(),
      resolved_at: new Date(Date.now() - 86400 * 1000 * 1 + 3600000).toISOString(),
      admin_notes: "Processed via UPI auto-payout"
    }
  ],
  appeals: [],
  messages: []
};

class Database {
  constructor() {
    this.data = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        if (!this.data.subworker_keys) {
          this.data.subworker_keys = [];
        }
        if (!this.data.appeals) {
          this.data.appeals = [];
        }
        if (!this.data.messages) {
          this.data.messages = [];
        }
        // Ensure default demo keys exist so they can always be activated
        for (const defKey of DEFAULT_DB.subworker_keys) {
          const exists = this.data.subworker_keys.some(
            k => k.key && k.key.trim().toUpperCase() === defKey.key.trim().toUpperCase()
          );
          if (!exists) {
            this.data.subworker_keys.unshift(defKey);
          }
        }
        this.save();
      } else {
        this.data = JSON.parse(JSON.stringify(DEFAULT_DB));
        this.save();
      }
    } catch (err) {
      console.error("Error reading database file, resetting to default:", err);
      this.data = JSON.parse(JSON.stringify(DEFAULT_DB));
      this.save();
    }
  }

  save() {
    try {
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error("Error saving database file:", err);
    }
  }

  getConfig() {
    return this.data.config;
  }

  updateConfig(updates) {
    this.data.config = { ...this.data.config, ...updates };
    this.save();
    return this.data.config;
  }

  getUsers() {
    return this.data.users;
  }

  getUser(id) {
    return this.data.users.find(u => u.id === id);
  }

  updateUser(id, updates) {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx !== -1) {
      this.data.users[idx] = { ...this.data.users[idx], ...updates };
      this.save();
      return this.data.users[idx];
    }
    return null;
  }

  addUser(user) {
    this.data.users.push(user);
    this.save();
    return user;
  }

  getOrders() {
    return this.data.orders;
  }

  getOrder(id) {
    return this.data.orders.find(o => o.id === id);
  }

  addOrder(order) {
    this.data.orders.unshift(order);
    this.save();
    return order;
  }

  updateOrder(id, updates) {
    const idx = this.data.orders.findIndex(o => o.id === id);
    if (idx !== -1) {
      this.data.orders[idx] = { ...this.data.orders[idx], ...updates };
      this.save();
      return this.data.orders[idx];
    }
    return null;
  }

  getKeys() {
    return this.data.subworker_keys;
  }

  addKey(keyObj) {
    this.data.subworker_keys.unshift(keyObj);
    this.save();
    return keyObj;
  }

  getKey(key) {
    if (!key || typeof key !== 'string') return null;
    const clean = key.trim().toUpperCase();
    return this.data.subworker_keys.find(k => k.key && k.key.trim().toUpperCase() === clean);
  }

  updateKey(key, updates) {
    if (!key) return null;
    const clean = key.trim().toUpperCase();
    const idx = this.data.subworker_keys.findIndex(k => k.key && k.key.trim().toUpperCase() === clean);
    if (idx !== -1) {
      this.data.subworker_keys[idx] = { ...this.data.subworker_keys[idx], ...updates };
      this.save();
      return this.data.subworker_keys[idx];
    }
    return null;
  }

  getPayoutRequests() {
    return this.data.payout_requests;
  }

  addPayoutRequest(req) {
    this.data.payout_requests.unshift(req);
    this.save();
    return req;
  }

  updatePayoutRequest(id, updates) {
    const idx = this.data.payout_requests.findIndex(p => p.id === id);
    if (idx !== -1) {
      this.data.payout_requests[idx] = { ...this.data.payout_requests[idx], ...updates };
      this.save();
      return this.data.payout_requests[idx];
    }
    return null;
  }

  getAppeals() {
    return this.data.appeals || [];
  }

  getAppeal(id) {
    return (this.data.appeals || []).find(a => a.id === id);
  }

  addAppeal(appeal) {
    if (!this.data.appeals) this.data.appeals = [];
    this.data.appeals.unshift(appeal);
    this.save();
    return appeal;
  }

  updateAppeal(id, updates) {
    if (!this.data.appeals) this.data.appeals = [];
    const idx = this.data.appeals.findIndex(a => a.id === id);
    if (idx !== -1) {
      this.data.appeals[idx] = { ...this.data.appeals[idx], ...updates };
      this.save();
      return this.data.appeals[idx];
    }
    return null;
  }

  getMessages() {
    return this.data.messages || [];
  }

  getMessage(id) {
    return (this.data.messages || []).find(m => m.id === id);
  }

  addMessage(msg) {
    if (!this.data.messages) this.data.messages = [];
    this.data.messages.unshift(msg);
    this.save();
    return msg;
  }

  updateMessage(id, updates) {
    if (!this.data.messages) this.data.messages = [];
    const idx = this.data.messages.findIndex(m => m.id === id);
    if (idx !== -1) {
      this.data.messages[idx] = { ...this.data.messages[idx], ...updates };
      this.save();
      return this.data.messages[idx];
    }
    return null;
  }

  markMessageRead(id) {
    return this.updateMessage(id, { is_read: true, read_at: new Date().toISOString() });
  }

  /**
   * Get worker daily stats and active tier based on scans completed today
   */
  getWorkerDailyStats(workerId) {
    const config = this.getConfig();
    const tiers = config.worker_daily_rate_tiers || DEFAULT_WORKER_DAILY_TIERS;
    const todayStr = new Date().toISOString().slice(0, 10);
    const orders = this.getOrders();

    const todayOrders = orders.filter(o => {
      if (o.claimed_by !== workerId) return false;
      if (o.status !== 'success') return false;
      const orderDate = (o.confirmed_at || o.created_at || '').slice(0, 10);
      return orderDate === todayStr;
    });

    const todayCount = todayOrders.length;
    // Current tier based on completed count today (or slot 1 if 0)
    const effectiveCount = Math.max(1, todayCount);
    const currentTier = tiers.find(t => effectiveCount >= t.min && effectiveCount <= t.max) || tiers[tiers.length - 1];

    const currentTierIdx = tiers.findIndex(t => t.slot === currentTier.slot);
    const nextTier = currentTierIdx < tiers.length - 1 ? tiers[currentTierIdx + 1] : null;
    const scansUntilNextTier = nextTier ? Math.max(0, nextTier.min - todayCount) : 0;

    return {
      workerId,
      todayCount,
      todayDate: todayStr,
      currentTier,
      nextTier,
      scansUntilNextTier,
      rate: currentTier.rate,
      emoji: currentTier.emoji,
      unit: currentTier.unit || 'rs',
      label: currentTier.label,
      tiers
    };
  }

  /**
   * Calculate reward for the next scan that the worker completes
   */
  getRewardForNextScan(workerId) {
    const stats = this.getWorkerDailyStats(workerId);
    const nextCount = stats.todayCount + 1;
    const config = this.getConfig();
    const tiers = config.worker_daily_rate_tiers || DEFAULT_WORKER_DAILY_TIERS;
    const targetTier = tiers.find(t => nextCount >= t.min && nextCount <= t.max) || tiers[tiers.length - 1];

    return {
      nextCount,
      rate: targetTier.rate,
      emoji: targetTier.emoji,
      unit: targetTier.unit || 'rs',
      tier: targetTier
    };
  }

  /**
   * Add warning to a user (worker or agent)
   */
  addWarningToUser(userId, { reason, warned_by = 'Super Boss (Admin)' }) {
    const user = this.getUser(userId);
    if (!user) return null;

    const warningItem = {
      id: 'warn_' + Math.random().toString(36).substring(2, 9),
      reason: reason || 'Violation of platform policies',
      warned_by,
      timestamp: new Date().toISOString()
    };

    const history = user.warnings_history ? [...user.warnings_history] : [];
    history.unshift(warningItem);
    const count = (user.warnings_count || 0) + 1;

    const updated = this.updateUser(userId, {
      warnings_count: count,
      warnings_history: history,
      last_warned_at: warningItem.timestamp
    });

    return { warning: warningItem, user: updated };
  }
}

export const db = new Database();
