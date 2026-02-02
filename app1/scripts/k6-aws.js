// import http from 'k6/http';
// import { check, sleep } from 'k6';
// import { Rate, Trend, Counter } from 'k6/metrics';
// import { AWSConfig, Endpoint, SignatureV4 } from 'https://jslib.k6.io/aws/0.14.0/signature.js';
// import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// // ============================================================================
// // 1. CONFIGURATION & INFRASTRUCTURE
// // ============================================================================

// const AWS_REGION = __ENV.AWS_REGION || 'us-east-1';
// const AWS_ACCESS_KEY_ID = __ENV.AWS_ACCESS_KEY_ID || 'AKIA6KA6AYE4WCMP6QFC';
// const AWS_SECRET_ACCESS_KEY = __ENV.AWS_SECRET_ACCESS_KEY || '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';
// const API_ID = __ENV.API_GATEWAY_ID || 'k23uikgs56';
// const API_KEY = __ENV.API_KEY || '2Pj3pgtPjz2Acs1QdqVw43AWXn8KSEfd9tLHxe1T';
// const STAGE = __ENV.STAGE || 'prod';

// const awsConfig = new AWSConfig({
//     region: AWS_REGION,
//     accessKeyId: AWS_ACCESS_KEY_ID,
//     secretAccessKey: AWS_SECRET_ACCESS_KEY,
// });

// const API_ENDPOINT = new Endpoint(`https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com`);

// // ============================================================================
// // 2. CUSTOM METRICS
// // ============================================================================

// const errorRate = new Rate('error_rate');
// const getRequestDuration = new Trend('get_request_duration');
// const postRequestDuration = new Trend('post_request_duration');
// const requestCounter = new Counter('total_requests');
// const successCounter = new Counter('successful_requests');

// // ============================================================================
// // 3. TEST OPTIONS (LOAD PROFILE)
// // ============================================================================

// // export const options = {
// //     scenarios: {
// //         api_load_test: {
// //             executor: 'constant-arrival-rate',
// //             // Our target TPS
// //             rate: 5, 
// //             timeUnit: '1s', 
// //             // Total duration of the test
// //             duration: '10m',
// //             // How many VUs to pre-allocate
// //             preAllocatedVUs: 10,
// //             // Maximum VUs allowed to scale to if 10 isn't enough to sustain 10 TPS
// //             maxVUs: 50, 
// //         },
// //     },
// //     thresholds: {
// //         'http_req_duration': ['p(95)<500', 'p(99)<1000'],
// //         'http_req_failed': ['rate<0.05'],
// //         'error_rate': ['rate<0.05'],
// //         'get_request_duration': ['p(95)<450'],
// //         'post_request_duration': ['p(95)<450'],
// //     },
// //     tags: {
// //         testType: 'load_test',
// //         api: 'rest-api-sigv4-v14',
// //     },
// // };

// export const options = {
//     scenarios: {
//         api_load_test: {
//             executor: 'ramping-arrival-rate',
//             startRate: 0,
//             timeUnit: '1s',
//             preAllocatedVUs: 20, // Initial pool of VUs
//             maxVUs: 100,        // Max pool if 7 TPS gets slow
//             stages: [
//                 { duration: '3m',  target: 5 },  // Ramp up to 5 TPS in 3m
//                 { duration: '10m', target: 5 },  // Stay at 5 TPS for 10m
//                 { duration: '2m',  target: 7 },  // Ramp up to 7 TPS in 2m
//                 { duration: '5m',  target: 7 },  // Stay at 7 TPS for 5m
//                 { duration: '2m',  target: 0 },  // Ramp down to 0 in 2m
//             ],
//         },
//     },
//     thresholds: {
//         'http_req_duration': ['p(95)<500', 'p(99)<1000'],
//         'http_req_failed': ['rate<0.05'],
//         'error_rate': ['rate<0.05'],
//         'get_request_duration': ['p(95)<450'],
//         'post_request_duration': ['p(95)<450'],
//     },
//     tags: {
//         testType: 'load_test',
//         api: 'rest-api-sigv4-v14',
//     },
// };

// // ============================================================================
// // 4. SIGNING LOGIC
// // ============================================================================

// function signAndSend(method, path, query = {}, body = null) {
//     const signer = new SignatureV4({
//         service: 'execute-api',
//         region: awsConfig.region,
//         credentials: {
//             accessKeyId: awsConfig.accessKeyId,
//             secretAccessKey: awsConfig.secretAccessKey,
//         },
//         uriEscapePath: false,
//         applyChecksum: true,
//     });

//     const signedRequest = signer.sign({
//         method: method,
//         endpoint: API_ENDPOINT,
//         path: path,
//         query: query,
//         headers: {
//             'x-api-key': API_KEY,
//             'Content-Type': 'application/json',
//         },
//         body: body ? JSON.stringify(body) : null,
//     });

//     const params = {
//         headers: signedRequest.headers,
//         tags: { name: `${method} ${path}` },
//     };

//     return method === 'GET' 
//         ? http.get(signedRequest.url, params) 
//         : http.post(signedRequest.url, JSON.stringify(body), params);
// }

// // ============================================================================
// // 5. DATA GENERATORS
// // ============================================================================

// function getMockItem() {
//     return {
//         type: 'data',
//         name: `LoadTest-${Date.now()}`,
//         owner: 'k6-service',
//         metadata: { version: '1.0', timestamp: new Date().toISOString() }
//     };
// }

// // ============================================================================
// // 6. MAIN VIRTUAL USER LOOP
// // ============================================================================

// export default function () {
//     let response;
//     const isGet = Math.random() < 0.7; // 70% GET, 30% POST

//     if (isGet) {
//         // GET Request
//         const query = {
//             page: (Math.floor(Math.random() * 10) + 1).toString(),
//             limit: '20',
//             category: 'tech'
//         };
//         response = signAndSend('GET', `/${STAGE}/items`, query);
//         getRequestDuration.add(response.timings.duration);
//     } else {
//         // POST Request
//         const payload = getMockItem();
//         response = signAndSend('POST', `/${STAGE}/items`, {}, payload);
//         postRequestDuration.add(response.timings.duration);
//     }

//     // Metrics & Checks
//     requestCounter.add(1);
//     const isOk = check(response, {
//         'is status 200': (r) => r.status === 200,
//         'has valid JSON': (r) => {
//             try { JSON.parse(r.body); return true; } catch (e) { return false; }
//         },
//     });

//     if (isOk) {
//         successCounter.add(1);
//         errorRate.add(0);
//     } else {
//         errorRate.add(1);
//         console.error(`Request failed: ${response.status} - ${response.body}`);
//     }

//     sleep(Math.random() * 2 + 1); // Simulated think time
// }

// // ============================================================================
// // 7. SUMMARY & LIFECYCLE
// // ============================================================================

// export function setup() {
//     console.log(`--- Starting Load Test: ${API_ENDPOINT.protocol}//${API_ENDPOINT.hostname} ---`);
// }

// export function handleSummary(data) {
//     return {
//         'stdout': textSummary(data, { indent: ' ', enableColors: true }),
//         'summary.json': JSON.stringify(data),
//     };
// }


import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { AWSConfig, SignatureV4, Endpoint } from 'https://jslib.k6.io/aws/0.14.0/signature.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
import exec from 'k6/execution';

// ============================================================================
// 1. CONFIGURATION
// ============================================================================
const AWS_REGION = __ENV.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = __ENV.AWS_ACCESS_KEY_ID || 'AKIA6KA6AYE4WCMP6QFC';
const AWS_SECRET_ACCESS_KEY = __ENV.AWS_SECRET_ACCESS_KEY || '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';
const API_ID = __ENV.API_GATEWAY_ID || 'k23uikgs56';
const API_KEY = __ENV.API_KEY || '2Pj3pgtPjz2Acs1QdqVw43AWXn8KSEfd9tLHxe1T';
const STAGE = __ENV.STAGE || 'prod';

const awsConfig = new AWSConfig({
    region: AWS_REGION,
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
});

const API_ENDPOINT = new Endpoint(`https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com`);

// ============================================================================
// 2. CUSTOM METRICS (For Trend Analysis)
// ============================================================================
const errorRate = new Rate('error_rate');
const getDuration = new Trend('get_duration');
const postDuration = new Trend('post_duration');

// ============================================================================
// 3. TEST OPTIONS
// ============================================================================
export const options = {
    scenarios: {
        api_load_test: {
            executor: 'ramping-arrival-rate',
            startRate: 0,
            timeUnit: '1s',
            preAllocatedVUs: 50, 
            maxVUs: 200,        
            stages: [
                { duration: '2m',  target: 2 },
                { duration: '5m', target: 4 },
                { duration: '1m',  target: 7 },
                { duration: '5m',  target: 7 },
                { duration: '2m',  target: 0 },
            ],
        },
    },
    thresholds: {
        'http_req_duration{name:GET /items}': ['p(95)<500'],
        'http_req_duration{name:POST /items}': ['p(95)<500'],
        'error_rate': ['rate<0.05'],
    },
};

// ============================================================================
// 4. SIGNING & SENDING LOGIC
// ============================================================================
function signAndSend(method, path, query = {}, body = null) {
    const signer = new SignatureV4({
        service: 'execute-api',
        region: awsConfig.region,
        credentials: {
            accessKeyId: awsConfig.accessKeyId,
            secretAccessKey: awsConfig.secretAccessKey,
        },
        uriEscapePath: false,
        applyChecksum: true,
    });

    const signedRequest = signer.sign({
        method: method,
        endpoint: API_ENDPOINT,
        path: path,
        query: query,
        headers: {
            'x-api-key': API_KEY,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : null,
    });

    // The 'name' tag here is what creates the URL-wise details in the summary
    const params = {
        headers: signedRequest.headers,
        tags: { name: `${method} /items` }, 
    };

    return method === 'GET' 
        ? http.get(signedRequest.url, params) 
        : http.post(signedRequest.url, JSON.stringify(body), params);
}

// ============================================================================
// 5. MAIN VIRTUAL USER LOOP
// ============================================================================
export default function () {
    // 1. GET REQUEST
    const getQuery = {
        page: (Math.floor(Math.random() * 10) + 1).toString(),
        limit: '20',
        category: 'tech'
    };
    const getRes = signAndSend('GET', `/${STAGE}/items`, getQuery);
    getDuration.add(getRes.timings.duration);

    const getOk = check(getRes, { 'GET status 200': (r) => r.status === 200 });
    if (!getOk) {
        console.error(`[FAIL] GET | Status: ${getRes.status} | Body: ${getRes.body}`);
        errorRate.add(1);
    } else {
        errorRate.add(0);
    }

    // 2. POST REQUEST
    const postPayload = {
        type: 'data',
        name: `LoadTest-${Date.now()}`,
        metadata: { timestamp: new Date().toISOString() }
    };
    const postRes = signAndSend('POST', `/${STAGE}/items`, {}, postPayload);
    postDuration.add(postRes.timings.duration);

    const postOk = check(postRes, { 'POST status 200': (r) => r.status === 200 });
    if (!postOk) {
        console.error(`[FAIL] POST | Status: ${postRes.status} | Body: ${postRes.body}`);
        errorRate.add(1);
    } else {
        errorRate.add(0);
    }
}

// ============================================================================
// 6. SUMMARY
// ============================================================================
export function handleSummary(data) {
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    };
}