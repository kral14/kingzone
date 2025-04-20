// modules/state.js (Düzəlişli)
import * as UIUpdater from './uiUpdater.js'; // UI yeniləmələrini trigger etmək üçün

// Paylaşılan state-i saxlayan obyekt
const state = {
    loggedInUser: null,
    currentRoomId: null,
    currentRoomData: {}, // Otaq adı, ölçüsü və s.
    socket: null,
    currentGameState: {}, // Serverdən gələn son state
    myPlayerState: null,
    opponentPlayerState: null,
    isMyTurn: false,
    isGameOver: false,
    boardSize: 3, // Default
    // UI vəziyyəti ilə bağlı bayraqlar
    isDiceRolling: false,
    isProcessingMove: false,
    isOpponentPresent: false,
    isCurrentUserCreator: false,
    initialSetupComplete: false, // <<<---- BU SAHƏ ƏLAVƏ EDİLDİ (DÜZƏLİŞ) ----<<<
};

// State-ə dəyər yazmaq üçün funksiya
export function setState(key, value) {
    // === DƏYİŞİKLİK YOXDUR ===
    if (state.hasOwnProperty(key)) {
        // console.log(`[State Change] ${key}:`, value);
        state[key] = value;
    } else {
        console.warn(`[State Warning] Təyin edilməmiş state açarı: ${key}`);
    }
    // ==========================
}

// State-dən dəyər oxumaq üçün funksiya
export function getState(key) {
    // === DƏYİŞİKLİK YOXDUR ===
    return state[key];
    // ==========================
}

// Bütün state-i almaq (debugging üçün)
export function getAllState() {
    // === DƏYİŞİKLİK YOXDUR ===
    return { ...state }; // Kopyasını qaytar
    // ==========================
}

// Bir neçə state-i birdən təyin etmək
export function updateMultipleStates(updates) {
    // === DƏYİŞİKLİK YOXDUR ===
    for (const key in updates) {
        setState(key, updates[key]);
    }
    // ==========================
}

// --- ƏSAS OYUN VƏZİYYƏTİNİ EMAL EDƏN FUNKSİYA ---
export function processGameStateUpdate(newState) {
    // === DƏYİŞİKLİK YOXDUR ===
    console.log('[State DEBUG] Raw state received in processGameStateUpdate:', JSON.stringify(newState, null, 2));
    if (!newState || typeof newState !== 'object') {
        console.error("[State] Keçərsiz gameState alındı!");
        return;
    }

    const loggedInUserId = state.loggedInUser?.id;
    if (!loggedInUserId) {
        console.warn("[State] loggedInUser təyin edilməyib, player state-ləri təyin edilə bilmir.");
        setState('currentGameState', newState);
        return;
    }

    let newMyPlayerState = null;
    let newOpponentPlayerState = null;

    if (newState.player1?.userId === loggedInUserId) {
        newMyPlayerState = newState.player1;
        newOpponentPlayerState = newState.player2;
    } else if (newState.player2?.userId === loggedInUserId) {
        newMyPlayerState = newState.player2;
        newOpponentPlayerState = newState.player1;
    } else {
        console.warn("[State] Bu client üçün spesifik oyunçu slotu təyin edilə bilmədi.");
        newMyPlayerState = null;
        newOpponentPlayerState = newState.player2;
    }

    const newIsGameOver = newState.isGameOver === true;
    const newIsMyTurn = !!(newMyPlayerState && newMyPlayerState.symbol && newMyPlayerState.symbol === newState.currentPlayerSymbol && newState.gamePhase === 'playing' && !newIsGameOver && !newMyPlayerState.isDisconnected);
    const newIsOpponentPresent = !!(newOpponentPlayerState?.userId && !newOpponentPlayerState.isDisconnected);
    const newBoardSize = newState.boardSize || state.boardSize;

    updateMultipleStates({
        currentGameState: newState,
        myPlayerState: newMyPlayerState,
        opponentPlayerState: newOpponentPlayerState,
        isGameOver: newIsGameOver,
        isMyTurn: newIsMyTurn,
        isOpponentPresent: newIsOpponentPresent,
        boardSize: newBoardSize,
        isProcessingMove: false // Hər state update-də sıfırlamaq təhlükəsizdir
    });

    console.log(`[State] GameState emal edildi: Phase=${newState.gamePhase}, MyTurn=${newIsMyTurn}, GameOver=${newIsGameOver}, OpponentPresent=${newIsOpponentPresent}`);
    // ==========================
}

// Otaq məlumatlarını yeniləmək üçün funksiya
export function updateRoomData(roomInfo) {
    // === DƏYİŞİKLİK YOXDUR ===
    if (!roomInfo) return;
    const updatedRoomData = { ...state.currentRoomData, ...roomInfo };
    const isCreator = state.loggedInUser?.nickname === roomInfo.creatorUsername;
    updateMultipleStates({
        currentRoomData: updatedRoomData,
        isCurrentUserCreator: isCreator
    });
    console.log(`[State] RoomData yeniləndi: Name='${updatedRoomData.name}', IsCreator=${isCreator}`);
    // ==========================
}

// Rəqib ayrıldıqda state-i idarə etmək
export function handleOpponentLeft(data) {
    // === DƏYİŞİKLİK YOXDUR ===
    const opponentUsername = data?.username || 'Rəqib';
    const isReconnecting = data?.reconnecting || false;
    updateMultipleStates({
        isOpponentPresent: false
    });
     if (state.currentGameState.player1?.username === opponentUsername) {
         state.currentGameState.player1.isDisconnected = true;
         state.currentGameState.player1.socketId = null;
     } else if (state.currentGameState.player2?.username === opponentUsername) {
         state.currentGameState.player2.isDisconnected = true;
          state.currentGameState.player2.socketId = null;
     }
     if (state.currentGameState.gamePhase !== 'game_over') {
         state.currentGameState.gamePhase = 'waiting';
         state.currentGameState.statusMessage = isReconnecting ? `${opponentUsername} bağlantısı kəsildi...` : `${opponentUsername} oyundan ayrıldı.`;
         state.currentGameState.currentPlayerSymbol = null;
     }
     setState('currentGameState', state.currentGameState);
     console.log(`[State] Opponent Left handled. Reconnecting=${isReconnecting}`);
     // ==========================
}


console.log("[Module Loaded] state.js (initialSetupComplete added)");