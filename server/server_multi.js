// server_multi.js (Yenidən İşlənmiş - v1)
// Part 1/4 - Setup, Middleware, Helpers, Global Variables

// ---- Əsas Modulların Import Edilməsi ----
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io"); // socket.io importu
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const crypto = require('crypto'); // generateRoomId üçün

const saltRounds = 10;
console.log("========================================================");
console.log("--- Multiplayer Server (Yenidən İşlənmiş v1) Başladılır ---");
console.log("========================================================");

// ---- Express və Socket.IO Tətbiqlərinin Yaradılması ----
const app = express();
console.log('[Setup 1.1] Express tətbiqi yaradıldı.');
const server = http.createServer(app);
console.log('[Setup 1.1] HTTP server yaradıldı.');
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingInterval: 10000,
    pingTimeout: 5000
});
console.log('[Setup 1.1] Socket.IO serveri yaradıldı.');
console.log(`[Setup 1.1] Socket.IO CORS ayarı: origin='*'`);
console.log(`[Setup 1.1] Socket.IO ping ayarları: interval=${io.opts.pingInterval}, timeout=${io.opts.pingTimeout}`);

// ---- PostgreSQL Verilənlər Bazası Bağlantı Pool-u ----
if (!process.env.DATABASE_URL) {
    console.error('[FATAL ERROR 1.1] DATABASE_URL mühit dəyişəni tapılmadı! Server dayandırılır.');
    process.exit(1);
}
const pool = new Pool({
 connectionString: process.env.DATABASE_URL,
 // Fly.io üçün SSL ayarı (productionda tövsiyə olunur, developmentdə false)
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
        const dbTime = new Date(result.rows[0].now).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
        console.log(`---- [DB Check 1.1] Verilənlər bazasına uğurla qoşuldu: ${dbTime} ----`);
    } catch (err) {
        console.error('[DB Check 1.1] Verilənlər bazasına qoşulma və ya sorğu xətası:', err.stack);
         // Başlanğıcda DB xətası varsa, davam etməmək daha yaxşıdır
         console.error('[FATAL ERROR 1.1] DB bağlantı testi uğursuz oldu! Server dayandırılır.');
         process.exit(1);
    } finally {
        if (client) {
            client.release();
            // console.log('[DB Check 1.1] DB test bağlantısı buraxıldı.');
        }
    }
}
// Asinxron funksiyanı çağırmaq
testDBConnection();


// ---- Express Ayarları (Sessiondan əvvəl) ----
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // Fly.io kimi proxy arxasında işləyərkən lazımdır
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
   tableName : 'user_sessions', // Cədvəlin adının "user_sessions" olduğuna əmin ol!
   pruneSessionInterval: 60 * 15 // 15 dəqiqədən bir köhnə sessionları təmizlə
 }),
 secret: process.env.SESSION_SECRET,
 resave: false,
 saveUninitialized: false,
 cookie: {
   secure: process.env.NODE_ENV === 'production', // HTTPS tələb et (productionda)
   httpOnly: true, // Client tərəfi JS cookie-yə çata bilməsin
   maxAge: 1000 * 60 * 60 * 24 * 7, // 7 gün
   sameSite: 'lax' // CSRF hücumlarına qarşı qismən qoruma
 }
});
app.use(sessionMiddleware);
console.log('[Setup 1.2] Session middleware (pgSession ilə) konfiqurasiya edildi və tətbiq olundu.');
console.log(`[Setup 1.2] Session cookie ayarları: secure=${process.env.NODE_ENV === 'production'}, httpOnly=true, maxAge=${1000 * 60 * 60 * 24 * 7}, sameSite='lax'`);

// ---- Digər Middleware-lər ----
app.use(express.json()); // Gələn JSON body-lərini parse et
console.log('[Setup 1.2] Express JSON parser middleware tətbiq edildi.');

// --- Sorğu Loglama Middleware ---
// Yalnız əsas API sorğularını və ya maraqlı ola biləcək sorğuları loglayaq
app.use((req, res, next) => {
    // Statik fayl sorğularını loglamayaq (çox səs-küy yaradır)
    const isStaticFile = req.url.includes('.') && !req.url.endsWith('.html');
    if (!isStaticFile || req.url === '/favicon.ico') {
         const userNickname = req.session?.user?.nickname || 'Anonymous';
         console.log(`[Request Log 1.2] ${req.method} ${req.originalUrl} (User: ${userNickname}, IP: ${req.ip})`);
    }
    next();
});
console.log('[Setup 1.2] Təkmilləşdirilmiş sorğu loglama middleware tətbiq edildi.');


// --- Statik Fayl Middleware ---
// Kök qovluqdan bir pillə yuxarıdakı 'public' qovluğunu hədəf alırıq
const publicDirectoryPath = path.join(__dirname, '../public');
app.use(express.static(publicDirectoryPath));
console.log('[Setup 1.2] Static files middleware tətbiq edildi. Statik qovluq:', publicDirectoryPath);

// --- Autentifikasiya Middleware Funksiyası ---
const isAuthenticated = (req, res, next) => {
 if (req.session && req.session.user && req.session.user.id) {
   return next(); // İstifadəçi giriş edib, davam et
 } else {
   console.warn(`[Auth Check 1.2] FAILED - Giriş tələb olunur. Path: ${req.originalUrl}`);
   // API sorğusudursa JSON, deyilsə loginə yönləndir
   if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(401).json({ message: 'Bu əməliyyat üçün giriş tələb olunur.' });
   } else {
        // Bəlkə login səhifəsinə yönləndirmək daha yaxşıdır?
        // return res.redirect('/ana_sehife/login/login.html');
        // Hələlik 401 qaytarırıq, client tərəfi yönləndirsin
        return res.status(401).send('Giriş tələb olunur.');
   }
 }
};
console.log('[Setup 1.2] isAuthenticated middleware funksiyası təyin edildi.');

// ----- Yardımçı Funksiyalar və Global Dəyişənlər -----
let rooms = {}; // Aktiv MULTIPLAYER oyun otaqları (AI otaqları artıq yoxdur)
let users = {}; // Qoşulu olan socket bağlantıları (socket.id -> {userId, username, currentRoom})
let roomCleanupTimers = {}; // Boş otaqları silmək üçün timerlar

console.log('[State 1.3] Qlobal `rooms`, `users` və `roomCleanupTimers` obyektləri yaradıldı.');

function generateRoomId() {
    // Daha qısa və oxunaqlı ID
    return crypto.randomBytes(4).toString('hex');
}

// ----- Oyun Vəziyyəti Strukturu (Referans üçün) -----
/*
rooms[roomId] = {
    id: string,
    name: string,
    password: string | null,
    players: string[], // socket ID-ləri
    boardSize: number,
    creatorUsername: string,
    gameState: {
        board: string[],
        boardSize: number,
        currentPlayerSymbol: 'X' | 'O' | null,
        player1SocketId: string | null,
        player2SocketId: string | null,
        player1UserId: number | null, // DB user ID
        player2UserId: number | null, // DB user ID
        player1Username: string | null,
        player2Username: string | null,
        player1Symbol: 'X' | 'O' | null,
        player2Symbol: 'X' | 'O' | null,
        player1Roll: number | null,
        player2Roll: number | null,
        diceWinnerSocketId: string | null,
        symbolPickerSocketId: string | null,
        isGameOver: boolean,
        winnerSymbol: 'X' | 'O' | 'draw' | null,
        winningCombination: number[],
        statusMessage: string,
        lastMoveTime: number | null,
        // Restart üçün əlavələr
        restartRequestedBy: string | null, // socket ID
        restartAcceptedBy: Set<string>    // socket ID-lər
    } | null,
    isAiRoom: false // Bu serverdə həmişə false
};
*/
console.log('[State 1.4] Oyun vəziyyəti (gameState) strukturu təyin edildi (konseptual).');

// ----- Otaq Siyahısı Yayımı Funksiyası -----
// Bu funksiya əvvəlki kimi qala bilər, çünki yalnız multiplayer otaqlarını göndərir
function broadcastRoomList() {
    // console.log('[Broadcast 2.1] Multiplayer otaq siyahısı bütün clientlərə göndərilir...'); // Çox tez-tez loglaya bilər
    try {
        const roomListForClients = Object.values(rooms)
            // .filter(room => !room.isAiRoom) // Artıq AI otağı yoxdur deyə bu filterə ehtiyac yoxdur
            .map(room => {
                // User məlumatlarını `users` obyektindən almağa çalışaq
                const p1SocketId = room.gameState?.player1SocketId;
                const p2SocketId = room.gameState?.player2SocketId;
                const player1Username = p1SocketId && users[p1SocketId] ? users[p1SocketId].username : room.gameState?.player1Username;
                const player2Username = p2SocketId && users[p2SocketId] ? users[p2SocketId].username : room.gameState?.player2Username;

                return {
                    id: room.id,
                    name: room.name,
                    playerCount: room.players.length, // players array-inə əsasən sayı hesablayaq
                    hasPassword: !!room.password,
                    boardSize: room.boardSize,
                    creatorUsername: room.creatorUsername,
                    player1Username: player1Username || null,
                    player2Username: player2Username || null,
                    isAiRoom: false // Həmişə false
                };
            });
        io.emit('room_list_update', roomListForClients);
        // console.log(`[Broadcast 2.1] Multiplayer otaq siyahısı yeniləndi (${roomListForClients.length} otaq).`);
    } catch (error) {
        console.error("[Broadcast 2.1] Otaq siyahısı göndərilərkən XƏTA:", error);
        io.emit('room_list_update', []); // Xəta olsa boş siyahı göndər
    }
}

// ----- Server Tərəfi Oyun Məntiqi Funksiyaları -----
// Bu funksiyalar da əsasən əvvəlki kimidir, amma bəzi kiçik düzəlişlər ola bilər

// Yeni oyun vəziyyətini yaradır və ya sıfırlayır
function initializeGameState(room) {
    if (!room) {
        console.error("[Game Logic 2.2] initializeGameState: Otaq obyekti təqdim edilmədi!");
        return null;
    }
    console.log(`[Game Logic 2.2] Otaq üçün gameState yaradılır/sıfırlanır: ${room.id}`);
    const boardSize = room.boardSize || 3;
    const player1SocketId = room.players.length > 0 ? room.players[0] : null;
    const player2SocketId = room.players.length > 1 ? room.players[1] : null;
    const user1 = player1SocketId ? users[player1SocketId] : null;
    const user2 = player2SocketId ? users[player2SocketId] : null;

    const newGameState = {
        board: Array(boardSize * boardSize).fill(''),
        boardSize: boardSize,
        currentPlayerSymbol: null, // Oyun zər atma ilə başlayacaq
        player1SocketId: player1SocketId,
        player2SocketId: player2SocketId,
        player1UserId: user1?.userId || null,
        player2UserId: user2?.userId || null,
        player1Username: user1?.username || 'Gözlənilir...', // Qoşulanların adını al
        player2Username: user2?.username || 'Gözlənilir...',
        player1Symbol: null,
        player2Symbol: null,
        player1Roll: null,
        player2Roll: null,
        diceWinnerSocketId: null,
        symbolPickerSocketId: null,
        isGameOver: false, // Oyun yeni başlayır
        winnerSymbol: null,
        winningCombination: [],
        statusMessage: (player1SocketId && player2SocketId) ? "Zər Atılır..." : "Rəqib gözlənilir...",
        lastMoveTime: Date.now(),
        restartRequestedBy: null,
        restartAcceptedBy: new Set() // Set istifadəsi təkrar qəbulların qarşısını alır
    };
    room.gameState = newGameState;
    console.log(`[Game Logic 2.2] GameState yaradıldı/sıfırlandı. Status: "${newGameState.statusMessage}"`);
    return newGameState; // Yaradılan state-i qaytar
}

// Qazanma şərtlərini generasiya edən funksiya (dəyişiklik yoxdur)
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

// Qalibi yoxlayan funksiya (dəyişiklik yoxdur)
function checkWinServer(room, playerSymbolToCheck) {
    if (!room?.gameState?.board) return false;
    const state = room.gameState; const board = state.board; const size = state.boardSize;
    state.winningCombination = []; // Yoxlamadan əvvəl təmizlə
    const winConditions = generateWinConditions(size);
    if (winConditions.length === 0 && size > 0) { console.error(`checkWinServer: ${size}x${size} üçün qazanma şərtləri yaradıla bilmədi!`); return false; }
    for (const condition of winConditions) {
        if (board[condition[0]] === playerSymbolToCheck && condition.every(index => board[index] === playerSymbolToCheck)) {
            state.winningCombination = condition;
            // console.log(`[Game Logic 2.2] Qazanma kombinasiyası tapıldı: ${condition.join(',')}`);
            return true;
        }
    }
    return false;
}

// Oyun sırasını dəyişən funksiya (dəyişiklik yoxdur)
function switchTurnServer(room) {
    if (!room?.gameState || room.gameState.isGameOver || !room.gameState.player1Symbol || !room.gameState.player2Symbol) return;
    const state = room.gameState;
    state.currentPlayerSymbol = (state.currentPlayerSymbol === state.player1Symbol) ? state.player2Symbol : state.player1Symbol;
}

// Oyun vəziyyətini otaqdakı bütün oyunçulara göndərən funksiya
function emitGameStateUpdate(roomId, triggeringEvent = 'N/A') {
    const room = rooms[roomId];
    if (!room?.gameState) {
        // console.warn(`[State Emitter 2.3] emitGameStateUpdate: Otaq (${roomId}) və ya gameState tapılmadı. Trigger: ${triggeringEvent}`);
        return;
     }
    const stateToSend = room.gameState;
    // console.log(`[State Emitter 2.3] Otağa (${roomId}) gameState göndərilir. Trigger: ${triggeringEvent}, Status: "${stateToSend.statusMessage}"`);
    io.to(roomId).emit('game_state_update', stateToSend);
}


// --- HTTP API MARŞRUTLARI (Register, Login, Logout, Check-Auth, Profile, Root) ---
// Bu hissələr əvvəlki kodda olduğu kimi qalır, çünki işləyirdilər.
// Yer qazanmaq üçün buraya daxil edilmir, amma faylda olmalıdırlar.
// ----- Qeydiyyat Endpoint-i (/register) -----
app.post('/register', async (req, res) => {
    console.log('[Register DEBUG] Sorğu qəbul edildi. Body:', req.body); // Gələn datanı görək
    const { fullName, email, nickname, password } = req.body;

    // Əsas yoxlama
    if (!fullName || !email || !nickname || !password || password.length < 6) {
        console.log('[Register DEBUG] Əsas yoxlama uğursuz oldu.');
        // Səhv formatda cavab göndərməmək üçün status kodunu və mesajı dəqiqləşdirək
        return res.status(400).json({ success: false, message: 'Bütün sahələr doldurulmalı və şifrə minimum 6 simvol olmalıdır.' });
    }

    try {
        console.log('[Register DEBUG] Mövcud istifadəçi yoxlanılır...');
        const checkUser = await pool.query('SELECT id FROM users WHERE email = $1 OR nickname = $2 LIMIT 1', [email, nickname]);
        console.log('[Register DEBUG] Mövcud istifadəçi yoxlaması tamamlandı. Tapılan sıra sayı:', checkUser.rows.length);

        if (checkUser.rows.length > 0) {
            console.log('[Register DEBUG] İstifadəçi artıq mövcuddur.');
            // Hansı sahənin mövcud olduğunu dəqiqləşdirək (bu sorğu ilə dəqiq bilinmir, amma fərz edək)
            // Əslində ayrı-ayrı yoxlamaq daha yaxşıdır, amma hələlik belə qalsın.
            return res.status(409).json({ success: false, message: 'Bu email və ya nickname artıq mövcuddur.' });
        }

        console.log('[Register DEBUG] Parol hash edilir...');
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        console.log('[Register DEBUG] Parol hash edilməsi tamamlandı.');

        console.log('[Register DEBUG] Yeni istifadəçi bazaya əlavə edilir...');
        const newUser = await pool.query(
            'INSERT INTO users (full_name, email, nickname, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nickname',
            [fullName, email, nickname, hashedPassword]
        );
        console.log('[Register DEBUG] İstifadəçi əlavə edildi. Yeni istifadəçi:', newUser.rows[0]);

        // Qeydiyyat uğurlu olduqda log verək (bu sətir onsuz da var idi)
        console.log(`[Register] User registered: ${newUser.rows[0].nickname}`); 
        res.status(201).json({ success: true, message: 'Qeydiyyat uğurlu!', nickname: newUser.rows[0].nickname });
        console.log('[Register DEBUG] Uğurlu cavab göndərildi.'); // Cavab göndərildikdən sonra log

    } catch (error) {
        // Xəta baş verdikdə log verək (bu sətir onsuz da var idi)
        console.error('[Register] Qeydiyyat zamanı verilənlər bazası xətası:', error); 
        res.status(500).json({ success: false, message: 'Server xətası: Verilənlər bazası problemi.' });
        console.log('[Register DEBUG] Xəta cavabı göndərildi.'); // Xəta cavabı göndərildikdən sonra log
    }
});
// ----- Giriş Endpoint-i (/login) -----
app.post('/login', async (req, res) => {
    console.log('[Login DEBUG] Sorğu qəbul edildi. Body:', req.body); 
    const { nickname, password } = req.body;

    if (!nickname || !password) {
        console.log('[Login DEBUG] Boş nickname və ya parol.');
        return res.status(400).json({ success: false, message: 'Nickname və şifrə daxil edilməlidir.' });
    }

    try {
        console.log(`[Login DEBUG] İstifadəçi axtarılır: ${nickname}`);
        // Ehtiyat üçün email ilə də axtarış əlavə edəkmi? Yoxsa yalnız nickname? Hələlik yalnız nickname.
        // Nickname-in регистр fərqinə həssas olmamasını təmin edək (LOWERCASE ilə müqayisə)
        const result = await pool.query('SELECT * FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);
        console.log('[Login DEBUG] Baza sorğusu tamamlandı. Tapılan sıra sayı:', result.rows.length);

        if (result.rows.length === 0) {
            console.log(`[Login DEBUG] İstifadəçi tapılmadı: ${nickname}`);
            // İstifadəçiyə hansı sahənin səhv olduğunu bildirməmək daha təhlükəsizdir
            return res.status(401).json({ success: false, message: 'Nickname və ya şifrə yanlışdır.' }); 
        }

        const user = result.rows[0];
        console.log('[Login DEBUG] İstifadəçi tapıldı:', { id: user.id, nickname: user.nickname }); 

        console.log('[Login DEBUG] Parol müqayisə edilir...');
        const match = await bcrypt.compare(password, user.password_hash);
        console.log('[Login DEBUG] Parol müqayisəsi tamamlandı. Nəticə:', match);

        if (match) {
            // Parol düzgündür, sessiyanı qur
            console.log('[Login DEBUG] Parol düzgündür. Sessiya yaradılır...');
            // Sessiyaya lazım olan user məlumatlarını yazaq
            req.session.user = { 
                id: user.id, 
                nickname: user.nickname,
                fullName: user.full_name, 
                email: user.email        
            }; 
            // Sessiyanın yadda saxlanmasını gözləmək lazım deyil adətən, amma əmin olmaq üçün save() çağıra bilərik
            req.session.save(err => {
                if (err) {
                    console.error('[Login] Sessiya yadda saxlanarkən xəta:', err);
                    return res.status(500).json({ success: false, message: 'Server xətası: Sessiya problemi.' });
                }
                console.log('[Login DEBUG] Sessiya yaradıldı və yadda saxlandı:', req.session.user);
                // Uğurlu cavabı göndər
                res.json({ 
                    success: true, 
                    message: 'Giriş uğurludur!', 
                    nickname: user.nickname // Clientin yönləndirmə üçün istifadə etdiyi nickname
                });
                console.log('[Login DEBUG] Uğurlu cavab göndərildi.');
            });

        } else {
            // Parol səhvdir
            console.log('[Login DEBUG] Parol səhvdir.');
            res.status(401).json({ success: false, message: 'Nickname və ya şifrə yanlışdır.' });
            console.log('[Login DEBUG] Parol səhvdir cavabı göndərildi.');
        }

    } catch (error) {
        console.error('[Login] Login zamanı xəta:', error); 
        res.status(500).json({ success: false, message: 'Server xətası baş verdi.' });
        console.log('[Login DEBUG] Server xətası cavabı göndərildi.');
    }
});

// ----- Autentifikasiya Vəziyyətini Yoxlama Endpoint-i (/check-auth) -----
app.get('/check-auth', (req, res) => {
    // Real sessiyanı yoxlayırıq
    if (req.session && req.session.user && req.session.user.id) {
        // Sessiyada user varsa, həmin user məlumatını qaytaraq
        console.log(`[/check-auth] SUCCESS - User found in session: ${req.session.user.nickname}`);
        res.status(200).json({ 
            loggedIn: true, 
            user: req.session.user // Sessiyadakı user məlumatlarını göndər
        });
    } else {
        // Sessiyada user yoxdursa, uğursuz cavab qaytaraq
        console.log('[/check-auth] FAILED - No user in session.');
        // Status 200 OK qaytarıb, loggedIn: false demək daha doğrudur, çünki 401 xətası Console-da görünə bilər
        res.status(200).json({ loggedIn: false, user: null }); 
        // Əvvəl 401 idi, amma client tərəfi onsuz da loggedIn dəyərini yoxlayır.
    }
});

// ----- Çıxış Endpoint-i (/logout) ----- 
// (Bunun altına və ya başqa uyğun yerə əlavə edin)
// =========================
// ===== PART 1 SONU =====
// =========================
// ============================================
// ===== SOCKET.IO HADISƏLƏRİ (EVENTS) ======
// ============================================
console.log('[Setup 4.1] Socket.IO üçün middleware konfiqurasiyası başlayır...');

// Express session middleware-ni Socket.IO üçün əlçatan et
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

// Socket.IO bağlantıları üçün autentifikasiya middleware-i
io.use((socket, next) => {
  // socket.request içində session məlumatlarına baxırıq
  if (socket.request.session?.user?.nickname) {
    // Əgər sessionda user varsa, onu socket obyektinə əlavə edirik
    socket.user = { ...socket.request.session.user }; // Kopyasını saxlayaq
    // console.log(`[Socket Auth 4.1] OK - User: ${socket.user.nickname}, Socket: ${socket.id}`);
    next(); // Bağlantıya icazə ver
  } else {
    // Session yoxdursa və ya user məlumatı tapılmadısa, bağlantını rədd et
    console.warn(`[Socket Auth 4.1] FAILED - Bağlantı rədd edildi (session/user tapılmadı).`);
    next(new Error('Authentication error: User not logged in')); // Xəta ilə rədd et
  }
});
console.log('[Setup 4.1] Socket.IO üçün autentifikasiya middleware təyin edildi.');

console.log('[Setup 5.1] Socket.IO "connection" handler təyin edilir...');

// Əsas bağlantı hadisəsi
io.on('connection', (socket) => { // <<< --- ƏSAS BAĞLANTI BLOKU BAŞLAYIR --- <<<
    // Yeni qoşulan istifadəçinin məlumatlarını user obyektindən götürürük
    const connectedUser = socket.user;
    if (!connectedUser) {
        console.error(`[Socket Connect 5.1] XƏTA: Autentifikasiyadan keçmiş soketdə user məlumatı tapılmadı! Socket ID: ${socket.id}`);
        socket.disconnect(true); // Bağlantını dərhal kəs
        return;
    }

    console.log(`[Socket Connect 5.1] ++ User Connected: ${connectedUser.nickname} (ID: ${connectedUser.id}), Socket: ${socket.id}`);

    // Yeni qoşulan istifadəçini qlobal `users` obyektinə əlavə et
    // Əgər eyni user ID ilə başqa socket varsa, onu yenisi ilə əvəz edə bilərik (köhnəni disconnect etməklə?)
    // Hələlik sadəcə əlavə edirik:
    users[socket.id] = {
        id: socket.id,
        userId: connectedUser.id,
        username: connectedUser.nickname,
        currentRoom: null // Başlanğıcda heç bir otaqda deyil
    };
    // console.log(`[Socket Connect 5.1] İstifadəçi "${connectedUser.nickname}" qlobal 'users' obyektinə əlavə edildi.`);

    // Yeni qoşulan client-ə ilkin otaq siyahısını göndər
    try {
        // broadcastRoomList() funksiyası artıq user məlumatlarını da daxil edir
        const initialRoomList = Object.values(rooms)
            .map(room => {
                const p1SocketId = room.gameState?.player1SocketId;
                const p2SocketId = room.gameState?.player2SocketId;
                const player1Username = p1SocketId && users[p1SocketId] ? users[p1SocketId].username : room.gameState?.player1Username;
                const player2Username = p2SocketId && users[p2SocketId] ? users[p2SocketId].username : room.gameState?.player2Username;
                return {
                    id: room.id, name: room.name, playerCount: room.players.length, hasPassword: !!room.password,
                    boardSize: room.boardSize, creatorUsername: room.creatorUsername,
                    player1Username: player1Username || null, player2Username: player2Username || null, isAiRoom: false
                 };
             });
        socket.emit('room_list_update', initialRoomList);
    } catch (listError) {
        console.error("İlkin otaq siyahısı göndərilərkən xəta:", listError);
        socket.emit('room_list_update', []);
    }

    // ----- Otaq Əməliyyatları Dinləyiciləri -----

    // Yeni otaq yaratma hadisəsi
    socket.on('create_room', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        // Təkrar yoxlamalar (hər ehtimala qarşı)
        if (!user || !currentUserSocketInfo) {
            console.error(`[create_room] Xəta: User (${user?.nickname}) və ya SocketInfo (${currentUserSocketInfo}) tapılmadı. Socket: ${socket.id}`);
            return socket.emit('creation_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.');
        }

        console.log(`[Socket Event 5.2 - create_room] Hadisə alındı: User=${user.nickname}, Data=`, data);

        // Validasiya
        if (!data || !data.name || data.name.trim().length === 0 || data.name.length > 30) {
            return socket.emit('creation_error', 'Otaq adı etibarsızdır (boş və ya çox uzun).');
        }
        const roomName = data.name.trim().slice(0, 30);
        const roomPassword = data.password || null; // Şifrə yoxdursa null
        if (roomPassword && (roomPassword.length < 2)) { // Şifrə varsa, uzunluğunu yoxla (daha sadə)
            return socket.emit('creation_error', 'Şifrə çox qısadır (minimum 2 simvol).');
        }
        if (currentUserSocketInfo.currentRoom) {
            console.warn(`[create_room] İstifadəçi ${user.nickname} (${socket.id}) artıq ${currentUserSocketInfo.currentRoom} otağındadır.`);
            return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız. Əvvəlcə ordan çıxın.');
        }
        // Aktiv multiplayer otaq sayını yoxla
        const MAX_ROOMS = 50; // Limiti konfiqurasiya etmək olar
        if (Object.keys(rooms).length >= MAX_ROOMS) {
            return socket.emit('creation_error', `Maksimum otaq sayına (${MAX_ROOMS}) çatılıb.`);
        }

        // Yeni Otaq Yaratmaq
        const newRoomId = generateRoomId();
        const validatedBoardSize = Math.max(3, Math.min(6, parseInt(data.boardSize, 10) || 3));

        const newRoom = {
            id: newRoomId,
            name: roomName,
            password: roomPassword, // Şifrəni olduğu kimi saxla (hash etməyə ehtiyac yoxdur, sadə yoxlama)
            players: [socket.id], // Yaradanı dərhal əlavə et
            boardSize: validatedBoardSize,
            creatorUsername: user.nickname,
            gameState: null, // Oyun hələ başlamayıb
            isAiRoom: false
            // roomCleanupTimers artıq qlobal obyektə köçürülüb
        };

        rooms[newRoomId] = newRoom; // Yeni otağı qlobal obyektə əlavə et
        currentUserSocketInfo.currentRoom = newRoomId; // İstifadəçinin olduğu otağı qeyd et
        socket.join(newRoomId); // İstifadəçini socket.io otağına əlavə et

        console.log(`[Socket Event 5.2] Multiplayer otağı yaradıldı: ID=${newRoomId}, Ad='${newRoom.name}', Yaradan=${user.nickname}, Ölçü=${validatedBoardSize}x${validatedBoardSize}`);

        // Bütün clientlərə yenilənmiş otaq siyahısını göndər
        broadcastRoomList();

        // Otağı yaradana qoşulduğunu bildir və oyun səhifəsinə yönləndir
        socket.emit('room_joined', {
            roomId: newRoom.id,
            roomName: newRoom.name,
            boardSize: newRoom.boardSize
        });
    });

    // Mövcud otağa qoşulma hadisəsi
    socket.on('join_room', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        if (!user || !currentUserSocketInfo) {
             console.error(`[join_room] Xəta: User və ya SocketInfo tapılmadı. Socket: ${socket.id}`);
             return socket.emit('join_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.');
        }
        if (!data || !data.roomId) {
            return socket.emit('join_error', 'Otaq ID göndərilmədi.');
        }

        const roomId = data.roomId;
        const room = rooms[roomId];

        console.log(`[Socket Event 5.3 - join_room] Hadisə alındı: User=${user.nickname}, RoomID=${roomId}`);

        if (!room) {
            return socket.emit('join_error', 'Otaq tapılmadı.');
        }
        if (room.isAiRoom) { // Bu serverdə AI otağı olmamalıdır, amma yoxlayaq
             return socket.emit('join_error', 'Bu server yalnız multiplayer otaqlarını dəstəkləyir.');
        }
        if (room.password && room.password !== data.password) {
            return socket.emit('join_error', 'Şifrə yanlışdır.');
        }
        // Oyunçu sayını yoxla (yalnız 2 oyunçu ola bilər)
        if (room.players.length >= 2 && !room.players.includes(socket.id)) {
            return socket.emit('join_error', 'Otaq doludur.');
        }
        // İstifadəçinin başqa otaqda olub olmadığını yoxla
        if (currentUserSocketInfo.currentRoom && currentUserSocketInfo.currentRoom !== roomId) {
            console.warn(`[join_room] İstifadəçi ${user.nickname} (${socket.id}) artıq ${currentUserSocketInfo.currentRoom} otağındadır.`);
            return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.');
        }

        // Qoşulma Əməliyyatı
        try {
            socket.join(roomId); // Socket.io otağına qoş
            currentUserSocketInfo.currentRoom = roomId; // İstifadəçinin olduğu otağı qeyd et

            // Əgər otaq silinmə üçün gözləyirdisə, timeri ləğv et
            if (roomCleanupTimers[roomId]) {
                clearTimeout(roomCleanupTimers[roomId]);
                delete roomCleanupTimers[roomId];
                console.log(`[join_room] Otaq ${roomId} üçün silinmə taymeri ləğv edildi.`);
            }

            // Əgər oyunçu artıq otaqda deyilsə, onu `players` array-inə əlavə et
            if (!room.players.includes(socket.id)) {
                room.players.push(socket.id);
                console.log(`[join_room] İstifadəçi ${user.nickname} (${socket.id}) ${roomId} otağına qoşuldu. Oyunçular: ${room.players.length}`);

                // Əgər ikinci oyunçu qoşuldusa, oyunu başlat
                if (room.players.length === 2) {
                    // initializeGameState artıq user məlumatlarını users[]-dən alacaq
                    initializeGameState(room);
                    emitGameStateUpdate(roomId, 'second_player_joined'); // Oyun vəziyyətini göndər
                }
                // Otaq siyahısını yenilə
                broadcastRoomList();
            } else {
                 // Əgər oyunçu artıq otaqda idisə (məs. səhifəni yeniləyib), mövcud vəziyyəti göndər
                 console.log(`[join_room] İstifadəçi ${user.nickname} (${socket.id}) ${roomId} otağına yenidən qoşuldu (və ya artıq orda idi).`);
                 if(room.gameState) { // Oyun başlamışdısa
                     emitGameStateUpdate(roomId, 'rejoin_request');
                 } else if (room.players.length === 2) { // Oyun başlamalıdırsa
                      initializeGameState(room);
                      emitGameStateUpdate(roomId, 'rejoin_initialize');
                 }
            }

            // Qoşulan client-ə təsdiq göndər
            socket.emit('room_joined', {
                roomId: room.id,
                roomName: room.name,
                boardSize: room.boardSize
            });

        } catch (error) {
            console.error(`[Socket Event 5.3 - join_room] Qoşulma zamanı xəta (RoomID: ${roomId}):`, error);
            // Xəta baş verərsə, client-i otaqdan çıxarmağa çalışaq
            try {
                 socket.leave(roomId);
                 if(users[socket.id]) users[socket.id].currentRoom = null;
                 // Əgər players array-ində idisə, ordan da sil
                 const playerIndex = room?.players.indexOf(socket.id);
                 if (playerIndex > -1) room.players.splice(playerIndex, 1);
            } catch (leaveError) {
                 console.error(`[Socket Event 5.3 - join_room] Xəta sonrası leave xətası:`, leaveError);
            }
            if (!socket.disconnected) {
                socket.emit('join_error', 'Otağa qoşularkən server xətası baş verdi.');
            }
        }
    });

    // Otaqdan ayrılma hadisəsi
    socket.on('leave_room', () => {
        // Ayrılma məntiqi disconnect ilə eyni olduğu üçün onu çağırırıq
        console.log(`[Socket Event 5.5 - leave_room] Hadisə alındı: User=${socket.user?.nickname} (${socket.id})`);
        handleDisconnectOrLeave(socket, 'leave_room');
    });

    // Otaq parametrlərini yeniləmə hadisəsi (YARADAN TƏRƏFİNDƏN)
    socket.on('update_room_settings', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        if (!user || !currentUserSocketInfo || !data?.roomId) {
            return socket.emit('update_room_settings_result', { success: false, message: 'Keçərsiz sorğu.' });
        }

        const roomId = data.roomId;
        const room = rooms[roomId];

        if (!room) {
            return socket.emit('update_room_settings_result', { success: false, message: 'Otaq tapılmadı.' });
        }
        if (room.creatorUsername !== user.nickname) {
            return socket.emit('update_room_settings_result', { success: false, message: 'Yalnız otağı yaradan parametrləri dəyişə bilər.' });
        }
        // Oyun davam edərkən ölçünü dəyişməyə icazə verməyək
        if (room.gameState && !room.gameState.isGameOver && data.newBoardSize && parseInt(data.newBoardSize, 10) !== room.boardSize) {
             return socket.emit('update_room_settings_result', { success: false, message: 'Oyun davam edərkən lövhə ölçüsünü dəyişmək olmaz.' });
        }

        console.log(`[Socket Event 5.6 - update_room_settings] Hadisə alındı: RoomID=${roomId}, User=${user.nickname}, Data=`, data);

        let updated = false;
        // Adı yenilə
        if (data.newName && data.newName.trim().length > 0 && data.newName.trim().slice(0, 30) !== room.name) {
            room.name = data.newName.trim().slice(0, 30);
            console.log(`[update_room_settings] Room ${roomId} adı dəyişdi: '${room.name}'`);
            updated = true;
        }
        // Şifrəni yenilə
        if (data.newPassword !== undefined) { // undefined gəlibsə deməli dəyişmək istənilir
            const newPass = data.newPassword; // null və ya string ola bilər
            if (newPass && newPass.length < 2) {
                 return socket.emit('update_room_settings_result', { success: false, message: 'Yeni şifrə çox qısadır.' });
            }
            if(newPass !== room.password) { // Yalnız fərqlidirsə yenilə
                room.password = newPass;
                console.log(`[update_room_settings] Room ${roomId} şifrə statusu dəyişdi: ${newPass ? 'Şifrəli' : 'Açıq'}`);
                updated = true;
            }
        }
        // Lövhə ölçüsünü yenilə (yalnız oyun bitibsə və ya başlamayıbsa)
        if (data.newBoardSize && (!room.gameState || room.gameState.isGameOver)) {
            const newSize = Math.max(3, Math.min(6, parseInt(data.newBoardSize, 10) || room.boardSize));
            if (newSize !== room.boardSize) {
                 room.boardSize = newSize;
                 // Əgər oyun bitibsə, yeni ölçü ilə gameState-i sıfırlayaq? Yoxsa restart gözləyək?
                 // Hələlik sadəcə ölçünü dəyişək. Yeni oyun restart ilə başlayacaq.
                 console.log(`[update_room_settings] Room ${roomId} lövhə ölçüsü dəyişdi: ${newSize}x${newSize}`);
                 updated = true;
                 // Əgər gameState varsa, oradakı boardSize-ı da yenilə
                 if (room.gameState) room.gameState.boardSize = newSize;
            }
        }

        if (updated) {
            // Otaq siyahısını yeniləyib hamıya göndər
            broadcastRoomList();
            // Parametrləri dəyişənə uğurlu cavab göndər
            socket.emit('update_room_settings_result', { success: true, message: 'Otaq parametrləri uğurla yeniləndi!' });
            // Otaqdakı digər oyunçuya da məlumat verə bilərik ( lazım olsa )
            // io.to(roomId).except(socket.id).emit('info_message', { message: 'Otaq parametrləri yaradan tərəfindən dəyişdirildi.' });
        } else {
            socket.emit('update_room_settings_result', { success: true, message: 'Heç bir dəyişiklik edilmədi.' });
        }
    });

    // Otağı silmə hadisəsi (YARADAN TƏRƏFİNDƏN)
    socket.on('delete_room', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        if (!user || !currentUserSocketInfo || !data?.roomId) {
             return socket.emit('delete_error', 'Keçərsiz sorğu.');
        }
        const roomId = data.roomId;
        const room = rooms[roomId];

        if (!room) {
            return socket.emit('delete_error', 'Silinəcək otaq tapılmadı.');
        }
        if (room.isAiRoom) { // AI otağı silinmir
             return socket.emit('delete_error', 'AI otaqları silinə bilməz.');
        }
        if (room.creatorUsername !== user.nickname) {
            return socket.emit('delete_error', 'Yalnız otağı yaradan onu silə bilər.');
        }

        console.log(`[Socket Event 5.7 - delete_room] Hadisə alındı: RoomID=${roomId}, User=${user.nickname}`);

        // Otaqdakı bütün oyunçulara məlumat ver və otaqdan çıxart
        const playersInRoom = [...room.players]; // Kopyasını alaq
        playersInRoom.forEach(playerId => {
            const playerSocket = io.sockets.sockets.get(playerId);
            if (playerSocket) {
                // Silənə yox, digərlərinə kick mesajı göndər
                if (playerId !== socket.id) {
                     playerSocket.emit('room_deleted_kick', { message: `'${room.name}' otağı yaradan tərəfindən silindi.` });
                }
                playerSocket.leave(roomId); // Socket.io otağından çıxart
            }
            // User-in currentRoom məlumatını sıfırla
            if (users[playerId]) {
                 users[playerId].currentRoom = null;
            }
        });

        // Otağı qlobal siyahıdan sil
        delete rooms[roomId];
        // Əgər silinmə taymeri varsa, onu təmizlə
        if (roomCleanupTimers[roomId]) {
            clearTimeout(roomCleanupTimers[roomId]);
            delete roomCleanupTimers[roomId];
        }

        console.log(`[State 5.7] Otaq ${roomId} ('${room.name}') yaradan (${user.nickname}) tərəfindən silindi.`);

        // Otaq siyahısını yeniləyib hamıya göndər
        broadcastRoomList();
        // Silənə xüsusi bir təsdiq mesajı göndərməyə ehtiyac yoxdur, onsuz da lobby-yə qayıdacaq.
    });

    // Rəqibi otaqdan çıxarma hadisəsi (YARADAN TƏRƏFİNDƏN)
    socket.on('kick_opponent', (data) => {
        const user = socket.user;
        const currentUserSocketInfo = users[socket.id];
        if (!user || !currentUserSocketInfo || !data?.roomId) {
            return socket.emit('kick_error', 'Keçərsiz sorğu.');
        }
        const roomId = data.roomId;
        const room = rooms[roomId];

        if (!room) {
            return socket.emit('kick_error', 'Otaq tapılmadı.');
        }
        if (room.isAiRoom) {
            return socket.emit('kick_error', 'AI-ni otaqdan çıxarmaq olmaz.');
        }
        if (room.creatorUsername !== user.nickname) {
            return socket.emit('kick_error', 'Yalnız otağı yaradan rəqibi çıxara bilər.');
        }

        // Çıxarılacaq rəqibin socket ID-sini tap
        const opponentSocketId = room.players.find(pId => pId !== socket.id);

        if (!opponentSocketId) {
            return socket.emit('kick_error', 'Otaqda çıxarılacaq rəqib yoxdur.');
        }

        console.log(`[Socket Event 5.8 - kick_opponent] Hadisə alındı: RoomID=${roomId}, User=${user.nickname}, OpponentSocket=${opponentSocketId}`);

        const opponentSocket = io.sockets.sockets.get(opponentSocketId);
        const opponentUserInfo = users[opponentSocketId];

        // Rəqibə məlumat ver və otaqdan çıxart
        if (opponentSocket) {
            opponentSocket.emit('room_deleted_kick', { message: `'${room.name}' otağından yaradan tərəfindən çıxarıldınız.` });
            opponentSocket.leave(roomId);
        }
        // Rəqibin user məlumatını yenilə və otaqdan çıxart (əgər users-də varsa)
        if (opponentUserInfo) {
             handleDisconnectOrLeave(opponentSocket || { id: opponentSocketId, user: opponentUserInfo }, 'kick'); // Rəqibi disconnect kimi emal et
             console.log(`[kick_opponent] Rəqib (${opponentUserInfo.username}, ${opponentSocketId}) ${roomId} otağından çıxarıldı.`);
             // Yaradana təsdiq mesajı göndər
             socket.emit('info_message', { message: `'${opponentUserInfo.username}' otaqdan çıxarıldı.` });
        } else {
             // Əgər rəqib users-də tapılmasa (qəribə haldır), manual olaraq otaqdan silək
             const playerIndex = room.players.indexOf(opponentSocketId);
             if (playerIndex > -1) {
                 room.players.splice(playerIndex, 1);
                 if (room.gameState) {
                     if (room.gameState.player1SocketId === opponentSocketId) room.gameState.player1SocketId = null;
                     if (room.gameState.player2SocketId === opponentSocketId) room.gameState.player2SocketId = null;
                     // Oyunu sıfırlamaq və ya sadəcə gözləmə vəziyyətinə keçirmək?
                     // Hələlik sadəcə rəqibin ayrıldığını bildirək
                     room.gameState.player2Username = "Gözlənilir...";
                     room.gameState.player2UserId = null;
                     room.gameState.player2Symbol = null;
                     room.gameState.player2Roll = null;
                     // Oyun davam edirdisə, bitirək? Yoxsa sadəcə statusu dəyişək?
                     if(!room.gameState.isGameOver){
                         room.gameState.statusMessage = "Rəqib çıxarıldı. Yeni rəqib gözlənilir...";
                         // Sıranı da sıfırlayaq?
                         room.gameState.currentPlayerSymbol = null;
                     }
                     emitGameStateUpdate(roomId, 'opponent_kicked');
                 }
                 broadcastRoomList(); // Oyunçu sayı dəyişdi
             }
             console.warn(`[kick_opponent] Rəqib (${opponentSocketId}) 'users' obyektində tapılmadı, amma otaqdan silindi.`);
             socket.emit('info_message', { message: `Rəqib otaqdan çıxarıldı.` });
        }
    });


    // ----- Oyun Məntiqi Hadisələri (Növbəti Partda) -----
    // socket.on('player_ready_in_room', ...)
    // socket.on('make_move', ...)
    // socket.on('dice_roll_result', ...)
    // socket.on('symbol_choice', ...)
    // socket.on('request_restart', ...)
    // socket.on('accept_restart', ...)


    // ----- Bağlantı Kəsilmə Hadisəsi -----
    socket.on('disconnect', (reason) => {
        console.log(`[Socket Disconnect] User: ${users[socket.id]?.username || socket.id} disconnected. Reason: ${reason}`);
        handleDisconnectOrLeave(socket, reason); // Ayrılma məntiqini çağır
    });


    // ----- Bağlantı Kəsilmə və Otaqdan Ayrılma üçün Ümumi Funksiya -----
    function handleDisconnectOrLeave(socketInstance, reason = 'disconnect') {
        const socketId = socketInstance.id;
        const leavingUserInfo = users[socketId];

        // İstifadəçi artıq silinibse və ya tapılmırsa heç nə etmə
        if (!leavingUserInfo) {
            // console.log(`[handleDisconnectOrLeave] User info for socket ${socketId} not found (already processed?).`);
            return;
        }

        const username = leavingUserInfo.username;
        const roomId = leavingUserInfo.currentRoom;

        console.log(`[handleDisconnectOrLeave] Processing: User=${username} (${socketId}), Room=${roomId || 'N/A'}, Reason: ${reason}`);

        // İstifadəçini qlobal siyahıdan sil
        delete users[socketId];

        let roomExistedAndPlayerRemoved = false;
        let updatedRoomInfo = null;

        // Əgər istifadəçi bir otaqda idisə...
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            const playerIndex = room.players.indexOf(socketId);

            if (playerIndex > -1) {
                roomExistedAndPlayerRemoved = true;
                room.players.splice(playerIndex, 1); // Oyunçunu otaqdan sil
                console.log(`[handleDisconnectOrLeave] User ${username} removed from room ${roomId}. Players left: ${room.players.length}`);

                // Əgər oyun vəziyyəti (gameState) varsa...
                if (room.gameState) {
                    // Əgər oyun bitməmişdisə, oyunu dayandır və qalan oyunçuya bildir
                    if (!room.gameState.isGameOver) {
                        room.gameState.isGameOver = true;
                        room.gameState.winnerSymbol = null; // Qalib yoxdur
                        room.gameState.statusMessage = `${username} oyundan ayrıldı.`;

                        // Qalan oyunçunun socket ID-sini tap
                        const remainingPlayerId = room.players.length === 1 ? room.players[0] : null;

                        // Ayrılan oyunçunun məlumatlarını gameState-dən təmizlə
                        if (room.gameState.player1SocketId === socketId) {
                            room.gameState.player1SocketId = null;
                            room.gameState.player1UserId = null;
                            room.gameState.player1Username = "Ayrıldı";
                        } else if (room.gameState.player2SocketId === socketId) {
                            room.gameState.player2SocketId = null;
                            room.gameState.player2UserId = null;
                            room.gameState.player2Username = "Ayrıldı";
                        }

                        // Əgər bir oyunçu qalıbsa, ona rəqibin ayrıldığını bildir
                        if (remainingPlayerId && io.sockets.sockets.get(remainingPlayerId)) {
                            io.to(remainingPlayerId).emit('opponent_left_game', { username: username });
                        }
                        // Yenilənmiş oyun vəziyyətini (əgər kimsə qalıbsa) göndər
                        if (remainingPlayerId) {
                             emitGameStateUpdate(roomId, 'opponent_left_midgame');
                        }

                    } else {
                        // Oyun onsuz da bitmişdisə, sadəcə ayrılan oyunçunun socket ID-sini null et
                        if (room.gameState.player1SocketId === socketId) room.gameState.player1SocketId = null;
                        if (room.gameState.player2SocketId === socketId) room.gameState.player2SocketId = null;
                        console.log(`[handleDisconnectOrLeave] ${username} left room ${roomId} after game finished.`);
                        // Bu halda state update göndərməyə ehtiyac yoxdur.
                    }
                } // if (room.gameState) sonu

                // Otağın boş qalıb qalmadığını yoxla
                if (room.players.length === 0) {
                    // Əgər otaq boş qalıbsa və silinmə taymeri yoxdursa, başlat
                    if (!roomCleanupTimers[roomId]) {
                        const CLEANUP_DELAY = 5 * 60 * 1000; // 5 dəqiqə
                        roomCleanupTimers[roomId] = setTimeout(() => {
                            // Taymer işə düşəndə otağın hələ də mövcud və boş olduğunu yoxla
                            if (rooms[roomId] && rooms[roomId].players.length === 0) {
                                console.log(`[Room Cleanup] Boş qalan otaq ${roomId} ('${rooms[roomId].name}') silinir.`);
                                delete rooms[roomId];
                                broadcastRoomList(); // Otaq silindiyi üçün siyahını yenilə
                            }
                            delete roomCleanupTimers[roomId]; // Taymeri siyahıdan sil
                        }, CLEANUP_DELAY);
                        console.log(`[handleDisconnectOrLeave] Otaq ${roomId} boş qaldı. ${CLEANUP_DELAY / 60000} dəq sonra silinmə planlaşdırıldı.`);
                    }
                }
                // Əgər otaqda 1 nəfər qalıbsa və ayrılan yaradan idisə, yaradanı dəyiş
                else if (room.players.length === 1 && room.creatorUsername === username) {
                     const remainingPlayerId = room.players[0];
                     if (users[remainingPlayerId]) {
                         room.creatorUsername = users[remainingPlayerId].username;
                         console.log(`[handleDisconnectOrLeave] Otaq ${roomId} yaradanı '${room.creatorUsername}'-ə dəyişdi.`);
                     } else {
                          room.creatorUsername = "Naməlum"; // Qalan oyunçunun məlumatı tapılmasa
                          console.warn(`[handleDisconnectOrLeave] Otaq ${roomId} yaradanı dəyişdirilə bilmədi (qalan oyunçu tapılmadı).`);
                     }
                }

                updatedRoomInfo = room; // Yenilənmiş otaq məlumatını saxlayaq
            } // if (playerIndex > -1) sonu
        } // if (roomId && rooms[roomId]) sonu

        // Əgər otaq vəziyyəti dəyişibsə, otaq siyahısını yenilə
        if (roomExistedAndPlayerRemoved) {
            broadcastRoomList();
        }
    } // handleDisconnectOrLeave sonu

}); // <<<--- io.on('connection', ...) BLOKU SONU --- <<<


// =========================
// ===== PART 2 SONU =====
// =========================
// server_multi.js (Yenidən İşlənmiş - v1)
// Part 3/4 - Game Logic Socket Event Handlers

// ... (Part 1 və Part 2-dən olan kodlar burada fərz edilir) ...

io.on('connection', (socket) => {
  // ... (Part 2-dəki 'connection', 'create_room', 'join_room', 'leave_room', 'update_room_settings', 'delete_room', 'kick_opponent', 'disconnect' handlerləri burada fərz edilir) ...

  // ----- Oyun Məntiqi Hadisələri -----

  /**
   * DƏYİŞDİRİLDİ: Oyunçu otaq səhifəsinə daxil olduqda və hazır olduğunu bildirdikdə.
   * Bu funksiya indi istifadəçinin qısa müddət əvvəl ayrılıb yenidən qoşulduğunu
   * (yeni socket ID ilə) anlamağa çalışır və onu oyuna qaytarır.
   */
  socket.on('player_ready_in_room', (data) => {
      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      if (!user || !currentUserSocketInfo) {
          console.error(`[player_ready_in_room] Xəta: User və ya SocketInfo tapılmadı. Socket: ${socket.id}`);
          return socket.emit('game_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.');
      }
      if (!data || !data.roomId) {
          return socket.emit('game_error', 'Otaq ID göndərilmədi.');
      }

      const roomId = data.roomId;
      const room = rooms[roomId];

      console.log(`[Socket Event 5.4 - player_ready_in_room] Hadisə alındı: User=${user.nickname} (${socket.id}), RoomID=${roomId}`);

      if (!room) {
          console.warn(`[player_ready_in_room] Otaq ${roomId} tapılmadı. Client lobby-yə yönləndirilir.`);
          return socket.emit('force_redirect_lobby', { message: "Daxil olmaq istədiyiniz otaq artıq mövcud deyil." });
      }

      // Client-in socket.io otağına qoşulduğundan əmin ol
      if (!socket.rooms.has(roomId)) {
           console.log(`[player_ready_in_room] Socket ${socket.id} otağa (${roomId}) qoşulur.`);
           socket.join(roomId);
      }
      // User-in currentRoom məlumatını yenilə
      currentUserSocketInfo.currentRoom = roomId;

      let gameState = room.gameState;
      let isReconnecting = false;
      let playerSlotReconnecting = null;

      // --- YENİDƏN QOŞULMA MƏNTİQİ ---
      if (gameState) {
          // User ID əsasında oyunçu slotunu tapmağa çalış
          if (gameState.player1UserId === user.userId && gameState.player1SocketId !== socket.id) {
              playerSlotReconnecting = 1;
          } else if (gameState.player2UserId === user.userId && gameState.player2SocketId !== socket.id) {
              playerSlotReconnecting = 2;
          }

          if (playerSlotReconnecting) {
              isReconnecting = true;
              const oldSocketId = gameState[`player${playerSlotReconnecting}SocketId`];
              console.log(`[player_ready_in_room] Reconnection detected for User ${user.nickname} in room ${roomId}. Slot: ${playerSlotReconnecting}, Old Socket: ${oldSocketId}, New Socket: ${socket.id}`);

              // GameState-də socket ID-ni yenilə
              gameState[`player${playerSlotReconnecting}SocketId`] = socket.id;

              // Room.players array-ini yenilə
              const playerIndex = room.players.indexOf(oldSocketId);
              if (playerIndex > -1) {
                  room.players.splice(playerIndex, 1); // Köhnəni sil
              }
              if (!room.players.includes(socket.id)) {
                  room.players.push(socket.id); // Yenisini əlavə et
              }
              console.log(`[player_ready_in_room] Room ${roomId} players updated:`, room.players);

              // Əgər otaq silinmə üçün gözləyirdisə, ləğv et (çünki oyunçu qayıtdı)
              if (roomCleanupTimers[roomId]) {
                  clearTimeout(roomCleanupTimers[roomId]);
                  delete roomCleanupTimers[roomId];
                  console.log(`[player_ready_in_room] Otaq ${roomId} üçün silinmə taymeri (reconnect səbəbi ilə) ləğv edildi.`);
              }

          } else if (!room.players.includes(socket.id) && room.players.length < 2) {
               // Əgər reconnect deyilsə və otaqda yer varsa, ikinci oyunçu kimi əlavə et
               console.log(`[player_ready_in_room] New player ${user.nickname} joining room ${roomId} as second player.`);
               room.players.push(socket.id);
               // İkinci oyunçunun məlumatlarını gameState-ə əlavə et
               if (!gameState.player1SocketId) { // Bu normalda olmamalıdır, amma yoxlayaq
                    gameState.player1SocketId = socket.id;
                    gameState.player1UserId = user.userId;
                    gameState.player1Username = user.username;
               } else {
                    gameState.player2SocketId = socket.id;
                    gameState.player2UserId = user.userId;
                    gameState.player2Username = user.username;
               }
               // Oyunu başlat (əgər başlamayıbsa)
               if (!gameState.player1Roll && !gameState.player2Roll && !gameState.isGameOver) {
                   gameState.statusMessage = "Zər Atılır...";
               }
               broadcastRoomList(); // Oyunçu sayı dəyişdi
          }
      }
      // -------------------------------

      // Əgər gameState hələ yoxdursa (otaq yeni yaradılıb) və ya sıfırlanıbsa
      if (!gameState) {
          // Yalnız bir oyunçu varsa və bu həmin oyunçudursa, yeni state yarat
          if (room.players.length === 1 && room.players[0] === socket.id) {
               console.log(`[player_ready_in_room] Initializing gameState for room ${roomId} (first player).`);
               gameState = initializeGameState(room); // Initialize edirik
          } else if (room.players.length === 2) {
              // Əgər nəsə səhv olubsa və state yoxdursa, amma 2 oyunçu varsa, yenidən yarat
              console.warn(`[player_ready_in_room] GameState missing for room ${roomId} with 2 players. Re-initializing.`);
              gameState = initializeGameState(room);
          } else {
              console.error(`[player_ready_in_room] Cannot initialize gameState for room ${roomId}. Player count: ${room.players.length}`);
              return socket.emit('game_error', 'Oyun vəziyyəti yaradıla bilmədi.');
          }
      }

      // Əgər gameState mövcuddursa (ya yeni yaradıldı, ya da əvvəldən var idi)
      if (gameState) {
          // Hazırkı oyun vəziyyətini client-ə göndər
          emitGameStateUpdate(roomId, isReconnecting ? 'player_reconnected' : 'player_ready');

          // Client-ə otaq haqqında əlavə məlumatları göndərək (rəqib adı vs.)
          const opponentSocketId = gameState.player1SocketId === socket.id ? gameState.player2SocketId : gameState.player1SocketId;
          const opponentInfo = opponentSocketId ? users[opponentSocketId] : null;
          socket.emit('room_info', {
              name: room.name,
              creatorUsername: room.creatorUsername,
              hasPassword: !!room.password,
              boardSize: room.boardSize,
              opponentUsername: opponentInfo?.username || (room.players.length < 2 ? 'Gözlənilir...' : 'Naməlum'), // Rəqib adı
              isAiRoom: false
          });
      } else {
          console.error(`[player_ready_in_room] Failed to get/initialize gameState for room ${roomId}.`);
          socket.emit('game_error', 'Oyun vəziyyəti yüklənə bilmədi.');
      }
  });


  // Oyunçu hərəkət etdikdə
  socket.on('make_move', (data) => {
      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      const roomId = currentUserSocketInfo?.currentRoom;

      if (!user || !currentUserSocketInfo || !roomId || !rooms[roomId]?.gameState) {
          return socket.emit('invalid_move', { message: 'Oyun və ya istifadəçi tapılmadı.' });
      }

      const room = rooms[roomId];
      const state = room.gameState;

      // Oyunun bitib bitmədiyini, sıranın kimdə olduğunu və hərəkətin keçərli olub olmadığını yoxla
      if (state.isGameOver) return socket.emit('invalid_move', { message: 'Oyun artıq bitib.' });
      if (!state.currentPlayerSymbol) return socket.emit('invalid_move', { message: 'Hələ simvollar seçilməyib.' });

      let playerSymbol = null;
      if (socket.id === state.player1SocketId) playerSymbol = state.player1Symbol;
      else if (socket.id === state.player2SocketId) playerSymbol = state.player2Symbol;

      if (state.currentPlayerSymbol !== playerSymbol) {
          return socket.emit('invalid_move', { message: 'Sıra sizdə deyil.' });
      }

      const index = data?.index;
      if (typeof index !== 'number' || index < 0 || index >= state.board.length || state.board[index] !== '') {
          return socket.emit('invalid_move', { message: 'Keçərsiz xana seçimi.' });
      }

      console.log(`[Socket Event 5.9 - make_move] Hadisə alındı: User=${user.nickname} (${socket.id}), RoomID=${roomId}, Index=${index}`);

      // Hərəkəti et və nəticəni yoxla
      const moveResult = handleMakeMoveServer(roomId, socket.id, index);

      if (moveResult) {
          // Uğurlu hərəkətdən sonra oyun vəziyyətini hamıya göndər
          emitGameStateUpdate(roomId, 'make_move');
      } else {
          // handleMakeMoveServer false qaytararsa (çox nadir haldır, yuxarıdakı yoxlamalardan sonra)
          socket.emit('invalid_move', { message: 'Hərəkət qeydə alınmadı (server xətası?).' });
      }
  });

  // Zər atma nəticəsi gəldikdə
  socket.on('dice_roll_result', (data) => {
      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      const roomId = currentUserSocketInfo?.currentRoom;

      if (!user || !currentUserSocketInfo || !roomId || !rooms[roomId]?.gameState) return socket.emit('game_error', 'Oyun və ya istifadəçi tapılmadı.');
      const state = rooms[roomId].gameState;
      if (state.isGameOver || state.currentPlayerSymbol !== null) return socket.emit('game_error', 'Zər atmaq üçün uyğun vəziyyət deyil.');
      if (!data || typeof data.roll !== 'number' || data.roll < 1 || data.roll > 6) return socket.emit('game_error', 'Keçərsiz zər nəticəsi.');

      console.log(`[Socket Event 5.10 - dice_roll_result] Hadisə alındı: User=${user.nickname} (${socket.id}), RoomID=${roomId}, Roll=${data.roll}`);

      const playerRoll = data.roll;
      let playerRollField = null;
      let canRoll = false;
      const isTieBreak = state.statusMessage?.includes("Bərabərlik!");

      if (socket.id === state.player1SocketId) {
          if (state.player1Roll === null || isTieBreak) { // Yalnız null isə və ya bərabərlik pozulursa ata bilər
               state.player1Roll = playerRoll; playerRollField = 'player1Roll'; canRoll = true;
          }
      } else if (socket.id === state.player2SocketId) {
           if (state.player2Roll === null || isTieBreak) {
               state.player2Roll = playerRoll; playerRollField = 'player2Roll'; canRoll = true;
           }
      } else {
          return socket.emit('game_error', 'Siz bu oyunda oyunçu deyilsiniz.');
      }

      if (!canRoll) {
           console.warn(`[dice_roll_result] User ${user.nickname} (${socket.id}) zər atmağa çalışdı, amma icazəsi yox idi.`);
           return socket.emit('game_error', 'Zər atmaq növbəsi sizdə deyil və ya artıq atmısınız.');
      }

      // Nəticələri emal et
      if (state.player1Roll !== null && state.player2Roll !== null) { // Hər iki oyunçu da atıb (və ya təkrar atıb)
          if (state.player1Roll > state.player2Roll) {
              state.diceWinnerSocketId = state.player1SocketId;
              state.symbolPickerSocketId = state.player1SocketId; // Yüksək atan seçir
              state.statusMessage = `${state.player1Username || 'Oyunçu 1'} yüksək atdı! Simvol seçir...`;
          } else if (state.player2Roll > state.player1Roll) {
              state.diceWinnerSocketId = state.player2SocketId;
              state.symbolPickerSocketId = state.player2SocketId;
              state.statusMessage = `${state.player2Username || 'Oyunçu 2'} yüksək atdı! Simvol seçir...`;
          } else { // Bərabərlik
              state.diceWinnerSocketId = null;
              state.symbolPickerSocketId = null;
              state.player1Roll = null; // Sıfırla
              state.player2Roll = null; // Sıfırla
              state.statusMessage = "Bərabərlik! Zərlər təkrar atılır...";
          }
          emitGameStateUpdate(roomId, 'dice_results_processed');
      } else { // Biri atıb, digəri gözlənilir
          const waitingForPlayer = (playerRollField === 'player1Roll') ? state.player2Username : state.player1Username;
          state.statusMessage = `${waitingForPlayer || 'Rəqib'}-in zər atması gözlənilir...`;
          // Yalnız atan clientə yox, hər kəsə göndərək ki, nəticəni görsünlər
          emitGameStateUpdate(roomId, 'one_dice_result_received');
      }
  });

  // Simvol seçimi hadisəsi
  socket.on('symbol_choice', (data) => {
      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      const roomId = currentUserSocketInfo?.currentRoom;

      if (!user || !currentUserSocketInfo || !roomId || !rooms[roomId]?.gameState) return socket.emit('game_error', 'Oyun və ya istifadəçi tapılmadı.');
      const state = rooms[roomId].gameState;
      // Yalnız simvol seçən oyunçu (symbolPickerSocketId) və simvol seçilməmişsə davam et
      if (state.isGameOver || state.player1Symbol !== null || socket.id !== state.symbolPickerSocketId) return socket.emit('game_error', 'Simvol seçimi üçün uyğun deyil.');
      if (!data || (data.symbol !== 'X' && data.symbol !== 'O')) return socket.emit('game_error', 'Keçərsiz simvol seçimi.');

      console.log(`[Socket Event 5.11 - symbol_choice] Hadisə alındı: User=${user.nickname} (${socket.id}), RoomID=${roomId}, Symbol=${data.symbol}`);

      const chosenSymbol = data.symbol;
      const opponentSymbol = (chosenSymbol === 'X') ? 'O' : 'X';

      // Simvolları təyin et
      if (socket.id === state.player1SocketId) {
          state.player1Symbol = chosenSymbol;
          state.player2Symbol = opponentSymbol;
      } else { // player2 seçib
          state.player2Symbol = chosenSymbol;
          state.player1Symbol = opponentSymbol;
      }

      // Oyuna başlama sırası: Zəri yüksək atan (simvolu seçən) başlayır
      state.currentPlayerSymbol = chosenSymbol;
      state.symbolPickerSocketId = null; // Seçici artıq yoxdur
      state.isGameOver = false; // Oyun başlayır
      state.lastMoveTime = Date.now(); // İlk hərəkət üçün vaxtı qeyd et

      const currentPlayerUsername = (state.currentPlayerSymbol === state.player1Symbol) ? state.player1Username : state.player2Username;
      state.statusMessage = `Oyun başladı! Sıra: ${currentPlayerUsername || state.currentPlayerSymbol}`;

      emitGameStateUpdate(roomId, 'symbol_chosen_game_started');
  });

  // Yenidən başlatma təklifi
  socket.on('request_restart', () => {
      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      const roomId = currentUserSocketInfo?.currentRoom;

      if (!user || !currentUserSocketInfo || !roomId || !rooms[roomId]?.gameState) return socket.emit('game_error', 'Oyun və ya istifadəçi tapılmadı.');
      const room = rooms[roomId];
      const state = room.gameState;

      // Yalnız oyun bitibsə və 2 oyunçu varsa təklif göndərilə bilər
      if (!state.isGameOver || room.players.length < 2) return socket.emit('game_error', 'Yenidən başlatma təklifi üçün uyğun deyil.');
      // Əgər artıq bir təklif varsa, yenisini göndərmə
      if (state.restartRequestedBy) return socket.emit('info_message', {message: 'Artıq bir yenidən başlatma təklifi var.'});

      console.log(`[Socket Event 5.12 - request_restart] Hadisə alındı: User=${user.nickname} (${socket.id}), RoomID=${roomId}`);

      state.restartRequestedBy = socket.id; // Təklif edəni qeyd et
      state.restartAcceptedBy = new Set([socket.id]); // Təklif edən avtomatik qəbul etmiş sayılır

      // Rəqibə təklifi bildir
      const opponentSocketId = room.players.find(pId => pId !== socket.id);
      if (opponentSocketId && io.sockets.sockets.get(opponentSocketId)) {
          io.to(opponentSocketId).emit('restart_requested', { username: user.nickname });
          socket.emit('info_message', { message: 'Yenidən başlatma təklifi göndərildi.' });
          state.statusMessage = `${user.nickname} yenidən başlatmağı təklif edir...`;
          emitGameStateUpdate(roomId, 'restart_requested'); // Statusu yenilə
      } else {
          // Rəqib yoxdursa, təklifi ləğv et
          state.restartRequestedBy = null;
          state.restartAcceptedBy = new Set();
          socket.emit('game_error', 'Rəqib otaqda tapılmadı.');
      }
  });

  // Yenidən başlatma təklifini qəbul etmə
  socket.on('accept_restart', () => {
      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      const roomId = currentUserSocketInfo?.currentRoom;

      if (!user || !currentUserSocketInfo || !roomId || !rooms[roomId]?.gameState) return socket.emit('game_error', 'Oyun və ya istifadəçi tapılmadı.');
      const room = rooms[roomId];
      const state = room.gameState;

      // Yalnız aktiv bir təklif varsa və qəbul edən təklif edən deyilsə qəbul et
      if (!state.isGameOver || !state.restartRequestedBy || state.restartRequestedBy === socket.id) {
           return socket.emit('game_error', 'Yenidən başlatmanı qəbul etmək üçün uyğun deyil.');
      }
      // Oyunda 2 nəfər olduğundan əmin ol
      if (room.players.length < 2) {
           state.restartRequestedBy = null; // Təklifi ləğv et
           state.restartAcceptedBy = new Set();
           return socket.emit('game_error', 'Yenidən başlatmaq üçün rəqib yoxdur.');
      }

      console.log(`[Socket Event 5.13 - accept_restart] Hadisə alındı: User=${user.nickname} (${socket.id}), RoomID=${roomId}`);

      // Qəbul edəni əlavə et
      state.restartAcceptedBy.add(socket.id);

      // Əgər hər iki oyunçu da qəbul edibsə, oyunu sıfırla
      // (Set ölçüsünün room.players.length ilə eyni olduğunu yoxlaya bilərik,
      // çünki disconnect halında players array-i yenilənir)
      if (state.restartAcceptedBy.size === room.players.length && room.players.length === 2) {
          console.log(`[accept_restart] Restart qəbul edildi. Oyun ${roomId} üçün sıfırlanır...`);
          // Oyunu sıfırla (yeni zər atma mərhələsi ilə)
          initializeGameState(room); // Bu funksiya player socket ID-lərini saxlayır
          emitGameStateUpdate(roomId, 'restart_accepted');
      } else {
           // Hələ qəbul edilməyibsə, sadəcə məlumat ver (lazım deyil əslində)
           // socket.emit('info_message', { message: 'Restart təklifini qəbul etdiniz.' });
      }
  });


  // Hərəkət etmə məntiqi funksiyası (əvvəlki kimi, amma yoxlamalar artıb)
  function handleMakeMoveServer(roomId, socketId, index) {
      const room = rooms[roomId];
      // Əlavə yoxlamalar
      if (!room || !room.gameState || room.gameState.isGameOver) {
          console.error(`[handleMakeMoveServer] Keçərsiz vəziyyət: Room=${!!room}, GameState=${!!room?.gameState}, GameOver=${room?.gameState?.isGameOver}`);
          return false;
      }

      const state = room.gameState;
      let playerSymbol = (socketId === state.player1SocketId) ? state.player1Symbol : state.player2Symbol;

      // Əlavə yoxlamalar
      if (!playerSymbol || state.currentPlayerSymbol !== playerSymbol || index < 0 || index >= state.board.length || state.board[index] !== '') {
           console.error(`[handleMakeMoveServer] Keçərsiz hərəkət cəhdi: Symbol=${playerSymbol}, Current=${state.currentPlayerSymbol}, Index=${index}, Board[${index}]=${state.board[index]}`);
           return false;
      }

      // Hərəkəti et
      state.board[index] = playerSymbol;
      state.lastMoveTime = Date.now();

      // Qalibiyyət və ya bərabərlik yoxlaması
      if (checkWinServer(room, playerSymbol)) {
          state.isGameOver = true;
          state.winnerSymbol = playerSymbol;
          const winnerUsername = (playerSymbol === state.player1Symbol) ? state.player1Username : state.player2Username;
          state.statusMessage = `${winnerUsername || playerSymbol} Qazandı!`;
          state.restartRequestedBy = null; // Oyun bitdikdə restart təklifini sıfırla
          state.restartAcceptedBy = new Set();
      } else if (!state.board.includes('')) { // Bərabərlik
          state.isGameOver = true;
          state.winnerSymbol = 'draw';
          state.statusMessage = "Oyun Bərabərə!";
          state.restartRequestedBy = null; // Oyun bitdikdə restart təklifini sıfırla
          state.restartAcceptedBy = new Set();
      } else {
          // Sıranı dəyiş
          switchTurnServer(room);
          const nextPlayerUsername = (state.currentPlayerSymbol === state.player1Symbol) ? state.player1Username : state.player2Username;
          state.statusMessage = `Sıra: ${nextPlayerUsername || state.currentPlayerSymbol}`;
      }
      return true; // Hərəkət uğurlu oldu
  }

  // handleDisconnectOrLeave funksiyası Part 2-də təyin edilmişdi.

}); // <<<--- io.on('connection', ...) BLOKU SONU (Part 2-dən davam edirdi) --- <<<

// =========================
// ===== PART 3 SONU =====
// =========================
// server_multi.js (Yenidən İşlənmiş - v1)
// Part 4/4 - Server Start & Graceful Shutdown

// ... (Part 1, 2 və 3-dən olan kodlar burada fərz edilir) ...

// ------------------------------------------------------------------------
// --- Serveri Başlatma & Səliqəli Dayandırma ---
// ------------------------------------------------------------------------
console.log('[Setup 6.1] Serverin başladılması və dayandırılması məntiqi təyin edilir...');

// Fly.io üçün PORT mühit dəyişənini və ya default 8080-i istifadə et
const PORT = process.env.PORT || 8080;
console.log(`[Server Start 6.1] server_multi.js listen(${PORT}) funksiyası ÇAĞIRILIR...`);

// Serverin dinləməyə başlaması
// Host ünvanını göstərmədən default dinləməyə icazə veririk
server.listen(PORT, () => { // <-- '0.0.0.0', hissəsi silindi
  const startTime = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
  console.log('=======================================================');
  // Log mesajını da bir az dəyişək ki, fərqi bilinsin
  console.log(`---- Multiplayer Server (Yenidən İşlənmiş v1 - Hostsuz Listen) ${PORT} portunda uğurla işə düşdü! ----`);
  console.log(`---- Fly App URL: https://${process.env.FLY_APP_NAME || 'YOUR_APP_NAME'}.fly.dev ----`);
  console.log(`---- Server Başlama Zamanı: ${startTime} ----`);
  // İlkin otaq siyahısını yayımla (əgər qoşulu client varsa)
  broadcastRoomList();
  console.log('=======================================================');
});

// Serveri başlatma zamanı yarana biləcək xətaları tutmaq üçün
server.on('error', (error) => {
    console.error(`[Server Start 6.1] server.listen XƏTASI: Port ${PORT} problemi!`, error);
    if (error.code === 'EADDRINUSE') {
        console.error(`XƏTA: Port ${PORT} artıq başqa bir proses tərəfindən istifadə olunur.`);
    }
    process.exit(1); // Kritik xəta, prosesdən çıx
});

// Serverin səliqəli dayandırılması üçün funksiya
function gracefulShutdown(signal) {
    console.warn(`\n[Shutdown 6.1] ${signal} siqnalı alındı. Server bağlanır...`);
    // 1. Yeni bağlantıları qəbul etməyi dayandır
    server.close((err) => {
        if (err) {
            console.error("[Shutdown 6.1] HTTP server bağlanarkən xəta:", err);
            // Hər halda davam etməyə çalışaq
        } else {
            console.log('[Shutdown 6.1] HTTP server yeni bağlantıları qəbul etmir.');
        }

        // 2. Socket.IO bağlantılarını bağla
        io.close(() => {
            console.log('[Shutdown 6.1] Bütün Socket.IO bağlantıları bağlandı.');

            // 3. Verilənlər bazası pool-unu bağla
            pool.end((err) => {
                if (err) {
                    console.error("[Shutdown 6.1] DB pool bağlanarkən xəta:", err);
                } else {
                    console.log('[Shutdown 6.1] DB pool uğurla bağlandı.');
                }
                // 4. Prosesdən çıx
                console.warn(`[Shutdown 6.1] Server dayandırıldı (${signal}).`);
                process.exit(err ? 1 : 0); // Xəta varsa xəta kodu ilə çıx
            });
        });
    });

    // Əgər müəyyən müddət ərzində bağlanmazsa, məcburi çıxış et
    setTimeout(() => {
        console.error('[Shutdown 6.1] Shutdown prosesi çox uzun çəkdi! Məcburi çıxış edilir.');
        process.exit(1);
    }, 10000); // 10 saniyə gözlə
}

// Dayandırma siqnallarını dinlə
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // `fly deploy` zamanı göndərilir
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C basıldıqda

// Tutulmayan xətaları logla və səliqəli dayandır
process.on('uncaughtException', (error, origin) => {
    console.error('[FATAL ERROR 6.1] Uncaught Exception:', error);
    console.error('[FATAL ERROR 6.1] Origin:', origin);
    // Bəlkə də dərhal çıxmaq daha yaxşıdır?
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL ERROR 6.1] Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
});

// ============================================
// ===== server_multi.js FAYLININ SONU ======
// ============================================