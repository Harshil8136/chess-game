/**
 * analysis.js
 *
 * This file contains the AnalysisController class, which manages all functionality
 * for the game analysis tab, including engine interaction, move evaluation,
 * game review, and interactive visualization tools.
 */

const CLASSIFICATION_DATA = {
    'Brilliant': { title: 'Brilliant', comment: 'The only good move in a critical position!', color: 'text-teal-400', icon: '!!' },
    'Theory': { title: 'Book Move', comment: 'A standard opening move from theory.', color: 'text-gray-400', icon: '📖' },
    'Best': { title: 'Best Move', comment: 'The strongest move, according to the engine.', color: 'text-amber-300', icon: '★' },
    'Excellent': { title: 'Excellent', comment: 'A strong move that maintains the position\'s potential.', color: 'text-sky-400', icon: '✓' },
    'Okay': { title: 'Okay', comment: 'A reasonable move, but a better option was available.', color: 'text-green-400', icon: ' ' },
    'Inaccuracy': { title: 'Inaccuracy', comment: 'This move weakens your position slightly.', color: 'text-yellow-500', icon: '?!' },
    'Mistake': { title: 'Mistake', comment: 'A significant error that damages your position.', color: 'text-orange-500', icon: '?' },
    'Blunder': { title: 'Blunder', comment: 'A very bad move that could lead to losing the game.', color: 'text-red-600', icon: '??' }
};

class AnalysisController {
    constructor(app, stockfish, uiElements) {
        this.app = app;
        this.stockfish = stockfish;
        this.ui = uiElements;
        this.chart = null;

        this.game = new Chess();
        this.state = {
            currentAnalysisInfo: {}, isAnalyzing: false, isReviewing: false,
            gameReviewData: [], currentMoveIndex: -1, isInfiniteAnalysis: true
        };

        this._bindUIEvents();
    }

    _bindUIEvents() {
        this.ui.runReviewBtn.on('click', () => this.runGameReview());
        this.ui.infiniteAnalysisToggle.on('change', (e) => {
            this.state.isInfiniteAnalysis = e.target.checked;
            if (this.state.isInfiniteAnalysis) this.analyzePosition(this.app.state.reviewGame.fen());
            else this.stockfish.postMessage('stop');
        });
        this.ui.analysisMoveList.on('click', '.analysis-move-item', (e) => {
            const moveIndex = parseInt($(e.currentTarget).data('move-index'));
            this.app.navigateToMove(moveIndex);
            this._showMoveAssessmentDetails(moveIndex);
        });
    }

    start(gameInstance) {
        this.game.load_pgn(gameInstance.pgn());
        this.state.isAnalyzing = true;
        this.state.isReviewing = false;
        this.state.gameReviewData = [];
        this.ui.runReviewBtn.prop('disabled', false).removeClass('bg-red-600').text('Run Game Review');
        this.ui.moveAssessmentDetails.addClass('hidden').attr('aria-hidden', 'true');
        this._updateMoveList();
        this.analyzePosition(this.app.state.reviewGame.fen());
    }

    stop() {
        this.state.isAnalyzing = false;
        if (this.stockfish) this.stockfish.postMessage('stop');
        if (this.chart) { this.chart.destroy(); this.chart = null; }
    }
    
    onPositionChanged(fen, moveIndex) {
        if (!this.state.isAnalyzing) return;
        this.state.currentMoveIndex = moveIndex;
        this.stockfish.postMessage('stop');
        this._clearAnalysisUI();
        this._updateMoveListHighlight(moveIndex);
        if (this.state.gameReviewData.length > 0 && moveIndex !== null) {
            this._showMoveAssessmentDetails(moveIndex);
        } else {
            this.ui.moveAssessmentDetails.addClass('hidden').attr('aria-hidden', 'true');
        }
        if (this.state.isInfiniteAnalysis && !this.state.isReviewing) {
            this.analyzePosition(fen);
        }
    }

    analyzePosition(fen) {
        if (!this.state.isAnalyzing || this.state.isReviewing) return;
        this.stockfish.postMessage(`position fen ${fen}`);
        this.stockfish.postMessage('go infinite');
    }

    handleEngineMessage(message) {
        if (!this.state.isAnalyzing || this.state.isReviewing) return;
        if (message.startsWith('info')) this._parseEngineInfo(message);
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
        if (depth && nodes) this.ui.engineStats.text(`Depth: ${depth} | Nodes: ${nodes}`);
    }

    async runGameReview() {
        if (this.state.isReviewing) return;
        this.state.isReviewing = true; this.state.isInfiniteAnalysis = false;
        this.stockfish.postMessage('stop');
        this.ui.runReviewBtn.prop('disabled', true);
        this.ui.infiniteAnalysisToggle.prop('checked', false).prop('disabled', true);
        this.ui.moveAssessmentDetails.addClass('hidden').attr('aria-hidden', 'true');
        this.state.gameReviewData = [];

        const history = this.game.history({ verbose: true });
        const reviewGame = new Chess();
        let lastEval = [20, 15]; // [Best move score, 2nd best move score]

        for (let i = 0; i < history.length; i++) {
            this.ui.runReviewBtn.text(`Reviewing ${i + 1}/${history.length}`);
            const move = history[i];
            const currentFen = reviewGame.fen();
            const currentPgn = reviewGame.pgn({ max_width: 5, newline_char: ' ' }) + ` ${i > 0 ? '' : ' '}${move.san}`;

            try {
                const evaluations = await this._getStaticEvaluation(currentFen, this.app.config.REVIEW_DEPTH, 2);
                const isCritical = Math.abs(evaluations[0] - evaluations[1]) > 200; // >2 pawn swing if wrong move is made
                const loss = (move.color === 'w') ? (lastEval[0] - evaluations[0]) : (evaluations[0] - lastEval[0]);

                this.state.gameReviewData.push({
                    move: move.san,
                    classification: this._classifyMove(loss, currentPgn, isCritical),
                    score: evaluations[0],
                    isCritical: isCritical
                });
                reviewGame.move(move.san);
                lastEval = evaluations;
            } catch (error) {
                console.error(error);
                this.ui.runReviewBtn.text('Review Failed!').addClass('bg-red-600');
                this.state.isReviewing = false;
                this.ui.infiniteAnalysisToggle.prop('disabled', false);
                return;
            }
        }
        this.state.isReviewing = false;
        this.ui.runReviewBtn.text('Review Complete');
        this.ui.infiniteAnalysisToggle.prop('disabled', false);
        this._updateMoveListWithReview();
        this._drawEvalChart();
        this.app.navigateToMove(history.length - 1);
    }

    _getStaticEvaluation(fen, depth, multiPV) {
        return new Promise((resolve, reject) => {
            let scores = {};
            const isWhiteTurn = fen.includes(' w ');

            const timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`Stockfish evaluation timed out for FEN: ${fen}`));
            }, this.app.config.EVAL_TIMEOUT);

            const onMessage = (event) => {
                const message = event.data;
                const pvMatch = message.match(/multipv (\d+)/);
                
                if (pvMatch) {
                    const pvIndex = parseInt(pvMatch[1]) - 1;
                    const scoreMatch = message.match(/score cp (-?\d+)/);
                    const mateMatch = message.match(/score mate (-?\d+)/);
                    if (mateMatch) {
                        const mateVal = parseInt(mateMatch[1]);
                        scores[pvIndex] = (mateVal > 0 ? this.app.config.MATE_SCORE : -this.app.config.MATE_SCORE);
                    } else if (scoreMatch) {
                        scores[pvIndex] = parseInt(scoreMatch[1]);
                    }
                }

                if (message.startsWith('bestmove')) {
                    cleanup();
                    const finalScores = [];
                    for (let i = 0; i < multiPV; i++) {
                        const scoreFromPlayer = scores[i] || (Object.values(scores)[0] || 0);
                        finalScores.push(isWhiteTurn ? scoreFromPlayer : -scoreFromPlayer);
                    }
                    resolve(finalScores);
                }
            };
            
            const cleanup = () => {
                clearTimeout(timeoutId);
                this.stockfish.removeEventListener('message', onMessage);
                this.stockfish.postMessage('setoption name MultiPV value 1'); // Reset to default
            };

            this.stockfish.addEventListener('message', onMessage);
            this.stockfish.postMessage(`setoption name MultiPV value ${multiPV}`);
            this.stockfish.postMessage(`position fen ${fen}`);
            this.stockfish.postMessage(`go depth ${depth}`);
        });
    }

    _classifyMove(loss, pgn, isCritical) {
        if (OPENINGS.some(o => o.pgn.startsWith(pgn.trim()) && pgn.trim().length <= o.pgn.length)) {
            return 'Theory';
        }
        if (isCritical && loss < 10) return 'Brilliant';
        if (loss > 150) return 'Blunder';
        if (loss > 80) return 'Mistake';
        if (loss > 30) return 'Inaccuracy';
        if (loss > 10) return 'Okay';
        if (loss > 2) return 'Excellent';
        return 'Best';
    }

    _showMoveAssessmentDetails(moveIndex) {
        if (moveIndex === null || !this.state.gameReviewData[moveIndex]) {
            this.ui.moveAssessmentDetails.addClass('hidden').attr('aria-hidden', 'true');
            return;
        }
        const { classification, isCritical } = this.state.gameReviewData[moveIndex];
        const info = CLASSIFICATION_DATA[classification];

        if (info) {
            let comment = info.comment;
            if (isCritical && classification !== 'Brilliant') {
                comment += " This was a critical moment.";
            }
            this.ui.assessmentTitle.text(info.title).removeClass().addClass(`text-lg font-bold ${info.color}`);
            this.ui.assessmentComment.text(comment);
            this.ui.moveAssessmentDetails.removeClass('hidden').attr('aria-hidden', 'false');
        } else {
            this.ui.moveAssessmentDetails.addClass('hidden').attr('aria-hidden', 'true');
        }
    }

    _updateMoveListWithReview() {
        const history = this.game.history({ verbose: true });
        let html = '';
        for (let i = 0; i < history.length; i++) {
            const move = history[i];
            const moveNum = Math.floor(i / 2) + 1;
            const review = this.state.gameReviewData[i];
            const info = CLASSIFICATION_DATA[review.classification];
            
            html += `<div class="analysis-move-item flex items-center gap-3 p-2 rounded-md" data-move-index="${i}" title="${info.title}">`;
            if (move.color === 'w') {
                html += `<span class="w-8 text-right font-bold text-gray-400">${moveNum}.</span>`;
            } else {
                html += `<span class="w-8"></span>`;
            }
            html += `<span class="flex-grow">${move.san}</span>`;
            if(review.isCritical && info.title !== 'Brilliant') html += `<span class="font-bold text-lg text-red-500" title="Critical Position">🔥</span>`;
            html += `<span class="font-bold text-lg w-6 text-center ${info.color}">${info.icon}</span>
                     </div>`;
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
            type: 'line', data: { labels: labels, datasets: [{
                    label: 'Advantage (White)', data: data.map(cp => cp / 100),
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
                    y: { suggestedMin: -5, suggestedMax: 5, title: { display: true, text: 'Advantage', color: '#9e9c99' }, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9e9c99' } },
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
                        <div class="analysis-move-item flex-1 p-2 rounded-md" data-move-index="${i}">${history[i] ? history[i].san : ''}</div>
                        <div class="analysis-move-item flex-1 p-2 rounded-md" data-move-index="${i + 1}">${history[i+1] ? history[i+1].san : ''}</div>
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
