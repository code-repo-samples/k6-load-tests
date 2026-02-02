/**
 * Script 1: Full CRUD API Test with Ramp-up and Steady State
 * 
 * Features:
 * - CSV-driven test data
 * - Full Create → Get → Update → Delete flow
 * - Conditional Delete (20-30% of iterations)
 * - Correlation and fail-fast
 * - Error tracking and thresholds
 * - Auto-abort on 20% business error rate
 * 
 * Usage:
 * k6 run -e BASE_URL=https://api.example.com \
 *        -e AUTH_URL=https://api.example.com/auth/token \
 *        -e AUTH_USER=admin \
 *        -e AUTH_PASS=secret \
 *        tests/script1-full-crud.js
 */

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Rate } from 'k6/metrics';
import exec from 'k6/execution';

// Import framework modules
import { initTokenManager, getToken } from '../lib/auth/tokenManager.js';
import { loadCSVData, getUniqueData } from '../lib/data/csvManager.js';
import { 
    extractAndStore, 
    getCorrelatedValue, 
    validateCorrelations,
    clearCorrelations,
    buildCorrelatedUrl
} from '../lib/correlation/correlationManager.js';
import { validateResponse, businessErrorRate } from '../lib/validation/validators.js';
import { logError, logCorrelationFailure, formatErrorSummary } from '../lib/errors/errorLogger.js';
import { generateUserPayload } from '../lib/generators/dataGenerators.js';

// Load test data
const users = loadCSVData('users', './data/users.csv');

// Configuration from environment variables
const BASE_URL = __ENV.BASE_URL || 'https://api.example.com';
const AUTH_URL = __ENV.AUTH_URL || `${BASE_URL}/auth/token`;
const AUTH_USER = __ENV.AUTH_USER || 'admin';
const AUTH_PASS = __ENV.AUTH_PASS || 'password';
const TOKEN_EXPIRY = parseInt(__ENV.TOKEN_EXPIRY || '600'); // 10 minutes
const DELETE_PERCENTAGE = parseInt(__ENV.DELETE_PERCENTAGE || '25'); // 25% delete rate

// Test configuration
export const options = {
    scenarios: {
        crud_flow: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 10 },   // Ramp-up to 10 VUs over 1 minute
                { duration: '5m', target: 10 },   // Stay at 10 VUs for 5 minutes
                { duration: '1m', target: 0 },    // Ramp-down
            ],
            gracefulRampDown: '30s',
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<5000', 'p(99)<10000'], // 95th percentile < 5s
        'http_req_failed': ['rate<0.05'],  // Less than 5% HTTP failures
        'business_error_rate': ['rate<0.20'], // Less than 20% business errors
        'checks': ['rate>0.90'], // 90% of checks should pass
    },
    // Abort test if business error rate exceeds 20%
    abortOnFail: true,
};

/**
 * Setup function - runs once before test
 * Initialize token manager
 */
export function setup() {
    console.log('\n' + '='.repeat(80));
    console.log('SETUP: Initializing Test');
    console.log('='.repeat(80));
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Auth URL: ${AUTH_URL}`);
    console.log(`Total Users: ${users.length}`);
    console.log(`Delete Percentage: ${DELETE_PERCENTAGE}%`);
    console.log('='.repeat(80) + '\n');
    
    // Initialize token manager
    const tokenData = initTokenManager({
        url: AUTH_URL,
        username: AUTH_USER,
        password: AUTH_PASS,
        expirySeconds: TOKEN_EXPIRY,
        tokenPath: 'access_token' // Adjust based on your API
    });
    
    return tokenData;
}

/**
 * Main test function - runs for each VU iteration
 */
export default function(data) {
    // Clear correlations from previous iteration
    clearCorrelations();
    
    // Get unique user data
    const userData = getUniqueData(users, __VU, __ITER);
    if (!userData) {
        console.error('No user data available, stopping iteration');
        return;
    }
    
    // Get authentication token
    const token = getToken(data);
    if (!token) {
        console.error('Failed to get authentication token');
        return;
    }
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
    
    // ========================================
    // STEP 1: CREATE User
    // ========================================
    const createPayload = generateUserPayload({
        email: userData.email || `user_${__VU}_${__ITER}@example.com`,
        firstName: userData.firstName || 'Test',
        lastName: userData.lastName || 'User',
    });
    
    const createRes = http.post(
        `${BASE_URL}/api/users`,
        JSON.stringify(createPayload),
        { 
            headers,
            tags: { api: 'Create_User' }
        }
    );
    
    // Validate Create response
    const createValid = validateResponse(createRes, {
        apiName: 'Create_User',
        expectedStatus: 201,
        jsonSchema: { id: 'string', email: 'string' }
    });
    
    if (!createValid || createRes.status !== 201) {
        logError('Create_User', createRes, createPayload, 'User creation failed');
        return; // Stop this iteration
    }
    
    // Extract user ID for correlation
    const userId = extractAndStore(createRes, 'id', 'userId');
    if (!userId) {
        logCorrelationFailure('Create_User', ['userId'], createPayload);
        return;
    }
    
    console.log(`[VU ${__VU}:${__ITER}] ✓ Created user: ${userId}`);
    sleep(0.5);
    
    // ========================================
    // STEP 2: GET User
    // ========================================
    if (!validateCorrelations(['userId'])) {
        logCorrelationFailure('Get_User', ['userId']);
        return;
    }
    
    const getRes = http.get(
        `${BASE_URL}/api/users/${userId}`,
        { 
            headers,
            tags: { api: 'Get_User' }
        }
    );
    
    const getValid = validateResponse(getRes, {
        apiName: 'Get_User',
        expectedStatus: 200,
        jsonSchema: { id: 'string', email: 'string' }
    });
    
    if (!getValid) {
        logError('Get_User', getRes, { userId }, 'Failed to retrieve user');
        return;
    }
    
    console.log(`[VU ${__VU}:${__ITER}] ✓ Retrieved user: ${userId}`);
    sleep(0.5);
    
    // ========================================
    // STEP 3: UPDATE User
    // ========================================
    if (!validateCorrelations(['userId'])) {
        logCorrelationFailure('Update_User', ['userId']);
        return;
    }
    
    const updatePayload = {
        firstName: 'Updated',
        lastName: 'User',
        status: 'active'
    };
    
    const updateRes = http.put(
        `${BASE_URL}/api/users/${userId}`,
        JSON.stringify(updatePayload),
        { 
            headers,
            tags: { api: 'Update_User' }
        }
    );
    
    const updateValid = validateResponse(updateRes, {
        apiName: 'Update_User',
        expectedStatus: 200
    });
    
    if (!updateValid) {
        logError('Update_User', updateRes, { userId, ...updatePayload }, 'Failed to update user');
        return;
    }
    
    console.log(`[VU ${__VU}:${__ITER}] ✓ Updated user: ${userId}`);
    sleep(0.5);
    
    // ========================================
    // STEP 4: DELETE User (Conditional - 25% of iterations)
    // ========================================
    const shouldDelete = Math.random() * 100 < DELETE_PERCENTAGE;
    
    if (shouldDelete) {
        if (!validateCorrelations(['userId'])) {
            logCorrelationFailure('Delete_User', ['userId']);
            return;
        }
        
        const deleteRes = http.del(
            `${BASE_URL}/api/users/${userId}`,
            null,
            { 
                headers,
                tags: { api: 'Delete_User' }
            }
        );
        
        const deleteValid = validateResponse(deleteRes, {
            apiName: 'Delete_User',
            expectedStatuses: [200, 204]
        });
        
        if (!deleteValid) {
            logError('Delete_User', deleteRes, { userId }, 'Failed to delete user');
        } else {
            console.log(`[VU ${__VU}:${__ITER}] ✓ Deleted user: ${userId}`);
        }
    }
    
    sleep(1);
}

/**
 * Teardown function - runs once after test
 */
export function teardown(data) {
    console.log('\n' + '='.repeat(80));
    console.log('TEARDOWN: Test Completed');
    console.log('='.repeat(80));
}

/**
 * Custom summary handler
 */
export function handleSummary(data) {
    const businessErrors = data.metrics.business_error_rate;
    const errorRate = businessErrors ? businessErrors.values.rate * 100 : 0;
    
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Duration: ${data.metrics.iteration_duration.values.avg.toFixed(2)}ms avg`);
    console.log(`Iterations: ${data.metrics.iterations.values.count}`);
    console.log(`HTTP Requests: ${data.metrics.http_reqs.values.count}`);
    console.log(`Failed Requests: ${data.metrics.http_req_failed.values.rate * 100}%`);
    console.log(`Business Error Rate: ${errorRate.toFixed(2)}%`);
    console.log(`p95 Response Time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
    console.log(`p99 Response Time: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`);
    console.log('='.repeat(80));
    
    // Print error summary
    console.log(formatErrorSummary());
    
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    };
}
