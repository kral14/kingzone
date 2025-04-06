// server/server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
// Socket.IO-nu CORS problemlərinin qarşısını almaq üçün konfiqurasiya edirik
// Render kimi platformalarda bu lazım ola bilər
const io = socketIo(server, {
    cors: {
        origin: "*", // Daha təhlükəsiz variant üçün Render app URL-nizi yaza bilərsiniz
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000; // Render portu avtomatik təyin edəcək

// Statik faylları (HTML, CSS, Client JS) public qovluğundan təqdim etmək üçün
// __dirname server.js faylının olduğu qovluqdur (yəni /server qovluğu)
// Bizə isə /public qovluğu lazımdır, ona görə bir qovluq yuxarı çıxıb public-ə giririk
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath));

// ----- Oyun Məntiqi və Otaq İdarəetməsi (Sadələşdirilmiş) -----

let rooms = {}; // Otaqları yadda saxlamaq üçün obyekt (server restart olanda silinir)
let users = {}; // Qoşulmuş istifadəçiləri saxlamaq üçün

function generateRoomId() {
    return Math.random().toString(36).substring(2, 9); // Sadə unikal ID
}

// Otaq siyahısını bütün istifadəçilərə göndərən funksiya
function broadcastRoomList() {
    const roomListForClients = Object.values(rooms).map(room => ({
        id: room.id,
        name: room.name,
        playerCount: room.players.length,
        hasPassword: !!room.password, // Şifrə varsa true, yoxsa false
        boardSize: room.boardSize,
        creatorUsername: room.creatorUsername,
        player1Username: room.players[0] ? users[room.players[0]]?.username : null,
        player2Username: room.players[1] ? users[room.players[1]]?.username : null,
    }));
    // === DÜZƏLİŞ ===
    console.log('>>> Broadcasting room_list_update with:', JSON.stringify(roomListForClients)); // GÖNDƏRİLƏN DATA
    // =============
    io.emit('room_list_update', roomListForClients);
}


// ----- Socket.IO Hadisələri -----

io.on('connection', (socket) => {
    console.log(`Yeni istifadəçi qoşuldu: ${socket.id}`);
    users[socket.id] = { id: socket.id, username: 'Anonim', currentRoom: null };

    // İstifadəçi qoşulduqda otaq siyahısını ona göndər
    socket.emit('room_list_update', Object.values(rooms).map(room => ({
         id: room.id, name: room.name, playerCount: room.players.length, hasPassword: !!room.password,
         boardSize: room.boardSize, creatorUsername: room.creatorUsername,
         player1Username: room.players[0] ? users[room.players[0]]?.username : null,
         player2Username: room.players[1] ? users[room.players[1]]?.username : null,
    })));


    // İstifadəçi adını qeydiyyatdan keçir
    socket.on('register_user', (username) => {
        if (username && username.trim().length > 0) {
            users[socket.id].username = username.trim();
            console.log(`İstifadəçi ${socket.id} adını ${username.trim()} olaraq təyin etdi.`);
        }
    });

    // Yeni otaq yaratma
    socket.on('create_room', (data) => {
        console.log('create_room hadisəsi alındı:', data);
        if (!data || !data.name || data.name.trim().length === 0) {
            return socket.emit('creation_error', 'Otaq adı boş ola bilməz.');
        }
        // Şifrə validasiyası (əgər varsa) - client tərəfindəki ilə eyni olmalıdır
        if (data.password && data.password.length > 0) {
             if (data.password.length < 2 || !(/[a-zA-Z]/.test(data.password) && /\d/.test(data.password))) {
                   return socket.emit('creation_error', 'Şifrə tələblərə uyğun deyil (min 2 krk, 1 hərf + 1 rəqəm).');
             }
         }

        const newRoomId = generateRoomId();
        const newRoom = {
            id: newRoomId,
            name: data.name.trim(),
            password: data.password || null, // Şifrə varsa saxla, yoxsa null
            players: [socket.id], // Yaradan avtomatik qoşulur
            boardSize: parseInt(data.boardSize, 10) || 3,
            creatorUsername: users[socket.id].username,
            // Oyun vəziyyəti üçün yer (əlavə olunmalıdır)
            gameState: null // Məsələn: lövhə, növbə kimdədir və s.
        };
        rooms[newRoomId] = newRoom;
        users[socket.id].currentRoom = newRoomId;
        socket.join(newRoomId); // Socket.IO otağına qoşul

        console.log(`Otaq yaradıldı: ID=${newRoomId}, Adı=${newRoom.name}`);

        // socket.emit('room_created', { roomId: newRoomId, roomName: newRoom.name }); // Klientə təsdiq göndər
        // Avtomatik qoşulma üçün client tərəfindəki kimi yönləndirmə məlumatı göndərək
        socket.emit('room_joined', {
             roomId: newRoomId,
             roomName: newRoom.name,
             boardSize: newRoom.boardSize,
             // Gələcəkdə: playerSymbol: 'X' // Yaradana avtomatik X verək?
        });

        broadcastRoomList(); // Bütün istifadəçilərə yeni siyahını göndər
    });

    // Otağa qoşulma
    socket.on('join_room', (data) => {
        console.log('join_room hadisəsi alındı:', data);
        const room = rooms[data.roomId];
        const user = users[socket.id];

        if (!room) { return socket.emit('join_error', 'Otaq tapılmadı.'); }
        if (user.currentRoom) { return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.'); }
        if (room.players.length >= 2) { return socket.emit('join_error', 'Otaq doludur.'); }
        if (room.password && room.password !== data.password) { return socket.emit('join_error', 'Şifrə yanlışdır.'); }

        // Qoşulma uğurludur
        room.players.push(socket.id);
        user.currentRoom = room.id;
        socket.join(room.id);

        console.log(`İstifadəçi ${user.username} (${socket.id}) otağa qoşuldu: ${room.name} (${room.id})`);

        // Qoşulan istifadəçiyə təsdiq və yönləndirmə məlumatı göndər
        socket.emit('room_joined', {
            roomId: room.id,
            roomName: room.name,
            boardSize: room.boardSize,
            // Gələcəkdə: playerSymbol: 'O' // Qoşulana avtomatik O verək?
        });

        // Otaqdakı digər oyunçuya rəqibin qoşulduğunu bildir (əgər varsa)
        const opponentSocketId = room.players.find(id => id !== socket.id);
        if (opponentSocketId) {
             socket.to(opponentSocketId).emit('opponent_joined', { username: user.username });
        }

        broadcastRoomList(); // Otaq siyahısını yenilə
    });

     // === OYUN İÇİ HADİSƏLƏR (Boş - Əlavə Olunmalıdır) ===
     // Məsələn: Zər atma, simvol seçimi, gediş etmə, restart tələbi vs.
     socket.on('dice_roll', (data) => {
          // ... (zər nəticəsini otaqdakı digər oyunçuya göndər)
     });
     socket.on('symbol_choice', (data) => {
         // ... (seçilən simvolu digər oyunçuya bildir və oyunu başlat)
     });
     socket.on('make_move', (data) => { // data = { index: clickedIndex }
          const roomId = users[socket.id].currentRoom;
          if (roomId && rooms[roomId]) {
              // 1. Gedişin etibarlılığını yoxla (növbə bu oyunçudadırmı? xana boşdurmu?)
              // 2. Oyun vəziyyətini yenilə (rooms[roomId].gameState)
              // 3. Hər iki oyunçuya yeni oyun vəziyyətini göndər
              // io.to(roomId).emit('game_state_update', rooms[roomId].gameState);
              // 4. Qazanma/bərabərlik yoxlaması et
              // 5. Növbəti oyunçuya keç
              console.log(`Gediş alındı: ${data.index}, Otaq: ${roomId}`);
              // Təkcə digər oyunçuya göndərmək üçün: socket.to(roomId).emit('opponent_moved', { index: data.index });
              io.to(roomId).emit('opponent_moved', { index: data.index, player: users[socket.id].username }); // TƏXMİNİ
          }
     });
     socket.on('request_restart', () => {
         // ... (restart tələbini digər oyunçuya göndər)
     });
     socket.on('accept_restart', () => {
         // ... (restartı təsdiqlə və oyunu yenidən başlat)
     });
     socket.on('leave_room', () => {
          handleDisconnect(socket); // Ayrılma məntiqini istifadə et
     });
     // =======================================================

    // Bağlantı kəsildikdə və ya istifadəçi ayrıldıqda
    socket.on('disconnect', () => {
        console.log(`İstifadəçi ayrıldı: ${socket.id}`);
        handleDisconnect(socket);
    });

    function handleDisconnect(socket) {
        const user = users[socket.id];
        if (user && user.currentRoom) {
            const roomId = user.currentRoom;
            const room = rooms[roomId];
            console.log(`Ayrılan istifadəçi ${user.username} otaqda idi: ${roomId}`);

            if (room) {
                // Oyunçunu otaqdan çıxart
                room.players = room.players.filter(id => id !== socket.id);
                console.log(`Otaqdakı oyunçular: ${room.players.length}`);

                // Otaqdakı digər oyunçuya rəqibin ayrıldığını bildir (əgər varsa)
                const remainingPlayerId = room.players[0]; // Əgər kimsə qalıbsa
                if (remainingPlayerId) {
                    io.to(remainingPlayerId).emit('opponent_left', { username: user.username });
                     // Bəlkə qalan oyunçunu da lobbiyə qaytarmaq lazımdır? Və ya AI təklif etmək?
                     // users[remainingPlayerId].currentRoom = null;
                     // io.sockets.sockets.get(remainingPlayerId)?.leave(roomId);
                }

                 // Əgər otaq boş qaldısa, onu sil
                 if (room.players.length === 0) {
                     console.log(`Otaq ${roomId} boş qaldı və silinir.`);
                     delete rooms[roomId];
                 }
                 broadcastRoomList(); // Otaq siyahısını yenilə
            }
        }
        // İstifadəçini ümumi siyahıdan sil
        delete users[socket.id];
    }

});

// ----- Serveri Başlatma -----
server.listen(PORT, () => {
    console.log(`---- Server ${PORT} portunda işə düşdü ----`);
    console.log(`---- Statik fayllar ${publicDirectoryPath} qovluğundan təqdim edilir ----`);
});