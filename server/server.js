// server.js (PostgreSQL + DB Session Store ilə Tam Yenilənmiş)
// Hissə 1

// ---- Əsas Modulların Import Edilməsi ----
require('dotenv').config(); // .env faylındakı dəyişənləri yüklə (ƏN BAŞDA OLMALIDIR!)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg'); // PostgreSQL üçün
const session = require('express-session'); // Session üçün
const pgSession = require('connect-pg-simple')(session); // Sessionları DB-də saxlamaq üçün

const saltRounds = 10;

// ---- Express və Socket.IO Tətbiqlərinin Yaradılması ----
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] } // CORS ayarları
});

// ---- PostgreSQL Verilənlər Bazası Bağlantı Pool-u ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // .env faylından URL
  ssl: {
    rejectUnauthorized: false // Render üçün lazımdır
  }
});

// Bağlantını yoxlayaq
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Verilənlər bazasına qoşulma xətası:', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release(); // Client-i pool-a qaytar
    if (err) {
      return console.error('Test sorğusu xətası:', err.stack);
    }
    console.log('---- Verilənlər bazasına uğurla qoşuldu:', result.rows[0].now, '----');
  });
});

// ---- Session Middleware Konfiqurasiyası (PostgreSQL Store ilə) ----
const sessionMiddleware = session({
  store: new pgSession({
    pool : pool,                // Mövcud connection pool-u istifadə et
    tableName : 'user_sessions' // Session cədvəlinin adı (avtomatik yaranmalıdır)
    // createTableIfMissing: true // Cədvəl yoxdursa avtomatik yaratsın (optional)
  }),
  secret: process.env.SESSION_SECRET, // .env faylından oxu (ÇOX VACİBDİR!)
  resave: false, // Dəyişiklik olmadıqda yenidən yadda saxlama
  saveUninitialized: false, // Giriş etməmiş user üçün session yaratma
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS tələb edir (Render-də true olacaq)
    httpOnly: true, // JS ilə cookie-yə müdaxiləni əngəlləyir
    maxAge: 1000 * 60 * 60 * 24 * 7 // Məs: 7 gün
  }
});
app.use(sessionMiddleware); // Session middleware-i tətbiq et

// ---- Digər Middleware-lər ----
app.use(express.json()); // Gələn JSON body-lərini parse etmək üçün
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath)); // Statik faylları (HTML, CSS, JS) təqdim et

// ---- Autentifikasiya Middleware Funksiyası ----
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.id) { // Session və user.id yoxlanılır
    return next(); // İstifadəçi giriş edib, davam et
  } else {
    // Giriş edilməyib
    return res.status(401).json({ message: 'Bu əməliyyat üçün giriş tələb olunur.' }); // 401 Unauthorized
  }
};

// ----- Yardımçı Funksiyalar (Otaqlar üçün) -----
// Qeyd: Otaq məlumatları hələ də yaddaşda saxlanılır.
// Ehtiyac olarsa, bunlar da DB-yə köçürülə bilər.
let rooms = {}; // Aktiv oyun otaqları (yaddaşda)
let users = {}; // Qoşulu olan socket bağlantıları (yaddaşda)

function generateRoomId() { return Math.random().toString(36).substring(2, 9); }
function broadcastRoomList() {
    const roomListForClients = Object.values(rooms).map(room => ({
        id: room.id,
        name: room.name,
        playerCount: room.players.length,
        hasPassword: !!room.password,
        boardSize: room.boardSize,
        creatorUsername: room.creatorUsername,
        // 'users' obyektindəki socket ID-ləri ilə əlaqəli username-ləri tapırıq
        player1Username: room.players[0] ? users[room.players[0]]?.username : null,
        player2Username: room.players[1] ? users[room.players[1]]?.username : null,
    }));
    io.emit('room_list_update', roomListForClients);
}


// ==========================================
// ===== HTTP API MARŞRUTLARI (ROUTES) ======
// ==========================================

// ----- Qeydiyyat Endpoint-i (/register) -----
app.post('/register', async (req, res) => {
  const { fullName, email, nickname, password } = req.body;

  // Validasiyalar
  if (!fullName || !email || !nickname || !password) { return res.status(400).json({ message: 'Bütün sahələr doldurulmalıdır.' }); }
  if (password.length < 6) { return res.status(400).json({ message: 'Şifrə minimum 6 simvol olmalıdır.' }); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
  if (/\s/.test(nickname)) { return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }

  try {
    // Email və Nickname unikallığını yoxla
    const emailCheck = await pool.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email]);
    if (emailCheck.rowCount > 0) { return res.status(409).json({ message: 'Bu e-poçt artıq qeydiyyatdan keçib.' }); }
    const nicknameCheck = await pool.query('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) LIMIT 1', [nickname]);
    if (nicknameCheck.rowCount > 0) { return res.status(409).json({ message: 'Bu nickname artıq istifadə olunur.' }); }

    // Şifrəni hashla
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUserId = Date.now().toString(); // Və ya DB SERIAL istifadə edirsinizsə, bu lazım deyil

    // Yeni istifadəçini DB-yə əlavə et
    const insertQuery = `
      INSERT INTO users (id, full_name, email, nickname, password_hash)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, nickname;
    `;
    const values = [newUserId, fullName, email, nickname, hashedPassword];
    const result = await pool.query(insertQuery, values);

    console.log('Yeni istifadəçi qeydiyyatdan keçdi:', result.rows[0]);
    res.status(201).json({ message: 'Qeydiyyat uğurlu oldu!' });

  } catch (error) {
    console.error("Qeydiyyat xətası:", error);
    if (error.code === '23505') { // Unique constraint violation
         if (error.constraint === 'users_email_key') { return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' }); }
         if (error.constraint === 'users_nickname_key') { return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' }); }
    }
    res.status(500).json({ message: 'Server xətası.' });
  }
});

// ----- Giriş Endpoint-i (/login) -----
app.post('/login', async (req, res) => {
  const { nickname, password } = req.body;

  if (!nickname || !password) { return res.status(400).json({ message: 'Nickname və şifrə daxil edilməlidir.' }); }

  try {
    // İstifadəçini DB-dən tap
    const result = await pool.query('SELECT * FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);
    if (result.rowCount === 0) { return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' }); }
    const user = result.rows[0];

    // Şifrəni yoxla
    const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordCorrect) { return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' }); }

    // Session Yarat
    req.session.user = {
      id: user.id,
      nickname: user.nickname,
      fullName: user.full_name
    };
    req.session.save((err) => { // Session-un yadda saxlandığından əmin ol
      if (err) { console.error("Session save xətası:", err); return res.status(500).json({ message: 'Session yaradılarkən xəta baş verdi.' }); }
      console.log(`İstifadəçi giriş etdi: ${user.nickname}`);
      res.status(200).json({ message: 'Giriş uğurlu!', nickname: user.nickname }); // Frontend üçün nickname qaytarırıq
    });

  } catch (error) { console.error("Giriş xətası:", error); res.status(500).json({ message: 'Server xətası.' }); }
});

// ----- Çıxış Endpoint-i (/logout) -----
app.post('/logout', (req, res) => {
  if (req.session.user) {
    const nickname = req.session.user.nickname;
    req.session.destroy(err => {
      if (err) {
        console.error("Session destroy xətası:", err);
        return res.status(500).json({ message: "Çıxış zamanı xəta baş verdi." });
      }
      // Session Store (connect-pg-simple) özü DB-dən siləcək
      // Cookie-ni təmizləyək
      res.clearCookie(req.session.cookie.name || 'connect.sid'); // Cookie adını session config-dən almaq daha yaxşıdır
      console.log(`İstifadəçi çıxış etdi: ${nickname}`);
      res.status(200).json({ message: "Uğurla çıxış edildi." });
    });
  } else {
    res.status(400).json({ message: "Giriş edilməyib." });
  }
});

// ----- Autentifikasiya Vəziyyətini Yoxlama Endpoint-i (/check-auth) -----
app.get('/check-auth', (req, res) => {
  if (req.session && req.session.user && req.session.user.id) {
    // Giriş edilib, həssas olmayan məlumatları qaytar
    res.status(200).json({ loggedIn: true, user: req.session.user });
  } else {
    // Giriş edilməyib
    res.status(401).json({ loggedIn: false });
  }
});

// ----- Profil Məlumatlarını Almaq Endpoint-i (/profile/:nickname) -----
// Qeyd: Frontend bu endpointə müraciət edir, ona görə :nickname saxlayırıq
app.get('/profile/:nickname', isAuthenticated, async (req, res) => {
  const requestedNickname = req.params.nickname;
  const loggedInNickname = req.session.user.nickname;

  if (loggedInNickname.toLowerCase() !== requestedNickname.toLowerCase()) {
    return res.status(403).json({ message: 'Başqasının profilinə baxmaq icazəsi yoxdur.' });
  }

  try {
    // DB-dən məlumatları al (şifrəsiz)
    const result = await pool.query('SELECT id, full_name, email, nickname FROM users WHERE LOWER(nickname) = LOWER($1)', [loggedInNickname]);
    if (result.rowCount > 0) {
      res.status(200).json(result.rows[0]);
    } else {
      // Bu baş verməməlidir, çünki isAuthenticated yoxlayıb
      res.status(404).json({ message: 'İstifadəçi tapılmadı (DB-də).' });
    }
  } catch(error) { console.error("Profil alma xətası:", error); res.status(500).json({ message: 'Server xətası.' }); }
});

// ----- Profil Məlumatlarını Yeniləmək Endpoint-i (/profile/:nickname) -----
app.put('/profile/:nickname', isAuthenticated, async (req, res) => {
  const currentNicknameFromParam = req.params.nickname;
  const loggedInUserId = req.session.user.id;
  const loggedInNickname = req.session.user.nickname;
  const { fullName, email, nickname: newNickname, password } = req.body; // Frontend 'nickname' göndərir, biz 'newNickname' edirik

  if (loggedInNickname.toLowerCase() !== currentNicknameFromParam.toLowerCase()) {
    return res.status(403).json({ message: 'Başqasının profilini dəyişməyə icazə yoxdur.' });
  }

  // Validasiyalar (newNickname istifadə edirik)
  if (!fullName || !email || !newNickname) { return res.status(400).json({ message: 'Ad Soyad, E-poçt və Nickname boş ola bilməz.' }); }
  if (/\s/.test(newNickname)) { return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }

  try {
    // Unikallıq yoxlaması (email, newNickname)
    const emailExists = await pool.query('SELECT 1 FROM users WHERE email = $1 AND id != $2 LIMIT 1', [email, loggedInUserId]);
    if (emailExists.rowCount > 0) { return res.status(409).json({ message: 'Bu e-poçt artıq başqası tərəfindən istifadə olunur.' }); }
    const nicknameExists = await pool.query('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) AND id != $2 LIMIT 1', [newNickname, loggedInUserId]);
    if (nicknameExists.rowCount > 0) { return res.status(409).json({ message: 'Bu nickname artıq başqası tərəfindən istifadə olunur.' }); }

    // Məlumatları yeniləmək üçün UPDATE sorğusu
    let updateFields = ['full_name = $1', 'email = $2', 'nickname = $3'];
    let queryParams = [fullName, email, newNickname];
    let paramIndex = 4;

    if (password) { // Yeni şifrə varsa
      if (password.length < 6) { return res.status(400).json({ message: 'Yeni şifrə minimum 6 simvol olmalıdır.' }); }
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      updateFields.push(`password_hash = $${paramIndex}`);
      queryParams.push(hashedPassword);
      paramIndex++;
    }

    const updateQuery = `
      UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex}
      RETURNING id, full_name, email, nickname;
    `;
    queryParams.push(loggedInUserId);
    const result = await pool.query(updateQuery, queryParams);

    if (result.rowCount === 0) { return res.status(404).json({ message: 'Yenilənəcək istifadəçi tapılmadı.' }); }
    const updatedUser = result.rows[0];

    // Sessionu yenilə
    req.session.user.nickname = updatedUser.nickname;
    req.session.user.fullName = updatedUser.full_name;
    req.session.save((err) => {
      if (err) { console.error("Session save xətası (profil):", err); return res.status(500).json({ message: 'Profil DB-də yeniləndi, lakin session save xətası.' }); }
      console.log(`Profil yeniləndi: ${updatedUser.nickname}`);
      res.status(200).json({ message: 'Profil uğurla yeniləndi!', updatedUser: updatedUser }); // Həssas olmayan məlumatları qaytar
    });

  } catch (error) {
    console.error("Profil yeniləmə xətası:", error);
    // Unique constraint xətalarını yoxla
    if (error.code === '23505') {
         if (error.constraint === 'users_email_key') { return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' }); }
         if (error.constraint === 'users_nickname_key') { return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' }); }
    }
    res.status(500).json({ message: 'Server xətası.' });
  }
});


// ----- Default Route -----
// Giriş edilməyibsə loginə, edilibsə oyunlara yönləndirsin
app.get('/', (req, res) => {
    if (req.session && req.session.user && req.session.user.id) {
        res.redirect('/OYUNLAR/oyunlar/oyunlar.html'); // Və ya oyunlar səhifəsinin düzgün yolu
    } else {
        res.redirect('/ANA SEHIFE/login/login.html'); // Və ya login səhifəsinin düzgün yolu
    }
});

// Qalan hissə (Socket.IO) növbəti cavabda...
// server.js (PostgreSQL + DB Session Store ilə Tam Yenilənmiş)
// Hissə 2

// ============================================
// ===== SOCKET.IO HADISƏLƏRİ (EVENTS) ======
// ============================================

// Socket.IO üçün Session Middleware-i istifadə etmək
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

// Socket.IO bağlantılarını yalnız giriş etmiş istifadəçilər üçün qəbul etmək
io.use((socket, next) => {
  // Wrap edilmiş session middleware sayəsində socket.request.session mövcuddur
  if (socket.request.session && socket.request.session.user && socket.request.session.user.nickname) {
    // Session-dakı user məlumatını socket obyektinə əlavə edirik
    socket.user = socket.request.session.user;
    console.log(`Socket üçün user təyin edildi: ${socket.user.nickname}`);
    next(); // Bağlantıya icazə ver
  } else {
    console.warn("Giriş edilməmiş socket bağlantısı rədd edildi.");
    next(new Error('Authentication error')); // Xəta ilə bağlantını rədd et
  }
});

// Yeni Socket Bağlantısı Gəldikdə...
io.on('connection', (socket) => {
  // Artıq istifadəçinin kim olduğunu `socket.user`-dan bilirik
  console.log(`Giriş etmiş istifadəçi qoşuldu: ${socket.user.nickname} (Socket ID: ${socket.id})`);

  // Qoşulan istifadəçini 'users' obyektinə əlavə edirik (socket id ilə)
  users[socket.id] = {
      id: socket.id,
      username: socket.user.nickname, // Sessiondan gələn nickname
      currentRoom: null // Başlanğıcda heç bir otaqda deyil
  };

  // Qoşulan istifadəçiyə mövcud otaq siyahısını göndər
   socket.emit('room_list_update', Object.values(rooms).map(room => ({
       id: room.id,
       name: room.name,
       playerCount: room.players.length,
       hasPassword: !!room.password,
       boardSize: room.boardSize,
       creatorUsername: room.creatorUsername,
       player1Username: room.players[0] ? users[room.players[0]]?.username : null,
       player2Username: room.players[1] ? users[room.players[1]]?.username : null,
   })));

  // ----- Otaq Əməliyyatları -----

  socket.on('create_room', (data) => {
    // user məlumatı artıq socket.user-dadır
    const user = socket.user;
    console.log(`create_room hadisəsi (${user.nickname}):`, data);

    // Validasiyalar
    if (!data || !data.name || data.name.trim().length === 0) { return socket.emit('creation_error', 'Otaq adı boş ola bilməz.'); }
    if (data.password && data.password.length > 0) {
      if (data.password.length < 2 || !(/[a-zA-Z]/.test(data.password) && /\d/.test(data.password))) {
         return socket.emit('creation_error', 'Şifrə tələblərə uyğun deyil (min 2 krk, 1 hərf+1 rəqəm).');
      }
    }
    if (users[socket.id]?.currentRoom) { // Əgər user artıq bir otaqdadırsa
       return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız. Yeni otaq yaratmaq üçün əvvəlcə mövcud otaqdan çıxın.');
    }

    const newRoomId = generateRoomId();
    const newRoom = {
      id: newRoomId,
      name: data.name.trim(),
      password: data.password || null, // Şifrə varsa saxla, yoxsa null
      players: [socket.id], // Yaradan ilk oyunçu kimi əlavə olunur
      boardSize: parseInt(data.boardSize, 10) || 3,
      creatorUsername: user.nickname, // Yaradanın nickname-i
      gameState: null // Oyun vəziyyəti (başlanğıcda null)
    };

    rooms[newRoomId] = newRoom; // Yeni otağı yaddaşdakı siyahıya əlavə et
    users[socket.id].currentRoom = newRoomId; // İstifadəçinin hazırki otağını təyin et
    socket.join(newRoomId); // Socket.IO otağına qoşul

    console.log(`Otaq yaradıldı: ID=${newRoomId}, Adı=${newRoom.name}, Yaradan=${user.nickname}`);

    // Otağı yaradana təsdiq göndər
    socket.emit('room_created', { roomId: newRoomId, roomName: newRoom.name, boardSize: newRoom.boardSize }); // room_created göndəririk
    socket.emit('room_joined', { roomId: newRoomId, roomName: newRoom.name, boardSize: newRoom.boardSize }); // Eyni zamanda qoşulduğunu da bildiririk

    // Bütün qoşulu clientlərə yenilənmiş otaq siyahısını göndər
    broadcastRoomList();
  });

  socket.on('join_room', (data) => {
    const user = socket.user;
    console.log(`join_room hadisəsi (${user.nickname}):`, data);
    const room = rooms[data.roomId];
    const currentUserSocketInfo = users[socket.id];

    // Yoxlamalar
    if (!room) { return socket.emit('join_error', 'Otaq tapılmadı.'); }
    if (currentUserSocketInfo?.currentRoom) { return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.'); }
    if (room.players.length >= 2) { return socket.emit('join_error', 'Otaq doludur.'); }
    if (room.password && room.password !== data.password) { return socket.emit('join_error', 'Şifrə yanlışdır.'); }

    // Otağa qoşulma
    room.players.push(socket.id);
    if(currentUserSocketInfo) currentUserSocketInfo.currentRoom = room.id;
    socket.join(room.id);

    console.log(`İstifadəçi ${user.nickname} (${socket.id}) otağa qoşuldu: ${room.name} (${room.id})`);

    // Qoşulan istifadəçiyə təsdiq göndər
    socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });

    // Otaqdakı digər oyunçuya (əgər varsa) yeni oyunçunun qoşulduğunu bildir
    const opponentSocketId = room.players.find(id => id !== socket.id);
    if (opponentSocketId && io.sockets.sockets.get(opponentSocketId)) { // opponentSocketId varsa və həqiqətən qoşuludursa
      // Qoşulan istifadəçinin nickname-ni göndəririk
      io.to(opponentSocketId).emit('opponent_joined', { username: user.nickname });
       // İkinci oyunçu qoşulduğu üçün ona oyunun başlaması siqnalını da göndərə bilərik
       // Bu, əgər oyun zər atma ilə başlayırsa edilməməlidir. Oyun məntiqinizə bağlıdır.
       // io.to(opponentSocketId).emit('game_start', { /* ... */ });
    } else if (opponentSocketId) {
        console.warn(`Opponent socket (${opponentSocketId}) tapıldı amma aktiv deyil?`);
    }


    // Otaq siyahısını yenilə
    broadcastRoomList();

    // İkinci oyunçu qoşulduqda oyunu başlatmaq üçün siqnal göndər (əgər lazımdırsa)
    if (room.players.length === 2) {
         console.log(`Otaq ${room.id} doldu. Oyun başlama siqnalı göndərilir...`);
         // Otaqdakı hər iki oyunçuya oyunun başlaması və rəqib məlumatlarını göndər
         const player1SocketId = room.players[0];
         const player2SocketId = room.players[1];
         const player1 = users[player1SocketId];
         const player2 = users[player2SocketId];

         if (player1 && io.sockets.sockets.get(player1SocketId)) {
             io.to(player1SocketId).emit('game_start', {
                 opponentName: player2?.username || 'Rəqib',
                 isStarting: true, // İlk qoşulanın başlayıb-başlamadığını burada təyin etmək olar (zər atma ilə həll olunacaq)
                 isAiOpponent: false
              });
         }
         if (player2 && io.sockets.sockets.get(player2SocketId)) {
             io.to(player2SocketId).emit('game_start', {
                 opponentName: player1?.username || 'Rəqib',
                 isStarting: false, // İkinci qoşulan...
                 isAiOpponent: false
              });
         }
    }

  });

  socket.on('leave_room', () => {
    handleDisconnectOrLeave(socket); // Otaqdan ayrılmanı idarə et
  });


  // ----- Oyun Gedişləri -----
  socket.on('make_move', (data) => {
    const user = socket.user;
    const roomId = users[socket.id]?.currentRoom;
    console.log(`make_move hadisəsi: User=${user.nickname}, Room=${roomId}, Data=`, data);

    if (roomId && rooms[roomId] && user) {
      const room = rooms[roomId];
      // Burada əlavə yoxlamalar etmək olar:
      // - Oyun davam edirmi?
      // - Sıra bu oyunçudadırmı?
      // - Göndərilən index keçərlidirmi?
      // - Həmin xana boşdurmu?

      // Gedişi otaqdakı DİGƏR oyunçuya göndər
      socket.to(roomId).emit('opponent_moved', { index: data.index, player: user.nickname }); // player olaraq nickname göndəririk
    } else {
        console.warn("make_move: Keçərsiz otaq və ya user.");
    }
  });

   // Oyunun yenidən başladılması tələbi
   socket.on('request_restart', () => {
      const roomId = users[socket.id]?.currentRoom;
      if (roomId && rooms[roomId]) {
         console.log(`Restart tələbi: Room=${roomId}, User=${socket.user.nickname}`);
         // Tələbi digər oyunçuya göndər
         socket.to(roomId).emit('restart_requested', { requester: socket.user.nickname });
      }
   });

   // Yenidən başlatma tələbinin qəbulu
   socket.on('accept_restart', () => {
       const roomId = users[socket.id]?.currentRoom;
       if (roomId && rooms[roomId]) {
           console.log(`Restart qəbul edildi: Room=${roomId}, User=${socket.user.nickname}`);
           // Hər iki oyunçuya oyunu yenidən başlatma siqnalı göndər
           io.to(roomId).emit('restart_game');
           // Burada server tərəfində də oyun vəziyyətini sıfırlamaq lazım ola bilər
           // rooms[roomId].gameState = null; // Məsələn
        }
   });


  // ----- Bağlantı Kəsildikdə -----
  socket.on('disconnect', (reason) => {
    console.log(`İstifadəçi ayrıldı: ${socket.user?.nickname || socket.id}. Səbəb: ${reason}`);
    handleDisconnectOrLeave(socket); // Bağlantı kəsilməsini idarə et
  });

  // ----- Otaqdan Ayrılma / Bağlantı Kəsilmə Funksiyası -----
  function handleDisconnectOrLeave(socketInstance) {
    const userSocketInfo = users[socketInstance.id];
    if (!userSocketInfo) return; // Əgər users obyektində yoxdursa (məs. qeydiyyat tam bitməmiş ayrılıbsa)

    const roomId = userSocketInfo.currentRoom;
    const username = userSocketInfo.username;

    // İstifadəçini 'users' obyektindən sil
    delete users[socketInstance.id];

    // Əgər bir otaqda idisə
    if (roomId && rooms[roomId]) {
      console.log(`${username} ${roomId} otağından ayrılır/çıxarılır...`);
      // Oyunçunu otaqdan çıxar
      rooms[roomId].players = rooms[roomId].players.filter(id => id !== socketInstance.id);
      const room = rooms[roomId];

      // Əgər otaq boş qaldısa, otağı sil
      if (room.players.length === 0) {
        console.log(`Otaq ${roomId} ('${room.name}') boş qaldı və silinir.`);
        delete rooms[roomId];
      } else {
        // Əgər otaqda başqa oyunçu qaldısa, ona rəqibin ayrıldığını bildir
        const remainingPlayerId = room.players[0];
        if (io.sockets.sockets.get(remainingPlayerId)) { // Qalan oyunçu hələ də qoşuludursa
            io.to(remainingPlayerId).emit('opponent_left_game', { username: username }); // opponent_left_game göndəririk
             // Oyun vəziyyətini də sıfırlamaq lazım ola bilər
             // Məsələn, qalan oyunçunu təkrar lobbiyə göndərmək və ya AI təklif etmək
        }
         // Əgər ayrılan oyunçu otağın yaradanı idisə, yaradanı dəyişmək olar (opsional)
         // if (room.creatorUsername === username) { room.creatorUsername = users[remainingPlayerId]?.username || 'Naməlum'; }
      }
      // Otaq siyahısını bütün clientlərə yenilə
      broadcastRoomList();
    } else {
        console.log(`${username} heç bir otaqda deyildi.`);
    }
  }

}); // io.on('connection', ...) sonu

// ----- Serveri Başlatma -----
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`---- Server ${PORT} portunda işə düşdü ----`);
    console.log(`---- Statik fayllar ${publicDirectoryPath} qovluğundan təqdim edilir ----`);
    console.log(`---- Session Secret ${process.env.SESSION_SECRET ? 'yükləndi' : 'YÜKLƏNMƏDİ (!)'} ----`);
    console.log(`---- Database URL ${process.env.DATABASE_URL ? 'yükləndi' : 'YÜKLƏNMƏDİ (!)'} ----`);
});