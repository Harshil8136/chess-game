/**
 * analysis.js
 *
 * Manages all functionality for the post-game analysis room.
 */

window.AnalysisController = {
    // --- UI Element References ---
    moveListElement: null,
    evalChartCanvas: null,
    assessmentDetailsElement: null,
    assessmentTitleElement: null,
    assessmentCommentElement: null,
    analysisBoard: null,
    analysisBoardElement: null, // **NEW**: jQuery reference to the board element
    boardWrapper: null,
    reviewSummaryContainer: null,
    whiteAccuracyElement: null,
    blackAccuracyElement: null,
    moveCountsContainer: null,
    retryMistakeBtn: null,
    bestLineDisplay: null,
    bestLineMoves: null,
    analysisBoardSvgOverlay: null,

    // --- State Variables ---
    stockfish: null,
    analysisGame: new Chess(),
    gameHistory: [],
    reviewData: [],
    evalChart: null,
    currentMoveIndex: -1,
    isAnalyzing: false,
    accuracy: { w: 0, b: 0 },
    moveCounts: { w: {}, b: {} },
    cpl: { w: [], b: [] },

    // --- Constants ---
    CLASSIFICATION_DATA: {
        'Brilliant': { title: 'Brilliant', comment: 'A great sacrifice or the only good move in a critical position!', color: 'text-teal-400', icon: '!!' },
        'Great': { title: 'Great Move', comment: 'Finds the only good move in a complex position.', color: 'text-sky-300', icon: '!' },
        'Best': { title: 'Best Move', comment: 'The strongest move, according to the engine.', color: 'text-amber-300', icon: '★' },
        'Excellent': { title: 'Excellent', comment: 'A strong move that maintains the position\'s potential.', color: 'text-sky-400', icon: '✓' },
        'Good': { title: 'Good', comment: 'A solid, decent move.', color: 'text-green-400', icon: '👍' },
        'Book': { title: 'Book Move', comment: 'A standard opening move from theory.', color: 'text-gray-400', icon: '📖' },
        'Inaccuracy': { title: 'Inaccuracy', comment: 'This move weakens your position slightly.', color: 'text-yellow-500', icon: '?!' },
        'Mistake': { title: 'Mistake', comment: 'A significant error that damages your position.', color: 'text-orange-500', icon: '?' },
        'Blunder': { title: 'Blunder', comment: 'A very bad move that could lead to losing the game.', color: 'text-red-600', icon: '??' },
        'Miss': { title: 'Missed Opportunity', comment: 'Your opponent made a mistake, but you missed the best punishment.', color: 'text-purple-400', icon: '...' }
    },
    REVIEW_DEPTH: 14,

    /**
     * Entry point called by script.js to start the analysis mode.
     */
    init: function() {
        console.log('AnalysisController: Initializing...');
        
        const gameData = window.gameDataToAnalyze;
        if (!gameData || !gameData.stockfish || !gameData.pgn) {
            this.showError("Game data is missing or incomplete for analysis.");
            return;
        }

        try {
            this.stockfish = gameData.stockfish;
            this.analysisGame = new Chess();
            this.analysisGame.load_pgn(gameData.pgn);
            this.gameHistory = this.analysisGame.history({ verbose: true });
            this.reviewData = [];
            this.currentMoveIndex = -1;
            this.isAnalyzing = false;

            this.accuracy = { w: 0, b: 0 };
            this.cpl = { w: [], b: [] };
            this.moveCounts = { w: {}, b: {} };
            for (const key in this.CLASSIFICATION_DATA) {
                this.moveCounts.w[key] = 0;
                this.moveCounts.b[key] = 0;
            }

            this.moveListElement = $('#ar-analysis-move-list');
            this.evalChartCanvas = $('#ar-eval-chart');
            this.assessmentDetailsElement = $('#ar-move-assessment-details');
            this.assessmentTitleElement = $('#ar-assessment-title');
            this.assessmentCommentElement = $('#ar-assessment-comment');
            this.boardWrapper = $('#analysis-room .board-wrapper');
            this.reviewSummaryContainer = $('#review-summary-container');
            this.whiteAccuracyElement = $('#ar-white-accuracy');
            this.blackAccuracyElement = $('#ar-black-accuracy');
            this.moveCountsContainer = $('#ar-move-counts');
            this.retryMistakeBtn = $('#ar-retry-mistake-btn');
            this.bestLineDisplay = $('#ar-best-line-display');
            this.bestLineMoves = $('#ar-best-line-moves');
            this.analysisBoardSvgOverlay = $('#analysis-board-svg-overlay');
            this.analysisBoardElement = $('#analysis-board'); // **NEW**: Reference to the board div
            
            this.initializeBoard();
            this.setupEventHandlers();
            this.runGameReview();
            
        } catch (error) {
            console.error('AnalysisController: Error during initialization:', error);
            this.showError("Failed to initialize analysis system.");
        }
    },

    initializeBoard: function() {
        try {
            const boardConfig = {
                position: 'start',
                pieceTheme: PIECE_THEMES[localStorage.getItem('chessPieceTheme') || 'cburnett'],
                draggable: false,
                showNotation: false
            };
            if (this.analysisBoard && typeof this.analysisBoard.destroy === 'function') {
                this.analysisBoard.destroy();
            }
            this.analysisBoard = Chessboard('analysis-board', boardConfig);
            this.applyTheme();
            this.renderCoordinates();
        } catch (error) {
            console.error('AnalysisController: Error initializing board:', error);
            this.showError("Failed to initialize analysis board.");
        }
    },
    
    setupEventHandlers: function() {
        this.moveListElement.off('click').on('click', '.analysis-move-item', (e) => {
            const moveIndex = parseInt($(e.currentTarget).data('move-index'));
            if (!isNaN(moveIndex) && moveIndex >= 0 && moveIndex < this.gameHistory.length) {
                this.navigateToMove(moveIndex);
            }
        });

        this.retryMistakeBtn.off('click').on('click', () => {
            if (this.currentMoveIndex < 0) return;
            const tempGame = new Chess();
            for (let i = 0; i < this.currentMoveIndex; i++) {
                tempGame.move(this.gameHistory[i].san);
            }
            const fen = tempGame.fen();
            window.loadFenOnReturn = fen;
            switchToMainGame();
        });
    },

    showError: function(message) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Analysis Error',
                text: message,
                icon: 'error',
                confirmButtonText: 'Return to Game'
            }).then(() => {
                if (typeof switchToMainGame === 'function') {
                    switchToMainGame();
                } else {
                    $('#return-to-game-btn').click();
                }
            });
        } else {
            alert('Analysis Error: ' + message);
        }
    },

    stop: function() {
        console.log('AnalysisController: Stopping analysis...');
        this.isAnalyzing = false;
        if (this.stockfish) { try { this.stockfish.postMessage('stop'); } catch (e) { console.warn(e); } }
        if (this.evalChart) { try { this.evalChart.destroy(); this.evalChart = null; } catch (e) { console.warn(e); } }
        if(this.reviewSummaryContainer) this.reviewSummaryContainer.addClass('hidden');
        if(this.assessmentDetailsElement) this.assessmentDetailsElement.addClass('hidden');
        this.clearArrows();
        this.reviewData = [];
        this.currentMoveIndex = -1;
    },

    runGameReview: async function() {
        if (this.gameHistory.length === 0) {
            this.showError("No moves to analyze.");
            return;
        }
        this.isAnalyzing = true;
        const progressIndicator = $('<div class="text-center p-4 bg-blue-700 text-white rounded-lg mb-4">Starting Analysis...</div>');
        this.reviewSummaryContainer.parent().prepend(progressIndicator);
        
        try {
            this.moveListElement.html('<div class="text-center text-gray-400 p-4">Analyzing moves...</div>');
            let tempGame = new Chess();

            for (let i = 0; i < this.gameHistory.length && this.isAnalyzing; i++) {
                const move = this.gameHistory[i];
                progressIndicator.text(`Analyzing move ${i + 1} of ${this.gameHistory.length}...`);
                
                const positionEval = await this.getStaticEvaluation(tempGame.fen());
                tempGame.move(move.san);
                const evalAfterMove = await this.getStaticEvaluation(tempGame.fen());
                
                const previousEval = (move.color === 'w') ? positionEval.best : -positionEval.best;
                const currentEval = (move.color === 'w') ? evalAfterMove.best : -evalAfterMove.best;
                const evalLoss = previousEval - currentEval;
                
                const classification = this.classifyMove(evalLoss, tempGame.pgn());
                const player = move.color;
                if (this.moveCounts[player] && classification in this.moveCounts[player]) {
                    this.moveCounts[player][classification]++;
                }
                if (evalLoss > 0) {
                    this.cpl[player].push(Math.min(evalLoss, 350));
                }

                this.reviewData.push({
                    move: move.san,
                    score: currentEval,
                    classification: classification,
                    bestLineUci: positionEval.best_pv
                });
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            if (this.isAnalyzing) {
                try {
                    console.log("Analysis loop finished. Calculating stats and rendering final review...");
                    this.calculateAccuracy();
                    this.renderReviewSummary();
                    this.renderFinalReview();
                    console.log("Analysis review rendered successfully.");
                } catch (e) {
                    console.error("An error occurred during the final analysis rendering step:", e);
                    this.showError(`Analysis failed during final rendering. Error: ${e.message}`);
                } finally {
                    progressIndicator.remove();
                }
            }
        } catch (error) {
            console.error('AnalysisController: Error during analysis loop:', error);
            this.showError(`Analysis failed during move review. Error: ${error.message}`);
            progressIndicator.remove();
        } finally {
            this.isAnalyzing = false;
        }
    },

    getStaticEvaluation: function(fen) {
        return new Promise((resolve) => {
            if (!this.stockfish || !this.isAnalyzing) {
                return resolve({ best: 0, second: 0, best_pv: '' });
            }
            
            let scores = {};
            let best_pv = '';
            let bestMoveFound = false;

            const timeout = setTimeout(() => {
                if (!bestMoveFound) {
                    console.warn(`Stockfish timeout on FEN: ${fen}`);
                    this.stockfish.removeEventListener('message', onMessage);
                    resolve({ best: scores[1] || 0, second: scores[2] || 0, best_pv });
                }
            }, 5000);

            const onMessage = (event) => {
                if (!this.isAnalyzing) {
                    clearTimeout(timeout);
                    this.stockfish.removeEventListener('message', onMessage);
                    return resolve({ best: 0, second: 0, best_pv: '' });
                }
                const message = event.data;
                const pvMatch = message.match(/multipv (\d+) .* pv (.+)/);
                if (pvMatch) {
                    const pvIndex = parseInt(pvMatch[1]);
                    const scoreMatch = message.match(/score cp (-?\d+)/);
                    if (scoreMatch) scores[pvIndex] = parseInt(scoreMatch[1]);
                    if (pvIndex === 1) best_pv = pvMatch[2];
                }
                if (message.startsWith('bestmove')) {
                    bestMoveFound = true;
                    clearTimeout(timeout);
                    this.stockfish.removeEventListener('message', onMessage);
                    try { this.stockfish.postMessage('setoption name MultiPV value 1'); } catch(e) { console.warn(e); }
                    resolve({ best: scores[1] || 0, second: scores[2] || 0, best_pv });
                }
            };

            try {
                this.stockfish.addEventListener('message', onMessage);
                this.stockfish.postMessage('setoption name MultiPV value 2');
                this.stockfish.postMessage(`position fen ${fen}`);
                this.stockfish.postMessage(`go depth ${this.REVIEW_DEPTH}`);
            } catch (error) {
                clearTimeout(timeout);
                console.error('Error sending commands to stockfish:', error);
                resolve({ best: 0, second: 0, best_pv: '' });
            }
        });
    },
    
    classifyMove: function(loss, pgn) {
        if (OPENINGS && OPENINGS.some && OPENINGS.some(o => pgn.trim().startsWith(o.pgn))) return 'Book';
        if (loss > 300) return 'Blunder';
        if (loss > 120) return 'Mistake';
        if (loss > 50) return 'Inaccuracy';
        if (loss < -200) return 'Miss';
        if (loss < 10) return 'Best';
        if (loss < 30) return 'Excellent';
        return 'Good';
    },

    calculateAccuracy: function() {
        const calculate = (cpl_array) => {
            if (cpl_array.length === 0) return 100;
            const avg_cpl = cpl_array.reduce((a, b) => a + b, 0) / cpl_array.length;
            return Math.round(103.16 * Math.exp(-0.04354 * avg_cpl));
        };
        this.accuracy.w = calculate(this.cpl.w);
        this.accuracy.b = calculate(this.cpl.b);
    },

    renderReviewSummary: function() {
        this.whiteAccuracyElement.text(this.accuracy.w + '%');
        this.blackAccuracyElement.text(this.accuracy.b + '%');
        let countsHtml = '';
        const displayOrder = ['Brilliant', 'Great', 'Best', 'Blunder', 'Mistake', 'Inaccuracy', 'Miss'];
        displayOrder.forEach(key => {
            const w_count = this.moveCounts.w[key] || 0;
            const b_count = this.moveCounts.b[key] || 0;
            if (w_count > 0 || b_count > 0) {
                const info = this.CLASSIFICATION_DATA[key];
                countsHtml += `
                    <div class="text-right">${w_count}</div>
                    <div class="text-center font-bold ${info.color}" title="${info.title}">${info.icon} ${key}</div>
                    <div class="text-left">${b_count}</div>`;
            }
        });
        this.moveCountsContainer.html(countsHtml);
        this.reviewSummaryContainer.removeClass('hidden');
    },

    renderFinalReview: function() {
        this.renderReviewedMoveList();
        this.drawEvalChart();
        this.navigateToMove(this.gameHistory.length - 1);
    },
    
    navigateToMove: function(moveIndex) {
        if (moveIndex < 0 || moveIndex >= this.gameHistory.length) return;
        this.currentMoveIndex = moveIndex;
        const tempGame = new Chess();
        for (let i = 0; i <= moveIndex; i++) tempGame.move(this.gameHistory[i].san);
        if (this.analysisBoard) this.analysisBoard.position(tempGame.fen());
        
        this.moveListElement.find('.current-move-analysis').removeClass('current-move-analysis');
        this.moveListElement.find(`[data-move-index="${moveIndex}"]`).addClass('current-move-analysis');
        
        this.clearArrows();
        const data = this.reviewData[moveIndex];
        const move = this.gameHistory[moveIndex];
        if (data && move) {
            this.drawArrow(move.from, move.to, 'rgba(59, 130, 246, 0.7)'); // Blue for played move
            if (data.bestLineUci) {
                const bestMoveUci = data.bestLineUci.split(' ')[0];
                const from = bestMoveUci.substring(0, 2);
                const to = bestMoveUci.substring(2, 4);
                if (from !== move.from || to !== move.to) {
                    this.drawArrow(from, to, 'rgba(42, 122, 42, 0.7)'); // Green for best move
                }
            }
        }
        
        this.showMoveAssessmentDetails(moveIndex);
    },

    showMoveAssessmentDetails: function(moveIndex) {
        const data = this.reviewData[moveIndex];
        if (!data) return;
        const info = this.CLASSIFICATION_DATA[data.classification];
        if (info) {
            this.assessmentTitleElement.text(info.title).attr('class', `text-lg font-bold ${info.color}`);
            this.assessmentCommentElement.text(info.comment);
            this.assessmentDetailsElement.removeClass('hidden');
            const isBadMove = data.classification === 'Mistake' || data.classification === 'Blunder';
            this.retryMistakeBtn.toggleClass('hidden', !isBadMove);
            if (data.bestLineUci) {
                const tempGame = new Chess();
                for(let i=0; i < moveIndex; i++) tempGame.move(this.gameHistory[i].san);
                const sanLine = this.uciToSanLine(tempGame.fen(), data.bestLineUci);
                this.bestLineMoves.text(sanLine);
                this.bestLineDisplay.removeClass('hidden');
            } else {
                this.bestLineDisplay.addClass('hidden');
            }
        }
    },
    
    uciToSanLine: function(fen, uciLine) {
        try {
            const tempGame = new Chess(fen);
            const moves = uciLine.split(' ');
            let sanMoves = [];
            for (let i = 0; i < Math.min(moves.length, 5); i++) {
                const move = tempGame.move(moves[i], { sloppy: true });
                if (move) sanMoves.push(move.san);
                else break;
            }
            return sanMoves.join(' ');
        } catch(e) {
            console.error("Failed to convert UCI line to SAN:", e);
            return uciLine;
        }
    },
    
    renderReviewedMoveList: function() {
        if (!this.moveListElement) return;
        let html = '';
        for (let i = 0; i < this.gameHistory.length; i++) {
            const moveNum = Math.floor(i / 2) + 1;
            const move = this.gameHistory[i];
            const review = this.reviewData[i];
            if (!review) continue;
            const info = this.CLASSIFICATION_DATA[review.classification];
            html += `<div class="analysis-move-item flex items-center gap-3" data-move-index="${i}" title="${info.title}">`;
            if (move.color === 'w') {
                html += `<span class="w-8 text-right font-bold text-dark">${moveNum}.</span>`;
            } else {
                html += `<span class="w-8"></span>`;
            }
            html += `<span class="flex-grow font-mono">${move.san}</span>`;
            html += `<span class="font-bold text-lg w-6 text-center ${info.color}">${info.icon}</span>`;
            html += `</div>`;
        }
        this.moveListElement.html(html);
    },

    drawEvalChart: function() {
        if (!this.evalChartCanvas || !this.evalChartCanvas.length) return;
        try {
            if (this.evalChart) this.evalChart.destroy();
            const labels = ['Start'];
            const data = [20];
            this.reviewData.forEach((item, index) => {
                const moveNum = Math.floor(index / 2) + 1;
                const isWhite = index % 2 === 0;
                labels.push(`${moveNum}${isWhite ? '.' : '...'} ${item.move}`);
                data.push(item.score);
            });
            const ctx = this.evalChartCanvas[0].getContext('2d');
            this.evalChart = new Chart(ctx, {
                type: 'line',
                data: { labels, datasets: [{
                    label: 'Position Evaluation', data,
                    borderColor: 'rgba(59, 130, 246, 0.8)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true, borderWidth: 2, pointRadius: 2,
                    pointHoverRadius: 4, tension: 0.1
                }]},
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                        y: { 
                            suggestedMin: -500, suggestedMax: 500,
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            ticks: { color: 'var(--text-dark)', callback: (v) => (v / 100).toFixed(1) }
                        },
                        x: { display: false }
                    },
                    plugins: { 
                        legend: { display: false },
                        tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(0,0,0,0.8)', titleColor: 'white', bodyColor: 'white' }
                    },
                    interaction: { mode: 'index', intersect: false }
                }
            });
        } catch (error) {
            console.error('Error creating evaluation chart:', error);
        }
    },
    
    applyTheme: function() {
        try {
            const themeName = localStorage.getItem('chessBoardTheme') || 'green';
            const selectedTheme = THEMES && THEMES.find ? THEMES.find(t => t.name === themeName) : null;
            if (selectedTheme) {
                document.documentElement.style.setProperty('--light-square-color', selectedTheme.colors.light);
                document.documentElement.style.setProperty('--dark-square-color', selectedTheme.colors.dark);
            }
        } catch (error) {
            console.warn('Error applying theme:', error);
        }
    },

    renderCoordinates: function() {
        if (!this.boardWrapper || !this.boardWrapper.length) return;
        try {
            const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
            const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
            const filesHtml = files.map(f => `<span>${f}</span>`).join('');
            const ranksHtml = ranks.map(r => `<span>${r}</span>`).join('');
            this.boardWrapper.find('#analysis-top-files').html(filesHtml);
            this.boardWrapper.find('#analysis-bottom-files').html(filesHtml);
            this.boardWrapper.find('#analysis-left-ranks').html(ranksHtml);
            this.boardWrapper.find('#analysis-right-ranks').html(ranksHtml);
        } catch (error) {
            console.warn('Error rendering coordinates:', error);
        }
    },

    /** MODIFIED **/
    // This drawArrow function is corrected to prevent the error.
    clearArrows: function() {
        if (this.analysisBoardSvgOverlay) {
            this.analysisBoardSvgOverlay.empty();
        }
    },

    drawArrow: function(from, to, color = 'rgba(42, 122, 42, 0.7)') {
        if (!this.analysisBoardSvgOverlay || !this.analysisBoard) return;
        
        // **FIX**: Correctly get the board width from the jQuery element, not the board instance.
        const boardWidth = this.analysisBoardElement.width();
        const squareSize = boardWidth / 8;
        const isFlipped = this.analysisBoard.orientation() === 'black';

        const getCoords = (square) => {
            let col = square.charCodeAt(0) - 'a'.charCodeAt(0);
            let row = parseInt(square.charAt(1)) - 1;
            if (isFlipped) {
                col = 7 - col;
                row = 7 - row;
            }
            return {
                x: col * squareSize + squareSize / 2,
                y: (7 - row) * squareSize + squareSize / 2
            };
        };

        const fromCoords = getCoords(from);
        const toCoords = getCoords(to);

        const markerId = `arrowhead-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
        if (!this.analysisBoardSvgOverlay.find(`#${markerId}`).length) {
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', markerId);
            marker.setAttribute('viewBox', '0 0 10 10');
            marker.setAttribute('refX', '5');
            marker.setAttribute('refY', '5');
            marker.setAttribute('markerWidth', '3.5');
            marker.setAttribute('markerHeight', '3.5');
            marker.setAttribute('orient', 'auto-start-reverse');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
            path.style.fill = color;
            marker.appendChild(path);
            this.analysisBoardSvgOverlay.append(marker);
        }

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', fromCoords.x);
        line.setAttribute('y1', fromCoords.y);
        line.setAttribute('x2', toCoords.x);
        line.setAttribute('y2', toCoords.y);
        line.style.stroke = color;
        line.style.strokeWidth = '14px';
        line.setAttribute('marker-end', `url(#${markerId})`);
        
        this.analysisBoardSvgOverlay.append(line);
    }
};
