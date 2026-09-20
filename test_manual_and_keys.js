// Node 18+ has built-in global fetch
const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('🧪 Starting Manual Verification & Hierarchy Key Tests...\n');

  // 1. Health check
  const healthRes = await fetch(`${BASE_URL}/health`);
  const health = await healthRes.json();
  console.log('✅ Server Health:', health.status);

  // Ensure publisher is unlocked for test
  await fetch(`${BASE_URL}/admin/publishers/agent_prime/unlock`, { method: 'POST' });

  // 2. Publish order with custom merchant reference or auto reference
  const pubRes = await fetch(`${BASE_URL}/orders/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publisher_id: 'agent_prime',
      upi_link: 'upi://pay?pa=merchant_test@okaxis&pn=ManualStore&am=120.00&cu=INR',
      duration_seconds: 240
    })
  });
  const pubData = await pubRes.json();
  console.log('✅ Order Published with Merchant Reference:', pubData.order.merchant_reference);
  const orderId = pubData.order.id;

  // 3. Worker claims order
  const claimRes = await fetch(`${BASE_URL}/orders/${orderId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ worker_id: 'worker_alex' })
  });
  const claimData = await claimRes.json();
  console.log('✅ Order Claimed by Worker:', claimData.order.claimed_by_name);

  // 4. Worker does NOT verify! Agent manually verifies order as SUCCESS
  console.log('⚡ Worker did not verify. Agent triggers manual verification...');
  const manualVerifyRes = await fetch(`${BASE_URL}/orders/${orderId}/manual-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publisher_id: 'agent_prime',
      action: 'confirm_success',
      notes: 'Confirmed payment in Axis Bank UPI App'
    })
  });
  const manualVerifyData = await manualVerifyRes.json();
  console.log('✅ Agent Manual Verification Success:', manualVerifyData.message);
  console.log('   Status:', manualVerifyData.order.status);
  console.log('   Is Manually Verified:', manualVerifyData.order.is_manually_verified);
  console.log('   Verified By:', manualVerifyData.order.manually_verified_by);
  console.log('   Notes:', manualVerifyData.order.manual_verification_notes);

  if (!manualVerifyData.order.is_manually_verified || manualVerifyData.order.status !== 'success') {
    throw new Error('Manual verification failed!');
  }

  // 5. Worker requests manual review flow
  // Unlock agent_prime if lock limit was hit
  await fetch(`${BASE_URL}/admin/publishers/agent_prime/unlock`, { method: 'POST' });

  const pubRes2 = await fetch(`${BASE_URL}/orders/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publisher_id: 'agent_prime',
      upi_link: 'upi://pay?pa=camera_error@upi&pn=ReviewStore&am=50.00&cu=INR',
      duration_seconds: 300
    })
  });
  const pubData2 = await pubRes2.json();
  const orderId2 = pubData2.order.id;
  await fetch(`${BASE_URL}/orders/${orderId2}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ worker_id: 'worker_leo' })
  });

  const reviewReqRes = await fetch(`${BASE_URL}/orders/${orderId2}/request-manual-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      worker_id: 'worker_leo',
      reason: 'QR camera reflection blur, unable to scan auto'
    })
  });
  const reviewReqData = await reviewReqRes.json();
  console.log('✅ Worker Requested Manual Review:', reviewReqData.order.status === 'manual_review' ? 'SUCCESS' : 'FAILED');

  // Agent resolves the manual review order
  const resolveReviewRes = await fetch(`${BASE_URL}/orders/${orderId2}/manual-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publisher_id: 'agent_prime',
      action: 'confirm_success',
      notes: 'Manually verified via UTR 991823910'
    })
  });
  const resolveReviewData = await resolveReviewRes.json();
  console.log('✅ Agent Resolved Manual Review Order:', resolveReviewData.order.status);

  // 6. Superadmin generates L1 Boss Key
  console.log('\n⚡ Testing Hierarchy & Key Provisioning...');
  const bossKeyRes = await fetch(`${BASE_URL}/admin/generate-boss-key`, {
    method: 'POST'
  });
  const bossKeyData = await bossKeyRes.json();
  console.log('✅ Superadmin Issued L1 Boss Key:', bossKeyData.key.key);

  // 7. User redeems L1 Boss Key
  const redeemBossRes = await fetch(`${BASE_URL}/auth/redeem-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: bossKeyData.key.key,
      name: 'Vikram Merchant'
    })
  });
  const redeemBossData = await redeemBossRes.json();
  console.log('✅ User Redeemed L1 Key & Became L1 Boss:', redeemBossData.user.name, `(${redeemBossData.role})`);

  if (redeemBossData.role !== 'agent' || redeemBossData.panel_tier !== 'L1') {
    throw new Error('L1 Boss key redemption failed to create agent role!');
  }

  // 8. L1 Boss generates L2 Worker Key
  const workerKeyRes = await fetch(`${BASE_URL}/publishers/${redeemBossData.user.id}/generate-worker-key`, {
    method: 'POST'
  });
  const workerKeyData = await workerKeyRes.json();
  console.log('✅ L1 Boss Issued L2 Worker Key:', workerKeyData.key.key);

  // 9. User redeems L2 Worker Key
  const redeemWorkerRes = await fetch(`${BASE_URL}/auth/redeem-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: workerKeyData.key.key,
      name: 'Rahul Scanner'
    })
  });
  const redeemWorkerData = await redeemWorkerRes.json();
  console.log('✅ User Redeemed L2 Key & Became L2 Worker:', redeemWorkerData.user.name, `(${redeemWorkerData.role})`);

  if (redeemWorkerData.role !== 'worker' || redeemWorkerData.panel_tier !== 'L2') {
    throw new Error('L2 Worker key redemption failed to create worker role!');
  }

  console.log('\n🎉 ALL MANUAL VERIFICATION & KEY TESTS PASSED PERFECTLY! 🚀\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
