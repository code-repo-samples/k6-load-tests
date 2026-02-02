/**
 * Enterprise Token Manager
 * 
 * Features:
 * - Auto token generation and caching
 * - Automatic refresh before expiry (at 80% lifetime)
 * - Thread-safe token retrieval for high TPS
 * - Detailed logging of token generation vs reuse
 * 
 * Usage:
 * import { initTokenManager, getToken } from './lib/auth/tokenManager.js';
 * 
 * export function setup() {
 *   return initTokenManager({
 *     url: 'https://api.example.com/auth/token',
 *     username: 'admin',
 *     password: 'secret',
 *     expirySeconds: 600
 *   });
 * }
 * 
 * export default function(data) {
 *   const token = getToken(data);
 *   // Use token in requests
 * }
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

// Token cache with metadata
let tokenCache = {
    token: null,
    expiresAt: null,
    generatedAt: null,
    config: null
};

// Lock to prevent concurrent token refresh
let refreshLock = false;

/**
 * Initialize token manager and generate first token
 * Call this in setup() function
 * 
 * @param {object} config - Token configuration
 *   - url: Authentication endpoint URL
 *   - username: Username for authentication
 *   - password: Password for authentication
 *   - expirySeconds: Token lifetime in seconds (default: 600)
 *   - method: HTTP method (default: 'POST')
 *   - bodyTemplate: Custom request body (optional)
 *   - tokenPath: JSON path to token in response (default: 'access_token')
 *   - headers: Additional headers (optional)
 * 
 * @returns {object} - Token manager state (pass to default function via data)
 */
export function initTokenManager(config) {
    console.log('=== Token Manager Initialization ===');
    
    const {
        url,
        username,
        password,
        expirySeconds = 600,
        method = 'POST',
        bodyTemplate = null,
        tokenPath = 'access_token',
        headers = {}
    } = config;
    
    // Validate required fields
    if (!url) {
        throw new Error('Token URL is required');
    }
    if (!username || !password) {
        throw new Error('Username and password are required');
    }
    
    tokenCache.config = {
        url,
        username,
        password,
        expirySeconds,
        method,
        bodyTemplate,
        tokenPath,
        headers
    };
    
    // Generate initial token
    const token = generateToken();
    
    if (!token) {
        throw new Error('Failed to generate initial token');
    }
    
    console.log(`Initial token generated successfully (expires in ${expirySeconds}s)`);
    console.log('====================================\n');
    
    return {
        tokenManager: tokenCache,
        timestamp: Date.now()
    };
}

/**
 * Generate new authentication token
 * 
 * @returns {string|null} - Authentication token
 */
function generateToken() {
    const config = tokenCache.config;
    
    console.log(`[TOKEN] Generating new token from ${config.url}...`);
    
    // Prepare request body
    let body;
    if (config.bodyTemplate) {
        body = JSON.stringify(config.bodyTemplate);
    } else {
        body = JSON.stringify({
            username: config.username,
            password: config.password
        });
    }
    
    // Prepare headers
    const requestHeaders = {
        'Content-Type': 'application/json',
        ...config.headers
    };
    
    // Make token request
    const res = http.request(config.method, config.url, body, {
        headers: requestHeaders,
        timeout: '30s',
        tags: { name: 'auth_token_generation' }
    });
    
    // Validate response
    const success = check(res, {
        'token generation successful': (r) => r.status === 200 || r.status === 201,
        'token in response': (r) => {
            try {
                const json = r.json();
                const pathParts = config.tokenPath.split('.');
                let value = json;
                for (const part of pathParts) {
                    value = value[part];
                }
                return value !== undefined && value !== null;
            } catch (e) {
                return false;
            }
        }
    });
    
    if (!success) {
        console.error(`[TOKEN] Generation failed - Status: ${res.status}, Body: ${res.body.substring(0, 200)}`);
        return null;
    }
    
    // Extract token from response
    try {
        const json = res.json();
        const pathParts = config.tokenPath.split('.');
        let token = json;
        for (const part of pathParts) {
            token = token[part];
        }
        
        if (!token) {
            console.error('[TOKEN] Token not found in response');
            return null;
        }
        
        // Update cache
        const now = Date.now();
        tokenCache.token = token;
        tokenCache.generatedAt = now;
        tokenCache.expiresAt = now + (config.expirySeconds * 1000);
        
        console.log(`[TOKEN] ✓ New token generated (valid until ${new Date(tokenCache.expiresAt).toISOString()})`);
        
        return token;
        
    } catch (error) {
        console.error(`[TOKEN] Error parsing token response: ${error.message}`);
        return null;
    }
}

/**
 * Get authentication token (auto-refresh if needed)
 * 
 * @param {object} data - Data object from setup() containing tokenManager
 * @returns {string} - Valid authentication token
 * 
 * Usage:
 * const token = getToken(data);
 */
export function getToken(data) {
    // Restore cache from setup data on first call
    if (!tokenCache.config && data && data.tokenManager) {
        tokenCache = data.tokenManager;
    }
    
    if (!tokenCache.config) {
        throw new Error('Token manager not initialized. Call initTokenManager() in setup()');
    }
    
    const now = Date.now();
    
    // Check if token needs refresh (at 80% of lifetime)
    const refreshThreshold = tokenCache.generatedAt + (tokenCache.config.expirySeconds * 1000 * 0.8);
    
    if (now >= refreshThreshold) {
        // Token needs refresh
        if (!refreshLock) {
            refreshLock = true;
            
            console.log('[TOKEN] Token approaching expiry, refreshing...');
            const newToken = generateToken();
            
            refreshLock = false;
            
            if (newToken) {
                return newToken;
            } else {
                console.warn('[TOKEN] Refresh failed, using existing token');
                return tokenCache.token;
            }
        } else {
            // Another VU is refreshing, wait a bit
            sleep(0.1);
            return tokenCache.token;
        }
    }
    
    // Token still valid, reuse
    return tokenCache.token;
}

/**
 * Check if token is valid
 * 
 * @returns {boolean} - True if token is valid
 */
export function isTokenValid() {
    if (!tokenCache.token || !tokenCache.expiresAt) {
        return false;
    }
    
    return Date.now() < tokenCache.expiresAt;
}

/**
 * Get token expiry time
 * 
 * @returns {number} - Milliseconds until token expires
 */
export function getTokenTTL() {
    if (!tokenCache.expiresAt) {
        return 0;
    }
    
    return Math.max(0, tokenCache.expiresAt - Date.now());
}

/**
 * Force token refresh
 * 
 * @returns {string|null} - New token
 */
export function forceRefreshToken() {
    console.log('[TOKEN] Force refresh requested');
    return generateToken();
}

/**
 * Get token statistics
 * 
 * @returns {object} - Token stats
 */
export function getTokenStats() {
    return {
        hasToken: !!tokenCache.token,
        isValid: isTokenValid(),
        ttlSeconds: Math.floor(getTokenTTL() / 1000),
        generatedAt: tokenCache.generatedAt ? new Date(tokenCache.generatedAt).toISOString() : null,
        expiresAt: tokenCache.expiresAt ? new Date(tokenCache.expiresAt).toISOString() : null
    };
}
