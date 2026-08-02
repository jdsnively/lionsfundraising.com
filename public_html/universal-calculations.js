/**
 * Lions Football Club - Universal Calculations Library
 * FIXED: Enhanced Error Handling for Worker Shirt Deduction
 * Version: 3.0.3 - FIXED: Robust Worker Lookup Function Handling
 * Last Updated: September 2025
 */

// ============================================================================
// TIME PARSING AND HOURS CALCULATION
// ============================================================================

/**
 * Parse time string in 24-hour format with quarter-hour increments
 * Supports formats: "14:30", "1430", "2:15"
 * @param {string} timeStr - Time string to parse
 * @returns {Object} - {valid: boolean, hours: number, minutes: number, error?: string}
 */
function parseTime(timeStr) {
    if (!timeStr) return { valid: false, error: "Time is required" };

    // Clean input and handle different formats intelligently
    const cleaned = timeStr.replace(/[^\d:]/g, '');

    // Suppress console spam for obviously incomplete entries
    if (cleaned.length < 3 || cleaned === '1' || cleaned === '16' || cleaned.endsWith(':')) {
        return { valid: false, error: `Incomplete time entry "${timeStr}"` };
    }

    let hours, minutes;

    // Handle colon format: "14:30", "8:15", "16:3" (auto-correct)
    if (cleaned.includes(':')) {
        const colonMatch = cleaned.match(/^(\d{1,2}):(\d{1,2})$/);
        if (!colonMatch) return { valid: false, error: "Invalid time format. Use HH:MM or HHMM" };

        hours = parseInt(colonMatch[1]);
        let rawMinutes = parseInt(colonMatch[2]);

        // Auto-correct single digit minutes: "16:3" → "16:30", "16:4" → "16:45"
        if (rawMinutes < 10 && colonMatch[2].length === 1) {
            if (rawMinutes <= 3) {
                minutes = rawMinutes === 0 ? 0 : 30; // 0→0, 1-3→30
            } else {
                minutes = 45; // 4-9→45
            }
            console.log(`Auto-corrected time: ${cleaned} → ${hours}:${String(minutes).padStart(2, '0')}`);
        } else {
            minutes = rawMinutes;
        }
    }
    // Handle no colon format: "1430", "815"
    else {
        if (cleaned.length === 4) {
            // HHMM format
            hours = parseInt(cleaned.substring(0, 2));
            minutes = parseInt(cleaned.substring(2, 4));
        } else if (cleaned.length === 3) {
            // HMM format  
            hours = parseInt(cleaned.substring(0, 1));
            minutes = parseInt(cleaned.substring(1, 3));
        } else {
            return { valid: false, error: `Invalid time format "${timeStr}". Use HH:MM or HHMM` };
        }
    }

    // Validate parsed values
    if (isNaN(hours) || isNaN(minutes)) {
        return { valid: false, error: `Invalid time format "${timeStr}". Use HH:MM or HHMM` };
    }

    if (hours > 23) return { valid: false, error: `Hours must be 0-23 (got ${hours})` };
    if (minutes > 59) return { valid: false, error: `Minutes must be 0-59 (got ${minutes}). Did you mean ${hours}:${Math.floor(minutes / 10) * 15}?` };
    if (minutes % 15 !== 0) return { valid: false, error: "Times must be in 15-minute increments (00, 15, 30, 45)" };

    return { valid: true, hours, minutes };
}

/**
 * Calculate hours between two times in quarter-hour increments
 * @param {string} startTime - Start time string (24-hour format)
 * @param {string} endTime - End time string (24-hour format)
 * @returns {number} - Hours worked (in quarter-hour increments)
 */
function calculateHours(startTime, endTime) {
    const start = parseTime(startTime);
    const end = parseTime(endTime);

    if (!start.valid || !end.valid) return 0;

    let startMinutes = start.hours * 60 + start.minutes;
    let endMinutes = end.hours * 60 + end.minutes;

    // Handle overnight shifts: if end <= start, add 24 hours to end
    if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60;
    }

    const totalMinutes = endMinutes - startMinutes;
    const hours = totalMinutes / 60; // Convert to decimal hours

    return hours;
}

/**
 * Format time for display in 24-hour format
 * @param {string} timeStr - Time string to format
 * @returns {string} - Formatted time (HH:MM)
 */
function formatTime(timeStr) {
    const parsed = parseTime(timeStr);
    if (!parsed.valid) return timeStr;

    const { hours, minutes } = parsed;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ============================================================================
// FORMATTING UTILITY FUNCTIONS
// ============================================================================

/**
 * Format currency amount for display
 * @param {number} amount - Amount to format
 * @returns {string} - Formatted currency string
 */
function formatCurrency(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
    return '$' + amount.toFixed(2);
}

/**
 * Format hours for display with two decimal places
 * @param {number} hours - Hours to format
 * @returns {string} - Formatted hours string
 */
function formatHours(hours) {
    if (typeof hours !== 'number' || isNaN(hours)) return '0.00';
    return hours.toFixed(2);
}

/**
 * Format date for display with proper timezone handling
 * @param {string} dateStr - Date string to format
 * @returns {string} - Formatted date
 */
function formatDate(dateStr) {
    if (!dateStr) return 'No Date';
    try {
        // Handle HTML date input format (YYYY-MM-DD) by parsing components locally
        if (dateStr.includes('-') && dateStr.length === 10) {
            const [year, month, day] = dateStr.split('-').map(Number);
            // Create date in local timezone (month is 0-indexed)
            const localDate = new Date(year, month - 1, day);
            return localDate.toLocaleDateString();
        }
        // Fallback for other date formats
        return new Date(dateStr).toLocaleDateString();
    } catch (error) {
        return dateStr;
    }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Enhanced validation with better error suppression
 * Validate calculation inputs
 * @param {number} sodexoAmount - Sodexo payment amount
 * @param {Array} workers - Array of worker objects
 * @param {Object} shiftData - Shift configuration data
 * @returns {Object} - Validation result with errors if any
 */
function validateCalculationInputs(sodexoAmount, workers, shiftData = {}) {
    const errors = [];

    // Validate Sodexo amount
    if (!sodexoAmount || typeof sodexoAmount !== 'number' || sodexoAmount <= 0) {
        errors.push('Sodexo amount must be a positive number greater than 0');
    }

    // Validate workers array
    if (!workers || !Array.isArray(workers) || workers.length === 0) {
        errors.push('At least one worker is required');
    } else {
        workers.forEach((worker, index) => {
            if (!worker || typeof worker !== 'object') {
                errors.push(`Worker ${index + 1}: Invalid worker data`);
                return;
            }

            if (!worker.name || typeof worker.name !== 'string' || !worker.name.trim()) {
                errors.push(`Worker ${index + 1}: Name is required`);
            }

            if (!worker.startTime || !worker.endTime) {
                errors.push(`Worker ${index + 1}: Start and end times are required`);
            } else {
                // Better error reporting for time validation with suppression
                const startParsed = parseTime(worker.startTime);
                const endParsed = parseTime(worker.endTime);

                if (!startParsed.valid) {
                    // Only log non-trivial errors
                    if (!startParsed.error.includes('Incomplete time entry')) {
                        errors.push(`Worker ${index + 1} (${worker.name}): Invalid start time "${worker.startTime}" - ${startParsed.error}`);
                    }
                }

                if (!endParsed.valid) {
                    // Only log non-trivial errors
                    if (!endParsed.error.includes('Incomplete time entry')) {
                        errors.push(`Worker ${index + 1} (${worker.name}): Invalid end time "${worker.endTime}" - ${endParsed.error}`);
                    }
                }

                // Only calculate hours if both times are valid
                if (startParsed.valid && endParsed.valid) {
                    const hours = calculateHours(worker.startTime, worker.endTime);
                    if (hours <= 0) {
                        errors.push(`Worker ${index + 1} (${worker.name}): Invalid time range (${worker.startTime} to ${worker.endTime}) - results in ${hours.toFixed(2)} hours`);
                    }
                }
            }
        });
    }

    // Validate separate mode requirements
    if (shiftData?.separateStandsMode) {
        if (!shiftData.primaryStand || !shiftData.secondaryStand) {
            errors.push('Separate mode requires both primary and secondary stands to be defined');
        }

        if (!shiftData.primarySodexoPayout || shiftData.primarySodexoPayout <= 0) {
            errors.push('Separate mode requires primary stand to have a payment amount > 0');
        }

        if (!shiftData.secondarySodexoPayout || shiftData.secondarySodexoPayout <= 0) {
            errors.push('Separate mode requires secondary stand to have a payment amount > 0');
        }
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Clean and validate worker data
 * @param {Array} workers - Raw worker array
 * @returns {Array} - Cleaned worker array with defaults
 */
function cleanWorkerData(workers) {
    if (!Array.isArray(workers)) return [];

    return workers
        .filter(worker => worker && typeof worker === 'object')
        .map(worker => ({
            name: (worker.name || '').trim(),
            stand: (worker.stand || 'N/A').trim(),
            startTime: (worker.startTime || '').trim(),
            endTime: (worker.endTime || '').trim(),
            finalizedShirtDeduction: worker.finalizedShirtDeduction
        }))
        .filter(worker => worker.name && worker.startTime && worker.endTime);
}

// ============================================================================
// DOUBLE SHIFT PROCESSING - UNIVERSAL HANDLERS
// ============================================================================

/**
 * Universal double shift processor - handles both payouts and treasurer needs
 * @param {Array} workers - Array of worker objects
 * @param {Object} options - Processing options
 * @returns {Object} - {separateView: Array, combinedView: Array}
 */
function processDoubleShifts(workers, options = {}) {
    if (!workers || workers.length === 0) return { separateView: [], combinedView: [] };

    const workerMap = new Map();
    const separateView = [];

    // First pass: collect all workers and identify doubles
    workers.forEach(worker => {
        const name = worker.name?.trim();
        if (!name) return;

        // Always add to separate view (for payouts)
        separateView.push({
            ...worker,
            hours: calculateHours(worker.startTime, worker.endTime),
            isDoubleShift: false,
            shiftsWorked: 1,
            originalIndex: separateView.length
        });

        // Track for combining (for treasurer)
        if (workerMap.has(name)) {
            const existing = workerMap.get(name);
            const currentHours = calculateHours(worker.startTime, worker.endTime);

            existing.combinedHours = (existing.combinedHours || existing.hours) + currentHours;
            existing.shifts = (existing.shifts || 1) + 1;
            existing.originalWorkers = existing.originalWorkers || [existing.originalWorker];
            existing.originalWorkers.push({ ...worker });

            if (worker.finalizedShirtDeduction !== undefined) {
                existing.finalizedShirtDeduction = (existing.finalizedShirtDeduction || 0) + worker.finalizedShirtDeduction;
            }
        } else {
            const hours = calculateHours(worker.startTime, worker.endTime);
            workerMap.set(name, {
                ...worker,
                hours: hours,
                combinedHours: hours,
                shifts: 1,
                originalWorker: { ...worker }
            });
        }
    });

    // Mark double shifts in separate view
    separateView.forEach(worker => {
        const mapEntry = workerMap.get(worker.name);
        if (mapEntry && mapEntry.shifts > 1) {
            worker.isDoubleShift = true;
            worker.shiftsWorked = mapEntry.shifts;
        }
    });

    // Create combined view
    const combinedView = Array.from(workerMap.values()).map(worker => ({
        ...worker,
        hours: worker.combinedHours,
        isDoubleShift: worker.shifts > 1,
        shiftsWorked: worker.shifts
    }));

    return { separateView, combinedView };
}

/**
 * Get workers for calculation based on system needs
 * @param {Array} workers - Raw worker array
 * @param {boolean} combineDoubleShifts - Whether to combine double shifts
 * @returns {Array} - Processed worker array
 */
function getWorkersForCalculation(workers, combineDoubleShifts = false) {
    const processed = processDoubleShifts(workers);
    return combineDoubleShifts ? processed.combinedView : processed.separateView;
}

// ============================================================================
// WORKER PROCESSING AND SHIRT LOGIC - FIXED ERROR HANDLING
// ============================================================================

/**
 * Get CR# for a worker based on their stand assignment
 * @param {Object} worker - Worker object with stand assignment
 * @param {Object} shiftData - Shift data containing CR# information
 * @returns {string} - CR# or empty string
 */
function getWorkerCrNumber(worker, shiftData) {
    if (!shiftData || !worker) return '';

    const primaryStand = shiftData.primaryStand || shiftData.standNumber;
    const secondaryStand = shiftData.secondaryStand;

    if (worker.stand === primaryStand && shiftData.primaryCrNumber) {
        return shiftData.primaryCrNumber;
    } else if (worker.stand === secondaryStand && shiftData.secondaryCrNumber) {
        return shiftData.secondaryCrNumber;
    }

    // Fallback to legacy CR# field for backward compatibility
    return shiftData.crNumber || '';
}

/**
 * FIXED: Enhanced shirt deduction with robust error handling
 * Get shirt deduction for a worker (handles finalized vs. lookup logic)
 * @param {Object} worker - Worker object
 * @param {Function} workerLookupFn - Optional function to lookup worker shirt status
 * @returns {number} - Shirt deduction amount (0 or 5)
 */
function getWorkerShirtDeduction(worker, workerLookupFn = null) {
    // Enhanced logging for debugging
    console.log(`🔍 SHIRT DEBUG - Checking deduction for: ${worker.name}`);

    // If worker has stored shirt deduction (from finalized shift), use that
    if (worker.hasOwnProperty('finalizedShirtDeduction')) {
        console.log(`✅ SHIRT DEBUG - Using finalized deduction: $${worker.finalizedShirtDeduction}`);
        return worker.finalizedShirtDeduction;
    }

    // FIXED: Enhanced lookup function validation and error handling
    if (workerLookupFn && typeof workerLookupFn === 'function') {
        try {
            console.log(`🔍 SHIRT DEBUG - Attempting lookup function for: ${worker.name}`);
            const lookup = workerLookupFn(worker.name);

            // FIXED: Validate that lookup function returned expected format
            if (lookup && typeof lookup === 'object' && lookup.hasOwnProperty('hasLOSShirt')) {
                const deduction = lookup.hasLOSShirt ? 0 : 5;
                console.log(`✅ SHIRT DEBUG - Using lookup function: hasShirt=${lookup.hasLOSShirt}, deduction=$${deduction}`);
                return deduction;
            } else {
                console.warn(`⚠️ SHIRT DEBUG - Lookup function returned invalid format for ${worker.name}:`, lookup);
                console.warn(`Expected: {hasLOSShirt: boolean}, got:`, typeof lookup, lookup);
                // Fall through to fallback logic
            }
        } catch (error) {
            console.error(`❌ SHIRT DEBUG - Lookup function error for ${worker.name}:`, error);
            // Fall through to fallback logic
        }
    }

    // Fallback: consistent hash-based shirt status for treasurer
    const hasShirt = getConsistentShirtStatus(worker.name);
    const deduction = hasShirt ? 0 : 5;
    console.log(`✅ SHIRT DEBUG - Using fallback hash: hasShirt=${hasShirt}, deduction=$${deduction}`);
    return deduction;
}

/**
 * Generate consistent shirt status based on worker name (fallback for treasurer)
 * @param {string} workerName - Worker name
 * @returns {boolean} - True if worker has shirt (no deduction needed)
 */
function getConsistentShirtStatus(workerName) {
    if (!workerName) return false;

    let hash = 0;
    for (let i = 0; i < workerName.length; i++) {
        const char = workerName.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }

    return Math.abs(hash) % 3 !== 0;
}

// ============================================================================
// FORMATTING WITH SYSTEM-SPECIFIC FEATURES
// ============================================================================

/**
 * Add formatted properties to calculation results
 * @param {Object} calculations - Raw calculation results
 * @param {Object} options - Formatting options
 * @returns {Object} - Calculations with formatted properties added
 */
function addFormattedProperties(calculations, options = {}) {
    const includeWorkerHourlyRates = options.includeWorkerHourlyRates !== false;

    return {
        ...calculations,
        // Formatted numeric properties
        totalHoursFormatted: formatHours(calculations.totalHours),
        hourlyRateFormatted: formatCurrency(calculations.hourlyRate),
        totalWorkerPayoutsFormatted: formatCurrency(calculations.totalWorkerPayouts),
        lionsFinalTotalFormatted: formatCurrency(calculations.lionsFinalTotal),
        lionsPercentFormatted: formatCurrency(calculations.lionsPercent),
        coachesPercentFormatted: formatCurrency(calculations.coachesPercent),
        coordinatorPercentFormatted: formatCurrency(calculations.coordinatorPercent),
        availableForWorkersFormatted: formatCurrency(calculations.availableForWorkers),
        roundingAmountFormatted: formatCurrency(calculations.roundingAmount),
        lionsShirtCostsFormatted: formatCurrency(calculations.lionsShirtCosts),
        coordinatorAdjustmentFormatted: formatCurrency(calculations.coordinatorAdjustment),

        // Format worker payouts with system-specific features
        workerPayouts: calculations.workerPayouts.map(worker => {
            const formatted = {
                ...worker,
                hoursFormatted: formatHours(worker.hours),
                grossAmountFormatted: formatCurrency(worker.grossAmount),
                shirtDeductionFormatted: formatCurrency(worker.shirtDeduction),
                netAmountFormatted: formatCurrency(worker.netAmount)
            };

            // Add worker-specific hourly rate for payouts system
            if (includeWorkerHourlyRates) {
                formatted.workerHourlyRate = calculations.separateMode && calculations.standBreakdowns ?
                    calculations.standBreakdowns.find(sb => sb.standName === worker.stand)?.hourlyRate || calculations.hourlyRate :
                    calculations.hourlyRate;
                formatted.workerHourlyRateFormatted = formatCurrency(formatted.workerHourlyRate);
            }

            return formatted;
        })
    };
}

// ============================================================================
// EXPORT AND SUMMARY UTILITIES
// ============================================================================

/**
 * Generate worker totals across multiple shifts
 * @param {Array} allShifts - Array of all shift objects
 * @param {Object} options - Options for totals generation
 * @returns {Array} - Array of worker total objects
 */
function generateWorkerTotals(allShifts, options = {}) {
    const combineDoubleShifts = options.combineDoubleShifts || false;
    const workerTotals = {};

    allShifts.forEach(shift => {
        const primaryPayout = shift.primarySodexoPayout || shift.sodexoPayout || 0;
        const secondaryPayout = shift.secondarySodexoPayout || 0;
        const totalPayout = primaryPayout + secondaryPayout;

        const calculations = calculatePayouts(totalPayout, shift.workers || [], shift, {
            combineDoubleShifts: combineDoubleShifts,
            includeWorkerHourlyRates: false
        });

        calculations.workerPayouts.forEach(payout => {
            if (!workerTotals[payout.name]) {
                workerTotals[payout.name] = {
                    name: payout.name,
                    totalShifts: 0,
                    totalShiftInstances: 0,
                    uniqueEvents: new Set(),
                    totalHours: 0,
                    grossEarnings: 0,
                    shirtDeductions: 0,
                    netEarnings: 0
                };
            }

            const worker = workerTotals[payout.name];
            worker.uniqueEvents.add(shift.id);
            worker.totalShiftInstances += payout.shiftsWorked || 1;
            worker.totalHours += payout.hours;
            worker.grossEarnings += payout.grossAmount;
            worker.shirtDeductions += payout.shirtDeduction;
            worker.netEarnings += payout.netAmount;
        });
    });

    // Convert to array and sort (Jason Snively first, then alphabetical)
    return Object.values(workerTotals)
        .map(worker => ({
            ...worker,
            totalShifts: worker.uniqueEvents.size,
            avgPerShift: worker.uniqueEvents.size > 0 ? worker.netEarnings / worker.uniqueEvents.size : 0,
            avgPerHour: worker.totalHours > 0 ? worker.netEarnings / worker.totalHours : 0,
            // Add formatted properties
            totalHoursFormatted: formatHours(worker.totalHours),
            grossEarningsFormatted: formatCurrency(worker.grossEarnings),
            shirtDeductionsFormatted: formatCurrency(worker.shirtDeductions),
            netEarningsFormatted: formatCurrency(worker.netEarnings),
            avgPerShiftFormatted: formatCurrency(worker.avgPerShift),
            avgPerHourFormatted: formatCurrency(worker.avgPerHour)
        }))
        .sort((a, b) => {
            if (a.name === 'Jason Snively') return -1;
            if (b.name === 'Jason Snively') return 1;

            const aFirstName = a.name.split(' ')[0];
            const bFirstName = b.name.split(' ')[0];
            return aFirstName.localeCompare(bFirstName);
        });
}

/**
 * Generate payroll summary for export
 * @param {Array} allShifts - Array of all shift objects
 * @param {Object} options - Export options
 * @returns {Object} - Summary data ready for export
 */
function generatePayrollSummary(allShifts, options = {}) {
    const combineDoubleShifts = options.combineDoubleShifts || false;

    const summary = {
        totalShifts: allShifts.length,
        totalSodexo: 0,
        totalLions: 0,
        totalCoaches: 0,
        totalCoordinator: 0,
        totalWorkerPayouts: 0,
        totalShirtCosts: 0,
        totalRounding: 0,
        shifts: []
    };

    allShifts.forEach(shift => {
        const primaryPayout = shift.primarySodexoPayout || shift.sodexoPayout || 0;
        const secondaryPayout = shift.secondarySodexoPayout || 0;
        const totalPayout = primaryPayout + secondaryPayout;

        const calculations = calculatePayouts(totalPayout, shift.workers || [], shift, {
            combineDoubleShifts: combineDoubleShifts,
            includeWorkerHourlyRates: false
        });

        summary.totalSodexo += totalPayout;
        summary.totalLions += calculations.lionsFinalTotal;
        summary.totalCoaches += calculations.coachesPercent;
        summary.totalCoordinator += calculations.coordinatorPercent;
        summary.totalWorkerPayouts += calculations.totalWorkerPayouts;
        summary.totalShirtCosts += calculations.lionsShirtCosts;
        summary.totalRounding += calculations.roundingAmount;

        summary.shifts.push({
            id: shift.id,
            eventName: shift.eventName || 'Unnamed Event',
            eventDate: shift.eventDate,
            primaryStand: shift.primaryStand || shift.standNumber || 'N/A',
            secondaryStand: shift.secondaryStand || '',
            separateMode: shift.separateStandsMode || false,
            totalPayout: totalPayout,
            workerCount: (shift.workers || []).length,
            calculations: calculations
        });
    });

    return summary;
}

// ============================================================================
// MAIN CALCULATION FUNCTIONS
// ============================================================================

/**
 * Main payout calculation dispatcher with comprehensive validation
 * @param {number} sodexoAmount - Total Sodexo payment amount
 * @param {Array} workers - Array of worker objects
 * @param {Object} shiftData - Shift configuration data
 * @param {Object} options - Additional options for calculation
 * @returns {Object} - Complete calculation results with formatted properties
 */
function calculatePayouts(sodexoAmount, workers, shiftData = {}, options = {}) {
    // Validate inputs
    const validation = validateCalculationInputs(sodexoAmount, workers, shiftData);
    if (!validation.isValid) {
        // Only log actual errors, not spam
        const realErrors = validation.errors.filter(err => !err.includes('Incomplete time entry'));
        if (realErrors.length > 0) {
            console.error('Calculation validation failed:', realErrors);
        }
        return {
            isValid: false,
            errors: validation.errors,
            totalHours: 0,
            hourlyRate: 0,
            totalWorkerPayouts: 0,
            lionsFinalTotal: 0,
            workerPayouts: [],
            lionsPercent: 0,
            coachesPercent: 0,
            coordinatorPercent: 0,
            availableForWorkers: 0,
            roundingAmount: 0,
            lionsShirtCosts: 0,
            coordinatorAdjustment: 0,
            separateMode: false
        };
    }

    // Clean and process worker data
    const cleanedWorkers = cleanWorkerData(workers);
    if (cleanedWorkers.length === 0) {
        console.error('No valid workers after cleaning');
        return {
            isValid: false,
            errors: ['No valid workers found'],
            totalHours: 0,
            hourlyRate: 0,
            totalWorkerPayouts: 0,
            lionsFinalTotal: 0,
            workerPayouts: [],
            lionsPercent: 0,
            coachesPercent: 0,
            coordinatorPercent: 0,
            availableForWorkers: 0,
            roundingAmount: 0,
            lionsShirtCosts: 0,
            coordinatorAdjustment: 0,
            separateMode: false
        };
    }

    const separateMode = shiftData?.separateStandsMode || false;
    const combineDoubleShifts = options.combineDoubleShifts || false;
    const workerLookupFn = options.workerLookupFn || null;

    // Process workers based on system needs
    const processedWorkers = getWorkersForCalculation(cleanedWorkers, combineDoubleShifts);

    let rawResults;
    if (!separateMode) {
        rawResults = calculateCombinedPayouts(sodexoAmount, processedWorkers, workerLookupFn);
    } else {
        const primaryStand = shiftData.primaryStand || shiftData.standNumber;
        const secondaryStand = shiftData.secondaryStand;
        const primarySodexo = shiftData.primarySodexoPayout || 0;
        const secondarySodexo = shiftData.secondarySodexoPayout || 0;

        rawResults = calculateSeparatePayouts(processedWorkers, primaryStand, secondaryStand,
            primarySodexo, secondarySodexo, workerLookupFn);
    }

    // Add validation success flag
    rawResults.isValid = true;
    rawResults.errors = [];

    // Add formatted properties to results
    return addFormattedProperties(rawResults, options);
}

/**
 * Calculate payouts in combined mode (all workers share total Sodexo)
 * @param {number} sodexoAmount - Total Sodexo payment
 * @param {Array} workers - Array of worker objects
 * @param {Function} workerLookupFn - Optional worker lookup function
 * @returns {Object} - Calculation results
 */
function calculateCombinedPayouts(sodexoAmount, workers, workerLookupFn = null) {
    const result = {
        totalHours: 0,
        hourlyRate: 0,
        lionsPercent: 0,
        coachesPercent: 0,
        coordinatorPercent: 0,
        availableForWorkers: 0,
        workerPayouts: [],
        totalWorkerPayouts: 0,
        workerShirtContributions: 0,
        shirtsNeeded: 0,
        lionsShirtCosts: 0,
        roundingAmount: 0,
        lionsFinalTotal: 0,
        coordinatorAdjustment: 0,
        separateMode: false
    };

    if (!sodexoAmount || !workers || workers.length === 0) {
        return result;
    }

    // Calculate total hours
    result.totalHours = workers.reduce((total, worker) => {
        const hours = worker.hours || calculateHours(worker.startTime, worker.endTime);
        return total + hours;
    }, 0);

    if (result.totalHours === 0) return result;

    // Calculate organizational percentages
    result.lionsPercent = sodexoAmount * 0.02;
    result.coachesPercent = sodexoAmount * 0.015;
    result.coordinatorPercent = sodexoAmount * 0.015;

    // Available amount for workers
    result.availableForWorkers = sodexoAmount - result.lionsPercent - result.coachesPercent - result.coordinatorPercent;

    // Calculate hourly rate (round down for workers)
    const preciseHourlyRate = result.availableForWorkers / result.totalHours;
    result.hourlyRate = Math.floor(preciseHourlyRate * 100) / 100;

    // Calculate individual worker payouts with round-down for workers
    let totalFlooredPayouts = 0;
    let totalPrecisePayouts = 0;

    result.workerPayouts = workers.map(worker => {
        const hours = worker.hours || calculateHours(worker.startTime, worker.endTime);

        // Calculate using floored hourly rate (what workers actually get paid)
        const flooredGrossAmount = Math.floor(hours * result.hourlyRate * 100) / 100;

        // Calculate theoretical amount with precise hourly rate (for rounding calculation)
        const preciseGrossAmount = hours * preciseHourlyRate;

        // FIXED: Use enhanced shirt deduction with better error handling
        const shirtDeduction = getWorkerShirtDeduction(worker, workerLookupFn);
        const netAmount = Math.max(0, flooredGrossAmount - shirtDeduction);

        // Track totals for rounding calculation
        totalFlooredPayouts += flooredGrossAmount;
        totalPrecisePayouts += preciseGrossAmount;
        result.totalWorkerPayouts += flooredGrossAmount;

        if (shirtDeduction > 0) {
            result.workerShirtContributions += shirtDeduction;
            result.shirtsNeeded += 1;
            result.lionsShirtCosts += shirtDeduction;
        }

        return {
            name: worker.name,
            stand: worker.stand || 'N/A',
            hours: hours,
            grossAmount: flooredGrossAmount,
            shirtDeduction: shirtDeduction,
            netAmount: netAmount,
            hasLOSShirt: shirtDeduction === 0,
            theoreticalAmount: preciseGrossAmount,
            isDoubleShift: worker.isDoubleShift || false,
            shiftsWorked: worker.shiftsWorked || 1
        };
    });

    // Calculate rounding overflow - difference goes to Lions
    result.roundingAmount = Math.round((totalPrecisePayouts - totalFlooredPayouts) * 100) / 100;

    // Calculate preliminary Lions total
    const preliminaryLionsTotal = result.lionsPercent + result.roundingAmount - result.lionsShirtCosts;

    // Handle negative Lions total by adjusting Coordinator amount
    if (preliminaryLionsTotal < 0) {
        const deficit = Math.abs(preliminaryLionsTotal);
        result.coordinatorAdjustment = Math.min(deficit, result.coordinatorPercent);
        result.coordinatorPercent = Math.max(0, result.coordinatorPercent - result.coordinatorAdjustment);
        result.lionsFinalTotal = preliminaryLionsTotal + result.coordinatorAdjustment;
        result.lionsFinalTotal = Math.max(0, result.lionsFinalTotal);
    } else {
        result.lionsFinalTotal = preliminaryLionsTotal;
        result.coordinatorAdjustment = 0;
    }

    return result;
}

/**
 * Calculate payouts in separate mode (each stand calculated independently)
 * @param {Array} workers - Array of worker objects
 * @param {string} primaryStand - Primary stand identifier
 * @param {string} secondaryStand - Secondary stand identifier
 * @param {number} primarySodexo - Primary stand Sodexo amount
 * @param {number} secondarySodexo - Secondary stand Sodexo amount
 * @param {Function} workerLookupFn - Optional worker lookup function
 * @returns {Object} - Calculation results
 */
function calculateSeparatePayouts(workers, primaryStand, secondaryStand, primarySodexo, secondarySodexo, workerLookupFn = null) {
    const result = {
        totalHours: 0,
        hourlyRate: 0,
        lionsPercent: 0,
        coachesPercent: 0,
        coordinatorPercent: 0,
        availableForWorkers: 0,
        workerPayouts: [],
        totalWorkerPayouts: 0,
        workerShirtContributions: 0,
        shirtsNeeded: 0,
        lionsShirtCosts: 0,
        roundingAmount: 0,
        lionsFinalTotal: 0,
        coordinatorAdjustment: 0,
        separateMode: true,
        standBreakdowns: []
    };

    // Group workers by actual stand
    const standGroups = {};

    workers.forEach(worker => {
        const standKey = worker.stand || 'unknown';
        if (!standGroups[standKey]) {
            standGroups[standKey] = [];
        }
        standGroups[standKey].push(worker);
    });

    let totalPrecisePayouts = 0;
    let totalFlooredPayouts = 0;

    // Calculate for each stand group separately
    Object.entries(standGroups).forEach(([standKey, standWorkers]) => {
        // Determine which Sodexo amount to use for this stand
        let standSodexoAmount = 0;
        if (standKey === primaryStand && primarySodexo > 0) {
            standSodexoAmount = primarySodexo;
        } else if (standKey === secondaryStand && secondarySodexo > 0) {
            standSodexoAmount = secondarySodexo;
        } else {
            console.log(`Stand ${standKey} not matched to primary or secondary, skipping`);
            return;
        }

        if (standSodexoAmount <= 0) return;

        // Calculate total hours for this stand
        const standHours = standWorkers.reduce((total, worker) => {
            const hours = worker.hours || calculateHours(worker.startTime, worker.endTime);
            return total + hours;
        }, 0);

        if (standHours === 0) return;

        // Calculate organizational percentages for this stand
        const standLionsPercent = standSodexoAmount * 0.02;
        const standCoachesPercent = standSodexoAmount * 0.015;
        const standCoordinatorPercent = standSodexoAmount * 0.015;
        const standAvailableForWorkers = standSodexoAmount - standLionsPercent - standCoachesPercent - standCoordinatorPercent;

        // Calculate hourly rate for this stand (round down for workers)
        const standPreciseHourlyRate = standAvailableForWorkers / standHours;
        const standFlooredHourlyRate = Math.floor(standPreciseHourlyRate * 100) / 100;

        // Track totals across all stands
        result.totalHours += standHours;
        result.lionsPercent += standLionsPercent;
        result.coachesPercent += standCoachesPercent;
        result.coordinatorPercent += standCoordinatorPercent;
        result.availableForWorkers += standAvailableForWorkers;

        let standTotalPrecise = 0;
        let standTotalFloored = 0;
        let standShirtCosts = 0;
        const standPayouts = [];

        // Calculate individual payouts for this stand
        standWorkers.forEach(worker => {
            const hours = worker.hours || calculateHours(worker.startTime, worker.endTime);

            // Calculate using floored hourly rate
            const flooredGrossAmount = Math.floor(hours * standFlooredHourlyRate * 100) / 100;

            // Calculate theoretical amount with precise hourly rate
            const preciseGrossAmount = hours * standPreciseHourlyRate;

            // FIXED: Use enhanced shirt deduction with better error handling
            const shirtDeduction = getWorkerShirtDeduction(worker, workerLookupFn);
            const netAmount = Math.max(0, flooredGrossAmount - shirtDeduction);

            standTotalPrecise += preciseGrossAmount;
            standTotalFloored += flooredGrossAmount;
            result.totalWorkerPayouts += flooredGrossAmount;

            if (shirtDeduction > 0) {
                result.workerShirtContributions += shirtDeduction;
                result.shirtsNeeded += 1;
                result.lionsShirtCosts += shirtDeduction;
                standShirtCosts += shirtDeduction;
            }

            const workerPayout = {
                name: worker.name,
                stand: worker.stand || standKey,
                hours: hours,
                grossAmount: flooredGrossAmount,
                shirtDeduction: shirtDeduction,
                netAmount: netAmount,
                hasLOSShirt: shirtDeduction === 0,
                theoreticalAmount: preciseGrossAmount,
                standGroup: standKey,
                isDoubleShift: worker.isDoubleShift || false,
                shiftsWorked: worker.shiftsWorked || 1
            };

            standPayouts.push(workerPayout);
            result.workerPayouts.push(workerPayout);
        });

        // Add to global totals for rounding calculation
        totalPrecisePayouts += standTotalPrecise;
        totalFlooredPayouts += standTotalFloored;

        // Store breakdown for display
        result.standBreakdowns.push({
            standName: standKey,
            sodexoAmount: standSodexoAmount,
            hours: standHours,
            hourlyRate: standFlooredHourlyRate,
            lionsPercent: standLionsPercent,
            roundingAmount: Math.round((standTotalPrecise - standTotalFloored) * 100) / 100,
            shirtCosts: standShirtCosts,
            workerCount: standWorkers.length,
            payouts: standPayouts
        });
    });

    // Calculate weighted average hourly rate across all stands
    result.hourlyRate = result.totalHours > 0 ? result.totalWorkerPayouts / result.totalHours : 0;

    // Calculate rounding overflow - difference goes to Lions
    result.roundingAmount = Math.round((totalPrecisePayouts - totalFlooredPayouts) * 100) / 100;

    // Calculate preliminary Lions total
    const preliminaryLionsTotal = result.lionsPercent + result.roundingAmount - result.lionsShirtCosts;

    // Handle negative Lions total by adjusting Coordinator amount
    if (preliminaryLionsTotal < 0) {
        const deficit = Math.abs(preliminaryLionsTotal);
        result.coordinatorAdjustment = Math.min(deficit, result.coordinatorPercent);
        result.coordinatorPercent = Math.max(0, result.coordinatorPercent - result.coordinatorAdjustment);
        result.lionsFinalTotal = preliminaryLionsTotal + result.coordinatorAdjustment;
        result.lionsFinalTotal = Math.max(0, result.lionsFinalTotal);
    } else {
        result.lionsFinalTotal = preliminaryLionsTotal;
        result.coordinatorAdjustment = 0;
    }

    return result;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseTime,
        calculateHours,
        formatTime,
        formatCurrency,
        formatHours,
        formatDate,
        validateCalculationInputs,
        cleanWorkerData,
        processDoubleShifts,
        getWorkersForCalculation,
        getWorkerCrNumber,
        getWorkerShirtDeduction,
        getConsistentShirtStatus,
        addFormattedProperties,
        generateWorkerTotals,
        generatePayrollSummary,
        calculatePayouts,
        calculateCombinedPayouts,
        calculateSeparatePayouts
    };
} else {
    window.LionsCalculations = {
        parseTime,
        calculateHours,
        formatTime,
        formatCurrency,
        formatHours,
        formatDate,
        validateCalculationInputs,
        cleanWorkerData,
        processDoubleShifts,
        getWorkersForCalculation,
        getWorkerCrNumber,
        getWorkerShirtDeduction,
        getConsistentShirtStatus,
        addFormattedProperties,
        generateWorkerTotals,
        generatePayrollSummary,
        calculatePayouts,
        calculateCombinedPayouts,
        calculateSeparatePayouts
    };
}

const LIBRARY_VERSION = '3.0.3';
const LIBRARY_UPDATED = 'September 2025 - FIXED: Enhanced Error Handling for Worker Lookup Functions';

console.log(`Lions Calculations Library v${LIBRARY_VERSION} loaded (${LIBRARY_UPDATED})`);