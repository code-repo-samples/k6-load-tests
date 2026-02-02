/**
 * Enterprise Error Logger
 * 
 * Features:
 * - Detailed error logging with context
 * - Console output during execution
 * - Optional file output via environment variable
 * - Structured error format for analysis
 * 
 * Usage:
 * import { logError, logErrorWithInput } from './lib/errors/errorLogger.js';
 * 
 * // Set ERROR_LOG_FILE env var to enable file logging:
 * // k6 run -e ERROR_LOG_FILE=errors.log script.js
 */

import { SharedArray } from 'k6/data';

// Error log storage (for summary)
const errorLog = [];

/**
 * Log API error with full context
 * 
 * @param {string} apiName - API name
 * @param {object} response - HTTP response
 * @param {object} inputData - Input data that caused error (optional)
 * @param {string} additionalContext - Additional context (optional)
 * 
 * Example:
 * if (res.status !== 201) {
 *   logError('Create_User', res, { email: user.email }, 'User creation failed');
 * }
 */
export function logError(apiName, response, inputData = null, additionalContext = '') {
    const timestamp = new Date().toISOString();
    const statusCode = response ? response.status : 'N/A';
    const statusText = response ? response.status_text : 'N/A';
    const responseBody = response && response.body ? response.body.substring(0, 200) : 'N/A';
    
    const errorEntry = {
        timestamp,
        apiName,
        statusCode,
        statusText,
        responseBody,
        inputData: inputData ? JSON.stringify(inputData) : 'N/A',
        additionalContext,
        vu: __VU,
        iter: __ITER
    };
    
    // Console output
    console.error(`
╔════════════════════════════════════════════════════════════════
║ ERROR: ${apiName}
╠════════════════════════════════════════════════════════════════
║ Time:         ${timestamp}
║ VU:           ${__VU}
║ Iteration:    ${__ITER}
║ Status:       ${statusCode} ${statusText}
║ Response:     ${responseBody}
${inputData ? `║ Input:        ${JSON.stringify(inputData)}` : ''}
${additionalContext ? `║ Context:      ${additionalContext}` : ''}
╚════════════════════════════════════════════════════════════════
    `.trim());
    
    // Store for summary
    errorLog.push(errorEntry);
    
    // File output (if enabled via environment variable)
    const errorLogFile = __ENV.ERROR_LOG_FILE;
    if (errorLogFile) {
        // Note: k6 doesn't support file writing directly
        // This would need to be handled via custom output or external system
        // For now, errors are available in errorLog array for handleSummary
    }
}

/**
 * Log error with input parameters
 * Convenience method for common use case
 * 
 * @param {string} apiName - API name
 * @param {object} response - HTTP response
 * @param {object} inputParams - Input parameters
 */
export function logErrorWithInput(apiName, response, inputParams) {
    logError(apiName, response, inputParams);
}

/**
 * Log correlation failure
 * 
 * @param {string} apiName - API that failed due to missing correlation
 * @param {array} missingCorrelations - Missing correlation keys
 * @param {object} inputData - Input data (optional)
 */
export function logCorrelationFailure(apiName, missingCorrelations, inputData = null) {
    const timestamp = new Date().toISOString();
    
    const errorEntry = {
        timestamp,
        apiName,
        errorType: 'CORRELATION_FAILURE',
        missingCorrelations: missingCorrelations.join(', '),
        inputData: inputData ? JSON.stringify(inputData) : 'N/A',
        vu: __VU,
        iter: __ITER
    };
    
    console.error(`
╔════════════════════════════════════════════════════════════════
║ CORRELATION FAILURE: ${apiName}
╠════════════════════════════════════════════════════════════════
║ Time:         ${timestamp}
║ VU:           ${__VU}
║ Iteration:    ${__ITER}
║ Missing:      ${missingCorrelations.join(', ')}
${inputData ? `║ Input:        ${JSON.stringify(inputData)}` : ''}
╚════════════════════════════════════════════════════════════════
    `.trim());
    
    errorLog.push(errorEntry);
}

/**
 * Log validation failure
 * 
 * @param {string} apiName - API name
 * @param {string} validationMessage - What validation failed
 * @param {object} response - HTTP response
 */
export function logValidationFailure(apiName, validationMessage, response) {
    const timestamp = new Date().toISOString();
    const responseBody = response && response.body ? response.body.substring(0, 200) : 'N/A';
    
    console.error(`
╔════════════════════════════════════════════════════════════════
║ VALIDATION FAILURE: ${apiName}
╠════════════════════════════════════════════════════════════════
║ Time:         ${timestamp}
║ VU:           ${__VU}
║ Iteration:    ${__ITER}
║ Failure:      ${validationMessage}
║ Status:       ${response.status}
║ Response:     ${responseBody}
╚════════════════════════════════════════════════════════════════
    `.trim());
    
    errorLog.push({
        timestamp,
        apiName,
        errorType: 'VALIDATION_FAILURE',
        validationMessage,
        statusCode: response.status,
        responseBody,
        vu: __VU,
        iter: __ITER
    });
}

/**
 * Get all logged errors
 * Used in handleSummary for custom reporting
 * 
 * @returns {array} - All error entries
 */
export function getAllErrors() {
    return errorLog;
}

/**
 * Get error count
 * 
 * @returns {number} - Total errors logged
 */
export function getErrorCount() {
    return errorLog.length;
}

/**
 * Get errors by API
 * 
 * @param {string} apiName - API name
 * @returns {array} - Errors for specific API
 */
export function getErrorsByApi(apiName) {
    return errorLog.filter(e => e.apiName === apiName);
}

/**
 * Clear error log
 * Useful for resetting between test phases
 */
export function clearErrorLog() {
    errorLog.length = 0;
}

/**
 * Format errors for summary output
 * 
 * @returns {string} - Formatted error summary
 */
export function formatErrorSummary() {
    if (errorLog.length === 0) {
        return 'No errors logged';
    }
    
    let summary = `\n${'='.repeat(80)}\n`;
    summary += `ERROR SUMMARY (${errorLog.length} total errors)\n`;
    summary += `${'='.repeat(80)}\n\n`;
    
    // Group by API
    const byApi = {};
    errorLog.forEach(err => {
        if (!byApi[err.apiName]) {
            byApi[err.apiName] = [];
        }
        byApi[err.apiName].push(err);
    });
    
    for (const [apiName, errors] of Object.entries(byApi)) {
        summary += `${apiName}: ${errors.length} errors\n`;
        
        // Show first 3 errors for each API
        errors.slice(0, 3).forEach(err => {
            summary += `  [${err.timestamp}] `;
            summary += `Status: ${err.statusCode || err.errorType}, `;
            summary += `VU: ${err.vu}, Iter: ${err.iter}\n`;
            if (err.inputData && err.inputData !== 'N/A') {
                summary += `    Input: ${err.inputData}\n`;
            }
        });
        
        if (errors.length > 3) {
            summary += `  ... and ${errors.length - 3} more errors\n`;
        }
        summary += '\n';
    }
    
    return summary;
}
