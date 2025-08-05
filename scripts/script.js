$(document).ready(function() {
    // --- Element Refs ---
    const boardElement = $('#board');
    const statusElement = $('#game-status');
    const openingNameElement = $('#opening-name');
    const themeSelector = $('#theme-selector');
    const pieceThemeSelector = $('#piece-theme-selector');
    const uiThemeSelector = $('#ui-theme-selector');
    const capturedByWhiteElement = $('#captured-by-white');
    const capturedByBlackElement = $('#captured-by-black');
    const restartButton = $('#restart-button');
    const swapSidesButton = $('#swap-sides-button');
    const undoButton = $('#undo-button');
    const playerNameElement = $('#player-name');
    const bottomPlayerNameElement = $('#bottom-player-name');
    const topPlayerNameElement = $('#top-player-name');
    const whiteAdvantageElement = $('#white-advantage');
    const blackAdvantageElement = $('#black-advantage');
    const moveHistoryLog = $('#move-history-log');
    const evalBarWhite = $('#eval-bar-white');
    const evalBarBlack = $('#eval-bar-black');
    const difficultySlider = $('#difficulty-slider');
    const eloDisplay = $('#elo-display');
    const topFiles = $('#top-files');
    const bottomFiles = $('#bottom-files');
    const leftRanks = $('#left-ranks');
    const rightRanks = $('#right-ranks');
    const soundToggle = $('#sound-toggle');
    const soundIcon = $('#sound-icon');
    const historyFirstBtn = $('#history-first');
    const historyPrevBtn = $('#history-prev');
    const historyNextBtn = $('#history-next');
    const historyLastBtn = $('#history-last');
    const runAnalysisBtn = $('#run-review-btn');
    const liveAnalysisToggle = $('#live-analysis-toggle');
    const liveAnalysisDisplay = $('#live-analysis-display');
    const topEngineMoveElement = $('#top-engine-move');
    const topEngineLineElement = $('#top-engine-line');
    const mainGameView = $('#main-game');
    const analysisRoomView = $('#analysis-room');
    const returnToGameBtn = $('#return-to-game-btn');
    const logBoxToggle = $('#log-box-toggle');
    const logBoxContainer = $('#log-box-container');
    const logBoxHeader = $('#log-box-header');
    const logBoxContent = $('#log-box-content');
    const logBoxClearBtn = $('#log-box-clear');
    const logBoxCloseBtn = $('#log-box-close');
    const summaryOpeningName = $('#summary-opening-name');
    const summaryFinalMaterial = $('#summary-final-material');
    const hintButton = $('#hint-button');
    const threatsToggle = $('#threats-toggle');
    const fenInput = $('#fen-input');
    const loadFenBtn = $('#load-fen-btn');
    const exportPgnBtn = $('#export-pgn-btn');
    const openingExplorer = $('#opening-explorer');
    const openingExplorerContent = $('#opening-explorer-content');
    const boardSvgOverlay = $('#board-svg-overlay');

    // --- Game State ---
    let board = null;
    const game = new Chess();
    let gameActive = true;
    let humanPlayer = 'w';
    let aiPlayer = 'b';
    let aiDifficulty = 5;
    let pendingMove = null;
    let pendingPremove = null;
    let selectedSquare = null;
    let playerName = 'Player';
    let stockfish;
    let isStockfishThinking = false;
    let sounds = {};
    let isMuted = false;
    let reviewMoveIndex = null;
    let isLiveAnalysis = false;
    let engineTimeout = null;
    let isAnalysisMode = false;
    let highlightThreats = false;

    // --- View Management ---
    function switchToMainGame() {
        isAnalysisMode = false;
        analysisRoomView.addClass('hidden');
        mainGameView.removeClass('hidden');
        if (window.AnalysisController && typeof window.AnalysisController.stop === 'function') {
            window.AnalysisController.stop();
        }
        if (window.loadFenOnReturn) {
            initGameFromFen(window.loadFenOnReturn);
            delete window.loadFenOnReturn;
        } else {
            runAnalysisBtn.prop('disabled', game.history().length === 0).text('Run Full Game Review');
        }
    }

    function switchToAnalysisRoom() {
        isAnalysisMode = true;
        mainGameView.addClass('hidden');
        analysisRoomView.removeClass('hidden');
        window.gameDataToAnalyze = {
            pgn: game.pgn(), stockfish: stockfish, history: game.history({ verbose: true })
        };
        if (window.AnalysisController && typeof window.AnalysisController.init === 'function') {
            window.AnalysisController.init();
        } else {
            console.error('AnalysisController not available');
            Swal.fire('Error', 'Analysis system not loaded properly.', 'error');
        }
    }
    
    // --- Sound Logic ---
    function initSounds() {
        Object.keys(SOUND_PATHS).forEach(key => {
            sounds[key] = new Howl({ src: [SOUND_PATHS[key]] });
        });
    }

    function playSound(soundName) {
        if (isMuted) return;
        if (sounds[soundName]) sounds[soundName].play();
    }

    function playMoveSound(move) {
        if (move.flags.includes('p')) playSound('promote');
        else if (move.flags.includes('k') || move.flags.includes('q')) playSound('castle');
        else if (move.flags.includes('c')) playSound('capture');
        else playSound('moveSelf');
        if (game.in_check()) playSound('check');
    }

    // --- Core Game Logic ---
    function buildBoard(position = 'start') {
        const selectedTheme = THEMES.find(t => t.name === themeSelector.val()) || THEMES[0];
        document.documentElement.style.setProperty('--light-square-color', selectedTheme.colors.light);
        document.documentElement.style.setProperty('--dark-square-color', selectedTheme.colors.dark);
        const config = { position, draggable: true, onDragStart, onDrop, pieceTheme: PIECE_THEMES[pieceThemeSelector.val()], moveSpeed: 200 };
        if (board) board.destroy();
        board = Chessboard('board', config);
        
        boardElement.find('.square-55d63').on('click', onSquareClick);
        
        board.orientation(humanPlayer === 'w' ? 'white' : 'black');
        renderCoordinates();
        syncSidebarHeight();
    }

    function initGame() {
        exitReviewMode();
        game.reset();
        gameActive = true;
        isStockfishThinking = false;
        pendingPremove = null;
        pendingMove = null;
        removePremoveHighlight();
        removeLegalHighlights();
        selectedSquare = null;
        clearArrows();
        buildBoard('start');
        updatePlayerLabels();
        updateEvalBar(0);
        updateGameState(false);
        playSound('gameStart');
        runAnalysisBtn.prop('disabled', true);
        $('#game-summary-section').addClass('hidden');
        liveAnalysisToggle.prop('checked', false).trigger('change');
        showTab('moves');
        if (game.turn() === aiPlayer) {
            setTimeout(makeAiMove, 500);
        }
    }
    
    function initGameFromFen(fen) {
        console.log("Initializing game from FEN:", fen);
        exitReviewMode();
        if (!game.load(fen)) {
            console.error("Invalid FEN provided:", fen);
            Swal.fire('Error', 'The provided FEN string is invalid.', 'error');
            return;
        }
        gameActive = true;
        isStockfishThinking = false;
        pendingPremove = null;
        pendingMove = null;
        removePremoveHighlight();
        removeLegalHighlights();
        selectedSquare = null;
        clearArrows();
        buildBoard(game.fen());
        updatePlayerLabels();
        if (isLiveAnalysis) runLiveAnalysis();
        else updateEvalBar(0);
        updateGameState(false);
        playSound('notify');
        runAnalysisBtn.prop('disabled', true);
        $('#game-summary-section').addClass('hidden');
        showTab('moves');
        if (game.turn() === aiPlayer) {
            setTimeout(makeAiMove, 500);
        }
    }

    function updateGameState(updateBoard = true) {
        if (updateBoard && reviewMoveIndex === null) {
            board.position(game.fen());
        }
        updateStatus();
        updateCapturedPieces();
        updateMoveHistoryDisplay();
        updateOpeningName();
        updateThreatHighlights();
        updateOpeningExplorer();
        if (isLiveAnalysis && !isStockfishThinking) {
            runLiveAnalysis();
        }
        if (!gameActive || game.game_over()) {
            if (gameActive) endGame();
            return;
        }
        if (game.turn() === aiPlayer && !isStockfishThinking && reviewMoveIndex === null) {
            makeAiMove();
        }
    }

    function performMove(move) {
        removeLegalHighlights();
        selectedSquare = null;
        clearTimeout(engineTimeout);
        const moveResult = game.move(move, { sloppy: true });
        isStockfishThinking = false;
        if (moveResult) {
            playMoveSound(moveResult);
            updateGameState(true);
            if (pendingPremove && gameActive) setTimeout(executePremove, 50);
        }
    }

    function executePremove() {
        if (!pendingPremove) return;
        const move = pendingPremove;
        pendingPremove = null;
        removePremoveHighlight();
        clearArrows();
        const validPremove = game.moves({ verbose: true }).find(m => m.from === move.from && m.to === move.to);
        if (validPremove) {
            const moveResult = game.move(validPremove.san);
            if (moveResult) {
                playMoveSound(moveResult);
                updateGameState(false);
            }
        }
    }
    
    function makeAiMove() {
        if (!gameActive || game.game_over()) return;
        isStockfishThinking = true;
        statusElement.text("AI is thinking...").addClass('thinking-animation');
        engineTimeout = setTimeout(() => {
            console.error("AI Timeout: Engine did not respond in 20 seconds.");
            isStockfishThinking = false;
            statusElement.text("AI Timeout. Can't move.").removeClass('thinking-animation');
            updateStatus();
        }, 20000);
        const difficulty = DIFFICULTY_SETTINGS[aiDifficulty];
        const fen = game.fen();
        console.log(`Sending to engine: position fen ${fen}`);
        stockfish.postMessage(`position fen ${fen}`);
        let goCommand = '';
        switch (difficulty.type) {
            case 'random':
                setTimeout(() => performMove(game.moves()[Math.floor(Math.random() * game.moves().length)]), 300);
                return;
            case 'greedy':
                let bestMove = null;
                let maxVal = -1;
                game.moves({ verbose: true }).forEach(move => {
                    let moveVal = 0;
                    if (move.captured) moveVal = MATERIAL_POINTS[move.captured] || 0;
                    if (moveVal > maxVal) { maxVal = moveVal; bestMove = move; }
                });
                if (!bestMove) bestMove = game.moves({verbose: true})[Math.floor(Math.random() * game.moves().length)];
                setTimeout(() => performMove(bestMove.san), 300);
                return;
            case 'stockfish':
                if (difficulty.depth) goCommand = `go depth ${difficulty.depth}`;
                else if (difficulty.movetime) goCommand = `go movetime ${difficulty.movetime}`;
                break;
        }
        console.log(`Sending to engine: ${goCommand}`);
        stockfish.postMessage(goCommand);
    }

    function runLiveAnalysis() {
        if (!stockfish || isStockfishThinking || game.game_over()) return;
        console.log("Starting live analysis.");
        stockfish.postMessage(`position fen ${game.fen()}`);
        stockfish.postMessage('go infinite');
    }

    function showHistoryPosition() {
        if (reviewMoveIndex === null) return;
        const history = game.history({ verbose: true });
        const tempGame = new Chess();
        for (let i = 0; i <= reviewMoveIndex; i++) { tempGame.move(history[i].san); }
        board.position(tempGame.fen());
        updateMoveHistoryDisplay();
        updateNavButtons();
        statusElement.text(`Reviewing move ${Math.floor(reviewMoveIndex / 2) + 1}...`);
    }

    function exitReviewMode() {
        if (reviewMoveIndex === null) return;
        reviewMoveIndex = null;
        board.position(game.fen());
        updateMoveHistoryDisplay();
        updateNavButtons();
        updateStatus();
    }
    
    function updateNavButtons() {
        const historyLen = game.history().length;
        exportPgnBtn.prop('disabled', historyLen === 0);
        if (reviewMoveIndex === null) {
            historyFirstBtn.prop('disabled', historyLen === 0);
            historyPrevBtn.prop('disabled', historyLen === 0);
            historyNextBtn.prop('disabled', true);
            historyLastBtn.prop('disabled', true);
        } else {
            historyFirstBtn.prop('disabled', reviewMoveIndex <= 0);
            historyPrevBtn.prop('disabled', reviewMoveIndex <= 0);
            historyNextBtn.prop('disabled', reviewMoveIndex >= historyLen - 1);
            historyLastBtn.prop('disabled', false);
        }
    }

    function showPromotionDialog(color) {
        const pieceThemePath = PIECE_THEMES[pieceThemeSelector.val()];
        const pieces = ['q', 'r', 'b', 'n'];
        const promotion_choices_html = pieces.map(p => `<img src="${pieceThemePath.replace('{piece}', `${color}${p.toUpperCase()}`)}" data-piece="${p}" class="promotion-piece" style="cursor: pointer; padding: 5px; border-radius: 5px; width: 60px; height: 60px;" onmouseover="this.style.backgroundColor='#4a5568';" onmouseout="this.style.backgroundColor='transparent';" />`).join('');
        Swal.fire({
            title: 'Promote to:', html: `<div style="display: flex; justify-content: space-around;">${promotion_choices_html}</div>`,
            showConfirmButton: false, allowOutsideClick: false, customClass: { popup: '!bg-stone-700', title: '!text-white' },
            willOpen: () => {
                $(Swal.getPopup()).on('click', '.promotion-piece', function() {
                    if (pendingMove) {
                        pendingMove.promotion = $(this).data('piece');
                        const moveResult = game.move(pendingMove);
                        if (moveResult) {
                            playMoveSound(moveResult);
                            updateGameState(false);
                        }
                        pendingMove = null;
                        Swal.close();
                    }
                });
            }
        });
    }

    function endGame() {
        gameActive = false;
        isStockfishThinking = false;
        let msg = "";
        if (game.in_checkmate()) { msg = `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins.`; }
        else { msg = "Game is a draw."; }
        statusElement.text(msg);
        playSound('gameEnd');
        runAnalysisBtn.prop('disabled', false);
        updateGameSummary();
        $('#game-summary-section').removeClass('hidden');
        showTab('analysis');
    }
    
    function initLogBox() {
        const originalConsole = { log: console.log, error: console.error, warn: console.warn };
        const logToBox = (message, type) => {
            if (logBoxContainer.is(':hidden')) return;
            let formattedMessage = '';
            try {
                formattedMessage = typeof message === 'object' ? JSON.stringify(message) : message;
            } catch (e) { formattedMessage = '[[Unserializable Object]]'; }
            const timestamp = new Date().toLocaleTimeString();
            logBoxContent.append(`<div class="log-message ${type}"><span class="text-gray-500">${timestamp}:</span> ${formattedMessage}</div>`);
            logBoxContent.scrollTop(logBoxContent[0].scrollHeight);
        };
        console.log = function(message) { originalConsole.log.apply(console, arguments); logToBox(message, 'log-info'); };
        console.error = function(message) { originalConsole.error.apply(console, arguments); logToBox(message, 'log-error'); };
        console.warn = function(message) { originalConsole.warn.apply(console, arguments); logToBox(message, 'log-warn'); };
        logBoxToggle.on('change', function() { logBoxContainer.toggleClass('hidden', !this.checked); if (this.checked) console.log("Log box opened."); });
        logBoxClearBtn.on('click', () => logBoxContent.empty());
        logBoxCloseBtn.on('click', () => logBoxToggle.prop('checked', false).trigger('change'));
        let isDragging = false, offset = { x: 0, y: 0 };
        logBoxHeader.on('mousedown', function(e) {
            isDragging = true;
            let containerOffset = logBoxContainer.offset();
            offset.x = e.clientX - containerOffset.left;
            offset.y = e.clientY - containerOffset.top;
            $(document).on('mousemove.logbox', e => { if (isDragging) logBoxContainer.css({ top: e.clientY - offset.y, left: e.clientX - offset.x }); });
        });
        $(document).on('mouseup', () => { isDragging = false; $(document).off('mousemove.logbox'); });
    }
    
    // --- Application Initialization ---
    function initApp() {
        initSounds();
        initLogBox();
        
        $('.tab-button').on('click', function() { showTab($(this).data('tab')); });
        restartButton.on('click', initGame);
        swapSidesButton.on('click', () => { [humanPlayer, aiPlayer] = [aiPlayer, humanPlayer]; initGame(); });
        
        undoButton.on('click', () => {
            if (undoButton.prop('disabled')) return;
            removeLegalHighlights();
            selectedSquare = null;
            exitReviewMode();
            clearArrows();
            if (game.history().length >= 2) { game.undo(); game.undo(); }
            updateGameState(true);
        });
        
        historyFirstBtn.on('click', () => { if (!historyFirstBtn.prop('disabled')) { reviewMoveIndex = 0; showHistoryPosition(); } });
        historyPrevBtn.on('click', () => { if (!historyPrevBtn.prop('disabled')) { if (reviewMoveIndex === null) reviewMoveIndex = game.history().length - 1; if (reviewMoveIndex > 0) reviewMoveIndex--; showHistoryPosition(); } });
        historyNextBtn.on('click', () => { if (!historyNextBtn.prop('disabled')) { if (reviewMoveIndex === null) return; if (reviewMoveIndex < game.history().length - 1) reviewMoveIndex++; showHistoryPosition(); } });
        historyLastBtn.on('click', exitReviewMode);
        moveHistoryLog.on('click', '.move-span', function() { reviewMoveIndex = parseInt($(this).data('move-index')); showHistoryPosition(); });
        
        returnToGameBtn.on('click', switchToMainGame);
        
        runAnalysisBtn.on('click', function() {
            if ($(this).prop('disabled')) return;
            if (game.history().length === 0) { Swal.fire('Error', 'No moves to analyze.', 'error'); return; }
            if (!stockfish) { Swal.fire('Error', 'Chess engine not available.', 'error'); return; }
            switchToAnalysisRoom();
        });

        hintButton.on('click', function() {
            if ($(this).prop('disabled')) return;
            let originalOnMessage = stockfish.onmessage;
            stockfish.postMessage(`position fen ${game.fen()}`);
            stockfish.postMessage('go movetime 1000');
            stockfish.onmessage = event => {
                try {
                    const message = event.data;
                    if (message.startsWith('bestmove')) {
                        const move = message.split(' ')[1];
                        const from = move.substring(0, 2);
                        const to = move.substring(2, 4);
                        clearArrows();
                        drawArrow(from, to);
                        setTimeout(() => clearArrows(), 3000);
                        stockfish.onmessage = originalOnMessage;
                    } else if (originalOnMessage) {
                        originalOnMessage(event);
                    }
                } catch(e) {
                    console.error("Error handling hint:", e);
                    stockfish.onmessage = originalOnMessage;
                }
            };
        });

        loadFenBtn.on('click', () => {
            const fen = fenInput.val().trim();
            if (fen) initGameFromFen(fen);
            else Swal.fire('Info', 'Please paste a FEN string into the text field.', 'info');
        });
        
        exportPgnBtn.on('click', function() {
             if ($(this).prop('disabled')) return;
             const pgn = game.pgn();
             const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
             const url = URL.createObjectURL(blob);
             const a = document.createElement('a');
             a.href = url;
             a.download = `chess-game-${Date.now()}.pgn`;
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             URL.revokeObjectURL(url);
        });

        threatsToggle.on('change', function() {
            highlightThreats = $(this).is(':checked');
            localStorage.setItem('chessHighlightThreats', highlightThreats);
            updateThreatHighlights();
        });
        highlightThreats = localStorage.getItem('chessHighlightThreats') === 'true';
        threatsToggle.prop('checked', highlightThreats);
        
        themeSelector.on('change', () => { localStorage.setItem('chessBoardTheme', themeSelector.val()); buildBoard(game.fen()); });
        pieceThemeSelector.on('change', () => { localStorage.setItem('chessPieceTheme', pieceThemeSelector.val()); buildBoard(game.fen()); });
        difficultySlider.on('input', e => { aiDifficulty = parseInt(e.target.value, 10); eloDisplay.text(DIFFICULTY_SETTINGS[aiDifficulty]?.elo || 1200); localStorage.setItem('chessDifficulty', aiDifficulty); });
        
        /** MODIFIED **/
        // Path to icons updated to reflect the new scripts folder structure.
        soundToggle.on('click', () => { 
            isMuted = !isMuted; 
            localStorage.setItem('chessSoundMuted', isMuted); 
            soundIcon.attr('src', isMuted ? '../icon/speaker-x-mark.png' : '../icon/speaker-wave.png'); 
        });

        playerNameElement.on('click', () => { Swal.fire({ title: 'Enter your name', input: 'text', inputValue: playerName, showCancelButton: true, confirmButtonText: 'Save', customClass: { popup: '!bg-stone-800', title: '!text-white', input: '!text-black' }, inputValidator: v => !v || v.trim().length === 0 ? 'Please enter a name!' : null }).then(r => { if (r.isConfirmed) { playerName = r.value.trim(); localStorage.setItem('chessPlayerName', playerName); updatePlayerLabels(); } }); });

        UI_THEMES.forEach(theme => uiThemeSelector.append($('<option>', { value: theme.name, text: theme.displayName })));
        const savedUiTheme = localStorage.getItem('chessUiTheme') || 'charcoal';
        uiThemeSelector.val(savedUiTheme);
        applyUiTheme(savedUiTheme);
        uiThemeSelector.on('change', () => {
            const selectedTheme = uiThemeSelector.val();
            applyUiTheme(selectedTheme);
            localStorage.setItem('chessUiTheme', selectedTheme);
        });

        fetch(APP_CONFIG.STOCKFISH_URL)
            .then(response => { 
                if (!response.ok) throw new Error(`Failed to fetch Stockfish: ${response.status} ${response.statusText}`); 
                return response.text(); 
            })
            .then(text => {
                try {
                    stockfish = new Worker(URL.createObjectURL(new Blob([text], { type: 'application/javascript' })));
                    stockfish.onmessage = event => {
                        const message = event.data;
                        if (!message.startsWith('info depth')) console.log(`Stockfish: ${message}`);
                        if (message.startsWith('bestmove')) {
                            performMove(message.split(' ')[1]);
                        } else if (message.startsWith('info depth')) {
                            const scoreMatch = message.match(/score (cp|mate) (-?\d+)/);
                            if (scoreMatch) {
                                let score = parseInt(scoreMatch[2], 10);
                                if (scoreMatch[1] === 'mate') score = (score > 0 ? 1 : -1) * APP_CONFIG.MATE_SCORE;
                                if (game.turn() === 'b') score = -score;
                                updateEvalBar(score);
                            }
                            if (isLiveAnalysis && !isStockfishThinking) {
                                const pvMatch = message.match(/pv (.+)/);
                                if (pvMatch) {
                                    try {
                                        const tempGame = new Chess(game.fen());
                                        const moves = pvMatch[1].split(' ');
                                        const firstMove = tempGame.move(moves[0], { sloppy: true });
                                        if (firstMove) {
                                            topEngineMoveElement.text(firstMove.san);
                                            const nextMoves = moves.slice(1).map(uci => { const nextMove = tempGame.move(uci, { sloppy: true }); return nextMove ? nextMove.san : ''; }).filter(Boolean).join(' ');
                                            topEngineLineElement.text(nextMoves);
                                        }
                                    } catch (e) { console.warn("Error parsing engine PV line."); }
                                }
                            }
                        }
                    };
                    stockfish.onerror = (error) => {
                        console.error('Stockfish Worker Error:', error);
                        Swal.fire('Engine Error', 'Chess engine encountered an error.', 'warning');
                    };
                    stockfish.postMessage('uci');
                    stockfish.postMessage('isready');
                } catch (workerError) {
                    console.error('Failed to create Stockfish worker:', workerError);
                    throw workerError;
                }
                
                THEMES.forEach(theme => themeSelector.append($('<option>', { value: theme.name, text: theme.displayName })));
                Object.keys(PIECE_THEMES).forEach(themeName => pieceThemeSelector.append($('<option>', { value: themeName, text: themeName.charAt(0).toUpperCase() + themeName.slice(1) })));
                
                themeSelector.val(localStorage.getItem('chessBoardTheme') || APP_CONFIG.DEFAULT_BOARD_THEME);
                pieceThemeSelector.val(localStorage.getItem('chessPieceTheme') || APP_CONFIG.DEFAULT_PIECE_THEME);
                playerName = localStorage.getItem('chessPlayerName') || 'Player';
                playerNameElement.text(playerName);
                aiDifficulty = parseInt(localStorage.getItem('chessDifficulty') || '5', 10);
                difficultySlider.val(aiDifficulty);
                eloDisplay.text(DIFFICULTY_SETTINGS[aiDifficulty]?.elo || 1200);
                isMuted = localStorage.getItem('chessSoundMuted') === 'true';
                soundIcon.attr('src', isMuted ? '../icon/speaker-x-mark.png' : '../icon/speaker-wave.png');

                initGame();
            })
            .catch((error) => {
                console.error('Failed to load Stockfish:', error);
                $('aside').html(`<div class="text-red-400 font-bold text-center p-4">CRITICAL ERROR:<br>Could not load chess engine.<br><br>Please check your internet connection<br>and refresh the page.</div>`);
                Swal.fire({
                    title: 'Engine Loading Failed',
                    text: 'Could not load the chess engine.',
                    icon: 'error',
                    confirmButtonText: 'Refresh Page',
                    allowOutsideClick: false
                }).then(() => {
                    window.location.reload();
                });
            });
            
        boardElement.on('contextmenu', e => { 
            e.preventDefault(); 
            if (pendingPremove) { 
                pendingPremove = null; 
                removePremoveHighlight();
                clearArrows();
            }
            if (selectedSquare) {
                selectedSquare = null;
                removeLegalHighlights();
            }
        });
        $(window).on('resize', () => { clearTimeout(window.resizeTimer); window.resizeTimer = setTimeout(syncSidebarHeight, 150); });
    }

    initApp();
});
