// server.js (PostgreSQL + DB Session Store ilə Tam Yenilənmiş v4.1)
// Part 1/3 - Setup and Middleware

// ---- Əsas Modulların Import Edilməsi ----
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const saltRounds = 10;

// ---- Express və Socket.IO Tətbiqlərinin Yaradılması ----
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingInterval: 10000,
    pingTimeout: 15000
});
console.log('[Setup] Express, HTTP Server və Socket.IO yaradıldı.');
console.log(`[Setup] Socket.IO ping ayarları: interval=${io.opts.pingInterval}, timeout=${io.opts.pingTimeout}`);

// ---- PostgreSQL Verilənlər Bazası Bağlantı Pool-u ----
if (!process.env.DATABASE_URL) {
    console.error('FATAL ERROR: DATABASE_URL mühit dəyişəni tapılmadı!');
    process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Render.com və bənzər platformalar üçün
  }
});
console.log('[Setup] PostgreSQL connection pool yaradıldı.');

// Bağlantı testi
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Verilənlər bazasına qoşulma xətası:', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) {
      return console.error('DB Test sorğusu xətası:', err.stack);
    }
    try {
        const dbTime = new Date(result.rows[0].now).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
        console.log(`---- Verilənlər bazasına uğurla qoşuldu: ${dbTime} ----`);
    } catch(e) {
        console.log('---- Verilənlər bazasına uğurla qoşuldu (zaman formatı xətası):', result.rows[0].now, '----');
    }
  });
});

// ---- Express Ayarları (Sessiondan əvvəl) ----
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
    console.log('[Setup] Express "trust proxy" ayarı aktiv edildi (production).');
}

// ---- Session Middleware Konfiqurasiyası ----
if (!process.env.SESSION_SECRET) {
    console.error('FATAL ERROR: SESSION_SECRET mühit dəyişəni tapılmadı!');
    process.exit(1);
}
const sessionMiddleware = session({
  store: new pgSession({
    pool : pool,
    tableName : 'user_sessions',
    pruneSessionInterval: 60 * 10 // 10 dəqiqədə bir köhnə sessionları təmizlə (saniyə)
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 gün
    sameSite: 'lax'
  }
});
app.use(sessionMiddleware);
console.log('[Setup] Session middleware (pgSession ilə) konfiqurasiya edildi və tətbiq olundu.');
console.log(`[Setup] Session cookie ayarları: secure=${process.env.NODE_ENV === 'production'}, httpOnly=true, maxAge=${1000 * 60 * 60 * 24 * 7}, sameSite='lax'`);

// ---- Digər Middleware-lər ----
app.use(express.json());
// Statik faylların yolu layihə strukturunuza uyğun olmalıdır
const publicDirectoryPath = path.join(__dirname, 'public'); // server.js faylının olduğu qovluğa nəzərən 'public'
app.use(express.static(publicDirectoryPath));
console.log('[Setup] JSON parser və Static files middleware tətbiq edildi. Statik qovluq:', publicDirectoryPath);

// ---- Autentifikasiya Middleware Funksiyası ----
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.id) {
    return next();
  } else {
    console.warn(`[Auth Middleware] Giriş tələb olunan route üçün icazə verilmədi. SessionID: ${req.sessionID || 'N/A'}`);
    return res.status(401).json({ message: 'Bu əməliyyat üçün giriş tələb olunur.' });
  }
};

// ----- Yardımçı Funksiyalar və Global Dəyişənlər (Otaqlar üçün) -----
let rooms = {}; // Aktiv oyun otaqları (yaddaşda)
let users = {}; // Qoşulu olan socket bağlantıları (yaddaşda)

function generateRoomId() {
    return require('crypto').randomBytes(6).toString('hex');
}

// Otaq siyahısını formatlayıb bütün clientlərə göndərən funksiya
function broadcastRoomList() {
    try {
        const roomListForClients = Object.values(rooms)
            .map(room => ({
                id: room.id,
                name: room.name,
                playerCount: room.players.length, // Client tərəfi AI üçün bunu interpretasiya edəcək
                hasPassword: !!room.password,
                boardSize: room.boardSize,
                creatorUsername: room.creatorUsername,
                player1Username: room.players[0] ? users[room.players[0]]?.username : null,
                player2Username: room.players[1] ? users[room.players[1]]?.username : null,
                isAiRoom: !!room.isAiRoom
            }));
        io.emit('room_list_update', roomListForClients);
    } catch (error) {
        console.error("[broadcastRoomList] XƏTA:", error);
        io.emit('room_list_update', []);
    }
}

// ----- Standart AI Otaqlarını Yaratmaq Funksiyası -----
function createDefaultRooms() {
    const defaultRoomsData = [
        { name: "SNOW ilə 3x3", size: 3, isAi: true },
        { name: "SNOW ilə 4x4", size: 4, isAi: true },
        { name: "SNOW ilə 5x5", size: 5, isAi: true },
        { name: "SNOW ilə 6x6", size: 6, isAi: true }
    ];
    let createdCount = 0;

    defaultRoomsData.forEach(roomData => {
        const exists = Object.values(rooms).some(room => room.name === roomData.name && room.isAiRoom);
        if (!exists) {
            const roomId = `ai_${generateRoomId()}`; // AI otaq ID-lərini fərqləndirək
            rooms[roomId] = {
                id: roomId,
                name: roomData.name,
                password: null,
                players: [], // AI otağında real oyunçu saxlanılmır (yalnız lobidə göstərmək üçündür)
                boardSize: roomData.size,
                creatorUsername: "SNOW", // Rəmzi yaradan
                gameState: null,
                isAiRoom: roomData.isAi
            };
            createdCount++;
        }
    });
     if (createdCount > 0) {
         console.log(`[Setup] ${createdCount} ədəd standart AI otağı yaradıldı.`);
     } else {
         console.log('[Setup] Bütün standart AI otaqları artıq mövcud idi.');
     }
}

// --- Part 1 Sonu ---
// server.js (PostgreSQL + DB Session Store ilə Tam Yenilənmiş v4.1)
// Part 2/3 - HTTP API Routes

// ... (Part 1-dən sonra gələn kod: require-lar, setup, middleware-lər, yardımçı funksiyalar) ...

// ==========================================
// ===== HTTP API MARŞRUTLARI (ROUTES) ======
// ==========================================
console.log('[Setup] API Endpointləri təyin edilir...');

// ----- Qeydiyyat Endpoint-i (/register) -----
app.post('/register', async (req, res) => {
  const { fullName, email, nickname, password } = req.body;
  console.log(`[API /register] Sorğu alındı: { nickname: '${nickname}' }`);

  // Server-side Validasiyalar
  if (!fullName || !email || !nickname || !password) { console.log('[API /register] Xəta: Bütün sahələr boşdur.'); return res.status(400).json({ message: 'Bütün sahələr doldurulmalıdır.' }); }
  if (password.length < 6) { console.log('[API /register] Xəta: Şifrə qısadır.'); return res.status(400).json({ message: 'Şifrə minimum 6 simvol olmalıdır.' }); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.log('[API /register] Xəta: Email formatı yanlış.'); return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
  if (/\s/.test(nickname)) { console.log('[API /register] Xəta: Nickname boşluqlu.'); return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }

  let client;
  try {
    client = await pool.connect();
    console.log('[API /register] DB bağlantısı alındı.');

    // Unikallıq yoxlaması
    const emailCheck = await client.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email]);
    if (emailCheck.rowCount > 0) { console.log(`[API /register] Xəta: Email (${email}) mövcuddur.`); return res.status(409).json({ message: 'Bu e-poçt artıq qeydiyyatdan keçib.' }); }
    const nicknameCheck = await client.query('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) LIMIT 1', [nickname]);
    if (nicknameCheck.rowCount > 0) { console.log(`[API /register] Xəta: Nickname (${nickname}) mövcuddur.`); return res.status(409).json({ message: 'Bu nickname artıq istifadə olunur.' }); }

    // Şifrəni hashla
    console.log(`[API /register] ${nickname} üçün şifrə hashlanır...`);
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUserId = Date.now().toString(); // Və ya DB SERIAL

    // İstifadəçini DB-yə əlavə et
    const insertQuery = `INSERT INTO users (id, full_name, email, nickname, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, nickname;`;
    const values = [newUserId, fullName, email, nickname, hashedPassword];
    console.log(`[API /register] İstifadəçi DB-yə yazılır: ${nickname}`);
    const result = await client.query(insertQuery, values);

    console.log(`[API /register] UĞURLU: İstifadəçi yaradıldı:`, result.rows[0]);
    res.status(201).json({ message: 'Qeydiyyat uğurlu oldu!' });

  } catch (error) {
    console.error("[API /register] Qeydiyyat xətası:", error);
    if (error.code === '23505') { if (error.constraint?.includes('email')) return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' }); if (error.constraint?.includes('nickname')) return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' }); }
    if (!res.headersSent) res.status(500).json({ message: 'Server xətası baş verdi.' });
  } finally {
    if (client) { client.release(); console.log('[API /register] DB bağlantısı buraxıldı.'); }
  }
});

// ----- Giriş Endpoint-i (/login) -----
app.post('/login', async (req, res) => {
    const { nickname, password } = req.body;
    let client;
    console.log(`[API /login] Sorğu alındı: { nickname: '${nickname}' }`);
    if (!nickname || !password) { console.log('[API /login] Xəta: Nickname/şifrə boş.'); return res.status(400).json({ message: 'Nickname və şifrə daxil edilməlidir.' }); }

    try {
        client = await pool.connect();
        console.log(`[API /login] DB bağlantısı alındı.`);
        const result = await client.query('SELECT * FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);
        if (result.rowCount === 0) { console.log(`[API /login] İstifadəçi tapılmadı: ${nickname}`); return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' }); }
        const user = result.rows[0];
        console.log(`[API /login] İstifadəçi tapıldı: ${user.nickname} (ID: ${user.id})`);
        console.log(`[API /login] Şifrə yoxlanılır...`);
        const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordCorrect) { console.log(`[API /login] Şifrə yanlışdır: ${nickname}`); return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' }); }
        console.log(`[API /login] Şifrə doğrudur: ${nickname}`);
        const oldSessionID = req.sessionID;
        console.log(`[API /login] Session regenerate edilir... Köhnə ID=${oldSessionID}`);
        req.session.regenerate(regenerateErr => {
            if (regenerateErr) { console.error("[API /login] Session regenerate xətası:", regenerateErr); if (!res.headersSent) return res.status(500).json({ message: 'Session xətası (regenerate).' }); return; }
            const newSessionID = req.sessionID;
            console.log(`[API /login] Yeni SessionID=${newSessionID}. User datası təyin edilir...`);
            req.session.user = { id: user.id, nickname: user.nickname, fullName: user.full_name, email: user.email }; // Email də əlavə edək
            console.log(`[API /login] req.session.user təyin edildi:`, JSON.stringify(req.session.user));
            req.session.save(saveErr => {
                if (saveErr) { console.error("[API /login] Session save xətası:", saveErr); if (!res.headersSent) return res.status(500).json({ message: 'Session xətası (save).' }); return; }
                console.log(`[API /login] UĞURLU: Session saxlandı. User: ${req.session.user?.nickname}, SessionID: ${req.sessionID}`);
                 if (!res.headersSent) res.status(200).json({ message: 'Giriş uğurlu!', nickname: user.nickname });
                 else console.warn("[API /login] Save callback işlədi amma cavab göndərilmişdi?");
            });
        });
    } catch (error) {
        console.error("[API /login] Ümumi giriş xətası:", error);
         if (!res.headersSent) res.status(500).json({ message: 'Server xətası.' });
    } finally {
        if (client) { client.release(); console.log(`[API /login] DB bağlantısı buraxıldı.`); }
    }
});

// ----- Çıxış Endpoint-i (/logout) -----
app.post('/logout', (req, res) => {
  if (req.session.user) {
    const nickname = req.session.user.nickname;
    console.log(`[API /logout] Çıxış tələbi: ${nickname}, SessionID: ${req.sessionID}`);
    req.session.destroy(err => {
      if (err) { console.error("[API /logout] Session destroy xətası:", err); return res.status(500).json({ message: "Çıxış zamanı xəta." }); }
      res.clearCookie('connect.sid'); // Cookie adı dəqiq olmalıdır
      console.log(`[API /logout] İstifadəçi çıxdı: ${nickname}. Session məhv edildi.`);
      res.status(200).json({ message: "Uğurla çıxış edildi." });
    });
  } else {
    console.log(`[API /logout] Aktiv session yox idi.`);
    res.status(400).json({ message: "Giriş edilməyib." });
  }
});

// ----- Autentifikasiya Vəziyyətini Yoxlama Endpoint-i (/check-auth) -----
app.get('/check-auth', (req, res) => {
  // console.log(`--- /check-auth sorğusu gəldi --- Session ID: ${req.sessionID}`); // Daha az log
  // console.log(`Server req.session görür mü? ${!!req.session}`);
  // console.log(`Server req.session.user görür mü? ${!!req.session?.user}`, req.session?.user ? `(${JSON.stringify(req.session.user)})` : '');
  if (req.session && req.session.user && req.session.user.id) {
    // console.log(`[/check-auth] Cavab: Uğurlu. User: ${req.session.user.nickname}, SessionID=${req.sessionID}`);
    res.status(200).json({ loggedIn: true, user: req.session.user });
  } else {
    // console.log('Server session/user tapa bilmir!');
    res.status(401).json({ loggedIn: false, message: 'Sessiya tapılmadı və ya etibarsızdır.' });
  }
});


// ----- Profil Məlumatlarını Almaq Endpoint-i (/profile/:nickname) -----
// Bu endpoint artıq birbaşa istifadə edilmir, /check-auth içində user datası göndərilir
// Amma gələcək üçün qala bilər
app.get('/profile/:nickname', isAuthenticated, async (req, res) => {
  // ... (əvvəlki kimi, dəyişiklik yoxdur) ...
});

// ----- Profil Məlumatlarını Yeniləmək Endpoint-i (/profile/:nickname) -----
app.put('/profile/:nickname', isAuthenticated, async (req, res) => {
  // ... (əvvəlki kimi, dəyişiklik yoxdur) ...
});


// ----- Default Kök Route (/) -----
app.get('/', (req, res) => {
    // console.log(`[API GET /] Kök route sorğusu. SessionID=${req.sessionID}, User=${req.session.user?.nickname || 'N/A'}`);
    if (req.session && req.session.user && req.session.user.id) {
        // console.log('[API GET /] Aktiv sessiya var, oyunlara yönləndirilir.');
        // Frontend faylının düzgün yolunu göstərdiyinizdən əmin olun
        res.redirect('/OYUNLAR/oyunlar/oyunlar.html');
    } else {
        // console.log('[API GET /] Aktiv sessiya yoxdur, loginə yönləndirilir.');
        // Frontend faylının düzgün yolunu göstərdiyinizdən əmin olun
        res.redirect('/ANA SEHIFE/login/login.html');
    }
});

// --- Part 2 Sonu ---
// server.js (PostgreSQL + DB Session Store ilə Tam Yenilənmiş v4.1)
// Part 3/3 - Socket.IO Logic & Server Start (player_ready_in_room ƏLAVƏ EDİLDİ)

// ... (Part 1 və Part 2-dən sonra gələn kod: require-lar, setup, API routes) ...

// ============================================
// ===== SOCKET.IO HADISƏLƏRİ (EVENTS) ======
// ============================================
console.log('[Setup] Socket.IO konfiqurasiyası başlayır...');

// Socket.IO üçün Session Middleware-i istifadə etmək üçün yardımçı funksiya
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

// Session middleware-i Socket.IO üçün tətbiq et
io.use(wrap(sessionMiddleware));
console.log('[Setup] Socket.IO üçün session middleware tətbiq edildi.');

// Socket.IO bağlantılarını yalnız giriş etmiş istifadəçilər üçün qəbul et
io.use((socket, next) => {
  if (socket.request.session && socket.request.session.user && socket.request.session.user.nickname) {
    socket.user = { ...socket.request.session.user }; // Sessiyadan user məlumatını socket obyektinə kopyala
    console.log(`[Socket Auth] Socket üçün user təyin edildi: ${socket.user.nickname} (Socket ID: ${socket.id})`);
    next();
  } else {
    console.warn(`[Socket Auth] Giriş edilməmiş socket bağlantısı rədd edildi (SessionID: ${socket.request.sessionID || 'N/A'}).`);
    next(new Error('Authentication error'));
  }
});
console.log('[Setup] Socket.IO üçün autentifikasiya middleware təyin edildi.');


// ----- Yeni Socket Bağlantısı Gəldikdə... -----
io.on('connection', (socket) => {
  console.log(`[Socket Connect] İstifadəçi qoşuldu: ${socket.user.nickname} (Socket ID: ${socket.id})`);

  // İstifadəçini 'users' yaddaş obyektinə əlavə et
  users[socket.id] = {
      id: socket.id,
      userId: socket.user.id, // DB-dən gələn user ID
      username: socket.user.nickname,
      currentRoom: null // Başlanğıcda heç bir otaqda deyil
  };

  // Qoşulan istifadəçiyə otaq siyahısını göndər (Lobidədirsə)
  try {
      const initialRoomList = Object.values(rooms).map(room => ({
            id: room.id, name: room.name, playerCount: room.players.length,
            hasPassword: !!room.password, boardSize: room.boardSize,
            creatorUsername: room.creatorUsername,
            player1Username: room.players[0] ? users[room.players[0]]?.username : null,
            player2Username: room.players[1] ? users[room.players[1]]?.username : null,
            isAiRoom: !!room.isAiRoom
       }));
      socket.emit('room_list_update', initialRoomList);
      // console.log(`[Socket Connect] İlkin otaq siyahısı ${socket.user.nickname}-ə göndərildi (${initialRoomList.length} otaq).`);
  } catch (listError) {
      console.error("[Socket Connect] İlkin otaq siyahısı göndərilərkən xəta:", listError);
      socket.emit('room_list_update', []);
  }

  // ----- Otaq Əməliyyatları Dinləyiciləri -----
  socket.on('create_room', (data) => { /* ... (Hissə 1-dəki kimi) ... */ });
  socket.on('join_room', (data) => { /* ... (Hissə 1-dəki kimi) ... */ });
  socket.on('leave_room', () => { /* ... (Hissə 1-dəki kimi) ... */ });
  socket.on('delete_room', (data) => { /* ... (Hissə 1-dəki kimi) ... */ });


    // <<< DƏYİŞİKLİK BAŞLANĞICI: player_ready_in_room hadisəsi >>>
    // Client oyun otağına daxil olduqda və hazır olduqda göndərir
    socket.on('player_ready_in_room', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        console.log(`[Socket Event] player_ready_in_room (${user?.nickname}) alındı:`, data);

        if (!data || !data.roomId) {
            console.warn("player_ready_in_room: Otaq ID göndərilmədi.");
            return;
        }
        const roomId = data.roomId;
        const room = rooms[roomId];

        if (room && !room.isAiRoom) { // Yalnız mövcud və AI olmayan otaqlar üçün
             // Clientin artıq otağın socket qrupuna qoşulduğundan əmin olaq
             // (join_room hadisəsində onsuz da qoşulur, bu ehtiyat üçündür)
             if (!socket.rooms.has(roomId)) {
                  socket.join(roomId);
                  console.log(`[player_ready_in_room] Socket ${socket.id} otağa (${roomId}) təkrar qoşuldu.`);
             }
             // Clientin cari otaq statusunu yeniləyək
             if (currentUserSocketInfo) currentUserSocketInfo.currentRoom = roomId;

             // Rəqibin olub olmadığını yoxla
             let opponentUsername = null;
             if (room.players.length >= 1) { // Ən azı bir oyunçu varsa (bu özü ola bilər)
                 const opponentSocketId = room.players.find(pId => pId !== socket.id); // Özündən başqasını tap
                 if (opponentSocketId && users[opponentSocketId]) {
                     opponentUsername = users[opponentSocketId].username;
                 }
             }

             // Clientə göndəriləcək otaq məlumatları
             const roomInfo = {
                 name: room.name,
                 creatorUsername: room.creatorUsername,
                 hasPassword: !!room.password,
                 boardSize: room.boardSize,
                 opponentUsername: opponentUsername // Rəqib varsa adını göndər, yoxsa null
             };
             console.log(`[player_ready_in_room] Clientə göndərilən room_info:`, roomInfo);
             socket.emit('room_info', roomInfo);

             // Əgər rəqib artıq varsa, rəqibə də bu oyunçunun qoşulduğunu bildirə bilərik
             // (əgər rəqib də 'player_ready_in_room' göndəribsə)
             // Bu, 'join_room' içindəki məntiqi təkrarlaya bilər, diqqətli olmaq lazımdır.
             // Hələlik bunu əlavə etməyək, 'join_room' kifayət etməlidir.

        } else if (room && room.isAiRoom) {
             console.log("[player_ready_in_room] AI otağı üçün çağırıldı, heç nə edilmir.");
        } else {
             console.warn(`[player_ready_in_room] Otaq tapılmadı: ${roomId}. Client lobiyə yönləndirilə bilər.`);
             // socket.emit('force_redirect_lobby', { message: "Oynamaq istədiyiniz otaq artıq mövcud deyil." });
        }
    });
    // <<< DƏYİŞİKLİK SONU >>>


  // ----- Oyun Gedişləri və Digər Oyun İçi Hadisələr -----
  socket.on('make_move', (data) => { /* ... (əvvəlki kimi) ... */ });
  socket.on('dice_roll_result', (data) => { /* ... (əvvəlki kimi) ... */ });
  socket.on('symbol_choice', (data) => { /* ... (əvvəlki kimi) ... */ });
  socket.on('request_restart', () => { /* ... (əvvəlki kimi) ... */ });
  socket.on('accept_restart', () => { /* ... (əvvəlki kimi) ... */ });
  socket.on('kick_opponent', (data) => { /* ... (əvvəlki kimi, server tərəfi logikası) ... */ });

  // ----- Bağlantı Kəsildikdə -----
  socket.on('disconnect', (reason) => { /* ... (əvvəlki kimi) ... */ });

  // ----- Otaqdan Ayrılma / Bağlantı Kəsilmə Funksiyası (5 dəqiqə silmə ilə) -----
  function handleDisconnectOrLeave(socketInstance) { /* ... (əvvəlki kimi) ... */ }

}); // io.on('connection', ...) sonu
console.log('[Setup] Socket.IO \'connection\' dinləyicisi təyin edildi.');


// ----- Serveri Başlatma -----
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    const startTime = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
    console.log('=======================================================');
    console.log(`---- Server ${PORT} portunda uğurla işə düşdü! ----`);
    console.log(`---- Canlı Ünvan (təxmini): http://localhost:${PORT} (Render öz URL-ini təqdim edəcək) ----`);
    console.log(`---- Server Başlama Zamanı: ${startTime} ----`);
    createDefaultRooms();
    console.log('=======================================================');
});

// ----- Serverin Düzgün Dayanması -----
function gracefulShutdown(signal) { /* ... (əvvəlki kimi) ... */ };
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- Faylın Sonu ---