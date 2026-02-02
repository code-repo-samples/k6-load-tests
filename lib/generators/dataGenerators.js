/**
 * Synthetic Data Generators
 * 
 * Features:
 * - Generate realistic test data
 * - Support for various data types
 * - Deterministic and random generation
 * 
 * Usage:
 * import { generateEmail, generateUserId, generatePayload } from './lib/generators/dataGenerators.js';
 */

/**
 * Generate random email address
 * 
 * @param {string} prefix - Email prefix (optional)
 * @param {string} domain - Email domain (default: 'example.com')
 * @returns {string} - Email address
 * 
 * Example:
 * const email = generateEmail('user', 'testdomain.com');
 * // Returns: user_a7k9m2@testdomain.com
 */
export function generateEmail(prefix = 'user', domain = 'example.com') {
    const randomStr = Math.random().toString(36).substring(2, 8);
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}_${randomStr}${timestamp}@${domain}`;
}

/**
 * Generate unique user ID
 * 
 * @param {string} prefix - ID prefix (default: 'USER')
 * @returns {string} - User ID
 * 
 * Example:
 * const userId = generateUserId('CUST');
 * // Returns: CUST_1706267845123_A7K9
 */
export function generateUserId(prefix = 'USER') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate random string
 * 
 * @param {number} length - String length
 * @param {object} options - Generation options
 *   - uppercase: Include uppercase (default: true)
 *   - lowercase: Include lowercase (default: true)
 *   - numbers: Include numbers (default: true)
 * @returns {string} - Random string
 */
export function generateRandomString(length, options = {}) {
    const {
        uppercase = true,
        lowercase = true,
        numbers = true
    } = options;
    
    let chars = '';
    if (uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (numbers) chars += '0123456789';
    
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Generate random integer
 * 
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Random integer
 */
export function generateRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate first name
 * 
 * @returns {string} - First name
 */
export function generateFirstName() {
    const names = [
        'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph',
        'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Susan', 'Jessica', 'Sarah'
    ];
    return names[Math.floor(Math.random() * names.length)];
}

/**
 * Generate last name
 * 
 * @returns {string} - Last name
 */
export function generateLastName() {
    const names = [
        'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
        'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'
    ];
    return names[Math.floor(Math.random() * names.length)];
}

/**
 * Generate full name
 * 
 * @returns {string} - Full name
 */
export function generateFullName() {
    return `${generateFirstName()} ${generateLastName()}`;
}

/**
 * Generate phone number
 * 
 * @param {string} format - Format ('US', 'GENERIC')
 * @returns {string} - Phone number
 */
export function generatePhoneNumber(format = 'US') {
    if (format === 'US') {
        const area = generateRandomInt(200, 999);
        const exchange = generateRandomInt(200, 999);
        const line = generateRandomInt(1000, 9999);
        return `${area}-${exchange}-${line}`;
    }
    // Generic
    return generateRandomString(10, { uppercase: false, lowercase: false, numbers: true });
}

/**
 * Generate UUID v4
 * 
 * @returns {string} - UUID
 */
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Generate timestamp
 * 
 * @param {string} format - Format ('iso', 'unix', 'ms')
 * @returns {string|number} - Timestamp
 */
export function generateTimestamp(format = 'iso') {
    const now = new Date();
    
    switch (format) {
        case 'iso':
            return now.toISOString();
        case 'unix':
            return Math.floor(now.getTime() / 1000);
        case 'ms':
            return now.getTime();
        default:
            return now.toISOString();
    }
}

/**
 * Generate user payload for Create API
 * 
 * @param {object} overrides - Override default values
 * @returns {object} - User payload
 * 
 * Example:
 * const payload = generateUserPayload({ email: 'custom@example.com' });
 */
export function generateUserPayload(overrides = {}) {
    const defaults = {
        email: generateEmail(),
        firstName: generateFirstName(),
        lastName: generateLastName(),
        phone: generatePhoneNumber(),
        userId: generateUserId(),
        createdAt: generateTimestamp('iso')
    };
    
    return {
        ...defaults,
        ...overrides
    };
}

/**
 * Generate order payload
 * 
 * @param {object} overrides - Override default values
 * @returns {object} - Order payload
 */
export function generateOrderPayload(overrides = {}) {
    const defaults = {
        orderId: `ORD_${Date.now()}_${generateRandomString(4, { lowercase: false })}`,
        amount: generateRandomInt(10, 1000),
        currency: 'USD',
        status: 'pending',
        createdAt: generateTimestamp('iso')
    };
    
    return {
        ...defaults,
        ...overrides
    };
}

/**
 * Generate address
 * 
 * @returns {object} - Address object
 */
export function generateAddress() {
    const streetNumber = generateRandomInt(1, 9999);
    const streets = ['Main St', 'Oak Ave', 'Maple Dr', 'Park Rd', 'Washington Blvd'];
    const cities = ['Springfield', 'Franklin', 'Clinton', 'Madison', 'Georgetown'];
    const states = ['CA', 'NY', 'TX', 'FL', 'IL'];
    
    return {
        street: `${streetNumber} ${streets[Math.floor(Math.random() * streets.length)]}`,
        city: cities[Math.floor(Math.random() * cities.length)],
        state: states[Math.floor(Math.random() * states.length)],
        zipCode: generateRandomString(5, { uppercase: false, lowercase: false, numbers: true }),
        country: 'USA'
    };
}

/**
 * Generate generic payload with required fields
 * 
 * @param {object} schema - Schema definition { fieldName: type }
 * @returns {object} - Generated payload
 * 
 * Example:
 * const payload = generatePayload({
 *   name: 'string',
 *   age: 'number',
 *   email: 'email',
 *   active: 'boolean'
 * });
 */
export function generatePayload(schema) {
    const payload = {};
    
    for (const [field, type] of Object.entries(schema)) {
        switch (type) {
            case 'string':
                payload[field] = generateRandomString(10);
                break;
            case 'number':
                payload[field] = generateRandomInt(1, 100);
                break;
            case 'email':
                payload[field] = generateEmail();
                break;
            case 'boolean':
                payload[field] = Math.random() > 0.5;
                break;
            case 'uuid':
                payload[field] = generateUUID();
                break;
            case 'timestamp':
                payload[field] = generateTimestamp();
                break;
            default:
                payload[field] = null;
        }
    }
    
    return payload;
}

/**
 * Add jitter to numeric value
 * 
 * @param {number} value - Base value
 * @param {number} percentage - Jitter percentage (default: 10)
 * @returns {number} - Value with jitter
 * 
 * Example:
 * const amount = addJitter(100, 20); // Returns 80-120
 */
export function addJitter(value, percentage = 10) {
    const jitter = value * (percentage / 100);
    return value + (Math.random() * jitter * 2 - jitter);
}

/**
 * Select random item from array
 * 
 * @param {array} array - Source array
 * @returns {any} - Random item
 */
export function selectRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
}
