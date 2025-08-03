$(document).ready(function() {
    // --- Element Refs ---
    const boardElement = $('#board');
    const statusElement = $('#game-status');
    const openingNameElement = $('#opening-name');
    const themeSelector = $('#theme-selector');
    const pieceThemeSelector = $('#piece-theme-selector');
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

    // --- Game State ---
    let board = null;
    const game = new Chess();
    let gameActive = true;
    let humanPlayer = 'w';
    let aiPlayer = 'b';
    let aiDifficulty = 5;
    let pendingMove = null;
    let pendingPremove = null;
    let playerName = 'Player';
    let stockfish;
    let isStockfishThinking = false;
    let sounds = {};
    let isMuted = false;
    let reviewMoveIndex = null;
    let isLiveAnalysis = false;

    // --- UI Functions ---
    function showTab(tabId) {
        $('.tab-content').removeClass('active');
        $('.tab-button').removeClass('active');
        $(`#${tabId}-tab`).addClass('active');
        $(`[data-tab="${tabId}"]`).addClass('active');
    }

    // --- Sound Functions ---
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

    function toggleSound() {
        isMuted = !isMuted;
        localStorage.setItem('chessSoundMuted', isMuted);
        updateSoundIcon();
    }

    function updateSoundIcon() {
        soundIcon.attr('src', isMuted ? 'icon/speaker-x-mark.png' : 'icon/speaker-wave.png');
        soundToggle.attr('title', isMuted ? 'Turn Sound On' : 'Turn Sound Off');
    }

    // --- Core Game Functions ---
    function buildBoard(position = 'start') {
        const selectedTheme = THEMES.find(t => t.name === themeSelector.val()) || THEMES[0];
        document.documentElement.style.setProperty('--light-square-color', selectedTheme.colors.light);
        document.documentElement.style.setProperty('--dark-square-color', selectedTheme.colors.dark);
        
        const config = { position, draggable: true, onDragStart, onDrop, pieceTheme: PIECE_THEMES[pieceThemeSelector.val()], moveSpeed: 'fast' };
        if (board) board.destroy();
        board = Chessboard('board', config);
        board.orientation(humanPlayer === 'w' ? 'white' : 'black');
        renderCoordinates();
    }

    function initGame() {
        exitReviewMode();
        game.reset();
        gameActive = true;
        isStockfishThinking = false;
        pendingPremove = null;
        pendingMove = null;
        removePremoveHighlight();
        buildBoard('start');
        updatePlayerLabels();
        updateEvalBar(0);
        updateGameState(false);
        playSound('gameStart');
        runAnalysisBtn.prop('disabled', true).addClass('hidden');
        liveAnalysisToggle.prop('checked', false).trigger('change');
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

    // --- Move Handling ---
    function onDrop(source, target) {
        if (reviewMoveIndex !== null) return;
        if (isStockfishThinking && game.turn() !== humanPlayer) {
            removePremoveHighlight();
            pendingPremove = { from: source, to: target };
            $(`.square-${source}`).addClass('premove-highlight');
            $(`.square-${target}`).addClass('premove-highlight');
            return 'snapback';
        }
        if (game.turn() !== humanPlayer) return 'snapback';
        const move = game.moves({ verbose: true }).find(m => m.from === source && m.to === target);
        if (!move) return 'snapback';
        if (move.flags.includes('p') && (move.to.endsWith('8') || move.to.endsWith('1'))) {
            pendingMove = { from: source, to: target, promotion: 'q' };
            showPromotionDialog(humanPlayer);
            return;
        }
        const moveResult = game.move(move.san);
        if (moveResult) {
            playMoveSound(moveResult);
            updateGameState(false);
        }
    }

    function onDragStart(source, piece) {
        return reviewMoveIndex === null && gameActive && !game.game_over() && piece.startsWith(humanPlayer) && (game.turn() === humanPlayer || isStockfishThinking);
    }
    
    function performMove(move) {
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
        const validPremove = game.moves({ verbose: true }).find(m => m.from === move.from && m.to === move.to);
        if (validPremove) performMove(validPremove.san);
    }
    
    // --- AI & Analysis Functions ---
    function makeAiMove() {
        if (!gameActive || game.game_over()) return;
        isStockfishThinking = true;
        statusElement.text("AI is thinking...").addClass('thinking-animation');
        const difficulty = DIFFICULTY_SETTINGS[aiDifficulty];
        stockfish.postMessage(`position fen ${game.fen()}`);
        switch (difficulty.type) {
            case 'random':
                setTimeout(() => performMove(game.moves()[Math.floor(Math.random() * game.moves().length)]), 300);
                break;
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
                break;
            case 'stockfish':
                if (difficulty.depth) stockfish.postMessage(`go depth ${difficulty.depth}`);
                else if (difficulty.movetime) stockfish.postMessage(`go movetime ${difficulty.movetime}`);
                break;
        }
    }

    function runLiveAnalysis() {
        if (!stockfish || isStockfishThinking || game.game_over()) return;
        stockfish.postMessage(`position fen ${game.fen()}`);
        stockfish.postMessage('go infinite');
    }

    // --- History Review Functions ---
    function showHistoryPosition() {
        if (reviewMoveIndex === null) return;
        const history = game.history({ verbose: true });
        const tempGame = new Chess();
        for (let i = 0; i <= reviewMoveIndex; i++) {
            tempGame.move(history[i].san);
        }
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
    
    // --- UI and Helper Functions ---
    function updateOpeningName() {
        const pgn = game.pgn();
        let currentOpening = '';
        if (pgn) {
            for (let i = OPENINGS.length - 1; i >= 0; i--) {
                if (pgn.startsWith(OPENINGS[i].pgn)) {
                    currentOpening = OPENINGS[i].name;
                    break;
                }
            }
        }
        openingNameElement.text(currentOpening);
    }

    function removePremoveHighlight() { boardElement.find('.premove-highlight').removeClass('premove-highlight'); }
    
    function updateEvalBar(score) {
        const evalPercentage = 50 * (1 + (2 / Math.PI) * Math.atan(score / 350));
        const clamped = Math.max(0.5, Math.min(99.5, evalPercentage));
        gsap.to(evalBarWhite, { height: `${clamped}%`, duration: 0.7, ease: 'power2.out' });
        gsap.to(evalBarBlack, { height: `${100 - clamped}%`, duration: 0.7, ease: 'power2.out' });
    }
    
    function applyTheme() {
        localStorage.setItem('chessBoardTheme', themeSelector.val());
        buildBoard(game.fen());
    }

    function applyPieceTheme() {
        localStorage.setItem('chessPieceTheme', pieceThemeSelector.val());
        buildBoard(game.fen());
    }

    function renderCoordinates() { const isFlipped = humanPlayer === 'b'; const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']; let ranks = ['1', '2', '3', '4', '5', '6', '7', '8']; if (isFlipped) { files.reverse(); ranks.reverse(); } const topFilesHtml = files.map(f => `<span>${f}</span>`).join(''); const bottomFilesHtml = files.map(f => `<span>${f}</span>`).join(''); const ranksHtml = ranks.slice().reverse().map(r => `<span>${r}</span>`).join(''); topFiles.html(topFilesHtml); bottomFiles.html(bottomFilesHtml); leftRanks.html(ranksHtml); rightRanks.html(ranksHtml); }
    function updatePlayerLabels() { playerColorIndicator.text(`You are playing as ${humanPlayer === 'w' ? 'White' : 'Black'}`); bottomPlayerNameElement.text(humanPlayer === 'w' ? `${playerName} (White)` : `AI (White)`); topPlayerNameElement.text(humanPlayer === 'b' ? `${playerName} (Black)` : `AI (Black)`); }
    
    function undoMove() {
        if (!undoButton.prop('disabled')) {
            exitReviewMode();
            game.undo();
            game.undo();
            updateGameState(true);
        }
    }
    
    function updateStatus() {
        if (reviewMoveIndex !== null) {
            undoButton.prop('disabled', true);
            return;
        }
        const turn = game.turn() === 'w' ? 'White' : 'Black';
        let text = game.game_over() ? 'Game Over' : `${turn}'s Turn`;
        if (game.in_check()) text += ' (in Check)';
        if (!isStockfishThinking) statusElement.text(text).removeClass('thinking-animation');
        const isPlayerTurn = game.turn() === humanPlayer && gameActive;
        undoButton.prop('disabled', !isPlayerTurn || game.history().length < 2);
    }
    
    // **FIXED**: Rewrote this function for clarity and correctness.
    function updateCapturedPieces() {
        const pieceThemePath = PIECE_THEMES[pieceThemeSelector.val()];
        if (!pieceThemePath) return;

        const piecesCapturedByWhite = [];
        const piecesCapturedByBlack = [];

        game.history({ verbose: true }).forEach(move => {
            if (move.captured) {
                if (move.color === 'w') { // White made the move, so a black piece was captured
                    piecesCapturedByWhite.push({ type: move.captured, color: 'b' });
                } else { // Black made the move, so a white piece was captured
                    piecesCapturedByBlack.push({ type: move.captured, color: 'w' });
                }
            }
        });
        
        const pieceOrder = { p: 1, n: 2, b: 3, r: 4, q: 5 };
        piecesCapturedByWhite.sort((a,b) => pieceOrder[a.type] - pieceOrder[b.type]);
        piecesCapturedByBlack.sort((a,b) => pieceOrder[a.type] - pieceOrder[b.type]);

        const whiteCapturedHtml = piecesCapturedByWhite.map(p => `<img src="${pieceThemePath.replace('{piece}', p.color + p.type.toUpperCase())}" class="captured-piece" />`).join('');
        const blackCapturedHtml = piecesCapturedByBlack.map(p => `<img src="${pieceThemePath.replace('{piece}', p.color + p.type.toUpperCase())}" class="captured-piece" />`).join('');
        
        capturedByWhiteElement.html(whiteCapturedHtml); // White's capture pile shows black pieces
        capturedByBlackElement.html(blackCapturedHtml); // Black's capture pile shows white pieces

        const whiteMatAdv = piecesCapturedByWhite.reduce((acc, p) => acc + (MATERIAL_POINTS[p.type] || 0), 0);
        const blackMatAdv = piecesCapturedByBlack.reduce((acc, p) => acc + (MATERIAL_POINTS[p.type] || 0), 0);
        const adv = whiteMatAdv - blackMatAdv;

        whiteAdvantageElement.text(adv > 0 ? `+${adv}` : '');
        blackAdvantageElement.text(adv < 0 ? `+${-adv}` : '');
    }

    function updateMoveHistoryDisplay() {
        const history = game.history({ verbose: true });
        let html = '';
        for (let i = 0; i < history.length; i += 2) {
            const moveNum = (i / 2) + 1;
            const w_move = history[i];
            const b_move = history[i+1];
            const w_highlight = (reviewMoveIndex === i) ? 'highlight-move' : '';
            const b_highlight = (b_move && reviewMoveIndex === i+1) ? 'highlight-move' : '';
            html += `<div><span class="font-bold w-6 inline-block">${moveNum}.</span>`;
            if (w_move) html += `<span class="move-span ${w_highlight}" data-move-index="${i}">${w_move.san}</span> `;
            if (b_move) html += `<span class="move-span ${b_highlight}" data-move-index="${i+1}">${b_move.san}</span>`;
            html += `</div>`;
        }
        moveHistoryLog.html(html);
        if (reviewMoveIndex === null) {
            moveHistoryLog.scrollTop(moveHistoryLog[0].scrollHeight);
        }
        updateNavButtons();
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
                        performMove(pendingMove);
                        pendingMove = null;
                        Swal.close();
                    }
                });
            }
        });
    }

    function setAiElo(lvl) { eloDisplay.text(DIFFICULTY_SETTINGS[lvl]?.elo || 1200); }
    
    function endGame() {
        gameActive = false;
        isStockfishThinking = false;
        let msg = "";
        if (game.in_checkmate()) { msg = `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins.`; }
        else { msg = "Game is a draw."; }
        statusElement.text(msg);
        playSound('end');
        runAnalysisBtn.prop('disabled', false).removeClass('hidden');
        showTab('analysis');
    }
    
    // --- Application Initialization ---
    function initApp() {
        THEMES.forEach(theme => themeSelector.append($('<option>', { value: theme.name, text: theme.displayName })));
        Object.keys(PIECE_THEMES).forEach(themeName => pieceThemeSelector.append($('<option>', { value: themeName, text: themeName.charAt(0).toUpperCase() + themeName.slice(1) })));

        isMuted = localStorage.getItem('chessSoundMuted') === 'true';
        updateSoundIcon();
        themeSelector.val(localStorage.getItem('chessBoardTheme') || APP_CONFIG.DEFAULT_BOARD_THEME);
        pieceThemeSelector.val(localStorage.getItem('chessPieceTheme') || APP_CONFIG.DEFAULT_PIECE_THEME);
        playerName = localStorage.getItem('chessPlayerName') || 'Player';
        aiDifficulty = parseInt(localStorage.getItem('chessDifficulty') || '5', 10);
        difficultySlider.val(aiDifficulty);
        setAiElo(aiDifficulty);

        fetch(APP_CONFIG.STOCKFISH_URL)
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.text();
            })
            .then(text => {
                stockfish = new Worker(URL.createObjectURL(new Blob([text], { type: 'application/javascript' })));
                stockfish.onmessage = event => {
                    const message = event.data;
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
                                const tempGame = new Chess(game.fen());
                                const moves = pvMatch[1].split(' ');
                                const firstMove = tempGame.move(moves[0], { sloppy: true });
                                if (firstMove) {
                                    topEngineMoveElement.text(firstMove.san);
                                    const nextMoves = moves.slice(1).map(uci => tempGame.move(uci, { sloppy: true })?.san).filter(Boolean).join(' ');
                                    topEngineLineElement.text(nextMoves);
                                }
                            }
                        }
                    }
                };
                initGame();
            })
            .catch(() => {
                $('.p-6.rounded-lg').html(`<h3 class="text-red-400 font-bold text-center">AI Engine Failed to Load</h3><p class="text-stone-400 text-sm text-center">Please run this from a local server.</p>`);
            });

        // Event Handlers
        $('.tab-button').on('click', function() { showTab($(this).data('tab')); });
        liveAnalysisToggle.on('change', function() {
            isLiveAnalysis = $(this).is(':checked');
            if (isLiveAnalysis) {
                liveAnalysisDisplay.removeClass('hidden');
                runLiveAnalysis();
            } else {
                liveAnalysisDisplay.addClass('hidden');
                stockfish.postMessage('stop');
            }
        });
        restartButton.on('click', initGame);
        swapSidesButton.on('click', () => { [humanPlayer, aiPlayer] = [aiPlayer, humanPlayer]; initGame(); });
        difficultySlider.on('input', e => { aiDifficulty = parseInt(e.target.value, 10); setAiElo(aiDifficulty); localStorage.setItem('chessDifficulty', aiDifficulty); });
        themeSelector.on('change', applyTheme);
        pieceThemeSelector.on('change', applyPieceTheme);
        undoButton.on('click', undoMove);
        soundToggle.on('click', toggleSound);
        playerNameElement.on('click', () => {
            Swal.fire({ title: 'Enter your name', input: 'text', inputValue: playerName, showCancelButton: true, confirmButtonText: 'Save', customClass: { popup: '!bg-stone-800', title: '!text-white', input: '!text-black' },
                inputValidator: v => !v || v.trim().length === 0 ? 'Please enter a name!' : null })
                .then(r => { if (r.isConfirmed) { playerName = r.value.trim(); localStorage.setItem('chessPlayerName', playerName); updatePlayerLabels(); } });
        });
        boardElement.on('contextmenu', e => { e.preventDefault(); if (pendingPremove) { pendingPremove = null; removePremoveHighlight(); } });
        historyFirstBtn.on('click', () => { if (!historyFirstBtn.prop('disabled')) { reviewMoveIndex = 0; showHistoryPosition(); } });
        historyPrevBtn.on('click', () => { if (!historyPrevBtn.prop('disabled')) { if (reviewMoveIndex === null) reviewMoveIndex = game.history().length - 1; if (reviewMoveIndex > 0) reviewMoveIndex--; showHistoryPosition(); } });
        historyNextBtn.on('click', () => { if (!historyNextBtn.prop('disabled')) { if (reviewMoveIndex === null) return; if (reviewMoveIndex < game.history().length - 1) reviewMoveIndex++; showHistoryPosition(); } });
        historyLastBtn.on('click', exitReviewMode);
        moveHistoryLog.on('click', '.move-span', function() { reviewMoveIndex = parseInt($(this).data('move-index')); showHistoryPosition(); });
    }

    initSounds();
    initApp();
});
