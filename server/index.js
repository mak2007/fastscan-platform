import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { initSockets } from './sockets/socketHandler.js';
import ordersRouter from './routes/orders.js';
import workersRouter from './routes/workers.js';
import publishersRouter from './routes/publishers.js';
import payoutsRouter from './routes/payouts.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import messagesRouter from './routes/messages.js';
import telegramRouter from './routes/telegram.js';
import { telegramBotService } from './telegram/botHandlers.js';
import { db } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Enable CORS for local Vite dev and web clients
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded QR images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount API routes
app.use('/api/orders', ordersRouter);
app.use('/api/workers', workersRouter);
app.use('/api/publishers', publishersRouter);
app.use('/api/payouts', payoutsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/auth', authRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/telegram', telegramRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Boss & Worker UPI Scanning Platform'
  });
});

// Serve frontend client build in production if available
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Initialize real-time presence & event broadcasting
initSockets(io);

// Initialize Telegram Bot Service
const savedConfig = db.getConfig();
const botToken = savedConfig.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;
if (botToken) {
  telegramBotService.setToken(botToken);
  if (telegramBotService.client.hasToken()) {
    console.log(`🤖 Starting Telegram Bot polling with configured token...`);
    telegramBotService.client.startPolling((update) => {
      telegramBotService.handleUpdate(update);
    });
  }
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Boss & Worker backend running on port ${PORT}`);
  console.log(`📡 Socket.IO server initialized`);
  console.log(`🤖 Telegram Bot module loaded and ready`);
  console.log(`🌐 Application accessible at http://localhost:${PORT}`);
});

