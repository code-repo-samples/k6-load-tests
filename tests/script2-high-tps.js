/**
 * Script 2: High-TPS Steady State Test
 * 
 * Features:
 * - High throughput (400-5000 TPS configurable)
 * - Token from small auth CSV
 * - Mix of GET and POST calls
 * - Strong validation and error tracking
 * 
 * Usage:
 * k6 run -e BASE_URL=https://api.example.com \
 *        -e TARGET_TPS=1000 \
 *        -e DURATION=5m \
 *        tests/script2-high-tps.js
 */

import http from 'k6/http';
import { sleep } from 'k6';
import { Rate } from 'k6/metrics';

import { initTokenManager, getToken } from '../lib/auth/tokenManager.js';
import { loadCSVData, getRandomData } from '../lib/data/csvManager.js';
import { validateResponse } from '../lib/validation/validators.js';
import { logError } from '../lib/errors/errorLogger.js';
import { generatePayload } from '../lib/generators/dataGenerators.js';

// Load minimal auth data
const authData = loadCSVData('auth', './data/auth.csv');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'https://api.example.com';
const TARGET_TPS = parseInt(__ENV.TARGET_TPS || '1000');
const DURATION = __ENV.DURATION || '5m';
const GET_PERCENTAGE = parseInt(__ENV.GET_PERCENTAGE || '70'); // 70% GET, 30% POST

// Calculate VUs needed for target TPS
// Assuming each iteration takes ~100ms
const ESTIMATED_ITERATION_DURATION = 0.1; // seconds
const REQUIRED_VUS = Math.ceil(TARGET_TPS * ESTIMATED_ITERATION_DURATION);

export const options = {
    scenarios: {
        high_tps: {
            executor: 'constant-arrival-rate',
            rate: TARGET_TPS,
            timeUnit: '1s',
            duration: DURATION,
            preAllocatedVUs: REQUIRED_VUS,
            maxVUs: REQUIRED_VUS * 2,
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<1000', 'p(99)<2000'],
        'http_req_failed': ['rate<0.01'],
        'business_error_rate': ['rate<0.05'],
    },
};

export function setup() {
    console.log('\n' + '='.repeat(80));
    console.log('HIGH-TPS TEST SETUP');
    console.log('='.repeat(80));
    console.log(`Target TPS: ${TARGET_TPS}`);
    console.log(`Duration: ${DURATION}`);
    console.log(`Estimated VUs: ${REQUIRED_VUS}`);
    console.log(`GET/POST Mix: ${GET_PERCENTAGE}% / ${100 - GET_PERCENTAGE}%`);
    console.log('='.repeat(80) + '\n');
    
    // Get random auth credentials
    const auth = getRandomData(authData);
    
    return initTokenManager({
        url: `${BASE_URL}/auth/token`,
        username: auth.username,
        password: auth.password,
        expirySeconds: 600
    });
}

export default function(data) {
    const token = getToken(data);
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
    
    // Determine operation (70% GET, 30% POST)
    const operation = Math.random() * 100 < GET_PERCENTAGE ? 'GET' : 'POST';
    
    if (operation === 'GET') {
        // GET request
        const userId = Math.floor(Math.random() * 10000); // Random user ID
        
        const res = http.get(
            `${BASE_URL}/api/users/${userId}`,
            { headers, tags: { api: 'Get_User' } }
        );
        
        validateResponse(res, {
            apiName: 'Get_User',
            expectedStatuses: [200, 404] // 404 is acceptable for random IDs
        });
        
        if (res.status !== 200 && res.status !== 404) {
            logError('Get_User', res, { userId });
        }
        
    } else {
        // POST request
        const payload = generatePayload({
            name: 'string',
            email: 'email',
            status: 'string'
        });
        
        const res = http.post(
            `${BASE_URL}/api/users`,
            JSON.stringify(payload),
            { headers, tags: { api: 'Create_User' } }
        );
        
        const valid = validateResponse(res, {
            apiName: 'Create_User',
            expectedStatus: 201
        });
        
        if (!valid) {
            logError('Create_User', res, payload);
        }
    }
    
    // No sleep - maximize TPS
}

export function handleSummary(data) {
    const actualTPS = data.metrics.http_reqs.values.rate;
    const targetTPS = TARGET_TPS;
    const tpsAchieved = (actualTPS / targetTPS * 100).toFixed(2);
    
    console.log('\n' + '='.repeat(80));
    console.log('HIGH-TPS TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`Target TPS: ${targetTPS}`);
    console.log(`Actual TPS: ${actualTPS.toFixed(2)} (${tpsAchieved}% of target)`);
    console.log(`Total Requests: ${data.metrics.http_reqs.values.count}`);
    console.log(`Failed Requests: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
    console.log(`p95 Response Time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
    console.log(`p99 Response Time: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`);
    console.log('='.repeat(80) + '\n');
    
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    };
}
