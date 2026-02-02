# K6 Enterprise Framework - File Index

## 📚 Complete File Listing

### Core Library Modules (`lib/`)

#### Authentication (`lib/auth/`)
- **tokenManager.js** - Enterprise token management with auto-refresh
  - Initialize token manager
  - Automatic token generation and caching
  - Auto-refresh at 80% lifetime
  - Thread-safe token retrieval
  - Token statistics and monitoring

#### Data Management (`lib/data/`)
- **csvManager.js** - CSV data loading and management
  - Load CSV with SharedArray for memory efficiency
  - Unique data distribution per VU and iteration
  - Automatic exhaustion detection
  - Data sufficiency validation
  - Multiple CSV support

#### Correlation (`lib/correlation/`)
- **correlationManager.js** - Value extraction and correlation
  - Extract values from JSON responses
  - Store correlated values per iteration
  - Validate correlations before dependent calls
  - Build URLs with correlated parameters
  - Correlation failure tracking

#### Validation (`lib/validation/`)
- **validators.js** - Response validation and checks
  - Comprehensive response validation
  - Status code validation
  - JSON schema validation
  - Tagged checks for per-API metrics
  - Business error rate tracking
  - Custom validation functions

#### Error Handling (`lib/errors/`)
- **errorLogger.js** - Detailed error logging
  - Log errors with full context
  - Include input data in error logs
  - Console output with formatted display
  - Error aggregation for summary
  - Per-API error tracking
  - Correlation failure logging

#### Data Generation (`lib/generators/`)
- **dataGenerators.js** - Synthetic data generation
  - Generate emails, names, phone numbers
  - Generate UUIDs and random strings
  - Generate user/order payloads
  - Generate addresses
  - Custom payload generation from schema
  - Timestamp generation

### Test Scripts (`tests/`)

- **script1-full-crud.js** - Complete CRUD workflow with ramp-up
  - CSV-driven test data
  - Create → Get → Update → Delete flow
  - Conditional delete (configurable percentage)
  - Correlation and fail-fast
  - Error tracking and logging
  - Auto-abort on threshold breach

- **script2-high-tps.js** - High-throughput steady state test
  - Configurable TPS (400-5000+)
  - Token management from small auth CSV
  - Mix of GET and POST operations
  - Constant arrival rate executor
  - Performance-optimized (no sleep)
  - Real-time TPS achievement tracking

- **script3-single-api.js** - Simple single-API test
  - Single POST endpoint
  - CSV-driven unique input
  - Auto-stop on data exhaustion
  - Input data logging on errors
  - Per-VU iteration control

### Test Data (`data/`)

- **users.csv** - Sample user data (20 records)
  - Fields: email, firstName, lastName, phone, accountType
  - Ready for CRUD script testing

- **auth.csv** - Authentication credentials (4 records)
  - Fields: username, password, role
  - For token generation testing

- **orders.csv** - Sample order data (10 records)
  - Fields: orderId, customerId, amount, currency, items
  - For single-API script testing

### Configuration (`config/`)

- **env.template** - Environment configuration template
  - API configuration variables
  - Authentication settings
  - Test execution parameters
  - Environment-specific examples (dev/staging/prod)
  - Usage instructions

### Documentation (`docs/`)

- **README.md** - Complete framework documentation
  - Feature overview
  - Framework structure
  - Installation and setup
  - Running tests
  - Data management guide
  - Authentication configuration
  - Correlation examples
  - Validation patterns
  - Error handling
  - Scaling to high TPS
  - Environment variables
  - Creating custom scripts
  - Best practices
  - Troubleshooting

- **QUICK_START.md** - Quick start guide
  - Installation steps
  - Running first test
  - Customizing for your API
  - Test data requirements
  - Monitoring execution
  - Common issues and solutions
  - Complete custom test example

## 📦 Module Dependencies

```
Tests (script1/2/3)
├── lib/auth/tokenManager.js
├── lib/data/csvManager.js
├── lib/correlation/correlationManager.js
├── lib/validation/validators.js
├── lib/errors/errorLogger.js
└── lib/generators/dataGenerators.js

tokenManager.js
└── (no dependencies - uses k6 http)

csvManager.js
├── k6/data (SharedArray)
└── papaparse (external)

correlationManager.js
└── k6/execution (for abort)

validators.js
├── k6 (check)
└── k6/metrics (Counter, Rate)

errorLogger.js
└── k6/data (for SharedArray)

dataGenerators.js
└── (no dependencies)
```

## 🔧 How to Use Individual Modules

### Standalone Token Manager

```javascript
import { initTokenManager, getToken } from './lib/auth/tokenManager.js';

export function setup() {
    return initTokenManager({
        url: 'https://api.example.com/auth',
        username: 'user',
        password: 'pass',
        expirySeconds: 600
    });
}

export default function(data) {
    const token = getToken(data);
    // Use token in your requests
}
```

### Standalone CSV Manager

```javascript
import { loadCSVData, getUniqueData } from './lib/data/csvManager.js';

const users = loadCSVData('users', './data/users.csv');

export default function() {
    const user = getUniqueData(users, __VU, __ITER);
    // Use user data
}
```

### Standalone Correlation

```javascript
import { 
    extractAndStore, 
    getCorrelatedValue, 
    validateCorrelations 
} from './lib/correlation/correlationManager.js';

export default function() {
    // After API call
    const userId = extractAndStore(response, 'id', 'userId');
    
    // Before dependent call
    if (validateCorrelations(['userId'])) {
        const id = getCorrelatedValue('userId');
        // Use id in next call
    }
}
```

### Standalone Validation

```javascript
import { validateResponse } from './lib/validation/validators.js';

export default function() {
    const res = http.post(url, payload);
    
    const valid = validateResponse(res, {
        apiName: 'My_API',
        expectedStatus: 201,
        jsonSchema: { id: 'string' }
    });
}
```

### Standalone Error Logger

```javascript
import { logError } from './lib/errors/errorLogger.js';

export default function() {
    const res = http.post(url, payload);
    
    if (res.status !== 200) {
        logError('My_API', res, payload, 'Call failed');
    }
}
```

### Standalone Data Generator

```javascript
import { 
    generateEmail, 
    generateUserPayload 
} from './lib/generators/dataGenerators.js';

export default function() {
    const email = generateEmail();
    const payload = generateUserPayload({ email });
    // Use in API call
}
```

## 📥 Download Individual Components

All modules are designed to be independently reusable. You can:

1. **Download entire framework** - Use the ZIP package
2. **Download individual modules** - Copy specific files from `lib/`
3. **Download specific scripts** - Copy from `tests/`
4. **Mix and match** - Use only the modules you need

## 🎯 File Size Reference

Approximate file sizes:

| Component | Size | Lines of Code |
|-----------|------|---------------|
| tokenManager.js | ~6 KB | ~200 lines |
| csvManager.js | ~8 KB | ~250 lines |
| correlationManager.js | ~10 KB | ~300 lines |
| validators.js | ~7 KB | ~220 lines |
| errorLogger.js | ~6 KB | ~200 lines |
| dataGenerators.js | ~9 KB | ~280 lines |
| script1-full-crud.js | ~10 KB | ~300 lines |
| script2-high-tps.js | ~5 KB | ~150 lines |
| script3-single-api.js | ~4 KB | ~120 lines |
| **Total Framework** | **~70 KB** | **~2000 lines** |

## 🔄 Version Compatibility

- **k6 Version**: v0.45.0 or higher
- **Node.js**: Not required (pure k6)
- **External Dependencies**: papaparse (loaded from CDN)

## 📝 License & Usage

- All modules are production-ready
- No external dependencies except papaparse
- Can be used individually or together
- Customize freely for your needs
