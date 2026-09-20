/**
 * Priority Queue & 5-Minute Active Liveness Radar Engine
 * 
 * Rules:
 * 1. Minimum 5 QR Scanned requirement for Priority Queue eligibility.
 * 2. Success Rate Ranking: High-priority workers with highest success rate % get first offer.
 * 3. 5-Minute Active Liveness Radar: Session automatically stops after 5 minutes and
 *    returns "0 orders found, tap Scan Again to ensure online".
 */

import { db } from '../db.js';

class PriorityQueueEngine {
  constructor() {
    // Map of workerId -> { workerId, chatId, startedAt, expiresAt, durationSeconds, lastAlertOrderId }
    this.activeSessions = new Map();
    this.sessionExpiryCheckInterval = null;
    this.onSessionExpiredCallback = null;
    this.startExpiryMonitor();
  }

  setExpiryCallback(cb) {
    this.onSessionExpiredCallback = cb;
  }

  /**
   * Start a 5-minute active liveness scanning session for a worker
   */
  startScanningSession(workerId, chatId, durationSeconds = 300) {
    const now = Date.now();
    const expiresAt = now + durationSeconds * 1000;

    const session = {
      workerId,
      chatId,
      startedAt: now,
      expiresAt,
      durationSeconds
    };

    this.activeSessions.set(workerId, session);

    // Ensure worker is marked online in database
    db.updateUser(workerId, {
      is_online: true,
      telegram_chat_id: chatId,
      last_active_at: new Date(now).toISOString()
    });

    return session;
  }

  /**
   * Stop an active scanning session
   */
  stopScanningSession(workerId, markOffline = true) {
    const session = this.activeSessions.get(workerId);
    this.activeSessions.delete(workerId);

    if (markOffline) {
      db.updateUser(workerId, { is_online: false });
    }

    return session;
  }

  /**
   * Check if a worker currently has an active radar session
   */
  isSessionActive(workerId) {
    const session = this.activeSessions.get(workerId);
    if (!session) return false;
    if (Date.now() >= session.expiresAt) {
      this.activeSessions.delete(workerId);
      return false;
    }
    return true;
  }

  /**
   * Get remaining seconds in a worker's active scanning session
   */
  getRemainingSeconds(workerId) {
    const session = this.activeSessions.get(workerId);
    if (!session) return 0;
    const remaining = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
    return remaining;
  }

  /**
   * Calculate worker performance metrics: Total Scans, Success Rate %, and Priority Eligibility
   */
  calculateWorkerMetrics(workerId) {
    const worker = db.getUser(workerId);
    if (!worker) return null;

    const allOrders = db.getOrders().filter(o => o.claimed_by === workerId);
    const successfulOrders = allOrders.filter(o => o.status === 'success');
    const failedOrders = allOrders.filter(o => o.status === 'expired' || o.status === 'trial_not_activated');

    const successfulCount = Math.max(worker.total_personal_completed || 0, successfulOrders.length);
    const failedCount = failedOrders.length;
    const totalScans = successfulCount + failedCount;

    let successRate = 0;
    if (totalScans > 0) {
      successRate = +((successfulCount / totalScans) * 100).toFixed(1);
    } else {
      successRate = 0;
    }

    const isPriorityEligible = totalScans >= 5;

    return {
      workerId: worker.id,
      workerName: worker.name,
      level: worker.level || 1,
      balance: worker.balance || 0,
      totalScans,
      successfulCount,
      failedCount,
      successRate,
      isPriorityEligible,
      minScansRequired: 5,
      scansNeededForPriority: Math.max(0, 5 - totalScans),
      isScanningRadarActive: this.isSessionActive(workerId),
      remainingSeconds: this.getRemainingSeconds(workerId),
      consecutiveFailures: worker.consecutive_failures || 0,
      isBanned: Boolean(worker.is_banned),
      isTimedOut: Boolean(worker.timeout_until && new Date(worker.timeout_until).getTime() > Date.now()),
      tier: isPriorityEligible ? 'Priority Tier (Top Success Rate)' : 'Beginner Tier (Building 5 Scans)'
    };
  }

  /**
   * Rank all actively scanning workers for an incoming order based on:
   * 1. Active 5-minute scanning radar
   * 2. Not banned, not timed out, not already on an active task
   * 3. Tier 1: total_scans >= 5, sorted by highest success_rate descending
   * 4. Tier 2: total_scans < 5, sorted by total_scans descending
   */
  rankWorkersForOrder(order) {
    const now = Date.now();
    const activeCandidates = [];

    for (const [workerId, session] of this.activeSessions.entries()) {
      if (now >= session.expiresAt) continue;

      const worker = db.getUser(workerId);
      if (!worker || worker.role !== 'worker') continue;
      if (worker.is_banned) continue;
      if (worker.timeout_until && new Date(worker.timeout_until).getTime() > now) continue;

      // Check if worker already has 3 active tasks they haven't finished
      // User Requirement: "they can claim upto 3 orders at a time"
      const activeCount = db.getOrders().filter(o => 
        o.claimed_by === workerId && 
        (o.status === 'claimed' || o.status === 'awaiting_confirmation')
      ).length;
      if (activeCount >= 3) continue;

      const metrics = this.calculateWorkerMetrics(workerId);
      activeCandidates.push({
        ...metrics,
        chatId: session.chatId,
        sessionStartedAt: session.startedAt,
        sessionExpiresAt: session.expiresAt
      });
    }

    // Split into Tier 1 (Priority >= 5 scans) and Tier 2 (Beginner < 5 scans)
    const tier1Priority = activeCandidates.filter(c => c.isPriorityEligible);
    const tier2Beginner = activeCandidates.filter(c => !c.isPriorityEligible);

    // Sort Tier 1: Highest success rate first. If tied, most total scans first.
    tier1Priority.sort((a, b) => {
      if (b.successRate !== a.successRate) {
        return b.successRate - a.successRate;
      }
      return b.totalScans - a.totalScans;
    });

    // Sort Tier 2: Most scans completed first.
    tier2Beginner.sort((a, b) => b.totalScans - a.totalScans);

    return {
      all: [...tier1Priority, ...tier2Beginner],
      tier1Priority,
      tier2Beginner,
      bestCandidate: tier1Priority.length > 0 ? tier1Priority[0] : (tier2Beginner[0] || null)
    };
  }

  /**
   * Monitor scanning session expirations
   * When 5 minutes elapse, automatically expires session, marks worker offline,
   * and triggers onSessionExpired callback.
   */
  startExpiryMonitor() {
    if (this.sessionExpiryCheckInterval) return;

    this.sessionExpiryCheckInterval = setInterval(() => {
      const now = Date.now();
      for (const [workerId, session] of this.activeSessions.entries()) {
        if (now >= session.expiresAt) {
          this.activeSessions.delete(workerId);
          db.updateUser(workerId, { is_online: false });

          if (typeof this.onSessionExpiredCallback === 'function') {
            try {
              this.onSessionExpiredCallback(session);
            } catch (err) {
              console.error('[PriorityQueue] Error in onSessionExpiredCallback:', err);
            }
          }
        }
      }
    }, 4000);
  }

  stopExpiryMonitor() {
    if (this.sessionExpiryCheckInterval) {
      clearInterval(this.sessionExpiryCheckInterval);
      this.sessionExpiryCheckInterval = null;
    }
  }

  /**
   * Summary status for diagnostics
   */
  getStatus() {
    const now = Date.now();
    let priorityCount = 0;
    let beginnerCount = 0;
    const activeSessionsList = [];

    for (const [workerId, session] of this.activeSessions.entries()) {
      if (now < session.expiresAt) {
        const metrics = this.calculateWorkerMetrics(workerId);
        if (metrics?.isPriorityEligible) priorityCount++;
        else beginnerCount++;
        activeSessionsList.push({
          worker_id: workerId,
          worker_name: session.workerName,
          chat_id: session.chatId,
          started_at: session.startedAt,
          expires_at: session.expiresAt,
          remaining_seconds: Math.max(0, Math.floor((session.expiresAt - now) / 1000)),
          total_scans: metrics?.totalScans || 0,
          success_rate: metrics?.successRate || 0,
          is_priority_eligible: metrics?.isPriorityEligible || false
        });
      }
    }

    return {
      activeScannersCount: activeSessionsList.length,
      active_scanning_sessions_count: activeSessionsList.length,
      active_sessions: activeSessionsList,
      priorityCount,
      beginnerCount,
      minScansRequired: 5,
      sessionDurationSeconds: 300
    };
  }
}

export const priorityQueue = new PriorityQueueEngine();
