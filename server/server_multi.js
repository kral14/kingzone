// server_multi.js (vPrevious Based - AI Removed, Game Logic Kept)
// Part 1/3 - Setup, Middleware, Helpers

// ---- Əsas Modulların Import Edilməsi ----
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io"); // socket.io importu düzəldildi
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const crypto = require('crypto'); // generateRoomId üçün

const saltRounds = 10;
console.log("========================================================");
console.log("--- Multiplayer Server (Previous Based) Başladılır ---");
console.log("========================================================");

// ---- Express və Socket.IO Tətbiqlərinin Yaradılması ----
const app = express();
console.log('[Setup 1.1] Express tətbiqi yaradıldı.');
const server = http.createServer(app);
console.log('[Setup 1.1] HTTP server yaradıldı.');
const io = new Server(server, { // new Server() istifadəsi
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingInterval: 10000,
    pingTimeout: 5000 // Timeout azaldıldı (əvvəlki 15000 idi)
});
console.log('[Setup 1.1] Socket.IO serveri yaradıldı.');
console.log(`[Setup 1.1] Socket.IO CORS ayarı: origin='${io.opts.cors.origin}'`);
console.log(`[Setup 1.1] Socket.IO ping ayarları: interval=${io.opts.pingInterval}, timeout=${io.opts.pingTimeout}`);

// ---- PostgreSQL Verilənlər Bazası Bağlantı Pool-u ----
if (!process.env.DATABASE_URL) {
    console.error('[FATAL ERROR 1.1] DATABASE_URL mühit dəyişəni tapılmadı! Server dayandırılır.');
    process.exit(1);
}
const pool = new Pool({
 connectionString: process.env.DATABASE_URL,
 ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false // SSL ayarı düzəldildi
});
console.log('[Setup 1.1] PostgreSQL connection pool yaradıldı.');
console.log(`[Setup 1.1] DB SSL ayarı: ${process.env.NODE_ENV === 'production' ? '{ rejectUnauthorized: false }' : 'false'}`);

// Bağlantı testi (async/await ilə daha müasir)
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
            client.release();
            console.log('[DB Check 1.1] DB test bağlantısı buraxıldı.');
        }
    }
}
testDBConnection();


// ---- Express Ayarları (Sessiondan əvvəl) ----
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
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
   pool : pool,
   tableName : 'user_sessions',
   pruneSessionInterval: 60 * 15 // 15 dəqiqə
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
console.log('[Setup 1.2] Session middleware (pgSession ilə) konfiqurasiya edildi və tətbiq olundu.');
console.log(`[Setup 1.2] Session cookie ayarları: secure=${process.env.NODE_ENV === 'production'}, httpOnly=true, maxAge=${1000 * 60 * 60 * 24 * 7}, sameSite='lax'`);

// ---- Digər Middleware-lər ----
app.use(express.json());
console.log('[Setup 1.2] Express JSON parser middleware tətbiq edildi.');

// --- Sorğu Loglama Middleware ---
app.use((req, res, next) => {
    if (req.url.includes('.') || req.url.startsWith('/api/') || req.url.startsWith('/profile') || req.url.startsWith('/login') || req.url.startsWith('/register') || req.url.startsWith('/logout') || req.url.startsWith('/check-auth') || req.url === '/') {
         console.log(`[Request Log 1.2] Request: ${req.method} ${req.originalUrl} (IP: ${req.ip})`);
    }
    next();
});
console.log('[Setup 1.2] Sadə sorğu loglama middleware tətbiq edildi.');


// --- Statik Fayl Middleware ---
// Render loglarına görə düzgün işləyən yol:
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath));
console.log('[Setup 1.2] Static files middleware tətbiq edildi. Statik qovluq:', publicDirectoryPath);

// --- Autentifikasiya Middleware Funksiyası ---
const isAuthenticated = (req, res, next) => {
 if (req.session && req.session.user && req.session.user.id) {
   return next();
 } else {
   console.warn(`[Auth Check 1.2] FAILED - Giriş tələb olunur. Path: ${req.originalUrl}, SessionID: ${req.sessionID || 'N/A'}`);
   return res.status(401).json({ message: 'Bu əməliyyat üçün giriş tələb olunur.' });
 }
};
console.log('[Setup 1.2] isAuthenticated middleware funksiyası təyin edildi.');

// ----- Yardımçı Funksiyalar və Global Dəyişənlər (Otaqlar üçün) -----
let rooms = {}; // Aktiv MULTIPLAYER oyun otaqları
let users = {}; // Qoşulu olan socket bağlantıları
console.log('[State 1.3] Qlobal `rooms` və `users` obyektləri yaradıldı.');

function generateRoomId() {
    const newId = crypto.randomBytes(6).toString('hex');
    console.log(`[Helper 1.3] Yeni Room ID yaradıldı: ${newId}`);
    return newId;
}

// ----- Oyun Vəziyyəti Strukturu -----
// Bu struktur `server_multi.js`-dən götürülüb, çünki daha detallıdır
/*
rooms[roomId].gameState = {
    board: [], boardSize: 3, currentPlayerSymbol: null,
    player1SocketId: null, player2SocketId: null,
    player1UserId: null, player2UserId: null,
    player1Username: null, player2Username: null,
    player1Symbol: null, player2Symbol: null,
    player1Roll: null, player2Roll: null,
    diceWinnerSocketId: null, symbolPickerSocketId: null,
    isGameOver: true, winnerSymbol: null, winningCombination: [],
    statusMessage: "Oyun Gözlənilir", lastMoveTime: null
};
*/
console.log('[State 1.4] Oyun vəziyyəti (gameState) strukturu təyin edildi (konseptual).');

// ----- Otaq Siyahısı Yayımı Funksiyası -----
// Bu funksiya `server_multi.js`-dən götürülüb, çünki yalnız multiplayer otaqlarını göndərir
function broadcastRoomList() {
    console.log('[Broadcast 2.1] Multiplayer otaq siyahısı bütün clientlərə göndərilir...');
    try {
        const roomListForClients = Object.values(rooms)
            .filter(room => !room.isAiRoom) // Yalnız AI olmayanlar
            .map(room => {
                const player1Info = room.gameState?.player1SocketId ? users[room.gameState.player1SocketId] : null;
                const player2Info = room.gameState?.player2SocketId ? users[room.gameState.player2SocketId] : null;
                return {
                    id: room.id, name: room.name,
                    playerCount: (room.gameState?.player1SocketId ? 1 : 0) + (room.gameState?.player2SocketId ? 1 : 0),
                    hasPassword: !!room.password, boardSize: room.boardSize,
                    creatorUsername: room.creatorUsername,
                    player1Username: player1Info?.username || room.gameState?.player1Username || null,
                    player2Username: player2Info?.username || room.gameState?.player2Username || null,
                    isAiRoom: false // Həmişə false
                };
            });
        io.emit('room_list_update', roomListForClients);
        console.log(`[Broadcast 2.1] Multiplayer otaq siyahısı yeniləndi (${roomListForClients.length} otaq).`);
    } catch (error) {
        console.error("[Broadcast 2.1] Otaq siyahısı göndərilərkən XƏTA:", error);
        io.emit('room_list_update', []);
    }
}

// ----- Server Tərəfi Oyun Məntiqi Funksiyaları -----
// Bu funksiyalar `server_multi.js`-dən götürülüb, çünki daha etibarlıdır

function initializeGameState(room, player1SocketId, player2SocketId) {
    console.log(`[Game Logic 2.2] Multiplayer otağı üçün gameState yaradılır/sıfırlanır: ${room?.id}`);
    if (!room || room.isAiRoom) { console.error("[Game Logic 2.2] initializeGameState: Keçərsiz multiplayer otaq obyekti!"); return; }
    const boardSize = room.boardSize || 3;
    const user1 = player1SocketId ? users[player1SocketId] : null;
    const user2 = player2SocketId ? users[player2SocketId] : null;

    const newGameState = {
        board: Array(boardSize * boardSize).fill(''), boardSize: boardSize,
        currentPlayerSymbol: null, player1SocketId: player1SocketId || null, player2SocketId: player2SocketId || null,
        player1UserId: user1?.userId || null, player2UserId: user2?.userId || null,
        player1Username: user1?.username || 'Oyunçu 1', player2Username: user2?.username || 'Oyunçu 2',
        player1Symbol: null, player2Symbol: null, player1Roll: null, player2Roll: null,
        diceWinnerSocketId: null, symbolPickerSocketId: null, isGameOver: false, // Başlanğıcda false
        winnerSymbol: null, winningCombination: [],
        statusMessage: (player1SocketId && player2SocketId) ? "Zər Atılır..." : "Rəqib gözlənilir...",
        lastMoveTime: Date.now()
    };
    room.gameState = newGameState;
    console.log(`[Game Logic 2.2] Multiplayer gameState yaradıldı/sıfırlandı.`);
}

// Qazanma şərtlərini generasiya edən funksiya (əvvəlki kimi vacibdir)
function generateWinConditions(size) {
    const lines = []; const n = size; const winLength = size > 4 ? 4 : 3; // 5x5 və 6x6 üçün 4-lü, digərləri üçün 3-lü
    // Üfüqi
    for (let r = 0; r < n; r++) for (let c = 0; c <= n - winLength; c++) lines.push(Array.from({ length: winLength }, (_, i) => r * n + c + i));
    // Şaquli
    for (let c = 0; c < n; c++) for (let r = 0; r <= n - winLength; r++) lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + c));
    // Diaqonal (Sol yuxarıdan sağ aşağıya)
    for (let r = 0; r <= n - winLength; r++) for (let c = 0; c <= n - winLength; c++) lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + (c + i)));
    // Diaqonal (Sağ yuxarıdan sol aşağıya)
    for (let r = 0; r <= n - winLength; r++) for (let c = winLength - 1; c < n; c++) lines.push(Array.from({ length: winLength }, (_, i) => (r + i) * n + (c - i)));
    return lines;
}


function checkWinServer(room, playerSymbolToCheck) {
    if (!room || room.isAiRoom || !room.gameState || !room.gameState.board) return false;
    const state = room.gameState; const board = state.board; const size = state.boardSize;
    state.winningCombination = [];
    const winConditions = generateWinConditions(size);
    if (winConditions.length === 0 && size > 0) { console.error(`checkWinServer: ${size}x${size} üçün qazanma şərtləri yaradıla bilmədi!`); return false; }
    for (const condition of winConditions) { // Use generated conditions
        if (board[condition[0]] === playerSymbolToCheck && condition.every(index => board[index] === playerSymbolToCheck)) {
            state.winningCombination = condition;
            console.log(`[Game Logic 2.2] Multiplayer qazanma kombinasiyası tapıldı: ${condition.join(',')}`);
            return true;
        }
    }
    return false;
}

function switchTurnServer(room) {
    if (!room || room.isAiRoom || !room.gameState || room.gameState.isGameOver || !room.gameState.player1Symbol || !room.gameState.player2Symbol) return;
    const state = room.gameState;
    state.currentPlayerSymbol = (state.currentPlayerSymbol === state.player1Symbol) ? state.player2Symbol : state.player1Symbol;
}

function handleMakeMoveServer(roomId, socketId, index) {
    const room = rooms[roomId];
    if (!room || room.isAiRoom || !room.gameState || room.gameState.isGameOver) return false;
    const state = room.gameState;
    let playerSymbol = (socketId === state.player1SocketId) ? state.player1Symbol : state.player2Symbol;
    if (!playerSymbol || state.currentPlayerSymbol !== playerSymbol || index < 0 || index >= state.board.length || state.board[index] !== '') return false;
    state.board[index] = playerSymbol; state.lastMoveTime = Date.now();
    if (checkWinServer(room, playerSymbol)) {
        state.isGameOver = true; state.winnerSymbol = playerSymbol;
        const winnerUsername = (playerSymbol === state.player1Symbol) ? state.player1Username : state.player2Username;
        state.statusMessage = `${winnerUsername || playerSymbol} Qazandı!`;
    } else if (!state.board.includes('')) {
        state.isGameOver = true; state.winnerSymbol = 'draw'; state.statusMessage = "Oyun Bərabərə!";
    } else {
        switchTurnServer(room);
        const nextPlayerUsername = (state.currentPlayerSymbol === state.player1Symbol) ? state.player1Username : state.player2Username;
        state.statusMessage = `Sıra: ${nextPlayerUsername || state.currentPlayerSymbol}`;
    }
    return true;
}

function emitGameStateUpdate(roomId, triggeringEvent = 'N/A') {
    const room = rooms[roomId];
    if (!room || room.isAiRoom || !room.gameState) { return; }
    const stateToSend = room.gameState;
    console.log(`[State Emitter 2.3] Multiplayer otağına (${roomId}) gameState göndərilir. Trigger: ${triggeringEvent}, Status: "${stateToSend.statusMessage}"`);
    io.to(roomId).emit('game_state_update', stateToSend);
}


// --- Part 1/3 Sonu ---
// server_multi.js (vPrevious Based - AI Removed, Game Logic Kept)
// Part 2/3 - HTTP API Routes

// ==========================================
// ===== HTTP API MARŞRUTLARI (ROUTES) ======
// ==========================================
console.log('[Setup 3.1] API Endpointləri (Register, Login) təyin edilir...');

// ----- Qeydiyyat Endpoint-i (/register) -----
// Bu kod sizin köhnə `server.js`-dən götürülüb (ID yaratma xaric)
app.post('/register', async (req, res) => {
 const { fullName, email, nickname, password } = req.body;
 console.log(`[API /register 3.1] Sorğu alındı: { nickname: '${nickname}', email: '${email}' }`);
 if (!fullName || !email || !nickname || !password) return res.status(400).json({ message: 'Bütün sahələr doldurulmalıdır.' });
 if (password.length < 6) return res.status(400).json({ message: 'Şifrə minimum 6 simvol olmalıdır.' });
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' });
 if (/\s/.test(nickname)) return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' });
 if (fullName.length > 50 || nickname.length > 25) return res.status(400).json({ message: 'Ad (maks 50) və ya Nickname (maks 25) çox uzundur.' });

 let client;
 try {
   client = await pool.connect();
   const checkQuery = 'SELECT email, nickname FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2) LIMIT 1';
   const checkResult = await client.query(checkQuery, [email, nickname]);
   if (checkResult.rowCount > 0) {
       const existing = checkResult.rows[0];
       if (existing.email.toLowerCase() === email.toLowerCase()) return res.status(409).json({ message: 'Bu e-poçt artıq qeydiyyatdan keçib.' });
       else return res.status(409).json({ message: 'Bu nickname artıq istifadə olunur.' });
   }
   const hashedPassword = await bcrypt.hash(password, saltRounds);
   // DB-nin öz ID yaratmasına icazə veririk (daha yaxşıdır)
   const insertQuery = `INSERT INTO users (full_name, email, nickname, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nickname;`;
   const values = [fullName, email, nickname, hashedPassword];
   const result = await client.query(insertQuery, values);
   console.log(`[API /register 3.1] UĞURLU: İstifadəçi yaradıldı:`, result.rows[0]);
   res.status(201).json({ message: 'Qeydiyyat uğurlu oldu!' });
 } catch (error) {
   console.error("[API /register 3.1] Qeydiyyat xətası:", error);
   if (error.code === '23505') { // Unikal constraint pozulması
       if (error.constraint?.includes('email')) return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' });
       if (error.constraint?.includes('nickname')) return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' });
   }
   if (!res.headersSent) res.status(500).json({ message: 'Server xətası baş verdi.' });
 } finally { if (client) client.release(); }
});

// ----- Giriş Endpoint-i (/login) -----
// Bu kod əsasən `server_multi.js`-dəki kimidir
app.post('/login', async (req, res) => {
 const { nickname, password } = req.body;
 let client;
 if (!nickname || !password) return res.status(400).json({ message: 'Nickname və şifrə daxil edilməlidir.' });
 try {
   client = await pool.connect();
   const result = await client.query('SELECT id, nickname, email, full_name, password_hash FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);
   if (result.rowCount === 0) return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
   const user = result.rows[0];
   const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
   if (!isPasswordCorrect) return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
   req.session.regenerate(regenerateErr => {
       if (regenerateErr) { console.error("[API /login 3.1] Session regenerate xətası:", regenerateErr); if (!res.headersSent) return res.status(500).json({ message: 'Session yaradılarkən xəta.' }); return; }
       req.session.user = { id: user.id, nickname: user.nickname, fullName: user.full_name, email: user.email };
       req.session.save(saveErr => {
           if (saveErr) { console.error("[API /login 3.1] Session save xətası:", saveErr); if (!res.headersSent) return res.status(500).json({ message: 'Session yaradılarkən xəta.' }); return; }
           if (!res.headersSent) res.status(200).json({ message: 'Giriş uğurlu!', nickname: user.nickname });
       });
   });
 } catch (error) { console.error("[API /login 3.1] Ümumi giriş xətası:", error); if (!res.headersSent) res.status(500).json({ message: 'Server xətası baş verdi.' });
 } finally { if (client) client.release(); }
});

console.log('[Setup 3.2] API Endpointləri (Logout, Check-Auth) təyin edilir...');
// ----- Çıxış Endpoint-i (/logout) -----
app.post('/logout', (req, res) => {
 if (req.session.user) {
   const nickname = req.session.user.nickname; const sessionID = req.sessionID;
   req.session.destroy(err => {
     if (err) { console.error("[API /logout 3.2] Session destroy xətası:", err); return res.status(500).json({ message: "Çıxış zamanı xəta baş verdi." }); }
     res.clearCookie('connect.sid');
     console.log(`[API /logout 3.2] İstifadəçi çıxdı: ${nickname}. Session ${sessionID} məhv edildi.`);
     res.status(200).json({ message: "Uğurla çıxış edildi." });
   });
 } else { res.status(400).json({ message: "Giriş edilməyib." }); }
});

// ----- Autentifikasiya Vəziyyətini Yoxlama Endpoint-i (/check-auth) -----
app.get('/check-auth', (req, res) => {
 if (req.session?.user?.id) res.status(200).json({ loggedIn: true, user: req.session.user });
 else res.status(401).json({ loggedIn: false, message: 'Sessiya tapılmadı və ya etibarsızdır.' });
});

console.log('[Setup 3.3] API Endpointləri (Profile, Root) təyin edilir...');
// ----- Profil Məlumatlarını Almaq Endpoint-i (/profile/:nickname) -----
app.get('/profile/:nickname', isAuthenticated, async (req, res) => {
 if (req.session.user.nickname.toLowerCase() !== req.params.nickname.toLowerCase()) return res.status(403).json({ message: 'Başqasının profilinə baxmaq icazəsi yoxdur.' });
 let client; try { client = await pool.connect(); const result = await client.query('SELECT id, full_name, email, nickname FROM users WHERE id = $1', [req.session.user.id]); if (result.rowCount > 0) res.status(200).json(result.rows[0]); else res.status(404).json({ message: 'İstifadəçi tapılmadı (DB-də).' }); } catch(error) { console.error("[API /profile GET 3.3] Profil alma xətası:", error); res.status(500).json({ message: 'Server xətası baş verdi.' }); } finally { if (client) client.release(); }
});

// ----- Profil Məlumatlarını Yeniləmək Endpoint-i (/profile/:nickname) -----
app.put('/profile/:nickname', isAuthenticated, async (req, res) => {
 if (req.session.user.nickname.toLowerCase() !== req.params.nickname.toLowerCase()) return res.status(403).json({ message: 'Başqasının profilini dəyişməyə icazə yoxdur.' });
 const { fullName, email, nickname: newNickname, password } = req.body;
 if (!fullName || !email || !newNickname) return res.status(400).json({ message: 'Ad Soyad, E-poçt və Nickname boş ola bilməz.' });
 if (/\s/.test(newNickname)) return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' });
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' });
 if (password && password.length < 6) return res.status(400).json({ message: 'Yeni şifrə minimum 6 simvol olmalıdır.' });
 if (fullName.length > 50 || newNickname.length > 25) return res.status(400).json({ message: 'Ad (maks 50) və ya Nickname (maks 25) çox uzundur.' });
 let client; try { client = await pool.connect(); const checkQuery = 'SELECT email, nickname FROM users WHERE (LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2)) AND id != $3 LIMIT 1'; const checkResult = await client.query(checkQuery, [email, newNickname, req.session.user.id]); if (checkResult.rowCount > 0) { const existing = checkResult.rows[0]; if (existing.email.toLowerCase() === email.toLowerCase()) return res.status(409).json({ message: 'Bu e-poçt artıq başqası tərəfindən istifadə olunur.' }); else return res.status(409).json({ message: 'Bu nickname artıq başqası tərəfindən istifadə olunur.' }); } let updateFields = ['full_name = $1', 'email = $2', 'nickname = $3']; let queryParams = [fullName, email, newNickname]; let paramIndex = 4; if (password) { const hashedPassword = await bcrypt.hash(password, saltRounds); updateFields.push(`password_hash = $${paramIndex}`); queryParams.push(hashedPassword); paramIndex++; } queryParams.push(req.session.user.id); const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id, full_name, email, nickname;`; const result = await client.query(updateQuery, queryParams); if (result.rowCount === 0) return res.status(404).json({ message: 'Yenilənəcək istifadəçi tapılmadı.' }); const updatedUserDb = result.rows[0]; req.session.user.nickname = updatedUserDb.nickname; req.session.user.fullName = updatedUserDb.full_name; req.session.user.email = updatedUserDb.email; req.session.save((saveErr) => { if (saveErr) return res.status(500).json({ message: 'Profil DB-də yeniləndi, lakin sessiya yenilənərkən xəta.' }); const updatedUserForClient = { id: updatedUserDb.id, nickname: updatedUserDb.nickname, fullName: updatedUserDb.full_name, email: updatedUserDb.email }; res.status(200).json({ message: 'Profil uğurla yeniləndi!', updatedUser: updatedUserForClient }); }); } catch (error) { console.error("[API /profile PUT 3.3] Profil yeniləmə xətası:", error); if (error.code === '23505') { if (error.constraint?.includes('email')) return res.status(409).json({ message: 'Bu e-poçt artıq başqası tərəfindən istifadə olunur (DB).' }); if (error.constraint?.includes('nickname')) return res.status(409).json({ message: 'Bu nickname artıq başqası tərəfindən istifadə olunur (DB).' }); } if (!res.headersSent) res.status(500).json({ message: 'Server xətası baş verdi.' }); } finally { if (client) client.release(); }
});

// ----- Default Kök Route (/) -----
// Eyni məntiq: giriş edibsə oyunlara, edilməyibsə loginə yönləndirir.
app.get('/', (req, res) => {
  if (req.session?.user?.id) {
      res.redirect('/OYUNLAR/oyunlar/oyunlar.html');
  } else {
      res.redirect('/ANA SEHIFE/login/login.html');
  }
});

// --- Part 2/3 Sonu ---
// server_multi.js (vPrevious Based - AI Removed, Game Logic Kept)
// Part 3/3 - Socket.IO Logic & Server Start

// ============================================
// ===== SOCKET.IO HADISƏLƏRİ (EVENTS) ======
// ============================================
console.log('[Setup 4.1] Socket.IO üçün middleware konfiqurasiyası başlayır...');
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

io.use((socket, next) => {
  if (socket.request.session?.user?.nickname) {
    socket.user = { ...socket.request.session.user };
    console.log(`[Socket Auth 4.1] OK - User: ${socket.user.nickname}, Socket: ${socket.id}`);
    next();
  } else {
    console.warn(`[Socket Auth 4.1] FAILED - Bağlantı rədd edildi. SessionID: ${socket.request.session?.id || 'N/A'}`);
    next(new Error('Authentication error'));
  }
});
console.log('[Setup 4.1] Socket.IO üçün autentifikasiya middleware təyin edildi.');
console.log('[Setup 5.1] Socket.IO "connection" handler təyin edilir...');

io.on('connection', (socket) => { // <<< --- ƏSAS BAĞLANTI BLOKU --- <<<
  const connectedUser = socket.user;
  console.log(`[Socket Connect 5.1] ++ User: ${connectedUser.nickname}, Socket: ${socket.id}`);
  users[socket.id] = { id: socket.id, userId: connectedUser.id, username: connectedUser.nickname, currentRoom: null };
  console.log(`[Socket Connect 5.1] İstifadəçi "${connectedUser.nickname}" qlobal 'users' obyektinə əlavə edildi.`);

  // İlkin otaq siyahısını göndər
  try {
    const initialRoomList = Object.values(rooms)
        .filter(room => !room.isAiRoom) // Yalnız multiplayer
        .map(room => {
            const p1 = room.gameState?.player1SocketId ? users[room.gameState.player1SocketId] : null;
            const p2 = room.gameState?.player2SocketId ? users[room.gameState.player2SocketId] : null;
            return {
                 id: room.id, name: room.name,
                 playerCount: (room.gameState?.player1SocketId ? 1 : 0) + (room.gameState?.player2SocketId ? 1 : 0),
                 hasPassword: !!room.password, boardSize: room.boardSize, creatorUsername: room.creatorUsername,
                 player1Username: p1?.username || room.gameState?.player1Username || null,
                 player2Username: p2?.username || room.gameState?.player2Username || null,
                 isAiRoom: false
            };
        });
    socket.emit('room_list_update', initialRoomList);
  } catch (listError) { console.error("İlkin otaq siyahısı xətası:", listError); socket.emit('room_list_update', []); }

  // ----- Otaq Əməliyyatları Dinləyiciləri -----
  socket.on('create_room', (data) => {
    const user = socket.user; const currentUserSocketInfo = users[socket.id];
    if (!user || !currentUserSocketInfo) return socket.emit('creation_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.');
    console.log(`[Socket Event 5.2 - create_room] Hadisə alındı: User=${user.nickname}, Data=`, data);
    if (!data || !data.name || data.name.trim().length === 0 || data.name.length > 30) return socket.emit('creation_error', 'Otaq adı boş/uzun.');
    if (data.password && (data.password.length < 2 || !(/[a-zA-Z]/.test(data.password) && /\d/.test(data.password)))) return socket.emit('creation_error', 'Şifrə tələblərə uyğun deyil.');
    if (currentUserSocketInfo.currentRoom) return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız.');
    const MAX_ROOMS = 50; if (Object.keys(rooms).filter(rid => !rooms[rid].isAiRoom).length >= MAX_ROOMS) return socket.emit('creation_error', `Maksimum multiplayer otaq sayına (${MAX_ROOMS}) çatılıb.`);

    const newRoomId = generateRoomId();
    const validatedBoardSize = Math.max(3, Math.min(6, parseInt(data.boardSize, 10) || 3));
    const newRoom = { id: newRoomId, name: data.name.trim().slice(0, 30), password: data.password || null, players: [socket.id], boardSize: validatedBoardSize, creatorUsername: user.nickname, gameState: null, isAiRoom: false, deleteTimeout: null };
    rooms[newRoomId] = newRoom; currentUserSocketInfo.currentRoom = newRoomId; socket.join(newRoomId);
    broadcastRoomList(); socket.emit('room_joined', { roomId: newRoom.id, roomName: newRoom.name, boardSize: newRoom.boardSize });
    console.log(`[Socket Event 5.2] Multiplayer otağı yaradıldı: ${newRoomId}, User: ${user.nickname}`);
  });

  socket.on('join_room', async (data) => { // Şifrə üçün async
    const user = socket.user; const currentUserSocketInfo = users[socket.id];
    if (!user || !currentUserSocketInfo) return socket.emit('join_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.');
    if (!data || !data.roomId) return socket.emit('join_error', 'Otaq ID göndərilmədi.');
    const roomId = data.roomId; const room = rooms[roomId];
    if (!room || room.isAiRoom) return socket.emit('join_error', 'Otaq tapılmadı və ya AI otağıdır.');
    if (room.password && room.password !== data.password) return socket.emit('join_error', 'Şifrə yanlışdır.');
    try {
      if (currentUserSocketInfo.currentRoom && currentUserSocketInfo.currentRoom !== roomId) return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.');
      if (room.players.length >= 2 && !room.players.includes(socket.id)) return socket.emit('join_error', 'Otaq doludur.');
      socket.join(roomId); currentUserSocketInfo.currentRoom = roomId;
      if (room.deleteTimeout) { clearTimeout(room.deleteTimeout); delete room.deleteTimeout; }
      if (!room.players.includes(socket.id)) {
          room.players.push(socket.id);
          if (room.players.length === 2) {
              initializeGameState(room, room.players[0], room.players[1]); // Oyunu başlat
              emitGameStateUpdate(roomId, 'second_player_joined'); // State göndər
          }
          broadcastRoomList();
      }
      socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });
    } catch (error) {
      console.error(`[Socket Event 5.3 - join_room] Xəta:`, error);
      if (!socket.disconnected) { socket.emit('join_error', 'Server xətası.'); socket.leave(roomId); if(currentUserSocketInfo) currentUserSocketInfo.currentRoom = null; }
    }
  });

  socket.on('player_ready_in_room', (data) => {
    const user = socket.user; const currentUserSocketInfo = users[socket.id];
    if (!user || !currentUserSocketInfo) return socket.emit('game_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.');
    if (!data || !data.roomId) return socket.emit('game_error', 'Otaq ID göndərilmədi.');
    const roomId = data.roomId; const room = rooms[roomId];
    if (!room) return socket.emit('force_redirect_lobby', { message: "Otaq mövcud deyil." });
    if (room.isAiRoom) return; // AI otaqları üçün heç nə etmə

    try {
      if (!socket.rooms.has(roomId)) socket.join(roomId);
      if (!currentUserSocketInfo.currentRoom) currentUserSocketInfo.currentRoom = roomId;
      let gameState = room.gameState; let isReconnecting = false; let playerSlotReconnecting = null;
      if (gameState) { // Yenidən qoşulmanı yoxla
        if (gameState.player1UserId === user.userId && gameState.player1SocketId !== socket.id) playerSlotReconnecting = 1;
        else if (gameState.player2UserId === user.userId && gameState.player2SocketId !== socket.id) playerSlotReconnecting = 2;
        if (playerSlotReconnecting) {
          isReconnecting = true; const oldSocketId = gameState[`player${playerSlotReconnecting}SocketId`];
          gameState[`player${playerSlotReconnecting}SocketId`] = socket.id;
          const playerIndex = room.players.indexOf(oldSocketId);
          if (playerIndex > -1) room.players.splice(playerIndex, 1, socket.id);
          else if (!room.players.includes(socket.id)) room.players.push(socket.id);
        }
      }
      if (!gameState && !isReconnecting) { // Yeni state yarat
          if (room.players.length === 1 && room.players[0] === socket.id) { initializeGameState(room, socket.id, null); gameState = room.gameState; gameState.statusMessage = "Rəqib gözlənilir..."; }
          else if (room.players.length === 2) { initializeGameState(room, room.players[0], room.players[1]); gameState = room.gameState; }
          else { return socket.emit('game_error', 'Oyun vəziyyəti yaradıla bilmədi (oyunçu sayı).'); }
      }
      if (gameState) {
          emitGameStateUpdate(roomId, 'player_ready'); // Mövcud state-i göndər
          // Otaq məlumatını da göndərək (clientdə lazım ola bilər)
          const opponentSocketId = gameState.player1SocketId === socket.id ? gameState.player2SocketId : gameState.player1SocketId;
          const opponentInfo = opponentSocketId ? users[opponentSocketId] : null;
          socket.emit('room_info', { name: room.name, creatorUsername: room.creatorUsername, hasPassword: !!room.password, boardSize: room.boardSize, opponentUsername: opponentInfo?.username || null, isAiRoom: false });
      }
      else socket.emit('game_error', 'Oyun vəziyyəti yaradıla/tapıla bilmədi.');
      if (isReconnecting) broadcastRoomList();
    } catch (error) { console.error(`[Socket Event 5.4 - player_ready] Xəta:`, error); if (!socket.disconnected) socket.emit('game_error', 'Server xətası.'); }
  });

  socket.on('leave_room', () => handleDisconnectOrLeave(socket));

  socket.on('delete_room', (data) => {
    const user = socket.user; const currentUserSocketInfo = users[socket.id];
    if (!user || !currentUserSocketInfo || !data?.roomId) return socket.emit('delete_error', 'Keçərsiz sorğu.');
    const roomId = data.roomId; const room = rooms[roomId];
    if (!room || room.isAiRoom || room.creatorUsername !== user.nickname) return socket.emit('delete_error', 'Otağı silməyə icazə yoxdur.');
    const playersToNotify = [...room.players];
    playersToNotify.forEach(playerId => { const playerSocket = io.sockets.sockets.get(playerId); if (playerSocket) { if (playerId !== socket.id) playerSocket.emit('room_deleted_kick', { message: `'${room.name}' otağı silindi.` }); playerSocket.leave(roomId); } if (users[playerId]) users[playerId].currentRoom = null; });
    delete rooms[roomId]; if (room.deleteTimeout) clearTimeout(room.deleteTimeout);
    broadcastRoomList(); console.log(`[State 5.5] Otaq ${roomId} silindi.`);
  });

  socket.on('kick_opponent', (data) => {
    const user = socket.user; const currentUserSocketInfo = users[socket.id];
    if (!user || !currentUserSocketInfo || !data?.roomId) return socket.emit('kick_error', 'Keçərsiz sorğu.');
    const roomId = data.roomId; const room = rooms[roomId];
    if (!room || room.isAiRoom || room.creatorUsername !== user.nickname) return socket.emit('kick_error', 'Rəqibi çıxarmağa icazə yoxdur.');
    const opponentSocketId = room.players.find(pId => pId !== socket.id);
    if (!opponentSocketId) return socket.emit('kick_error', 'Rəqib artıq otaqda deyil.');
    const opponentSocket = io.sockets.sockets.get(opponentSocketId); const opponentUserInfo = users[opponentSocketId];
    if (opponentSocket) { opponentSocket.emit('room_deleted_kick', { message: "Otaqdan çıxarıldınız." }); opponentSocket.leave(roomId); }
    // handleDisconnectOrLeave çağıraraq rəqibi tamamilə sistemdən çıxarırıq
    if (opponentUserInfo) handleDisconnectOrLeave({ id: opponentSocketId, user: opponentUserInfo });
    else { // Əgər opponent users-də tapılmasa (nadirdir), otaqdan manual sil
        const playerIndex = room.players.indexOf(opponentSocketId); if (playerIndex > -1) room.players.splice(playerIndex, 1);
        if (room.gameState) {
            if (room.gameState.player1SocketId === opponentSocketId) room.gameState.player1SocketId = null;
            if (room.gameState.player2SocketId === opponentSocketId) room.gameState.player2SocketId = null;
            room.gameState.isGameOver = true; room.gameState.statusMessage = "Rəqib çıxarıldı."; emitGameStateUpdate(roomId, 'opponent_kicked');
        }
        broadcastRoomList();
     }
    console.log(`[State 5.5] Rəqib (${opponentSocketId}) çıxarıldı.`);
  });

  // ----- Oyun Gedişləri və State Management Hadisələri -----
  socket.on('make_move', (data) => {
    const roomId = users[socket.id]?.currentRoom;
    if (!roomId || !rooms[roomId]?.gameState || rooms[roomId].gameState.isGameOver || data?.index === undefined) return socket.emit('game_error', 'Keçərsiz hərəkət.');
    const moveResult = handleMakeMoveServer(roomId, socket.id, data.index);
    if (moveResult) emitGameStateUpdate(roomId, 'make_move');
    else socket.emit('invalid_move', { message: 'Keçərsiz hərəkət!' });
  });

  socket.on('dice_roll_result', (data) => {
    const roomId = users[socket.id]?.currentRoom;
    if (!roomId || !rooms[roomId]?.gameState || rooms[roomId].gameState.isGameOver || rooms[roomId].gameState.currentPlayerSymbol !== null || !data || typeof data.roll !== 'number' || data.roll < 1 || data.roll > 6) return socket.emit('game_error', 'Zər atmaq mümkün deyil.');
    const state = rooms[roomId].gameState; const playerRoll = data.roll; let playerRollField = null;
    if (socket.id === state.player1SocketId) { if (state.player1Roll !== null && !state.statusMessage.includes("Bərabərlik")) return; state.player1Roll = playerRoll; playerRollField = 'player1Roll'; }
    else if (socket.id === state.player2SocketId) { if (state.player2Roll !== null && !state.statusMessage.includes("Bərabərlik")) return; state.player2Roll = playerRoll; playerRollField = 'player2Roll'; }
    else return socket.emit('game_error', 'Siz oyunçu deyilsiniz.');
    if (state.player1Roll !== null && state.player2Roll !== null) { // Hər iki oyunçu da atdı
      if (state.player1Roll > state.player2Roll) { state.diceWinnerSocketId = state.player1SocketId; state.symbolPickerSocketId = state.player1SocketId; state.statusMessage = `${state.player1Username || 'Oyunçu 1'} yüksək atdı! Simvol seçir...`; }
      else if (state.player2Roll > state.player1Roll) { state.diceWinnerSocketId = state.player2SocketId; state.symbolPickerSocketId = state.player2SocketId; state.statusMessage = `${state.player2Username || 'Oyunçu 2'} yüksək atdı! Simvol seçir...`; }
      else { state.diceWinnerSocketId = null; state.symbolPickerSocketId = null; state.player1Roll = null; state.player2Roll = null; state.statusMessage = "Bərabərlik! Zərlər təkrar atılır..."; }
      emitGameStateUpdate(roomId, 'dice_results_processed');
    } else { // Biri atdı, digəri gözlənilir
      const waitingFor = (playerRollField === 'player1Roll') ? (state.player2Username || 'Oyunçu 2') : (state.player1Username || 'Oyunçu 1');
      state.statusMessage = `${waitingFor}-in zər atması gözlənilir...`;
      emitGameStateUpdate(roomId, 'one_dice_result_received');
    }
  });

  socket.on('symbol_choice', (data) => {
    const roomId = users[socket.id]?.currentRoom;
    if (!roomId || !rooms[roomId]?.gameState || rooms[roomId].gameState.isGameOver || rooms[roomId].gameState.player1Symbol !== null || socket.id !== rooms[roomId].gameState.symbolPickerSocketId || !data || (data.symbol !== 'X' && data.symbol !== 'O')) return socket.emit('game_error', 'Simvol seçimi üçün uyğun deyil.');
    const state = rooms[roomId].gameState; const chosenSymbol = data.symbol; const opponentSymbol = (chosenSymbol === 'X') ? 'O' : 'X';
    if (socket.id === state.player1SocketId) { state.player1Symbol = chosenSymbol; state.player2Symbol = opponentSymbol; } else { state.player2Symbol = chosenSymbol; state.player1Symbol = opponentSymbol; }
    state.currentPlayerSymbol = chosenSymbol; state.symbolPickerSocketId = null; state.isGameOver = false;
    const currentPlayerUsername = (state.currentPlayerSymbol === state.player1Symbol) ? state.player1Username : state.player2Username;
    state.statusMessage = `Sıra: ${currentPlayerUsername || state.currentPlayerSymbol}`; state.lastMoveTime = Date.now();
    emitGameStateUpdate(roomId, 'symbol_chosen_game_started');
   });

  socket.on('request_restart', () => {
    const roomId = users[socket.id]?.currentRoom;
    if (!roomId || !rooms[roomId]?.gameState || !rooms[roomId].gameState.isGameOver || rooms[roomId].players.length < 2) return socket.emit('game_error', 'Yenidən başlatma təklifi üçün uyğun deyil.');
    const room = rooms[roomId]; if (room.gameState.statusMessage?.includes("təklif")) return;
    const opponentSocketId = room.players.find(pId => pId !== socket.id);
    if (opponentSocketId && io.sockets.sockets.get(opponentSocketId)) { io.to(opponentSocketId).emit('restart_requested', { username: socket.user.nickname }); socket.emit('info_message', {message:'Təklif göndərildi.'}); room.gameState.statusMessage = `${socket.user.nickname} restart təklif etdi...`; emitGameStateUpdate(roomId, 'restart_requested'); }
    else socket.emit('game_error', 'Rəqib tapılmadı.');
  });

  // Restart qəbul etmə hadisəsi köhnə kodda yox idi, amma yeni koddan götürülüb
  socket.on('accept_restart', () => {
    const roomId = users[socket.id]?.currentRoom;
    // Qəbul edənin digər oyunçu olduğundan əmin olmaq üçün yoxlama əlavə etmək olar
    if (!roomId || !rooms[roomId]?.gameState || rooms[roomId].players.length < 2 || !rooms[roomId].gameState.statusMessage?.includes("təklif")) return socket.emit('game_error', 'Restart qəbul etmək üçün uyğun deyil.');
    const room = rooms[roomId];
    const p1Id = room.gameState.player1SocketId;
    const p2Id = room.gameState.player2SocketId;
    // Təklifi edənin kim olduğunu yoxlamaq olar (state-ə əlavə etməklə)
    initializeGameState(room, p1Id, p2Id); // Oyunu sıfırla
    emitGameStateUpdate(roomId, 'restart_accepted');
  });


  // ----- Bağlantı Kəsildikdə -----
  socket.on('disconnect', (reason) => {
    console.log(`[Socket Disconnect] User: ${users[socket.id]?.username || socket.id}, Reason: ${reason}`);
    handleDisconnectOrLeave(socket);
  });

  // ----- Otaqdan Ayrılma / Bağlantı Kəsilmə Funksiyası -----
  // Bu funksiya əsasən `server_multi.js`-dən götürülüb
  function handleDisconnectOrLeave(socketInstance) {
    const socketId = socketInstance.id; if (!users[socketId]) return;
    const leavingUserInfo = { ...users[socketId] }; const username = leavingUserInfo.username; const roomId = leavingUserInfo.currentRoom;
    console.log(`[handleDisconnect] Processing: User=${username} (${socketId}), Room=${roomId || 'N/A'}`);
    delete users[socketId]; let roomExistedAndPlayerRemoved = false;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId]; const playerIndex = room.players.indexOf(socketId);
      if (playerIndex > -1) {
        roomExistedAndPlayerRemoved = true; room.players.splice(playerIndex, 1);
        if (room.gameState) { // Game state varsa işlə
             if (!room.gameState.isGameOver) { // Oyun davam edirdisə...
                 room.gameState.isGameOver = true; room.gameState.statusMessage = `${username} oyundan ayrıldı.`;
                 if (room.gameState.player1SocketId === socketId) room.gameState.player1SocketId = null;
                 if (room.gameState.player2SocketId === socketId) room.gameState.player2SocketId = null;
                 // Qalan oyunçuya opponent_left_game göndər
                 const remainingPlayerId = room.players.length === 1 ? room.players[0] : null;
                 if (remainingPlayerId) io.to(remainingPlayerId).emit('opponent_left_game', { username: username });
                 emitGameStateUpdate(roomId, 'opponent_left_game_midgame');
             } else { // Oyun bitmişdisə, sadəcə socket ID-ni təmizlə
                 if (room.gameState.player1SocketId === socketId) room.gameState.player1SocketId = null;
                 if (room.gameState.player2SocketId === socketId) room.gameState.player2SocketId = null;
                 // State yeniləməsi göndərməyə bilərik, çünki oyun onsuz da bitib
                 console.log(`[handleDisconnect] ${username} bitmiş oyundan (${roomId}) ayrıldı.`);
             }
         }

        if (room.players.length === 0 && !room.isAiRoom) {
          if (room.deleteTimeout) clearTimeout(room.deleteTimeout); const delay = 300000;
          room.deleteTimeout = setTimeout(() => { if (rooms[roomId]?.players.length === 0) { delete rooms[roomId]; broadcastRoomList(); console.log(`Boş otaq ${roomId} silindi.`); } else { if (rooms[roomId]) delete rooms[roomId].deleteTimeout; } }, delay);
          console.log(`Otaq ${roomId} boş qaldı, ${delay/60000} dəq sonra silinəcək.`);
        }
        else if (room.players.length === 1 && room.creatorUsername === username && !room.isAiRoom) { // AI olmayan otaqda yaradan çıxdısa
             const remId = room.players[0];
             if(users[remId]) room.creatorUsername = users[remId].username; else room.creatorUsername = 'Naməlum';
             console.log(`Otaq ${roomId} yaradanı ${room.creatorUsername}-ə dəyişdi.`);
        }
      }
    }
    if (roomExistedAndPlayerRemoved) broadcastRoomList();
  } // handleDisconnectOrLeave sonu

}); // <<<--- io.on('connection', ...) BLOKU --- <<<

console.log('[Setup 5.10] Socket.IO "connection" handler-i və bütün daxili dinləyicilər təyin edildi.');

// ------------------------------------------------------------------------
// --- Serveri Başlatma & Səliqəli Dayandırma ---
// ------------------------------------------------------------------------
console.log('[Setup 6.1] Serverin başladılması və dayandırılması məntiqi təyin edilir...');
// Multiplayer üçün port (əvvəlki kimi)
const PORT = process.env.PORT || 8080; // Fly.io üçün PORT dəyişəni və ya defolt 8080
console.log(`[Server Start 6.1] server_multi.js listen(${PORT}) funksiyası ÇAĞIRILIR...`);

// Serverin 0.0.0.0 ünvanında dinləməsini təmin et
server.listen(PORT, '0.0.0.0', () => { // <-- '0.0.0.0' əlavə olundu
  const startTime = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
  console.log('=======================================================');
  console.log(`---- Multiplayer Server (Previous Based) ${PORT} portunda uğurla işə düşdü! ----`);
  console.log(`---- Canlı Ünvan (təxmini): http://localhost:${PORT} ----`); // Bu localhost hələ də düzgün deyil, amma log üçündür
  console.log(`---- Server Başlama Zamanı: ${startTime} ----`);
  // createDefaultRooms(); // AI otaqları yaradılmır
  broadcastRoomList();
  console.log('=======================================================');
});
server.on('error', (error) => { console.error(`[Server Start 6.1] server.listen XƏTASI: Port ${PORT} problemi!`, error); if (error.code === 'EADDRINUSE') console.error(`XƏTA: Port ${PORT} artıq istifadə olunur.`); process.exit(1); });

// Səliqəli Dayandırma (əvvəlki kimi)
function gracefulShutdown(signal) {
    console.warn(`\n[Shutdown 6.1] ${signal} siqnalı alındı. Server bağlanır...`);
    io.close(() => { console.log('[Shutdown 6.1] Socket bağlantıları bağlandı.'); server.close((err) => { if(err) console.error("[Shutdown 6.1] HTTP server xətası:", err); else console.log('[Shutdown 6.1] HTTP server bağlandı.'); pool.end((err) => { if(err) console.error("[Shutdown 6.1] DB pool xətası:", err); else console.log('[Shutdown 6.1] DB pool bağlandı.'); console.warn('[Shutdown 6.1] Server dayandırıldı.'); process.exit(err ? 1 : 0); }); }); });
    setTimeout(() => { console.error('[Shutdown 6.1] Shutdown vaxtı bitdi!'); process.exit(1); }, 10000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => { console.error('[FATAL ERROR 6.1] Uncaught Exception:', error); gracefulShutdown('uncaughtException'); });
process.on('unhandledRejection', (reason, promise) => { console.error('[FATAL ERROR 6.1] Unhandled Rejection:', reason); gracefulShutdown('unhandledRejection'); });

// --- Faylın Sonu ---