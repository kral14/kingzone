// server/utils/disconnectHandler.js
const { pubClient } = require('../config/redis');
const { findPlayerStatesByUserId } = require('./gameHelpers');
const {
    getUserInfoKey, getSocketRoomKey, getRoomKey, getRoomPlayersKey,
    getRoomDisconnectTimerKey, getRoomDataFromRedis, saveGameStateToRedis,
    broadcastRoomListRedis, emitGameStateUpdateRedis
} = require('./redisHelpers');

const RECONNECT_TIMEOUT_MS = 30 * 1000; // Sabiti bura da gətirək və ya config-dən alaq
const ROOM_CLEANUP_DELAY_MS = 5 * 60 * 1000;

// DİQQƏT: Bu funksiya 'io' obyektini parametr kimi qəbul edir!
async function handleDisconnectOrLeaveRedis(socket, reason, io) {
    const socketId = socket.id;
    let localUserInfo;
    try {
        // User info-nu almaq üçün socket obyektinə auth zamanı əlavə etdiyimiz məlumatı istifadə edək (fallback)
        // Bu, Redis get əməliyyatını azaldır
        localUserInfo = socket.conn.request.userInfoFromAuth;
         if (!localUserInfo || !localUserInfo.userId || !localUserInfo.username) {
              console.warn(`[handleDisconnect WARN] User info not found on socket object for ${socketId}. Disconnect cannot be fully processed.`);
              // Əgər heç bir məlumat yoxdursa, bəlkə Redis-dən user infonu silməyə çalışaq
              try { await pubClient.del(getUserInfoKey(socketId)); } catch(e){}
              return;
         }
    } catch (err) {
        console.error(`[handleDisconnect ERROR] User info alınarkən xəta (Socket: ${socketId}):`, err);
        return;
    }

    const { userId, username } = localUserInfo;
    const roomId = await pubClient.get(getSocketRoomKey(socketId));
    const isExplicitLeave = (reason === 'leave_room_request');

    console.log(`[handleDisconnect] Processing: User=<span class="math-inline">\{username\}, Room\=</span>{roomId || 'N/A'}, Reason=<span class="math-inline">\{reason\}, ExplicitLeave\=</span>{isExplicitLeave}`);

    await pubClient.del(getSocketRoomKey(socketId)).catch(e => console.error("DEL socketRoomKey error:", e));
    await pubClient.del(getUserInfoKey(socketId)).catch(e => console.error("DEL userInfoKey error:", e)); // User infonu da silək

    if (!roomId) { console.log(`[handleDisconnect] User ${username} was not in a room.`); return; }

    const roomKey = getRoomKey(roomId);
    const roomPlayersKey = getRoomPlayersKey(roomId);
    let gameStateChanged = false;
    let roomShouldBeCleaned = false;
    let remainingPlayerSocketId = null;

    try {
        await pubClient.sRem(roomPlayersKey, socketId);
        const roomData = await getRoomDataFromRedis(roomId); // Bu pubClient istifadə edir
        if (!roomData || !roomData.gameState) {
             console.warn(`[handleDisconnect] Otaq ${roomId} və ya gameState tapılmadı (bəlkə artıq silinib?).`);
             await pubClient.sRem('activeRooms', roomKey);
             await broadcastRoomListRedis(io); // io-nu ötür
             return;
        }
        const state = roomData.gameState;
        const { playerState, opponentState } = findPlayerStatesByUserId(state, userId);

        if (playerState) {
             if (state.restartRequestedBy) { state.restartRequestedBy = null; state.restartAcceptedBy = []; gameStateChanged = true; }

             if (isExplicitLeave || state.gamePhase === 'game_over' || state.gamePhase === 'waiting') {
                 Object.assign(playerState, { socketId: null, userId: null, username: null, isDisconnected: false, disconnectTime: null, symbol: null, roll: null });
                 gameStateChanged = true;
                 await pubClient.del(getRoomDisconnectTimerKey(roomId, userId));
             }
             else if (!isExplicitLeave && state.gamePhase !== 'game_over' && state.gamePhase !== 'waiting' && !playerState.isDisconnected) {
                 playerState.isDisconnected = true; playerState.disconnectTime = Date.now(); playerState.socketId = null;
                 gameStateChanged = true;
                 const timerKey = getRoomDisconnectTimerKey(roomId, userId);
                 await pubClient.set(timerKey, 'pending_removal');
                 await pubClient.expire(timerKey, RECONNECT_TIMEOUT_MS / 1000);
                 state.statusMessage = `${username} bağlantısı kəsildi...`;
             }

             if (opponentState?.socketId && !opponentState.isDisconnected) {
                 remainingPlayerSocketId = opponentState.socketId;
                 const opponentSocket = io.sockets.sockets.get(remainingPlayerSocketId);
                 if (opponentSocket) {
                      opponentSocket.emit('opponent_left_game', { username: username, reconnecting: !isExplicitLeave && state.gamePhase !== 'game_over' && state.gamePhase !== 'waiting' });
                      if ((isExplicitLeave || state.gamePhase === 'game_over' || state.gamePhase === 'waiting') && state.gamePhase !== 'game_over') {
                          state.gamePhase = 'waiting'; state.statusMessage = "Rəqib ayrıldı...";
                          // Oyun məlumatlarını sıfırla
                          state.board = Array(state.boardSize * state.boardSize).fill('');
                          if(state.player1) { state.player1.roll = null; state.player1.symbol = null; }
                          if(state.player2) { state.player2.roll = null; state.player2.symbol = null; }
                          state.currentPlayerSymbol = null; state.diceWinnerSocketId = null; state.symbolPickerSocketId = null;
                          state.winningCombination = []; state.isGameOver = false; state.winnerSymbol = null;
                          gameStateChanged = true;
                      }
                 }
             }
        } else { console.warn(`[handleDisconnect] User (${username}) gameState-də tapılmadı. Room: ${roomId}`); }

        const remainingPlayerCount = await pubClient.sCard(roomPlayersKey);
        let activePlayerCountInState = 0;
        if (state.player1?.socketId && !state.player1.isDisconnected) activePlayerCountInState++;
        if (state.player2?.socketId && !state.player2.isDisconnected) activePlayerCountInState++;

        if (remainingPlayerCount === 0 && activePlayerCountInState === 0) { roomShouldBeCleaned = true; }
        else if (remainingPlayerCount === 1 && activePlayerCountInState === 1 && roomData.creatorUserId === userId.toString()) {
             if(opponentState && opponentState.username) {
                 await pubClient.hSet(roomKey, 'creatorUsername', opponentState.username);
                 await pubClient.hSet(roomKey, 'creatorUserId', opponentState.userId.toString());
             }
        }

        if (gameStateChanged) { await saveGameStateToRedis(roomId, state); } // Bu pubClient istifadə edir

        if (roomShouldBeCleaned) {
            const expireSeconds = ROOM_CLEANUP_DELAY_MS / 1000;
            await pubClient.multi().expire(roomKey, expireSeconds).expire(roomPlayersKey, expireSeconds).sRem('activeRooms', roomKey).exec();
            console.log(`[Room Cleanup] Redis EXPIRE set for ${roomKey}, <span class="math-inline">\{roomPlayersKey\} \(</span>{expireSeconds}s). Removed from activeRooms.`);
        } else if (gameStateChanged && remainingPlayerSocketId) {
             await emitGameStateUpdateRedis(roomId, `player_${reason}_processed`, io); // io-nu ötür
        }
         await broadcastRoomListRedis(io); // io-nu ötür

    } catch (err) {
        console.error(`[handleDisconnect ERROR] User: ${username}, Room: ${roomId}, Reason: ${reason}:`, err);
        try { await broadcastRoomListRedis(io); } catch (e) {} // io-nu ötür
    }
}

module.exports = handleDisconnectOrLeaveRedis; // Funksiyanı export edirik