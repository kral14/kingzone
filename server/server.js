// server.js (v7 - Tam Kod + Regenerate + Ətraflı Log)
// HİSSƏ 1/3

// ---- Əsas Modulların Import Edilməsi ----
require('dotenv').config(); // .env faylı ən başda yüklənməlidir!
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg'); // PostgreSQL Client
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session); // PG Session Store

console.log("========================================");
console.log("---- Server Başlatma Prosesi Başladı ----");
console.log(`---- Zaman: ${new Date().toISOString()} ----`);
console.log("========================================");


// ---- Mühit Dəyişənlərini Yoxlamaq ----
console.log("[ENV Check] DATABASE_URL yüklənib?", !!process.env.DATABASE_URL);
console.log("[ENV Check] SESSION_SECRET yüklənib?", !!process.env.SESSION_SECRET);
if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
    console.error("!!! KRİTİK XƏTA: DATABASE_URL və ya SESSION_SECRET mühit dəyişəni təyin edilməyib!");
    console.error("!!! .env faylını və ya Render Environment Variables bölməsini yoxlayın.");
    process.exit(1); // Tətbiqi dayandır
}

// ---- Express, HTTP Server, Socket.IO Quraşdırması ----
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] } // CORS ayarları (Production üçün daha dəqiq ayarlayın)
});
console.log("[Setup] Express, HTTP Server və Socket.IO yaradıldı.");

// ---- PostgreSQL Bağlantı Pool-u ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Render üçün adətən lazımdır
  }
});

// Pool-un ilk bağlantısını yoxlayaq
pool.query('SELECT NOW()')
  .then(res => console.log(`---- Verilənlər bazasına uğurla qoşuldu: ${res.rows[0].now} ----`))
  .catch(err => {
      console.error('!!! Verilənlər bazasına qoşulma zamanı İLK XƏTA:', err.stack);
      console.error('!!! DATABASE_URL düzgünlüyünü və DB statusunu yoxlayın!');
  });

// Pool üçün ümumi xəta dinləyicisi
pool.on('error', (err, client) => {
  console.error('!!! PostgreSQL Pool XƏTASI:', err);
});
console.log("[Setup] PostgreSQL connection pool yaradıldı.");


// ---- Session Middleware (PostgreSQL Store ilə) ----
const sessionMiddleware = session({
  store: new pgSession({
    pool : pool,                // Yaradılmış pool-u veririk
    tableName : 'user_sessions', // DB-dəki sessiya cədvəlinin adı
    pruneSessionInterval: 60 * 60 // Hər saat köhnə sessiyaları təmizlə (saniyə) - optional
  }),
  secret: process.env.SESSION_SECRET,
  resave: false, // Sessiya dəyişməyibsə yenidən save etmə
  saveUninitialized: false, // Boş sessiyaları save etmə
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Yalnız HTTPS ilə göndər
    httpOnly: true, // JavaScript-in cookie-yə çıxışını əngəllə
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 gün (millisaniyə)
    sameSite: 'lax' // CSRF üçün standart qoruma
  }
});
app.use(sessionMiddleware); // Sessiya middleware-i BÜTÜN route-lardan ƏVVƏL tətbiq et!
console.log("[Setup] Session middleware (pgSession ilə) konfiqurasiya edildi və tətbiq olundu.");

// ---- Digər Express Middleware-lər ----
app.use(express.json()); // Gələn JSON request body-lərini parse et
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath)); // Statik faylları təqdim et
console.log(`[Setup] JSON parser və Static files middleware tətbiq edildi. Statik qovluq: ${publicDirectoryPath}`);

// ---- Autentifikasiya Yoxlama Middleware ----
const isAuthenticated = (req, res, next) => {
  const path = req.originalUrl || req.path;
  console.log(`[isAuthenticated] Yoxlanılır: Path=${path}, SessionID=${req.sessionID}`);
  if (req.session && req.session.user && req.session.user.id) {
    console.log(`[isAuthenticated] UĞURLU: User=${req.session.user.nickname}, Path=${path}`);
    next();
  } else {
    console.warn(`[isAuthenticated] UĞURSUZ: Giriş tələb olunur. Path=${path}, SessionID=${req.sessionID}, SessionUserVar=${!!req.session?.user}`);
    res.status(401).json({ message: 'Bu əməliyyat üçün giriş tələb olunur.' });
  }
};

// ----- Yardımçı Funksiyalar -----
let rooms = {}; // Otaqlar yaddaşda
let users = {}; // Qoşulu socketlər yaddaşda
const saltRounds = 10; // bcrypt üçün

function generateRoomId() { return Math.random().toString(36).substring(2, 9); }
function broadcastRoomList() {
    try {
        const roomListForClients = Object.values(rooms).map(room => {
             const p1Socket = room.players[0]; const p2Socket = room.players[1];
             return { id: room.id, name: room.name, playerCount: room.players.length, hasPassword: !!room.password, boardSize: room.boardSize, creatorUsername: room.creatorUsername,
                 player1Username: p1Socket && users[p1Socket] ? users[p1Socket].username : null,
                 player2Username: p2Socket && users[p2Socket] ? users[p2Socket].username : null, }; });
        io.emit('room_list_update', roomListForClients);
    } catch (error) { console.error("[broadcastRoomList] XƏTA:", error); }
}

// ==========================================
// ===== HTTP API MARŞRUTLARI (ROUTES) ======
// ==========================================
console.log("[Setup] API Endpointləri təyin edilir...");

// ----- Qeydiyyat Endpoint-i (/register) -----
app.post('/register', async (req, res) => {
  const { password: plainPassword, ...safeBody } = req.body;
  console.log(`[API /register] Sorğu alındı:`, safeBody);
  const { fullName, email, nickname } = safeBody;

  // Validasiyalar
  if (!fullName || !email || !nickname || !plainPassword) { console.warn("[API /register] Validasiya Xətası: Boş sahələr."); return res.status(400).json({ message: 'Bütün sahələr doldurulmalıdır.' }); }
  if (plainPassword.length < 6) { console.warn("[API /register] Validasiya Xətası: Şifrə qısadır."); return res.status(400).json({ message: 'Şifrə minimum 6 simvol olmalıdır.' }); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.warn("[API /register] Validasiya Xətası: Email formatı səhvdir."); return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
  if (/\s/.test(nickname)) { console.warn("[API /register] Validasiya Xətası: Nickname-də boşluq."); return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }

  let client;
  try {
    client = await pool.connect();
    console.log("[API /register] DB bağlantısı alındı.");

    // Unikallıq yoxlaması
    const emailCheck = await client.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email]);
    if (emailCheck.rowCount > 0) { console.warn(`[API /register] Email mövcuddur: ${email}`); return res.status(409).json({ message: 'Bu e-poçt artıq qeydiyyatdan keçib.' }); }
    const nicknameCheck = await client.query('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) LIMIT 1', [nickname]);
    if (nicknameCheck.rowCount > 0) { console.warn(`[API /register] Nickname mövcuddur: ${nickname}`); return res.status(409).json({ message: 'Bu nickname artıq istifadə olunur.' }); }

    // Hashləmə və DB-yə yazma
    console.log(`[API /register] ${nickname} üçün şifrə hashlanır...`);
    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
    const newUserId = Date.now().toString();
    const insertQuery = `INSERT INTO users (id, full_name, email, nickname, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, nickname;`;
    const values = [newUserId, fullName, email, nickname, hashedPassword];
    console.log(`[API /register] İstifadəçi DB-yə yazılır: ${nickname}`);
    const result = await client.query(insertQuery, values);

    console.log(`[API /register] UĞURLU: İstifadəçi yaradıldı:`, result.rows[0]);
    res.status(201).json({ message: 'Qeydiyyat uğurlu oldu!' });

  } catch (error) {
    console.error("[API /register] Gözlənilməz XƏTA:", error);
    if (error.code === '23505') { /* ... unique constraint xətaları ... */ }
    res.status(500).json({ message: 'Server xətası baş verdi.' });
  } finally {
      if (client) { client.release(); console.log("[API /register] DB bağlantısı buraxıldı."); }
  }
});

// ----- Giriş Endpoint-i (/login) - Regenerate ilə -----
app.post('/login', async (req, res) => {
  const { password: plainPassword, ...safeBody } = req.body;
  console.log(`[API /login] Sorğu alındı:`, safeBody);
  const { nickname } = safeBody;

  if (!nickname || !plainPassword) { console.warn("[API /login] Validasiya Xətası: Nickname/şifrə boşdur."); return res.status(400).json({ message: 'Nickname və şifrə daxil edilməlidir.' }); }

  let client;
  try {
    client = await pool.connect();
    console.log("[API /login] DB bağlantısı alındı.");

    // İstifadəçini tap
    console.log(`[API /login] İstifadəçi axtarılır: ${nickname}`);
    const result = await client.query('SELECT * FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);
    if (result.rowCount === 0) {
        console.warn(`[API /login] İstifadəçi tapılmadı: ${nickname}`);
        if (client) client.release();
        return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
    }
    const user = result.rows[0];
    console.log(`[API /login] İstifadəçi tapıldı: ${user.nickname} (ID: ${user.id})`);

    // Şifrəni yoxla
    console.log(`[API /login] Şifrə yoxlanılır...`);
    const isPasswordCorrect = await bcrypt.compare(plainPassword, user.password_hash);
    if (!isPasswordCorrect) {
        console.warn(`[API /login] Şifrə yanlışdır: ${nickname}`);
        if (client) client.release();
        return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
    }
    console.log(`[API /login] Şifrə doğrudur.`);

    // Sessionu Yenidən Yarat (Regenerate)
    const oldSessionId = req.sessionID;
    console.log(`[API /login] Session regenerate edilir... Köhnə SessionID=${oldSessionId}`);
    req.session.regenerate((err) => {
        if (err) {
            console.error("[API /login] Session regenerate XƏTASI:", err);
            if (client) { client.release(); console.log("[API /login] DB bağlantısı regenerate xətasından sonra buraxıldı."); }
            return res.status(500).json({ message: 'Sessiya yaradılarkən daxili xəta baş verdi.' });
        }

        // Regenerate uğurlu, user datasını YENİ sessiyaya əlavə et
        const newSessionId = req.sessionID;
        console.log(`[API /login] Regenerate uğurlu. Yeni SessionID=${newSessionId}. User datası əlavə edilir...`);
        req.session.user = { id: user.id, nickname: user.nickname, fullName: user.full_name };

        console.log(`[API /login] UĞURLU: İstifadəçi giriş etdi: ${user.nickname}. Yeni sessiya yaradıldı (ID: ${newSessionId}).`);
        res.status(200).json({ message: 'Giriş uğurlu!', nickname: user.nickname });

        if (client) { client.release(); console.log("[API /login] DB bağlantısı regenerate callback içində buraxıldı."); }
    }); // req.session.regenerate sonu

  } catch (error) {
    console.error("[API /login] Gözlənilməz XƏTA (Try Catch Bloku):", error);
    if (client) { client.release(); console.log("[API /login] DB bağlantısı catch blokunda buraxıldı."); }
    res.status(500).json({ message: 'Server xətası baş verdi.' });
  }
});

// ----- Hələlik Bu Qədər (Hissə 1) -----
// server.js (v7 - Tam Kod + Regenerate + Ətraflı Log)
// HİSSƏ 2/3

// ----- Çıxış Endpoint-i (/logout) -----
app.post('/logout', (req, res) => {
  const sessionId = req.sessionID;
  const userNickname = req.session.user?.nickname; // Sessiyada user varsa, nickname alırıq

  console.log(`[API /logout] Sorğu alındı. SessionID=${sessionId}, User=${userNickname || 'N/A'}`);

  if (req.session.user) {
    // Sessiyanı məhv et (DB-dən siləcək)
    req.session.destroy(err => {
      if (err) {
        console.error(`[API /logout] Session destroy XƏTASI. SessionID=${sessionId}:`, err);
        // Sessiya silinməsə belə, cookie-ni təmizləməyə cəhd edək
        const cookieName = req.session?.cookie?.name || 'connect.sid';
        res.clearCookie(cookieName);
        return res.status(500).json({ message: "Çıxış zamanı xəta baş verdi." });
      }

      // Sessiya uğurla silindi, indi cookie-ni brauzerdən təmizlə
      // Cookie adını session konfiqurasiyasından götürək, tapılmasa 'connect.sid' istifadə edək
      const cookieName = 'connect.sid'; // express-session üçün default ad (əgər config-də name təyin edilməyibsə)
      // const cookieName = sessionMiddleware.cookie.name || 'connect.sid'; // Bu daha doğru olardı, amma sessionMiddleware əlçatan olmaya bilər
      res.clearCookie(cookieName);
      console.log(`[API /logout] UĞURLU: User: ${userNickname}. SessionID=${sessionId} silindi. Cookie '${cookieName}' təmizləndi.`);
      res.status(200).json({ message: "Uğurla çıxış edildi." });
    });
  } else {
    // Giriş edilməmiş istifadəçi çıxış etməyə çalışır
    console.warn(`[API /logout] Çıxış üçün aktiv sessiya tapılmadı. SessionID=${sessionId}`);
    res.clearCookie('connect.sid'); // Hər ehtimala qarşı standart cookie-ni təmizlə
    res.status(400).json({ message: "Giriş edilməyib." });
  }
});

// ----- Autentifikasiya Vəziyyətini Yoxlama Endpoint-i (/check-auth) -----
// Bu endpoint frontend tərəfindən səhifə yüklənəndə çağırılır
app.get('/check-auth', (req, res) => {
  // Ətraflı logging
  console.log('--- /check-auth sorğusu gəldi ---');
  console.log('Sorğu üçün Session ID:', req.sessionID);
  console.log('Server req.session obyektini görür mü?', !!req.session);
  console.log('Server req.session.user obyektini görür mü?', !!req.session?.user);
  if (req.session?.user) {
      console.log('Serverin gördüyü Session user datası:', req.session.user);
  } else {
      console.log('Server session və ya user datasını bu sorğu üçün tapa bilmir!');
  }
  console.log('--------------------------------');

  // Sessiya və içində user məlumatı varsa, uğurlu cavab qaytar
  if (req.session && req.session.user && req.session.user.id) {
    console.log(`[/check-auth] Cavab: Uğurlu (200). User: ${req.session.user.nickname}`);
    // Frontend-in ehtiyacı olan user məlumatlarını qaytarırıq (şifrəsiz)
    res.status(200).json({ loggedIn: true, user: req.session.user }); // Tam user datasını göndəririk
  } else {
    // Sessiya yoxdursa və ya user məlumatı yoxdursa, 401 qaytar
    console.warn(`[/check-auth] Cavab: Uğursuz (401). SessionID=${req.sessionID}`);
    res.status(401).json({ loggedIn: false });
  }
});


// ==========================================
// ===== Profil API Endpointləri ==========
// ==========================================
console.log("[Setup] Profil API endpointləri təyin edilir...");

// ----- Profil Məlumatlarını Almaq Endpoint-i (/profile/:nickname) -----
app.get('/profile/:nickname', isAuthenticated, async (req, res) => { // isAuthenticated middleware istifadə edirik
  const requestedNickname = req.params.nickname;
  const loggedInUserId = req.session.user.id; // Artıq isAuthenticated təmin edir ki, bunlar var
  const loggedInNickname = req.session.user.nickname;
  console.log(`[API GET /profile/${requestedNickname}] Sorğu alındı. Login: ${loggedInNickname} (ID: ${loggedInUserId})`);

  // Təhlükəsizlik yoxlaması (URL vs Session)
  if (loggedInNickname.toLowerCase() !== requestedNickname.toLowerCase()) {
    console.warn(`[API GET /profile/${requestedNickname}] İCAZƏ XƏTASI: ${loggedInNickname} başqasının profilinə baxmağa çalışır.`);
    return res.status(403).json({ message: 'Başqasının profilinə baxmaq icazəsi yoxdur.' });
  }

  let client;
  try {
    client = await pool.connect();
    console.log(`[API GET /profile/${requestedNickname}] DB bağlantısı alındı.`);
    // İstifadəçini DB-dən al (şifrəsiz) - ID ilə axtarmaq daha etibarlıdır
    const result = await client.query(
      'SELECT id, full_name, email, nickname FROM users WHERE id = $1',
      [loggedInUserId]
    );

    if (result.rowCount > 0) {
      const userProfile = result.rows[0];
      console.log(`[API GET /profile/${requestedNickname}] UĞURLU: Profil tapıldı:`, userProfile);
      res.status(200).json(userProfile);
    } else {
      console.error(`[API GET /profile/${requestedNickname}] XƏTA: İstifadəçi DB-də tapılmadı (ID: ${loggedInUserId}).`);
      res.status(404).json({ message: 'İstifadəçi tapılmadı.' });
    }
  } catch(error) {
    console.error(`[API GET /profile/${requestedNickname}] Gözlənilməz XƏTA:`, error);
    res.status(500).json({ message: 'Server xətası baş verdi.' });
  } finally {
      if (client) { client.release(); console.log(`[API GET /profile/${requestedNickname}] DB bağlantısı buraxıldı.`); }
  }
});

// ----- Profil Məlumatlarını Yeniləmək Endpoint-i (/profile/:nickname) -----
app.put('/profile/:nickname', isAuthenticated, async (req, res) => {
  const currentNicknameFromParam = req.params.nickname;
  const loggedInUserId = req.session.user.id;
  const loggedInNickname = req.session.user.nickname;

  const { password: plainPassword, ...safeBody } = req.body; // Şifrəni logdan çıxar
  console.log(`[API PUT /profile/${currentNicknameFromParam}] Sorğu alındı. Login: ${loggedInNickname} (ID: ${loggedInUserId}). Body:`, safeBody);

  const { fullName, email, nickname: newNickname } = safeBody; // Yeni dəyərlər

  // Təhlükəsizlik yoxlaması
  if (loggedInNickname.toLowerCase() !== currentNicknameFromParam.toLowerCase()) {
      console.warn(`[API PUT /profile/${currentNicknameFromParam}] İCAZƏ XƏTASI: ${loggedInNickname} başqasının profilini dəyişməyə çalışır.`);
      return res.status(403).json({ message: 'Başqasının profilini dəyişməyə icazə yoxdur.' });
  }

  // Validasiyalar
  if (!fullName || !email || !newNickname) { console.warn(`[API PUT /profile/${currentNicknameFromParam}] Validasiya: Boş sahə var.`); return res.status(400).json({ message: 'Ad Soyad, E-poçt və Nickname boş ola bilməz.' }); }
  if (/\s/.test(newNickname)) { console.warn(`[API PUT /profile/${currentNicknameFromParam}] Validasiya: Nickname-də boşluq var.`); return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.warn(`[API PUT /profile/${currentNicknameFromParam}] Validasiya: Email formatı səhvdir.`); return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
  if (plainPassword && plainPassword.length < 6) { console.warn(`[API PUT /profile/${currentNicknameFromParam}] Validasiya: Yeni şifrə çox qısadır.`); return res.status(400).json({ message: 'Yeni şifrə minimum 6 simvol olmalıdır.' }); }

  let client;
  try {
    client = await pool.connect();
    console.log(`[API PUT /profile/${currentNicknameFromParam}] DB bağlantısı alındı.`);

    // Unikallıq yoxlaması (email və yeni nickname üçün - özündən başqa)
    const emailExists = await client.query('SELECT 1 FROM users WHERE email = $1 AND id != $2 LIMIT 1', [email, loggedInUserId]);
    if (emailExists.rowCount > 0) { console.warn(`[API PUT /profile/${currentNicknameFromParam}] Email (${email}) başqasına aiddir.`); return res.status(409).json({ message: 'Bu e-poçt başqa istifadəçi tərəfindən istifadə olunur.' }); }

    if (newNickname.toLowerCase() !== loggedInNickname.toLowerCase()) {
      const nicknameExists = await client.query('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) AND id != $2 LIMIT 1', [newNickname, loggedInUserId]);
      if (nicknameExists.rowCount > 0) { console.warn(`[API PUT /profile/${currentNicknameFromParam}] Nickname (${newNickname}) başqasına aiddir.`); return res.status(409).json({ message: 'Bu nickname artıq başqası tərəfindən istifadə olunur.' }); }
    }

    // UPDATE sorğusunu hazırla
    let updateFields = ['full_name = $1', 'email = $2', 'nickname = $3'];
    let queryParams = [fullName, email, newNickname];
    let paramIndex = 4;

    if (plainPassword) { // Yeni şifrə varsa hashla və əlavə et
      console.log(`[API PUT /profile/${currentNicknameFromParam}] Yeni şifrə hashlanır...`);
      const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
      updateFields.push(`password_hash = $${paramIndex}`);
      queryParams.push(hashedPassword);
      paramIndex++;
    }

    const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id, full_name, email, nickname;`;
    queryParams.push(loggedInUserId);

    // Sorğunu icra et
    console.log(`[API PUT /profile/${currentNicknameFromParam}] DB UPDATE sorğusu icra edilir...`);
    const result = await client.query(updateQuery, queryParams);

    if (result.rowCount === 0) { console.error(`[API PUT /profile/${currentNicknameFromParam}] XƏTA: User DB-də tapılmadı (ID: ${loggedInUserId})`); return res.status(404).json({ message: 'Yenilənəcək istifadəçi tapılmadı.' }); }
    const updatedUser = result.rows[0];
    console.log(`[API PUT /profile/${currentNicknameFromParam}] DB yeniləndi. Yenilənmiş data:`, {id: updatedUser.id, nickname: updatedUser.nickname});

    // Sessionu yenilə
    console.log(`[API PUT /profile/${currentNicknameFromParam}] Sessiya yenilənir... SessionID=${req.sessionID}`);
    req.session.user.nickname = updatedUser.nickname;
    req.session.user.fullName = updatedUser.full_name;
    // Email də sessiyada saxlanılırsa, onu da yenilə: req.session.user.email = updatedUser.email;

    req.session.save((err) => {
      if (err) { console.error(`[API PUT /profile/${currentNicknameFromParam}] Session save XƏTASI:`, err); return res.status(500).json({ message: 'Profil DB-də yeniləndi, lakin session save xətası.' }); }
      console.log(`[API PUT /profile/${currentNicknameFromParam}] UĞURLU: Profil və Sessiya yeniləndi.`);
      res.status(200).json({ message: 'Profil uğurla yeniləndi!', updatedUser: updatedUser });
    });

  } catch (error) {
    console.error(`[API PUT /profile/${currentNicknameFromParam}] Gözlənilməz XƏTA:`, error);
    if (error.code === '23505') { /* ... unique constraint xətaları ... */ }
    res.status(500).json({ message: 'Server xətası baş verdi.' });
  } finally {
    if (client) { client.release(); console.log(`[API PUT /profile/${currentNicknameFromParam}] DB bağlantısı buraxıldı.`); }
  }
});

// ----- Default Kök Route (/) -----
app.get('/', (req, res) => {
    console.log(`[API GET /] Kök route sorğusu. SessionID=${req.sessionID}, User=${req.session.user?.nickname || 'N/A'}`);
    if (req.session && req.session.user && req.session.user.id) {
        console.log("[API GET /] Aktiv sessiya var, oyunlara yönləndirilir.");
        res.redirect('/OYUNLAR/oyunlar/oyunlar.html'); // Düzgün yol
    } else {
        console.log("[API GET /] Aktiv sessiya yoxdur, loginə yönləndirilir.");
        res.redirect('/ANA SEHIFE/login/login.html'); // Düzgün yol
    }
});

// ----- Hələlik Bu Qədər (Hissə 2) -----
// server.js (v7 - Tam Kod + Regenerate + Ətraflı Log)
// HİSSƏ 3/3

// ============================================
// ===== SOCKET.IO Quraşdırması və Hadisələr ==
// ============================================
console.log("[Setup] Socket.IO konfiqurasiyası başlayır...");

// Socket.IO üçün Session Middleware-i istifadə etmək
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
console.log("[Setup] Socket.IO üçün session middleware tətbiq edildi.");

// Socket.IO bağlantılarını yalnız giriş etmiş istifadəçilər üçün qəbul etmək (Ətraflı Logging ilə)
io.use((socket, next) => {
  const session = socket.request.session;

  console.log('--- Socket Auth Middleware Başladı ---');
  console.log('Socket ID:', socket.id);
  console.log('Socket sorğusunda session varmi?', !!session);

  if (session) {
      console.log('Socket sorğusundakı Session ID:', session.id);
      console.log('Socket sorğusunda session.user varmi?', !!session.user);

      if (session.user) {
          console.log('Socket sorğusundakı Session User Datası:', session.user);
          if (session.user.id && session.user.nickname) { // ID və Nickname yoxlayaq
              socket.user = session.user; // User məlumatını socket obyektinə yaz
              console.log(`[Socket Auth] UĞURLU: User ${socket.user.nickname} (ID: ${socket.user.id}) üçün bağlantıya icazə verildi.`);
              next(); // Bağlantıya icazə ver
          } else {
              console.warn('[Socket Auth] UĞURSUZ: session.user tapıldı, amma id və ya nickname əskikdir.');
              next(new Error('Authentication error: Incomplete session data'));
          }
      } else {
          console.warn('[Socket Auth] UĞURSUZ: session tapıldı, amma session.user yoxdur.');
          next(new Error('Authentication error: User data missing in session'));
      }
  } else {
      console.warn('[Socket Auth] UĞURSUZ: Socket sorğusunda session tapılmadı.');
      next(new Error('Authentication error: No session'));
  }
  console.log('--- Socket Auth Middleware Bitdi ---');
});

// Yeni Socket Bağlantısı Gəldikdə...
io.on('connection', (socket) => {
  // io.use() middleware sayəsində bura gələn socket-in 'user' məlumatı olmalıdır.
  if (!socket.user) {
      console.error(`!!! KRİTİK XƏTA: Autentifikasiyadan keçmiş socket üçün socket.user tapılmadı! Socket ID: ${socket.id}`);
      socket.disconnect(true); // Bağlantını dərhal kəs
      return;
  }
  console.log(`[Socket Connected] User: ${socket.user.nickname} (ID: ${socket.id}) qoşuldu.`);

  // Qoşulan istifadəçini yaddaşdakı 'users' obyektinə əlavə et
  users[socket.id] = {
      id: socket.id,
      username: socket.user.nickname, // Sessiondan gələn nickname
      currentRoom: null
  };
  console.log(`[Socket Users] Aktiv istifadəçilər: ${Object.keys(users).length}. Yeni: ${socket.user.nickname}`);

  // Qoşulan istifadəçiyə mövcud otaq siyahısını göndər
  try {
      const currentRoomList = Object.values(rooms).map(room => ({
           id: room.id, name: room.name, playerCount: room.players.length, hasPassword: !!room.password, boardSize: room.boardSize, creatorUsername: room.creatorUsername,
           player1Username: room.players[0] && users[room.players[0]] ? users[room.players[0]].username : null,
           player2Username: room.players[1] && users[room.players[1]] ? users[room.players[1]].username : null, }));
       socket.emit('room_list_update', currentRoomList);
       console.log(`[Socket Emit] 'room_list_update' göndərildi ${socket.user.nickname}-ə. ${currentRoomList.length} otaq var.`);
   } catch (emitError) { console.error(`[Socket Emit] 'room_list_update' xətası (${socket.user.nickname}):`, emitError); }

  // ----- Otaq Əməliyyatları -----

  socket.on('create_room', (data) => {
    const user = socket.user;
    console.log(`[Socket On] 'create_room' alındı. User: ${user.nickname}, Data:`, data);
    if (!user) { console.error("create_room: socket.user tapılmadı!"); return socket.emit('creation_error','Sessiya xətası.');}

    if (!data || !data.name || data.name.trim().length === 0) { console.warn(`[create_room] Keçərsiz data: Ad boşdur.`); return socket.emit('creation_error', 'Otaq adı boş ola bilməz.'); }
    if (data.password && (data.password.length < 2 || !(/[a-zA-Z]/.test(data.password) && /\d/.test(data.password)))) { console.warn(`[create_room] Keçərsiz şifrə formatı.`); return socket.emit('creation_error', 'Şifrə tələblərə uyğun deyil.'); }
    if (users[socket.id]?.currentRoom) { console.warn(`[create_room] User ${user.nickname} artıq ${users[socket.id].currentRoom} otağındadır.`); return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız.'); }

    const newRoomId = generateRoomId();
    const newRoom = { id: newRoomId, name: data.name.trim(), password: data.password || null, players: [socket.id], boardSize: parseInt(data.boardSize, 10) || 3, creatorUsername: user.nickname, gameState: null };
    rooms[newRoomId] = newRoom;
    users[socket.id].currentRoom = newRoomId;
    socket.join(newRoomId);
    console.log(`[create_room] Otaq yaradıldı: ID=${newRoomId}, Adı=${newRoom.name}, Yaradan=${user.nickname}`);
    socket.emit('room_created', { roomId: newRoomId, roomName: newRoom.name, boardSize: newRoom.boardSize });
    socket.emit('room_joined', { roomId: newRoomId, roomName: newRoom.name, boardSize: newRoom.boardSize });
    broadcastRoomList();
  });

  socket.on('join_room', (data) => {
    const user = socket.user;
    console.log(`[Socket On] 'join_room' alındı. User: ${user.nickname}, Data:`, data);
    if (!user) { console.error("join_room: socket.user tapılmadı!"); return socket.emit('join_error','Sessiya xətası.');}
    const room = data ? rooms[data.roomId] : null;
    const currentUserSocketInfo = users[socket.id];

    if (!data || !data.roomId) { console.warn(`[join_room] Keçərsiz data: roomId yoxdur.`); return socket.emit('join_error', 'Otaq ID göndərilmədi.'); }
    if (!room) { console.warn(`[join_room] Otaq tapılmadı: ID=${data.roomId}`); return socket.emit('join_error', 'Otaq tapılmadı.'); }
    if (currentUserSocketInfo?.currentRoom) { console.warn(`[join_room] User ${user.nickname} artıq ${currentUserSocketInfo.currentRoom} otağındadır.`); return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.'); }
    if (room.players.includes(socket.id)) { console.warn(`[join_room] User ${user.nickname} artıq bu ${data.roomId} otağındadır.`); return socket.emit('join_error', 'Siz artıq bu otaqdasınız.');}
    if (room.players.length >= 2) { console.warn(`[join_room] Otaq dolu: ID=${data.roomId}`); return socket.emit('join_error', 'Otaq doludur.'); }
    if (room.password && room.password !== data.password) { console.warn(`[join_room] Yanlış şifrə: ID=${data.roomId}`); return socket.emit('join_error', 'Şifrə yanlışdır.'); }

    // Qoşulma
    room.players.push(socket.id);
    if(currentUserSocketInfo) currentUserSocketInfo.currentRoom = room.id; else console.error("!!! join_room: currentUserSocketInfo tapılmadı!");
    socket.join(room.id);
    console.log(`[join_room] User ${user.nickname} (${socket.id}) ${room.name} (${room.id}) otağına qoşuldu.`);
    socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });

    // Rəqibə xəbər ver və siyahını yenilə
    const opponentSocketId = room.players.find(id => id !== socket.id);
    if (opponentSocketId && io.sockets.sockets.get(opponentSocketId)) {
        console.log(`[join_room] Rəqibə (${opponentSocketId}) ${user.nickname}-in qoşulduğu bildirilir.`);
        io.to(opponentSocketId).emit('opponent_joined', { username: user.nickname });
    }
    broadcastRoomList();

    // Oyun başlama siqnalı (əgər 2 oyunçu varsa)
    if (room.players.length === 2) {
        const player1 = users[room.players[0]]; const player2 = users[room.players[1]];
        console.log(`[join_room] Otaq doldu (${room.id}). Oyun başlama siqnalları: P1=${player1?.username}, P2=${player2?.username}`);
        // Server tərəfindən rəqib məlumatları ilə game_start göndərilir
        if (player1 && io.sockets.sockets.get(player1.id)) { io.to(player1.id).emit('game_start', { opponentName: player2?.username || 'Rəqib', isAiOpponent: false }); }
        if (player2 && io.sockets.sockets.get(player2.id)) { io.to(player2.id).emit('game_start', { opponentName: player1?.username || 'Rəqib', isAiOpponent: false }); }
    }
  });

  socket.on('leave_room', () => {
    console.log(`[Socket On] 'leave_room' alındı. User: ${socket.user?.nickname || socket.id}`);
    handleDisconnectOrLeave(socket);
  });

  // ----- Oyun Gedişləri -----
  socket.on('make_move', (data) => {
    const user = socket.user;
    const roomId = users[socket.id]?.currentRoom;
    if (!user) { console.error("make_move: socket.user tapılmadı!"); return; }
    if (!data || typeof data.index !== 'number' || data.index < 0) { console.warn(`[make_move] Keçərsiz data. User: ${user.nickname}, Data:`, data); return; }
    console.log(`[Socket On] 'make_move' alındı. User: ${user.nickname}, Room: ${roomId}, Index: ${data.index}`);
    if (roomId && rooms[roomId] && rooms[roomId].players.includes(socket.id)) {
      // Server tərəfi validasiyası burada olmalıdır!
      console.log(`[make_move] Gediş ${roomId} otağına göndərilir (göndərən: ${user.nickname}).`);
      socket.to(roomId).emit('opponent_moved', { index: data.index, player: user.nickname });
    } else { console.warn(`[make_move] Keçərsiz otaq/user və ya user otaqda deyil.`); }
  });

   // ----- Oyun Yenidən Başlatma -----
   socket.on('request_restart', () => {
      const roomId = users[socket.id]?.currentRoom;
      const user = socket.user;
      if (!user) { console.error("request_restart: socket.user tapılmadı!"); return; }
      if (roomId && rooms[roomId]) {
         console.log(`[Socket On] 'request_restart' alındı. Room=${roomId}, User=${user.nickname}`);
         socket.to(roomId).emit('restart_requested', { requester: user.nickname });
      } else { console.warn(`[request_restart] User ${user.nickname} heç bir otaqda deyil.`);}
   });
   socket.on('accept_restart', () => {
       const roomId = users[socket.id]?.currentRoom;
       const user = socket.user;
       if (!user) { console.error("accept_restart: socket.user tapılmadı!"); return; }
       if (roomId && rooms[roomId]) {
           console.log(`[Socket On] 'accept_restart' alındı. Room=${roomId}, User=${user.nickname}`);
           io.to(roomId).emit('restart_game');
        } else { console.warn(`[accept_restart] User ${user.nickname} heç bir otaqda deyil.`);}
   });

  // ----- Bağlantı Kəsilməsi -----
  socket.on('disconnect', (reason) => {
    console.log(`[Socket Disconnected] User: ${socket.user?.nickname || socket.id} ayrıldı. Səbəb: ${reason}`);
    handleDisconnectOrLeave(socket);
  });

  // ----- Otaqdan Ayrılma / Bağlantı Kəsilmə üçün Ümumi Funksiya -----
  function handleDisconnectOrLeave(socketInstance) {
    const userSocketInfo = users[socketInstance.id];
    if (!userSocketInfo) { console.warn(`[handleDisconnect] Ayrılan socket üçün user məlumatı tapılmadı (ID: ${socketInstance.id}).`); return; }
    const roomId = userSocketInfo.currentRoom;
    const username = userSocketInfo.username;
    console.log(`[handleDisconnect] ${username} (ID: ${socketInstance.id}) emal edilir. Otaq: ${roomId || 'Yoxdur'}`);
    delete users[socketInstance.id];
    console.log(`[handleDisconnect] User ${username} silindi. Qalan aktiv user: ${Object.keys(users).length}`);
    if (roomId && rooms[roomId]) {
      console.log(`[handleDisconnect] ${username} ${roomId} otağından çıxarılır...`);
      rooms[roomId].players = rooms[roomId].players.filter(id => id !== socketInstance.id);
      const room = rooms[roomId];
      if (room.players.length === 0) {
        console.log(`[handleDisconnect] Otaq ${roomId} ('${room.name}') boş qaldı, silinir.`);
        delete rooms[roomId];
      } else {
        const remainingPlayerId = room.players[0];
        console.log(`[handleDisconnect] Otaqda qalan: ${users[remainingPlayerId]?.username || 'Bilinmir'} (ID: ${remainingPlayerId})`);
        if (io.sockets.sockets.get(remainingPlayerId)) {
             io.to(remainingPlayerId).emit('opponent_left_game', { username: username });
             console.log(`[handleDisconnect] Qalan oyunçuya (${remainingPlayerId}) ${username}-in ayrıldığı bildirildi.`);
        } else { console.warn(`[handleDisconnect] Qalan oyunçu (${remainingPlayerId}) aktiv deyil?`); }
      }
      broadcastRoomList();
    }
  } // handleDisconnectOrLeave sonu

}); // io.on('connection', ...) sonu
console.log("[Setup] Socket.IO 'connection' dinləyicisi təyin edildi.");


// ==================================
// ===== SERVERİN BAŞLADILMASI ======
// ==================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("========================================");
    console.log(`---- Server ${PORT} portunda uğurla işə düşdü! ----`);
    console.log(`---- Server Başlama Zamanı: ${new Date().toISOString()} ----`);
    console.log("========================================");
});

// ===== Gözlənilməyən Xətaları Tutmaq =====
process.on('uncaughtException', (error, origin) => {
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('!!! GÖZLƏNİLMƏYƏN XƏTA (Uncaught Exception) !!!');
  console.error(`Origin: ${origin}`); console.error(error);
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('!!! İDARƏ OLUNMAYAN PROMISE RƏDDİ (Unhandled Rejection) !!!');
  console.error('Səbəb:', reason);
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
});

console.log("[Setup] Server başlatma və xəta dinləyiciləri təyin edildi.");
console.log("---- Server Başlatma Prosesi Bitdi ----");
// ----- server.js Faylının Sonu -----