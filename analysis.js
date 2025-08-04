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
    isAnalyzing: false,

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
    REVIEW_DEPTH: 12, // Reduced for better performance

    /**
     * Entry point called by script.js to start the analysis mode.
     */
    init: function() {
        console.log('AnalysisController: Initializing...');
        
        const gameData = window.gameDataToAnalyze;
        if (!gameData) {
            console.error("AnalysisController: No game data provided.");
            this.showError("No game data available for analysis.");
            return;
        }

        if (!gameData.stockfish) {
            console.error("AnalysisController: No stockfish engine provided.");
            this.showError("Chess engine not available for analysis.");
            return;
        }

        if (!gameData.pgn || gameData.pgn.trim() === '') {
            console.error("AnalysisController: No moves to analyze.");
            this.showError("No moves available for analysis. Play some moves first.");
            return;
        }

        try {
            // Initialize game state
            this.stockfish = gameData.stockfish;
            this.analysisGame = new Chess();
            this.analysisGame.load_pgn(gameData.pgn);
            this.gameHistory = this.analysisGame.history({ verbose: true });
            this.reviewData = [];
            this.currentMoveIndex = this.gameHistory.length - 1;
            this.isAnalyzing = false;

            // **FIX**: Get UI elements using their new, unique IDs from the Analysis Room.
            this.moveListElement = $('#ar-analysis-move-list');
            this.evalChartCanvas = $('#ar-eval-chart');
            this.assessmentDetailsElement = $('#ar-move-assessment-details');
            this.assessmentTitleElement = $('#ar-assessment-title');
            this.assessmentCommentElement = $('#ar-assessment-comment');
            this.boardWrapper = $('#analysis-room .board-wrapper');
            
            // Verify elements exist
            if (!this.moveListElement.length) {
                console.error("AnalysisController: ar-analysis-move-list element not found");
                this.showError("Analysis interface not properly loaded.");
                return;
            }

            // Initialize the analysis board
            this.initializeBoard();
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Start the analysis
            this.runGameReview();
            
            console.log('AnalysisController: Initialization complete');
            
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
            
            // Destroy existing board if it exists
            if (this.analysisBoard && typeof this.analysisBoard.destroy === 'function') {
                this.analysisBoard.destroy();
            }
            
            // Create new board
            this.analysisBoard = Chessboard('analysis-board', boardConfig);
            
            // Apply current theme
            this.applyTheme();
            
            // Render coordinates
            this.renderCoordinates();
            
            console.log('AnalysisController: Board initialized successfully');
            
        } catch (error) {
            console.error('AnalysisController: Error initializing board:', error);
            this.showError("Failed to initialize analysis board.");
        }
    },

    setupEventHandlers: function() {
        // Remove any existing handlers first
        this.moveListElement.off('click');
        
        // Add click handler for move navigation
        this.moveListElement.on('click', '.analysis-move-item', (e) => {
            const moveIndex = parseInt($(e.currentTarget).data('move-index'));
            if (!isNaN(moveIndex) && moveIndex >= 0 && moveIndex < this.gameHistory.length) {
                this.navigateToMove(moveIndex);
            }
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
                // Try to return to main game
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
        
        if (this.stockfish) {
            try {
                this.stockfish.postMessage('stop');
            } catch (error) {
                console.warn('Failed to stop stockfish:', error);
            }
        }
        
        if (this.evalChart) {
            try {
                this.evalChart.destroy();
                this.evalChart = null;
            } catch (error) {
                console.warn('Failed to destroy chart:', error);
            }
        }
        
        // Clear any ongoing analysis
        this.reviewData = [];
        this.currentMoveIndex = -1;
        
        console.log('AnalysisController: Stopped successfully');
    },

    runGameReview: async function() {
        console.log('AnalysisController: Starting game review...');
        
        if (this.gameHistory.length === 0) {
            this.showError("No moves to analyze.");
            return;
        }

        this.isAnalyzing = true;
        
        // Show progress indicator
        const progressIndicator = $('<div class="text-center p-4 bg-blue-700 text-white rounded-lg mb-4">Starting Analysis...</div>');
        this.moveListElement.parent().prepend(progressIndicator);
        
        try {
            this.moveListElement.html('<div class="text-center text-gray-400 p-4">Analyzing moves...</div>');

            let tempGame = new Chess();
            let lastMoveEval = 20; // Start with slight advantage for white

            for (let i = 0; i < this.gameHistory.length && this.isAnalyzing; i++) {
                const move = this.gameHistory[i];
                
                // Update progress
                progressIndicator.text(`Analyzing move ${i + 1} of ${this.gameHistory.length}...`);
                
                // Get evaluation before the move
                const positionEval = await this.getStaticEvaluation(tempGame.fen());
                
                // Make the move
                tempGame.move(move.san);
                
                // Get evaluation after the move
                const eval_after_move = await this.getStaticEvaluation(tempGame.fen());
                
                // Normalize evaluations based on color to move
                const a_move_eval = (move.color === 'w') ? positionEval.best : -positionEval.best;
                const b_move_eval = (move.color === 'w') ? eval_after_move.best : -eval_after_move.best;

                const evalLoss = a_move_eval - b_move_eval;
                const wasOpponentMistake = (move.color === 'w') ? (lastMoveEval < -100) : (lastMoveEval > 100);

                this.reviewData.push({
                    move: move.san,
                    score: b_move_eval,
                    classification: this.classifyMove(evalLoss, tempGame.pgn(), wasOpponentMistake, Math.abs(positionEval.best - positionEval.second) > 200)
                });
                
                lastMoveEval = b_move_eval;
                
                // Allow UI to update
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            if (this.isAnalyzing) {
                this.renderFinalReview();
                progressIndicator.text('Analysis Complete!');
                setTimeout(() => progressIndicator.fadeOut(), 2000);
            }
            
        } catch (error) {
            console.error('AnalysisController: Error during analysis:', error);
            this.showError("Analysis failed. Please try again.");
        } finally {
            this.isAnalyzing = false;
        }
    },

    getStaticEvaluation: function(fen) {
        return new Promise((resolve) => {
            if (!this.stockfish || !this.isAnalyzing) {
                resolve({ best: 0, second: 0 });
                return;
            }

            let scores = {};
            let bestMoveFound = false;
            
            const timeout = setTimeout(() => {
                if (!bestMoveFound) {
                    this.stockfish.removeEventListener('message', onMessage);
                    resolve({ best: scores[1] || 0, second: scores[2] || scores[1] || 0 });
                }
            }, 3000); // 3 second timeout per position

            const onMessage = (event) => {
                if (!this.isAnalyzing) {
                    clearTimeout(timeout);
                    this.stockfish.removeEventListener('message', onMessage);
                    resolve({ best: 0, second: 0 });
                    return;
                }

                const message = event.data;
                
                const pvMatch = message.match(/multipv (\d+)/);
                if (pvMatch) {
                    const pvIndex = parseInt(pvMatch[1]);
                    const scoreMatch = message.match(/score cp (-?\d+)/);
                    if (scoreMatch) {
                        scores[pvIndex] = parseInt(scoreMatch[1]);
                    }
                }
                
                if (message.startsWith('bestmove')) {
                    bestMoveFound = true;
                    clearTimeout(timeout);
                    this.stockfish.removeEventListener('message', onMessage);
                    
                    // Reset MultiPV
                    try {
                        this.stockfish.postMessage('setoption name MultiPV value 1');
                    } catch (error) {
                        console.warn('Failed to reset MultiPV:', error);
                    }
                    
                    resolve({ 
                        best: scores[1] || 0, 
                        second: scores[2] || scores[1] || 0 
                    });
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
                resolve({ best: 0, second: 0 });
            }
        });
    },
    
    classifyMove: function(loss, pgn, opponentMadeMistake, isOnlyMove) {
        // Check if it's a book move
        if (OPENINGS && OPENINGS.some && OPENINGS.some(o => pgn.trim().startsWith(o.pgn))) {
            return 'Book';
        }
        
        // Classify based on evaluation loss
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
        if (!this.isAnalyzing) return;
        
        try {
            this.renderReviewedMoveList();
            this.drawEvalChart();
            this.navigateToMove(this.gameHistory.length - 1);
            console.log('AnalysisController: Final review rendered successfully');
        } catch (error) {
            console.error('AnalysisController: Error rendering final review:', error);
        }
    },
    
    navigateToMove: function(moveIndex) {
        if (moveIndex < 0 || moveIndex >= this.gameHistory.length) return;
        
        try {
            this.currentMoveIndex = moveIndex;
            
            // Update board position
            const tempGame = new Chess();
            for (let i = 0; i <= moveIndex; i++) {
                tempGame.move(this.gameHistory[i].san);
            }
            
            if (this.analysisBoard && typeof this.analysisBoard.position === 'function') {
                this.analysisBoard.position(tempGame.fen());
            }
            
            // Update move list highlighting
            this.moveListElement.find('.current-move-analysis').removeClass('current-move-analysis');
            this.moveListElement.find(`[data-move-index="${moveIndex}"]`).addClass('current-move-analysis');
            
            // Show move assessment
            this.showMoveAssessmentDetails(moveIndex);
            
        } catch (error) {
            console.error('Error navigating to move:', error);
        }
    },

    showMoveAssessmentDetails: function(moveIndex) {
        const data = this.reviewData[moveIndex];
        if (!data || !this.assessmentDetailsElement) return;
        
        const info = this.CLASSIFICATION_DATA[data.classification];

        if (info && this.assessmentTitleElement && this.assessmentCommentElement) {
            this.assessmentTitleElement.text(info.title).attr('class', `text-lg font-bold ${info.color}`);
            this.assessmentCommentElement.text(info.comment);
            this.assessmentDetailsElement.removeClass('hidden');
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
            
            html += `<div class="analysis-move-item flex items-center gap-3 p-2 rounded-md hover:bg-stone-600 cursor-pointer" data-move-index="${i}" title="${info.title}">`;
            
            if (move.color === 'w') {
                html += `<span class="w-8 text-right font-bold text-gray-400">${moveNum}.</span>`;
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
            if (this.evalChart) {
                this.evalChart.destroy();
                this.evalChart = null;
            }

            const labels = ['Start'];
            const data = [20]; // Starting eval slightly favors white
            
            this.reviewData.forEach((item, index) => {
                const moveNum = Math.floor(index / 2) + 1;
                const isWhite = index % 2 === 0;
                labels.push(`${moveNum}${isWhite ? '.' : '...'} ${item.move}`);
                data.push(item.score);
            });

            const ctx = this.evalChartCanvas[0].getContext('2d');
            
            this.evalChart = new Chart(ctx, {
                type: 'line',
                data: { 
                    labels: labels, 
                    datasets: [{
                        label: 'Position Evaluation',
                        data: data,
                        borderColor: 'rgba(59, 130, 246, 0.8)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { 
                            suggestedMin: -500, 
                            suggestedMax: 500,
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            ticks: { 
                                color: '#9e9c99',
                                callback: function(value) {
                                    return (value / 100).toFixed(1);
                                }
                            }
                        },
                        x: { 
                            display: false 
                        }
                    },
                    plugins: { 
                        legend: { display: false },
                        tooltip: { 
                            mode: 'index', 
                            intersect: false,
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            titleColor: 'white',
                            bodyColor: 'white'
                        }
                    },
                    interaction: {
                        mode: 'index',
                        intersect: false
                    }
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
    }
};
