// server/utils/redisHelpers.js
const crypto = require('crypto');
const { pubClient } = require('../config/redis'); // Redis klientini config-dən alırıq

// Otaq ID yaratmaq
function generateRoomId() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Redis açar adlarını yaratmaq üçün funksiyalar
function getUserInfoKey(socketId) { return `socket:${socketId}:userInfo`; }
function getSocketRoomKey(socketId) { return `socket:${socketId}:room`; }
function getRoomKey(roomId) { return `room:${roomId}`; }
function getRoomPlayersKey(roomId) { return `room:${roomId}:players`; }
function getRoomDisconnectTimerKey(roomId, userId) { return `room:<span class="math-inline">\{roomId\}\:disconnectTimer\:</span>{userId}`; }

// Redis-dən otaq məlumatlarını almaq (əsas məlumatlar + gameState JSON)
async function getRoomDataFromRedis(roomId) {
    try {
        const roomKey = getRoomKey(roomId);
        const roomData = await pubClient.hGetAll(roomKey);
        if (Object.keys(roomData).length === 0) return null;

        if (roomData.gameState) {
            try { roomData.gameState = JSON.parse(roomData.gameState); }
            catch (parseError) {
                console.error(`[Redis ERROR] Otaq ${roomId} gameState parse xətası:`, parseError);
                roomData.gameState = null;
            }
        } else { roomData.gameState = null; }
        roomData.players = await pubClient.sMembers(getRoomPlayersKey(roomId));
        return roomData;
    } catch (error) {
        console.error(`[Redis ERROR] Otaq ${roomId} məlumatları alınarkən xəta:`, error);
        return null;
    }
}

// GameState-i Redis-də yeniləmək
async function saveGameStateToRedis(roomId, gameState) {
    try {
        if (!gameState) { return false; }
        const roomKey = getRoomKey(roomId);
        const gameStateJson = JSON.stringify(gameState);
        await pubClient.hSet(roomKey, 'gameState', gameStateJson);
        return true;
    } catch (error) {
        console.error(`[Redis ERROR] Otaq ${roomId} gameState saxlanılarkən xəta:`, error);
        return false;
    }
}

// Otaq siyahısını Redis-dən alıb formatlayıb yayımlamaq
// DİQQƏT: Bu funksiya 'io' obyektini parametr kimi qəbul etməlidir!
async function broadcastRoomListRedis(io) {
    if (!io) {
        console.error("[Broadcast ERROR] `io` obyekti broadcastRoomListRedis funksiyasına ötürülmədi!");
        return;
    }
    try {
        const roomKeys = await pubClient.sMembers('activeRooms');
        const roomListForClients = [];
        for (const roomKey of roomKeys) {
            const roomId = roomKey.substring(5);
             const basicData = await pubClient.hmGet(roomKey, ['id', 'name', 'password', 'boardSize', 'creatorUsername']);
             const roomData = {
                 id: basicData[0] || roomId, name: basicData[1] || `Otaq ${roomId.substring(0,4)}`,
                 hasPassword: !!basicData[2], boardSize: parseInt(basicData[3] || '3', 10),
                 creatorUsername: basicData[4] || 'Bilinməyən'
             };
             const gameStateJson = await pubClient.hGet(roomKey, 'gameState');
             let activePlayerCount = 0; let p1Username = null; let p2Username = null;
             if (gameStateJson) {
                 try {
                     const gameState = JSON.parse(gameStateJson);
                     const p1 = gameState?.player1; const p2 = gameState?.player2;
                     if (p1?.socketId && !p1.isDisconnected) { activePlayerCount++; p1Username = p1.username; }
                     if (p2?.socketId && !p2.isDisconnected) { activePlayerCount++; p2Username = p2.username; }
                 } catch (e) { console.error(`[broadcastRoomListRedis] Room ${roomId} gameState parse xətası`); }
             } else { activePlayerCount = await pubClient.sCard(getRoomPlayersKey(roomId)); }
             roomListForClients.push({ ...roomData, playerCount: activePlayerCount, player1Username: p1Username, player2Username: p2Username, isAiRoom: false });
        }
        io.emit('room_list_update', roomListForClients);
    } catch (error) {
        console.error("[Broadcast ERROR] Redis otaq siyahısı göndərilərkən XƏTA:", error);
        io.emit('room_list_update', []);
    }
}

// Otaqdakı bütün clientlərə gameState göndərmək
// DİQQƏT: Bu funksiya da 'io' obyektini parametr kimi qəbul etməlidir!
async function emitGameStateUpdateRedis(roomId, triggeringEvent = 'N/A', io) {
     if (!io) {
        console.error("[State Emitter ERROR] `io` obyekti emitGameStateUpdateRedis funksiyasına ötürülmədi!");
        return;
    }
    try {
        const roomData = await getRoomDataFromRedis(roomId); // Bu funksiya pubClient-i özü istifadə edir
        if (roomData?.gameState) {
            io.to(roomId).emit('game_state_update', roomData.gameState);
        }
    } catch (error) {
        console.error(`[State Emitter ERROR] emitGameStateUpdateRedis zamanı xəta (RoomID: ${roomId}, Trigger: ${triggeringEvent}):`, error);
    }
}


module.exports = {
    generateRoomId,
    getUserInfoKey,
    getSocketRoomKey,
    getRoomKey,
    getRoomPlayersKey,
    getRoomDisconnectTimerKey,
    getRoomDataFromRedis,
    saveGameStateToRedis,
    broadcastRoomListRedis,
    emitGameStateUpdateRedis
};