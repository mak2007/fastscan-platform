import React, { useState, useEffect } from 'react';
import { socket } from './socket.js';
import RoleSwitcher from './components/RoleSwitcher.jsx';
import Navbar from './components/Navbar.jsx';
import AgentPanel from './views/AgentPanel.jsx';
import WorkerPanel from './views/WorkerPanel.jsx';
import BossPanel from './views/BossPanel.jsx';
import { soundFX } from './components/AudioChime.js';

export default function App() {
  // Persistent Session: Do not ask for login each time they open/refresh website
  const [currentRole, setCurrentRole] = useState(() => {
    return localStorage.getItem('fastscan_role') || 'agent';
  });
  const [currentUserId, setCurrentUserId] = useState(() => {
    return localStorage.getItem('fastscan_user_id') || 'agent_prime';
  });
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [presence, setPresence] = useState({
    onlineWorkers: 1,
    onlinePublishers: 1
  });

  const [currentUserObj, setCurrentUserObj] = useState(() => {
    const savedId = localStorage.getItem('fastscan_user_id') || 'agent_prime';
    const savedRole = localStorage.getItem('fastscan_role') || 'agent';
    const savedName = localStorage.getItem('fastscan_user_name') || 'Alpha Publisher (L1 Boss)';
    return {
      id: savedId,
      name: savedName,
      role: savedRole
    };
  });

  // Switch role handler with localStorage persistence
  const handleSelectRole = (role, userId, customName) => {
    setCurrentRole(role);
    setCurrentUserId(userId);

    const userNames = {
      'agent_prime': { name: 'Alpha Publisher (L1 Boss)', role: 'agent' },
      'worker_alex': { name: 'Alex (L2 Worker)', role: 'worker' },
      'worker_leo': { name: 'Leo (L2 Worker)', role: 'worker' },
      'boss_admin': { name: 'Superadmin (Platform Master)', role: 'boss' }
    };

    const resolvedName = customName || userNames[userId]?.name || userId;

    const userObj = {
      id: userId,
      name: resolvedName,
      role
    };

    setCurrentUserObj(userObj);

    // Persist session to localStorage
    localStorage.setItem('fastscan_role', role);
    localStorage.setItem('fastscan_user_id', userId);
    localStorage.setItem('fastscan_user_name', resolvedName);

    // Register with Socket.IO
    socket.emit('register_presence', { role, userId });
  };

  useEffect(() => {
    // Initial presence registration
    socket.emit('register_presence', { role: currentRole, userId: currentUserId });

    socket.on('presence_update', (data) => {
      setPresence(data);
    });

    // Sound notification when task arrives in task hall
    socket.on('new_order_available', (newOrder) => {
      if (soundEnabled && currentRole === 'worker') {
        soundFX.playNewOrderChime();
      }
    });

    socket.on('worker_penalty', (data) => {
      if (data.workerId === currentUserId) {
        if (soundEnabled) soundFX.playWarningBuzzer();
        alert(data.message);
      }
    });

    socket.on('publisher_unlocked', (data) => {
      if (data.publisherId === currentUserId) {
        if (soundEnabled) soundFX.playSuccessChime();
        alert('Payment verified! Super Boss has unlocked your publishing rights.');
      }
    });

    // Worker appeal notification to Agent
    socket.on('new_appeal_submitted', (appeal) => {
      if (currentRole === 'agent' && appeal.publisher_id === currentUserId) {
        if (soundEnabled) soundFX.playNewOrderChime();
        alert(`🔔 New Worker Appeal Received!\nOrder ID: ${appeal.id}\nWorker: ${appeal.worker_name}\nMessage: "${appeal.worker_message}"`);
      }
    });

    // Appeal resolution notification to Worker
    socket.on('appeal_resolved', (data) => {
      if (currentRole === 'worker' && data.workerId === currentUserId) {
        if (soundEnabled) {
          if (data.status === 'approved') soundFX.playSuccessChime();
          else soundFX.playWarningBuzzer();
        }
        alert(`Appeal ${data.appealId} has been ${data.status.toUpperCase()} by Agent!`);
      }
    });

    return () => {
      socket.off('presence_update');
      socket.off('new_order_available');
      socket.off('worker_penalty');
      socket.off('publisher_unlocked');
      socket.off('new_appeal_submitted');
      socket.off('appeal_resolved');
    };
  }, [currentRole, currentUserId, soundEnabled]);

  return (
    <div className="min-h-screen bg-[#0a0e0d] text-slate-100 flex flex-col">
      {/* 1. Quick Role Switcher Bar with Key Redemption */}
      <RoleSwitcher
        currentRole={currentRole}
        currentUserId={currentUserId}
        currentUser={currentUserObj}
        onSelectRole={handleSelectRole}
      />

      {/* 2. Top Header & Live Presence Navbar */}
      <Navbar
        role={currentRole}
        user={currentUserObj}
        presence={presence}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
      />

      {/* 3. Main Role Interface */}
      <main className="flex-1">
        {currentRole === 'agent' && (
          <AgentPanel
            publisherId={currentUserId}
            presence={presence}
            soundEnabled={soundEnabled}
          />
        )}

        {currentRole === 'worker' && (
          <WorkerPanel
            workerId={currentUserId}
            presence={presence}
            soundEnabled={soundEnabled}
          />
        )}

        {currentRole === 'boss' && (
          <BossPanel
            soundEnabled={soundEnabled}
          />
        )}
      </main>

      {/* 4. Bottom info bar */}
      <footer className="border-t border-[#1e2923] bg-[#0a0e0d] py-3 px-4 text-center text-xs text-[#8e9b94]">
        <p>UPI Scan Marketplace • Superadmin &rarr; Tier 1: L1 Boss &rarr; Tier 2: L2 Worker</p>
      </footer>
    </div>
  );
}
