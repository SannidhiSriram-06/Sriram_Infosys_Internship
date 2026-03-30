#!/usr/bin/env node

/**
 * Test script to verify KYC backend endpoints
 * Run with: node test-endpoints.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

// Helper function to make HTTP requests
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Test functions
async function testStats() {
  console.log('\n📊 Testing GET /api/kyc/verifications/stats');
  try {
    const result = await makeRequest('GET', '/api/kyc/verifications/stats');
    console.log(`Status: ${result.status}`);
    console.log('Response:', JSON.stringify(result.body, null, 2));
    return result.status === 200;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

async function testGetVerifications() {
  console.log('\n📋 Testing GET /api/kyc/verifications');
  try {
    const result = await makeRequest('GET', '/api/kyc/verifications');
    console.log(`Status: ${result.status}`);
    console.log(`Records found: ${result.body?.data?.length || 0}`);
    if (result.body?.data?.length > 0) {
      console.log('First record:', JSON.stringify(result.body.data[0], null, 2));
    }
    return result.status === 200;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

async function testSaveDecision() {
  console.log('\n💾 Testing POST /api/kyc/verifications/manual-decision');
  const testData = {
    user_name: 'Test User',
    document_type: 'PAN Card',
    anomaly_score: 0.25,
    status: 'Approved',
    extracted_data: { name: 'John Doe' },
    similar_nodes: []
  };
  
  try {
    const result = await makeRequest('POST', '/api/kyc/verifications/manual-decision', testData);
    console.log(`Status: ${result.status}`);
    console.log('Response:', JSON.stringify(result.body, null, 2));
    return result.status === 201;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Starting KYC Backend Tests');
  console.log('================================');
  console.log(`Testing against: ${BASE_URL}`);
  
  // Check if server is running
  try {
    const healthCheck = await makeRequest('GET', '/');
    console.log(`\n✅ Server is running: ${healthCheck.body}`);
  } catch (err) {
    console.error('\n❌ Server is NOT running at', BASE_URL);
    console.error('Start backend with: cd backend && npm start');
    process.exit(1);
  }

  // Run tests
  const results = {
    stats: await testStats(),
    getVerifications: await testGetVerifications(),
    saveDecision: await testSaveDecision()
  };

  // Re-check after save
  console.log('\n📊 Re-checking stats after save...');
  await testStats();

  // Summary
  console.log('\n' + '='.repeat(40));
  console.log('📈 Test Summary:');
  console.log(`  GET /api/kyc/verifications/stats: ${results.stats ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  GET /api/kyc/verifications: ${results.getVerifications ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  POST /api/kyc/verifications/manual-decision: ${results.saveDecision ? '✅ PASS' : '❌ FAIL'}`);
  
  const passed = Object.values(results).filter(r => r).length;
  console.log(`\n${passed}/3 tests passed`);
  
  process.exit(passed === 3 ? 0 : 1);
}

// Run tests
runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
