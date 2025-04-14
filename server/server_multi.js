// server/server_multi.js

// Əsas modulları import edirik
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Redis üçün lazımi modulları import edirik
import { createClient } from 'redis'; // Redis klienti
import { createAdapter } from '@socket.io/redis-adapter'; // Redis adapteri

// .env faylındakı dəyişənləri yükləyirik
dotenv.config();

// Fayl və qovluq yollarını təyin edirik
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Şifrələmə üçün salt raundlarının sayını təyin edirik
const saltRounds = 10;

// --- Redis Setup ---
// Fly.io tərəfindən təmin edilən REDIS_URL mühit dəyişənini və ya lokal test üçün default URL'i istifadə et
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`Connecting to Redis at: ${redisUrl}`);

// Publish/Subscribe üçün iki ayrı Redis klienti yaradırıq
const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate(); // Mövcud bağlantını klonlayırıq

// Qoşulma zamanı baş verə biləcək xətaları loglamaq üçün listener əlavə edirik
pubClient.on('error', (err) => console.error('Redis Pub Client Error:', err));
subClient.on('error', (err) => console.error('Redis Sub Client Error:', err));
// --- END Redis Setup ---
// Express tətbiqini, HTTP serverini və Socket.IO serverini yaradırıq
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Verilənlər bazası və Sessiya Ayarları ---
const PgStore = connectPgSimple(session); // PostgreSQL sessiya anbarını əldə edirik
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL, // Verilənlər bazası URL'i .env faylından
  // Production mühitində SSL tələb oluna bilər:
  // ssl: { rejectUnauthorized: false } // Hostinq tələb edirsə aktivləşdirin
});

// Verilənlər bazasına qoşulmağa çalışırıq və nəticəni loglayırıq
pool.connect()
  .then(() => console.log('✅ PostgreSQL veritabanına başarıyla bağlandı.'))
  .catch(err => console.error('❌ Veritabanı bağlantı hatası:', err.stack));

// Sessiya middleware'ini konfiqurasiya edirik
const sessionMiddleware = session({
  store: new PgStore({
    pool: pool,                // Sessiyaları saxlamaq üçün istifadə ediləcək pool
    tableName: 'user_sessions' // Verilənlər bazasındakı sessiya cədvəlinin adı
  }),
  secret: process.env.SESSION_SECRET || 'bu_cox_gizli_bir_acardir_deyisdirin_!', // ÇOX VACİB: Güclü və gizli bir açar istifadə edin, .env faylında saxlayın
  resave: false, // Eyni sessiyanın dəyişiklik olmadan yenidən saxlanmasının qarşısını alır
  saveUninitialized: false, // Boş (yeni amma dəyişdirilməmiş) sessiyaların saxlanmasının qarşısını alır
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Yalnız HTTPS üzərindən göndərilsin (productionda 'true' olmalıdır)
    maxAge: 30 * 24 * 60 * 60 * 1000, // Cookie ömrü: 30 gün (millisaniyə cinsindən)
    httpOnly: true, // Cookie'nin JavaScript tərəfindən oxunmasının qarşısını alır (XSS qoruması)
    // sameSite: 'lax' // CSRF hücumlarına qarşı kömək edir ('lax' və ya 'strict' ola bilər)
  },
});
// --- END Verilənlər bazası və Sessiya Ayarları ---
// --- Express Middleware Ayarları ---
// Təyin etdiyimiz sessiya middleware'ini Express tətbiqinə əlavə edirik
app.use(sessionMiddleware);

// Gələn JSON formatlı sorğuları emal etmək üçün middleware
app.use(express.json());

// Gələn URL-encoded formatlı sorğuları (form dataları) emal etmək üçün middleware
app.use(express.urlencoded({ extended: true }));

// 'public' qovluğundakı statik faylları (HTML, CSS, JS, şəkillər) təqdim etmək üçün middleware
app.use(express.static(path.join(__dirname, '..', 'public')));

// Socket.IO'nun da Express sessiyalarına girişini təmin etmək üçün eyni middleware'i ona da veririk
// Bu, Socket.IO handler'ları içində `socket.request.session` vasitəsilə sessiya məlumatlarına çatmağa imkan verəcək
io.engine.use(sessionMiddleware);
// --- END Express Middleware Ayarları ---
// --- Helper Functions (Redis ilə işləmək üçün) ---

/**
 * Redis-dəki bütün aktiv otaqların məlumatlarını alır.
 * 'activeRooms' Set-indəki hər bir otaq açarına (key) görə
 * 'room:{roomId}' Hash-ından detalları çəkir.
 * @param {object} redisClient - Qoşulmuş Redis klienti (pubClient və ya subClient).
 * @returns {Promise<Array<object>>} - Otaq obyektlərindən ibarət bir massiv (vəd).
 */
async function getAllRooms(redisClient) {
    try {
      // 'activeRooms' Set-indəki bütün otaq açarlarını (məsələn, 'room:123', 'room:456') alırıq
      const roomKeys = await redisClient.sMembers('activeRooms');
      const rooms = []; // Nəticə massivi
  
      // Hər bir otaq açarı üçün detalları alırıq
      for (const roomKey of roomKeys) {
        // Otaq açarına uyğun Hash-dan bütün sahələri (id, name, playerCount, vs.) alırıq
        const roomData = await redisClient.hGetAll(roomKey);
  
        // Əgər məlumatlar tamdırsa (ən azı 'id' varsa) nəticəyə əlavə edirik
        if (roomData && roomData.id) {
          rooms.push({
            id: roomData.id,
            name: roomData.name || `Otaq ${roomData.id.substring(0, 5)}`, // Ad yoxdursa default ad
            playerCount: parseInt(roomData.playerCount || '0', 10), // Rəqəmə çeviririk
            maxPlayers: parseInt(roomData.maxPlayers || '2', 10), // Rəqəmə çeviririk
            // status: roomData.status || 'waiting' // Lazım gələrsə statusu da əlavə edə bilərsiniz
          });
        } else {
          // Əgər hansısa səbəbdən otaq açarı var, amma detalları yoxdursa,
          // bu natamam qeydi Redis-dən təmizləyirik ki, problemlər yaranmasın.
          console.warn(`⚠️ Removing potentially inconsistent room key from activeRooms: ${roomKey}`);
          await redisClient.sRem('activeRooms', roomKey); // 'activeRooms' Set-indən silirik
          await redisClient.del(roomKey); // Əlaqəli Hash-ı da silirik (əgər varsa)
        }
      }
      return rooms; // Otaq siyahısını qaytarırıq
    } catch (error) {
      console.error("❌ Error getting all rooms from Redis:", error);
      return []; // Xəta baş verərsə boş massiv qaytarırıq
    }
  }
  
  /**
   * Verilmiş socket ID-sinin hansı otaqda olduğunu Redis-dən alır.
   * 'socket:{socketId}:room' String-inin dəyərini oxuyur.
   * @param {object} redisClient - Qoşulmuş Redis klienti.
   * @param {string} socketId - Socket.IO bağlantısının unikal ID-si.
   * @returns {Promise<string|null>} - Otağın ID-sini (əgər varsa) və ya null qaytarır (vəd).
   */
  async function getRoomIdForSocket(redisClient, socketId) {
     try {
       // 'socket:abcxyz123:room' kimi bir açarın dəyərini (otaq ID-si) alırıq
       return await redisClient.get(`socket:${socketId}:room`);
     } catch(error) {
       console.error(`❌ Error getting room ID for socket ${socketId}:`, error);
       return null; // Xəta olarsa null qaytarırıq
     }
  }
  
  // --- END Helper Functions (Redis ilə işləmək üçün) --- // (Bu kommenti hələ silməyin)
  /**
 * Verilmiş otaq ID-sinə uyğun detalları Redis Hash-ından alır.
 * 'room:{roomId}' Hash-ının bütün sahələrini oxuyur.
 * @param {object} redisClient - Qoşulmuş Redis klienti.
 * @param {string} roomId - Otağın ID-si.
 * @returns {Promise<object|null>} - Otağın detallarını (sahələrini) ehtiva edən obyekt və ya null qaytarır (vəd).
 */
async function getRoomDetails(redisClient, roomId) {
    try {
      // 'room:abcxyz123' kimi bir açara sahib Hash-dan bütün sahələri (name, playerCount vs.) alırıq
      return await redisClient.hGetAll(`room:${roomId}`);
    } catch(error) {
      console.error(`❌ Error getting details for room ${roomId}:`, error);
      return null; // Xəta olarsa null qaytarırıq
    }
 }
 
 /**
  * Verilmiş otaq ID-sindəki oyunçuların (socket ID-lərinin) siyahısını Redis Set-indən alır.
  * 'room:{roomId}:players' Set-inin bütün üzvlərini oxuyur.
  * @param {object} redisClient - Qoşulmuş Redis klienti.
  * @param {string} roomId - Otağın ID-si.
  * @returns {Promise<Array<string>>} - Socket ID-lərindən ibarət bir massiv qaytarır (vəd).
  */
 async function getPlayersInRoom(redisClient, roomId) {
   try {
     // 'room:abcxyz123:players' kimi bir Set-dən bütün üzvləri (socket ID-lərini) alırıq
     return await redisClient.sMembers(`room:${roomId}:players`);
   } catch(error) {
     console.error(`❌ Error getting players in room ${roomId}:`, error);
     return []; // Xəta olarsa boş massiv qaytarırıq
   }
 }
 
 /**
  * Ən son otaq siyahısını Redis-dən alır və bütün bağlı olan Socket.IO klientlərinə
  * 'updateRoomList' hadisəsi ilə göndərir.
  * @param {object} redisClient - Qoşulmuş Redis klienti.
  * @returns {Promise<void>} - Asinxron əməliyyat bitdikdə heç nə qaytarmır (vəd).
  */
 async function broadcastRoomList(redisClient) {
   try {
     // Əvvəlki yardımçı funksiya ilə bütün otaqların aktual siyahısını alırıq
     const rooms = await getAllRooms(redisClient);
     console.log("📢 Broadcasting updated room list:", JSON.stringify(rooms));
     // Socket.IO serveri (`io`) vasitəsilə 'updateRoomList' hadisəsini
     // bütün bağlı klientlərə (lobby-də olanlara) göndəririk
     io.emit('updateRoomList', rooms);
   } catch (error) {
     console.error("❌ Error broadcasting room list:", error);
   }
 }
 // --- END Helper Functions (Redis ilə işləmək üçün) --- // İndi bu kommenti saxlaya bilərsiniz
 // --- Autentifikasiya Yolları (Endpoints) ---

// Qeydiyyat üçün POST sorğusu endpoint'i
app.post('/register', async (req, res) => {
    // Sorğunun body'sindən istifadəçi adı və şifrəni alırıq
    const { username, password } = req.body;
    // Əgər hər ikisi də göndərilməyibsə, xəta qaytarırıq
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'İstifadəçi adı və şifrə tələb olunur.' });
    }
    try {
      // Verilənlər bazasında bu istifadəçi adının mövcudluğunu yoxlayırıq
      const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      if (userCheck.rows.length > 0) {
        // Əgər mövcuddursa, 409 Conflict statusu ilə xəta qaytarırıq
        return res.status(409).json({ success: false, message: 'İstifadəçi adı artıq mövcuddur.' });
      }
      // Şifrəni hash'ləyirik (bcrypt ilə)
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      // Yeni istifadəçini 'users' cədvəlinə əlavə edirik
      const result = await pool.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
        [username, hashedPassword]
      );
      // Əlavə edilmiş istifadəçinin məlumatlarını alırıq
      const user = result.rows[0];
      console.log('✅ Yeni istifadəçi qeydiyyatdan keçdi:', user.username);
  
      // Qeydiyyatdan dərhal sonra avtomatik giriş etmək üçün sessiya yaradırıq
      req.session.userId = user.id;       // İstifadəçi ID'sini sessiyada saxlayırıq
      req.session.username = user.username; // İstifadəçi adını sessiyada saxlayırıq
  
      // Uğurlu cavab qaytarırıq (201 Created statusu ilə)
      res.status(201).json({ success: true, message: 'Qeydiyyat uğurlu oldu.', user: { id: user.id, username: user.username } });
    } catch (err) {
      // Əgər hər hansı bir xəta baş verərsə, loglayırıq və 500 Server Error statusu qaytarırıq
      console.error('❌ Qeydiyyat xətası:', err);
      res.status(500).json({ success: false, message: 'Server xətası baş verdi.' });
    }
  });
  
  // Giriş üçün POST sorğusu endpoint'i
  app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'İstifadəçi adı və şifrə tələb olunur.' });
    }
    try {
      // İstifadəçi adını verilənlər bazasında axtarırıq
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      // Əgər istifadəçi tapılmırsa, 401 Unauthorized statusu qaytarırıq
      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, message: 'İstifadəçi adı və ya şifrə yanlışdır.' });
      }
      // Tapılan istifadəçinin məlumatlarını alırıq
      const user = result.rows[0];
      // Göndərilən şifrə ilə bazadakı hash'lənmiş şifrəni müqayisə edirik
      const match = await bcrypt.compare(password, user.password_hash);
      // Əgər şifrələr uyğun gəlirsə
      if (match) {
        // Sessiya yaradırıq
        req.session.userId = user.id;
        req.session.username = user.username;
        console.log('✅ İstifadəçi giriş etdi:', user.username);
        // Uğurlu cavab qaytarırıq
        res.json({ success: true, message: 'Giriş uğurlu oldu.', user: { id: user.id, username: user.username } });
      } else {
        // Əgər şifrələr uyğun gəlmirsə, 401 Unauthorized statusu qaytarırıq
        res.status(401).json({ success: false, message: 'İstifadəçi adı və ya şifrə yanlışdır.' });
      }
    } catch (err) {
      console.error('❌ Giriş xətası:', err);
      res.status(500).json({ success: false, message: 'Server xətası baş verdi.' });
    }
  });
  
  // Çıxış üçün POST sorğusu endpoint'i
  app.post('/logout', (req, res) => {
    // Mövcud sessiyanı məhv edirik (silirik)
    req.session.destroy(err => {
      if (err) {
        // Əgər sessiyanı silərkən xəta baş verərsə
        console.error('❌ Sessiya silmə xətası:', err);
        return res.status(500).json({ success: false, message: 'Çıxış zamanı xəta baş verdi.' });
      }
      // Brauzerdən sessiya cookie'sini təmizləyirik ('connect.sid' standart addır)
      res.clearCookie('connect.sid');
      console.log('✅ İstifadəçi çıxış etdi.');
      // Uğurlu cavab qaytarırıq
      res.json({ success: true, message: 'Uğurla çıxış edildi.' });
    });
  });
  
  // --- Sessiya Yoxlama Middleware ---
  /**
   * Bu middleware funksiyası bir yolun (route) yalnız giriş etmiş (autentifikasiyadan keçmiş)
   * istifadəçilər tərəfindən əlçatan olmasını təmin edir.
   */
  const requireAuth = (req, res, next) => {
    // Əgər sessiya və ya sessiyada userId yoxdursa, deməli istifadəçi giriş etməyib
    if (!req.session || !req.session.userId) {
      console.log("🔒 Autentifikasiya tələb olunur, sessiya tapılmadı və ya userId yoxdur.");
      // Əgər sorğu AJAX (XMLHttpRequest) və ya API sorğusudursa (JSON qəbul edirsə)
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
         // 401 Unauthorized statusu ilə JSON cavabı qaytarırıq
         return res.status(401).json({ success: false, message: "Giriş tələb olunur." });
      } else {
         // Əgər adi brauzer sorğusudursa (səhifəyə keçid),
         // istifadəçini giriş səhifəsinə yönləndiririk
         // DİQQƏT: Yönləndirmə ünvanının düzgün olduğundan əmin olun
         return res.redirect('/ana_sehife/login/login.html');
      }
    }
    // Əgər sessiya və userId varsa, sorğunun davam etməsinə icazə veririk (növbəti middleware və ya route handler çağırılır)
    next();
  };
  // --- END Autentifikasiya Yolları ---
  // --- Statik Fayl Yolları və Qoruma ---

// Oyunlar səhifəsi üçün GET sorğusu endpoint'i
// Yalnız giriş etmiş istifadəçilər bu səhifəyə daxil ola bilər (requireAuth middleware'i sayəsində)
app.get('/OYUNLAR/oyunlar/oyunlar.html', requireAuth, (req, res) => {
    // Əgər istifadəçi giriş edibsə (requireAuth icazə veribsə), oyunlar HTML faylını göndəririk
    res.sendFile(path.join(__dirname, '..', 'public', 'OYUNLAR', 'oyunlar', 'oyunlar.html'));
  });
  
  // Lobi səhifəsi üçün GET sorğusu endpoint'i
  // Yalnız giriş etmiş istifadəçilər bu səhifəyə daxil ola bilər
  app.get('/OYUNLAR/tictactoe/lobby/test_odalar.html', requireAuth, (req, res) => {
    // Əgər istifadəçi giriş edibsə, lobbi HTML faylını göndəririk
    res.sendFile(path.join(__dirname, '..', 'public', 'OYUNLAR', 'tictactoe', 'lobby', 'test_odalar.html'));
  });
  
  // Oyun otağı səhifəsi üçün GET sorğusu endpoint'i
  // Yalnız giriş etmiş istifadəçilər bu səhifəyə daxil ola bilər
  app.get('/OYUNLAR/tictactoe/game/oda_ici.html', requireAuth, (req, res) => {
    // Əgər istifadəçi giriş edibsə, oyun otağı HTML faylını göndəririk
    // QEYD: Əlavə olaraq, bura daxil olmaq üçün istifadəçinin həqiqətən bir otaqda olub olmadığını
    // yoxlamaq üçün daha mürəkkəb məntiq əlavə etmək olar (məsələn, query parameter və ya sessiya vasitəsilə).
    res.sendFile(path.join(__dirname, '..', 'public', 'OYUNLAR', 'tictactoe', 'game', 'oda_ici.html'));
  });
  
  // Kök URL ('/') üçün GET sorğusu endpoint'i
  app.get('/', (req, res) => {
    // Əgər istifadəçi artıq giriş edibsə (sessiyası varsa)
    if (req.session && req.session.userId) {
      // Onu birbaşa oyunlar səhifəsinə yönləndiririk
      res.redirect('/OYUNLAR/oyunlar/oyunlar.html');
    } else {
      // Əgər giriş etməyibsə, onu giriş səhifəsinə yönləndiririk
      res.redirect('/ana_sehife/login/login.html');
    }
  });
  // --- END Statik Fayl Yolları ---
  // --- Socket.IO Məntiqi (Redis ilə) ---

// Yeni bir klient Socket.IO serverinə qoşulduqda bu funksiya işə düşür
io.on('connection', async (socket) => {

    // Qoşulan soketin sorğusundan (request) sessiya məlumatlarını əldə edirik
    // Bu, əvvəl `io.engine.use(sessionMiddleware)` etdiyimiz üçün mümkündür
    const session = socket.request.session;
  
    // Sessiyadan istifadəçi adını və ID'sini alırıq. Əgər yoxdursa, müvəqqəti ad/ID veririk.
    const username = session?.username || `Qonaq_${socket.id.substring(0, 5)}`;
    const userId = session?.userId; // Giriş etməyibsə bu 'undefined' olacaq
  
    // Konsola kimin qoşulduğunu yazırıq
    console.log(`✔️ ${username} (ID: ${userId || 'N/A'}, Socket: ${socket.id}) qoşuldu.`);
  
    // Qoşulan klientə öz istifadəçi məlumatlarını göndəririk (əgər lazımdırsa)
    socket.emit('userInfo', { username, userId });
  
    // Qoşulan kimi həmin klientə mövcud otaqların siyahısını göndəririk
    try {
        // Redis-dən aktual otaq siyahısını alırıq (pubClient istifadə edirik, amma fərq etməz)
        const currentRooms = await getAllRooms(pubClient);
        // Yalnız bu yeni qoşulan soketə ('socket') siyahını göndəririk
        socket.emit('updateRoomList', currentRooms);
        console.log(`📊 ${username} üçün ilkin otaq siyahısı göndərildi.`);
    } catch (error) {
        console.error(`❌ ${username} üçün ilkin otaq siyahısı göndərilərkən xəta:`, error);
    }
  
  
    // Klientdən 'createRoom' hadisəsi gəldikdə işə düşür
    socket.on('createRoom', async (roomName) => {
       // Əgər istifadəçi giriş etməyibsə (userId yoxdursa), otaq yarada bilməz
       if (!userId) {
           console.error(`⚠️ Otaq yaratmaq mümkün deyil: İstifadəçi giriş etməyib (Socket ID: ${socket.id})`);
           socket.emit('error', { message: 'Otaq yaratmaq üçün giriş etməlisiniz.' }); // Klientə xəta mesajı göndəririk
           return; // Funksiyanı dayandırırıq
       }
  
       // Unikal otaq ID-si yaradırıq (zaman + təsadüfi sətir)
       const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
       // Redis-də otaq məlumatlarını saxlamaq üçün açar (key)
       const roomKey = `room:${roomId}`;
       // Redis-də bu socket-in hansı otaqda olduğunu saxlamaq üçün açar
       const playerSocketKey = `socket:${socket.id}:room`;
  
       console.log(`➕ ${username} otaq yaradır: ${roomName || roomId}`);
  
       try {
           // ---- Vacib: Əvvəlki Otaqdan Çıxış ----
           // İstifadəçi artıq başqa bir otaqdadırsa, onu həmin otaqdan avtomatik çıxarırıq
           // Bu, 'disconnect' və 'leaveRoom' üçün də istifadə edəcəyimiz ümumi funksiyadır (növbəti hissələrdə təyin edəcəyik)
           // Hələlik, fərz edək ki, `handleDisconnectOrLeave` adlı bir funksiya var
           await handleDisconnectOrLeave(socket, pubClient); // Redis clientini ötürürük
  
           // ---- Redis Əməliyyatları ----
           // 1. Otaq Məlumatlarını Hash-da Saxlamaq:
           //    `hSet` əmri ilə 'room:roomId' açarında bir Hash yaradırıq və sahələrini təyin edirik.
           await pubClient.hSet(roomKey, {
               id: roomId,
               name: roomName || `Otaq ${roomId.substring(5, 10)}`, // Əgər ad verilməyibsə, default ad
               playerCount: '1', // Yaradan şəxs ilk oyunçudur
               maxPlayers: '2', // Tic Tac Toe üçün 2 oyunçu
               status: 'waiting', // İlkin status: gözləmədə
               creatorId: userId.toString(), // Otağı kimin yaratdığını qeyd edirik
               // Gələcəkdə oyun lövhəsi kimi məlumatları da burada saxlaya bilərsiniz:
               // 'board': JSON.stringify(Array(9).fill(null)),
               // 'turn': socket.id // İlk növbə kimdədir
           });
  
           // 2. Oyunçunu Otağın Oyunçular Set-inə Əlavə Etmək:
           //    `sAdd` əmri ilə 'room:roomId:players' açarındakı Set-ə oyunçunun socket ID-sini əlavə edirik.
           await pubClient.sAdd(`${roomKey}:players`, socket.id);
  
           // 3. Oyunçunun Hansı Otaqda Olduğunu Qeyd Etmək:
           //    `set` əmri ilə 'socket:socketId:room' açarına otağın ID-sini yazırıq.
           await pubClient.set(playerSocketKey, roomId);
  
           // 4. Otaq ID-sini Aktiv Otaqlar Set-inə Əlavə Etmək:
           //    `sAdd` əmri ilə 'activeRooms' Set-inə bu otağın açarını (`roomKey`) əlavə edirik.
           await pubClient.sAdd('activeRooms', roomKey);
  
           // ---- Socket.IO Otağına Qoşulma ----
           // Bu, mesajların yalnız həmin otaqdakı klientlərə getməsi üçündür ('io.to(roomId).emit(...)')
           socket.join(roomId);
           console.log(`✅ ${username} (Socket: ${socket.id}) "${roomId}" otağını yaratdı və qoşuldu.`);
  
           // ---- Klientə və Digərlərinə Məlumat Göndərmək ----
           // a) Otağı yaradan klientə uğurlu qoşulma mesajı göndəririk
           const finalRoomName = await pubClient.hGet(roomKey, 'name'); // Otağın adını Redis-dən alırıq
           socket.emit('joinedRoom', { roomId: roomId, roomName: finalRoomName });
  
           // b) BÜTÜN klientlərə (lobbidə olanlara) yenilənmiş otaq siyahısını göndəririk
           await broadcastRoomList(pubClient); // Yardımçı funksiyamızı çağırırıq
  
       } catch (error) {
           console.error(`❌ "${roomId}" otağı ${username} tərəfindən yaradılarkən xəta baş verdi:`, error);
           // Klientə ümumi xəta mesajı göndəririk
           socket.emit('error', { message: 'Otaq yaradılarkən xəta baş verdi.' });
  
           // Xəta baş verərsə, yarımçıq qala biləcək Redis qeydlərini təmizləməyə çalışırıq
           try {
               console.log(`🧹 Cleaning up potentially inconsistent Redis keys for failed room ${roomId}...`);
               await pubClient.del(roomKey); // Otaq Hash-ını sil
               await pubClient.del(playerSocketKey); // Oyunçu-otaq qeydini sil
               await pubClient.sRem('activeRooms', roomKey); // Aktiv otaqlar siyahısından sil
           } catch (cleanupError) {
               console.error(`❌ Yarımçıq ${roomId} otağının təmizlənməsi zamanı xəta:`, cleanupError);
           }
           // Hər ehtimala qarşı otaq siyahısını yenidən yayımlayırıq
           await broadcastRoomList(pubClient);
       }
    }); // 'createRoom' hadisəsinin sonu
  
    // Digər socket hadisələri ('joinRoom', 'disconnect', 'makeMove' və s.) bura əlavə olunacaq...
  
  }); // io.on('connection', ...) funksiyasının sonu
  // --- END Socket.IO Məntiqi ---
  // BU KOD io.on('connection', ...) BLOKUNUN DAXİLİNƏ ƏLAVƏ EDİLMƏLİDİR:
// (socket.on('createRoom', ...) listener-ından sonra)

  // Klientdən 'joinRoom' hadisəsi gəldikdə işə düşür
  socket.on('joinRoom', async (roomId) => {
    // Giriş etməyibsə, qoşula bilməz
    if (!userId) {
        console.error(`⚠️ Otağa qoşulmaq mümkün deyil: İstifadəçi giriş etməyib (Socket ID: ${socket.id})`);
        socket.emit('error', { message: 'Otağa qoşulmaq üçün giriş etməlisiniz.' });
        return;
    }

    // Redis açarlarını hazırlayırıq
    const roomKey = `room:${roomId}`;
    const playerSocketKey = `socket:${socket.id}:room`;

    console.log(`➡️ ${username} (Socket: ${socket.id}) "${roomId}" otağına qoşulmağa cəhd edir`);

    try {
        // ---- Otağın Vəziyyətini Yoxlamaq ----
        // 1. Otaq Redis-də mövcuddurmu?
        const roomExists = await pubClient.exists(roomKey);
        if (!roomExists) {
            console.log(`🚪 Otaq ${roomId} mövcud deyil.`);
            socket.emit('error', { message: 'Otaq mövcud deyil və ya silinib.' });
            // Otaq silinibse, lobbi siyahısını yeniləyək ki, klientdə də itsin
            await broadcastRoomList(pubClient);
            return;
        }

        // 2. Otaq doludurmu?
        //    `hmGet` ilə eyni anda bir neçə sahəni oxuya bilərik
        const [playerCountStr, maxPlayersStr] = await pubClient.hmGet(roomKey, ['playerCount', 'maxPlayers']);
        const playerCount = parseInt(playerCountStr || '0', 10);
        const maxPlayers = parseInt(maxPlayersStr || '2', 10);

        if (playerCount >= maxPlayers) {
            console.log(`🈵 Otaq ${roomId} doludur.`);
            socket.emit('error', { message: 'Otaq artıq doludur.' });
            return; // Qoşulmaya icazə vermirik
        }

        // ---- Vacib: Əvvəlki Otaqdan Çıxış ----
        // Qoşulmazdan əvvəl istifadəçinin başqa bir otaqda olub olmadığını yoxlayıb çıxarırıq
        await handleDisconnectOrLeave(socket, pubClient);

        // ---- Redis Əməliyyatları ----
        // 1. Oyunçunu Otağın Oyunçular Set-inə Əlavə Etmək:
        await pubClient.sAdd(`${roomKey}:players`, socket.id);

        // 2. Oyunçunun Hansı Otaqda Olduğunu Qeyd Etmək:
        await pubClient.set(playerSocketKey, roomId);

        // 3. Otağın Oyunçu Sayını Artırmaq:
        //    `hIncrBy` atomik əməliyyatdır, eyni anda çox sayda qoşulma olsa belə düzgün işləyir.
        const newPlayerCount = await pubClient.hIncrBy(roomKey, 'playerCount', 1);
        console.log(`📊 "${roomId}" otağının oyunçu sayı ${newPlayerCount}-ə yüksəldi.`);


        // ---- Socket.IO Otağına Qoşulma ----
        socket.join(roomId);
        console.log(`✅ ${username} (Socket: ${socket.id}) "${roomId}" otağına qoşuldu.`);

        // ---- Klientə və Digərlərinə Məlumat Göndərmək ----
        // a) Qoşulan klientə uğurlu qoşulma mesajı göndəririk
        const roomName = await pubClient.hGet(roomKey, 'name'); // Otağın adını alırıq
        socket.emit('joinedRoom', { roomId, roomName });

        // b) Otaqdakı DİGƏR oyunçu(lar)a yeni oyunçunun qoşulduğunu bildiririk
        //    `socket.to(roomId)` mesajı göndərən socket xaric, otaqdakı hər kəsə göndərir.
        socket.to(roomId).emit('playerJoined', { username, userId, socketId: socket.id });

        // c) BÜTÜN klientlərə (lobbidə olanlara) yenilənmiş otaq siyahısını göndəririk
        await broadcastRoomList(pubClient);

        // d) Əgər otaq bu oyunçu ilə dolursa, oyunu başlatmaq üçün siqnal göndəririk
        if (newPlayerCount === maxPlayers) {
            console.log(`🏁 Otaq ${roomId} doldu. Oyun başlada bilər.`);
            // Otağın statusunu 'playing' olaraq yeniləyə bilərik (istəyə bağlı)
            await pubClient.hSet(roomKey, 'status', 'playing');
            // Otaqdakı hər kəsə (qoşulan daxil) 'gameStart' hadisəsini göndəririk
            io.to(roomId).emit('gameStart');
            // Oyun lövhəsini və ilk növbəni burada sıfırlaya/təyin edə bilərsiniz
            // await pubClient.hSet(roomKey, 'board', JSON.stringify(Array(9).fill(null)));
            // const players = await getPlayersInRoom(pubClient, roomId);
            // await pubClient.hSet(roomKey, 'turn', players[Math.floor(Math.random() * players.length)]); // Təsadüfi ilk növbə
        }

    } catch (error) {
        console.error(`❌ "${roomId}" otağına ${username} qoşularkən xəta baş verdi:`, error);
        socket.emit('error', { message: 'Otağa qoşularkən xəta baş verdi.' });
        // Qoşulma xətası olarsa, potensial olaraq əlavə edilmiş qeydləri geri qaytarmaq cəhdi
        try {
            const currentRoom = await pubClient.get(playerSocketKey);
            // Yalnız bu otağa aid qeydi silməyə çalışırıq (əgər yazılıbsa)
            if (currentRoom === roomId) {
                await pubClient.sRem(`${roomKey}:players`, socket.id);
                await pubClient.del(playerSocketKey);
                // Sayğacı geri azaltmaq vacibdir
                await pubClient.hIncrBy(roomKey, 'playerCount', -1);
            }
        } catch (cleanupError) {
             console.error(`❌ Qoşulma xətası sonrası ${roomId} üçün təmizləmə zamanı xəta:`, cleanupError);
        }
        // Hər ehtimala qarşı otaq siyahısını yenidən yayımlayırıq
        await broadcastRoomList(pubClient);
    }
 }); // 'joinRoom' hadisəsinin sonu


 // Klient 'Otaqdan Ayrıl' düyməsini kliklədikdə
 socket.on('leaveRoom', async () => {
   console.log(`🚪 ${username} (Socket: ${socket.id}) otaqdan ayrılmaq istəyir.`);
   // Əsas təmizləmə və yeniləmə məntiqini çağıdırıq
   await handleDisconnectOrLeave(socket, pubClient);
   // Klient tərəfə lobbiyə qayıtması üçün siqnal göndərə bilərik (opsional)
   // socket.emit('redirect', '/OYUNLAR/tictactoe/lobby/test_odalar.html');
   socket.emit('leftRoom'); // Klientə otaqdan çıxdığını bildiririk ki, UI-ı yeniləsin
 });


 // Socket bağlantısı hər hansı səbəbdən kəsildikdə (tab bağlandı, internet getdi, vs.)
 socket.on('disconnect', async (reason) => {
   console.log(`🔌 ${username} (Socket: ${socket.id}) bağlantısı kəsildi. Səbəb: ${reason}`);
   // Əsas təmizləmə və yeniləmə məntiqini çağıdırıq
   await handleDisconnectOrLeave(socket, pubClient);
 });

// =======================================================================
// BU FUNKSİYA io.on('connection', ...) BLOKUNDAN KƏNARDA TƏYİN EDİLMƏLİDİR:
// (Məsələn, digər yardımçı funksiyaların yanında)

/**
* Socket bağlantısı kəsildikdə və ya istifadəçi aktiv şəkildə otaqdan ayrıldıqda ('leaveRoom')
* çağırılan ümumi funksiya. Oyunçunu Redis-dəki otaq qeydlərindən təmizləyir,
* otağın vəziyyətini yeniləyir və lazım gələrsə boş otağı silir. Sonda lobbi siyahısını yeniləyir.
* @param {object} socket - Ayrılan və ya bağlantısı kəsilən Socket.IO socket obyekti.
* @param {object} redisClient - Qoşulmuş Redis klienti (pubClient).
* @returns {Promise<void>}
*/
async function handleDisconnectOrLeave(socket, redisClient) {
 const username = socket.request.session?.username || `Qonaq_${socket.id.substring(0, 5)}`;
 const userId = socket.request.session?.userId;
 const playerSocketKey = `socket:${socket.id}:room`; // Bu socket-in otaq qeydi üçün açar

 try {
   // 1. Oyunçunun hansı otaqda olduğunu Redis-dən öyrənirik
   const roomId = await redisClient.get(playerSocketKey);

   // Əgər oyunçu həqiqətən bir otaqdadırsa (roomId varsa)
   if (roomId) {
     const roomKey = `room:${roomId}`; // Otağın əsas açarı
     console.log(`🧹 ${username} (Socket: ${socket.id}) "${roomId}" otağından təmizlənir...`);

     // 2. Oyunçunu Socket.IO otağından çıxarırıq (artıq mesaj almasın deyə)
     socket.leave(roomId);

     // 3. Oyunçunu Redis-dəki otaq oyunçuları Set-indən silirik
     // `sRem` silinən element sayını qaytarır (0 və ya 1)
     const removedPlayerCountFromSet = await redisClient.sRem(`${roomKey}:players`, socket.id);

     // 4. Oyunçunun otaq qeydini (socket:id:room) silirik
     await redisClient.del(playerSocketKey);

     // Əgər oyunçu həqiqətən Set-dən silindisə (yəni əvvəldən orada idisə)
     if (removedPlayerCountFromSet > 0) {
         // 5. Otağın oyunçu sayını (playerCount) 1 vahid azaldırıq
         //    `hIncrBy` mənfi dəyər ilə azaltmaq üçün də istifadə edilə bilər
         const finalPlayerCount = await redisClient.hIncrBy(roomKey, 'playerCount', -1);

         console.log(`📊 "${roomId}" otağının oyunçu sayı ${finalPlayerCount}-ə endirildi.`);

         // 6. Otağın boş qalıb qalmadığını yoxlayırıq
         if (finalPlayerCount <= 0) {
           // Otaq boşdursa, onu tamamilə silirik
           console.log(`🗑️ Otaq ${roomId} boş qaldı, silinir...`);
           // Otağın əsas Hash-ını silirik
           await redisClient.del(roomKey);
           // Otağın oyunçular Set-ini silirik (artıq boş olmalıdır, amma yenə də silirik)
           await redisClient.del(`${roomKey}:players`);
            // Əgər oyun spesifik məlumatlar saxlanılırsa (məsələn, oyunçuların seçimləri) onları da silmək lazımdır
            const playerSpecificKeys = await redisClient.keys(`room:${roomId}:player:*`);
            if (playerSpecificKeys.length > 0) {
               console.log(`🗑️ Silinən ${roomId} otağı üçün ${playerSpecificKeys.length} ədəd oyunçu spesifik məlumat silinir...`);
               await redisClient.del(playerSpecificKeys);
            }
           // Otağı aktiv otaqlar siyahısından ('activeRooms' Set-indən) çıxarırıq
           await redisClient.sRem('activeRooms', roomKey);
         } else {
           // Otaqda hələ də oyunçu(lar) varsa, onlara bu oyunçunun ayrıldığı barədə məlumat veririk
           console.log(`👤 ${username} otaqdan ayrıldı, ${finalPlayerCount} oyunçu qaldı.`);
           // io.to(roomId) istifadə edirik ki, mesaj qalan bütün oyunçulara getsin
           io.to(roomId).emit('playerLeft', { username: username, userId: userId, socketId: socket.id });
            // Oyun vəziyyətini sıfırlamaq və ya gözləmə moduna keçirmək lazım ola bilər
            // await redisClient.hSet(roomKey, 'status', 'waiting');
            // await redisClient.hDel(roomKey, 'board'); // Oyun lövhəsini təmizlə
            // await redisClient.hDel(roomKey, 'turn'); // Növbəni təmizlə
         }
     } else {
        // Əgər oyunçu Set-dən silinmədisə, bu o deməkdir ki, o, Set-də yox idi.
        // Bu, bəzən iki dəfə disconnect və ya başqa qeyri-adi vəziyyətlərdə ola bilər.
        console.log(`⚠️ ${username} (Socket: ${socket.id}) "${roomId}" otağının oyunçu siyahısında tapılmadı, çox güman ki, artıq çıxarılıb.`);
        // Hər ehtimala qarşı otağın hələ də mövcud olub olmadığını yoxlaya bilərik
        const roomStillExists = await redisClient.exists(roomKey);
        // Əgər otaq mövcud deyilsə, amma 'socket:id:room' qeydi var idisə,
        // 'activeRooms'-dan silindiyindən əmin oluruq.
        if (!roomStillExists) {
            console.log(`ℹ️ Otaq ${roomKey} onsuz da silinmiş görünür. 'activeRooms' yoxlanılır...`);
            await redisClient.sRem('activeRooms', roomKey);
        }
     }

     // 7. Sonda, nə olursa olsun, bütün lobbidəki klientlərə yenilənmiş otaq siyahısını göndəririk
     await broadcastRoomList(redisClient);

   } else {
     // Əgər 'socket:id:room' qeydi yoxdursa, deməli bu socket onsuz da heç bir otaqda deyildi.
     console.log(`ℹ️ ${username} (Socket: ${socket.id}) heç bir otaqda deyildi.`);
   }
 } catch (error) {
   console.error(`❌ Socket ${socket.id} üçün ayrılma/bağlantı kəsilməsi zamanı xəta:`, error);
   // Xəta baş verdikdə belə otaq siyahısını yeniləməyə çalışırıq
   try {
      await broadcastRoomList(redisClient);
   } catch (broadcastError) {
      console.error("❌ Ayrılma xətasından sonra otaq siyahısını yayımlayarkən xəta:", broadcastError);
   }
 }
}
// BU KOD io.on('connection', ...) BLOKUNUN DAXİLİNƏ ƏLAVƏ EDİLMƏLİDİR:
// (socket.on('disconnect', ...) listener-ından sonra)

  // --- Oyunla bağlı Socket Hadisələri (Redis ilə inteqrasiya edilməlidir) ---

  // Zər atma hadisəsi
  socket.on('rollDice', async (diceValue) => {
    // Oyunçunun hansı otaqda olduğunu tapırıq
    const roomId = await getRoomIdForSocket(pubClient, socket.id);
    if (!roomId) return; // Otaqda deyilsə heçnə etmirik

    console.log(`🎲 ${username} "${roomId}" otağında ${diceValue} zərini atdı.`);
    // Nəticəni otaqdakı digər oyunçu(lar)a göndəririk
    // `socket.to(roomId)` göndərən xaric digərlərinə göndərir
    socket.to(roomId).emit('opponentRolledDice', { userId, username, diceValue });

    // GƏLƏCƏKDƏ: Zər nəticələrini Redis-də saxlamaq lazım ola bilər
    // Məsələn: await pubClient.hSet(`room:${roomId}:player:${socket.id}`, 'dice', diceValue.toString());
    // Və ya hər iki oyunçunun nəticəsi gəldikdə kimin başlayacağını təyin etmək üçün məntiq.
  });

  // Simvol seçimi hadisəsi
  socket.on('symbolChosen', async ({ symbol }) => {
     const roomId = await getRoomIdForSocket(pubClient, socket.id);
     if (!roomId) return;

     console.log(` SYM ${username} "${roomId}" otağında '${symbol}' simvolunu seçdi.`);
     // Seçimi Redis-də bu oyunçu üçün qeyd edirik
     await pubClient.hSet(`room:${roomId}:player:${socket.id}`, 'symbol', symbol);
     // Seçimi otaqdakı digər oyunçu(lar)a bildiririk
     socket.to(roomId).emit('opponentSymbolChosen', { userId, username, symbol });

     // GƏLƏCƏKDƏ: Hər iki oyunçu simvol seçdikdən sonra oyun lövhəsini göstərmək və ilk növbəni təyin etmək.
     // const playerKeys = await pubClient.keys(`room:${roomId}:player:*`);
     // if (playerKeys.length === 2) {
     //    const p1Symbol = await pubClient.hGet(playerKeys[0], 'symbol');
     //    const p2Symbol = await pubClient.hGet(playerKeys[1], 'symbol');
     //    if (p1Symbol && p2Symbol) {
     //       console.log(` SYM Room ${roomId} symbols chosen. Ready to start.`);
     //       // İlk növbəni Redis-dən oxu/təyin et və klientlərə bildir.
     //       // const firstTurn = await pubClient.hGet(`room:${roomId}`, 'turn');
     //       // io.to(roomId).emit('startGameWithTurn', { startingPlayerId: firstTurn });
     //    }
     // }
  });

  // Gediş etmə hadisəsi
  socket.on('makeMove', async ({ index, symbol }) => {
     const roomId = await getRoomIdForSocket(pubClient, socket.id);
     if (!roomId) return;

     console.log(`♟️ ${username} "${roomId}" otağında ${index} xanasına '${symbol}' ilə gediş etdi.`);

     // ---- Redis ilə Oyun Məntiqi (Əsas Hissə) ----
     // 1. Gedişin Keçərliliyini Yoxlamaq (Opsional, amma tövsiyə olunur):
     //    - Növbə həqiqətən bu oyunçudadırmı? (Redis-dən `turn`-u oxu)
     //    - Seçilmiş xana boşdurmu? (Redis-dən `board`-u oxu)
     //    - const currentTurn = await pubClient.hGet(`room:${roomId}`, 'turn');
     //    - if (currentTurn !== socket.id) { /* Xəta: Sənin növbən deyil */ return; }
     //    - const boardJson = await pubClient.hGet(`room:${roomId}`, 'board');
     //    - let board = JSON.parse(boardJson || '[]'); // Boşdursa [] olsun
     //    - if (board[index]) { /* Xəta: Xana doludur */ return; }

     // 2. Gedişi Redis-dəki Lövhədə Qeyd Etmək:
     //    - const boardJson = await pubClient.hGet(`room:${roomId}`, 'board');
     //    - let board = JSON.parse(boardJson || JSON.stringify(Array(9).fill(null))); // Boşdursa yarat
     //    - board[index] = symbol;
     //    - await pubClient.hSet(`room:${roomId}`, 'board', JSON.stringify(board));
     //    - console.log(`Board updated for ${roomId}: ${JSON.stringify(board)}`);

     // 3. Gedişi Otaqdakı Digər Oyunçu(lar)a Göndərmək:
     socket.to(roomId).emit('moveMade', { index, symbol, playerId: socket.id });

     // 4. Oyunun Bitmə Vəziyyətini Yoxlamaq (Qalibiyyət və ya Heç-heçə):
     //    - Bu yoxlamanı Redis-dən aldığınız `board` üzərində etməlisiniz.
     //    - function checkWin(board, symbol) { /* ... Tic Tac Toe qaydaları ... */ }
     //    - function checkDraw(board) { /* ... Bütün xanalar doludurmu? ... */ }
     //    - const winner = checkWin(board, symbol);
     //    - const draw = !winner && checkDraw(board);

     // 5. Nəticəyə Görə Hərəkət Etmək:
     //    - if (winner) {
     //       console.log(`🏆 Winner in room ${roomId}: ${username} (${symbol})`);
     //       io.to(roomId).emit('gameOver', { winnerSymbol: symbol, winnerId: socket.id });
     //       await pubClient.hSet(`room:${roomId}`, 'status', 'finished'); // Otağın statusunu yenilə
     //       // Oyun bitdikdən sonra növbəni təmizləyə bilərsiniz:
     //       // await pubClient.hDel(`room:${roomId}`, 'turn');
     //    - } else if (draw) {
     //       console.log(`🤝 Draw in room ${roomId}`);
     //       io.to(roomId).emit('gameOver', { draw: true });
     //       await pubClient.hSet(`room:${roomId}`, 'status', 'finished');
     //       // await pubClient.hDel(`room:${roomId}`, 'turn');
     //    - } else {
     //       // Oyun davam edir, növbəni dəyişdirmək lazımdır
     //       const players = await getPlayersInRoom(pubClient, roomId);
     //       const nextPlayerId = players.find(pId => pId !== socket.id); // Digər oyunçunu tapırıq
     //       if (nextPlayerId) {
     //          await pubClient.hSet(`room:${roomId}`, 'turn', nextPlayerId); // Növbəni Redis-də yeniləyirik
     //          io.to(roomId).emit('turnChange', { nextPlayerId }); // Klientlərə növbənin kimdə olduğunu bildiririk
     //          console.log(`Turn changed in ${roomId} to: ${nextPlayerId}`);
     //       } else {
     //          console.error(`Error: Could not find next player in room ${roomId}`);
     //       }
     //    - }
     // ---- END Redis ilə Oyun Məntiqi ----
  });

   // Yenidən başlama (Restart) təklifi hadisəsi
   socket.on('requestRestart', async () => {
      const roomId = await getRoomIdForSocket(pubClient, socket.id);
      if (!roomId) return;
      console.log(`🔄 ${username} "${roomId}" otağında yenidən başlama təklif edir.`);
      // Təklifi digər oyunçuya göndəririk
      socket.to(roomId).emit('restartRequested', { requesterId: socket.id, requesterUsername: username });
      // Restart vəziyyətini Redis-də idarə etmək olar (kimin təklif etdiyini, kimin qəbul etdiyini)
      // await pubClient.hSet(`room:${roomId}:restart`, socket.id, 'requested');
  });

   // Yenidən başlama təklifini qəbul etmə hadisəsi
   socket.on('acceptRestart', async () => {
      const roomId = await getRoomIdForSocket(pubClient, socket.id);
      if (!roomId) return;
      console.log(`✅ ${username} "${roomId}" otağında yenidən başlama təklifini qəbul etdi.`);

      // Restart statusunu yoxlamaq (əgər Redis-də saxlanılıbsa)
      // const requesterId = await pubClient.hGet(`room:${roomId}:restart`, 'requester'); // Məsələn
      // if (!requesterId) { /* Xəta: Restart təklifi yox idi */ return; }

      // Hər iki oyunçuya restart siqnalı göndəririk
      io.to(roomId).emit('restartGame'); // Klientlər UI-ı sıfırlamalıdır

      // Oyun vəziyyətini Redis-də sıfırlayırıq
      // await pubClient.hSet(`room:${roomId}`, 'board', JSON.stringify(Array(9).fill(null)));
      // await pubClient.hSet(`room:${roomId}`, 'status', 'playing'); // Statusu yenidən playing et
      // await pubClient.hDel(`room:${roomId}`, 'turn'); // Növbəni təmizlə
      // await pubClient.del(`room:${roomId}:restart`); // Restart qeydlərini təmizlə
      // await pubClient.del(`room:${roomId}:player:*`); // Oyunçu simvollarını təmizlə (və ya yenidən zər atma/seçim mərhələsi)

      // GƏLƏCƏKDƏ: Restartdan sonra oyuna necə başlanacağını təyin edin (zər atma, simvol seçmə, vs.)
      // Məsələn, yenidən zər atma siqnalı göndərə bilərsiniz:
      // io.to(roomId).emit('startDiceRollPhase');
  });

// --- END Oyunla bağlı Socket Hadisələri ---

// =======================================================================
// BU KOD io.on('connection', ...) BLOKUNDAN VƏ handleDisconnectOrLeave FUNKSİYASINDAN SONRA,
// FAYLIN ƏN SONUNA YERLƏŞDİRİLMƏLİDİR:

// --- Server Başlatma və Redis Qoşulması ---
const PORT = process.env.PORT || 3000; // Portu .env faylından və ya default 3000 götürürük

// Redis klientlərinin hər ikisinin də uğurla qoşulmasını gözləyirik
Promise.all([pubClient.connect(), subClient.connect()])
  .then(() => {
    // Hər iki klient qoşulduqda bu blok işə düşür
    console.log('✅✅✅ Pub/Sub Redis klientləri uğurla qoşuldu.');

    // Socket.IO üçün Redis adapterini indi konfiqurasiya edirik
    // Bu, Socket.IO-nun mesajları və otaq məlumatlarını Redis vasitəsilə idarə etməsini təmin edir
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.IO Redis adapteri konfiqurasiya edildi.');

    // Yalnız Redis qoşulduqdan və adapter qurulduqdan sonra HTTP serverini dinləməyə başlayırıq
    server.listen(PORT, () => {
      console.log(`🚀 Server ${PORT} portunda işləyir`);
      // Faydalı linkləri göstəririk
      console.log(`🌐 Əsas giriş/qeydiyyat: http://localhost:${PORT}/ana_sehife/login/login.html`);
      console.log(`🎮 Oyun lobbisi (girişdən sonra): http://localhost:${PORT}/OYUNLAR/tictactoe/lobby/test_odalar.html`);
    });
  })
  .catch((err) => {
    // Əgər Redis klientlərindən hər hansı biri qoşula bilməsə
    console.error('❌❌❌ Redis-ə qoşulmaq mümkün olmadı! Server işə düşmədi.', err);
    // Redis olmadan tətbiq düzgün işləməyəcəyi üçün prosesi dayandırırıq
    process.exit(1); // Xəta kodu ilə çıxış
  });

// --- END Server Başlatma ---