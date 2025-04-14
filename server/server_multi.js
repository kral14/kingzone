// server_multi.js (Yekun Düzəlişli Versiya - Bölünmüş)
// ==============================================================
// ===== Part 1/7: Setup, Middleware, Helpers, Globals ======
// ==============================================================

// ---- Əsas Modulların Import Edilməsi ----
require('dotenv').config(); // Mühit dəyişənlərini .env faylından oxumaq üçün
const express = require('express');
const http = require('http');
const { Server } = require("socket.io"); // socket.io v4+ sintaksisi
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg'); // PostgreSQL üçün
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session); // Sessiyaları DB-də saxlamaq üçün
const crypto = require('crypto'); // Unikal ID-lər yaratmaq üçün

// ---- Sabitlər ----
const saltRounds = 10; // Bcrypt üçün hash dövrü sayı
const RECONNECT_TIMEOUT_MS = 30 * 1000; // İstifadəçinin yenidən qoşulması üçün gözləmə müddəti (30 saniyə)
const ROOM_CLEANUP_DELAY_MS = 5 * 60 * 1000; // Boş otağın silinməsi üçün gözləmə müddəti (5 dəqiqə)

console.log("==============================================================");
console.log("--- Multiplayer Server (Yekun v1 - Bölünmüş) Başladılır ---"); // Versiya adı dəyişdirildi
console.log(`--- Reconnect Timeout: ${RECONNECT_TIMEOUT_MS / 1000}s, Room Cleanup Delay: ${ROOM_CLEANUP_DELAY_MS / 60000}min ---`);
console.log("==============================================================");

// ---- Express və Socket.IO Tətbiqlərinin Yaradılması ----
const app = express();
console.log('[Setup 1.1] Express tətbiqi yaradıldı.');
const server = http.createServer(app);
console.log('[Setup 1.1] HTTP server yaradıldı.');
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:8080", // Bunu da yoxlayaq - sekretlə eyni olmalıdır
        methods: ["GET", "POST"],
        credentials: true
    },
    pingInterval: 10000, // Ping intervalı qalsın
    pingTimeout: 15000  // Timeout-u 15 saniyəyə qaldırdıq
});
console.log(`[Setup 1.1] Socket.IO serveri yaradıldı. CORS Origin: ${process.env.CLIENT_URL || "http://localhost:8080"}`);

// ---- PostgreSQL Verilənlər Bazası Bağlantı Pool-u ----
if (!process.env.DATABASE_URL) {
    console.error('[FATAL ERROR 1.1] DATABASE_URL mühit dəyişəni tapılmadı! Server dayandırılır.');
    process.exit(1);
}
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
    // ssl: config obyekti artıq burada yoxdur
});
console.log('[Setup 1.1] PostgreSQL connection pool yaradıldı.');

// DB Bağlantı Testi Funksiyası
async function testDBConnection() {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log(`---- [DB Check 1.1] Verilənlər bazasına uğurla qoşuldu: ${new Date(result.rows[0].now).toISOString()} ----`);
    } catch (err) {
        console.error('[FATAL ERROR 1.1] Verilənlər bazasına qoşulma xətası! Server dayandırılır.', err.stack);
        process.exit(1);
    } finally {
        if (client) client.release();
    }
}
testDBConnection(); // Başlamazdan əvvəl yoxla

// ---- Express Ayarları ----
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // Proxy arxasında işləmək üçün
    console.log('[Setup 1.2] Express "trust proxy" ayarı aktiv edildi (production).');
}

// ---- Session Middleware Konfiqurasiyası ----
if (!process.env.SESSION_SECRET) {
    console.error('[FATAL ERROR 1.2] SESSION_SECRET mühit dəyişəni tapılmadı! Server dayandırılır.');
    process.exit(1);
}
const sessionMiddleware = session({
    store: new pgSession({
        pool: pool,                // PostgreSQL pool
        tableName: 'user_sessions', // DB-dəki cədvəl adı
        pruneSessionInterval: 60 * 15 // 15 dəqiqədən bir köhnə sessiyaları təmizlə (saniyə)
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,             // Dəyişiklik olmadıqda sessiyanı yenidən saxlamasın
    saveUninitialized: false, // Boş sessiyaları saxlamasın
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Yalnız HTTPS (productionda)
        httpOnly: true,           // Client JS cookie-yə çata bilməsin
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 gün (ms)
        sameSite: 'lax'          // CSRF üçün qismən qoruma
    }
});
app.use(sessionMiddleware);
console.log('[Setup 1.2] Session middleware (pgSession ilə) konfiqurasiya edildi.');

// ---- Digər Middleware-lər ----
app.use(express.json()); // Gələn JSON body-lərini parse et
console.log('[Setup 1.2] Express JSON parser middleware tətbiq edildi.');

// Sorğu Loglama Middleware
app.use((req, res, next) => {
    // Socket.IO upgrade sorğularını və statik faylları (html xaric) loglamayaq
    if (req.headers.upgrade === 'websocket' || (req.url.includes('.') && !req.url.endsWith('.html'))) {
        return next();
    }
    const userNickname = req.session?.user?.nickname || 'Anonymous';
    const timestamp = new Date().toLocaleTimeString('az-AZ');
    console.log(`[Request Log ${timestamp}] ${req.method} ${req.originalUrl} (User: ${userNickname})`);
    next();
});
console.log('[Setup 1.2] Sorğu loglama middleware tətbiq edildi.');

// Statik Fayl Middleware
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath));
console.log('[Setup 1.2] Static files middleware tətbiq edildi. Statik qovluq:', publicDirectoryPath);

// Autentifikasiya Middleware Funksiyası (API endpointləri üçün)
const isAuthenticated = (req, res, next) => {
    if (req.session?.user?.id) {
        return next(); // İstifadəçi giriş edib
    }
    console.warn(`[Auth Check 1.2] HTTP FAILED - Giriş tələb olunur. Path: ${req.originalUrl}`);
    // Client tərəf auth yoxlamasına güvənirik, burada yalnız JSON cavabı qaytaraq
    return res.status(401).json({ loggedIn: false, message: 'Bu əməliyyat üçün giriş tələb olunur.' });
};
console.log('[Setup 1.2] isAuthenticated middleware funksiyası təyin edildi.');

// ----- Qlobal Dəyişənlər -----
let rooms = {}; // Aktiv oyun otaqları (Key: roomId, Value: Room Object)
let users = {}; // Qoşulu istifadəçilər (Key: socket.id, Value: { id, userId, username, currentRoom, disconnectTimer })
let roomCleanupTimers = {}; // Boş otaqları silmək üçün taymerlər (Key: roomId, Value: TimeoutID)

console.log('[State 1.3] Qlobal `rooms`, `users` və `roomCleanupTimers` obyektləri yaradıldı.');

// ----- Sadə Yardımçı Funksiya -----
function generateRoomId() {
    return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 rəqəmli HEX ID
}

console.log('--- Part 1/7 Tamamlandı ---');
// ==============================
// ===== PART 1/7 SONU ==========
// ==============================

// Növbəti hissə (Part 2/7) burada başlayacaq...
// ===================================================================
// ===== Part 2/7: Utility Functions & Core Game State Logic =====
// ===================================================================

// ----- Otaq Siyahısı Yayımı Funksiyası (v9 - Active Player Count) -----
/**
 * Hazırkı aktiv multiplayer otaqlarının siyahısını formatlayıb
 * bütün qoşulu olan clientlərə (lobby-dəkilərə) göndərir.
 * Oyunçu sayını gameState-dəki aktiv oyunçulara görə hesablayır.
 */
function broadcastRoomList() {
    try {
        const roomListForClients = Object.values(rooms).map(room => {
            const p1 = room.gameState?.player1;
            const p2 = room.gameState?.player2;
            let activePlayerCount = 0;
            if (p1?.socketId && !p1.isDisconnected) activePlayerCount++;
            if (p2?.socketId && !p2.isDisconnected) activePlayerCount++;
            // Əgər gameState yoxdursa (çox nadir hal), room.players-dən götür
            const displayPlayerCount = room.gameState ? activePlayerCount : room.players.length;

            return {
                id: room.id,
                name: room.name,
                playerCount: displayPlayerCount, // Hesablanmış aktiv say
                hasPassword: !!room.password,
                boardSize: room.boardSize,
                creatorUsername: room.creatorUsername,
                // Yalnız aktiv oyunçuların adını göstər
                player1Username: (p1?.socketId && !p1.isDisconnected) ? p1.username : null,
                player2Username: (p2?.socketId && !p2.isDisconnected) ? p2.username : null,
                isAiRoom: false
            };
        });
        io.emit('room_list_update', roomListForClients);
        // console.log(`[Broadcast 2.1] Multiplayer otaq siyahısı yeniləndi (${roomListForClients.length} otaq).`);
    } catch (error) {
        console.error("[Broadcast 2.1] Otaq siyahısı göndərilərkən XƏTA:", error);
        io.emit('room_list_update', []); // Xəta olsa boş siyahı göndər
    }
}

// ----- Əsas Oyun Məntiqi Funksiyaları -----

/**
 * Verilmiş otaq üçün yeni oyun vəziyyəti (gameState) yaradır və ya sıfırlayır.
 * Həmişə 'waiting' fazası ilə başlayır və restart məlumatlarını sıfırlayır.
 * @param {object} room - Oyun vəziyyəti yaradılacaq otaq obyekti.
 * @returns {object | null} - Yaradılmış gameState obyekti və ya xəta halında null.
 */
function initializeGameState(room) {
    if (!room || !room.id) {
        console.error("[Game Logic 2.2 - v10] initializeGameState: Keçərsiz otaq obyekti!", room);
        return null;
    }
    console.log(`[Game Logic 2.2 - v10] Otaq üçün gameState yaradılır/sıfırlanır: ${room.id}`);

    const boardSize = room.boardSize || 3;
    // Otaqdakı mövcud oyunçuların socket ID-lərini götürək (əgər varsa)
    const currentPlayers = room.players || []; // players massivi olmalıdır
    const player1SocketId = currentPlayers.length > 0 ? currentPlayers[0] : null;
    const player2SocketId = currentPlayers.length > 1 ? currentPlayers[1] : null;

    // Həmin socket ID-lərinə uyğun user məlumatlarını users[]-dan tapaq
    const user1Info = player1SocketId ? users[player1SocketId] : null;
    const user2Info = player2SocketId ? users[player2SocketId] : null;

    const initialPlayerState = (socketInfo) => ({
        socketId: socketInfo?.id || null,
        userId: socketInfo?.userId || null,
        username: socketInfo?.username || null,
        symbol: null,
        roll: null,
        isDisconnected: false, // Başlanğıcda bağlıdır
        disconnectTime: null
    });

    const newGameState = {
        board: Array(boardSize * boardSize).fill(''),
        boardSize: boardSize,
        gamePhase: 'waiting', // Həmişə 'waiting' ilə başla
        currentPlayerSymbol: null,
        player1: initialPlayerState(user1Info),
        player2: initialPlayerState(user2Info),
        diceWinnerSocketId: null,
        symbolPickerSocketId: null,
        isGameOver: false,
        winnerSymbol: null,
        winningCombination: [],
        statusMessage: "İkinci oyunçu gözlənilir...", // İlkin status
        lastMoveTime: null,
        restartRequestedBy: null,      // Restartı sıfırla
        restartAcceptedBy: new Set() // Restartı sıfırla
    };

    // Username null qalıbsa və info varsa, yenidən təyin et
    if (newGameState.player1.socketId && !newGameState.player1.username && user1Info) {
         newGameState.player1.username = user1Info.username;
    }
     if (newGameState.player2.socketId && !newGameState.player2.username && user2Info) {
         newGameState.player2.username = user2Info.username;
    }

    // Köhnə gameState-i yenisi ilə əvəz et
    room.gameState = newGameState;
    console.log(`[Game Logic 2.2 - v10] GameState yaradıldı/sıfırlandı. Phase: "${newGameState.gamePhase}"`);
    return newGameState;
}

/**
 * Verilmiş ölçü üçün bütün mümkün qazanma xətlərini yaradır.
 * @param {number} size - Lövhənin ölçüsü (3-6).
 * @returns {number[][]} - Qazanan indeks kombinasiyaları.
 */
function generateWinConditions(size) {
    const lines = [];
    const n = size;
    const winLength = size >= 5 ? 4 : 3; // 5x5 və 6x6 üçün 4, digərləri üçün 3

    if (winLength > n) return []; // Qazanmaq mümkün deyil

    // Üfüqi
    for (let r = 0; r < n; r++) {
        for (let c = 0; c <= n - winLength; c++) {
            lines.push(Array.from({ length: winLength }, (_, i) => r * n + c + i));
        }
    }
    // Şaquli
    for (let c = 0; c < n; c++) {
        for (let r = 0; r <= n - winLength; r++) {
            lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + c));
        }
    }
    // Diaqonal (\)
    for (let r = 0; r <= n - winLength; r++) {
        for (let c = 0; c <= n - winLength; c++) {
            lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + (c + i)));
        }
    }
    // Diaqonal (/)
    for (let r = 0; r <= n - winLength; r++) {
        for (let c = winLength - 1; c < n; c++) {
            lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + (c - i)));
        }
    }
    return lines;
}

/**
 * Oyunçunun lövhədə qazanıb qazanmadığını yoxlayır.
 * @param {object} room - Otaq obyekti.
 * @param {'X' | 'O'} playerSymbolToCheck - Yoxlanılacaq simvol.
 * @returns {boolean} - Qazanıbsa true.
 */
function checkWinServer(room, playerSymbolToCheck) {
    if (!room?.gameState?.board || !playerSymbolToCheck) return false;
    const state = room.gameState;
    const board = state.board;
    const size = state.boardSize;
    state.winningCombination = []; // Əvvəlki qalibi təmizlə

    const winConditions = generateWinConditions(size);
    if (winConditions.length === 0 && size > 0) {
        console.error(`[Game Logic 2.2] checkWinServer: ${size}x${size} üçün qazanma şərtləri yaradıla bilmədi!`);
        return false;
    }

    for (const condition of winConditions) {
        if (board[condition[0]] === playerSymbolToCheck && condition.every(index => board[index] === playerSymbolToCheck)) {
            state.winningCombination = condition;
            return true;
        }
    }
    return false;
}

/**
 * Oyun sırasını aktiv olan digər oyunçuya keçirir.
 * @param {object} room - Otaq obyekti.
 */
function switchTurnServer(room) {
    if (!room?.gameState || room.gameState.isGameOver || room.gameState.gamePhase !== 'playing' || !room.gameState.player1?.symbol || !room.gameState.player2?.symbol) {
        return;
    }
    const state = room.gameState;
    const p1Active = state.player1.socketId && !state.player1.isDisconnected;
    const p2Active = state.player2.socketId && !state.player2.isDisconnected;

    if (p1Active && p2Active) { // Hər ikisi aktivdirsə
         state.currentPlayerSymbol = (state.currentPlayerSymbol === state.player1.symbol)
            ? state.player2.symbol
            : state.player1.symbol;
    } else if (p1Active) { // Yalnız P1 aktivdirsə
        state.currentPlayerSymbol = state.player1.symbol;
    } else if (p2Active) { // Yalnız P2 aktivdirsə
         state.currentPlayerSymbol = state.player2.symbol;
    } else { // Heç kim aktiv deyilsə
         state.currentPlayerSymbol = null;
    }
    // console.log(`[Game Logic 2.2] Sıra dəyişdi. Yeni sıra: ${state.currentPlayerSymbol}`);
}

/**
 * Verilmiş otağın hazırkı oyun vəziyyətini (gameState) otaqdakı clientlərə göndərir.
 * @param {string} roomId - Otaq ID-si.
 * @param {string} [triggeringEvent='N/A'] - Hadisə (log üçün).
 */
function emitGameStateUpdate(roomId, triggeringEvent = 'N/A') {
    try {
        const room = rooms[roomId];
        if (!room?.gameState) {
            console.warn(`[State Emitter 2.3] emitGameStateUpdate: Otaq (${roomId}) və ya gameState tapılmadı. Trigger: ${triggeringEvent}`);
            return;
        }
        const stateToSend = room.gameState;
        console.log(`[State Emitter 2.3] Otağa (${roomId}) gameState göndərilir. Trigger: ${triggeringEvent}, Phase: ${stateToSend.gamePhase}, Status: "${stateToSend.statusMessage}"`);
        io.to(roomId).emit('game_state_update', stateToSend);
    } catch (error) {
        console.error(`[State Emitter ERROR] emitGameStateUpdate zamanı xəta (RoomID: ${roomId}, Trigger: ${triggeringEvent}):`, error);
    }
}

console.log('--- Part 2/7 Tamamlandı ---');
// ==============================
// ===== PART 2/7 SONU ==========
// ==============================

// Növbəti hissə (Part 3/7) burada başlayacaq...
// =======================================================
// ===== Part 3/7: HTTP API Endpoints (Auth, Profile) ======
// =======================================================

// ----- HTTP API MARŞRUTLARI -----

// Qeyd: isAuthenticated middleware Part 1-də təyin edilmişdi,
// amma burada istifadə olunur. Əgər Part 1-də yoxdursa,
// bu endpointlərdən əvvəl təyin edilməlidir:
/*
const isAuthenticated = (req, res, next) => {
    if (req.session?.user?.id) {
        return next();
    }
    console.warn(`[Auth Check 1.2] HTTP FAILED - Giriş tələb olunur. Path: ${req.originalUrl}`);
    return res.status(401).json({ loggedIn: false, message: 'Bu əməliyyat üçün giriş tələb olunur.' });
};
*/

// ----- Qeydiyyat Endpoint-i (/register) -----
app.post('/register', async (req, res) => {
    const { fullName, email, nickname, password } = req.body;

    // Sadə validasiya
    if (!fullName || !email || !nickname || !password || password.length < 6 || nickname.length < 3 || /\s/.test(nickname)) {
        console.log('[Register FAIL] Validasiya uğursuz: Form məlumatları natamam/yanlış.');
        return res.status(400).json({ success: false, message: 'Form məlumatları natamam və ya yanlışdır (nickname min 3 hərf, boşluqsuz; şifrə min 6 hərf).' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
         console.log('[Register FAIL] Validasiya uğursuz: Yanlış email formatı.');
         return res.status(400).json({ success: false, message: 'Düzgün e-poçt ünvanı daxil edin.' });
    }

    try {
        // Eyni email və ya nickname yoxlanışı (case-insensitive)
        const checkUser = await pool.query('SELECT email, nickname FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2) LIMIT 1', [email, nickname]);

        if (checkUser.rows.length > 0) {
            const existing = checkUser.rows[0];
            let message = (existing.email.toLowerCase() === email.toLowerCase() && existing.nickname.toLowerCase() === nickname.toLowerCase())
                ? 'Bu email və nickname artıq istifadə olunur.'
                : (existing.email.toLowerCase() === email.toLowerCase() ? 'Bu email artıq istifadə olunur.' : 'Bu nickname artıq istifadə olunur.');
            console.log(`[Register FAIL] İstifadəçi artıq mövcuddur: ${message}`);
            return res.status(409).json({ success: false, message: message }); // 409 Conflict
        }

        // Parolu hash et
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Yeni istifadəçini bazaya əlavə et
        const newUserQuery = `INSERT INTO users (full_name, email, nickname, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nickname`;
        const newUser = await pool.query(newUserQuery, [fullName, email, nickname, hashedPassword]);

        console.log(`[Register OK] İstifadəçi qeydiyyatdan keçdi: ${newUser.rows[0].nickname} (ID: ${newUser.rows[0].id})`);
        res.status(201).json({ success: true, message: 'Qeydiyyat uğurlu oldu!', nickname: newUser.rows[0].nickname }); // 201 Created

    } catch (error) {
        console.error('[Register ERROR] Qeydiyyat zamanı DB xətası:', error);
        res.status(500).json({ success: false, message: 'Server xətası baş verdi. Daha sonra yenidən cəhd edin.' });
    }
});

// ----- Giriş Endpoint-i (/login) -----
app.post('/login', async (req, res) => {
    const { nickname, password } = req.body;

    if (!nickname || !password) {
        console.log('[Login FAIL] Boş nickname və ya parol.');
        return res.status(400).json({ success: false, message: 'Nickname və şifrə daxil edilməlidir.' });
    }

    try {
        // İstifadəçini nickname ilə axtar (case-insensitive)
        const result = await pool.query('SELECT * FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);

        if (result.rows.length === 0) {
            console.log(`[Login FAIL] İstifadəçi tapılmadı: ${nickname}`);
            return res.status(401).json({ success: false, message: 'Nickname və ya şifrə yanlışdır.' }); // 401 Unauthorized
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            // Sessiyanı qur
            req.session.user = {
                id: user.id,
                nickname: user.nickname,
                fullName: user.full_name,
                email: user.email
            };
            console.log(`[Login OK] İstifadəçi giriş etdi: ${user.nickname} (ID: ${user.id}), Session ID: ${req.session.id}`);
            res.status(200).json({ // Status 200 OK
                success: true,
                message: 'Giriş uğurludur!',
                nickname: user.nickname
            });
        } else {
            console.log(`[Login FAIL] Parol səhvdir: ${user.nickname}`);
            res.status(401).json({ success: false, message: 'Nickname və ya şifrə yanlışdır.' }); // 401 Unauthorized
        }

    } catch (error) {
        console.error('[Login ERROR] Giriş zamanı xəta:', error);
        res.status(500).json({ success: false, message: 'Server xətası baş verdi.' });
    }
});

// ----- Autentifikasiya Vəziyyətini Yoxlama Endpoint-i (/check-auth) -----
app.get('/check-auth', (req, res) => {
    if (req.session?.user?.id) {
        // console.log(`[/check-auth OK] Sessiya aktivdir: ${req.session.user.nickname}`);
        res.status(200).json({ // Status 200 OK
            loggedIn: true,
            user: req.session.user // Client üçün user məlumatını da göndər
        });
    } else {
        // console.log('[/check-auth FAIL] Aktiv sessiya tapılmadı.');
        res.status(200).json({ loggedIn: false, user: null }); // Client tərəfdə xəta çıxmasın deyə 200 OK
    }
});

// ----- Çıxış Endpoint-i (/logout) -----
app.post('/logout', (req, res) => {
    const userNickname = req.session?.user?.nickname || 'Bilinməyən';
    console.log(`[/logout] Çıxış sorğusu alındı: User=${userNickname}`);
    req.session.destroy(err => {
        if (err) {
            console.error('[/logout ERROR] Sessiya məhv edilərkən xəta:', err);
            return res.status(500).json({ success: false, message: 'Çıxış zamanı server xətası.' });
        }
        res.clearCookie('connect.sid'); // Sessiya cookie-sini sil ('connect.sid' default addır)
        console.log(`[/logout OK] Sessiya məhv edildi: User=${userNickname}`);
        res.status(200).json({ success: true, message: 'Uğurla çıxış edildi.' }); // Status 200 OK
    });
});

// ----- Profil Yeniləmə Endpoint-i (/profile/:nickname) -----
// isAuthenticated middleware yalnız giriş etmiş istifadəçilər üçün icazə verir.
app.put('/profile/:nickname', isAuthenticated, async (req, res) => {
    const targetNickname = req.params.nickname;
    const loggedInUserId = req.session.user.id;
    const loggedInNickname = req.session.user.nickname;
    const { fullName, email, nickname: newNickname, password } = req.body;

    console.log(`[/profile UPDATE] Sorğu alındı: Target=${targetNickname}, Requester=${loggedInNickname}`);

    // --- Validasiya və İcazə ---
    if (targetNickname.toLowerCase() !== loggedInNickname.toLowerCase()) {
        console.warn(`[/profile UPDATE FAIL] İcazəsiz cəhd: ${loggedInNickname} -> ${targetNickname}`);
        return res.status(403).json({ success: false, message: 'Yalnız öz profilinizi yeniləyə bilərsiniz.' }); // 403 Forbidden
    }
    if (!fullName || !email || !newNickname || newNickname.length < 3 || /\s/.test(newNickname)) {
        return res.status(400).json({ success: false, message: 'Ad Soyad, Email və Nickname boş ola bilməz (nickname min 3 hərf, boşluqsuz).' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Düzgün e-poçt ünvanı daxil edin.' });
    }
    if (password && password.length < 6) {
        return res.status(400).json({ success: false, message: 'Yeni şifrə minimum 6 simvol olmalıdır.' });
    }
    // --- Validasiya Sonu ---

    try {
        // Email/Nickname konflikti yoxlanışı
        const checkConflict = await pool.query(
            'SELECT id FROM users WHERE (LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2)) AND id != $3 LIMIT 1',
            [email, newNickname, loggedInUserId]
        );
        if (checkConflict.rows.length > 0) {
             console.warn(`[/profile UPDATE FAIL] Email/Nickname konflikti.`);
             return res.status(409).json({ success: false, message: 'Bu email və ya nickname artıq başqa istifadəçi tərəfindən istifadə olunur.' }); // 409 Conflict
        }

        // Yeniləmə sorğusu
        let updateQuery = 'UPDATE users SET full_name = $1, email = $2, nickname = $3';
        const queryParams = [fullName, email, newNickname];
        let paramIndex = 4;
        if (password) { // Yeni şifrə varsa
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            updateQuery += `, password_hash = $${paramIndex}`;
            queryParams.push(hashedPassword);
            paramIndex++;
            console.log(`[/profile UPDATE] Yeni şifrə hash edildi.`);
        }
        updateQuery += ` WHERE id = $${paramIndex} RETURNING id, nickname, full_name, email`;
        queryParams.push(loggedInUserId);

        // DB-ni yenilə
        const result = await pool.query(updateQuery, queryParams);
        if (result.rows.length === 0) {
            console.error(`[/profile UPDATE ERROR] İstifadəçi yenilənmədi (ID: ${loggedInUserId} tapılmadı?).`);
            return res.status(404).json({ success: false, message: 'Profil yenilənərkən xəta (istifadəçi tapılmadı).' }); // 404 Not Found
        }

        const updatedUser = result.rows[0];
        console.log(`[/profile UPDATE OK] Profil yeniləndi: ${updatedUser.nickname}`);

        // Sessiyanı yenilə
        req.session.user = {
            id: updatedUser.id,
            nickname: updatedUser.nickname,
            fullName: updatedUser.full_name,
            email: updatedUser.email
        };
        // Sessiyanı yadda saxla
        req.session.save((err) => {
            if (err) {
                 console.error('[/profile UPDATE ERROR] Sessiya yadda saxlanılarkən xəta:', err);
                 // Xəta olsa belə, DB yeniləndiyi üçün uğurlu cavab göndərək
                 return res.status(200).json({ success: true, message: 'Profil uğurla yeniləndi! (Sessiya xətası)', updatedUser: req.session.user });
            }
             res.status(200).json({ success: true, message: 'Profil uğurla yeniləndi!', updatedUser: req.session.user });
        });

    } catch (error) {
        console.error('[/profile UPDATE ERROR] Profil yenilənərkən DB xətası:', error);
        res.status(500).json({ success: false, message: 'Server xətası baş verdi.' });
    }
});

// ----- Kök URL Endpoint-i (/) -----
// Giriş səhifəsinə yönləndirir
app.get('/', (req, res) => {
    res.redirect('/ana_sehife/login/login.html');
});


console.log('--- Part 3/7 Tamamlandı ---');
// ==============================
// ===== PART 3/7 SONU ==========
// ==============================

// Növbəti hissə (Part 4/7) burada başlayacaq...
// ============================================================
// ===== Part 4/7: Socket.IO Connection & Authentication ======
// ============================================================
console.log('[Setup 4.1] Socket.IO üçün middleware konfiqurasiyası başlayır...');

// Express session middleware-ni Socket.IO üçün əlçatan edən yardımçı funksiya
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

// Express session middleware-ni Socket.IO-ya tətbiq et
io.use(wrap(sessionMiddleware));
console.log('[Setup 4.1] Express session middleware Socket.IO üçün əlçatan edildi.');

// Socket.IO bağlantıları üçün Autentifikasiya Middleware-i
io.use((socket, next) => {
  const session = socket.request.session;
  // Sessiyanın və içində user məlumatlarının (id və nickname) mövcud olduğunu yoxla
  if (session && session.user && session.user.id && session.user.nickname) {
    // socket.user təyin etmək əvəzinə, istifadəçinin autentifikasiyadan keçdiyini bilirik.
    // İstifadəçi məlumatlarını lazım olduqda users[] obyektindən socket.id ilə götürəcəyik.
    // Bu, socket.user-in qeyri-stabil olması problemini aradan qaldırır.
    // console.log(`[Socket Auth 4.1] OK - Session found for Socket ID: ${socket.id}. User ID: ${session.user.id}`);
    next(); // Bağlantıya icazə ver
  } else {
    console.warn(`[Socket Auth 4.1] FAILED - Bağlantı rədd edildi (Sessiya tapılmadı və ya etibarsız). Socket ID: ${socket.id}`);
    next(new Error('Authentication Error: Giriş edilməyib və ya sessiya bitib.')); // Xəta ilə rədd et
  }
});
console.log('[Setup 4.1] Socket.IO üçün autentifikasiya middleware təyin edildi.');

// ----- Əsas Socket.IO Bağlantı Hadisəsi (`connection`) -----
console.log('[Setup 4.1] Socket.IO "connection" hadisə dinləyicisi təyin edilir...');

io.on('connection', (socket) => { // <<< --- ƏSAS BAĞLANTI BLOKU BAŞLAYIR (Hələ bağlanmır!) --- <<<

    // Qoşulan istifadəçinin məlumatlarını sessiyadan götürək (auth middleware bunu təmin etdi)
    const session = socket.request.session;
    // Hər ehtimala qarşı yenidən yoxlayaq
    if (!session || !session.user || !session.user.id || !session.user.nickname) {
        console.error(`[Socket Connect 4.2] XƏTA: Qoşulan soket üçün sessiya məlumatı tapılmadı! Socket ID: ${socket.id}. Bağlantı kəsilir.`);
        socket.disconnect(true);
        return;
    }
    const connectedUser = { ...session.user }; // Sessiyadakı user məlumatının kopyası

    console.log(`[Socket Connect 4.2] ++ User Qoşuldu: ${connectedUser.nickname} (UserID: ${connectedUser.id}), Socket ID: ${socket.id}`);

    // Köhnə bağlantı yoxlaması (əgər eyni user başqa socketlə bağlıdırsa) - Hələlik deaktivdir
    /*
    for (const existingSocketId in users) {
        if (users[existingSocketId].userId === connectedUser.id && existingSocketId !== socket.id) {
             // ... köhnə socketi bağlama məntiqi ...
        }
    }
    */

    // Yeni qoşulan istifadəçini qlobal `users` obyektinə əlavə et
    // Əgər eyni userId ilə başqa socketId varsa, onu silmək daha yaxşıdır
    Object.keys(users).forEach(existingSocketId => {
        if (users[existingSocketId].userId === connectedUser.id) {
             console.warn(`[Socket Connect 4.2] Existing socket found for UserID ${connectedUser.id}. Removing old entry: ${existingSocketId}`);
             // Köhnə socketi məcbur disconnect etmək də olar:
             // const oldSocket = io.sockets.sockets.get(existingSocketId);
             // if (oldSocket) oldSocket.disconnect(true);
             delete users[existingSocketId];
        }
    });
    // Yenisini əlavə et
    users[socket.id] = {
        id: socket.id,
        userId: connectedUser.id,
        username: connectedUser.nickname,
        currentRoom: null, // Başlanğıcda heç bir otaqda deyil
        disconnectTimer: undefined
    };
    console.log(`[Socket Connect 4.2] İstifadəçi "${connectedUser.nickname}" (Socket: ${socket.id}) qlobal 'users' obyektinə əlavə edildi/yeniləndi.`);

    // Yeni qoşulan client-ə ilkin otaq siyahısını göndər
    try {
        // broadcastRoomList funksiyası Part 2-də təyin edilmişdi
        const initialRoomList = Object.values(rooms).map(room => {
             const p1 = room.gameState?.player1;
             const p2 = room.gameState?.player2;
             let activePlayerCount = 0;
             if (p1?.socketId && !p1.isDisconnected) activePlayerCount++;
             if (p2?.socketId && !p2.isDisconnected) activePlayerCount++;
             const displayPlayerCount = room.gameState ? activePlayerCount : room.players.length;
             return {
                 id: room.id, name: room.name, playerCount: displayPlayerCount, hasPassword: !!room.password,
                 boardSize: room.boardSize, creatorUsername: room.creatorUsername,
                 player1Username: (p1?.socketId && !p1.isDisconnected) ? p1.username : null,
                 player2Username: (p2?.socketId && !p2.isDisconnected) ? p2.username : null,
                 isAiRoom: false
             };
         });
        socket.emit('room_list_update', initialRoomList);
        console.log(`[Socket Connect 4.2] İlkin otaq siyahısı (${initialRoomList.length} otaq) ${connectedUser.nickname}-ə göndərildi.`);
    } catch (listError) {
        console.error(`[Socket Connect 4.2] İlkin otaq siyahısı göndərilərkən xəta (User: ${connectedUser.nickname}):`, listError);
        socket.emit('room_list_update', []);
    }

    // === Növbəti hissələrdə (Part 5, 6, 7) bu blokun içinə digər socket.on() hadisələri əlavə olunacaq ===


console.log('--- Part 4/7 Tamamlandı (io.on("connection") bloku açıq qaldı) ---');
// ==============================
// ===== PART 4/7 SONU ==========
// ==============================
// =============================================================================
    // ===== Part 5/7: Socket.IO Lobby & Room Management Handlers ======
    // =============================================================================
    // Bu kod io.on('connection', (socket) => { ... }); bloku içərisindədir!

    // --- Yeni otaq yaratma (v8 - GameState dərhal yaradılır, v12 - Robust Info Fetch) ---
    socket.on('create_room', (data) => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
        if (!user || !currentUserSocketInfo) {
            console.error(`[create_room v12] Xəta: User/SocketInfo tapılmadı. Socket: ${socketId}`);
            return socket.emit('creation_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.');
        }
        console.log(`[Socket Event 5.1 - create_room v12] Hadisə alındı: User=${user.nickname}, Data=`, data);

        // Validasiya
        if (!data || !data.name || data.name.trim().length === 0 || data.name.length > 30) { return socket.emit('creation_error', 'Otaq adı etibarsızdır (1-30 simvol).'); }
        const roomName = data.name.trim();
        const roomPassword = data.password || null;
        if (roomPassword && (roomPassword.length < 2 || roomPassword.length > 20)) { return socket.emit('creation_error', 'Şifrə etibarsızdır (2-20 simvol).'); }
        if (currentUserSocketInfo.currentRoom) { console.warn(`[create_room v12] User ${user.nickname} artıq ${currentUserSocketInfo.currentRoom} otağındadır.`); return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız.'); }
        const MAX_ROOMS = process.env.MAX_ROOMS || 50;
        if (Object.keys(rooms).length >= MAX_ROOMS) { return socket.emit('creation_error', `Maksimum otaq sayına (${MAX_ROOMS}) çatılıb.`); }

        // Yeni Otaq Yaratmaq
        const newRoomId = generateRoomId();
        const validatedBoardSize = Math.max(3, Math.min(6, parseInt(data.boardSize, 10) || 3));
        const newRoom = { id: newRoomId, name: roomName, password: roomPassword, players: [socketId], boardSize: validatedBoardSize, creatorUsername: user.nickname, gameState: null, isAiRoom: false, disconnectTimers: {} };

        // GameState-i dərhal yarat (Funksiya Part 2-də təyin edilib)
        const initialGameState = initializeGameState(newRoom);
        if (!initialGameState) {
             console.error(`[create_room v12] initializeGameState xətası!`);
             if(currentUserSocketInfo) currentUserSocketInfo.currentRoom = null;
             return socket.emit('creation_error', 'Oyun vəziyyəti yaradılarkən xəta baş verdi.');
        }
        newRoom.gameState = initialGameState;

        rooms[newRoomId] = newRoom;
        currentUserSocketInfo.currentRoom = newRoomId; // users[] obyektini yenilə
        socket.join(newRoomId);
        console.log(`[Socket Event 5.1 v12] Otaq yaradıldı və gameState başladıldı: ID=${newRoomId}, Ad='${newRoom.name}', Phase=${newRoom.gameState.gamePhase}`);
        broadcastRoomList(); // Lobbini yenilə
        socket.emit('room_joined', { roomId: newRoom.id, roomName: newRoom.name, boardSize: newRoom.boardSize });
   }); // --- 'create_room' sonu ---


   // --- Mövcud otağa qoşulma (Lobbiden - v12 Robust Info Fetch) ---
    socket.on('join_room', (data) => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
        if (!user || !currentUserSocketInfo) { return socket.emit('join_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.'); }
        if (!data || !data.roomId) { return socket.emit('join_error', 'Otaq ID göndərilmədi.'); }
        const roomId = data.roomId; const room = rooms[roomId];
        console.log(`[Socket Event 5.2 - join_room v12] Hadisə alındı: User=${user.nickname}, RoomID=${roomId}`);

        if (!room) { broadcastRoomList(); return socket.emit('join_error', 'Otaq tapılmadı.'); }
        if (room.password && room.password !== data.password) { return socket.emit('join_error', 'Şifrə yanlışdır.'); }

        // Aktiv oyunçu sayını hesabla (broadcastRoomList-dəki kimi)
        let activePlayerCount = 0;
        if (room.gameState?.player1?.socketId && !room.gameState.player1.isDisconnected) activePlayerCount++;
        if (room.gameState?.player2?.socketId && !room.gameState.player2.isDisconnected) activePlayerCount++;
        const currentCount = room.gameState ? activePlayerCount : room.players.length;

        // Eyni user ID ilə aktiv oyunçu artıq otaqda varmı?
        const userAlreadyInRoom = (room.gameState?.player1?.userId === user.id && !room.gameState.player1.isDisconnected) ||
                                 (room.gameState?.player2?.userId === user.id && !room.gameState.player2.isDisconnected);

        if (currentCount >= 2 && !userAlreadyInRoom) {
            console.warn(`[join_room v12] Otaq ${roomId} dolu (Count: ${currentCount}). Qoşulma rədd edildi: ${user.nickname}`);
            return socket.emit('join_error', 'Otaq doludur.');
        }
        if (currentUserSocketInfo.currentRoom && currentUserSocketInfo.currentRoom !== roomId) {
            console.warn(`[join_room v12] User ${user.nickname} artıq ${currentUserSocketInfo.currentRoom} otağındadır.`);
            return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.');
        }

        console.log(`[join_room v12] User ${user.nickname} joining room ${roomId}. Sending room_joined.`);
        socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });
        // Əsas qoşulma məntiqi player_ready_in_room-da baş verəcək
    }); // --- 'join_room' sonu ---


   // --- Otaq parametrlərini yeniləmə (v12 - Robust Info Fetch) ---
    socket.on('update_room_settings', (data) => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
        if (!user || !currentUserSocketInfo || !data?.roomId) { return socket.emit('update_room_settings_result', { success: false, message: 'Keçərsiz sorğu.' }); }
        const roomId = data.roomId; const room = rooms[roomId];
        if (!room) return socket.emit('update_room_settings_result', { success: false, message: 'Otaq tapılmadı.' });
        if (room.creatorUsername !== user.nickname) return socket.emit('update_room_settings_result', { success: false, message: 'Yalnız yaradan parametrləri dəyişə bilər.' });

        const isGameInProgress = room.gameState && room.gameState.gamePhase !== 'waiting' && room.gameState.gamePhase !== 'game_over';
        if (isGameInProgress && data.newBoardSize && parseInt(data.newBoardSize, 10) !== room.boardSize) { return socket.emit('update_room_settings_result', { success: false, message: 'Oyun davam edərkən lövhə ölçüsü dəyişdirilə bilməz.' }); }

        console.log(`[Socket Event 5.4 - update_room_settings v12] Hadisə alındı: RoomID=${roomId}, User=${user.nickname}`);
        let updated = false; let stateReset = false;

        // Adı yenilə
        const newName = data.newName?.trim().slice(0, 30);
        if (newName && newName.length > 0 && newName !== room.name) { room.name = newName; updated = true; console.log(`[update_room_settings v12] Ad dəyişdi: '${room.name}'`); }

        // Şifrəni yenilə
        if (data.newPassword !== undefined) {
            const newPass = data.newPassword || null;
            if (newPass && (newPass.length < 2 || newPass.length > 20)) return socket.emit('update_room_settings_result', { success: false, message: 'Yeni şifrə etibarsızdır (2-20 simvol).' });
            if (newPass !== room.password) { room.password = newPass; updated = true; console.log(`[update_room_settings v12] Şifrə statusu dəyişdi: ${newPass ? 'Şifrəli' : 'Açıq'}`); }
        }

        // Lövhə ölçüsünü yenilə
        if (data.newBoardSize && !isGameInProgress) {
            const newSize = Math.max(3, Math.min(6, parseInt(data.newBoardSize, 10) || room.boardSize));
            if (newSize !== room.boardSize) {
                 room.boardSize = newSize; updated = true; console.log(`[update_room_settings v12] Lövhə ölçüsü dəyişdi: ${newSize}x${newSize}`);
                 if (room.gameState) { // Əgər oyun artıq başlayıbsa (waiting/game_over)
                    console.log(`[update_room_settings v12] Board size dəyişdi, gameState sıfırlanır.`);
                    initializeGameState(room); // State-i yeni ölçü ilə sıfırla
                    stateReset = true; // Sıfırlandığını qeyd et
                    // emitGameStateUpdate dərhal çağırılmayacaq, sonda ediləcək
                 }
            }
        }

        if (updated) {
            broadcastRoomList(); // Lobbini yenilə
            socket.emit('update_room_settings_result', { success: true, message: 'Otaq parametrləri yeniləndi!' });
            // Rəqibə də bildir (əgər varsa və state sıfırlanıbsa, ona yeni state göndər)
            const opponentSocketId = room.players.find(pId => pId !== socketId);
            const opponentSocket = opponentSocketId ? io.sockets.sockets.get(opponentSocketId) : null;
            if (opponentSocket) {
                 opponentSocket.emit('info_message', { message: 'Otaq parametrləri dəyişdirildi.' });
                 if (stateReset) { // Əgər state sıfırlanıbsa, ona da göndər
                     emitGameStateUpdate(roomId, 'room_settings_updated_state_reset');
                 }
            }
            // Əgər state sıfırlanıbsa, yaradana da göndər
            if(stateReset) {
                 emitGameStateUpdate(roomId, 'room_settings_updated_state_reset');
            }
        } else {
            socket.emit('update_room_settings_result', { success: true, message: 'Heç bir dəyişiklik edilmədi.' });
        }
    }); // --- 'update_room_settings' sonu ---


   // --- Otağı silmə (v12 - Robust Info Fetch) ---
    socket.on('delete_room', (data) => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
        if (!user || !currentUserSocketInfo || !data?.roomId) return socket.emit('delete_error', 'Keçərsiz sorğu.');
        const roomId = data.roomId; const room = rooms[roomId];
        if (!room) return socket.emit('delete_error', 'Silinəcək otaq tapılmadı.');
        if (room.creatorUsername !== user.nickname) return socket.emit('delete_error', 'Yalnız otağı yaradan silə bilər.');

        console.log(`[Socket Event 5.5 - delete_room v12] Hadisə alındı: RoomID=${roomId}, User=${user.nickname}`);
        const roomName = room.name; // Adını silmədən əvvəl götürək

        // Otaqdakı bütün oyunçuları məlumatlandır və otaqdan çıxart
        const playersInRoom = [...room.players];
        playersInRoom.forEach(playerId => {
            const playerSocket = io.sockets.sockets.get(playerId);
            const playerUserInfo = users[playerId]; // users-dən götür
            if (playerSocket) {
                playerSocket.emit('room_deleted_kick', { message: `'${roomName}' otağı yaradan tərəfindən silindi.` });
                playerSocket.leave(roomId);
                // İstifadəçinin mövcud otağını users[]-da sıfırla
                if (playerUserInfo) playerUserInfo.currentRoom = null;
                // Oyunçu yaradan deyilsə, bağlantısını kəsməyə ehtiyac yoxdur, özü çıxacaq
                // Amma yaradanın öz socketi kəsilməlidirmi? Yox, onsuz da o event göndərib
            } else {
                 // Socket tapılmasa belə users[]-ı təmizlə
                 if (playerUserInfo) playerUserInfo.currentRoom = null;
            }
        });

        // Otağı qlobal siyahıdan sil
        delete rooms[roomId];
        // Silinmə taymerini təmizlə
        if (roomCleanupTimers[roomId]) { clearTimeout(roomCleanupTimers[roomId]); delete roomCleanupTimers[roomId]; }
        console.log(`[State 5.5 v12] Otaq ${roomId} ('${roomName}') silindi.`);
        broadcastRoomList(); // Lobbini yenilə
    }); // --- 'delete_room' sonu ---


   // --- Rəqibi otaqdan çıxarma (v12 - Robust Info Fetch) ---
    socket.on('kick_opponent', (data) => {
         const socketId = socket.id;
         const currentUserSocketInfo = users[socketId];
         const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
         if (!user || !currentUserSocketInfo || !data?.roomId) return socket.emit('kick_error', 'Keçərsiz sorğu.');
         const roomId = data.roomId; const room = rooms[roomId];
         if (!room) return socket.emit('kick_error', 'Otaq tapılmadı.');
         if (room.creatorUsername !== user.nickname) return socket.emit('kick_error', 'Yalnız yaradan rəqibi çıxara bilər.');
         const opponentSocketId = room.players.find(pId => pId !== socketId);
         if (!opponentSocketId) return socket.emit('kick_error', 'Otaqda çıxarılacaq rəqib yoxdur.');

         console.log(`[Socket Event 5.6 - kick_opponent v12] Hadisə alındı: Kicker=${user.nickname}, Kicked=${opponentSocketId}`);
         const opponentSocket = io.sockets.sockets.get(opponentSocketId);
         const opponentUserInfo = users[opponentSocketId]; // users[]-dan götür
         const opponentName = opponentUserInfo?.username || 'Rəqib';

         // Rəqibə məlumat ver və otaqdan/serverdən çıxart
         if (opponentSocket) {
             opponentSocket.emit('room_deleted_kick', { message: `'${room.name}' otağından yaradan tərəfindən çıxarıldınız.` });
             opponentSocket.leave(roomId);
             if(opponentUserInfo) opponentUserInfo.currentRoom = null;
             opponentSocket.disconnect(true); // Bağlantını kəs (bu, handleDisconnectOrLeave-i işə salacaq)
         } else {
              console.warn(`[kick_opponent v12] Kicked opponent's socket (${opponentSocketId}) not found. Manually cleaning up.`);
              // Əgər socket yoxdursa, deməli onsuz da disconnect olub.
              // handleDisconnectOrLeave onsuz da işləmiş olmalı idi.
              // Sadəcə users[] və players[]-dan təmizləyək.
              removePlayerFromRoomArray(room, opponentSocketId);
              removeUserGlobally(opponentSocketId);
              // GameState-i də təmizləyək (əgər opponentUserInfo varsa)
               if(room.gameState && opponentUserInfo) {
                    const { playerState: kickedPlayerState } = findPlayerStates(room.gameState, opponentUserInfo.userId);
                    if(kickedPlayerState) {
                        Object.assign(kickedPlayerState, { socketId: null, userId: null, username: null, isDisconnected: false, disconnectTime: null, symbol: null, roll: null });
                        // Yaradanı gözləməyə qaytar
                        room.gameState.gamePhase = 'waiting';
                        room.gameState.statusMessage = "Rəqib çıxarıldı. Yeni rəqib gözlənilir...";
                        emitGameStateUpdate(roomId, 'opponent_kicked_socket_not_found');
                        broadcastRoomList(); // Lobbini yenilə
                    }
               }
         }
         socket.emit('info_message', { message: `'${opponentName}' otaqdan çıxarıldı.` });
         // broadcastRoomList və emitGameStateUpdate ya disconnect handler-i, ya da yuxarıdakı else bloku tərəfindən edilir.
    }); // --- 'kick_opponent' sonu ---


   // === Növbəti hissədə (Part 6) oyun məntiqi hadisələri gələcək ===

console.log('--- Part 5/7 Tamamlandı (io.on("connection") bloku hələ də açıqdır) ---');
// ==============================
// ===== PART 5/7 SONU ==========
// ==============================
// =====================================================================
    // ===== Part 6/7: Socket.IO Game Logic Handlers =====================
    // =====================================================================
    // Bu kod io.on('connection', (socket) => { ... }); bloku içərisindədir!

   // io.on('connection', (socket) => { içində

    // 2. Mövcud otağa qoşulma / Hazır olma hadisəsi (Tam Funksiya v12 - Null Socket Check)
    socket.on('player_ready_in_room', (data) => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        if (!data || !data.roomId || !data.userId || !data.username) { /* ... xəta ... */ }
        const roomId = data.roomId; const userId = data.userId; const username = data.username; const room = rooms[roomId];
        if (!currentUserSocketInfo || currentUserSocketInfo.userId !== userId) { /* ... users[] yeniləmə ... */ } else { currentUserSocketInfo.currentRoom = roomId; }

        console.log(`[Socket Event 5.7 - player_ready_in_room v12] Hadisə alındı: User=${username}, RoomID=${roomId}`);
        if (!room) { return socket.emit('force_redirect_lobby', { message: "Otaq tapılmadı." }); }
        if (!room.gameState) { /* ... xəta, bərpa cəhdi ... */ }
        const gameState = room.gameState;
        if (!socket.rooms.has(roomId)) { socket.join(roomId); }

        let playerSlot = null; let playerState = null; let needsUpdateEmit = false;
        if (gameState.player1?.userId === userId) { playerSlot = 1; playerState = gameState.player1; }
        else if (gameState.player2?.userId === userId) { playerSlot = 2; playerState = gameState.player2; }
        else { playerSlot = null; playerState = null; }
        let opponentState = (playerSlot === 1) ? gameState.player2 : gameState.player1;

        // --- Qoşulma/Qayıtma Növünü Təyin Et ---

        // ---- YENİ ŞƏRT ƏLAVƏ EDİLDİ: playerState.socketId === null ----
        // Oyunçu tapılıb, disconnect olub VƏ socket ID-si null-dırsa (yəni disconnect emal olunub)
        if (playerState && playerState.isDisconnected && playerState.socketId === null) {
            // --- A: Yenidən Qoşulan (Düzgün Hal) ---
            console.log(`[player_ready v12] Reconnecting User (socketId was null): ${username} (Slot ${playerSlot})`);
            // ... (Reconnect məntiqi: timer sil, state yenilə, room.players yenilə, fazanı təyin et - əvvəlki v11 kimi) ...
             if (room.disconnectTimers && room.disconnectTimers[userId]) { clearTimeout(room.disconnectTimers[userId]); delete room.disconnectTimers[userId]; }
             playerState.socketId = socketId; playerState.isDisconnected = false; playerState.disconnectTime = null; playerState.username = username;
             room.players = room.players.filter(id => users[id]?.userId !== userId);
             if (!room.players.includes(socketId)) { room.players.push(socketId); }
             console.log(`[player_ready v12] Updated room.players: [${room.players.join(', ')}]`);
             needsUpdateEmit = true; broadcastRoomList();
             // Reconnect Davranışı: Oyun qaldığı yerdən davam
             if (opponentState?.socketId && !opponentState.isDisconnected) {
                  console.log(`[player_ready v12] Opponent active. CONTINUING game from phase: ${gameState.gamePhase}.`);
                  const currentTurnPlayerState = (gameState.currentPlayerSymbol === playerState.symbol) ? playerState : opponentState;
                  gameState.statusMessage = `${username} oyuna qayıtdı. Sıra: ${currentTurnPlayerState?.username || gameState.currentPlayerSymbol || '?'}`;
             } else {
                  console.log(`[player_ready v12] Opponent not active. Reverting to waiting phase.`);
                  gameState.gamePhase = 'waiting'; gameState.statusMessage = "Rəqib gözlənilir...";
             }

        } else if (!playerState && room.players.filter(id => users[id] && !users[id]?.isDisconnected).length < 2) {
            // --- B: Yeni Qoşulan İkinci Oyunçu ---
            // ... (Əvvəlki v11 kimi - boş slotu tap, əlavə et, zər fazasına keç) ...
             let targetSlot = null; let targetSlotNum = 0;
             if (!gameState.player1?.userId) { targetSlot = gameState.player1; targetSlotNum = 1;}
             else if (!gameState.player2?.userId) { targetSlot = gameState.player2; targetSlotNum = 2;}
             if (targetSlot) {
                 console.log(`[player_ready v12] New player ${username} joining as P${targetSlotNum}`);
                 room.players = room.players.filter(id => users[id]?.userId !== userId);
                 if (!room.players.includes(socketId)) { room.players.push(socketId); }
                 console.log(`[player_ready v12] Updated room.players: [${room.players.join(', ')}]`);
                 targetSlot.socketId = socketId; targetSlot.userId = userId; targetSlot.username = username; targetSlot.isDisconnected = false;
                 // İki aktiv oyunçu var -> Zər Atma
                 gameState.gamePhase = 'dice_roll'; gameState.statusMessage = "Oyunçular zər atır...";
                 if (gameState.player1) gameState.player1.roll = null; if (gameState.player2) gameState.player2.roll = null;
                 needsUpdateEmit = true; broadcastRoomList();
             } else { console.warn(`[player_ready v12] No empty slot found.`); needsUpdateEmit = true; }

        // ---- PROBLEMİN BAŞ VERDİYİ BLOKU YENİLƏ ----
        } else if (playerState && playerState.socketId !== socketId && !playerState.isDisconnected) {
            // D: Eyni User, Fərqli AKTİV Socket
             console.warn(`[player_ready v12] User ${username} already actively connected with socket (${playerState.socketId}). New socket ${socketId} trying to connect.`);
             // Köhnə bağlantını saxlamaq əvəzinə, köhnəni kəsib yenini qəbul edək?
             // Bu, "başqa cihazdan giriş" problemini həll edə bilər.
             const oldSocketId = playerState.socketId;
             const oldSocketInstance = io.sockets.sockets.get(oldSocketId);
             if (oldSocketInstance) {
                  console.log(`[player_ready v12] Disconnecting old socket ${oldSocketId}...`);
                  oldSocketInstance.emit('force_disconnect', { message: 'Bu hesabla başqa yerdən qoşuldunuz.' }); // Köhnəyə xəbər ver
                  oldSocketInstance.disconnect(true);
             } else {
                   console.log(`[player_ready v12] Old socket ${oldSocketId} not found, maybe already disconnected.`);
             }
             // İndi yeni socketi qəbul et
             playerState.socketId = socketId; // Socket ID-ni yenilə
             playerState.isDisconnected = false; // Aktiv et
             playerState.username = username; // Adı yenilə (hər ehtimala qarşı)
             // room.players-i yenilə
             room.players = room.players.filter(id => id !== oldSocketId); // Köhnəni sil
             if (!room.players.includes(socketId)) { room.players.push(socketId); } // Yenini əlavə et
             console.log(`[player_ready v12] Accepted new socket ${socketId} for user ${username}. Updated room.players: [${room.players.join(', ')}]`);
             needsUpdateEmit = true; // Yeni vəziyyəti göndər

        } else if (playerState && playerState.socketId === socketId && !playerState.isDisconnected) {
            // C: Artıq Qoşulu Olan (Problem yoxdur)
             console.log(`[player_ready v12] Player ${username} is already connected and active.`);
             needsUpdateEmit = true;
        } else {
            // E: Digər Hallar (Otaq dolu və bu user state-də yoxdur?)
             console.log(`[player_ready v12] Player ${username} state: Room full or undefined state. Sending current state.`);
             needsUpdateEmit = true;
        }
        // ---- BLOKLARIN SONU ----

        // Adları yenilə
        if (gameState.player1?.socketId && users[gameState.player1.socketId]) gameState.player1.username = users[gameState.player1.socketId].username;
        if (gameState.player2?.socketId && users[gameState.player2.socketId]) gameState.player2.username = users[gameState.player2.socketId].username;

        if (needsUpdateEmit) { emitGameStateUpdate(roomId, 'player_ready_or_reconnected'); }
        socket.emit('room_info', { name: room.name, boardSize: room.boardSize, creatorUsername: room.creatorUsername });

    }); // --- 'player_ready_in_room' sonu ---

   // --- Zər atma nəticəsi (v11 - Gecikmə ilə) ---
    socket.on('dice_roll_result', (data) => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
        if (!user || !currentUserSocketInfo) { return socket.emit('game_error', { message: 'İstifadəçi məlumatı tapılmadı.' }); }
        const roomId = currentUserSocketInfo.currentRoom;
        if (!roomId || !rooms[roomId]?.gameState) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
        const state = rooms[roomId].gameState;
        if (state.gamePhase !== 'dice_roll' || state.isGameOver) return socket.emit('game_error', { message: 'Zər atmaq üçün uyğun mərhələ deyil.' });
        if (!data || typeof data.roll !== 'number' || data.roll < 1 || data.roll > 6) return socket.emit('game_error', { message: 'Keçərsiz zər nəticəsi.' });
        console.log(`[Socket Event 6.2 - dice_roll_result v11] Hadisə alındı: User=${user.nickname}, Roll=${data.roll}`);

        let playerState = null; let opponentState = null;
        if (socketId === state.player1?.socketId && !state.player1.isDisconnected) { playerState = state.player1; opponentState = state.player2; }
        else if (socketId === state.player2?.socketId && !state.player2.isDisconnected) { playerState = state.player2; opponentState = state.player1; }
        else return socket.emit('game_error', { message: 'Siz bu oyunda aktiv oyunçu deyilsiniz.' });
        if (playerState.roll !== null && !state.statusMessage?.includes("Bərabərlik!")) { return socket.emit('game_error', { message: 'Siz artıq zər atmısınız.' }); }
        playerState.roll = data.roll;

        const p1_roll = state.player1?.roll; const p2_roll = state.player2?.roll;

        if (p1_roll !== null && p2_roll !== null) { // Hər ikisi atıb
            let winnerState = null; let loserState = null; let diceWinnerSocketId = null;
            if (p1_roll > p2_roll) { winnerState = state.player1; loserState = state.player2; diceWinnerSocketId = winnerState.socketId; }
            else if (p2_roll > p1_roll) { winnerState = state.player2; loserState = state.player1; diceWinnerSocketId = winnerState.socketId; }

            if (winnerState) { // Qalib var
                state.diceWinnerSocketId = diceWinnerSocketId; state.symbolPickerSocketId = diceWinnerSocketId;
                state.statusMessage = `${winnerState.username || '?'} yüksək atdı (${winnerState.roll} vs ${loserState.roll})! Simvol seçəcək...`;
                console.log(`[dice_roll_result v11] Dice winner: ${winnerState.username}. Emitting intermediate state...`);
                emitGameStateUpdate(roomId, 'dice_results_determined');
                setTimeout(() => { // Simvol seçmə fazasına gecikmə ilə keç
                    const currentRoom = rooms[roomId];
                    if (currentRoom?.gameState?.gamePhase === 'dice_roll' && currentRoom.gameState.diceWinnerSocketId === diceWinnerSocketId) {
                        currentRoom.gameState.gamePhase = 'symbol_select';
                        currentRoom.gameState.statusMessage = `${winnerState.username || '?'} simvol seçir...`;
                        console.log(`[dice_roll_result v11] Timeout finished. Switching to symbol_select.`);
                        emitGameStateUpdate(roomId, 'dice_roll_timeout_finished');
                    }
                }, 2500); // 2.5 saniyə
            } else { // Bərabərlik
                state.diceWinnerSocketId = null; state.symbolPickerSocketId = null;
                if(state.player1) state.player1.roll = null; if(state.player2) state.player2.roll = null;
                state.gamePhase = 'dice_roll'; state.statusMessage = "Bərabərlik! Zərlər təkrar atılır...";
                console.log(`[dice_roll_result v11] Dice tie.`);
                emitGameStateUpdate(roomId, 'dice_results_tie');
            }
        } else { // Biri gözlənilir
             const opponentUsername = (opponentState?.socketId && !opponentState.isDisconnected) ? opponentState.username : "Rəqib";
             state.statusMessage = `${opponentUsername}-in zər atması gözlənilir...`;
             console.log(`[dice_roll_result v11] One dice result received.`);
             emitGameStateUpdate(roomId, 'one_dice_result_received');
        }
    }); // --- 'dice_roll_result' sonu ---


   // --- Simvol seçimi (v11 - Gecikmə ilə) ---
    socket.on('symbol_choice', (data) => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
        if (!user || !currentUserSocketInfo) { return socket.emit('game_error', { message: 'İstifadəçi məlumatı tapılmadı.' }); }
        const roomId = currentUserSocketInfo.currentRoom;
        if (!roomId || !rooms[roomId]?.gameState) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
        const state = rooms[roomId].gameState;
        if (state.gamePhase !== 'symbol_select' || state.isGameOver || socketId !== state.symbolPickerSocketId) { return socket.emit('game_error', { message: 'Simvol seçimi üçün uyğun deyil.' }); }
        if (!data || (data.symbol !== 'X' && data.symbol !== 'O')) return socket.emit('game_error', { message: 'Keçərsiz simvol seçimi.' });
        console.log(`[Socket Event 6.3 - symbol_choice v11] Hadisə alındı: User=${user.nickname}, Symbol=${data.symbol}`);

        const chosenSymbol = data.symbol; const opponentSymbol = (chosenSymbol === 'X') ? 'O' : 'X';
        let pickerState = null; let opponentState = null;
        if (socketId === state.player1?.socketId) { pickerState = state.player1; opponentState = state.player2; }
        else if (socketId === state.player2?.socketId) { pickerState = state.player2; opponentState = state.player1; }
        else { return socket.emit('game_error', { message: 'Simvol seçən tapılmadı.' }); }
        if(pickerState) pickerState.symbol = chosenSymbol; if(opponentState) opponentState.symbol = opponentSymbol;

        // Oyun başlamazdan əvvəl mesajı göstər
        state.symbolPickerSocketId = null; // Seçim edildi
        state.statusMessage = `${pickerState.username || '?'} ${chosenSymbol} seçdi. ${opponentState.username || '?'} ${opponentSymbol} ilə oynayacaq.`;
        console.log(`[symbol_choice v11] Symbols assigned. Emitting intermediate state...`);
        emitGameStateUpdate(roomId, 'symbol_chosen_show_result');

        setTimeout(() => { // Oyun fazasına gecikmə ilə keç
            const currentRoom = rooms[roomId];
            if (currentRoom?.gameState?.gamePhase === 'symbol_select' && currentRoom.gameState.symbolPickerSocketId === null) {
                 currentRoom.gameState.gamePhase = 'playing';
                 currentRoom.gameState.currentPlayerSymbol = chosenSymbol; // Seçən başlayır
                 currentRoom.gameState.lastMoveTime = Date.now();
                 const currentPlayerUsername = pickerState.username;
                 currentRoom.gameState.statusMessage = `Oyun başladı! Sıra: ${currentPlayerUsername || chosenSymbol}`;
                 console.log(`[symbol_choice v11] Timeout finished. Switching to playing phase.`);
                 emitGameStateUpdate(roomId, 'symbol_choice_timeout_finished');
            }
        }, 2000); // 2 saniyə
    }); // --- 'symbol_choice' sonu ---


   // --- Oyunçu hərəkət etdikdə (v12 - Robust Info Fetch) ---
    socket.on('make_move', (data) => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
        if (!user || !currentUserSocketInfo) { return socket.emit('invalid_move', { message: 'İstifadəçi məlumatı tapılmadı.' }); }
        const roomId = currentUserSocketInfo.currentRoom;
        if (!roomId || !rooms[roomId]?.gameState) { return socket.emit('invalid_move', { message: 'Oyun tapılmadı.' }); }
        const room = rooms[roomId]; const state = room.gameState;

        // Validasiya
        if (state.gamePhase !== 'playing' || state.isGameOver) { return socket.emit('invalid_move', { message: 'Hərəkət üçün uyğun mərhələ deyil.' }); }
        let playerState = null;
        if (socketId === state.player1?.socketId && !state.player1.isDisconnected) playerState = state.player1;
        else if (socketId === state.player2?.socketId && !state.player2.isDisconnected) playerState = state.player2;
        if (!playerState || !playerState.symbol || state.currentPlayerSymbol !== playerState.symbol) { return socket.emit('invalid_move', { message: 'Sıra sizdə deyil.' }); }
        const index = data?.index;
        if (typeof index !== 'number' || index < 0 || index >= state.board.length || state.board[index] !== '') { return socket.emit('invalid_move', { message: 'Keçərsiz xana seçimi.' }); }

        console.log(`[Socket Event 6.1 - make_move v12] Hadisə alındı: User=${user.nickname}, Index=${index}`);
        const moveResult = handleMakeMoveServer(roomId, socketId, index); // Yardımçı funksiya (Part 2-də təyin edilib)
        if (moveResult) { emitGameStateUpdate(roomId, 'make_move'); }
        else { socket.emit('invalid_move', { message: 'Hərəkət qeydə alınmadı.' }); }
    }); // --- 'make_move' sonu ---


   // --- Yenidən başlatma təklifi (v12 - Robust Info Fetch) ---
    socket.on('request_restart', () => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
        if (!user || !currentUserSocketInfo) { return socket.emit('game_error', { message: 'İstifadəçi məlumatı tapılmadı.' }); }
        const roomId = currentUserSocketInfo.currentRoom;
        if (!roomId || !rooms[roomId]?.gameState) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
        const room = rooms[roomId]; const state = room.gameState;

        const player1Active = state.player1?.socketId && !state.player1.isDisconnected;
        const player2Active = state.player2?.socketId && !state.player2.isDisconnected;
        if (state.gamePhase !== 'game_over' || !player1Active || !player2Active) { return socket.emit('game_error', { message: 'Yenidən başlatma təklifi üçün uyğun deyil.' }); }
        if (state.restartRequestedBy && state.restartRequestedBy !== socketId) { return socket.emit('info_message', { message: 'Artıq başqa bir təklif var.' }); }
        if (state.restartRequestedBy === socketId) { return socket.emit('info_message', { message: 'Təklifiniz göndərilib.' }); }

        console.log(`[Socket Event 6.4 - request_restart v12] Hadisə alındı: User=${user.nickname}, RoomID=${roomId}`);
        state.restartRequestedBy = socketId; state.restartAcceptedBy = new Set([socketId]);

        const opponentSocketId = (socketId === state.player1.socketId) ? state.player2.socketId : state.player1.socketId;
        const opponentSocket = opponentSocketId ? io.sockets.sockets.get(opponentSocketId) : null;
        if (opponentSocket) {
            opponentSocket.emit('restart_requested', { username: user.nickname });
            socket.emit('info_message', { message: 'Təklif göndərildi.' });
            state.statusMessage = `${user.nickname} yenidən başlatmağı təklif edir...`;
            emitGameStateUpdate(roomId, 'restart_requested');
        } else { state.restartRequestedBy = null; state.restartAcceptedBy = new Set(); socket.emit('game_error', { message: 'Rəqib tapılmadı.' }); }
    }); // --- 'request_restart' sonu ---


   // --- Yenidən başlatma təklifini qəbul etmə (v12 - Robust Info Fetch + Dice Roll Fix) ---
    socket.on('accept_restart', () => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
        if (!user || !currentUserSocketInfo) { return socket.emit('game_error', { message: 'İstifadəçi məlumatı tapılmadı.' }); }
        const roomId = currentUserSocketInfo.currentRoom;
        if (!roomId || !rooms[roomId]?.gameState) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
        const room = rooms[roomId]; const state = room.gameState;

        if (state.gamePhase !== 'game_over' || !state.restartRequestedBy || state.restartRequestedBy === socketId) { return socket.emit('game_error', { message: 'Təklifi qəbul etmək üçün uyğun deyil.' }); }
        const player1Active = state.player1?.socketId && !state.player1.isDisconnected;
        const player2Active = state.player2?.socketId && !state.player2.isDisconnected;
        if (!player1Active || !player2Active) { state.restartRequestedBy = null; state.restartAcceptedBy = new Set(); emitGameStateUpdate(roomId, 'restart_cancelled_opponent_left'); return socket.emit('game_error', { message: 'Rəqib ayrılıb.' }); }

        console.log(`[Socket Event 6.5 - accept_restart v12] Hadisə alındı: User=${user.nickname}, RoomID=${roomId}`);
        state.restartAcceptedBy.add(socketId);

        if (state.restartAcceptedBy.size === 2) {
            console.log(`[accept_restart v12] Restart qəbul edildi. Oyun ${roomId} sıfırlanır...`);
            const newGameState = initializeGameState(room); // Sıfırla ('waiting' olacaq)
            if(newGameState){
                 newGameState.gamePhase = 'dice_roll'; // Dərhal zər atmağa keç
                 newGameState.statusMessage = "Oyunçular zər atır...";
                 emitGameStateUpdate(roomId, 'restart_accepted');
            } else { /* ... xəta ... */ }
        }
    }); // --- 'accept_restart' sonu ---


   // --- Yenidən başlatma təklifini rədd etmə (v12 - Robust Info Fetch) ---
    socket.on('decline_restart', () => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
        if (!user || !currentUserSocketInfo) { return socket.emit('game_error', { message: 'İstifadəçi məlumatı tapılmadı.' }); }
        const roomId = currentUserSocketInfo.currentRoom;
        if (!roomId || !rooms[roomId]?.gameState) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
        const room = rooms[roomId]; const state = room.gameState;

        if (state.gamePhase !== 'game_over' || !state.restartRequestedBy || state.restartRequestedBy === socketId) { return socket.emit('game_error', { message: 'Təklifi rədd etmək üçün uyğun deyil.' }); }

        console.log(`[Socket Event 6.6 - decline_restart v12] Hadisə alındı: User=${user.nickname}, RoomID=${roomId}`);
        const requesterSocketId = state.restartRequestedBy;
        state.restartRequestedBy = null; state.restartAcceptedBy = new Set();

        // Statusu əvvəlki vəziyyətə qaytar
        if (state.winnerSymbol === 'draw') { state.statusMessage = "Oyun Bərabərə!"; }
        else if (state.winnerSymbol) { const winnerState = (state.player1?.symbol === state.winnerSymbol) ? state.player1 : state.player2; state.statusMessage = `${winnerState?.username || state.winnerSymbol} Qazandı!`; }
        else { state.statusMessage = "Oyun Bitdi"; }

        // Tərəflərə bildir
        const requesterSocket = io.sockets.sockets.get(requesterSocketId);
        if (requesterSocket) { requesterSocket.emit('info_message', { message: `${user.nickname} təklifi rədd etdi.` }); }
        socket.emit('info_message', { message: 'Təklifi rədd etdiniz.' });
        emitGameStateUpdate(roomId, 'restart_declined'); // State yeniləndi
    }); // --- 'decline_restart' sonu ---


   // --- Oyun Məntiqi üçün Yardımçı Funksiya ---
   // Qeyd: Bu funksiyanın tərifi io.on('connection',...) blokunun xaricində olmalıdır (Part 2 və ya 7-də)
   // function handleMakeMoveServer(roomId, socketId, index) { ... }
/**
 * Server tərəfində hərəkəti emal edir, lövhəni yeniləyir, qalibi yoxlayır və sıranı dəyişir.
 * @param {string} roomId - Hərəkətin edildiyi otaq ID-si.
 * @param {string} socketId - Hərəkəti edən oyunçunun socket ID-si.
 * @param {number} index - Lövhədəki hərəkət indeksi.
 * @returns {boolean} - Hərəkət uğurlu oldusa true, əks halda false.
 */
function handleMakeMoveServer(roomId, socketId, index) {
    const room = rooms[roomId];
    // Keçərsiz vəziyyət yoxlaması (Otaq, GameState, Oyun fazası, Oyun bitməsi)
    if (!room || !room.gameState || room.gameState.isGameOver || room.gameState.gamePhase !== 'playing') {
        console.error(`[handleMakeMoveServer] Keçərsiz vəziyyət: Room=${!!room}, State=${!!room?.gameState}, Over=${room?.gameState?.isGameOver}, Phase=${room?.gameState?.gamePhase}`);
        return false; // Xəta baş verdi, hərəkət edilmədi
    }

    const state = room.gameState;
    // Hərəkət edən oyunçunun state-ini tap (aktiv olduğunu yoxla)
    const playerState = (socketId === state.player1?.socketId && !state.player1.isDisconnected) ? state.player1
                     : (socketId === state.player2?.socketId && !state.player2.isDisconnected) ? state.player2
                     : null;

    // Keçərsiz hərəkət yoxlamaları (Oyunçu tapılmadı, Sıra onda deyil, Xana dolu)
    if (!playerState || !playerState.symbol || state.currentPlayerSymbol !== playerState.symbol || index < 0 || index >= state.board.length || state.board[index] !== '') {
         console.error(`[handleMakeMoveServer] Keçərsiz hərəkət cəhdi: Player=${playerState?.username}, Symbol=${playerState?.symbol}, Current=${state.currentPlayerSymbol}, Index=${index}, BoardVal=${state.board?.[index]}`);
         return false; // Hərəkət keçərsizdir
    }

    // Hərəkəti et
    console.log(`[handleMakeMoveServer] Making move for ${playerState.username} at index ${index}`);
    state.board[index] = playerState.symbol;
    state.lastMoveTime = Date.now(); // Son hərəkət vaxtını yenilə (hərəkətsizlik taymeri üçün lazım olacaq)

    // Qalibiyyət və ya bərabərlik yoxlaması
    if (checkWinServer(room, playerState.symbol)) { // checkWinServer Part 2-də təyin edilib
        state.isGameOver = true;
        state.winnerSymbol = playerState.symbol;
        state.gamePhase = 'game_over';
        state.statusMessage = `${playerState.username || playerState.symbol} Qazandı!`;
        state.restartRequestedBy = null; state.restartAcceptedBy = new Set(); // Restartı sıfırla
        console.log(`[handleMakeMoveServer] Oyun bitdi. Qalib: ${playerState.username} (${playerState.symbol}) Room: ${roomId}`);
    } else if (!state.board.includes('')) { // Bərabərlik (Boş xana qalmayıbsa)
        state.isGameOver = true;
        state.winnerSymbol = 'draw';
        state.gamePhase = 'game_over';
        state.statusMessage = "Oyun Bərabərə!";
        state.restartRequestedBy = null; state.restartAcceptedBy = new Set(); // Restartı sıfırla
        console.log(`[handleMakeMoveServer] Oyun bərabərə bitdi. Room: ${roomId}`);
    } else {
        // Oyun davam edir, sıranı dəyiş
        switchTurnServer(room); // switchTurnServer Part 2-də təyin edilib
        const nextPlayerState = (state.currentPlayerSymbol === state.player1?.symbol) ? state.player1 : state.player2;
        // Növbəti oyunçunun aktiv olub olmadığını yoxla (disconnect ola bilər)
        const nextPlayerActive = nextPlayerState?.socketId && !nextPlayerState.isDisconnected;
        state.statusMessage = nextPlayerActive
             ? `Sıra: ${nextPlayerState.username || state.currentPlayerSymbol}`
             : `Sıra: ${nextPlayerState?.username || state.currentPlayerSymbol || '?'} (Gözlənilir...)`; // Əgər rəqib disconnect olubsa
    }
    return true; // Hərəkət uğurlu oldu
}

console.log('--- Part 6/7 Tamamlandı (io.on("connection") bloku hələ də açıqdır) ---');
// ==============================
// ===== PART 6/7 SONU ==========
// ==============================

// === Növbəti hissə (Part 7) bu blokun içinə əlavə olunacaq ===
// =============================================================================
    // ===== Part 7/7: Socket.IO Disconnect/Leave Handling & Server Start/Stop =====
    // =============================================================================
    // Bu kod io.on('connection', (socket) => { ... }); bloku içərisindədir!

    // --- Otaqdan aktiv ayrılma (v3 - Broadcast Sonda, v12 Robust Info) ---
    socket.on('leave_room', () => {
        const socketId = socket.id;
        const currentUserSocketInfo = users[socketId];
        // <<< Robust Info Fetch >>>
        const user = currentUserSocketInfo ? { id: currentUserSocketInfo.userId, nickname: currentUserSocketInfo.username } : null;
        if (!user || !currentUserSocketInfo) { console.error(`[leave_room v12] Kritik xəta: User info yoxdur. Socket: ${socketId}`); socket.disconnect(true); return; }
        const username = user.nickname; const userId = user.userId; const roomId = currentUserSocketInfo.currentRoom;
        // <<< Robust Info Fetch Sonu >>>

        console.log(`[Socket Event 5.3 - leave_room V3] Explicit leave request: User=${username}, RoomID=${roomId}`);

        // Qlobal users-dən sil
        removeUserGlobally(socketId);

        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            // room.players-dən sil (broadcast etmir)
            removePlayerFromRoomArray(room, socketId);

            let gameStateNeedsUpdate = false;
            if (room.gameState) {
                const { playerState, opponentState } = findPlayerStates(room.gameState, userId);
                if (playerState) { // Oyunçu state-də idisə
                    console.log(`[leave_room v3] Permanently removing ${username} from gameState.`);
                    // Slotu tamamilə sıfırla
                    Object.assign(playerState, { socketId: null, userId: null, username: null, isDisconnected: false, disconnectTime: null, symbol: null, roll: null });
                    gameStateNeedsUpdate = true;
                    if (room.gameState.restartRequestedBy) { room.gameState.restartRequestedBy = null; room.gameState.restartAcceptedBy = new Set(); }
                    // Rəqibə bildir və gözləməyə qaytar
                    const opponentSocket = opponentState?.socketId ? io.sockets.sockets.get(opponentState.socketId) : null;
                    if (opponentSocket) {
                        opponentSocket.emit('opponent_left_game', { username: username, reconnecting: false });
                        if (room.gameState.gamePhase !== 'game_over') {
                            room.gameState.gamePhase = 'waiting'; room.gameState.statusMessage = "Rəqib ayrıldı. Yeni rəqib gözlənilir...";
                            // Oyun məlumatlarını sıfırla
                            room.gameState.board = Array(room.gameState.boardSize * room.gameState.boardSize).fill('');
                            if(room.gameState.player1) { room.gameState.player1.roll = null; room.gameState.player1.symbol = null; }
                            if(room.gameState.player2) { room.gameState.player2.roll = null; room.gameState.player2.symbol = null; }
                            room.gameState.currentPlayerSymbol = null; room.gameState.diceWinnerSocketId = null; room.gameState.symbolPickerSocketId = null;
                            room.gameState.winningCombination = []; room.gameState.isGameOver = false; room.gameState.winnerSymbol = null;
                        }
                    }
                }
            }
            handleRoomCleanupAndCreator(room, username); // Otaq vəziyyətini yoxla

            // ---- Broadcast və Emit sonda ----
            if (gameStateNeedsUpdate && room.gameState && room.players.length > 0) {
                 emitGameStateUpdate(roomId, 'player_explicit_leave'); // Qalanlara state göndər
            }
            broadcastRoomList(); // Sonra lobbini yenilə
            // ---- Broadcast və Emit Sonu ----
        } else {
            console.log(`[leave_room v3] User ${username} was not in a room.`);
            broadcastRoomList(); // Ehtiyat üçün lobbini yenilə
        }

        if(roomId) socket.leave(roomId);
        if(currentUserSocketInfo) currentUserSocketInfo.currentRoom = null; // users[]-dan otağı təmizlə
        socket.disconnect(true); // Bağlantını kəs
    }); // --- 'leave_room' sonu ---


   // --- Bağlantı kəsilməsi ---
    socket.on('disconnect', (reason) => {
        // user məlumatını users[]-dan götürməyə çalışaq
        const userInfo = users[socket.id]; // socket.user yerinə
        console.log(`[Socket Disconnect v12] User: ${userInfo?.username || socket.id} disconnected. Reason: ${reason}`);
        // Ümumi funksiyanı çağır
        handleDisconnectOrLeave(socket, reason);
    }); // --- 'disconnect' sonu ---


}); // <<<--- io.on('connection', ...) BLOKU BURADA BAĞLANIR --- <<<


// ============================================================================
// ===== Bağlantı Kəsilmə/Ayrılma üçün Əsas və Yardımçı Funksiyalar =========
// ============================================================================
// Qeyd: Bu funksiyalar io.on('connection',...) blokunun XARİCİNDƏ yerləşməlidir.

// io.on('connection',...) BLOKUNUN XARİCİNDƏ

/**
 * Bağlantı kəsilməsini idarə edən əsas funksiya (v9 - Update Call Fix)
 * @param {object} socketInstance - Ayrılan socket obyekti.
 * @param {string} reason - Ayrılma səbəbi.
 */
function handleDisconnectOrLeave(socketInstance, reason = 'disconnect') {
    const socketId = socketInstance.id;
    const leavingUserInfo = getUserInfoForDisconnect(socketInstance);
    if (!leavingUserInfo) { delete users[socketId]; return; }

    const { username, userId, roomId } = leavingUserInfo;
    console.log(`[handleDisconnectOrLeave v9] Processing: User=${username}, Room=${roomId || 'N/A'}, Reason=${reason}`);

    removeUserGlobally(socketId);

    if (!roomId || !rooms[roomId]) {
        console.log(`[handleDisconnectOrLeave v9] User ${username} was not in a valid room.`);
        broadcastRoomList(); // Otaqda olmasa da user sayı dəyişə bilər, lobbini yenilə
        return;
    }
    const room = rooms[roomId];
    const playerRemovedFromArray = removePlayerFromRoomArray(room, socketId); // Broadcast etmir

    let gameStateChanged = false;
    if (room.gameState) {
        const { playerState, opponentState } = findPlayerStates(room.gameState, userId);

        // ----- DƏYİŞİKLİK BURADA -----
        // Explicit leave deyilsə VƏ playerState tapılıbsa, həmişə update-i çağır
        if (reason !== 'leave_room_request' && playerState) {
             // updateGameStateOnLeave funksiyası fazaya görə düzgün əməliyyatı seçəcək
             // (waiting/game_over üçün socketId-ni null edəcək, playing vs. üçün isDisconnected edəcək)
            gameStateChanged = updateGameStateOnLeave(room, playerState, opponentState, username, userId, reason);
        } else if (reason !== 'leave_room_request') {
            console.log(`[handleDisconnectOrLeave v9] Player ${username} not found in gameState for room ${roomId} during disconnect reason: ${reason}.`);
        }
         // Explicit leave hallarını 'leave_room' handler-i idarə edir.
         // ----- DƏYİŞİKLİK SONU -----
    }

    handleRoomCleanupAndCreator(room, username);

    let activePlayerCountInState = 0;
    if (room.gameState?.player1?.socketId && !room.gameState.player1.isDisconnected) activePlayerCountInState++;
    if (room.gameState?.player2?.socketId && !room.gameState.player2.isDisconnected) activePlayerCountInState++;

    if (gameStateChanged && room.gameState && activePlayerCountInState > 0) {
        emitGameStateUpdate(roomId, `player_${reason}_state_update`);
    }
    // Lobbini həmişə yenilə (əgər players[] dəyişibsə və ya state dəyişibsə)
    if (playerRemovedFromArray || gameStateChanged) {
        broadcastRoomList();
    }
}

// --- Yardımçı: User Info Alma ---
function getUserInfoForDisconnect(socketInstance) {
   const socketId = socketInstance.id;
   // Əvvəlcə users[] obyektindən axtar
   const userInfoFromMap = users[socketId];
   if (userInfoFromMap) {
        // console.log(`[getUserInfoForDisconnect] Info found in users map for ${socketId}`);
        return { ...userInfoFromMap }; // Kopyasını qaytar
   }
   // Əgər users[]-da yoxdursa (çox nadir hal), socket.user-ə baxaq
   const userInfoFromSocket = socketInstance.user;
   if(userInfoFromSocket && userInfoFromSocket.id && userInfoFromSocket.nickname) {
       console.warn(`[getUserInfoForDisconnect] Info not in users map, using socket.user for ${socketId}`);
        // users[]-dakı currentRoom məlumatı itəcək, buna diqqət!
        return {
            username: userInfoFromSocket.nickname,
            userId: userInfoFromSocket.id,
            roomId: null, // currentRoom məlumatı burada yoxdur!
            socketId: socketId
        };
   }
   // console.log(`[getUserInfoForDisconnect] No user info found for socket ${socketId}`);
   return null;
}

// --- Yardımçı: Qlobal User Silmə ---
function removeUserGlobally(socketId) {
   if (users[socketId]) {
       // console.log(`[Helper Fn] Removing socket ${socketId} from global users object.`);
       delete users[socketId];
   }
}

// --- Yardımçı: Oyunçunu Otaq Massivindən Silmə (v11 - broadcast çıxarıldı) ---
function removePlayerFromRoomArray(room, socketId) {
   const playerIndex = room.players.indexOf(socketId);
   if (playerIndex > -1) {
       room.players.splice(playerIndex, 1);
       console.log(`[Helper Fn v11] Socket ${socketId} removed from room.players for room ${room.id}. Left: ${room.players.length}`);
       // broadcastRoomList(); // <<<--- SİLİNDİ/ŞƏRHƏ ALINDI ---<<<
       return true;
   }
   return false;
}

// --- Yardımçı: Player State-ləri Tapma ---
function findPlayerStates(gameState, userId) {
   let playerState = null, opponentState = null;
   if (!gameState || !userId) return { playerState, opponentState };
   if (gameState.player1?.userId === userId) { playerState = gameState.player1; opponentState = gameState.player2; }
   else if (gameState.player2?.userId === userId) { playerState = gameState.player2; opponentState = gameState.player1; }
   return { playerState, opponentState };
}

// --- Yardımçı: Gözlənilməz Ayrılmada GameState Yeniləmə (v9 - Status Fix & Restart Reset) ---
// io.on('connection',...) BLOKUNUN XARİCİNDƏ

/**
 * Addım 4b: Oyunçunun GÖZLƏNİLMƏZ ayrılmasına görə gameState-i yeniləyir (v10 - Waiting Phase Fix)
 */
function updateGameStateOnLeave(room, playerState, opponentState, username, userId, reason) {
    if (reason === 'leave_room_request') { return false; } // Explicit leave burada idarə olunmur

    const state = room.gameState;
    let stateChanged = false;

    // Restart Təklifini Ləğv Etmə
    if (state.restartRequestedBy) {
        console.log(`[Helper Fn Update v10] Disconnect during restart request. Cancelling request.`);
        state.restartRequestedBy = null; state.restartAcceptedBy = new Set();
        stateChanged = true;
    }

    // Oyun davam edirsə (playing, dice_roll, symbol_select)
    if (state.gamePhase !== 'game_over' && state.gamePhase !== 'waiting') {
        if (!playerState.isDisconnected) { // Yalnız əgər artıq disconnected deyilsə
            console.log(`[Helper Fn Update v10] Player ${username} UNEXPECTEDLY left during '${state.gamePhase}'. Marking as disconnected.`);
            playerState.isDisconnected = true; playerState.disconnectTime = Date.now(); playerState.socketId = null;
            stateChanged = true;
            const opponentSocket = opponentState?.socketId ? io.sockets.sockets.get(opponentState.socketId) : null;
            if (opponentSocket) {
                state.statusMessage = `${username} bağlantısı kəsildi, yenidən qoşulması gözlənilir...`;
                console.log(`[Helper Fn Update v10] Phase remains '${state.gamePhase}', status updated.`);
                opponentSocket.emit('opponent_left_game', { username: username, reconnecting: true });
            } else {
                console.log(`[Helper Fn Update v10] Opponent also not present. Setting phase to 'waiting'.`);
                state.gamePhase = 'waiting'; state.statusMessage = 'Rəqib gözlənilir...';
            }
            startReconnectTimer(userId, room.id, username);
        }
    }
    // Oyun bitmişdi və ya GÖZLƏMƏ fazası
    else {
        // ---- DƏYİŞİKLİK BURADA ----
        // Waiting fazasında qalıcı silmə etmə, sadəcə socketId-ni null et
        if (playerState.socketId === socketInstance.id) { // Yalnız ayrılan socket bu oyunçuya aid idisə
             console.log(`[Helper Fn Update v10] Player ${username} left during '${state.gamePhase}'. Clearing socketId.`);
             playerState.socketId = null; // Socket ID-ni təmizlə
             // isDisconnected false qalır, çünki taymer yoxdur
             // userId və username qalır ki, qayıdanda tanınsın
             stateChanged = true;

             const opponentSocket = opponentState?.socketId ? io.sockets.sockets.get(opponentState.socketId) : null;
             if (opponentSocket) {
                 // Waiting fazasında rəqibə bildirməyə ehtiyac yoxdur? Yoxsa var?
                 opponentSocket.emit('opponent_left_game', { username: username, reconnecting: false }); // Qalıcı ayrıldı kimi göstərək?
                 if (state.gamePhase === 'waiting') { state.statusMessage = "Rəqib ayrıldı. Yeni rəqib gözlənilir..."; }
             }
        }
        // ---- DƏYİŞİKLİK SONU ----
    }
    return stateChanged;
}
// --- Yardımçı: Otaq Təmizləmə/Yaradan Yoxlama ---
function handleRoomCleanupAndCreator(room, leavingUsername) {
   // Aktiv oyunçu sayını hesabla
   let activePlayerCountInState = 0;
   if (room.gameState?.player1?.socketId && !room.gameState.player1.isDisconnected) activePlayerCountInState++;
   if (room.gameState?.player2?.socketId && !room.gameState.player2.isDisconnected) activePlayerCountInState++;

   // Otaq tamamilə boşdursa (həm players[] həm də aktiv state)
   if (activePlayerCountInState === 0 && room.players.length === 0) {
       if (!roomCleanupTimers[room.id]) { // Yalnız əgər timer artıq qurulmayıbsa
           startRoomCleanupTimer(room.id, room.name); // Yardımçı funksiya
       }
   }
   // Yaradan ayrılıbsa və 1 nəfər aktiv qalıbsa
   else if (activePlayerCountInState === 1 && room.creatorUsername === leavingUsername && room.gameState) {
       const remainingPlayerState = (room.gameState.player1?.socketId && !room.gameState.player1.isDisconnected) ? room.gameState.player1 : room.gameState.player2;
       if (remainingPlayerState && remainingPlayerState.username) {
           room.creatorUsername = remainingPlayerState.username; // Yaradanı dəyişdir
           console.log(`[Helper Fn] Otaq ${room.id} yaradanı '${room.creatorUsername}'-ə dəyişdi.`);
           broadcastRoomList(); // Yaradan dəyişdiyi üçün lobbini yenilə
       }
   }
}

// --- Yardımçı: Yenidən Qoşulma Taymeri ---
function startReconnectTimer(disconnectedUserId, roomId, username) {
   const room = rooms[roomId];
   if (!room) return;
   if (!room.disconnectTimers) room.disconnectTimers = {}; // Obyekti yarat (əgər yoxdursa)

   // Köhnə taymeri ləğv et (hər ehtimala qarşı)
   if (room.disconnectTimers[disconnectedUserId]) {
       clearTimeout(room.disconnectTimers[disconnectedUserId]);
       console.log(`[Reconnect Timer] Cleared existing timer for User ${username} (ID: ${disconnectedUserId})`);
   }

   console.log(`[Reconnect Timer] Starting ${RECONNECT_TIMEOUT_MS / 1000}s timer for User ${username} (ID: ${disconnectedUserId}) in room ${roomId}.`);

   const timerId = setTimeout(() => {
       console.log(`[Reconnect Timeout] Timeout expired for User ${username} (ID: ${disconnectedUserId}) in room ${roomId}.`);
       const currentRoom = rooms[roomId]; // Timeout anında otağı yenidən yoxla
       let wasStateChanged = false;
       if (currentRoom?.gameState) {
           const state = currentRoom.gameState;
           const { playerState, opponentState } = findPlayerStates(state, disconnectedUserId);

           if (playerState && playerState.isDisconnected) { // Hələ də qayıtmayıbsa
               console.log(`[Reconnect Timeout] Player ${username} did not reconnect. Removing permanently.`);
               // Oyunçunu qalıcı olaraq sil
               Object.assign(playerState, { socketId: null, userId: null, username: null, isDisconnected: false, disconnectTime: null, symbol: null, roll: null });
               wasStateChanged = true;

               // Restart təklifini ləğv et (əgər varsa)
               if (state.restartRequestedBy) { state.restartRequestedBy = null; state.restartAcceptedBy = new Set(); }

               const opponentSocket = opponentState?.socketId ? io.sockets.sockets.get(opponentState.socketId) : null;
               if (opponentSocket) { // Rəqib hələ də otaqdadırsa
                    opponentSocket.emit('opponent_left_game', { username: username, reconnecting: false });
                    if (state.gamePhase !== 'game_over'){
                        state.gamePhase = 'waiting'; // Gözləməyə qaytar
                        state.statusMessage = `${username} yenidən qoşulmadı. Yeni rəqib gözlənilir...`;
                        // Sıfırlama
                        state.board = Array(state.boardSize * state.boardSize).fill('');
                        if(state.player1) { state.player1.roll = null; state.player1.symbol = null; }
                        if(state.player2) { state.player2.roll = null; state.player2.symbol = null; }
                        state.currentPlayerSymbol = null; state.diceWinnerSocketId = null; state.symbolPickerSocketId = null;
                        state.winningCombination = []; state.isGameOver = false; state.winnerSymbol = null;
                    } else { // Oyun bitmişdi
                        state.statusMessage = `${username} yenidən qoşulmadı.`;
                    }
                    // emitGameStateUpdate(roomId, 'reconnect_timeout_player_removed'); // Sonda edilir
               } else {
                    console.log(`[Reconnect Timeout] Room ${roomId} is now empty.`);
                    startRoomCleanupTimer(roomId, currentRoom.name);
               }
                broadcastRoomList(); // Oyunçu sayı dəyişdi
           }
       }
       // Taymeri otaq obyektindən sil
       if (currentRoom?.disconnectTimers) {
           delete currentRoom.disconnectTimers[disconnectedUserId];
       }
       // Əgər state dəyişibsə və kimsə qalıbsa, update göndər
       if (wasStateChanged && currentRoom?.gameState && currentRoom.players.length > 0){
            emitGameStateUpdate(roomId, 'reconnect_timeout_processed');
       }

   }, RECONNECT_TIMEOUT_MS);

   // Taymeri otaq obyektində saxla
   room.disconnectTimers[disconnectedUserId] = timerId;
}

// --- Yardımçı: Otaq Təmizləmə Taymeri ---
function startRoomCleanupTimer(roomId, roomName) {
   if (roomCleanupTimers[roomId]) { clearTimeout(roomCleanupTimers[roomId]); } // Köhnəni sil
   console.log(`[Room Cleanup] Starting ${ROOM_CLEANUP_DELAY_MS / 60000} min timer for empty room ${roomId} ('${roomName}').`);
   roomCleanupTimers[roomId] = setTimeout(() => {
       const roomToCheck = rooms[roomId];
       let isActivePlayer = false;
       if(roomToCheck?.gameState?.player1?.socketId && !roomToCheck.gameState.player1.isDisconnected) isActivePlayer = true;
       if(roomToCheck?.gameState?.player2?.socketId && !roomToCheck.gameState.player2.isDisconnected) isActivePlayer = true;

       // Otaq hələ də mövcuddursa VƏ içində heç kim yoxdursa (həm players[] həm də aktiv state)
       if (roomToCheck && roomToCheck.players.length === 0 && !isActivePlayer) {
           console.log(`[Room Cleanup] Timer expired. Deleting empty room ${roomId} ('${roomName}').`);
           delete rooms[roomId];
           broadcastRoomList();
       } else {
            console.log(`[Room Cleanup] Timer expired for room ${roomId}, but it's no longer empty or doesn't exist. Cleanup cancelled.`);
       }
       delete roomCleanupTimers[roomId];
   }, ROOM_CLEANUP_DELAY_MS);
}

// =======================================================
// ===== Server Start & Stop ============================
// =======================================================
console.log('[Setup 7.7] Serverin başladılması məntiqi...'); // (Başlıqdakı nömrəni düzəltdim)
const PORT = process.env.PORT || 8080; // Portu mühit dəyişənindən və ya default 8080 götürür (Bu sizdə düzgün idi)
console.log(`[Server Start 7.7] server.listen(${PORT}, '0.0.0.0') çağırılır...`); // Log mesajına '0.0.0.0' əlavə etdim

// === DƏYİŞİKLİK BURADADIR ===
server.listen(PORT, '0.0.0.0', () => { // <<<--- İkinci arqument olaraq '0.0.0.0' əlavə edildi!
    // ============================
     const startTime = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
     console.log('=====================================================================');
     console.log(`---- Multiplayer Server (Yekun v1) ${PORT} portunda işə düşdü! ----`);
     console.log(`---- Server Başlama Zamanı: ${startTime} ----`);
     broadcastRoomList(); // İlkin otaq siyahısını yayımla
     console.log('=====================================================================');
    });

    server.on('error', (error) => {
           console.error(`[Server Start 7.7] server.listen XƏTASI: Port ${PORT} problemi!`, error);
           if (error.code === 'EADDRINUSE') { console.error(`XƏTA: Port ${PORT} artıq istifadə olunur.`); }
           process.exit(1);
        });

// --- Səliqəli Dayandırma ---
function gracefulShutdown(signal) {
   console.warn(`\n[Shutdown 7.7] ${signal} siqnalı alındı. Server bağlanır...`);
   server.close((err) => {
       if (err) console.error("[Shutdown 7.7] HTTP server bağlanarkən xəta:", err);
       else console.log('[Shutdown 7.7] HTTP server yeni bağlantıları qəbul etmir.');

       io.close(() => {
           console.log('[Shutdown 7.7] Bütün Socket.IO bağlantıları bağlandı.');
           pool.end((dbErr) => {
               if (dbErr) console.error("[Shutdown 7.7] DB pool bağlanarkən xəta:", dbErr);
               else console.log('[Shutdown 7.7] DB pool uğurla bağlandı.');
               console.warn(`[Shutdown 7.7] Server dayandırıldı (${signal}).`);
               process.exit(err || dbErr ? 1 : 0);
           });
       });
   });
   // Müəyyən vaxtdan sonra məcburi çıxış
   setTimeout(() => { console.error('[Shutdown 7.7] Shutdown prosesi çox uzun çəkdi! Məcburi çıxış.'); process.exit(1); }, 10000); // 10 saniyə
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error, origin) => { console.error('[FATAL ERROR] Uncaught Exception:', error, 'Origin:', origin); gracefulShutdown('uncaughtException'); });
process.on('unhandledRejection', (reason, promise) => { console.error('[FATAL ERROR] Unhandled Rejection at:', promise, 'reason:', reason); gracefulShutdown('unhandledRejection'); });


console.log('--- server_multi.js Faylı Tamamlandı (Yekun v1) ---');
// ============================================
// ===== server_multi.js FAYLININ SONU ======
// ============================================