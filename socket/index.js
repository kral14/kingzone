// server/socket/index.js
const socketAuthMiddleware = require('./auth');
const roomHandlers = require('./roomHandlers');
const gameHandlers = require('./gameHandlers');
const handleDisconnectOrLeaveRedis = require('../utils/disconnectHandler');
const { broadcastRoomListRedis, getUserInfoKey } = require('../utils/redisHelpers');
const { pubClient } = require('../config/redis'); // Disconnect-də user info silmək üçün

function initializeSocketIO(io) {

    // Socket.IO üçün autentifikasiya middleware-ni tətbiq et
    io.use(socketAuthMiddleware);

    // Əsas bağlantı hadisəsi
    io.on('connection', async (socket) => {

        // userInfo auth middleware tərəfindən socket.conn.request.userInfoFromAuth içinə qoyulmuşdu
        const userInfo = socket.conn.request.userInfoFromAuth;

        if (!userInfo) { // Hər ehtimala qarşı yoxlama
            console.error(`[Socket Connect FATAL] Auth middleware user info təyin etmədi! Socket: ${socket.id}`);
            socket.disconnect(true);
            return;
        }
        console.log(`[Socket Connect OK] ++ User Qoşuldu: ${userInfo.username} (UserID: ${userInfo.userId}), Socket ID: ${socket.id}`);

        // İlkin otaq siyahısını göndər
        try { await broadcastRoomListRedis(io); }
        catch (err) { console.error(`[Socket Connect ERROR] Initial broadcast error for ${userInfo.username}:`, err); }

        // Otaq Handler-lərini bağla
        socket.on('create_room', (data) => roomHandlers.handleCreateRoom(socket, io, data, userInfo));
        socket.on('join_room', (data) => roomHandlers.handleJoinRoom(socket, io, data, userInfo));
        socket.on('player_ready_in_room', (data) => roomHandlers.handlePlayerReady(socket, io, data, userInfo));
        // Digər otaq handlerləri (update_room_settings və s.) buraya əlavə edilə bilər

        // Oyun Handler-lərini bağla
        socket.on('dice_roll_result', (data) => gameHandlers.handleDiceRoll(socket, io, data, userInfo));
        socket.on('symbol_choice', (data) => gameHandlers.handleSymbolChoice(socket, io, data, userInfo));
        socket.on('make_move', (data) => gameHandlers.handleMakeMove(socket, io, data, userInfo));
        socket.on('request_restart', () => gameHandlers.handleRequestRestart(socket, io, null, userInfo)); // data yoxdur
        socket.on('accept_restart', () => gameHandlers.handleAcceptRestart(socket, io, null, userInfo)); // data yoxdur
        socket.on('decline_restart', () => gameHandlers.handleDeclineRestart(socket, io, null, userInfo)); // data yoxdur

        // Otaqdan Aktiv Ayrılma
        socket.on('leave_room', () => {
            console.log(`[Socket Event] leave_room request from ${userInfo.username}`);
            handleDisconnectOrLeaveRedis(socket, 'leave_room_request', io); // io-nu ötür
        });

        // Bağlantı Kəsilməsi
        socket.on('disconnect', (reason) => {
            console.log(`[Socket Event] disconnect event for ${userInfo?.username || socket.id}. Reason: ${reason}`);
            handleDisconnectOrLeaveRedis(socket, reason, io); // io-nu ötür
            // User infonu disconnect-də silək (əgər auth fail etməyibsə)
            pubClient.del(getUserInfoKey(socket.id)).catch(e => console.error("Error deleting user info from Redis on disconnect:", e));
        });
    });

    console.log('[Socket Setup OK] Socket.IO bağlantı dinləyicisi və hadisə handlerləri təyin edildi.');
}

module.exports = initializeSocketIO;