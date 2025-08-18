// ===================================================================================
//  UI-INTERACTIONS.JS
//  Manages interactive components like modals, sounds, the log box, and view switching.
// ===================================================================================

function showTab(tabId) {
    $('.tab-content').removeClass('active');
    $('.tab-button').removeClass('active');
    $(`#${tabId}-tab`).addClass('active');
    $(`[data-tab="${tabId}"]`).addClass('active');
}

function showLiveGameView() {
    liveGameView.removeClass('hidden');
    gameSummarySection.addClass('hidden');
}

function showGameOverView() {
    liveGameView.addClass('hidden');
    gameSummarySection.removeClass('hidden');
    runAnalysisBtn.prop('disabled', game.history().length === 0);
}

function switchToMainGame() {
    isAnalysisMode = false;
    analysisRoomView.addClass('hidden');
    mainGameView.removeClass('hidden');
    analysisVisualizer.addClass('hidden'); 
    
    if (window.AnalysisController && typeof window.AnalysisController.stop === 'function') {
        window.AnalysisController.stop();
    }
    
    if (window.loadFenOnReturn) {
        initGameFromFen(window.loadFenOnReturn);
        delete window.loadFenOnReturn;
    }
}

function showShortcutsModal() {
    Logger.info('Shortcuts modal opened.');
    const shortcutsHtml = `
        <div class="text-left text-lg space-y-2 text-light">
            <h3 class="text-2xl font-bold text-center mb-4">Keyboard Shortcuts</h3>
            <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                <div class="font-semibold">New Game:</div><div class="font-mono bg-inset p-1 rounded text-center">N</div>
                <div class="font-semibold">Undo Move:</div><div class="font-mono bg-inset p-1 rounded text-center">U</div>
                <div class="font-semibold">Swap Sides:</div><div class="font-mono bg-inset p-1 rounded text-center">S</div>
                <div class="font-semibold">Flip Board:</div><div class="font-mono bg-inset p-1 rounded text-center">F</div>
                <div class="font-semibold">Toggle Sound:</div><div class="font-mono bg-inset p-1 rounded text-center">M</div>
                <div class="font-semibold">Show Hint:</div><div class="font-mono bg-inset p-1 rounded text-center">H</div>
                <div class="font-semibold">Toggle Debug Log:</div><div class="font-mono bg-inset p-1 rounded text-center">L</div>
                <div class="font-semibold">Toggle Focus Mode:</div><div class="font-mono bg-inset p-1 rounded text-center">Esc</div>
                <div class="font-semibold">History Navigation:</div><div class="font-mono bg-inset p-1 rounded text-center">← → ↑ ↓</div>
            </div>
        </div>
    `;
    Swal.fire({
        html: shortcutsHtml,
        showConfirmButton: true,
        confirmButtonText: 'Got it!',
        customClass: {
            popup: '!bg-bg-panel',
            confirmButton: '!btn-primary !px-6 !py-2'
        }
    });
}

function showTimeControlModal() {
    const timeOptions = Object.keys(TIME_CONTROLS).map(key => {
        const tc = TIME_CONTROLS[key];
        return `<button class="time-control-btn" data-key="${key}">${tc.label}</button>`;
    }).join('');

    Swal.fire({
        title: 'Choose Time Control',
        html: `<div class="grid grid-cols-2 gap-4 my-4">${timeOptions}</div>`,
        showConfirmButton: false,
        customClass: { popup: '!bg-bg-panel', title: '!text-white' },
        didOpen: () => {
            $('.time-control-btn').on('click', function() {
                const key = $(this).data('key');
                const tc = TIME_CONTROLS[key];
                timeControlSelector.val(key);
                timeControlSelector.trigger('change');
                Logger.info(`New game started with time control: ${tc.label}`);
                startNewGameWithTime(tc.base, tc.inc);
                Swal.close();
            });
            $('.time-control-btn').addClass('w-full px-4 py-3 font-bold rounded-lg shadow-md btn-secondary');
        }
    });
}

function applyAnalysisLayout() {
    if (window.innerWidth < 1024) {
        $('#analysis-room').css({ display: 'flex', flexDirection: 'column' });
        return;
    };

    $('#analysis-room').css({
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch'
    });
    $('#analysis-room > div:first-child').css({
        flex: '1 1 auto'
    });
    $('#analysis-room > aside').css({
        flex: '0 0 320px'
    });
}

window.switchToAnalysisRoom = function() {
    isAnalysisMode = true;
    mainGameView.addClass('hidden');
    analysisVisualizer.addClass('hidden');
    analysisRoomView.removeClass('hidden');
    
    applyAnalysisLayout();
};

function initSounds() {
    Object.keys(SOUND_PATHS).forEach(key => {
        sounds[key] = new Howl({ src: [SOUND_PATHS[key]] });
    });
}

window.playSound = function(soundName) {
    if (isMuted || !sounds) return;
    if (sounds[soundName]) {
        sounds[soundName].play();
    }
}

function showPromotionDialog(color) {
    Logger.info('Opening promotion dialog.');
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
                    Logger.info(`Piece promoted to ${pendingMove.promotion.toUpperCase()}`);
                    performMove(pendingMove);
                    pendingMove = null;
                    Swal.close();
                }
            });
        }
    });
}

function updateGameSummary() {
    summaryAccuracy.find('div:first-child .font-bold').text('--%');
    summaryAccuracy.find('div:last-child .font-bold').text('--%');
}

// UPDATED: The log box renderer is now refactored to handle the detailed, structured objects from the new Logger service.
function initLogBox() {
    const originalConsole = { log: console.log, error: console.error, warn: console.warn };
    let logHistory = [];

    const renderLogObject = (logObject) => {
        if (!logObject || !logObject.logType) return; // Ignore invalid logs

        let content = '';
        const timestamp = `<span class="text-gray-500">${new Date().toLocaleTimeString()}:</span>`;
        const logClass = `log-${logObject.logType}`;
        const prefix = `<span class="log-prefix">[${logObject.logType.toUpperCase().replace('_', ' ')}]</span>`;
        let body = logObject.text || '';

        // For errors, append detailed information like source file and stack trace.
        if (logObject.logType === 'error' && logObject.source) {
            body += `<br><span class="text-gray-500">Source: ${logObject.source} (Line: ${logObject.line})</span>`;
            if (logObject.stack) {
                body += `<br><pre class="whitespace-pre-wrap text-xs">${logObject.stack}</pre>`;
            }
        }
        
        content = `${timestamp} ${prefix} ${body}`;
        const logHtml = `<div class="log-message ${logClass}">${content}</div>`;
        logHistory.push(logHtml);

        if (!logBoxContainer.is(':hidden')) {
            logBoxContent.append(logHtml);
            logBoxContent.scrollTop(logBoxContent[0].scrollHeight);
        }
    };

    console.log = function() { originalConsole.log.apply(console, arguments); renderLogObject(arguments[0]); };
    console.error = function() { originalConsole.error.apply(console, arguments); renderLogObject(arguments[0]); };
    console.warn = function() { originalConsole.warn.apply(console, arguments); renderLogObject(arguments[0]); };
    
    logBoxToggle.on('change', function() {
        const isVisible = this.checked;
        logBoxContainer.toggleClass('hidden', !isVisible);
        if (isVisible) {
            logBoxContent.html(logHistory.join(''));
            logBoxContent.scrollTop(logBoxContent[0].scrollHeight);
            Logger.info('Debug log opened.');
        }
    });
    logBoxClearBtn.on('click', () => {
        Logger.info('Log cleared.');
        logHistory = [];
        logBoxContent.empty();
    });
    logBoxCloseBtn.on('click', () => logBoxToggle.prop('checked', false).trigger('change'));
    
    let isDragging = false, offset = { x: 0, y: 0 };
    let isResizing = false;

    logBoxHeader.on('mousedown', function(e) {
        if ($(e.target).is('button') || $(e.target).parent().is('button')) return;
        isDragging = true;
        let containerOffset = logBoxContainer.offset();
        offset.x = e.clientX - containerOffset.left;
        offset.y = e.clientY - containerOffset.top;
    });

    logBoxResizeHandle.on('mousedown', function(e) {
        e.preventDefault();
        isResizing = true;
    });

    $(document).on('mousemove', function(e) {
        if (isDragging) {
            const headerHeight = logBoxHeader.outerHeight();
            let newX = e.clientX - offset.x;
            let newY = e.clientY - offset.y;

            newX = Math.max(0, Math.min(newX, window.innerWidth - logBoxContainer.outerWidth()));
            newY = Math.max(0, Math.min(newY, window.innerHeight - headerHeight));

            logBoxContainer.css({ top: newY, left: newX });
        }
        if (isResizing) {
            const containerOffset = logBoxContainer.offset();
            let newWidth = Math.max(300, e.clientX - containerOffset.left);
            let newHeight = Math.max(200, e.clientY - containerOffset.top);

            newWidth = Math.min(newWidth, window.innerWidth - containerOffset.left);
            newHeight = Math.min(newHeight, window.innerHeight - containerOffset.top);

            logBoxContainer.css({ width: `${newWidth}px`, height: `${newHeight}px` });
        }
    });

    $(document).on('mouseup', () => {
        isDragging = false;
        isResizing = false;
    });
}