$(document).ready(function() {
    const App = {
        // --- UI Element References ---
        ui: {
            board: $('#board'),
            status: $('#game-status'),
            openingName: $('#opening-name'),
            themeSelector: $('#theme-selector'),
            pieceThemeSelector: $('#piece-theme-selector'),
            capturedByWhite: $('#captured-by-white'),
            capturedByBlack: $('#captured-by-black'),
            restartBtn: $('#restart-button'),
            swapSidesBtn: $('#swap-sides-button'),
            undoBtn: $('#undo-button'),
            playerName: $('#player-name'),
            bottomPlayerName: $('#bottom-player-name'),
            topPlayerName: $('#top-player-name'),
            whiteAdvantage: $('#white-advantage'),
            blackAdvantage: $('#black-advantage'),
            moveHistoryLog: $('#move-history-log'),
            evalBarWhite: $('#eval-bar-white'),
            evalBarBlack: $('#eval-bar-black'),
            difficultySlider: $('#difficulty-slider'),
            eloDisplay: $('#elo-display'),
            topFiles: $('#top-files'),
            bottomFiles: $('#bottom-files'),
            leftRanks: $('#left-ranks'),
            rightRanks: $('#right-ranks'),
            soundToggle: $('#sound-toggle'),
            soundIcon: $('#sound-icon'),
            historyFirstBtn: $('#history-first'),
            historyPrevBtn: $('#history-prev'),
            historyNextBtn: $('#history-next'),
            historyLastBtn: $('#history-last'),
            runAnalysisBtn: $('#run-review-btn'),
            liveAnalysisToggle: $('#live-analysis-toggle'),
            liveAnalysisDisplay: $('#live-analysis-display'),
            topEngineMove: $('#top-engine-move'),
            topEngineLine: $('#top-engine-line'),
            tabButtons: $('.tab-button')
        },

        // --- Game State ---
        state: {
            board: null,
            game: new Chess(),
            gameActive: true,
            humanPlayer: 'w',
            aiPlayer: 'b',
            aiDifficulty: 5,
            pendingMove: null,
            pendingPremove: null,
            playerName: 'Player',
            stockfish: null,
            isStockfishThinking: false,
            sounds: {},
            isMuted: false,
            reviewMoveIndex: null,
            isLiveAnalysis: false
        },

        // ========================================================================
        // TABS & INITIALIZATION
        // ========================================================================

        init: function() {
            this.initTabs();
            this.initMovesTab();
            this.initAnalysisTab();
            this.initSettingsTab();
            this.loadSettings();
            this.initEngine();
        },

        initTabs: function() {
            this.ui.tabButtons.on('click', (e) => {
                this.showTab($(e.currentTarget).data('tab'));
            });
        },
        
        showTab: function(tabId) {
            $('.tab-content').removeClass('active');
            $('.tab-button').removeClass('active');
            $(`#${tabId}-tab`).addClass('active');
            $(`[data-tab="${tabId}"]`).addClass('active');
        },

        initEngine: function() {
            fetch(APP_CONFIG.STOCKFISH_URL)
                .then(response => { if (!response.ok) throw new Error('Network response was not ok'); return response.text(); })
                .then(text => {
                    this.state.stockfish = new Worker(URL.createObjectURL(new Blob([text], { type: 'application/javascript' })));
                    this.state.stockfish.onmessage = this.handleEngineMessage.bind(this);
                    this.initGame();
                })
                .catch(() => {
                    $('#analysis-tab').html(`<div class="text-center"><h3 class="text-red-400 font-bold">AI Engine Failed to Load</h3><p class="text-stone-400 text-sm">Please run from a local server.</p></div>`);
                    this.showTab('analysis');
                });
        },

        handleEngineMessage: function(event) {
            const message = event.data;
            if (message.startsWith('bestmove')) {
                this.performMove(message.split(' ')[1]);
            } else if (message.startsWith('info depth')) {
                const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
                if (scoreMatch) {
                    let score = parseInt(scoreMatch[2], 10);
                    if (scoreMatch[1] === 'mate') score = (score > 0 ? 1 : -1) * APP_CONFIG.MATE_SCORE;
                    if (this.state.game.turn() === 'b') score = -score;
                    this.updateEvalBar(score);
                }
                if (this.state.isLiveAnalysis && !this.state.isStockfishThinking) {
                    const pvMatch = message.match(/pv (.+)/);
                    if (pvMatch) {
                        const tempGame = new Chess(this.state.game.fen());
                        const moves = pvMatch[1].split(' ');
                        const firstMove = tempGame.move(moves[0], { sloppy: true });
                        if (firstMove) {
                            this.ui.topEngineMove.text(firstMove.san);
                            const nextMoves = moves.slice(1).map(uci => tempGame.move(uci, { sloppy: true })?.san).filter(Boolean).join(' ');
                            this.ui.topEngineLine.text(nextMoves);
                        }
                    }
                }
            }
        },

        // ========================================================================
        // MOVES TAB
        // ========================================================================

        initMovesTab: function() {
            this.ui.restartBtn.on('click', this.initGame.bind(this));
            this.ui.swapSidesBtn.on('click', () => {
                [this.state.humanPlayer, this.state.aiPlayer] = [this.state.aiPlayer, this.state.humanPlayer];
                this.initGame();
            });
            this.ui.undoBtn.on('click', this.undoMove.bind(this));
            this.ui.moveHistoryLog.on('click', '.move-span', (e) => {
                this.state.reviewMoveIndex = parseInt($(e.currentTarget).data('move-index'));
                this.showHistoryPosition();
            });
            this.ui.historyFirstBtn.on('click', () => { if (!this.ui.historyFirstBtn.prop('disabled')) { this.state.reviewMoveIndex = 0; this.showHistoryPosition(); } });
            this.ui.historyPrevBtn.on('click', () => { if (!this.ui.historyPrevBtn.prop('disabled')) { if (this.state.reviewMoveIndex === null) this.state.reviewMoveIndex = this.state.game.history().length - 1; if (this.state.reviewMoveIndex > 0) this.state.reviewMoveIndex--; this.showHistoryPosition(); } });
            this.ui.historyNextBtn.on('click', () => { if (!this.ui.historyNextBtn.prop('disabled')) { if (this.state.reviewMoveIndex === null) return; if (this.state.reviewMoveIndex < this.state.game.history().length - 1) this.state.reviewMoveIndex++; this.showHistoryPosition(); } });
            this.ui.historyLastBtn.on('click', this.exitReviewMode.bind(this));
        },

        updateMoveHistoryDisplay: function() {
            const history = this.state.game.history({ verbose: true });
            let html = '';
            for (let i = 0; i < history.length; i += 2) {
                const moveNum = (i / 2) + 1;
                const w_move = history[i];
                const b_move = history[i+1];
                const w_highlight = (this.state.reviewMoveIndex === i) ? 'highlight-move' : '';
                const b_highlight = (b_move && this.state.reviewMoveIndex === i+1) ? 'highlight-move' : '';
                html += `<div><span class="font-bold w-6 inline-block">${moveNum}.</span>`;
                if (w_move) html += `<span class="move-span ${w_highlight}" data-move-index="${i}">${w_move.san}</span> `;
                if (b_move) html += `<span class="move-span ${b_highlight}" data-move-index="${i+1}">${b_move.san}</span>`;
                html += `</div>`;
            }
            this.ui.moveHistoryLog.html(html);
            if (this.state.reviewMoveIndex === null) {
                this.ui.moveHistoryLog.scrollTop(this.ui.moveHistoryLog[0].scrollHeight);
            }
            this.updateNavButtons();
        },

        undoMove: function() {
            if (!this.ui.undoBtn.prop('disabled')) {
                this.exitReviewMode();
                this.state.game.undo();
                this.state.game.undo();
                this.updateGameState(true);
            }
        },

        // ========================================================================
        // ANALYSIS TAB
        // ========================================================================
        
        initAnalysisTab: function() {
            this.ui.liveAnalysisToggle.on('change', () => {
                this.state.isLiveAnalysis = this.ui.liveAnalysisToggle.is(':checked');
                if (this.state.isLiveAnalysis) {
                    this.ui.liveAnalysisDisplay.removeClass('hidden');
                    this.runLiveAnalysis();
                } else {
                    this.ui.liveAnalysisDisplay.addClass('hidden');
                    if (this.state.stockfish) this.state.stockfish.postMessage('stop');
                }
            });
            // Placeholder for future full review functionality
            this.ui.runAnalysisBtn.on('click', () => {
                Swal.fire('Coming Soon!', 'Full game review will be implemented here.', 'info');
            });
        },

        runLiveAnalysis: function() {
            if (!this.state.stockfish || this.state.isStockfishThinking || this.state.game.game_over()) return;
            this.state.stockfish.postMessage(`position fen ${this.state.game.fen()}`);
            this.state.stockfish.postMessage('go infinite');
        },

        updateOpeningName: function() {
            const pgn = this.state.game.pgn();
            let currentOpening = '';
            if (pgn) {
                for (let i = OPENINGS.length - 1; i >= 0; i--) {
                    if (pgn.startsWith(OPENINGS[i].pgn)) {
                        currentOpening = OPENINGS[i].name;
                        break;
                    }
                }
            }
            this.ui.openingName.text(currentOpening);
        },

        updateEvalBar: function(score) {
            const evalPercentage = 50 * (1 + (2 / Math.PI) * Math.atan(score / 350));
            const clamped = Math.max(0.5, Math.min(99.5, evalPercentage));
            gsap.to(this.ui.evalBarWhite, { height: `${clamped}%`, duration: 0.7, ease: 'power2.out' });
            gsap.to(this.ui.evalBarBlack, { height: `${100 - clamped}%`, duration: 0.7, ease: 'power2.out' });
        },

        // ========================================================================
        // SETTINGS TAB
        // ========================================================================

        initSettingsTab: function() {
            this.ui.difficultySlider.on('input', e => {
                this.state.aiDifficulty = parseInt(e.target.value, 10);
                this.setAiElo(this.state.aiDifficulty);
                localStorage.setItem('chessDifficulty', this.state.aiDifficulty);
            });
            this.ui.themeSelector.on('change', this.applyTheme.bind(this));
            this.ui.pieceThemeSelector.on('change', this.applyPieceTheme.bind(this));
            this.ui.soundToggle.on('click', this.toggleSound.bind(this));
            this.ui.playerName.on('click', () => {
                Swal.fire({
                    title: 'Enter your name', input: 'text', inputValue: this.state.playerName,
                    showCancelButton: true, confirmButtonText: 'Save',
                    customClass: { popup: '!bg-stone-800', title: '!text-white', input: '!text-black' },
                    inputValidator: v => !v || v.trim().length === 0 ? 'Please enter a name!' : null
                }).then(r => {
                    if (r.isConfirmed) {
                        this.state.playerName = r.value.trim();
                        localStorage.setItem('chessPlayerName', this.state.playerName);
                        this.updatePlayerLabels();
                    }
                });
            });
        },
        
        loadSettings: function() {
            this.ui.themeSelector.empty();
            this.ui.pieceThemeSelector.empty();
            THEMES.forEach(theme => this.ui.themeSelector.append($('<option>', { value: theme.name, text: theme.displayName })));
            Object.keys(PIECE_THEMES).forEach(themeName => this.ui.pieceThemeSelector.append($('<option>', { value: themeName, text: themeName.charAt(0).toUpperCase() + themeName.slice(1) })));

            this.state.isMuted = localStorage.getItem('chessSoundMuted') === 'true';
            this.updateSoundIcon();
            this.ui.themeSelector.val(localStorage.getItem('chessBoardTheme') || APP_CONFIG.DEFAULT_BOARD_THEME);
            this.ui.pieceThemeSelector.val(localStorage.getItem('chessPieceTheme') || APP_CONFIG.DEFAULT_PIECE_THEME);
            this.state.playerName = localStorage.getItem('chessPlayerName') || 'Player';
            this.state.aiDifficulty = parseInt(localStorage.getItem('chessDifficulty') || '5', 10);
            this.ui.difficultySlider.val(this.state.aiDifficulty);
            this.setAiElo(this.state.aiDifficulty);
        },

        // --- All other functions are placed below, encapsulated within the App object ---
        initGame: function() { /* ... */ },
        updateGameState: function(updateBoard = true) { /* ... */ },
        onDrop: function(source, target) { /* ... */ },
        onDragStart: function(source, piece) { /* ... */ },
        performMove: function(move) { /* ... */ },
        executePremove: function() { /* ... */ },
        makeAiMove: function() { /* ... */ },
        showHistoryPosition: function() { /* ... */ },
        exitReviewMode: function() { /* ... */ },
        updateNavButtons: function() { /* ... */ },
        removePremoveHighlight: function() { this.ui.board.find('.premove-highlight').removeClass('premove-highlight'); },
        applyTheme: function() { localStorage.setItem('chessBoardTheme', this.ui.themeSelector.val()); this.buildBoard(this.state.game.fen()); },
        applyPieceTheme: function() { localStorage.setItem('chessPieceTheme', this.ui.pieceThemeSelector.val()); this.buildBoard(this.state.game.fen()); },
        renderCoordinates: function() { /* ... */ },
        updatePlayerLabels: function() { /* ... */ },
        updateStatus: function() { /* ... */ },
        updateCapturedPieces: function() { /* ... */ },
        showPromotionDialog: function(color) { /* ... */ },
        setAiElo: function(lvl) { this.ui.eloDisplay.text(DIFFICULTY_SETTINGS[lvl]?.elo || 1200); },
        endGame: function() { /* ... */ },
    };

    // Replace the function bodies with their full implementations
    App.initGame = function() {
        this.exitReviewMode();
        this.state.game.reset();
        this.state.gameActive = true;
        this.state.isStockfishThinking = false;
        this.state.pendingPremove = null;
        this.state.pendingMove = null;
        this.removePremoveHighlight();
        this.buildBoard('start');
        this.updatePlayerLabels();
        this.updateEvalBar(0);
        this.updateGameState(false);
        this.playSound('gameStart');
        this.ui.runAnalysisBtn.prop('disabled', true).addClass('hidden');
        this.ui.liveAnalysisToggle.prop('checked', false).trigger('change');
        this.showTab('moves');
        if (this.state.game.turn() === this.state.aiPlayer) {
            setTimeout(this.makeAiMove.bind(this), 500);
        }
    };
    App.updateGameState = function(updateBoard = true) {
        if (updateBoard && this.state.reviewMoveIndex === null) {
            this.state.board.position(this.state.game.fen());
        }
        this.updateStatus();
        this.updateCapturedPieces();
        this.updateMoveHistoryDisplay();
        this.updateOpeningName();
        if (this.state.isLiveAnalysis && !this.state.isStockfishThinking) {
            this.runLiveAnalysis();
        }
        if (!this.state.gameActive || this.state.game.game_over()) {
            if (this.state.gameActive) this.endGame();
            return;
        }
        if (this.state.game.turn() === this.state.aiPlayer && !this.state.isStockfishThinking && this.state.reviewMoveIndex === null) {
            this.makeAiMove();
        }
    };
    App.onDrop = function(source, target) {
        if (this.state.reviewMoveIndex !== null) return;
        if (this.state.isStockfishThinking && this.state.game.turn() !== this.state.humanPlayer) {
            this.removePremoveHighlight();
            this.state.pendingPremove = { from: source, to: target };
            this.ui.board.find(`.square-${source}`).addClass('premove-highlight');
            this.ui.board.find(`.square-${target}`).addClass('premove-highlight');
            return 'snapback';
        }
        if (this.state.game.turn() !== this.state.humanPlayer) return 'snapback';
        const move = this.state.game.moves({ verbose: true }).find(m => m.from === source && m.to === target);
        if (!move) return 'snapback';
        if (move.flags.includes('p') && (move.to.endsWith('8') || move.to.endsWith('1'))) {
            this.state.pendingMove = { from: source, to: target, promotion: 'q' };
            this.showPromotionDialog(this.state.humanPlayer);
            return;
        }
        const moveResult = this.state.game.move(move.san);
        if (moveResult) {
            this.playMoveSound(moveResult);
            this.updateGameState(false);
        }
    };
    App.onDragStart = function(source, piece) {
        return this.state.reviewMoveIndex === null && this.state.gameActive && !this.state.game.game_over() && piece.startsWith(this.state.humanPlayer) && (this.state.game.turn() === this.state.humanPlayer || this.state.isStockfishThinking);
    };
    App.performMove = function(move) {
        const moveResult = this.state.game.move(move, { sloppy: true });
        this.state.isStockfishThinking = false;
        if (moveResult) {
            this.playMoveSound(moveResult);
            this.updateGameState(true);
            if (this.state.pendingPremove && this.state.gameActive) setTimeout(this.executePremove.bind(this), 50);
        }
    };
    App.executePremove = function() {
        if (!this.state.pendingPremove) return;
        const move = this.state.pendingPremove;
        this.state.pendingPremove = null;
        this.removePremoveHighlight();
        const validPremove = this.state.game.moves({ verbose: true }).find(m => m.from === move.from && m.to === move.to);
        if (validPremove) this.performMove(validPremove.san);
    };
    App.showHistoryPosition = function() {
        if (this.state.reviewMoveIndex === null) return;
        const history = this.state.game.history({ verbose: true });
        const tempGame = new Chess();
        for (let i = 0; i <= this.state.reviewMoveIndex; i++) { tempGame.move(history[i].san); }
        this.state.board.position(tempGame.fen());
        this.updateMoveHistoryDisplay();
        this.updateNavButtons();
        this.ui.status.text(`Reviewing move ${Math.floor(this.state.reviewMoveIndex / 2) + 1}...`);
    };
    App.exitReviewMode = function() {
        if (this.state.reviewMoveIndex === null) return;
        this.state.reviewMoveIndex = null;
        this.state.board.position(this.state.game.fen());
        this.updateMoveHistoryDisplay();
        this.updateNavButtons();
        this.updateStatus();
    };
    App.updateNavButtons = function() {
        const historyLen = this.state.game.history().length;
        if (this.state.reviewMoveIndex === null) {
            this.ui.historyFirstBtn.prop('disabled', historyLen === 0);
            this.ui.historyPrevBtn.prop('disabled', historyLen === 0);
            this.ui.historyNextBtn.prop('disabled', true);
            this.ui.historyLastBtn.prop('disabled', true);
        } else {
            this.ui.historyFirstBtn.prop('disabled', this.state.reviewMoveIndex <= 0);
            this.ui.historyPrevBtn.prop('disabled', this.state.reviewMoveIndex <= 0);
            this.ui.historyNextBtn.prop('disabled', this.state.reviewMoveIndex >= historyLen - 1);
            this.ui.historyLastBtn.prop('disabled', false);
        }
    };
    App.renderCoordinates = function() { const isFlipped = this.state.humanPlayer === 'b'; const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']; let ranks = ['1', '2', '3', '4', '5', '6', '7', '8']; if (isFlipped) { files.reverse(); ranks.reverse(); } const topFilesHtml = files.map(f => `<span>${f}</span>`).join(''); const bottomFilesHtml = files.map(f => `<span>${f}</span>`).join(''); const ranksHtml = ranks.slice().reverse().map(r => `<span>${r}</span>`).join(''); this.ui.topFiles.html(topFilesHtml); this.ui.bottomFiles.html(bottomFilesHtml); this.ui.leftRanks.html(ranksHtml); this.ui.rightRanks.html(ranksHtml); };
    App.updatePlayerLabels = function() { this.ui.bottomPlayerName.text(this.state.humanPlayer === 'w' ? `${this.state.playerName} (White)` : `AI (White)`); this.ui.topPlayerName.text(this.state.humanPlayer === 'b' ? `${this.state.playerName} (Black)` : `AI (Black)`); };
    App.updateStatus = function() { if (this.state.reviewMoveIndex !== null) { this.ui.undoBtn.prop('disabled', true); return; } const turn = this.state.game.turn() === 'w' ? 'White' : 'Black'; let text = this.state.game.game_over() ? 'Game Over' : `${turn}'s Turn`; if (this.state.game.in_check()) text += ' (in Check)'; if (!this.state.isStockfishThinking) this.ui.status.text(text).removeClass('thinking-animation'); const isPlayerTurn = this.state.game.turn() === this.state.humanPlayer && this.state.gameActive; this.ui.undoBtn.prop('disabled', !isPlayerTurn || this.state.game.history().length < 2); };
    App.updateCapturedPieces = function() { const pieceThemePath = PIECE_THEMES[this.ui.pieceThemeSelector.val()]; if (!pieceThemePath) return; const capturedBy = { w: [], b: [] }; this.state.game.history({ verbose: true }).forEach(move => { if (move.captured) { const capturerColor = move.color === 'w' ? 'b' : 'w'; capturedBy[capturerColor].push({ type: move.captured, color: move.color === 'w' ? 'b' : 'w' }); } }); const pieceOrder = { p: 1, n: 2, b: 3, r: 4, q: 5 }; capturedBy.w.sort((a,b) => pieceOrder[a.type] - pieceOrder[b.type]); capturedBy.b.sort((a,b) => pieceOrder[a.type] - pieceOrder[b.type]); const whiteCapturedHtml = capturedBy.b.map(p => `<img src="${pieceThemePath.replace('{piece}', p.color + p.type.toUpperCase())}" class="captured-piece" />`).join(''); const blackCapturedHtml = capturedBy.w.map(p => `<img src="${pieceThemePath.replace('{piece}', p.color + p.type.toUpperCase())}" class="captured-piece" />`).join(''); this.ui.capturedByWhite.html(whiteCapturedHtml); this.ui.capturedByBlack.html(blackCapturedHtml); const whiteMat = capturedBy.b.reduce((acc, p) => acc + (MATERIAL_POINTS[p.type] || 0), 0); const blackMat = capturedBy.w.reduce((acc, p) => acc + (MATERIAL_POINTS[p.type] || 0), 0); const adv = whiteMat - blackMat; this.ui.whiteAdvantage.text(adv > 0 ? `+${adv}` : ''); this.ui.blackAdvantage.text(adv < 0 ? `+${-adv}` : ''); };
    App.showPromotionDialog = function(color) { const pieceThemePath = PIECE_THEMES[this.ui.pieceThemeSelector.val()]; const pieces = ['q', 'r', 'b', 'n']; const promotion_choices_html = pieces.map(p => `<img src="${pieceThemePath.replace('{piece}', `${color}${p.toUpperCase()}`)}" data-piece="${p}" class="promotion-piece" style="cursor: pointer; padding: 5px; border-radius: 5px; width: 60px; height: 60px;" onmouseover="this.style.backgroundColor='#4a5568';" onmouseout="this.style.backgroundColor='transparent';" />`).join(''); Swal.fire({ title: 'Promote to:', html: `<div style="display: flex; justify-content: space-around;">${promotion_choices_html}</div>`, showConfirmButton: false, allowOutsideClick: false, customClass: { popup: '!bg-stone-700', title: '!text-white' }, willOpen: () => { $(Swal.getPopup()).on('click', '.promotion-piece', () => { if (this.state.pendingMove) { this.state.pendingMove.promotion = $(event.target).data('piece'); this.performMove(this.state.pendingMove); this.state.pendingMove = null; Swal.close(); } }); } }); };
    App.endGame = function() { this.state.gameActive = false; this.state.isStockfishThinking = false; let msg = ""; if (this.state.game.in_checkmate()) { msg = `Checkmate! ${this.state.game.turn() === 'w' ? 'Black' : 'White'} wins.`; } else { msg = "Game is a draw."; } this.ui.status.text(msg); this.playSound('end'); this.ui.runAnalysisBtn.prop('disabled', false).removeClass('hidden'); this.showTab('analysis'); };

    // --- Kickstart the Application ---
    App.init();
});
