import { db } from '../db.js';

let ioInstance = null;
const onlineWorkerSockets = new Map(); // socketId -> workerId
const workerStatusOverride = new Map(); // workerId -> boolean (isOnline)
const onlinePublishers = new Map(); // socketId -> publisherId

export function initSockets(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    socket.on('register_presence', ({ role, userId }) => {
      socket.role = role;
      socket.userId = userId;

      if (role === 'worker') {
        onlineWorkerSockets.set(socket.id, userId);
        socket.join('workers');
        // If not set yet, check db or default to true
        if (!workerStatusOverride.has(userId)) {
          const user = db.getUser(userId);
          const isOnline = user?.is_online !== undefined ? user.is_online : true;
          workerStatusOverride.set(userId, isOnline);
          db.updateUser(userId, { is_online: isOnline });
        }
      } else if (role === 'agent' || role === 'publisher') {
        onlinePublishers.set(socket.id, userId);
        socket.join('publishers');
      } else if (role === 'boss') {
        socket.join('bosses');
      }

      broadcastPresence();
    });

    // Explicit worker online/offline toggle
    socket.on('toggle_worker_status', ({ workerId, isOnline }) => {
      workerStatusOverride.set(workerId, !!isOnline);
      db.updateUser(workerId, { 
        is_online: !!isOnline,
        last_status_change: new Date().toISOString()
      });
      broadcastPresence();
    });

    socket.on('disconnect', () => {
      onlineWorkerSockets.delete(socket.id);
      onlinePublishers.delete(socket.id);
      broadcastPresence();
    });
  });

  // Background interval: auto-expire orders that passed their expiration time
  setInterval(() => {
    checkExpiredOrders();
  }, 3000);
}

export function setWorkerStatusServer(workerId, isOnline) {
  workerStatusOverride.set(workerId, !!isOnline);
  db.updateUser(workerId, { 
    is_online: !!isOnline,
    last_status_change: new Date().toISOString()
  });
  broadcastPresence();
}

export function broadcastPresence() {
  if (!ioInstance) return;

  // Active connected worker IDs
  const connectedWorkerIds = new Set(onlineWorkerSockets.values());
  
  // Count only connected workers who are marked isOnline = true
  const actuallyOnlineWorkerIds = Array.from(connectedWorkerIds).filter(id => {
    return workerStatusOverride.get(id) !== false;
  });

  const uniquePublishers = new Set(onlinePublishers.values()).size;

  // Gather list of all registered workers with real-time online status
  const allWorkers = db.getUsers().filter(u => u.role === 'worker').map(w => ({
    id: w.id,
    name: w.name,
    level: w.level,
    is_online: actuallyOnlineWorkerIds.includes(w.id),
    is_connected: connectedWorkerIds.has(w.id),
    consecutive_failures: w.consecutive_failures || 0,
    is_banned: !!w.is_banned
  }));

  ioInstance.emit('presence_update', {
    onlineWorkers: actuallyOnlineWorkerIds.length,
    onlinePublishers: uniquePublishers,
    onlineWorkerIds: actuallyOnlineWorkerIds,
    workersList: allWorkers
  });
}

function checkExpiredOrders() {
  if (!ioInstance) return;
  const now = new Date().toISOString();
  const orders = db.getOrders();
  let updated = false;

  for (const ord of orders) {
    if ((ord.status === 'pending' || ord.status === 'claimed') && ord.expires_at && ord.expires_at <= now) {
      db.updateOrder(ord.id, {
        status: 'expired',
        expired_at: now
      });
      updated = true;
      ioInstance.emit('order_expired', { orderId: ord.id });
    }
  }

  if (updated) {
    ioInstance.emit('orders_refresh');
  }
}

export function getIO() {
  return ioInstance;
}

export function getPresenceStats() {
  const connectedWorkerIds = new Set(onlineWorkerSockets.values());
  const actuallyOnlineWorkerIds = Array.from(connectedWorkerIds).filter(id => {
    return workerStatusOverride.get(id) !== false;
  });

  return {
    onlineWorkers: actuallyOnlineWorkerIds.length,
    onlinePublishers: new Set(onlinePublishers.values()).size,
    onlineWorkerIds: actuallyOnlineWorkerIds
  };
}
