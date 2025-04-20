// server/utils/disconnectHandler.js (v4 - Simplified State Reset, Full Code)
const { pubClient } = require('../server/config/redis');
const { findPlayerStatesByUserId, initializeGameState } = require('./gameHelpers');
const {
    getUserInfoKey, getSocketRoomKey, getRoomKey, getRoomPlayersKey,
    getRoomDisconnectTimerKey, getRoomDataFromRedis, saveGameStateToRedis,
    broadcastRoomListRedis, emitGameStateUpdateRedis
} = require('./redisHelpers');

const RECONNECT_TIMEOUT_MS = 30 * 1000; // 30 seconds
const ROOM_CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes

async function handleDisconnectOrLeaveRedis(socket, reason, io) {
    const socketId = socket.id;
    let localUserInfo;

    // 1. Get User Info from socket object (set by auth middleware)
    try {
        localUserInfo = socket.conn.request.userInfoFromAuth;
        if (!localUserInfo?.userId || !localUserInfo.username) {
            console.warn(`[handleDisconnect WARN v4] User info not found on socket ${socketId}. Cannot process disconnect fully.`);
            try { await pubClient.del(getUserInfoKey(socketId)); } catch (e) { }
            return;
        }
    } catch (err) {
        console.error(`[handleDisconnect ERROR v4] Error getting user info from socket ${socketId}:`, err);
        return;
    }

    const { userId, username } = localUserInfo;
    const socketRoomKey = getSocketRoomKey(socketId);
    let roomId = null;
    let gameStateChanged = false;
    let isExplicitLeave = (reason === 'leave_room_request');
    let remainingPlayerSocketId = null;
    let roomKey = null;

    try {
        // 2. Find associated Room ID from Redis
        roomId = await pubClient.get(socketRoomKey);
        console.log(`[handleDisconnect v4] Processing: User=${username}(${userId}), Socket=${socketId}, Room=${roomId || 'N/A'}, Reason=${reason}, ExplicitLeave=${isExplicitLeave}`);

        // 3. Clean up socket-specific Redis keys
        await pubClient.del(socketRoomKey).catch(e => console.warn(`[handleDisconnect v4] DEL socketRoomKey error: ${e.message}`));
        await pubClient.del(getUserInfoKey(socketId)).catch(e => console.warn(`[handleDisconnect v4] DEL userInfoKey error: ${e.message}`));

        // If socket wasn't associated with a room, exit
        if (!roomId) {
            console.log(`[handleDisconnect v4] User ${username} was not associated with a room.`);
            return;
        }

        // 4. Define room keys and remove socket from room's player set
        roomKey = getRoomKey(roomId);
        const roomPlayersKey = getRoomPlayersKey(roomId);
        await pubClient.sRem(roomPlayersKey, socketId);
        console.log(`[handleDisconnect v4] Removed socket ${socketId} from players set ${roomPlayersKey}.`);

        // 5. Get current room data and game state
        const roomData = await getRoomDataFromRedis(roomId);

        // If room or game state doesn't exist anymore (e.g., expired/deleted)
        if (!roomData || !roomData.gameState) {
            console.warn(`[handleDisconnect v4] Room ${roomId} or gameState not found in Redis. Cleaning up activeRooms.`);
            await pubClient.sRem('activeRooms', roomKey).catch(e => { });
            await broadcastRoomListRedis(io);
            return;
        }

        const state = roomData.gameState;
        const { playerState, opponentState } = findPlayerStatesByUserId(state, userId);

        // 6. Process game state update based on player leaving/disconnecting
        if (playerState) {
            const gameWasInProgress = state.gamePhase !== 'waiting' && state.gamePhase !== 'game_over';
            console.log(`[handleDisconnect v4] Player found. gameWasInProgress=${gameWasInProgress}, isExplicitLeave=${isExplicitLeave}, currentPhase=${state.gamePhase}`);

            // --- Cancel any pending restart request involving this player ---
            if (state.restartRequestedBy === socketId || state.restartAcceptedBy.includes(socketId)) {
                console.log(`[handleDisconnect v4] Cancelling pending restart request involving player ${username}.`);
                state.restartRequestedBy = null;
                state.restartAcceptedBy = [];
                if (state.gamePhase === 'game_over') { // Restore appropriate game over message
                    if (state.winnerSymbol === 'draw') state.statusMessage = "Oyun Bərabərə!";
                    else if (state.winnerSymbol) {
                        const winnerIsP1 = state.player1?.symbol === state.winnerSymbol;
                        state.statusMessage = `${(winnerIsP1 ? state.player1?.username : state.player2?.username) || state.winnerSymbol} Qazandı!`;
                    } else state.statusMessage = "Oyun Bitdi";
                }
                gameStateChanged = true;
            }

            // --- Handle Explicit Leave vs. Implicit Disconnect ---
            if (isExplicitLeave) {
                console.log(`[handleDisconnect v4] Player ${username} left explicitly.`);
                await pubClient.del(getRoomDisconnectTimerKey(roomId, userId)).catch(e => {}); // Clear timer

                // --- Reset Game State if Game Was In Progress AND Opponent Exists ---
                if (gameWasInProgress && opponentState?.userId) {
                    console.warn(`[handleDisconnect v4] Game in progress (${state.gamePhase}). Resetting state.`);

                    // Prepare opponent info, passing socketId ONLY if they are currently connected
                    const opponentInfo = {
                        userId: opponentState.userId,
                        username: opponentState.username,
                        id: (!opponentState.isDisconnected && opponentState.socketId) ? opponentState.socketId : null
                    };
                    const opponentWasP1 = (state.player1?.userId === opponentState.userId);

                    // Re-initialize the game state
                    const newInitialState = opponentWasP1
                        ? initializeGameState(state.boardSize, opponentInfo, null)
                        : initializeGameState(state.boardSize, null, opponentInfo);

                    // *** Update the existing 'state' object with the new properties ***
                    // This method modifies the original object directly.
                    state.board = newInitialState.board;
                    state.gamePhase = newInitialState.gamePhase; // Should be 'waiting'
                    state.currentPlayerSymbol = newInitialState.currentPlayerSymbol;
                    // Update player1 state
                    if(newInitialState.player1 && state.player1) { // Ensure state.player1 exists before assigning
                        Object.assign(state.player1, newInitialState.player1);
                    } else {
                         state.player1 = newInitialState.player1; // If state.player1 was null, assign directly
                    }
                     // Update player2 state
                    if(newInitialState.player2 && state.player2) { // Ensure state.player2 exists before assigning
                        Object.assign(state.player2, newInitialState.player2);
                    } else {
                        state.player2 = newInitialState.player2; // If state.player2 was null, assign directly
                    }
                    // Update other top-level state properties
                    state.diceWinnerSocketId = newInitialState.diceWinnerSocketId;
                    state.symbolPickerSocketId = newInitialState.symbolPickerSocketId;
                    state.isGameOver = newInitialState.isGameOver;
                    state.winnerSymbol = newInitialState.winnerSymbol;
                    state.winningCombination = newInitialState.winningCombination;
                    state.lastMoveTime = newInitialState.lastMoveTime;
                    state.restartRequestedBy = newInitialState.restartRequestedBy;
                    state.restartAcceptedBy = newInitialState.restartAcceptedBy;
                    // Update status message based on the new state
                    state.statusMessage = newInitialState.statusMessage;

                    let remainingPlayer = opponentWasP1 ? state.player1 : state.player2;
                    console.log(`[handleDisconnect v4] Game state reset. Remaining player active: ${!remainingPlayer?.isDisconnected}`);

                } else {
                    // Game not in progress or no opponent - just clear the leaving player's slot
                    console.log(`[handleDisconnect v4] Game not in progress or opponent empty. Resetting player slot only.`);
                    Object.assign(playerState, {
                        socketId: null, userId: null, username: null,
                        symbol: null, roll: null, isDisconnected: false, disconnectTime: null
                    });
                    if (state.gamePhase === 'waiting') { state.statusMessage = "Rəqib ayrıldı..."; }
                }
                gameStateChanged = true;

            } else if (!playerState.isDisconnected) { // Implicit disconnect AND not already marked
                console.log(`[handleDisconnect v4] Player ${username} disconnected implicitly.`);
                playerState.isDisconnected = true;
                playerState.disconnectTime = Date.now();
                playerState.socketId = null;
                gameStateChanged = true;

                if (gameWasInProgress) { // Set timer only if game was ongoing
                    const timerKey = getRoomDisconnectTimerKey(roomId, userId);
                    console.log(`[handleDisconnect v4] Setting disconnect timer (${RECONNECT_TIMEOUT_MS}ms): ${timerKey}`);
                    await pubClient.set(timerKey, 'pending_removal');
                    await pubClient.expire(timerKey, Math.ceil(RECONNECT_TIMEOUT_MS / 1000));
                    state.statusMessage = `${username} bağlantısı kəsildi...`;
                } else {
                    console.log(`[handleDisconnect v4] Game not in progress. Not setting timer.`);
                }
            } else {
                // Player was found but already marked disconnected
                console.log(`[handleDisconnect v4] Player ${username} was already marked as disconnected.`);
            }

            // --- Notify opponent (if any and connected) ---
            if (opponentState?.socketId && !opponentState.isDisconnected) {
                remainingPlayerSocketId = opponentState.socketId;
                const opponentSocket = io.sockets.sockets.get(remainingPlayerSocketId);
                if (opponentSocket) {
                    console.log(`[handleDisconnect v4] Notifying opponent ${opponentState.username}`);
                    opponentSocket.emit('opponent_left_game', {
                        username: username,
                        reconnecting: !isExplicitLeave && state.gamePhase !== 'game_over'
                    });
                } else {
                    console.warn(`[handleDisconnect v4] Opponent socket ${remainingPlayerSocketId} not found.`);
                }
            }

        } else {
            // Player not found in game state (might have been cleaned up already)
            console.warn(`[handleDisconnect v4] User (${username}) not found in gameState for room ${roomId}.`);
        }

        // --- Room Persistence / Expiry Logic ---
       // --- Room Persistence / Expiry Logic (YENİLƏNMİŞ) ---
        // Otağın həqiqətən boş olub olmadığını gameState-ə əsasən yoxlayaq
        const isP1SlotFilled = state.player1?.userId !== null && state.player1?.userId !== undefined;
        const isP2SlotFilled = state.player2?.userId !== null && state.player2?.userId !== undefined;
        const isRoomLogicallyEmpty = !isP1SlotFilled && !isP2SlotFilled;

        console.log(`[handleDisconnect v4] Logic Check: isP1SlotFilled=${isP1SlotFilled}, isP2SlotFilled=${isP2SlotFilled}, isRoomLogicallyEmpty=${isRoomLogicallyEmpty}`);

        if (isRoomLogicallyEmpty) {
            // Otaq məntiqi olaraq boşdur, Redis-dəki məlumatları silə bilərik
            const expireSeconds = Math.ceil(ROOM_CLEANUP_DELAY_MS / 1000); // Qısa müddət sonra silinsin
            console.log(`[handleDisconnect v4] Room ${roomId} is logically empty. Setting EXPIRE for ${expireSeconds}s on main key.`);
             // Əsas otaq açarını expire et (gameState və digər məlumatlar üçün)
            await pubClient.expire(roomKey, expireSeconds).catch(e => console.error(`Error expiring room key ${roomKey}:`, e));
             // Player socket setini dərhal silə bilərik, onsuz da boşdur
            await pubClient.del(roomPlayersKey).catch(e => console.error(`Error deleting players set key ${roomPlayersKey}:`, e));
             // Aktiv otaqlar setindən çıxartmaya da bilərik, expire olmasını gözləyə bilərik
             // await pubClient.sRem('activeRooms', roomKey).catch(e => {});

        } else {
            // Otaqda hələ də məntiqi olaraq oyunçu var, persist et
            console.log(`[handleDisconnect v4] Room ${roomId} still has players logically. Persisting main key.`);
            await pubClient.persist(roomKey).catch(e => console.error(`Error persisting room key ${roomKey}:`, e));

             // Yaradan dəyişmə məntiqi burada qalsın (amma şərti isRoomLogicallyEmpty=false olaraq düşünək)
             // Əgər disconnect olan yaradan idisə VƏ digər oyunçu varsa, onu yaradan et
             if (isExplicitLeave && roomData.creatorUserId === userId.toString() && opponentState?.userId && opponentState.username) {
                 console.log(`[handleDisconnect v4] Explicit leave by creator. Changing creator to ${opponentState.username}.`);
                 await pubClient.hSet(roomKey, 'creatorUsername', opponentState.username);
                 await pubClient.hSet(roomKey, 'creatorUserId', opponentState.userId.toString());
             } else if (!isExplicitLeave && roomData.creatorUserId === userId.toString() && opponentState?.userId && opponentState.username) {
                // İmplicit disconnect olan yaradan idisə, digərini yaradan təyin et ki, otağı idarə edə bilsin
                 console.log(`[handleDisconnect v4] Implicit disconnect by creator. Changing creator to ${opponentState.username}.`);
                 await pubClient.hSet(roomKey, 'creatorUsername', opponentState.username);
                 await pubClient.hSet(roomKey, 'creatorUserId', opponentState.userId.toString());
             }
        }
        // --- Room Persistence / Expiry Logic (YENİLƏNMİŞ) SONU ---

        // --- Save state and broadcast updates ---
        if (gameStateChanged) {
            console.log("[handleDisconnect v4] Saving changed gameState to Redis...");
            await saveGameStateToRedis(roomId, state); // Save the modified state object
            console.log(`[handleDisconnect v4] Emitting state update to room ${roomId}.`);
            await emitGameStateUpdateRedis(roomId, `player_${isExplicitLeave ? 'left' : 'disconnected'}`, io);
        } else {
            console.log("[handleDisconnect v4] No state changes requiring save.");
            // Optional: Emit even if no state change to sync potential UI differences?
            // await emitGameStateUpdateRedis(roomId, `player_disconnect_processed_no_change`, io);
        }

        // Always update the lobby list
        await broadcastRoomListRedis(io);

    } catch (err) {
        console.error(`[handleDisconnect v4 ERROR] User: ${username}, Room: ${roomId || 'N/A'}, Reason: ${reason}:`, err);
        try { await broadcastRoomListRedis(io); } catch (e) {} // Attempt lobby update on error too
    } finally {
         console.log(`[handleDisconnect v4] Finished processing for User=${username}, Socket=${socketId}`);
    }
}

// Export the single handler function
module.exports = handleDisconnectOrLeaveRedis;