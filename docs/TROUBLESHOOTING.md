# Troubleshooting Guide

## Common Issues and Solutions

### 🔴 Error: "CSV data exhausted"

**Symptoms:**
```
[DATA] Data exhausted! VU 5, Iter 10, Index 50 exceeds 45 records
ERRO[0005] CSV data exhausted at VU 5, Iteration 10
```

**Causes:**
- Not enough CSV records for the number of VUs × iterations
- Formula: Required records = VUs × Iterations

**Solutions:**

1. **Add more records to CSV:**
   ```bash
   # You need at least VUs × Iterations records
   # Example: 10 VUs × 100 iterations = 1000 records needed
   ```

2. **Reduce VUs or iterations:**
   ```javascript
   scenarios: {
       test: {
           vus: 5,          // Reduced from 10
           iterations: 10,  // Reduced from 100
       }
   }
   ```

3. **Use random data selection:**
   ```javascript
   // Instead of getUniqueData
   const user = getRandomData(users); // Allows reuse
   ```

---

### 🔴 Error: "Token generation failed"

**Symptoms:**
```
[TOKEN] Generation failed - Status: 401, Body: Unauthorized
Failed to generate initial token
```

**Causes:**
- Wrong AUTH_URL
- Invalid credentials
- API not accessible
- Wrong token path in response

**Solutions:**

1. **Verify AUTH_URL:**
   ```bash
   # Test manually first
   curl -X POST https://api.example.com/auth/token \
     -d '{"username":"admin","password":"secret"}'
   ```

2. **Check credentials:**
   ```bash
   k6 run -e AUTH_USER=correct_user -e AUTH_PASS=correct_pass test.js
   ```

3. **Update token path:**
   ```javascript
   // If your API returns: {"data":{"token":"xxx"}}
   initTokenManager({
       tokenPath: 'data.token'  // Instead of default 'access_token'
   });
   ```

4. **Add debug logging:**
   ```javascript
   const res = http.post(AUTH_URL, body);
   console.log('Auth response:', res.body); // See actual response
   ```

---

### 🔴 Error: "Missing required correlation"

**Symptoms:**
```
[CORRELATION] ✗ Missing required correlations: userId
[CORRELATION] Available correlations: none
```

**Causes:**
- Previous API call failed
- Extraction path is wrong
- Response doesn't contain expected field

**Solutions:**

1. **Check if previous call succeeded:**
   ```javascript
   const createRes = http.post(url, payload);
   console.log('Create status:', createRes.status);
   console.log('Create body:', createRes.body);
   
   if (createRes.status !== 201) {
       logError('Create', createRes, payload);
       return; // Don't try to extract
   }
   ```

2. **Verify extraction path:**
   ```javascript
   // Print response to see structure
   console.log('Response:', JSON.stringify(createRes.json(), null, 2));
   
   // Then adjust path
   const userId = extractAndStore(createRes, 'data.user.id', 'userId');
   ```

3. **Add fallback:**
   ```javascript
   const userId = extractAndStore(createRes, 'id', 'userId', {
       required: false,
       defaultValue: 'fallback-id'
   });
   ```

---

### 🔴 Error: "Business error rate threshold exceeded"

**Symptoms:**
```
WARN[0125] business_error_rate: rate<0.20
INFO[0125] Test aborted: threshold exceeded
```

**Causes:**
- Too many 4xx/5xx responses
- API is failing or slow
- Invalid requests

**Solutions:**

1. **Check error logs:**
   ```
   Look for the ERROR sections in console output
   Review Status codes and Response bodies
   ```

2. **Reduce load:**
   ```javascript
   // Lower VUs temporarily
   scenarios: {
       test: {
           stages: [
               { duration: '1m', target: 2 },  // Start lower
           ]
       }
   }
   ```

3. **Fix request payloads:**
   ```javascript
   // Ensure payload matches API requirements
   const valid = validateResponse(res, {
       apiName: 'Create',
       expectedStatus: 201
   });
   if (!valid) {
       console.log('Request:', payload);
       console.log('Response:', res.body);
   }
   ```

4. **Increase threshold temporarily:**
   ```javascript
   thresholds: {
       'business_error_rate': ['rate<0.40'], // Increased from 0.20
   }
   ```

---

### 🔴 Error: "open ./data/users.csv: no such file or directory"

**Symptoms:**
```
ERRO[0000] open ./data/users.csv: no such file or directory
```

**Causes:**
- CSV file doesn't exist
- Wrong file path
- Running from wrong directory

**Solutions:**

1. **Check file exists:**
   ```bash
   ls -la data/users.csv
   ```

2. **Run from correct directory:**
   ```bash
   # Must run from framework root
   cd k6-enterprise-framework
   k6 run tests/script1-full-crud.js
   ```

3. **Use absolute path:**
   ```javascript
   const users = loadCSVData('users', '/full/path/to/data/users.csv');
   ```

---

### 🔴 Error: "context deadline exceeded"

**Symptoms:**
```
WARN[0030] Request Failed: Post "https://api.example.com/api/users": context deadline exceeded
```

**Causes:**
- API is slow or timing out
- Network issues
- Default timeout too short

**Solutions:**

1. **Increase timeout:**
   ```javascript
   const res = http.post(url, payload, {
       headers: headers,
       timeout: '60s'  // Increased from default 30s
   });
   ```

2. **Check API health:**
   ```bash
   curl -w "@curl-format.txt" https://api.example.com/api/users
   ```

3. **Add retry logic:**
   ```javascript
   let res;
   let attempts = 0;
   while (attempts < 3) {
       res = http.post(url, payload, { timeout: '30s' });
       if (res.status !== 0) break;  // 0 = timeout
       attempts++;
       sleep(1);
   }
   ```

---

### 🔴 Error: "Validation failed: Missing required fields"

**Symptoms:**
```
[DATA] CSV parsing warnings for users: Missing required fields: email
```

**Causes:**
- CSV file has wrong headers
- Headers misspelled
- Extra spaces in CSV

**Solutions:**

1. **Check CSV format:**
   ```csv
   email,firstName,lastName    ← No spaces, exact field names
   test@example.com,John,Doe
   ```

2. **Validate CSV:**
   ```javascript
   const validation = validateDataset(users, ['email', 'firstName']);
   console.log('Validation:', validation);
   ```

3. **Fix header names:**
   ```csv
   # Wrong
   Email,First Name,Last Name
   
   # Correct
   email,firstName,lastName
   ```

---

### 🔴 Warning: "Token approaching expiry, refreshing..."

**This is NORMAL behavior - not an error!**

**What's happening:**
- Token is being automatically refreshed at 80% of lifetime
- This is expected and desired behavior

**No action needed** unless you see:
```
[TOKEN] Refresh failed, using existing token
```

In that case:
1. Check if AUTH_URL is still accessible
2. Verify credentials haven't changed
3. Check if auth server rate limits token generation

---

### 🔴 Performance Issues

#### Test not reaching target TPS

**Symptoms:**
```
Target TPS: 1000
Actual TPS: 450 (45% of target)
```

**Solutions:**

1. **Increase preAllocatedVUs:**
   ```javascript
   scenarios: {
       high_tps: {
           executor: 'constant-arrival-rate',
           rate: 1000,
           preAllocatedVUs: 200,  // Increased from 100
           maxVUs: 400,
       }
   }
   ```

2. **Remove sleep statements:**
   ```javascript
   // For high TPS, remove all sleep()
   export default function(data) {
       http.get(url);
       // sleep(1); // ← Remove this
   }
   ```

3. **Use batch requests:**
   ```javascript
   http.batch([
       ['GET', url1],
       ['GET', url2],
       ['GET', url3],
   ]);
   ```

#### High response times

**Symptoms:**
```
p95 Response Time: 8500.00ms
p99 Response Time: 12000.00ms
```

**Solutions:**

1. **Reduce load:**
   ```javascript
   // Test at lower TPS first
   rate: 100  // Instead of 1000
   ```

2. **Check API performance:**
   - Is API under-resourced?
   - Database bottlenecks?
   - Network latency?

3. **Add connection pooling:**
   ```javascript
   // k6 does this automatically, but verify:
   export const options = {
       batch: 10,
       batchPerHost: 6,
   };
   ```

---

### 🔴 Memory Issues

**Symptoms:**
```
fatal error: out of memory
```

**Causes:**
- Too many VUs
- Large CSV files
- Memory leak in script

**Solutions:**

1. **Use SharedArray for CSV:**
   ```javascript
   // Already done by loadCSVData, but verify:
   const users = loadCSVData('users', './data/users.csv');
   // This uses SharedArray internally ✓
   ```

2. **Reduce VUs:**
   ```javascript
   preAllocatedVUs: 50,  // Reduced from 500
   ```

3. **Clear large variables:**
   ```javascript
   export default function(data) {
       let largePayload = generateHugePayload();
       http.post(url, largePayload);
       largePayload = null; // Clear reference
   }
   ```

---

## Debugging Tips

### Enable Verbose Logging

```bash
k6 run --verbose tests/script1-full-crud.js
```

### Log HTTP Requests/Responses

```javascript
export default function(data) {
    const res = http.post(url, payload);
    
    console.log('===== REQUEST =====');
    console.log('URL:', url);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('===== RESPONSE =====');
    console.log('Status:', res.status);
    console.log('Body:', res.body);
    console.log('===================');
}
```

### Test Individual Components

```javascript
// Test token generation only
export function setup() {
    const tokenData = initTokenManager({...});
    console.log('Token test:', getTokenStats());
    return tokenData;
}

export default function(data) {
    // Just test token retrieval
    const token = getToken(data);
    console.log('Got token:', token ? 'YES' : 'NO');
}
```

### Validate Data Before Running

```javascript
export function setup() {
    const users = loadCSVData('users', './data/users.csv');
    
    // Print first record
    console.log('Sample record:', JSON.stringify(users[0], null, 2));
    
    // Validate structure
    const validation = validateDataset(users, ['email', 'firstName']);
    console.log('Validation:', validation);
    
    // Check capacity
    isDataSufficient(users, 10, 100);
}
```

---

## Getting More Help

### Check Framework Logs

All modules log important events:
- `[TOKEN]` - Token management events
- `[DATA]` - Data loading and usage
- `[CORRELATION]` - Value extraction and validation
- `[VALIDATION]` - Response validation
- `ERROR` boxes - Detailed error information

### Review Test Output

End-of-test summary shows:
- Total requests
- Error rates
- Response times
- Threshold pass/fail

### Increase Logging Detail

Temporarily add debug logs:
```javascript
console.log('VU:', __VU, 'Iter:', __ITER);
console.log('Current user:', JSON.stringify(user));
console.log('Correlations:', getAllCorrelations());
```

### Simplify to Isolate Issue

Create minimal test:
```javascript
export default function() {
    const res = http.get('https://api.example.com/health');
    console.log('Status:', res.status);
}
```

Then gradually add complexity until issue appears.

---

## Still Having Issues?

1. **Re-read the relevant section in README.md**
2. **Check EXAMPLES.md for similar patterns**
3. **Verify environment variables are set correctly**
4. **Test API manually with curl first**
5. **Start with minimal test and add complexity**

Most issues are configuration-related and can be solved by:
- Checking file paths
- Verifying credentials
- Reviewing API response structure
- Ensuring sufficient test data
