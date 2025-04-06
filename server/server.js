// server/server.js (v5 - express-session ilə)

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session'); // Session üçün

const saltRounds = 10;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ----- Session Middleware Konfiqurasiyası -----
// !!! 'YOUR_SECRET_KEY_HERE' yerinə çox güclü və təsadüfi bir açar yazın !!!
// Ən yaxşısı bunu Environment Variable (.env faylı) ilə etməkdir.
const sessionMiddleware = session({
    secret: 'YOUR_SECRET_KEY_HERE', // Mütləq dəyişdirin!
    resave: false, // Dəyişiklik olmadıqda sessionu yenidən yadda saxlama
    saveUninitialized: false, // Giriş etməmiş istifadəçi üçün session yaratma
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Render kimi production mühitində true olacaq (HTTPS tələb edir)
        httpOnly: true, // Cookie-nin yalnız HTTP ilə əldə edilməsi (JS ilə oxunmasın)
        maxAge: 1000 * 60 * 60 * 24 // Session nə qədər qüvvədə qalsın (məs: 1 gün)
    }
    // store: ... // Production üçün buraya database store (MongoStore, RedisStore etc.) əlavə olunmalıdır
});
app.use(sessionMiddleware);

// JSON və Statik fayllar üçün middleware (Session-dan SONRA gələ bilər)
app.use(express.json());
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath));

const PORT = process.env.PORT || 3000;

// ----- Sadə In-Memory Verilənlər Bazası (Müvəqqəti) -----
let users_db = [];
let rooms = {};
let users = {}; // Socket bağlantıları üçün (session ilə əlaqələndirilə bilər)

// ----- Autentifikasiya Middleware -----
// Bu funksiya, istifadəçinin giriş edib etmədiyini yoxlayır
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        // İstifadəçi giriş edib (session var)
        return next(); // Növbəti middleware və ya route handler-ə keç
    } else {
        // Giriş edilməyib
        return res.status(401).json({ message: 'Giriş tələb olunur.' }); // 401 Unauthorized
        // Və ya giriş səhifəsinə yönləndir: res.redirect('/ANA SEHIFE/login/login.html'); (API üçün JSON daha uyğundur)
    }
};

// ----- Yardımçı Funksiyalar -----
function generateRoomId() { return Math.random().toString(36).substring(2, 9); }
function broadcastRoomList() { /* ... əvvəlki kimi ... */
    const roomListForClients = Object.values(rooms).map(room => ({ id: room.id, name: room.name, playerCount: room.players.length, hasPassword: !!room.password, boardSize: room.boardSize, creatorUsername: room.creatorUsername, player1Username: room.players[0] ? users[room.players[0]]?.username : null, player2Username: room.players[1] ? users[room.players[1]]?.username : null, }));
    io.emit('room_list_update', roomListForClients);
}

// ----- HTTP API Marşrutları (Routes) -----

// Qeydiyyat Endpoint-i (/register) - Session tələb etmir
app.post('/register', async (req, res) => { /* ... əvvəlki kimi ... */
    console.log('POST /register sorğusu alındı:', req.body);
    const { fullName, email, nickname, password } = req.body;
    if (!fullName || !email || !nickname || !password) { return res.status(400).json({ message: 'Bütün sahələr doldurulmalıdır.' }); }
    if (password.length < 6) { return res.status(400).json({ message: 'Şifrə minimum 6 simvol olmalıdır.' }); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
    if (/\s/.test(nickname)) { return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }
    try {
        const emailExists = users_db.some(user => user.email === email); if (emailExists) { return res.status(409).json({ message: 'Bu e-poçt artıq qeydiyyatdan keçib.' }); }
        const nicknameExists = users_db.some(user => user.nickname.toLowerCase() === nickname.toLowerCase()); if (nicknameExists) { return res.status(409).json({ message: 'Bu nickname artıq istifadə olunur.' }); }
        const hashedPassword = await bcrypt.hash(password, saltRounds); const newUser = { id: Date.now().toString(), fullName, email, nickname, password: hashedPassword }; users_db.push(newUser);
        console.log('Yeni istifadəçi qeydiyyatdan keçdi:', { id: newUser.id, nickname: newUser.nickname });
        console.log('İstifadəçi bazası:', users_db.map(u=>({id: u.id, nickname: u.nickname})));
        res.status(201).json({ message: 'Qeydiyyat uğurlu oldu!' });
    } catch (error) { console.error("Qeydiyyat xətası:", error); res.status(500).json({ message: 'Server xətası.' }); }
});

// Giriş Endpoint-i (/login) - Session yaradır
app.post('/login', async (req, res) => {
    console.log('POST /login sorğusu alındı:', req.body);
    const { nickname, password } = req.body;
    if (!nickname || !password) { return res.status(400).json({ message: 'Nickname və şifrə daxil edilməlidir.' }); }
    try {
        const user = users_db.find(u => u.nickname.toLowerCase() === nickname.toLowerCase());
        if (!user) { return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' }); }
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) { return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' }); }

        // ----> Session Yaratmaq <----
        req.session.user = {
            id: user.id,
            nickname: user.nickname,
            fullName: user.fullName
            // email: user.email // Lazım olarsa əlavə et
        };
        // Session-u yadda saxlamaq vacib ola bilər (bəzi store-lar üçün)
        req.session.save((err) => {
            if (err) {
                console.error("Session save xətası:", err);
                return res.status(500).json({ message: 'Session yaradılarkən xəta baş verdi.' });
            }
            console.log(`İstifadəçi giriş etdi və session yaradıldı: ${user.nickname}`, req.session.user);
            // Nickname-i cavaba əlavə edirik ki, frontend istifadə etsin
            res.status(200).json({ message: 'Giriş uğurlu!', nickname: user.nickname });
        });
        // ----> Session Sonu <----

    } catch (error) { console.error("Giriş xətası:", error); res.status(500).json({ message: 'Server xətası.' }); }
});

// --- YENİ: Çıxış Endpoint-i (/logout) ---
// POST istifadə etmək daha yaxşıdır (GET sorğuları cache oluna bilər)
app.post('/logout', (req, res) => {
    if (req.session.user) {
        const nickname = req.session.user.nickname;
        req.session.destroy(err => {
            if (err) {
                console.error("Session destroy xətası:", err);
                return res.status(500).json({ message: "Çıxış zamanı xəta baş verdi." });
            }
            // Session silindikdən sonra cookie-ni də təmizləmək yaxşı praktikadır
            res.clearCookie('connect.sid'); // Standart session cookie adı budur (əgər dəyişməmisinizsə)
            console.log(`İstifadəçi çıxış etdi: ${nickname}`);
            res.status(200).json({ message: "Uğurla çıxış edildi." });
        });
    } else {
        // Zaten giriş edilməyib
        res.status(400).json({ message: "Giriş edilməyib." });
    }
});

// --- YENİ: Autentifikasiya Vəziyyətini Yoxlamaq Endpoint-i ---
// Frontend səhifə yüklənəndə bunu çağıracaq
app.get('/check-auth', (req, res) => {
    if (req.session && req.session.user) {
        // Giriş edilib, istifadəçi məlumatlarını qaytar (şifrəsiz)
        res.status(200).json({ loggedIn: true, user: req.session.user });
    } else {
        // Giriş edilməyib
        res.status(401).json({ loggedIn: false });
    }
});


// Profil Məlumatlarını Almaq Endpoint-i - İndi qorunur
app.get('/profile/:nickname', isAuthenticated, (req, res) => {
    const requestedNickname = req.params.nickname;
    // Middleware (isAuthenticated) artıq yoxladığı üçün session mövcuddur
    // Əlavə yoxlama: İstəyi göndərən user ancaq öz profilinə baxa bilsin
    if (req.session.user.nickname.toLowerCase() !== requestedNickname.toLowerCase()) {
        return res.status(403).json({ message: 'Başqasının profilinə baxmaq icazəsi yoxdur.' }); // 403 Forbidden
    }

    const user = users_db.find(u => u.nickname.toLowerCase() === requestedNickname.toLowerCase());
    if (user) {
        res.status(200).json({ fullName: user.fullName, email: user.email, nickname: user.nickname });
    } else {
        // Bu normalda baş verməməlidir, çünki session yoxlanılıb
        res.status(404).json({ message: 'İstifadəçi tapılmadı.' });
    }
});

// Profil Məlumatlarını Yeniləmək Endpoint-i - İndi qorunur
app.put('/profile/:nickname', isAuthenticated, async (req, res) => {
    const currentNicknameFromParam = req.params.nickname;
    const loggedInUserId = req.session.user.id; // Giriş etmiş istifadəçinin ID-si
    const { fullName, email, nickname, password } = req.body;
    console.log(`PUT /profile/${currentNicknameFromParam} sorğusu (user ID: ${loggedInUserId}):`, req.body);

    // 1. İstifadəçini ID ilə tapmaq (daha etibarlı)
    const userIndex = users_db.findIndex(u => u.id === loggedInUserId);
    if (userIndex === -1) {
        // Session var, amma DB-də user yoxdur? Qəribə vəziyyət.
        return res.status(404).json({ message: 'Yenilənəcək istifadəçi tapılmadı.' });
    }
    // Təminat üçün URL-dəki nickname ilə sessiondakı nickname-in (və ya ID-dən tapılanın) eyni olduğunu yoxla
    if (users_db[userIndex].nickname.toLowerCase() !== currentNicknameFromParam.toLowerCase()) {
         return res.status(403).json({ message: 'Başqasının profilini dəyişməyə icazə yoxdur.' });
    }


    // 2. Validasiya
    if (!fullName || !email || !nickname) { return res.status(400).json({ message: 'Ad Soyad, E-poçt və Nickname boş ola bilməz.' }); }
     if (/\s/.test(nickname)) { return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }
     if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }

    try {
        // 3. Unikallıq Yoxlaması (özündən başqa)
        const emailExists = users_db.some((user) => user.email === email && user.id !== loggedInUserId);
        if (emailExists) { return res.status(409).json({ message: 'Bu e-poçt başqa istifadəçi tərəfindən istifadə olunur.' }); }
        const nicknameExists = users_db.some((user) => user.nickname.toLowerCase() === nickname.toLowerCase() && user.id !== loggedInUserId);
        if (nicknameExists) { return res.status(409).json({ message: 'Bu nickname başqa istifadəçi tərəfindən istifadə olunur.' }); }

        // 4. Məlumatları Yeniləmək
        users_db[userIndex].fullName = fullName;
        users_db[userIndex].email = email;
        const oldNickname = users_db[userIndex].nickname;
        users_db[userIndex].nickname = nickname;

        // 5. Şifrəni Yeniləmək (əgər göndərilibsə)
        if (password) {
            if (password.length < 6) { return res.status(400).json({ message: 'Yeni şifrə minimum 6 simvol olmalıdır.' }); }
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            users_db[userIndex].password = hashedPassword;
            console.log(`İstifadəçi ${oldNickname} üçün şifrə yeniləndi.`);
        }

        // 6. Sessiondakı məlumatları da yeniləyək (əgər dəyişibsə)
        req.session.user.nickname = nickname;
        req.session.user.fullName = fullName;
        req.session.save(); // Yadda saxla

        console.log(`İstifadəçi profili yeniləndi: ${nickname}`);
        console.log('Yenilənmiş istifadəçi bazası:', users_db.map(u => ({id: u.id, nickname: u.nickname})));
        res.status(200).json({ message: 'Profil uğurla yeniləndi!', updatedUser: req.session.user }); // Yenilənmiş user məlumatını qaytaraq

    } catch (error) {
        console.error("Profil yeniləmə xətası:", error);
        res.status(500).json({ message: 'Server xətası.' });
    }
});


// Default route (Girişə yönləndirir)
app.get('/', (req, res) => { res.redirect('/ANA SEHIFE/login/login.html'); });

// ----- Socket.IO Hadisələri -----
// Socket.IO bağlantılarını da qorumaq üçün session middleware-dən istifadə etmək
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

// Socket.IO bağlantılarını yalnız giriş etmiş istifadəçilər üçün qəbul etmək
io.use((socket, next) => {
  if (socket.request.session && socket.request.session.user) {
    // Session-dakı user məlumatını socket obyektinə əlavə edək
    socket.user = socket.request.session.user;
    next();
  } else {
    console.warn("Giriş edilməmiş socket bağlantısı rədd edildi.");
    next(new Error('Authentication error')); // Bağlantını rədd et
  }
});


io.on('connection', (socket) => {
    // Artıq istifadəçinin kim olduğunu socket.user-dan bilirik
    console.log(`Giriş etmiş istifadəçi qoşuldu: ${socket.user.nickname} (Socket ID: ${socket.id})`);
    // users obyektini session ID və ya user ID ilə əlaqələndirmək daha yaxşıdır
    // Amma hələlik nickname istifadə edən köhnə strukturu saxlayaq
    users[socket.id] = { id: socket.id, username: socket.user.nickname, currentRoom: null };

    // Qalan kod əvvəlki kimi, amma user məlumatını socket.user-dan ala bilərsiniz
    socket.emit('room_list_update', Object.values(rooms).map(room => ({ id: room.id, name: room.name, playerCount: room.players.length, hasPassword: !!room.password, boardSize: room.boardSize, creatorUsername: room.creatorUsername, player1Username: room.players[0] ? users[room.players[0]]?.username : null, player2Username: room.players[1] ? users[room.players[1]]?.username : null, })));

    // Bu hadisəyə artıq ehtiyac yoxdur, çünki nickname sessiondan gəlir
    // socket.on('register_user', (username) => { ... });

    socket.on('create_room', (data) => {
        const user = socket.user; // Giriş etmiş istifadəçi
        console.log(`create_room hadisəsi (${user.nickname}):`, data);
        if (!data || !data.name || data.name.trim().length === 0) { return socket.emit('creation_error', 'Otaq adı boş ola bilməz.'); }
        if (data.password && data.password.length > 0) { if (data.password.length < 2 || !(/[a-zA-Z]/.test(data.password) && /\d/.test(data.password))) { return socket.emit('creation_error', 'Şifrə tələblərə uyğun deyil.'); } }
        const newRoomId = generateRoomId(); const newRoom = { id: newRoomId, name: data.name.trim(), password: data.password || null, players: [socket.id], boardSize: parseInt(data.boardSize, 10) || 3, creatorUsername: user.nickname, gameState: null }; rooms[newRoomId] = newRoom; users[socket.id].currentRoom = newRoomId; socket.join(newRoomId); console.log(`Otaq yaradıldı: ID=${newRoomId}, Adı=${newRoom.name}`); socket.emit('room_joined', { roomId: newRoomId, roomName: newRoom.name, boardSize: newRoom.boardSize }); broadcastRoomList();
    });

    socket.on('join_room', (data) => {
        const user = socket.user; // Giriş etmiş istifadəçi
        console.log(`join_room hadisəsi (${user.nickname}):`, data);
        const room = rooms[data.roomId]; const currentUserSocketInfo = users[socket.id]; if (!room) { return socket.emit('join_error', 'Otaq tapılmadı.'); } if (currentUserSocketInfo.currentRoom) { return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.'); } if (room.players.length >= 2) { return socket.emit('join_error', 'Otaq doludur.'); } if (room.password && room.password !== data.password) { return socket.emit('join_error', 'Şifrə yanlışdır.'); } room.players.push(socket.id); currentUserSocketInfo.currentRoom = room.id; socket.join(room.id); console.log(`İstifadəçi ${user.nickname} (${socket.id}) otağa qoşuldu: ${room.name} (${room.id})`); socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize }); const opponentSocketId = room.players.find(id => id !== socket.id); if (opponentSocketId) { socket.to(opponentSocketId).emit('opponent_joined', { username: user.nickname }); } broadcastRoomList();
    });

    socket.on('make_move', (data) => { const user = socket.user; const roomId = users[socket.id]?.currentRoom; if(roomId && user) io.to(roomId).emit('opponent_moved', { index: data.index, player: user.nickname }); });
    socket.on('leave_room', () => { handleDisconnect(socket); });

    socket.on('disconnect', () => { console.log(`İstifadəçi ayrıldı: ${socket.user?.nickname || socket.id}`); handleDisconnect(socket); });

    function handleDisconnect(socket) { const userSocketInfo = users[socket.id]; if (!userSocketInfo) return; const roomId = userSocketInfo.currentRoom; const username = userSocketInfo.username; delete users[socket.id]; if (roomId && rooms[roomId]) { rooms[roomId].players = rooms[roomId].players.filter(id => id !== socket.id); const room = rooms[roomId]; if (room.players.length === 0) { console.log(`Otaq ${roomId} boş qaldı və silinir.`); delete rooms[roomId]; } else { const remainingPlayerId = room.players[0]; io.to(remainingPlayerId).emit('opponent_left', { username: username }); } broadcastRoomList(); } }
});

// ----- Serveri Başlatma -----
server.listen(PORT, () => {
    console.log(`---- Server ${PORT} portunda işə düşdü ----`);
    console.log(`---- Statik fayllar ${publicDirectoryPath} qovluğundan təqdim edilir ----`);
});