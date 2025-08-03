/**
 * analysis.js
 *
 * Manages all functionality for the post-game analysis room. This script is loaded
 * on-demand and is completely isolated from the main game script (script.js).
 */

window.AnalysisController = {
    // --- UI Element References ---
    moveListElement: null,
    evalChartCanvas: null,
    assessmentDetailsElement: null,
    assessmentTitleElement: null,
    assessmentCommentElement: null,
    analysisBoard: null,
    boardWrapper: null,

    // --- State Variables ---
    stockfish: null,
    analysisGame: new Chess(),
    gameHistory: [],
    reviewData: [],
    evalChart: null,
    currentMoveIndex: -1,

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
        const gameData = window.gameDataToAnalyze;
        if (!gameData || !gameData.pgn || !gameData.stockfish) {
            console.error("AnalysisController: Missing game data from script.js.");
            return;
        }
        this.stockfish = gameData.stockfish;
        this.analysisGame.load_pgn(gameData.pgn);
        this.gameHistory = this.analysisGame.history({ verbose: true });
        this.reviewData = [];
        this.currentMoveIndex = this.gameHistory.length - 1;

        this.moveListElement = $('#analysis-move-list');
        this.evalChartCanvas = $('#eval-chart');
        this.assessmentDetailsElement = $('#move-assessment-details');
        this.assessmentTitleElement = $('#assessment-title');
        this.assessmentCommentElement = $('#assessment-comment');
        this.boardWrapper = $('#analysis-room .board-wrapper');
        
        const boardConfig = {
            position: 'start',
            pieceTheme: PIECE_THEMES[localStorage.getItem('chessPieceTheme') || 'cburnett']
        };
        if (this.analysisBoard) { this.analysisBoard.destroy(); }
        this.analysisBoard = Chessboard('analysis-board', boardConfig);
        this.applyTheme();
        this.renderCoordinates();

        this.moveListElement.off('click').on('click', '.analysis-move-item', (e) => {
            const moveIndex = parseInt($(e.currentTarget).data('move-index'));
            this.navigateToMove(moveIndex);
        });

        this.runGameReview();
    },

    stop: function() {
        if (this.stockfish) this.stockfish.postMessage('stop');
        if (this.evalChart) {
            this.evalChart.destroy();
            this.evalChart = null;
        }
    },

    runGameReview: async function() {
        const reviewProgressBtn = $('<button class="w-full px-4 py-2 mb-4 bg-blue-700 text-white font-bold rounded-lg" disabled>Starting Review...</button>');
        $('#return-to-game-btn').hide().parent().prepend(reviewProgressBtn);
        this.moveListElement.html(''); // Clear previous list

        let tempGame = new Chess();
        let lastMoveEval = 20; // Start with a slight edge for white

        for (let i = 0; i < this.gameHistory.length; i++) {
            const move = this.gameHistory[i];
            reviewProgressBtn.text(`Analyzing ${i + 1}/${this.gameHistory.length}`);
            
            const positionEval = await this.getStaticEvaluation(tempGame.fen());
            
            tempGame.move(move.san);
            
            const a_move_eval = (move.color === 'w') ? positionEval.best : -positionEval.best;
            const eval_after_move = await this.getStaticEvaluation(tempGame.fen());
            const b_move_eval = (move.color === 'w') ? eval_after_move.best : -eval_after_move.best;

            const evalLoss = a_move_eval - b_move_eval;
            const wasOpponentMistake = (move.color === 'w') ? (lastMoveEval < -100) : (lastMoveEval > 100);

            this.reviewData.push({
                move: move.san,
                score: b_move_eval,
                classification: this.classifyMove(evalLoss, tempGame.pgn(), wasOpponentMistake, Math.abs(positionEval.best - positionEval.second) > 200)
            });
            lastMoveEval = b_move_eval;
        }

        this.renderFinalReview();
        reviewProgressBtn.remove();
        $('#return-to-game-btn').show();
    },

    getStaticEvaluation: function(fen) {
        return new Promise((resolve) => {
            let scores = {};
            const onMessage = (event) => {
                const message = event.data;
                const pvMatch = message.match(/multipv (\d+)/);
                if (pvMatch) {
                    const pvIndex = parseInt(pvMatch[1]);
                    const scoreMatch = message.match(/score cp (-?\d+)/);
                    if(scoreMatch) scores[pvIndex] = parseInt(scoreMatch[1]);
                }
                if (message.startsWith('bestmove')) {
                    this.stockfish.removeEventListener('message', onMessage);
                    this.stockfish.postMessage('setoption name MultiPV value 1'); // Reset
                    resolve({ best: scores[1] || 0, second: scores[2] || scores[1] || 0 });
                }
            };
            this.stockfish.addEventListener('message', onMessage);
            this.stockfish.postMessage('setoption name MultiPV value 2');
            this.stockfish.postMessage(`position fen ${fen}`);
            this.stockfish.postMessage(`go depth ${this.REVIEW_DEPTH}`);
        });
    },
    
    classifyMove: function(loss, pgn, opponentMadeMistake, isOnlyMove) {
        if (OPENINGS.some(o => pgn.trim().startsWith(o.pgn))) return 'Book';
        if (loss < -200 && opponentMadeMistake) return 'Miss';
        if (loss > 300) return 'Blunder';
        if (loss > 120) return 'Mistake';
        if (loss > 50) return 'Inaccuracy';
        if (isOnlyMove && loss < 20) return 'Great';
        if (loss < 10) return 'Best';
        if (loss < 30) return 'Excellent';
        return 'Good';
    },

    renderFinalReview: function() {
        this.renderReviewedMoveList();
        this.drawEvalChart();
        this.navigateToMove(this.gameHistory.length - 1);
    },
    
    navigateToMove: function(moveIndex) {
        if(moveIndex < 0 || moveIndex >= this.gameHistory.length) return;
        this.currentMoveIndex = moveIndex;
        
        const tempGame = new Chess();
        for (let i = 0; i <= moveIndex; i++) {
            tempGame.move(this.gameHistory[i].san);
        }
        this.analysisBoard.position(tempGame.fen());
        
        this.moveListElement.find('.current-move-analysis').removeClass('current-move-analysis');
        this.moveListElement.find(`[data-move-index="${moveIndex}"]`).addClass('current-move-analysis');
        
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
        }
    },
    
    renderReviewedMoveList: function() {
        let html = '';
        for (let i = 0; i < this.gameHistory.length; i++) {
            const moveNum = Math.floor(i / 2) + 1;
            const move = this.gameHistory[i];
            const review = this.reviewData[i];
            const info = this.CLASSIFICATION_DATA[review.classification];
            
            html += `<div class="analysis-move-item flex items-center gap-3 p-2 rounded-md" data-move-index="${i}" title="${info.title}">`;
            if (move.color === 'w') {
                html += `<span class="w-8 text-right font-bold text-gray-400">${moveNum}.</span>`;
            } else {
                html += `<span class="w-8"></span>`; // Placeholder for black's move number
            }
            html += `<span class="flex-grow">${move.san}</span>`;
            html += `<span class="font-bold text-lg w-6 text-center ${info.color}">${info.icon}</span></div>`;
        }
        this.moveListElement.html(html);
    },

    drawEvalChart: function() {
        if (this.evalChart) this.evalChart.destroy();
        const labels = ['Start'];
        const data = [20]; // Starting eval is slightly > 0 for white
        this.reviewData.forEach((item, index) => {
            labels.push(`${Math.floor(index / 2) + 1}${index % 2 === 0 ? '.' : '...'} ${item.move}`);
            data.push(item.score);
        });

        this.evalChart = new Chart(this.evalChartCanvas, {
            type: 'line',
            data: { labels: labels, datasets: [{
                    label: 'Advantage (Centipawns)', data: data,
                    borderColor: 'rgba(255, 255, 255, 0.7)',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    fill: true, borderWidth: 2, pointRadius: 1, tension: 0.1
                }]
            },
            options: {
                scales: {
                    y: { suggestedMin: -500, suggestedMax: 500, title: { display: false }, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9e9c99', callback: value => (value/100).toFixed(1) } },
                    x: { display: false }
                },
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                responsive: true,
                maintainAspectRatio: false
            }
        });
    },
    
    applyTheme: function() {
        const themeName = localStorage.getItem('chessBoardTheme') || 'green';
        const selectedTheme = THEMES.find(t => t.name === themeName) || THEMES[0];
        document.documentElement.style.setProperty('--light-square-color', selectedTheme.colors.light);
        document.documentElement.style.setProperty('--dark-square-color', selectedTheme.colors.dark);
    },

    renderCoordinates: function() {
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
        this.boardWrapper.find('#analysis-top-files').html(files.map(f => `<span>${f}</span>`).join(''));
        this.boardWrapper.find('#analysis-bottom-files').html(files.map(f => `<span>${f}</span>`).join(''));
        this.boardWrapper.find('#analysis-left-ranks').html(ranks.slice().reverse().map(r => `<span>${r}</span>`).join(''));
        this.boardWrapper.find('#analysis-right-ranks').html(ranks.slice().reverse().map(r => `<span>${r}</span>`).join(''));
    }
};
