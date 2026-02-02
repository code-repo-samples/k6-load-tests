/**
 * Script 3: Simple Single-API Test
 * 
 * Features:
 * - One POST API
 * - CSV-driven unique input
 * - Stop on data exhaustion
 * - Validate and log failures with input
 * 
 * Usage:
 * k6 run -e BASE_URL=https://api.example.com \
 *        -e API_ENDPOINT=/api/orders \
 *        tests/script3-single-api.js
 */

import http from 'k6/http';
import { sleep } from 'k6';

import { initTokenManager, getToken } from '../lib/auth/tokenManager.js';
import { loadCSVData, getUniqueData } from '../lib/data/csvManager.js';
import { validateResponse } from '../lib/validation/validators.js';
import { logError } from '../lib/errors/errorLogger.js';

// Load test data
const orders = loadCSVData('orders', './data/orders.csv');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'https://api.example.com';
const API_ENDPOINT = __ENV.API_ENDPOINT || '/api/orders';
const AUTH_URL = __ENV.AUTH_URL || `${BASE_URL}/auth/token`;
const AUTH_USER = __ENV.AUTH_USER || 'admin';
const AUTH_PASS = __ENV.AUTH_PASS || 'password';

export const options = {
    scenarios: {
        single_api: {
            executor: 'per-vu-iterations',
            vus: 10,
            iterations: Math.floor(orders.length / 10), // Each VU gets equal share
            maxDuration: '30m',
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<3000'],
        'http_req_failed': ['rate<0.05'],
        'checks': ['rate>0.95'],
    },
};

export function setup() {
    console.log('\n' + '='.repeat(80));
    console.log('SINGLE-API TEST SETUP');
    console.log('='.repeat(80));
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`API Endpoint: ${API_ENDPOINT}`);
    console.log(`Total Orders: ${orders.length}`);
    console.log(`VUs: ${options.scenarios.single_api.vus}`);
    console.log(`Iterations per VU: ${options.scenarios.single_api.iterations}`);
    console.log('='.repeat(80) + '\n');
    
    return initTokenManager({
        url: AUTH_URL,
        username: AUTH_USER,
        password: AUTH_PASS,
        expirySeconds: 600
    });
}

export default function(data) {
    // Get unique order data
    const orderData = getUniqueData(orders, __VU, __ITER, {
        abortOnExhaustion: true // Stop test if data runs out
    });
    
    if (!orderData) {
        console.error(`[VU ${__VU}:${__ITER}] No order data available, stopping`);
        return;
    }
    
    // Get token
    const token = getToken(data);
    
    // Prepare payload
    const payload = {
        orderId: orderData.orderId,
        customerId: orderData.customerId,
        amount: parseFloat(orderData.amount),
        currency: orderData.currency || 'USD',
        items: JSON.parse(orderData.items || '[]'),
        timestamp: new Date().toISOString()
    };
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
    
    // Make API call
    const res = http.post(
        `${BASE_URL}${API_ENDPOINT}`,
        JSON.stringify(payload),
        { 
            headers,
            tags: { api: 'Create_Order' }
        }
    );
    
    // Validate response
    const valid = validateResponse(res, {
        apiName: 'Create_Order',
        expectedStatus: 201,
        jsonSchema: { orderId: 'string', status: 'string' }
    });
    
    if (!valid) {
        logError('Create_Order', res, payload, 'Order creation failed');
    } else {
        console.log(`[VU ${__VU}:${__ITER}] ✓ Created order: ${orderData.orderId}`);
    }
    
    sleep(0.5);
}

export function handleSummary(data) {
    console.log('\n' + '='.repeat(80));
    console.log('SINGLE-API TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`Total Requests: ${data.metrics.http_reqs.values.count}`);
    console.log(`Success Rate: ${((1 - data.metrics.http_req_failed.values.rate) * 100).toFixed(2)}%`);
    console.log(`p95 Response Time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
    console.log(`p99 Response Time: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`);
    console.log('='.repeat(80) + '\n');
    
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    };
}
