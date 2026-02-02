# Enterprise k6 API Testing Framework

A production-ready, scalable k6 framework for enterprise API load testing with support for 400-5000+ TPS.

## 🎯 Features

- **CSV-Driven Testing**: Load test data from CSV files with automatic exhaustion detection
- **Smart Token Management**: Automatic token generation, caching, and refresh
- **CRUD Workflows**: Complete Create → Get → Update → Delete flows with correlation
- **Fail-Fast Architecture**: Stop immediately on data exhaustion or critical failures
- **Comprehensive Error Logging**: Detailed error tracking with context and input data
- **Business Error Rate Tracking**: Separate tracking of business vs transport errors
- **Auto-Abort on Thresholds**: Automatically stop tests when error rates exceed limits
- **Multiple Test Scenarios**: Ramp-up, steady-state, high-TPS, and single-API patterns
- **Scalable to 5000+ TPS**: Change configuration only, no code changes needed

## 📁 Framework Structure

```
k6-enterprise-framework/
├── lib/                          # Reusable framework modules
│   ├── auth/
│   │   └── tokenManager.js       # Token generation, caching, auto-refresh
│   ├── data/
│   │   └── csvManager.js         # CSV loading with exhaustion detection
│   ├── correlation/
│   │   └── correlationManager.js # Extract and validate correlated values
│   ├── validation/
│   │   └── validators.js         # Response validation with tagged checks
│   ├── errors/
│   │   └── errorLogger.js        # Comprehensive error logging
│   └── generators/
│       └── dataGenerators.js     # Synthetic data generation
├── tests/                        # Test scripts
│   ├── script1-full-crud.js      # Full CRUD with ramp-up
│   ├── script2-high-tps.js       # High-TPS steady state
│   └── script3-single-api.js     # Simple single-API test
├── data/                         # Test data files
│   ├── users.csv                 # Sample user data
│   ├── auth.csv                  # Authentication credentials
│   └── orders.csv                # Sample order data
├── config/                       # Configuration files
└── docs/                         # Documentation
```

## 🚀 Quick Start

### Prerequisites

- k6 installed ([installation guide](https://k6.io/docs/getting-started/installation/))
- Test data CSV files in `data/` directory
- API endpoint accessible

### Running Tests

#### Script 1: Full CRUD with Ramp-up

```bash
k6 run \
  -e BASE_URL=https://api.example.com \
  -e AUTH_URL=https://api.example.com/auth/token \
  -e AUTH_USER=admin \
  -e AUTH_PASS=secret \
  tests/script1-full-crud.js
```

#### Script 2: High-TPS Test (1000 TPS)

```bash
k6 run \
  -e BASE_URL=https://api.example.com \
  -e TARGET_TPS=1000 \
  -e DURATION=5m \
  tests/script2-high-tps.js
```

#### Script 3: Single API Test

```bash
k6 run \
  -e BASE_URL=https://api.example.com \
  -e API_ENDPOINT=/api/orders \
  tests/script3-single-api.js
```

## 📊 Test Data Management

### CSV File Format

**users.csv**:
```csv
email,firstName,lastName,phone,accountType
user001@example.com,John,Smith,555-0101,premium
user002@example.com,Jane,Doe,555-0102,basic
```

**auth.csv**:
```csv
username,password,role
admin,admin123,administrator
testuser1,test123,user
```

**orders.csv**:
```csv
orderId,customerId,amount,currency,items
ORD001,CUST001,99.99,USD,"[{\"sku\":\"PROD001\",\"qty\":2}]"
```

### Data Exhaustion Protection

The framework automatically:
- Ensures each VU + iteration gets unique data
- Stops test when CSV data is exhausted
- Logs clear error messages about data capacity
- Validates data sufficiency before test starts

## 🔐 Authentication & Token Management

### Token Configuration

```javascript
initTokenManager({
    url: 'https://api.example.com/auth/token',
    username: 'admin',
    password: 'secret',
    expirySeconds: 600,              // Token lifetime
    tokenPath: 'access_token'         // JSON path to token in response
});
```

### Auto-Refresh Logic

- Tokens cached and shared across all VUs
- Automatic refresh at 80% of token lifetime
- Thread-safe refresh with locking mechanism
- Detailed logging of generation vs reuse

## 🔗 Correlation

### Extracting Values

```javascript
// Extract and store user ID from Create response
const userId = extractAndStore(createRes, 'id', 'userId');

// Extract multiple values
const extracted = extractMultiple(response, {
    userId: 'user.id',
    email: 'user.email',
    accountId: 'account.id'
});
```

### Validating Correlations

```javascript
// Validate required correlations exist before dependent call
if (!validateCorrelations(['userId', 'orderId'])) {
    return; // Stop this iteration
}

// Build URL with correlated values
const url = buildCorrelatedUrl('/api/users/{userId}/orders/{orderId}');
```

## ✅ Validation & Checks

### Comprehensive Response Validation

```javascript
const valid = validateResponse(res, {
    apiName: 'Create_User',
    expectedStatus: 201,
    jsonSchema: { id: 'string', email: 'string' },
    bodyContains: 'success',
    customChecks: {
        'email format valid': (r) => r.json('email').includes('@')
    }
});
```

### Per-API Metrics

All checks are tagged with API name for granular reporting:
- `http_req_duration{api:Create_User}`
- `http_req_duration{api:Get_User}`
- `http_req_duration{api:Update_User}`

## ❌ Error Handling

### Error Logging

```javascript
// Log error with full context
if (res.status !== 201) {
    logError('Create_User', res, { email: user.email }, 'Creation failed');
    return; // Stop iteration
}

// Log correlation failures
logCorrelationFailure('Update_User', ['userId'], inputData);

// Log validation failures
logValidationFailure('Get_User', 'Missing required field', res);
```

### Error Output

Errors are logged to console with full context:
```
╔════════════════════════════════════════════════════════════════
║ ERROR: Create_User
╠════════════════════════════════════════════════════════════════
║ Time:         2024-01-26T10:30:45.123Z
║ VU:           5
║ Iteration:    10
║ Status:       400 Bad Request
║ Response:     {"error":"Invalid email format"}
║ Input:        {"email":"invalid","firstName":"John"}
╚════════════════════════════════════════════════════════════════
```

## 📈 Thresholds & Auto-Abort

### Business Error Rate Threshold

```javascript
thresholds: {
    'business_error_rate': ['rate<0.20'], // Abort if > 20%
}
```

### Response Time Thresholds

```javascript
thresholds: {
    'http_req_duration': ['p(95)<5000', 'p(99)<10000'],
}
```

### Auto-Abort

Test automatically aborts when:
- Business error rate exceeds 20%
- CSV data is exhausted
- Critical correlation failures occur

## 🎨 Generating Synthetic Data

```javascript
import { 
    generateEmail, 
    generateUserId, 
    generateUserPayload 
} from './lib/generators/dataGenerators.js';

// Generate email
const email = generateEmail('user', 'testdomain.com');
// Returns: user_a7k9m21706267@testdomain.com

// Generate user payload
const payload = generateUserPayload({
    email: 'custom@example.com'
});
// Returns: { email, firstName, lastName, phone, userId, createdAt }
```

## 📊 Scaling to High TPS

### Configuration-Only Scaling

Change TPS via environment variable:

```bash
# 500 TPS
k6 run -e TARGET_TPS=500 tests/script2-high-tps.js

# 2000 TPS
k6 run -e TARGET_TPS=2000 tests/script2-high-tps.js

# 5000 TPS
k6 run -e TARGET_TPS=5000 tests/script2-high-tps.js
```

### Performance Optimizations

- Connection pooling enabled
- Keep-alive connections
- Shared token across VUs
- Minimal sleep times for high TPS
- Efficient SharedArray for CSV data

## 🔧 Environment Variables

### Common Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `BASE_URL` | API base URL | - | `https://api.example.com` |
| `AUTH_URL` | Authentication URL | `${BASE_URL}/auth/token` | `https://api.example.com/login` |
| `AUTH_USER` | Auth username | `admin` | `testuser` |
| `AUTH_PASS` | Auth password | `password` | `secret123` |
| `TOKEN_EXPIRY` | Token lifetime (seconds) | `600` | `300` |
| `TARGET_TPS` | Target transactions/sec | `1000` | `5000` |
| `DURATION` | Test duration | `5m` | `10m` |
| `DELETE_PERCENTAGE` | % of iterations to delete | `25` | `30` |

## 📝 Creating Custom Scripts

### Basic Template

```javascript
import http from 'k6/http';
import { initTokenManager, getToken } from '../lib/auth/tokenManager.js';
import { loadCSVData, getUniqueData } from '../lib/data/csvManager.js';
import { validateResponse } from '../lib/validation/validators.js';
import { logError } from '../lib/errors/errorLogger.js';

const testData = loadCSVData('mydata', './data/mydata.csv');

export const options = {
    scenarios: {
        my_scenario: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 10 },
                { duration: '5m', target: 10 },
            ],
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<3000'],
        'business_error_rate': ['rate<0.20'],
    },
};

export function setup() {
    return initTokenManager({
        url: __ENV.AUTH_URL,
        username: __ENV.AUTH_USER,
        password: __ENV.AUTH_PASS,
        expirySeconds: 600
    });
}

export default function(data) {
    const record = getUniqueData(testData, __VU, __ITER);
    const token = getToken(data);
    
    // Your API calls here
    const res = http.get(
        `${__ENV.BASE_URL}/api/endpoint`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    validateResponse(res, {
        apiName: 'My_API',
        expectedStatus: 200
    });
}
```

## 🐛 Debugging

### Enable Verbose Logging

```bash
k6 run --verbose tests/script1-full-crud.js
```

### Check Data Capacity

Before running, verify data sufficiency:
```javascript
isDataSufficient(users, totalVUs, iterationsPerVU);
```

### View Error Summary

Errors are automatically summarized at end of test:
```
ERROR SUMMARY (5 total errors)
================================================================================

Create_User: 3 errors
  [2024-01-26T10:30:45Z] Status: 400, VU: 2, Iter: 5
    Input: {"email":"invalid"}
  [2024-01-26T10:31:12Z] Status: 500, VU: 5, Iter: 3
  ...

Get_User: 2 errors
  [2024-01-26T10:32:00Z] Status: 404, VU: 3, Iter: 8
  ...
```

## 🎯 Best Practices

1. **Data Management**
   - Always use CSV files for test data
   - Ensure sufficient data for VU × iterations
   - Use meaningful field names

2. **Error Handling**
   - Always validate responses
   - Log errors with input context
   - Fail fast on critical errors

3. **Correlation**
   - Extract IDs immediately after creation
   - Validate correlations before dependent calls
   - Clear correlations each iteration

4. **Token Management**
   - Configure appropriate expiry time
   - Let framework handle refresh automatically
   - Monitor token generation logs

5. **Scaling**
   - Start small (10-50 VUs) and increase gradually
   - Monitor business error rate
   - Use connection pooling for high TPS

## 📄 License

This framework is provided as-is for enterprise use.

## 🤝 Support

For issues or questions:
1. Check error logs for detailed context
2. Verify CSV data format and capacity
3. Validate environment variables
4. Review threshold configurations

## 🔄 Version History

- **v1.0.0** - Initial release with full CRUD, high-TPS, and single-API patterns
