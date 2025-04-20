// kingzone/utils/redisHelpers.js
const crypto = require('crypto');
// Redis klientini config-dən alırıq (indi pubClient istifadə edirik)
const { pubClient } = require('../server/config/redis.js'); // <--- pubClient istifadə edilir

console.log('[redisHelpers] Modul yüklənir (pubClient ilə)...');

// Otaq ID yaratmaq
function generateRoomId() {
    const newId = crypto.randomBytes(4).toString('hex').toUpperCase();
    console.log(`[generateRoomId] Yeni otaq ID yaradıldı: ${newId}`);
    return newId;
}

// --- Redis Açar Adları ---
function getUserInfoKey(socketId) { return `socket:${socketId}:userInfo`; }
function getSocketRoomKey(socketId) { return `socket:${socketId}:room`; }
function getRoomKey(roomId) { return `room:${roomId}`; }
function getRoomPlayersKey(roomId) { return `room:${roomId}:players`; } // Bu açarı istifadə edirsinizmi?
function getRoomDisconnectTimerKey(roomId, userId) { return `room:${roomId}:disconnectTimer:${userId}`; }
console.log('[redisHelpers] Açar generator funksiyaları təyin edildi.');


// --- İstifadəçini Otaqdan Silmək ---
// DİQQƏT: Bu funksiyanın məntiqi sizin oyunçuları və otaqları necə idarə etdiyinizə bağlıdır.
// Əgər oyunçular yalnız gameState içindədirsə, bəzi Redis əmrləri (sRem, sCard) artıq ola bilər.
async function removeUserFromRoom(userId, roomId) {
    console.log(`[removeUserFromRoom] İstifadəçi ${userId} otaq ${roomId} -dan silinir...`);
    try {
        if (!userId || !roomId) {
            console.error('[removeUserFromRoom] userId və roomId tələb olunur.');
            return false;
        }
        const roomMainKey = getRoomKey(roomId);
        const roomUsersSetKey = `${roomMainKey}:users`; // İstifadəçiləri ayrıca setdə saxlayırsınızsa
        const userMainKey = `user:${userId}`;         // İstifadəçi məlumatlarını ayrıca HASH-də saxlayırsınızsa

        // Otağın istifadəçilər setindən istifadəçini sil (əgər set istifadə edilirsə)
        const removeResult = await pubClient.sRem(roomUsersSetKey, userId); // pubClient istifadə edir
        console.log(`[removeUserFromRoom] Redis sRem ${roomUsersSetKey} -> ${userId}: ${removeResult}`);

        // İstifadəçinin cari otaq məlumatını təmizlə (əgər user:<id> HASH istifadə edilirsə)
        const userUpdateResult = await pubClient.hSet(userMainKey, 'currentRoom', ''); // pubClient istifadə edir
        console.log(`[removeUserFromRoom] Redis hSet ${userMainKey} field 'currentRoom' -> '': ${userUpdateResult}`);

        // Otaqdakı istifadəçi sayını yoxla (əgər set istifadə edilirsə)
        const userCount = await pubClient.sCard(roomUsersSetKey); // pubClient istifadə edir
        console.log(`[removeUserFromRoom] Otaqda qalan istifadəçi sayı (${roomUsersSetKey}): ${userCount}`);

        // Əgər otaq boş qalıbsa (setə görə), otaqla bağlı bütün məlumatları sil
        if (userCount === 0) {
            console.log(`[removeUserFromRoom] Otaq ${roomId} boşdur (setə əsasən), silinir...`);
            const keysToDelete = [ roomMainKey, roomUsersSetKey ];
            // Oyun və oyunçu açarlarını da əlavə etmək olar (əgər varsa)
            // keysToDelete.push(`${roomMainKey}:game`, getRoomPlayersKey(roomId));
            const delResult = await pubClient.del(keysToDelete); // pubClient istifadə edir
            console.log(`[removeUserFromRoom] Redis DEL otaq açarları (${keysToDelete.join(', ')}): ${delResult} açar silindi.`);
            const activeRoomRemoveResult = await pubClient.sRem('activeRooms', roomMainKey); // pubClient istifadə edir
            console.log(`[removeUserFromRoom] Redis sRem activeRooms -> ${roomMainKey}: ${activeRoomRemoveResult}`);
        }
        return true;
    } catch (error) {
        console.error(`❌ [removeUserFromRoom] İstifadəçi ${userId} otaq ${roomId} -dan silinərkən xəta:`, error);
        return false;
    }
}

// --- Otaq Məlumatlarını Almaq ---
async function getRoomDataFromRedis(roomId) {
    console.log(`[getRoomDataFromRedis] Otaq ${roomId} üçün məlumatlar alınır...`);
    try {
        if (!roomId) { console.warn('[getRoomDataFromRedis] roomId təqdim edilməyib.'); return null; }
        const roomKey = getRoomKey(roomId);
        const roomData = await pubClient.hGetAll(roomKey); // pubClient istifadə edir

        if (!roomData || Object.keys(roomData).length === 0) {
            console.warn(`[getRoomDataFromRedis] Otaq ${roomId} üçün Redis-də məlumat tapılmadı (${roomKey}).`);
            return null;
        }
        console.log(`[getRoomDataFromRedis] Redis hGetAll ${roomKey} nəticəsi alındı.`);

        if (roomData.gameState) {
            try { roomData.gameState = JSON.parse(roomData.gameState); console.log(`[getRoomDataFromRedis] gameState uğurla parse edildi.`); }
            catch (parseError) { console.error(`❌ [getRoomDataFromRedis] Otaq ${roomId} gameState parse xətası:`, parseError); roomData.gameState = null; }
        } else { console.log(`[getRoomDataFromRedis] Otaq ${roomId} üçün gameState mövcud deyil.`); roomData.gameState = null; }

        // Oyunçuları al (əgər getRoomPlayersKey istifadə edirsinizsə)
        const playersKey = getRoomPlayersKey(roomId);
        try { roomData.players = await pubClient.sMembers(playersKey); console.log(`[getRoomDataFromRedis] Redis sMembers ${playersKey} nəticəsi:`, roomData.players); } // pubClient istifadə edir
        catch (playerError) { console.warn(`[getRoomDataFromRedis] Otaq ${roomId} oyunçuları (${playersKey}) alınarkən xəta:`, playerError); roomData.players = []; }

        console.log(`✅ [getRoomDataFromRedis] Otaq ${roomId} üçün məlumatlar uğurla formatlandı.`);
        return roomData;
    } catch (error) {
        console.error(`❌ [getRoomDataFromRedis] Otaq ${roomId} məlumatları alınarkən ümumi xəta:`, error);
        return null;
    }
}


// --- Oyun Vəziyyətini Saxlamaq ---
async function saveGameStateToRedis(roomId, gameState) {
    console.log(`[saveGameStateToRedis] Otaq ${roomId} üçün oyun vəziyyəti saxlanılır...`);
    try {
        if (!gameState || typeof gameState !== 'object') { console.warn('[saveGameStateToRedis] Düzgün gameState obyekti təqdim edilməyib.'); return false; }
        if (!roomId) { console.warn('[saveGameStateToRedis] roomId təqdim edilməyib.'); return false; }
        const roomKey = getRoomKey(roomId);
        const gameStateJson = JSON.stringify(gameState);
        const result = await pubClient.hSet(roomKey, 'gameState', gameStateJson); // pubClient istifadə edir
        console.log(`✅ [saveGameStateToRedis] Redis hSet ${roomKey} field 'gameState': ${result}`);
        return true;
    } catch (error) { console.error(`❌ [saveGameStateToRedis] Otaq ${roomId} gameState saxlanılarkən xəta:`, error); return false; }
}


// --- Otaq Siyahısı Məlumatlarını Hazırlamaq ---
async function fetchRoomListData() {
    console.log('[fetchRoomListData] Aktiv otaq siyahısı datası hazırlanır...');
    const roomListForClients = [];
    const roomsToRemoveFromActiveSet = [];
    try {
        const activeRoomKeys = await pubClient.sMembers('activeRooms'); // pubClient istifadə edir
        console.log(`[fetchRoomListData] activeRooms setindən tapılan açarlar: ${activeRoomKeys.join(', ')}`);
        for (const roomKey of activeRoomKeys) {
            try {
                const roomId = roomKey.substring(5);
                const exists = await pubClient.exists(roomKey); // pubClient istifadə edir
                if (exists) {
                    const basicData = await pubClient.hmGet(roomKey, ['id', 'name', 'password', 'boardSize', 'creatorUsername', 'gameState']); // pubClient istifadə edir
                    const roomData = { id: basicData[0] || roomId, name: basicData[1] || `Otaq ${roomId.substring(0, 4)}`, hasPassword: !!basicData[2], boardSize: parseInt(basicData[3] || '3', 10), creatorUsername: basicData[4] || 'Bilinməyən', gameStateJson: basicData[5] };
                    let activePlayerCount = 0; let p1Username = null; let p2Username = null;
                    if (roomData.gameStateJson) {
                        try {
                            const gameState = JSON.parse(roomData.gameStateJson); const p1 = gameState?.player1; const p2 = gameState?.player2;
                            if (p1?.socketId && !p1.isDisconnected) { activePlayerCount++; p1Username = p1.username; }
                            if (p2?.socketId && !p2.isDisconnected) { activePlayerCount++; p2Username = p2.username; }
                        } catch (e) { console.error(`❌ [fetchRoomListData] Otaq ${roomId} gameState parse xətası (${roomKey}):`, e); }
                    }
                    roomListForClients.push({ id: roomData.id, name: roomData.name, hasPassword: roomData.hasPassword, boardSize: roomData.boardSize, creatorUsername: roomData.creatorUsername, playerCount: activePlayerCount, player1Username: p1Username, player2Username: p2Username, isAiRoom: false });
                } else { console.warn(`[fetchRoomListData] Otaq ${roomKey} Redis-də mövcud deyil. activeRooms-dan silinməlidir.`); roomsToRemoveFromActiveSet.push(roomKey); }
            } catch (innerError) { console.error(`❌ [fetchRoomListData] Otaq ${roomKey} işlənərkən xəta:`, innerError); }
        } // End for loop
        if (roomsToRemoveFromActiveSet.length > 0) {
            try { const remResult = await pubClient.sRem('activeRooms', roomsToRemoveFromActiveSet); console.log(`[fetchRoomListData] activeRooms setindən ${remResult} köhnəlmiş otaq silindi:`, roomsToRemoveFromActiveSet); } // pubClient istifadə edir
            catch (remError) { console.error(`❌ [fetchRoomListData] Köhnəlmiş otaqlar activeRooms-dan silinərkən xəta:`, remError); }
        }
        console.log(`✅ [fetchRoomListData] ${roomListForClients.length} otaq məlumatı hazırlandı.`);
        return roomListForClients;
    } catch (error) { console.error('❌ [fetchRoomListData] Aktiv otaq siyahısı hazırlanarkən ümumi xəta:', error); return []; }
}

// --- Otaq Siyahısını Yayımlamaq ---
async function broadcastRoomListRedis(io) {
    console.log('[broadcastRoomListRedis] Otaq siyahısı yayımlanır...');
    if (!io) { console.error("❌ [broadcastRoomListRedis] `io` obyekti bu funksiyaya ötürülməyib!"); return; }
    try {
        const roomList = await fetchRoomListData(); // Bu artıq pubClient istifadə edir
        io.emit('roomList', roomList);
        console.log(`✅ [broadcastRoomListRedis] ${roomList.length} otaqdan ibarət siyahı 'roomList' hadisəsi ilə yayımlandı.`);
    } catch (error) { console.error('❌ [broadcastRoomListRedis] Otaq siyahısı yayımlanarkən xəta:', error); }
}


// --- Oyun Vəziyyətini Yayımlamaq ---
// utils/redisHelpers.js faylında
async function emitGameStateUpdateRedis(roomId, triggeringEvent = 'N/A', io) {
    // >> EMIT DEBUG: Başlanğıc <<<
    console.log(`\n>> [SERVER-DEBUG emitGameStateUpdateRedis] Başladı. Room: ${roomId}, Trigger: ${triggeringEvent}`);
    // ----
    if (!io) { console.error(`❌ [emitGameStateUpdateRedis] io obyekti ötürülməyib! (Otaq: ${roomId})`); return; }
    if (!roomId) { console.error(`❌ [emitGameStateUpdateRedis] roomId ötürülməyib!`); return; }
    try {
        const roomData = await getRoomDataFromRedis(roomId); // Bu artıq pubClient istifadə edir
        if (roomData?.gameState) {
            const roomKey = getRoomKey(roomId);

            // >>>>>>> YENİ ƏLAVƏ: Otaqdakı socketləri yoxla <<<<<<<<<<
            try {
                const socketsInRoom = await io.in(roomKey).fetchSockets();
                console.log(`   -> [SERVER-DEBUG emitGameStateUpdateRedis] Otaqdakı (${roomKey}) socketlər:`, socketsInRoom.map(s => s.id));
            } catch (fetchErr) {
                console.error(`   -> [SERVER-DEBUG emitGameStateUpdateRedis] Otaqdakı socketləri almaq alınmadı:`, fetchErr);
            }
            // >>>>>>> YENİ ƏLAVƏ SONU <<<<<<<<<<

             // >> EMIT DEBUG: Göndərmə <<<
             console.log(`   -> io.to(${roomKey}).emit('game_state_update', ...) çağırılır.`);
             // ----
            io.to(roomKey).emit('game_state_update', roomData.gameState);
            console.log(`✅ [emitGameStateUpdateRedis] Otaq <span class="math-inline">\{roomId\} \(</span>{roomKey}) üçün gameState uğurla 'game_state_update' hadisəsi ilə yayımlandı.`);
        } else { console.warn(`[emitGameStateUpdateRedis] Otaq ${roomId} üçün gameState tapılmadı/null. Yayımlanmadı.`); }
    } catch (error) {
        // >> EMIT DEBUG: XƏTA <<<
        console.error(`❌ [SERVER-DEBUG emitGameStateUpdateRedis] XƏTA (catch bloku) - Room: ${roomId}, Trigger: ${triggeringEvent}:`, error);
        // ----
        console.error(`❌ [emitGameStateUpdateRedis] gameState yayımlanarkən xəta (Otaq: ${roomId}, Səbəb: ${triggeringEvent}):`, error); }
     // >> EMIT DEBUG: Son <<<
     console.log(`>> [SERVER-DEBUG emitGameStateUpdateRedis] Bitdi. Room: ${roomId}`);
     // ----
}

// --- Exportlar ---
module.exports = {
    generateRoomId,
    getUserInfoKey,
    getSocketRoomKey,
    getRoomKey,
    getRoomPlayersKey,
    getRoomDisconnectTimerKey,
    removeUserFromRoom,
    getRoomDataFromRedis,
    saveGameStateToRedis,
    fetchRoomListData, // Datayı qaytarır
    broadcastRoomListRedis, // Datayı yayımlayır
    emitGameStateUpdateRedis // Oyun vəziyyətini yayımlayır
};

console.log('[redisHelpers] Modul yüklənməsi tamamlandı (pubClient ilə).');