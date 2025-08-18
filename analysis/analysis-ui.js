// ===================================================================================
//  ANALYSIS-UI.JS
//  Manages all UI components and interactions for the Analysis Room.
// ===================================================================================

(function(controller) {
    if (!controller) {
        console.error("Analysis Core module must be loaded before the UI module.");
        return;
    }

    const uiMethods = {

        populateUIReferences: function() {
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
            this.analysisBoardElement = $('#analysis-board');
            this.visualizerBoardWrapper = $('#visualizer-board-wrapper');
            this.visualizerStatusElement = $('#visualizer-status');
            this.visualizerMoveNumberElement = $('#visualizer-move-number');
            this.visualizerMovePlayedElement = $('#visualizer-move-played');
            this.visualizerMoveAssessmentElement = $('#visualizer-move-assessment');
            this.visualizerProgressBar = $('#visualizer-progress-bar');
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

        initializeVisualizerBoard: function() {
            try {
                const boardConfig = {
                    position: 'start',
                    pieceTheme: PIECE_THEMES[localStorage.getItem('chessPieceTheme') || 'cburnett']
                };
                if (this.visualizerBoard && typeof this.visualizerBoard.destroy === 'function') {
                    this.visualizerBoard.destroy();
                }
                this.visualizerBoard = Chessboard('visualizer-board-wrapper', boardConfig);
            } catch (error) {
                console.error('AnalysisController: Error initializing visualizer board:', error);
            }
        },
        
        setupEventHandlers: function() {
            this.moveListElement.off('click.navigate').on('click.navigate', '.analysis-move-row', (e) => {
                const moveIndex = parseInt($(e.currentTarget).data('move-index'));
                if (!isNaN(moveIndex) && moveIndex >= -1 && moveIndex < this.gameHistory.length) {
                    this.navigateToMove(moveIndex);
                    window.playSound('moveSelf');
                }
            });
            
            this.retryMistakeBtn.off('click').on('click', () => {
                if (this.currentMoveIndex < 0) return;
                const tempGame = new Chess(this.analysisGame.header().FEN || undefined);
                for (let i = 0; i < this.currentMoveIndex; i++) {
                    tempGame.move(this.gameHistory[i]);
                }
                window.loadFenOnReturn = tempGame.fen();
                switchToMainGame();
            });

            $(document).off('keydown.analysis').on('keydown.analysis', (e) => {
                if ($(e.target).is('input, select, textarea') || !isAnalysisMode) return;
                let newIndex = this.currentMoveIndex;
                switch (e.key.toLowerCase()) {
                    case 'arrowleft': if (this.currentMoveIndex >= 0) newIndex--; break;
                    case 'arrowright': if (this.currentMoveIndex < this.gameHistory.length - 1) newIndex++; break;
                    case 'arrowup': newIndex = -1;
                    case 'arrowdown': newIndex = this.gameHistory.length - 1; break;
                    case 'f':
                        this.analysisBoard.flip();
                        this.renderCoordinates();
                        this.redrawUserShapes();
                        break;
                    default: return;
                }
                if (newIndex !== this.currentMoveIndex) {
                    this.navigateToMove(newIndex);
                    window.playSound('moveSelf');
                }
                e.preventDefault();
            });

            this.analysisBoardElement.off('mousedown contextmenu').on('mousedown contextmenu', (e) => {
                if (e.which !== 3) return;
                e.preventDefault();
                this.isDrawing = true;
                this.drawStartSquare = $(e.target).closest('[data-square]').data('square');
            });

            $(document).off('mouseup.analysis_draw').on('mouseup.analysis_draw', (e) => {
                if (!this.isDrawing || e.which !== 3) return;
                e.preventDefault();
                const endSquare = $(e.target).closest('[data-square]').data('square');
                if (this.drawStartSquare && endSquare) {
                    if (this.drawStartSquare === endSquare) {
                        const existingIndex = this.userShapes.findIndex(s => s.type === 'highlight' && s.square === this.drawStartSquare);
                        if (existingIndex > -1) this.userShapes.splice(existingIndex, 1);
                        else this.userShapes.push({ type: 'highlight', square: this.drawStartSquare, color: 'green' });
                    } else {
                        const existingIndex = this.userShapes.findIndex(s => s.type === 'arrow' && s.from === this.drawStartSquare && s.to === endSquare);
                        if (existingIndex > -1) this.userShapes.splice(existingIndex, 1);
                        else this.userShapes.push({ type: 'arrow', from: this.drawStartSquare, to: endSquare, color: 'rgba(21, 128, 61, 0.7)' });
                    }
                } else { this.clearUserShapes(); }
                this.redrawUserShapes();
                this.isDrawing = false;
                this.drawStartSquare = null;
            });
        },

        updateMoveInUI: function(moveIndex, state = {}) {
            const moveItem = this.moveListElement.find(`.analysis-move-item[data-move-index="${moveIndex}"]`);
            if (state.isAnalyzing) {
                moveItem.find('.classification-icon').html('<div class="spinner"></div>').removeClass();
            } else {
                const review = this.reviewData[moveIndex];
                const info = this.CLASSIFICATION_DATA[review.classification];
                moveItem.find('.classification-icon').html(info.icon).attr('class', `classification-icon font-bold ${info.color}`);
                moveItem.find('.font-mono').addClass(info.color);
                moveItem.attr('title', info.title);
            }
        },

        // UPDATED: Complete overhaul to create the new two-column move list.
        renderReviewedMoveList: function() {
            if (!this.moveListElement) return;
            let html = '';

            // Manually add the "Starting Position" (Move Zero)
            html += `
                <div class="analysis-move-row" data-move-index="-1">
                    <div class="move-number">--</div>
                    <div class="analysis-move-item text-dark font-bold col-span-2">
                        <span>Starting Position</span>
                    </div>
                </div>
            `;

            for (let i = 0; i < this.gameHistory.length; i += 2) {
                const moveNum = Math.floor(i / 2) + 1;
                const whiteMove = this.gameHistory[i];
                const whiteReview = this.reviewData[i];
                const whiteInfo = this.CLASSIFICATION_DATA[whiteReview.classification];

                const blackMove = this.gameHistory[i + 1];
                const blackReview = this.reviewData[i + 1];

                let whiteHtml = `
                    <div class="analysis-move-item" data-move-index="${i}" title="${whiteInfo.title}">
                        <span class="font-mono ${whiteInfo.color}">${whiteMove.san}</span>
                        <span class="classification-icon font-bold ${whiteInfo.color}">${whiteInfo.icon}</span>
                    </div>`;
                
                let blackHtml = '<div></div>'; // Placeholder
                if (blackMove) {
                    const blackInfo = this.CLASSIFICATION_DATA[blackReview.classification];
                    blackHtml = `
                        <div class="analysis-move-item" data-move-index="${i+1}" title="${blackInfo.title}">
                            <span class="font-mono ${blackInfo.color}">${blackMove.san}</span>
                            <span class="classification-icon font-bold ${blackInfo.color}">${blackInfo.icon}</span>
                        </div>`;
                }

                html += `
                    <div class="analysis-move-row" data-move-index="${i}" data-second-move-index="${i+1}">
                        <div class="move-number">${moveNum}</div>
                        ${whiteHtml}
                        ${blackHtml}
                    </div>
                `;
            }
            this.moveListElement.html(html);

            this.moveListElement.find('.analysis-move-item').on('click', (e) => {
                e.stopPropagation();
                const moveIndex = parseInt($(e.currentTarget).data('move-index'));
                if (!isNaN(moveIndex)) {
                     this.navigateToMove(moveIndex);
                     window.playSound('moveSelf');
                }
            });
        },

        // UPDATED: Complete overhaul to generate a visual bar chart for move counts.
        renderReviewSummary: function() {
            this.whiteAccuracyElement.text(this.accuracy.w + '%');
            this.blackAccuracyElement.text(this.accuracy.b + '%');
            
            let countsHtml = '';
            const displayOrder = ['Brilliant', 'Great', 'Best', 'Good', 'Inaccuracy', 'Mistake', 'Blunder', 'Miss'];
            
            displayOrder.forEach(key => {
                const w_count = this.moveCounts.w[key] || 0;
                const b_count = this.moveCounts.b[key] || 0;
                if (w_count > 0 || b_count > 0) {
                    const info = this.CLASSIFICATION_DATA[key];
                    const w_percentage = (w_count / Math.max(1, this.cpl.w.length)) * 100;
                    const b_percentage = (b_count / Math.max(1, this.cpl.b.length)) * 100;

                    countsHtml += `
                        <div class="move-count-row text-sm">
                            <div class="w-bar-container bar-container">
                                <span>${w_count}</span>
                                <div class="bar ${info.bgColor}" style="width: ${w_percentage}%;"></div>
                            </div>
                            <div class="label text-center font-bold ${info.color}" title="${info.title}">
                                ${info.icon} ${key}
                            </div>
                            <div class="b-bar-container bar-container">
                                <div class="bar ${info.bgColor}" style="width: ${b_percentage}%;"></div>
                                <span>${b_count}</span>
                            </div>
                        </div>`;
                }
            });
            this.moveCountsContainer.html(countsHtml);
            this.reviewSummaryContainer.removeClass('hidden');
        },
        
        renderGameSummaryAccuracies: function() {
            if (summaryAccuracy) {
                summaryAccuracy.find('div:first-child .font-bold').text(this.accuracy.w + '%');
                summaryAccuracy.find('div:last-child .font-bold').text(this.accuracy.b + '%');
            }
        },

        renderFinalReview: function() {
            this.renderReviewSummary();
            this.renderReviewedMoveList();
            this.drawEvalChart();
            this.renderGameSummaryAccuracies();
            this.navigateToMove(-1);
        },
        
        navigateToMove: function(moveIndex) {
            if (moveIndex < -1 || moveIndex >= this.gameHistory.length) return;
            
            this.currentMoveIndex = moveIndex;
            
            if (moveIndex === -1) {
                const startFen = this.analysisGame.header().FEN || 'start';
                this.analysisBoard.position(startFen);
                this.assessmentDetailsElement.addClass('hidden');
            } else {
                const tempGame = new Chess(this.analysisGame.header().FEN || undefined);
                for (let i = 0; i <= moveIndex; i++) tempGame.move(this.gameHistory[i]);
                if (this.analysisBoard) this.analysisBoard.position(tempGame.fen());
                this.showMoveAssessmentDetails(moveIndex);
            }
            
            this.moveListElement.find('.current-move').removeClass('current-move');
            const targetRow = this.moveListElement.find(`[data-move-index="${moveIndex}"], [data-second-move-index="${moveIndex}"]`).first();
            if (targetRow.hasClass('analysis-move-item')) {
                 targetRow.closest('.analysis-move-row').addClass('current-move');
            } else {
                 targetRow.addClass('current-move');
            }
            
            this.redrawUserShapes();
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
                if (data.bestLineUci && ['Mistake', 'Blunder', 'Inaccuracy', 'Miss'].includes(data.classification)) {
                    const tempGame = new Chess(this.analysisGame.header().FEN || undefined);
                    for(let i=0; i < moveIndex; i++) tempGame.move(this.gameHistory[i]);
                    const sanLine = this.uciToSanLine(tempGame.fen(), data.bestLineUci);
                    this.bestLineMoves.text(sanLine);
                    this.bestLineDisplay.removeClass('hidden');
                } else {
                    this.bestLineDisplay.addClass('hidden');
                }
            }
        },
        
        // UPDATED: Evaluation chart has been visually enhanced.
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
                    type: 'line', data: { labels, datasets: [{
                        label: 'Position Evaluation', data, 
                        borderColor: 'rgba(230, 230, 230, 0.9)',
                        backgroundColor: (context) => {
                            const {ctx, chartArea} = context.chart;
                            if (!chartArea) return;
                            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                            const zeroY = context.chart.scales.y.getPixelForValue(0);
                            const topY = chartArea.top;
                            const bottomY = chartArea.bottom;
                            const zeroPoint = (zeroY - topY) / (bottomY - topY);

                            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
                            gradient.addColorStop(Math.max(0, zeroPoint - 0.01), 'rgba(0, 0, 0, 0.3)');
                            gradient.addColorStop(Math.min(1, zeroPoint + 0.01), 'rgba(255, 255, 255, 0.3)');
                            gradient.addColorStop(1, 'rgba(255, 255, 255, 0.3)');
                            return gradient;
                        },
                        fill: 'origin',
                        borderWidth: 2, pointRadius: 1, pointHoverRadius: 5, tension: 0.1
                    }]},
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        scales: {
                            y: { 
                                suggestedMin: -600, suggestedMax: 600, 
                                grid: { color: 'rgba(255,255,255,0.05)', zeroLineColor: 'rgba(255,255,255,0.4)', zeroLineWidth: 2 }, 
                                ticks: { color: 'var(--text-dark)', callback: (v) => (v / 100).toFixed(1) } 
                            },
                            x: { display: false }
                        },
                        plugins: { 
                            legend: { display: false }, 
                            tooltip: { 
                                mode: 'index', intersect: false, 
                                backgroundColor: 'rgba(0,0,0,0.8)', titleFont: { weight: 'bold'},
                                callbacks: {
                                    label: function(context) {
                                        let label = ' Eval: ';
                                        let score = context.parsed.y / 100;
                                        if (Math.abs(score) > 95) {
                                            label += (score > 0 ? 'M' : '-M') + Math.abs(100 - Math.abs(score)).toFixed(0);
                                        } else {
                                            label += score.toFixed(2);
                                        }
                                        return label;
                                    }
                                }
                            }
                        },
                        interaction: { mode: 'index', intersect: false }
                    }
                });
            } catch (error) { console.error('Error creating evaluation chart:', error); }
        },
        
        applyTheme: function() {
            try {
                const themeName = localStorage.getItem('chessBoardTheme') || 'green';
                const selectedTheme = THEMES && THEMES.find ? THEMES.find(t => t.name === themeName) : null;
                if (selectedTheme) {
                    document.documentElement.style.setProperty('--light-square-color', selectedTheme.colors.light);
                    document.documentElement.style.setProperty('--dark-square-color', selectedTheme.colors.dark);
                }
            } catch (error) { console.warn('Error applying theme:', error); }
        },

        renderCoordinates: function() {
            if (!this.boardWrapper || !this.boardWrapper.length || !this.analysisBoard) return;
            try {
                const isFlipped = this.analysisBoard.orientation() === 'black';
                const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
                let ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
                if (isFlipped) { files.reverse(); } else { ranks.reverse(); }
                const filesHtml = files.map(f => `<span>${f}</span>`).join('');
                const ranksHtml = ranks.map(r => `<span>${r}</span>`).join('');
                this.boardWrapper.find('#analysis-top-files').html(filesHtml);
                this.boardWrapper.find('#analysis-bottom-files').html(filesHtml);
                this.boardWrapper.find('#analysis-left-ranks').html(ranksHtml);
                this.boardWrapper.find('#analysis-right-ranks').html(ranksHtml);
            } catch (error) { console.warn('Error rendering coordinates:', error); }
        },

        clearUserShapes: function() {
            this.userShapes = [];
            this.redrawUserShapes();
        },

        redrawUserShapes: function() {
            if (!this.analysisBoardSvgOverlay) return;
            this.analysisBoardSvgOverlay.empty();
            if (this.analysisBoardElement) {
                this.analysisBoardElement.find('.square-55d63').removeClass('highlight-user-green highlight-user-red highlight-user-yellow highlight-user-blue');
            }
            
            if (!this.analysisBoard || this.currentMoveIndex < 0) return;
            
            const data = this.reviewData[this.currentMoveIndex];
            const move = this.gameHistory[this.currentMoveIndex];
            if (data && move) {
                this.drawArrow(move.from, move.to, 'rgba(59, 130, 246, 0.7)');
                if (data.bestLineUci) {
                    const bestMoveUci = data.bestLineUci.split(' ')[0];
                    const from = bestMoveUci.substring(0, 2);
                    const to = bestMoveUci.substring(2, 4);
                    if (from !== move.from || to !== move.to) {
                        this.drawArrow(from, to, 'rgba(42, 122, 42, 0.7)');
                    }
                }
            }
            
            this.userShapes.forEach(shape => {
                if (shape.type === 'highlight') {
                    this.analysisBoardElement.find(`.square-${shape.square}`).addClass(`highlight-user-${shape.color}`);
                } else if (shape.type === 'arrow') {
                    this.drawArrow(shape.from, shape.to, shape.color);
                }
            });
        },

        drawArrow: function(from, to, color = 'rgba(42, 122, 42, 0.7)') {
            if (!this.analysisBoardSvgOverlay || !this.analysisBoard) return;
            
            const boardWidth = this.analysisBoardElement.width();
            if (!boardWidth || boardWidth === 0) return;
            const squareSize = boardWidth / 8;
            const isFlipped = this.analysisBoard.orientation() === 'black';

            const getCoords = (square) => {
                let col = square.charCodeAt(0) - 'a'.charCodeAt(0);
                let row = parseInt(square.charAt(1)) - 1;
                if (isFlipped) { col = 7 - col; row = 7 - row; }
                return { x: col * squareSize + squareSize / 2, y: (7 - row) * squareSize + squareSize / 2 };
            };

            const fromCoords = getCoords(from);
            const toCoords = getCoords(to);
            const markerId = `arrowhead-analysis-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

            if (!this.analysisBoardSvgOverlay.find(`#${markerId}`).length) {
                const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
                marker.setAttribute('id', markerId);
                marker.setAttribute('viewBox', '0 0 10 10');
                marker.setAttribute('refX', '5'); marker.setAttribute('refY', '5');
                marker.setAttribute('markerWidth', '3.5'); marker.setAttribute('markerHeight', '3.5');
                marker.setAttribute('orient', 'auto-start-reverse');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
                path.style.fill = color;
                marker.appendChild(path);
                this.analysisBoardSvgOverlay.append(marker);
            }

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', fromCoords.x); line.setAttribute('y1', fromCoords.y);
            line.setAttribute('x2', toCoords.x); line.setAttribute('y2', toCoords.y);
            line.style.stroke = color;
            line.style.strokeWidth = '14px';
            line.setAttribute('marker-end', `url(#${markerId})`);
            this.analysisBoardSvgOverlay.append(line);
        }
    };

    Object.assign(controller, uiMethods);

})(window.AnalysisController);