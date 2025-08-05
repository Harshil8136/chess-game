/**
 * board_interaction.js
 *
 * Contains all functions that handle direct user interaction with the chessboard,
 * including click-to-move, drag-and-drop, highlighting, and drawing arrows.
 */

function onSquareClick() {
    // Ignore clicks if it's not the player's turn, game is over, or in review mode
    if (game.turn() !== humanPlayer || !gameActive || reviewMoveIndex !== null) {
        if (selectedSquare) {
            selectedSquare = null;
            removeLegalHighlights();
        }
        return;
    }

    const clickedSquare = $(this).data('square');
    const pieceOnClickedSquare = game.get(clickedSquare);

    // If a piece was already selected
    if (selectedSquare) {
        const move = game.moves({ square: selectedSquare, verbose: true }).find(m => m.to === clickedSquare);
        
        // If the click is on a legal destination square
        if (move) {
            removeLegalHighlights();
            if (move.flags.includes('p') && (move.to.endsWith('8') || move.to.endsWith('1'))) {
                pendingMove = { from: selectedSquare, to: clickedSquare, promotion: 'q' };
                showPromotionDialog(humanPlayer);
            } else {
                const moveResult = game.move(move.san);
                if (moveResult) {
                    playMoveSound(moveResult);
                    updateGameState(false);
                }
            }
            selectedSquare = null;
            return;
        }
    }
    
    // If no piece was selected, or an invalid destination was clicked
    removeLegalHighlights();
    selectedSquare = null;

    // If the click was on one of the player's own pieces, select it
    if (pieceOnClickedSquare && pieceOnClickedSquare.color === humanPlayer) {
        selectedSquare = clickedSquare;
        highlightLegalMoves(clickedSquare);
    }
}

function onDrop(source, target) {
    removeLegalHighlights();
    selectedSquare = null;
    clearArrows();
    if (reviewMoveIndex !== null) return;

    if (isStockfishThinking && game.turn() !== humanPlayer) {
        removePremoveHighlight();
        pendingPremove = { from: source, to: target };
        $(`.square-${source}`).addClass('premove-highlight');
        $(`.square-${target}`).addClass('premove-highlight');
        drawArrow(source, target, 'rgba(255, 165, 0, 0.7)'); // Draw orange arrow for premove
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
    removeLegalHighlights();
    selectedSquare = null;
    return reviewMoveIndex === null && gameActive && !game.game_over() && piece.startsWith(humanPlayer) && (game.turn() === humanPlayer || isStockfishThinking);
}

function highlightLegalMoves(square) {
    removeLegalHighlights();
    const moves = game.moves({ square: square, verbose: true });
    if (moves.length === 0) return;

    boardElement.find(`.square-${square}`).addClass('highlight-selected');
    for (const move of moves) {
        boardElement.find(`.square-${move.to}`).addClass('highlight-legal');
    }
}

function removeLegalHighlights() {
    boardElement.find('.square-55d63').removeClass('highlight-legal highlight-selected');
}

function removePremoveHighlight() {
    boardElement.find('.premove-highlight').removeClass('premove-highlight');
}

function drawArrow(from, to, color = 'rgba(42, 122, 42, 0.7)', svgOverlay = boardSvgOverlay) {
    const boardWidth = boardElement.width();
    const squareSize = boardWidth / 8;
    const isFlipped = board.orientation() === 'black';
    const getCoords = (square) => {
        let col = square.charCodeAt(0) - 'a'.charCodeAt(0);
        let row = parseInt(square.charAt(1)) - 1;
        if (isFlipped) { col = 7 - col; row = 7 - row; }
        return { x: col * squareSize + squareSize / 2, y: (7 - row) * squareSize + squareSize / 2 };
    };
    const fromCoords = getCoords(from);
    const toCoords = getCoords(to);
    const markerId = `arrowhead-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
    if (!svgOverlay.find(`#${markerId}`).length) {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', markerId);
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '5');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '3.5');
        marker.setAttribute('markerHeight', '3.5');
        marker.setAttribute('orient', 'auto-start-reverse');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        path.style.fill = color;
        marker.appendChild(path);
        svgOverlay.append(marker);
    }
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fromCoords.x);
    line.setAttribute('y1', fromCoords.y);
    line.setAttribute('x2', toCoords.x);
    line.setAttribute('y2', toCoords.y);
    line.style.stroke = color;
    line.style.strokeWidth = '14px';
    line.setAttribute('marker-end', `url(#${markerId})`);
    svgOverlay.append(line);
}

function clearArrows(svgOverlay = boardSvgOverlay) {
    svgOverlay.empty();
}
