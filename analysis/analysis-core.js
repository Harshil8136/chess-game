// ===================================================================================
//  ANALYSIS-CORE.JS
//  Defines the main AnalysisController and its core data/logic.
// ===================================================================================

window.AnalysisController = {
    moveListElement: null,
    evalChartCanvas: null,
    assessmentDetailsElement: null,
    assessmentTitleElement: null,
    assessmentCommentElement: null,
    analysisBoard: null,
    analysisBoardElement: null,
    boardWrapper: null,
    reviewSummaryContainer: null,
    whiteAccuracyElement: null,
    blackAccuracyElement: null,
    moveCountsContainer: null,
    retryMistakeBtn: null,
    bestLineDisplay: null,
    bestLineMoves: null,
    analysisBoardSvgOverlay: null,
    visualizerBoard: null,
    visualizerBoardWrapper: null,
    visualizerStatusElement: null,
    visualizerMoveNumberElement: null,
    visualizerMovePlayedElement: null,
    visualizerMoveAssessmentElement: null,
    visualizerProgressBar: null,
    stockfish: null, 
    analysisGame: new Chess(),
    gameHistory: [],
    reviewData: [],
    evalChart: null,
    currentMoveIndex: -1,
    isAnalyzing: false,
    isDeepAnalyzing: false,
    accuracy: { w: 0, b: 0 },
    moveCounts: { w: {}, b: {} },
    cpl: { w: [], b: [] },
    userShapes: [],
    isDrawing: false,
    drawStartSquare: null,

    CLASSIFICATION_DATA: {
        'Brilliant': { title: 'Brilliant', comment: 'A great sacrifice or the only good move in a critical position!', color: 'classification-color-brilliant', bgColor: 'classification-bg-brilliant', icon: '!!' },
        'Great': { title: 'Great Move', comment: 'Finds the only good move in a complex position.', color: 'classification-color-great', bgColor: 'classification-bg-great', icon: '!' },
        'Best': { title: 'Best Move', comment: 'The strongest move, according to the engine.', color: 'classification-color-best', bgColor: 'classification-bg-best', icon: '★' },
        'Excellent': { title: 'Excellent', comment: 'A strong move that maintains the position\'s potential.', color: 'classification-color-excellent', bgColor: 'classification-bg-excellent', icon: '✓' },
        'Good': { title: 'Good', comment: 'A solid, decent move.', color: 'classification-color-good', bgColor: 'classification-bg-good', icon: '👍' },
        'Book': { title: 'Book Move', comment: 'A standard opening move from theory.', color: 'classification-color-book', bgColor: 'classification-bg-book', icon: '📖' },
        'Inaccuracy': { title: 'Inaccuracy', comment: 'This move weakens your position slightly.', color: 'classification-color-inaccuracy', bgColor: 'classification-bg-inaccuracy', icon: '?!' },
        'Mistake': { title: 'Mistake', comment: 'A significant error that damages your position.', color: 'classification-color-mistake', bgColor: 'classification-bg-mistake', icon: '?' },
        'Blunder': { title: 'Blunder', comment: 'A very bad move that could lead to losing the game.', color: 'classification-color-blunder', bgColor: 'classification-bg-blunder', icon: '??' },
        'Miss': { title: 'Missed Opportunity', comment: 'Your opponent made a mistake, but you missed the best punishment.', color: 'classification-color-miss', bgColor: 'classification-bg-miss', icon: '...' }
    },
    DEEP_ANALYSIS_MOVETIME: 3000, 

    normalizeEvalForCpl: function(score) {
        const MATE_THRESHOLD = 9500;
        const CPL_CAP = 1500;
        if (Math.abs(score) > MATE_THRESHOLD) {
            return score > 0 ? CPL_CAP : -CPL_CAP;
        }
        return Math.max(-CPL_CAP, Math.min(CPL_CAP, score));
    },

    classifyMove: function(params) {
        const cpl = params.cpl;
        const opponentCpl = params.opponentCpl;
        const evalBefore = params.evalBefore;
        const hadMate = params.hadMate;
        const foundMate = params.foundMate;
        const bestMoveAdvantage = params.bestMoveAdvantage;
        const pgn = params.pgn;

        const moveNumber = pgn.split(' ').filter(p => p.includes('.')).length;
        if (moveNumber <= 10 && OPENINGS.some(o => pgn.trim().startsWith(o.pgn))) return 'Book';
        if (foundMate && !hadMate) return 'Brilliant';
        if (foundMate) return 'Best';
        if (hadMate && !foundMate) return 'Blunder';

        const isOpponentBlunder = opponentCpl >= 300;
        const isResponseAMistake = cpl >= 120;
        const isOverwhelmingAdvantage = Math.abs(evalBefore) > 800;
        if (isOpponentBlunder && isResponseAMistake && !isOverwhelmingAdvantage) return 'Miss';
        
        const isOnlyGoodMove = bestMoveAdvantage > 250;
        if (cpl < 15 && isOnlyGoodMove) {
            const isSacrifice = false; 
            return isSacrifice ? 'Brilliant' : 'Great';
        }

        if (cpl >= 300) return 'Blunder';
        if (cpl >= 120) return 'Mistake';
        if (cpl >= 50) return 'Inaccuracy';
        if (cpl < 10) return 'Best';
        if (cpl < 30) return 'Excellent';
        return 'Good';
    },

    init: function() {
        Logger.info('AnalysisController: Initializing with dedicated engine...');
        const gameData = window.gameDataToAnalyze;
        if (!gameData || !gameData.stockfish || !gameData.pgn) {
            this.showError("Game data is missing or incomplete for analysis.");
            return;
        }

        try {
            this.isAnalyzing = true; 
            this.stockfish = gameData.stockfish;
            
            this.analysisGame = new Chess();
            this.analysisGame.load_pgn(gameData.pgn);
            this.gameHistory = this.analysisGame.history({ verbose: true });
            this.reviewData = [];
            this.currentMoveIndex = -1;
            this.userShapes = [];
            this.isDrawing = false;
            this.drawStartSquare = null;
            this.accuracy = { w: 0, b: 0 };
            this.cpl = { w: [], b: [] };
            this.moveCounts = { w: {}, b: {} };
            for (const key in this.CLASSIFICATION_DATA) {
                if (Object.prototype.hasOwnProperty.call(this.CLASSIFICATION_DATA, key)) {
                    this.moveCounts.w[key] = 0;
                    this.moveCounts.b[key] = 0;
                }
            }

            this.populateUIReferences();
            this.initializeVisualizerBoard();
            this.runGameReview();
            
        } catch (error) {
            Logger.error('AnalysisController: Error during initialization', error);
            this.showError("Failed to initialize analysis system.");
            this.isAnalyzing = false;
        }
    },

    showError: function(message) {
        Logger.error('Analysis Error', new Error(message));
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Analysis Error', text: message, icon: 'error', confirmButtonText: 'Return to Game'
            }).then(() => {
                if (typeof switchToMainGame === 'function') switchToMainGame();
                else $('#return-to-game-btn').click();
            });
        } else {
            alert('Analysis Error: ' + message);
        }
    },

    stop: function() {
        Logger.info('AnalysisController: Stopping analysis...');
        this.isAnalyzing = false;
        
        if (this.stockfish) { 
            this.stockfish.terminate();
            this.stockfish = null;
            analysisStockfish = null;
        }
        
        if (this.evalChart) { try { this.evalChart.destroy(); this.evalChart = null; } catch (e) { Logger.warn('Minor error destroying eval chart.', e); } }
        if (this.visualizerBoard) { try { this.visualizerBoard.destroy(); this.visualizerBoard = null; } catch(e) { Logger.warn('Minor error destroying visualizer board.', e); }}
        if (this.analysisBoard) { try { this.analysisBoard.destroy(); this.analysisBoard = null; } catch(e) { Logger.warn('Minor error destroying analysis board.', e); }}
        if(this.reviewSummaryContainer) this.reviewSummaryContainer.addClass('hidden');
        if(this.assessmentDetailsElement) this.assessmentDetailsElement.addClass('hidden');
        
        $(document).off('keydown.analysis');
        $(document).off('mouseup.analysis_draw');

        this.clearUserShapes();
        this.reviewData = [];
        this.currentMoveIndex = -1;
    },

    runGameReview: async function() {
        if (this.gameHistory.length === 0) {
            this.showError("No moves to analyze.");
            return;
        }
        
        try {
            let tempGame = new Chess();
            let opponentCpl = 0;

            for (let i = 0; i < this.gameHistory.length && this.isAnalyzing; i++) {
                const move = this.gameHistory[i];
                const progressPercent = ((i + 1) / this.gameHistory.length) * 100;

                this.visualizerStatusElement.text(`Deep analyzing move ${i + 1} of ${this.gameHistory.length}...`);
                this.visualizerProgressBar.css('width', `${progressPercent}%`);
                this.visualizerBoard.position(tempGame.fen());
                
                const positionEval = await this.getStaticEvaluation(tempGame.fen(), { movetime: this.DEEP_ANALYSIS_MOVETIME, multiPV: 2 });
                const evalOfBestMove = positionEval.best;
                const bestMoveAdvantage = Math.abs(positionEval.best - positionEval.second);
                
                const playedMoveUci = `${move.from}${move.to}${move.promotion || ''}`;
                const evalOfPlayedMove = await this.getEvaluationForSpecificMove(tempGame.fen(), playedMoveUci, { movetime: this.DEEP_ANALYSIS_MOVETIME });
                
                const evalForPlayer = (move.color === 'w') ? 1 : -1;
                const cpl = Math.max(0, this.normalizeEvalForCpl(evalOfBestMove * evalForPlayer) - this.normalizeEvalForCpl(evalOfPlayedMove * evalForPlayer));

                const classification = this.classifyMove({
                    cpl: cpl,
                    opponentCpl: opponentCpl,
                    evalBefore: evalOfBestMove * evalForPlayer,
                    hadMate: Math.abs(evalOfBestMove) > 9500,
                    foundMate: Math.abs(evalOfPlayedMove) > 9500,
                    bestMoveAdvantage: bestMoveAdvantage,
                    pgn: tempGame.pgn() + ` ${i % 2 === 0 ? (i/2)+1 + '.' : ''} ${move.san}`
                });

                this.visualizerMoveNumberElement.text(`${Math.floor(i / 2) + 1}${move.color === 'w' ? '.' : '...'}`);
                this.visualizerMovePlayedElement.text(move.san);
                const classificationInfo = this.CLASSIFICATION_DATA[classification];
                this.visualizerMoveAssessmentElement.text(classificationInfo.title).attr('class', `font-bold ${classificationInfo.color}`);
                
                tempGame.move(move);

                this.reviewData.push({
                    move: move.san,
                    score: evalOfPlayedMove,
                    classification: classification,
                    bestLineUci: positionEval.best_pv,
                    cpl: cpl
                });

                opponentCpl = cpl;
            }

            if (this.isAnalyzing) {
                this.recalculateStats();
                if (typeof switchToAnalysisRoom === 'function') switchToAnalysisRoom();
                else throw new Error('switchToAnalysisRoom function not found.');
                this.initializeBoard();
                this.setupEventHandlers();
                this.renderFinalReview();
            }
        } catch (error) {
            this.showError(`Analysis failed during move review. Error: ${error.message}`);
            Logger.error('Analysis failed during review loop', error);
        } finally {
            this.isAnalyzing = false;
        }
    },
    
    runDeepAnalysis: async function(moveIndex) {
        Logger.info("Deep analysis per move is now integrated into the main review.");
        this.showMoveAssessmentDetails(moveIndex);
    },

    getStaticEvaluation: function(fen, options = {}) {
        const movetime = options.movetime || 3000;
        const multiPV = options.multiPV || 1;
        
        return new Promise((resolve) => {
            if (!this.stockfish) return resolve({ best: 0, second: 0, best_pv: '' });
            
            let scores = {}; let best_pv = ''; let bestMoveFound = false;

            const timeout = setTimeout(() => {
                if (!bestMoveFound) {
                    this.stockfish.onmessage = null; 
                    resolve({ best: scores[1] || 0, second: scores[2] || 0, best_pv });
                }
            }, movetime + 5000);

            const onMessage = (event) => {
                if (!this.isAnalyzing && !this.isDeepAnalyzing) {
                    clearTimeout(timeout);
                    this.stockfish.onmessage = null;
                    return resolve({ best: 0, second: 0, best_pv: '' });
                }
                const message = event.data;
                const pvMatch = message.match(/multipv (\d+) .* pv (.+)/);
                if (pvMatch) {
                    const pvIndex = parseInt(pvMatch[1]);
                    const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
                    if (scoreMatch) {
                        let score = parseInt(scoreMatch[2]);
                        if (scoreMatch[1] === 'mate') score = (score > 0 ? 1 : -1) * APP_CONFIG.MATE_SCORE;
                        scores[pvIndex] = score;
                    }
                    if (pvIndex === 1) best_pv = pvMatch[2];
                }
                if (message.startsWith('bestmove')) {
                    bestMoveFound = true;
                    clearTimeout(timeout);
                    this.stockfish.onmessage = null; 
                    try { this.stockfish.postMessage('setoption name MultiPV value 1'); } catch(e) { Logger.warn('Minor error resetting MultiPV.', e); }
                    resolve({ best: scores[1] || 0, second: scores[2] || scores[1] || 0, best_pv });
                }
            };
            
            try {
                this.stockfish.onmessage = onMessage;
                this.stockfish.postMessage(`setoption name MultiPV value ${multiPV}`);
                this.stockfish.postMessage(`position fen ${fen}`);
                this.stockfish.postMessage(`go movetime ${movetime}`);
            } catch (error) {
                Logger.error('Failed to send command to analysis engine.', error);
                clearTimeout(timeout);
                resolve({ best: 0, second: 0, best_pv: '' });
            }
        });
    },

    getEvaluationForSpecificMove: function(fen, moveUci, options = {}) {
        const movetime = options.movetime || 1000;

        return new Promise((resolve) => {
            if (!this.stockfish) return resolve(0);
            
            let finalScore = 0;
            let moveFound = false;

            const timeout = setTimeout(() => {
                if (!moveFound) {
                    this.stockfish.onmessage = null;
                    resolve(finalScore);
                }
            }, movetime + 5000);
            
            const onMessage = (event) => {
                if (!this.isAnalyzing) {
                    clearTimeout(timeout);
                    this.stockfish.onmessage = null;
                    return resolve(0);
                }
                const message = event.data;
                if (message.includes(moveUci)) {
                    const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
                    if (scoreMatch) {
                        let score = parseInt(scoreMatch[2]);
                        if (scoreMatch[1] === 'mate') score = (score > 0 ? 1 : -1) * APP_CONFIG.MATE_SCORE;
                        finalScore = score;
                    }
                }
                if (message.startsWith('bestmove')) {
                    moveFound = true;
                    clearTimeout(timeout);
                    this.stockfish.onmessage = null;
                    resolve(finalScore);
                }
            };

            try {
                this.stockfish.onmessage = onMessage;
                this.stockfish.postMessage(`position fen ${fen}`);
                this.stockfish.postMessage(`go movetime ${movetime} searchmoves ${moveUci}`);
            } catch(e) {
                Logger.error('Failed to get evaluation for specific move.', e);
                clearTimeout(timeout);
                resolve(0);
            }
        });
    },
    
    recalculateStats: function() {
        this.cpl = { w: [], b: [] };
        this.moveCounts = { w: {}, b: {} };
        for (const key in this.CLASSIFICATION_DATA) {
            if (Object.prototype.hasOwnProperty.call(this.CLASSIFICATION_DATA, key)) {
                this.moveCounts.w[key] = 0;
                this.moveCounts.b[key] = 0;
            }
        }

        this.reviewData.forEach((data, index) => {
            const player = this.gameHistory[index].color;
            if (data.cpl >= 0) {
                this.cpl[player].push(data.cpl);
            }
            if (this.moveCounts[player] && data.classification in this.moveCounts[player]) {
                this.moveCounts[player][data.classification]++;
            }
        });

        this.calculateAccuracy();
    },
    
    calculateAccuracy: function() {
        const calculate = (cpl_array) => {
            if (cpl_array.length === 0) return 100;
            const avg_cpl = cpl_array.reduce((a, b) => a + b, 0) / cpl_array.length;
            return Math.max(0, Math.min(100, Math.round(103.16 * Math.exp(-0.04354 * avg_cpl))));
        };
        this.accuracy.w = calculate(this.cpl.w);
        this.accuracy.b = calculate(this.cpl.b);
    },
    
    uciToSanLine: function(fen, uciLine) {
        try {
            const tempGame = new Chess(fen);
            const moves = uciLine.split(' ');
            let sanMoves = [];
            for (let i = 0; i < Math.min(moves.length, 5); i++) {
                const move = tempGame.move(moves[i], { sloppy: true });
                if (move) sanMoves.push(move.san); else break;
            }
            return sanMoves.join(' ');
        } catch(e) {
            Logger.warn('Could not convert UCI line to SAN.', { fen: fen, uci: uciLine });
            return uciLine;
        }
    },
};