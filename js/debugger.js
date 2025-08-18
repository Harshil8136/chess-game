// ===================================================================================
//  DEBUGGER.JS
//  Centralized error handling and logging service for the application.
// ===================================================================================

/**
 * A centralized Logger service to standardize all console messages.
 * This integrates with the on-screen log box defined in ui-interactions.js.
 */
window.Logger = {
    /**
     * Logs an informational message.
     * @param {string} message - The primary log message.
     * @param {object} [data] - Optional data object to provide more context.
     */
    info: function(message, data) {
        this._log('info', message, data);
    },

    /**
     * Logs a warning message.
     * @param {string} message - The warning message.
     * @param {object} [data] - Optional data object.
     */
    warn: function(message, data) {
        this._log('warn', message, data);
    },

    /**
     * Logs an error message, including details from an Error object.
     * @param {string} message - A descriptive title for the error.
     * @param {Error|object} error - The error object or a context object.
     */
    error: function(message, error) {
        const data = {
            message: error.message,
            stack: error.stack ? error.stack.split('\n').map(s => s.trim()).join('\n') : 'Not available'
        };
        // Add other properties from the error object if they exist
        for (const key in error) {
            if (key !== 'message' && key !== 'stack') {
                data[key] = error[key];
            }
        }
        this._log('error', `${message}: ${error.message || 'No message'}`, data);
    },

    /**
     * Logs a message from the chess engine.
     * @param {string} message - The engine message.
     * @param {object} [data] - Optional data like evaluation or best move.
     */
    engine: function(message, data) {
        this._log('engine_move', message, data);
    },
    
    /**
     * Logs a message from the analysis process.
     * @param {string} message - The analysis message.
     * @param {object} [data] - Optional data.
     */
    analysis: function(message, data) {
        this._log('analysis', message, data);
    },

    /**
     * Internal log function that formats the message and sends it to the console.
     * The console.log function is wrapped in ui-interactions.js to display in the UI.
     * @private
     */
    _log: function(type, text, data = {}) {
        const logObject = {
            logType: type,
            text: text,
            ...data
        };
        
        switch (type) {
            case 'error':
                console.error(logObject);
                break;
            case 'warn':
                console.warn(logObject);
                break;
            default:
                console.log(logObject);
        }
    }
};

/**
 * Global Uncaught Error Handler.
 * This function will automatically catch any JavaScript errors that are not
 * handled by a try...catch block anywhere in the application.
 * This makes the application more robust and provides excellent debugging for future features.
 */
window.onerror = function(message, source, lineno, colno, error) {
    Logger.error('An uncaught error occurred', {
        message: message,
        source: source.split('/').pop(), // Get just the filename
        line: lineno,
        column: colno,
        stack: error ? error.stack : 'Stack trace not available.'
    });

    // Prevent the default browser error handling (e.g., stopping script execution)
    return true;
};