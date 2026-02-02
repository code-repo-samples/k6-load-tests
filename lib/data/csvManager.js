/**
 * Enterprise CSV Data Manager
 * 
 * Features:
 * - Load CSV data with SharedArray for memory efficiency
 * - Ensure unique data per VU and iteration
 * - Automatic test abort when data exhausted
 * - Support multiple CSV files in same script
 * - Detailed logging of data usage
 * 
 * Usage:
 * import { loadCSVData, getUniqueData, isDataExhausted } from './lib/data/csvManager.js';
 * 
 * const users = loadCSVData('users', './data/users.csv');
 * 
 * export default function() {
 *   const user = getUniqueData(users, __VU, __ITER);
 *   if (!user) {
 *     console.error('Data exhausted! Stopping test.');
 *     exec.test.abort('CSV data exhausted');
 *   }
 * }
 */

import { SharedArray } from 'k6/data';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';
import exec from 'k6/execution';

// Track loaded datasets
const loadedDatasets = {};

/**
 * Load CSV data into SharedArray
 * 
 * @param {string} name - Unique name for this dataset
 * @param {string} filePath - Path to CSV file
 * @param {object} options - Loading options
 *   - header: First row is header (default: true)
 *   - delimiter: CSV delimiter (default: ',')
 *   - skipEmptyLines: Skip empty lines (default: true)
 *   - required: Abort if file not found (default: true)
 * 
 * @returns {SharedArray} - Shared array of data
 * 
 * Example:
 * const users = loadCSVData('users', './data/users.csv');
 * console.log(`Loaded ${users.length} users`);
 */
export function loadCSVData(name, filePath, options = {}) {
    const {
        header = true,
        delimiter = ',',
        skipEmptyLines = true,
        required = true
    } = options;
    
    console.log(`[DATA] Loading CSV: ${name} from ${filePath}...`);
    
    const data = new SharedArray(name, function() {
        let fileContent;
        
        try {
            fileContent = open(filePath);
        } catch (error) {
            if (required) {
                throw new Error(`Failed to load required CSV file: ${filePath} - ${error.message}`);
            } else {
                console.warn(`[DATA] Optional CSV file not found: ${filePath}`);
                return [];
            }
        }
        
        const parsed = papaparse.parse(fileContent, {
            header: header,
            delimiter: delimiter,
            skipEmptyLines: skipEmptyLines
        });
        
        if (parsed.errors.length > 0) {
            console.warn(`[DATA] CSV parsing warnings for ${name}:`, parsed.errors.slice(0, 3));
        }
        
        const records = parsed.data;
        console.log(`[DATA] ✓ Loaded ${records.length} records from ${name}`);
        
        return records;
    });
    
    // Store dataset metadata
    loadedDatasets[name] = {
        data: data,
        totalRecords: data.length,
        filePath: filePath,
        loadedAt: Date.now()
    };
    
    return data;
}

/**
 * Get unique data for VU and iteration
 * Ensures each VU gets different data, and iterations don't repeat
 * 
 * @param {SharedArray} dataArray - Data array from loadCSVData
 * @param {number} vuId - Virtual User ID (__VU)
 * @param {number} iteration - Iteration number (__ITER)
 * @param {object} options - Options
 *   - abortOnExhaustion: Abort test when data exhausted (default: true)
 *   - logExhaustion: Log when data exhausted (default: true)
 * 
 * @returns {object|null} - Data record or null if exhausted
 * 
 * Example:
 * export default function() {
 *   const user = getUniqueData(users, __VU, __ITER);
 *   if (!user) return; // Data exhausted
 * }
 */
export function getUniqueData(dataArray, vuId, iteration, options = {}) {
    const {
        abortOnExhaustion = true,
        logExhaustion = true
    } = options;
    
    if (!dataArray || dataArray.length === 0) {
        if (logExhaustion) {
            console.error('[DATA] Data array is empty!');
        }
        if (abortOnExhaustion) {
            exec.test.abort('CSV data array is empty');
        }
        return null;
    }
    
    // Calculate unique index: (VU - 1) * maxIterations + currentIteration
    // This ensures each VU x Iteration combination gets unique data
    const index = (vuId - 1) * 1000 + iteration; // Assuming max 1000 iterations per VU
    
    if (index >= dataArray.length) {
        if (logExhaustion) {
            console.error(`[DATA] Data exhausted! VU ${vuId}, Iter ${iteration}, Index ${index} exceeds ${dataArray.length} records`);
        }
        if (abortOnExhaustion) {
            exec.test.abort(`CSV data exhausted at VU ${vuId}, Iteration ${iteration}`);
        }
        return null;
    }
    
    return dataArray[index];
}

/**
 * Get data by index (simple sequential access)
 * 
 * @param {SharedArray} dataArray - Data array
 * @param {number} index - Index to retrieve
 * @returns {object|null} - Data record or null
 */
export function getDataByIndex(dataArray, index) {
    if (!dataArray || index >= dataArray.length) {
        return null;
    }
    return dataArray[index];
}

/**
 * Get random data from array
 * 
 * @param {SharedArray} dataArray - Data array
 * @returns {object|null} - Random data record
 */
export function getRandomData(dataArray) {
    if (!dataArray || dataArray.length === 0) {
        return null;
    }
    const randomIndex = Math.floor(Math.random() * dataArray.length);
    return dataArray[randomIndex];
}

/**
 * Check if data will be exhausted for given VU count and iterations
 * 
 * @param {SharedArray} dataArray - Data array
 * @param {number} totalVUs - Total number of VUs
 * @param {number} iterations - Iterations per VU
 * @returns {boolean} - True if data is sufficient
 */
export function isDataSufficient(dataArray, totalVUs, iterations) {
    const requiredRecords = totalVUs * iterations;
    const available = dataArray.length;
    
    const sufficient = available >= requiredRecords;
    
    console.log(`[DATA] Capacity check: ${available} records available, ${requiredRecords} required (${totalVUs} VUs × ${iterations} iterations)`);
    
    if (!sufficient) {
        console.warn(`[DATA] ⚠ WARNING: Insufficient data! Need ${requiredRecords - available} more records`);
    } else {
        console.log(`[DATA] ✓ Sufficient data available`);
    }
    
    return sufficient;
}

/**
 * Get dataset statistics
 * 
 * @param {string} name - Dataset name
 * @returns {object} - Dataset statistics
 */
export function getDatasetStats(name) {
    const dataset = loadedDatasets[name];
    
    if (!dataset) {
        return null;
    }
    
    return {
        name: name,
        totalRecords: dataset.totalRecords,
        filePath: dataset.filePath,
        loadedAt: new Date(dataset.loadedAt).toISOString()
    };
}

/**
 * Get all loaded datasets info
 * 
 * @returns {object} - All dataset information
 */
export function getAllDatasetsInfo() {
    const info = {};
    
    for (const [name, dataset] of Object.entries(loadedDatasets)) {
        info[name] = {
            totalRecords: dataset.totalRecords,
            filePath: dataset.filePath
        };
    }
    
    return info;
}

/**
 * Validate dataset has required fields
 * 
 * @param {SharedArray} dataArray - Data array
 * @param {array} requiredFields - Required field names
 * @returns {object} - Validation result
 */
export function validateDataset(dataArray, requiredFields) {
    if (!dataArray || dataArray.length === 0) {
        return {
            valid: false,
            error: 'Dataset is empty'
        };
    }
    
    const firstRecord = dataArray[0];
    const missingFields = [];
    
    for (const field of requiredFields) {
        if (!(field in firstRecord)) {
            missingFields.push(field);
        }
    }
    
    if (missingFields.length > 0) {
        return {
            valid: false,
            error: `Missing required fields: ${missingFields.join(', ')}`,
            missingFields: missingFields
        };
    }
    
    return {
        valid: true,
        totalRecords: dataArray.length,
        fields: Object.keys(firstRecord)
    };
}

/**
 * Calculate data usage per VU
 * 
 * @param {number} totalRecords - Total records available
 * @param {number} totalVUs - Number of VUs
 * @returns {object} - Usage calculation
 */
export function calculateDataUsage(totalRecords, totalVUs) {
    const recordsPerVU = Math.floor(totalRecords / totalVUs);
    const remainder = totalRecords % totalVUs;
    
    return {
        totalRecords,
        totalVUs,
        recordsPerVU,
        remainder,
        maxIterationsPerVU: recordsPerVU
    };
}
