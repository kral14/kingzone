// --- BU BLOK DÜZGÜN OLANDIR (Başqa heç nə olmamalıdır bundan əvvəl) ---
const { pubClient } = require('../server/config/redis');
// initializeGameState buraya əlavə olunmalıdır:
const { findPlayerStatesByUserId, handleMakeMoveServer, initializeGameState } = require('../utils/gameHelpers');
const { getSocketRoomKey, getRoomDataFromRedis, saveGameStateToRedis, emitGameStateUpdateRedis } = require('../utils/redisHelpers');
// --- ---
// Zər Atma Handler-i
async function handleDiceRoll(socket, io, data, userInfo) {
    const roomId = await pubClient.get(getSocketRoomKey(socket.id));
    if (!roomId) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
    if (!data || typeof data.roll !== 'number' || data.roll < 1 || data.roll > 6) return socket.emit('game_error', { message: 'Keçərsiz zər nəticəsi.' });

    try {
        const roomData = await getRoomDataFromRedis(roomId);
        if (!roomData?.gameState) return socket.emit('game_error', { message: 'Oyun vəziyyəti tapılmadı.' });
        const state = roomData.gameState;
        if (state.gamePhase !== 'dice_roll' || state.isGameOver) return socket.emit('game_error', { message: 'Zər atmaq üçün uyğun mərhələ deyil.' });
        const { playerState, opponentState } = findPlayerStatesByUserId(state, userInfo.userId);
        if (!playerState || playerState.socketId !== socket.id || playerState.isDisconnected) return socket.emit('game_error', { message: 'Siz aktiv oyunçu deyilsiniz.' });
        if (playerState.roll !== null && !state.statusMessage?.includes("Bərabərlik!")) return socket.emit('game_error', { message: 'Siz artıq zər atmısınız.' });

        playerState.roll = data.roll; let nextPhase = null;
        if (state.player1?.roll !== null && state.player2?.roll !== null) {
            const p1_roll = state.player1.roll; const p2_roll = state.player2.roll;
            if (p1_roll > p2_roll) { state.diceWinnerSocketId = state.player1.socketId; state.symbolPickerSocketId = state.player1.socketId; }
            else if (p2_roll > p1_roll) { state.diceWinnerSocketId = state.player2.socketId; state.symbolPickerSocketId = state.player2.socketId; }
            if (state.diceWinnerSocketId) { const winnerState = (state.diceWinnerSocketId === state.player1.socketId) ? state.player1 : state.player2; const loserState = (winnerState === state.player1) ? state.player2 : state.player1; state.statusMessage = `${winnerState.username || '?'} yüksək atdı...`; nextPhase = 'symbol_select'; }
            else { state.player1.roll = null; state.player2.roll = null; state.gamePhase = 'dice_roll'; state.statusMessage = "Bərabərlik! Təkrar..."; }
        } else { const opponentUsername = opponentState?.username || "Rəqib"; state.statusMessage = `${opponentUsername}-in zər atması gözlənilir...`; }

        await saveGameStateToRedis(roomId, state); await emitGameStateUpdateRedis(roomId, 'dice_roll_result', io);
        if (nextPhase === 'symbol_select') { setTimeout(async () => { try { /* ... timeout logic ... */ const currentRoomData = await getRoomDataFromRedis(roomId); if (currentRoomData?.gameState?.gamePhase === 'dice_roll' && currentRoomData.gameState.diceWinnerSocketId) { currentRoomData.gameState.gamePhase = 'symbol_select'; const winnerState = (currentRoomData.gameState.diceWinnerSocketId === currentRoomData.gameState.player1.socketId) ? currentRoomData.gameState.player1 : currentRoomData.gameState.player2; currentRoomData.gameState.statusMessage = `${winnerState.username || '?'} simvol seçir...`; await saveGameStateToRedis(roomId, currentRoomData.gameState); await emitGameStateUpdateRedis(roomId, 'dice_roll_timeout_finished', io); } } catch (err) { console.error("[Dice Timeout ERROR]:", err); } }, 2500); }
    } catch (err) { console.error(`[dice_roll ERROR]:`, err); socket.emit('game_error', { message: 'Zər atarkən server xətası.' }); }
};

// Simvol Seçimi Handler-i
 async function handleSymbolChoice(socket, io, data, userInfo) {
    const roomId = await pubClient.get(getSocketRoomKey(socket.id));
    if (!roomId) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
    if (!data || (data.symbol !== 'X' && data.symbol !== 'O')) return socket.emit('game_error', { message: 'Keçərsiz simvol seçimi.' });

    try {
        const roomData = await getRoomDataFromRedis(roomId);
        if (!roomData?.gameState) return socket.emit('game_error', { message: 'Oyun vəziyyəti tapılmadı.' });
        const state = roomData.gameState;
        if (state.gamePhase !== 'symbol_select' || state.isGameOver || socket.id !== state.symbolPickerSocketId) { return socket.emit('game_error', { message: 'Simvol seçimi üçün uyğun deyil.' }); }
        const chosenSymbol = data.symbol; const opponentSymbol = (chosenSymbol === 'X') ? 'O' : 'X';
        const { playerState: pickerState, opponentState } = findPlayerStatesByUserId(state, userInfo.userId);
        if (!pickerState) return socket.emit('game_error', { message: 'Simvol seçən tapılmadı.' });

        pickerState.symbol = chosenSymbol; if (opponentState) opponentState.symbol = opponentSymbol;
        state.symbolPickerSocketId = null; state.statusMessage = `${pickerState.username || '?'} ${chosenSymbol} seçdi. ${opponentState?.username || '?'} ${opponentSymbol} ilə oynayacaq.`;
        await saveGameStateToRedis(roomId, state); await emitGameStateUpdateRedis(roomId, 'symbol_chosen_show_result', io);
        setTimeout(async () => { try { /* ... timeout logic ... */ const currentRoomData = await getRoomDataFromRedis(roomId); if (currentRoomData?.gameState?.gamePhase === 'symbol_select' && currentRoomData.gameState.symbolPickerSocketId === null) { currentRoomData.gameState.gamePhase = 'playing'; currentRoomData.gameState.currentPlayerSymbol = chosenSymbol; currentRoomData.gameState.lastMoveTime = Date.now(); const currentPlayerUsername = pickerState.username; currentRoomData.gameState.statusMessage = `Oyun başladı! Sıra: ${currentPlayerUsername || chosenSymbol}`; await saveGameStateToRedis(roomId, currentRoomData.gameState); await emitGameStateUpdateRedis(roomId, 'symbol_choice_timeout_finished', io); } } catch(err) { console.error("[Symbol Timeout ERROR]:", err); } }, 2000);
    } catch (err) { console.error(`[symbol_choice ERROR]:`, err); socket.emit('game_error', { message: 'Simvol seçərkən server xətası.' }); }
};

// Gediş Etmə Handler-i
async function handleMakeMove(socket, io, data, userInfo) {
    const roomId = await pubClient.get(getSocketRoomKey(socket.id));
    if (!roomId) return socket.emit('invalid_move', { message: 'Oyun tapılmadı.' });
    const index = data?.index;

    try {
        const roomData = await getRoomDataFromRedis(roomId);
        if (!roomData?.gameState) return socket.emit('invalid_move', { message: 'Oyun vəziyyəti tapılmadı.' });
        const state = roomData.gameState;
        const { playerState } = findPlayerStatesByUserId(state, userInfo.userId);
        if (!playerState || !playerState.symbol) return socket.emit('invalid_move', { message: 'Oyunçu məlumatı tapılmadı.' });

        const moveSuccessful = handleMakeMoveServer(state, playerState.symbol, index); // Bu funksiya gameState-i birbaşa dəyişir
        if (moveSuccessful) {
            await saveGameStateToRedis(roomId, state); await emitGameStateUpdateRedis(roomId, 'make_move', io);
        } else { socket.emit('invalid_move', { message: 'Keçərsiz hərəkət.' }); }
    } catch (err) { console.error(`[make_move ERROR]:`, err); socket.emit('invalid_move', { message: 'Hərəkət edərkən server xətası.' }); }
};

// Restart Təklifi Handler-i
   async function handleRequestRestart(socket, io, data, userInfo) {
    const roomId = await pubClient.get(getSocketRoomKey(socket.id));
    if (!roomId) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
    try {
        const roomData = await getRoomDataFromRedis(roomId); if (!roomData?.gameState) return socket.emit('game_error', { message: 'Oyun vəziyyəti tapılmadı.' }); const state = roomData.gameState;
        if (state.gamePhase !== 'game_over') return socket.emit('game_error', { message: 'Oyun bitməlidir.' });
        const p1Active = state.player1?.socketId && !state.player1.isDisconnected; const p2Active = state.player2?.socketId && !state.player2.isDisconnected; if (!p1Active || !p2Active) return socket.emit('game_error', { message: 'Hər iki oyunçu aktiv olmalıdır.' });
        if (state.restartRequestedBy && state.restartRequestedBy !== socket.id) return socket.emit('info_message', { message: 'Artıq başqa bir təklif var.' }); if (state.restartRequestedBy === socket.id) return socket.emit('info_message', { message: 'Təklifiniz göndərilib.' });

        state.restartRequestedBy = socket.id; state.restartAcceptedBy = [socket.id]; state.statusMessage = `${userInfo.username} yenidən başlatmağı təklif edir...`;
        const { opponentState } = findPlayerStatesByUserId(state, userInfo.userId); const opponentSocket = opponentState?.socketId ? io.sockets.sockets.get(opponentState.socketId) : null;
        if (opponentSocket) { opponentSocket.emit('restart_requested', { username: userInfo.username }); socket.emit('info_message', { message: 'Təklif göndərildi.' }); await saveGameStateToRedis(roomId, state); await emitGameStateUpdateRedis(roomId, 'restart_requested', io); }
        else { state.restartRequestedBy = null; state.restartAcceptedBy = []; await saveGameStateToRedis(roomId, state); socket.emit('game_error', { message: 'Rəqib tapılmadı.' }); }
    } catch (err) { console.error(`[request_restart ERROR]:`, err); socket.emit('game_error', { message: 'Restart təklif edərkən server xətası.' }); }
};

// Restart Qəbul Etmə Handler-i
async function handleAcceptRestart(socket, io, data, userInfo) {
    const roomId = await pubClient.get(getSocketRoomKey(socket.id));
    if (!roomId) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
    try {
        const roomData = await getRoomDataFromRedis(roomId); if (!roomData?.gameState) return socket.emit('game_error', { message: 'Oyun vəziyyəti tapılmadı.' }); const state = roomData.gameState;
        if (state.gamePhase !== 'game_over' || !state.restartRequestedBy || state.restartRequestedBy === socket.id || state.restartAcceptedBy.includes(socket.id)) { return socket.emit('game_error', { message: 'Təklifi qəbul etmək üçün uyğun deyil.' }); }
        const p1Active = state.player1?.socketId && !state.player1.isDisconnected; const p2Active = state.player2?.socketId && !state.player2.isDisconnected;
        if (!p1Active || !p2Active) { state.restartRequestedBy = null; state.restartAcceptedBy = []; await saveGameStateToRedis(roomId, state); await emitGameStateUpdateRedis(roomId, 'restart_cancelled_opponent_left', io); return socket.emit('game_error', { message: 'Rəqib ayrılıb.' }); }

        state.restartAcceptedBy.push(socket.id);
        if (state.restartAcceptedBy.length === 2) {
            const p1Info = { id: state.player1.socketId, userId: state.player1.userId, username: state.player1.username }; const p2Info = { id: state.player2.socketId, userId: state.player2.userId, username: state.player2.username };
            const newGameState = initializeGameState(state.boardSize, p1Info, p2Info); newGameState.gamePhase = 'dice_roll'; newGameState.statusMessage = "Oyunçular zər atır...";
            await saveGameStateToRedis(roomId, newGameState); await emitGameStateUpdateRedis(roomId, 'restart_accepted', io);
        } else { await saveGameStateToRedis(roomId, state); await emitGameStateUpdateRedis(roomId, 'restart_accepted_partial', io); }
    } catch (err) { console.error(`[accept_restart ERROR]:`, err); socket.emit('game_error', { message: 'Restart qəbul edərkən server xətası.' }); }
};

// Restart Rədd Etmə Handler-i
async function handleDeclineRestart(socket, io, data, userInfo) {
    const roomId = await pubClient.get(getSocketRoomKey(socket.id));
    if (!roomId) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
    try {
        const roomData = await getRoomDataFromRedis(roomId); if (!roomData?.gameState) return socket.emit('game_error', { message: 'Oyun vəziyyəti tapılmadı.' }); const state = roomData.gameState;
        if (state.gamePhase !== 'game_over' || !state.restartRequestedBy || state.restartRequestedBy === socket.id) { return socket.emit('game_error', { message: 'Təklifi rədd etmək üçün uyğun deyil.' }); }
        const requesterSocketId = state.restartRequestedBy; state.restartRequestedBy = null; state.restartAcceptedBy = [];
        if (state.winnerSymbol === 'draw') { state.statusMessage = "Oyun Bərabərə!"; } else if (state.winnerSymbol) { const winnerState = (state.player1?.symbol === state.winnerSymbol) ? state.player1 : state.player2; state.statusMessage = `${winnerState?.username || state.winnerSymbol} Qazandı!`; } else { state.statusMessage = "Oyun Bitdi"; }
        await saveGameStateToRedis(roomId, state);
        const requesterSocket = io.sockets.sockets.get(requesterSocketId); if (requesterSocket) { requesterSocket.emit('info_message', { message: `${userInfo.username} təklifi rədd etdi.` }); }
        socket.emit('info_message', { message: 'Təklifi rədd etdiniz.' }); await emitGameStateUpdateRedis(roomId, 'restart_declined', io);
    } catch (err) { console.error(`[decline_restart ERROR]:`, err); socket.emit('game_error', { message: 'Restart rədd edərkən server xətası.' }); }
};

module.exports = {
    handleDiceRoll,
    handleSymbolChoice,
    handleMakeMove,
    handleRequestRestart,
    handleAcceptRestart,
    handleDeclineRestart
};