/**
 * Enterprise Validation & Checks
 * 
 * Features:
 * - Standardized response validation
 * - Tagged checks for per-API metrics
 * - Business error rate tracking
 * - Fail-fast validation
 * 
 * Usage:
 * import { validateResponse, validateStatusCode } from './lib/validation/validators.js';
 */

import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// Custom metrics for business errors
export const businessErrors = new Counter('business_errors');
export const businessErrorRate = new Rate('business_error_rate');

/**
 * Validate HTTP response with comprehensive checks
 * 
 * @param {object} response - HTTP response
 * @param {object} config - Validation configuration
 *   - apiName: API name for tagging (required)
 *   - expectedStatus: Expected status code (default: 200)
 *   - expectedStatuses: Array of acceptable status codes (alternative to expectedStatus)
 *   - checkBody: Validate response body (default: false)
 *   - bodyContains: String/array that body should contain
 *   - bodyNotContains: String/array that body should not contain
 *   - jsonSchema: Expected JSON structure (object with field names)
 *   - customChecks: Additional custom check functions
 *   - failFast: Return false immediately on first failure (default: true)
 * 
 * @returns {boolean} - True if all validations pass
 * 
 * Example:
 * const valid = validateResponse(res, {
 *   apiName: 'Create_User',
 *   expectedStatus: 201,
 *   bodyContains: 'user_id',
 *   jsonSchema: { id: 'number', email: 'string' }
 * });
 */
export function validateResponse(response, config) {
    const {
        apiName,
        expectedStatus = 200,
        expectedStatuses = null,
        checkBody = false,
        bodyContains = null,
        bodyNotContains = null,
        jsonSchema = null,
        customChecks = null,
        failFast = true
    } = config;
    
    if (!apiName) {
        console.error('[VALIDATION] API name is required for validation');
        return false;
    }
    
    const checks = {};
    const tags = { api: apiName };
    
    // Status code validation
    if (expectedStatuses) {
        checks[`${apiName}: status in [${expectedStatuses.join(',')}]`] = (r) => 
            expectedStatuses.includes(r.status);
    } else {
        checks[`${apiName}: status ${expectedStatus}`] = (r) => r.status === expectedStatus;
    }
    
    // Response time check (optional, logged but not failed)
    checks[`${apiName}: response time < 5s`] = (r) => r.timings.duration < 5000;
    
    // Body existence check
    if (checkBody || bodyContains || jsonSchema) {
        checks[`${apiName}: has response body`] = (r) => r.body && r.body.length > 0;
    }
    
    // Body contains validation
    if (bodyContains) {
        const contains = Array.isArray(bodyContains) ? bodyContains : [bodyContains];
        contains.forEach(text => {
            checks[`${apiName}: body contains '${text}'`] = (r) => r.body && r.body.includes(text);
        });
    }
    
    // Body not contains validation
    if (bodyNotContains) {
        const notContains = Array.isArray(bodyNotContains) ? bodyNotContains : [bodyNotContains];
        notContains.forEach(text => {
            checks[`${apiName}: body does not contain '${text}'`] = (r) => 
                !r.body || !r.body.includes(text);
        });
    }
    
    // JSON schema validation
    if (jsonSchema) {
        checks[`${apiName}: valid JSON response`] = (r) => {
            try {
                r.json();
                return true;
            } catch (e) {
                return false;
            }
        };
        
        for (const [field, expectedType] of Object.entries(jsonSchema)) {
            checks[`${apiName}: has field '${field}'`] = (r) => {
                try {
                    const json = r.json();
                    return field in json;
                } catch (e) {
                    return false;
                }
            };
            
            if (expectedType) {
                checks[`${apiName}: '${field}' is ${expectedType}`] = (r) => {
                    try {
                        const json = r.json();
                        const value = json[field];
                        const actualType = Array.isArray(value) ? 'array' : typeof value;
                        return actualType === expectedType;
                    } catch (e) {
                        return false;
                    }
                };
            }
        }
    }
    
    // Custom checks
    if (customChecks) {
        for (const [checkName, checkFunc] of Object.entries(customChecks)) {
            checks[`${apiName}: ${checkName}`] = checkFunc;
        }
    }
    
    // Execute checks
    const result = check(response, checks, tags);
    
    // Track business errors (non-2xx responses)
    if (response.status < 200 || response.status >= 300) {
        businessErrors.add(1);
        businessErrorRate.add(1);
    } else {
        businessErrorRate.add(0);
    }
    
    return result;
}

/**
 * Simple status code validation
 * 
 * @param {object} response - HTTP response
 * @param {number} expectedStatus - Expected status code
 * @param {string} apiName - API name for tagging
 * @returns {boolean} - True if status matches
 */
export function validateStatusCode(response, expectedStatus, apiName) {
    return check(response, {
        [`${apiName}: status ${expectedStatus}`]: (r) => r.status === expectedStatus
    }, { api: apiName });
}

/**
 * Validate status is in acceptable range
 * 
 * @param {object} response - HTTP response
 * @param {array} acceptableStatuses - Array of acceptable status codes
 * @param {string} apiName - API name
 * @returns {boolean} - True if status is acceptable
 */
export function validateStatusIn(response, acceptableStatuses, apiName) {
    const result = check(response, {
        [`${apiName}: status in [${acceptableStatuses.join(',')}]`]: (r) => 
            acceptableStatuses.includes(r.status)
    }, { api: apiName });
    
    // Track business error
    if (!acceptableStatuses.includes(response.status)) {
        businessErrors.add(1);
        businessErrorRate.add(1);
    } else {
        businessErrorRate.add(0);
    }
    
    return result;
}

/**
 * Validate JSON response structure
 * 
 * @param {object} response - HTTP response
 * @param {array} requiredFields - Required field names
 * @param {string} apiName - API name
 * @returns {boolean} - True if all fields present
 */
export function validateJsonFields(response, requiredFields, apiName) {
    const checks = {};
    
    for (const field of requiredFields) {
        checks[`${apiName}: has field '${field}'`] = (r) => {
            try {
                const json = r.json();
                return field in json && json[field] !== null && json[field] !== undefined;
            } catch (e) {
                return false;
            }
        };
    }
    
    return check(response, checks, { api: apiName });
}

/**
 * Validate response time
 * 
 * @param {object} response - HTTP response
 * @param {number} maxDuration - Maximum acceptable duration in ms
 * @param {string} apiName - API name
 * @returns {boolean} - True if within duration
 */
export function validateResponseTime(response, maxDuration, apiName) {
    return check(response, {
        [`${apiName}: response time < ${maxDuration}ms`]: (r) => r.timings.duration < maxDuration
    }, { api: apiName });
}

/**
 * Batch validation for multiple conditions
 * 
 * @param {object} response - HTTP response
 * @param {string} apiName - API name
 * @param {array} validations - Array of validation configs
 * @returns {boolean} - True if all pass
 * 
 * Example:
 * batchValidate(res, 'Create_User', [
 *   { type: 'status', value: 201 },
 *   { type: 'field', value: 'id' },
 *   { type: 'responseTime', value: 1000 }
 * ]);
 */
export function batchValidate(response, apiName, validations) {
    let allPassed = true;
    
    for (const validation of validations) {
        let passed = false;
        
        switch (validation.type) {
            case 'status':
                passed = validateStatusCode(response, validation.value, apiName);
                break;
            case 'field':
                passed = validateJsonFields(response, [validation.value], apiName);
                break;
            case 'responseTime':
                passed = validateResponseTime(response, validation.value, apiName);
                break;
        }
        
        if (!passed) {
            allPassed = false;
        }
    }
    
    return allPassed;
}
