// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Düzəliş Edilmiş - AI Start + boardSize)
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
const { Server } = require("socket.io");
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg'); // PostgreSQL üçün
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session); // Sessionları DB-də saxlamaq üçün
const crypto = require('crypto');

const saltRounds = 10; // bcrypt üçün salt raundları

// ---- Express və Socket.IO Tətbiqlərinin Yaradılması ----
const app = express();
console.log('[Setup 1.1] Express tətbiqi yaradıldı.');
const server = http.createServer(app);
console.log('[Setup 1.1] HTTP server yaradıldı.');
const io = new Server(server, {
    cors: {
        origin: "*", // Təhlükəsizlik üçün bunu production-da dəqiqləşdirin! Məsələn: process.env.CORS_ORIGIN
        methods: ["GET", "POST"]
    },
    pingInterval: 10000, // 10 saniyədə bir ping
    pingTimeout: 5000    // 5 saniyə cavab gözləmə
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
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
console.log('[Setup 1.1] PostgreSQL connection pool yaradıldı.');
console.log(`[Setup 1.1] DB SSL ayarı: ${process.env.NODE_ENV === 'production' ? '{ rejectUnauthorized: false }' : 'false'}`);

// Bağlantı testi
async function testDBConnection() {
    let client;
    try {
        client = await pool.connect();
        console.log('[DB Check 1.1] DB bağlantısı test üçün alındı.');
        const result = await client.query('SELECT NOW()');
        // Vaxtı Azərbaycan saatı ilə göstərək (istəyə bağlı)
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


// --- Hissə 1 Sonu ---
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
    tableName : 'user_sessions', // Session cədvəlinin adı (DB-də yaratmaq lazımdır)
    pruneSessionInterval: 60 * 15 // 15 dəqiqədə bir köhnə sessionları təmizlə (saniyə)
  }),
  secret: process.env.SESSION_SECRET,
  resave: false, // Dəyişiklik olmasa belə sessionu təkrar yadda saxlama
  saveUninitialized: false, // Boş sessionları yadda saxlama
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Yalnız HTTPS üzərindən göndər (productionda)
    httpOnly: true,           // Client tərəfi JS cookie-yə çata bilməsin
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 gün (millisaniyə)
    sameSite: 'lax'           // CSRF hücumlarına qarşı qismən qoruma
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
    // Daha dəqiq filterləmə etmək olar (məs, yalnız API)
    if (req.url.includes('.') || req.url.startsWith('/api/') || req.url.startsWith('/profile') || req.url.startsWith('/login') || req.url.startsWith('/register') || req.url.startsWith('/logout') || req.url.startsWith('/check-auth') || req.url === '/') {
         console.log(`[Request Log 1.2] Request: ${req.method} ${req.originalUrl} (IP: ${req.ip})`);
    }
    next();
});
console.log('[Setup 1.2] Sadə sorğu loglama middleware tətbiq edildi.');

// --- Statik Fayl Middleware ---
// Düzgün yol: public qovluğu server.js faylının olduğu qovluqdadır
const publicDirectoryPath = path.join(__dirname, 'public');
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


// --- Hissə 2 Sonu ---
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

// Client üçün təhlükəsiz otaq məlumatlarını formatlayan funksiya (Təyin edilməsi lazımdır əgər istifadə olunacaqsa)
// function getRoomInfoForClient(room) { ... }
// console.log('[Helper 1.3] getRoomInfoForClient funksiyası təyin edildi.'); // Şərhə alındı, çünki player_ready-dən çağırış silindi


// Otaq siyahısını formatlayıb bütün clientlərə göndərən funksiya (Part 4-də təyin olunacaq)
// function broadcastRoomList() { ... }


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
    boardSize: 3, // <<< initializeGameState-də təyin olunur >>>
    currentPlayerSymbol: null, // Sırası olan oyunçunun simvolu ('X' və ya 'O')
    player1SocketId: null,
    player2SocketId: null, // AI üçün 'AI_SNOW' ola bilər
    player1UserId: null,
    player2UserId: null,   // AI üçün 'AI_SNOW' ola bilər
    player1Username: null,
    player2Username: null, // AI üçün 'SNOW' ola bilər
    player1Symbol: null,
    player2Symbol: null,
    player1Roll: null,
    player2Roll: null,
    diceWinnerSocketId: null,
    symbolPickerSocketId: null,
    isGameOver: true,    // İlkin vəziyyət
    winnerSymbol: null,
    winningCombination: [],
    statusMessage: "Oyun Gözlənilir",
    lastMoveTime: null
};
*/
console.log('[State 1.4] Oyun vəziyyəti (gameState) strukturu təyin edildi (konseptual).');


// ---- Standart AI Otaqlarını Yaratmaq Funksiyası ----
const defaultAiRoomsData = [
    { name: "SNOW ilə 3x3", size: 3 },
    { name: "SNOW ilə 4x4", size: 4 },
    { name: "SNOW ilə 5x5", size: 5 },
    { name: "SNOW ilə 6x6", size: 6 }
];

function createDefaultRooms() {
    console.log('[Setup 1.4] Standart AI otaqları yaradılır/yoxlanılır...');
    let createdCount = 0;
    defaultAiRoomsData.forEach(roomData => {
        const exists = Object.values(rooms).some(room => room.name === roomData.name && room.isAiRoom);
        if (!exists) {
            const roomId = `ai_${generateRoomId()}`;
            rooms[roomId] = {
                id: roomId,
                name: roomData.name,
                password: null,
                players: [], // AI otaqları üçün 'players' massivi istifadə edilmir
                boardSize: roomData.size,
                creatorUsername: "SNOW",
                gameState: null, // player_ready-də yaranır
                isAiRoom: true
            };
            createdCount++;
            console.log(`[Setup 1.4] AI otağı yaradıldı: ID=${roomId}, Adı=${roomData.name}`);
        }
    });
    if (createdCount > 0) { console.log(`[Setup 1.4] ${createdCount} ədəd standart AI otağı yaradıldı.`); }
    else { console.log('[Setup 1.4] Bütün standart AI otaqları artıq mövcud idi.'); }
    // broadcastRoomList(); // Bunu server.listen içində edəcəyik
}


// --- Hissə 3 Sonu ---
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Düzəliş Edilmiş - AI Start + boardSize)
// ========================================================================

// ... (Hissə 1, 2, və 3-dən kodlar buradadır) ...

// ------------------------------------------------------------------------
// --- Part 2.1: Otaq Siyahısı Yayımı (Yenidən Baxılmış) ---
// ------------------------------------------------------------------------
// Qeyd: Otaq siyahısını formatlayıb bütün clientlərə göndərən funksiya.

function broadcastRoomList() {
    console.log('[Broadcast 2.1] Otaq siyahısı bütün clientlərə göndərilir...');
    try {
        const roomListForClients = Object.values(rooms)
            .map(room => {
                // Oyunçu adlarını əvvəlcə gameState-dən, sonra users obyektindən almağa çalışaq
                const player1Info = room.gameState?.player1SocketId ? (users[room.gameState.player1SocketId] /*|| { username: room.gameState.player1Username }*/) : null;
                // AI otaqları üçün player2Username birbaşa gameState-dən götürüləcək (əgər varsa)
                const player2Info = room.gameState?.player2SocketId && room.gameState?.player2SocketId !== 'AI_SNOW' ? (users[room.gameState.player2SocketId] /*|| { username: room.gameState.player2Username }*/) : null;

                return {
                    id: room.id,
                    name: room.name,
                    // Oyunçu sayını gameState-dəki aktiv oyunçulara görə hesablayaq (AI daxil)
                    playerCount: (room.gameState?.player1SocketId ? 1 : 0) + (room.gameState?.player2SocketId ? 1 : 0),
                    // playerCount: room.players?.length ?? 0, // Aktiv socket sayını göstərmək də olar
                    hasPassword: !!room.password,
                    boardSize: room.boardSize,
                    creatorUsername: room.creatorUsername,
                    player1Username: player1Info?.username || room.gameState?.player1Username || null, // gameState-dən də yoxla
                    player2Username: player2Info?.username || room.gameState?.player2Username || null, // AI adı da daxil
                    isAiRoom: !!room.isAiRoom
                };
            });
        io.emit('room_list_update', roomListForClients);
        console.log(`[Broadcast 2.1] Otaq siyahısı yeniləndi (${roomListForClients.length} otaq).`);
    } catch (error) {
        console.error("[Broadcast 2.1] Otaq siyahısı göndərilərkən XƏTA:", error);
        io.emit('room_list_update', []);
    }
}


// ------------------------------------------------------------------------
// --- Part 2.2: Server Tərəfi Oyun Məntiqi Funksiyaları ---
// ------------------------------------------------------------------------
// Qeyd: Oyunun vəziyyətini idarə edən əsas funksiyalar.

/**
* Yeni bir oyun üçün gameState obyektini yaradır və ya sıfırlayır.
* @param {object} room - Vəziyyəti sıfırlanacaq otaq obyekti.
* @param {string | null} player1SocketId - Birinci oyunçunun socket ID-si (və ya null).
* @param {string | null} player2SocketId - İkinci oyunçunun socket ID-si (və ya null).
*/
function initializeGameState(room, player1SocketId, player2SocketId) {
    console.log(`[Game Logic 2.2] Otaq üçün gameState yaradılır/sıfırlanır: ${room?.id}`);
    if (!room) {
        console.error("[Game Logic 2.2] initializeGameState: Otaq obyekti tapılmadı!");
        return;
    }
    const boardSize = room.boardSize || 3;
    const user1 = player1SocketId ? users[player1SocketId] : null;
    const user2 = player2SocketId ? users[player2SocketId] : null;

    // Yeni gameState obyektini yarat
    const newGameState = {
        board: Array(boardSize * boardSize).fill(''),
        boardSize: boardSize, // <<< --- DÜZƏLİŞ: boardSize əlavə edildi --- <<<
        currentPlayerSymbol: null, // Zər atma ilə təyin olunacaq (və ya AI üçün birbaşa)
        player1SocketId: player1SocketId || null,
        player2SocketId: player2SocketId || null,
        player1UserId: user1?.userId || null,
        player2UserId: user2?.userId || null,
        player1Username: user1?.username || (player1SocketId ? 'Oyunçu 1?' : null), // Adı user-dən götür
        player2Username: user2?.username || (player2SocketId ? 'Oyunçu 2?' : null),
        player1Symbol: null,
        player2Symbol: null,
        player1Roll: null,
        player2Roll: null,
        diceWinnerSocketId: null,
        symbolPickerSocketId: null,
        isGameOver: false, // Oyun başlayır (amma sıra/simvol hələ yox, Zər Atılır statusu)
        winnerSymbol: null,
        winningCombination: [],
        // İlkin status: Hər iki oyunçu varsa "Zər Atılır", yoxsa "Rəqib gözlənilir"
        statusMessage: (player1SocketId && player2SocketId) ? "Zər Atılır..." : "Rəqib gözlənilir...",
        lastMoveTime: Date.now()
    };

    // Yaradılmış gameState-i otağın özünə mənimsət
    room.gameState = newGameState;

    console.log(`[Game Logic 2.2] gameState yaradıldı/sıfırlandı:`, JSON.stringify(room.gameState));
}

/**
 * Oyuna ikinci oyunçunu əlavə edir (Placeholder - Məntiqi tamamlanmalıdır)
 * @param {object} gameState - Yenilənəcək oyun vəziyyəti.
 * @param {object} user - Qoşulan istifadəçi məlumatları (sessiondan).
 * @param {string} socketId - Qoşulan oyunçunun socket ID-si.
 */
function addPlayerToGame(gameState, user, socketId) {
    // Bu funksiya join_room və player_ready içində çağırılır
    // Məntiqi: gameState-də player2 üçün boş yerləri doldurmaq
    console.warn("[Game Logic Placeholder 2.2] addPlayerToGame funksiyası çağırıldı, amma məntiqi tam deyil.");
    if (gameState && !gameState.player2SocketId && gameState.player1SocketId !== socketId) {
        gameState.player2SocketId = socketId;
        gameState.player2UserId = user?.userId;
        gameState.player2Username = user?.username || 'Oyunçu 2';
        console.log(`[Game Logic Placeholder 2.2] Oyunçu 2 (${user?.username}) gameState-ə əlavə edildi.`);
        // Statusu "Zər Atılır..." etmək (əgər deyilsə)
        if (!gameState.statusMessage.includes("Zər Atılır")) {
            gameState.statusMessage = "Zər Atılır...";
        }
    } else {
        console.warn(`[Game Logic Placeholder 2.2] addPlayerToGame: İkinci oyunçu yeri dolu və ya eyni oyunçu qoşulmağa çalışır.`);
    }
}

/**
 * AI oyunçusunu gameState-ə əlavə edir (Placeholder - Məntiqi tamamlanmalıdır)
 * @param {object} gameState - Yenilənəcək oyun vəziyyəti.
 * @param {object} room - Otaq məlumatları.
 */
function addAiPlayerToGame(gameState, room) {
    // Bu funksiya player_ready içində AI otağı üçün çağırılır
    console.warn("[Game Logic Placeholder 2.2] addAiPlayerToGame funksiyası çağırıldı, amma məntiqi tam deyil.");
    if (gameState && !gameState.player2SocketId) {
        gameState.player2SocketId = 'AI_SNOW'; // Simvolik ID
        gameState.player2Username = 'SNOW';    // AI adı
        gameState.player2UserId = 'AI_SNOW';     // Simvolik User ID
        console.log(`[Game Logic Placeholder 2.2] AI oyunçusu gameState-ə əlavə edildi.`);
    }
}


/**
* Clientdən gələn hərəkəti emal edir, lövhəni yeniləyir, qazanmanı yoxlayır.
* @param {string} roomId - Otağın ID-si.
* @param {string} socketId - Hərəkəti edən oyunçunun socket ID-si.
* @param {number} index - Kliklənən xananın indeksi.
* @returns {boolean} - Hərəkət uğurlu olubsa true, yoxsa false.
*/
function handleMakeMoveServer(roomId, socketId, index) {
    // console.log(`[Game Logic 2.2] handleMakeMoveServer çağırıldı: Room=${roomId}, Player=${socketId}, Index=${index}`);
    const room = rooms[roomId];
    if (!room || !room.gameState || room.gameState.isGameOver) {
        console.warn(`[Game Logic 2.2] Keçərsiz hərəkət cəhdi (otaq/oyun yoxdur və ya bitib): Room=${roomId}`);
        return false;
    }

    const state = room.gameState;
    // Oyunçunun simvolunu tap
    let playerSymbol = null;
    if (socketId === state.player1SocketId) playerSymbol = state.player1Symbol;
    else if (socketId === state.player2SocketId) playerSymbol = state.player2Symbol;
    else { console.error(`[Game Logic 2.2] Hərəkət edən (${socketId}) oyunçu deyil!`); return false; }

    if (!playerSymbol) { console.error(`[Game Logic 2.2] Oyunçunun (${socketId}) simvolu təyin edilməyib!`); return false; }

    // Sıra yoxlaması
    if (state.currentPlayerSymbol !== playerSymbol) {
        console.warn(`[Game Logic 2.2] Sıra səhvi: Sıra ${state.currentPlayerSymbol}-da idi, amma ${playerSymbol} (${socketId}) hərəkət etdi.`);
        return false;
    }
    // Xananing boş olub olmadığını və indeksin keçərli olduğunu yoxla
    if (index < 0 || index >= state.board.length || state.board[index] !== '') {
        console.warn(`[Game Logic 2.2] Keçərsiz xana indeksi (${index}) və ya dolu xana.`);
        return false;
    }

    // Hərəkəti et
    state.board[index] = playerSymbol;
    state.lastMoveTime = Date.now();
    // console.log(`[Game Logic 2.2] Lövhə yeniləndi:`, state.board.join(',') || 'boş');

    // Qazanma və ya heç-heçə yoxlaması
    if (checkWinServer(room, playerSymbol)) {
        console.log(`[Game Logic 2.2] Oyun bitdi! Qalib: ${playerSymbol}`);
        state.isGameOver = true;
        state.winnerSymbol = playerSymbol;
        // Qalibin adını tap
        const winnerUsername = (playerSymbol === state.player1Symbol) ? state.player1Username : state.player2Username;
        state.statusMessage = `${winnerUsername || playerSymbol} Qazandı!`;
        // state.winningCombination artıq checkWinServer tərəfindən doldurulub
    } else if (!state.board.includes('')) { // Bərabərlik
        console.log(`[Game Logic 2.2] Oyun bitdi! Bərabərlik.`);
        state.isGameOver = true;
        state.winnerSymbol = 'draw';
        state.statusMessage = "Oyun Bərabərə!";
    } else {
        // Oyun davam edir, sıranı dəyiş
        switchTurnServer(room);
        const nextPlayerUsername = (state.currentPlayerSymbol === state.player1Symbol) ? state.player1Username : state.player2Username;
        state.statusMessage = `Sıra: ${nextPlayerUsername || state.currentPlayerSymbol}`;
    }

    return true; // Hərəkət uğurlu oldu
}

// =============================================================
// !!! XƏBƏRDARLIQ: generateWinConditions(size) funksiyası təyin edilməyib!
// Aşağıdakı checkWinServer funksiyası işləməyəcək.
// Siz bu funksiyanı əlavə etməlisiniz!
// =============================================================
function generateWinConditions(size){
    console.error("generateWinConditions funksiyası təyin edilməyib!");
    // Nümunə (yalnız 3x3 üçün, amma dinamik olmalıdır):
    if (size === 3) {
        return [
          [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
          [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
          [0, 4, 8], [2, 4, 6]             // Diagonals
        ];
    }
    // Digər ölçülər üçün də məntiqi əlavə etmək lazımdır!
    return []; // Boş massiv qaytarırıq ki, proqram çökəməsin
}


/**
* Server tərəfində qazanma vəziyyətini yoxlayır və gameState-i yeniləyir.
* @param {object} room - Otaq obyekti.
* @param {string} playerSymbolToCheck - Yoxlanılacaq simvol ('X' və ya 'O').
* @returns {boolean} - Qazanma varsa true, yoxsa false.
*/
function checkWinServer(room, playerSymbolToCheck) {
    if (!room || !room.gameState || !room.gameState.board) return false;
    const state = room.gameState;
    const board = state.board;
    const size = room.boardSize;
    state.winningCombination = []; // Əvvəlki nəticəni təmizlə

    const winConditions = generateWinConditions(size); // Bu funksiya təyin edilməlidir!

    if (winConditions.length === 0 && size > 0) {
         console.error(`[Game Logic 2.2] checkWinServer: ${size}x${size} üçün qazanma şərtləri yaradıla bilmədi!`);
         return false; // Qazanma şərtləri yoxdursa, yoxlamaq mümkün deyil
    }

    for (let i = 0; i < winConditions.length; i++) {
        const condition = winConditions[i];
        // Şərtin ilk xanasının yoxlanılacaq simvolla eyni olub olmadığını yoxla
        // Və xananın boş olmadığını yoxla (bu vacibdir!)
        if (board[condition[0]] !== playerSymbolToCheck || board[condition[0]] === '') continue;

        let allSame = true;
        for (let j = 1; j < condition.length; j++) {
            if (board[condition[j]] !== playerSymbolToCheck) {
                allSame = false;
                break;
            }
        }
        if (allSame) {
            state.winningCombination = condition; // Qazanan kombinasiyanı server state-inə yaz
            console.log(`[Game Logic 2.2] Qazanma kombinasiyası tapıldı: ${condition.join(',')}`);
            return true;
        }
    }
    return false;
}

/**
* Oyun sırasını server tərəfində dəyişir.
* @param {object} room - Otaq obyekti.
*/
function switchTurnServer(room) {
    if (!room || !room.gameState || room.gameState.isGameOver) return;
    const state = room.gameState;
    if (!state.player1Symbol || !state.player2Symbol) return; // Simvollar hələ təyin edilməyibsə çıx
    state.currentPlayerSymbol = (state.currentPlayerSymbol === state.player1Symbol) ? state.player2Symbol : state.player1Symbol;
    // console.log(`[Game Logic 2.2] Sıra dəyişdi: Yeni sıra ${state.currentPlayerSymbol}-dadır.`);
}

// ------------------------------------------------------------------------
// --- Part 2.3: Oyun Vəziyyətini Göndərmə Funksiyası ---
// ------------------------------------------------------------------------
/**
* Hazırkı oyun vəziyyətini otaqdakı bütün oyunçulara göndərir.
* @param {string} roomId - Otağın ID-si.
* @param {string} [triggeringEvent='N/A'] - Bu yeniləməyə səbəb olan hadisənin adı (loglama üçün).
*/
function emitGameStateUpdate(roomId, triggeringEvent = 'N/A') {
    const room = rooms[roomId];
    if (!room || !room.gameState) {
        console.error(`[State Emitter 2.3] emitGameStateUpdate: Otaq (${roomId}) və ya gameState tapılmadı! Trigger: ${triggeringEvent}`);
        return;
    }
    const stateToSend = room.gameState;
    console.log(`[State Emitter 2.3] Otağa (${roomId}) gameState göndərilir. Trigger: ${triggeringEvent}, Status: "${stateToSend.statusMessage}"`);
    // console.log(`[State Emitter 2.3] Göndərilən State:`, JSON.stringify(stateToSend)); // Detallı log
    io.to(roomId).emit('game_state_update', stateToSend); // Otaqdakı hər kəsə göndər
}


// --- Hissə 4 Sonu ---
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Düzəliş Edilmiş - AI Start + boardSize)
// ========================================================================

// ... (Hissə 1, 2, 3, və 4-dən kodlar buradadır) ...

// ------------------------------------------------------------------------
// --- Part 3.1: HTTP API Marşrutları (Register, Login) ---
// ------------------------------------------------------------------------
// Qeyd: İstifadəçi qeydiyyatı və girişi üçün endpointlər.

console.log('[Setup 3.1] API Endpointləri (Register, Login) təyin edilir...');

// ----- Qeydiyyat Endpoint-i (/register) -----
app.post('/register', async (req, res) => {
    // POST /register
    const { fullName, email, nickname, password } = req.body;
    console.log(`[API /register 3.1] Sorğu alındı: { nickname: '${nickname}', email: '${email}' }`);

    // Validasiyalar
    if (!fullName || !email || !nickname || !password) {
        console.warn('[API /register 3.1] Xəta: Bütün sahələr doldurulmayıb.');
        return res.status(400).json({ message: 'Bütün sahələr doldurulmalıdır.' });
    }
    if (password.length < 6) {
        console.warn(`[API /register 3.1] Xəta: Şifrə qısadır (nickname: ${nickname}).`);
        return res.status(400).json({ message: 'Şifrə minimum 6 simvol olmalıdır.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        console.warn(`[API /register 3.1] Xəta: Email formatı yanlış (email: ${email}).`);
        return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' });
    }
    if (/\s/.test(nickname)) {
        console.warn(`[API /register 3.1] Xəta: Nickname boşluqlu (nickname: ${nickname}).`);
        return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' });
    }
    if (fullName.length > 50 || nickname.length > 25) {
        console.warn(`[API /register 3.1] Xəta: Ad və ya Nickname çox uzundur.`);
        return res.status(400).json({ message: 'Ad (maks 50) və ya Nickname (maks 25) çox uzundur.' });
    }

    let client;
    try {
        client = await pool.connect();
        console.log('[API /register 3.1] DB bağlantısı alındı.');

        // Unikallıq yoxlaması
        const checkQuery = 'SELECT email, nickname FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2) LIMIT 1';
        const checkResult = await client.query(checkQuery, [email, nickname]);

        if (checkResult.rowCount > 0) {
            const existing = checkResult.rows[0];
            if (existing.email.toLowerCase() === email.toLowerCase()) {
                console.warn(`[API /register 3.1] Xəta: Email (${email}) artıq mövcuddur.`);
                return res.status(409).json({ message: 'Bu e-poçt artıq qeydiyyatdan keçib.' });
            } else {
                console.warn(`[API /register 3.1] Xəta: Nickname (${nickname}) artıq mövcuddur.`);
                return res.status(409).json({ message: 'Bu nickname artıq istifadə olunur.' });
            }
        }

        // Şifrəni hashla
        console.log(`[API /register 3.1] ${nickname} üçün şifrə hashlanır...`);
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // İstifadəçini DB-yə əlavə et
        const insertQuery = `INSERT INTO users (full_name, email, nickname, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nickname;`;
        const values = [fullName, email, nickname, hashedPassword];
        console.log(`[API /register 3.1] İstifadəçi DB-yə yazılır: ${nickname}`);
        const result = await client.query(insertQuery, values);

        console.log(`[API /register 3.1] UĞURLU: İstifadəçi yaradıldı:`, result.rows[0]);
        res.status(201).json({ message: 'Qeydiyyat uğurlu oldu!' });

    } catch (error) {
        console.error("[API /register 3.1] Qeydiyyat xətası:", error);
        if (error.code === '23505') { // PostgreSQL unique violation
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
            console.log('[API /register 3.1] DB bağlantısı buraxıldı.');
        }
    }
});


// ----- Giriş Endpoint-i (/login) -----
app.post('/login', async (req, res) => {
    const { nickname, password } = req.body;
    let client;
    console.log(`[API /login 3.1] Sorğu alındı: { nickname: '${nickname}' }`);
    if (!nickname || !password) {
        console.warn('[API /login 3.1] Xəta: Nickname/şifrə boş.');
        return res.status(400).json({ message: 'Nickname və şifrə daxil edilməlidir.' });
    }

    try {
        client = await pool.connect();
        console.log(`[API /login 3.1] DB bağlantısı alındı.`);

        // İstifadəçini tap
        const result = await client.query('SELECT id, nickname, email, full_name, password_hash FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);
        if (result.rowCount === 0) {
            console.warn(`[API /login 3.1] İstifadəçi tapılmadı: ${nickname}`);
            return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
        }
        const user = result.rows[0];
        console.log(`[API /login 3.1] İstifadəçi tapıldı: ${user.nickname} (ID: ${user.id})`);

        // Şifrəni yoxla
        console.log(`[API /login 3.1] ${user.nickname} üçün şifrə yoxlanılır...`);
        const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordCorrect) {
            console.warn(`[API /login 3.1] Şifrə yanlışdır: ${nickname}`);
            return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
        }
        console.log(`[API /login 3.1] Şifrə doğrudur: ${nickname}`);

        // Session regenerate
        const oldSessionID = req.sessionID;
        console.log(`[API /login 3.1] Session regenerate edilir... Köhnə ID=${oldSessionID}`);

        req.session.regenerate(regenerateErr => {
            if (regenerateErr) {
                console.error("[API /login 3.1] Session regenerate xətası:", regenerateErr);
                if (!res.headersSent) {
                   return res.status(500).json({ message: 'Session yaradılarkən xəta baş verdi (regenerate).' });
                }
                return console.error("[API /login 3.1] Regenerate xətası oldu amma cavab artıq göndərilmişdi.");
            }

            const newSessionID = req.sessionID;
            console.log(`[API /login 3.1] Yeni SessionID=${newSessionID}. User datası təyin edilir...`);

            // Session-a YALNIZ lazım olan məlumatları yaz
            req.session.user = {
                id: user.id,
                nickname: user.nickname,
                fullName: user.full_name,
                email: user.email
            };
            console.log(`[API /login 3.1] req.session.user təyin edildi:`, JSON.stringify(req.session.user));

            // Session-u DB-də yadda saxla
            req.session.save(saveErr => {
                if (saveErr) {
                    console.error("[API /login 3.1] Session save xətası:", saveErr);
                     if (!res.headersSent) {
                        return res.status(500).json({ message: 'Session yaradılarkən xəta baş verdi (save).' });
                     }
                     return console.error("[API /login 3.1] Save xətası oldu amma cavab artıq göndərilmişdi.");
                }

                // Uğurlu giriş cavabını göndər
                console.log(`[API /login 3.1] UĞURLU: Session saxlandı. User: ${req.session.user?.nickname}, SessionID: ${req.sessionID}`);
                 if (!res.headersSent) {
                    res.status(200).json({ message: 'Giriş uğurlu!', nickname: user.nickname });
                 } else {
                    console.warn("[API /login 3.1] Session save callback işlədi amma cavab artıq göndərilmişdi?");
                 }
            }); // req.session.save sonu
        }); // req.session.regenerate sonu

    } catch (error) {
        console.error("[API /login 3.1] Ümumi giriş xətası:", error);
         if (!res.headersSent) {
            res.status(500).json({ message: 'Server xətası baş verdi.' });
         }
    } finally {
        if (client) {
            client.release();
            console.log(`[API /login 3.1] DB bağlantısı buraxıldı.`);
        }
    }
});


// ------------------------------------------------------------------------
// --- Part 3.2: HTTP API Marşrutları (Logout, Check-Auth) ---
// ------------------------------------------------------------------------
// Qeyd: İstifadəçi çıxışı və autentifikasiya vəziyyətini yoxlama endpointləri.

console.log('[Setup 3.2] API Endpointləri (Logout, Check-Auth) təyin edilir...');

// ----- Çıxış Endpoint-i (/logout) -----
app.post('/logout', (req, res) => {
    if (req.session.user) {
      const nickname = req.session.user.nickname;
      const sessionID = req.sessionID;
      console.log(`[API /logout 3.2] Çıxış tələbi: ${nickname}, SessionID: ${sessionID}`);
      req.session.destroy(err => {
        if (err) {
          console.error("[API /logout 3.2] Session destroy xətası:", err);
          return res.status(500).json({ message: "Çıxış zamanı xəta baş verdi." });
        }
        res.clearCookie('connect.sid'); // Cookie adını yoxlayın! (Default ad)
        console.log(`[API /logout 3.2] İstifadəçi çıxdı: ${nickname}. Session ${sessionID} məhv edildi.`);
        res.status(200).json({ message: "Uğurla çıxış edildi." });
      });
    } else {
      console.log(`[API /logout 3.2] Çıxış tələbi, amma aktiv session yox idi.`);
      res.status(400).json({ message: "Giriş edilməyib." });
    }
});

// ----- Autentifikasiya Vəziyyətini Yoxlama Endpoint-i (/check-auth) -----
app.get('/check-auth', (req, res) => {
    // console.log(`[API /check-auth 3.2] Sorğu alındı - SessionID: ${req.sessionID}`);
    if (req.session && req.session.user && req.session.user.id) {
      // console.log(`[API /check-auth 3.2] Aktiv session tapıldı: User=${req.session.user.nickname}`);
      res.status(200).json({ loggedIn: true, user: req.session.user });
    } else {
      // console.log('[API /check-auth 3.2] Aktiv session tapılmadı.');
      res.status(401).json({ loggedIn: false, message: 'Sessiya tapılmadı və ya etibarsızdır.' });
    }
});

// ------------------------------------------------------------------------
// --- Part 3.3: HTTP API Marşrutları (Profile, Root) ---
// ------------------------------------------------------------------------
// Qeyd: Profil məlumatları və kök ('/') marşrutu.

console.log('[Setup 3.3] API Endpointləri (Profile, Root) təyin edilir...');

// ----- Profil Məlumatlarını Almaq Endpoint-i (/profile/:nickname) -----
app.get('/profile/:nickname', isAuthenticated, async (req, res) => {
    const requestedNickname = req.params.nickname;
    const loggedInNickname = req.session.user.nickname;
    const loggedInUserId = req.session.user.id;
    console.log(`[API /profile GET 3.3] Sorğu: ${requestedNickname}, Giriş edən: ${loggedInNickname}`);

    if (loggedInNickname.toLowerCase() !== requestedNickname.toLowerCase()) {
        console.warn(`[API /profile GET 3.3] İcazə xətası: ${loggedInNickname}, ${requestedNickname} profilinə baxmağa çalışdı.`);
        return res.status(403).json({ message: 'Başqasının profilinə baxmaq icazəsi yoxdur.' });
    }

    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT id, full_name, email, nickname FROM users WHERE id = $1', [loggedInUserId]);
        if (result.rowCount > 0) {
            console.log(`[API /profile GET 3.3] Profil məlumatları tapıldı: ${loggedInNickname}`);
            res.status(200).json(result.rows[0]);
        } else {
            console.error(`[API /profile GET 3.3] XƏTA: Authenticated user (ID: ${loggedInUserId}) DB-də tapılmadı!`);
            res.status(404).json({ message: 'İstifadəçi tapılmadı (DB-də). Gözlənilməz xəta.' });
        }
    } catch(error) {
        console.error("[API /profile GET 3.3] Profil alma xətası:", error);
        res.status(500).json({ message: 'Server xətası baş verdi.' });
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
    console.log(`[API /profile PUT 3.3] Sorğu: ${currentNicknameFromParam}, Giriş edən: ${loggedInNickname}, Yeni Data:`, {fullName, email, newNickname, password: password ? '***' : 'N/A'});

    if (loggedInNickname.toLowerCase() !== currentNicknameFromParam.toLowerCase()) {
        console.warn(`[API /profile PUT 3.3] İcazə xətası: ${loggedInNickname} ${currentNicknameFromParam} profilini dəyişməyə çalışdı.`);
        return res.status(403).json({ message: 'Başqasının profilini dəyişməyə icazə yoxdur.' });
    }

    // Validasiyalar
    if (!fullName || !email || !newNickname) { console.warn('[API /profile PUT 3.3] Xəta: Ad/Email/Nickname boş.'); return res.status(400).json({ message: 'Ad Soyad, E-poçt və Nickname boş ola bilməz.' }); }
    if (/\s/.test(newNickname)) { console.warn(`[API /profile PUT 3.3] Xəta: Yeni nickname boşluqlu (${newNickname}).`); return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.warn(`[API /profile PUT 3.3] Xəta: Yeni email formatı yanlış (${email}).`); return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
    if (password && password.length < 6) { console.warn(`[API /profile PUT 3.3] Xəta: Yeni şifrə qısadır.`); return res.status(400).json({ message: 'Yeni şifrə minimum 6 simvol olmalıdır.' }); }
    if (fullName.length > 50 || newNickname.length > 25) { console.warn(`[API /profile PUT 3.3] Xəta: Ad/Nickname uzundur.`); return res.status(400).json({ message: 'Ad (maks 50) və ya Nickname (maks 25) çox uzundur.' }); }

    let client;
    try {
        client = await pool.connect();
        console.log('[API /profile PUT 3.3] DB bağlantısı alındı.');

        // Unikallıq yoxlaması (yeni email/nickname üçün, özü xaric)
        const checkQuery = 'SELECT email, nickname FROM users WHERE (LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2)) AND id != $3 LIMIT 1';
        const checkResult = await client.query(checkQuery, [email, newNickname, loggedInUserId]);
        if (checkResult.rowCount > 0) {
            const existing = checkResult.rows[0];
            if (existing.email.toLowerCase() === email.toLowerCase()) {
                console.warn(`[API /profile PUT 3.3] Xəta: E-poçt (${email}) başqası tərəfindən istifadə edilir.`);
                return res.status(409).json({ message: 'Bu e-poçt artıq başqası tərəfindən istifadə olunur.' });
            } else {
                console.warn(`[API /profile PUT 3.3] Xəta: Nickname (${newNickname}) başqası tərəfindən istifadə edilir.`);
                return res.status(409).json({ message: 'Bu nickname artıq başqası tərəfindən istifadə olunur.' });
            }
        }

        // Update sorğusu
        let updateFields = ['full_name = $1', 'email = $2', 'nickname = $3'];
        let queryParams = [fullName, email, newNickname];
        let paramIndex = 4;

        if (password) {
            console.log('[API /profile PUT 3.3] Yeni şifrə hashlanır...');
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            updateFields.push(`password_hash = $${paramIndex}`);
            queryParams.push(hashedPassword);
            paramIndex++;
        }

        queryParams.push(loggedInUserId); // WHERE şərti üçün

        const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id, full_name, email, nickname;`;
        console.log('[API /profile PUT 3.3] Update sorğusu hazırlanır...');

        const result = await client.query(updateQuery, queryParams);

        if (result.rowCount === 0) {
            console.error(`[API /profile PUT 3.3] XƏTA: Yenilənəcək user (ID: ${loggedInUserId}) tapılmadı.`);
            return res.status(404).json({ message: 'Yenilənəcək istifadəçi tapılmadı.' });
        }
        const updatedUserDb = result.rows[0];
        console.log(`[API /profile PUT 3.3] Profil DB-də yeniləndi: ${updatedUserDb.nickname}`);

        // Sessionu yeni məlumatlarla yenilə
        console.log('[API /profile PUT 3.3] Session yenilənir...');
        req.session.user.nickname = updatedUserDb.nickname;
        req.session.user.fullName = updatedUserDb.full_name;
        req.session.user.email = updatedUserDb.email;

        req.session.save((saveErr) => {
            if (saveErr) {
                console.error("[API /profile PUT 3.3] Session save xətası (profil):", saveErr);
                return res.status(500).json({ message: 'Profil DB-də yeniləndi, lakin sessiya yenilənərkən xəta. Təkrar giriş edin.' });
            }
            console.log(`[API /profile PUT 3.3] UĞURLU: Profil və session yeniləndi: ${updatedUserDb.nickname}, SessionID: ${req.sessionID}`);
            const updatedUserForClient = {
                id: updatedUserDb.id, nickname: updatedUserDb.nickname,
                fullName: updatedUserDb.full_name, email: updatedUserDb.email
            };
            res.status(200).json({ message: 'Profil uğurla yeniləndi!', updatedUser: updatedUserForClient });
        }); // session.save sonu

    } catch (error) {
        console.error("[API /profile PUT 3.3] Profil yeniləmə xətası:", error);
        if (error.code === '23505') {
             if (error.constraint && error.constraint.includes('email')) { return res.status(409).json({ message: 'Bu e-poçt artıq başqası tərəfindən istifadə olunur (DB).' }); }
             if (error.constraint && error.constraint.includes('nickname')) { return res.status(409).json({ message: 'Bu nickname artıq başqası tərəfindən istifadə olunur (DB).' }); }
        }
        if (!res.headersSent) res.status(500).json({ message: 'Server xətası baş verdi.' });
    } finally {
        if (client) { client.release(); console.log('[API /profile PUT 3.3] DB bağlantısı buraxıldı.'); }
    }
});


// ----- Default Kök Route (/) -----
app.get('/', (req, res) => {
    console.log(`[API / 3.3] Kök route sorğusu. Session var: ${!!req.session?.user?.id}`);
    if (req.session && req.session.user && req.session.user.id) {
        console.log(`[API / 3.3] Yönləndirmə -> /OYUNLAR/oyunlar/oyunlar.html`);
        res.redirect('/OYUNLAR/oyunlar/oyunlar.html');
    } else {
        console.log(`[API / 3.3] Yönləndirmə -> /ANA SEHIFE/login/login.html`);
        res.redirect('/ANA SEHIFE/login/login.html');
    }
});

// ------------------------------------------------------------------------
// --- Hissə 5 Sonu ---
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Düzəliş Edilmiş - AI Start + boardSize)
// ========================================================================

// ... (Hissə 1, 2, 3, 4, və 5-dən kodlar buradadır) ...

// ------------------------------------------------------------------------
// --- Part 4.1: Socket.IO Middleware & Autentifikasiya ---
// ------------------------------------------------------------------------
// Qeyd: Socket.IO üçün Express session middleware-ni aktivləşdirmək və
// yalnız giriş etmiş istifadəçilərin bağlantısını qəbul etmək.

console.log('[Setup 4.1] Socket.IO üçün middleware konfiqurasiyası başlayır...');

// Socket.IO üçün Session Middleware-i istifadə etmək üçün yardımçı funksiya (wrapper)
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

// Session middleware-i Socket.IO üçün tətbiq et
io.use(wrap(sessionMiddleware));
console.log('[Setup 4.1] Socket.IO üçün session middleware (wrap ilə) tətbiq edildi.');

// Socket.IO bağlantılarını yalnız autentifikasiyadan keçmiş istifadəçilər üçün qəbul et
io.use((socket, next) => {
    const session = socket.request.session;
    if (session && session.user && session.user.nickname) {
        socket.user = { ...session.user }; // User məlumatını socket obyektinə kopyala
        console.log(`[Socket Auth 4.1] OK - Socket üçün user təyin edildi: ${socket.user.nickname} (Socket ID: ${socket.id}, SessionID: ${session.id})`);
        next(); // Bağlantıya icazə ver
    } else {
        console.warn(`[Socket Auth 4.1] FAILED - Giriş edilməmiş socket bağlantısı rədd edildi. SessionID: ${session?.id || 'N/A'}`);
        next(new Error('Authentication error: User not logged in or session expired.'));
    }
});
console.log('[Setup 4.1] Socket.IO üçün autentifikasiya middleware təyin edildi.');


// ------------------------------------------------------------------------
// --- Part 5.1: Socket.IO Bağlantı Handler-i & İlkin Addımlar ---
// ------------------------------------------------------------------------
// Qeyd: Yeni socket bağlantısı qəbul edildikdə işə düşən əsas handler.

console.log('[Setup 5.1] Socket.IO "connection" handler təyin edilir...');

io.on('connection', (socket) => {
    // Bu blok hər yeni uğurlu (autentifikasiyadan keçmiş) socket bağlantısı üçün işə düşür.
    const connectedUser = socket.user;
    console.log(`[Socket Connect 5.1] ++ İstifadəçi qoşuldu: ${connectedUser.nickname} (Socket ID: ${socket.id}, UserID: ${connectedUser.id})`);

    // İstifadəçini 'users' yaddaş obyektinə əlavə et
    users[socket.id] = {
        id: socket.id,
        userId: connectedUser.id,
        username: connectedUser.nickname,
        currentRoom: null
    };
    console.log(`[Socket Connect 5.1] İstifadəçi "${connectedUser.nickname}" qlobal 'users' obyektinə əlavə edildi.`);

    // Qoşulan istifadəçiyə (yalnız ona) otaq siyahısını göndər
    console.log(`[Socket Connect 5.1] İlkin otaq siyahısı ${connectedUser.nickname}-ə (${socket.id}) göndərilir...`);
    try {
        const initialRoomList = Object.values(rooms).map(room => {
             const player1Info = room.gameState?.player1SocketId ? (users[room.gameState.player1SocketId] /*|| { username: room.gameState.player1Username }*/) : null;
             const player2Info = room.gameState?.player2SocketId && room.gameState?.player2SocketId !== 'AI_SNOW' ? (users[room.gameState.player2SocketId] /*|| { username: room.gameState.player2Username }*/) : null;
             return {
                 id: room.id, name: room.name,
                 playerCount: (room.gameState?.player1SocketId ? 1 : 0) + (room.gameState?.player2SocketId ? 1 : 0),
                 hasPassword: !!room.password, boardSize: room.boardSize,
                 creatorUsername: room.creatorUsername,
                 player1Username: player1Info?.username || room.gameState?.player1Username || null,
                 player2Username: player2Info?.username || room.gameState?.player2Username || null,
                 isAiRoom: !!room.isAiRoom
             };
        });
        socket.emit('room_list_update', initialRoomList);
        console.log(`[Socket Connect 5.1] İlkin otaq siyahısı ${connectedUser.nickname}-ə göndərildi (${initialRoomList.length} otaq).`);
    } catch (listError) {
        console.error("[Socket Connect 5.1] İlkin otaq siyahısı göndərilərkən xəta:", listError);
        socket.emit('room_list_update', []);
    }

    // ======================================================
    // ===         HADİSƏ DİNLƏYİCİLƏRİ BAŞLAYIR         ===
    // ======================================================

    // --------------------------------------------------------------------
    // --- Part 5.2: 'create_room' Hadisə Handler-i ---
    // --------------------------------------------------------------------
    socket.on('create_room', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];

        if (!user || !currentUserSocketInfo) {
            console.error(`[Socket Event 5.2 - create_room] XƏTA: user (${user?.nickname}) və ya currentUserSocketInfo (${socket.id}) tapılmadı!`);
            return socket.emit('creation_error', 'Server xətası: İstifadəçi məlumatları tapılmadı. Təkrar giriş edin.');
        }
        console.log(`[Socket Event 5.2 - create_room] Hadisə alındı: User=${user.nickname}, Data=`, data);

        // Validasiyalar
        if (!data || !data.name || data.name.trim().length === 0 || data.name.length > 30) {
            console.warn(`[Socket Event 5.2 - create_room] XƏTA: Keçərsiz otaq adı. User=${user.nickname}`);
            return socket.emit('creation_error', 'Otaq adı boş və ya çox uzun (maks 30) ola bilməz.');
        }
        if (data.password && data.password.length > 0 && (data.password.length < 2 || !(/[a-zA-Z]/.test(data.password) && /\d/.test(data.password)))) {
             console.warn(`[Socket Event 5.2 - create_room] XƏTA: Keçərsiz şifrə formatı. User=${user.nickname}`);
             return socket.emit('creation_error', 'Şifrə tələblərə uyğun deyil (min 2 simvol, 1 hərf + 1 rəqəm).');
        }
        if (currentUserSocketInfo.currentRoom) {
            console.warn(`[Socket Event 5.2 - create_room] XƏTA: İstifadəçi (${user.nickname}) artıq ${currentUserSocketInfo.currentRoom} otağındadır.`);
            return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız.');
        }
        const currentRoomCount = Object.keys(rooms).length;
        const MAX_ROOMS = 50;
        if (currentRoomCount >= MAX_ROOMS) {
            console.warn(`[Socket Event 5.2 - create_room] XƏTA: Maksimum otaq sayına (${MAX_ROOMS}) çatılıb.`);
            return socket.emit('creation_error', `Serverdə maksimum otaq sayına (${MAX_ROOMS}) çatılıb.`);
        }

        // Yeni Otağın Yaradılması
        const newRoomId = generateRoomId();
        const boardSize = parseInt(data.boardSize, 10) || 3;
        const validatedBoardSize = Math.max(3, Math.min(6, boardSize));

        const newRoom = {
          id: newRoomId,
          name: data.name.trim().slice(0, 30),
          password: data.password || null,
          players: [socket.id], // Yaradan ilk oyunçudur
          boardSize: validatedBoardSize,
          creatorUsername: user.nickname,
          gameState: null, // Oyun başlayanda yaradılacaq
          isAiRoom: false,
          deleteTimeout: null
        };

        rooms[newRoomId] = newRoom;
        console.log(`[State 5.2] Yeni otaq yaradıldı: ID=${newRoomId}, Adı=${newRoom.name}`);

        currentUserSocketInfo.currentRoom = newRoomId;
        console.log(`[State 5.2] İstifadəçi (${user.nickname}) üçün currentRoom təyin edildi: ${newRoomId}`);

        socket.join(newRoomId);
        console.log(`[Socket IO 5.2] Socket (${socket.id}) ${newRoomId} rumuna qoşuldu.`);

        broadcastRoomList();
        console.log(`[Socket Event 5.2 - create_room] Otaq yaradıldı, siyahı yayımlandı.`);

        socket.emit('room_joined', {
            roomId: newRoom.id,
            roomName: newRoom.name,
            boardSize: newRoom.boardSize
        });
        console.log(`[Socket Event 5.2 - create_room] 'room_joined' yaradan clientə (${socket.id}) göndərildi.`);

    }); // socket.on('create_room', ...) sonu


    // --------------------------------------------------------------------
    // --- Part 5.3: 'join_room' Hadisə Handler-i (Yenidən İşlənmiş) ---
    // --------------------------------------------------------------------
    socket.on('join_room', async (data) => { // Şifrə üçün async qaldı
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        console.log(`[Socket Event 5.3 - join_room] Hadisə alındı: User=${user?.nickname}, Data=`, data);

        if(!user || !currentUserSocketInfo) {
            console.error(`[Socket Event 5.3 - join_room] XƏTA: user (${user?.nickname}) və ya currentUserSocketInfo (${socket.id}) tapılmadı!`);
            return socket.emit('join_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.');
        }
        if (!data || !data.roomId) {
            console.warn(`[Socket Event 5.3 - join_room] XƏTA: Otaq ID göndərilmədi. User=${user.nickname}`);
            return socket.emit('join_error', 'Otaq ID göndərilmədi.');
        }

        const roomId = data.roomId;
        const room = rooms[roomId];

        // İlkin Yoxlamalar
        if (!room) {
            console.warn(`[Socket Event 5.3 - join_room] XƏTA: Otaq tapılmadı (${roomId}). User=${user.nickname}`);
            return socket.emit('join_error', 'Otaq tapılmadı.');
        }
        if (room.isAiRoom) {
            console.warn(`[Socket Event 5.3 - join_room] XƏTA: AI otağına qoşulma cəhdi. User=${user.nickname}`);
            return socket.emit('join_error', 'AI otağına bu şəkildə qoşulmaq olmaz.');
        }

        // Şifrə Yoxlaması
        if (room.password) {
            if (!data.password) {
                console.warn(`[Socket Event 5.3 - join_room] XƏTA: Şifrə tələb olunur. Room=${roomId}, User=${user.nickname}`);
                return socket.emit('join_error', 'Bu otaq şifrəlidir. Şifrəni daxil edin.');
            }
            // const isPasswordCorrect = await bcrypt.compare(data.password, room.password); // Əgər hash olsaydı
            if (room.password !== data.password) { // Düz müqayisə
                 console.warn(`[Socket Event 5.3 - join_room] XƏTA: Yanlış şifrə. Room=${roomId}, User=${user.nickname}`);
                 return socket.emit('join_error', 'Şifrə yanlışdır.');
            }
            console.log(`[Socket Event 5.3 - join_room] Şifrəli otaq (${roomId}) üçün şifrə doğrudur.`);
        }

        // Qoşulma Məntiqi
        try {
            if (currentUserSocketInfo.currentRoom && currentUserSocketInfo.currentRoom !== roomId) {
                console.warn(`[Socket Event 5.3 - join_room] XƏTA: İstifadəçi (${user.nickname}) artıq ${currentUserSocketInfo.currentRoom} otağındadır.`);
                return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.');
            }

            // Otağın dolu olub olmadığını yoxla (players massivinə görə)
            if (room.players.length >= 2) {
                 // Yenidən qoşulma halını burada yoxlamaq əvəzinə, player_ready-də edirik.
                 // Əgər oyunçu players massivində yoxdursa və otaq doludursa, qoşulmağa icazə vermə.
                 if (!room.players.includes(socket.id)) {
                     console.warn(`[Socket Event 5.3 - join_room] XƏTA: Otaq (${roomId}) doludur. User=${user.nickname}`);
                     return socket.emit('join_error', 'Otaq doludur.');
                 } else {
                     // Oyunçu artıq otaqdadır (bəlkə refresh edib), davam etsin player_ready-ə
                      console.log(`[Socket Event 5.3 - join_room] İstifadəçi (${user.nickname}) artıq ${roomId} otağındadır (ehtimalən refresh). player_ready gözlənilir.`);
                 }
            }

            // Socket.IO otağına qoş
            socket.join(roomId);
            currentUserSocketInfo.currentRoom = roomId;
            console.log(`[Socket IO 5.3] Socket (${socket.id}) ${roomId} rumuna qoşuldu.`);

            // Otağın silinmə timeout-unu ləğv et
            if (room.deleteTimeout) {
                clearTimeout(room.deleteTimeout);
                delete room.deleteTimeout;
                console.log(`[Socket Event 5.3 - join_room] Otaq ${roomId} üçün planlanmış silmə ləğv edildi.`);
            }

            // Oyunçunu otağın 'players' massivinə əlavə et (əgər artıq yoxdursa)
            if (!room.players.includes(socket.id)) {
                room.players.push(socket.id);
                console.log(`[State 5.3] Oyunçu ${socket.id} (${user.nickname}) otağın (${roomId}) players massivinə əlavə edildi. Oyunçu sayı: ${room.players.length}`);

                 // İkinci oyunçu qoşulduqda oyunu başlat
                 if (room.players.length === 2) {
                     console.log(`[Socket Event 5.3 - join_room] Otaq ${roomId} doldu. Oyun vəziyyəti yaradılır...`);
                     const player1SocketId = room.players[0];
                     const player2SocketId = room.players[1];
                     initializeGameState(room, player1SocketId, player2SocketId); // gameState yaradılır, status "Zər Atılır..."

                     // Yenilənmiş gameState-i hər iki oyunçuya göndər
                     emitGameStateUpdate(roomId, 'second_player_joined');
                 }
                 broadcastRoomList(); // Otaq siyahısını yenilə
            }

            // Client tərəfə otağa uğurla qoşulduğunu bildir
            // Client bu hadisəni alıb oyun səhifəsinə keçəcək
            socket.emit('room_joined', {
                roomId: room.id,
                roomName: room.name,
                boardSize: room.boardSize
            });
            console.log(`[Socket Event 5.3 - join_room] 'room_joined' hadisəsi ${user.nickname}-ə göndərildi.`);

        } catch (error) {
            console.error(`[Socket Event 5.3 - join_room] Qoşulma zamanı ümumi xəta. Room=${roomId}, User=${user?.nickname}:`, error);
            if (!socket.disconnected) {
                socket.emit('join_error', 'Otağa qoşularkən daxili server xətası baş verdi.');
                socket.leave(roomId);
                if(currentUserSocketInfo) currentUserSocketInfo.currentRoom = null;
            }
        } // catch bloku bitdi
    }); // socket.on('join_room', ...) sonu


    // --- Part 6 Sonu (io.on('connection') bloku hələ bağlanmayıb!) ---
    // ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Düzəliş Edilmiş - AI Start + boardSize)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

io.on('connection', (socket) => {
    // ... (Part 5.1, 5.2, 5.3-dən kodlar buradadır) ...

    // --------------------------------------------------------------------
    // --- Part 5.4: 'player_ready_in_room' Hadisə Handler-i (DÜZƏLİŞ EDİLMİŞ) ---
    // --------------------------------------------------------------------
    socket.on('player_ready_in_room', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        console.log(`[Socket Event 5.4 - player_ready] Hadisə alındı: User=${user?.nickname}, Data=`, data);

        if (!user || !currentUserSocketInfo) {
            console.error(`[Socket Event 5.4 - player_ready] XƏTA: user (${user?.nickname}) və ya currentUserSocketInfo (${socket.id}) tapılmadı!`);
            return socket.emit('game_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.');
        }
        if (!data || !data.roomId) {
            console.warn(`[Socket Event 5.4 - player_ready] XƏTA: Otaq ID göndərilmədi. User=${user.nickname}`);
            return socket.emit('game_error', 'Otaq ID göndərilmədi.');
        }

        const roomId = data.roomId;
        const room = rooms[roomId];

        if (!room) {
            console.warn(`[Socket Event 5.4 - player_ready] XƏTA: Otaq tapılmadı (${roomId}). User=${user.nickname}. Lobiyə yönləndirilir.`);
            return socket.emit('force_redirect_lobby', { message: "Daxil olmaq istədiyiniz otaq artıq mövcud deyil." });
        }

        // ----- Otağa Qoşulma və State İdarəetməsi (Həm AI, həm Real) -----
        try {
            // Socket-i Socket.IO otağına qoş
            if (!socket.rooms.has(roomId)) {
                socket.join(roomId);
                console.log(`[Socket IO 5.4] Socket (${socket.id}) ${roomId} rumuna qoşuldu (və ya təkrar qoşuldu).`);
            }
            // İstifadəçinin cari otağını yenilə
            if (!currentUserSocketInfo.currentRoom) {
                currentUserSocketInfo.currentRoom = roomId;
                console.log(`[State 5.4] İstifadəçi (${user.nickname}) üçün currentRoom təyin edildi: ${roomId}`);
            }

            let gameState = room.gameState;
            let isReconnecting = false;
            let playerSlotReconnecting = null;

            // --- Yenidən Qoşulma Halını Yoxla (Real Otaqlar Üçün) ---
            if (gameState && !room.isAiRoom) {
                if (gameState.player1UserId === user.userId && gameState.player1SocketId !== socket.id) playerSlotReconnecting = 1;
                else if (gameState.player2UserId === user.userId && gameState.player2SocketId !== socket.id) playerSlotReconnecting = 2;

                if (playerSlotReconnecting) {
                    isReconnecting = true;
                    console.log(`[Socket Event 5.4 - player_ready] İstifadəçi ${user.nickname} Player ${playerSlotReconnecting} olaraq yenidən qoşulur.`);
                    const oldSocketId = gameState[`player${playerSlotReconnecting}SocketId`];
                    gameState[`player${playerSlotReconnecting}SocketId`] = socket.id;
                    const playerIndex = room.players.indexOf(oldSocketId);
                    if (playerIndex > -1) { room.players.splice(playerIndex, 1, socket.id); }
                    else if (!room.players.includes(socket.id)) { room.players.push(socket.id); }
                    console.log(`[State 5.4] Otağın (${roomId}) players massivi yenidən qoşulma üçün yeniləndi: ${room.players.join(', ')}`);
                }
            }

            // --- Yeni Oyun Başlatma və ya Mövcud State Göndərmə ---
            if (!gameState && !isReconnecting) {
                console.log(`[Socket Event 5.4 - player_ready] ${roomId} üçün yeni gameState yaradılır...`);
                initializeGameState(room, socket.id, null); // İlk oyunçunu əlavə edir, state yaradır
                gameState = room.gameState; // Yaradılmış state-i al

                if (room.isAiRoom) {
                    console.log(`[Socket Event 5.4 - player_ready] AI otağı üçün AI oyunçusu əlavə edilir...`);
                    // addAiPlayerToGame(gameState, room); // Bu funksiya təyin edilməlidir
                    // --- Sadə AI Əlavə Etmə Məntiqi (placeholder) ---
                    if (gameState && !gameState.player2SocketId) {
                        gameState.player2SocketId = 'AI_SNOW';
                        gameState.player2Username = 'SNOW';
                        gameState.player2UserId = 'AI_SNOW';
                        // Simvolları və sıranı təyin et
                        gameState.player1Symbol = 'X';
                        gameState.player2Symbol = 'O';
                        gameState.currentPlayerSymbol = 'X'; // İnsan başlasın
                        gameState.statusMessage = `Sıra: ${gameState.player1Username || 'Siz'}`;
                        gameState.isGameOver = false; // Oyunu başladaq
                        console.log(`[State 5.4] AI oyunu üçün ilkin simvollar və sıra təyin edildi.`);
                    }
                    // --- Placeholder Sonu ---
                } else {
                    // Real multiplayer, ikinci oyunçu gözlənilir
                     gameState.statusMessage = "Rəqib gözlənilir...";
                }
            }

            // --- Son Vəziyyəti Göndər ---
            if (gameState) {
                console.log(`[Socket IO 5.4] Oyun vəziyyəti (${roomId}) ${user.nickname}-ə (${socket.id}) göndərilir.`);
                emitGameStateUpdate(roomId, 'player_ready');
            } else {
                console.error(`[Socket Event 5.4 - player_ready] XƏTA: GameState yaradıla bilmədi və ya tapılmadı! Room=${roomId}`);
                socket.emit('game_error', 'Oyun vəziyyəti yaradıla bilmədi.');
            }

            // Otaq məlumatlarını göndərməyə ehtiyac yoxdur (əvvəlki xətanı aradan qaldırmaq üçün silindi)
            // try { /* ... getRoomInfoForClient ... */ } catch (infoError) { /* ... */ }

            // Otaq siyahısını yenilə (əgər adlar/oyunçu sayı dəyişibsə)
            if(isReconnecting) {
                broadcastRoomList();
            }

        } catch (error) {
            console.error(`[Socket Event 5.4 - player_ready] Hazır statusu emal edilərkən xəta. Room=${roomId}, User=${user?.nickname}:`, error);
            if (!socket.disconnected) {
                socket.emit('game_error', 'Oyun vəziyyəti alınarkən server xətası baş verdi.');
            }
        }
    }); // socket.on('player_ready_in_room', ...) sonu


    // --------------------------------------------------------------------
    // --- Part 5.5: Otaqdan Ayrılma / Silmə / Kick Hadisələri ---
    // --------------------------------------------------------------------
    socket.on('leave_room', () => {
        const user = socket.user;
        console.log(`[Socket Event 5.5 - leave_room] Hadisə alındı: User=${user?.nickname} (${socket.id})`);
        handleDisconnectOrLeave(socket);
    });

    socket.on('delete_room', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        console.log(`[Socket Event 5.5 - delete_room] Hadisə alındı: User=${user?.nickname}, Data=`, data);

        if (!user || !currentUserSocketInfo) { /* ... error handling ... */ return socket.emit('delete_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.');}
        if (!data || !data.roomId) { /* ... error handling ... */ return socket.emit('delete_error', 'Otaq ID göndərilmədi.'); }

        const roomId = data.roomId;
        const room = rooms[roomId];

        if (!room) { /* ... error handling ... */ return socket.emit('delete_error', 'Silinəcək otaq tapılmadı.'); }
        if (room.isAiRoom) { /* ... error handling ... */ return socket.emit('delete_error', 'AI otaqları silinə bilməz.'); }
        if (room.creatorUsername !== user.nickname) { /* ... error handling ... */ return socket.emit('delete_error', 'Yalnız otağı yaradan onu silə bilər.'); }

        console.log(`[State 5.5] Otaq ${roomId} ('${room.name}') ${user.nickname} tərəfindən silinir.`);

        const playersToNotify = [...room.players];
        playersToNotify.forEach(playerId => {
            const playerSocket = io.sockets.sockets.get(playerId);
            if (playerSocket) {
                if (playerId !== socket.id) {
                     console.log(`[Socket IO 5.5] Oyunçuya (${users[playerId]?.username}) otağın silindiyi bildirilir...`);
                     playerSocket.emit('room_deleted_kick', { message: `'${room.name}' otağı yaradan tərəfindən silindi.` });
                }
                playerSocket.leave(roomId);
            }
            if (users[playerId]) { users[playerId].currentRoom = null; }
        });

        delete rooms[roomId];
        if (room.deleteTimeout) { clearTimeout(room.deleteTimeout); }

        broadcastRoomList();
        console.log(`[State 5.5] Otaq ${roomId} silindi və siyahı yayımlandı.`);
    });

    socket.on('kick_opponent', (data) => {
        const user = socket.user; // Kənaraşdıran
        const currentUserSocketInfo = users[socket.id];
        console.log(`[Socket Event 5.5 - kick_opponent] Hadisə alındı: User=${user?.nickname}, Data=`, data);

        if (!user || !currentUserSocketInfo) { /* ... error handling ... */ return socket.emit('kick_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.'); }
        if (!data || !data.roomId) { /* ... error handling ... */ return socket.emit('kick_error', 'Otaq ID göndərilmədi.'); }

        const roomId = data.roomId;
        const room = rooms[roomId];

        if (!room) { /* ... error handling ... */ return socket.emit('kick_error', 'Otaq tapılmadı.'); }
        if (room.isAiRoom) { /* ... error handling ... */ return socket.emit('kick_error', 'AI otağından rəqib çıxarmaq olmaz.'); }
        if (room.creatorUsername !== user.nickname) { /* ... error handling ... */ return socket.emit('kick_error', 'Yalnız otağı yaradan rəqibi çıxara bilər.'); }

        const opponentSocketId = room.players.find(pId => pId !== socket.id);
        if (!opponentSocketId) { /* ... error handling ... */ return socket.emit('kick_error', 'Rəqib artıq otaqda deyil.'); }

        const opponentSocket = io.sockets.sockets.get(opponentSocketId);
        const opponentUserInfo = users[opponentSocketId];
        console.log(`[State 5.5] Rəqib ${opponentUserInfo?.username} (${opponentSocketId}) ${user.nickname} tərəfindən otaqdan (${roomId}) çıxarılır.`);

        if (opponentSocket) {
            console.log(`[Socket IO 5.5] Rəqibə (${opponentSocketId}) kick mesajı göndərilir.`);
            opponentSocket.emit('room_deleted_kick', { message: "Otaq yaradan tərəfindən çıxarıldınız." });
            opponentSocket.leave(roomId);
        }

         if (opponentUserInfo) {
              handleDisconnectOrLeave({ id: opponentSocketId, user: opponentUserInfo });
         } else {
             // Manual təmizləmə (əgər user yoxdursa)
             const playerIndex = room.players.indexOf(opponentSocketId);
             if (playerIndex > -1) room.players.splice(playerIndex, 1);
             if (room.gameState) {
                 if (room.gameState.player1SocketId === opponentSocketId) room.gameState.player1SocketId = null;
                 if (room.gameState.player2SocketId === opponentSocketId) room.gameState.player2SocketId = null;
                 room.gameState.isGameOver = true;
                 room.gameState.statusMessage = "Rəqib çıxarıldı.";
                 emitGameStateUpdate(roomId, 'opponent_kicked');
             }
             broadcastRoomList();
         }
        console.log(`[State 5.5] Rəqib (${opponentSocketId}) üçün təmizləmə prosesi başa çatdı.`);
    });

    // --------------------------------------------------------------------
    // --- Part 5.6: 'make_move' Hadisə Handler-i ---
    // --------------------------------------------------------------------
    socket.on('make_move', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;

        // console.log(`[Socket Event 5.6 - make_move] Hadisə alındı: User=${user?.nickname}, Room=${roomId}, Data=`, data);

        if (!user || !currentUserSocketInfo || !roomId || !rooms[roomId] || !rooms[roomId].gameState || rooms[roomId].gameState.isGameOver) {
            return socket.emit('game_error', 'Hərəkət etmək üçün uyğun vəziyyət deyil.');
        }
        if (data === null || typeof data.index !== 'number') {
            return socket.emit('game_error', 'Keçərsiz hərəkət məlumatı.');
        }

        const moveResult = handleMakeMoveServer(roomId, socket.id, data.index);

        if (moveResult) {
            // console.log(`[Socket IO 5.6 - make_move] Hərəkət uğurlu. Yenilənmiş gameState (${roomId}) göndərilir.`);
            emitGameStateUpdate(roomId, 'make_move');
        } else {
            console.warn(`[Socket Event 5.6 - make_move] Server tərəfi hərəkəti qəbul etmədi.`);
            socket.emit('invalid_move', { message: 'Keçərsiz hərəkət!' });
        }
    });

    // --------------------------------------------------------------------
    // --- Part 5.7: 'dice_roll_result' Hadisə Handler-i ---
    // --------------------------------------------------------------------
    socket.on('dice_roll_result', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;

        // console.log(`[Socket Event 5.7 - dice_roll] Hadisə alındı: User=${user?.nickname}, Room=${roomId}, Data=`, data);

        if (!user || !currentUserSocketInfo || !roomId || !rooms[roomId] || !rooms[roomId].gameState || rooms[roomId].gameState.isGameOver || rooms[roomId].gameState.currentPlayerSymbol !== null) {
            return socket.emit('game_error', 'Hazırda zər atmaq mümkün deyil.');
        }
        if (!data || typeof data.roll !== 'number' || data.roll < 1 || data.roll > 6) {
            return socket.emit('game_error', 'Keçərsiz zər nəticəsi göndərildi.');
        }

        const state = rooms[roomId].gameState;
        const playerRoll = data.roll;

        // Nəticəni gameState-də Saxla
        let playerRollField = null;
        if (socket.id === state.player1SocketId) {
            if (state.player1Roll !== null && !state.statusMessage.includes("Bərabərlik")) { console.warn(`Player 1 artıq zər atmışdı.`); return; }
            state.player1Roll = playerRoll;
            playerRollField = 'player1Roll';
        } else if (socket.id === state.player2SocketId) {
            if (state.player2Roll !== null && !state.statusMessage.includes("Bərabərlik")) { console.warn(`Player 2 artıq zər atmışdı.`); return; }
            state.player2Roll = playerRoll;
            playerRollField = 'player2Roll';
        } else {
            return socket.emit('game_error', 'Siz bu otağın oyunçusu deyilsiniz.');
        }
        console.log(`[State 5.7] ${playerRollField} (${user.nickname}) zər nəticəsi (${playerRoll}) saxlandı. Room=${roomId}`);

        // Hər İki Oyunçu Zər Atıbsa, Qalibi Təyin Et
        if (state.player1Roll !== null && state.player2Roll !== null) {
            console.log(`[Game Logic 5.7] Hər iki oyunçu zər atdı: P1=${state.player1Roll}, P2=${state.player2Roll}. Room=${roomId}`);
            if (state.player1Roll > state.player2Roll) {
                state.diceWinnerSocketId = state.player1SocketId;
                state.symbolPickerSocketId = state.player1SocketId;
                state.statusMessage = `${state.player1Username || 'Oyunçu 1'} yüksək atdı! Simvol seçir...`;
            } else if (state.player2Roll > state.player1Roll) {
                state.diceWinnerSocketId = state.player2SocketId;
                state.symbolPickerSocketId = state.player2SocketId;
                state.statusMessage = `${state.player2Username || 'Oyunçu 2'} yüksək atdı! Simvol seçir...`;
            } else { // Bərabərlik
                state.diceWinnerSocketId = null;
                state.symbolPickerSocketId = null;
                state.player1Roll = null; state.player2Roll = null; // Sıfırla
                state.statusMessage = "Bərabərlik! Zərlər təkrar atılır...";
            }
            emitGameStateUpdate(roomId, 'dice_results_processed');
        } else {
            // İkinci oyunçu gözlənilir
            const waitingForPlayer = (playerRollField === 'player1Roll') ? (state.player2Username || 'Oyunçu 2') : (state.player1Username || 'Oyunçu 1');
            state.statusMessage = `${waitingForPlayer}-in zər atması gözlənilir...`;
            emitGameStateUpdate(roomId, 'one_dice_result_received');
        }
    });

    // --------------------------------------------------------------------
    // --- Part 5.8: 'symbol_choice' Hadisə Handler-i ---
    // --------------------------------------------------------------------
    socket.on('symbol_choice', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;

        // console.log(`[Socket Event 5.8 - symbol_choice] Hadisə alındı: User=${user?.nickname}, Room=${roomId}, Data=`, data);

        if (!user || !currentUserSocketInfo || !roomId || !rooms[roomId] || !rooms[roomId].gameState || rooms[roomId].gameState.isGameOver || rooms[roomId].gameState.player1Symbol !== null) {
            return socket.emit('game_error', 'Simvol seçimi üçün uyğun vəziyyət deyil.');
        }
        if (socket.id !== rooms[roomId].gameState.symbolPickerSocketId) {
            return socket.emit('game_error', 'Simvol seçmə növbəsi sizdə deyil.');
        }
        if (!data || (data.symbol !== 'X' && data.symbol !== 'O')) {
            return socket.emit('game_error', 'Keçərsiz simvol seçimi göndərildi.');
        }

        // Simvolları və İlk Sıranı Təyin Et
        const state = rooms[roomId].gameState;
        const chosenSymbol = data.symbol;
        const opponentSymbol = (chosenSymbol === 'X') ? 'O' : 'X';

        if (socket.id === state.player1SocketId) {
            state.player1Symbol = chosenSymbol; state.player2Symbol = opponentSymbol;
        } else {
            state.player2Symbol = chosenSymbol; state.player1Symbol = opponentSymbol;
        }
        state.currentPlayerSymbol = chosenSymbol; // Seçən başlayır
        state.symbolPickerSocketId = null;
        state.isGameOver = false; // Oyun başladı
        const currentPlayerUsername = (state.currentPlayerSymbol === state.player1Symbol) ? state.player1Username : state.player2Username;
        state.statusMessage = `Sıra: ${currentPlayerUsername || state.currentPlayerSymbol}`;
        state.lastMoveTime = Date.now();

        console.log(`[Socket IO 5.8 - symbol_choice] Simvol seçildi. Oyun başlayır! Yenilənmiş gameState (${roomId}) göndərilir.`);
        emitGameStateUpdate(roomId, 'symbol_chosen_game_started');
    });

    // --------------------------------------------------------------------
    // --- Part 5.9: Yenidən Başlatma Hadisə Handler-ları ---
    // --------------------------------------------------------------------
    socket.on('request_restart', () => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;
        // console.log(`[Socket Event 5.9 - request_restart] Hadisə alındı: User=${user?.nickname}, Room=${roomId}`);

        if (!user || !currentUserSocketInfo || !roomId || !rooms[roomId] || !rooms[roomId].gameState || !rooms[roomId].gameState.isGameOver || rooms[roomId].players.length < 2) {
            return socket.emit('game_error', 'Yenidən başlatma təklifi üçün uyğun deyil.');
        }

        const room = rooms[roomId];
        // Təklif artıq varsa, heç nə etmə
        if (room.gameState.statusMessage?.includes("təklif")) return;

        const opponentSocketId = room.players.find(pId => pId !== socket.id);
        if (opponentSocketId && io.sockets.sockets.get(opponentSocketId)) {
            console.log(`[Socket IO 5.9] Restart təklifi ${user.nickname}-dən ${users[opponentSocketId]?.username}-ə göndərilir.`);
            io.to(opponentSocketId).emit('restart_requested', { username: user.nickname });
            socket.emit('info_message', {message:'Yenidən başlatma təklifi rəqibə göndərildi.'});
            room.gameState.statusMessage = `${user.nickname} yenidən başlatmağı təklif etdi...`;
            emitGameStateUpdate(roomId, 'restart_requested');
        } else {
            socket.emit('game_error', 'Rəqib tapılmadı və ya artıq otaqda deyil.');
        }
    });

    socket.on('accept_restart', () => {
        const user = socket.user; // Qəbul edən
        const currentUserSocketInfo = users[socket.id];
        const roomId = currentUserSocketInfo?.currentRoom;
        // console.log(`[Socket Event 5.9 - accept_restart] Hadisə alındı: User=${user?.nickname}, Room=${roomId}`);

        if (!user || !currentUserSocketInfo || !roomId || !rooms[roomId] || !rooms[roomId].gameState || rooms[roomId].players.length < 2) {
             return socket.emit('game_error', 'Yenidən başlatmanı qəbul etmək üçün uyğun deyil.');
        }
        // Yalnız təklif statusunda isə davam et
        if (!rooms[roomId].gameState.statusMessage?.includes("təklif")) {
             return socket.emit('game_error', 'Aktiv yenidən başlatma təklifi yoxdur.');
        }

        console.log(`[Game Logic 5.9] Restart təklifi qəbul edildi (${user.nickname}). Oyun (${roomId}) sıfırlanır...`);
        const room = rooms[roomId];
        const p1Id = room.gameState.player1SocketId;
        const p2Id = room.gameState.player2SocketId;
        initializeGameState(room, p1Id, p2Id); // Oyunu sıfırla, status "Zər Atılır..." olacaq

        console.log(`[Socket IO 5.9 - accept_restart] Oyun sıfırlandı. Yenilənmiş gameState (${roomId}) göndərilir.`);
        emitGameStateUpdate(roomId, 'restart_accepted');
    });


    // --------------------------------------------------------------------
    // --- Part 5.10: 'disconnect' Hadisəsi & Təmizləmə Funksiyası ---
    // --------------------------------------------------------------------
    socket.on('disconnect', (reason) => {
        const userInfo = users[socket.id];
        console.log(`[Socket Disconnect 5.10] İstifadəçi ayrıldı: ${userInfo?.username || socket.id}. Səbəb: ${reason}`);
        handleDisconnectOrLeave(socket);
    });

    function handleDisconnectOrLeave(socketInstance) {
        const socketId = socketInstance.id;
        if (!users[socketId]) {
             // console.warn(`[handleDisconnectOrLeave 5.10] User ${socketId} artıq emal edilib/tapılmadı.`);
             return;
        }

        const leavingUserInfo = { ...users[socketId] }; // Kopyasını alaq
        const username = leavingUserInfo.username;
        const roomId = leavingUserInfo.currentRoom;

        console.log(`[handleDisconnectOrLeave 5.10] Emal edilir: User=${username} (${socketId}), Room=${roomId || 'Yoxdur'}`);

        // İstifadəçini Qlobal `users` Obyektindən Sil
        delete users[socketId];
        console.log(`[handleDisconnectOrLeave 5.10] İstifadəçi ${username} (${socketId}) 'users' obyektindən silindi.`);

        // İstifadəçini Otaqdan Sil (Əgər Bir Otaqdadırsa)
        let roomExistedAndPlayerRemoved = false;
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            const playerIndex = room.players.indexOf(socketId);

            if (playerIndex > -1) {
                roomExistedAndPlayerRemoved = true;
                room.players.splice(playerIndex, 1);
                console.log(`[handleDisconnectOrLeave 5.10] ${username} otaqdan (${roomId}) silindi. Qalan oyunçu sayı: ${room.players.length}`);

                // Oyun Vəziyyətini Yenilə
                if (room.gameState && !room.gameState.isGameOver) {
                    if (room.players.length < 2) { // Rəqib ayrıldı
                        console.log(`[handleDisconnectOrLeave 5.10] Rəqib ayrıldığı üçün oyun (${roomId}) bitirilir.`);
                        room.gameState.isGameOver = true;
                        room.gameState.statusMessage = `${username} oyundan ayrıldı.`;
                        // Socket ID-ni null et
                         if (room.gameState.player1SocketId === socketId) room.gameState.player1SocketId = null;
                         if (room.gameState.player2SocketId === socketId) room.gameState.player2SocketId = null;
                         // Qalan oyunçuya update göndər
                         emitGameStateUpdate(roomId, 'opponent_left_game');
                    }
                    // Əgər oyun gedirdi və iki oyunçu var idisə, sadəcə socket ID-ni null edək
                     else if (room.players.length === 2) { // Bu şərt əslində artıq doğru olmayacaq, çünki biri çıxdı
                         if (room.gameState.player1SocketId === socketId) room.gameState.player1SocketId = null;
                         if (room.gameState.player2SocketId === socketId) room.gameState.player2SocketId = null;
                         // Oyun davam edir, digər oyunçu yenidən qoşula bilər
                         room.gameState.statusMessage = `${username} bağlantısı kəsildi. Yenidən qoşulması gözlənilir...`;
                         emitGameStateUpdate(roomId, 'opponent_disconnected');
                     }
                }

                // Boş Qalan Otağı Silmə
                if (room.players.length === 0 && !room.isAiRoom) {
                    if (room.deleteTimeout) { clearTimeout(room.deleteTimeout); }
                    const deletionDelay = 300000; // 5 dəqiqə
                    console.log(`[handleDisconnectOrLeave 5.10] Otaq ${roomId} boş qaldı. ${deletionDelay / 60000} dəqiqə sonra silinməsi planlaşdırılır.`);
                    room.deleteTimeout = setTimeout(() => {
                        if (rooms[roomId] && rooms[roomId].players.length === 0) {
                            console.log(`[handleDisconnectOrLeave 5.10] Boş otaq ${roomId} silinir.`);
                            delete rooms[roomId];
                            broadcastRoomList();
                        } else {
                             if (rooms[roomId]) delete rooms[roomId].deleteTimeout; // Timeout-u təmizlə
                        }
                    }, deletionDelay);
                }
                // Yaradan dəyişmə məntiqi (əvvəlki kimi)
                 else if (room.players.length === 1 && room.creatorUsername === username && !room.isAiRoom) {
                     const remainingPlayerId = room.players[0];
                     if(users[remainingPlayerId]) {
                          room.creatorUsername = users[remainingPlayerId].username;
                          console.log(`[handleDisconnectOrLeave 5.10] Otaq (${roomId}) yaradanı ${room.creatorUsername}-ə dəyişdi.`);
                     } else {
                          room.creatorUsername = 'Naməlum';
                     }
                 }

            } else {
                console.warn(`[handleDisconnectOrLeave 5.10] ${username} (${socketId}) ${roomId} otağının oyunçu siyahısında tapılmadı (state uyğunsuzluğu?).`);
            }
        } // if (roomId && rooms[roomId]) sonu

        // Otaq Siyahısını Yenilə (Əgər Oyunçu Otaqdan Çıxıbsa)
        if (roomExistedAndPlayerRemoved) {
            console.log(`[handleDisconnectOrLeave 5.10] ${username} otaqdan çıxdığı üçün otaq siyahısı göndərilir.`);
            broadcastRoomList();
        }
    } // handleDisconnectOrLeave sonu

}); // <<< --- io.on('connection', ...) BLOKUNUN BAĞLANMASI --- <<<

console.log('[Setup 5.10] Socket.IO "connection" handler-i və bütün daxili dinləyicilər təyin edildi.');

// ------------------------------------------------------------------------
// --- Part 6.1: Serveri Başlatma & Səliqəli Dayandırma ---
// ------------------------------------------------------------------------
console.log('[Setup 6.1] Serverin başladılması və dayandırılması məntiqi təyin edilir...');

const PORT = process.env.PORT || 3000;

console.log(`[Server Start 6.1] server.listen(${PORT}) funksiyası ÇAĞIRILIR...`);

server.listen(PORT, () => {
    const startTime = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
    console.log('=======================================================');
    console.log(`---- Server ${PORT} portunda uğurla işə düşdü! ----`);
    console.log(`---- Canlı Ünvan (təxmini): http://localhost:${PORT} (Render öz URL-ini təqdim edəcək) ----`);
    console.log(`---- Server Başlama Zamanı: ${startTime} ----`);

    try { createDefaultRooms(); } catch (err) { console.error("createDefaultRooms xətası:", err); }
    try { broadcastRoomList(); } catch (err) { console.error("broadcastRoomList xətası:", err); }

    console.log('=======================================================');
});

server.on('error', (error) => {
    console.error(`[Server Start 6.1] server.listen XƏTASI: Port ${PORT} problemi!`, error);
    if (error.code === 'EADDRINUSE') { console.error(`XƏTA: Port ${PORT} artıq istifadə olunur.`); }
    process.exit(1);
});

// Səliqəli Dayandırma
function gracefulShutdown(signal) {
    console.warn(`\n[Shutdown 6.1] ${signal} siqnalı alındı. Server bağlanır...`);
    io.close(() => {
        console.log('[Shutdown 6.1] Socket bağlantıları bağlandı.');
        server.close((err) => {
            if(err) { console.error("[Shutdown 6.1] HTTP server bağlanan zaman xəta:", err); }
            else { console.log('[Shutdown 6.1] HTTP server bağlandı.'); }
            pool.end((err) => {
                if(err) { console.error("[Shutdown 6.1] PostgreSQL pool bağlanan zaman xəta:", err); }
                else { console.log('[Shutdown 6.1] PostgreSQL pool bağlandı.'); }
                console.warn('[Shutdown 6.1] Server dayandırıldı.');
                process.exit(err ? 1 : 0);
            });
        });
    });
    setTimeout(() => { console.error('[Shutdown 6.1] Graceful shutdown vaxtı bitdi, proses zorla dayandırılır!'); process.exit(1); }, 10000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => { console.error('[FATAL ERROR 6.1] Uncaught Exception:', error); gracefulShutdown('uncaughtException'); });
process.on('unhandledRejection', (reason, promise) => { console.error('[FATAL ERROR 6.1] Unhandled Rejection:', reason); gracefulShutdown('unhandledRejection'); });

// ------------------------------------------------------------------------
// --- Server.js Faylının Sonu ---
// ------------------------------------------------------------------------