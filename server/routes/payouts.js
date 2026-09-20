import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../db.js';
import { getIO } from '../sockets/socketHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `qr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

const router = express.Router();

// Get all payout requests (with optional filters)
router.get('/', (req, res) => {
  const { worker_id, status } = req.query;
  let payouts = db.getPayoutRequests();

  if (worker_id) {
    payouts = payouts.filter(p => p.worker_id === worker_id);
  }
  if (status) {
    payouts = payouts.filter(p => p.status === status);
  }

  res.json({ payouts });
});

// Submit payout request (Strictly Level 1 Workers only)
router.post('/request', upload.single('qr_code'), (req, res) => {
  const { worker_id, amount, method, upi_id, beneficiary_name, binance_id, binance_name } = req.body;

  if (!worker_id || !amount || !method) {
    return res.status(400).json({ error: 'Worker ID, amount, and payment method are required.' });
  }

  const worker = db.getUser(worker_id);
  if (!worker || worker.role !== 'worker') {
    return res.status(404).json({ error: 'Worker not found' });
  }

  // Enable withdraw for all workers with sufficient balance (User Requirement: "enable withdraw button also")
  const payoutAmount = parseFloat(amount);
  if (isNaN(payoutAmount) || payoutAmount <= 0) {
    return res.status(400).json({ error: 'Invalid payout amount.' });
  }

  if (worker.balance < payoutAmount) {
    return res.status(400).json({
      error: `Insufficient balance. Available: $${worker.balance.toFixed(2)}, Requested: $${payoutAmount.toFixed(2)}`
    });
  }

  // Validate method details:
  // "payout members can request upi or binance payout where they submit there upi qr and id and name and in binance just binance id and name okay"
  let qrCodeUrl = null;
  if (method === 'upi') {
    if (!upi_id || !beneficiary_name) {
      return res.status(400).json({ error: 'UPI ID and Beneficiary Name are required for UPI payout.' });
    }
    if (req.file) {
      qrCodeUrl = `/uploads/${req.file.filename}`;
    }
  } else if (method === 'binance') {
    if (!binance_id || !binance_name) {
      return res.status(400).json({ error: 'Binance ID and Account Name are required for Binance payout.' });
    }
  } else {
    return res.status(400).json({ error: 'Invalid payout method. Choose "upi" or "binance".' });
  }

  const newPayout = {
    id: `pay_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    worker_id: worker.id,
    worker_name: worker.name,
    worker_level: worker.level,
    amount: +payoutAmount.toFixed(2),
    method,
    upi_id: method === 'upi' ? upi_id : null,
    beneficiary_name: method === 'upi' ? beneficiary_name : null,
    qr_code_url: qrCodeUrl,
    binance_id: method === 'binance' ? binance_id : null,
    binance_name: method === 'binance' ? binance_name : null,
    status: 'pending',
    created_at: new Date().toISOString(),
    resolved_at: null,
    admin_notes: ''
  };

  db.addPayoutRequest(newPayout);

  const io = getIO();
  if (io) {
    io.emit('payout_requested', newPayout);
  }

  res.status(201).json({
    message: 'Payout request submitted successfully and awaiting Boss approval!',
    payout: newPayout
  });
});

export default router;
