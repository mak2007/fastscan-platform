import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { soundFX } from '../components/AudioChime.js';
import { 
  Send, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  ShieldAlert, 
  Sparkles, 
  Link as LinkIcon, 
  Users, 
  TrendingUp, 
  RefreshCw,
  Copy,
  ExternalLink,
  Check,
  Key,
  ShieldCheck,
  CheckCheck,
  Flame,
  Radio,
  MessageSquare,
  Hourglass,
  Inbox,
  CheckSquare, 
  RotateCcw, 
  DollarSign, 
  Bot,
  Award,
  Wallet,
  CreditCard,
  BookOpen,
  HelpCircle,
  Zap
} from 'lucide-react';

export default function AgentPanel({ publisherId = 'agent_prime', presence, soundEnabled }) {
  const [publisher, setPublisher] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [limits, setLimits] = useState(null);
  const [bossPaymentInfo, setBossPaymentInfo] = useState(null);
  
  const [upiLink, setUpiLink] = useState('');
  const [merchantRef, setMerchantRef] = useState('');
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Worker Payout Rate Settings ("set the rate for workers according to me allow me to modify it also")
  const [customWorkerRate, setCustomWorkerRate] = useState(0.40);
  const [rateInput, setRateInput] = useState('0.40');
  const [orderWorkerRate, setOrderWorkerRate] = useState('0.40');
  const [isUpdatingRate, setIsUpdatingRate] = useState(false);
  
  // Unlock request modal / form
  const [unlockNote, setUnlockNote] = useState('');
  const [unlockPaymentMethod, setUnlockPaymentMethod] = useState('UPI');
  const [unlockTxnRef, setUnlockTxnRef] = useState('');
  const [isRequestingUnlock, setIsRequestingUnlock] = useState(false);

  // Orders & Appeals state
  const [orders, setOrders] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [activeTab, setActiveTab] = useState('live_tracker'); // 'live_tracker' | 'appeals' | 'manual_queue' | 'success' | 'expired' | 'trial_not_activated'
  const [stats24h, setStats24h] = useState({ successful_count: 0 });
  const [counts, setCounts] = useState({ all: 0, success: 0, expired: 0, trial_not_activated: 0, awaiting_confirmation: 0, manual_review: 0, claimed: 0, pending: 0 });
  const [copiedId, setCopiedId] = useState(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // L2 Worker Key Management for L1 Boss ("allow naming new joinging key")
  const [workerKeys, setWorkerKeys] = useState([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [isGeneratingL2Key, setIsGeneratingL2Key] = useState(false);
  const [generatedKeyNotice, setGeneratedKeyNotice] = useState(null);

  // Appeal Review & Message Bot Feedback Modal States
  // User Requirement: "agent reviews and sends him feedback via message bot"
  const [activeReviewAppeal, setActiveReviewAppeal] = useState(null);
  const [reviewAction, setReviewAction] = useState('approve'); // 'approve' | 'reject'
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [activeDirectMessageWorker, setActiveDirectMessageWorker] = useState(null);
  const [directMessageContent, setDirectMessageContent] = useState('');

  // Real-time upi link validation check
  const isUpiValid = upiLink.trim().toLowerCase().includes('upi');

  // Agent Prepaid Balance & $10 Credit Loan States (User Requirement)
  const [isTopupModalOpen, setIsTopupModalOpen] = useState(false);
  const [selectedTopupTier, setSelectedTopupTier] = useState('starter_5'); // 'starter_5' | 'volume_loan_10' | 'custom'
  const [customTopupAmount, setCustomTopupAmount] = useState('15.00');
  const [topupPaymentMethod, setTopupPaymentMethod] = useState('instant_loan'); // 'instant_loan' | 'upi' | 'binance'
  const [topupPaymentRef, setTopupPaymentRef] = useState('');
  const [isSubmittingTopup, setIsSubmittingTopup] = useState(false);
  const [showPublishGuideModal, setShowPublishGuideModal] = useState(false);

  // Top-Up or Activate Loan Handler
  const handleTopup = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      setIsSubmittingTopup(true);
      let amount = 5.00;
      let isLoan = false;

      if (selectedTopupTier === 'starter_5') {
        amount = 5.00;
        isLoan = false;
      } else if (selectedTopupTier === 'volume_loan_10') {
        amount = 10.00;
        isLoan = true;
      } else {
        amount = parseFloat(customTopupAmount) || 10.00;
        isLoan = topupPaymentMethod === 'instant_loan';
      }

      const res = await api.topupPublisherBalance(publisherId, {
        amount,
        is_loan: isLoan,
        method: topupPaymentMethod,
        payment_ref: topupPaymentRef.trim() || undefined
      });

      alert(res.message);
      if (soundEnabled) soundFX.playSuccessChime();
      setIsTopupModalOpen(false);
      loadPublisherData();
    } catch (err) {
      alert(err.message);
      if (soundEnabled) soundFX.playWarningBuzzer();
    } finally {
      setIsSubmittingTopup(false);
    }
  };

  const loadPublisherData = async () => {
    try {
      const data = await api.getPublisher(publisherId);
      setPublisher(data.publisher);
      setPricing(data.pricing);
      setLimits(data.limits);
      setBossPaymentInfo(data.bossPaymentInfo);

      const effectiveWorkerRate = data.publisher?.worker_rate !== undefined 
        ? data.publisher.worker_rate 
        : (data.pricing?.workerRate || 0.40);
      setCustomWorkerRate(effectiveWorkerRate);
      setRateInput(String(effectiveWorkerRate));
      if (!orderWorkerRate || orderWorkerRate === '0.40') {
        setOrderWorkerRate(String(effectiveWorkerRate));
      }
    } catch (err) {
      console.error("Error loading publisher:", err);
    }
  };

  const loadOrders = async () => {
    try {
      setIsLoadingOrders(true);
      const data = await api.getRecentOrders({ publisher_id: publisherId });
      setOrders(data.orders);
      setStats24h(data.stats24h);
      setCounts(data.counts);
    } catch (err) {
      console.error("Error loading orders:", err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const loadAppeals = async () => {
    try {
      const data = await api.getAppeals({ publisher_id: publisherId });
      setAppeals(data.appeals || []);
    } catch (err) {
      console.error("Error loading appeals:", err);
    }
  };

  const loadWorkerKeys = async () => {
    try {
      const keysData = await api.getPublisherWorkerKeys(publisherId);
      setWorkerKeys(keysData.keys || []);
    } catch (err) {
      console.error("Error loading worker keys:", err);
    }
  };

  useEffect(() => {
    loadPublisherData();
    loadOrders();
    loadAppeals();
    loadWorkerKeys();

    const interval = setInterval(() => {
      loadPublisherData();
      loadOrders();
      loadAppeals();
      loadWorkerKeys();
    }, 4000);
    return () => clearInterval(interval);
  }, [publisherId]);

  // Handle order publish
  const handlePublish = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!isUpiValid) {
      setErrorMsg('Invalid UPI Link! The link must contain "upi" (e.g. upi://pay?... or UPI payment gateway link).');
      if (soundEnabled) soundFX.playWarningBuzzer();
      return;
    }

    if (limits?.isLocked) {
      setErrorMsg('Publishing is locked! Please pay for current orders to continue.');
      return;
    }

    try {
      setIsSubmitting(true);
      const totalSecs = (parseInt(timerMinutes, 10) || 0) * 60 + (parseInt(timerSeconds, 10) || 0);
      const durationSeconds = totalSecs > 0 ? totalSecs : 300;
      await api.publishOrder({
        publisher_id: publisherId,
        upi_link: upiLink.trim(),
        merchant_reference: merchantRef.trim() || undefined,
        duration_seconds: durationSeconds,
        worker_rate: parseFloat(orderWorkerRate) || customWorkerRate || 0.40
      });

      setSuccessMsg(`Order published! Broadcasted to ${presence?.onlineWorkers || 0} online workers. Visible below in Live Task Tracker.`);
      setUpiLink('');
      setMerchantRef('');
      if (soundEnabled) soundFX.playSuccessChime();
      loadPublisherData();
      loadOrders();
    } catch (err) {
      setErrorMsg(err.message);
      if (soundEnabled) soundFX.playWarningBuzzer();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Worker Rate:
  // "set the rate for workers according to me allow me to modify it also okay"
  const handleUpdateWorkerRate = async () => {
    const rate = parseFloat(rateInput);
    if (isNaN(rate) || rate <= 0) {
      alert('Please enter a valid payout rate greater than $0.00.');
      return;
    }
    try {
      setIsUpdatingRate(true);
      const res = await api.setPublisherWorkerRate(publisherId, rate);
      setCustomWorkerRate(rate);
      setOrderWorkerRate(String(rate));
      alert(res.message || `Worker rate successfully updated to $${rate.toFixed(2)} / completed scan!`);
      if (soundEnabled) soundFX.playSuccessChime();
      loadPublisherData();
    } catch (err) {
      alert(err.message);
      if (soundEnabled) soundFX.playWarningBuzzer();
    } finally {
      setIsUpdatingRate(false);
    }
  };

  // Publisher confirms order from awaiting confirmation
  const handleConfirmOrder = async (orderId, action) => {
    try {
      await api.confirmOrder(orderId, publisherId, action);
      if (action === 'confirm_success') {
        if (soundEnabled) soundFX.playSuccessChime();
      } else {
        if (soundEnabled) soundFX.playWarningBuzzer();
      }
      loadPublisherData();
      loadOrders();
    } catch (err) {
      alert(err.message);
    }
  };

  // Agent Manual Verification:
  // "if the wworker doesnt verify it by himself then the agent gets manual option to verify it"
  const handleManualVerify = async (orderId, action) => {
    try {
      const notes = prompt(
        action === 'confirm_success' 
          ? 'Enter verification note (e.g. Bank SMS received, UTR verified):'
          : 'Enter rejection note (e.g. No payment received in bank):'
      );
      if (notes === null) return;

      const res = await api.manualVerifyOrder(orderId, publisherId, action, notes);
      alert(res.message);
      if (action === 'confirm_success') {
        if (soundEnabled) soundFX.playSuccessChime();
      } else {
        if (soundEnabled) soundFX.playWarningBuzzer();
      }
      loadPublisherData();
      loadOrders();
    } catch (err) {
      alert(err.message);
    }
  };

  // Undo Verification:
  // "allow agents to undo if they made error in verifying"
  const handleUndoVerify = async (orderId) => {
    const confirmUndo = window.confirm(
      'Are you sure you want to undo this verification?\n\nIf the order was verified as Success, the credited worker earnings will be safely reversed. If it was marked Failed, penalty strikes will be lifted. The order returns to the review queue.'
    );
    if (!confirmUndo) return;

    try {
      const res = await api.undoVerifyOrder(orderId, publisherId, 'Agent undid verification due to error');
      alert(res.message);
      if (soundEnabled) soundFX.playSuccessChime();
      loadPublisherData();
      loadOrders();
    } catch (err) {
      alert(err.message);
      if (soundEnabled) soundFX.playWarningBuzzer();
    }
  };

  // Open Review Appeal Modal with Message Bot feedback
  // User Requirement: "agent reviews and sends him feedback via message bot"
  const handleOpenReviewModal = (appeal, action = 'approve') => {
    setActiveReviewAppeal(appeal);
    setReviewAction(action);
    setReviewFeedback(
      action === 'approve'
        ? 'UTR verified in bank statement. Payment confirmed and credited to your wallet.'
        : 'Checked bank statement for this timestamp; no matching transaction was found.'
    );
  };

  // Submit Appeal Review & Dispatch via Message Bot
  const handleConfirmReviewAppeal = async (e) => {
    if (e) e.preventDefault();
    if (!activeReviewAppeal || !reviewAction) return;

    try {
      setIsSubmittingReview(true);
      const res = await api.resolveAppeal(
        activeReviewAppeal.id,
        publisherId,
        reviewAction,
        reviewFeedback.trim()
      );
      alert(`🎉 ${res.message}`);
      if (reviewAction === 'approve') {
        if (soundEnabled) soundFX.playSuccessChime();
      } else {
        if (soundEnabled) soundFX.playWarningBuzzer();
      }
      setActiveReviewAppeal(null);
      setReviewFeedback('');
      loadOrders();
      loadAppeals();
    } catch (err) {
      alert(err.message);
      if (soundEnabled) soundFX.playWarningBuzzer();
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Send Direct Message via Bot to Worker
  const handleSendDirectBotMessage = async (e) => {
    if (e) e.preventDefault();
    if (!activeDirectMessageWorker || !directMessageContent.trim()) return;

    try {
      await api.sendBotMessage({
        recipient_id: activeDirectMessageWorker.worker_id,
        agent_id: publisherId,
        order_id: activeDirectMessageWorker.original_order_id,
        appeal_id: activeDirectMessageWorker.id,
        title: `Message from Agent ${publisher?.name || 'Reviewer'}`,
        content: directMessageContent.trim(),
        status: 'info'
      });
      alert(`Message dispatched to ${activeDirectMessageWorker.worker_name} via Message Bot!`);
      if (soundEnabled) soundFX.playSuccessChime();
      setActiveDirectMessageWorker(null);
      setDirectMessageContent('');
    } catch (err) {
      alert(err.message);
    }
  };

  // Generate L2 Worker Key (with custom naming)
  // "allow naming new joinging key but login using the key only"
  const handleGenerateL2WorkerKey = async () => {
    try {
      setIsGeneratingL2Key(true);
      const res = await api.generateL2WorkerKey(publisherId, newKeyLabel.trim());
      setGeneratedKeyNotice(res.key);
      setNewKeyLabel('');
      if (soundEnabled) soundFX.playSuccessChime();
      loadWorkerKeys();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsGeneratingL2Key(false);
    }
  };

  // Request Unlock
  const handleRequestUnlock = async (e) => {
    e.preventDefault();
    try {
      setIsRequestingUnlock(true);
      await api.requestPublisherUnlock(publisherId, {
        payment_method: unlockPaymentMethod,
        transaction_ref: unlockTxnRef,
        note: unlockNote
      });
      alert('Unlock request submitted to Super Boss!');
      loadPublisherData();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsRequestingUnlock(false);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Categorized tasks for Live Tracker
  const liveTasks = orders.filter(o => 
    o.status === 'pending' || 
    o.status === 'claimed' || 
    o.status === 'awaiting_confirmation' || 
    o.status === 'manual_review'
  );

  const waitingForPickupTasks = orders.filter(o => o.status === 'pending');
  const claimedInProgressTasks = orders.filter(o => o.status === 'claimed');
  const awaitingConfirmationTasks = orders.filter(o => o.status === 'awaiting_confirmation');

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      
      {/* 1. Header & 24-Hour Success Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-[#bbf246] text-black shadow-md shadow-[#bbf246]/20">
              Tier 1: L1 Boss Panel
            </span>
            <span className="text-xs text-slate-400 font-semibold">
              Agent / Merchant Link Publisher
            </span>
          </div>
          <h2 className="text-2xl font-black text-white mt-1">
            {publisher?.name || 'Alpha Publisher'}
          </h2>
        </div>

        {/* 1-Hour, 24-Hour and Total Done KPIs */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Last 1 Hour */}
          <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl px-3.5 py-2 shadow-md flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-sky-400 block tracking-wider">
                Last 1 Hour
              </span>
              <div className="text-sm font-black text-white font-mono">
                {stats24h.last1h_count || 0} <span className="text-[10px] text-[#8e9b94] font-sans">done</span>
              </div>
            </div>
          </div>

          {/* Last 24 Hours */}
          <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl px-3.5 py-2 shadow-md flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-emerald-400 block tracking-wider">
                Last 24 Hours
              </span>
              <div className="text-sm font-black text-white font-mono">
                {stats24h.last24h_count || stats24h.successful_count || 0} <span className="text-[10px] text-[#8e9b94] font-sans">done</span>
              </div>
            </div>
          </div>

          {/* Total Done */}
          <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl px-3.5 py-2 shadow-md flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-[#bbf246]/20 text-[#bbf246]">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-bold text-[#bbf246] block tracking-wider">
                Total Completed
              </span>
              <div className="text-sm font-black text-white font-mono">
                {stats24h.total_done || stats24h.successful_count || 0} <span className="text-[10px] text-[#8e9b94] font-sans">total</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 1b. AGENT PREPAID BALANCE & SCAN PACKAGE TIER (USER REQUIREMENT)     */}
      {/* User Requirement: "agents they will pay on each scan let them add     */}
      {/* balance in the website like 5$ one time and they can scan 0.7$ per    */}
      {/* scan loan 10$ and scan at 0.67$ like that now tell how to publish it" */}
      {/* ==================================================================== */}
      <div className="bg-gradient-to-r from-[#151c19] via-[#16241f] to-[#151c19] border border-[#2dd4bf]/40 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-start sm:items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-[#152e2a] border border-[#2dd4bf]/50 text-[#2dd4bf] shrink-0 shadow-md">
            <Wallet className="w-7 h-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#2dd4bf] bg-[#152e2a] px-2 py-0.5 rounded border border-[#2dd4bf]/30">
                Agent Prepaid Account
              </span>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                (publisher?.scan_rate || 0.70) <= 0.67
                  ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                  : 'bg-[#1e2923] text-slate-300 border-[#1e2923]'
              }`}>
                {(publisher?.scan_rate || 0.70) <= 0.67 ? '🚀 $0.67 / scan (Volume / Loan Tier)' : '💎 $0.70 / scan (Starter Tier)'}
              </span>
              {publisher?.loan_balance > 0 && (
                <span className="text-[10px] font-bold bg-purple-950/60 text-purple-300 border border-purple-600/40 px-2 py-0.5 rounded">
                  Loan Active: ${publisher.loan_balance.toFixed(2)}
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-3 mt-1.5">
              <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
                ${(publisher?.balance || 0).toFixed(2)}
              </span>
              <span className="text-xs text-[#8e9b94] font-medium">
                ≈ <strong className="text-[#bbf246] font-mono font-bold text-sm">
                  {Math.floor((publisher?.balance || 0) / (publisher?.scan_rate || 0.70))}
                </strong> scans available at ${(publisher?.scan_rate || 0.70).toFixed(2)}/scan
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Scan fee is deducted automatically from this balance upon each confirmed scan.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowPublishGuideModal(true)}
            className="px-3.5 py-2 rounded-xl bg-[#1e2923] hover:bg-[#283830] text-slate-200 hover:text-white border border-[#1e2923] text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#bbf246]" />
            <span>Publishing Guide</span>
          </button>

          <button
            onClick={() => setIsTopupModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#bbf246] to-[#2dd4bf] hover:opacity-95 text-black font-black text-xs flex items-center gap-2 shadow-lg shadow-[#bbf246]/10 active:scale-95 transition-all"
          >
            <CreditCard className="w-4 h-4 text-black" />
            <span>+ Add Balance / $10 Loan</span>
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
        
        {/* Workers Online */}
        <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8e9b94]">
              Workers Online
            </span>
            <span className="p-1.5 rounded-lg bg-[#1e2923] text-[#bbf246]">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {presence.onlineWorkers}
            </span>
            <span className="flex items-center gap-1 text-xs text-[#bbf246] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#bbf246] animate-pulse"></span>
              Ready to scan
            </span>
          </div>
        </div>

        {/* Waiting for Pickup Count */}
        <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8e9b94]">
              Waiting for Pickup
            </span>
            <span className="p-1.5 rounded-lg bg-[#1e2923] text-cyan-400">
              <Hourglass className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-cyan-400 font-mono">
              {waitingForPickupTasks.length}
            </span>
            <span className="text-xs text-[#8e9b94]">unclaimed</span>
          </div>
        </div>

        {/* Claimed in Progress */}
        <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8e9b94]">
              Claimed in Progress
            </span>
            <span className="p-1.5 rounded-lg bg-[#1e2923] text-indigo-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-indigo-400 font-mono">
              {claimedInProgressTasks.length}
            </span>
            <span className="text-xs text-[#8e9b94]">worker scanning</span>
          </div>
        </div>

        {/* Worker Appeals Inbox */}
        <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8e9b94]">
              Worker Appeals
            </span>
            <span className="p-1.5 rounded-lg bg-[#1e2923] text-purple-400">
              <MessageSquare className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-purple-400 font-mono">
              {appeals.filter(a => a.status === 'pending').length}
            </span>
            <span className="text-xs text-[#8e9b94]">appeals pending</span>
          </div>
        </div>
      </div>

      {/* Pending Trial Reviews Queue (User Requirement: "once a scan done they get option submit for review and then req goes to server side and he confirm if trial was activated or not") */}
      {awaitingConfirmationTasks.length > 0 && (
        <div className="bg-gradient-to-r from-[#182a20] to-[#151c19] border-2 border-[#bbf246] rounded-3xl p-5 shadow-2xl shadow-[#bbf246]/10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2d4435] pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#bbf246] text-black font-black flex items-center justify-center text-lg shadow-md shadow-[#bbf246]/30">
                ⚡
              </div>
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <span>Pending Trial Reviews</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#bbf246] text-black">
                    {awaitingConfirmationTasks.length} Awaiting Confirmation
                  </span>
                </h3>
                <p className="text-xs text-[#8e9b94]">
                  Workers submitted these scans for review. Confirm whether trial was activated:
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {awaitingConfirmationTasks.map((ord) => (
              <div key={ord.id} className="bg-[#0e1411] border border-[#1e2923] hover:border-[#bbf246]/40 rounded-2xl p-4 space-y-3 shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-mono text-[#8e9b94] block">
                      Order: {ord.id}
                    </span>
                    <strong className="text-xs text-white font-mono break-all">
                      {ord.merchant_reference || ord.id}
                    </strong>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                    Awaiting Review
                  </span>
                </div>

                <div className="bg-[#151c19] rounded-xl p-2.5 text-xs space-y-1 border border-[#1e2923]">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Submitted by Worker:</span>
                    <strong className="text-white">{ord.claimed_by_name || ord.claimed_by}</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Scan Fee:</span>
                    <strong className="text-[#bbf246] font-mono">${(ord.rate || 0.70).toFixed(2)}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleConfirmOrder(ord.id, 'confirm_success')}
                    className="py-2.5 px-3 rounded-xl bg-[#bbf246] hover:bg-[#a3e635] text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-[#bbf246]/20 transition-all active:scale-95"
                  >
                    <Check className="w-4 h-4" />
                    <span>Confirm Trial Activated</span>
                  </button>

                  <button
                    onClick={() => handleConfirmOrder(ord.id, 'confirm_failed')}
                    className="py-2.5 px-3 rounded-xl bg-[#222b26] hover:bg-rose-950/50 text-rose-400 border border-rose-900/50 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Trial NOT Activated (-$0.05)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lock Notice if Locked */}
      {limits?.isLocked && (
        <div className="rounded-2xl bg-rose-950/50 border-2 border-rose-500/60 p-5 shadow-xl space-y-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
            <div>
              <h4 className="text-base font-bold text-white">Please pay for current orders to unlock publishing</h4>
              <p className="text-xs text-rose-200">
                You have reached your limit of {limits?.lockLimit || 3} scans (${limits?.unpaidAmount || '1.65'} dues). Settle dues with Super Boss then request unlock below.
              </p>
            </div>
          </div>
          <form onSubmit={handleRequestUnlock} className="flex gap-2">
            <input
              type="text"
              placeholder="Payment Transaction Reference / UTR"
              value={unlockTxnRef}
              onChange={(e) => setUnlockTxnRef(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            />
            <button
              type="submit"
              disabled={isRequestingUnlock}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shrink-0"
            >
              {isRequestingUnlock ? 'Submitting...' : 'Request Boss Unlock'}
            </button>
          </form>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2b. WORKER PAYOUT RATE SETTINGS                                       */}
      {/* User Requirement: "set the rate for workers according to me allow me  */}
      {/* to modify it also okay"                                              */}
      {/* ==================================================================== */}
      <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-[#bbf246]/10 text-[#bbf246]">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8e9b94]">
                Worker Payout Rate
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#152e2a] text-[#2dd4bf]">
                Customizable by Agent
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-[#bbf246] font-mono">
                ${customWorkerRate.toFixed(2)}
              </span>
              <span className="text-xs text-[#8e9b94]">per scan (paid to worker on successful verification)</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-[#0e1411] border border-[#1e2923] rounded-xl p-1.5 self-start sm:self-auto">
          <div className="flex items-center px-2">
            <span className="text-xs font-mono font-bold text-[#8e9b94] mr-1">$</span>
            <input
              type="number"
              step="0.01"
              min="0.05"
              max="5.00"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              className="w-20 bg-transparent text-xs text-white font-mono font-bold focus:outline-none"
            />
          </div>
          <button
            onClick={handleUpdateWorkerRate}
            disabled={isUpdatingRate}
            className="px-3.5 py-1.5 rounded-lg bg-[#bbf246] hover:bg-[#a3e635] text-black font-extrabold text-xs transition-all shadow-sm active:scale-95"
          >
            {isUpdatingRate ? 'Saving...' : 'Set Rate'}
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. ORDER PUBLISHING FORM                                              */}
      {/* ==================================================================== */}
      <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-6 shadow-md space-y-4">
        <div className="flex items-center justify-between border-b border-[#1e2923] pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-[#bbf246]" />
              Publish UPI Scan Order
            </h3>
            <p className="text-xs text-[#8e9b94]">
              Broadcast order to online workers with custom timer and fastest-finger claim.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-black text-[#bbf246] block">
              Scan Fee: ${(publisher?.scan_rate || 0.70).toFixed(2)} / scan
            </span>
            <span className="text-[10px] text-[#8e9b94]">
              (Deducted from balance on success)
            </span>
          </div>
        </div>

        {/* Real-time Online Workers Dispatch Readiness Indicator (User Requirement) */}
        {presence.onlineWorkers > 0 ? (
          <div className="bg-[#152e2a] border border-[#2dd4bf]/40 rounded-xl p-3 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2dd4bf] animate-pulse"></span>
              <span className="text-xs font-bold text-white">
                {presence.onlineWorkers} Worker(s) Online & Actively Scanning
              </span>
            </div>
            <span className="text-[11px] font-bold text-[#2dd4bf] bg-[#0e1411] px-2.5 py-1 rounded-lg border border-[#1e2923] flex items-center gap-1">
              <span>Ready for Immediate Dispatch</span>
            </span>
          </div>
        ) : (
          <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              <span className="text-xs font-bold text-amber-200">
                0 Workers Currently Online
              </span>
            </div>
            <span className="text-[11px] font-semibold text-amber-300">
              Orders will wait in Task Hall until workers activate radar
            </span>
          </div>
        )}

        {/* Insufficient Balance Banner */}
        {(publisher?.balance || 0) < (publisher?.scan_rate || 0.70) && (
          <div className="bg-[#2e1518] border-2 border-rose-500/70 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg animate-pulse">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <span className="text-xs font-black text-rose-200 block">
                  Low Balance: ${(publisher?.balance || 0).toFixed(2)} Available
                </span>
                <span className="text-[11px] text-rose-300">
                  Each scan costs ${(publisher?.scan_rate || 0.70).toFixed(2)}. Please add $5 (scan at $0.70) or take a $10 loan (scan at $0.67) to publish.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsTopupModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[#bbf246] hover:bg-[#a3e635] text-black font-black text-xs shrink-0 shadow-md"
            >
              + Add Balance / $10 Loan
            </button>
          </div>
        )}

        <form onSubmit={handlePublish} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              UPI Payment Link <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. upi://pay?pa=merchant@okaxis&pn=Store&am=100.00&cu=INR"
                value={upiLink}
                onChange={(e) => setUpiLink(e.target.value)}
                disabled={limits?.isLocked}
                className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#bbf246]"
                required
              />
              {upiLink.trim().length > 0 && (
                <span className={`absolute right-3 top-2.5 text-[11px] font-bold px-2 py-0.5 rounded ${
                  isUpiValid ? 'bg-[#152e2a] text-[#2dd4bf]' : 'bg-rose-950 text-rose-400'
                }`}>
                  {isUpiValid ? '✓ Valid UPI' : '✗ Missing "upi"'}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              Merchant Reference <span className="text-[#8e9b94] font-normal">(Optional - auto-generated if blank)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Karnataka-97-RobertHooper23936yAY_outlook.com-f81ed8516d"
              value={merchantRef}
              onChange={(e) => setMerchantRef(e.target.value)}
              disabled={limits?.isLocked}
              className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#bbf246]"
            />
          </div>

          {/* Worker Payout Rate for this order */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              Worker Payout Rate for this Order ($ per completed scan):
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2 text-xs font-mono text-[#8e9b94] font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.05"
                  value={orderWorkerRate}
                  onChange={(e) => setOrderWorkerRate(e.target.value)}
                  className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl pl-7 pr-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#bbf246]"
                />
              </div>
              <button
                type="button"
                onClick={() => setOrderWorkerRate(String(customWorkerRate))}
                className="px-3 py-2 rounded-xl bg-[#1e2923] hover:bg-[#28372f] text-xs text-slate-300 hover:text-white border border-[#1e2923] shrink-0 font-medium"
              >
                Use Default (${customWorkerRate.toFixed(2)})
              </button>
            </div>
            <p className="text-[10px] text-[#8e9b94] mt-1">
              Workers who complete this order will receive this payout amount.
            </p>
          </div>

          {/* Custom Minutes and Seconds */}
          <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300">Set Expiry Timer:</span>
              <button
                type="button"
                onClick={() => { setTimerMinutes(5); setTimerSeconds(0); }}
                className="text-[10px] text-[#bbf246] hover:underline"
              >
                Default 5:00
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 items-center">
              <div>
                <span className="text-[10px] text-[#8e9b94] block mb-1">Minutes:</span>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-[#151c19] border border-[#1e2923] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold"
                />
              </div>
              <div>
                <span className="text-[10px] text-[#8e9b94] block mb-1">Seconds:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={timerSeconds}
                  onChange={(e) => setTimerSeconds(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                  className="w-full bg-[#151c19] border border-[#1e2923] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold"
                />
              </div>
              <div className="text-center bg-[#151c19] border border-[#1e2923] rounded-lg p-1.5">
                <span className="text-[9px] text-[#8e9b94] uppercase font-bold block">Live Timer</span>
                <span className="text-base font-mono font-black text-[#bbf246]">
                  {String(timerMinutes).padStart(2, '0')}:{String(timerSeconds).padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400">
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !isUpiValid || (publisher?.balance || 0) < (publisher?.scan_rate || 0.70)}
            className={`w-full py-3.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 ${
              (publisher?.balance || 0) < (publisher?.scan_rate || 0.70)
                ? 'bg-[#222b26] text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-amber-950/40'
                : isUpiValid
                ? 'bg-[#bbf246] hover:bg-[#a3e635] text-black shadow-lg shadow-[#bbf246]/10 active:scale-[0.99]'
                : 'bg-[#222b26] text-slate-500 cursor-not-allowed'
            }`}
            onClick={(e) => {
              if ((publisher?.balance || 0) < (publisher?.scan_rate || 0.70)) {
                e.preventDefault();
                setIsTopupModalOpen(true);
              }
            }}
          >
            {isSubmitting ? (
              <span>Broadcasting Order to Workers...</span>
            ) : (publisher?.balance || 0) < (publisher?.scan_rate || 0.70) ? (
              <span>⚠️ Add Balance to Publish ($5 @ $0.70 or $10 Loan @ $0.67)</span>
            ) : (
              <span>Publish Order Now (Fee: ${(publisher?.scan_rate || 0.70).toFixed(2)})</span>
            )}
          </button>
        </form>
      </div>

      {/* ==================================================================== */}
      {/* 4. MAIN AGENT DASHBOARD TABS                                         */}
      {/* ==================================================================== */}
      <div className="flex items-center gap-2 border-b border-[#1e2923] pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('live_tracker')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'live_tracker'
              ? 'bg-[#bbf246] text-black shadow-md shadow-[#bbf246]/20'
              : 'text-[#8e9b94] hover:text-white bg-[#151c19]'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Live Task Tracker ({liveTasks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('appeals')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'appeals'
              ? 'bg-[#bbf246] text-black shadow-md shadow-[#bbf246]/20'
              : 'text-[#8e9b94] hover:text-white bg-[#151c19]'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Worker Appeals ({appeals.filter(a => a.status === 'pending').length})</span>
        </button>

        <button
          onClick={() => setActiveTab('manual_queue')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'manual_queue'
              ? 'bg-[#bbf246] text-black shadow-md shadow-[#bbf246]/20'
              : 'text-[#8e9b94] hover:text-white bg-[#151c19]'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Manual Verification Queue</span>
        </button>

        <button
          onClick={() => setActiveTab('success')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'success'
              ? 'bg-emerald-600 text-white'
              : 'text-[#8e9b94] hover:text-white bg-[#151c19]'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Success ({counts.success})</span>
        </button>

        <button
          onClick={() => setActiveTab('expired')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'expired'
              ? 'bg-slate-700 text-white'
              : 'text-[#8e9b94] hover:text-white bg-[#151c19]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Expired ({counts.expired})</span>
        </button>

        <button
          onClick={() => setActiveTab('trial_not_activated')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'trial_not_activated'
              ? 'bg-rose-600 text-white'
              : 'text-[#8e9b94] hover:text-white bg-[#151c19]'
          }`}
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Trial Not Activated ({counts.trial_not_activated})</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB CONTENT 1: LIVE TASK TRACKER (SHOWS WAITING FOR PICKUP & CLAIMED) */}
      {/* User Requirement: "show the agentresult ifsomeone claimed its in      */}
      {/* progress or not ... show agent if there submited task is waiting for   */}
      {/* someone to pickup or not"                                            */}
      {/* ==================================================================== */}
      {activeTab === 'live_tracker' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#bbf246]" />
              Real-Time Task Status: Waiting for Pickup vs Claimed in Progress
            </h3>
            <button 
              onClick={loadOrders} 
              className="text-xs text-[#8e9b94] hover:text-white flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {liveTasks.length === 0 ? (
            <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-8 text-center text-xs text-[#8e9b94]">
              No active tasks right now. Publish a link above to see it waiting for pickup or claimed in progress!
            </div>
          ) : (
            <div className="space-y-3">
              {liveTasks.map((ord) => {
                const isWaiting = ord.status === 'pending';
                const isClaimedInProgress = ord.status === 'claimed';
                const isAwaitingConfirmation = ord.status === 'awaiting_confirmation';
                const isManualReview = ord.status === 'manual_review';

                return (
                  <div
                    key={ord.id}
                    className={`bg-[#151c19] border rounded-xl p-4 shadow-lg space-y-3 transition-all ${
                      isWaiting 
                        ? 'border-cyan-500/50 bg-[#0e1411]' 
                        : isClaimedInProgress
                        ? 'border-indigo-500/50 bg-[#12161f]'
                        : isAwaitingConfirmation
                        ? 'border-[#bbf246]/50 bg-[#141a13]'
                        : 'border-purple-500/50 bg-[#16121f]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-white font-bold">
                            {ord.merchant_reference || ord.id}
                          </span>

                          {/* EXACT STATUS BADGE REQUIRED BY USER */}
                          {isWaiting && (
                            <span className="bg-[#152e2a] text-[#2dd4bf] text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-[#2dd4bf]/40 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-[#2dd4bf] animate-ping"></span>
                              ⏳ WAITING FOR PICKUP (UNCLAIMED)
                            </span>
                          )}

                          {isClaimedInProgress && (
                            <span className="bg-indigo-950 text-indigo-300 text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-indigo-500/40 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                              ⚡ CLAIMED - IN PROGRESS (Worker: {ord.claimed_by_name})
                            </span>
                          )}

                          {isAwaitingConfirmation && (
                            <span className="bg-[#1a3325] text-[#4ade80] text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-[#4ade80]/40">
                              ✓ WORKER COMPLETED - AWAITING CONFIRMATION
                            </span>
                          )}

                          {isManualReview && (
                            <span className="bg-purple-950 text-purple-300 text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-purple-500/40">
                              🛡️ APPEAL / MANUAL REVIEW REQUESTED
                            </span>
                          )}
                        </div>

                        <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3 my-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-[#8e9b94] flex items-center gap-1.5">
                              <LinkIcon className="w-3.5 h-3.5 text-[#bbf246]" />
                              Submitted UPI Order Link
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(ord.upi_link, `live_link_${ord.id}`)}
                              className="px-2.5 py-1 rounded bg-[#1e2923] hover:bg-[#28372f] text-xs font-semibold text-[#bbf246] flex items-center gap-1 transition-all border border-[#1e2923]"
                            >
                              <Copy className="w-3 h-3" />
                              {copiedId === `live_link_${ord.id}` ? 'Copied!' : 'Copy Link'}
                            </button>
                          </div>
                          <div className="bg-[#151c19] border border-[#1e2923] rounded-lg p-2 font-mono text-xs text-white break-all select-all">
                            {ord.upi_link}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#8e9b94] flex-wrap gap-2">
                            <span>Worker Reward: <strong className="text-[#bbf246]">${(ord.worker_rate || customWorkerRate || 0.40).toFixed(2)}</strong></span>
                            <span>Timer Duration: <strong className="text-white">{ord.duration_seconds || 300}s</strong></span>
                            <span>Published: <strong className="text-white">{new Date(ord.created_at).toLocaleTimeString()}</strong></span>
                          </div>
                        </div>

                        <div className="text-[11px] text-[#8e9b94]">
                          {isWaiting && "Broadcasted in live Task Hall. Available for fastest online worker."}
                          {isClaimedInProgress && `Claimed by worker "${ord.claimed_by_name}". Worker is currently scanning.`}
                          {isAwaitingConfirmation && `Worker "${ord.claimed_by_name}" reported task complete. Confirm or reject below.`}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                        {isAwaitingConfirmation && (
                          <>
                            <button
                              onClick={() => handleConfirmOrder(ord.id, 'confirm_success')}
                              className="px-3 py-1.5 rounded-lg bg-[#bbf246] hover:bg-[#a3e635] text-black font-extrabold text-xs flex items-center gap-1 shadow-md shadow-[#bbf246]/10"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Confirm Trial Activated</span>
                            </button>
                            <button
                              onClick={() => handleConfirmOrder(ord.id, 'confirm_failed')}
                              className="px-3 py-1.5 rounded-lg bg-[#222b26] hover:bg-rose-950/40 text-rose-400 border border-rose-900/40 font-bold text-xs"
                            >
                              <span>Trial NOT Activated (-$0.05)</span>
                            </button>
                          </>
                        )}

                        {/* Direct Manual Verification Option when claimed in progress */}
                        {isClaimedInProgress && (
                          <button
                            onClick={() => handleManualVerify(ord.id, 'confirm_success')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-emerald-600/20"
                            title="Manually verify this order if worker is taking too long"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Manual Verify</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB CONTENT 2: WORKER APPEALS & MESSAGES                              */}
      {/* User Requirement: "the worker can also appeal and message gets send   */}
      {/* to agent 3 normal appeal and each is new order id"                   */}
      {/* ==================================================================== */}
      {activeTab === 'appeals' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                Worker Appeals & Message Inbox ({appeals.length})
              </h3>
              <p className="text-xs text-[#8e9b94]">
                Workers can submit up to 3 normal appeals with explanations. Each appeal receives a unique Order ID.
              </p>
            </div>
            <button onClick={loadAppeals} className="text-xs text-[#8e9b94] hover:text-white flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {appeals.length === 0 ? (
            <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-8 text-center text-xs text-[#8e9b94]">
              No worker appeals filed. When a worker appeals an order, their message and new Appeal Order ID will appear here.
            </div>
          ) : (
            <div className="space-y-3">
              {appeals.map((apl) => (
                <div
                  key={apl.id}
                  className="bg-[#151c19] border border-purple-500/40 rounded-xl p-4 shadow-lg space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-purple-300">
                          Appeal ID: {apl.id}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300">
                          Appeal #{apl.appeal_number} of 3
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          apl.status === 'approved' ? 'bg-[#152e2a] text-[#2dd4bf]' : apl.status === 'rejected' ? 'bg-[#2e1518] text-rose-400' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {apl.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 font-medium mt-1">
                        Worker: <strong className="text-white">{apl.worker_name}</strong> • Original Order: <span className="font-mono text-[#8e9b94]">{apl.original_order_id}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {apl.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleOpenReviewModal(apl, 'approve')}
                            className="px-3 py-1.5 rounded-lg bg-[#bbf246] hover:bg-[#a3e635] text-black font-extrabold text-xs flex items-center gap-1 shadow-md shadow-[#bbf246]/10"
                            title="Approve appeal, credit worker wallet, and send feedback via Message Bot"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve & Send Bot Feedback</span>
                          </button>
                          <button
                            onClick={() => handleOpenReviewModal(apl, 'reject')}
                            className="px-3 py-1.5 rounded-lg bg-[#222b26] hover:bg-rose-950/40 text-rose-400 border border-rose-900/40 font-bold text-xs flex items-center gap-1"
                            title="Reject appeal and send explanation to worker via Message Bot"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject with Feedback</span>
                          </button>
                        </>
                      )}

                      {/* Standalone Message Bot dispatch button */}
                      <button
                        onClick={() => {
                          setActiveDirectMessageWorker(apl);
                          setDirectMessageContent('');
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#1e2923] hover:bg-[#28372f] text-slate-300 hover:text-white border border-[#1e2923] text-xs font-semibold flex items-center gap-1"
                        title="Send direct instructions to this worker via FastScan Message Bot"
                      >
                        <Bot className="w-3.5 h-3.5 text-[#2dd4bf]" />
                        <span>Message Bot</span>
                      </button>
                    </div>
                  </div>

                  {/* Worker's direct appeal message & mistake proof */}
                  <div className="bg-[#0e1411] border border-[#1e2923] rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-[#8e9b94]">Worker's Mistake Report:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {apl.mistake_type && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Reason: {apl.mistake_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        {apl.utr && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                            UTR / Txn: {apl.utr}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-200 font-medium bg-[#151c19] p-2 rounded border border-[#1e2923]">
                      "{apl.worker_message}"
                    </p>
                  </div>

                  {/* Message Bot resolution feedback display */}
                  {apl.resolution && (
                    <div className="bg-[#152e2a]/40 border border-[#2dd4bf]/30 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                      <Bot className="w-4 h-4 text-[#2dd4bf] shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#2dd4bf] block">
                          Dispatched via Message Bot to {apl.worker_name}:
                        </span>
                        <p className="text-slate-200 font-medium mt-0.5">"{apl.resolution}"</p>
                        <span className="text-[10px] text-[#8e9b94] block mt-0.5">
                          Resolved on {new Date(apl.resolved_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB CONTENT 3: MANUAL VERIFICATION QUEUE                             */}
      {/* ==================================================================== */}
      {activeTab === 'manual_queue' && (
        <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-5 shadow-lg space-y-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#bbf246]" />
              Manual Verification Queue
            </h3>
            <p className="text-xs text-[#8e9b94]">
              If a worker does not verify by himself, you can manually verify and approve or reject any order here.
            </p>
          </div>

          <div className="space-y-2.5">
            {orders.filter(o => o.status === 'claimed' || o.status === 'manual_review' || o.status === 'awaiting_confirmation').map((ord) => (
              <div key={ord.id} className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-white font-bold">{ord.merchant_reference || ord.id}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">Worker: {ord.claimed_by_name}</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">{ord.status}</span>
                  </div>
                  <p className="font-mono text-slate-400 truncate max-w-lg">{ord.upi_link}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleManualVerify(ord.id, 'confirm_success')}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Manual Success</span>
                  </button>
                  <button
                    onClick={() => handleManualVerify(ord.id, 'confirm_failed')}
                    className="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs"
                  >
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB CONTENT 4, 5, 6: SUCCESS, EXPIRED, TRIAL NOT ACTIVATED TABS       */}
      {/* User Requirements:                                                   */}
      {/* - "allow agents to undo if they made error in verifying"             */}
      {/* - "show the order link they submited and etc"                        */}
      {/* ==================================================================== */}
      {(activeTab === 'success' || activeTab === 'expired' || activeTab === 'trial_not_activated') && (
        <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e2923] pb-2">
            <div>
              <h3 className="text-sm font-bold text-white capitalize">{activeTab.replace(/_/g, ' ')} Orders</h3>
              <p className="text-xs text-[#8e9b94]">
                {activeTab === 'success' && 'Completed orders. Verified payout credited to workers. Agents can undo errors below.'}
                {activeTab === 'expired' && 'Orders where timer ran out without being completed.'}
                {activeTab === 'trial_not_activated' && 'Orders rejected or marked unactivated. Agents can undo errors below.'}
              </p>
            </div>
            <button onClick={loadOrders} className="text-xs text-[#8e9b94] hover:text-white flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          <div className="space-y-3">
            {orders.filter(o => o.status === activeTab).length === 0 ? (
              <div className="text-center py-8 text-xs text-[#8e9b94]">
                No {activeTab.replace(/_/g, ' ')} orders found in current records.
              </div>
            ) : (
              orders.filter(o => o.status === activeTab).map(ord => (
                <div key={ord.id} className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-4 space-y-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-white font-bold text-sm">
                          {ord.merchant_reference || ord.id}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ord.status === 'success' ? 'bg-[#152e2a] text-[#2dd4bf]' :
                          ord.status === 'expired' ? 'bg-slate-800 text-slate-400' :
                          'bg-rose-950 text-rose-300'
                        }`}>
                          {ord.status.toUpperCase().replace(/_/g, ' ')}
                        </span>
                        {ord.claimed_by_name && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                            Worker: <strong>{ord.claimed_by_name}</strong>
                          </span>
                        )}
                        <span className="text-[#8e9b94]">
                          Worker Rate: <strong className="text-[#bbf246]">${(ord.worker_rate || 0.40).toFixed(2)}</strong>
                        </span>
                      </div>
                      <div className="text-[11px] text-[#8e9b94]">
                        Created: {new Date(ord.created_at).toLocaleString()}
                        {ord.completed_at && ` • Verified: ${new Date(ord.completed_at).toLocaleString()}`}
                      </div>
                    </div>

                    {/* Undo Verification Button:
                        User Requirement: "allow agents to undo if they made error in verifying" */}
                    {(ord.status === 'success' || ord.status === 'trial_not_activated') && (
                      <button
                        onClick={() => handleUndoVerify(ord.id)}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm shrink-0"
                        title="Revert verification back to awaiting confirmation and rollback balance or strikes"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>↺ Undo Verification</span>
                      </button>
                    )}
                  </div>

                  {/* Submitted Link with 1-click Copy:
                      User Requirement: "show the order link they submited and etc" */}
                  <div className="bg-[#151c19] border border-[#1e2923] rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-[#8e9b94] flex items-center gap-1">
                        <LinkIcon className="w-3 h-3 text-[#bbf246]" />
                        Submitted UPI Link
                      </span>
                      <button
                        onClick={() => copyToClipboard(ord.upi_link, `tab_link_${ord.id}`)}
                        className="text-[11px] text-[#bbf246] hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedId === `tab_link_${ord.id}` ? 'Copied Link!' : 'Copy Link'}
                      </button>
                    </div>
                    <div className="font-mono text-xs text-slate-200 break-all select-all">
                      {ord.upi_link}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* L2 Worker Key Recruitment Section                                    */}
      {/* User Requirement: "allow naming new joinging key but login using     */}
      {/* the key only"                                                        */}
      {/* ==================================================================== */}
      <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-5 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e2923] pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Key className="w-4 h-4 text-[#bbf246]" />
              Invite & Name New L2 Worker Keys
            </h3>
            <p className="text-xs text-[#8e9b94]">
              Assign names/labels when issuing keys. Workers log in using <strong>only the key</strong> (no name typing required).
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Worker Name / Label (e.g. Rahul Mumbai)"
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              className="bg-[#0e1411] border border-[#1e2923] rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#bbf246] w-48 sm:w-60"
            />
            <button
              onClick={handleGenerateL2WorkerKey}
              disabled={isGeneratingL2Key}
              className="px-3.5 py-1.5 rounded-xl bg-[#bbf246] hover:bg-[#a3e635] text-black font-extrabold text-xs shrink-0 transition-all active:scale-95 flex items-center gap-1"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{isGeneratingL2Key ? 'Generating...' : 'Issue Named Key'}</span>
            </button>
          </div>
        </div>

        {generatedKeyNotice && (
          <div className="bg-[#0e1411] border border-[#2dd4bf]/40 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#2dd4bf]">New L2 Worker Key Generated:</span>
              <button
                onClick={() => copyToClipboard(generatedKeyNotice.key, 'gen_l2')}
                className="px-2.5 py-1 rounded bg-[#2dd4bf] text-black font-bold text-xs flex items-center gap-1 hover:bg-[#2dd4bf]/90"
              >
                <Copy className="w-3 h-3" />
                {copiedId === 'gen_l2' ? 'Copied!' : 'Copy Key'}
              </button>
            </div>
            <div className="font-mono text-sm font-bold text-white bg-[#151c19] p-2 rounded border border-[#1e2923]">
              {generatedKeyNotice.key}
            </div>
            <p className="text-[11px] text-[#8e9b94]">
              {generatedKeyNotice.assigned_name ? (
                <>Pre-assigned Name: <strong className="text-white">{generatedKeyNotice.assigned_name}</strong>. Worker logs in using <strong>key only</strong>.</>
              ) : (
                <>Share with worker. They can enter this key directly to log in.</>
              )}
            </p>
          </div>
        )}

        {/* Existing Issued Keys List */}
        {workerKeys.length > 0 && (
          <div className="space-y-2 pt-1">
            <span className="text-[11px] uppercase font-bold text-[#8e9b94] block">
              Team Worker Keys ({workerKeys.length}):
            </span>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {workerKeys.map((k) => (
                <div key={k.key} className="bg-[#0e1411] border border-[#1e2923] rounded-lg p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-[#2dd4bf]">{k.key}</span>
                    <span className="text-white font-medium">({k.assigned_name || k.label || 'Unlabeled'})</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      k.is_used ? 'bg-slate-800 text-slate-400' : 'bg-[#152e2a] text-[#2dd4bf]'
                    }`}>
                      {k.is_used ? `Active (${k.used_by_name || 'Worker'})` : 'Ready to Redeem'}
                    </span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(k.key, `list_${k.key}`)}
                    className="text-[11px] text-[#bbf246] hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedId === `list_${k.key}` ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      {/* ==================================================================== */}
      {/* APPEAL REVIEW & MESSAGE BOT FEEDBACK MODAL                           */}
      {/* User Requirement: "agent reviews and sends him feedback via message bot" */}
      {/* ==================================================================== */}
      {activeReviewAppeal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in fade-in">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1e2923] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#2dd4bf]/10 border border-[#2dd4bf]/40 flex items-center justify-center text-[#2dd4bf]">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Review Appeal & Send Bot Feedback
                  </h3>
                  <p className="text-xs text-[#8e9b94]">
                    Dispatch official feedback to <strong>{activeReviewAppeal.worker_name}</strong> via Message Bot
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveReviewAppeal(null)}
                className="text-[#8e9b94] hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Appeal Details Card */}
            <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-purple-300 font-bold">Appeal ID: {activeReviewAppeal.id}</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-[10px]">
                  Appeal #{activeReviewAppeal.appeal_number} of 3
                </span>
              </div>
              <div className="text-slate-300">
                Original Order: <span className="font-mono text-white font-bold">{activeReviewAppeal.merchant_reference || activeReviewAppeal.original_order_id}</span>
              </div>
              <div className="bg-[#151c19] border border-[#1e2923] rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-[#8e9b94] block mb-1">Worker's Mistake Report:</span>
                <p className="text-slate-200 font-medium select-all">"{activeReviewAppeal.worker_message}"</p>
              </div>
            </div>

            {/* Decision Selector */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">
                Review Decision:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReviewAction('approve');
                    setReviewFeedback('UTR verified in bank statement. Payment confirmed and credited to your wallet.');
                  }}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                    reviewAction === 'approve'
                      ? 'bg-[#bbf246] text-black border-[#bbf246] shadow-md shadow-[#bbf246]/20'
                      : 'bg-[#0e1411] text-slate-400 border-[#1e2923] hover:text-white'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>Approve Appeal</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setReviewAction('reject');
                    setReviewFeedback('Checked bank statement for this timestamp; no matching transaction was found.');
                  }}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                    reviewAction === 'reject'
                      ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30'
                      : 'bg-[#0e1411] text-slate-400 border-[#1e2923] hover:text-white'
                  }`}
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject Appeal</span>
                </button>
              </div>
            </div>

            {/* Quick response suggestions */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-300 block">
                Quick Bot Feedback Templates:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(reviewAction === 'approve' ? [
                  "UTR verified in bank statement. Payment confirmed and credited.",
                  "Payment received successfully. Scan reward credited. Good job!",
                  "Verified proof. Transaction has been confirmed in merchant portal."
                ] : [
                  "Checked bank statement for this timestamp; no matching transaction found.",
                  "Please submit the correct 12-digit UTR number from your payment app.",
                  "Payment link expired before transfer was executed."
                ]).map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => setReviewFeedback(tpl)}
                    className="text-[10px] bg-[#0e1411] hover:bg-[#1e2923] text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-[#1e2923] transition-all text-left"
                  >
                    + {tpl}
                  </button>
                ))}
              </div>
            </div>

            {/* Feedback Content Textarea */}
            <form onSubmit={handleConfirmReviewAppeal} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Message Bot Feedback to Worker: <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                  placeholder="Type feedback that the Message Bot will deliver directly to the worker..."
                  required
                  className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#2dd4bf]"
                />
              </div>

              <div className="bg-[#152e2a]/50 border border-[#2dd4bf]/40 rounded-xl p-2.5 text-[11px] text-[#2dd4bf] flex items-center gap-2">
                <Bot className="w-4 h-4 shrink-0 text-[#2dd4bf]" />
                <span>
                  This feedback will be instantly delivered to <strong>{activeReviewAppeal.worker_name}</strong> via FastScan Message Bot.
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveReviewAppeal(null)}
                  className="flex-1 py-2.5 rounded-xl bg-[#1e2923] hover:bg-[#28372f] text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview || !reviewFeedback.trim()}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-black shadow-lg transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                    reviewAction === 'approve'
                      ? 'bg-[#bbf246] hover:bg-[#a3e635] text-black shadow-[#bbf246]/20'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>{isSubmittingReview ? 'Dispatching...' : `Confirm & Send via Message Bot`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* STANDALONE MESSAGE BOT DISPATCH MODAL                                */}
      {/* ==================================================================== */}
      {activeDirectMessageWorker && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#1e2923] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#2dd4bf]/10 border border-[#2dd4bf]/40 flex items-center justify-center text-[#2dd4bf]">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Send Direct Bot Message</h3>
                  <p className="text-xs text-[#8e9b94]">To Worker: <strong>{activeDirectMessageWorker.worker_name}</strong></p>
                </div>
              </div>
              <button onClick={() => setActiveDirectMessageWorker(null)} className="text-[#8e9b94] hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSendDirectBotMessage} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Message / Instructions:
                </label>
                <textarea
                  rows={4}
                  value={directMessageContent}
                  onChange={(e) => setDirectMessageContent(e.target.value)}
                  placeholder="e.g. Please reply with the 12-digit UTR number from your payment app, or re-verify in PhonePe..."
                  required
                  className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#2dd4bf]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveDirectMessageWorker(null)}
                  className="flex-1 py-2 rounded-xl bg-[#1e2923] text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!directMessageContent.trim()}
                  className="flex-1 py-2 rounded-xl bg-[#2dd4bf] hover:bg-[#2dd4bf]/90 text-black font-extrabold text-xs flex items-center justify-center gap-1.5"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Send via Message Bot</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: TOP-UP BALANCE & $10 CREDIT LOAN                              */}
      {/* User Requirement: "agents they will pay on each scan let them add     */}
      {/* balance in the website like 5$ one time and they can scan 0.7$ per    */}
      {/* scan loan 10$ and scan at 0.67$ like that"                           */}
      {/* ==================================================================== */}
      {isTopupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-[#151c19] border-2 border-[#2dd4bf]/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-[#1e2923] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#152e2a] border border-[#2dd4bf]/40 flex items-center justify-center text-[#2dd4bf]">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Add Balance & Pricing Tier</h3>
                  <p className="text-xs text-[#8e9b94]">Select a deposit pack or activate an instant credit loan</p>
                </div>
              </div>
              <button
                onClick={() => setIsTopupModalOpen(false)}
                className="text-[#8e9b94] hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* Current Balance Display */}
            <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs text-[#8e9b94]">Current Available Balance:</span>
              <span className="text-lg font-black text-white font-mono">${(publisher?.balance || 0).toFixed(2)}</span>
            </div>

            {/* Tier Option Cards */}
            <div className="space-y-3">
              {/* Option 1: Starter $5 */}
              <div 
                onClick={() => setSelectedTopupTier('starter_5')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedTopupTier === 'starter_5'
                    ? 'bg-[#152e2a]/80 border-[#bbf246] shadow-md shadow-[#bbf246]/10'
                    : 'bg-[#0e1411] border-[#1e2923] hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-white text-sm">Starter Pack — $5 One-Time</span>
                      <span className="bg-[#152e2a] text-[#bbf246] text-[10px] font-black px-2 py-0.5 rounded border border-[#bbf246]/30">
                        $0.70 / scan
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      Pay $5.00 one time. You can publish ~7 scans at <strong>$0.70</strong> each.
                    </p>
                  </div>
                  <span className="font-mono font-black text-lg text-white">$5.00</span>
                </div>
              </div>

              {/* Option 2: $10 Loan / Volume Pack */}
              <div 
                onClick={() => setSelectedTopupTier('volume_loan_10')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all relative overflow-hidden ${
                  selectedTopupTier === 'volume_loan_10'
                    ? 'bg-[#152e2a]/80 border-[#2dd4bf] shadow-md shadow-[#2dd4bf]/10'
                    : 'bg-[#0e1411] border-[#1e2923] hover:border-slate-700'
                }`}
              >
                <div className="absolute top-0 right-0 bg-[#2dd4bf] text-black font-black text-[9px] px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                  Best Value • Instant Loan Available
                </div>
                <div className="flex items-start justify-between mt-1">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-white text-sm">Volume Loan — $10 Credit</span>
                      <span className="bg-[#152e2a] text-[#2dd4bf] text-[10px] font-black px-2 py-0.5 rounded border border-[#2dd4bf]/40">
                        $0.67 / scan
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      Instant $10 credit loan. Unlocks lowest rate of <strong>$0.67</strong>/scan (~15 scans).
                    </p>
                  </div>
                  <span className="font-mono font-black text-lg text-[#2dd4bf]">$10.00</span>
                </div>
              </div>

              {/* Option 3: Custom Amount */}
              <div 
                onClick={() => setSelectedTopupTier('custom')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedTopupTier === 'custom'
                    ? 'bg-[#152e2a]/80 border-[#2dd4bf]'
                    : 'bg-[#0e1411] border-[#1e2923] hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-white text-sm">Custom Top-Up Amount</span>
                  <span className="text-xs text-[#8e9b94]">≥ $10 unlocks $0.67/scan</span>
                </div>
                {selectedTopupTier === 'custom' && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-sm font-mono text-slate-400">$</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={customTopupAmount}
                      onChange={(e) => setCustomTopupAmount(e.target.value)}
                      placeholder="e.g. 20.00"
                      className="bg-[#0a0e0d] border border-[#1e2923] rounded-xl px-3 py-1.5 text-xs text-white font-mono flex-1"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Payment Method / Instant Loan Activation */}
            <div className="space-y-2 pt-2 border-t border-[#1e2923]">
              <label className="text-xs font-bold text-slate-300 block">Payment / Activation Method:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTopupPaymentMethod('instant_loan')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                    topupPaymentMethod === 'instant_loan'
                      ? 'bg-[#2dd4bf] text-black'
                      : 'bg-[#0e1411] text-[#8e9b94] border border-[#1e2923]'
                  }`}
                >
                  ⚡ Instant Credit
                </button>
                <button
                  type="button"
                  onClick={() => setTopupPaymentMethod('upi')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                    topupPaymentMethod === 'upi'
                      ? 'bg-[#bbf246] text-black'
                      : 'bg-[#0e1411] text-[#8e9b94] border border-[#1e2923]'
                  }`}
                >
                  UPI Pay
                </button>
                <button
                  type="button"
                  onClick={() => setTopupPaymentMethod('binance')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                    topupPaymentMethod === 'binance'
                      ? 'bg-[#bbf246] text-black'
                      : 'bg-[#0e1411] text-[#8e9b94] border border-[#1e2923]'
                  }`}
                >
                  Binance Pay
                </button>
              </div>

              {topupPaymentMethod !== 'instant_loan' && (
                <div className="space-y-2 pt-2">
                  <div className="bg-[#0a0e0d] border border-[#1e2923] rounded-xl p-2.5 text-[11px] text-slate-300">
                    Send payment to Boss: <strong className="font-mono text-[#bbf246]">{bossPaymentInfo?.upi_id || 'boss@okaxis'}</strong>
                  </div>
                  <input
                    type="text"
                    placeholder="Transaction Reference / UTR"
                    value={topupPaymentRef}
                    onChange={(e) => setTopupPaymentRef(e.target.value)}
                    className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleTopup}
              disabled={isSubmittingTopup}
              className="w-full py-3 rounded-xl bg-[#bbf246] hover:bg-[#a3e635] text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#bbf246]/10 active:scale-95 transition-all"
            >
              {isSubmittingTopup ? 'Processing...' : (
                selectedTopupTier === 'volume_loan_10'
                  ? 'Confirm & Activate $10 Loan ($0.67/scan)'
                  : selectedTopupTier === 'starter_5'
                  ? 'Confirm & Add $5 Balance ($0.70/scan)'
                  : 'Confirm & Add Custom Balance'
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: HOW TO PUBLISH STEP-BY-STEP GUIDE                             */}
      {/* User Requirement: "now tell how to publish it"                       */}
      {/* ==================================================================== */}
      {showPublishGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-[#151c19] border-2 border-[#bbf246]/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-[#1e2923] pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#bbf246]" />
                <h3 className="text-base font-black text-white">How to Publish UPI Scan Orders</h3>
              </div>
              <button
                onClick={() => setShowPublishGuideModal(false)}
                className="text-[#8e9b94] hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3 space-y-1">
                <div className="font-bold text-[#bbf246] flex items-center gap-1.5">
                  <span>Step 1:</span>
                  <span>Check Balance & Online Workers</span>
                </div>
                <p className="text-[#8e9b94]">
                  Ensure your prepaid balance has at least $0.70 ($5 starter pack) or $0.67 ($10 loan). Check the green online worker badge to confirm active scanners.
                </p>
              </div>

              <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3 space-y-1">
                <div className="font-bold text-[#2dd4bf] flex items-center gap-1.5">
                  <span>Step 2:</span>
                  <span>Paste Your UPI Link</span>
                </div>
                <p className="text-[#8e9b94]">
                  Paste any valid UPI link (e.g. <code className="text-white font-mono">upi://pay?pa=merchant@okaxis&pn=Shop&am=100.00&cu=INR</code>). The system validates the UPI protocol automatically.
                </p>
              </div>

              <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3 space-y-1">
                <div className="font-bold text-sky-400 flex items-center gap-1.5">
                  <span>Step 3:</span>
                  <span>Set Timer & Worker Reward</span>
                </div>
                <p className="text-[#8e9b94]">
                  Default timer is 5 minutes (300 seconds). Set the worker reward payout (e.g. $0.40 or $0.50).
                </p>
              </div>

              <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <span>Step 4:</span>
                  <span>Click Publish — Broadcast to Workers</span>
                </div>
                <p className="text-[#8e9b94]">
                  The order is instantly broadcasted to online workers & Telegram bot. When the worker scans and you confirm success, your scan fee ($0.70 or $0.67) is deducted from your balance.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowPublishGuideModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#bbf246] hover:bg-[#a3e635] text-black font-extrabold text-xs"
            >
              Got it, let's publish!
            </button>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
