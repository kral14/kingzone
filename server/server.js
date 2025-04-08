// server.js (PostgreSQL + DB Session Store ilə Tam Yenilənmiş və Düzəldilmiş)
// Part 1/3

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

const saltRounds = 10; // bcrypt üçün salt dövrü

// ---- Express və Socket.IO Tətbiqlərinin Yaradılması ----
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] } // CORS ayarları (prod üçün daha məhdudlaşdırılmış ola bilər)
});
console.log('[Setup] Express, HTTP Server və Socket.IO yaradıldı.');

// ---- PostgreSQL Verilənlər Bazası Bağlantı Pool-u ----
// .env faylında DATABASE_URL olduğundan əmin olun!
if (!process.env.DATABASE_URL) {
    console.error('XƏTA: DATABASE_URL mühit dəyişəni tapılmadı! .env faylını yoxlayın.');
    process.exit(1); // Tətbiqi dayandır
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Render kimi platformalar üçün lazımdır
  }
});
console.log('[Setup] PostgreSQL connection pool yaradıldı.');

// Bağlantını yoxlayaq
pool.connect((err, client, release) => {
  if (err) {
    console.error('Verilənlər bazasına qoşulma xətası:', err.stack);
    // Tətbiqi burada dayandırmaq məqsədəuyğun ola bilər
    // process.exit(1);
    return;
  }
  client.query('SELECT NOW()', (err, result) => {
    release(); // Client-i pool-a qaytar
    if (err) {
      return console.error('Test sorğusu xətası:', err.stack);
    }
    console.log('---- Verilənlər bazasına uğurla qoşuldu:', result.rows[0].now, '----');
  });
});

// ---- Express Ayarları (Sessiondan əvvəl) ----
// Render və ya bənzər proxy arxasında işləyərkən cookie-lərin düzgün işləməsi üçün
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // Proxy-dən gələn headerlərə etibar et
    console.log('[Setup] Express "trust proxy" ayarı aktiv edildi (production).');
}

// ---- Session Middleware Konfiqurasiyası (PostgreSQL Store ilə - DÜZƏLİŞLİ) ----
// .env faylında SESSION_SECRET olduğundan əmin olun!
if (!process.env.SESSION_SECRET) {
    console.error('XƏTA: SESSION_SECRET mühit dəyişəni tapılmadı! .env faylını yoxlayın.');
    process.exit(1); // Tətbiqi dayandır
}
const sessionMiddleware = session({
  store: new pgSession({
    pool : pool,                // Mövcud connection pool-u istifadə et
    tableName : 'user_sessions', // Session cədvəlinin adı
    // createTableIfMissing: true // Cədvəl yoxdursa avtomatik yaratsın (test üçün faydalı ola bilər)
    pruneSessionInterval: 60 * 5 // 5 dəqiqədə bir köhnəlmiş sessionları təmizlə (saniyə)
  }),
  secret: process.env.SESSION_SECRET,
  resave: false, // Dəyişiklik olmadıqda yenidən yadda saxlama
  saveUninitialized: false, // Giriş etməmiş user üçün session yaratma
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS tələb edir
    httpOnly: true, // JS ilə cookie-yə müdaxiləni əngəlləyir
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 gün (millisaniyə)
    sameSite: 'lax' // <<<--- DÜZƏLİŞ: CSRF qoruması və yönləndirmələrdə cookie göndərilməsi üçün
  }
});
app.use(sessionMiddleware); // Session middleware-i tətbiq et
console.log('[Setup] Session middleware (pgSession ilə) konfiqurasiya edildi və tətbiq olundu.');
console.log(`[Setup] Session cookie ayarları: secure=${process.env.NODE_ENV === 'production'}, httpOnly=true, maxAge=${1000 * 60 * 60 * 24 * 7}, sameSite='lax'`);


// ---- Digər Middleware-lər ----
app.use(express.json()); // Gələn JSON body-lərini parse etmək üçün
const publicDirectoryPath = path.join(__dirname, '../public'); // Statik faylların yolu
app.use(express.static(publicDirectoryPath)); // Statik faylları (HTML, CSS, JS) təqdim et
console.log('[Setup] JSON parser və Static files middleware tətbiq edildi. Statik qovluq:', publicDirectoryPath);

// ---- Autentifikasiya Middleware Funksiyası ----
const isAuthenticated = (req, res, next) => {
  // Session və user.id yoxlanılır
  if (req.session && req.session.user && req.session.user.id) {
    return next(); // İstifadəçi giriş edib, davam et
  } else {
    console.warn(`[Auth Middleware] Giriş tələb olunan route üçün icazə verilmədi. SessionID: ${req.sessionID || 'N/A'}`);
    // Giriş edilməyib
    return res.status(401).json({ message: 'Bu əməliyyat üçün giriş tələb olunur.' }); // 401 Unauthorized
  }
};

// ----- Yardımçı Funksiyalar (Otaqlar üçün) -----
// Qeyd: Otaq məlumatları hələ də yaddaşda saxlanılır.
let rooms = {}; // Aktiv oyun otaqları (yaddaşda) { roomId: {id, name, password, players: [socketId1, socketId2], boardSize, creatorUsername, gameState} }
let users = {}; // Qoşulu olan socket bağlantıları (yaddaşda) { socketId: {id, username, currentRoom} }

function generateRoomId() {
    return Math.random().toString(36).substring(2, 9);
}

// Otaq siyahısını formatlayıb bütün clientlərə göndərən funksiya
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
        // isAiRoom: room.isAiRoom // AI otaqları üçün əlavə edilə bilər
    }));
    io.emit('room_list_update', roomListForClients);
    // console.log('[Broadcast] Otaq siyahısı yeniləndi və göndərildi.'); // Çox tez-tez log yarada bilər
}

// --- Part 1 Sonu ---
// server.js
// Part 2/3 - HTTP API Routes

// ... (Part 1-dən sonra gələn kod) ...

// ==========================================
// ===== HTTP API MARŞRUTLARI (ROUTES) ======
// ==========================================
console.log('[Setup] API Endpointləri təyin edilir...');

// ----- Qeydiyyat Endpoint-i (/register) -----
app.post('/register', async (req, res) => {
  const { fullName, email, nickname, password } = req.body;
  console.log(`[API /register] Sorğu alındı: { nickname: '${nickname}' }`);

  // Server-side Validasiyalar
  if (!fullName || !email || !nickname || !password) {
    console.log('[API /register] Xəta: Bütün sahələr doldurulmayıb.');
    return res.status(400).json({ message: 'Bütün sahələr doldurulmalıdır.' });
  }
  if (password.length < 6) {
    console.log('[API /register] Xəta: Şifrə çox qısadır.');
    return res.status(400).json({ message: 'Şifrə minimum 6 simvol olmalıdır.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
     console.log('[API /register] Xəta: E-poçt formatı yanlışdır.');
    return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' });
  }
  if (/\s/.test(nickname)) {
    console.log('[API /register] Xəta: Nickname-də boşluq var.');
    return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' });
  }

  let client;
  try {
    client = await pool.connect();
    console.log('[API /register] DB bağlantısı alındı.');

    // Email və Nickname unikallığını yoxla
    const emailCheck = await client.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email]);
    if (emailCheck.rowCount > 0) {
      console.log(`[API /register] Xəta: E-poçt (${email}) artıq mövcuddur.`);
      return res.status(409).json({ message: 'Bu e-poçt artıq qeydiyyatdan keçib.' });
    }
    const nicknameCheck = await client.query('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) LIMIT 1', [nickname]);
    if (nicknameCheck.rowCount > 0) {
       console.log(`[API /register] Xəta: Nickname (${nickname}) artıq mövcuddur.`);
      return res.status(409).json({ message: 'Bu nickname artıq istifadə olunur.' });
    }

    // Şifrəni hashla
    console.log(`[API /register] ${nickname} üçün şifrə hashlanır...`);
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    // Unikal ID üçün UUID və ya DB SERIAL istifadə etmək daha yaxşıdır, amma hələlik Date.now()
    const newUserId = Date.now().toString();

    // Yeni istifadəçini DB-yə əlavə et
    const insertQuery = `
      INSERT INTO users (id, full_name, email, nickname, password_hash)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, nickname;
    `;
    const values = [newUserId, fullName, email, nickname, hashedPassword];
    console.log(`[API /register] İstifadəçi DB-yə yazılır: ${nickname}`);
    const result = await client.query(insertQuery, values);

    console.log(`[API /register] UĞURLU: İstifadəçi yaradıldı:`, result.rows[0]);
    res.status(201).json({ message: 'Qeydiyyat uğurlu oldu!' });

  } catch (error) {
    console.error("[API /register] Qeydiyyat xətası:", error);
    if (error.code === '23505') { // PostgreSQL unique violation
        if (error.constraint && error.constraint.includes('email')) {
             return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' });
         }
         if (error.constraint && error.constraint.includes('nickname')) {
             return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' });
         }
    }
    res.status(500).json({ message: 'Server xətası.' });
  } finally {
    if (client) {
        client.release(); // Bağlantını pool-a qaytar
         console.log('[API /register] DB bağlantısı buraxıldı.');
    }
  }
});

// ----- Giriş Endpoint-i (/login) - DÜZƏLİŞLİ və ƏTRAFLI LOGGING ilə -----
app.post('/login', async (req, res) => {
    const { nickname, password } = req.body;
    let client; // DB client-i əlçatan etmək üçün

    console.log(`[API /login] Sorğu alındı: { nickname: '${nickname}' }`);

    if (!nickname || !password) {
        console.log('[API /login] Xəta: Nickname və ya şifrə boşdur.');
        return res.status(400).json({ message: 'Nickname və şifrə daxil edilməlidir.' });
    }

    try {
        client = await pool.connect();
        console.log(`[API /login] DB bağlantısı alındı.`);

        const result = await client.query('SELECT * FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);
        if (result.rowCount === 0) {
            console.log(`[API /login] İstifadəçi tapılmadı: ${nickname}`);
            // Security best practice: Don't reveal which one is wrong
            return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
        }
        const user = result.rows[0];
        console.log(`[API /login] İstifadəçi tapıldı: ${user.nickname} (ID: ${user.id})`);

        console.log(`[API /login] Şifrə yoxlanılır...`);
        const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordCorrect) {
            console.log(`[API /login] Şifrə yanlışdır: ${nickname}`);
            return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
        }
        console.log(`[API /login] Şifrə doğrudur: ${nickname}`);

        const oldSessionID = req.sessionID;
        console.log(`[API /login] Session regenerate edilir... Köhnə SessionID=${oldSessionID}`);

        // Session regenerate et (session fixation hücumlarına qarşı)
        req.session.regenerate(regenerateErr => {
            if (regenerateErr) {
                console.error("[API /login] Session regenerate xətası:", regenerateErr);
                // Status kodunu 500 etmək daha məntiqlidir
                if (!res.headersSent) {
                   return res.status(500).json({ message: 'Session yaradılarkən xəta baş verdi (regenerate).' });
                } else {
                   console.error("[API /login] Regenerate xətası oldu amma cavab artıq göndərilmişdi.");
                   return;
                }
            }

            const newSessionID = req.sessionID;
            console.log(`[API /login] Session regenerate edildi. Yeni SessionID=${newSessionID}. User datası təyin edilir...`);

            // User məlumatlarını YENİ sessiona əlavə et
            req.session.user = {
                id: user.id,
                nickname: user.nickname,
                fullName: user.full_name
                // Email və digər həssas olmayan datanı da əlavə etmək olar
            };
            console.log(`[API /login] req.session.user təyin edildi:`, JSON.stringify(req.session.user)); // Datanın təyin olunduğunu yoxla

            // Sessionu AÇIQ ŞƏKİLDƏ YADDA SAXLA və cavabı GÖZLƏ
            req.session.save(saveErr => {
                if (saveErr) {
                    console.error("[API /login] Session save xətası:", saveErr);
                     if (!res.headersSent) {
                         return res.status(500).json({ message: 'Session yaradılarkən xəta baş verdi (save).' });
                     } else {
                         console.error("[API /login] Save xətası oldu amma cavab artıq göndərilmişdi.");
                         return;
                     }
                }
                // Session uğurla DB-də saxlandıqdan sonra cavab göndər
                console.log(`[API /login] UĞURLU: Session saxlandı. User: ${req.session.user?.nickname}, SessionID: ${req.sessionID}`);
                 if (!res.headersSent) {
                      // Frontendə nickname qaytarmaq faydalıdır (URL yaratmaq üçün vs.)
                      res.status(200).json({ message: 'Giriş uğurlu!', nickname: user.nickname });
                 } else {
                      console.warn("[API /login] Session save callback-i işlədi amma cavab artıq göndərilmişdi?");
                 }
            });
        });

    } catch (error) {
        console.error("[API /login] Ümumi giriş xətası:", error);
         if (!res.headersSent) {
             res.status(500).json({ message: 'Server xətası.' });
         }
    } finally {
        if (client) {
            client.release(); // Bağlantını pool-a qaytar
            console.log(`[API /login] DB bağlantısı buraxıldı (Finally bloku).`);
        }
    }
});

// ----- Çıxış Endpoint-i (/logout) -----
app.post('/logout', (req, res) => {
  if (req.session.user) {
    const nickname = req.session.user.nickname;
    console.log(`[API /logout] Çıxış tələbi alındı: ${nickname}, SessionID: ${req.sessionID}`);
    req.session.destroy(err => {
      if (err) {
        console.error("[API /logout] Session destroy xətası:", err);
        return res.status(500).json({ message: "Çıxış zamanı xəta baş verdi." });
      }
      // connect-pg-simple DB-dən avtomatik silməlidir
      // Cookie-ni təmizləmək brauzerə kömək edir
      res.clearCookie('connect.sid'); // Standart session cookie adı (əgər dəyişməyibsə)
      console.log(`[API /logout] İstifadəçi çıxış etdi: ${nickname}. Session məhv edildi.`);
      res.status(200).json({ message: "Uğurla çıxış edildi." });
    });
  } else {
    console.log(`[API /logout] Çıxış tələbi alındı amma aktiv session yox idi.`);
    res.status(400).json({ message: "Giriş edilməyib." });
  }
});

// ----- Autentifikasiya Vəziyyətini Yoxlama Endpoint-i (/check-auth) -----
app.get('/check-auth', (req, res) => {
  console.log(`--- /check-auth sorğusu gəldi ---`);
  console.log(`Sorğu üçün Session ID: ${req.sessionID}`);
  console.log(`Server req.session obyektini görür mü? ${!!req.session}`);
  // user obyektinin içini də loglayaq (əgər varsa)
  console.log(`Server req.session.user obyektini görür mü? ${!!req.session?.user}`, req.session?.user ? `(${JSON.stringify(req.session.user)})` : '');

  if (req.session && req.session.user && req.session.user.id) {
    // Giriş edilib, həssas olmayan məlumatları qaytar
    console.log(`[/check-auth] Cavab: Uğurlu. User: ${req.session.user.nickname}, SessionID=${req.sessionID}`);
    console.log('--------------------------------');
    res.status(200).json({ loggedIn: true, user: req.session.user });
  } else {
    // Giriş edilməyib və ya sessionda user datası yoxdur
    console.log('Server session və ya user datasını bu sorğu üçün tapa bilmir!');
    console.log('--------------------------------');
    // Status 401 göndərildiyindən əmin olmaq üçün
     res.status(401).json({ loggedIn: false, message: 'Sessiya tapılmadı və ya etibarsızdır.' });
  }
});


// ----- Profil Məlumatlarını Almaq Endpoint-i (/profile/:nickname) -----
// Qeyd: Frontend bu endpointə müraciət edir, :nickname parametrini saxlayırıq
// Ancaq təhlükəsizlik üçün yalnız giriş etmiş istifadəçinin öz profilinə baxmasına icazə veririk.
app.get('/profile/:nickname', isAuthenticated, async (req, res) => {
  const requestedNickname = req.params.nickname;
  const loggedInNickname = req.session.user.nickname; // isAuthenticated bunu təmin edir
  const loggedInUserId = req.session.user.id;

  console.log(`[API /profile GET] Sorğu: ${requestedNickname}, Giriş edən: ${loggedInNickname}`);

  // Parametrdəki nickname ilə sessiondakı nickname eyni olmalıdır
  if (loggedInNickname.toLowerCase() !== requestedNickname.toLowerCase()) {
      console.warn(`[API /profile GET] İcazə xətası: ${loggedInNickname} istifadəçisi ${requestedNickname} profilinə baxmağa çalışdı.`);
    return res.status(403).json({ message: 'Başqasının profilinə baxmaq icazəsi yoxdur.' });
  }

  let client;
  try {
      client = await pool.connect();
    // DB-dən məlumatları al (şifrəsiz)
    const result = await client.query('SELECT id, full_name, email, nickname FROM users WHERE id = $1', [loggedInUserId]);
    if (result.rowCount > 0) {
      console.log(`[API /profile GET] Profil məlumatları tapıldı: ${loggedInNickname}`);
      res.status(200).json(result.rows[0]);
    } else {
      // Bu baş verməməlidir, çünki isAuthenticated userin mövcud olduğunu yoxlayır
      console.error(`[API /profile GET] Xəta: authenticated user (ID: ${loggedInUserId}) DB-də tapılmadı!`);
      res.status(404).json({ message: 'İstifadəçi tapılmadı (DB-də). Bu gözlənilməz xətadır.' });
    }
  } catch(error) {
      console.error("[API /profile GET] Profil alma xətası:", error);
      res.status(500).json({ message: 'Server xətası.' });
   } finally {
      if (client) client.release();
  }
});

// ----- Profil Məlumatlarını Yeniləmək Endpoint-i (/profile/:nickname) -----
app.put('/profile/:nickname', isAuthenticated, async (req, res) => {
  const currentNicknameFromParam = req.params.nickname;
  const loggedInUserId = req.session.user.id;
  const loggedInNickname = req.session.user.nickname;
  const { fullName, email, nickname: newNickname, password } = req.body; // Frontend 'nickname' göndərir

  console.log(`[API /profile PUT] Sorğu: ${currentNicknameFromParam}, Giriş edən: ${loggedInNickname}, Yeni Data:`, {fullName, email, newNickname, password: password ? '***' : 'N/A'});

  // Yenə də yoxlayaq ki, user öz profilini dəyişir
  if (loggedInNickname.toLowerCase() !== currentNicknameFromParam.toLowerCase()) {
      console.warn(`[API /profile PUT] İcazə xətası: ${loggedInNickname} istifadəçisi ${currentNicknameFromParam} profilini dəyişməyə çalışdı.`);
    return res.status(403).json({ message: 'Başqasının profilini dəyişməyə icazə yoxdur.' });
  }

  // Validasiyalar (yeni dəyərlər üçün)
  if (!fullName || !email || !newNickname) {
      console.log('[API /profile PUT] Xəta: Ad/Email/Nickname boşdur.');
      return res.status(400).json({ message: 'Ad Soyad, E-poçt və Nickname boş ola bilməz.' });
  }
  if (/\s/.test(newNickname)) {
      console.log('[API /profile PUT] Xəta: Yeni nickname-də boşluq var.');
      return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' });
   }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.log('[API /profile PUT] Xəta: Yeni email formatı yanlışdır.');
      return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' });
  }

  let client;
  try {
      client = await pool.connect();
      console.log('[API /profile PUT] DB bağlantısı alındı.');

    // Unikallıq yoxlaması (email, newNickname - özündən başqa)
    const emailExists = await client.query('SELECT 1 FROM users WHERE email = $1 AND id != $2 LIMIT 1', [email, loggedInUserId]);
    if (emailExists.rowCount > 0) {
        console.log(`[API /profile PUT] Xəta: E-poçt (${email}) artıq başqası tərəfindən istifadə olunur.`);
        return res.status(409).json({ message: 'Bu e-poçt artıq başqası tərəfindən istifadə olunur.' });
    }
    const nicknameExists = await client.query('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) AND id != $2 LIMIT 1', [newNickname, loggedInUserId]);
    if (nicknameExists.rowCount > 0) {
        console.log(`[API /profile PUT] Xəta: Nickname (${newNickname}) artıq başqası tərəfindən istifadə olunur.`);
        return res.status(409).json({ message: 'Bu nickname artıq başqası tərəfindən istifadə olunur.' });
    }

    // Məlumatları yeniləmək üçün UPDATE sorğusu
    let updateFields = ['full_name = $1', 'email = $2', 'nickname = $3'];
    let queryParams = [fullName, email, newNickname];
    let paramIndex = 4; // PostgreSQL parametr indeksləri 1-dən başlayır

    if (password) { // Yeni şifrə varsa
      if (password.length < 6) {
           console.log('[API /profile PUT] Xəta: Yeni şifrə çox qısadır.');
           return res.status(400).json({ message: 'Yeni şifrə minimum 6 simvol olmalıdır.' });
      }
      console.log('[API /profile PUT] Yeni şifrə hashlanır...');
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      updateFields.push(`password_hash = $${paramIndex}`);
      queryParams.push(hashedPassword);
      paramIndex++;
    }

    // WHERE şərtini əlavə edək
    queryParams.push(loggedInUserId);

    const updateQuery = `
      UPDATE users SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, full_name, email, nickname; -- Yenilənmiş məlumatları qaytar
    `;
     console.log('[API /profile PUT] Update sorğusu hazırlanır...');
    const result = await client.query(updateQuery, queryParams);

    if (result.rowCount === 0) {
        // Bu baş verməməlidir
        console.error(`[API /profile PUT] Xəta: Yenilənəcək istifadəçi (ID: ${loggedInUserId}) tapılmadı.`);
        return res.status(404).json({ message: 'Yenilənəcək istifadəçi tapılmadı.' });
    }
    const updatedUser = result.rows[0];
    console.log(`[API /profile PUT] Profil DB-də yeniləndi: ${updatedUser.nickname}`);

    // Sessionu yenilə (yeni nickname və ad ilə)
    req.session.user.nickname = updatedUser.nickname;
    req.session.user.fullName = updatedUser.full_name;
    console.log('[API /profile PUT] Session yenilənir...');

    req.session.save((saveErr) => { // Save etmək vacibdir!
      if (saveErr) {
        console.error("[API /profile PUT] Session save xətası (profil):", saveErr);
        // DB yeniləndi, amma session yox -> istifadəçiyə məlumat verək
        return res.status(500).json({ message: 'Profil DB-də yeniləndi, lakin sessiya yenilənərkən xəta baş verdi. Zəhmət olmasa təkrar giriş edin.' });
      }
      console.log(`[API /profile PUT] UĞURLU: Profil və session yeniləndi: ${updatedUser.nickname}, SessionID: ${req.sessionID}`);
      // Frontendə yenilənmiş user datasını (həssas olmayan) göndərək
      res.status(200).json({ message: 'Profil uğurla yeniləndi!', updatedUser: updatedUser });
    });

  } catch (error) {
    console.error("[API /profile PUT] Profil yeniləmə xətası:", error);
    // Unique constraint xətalarını yoxla
    if (error.code === '23505') {
        if (error.constraint && error.constraint.includes('email')) {
             return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' });
         }
         if (error.constraint && error.constraint.includes('nickname')) {
             return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' });
         }
    }
    res.status(500).json({ message: 'Server xətası.' });
  } finally {
      if (client) {
          client.release();
          console.log('[API /profile PUT] DB bağlantısı buraxıldı.');
      }
  }
});


// ----- Default Kök Route (/) -----
app.get('/', (req, res) => {
    console.log(`[API GET /] Kök route sorğusu. SessionID=${req.sessionID}, User=${req.session.user?.nickname || 'N/A'}`);
    if (req.session && req.session.user && req.session.user.id) {
        // Giriş edilib, oyunlar səhifəsinə yönləndir
        console.log('[API GET /] Aktiv sessiya var, oyunlara yönləndirilir.');
        res.redirect('/OYUNLAR/oyunlar/oyunlar.html'); // Frontend faylının düzgün yolu
    } else {
        // Giriş edilməyib, login səhifəsinə yönləndir
        console.log('[API GET /] Aktiv sessiya yoxdur, loginə yönləndirilir.');
        res.redirect('/ANA SEHIFE/login/login.html'); // Frontend faylının düzgün yolu
    }
});


// --- Part 2 Sonu ---
// server.js
// Part 3/3 - Socket.IO Logic & Server Start

// ... (Part 1 və Part 2-dən sonra gələn kod) ...

// ============================================
// ===== SOCKET.IO HADISƏLƏRİ (EVENTS) ======
// ============================================
console.log('[Setup] Socket.IO konfiqurasiyası başlayır...');

// Socket.IO üçün Session Middleware-i istifadə etmək üçün yardımçı funksiya
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

// Session middleware-i Socket.IO üçün də tətbiq et
io.use(wrap(sessionMiddleware));
console.log('[Setup] Socket.IO üçün session middleware tətbiq edildi.');

// Socket.IO bağlantılarını yalnız giriş etmiş istifadəçilər üçün qəbul etmək
io.use((socket, next) => {
  // Wrap edilmiş session middleware sayəsində socket.request.session mövcuddur
  // Və biz artıq API endpointlərində req.session.user təyin etmişik
  if (socket.request.session && socket.request.session.user && socket.request.session.user.nickname) {
    // Session-dakı user məlumatını socket obyektinə əlavə edirik ki, asan çataq
    socket.user = { ...socket.request.session.user }; // Kopyasını alırıq
    console.log(`[Socket Auth] Socket üçün user təyin edildi: ${socket.user.nickname} (Socket ID: ${socket.id})`);
    next(); // Bağlantıya icazə ver
  } else {
    console.warn(`[Socket Auth] Giriş edilməmiş socket bağlantısı rədd edildi (SessionID: ${socket.request.sessionID || 'N/A'}).`);
    // Xəta mesajını dəyişdirək ki, frontend daha yaxşı anlasın
    next(new Error('Authentication error')); // Xəta ilə bağlantını rədd et
  }
});
console.log('[Setup] Socket.IO üçün autentifikasiya middleware təyin edildi.');


// ----- Yeni Socket Bağlantısı Gəldikdə... -----
io.on('connection', (socket) => {
  // Artıq istifadəçinin kim olduğunu `socket.user`-dan bilirik
  // Bu nöqtəyə çatıbsa, deməli istifadəçi giriş edib
  console.log(`[Socket Connect] İstifadəçi qoşuldu: ${socket.user.nickname} (Socket ID: ${socket.id})`);

  // Qoşulan istifadəçini 'users' yaddaş obyektinə əlavə edirik
  // Əgər eyni user başqa tabdan/cihazdan qoşulursa, köhnə bağlantı disconnect olmalıdır
  // Daha robust həll üçün user ID əsaslı mapping də olmalıdır, amma hələlik socket.id
  users[socket.id] = {
      id: socket.id, // Socket ID
      userId: socket.user.id, // İstifadəçi ID (DB-dən)
      username: socket.user.nickname, // İstifadəçi adı (Sessiondan)
      currentRoom: null // Başlanğıcda heç bir otaqda deyil
  };

  // Qoşulan istifadəçiyə mövcud otaq siyahısını dərhal göndər
  // broadcastRoomList() bütün otaq siyahısını göndərəcək, amma fərdi də göndərə bilərik
    const initialRoomList = Object.values(rooms).map(room => ({
        id: room.id, name: room.name, playerCount: room.players.length,
        hasPassword: !!room.password, boardSize: room.boardSize,
        creatorUsername: room.creatorUsername,
        player1Username: room.players[0] ? users[room.players[0]]?.username : null,
        player2Username: room.players[1] ? users[room.players[1]]?.username : null,
    }));
  socket.emit('room_list_update', initialRoomList);
  console.log(`[Socket Connect] İlkin otaq siyahısı ${socket.user.nickname}-ə göndərildi.`);

  // ----- Otaq Əməliyyatları Dinləyiciləri -----

  socket.on('create_room', (data) => {
    // User məlumatı artıq socket.user-dadır
    const user = socket.user;
    const currentUserSocketInfo = users[socket.id]; // Cari socket məlumatı
    console.log(`[Socket Event] create_room hadisəsi (${user.nickname}):`, data);

    // Validasiyalar
    if (!data || !data.name || data.name.trim().length === 0) {
        console.warn(`[create_room] Xəta: Otaq adı boşdur.`);
        return socket.emit('creation_error', 'Otaq adı boş ola bilməz.');
    }
    if (data.password && data.password.length > 0) {
      if (data.password.length < 2 || !(/[a-zA-Z]/.test(data.password) && /\d/.test(data.password))) {
          console.warn(`[create_room] Xəta: Şifrə tələblərə uymur.`);
          return socket.emit('creation_error', 'Şifrə tələblərə uyğun deyil (min 2 krk, 1 hərf+1 rəqəm).');
      }
    }
    // İstifadəçinin başqa otaqda olub olmadığını yoxla
    if (currentUserSocketInfo?.currentRoom) {
        const existingRoomId = currentUserSocketInfo.currentRoom;
        console.warn(`[create_room] Xəta: ${user.nickname} artıq ${existingRoomId} otağındadır.`);
        return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız. Yeni otaq yaratmaq üçün əvvəlcə mövcud otaqdan çıxın.');
    }

    const newRoomId = generateRoomId();
    const boardSize = parseInt(data.boardSize, 10) || 3; // Default 3x3
    const validatedBoardSize = Math.max(3, Math.min(6, boardSize)); // 3-6 arası

    const newRoom = {
      id: newRoomId,
      name: data.name.trim().slice(0, 30), // Max 30 simvol
      password: data.password || null,
      players: [socket.id], // Yaradan ilk oyunçu
      boardSize: validatedBoardSize,
      creatorUsername: user.nickname,
      gameState: null // Oyun başlayanda təyin olunacaq
    };

    rooms[newRoomId] = newRoom; // Yeni otağı yaddaşa əlavə et
    if(currentUserSocketInfo) currentUserSocketInfo.currentRoom = newRoomId; // İstifadəçinin otağını təyin et
    socket.join(newRoomId); // Socket.IO otağına qoşul (broadcast üçün)

    console.log(`[create_room] Otaq yaradıldı: ID=${newRoomId}, Adı=${newRoom.name}, Yaradan=${user.nickname}, Ölçü=${newRoom.boardSize}`);

    // Otağı yaradana qoşulma məlumatını göndər (eyni anda həm yaradıldı, həm qoşuldu)
    socket.emit('room_joined', { roomId: newRoomId, roomName: newRoom.name, boardSize: newRoom.boardSize });

    // Bütün qoşulu clientlərə yenilənmiş otaq siyahısını göndər
    broadcastRoomList();
  });

  socket.on('join_room', (data) => {
    const user = socket.user;
    const currentUserSocketInfo = users[socket.id];
    console.log(`[Socket Event] join_room hadisəsi (${user.nickname}):`, data);

    if (!data || !data.roomId) {
        console.warn(`[join_room] Xəta: Keçərsiz data.`);
        return socket.emit('join_error', 'Otaq ID göndərilmədi.');
    }

    const room = rooms[data.roomId];

    // Yoxlamalar
    if (!room) {
        console.warn(`[join_room] Xəta: Otaq (${data.roomId}) tapılmadı.`);
        return socket.emit('join_error', 'Otaq tapılmadı.');
    }
    if (currentUserSocketInfo?.currentRoom) {
        console.warn(`[join_room] Xəta: ${user.nickname} artıq başqa otaqdadır (${currentUserSocketInfo.currentRoom}).`);
        return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.');
    }
    if (room.players.length >= 2) {
         console.warn(`[join_room] Xəta: Otaq (${data.roomId}) doludur.`);
        return socket.emit('join_error', 'Otaq doludur.');
    }
    // Öz yaratdığı otağa təkrar qoşulmağa çalışmamasını yoxla (əgər players array-də varsa)
    if (room.players.includes(socket.id)) {
        console.warn(`[join_room] Xəta: ${user.nickname} artıq bu otaqdadır.`);
        // Xəta vermək əvəzinə, sadəcə 'room_joined' göndərmək olar
         return socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });
        // return socket.emit('join_error', 'Siz artıq bu otaqdasınız.');
    }
    if (room.password && room.password !== data.password) {
        console.warn(`[join_room] Xəta: Otaq (${data.roomId}) üçün şifrə yanlışdır.`);
        return socket.emit('join_error', 'Şifrə yanlışdır.');
    }

    // Otağa qoşulma
    room.players.push(socket.id);
    if(currentUserSocketInfo) currentUserSocketInfo.currentRoom = room.id;
    socket.join(room.id);

    console.log(`[join_room] İstifadəçi ${user.nickname} (${socket.id}) otağa qoşuldu: ${room.name} (${room.id})`);

    // Qoşulan istifadəçiyə təsdiq göndər
    socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });

    // Otaq siyahısını yenilə (playerUsernames yenilənməlidir)
    broadcastRoomList();

    // --- Oyun Başlama Məntiqi (İkinci oyunçu qoşulduqda) ---
    if (room.players.length === 2) {
        console.log(`[join_room] Otaq ${room.id} doldu. Oyun başlama prosesi...`);
        const player1SocketId = room.players[0];
        const player2SocketId = room.players[1]; // Yeni qoşulan
        const player1 = users[player1SocketId];
        const player2 = users[player2SocketId]; // Yeni qoşulanın məlumatı

        if (player1 && io.sockets.sockets.get(player1SocketId)) {
            io.to(player1SocketId).emit('opponent_joined', { // Birinciyə rəqibin qoşulduğunu bildir
                 username: player2?.username || 'Rəqib'
            });
            // 'game_start' burada göndərilməməlidir, çünki zər atma və simvol seçimi olacaq
            // Əgər zər atma yoxdursa, burada 'game_start' göndərilə bilər
             console.log(`[join_room] 'opponent_joined' ${player1.username}-ə göndərildi.`);
        } else {
             console.warn(`[join_room] Player 1 (${player1SocketId}) tapılmadı və ya aktiv deyil.`);
        }
         // İkinci oyunçuya da birinci oyunçunun adını göndərə bilərik (əgər oda_ici.js bunu gözləyirsə)
         if (player2 && io.sockets.sockets.get(player2SocketId)) {
              // Bura 'game_start' və ya bənzər bir hadisə əlavə etmək olar ki,
              // ikinci oyunçu da birinci oyunçunun adını bilsin. Amma oda_ici.js URL-dən alır.
              console.log(`[join_room] ${player2.username} qoşuldu və rəqib məlumatı ${player1?.username}-ə göndərildi.`);
         }
    }
  });

  socket.on('leave_room', () => {
      console.log(`[Socket Event] leave_room hadisəsi (${socket.user?.nickname || socket.id})`);
    handleDisconnectOrLeave(socket); // Otaqdan ayrılmanı idarə et
  });


  // ----- Oyun Gedişləri və Digər Oyun İçi Hadisələr -----

  socket.on('make_move', (data) => {
    const user = socket.user;
    const currentUserSocketInfo = users[socket.id];
    const roomId = currentUserSocketInfo?.currentRoom;
    console.log(`[Socket Event] make_move: User=${user?.nickname}, Room=${roomId}, Data=`, data);

    if (!user || !roomId || !rooms[roomId]) {
         console.warn(`[make_move] Keçərsiz şərtlər: User=${!!user}, RoomID=${roomId}, RoomExists=${!!rooms[roomId]}`);
         return; // Xəta mesajı göndərmək olar
    }
    const room = rooms[roomId];

    // Sadə yoxlama: Oyunçu otağın üzvüdürmü?
    if (!room.players.includes(socket.id)) {
         console.warn(`[make_move] Xəta: ${user.nickname} (${socket.id}) ${roomId} otağının üzvü deyil.`);
         return;
    }

    // Gediş məlumatlarını (index və edən oyunçu) otaqdakı DİGƏR oyunçuya göndər
    // `socket.to(roomId)` istifadə edirik ki, özünə göndərməsin
    // Simvolu da göndərmək faydalı ola bilər
    socket.to(roomId).emit('opponent_moved', { index: data.index, symbol: data.symbol }); // symbol əlavə etdik
     console.log(`[make_move] Gediş ${roomId} otağındakı rəqib(lər)ə göndərildi.`);

    // Server tərəfində oyun vəziyyətini yoxlamaq/yeniləmək lazım gələrsə, burada edilir
    // Məsələn: rooms[roomId].gameState.board[data.index] = data.symbol;
  });

   // Oyunun yenidən başladılması tələbi
   socket.on('request_restart', () => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;
       if (roomId && rooms[roomId] && user) {
           console.log(`[Socket Event] Restart tələbi: Room=${roomId}, User=${user.nickname}`);
           // Tələbi digər oyunçuya göndər
           socket.to(roomId).emit('restart_requested', { requester: user.nickname });
       } else {
           console.warn(`[request_restart] Keçərsiz şərtlər.`);
       }
   });

   // Yenidən başlatma tələbinin qəbulu
   socket.on('accept_restart', () => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;
       if (roomId && rooms[roomId] && user) {
           console.log(`[Socket Event] Restart qəbul edildi: Room=${roomId}, User=${user.nickname}`);
           // Hər iki oyunçuya oyunu yenidən başlatma siqnalı göndər
           io.to(roomId).emit('restart_game'); // Həm tələb edənə, həm qəbul edənə
           // Server tərəfində oyun vəziyyətini sıfırla (əgər varsa)
           // rooms[roomId].gameState = initializeGameState(rooms[roomId].boardSize);
           console.log(`[accept_restart] 'restart_game' hadisəsi ${roomId} otağına göndərildi.`);
       } else {
            console.warn(`[accept_restart] Keçərsiz şərtlər.`);
       }
   });

   // Zər atma nəticəsi (əgər server təsdiqi lazımdırsa) - Bu nümunədə istifadə edilmir, client-side edilir
   // socket.on('dice_roll_result', (data) => { ... });

   // Simvol seçimi nəticəsi (əgər server təsdiqi lazımdırsa) - Bu nümunədə istifadə edilmir
   // socket.on('symbol_chosen', (data) => { ... });


  // ----- Bağlantı Kəsildikdə -----
  socket.on('disconnect', (reason) => {
    console.log(`[Socket Disconnect] İstifadəçi ayrıldı: ${socket.user?.nickname || socket.id}. Səbəb: ${reason}`);
    handleDisconnectOrLeave(socket); // Bağlantı kəsilməsini idarə et
  });

  // ----- Otaqdan Ayrılma / Bağlantı Kəsilmə Funksiyası -----
  // Bu funksiya həm 'leave_room' həm də 'disconnect' üçün çağırılır
  function handleDisconnectOrLeave(socketInstance) {
    const leavingUserSocketInfo = users[socketInstance.id];
    // Əgər user artıq 'users' obyektindən silinibsə (məs. disconnect iki dəfə çağrılırsa)
    if (!leavingUserSocketInfo) {
         console.log(`[handleDisconnectOrLeave] İstifadəçi (${socketInstance.id}) artıq users obyektində yoxdur.`);
         return;
    }

    const roomId = leavingUserSocketInfo.currentRoom;
    const username = leavingUserSocketInfo.username;

    console.log(`[handleDisconnectOrLeave] İstifadəçi: ${username} (${socketInstance.id}), Otaq: ${roomId || 'Yoxdur'}`);

    // İstifadəçini 'users' obyektindən dərhal sil
    delete users[socketInstance.id];

    // Əgər bir otaqda idisə, otaqdan da çıxar
    if (roomId && rooms[roomId]) {
      console.log(`[handleDisconnectOrLeave] ${username} ${roomId} otağından çıxarılır...`);
      const room = rooms[roomId];
      // Oyunçunu otağın 'players' array-indən çıxar
      const playerIndex = room.players.indexOf(socketInstance.id);
      if (playerIndex > -1) {
          room.players.splice(playerIndex, 1);
           console.log(`[handleDisconnectOrLeave] ${username} otağın oyunçularından silindi.`);
      } else {
           console.warn(`[handleDisconnectOrLeave] ${username} (${socketInstance.id}) ${roomId} otağının oyunçuları arasında tapılmadı?`);
      }


      // Əgər otaq tamamilə boş qaldısa, otağı sil
      if (room.players.length === 0) {
        console.log(`[handleDisconnectOrLeave] Otaq ${roomId} ('${room.name}') boş qaldı və silinir.`);
        delete rooms[roomId];
      } else {
        // Əgər otaqda başqa oyunçu qaldısa, ona rəqibin ayrıldığını bildir
        const remainingPlayerId = room.players[0]; // Tək oyunçu qalıb
         const remainingPlayerSocket = io.sockets.sockets.get(remainingPlayerId);
        if (remainingPlayerSocket) { // Qalan oyunçu hələ də qoşuludursa
             console.log(`[handleDisconnectOrLeave] Qalan oyunçuya (${users[remainingPlayerId]?.username}) rəqibin (${username}) ayrıldığı bildirilir.`);
          // opponent_left yox, opponent_left_game göndərək (oyun zamanı ayrılma)
          remainingPlayerSocket.emit('opponent_left_game', { username: username });
          // Burada qalan oyunçunun oyun vəziyyətini də sıfırlamaq lazım ola bilər
        } else {
             console.warn(`[handleDisconnectOrLeave] Qalan oyunçu (${remainingPlayerId}) tapıldı amma aktiv deyil?`);
        }

        // Əgər ayrılan oyunçu otağın yaradanı idisə və başqa oyunçu qalıbsa,
        // yaradanı dəyişdirmək məntiqli ola bilər (amma vacib deyil)
        if (room.creatorUsername === username && room.players.length > 0) {
             const newCreatorUsername = users[room.players[0]]?.username || 'Naməlum';
             console.log(`[handleDisconnectOrLeave] Otaq yaradanı ${newCreatorUsername}-ə dəyişdirildi.`);
             room.creatorUsername = newCreatorUsername;
        }
      }
      // Otaq siyahısını bütün clientlərə yenilə (otaq silinsə də, qalanlar yenilənməlidir)
      broadcastRoomList();
    } else {
      console.log(`[handleDisconnectOrLeave] ${username} heç bir otaqda deyildi, yalnız users siyahısından silindi.`);
    }
  } // handleDisconnectOrLeave sonu

}); // io.on('connection', ...) sonu
console.log('[Setup] Socket.IO \'connection\' dinləyicisi təyin edildi.');


// ----- Serveri Başlatma -----
const PORT = process.env.PORT || 3000; // Render PORT mühit dəyişənini təyin edir
server.listen(PORT, () => {
    console.log('========================================');
    console.log(`---- Server ${PORT} portunda uğurla işə düşdü! ----`);
    console.log(`---- Canlı Ünvan (təxmini): http://localhost:${PORT} (Render öz ünvanını verəcək) ----`);
    console.log(`---- Server Başlama Zamanı: ${new Date().toISOString()} ----`);
    console.log('========================================');
});

// ----- Serverin Düzgün Dayanması (Optional but good practice) -----
process.on('SIGTERM', () => {
  console.log('SIGTERM siqnalı alındı. Server bağlanır...');
  server.close(() => {
    console.log('HTTP server bağlandı.');
    pool.end(() => { // DB pool-unu bağla
      console.log('Verilənlər bazası pool-u bağlandı.');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
    console.log('SIGINT siqnalı alındı (Ctrl+C). Server bağlanır...');
    server.close(() => {
        console.log('HTTP server bağlandı.');
        pool.end(() => {
            console.log('Verilənlər bazası pool-u bağlandı.');
            process.exit(0);
        });
    });
});

// --- Faylın Sonu ---