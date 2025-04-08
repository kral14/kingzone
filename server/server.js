// server.js (PostgreSQL + DB Session Store ilə Tam Yenilənmiş v3)
// Part 1/3

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
// Socket.IO üçün ping ayarlarını artırırıq (ani kəsilmələrin qarşısını almaq üçün)
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }, // Prod üçün daha dəqiq origin təyin etmək daha yaxşıdır
    pingInterval: 10000, // 10 saniyədə bir ping göndər (əvvəl 25 idi)
    pingTimeout: 15000   // Ping cavabını 15 saniyə gözlə (əvvəl 5 idi)
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
        // Lokal vaxtla göstərməyə çalışaq
        const dbTime = new Date(result.rows[0].now).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
        console.log(`---- Verilənlər bazasına uğurla qoşuldu: ${dbTime} ----`);
    } catch(e) {
         console.log('---- Verilənlər bazasına uğurla qoşuldu (zaman formatı xətası):', result.rows[0].now, '----');
    }
  });
});

// ---- Express Ayarları (Sessiondan əvvəl) ----
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // Proxy arxasında işləyərkən vacibdir
    console.log('[Setup] Express "trust proxy" ayarı aktiv edildi (production).');
}

// ---- Session Middleware Konfiqurasiyası (DÜZƏLİŞLİ) ----
if (!process.env.SESSION_SECRET) {
    console.error('FATAL ERROR: SESSION_SECRET mühit dəyişəni tapılmadı!');
    process.exit(1);
}
const sessionMiddleware = session({
  store: new pgSession({
    pool : pool,
    tableName : 'user_sessions', // DB-dəki cədvəl adı
    pruneSessionInterval: 60 * 10 // 10 dəqiqədə bir köhnə sessionları təmizlə (saniyə)
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Yalnız HTTPS üzərindən
    httpOnly: true, // Client-side JS oxuya bilməsin
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 gün
    sameSite: 'lax' // CSRF və yönləndirmələr üçün daha yaxşı
  }
});
app.use(sessionMiddleware);
console.log('[Setup] Session middleware (pgSession ilə) konfiqurasiya edildi və tətbiq olundu.');
console.log(`[Setup] Session cookie ayarları: secure=${process.env.NODE_ENV === 'production'}, httpOnly=true, maxAge=${1000 * 60 * 60 * 24 * 7}, sameSite='lax'`);

// ---- Digər Middleware-lər ----
app.use(express.json()); // JSON request body-lərini parse et
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath)); // Statik faylları public qovluğundan ver
console.log('[Setup] JSON parser və Static files middleware tətbiq edildi. Statik qovluq:', publicDirectoryPath);

// ---- Autentifikasiya Middleware Funksiyası ----
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.id) {
    return next(); // Giriş edilib, davam et
  } else {
    console.warn(`[Auth Middleware] Giriş tələb olunan route üçün icazə verilmədi. SessionID: ${req.sessionID || 'N/A'}`);
    return res.status(401).json({ message: 'Bu əməliyyat üçün giriş tələb olunur.' });
  }
};

// ----- Yardımçı Funksiyalar və Global Dəyişənlər (Otaqlar üçün) -----
let rooms = {}; // Aktiv oyun otaqları (yaddaşda)
let users = {}; // Qoşulu olan socket bağlantıları (yaddaşda)

function generateRoomId() {
    // Daha qısa və unikal ID generasiyası (əgər ehtiyac varsa)
    return require('crypto').randomBytes(6).toString('hex'); // Məsələn: 12 simvollu hex
}

// Otaq siyahısını formatlayıb bütün clientlərə göndərən funksiya (YENİLƏNMİŞ)
function broadcastRoomList() {
    try {
        const roomListForClients = Object.values(rooms)
            .map(room => ({
                id: room.id,
                name: room.name,
                playerCount: room.players.length,
                hasPassword: !!room.password, // Şifrə varsa true
                boardSize: room.boardSize,
                creatorUsername: room.creatorUsername,
                player1Username: room.players[0] ? users[room.players[0]]?.username : null,
                player2Username: room.players[1] ? users[room.players[1]]?.username : null,
                isAiRoom: !!room.isAiRoom // <<< AI bayrağını göndər
            }));
        io.emit('room_list_update', roomListForClients);
    } catch (error) {
        console.error("[broadcastRoomList] XƏTA:", error);
        io.emit('room_list_update', []); // Xəta olsa boş siyahı göndər
    }
}

// ----- Standart AI Otaqlarını Yaratmaq Funksiyası (YENİLƏNMİŞ) -----
function createDefaultRooms() {
    // İstənilən adlar və ölçülər
    const defaultRoomsData = [
        { name: "SNOW ilə 3x3", size: 3, isAi: true },
        { name: "SNOW ilə 4x4", size: 4, isAi: true },
        { name: "SNOW ilə 5x5", size: 5, isAi: true },
        { name: "SNOW ilə 6x6", size: 6, isAi: true }
    ];
    let createdCount = 0;

    defaultRoomsData.forEach(roomData => {
        // Eyni adda AI otağının olub olmadığını yoxla
        const exists = Object.values(rooms).some(room => room.name === roomData.name && room.isAiRoom);
        if (!exists) {
            const roomId = `ai_${generateRoomId()}`; // ID-lərini fərqləndirək
            rooms[roomId] = {
                id: roomId,
                name: roomData.name,
                password: null, // AI otaqları şifrəsizdir
                players: [], // AI otağına oyunçu yalnız qoşulur, "Sistem" yaratmır
                boardSize: roomData.size,
                creatorUsername: "SNOW", // Rəmzi yaradan
                gameState: null,
                isAiRoom: roomData.isAi // AI otağı olduğunu bildirən flag
            };
            createdCount++;
        }
    });
     if (createdCount > 0) {
         console.log(`[Setup] ${createdCount} ədəd standart AI otağı yaradıldı/mövcud idi.`);
     } else {
         console.log('[Setup] Bütün standart AI otaqları artıq mövcud idi.');
     }
     // İlkin siyahını göndərmək üçün broadcast etməyə ehtiyac yoxdur,
     // onsuz da yeni qoşulan clientlərə göndəriləcək.
}

// --- Part 1 Sonu ---
// server.js
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
    const newUserId = Date.now().toString(); // Və ya DB SERIAL

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
    if (error.code === '23505') { // Unique violation
        if (error.constraint && error.constraint.includes('email')) {
             return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' });
         }
         if (error.constraint && error.constraint.includes('nickname')) {
             return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' });
         }
    }
    if (!res.headersSent) {
         res.status(500).json({ message: 'Server xətası baş verdi.' });
    }
  } finally {
    if (client) {
        client.release();
         console.log('[API /register] DB bağlantısı buraxıldı.');
    }
  }
});

// ----- Giriş Endpoint-i (/login) - Ən Son Düzəlişlərlə -----
app.post('/login', async (req, res) => {
    const { nickname, password } = req.body;
    let client;

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

        req.session.regenerate(regenerateErr => {
            if (regenerateErr) {
                console.error("[API /login] Session regenerate xətası:", regenerateErr);
                if (!res.headersSent) {
                   return res.status(500).json({ message: 'Session yaradılarkən xəta baş verdi (regenerate).' });
                }
                return console.error("[API /login] Regenerate xətası oldu amma cavab artıq göndərilmişdi.");
            }

            const newSessionID = req.sessionID;
            console.log(`[API /login] Session regenerate edildi. Yeni SessionID=${newSessionID}. User datası təyin edilir...`);

            req.session.user = {
                id: user.id,
                nickname: user.nickname,
                fullName: user.full_name
            };
            console.log(`[API /login] req.session.user təyin edildi:`, JSON.stringify(req.session.user));

            req.session.save(saveErr => {
                if (saveErr) {
                    console.error("[API /login] Session save xətası:", saveErr);
                     if (!res.headersSent) {
                         return res.status(500).json({ message: 'Session yaradılarkən xəta baş verdi (save).' });
                     }
                     return console.error("[API /login] Save xətası oldu amma cavab artıq göndərilmişdi.");
                }

                console.log(`[API /login] UĞURLU: Session saxlandı. User: ${req.session.user?.nickname}, SessionID: ${req.sessionID}`);
                 if (!res.headersSent) {
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
            client.release();
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
      res.clearCookie('connect.sid'); // Cookie adını yoxla, əgər fərqlidirsə düzəlt
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
  console.log(`Server req.session.user obyektini görür mü? ${!!req.session?.user}`, req.session?.user ? `(${JSON.stringify(req.session.user)})` : '');

  if (req.session && req.session.user && req.session.user.id) {
    console.log(`[/check-auth] Cavab: Uğurlu. User: ${req.session.user.nickname}, SessionID=${req.sessionID}`);
    console.log('--------------------------------');
    res.status(200).json({ loggedIn: true, user: req.session.user });
  } else {
    console.log('Server session və ya user datasını bu sorğu üçün tapa bilmir!');
    console.log('--------------------------------');
    res.status(401).json({ loggedIn: false, message: 'Sessiya tapılmadı və ya etibarsızdır.' });
  }
});


// ----- Profil Məlumatlarını Almaq Endpoint-i (/profile/:nickname) -----
app.get('/profile/:nickname', isAuthenticated, async (req, res) => {
  const requestedNickname = req.params.nickname;
  const loggedInNickname = req.session.user.nickname;
  const loggedInUserId = req.session.user.id;

  console.log(`[API /profile GET] Sorğu: ${requestedNickname}, Giriş edən: ${loggedInNickname}`);

  if (loggedInNickname.toLowerCase() !== requestedNickname.toLowerCase()) {
      console.warn(`[API /profile GET] İcazə xətası: ${loggedInNickname} istifadəçisi ${requestedNickname} profilinə baxmağa çalışdı.`);
    return res.status(403).json({ message: 'Başqasının profilinə baxmaq icazəsi yoxdur.' });
  }

  let client;
  try {
      client = await pool.connect();
    const result = await client.query('SELECT id, full_name, email, nickname FROM users WHERE id = $1', [loggedInUserId]);
    if (result.rowCount > 0) {
      console.log(`[API /profile GET] Profil məlumatları tapıldı: ${loggedInNickname}`);
      res.status(200).json(result.rows[0]);
    } else {
      console.error(`[API /profile GET] Xəta: authenticated user (ID: ${loggedInUserId}) DB-də tapılmadı!`);
      res.status(404).json({ message: 'İstifadəçi tapılmadı (DB-də). Gözlənilməz xəta.' });
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
  const { fullName, email, nickname: newNickname, password } = req.body;

  console.log(`[API /profile PUT] Sorğu: ${currentNicknameFromParam}, Giriş edən: ${loggedInNickname}, Yeni Data:`, {fullName, email, newNickname, password: password ? '***' : 'N/A'});

  if (loggedInNickname.toLowerCase() !== currentNicknameFromParam.toLowerCase()) {
      console.warn(`[API /profile PUT] İcazə xətası: ${loggedInNickname} ${currentNicknameFromParam} profilini dəyişməyə çalışdı.`);
    return res.status(403).json({ message: 'Başqasının profilini dəyişməyə icazə yoxdur.' });
  }

  // Validasiyalar
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

    // Unikallıq yoxlaması
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

    // Update sorğusu
    let updateFields = ['full_name = $1', 'email = $2', 'nickname = $3'];
    let queryParams = [fullName, email, newNickname];
    let paramIndex = 4;

    if (password) {
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

    queryParams.push(loggedInUserId); // WHERE üçün user ID

    const updateQuery = `
      UPDATE users SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, full_name, email, nickname;
    `;
     console.log('[API /profile PUT] Update sorğusu hazırlanır...');
    const result = await client.query(updateQuery, queryParams);

    if (result.rowCount === 0) {
        console.error(`[API /profile PUT] Xəta: Yenilənəcək istifadəçi (ID: ${loggedInUserId}) tapılmadı.`);
        return res.status(404).json({ message: 'Yenilənəcək istifadəçi tapılmadı.' });
    }
    const updatedUser = result.rows[0];
    console.log(`[API /profile PUT] Profil DB-də yeniləndi: ${updatedUser.nickname}`);

    // Sessionu yenilə
    req.session.user.nickname = updatedUser.nickname;
    req.session.user.fullName = updatedUser.full_name;
    console.log('[API /profile PUT] Session yenilənir...');

    req.session.save((saveErr) => {
      if (saveErr) {
        console.error("[API /profile PUT] Session save xətası (profil):", saveErr);
        return res.status(500).json({ message: 'Profil DB-də yeniləndi, lakin sessiya yenilənərkən xəta baş verdi. Təkrar giriş edin.' });
      }
      console.log(`[API /profile PUT] UĞURLU: Profil və session yeniləndi: ${updatedUser.nickname}, SessionID: ${req.sessionID}`);
      res.status(200).json({ message: 'Profil uğurla yeniləndi!', updatedUser: updatedUser });
    });

  } catch (error) {
    console.error("[API /profile PUT] Profil yeniləmə xətası:", error);
    if (error.code === '23505') { // Unique constraint
        if (error.constraint && error.constraint.includes('email')) {
             return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' });
         }
         if (error.constraint && error.constraint.includes('nickname')) {
             return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' });
         }
    }
     if (!res.headersSent) {
          res.status(500).json({ message: 'Server xətası baş verdi.' });
     }
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
        console.log('[API GET /] Aktiv sessiya var, oyunlara yönləndirilir.');
        res.redirect('/OYUNLAR/oyunlar/oyunlar.html'); // Frontend faylının düzgün yolu olduğundan əmin olun
    } else {
        console.log('[API GET /] Aktiv sessiya yoxdur, loginə yönləndirilir.');
        res.redirect('/ANA SEHIFE/login/login.html'); // Frontend faylının düzgün yolu olduğundan əmin olun
    }
});


// --- Part 2 Sonu ---
// server.js
// Part 3/3 - Socket.IO Logic & Server Start

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
  // socket.request obyektində session datası olmalıdır
  if (socket.request.session && socket.request.session.user && socket.request.session.user.nickname) {
    // Session user datasını socket obyektinə əlavə edək
    socket.user = { ...socket.request.session.user };
    console.log(`[Socket Auth] Socket üçün user təyin edildi: ${socket.user.nickname} (Socket ID: ${socket.id})`);
    next(); // Bağlantıya icazə ver
  } else {
    console.warn(`[Socket Auth] Giriş edilməmiş socket bağlantısı rədd edildi (SessionID: ${socket.request.sessionID || 'N/A'}).`);
    next(new Error('Authentication error')); // Xəta ilə bağlantını rədd et
  }
});
console.log('[Setup] Socket.IO üçün autentifikasiya middleware təyin edildi.');


// ----- Yeni Socket Bağlantısı Gəldikdə... -----
io.on('connection', (socket) => {
  // Qoşulmuş istifadəçi məlumatları socket.user-dadır
  console.log(`[Socket Connect] İstifadəçi qoşuldu: ${socket.user.nickname} (Socket ID: ${socket.id})`);

  // İstifadəçini 'users' yaddaş obyektinə əlavə et
  users[socket.id] = {
      id: socket.id,
      userId: socket.user.id,
      username: socket.user.nickname,
      currentRoom: null
  };

  // Qoşulan istifadəçiyə otaq siyahısını göndər (AI otaqları da daxil)
  try {
      const initialRoomList = Object.values(rooms).map(room => ({
          id: room.id, name: room.name, playerCount: room.players.length,
          hasPassword: !!room.password, boardSize: room.boardSize,
          creatorUsername: room.creatorUsername,
          player1Username: room.players[0] ? users[room.players[0]]?.username : null,
          player2Username: room.players[1] ? users[room.players[1]]?.username : null,
          isAiRoom: !!room.isAiRoom // AI bayrağını göndər
      }));
      socket.emit('room_list_update', initialRoomList);
      console.log(`[Socket Connect] İlkin otaq siyahısı ${socket.user.nickname}-ə göndərildi (${initialRoomList.length} otaq).`);
  } catch (listError) {
      console.error("[Socket Connect] İlkin otaq siyahısı göndərilərkən xəta:", listError);
      socket.emit('room_list_update', []); // Xəta olsa boş siyahı göndər
  }


  // ----- Otaq Əməliyyatları Dinləyiciləri -----

  socket.on('create_room', (data) => {
    const user = socket.user;
    const currentUserSocketInfo = users[socket.id];
    // İstifadəçi məlumatları olmalıdır, amma hər ehtimala qarşı yoxlayaq
    if(!user || !currentUserSocketInfo) {
         console.error(`[create_room] XƏTA: user və ya currentUserSocketInfo tapılmadı! Socket ID: ${socket.id}`);
         return socket.emit('creation_error', 'İstifadəçi məlumatları tapılmadı. Səhifəni yeniləyin.');
    }
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
    if (currentUserSocketInfo.currentRoom) {
        const existingRoomId = currentUserSocketInfo.currentRoom;
        console.warn(`[create_room] Xəta: ${user.nickname} artıq ${existingRoomId} otağındadır.`);
        return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız. Yeni otaq yaratmaq üçün əvvəlcə mövcud otaqdan çıxın.');
    }

    const newRoomId = generateRoomId(); // Yeni unikal ID
    const boardSize = parseInt(data.boardSize, 10) || 3;
    const validatedBoardSize = Math.max(3, Math.min(6, boardSize));

    const newRoom = {
      id: newRoomId,
      name: data.name.trim().slice(0, 30), // Max 30 simvol
      password: data.password || null,
      players: [socket.id], // Yaradanı daxil edirik, amma hələ ki, aktiv oyunçu deyil
      boardSize: validatedBoardSize,
      creatorUsername: user.nickname,
      gameState: null,
      isAiRoom: false // İstifadəçi yaratdığı otaq AI otağı deyil
    };

    rooms[newRoomId] = newRoom;
    // İstifadəçinin hansı otağı yaratdığını qeyd edirik
    currentUserSocketInfo.currentRoom = newRoomId;

    console.log(`[create_room] Otaq yaradıldı: ID=${newRoomId}, Adı=${newRoom.name}, Yaradan=${user.nickname}, Ölçü=${newRoom.boardSize}, Şifrəli=${!!newRoom.password}`);

    // AVTOMATİK GİRİŞ ETMƏMƏSİ ÜÇÜN:
    // socket.join(newRoomId); // Otağa klikləyəndə qoşulacaq
    // socket.emit('room_joined', ...); // Göndərmirik

    // Bütün clientlərə (yaradana da) yenilənmiş otaq siyahısını göndər
    broadcastRoomList();
    console.log(`[create_room] Otaq yaradıldıqdan sonra broadcastRoomList çağırıldı.`);
  });

  socket.on('join_room', (data) => {
    const user = socket.user;
    const currentUserSocketInfo = users[socket.id];
    console.log(`[Socket Event] join_room hadisəsi (${user?.nickname || 'Bilinməyən User'}):`, data);

    if(!user || !currentUserSocketInfo) {
        console.error(`[join_room] XƏTA: user və ya currentUserSocketInfo tapılmadı! Socket ID: ${socket.id}`);
        return socket.emit('join_error', 'İstifadəçi məlumatları tapılmadı. Səhifəni yeniləyin.');
    }
    if (!data || !data.roomId) {
        console.warn(`[join_room] Xəta: Keçərsiz data (roomId yoxdur).`);
        return socket.emit('join_error', 'Otaq ID göndərilmədi.');
    }

    const room = rooms[data.roomId];

    // Yoxlamalar
    if (!room) {
        console.warn(`[join_room] Xəta: Otaq (${data.roomId}) tapılmadı.`);
        return socket.emit('join_error', 'Otaq tapılmadı.');
    }
    // AI otağına qoşulma məntiqi fərqlidir, ona görə yoxlayaq
    if (room.isAiRoom) {
         console.warn(`[join_room] Xəta: ${user.nickname} AI otağına (${data.roomId}) 'join_room' ilə qoşulmağa çalışdı. Bu, kliklə birbaşa yönləndirmə ilə olmalıdır.`);
         // Client tərəfi səhvidir, amma xəta mesajı göndərək
         return socket.emit('join_error', 'AI otağına bu şəkildə qoşulmaq olmaz.');
    }
    // Başqa otaqda olmamaq
     if (currentUserSocketInfo.currentRoom && currentUserSocketInfo.currentRoom !== room.id) {
        console.warn(`[join_room] Xəta: ${user.nickname} artıq başqa otaqdadır (${currentUserSocketInfo.currentRoom}).`);
        return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.');
    }
     // Otaqda artıq olmamaq (əgər təsadüfən ikinci dəfə gələrsə)
     if (room.players.includes(socket.id)) {
         console.warn(`[join_room] ${user.nickname} artıq bu otaqdadır (${room.id}). 'room_joined' göndərilir.`);
         socket.join(room.id); // Socket otağına qoşulsun
         currentUserSocketInfo.currentRoom = room.id;
         return socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });
     }
    // Otağın dolu olmaması
    if (room.players.length >= 2) {
         console.warn(`[join_room] Xəta: Otaq (${data.roomId}) doludur.`);
        return socket.emit('join_error', 'Otaq doludur.');
    }

    // ŞİFRƏ YOXLAMASI (Dəqiqləşdirilmiş)
    if (room.password) {
        if (!data.password) {
             console.warn(`[join_room] Xəta: Otaq (${data.roomId}) şifrəlidir, amma şifrə göndərilmədi.`);
             return socket.emit('join_error', 'Bu otaq şifrəlidir. Şifrəni daxil edin.');
        }
        if (room.password !== data.password) {
            console.warn(`[join_room] Xəta: Otaq (${data.roomId}) üçün şifrə yanlışdır.`);
            return socket.emit('join_error', 'Şifrə yanlışdır.');
        }
         console.log(`[join_room] Şifrəli otaq (${data.roomId}) üçün şifrə doğrudur.`);
    } else {
         console.log(`[join_room] Otaq (${data.roomId}) şifrəsizdir, giriş edilir.`);
    }

    // Otağa qoşulma əməliyyatları
    room.players.push(socket.id);
    currentUserSocketInfo.currentRoom = room.id;
    socket.join(room.id); // <<< Qoşulan socketi Socket.IO otağına əlavə et

    console.log(`[join_room] İstifadəçi ${user.nickname} (${socket.id}) otağa qoşuldu: ${room.name} (${room.id})`);

    // Qoşulan istifadəçiyə təsdiq ('room_joined') göndər
    socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });

    // Otaq siyahısını yenilə (oyunçu sayı və adları üçün)
    broadcastRoomList();

    // Oyun Başlama Məntiqi (İkinci oyunçu qoşulduqda)
    if (room.players.length === 2) {
        console.log(`[join_room] Otaq ${room.id} doldu. Rəqib məlumatları göndərilir...`);
        const player1SocketId = room.players[0];
        const player2SocketId = room.players[1];
        const player1Info = users[player1SocketId];
        const player2Info = users[player2SocketId];

        // Birinci oyunçuya ikinci oyunçunun qoşulduğunu bildir
        if (player1Info && io.sockets.sockets.get(player1SocketId)) {
            io.to(player1SocketId).emit('opponent_joined', { username: player2Info?.username || 'Rəqib' });
            console.log(`[join_room] 'opponent_joined' ${player1Info.username}-ə göndərildi (${player2Info?.username} qoşuldu).`);
        }
    }
  });

  socket.on('leave_room', () => {
      console.log(`[Socket Event] leave_room hadisəsi (${socket.user?.nickname || socket.id})`);
    handleDisconnectOrLeave(socket);
  });

  // ----- Oyun Gedişləri və Digər Oyun İçi Hadisələr -----
  socket.on('make_move', (data) => {
    const user = socket.user;
    const currentUserSocketInfo = users[socket.id];
    const roomId = currentUserSocketInfo?.currentRoom;
    console.log(`[Socket Event] make_move: User=${user?.nickname}, Room=${roomId}, Data=`, data);

    if (!user || !roomId || !rooms[roomId] || !currentUserSocketInfo) return console.warn(`[make_move] Keçərsiz şərtlər.`);
    const room = rooms[roomId];
    if (!room.players.includes(socket.id)) return console.warn(`[make_move] ${user.nickname} otağın aktiv oyunçusu deyil.`);

    // Gedişi digər oyunçuya göndər
    socket.to(roomId).emit('opponent_moved', { index: data.index, symbol: data.symbol });
     console.log(`[make_move] Gediş ${roomId} otağındakı rəqib(lər)ə göndərildi.`);
  });

   socket.on('request_restart', () => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;
       if (roomId && rooms[roomId] && user) {
           console.log(`[Socket Event] Restart tələbi: Room=${roomId}, User=${user.nickname}`);
           socket.to(roomId).emit('restart_requested', { requester: user.nickname });
       } else { console.warn(`[request_restart] Keçərsiz şərtlər.`); }
   });

   socket.on('accept_restart', () => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;
       if (roomId && rooms[roomId] && user) {
           console.log(`[Socket Event] Restart qəbul edildi: Room=${roomId}, User=${user.nickname}`);
           io.to(roomId).emit('restart_game');
           console.log(`[accept_restart] 'restart_game' hadisəsi ${roomId} otağına göndərildi.`);
       } else { console.warn(`[accept_restart] Keçərsiz şərtlər.`); }
   });


  // ----- Bağlantı Kəsildikdə -----
  socket.on('disconnect', (reason) => {
    // socket.user burada hələ də mövcud olmaya bilər, ona görə users[socket.id]-dən istifadə daha etibarlıdır
    const userInfo = users[socket.id];
    console.log(`[Socket Disconnect] İstifadəçi ayrıldı: ${userInfo?.username || socket.id}. Səbəb: ${reason}`);
    handleDisconnectOrLeave(socket); // Socket obyektini birbaşa göndəririk
  });

  // ----- Otaqdan Ayrılma / Bağlantı Kəsilmə Funksiyası (YENİLƏNMİŞ) -----
  function handleDisconnectOrLeave(socketInstance) {
    const socketId = socketInstance.id;
    const leavingUserInfo = users[socketId];

    if (!leavingUserInfo) {
         // Bu, artıq handle edilibsə və ya user heç vaxt users obyektinə əlavə edilməyibsə baş verə bilər
         console.log(`[handleDisconnectOrLeave] İstifadəçi (${socketId}) users obyektində tapılmadı və ya artıq çıxarılıb.`);
         return;
    }

    const roomId = leavingUserInfo.currentRoom;
    const username = leavingUserInfo.username;

    console.log(`[handleDisconnectOrLeave] İstifadəçi: ${username} (${socketId}), Otaq: ${roomId || 'Yoxdur'}`);

    // İstifadəçini 'users' obyektindən sil
    delete users[socketId];

    // Əgər istifadəçi bir otaqda idisə
    if (roomId && rooms[roomId]) {
      console.log(`[handleDisconnectOrLeave] ${username} ${roomId} otağından çıxarılır...`);
      const room = rooms[roomId];
      const playerIndex = room.players.indexOf(socketId);

      if (playerIndex > -1) {
          room.players.splice(playerIndex, 1);
          console.log(`[handleDisconnectOrLeave] ${username} otağın oyunçularından silindi.`);

          // Otaq boş qaldısa
          if (room.players.length === 0) {
               // YALNIZ istifadəçi tərəfindən yaradılmış otağı silirik
               if (!room.isAiRoom) { // Və ya !roomId.startsWith('default_') / !roomId.startsWith('ai_')
                    console.log(`[handleDisconnectOrLeave] İstifadəçi otağı ${roomId} ('${room.name}') boş qaldı və silinir.`);
                    delete rooms[roomId];
               } else {
                    // AI/Default otaqdırsa, boş qalır, silinmir
                    console.log(`[handleDisconnectOrLeave] AI/Default otaq ${roomId} ('${room.name}') boş qaldı, amma silinmir.`);
               }
          }
          // Otaqda başqa oyunçu qaldısa
          else {
            const remainingPlayerId = room.players[0];
             const remainingPlayerSocket = io.sockets.sockets.get(remainingPlayerId);
            if (remainingPlayerSocket) {
                 console.log(`[handleDisconnectOrLeave] Qalan oyunçuya (${users[remainingPlayerId]?.username}) rəqibin (${username}) ayrıldığı bildirilir.`);
              remainingPlayerSocket.emit('opponent_left_game', { username: username });
            } else {
                 console.warn(`[handleDisconnectOrLeave] Qalan oyunçu (${remainingPlayerId}) tapıldı amma aktiv deyil?`);
            }
            // Əgər ayrılan yaradan idisə, yaradanı dəyiş
            if (room.creatorUsername === username) {
                 const newCreatorUsername = users[remainingPlayerId]?.username || 'Naməlum';
                 console.log(`[handleDisconnectOrLeave] Otaq yaradanı ${newCreatorUsername}-ə dəyişdirildi.`);
                 room.creatorUsername = newCreatorUsername;
            }
          }
          // Hər halda (otaq silinsə də, boş qalsa da, oyunçu qalsa da) otaq siyahısını yenilə
          broadcastRoomList();
      } else {
           console.warn(`[handleDisconnectOrLeave] ${username} (${socketId}) ${roomId} otağının oyunçuları arasında tapılmadı? Bu gözlənilməzdir.`);
           // Ehtiyat üçün yenə də siyahını yeniləyək
           broadcastRoomList();
      }
    } else {
      // İstifadəçi heç bir otaqda deyildi
      console.log(`[handleDisconnectOrLeave] ${username} heç bir otaqda deyildi.`);
    }
  } // handleDisconnectOrLeave sonu

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
    // <<< Standart AI Otaqlarını Yarat >>>
    createDefaultRooms();
    // <<< --------------------------- >>>
    console.log('=======================================================');
});

// ----- Serverin Düzgün Dayanması -----
function gracefulShutdown(signal) {
    console.log(`\n${signal} siqnalı alındı. Server bağlanır...`);
    // Yeni bağlantıları qəbul etməyi dayandır
    server.close((err) => {
        if (err) {
            console.error("Server bağlanarkən xəta:", err);
            process.exit(1); // Xəta ilə çıx
        }
        console.log('HTTP server bağlandı.');
        // Socket.IO bağlantılarını bağla (əgər açıq qalan varsa)
        io.close(() => {
             console.log('Socket.IO bağlantıları bağlandı.');
             // Verilənlər bazası pool-unu bağla
             pool.end(() => {
                console.log('Verilənlər bazası pool-u bağlandı.');
                process.exit(0); // Uğurla çıx
             });
        });
    });

     // Müəyyən vaxtdan sonra məcburi çıxış (əgər bağlanmazsa)
     setTimeout(() => {
         console.error("Server vaxtında bağlanmadı, məcburi çıxış edilir.");
         process.exit(1);
     }, 15000); // 15 saniyə gözlə
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Render deploy/stop
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C

// --- Faylın Sonu ---