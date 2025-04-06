// server/server.js (v3 - /register və /login məntiqi ilə)

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcrypt'); // Şifrə hash üçün
const saltRounds = 10; // Hash üçün təhlükəsizlik dərəcəsi

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json()); // Gələn JSON request body-lərini parse etmək üçün middleware

const PORT = process.env.PORT || 3000;

// Statik faylları public qovluğundan təqdim etmək
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath));

// ----- Sadə In-Memory Verilənlər Bazası (Müvəqqəti) -----
let users_db = []; // İstifadəçiləri saxlayacaq massiv (server restartda silinir)
let rooms = {};    // Otaqlar
let users = {};    // Socket bağlantıları

// ----- Yardımçı Funksiyalar -----
function generateRoomId() { return Math.random().toString(36).substring(2, 9); }

function broadcastRoomList() {
    const roomListForClients = Object.values(rooms).map(room => ({
        id: room.id, name: room.name, playerCount: room.players.length, hasPassword: !!room.password,
        boardSize: room.boardSize, creatorUsername: room.creatorUsername,
        player1Username: room.players[0] ? users[room.players[0]]?.username : null,
        player2Username: room.players[1] ? users[room.players[1]]?.username : null,
    }));
    console.log('>>> Broadcasting room_list_update with:', JSON.stringify(roomListForClients));
    io.emit('room_list_update', roomListForClients);
}

// ----- HTTP API Marşrutları (Routes) -----

// Qeydiyyat Endpoint-i (/register)
app.post('/register', async (req, res) => {
    console.log('POST /register sorğusu alındı:', req.body);
    const { fullName, email, nickname, password } = req.body;

    // 1. Validasiya
    if (!fullName || !email || !nickname || !password) {
        return res.status(400).json({ message: 'Bütün sahələr doldurulmalıdır.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: 'Şifrə minimum 6 simvol olmalıdır.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
         return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' });
    }
    // Nickname üçün əlavə yoxlama (məs. boşluq olmasın)
    if (/\s/.test(nickname)) {
         return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' });
    }


    try {
        // 2. Unikallıq Yoxlaması (email və nickname)
        const emailExists = users_db.some(user => user.email === email);
        if (emailExists) {
            return res.status(409).json({ message: 'Bu e-poçt ünvanı artıq qeydiyyatdan keçib.' }); // 409 Conflict
        }
        const nicknameExists = users_db.some(user => user.nickname.toLowerCase() === nickname.toLowerCase()); // Kiçik/böyük hərf fərqi olmadan yoxla
        if (nicknameExists) {
            return res.status(409).json({ message: 'Bu nickname (oyun adı) artıq istifadə olunur.' }); // 409 Conflict
        }

        // 3. Şifrə Hash Etmə
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 4. Yeni İstifadəçini Yadda Saxlama (In-Memory)
        const newUser = {
            id: Date.now().toString(),
            fullName: fullName,
            email: email,
            nickname: nickname, // Orijinal daxil edilən halı saxlayaq
            password: hashedPassword
        };
        users_db.push(newUser);
        console.log('Yeni istifadəçi qeydiyyatdan keçdi:', { id: newUser.id, nickname: newUser.nickname, email: newUser.email });
        console.log('Hazırkı istifadəçi bazası (in-memory):', users_db.map(u => ({id: u.id, nickname: u.nickname}))); // Şifrəni loga yazdırma

        // 5. Uğur Cavabı Göndərmək
        res.status(201).json({ message: 'Qeydiyyat uğurlu oldu!' }); // 201 Created

    } catch (error) {
        console.error("Qeydiyyat zamanı xəta:", error);
        res.status(500).json({ message: 'Server xətası baş verdi. Zəhmət olmasa, sonra yenidən cəhd edin.' });
    }
});

// Giriş Endpoint-i (/login)
app.post('/login', async (req, res) => {
    console.log('POST /login sorğusu alındı:', req.body);
    const { nickname, password } = req.body;

    // 1. Validasiya
    if (!nickname || !password) {
        return res.status(400).json({ message: 'Nickname və şifrə daxil edilməlidir.' });
    }

    try {
        // 2. İstifadəçini Tapmaq (nickname ilə, kiçik/böyük hərf fərqi olmadan)
        const user = users_db.find(u => u.nickname.toLowerCase() === nickname.toLowerCase());

        if (!user) {
            // İstifadəçi tapılmadı
            return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' }); // 401 Unauthorized
        }

        // 3. Şifrə Müqayisəsi
        const isPasswordCorrect = await bcrypt.compare(password, user.password); // Daxil edilən şifrə ilə hash-ı müqayisə et

        if (!isPasswordCorrect) {
            // Şifrə yanlışdır
            return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' }); // 401 Unauthorized
        }

        // 4. Uğurlu Giriş Cavabı
        // TODO: Burada session və ya JWT token yaratmaq və clientə göndərmək lazımdır
        // Hələlik sadəcə uğurlu cavab və nickname qaytaraq
        console.log(`İstifadəçi giriş etdi: ${user.nickname}`);
        res.status(200).json({ message: 'Giriş uğurlu!', nickname: user.nickname }); // Nickname-i qaytarırıq ki, frontend yönləndirə bilsin

    } catch (error) {
        console.error("Giriş zamanı xəta:", error);
        res.status(500).json({ message: 'Server xətası baş verdi. Zəhmət olmasa, sonra yenidən cəhd edin.' });
    }
});

// Default route to redirect to login page
app.get('/', (req, res) => {
    res.redirect('/ANA SEHIFE/login/login.html');
});

// ----- Socket.IO Hadisələri -----
io.on('connection', (socket) => {
    console.log(`Yeni istifadəçi qoşuldu: ${socket.id}`);
    users[socket.id] = { id: socket.id, username: 'Anonim', currentRoom: null }; // username burda nickname olmalıdır (girişdən sonra)

    socket.emit('room_list_update', Object.values(rooms).map(room => ({
         id: room.id, name: room.name, playerCount: room.players.length, hasPassword: !!room.password,
         boardSize: room.boardSize, creatorUsername: room.creatorUsername,
         player1Username: room.players[0] ? users[room.players[0]]?.username : null,
         player2Username: room.players[1] ? users[room.players[1]]?.username : null,
    })));

    // Qeyd: register_user hadisəsi əslində login mexanizmi ilə əvəz olunmalıdır
    socket.on('register_user', (username) => {
        // Bu kod, istifadəçi /login ilə giriş etdikdən sonra işləməlidir ki,
        // socket bağlantısı ilə düzgün nickname əlaqələndirilsin.
        // Hələlik sadə qalsın:
        if (username && username.trim().length > 0) {
            users[socket.id].username = username.trim(); // Bu nickname olmalıdır
            console.log(`Socket ${socket.id} üçün username təyin edildi: ${username.trim()}`);
        }
    });

    // Otaq yaratma/qoşulma və digər Socket.IO hadisələri dəyişməz qala bilər
    // Ancaq idealda, bu hadisələri etməzdən əvvəl istifadəçinin giriş edib etmədiyini yoxlamaq lazımdır.
    socket.on('create_room', (data) => {
        console.log('create_room hadisəsi alındı:', data);
        if (!data || !data.name || data.name.trim().length === 0) { return socket.emit('creation_error', 'Otaq adı boş ola bilməz.'); }
        if (data.password && data.password.length > 0) { if (data.password.length < 2 || !(/[a-zA-Z]/.test(data.password) && /\d/.test(data.password))) { return socket.emit('creation_error', 'Şifrə tələblərə uyğun deyil.'); } }

        const newRoomId = generateRoomId();
        const creatorUsername = users[socket.id]?.username || 'Naməlum Yaradan';
        const newRoom = { id: newRoomId, name: data.name.trim(), password: data.password || null, players: [socket.id], boardSize: parseInt(data.boardSize, 10) || 3, creatorUsername: creatorUsername, gameState: null };
        rooms[newRoomId] = newRoom;
        users[socket.id].currentRoom = newRoomId;
        socket.join(newRoomId);
        console.log(`Otaq yaradıldı: ID=${newRoomId}, Adı=${newRoom.name}`);
        socket.emit('room_joined', { roomId: newRoomId, roomName: newRoom.name, boardSize: newRoom.boardSize });
        broadcastRoomList();
    });

    socket.on('join_room', (data) => {
        console.log('join_room hadisəsi alındı:', data);
        const room = rooms[data.roomId]; const user = users[socket.id];
        if (!room) { return socket.emit('join_error', 'Otaq tapılmadı.'); } if (user.currentRoom) { return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.'); } if (room.players.length >= 2) { return socket.emit('join_error', 'Otaq doludur.'); } if (room.password && room.password !== data.password) { return socket.emit('join_error', 'Şifrə yanlışdır.'); }

        room.players.push(socket.id); user.currentRoom = room.id; socket.join(room.id);
        console.log(`İstifadəçi ${user.username} (${socket.id}) otağa qoşuldu: ${room.name} (${room.id})`);
        socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });
        const opponentSocketId = room.players.find(id => id !== socket.id); if (opponentSocketId) { socket.to(opponentSocketId).emit('opponent_joined', { username: user.username }); }
        broadcastRoomList();
    });

    socket.on('make_move', (data) => { const roomId = users[socket.id]?.currentRoom; if(roomId) io.to(roomId).emit('opponent_moved', { index: data.index, player: users[socket.id]?.username }); });
    socket.on('leave_room', () => { handleDisconnect(socket); });

    socket.on('disconnect', () => { console.log(`İstifadəçi ayrıldı: ${socket.id}`); handleDisconnect(socket); });

    function handleDisconnect(socket) {
        const user = users[socket.id]; if (!user) return; const roomId = user.currentRoom; const username = user.username; delete users[socket.id];
        if (roomId && rooms[roomId]) { rooms[roomId].players = rooms[roomId].players.filter(id => id !== socket.id); const room = rooms[roomId];
            if (room.players.length === 0) { console.log(`Otaq ${roomId} boş qaldı və silinir.`); delete rooms[roomId]; }
            else { const remainingPlayerId = room.players[0]; io.to(remainingPlayerId).emit('opponent_left', { username: username }); } broadcastRoomList();
        }
    }
});

// ----- Serveri Başlatma -----
server.listen(PORT, () => {
    console.log(`---- Server ${PORT} portunda işə düşdü ----`);
    console.log(`---- Statik fayllar ${publicDirectoryPath} qovluğundan təqdim edilir ----`);
});