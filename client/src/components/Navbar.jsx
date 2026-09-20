import React, { useState } from 'react';
import { Zap, Users, Radio, Volume2, VolumeX, Shield, UserCheck } from 'lucide-react';

export default function Navbar({ role, user, presence, soundEnabled, setSoundEnabled }) {
  return (
    <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-10 z-40 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Logo and Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base sm:text-lg tracking-tight text-white">
                FastScan<span className="text-indigo-400">UPI</span>
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                v2.0 Realtime
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Boss & Worker High-Speed Scanning Marketplace
            </p>
          </div>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Agent sees online workers */}
          {(role === 'agent' || role === 'boss') && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <Users className="w-3.5 h-3.5 ml-0.5" />
              <span>{presence.onlineWorkers} Workers Online</span>
            </div>
          )}

          {/* Worker sees online publishers */}
          {(role === 'worker' || role === 'boss') && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <Radio className="w-3.5 h-3.5 ml-0.5" />
              <span>{presence.onlinePublishers} Publishers Online</span>
            </div>
          )}

          {/* Audio toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              soundEnabled
                ? 'bg-slate-800 text-indigo-400 border-indigo-500/30 hover:bg-slate-700'
                : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'
            }`}
            title={soundEnabled ? 'Sound Alerts On' : 'Sound Alerts Muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* User Badge */}
          {user && (
            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                {user.name.charAt(0)}
              </div>
              <div className="text-left">
                <div className="text-xs font-medium text-slate-200 leading-none">{user.name}</div>
                <div className="text-[10px] text-slate-400 uppercase font-mono">{user.role}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
