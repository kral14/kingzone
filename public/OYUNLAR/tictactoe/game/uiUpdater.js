// public/OYUNLAR/tictactoe/game/uiUpdater.js (v3 - Fixed boardSize logic + Removed duplicate function declaration potential)
import * as DOM from './domElements.js';
import * as State from './state.js';
import * as Helpers from './helpers.js';
import * as Config from './config.js';
import * as ModalManager from './modalManager.js'; // Effektlər üçün
import * as DiceManager from './diceManager.js'; // Zəri sıfırlamaq və stillər üçün

// === adjustStylesForBoardSize FUNKSİYASI (BURADA TƏYİN OLUNUR) ===
// Bu funksiya yalnız bir dəfə təyin olunmalıdır.
function adjustStylesForBoardSize(size) {
    console.log(`[UIUpdater] adjustStylesForBoardSize: ${size}`);
    if (typeof size !== 'number' || size < Config.MIN_BOARD_SIZE || size > Config.MAX_BOARD_SIZE) {
        console.warn(`[UIUpdater adjustStylesForBoardSize] Keçərsiz ölçü (${size}), default (${Config.DEFAULT_BOARD_SIZE}) istifadə edilir.`);
        size = Config.DEFAULT_BOARD_SIZE;
    }
    let cellSizeVar = '--cell-size-large-dynamic';
    if (size === 4) cellSizeVar = '--cell-size-medium-dynamic';
    else if (size >= 5) cellSizeVar = '--cell-size-small-dynamic';

    document.documentElement.style.setProperty('--current-cell-size', `var(${cellSizeVar})`);
    document.documentElement.style.setProperty('--current-font-size', `calc(var(${cellSizeVar}) * 0.6)`);
    if (DOM.boardElement) {
         DOM.boardElement.style.setProperty('--board-size', size);
         console.log(`[UIUpdater adjustStylesForBoardSize] CSS variables set: --current-cell-size=var(${cellSizeVar}), --board-size=${size}`);
    } else {
         console.warn("[UIUpdater adjustStylesForBoardSize] boardElement tapılmadı, --board-size təyin edilə bilmədi.");
    }
    // DiceManager import edilibsə Zər mərkəzini yenilə
    if (typeof DiceManager !== 'undefined' && DiceManager.updateInitialCenterZ) {
        DiceManager.updateInitialCenterZ();
    }
}
// ==========================================================

// --- İlkin UI Qurulumu ---
export function initializeUI() {
    console.log("[UIUpdater] initializeUI çağırıldı.");
    // boardSize-ı ilkin olaraq state-dən və ya default-dan alaq
    let initialSize = State.getState('boardSize');
    if (typeof initialSize !== 'number' || initialSize < Config.MIN_BOARD_SIZE || initialSize > Config.MAX_BOARD_SIZE) {
        initialSize = Config.DEFAULT_BOARD_SIZE;
        State.setState('boardSize', initialSize); // State-i də yenilə
    }
    console.log(`[UIUpdater initializeUI] İlkin lövhə ölçüsü: ${initialSize}`);
    createBoard(initialSize); // Lövhəni yarat

    const user = State.getState('loggedInUser');
    if (DOM.player1NameDisplay && user) DOM.player1NameDisplay.textContent = Helpers.escapeHtml(user.nickname);
    if (DOM.player2NameDisplay) DOM.player2NameDisplay.textContent = "Gözlənilir...";
    if (DOM.gameStatusDisplay) DOM.gameStatusDisplay.textContent = 'Serverə qoşulunur...';
    if (DOM.turnIndicator) DOM.turnIndicator.textContent = 'Oyun Başlayır...';
    if (DOM.restartGameBtn) { DOM.restartGameBtn.style.display = 'none'; DOM.restartGameBtn.disabled = true; }
}

// --- Lövhə Yaratma Funksiyası ---
export function createBoard(size) {
    console.log(`[UIUpdater] createBoard: ${size}x${size}`);
    if (typeof size !== 'number' || size < Config.MIN_BOARD_SIZE || size > Config.MAX_BOARD_SIZE) {
        console.error(`[UIUpdater createBoard] Keçərsiz ölçü (${size}) alındı!`);
        size = Config.DEFAULT_BOARD_SIZE;
    }
    if (!DOM.boardElement) { console.error("[UIUpdater] createBoard: boardElement tapılmadı!"); return; }
    DOM.boardElement.innerHTML = '';
    const newCells = [];
    const cellCount = size * size;
    for (let i = 0; i < cellCount; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = i;
        DOM.boardElement.appendChild(cell);
        newCells.push(cell);
    }
    DOM.setCells(newCells);
    console.log(`[UIUpdater createBoard] ${cellCount} hüceyrə yaradıldı. Stillər tətbiq edilir...`);
    adjustStylesForBoardSize(size); // Stilləri ölçüyə görə tətbiq et
}


// --- Bütün UI-ı State-ə Görə Yeniləmə ---
export function renderUIBasedOnState() {
    console.log("[UIUpdater DEBUG] Entering renderUIBasedOnState.");
    const gameState = State.getState('currentGameState');
    const loggedInUser = State.getState('loggedInUser');

    if (!gameState || typeof gameState !== 'object' || !loggedInUser) {
         console.warn("[UIUpdater] Render üçün gameState və ya loggedInUser məlumatı yoxdur və ya gameState obyekt deyil.");
         return;
    }

    // ----- BOARD SIZE YOXLAMASI VƏ TƏYİNİ (YENİLƏNMİŞ v2) -----
    let currentBoardSize;
    if (typeof gameState.boardSize === 'number' && gameState.boardSize >= Config.MIN_BOARD_SIZE && gameState.boardSize <= Config.MAX_BOARD_SIZE) {
        currentBoardSize = gameState.boardSize;
        console.log(`[UIUpdater DEBUG] boardSize gameState-dən alındı: ${currentBoardSize}`);
    }
    else {
        console.warn(`[UIUpdater WARN] gameState.boardSize keçərsiz və ya yoxdur (${gameState.boardSize}). State.getState('boardSize') yoxlanılır...`);
        currentBoardSize = State.getState('boardSize');
        if (typeof currentBoardSize !== 'number' || currentBoardSize < Config.MIN_BOARD_SIZE || currentBoardSize > Config.MAX_BOARD_SIZE) {
            console.error(`[UIUpdater CRITICAL] State modulundakı boardSize da keçərsiz (${currentBoardSize}). Default (${Config.DEFAULT_BOARD_SIZE}) istifadə edilir.`);
            currentBoardSize = Config.DEFAULT_BOARD_SIZE;
        } else {
             console.log(`[UIUpdater DEBUG] boardSize State modulundan alındı: ${currentBoardSize}`);
        }
    }
    if (State.getState('boardSize') !== currentBoardSize) {
        console.log(`[UIUpdater] State modulundakı boardSize (${State.getState('boardSize')}) yeni etibarlı dəyər (${currentBoardSize}) ilə sinxronlaşdırılır.`);
        State.setState('boardSize', currentBoardSize);
    }
    console.log(`[UIUpdater DEBUG] UI üçün istifadə ediləcək ETİBARLI boardSize: ${currentBoardSize}`);
    // ----- BOARD SIZE SONU -----

    // ----- BOARD YARADILMASI/STİL YENİLƏNMƏSİ -----
    const requiredCellCount = currentBoardSize * currentBoardSize;
    const currentCells = DOM.getCells();
    // Lövhənin yenidən yaradılması üçün şərtlər: hüceyrə yoxdursa, sayı düzgün deyilsə VƏ YA CSS dəyişəni düzgün deyilsə
    if (!currentCells || currentCells.length !== requiredCellCount || !DOM.boardElement?.style.getPropertyValue('--board-size') || parseInt(DOM.boardElement.style.getPropertyValue('--board-size')) !== currentBoardSize ) {
         console.warn(`[UIUpdater] Lövhə yenidən yaradılır/stil güncəllənir. Tələb olunan: ${requiredCellCount}, Mövcud: ${currentCells?.length || 0}. Ölçü: ${currentBoardSize}`);
         createBoard(currentBoardSize);
    } else {
         console.log(`[UIUpdater] Mövcud lövhə (${currentCells.length} hüceyrə) tələb olunan (${requiredCellCount}) ilə uyğundur.`);
         // Stil dəyişmə ehtimalına qarşı yenə də çağıraq
         adjustStylesForBoardSize(currentBoardSize);
    }
    // ----- -----

    // --- ƏSAS UI YENİLƏMƏLƏRİ ---
    console.log(`[UIUpdater DEBUG] UI yeniləmə funksiyaları çağırılır. Phase=${gameState.gamePhase}, BoardSize=${currentBoardSize}`);
    try {
        updatePlayerInfo();
        updateTurnIndicator();
        updateGameStatusDisplay();

        const boardArray = Array.isArray(gameState.board) ? gameState.board : [];
        if (boardArray.length !== requiredCellCount) {
             console.error(`[UIUpdater CRITICAL] gameState.board (${boardArray.length}) ölçüsü tələb olunan (${requiredCellCount}) ilə uyğun deyil! Lövhə düzgün göstərilməyə bilər.`);
             updateBoardUI(Array(requiredCellCount).fill(''), State.getState('isMyTurn'), State.getState('isGameOver'), []);
        } else {
             updateBoardUI(boardArray, State.getState('isMyTurn'), State.getState('isGameOver'), gameState.winningCombination || []);
        }

        updateHeaderButtonsVisibility();
        updateRestartButtonsUI();
        console.log("[UIUpdater DEBUG] Core UI updates completed within try block.");
    } catch (uiError) {
        console.error("[UIUpdater CRITICAL] Core UI yeniləmələri zamanı xəta:", uiError);
        if (DOM.gameStatusDisplay) DOM.gameStatusDisplay.textContent = "UI Yükləmə Xətası!";
    }
    // --- ---

    // --- MODALLAR ---
    try {
        console.log(`[UIUpdater DEBUG] Calling ModalManager.updateGameModalsVisibility(). Current Phase: ${gameState.gamePhase}`);
        ModalManager.updateGameModalsVisibility(); // Bu funksiya gamePhase='dice_roll' olduqda zər modalını göstərməlidir
        console.log("[UIUpdater DEBUG] Modal visibility updated.");
    } catch (modalError) {
         console.error("[UIUpdater CRITICAL] Modal yeniləməsi zamanı xəta:", modalError);
    }
    // --- ---

    // --- EFFEKTLƏR VƏ BOARD INTERACTION ---
    const isGameOver = State.getState('isGameOver');
    if (isGameOver && gameState.winnerSymbol && gameState.winnerSymbol !== 'draw') {
        if (!DOM.fireworksOverlay?.classList.contains('visible')) {
             ModalManager.triggerShatterEffect(gameState.winnerSymbol);
        }
    } else if (!isGameOver && DOM.fireworksOverlay?.classList.contains('visible')) {
         ModalManager.hideFireworks();
    }

    // Lövhəyə klikləmə imkanı: Yalnız 'playing' mərhələsində, sıra sizdədirsə, oyun bitməyibsə və gediş emal olunmursa
    if (gameState.gamePhase === 'playing' && State.getState('isMyTurn') && !isGameOver && !State.getState('isProcessingMove')) {
        enableBoardInteraction();
    } else {
        disableBoardInteraction();
    }
    console.log(`[UIUpdater DEBUG] Board interaction set. MyTurn=${State.getState('isMyTurn')}, GameOver=${isGameOver}, Processing=${State.getState('isProcessingMove')}, Phase=${gameState.gamePhase}`);
    // --- ---

    console.log(`[UIUpdater] renderUIBasedOnState tamamlandı. Phase: ${gameState.gamePhase}`);
} // renderUIBasedOnState sonu


// --- Konkret UI Yeniləmə Funksiyaları ---

// --- Lövhənin UI-nı yenilə ---
export function updateBoardUI(boardState, canPlayerMove, isGameFinished, winningCombo = []) {
    const cells = DOM.getCells();
    const requiredCellCount = State.getState('boardSize') * State.getState('boardSize'); // State-dən alaq

    if (!DOM.boardElement || !Array.isArray(cells)) {
        console.error(`[UIUpdater] updateBoardUI XƏTA: Lövhə və ya hüceyrələr tapılmadı!`);
        return;
    }
    // Gələn boardState array-inin ölçüsünü yoxlayaq
    if (boardState.length !== requiredCellCount) {
         console.error(`[UIUpdater] updateBoardUI XƏTA: Gələn boardState (${boardState.length}) ölçüsü tələb olunan (${requiredCellCount}) ilə uyğun deyil!`);
         // Bəlkə lövhəni təmizləyək?
         cells.forEach(cell => { if(cell) cell.textContent = ''; cell.className = 'cell'; });
         return;
    }

    cells.forEach((cell, index) => {
        if (!cell) return; // Ehtiyat üçün
        const serverMark = boardState[index] || '';
        // Məzmun və Class
        if (cell.textContent !== serverMark) {
            cell.textContent = serverMark;
            cell.classList.remove('X', 'O', 'winning'); // Köhnə classları təmizlə
            if (serverMark) cell.classList.add(serverMark);
        }
        // Klikləmə imkanı (Yalnız 'playing' mərhələsində)
        const isPlayingPhase = State.getState('currentGameState')?.gamePhase === 'playing';
        const canClickThisCell = isPlayingPhase && serverMark === '' && !isGameFinished && canPlayerMove && !State.getState('isProcessingMove');
        const expectedCursor = canClickThisCell ? 'pointer' : 'not-allowed';
        if (cell.style.cursor !== expectedCursor) cell.style.cursor = expectedCursor;
        // Qazanma xətti
        cell.classList.toggle('winning', isGameFinished && winningCombo.includes(index));
    });
    // Ümumi lövhə stili
    DOM.boardElement.style.opacity = isGameFinished ? '0.7' : '1';
}

// --- Oyunçu Məlumatlarını Yenilə ---
export function updatePlayerInfo() {
    const myState = State.getState('myPlayerState');
    const opponentState = State.getState('opponentPlayerState');
    const gameState = State.getState('currentGameState');
    const loggedInUser = State.getState('loggedInUser'); // Fallback üçün

    const updatePanel = (panel, symbolDisplay, nameDisplay, playerState, defaultName, isOpponent = false) => {
        if (!panel || !symbolDisplay || !nameDisplay) return;

        const symbol = playerState?.symbol || '?';
        const name = playerState?.username || defaultName || (isOpponent ? 'Rəqib' : 'Siz');
        // isDisconnected yoxlaması: state-dəki dəyər VƏ YA opponent üçün əlavə isOpponentPresent yoxlaması
        const isDisconnected = playerState?.isDisconnected || (isOpponent && !State.getState('isOpponentPresent'));

        symbolDisplay.textContent = symbol;
        nameDisplay.textContent = Helpers.escapeHtml(name) + (isDisconnected ? ' (Gözlənilir...)' : '');
        // Classları sıfırla və yenidən təyin et
        panel.className = `player-info player-${symbol.toLowerCase() || 'unknown'}`;
        panel.classList.toggle('disconnected', isDisconnected);

        // Aktiv oyunçu vurğusu (Yalnız 'playing' mərhələsində)
        const isActive = gameState?.gamePhase === 'playing' && !gameState.isGameOver && gameState.currentPlayerSymbol === symbol && !isDisconnected;
        panel.classList.toggle('active-player', isActive);
    };

    updatePanel(DOM.player1Info, DOM.player1SymbolDisplay, DOM.player1NameDisplay, myState, loggedInUser?.nickname, false);
    updatePanel(DOM.player2Info, DOM.player2SymbolDisplay, DOM.player2NameDisplay, opponentState, 'Rəqib', true);
}

// --- Sıra Göstəricisini Yenilə ---
export function updateTurnIndicator() {
    if (!DOM.turnIndicator) return;

    const state = State.getState('currentGameState');
    const myState = State.getState('myPlayerState');
    const opponentState = State.getState('opponentPlayerState');
    const isMyTurn = State.getState('isMyTurn');
    let displayText = "Yüklənir...";

    if (!state || !state.gamePhase) {
        DOM.turnIndicator.textContent = "Vəziyyət yüklənir...";
        return;
    }

    switch (state.gamePhase) {
        case 'waiting':
             // Oyunçu sayına görə mesajı dəqiqləşdirək
             const p1Active = state.player1 && !state.player1.isDisconnected && state.player1.socketId;
             const p2Active = state.player2 && !state.player2.isDisconnected && state.player2.socketId;
             if(p1Active && !p2Active) displayText = `${state.player1.username} rəqib gözləyir...`;
             else if (!p1Active && p2Active) displayText = `${state.player2.username} rəqib gözləyir...`;
             else displayText = state.statusMessage || "Rəqib gözlənilir...";
             break;
        case 'dice_roll':
            displayText = state.statusMessage || "Zər atılır...";
            break;
        case 'symbol_select':
            const picker = (state.symbolPickerSocketId === state.player1?.socketId) ? state.player1 : state.player2;
            displayText = picker ? `${Helpers.escapeHtml(picker.username)} simvol seçir...` : (state.statusMessage || "Simvol seçilir...");
            break;
        case 'playing':
             const currentPlayer = (state.currentPlayerSymbol === myState?.symbol) ? myState : opponentState;
             if (currentPlayer && !currentPlayer.isDisconnected) {
                 displayText = isMyTurn ? `Sıra Sizdə (${state.currentPlayerSymbol})` : `Sıra: ${Helpers.escapeHtml(currentPlayer.username)} (${state.currentPlayerSymbol})`;
             } else {
                 // Oyunçu var amma disconnected və ya currentPlayer tapılmır
                 displayText = `Sıra: ${Helpers.escapeHtml(currentPlayer?.username || state.currentPlayerSymbol || '?')} (Gözlənilir...)`;
             }
            break;
        case 'game_over':
             if (state.winnerSymbol === 'draw') { displayText = "Oyun Bərabərə!"; }
             else if (state.winnerSymbol) {
                const winnerName = (myState?.symbol === state.winnerSymbol) ? (myState.username || 'Siz') : (opponentState?.username || state.winnerSymbol);
                displayText = (myState?.symbol === state.winnerSymbol) ? "Siz Qazandınız!" : `${Helpers.escapeHtml(winnerName)} Qazandı!`;
             } else { displayText = state.statusMessage || "Oyun Bitdi"; }
            break;
        default: displayText = state.statusMessage || "Vəziyyət naməlumdur...";
    }
    DOM.turnIndicator.textContent = displayText;
}

// --- Oyun Status Mesajını Yenilə ---
export function updateGameStatusDisplay() {
    if (!DOM.gameStatusDisplay) return;
    const state = State.getState('currentGameState');
    if (!state || !state.gamePhase) { DOM.gameStatusDisplay.textContent = "Oyun vəziyyəti alınmadı!"; return; }

    let newStatusText = state.statusMessage || "Vəziyyət yenilənir...";
    DOM.gameStatusDisplay.textContent = newStatusText;
    DOM.gameStatusDisplay.className = 'game-status'; // Classları sıfırla

    // Statusa uyğun class əlavə et
    if (state.gamePhase === 'game_over') {
        if (state.winnerSymbol && state.winnerSymbol !== 'draw') DOM.gameStatusDisplay.classList.add('win');
        else if (state.winnerSymbol === 'draw') DOM.gameStatusDisplay.classList.add('draw');
    } else if (state.gamePhase === 'waiting') {
        DOM.gameStatusDisplay.classList.add('waiting');
    }

    // Disconnect statusunu göstər
    if (state.player1?.isDisconnected || state.player2?.isDisconnected) {
         DOM.gameStatusDisplay.classList.add('disconnected-status');
    }
}

// --- Müvəqqəti/Qalıcı Status Mesajları ---
export function showTemporaryGameStatus(message, type = 'info', duration = 3000) {
     // ... (əvvəlki kimi)
     if (!DOM.gameStatusDisplay) return;
     const originalText = DOM.gameStatusDisplay.textContent;
     const originalClassName = DOM.gameStatusDisplay.className;
     DOM.gameStatusDisplay.textContent = message;
     DOM.gameStatusDisplay.className = `game-status ${type}`;
     // Əvvəlki timeout varsa təmizlə
     if (DOM.gameStatusDisplay.timeoutId) clearTimeout(DOM.gameStatusDisplay.timeoutId);
     DOM.gameStatusDisplay.timeoutId = setTimeout(() => {
          // Yalnız mesaj eynidirsə originala qaytar
          if (DOM.gameStatusDisplay.textContent === message) {
               DOM.gameStatusDisplay.textContent = originalText;
               DOM.gameStatusDisplay.className = originalClassName;
          }
     }, duration);
}
export function showPersistentGameStatus(message, type = 'error') {
     // ... (əvvəlki kimi)
      if (!DOM.gameStatusDisplay) return;
      // Əvvəlki timeout varsa təmizlə
      if (DOM.gameStatusDisplay.timeoutId) clearTimeout(DOM.gameStatusDisplay.timeoutId);
      DOM.gameStatusDisplay.timeoutId = null; // Timeoutu ləğv et
      DOM.gameStatusDisplay.textContent = message;
      DOM.gameStatusDisplay.className = `game-status ${type}`;
}

// --- Header Düymələrini Yenilə ---
export function updateHeaderButtonsVisibility() {
    const isCreator = State.getState('isCurrentUserCreator');
    const opponentPresentAndConnected = State.getState('isOpponentPresent') && !State.getState('opponentPlayerState')?.isDisconnected;
    if (DOM.editRoomBtn) DOM.editRoomBtn.style.display = isCreator ? 'inline-flex' : 'none';
    // Kick düyməsini yalnız yaradan və rəqib bağlı olduqda göstər
    if (DOM.kickOpponentBtn) DOM.kickOpponentBtn.style.display = isCreator && opponentPresentAndConnected ? 'inline-flex' : 'none';
}

// --- Restart Düymələrini Yenilə ---
export function updateRestartButtonsUI() {
    if (!DOM.restartGameBtn || !DOM.gameActionsDiv) return;

    const state = State.getState('currentGameState');
    const socketId = State.getState('socket')?.id;
    const opponentPresentAndConnected = State.getState('isOpponentPresent') && !State.getState('opponentPlayerState')?.isDisconnected;

    // Köhnə Rədd Et düyməsini sil (əgər varsa)
    const existingDeclineBtn = DOM.gameActionsDiv.querySelector('#decline-restart-btn');
    if (existingDeclineBtn) existingDeclineBtn.remove();

    // Restart düyməsini yalnız oyun bitdikdə VƏ hər iki oyunçu bağlı olduqda göstər
    if (state?.gamePhase === 'game_over' && opponentPresentAndConnected && socketId) {
        DOM.restartGameBtn.style.display = 'inline-flex';
        const amIRequester = state.restartRequestedBy === socketId;
        const isRequestPendingFromOpponent = state.restartRequestedBy && !amIRequester;

        if (isRequestPendingFromOpponent) {
            DOM.restartGameBtn.innerHTML = `<i class="fas fa-check"></i> Təklifi Qəbul Et`;
            DOM.restartGameBtn.disabled = false;
            // Rədd Et düyməsini yarat
            const declineBtn = document.createElement('button');
            declineBtn.id = 'decline-restart-btn';
            declineBtn.className = 'button danger-button'; // Təhlükə rəngində
            declineBtn.innerHTML = `<i class="fas fa-times"></i> Rədd Et`;
            // Listener eventListeners.js-də qoşulur
            DOM.gameActionsDiv.appendChild(declineBtn);
        } else if (amIRequester) {
            DOM.restartGameBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Təklif Göndərildi`;
            DOM.restartGameBtn.disabled = true;
        } else {
            DOM.restartGameBtn.innerHTML = `<i class="fas fa-redo"></i> Yenidən Başlat`;
            DOM.restartGameBtn.disabled = false;
        }
    } else {
        DOM.restartGameBtn.style.display = 'none';
        DOM.restartGameBtn.disabled = true;
    }
}

// --- Lövhə İnteraksiyasını İdarə Et ---
export function disableBoardInteraction() {
    if (DOM.boardElement) {
        DOM.boardElement.style.pointerEvents = 'none';
        // Bütün hüceyrələr üçün kursoru 'not-allowed' et (əlavə vizual rəy)
        DOM.getCells().forEach(cell => { if(cell) cell.style.cursor = 'not-allowed'; });
        //console.log("[UIUpdater] Board interaction disabled.");
    }
}
export function enableBoardInteraction() {
    // Yalnız playing mərhələsində və sıra sizdədirsə aktiv et
    const gameState = State.getState('currentGameState');
    if (DOM.boardElement && gameState?.gamePhase === 'playing' && State.getState('isMyTurn') && !State.getState('isGameOver')) {
         DOM.boardElement.style.pointerEvents = 'auto';
         // Boş hüceyrələr üçün kursoru 'pointer' et
         DOM.getCells().forEach((cell, index) => {
             if (cell && gameState.board[index] === '') {
                  cell.style.cursor = 'pointer';
             } else if (cell) {
                  cell.style.cursor = 'not-allowed';
             }
         });
         //console.log("[UIUpdater] Board interaction enabled.");
    } else {
         disableBoardInteraction(); // Başqa hallarda bağlı qalsın
    }
}

// --- Disconnect/Connection Xətası UI ---
export function handleDisconnectionUI(message = 'Serverlə bağlantı kəsildi!') {
     showPersistentGameStatus(message, 'error');
     if (DOM.turnIndicator) DOM.turnIndicator.textContent = "Offline";
     disableBoardInteraction();
     // Oyunçu panellərini də yeniləyək (state-dəki isDisconnected artıq true olmalıdır)
     updatePlayerInfo();
     updateRestartButtonsUI(); // Restart düymələrini gizlət
     ModalManager.hideAllGameModals(); // Açıq modalları bağla
}
export function handleConnectionErrorUI(message) {
     handleDisconnectionUI(message || 'Serverə qoşulmaq mümkün olmadı!');
}

// --- Otaq Məlumatlarını Yenilə ---
export function renderRoomInfo() {
     const roomData = State.getState('currentRoomData');
     if (DOM.roomNameDisplay && roomData?.name) {
          DOM.roomNameDisplay.textContent = `Otaq: ${Helpers.escapeHtml(roomData.name)}`;
     }
     updateHeaderButtonsVisibility(); // Yaradan statusu dəyişə bilər
}

console.log("[Module Loaded] uiUpdater.js (v3)");