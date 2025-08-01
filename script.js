/**
 * Main script for the Chess application.
 * Encapsulates all game logic, state, and UI interaction within a ChessGame class.
 */
$(document).ready(function() {
    class ChessGame {
        constructor() {
            this.config = APP_CONFIG; // From config.js
            this.sounds = sounds;     // From config.js
            this.elements = {};
            this.state = {};
            this.analysisController = null;
            this._initializeApplication();
        }

        _initializeApplication() {
            this._initElements();
            this._initState();
            this._loadSettings();
            this._initUI();
            this._initStockfish()
                .then(() => {
                    this._initControllers();
                    this._bindEvents();
                    this.initGame();
                    console.log("Chess application initialized successfully.");
                    this.elements.loadingIndicator.fadeOut();
                })
                .catch(error => {
                    console.error("CRITICAL: Failed to initialize Stockfish worker.", error);
                    let errorMessage = error.message || 'Error: Could not load AI engine.';
                    this.elements.loadingIndicator.find('p').text(errorMessage);
                    this.elements.loadingIndicator.find('svg').remove();
                });
        }

        _initElements() {
            this.elements = {
                loadingIndicator: $('#loading-indicator'), sidePanel: $('#side-panel'),
                resizeSidebarBtn: $('#resize-sidebar-btn'), resizeIcon: $('#resize-icon'),
                board: $('#board'), status: $('#game-status'), openingName: $('#opening-name'),
                themeSelector: $('#theme-selector'), pieceThemeSelector: $('#piece-theme-selector'),
                capturedByWhite: $('#captured-by-white'), capturedByBlack: $('#captured-by-black'),
                promotionChoices: $('#promotion-choices'), restartButton: $('#restart-button'),
                swapSidesButton: $('#swap-sides-button'), undoButton: $('#undo-button'),
                playerName: $('#player-name'), bottomPlayerName: $('#bottom-player-name'),
                topPlayerName: $('#top-player-name'), whiteAdvantage: $('#white-advantage'),
                blackAdvantage: $('#black-advantage'), playerColorIndicator: $('#player-color-indicator'),
                moveHistoryLog: $('#move-history-log'), evalBarWhite: $('#eval-bar-white'),
                evalBarBlack: $('#eval-bar-black'), difficultySlider: $('#difficulty-slider'),
                eloDisplay: $('#elo-display'), modalContainer: $('#modal-container'),
                gameOverModal: $('#game-over-modal'), modalTitle: $('#modal-title'),
                modalMessage: $('#modal-message'), modalRestart: $('#modal-restart'),
                modalAnalyzeBtn: $('#modal-analyze'), ratingChange: $('#rating-change'),
                promotionModal: $('#promotion-modal'), gameplayControls: $('#gameplay-controls'),
                analysisModeControls: $('#analysis-mode-controls'), exitAnalysisButton: $('#exit-analysis-button'),
                navFirst: $('#nav-first'), navPrev: $('#nav-prev'), navNext: $('#nav-next'),
                navLast: $('#nav-last'), hintButton: $('#hint-button'), hintIcon: $('#hint-icon'),
                toggleSoundButton: $('#toggle-sound-button'), soundIcon: $('#sound-icon'),
                tabs: [
                    { btn: $('#tab-btn-moves'), content: $('#tab-content-moves') },
                    { btn: $('#tab-btn-settings'), content: $('#tab-content-settings') },
                    { btn: $('#tab-btn-analysis'), content: $('#tab-content-analysis') }
                ],
                analysisUI: {
                    runReviewBtn: $('#run-review-btn'), infiniteAnalysisToggle: $('#infinite-analysis-toggle'),
                    evaluationScore: $('#analysis-eval-score'), topEngineLine: $('#analysis-top-line'),
                    engineStats: $('#analysis-engine-stats'), analysisMoveList: $('#analysis-move-list'),
                    evalChart: $('#eval-chart'), reviewProgressContainer: $('#review-progress-container'),
                    reviewProgressBar: $('#review-progress-fill'),
                    moveAssessmentDetails: $('#move-assessment-details'),
                    assessmentTitle: $('#assessment-title'),
                    assessmentComment: $('#assessment-comment')
                }
            };
        }

        _initState() {
            this.state = {
                board: null, game: new Chess(), reviewGame: new Chess(), gameActive: true,
                humanPlayer: 'w', aiPlayer: 'b', aiDifficulty: 1, pendingMove: null,
                pendingPremove: null, playerName: 'Player', playerElo: this.config.PLAYER_STARTING_ELO,
                stockfish: null, isStockfishThinking: false, isHintThinking: false,
                isSoundEnabled: true, selectedSquare: null, viewingMoveIndex: null, isInAnalysisMode: false,
                isSidebarExpanded: false
            };
            OPENINGS.sort((a, b) => b.pgn.length - a.pgn.length);
        }

        _initStockfish() {
            return new Promise((resolve, reject) => {
                try {
                    if (typeof STOCKFISH_ENGINE_CODE === 'undefined' || !STOCKFISH_ENGINE_CODE.trim()) {
                        return reject(new Error("Engine code is missing from config.js."));
                    }
                    const blob = new Blob([STOCKFISH_ENGINE_CODE], { type: 'application/javascript' });
                    this.state.stockfish = new Worker(URL.createObjectURL(blob));
                    this.state.stockfish.onmessage = this._handleStockfishMessage.bind(this);
                    this.state.stockfish.onerror = (e) => reject(e);
                    
                    const readyListener = (event) => {
                        if (event.data === 'uciok') {
                            this.state.stockfish.removeEventListener('message', readyListener);
                            resolve();
                        }
                    };
                    this.state.stockfish.addEventListener('message', readyListener);
                    this.state.stockfish.postMessage('uci');

                } catch (error) {
                    reject(error);
                }
            });
        }

        _initControllers() {
            this.analysisController = new AnalysisController(this, this.state.stockfish, this.elements.analysisUI);
        }

        _loadSettings() {
            this.state.playerElo = parseInt(localStorage.getItem('playerElo') || this.config.PLAYER_STARTING_ELO, 10);
            this.state.playerName = localStorage.getItem('playerName') || 'Player';
            this.state.isSoundEnabled = (localStorage.getItem('chessSoundEnabled') || 'true') === 'true';
            this.state.aiDifficulty = localStorage.getItem('aiDifficulty') || '1';
            this.state.isSidebarExpanded = (localStorage.getItem('sidebarExpanded') || 'false') === 'true';
        }

        _initUI() {
            THEMES.forEach(theme => this.elements.themeSelector.append($('<option></option>').val(theme.name).text(theme.displayName)));
            Object.keys(PIECE_THEMES).forEach(theme => {
                const displayName = theme.charAt(0).toUpperCase() + theme.slice(1);
                this.elements.pieceThemeSelector.append($('<option></option>').val(theme).text(displayName));
            });
            this.elements.difficultySlider.val(this.state.aiDifficulty);
            this._setAiElo(this.state.aiDifficulty);
            this.elements.themeSelector.val(localStorage.getItem('chessBoardTheme') || this.config.DEFAULT_BOARD_THEME);
            this._applyTheme();
            this.elements.pieceThemeSelector.val(localStorage.getItem('chessPieceTheme') || this.config.DEFAULT_PIECE_THEME);
            this._setSoundIcon();
            Howler.mute(!this.state.isSoundEnabled);
            this._applySidebarSize(true);
        }

        _bindEvents() {
            this._initTabs();
            this.elements.resizeSidebarBtn.on('click', this._toggleSidebarSize.bind(this));
            this.elements.restartButton.on('click', this.initGame.bind(this));
            this.elements.swapSidesButton.on('click', () => {
                [this.state.humanPlayer, this.state.aiPlayer] = [this.state.aiPlayer, this.state.humanPlayer];
                this.initGame();
            });
            this.elements.undoButton.on('click', this.undoMove.bind(this));
            this.elements.modalRestart.on('click', this.initGame.bind(this));
            this.elements.modalAnalyzeBtn.on('click', this.enterAnalysisMode.bind(this));
            this.elements.exitAnalysisButton.on('click', this.initGame.bind(this));
            this.elements.promotionChoices.on('click', 'div, img', this._handlePromotionChoice.bind(this));
            this.elements.difficultySlider.on('input', this._handleDifficultyChange.bind(this));
            this.elements.themeSelector.on('change', this._applyTheme.bind(this));
            this.elements.pieceThemeSelector.on('change', this._applyPieceTheme.bind(this));
            this.elements.toggleSoundButton.on('click', this._toggleSound.bind(this));
            this.elements.playerName.on('click', this._editPlayerName.bind(this));
            this.elements.hintButton.on('click', this.requestHint.bind(this));
            this.elements.navFirst.on('click', () => this.navigateToMove(0));
            this.elements.navPrev.on('click', this._navigatePrevious.bind(this));
            this.elements.navNext.on('click', this._navigateNext.bind(this));
            this.elements.navLast.on('click', () => this.navigateToMove(null));
            this.elements.moveHistoryLog.on('click', '.move-history-item', (e) => this.navigateToMove(parseInt($(e.currentTarget).data('move-index'), 10)));
            this.elements.board.on('mouseup', '[data-square]', this._handleSquareMouseup.bind(this));
            this.elements.board.on('contextmenu', (e) => {
                e.preventDefault();
                if (this.state.pendingPremove) { this.state.pendingPremove = null; this._removePremoveHighlight(); }
                this._clearClickHighlights();
            });
            $(document).on('keydown', this._handleKeydown.bind(this));
        }

        _handleKeydown(e) {
            if ($(e.target).is('input, select, textarea')) return;
            const keyMap = {
                'r': () => this.elements.restartButton.click(), 'u': () => !this.elements.undoButton.prop('disabled') && this.elements.undoButton.click(),
                'f': () => this.elements.swapSidesButton.click(), 'ArrowLeft': () => !this.elements.navPrev.prop('disabled') && this.elements.navPrev.click(),
                'ArrowRight': () => !this.elements.navNext.prop('disabled') && this.elements.navNext.click()
            };
            if (keyMap[e.key]) keyMap[e.key]();
        }

        _initTabs() {
            this.elements.tabs.forEach(tab => tab.btn.on('click', () => this._activateTab(tab)));
        }

        _activateTab(activeTab) {
            this.elements.tabs.forEach(tab => {
                const isActive = tab.btn.is(activeTab.btn);
                tab.btn.toggleClass('text-white border-white', isActive).toggleClass('text-gray-400 border-transparent', !isActive);
                tab.content.toggleClass('hidden', !isActive).attr('aria-hidden', !isActive);
            });
            if (activeTab.btn.attr('id') === 'tab-btn-analysis' && this.state.game.game_over() && !this.state.isInAnalysisMode) {
                this.enterAnalysisMode();
            }
        }
        
        initGame() {
            if (this.state.stockfish) this.state.stockfish.postMessage('stop');
            this._closeAllModals();
            this.state.game.reset();
            this.state.gameActive = true;
            this.state.isInAnalysisMode = false;
            this.state.viewingMoveIndex = null;
            this.state.pendingPremove = null;
            if (this.analysisController) this.analysisController.stop();
            this._enterPlayMode();
            this._clearAllHighlights();
            this._buildBoard('start');
            this._updatePlayerLabels();
            this._updateEvalBar(20);
            this.updateGameState(false);
            this.elements.openingName.text('').prop('title', '');
            this.elements.hintIcon.attr('src', 'icon/light-bulb.png').removeClass('animate-spin');
            if (this.state.isSoundEnabled) this.sounds.start.play();
            if (this.state.game.turn() === this.state.aiPlayer) {
                setTimeout(() => this.makeAiMove(), 500);
            } else {
                this._requestLiveEvaluation();
            }
        }

        updateGameState(updateBoard = true) {
            const isLivePlay = this.state.viewingMoveIndex === null && !this.state.isInAnalysisMode;
            if (updateBoard && isLivePlay) this.state.board.position(this.state.game.fen());
            this._updateStatus();
            this._updateCapturedPieces();
            this._updateMoveHistoryDisplay();
            this._updateOpeningDisplay();
            if (!this.state.isInAnalysisMode) this._requestLiveEvaluation();
            if (this.state.game.game_over() && !this.state.isInAnalysisMode && this.state.gameActive) {
                this.endGame(); return;
            }
            if (this.state.game.turn() === this.state.aiPlayer && !this.state.isStockfishThinking && isLivePlay) {
                this.elements.status.text("AI is thinking...").addClass('thinking-animation');
                this.makeAiMove();
            }
        }
        
        _toggleSidebarSize() {
            this.state.isSidebarExpanded = !this.state.isSidebarExpanded;
            localStorage.setItem('sidebarExpanded', this.state.isSidebarExpanded);
            this._applySidebarSize();
        }

        _applySidebarSize(instant = false) {
            const expandedWidth = 'lg:w-[600px]';
            const normalWidth = 'lg:w-[400px]';
            const expandIcon = 'icon/arrows-pointing-out.png';
            const collapseIcon = 'icon/arrows-pointing-in.png';
            const sidePanel = this.elements.sidePanel;
            if (instant) sidePanel.css('transition', 'none');
            if (this.state.isSidebarExpanded) {
                sidePanel.removeClass(normalWidth).addClass(expandedWidth);
                this.elements.resizeIcon.attr('src', collapseIcon);
            } else {
                sidePanel.removeClass(expandedWidth).addClass(normalWidth);
                this.elements.resizeIcon.attr('src', expandIcon);
            }
            if (instant) {
                setTimeout(() => sidePanel.css('transition', ''), 50);
            }
            setTimeout(() => {
                if(this.state.board) this.state.board.resize();
                if (this.analysisController && this.analysisController.chart) {
                    this.analysisController.chart.resize();
                }
            }, 350);
        }
        
        endGame() {
            this.state.stockfish.postMessage('stop');
            this.state.gameActive = false;
            this.state.isStockfishThinking = false;
            if (this.state.isSoundEnabled) this.sounds.end.play();
            let title = "Game Over!", msg = "", result = 0.5, winner = null;
            if (this.state.game.in_checkmate()) {
                title = "Checkmate!";
                winner = this.state.game.turn() === 'w' ? 'Black' : 'White';
                msg = `${winner} wins.`;
                result = (this.state.humanPlayer === this.state.game.turn() ? 0 : 1);
                if (this.state.isSoundEnabled && winner && winner.toLowerCase().startsWith(this.state.humanPlayer)) {
                    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
                }
            } else {
                title = "Draw!";
                if (this.state.game.in_stalemate()) msg = "Draw by Stalemate.";
                else if (this.state.game.in_threefold_repetition()) msg = "Draw by Threefold Repetition.";
                else if (this.state.game.insufficient_material()) msg = "Draw by Insufficient Material.";
                else msg = "The game is a draw.";
            }
            const opponentElo = DIFFICULTY_SETTINGS[this.state.aiDifficulty].elo;
            const eloChange = this._calculateEloChange(this.state.playerElo, opponentElo, result);
            this.state.playerElo += eloChange;
            localStorage.setItem('playerElo', this.state.playerElo);
            const sign = eloChange >= 0 ? '+' : '';
            this.elements.ratingChange.html(`Rating: ${this.state.playerElo} (<span class="${eloChange >= 0 ? 'text-green-400' : 'text-red-400'}">${sign}${eloChange}</span>)`);
            this.elements.modalTitle.text(title);
            this.elements.modalMessage.text(msg);
            this.elements.modalContainer.removeClass('hidden').attr('aria-hidden', 'false');
            this.elements.gameOverModal.removeClass('hidden');
            gsap.fromTo(this.elements.gameOverModal, { scale: 0.7, opacity: 0, y: -20 }, { scale: 1, opacity: 1, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.8)' });
        }
        
        undoMove() {
            if (this.elements.undoButton.prop('disabled')) return;
            this.navigateToMove(null);
            this.state.game.undo();
            if (this.state.game.history().length > 0) this.state.game.undo();
            if (this.state.isSoundEnabled) this.sounds.moveSelf.play();
            this.updateGameState();
        }
        
        _buildBoard(position) {
            const config = {
                position, draggable: true,
                onDragStart: this._onDragStart.bind(this),
                onDrop: this._onDrop.bind(this),
                onSnapEnd: () => {
                    if (this.state.viewingMoveIndex === null && !this.state.isInAnalysisMode) {
                        this.state.board.position(this.state.game.fen());
                    }
                },
                pieceTheme: PIECE_THEMES[this.elements.pieceThemeSelector.val()] || PIECE_THEMES[this.config.DEFAULT_PIECE_THEME],
                moveSpeed: 'fast', snapSpeed: 50, appearSpeed: 200
            };
            if (this.state.board) this.state.board.destroy();
            this.state.board = Chessboard('board', config);
            this.state.board.orientation(this.state.humanPlayer === 'w' ? 'white' : 'black');
            this._renderCoordinates();
        }
        
        _onDragStart(source, piece) {
            if (!this.state.gameActive || this.state.game.game_over() || this.state.isInAnalysisMode || this.state.viewingMoveIndex !== null || !piece.startsWith(this.state.humanPlayer)) {
                return false;
            }
            this._clearAllHighlights();
            if (!this.state.isStockfishThinking) {
                this.state.selectedSquare = source;
                this._highlightLegalMoves(source);
            }
            return true;
        }
        
        _onDrop(source, target) {
            this._clearAllHighlights();
            const move = { from: source, to: target };
            if (this.state.isInAnalysisMode) {
                return 'snapback';
            }
            if (this.state.isStockfishThinking) {
                if (source !== target) this._setPremove(move);
                return 'snapback';
            }
            return this._makeUserMove(move, false);
        }
        
        _handleSquareMouseup(e) {
            this._clearHintHighlights();
            const clickedSquare = $(e.currentTarget).data('square');
            if (this.state.isInAnalysisMode) this._handleClickInAnalysis(clickedSquare);
            else if (this.state.isStockfishThinking) this._handleClickWhileAIThinking(clickedSquare);
            else this._handleClickLive(clickedSquare);
        }
        
        _handleClickInAnalysis(square) {
            this._clearClickHighlights();
            const piece = this.state.reviewGame.get(square);
            if (piece) {
                this.state.selectedSquare = square;
                this._highlightLegalMoves(square, this.state.reviewGame);
            }
        }
        
        _handleClickWhileAIThinking(square) {
            const source = this.state.selectedSquare;
            if (source && source !== square) {
                this._setPremove({ from: source, to: square });
                this._clearClickHighlights();
            } else {
                this._clearClickHighlights();
                const piece = this.state.game.get(square);
                if (piece && piece.color === this.state.humanPlayer) {
                    this.state.selectedSquare = square;
                    this.elements.board.find(`[data-square="${square}"]`).addClass('highlight-selected');
                }
            }
        }
        
        _handleClickLive(square) {
            const source = this.state.selectedSquare;
            if (source && source !== square) {
                this._makeUserMove({ from: source, to: square }, true);
            } else {
                this._clearClickHighlights();
                const piece = this.state.game.get(square);
                if (piece && piece.color === this.state.humanPlayer) {
                    this.state.selectedSquare = square;
                    this._highlightLegalMoves(square, this.state.game);
                }
            }
        }
        
        _makeUserMove(move, isClickMove) {
            const legalMove = this.state.game.moves({ verbose: true }).find(m => m.from === move.from && m.to === move.to);
            if (!legalMove) {
                if(this.state.isSoundEnabled) this.sounds.illegal.play();
                return 'snapback';
            }
            if (legalMove.flags.includes('p') && (legalMove.to.endsWith('8') || legalMove.to.endsWith('1'))) {
                this.state.pendingMove = move;
                this._showPromotionDialog(this.state.humanPlayer);
            } else {
                this.state.game.move(move);
                this._playMoveSound(legalMove);
                this.updateGameState(isClickMove);
            }
            this._clearClickHighlights();
        }
        
        _handlePromotionChoice(e) {
            const promotionPiece = $(e.currentTarget).data('piece');
            if (this.state.pendingMove) {
                this.state.pendingMove.promotion = promotionPiece;
                const moveResult = this.state.game.move(this.state.pendingMove);
                if (moveResult) {
                    if (this.state.isSoundEnabled) {
                        this.sounds.promote.play();
                        if (moveResult.san.includes('+')) this.sounds.check.play();
                    }
                    this.updateGameState(true);
                }
                this.state.pendingMove = null;
                this._clearClickHighlights();
                this._closeAllModals();
            }
        }
        
        makeAiMove() {
            if (!this.state.gameActive || this.state.game.game_over()) return;
            this.state.isStockfishThinking = true;
            this._updateStatus();
            const settings = DIFFICULTY_SETTINGS[this.state.aiDifficulty];
            if (settings.type === 'random' || settings.type === 'greedy') {
                const moves = this.state.game.moves({ verbose: true });
                let move;
                if (settings.type === 'greedy') {
                    const captureMoves = moves.filter(m => m.captured);
                    if (captureMoves.length > 0) {
                        captureMoves.sort((a, b) => MATERIAL_POINTS[b.captured] - MATERIAL_POINTS[a.captured]);
                        move = captureMoves[0];
                    } else {
                        move = moves[Math.floor(Math.random() * moves.length)];
                    }
                } else { move = moves[Math.floor(Math.random() * moves.length)]; }
                setTimeout(() => this._performAiMove(move.san), 600);
                return;
            }
            const fen = this.state.game.fen();
            if (!this._isValidFen(fen)) return;
            this.state.stockfish.postMessage(`position fen ${fen}`);
            this.state.stockfish.postMessage(settings.depth ? `go depth ${settings.depth}` : `go movetime ${settings.movetime}`);
        }
        
        _performAiMove(move) {
            this._clearAllHighlights();
            const moveObject = this.state.game.move(move, { sloppy: true });
            if (!moveObject) {
                 this.state.isStockfishThinking = false; this.updateGameState(true); return;
            }
            this.state.board.position(this.state.game.fen());
            this.state.isStockfishThinking = false;
            this._playMoveSound(moveObject, true);
            this.updateGameState(false);
            if (this.state.pendingPremove && this.state.gameActive) setTimeout(() => this._executePremove(), 50);
        }
        
        _setPremove(move) {
            if (this.state.isSoundEnabled) this.sounds.premove.play();
            this.state.pendingPremove = move;
            this._removePremoveHighlight();
            this.elements.board.find(`[data-square="${move.from}"], [data-square="${move.to}"]`).addClass('premove-highlight');
        }
        
        _executePremove() {
            const move = this.state.pendingPremove;
            this.state.pendingPremove = null;
            this._removePremoveHighlight();
            this._makeUserMove(move, true);
        }
        
        _requestLiveEvaluation() {
            if (!this.state.stockfish || this.state.isStockfishThinking || this.state.isHintThinking || this.state.game.game_over()) return;
            const fen = this.state.game.fen();
            if (!this._isValidFen(fen)) return;
            this.state.stockfish.postMessage(`position fen ${fen}`);
            this.state.stockfish.postMessage(`go depth ${this.config.LIVE_EVAL_DEPTH}`);
        }
        
        requestHint() {
            if (this.elements.hintButton.prop('disabled')) return;
            this._clearAllHighlights();
            this.state.isHintThinking = true;
            this._updateStatus();
            this.elements.hintIcon.attr('src', 'icon/arrow-path.png').addClass('animate-spin');
            this.elements.status.text('AI is suggesting a move...');
            const fen = this.state.game.fen();
            if (!this._isValidFen(fen)) { this.state.isHintThinking = false; return; }
            this.state.stockfish.postMessage(`position fen ${fen}`);
            this.state.stockfish.postMessage(`go movetime ${this.config.HINT_MOVETIME}`);
        }
        
        _handleStockfishMessage(event) {
            if (event.data === 'uciok') return;
            if (this.state.isInAnalysisMode) { this.analysisController.handleEngineMessage(event.data); return; }
            const message = event.data;
            if (message.startsWith('info')) {
                const scoreMatch = message.match(/score cp (-?\d+)/);
                const mateMatch = message.match(/score mate (-?\d+)/);
                if (mateMatch) {
                    this._updateEvalBar(this.state.game.turn() === 'w' ? this.config.MATE_SCORE : -this.config.MATE_SCORE);
                } else if (scoreMatch) {
                    const scoreInCp = parseInt(scoreMatch[1], 10);
                    this._updateEvalBar((this.state.game.turn() === 'w') ? scoreInCp : -scoreInCp);
                }
            } else if (message.startsWith('bestmove')) {
                const bestMove = message.split(' ')[1];
                if (this.state.isHintThinking) {
                    this._highlightHint(bestMove.substring(0, 2), bestMove.substring(2, 4));
                    this.state.isHintThinking = false;
                    this.elements.hintIcon.attr('src', 'icon/light-bulb.png').removeClass('animate-spin');
                    this._updateStatus();
                } else if (this.state.isStockfishThinking) {
                    this._performAiMove(bestMove);
                }
            }
        }
        
        enterAnalysisMode() {
            if (this.state.isInAnalysisMode) return;
            this.state.isInAnalysisMode = true;
            this.state.gameActive = false;
            this.state.stockfish.postMessage('stop');
            this.state.reviewGame.load_pgn(this.state.game.pgn());
            this._activateTab({ btn: this.elements.tabs[2].btn });
            this._enterAnalysisModeUI();
            this.analysisController.start(this.state.game);
            this.navigateToMove(this.state.reviewGame.history().length - 1);
            this._closeAllModals();
        }
        
        _enterPlayMode() {
            this.state.isInAnalysisMode = false;
            this.elements.gameplayControls.removeClass('hidden').attr('aria-hidden', 'false');
            this.elements.analysisModeControls.addClass('hidden').attr('aria-hidden', 'true');
        }
        
        _enterAnalysisModeUI() {
            this.elements.gameplayControls.addClass('hidden').attr('aria-hidden', 'true');
            this.elements.analysisModeControls.removeClass('hidden').attr('aria-hidden', 'false');
        }
        
        navigateToMove(index) {
            const sourceGame = this.state.isInAnalysisMode ? this.state.reviewGame : this.state.game;
            const history = sourceGame.history({ verbose: true });
            let targetFen;
            if (index === null || index >= history.length - 1) {
                this.state.viewingMoveIndex = null;
                targetFen = sourceGame.fen();
            } else {
                this.state.viewingMoveIndex = Math.max(0, index);
                const tempGame = new Chess();
                for (let i = 0; i <= this.state.viewingMoveIndex; i++) tempGame.move(history[i].san);
                targetFen = tempGame.fen();
            }
            this.state.board.position(targetFen, !this.state.isInAnalysisMode);
            this.updateGameState(false);
            if (this.state.isInAnalysisMode) {
                this.analysisController.onPositionChanged(targetFen, this.state.viewingMoveIndex);
            }
        }
        
        _navigatePrevious() {
            const history = (this.state.isInAnalysisMode ? this.state.reviewGame : this.state.game).history();
            let currentIndex = this.state.viewingMoveIndex;
            if (currentIndex === null) currentIndex = history.length;
            this.navigateToMove(currentIndex - 1);
        }
        
        _navigateNext() {
            if (this.state.viewingMoveIndex === null && !this.state.isInAnalysisMode) return;
            const targetIndex = (this.state.viewingMoveIndex === null ? -1 : this.state.viewingMoveIndex) + 1;
            this.navigateToMove(targetIndex);
        }
        
        _isValidFen(fen) { return this.state.game.validate_fen(fen).valid; }
        
        _updateStatus() {
            const { game, viewingMoveIndex, isInAnalysisMode, isStockfishThinking, isHintThinking, humanPlayer } = this.state;
            const history = (isInAnalysisMode ? this.state.reviewGame : game).history();
            const isLivePlay = viewingMoveIndex === null && !isInAnalysisMode;
            let text = '';
            if (isInAnalysisMode) {
                const moveNum = viewingMoveIndex !== null ? Math.floor(viewingMoveIndex / 2) + 1 : Math.floor(history.length / 2) + (history.length % 2);
                text = history.length > 0 ? `Analysis Mode (Move ${moveNum})` : 'Analysis Mode';
            } else if (viewingMoveIndex !== null) {
                text = `Reviewing Move ${Math.floor(viewingMoveIndex / 2) + 1}`;
            } else if (game.game_over()) {
                text = 'Game Over';
            } else if (isStockfishThinking) {
                text = 'AI is thinking...';
            } else {
                text = `${game.turn() === 'w' ? 'White' : 'Black'}'s Turn`;
                if (game.in_check()) text += ' (in Check)';
            }
            this.elements.status.text(text);
            this.elements.navFirst.prop('disabled', isLivePlay || viewingMoveIndex <= 0);
            this.elements.navPrev.prop('disabled', isLivePlay || viewingMoveIndex <= 0);
            this.elements.navNext.prop('disabled', isLivePlay || viewingMoveIndex >= history.length - 1);
            this.elements.navLast.prop('disabled', isLivePlay || viewingMoveIndex >= history.length - 1);
            this.elements.hintButton.prop('disabled', !isLivePlay || game.turn() !== humanPlayer || isHintThinking || isStockfishThinking);
            this.elements.undoButton.prop('disabled', !isLivePlay || game.history().length < (game.turn() === humanPlayer ? 0 : 1) || isStockfishThinking);
            this.elements.status.toggleClass('thinking-animation', isStockfishThinking || isHintThinking);
        }
        
        _updateCapturedPieces() {
            const sourceGame = this.state.isInAnalysisMode ? this.state.reviewGame : this.state.game;
            const pieceThemePath = PIECE_THEMES[this.elements.pieceThemeSelector.val()] || PIECE_THEMES.cburnett;
            const capturedBy = { w: [], b: [] };
            const initialPieces = { p: 8, n: 2, b: 2, r: 2, q: 1 };
            const boardPieces = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
            sourceGame.board().flat().forEach(p => p && boardPieces[p.color][p.type]++);
            ['w', 'b'].forEach(color => {
                ['p', 'n', 'b', 'r', 'q'].forEach(type => {
                    const capturedCount = initialPieces[type] - boardPieces[color][type];
                    if (capturedCount > 0) {
                        for (let i = 0; i < capturedCount; i++) capturedBy[color === 'w' ? 'b' : 'w'].push({ color, type });
                    }
                });
            });
            const pieceOrder = { p: 1, n: 2, b: 3, r: 4, q: 5 };
            capturedBy.w.sort((a, b) => pieceOrder[a.type] - pieceOrder[b.type]);
            capturedBy.b.sort((a, b) => pieceOrder[a.type] - pieceOrder[b.type]);
            this.elements.capturedByWhite.html(capturedBy.b.map(p => `<img src="${pieceThemePath.replace('{piece}', p.color + p.type.toUpperCase())}" class="captured-piece" />`).join(''));
            this.elements.capturedByBlack.html(capturedBy.w.map(p => `<img src="${pieceThemePath.replace('{piece}', p.color + p.type.toUpperCase())}" class="captured-piece" />`).join(''));
            const whiteMat = capturedBy.b.reduce((acc, p) => acc + MATERIAL_POINTS[p.type], 0);
            const blackMat = capturedBy.w.reduce((acc, p) => acc + MATERIAL_POINTS[p.type], 0);
            const adv = whiteMat - blackMat;
            this.elements.whiteAdvantage.text(adv > 0 ? `+${adv}` : '');
            this.elements.blackAdvantage.text(adv < 0 ? `+${-adv}` : '');
        }
        
        _updateMoveHistoryDisplay() {
            const sourceGame = this.state.isInAnalysisMode ? this.state.reviewGame : this.state.game;
            const history = sourceGame.history({ verbose: true });
            let html = '';
            for (let i = 0; i < history.length; i += 2) {
                const moveNum = (i / 2) + 1;
                const whiteMove = history[i];
                const blackMove = history[i + 1];
                const whiteClass = this.state.viewingMoveIndex === i ? 'current-move' : '';
                const blackClass = this.state.viewingMoveIndex === i + 1 ? 'current-move' : '';
                html += `<div><span class="font-bold w-6 inline-block text-gray-400">${moveNum}.</span>`;
                if (whiteMove) html += `<span class="move-history-item ${whiteClass}" data-move-index="${i}">${whiteMove.san}</span> `;
                if (blackMove) html += `<span class="move-history-item ${blackClass}" data-move-index="${i+1}">${blackMove.san}</span>`;
                html += `</div>`;
            }
            this.elements.moveHistoryLog.html(html);
            if (this.state.viewingMoveIndex === null && !this.state.isInAnalysisMode) {
                this.elements.moveHistoryLog.scrollTop(this.elements.moveHistoryLog[0].scrollHeight);
            }
        }
        
        _updateOpeningDisplay() {
            const pgn = (this.state.isInAnalysisMode ? this.state.reviewGame : this.state.game).pgn({ max_width: 5, newline_char: ' ' });
            const foundOpening = OPENINGS.find(o => pgn.startsWith(o.pgn))?.name || '';
            this.elements.openingName.text(foundOpening).prop('title', foundOpening);
        }
        
        _updatePlayerLabels() {
            const { humanPlayer, playerName } = this.state;
            this.elements.playerColorIndicator.text(`You are playing as ${humanPlayer === 'w' ? 'White' : 'Black'}`);
            this.elements.bottomPlayerName.text(humanPlayer === 'w' ? `${playerName} (White)` : `AI (White)`);
            this.elements.topPlayerName.text(humanPlayer === 'b' ? `${playerName} (Black)` : `AI (Black)`);
            this.elements.playerName.text(playerName);
        }
        
        _updateEvalBar(score) {
            const percentage = ((Math.atan(score / 350) / Math.PI) + 0.5) * 100;
            const clamped = Math.max(0.5, Math.min(99.5, percentage));
            gsap.to(this.elements.evalBarWhite, { height: `${clamped}%`, duration: 0.7, ease: 'power2.out' });
            gsap.to(this.elements.evalBarBlack, { height: `${100 - clamped}%`, duration: 0.7, ease: 'power2.out' });
        }
        
        _renderCoordinates() {
            const isFlipped = this.state.board.orientation() === 'black';
            const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
            let ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
            if (isFlipped) { files.reverse(); ranks.reverse(); }
            $('#top-files').html(files.map(f => `<span>${f}</span>`).join(''));
            $('#bottom-files').html(files.map(f => `<span>${f}</span>`).join(''));
            $('#left-ranks').html(ranks.slice().reverse().map(r => `<span>${r}</span>`).join(''));
            $('#right-ranks').html(ranks.slice().reverse().map(r => `<span>${r}</span>`).join(''));
        }
        
        _playMoveSound(move, isOpponent = false) {
            if (!this.state.isSoundEnabled || !move) return;
            if (move.san.includes('#') || move.promotion) return;
            if (move.san.includes('+')) { this.sounds.check.play(); }
            else if (move.flags.includes('k') || move.flags.includes('q')) { this.sounds.castle.play(); }
            else if (move.flags.includes('c') || move.flags.includes('e')) { this.sounds.capture.play(); }
            else { isOpponent ? this.sounds.moveOpponent.play() : this.sounds.moveSelf.play(); }
        }
        
        _highlightLegalMoves(square, sourceGame = this.state.game) {
            this._clearClickHighlights();
            const moves = sourceGame.moves({ square: square, verbose: true });
            if (moves.length === 0) return;
            this.elements.board.find(`[data-square="${square}"]`).addClass('highlight-selected');
            moves.forEach(move => this.elements.board.find(`[data-square="${move.to}"]`).addClass('highlight-legal'));
        }
        
        _highlightHint(from, to) { this.elements.board.find(`[data-square="${from}"], [data-square="${to}"]`).addClass('highlight-hint'); }
        _clearAllHighlights() { this._clearClickHighlights(); this._clearHintHighlights(); }
        _clearClickHighlights() { this.elements.board.find('[data-square]').removeClass('highlight-selected highlight-legal'); this.state.selectedSquare = null; }
        _clearHintHighlights() { this.elements.board.find('[data-square]').removeClass('highlight-hint'); }
        _removePremoveHighlight() { this.elements.board.find('.premove-highlight').removeClass('premove-highlight'); }
        
        _closeAllModals() {
            this.elements.modalContainer.addClass('hidden').attr('aria-hidden', 'true');
            this.elements.gameOverModal.addClass('hidden');
            this.elements.promotionModal.addClass('hidden');
        }
        
        _showPromotionDialog(color) {
            const pieceThemePath = PIECE_THEMES[this.elements.pieceThemeSelector.val()] || PIECE_THEMES.cburnett;
            this.elements.promotionChoices.empty();
            ['q', 'r', 'b', 'n'].forEach(p => {
                const img = $('<img>').attr('src', pieceThemePath.replace('{piece}', `${color}${p.toUpperCase()}`)).addClass('cursor-pointer hover:bg-stone-600 rounded-md w-16 h-16').data('piece', p);
                this.elements.promotionChoices.append(img);
            });
            this.elements.modalContainer.removeClass('hidden').attr('aria-hidden', 'false');
            this.elements.promotionModal.removeClass('hidden');
        }
        
        _calculateEloChange(player, opp, res) { return Math.round(this.config.K_FACTOR * (res - (1 / (1 + Math.pow(10, (opp - player) / 400))))); }
        
        _handleDifficultyChange(e) {
            const level = $(e.currentTarget).val();
            this.state.aiDifficulty = level;
            this._setAiElo(level);
            localStorage.setItem('aiDifficulty', level);
        }
        
        _setAiElo(level) { this.elements.eloDisplay.text(DIFFICULTY_SETTINGS[level]?.elo || 'N/A'); }
        
        _applyTheme() {
            const theme = THEMES.find(t => t.name === this.elements.themeSelector.val());
            if (theme) {
                document.documentElement.style.setProperty('--light-square-color', theme.colors.light);
                document.documentElement.style.setProperty('--dark-square-color', theme.colors.dark);
                localStorage.setItem('chessBoardTheme', theme.name);
            }
        }
        
        _applyPieceTheme() {
            localStorage.setItem('chessPieceTheme', this.elements.pieceThemeSelector.val());
            const currentFen = this.state.isInAnalysisMode ? this.state.reviewGame.fen() : this.state.game.fen();
            this._buildBoard(currentFen);
        }
        
        _toggleSound() {
            this.state.isSoundEnabled = !this.state.isSoundEnabled;
            Howler.mute(!this.state.isSoundEnabled);
            this._setSoundIcon();
            localStorage.setItem('chessSoundEnabled', this.state.isSoundEnabled);
        }
        
        _setSoundIcon() { this.elements.soundIcon.attr('src', this.state.isSoundEnabled ? 'icon/speaker-wave.png' : 'icon/speaker-x-mark.png'); }
        
        _editPlayerName() {
            Swal.fire({
                title: 'Enter your name', input: 'text', inputValue: this.state.playerName, showCancelButton: true,
                confirmButtonText: 'Save', background: '#2d3748', color: '#ffffff', confirmButtonColor: '#38a169',
                inputValidator: (v) => (!v || v.trim().length === 0) ? 'Please enter a name!' : (v.length > 15) ? 'Name cannot exceed 15 characters.' : null
            }).then((result) => {
                if (result.isConfirmed) {
                    this.state.playerName = result.value.trim();
                    localStorage.setItem('playerName', this.state.playerName);
                    this._updatePlayerLabels();
                }
            });
        }
    }

    window.chessGame = new ChessGame();
});
