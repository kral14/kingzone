// server/server_multi.js (Orijinal Məntiq + Redis İnteqrasiyası - CommonJS)

// ---- Əsas Modulların Import Edilməsi (CommonJS) ----
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const crypto = require('crypto');
const { createClient } = require('redis'); // Redis klienti
const { createAdapter } = require('@socket.io/redis-adapter'); // Redis adapteri

// ---- Sabitlər ----
const saltRounds = 10;
const RECONNECT_TIMEOUT_MS = 30 * 1000; // 30 saniyə
const ROOM_CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 dəqiqə (Redis EXPIRE ilə idarə olunacaq)

console.log("===============================================================");
console.log("--- Multiplayer Server (Original Logic + Redis) Başladılır ---");
console.log(`--- Reconnect Timeout: ${RECONNECT_TIMEOUT_MS / 1000}s ---`);
console.log("===============================================================");

// ---- Express və Socket.IO ----
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:8080", // Client URL .env-dən
        methods: ["GET", "POST"],
        credentials: true
    },
    pingInterval: 10000,
    pingTimeout: 15000
});
console.log(`[Setup] Express, HTTP, Socket.IO yaradıldı. CORS Origin: ${process.env.CLIENT_URL || "http://localhost:8080"}`);

// ---- Redis Setup ----
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`[Setup] Redis üçün qoşulur: ${redisUrl}`);
const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();
let isRedisConnected = false; // Redis bağlantı statusunu izləmək üçün

pubClient.on('error', (err) => console.error('[Redis ERROR] Pub Client Error:', err));
subClient.on('error', (err) => console.error('[Redis ERROR] Sub Client Error:', err));
pubClient.on('connect', () => console.log('[Redis OK] Pub Client qoşuldu.'));
subClient.on('connect', () => console.log('[Redis OK] Sub Client qoşuldu.'));
pubClient.on('ready', () => { console.log('[Redis OK] Pub Client hazırdır.'); checkRedisReady(); });
subClient.on('ready', () => { console.log('[Redis OK] Sub Client hazırdır.'); checkRedisReady(); });

function checkRedisReady() {
    if (pubClient.isReady && subClient.isReady && !isRedisConnected) {
        isRedisConnected = true;
        console.log('✅✅✅ Pub/Sub Redis klientləri qoşuldu və hazırdır.');
        // Adapteri Redis hazır olduqdan sonra quraşdır
        io.adapter(createAdapter(pubClient, subClient));
        console.log('✅ Socket.IO Redis adapteri konfiqurasiya edildi.');
    }
}

// ---- PostgreSQL ----
if (!process.env.DATABASE_URL) { throw new Error('DATABASE_URL tapılmadı!'); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
console.log('[Setup] PostgreSQL connection pool yaradıldı.');

async function testDBConnection() { // DB testini asinxron et
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log(`---- [DB Check OK] Qoşuldu: ${new Date(result.rows[0].now).toISOString()} ----`);
    } catch (err) {
        console.error('[FATAL ERROR] Verilənlər bazasına qoşulma xətası!', err.stack);
        process.exit(1);
    } finally {
        if (client) client.release();
    }
}
// DB testini Redis bağlantısından sonra çağıracağıq

// ---- Session Middleware ----
if (!process.env.SESSION_SECRET) { throw new Error('SESSION_SECRET tapılmadı!'); }
const sessionMiddleware = session({
    store: new pgSession({ pool: pool, tableName: 'user_sessions', pruneSessionInterval: 60 * 15 }),
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
console.log('[Setup] Session middleware (pgSession ilə) konfiqurasiya edildi.');

// ---- Digər Express Middleware-lər ----
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Lazım olarsa
// Sorğu Loglama
app.use((req, res, next) => {
    if (req.headers.upgrade === 'websocket' || (req.url.includes('.') && !req.url.endsWith('.html'))) return next();
    const userNickname = req.session?.user?.nickname || 'Anonymous';
    console.log(`[HTTP Request] ${req.method} ${req.originalUrl} (User: ${userNickname})`);
    next();
});
// Statik Fayllar
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath));
console.log('[Setup] Middleware-lər (JSON, Log, Static) tətbiq edildi.');

// ----- Helper Functions (Redis ilə adaptasiya olunmuş) -----

// Otaq ID yaratmaq
function generateRoomId() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Redis-dən otaq məlumatlarını almaq (əsas məlumatlar + gameState JSON)
async function getRoomDataFromRedis(roomId) {
    try {
        const roomKey = `room:${roomId}`;
        // Hash-dan bütün sahələri alırıq (gameState JSON string kimi gələcək)
        const roomData = await pubClient.hGetAll(roomKey);
        if (Object.keys(roomData).length === 0) return null; // Otaq yoxdur

        // GameState JSON-u parse edirik
        if (roomData.gameState) {
            try {
                roomData.gameState = JSON.parse(roomData.gameState);
            } catch (parseError) {
                console.error(`[Redis ERROR] Otaq ${roomId} üçün gameState parse edilə bilmədi:`, parseError, "JSON:", roomData.gameState);
                roomData.gameState = null; // Parse xətası olarsa null edək
            }
        } else {
             console.warn(`[Redis WARN] Otaq ${roomId} üçün gameState Redis-də tapılmadı.`);
             roomData.gameState = null;
        }
         // Oyunçu socket ID-lərini əlavə edək
         roomData.players = await pubClient.sMembers(`room:${roomId}:players`);

        return roomData;
    } catch (error) {
        console.error(`[Redis ERROR] Otaq ${roomId} məlumatları alınarkən xəta:`, error);
        return null;
    }
}

// GameState-i Redis-də yeniləmək
async function saveGameStateToRedis(roomId, gameState) {
    try {
        if (!gameState) {
             console.warn(`[Redis WARN] Boş gameState otaq ${roomId} üçün saxlanılmağa cəhd edildi.`);
             return false;
        }
        const roomKey = `room:${roomId}`;
        const gameStateJson = JSON.stringify(gameState);
        await pubClient.hSet(roomKey, 'gameState', gameStateJson);
        return true;
    } catch (error) {
        console.error(`[Redis ERROR] Otaq ${roomId} üçün gameState saxlanılarkən xəta:`, error);
        return false;
    }
}

// Otaq siyahısını Redis-dən alıb formatlayıb yayımlamaq
async function broadcastRoomListRedis() {
    try {
        const roomKeys = await pubClient.sMembers('activeRooms');
        const roomListForClients = [];

        for (const roomKey of roomKeys) {
            const roomId = roomKey.substring(5); // "room:" prefiksini sil
            // Əsas məlumatları (name, password, size, creator) alaq
             const basicData = await pubClient.hmGet(roomKey, ['id', 'name', 'password', 'boardSize', 'creatorUsername']);
             const roomData = {
                 id: basicData[0] || roomId,
                 name: basicData[1] || `Otaq ${roomId.substring(0,4)}`,
                 hasPassword: !!basicData[2],
                 boardSize: parseInt(basicData[3] || '3', 10),
                 creatorUsername: basicData[4] || 'Bilinməyən'
             };

            // Oyunçu sayını və adlarını gameState-dən hesablamaq üçün gameState-i alaq
             const gameStateJson = await pubClient.hGet(roomKey, 'gameState');
             let activePlayerCount = 0;
             let p1Username = null;
             let p2Username = null;
             if (gameStateJson) {
                 try {
                     const gameState = JSON.parse(gameStateJson);
                     const p1 = gameState?.player1;
                     const p2 = gameState?.player2;
                     if (p1?.socketId && !p1.isDisconnected) { activePlayerCount++; p1Username = p1.username; }
                     if (p2?.socketId && !p2.isDisconnected) { activePlayerCount++; p2Username = p2.username; }
                 } catch (e) { console.error(`[broadcastRoomListRedis] Room ${roomId} gameState parse xətası`); }
             } else {
                 // GameState yoxdursa, oyunçu sayını players set-indən götürək (təxmini)
                 activePlayerCount = await pubClient.sCard(`room:${roomId}:players`);
             }

            roomListForClients.push({
                ...roomData,
                playerCount: activePlayerCount,
                player1Username: p1Username,
                player2Username: p2Username,
                isAiRoom: false // AI hələ yoxdur
            });
        }

        // console.log(`[Broadcast] Redis otaq siyahısı yeniləndi (${roomListForClients.length} otaq).`);
        io.emit('room_list_update', roomListForClients);
    } catch (error) {
        console.error("[Broadcast ERROR] Redis otaq siyahısı göndərilərkən XƏTA:", error);
        io.emit('room_list_update', []);
    }
}

// Socket üçün user məlumatlarını (sessiyadan alınmış) saxlamaq/almaq üçün Redis açarı
function getUserInfoKey(socketId) { return `socket:${socketId}:userInfo`; }
function getSocketRoomKey(socketId) { return `socket:${socketId}:room`; }
function getRoomKey(roomId) { return `room:${roomId}`; }
function getRoomPlayersKey(roomId) { return `room:${roomId}:players`; }
function getRoomDisconnectTimerKey(roomId, userId) { return `room:${roomId}:disconnectTimer:${userId}`; } // User ID ilə timer açarı

// ----- Oyun Məntiqi Funksiyaları (Orijinaldan götürülmüş, gameState parametri ilə işləyir) -----

function initializeGameState(boardSize = 3, player1Info = null, player2Info = null) {
    const initialPlayerState = (socketInfo) => ({
        socketId: socketInfo?.id || null,
        userId: socketInfo?.userId || null,
        username: socketInfo?.username || null,
        symbol: null, roll: null, isDisconnected: false, disconnectTime: null
    });

    return {
        board: Array(boardSize * boardSize).fill(''), boardSize: boardSize,
        gamePhase: 'waiting', currentPlayerSymbol: null,
        player1: initialPlayerState(player1Info), player2: initialPlayerState(player2Info),
        diceWinnerSocketId: null, symbolPickerSocketId: null, isGameOver: false, winnerSymbol: null,
        winningCombination: [], statusMessage: "İkinci oyunçu gözlənilir...", lastMoveTime: null,
        restartRequestedBy: null, restartAcceptedBy: [] // Orijinal kodda Set idi, JSON üçün massiv edək
    };
}

function generateWinConditions(size) {
     const lines = []; const n = size; const winLength = size >= 5 ? 4 : 3;
     if (winLength > n) return [];
     for (let r = 0; r < n; r++) { for (let c = 0; c <= n - winLength; c++) { lines.push(Array.from({ length: winLength }, (_, i) => r * n + c + i)); } }
     for (let c = 0; c < n; c++) { for (let r = 0; r <= n - winLength; r++) { lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + c)); } }
     for (let r = 0; r <= n - winLength; r++) { for (let c = 0; c <= n - winLength; c++) { lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + (c + i))); } }
     for (let r = 0; r <= n - winLength; r++) { for (let c = winLength - 1; c < n; c++) { lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + (c - i))); } }
     return lines;
}

// checkWinServer indi gameState-i parametr kimi alır
function checkWinServer(gameState, playerSymbolToCheck) {
    if (!gameState?.board || !playerSymbolToCheck) return false;
    const board = gameState.board; const size = gameState.boardSize;
    gameState.winningCombination = []; // Sıfırla
    const winConditions = generateWinConditions(size);
    if (winConditions.length === 0 && size > 0) return false;
    for (const condition of winConditions) {
        if (board[condition[0]] === playerSymbolToCheck && condition.every(index => board[index] === playerSymbolToCheck)) {
            gameState.winningCombination = condition; return true;
        }
    }
    return false;
}

// switchTurnServer indi gameState-i parametr kimi alır və dəyişdirir
function switchTurnServer(gameState) {
    if (!gameState || gameState.isGameOver || gameState.gamePhase !== 'playing' || !gameState.player1?.symbol || !gameState.player2?.symbol) return;
    const p1Active = gameState.player1.socketId && !gameState.player1.isDisconnected;
    const p2Active = gameState.player2.socketId && !gameState.player2.isDisconnected;
    if (p1Active && p2Active) { gameState.currentPlayerSymbol = (gameState.currentPlayerSymbol === gameState.player1.symbol) ? gameState.player2.symbol : gameState.player1.symbol; }
    else if (p1Active) { gameState.currentPlayerSymbol = gameState.player1.symbol; }
    else if (p2Active) { gameState.currentPlayerSymbol = gameState.player2.symbol; }
    else { gameState.currentPlayerSymbol = null; }
}

// handleMakeMoveServer indi gameState-i parametr kimi alır və dəyişdirir
function handleMakeMoveServer(gameState, playerSymbol, index) {
    if (!gameState || gameState.isGameOver || gameState.gamePhase !== 'playing') return false; // Oyun vəziyyəti yoxlanışı
    if (gameState.currentPlayerSymbol !== playerSymbol) return false; // Növbə yoxlanışı
    if (typeof index !== 'number' || index < 0 || index >= gameState.board.length || gameState.board[index] !== '') return false; // Keçərsiz indeks və ya dolu xana

    gameState.board[index] = playerSymbol;
    gameState.lastMoveTime = Date.now();

    const playerUsername = (gameState.player1?.symbol === playerSymbol) ? gameState.player1.username : gameState.player2?.username;

    if (checkWinServer(gameState, playerSymbol)) {
        gameState.isGameOver = true; gameState.winnerSymbol = playerSymbol; gameState.gamePhase = 'game_over';
        gameState.statusMessage = `${playerUsername || playerSymbol} Qazandı!`;
        gameState.restartRequestedBy = null; gameState.restartAcceptedBy = [];
        console.log(`[Game Logic] Oyun bitdi. Qalib: ${playerUsername} (${playerSymbol})`);
    } else if (!gameState.board.includes('')) {
        gameState.isGameOver = true; gameState.winnerSymbol = 'draw'; gameState.gamePhase = 'game_over';
        gameState.statusMessage = "Oyun Bərabərə!";
        gameState.restartRequestedBy = null; gameState.restartAcceptedBy = [];
        console.log(`[Game Logic] Oyun bərabərə bitdi.`);
    } else {
        switchTurnServer(gameState);
        const nextPlayerState = (gameState.currentPlayerSymbol === gameState.player1?.symbol) ? gameState.player1 : gameState.player2;
        const nextPlayerActive = nextPlayerState?.socketId && !nextPlayerState.isDisconnected;
        gameState.statusMessage = nextPlayerActive ? `Sıra: ${nextPlayerState.username || gameState.currentPlayerSymbol}` : `Sıra: ${nextPlayerState?.username || gameState.currentPlayerSymbol || '?'} (Gözlənilir...)`;
    }
    return true; // Hərəkət uğurlu oldu
}

// Otaqdakı bütün clientlərə gameState göndərmək
async function emitGameStateUpdateRedis(roomId, triggeringEvent = 'N/A') {
    try {
        const roomData = await getRoomDataFromRedis(roomId);
        if (roomData?.gameState) {
            // console.log(`[State Emitter] Otağa (${roomId}) gameState göndərilir. Trigger: ${triggeringEvent}, Phase: ${roomData.gameState.gamePhase}`);
            io.to(roomId).emit('game_state_update', roomData.gameState);
        } else {
            // console.warn(`[State Emitter] emitGameStateUpdateRedis: Otaq (${roomId}) gameState tapılmadı. Trigger: ${triggeringEvent}`);
        }
    } catch (error) {
        console.error(`[State Emitter ERROR] emitGameStateUpdateRedis zamanı xəta (RoomID: ${roomId}, Trigger: ${triggeringEvent}):`, error);
    }
}

// Player state-lərini tapmaq üçün yardımçı
function findPlayerStatesByUserId(gameState, userId) {
     let playerState = null, opponentState = null;
     if (!gameState || !userId) return { playerState, opponentState };
     if (gameState.player1?.userId === userId) { playerState = gameState.player1; opponentState = gameState.player2; }
     else if (gameState.player2?.userId === userId) { playerState = gameState.player2; opponentState = gameState.player1; }
     return { playerState, opponentState };
}

// ----- HTTP API Endpoints (Originaldan götürülmüş, dəyişiklik yoxdur) -----
// Qeyd: Artıq Express middleware bölməsində isAuthenticated təyin edilib.
app.post('/register', async (req, res) => { /* ... orijinal kod ... */
    const { fullName, email, nickname, password } = req.body;
    if (!fullName || !email || !nickname || !password || password.length < 6 || nickname.length < 3 || /\s/.test(nickname)) { return res.status(400).json({ success: false, message: 'Form məlumatları natamam və ya yanlışdır (nickname min 3 hərf, boşluqsuz; şifrə min 6 hərf).' }); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return res.status(400).json({ success: false, message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
    try {
        const checkUser = await pool.query('SELECT email, nickname FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2) LIMIT 1', [email, nickname]);
        if (checkUser.rows.length > 0) {
            const existing = checkUser.rows[0];
            let message = (existing.email.toLowerCase() === email.toLowerCase() && existing.nickname.toLowerCase() === nickname.toLowerCase()) ? 'Bu email və nickname artıq istifadə olunur.' : (existing.email.toLowerCase() === email.toLowerCase() ? 'Bu email artıq istifadə olunur.' : 'Bu nickname artıq istifadə olunur.');
            return res.status(409).json({ success: false, message: message });
        }
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUserQuery = `INSERT INTO users (full_name, email, nickname, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nickname`;
        const newUser = await pool.query(newUserQuery, [fullName, email, nickname, hashedPassword]);
        console.log(`[Register OK] İstifadəçi qeydiyyatdan keçdi: ${newUser.rows[0].nickname} (ID: ${newUser.rows[0].id})`);
        res.status(201).json({ success: true, message: 'Qeydiyyat uğurlu oldu!', nickname: newUser.rows[0].nickname });
    } catch (error) { console.error('[Register ERROR] Qeydiyyat zamanı DB xətası:', error); res.status(500).json({ success: false, message: 'Server xətası baş verdi.' }); }
});
app.post('/login', async (req, res) => { /* ... orijinal kod ... */
    const { nickname, password } = req.body;
    if (!nickname || !password) { return res.status(400).json({ success: false, message: 'Nickname və şifrə daxil edilməlidir.' }); }
    try {
        const result = await pool.query('SELECT * FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);
        if (result.rows.length === 0) { return res.status(401).json({ success: false, message: 'Nickname və ya şifrə yanlışdır.' }); }
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            req.session.user = { id: user.id, nickname: user.nickname, fullName: user.full_name, email: user.email };
            console.log(`[Login OK] İstifadəçi giriş etdi: ${user.nickname} (ID: ${user.id}), Session ID: ${req.session.id}`);
            res.status(200).json({ success: true, message: 'Giriş uğurludur!', nickname: user.nickname });
        } else { console.log(`[Login FAIL] Parol səhvdir: ${user.nickname}`); res.status(401).json({ success: false, message: 'Nickname və ya şifrə yanlışdır.' }); }
    } catch (error) { console.error('[Login ERROR] Giriş zamanı xəta:', error); res.status(500).json({ success: false, message: 'Server xətası baş verdi.' }); }
});
app.get('/check-auth', (req, res) => { /* ... orijinal kod ... */
    if (req.session?.user?.id) { res.status(200).json({ loggedIn: true, user: req.session.user }); }
    else { res.status(200).json({ loggedIn: false, user: null }); }
});
app.post('/logout', (req, res) => { /* ... orijinal kod ... */
    const userNickname = req.session?.user?.nickname || 'Bilinməyən';
    console.log(`[/logout] Çıxış sorğusu alındı: User=${userNickname}`);
    req.session.destroy(err => {
        if (err) { console.error('[/logout ERROR] Sessiya məhv edilərkən xəta:', err); return res.status(500).json({ success: false, message: 'Çıxış zamanı server xətası.' }); }
        res.clearCookie('connect.sid'); console.log(`[/logout OK] Sessiya məhv edildi: User=${userNickname}`);
        res.status(200).json({ success: true, message: 'Uğurla çıxış edildi.' });
    });
});
// --- Profil Yeniləmə --- // isAuthenticated təyin edilib
const isAuthenticated = (req, res, next) => { if (req.session?.user?.id) return next(); return res.status(401).json({ loggedIn: false, message: 'Bu əməliyyat üçün giriş tələb olunur.' }); };
app.put('/profile/:nickname', isAuthenticated, async (req, res) => { /* ... orijinal kod ... */
    const targetNickname = req.params.nickname; const loggedInUserId = req.session.user.id; const loggedInNickname = req.session.user.nickname;
    const { fullName, email, nickname: newNickname, password } = req.body;
    if (targetNickname.toLowerCase() !== loggedInNickname.toLowerCase()) { return res.status(403).json({ success: false, message: 'Yalnız öz profilinizi yeniləyə bilərsiniz.' }); }
    if (!fullName || !email || !newNickname || newNickname.length < 3 || /\s/.test(newNickname)) { return res.status(400).json({ success: false, message: 'Ad Soyad, Email və Nickname boş ola bilməz (nickname min 3 hərf, boşluqsuz).' }); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return res.status(400).json({ success: false, message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
    if (password && password.length < 6) { return res.status(400).json({ success: false, message: 'Yeni şifrə minimum 6 simvol olmalıdır.' }); }
    try {
        const checkConflict = await pool.query('SELECT id FROM users WHERE (LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2)) AND id != $3 LIMIT 1', [email, newNickname, loggedInUserId]);
        if (checkConflict.rows.length > 0) { return res.status(409).json({ success: false, message: 'Bu email və ya nickname artıq başqa istifadəçi tərəfindən istifadə olunur.' }); }
        let updateQuery = 'UPDATE users SET full_name = $1, email = $2, nickname = $3'; const queryParams = [fullName, email, newNickname]; let paramIndex = 4;
        if (password) { const hashedPassword = await bcrypt.hash(password, saltRounds); updateQuery += `, password_hash = $${paramIndex}`; queryParams.push(hashedPassword); paramIndex++; }
        updateQuery += ` WHERE id = $${paramIndex} RETURNING id, nickname, full_name, email`; queryParams.push(loggedInUserId);
        const result = await pool.query(updateQuery, queryParams);
        if (result.rows.length === 0) { return res.status(404).json({ success: false, message: 'Profil yenilənərkən xəta (istifadəçi tapılmadı).' }); }
        const updatedUser = result.rows[0]; console.log(`[/profile UPDATE OK] Profil yeniləndi: ${updatedUser.nickname}`);
        req.session.user = { id: updatedUser.id, nickname: updatedUser.nickname, fullName: updatedUser.full_name, email: updatedUser.email };
        req.session.save((err) => {
            if (err) { console.error('[/profile UPDATE ERROR] Sessiya yadda saxlanılarkən xəta:', err); return res.status(200).json({ success: true, message: 'Profil uğurla yeniləndi! (Sessiya xətası)', updatedUser: req.session.user }); }
            res.status(200).json({ success: true, message: 'Profil uğurla yeniləndi!', updatedUser: req.session.user });
        });
    } catch (error) { console.error('[/profile UPDATE ERROR] Profil yenilənərkən DB xətası:', error); res.status(500).json({ success: false, message: 'Server xətası baş verdi.' }); }
});
app.get('/', (req, res) => { res.redirect('/ana_sehife/login/login.html'); });

// ----- Socket.IO Auth & Connection (Redis ilə adaptasiya) -----

// Socket.IO üçün Express session middleware
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

// Socket.IO autentifikasiya
io.use(async (socket, next) => {
    const session = socket.request.session;
    if (session?.user?.id && session.user.nickname) {
        // User məlumatlarını müvəqqəti olaraq Redis-də saxlayaq
        const userInfoKey = getUserInfoKey(socket.id);
        try {
            await pubClient.hSet(userInfoKey, {
                userId: session.user.id.toString(), // ID-ni string kimi saxlamaq daha təhlükəsiz ola bilər
                username: session.user.nickname
            });
            await pubClient.expire(userInfoKey, 60 * 60 * 1); // 1 saat sonra avtomatik silinsin (əgər bağlantı qalsa)
             // console.log(`[Socket Auth OK] User info stored in Redis for ${socket.id}`);
             next();
        } catch(err) {
             console.error(`[Socket Auth ERROR] Redis user info yazılarkən xəta (Socket: ${socket.id}):`, err);
             next(new Error('Server xətası: Sessiya məlumatları saxlanılmadı.'));
        }
    } else {
        console.warn(`[Socket Auth FAILED] Bağlantı rədd edildi (Sessiya tapılmadı/etibarsız). Socket ID: ${socket.id}`);
        next(new Error('Authentication Error: Giriş edilməyib və ya sessiya bitib.'));
    }
});
console.log('[Setup] Socket.IO üçün autentifikasiya və sessiya middleware təyin edildi.');

// Əsas Socket.IO bağlantı hadisəsi
io.on('connection', async (socket) => {

    let userInfo; // Bu scope-da saxlanılacaq
    try {
        const userInfoKey = getUserInfoKey(socket.id);
        userInfo = await pubClient.hGetAll(userInfoKey);
        if (!userInfo || !userInfo.userId || !userInfo.username) {
            throw new Error('Redis-dən user məlumatı alına bilmədi.');
        }
         userInfo.userId = parseInt(userInfo.userId, 10); // Nömrəyə çevirək
         userInfo.socketId = socket.id; // Socket ID-ni də əlavə edək
         console.log(`[Socket Connect] ++ User Qoşuldu: ${userInfo.username} (UserID: ${userInfo.userId}), Socket ID: ${socket.id}`);
    } catch (err) {
        console.error(`[Socket Connect ERROR] Qoşulan socket (${socket.id}) üçün user məlumatı alarkən xəta:`, err);
        socket.disconnect(true);
        return;
    }

    // Yeni qoşulana ilkin otaq siyahısını göndər
    try {
        await broadcastRoomListRedis(); // Redis versiyasını çağırırıq
    } catch (listError) {
        console.error(`[Socket Connect ERROR] İlkin otaq siyahısı göndərilərkən xəta (User: ${userInfo.username}):`, listError);
    }

    // --- Otaq Yaratma (Redis ilə) ---
    socket.on('create_room', async (data) => {
        console.log(`[create_room] Hadisə alındı: User=${userInfo.username}, Data=`, data);
        // Validasiya
        if (!data || !data.name || data.name.trim().length === 0 || data.name.length > 30) { return socket.emit('creation_error', 'Otaq adı etibarsızdır (1-30 simvol).'); }
        const roomName = data.name.trim();
        const roomPassword = data.password || null; // Boş string əvəzinə null
         let hashedRoomPassword = null;
        if (roomPassword) {
            if (roomPassword.length < 2 || roomPassword.length > 20) { return socket.emit('creation_error', 'Şifrə etibarsızdır (2-20 simvol).'); }
             hashedRoomPassword = await bcrypt.hash(roomPassword, saltRounds); // Şifrəni hash edək
        }
        const validatedBoardSize = Math.max(3, Math.min(6, parseInt(data.boardSize, 10) || 3));

        // İstifadəçinin başqa otaqda olub olmadığını yoxla
        const currentRoomId = await pubClient.get(getSocketRoomKey(socket.id));
        if (currentRoomId) { console.warn(`[create_room] User ${userInfo.username} artıq ${currentRoomId} otağındadır.`); return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız.'); }

        const newRoomId = generateRoomId();
        const roomKey = getRoomKey(newRoomId);
        const roomPlayersKey = getRoomPlayersKey(newRoomId);
        const socketRoomKey = getSocketRoomKey(socket.id);

        // Oyunu başlat
        const initialGameState = initializeGameState(validatedBoardSize, userInfo); // İlk oyunçu kimi özünü ver

        try {
            // Redis əməliyyatları (pipeline ilə daha effektiv ola bilər)
            const multi = pubClient.multi();
            multi.hSet(roomKey, { // Otaq məlumatlarını Hash-a yaz
                id: newRoomId,
                name: roomName,
                password: hashedRoomPassword, // Hash edilmiş şifrə və ya null
                boardSize: validatedBoardSize.toString(),
                creatorUsername: userInfo.username,
                creatorUserId: userInfo.userId.toString(),
                gameState: JSON.stringify(initialGameState) // GameState-i JSON string kimi
            });
            multi.sAdd(roomPlayersKey, socket.id); // Oyunçunu otağın Set-inə əlavə et
            multi.set(socketRoomKey, newRoomId); // Socket-in otağını qeyd et
            multi.sAdd('activeRooms', roomKey); // Aktiv otaqlar siyahısına əlavə et
            multi.persist(roomKey); // Otağın silinmə taymerini (əgər varsa) ləğv et
            multi.persist(roomPlayersKey); // Oyunçu listinin silinmə taymerini ləğv et
            await multi.exec();

            socket.join(newRoomId); // Socket.IO otağına qoşul
            console.log(`[create_room OK] Otaq yaradıldı: ID=${newRoomId}, Ad='${roomName}'`);

            await broadcastRoomListRedis(); // Lobbini yenilə
            socket.emit('room_joined', { roomId: newRoomId, roomName: roomName, boardSize: validatedBoardSize });

        } catch (err) {
            console.error(`[create_room ERROR] Redis əməliyyatları zamanı xəta (Room: ${newRoomId}):`, err);
            socket.emit('creation_error', 'Otaq yaradılarkən server xətası baş verdi.');
            // Yarımçıq qeydləri təmizləməyə çalışaq (best effort)
            await pubClient.del(roomKey).catch(e => console.error("Cleanup DEL roomKey error:", e));
            await pubClient.del(roomPlayersKey).catch(e => console.error("Cleanup DEL playersKey error:", e));
            await pubClient.del(socketRoomKey).catch(e => console.error("Cleanup DEL socketRoomKey error:", e));
            await pubClient.sRem('activeRooms', roomKey).catch(e => console.error("Cleanup SREM activeRooms error:", e));
        }
    });

     // --- Mövcud otağa qoşulma (Lobbiden - Redis ilə) ---
     socket.on('join_room', async (data) => {
         console.log(`[join_room] Hadisə alındı: User=${userInfo.username}, Data=`, data);
         if (!data || !data.roomId) { return socket.emit('join_error', 'Otaq ID göndərilmədi.'); }
         const roomId = data.roomId;
         const roomKey = getRoomKey(roomId);

         try {
             // Otağın mövcudluğunu və şifrəsini yoxla
             const roomExists = await pubClient.exists(roomKey);
             if (!roomExists) { await broadcastRoomListRedis(); return socket.emit('join_error', 'Otaq tapılmadı.'); }

             const roomPasswordHash = await pubClient.hGet(roomKey, 'password');
             if (roomPasswordHash) { // Şifrə varsa
                 if (!data.password) return socket.emit('join_error', 'Bu otaq üçün şifrə tələb olunur.');
                 const passwordMatch = await bcrypt.compare(data.password, roomPasswordHash);
                 if (!passwordMatch) return socket.emit('join_error', 'Şifrə yanlışdır.');
             }

             // İstifadəçinin başqa otaqda olub olmadığını yoxla
             const currentRoomId = await pubClient.get(getSocketRoomKey(socket.id));
             if (currentRoomId && currentRoomId !== roomId) { return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.'); }
             if (currentRoomId === roomId) { // Artıq bu otaqdadırsa
                  console.log(`[join_room] User ${userInfo.username} artıq ${roomId} otağındadır. joined emit edilir.`);
                  const roomName = await pubClient.hGet(roomKey, 'name') || 'Bilinməyən';
                  const boardSize = parseInt(await pubClient.hGet(roomKey, 'boardSize') || '3', 10);
                  socket.emit('room_joined', { roomId, roomName, boardSize });
                  // player_ready_in_room client tərəfdən çağırılmalıdır
                  return;
             }

             // Aktiv oyunçu sayını yoxla (gameState-dən)
             const roomData = await getRoomDataFromRedis(roomId); // gameState daxil
             if (!roomData || !roomData.gameState) { return socket.emit('join_error', 'Otaq vəziyyəti alına bilmədi.'); }
             const gameState = roomData.gameState;
             let activePlayerCount = 0;
             const userAlreadyInGame = (gameState.player1?.userId === userInfo.userId && !gameState.player1.isDisconnected) ||
                                     (gameState.player2?.userId === userInfo.userId && !gameState.player2.isDisconnected);
             if (gameState.player1?.socketId && !gameState.player1.isDisconnected) activePlayerCount++;
             if (gameState.player2?.socketId && !gameState.player2.isDisconnected) activePlayerCount++;

             if (activePlayerCount >= 2 && !userAlreadyInGame) {
                 console.warn(`[join_room] Otaq ${roomId} dolu (Count: ${activePlayerCount}). Qoşulma rədd edildi: ${userInfo.username}`);
                 return socket.emit('join_error', 'Otaq doludur.');
             }

             console.log(`[join_room OK] User ${userInfo.username} joining room ${roomId}. Sending room_joined.`);
             socket.emit('room_joined', { roomId: roomData.id, roomName: roomData.name, boardSize: roomData.boardSize });
             // Qoşulma məntiqinin qalanı player_ready_in_room-da baş verir

         } catch (err) {
             console.error(`[join_room ERROR] Otağa (${roomId}) qoşularkən xəta:`, err);
             socket.emit('join_error', 'Otağa qoşularkən server xətası baş verdi.');
         }
     });

     // --- Otaqda Hazır Olma (Redis ilə) ---
     socket.on('player_ready_in_room', async (data) => {
         if (!data || !data.roomId || data.userId !== userInfo.userId) return; // Təhlükəsizlik
         const roomId = data.roomId;
         const roomKey = getRoomKey(roomId);
         const roomPlayersKey = getRoomPlayersKey(roomId);
         const socketRoomKey = getSocketRoomKey(socket.id);

         console.log(`[player_ready] Hadisə alındı: User=${userInfo.username}, RoomID=${roomId}`);

         try {
             const roomData = await getRoomDataFromRedis(roomId);
             if (!roomData || !roomData.gameState) { return socket.emit('force_redirect_lobby', { message: "Otaq tapılmadı və ya vəziyyəti xətalıdır." }); }
             const gameState = roomData.gameState;

             // Socket.IO otağına qoşul (əgər artıq qoşulmayıbsa)
             if (!socket.rooms.has(roomId)) { socket.join(roomId); }

             let playerSlot = null; let playerState = null; let needsSave = false;
             if (gameState.player1?.userId === userInfo.userId) { playerSlot = 1; playerState = gameState.player1; }
             else if (gameState.player2?.userId === userInfo.userId) { playerSlot = 2; playerState = gameState.player2; }

             // Reconnect halı
             if (playerState && playerState.isDisconnected) {
                 console.log(`[player_ready] Reconnecting User: ${userInfo.username} (Slot ${playerSlot})`);
                 // Reconnect timerini Redis-dən silməyə çalış
                 const timerKey = getRoomDisconnectTimerKey(roomId, userInfo.userId);
                 await pubClient.del(timerKey); // Timer varsa silinəcək

                 playerState.socketId = socket.id; // Yeni socket ID
                 playerState.isDisconnected = false;
                 playerState.disconnectTime = null;
                 playerState.username = userInfo.username; // Adı yenilə
                 needsSave = true;

                 // Socket-i players Set-inə əlavə et
                 await pubClient.sAdd(roomPlayersKey, socket.id);
                 await pubClient.set(socketRoomKey, roomId); // Socket-otaq map-ini yenilə

                 const opponentState = (playerSlot === 1) ? gameState.player2 : gameState.player1;
                 if (opponentState?.socketId && !opponentState.isDisconnected) { // Rəqib aktivdirsə
                     gameState.statusMessage = `${userInfo.username} oyuna qayıtdı. Sıra: ${ (gameState.currentPlayerSymbol === playerState.symbol ? playerState : opponentState)?.username || gameState.currentPlayerSymbol || '?'}`;
                 } else { // Rəqib aktiv deyilsə
                     gameState.gamePhase = 'waiting'; gameState.statusMessage = "Rəqib gözlənilir...";
                 }
                 await broadcastRoomListRedis(); // Lobbini yenilə
             }
             // Yeni oyunçu halı
             else if (!playerState && (!gameState.player1?.userId || !gameState.player2?.userId)) {
                 const targetSlotNum = (!gameState.player1?.userId) ? 1 : 2;
                 playerState = (targetSlotNum === 1) ? gameState.player1 : gameState.player2;
                 console.log(`[player_ready] New player ${userInfo.username} joining as P${targetSlotNum}`);

                 playerState.socketId = socket.id;
                 playerState.userId = userInfo.userId;
                 playerState.username = userInfo.username;
                 playerState.isDisconnected = false;
                 needsSave = true;

                 await pubClient.sAdd(roomPlayersKey, socket.id); // Oyunçunu Set-ə əlavə et
                 await pubClient.set(socketRoomKey, roomId); // Socket-otaq map-ini təyin et

                 // Əgər ikinci oyunçu qoşulubsa, zər fazasına keç
                 if (gameState.player1?.userId && gameState.player2?.userId) {
                     gameState.gamePhase = 'dice_roll'; gameState.statusMessage = "Oyunçular zər atır...";
                     gameState.player1.roll = null; gameState.player2.roll = null; // Zərləri sıfırla
                 }
                 await broadcastRoomListRedis();
             }
              // Eyni user, fərqli aktiv socket halı (əvvəlki kodu adaptasiya edək)
             else if (playerState && playerState.socketId !== socket.id && !playerState.isDisconnected) {
                 console.warn(`[player_ready] User ${userInfo.username} already actively connected with socket (${playerState.socketId}). New socket ${socket.id} trying to connect.`);
                 const oldSocketId = playerState.socketId;
                 const oldSocketInstance = io.sockets.sockets.get(oldSocketId);
                 if (oldSocketInstance) {
                     console.log(`[player_ready] Disconnecting old socket ${oldSocketId}...`);
                     oldSocketInstance.emit('force_disconnect', { message: 'Bu hesabla başqa yerdən qoşuldunuz.' });
                     oldSocketInstance.disconnect(true); // Bu, disconnect handler-i işə salacaq
                 }
                 // Köhnə socketi Set-dən silək (disconnect handler etsə də)
                 await pubClient.sRem(roomPlayersKey, oldSocketId);
                 // Yeni socketi əlavə edək
                 await pubClient.sAdd(roomPlayersKey, socket.id);
                 await pubClient.set(socketRoomKey, roomId); // Yeni map yarat

                 playerState.socketId = socket.id; // State-də socket ID-ni yenilə
                 needsSave = true;
                 console.log(`[player_ready] Accepted new socket ${socket.id} for user ${userInfo.username}.`);
             }

             // Artıq qoşulu hal
             else if (playerState && playerState.socketId === socket.id && !playerState.isDisconnected) {
                 console.log(`[player_ready] Player ${userInfo.username} is already connected and active.`);
                 needsSave = true; // Hər ehtimala qarşı state-i göndərək
             }

             if (needsSave) {
                 await saveGameStateToRedis(roomId, gameState); // Yenilənmiş state-i Redis-ə yaz
                 await emitGameStateUpdateRedis(roomId, 'player_ready'); // Və bütün otağa göndər
             }
              // Otaq məlumatlarını ayrıca göndər (əgər UI-da lazımdırsa)
              socket.emit('room_info', { name: roomData.name, boardSize: roomData.boardSize, creatorUsername: roomData.creatorUsername });

         } catch (err) {
             console.error(`[player_ready ERROR] Otağa (${roomId}) hazır olarkən xəta:`, err);
             socket.emit('force_redirect_lobby', { message: "Otağa qoşularkən server xətası." });
         }
     });

     // --- Zər Atma (Redis ilə) ---
     socket.on('dice_roll_result', async (data) => {
         const roomId = await pubClient.get(getSocketRoomKey(socket.id));
         if (!roomId) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
         if (!data || typeof data.roll !== 'number' || data.roll < 1 || data.roll > 6) return socket.emit('game_error', { message: 'Keçərsiz zər nəticəsi.' });

         try {
             const roomData = await getRoomDataFromRedis(roomId);
             if (!roomData?.gameState) return socket.emit('game_error', { message: 'Oyun vəziyyəti tapılmadı.' });
             const state = roomData.gameState;

             if (state.gamePhase !== 'dice_roll' || state.isGameOver) return socket.emit('game_error', { message: 'Zər atmaq üçün uyğun mərhələ deyil.' });

             const { playerState, opponentState } = findPlayerStatesByUserId(state, userInfo.userId);
             if (!playerState || playerState.socketId !== socket.id || playerState.isDisconnected) return socket.emit('game_error', { message: 'Siz bu oyunda aktiv oyunçu deyilsiniz.' });
             if (playerState.roll !== null && !state.statusMessage?.includes("Bərabərlik!")) return socket.emit('game_error', { message: 'Siz artıq zər atmısınız.' });

             playerState.roll = data.roll;
             console.log(`[dice_roll] User=${userInfo.username}, Roll=${data.roll}`);

             let nextPhase = null;
             if (state.player1?.roll !== null && state.player2?.roll !== null) { // Hər ikisi atıb
                 const p1_roll = state.player1.roll; const p2_roll = state.player2.roll;
                 if (p1_roll > p2_roll) { state.diceWinnerSocketId = state.player1.socketId; state.symbolPickerSocketId = state.player1.socketId; }
                 else if (p2_roll > p1_roll) { state.diceWinnerSocketId = state.player2.socketId; state.symbolPickerSocketId = state.player2.socketId; }

                 if (state.diceWinnerSocketId) { // Qalib var
                     const winnerState = (state.diceWinnerSocketId === state.player1.socketId) ? state.player1 : state.player2;
                     const loserState = (state.diceWinnerSocketId === state.player1.socketId) ? state.player2 : state.player1;
                     state.statusMessage = `${winnerState.username || '?'} yüksək atdı (${winnerState.roll} vs ${loserState.roll})! Simvol seçəcək...`;
                     nextPhase = 'symbol_select'; // Növbəti fazanı təyin et
                 } else { // Bərabərlik
                     state.player1.roll = null; state.player2.roll = null; // Sıfırla
                     state.gamePhase = 'dice_roll'; state.statusMessage = "Bərabərlik! Zərlər təkrar atılır...";
                     // nextPhase null qalır
                 }
             } else { // Biri gözlənilir
                 const opponentUsername = opponentState?.username || "Rəqib";
                 state.statusMessage = `${opponentUsername}-in zər atması gözlənilir...`;
                 // nextPhase null qalır
             }

             await saveGameStateToRedis(roomId, state); // Vəziyyəti saxla
             await emitGameStateUpdateRedis(roomId, 'dice_roll_result'); // Hamıya göndər

             // Əgər növbəti faza təyin edilibsə (qalib varsa), qısa fasilədən sonra ora keç
             if (nextPhase === 'symbol_select') {
                 setTimeout(async () => {
                      try {
                          const currentRoomData = await getRoomDataFromRedis(roomId); // Ən son vəziyyəti al
                          if (currentRoomData?.gameState?.gamePhase === 'dice_roll' && currentRoomData.gameState.diceWinnerSocketId) {
                              currentRoomData.gameState.gamePhase = 'symbol_select';
                              const winnerState = (currentRoomData.gameState.diceWinnerSocketId === currentRoomData.gameState.player1.socketId) ? currentRoomData.gameState.player1 : currentRoomData.gameState.player2;
                              currentRoomData.gameState.statusMessage = `${winnerState.username || '?'} simvol seçir...`;
                              await saveGameStateToRedis(roomId, currentRoomData.gameState);
                              await emitGameStateUpdateRedis(roomId, 'dice_roll_timeout_finished');
                          }
                      } catch (err) { console.error("[Dice Timeout ERROR]:", err); }
                 }, 2500); // 2.5 saniyə
             }

         } catch (err) {
             console.error(`[dice_roll ERROR] User: ${userInfo.username}, Room: ${roomId}:`, err);
             socket.emit('game_error', { message: 'Zər atarkən server xətası.' });
         }
     });

     // --- Simvol Seçimi (Redis ilə) ---
     socket.on('symbol_choice', async (data) => {
         const roomId = await pubClient.get(getSocketRoomKey(socket.id));
         if (!roomId) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });
         if (!data || (data.symbol !== 'X' && data.symbol !== 'O')) return socket.emit('game_error', { message: 'Keçərsiz simvol seçimi.' });

         try {
             const roomData = await getRoomDataFromRedis(roomId);
             if (!roomData?.gameState) return socket.emit('game_error', { message: 'Oyun vəziyyəti tapılmadı.' });
             const state = roomData.gameState;

             if (state.gamePhase !== 'symbol_select' || state.isGameOver || socket.id !== state.symbolPickerSocketId) { return socket.emit('game_error', { message: 'Simvol seçimi üçün uyğun deyil.' }); }

             const chosenSymbol = data.symbol; const opponentSymbol = (chosenSymbol === 'X') ? 'O' : 'X';
             const { playerState: pickerState, opponentState } = findPlayerStatesByUserId(state, userInfo.userId);
             if (!pickerState) return socket.emit('game_error', { message: 'Simvol seçən tapılmadı.' });

             pickerState.symbol = chosenSymbol;
             if (opponentState) opponentState.symbol = opponentSymbol;

             state.symbolPickerSocketId = null; // Seçim edildi
             state.statusMessage = `${pickerState.username || '?'} ${chosenSymbol} seçdi. ${opponentState?.username || '?'} ${opponentSymbol} ilə oynayacaq.`;
             console.log(`[symbol_choice] User: ${userInfo.username} chose ${chosenSymbol}`);

             // Vəziyyəti saxla və göstər
             await saveGameStateToRedis(roomId, state);
             await emitGameStateUpdateRedis(roomId, 'symbol_chosen_show_result');

             // Qısa fasilədən sonra oyuna başla
             setTimeout(async () => {
                 try {
                      const currentRoomData = await getRoomDataFromRedis(roomId); // Ən son vəziyyəti al
                      if (currentRoomData?.gameState?.gamePhase === 'symbol_select' && currentRoomData.gameState.symbolPickerSocketId === null) {
                          currentRoomData.gameState.gamePhase = 'playing';
                          currentRoomData.gameState.currentPlayerSymbol = chosenSymbol; // Seçən başlayır
                          currentRoomData.gameState.lastMoveTime = Date.now();
                          const currentPlayerUsername = pickerState.username;
                          currentRoomData.gameState.statusMessage = `Oyun başladı! Sıra: ${currentPlayerUsername || chosenSymbol}`;
                          await saveGameStateToRedis(roomId, currentRoomData.gameState);
                          await emitGameStateUpdateRedis(roomId, 'symbol_choice_timeout_finished');
                      }
                 } catch(err) { console.error("[Symbol Timeout ERROR]:", err); }
             }, 2000); // 2 saniyə

         } catch (err) {
             console.error(`[symbol_choice ERROR] User: ${userInfo.username}, Room: ${roomId}:`, err);
             socket.emit('game_error', { message: 'Simvol seçərkən server xətası.' });
         }
     });

     // --- Gediş Etmə (Redis ilə) ---
     socket.on('make_move', async (data) => {
         const roomId = await pubClient.get(getSocketRoomKey(socket.id));
         if (!roomId) return socket.emit('invalid_move', { message: 'Oyun tapılmadı.' });
         const index = data?.index;

         try {
             const roomData = await getRoomDataFromRedis(roomId);
             if (!roomData?.gameState) return socket.emit('invalid_move', { message: 'Oyun vəziyyəti tapılmadı.' });
             const state = roomData.gameState;

             const { playerState } = findPlayerStatesByUserId(state, userInfo.userId);
             if (!playerState || !playerState.symbol) return socket.emit('invalid_move', { message: 'Oyunçu məlumatı tapılmadı.' });

             // Hərəkəti server tərəfdə et (yoxlama, update, win/draw check, turn switch)
             const moveSuccessful = handleMakeMoveServer(state, playerState.symbol, index);

             if (moveSuccessful) {
                  console.log(`[make_move OK] User: ${userInfo.username}, Index: ${index}, Room: ${roomId}`);
                  await saveGameStateToRedis(roomId, state); // Yenilənmiş vəziyyəti saxla
                  await emitGameStateUpdateRedis(roomId, 'make_move'); // Və bütün otağa göndər
             } else {
                  // handleMakeMoveServer false qaytarıbsa, səbəb yuxarıda loglanıb
                  socket.emit('invalid_move', { message: 'Keçərsiz hərəkət.' });
             }

         } catch (err) {
             console.error(`[make_move ERROR] User: ${userInfo.username}, Room: ${roomId}, Index: ${index}:`, err);
             socket.emit('invalid_move', { message: 'Hərəkət edərkən server xətası.' });
         }
     });

    // --- Yenidən Başlatma Təklifi (Redis ilə) ---
    socket.on('request_restart', async () => {
        const roomId = await pubClient.get(getSocketRoomKey(socket.id));
        if (!roomId) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });

        try {
            const roomData = await getRoomDataFromRedis(roomId);
            if (!roomData?.gameState) return socket.emit('game_error', { message: 'Oyun vəziyyəti tapılmadı.' });
            const state = roomData.gameState;

            if (state.gamePhase !== 'game_over') return socket.emit('game_error', { message: 'Yenidən başlatma təklifi üçün oyun bitməlidir.' });
            const p1Active = state.player1?.socketId && !state.player1.isDisconnected;
            const p2Active = state.player2?.socketId && !state.player2.isDisconnected;
            if (!p1Active || !p2Active) return socket.emit('game_error', { message: 'Hər iki oyunçu aktiv olmalıdır.' });

            if (state.restartRequestedBy && state.restartRequestedBy !== socket.id) return socket.emit('info_message', { message: 'Artıq başqa bir təklif var.' });
            if (state.restartRequestedBy === socket.id) return socket.emit('info_message', { message: 'Təklifiniz göndərilib.' });

            console.log(`[request_restart] User: ${userInfo.username}, Room: ${roomId}`);
            state.restartRequestedBy = socket.id;
            state.restartAcceptedBy = [socket.id]; // Özünü əlavə et (massiv kimi)
            state.statusMessage = `${userInfo.username} yenidən başlatmağı təklif edir...`;

            const { opponentState } = findPlayerStatesByUserId(state, userInfo.userId);
            const opponentSocket = opponentState?.socketId ? io.sockets.sockets.get(opponentState.socketId) : null;
            if (opponentSocket) {
                opponentSocket.emit('restart_requested', { username: userInfo.username });
                socket.emit('info_message', { message: 'Təklif göndərildi.' });
                await saveGameStateToRedis(roomId, state);
                await emitGameStateUpdateRedis(roomId, 'restart_requested');
            } else {
                state.restartRequestedBy = null; state.restartAcceptedBy = [];
                await saveGameStateToRedis(roomId, state); // Təklifi geri al
                socket.emit('game_error', { message: 'Rəqib tapılmadı.' });
            }
        } catch (err) {
            console.error(`[request_restart ERROR] User: ${userInfo.username}, Room: ${roomId}:`, err);
            socket.emit('game_error', { message: 'Restart təklif edərkən server xətası.' });
        }
    });

    // --- Restart Təklifini Qəbul Etmə (Redis ilə) ---
    socket.on('accept_restart', async () => {
        const roomId = await pubClient.get(getSocketRoomKey(socket.id));
        if (!roomId) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });

        try {
            const roomData = await getRoomDataFromRedis(roomId);
            if (!roomData?.gameState) return socket.emit('game_error', { message: 'Oyun vəziyyəti tapılmadı.' });
            const state = roomData.gameState;

            if (state.gamePhase !== 'game_over' || !state.restartRequestedBy || state.restartRequestedBy === socket.id || state.restartAcceptedBy.includes(socket.id)) {
                return socket.emit('game_error', { message: 'Təklifi qəbul etmək üçün uyğun deyil.' });
            }
            const p1Active = state.player1?.socketId && !state.player1.isDisconnected;
            const p2Active = state.player2?.socketId && !state.player2.isDisconnected;
            if (!p1Active || !p2Active) {
                state.restartRequestedBy = null; state.restartAcceptedBy = [];
                await saveGameStateToRedis(roomId, state);
                await emitGameStateUpdateRedis(roomId, 'restart_cancelled_opponent_left');
                return socket.emit('game_error', { message: 'Rəqib ayrılıb.' });
            }

            console.log(`[accept_restart] User: ${userInfo.username}, Room: ${roomId}`);
            state.restartAcceptedBy.push(socket.id);

            if (state.restartAcceptedBy.length === 2) {
                console.log(`[accept_restart] Restarting game ${roomId}...`);
                // Oyunu sıfırla
                const p1Info = { id: state.player1.socketId, userId: state.player1.userId, username: state.player1.username };
                const p2Info = { id: state.player2.socketId, userId: state.player2.userId, username: state.player2.username };
                const newGameState = initializeGameState(state.boardSize, p1Info, p2Info);
                newGameState.gamePhase = 'dice_roll'; // Zər fazasına keç
                newGameState.statusMessage = "Oyunçular zər atır...";
                roomData.gameState = newGameState; // Əsas otaq datasını yenilə

                await saveGameStateToRedis(roomId, newGameState);
                await emitGameStateUpdateRedis(roomId, 'restart_accepted');
            } else { // Yalnız 1 nəfər qəbul edib (bu hal olmamalıdır?)
                await saveGameStateToRedis(roomId, state); // Sadəcə qəbul edəni saxla
                 await emitGameStateUpdateRedis(roomId, 'restart_accepted_partial');
            }
        } catch (err) {
            console.error(`[accept_restart ERROR] User: ${userInfo.username}, Room: ${roomId}:`, err);
            socket.emit('game_error', { message: 'Restart qəbul edərkən server xətası.' });
        }
    });

    // --- Restart Təklifini Rədd Etmə (Redis ilə) ---
    socket.on('decline_restart', async () => {
         const roomId = await pubClient.get(getSocketRoomKey(socket.id));
         if (!roomId) return socket.emit('game_error', { message: 'Oyun tapılmadı.' });

         try {
             const roomData = await getRoomDataFromRedis(roomId);
             if (!roomData?.gameState) return socket.emit('game_error', { message: 'Oyun vəziyyəti tapılmadı.' });
             const state = roomData.gameState;

             if (state.gamePhase !== 'game_over' || !state.restartRequestedBy || state.restartRequestedBy === socket.id) {
                 return socket.emit('game_error', { message: 'Təklifi rədd etmək üçün uyğun deyil.' });
             }

             console.log(`[decline_restart] User: ${userInfo.username}, Room: ${roomId}`);
             const requesterSocketId = state.restartRequestedBy;
             state.restartRequestedBy = null; state.restartAcceptedBy = [];

             // Statusu əvvəlki vəziyyətə qaytar
             if (state.winnerSymbol === 'draw') { state.statusMessage = "Oyun Bərabərə!"; }
             else if (state.winnerSymbol) { const winnerState = (state.player1?.symbol === state.winnerSymbol) ? state.player1 : state.player2; state.statusMessage = `${winnerState?.username || state.winnerSymbol} Qazandı!`; }
             else { state.statusMessage = "Oyun Bitdi"; } // Bu hal olmamalıdır

             await saveGameStateToRedis(roomId, state); // Vəziyyəti saxla

             const requesterSocket = io.sockets.sockets.get(requesterSocketId);
             if (requesterSocket) { requesterSocket.emit('info_message', { message: `${userInfo.username} təklifi rədd etdi.` }); }
             socket.emit('info_message', { message: 'Təklifi rədd etdiniz.' });
             await emitGameStateUpdateRedis(roomId, 'restart_declined');

         } catch (err) {
             console.error(`[decline_restart ERROR] User: ${userInfo.username}, Room: ${roomId}:`, err);
             socket.emit('game_error', { message: 'Restart rədd edərkən server xətası.' });
         }
    });

     // --- Otaqdan Aktiv Ayrılma (Redis ilə) ---
     socket.on('leave_room', async () => {
         const socketId = socket.id;
         console.log(`[leave_room] Explicit leave request: User=${userInfo.username}`);
         await handleDisconnectOrLeaveRedis(socket, 'leave_room_request'); // Əsas disconnect funksiyasını çağırırıq
     });

     // --- Bağlantı Kəsilməsi (Redis ilə) ---
     socket.on('disconnect', async (reason) => {
         console.log(`[Socket Disconnect] User: ${userInfo?.username || socket.id} disconnected. Reason: ${reason}`);
         await handleDisconnectOrLeaveRedis(socket, reason); // Əsas disconnect funksiyasını çağırırıq
         // User info-nu Redis-dən təmizlə
         try { await pubClient.del(getUserInfoKey(socket.id)); } catch(e) { console.error("Error deleting user info from Redis on disconnect:", e); }
     });

}); // io.on('connection') sonu

// ----- Disconnect/Leave Logic (Redis ilə) -----

async function handleDisconnectOrLeaveRedis(socket, reason) {
    const socketId = socket.id;
    let localUserInfo; // Əgər Redis-dən silinibse, io.on scope-dakını istifadə etmək üçün
    try {
        const userInfoKey = getUserInfoKey(socketId);
        localUserInfo = await pubClient.hGetAll(userInfoKey); // Bağlantı kəsildikdə hələ də Redis-də olmalıdır
        if (!localUserInfo || !localUserInfo.userId || !localUserInfo.username) {
             // Əgər Redis-də yoxdursa, io.on scope-dakı 'userInfo'-nu yoxlayaq (nadir hal)
              const connectionScopeUserInfo = socket.conn.request.userInfoFromAuth; // Bunu authda əlavə edək
              if(connectionScopeUserInfo) {
                   localUserInfo = connectionScopeUserInfo;
                   console.warn(`[handleDisconnect] User info not in Redis for ${socketId}, using info from connection scope.`);
              } else {
                    console.warn(`[handleDisconnect] User info not found for disconnecting socket ${socketId}.`);
                    return; // User məlumatı yoxdursa, heçnə edə bilmərik
              }
        } else {
            localUserInfo.userId = parseInt(localUserInfo.userId, 10);
        }
         // Auth zamanı socket obyektinə user məlumatını əlavə edək
         // io.use daxilində: socket.conn.request.userInfoFromAuth = {userId:..., username:...};
         // Bu, Redis xətası olsa belə fallback təmin edər

    } catch (err) {
        console.error(`[handleDisconnect ERROR] Redis user info alınarkən xəta (Socket: ${socketId}):`, err);
        return; // User məlumatı alınmazsa davam etmə
    }

    const { userId, username } = localUserInfo;
    const roomId = await pubClient.get(getSocketRoomKey(socketId));
    const isExplicitLeave = (reason === 'leave_room_request');

    console.log(`[handleDisconnect] Processing: User=${username}, Room=${roomId || 'N/A'}, Reason=${reason}, ExplicitLeave=${isExplicitLeave}`);

    // Socket-in otaq map-ini sil
    await pubClient.del(getSocketRoomKey(socketId)).catch(e => console.error("DEL socketRoomKey error:", e));

    if (!roomId) {
        console.log(`[handleDisconnect] User ${username} was not in a room.`);
        return; // Otaqda deyilsə, bitdi
    }

    const roomKey = getRoomKey(roomId);
    const roomPlayersKey = getRoomPlayersKey(roomId);
    let gameStateChanged = false;
    let roomShouldBeCleaned = false;
    let remainingPlayerSocketId = null;

    try {
        // Oyunçunu otağın players Set-indən sil
        await pubClient.sRem(roomPlayersKey, socketId);

        // Otaq məlumatlarını və gameState-i al
        const roomData = await getRoomDataFromRedis(roomId);
        if (!roomData || !roomData.gameState) {
            console.warn(`[handleDisconnect] Otaq ${roomId} və ya gameState tapılmadı (bəlkə artıq silinib?).`);
             // Əgər otaq yoxdursa, aktiv otaqlar siyahısından çıxart
             await pubClient.sRem('activeRooms', roomKey);
             await broadcastRoomListRedis(); // Lobbini yenilə
            return;
        }
        const state = roomData.gameState;
        const { playerState, opponentState } = findPlayerStatesByUserId(state, userId);

        if (playerState) { // Oyunçu gameState-də tapıldısa
            // Restartı ləğv et
            if (state.restartRequestedBy) { state.restartRequestedBy = null; state.restartAcceptedBy = []; gameStateChanged = true; }

            // Aktiv ayrılma VƏ YA oyun bitibsə/gözləyirsə -> Qalıcı silmə
            if (isExplicitLeave || state.gamePhase === 'game_over' || state.gamePhase === 'waiting') {
                console.log(`[handleDisconnect] Player ${username} left during ${state.gamePhase}. Clearing slot permanently.`);
                Object.assign(playerState, { socketId: null, userId: null, username: null, isDisconnected: false, disconnectTime: null, symbol: null, roll: null });
                gameStateChanged = true;
                // Taymeri sil (əgər varsa)
                 await pubClient.del(getRoomDisconnectTimerKey(roomId, userId));
            }
            // Gözlənilməz disconnect VƏ oyun davam edirsə -> Yenidən qoşulma rejimi
            else if (!isExplicitLeave && state.gamePhase !== 'game_over' && state.gamePhase !== 'waiting' && !playerState.isDisconnected) {
                 console.log(`[handleDisconnect] Player ${username} unexpectedly left during ${state.gamePhase}. Marking as disconnected.`);
                 playerState.isDisconnected = true;
                 playerState.disconnectTime = Date.now();
                 playerState.socketId = null; // Socket ID-ni silirik
                 gameStateChanged = true;
                 // Yenidən qoşulma taymerini Redis-də quraq (EXPIRE ilə)
                 const timerKey = getRoomDisconnectTimerKey(roomId, userId);
                 await pubClient.set(timerKey, 'pending_removal');
                 await pubClient.expire(timerKey, RECONNECT_TIMEOUT_MS / 1000); // Saniyə cinsindən
                 console.log(`[Reconnect Timer] Redis EXPIRE set for ${timerKey} (${RECONNECT_TIMEOUT_MS / 1000}s)`);
                 state.statusMessage = `${username} bağlantısı kəsildi, yenidən qoşulması gözlənilir...`;
            }

            // Qalan oyunçunu tap
            if (opponentState?.socketId && !opponentState.isDisconnected) {
                remainingPlayerSocketId = opponentState.socketId;
                 // Rəqibə bildir
                 const opponentSocket = io.sockets.sockets.get(remainingPlayerSocketId);
                 if (opponentSocket) {
                      opponentSocket.emit('opponent_left_game', { username: username, reconnecting: !isExplicitLeave && state.gamePhase !== 'game_over' && state.gamePhase !== 'waiting' });
                      // Əgər qalıcı ayrılma oldusa və oyun bitməmişdisə, rəqibi gözləməyə qaytar
                      if ((isExplicitLeave || state.gamePhase === 'game_over' || state.gamePhase === 'waiting') && state.gamePhase !== 'game_over') {
                          state.gamePhase = 'waiting';
                          state.statusMessage = "Rəqib ayrıldı. Yeni rəqib gözlənilir...";
                           // Oyun məlumatlarını sıfırla
                           state.board = Array(state.boardSize * state.boardSize).fill('');
                           if(state.player1) { state.player1.roll = null; state.player1.symbol = null; }
                           if(state.player2) { state.player2.roll = null; state.player2.symbol = null; }
                           state.currentPlayerSymbol = null; state.diceWinnerSocketId = null; state.symbolPickerSocketId = null;
                           state.winningCombination = []; state.isGameOver = false; state.winnerSymbol = null;
                           gameStateChanged = true;
                      }
                 }
            }
        } else {
             console.warn(`[handleDisconnect] Ayrılan user (${username}) gameState-də tapılmadı. Room: ${roomId}`);
        }

         // Otağın boş qalıb qalmadığını yoxla (yalnız qalıcı ayrılmalarda)
         const remainingPlayerCount = await pubClient.sCard(roomPlayersKey);
         let activePlayerCountInState = 0;
         if (state.player1?.socketId && !state.player1.isDisconnected) activePlayerCountInState++;
         if (state.player2?.socketId && !state.player2.isDisconnected) activePlayerCountInState++;

         if (remainingPlayerCount === 0 && activePlayerCountInState === 0) {
               console.log(`[handleDisconnect] Room ${roomId} is empty. Scheduling for cleanup.`);
               roomShouldBeCleaned = true;
         }
         // Yaradan ayrılıbsa və rəqib qalıbsa, yaradanı dəyişdir
         else if (remainingPlayerCount === 1 && activePlayerCountInState === 1 && roomData.creatorUserId === userId.toString()) {
              if(opponentState && opponentState.username) {
                  await pubClient.hSet(roomKey, 'creatorUsername', opponentState.username);
                  await pubClient.hSet(roomKey, 'creatorUserId', opponentState.userId.toString());
                  console.log(`[handleDisconnect] Otaq ${roomId} yaradanı '${opponentState.username}'-ə dəyişdi.`);
                  // Yaradan dəyişdiyi üçün lobbini yeniləmək lazımdır (sonda edilir)
              }
         }

         // Əgər state dəyişibsə, Redis-ə yaz
         if (gameStateChanged) {
             await saveGameStateToRedis(roomId, state);
         }

         // Əgər otaq təmizlənməlidirsə, Redis EXPIRE ilə planla
         if (roomShouldBeCleaned) {
             // Otaq açarına və oyunçu açarına expire təyin et
             const expireSeconds = ROOM_CLEANUP_DELAY_MS / 1000;
             await pubClient.multi()
                 .expire(roomKey, expireSeconds)
                 .expire(roomPlayersKey, expireSeconds)
                  .sRem('activeRooms', roomKey) // Aktiv siyahıdan dərhal çıxart? Yoxsa expire-də? Dərhal daha yaxşıdır.
                 .exec();
              console.log(`[Room Cleanup] Redis EXPIRE set for ${roomKey} and ${roomPlayersKey} (${expireSeconds}s). Removed from activeRooms.`);
         } else if (gameStateChanged && remainingPlayerSocketId) {
             // Əgər state dəyişibsə və rəqib qalıbsa, ona yenilənmiş state-i göndər
             await emitGameStateUpdateRedis(roomId, `player_${reason}_processed`);
         }

          // Lobbini yenilə
          await broadcastRoomListRedis();

    } catch (err) {
        console.error(`[handleDisconnect ERROR] User: ${username}, Room: ${roomId}, Reason: ${reason}:`, err);
        // Hata olsa belə lobbini yeniləməyə çalışaq
        try { await broadcastRoomListRedis(); } catch (e) {}
    }
}

// Yenidən qoşulma taymeri üçün ayrıca yoxlama (Redis EXPIRE handle edəcək, amma güvənmək üçün)
// Bu funksiya periodik olaraq işləyə bilər (setInterval)
async function checkExpiredReconnectTimers() {
     // Bu funksiya Redis-də qalan `room:*:disconnectTimer:*` açarlarını yoxlaya bilər
     // Əgər açar yoxdursa, deməli vaxtı bitib və oyunçu qalıcı olaraq silinməlidir.
     // Ancaq Redis EXPIRE daha etibarlı olduğu üçün bu funksiya ilkin mərhələdə lazım olmaya bilər.
     // console.log("[Timer Check] Checking expired reconnect timers (Not Implemented - Relying on Redis EXPIRE)");
}
// setInterval(checkExpiredReconnectTimers, 60 * 1000); // Məsələn, dəqiqədə bir


// ----- Server Start & Stop -----
const PORT = process.env.PORT || 8080;

async function startServer() {
    try {
        console.log("[Server Start] Redis klientlərinin qoşulması gözlənilir...");
        // Redis qoşulmasını gözlə
        await Promise.all([
            pubClient.connect(),
            subClient.connect()
        ]);
        // checkRedisReady() funksiyası artıq adapteri quraşdırmış olmalıdır
        if (!isRedisConnected) {
             // Nadir hal: connect() resolve oldu, amma 'ready' hadisəsi gəlmədi?
             console.warn("[Server Start WARN] Redis clients connected but not marked as ready yet. Waiting briefly...");
             await new Promise(resolve => setTimeout(resolve, 1000)); // 1 saniyə gözlə
             if (!isRedisConnected) {
                  throw new Error("Redis clients did not become ready after connection.");
             }
        }

        console.log("[Server Start] Verilənlər bazası bağlantısı yoxlanılır...");
        await testDBConnection(); // DB-ni yoxla

        server.listen(PORT, '0.0.0.0', () => {
            const startTime = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
            console.log('=====================================================================');
            console.log(`---- Server (Original Logic + Redis) ${PORT} portunda işə düşdü! ----`);
            console.log(`---- Server Başlama Zamanı: ${startTime} ----`);
            broadcastRoomListRedis().catch(e => console.error("Initial broadcast error:", e)); // İlkin siyahını göndər
            console.log('=====================================================================');
        });

        server.on('error', (error) => { /* ... orijinal kod ... */
            console.error(`[Server Start ERROR] server.listen XƏTASI: Port ${PORT} problemi!`, error);
            if (error.code === 'EADDRINUSE') { console.error(`XƏTA: Port ${PORT} artıq istifadə olunur.`); }
            process.exit(1);
        });

    } catch (err) {
        console.error('❌❌❌ Server işə salınarkən KRİTİK XƏTA (Redis və ya DB):', err);
        process.exit(1);
    }
}

// --- Səliqəli Dayandırma (Redis bağlantılarını da bağla) ---
async function gracefulShutdown(signal) {
    console.warn(`\n[Shutdown] ${signal} siqnalı alındı. Server bağlanır...`);
    try {
        // HTTP serverini bağla
        await new Promise((resolve, reject) => {
            server.close((err) => {
                if (err) { console.error("[Shutdown] HTTP server bağlanarkən xəta:", err); return reject(err); }
                console.log('[Shutdown] HTTP server yeni bağlantıları qəbul etmir.');
                resolve();
            });
        });

        // Socket.IO-nu bağla
        await new Promise((resolve) => {
            io.close(() => { console.log('[Shutdown] Bütün Socket.IO bağlantıları bağlandı.'); resolve(); });
        });

         // Redis klientlərini bağla
         console.log('[Shutdown] Redis klientləri bağlanır...');
         await Promise.all([
              pubClient.quit().catch(e => console.error("PubClient quit error:", e)),
              subClient.quit().catch(e => console.error("SubClient quit error:", e))
         ]);
         console.log('[Shutdown] Redis klientləri bağlandı.');

        // DB pool-u bağla
        await pool.end();
        console.log('[Shutdown] DB pool uğurla bağlandı.');

        console.warn(`[Shutdown] Server dayandırıldı (${signal}).`);
        process.exit(0); // Uğurlu çıxış

    } catch (err) {
        console.error("[Shutdown ERROR] Bağlanma prosesində xəta:", err);
        process.exit(1); // Xəta ilə çıxış
    } finally {
         // Hər ehtimala qarşı məcburi çıxış taymeri
         setTimeout(() => { console.error('[Shutdown] Proses çox uzun çəkdi! Məcburi çıxış.'); process.exit(1); }, 10000).unref();
    }
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error, origin) => { console.error('[FATAL ERROR] Uncaught Exception:', error, 'Origin:', origin); gracefulShutdown('uncaughtException'); });
process.on('unhandledRejection', (reason, promise) => { console.error('[FATAL ERROR] Unhandled Rejection at:', promise, 'reason:', reason); gracefulShutdown('unhandledRejection'); });

// Serveri Başlat
startServer();

console.log('--- server_multi.js Faylı Tamamlandı (Original Logic + Redis) ---');