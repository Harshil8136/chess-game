// ===================================================================================
//  ENGINE.JS
//  Manages the creation and configuration of Stockfish Web Worker instances.
// ===================================================================================

/**
 * Applies a set of UCI options to a Stockfish worker instance.
 * @param {Worker} worker - The Stockfish Web Worker.
 * @param {object} options - An object containing UCI options, e.g., { Threads: 4, Hash: 512 }.
 */
function configureEngine(worker, options = {}) {
    if (!worker) return;

    console.log({ logType: 'info', text: `Configuring engine with options: ${JSON.stringify(options)}` });

    for (const name in options) {
        if (Object.prototype.hasOwnProperty.call(options, name)) {
            const value = options[name];
            worker.postMessage(`setoption name ${name} value ${value}`);
        }
    }
}

/**
 * Creates a new Stockfish worker instance from the configured URL.
 * @returns {Promise<Worker>} A promise that resolves with the initialized Stockfish worker.
 */
function createStockfishWorker() {
    return new Promise((resolve, reject) => {
        fetch(APP_CONFIG.STOCKFISH_URL)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch Stockfish: ${response.status} ${response.statusText}`);
                }
                return response.text();
            })
            .then(text => {
                try {
                    const worker = new Worker(URL.createObjectURL(new Blob([text], { type: 'application/javascript' })));
                    
                    worker.postMessage('uci');
                    worker.postMessage('isready');
                    
                    let isReady = false;
                    const readyTimeout = setTimeout(() => {
                        if (!isReady) {
                            worker.terminate();
                            reject(new Error('Stockfish worker timed out during initialization.'));
                        }
                    }, 5000); // 5-second timeout for initialization

                    worker.onmessage = (event) => {
                        if (event.data === 'readyok') {
                            isReady = true;
                            clearTimeout(readyTimeout);
                            worker.onmessage = null; // Clear this initial handler
                            console.log({ logType: 'info', text: 'Stockfish worker is ready.' });
                            resolve(worker);
                        }
                    };

                    worker.onerror = (error) => {
                        console.error('Stockfish Worker Error:', error);
                        reject(new Error('Stockfish worker encountered an error.'));
                    };

                } catch (workerError) {
                    console.error('Failed to create Stockfish worker:', workerError);
                    reject(workerError);
                }
            })
            .catch(error => {
                console.error('Failed to load Stockfish script:', error);
                reject(error);
            });
    });
}