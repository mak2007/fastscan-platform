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

async function runTest() {
  console.log('🧪 Testing Worker Online / Offline Toggle...\n');

  // 1. Toggle worker to OFFLINE
  const offRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/workers/worker_alex/toggle-status',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { is_online: false });
  console.log(`1. Toggle Offline: HTTP ${offRes.status} - Message: "${offRes.data.message}"`);
  if (offRes.data.is_online !== false) throw new Error('Worker was not set offline');

  // 2. Publish an order
  const orderRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/orders/publish',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    publisher_id: 'agent_prime',
    upi_link: 'upi://pay?pa=offline_test@okaxis&pn=Store&am=50',
    duration_seconds: 300
  });
  const orderId = orderRes.data.order.id;
  console.log(`2. Published Order: ${orderId}`);

  // 3. Worker tries to claim while offline -> should fail with 403
  const claimOfflineRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/orders/${orderId}/claim`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { worker_id: 'worker_alex' });
  console.log(`3. Offline Claim Attempt: HTTP ${claimOfflineRes.status} - Error: "${claimOfflineRes.data.error}"`);
  if (claimOfflineRes.status !== 403) throw new Error('Offline claim did not return 403');

  // 4. Toggle worker back to ONLINE
  const onRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/workers/worker_alex/toggle-status',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { is_online: true });
  console.log(`4. Toggle Online: HTTP ${onRes.status} - Message: "${onRes.data.message}"`);
  if (onRes.data.is_online !== true) throw new Error('Worker was not set online');

  // 5. Worker claims while online -> should succeed with 200
  const claimOnlineRes = await makeRequest({
    hostname: 'localhost',
    port: 5000,
    path: `/api/orders/${orderId}/claim`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { worker_id: 'worker_alex' });
  console.log(`5. Online Claim Attempt: HTTP ${claimOnlineRes.status} - Claimed By: ${claimOnlineRes.data.order.claimed_by_name}`);
  if (claimOnlineRes.status !== 200) throw new Error('Online claim failed');

  console.log('\n✅ WORKER ONLINE / OFFLINE TOGGLE VERIFIED SUCCESSFULLY!');
}

runTest().catch(e => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
