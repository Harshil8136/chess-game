/**
 * analysis.js
 *
 * This file contains the AnalysisController class, which manages all functionality
 * for the game analysis tab, including engine interaction, move evaluation,
 * game review, and interactive visualization tools.
 */

class AnalysisController {
    /**
     * Initializes the AnalysisController.
     * @param {object} app - The main ChessGame app instance.
     * @param {Worker} stockfish - The Stockfish engine worker.
     * @param {object} uiElements - A map of jQuery elements for the analysis UI.
     */
    constructor(app, stockfish, uiElements) {
        this.app = app;
        this.stockfish = stockfish;
        this.ui = uiElements;
        this.chart = null;

        this.game = new Chess(); // Internal game state for analysis purposes.
        this.state = {
            currentAnalysisInfo: {},
            isAnalyzing: false,
            isReviewing: false,
            gameReviewData: [],
            currentMoveIndex: -1,
            isInfiniteAnalysis: true
        };

        this._bindUIEvents();
    }

    /**
     * Binds event listeners to the analysis UI elements.
     * @private
     */
    _bindUIEvents() {
        this.ui.runReviewBtn.on('click', () => this.runGameReview());
        this.ui.infiniteAnalysisToggle.on('change', (e) => {
            this.state.isInfiniteAnalysis = e.target.checked;
            if (this.state.isInfiniteAnalysis) {
                this.analyzePosition(this.app.state.reviewGame.fen());
            } else {
                this.stockfish.postMessage('stop');
            }
        });
        this.ui.analysisMoveList.on('click', '.analysis-move-item', (e) => {
            const moveIndex = parseInt($(e.currentTarget).data('move-index'));
            this.app.navigateToMove(moveIndex);
        });
    }

    /**
     * Starts the analysis mode for a given game.
     * @param {Chess} gameInstance - The completed game instance from the main app.
     */
    start(gameInstance) {
        this.game.load_pgn(gameInstance.pgn());
        this.state.isAnalyzing = true;
        this.state.isReviewing = false;
        this.state.gameReviewData = [];
        this.ui.runReviewBtn.prop('disabled', false).removeClass('bg-red-600').text('Run Game Review');
        this._updateMoveList();
        this.analyzePosition(this.app.state.reviewGame.fen());
    }

    /**
     * Stops the analysis mode.
     */
    stop() {
        this.state.isAnalyzing = false;
        this.stockfish.postMessage('stop');
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }
    
    /**
     * Called by the main app when the board position changes in analysis mode.
     * @param {string} fen - The FEN of the position to analyze.
     * @param {number} moveIndex - The index of the current move.
     */
    onPositionChanged(fen, moveIndex) {
        if (!this.state.isAnalyzing) return;
        this.state.currentMoveIndex = moveIndex;
        this.stockfish.postMessage('stop');
        this._clearAnalysisUI();
        this._updateMoveListHighlight(moveIndex);
        if (this.state.isInfiniteAnalysis && !this.state.isReviewing) {
            this.analyzePosition(fen);
        }
    }

    /**
     * Requests the engine to analyze a given position.
     * @param {string} fen - The FEN string of the position.
     */
    analyzePosition(fen) {
        if (!this.state.isAnalyzing || this.state.isReviewing) return;
        this.stockfish.postMessage(`position fen ${fen}`);
        this.stockfish.postMessage('go infinite');
    }

    /**
     * Handles incoming messages from the Stockfish engine during analysis.
     * @param {string} message - The message string from the engine.
     */
    handleEngineMessage(message) {
        if (!this.state.isAnalyzing || this.state.isReviewing) return;
        if (message.startsWith('info')) {
            this._parseEngineInfo(message);
        }
    }
    
    _parseEngineInfo(message) {
        const info = this.state.currentAnalysisInfo;
        const depth = message.match(/depth (\d+)/);
        const score = message.match(/score cp (-?\d+)/);
        const mate = message.match(/score mate (-?\d+)/);
        const pv = message.match(/pv (.+)/);
        const nodes = message.match(/nodes (\d+)/);
        
        if (depth) info.depth = depth[1];
        if (nodes) info.nodes = parseInt(nodes[1]).toLocaleString();
        if (mate) {
            const mateVal = parseInt(mate[1]);
            info.score = `M${Math.abs(mateVal)}`;
            info.numericScore = (mateVal > 0) ? this.app.config.MATE_SCORE : -this.app.config.MATE_SCORE;
            if (this.app.state.reviewGame.turn() === 'b') info.numericScore *= -1;
        } else if (score) {
            const rawScore = parseInt(score[1]);
            info.numericScore = (this.app.state.reviewGame.turn() === 'w') ? rawScore : -rawScore;
            info.score = (info.numericScore / 100.0).toFixed(2);
            if (info.numericScore > 0) info.score = `+${info.score}`;
        }
        if (pv) {
            const tempGame = new Chess(this.app.state.reviewGame.fen());
            info.topLine = pv[1].split(' ').map(uci => tempGame.move(uci, { sloppy: true })?.san).filter(Boolean).join(' ');
        }
        this._renderAnalysisUI();
    }
    
    _clearAnalysisUI() {
        this.state.currentAnalysisInfo = {};
        this.ui.evaluationScore.text('+0.00');
        this.ui.topEngineLine.text('...');
        this.ui.engineStats.text('Depth: ... | Nodes: ...');
    }

    _renderAnalysisUI() {
        const { score, topLine, depth, nodes } = this.state.currentAnalysisInfo;
        if (score) this.ui.evaluationScore.text(score);
        if (topLine) this.ui.topEngineLine.text(topLine);
        if (depth && nodes) {
            this.ui.engineStats.text(`Depth: ${depth} | Nodes: ${nodes}`);
        }
    }

    /**
     * Initiates a full-game review to classify each move.
     */
    async runGameReview() {
        if (this.state.isReviewing) return;
        this.state.isReviewing = true;
        this.state.isInfiniteAnalysis = false;
        this.stockfish.postMessage('stop');
        this.ui.runReviewBtn.prop('disabled', true);
        this.ui.infiniteAnalysisToggle.prop('checked', false).prop('disabled', true);
        this.state.gameReviewData = [];

        const history = this.game.history({ verbose: true });
        const reviewGame = new Chess();
        let lastEval = 20;

        for (let i = 0; i < history.length; i++) {
            this.ui.runReviewBtn.text(`Reviewing ${i + 1}/${history.length}`);
            const move = history[i];
            const currentFen = reviewGame.fen();
            
            try {
                const evaluation = await this._getStaticEvaluation(currentFen, this.app.config.REVIEW_DEPTH);
                const loss = (move.color === 'w') ? (lastEval - evaluation) : (evaluation - lastEval);
                this.state.gameReviewData.push({
                    move: move.san,
                    classification: this._classifyMove(loss),
                    score: evaluation
                });
                reviewGame.move(move.san);
                lastEval = evaluation;
            } catch (error) {
                console.error(error);
                this.ui.runReviewBtn.text('Review Failed!').addClass('bg-red-600');
                this.state.isReviewing = false;
                this.ui.infiniteAnalysisToggle.prop('disabled', false);
                return; // Abort the review
            }
        }

        this.state.isReviewing = false;
        this.ui.runReviewBtn.text('Review Complete');
        this.ui.infiniteAnalysisToggle.prop('disabled', false);
        this._updateMoveListWithReview();
        this._drawEvalChart();
    }

    /**
     * Gets a static evaluation for a FEN position with a timeout.
     * @param {string} fen - The FEN to evaluate.
     * @param {number} depth - The depth for the engine to search.
     * @returns {Promise<number>} A promise that resolves with the centipawn score.
     */
    _getStaticEvaluation(fen, depth) {
        return new Promise((resolve, reject) => {
            let finalScore = 0;
            let bestMoveReceived = false;

            const timeoutId = setTimeout(() => {
                if (!bestMoveReceived) {
                    cleanup();
                    reject(new Error(`Stockfish evaluation timed out for FEN: ${fen}`));
                }
            }, this.app.config.EVAL_TIMEOUT);

            const onMessage = (event) => {
                const message = event.data;
                const scoreMatch = message.match(/score cp (-?\d+)/);
                const mateMatch = message.match(/score mate (-?\d+)/);

                if (mateMatch) {
                    const mateVal = parseInt(mateMatch[1]);
                    finalScore = (mateVal > 0 ? this.app.config.MATE_SCORE : -this.app.config.MATE_SCORE);
                } else if (scoreMatch) {
                    finalScore = parseInt(scoreMatch[1]);
                }

                if (message.startsWith('bestmove')) {
                    bestMoveReceived = true;
                    cleanup();
                    // Score is from current player's perspective, convert to white's perspective
                    const scoreFromWhite = fen.includes(' w ') ? finalScore : -finalScore;
                    resolve(scoreFromWhite);
                }
            };
            
            const cleanup = () => {
                clearTimeout(timeoutId);
                this.stockfish.removeEventListener('message', onMessage);
            };

            this.stockfish.addEventListener('message', onMessage);
            this.stockfish.postMessage(`position fen ${fen}`);
            this.stockfish.postMessage(`go depth ${depth}`);
        });
    }

    _classifyMove(loss) {
        if (loss < 2) return 'Best';
        if (loss < 10) return 'Excellent';
        if (loss < 30) return 'Good';
        if (loss < 80) return 'Inaccuracy';
        if (loss < 150) return 'Mistake';
        return 'Blunder';
    }

    _updateMoveListWithReview() {
        const classifications = {
            'Best': { icon: '★', color: 'text-amber-300', title: 'Best Move' },
            'Excellent': { icon: '✓', color: 'text-sky-400', title: 'Excellent Move' },
            'Good': { icon: ' ', color: '', title: 'Good Move' },
            'Inaccuracy': { icon: '?!', color: 'text-yellow-500', title: 'Inaccuracy' },
            'Mistake': { icon: '?', color: 'text-orange-500', title: 'Mistake' },
            'Blunder': { icon: '??', color: 'text-red-600', title: 'Blunder' },
        };
        const history = this.game.history({ verbose: true });
        let html = '';
        for (let i = 0; i < history.length; i += 2) {
            html += `<div class="flex items-start gap-2 mb-1">
                        <span class="font-bold w-6 text-gray-400 pt-1">${Math.floor(i / 2) + 1}.</span>
                        <div class="flex-1 flex gap-2">`;
            if (history[i]) {
                const review = this.state.gameReviewData[i];
                const info = classifications[review.classification];
                html += `<div class="analysis-move-item flex-1" data-move-index="${i}" title="${info.title}"><span>${history[i].san}</span><span class="font-bold ml-1 ${info.color}">${info.icon}</span></div>`;
            } else { html += `<div class="flex-1"></div>`; }
            if (history[i + 1]) {
                const review = this.state.gameReviewData[i + 1];
                const info = classifications[review.classification];
                html += `<div class="analysis-move-item flex-1" data-move-index="${i + 1}" title="${info.title}"><span>${history[i+1].san}</span><span class="font-bold ml-1 ${info.color}">${info.icon}</span></div>`;
            } else { html += `<div class="flex-1"></div>`; }
            html += `</div></div>`;
        }
        this.ui.analysisMoveList.html(html);
    }
    
    _drawEvalChart() {
        if (this.chart) this.chart.destroy();
        const labels = ['Start'];
        const data = [20];
        this.state.gameReviewData.forEach((item, index) => {
            labels.push(`${Math.floor(index / 2) + 1}. ${item.move}`);
            data.push(item.score);
        });

        this.chart = new Chart(this.ui.evalChart, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Advantage (White)',
                    data: data.map(cp => cp / 100),
                    borderColor: 'rgba(255, 255, 255, 0.7)',
                    backgroundColor: (context) => {
                        const { ctx, chartArea, scales } = context.chart;
                        if (!chartArea) return null;
                        const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                        const zero = Math.max(chartArea.top, Math.min(chartArea.bottom, scales.y.getPixelForValue(0)));
                        const zeroPoint = (zero - chartArea.top) / (chartArea.bottom - chartArea.top);
                        gradient.addColorStop(Math.max(0, zeroPoint - 0.01), 'rgba(200, 50, 50, 0.6)');
                        gradient.addColorStop(Math.min(1, zeroPoint), 'rgba(255, 255, 255, 0.6)');
                        return gradient;
                    },
                    fill: true, borderWidth: 2, pointRadius: 0, tension: 0.1
                }]
            },
            options: {
                scales: {
                    y: {
                        suggestedMin: -5, suggestedMax: 5,
                        title: { display: true, text: 'Advantage', color: '#9e9c99' },
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#9e9c99' }
                    },
                    x: { display: false }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    _updateMoveList() {
        const history = this.game.history({ verbose: true });
        let html = '';
        for (let i = 0; i < history.length; i += 2) {
            const moveNum = (i / 2) + 1;
            html += `<div class="flex items-center gap-2 mb-1">
                        <span class="font-bold w-6 text-gray-400">${moveNum}.</span>
                        <div class="analysis-move-item flex-1" data-move-index="${i}">${history[i] ? history[i].san : ''}</div>
                        <div class="analysis-move-item flex-1" data-move-index="${i + 1}">${history[i+1] ? history[i+1].san : ''}</div>
                    </div>`;
        }
        this.ui.analysisMoveList.html(html);
        this._updateMoveListHighlight(this.state.currentMoveIndex);
    }
    
    _updateMoveListHighlight(moveIndex) {
        this.ui.analysisMoveList.find('.current-move-analysis').removeClass('current-move-analysis');
        if (moveIndex !== null && moveIndex >= 0) {
            this.ui.analysisMoveList.find(`[data-move-index="${moveIndex}"]`).addClass('current-move-analysis');
        }
    }
}