# Enterprise K6 Framework - Usage Examples

## 📖 Table of Contents

1. [Basic CRUD Workflow](#basic-crud-workflow)
2. [High-TPS Testing](#high-tps-testing)
3. [Authentication Patterns](#authentication-patterns)
4. [Data Management](#data-management)
5. [Correlation Examples](#correlation-examples)
6. [Error Handling](#error-handling)
7. [Custom Scenarios](#custom-scenarios)
8. [Advanced Patterns](#advanced-patterns)

---

## Basic CRUD Workflow

### Complete Create-Read-Update-Delete Flow

```javascript
import http from 'k6/http';
import { sleep } from 'k6';
import { initTokenManager, getToken } from '../lib/auth/tokenManager.js';
import { loadCSVData, getUniqueData } from '../lib/data/csvManager.js';
import { 
    extractAndStore, 
    validateCorrelations, 
    clearCorrelations 
} from '../lib/correlation/correlationManager.js';
import { validateResponse } from '../lib/validation/validators.js';
import { logError } from '../lib/errors/errorLogger.js';
import { generateUserPayload } from '../lib/generators/dataGenerators.js';

const users = loadCSVData('users', './data/users.csv');

export const options = {
    scenarios: {
        crud: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 5 },
                { duration: '2m', target: 5 },
                { duration: '30s', target: 0 },
            ],
        },
    },
};

export function setup() {
    return initTokenManager({
        url: 'https://api.example.com/auth/token',
        username: 'admin',
        password: 'secret',
        expirySeconds: 600
    });
}

export default function(data) {
    clearCorrelations();
    
    const user = getUniqueData(users, __VU, __ITER);
    const token = getToken(data);
    const headers = { 'Authorization': `Bearer ${token}` };
    
    // CREATE
    const createPayload = generateUserPayload({ email: user.email });
    const createRes = http.post(
        'https://api.example.com/api/users',
        JSON.stringify(createPayload),
        { headers }
    );
    
    if (!validateResponse(createRes, {
        apiName: 'Create',
        expectedStatus: 201,
        jsonSchema: { id: 'string' }
    })) {
        logError('Create', createRes, createPayload);
        return;
    }
    
    const userId = extractAndStore(createRes, 'id', 'userId');
    sleep(1);
    
    // READ
    if (validateCorrelations(['userId'])) {
        const getRes = http.get(
            `https://api.example.com/api/users/${userId}`,
            { headers }
        );
        validateResponse(getRes, { apiName: 'Read', expectedStatus: 200 });
    }
    sleep(1);
    
    // UPDATE
    if (validateCorrelations(['userId'])) {
        const updateRes = http.put(
            `https://api.example.com/api/users/${userId}`,
            JSON.stringify({ status: 'active' }),
            { headers }
        );
        validateResponse(updateRes, { apiName: 'Update', expectedStatus: 200 });
    }
    sleep(1);
    
    // DELETE (25% of time)
    if (Math.random() < 0.25 && validateCorrelations(['userId'])) {
        const deleteRes = http.del(
            `https://api.example.com/api/users/${userId}`,
            null,
            { headers }
        );
        validateResponse(deleteRes, { 
            apiName: 'Delete', 
            expectedStatuses: [200, 204] 
        });
    }
}
```

---

## High-TPS Testing

### Constant 1000 TPS for 5 Minutes

```javascript
import http from 'k6/http';
import { initTokenManager, getToken } from '../lib/auth/tokenManager.js';
import { validateResponse } from '../lib/validation/validators.js';

export const options = {
    scenarios: {
        constant_tps: {
            executor: 'constant-arrival-rate',
            rate: 1000,                    // 1000 requests per second
            timeUnit: '1s',
            duration: '5m',
            preAllocatedVUs: 100,          // Pre-allocate VUs
            maxVUs: 200,                   // Max VUs if needed
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<1000'],
        'http_req_failed': ['rate<0.01'],
    },
};

export function setup() {
    return initTokenManager({
        url: 'https://api.example.com/auth/token',
        username: 'loadtest',
        password: 'loadtest123',
        expirySeconds: 600
    });
}

export default function(data) {
    const token = getToken(data);
    const res = http.get(
        'https://api.example.com/api/health',
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    validateResponse(res, {
        apiName: 'Health_Check',
        expectedStatus: 200
    });
}
```

### Ramping TPS from 100 to 5000

```javascript
export const options = {
    scenarios: {
        ramping_tps: {
            executor: 'ramping-arrival-rate',
            startRate: 100,
            timeUnit: '1s',
            stages: [
                { duration: '2m', target: 500 },   // Ramp to 500 TPS
                { duration: '5m', target: 500 },   // Hold at 500
                { duration: '2m', target: 2000 },  // Ramp to 2000
                { duration: '5m', target: 2000 },  // Hold at 2000
                { duration: '2m', target: 5000 },  // Ramp to 5000
                { duration: '3m', target: 5000 },  // Hold at 5000
                { duration: '2m', target: 0 },     // Ramp down
            ],
            preAllocatedVUs: 500,
            maxVUs: 1000,
        },
    },
};
```

---

## Authentication Patterns

### Basic Token Auth

```javascript
export function setup() {
    return initTokenManager({
        url: 'https://api.example.com/auth/token',
        username: __ENV.AUTH_USER,
        password: __ENV.AUTH_PASS,
        expirySeconds: 600,
        tokenPath: 'access_token'  // Default path
    });
}
```

### Nested Token Response

```javascript
// If API returns: { "data": { "auth": { "token": "xxx" } } }
export function setup() {
    return initTokenManager({
        url: 'https://api.example.com/auth/login',
        username: __ENV.AUTH_USER,
        password: __ENV.AUTH_PASS,
        expirySeconds: 300,
        tokenPath: 'data.auth.token'  // Nested path
    });
}
```

### Custom Auth Body

```javascript
export function setup() {
    return initTokenManager({
        url: 'https://api.example.com/oauth/token',
        username: __ENV.CLIENT_ID,
        password: __ENV.CLIENT_SECRET,
        expirySeconds: 3600,
        tokenPath: 'access_token',
        bodyTemplate: {
            grant_type: 'client_credentials',
            client_id: __ENV.CLIENT_ID,
            client_secret: __ENV.CLIENT_SECRET
        }
    });
}
```

### Multiple Token Types

```javascript
export function setup() {
    // Admin token
    const adminToken = initTokenManager({
        url: 'https://api.example.com/auth/admin',
        username: 'admin',
        password: 'admin123',
        expirySeconds: 600
    });
    
    // User token
    const userToken = initTokenManager({
        url: 'https://api.example.com/auth/user',
        username: 'user',
        password: 'user123',
        expirySeconds: 600
    });
    
    return { adminToken, userToken };
}

export default function(data) {
    const adminTok = getToken(data.adminToken);
    const userTok = getToken(data.userToken);
    
    // Use different tokens for different calls
}
```

---

## Data Management

### Loading Multiple CSV Files

```javascript
const users = loadCSVData('users', './data/users.csv');
const products = loadCSVData('products', './data/products.csv');
const orders = loadCSVData('orders', './data/orders.csv');

export default function() {
    const user = getUniqueData(users, __VU, __ITER);
    const product = getRandomData(products);
    const order = getDataByIndex(orders, __ITER);
}
```

### Data Validation Before Test

```javascript
import { validateDataset, isDataSufficient } from '../lib/data/csvManager.js';

const users = loadCSVData('users', './data/users.csv');

export function setup() {
    // Validate required fields
    const validation = validateDataset(users, ['email', 'firstName', 'lastName']);
    if (!validation.valid) {
        throw new Error(`Data validation failed: ${validation.error}`);
    }
    
    // Check sufficiency
    const vus = 10;
    const iterations = 100;
    if (!isDataSufficient(users, vus, iterations)) {
        throw new Error('Insufficient test data!');
    }
    
    console.log(`✓ Data validated: ${users.length} records available`);
}
```

### Conditional Data Exhaustion Handling

```javascript
export default function() {
    const user = getUniqueData(users, __VU, __ITER, {
        abortOnExhaustion: false,  // Don't abort test
        logExhaustion: true         // Just log warning
    });
    
    if (!user) {
        console.warn('Data exhausted, using random data');
        // Fallback to generated data
        const randomUser = generateUserPayload();
        // ... continue with random data
    }
}
```

---

## Correlation Examples

### Simple ID Correlation

```javascript
// Create resource
const createRes = http.post(url, payload);
const resourceId = extractAndStore(createRes, 'id', 'resourceId');

// Use in subsequent call
const getRes = http.get(`${url}/${resourceId}`);
```

### Multi-Level Correlation

```javascript
// Extract nested values
const userId = extractAndStore(createRes, 'data.user.id', 'userId');
const accountId = extractAndStore(createRes, 'data.account.id', 'accountId');
const email = extractAndStore(createRes, 'data.user.email', 'email');

// Validate all required correlations
if (!validateCorrelations(['userId', 'accountId'])) {
    logCorrelationFailure('Update_User', ['userId', 'accountId']);
    return;
}
```

### Array Element Correlation

```javascript
// Extract from array: { "items": [{"id": "123"}] }
const firstItemId = extractAndStore(res, 'items[0].id', 'itemId');
```

### URL Building with Correlations

```javascript
// Automatic URL building
const url = buildCorrelatedUrl('/api/users/{userId}/orders/{orderId}');
// If userId=123 and orderId=456, returns: /api/users/123/orders/456

// Manual correlation retrieval
const userId = getCorrelatedValue('userId');
const orderId = getCorrelatedValue('orderId');
const url = `/api/users/${userId}/orders/${orderId}`;
```

### Extract Multiple Values at Once

```javascript
const values = extractMultiple(response, {
    userId: 'user.id',
    userName: 'user.name',
    email: 'user.email',
    accountId: 'account.id'
});

// Access extracted values
console.log(`User ${values.userId} created: ${values.email}`);
```

---

## Error Handling

### Basic Error Logging

```javascript
const res = http.post(url, payload);

if (res.status !== 201) {
    logError('Create_User', res, payload, 'User creation failed');
    return; // Stop iteration
}
```

### Detailed Error Context

```javascript
const inputData = {
    email: user.email,
    customerId: customer.id,
    orderId: order.id
};

const res = http.post(url, JSON.stringify(inputData));

if (res.status >= 400) {
    logError(
        'Create_Order',
        res,
        inputData,
        `Failed to create order for customer ${customer.id}`
    );
    return;
}
```

### Validation Failure Logging

```javascript
const valid = validateResponse(res, {
    apiName: 'Get_User',
    expectedStatus: 200,
    jsonSchema: { id: 'string', email: 'string' }
});

if (!valid) {
    logValidationFailure(
        'Get_User',
        'Missing required fields in response',
        res
    );
}
```

### Correlation Failure Logging

```javascript
if (!validateCorrelations(['userId', 'orderId'])) {
    logCorrelationFailure(
        'Update_Order',
        ['userId', 'orderId'],
        { originalEmail: user.email }
    );
    return;
}
```

---

## Custom Scenarios

### Percentage-Based Traffic Mix

```javascript
export default function(data) {
    const random = Math.random() * 100;
    
    if (random < 60) {
        // 60% - Browse products
        browseProducts(data);
    } else if (random < 90) {
        // 30% - Search
        searchProducts(data);
    } else {
        // 10% - Purchase
        purchaseProduct(data);
    }
}

function browseProducts(data) {
    const token = getToken(data);
    // Browse logic
}

function searchProducts(data) {
    const token = getToken(data);
    // Search logic
}

function purchaseProduct(data) {
    const token = getToken(data);
    // Purchase logic with full CRUD
}
```

### Time-Based Scenarios

```javascript
export default function(data) {
    const hour = new Date().getHours();
    
    if (hour >= 9 && hour < 17) {
        // Business hours - higher load
        businessHoursFlow(data);
    } else {
        // Off hours - lower load, maintenance operations
        maintenanceFlow(data);
    }
}
```

### Sequential Multi-Step Workflow

```javascript
export default function(data) {
    clearCorrelations();
    
    // Step 1: Create account
    if (!createAccount(data)) return;
    
    // Step 2: Verify email
    if (!verifyEmail(data)) return;
    
    // Step 3: Add profile info
    if (!addProfile(data)) return;
    
    // Step 4: Upload avatar
    if (!uploadAvatar(data)) return;
    
    console.log('[WORKFLOW] ✓ Complete signup flow successful');
}

function createAccount(data) {
    const res = http.post(/* ... */);
    if (res.status !== 201) {
        logError('Create_Account', res);
        return false;
    }
    extractAndStore(res, 'id', 'accountId');
    return true;
}
```

---

## Advanced Patterns

### Conditional Execution Based on Previous Results

```javascript
export default function(data) {
    const createRes = http.post(url, createPayload);
    
    if (createRes.status === 201) {
        // Success path - full workflow
        const id = extractAndStore(createRes, 'id', 'resourceId');
        performGetUpdate(data, id);
    } else if (createRes.status === 409) {
        // Resource already exists - skip to update
        const existingId = extractAndStore(createRes, 'existing_id', 'resourceId');
        performUpdate(data, existingId);
    } else {
        // Error - log and abort
        logError('Create', createRes);
    }
}
```

### Retry Logic with Backoff

```javascript
function createWithRetry(data, payload, maxRetries = 3) {
    const token = getToken(data);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const res = http.post(url, payload, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.status === 201) {
            return res; // Success
        }
        
        if (res.status >= 500 && attempt < maxRetries) {
            // Server error - retry with backoff
            const backoff = Math.pow(2, attempt) * 0.1; // 0.2s, 0.4s, 0.8s
            console.log(`Retry ${attempt}/${maxRetries} after ${backoff}s`);
            sleep(backoff);
        } else {
            // Client error or final attempt - log and return
            logError('Create', res, payload);
            return res;
        }
    }
}
```

### Dynamic Payload Generation

```javascript
export default function(data) {
    const user = getUniqueData(users, __VU, __ITER);
    
    // Generate dynamic payload based on test data
    const payload = {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        metadata: {
            testRun: __ENV.TEST_RUN_ID,
            timestamp: new Date().toISOString(),
            vu: __VU,
            iter: __ITER
        },
        preferences: {
            newsletter: Math.random() > 0.5,
            notifications: Math.random() > 0.3
        }
    };
    
    const res = http.post(url, JSON.stringify(payload));
}
```

### Parameterized Test with Environment

```javascript
// Run with: k6 run -e SCENARIO=create tests/script.js
//       or: k6 run -e SCENARIO=read tests/script.js

export default function(data) {
    const scenario = __ENV.SCENARIO || 'all';
    
    switch(scenario) {
        case 'create':
            testCreate(data);
            break;
        case 'read':
            testRead(data);
            break;
        case 'update':
            testUpdate(data);
            break;
        case 'delete':
            testDelete(data);
            break;
        default:
            testAll(data);
    }
}
```

---

## Performance Tips

### Minimize Sleep for High TPS

```javascript
// For high TPS, avoid sleep
export default function(data) {
    // No sleep - maximum throughput
    http.get(url);
}

// For realistic user simulation, add think time
export default function(data) {
    http.get(url);
    sleep(1 + Math.random() * 2); // 1-3 second think time
}
```

### Batch Requests (Parallel)

```javascript
export default function(data) {
    const token = getToken(data);
    const headers = { 'Authorization': `Bearer ${token}` };
    
    // Execute multiple requests in parallel
    const responses = http.batch([
        ['GET', `${url}/users/1`, null, { headers }],
        ['GET', `${url}/users/2`, null, { headers }],
        ['GET', `${url}/users/3`, null, { headers }],
    ]);
    
    responses.forEach((res, index) => {
        validateResponse(res, {
            apiName: `Get_User_${index + 1}`,
            expectedStatus: 200
        });
    });
}
```

### Connection Reuse

```javascript
// k6 automatically reuses connections with keep-alive
// No special configuration needed
// Just avoid creating new connections unnecessarily
```

---

This examples guide covers the most common patterns. Mix and match these examples to create your custom test scenarios!
