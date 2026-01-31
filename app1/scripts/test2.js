import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// k6 options
export let options = {
    vus: Number(__ENV.K6_VUS) || 5,        // Number of virtual users
    duration: __ENV.K6_DURATION || '10s',  // Test duration
};

// Read environment variables passed from GitHub Actions
const APP_FOLDER = __ENV.APP_FOLDER || 'app1';
const SCRIPT_NAME = __ENV.SCRIPT_NAME || 'test1.js';
const RUN_ID = __ENV.RUN_ID || 'local-run';
const AUTH_HEADER = __ENV.AUTH_HEADER || 'NoAuthHeaderProvided'; // From GitHub secrets

// Print the environment variables to console
console.log(`App Folder: ${APP_FOLDER}`);
console.log(`Run ID: ${RUN_ID}`);
console.log(`Auth Header: ${AUTH_HEADER}`);

// Default function executed by each virtual user
export default function () {
    // Example GET request using the AUTH_HEADER
    let params = {
        headers: {
            'Authorization': `Bearer ${AUTH_HEADER}`,
            'Content-Type': 'application/json',
        },
    };

    let res = http.get('https://jsonplaceholder.typicode.com/posts/1', params);

    // Check the response status
    check(res, {
        'GET status is 200': (r) => r.status === 200,
    });

    console.log(`Script Name: ${SCRIPT_NAME}`);

    // Dummy POST request
    let payload = JSON.stringify({
        title: 'foo',
        body: 'bar',
        userId: 1,
    });

    let postRes = http.post('https://jsonplaceholder.typicode.com/posts', payload, params);

    check(postRes, {
        'POST status is 201': (r) => r.status === 201,
    });

    // Simulate user think time
    sleep(1);
}

// Generate HTML summary report
export function handleSummary(data) {
    return {
        'summary.html': textSummary(data, { indent: '  ', enableColors: true }),
    };
}
