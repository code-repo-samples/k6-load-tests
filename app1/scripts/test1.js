import http from 'k6/http';
import { sleep, check } from 'k6';

// k6 options define the test configuration
export let options = {
    vus: 5,          // Number of Virtual Users (simulated concurrent users)
    duration: '10s', // Total test duration
};

// Default function is executed by each virtual user
export default function () {
    // Example GET request to a dummy URL
    let getResponse = http.get('https://jsonplaceholder.typicode.com/posts/1');

    // Check the response status for success
    check(getResponse, {
        'GET request status is 200': (r) => r.status === 200,
    });

    // Example POST request to a dummy URL
    let payload = JSON.stringify({
        title: 'foo',
        body: 'bar',
        userId: 1,
    });

    let params = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    let postResponse = http.post('https://jsonplaceholder.typicode.com/posts', payload, params);

    // Validate POST response
    check(postResponse, {
        'POST request status is 201': (r) => r.status === 201,
    });

    // Simulate user think time
    sleep(1); // Wait for 1 second before next iteration
}
