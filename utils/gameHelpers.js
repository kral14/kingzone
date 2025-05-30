// server/utils/gameHelpers.js

// Oyunu başladan və ya sıfırlayan funksiya
function initializeGameState(boardSize = 3, player1Info = null, player2Info = null) {
    // Helper function to create initial player state
    // Accepts playerInfo: { userId, username, id (socketId) }
    const initialPlayerState = (socketInfo) => ({
        socketId: socketInfo?.id || null,       // Use 'id' if passed for socketId
        userId: socketInfo?.userId || null,
        username: socketInfo?.username || null,
        symbol: null,
        roll: null,
        // Mark disconnected ONLY if no valid socketId is provided initially
        // If disconnectHandler passes socketId, they are considered connected here.
        isDisconnected: !(socketInfo?.id),
        disconnectTime: null,
        slot: null // Will be assigned below
    });

    // Create initial states
    const p1Initial = player1Info ? initialPlayerState(player1Info) : initialPlayerState();
    if(p1Initial.userId) p1Initial.slot = 1; // Assign slot number if P1 exists

    const p2Initial = player2Info ? initialPlayerState(player2Info) : initialPlayerState();
    if(p2Initial.userId) p2Initial.slot = 2; // Assign slot number if P2 exists

    // Determine initial status message
    let initialStatus = "İkinci oyunçu gözlənilir...";
    if (p1Initial.userId && !p1Initial.isDisconnected && p2Initial.userId && !p2Initial.isDisconnected) {
        initialStatus = "Oyunçular hazır, zər atma başlayır..."; // Should move to dice_roll phase quickly
    } else if (p1Initial.userId && !p1Initial.isDisconnected) {
        initialStatus = `${p1Initial.username} qoşuldu, rəqib gözlənilir...`;
    } else if (p2Initial.userId && !p2Initial.isDisconnected) {
        initialStatus = `${p2Initial.username} qoşuldu, rəqib gözlənilir...`;
    }

    return {
        board: Array(boardSize * boardSize).fill(''),
        boardSize: boardSize,
        gamePhase: 'waiting', // Always start/reset to 'waiting'
        currentPlayerSymbol: null,
        player1: p1Initial,
        player2: p2Initial,
        diceWinnerSocketId: null,
        symbolPickerSocketId: null,
        isGameOver: false,
        winnerSymbol: null,
        winningCombination: [],
        statusMessage: initialStatus, // Set initial status message
        lastMoveTime: null,
        restartRequestedBy: null,
        restartAcceptedBy: []
    };
}

// Qazanma kombinasiyalarını yaradan funksiya
function generateWinConditions(size) {
    const lines = []; const n = size; const winLength = size >= 5 ? 4 : 3;
    if (winLength > n) return [];
    for (let r = 0; r < n; r++) { for (let c = 0; c <= n - winLength; c++) { lines.push(Array.from({ length: winLength }, (_, i) => r * n + c + i)); } }
    for (let c = 0; c < n; c++) { for (let r = 0; r <= n - winLength; r++) { lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + c)); } }
    for (let r = 0; r <= n - winLength; r++) { for (let c = 0; c <= n - winLength; c++) { lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + (c + i))); } }
    for (let r = 0; r <= n - winLength; r++) { for (let c = winLength - 1; c < n; c++) { lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + (c - i))); } }
    return lines;
}

// Qalibiyyəti yoxlayan funksiya (gameState-i parametr kimi alır)
function checkWinServer(gameState, playerSymbolToCheck) {
    if (!gameState?.board || !playerSymbolToCheck) return false;
    const board = gameState.board; const size = gameState.boardSize;
    gameState.winningCombination = [];
    const winConditions = generateWinConditions(size);
    if (winConditions.length === 0 && size > 0) return false;
    for (const condition of winConditions) {
        if (board[condition[0]] === playerSymbolToCheck && condition.every(index => board[index] === playerSymbolToCheck)) {
            gameState.winningCombination = condition; return true;
        }
    }
    return false;
}

// Növbəni dəyişən funksiya (gameState-i parametr kimi alır)
function switchTurnServer(gameState) {
    if (!gameState || gameState.isGameOver || gameState.gamePhase !== 'playing' || !gameState.player1?.symbol || !gameState.player2?.symbol) return;
    const p1Active = gameState.player1.socketId && !gameState.player1.isDisconnected;
    const p2Active = gameState.player2.socketId && !gameState.player2.isDisconnected;
    if (p1Active && p2Active) { gameState.currentPlayerSymbol = (gameState.currentPlayerSymbol === gameState.player1.symbol) ? gameState.player2.symbol : gameState.player1.symbol; }
    else if (p1Active) { gameState.currentPlayerSymbol = gameState.player1.symbol; }
    else if (p2Active) { gameState.currentPlayerSymbol = gameState.player2.symbol; }
    else { gameState.currentPlayerSymbol = null; }
}

// Gedişi emal edən funksiya (gameState-i parametr kimi alır)
function handleMakeMoveServer(gameState, playerSymbol, index) {
    if (!gameState || gameState.isGameOver || gameState.gamePhase !== 'playing') return false;
    if (gameState.currentPlayerSymbol !== playerSymbol) return false;
    if (typeof index !== 'number' || index < 0 || index >= gameState.board.length || gameState.board[index] !== '') return false;

    gameState.board[index] = playerSymbol;
    gameState.lastMoveTime = Date.now();
    const playerUsername = (gameState.player1?.symbol === playerSymbol) ? gameState.player1.username : gameState.player2?.username;

    if (checkWinServer(gameState, playerSymbol)) {
        gameState.isGameOver = true; gameState.winnerSymbol = playerSymbol; gameState.gamePhase = 'game_over';
        gameState.statusMessage = `${playerUsername || playerSymbol} Qazandı!`;
        gameState.restartRequestedBy = null; gameState.restartAcceptedBy = [];
    } else if (!gameState.board.includes('')) {
        gameState.isGameOver = true; gameState.winnerSymbol = 'draw'; gameState.gamePhase = 'game_over';
        gameState.statusMessage = "Oyun Bərabərə!";
        gameState.restartRequestedBy = null; gameState.restartAcceptedBy = [];
    } else {
        switchTurnServer(gameState);
        const nextPlayerState = (gameState.currentPlayerSymbol === gameState.player1?.symbol) ? gameState.player1 : gameState.player2;
        const nextPlayerActive = nextPlayerState?.socketId && !nextPlayerState.isDisconnected;
        gameState.statusMessage = nextPlayerActive ? `Sıra: ${nextPlayerState.username || gameState.currentPlayerSymbol}` : `Sıra: ${nextPlayerState?.username || gameState.currentPlayerSymbol || '?'} (Gözlənilir...)`;
    }
    return true;
}

 // Player state-lərini tapmaq üçün yardımçı
 function findPlayerStatesByUserId(gameState, userId) {
    let playerState = null, opponentState = null;
    if (!gameState || !userId) return { playerState, opponentState };
    if (gameState.player1?.userId === userId) { playerState = gameState.player1; opponentState = gameState.player2; }
    else if (gameState.player2?.userId === userId) { playerState = gameState.player2; opponentState = gameState.player1; }
    return { playerState, opponentState };
}

module.exports = {
    initializeGameState,
    generateWinConditions,
    checkWinServer,
    switchTurnServer,
    handleMakeMoveServer,
    findPlayerStatesByUserId
};