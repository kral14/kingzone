// server/socket/index.js

const socketAuthMiddleware     = require('./auth');
const roomHandlers            = require('./roomHandlers');
const gameHandlers            = require('./gameHandlers');
const handleDisconnectOrLeave = require('../utils/disconnectHandler');
const {
  broadcastRoomListRedis,
  getUserInfoKey
} = require('../utils/redisHelpers');
const { pubClient } = require('../server/config/redis');

function initializeSocketIO(io) {
  // 1) Auth middleware
  io.use(socketAuthMiddleware);

  // 2) Temel bağlantı
  io.on('connection', async (socket) => {
    // 2.1) userInfo al
    const userInfo = socket.conn.request.userInfoFromAuth;
    if (!userInfo) {
      console.error(`[Socket Connect FATAL] Auth middleware user info təyin etmədi! Socket: ${socket.id}`);
      return socket.disconnect(true);
    }
    console.log(`[Socket Connect OK] ++ User Qoşuldu: ${userInfo.username} (UserID: ${userInfo.userId}), Socket ID: ${socket.id}`);

    // 2.2) Bütün gələn event’ləri log et
    socket.onAny((eventName, ...args) => {
      console.log(`[DEBUG ANY] event arrived from ${userInfo.username} (Socket=${socket.id}):`, eventName, args);
    });

    console.log(`[DEBUG connection] Setting up listeners for ${socket.id}.`);

    // 2.3) HANDLER-ləri bağla
    socket.on('create_room', (data) => {
      if (typeof roomHandlers.handleCreateRoom === 'function') {
        roomHandlers.handleCreateRoom(socket, io, data, userInfo);
      } else {
        console.error('[FATAL] handleCreateRoom is NOT a function!');
        socket.emit('creation_error', 'Serverdə kritik xəta (handler tapılmadı).');
      }
    });

    socket.on('join_room', (data) => {
      console.log(`[Socket Event] join_room alındı from ${userInfo.username}:`, data);
      if (typeof roomHandlers.handleJoinRoom === 'function') {
        roomHandlers.handleJoinRoom(socket, io, data, userInfo);
      } else {
        console.error('[FATAL] handleJoinRoom is NOT a function!');
        socket.emit('join_error', 'Serverdə kritik xəta (handler tapılmadı).');
      }
    });

    socket.on('player_ready_in_room', (data) => {
      console.log(`>>>> [SERVER-DEBUG index.js] 'player_ready_in_room' ALINDI! Socket: ${socket.id}, Data:`, data);
      if (typeof roomHandlers.handlePlayerReady === 'function') {
        roomHandlers.handlePlayerReady(socket, io, data, userInfo);
      } else {
        console.error('[FATAL] handlePlayerReady is NOT a function!');
        socket.emit('game_error', { message: 'Serverdə kritik xəta (handler tapılmadı).' });
      }
    });

    // Oyun içi digər handler’lar
    socket.on('dice_roll_result', data =>
      gameHandlers.handleDiceRoll(socket, io, data, userInfo)
    );
    socket.on('symbol_choice', data =>
      gameHandlers.handleSymbolChoice(socket, io, data, userInfo)
    );
    socket.on('make_move', data =>
      gameHandlers.handleMakeMove(socket, io, data, userInfo)
    );
    socket.on('request_restart', () =>
      gameHandlers.handleRequestRestart(socket, io, null, userInfo)
    );
    socket.on('accept_restart', () =>
      gameHandlers.handleAcceptRestart(socket, io, null, userInfo)
    );
    socket.on('decline_restart', () =>
      gameHandlers.handleDeclineRestart(socket, io, null, userInfo)
    );

    // Otaqdan ayrılma
    socket.on('leave_room', () => {
      console.log(`[Socket Event] leave_room request from ${userInfo.username}`);
      handleDisconnectOrLeave(socket, 'leave_room_request', io);
    });

    // Disconnect
    socket.on('disconnect', (reason) => {
      console.log(`[Socket Event] disconnect event for ${userInfo.username}. Reason: ${reason}`);
      handleDisconnectOrLeave(socket, reason, io);
      pubClient.del(getUserInfoKey(socket.id))
        .catch(e => console.error("Error deleting userInfo on disconnect:", e));
    });

    // 2.4) Handler’lər artıq quraşdırıldı, indi ilk lobi siyahısını yolla
    try {
      await broadcastRoomListRedis(io);
    } catch (err) {
      console.error(`[Socket Connect ERROR] Initial broadcast error for ${userInfo.username}:`, err);
    }
  });

  console.log('[Socket Setup OK] Socket.IO bağlantı dinləyicisi və hadisə handlerləri təyin edildi.');
}

module.exports = initializeSocketIO;
