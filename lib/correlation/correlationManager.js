/**
 * Enterprise Correlation Manager
 * 
 * Features:
 * - Extract and store correlated values (IDs, tokens, etc.)
 * - Validate correlation exists before dependent calls
 * - Fail fast on missing correlations
 * - Detailed logging of correlation failures
 * 
 * Usage:
 * import { extractAndStore, getCorrelatedValue, validateCorrelations } from './lib/correlation/correlationManager.js';
 * 
 * // After Create API
 * const objectId = extractAndStore(createRes, 'id', 'objectId');
 * 
 * // Before Update API
 * if (!validateCorrelations(['objectId'])) {
 *   console.error('Missing required correlation');
 *   return;
 * }
 */

import exec from 'k6/execution';

// VU-level correlation storage (per iteration)
let correlationStore = {};

/**
 * Extract value from JSON response and store for correlation
 * 
 * @param {object} response - HTTP response object
 * @param {string} jsonPath - Path to value in JSON (dot notation)
 * @param {string} correlationKey - Key to store value under
 * @param {object} options - Options
 *   - required: Throw error if value not found (default: true)
 *   - defaultValue: Default value if not found (default: null)
 *   - logExtraction: Log extraction (default: true)
 * 
 * @returns {any} - Extracted value
 * 
 * Example:
 * const userId = extractAndStore(res, 'data.user.id', 'userId');
 * const email = extractAndStore(res, 'user.email', 'userEmail', { required: false });
 */
export function extractAndStore(response, jsonPath, correlationKey, options = {}) {
    const {
        required = true,
        defaultValue = null,
        logExtraction = true
    } = options;
    
    // Extract value from response
    const value = extractJsonValue(response, jsonPath, defaultValue);
    
    if (value === null || value === undefined) {
        const errorMsg = `[CORRELATION] Failed to extract '${correlationKey}' from path '${jsonPath}'`;
        
        if (required) {
            console.error(errorMsg);
            console.error(`[CORRELATION] Response status: ${response.status}`);
            console.error(`[CORRELATION] Response body: ${response.body.substring(0, 200)}`);
        } else if (logExtraction) {
            console.warn(errorMsg + ' (optional)');
        }
        
        if (required) {
            return null;
        }
    }
    
    // Store correlation
    correlationStore[correlationKey] = {
        value: value,
        extractedAt: Date.now(),
        source: jsonPath
    };
    
    if (logExtraction) {
        console.log(`[CORRELATION] ✓ Stored '${correlationKey}' = ${value}`);
    }
    
    return value;
}

/**
 * Extract value from JSON using dot notation
 * 
 * @param {object} response - HTTP response
 * @param {string} path - Dot notation path (e.g., 'data.user.id')
 * @param {any} defaultValue - Default if not found
 * @returns {any} - Extracted value
 */
function extractJsonValue(response, path, defaultValue = null) {
    if (!response || !response.json) {
        return defaultValue;
    }
    
    try {
        const jsonData = typeof response.json === 'function' ? response.json() : response.json;
        
        if (!path) {
            return jsonData;
        }
        
        const pathParts = path.split('.');
        let value = jsonData;
        
        for (const part of pathParts) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            
            // Handle array index notation like 'items[0]'
            const arrayMatch = part.match(/(\w+)\[(\d+)\]/);
            if (arrayMatch) {
                const arrayName = arrayMatch[1];
                const index = parseInt(arrayMatch[2]);
                value = value[arrayName];
                if (Array.isArray(value) && index < value.length) {
                    value = value[index];
                } else {
                    return defaultValue;
                }
            } else {
                value = value[part];
            }
        }
        
        return value !== undefined ? value : defaultValue;
        
    } catch (error) {
        console.error(`[CORRELATION] Error extracting '${path}': ${error.message}`);
        return defaultValue;
    }
}

/**
 * Get correlated value
 * 
 * @param {string} correlationKey - Correlation key
 * @param {any} defaultValue - Default value if not found
 * @returns {any} - Correlated value
 * 
 * Example:
 * const userId = getCorrelatedValue('userId');
 */
export function getCorrelatedValue(correlationKey, defaultValue = null) {
    const stored = correlationStore[correlationKey];
    
    if (!stored) {
        return defaultValue;
    }
    
    return stored.value;
}

/**
 * Validate that required correlations exist
 * 
 * @param {array} requiredKeys - Array of required correlation keys
 * @param {object} options - Options
 *   - abortOnMissing: Abort iteration if missing (default: false)
 *   - logMissing: Log missing correlations (default: true)
 * 
 * @returns {boolean} - True if all correlations exist
 * 
 * Example:
 * if (!validateCorrelations(['userId', 'orderId'])) {
 *   return; // Skip rest of iteration
 * }
 */
export function validateCorrelations(requiredKeys, options = {}) {
    const {
        abortOnMissing = false,
        logMissing = true
    } = options;
    
    const missing = [];
    
    for (const key of requiredKeys) {
        if (!hasCorrelation(key)) {
            missing.push(key);
        }
    }
    
    if (missing.length > 0) {
        if (logMissing) {
            console.error(`[CORRELATION] ✗ Missing required correlations: ${missing.join(', ')}`);
            console.error(`[CORRELATION] Available correlations: ${Object.keys(correlationStore).join(', ') || 'none'}`);
        }
        
        if (abortOnMissing) {
            exec.test.abort(`Missing required correlations: ${missing.join(', ')}`);
        }
        
        return false;
    }
    
    return true;
}

/**
 * Check if correlation exists
 * 
 * @param {string} correlationKey - Correlation key
 * @returns {boolean} - True if exists
 */
export function hasCorrelation(correlationKey) {
    return correlationKey in correlationStore && 
           correlationStore[correlationKey].value !== null && 
           correlationStore[correlationKey].value !== undefined;
}

/**
 * Store correlation directly (without extraction)
 * 
 * @param {string} key - Correlation key
 * @param {any} value - Value to store
 * 
 * Example:
 * storeCorrelation('customerId', customerId);
 */
export function storeCorrelation(key, value) {
    correlationStore[key] = {
        value: value,
        extractedAt: Date.now(),
        source: 'manual'
    };
}

/**
 * Clear all correlations (call at start of each iteration)
 * 
 * Example:
 * export default function() {
 *   clearCorrelations(); // Start fresh each iteration
 *   // ... rest of test
 * }
 */
export function clearCorrelations() {
    correlationStore = {};
}

/**
 * Clear specific correlation
 * 
 * @param {string} key - Correlation key to clear
 */
export function clearCorrelation(key) {
    delete correlationStore[key];
}

/**
 * Get all correlations (for debugging)
 * 
 * @returns {object} - All correlations
 */
export function getAllCorrelations() {
    const result = {};
    for (const [key, stored] of Object.entries(correlationStore)) {
        result[key] = stored.value;
    }
    return result;
}

/**
 * Extract multiple values at once
 * 
 * @param {object} response - HTTP response
 * @param {object} mappings - Object with { correlationKey: jsonPath }
 * @param {boolean} allRequired - All values required (default: true)
 * @returns {object} - Object with extracted values
 * 
 * Example:
 * const extracted = extractMultiple(res, {
 *   userId: 'user.id',
 *   email: 'user.email',
 *   name: 'user.name'
 * });
 */
export function extractMultiple(response, mappings, allRequired = true) {
    const result = {};
    let allSuccess = true;
    
    for (const [correlationKey, jsonPath] of Object.entries(mappings)) {
        const value = extractAndStore(response, jsonPath, correlationKey, {
            required: allRequired,
            logExtraction: false
        });
        
        result[correlationKey] = value;
        
        if (value === null || value === undefined) {
            allSuccess = false;
        }
    }
    
    if (!allSuccess && allRequired) {
        console.error('[CORRELATION] Failed to extract all required values');
    }
    
    return result;
}

/**
 * Build URL with correlated path parameters
 * 
 * @param {string} urlTemplate - URL template with {placeholders}
 * @param {object} correlationMapping - Map of {placeholder: correlationKey}
 * @returns {string|null} - Built URL or null if correlations missing
 * 
 * Example:
 * const url = buildCorrelatedUrl(
 *   '/api/users/{userId}/orders/{orderId}',
 *   { userId: 'userId', orderId: 'orderId' }
 * );
 */
export function buildCorrelatedUrl(urlTemplate, correlationMapping = null) {
    let url = urlTemplate;
    
    // If no mapping provided, try to auto-detect {placeholders}
    if (!correlationMapping) {
        const placeholders = urlTemplate.match(/\{([^}]+)\}/g);
        if (placeholders) {
            correlationMapping = {};
            placeholders.forEach(p => {
                const key = p.slice(1, -1); // Remove { }
                correlationMapping[key] = key;
            });
        }
    }
    
    if (!correlationMapping) {
        return url;
    }
    
    // Replace placeholders with correlated values
    for (const [placeholder, correlationKey] of Object.entries(correlationMapping)) {
        const value = getCorrelatedValue(correlationKey);
        
        if (value === null || value === undefined) {
            console.error(`[CORRELATION] Cannot build URL: missing correlation '${correlationKey}' for placeholder '{${placeholder}}'`);
            return null;
        }
        
        url = url.replace(`{${placeholder}}`, value);
    }
    
    return url;
}

/**
 * Get correlation statistics
 * 
 * @returns {object} - Correlation statistics
 */
export function getCorrelationStats() {
    const keys = Object.keys(correlationStore);
    return {
        totalCorrelations: keys.length,
        correlationKeys: keys,
        correlations: getAllCorrelations()
    };
}
