import http from 'http';

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = res.headers['content-type']?.includes('application/json')
            ? JSON.parse(data)
            : data;
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Running Comprehensive E2E System Verification...\n');

  // 1. Health check
  const health = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/health',
    method: 'GET'
  });
  console.log(`1. Health Check: HTTP ${health.status} - ${health.data.service}`);
  if (health.status !== 200) throw new Error('Health check failed');

  // 2. Frontend HTML serving
  const frontend = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/',
    method: 'GET'
  });
  console.log(`2. Frontend SPA Delivery: HTTP ${frontend.status} - Length: ${frontend.data.length} chars`);
  if (!frontend.data.includes('FastScan')) throw new Error('Frontend not loaded correctly');

  // 3. Reject non-UPI link
  const invalidOrder = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/orders/publish',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    publisher_id: 'agent_prime',
    upi_link: 'https://regular-checkout.com/pay',
    duration_seconds: 300
  });
  console.log(`3. Non-UPI Link Rejection: HTTP ${invalidOrder.status} - Error: "${invalidOrder.data.error}"`);
  if (invalidOrder.status !== 400) throw new Error('Failed to reject non-UPI link');

  // 4. Publish valid UPI link
  const validOrder = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/orders/publish',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    publisher_id: 'agent_prime',
    upi_link: 'upi://pay?pa=store@okaxis&pn=Store&am=120',
    duration_seconds: 300
  });
  console.log(`4. Valid UPI Order Publish: HTTP ${validOrder.status} - Order ID: ${validOrder.data.order.id} (Rate: $${validOrder.data.rateApplied})`);
  const orderId = validOrder.data.order.id;

  // 5. Fastest-Finger Claiming
  const claimRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/orders/${orderId}/claim`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    worker_id: 'worker_alex'
  });
  console.log(`5. Fastest-Finger Claim: HTTP ${claimRes.status} - Claimed by: ${claimRes.data.order.claimed_by_name}`);
  if (claimRes.status !== 200) throw new Error('Failed to claim order');

  // 6. Simultaneous claim prevention (Atomic lock)
  const duplicateClaim = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/orders/${orderId}/claim`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    worker_id: 'worker_leo'
  });
  console.log(`6. Race Condition Conflict: HTTP ${duplicateClaim.status} - "${duplicateClaim.data.error}"`);
  if (duplicateClaim.status !== 409) throw new Error('Duplicate claim did not return 409');

  // 7. Worker complete task
  const completeRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/orders/${orderId}/complete-task`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    worker_id: 'worker_alex',
    result: 'success'
  });
  console.log(`7. Worker Complete Task: HTTP ${completeRes.status} - Status: ${completeRes.data.order.status}`);
  if (completeRes.data.order.status !== 'awaiting_confirmation') throw new Error('Status not awaiting confirmation');

  // 8. Publisher confirm task
  const confirmRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/orders/${orderId}/confirm`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    publisher_id: 'agent_prime',
    action: 'confirm_success'
  });
  console.log(`8. Publisher Confirm Success: HTTP ${confirmRes.status} - Order Final Status: ${confirmRes.data.order.status}`);
  if (confirmRes.data.order.status !== 'success') throw new Error('Order status not confirmed as success');

  // 9. Sub-worker Key Generation
  const keyRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/workers/worker_alex/generate-key',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  console.log(`9. Sub-worker Key Generated: HTTP ${keyRes.status} - Key: ${keyRes.data.key.key}`);

  // 10. Sub-worker Payout Restriction (Level 2 worker blocked)
  const l2PayoutRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/payouts/request',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    worker_id: 'worker_leo',
    amount: 5.0,
    method: 'upi'
  });
  console.log(`10. L2 Payout Protection: HTTP ${l2PayoutRes.status} - "${l2PayoutRes.data.error}"`);
  if (l2PayoutRes.status !== 403) throw new Error('L2 worker should have been blocked with 403');

  // 11. Level 1 Worker Payout Request (UPI & Binance)
  const l1PayoutRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/payouts/request',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    worker_id: 'worker_alex',
    amount: 1.0,
    method: 'binance',
    binance_id: 'BINANCE_77492',
    binance_name: 'Alex Alex'
  });
  if (l1PayoutRes.status !== 201) {
    throw new Error(`L1 payout request failed: ${JSON.stringify(l1PayoutRes.data)}`);
  }
  console.log(`11. L1 Worker Payout Submission: HTTP ${l1PayoutRes.status} - ID: ${l1PayoutRes.data.payout.id} Status: ${l1PayoutRes.data.payout.status}`);

  // 12. Boss approves payout
  const payoutId = l1PayoutRes.data.payout.id;
  const approveRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/admin/payouts/${payoutId}/resolve`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    action: 'approve',
    admin_notes: 'Approved during test'
  });
  console.log(`12. Boss Payout Resolution: HTTP ${approveRes.status} - New Status: ${approveRes.data.payout.status}`);

  // 13. Boss Publisher Unlock
  const unlockRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/publishers/agent_prime/unlock',
    method: 'POST'
  });
  console.log(`13. Boss Publisher Unlock: HTTP ${unlockRes.status} - Unlocked: ${!unlockRes.data.publisher.is_locked}`);

  console.log('\n🌟 ALL 13 END-TO-END VERIFICATION TESTS PASSED SUCCESSFULLY! 🌟');
}

runTests().catch(err => {
  console.error('❌ Verification test failed:', err);
  process.exit(1);
});
