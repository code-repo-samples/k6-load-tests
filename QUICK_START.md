# Quick Start Guide

## Installation

1. **Install k6**
   ```bash
   # macOS
   brew install k6
   
   # Windows
   choco install k6
   
   # Linux
   sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
   echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update
   sudo apt-get install k6
   ```

2. **Download Framework**
   - Extract the framework ZIP file
   - Navigate to the framework directory

3. **Prepare Test Data**
   - Edit CSV files in `data/` directory with your test data
   - Or use provided sample data for initial testing

## Running Your First Test

### Test 1: Simple CRUD Flow (Recommended for first run)

```bash
# Using sample API (httpbin.org for testing)
k6 run \
  -e BASE_URL=https://httpbin.org \
  -e AUTH_URL=https://httpbin.org/basic-auth/admin/admin \
  -e AUTH_USER=admin \
  -e AUTH_PASS=admin \
  tests/script1-full-crud.js
```

### Test 2: High-TPS Test

```bash
k6 run \
  -e BASE_URL=https://api.example.com \
  -e TARGET_TPS=100 \
  -e DURATION=2m \
  tests/script2-high-tps.js
```

### Test 3: Single API Test

```bash
k6 run \
  -e BASE_URL=https://api.example.com \
  -e API_ENDPOINT=/api/orders \
  tests/script3-single-api.js
```

## Customizing for Your API

### Step 1: Update Authentication

Edit the auth configuration in your test script or set environment variables:

```bash
-e AUTH_URL=https://your-api.com/auth/login \
-e AUTH_USER=your-username \
-e AUTH_PASS=your-password
```

If your auth response has a different token structure, update `tokenPath`:

```javascript
// In setup() function
return initTokenManager({
    url: __ENV.AUTH_URL,
    username: __ENV.AUTH_USER,
    password: __ENV.AUTH_PASS,
    expirySeconds: 600,
    tokenPath: 'data.access_token'  // Change based on your API response
});
```

### Step 2: Update API Endpoints

Modify the URLs in your test script:

```javascript
// Before
const createRes = http.post(`${BASE_URL}/api/users`, ...);

// After
const createRes = http.post(`${BASE_URL}/api/v1/customers`, ...);
```

### Step 3: Update Request Payloads

Modify payload generation to match your API schema:

```javascript
const createPayload = {
    // Your API's required fields
    customerName: userData.firstName + ' ' + userData.lastName,
    emailAddress: userData.email,
    accountType: userData.accountType
};
```

### Step 4: Update Response Validation

Adjust validation to match your API responses:

```javascript
const valid = validateResponse(createRes, {
    apiName: 'Create_Customer',
    expectedStatus: 201,  // Your API's success status code
    jsonSchema: { 
        customerId: 'string',  // Fields your API returns
        accountNumber: 'string'
    }
});
```

### Step 5: Update Correlation Paths

Change JSON paths to match your API response structure:

```javascript
// If your API returns: { "data": { "customer": { "id": "123" } } }
const customerId = extractAndStore(createRes, 'data.customer.id', 'customerId');

// If your API returns: { "id": "123" }
const customerId = extractAndStore(createRes, 'id', 'customerId');
```

## Understanding Test Data Requirements

### Data Calculation

For a test with:
- 10 VUs (Virtual Users)
- 100 iterations per VU
- **Required CSV records: 1000**

Formula: `VUs × Iterations = Required Records`

### Checking Data Sufficiency

The framework automatically validates data before starting:

```
[DATA] Capacity check: 500 records available, 1000 required (10 VUs × 100 iterations)
[DATA] ⚠ WARNING: Insufficient data! Need 500 more records
```

### Creating More Test Data

Option 1: Add more rows to your CSV
Option 2: Reduce VUs or iterations
Option 3: Use random data selection (modify script)

## Monitoring Test Execution

### Console Output

During execution, you'll see:
```
[TOKEN] ✓ New token generated (valid until 2024-01-26T10:40:45Z)
[VU 1:0] ✓ Created user: USER_1706267845123_A7K9
[VU 1:0] ✓ Retrieved user: USER_1706267845123_A7K9
[VU 1:0] ✓ Updated user: USER_1706267845123_A7K9
```

### Error Messages

Errors are clearly formatted:
```
╔════════════════════════════════════════════════════════════════
║ ERROR: Create_User
╠════════════════════════════════════════════════════════════════
║ Time:         2024-01-26T10:30:45.123Z
║ VU:           5
║ Iteration:    10
║ Status:       400 Bad Request
║ Response:     {"error":"Invalid email format"}
║ Input:        {"email":"invalid@test"}
╚════════════════════════════════════════════════════════════════
```

### Final Summary

At test end:
```
================================================================================
TEST SUMMARY
================================================================================
Duration: 1250.45ms avg
Iterations: 100
HTTP Requests: 400
Failed Requests: 2.5%
Business Error Rate: 5.00%
p95 Response Time: 1234.56ms
p99 Response Time: 2345.67ms
================================================================================
```

## Common Issues & Solutions

### Issue: "CSV data exhausted"

**Solution**: Add more records to your CSV file or reduce VUs/iterations

### Issue: "Token generation failed"

**Solution**: 
1. Verify AUTH_URL is correct
2. Check AUTH_USER and AUTH_PASS credentials
3. Update `tokenPath` to match your API response

### Issue: "Missing required correlation"

**Solution**: 
1. Check if previous API call succeeded
2. Verify JSON path in `extractAndStore()` matches API response
3. Print response to see actual structure: `console.log(res.body)`

### Issue: "Business error rate threshold exceeded"

**Solution**:
1. Check error logs for specific failures
2. Verify API endpoints are correct
3. Validate request payloads match API requirements
4. Reduce load to see if API is overwhelmed

## Next Steps

1. **Customize Scripts**: Adapt test scripts to your specific API
2. **Add More Scenarios**: Create additional test scripts for different flows
3. **Scale Gradually**: Start with low TPS (100) and increase gradually
4. **Monitor Metrics**: Watch for error rates and response times
5. **Iterate**: Refine based on results

## Getting Help

Check these files for detailed information:
- `README.md` - Complete framework documentation
- `tests/` - Example scripts showing different patterns
- `lib/` - Framework modules with inline documentation

## Example: Complete Custom Test

```javascript
import http from 'k6/http';
import { initTokenManager, getToken } from '../lib/auth/tokenManager.js';
import { loadCSVData, getUniqueData } from '../lib/data/csvManager.js';
import { extractAndStore, validateCorrelations } from '../lib/correlation/correlationManager.js';
import { validateResponse } from '../lib/validation/validators.js';
import { logError } from '../lib/errors/errorLogger.js';

const customers = loadCSVData('customers', './data/customers.csv');

export const options = {
    scenarios: {
        customer_flow: {
            executor: 'ramping-vus',
            stages: [
                { duration: '30s', target: 5 },
                { duration: '2m', target: 5 },
            ],
        },
    },
    thresholds: {
        'business_error_rate': ['rate<0.20'],
    },
};

export function setup() {
    return initTokenManager({
        url: 'https://your-api.com/oauth/token',
        username: 'api-user',
        password: 'api-pass',
        expirySeconds: 300,
        tokenPath: 'access_token'
    });
}

export default function(data) {
    const customer = getUniqueData(customers, __VU, __ITER);
    const token = getToken(data);
    const headers = { 'Authorization': `Bearer ${token}` };
    
    // Create customer
    const createRes = http.post(
        'https://your-api.com/api/customers',
        JSON.stringify({ name: customer.name, email: customer.email }),
        { headers }
    );
    
    if (!validateResponse(createRes, { apiName: 'Create', expectedStatus: 201 })) {
        logError('Create', createRes, customer);
        return;
    }
    
    const customerId = extractAndStore(createRes, 'id', 'customerId');
    
    // Get customer
    if (validateCorrelations(['customerId'])) {
        const getRes = http.get(
            `https://your-api.com/api/customers/${customerId}`,
            { headers }
        );
        validateResponse(getRes, { apiName: 'Get', expectedStatus: 200 });
    }
}
```

Happy Testing! 🚀
