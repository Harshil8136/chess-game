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
    const playerColorIndicator = $('#player-color-indicator');
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

    // --- Game State ---
    let board = null;
    const game = new Chess();
    let gameActive = true;
    let humanPlayer = 'w';
    let aiPlayer = 'b';
    let aiDifficulty = 4;
    let pendingMove = null;
    let pendingPremove = null;
    let playerName = 'Player';
    let stockfish;
    let isStockfishThinking = false;
    let sounds = {};
    let isMuted = false;
    let reviewMoveIndex = null;

    // --- Constants ---
    const THEMES = {
        green: { light: '#eaefd2', dark: '#769656' },
        brown: { light: '#f0d9b5', dark: '#b58863' },
        blue:  { light: '#dee3e6', dark: '#8ca2ad' },
        stone: { light: '#d1d1d1', dark: '#a7a7a7' }
    };
    const PIECE_THEMES = {
        alpha: 'img/alpha/{piece}.png', cburnett: 'img/cburnett/{piece}.png',
        fantasy: 'img/fantasy/{piece}.png', merida: 'img/merida/{piece}.png',
        staunty: 'img/staunty/{piece}.png', wikipedia: 'img/wikipedia/{piece}.png',
    };
    const ELO_MAP = { 1: 450, 2: 600, 3: 750, 4: 900, 5: 1050, 6: 1200, 7: 1400, 8: 1600, 9: 1800, 10: 2100, 11: 2400, 12: 2700 };
    const MATERIAL_POINTS = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const stockfishURL = 'https://cdn.jsdelivr.net/gh/niklasf/stockfish.js/stockfish.js';

    // --- Sound Functions ---
    function initSounds() {
        sounds.move = new Howl({ src: ['sounds/move-self.mp3'] });
        sounds.capture = new Howl({ src: ['sounds/capture.mp3'] });
        sounds.check = new Howl({ src: ['sounds/move-check.mp3'] });
        sounds.gameEnd = new Howl({ src: ['sounds/game-end.mp3'] });
        sounds.gameStart = new Howl({ src: ['sounds/game-start.mp3'] });
        sounds.castle = new Howl({ src: ['sounds/castle.mp3'] });
        sounds.promote = new Howl({ src: ['sounds/promote.mp3'] });
        sounds.notify = new Howl({ src: ['sounds/notify.mp3'] });
    }

    function playSound(soundName) {
        if (isMuted) return;
        if (sounds[soundName]) sounds[soundName].play();
    }
    
    function playMoveSound(move) {
        if (move.flags.includes('p')) playSound('promote');
        else if (move.flags.includes('k') || move.flags.includes('q')) playSound('castle');
        else if (move.flags.includes('c')) playSound('capture');
        else playSound('move');
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
        const boardTheme = THEMES[themeSelector.val()] || THEMES.green;
        const pieceTheme = PIECE_THEMES[pieceThemeSelector.val()] || PIECE_THEMES.cburnett;
        document.documentElement.style.setProperty('--light-square-color', boardTheme.light);
        document.documentElement.style.setProperty('--dark-square-color', boardTheme.dark);
        const config = { position, draggable: true, onDragStart, onDrop, pieceTheme: pieceTheme, moveSpeed: 'fast' };
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
        
        if (!gameActive || game.game_over()) {
            if (gameActive) endGame();
            return;
        }
        if (game.turn() === aiPlayer && !isStockfishThinking && reviewMoveIndex === null) {
            statusElement.text("AI is thinking...").addClass('thinking-animation');
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
            if (pendingPremove && gameActive) {
                setTimeout(executePremove, 50);
            }
        }
    }

    function executePremove() {
        if (!pendingPremove) return;
        const move = pendingPremove;
        pendingPremove = null;
        removePremoveHighlight();
        const validPremove = game.moves({ verbose: true }).find(m => m.from === move.from && m.to === move.to);
        if (validPremove) {
            const moveResult = game.move(validPremove.san);
            if (moveResult) {
                playMoveSound(moveResult);
                updateGameState(true);
            }
        }
    }
    
    // --- AI Functions ---
    function makeAiMove() {
        if (!gameActive || game.game_over()) {
            updateGameState();
            return;
        }
        isStockfishThinking = true;
        const skillLevel = Math.round((aiDifficulty - 1) * (20 / 11));
        stockfish.postMessage(`setoption name Skill Level value ${skillLevel}`);
        stockfish.postMessage(`position fen ${game.fen()}`);
        const thinkTime = 500 + skillLevel * 100;
        stockfish.postMessage(`go movetime ${thinkTime}`);
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
    function removePremoveHighlight() { boardElement.find('.premove-highlight').removeClass('premove-highlight'); }
    
    function updateEvalBar(scoreFromWhitePerspective = 0) {
        const evalSensitivity = 400; 
        const percentage = ((Math.atan(scoreFromWhitePerspective / evalSensitivity) / Math.PI) + 0.5) * 100;
        const clamped = Math.max(0.5, Math.min(99.5, percentage));
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

    function renderCoordinates() {
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
        if (humanPlayer === 'b') {
            files.reverse();
            ranks.reverse();
        }
        topFiles.html(files.map(f => `<span>${f}</span>`).join(''));
        bottomFiles.html(files.map(f => `<span>${f}</span>`).join(''));
        leftRanks.html(ranks.slice().reverse().map(r => `<span>${r}</span>`).join(''));
        rightRanks.html(ranks.slice().reverse().map(r => `<span>${r}</span>`).join(''));
    }
    
    function updatePlayerLabels() {
        playerColorIndicator.text(`You are playing as ${humanPlayer === 'w' ? 'White' : 'Black'}`);
        bottomPlayerNameElement.text(humanPlayer === 'w' ? `${playerName} (White)` : `AI (White)`);
        topPlayerNameElement.text(humanPlayer === 'b' ? `${playerName} (Black)` : `AI (Black)`);
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
        undoButton.prop('disabled', !isPlayerTurn || game.history().length < 2 || pendingMove || pendingPremove);
    }
    
    function updateCapturedPieces() {
        const pieceThemePath = PIECE_THEMES[pieceThemeSelector.val()];
        if (!pieceThemePath) return;
        const capturedBy = { w: [], b: [] };
        const history = game.history({ verbose: true });
        for (const move of history) {
            if (move.captured) {
                const capturerColor = move.color === 'w' ? 'b' : 'w';
                capturedBy[capturerColor].push({ type: move.captured, color: move.color === 'w' ? 'b' : 'w' });
            }
        }
        const pieceOrder = { p: 1, n: 2, b: 3, r: 4, q: 5 };
        capturedBy.w.sort((a,b) => pieceOrder[a.type] - pieceOrder[b.type]);
        capturedBy.b.sort((a,b) => pieceOrder[a.type] - pieceOrder[b.type]);
        const whiteCapturedHtml = capturedBy.b.map(p => `<img src="${pieceThemePath.replace('{piece}', p.color + p.type.toUpperCase())}" class="captured-piece" />`).join('');
        const blackCapturedHtml = capturedBy.w.map(p => `<img src="${pieceThemePath.replace('{piece}', p.color + p.type.toUpperCase())}" class="captured-piece" />`).join('');
        capturedByWhiteElement.html(whiteCapturedHtml);
        capturedByBlackElement.html(blackCapturedHtml);
        const whiteMat = capturedBy.b.reduce((acc, p) => acc + (MATERIAL_POINTS[p.type] || 0), 0);
        const blackMat = capturedBy.w.reduce((acc, p) => acc + (MATERIAL_POINTS[p.type] || 0), 0);
        const adv = whiteMat - blackMat;
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
            title: 'Promote to:',
            html: `<div style="display: flex; justify-content: space-around;">${promotion_choices_html}</div>`,
            showConfirmButton: false, allowOutsideClick: false, customClass: { popup: '!bg-stone-700', title: '!text-white' },
            willOpen: () => {
                $(Swal.getPopup()).on('click', '.promotion-piece', function() {
                    if (pendingMove) {
                        pendingMove.promotion = $(this).data('piece');
                        const moveResult = game.move(pendingMove);
                        if (moveResult) {
                            playMoveSound(moveResult);
                            updateGameState(true);
                        }
                        pendingMove = null;
                        Swal.close();
                    }
                });
            }
        });
    }

    function setAiElo(lvl) { eloDisplay.text(ELO_MAP[lvl] || 1500); }
    
    function endGame() {
        gameActive = false;
        isStockfishThinking = false;
        let title = "Game Over!";
        let msg = "";
        if (game.in_checkmate()) { title = "Checkmate!"; msg = `${game.turn() === 'w' ? 'Black' : 'White'} wins.`; }
        else { title = "Draw!"; if (game.in_stalemate()) msg = "Draw by Stalemate."; else if (game.in_threefold_repetition()) msg = "Draw by Threefold Repetition."; else if (game.insufficient_material()) msg = "Draw due to Insufficient Material."; else msg = "The game is a draw."; }
        playSound('gameEnd');
        
        // **MODIFIED**: Added "Analyze Game" button to the popup.
        Swal.fire({
            title: title, text: msg, icon: 'info',
            showDenyButton: true,
            confirmButtonText: 'Play Again',
            denyButtonText: 'Analyze Game',
            customClass: { popup: '!bg-stone-800', title: '!text-white', htmlContainer: '!text-stone-300' }
        }).then((result) => {
            if (result.isConfirmed) {
                initGame();
            } else if (result.isDenied) {
                // Save the game PGN and switch to the analysis page
                localStorage.setItem('gameToAnalyze', game.pgn());
                window.location.href = 'analysis.html';
            }
        });
    }
    
    // --- Application Entry Point ---
    fetch(stockfishURL)
        .then(response => {
            if (!response.ok) { throw new Error(`Network response was not ok: ${response.statusText}`); }
            return response.text();
        })
        .then(text => {
            stockfish = new Worker(URL.createObjectURL(new Blob([text], { type: 'application/javascript' })));
            stockfish.onmessage = function(event) {
                const message = event.data;
                if (message.startsWith('info')) {
                    const scoreMatch = message.match(/score cp (-?\d+)/);
                    if (scoreMatch) {
                        const scoreInCp = parseInt(scoreMatch[1], 10);
                        const scoreFromWhite = (game.turn() === 'w') ? scoreInCp : -scoreInCp;
                        updateEvalBar(scoreFromWhite);
                    }
                }
                if (message.startsWith('bestmove')) {
                    const bestMove = message.split(' ')[1];
                    isStockfishThinking = false;
                    statusElement.removeClass('thinking-animation');
                    performMove(bestMove);
                }
            };

            // --- Event Handlers ---
            restartButton.on('click', initGame);
            swapSidesButton.on('click', () => { [humanPlayer, aiPlayer] = [aiPlayer, humanPlayer]; initGame(); });
            difficultySlider.on('input', e => { aiDifficulty = Number(e.target.value); setAiElo(aiDifficulty); });
            themeSelector.on('change', applyTheme);
            pieceThemeSelector.on('change', applyPieceTheme);
            undoButton.on('click', () => { if (!undoButton.prop('disabled')) { exitReviewMode(); game.undo(); game.undo(); updateGameState(true); } });
            soundToggle.on('click', toggleSound);
            
            playerNameElement.on('click', () => {
                Swal.fire({
                    title: 'Enter your name', input: 'text', inputValue: playerName,
                    showCancelButton: true, confirmButtonText: 'Save',
                    customClass: { popup: '!bg-stone-800', title: '!text-white', input: '!text-black' },
                    inputValidator: (value) => { if (!value || value.trim().length === 0) return 'Please enter a name!';}
                }).then((result) => {
                    if (result.isConfirmed) {
                        playerName = result.value.trim();
                        localStorage.setItem('chessPlayerName', playerName);
                        updatePlayerLabels();
                    }
                });
            });

            boardElement.on('contextmenu', function(e) { e.preventDefault(); if (pendingPremove) { pendingPremove = null; removePremoveHighlight(); } });
            
            // History Navigation Event Handlers
            moveHistoryLog.on('click', '.move-span', function() {
                reviewMoveIndex = parseInt($(this).data('move-index'));
                showHistoryPosition();
            });
            historyFirstBtn.on('click', () => { if (!historyFirstBtn.prop('disabled')) { reviewMoveIndex = 0; showHistoryPosition(); } });
            historyPrevBtn.on('click', () => {
                if (historyPrevBtn.prop('disabled')) return;
                if (reviewMoveIndex === null) reviewMoveIndex = game.history().length - 1;
                if (reviewMoveIndex > 0) reviewMoveIndex--;
                showHistoryPosition();
            });
            historyNextBtn.on('click', () => {
                if (historyNextBtn.prop('disabled')) return;
                if (reviewMoveIndex === null) reviewMoveIndex = 0;
                else if (reviewMoveIndex < game.history().length - 1) reviewMoveIndex++;
                showHistoryPosition();
            });
            historyLastBtn.on('click', exitReviewMode);
            
            // --- Initialization ---
            isMuted = localStorage.getItem('chessSoundMuted') === 'true';
            updateSoundIcon();
            const savedBoardTheme = localStorage.getItem('chessBoardTheme') || 'green';
            const savedPieceTheme = localStorage.getItem('chessPieceTheme') || 'cburnett';
            playerName = localStorage.getItem('chessPlayerName') || 'Player';
            
            Object.keys(THEMES).forEach(themeName => themeSelector.append($('<option>', { value: themeName, text: themeName.charAt(0).toUpperCase() + themeName.slice(1) })));
            Object.keys(PIECE_THEMES).forEach(themeName => pieceThemeSelector.append($('<option>', { value: themeName, text: themeName.charAt(0).toUpperCase() + themeName.slice(1) })));

            themeSelector.val(savedBoardTheme);
            pieceThemeSelector.val(savedPieceTheme);
            initSounds();
            setAiElo(difficultySlider.val());
            initGame();
        })
        .catch(error => {
            $('.p-6.rounded-lg').html(`<h3 class="text-red-400 font-bold text-center">AI Engine Failed to Load</h3><p class="text-stone-400 text-sm text-center">Please run this from a local server.</p>`);
        });
});
