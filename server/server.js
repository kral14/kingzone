// server.js (PostgreSQL + DB Session Store ilə Tam Yenilənmiş v4.1)
// Part 1/3 - Setup and Middleware (TAM KOD)

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
                playerCount: room.players.length,
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
            const roomId = `ai_${generateRoomId()}`;
            rooms[roomId] = {
                id: roomId,
                name: roomData.name,
                password: null,
                players: [],
                boardSize: roomData.size,
                creatorUsername: "SNOW",
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
// Part 2/3 - HTTP API Routes (TAM KOD)

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
    if (error.code === '23505') { // Unique violation
       if (error.constraint?.includes('email')) {
            return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' });
       }
       if (error.constraint?.includes('nickname')) {
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

// ----- Giriş Endpoint-i (/login) -----
app.post('/login', async (req, res) => {
    const { nickname, password } = req.body;
    let client;
    console.log(`[API /login] Sorğu alındı: { nickname: '${nickname}' }`);
    if (!nickname || !password) {
        console.log('[API /login] Xəta: Nickname/şifrə boş.');
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
        console.log(`[API /login] Session regenerate edilir... Köhnə ID=${oldSessionID}`);

        req.session.regenerate(regenerateErr => {
            if (regenerateErr) {
                console.error("[API /login] Session regenerate xətası:", regenerateErr);
                if (!res.headersSent) {
                   return res.status(500).json({ message: 'Session yaradılarkən xəta baş verdi (regenerate).' });
                }
                return console.error("[API /login] Regenerate xətası oldu amma cavab artıq göndərilmişdi.");
            }

            const newSessionID = req.sessionID;
            console.log(`[API /login] Yeni SessionID=${newSessionID}. User datası təyin edilir...`);

            // Session-a yalnız lazım olan məlumatları yazaq (şifrəni deyil!)
            req.session.user = {
                id: user.id,
                nickname: user.nickname,
                fullName: user.full_name,
                email: user.email // E-poçtu da əlavə edək, profil üçün lazım ola bilər
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
                       console.warn("[API /login] Session save callback işlədi amma cavab artıq göndərilmişdi?");
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
            console.log(`[API /login] DB bağlantısı buraxıldı.`);
        }
    }
});

// ----- Çıxış Endpoint-i (/logout) -----
app.post('/logout', (req, res) => {
  if (req.session.user) {
    const nickname = req.session.user.nickname;
    console.log(`[API /logout] Çıxış tələbi: ${nickname}, SessionID: ${req.sessionID}`);
    req.session.destroy(err => {
      if (err) {
        console.error("[API /logout] Session destroy xətası:", err);
        return res.status(500).json({ message: "Çıxış zamanı xəta baş verdi." });
      }
      // Cookie adını dəqiq yazın (əgər fərqlidirsə)
      res.clearCookie('connect.sid');
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
  // console.log(`--- /check-auth sorğusu gəldi --- Session ID: ${req.sessionID}`);
  // console.log(`Server req.session görür mü? ${!!req.session}`);
  // console.log(`Server req.session.user görür mü? ${!!req.session?.user}`, req.session?.user ? `(${JSON.stringify(req.session.user)})` : '');
  if (req.session && req.session.user && req.session.user.id) {
    // console.log(`[/check-auth] Cavab: Uğurlu. User: ${req.session.user.nickname}, SessionID=${req.sessionID}`);
    // Cavaba user datasını tam şəkildə əlavə edirik
    res.status(200).json({ loggedIn: true, user: req.session.user });
  } else {
    // console.log('Server session/user tapa bilmir!');
    res.status(401).json({ loggedIn: false, message: 'Sessiya tapılmadı və ya etibarsızdır.' });
  }
});


// ----- Profil Məlumatlarını Almaq Endpoint-i (/profile/:nickname) -----
// Qeyd: Bu endpoint hazırda birbaşa istifadə edilmir, çünki /check-auth
// onsuz da lazım olan user məlumatını qaytarır. Gələcək üçün qala bilər.
app.get('/profile/:nickname', isAuthenticated, async (req, res) => {
  const requestedNickname = req.params.nickname;
  const loggedInNickname = req.session.user.nickname;
  const loggedInUserId = req.session.user.id;

  console.log(`[API /profile GET] Sorğu: ${requestedNickname}, Giriş edən: ${loggedInNickname}`);

  if (loggedInNickname.toLowerCase() !== requestedNickname.toLowerCase()) {
     console.warn(`[API /profile GET] İcazə xətası: ${loggedInNickname}, ${requestedNickname} profilinə baxmağa çalışdı.`);
    return res.status(403).json({ message: 'Başqasının profilinə baxmaq icazəsi yoxdur.' });
  }

  let client;
  try {
     client = await pool.connect();
    // Şifrə hash-ı xaric digər məlumatları qaytarırıq
    const result = await client.query('SELECT id, full_name, email, nickname FROM users WHERE id = $1', [loggedInUserId]);
    if (result.rowCount > 0) {
      console.log(`[API /profile GET] Profil məlumatları tapıldı: ${loggedInNickname}`);
      res.status(200).json(result.rows[0]);
    } else {
      console.error(`[API /profile GET] Xəta: Authenticated user (ID: ${loggedInUserId}) DB-də tapılmadı!`);
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
  if (!fullName || !email || !newNickname) { console.log('[API /profile PUT] Xəta: Ad/Email/Nickname boş.'); return res.status(400).json({ message: 'Ad Soyad, E-poçt və Nickname boş ola bilməz.' }); }
  if (/\s/.test(newNickname)) { console.log('[API /profile PUT] Xəta: Yeni nickname boşluqlu.'); return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.log('[API /profile PUT] Xəta: Yeni email formatı yanlış.'); return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }

  let client;
  try {
     client = await pool.connect();
     console.log('[API /profile PUT] DB bağlantısı alındı.');

    // Unikallıq yoxlaması (yeni email və nickname üçün)
    const emailExists = await client.query('SELECT 1 FROM users WHERE email = $1 AND id != $2 LIMIT 1', [email, loggedInUserId]);
    if (emailExists.rowCount > 0) { console.log(`[API /profile PUT] Xəta: E-poçt (${email}) başqası tərəfindən istifadə edilir.`); return res.status(409).json({ message: 'Bu e-poçt artıq başqası tərəfindən istifadə olunur.' }); }
    const nicknameExists = await client.query('SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) AND id != $2 LIMIT 1', [newNickname, loggedInUserId]);
    if (nicknameExists.rowCount > 0) { console.log(`[API /profile PUT] Xəta: Nickname (${newNickname}) başqası tərəfindən istifadə edilir.`); return res.status(409).json({ message: 'Bu nickname artıq başqası tərəfindən istifadə olunur.' }); }

    // Update sorğusu
    let updateFields = ['full_name = $1', 'email = $2', 'nickname = $3'];
    let queryParams = [fullName, email, newNickname];
    let paramIndex = 4;

    if (password) { // Əgər yeni şifrə göndərilibsə
      if (password.length < 6) { console.log('[API /profile PUT] Xəta: Yeni şifrə qısadır.'); return res.status(400).json({ message: 'Yeni şifrə minimum 6 simvol olmalıdır.' }); }
      console.log('[API /profile PUT] Yeni şifrə hashlanır...');
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      updateFields.push(`password_hash = $${paramIndex}`);
      queryParams.push(hashedPassword);
      paramIndex++;
    }

    queryParams.push(loggedInUserId); // WHERE üçün user ID

    const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id, full_name, email, nickname;`;
     console.log('[API /profile PUT] Update sorğusu hazırlanır...');
    const result = await client.query(updateQuery, queryParams);

    if (result.rowCount === 0) { console.error(`[API /profile PUT] Xəta: Yenilənəcək user (ID: ${loggedInUserId}) tapılmadı.`); return res.status(404).json({ message: 'Yenilənəcək istifadəçi tapılmadı.' }); }
    const updatedUserDb = result.rows[0]; // DB-dən qayıdan yenilənmiş məlumatlar
    console.log(`[API /profile PUT] Profil DB-də yeniləndi: ${updatedUserDb.nickname}`);

    // Sessionu yenilə (email də daxil olmaqla)
    req.session.user.nickname = updatedUserDb.nickname;
    req.session.user.fullName = updatedUserDb.full_name;
    req.session.user.email = updatedUserDb.email; // Emaili də yeniləyək
    console.log('[API /profile PUT] Session yenilənir...');

    req.session.save((saveErr) => {
      if (saveErr) { console.error("[API /profile PUT] Session save xətası (profil):", saveErr); return res.status(500).json({ message: 'Profil DB-də yeniləndi, lakin sessiya yenilənərkən xəta. Təkrar giriş edin.' }); }
      console.log(`[API /profile PUT] UĞURLU: Profil və session yeniləndi: ${updatedUserDb.nickname}, SessionID: ${req.sessionID}`);
      // Clientə göndəriləcək user obyekti (şifrəsiz)
      const updatedUserForClient = {
          id: updatedUserDb.id,
          nickname: updatedUserDb.nickname,
          fullName: updatedUserDb.full_name,
          email: updatedUserDb.email
      };
      res.status(200).json({ message: 'Profil uğurla yeniləndi!', updatedUser: updatedUserForClient });
    });

  } catch (error) {
    console.error("[API /profile PUT] Profil yeniləmə xətası:", error);
    if (error.code === '23505') { if (error.constraint?.includes('email')) return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' }); if (error.constraint?.includes('nickname')) return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' }); }
     if (!res.headersSent) res.status(500).json({ message: 'Server xətası baş verdi.' });
  } finally {
     if (client) { client.release(); console.log('[API /profile PUT] DB bağlantısı buraxıldı.'); }
  }
});


// ----- Default Kök Route (/) -----
app.get('/', (req, res) => {
    // console.log(`[API GET /] Kök route sorğusu. SessionID=${req.sessionID}, User=${req.session.user?.nickname || 'N/A'}`);
    if (req.session && req.session.user && req.session.user.id) {
        // console.log('[API GET /] Aktiv sessiya var, oyunlara yönləndirilir.');
        res.redirect('/OYUNLAR/oyunlar/oyunlar.html');
    } else {
        // console.log('[API GET /] Aktiv sessiya yoxdur, loginə yönləndirilir.');
        res.redirect('/ANA SEHIFE/login/login.html');
    }
});

// --- Part 2 Sonu ---
// server.js (PostgreSQL + DB Session Store ilə Tam Yenilənmiş v4.1)
// Part 3/3 - Socket.IO Logic & Server Start (TAM KOD - QISALTMA YOXDUR)

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

  socket.on('create_room', (data) => {
    const user = socket.user;
    const currentUserSocketInfo = users[socket.id];
    if(!user || !currentUserSocketInfo) {
         console.error(`[create_room] XƏTA: user və ya currentUserSocketInfo tapılmadı! Socket ID: ${socket.id}`);
         return socket.emit('creation_error', 'İstifadəçi məlumatları tapılmadı.');
    }
    console.log(`[Socket Event] create_room hadisəsi (${user.nickname}):`, data);

    // Validasiyalar
    if (!data || !data.name || data.name.trim().length === 0) return socket.emit('creation_error', 'Otaq adı boş ola bilməz.');
    if (data.password && data.password.length > 0 && (data.password.length < 2 || !(/[a-zA-Z]/.test(data.password) && /\d/.test(data.password)))) {
         return socket.emit('creation_error', 'Şifrə tələblərə uyğun deyil (min 2 krk, 1 hərf+1 rəqəm).');
    }
    if (currentUserSocketInfo.currentRoom) return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız.');

    const newRoomId = generateRoomId();
    const boardSize = parseInt(data.boardSize, 10) || 3;
    const validatedBoardSize = Math.max(3, Math.min(6, boardSize));

    const newRoom = {
      id: newRoomId, name: data.name.trim().slice(0, 30), password: data.password || null,
      players: [socket.id], // Yaradan ilk oyunçudur
      boardSize: validatedBoardSize, creatorUsername: user.nickname,
      gameState: null, isAiRoom: false
    };

    rooms[newRoomId] = newRoom;
    currentUserSocketInfo.currentRoom = newRoomId;
    socket.join(newRoomId); // Yaradanı da otağa qoşaq

    console.log(`[create_room] Otaq yaradıldı: ID=${newRoomId}, Adı=${newRoom.name}, Yaradan=${user.nickname}, Ölçü=${newRoom.boardSize}, Şifrəli=${!!newRoom.password}`);

    broadcastRoomList();
    console.log(`[create_room] Otaq yaradıldıqdan sonra broadcastRoomList çağırıldı.`);
  });


  socket.on('join_room', (data) => {
    const user = socket.user;
    const currentUserSocketInfo = users[socket.id];
    console.log(`[Socket Event] join_room hadisəsi (${user?.nickname || 'Bilinməyən'}):`, data);

    if(!user || !currentUserSocketInfo) return socket.emit('join_error', 'İstifadəçi məlumatları tapılmadı.');
    if (!data || !data.roomId) return socket.emit('join_error', 'Otaq ID göndərilmədi.');

    const room = rooms[data.roomId];

    // Yoxlamalar
    if (!room) return socket.emit('join_error', 'Otaq tapılmadı.');
    if (room.isAiRoom) return socket.emit('join_error', 'AI otağına bu şəkildə qoşulmaq olmaz.');
    if (currentUserSocketInfo.currentRoom && currentUserSocketInfo.currentRoom !== room.id) return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.');
    if (room.players.includes(socket.id)) {
         console.warn(`[join_room] ${user.nickname} artıq bu otaqdadır (${room.id}). 'room_joined' göndərilir.`);
         socket.join(room.id);
         currentUserSocketInfo.currentRoom = room.id;
         if (room.deleteTimeout) { clearTimeout(room.deleteTimeout); delete room.deleteTimeout; console.log(`[join_room] Otaq ${room.id} üçün planlanmış silmə ləğv edildi.`); }
         // Oyun səhifəsinə yönləndirmə client tərəfdən edilir, burada room_joined kifayətdir
         return socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });
    }
    if (room.players.length >= 2) return socket.emit('join_error', 'Otaq doludur.');

    // Şifrə yoxlaması
    if (room.password) {
         if (!data.password) return socket.emit('join_error', 'Bu otaq şifrəlidir. Şifrəni daxil edin.');
         if (room.password !== data.password) return socket.emit('join_error', 'Şifrə yanlışdır.');
         console.log(`[join_room] Şifrəli otaq (${data.roomId}) üçün şifrə doğrudur.`);
    }

    // Silinmə timeout-unu ləğv et
    if (room.deleteTimeout) {
         console.log(`[join_room] Otaq ${room.id} üçün planlanmış silmə ləğv edilir.`);
         clearTimeout(room.deleteTimeout);
         delete room.deleteTimeout;
    }

    // Otağa qoşulma
    room.players.push(socket.id);
    currentUserSocketInfo.currentRoom = room.id;
    socket.join(room.id);

    console.log(`[join_room] İstifadəçi ${user.nickname} (${socket.id}) otağa qoşuldu: ${room.name} (${room.id})`);
    // Qoşulan istifadəçiyə təsdiq göndər
    socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });
    // Otaq siyahısını yenilə
    broadcastRoomList();

    // İkinci oyunçu qoşulduqda hər iki tərəfə rəqib məlumatını göndər
    if (room.players.length === 2) {
         console.log(`[join_room] Otaq ${room.id} doldu. Rəqib məlumatları göndərilir...`);
         const player1SocketId = room.players[0];
         const player2SocketId = room.players[1]; // Bu qoşulan socket.id olacaq
         const player1Info = users[player1SocketId];
         const player2Info = users[player2SocketId]; // Bu qoşulan user məlumatı

         // Birinci oyunçuya ikinci oyunçunun məlumatını göndər
         if (player1Info && io.sockets.sockets.get(player1SocketId)) {
             console.log(`---> ${player1Info.username}-ə ${player2Info?.username}-in qoşulduğu bildirilir.`);
             io.to(player1SocketId).emit('opponent_joined', { username: player2Info?.username || 'Rəqib' });
         } else {
             console.warn(`[join_room] Birinci oyunçu (${player1SocketId}) tapılmadı və ya socketi yoxdur.`);
         }

         // İkinci (yeni qoşulan) oyunçuya birinci oyunçunun məlumatını göndər
         if (player1Info) {
              console.log(`---> ${player2Info?.username}-ə ${player1Info.username}-in otaqda olduğu bildirilir.`);
              socket.emit('opponent_joined', { username: player1Info.username || 'Rəqib' });
         } else {
             console.warn(`[join_room] Birinci oyunçu məlumatı (${player1SocketId}) tapılmadı.`);
             socket.emit('opponent_joined', { username: 'Rəqib' }); // Fallback
         }
    }
  });

  socket.on('leave_room', () => {
      console.log(`[Socket Event] leave_room hadisəsi (${socket.user?.nickname || socket.id})`);
      handleDisconnectOrLeave(socket);
  });

  socket.on('delete_room', (data) => {
      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      console.log(`[Socket Event] delete_room hadisəsi (${user?.nickname || 'Bilinməyən'}):`, data);

      if (!user || !currentUserSocketInfo) return socket.emit('delete_error', 'İstifadəçi məlumatları tapılmadı.');
      if (!data || !data.roomId) return socket.emit('delete_error', 'Otaq ID göndərilmədi.');

      const room = rooms[data.roomId];
      if (!room) return socket.emit('delete_error', 'Silinəcək otaq tapılmadı.');
      if (room.isAiRoom) return socket.emit('delete_error', 'AI otaqları silinə bilməz.');
      if (room.creatorUsername !== user.nickname) return socket.emit('delete_error', 'Yalnız otağı yaradan onu silə bilər.');

      console.log(`[delete_room] Otaq ${data.roomId} ('${room.name}') ${user.nickname} tərəfindən silinir.`);

      // Otaqdakı digər oyunçuları məlumatlandır və çıxart
      room.players.forEach(playerId => {
          const playerSocket = io.sockets.sockets.get(playerId);
          if (playerSocket && playerId !== socket.id) { // Özünə göndərmə
              playerSocket.emit('room_deleted_kick', { message: `'${room.name}' otağı yaradan tərəfindən silindi.` });
              playerSocket.leave(data.roomId); // Socket otağından çıxart
              if (users[playerId]) { users[playerId].currentRoom = null; } // İstifadəçinin statusunu yenilə
          }
      });

      currentUserSocketInfo.currentRoom = null;
      socket.leave(data.roomId);
      delete rooms[data.roomId];
      if (room.deleteTimeout) clearTimeout(room.deleteTimeout);
      broadcastRoomList();
      console.log(`[delete_room] Otaq ${data.roomId} silindi və siyahı yeniləndi.`);
  });


    // <<< player_ready_in_room hadisəsi BURADADIR >>>
    socket.on('player_ready_in_room', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        console.log(`[Socket Event] player_ready_in_room (${user?.nickname}) alındı:`, data);

        if (!user || !currentUserSocketInfo) {
            console.warn("player_ready_in_room: user və ya currentUserSocketInfo yoxdur!");
            return;
        }
        if (!data || !data.roomId) {
            console.warn("player_ready_in_room: Otaq ID göndərilmədi.");
            return;
        }
        const roomId = data.roomId;
        const room = rooms[roomId];

        if (room && !room.isAiRoom) { // Yalnız mövcud və AI olmayan otaqlar üçün
             if (!socket.rooms.has(roomId)) {
                  socket.join(roomId);
                  console.log(`[player_ready_in_room] Socket ${socket.id} otağa (${roomId}) təkrar qoşuldu.`);
             }
             currentUserSocketInfo.currentRoom = roomId;

             let opponentUsername = null;
             if (room.players.length >= 1) { // >= 1 olmalıdır, çünki bu user özü də players içində ola bilər
                 const opponentSocketId = room.players.find(pId => pId !== socket.id);
                 if (opponentSocketId && users[opponentSocketId]) {
                     opponentUsername = users[opponentSocketId].username;
                 }
             }

             const roomInfo = {
                 name: room.name,
                 creatorUsername: room.creatorUsername,
                 hasPassword: !!room.password,
                 boardSize: room.boardSize,
                 opponentUsername: opponentUsername
             };
             console.log(`[player_ready_in_room] Clientə göndərilən room_info:`, roomInfo);
             socket.emit('room_info', roomInfo);

        } else if (room && room.isAiRoom) {
             console.log("[player_ready_in_room] AI otağı üçün çağırıldı, heç nə edilmir.");
        } else {
             console.warn(`[player_ready_in_room] Otaq tapılmadı: ${roomId}.`);
             socket.emit('force_redirect_lobby', { message: "Otaq artıq mövcud deyil." });
        }
    });


  // ----- Oyun Gedişləri və Digər Oyun İçi Hadisələr -----
   socket.on('make_move', (data) => {
       const user = socket.user;
       const currentUserSocketInfo = users[socket.id];
       const roomId = currentUserSocketInfo?.currentRoom;
       // console.log(`[Socket Event] make_move (${user?.nickname}) Otaq: ${roomId}, Data:`, data);
       if (roomId && rooms[roomId]) {
            socket.to(roomId).emit('opponent_moved', data);
       } else {
            console.warn(`make_move: İstifadəçi (${user?.nickname}) heç bir otaqda deyil.`);
       }
   });

   socket.on('dice_roll_result', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;
        // console.log(`[Socket Event] dice_roll_result (${user?.nickname}) Otaq: ${roomId}, Data:`, data);
        if (roomId && rooms[roomId]) {
            socket.to(roomId).emit('opponent_dice_result', { username: user.nickname, roll: data.roll });
        }
   });

   socket.on('symbol_choice', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;
        // console.log(`[Socket Event] symbol_choice (${user?.nickname}) Otaq: ${roomId}, Data:`, data);
         if (roomId && rooms[roomId]) {
             socket.to(roomId).emit('opponent_symbol_chosen', { username: user.nickname, symbol: data.symbol });
         }
   });

   socket.on('request_restart', () => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;
        console.log(`[Socket Event] request_restart (${user?.nickname}) Otaq: ${roomId}`);
        if(roomId && rooms[roomId]) {
             socket.to(roomId).emit('restart_requested', {username: user.nickname});
        }
   });

   socket.on('accept_restart', () => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;
        console.log(`[Socket Event] accept_restart (${user?.nickname}) Otaq: ${roomId}`);
        if(roomId && rooms[roomId]) {
             socket.to(roomId).emit('restart_accepted', {username: user.nickname});
        }
   });

   socket.on('kick_opponent', (data) => {
        const user = socket.user;
        const roomId = data?.roomId;
        console.log(`[Socket Event] kick_opponent (${user?.nickname}) Otaq: ${roomId}`);

        if(!roomId || !rooms[roomId]) return console.warn("Kick: Otaq tapılmadı.");
        if(rooms[roomId].creatorUsername !== user.nickname) return console.warn("Kick: Yalnız yaradan kick edə bilər.");

        const playerToKickId = rooms[roomId].players.find(pId => pId !== socket.id);
        if(playerToKickId) {
            const kickedSocket = io.sockets.sockets.get(playerToKickId);
            if(kickedSocket){
                 kickedSocket.emit('room_deleted_kick', { message: "Otaq yaradan tərəfindən çıxarıldınız." });
                 kickedSocket.leave(roomId);
                 console.log(`${users[playerToKickId]?.username} (${playerToKickId}) otaqdan çıxarıldı.`);
            }
            // handleDisconnectOrLeave qovulan istifadəçi üçün çağırılır
            handleDisconnectOrLeave({ id: playerToKickId, user: users[playerToKickId] });
        } else {
            console.warn("Kick: Rəqib tapılmadı.");
        }
   });


  // ----- Bağlantı Kəsildikdə -----
  socket.on('disconnect', (reason) => {
    const userInfo = users[socket.id];
    console.log(`[Socket Disconnect] İstifadəçi ayrıldı: ${userInfo?.username || socket.id}. Səbəb: ${reason}`);
    handleDisconnectOrLeave(socket);
  });

  // ----- Otaqdan Ayrılma / Bağlantı Kəsilmə Funksiyası (5 dəqiqə silmə ilə) -----
  function handleDisconnectOrLeave(socketInstance) {
    const socketId = socketInstance.id;
    const leavingUserInfo = users[socketId] || socketInstance.user;

    if (!leavingUserInfo || !leavingUserInfo.username) {
         // console.log(`[handleDisconnectOrLeave] İstifadəçi (${socketId}) tapılmadı/çıxarılıb.`);
         if(users[socketId]) delete users[socketId];
         return;
    }

    const username = leavingUserInfo.username;
    const roomId = users[socketId]?.currentRoom || leavingUserInfo.currentRoom;

    console.log(`[handleDisconnectOrLeave] İstifadəçi: ${username} (${socketId}), Otaq: ${roomId || 'Yoxdur'}`);
    if (users[socketId]) delete users[socketId];

    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      const playerIndex = room.players.indexOf(socketId);

      if (playerIndex > -1) {
          room.players.splice(playerIndex, 1);
          console.log(`[handleDisconnectOrLeave] ${username} otaqdan silindi. Qalan: ${room.players.length}`);

          if (room.players.length === 0 && !room.isAiRoom) {
              if (room.deleteTimeout) { clearTimeout(room.deleteTimeout); }
              const deletionDelay = 300000; // 5 dəqiqə
              console.log(`[handleDisconnectOrLeave] Otaq ${roomId} boş qaldı. ${deletionDelay / 60000} dəq. sonra silinəcək.`);
              room.deleteTimeout = setTimeout(() => { if (rooms[roomId] && rooms[roomId].players.length === 0) { console.log(`[handleDisconnectOrLeave] Otaq ${roomId} silinir.`); delete rooms[roomId]; broadcastRoomList(); } else { console.log(`[handleDisconnectOrLeave] Otaq ${roomId} silinmədi.`); if(rooms[roomId]) delete rooms[roomId].deleteTimeout; } }, deletionDelay);
          } else if (room.players.length === 1) {
              const remainingPlayerId = room.players[0]; const remainingPlayerSocket = io.sockets.sockets.get(remainingPlayerId);
              if (remainingPlayerSocket) { console.log(`[handleDisconnectOrLeave] Qalan oyunçuya (${users[remainingPlayerId]?.username}) ${username}-in ayrıldığı bildirilir.`); remainingPlayerSocket.emit('opponent_left_game', { username: username }); }
              if (room.creatorUsername === username) { room.creatorUsername = users[remainingPlayerId]?.username || 'Naməlum'; console.log(`[handleDisconnectOrLeave] Yaradan ${room.creatorUsername}-ə dəyişdi.`); }
          }
          broadcastRoomList();
      } else { console.warn(`[handleDisconnectOrLeave] ${username} (${socketId}) ${roomId} otağında tapılmadı?`); broadcastRoomList(); }
    } else { /*console.log(`[handleDisconnectOrLeave] ${username} heç bir otaqda deyildi.`);*/ }
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
    createDefaultRooms();
    console.log('=======================================================');
});

// ----- Serverin Düzgün Dayanması -----
function gracefulShutdown(signal) { console.log(`\n${signal} siqnalı alındı...`); io.close(() => { console.log('[Shutdown] Socketlər bağlandı.'); server.close(() => { console.log('[Shutdown] HTTP server bağlandı.'); pool.end(() => { console.log('[Shutdown] DB pool bağlandı.'); process.exit(0); }); }); }); setTimeout(() => { console.error('[Shutdown] Timeout! Zorla çıxılır.'); process.exit(1); }, 10000); };
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- Faylın Sonu ---