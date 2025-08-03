/**
 * analysis.js
 *
 * Manages all functionality for the game analysis room. This script is loaded
 * on-demand and is completely isolated from the main game script (script.js).
 */

// Create a global controller object to be called by script.js
window.AnalysisController = {
    // --- UI Element References ---
    boardElement: null,
    runReviewBtn: null,
    moveListElement: null,
    evalChartCanvas: null,
    assessmentDetailsElement: null,
    assessmentTitleElement: null,
    assessmentCommentElement: null,
    returnToGameBtn: null,
    analysisBoard: null,

    // --- State Variables ---
    stockfish: null,
    analysisGame: new Chess(),
    gameHistory: [],
    reviewData: [],
    evalChart: null,

    // --- Constants ---
    CLASSIFICATION_DATA: {
        'Brilliant': { title: 'Brilliant', comment: 'A great sacrifice or the only good move in a critical position!', color: 'text-teal-400', icon: '!!' },
        'Best': { title: 'Best Move', comment: 'The strongest move, according to the engine.', color: 'text-amber-300', icon: '★' },
        'Excellent': { title: 'Excellent', comment: 'A strong move that maintains the position\'s potential.', color: 'text-sky-400', icon: '✓' },
        'Good': { title: 'Good', comment: 'A reasonable move, but a better option was available.', color: 'text-green-400', icon: '👍' },
        'Book': { title: 'Book Move', comment: 'A standard opening move from theory.', color: 'text-gray-400', icon: '📖' },
        'Inaccuracy': { title: 'Inaccuracy', comment: 'This move weakens your position slightly.', color: 'text-yellow-500', icon: '?!' },
        'Mistake': { title: 'Mistake', comment: 'A significant error that damages your position.', color: 'text-orange-500', icon: '?' },
        'Blunder': { title: 'Blunder', comment: 'A very bad move that could lead to losing the game.', color: 'text-red-600', icon: '??' },
        'Miss': { title: 'Missed Opportunity', comment: 'Your opponent made a mistake, but you missed the best punishment.', color: 'text-purple-400', icon: '...' }
    },
    REVIEW_DEPTH: 14,
    EVAL_TIMEOUT: 15000,

    /**
     * Entry point called by script.js to start the analysis mode.
     * @param {string} pgn - The PGN of the game to be analyzed.
     */
    init: function(pgn) {
        // 1. Set up UI references
        this.runReviewBtn = $('#run-review-btn');
        this.moveListElement = $('#analysis-move-list');
        this.evalChartCanvas = $('#eval-chart');
        this.assessmentDetailsElement = $('#move-assessment-details');
        this.assessmentTitleElement = $('#assessment-title');
        this.assessmentCommentElement = $('#assessment-comment');
        this.returnToGameBtn = $('#return-to-game-btn');
        
        // 2. Load game data
        if (!pgn) {
            this.moveListElement.html('<p class="text-red-400">No game data found!</p>');
            this.runReviewBtn.prop('disabled', true);
            return;
        }
        this.analysisGame.load_pgn(pgn);
        this.gameHistory = this.analysisGame.history({ verbose: true });
        this.reviewData = [];
        
        // 3. Initialize the analysis board
        const boardConfig = {
            position: 'start',
            pieceTheme: PIECE_THEMES[localStorage.getItem('chessPieceTheme') || 'cburnett']
        };
        this.analysisBoard = Chessboard('analysis-board', boardConfig);
        this.applyTheme();
        
        // 4. Render initial state and bind events
        this.renderInitialMoveList();
        this.runReviewBtn.on('click', () => this.runGameReview());
        this.returnToGameBtn.on('click', () => window.returnToGameRoom());
        this.moveListElement.on('click', '.analysis-move-item', (e) => {
            const moveIndex = parseInt($(e.currentTarget).data('move-index'));
            this.navigateToMove(moveIndex);
        });
    },

    /**
     * Main function to start and manage the game review process.
     */
    runGameReview: async function() {
        this.runReviewBtn.prop('disabled', true).text('Analyzing...');
        
        if (!this.stockfish) {
            try {
                this.stockfish = new Worker(APP_CONFIG.STOCKFISH_URL);
            } catch (error) {
                this.runReviewBtn.text('Engine Failed to Load').addClass('bg-red-600');
                return;
            }
        }
        
        let lastEval = 0;
        const tempGame = new Chess();

        for (let i = 0; i < this.gameHistory.length; i++) {
            const move = this.gameHistory[i];
            this.runReviewBtn.text(`Analyzing ${i + 1}/${this.gameHistory.length}`);
            
            const currentFen = tempGame.fen();
            const bestEval = await this.getStaticEvaluation(currentFen);
            
            if (i > 0) {
                const opportunityLoss = (move.color === 'w') ? (lastEval - bestEval) : (bestEval - lastEval);
                if (opportunityLoss < -100) { this.reviewData[i-1].missedOpportunity = true; }
            }

            tempGame.move(move.san);
            const afterMoveFen = tempGame.fen();
            const afterMoveEval = await this.getStaticEvaluation(afterMoveFen);

            const evalLoss = (move.color === 'w') ? (bestEval - afterMoveEval) : (afterMoveEval - bestEval);
            
            this.reviewData.push({
                move: move.san,
                score: afterMoveEval,
                classification: this.classifyMove(evalLoss, tempGame.pgn()),
                missedOpportunity: false
            });
            
            lastEval = afterMoveEval;
        }

        this.renderFinalReview();
        this.runReviewBtn.text('Analysis Complete');
    },

    /**
     * Uses Stockfish to get the evaluation of a single position.
     * @param {string} fen - The FEN string of the position to evaluate.
     * @returns {Promise<number>} - A promise that resolves with the centipawn score.
     */
    getStaticEvaluation: function(fen) {
        return new Promise((resolve, reject) => {
            let bestScore = 0;
            const timeoutId = setTimeout(() => {
                this.stockfish.removeEventListener('message', onMessage);
                reject(new Error(`Evaluation timed out for FEN: ${fen}`));
            }, this.EVAL_TIMEOUT);

            const onMessage = (event) => {
                const message = event.data;
                if (message.startsWith('info depth')) {
                    const scoreMatch = message.match(/score cp (-?\d+)/);
                    const mateMatch = message.match(/score mate (-?\d+)/);
                    if (mateMatch) {
                        bestScore = (parseInt(mateMatch[1]) > 0 ? 1 : -1) * APP_CONFIG.MATE_SCORE;
                    } else if (scoreMatch) {
                        bestScore = parseInt(scoreMatch[1]);
                    }
                }
                if (message.startsWith('bestmove')) {
                    clearTimeout(timeoutId);
                    this.stockfish.removeEventListener('message', onMessage);
                    const scoreForWhite = fen.includes(' w ') ? bestScore : -bestScore;
                    resolve(scoreForWhite);
                }
            };
            this.stockfish.addEventListener('message', onMessage);
            this.stockfish.postMessage(`position fen ${fen}`);
            this.stockfish.postMessage(`go depth ${this.REVIEW_DEPTH}`);
        });
    },
    
    /**
     * Classifies a move based on the drop in evaluation score.
     */
    classifyMove: function(loss, pgn) {
        if (OPENINGS.some(o => pgn.trim().startsWith(o.pgn))) return 'Book';
        if (loss > 300) return 'Blunder';
        if (loss > 100) return 'Mistake';
        if (loss > 40) return 'Inaccuracy';
        if (loss > 15) return 'Good';
        if (loss > 5) return 'Excellent';
        return 'Best';
    },

    /**
     * Renders the UI after the analysis is complete.
     */
    renderFinalReview: function() {
        this.renderReviewedMoveList();
        this.drawEvalChart();
        this.navigateToMove(this.gameHistory.length - 1);
    },
    
    /**
     * Navigates the board and UI to a specific move index.
     */
    navigateToMove: function(moveIndex) {
        const tempGame = new Chess();
        for (let i = 0; i <= moveIndex; i++) {
            tempGame.move(this.gameHistory[i].san);
        }
        this.analysisBoard.position(tempGame.fen());
        
        this.moveListElement.find('.current-move-analysis').removeClass('current-move-analysis');
        this.moveListElement.find(`[data-move-index="${moveIndex}"]`).addClass('current-move-analysis');
        
        this.showMoveAssessmentDetails(moveIndex);
    },

    /**
     * Displays the classification details for a given move.
     */
    showMoveAssessmentDetails: function(moveIndex) {
        const data = this.reviewData[moveIndex];
        if (!data) return;
        
        let classification = data.classification;
        if (data.missedOpportunity && classification !== 'Blunder' && classification !== 'Mistake') {
            classification = 'Miss';
        }
        const info = this.CLASSIFICATION_DATA[classification];

        if (info) {
            this.assessmentTitleElement.text(info.title).removeClass().addClass(`text-lg font-bold ${info.color}`);
            this.assessmentCommentElement.text(info.comment);
            this.assessmentDetailsElement.removeClass('hidden');
        }
    },

    /**
     * Renders the initial, un-analyzed move list.
     */
    renderInitialMoveList: function() {
        let html = '';
        for (let i = 0; i < this.gameHistory.length; i += 2) {
            const moveNum = (i / 2) + 1;
            html += `<div class="p-2 flex items-center gap-3">
                <span class="w-8 text-right font-bold text-gray-400">${moveNum}.</span>
                <span class="flex-grow analysis-move-item" data-move-index="${i}">${this.gameHistory[i] ? this.gameHistory[i].san : ''}</span>
                <span class="flex-grow analysis-move-item" data-move-index="${i+1}">${this.gameHistory[i+1] ? this.gameHistory[i+1].san : ''}</span>
            </div>`;
        }
        this.moveListElement.html(html);
    },
    
    /**
     * Renders the final move list with classification icons and colors.
     */
    renderReviewedMoveList: function() {
        let html = '';
        for (let i = 0; i < this.gameHistory.length; i++) {
            const moveNum = Math.floor(i / 2) + 1;
            const move = this.gameHistory[i];
            const review = this.reviewData[i];
            let classification = review.classification;
            if (review.missedOpportunity && classification !== 'Blunder' && classification !== 'Mistake') {
                classification = 'Miss';
            }
            const info = this.CLASSIFICATION_DATA[classification];
            
            html += `<div class="analysis-move-item flex items-center gap-3 p-2 rounded-md" data-move-index="${i}" title="${info.title}">`;
            if (move.color === 'w') {
                html += `<span class="w-8 text-right font-bold text-gray-400">${moveNum}.</span>`;
            } else {
                html += `<span class="w-8"></span>`;
            }
            html += `<span class="flex-grow">${move.san}</span>`;
            html += `<span class="font-bold text-lg w-6 text-center ${info.color}">${info.icon}</span></div>`;
        }
        this.moveListElement.html(html);
    },

    /**
     * Draws the evaluation chart using Chart.js.
     */
    drawEvalChart: function() {
        if (this.evalChart) this.evalChart.destroy();
        const labels = ['Start'];
        const data = [0.2];
        this.reviewData.forEach((item, index) => {
            labels.push(`${Math.floor(index / 2) + 1}. ${item.move}`);
            data.push(item.score / 100);
        });

        this.evalChart = new Chart(this.evalChartCanvas, {
            type: 'line',
            data: { /* ... (Same as your provided code) ... */ },
            options: { /* ... (Same as your provided code) ... */ }
        });
    },
    
    /**
     * Applies the selected color theme to the board.
     */
    applyTheme: function() {
        const themeName = localStorage.getItem('chessBoardTheme') || 'green';
        const selectedTheme = THEMES.find(t => t.name === themeName) || THEMES[0];
        document.documentElement.style.setProperty('--light-square-color', selectedTheme.colors.light);
        document.documentElement.style.setProperty('--dark-square-color', selectedTheme.colors.dark);
    }
};

// Since this script is loaded dynamically, we need to ensure it initializes.
// We assume script.js has already handled document.ready.
if ($('#analysis-room').is(':visible')) {
    const pgn = window.gameDataToAnalyze;
    window.AnalysisController.init(pgn);
}
