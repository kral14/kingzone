// server.js (v6 - PostgreSQL + DB Session Store + Ətraflı Logging)
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

console.log("---- Server Başlayır ----");

// ---- Mühit Dəyişənlərini Yoxlamaq ----
if (!process.env.DATABASE_URL) {
    console.error("XƏTA: DATABASE_URL mühit dəyişəni tapılmadı! .env faylını yoxlayın.");
    process.exit(1); // Prosesi dayandır
} else {
    console.log("DATABASE_URL yükləndi.");
}
if (!process.env.SESSION_SECRET) {
    console.error("XƏTA: SESSION_SECRET mühit dəyişəni tapılmadı! .env faylını yoxlayın.");
    process.exit(1); // Prosesi dayandır
} else {
    console.log("SESSION_SECRET yükləndi.");
}

// ---- Express, HTTP Server, Socket.IO ----
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ---- PostgreSQL Bağlantı Pool-u ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Render üçün
  }
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('!!! Verilənlər bazasına qoşulma zamanı KRİTİK XƏTA:', err.stack);
    // Burada prosesi dayandırmaq da olar, çünki DB olmadan çox şey işləməyəcək
    // process.exit(1);
    return;
  }
  client.query('SELECT NOW()', (err, result) => {
    release(); // Client-i dərhal pool-a qaytar
    if (err) {
      return console.error('DB Test sorğusu xətası:', err.stack);
    }
    console.log(`---- Verilənlər bazasına uğurla qoşuldu: ${result.rows[0].now} ----`);
  });
});
// Pool üçün ümumi xəta dinləyicisi (uzun müddətli bağlantı problemləri üçün)
pool.on('error', (err, client) => {
  console.error('!!! PostgreSQL Pool-da gözlənilməz xəta:', err);
  // process.exit(-1); // Bəzi hallarda serveri yenidən başlatmaq lazım ola bilər
});


// ---- Session Middleware (PostgreSQL Store ilə) ----
const sessionMiddleware = session({
  store: new pgSession({
    pool : pool,
    tableName : 'user_sessions', // DB-də yaratdığımız cədvəlin adı
    // pruneSessionInterval: 60 * 60 // Köhnə sessiyaları saatda bir dəfə təmizlə (saniyə) - optional
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 gün (millisaniyə)
    sameSite: 'lax' // CSRF qoruması üçün yaxşıdır
  }
});
console.log("Session middleware konfiqurasiya edildi (PostgreSQL Store ilə).");

// ---- Express Middleware Tətbiqi ----
app.use(sessionMiddleware); // Sessiya middleware-i API route-larından ƏVVƏL tətbiq et!
app.use(express.json());    // JSON body parser
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath)); // Statik fayllar (HTML, CSS, Client JS)
console.log(`Statik fayllar üçün qovluq: ${publicDirectoryPath}`);

// ---- Autentifikasiya Middleware Funksiyası ----
const isAuthenticated = (req, res, next) => {
  console.log(`[isAuthenticated] Yoxlanılır: Path=${req.path}, SessionID=${req.sessionID}`);
  if (req.session && req.session.user && req.session.user.id) {
    console.log(`[isAuthenticated] UĞURLU: User=${req.session.user.nickname}`);
    return next();
  } else {
    console.warn(`[isAuthenticated] UĞURSUZ: Giriş tələb olunur. Path=${req.path}`);
    return res.status(401).json({ message: 'Bu əməliyyat üçün giriş tələb olunur.' });
  }
};

// ----- Yardımçı Funksiyalar (Otaqlar - Hələlik Yaddaşda) -----
let rooms = {}; // Otaqları yaddaşda saxlamağa davam edirik
let users = {}; // Qoşulu socketləri yaddaşda saxlamağa davam edirik
const saltRounds = 10; // bcrypt üçün

function generateRoomId() { /* ... əvvəlki kimi ... */ return Math.random().toString(36).substring(2, 9); }
function broadcastRoomList() {
    try {
        const roomListForClients = Object.values(rooms).map(room => {
             // Xəta olmaması üçün users[id] yoxlaması
             const player1Socket = room.players[0];
             const player2Socket = room.players[1];
             return {
                 id: room.id, name: room.name, playerCount: room.players.length,
                 hasPassword: !!room.password, boardSize: room.boardSize,
                 creatorUsername: room.creatorUsername,
                 player1Username: player1Socket && users[player1Socket] ? users[player1Socket].username : null,
                 player2Username: player2Socket && users[player2Socket] ? users[player2Socket].username : null,
             };
         });
        io.emit('room_list_update', roomListForClients);
        // console.log("[broadcastRoomList] Otaq siyahısı göndərildi."); // Çox tez-tez baş verə bilər, lazım olarsa aktivləşdirin
    } catch (error) {
        console.error("[broadcastRoomList] XƏTA:", error);
    }
}

// ==========================================
// ===== HTTP API MARŞRUTLARI (ROUTES) ======
// ==========================================

// ----- Qeydiyyat Endpoint-i (/register) -----
app.post('/register', async (req, res) => {
  // Log request body (excluding password)
  const { password, ...safeBody } = req.body;
  console.log(`[POST /register] Sorğu alındı:`, safeBody);
  const { fullName, email, nickname, password: plainPassword } = req.body; // plainPassword adlandıraq

  // Validasiyalar
  if (!fullName || !email || !nickname || !plainPassword) { return res.status(400).json({ message: 'Bütün sahələr doldurulmalıdır.' }); }
  if (plainPassword.length < 6) { return res.status(400).json({ message: 'Şifrə minimum 6 simvol olmalıdır.' }); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
  if (/\s/.test(nickname)) { return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }

  let client; // DB Client üçün dəyişən
  try {
    client = await pool.connect(); // Pool-dan client al
    console.log("[POST /register] DB bağlantısı alındı.");

    // Email və Nickname unikallığını yoxla
    const emailCheck = await client.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email]);
    if (emailCheck.rowCount > 0) {
        console.warn(`[POST /register] Email artıq mövcuddur: ${email}`);
        return res.status(409).json({ message: 'Bu e-poçt artıq qeydiyyatdan keçib.' });
    }
    const nicknameCheck = await client.query('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) LIMIT 1', [nickname]);
    if (nicknameCheck.rowCount > 0) {
        console.warn(`[POST /register] Nickname artıq mövcuddur: ${nickname}`);
        return res.status(409).json({ message: 'Bu nickname artıq istifadə olunur.' });
    }

    // Şifrəni hashla
    console.log("[POST /register] Şifrə hashlanır...");
    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
    const newUserId = Date.now().toString();

    // Yeni istifadəçini DB-yə əlavə et
    const insertQuery = `
      INSERT INTO users (id, full_name, email, nickname, password_hash)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, nickname;
    `;
    const values = [newUserId, fullName, email, nickname, hashedPassword];
    console.log(`[POST /register] İstifadəçi DB-yə əlavə edilir: ${nickname}`);
    const result = await client.query(insertQuery, values);

    console.log(`[POST /register] UĞURLU: İstifadəçi qeydiyyatdan keçdi:`, result.rows[0]);
    res.status(201).json({ message: 'Qeydiyyat uğurlu oldu!' });

  } catch (error) {
    console.error("[POST /register] XƏTA:", error);
    if (error.code === '23505') { // Unique constraint
         if (error.constraint === 'users_email_key') { return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' }); }
         if (error.constraint === 'users_nickname_key') { return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' }); }
    }
    res.status(500).json({ message: 'Server xətası baş verdi.' });
  } finally {
      if (client) {
          client.release(); // Client-i pool-a qaytar
          console.log("[POST /register] DB bağlantısı buraxıldı.");
      }
  }
});

/// ----- Giriş Endpoint-i (/login) - Sadələşdirilmiş Session Save -----
app.post('/login', async (req, res) => {
  const { password: plainPassword, ...safeBody } = req.body; // Şifrəni logdan çıxar
  console.log(`[POST /login] Sorğu alındı:`, safeBody);
  const { nickname } = req.body; // Şifrəni artıq yuxarıda almışıq

  if (!nickname || !plainPassword) {
      return res.status(400).json({ message: 'Nickname və şifrə daxil edilməlidir.' });
  }

  let client;
  try {
    client = await pool.connect();
    console.log("[POST /login] DB bağlantısı alındı.");

    // İstifadəçini DB-dən tap
    console.log(`[POST /login] İstifadəçi axtarılır: ${nickname}`);
    const result = await client.query('SELECT * FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);
    if (result.rowCount === 0) {
        console.warn(`[POST /login] İstifadəçi tapılmadı: ${nickname}`);
        return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
    }
    const user = result.rows[0];
    console.log(`[POST /login] İstifadəçi tapıldı: ${user.nickname} (ID: ${user.id})`);

    // Şifrəni yoxla
    console.log(`[POST /login] Şifrə yoxlanılır...`);
    const isPasswordCorrect = await bcrypt.compare(plainPassword, user.password_hash);
    if (!isPasswordCorrect) {
        console.warn(`[POST /login] Şifrə yanlışdır: ${nickname}`);
        return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
    }
    console.log(`[POST /login] Şifrə doğrudur.`);

    // --- Session Yarat/Yenilə (Explicit save() olmadan!) ---
    console.log(`[POST /login] Session user datası təyin edilir... Hazırki SessionID=${req.sessionID}`);
    // Session obyektinə məlumatları yazırıq
    req.session.user = {
      id: user.id,
      nickname: user.nickname,
      fullName: user.full_name // DB-dəki sütun adı
    };

    // !!! req.session.save() FUNKSİYASINI ÇAĞIRMIRIQ !!!
    // express-session middleware cavab göndəriləndə dəyişikliyi görüb
    // sessiyanı avtomatik save edib, cookie-ni təyin etməlidir.

    console.log(`[POST /login] UĞURLU: İstifadəçi giriş etdi: ${user.nickname}. Session data təyin edildi.`);
    // Cavabı birbaşa göndəririk
    res.status(200).json({ message: 'Giriş uğurlu!', nickname: user.nickname });
    // --- Session Sonu ---

  } catch (error) {
    console.error("[POST /login] XƏTA:", error);
    // Xəta baş verərsə, sessiya save olunmayacaq və cookie set edilməyəcək
    res.status(500).json({ message: 'Server xətası baş verdi.' });
  } finally {
    if (client) {
         client.release();
         console.log("[POST /login] DB bağlantısı buraxıldı.");
    }
  }
});
app.post('/logout', (req, res) => {
  const sessionId = req.sessionID;
  const userNickname = req.session.user?.nickname; // Əgər user varsa, nickname alaq

  console.log(`[POST /logout] Sorğu alındı. SessionID=${sessionId}, User=${userNickname || 'N/A'}`);

  if (req.session.user) {
    req.session.destroy(err => { // Sessionu DB-dən silir (connect-pg-simple)
      if (err) {
        console.error(`[POST /logout] Session destroy xətası. SessionID=${sessionId}:`, err);
        return res.status(500).json({ message: "Çıxış zamanı xəta baş verdi." });
      }
      // Cookie-ni brauzerdən təmizlə
      // Cookie adını session konfiqurasiyasından götürək, tapılmasa 'connect.sid' istifadə edək
      const cookieName = req.session?.cookie?.name || 'connect.sid';
      res.clearCookie(cookieName);
      console.log(`[POST /logout] UĞURLU: İstifadəçi çıxış etdi: ${userNickname}. SessionID=${sessionId} silindi. Cookie '${cookieName}' təmizləndi.`);
      res.status(200).json({ message: "Uğurla çıxış edildi." });
    });
  } else {
    console.warn(`[POST /logout] Çıxış üçün aktiv sessiya tapılmadı. SessionID=${sessionId}`);
    // Aktiv sessiya olmasa belə, cookie-ni təmizləməyə cəhd etmək olar
    res.clearCookie(req.session?.cookie?.name || 'connect.sid');
    res.status(400).json({ message: "Giriş edilməyib." });
  }
});

// ----- Autentifikasiya Vəziyyətini Yoxlama Endpoint-i (/check-auth) -----
app.get('/check-auth', (req, res) => {
  // Ətraflı logging (əvvəlki mesajdakı kimi)
  console.log('--- /check-auth sorğusu gəldi ---');
  console.log('Sorğu üçün Session ID:', req.sessionID);
  console.log('Server req.session obyektini görür mü?', !!req.session);
  console.log('Server req.session.user obyektini görür mü?', !!req.session?.user);
  if(req.session?.user) {
      console.log('Serverin gördüyü Session user datası:', req.session.user);
  } else {
      console.log('Server session və ya user datasını bu sorğu üçün tapa bilmir!');
  }
  console.log('--------------------------------');

  if (req.session && req.session.user && req.session.user.id) {
    console.log(`[/check-auth] Cavab: Uğurlu (200). User: ${req.session.user.nickname}`);
    res.status(200).json({ loggedIn: true, user: req.session.user }); // Tam user datasını göndəririk
  } else {
    console.warn(`[/check-auth] Cavab: Uğursuz (401). SessionID=${req.sessionID}`);
    res.status(401).json({ loggedIn: false });
  }
});

// Profil Endpointləri və Socket.IO hissələri növbəti part-da olacaq...

// ----- Hələlik Default Route -----
// Giriş edilməyibsə loginə, edilibsə oyunlara yönləndirsin
app.get('/', (req, res) => {
    console.log(`[GET /] Kök route sorğusu. SessionID=${req.sessionID}, User=${req.session.user?.nickname || 'N/A'}`);
    if (req.session && req.session.user && req.session.user.id) {
        console.log("[GET /] Aktiv sessiya var, oyunlara yönləndirilir.");
        res.redirect('/OYUNLAR/oyunlar/oyunlar.html');
    } else {
        console.log("[GET /] Aktiv sessiya yoxdur, loginə yönləndirilir.");
        res.redirect('/ANA SEHIFE/login/login.html');
    }
});
// server.js (v6 - PostgreSQL + DB Session Store + Ətraflı Logging)
// HİSSƏ 2/3

// ==========================================
// ===== Profil API Endpointləri ==========
// ==========================================

// ----- Profil Məlumatlarını Almaq Endpoint-i (/profile/:nickname) -----
app.get('/profile/:nickname', isAuthenticated, async (req, res) => {
  const requestedNickname = req.params.nickname;
  const loggedInUserId = req.session.user.id; // Sessiondan ID alırıq (daha etibarlı)
  const loggedInNickname = req.session.user.nickname;
  console.log(`[GET /profile/${requestedNickname}] Sorğu alındı. Login: ${loggedInNickname} (ID: ${loggedInUserId})`);

  // Təhlükəsizlik yoxlaması: URL-dəki nickname ilə sessiyadakı nickname eynidirmi?
  if (loggedInNickname.toLowerCase() !== requestedNickname.toLowerCase()) {
    console.warn(`[GET /profile/${requestedNickname}] İCAZƏ XƏTASI: ${loggedInNickname} başqasının profilinə baxmağa çalışır.`);
    return res.status(403).json({ message: 'Başqasının profilinə baxmaq icazəsi yoxdur.' });
  }

  let client;
  try {
    client = await pool.connect();
    console.log(`[GET /profile/${requestedNickname}] DB bağlantısı alındı.`);

    // İstifadəçini ID ilə axtarmaq daha etibarlı ola bilər, amma nickname ilə davam edək
    console.log(`[GET /profile/${requestedNickname}] DB-dən user axtarılır: ${loggedInNickname}`);
    const result = await client.query(
      'SELECT id, full_name, email, nickname FROM users WHERE LOWER(nickname) = LOWER($1) AND id = $2',
      [loggedInNickname, loggedInUserId] // Həm nickname, həm ID ilə yoxlayaq
    );

    if (result.rowCount > 0) {
      const userProfile = result.rows[0];
      console.log(`[GET /profile/${requestedNickname}] UĞURLU: Profil tapıldı:`, userProfile);
      res.status(200).json(userProfile); // Şifrəsiz məlumatı qaytarırıq
    } else {
      // isAuthenticated middleware keçibsə, bu normalda baş verməməlidir
      console.error(`[GET /profile/${requestedNickname}] XƏTA: İstifadəçi DB-də tapılmadı (amma sessiyası var idi!). ID: ${loggedInUserId}`);
      res.status(404).json({ message: 'İstifadəçi tapılmadı.' });
    }
  } catch(error) {
    console.error(`[GET /profile/${requestedNickname}] XƏTA:`, error);
    res.status(500).json({ message: 'Server xətası baş verdi.' });
  } finally {
      if (client) {
          client.release();
          console.log(`[GET /profile/${requestedNickname}] DB bağlantısı buraxıldı.`);
      }
  }
});

// ----- Profil Məlumatlarını Yeniləmək Endpoint-i (/profile/:nickname) -----
app.put('/profile/:nickname', isAuthenticated, async (req, res) => {
  const currentNicknameFromParam = req.params.nickname;
  const loggedInUserId = req.session.user.id;
  const loggedInNickname = req.session.user.nickname;

  // Log request body (excluding password)
  const { password: plainPassword, ...safeBody } = req.body;
  console.log(`[PUT /profile/${currentNicknameFromParam}] Sorğu alındı. Login: ${loggedInNickname} (ID: ${loggedInUserId}). Body:`, safeBody);

  const { fullName, email, nickname: newNickname } = req.body; // Yeni məlumatlar

  // Təhlükəsizlik yoxlaması
  if (loggedInNickname.toLowerCase() !== currentNicknameFromParam.toLowerCase()) {
      console.warn(`[PUT /profile/${currentNicknameFromParam}] İCAZƏ XƏTASI: ${loggedInNickname} başqasının profilini dəyişməyə çalışır.`);
      return res.status(403).json({ message: 'Başqasının profilini dəyişməyə icazə yoxdur.' });
  }

  // Validasiyalar
  if (!fullName || !email || !newNickname) { return res.status(400).json({ message: 'Ad Soyad, E-poçt və Nickname boş ola bilməz.' }); }
  if (/\s/.test(newNickname)) { return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
  // Yeni şifrə üçün validasiya (əgər göndərilibsə)
  if (plainPassword && plainPassword.length < 6) { return res.status(400).json({ message: 'Yeni şifrə minimum 6 simvol olmalıdır.' }); }

  let client;
  try {
    client = await pool.connect();
    console.log(`[PUT /profile/${currentNicknameFromParam}] DB bağlantısı alındı.`);

    // Unikallıq yoxlaması (email və yeni nickname üçün - özündən başqa)
    const emailExists = await client.query('SELECT 1 FROM users WHERE email = $1 AND id != $2 LIMIT 1', [email, loggedInUserId]);
    if (emailExists.rowCount > 0) { console.warn(`[PUT /profile/${currentNicknameFromParam}] Email artıq mövcuddur: ${email}`); return res.status(409).json({ message: 'Bu e-poçt başqa istifadəçi tərəfindən istifadə olunur.' }); }

    // Yalnız nickname dəyişibsə, unikallığını yoxla
    if (newNickname.toLowerCase() !== loggedInNickname.toLowerCase()) {
        const nicknameExists = await client.query('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) AND id != $2 LIMIT 1', [newNickname, loggedInUserId]);
        if (nicknameExists.rowCount > 0) { console.warn(`[PUT /profile/${currentNicknameFromParam}] Nickname artıq mövcuddur: ${newNickname}`); return res.status(409).json({ message: 'Bu nickname artıq başqası tərəfindən istifadə olunur.' }); }
    }

    // UPDATE sorğusu üçün sahələri və parametrləri hazırla
    let updateFields = ['full_name = $1', 'email = $2', 'nickname = $3'];
    let queryParams = [fullName, email, newNickname];
    let paramIndex = 4; // Növbəti parametr indeksi $4 olacaq

    // Əgər yeni şifrə göndərilibsə, onu da hashlayıb əlavə et
    if (plainPassword) {
      console.log(`[PUT /profile/${currentNicknameFromParam}] Yeni şifrə hashlanır...`);
      const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
      updateFields.push(`password_hash = $${paramIndex}`);
      queryParams.push(hashedPassword);
      paramIndex++;
      console.log(`[PUT /profile/${currentNicknameFromParam}] Şifrə hashlandı və sorğuya əlavə edildi.`);
    }

    // UPDATE sorğusunu qur və icra et
    const updateQuery = `
      UPDATE users SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, full_name, email, nickname; -- Yenilənmiş məlumatları qaytar
    `;
    queryParams.push(loggedInUserId); // WHERE şərti üçün ID-ni sona əlavə et

    console.log(`[PUT /profile/${currentNicknameFromParam}] DB UPDATE sorğusu icra edilir...`);
    const result = await client.query(updateQuery, queryParams);

    if (result.rowCount === 0) {
        // Bu baş verməməlidir, çünki isAuthenticated var və ID ilə axtarırıq
        console.error(`[PUT /profile/${currentNicknameFromParam}] XƏTA: Yenilənəcək user tapılmadı (ID: ${loggedInUserId}).`);
        return res.status(404).json({ message: 'Yenilənəcək istifadəçi tapılmadı.' });
    }

    const updatedUser = result.rows[0];
    console.log(`[PUT /profile/${currentNicknameFromParam}] DB yeniləndi. Yenilənmiş data:`, updatedUser);

    // Sessiondakı məlumatları da yeniləyək
    req.session.user.nickname = updatedUser.nickname;
    req.session.user.fullName = updatedUser.full_name;
    // Email dəyişmədiyi üçün onu yeniləməyə ehtiyac yoxdur, amma istəsəniz edə bilərsiniz: req.session.user.email = updatedUser.email;

    req.session.save((err) => { // Session-u yadda saxla
      if (err) {
          console.error(`[PUT /profile/${currentNicknameFromParam}] Session save xətası:`, err);
          // DB yenilənsə də, session save olmadısa, istifadəçi problem yaşaya bilər
          return res.status(500).json({ message: 'Profil DB-də yeniləndi, amma session yadda saxlanarkən xəta baş verdi.' });
      }
      console.log(`[PUT /profile/${currentNicknameFromParam}] UĞURLU: Profil və Sessiya yeniləndi. Yeni Nickname: ${updatedUser.nickname}`);
      // Frontend üçün yenilənmiş məlumatları (şifrəsiz) qaytar
      res.status(200).json({
          message: 'Profil uğurla yeniləndi!',
          updatedUser: { // Şifrə hashını qaytarmırıq
              id: updatedUser.id,
              nickname: updatedUser.nickname,
              fullName: updatedUser.full_name,
              email: updatedUser.email
           }
       });
    });

  } catch (error) {
    console.error(`[PUT /profile/${currentNicknameFromParam}] XƏTA:`, error);
    if (error.code === '23505') { // Unique constraint
         if (error.constraint === 'users_email_key') { return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' }); }
         if (error.constraint === 'users_nickname_key') { return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' }); }
    }
    res.status(500).json({ message: 'Server xətası baş verdi.' });
  } finally {
      if (client) {
          client.release();
          console.log(`[PUT /profile/${currentNicknameFromParam}] DB bağlantısı buraxıldı.`);
      }
  }
});


// Socket.IO və Server Start hissələri növbəti part-da olacaq...
// server.js (v6 - PostgreSQL + DB Session Store + Ətraflı Logging)
// HİSSƏ 3/3

// ============================================
// ===== SOCKET.IO Quraşdırması və Hadisələr ==
// ============================================

// Socket.IO üçün Session Middleware-i istifadə etmək
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
console.log("Socket.IO üçün session middleware tətbiq edildi.");

// Socket.IO bağlantılarını yalnız giriş etmiş istifadəçilər üçün qəbul etmək (Ətraflı Logging ilə)
io.use((socket, next) => {
  const session = socket.request.session; // Wrap edilmiş middleware sayəsində session burada olmalıdır

  console.log('--- Socket Auth Middleware Başladı ---');
  console.log('Socket ID:', socket.id);
  console.log('Socket sorğusunda session varmi?', !!session);

  if (session) {
      console.log('Socket sorğusundakı Session ID:', session.id);
      console.log('Socket sorğusunda session.user varmi?', !!session.user);

      if (session.user) {
          console.log('Socket sorğusundakı Session User Datası:', session.user);
          // İstifadəçinin nickname-i varmı deyə yoxlayaq
          if (session.user.nickname) {
              socket.user = session.user; // User məlumatını socketə əlavə et
              console.log(`Socket auth UĞURLU: ${socket.user.nickname}`);
              next(); // Bağlantıya icazə ver
          } else {
              console.warn('Socket auth UĞURSUZ: session.user tapıldı, amma nickname yoxdur.');
              next(new Error('Authentication error: Nickname missing in session')); // Xəta ilə rədd et
          }
      } else {
          console.warn('Socket auth UĞURSUZ: session tapıldı, amma session.user yoxdur.');
          next(new Error('Authentication error: User data missing in session')); // Xəta ilə rədd et
      }
  } else {
      console.warn('Socket auth UĞURSUZ: Socket sorğusunda session tapılmadı.');
      next(new Error('Authentication error: No session')); // Xəta ilə rədd et
  }
  console.log('--- Socket Auth Middleware Bitdi ---');
});

// Yeni Socket Bağlantısı Gəldikdə...
io.on('connection', (socket) => {
  // Autentifikasiya middleware keçdiyi üçün socket.user mövcuddur
  console.log(`[Socket Connected] User: ${socket.user.nickname} (ID: ${socket.id}) qoşuldu.`);

  // Qoşulan istifadəçini 'users' yaddaş obyektinə əlavə et (socket id ilə)
  users[socket.id] = {
      id: socket.id,
      username: socket.user.nickname,
      currentRoom: null
  };
  console.log(`[Socket Users] Aktiv istifadəçilər: ${Object.keys(users).length}`);

  // Qoşulan istifadəçiyə mövcud otaq siyahısını göndər
   try {
       socket.emit('room_list_update', Object.values(rooms).map(room => ({
           id: room.id, name: room.name, playerCount: room.players.length,
           hasPassword: !!room.password, boardSize: room.boardSize, creatorUsername: room.creatorUsername,
           player1Username: room.players[0] && users[room.players[0]] ? users[room.players[0]].username : null,
           player2Username: room.players[1] && users[room.players[1]] ? users[room.players[1]].username : null,
       })));
       console.log(`[Socket Emit] 'room_list_update' göndərildi ${socket.user.nickname}-ə.`);
   } catch (emitError) {
       console.error(`[Socket Emit] 'room_list_update' göndərilərkən xəta (${socket.user.nickname}):`, emitError);
   }


  // ----- Otaq Əməliyyatları -----

  socket.on('create_room', (data) => {
    const user = socket.user;
    console.log(`[Socket On] 'create_room' alındı. User: ${user.nickname}, Data:`, data);

    // Validasiyalar
    if (!data || !data.name || data.name.trim().length === 0) { console.warn(`[create_room] Keçərsiz data: Ad boşdur.`); return socket.emit('creation_error', 'Otaq adı boş ola bilməz.'); }
    if (data.password && data.password.length > 0) {
      if (data.password.length < 2 || !(/[a-zA-Z]/.test(data.password) && /\d/.test(data.password))) {
         console.warn(`[create_room] Keçərsiz şifrə formatı.`); return socket.emit('creation_error', 'Şifrə tələblərə uyğun deyil (min 2 krk, 1 hərf+1 rəqəm).');
      }
    }
    if (users[socket.id]?.currentRoom) {
        console.warn(`[create_room] User ${user.nickname} artıq ${users[socket.id].currentRoom} otağındadır.`);
        return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız.');
    }

    const newRoomId = generateRoomId();
    const newRoom = { id: newRoomId, name: data.name.trim(), password: data.password || null, players: [socket.id], boardSize: parseInt(data.boardSize, 10) || 3, creatorUsername: user.nickname, gameState: null };
    rooms[newRoomId] = newRoom; // Otağı yaddaşa əlavə et
    users[socket.id].currentRoom = newRoomId; // User-in otağını yenilə
    socket.join(newRoomId); // Socket.IO otağına qoş

    console.log(`[create_room] Otaq yaradıldı: ID=${newRoomId}, Adı=${newRoom.name}, Yaradan=${user.nickname}`);
    socket.emit('room_created', { roomId: newRoomId, roomName: newRoom.name, boardSize: newRoom.boardSize });
    socket.emit('room_joined', { roomId: newRoomId, roomName: newRoom.name, boardSize: newRoom.boardSize }); // Qoşulmanı da bildir
    broadcastRoomList(); // Otaq siyahısını hamıya göndər
  });

  socket.on('join_room', (data) => {
    const user = socket.user;
    console.log(`[Socket On] 'join_room' alındı. User: ${user.nickname}, Data:`, data);
    const room = data ? rooms[data.roomId] : null; // data null ola bilər? yoxlayaq
    const currentUserSocketInfo = users[socket.id];

    if (!data || !data.roomId) { console.warn(`[join_room] Keçərsiz data: roomId yoxdur.`); return socket.emit('join_error', 'Otaq ID göndərilmədi.'); }
    if (!room) { console.warn(`[join_room] Otaq tapılmadı: ID=${data.roomId}`); return socket.emit('join_error', 'Otaq tapılmadı.'); }
    if (currentUserSocketInfo?.currentRoom) { console.warn(`[join_room] User ${user.nickname} artıq ${currentUserSocketInfo.currentRoom} otağındadır.`); return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.'); }
    if (room.players.length >= 2) { console.warn(`[join_room] Otaq dolu: ID=${data.roomId}`); return socket.emit('join_error', 'Otaq doludur.'); }
    if (room.password && room.password !== data.password) { console.warn(`[join_room] Yanlış şifrə: ID=${data.roomId}`); return socket.emit('join_error', 'Şifrə yanlışdır.'); }

    // Qoşulma
    room.players.push(socket.id);
    if(currentUserSocketInfo) currentUserSocketInfo.currentRoom = room.id; else console.error("currentUserSocketInfo not found for join_room!"); // Bu baş verməməlidir
    socket.join(room.id);

    console.log(`[join_room] User ${user.nickname} (${socket.id}) ${room.name} (${room.id}) otağına qoşuldu.`);
    socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });

    // Rəqibə qoşulma barədə məlumat ver
    const opponentSocketId = room.players.find(id => id !== socket.id);
    if (opponentSocketId && io.sockets.sockets.get(opponentSocketId)) {
        console.log(`[join_room] Rəqibə (${opponentSocketId}) ${user.nickname}-in qoşulduğu bildirilir.`);
        io.to(opponentSocketId).emit('opponent_joined', { username: user.nickname });
    }

    broadcastRoomList(); // Siyahını yenilə

    // Oyunun başlanması siqnalı (əgər 2 oyunçu varsa)
    if (room.players.length === 2) {
        console.log(`[join_room] Otaq ${room.id} doldu. Oyun başlama siqnalları göndərilir...`);
        const player1SocketId = room.players[0];
        const player2SocketId = room.players[1];
        const player1 = users[player1SocketId];
        const player2 = users[player2SocketId];

        if (player1 && io.sockets.sockets.get(player1SocketId)) { io.to(player1SocketId).emit('game_start', { opponentName: player2?.username || 'Rəqib', isAiOpponent: false }); }
        if (player2 && io.sockets.sockets.get(player2SocketId)) { io.to(player2SocketId).emit('game_start', { opponentName: player1?.username || 'Rəqib', isAiOpponent: false }); }
    }
  });

  socket.on('leave_room', () => {
    console.log(`[Socket On] 'leave_room' alındı. User: ${socket.user.nickname}`);
    handleDisconnectOrLeave(socket); // Funksiyanı çağır
  });


  // ----- Oyun Gedişləri -----
  socket.on('make_move', (data) => {
    const user = socket.user;
    const roomId = users[socket.id]?.currentRoom;
    // Gələn datanı yoxlayaq
    if (!data || typeof data.index !== 'number' || data.index < 0) {
        console.warn(`[make_move] Keçərsiz data alındı. User: ${user.nickname}, Data:`, data);
        return; // Keçərsiz datanı emal etmə
    }
    console.log(`[Socket On] 'make_move' alındı. User: ${user.nickname}, Room: ${roomId}, Index: ${data.index}`);

    if (roomId && rooms[roomId] && user) {
      const room = rooms[roomId];
      // Sadə yoxlama: Göndərən oyunçu otaqdadırmı? (Əslində io.use bunu təmin edir)
      if (!room.players.includes(socket.id)) {
          console.warn(`[make_move] XƏTA: User ${user.nickname} ${roomId} otağında deyil!`);
          return;
      }
      // Burada daha mürəkkəb oyun məntiqi yoxlamaları server tərəfində edilməlidir (sıra kimdədir, xana boşdurmu vs.)
      // Hələlik sadəcə digər oyunçuya ötürürük:
      console.log(`[make_move] Gediş ${roomId} otağındakı digər oyunçulara göndərilir.`);
      socket.to(roomId).emit('opponent_moved', { index: data.index, player: user.nickname }); // Nickname göndəririk
    } else {
        console.warn(`[make_move] Keçərsiz otaq (${roomId}) və ya user (${user?.nickname}). Gediş ötürülmədi.`);
    }
  });

   // Oyunun yenidən başladılması (hələlik sadə ötürmə)
   socket.on('request_restart', () => {
      const roomId = users[socket.id]?.currentRoom;
      if (roomId && rooms[roomId]) {
         console.log(`[Socket On] 'request_restart' alındı. Room=${roomId}, User=${socket.user.nickname}`);
         socket.to(roomId).emit('restart_requested', { requester: socket.user.nickname });
      }
   });
   socket.on('accept_restart', () => {
       const roomId = users[socket.id]?.currentRoom;
       if (roomId && rooms[roomId]) {
           console.log(`[Socket On] 'accept_restart' alındı. Room=${roomId}, User=${socket.user.nickname}`);
           io.to(roomId).emit('restart_game'); // Hər iki oyunçuya restart siqnalı
        }
   });


  // ----- Bağlantı Kəsildikdə / Otaqdan Ayrılma Funksiyası -----
  socket.on('disconnect', (reason) => {
    console.log(`[Socket Disconnected] User: ${socket.user?.nickname || socket.id}. Səbəb: ${reason}`);
    handleDisconnectOrLeave(socket); // Eyni funksiyanı çağırırıq
  });

  function handleDisconnectOrLeave(socketInstance) {
    const userSocketInfo = users[socketInstance.id];
    if (!userSocketInfo) {
         console.warn(`[handleDisconnectOrLeave] Ayrılan socket üçün user məlumatı tapılmadı (ID: ${socketInstance.id}).`);
         return;
    }

    const roomId = userSocketInfo.currentRoom;
    const username = userSocketInfo.username;

    console.log(`[handleDisconnectOrLeave] ${username} (ID: ${socketInstance.id}) emal edilir. Otaq: ${roomId || 'Yoxdur'}`);

    // İstifadəçini aktiv socket siyahısından sil
    delete users[socketInstance.id];
    console.log(`[handleDisconnectOrLeave] User ${username} aktiv istifadəçilər siyahısından silindi. Qalan: ${Object.keys(users).length}`);

    // Əgər bir otaqda idisə
    if (roomId && rooms[roomId]) {
      console.log(`[handleDisconnectOrLeave] ${username} ${roomId} otağından çıxarılır...`);
      rooms[roomId].players = rooms[roomId].players.filter(id => id !== socketInstance.id);
      const room = rooms[roomId]; // Referansı yeniləyək

      if (room.players.length === 0) {
        // Otaq boş qaldısa, otağı sil
        console.log(`[handleDisconnectOrLeave] Otaq ${roomId} ('${room.name}') boş qaldı və silinir.`);
        delete rooms[roomId];
      } else {
        // Otaqda oyunçu qaldısa, ona xəbər ver
        const remainingPlayerId = room.players[0];
        console.log(`[handleDisconnectOrLeave] Otaqda qalan oyunçu: ${remainingPlayerId}`);
        if (io.sockets.sockets.get(remainingPlayerId)) { // Qalan oyunçu hələ də qoşuludursa
            console.log(`[handleDisconnectOrLeave] Qalan oyunçuya (${remainingPlayerId}) ${username}-in ayrıldığı bildirilir.`);
            io.to(remainingPlayerId).emit('opponent_left_game', { username: username });
        } else {
            console.warn(`[handleDisconnectOrLeave] Qalan oyunçu (${remainingPlayerId}) aktiv deyil?`);
        }
      }
      // Otaq siyahısını yenilə
      broadcastRoomList();
    } else {
        console.log(`[handleDisconnectOrLeave] ${username} heç bir otaqda deyildi.`);
    }
  } // handleDisconnectOrLeave sonu

}); // io.on('connection', ...) sonu


// ==================================
// ===== SERVERİN BAŞLADILMASI ======
// ==================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`---- ---- ---- ---- ----`);
    console.log(`---- Server ${PORT} portunda işə düşdü ----`);
    console.log(`---- Server vaxtı: ${new Date().toLocaleString()} ----`);
    console.log(`---- ---- ---- ---- ----`);
});

// Gözlənilməyən xətaları tutmaq üçün (optional)
process.on('uncaughtException', (error) => {
  console.error('!!! Gözlənilməyən XƏTA (Uncaught Exception):', error);
  // Burada serveri dayandırmaq daha təhlükəsiz ola bilər
  // process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('!!! Gözlənilməyən Promise Rədd Edilməsi (Unhandled Rejection):', reason);
});