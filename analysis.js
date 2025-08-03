/**
 * analysis.js
 *
 * Manages all functionality for the game analysis room, including engine
 * interaction, move evaluation, game review, and interactive visualization.
 * This script is completely isolated from script.js.
 */

$(document).ready(function() {
    // --- UI Element References ---
    const boardElement = $('#board');
    const runReviewBtn = $('#run-review-btn');
    const moveListElement = $('#analysis-move-list');
    const evalChartCanvas = $('#eval-chart');
    const assessmentDetailsElement = $('#move-assessment-details');
    const assessmentTitleElement = $('#assessment-title');
    const assessmentCommentElement = $('#assessment-comment');

    // --- State Variables ---
    let board = null;
    let stockfish = null;
    let analysisGame = new Chess();
    let gameHistory = [];
    let reviewData = [];
    let evalChart = null;

    // --- Constants ---
    const CLASSIFICATION_DATA = {
        'Brilliant': { title: 'Brilliant', comment: 'A great sacrifice or the only good move in a critical position!', color: 'text-teal-400', icon: '!!' },
        'Best': { title: 'Best Move', comment: 'The strongest move, according to the engine.', color: 'text-amber-300', icon: '★' },
        'Excellent': { title: 'Excellent', comment: 'A strong move that maintains the position\'s potential.', color: 'text-sky-400', icon: '✓' },
        'Good': { title: 'Good', comment: 'A reasonable move, but a better option was available.', color: 'text-green-400', icon: '👍' },
        'Book': { title: 'Book Move', comment: 'A standard opening move from theory.', color: 'text-gray-400', icon: '📖' },
        'Inaccuracy': { title: 'Inaccuracy', comment: 'This move weakens your position slightly.', color: 'text-yellow-500', icon: '?!' },
        'Mistake': { title: 'Mistake', comment: 'A significant error that damages your position.', color: 'text-orange-500', icon: '?' },
        'Blunder': { title: 'Blunder', comment: 'A very bad move that could lead to losing the game.', color: 'text-red-600', icon: '??' },
        'Miss': { title: 'Missed Opportunity', comment: 'Your opponent made a mistake, but you missed the best punishment.', color: 'text-purple-400', icon: '...' }
    };
    const REVIEW_DEPTH = 14; // How deep the engine thinks for each move
    const EVAL_TIMEOUT = 10000; // Max time per move in milliseconds

    /**
     * Initializes the analysis page.
     */
    function init() {
        const pgn = localStorage.getItem('gameToAnalyze');
        if (!pgn) {
            moveListElement.html('<p class="text-red-400">No game data found. Go back and play a game first!</p>');
            runReviewBtn.prop('disabled', true);
            return;
        }

        analysisGame.load_pgn(pgn);
        gameHistory = analysisGame.history({ verbose: true });
        
        const boardConfig = {
            position: 'start',
            pieceTheme: PIECE_THEMES[localStorage.getItem('chessPieceTheme') || 'cburnett']
        };
        board = Chessboard('board', boardConfig);
        applyTheme();
        renderInitialMoveList();
        
        runReviewBtn.on('click', runGameReview);
        moveListElement.on('click', '.analysis-move-item', handleMoveClick);
    }

    /**
     * Main function to start and manage the game review process.
     */
    async function runGameReview() {
        runReviewBtn.prop('disabled', true).text('Analyzing...');
        
        // Safely load Stockfish in a Web Worker
        if (!stockfish) {
            try {
                stockfish = new Worker(APP_CONFIG.STOCKFISH_URL);
            } catch (error) {
                runReviewBtn.text('Engine Failed to Load').addClass('bg-red-600');
                return;
            }
        }
        
        let lastEval = 0; // Evaluation of the position before the current move
        const tempGame = new Chess();

        for (let i = 0; i < gameHistory.length; i++) {
            const move = gameHistory[i];
            runReviewBtn.text(`Analyzing ${i + 1}/${gameHistory.length}`);
            
            const currentFen = tempGame.fen();
            const bestEval = await getStaticEvaluation(currentFen);
            
            // Check if a mistake was made by the previous player
            if (i > 0) {
                const opportunityLoss = (move.color === 'w') ? (lastEval - bestEval) : (bestEval - lastEval);
                if (opportunityLoss < -100) { // Opponent blundered (>1 pawn swing)
                    reviewData[i-1].missedOpportunity = true;
                }
            }

            tempGame.move(move.san);
            const afterMoveFen = tempGame.fen();
            const afterMoveEval = await getStaticEvaluation(afterMoveFen);

            const evalLoss = (move.color === 'w') ? (bestEval - afterMoveEval) : (afterMoveEval - bestEval);
            
            reviewData.push({
                move: move.san,
                score: afterMoveEval,
                classification: classifyMove(evalLoss, tempGame.pgn()),
                missedOpportunity: false
            });
            
            lastEval = afterMoveEval;
        }

        renderFinalReview();
        runReviewBtn.text('Analysis Complete');
    }

    /**
     * Uses Stockfish to get the evaluation of a single position.
     * @param {string} fen - The FEN string of the position to evaluate.
     * @returns {Promise<number>} - A promise that resolves with the centipawn score.
     */
    function getStaticEvaluation(fen) {
        return new Promise((resolve, reject) => {
            let bestScore = 0;
            const timeoutId = setTimeout(() => {
                stockfish.removeEventListener('message', onMessage);
                reject(new Error(`Evaluation timed out for FEN: ${fen}`));
            }, EVAL_TIMEOUT);

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
                    stockfish.removeEventListener('message', onMessage);
                    const scoreForWhite = fen.includes(' w ') ? bestScore : -bestScore;
                    resolve(scoreForWhite);
                }
            };
            stockfish.addEventListener('message', onMessage);
            stockfish.postMessage(`position fen ${fen}`);
            stockfish.postMessage(`go depth ${REVIEW_DEPTH}`);
        });
    }
    
    /**
     * Classifies a move based on the drop in evaluation score.
     * @param {number} loss - The change in centipawns from the player's perspective.
     * @param {string} pgn - The PGN of the game up to the current move.
     * @returns {string} - The classification key (e.g., 'Blunder', 'Best').
     */
    function classifyMove(loss, pgn) {
        if (OPENINGS.some(o => pgn.trim().startsWith(o.pgn))) return 'Book';
        if (loss > 300) return 'Blunder';
        if (loss > 100) return 'Mistake';
        if (loss > 40) return 'Inaccuracy';
        if (loss > 15) return 'Good';
        if (loss > 5) return 'Excellent';
        return 'Best';
    }

    /**
     * Renders the UI after the analysis is complete.
     */
    function renderFinalReview() {
        renderReviewedMoveList();
        drawEvalChart();
        navigateToMove(gameHistory.length - 1); // Go to the last move
    }

    /**
     * Handles clicking on a move in the analysis list.
     */
    function handleMoveClick(event) {
        const moveIndex = parseInt($(event.currentTarget).data('move-index'));
        navigateToMove(moveIndex);
    }
    
    /**
     * Navigates the board and UI to a specific move index.
     * @param {number} moveIndex - The index of the move in the history array.
     */
    function navigateToMove(moveIndex) {
        const tempGame = new Chess();
        for (let i = 0; i <= moveIndex; i++) {
            tempGame.move(gameHistory[i].san);
        }
        board.position(tempGame.fen());
        
        moveListElement.find('.current-move-analysis').removeClass('current-move-analysis');
        moveListElement.find(`[data-move-index="${moveIndex}"]`).addClass('current-move-analysis');
        
        showMoveAssessmentDetails(moveIndex);
    }

    /**
     * Displays the classification details for a given move.
     * @param {number} moveIndex - The index of the move.
     */
    function showMoveAssessmentDetails(moveIndex) {
        const data = reviewData[moveIndex];
        if (!data) return;
        
        let classification = data.classification;
        if (data.missedOpportunity && classification !== 'Blunder' && classification !== 'Mistake') {
            classification = 'Miss';
        }
        const info = CLASSIFICATION_DATA[classification];

        if (info) {
            assessmentTitleElement.text(info.title).removeClass().addClass(`text-lg font-bold ${info.color}`);
            assessmentCommentElement.text(info.comment);
            assessmentDetailsElement.removeClass('hidden');
        }
    }

    /**
     * Renders the initial, un-analyzed move list.
     */
    function renderInitialMoveList() {
        let html = '';
        for (let i = 0; i < gameHistory.length; i += 2) {
            const moveNum = (i / 2) + 1;
            html += `<div class="p-2 flex items-center gap-3">
                <span class="w-8 text-right font-bold text-gray-400">${moveNum}.</span>
                <span class="flex-grow">${gameHistory[i] ? gameHistory[i].san : ''}</span>
                <span class="flex-grow">${gameHistory[i+1] ? gameHistory[i+1].san : ''}</span>
            </div>`;
        }
        moveListElement.html(html);
    }
    
    /**
     * Renders the final move list with classification icons and colors.
     */
    function renderReviewedMoveList() {
        let html = '';
        for (let i = 0; i < gameHistory.length; i++) {
            const moveNum = Math.floor(i / 2) + 1;
            const move = gameHistory[i];
            const review = reviewData[i];
            let classification = review.classification;
            if (review.missedOpportunity && classification !== 'Blunder' && classification !== 'Mistake') {
                classification = 'Miss';
            }
            const info = CLASSIFICATION_DATA[classification];
            
            html += `<div class="analysis-move-item flex items-center gap-3 p-2 rounded-md" data-move-index="${i}" title="${info.title}">`;
            if (move.color === 'w') {
                html += `<span class="w-8 text-right font-bold text-gray-400">${moveNum}.</span>`;
            } else {
                html += `<span class="w-8"></span>`;
            }
            html += `<span class="flex-grow">${move.san}</span>`;
            html += `<span class="font-bold text-lg w-6 text-center ${info.color}">${info.icon}</span></div>`;
        }
        moveListElement.html(html);
    }

    /**
     * Draws the evaluation chart using Chart.js.
     */
    function drawEvalChart() {
        if (evalChart) evalChart.destroy();
        const labels = ['Start'];
        const data = [0.2]; // Start with a slight edge for White
        reviewData.forEach((item, index) => {
            labels.push(`${Math.floor(index / 2) + 1}. ${item.move}`);
            data.push(item.score / 100); // Convert centipawns to pawns
        });

        evalChart = new Chart(evalChartCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Advantage (White)',
                    data: data,
                    borderColor: 'rgba(255, 255, 255, 0.7)',
                    backgroundColor: (context) => {
                        const { ctx, chartArea, scales } = context.chart;
                        if (!chartArea) return null;
                        const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                        const zero = Math.max(chartArea.top, Math.min(chartArea.bottom, scales.y.getPixelForValue(0)));
                        const zeroPoint = (zero - chartArea.top) / (chartArea.bottom - chartArea.top);
                        gradient.addColorStop(Math.max(0, zeroPoint - 0.01), 'rgba(20, 20, 20, 0.6)');
                        gradient.addColorStop(Math.min(1, zeroPoint), 'rgba(255, 255, 255, 0.6)');
                        return gradient;
                    },
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1
                }]
            },
            options: {
                scales: {
                    y: {
                        suggestedMin: -5,
                        suggestedMax: 5,
                        title: { display: false },
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#9e9c99' }
                    },
                    x: { display: false }
                },
                plugins: { legend: { display: false } },
                animation: { duration: 1000 }
            }
        });
    }
    
    /**
     * Applies the selected color theme to the board.
     */
    function applyTheme() {
        const themeName = localStorage.getItem('chessBoardTheme') || 'green';
        const selectedTheme = THEMES.find(t => t.name === themeName) || THEMES[0];
        document.documentElement.style.setProperty('--light-square-color', selectedTheme.colors.light);
        document.documentElement.style.setProperty('--dark-square-color', selectedTheme.colors.dark);
    }

    // --- Start the application ---
    init();
});
