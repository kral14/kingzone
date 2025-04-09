// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================
// QEYD: Bu versiya oyun məntiqini və vəziyyətini serverə köçürmək üçün
// ciddi şəkildə yenidən işlənmişdir.
// ========================================================================

// ------------------------------------------------------------------------
// --- Part 1.1: Requires & İlkin Quraşdırma ---
// ------------------------------------------------------------------------
// Qeyd: Əsas modulların import edilməsi və server obyektlərinin yaradılması.

console.log("========================================================");
console.log("--- Server Başladılır (v5 - Server-Mərkəzli) ---");
console.log("========================================================");

// ---- Əsas Modulların Import Edilməsi ----
require('dotenv').config(); // .env faylındakı dəyişənləri yükləmək üçün
const express = require('express');
const http = require('http');
const { Server } = require("socket.io"); // Dəyişiklik: socket.io importu
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg'); // PostgreSQL üçün
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session); // Sessionları DB-də saxlamaq üçün
const crypto = require('crypto'); // Otaq ID yaratmaq üçün (əvvəl inline idi, indi import edək)

const saltRounds = 10; // bcrypt üçün salt raundları

// ---- Express və Socket.IO Tətbiqlərinin Yaradılması ----
const app = express();
console.log('[Setup 1.1] Express tətbiqi yaradıldı.');
const server = http.createServer(app);
console.log('[Setup 1.1] HTTP server yaradıldı.');
const io = new Server(server, { // Dəyişiklik: new Server() istifadəsi
    cors: {
        origin: "*", // Təhlükəsizlik üçün bunu production-da dəqiqləşdirin! Məsələn: process.env.CORS_ORIGIN
        methods: ["GET", "POST"]
    },
    pingInterval: 10000, // 10 saniyədə bir ping
    pingTimeout: 5000   // 5 saniyə cavab gözləmə (əvvəl 15 idi, azaldıldı)
});
console.log('[Setup 1.1] Socket.IO serveri yaradıldı.');
console.log(`[Setup 1.1] Socket.IO CORS ayarı: origin='${io.opts.cors.origin}'`);
console.log(`[Setup 1.1] Socket.IO ping ayarları: interval=${io.opts.pingInterval}, timeout=${io.opts.pingTimeout}`);

// ---- PostgreSQL Verilənlər Bazası Bağlantı Pool-u ----
if (!process.env.DATABASE_URL) {
    console.error('[FATAL ERROR 1.1] DATABASE_URL mühit dəyişəni tapılmadı! Server dayandırılır.');
    process.exit(1); // Serveri dayandır
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false // Productionda SSL istifadə et, lokalda yox
});
console.log('[Setup 1.1] PostgreSQL connection pool yaradıldı.');
console.log(`[Setup 1.1] DB SSL ayarı: ${process.env.NODE_ENV === 'production' ? '{ rejectUnauthorized: false }' : 'false'}`);

// Bağlantı testi (async/await ilə daha səliqəli)
async function testDBConnection() {
    let client;
    try {
        client = await pool.connect();
        console.log('[DB Check 1.1] DB bağlantısı test üçün alındı.');
        const result = await client.query('SELECT NOW()');
        const dbTime = new Date(result.rows[0].now).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
        console.log(`---- [DB Check 1.1] Verilənlər bazasına uğurla qoşuldu: ${dbTime} ----`);
    } catch (err) {
        console.error('[DB Check 1.1] Verilənlər bazasına qoşulma və ya sorğu xətası:', err.stack);
    } finally {
        if (client) {
            client.release(); // Bağlantını pool-a qaytar
            console.log('[DB Check 1.1] DB test bağlantısı buraxıldı.');
        }
    }
}
testDBConnection(); // Funksiyanı çağır

// ------------------------------------------------------------------------
// --- Part 1.2: Middleware Quraşdırması ---
// ------------------------------------------------------------------------
// Qeyd: Session, JSON, Logging, Statik fayllar və Autentifikasiya middleware-ləri.

// ---- Express Ayarları (Sessiondan əvvəl) ----
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // Render kimi proxy arxasında işləyərkən lazımdır
    console.log('[Setup 1.2] Express "trust proxy" ayarı aktiv edildi (production).');
} else {
    console.log('[Setup 1.2] Express "trust proxy" ayarı aktiv deyil (development).');
}

// ---- Session Middleware Konfiqurasiyası ----
if (!process.env.SESSION_SECRET) {
    console.error('[FATAL ERROR 1.2] SESSION_SECRET mühit dəyişəni tapılmadı! Server dayandırılır.');
    process.exit(1);
}
const sessionMiddleware = session({
  store: new pgSession({
    pool : pool,                // Mövcud PostgreSQL pool-u istifadə et
    tableName : 'user_sessions', // Session cədvəlinin adı
    pruneSessionInterval: 60 * 15 // 15 dəqiqədə bir köhnə sessionları təmizlə (saniyə)
  }),
  secret: process.env.SESSION_SECRET,
  resave: false, // Dəyişiklik olmasa belə sessionu təkrar yadda saxlama
  saveUninitialized: false, // Boş sessionları yadda saxlama
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Yalnız HTTPS üzərindən göndər (productionda)
    httpOnly: true,          // Client tərəfi JS cookie-yə çata bilməsin
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 gün (millisaniyə)
    sameSite: 'lax'          // CSRF hücumlarına qarşı qismən qoruma
  }
});
app.use(sessionMiddleware); // Session middleware-i Express üçün aktiv et
console.log('[Setup 1.2] Session middleware (pgSession ilə) konfiqurasiya edildi və tətbiq olundu.');
console.log(`[Setup 1.2] Session cookie ayarları: secure=${process.env.NODE_ENV === 'production'}, httpOnly=true, maxAge=${1000 * 60 * 60 * 24 * 7}, sameSite='lax'`);

// ---- Digər Express Middleware-ləri ----
app.use(express.json()); // Gələn JSON request body-lərini parse etmək üçün
console.log('[Setup 1.2] Express JSON parser middleware tətbiq edildi.');

// --- Sorğu Loglama Middleware ---
app.use((req, res, next) => {
    // Statik fayl və API sorğularını logla
    if (req.url.includes('.') || req.url.startsWith('/api/') || req.url.startsWith('/profile') || req.url.startsWith('/login') || req.url.startsWith('/register') || req.url.startsWith('/logout') || req.url.startsWith('/check-auth') || req.url === '/') {
         console.log(`[Request Log 1.2] Request: ${req.method} ${req.originalUrl} (IP: ${req.ip})`);
    }
    next();
});
console.log('[Setup 1.2] Sadə sorğu loglama middleware tətbiq edildi.');

// --- Statik Fayl Middleware ---
// Düzgün yol: public qovluğu server.js-dən bir üst səviyyədədir
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath));
console.log('[Setup 1.2] Static files middleware tətbiq edildi. Statik qovluq:', publicDirectoryPath);

// --- Autentifikasiya Middleware Funksiyası ---
// Qeyd: Bu funksiya müəyyən API endpointləri üçün istifadə olunacaq
const isAuthenticated = (req, res, next) => {
  // Session və session.user obyektinin mövcudluğunu yoxla
  if (req.session && req.session.user && req.session.user.id) {
    // Log: İcazə verildi
    // console.log(`[Auth Check 1.2] OK - User: ${req.session.user.nickname}, Path: ${req.originalUrl}`);
    return next(); // İstifadəçi giriş edib, davam et
  } else {
    // Log: İcazə verilmədi
    console.warn(`[Auth Check 1.2] FAILED - Giriş tələb olunur. Path: ${req.originalUrl}, SessionID: ${req.sessionID || 'N/A'}`);
    // Session yoxdursa və ya etibarsızdırsa, 401 Unauthorized statusu qaytar
    return res.status(401).json({ message: 'Bu əməliyyat üçün giriş tələb olunur.' });
  }
};
console.log('[Setup 1.2] isAuthenticated middleware funksiyası təyin edildi.');

// ------------------------------------------------------------------------
// --- Part 1.3: Qlobal Dəyişənlər & Yardımçı Funksiyalar ---
// ------------------------------------------------------------------------
// Qeyd: Serverdə aktiv otaqları və istifadəçiləri saxlamaq üçün obyektlər,
// otaq ID yaratma və otaq siyahısını göndərmə funksiyaları.

// ---- Qlobal Yaddaş Obyektləri ----
let rooms = {}; // Aktiv oyun otaqlarını saxlayır (key: roomId, value: roomObject)
let users = {}; // Hazırda qoşulu olan socket bağlantılarını saxlayır (key: socket.id, value: userObject)
console.log('[State 1.3] Qlobal `rooms` və `users` obyektləri yaradıldı.');

// ---- Yardımçı Funksiyalar ----
function generateRoomId() {
    // Təsadüfi 6 byte (12 hex simvol) ID yaradır
    const newId = crypto.randomBytes(6).toString('hex');
    console.log(`[Helper 1.3] Yeni Room ID yaradıldı: ${newId}`);
    return newId;
}

// Otaq siyahısını formatlayıb bütün clientlərə göndərən funksiya
function broadcastRoomList() {
    console.log('[Broadcast 1.3] Otaq siyahısı bütün clientlərə göndərilir...');
    try {
        const roomListForClients = Object.values(rooms)
            // Yalnız AI olmayan və ya standart AI otaqlarını göndər (əgər başqa AI növü olarsa)
            // .filter(room => !room.isAiRoom || defaultRoomsData.some(dr => dr.name === room.name))
            .map(room => {
                // Hər otaq üçün clientə göndəriləcək məlumatları formatla
                const player1SocketId = room.players?.[0];
                const player2SocketId = room.players?.[1];
                const player1Username = player1SocketId ? users[player1SocketId]?.username : null;
                // Server-mərkəzli state-də oyunçu adları gameState-də olacaq
                const player2Username = player2SocketId ? users[player2SocketId]?.username : (room.gameState?.player2Username); // Hələlik users-dən alaq

                return {
                    id: room.id,
                    name: room.name,
                    playerCount: room.players?.length ?? 0, // Oyunçu sayı
                    hasPassword: !!room.password, // Şifrə var/yox
                    boardSize: room.boardSize, // Lövhə ölçüsü
                    creatorUsername: room.creatorUsername, // Otağı yaradan
                    player1Username: player1Username || room.gameState?.player1Username, // Oyunçu 1 adı (gameState-dən də yoxla)
                    player2Username: player2Username, // Oyunçu 2 adı
                    isAiRoom: !!room.isAiRoom // AI otağıdır?
                };
            });
        // console.log('[Broadcast 1.3] Göndərilən otaq siyahısı:', JSON.stringify(roomListForClients, null, 2)); // Detallı log (lazım gələrsə)
        io.emit('room_list_update', roomListForClients); // Bütün qoşulu clientlərə göndər
        console.log(`[Broadcast 1.3] Otaq siyahısı yeniləndi (${roomListForClients.length} otaq).`);
    } catch (error) {
        console.error("[Broadcast 1.3] Otaq siyahısı göndərilərkən XƏTA:", error);
        // Xəta baş verərsə, boş siyahı göndərək ki, client tərəf çökəməsin
        io.emit('room_list_update', []);
    }
}

// ------------------------------------------------------------------------
// --- Part 1.4: Oyun Vəziyyəti Strukturu & Standart Otaqlar ---
// ------------------------------------------------------------------------
// Qeyd: Serverdə hər otaq üçün saxlanılacaq oyun vəziyyəti strukturunun
// təsviri və server başladığında standart AI otaqlarının yaradılması.

// ---- Oyun Vəziyyəti (gameState) Obyektinin Strukturu (Konseptual) ----
// Hər `rooms[roomId]` obyektinin içində belə bir `gameState` alt-obyekti olacaq:
/*
rooms[roomId].gameState = {
    board: [], // Lövhənin vəziyyəti (['X', '', 'O', ...]) - boardSize*boardSize ölçülü
    currentPlayerSymbol: null, // Sırası olan oyunçunun simvolu ('X' və ya 'O')
    player1SocketId: null, // Birinci qoşulan oyunçunun socket ID-si
    player2SocketId: null, // İkinci qoşulan oyunçunun socket ID-si
    player1UserId: null,   // Birinci oyunçunun DB User ID-si (sessiondan)
    player2UserId: null,   // İkinci oyunçunun DB User ID-si (sessiondan)
    player1Username: null, // Birinci oyunçunun adı
    player2Username: null, // İkinci oyunçunun adı
    player1Symbol: null, // Birinci oyunçunun simvolu ('X' və ya 'O')
    player2Symbol: null, // İkinci oyunçunun simvolu ('X' və ya 'O')
    player1Roll: null,   // Birinci oyunçunun zər nəticəsi
    player2Roll: null,   // İkinci oyunçunun zər nəticəsi
    diceWinnerSocketId: null, // Zəri udan oyunçunun socket ID-si
    symbolPickerSocketId: null, // Simvolu seçməli olan oyunçunun socket ID-si
    isGameOver: true,   // Oyun bitibmi? (true/false)
    winnerSymbol: null, // Qalibin simvolu ('X', 'O', 'draw', null)
    winningCombination: [], // Qazanan xanaların indeksləri (əgər varsa)
    statusMessage: "Oyun Gözlənilir", // Oyunun hazırkı statusu (məs: "Zər atılır", "X simvolu seçir", "Sıra O-da")
    lastMoveTime: null // Son hərəkətin vaxtı (AFK yoxlaması üçün?)
};
*/
console.log('[State 1.4] Oyun vəziyyəti (gameState) strukturu təyin edildi (konseptual).');


// ---- Standart AI Otaqlarını Yaratmaq Funksiyası ----
const defaultAiRoomsData = [ // Bu massivi qlobala çıxartmaq olar
    { name: "SNOW ilə 3x3", size: 3 },
    { name: "SNOW ilə 4x4", size: 4 },
    { name: "SNOW ilə 5x5", size: 5 },
    { name: "SNOW ilə 6x6", size: 6 }
];

function createDefaultRooms() {
    console.log('[Setup 1.4] Standart AI otaqları yaradılır/yoxlanılır...');
    let createdCount = 0;
    defaultAiRoomsData.forEach(roomData => {
        // Eyni adda AI otağının artıq mövcud olub olmadığını yoxla
        const exists = Object.values(rooms).some(room => room.name === roomData.name && room.isAiRoom);
        if (!exists) {
            const roomId = `ai_${generateRoomId()}`;
            rooms[roomId] = {
                id: roomId,
                name: roomData.name,
                password: null, // AI otaqları şifrəsizdir
                players: [], // Server AI otaqlarında real oyunçu saxlamır
                boardSize: roomData.size,
                creatorUsername: "SNOW", // Simvolik yaradan
                gameState: null, // AI otaqları üçün server state saxlamır
                isAiRoom: true // Bu bir AI otağıdır
            };
            createdCount++;
            console.log(`[Setup 1.4] AI otağı yaradıldı: ID=${roomId}, Adı=${roomData.name}`);
        }
    });
    if (createdCount > 0) { console.log(`[Setup 1.4] ${createdCount} ədəd standart AI otağı yaradıldı.`); }
    else { console.log('[Setup 1.4] Bütün standart AI otaqları artıq mövcud idi.'); }
    // Yaradıldıqdan sonra otaq siyahısını göndərək (server başladığında çağırılacaq)
    // broadcastRoomList(); // Bunu server.listen içində edəcəyik
}

// ------------------------------------------------------------------------
// --- Hissə 1 Sonu ---
// ------------------------------------------------------------------------