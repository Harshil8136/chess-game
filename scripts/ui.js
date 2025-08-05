/**
 * ui.js
 *
 * Contains all functions related to updating the User Interface (DOM elements),
 * such as status text, move history, and evaluation bars.
 */

function syncSidebarHeight() {
    const boardArea = document.getElementById('board-area-container');
    const sidebars = document.querySelectorAll('#main-game aside, #analysis-room aside');
    if (boardArea && sidebars.length) {
        if (window.innerWidth >= 1024) {
            requestAnimationFrame(() => {
                const boardHeight = boardArea.offsetHeight;
                sidebars.forEach(sidebar => { sidebar.style.height = `${boardHeight}px`; });
            });
        } else {
            sidebars.forEach(sidebar => { sidebar.style.height = 'auto'; });
        }
    }
}

function showTab(tabId) {
    $('.tab-content').removeClass('active');
    $('.tab-button').removeClass('active');
    $(`#${tabId}-tab`).addClass('active');
    $(`[data-tab="${tabId}"]`).addClass('active');
}

function applyUiTheme(themeName) {
    const theme = UI_THEMES.find(t => t.name === themeName);
    if (!theme) {
        console.error(`UI Theme "${themeName}" not found.`);
        return;
    }
    for (const [key, value] of Object.entries(theme.colors)) {
        document.documentElement.style.setProperty(key, value);
    }
}

function updatePlayerLabels() {
    bottomPlayerNameElement.text(humanPlayer === 'w' ? `${playerName} (White)` : `AI (White)`);
    topPlayerNameElement.text(humanPlayer === 'b' ? `${playerName} (Black)` : `AI (Black)`);
}

function updateStatus() {
    if (reviewMoveIndex !== null) {
        undoButton.prop('disabled', true);
        hintButton.prop('disabled', true);
        return;
    }
    const turn = game.turn() === 'w' ? 'White' : 'Black';
    let text = game.game_over() ? 'Game Over' : `${turn}'s Turn`;
    if (game.in_check()) text += ' (in Check)';
    if (!isStockfishThinking) statusElement.text(text).removeClass('thinking-animation');
    const isPlayerTurn = game.turn() === humanPlayer && gameActive;
    undoButton.prop('disabled', !isPlayerTurn || game.history().length < 2);
    hintButton.prop('disabled', !isPlayerTurn);
}

function updateCapturedPieces() {
    const pieceThemePath = PIECE_THEMES[pieceThemeSelector.val()];
    if (!pieceThemePath) return;
    const piecesCapturedByWhite = [];
    const piecesCapturedByBlack = [];
    game.history({ verbose: true }).forEach(move => {
        if (move.captured) {
            if (move.color === 'w') {
                piecesCapturedByWhite.push({ type: move.captured, color: 'b' });
            } else {
                piecesCapturedByBlack.push({ type: move.captured, color: 'w' });
            }
        }
    });
    const pieceOrder = { p: 1, n: 2, b: 3, r: 4, q: 5 };
    piecesCapturedByWhite.sort((a,b) => pieceOrder[a.type] - pieceOrder[b.type]);
    piecesCapturedByBlack.sort((a,b) => pieceOrder[a.type] - pieceOrder[b.type]);
    const whiteCapturedHtml = piecesCapturedByWhite.map(p => `<img src="${pieceThemePath.replace('{piece}', p.color + p.type.toUpperCase())}" class="captured-piece" />`).join('');
    const blackCapturedHtml = piecesCapturedByBlack.map(p => `<img src="${pieceThemePath.replace('{piece}', p.color + p.type.toUpperCase())}" class="captured-piece" />`).join('');
    capturedByWhiteElement.html(whiteCapturedHtml);
    capturedByBlackElement.html(blackCapturedHtml);
    const whiteMatAdv = piecesCapturedByWhite.reduce((acc, p) => acc + (MATERIAL_POINTS[p.type] || 0), 0);
    const blackMatAdv = piecesCapturedByBlack.reduce((acc, p) => acc + (MATERIAL_POINTS[p.type] || 0), 0);
    const adv = whiteMatAdv - blackMatAdv;
    whiteAdvantageElement.text(adv > 0 ? `+${adv}` : '');
    blackAdvantageElement.text(adv < 0 ? `+${-adv}` : '');
}

function updateMoveHistoryDisplay() {
    const history = game.history({ verbose: true });
    moveHistoryLog.empty().addClass('move-history-grid');
    for (let i = 0; i < history.length; i += 2) {
        const moveNum = (i / 2) + 1;
        const w_move = history[i];
        const b_move = history[i+1];
        const w_highlight = (reviewMoveIndex === i) ? 'highlight-move' : '';
        const b_highlight = (b_move && reviewMoveIndex === i+1) ? 'highlight-move' : '';
        moveHistoryLog.append(`<span class="text-center font-bold text-dark">${moveNum}</span>`);
        moveHistoryLog.append(`<span class="move-span ${w_highlight}" data-move-index="${i}">${w_move.san}</span>`);
        if (b_move) {
            moveHistoryLog.append(`<span class="move-span ${b_highlight}" data-move-index="${i+1}">${b_move.san}</span>`);
        } else {
            moveHistoryLog.append(`<span></span>`);
        }
    }
    if (reviewMoveIndex === null) {
        moveHistoryLog.scrollTop(moveHistoryLog[0].scrollHeight);
    }
    updateNavButtons();
}

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

function updateEvalBar(score) {
    const evalPercentage = 50 * (1 + (2 / Math.PI) * Math.atan(score / 350));
    const clamped = Math.max(0.5, Math.min(99.5, evalPercentage));
    gsap.to(evalBarWhite, { height: `${clamped}%`, duration: 0.7, ease: 'power2.out' });
    gsap.to(evalBarBlack, { height: `${100 - clamped}%`, duration: 0.7, ease: 'power2.out' });
}

function renderCoordinates() {
    const isFlipped = humanPlayer === 'b';
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    let ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
    if (isFlipped) {
        files.reverse();
        ranks.reverse();
    }
    const topFilesHtml = files.map(f => `<span>${f}</span>`).join('');
    const bottomFilesHtml = files.map(f => `<span>${f}</span>`).join('');
    const ranksHtml = ranks.slice().reverse().map(r => `<span>${r}</span>`).join('');
    topFiles.html(topFilesHtml);
    bottomFiles.html(bottomFilesHtml);
    leftRanks.html(ranksHtml);
    rightRanks.html(ranksHtml);
}

function updateGameSummary() {
    summaryOpeningName.text(`Opening: ${openingNameElement.text() || 'N/A'}`);
    const whiteAdv = whiteAdvantageElement.text();
    const blackAdv = blackAdvantageElement.text();
    let materialText = "Material: Even";
    if (whiteAdv) materialText = `Material: ${whiteAdv} for White`;
    if (blackAdv) materialText = `Material: ${blackAdv} for Black`;
    summaryFinalMaterial.text(materialText);
}

function updateOpeningExplorer() {
    const pgn = game.pgn();
    if (!pgn || game.history().length > 10) {
        openingExplorer.addClass('hidden');
        return;
    }
    const currentOpening = OPENINGS.find(o => pgn === o.pgn);
    if (currentOpening) {
        openingExplorerContent.text(currentOpening.name);
        openingExplorer.removeClass('hidden');
    } else {
        openingExplorer.addClass('hidden');
    }
}

function updateThreatHighlights() {
    boardElement.find('.threatened-square').removeClass('threatened-square');
    if (!highlightThreats || game.game_over() || reviewMoveIndex !== null) return;
    const threatenedPlayer = game.turn();
    const attackingPlayer = threatenedPlayer === 'w' ? 'b' : 'w';

    game.SQUARES.forEach(square => {
        const piece = game.get(square);
        if (piece && piece.color === threatenedPlayer) {
            if (game.attackers(square, attackingPlayer).length > 0) {
                 boardElement.find(`[data-square=${square}]`).addClass('threatened-square');
            }
        }
    });
}