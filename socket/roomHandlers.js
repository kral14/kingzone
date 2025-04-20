// kingzone/socket/roomHandlers.js (SERVER TƏRƏFİ - YALNIZ handleCreateRoom içinə loglar əlavə edilib)
const bcrypt = require('bcrypt');
const { pubClient } = require('../server/config/redis');
const { initializeGameState, findPlayerStatesByUserId } = require('../utils/gameHelpers');
const {
    generateRoomId, getRoomKey, getSocketRoomKey, getRoomPlayersKey,
    getRoomDisconnectTimerKey, broadcastRoomListRedis, getRoomDataFromRedis,
    saveGameStateToRedis, emitGameStateUpdateRedis, getUserInfoKey
} = require('../utils/redisHelpers');
const disconnectHandler = require('../utils/disconnectHandler');

// Log Prefixes
const READY_LOG  = '[READY-HANDLER]';
const CREATE_LOG = '[CREATE-HANDLER]';
const JOIN_LOG   = '[JOIN-HANDLER]';

module.exports = {

    // --- FUNKSIYA F1: handleCreateRoom (LOGLAR ƏLAVƏ EDİLMİŞ) ---
    handleCreateRoom: async function (socket, io, data, userInfo) {
        // >> F1-L1: Funksiya Başladı
        console.log(`\n\n>>>>> [SERVER-DEBUG F1-L1] handleCreateRoom BAŞLADI <<<<<`);
        const handlerStart = Date.now();
        console.log(`      User: ${userInfo?.username}(${userInfo?.userId}), Socket: ${socket?.id}, Time: ${handlerStart}`);
        console.log(`      Alınan Data:`, JSON.stringify(data));
        // -----

        if (!userInfo || !userInfo.userId || !userInfo.username) {
            console.error(`${CREATE_LOG} XƏTA: userInfo tapılmadı!`);
            // >> F1-L2: Xəta - userInfo yoxdur
            console.log(`[SERVER-DEBUG F1-L2] handleCreateRoom XƏTA - userInfo yoxdur.`);
            // -----
            return;
        }
        const roomName = data.name.trim();
        if (!roomName || roomName.length === 0 || roomName.length > 30) { // Validation əlavə edildi
            console.log(`${CREATE_LOG} Validation Failed: Invalid room name.`);
            return socket.emit('creation_error', 'Otaq adı etibarsızdır (1-30 simvol).');
        }
        const roomPassword = data.password || null;
        let hashedRoomPassword = null;
        if (roomPassword) {
            if (roomPassword.length < 2 || roomPassword.length > 20) {
                 console.log(`${CREATE_LOG} Validation Failed: Invalid password length.`);
                 return socket.emit('creation_error', 'Şifrə etibarsızdır (2-20 simvol).');
             }
             try {
                 hashedRoomPassword = await bcrypt.hash(roomPassword, 10);
             } catch (hashErr) {
                 console.error(`${CREATE_LOG} Şifrə hash xətası:`, hashErr);
                 return socket.emit('creation_error', 'Şifrə emal edilərkən xəta.');
             }
        }
        const validatedBoardSize = Math.max(3, Math.min(6, parseInt(data.boardSize, 10) || 3));
        console.log(`${CREATE_LOG} Validasiya OK. Name: ${roomName}, Pass: ${hashedRoomPassword ? 'Var' : 'Yox'}, Size: ${validatedBoardSize}`);

        const socketRoomKey = getSocketRoomKey(socket.id);
        try {
            // >> F1-L3: Redis-dən socket üçün otaq yoxlanılır
            console.log(`[SERVER-DEBUG F1-L3] Redis-dən socket ${socket.id} üçün mövcud otaq yoxlanılır... Key: ${socketRoomKey}`);
            // -----
            const currentRoomId = await pubClient.get(socketRoomKey);
            if (currentRoomId) {
                console.warn(`${CREATE_LOG} İstifadəçi ${userInfo.username} artıq ${currentRoomId} otağındadır.`);
                return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız.');
            }
        } catch (redisErr) {
             console.error(`${CREATE_LOG} Redis get(socketRoomKey) xətası:`, redisErr);
             return socket.emit('creation_error', 'Server xətası (Redis).');
        }

        const newRoomId       = generateRoomId();
        const roomKey         = getRoomKey(newRoomId);
        console.log(`${CREATE_LOG} Yeni Room ID: ${newRoomId}, Room Key: ${roomKey}`);

        const initialGameState = initializeGameState(validatedBoardSize, {
            userId: userInfo.userId,
            username: userInfo.username
        });
        console.log(`${CREATE_LOG} İlkin gameState yaradıldı:`, JSON.stringify(initialGameState));

        try {
            // >> F1-L4: Redis multi əməliyyatı başlayır
            console.log(`[SERVER-DEBUG F1-L4] Redis multi əməliyyatı başlayır... Key: ${roomKey}`);
            // -----
            const multi = pubClient.multi();
            // >> F1-L4.1: Multi əmrləri əlavə edilir <<<
            console.log(`[SERVER-DEBUG F1-L4.1] Redis multi əmrləri əlavə edilir... Key: ${roomKey}`);
            // -----
            multi.hSet(roomKey, { // Use object syntax for hSet
                id: newRoomId,
                name: roomName,
                boardSize: validatedBoardSize.toString(),
                creatorUsername: userInfo.username,
                creatorUserId: userInfo.userId.toString(),
                gameState: JSON.stringify(initialGameState)
            });
            if (hashedRoomPassword !== null) multi.hSet(roomKey, 'password', hashedRoomPassword);
            else multi.hDel(roomKey, 'password');
            multi.sAdd('activeRooms', roomKey);
            multi.persist(roomKey);

            // >> F1-L4.2: multi.exec() çağırılır <<<
            console.log(`[SERVER-DEBUG F1-L4.2] multi.exec() çağırılır...`);
            // -----
            const execResult = await multi.exec();
            // >> F1-L5: multi.exec() bitdi <<<
            console.log(`[SERVER-DEBUG F1-L5] multi.exec() bitdi. Nəticə:`, execResult);
            // -----
            console.log(`${CREATE_LOG} Otaq Redis-də yaradıldı: ${newRoomId}`);

            // >> F1-L5.1: socket.join() çağırılır <<<
            console.log(`[SERVER-DEBUG F1-L5.1] socket.join(${roomKey}) çağırılır... Socket: ${socket.id}`);
            // -----
            await socket.join(roomKey);
            // >> F1-L5.2: socket.join() bitdi <<<
            console.log(`[SERVER-DEBUG F1-L5.2] socket.join(${roomKey}) bitdi.`);
            // -----

            // >> F1-L5.3: pubClient.set() çağırılır <<<
            console.log(`[SERVER-DEBUG F1-L5.3] pubClient.set(${socketRoomKey}, ${newRoomId}) çağırılır...`);
            // -----
            await pubClient.set(socketRoomKey, newRoomId);
            // >> F1-L5.4: pubClient.set() bitdi <<<
            console.log(`[SERVER-DEBUG F1-L5.4] pubClient.set() bitdi.`);
            // -----
            console.log(`${CREATE_LOG} Yaradan (${socket.id}) ${roomKey} Socket.IO otağına qoşuldu və map edildi.`);

            // >> F1-L6: 'room_joined' göndərilir <<<
            console.log(`[SERVER-DEBUG F1-L6] 'room_joined' hadisəsi ${socket.id} socketinə göndərilir.`);
            // -----
            socket.emit('room_joined', {
                roomId:  newRoomId,
                roomName: roomName,
                boardSize: validatedBoardSize
            });

            // >> F1-L7: Otaq siyahısı yayımlanır <<<
            console.log(`[SERVER-DEBUG F1-L7] Otaq siyahısı yayımlanır (handleCreateRoom).`);
            // -----
            await broadcastRoomListRedis(io);
            const handlerEnd = Date.now();
            console.log(`${CREATE_LOG} --- handleCreateRoom TAMAMLANDI UĞURLA --- (Duration: ${handlerEnd - handlerStart}ms)`);

        } catch (err) {
             // >> F1-L8: XƏTA TUTULDU <<<
             console.error(`[SERVER-DEBUG F1-L8] handleCreateRoom CATCH XƏTASI:`, err);
             // -----
             const handlerEnd = Date.now();
            console.error(`${CREATE_LOG} XƏTA Redis multi.exec() və ya emit/join zamanı:`, err);
            socket.emit('creation_error', 'Otaq yaradılarkən server xətası.');
            try {
                await pubClient.del([roomKey, socketRoomKey]);
                await pubClient.sRem('activeRooms', roomKey);
                console.log(`${CREATE_LOG} Xəta baş verdiyi üçün yaradılan otaq məlumatları təmizləndi: ${newRoomId}`);
            } catch (cleanupErr) {
                console.error(`${CREATE_LOG} Təmizləmə zamanı əlavə xəta:`, cleanupErr);
            }
            await broadcastRoomListRedis(io);
            console.log(`${CREATE_LOG} --- handleCreateRoom TAMAMLANDI (XƏTA ilə) --- (Duration: ${handlerEnd - handlerStart}ms)`);
        }
    }, // handleCreateRoom sonu

    // --- handleJoinRoom funksiyası olduğu kimi qalır ---
    // (Əgər handleJoinRoom üçün də loglar lazım olsa, ayrıca bildirin)
    handleJoinRoom: async function (socket, io, data, userInfo) {
        /* ... Sizin handleJoinRoom kodunuz ... */
        const handlerStart = Date.now();
        console.log(`\n${JOIN_LOG} --- handleJoinRoom v9 BAŞLADI --- User=${userInfo?.username}(${userInfo?.userId}), Socket=${socket?.id}, Time=${handlerStart}`);
        console.log(`${JOIN_LOG} Alınan Data:`, JSON.stringify(data));

        if (!userInfo || !userInfo.userId || !userInfo.username) { console.error(`${JOIN_LOG} XƏTA: userInfo tapılmadı!`); return;}
        if (!data || !data.roomId) { console.log(`${JOIN_LOG} Validation Failed: Missing roomId.`); return socket.emit('join_error', 'Otaq ID göndərilmədi.'); }

        const roomId         = data.roomId;
        const roomKey        = getRoomKey(roomId);
        const socketRoomKey  = getSocketRoomKey(socket.id);

        try {
            const roomExists = await pubClient.exists(roomKey);
            if (!roomExists) { console.warn(`${JOIN_LOG} Otaq ${roomId} (${roomKey}) tapılmadı.`); await broadcastRoomListRedis(io); return socket.emit('join_error', 'Otaq tapılmadı.'); }

            const roomData = await getRoomDataFromRedis(roomId);
            if (!roomData || !roomData.gameState) { console.error(`${JOIN_LOG} Otaq ${roomId} üçün data və ya gameState Redis-dən alına bilmədi.`); await broadcastRoomListRedis(io); return socket.emit('join_error', 'Otaq vəziyyəti alına bilmədi.'); }
            const state = roomData.gameState;
            console.log(`${JOIN_LOG} Mövcud gameState alındı. Phase: ${state.gamePhase}. P1: ${state.player1?.username}(${state.player1?.userId}, Disconnected=${state.player1?.isDisconnected}), P2: ${state.player2?.username}(${state.player2?.userId}, Disconnected=${state.player2?.isDisconnected})`);

            const roomPasswordHash = roomData.password;
            if (roomPasswordHash) {
                 if (!data.password) { console.log(`${JOIN_LOG} Password required but not provided.`); return socket.emit('join_error', 'Bu otaq üçün şifrə tələb olunur.'); }
                 const passwordMatch = await bcrypt.compare(data.password, roomPasswordHash);
                 if (!passwordMatch) { console.log(`${JOIN_LOG} Incorrect password for room ${roomId}.`); return socket.emit('join_error', 'Şifrə yanlışdır.');}
                 console.log(`${JOIN_LOG} Password check passed.`);
            }
            // === BURAYA ƏLAVƏ EDİN ===
            // 1) Socket → room map’ini Redis’e yaz
            await pubClient.set(
              getSocketRoomKey(socket.id),   // örn: "socket:XYZ123:room"
              roomId                          // örn: "6D8E3AD9"
            );
            console.log(`${JOIN_LOG} Mapping saved: socket ${socket.id} → room ${roomId}`);
        
            // 2) Socket.IO odasına katıl
            socket.join(getRoomKey(roomId)); // örn: socket.join("room:6D8E3AD9")
            console.log(`${JOIN_LOG} socket.join(${getRoomKey(roomId)}) called`);
        
            // 3) Yenilenmiş oda bilgisini ve gameState’i çek
            const fullRoomData = await getRoomDataFromRedis(roomId);
            const gameState    = fullRoomData.gameState;
        
            // 4) Sadece bu socket’e 'room_joined' eventi yolla
            socket.emit('room_joined', {
              roomId:    roomId,
              roomName:  fullRoomData.name,
              boardSize: parseInt(fullRoomData.boardSize, 10),
              gameState: gameState
            });
            console.log(`${JOIN_LOG} 'room_joined' emitted to ${socket.id}`);
        
            // 5) Lobiciyi güncelle
            await broadcastRoomListRedis(io);
            console.log(`${JOIN_LOG} broadcastRoomListRedis tamamlandı`);
            // === ƏLAVƏ SONU ===
            const currentRoom = await pubClient.get(socketRoomKey);
            if (currentRoom && currentRoom !== roomId) { console.warn(`${JOIN_LOG} İstifadəçi ${userInfo.username} artıq ${currentRoom} otağındadır.`); return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.');}

            // === DÜZƏLİŞLİ SLOT TAPMA MƏNTİQİ (v9) ===
            let playerToUpdate = null;
            let isRejoining = false;
            let assignedSlotNum = null;

            const p1 = state.player1;
            const p2 = state.player2;
            const joiningUserId = userInfo.userId;

            // 1. Təkrar qoşulma halını yoxla
            if (p1?.userId === joiningUserId) {
                playerToUpdate = p1; isRejoining = true; assignedSlotNum = 1;
                console.log(`${JOIN_LOG} İstifadəçi ${userInfo.username} P1 olaraq təkrar qoşulur.`);
            } else if (p2?.userId === joiningUserId) {
                playerToUpdate = p2; isRejoining = true; assignedSlotNum = 2;
                console.log(`${JOIN_LOG} İstifadəçi ${userInfo.username} P2 olaraq təkrar qoşulur.`);
            }
            // 2. Yeni qoşulma üçün slot axtar (ÖNCƏ BOŞ SLOTLARA BAX)
            else {
                // P1 boşdurmu? (Yəni heç userId yoxdur)
                if (!p1?.userId) {
                    if (!p1) state.player1 = {}; // Obyekti yarat (ehtiyat üçün)
                    playerToUpdate = state.player1; assignedSlotNum = 1;
                    console.log(`${JOIN_LOG} İstifadəçi ${userInfo.username} BOŞ P1 slotuna yerləşdirilir.`);
                }
                // P2 boşdurmu? (P1 dolu olsa belə P2 boş ola bilər)
                else if (!p2?.userId) {
                    if (!p2) state.player2 = {}; // Obyekti yarat (ehtiyat üçün)
                    playerToUpdate = state.player2; assignedSlotNum = 2;
                    console.log(`${JOIN_LOG} İstifadəçi ${userInfo.username} BOŞ P2 slotuna yerləşdirilir.`);
                }
                // Hər iki slotda user var, indi disconnected olanları yoxlayaq
                // P2 disconnected-dırsa (Buna üstünlük veririk, çünki P1 adətən yaradandır)
                else if (p2.isDisconnected) {
                    playerToUpdate = p2; assignedSlotNum = 2;
                    console.log(`${JOIN_LOG} İstifadəçi ${userInfo.username} DISCONNECTED P2 slotuna yerləşdirilir.`);
                }
                // P1 disconnected-dırsa (Yalnız P2 dolu və bağlıdırsa bura gəlir)
                else if (p1.isDisconnected && p2.userId && !p2.isDisconnected) { // Əmin olmaq üçün P2-nin bağlı olduğunu yoxla
                    playerToUpdate = p1; assignedSlotNum = 1;
                    console.log(`${JOIN_LOG} İstifadəçi ${userInfo.username} DISCONNECTED P1 slotuna yerləşdirilir (P2 aktiv).`);
                }
                 // P1 disconnected-dırsa VƏ P2 də disconnected-dırsa (P1-i yenidən istifadə et)
                 else if (p1.isDisconnected && p2.isDisconnected) {
                    playerToUpdate = p1; assignedSlotNum = 1;
                    console.log(`${JOIN_LOG} İstifadəçi ${userInfo.username} DISCONNECTED P1 slotuna yerləşdirilir (P2 də disconnected).`);
                 }
                // Bütün digər hallar (Hər iki slot dolu və bağlıdırsa)
                else {
                    console.warn(`${JOIN_LOG} Otaq ${roomId} doludur (Hər iki slotda aktiv istifadəçi var). Qoşulma mümkün deyil.`);
                    return socket.emit('join_error', 'Otaq doludur.');
                }
            }
            // === SLOT TAPMA MƏNTİQİ SONU ===


            if (!playerToUpdate) { console.error(`${JOIN_LOG} Kritik xəta: playerToUpdate təyin edilə bilmədi.`); return socket.emit('join_error', 'Oyun vəziyyətində uyğunsuzluq.'); }

            const wasPreviouslyDifferentUser = playerToUpdate.userId !== null && playerToUpdate.userId !== userInfo.userId;
            const wasPreviouslyEmpty = playerToUpdate.userId === null;
            console.log(`${JOIN_LOG} Player slot update: WasDifferentUser=${wasPreviouslyDifferentUser}, WasEmpty=${wasPreviouslyEmpty}, IsRejoining=${isRejoining}`);

            // Oyunçu məlumatlarını yenilə
            playerToUpdate.userId         = userInfo.userId;
            playerToUpdate.username       = userInfo.username;
            playerToUpdate.socketId       = null; // Ready ilə təyin olunacaq
            playerToUpdate.isDisconnected = true; // Ready ilə false olacaq
            playerToUpdate.disconnectTime = null;
            playerToUpdate.slot           = assignedSlotNum;
            let needsSave = true;

            // Yalnız tamamilə yeni oyunçu slotu tutursa (əvvəl başqası idi və ya boş idi) resetlə
            if (wasPreviouslyDifferentUser || wasPreviouslyEmpty) {
                console.log(`${JOIN_LOG} Slot yeni oyunçu (${userInfo.username}) üçün tam resetlənir.`);
                playerToUpdate.symbol = null;
                playerToUpdate.roll   = null;
            } else if (isRejoining) {
                 console.log(`${JOIN_LOG} Oyunçu təkrar qoşulur, mövcud simvol (${playerToUpdate.symbol}) və zər (${playerToUpdate.roll}) saxlanılır.`);
            }

            console.log(`${JOIN_LOG} Player state (AFTER update) [Slot ${assignedSlotNum}]:`, JSON.stringify(playerToUpdate));
            const otherPlayer = assignedSlotNum === 1 ? state.player2 : state.player1;
            console.log(`${JOIN_LOG} Opponent state (Unaffected by join) [Slot ${otherPlayer?.slot}]:`, JSON.stringify(otherPlayer));


            if (needsSave) {
                 console.log(`${JOIN_LOG} Saving updated state for player join/rejoin. Room: ${roomId}`);
                 await saveGameStateToRedis(roomId, state);
                 console.log(`${JOIN_LOG} State saved.`);
            }
            /*
// === BURAYA ƏLAVƏ ET ===
  // 1) Redis-ə socket→room mapping yaz
   await pubClient.set(
     getSocketRoomKey(socket.id),  // misal: "socket:XYZ123:room"
     roomId                         // misal: "6D8E3AD9"
   );
  console.log(`${JOIN_LOG} Mapping saved: socket ${socket.id} → room ${roomId}`);

   // 2) Socket.IO otağına qoş
   socket.join(
     getRoomKey(roomId)             // misal: "room:6D8E3AD9"
   );
   console.log(`${JOIN_LOG} socket.join(${getRoomKey(roomId)}) called`);

  // 3) Yenilənmiş otaq datası və gameState-i Redis-dən götür
   const fullRoomData = await getRoomDataFromRedis(roomId);
   const gameState    = fullRoomData.gameState;

   // 4) Yalnız yeni qoşulan socket-ə 'room_joined' göndər
   socket.emit('room_joined', {
     roomId:    roomId,
     roomName:  fullRoomData.name,
     boardSize: parseInt(fullRoomData.boardSize, 10),
     gameState: gameState
   });
   console.log(`${JOIN_LOG} 'room_joined' emitted to ${socket.id}`);

   // 5) Lobbini yenilə
   await broadcastRoomListRedis(io);
   console.log(`${JOIN_LOG} broadcastRoomListRedis tamamlandı`);
   // === ƏLAVƏ SONU ===
   */
          //  await socket.join(roomKey);
          //  await pubClient.set(socketRoomKey, roomId);
          //  console.log(`${JOIN_LOG} Player ${userInfo.username} (${socket.id}) joined Socket.IO room ${roomKey} and mapped.`);

           // socket.emit('room_joined', {
          //       roomId:   roomData.id,
          //       roomName: roomData.name,
         //      boardSize: parseInt(roomData.boardSize || '3', 10)
          //  });

            // Qoşulan oyunçuya dərhal state göndərmirik, bunu handlePlayerReady edəcək
            // console.log(`${JOIN_LOG} Sending initial gameState to joining player ${socket.id}. Phase: ${state.gamePhase}`);
            // socket.emit('game_state_update', state);

            // Otaqdakı digər oyunçuya qoşulma barədə məlumat vermək üçün state göndərək
            const opponentSocketId = otherPlayer?.socketId;
            if(opponentSocketId && !otherPlayer.isDisconnected){
                console.log(`${JOIN_LOG} Sending updated gameState to opponent (${otherPlayer.username}) ${opponentSocketId}. Phase: ${state.gamePhase}`);
                io.to(opponentSocketId).emit('game_state_update', state);
            } else {
                 console.log(`${JOIN_LOG} Opponent (${otherPlayer?.username}) not connected. No state update sent to them.`);
            }

            await broadcastRoomListRedis(io); // Lobbini yenilə
            const handlerEnd = Date.now();
            console.log(`${JOIN_LOG} --- handleJoinRoom v9 TAMAMLANDI UĞURLA --- (Duration: ${handlerEnd - handlerStart}ms)`);

        } catch (err) {
            const handlerEnd = Date.now();
            console.error(`${JOIN_LOG} XƏTA (catch bloku):`, err);
            socket.emit('join_error', 'Otağa qoşularkən server xətası.');
            console.log(`${JOIN_LOG} --- handleJoinRoom v9 TAMAMLANDI (XƏTA ilə) --- (Duration: ${handlerEnd - handlerStart}ms)`);
        }
    }, // handleJoinRoom sonu

    // --- handlePlayerReady funksiyası (əvvəlki əlavə edilmiş loglar ilə birlikdə) ---
    handlePlayerReady: async function (socket, io, data, userInfo) {
        // >> F3-L1: Funksiya Başladı (Əvvəlki cavabdakı kimi eyni loglar)
        const handlerStart = Date.now();
        const userId   = userInfo?.userId;
        const username = userInfo?.username;
        let roomId     = data?.roomId;
        const currentSocketId = socket.id;
        console.log(`\n\n>>>>> [SERVER-DEBUG F3-L1] handlePlayerReady BAŞLADI <<<<<`);
        console.log(`      User: ${username}(${userId}), Socket: ${currentSocketId}`);
        console.log(`      DataRoomID (from client): ${data?.roomId}, Time: ${handlerStart}`);
        // -----

        if (!userId || !username) { console.error(`${READY_LOG} XƏTA: İstifadəçi məlumatı yoxdur.`); return socket.emit('game_error', { message: 'Autentifikasiya xətası.' }); }
        if (!roomId) {
            roomId = await pubClient.get(getSocketRoomKey(socket.id));
             // >> F3-L2: roomId Redis-dən alındı (Əvvəlki cavabdakı kimi eyni log)
            console.log(`[SERVER-DEBUG F3-L2] Client roomId göndərmədi. Redis-dən alınan roomId: ${roomId}`);
             // -----
            if (!roomId) { console.error(`${READY_LOG} XƏTA: Client roomId göndərmədi və Socket ${currentSocketId} üçün otaq ID Redis-dən tapılmadı.`); return socket.emit('force_redirect_lobby', { message: 'Otaq məlumatı tapılmadı. Lobbiyə yönləndirilirsiniz...' }); }
            console.warn(`${READY_LOG} Client roomId göndərmədi. Otaq ID Redis-dən tapıldı: ${roomId}`);
        }

        const roomKey        = getRoomKey(roomId);
        const socketRoomKey  = getSocketRoomKey(currentSocketId);
        let roomData, state, needsSave = false;

        try {
            // >> F3-L3: Redis-dən otaq datası alınır (Əvvəlki cavabdakı kimi eyni log)
            console.log(`[SERVER-DEBUG F3-L3] Redis-dən otaq datası alınır... Key: ${roomKey}`);
            // -----
            roomData = await getRoomDataFromRedis(roomId);
            if (!roomData || !roomData.gameState) { console.warn(`${READY_LOG} Otaq ${roomId} və ya gameState Redis-də tapılmadı (bəlkə silinib?). Socket: ${currentSocketId}`); await pubClient.del(socketRoomKey).catch(e => {}); await pubClient.sRem('activeRooms', roomKey).catch(e => {}); await broadcastRoomListRedis(io); return socket.emit('force_redirect_lobby', { message: 'Oyun otağı artıq mövcud deyil.' }); }
            state = roomData.gameState;
            // >> F3-L4: gameState alındı (Əvvəlki cavabdakı kimi eyni log)
            console.log(`[SERVER-DEBUG F3-L4] gameState alındı. Phase: ${state.gamePhase}`);
            console.log(`      Pre-update P1: userId=${state.player1?.userId}, socketId=${state.player1?.socketId}, disconnected=${state.player1?.isDisconnected}`);
            console.log(`      Pre-update P2: userId=${state.player2?.userId}, socketId=${state.player2?.socketId}, disconnected=${state.player2?.isDisconnected}`);
            // -----

            const { playerState, opponentState } = findPlayerStatesByUserId(state, userId);
            if (!playerState) { console.error(`${READY_LOG} XƏTA: İstifadəçi (${username}) otaq ${roomId} state-ində tapılmadı! Socket ${currentSocketId}`); await pubClient.del(socketRoomKey).catch(e => {}); return socket.emit('force_redirect_lobby', { message: 'Oyunçu otaq vəziyyətində tapılmadı.' }); }
            // >> F3-L5: Oyunçu state-i tapıldı (Əvvəlki cavabdakı kimi eyni log)
            console.log(`[SERVER-DEBUG F3-L5] Oyunçu state-i tapıldı: User=${username}. Mövcud SocketId=${playerState.socketId}, Mövcud Disconnected=${playerState.isDisconnected}`);
            // -----

            const needsMapping = !socket.rooms.has(roomKey) || await pubClient.get(socketRoomKey) !== roomId;
            // >> F3-L6: Mapping yoxlaması (Əvvəlki cavabdakı kimi eyni log)
            console.log(`[SERVER-DEBUG F3-L6] Socket mapping yoxlanılır: needsMapping=${needsMapping} (socket.rooms.has=${socket.rooms.has(roomKey)}, redisMap=${await pubClient.get(socketRoomKey)})`);
            // -----
            if (needsMapping) {
                console.warn(`${READY_LOG} Socket ${currentSocketId} map edilir/qoşulur room ${roomKey}.`);
                await socket.join(roomKey);
                await pubClient.set(socketRoomKey, roomId);
                // >> F3-L7: İlk state göndərilir (Əvvəlki cavabdakı kimi eyni log)
                console.log(`[SERVER-DEBUG F3-L7] İlk state map etdikdən sonra socket ${currentSocketId}-ə göndərilir.`);
                // -----
                socket.emit('game_state_update', state);
            }

            const playerJustActivated = playerState.isDisconnected || playerState.socketId !== currentSocketId;
            // >> F3-L8: Aktivləşmə yoxlaması (Əvvəlki cavabdakı kimi eyni log)
            console.log(`[SERVER-DEBUG F3-L8] Oyunçu aktivləşməsi yoxlanılır: playerJustActivated=${playerJustActivated}`);
            // -----
            if (playerJustActivated) {
                console.log(`${READY_LOG} Oyunçu ${username} (${userId}) aktivləşdirilir. Yeni Socket ID: ${currentSocketId}`);
                const timerKey = getRoomDisconnectTimerKey(roomId, userId);
                 // >> F3-L9: Timer silinir (Əvvəlki cavabdakı kimi eyni log)
                console.log(`[SERVER-DEBUG F3-L9] Disconnect timer silinir: ${timerKey}`);
                 // -----
                const deletedTimer = await pubClient.del(timerKey);
                console.log(`${READY_LOG} Disconnect timer (${timerKey}) silindi: ${deletedTimer > 0 ? 'Bəli' : 'Yox (və ya yox idi)'}`);

                 // >> F3-L10: playerState yenilənir (Əvvəlki cavabdakı kimi eyni log)
                console.log(`[SERVER-DEBUG F3-L10] playerState yenilənir: isDisconnected=false, socketId=${currentSocketId}`);
                 // -----
                playerState.isDisconnected = false;
                playerState.socketId = currentSocketId;
                playerState.disconnectTime = null;
                needsSave = true;
                console.log(`${READY_LOG} Player state updated to active.`);

                 // >> F3-L11: Yenilənmiş state bu sockete göndərilir (Əvvəlki cavabdakı kimi eyni log)
                console.log(`[SERVER-DEBUG F3-L11] Aktivləşdirilmiş state socket ${currentSocketId}-ə göndərilir.`);
                 // -----
                socket.emit('game_state_update', state);

            } else {
                console.log(`${READY_LOG} Oyunçu ${username} (${currentSocketId}) artıq aktiv idi.`);
                if (!needsMapping) {
                     // >> F3-L12: Artıq aktiv sockete təkrar state göndərilir (Əvvəlki cavabdakı kimi eyni log)
                    console.log(`[SERVER-DEBUG F3-L12] State artıq aktiv olan socket ${currentSocketId}-ə təkrar göndərilir.`);
                     // -----
                    socket.emit('game_state_update', state);
                }
            }

            // --- MƏRHƏLƏ KEÇİD MƏNTİQİ ---
            const updatedPlayerState = playerState;
            const currentOpponentState = opponentState;
            const bothPlayersPresentAndActive = updatedPlayerState && !updatedPlayerState.isDisconnected && updatedPlayerState.socketId &&
                                                currentOpponentState && !currentOpponentState.isDisconnected && currentOpponentState.socketId;

             // >> F3-L13: Mərhələ keçidi yoxlanılır (Əvvəlki cavabdakı kimi eyni log)
            console.log(`[SERVER-DEBUG F3-L13] Mərhələ keçidi yoxlanılır: BothActive=${bothPlayersPresentAndActive}, CurrentPhase=${state.gamePhase}`);
             // -----

            if (bothPlayersPresentAndActive && state.gamePhase === 'waiting') {
                console.log(`${READY_LOG} **** ŞƏRT ÖDƏNDİ: Hər iki oyunçu aktiv və mərhələ 'waiting'. 'dice_roll'-a keçilir! ****`);
                state.gamePhase = 'dice_roll'; state.statusMessage = "Oyunçular hazır, zər atma başlayır...";
                if(state.player1) state.player1.roll = null;
                if(state.player2) state.player2.roll = null;
                state.diceWinnerSocketId = null; state.symbolPickerSocketId = null;
                needsSave = true;
                console.log(`${READY_LOG} dice_roll mərhələsinə keçid edildi. State save üçün işarələndi.`);
            } else if (bothPlayersPresentAndActive && state.gamePhase !== 'waiting') {
                 console.log(`${READY_LOG} Hər iki oyunçu aktivdir, amma mərhələ '${state.gamePhase}' olduğu üçün dəyişdirilmir.`);
            } else if (!bothPlayersPresentAndActive) {
                 console.log(`${READY_LOG} Hələ hər iki oyunçu aktiv deyil, mərhələ keçidi baş vermir.`);
                 if (state.gamePhase === 'waiting' && !updatedPlayerState.isDisconnected && (!currentOpponentState || currentOpponentState.isDisconnected)) {
                     state.statusMessage = `${updatedPlayerState.username} qoşuldu, rəqib gözlənilir...`;
                     needsSave = true;
                 }
            }
            // --- MƏRHƏLƏ KEÇİD MƏNTİQİ SONU ---

             // >> F3-L14: Save qərarı (Əvvəlki cavabdakı kimi eyni log)
            console.log(`[SERVER-DEBUG F3-L14] Save və Emit qərarı: needsSave=${needsSave}`);
            // -----

            if (needsSave) {
                console.log(`${READY_LOG} Vəziyyət dəyişiklikləri Redis-ə yazılır... Room: ${roomId}`);
                console.log(`${READY_LOG}   -> Saving State: Phase=${state.gamePhase}, P1_Active=${!state.player1?.isDisconnected}, P2_Active=${!state.player2?.isDisconnected}`);
                await saveGameStateToRedis(roomId, state);
                console.log(`${READY_LOG} State saved to Redis.`);

                // !!! TEST: Birbaşa sockete SADƏ MƏTN göndərək !!!
                //console.log(`[SERVER-DEBUG F3-TEST] Trying DIRECT EMIT with SIMPLE STRING to socket ${currentSocketId} (needsSave=true)`);
                //socket.emit('game_state_update', "SALAM_CLIENT_MESAJ_GELDI? (needsSave=true)"); // <<<--- SADƏ MƏTN GÖNDƏRİN
                console.log(`[SERVER-DEBUG F3-TEST] Direct emit call finished.`);
                // !!! TEST SONU !!!

                // Orijinal otağa emit etməni kommentə alaq:
                
                // >> F3-L15: Ümumi state update göndərilir
                console.log(`[SERVER-DEBUG F3-L15] Ümumi state update otağa (${roomKey}) göndərilir.`);
                // -----
                await emitGameStateUpdateRedis(roomId, 'player_ready_processed_saved', io);
                
            } else {
                console.log(`${READY_LOG} Vəziyyətdə yadda saxlanılmalı dəyişiklik yoxdur.`);

                // !!! TEST: Buraya da birbaşa SADƏ MƏTN göndərək (needsSave false olsa belə) !!!
                 console.log(`[SERVER-DEBUG F3-TEST] Trying DIRECT EMIT with SIMPLE STRING to already active socket ${currentSocketId} (needsSave=false)`);
                 socket.emit('game_state_update', "SALAM_CLIENT_MESAJ_GELDI? (needsSave=false)"); // <<<--- SADƏ MƏTN GÖNDƏRİN
                 console.log(`[SERVER-DEBUG F3-TEST] Direct emit call finished (already active).`);
                 // !!! TEST SONU !!!
            }

            // >> F3-L16: Lobby update edilir (Əvvəlki cavabdakı kimi eyni log)
            console.log(`[SERVER-DEBUG F3-L16] Lobbini yeniləmək üçün broadcastRoomListRedis çağırılır.`);
            // -----
            await broadcastRoomListRedis(io); // Lobby update qalsın
        } catch (err) { // <--- İndi { simvolu düzgün yerdədir
            // >> F3-L17: Funksiya xəta ilə bitdi
            console.log(`[SERVER-DEBUG F3-L17] handlePlayerReady CATCH XƏTASI TUTULDU`);
            // -----
            const handlerEnd = Date.now();
            console.error(`[SERVER-DEBUG F3-L18] handlePlayerReady CATCH XƏTASI:`, err); // Add actual catch logic logging
            console.error(`${READY_LOG} XƏTA (catch bloku) handlePlayerReady-də:`, err);
            socket.emit('game_error', { message: 'Oyun vəziyyəti emal edilərkən server xətası.' });
            // Maybe force redirect here too? Depends on the error.
            // socket.emit('force_redirect_lobby', { message: 'Kritik server xətası. Lobbiyə yönləndirilirsiniz...' });
            console.log(`${READY_LOG} --- handlePlayerReady TAMAMLANDI (XƏTA ilə) --- User=${username}, RoomID=${roomId} (Duration: ${handlerEnd - handlerStart}ms)`);
       } // handlePlayerReady sonu
    }
}; // module.exports sonu