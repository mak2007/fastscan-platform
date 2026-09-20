import React, { useState } from 'react';
import { ShieldCheck, Send, Smartphone, Network, Key, X, ArrowRight, LogOut } from 'lucide-react';
import { api } from '../services/api.js';

export default function RoleSwitcher({ currentRole, currentUserId, currentUser, onSelectRole }) {
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [redeemKeyInput, setRedeemKeyInput] = useState('');
  const [redeemNameInput, setRedeemNameInput] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState('');

  const devRoles = [
    { id: 'boss_admin', role: 'boss', label: 'Superadmin (Platform Master)' },
    { id: 'agent_prime', role: 'agent', label: '1st: L1 Boss Panel (Agent)' },
    { id: 'worker_alex', role: 'worker', label: '2nd: L2 Worker Panel (Alex)' },
    { id: 'worker_leo', role: 'worker', label: 'L2 Worker (Leo)' }
  ];

  // Key-Only Login / Redemption:
  // User Requirement: "allow naming new joinging key but login using the key only"
  const handleRedeem = async (e) => {
    e.preventDefault();
    setRedeemError('');

    const cleanKey = redeemKeyInput.trim();
    const cleanName = redeemNameInput.trim();

    if (!cleanKey) {
      setRedeemError('Please enter your invitation or access key.');
      return;
    }

    try {
      setIsRedeeming(true);
      // Name is optional - backend falls back to key's assigned_name / label or existing account
      const res = await api.redeemKey(cleanKey, cleanName || undefined);
      setShowRedeemModal(false);
      setRedeemKeyInput('');
      setRedeemNameInput('');
      alert(`🎉 ${res.message}`);
      // Switch directly to the activated user and role with full session persistence
      onSelectRole(res.role, res.user.id, res.user.name);
    } catch (err) {
      setRedeemError(err.message || 'Key activation failed. Please check the code.');
    } finally {
      setIsRedeeming(false);
    }
  };

  const quickFillKey = (k) => {
    setRedeemKeyInput(k);
    setRedeemError('');
  };

  return (
    <>
      {/* ==================================================================== */}
      {/* TOP STATUS & NAVIGATION BAR                                          */}
      {/* User Requirement: "keep boss and worker panel diff okay"             */}
      {/* Workers only see Worker Task Hall controls; Bosses see Agent Console */}
      {/* ==================================================================== */}
      <div className="bg-[#0e1411] border-b border-[#1e2923] sticky top-0 z-50 px-3 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          
          {/* LEFT: Current Panel Identity */}
          <div className="flex items-center gap-2.5">
            {currentRole === 'worker' ? (
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-[#152e2a] text-[#2dd4bf] border border-[#2dd4bf]/40 flex items-center gap-1.5 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-[#2dd4bf] animate-pulse"></span>
                  L2 Worker Panel (Task Hall)
                </span>
                <span className="text-xs text-slate-300 font-semibold hidden md:inline">
                  Logged in: <strong className="text-white">{currentUser?.name || 'Worker'}</strong>
                </span>
              </div>
            ) : currentRole === 'agent' ? (
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-[#bbf246] text-black shadow-md shadow-[#bbf246]/20 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-black animate-pulse"></span>
                  L1 Boss Panel (Agent Console)
                </span>
                <span className="text-xs text-slate-300 font-semibold hidden md:inline">
                  Merchant / Publisher: <strong className="text-white">{currentUser?.name || 'Alpha Publisher'}</strong>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Superadmin Master Console
                </span>
              </div>
            )}
          </div>

          {/* RIGHT: Role Actions & Key Access */}
          <div className="flex items-center gap-2">
            {/* Superadmin cross-link only for Boss / Agent */}
            {currentRole === 'agent' && (
              <button
                onClick={() => onSelectRole('boss', 'boss_admin')}
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 transition-colors hidden sm:inline"
                title="Open Superadmin Master Console"
              >
                Superadmin &rarr;
              </button>
            )}

            {currentRole === 'boss' && (
              <button
                onClick={() => onSelectRole('agent', 'agent_prime')}
                className="text-xs text-[#bbf246] hover:underline px-2 py-1 transition-colors"
                title="View L1 Boss Panel"
              >
                L1 Boss Console &rarr;
              </button>
            )}

            {/* Key-Only Login / Switch Key Button */}
            <button
              onClick={() => setShowRedeemModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#151c19] hover:bg-[#1e2923] text-[#bbf246] border border-[#1e2923] hover:border-[#bbf246]/40 transition-all shadow-sm active:scale-95"
              title="Log in with an L1 Boss Key or L2 Worker Key"
            >
              <Key className="w-3.5 h-3.5 text-[#bbf246]" />
              <span>Login with Key</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* KEY-ONLY LOGIN & REDEMPTION MODAL                                    */}
      {/* User Requirement: "allow naming new joinging key but login using     */}
      {/* the key only and keep boss and worker panel diff okay"               */}
      {/* ==================================================================== */}
      {showRedeemModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#151c19] border border-[#1e2923] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1e2923] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#bbf246]/10 text-[#bbf246]">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Login Using Key Only</h3>
                  <p className="text-[11px] text-[#8e9b94]">Enter your assigned key to enter your panel</p>
                </div>
              </div>
              <button
                onClick={() => setShowRedeemModal(false)}
                className="text-[#8e9b94] hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Demo Keys for Instant One-Click Login */}
            <div className="bg-[#0e1411] border border-[#1e2923] rounded-xl p-3 space-y-2">
              <span className="text-[10px] uppercase font-bold text-[#8e9b94] block tracking-wider">
                Click a demo key to test 1-click key login:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => quickFillKey('L1-BOSS-DEMO-991')}
                  className="text-left bg-[#151c19] hover:bg-[#1e2923] border border-[#bbf246]/30 rounded-lg p-2.5 transition-all group"
                >
                  <span className="text-[10px] font-bold text-[#bbf246] block group-hover:underline">1st: L1 Boss Key</span>
                  <span className="font-mono text-xs text-white font-bold block">L1-BOSS-DEMO-991</span>
                  <span className="text-[9px] text-[#8e9b94]">Enters L1 Boss Panel</span>
                </button>

                <button
                  type="button"
                  onClick={() => quickFillKey('L2-WORKER-DEMO-442')}
                  className="text-left bg-[#151c19] hover:bg-[#1e2923] border border-[#2dd4bf]/30 rounded-lg p-2.5 transition-all group"
                >
                  <span className="text-[10px] font-bold text-[#2dd4bf] block group-hover:underline">2nd: L2 Worker Key</span>
                  <span className="font-mono text-xs text-white font-bold block">L2-WORKER-DEMO-442</span>
                  <span className="text-[9px] text-[#8e9b94]">Enters L2 Worker Panel</span>
                </button>
              </div>
            </div>

            {/* Key Login Form */}
            <form onSubmit={handleRedeem} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Invitation / Access Key <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. L1-BOSS-xxxx-xxxx or L2-WORKER-xxxx-xxxx"
                  value={redeemKeyInput}
                  onChange={(e) => setRedeemKeyInput(e.target.value)}
                  className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-[#bbf246]"
                  required
                  autoFocus
                />
                <p className="text-[10px] text-[#8e9b94] mt-1">
                  ✓ Login using only your key. Your account name was assigned when the key was created.
                </p>
              </div>

              {/* Optional Custom Display Name Override */}
              <div className="pt-0.5">
                <details className="group">
                  <summary className="text-[11px] text-[#8e9b94] hover:text-slate-300 cursor-pointer select-none">
                    + Optional: Set or override custom display name
                  </summary>
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Custom display name (optional)"
                      value={redeemNameInput}
                      onChange={(e) => setRedeemNameInput(e.target.value)}
                      className="w-full bg-[#0e1411] border border-[#1e2923] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#bbf246]"
                    />
                  </div>
                </details>
              </div>

              {redeemError && (
                <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs">
                  {redeemError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRedeemModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-[#1e2923] hover:bg-[#27352e] text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRedeeming || !redeemKeyInput.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-[#bbf246] hover:bg-[#a3e635] text-black text-xs font-extrabold shadow-md shadow-[#bbf246]/20 transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  {isRedeeming ? (
                    <span>Logging In...</span>
                  ) : (
                    <>
                      <span>Log In with Key</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Developer Fast Role Switcher (Hidden in small details) */}
            <details className="mt-2 pt-2 border-t border-[#1e2923] text-center">
              <summary className="text-[10px] text-slate-500 hover:text-slate-400 cursor-pointer select-none">
                ⚙️ Developer Fast Switch (Testing Mode)
              </summary>
              <div className="flex items-center justify-center gap-1.5 pt-2 flex-wrap">
                {devRoles.map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setShowRedeemModal(false);
                      onSelectRole(r.role, r.id);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] border transition-all ${
                      currentUserId === r.id
                        ? 'bg-[#bbf246] text-black border-[#bbf246]'
                        : 'bg-[#0e1411] text-slate-400 border-[#1e2923] hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </details>
          </div>
        </div>
      )}
    </>
  );
}
