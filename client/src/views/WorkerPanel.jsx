import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { soundFX } from '../components/AudioChime.js';
import confetti from 'canvas-confetti';
import { socket } from '../socket.js';
import { 
  Zap, 
  Copy, 
  Check, 
  Clock, 
  AlertTriangle, 
  ShieldAlert, 
  Radio, 
  Users, 
  Key, 
  Wallet, 
  CheckCircle2, 
  XCircle, 
  QrCode, 
  ArrowRight,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Flame,
  Award,
  Lock,
  Wifi,
  WifiOff,
  Power,
  FileText,
  HelpCircle,
  Share2,
  CheckCheck,
  Bot,
  Bell,
  Send,
  MessageSquare
} from 'lucide-react';

// Neon Lime Countdown Timer matching Screenshots 1, 2, and 4
function NeonCountdown({ expiresAt, durationSeconds, size = 'large' }) {
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!expiresAt) return durationSeconds || 300;
    const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    return diff;
  });

  useEffect(() => {
    const updateTime = () => {
      if (!expiresAt) {
        setTimeLeft(prev => Math.max(0, prev - 1));
      } else {
        const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
        setTimeLeft(diff);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isUrgent = timeLeft < 45;
  const isExpired = timeLeft === 0;

  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  if (size === 'compact') {
    return (
      <span className={`font-mono font-bold text-xs ${isExpired ? 'text-rose-500' : isUrgent ? 'text-amber-400 animate-pulse' : 'text-[#bbf246]'}`}>
        {formatted}
      </span>
    );
  }

  return (
    <div className={`font-mono font-black tracking-tight ${
      isExpired 
        ? 'text-rose-500' 
        : isUrgent 
        ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)] animate-pulse' 
        : 'text-[#bbf246] drop-shadow-[0_0_12px_rgba(187,242,70,0.35)]'
    } text-3xl sm:text-4xl`}>
      {formatted}
    </div>
  );
}

export default function WorkerPanel({ workerId = 'worker_alex', presence, soundEnabled }) {
  // Navigation matching the 5 screenshots tabs
  const [activeTab, setActiveTab] = useState('hall'); // 'hall' | 'claimed' | 'reconciliation' | 'team' | 'withdraw'
  const [language, setLanguage] = useState('en'); // 'en' | 'zh'

  // Worker profile & status
  const [workerData, setWorkerData] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [timeoutRemaining, setTimeoutRemaining] = useState(0);

  // Orders
  const [availableOrders, setAvailableOrders] = useState([]);
  const [claimedTasks, setClaimedTasks] = useState([]);
  const [allHistoryOrders, setAllHistoryOrders] = useState([]);
  const [isClaiming, setIsClaiming] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [activeQrModalOrder, setActiveQrModalOrder] = useState(null);

  // Message Bot & Agent Feedback State
  const [botMessages, setBotMessages] = useState([]);
  const [unreadBotCount, setUnreadBotCount] = useState(0);
  const [botToast, setBotToast] = useState(null);

  // Worker Appeals State
  const [activeAppealModalOrder, setActiveAppealModalOrder] = useState(null);
  const [appealMessage, setAppealMessage] = useState('');
  const [appealMistakeType, setAppealMistakeType] = useState('scanned_marked_failed');
  const [appealUtr, setAppealUtr] = useState('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [workerAppeals, setWorkerAppeals] = useState([]);

  // Reconciliation Filters
  const [reconDateFilter, setReconDateFilter] = useState('today'); // 'today' | 'yesterday' | 'last3days'
  const [reconStatusFilter, setReconStatusFilter] = useState('completed'); // 'completed' | 'failed' | 'manual_review'

  // Team referral & Subworkers
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [generatedKeyResult, setGeneratedKeyResult] = useState(null);
  const [subworkerInviteKey, setSubworkerInviteKey] = useState('');
  const [newSubworkerName, setNewSubworkerName] = useState('');
  const [isActivatingSubworker, setIsActivatingSubworker] = useState(false);

  // Payout Form
  const [payoutMethod, setPayoutMethod] = useState('upi'); // 'upi' | 'binance'
  const [payoutAmount, setPayoutAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [qrFile, setQrFile] = useState(null);
  const [binanceId, setBinanceId] = useState('');
  const [binanceName, setBinanceName] = useState('');
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);
  const [payoutList, setPayoutList] = useState([]);

  // Priority Queue & 5-Minute Scanning Radar State
  const [priorityMetrics, setPriorityMetrics] = useState(null);
  const [isStartingRadar, setIsStartingRadar] = useState(false);
  const [radarExpiredConfirmNeeded, setRadarExpiredConfirmNeeded] = useState(false);
  const [isBatchRequesting, setIsBatchRequesting] = useState(false);

  const loadPriorityMetrics = async () => {
    try {
      const res = await api.getWorkerPriorityMetrics(workerId);
      setPriorityMetrics(prev => {
        // If radar was previously active and now stopped/expired, show 00:00 confirmation
        if (prev?.isScanningRadarActive && !res.metrics?.isScanningRadarActive) {
          setRadarExpiredConfirmNeeded(true);
        }
        return res.metrics;
      });
    } catch (err) {
      console.error("Failed to load priority metrics", err);
    }
  };

  const handleStartRadar = async () => {
    try {
      setIsStartingRadar(true);
      setRadarExpiredConfirmNeeded(false);
      await api.startTelegramRadar(workerId);
      if (soundEnabled) soundFX.playSuccessChime();
      await loadPriorityMetrics();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsStartingRadar(false);
    }
  };

  const handleStopRadar = async () => {
    try {
      setRadarExpiredConfirmNeeded(false);
      await api.stopTelegramRadar(workerId);
      await loadPriorityMetrics();
    } catch (err) {
      console.error("Failed to stop radar", err);
    }
  };

  // Batch Request up to 3 Orders (User Requirement: "claim upto 3 orders at a time click on request 3 orders")
  const handleBatchClaimOrders = async () => {
    if (!isOnline) {
      alert(language === 'zh' ? "您当前离线！请先在上方切换为在线状态。" : "You are currently OFFLINE! Please toggle Online status above to claim orders.");
      return;
    }
    if (workerData?.worker.is_banned) {
      alert("You are banned and cannot claim orders!");
      return;
    }
    if (timeoutRemaining > 0) {
      alert(`You are in penalty timeout for another ${timeoutRemaining}s!`);
      return;
    }
    if (claimedTasks.length >= 3) {
      alert(language === 'zh' ? "您最多只能同时持有3个进行中的任务！请先完成当前任务。" : "You can hold a maximum of 3 active tasks at a time! Please complete existing tasks first.");
      return;
    }

    try {
      setIsBatchRequesting(true);
      const res = await api.requestBatchOrders(workerId, 3);
      if (res.claimed_orders && res.claimed_orders.length > 0) {
        if (soundEnabled) soundFX.playClaimChime();
        alert(
          language === 'zh'
            ? `成功认领 ${res.claimed_orders.length} 个任务！(当前进行中: ${res.current_active_count}/3)`
            : `Successfully claimed ${res.claimed_orders.length} order(s)! (Active: ${res.current_active_count}/3)`
        );
        setActiveTab('claimed');
        loadOrders();
        loadWorker();
      } else {
        alert(
          language === 'zh'
            ? "当前没有可用待认领的任务！请开启5分钟雷达，新任务发布时将优先派发给您。"
            : "No pending orders available right now! Keep your 5-min Radar active to receive new orders instantly."
        );
      }
    } catch (err) {
      alert(err.message);
      if (soundEnabled) soundFX.playWarningBuzzer();
    } finally {
      setIsBatchRequesting(false);
    }
  };

  // Load Worker Data
  const loadWorker = async () => {
    try {
      const data = await api.getWorker(workerId);
      setWorkerData(data);
      if (data.worker.is_online !== undefined) {
        setIsOnline(data.worker.is_online !== false);
      }

      if (data.worker.timeout_until) {
        const remaining = Math.max(0, Math.ceil((new Date(data.worker.timeout_until).getTime() - Date.now()) / 1000));
        setTimeoutRemaining(remaining);
      } else {
        setTimeoutRemaining(0);
      }
    } catch (err) {
      console.error("Failed to load worker data", err);
    }
  };

  // Toggle Online / Offline
  const handleToggleOnline = async () => {
    const nextStatus = !isOnline;
    setIsOnline(nextStatus);
    try {
      socket.emit('toggle_worker_status', { workerId, isOnline: nextStatus });
      await api.toggleWorkerStatus(workerId, nextStatus);
      if (soundEnabled) {
        if (nextStatus) soundFX.playSuccessChime();
        else soundFX.playWarningBuzzer();
      }
      loadWorker();
    } catch (err) {
      console.error("Failed to toggle status", err);
    }
  };

  // Load Orders
  const loadOrders = async () => {
    try {
      const allData = await api.getRecentOrders();
      // Available orders in pool for fastest claim
      const available = allData.orders.filter(o => o.status === 'pending');
      setAvailableOrders(available);

      // Active Claimed Tasks for this worker
      const claimed = allData.orders.filter(o => 
        o.claimed_by === workerId && 
        (o.status === 'claimed' || o.status === 'awaiting_confirmation' || o.status === 'manual_review')
      );
      setClaimedTasks(claimed);

      // All orders for reconciliation
      const workerHistory = allData.orders.filter(o => o.claimed_by === workerId);
      setAllHistoryOrders(workerHistory);
    } catch (err) {
      console.error("Failed to load orders", err);
    }
  };

  const loadPayouts = async () => {
    try {
      const res = await api.getPayouts({ worker_id: workerId });
      setPayoutList(res.payouts || []);
    } catch (err) {
      console.error("Failed to load payouts", err);
    }
  };

  const loadAppeals = async () => {
    try {
      const res = await api.getAppeals({ worker_id: workerId });
      setWorkerAppeals(res.appeals || []);
    } catch (err) {
      console.error("Failed to load appeals", err);
    }
  };

  const loadBotMessages = async () => {
    try {
      const res = await api.getBotMessages({ recipient_id: workerId });
      setBotMessages(res.messages || []);
      setUnreadBotCount(res.unread_count || 0);
    } catch (err) {
      console.error("Failed to load bot messages", err);
    }
  };

  const handleMarkMessageRead = async (messageId) => {
    try {
      await api.markBotMessageRead(messageId);
      setBotMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_read: true } : m));
      setUnreadBotCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark message read", err);
    }
  };

  const handleMarkAllMessagesRead = async () => {
    try {
      await api.markAllBotMessagesRead(workerId);
      setBotMessages(prev => prev.map(m => ({ ...m, is_read: true })));
      setUnreadBotCount(0);
    } catch (err) {
      console.error("Failed to mark all read", err);
    }
  };

  useEffect(() => {
    loadWorker();
    loadOrders();
    loadPayouts();
    loadAppeals();
    loadBotMessages();
    loadPriorityMetrics();

    const interval = setInterval(() => {
      loadWorker();
      loadOrders();
      loadAppeals();
      loadBotMessages();
      loadPriorityMetrics();
    }, 3500);

    return () => clearInterval(interval);
  }, [workerId]);

  // Real-time synchronization
  useEffect(() => {
    const handleNewOrder = (newOrder) => {
      setAvailableOrders((prev) => {
        if (prev.some(o => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });
      if (soundEnabled && isOnline) {
        soundFX.playNewOrderChime();
      }
    };

    const handleOrderClaimed = ({ orderId, claimedById }) => {
      setAvailableOrders((prev) => prev.filter(o => o.id !== orderId));
      if (claimedById === workerId) {
        setActiveTab('claimed');
        loadOrders();
      }
    };

    const handleOrderManuallyVerified = ({ orderId, status, verifiedBy }) => {
      loadOrders();
      loadWorker();
      loadAppeals();
      loadBotMessages();
      if (soundEnabled) {
        if (status === 'success') soundFX.playSuccessChime();
        else soundFX.playWarningBuzzer();
      }
    };

    const handleAppealResolved = ({ appealId, resolution, action, orderId, botMessage }) => {
      loadOrders();
      loadWorker();
      loadAppeals();
      loadBotMessages();
      if (soundEnabled) {
        if (action === 'approve') soundFX.playSuccessChime();
        else soundFX.playWarningBuzzer();
      }
    };

    const handleBotMessageReceived = (botMsg) => {
      if (botMsg.recipient_id === workerId || !botMsg.recipient_id) {
        setBotMessages((prev) => {
          if (prev.some(m => m.id === botMsg.id)) return prev;
          return [botMsg, ...prev];
        });
        setUnreadBotCount((prev) => prev + 1);
        setBotToast(botMsg);
        if (soundEnabled) {
          if (botMsg.status === 'approved') soundFX.playSuccessChime();
          else soundFX.playNewOrderChime();
        }
        setTimeout(() => {
          setBotToast((curr) => (curr?.id === botMsg.id ? null : curr));
        }, 8000);
      }
    };

    socket.on('new_order_available', handleNewOrder);
    socket.on('order_claimed', handleOrderClaimed);
    socket.on('order_manually_verified', handleOrderManuallyVerified);
    socket.on('appeal_resolved', handleAppealResolved);
    socket.on('bot_message_received', handleBotMessageReceived);
    socket.on('orders_refresh', () => {
      loadOrders();
      loadAppeals();
      loadBotMessages();
    });

    return () => {
      socket.off('new_order_available', handleNewOrder);
      socket.off('order_claimed', handleOrderClaimed);
      socket.off('order_manually_verified', handleOrderManuallyVerified);
      socket.off('appeal_resolved', handleAppealResolved);
      socket.off('bot_message_received', handleBotMessageReceived);
      socket.off('orders_refresh', loadOrders);
    };
  }, [workerId, soundEnabled, isOnline]);

  // Timeout Countdown Ticker
  useEffect(() => {
    if (timeoutRemaining <= 0) return;
    const timer = setInterval(() => {
      setTimeoutRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeoutRemaining]);

  // Claim Order (Fastest Finger Race)
  const handleClaim = async (orderId) => {
    if (!isOnline) {
      alert(language === 'zh' ? "您当前离线！请先在上方切换为在线状态。" : "You are currently OFFLINE! Please toggle Online status above to claim orders.");
      return;
    }
    if (workerData?.worker.is_banned) {
      alert("You are banned and cannot claim orders!");
      return;
    }
    if (timeoutRemaining > 0) {
      alert(`You are in penalty timeout for another ${timeoutRemaining}s!`);
      return;
    }

    try {
      setIsClaiming(true);
      await api.claimOrder(orderId, workerId);
      if (soundEnabled) soundFX.playClaimChime();
      setActiveTab('claimed');
      loadOrders();
      loadWorker();
    } catch (err) {
      alert(err.message);
      if (soundEnabled) soundFX.playWarningBuzzer();
      loadOrders();
    } finally {
      setIsClaiming(false);
    }
  };

  // Complete Task (Worker marks Completed or Expired)
  const handleCompleteTask = async (orderId, result) => {
    try {
      await api.completeTask(orderId, workerId, result);
      if (result === 'success') {
        if (soundEnabled) soundFX.playSuccessChime();
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
      } else {
        if (soundEnabled) soundFX.playWarningBuzzer();
      }
      loadOrders();
      loadWorker();
    } catch (err) {
      alert(err.message);
    }
  };

  // Request Agent Manual Review
  const handleRequestManualReview = async (orderId) => {
    try {
      const reason = prompt(
        language === 'zh' 
          ? "请输入申请人工审核的原因 (例如: 无法识别二维码或网络卡顿):" 
          : "Please specify why you are requesting manual review (e.g., QR scan error, camera glare):"
      );
      if (reason === null) return;

      await api.requestManualReview(orderId, workerId, reason || 'Worker requested manual review');
      alert(
        language === 'zh'
          ? "已提交申请！L1 Boss (代理) 可以在其后台手动验证此订单。"
          : "Submitted! Your L1 Boss (Agent) can now manually verify this order from their panel."
      );
      loadOrders();
    } catch (err) {
      alert(err.message);
    }
  };

  // Open Appeal Modal
  const handleOpenAppealModal = (order) => {
    setActiveAppealModalOrder(order);
    setAppealMessage('');
    setAppealMistakeType('scanned_marked_failed');
    setAppealUtr('');
  };

  // Submit Worker Appeal (Up to 3 normal appeals per task)
  const handleSubmitAppeal = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!activeAppealModalOrder) return;
    if ((activeAppealModalOrder.appeal_count || 0) >= 3) {
      alert("Maximum 3 normal appeals reached for this task.");
      return;
    }

    try {
      setIsSubmittingAppeal(true);
      const res = await api.submitAppeal(
        activeAppealModalOrder.id,
        workerId,
        appealMessage.trim() || 'Worker submitted mistake appeal for verification',
        {
          mistake_type: appealMistakeType,
          utr: appealUtr.trim() || null
        }
      );
      alert(
        language === 'zh'
          ? `申诉 #${res.appeal.appeal_number} 已提交给代理！\n新申诉订单号: ${res.appeal.id}\n代理将审核此申诉，并通过 Message Bot 发送反馈通知。`
          : `Appeal #${res.appeal.appeal_number} submitted to Agent!\nNew Appeal Order ID: ${res.appeal.id}\nYour Agent will review your appeal and send feedback directly to your Message Bot.`
      );
      if (soundEnabled) soundFX.playSuccessChime();
      setActiveAppealModalOrder(null);
      setAppealMessage('');
      setAppealUtr('');
      loadOrders();
      loadAppeals();
      loadBotMessages();
    } catch (err) {
      alert(err.message);
      if (soundEnabled) soundFX.playWarningBuzzer();
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  // Copy to clipboard
  const copyLink = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Referral Key Generation
  const handleGenerateKey = async () => {
    try {
      setIsGeneratingKey(true);
      const res = await api.generateWorkerKey(workerId);
      setGeneratedKeyResult(res.key);
      if (soundEnabled) soundFX.playSuccessChime();
      loadWorker();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // Register Subworker using Key
  const handleRegisterSubworker = async (e) => {
    e.preventDefault();
    if (!subworkerInviteKey || !newSubworkerName) return;
    try {
      setIsActivatingSubworker(true);
      await api.registerSubworker(subworkerInviteKey, newSubworkerName);
      alert('Sub-worker successfully registered and added under your team!');
      setSubworkerInviteKey('');
      setNewSubworkerName('');
      loadWorker();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsActivatingSubworker(false);
    }
  };

  // Submit Payout (Enabled for all workers with balance)
  const handleSubmitPayout = async (e) => {
    e.preventDefault();

    try {
      setIsSubmittingPayout(true);
      const formData = new FormData();
      formData.append('worker_id', workerId);
      formData.append('amount', payoutAmount);
      formData.append('method', payoutMethod);

      if (payoutMethod === 'upi') {
        formData.append('upi_id', upiId);
        formData.append('beneficiary_name', beneficiaryName);
        if (qrFile) formData.append('qr_code', qrFile);
      } else {
        formData.append('binance_id', binanceId);
        formData.append('binance_name', binanceName);
      }

      await api.requestPayout(formData);
      if (soundEnabled) soundFX.playSuccessChime();
      alert('Payout request submitted to Super Boss for approval!');
      setPayoutAmount('');
      setUpiId('');
      setBeneficiaryName('');
      setQrFile(null);
      setBinanceId('');
      setBinanceName('');
      loadWorker();
      loadPayouts();
    } catch (err) {
      alert(err.message);
      if (soundEnabled) soundFX.playWarningBuzzer();
    } finally {
      setIsSubmittingPayout(false);
    }
  };

  const worker = workerData?.worker;
  const completedTodayCount = worker?.total_personal_completed || 0;
  const consecutiveFailures = worker?.consecutive_failures || 0;

  // Filter reconciliation orders
  const filteredReconOrders = allHistoryOrders.filter(ord => {
    const orderTime = new Date(ord.created_at).getTime();
    const nowTime = Date.now();

    // 1. Date window filter
    if (reconDateFilter === 'today') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (orderTime < todayStart.getTime()) return false;
    } else if (reconDateFilter === 'yesterday') {
      const yesterdayStart = new Date();
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setHours(23, 59, 59, 999);
      if (orderTime < yesterdayStart.getTime() || orderTime > yesterdayEnd.getTime()) return false;
    } else if (reconDateFilter === 'last3days') {
      const threeDaysAgo = nowTime - (3 * 24 * 60 * 60 * 1000);
      if (orderTime < threeDaysAgo) return false;
    }

    // 2. Status filter
    if (reconStatusFilter === 'completed') {
      return ord.status === 'success';
    } else if (reconStatusFilter === 'failed') {
      return ord.status === 'trial_not_activated' || ord.status === 'expired';
    } else if (reconStatusFilter === 'manual_review') {
      return ord.status === 'manual_review' || ord.is_manually_verified;
    }

    return true;
  });

  const reconCompletedCount = allHistoryOrders.filter(o => o.status === 'success').length;
  const reconFailedCount = allHistoryOrders.filter(o => o.status === 'trial_not_activated' || o.status === 'expired').length;
  const reconManualCount = allHistoryOrders.filter(o => o.status === 'manual_review' || o.is_manually_verified).length;

  // Sort tasks from expiring soon to least soon (most urgent first - User Requirement)
  const sortedAvailableOrders = [...availableOrders].sort((a, b) => {
    const timeA = new Date(a.expires_at || a.created_at).getTime();
    const timeB = new Date(b.expires_at || b.created_at).getTime();
    return timeA - timeB;
  });

  return (
    <div className="min-h-screen bg-[#0a0e0d] text-slate-100 pb-28">
      
      {/* Real-time Message Bot Notification Toast Banner */}
      {botToast && (
        <div className="fixed top-3 left-3 right-3 max-w-md mx-auto z-50 animate-in slide-in-from-top duration-300">
          <div 
            onClick={() => {
              setActiveTab('bot');
              handleMarkMessageRead(botToast.id);
              setBotToast(null);
            }}
            className="bg-[#151c19]/95 backdrop-blur-md border-2 border-[#2dd4bf] rounded-2xl p-3 shadow-2xl shadow-[#2dd4bf]/20 cursor-pointer hover:bg-[#1a2420] transition-all flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-[#152e2a] border border-[#2dd4bf]/50 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-4 h-4 text-[#2dd4bf] animate-bounce" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#2dd4bf] flex items-center gap-1">
                  FastScan Message Bot • {botToast.agent_name || 'Agent'}
                </span>
                <span className="text-[9px] text-[#8e9b94]">Just now</span>
              </div>
              <p className="text-xs font-bold text-white truncate">{botToast.title}</p>
              <p className="text-[11px] text-slate-300 line-clamp-2 mt-0.5">"{botToast.content}"</p>
              <span className="text-[10px] font-bold text-[#bbf246] mt-1 inline-block">Tap to open Message Bot →</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBotToast(null);
              }}
              className="text-[#8e9b94] hover:text-white p-1 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Container restricted to mobile viewport matching screenshots */}
      <div className="max-w-md mx-auto px-4 pt-3 space-y-3.5">
        
        {/* ==================================================================== */}
        {/* SCREENSHOT HEADER: UPI SCAN in vivid lime + Language toggle            */}
        {/* ==================================================================== */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-[#bbf246] font-sans drop-shadow-[0_0_10px_rgba(187,242,70,0.25)]">
              UPI SCAN
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Message Bot Access Button */}
            <button
              onClick={() => setActiveTab('bot')}
              className={`relative px-2.5 py-1 rounded-full border text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'bot'
                  ? 'bg-[#152e2a] text-[#2dd4bf] border-[#2dd4bf]'
                  : 'bg-[#151c19] text-[#8e9b94] border-[#1e2923] hover:text-white'
              }`}
              title="FastScan Message Bot"
            >
              <Bot className="w-3.5 h-3.5 text-[#2dd4bf]" />
              <span className="text-[11px]">Bot</span>
              {unreadBotCount > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                  {unreadBotCount}
                </span>
              )}
            </button>

            {/* Language Toggle Pill: 中文 | English */}
            <button
              onClick={() => setLanguage(l => l === 'en' ? 'zh' : 'en')}
              className="bg-[#151c19] border border-[#1e2923] text-xs font-semibold px-3 py-1 rounded-full text-slate-200 hover:text-white transition-colors"
            >
              {language === 'en' ? '中文 | English' : 'English | 中文'}
            </button>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* SCREENSHOT CARD 1: TEAM MEMBER + Completed today + Online Switch      */}
        {/* ==================================================================== */}
        <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-4 shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-block bg-[#1e2923] text-[#8e9b94] text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mb-2">
                TEAM MEMBER
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">
                  {completedTodayCount}
                </span>
                <span className="text-sm font-medium text-[#8e9b94]">
                  {language === 'zh' ? '今日完成订单' : 'Completed today'}
                </span>
              </div>
            </div>

            {/* Online / Offline status toggle */}
            <div className="flex flex-col items-end gap-1.5">
              <button
                onClick={handleToggleOnline}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                  isOnline 
                    ? 'bg-[#152e2a] text-[#2dd4bf] border-[#2dd4bf]/40' 
                    : 'bg-[#222b26] text-slate-400 border-slate-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#2dd4bf] animate-pulse' : 'bg-slate-500'}`}></span>
                <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
              </button>
              <span className="text-[10px] text-[#8e9b94]">
                {isOnline ? 'Visible to agents' : 'Paused claims'}
              </span>
            </div>
          </div>

          {/* User & Balance Sub-bar */}
          <div className="mt-3 pt-3 border-t border-[#1e2923] flex items-center justify-between text-xs">
            <span className="text-[#8e9b94] truncate max-w-[180px]">
              {worker?.name || 'Worker'} • L{worker?.level || 2}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[#8e9b94]">Balance:</span>
              <span className="font-mono font-bold text-[#bbf246] text-sm">
                ${(worker?.balance || 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Penalties / Timeout alert if active */}
        {timeoutRemaining > 0 && (
          <div className="bg-rose-950/60 border border-rose-500/70 rounded-xl p-3 text-center space-y-1 animate-pulse">
            <div className="text-xs font-bold text-rose-300">
              Penalty Timeout Active ({Math.floor(timeoutRemaining / 60)}m {timeoutRemaining % 60}s)
            </div>
            <p className="text-[11px] text-rose-400">
              You failed consecutive orders. Wait for timer to claim new tasks.
            </p>
          </div>
        )}

        {/* Strike meter if strikes exist */}
        {consecutiveFailures > 0 && (
          <div className="bg-[#151c19] border border-[#1e2923] rounded-xl p-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-[#8e9b94]">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Strike Status:</span>
              <strong className="text-amber-400">{consecutiveFailures} / 6</strong>
            </div>
            <span className="text-[10px] text-[#8e9b94]">2=2m, 4=30m, 6=Ban</span>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TELEGRAM BOT & 5-MINUTE SCANNING RADAR CARD                          */}
        {/* ==================================================================== */}
        <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-3.5 shadow-xl space-y-3">
          {/* Header Row: Bot Status & Priority Tier */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-950/70 border border-sky-500/40 flex items-center justify-center text-sky-400">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>Telegram FastScan Bot</span>
                  {worker?.telegram_chat_id ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2dd4bf] animate-pulse" title="Linked to Telegram"></span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" title="Not linked"></span>
                  )}
                </div>
                <div className="text-[10px] text-[#8e9b94]">
                  {worker?.telegram_chat_id 
                    ? `Linked (Chat ID: ${worker.telegram_chat_id})` 
                    : 'Not connected to Telegram'}
                </div>
              </div>
            </div>

            {/* Priority Status Badge */}
            <div>
              {priorityMetrics?.isPriorityEligible ? (
                <span className="bg-[#152e2a] border border-[#bbf246]/50 text-[#bbf246] text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Zap className="w-3 h-3 text-[#bbf246]" />
                  <span>Tier 1 Priority ({priorityMetrics.successRate}%)</span>
                </span>
              ) : (
                <span className="bg-[#1e2923] text-slate-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  Tier 2 ({priorityMetrics?.totalScans || 0}/5 scans)
                </span>
              )}
            </div>
          </div>

          {/* Account Link Key helper if not linked */}
          {!worker?.telegram_chat_id && (
            <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-2.5 flex items-center justify-between text-xs">
              <div className="min-w-0">
                <span className="text-[10px] text-[#8e9b94] block">Your Telegram Link Key:</span>
                <span className="font-mono font-bold text-sky-300 text-xs truncate block">
                  {worker?.joining_key || 'L2-WORKER-...'}
                </span>
              </div>
              <button
                onClick={() => copyLink(worker?.joining_key, 'tg_key')}
                className="px-2.5 py-1 rounded-lg bg-[#1e2923] hover:bg-[#2a3831] text-white text-[11px] font-bold flex items-center gap-1 transition-all shrink-0"
              >
                {copiedId === 'tg_key' ? <Check className="w-3 h-3 text-[#bbf246]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedId === 'tg_key' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          )}

          {/* 5-Minute Scanning Radar Session Control (User Requirement: "after 5 min elapse give them 00 timer and tell them to confirm") */}
          <div className="pt-1">
            {radarExpiredConfirmNeeded ? (
              <div className="bg-[#2e1518] border-2 border-rose-500 rounded-2xl p-3.5 space-y-2.5 shadow-xl shadow-rose-950/40 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="text-xs font-black text-rose-200 uppercase tracking-wider">
                      Radar Expired (0 Orders Found)
                    </span>
                  </div>
                  <span className="font-mono font-black text-base text-rose-400 bg-[#0e1411] px-2.5 py-0.5 rounded-md border border-rose-800">
                    00:00
                  </span>
                </div>
                <p className="text-[11px] text-rose-300 leading-snug">
                  Your 5-minute radar window has ended. To confirm you are still actively online at your device, tap confirm below to resume:
                </p>
                <button
                  onClick={async () => {
                    setRadarExpiredConfirmNeeded(false);
                    await handleStartRadar();
                  }}
                  disabled={isStartingRadar || !isOnline}
                  className="w-full py-2.5 rounded-xl bg-[#bbf246] hover:bg-[#a3e635] text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#bbf246]/20 active:scale-[0.99] transition-all"
                >
                  <Check className="w-4 h-4 text-black" />
                  <span>✅ YES, I AM ONLINE — RESUME SCANNING</span>
                </button>
              </div>
            ) : priorityMetrics?.isScanningRadarActive ? (
              <div className="bg-[#152e2a]/90 border border-[#2dd4bf]/40 rounded-xl p-3 flex items-center justify-between gap-2 shadow-inner">
                <div className="flex items-center gap-2 min-w-0">
                  <Radio className="w-4 h-4 text-[#2dd4bf] animate-pulse shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-black text-white flex items-center gap-1.5">
                      <span>5-Min Scanning Radar Active</span>
                      <span className="w-2 h-2 rounded-full bg-[#2dd4bf] animate-ping"></span>
                    </div>
                    <div className="text-[10px] text-[#2dd4bf]/90">
                      Searching for live UPI orders • Auto-stops when timer ends
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="font-mono font-black text-sm text-[#bbf246] bg-[#0e1411] px-2 py-0.5 rounded-md border border-[#1e2923]">
                    {priorityMetrics.remainingSeconds}s
                  </div>
                  <button
                    onClick={handleStopRadar}
                    className="px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-600/50 text-rose-300 text-[10px] font-bold transition-all"
                  >
                    Stop
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <button
                  onClick={handleStartRadar}
                  disabled={isStartingRadar || !isOnline}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#bbf246] to-[#2dd4bf] hover:opacity-95 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#bbf246]/10 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>{isStartingRadar ? 'Activating Radar...' : 'Scan for Orders (5-Min Radar)'}</span>
                </button>
                <p className="text-[10px] text-center text-[#8e9b94]">
                  {priorityMetrics?.isPriorityEligible
                    ? `Priority Active: You will receive incoming orders first due to ${priorityMetrics.successRate}% success rate.`
                    : `Need ${priorityMetrics?.scansNeededForPriority || (5 - (priorityMetrics?.totalScans || 0))} more scans to enter Tier 1 Priority Queue.`}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ==================================================================== */}
        {/* TAB 1: TASK HALL (SCREENSHOT 1)                                       */}
        {/* ==================================================================== */}
        {activeTab === 'hall' && (
          <div className="space-y-3">
            
            {/* Screenshot 1: Live task signal & Auto-refresh ON */}
            <div className="flex items-center justify-between px-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#bbf246] animate-pulse"></span>
                <span className="font-semibold text-white">
                  {language === 'zh' ? '实时任务信号' : 'Live task signal'}
                </span>
              </div>
              <span className="text-[#8e9b94] text-xs font-medium">
                {language === 'zh' ? '自动刷新 开启' : 'Auto-refresh ON'}
              </span>
            </div>

            {/* Batch Request Button (User Requirement: "claim upto 3 orders at a time click on request 3 orders") */}
            <div className="bg-[#151c19] border border-[#1e2923] rounded-xl p-3 flex items-center justify-between gap-2 shadow-md">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#bbf246]" />
                  <span>{language === 'zh' ? '批量快速抢单 (最多3单)' : 'Batch Claim (Up to 3 Orders)'}</span>
                </div>
                <div className="text-[10px] text-[#8e9b94]">
                  {language === 'zh' ? '当前已持有任务: ' : 'Active held: '}
                  <strong className="text-white">{claimedTasks.length} / 3</strong>
                </div>
              </div>

              <button
                onClick={handleBatchClaimOrders}
                disabled={isBatchRequesting || claimedTasks.length >= 3 || !isOnline || timeoutRemaining > 0}
                className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-[#bbf246] to-[#2dd4bf] hover:opacity-95 text-black font-black text-xs flex items-center gap-1.5 shadow-md shadow-[#bbf246]/10 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Zap className="w-3.5 h-3.5 text-black" />
                <span>
                  {isBatchRequesting 
                    ? 'Claiming 3...' 
                    : claimedTasks.length >= 3 
                    ? 'Max Held (3/3)' 
                    : (language === 'zh' ? '📥 一键认领 3 单' : '📥 Request 3 Orders')}
                </span>
              </button>
            </div>

            {/* Available orders list (sorted expiring soonest first) */}
            {sortedAvailableOrders.length === 0 ? (
              <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-[#1e2923] flex items-center justify-center mx-auto text-[#8e9b94]">
                  <Clock className="w-5 h-5 animate-spin text-[#bbf246]" />
                </div>
                <p className="text-sm font-semibold text-slate-200">
                  {language === 'zh' ? '正在等待发布者上传新 UPI 链接...' : 'Waiting for live UPI task signals...'}
                </p>
                <p className="text-xs text-[#8e9b94]">
                  {presence?.onlinePublishers || 1} {language === 'zh' ? '位发布者在线。新任务将在此自动弹出！' : 'publishers online. Tasks appear here instantly!'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedAvailableOrders.map((ord, idx) => (
                  <div
                    key={ord.id}
                    className="bg-[#151c19] border border-[#1e2923] border-l-4 border-l-[#bbf246] rounded-xl p-4 shadow-lg space-y-3 transition-all relative"
                  >
                    {/* Urgency indicator for top expiring tasks */}
                    {idx === 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1 text-[10px] text-amber-300 font-bold flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{language === 'zh' ? '最紧急 (即将到期)' : 'MOST URGENT (EXPIRING SOONEST)'}</span>
                      </div>
                    )}

                    {/* Top Row: Merchant Reference & Available Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8e9b94]">
                          MERCHANT REFERENCE
                        </div>
                        <div className="font-mono text-xs text-slate-200 truncate max-w-[230px]">
                          {ord.merchant_reference || ord.id}
                        </div>
                      </div>

                      {/* AVAILABLE BADGE with custom worker rate */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-xs font-black text-[#bbf246] bg-[#152e2a] px-2 py-0.5 rounded border border-[#2dd4bf]/30">
                          +${(ord.worker_rate || 0.40).toFixed(2)}
                        </span>
                        <span className="bg-[#152e2a] text-[#2dd4bf] text-[11px] font-bold px-2.5 py-0.5 rounded">
                          AVAILABLE
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: REMAINING & Big Neon Lime Countdown */}
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#8e9b94]">
                        REMAINING
                      </div>
                      <NeonCountdown expiresAt={ord.expires_at} durationSeconds={ord.duration_seconds} />
                    </div>

                    {/* Bottom Row: Full Width Claim task Button */}
                    <button
                      onClick={() => handleClaim(ord.id)}
                      disabled={isClaiming || timeoutRemaining > 0 || worker?.is_banned || !isOnline}
                      className={`w-full py-3.5 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
                        !isOnline
                          ? 'bg-[#222b26] text-slate-400 border border-slate-700 cursor-not-allowed'
                          : timeoutRemaining > 0
                          ? 'bg-[#222b26] text-slate-500 cursor-not-allowed'
                          : 'bg-[#bbf246] hover:bg-[#a3e635] text-black shadow-lg shadow-[#bbf246]/10 active:scale-[0.98]'
                      }`}
                    >
                      {!isOnline ? (
                        <span>{language === 'zh' ? '请先开启在线状态' : 'SWITCH ONLINE TO CLAIM'}</span>
                      ) : (
                        <span>{language === 'zh' ? '认领任务' : 'Claim task'}</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: CLAIMED TASKS (SCREENSHOT 2)                                   */}
        {/* ==================================================================== */}
        {activeTab === 'claimed' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">
                  {language === 'zh' ? '您进行中的任务' : 'Your active tasks'}
                </span>
                <span className="bg-[#152e2a] text-[#2dd4bf] text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {claimedTasks.length} active
                </span>
              </div>
            </div>

            {claimedTasks.length === 0 ? (
              <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-[#1e2923] flex items-center justify-center mx-auto text-[#8e9b94]">
                  <CheckCircle2 className="w-5 h-5 text-[#8e9b94]" />
                </div>
                <p className="text-sm font-semibold text-slate-200">
                  {language === 'zh' ? '暂无进行中的任务' : 'No active tasks claimed.'}
                </p>
                <p className="text-xs text-[#8e9b94]">
                  {language === 'zh' ? '前往任务大厅抢单吧！' : 'Go to Task Hall to claim fresh orders.'}
                </p>
                <button
                  onClick={() => setActiveTab('hall')}
                  className="mt-2 px-4 py-2 rounded-xl bg-[#bbf246] text-black font-bold text-xs hover:bg-[#a3e635]"
                >
                  {language === 'zh' ? '去抢单' : 'Go to Task Hall'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {claimedTasks.map((ord) => (
                  <div
                    key={ord.id}
                    className="bg-[#151c19] border border-[#1e2923] rounded-xl p-4 shadow-lg space-y-3.5"
                  >
                    {/* Top Row: Merchant Reference & CLAIMED Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8e9b94]">
                          MERCHANT REFERENCE
                        </div>
                        <div className="font-mono text-xs text-slate-200 truncate max-w-[230px]">
                          {ord.merchant_reference || ord.id}
                        </div>
                      </div>

                      {/* CLAIMED BADGE matching Screenshot 2 with Payout Rate */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-xs font-black text-[#bbf246] bg-[#152e2a] px-2 py-0.5 rounded border border-[#2dd4bf]/30">
                          Reward: ${(ord.worker_rate || 0.40).toFixed(2)}
                        </span>
                        <span className="bg-[#1a3325] text-[#4ade80] text-[11px] font-bold px-2.5 py-0.5 rounded">
                          CLAIMED
                        </span>
                      </div>
                    </div>

                    {/* Middle: REMAINING & Big Neon Lime Countdown */}
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#8e9b94]">
                        REMAINING
                      </div>
                      <NeonCountdown expiresAt={ord.expires_at} durationSeconds={ord.duration_seconds} />
                    </div>

                    {/* Status Notice if in manual review or submitted */}
                    {ord.status === 'awaiting_confirmation' && (
                      <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-2.5 text-xs text-amber-300 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
                        <span>Submitted! Awaiting Agent / Publisher confirmation.</span>
                      </div>
                    )}
                    {ord.status === 'manual_review' && (
                      <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-2.5 text-xs text-purple-300 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-purple-400 shrink-0" />
                        <span>Escalated to Agent for Manual Verification.</span>
                      </div>
                    )}

                    {/* Instant Visual QR Code Photo (User Requirement: "give them qr photo also okay ... the givingshould be quick very quick so they get time to scan and balance get updated onsuccess scan") */}
                    <div className="bg-[#0e1411] border border-[#1e2923] rounded-2xl p-3.5 flex flex-col items-center justify-center space-y-2.5 shadow-inner">
                      <div className="bg-white p-2.5 rounded-xl shadow-xl flex items-center justify-center">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(ord.upi_link)}`}
                          alt={`QR for ${ord.merchant_reference || ord.id}`}
                          className="w-48 h-48 rounded-lg object-contain block mx-auto"
                          loading="eager"
                        />
                      </div>
                      <div className="text-center space-y-0.5">
                        <div className="text-[11px] font-bold text-white flex items-center justify-center gap-1.5">
                          <QrCode className="w-3.5 h-3.5 text-[#bbf246]" />
                          <span>Instant UPI QR Scanner Photo</span>
                        </div>
                        <p className="text-[10px] text-[#8e9b94]">
                          Aim Google Pay, PhonePe, Paytm, or BHIM camera to pay instantly
                        </p>
                      </div>
                    </div>

                    {/* Row 1 Actions: Open QR page & Copy URL */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => setActiveQrModalOrder(ord)}
                        className="py-2.5 px-3 rounded-xl bg-[#1e2923] hover:bg-[#27352e] text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-[#bbf246]" />
                        <span>Open QR page</span>
                      </button>

                      <button
                        onClick={() => copyLink(ord.upi_link, ord.id)}
                        className="py-2.5 px-3 rounded-xl bg-[#1e2923] hover:bg-[#27352e] text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        {copiedId === ord.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#bbf246]" />
                            <span className="text-[#bbf246]">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#8e9b94]" />
                            <span>Copy URL</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Row 2 Actions: Completed & Expired (matching Screenshot 2) */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleCompleteTask(ord.id, 'success')}
                        className="py-3 px-3 rounded-xl bg-[#bbf246] hover:bg-[#a3e635] text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-[#bbf246]/10 active:scale-[0.98] transition-all"
                      >
                        <Check className="w-4 h-4" />
                        <span>{language === 'zh' ? '完成' : 'Completed'}</span>
                      </button>

                      <button
                        onClick={() => handleCompleteTask(ord.id, 'failed')}
                        className="py-3 px-3 rounded-xl bg-[#222b26] hover:bg-rose-950/40 text-rose-400 border border-rose-900/40 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>{language === 'zh' ? '过期 / 失败' : 'Expired'}</span>
                      </button>
                    </div>

                    {/* Row 3: Manual Verification & Worker Appeal (Up to 3 normal appeals) */}
                    <div className="pt-2 border-t border-[#1e2923] flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleRequestManualReview(ord.id)}
                          className="py-2 px-2 rounded-lg bg-transparent hover:bg-[#1e2923] text-[#8e9b94] hover:text-white border border-[#1e2923] text-[11px] font-medium transition-all"
                        >
                          {language === 'zh' ? '申请人工验证' : "Manual Review"}
                        </button>

                        <button
                          onClick={() => handleOpenAppealModal(ord)}
                          disabled={(ord.appeal_count || 0) >= 3}
                          className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                            (ord.appeal_count || 0) >= 3
                              ? 'bg-[#151c19] text-slate-500 border border-[#1e2923] cursor-not-allowed'
                              : 'bg-[#2a1b38] hover:bg-[#38234c] text-purple-300 border border-purple-800/50 shadow-sm'
                          }`}
                        >
                          <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
                          <span>
                            {language === 'zh' 
                              ? `申诉 (${3 - (ord.appeal_count || 0)}/3)` 
                              : `Appeal (${3 - (ord.appeal_count || 0)}/3)`}
                          </span>
                        </button>
                      </div>

                      {ord.last_appeal_order_id && (
                        <div className="bg-purple-950/30 border border-purple-800/40 rounded-lg p-2 text-[10px] text-purple-300 flex items-center justify-between">
                          <span className="truncate max-w-[200px]">
                            Appeal Order: <strong className="font-mono">{ord.last_appeal_order_id}</strong>
                          </span>
                          <span className="bg-purple-900/60 px-1.5 py-0.5 rounded font-bold text-[9px]">
                            Appeal #{ord.appeal_count} Sent
                          </span>
                        </div>
                      )}

                      <p className="text-[10px] text-[#8e9b94] text-center italic">
                        {language === 'zh' 
                          ? '提示: 如果您未主动验证，您的 L1 Boss (代理) 可以在其后台手动直接验证。也可以提交最多3次申诉。' 
                          : 'Note: If you do not verify this task yourself, your L1 Boss gets manual option to verify it. You can also appeal up to 3 times.'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: RECONCILIATION LEDGER (SCREENSHOTS 3 & 4)                      */}
        {/* ==================================================================== */}
        {activeTab === 'reconciliation' && (
          <div className="space-y-3.5">
            {/* Title Header */}
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {language === 'zh' ? '对账明细' : 'Reconciliation ledger'}
              </h2>
              <p className="text-xs text-[#8e9b94] mt-0.5">
                {language === 'zh' ? '已处理和过期任务的审计追踪' : 'Audit trail of your processed and expired tasks'}
              </p>
            </div>

            {/* Date Filter Pills matching Screenshot 4: Today | Yesterday | Last 3 days */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setReconDateFilter('today')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  reconDateFilter === 'today'
                    ? 'bg-[#bbf246] text-black shadow-md shadow-[#bbf246]/20'
                    : 'bg-[#151c19] text-[#8e9b94] border border-[#1e2923] hover:text-white'
                }`}
              >
                {language === 'zh' ? '今日' : 'Today'}
              </button>

              <button
                onClick={() => setReconDateFilter('yesterday')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  reconDateFilter === 'yesterday'
                    ? 'bg-[#bbf246] text-black shadow-md shadow-[#bbf246]/20'
                    : 'bg-[#151c19] text-[#8e9b94] border border-[#1e2923] hover:text-white'
                }`}
              >
                {language === 'zh' ? '昨日' : 'Yesterday'}
              </button>

              <button
                onClick={() => setReconDateFilter('last3days')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  reconDateFilter === 'last3days'
                    ? 'bg-[#bbf246] text-black shadow-md shadow-[#bbf246]/20'
                    : 'bg-[#151c19] text-[#8e9b94] border border-[#1e2923] hover:text-white'
                }`}
              >
                {language === 'zh' ? '前3天' : 'Last 3 days'}
              </button>
            </div>

            {/* Status Breakdown Pills: Completed (X) | Failed (Y) | Manual review (Z) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setReconStatusFilter('completed')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  reconStatusFilter === 'completed'
                    ? 'bg-[#152e2a] text-[#2dd4bf] border border-[#2dd4bf]/40'
                    : 'bg-[#151c19] text-[#8e9b94] border border-[#1e2923] hover:text-white'
                }`}
              >
                Completed ({reconCompletedCount})
              </button>

              <button
                onClick={() => setReconStatusFilter('failed')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  reconStatusFilter === 'failed'
                    ? 'bg-[#2e1518] text-rose-400 border border-rose-900/50'
                    : 'bg-[#151c19] text-[#8e9b94] border border-[#1e2923] hover:text-white'
                }`}
              >
                Failed ({reconFailedCount})
              </button>

              <button
                onClick={() => setReconStatusFilter('manual_review')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  reconStatusFilter === 'manual_review'
                    ? 'bg-[#2a1b38] text-purple-400 border border-purple-900/50'
                    : 'bg-[#151c19] text-[#8e9b94] border border-[#1e2923] hover:text-white'
                }`}
              >
                Manual review ({reconManualCount})
              </button>
            </div>

            {/* Reconciliation Cards List */}
            {filteredReconOrders.length === 0 ? (
              <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-8 text-center text-xs text-[#8e9b94]">
                No orders found in this category.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReconOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="bg-[#151c19] border border-[#1e2923] rounded-xl p-3.5 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8e9b94]">
                          MERCHANT REFERENCE
                        </div>
                        <div className="font-mono text-xs text-slate-200 truncate max-w-[200px]">
                          {ord.merchant_reference || ord.id}
                        </div>
                      </div>

                      {/* Status Badge */}
                      {ord.status === 'success' && (
                        <span className="bg-[#152e2a] text-[#2dd4bf] text-[10px] font-bold px-2 py-0.5 rounded">
                          COMPLETED
                        </span>
                      )}
                      {(ord.status === 'trial_not_activated' || ord.status === 'expired') && (
                        <span className="bg-[#2e1518] text-rose-400 text-[10px] font-bold px-2 py-0.5 rounded">
                          FAILED
                        </span>
                      )}
                      {(ord.status === 'manual_review' || ord.is_manually_verified) && (
                        <span className="bg-[#2a1b38] text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded">
                          MANUAL REVIEW
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-[#8e9b94]">
                      {new Date(ord.created_at).toLocaleString([], { 
                        month: '2-digit', 
                        day: '2-digit', 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        second: '2-digit' 
                      })}
                    </div>

                    {/* QR URL Section matching Screenshot 4 */}
                    <div className="bg-[#0e1411] border border-[#1e2923] rounded-lg p-2 flex items-center justify-between gap-2">
                      <div className="font-mono text-[11px] text-slate-400 truncate max-w-[250px]">
                        {ord.upi_link}
                      </div>
                      <button
                        onClick={() => copyLink(ord.upi_link, ord.id)}
                        className="text-[#8e9b94] hover:text-white p-1"
                        title="Copy QR URL"
                      >
                        {copiedId === ord.id ? (
                          <Check className="w-3.5 h-3.5 text-[#bbf246]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {ord.is_manually_verified && (
                      <div className="text-[10px] text-purple-400/90 flex items-center gap-1 font-medium">
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Manually verified by Agent ({ord.manually_verified_by || 'Boss'})</span>
                      </div>
                    )}

                    {/* Appeal action for failed/expired/manual review tasks */}
                    {(ord.status === 'failed' || ord.status === 'expired' || ord.status === 'trial_not_activated' || ord.status === 'manual_review') && (
                      <div className="pt-2 border-t border-[#1e2923] flex items-center justify-between gap-2">
                        <div className="text-[10px] text-[#8e9b94] truncate max-w-[200px]">
                          {ord.last_appeal_order_id ? (
                            <span className="text-purple-300 font-mono">Appeal #{ord.appeal_count}: {ord.last_appeal_order_id}</span>
                          ) : (
                            <span>{3 - (ord.appeal_count || 0)} normal appeals left</span>
                          )}
                        </div>
                        {(ord.appeal_count || 0) < 3 ? (
                          <button
                            onClick={() => handleOpenAppealModal(ord)}
                            className="px-2.5 py-1 rounded-md bg-[#2a1b38] hover:bg-[#3b244f] text-[#c084fc] border border-purple-800/50 text-[11px] font-bold flex items-center gap-1 transition-all"
                          >
                            <ShieldAlert className="w-3 h-3" />
                            <span>{language === 'zh' ? '提交申诉' : 'Appeal Task'}</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-rose-400 font-medium">3/3 Appeals Used</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 4: TEAM MANAGEMENT                                               */}
        {/* ==================================================================== */}
        {activeTab === 'team' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {language === 'zh' ? '团队管理' : 'Team Hub'}
              </h2>
              <p className="text-xs text-[#8e9b94] mt-0.5">
                {language === 'zh' ? '管理下级成员并生成邀请码' : 'Manage your scanning fleet and generate referral keys'}
              </p>
            </div>

            {/* Team Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#151c19] border border-[#1e2923] rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-[#8e9b94] block">Personal Done</span>
                <span className="text-2xl font-black text-white">{worker?.total_personal_completed || 0}</span>
              </div>
              <div className="bg-[#151c19] border border-[#1e2923] rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-[#8e9b94] block">Team Done</span>
                <span className="text-2xl font-black text-[#bbf246]">{worker?.total_team_completed || 0}</span>
              </div>
            </div>

            {/* Generate Key */}
            <div className="bg-[#151c19] border border-[#1e2923] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-[#bbf246]" />
                <span>Invite Sub-worker</span>
              </h3>
              <p className="text-xs text-[#8e9b94]">
                Generate an invitation code to recruit a worker under your team.
              </p>
              <button
                onClick={handleGenerateKey}
                disabled={isGeneratingKey || worker?.level >= 3}
                className="w-full py-2.5 rounded-xl bg-[#bbf246] hover:bg-[#a3e635] text-black font-bold text-xs"
              >
                {isGeneratingKey ? 'Generating Key...' : 'Generate New Invite Key'}
              </button>

              {generatedKeyResult && (
                <div className="bg-[#0e1411] border border-[#bbf246]/40 rounded-xl p-3 text-center space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-[#8e9b94] block">Your Generated Key</span>
                  <div className="text-base font-mono font-black text-[#bbf246] tracking-wider">
                    {generatedKeyResult.key}
                  </div>
                  <button
                    onClick={() => copyLink(generatedKeyResult.key, 'gen_key')}
                    className="text-xs text-slate-300 hover:text-white underline font-medium"
                  >
                    {copiedId === 'gen_key' ? 'Copied to Clipboard!' : 'Copy Key'}
                  </button>
                </div>
              )}
            </div>

            {/* Redeem Key Form */}
            <div className="bg-[#151c19] border border-[#1e2923] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">Activate Sub-worker using Key</h3>
              <form onSubmit={handleRegisterSubworker} className="space-y-2">
                <input
                  type="text"
                  placeholder="Paste Key (e.g. SUB-ALEX-1234)"
                  value={subworkerInviteKey}
                  onChange={(e) => setSubworkerInviteKey(e.target.value)}
                  className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Sub-worker Name"
                  value={newSubworkerName}
                  onChange={(e) => setNewSubworkerName(e.target.value)}
                  className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3 py-2 text-xs text-white"
                />
                <button
                  type="submit"
                  disabled={isActivatingSubworker || !subworkerInviteKey || !newSubworkerName}
                  className="w-full py-2 rounded-xl bg-[#1e2923] hover:bg-[#27352e] text-slate-200 font-bold text-xs"
                >
                  {isActivatingSubworker ? 'Registering...' : 'Register Sub-worker'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 5: WITHDRAW                                                      */}
        {/* ==================================================================== */}
        {activeTab === 'withdraw' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {language === 'zh' ? '提现中心' : 'Withdrawal Hub'}
              </h2>
              <p className="text-xs text-[#8e9b94] mt-0.5">
                {language === 'zh' ? '通过 UPI 或 Binance 提取已完成任务收益' : 'Request earnings payout via UPI or Binance'}
              </p>
            </div>

            {/* Balance Card */}
            <div className="bg-[#151c19] border border-[#1e2923] rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#8e9b94] block">Available Earnings</span>
                <span className="text-3xl font-black text-[#bbf246] font-mono">
                  ${(worker?.balance || 0).toFixed(2)}
                </span>
              </div>
              <div className="text-right text-[11px] text-[#8e9b94]">
                <span>Rate: $0.40 / completed scan</span>
              </div>
            </div>

            {/* Payout Form */}
            <div className="bg-[#151c19] border border-[#1e2923] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPayoutMethod('upi')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    payoutMethod === 'upi' ? 'bg-[#bbf246] text-black' : 'bg-[#0e1411] text-[#8e9b94]'
                  }`}
                >
                  UPI Payout
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutMethod('binance')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    payoutMethod === 'binance' ? 'bg-[#bbf246] text-black' : 'bg-[#0e1411] text-[#8e9b94]'
                  }`}
                >
                  Binance Pay
                </button>
              </div>

              <form onSubmit={handleSubmitPayout} className="space-y-2.5">
                <div>
                  <label className="text-[11px] text-[#8e9b94] block mb-1">Amount ($ USD):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={worker?.balance || 0}
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    placeholder="Enter amount"
                    required
                    className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                {payoutMethod === 'upi' ? (
                  <>
                    <div>
                      <label className="text-[11px] text-[#8e9b94] block mb-1">UPI ID (VPA):</label>
                      <input
                        type="text"
                        placeholder="e.g. yourname@okaxis"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        required
                        className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#8e9b94] block mb-1">Beneficiary Name:</label>
                      <input
                        type="text"
                        placeholder="Name registered on bank"
                        value={beneficiaryName}
                        onChange={(e) => setBeneficiaryName(e.target.value)}
                        required
                        className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-[11px] text-[#8e9b94] block mb-1">Binance Pay ID:</label>
                      <input
                        type="text"
                        placeholder="e.g. 123456789"
                        value={binanceId}
                        onChange={(e) => setBinanceId(e.target.value)}
                        required
                        className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingPayout || (worker?.balance || 0) <= 0}
                  className="w-full py-3 rounded-xl bg-[#bbf246] hover:bg-[#a3e635] text-black font-extrabold text-xs"
                >
                  {isSubmittingPayout ? 'Submitting...' : 'Submit Withdrawal Request'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 6: FASTSCAN MESSAGE BOT & AGENT FEEDBACK (USER REQUIREMENT)      */}
        {/* User Requirement: "allow workers to appeal if they believe its        */}
        {/* mistake and agent reviews and sends him feedback via message bot"     */}
        {/* ==================================================================== */}
        {activeTab === 'bot' && (
          <div className="space-y-3.5 animate-in fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <Bot className="w-5 h-5 text-[#2dd4bf]" />
                  <span>{language === 'zh' ? '消息机器人' : 'Message Bot'}</span>
                </h2>
                <p className="text-xs text-[#8e9b94] mt-0.5">
                  {language === 'zh' ? '来自代理的申诉审核反馈与官方通知' : 'Official feedback & appeal reviews from your Agent'}
                </p>
              </div>

              {unreadBotCount > 0 && (
                <button
                  onClick={handleMarkAllMessagesRead}
                  className="text-[11px] text-[#2dd4bf] hover:underline font-bold bg-[#152e2a] px-2.5 py-1 rounded-lg border border-[#2dd4bf]/30"
                >
                  {language === 'zh' ? '全部已读' : 'Mark all read'}
                </button>
              )}
            </div>

            {/* Message Bot Info Banner */}
            <div className="bg-[#152e2a]/50 border border-[#2dd4bf]/40 rounded-xl p-3 flex items-start gap-2.5 text-xs">
              <Bot className="w-4 h-4 text-[#2dd4bf] shrink-0 mt-0.5" />
              <div className="text-slate-200">
                <span className="font-bold text-[#2dd4bf]">Official Dispatch Channel: </span>
                {language === 'zh'
                  ? '当您因操作失误对已失败或超时的任务发起申诉时，代理会在后台进行审核，并将审核处理结论及说明直接反馈到此消息机器人。'
                  : 'Whenever you submit an appeal for an error or mistake, your Agent reviews it and sends approval/rejection feedback directly through this bot.'}
              </div>
            </div>

            {/* Bot Messages Stream */}
            {botMessages.length === 0 ? (
              <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#152e2a] border border-[#2dd4bf]/40 flex items-center justify-center mx-auto text-[#2dd4bf]">
                  <Bot className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-200">
                  {language === 'zh' ? '暂无机器人消息' : 'No Bot Messages Yet'}
                </p>
                <p className="text-xs text-[#8e9b94] max-w-xs mx-auto">
                  {language === 'zh'
                    ? '当您提交任务申诉时，代理审核的结果和详细反馈将直接通过此机器人发送给您。'
                    : 'When you appeal an order mistake, the agent will review it and send full feedback here.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {botMessages.map((msg) => (
                  <div
                    key={msg.id}
                    onClick={() => !msg.is_read && handleMarkMessageRead(msg.id)}
                    className={`bg-[#151c19] border rounded-2xl p-4 space-y-3 transition-all cursor-pointer ${
                      !msg.is_read 
                        ? 'border-[#2dd4bf]/80 shadow-lg shadow-[#2dd4bf]/10' 
                        : 'border-[#1e2923] hover:border-[#28372f]'
                    }`}
                  >
                    {/* Top Row: Bot Identity + Sender Agent + Resolution Tag */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#152e2a] border border-[#2dd4bf]/50 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-[#2dd4bf]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-white">{msg.bot_name || 'FastScan Bot'}</span>
                            <span className="text-[10px] bg-[#1e2923] text-[#8e9b94] px-1.5 py-0.2 rounded font-semibold border border-[#28372f]">
                              Agent: {msg.agent_name || 'Reviewer'}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#8e9b94]">
                            {new Date(msg.created_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {msg.status === 'approved' && (
                          <span className="bg-[#152e2a] text-[#2dd4bf] text-[10px] font-bold px-2 py-0.5 rounded border border-[#2dd4bf]/30">
                            APPROVED
                          </span>
                        )}
                        {msg.status === 'rejected' && (
                          <span className="bg-[#2e1518] text-rose-400 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-900/40">
                            REJECTED
                          </span>
                        )}
                        {!msg.is_read && (
                          <span className="w-2 h-2 rounded-full bg-[#2dd4bf] animate-ping" title="Unread message"></span>
                        )}
                      </div>
                    </div>

                    {/* Notification Title */}
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      {msg.title}
                    </h4>

                    {/* Agent Feedback Bubble */}
                    <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-[#2dd4bf] block">
                        Agent Review & Notes:
                      </span>
                      <p className="text-xs text-slate-100 font-medium whitespace-pre-wrap leading-relaxed">
                        "{msg.content}"
                      </p>
                    </div>

                    {/* Linked order & appeal references */}
                    {(msg.order_id || msg.appeal_id || msg.utr || msg.mistake_type) && (
                      <div className="pt-2 border-t border-[#1e2923] flex flex-wrap gap-2 text-[10px] text-[#8e9b94]">
                        {msg.order_id && (
                          <span>Order: <strong className="font-mono text-slate-300">{msg.merchant_reference || msg.order_id}</strong></span>
                        )}
                        {msg.appeal_id && (
                          <span>Appeal ID: <strong className="font-mono text-purple-300">{msg.appeal_id}</strong></span>
                        )}
                        {msg.utr && (
                          <span className="text-cyan-300 font-mono">UTR: {msg.utr}</span>
                        )}
                        {msg.mistake_type && (
                          <span className="text-amber-300">Mistake: {msg.mistake_type.replace(/_/g, ' ')}</span>
                        )}
                      </div>
                    )}

                    {/* Mark read action */}
                    {!msg.is_read && (
                      <div className="pt-1 flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkMessageRead(msg.id);
                          }}
                          className="text-[10px] font-bold text-[#2dd4bf] hover:underline"
                        >
                          Mark as Read ✓
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ==================================================================== */}
      {/* 6 BOTTOM NAVIGATION TABS (INCLUDING MESSAGE BOT)                     */}
      {/* ==================================================================== */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#0a0e0d]/95 backdrop-blur-md border-t border-[#1e2923] px-2 py-2 flex items-center justify-around z-40">
        
        {/* Tab 1: Task hall */}
        <button
          onClick={() => setActiveTab('hall')}
          className={`transition-all ${
            activeTab === 'hall'
              ? 'bg-[#bbf246] text-black font-extrabold px-2.5 py-1.5 rounded-full flex items-center gap-1 text-xs shadow-md shadow-[#bbf246]/20'
              : 'text-[#8e9b94] hover:text-white flex items-center gap-1 text-xs font-semibold px-2 py-1.5'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Hall</span>
        </button>

        {/* Tab 2: Claimed tasks */}
        <button
          onClick={() => setActiveTab('claimed')}
          className={`transition-all relative ${
            activeTab === 'claimed'
              ? 'bg-[#bbf246] text-black font-extrabold px-2.5 py-1.5 rounded-full flex items-center gap-1 text-xs shadow-md shadow-[#bbf246]/20'
              : 'text-[#8e9b94] hover:text-white flex items-center gap-1 text-xs font-semibold px-2 py-1.5'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Claimed</span>
          {claimedTasks.length > 0 && activeTab !== 'claimed' && (
            <span className="w-2 h-2 rounded-full bg-[#bbf246] absolute top-1 right-1 animate-ping"></span>
          )}
        </button>

        {/* Tab 3: Message Bot */}
        <button
          onClick={() => setActiveTab('bot')}
          className={`transition-all relative ${
            activeTab === 'bot'
              ? 'bg-[#bbf246] text-black font-extrabold px-2.5 py-1.5 rounded-full flex items-center gap-1 text-xs shadow-md shadow-[#bbf246]/20'
              : 'text-[#8e9b94] hover:text-white flex items-center gap-1 text-xs font-semibold px-2 py-1.5'
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-[#2dd4bf]" />
          <span>Bot</span>
          {unreadBotCount > 0 && (
            <span className="bg-rose-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center absolute -top-1 -right-1 animate-pulse shadow">
              {unreadBotCount}
            </span>
          )}
        </button>

        {/* Tab 4: Reconciliation */}
        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`transition-all ${
            activeTab === 'reconciliation'
              ? 'bg-[#bbf246] text-black font-extrabold px-2.5 py-1.5 rounded-full flex items-center gap-1 text-xs shadow-md shadow-[#bbf246]/20'
              : 'text-[#8e9b94] hover:text-white flex items-center gap-1 text-xs font-semibold px-2 py-1.5'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Recon</span>
        </button>

        {/* Tab 5: Team */}
        <button
          onClick={() => setActiveTab('team')}
          className={`transition-all ${
            activeTab === 'team'
              ? 'bg-[#bbf246] text-black font-extrabold px-2.5 py-1.5 rounded-full flex items-center gap-1 text-xs shadow-md shadow-[#bbf246]/20'
              : 'text-[#8e9b94] hover:text-white flex items-center gap-1 text-xs font-semibold px-2 py-1.5'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Team</span>
        </button>

        {/* Tab 6: Withdraw */}
        <button
          onClick={() => setActiveTab('withdraw')}
          className={`transition-all ${
            activeTab === 'withdraw'
              ? 'bg-[#bbf246] text-black font-extrabold px-2.5 py-1.5 rounded-full flex items-center gap-1 text-xs shadow-md shadow-[#bbf246]/20'
              : 'text-[#8e9b94] hover:text-white flex items-center gap-1 text-xs font-semibold px-2 py-1.5'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Wallet</span>
        </button>
      </div>

      {/* QR Code Modal for "Open QR page" */}
      {activeQrModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-5 max-w-sm w-full space-y-4 text-center">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Scan UPI QR Code</h3>
              <button
                onClick={() => setActiveQrModalOrder(null)}
                className="text-[#8e9b94] hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Generated QR Code preview */}
            <div className="bg-white p-4 rounded-xl inline-block mx-auto shadow-xl">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(activeQrModalOrder.upi_link)}`}
                alt="UPI QR Code"
                className="w-44 h-44 mx-auto"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-mono text-[#8e9b94] truncate max-w-xs mx-auto">
                {activeQrModalOrder.upi_link}
              </p>
              <p className="text-[11px] text-[#2dd4bf]">
                Scan with Google Pay, PhonePe, Paytm, or BHIM
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => copyLink(activeQrModalOrder.upi_link, 'modal_link')}
                className="py-2.5 rounded-xl bg-[#1e2923] text-white text-xs font-bold"
              >
                {copiedId === 'modal_link' ? 'Copied!' : 'Copy Link'}
              </button>
              <button
                onClick={() => setActiveQrModalOrder(null)}
                className="py-2.5 rounded-xl bg-[#bbf246] text-black text-xs font-extrabold"
              >
                Done / Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appeal Submission Modal (Up to 3 normal appeals per task, generates new Order ID) */}
      {activeAppealModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1e2923] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-950/60 border border-purple-800/60 flex items-center justify-center">
                  <ShieldAlert className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>{language === 'zh' ? '提交任务申诉与失误说明' : 'Appeal Task & Report Mistake'}</span>
                  </h3>
                  <span className="text-[10px] text-purple-400 font-semibold">
                    {language === 'zh'
                      ? `申诉 ${(activeAppealModalOrder.appeal_count || 0) + 1} / 3 (限3次正常申诉)`
                      : `Appeal ${(activeAppealModalOrder.appeal_count || 0) + 1} of 3 (Max 3 Normal Appeals)`}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveAppealModalOrder(null)}
                className="text-[#8e9b94] hover:text-white text-base font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Task summary info */}
            <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3 space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-[#8e9b94]">
                <span>Original Order:</span>
                <span className="font-mono text-slate-200 font-bold">{activeAppealModalOrder.merchant_reference || activeAppealModalOrder.id}</span>
              </div>
              <div className="flex justify-between items-center text-[#8e9b94]">
                <span>Appeals Remaining:</span>
                <span className="text-[#bbf246] font-bold">{3 - (activeAppealModalOrder.appeal_count || 0)} left</span>
              </div>
              <div className="text-[10px] text-[#2dd4bf] pt-1 border-t border-[#1e2923] flex items-center gap-1">
                <Bot className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {language === 'zh' 
                    ? '代理将在后台审核此申诉，并通过【消息机器人】向您直接发送审核结果与反馈通知。' 
                    : 'Your Agent will review and dispatch feedback directly to your FastScan Message Bot.'}
                </span>
              </div>
            </div>

            {/* Mistake Category Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 block">
                {language === 'zh' ? '失误类型选择:' : 'Select Mistake Type:'}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'paid_marked_failed', label: 'Paid but Marked Failed', desc: 'Clicked failed by mistake' },
                  { id: 'utr_proof', label: 'UPI Succeeded (UTR Proof)', desc: 'Valid bank transaction' },
                  { id: 'network_glitch', label: 'Network / App Glitch', desc: 'Timed out before sync' },
                  { id: 'status_discrepancy', label: 'Status Discrepancy', desc: 'Dispute agent verification' }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setAppealMistakeType(item.id);
                      if (!appealMessage) setAppealMessage(item.label);
                    }}
                    className={`text-left p-2 rounded-xl border text-[10px] transition-all ${
                      appealMistakeType === item.id
                        ? 'bg-[#152e2a] border-[#2dd4bf] text-white shadow-sm'
                        : 'bg-[#0e1411] border-[#1e2923] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold">{item.label}</div>
                    <div className="text-[9px] text-[#8e9b94] truncate">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitAppeal} className="space-y-3">
              {/* Optional UTR Field */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1 flex items-center justify-between">
                  <span>{language === 'zh' ? '银行 UTR 流水号 (推荐填写):' : 'Bank UTR / Txn Reference (Optional):'}</span>
                  <span className="text-[10px] text-[#2dd4bf] font-mono">12-digit UTR</span>
                </label>
                <input
                  type="text"
                  value={appealUtr}
                  onChange={(e) => setAppealUtr(e.target.value)}
                  placeholder="e.g. 425123984567 or BHIM/Paytm Ref"
                  className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:border-[#bbf246] focus:outline-none"
                />
              </div>

              {/* Message Explanation */}
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  {language === 'zh' ? '申诉详细说明:' : 'Mistake Explanation for Agent:'}
                </label>
                <textarea
                  rows={2}
                  value={appealMessage}
                  onChange={(e) => setAppealMessage(e.target.value)}
                  placeholder={language === 'zh' ? '请说明发生失误的具体原因...' : 'Explain the error or mistake (e.g., scanned on time, UTR confirmed)...'}
                  required
                  className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:border-[#bbf246] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveAppealModalOrder(null)}
                  className="py-2.5 rounded-xl bg-[#1e2923] hover:bg-[#27352e] text-slate-300 text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAppeal || !appealMessage.trim()}
                  className="py-2.5 rounded-xl bg-[#bbf246] hover:bg-[#a3e635] text-black text-xs font-extrabold shadow-md shadow-[#bbf246]/10 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingAppeal ? 'Submitting...' : `Submit Appeal #${(activeAppealModalOrder.appeal_count || 0) + 1}`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
