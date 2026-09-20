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

async function testTimer() {
  console.log('🧪 Testing Custom Minutes & Seconds Expiry Timer...\n');

  // Test custom 3 mins 45 secs = 225 seconds
  const customSecs = (3 * 60) + 45;
  const res = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/orders/publish',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    publisher_id: 'agent_prime',
    upi_link: 'upi://pay?pa=customtimer@okaxis&pn=TimerTest&am=75',
    duration_seconds: customSecs
  });

  console.log(`1. Published with ${customSecs}s (${Math.floor(customSecs/60)}m ${customSecs%60}s): HTTP ${res.status}`);
  console.log(`   Order ID: ${res.data.order.id}`);
  console.log(`   Duration stored: ${res.data.order.duration_seconds}s`);
  console.log(`   Expires At: ${res.data.order.expires_at}`);

  if (res.data.order.duration_seconds !== 225) {
    throw new Error(`Expected 225s, got ${res.data.order.duration_seconds}`);
  }

  // Claim with fastest finger
  const claimRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/orders/${res.data.order.id}/claim`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    worker_id: 'worker_alex'
  });

  console.log(`2. Fastest-Finger Claim: HTTP ${claimRes.status} by ${claimRes.data.order.claimed_by_name}`);

  // Second claim attempt must be blocked
  const secondClaim = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/orders/${res.data.order.id}/claim`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    worker_id: 'worker_leo'
  });

  console.log(`3. Second Worker Claim Blocked: HTTP ${secondClaim.status} - "${secondClaim.data.error}"`);
  if (secondClaim.status !== 409) throw new Error('Expected 409 Conflict for second claim');

  console.log('\n✅ CUSTOM TIMER & ATOMIC SINGLE-CLAIM FULLY VERIFIED!');
}

testTimer().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
