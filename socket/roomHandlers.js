// server/socket/roomHandlers.js
const bcrypt = require('bcrypt');
const { pubClient } = require('../config/redis');
const { initializeGameState } = require('../utils/gameHelpers');
const {
    generateRoomId, getRoomKey, getRoomPlayersKey, getSocketRoomKey,
    broadcastRoomListRedis, getRoomDataFromRedis, saveGameStateToRedis
} = require('../utils/redisHelpers');

// Otaq Yaratma Handler-i
exports.handleCreateRoom = async (socket, io, data, userInfo) => {
    console.log(`[create_room] Hadisə alındı: User=${userInfo.username}, Data=`, data);
    // Validasiya... (kod təkrarını azaltmaq üçün bunu ayrıca funksiya etmək olar)
    if (!data || !data.name || data.name.trim().length === 0 || data.name.length > 30) { return socket.emit('creation_error', 'Otaq adı etibarsızdır (1-30 simvol).'); }
    const roomName = data.name.trim();
    const roomPassword = data.password || null;
    let hashedRoomPassword = null;
    if (roomPassword) {
        if (roomPassword.length < 2 || roomPassword.length > 20) { return socket.emit('creation_error', 'Şifrə etibarsızdır (2-20 simvol).'); }
         hashedRoomPassword = await bcrypt.hash(roomPassword, 10); // saltRoundları configdən almaq olar
    }
    const validatedBoardSize = Math.max(3, Math.min(6, parseInt(data.boardSize, 10) || 3));
    const currentRoomId = await pubClient.get(getSocketRoomKey(socket.id));
    if (currentRoomId) { return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız.'); }

    const newRoomId = generateRoomId();
    const roomKey = getRoomKey(newRoomId);
    const roomPlayersKey = getRoomPlayersKey(newRoomId);
    const socketRoomKey = getSocketRoomKey(socket.id);
    const initialGameState = initializeGameState(validatedBoardSize, userInfo); // UserInfo-da socket.id də var

    try {
        const multi = pubClient.multi();
        multi.hSet(roomKey, { id: newRoomId, name: roomName, password: hashedRoomPassword, boardSize: validatedBoardSize.toString(), creatorUsername: userInfo.username, creatorUserId: userInfo.userId.toString(), gameState: JSON.stringify(initialGameState) });
        multi.sAdd(roomPlayersKey, socket.id);
        multi.set(socketRoomKey, newRoomId);
        multi.sAdd('activeRooms', roomKey);
        multi.persist(roomKey); multi.persist(roomPlayersKey);
        await multi.exec();

        socket.join(newRoomId);
        console.log(`[create_room OK] Otaq yaradıldı: ID=<span class="math-inline">\{newRoomId\}, Ad\='</span>{roomName}'`);
        await broadcastRoomListRedis(io); // io obyektini ötürürük
        socket.emit('room_joined', { roomId: newRoomId, roomName: roomName, boardSize: validatedBoardSize });
    } catch (err) {
        console.error(`[create_room ERROR] Redis əməliyyatları zamanı xəta (Room: ${newRoomId}):`, err);
        socket.emit('creation_error', 'Otaq yaradılarkən server xətası baş verdi.');
        await pubClient.del(roomKey).catch(e => {}); await pubClient.del(roomPlayersKey).catch(e => {});
        await pubClient.del(socketRoomKey).catch(e => {}); await pubClient.sRem('activeRooms', roomKey).catch(e => {});
    }
};

// Otağa Qoşulma Handler-i (Lobbidən)
exports.handleJoinRoom = async (socket, io, data, userInfo) => {
     console.log(`[join_room] Hadisə alındı: User=${userInfo.username}, Data=`, data);
     if (!data || !data.roomId) { return socket.emit('join_error', 'Otaq ID göndərilmədi.'); }
     const roomId = data.roomId;
     const roomKey = getRoomKey(roomId);

     try {
         const roomExists = await pubClient.exists(roomKey);
         if (!roomExists) { await broadcastRoomListRedis(io); return socket.emit('join_error', 'Otaq tapılmadı.'); }
         const roomPasswordHash = await pubClient.hGet(roomKey, 'password');
         if (roomPasswordHash) {
             if (!data.password) return socket.emit('join_error', 'Bu otaq üçün şifrə tələb olunur.');
             const passwordMatch = await bcrypt.compare(data.password, roomPasswordHash);
             if (!passwordMatch) return socket.emit('join_error', 'Şifrə yanlışdır.');
         }
         const currentRoomId = await pubClient.get(getSocketRoomKey(socket.id));
         if (currentRoomId && currentRoomId !== roomId) { return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.'); }
         if (currentRoomId === roomId) {
              const roomName = await pubClient.hGet(roomKey, 'name') || 'Bilinməyən';
              const boardSize = parseInt(await pubClient.hGet(roomKey, 'boardSize') || '3', 10);
              socket.emit('room_joined', { roomId, roomName, boardSize }); return;
         }
         const roomData = await getRoomDataFromRedis(roomId);
         if (!roomData || !roomData.gameState) { return socket.emit('join_error', 'Otaq vəziyyəti alına bilmədi.'); }
         const gameState = roomData.gameState;
         let activePlayerCount = 0;
         const userAlreadyInGame = (gameState.player1?.userId === userInfo.userId && !gameState.player1.isDisconnected) || (gameState.player2?.userId === userInfo.userId && !gameState.player2.isDisconnected);
         if (gameState.player1?.socketId && !gameState.player1.isDisconnected) activePlayerCount++;
         if (gameState.player2?.socketId && !gameState.player2.isDisconnected) activePlayerCount++;
         if (activePlayerCount >= 2 && !userAlreadyInGame) { return socket.emit('join_error', 'Otaq doludur.'); }

         console.log(`[join_room OK] User ${userInfo.username} joining room ${roomId}. Sending room_joined.`);
         socket.emit('room_joined', { roomId: roomData.id, roomName: roomData.name, boardSize: roomData.boardSize });
     } catch (err) {
         console.error(`[join_room ERROR] Otağa (${roomId}) qoşularkən xəta:`, err);
         socket.emit('join_error', 'Otağa qoşularkən server xətası baş verdi.');
     }
};

// Otaqda Hazır Olma Handler-i
exports.handlePlayerReady = async (socket, io, data, userInfo) => {
    if (!data || !data.roomId || data.userId !== userInfo.userId) return;
    const roomId = data.roomId;
    const roomKey = getRoomKey(roomId);
    const roomPlayersKey = getRoomPlayersKey(roomId);
    const socketRoomKey = getSocketRoomKey(socket.id);

    console.log(`[player_ready] Hadisə alındı: User=<span class="math-inline">\{userInfo\.username\}, RoomID\=</span>{roomId}`);
    try {
        const roomData = await getRoomDataFromRedis(roomId);
        if (!roomData || !roomData.gameState) { return socket.emit('force_redirect_lobby', { message: "Otaq tapılmadı və ya vəziyyəti xətalıdır." }); }
        const gameState = roomData.gameState;
        if (!socket.rooms.has(roomId)) { socket.join(roomId); }

        let playerSlot = null; let playerState = null; let needsSave = false;
        if (gameState.player1?.userId === userInfo.userId) { playerSlot = 1; playerState = gameState.player1; }
        else if (gameState.player2?.userId === userInfo.userId) { playerSlot = 2; playerState = gameState.player2; }

        if (playerState && playerState.isDisconnected) { // Reconnect
            console.log(`[player_ready] Reconnecting User: ${userInfo.username} (Slot ${playerSlot})`);
            await pubClient.del(getRoomDisconnectTimerKey(roomId, userInfo.userId));
            playerState.socketId = socket.id; playerState.isDisconnected = false; playerState.disconnectTime = null; playerState.username = userInfo.username;
            needsSave = true;
            await pubClient.sAdd(roomPlayersKey, socket.id); await pubClient.set(socketRoomKey, roomId);
            const opponentState = (playerSlot === 1) ? gameState.player2 : gameState.player1;
            if (opponentState?.socketId && !opponentState.isDisconnected) { gameState.statusMessage = `${userInfo.username} qayıtdı. Sıra: ${ (gameState.currentPlayerSymbol === playerState.symbol ? playerState : opponentState)?.username || gameState.currentPlayerSymbol || '?'}`; }
            else { gameState.gamePhase = 'waiting'; gameState.statusMessage = "Rəqib gözlənilir..."; }
            await broadcastRoomListRedis(io);
        } else if (!playerState && (!gameState.player1?.userId || !gameState.player2?.userId)) { // New player
            const targetSlotNum = (!gameState.player1?.userId) ? 1 : 2;
            playerState = (targetSlotNum === 1) ? gameState.player1 : gameState.player2;
            console.log(`[player_ready] New player <span class="math-inline">\{userInfo\.username\} joining as P</span>{targetSlotNum}`);
            playerState.socketId = socket.id; playerState.userId = userInfo.userId; playerState.username = userInfo.username; playerState.isDisconnected = false;
            needsSave = true;
            await pubClient.sAdd(roomPlayersKey, socket.id); await pubClient.set(socketRoomKey, roomId);
            if (gameState.player1?.userId && gameState.player2?.userId) { gameState.gamePhase = 'dice_roll'; gameState.statusMessage = "Oyunçular zər atır..."; gameState.player1.roll = null; gameState.player2.roll = null; }
            await broadcastRoomListRedis(io);
        } else if (playerState && playerState.socketId !== socket.id && !playerState.isDisconnected) { // Same user, different active socket
            console.warn(`[player_ready] User <span class="math-inline">\{userInfo\.username\} already actively connected with socket \(</span>{playerState.socketId}). New socket ${socket.id}.`);
            const oldSocketId = playerState.socketId; const oldSocketInstance = io.sockets.sockets.get(oldSocketId);
            if (oldSocketInstance) { oldSocketInstance.emit('force_disconnect', { message: 'Bu hesabla başqa yerdən qoşuldunuz.' }); oldSocketInstance.disconnect(true); }
            await pubClient.sRem(roomPlayersKey, oldSocketId); await pubClient.sAdd(roomPlayersKey, socket.id); await pubClient.set(socketRoomKey, roomId);
            playerState.socketId = socket.id; needsSave = true;
        } else if (playerState && playerState.socketId === socket.id && !playerState.isDisconnected) { // Already connected
            console.log(`[player_ready] Player ${userInfo.username} is already connected and active.`); needsSave = true;
        }

        if (needsSave) { await saveGameStateToRedis(roomId, gameState); await emitGameStateUpdateRedis(roomId, 'player_ready', io); }
        socket.emit('room_info', { name: roomData.name, boardSize: roomData.boardSize, creatorUsername: roomData.creatorUsername });
    } catch (err) {
        console.error(`[player_ready ERROR] Otağa (${roomId}) hazır olarkən xəta:`, err);
        socket.emit('force_redirect_lobby', { message: "Otağa qoşularkən server xətası." });
    }
};

// Burada digər otaq idarəetmə hadisələri (update_room_settings, delete_room, kick_opponent)
// eyni məntiqlə ayrı funksiyalar kimi əlavə edilə bilər.
// Hələlik sadəlik üçün əlavə etmirəm, əsas qoşulma/yaratma var.