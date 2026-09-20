import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { soundFX } from '../components/AudioChime.js';
import { 
  ShieldCheck, 
  Settings, 
  Unlock, 
  CheckCircle2, 
  XCircle, 
  DollarSign, 
  Clock, 
  Users, 
  Send, 
  ExternalLink, 
  RefreshCw, 
  Flame, 
  QrCode, 
  Wallet,
  AlertTriangle,
  Lock,
  Search,
  Key,
  Copy,
  Check,
  Bot,
  Radio,
  Zap
} from 'lucide-react';

export default function BossPanel({ soundEnabled }) {
  const [overview, setOverview] = useState(null);
  const [activeTab, setActiveTab] = useState('publishers'); // 'publishers' | 'links' | 'payouts' | 'workers' | 'settings'
  const [isLoading, setIsLoading] = useState(true);

  // Search in links
  const [linkSearch, setLinkSearch] = useState('');
  const [linkFilterStatus, setLinkFilterStatus] = useState('all');

  // Settings state
  const [scanLockLimit, setScanLockLimit] = useState(3);
  const [promoScanCount, setPromoScanCount] = useState(3);
  const [promoRate, setPromoRate] = useState(0.55);
  const [regularRate, setRegularRate] = useState(0.60);
  const [defaultTimerSeconds, setDefaultTimerSeconds] = useState(300);
  const [bossUpiId, setBossUpiId] = useState('boss@okaxis');
  const [bossBinanceId, setBossBinanceId] = useState('987654321');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // L1 Boss Key Issuance State
  const [bossKeys, setBossKeys] = useState([]);
  const [newBossKeyLabel, setNewBossKeyLabel] = useState('');
  const [isGeneratingBossKey, setIsGeneratingBossKey] = useState(false);
  const [generatedBossKeyToast, setGeneratedBossKeyToast] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  // Telegram Bot & Priority Radar state
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramMinScans, setTelegramMinScans] = useState(5);
  const [telegramDuration, setTelegramDuration] = useState(300);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);

  const loadTelegramStatus = async () => {
    try {
      const res = await api.getTelegramStatus();
      setTelegramStatus(res);
    } catch (err) {
      console.error("Failed to load telegram status", err);
    }
  };

  const loadBossKeys = async () => {
    try {
      const res = await api.getAdminBossKeys();
      setBossKeys(res.keys || []);
    } catch (err) {
      console.error("Failed to load boss keys", err);
    }
  };

  const loadOverview = async () => {
    try {
      setIsLoading(true);
      const data = await api.getAdminOverview();
      setOverview(data);
      loadBossKeys();
      loadTelegramStatus();
      if (data.config) {
        setScanLockLimit(data.config.scan_lock_limit || 3);
        setPromoScanCount(data.config.promo_scan_count || 3);
        setPromoRate(data.config.promo_scan_rate || 0.55);
        setRegularRate(data.config.regular_scan_rate || 0.60);
        setDefaultTimerSeconds(data.config.default_timer_seconds || 300);
        setBossUpiId(data.config.boss_upi_id || 'boss@okaxis');
        setBossBinanceId(data.config.boss_binance_id || '987654321');
        if (data.config.telegram_bot_token) setTelegramToken(data.config.telegram_bot_token);
        if (data.config.telegram_min_scans_priority) setTelegramMinScans(data.config.telegram_min_scans_priority);
        if (data.config.telegram_session_duration) setTelegramDuration(data.config.telegram_session_duration);
      }
    } catch (err) {
      console.error("Failed to load admin overview", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    loadBossKeys();
    loadTelegramStatus();
    const interval = setInterval(() => {
      loadOverview();
      loadBossKeys();
      loadTelegramStatus();
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerateBossKey = async () => {
    try {
      setIsGeneratingBossKey(true);
      const res = await api.generateBossKey(newBossKeyLabel.trim());
      setGeneratedBossKeyToast(res.key);
      setNewBossKeyLabel('');
      if (soundEnabled) soundFX.playSuccessChime();
      loadBossKeys();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsGeneratingBossKey(false);
    }
  };

  // Unlock Publisher
  const handleUnlockPublisher = async (pubId) => {
    try {
      const res = await api.unlockPublisher(pubId);
      alert(res.message);
      if (soundEnabled) soundFX.playSuccessChime();
      loadOverview();
    } catch (err) {
      alert(err.message);
    }
  };

  // Resolve Payout
  const handleResolvePayout = async (payoutId, action) => {
    try {
      const res = await api.resolvePayout(payoutId, action, `Processed by Boss on ${new Date().toLocaleTimeString()}`);
      alert(res.message);
      if (action === 'approve') {
        if (soundEnabled) soundFX.playSuccessChime();
      }
      loadOverview();
    } catch (err) {
      alert(err.message);
    }
  };

  // Reset Worker Strikes & Timeout
  const handleResetWorker = async (workerId) => {
    try {
      const res = await api.resetWorkerPenalties(workerId);
      alert(res.message);
      if (soundEnabled) soundFX.playSuccessChime();
      loadOverview();
    } catch (err) {
      alert(err.message);
    }
  };

  // Save Settings
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      setIsSavingSettings(true);
      await api.updateAdminConfig({
        scan_lock_limit: scanLockLimit,
        promo_scan_count: promoScanCount,
        promo_scan_rate: promoRate,
        regular_scan_rate: regularRate,
        default_timer_seconds: defaultTimerSeconds,
        boss_upi_id: bossUpiId,
        boss_binance_id: bossBinanceId
      });
      alert('Platform configuration saved successfully!');
      if (soundEnabled) soundFX.playSuccessChime();
      loadOverview();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Save Telegram Bot Config
  const handleSaveTelegramConfig = async (e) => {
    e.preventDefault();
    try {
      setIsSavingTelegram(true);
      await api.updateTelegramConfig({
        token: telegramToken,
        min_scans_required: telegramMinScans,
        session_duration_seconds: telegramDuration
      });
      alert('Telegram Bot & Priority Queue configuration saved!');
      if (soundEnabled) soundFX.playSuccessChime();
      loadTelegramStatus();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const publishers = overview?.users?.filter(u => u.role === 'agent') || [];
  const workers = overview?.users?.filter(u => u.role === 'worker') || [];
  const orders = overview?.orders || [];
  const payouts = overview?.payouts || [];

  const filteredOrders = orders.filter(o => {
    const matchesFilter = linkFilterStatus === 'all' || o.status === linkFilterStatus;
    const matchesSearch = !linkSearch || 
      o.upi_link?.toLowerCase().includes(linkSearch.toLowerCase()) ||
      o.publisher_name?.toLowerCase().includes(linkSearch.toLowerCase()) ||
      o.id?.toLowerCase().includes(linkSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* 1. Header & Quick Overview KPI Cards */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            Super Boss Command Center
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Global controls for publisher unlock, link audits, payout releases, and penalty management
          </p>
        </div>
        <button
          onClick={loadOverview}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold border border-slate-700 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh All Data</span>
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Total Scans</span>
          <span className="text-xl font-bold text-white font-mono">{overview?.stats?.totalOrders || 0}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold block">Successful</span>
          <span className="text-xl font-bold text-emerald-400 font-mono">{overview?.stats?.successOrders || 0}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Expired</span>
          <span className="text-xl font-bold text-slate-400 font-mono">{overview?.stats?.expiredOrders || 0}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold block">Trial Failed</span>
          <span className="text-xl font-bold text-rose-400 font-mono">{overview?.stats?.trialNotActivatedOrders || 0}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold block">Pending Payouts</span>
          <span className="text-xl font-bold text-amber-400 font-mono">{overview?.stats?.pendingPayoutsCount || 0}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold block">Online Presence</span>
          <span className="text-xs text-white font-mono mt-1 block">
            {overview?.stats?.onlineWorkers || 0}W / {overview?.stats?.onlinePublishers || 0}P
          </span>
        </div>
      </div>

      {/* 2. Admin Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('boss_keys')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'boss_keys'
              ? 'bg-[#bbf246] text-black shadow-md shadow-[#bbf246]/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Issue L1 Boss Keys ({bossKeys.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('publishers')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'publishers'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Unlock className="w-4 h-4" />
          <span>Publishers & Unlocks ({publishers.filter(p => p.is_locked || (p.scans_completed_unpaid || 0) >= (overview?.config?.scan_lock_limit || 3)).length})</span>
        </button>

        <button
          onClick={() => setActiveTab('links')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'links'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Audit All Submitted Links ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('payouts')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'payouts'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Payout Requests ({payouts.filter(p => p.status === 'pending').length})</span>
        </button>

        <button
          onClick={() => setActiveTab('workers')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'workers'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Workers & Strikes</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'settings'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Platform Pricing & Limits</span>
        </button>

        <button
          onClick={() => setActiveTab('telegram')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'telegram'
              ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Bot className="w-4 h-4 text-sky-300" />
          <span>Telegram Bot & Priority Radar ({telegramStatus?.linked_workers_count || 0})</span>
        </button>
      </div>

      {/* TAB: ISSUE L1 BOSS KEYS (USER REQUIREMENT) */}
      {/* "ensure if im giving someone a key its a boss panel so i superadmin look take referance build according to it only" */}
      {activeTab === 'boss_keys' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-[#bbf246]" />
                  Issue L1 Boss Panel Keys
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  When you give someone a key generated here, they activate an <strong>L1 Boss Panel</strong> with publishing, manual verification, and worker recruitment rights.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Boss/Publisher Name (e.g. Rahul Merchant)"
                  value={newBossKeyLabel}
                  onChange={(e) => setNewBossKeyLabel(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#bbf246] w-48 sm:w-56"
                />
                <button
                  onClick={handleGenerateBossKey}
                  disabled={isGeneratingBossKey}
                  className="px-4 py-2 rounded-xl bg-[#bbf246] hover:bg-[#a3e635] text-black font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-[#bbf246]/10 shrink-0 transition-all active:scale-95"
                >
                  <Key className="w-4 h-4" />
                  <span>{isGeneratingBossKey ? 'Generating...' : 'Issue Named L1 Key'}</span>
                </button>
              </div>
            </div>

            {/* Toast notice for newly generated key */}
            {generatedBossKeyToast && (
              <div className="bg-[#152e2a] border border-[#2dd4bf]/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#2dd4bf] block">New L1 Boss Key Ready to Share</span>
                  <span className="text-lg font-mono font-black text-white">{generatedBossKeyToast.key}</span>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {generatedBossKeyToast.assigned_name ? (
                      <>Assigned to: <strong className="text-white">{generatedBossKeyToast.assigned_name}</strong>. Publisher can log in using <strong>key only</strong>.</>
                    ) : (
                      <>Share this key with the new publisher. When they redeem it, they become an L1 Boss.</>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedBossKeyToast.key);
                    setCopiedKey(generatedBossKeyToast.key);
                    setTimeout(() => setCopiedKey(null), 2000);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#2dd4bf] text-black font-bold text-xs"
                >
                  {copiedKey === generatedBossKeyToast.key ? 'Copied to Clipboard!' : 'Copy L1 Key'}
                </button>
              </div>
            )}

            {/* Issued L1 Boss Keys Table */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 block">All Issued L1 Boss Keys ({bossKeys.length})</span>
              {bossKeys.length === 0 ? (
                <div className="bg-slate-950 rounded-xl p-6 text-center text-xs text-slate-500">
                  No L1 Boss keys issued yet. Click "Generate New L1 Boss Key" above.
                </div>
              ) : (
                <div className="space-y-2">
                  {bossKeys.map(k => (
                    <div
                      key={k.key}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-white">{k.key}</span>
                          <span className="text-slate-300 font-medium">({k.assigned_name || k.label || 'Unlabeled'})</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            k.status === 'used' ? 'bg-slate-800 text-slate-400' : 'bg-[#152e2a] text-[#2dd4bf]'
                          }`}>
                            {k.status === 'used' ? 'REDEEMED' : 'ACTIVE & UNUSED'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {k.status === 'used' 
                            ? `Redeemed by: ${k.used_by_name || k.used_by}` 
                            : `Issued on ${new Date(k.created_at).toLocaleDateString()} - Ready to activate L1 Boss account`}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(k.key);
                          setCopiedKey(k.key);
                          setTimeout(() => setCopiedKey(null), 2000);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1 self-end sm:self-auto"
                      >
                        {copiedKey === k.key ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === k.key ? 'Copied' : 'Copy Key'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB: PUBLISHERS MANAGEMENT & UNLOCK */}
      {/* "show them please pay for current orders and then i confirm and unlock him okay" */}
      {activeTab === 'publishers' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Unlock className="w-5 h-5 text-amber-400" />
                Publisher Accounts & Scan Limits
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                When a publisher reaches {overview?.config?.scan_lock_limit || 3} scans, they are blocked until you verify payment and click Unlock.
              </p>
            </div>

            <div className="space-y-3">
              {publishers.map((pub) => {
                const unpaid = pub.scans_completed_unpaid || 0;
                const lockLimit = overview?.config?.scan_lock_limit || 3;
                const isLocked = pub.is_locked || unpaid >= lockLimit;

                return (
                  <div
                    key={pub.id}
                    className={`border rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
                      isLocked
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{pub.name}</h4>
                        <span className="text-xs font-mono text-slate-400">({pub.id})</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isLocked ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {isLocked ? 'LOCKED (Dues Pending)' : 'ACTIVE'}
                        </span>
                        {pub.unlock_requested && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold animate-pulse">
                            Unlock Requested!
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
                        <span>Unpaid Completed: <strong className={isLocked ? 'text-rose-400' : 'text-white'}>{unpaid} / {lockLimit}</strong></span>
                        <span>•</span>
                        <span>Total Scans: <strong>{pub.total_scans || 0}</strong></span>
                        <span>•</span>
                        <span>Total Spent: <strong>${(pub.total_spent || 0).toFixed(2)}</strong></span>
                      </div>

                      {pub.unlock_requested && (
                        <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-2 text-xs text-amber-200">
                          <strong>Note from publisher:</strong> {pub.unlock_request_note}
                        </div>
                      )}
                    </div>

                    {/* Unlock / Reset Button */}
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => handleUnlockPublisher(pub.id)}
                        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all active:scale-95"
                      >
                        <Unlock className="w-4 h-4" />
                        <span>Confirm Payment & Unlock</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB: AUDIT ALL SUBMITTED LINKS */}
      {/* "also allow me to check all the submited links and all okay" */}
      {activeTab === 'links' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Global Submitted Links Audit</h3>
                <p className="text-xs text-slate-400">Complete historical inspection of every scan link</p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Search by link, ID, publisher..."
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <select
                  value={linkFilterStatus}
                  onChange={(e) => setLinkFilterStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="expired">Expired</option>
                  <option value="trial_not_activated">Trial Not Activated</option>
                  <option value="pending">Pending Claim</option>
                  <option value="awaiting_confirmation">Awaiting Confirmation</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No matching links found.
                </div>
              ) : (
                filteredOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-2"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-slate-400">#{ord.id}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-white font-medium">{ord.publisher_name}</span>
                        <span className="text-slate-500">•</span>
                        <span className="font-mono text-indigo-400">${ord.rate?.toFixed(2)}</span>
                        {ord.claimed_by_name && (
                          <span className="text-slate-400">Worker: {ord.claimed_by_name}</span>
                        )}
                      </div>
                      <p className="font-mono text-slate-300 truncate max-w-xl select-all">
                        {ord.upi_link}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        ord.status === 'success' ? 'bg-emerald-500/20 text-emerald-300' :
                        ord.status === 'expired' ? 'bg-slate-800 text-slate-400' :
                        ord.status === 'trial_not_activated' ? 'bg-rose-500/20 text-rose-300' :
                        'bg-amber-500/20 text-amber-300'
                      }`}>
                        {ord.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB: PAYOUT REQUESTS APPROVAL */}
      {/* "payout members can request upi or binance payout where they submit there upi qr and id and name and in binance just binance id and name okay" */}
      {activeTab === 'payouts' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-indigo-400" />
                Worker Payout Approval Center
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Review submitted UPI QR codes or Binance Pay IDs and release payments
              </p>
            </div>

            <div className="space-y-3">
              {payouts.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No payout requests recorded.
                </div>
              ) : (
                payouts.map((pay) => (
                  <div
                    key={pay.id}
                    className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">${pay.amount?.toFixed(2)}</span>
                        <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold uppercase">
                          {pay.method}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-bold uppercase ${
                          pay.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' :
                          pay.status === 'rejected' ? 'bg-rose-500/20 text-rose-300' :
                          'bg-amber-500/20 text-amber-300'
                        }`}>
                          {pay.status}
                        </span>
                      </div>

                      <div className="text-slate-300 space-y-0.5">
                        <p>Worker: <strong>{pay.worker_name}</strong> ({pay.worker_id})</p>
                        {pay.method === 'upi' ? (
                          <div className="flex items-center gap-3">
                            <span>UPI ID: <strong className="font-mono text-emerald-400">{pay.upi_id}</strong></span>
                            <span>Beneficiary: <strong>{pay.beneficiary_name}</strong></span>
                            {pay.qr_code_url && (
                              <a
                                href={pay.qr_code_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                              >
                                <QrCode className="w-3.5 h-3.5" /> View QR Image
                              </a>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span>Binance ID: <strong className="font-mono text-amber-400">{pay.binance_id}</strong></span>
                            <span> • Account: <strong>{pay.binance_name}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    {pay.status === 'pending' ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleResolvePayout(pay.id, 'approve')}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve & Release</span>
                        </button>
                        <button
                          onClick={() => handleResolvePayout(pay.id, 'reject')}
                          className="px-3.5 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1.5 border border-rose-500/40 transition-all"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    ) : (
                      <div className="text-slate-500 text-[11px] shrink-0">
                        Resolved on {new Date(pay.resolved_at || pay.created_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. TAB: WORKERS & STRIKES */}
      {/* "if someone doesnt completes an order success 2 times in a row give them 2 minutes timeout and 4 = 30min timeout 6= ban" */}
      {activeTab === 'workers' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400" />
                Worker Penalty & Strike Inspector
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Check active timeouts, 6-failure bans, and reset worker strikes
              </p>
            </div>

            <div className="space-y-2.5">
              {workers.map((w) => (
                <div
                  key={w.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{w.name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                        Level {w.level}
                      </span>
                      {w.is_online ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          ONLINE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                          OFFLINE
                        </span>
                      )}
                      {w.is_banned ? (
                        <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px] uppercase animate-pulse">
                          BANNED (6 Strikes)
                        </span>
                      ) : w.timeout_until ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px] uppercase">
                          In Timeout
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 font-semibold text-[10px] uppercase">
                          Good Standing
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-slate-400 font-mono">
                      <span>Consecutive Strikes: <strong className={w.consecutive_failures > 0 ? 'text-amber-400' : 'text-white'}>{w.consecutive_failures || 0} / 6</strong></span>
                      <span>•</span>
                      <span>Personal Done: <strong>{w.total_personal_completed || 0}</strong></span>
                      {w.level === 1 && (
                        <>
                          <span>•</span>
                          <span>Team Total: <strong>{w.total_team_completed || 0}</strong></span>
                          <span>•</span>
                          <span>Balance: <strong className="text-emerald-400">${(w.balance || 0).toFixed(2)}</strong></span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Reset Strikes button */}
                  <div className="shrink-0">
                    <button
                      onClick={() => handleResetWorker(w.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 hover:border-slate-600 transition-all"
                    >
                      Reset Strikes / Unban
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. TAB: SETTINGS (PRICING & LIMITS) */}
      {/* "and i can set the limit to 5 or something" */}
      {/* "the agent should pay 0.55 and i can change it like allow there 1st 3 links for 0.55 ... then after 3 set it to 0.60" */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md space-y-5 max-w-2xl">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                Configure Platform Limits & Special Offers
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Adjust the scan lock threshold, promotional pricing tiers, and default order timers
              </p>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Publisher Scan Limit before Lock */}
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Publisher Scan Lock Limit:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={scanLockLimit}
                    onChange={(e) => setScanLockLimit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-500">
                    e.g. 3 or 5 scans before publisher must pay to unlock
                  </span>
                </div>

                {/* Promo Scans Count */}
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Special Offer Promo Links Count:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={promoScanCount}
                    onChange={(e) => setPromoScanCount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-500">
                    Number of initial links eligible for special discount
                  </span>
                </div>

                {/* Promo Rate */}
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Special Offer Rate ($):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={promoRate}
                    onChange={(e) => setPromoRate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-500">
                    Default 0.55 for first 3 links
                  </span>
                </div>

                {/* Regular Rate */}
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Standard Rate After Promo ($):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={regularRate}
                    onChange={(e) => setRegularRate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-500">
                    Default 0.60 after promo links used
                  </span>
                </div>

                {/* Default Expiry Timer */}
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Default Order Timer (Seconds):
                  </label>
                  <input
                    type="number"
                    step="30"
                    value={defaultTimerSeconds}
                    onChange={(e) => setDefaultTimerSeconds(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-500">
                    300 seconds = 5 minutes default
                  </span>
                </div>

                {/* Boss UPI ID */}
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Super Boss UPI ID (Receives Payments):
                  </label>
                  <input
                    type="text"
                    value={bossUpiId}
                    onChange={(e) => setBossUpiId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>

                {/* Boss Binance ID */}
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Super Boss Binance Pay ID:
                  </label>
                  <input
                    type="text"
                    value={bossBinanceId}
                    onChange={(e) => setBossBinanceId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingSettings}
                className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-600/30 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Platform Configurations</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 8. TAB: TELEGRAM BOT & PRIORITY RADAR */}
      {activeTab === 'telegram' && (
        <div className="space-y-5">
          {/* Header & Status Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  <Bot className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">
                  Telegram Bot & Priority Dispatch Radar
                </h3>
                {telegramStatus?.is_polling ? (
                  <span className="bg-emerald-950/80 border border-emerald-500/60 text-emerald-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    POLLING LIVE
                  </span>
                ) : telegramStatus?.has_token ? (
                  <span className="bg-amber-950/80 border border-amber-500/60 text-amber-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    TOKEN READY
                  </span>
                ) : (
                  <span className="bg-sky-950/80 border border-sky-500/60 text-sky-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    SIMULATION & WEBHOOK ACTIVE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Dispatches order links to online workers using 5-minute active radar and success rate priority (min 5 QR scans)
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-center">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Linked Workers</span>
                <span className="text-base font-black text-sky-400 font-mono">
                  {telegramStatus?.linked_workers_count || 0}
                </span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-center">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Active Radars</span>
                <span className="text-base font-black text-[#bbf246] font-mono">
                  {telegramStatus?.priority_queue?.active_scanning_sessions_count || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Card 1: Bot Token & Priority Queue Configuration */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-sky-400" />
                  <span>Bot Token & Dispatch Rules</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Configure the Telegram BotFather token and worker priority thresholds
                </p>
              </div>

              <form onSubmit={handleSaveTelegramConfig} className="space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Telegram Bot Token (from @BotFather):
                  </label>
                  <input
                    type="password"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    {telegramStatus?.token_preview ? `Current: ${telegramStatus.token_preview}` : 'Leave empty to run in built-in automated test simulator mode.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">
                      Min Scans for Priority Queue:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={telegramMinScans}
                      onChange={(e) => setTelegramMinScans(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500">
                      Default: 5 scans required to enter Priority Queue
                    </span>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">
                      Radar Search Duration (Sec):
                    </label>
                    <input
                      type="number"
                      min="30"
                      max="3600"
                      step="30"
                      value={telegramDuration}
                      onChange={(e) => setTelegramDuration(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500">
                      Default: 300s (5 mins) radar timeout
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] space-y-1.5 text-slate-400">
                  <div className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-sky-400" />
                    <span>How Workers Connect to Telegram:</span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Worker opens the Telegram bot and clicks <strong className="text-white">/start</strong>.</li>
                    <li>Worker pastes their unique Joining Key (e.g. <span className="text-sky-300 font-mono">L2-WORKER-...</span>) into the chat.</li>
                    <li>Account instantly links. Worker clicks <strong className="text-[#bbf246]">Scan for Orders</strong> (/scan) to start 5-min radar.</li>
                    <li>If no orders arrive in 5 mins, radar stops and returns <em className="text-amber-300">0 orders found</em>, prompting them to restart.</li>
                  </ol>
                </div>

                <button
                  type="submit"
                  disabled={isSavingTelegram}
                  className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-600/30 transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSavingTelegram ? 'Saving...' : 'Save Telegram Bot Configuration'}</span>
                </button>
              </form>
            </div>

            {/* Card 2: Active 5-Minute Scanning Radar Monitoring */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Radio className="w-4 h-4 text-[#bbf246] animate-pulse" />
                    <span>Live 5-Minute Scanning Radars</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Workers currently scanning actively for incoming order broadcasts
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-[#bbf246] bg-[#1e2923] border border-[#bbf246]/30 px-2.5 py-1 rounded-lg">
                  {telegramStatus?.priority_queue?.active_scanning_sessions_count || 0} active
                </span>
              </div>

              {(!telegramStatus?.priority_queue?.active_sessions || telegramStatus?.priority_queue?.active_sessions.length === 0) ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center mx-auto text-slate-500">
                    <Clock className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-300">No workers currently in active radar</p>
                  <p className="text-[11px] text-slate-500">
                    When linked workers click "Scan for Orders" or send /scan in Telegram, their 5-minute radar sessions will appear here with live countdowns.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {telegramStatus.priority_queue.active_sessions.map((s) => (
                    <div
                      key={s.worker_id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{s.worker_name}</span>
                          <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 border border-sky-800/40 px-1.5 py-0.2 rounded">
                            Chat {s.chat_id}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>Rate: <strong className="text-emerald-400">{s.success_rate}%</strong></span>
                          <span>•</span>
                          <span>Scans: <strong className="text-white">{s.total_scans}</strong></span>
                          <span>•</span>
                          <span className={s.is_priority_eligible ? 'text-[#bbf246] font-bold' : 'text-slate-500'}>
                            {s.is_priority_eligible ? 'Tier 1 Priority' : 'Tier 2'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-bold text-[#bbf246] bg-[#152e2a] border border-[#2dd4bf]/40 px-2 py-1 rounded-lg flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#2dd4bf] animate-spin" />
                          <span>{s.remaining_seconds}s</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Priority Queue Ranking Explanation */}
              <div className="bg-[#151c19] border border-[#1e2923] rounded-xl p-3 text-[11px] text-slate-300 space-y-1">
                <div className="font-bold text-[#bbf246] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Priority Queue Logic:</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  When an order link is uploaded, the platform sorts all active radar workers. <strong>Tier 1</strong> workers (≥5 scans) are offered the order in descending order of <strong>Success Rate %</strong>. If no Tier 1 workers are scanning, it seamlessly falls back to Tier 2.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: All Linked Telegram Workers Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-sky-400" />
                  <span>Linked Telegram Workers & Performance Queue</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Full list of workers linked with Telegram, their scan history, and eligibility
                </p>
              </div>
              <span className="text-xs text-slate-400">
                Min 5 Scans Required for Tier 1 Priority
              </span>
            </div>

            {(!telegramStatus?.linked_workers || telegramStatus.linked_workers.length === 0) ? (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center space-y-2">
                <Users className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">No workers linked yet</p>
                <p className="text-[11px] text-slate-500">
                  Workers can link immediately by sending their joining key to the bot.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-400 uppercase border-b border-slate-800">
                      <th className="pb-2">Worker</th>
                      <th className="pb-2">Telegram Chat ID</th>
                      <th className="pb-2">Total Scans</th>
                      <th className="pb-2">Success Rate</th>
                      <th className="pb-2">Priority Status</th>
                      <th className="pb-2">Radar State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {telegramStatus.linked_workers.map((w) => (
                      <tr key={w.id} className="text-slate-200">
                        <td className="py-2.5 font-sans font-semibold text-white">
                          {w.name}
                        </td>
                        <td className="py-2.5 text-sky-400">
                          {w.chat_id}
                        </td>
                        <td className="py-2.5">
                          {w.metrics?.totalScans || 0} scans
                        </td>
                        <td className="py-2.5">
                          <span className={`font-bold ${
                            (w.metrics?.successRate || 0) >= 90 ? 'text-emerald-400' :
                            (w.metrics?.successRate || 0) >= 75 ? 'text-amber-400' : 'text-rose-400'
                          }`}>
                            {w.metrics?.successRate || 0}%
                          </span>
                        </td>
                        <td className="py-2.5">
                          {w.metrics?.isPriorityEligible ? (
                            <span className="bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full font-sans">
                              Tier 1 Priority
                            </span>
                          ) : (
                            <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full font-sans">
                              {w.metrics?.totalScans || 0}/5 scans
                            </span>
                          )}
                        </td>
                        <td className="py-2.5">
                          {w.is_scanning_radar_active ? (
                            <span className="bg-[#152e2a] border border-[#2dd4bf]/40 text-[#2dd4bf] text-[10px] font-bold px-2 py-0.5 rounded-full font-sans flex items-center gap-1 w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#2dd4bf] animate-pulse"></span>
                              Radar Active ({w.radar_remaining_seconds}s)
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px] font-sans">
                              Inactive
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
