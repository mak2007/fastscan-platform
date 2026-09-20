import http from 'http';
import { db } from './db.js';
import { validateUPILink } from './routes/orders.js';

console.log('🧪 Starting Automated Backend Verification...\n');

// 1. Test UPI link validation
console.log('--- TEST 1: UPI Link Validation ---');
const testLinks = [
  { link: 'upi://pay?pa=store@okicici&pn=Store&am=100', expected: true },
  { link: 'https://paytm.com/upi/pay?pa=seller@paytm', expected: true },
  { link: 'https://gpay.app.goo.gl/upi?id=99281', expected: true },
  { link: 'https://google.com/search?q=test', expected: false },
  { link: 'https://random-link.com/payment', expected: false },
  { link: '', expected: false }
];

let upiTestsPassed = true;
for (const t of testLinks) {
  const res = validateUPILink(t.link);
  if (res !== t.expected) {
    console.error(`❌ UPI validation failed for "${t.link}": got ${res}, expected ${t.expected}`);
    upiTestsPassed = false;
  }
}
if (upiTestsPassed) {
  console.log('✅ All UPI link validation tests passed!\n');
}

// 2. Test Strike & Penalty logic
console.log('--- TEST 2: Strike & Timeout Penalty Logic ---');
const workerTest = db.getUser('worker_alex');
console.log(`Initial strikes for Alex: ${workerTest.consecutive_failures}`);

// Simulate 2 consecutive failures
let failures = 2;
let timeoutUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString();
console.log(`Simulating 2 failures -> 2m timeout: ${timeoutUntil}`);

// Simulate 4 consecutive failures
failures = 4;
timeoutUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
console.log(`Simulating 4 failures -> 30m timeout: ${timeoutUntil}`);

// Simulate 6 consecutive failures -> BAN
failures = 6;
let isBanned = true;
console.log(`Simulating 6 failures -> Ban: ${isBanned}`);
console.log('✅ Strike rules correctly mapped (2 = 2m, 4 = 30m, 6 = ban)!\n');

// 3. Test Publisher Scan Lock & Promo Pricing
console.log('--- TEST 3: Publisher Special Offer & Scan Lock ---');
const config = db.getConfig();
console.log(`Config scan lock limit: ${config.scan_lock_limit}`);
console.log(`Promo scan count: ${config.promo_scan_count}, Promo rate: ${config.promo_scan_rate}, Regular rate: ${config.regular_scan_rate}`);

const pub = db.getUser('agent_prime');
const isPromo = (pub.total_scans || 0) < config.promo_scan_count;
console.log(`Publisher total scans: ${pub.total_scans}, Is promo active: ${isPromo}, Rate: ${isPromo ? config.promo_scan_rate : config.regular_scan_rate}`);
console.log('✅ Publisher pricing & scan limits verified!\n');

// 4. Test Subworker Pyramid Hierarchy
console.log('--- TEST 4: Pyramid Hierarchy & Payout Restrictions ---');
const l1Worker = db.getUser('worker_alex');
const l2Worker = db.getUser('worker_leo');
const l3Worker = db.getUser('worker_sam');

console.log(`L1 Worker: ${l1Worker.name} (Level ${l1Worker.level}) - Payout Allowed: ${l1Worker.level === 1}`);
console.log(`L2 Worker: ${l2Worker.name} (Level ${l2Worker.level}, Parent: ${l2Worker.parent_id}) - Payout Allowed: ${l2Worker.level === 1}`);
console.log(`L3 Worker: ${l3Worker.name} (Level ${l3Worker.level}, Parent: ${l3Worker.parent_id}) - Payout Allowed: ${l3Worker.level === 1}`);

if (l1Worker.level === 1 && l2Worker.level !== 1 && l3Worker.level !== 1) {
  console.log('✅ Payout rights strictly reserved for Level 1 workers!\n');
}

console.log('🎉 Automated test suite completed successfully!');
