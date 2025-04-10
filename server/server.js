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
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Hissə 1-dən kodlar buradadır) ...

// ------------------------------------------------------------------------
// --- Part 2.1: Otaq Siyahısı Yayımı (Yenidən Baxılmış) ---
// ------------------------------------------------------------------------
// Qeyd: Bu funksiya artıq daha çox gameState obyektindən məlumat ala bilər.

// Otaq siyahısını formatlayıb bütün clientlərə göndərən funksiya
function broadcastRoomList() {
  console.log('[Broadcast 2.1] Otaq siyahısı bütün clientlərə göndərilir...');
  try {
      const roomListForClients = Object.values(rooms)
          .map(room => {
              // Oyunçu adlarını əvvəlcə gameState-dən, sonra users obyektindən almağa çalışaq
              const player1Info = room.gameState?.player1SocketId ? (users[room.gameState.player1SocketId] || { username: room.gameState.player1Username }) : null;
              const player2Info = room.gameState?.player2SocketId ? (users[room.gameState.player2SocketId] || { username: room.gameState.player2Username }) : null;

              return {
                  id: room.id,
                  name: room.name,
                  playerCount: room.players?.length ?? 0, // Aktiv socket sayını göstərək
                  hasPassword: !!room.password,
                  boardSize: room.boardSize,
                  creatorUsername: room.creatorUsername,
                  // Adları gameState-dən (əgər varsa) və ya users-dən götürək
                  player1Username: player1Info?.username || null,
                  player2Username: player2Info?.username || null,
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
// Qeyd: Oyunun vəziyyətini idarə edən əsas funksiyalar. Clientlərdən gələn
// hadisələr bu funksiyaları çağıracaq.

/**
* Yeni bir oyun üçün gameState obyektini yaradır və ya sıfırlayır.
* @param {object} room - Vəziyyəti sıfırlanacaq otaq obyekti.
* @param {string} player1SocketId - Birinci oyunçunun socket ID-si.
* @param {string} player2SocketId - İkinci oyunçunun socket ID-si.
*/
function initializeGameState(room, player1SocketId, player2SocketId) {
  console.log(`[Game Logic 2.2] Otaq üçün gameState yaradılır/sıfırlanır: ${room.id}`);
  if (!room) {
      console.error("[Game Logic 2.2] initializeGameState: Otaq obyekti tapılmadı!");
      return;
  }
  const boardSize = room.boardSize || 3;
  const user1 = users[player1SocketId];
  const user2 = users[player2SocketId];

  room.gameState = {
      board: Array(boardSize * boardSize).fill(''),
      currentPlayerSymbol: null, // Zər atma ilə təyin olunacaq
      player1SocketId: player1SocketId || null,
      player2SocketId: player2SocketId || null,
      player1UserId: user1?.userId || null,
      player2UserId: user2?.userId || null,
      player1Username: user1?.username || 'Oyunçu 1',
      player2Username: user2?.username || 'Oyunçu 2',
      player1Symbol: null,
      player2Symbol: null,
      player1Roll: null,
      player2Roll: null,
      diceWinnerSocketId: null,
      symbolPickerSocketId: null, // Simvolu seçməli olanın ID-si
      isGameOver: false, // Oyun başlayır (amma sıra/simvol hələ yox)
      winnerSymbol: null,
      winningCombination: [],
      statusMessage: "Zər Atılır...", // İlkin status
      lastMoveTime: Date.now()
  };
  console.log(`[Game Logic 2.2] gameState yaradıldı:`, JSON.stringify(room.gameState)); // Çox detallı ola bilər
}

/**
* Clientdən gələn hərəkəti emal edir, lövhəni yeniləyir, qazanmanı yoxlayır.
* @param {string} roomId - Otağın ID-si.
* @param {string} socketId - Hərəkəti edən oyunçunun socket ID-si.
* @param {number} index - Kliklənən xananın indeksi.
* @returns {boolean} - Hərəkət uğurlu olubsa true, yoxsa false.
*/
function handleMakeMoveServer(roomId, socketId, index) {
  console.log(`[Game Logic 2.2] handleMakeMoveServer çağırıldı: Room=${roomId}, Player=${socketId}, Index=${index}`);
  const room = rooms[roomId];
  if (!room || !room.gameState || room.gameState.isGameOver) {
      console.warn(`[Game Logic 2.2] Keçərsiz hərəkət cəhdi (otaq/oyun yoxdur və ya bitib): Room=${roomId}`);
      return false;
  }

  const state = room.gameState;
  const playerSymbol = (socketId === state.player1SocketId) ? state.player1Symbol : state.player2Symbol;

  // Sıra yoxlaması
  if (state.currentPlayerSymbol !== playerSymbol) {
      console.warn(`[Game Logic 2.2] Sıra səhvi: Sıra ${state.currentPlayerSymbol}-da idi, amma ${playerSymbol} (${socketId}) hərəkət etdi.`);
      return false;
  }
  // Xananing boş olub olmadığını yoxla
  if (index < 0 || index >= state.board.length || state.board[index] !== '') {
      console.warn(`[Game Logic 2.2] Keçərsiz xana indeksi (${index}) və ya dolu xana.`);
      return false;
  }

  // Hərəkəti et
  state.board[index] = playerSymbol;
  state.lastMoveTime = Date.now();
  console.log(`[Game Logic 2.2] Lövhə yeniləndi:`, state.board.join(',') || 'boş'); // Lövhəni göstər

  // Qazanma və ya heç-heçə yoxlaması
  if (checkWinServer(room, playerSymbol)) {
      console.log(`[Game Logic 2.2] Oyun bitdi! Qalib: ${playerSymbol}`);
      state.isGameOver = true;
      state.winnerSymbol = playerSymbol;
      state.statusMessage = `${users[socketId]?.username || playerSymbol} Qazandı!`;
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

  return true; // Hərəkət uğurlu oldu (hətta oyun bitsə belə)
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

  const winConditions = generateWinConditions(size); // Bu funksiya əvvəlki kodda var idi

  for (let i = 0; i < winConditions.length; i++) {
      const condition = winConditions[i];
      const firstSymbol = board[condition[0]];

      if (firstSymbol !== playerSymbolToCheck || firstSymbol === '') continue;

      let allSame = true;
      for (let j = 1; j < condition.length; j++) {
          if (board[condition[j]] !== firstSymbol) {
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
  state.currentPlayerSymbol = (state.currentPlayerSymbol === state.player1Symbol) ? state.player2Symbol : state.player1Symbol;
  console.log(`[Game Logic 2.2] Sıra dəyişdi: Yeni sıra ${state.currentPlayerSymbol}-dadır.`);
}

// ------------------------------------------------------------------------
// --- Part 2.3: Oyun Vəziyyətini Göndərmə Funksiyası ---
// ------------------------------------------------------------------------
// Qeyd: Oyun vəziyyəti dəyişdikdə otaqdakı bütün oyunçulara yenilənmiş
// vəziyyəti göndərən vahid funksiya.

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
  console.log(`[State Emitter 2.3] Otağa (${roomId}) gameState göndərilir. Trigger: ${triggeringEvent}`);
  // console.log(`[State Emitter 2.3] Göndərilən State:`, JSON.stringify(stateToSend)); // Çox detallı log
  io.to(roomId).emit('game_state_update', stateToSend); // Otaqdakı hər kəsə göndər
}


// ------------------------------------------------------------------------
// --- Hissə 2 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Hissə 1 və Hissə 2-dən kodlar buradadır) ...

// ------------------------------------------------------------------------
// --- Part 3.1: HTTP API Marşrutları (Register, Login) ---
// ------------------------------------------------------------------------
// Qeyd: İstifadəçi qeydiyyatı və girişi üçün endpointlər.

console.log('[Setup 3.1] API Endpointləri (Register, Login) təyin edilir...');

// ----- Qeydiyyat Endpoint-i (/register) -----
app.post('/register', async (req, res) => {
  // POST /register
  // Yeni istifadəçi qeydiyyatı
  const { fullName, email, nickname, password } = req.body;
  console.log(`[API /register 3.1] Sorğu alındı: { nickname: '${nickname}', email: '${email}' }`);

  // Server-side Validasiyalar
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
  // Əlavə: Ad və Nickname uzunluq yoxlaması (məsələn)
  if (fullName.length > 50 || nickname.length > 25) {
       console.warn(`[API /register 3.1] Xəta: Ad və ya Nickname çox uzundur.`);
       return res.status(400).json({ message: 'Ad (maks 50) və ya Nickname (maks 25) çox uzundur.' });
  }


  let client;
  try {
    client = await pool.connect();
    console.log('[API /register 3.1] DB bağlantısı alındı.');

    // Unikallıq yoxlaması (email VƏ nickname üçün) - Transaction istifadə etmək daha etibarlı olardı
    const checkQuery = 'SELECT email, nickname FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2) LIMIT 1';
    const checkResult = await client.query(checkQuery, [email, nickname]);

    if (checkResult.rowCount > 0) {
        const existing = checkResult.rows[0];
        if (existing.email.toLowerCase() === email.toLowerCase()) {
            console.warn(`[API /register 3.1] Xəta: Email (${email}) artıq mövcuddur.`);
            return res.status(409).json({ message: 'Bu e-poçt artıq qeydiyyatdan keçib.' });
        } else { // Nickname mövcuddur
            console.warn(`[API /register 3.1] Xəta: Nickname (${nickname}) artıq mövcuddur.`);
            return res.status(409).json({ message: 'Bu nickname artıq istifadə olunur.' });
        }
    }

    // Şifrəni hashla
    console.log(`[API /register 3.1] ${nickname} üçün şifrə hashlanır...`);
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // İstifadəçini DB-yə əlavə et (SERIAL ID istifadə etdiyimizi fərz edirik)
    // DB Schema: CREATE TABLE users (id SERIAL PRIMARY KEY, ...)
    const insertQuery = `INSERT INTO users (full_name, email, nickname, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nickname;`;
    const values = [fullName, email, nickname, hashedPassword];
    console.log(`[API /register 3.1] İstifadəçi DB-yə yazılır: ${nickname}`);
    const result = await client.query(insertQuery, values);

    console.log(`[API /register 3.1] UĞURLU: İstifadəçi yaradıldı:`, result.rows[0]);
    res.status(201).json({ message: 'Qeydiyyat uğurlu oldu!' });

  } catch (error) {
    console.error("[API /register 3.1] Qeydiyyat xətası:", error);
    // Təkrarlanan açar xətasını daha dəqiq tutmaq (əgər transaction istifadə edilmirsə)
    if (error.code === '23505') { // PostgreSQL unique violation kodu
        if (error.constraint && error.constraint.includes('email')) {
            return res.status(409).json({ message: 'Bu e-poçt artıq mövcuddur (DB).' });
        }
        if (error.constraint && error.constraint.includes('nickname')) {
            return res.status(409).json({ message: 'Bu nickname artıq mövcuddur (DB).' });
        }
    }
    // Cavab göndərilməyibsə, ümumi server xətası göndər
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
    // POST /login
    // İstifadəçi girişi və session yaratma
    const { nickname, password } = req.body;
    let client; // DB clientini burada elan edək
    console.log(`[API /login 3.1] Sorğu alındı: { nickname: '${nickname}' }`);
    if (!nickname || !password) {
        console.warn('[API /login 3.1] Xəta: Nickname/şifrə boş.');
        return res.status(400).json({ message: 'Nickname və şifrə daxil edilməlidir.' });
    }

    try {
        client = await pool.connect();
        console.log(`[API /login 3.1] DB bağlantısı alındı.`);

        // İstifadəçini tap (nickname case-insensitive)
        const result = await client.query('SELECT id, nickname, email, full_name, password_hash FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);
        if (result.rowCount === 0) {
            console.warn(`[API /login 3.1] İstifadəçi tapılmadı: ${nickname}`);
            return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
        }
        const user = result.rows[0]; // User obyektini tam götürək
        console.log(`[API /login 3.1] İstifadəçi tapıldı: ${user.nickname} (ID: ${user.id})`);

        // Şifrəni yoxla
        console.log(`[API /login 3.1] ${user.nickname} üçün şifrə yoxlanılır...`);
        const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordCorrect) {
            console.warn(`[API /login 3.1] Şifrə yanlışdır: ${nickname}`);
            return res.status(401).json({ message: 'Nickname və ya şifrə yanlışdır.' });
        }
        console.log(`[API /login 3.1] Şifrə doğrudur: ${nickname}`);

        // Session regenerate (Session Fixation hücumlarına qarşı)
        const oldSessionID = req.sessionID;
        console.log(`[API /login 3.1] Session regenerate edilir... Köhnə ID=${oldSessionID}`);

        req.session.regenerate(regenerateErr => {
            if (regenerateErr) {
                console.error("[API /login 3.1] Session regenerate xətası:", regenerateErr);
                // Clientə xəta mesajı göndər (əgər hələ göndərilməyibsə)
                if (!res.headersSent) {
                   return res.status(500).json({ message: 'Session yaradılarkən xəta baş verdi (regenerate).' });
                }
                return console.error("[API /login 3.1] Regenerate xətası oldu amma cavab artıq göndərilmişdi.");
            }

            // Regenerate uğurlu olduqdan sonra yeni session-a məlumatları yaz
            const newSessionID = req.sessionID;
            console.log(`[API /login 3.1] Yeni SessionID=${newSessionID}. User datası təyin edilir...`);

            // Session-a YALNIZ lazım olan məlumatları yaz (password_hash YAZILMIR!)
            req.session.user = {
                id: user.id, // userId kimi də adlandırmaq olar
                nickname: user.nickname,
                fullName: user.full_name,
                email: user.email
            };
            console.log(`[API /login 3.1] req.session.user təyin edildi:`, JSON.stringify(req.session.user));

            // Session-u DB-də yadda saxla
            req.session.save(saveErr => {
                if (saveErr) {
                    console.error("[API /login 3.1] Session save xətası:", saveErr);
                    // Clientə xəta mesajı göndər (əgər hələ göndərilməyibsə)
                     if (!res.headersSent) {
                         return res.status(500).json({ message: 'Session yaradılarkən xəta baş verdi (save).' });
                     }
                     return console.error("[API /login 3.1] Save xətası oldu amma cavab artıq göndərilmişdi.");
                }

                // Uğurlu giriş cavabını göndər
                console.log(`[API /login 3.1] UĞURLU: Session saxlandı. User: ${req.session.user?.nickname}, SessionID: ${req.sessionID}`);
                 if (!res.headersSent) {
                     // Clientə yalnız lazım olan minimum məlumatı göndərək
                     res.status(200).json({ message: 'Giriş uğurlu!', nickname: user.nickname });
                 } else {
                     console.warn("[API /login 3.1] Session save callback işlədi amma cavab artıq göndərilmişdi?");
                 }
            }); // req.session.save sonu
        }); // req.session.regenerate sonu

    } catch (error) {
        console.error("[API /login 3.1] Ümumi giriş xətası:", error);
         // Clientə xəta mesajı göndər (əgər hələ göndərilməyibsə)
         if (!res.headersSent) {
             res.status(500).json({ message: 'Server xətası baş verdi.' });
         }
    } finally {
        // Bağlantını pool-a qaytar
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
    // POST /logout
    // Mövcud session-u məhv edir
    if (req.session.user) { // Yalnız giriş etmiş istifadəçi üçün
      const nickname = req.session.user.nickname;
      const sessionID = req.sessionID;
      console.log(`[API /logout 3.2] Çıxış tələbi: ${nickname}, SessionID: ${sessionID}`);
      // Session-u məhv et (DB-dən də silinəcək - connect-pg-simple)
      req.session.destroy(err => {
        if (err) {
          console.error("[API /logout 3.2] Session destroy xətası:", err);
          return res.status(500).json({ message: "Çıxış zamanı xəta baş verdi." });
        }
        // Client tərəfdəki session cookie-ni təmizlə
        // Cookie adı session middleware konfiqurasiyasında təyin olunmayıbsa, default 'connect.sid' olur.
        res.clearCookie('connect.sid'); // Cookie adını yoxlayın!
        console.log(`[API /logout 3.2] İstifadəçi çıxdı: ${nickname}. Session ${sessionID} məhv edildi.`);
        res.status(200).json({ message: "Uğurla çıxış edildi." });
      });
    } else {
      // Giriş edilməyibsə
      console.log(`[API /logout 3.2] Çıxış tələbi, amma aktiv session yox idi.`);
      res.status(400).json({ message: "Giriş edilməyib." });
    }
});

// ----- Autentifikasiya Vəziyyətini Yoxlama Endpoint-i (/check-auth) -----
app.get('/check-auth', (req, res) => {
    // GET /check-auth
    // Client tərəfin istifadəçinin hələ də girişli olub olmadığını yoxlaması üçün
    // console.log(`[API /check-auth 3.2] Sorğu alındı - SessionID: ${req.sessionID}`); // Çox detallı log
    if (req.session && req.session.user && req.session.user.id) {
      // Aktiv sessiya varsa, istifadəçi məlumatlarını qaytar
      // console.log(`[API /check-auth 3.2] Aktiv session tapıldı: User=${req.session.user.nickname}`); // Detallı log
      res.status(200).json({ loggedIn: true, user: req.session.user });
    } else {
      // Aktiv sessiya yoxdursa
      // console.log('[API /check-auth 3.2] Aktiv session tapılmadı.'); // Detallı log
      res.status(401).json({ loggedIn: false, message: 'Sessiya tapılmadı və ya etibarsızdır.' });
    }
});

// ------------------------------------------------------------------------
// --- Part 3.3: HTTP API Marşrutları (Profile, Root) ---
// ------------------------------------------------------------------------
// Qeyd: Profil məlumatları və kök ('/') marşrutu.

console.log('[Setup 3.3] API Endpointləri (Profile, Root) təyin edilir...');

// ----- Profil Məlumatlarını Almaq Endpoint-i (/profile/:nickname) -----
// Qeyd: Hazırda client tərəfdən birbaşa istifadə edilməsi nəzərdə tutulmayıb,
// amma gələcəkdə lazım ola bilər. /check-auth onsuz da məlumatları verir.
app.get('/profile/:nickname', isAuthenticated, async (req, res) => {
    // GET /profile/istifadeciadi
    // İstifadəçinin öz profil məlumatlarını qaytarır (şifrəsiz)
    const requestedNickname = req.params.nickname;
    const loggedInNickname = req.session.user.nickname;
    const loggedInUserId = req.session.user.id;
    console.log(`[API /profile GET 3.3] Sorğu: ${requestedNickname}, Giriş edən: ${loggedInNickname}`);

    // Yalnız öz profilinə baxmasına icazə ver
    if (loggedInNickname.toLowerCase() !== requestedNickname.toLowerCase()) {
        console.warn(`[API /profile GET 3.3] İcazə xətası: ${loggedInNickname}, ${requestedNickname} profilinə baxmağa çalışdı.`);
        return res.status(403).json({ message: 'Başqasının profilinə baxmaq icazəsi yoxdur.' });
    }

    let client;
    try {
        client = await pool.connect();
        // Şifrə hash-ı xaric digər məlumatları qaytar
        const result = await client.query('SELECT id, full_name, email, nickname FROM users WHERE id = $1', [loggedInUserId]);
        if (result.rowCount > 0) {
            console.log(`[API /profile GET 3.3] Profil məlumatları tapıldı: ${loggedInNickname}`);
            res.status(200).json(result.rows[0]);
        } else {
            // Bu xəta çox qəribədir, çünki isAuthenticated middleware-dən keçib
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
    // PUT /profile/istifadeciadi
    // İstifadəçinin profil məlumatlarını (ad, email, nickname, şifrə) yeniləyir
    const currentNicknameFromParam = req.params.nickname;
    const loggedInUserId = req.session.user.id;
    const loggedInNickname = req.session.user.nickname;
    const { fullName, email, nickname: newNickname, password } = req.body; // Yeni nickname 'newNickname' kimi alınır
    console.log(`[API /profile PUT 3.3] Sorğu: ${currentNicknameFromParam}, Giriş edən: ${loggedInNickname}, Yeni Data:`, {fullName, email, newNickname, password: password ? '***' : 'N/A'});

    // Yalnız öz profilini dəyişməyə icazə ver
    if (loggedInNickname.toLowerCase() !== currentNicknameFromParam.toLowerCase()) {
        console.warn(`[API /profile PUT 3.3] İcazə xətası: ${loggedInNickname} ${currentNicknameFromParam} profilini dəyişməyə çalışdı.`);
        return res.status(403).json({ message: 'Başqasının profilini dəyişməyə icazə yoxdur.' });
    }

    // Server-side Validasiyalar
    if (!fullName || !email || !newNickname) { console.warn('[API /profile PUT 3.3] Xəta: Ad/Email/Nickname boş.'); return res.status(400).json({ message: 'Ad Soyad, E-poçt və Nickname boş ola bilməz.' }); }
    if (/\s/.test(newNickname)) { console.warn(`[API /profile PUT 3.3] Xəta: Yeni nickname boşluqlu (${newNickname}).`); return res.status(400).json({ message: 'Nickname boşluq ehtiva edə bilməz.' }); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.warn(`[API /profile PUT 3.3] Xəta: Yeni email formatı yanlış (${email}).`); return res.status(400).json({ message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
    if (password && password.length < 6) { console.warn(`[API /profile PUT 3.3] Xəta: Yeni şifrə qısadır.`); return res.status(400).json({ message: 'Yeni şifrə minimum 6 simvol olmalıdır.' }); }
    if (fullName.length > 50 || newNickname.length > 25) { console.warn(`[API /profile PUT 3.3] Xəta: Ad/Nickname uzundur.`); return res.status(400).json({ message: 'Ad (maks 50) və ya Nickname (maks 25) çox uzundur.' }); }

    let client;
    try {
        client = await pool.connect();
        console.log('[API /profile PUT 3.3] DB bağlantısı alındı.');

        // Unikallıq yoxlaması (yeni email və nickname üçün, özü xaric)
        const checkQuery = 'SELECT email, nickname FROM users WHERE (LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2)) AND id != $3 LIMIT 1';
        const checkResult = await client.query(checkQuery, [email, newNickname, loggedInUserId]);
        if (checkResult.rowCount > 0) {
            const existing = checkResult.rows[0];
            if (existing.email.toLowerCase() === email.toLowerCase()) {
                console.warn(`[API /profile PUT 3.3] Xəta: E-poçt (${email}) başqası tərəfindən istifadə edilir.`);
                return res.status(409).json({ message: 'Bu e-poçt artıq başqası tərəfindən istifadə olunur.' });
            } else { // Nickname mövcuddur
                console.warn(`[API /profile PUT 3.3] Xəta: Nickname (${newNickname}) başqası tərəfindən istifadə edilir.`);
                return res.status(409).json({ message: 'Bu nickname artıq başqası tərəfindən istifadə olunur.' });
            }
        }

        // Update sorğusu üçün sahələri və parametrləri dinamik qur
        let updateFields = ['full_name = $1', 'email = $2', 'nickname = $3'];
        let queryParams = [fullName, email, newNickname];
        let paramIndex = 4; // Parametr indeksləri $1, $2, $3 ilə başlayır

        // Əgər yeni şifrə göndərilibsə, onu da hashlayıb əlavə et
        if (password) {
            console.log('[API /profile PUT 3.3] Yeni şifrə hashlanır...');
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            updateFields.push(`password_hash = $${paramIndex}`);
            queryParams.push(hashedPassword);
            paramIndex++;
        }

        queryParams.push(loggedInUserId); // WHERE şərti üçün user ID ($paramIndex)

        const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id, full_name, email, nickname;`;
        console.log('[API /profile PUT 3.3] Update sorğusu hazırlanır...');
        // console.log('[API /profile PUT 3.3] Query:', updateQuery); // Debug üçün
        // console.log('[API /profile PUT 3.3] Params:', queryParams); // Debug üçün

        const result = await client.query(updateQuery, queryParams);

        if (result.rowCount === 0) {
             // Bu xəta da qəribədir, istifadəçi autentifikasiyadan keçib amma DB-də tapılmır
            console.error(`[API /profile PUT 3.3] XƏTA: Yenilənəcək user (ID: ${loggedInUserId}) tapılmadı.`);
            return res.status(404).json({ message: 'Yenilənəcək istifadəçi tapılmadı.' });
        }
        const updatedUserDb = result.rows[0]; // DB-dən qayıdan yenilənmiş məlumatlar
        console.log(`[API /profile PUT 3.3] Profil DB-də yeniləndi: ${updatedUserDb.nickname}`);

        // Sessionu yeni məlumatlarla yenilə
        console.log('[API /profile PUT 3.3] Session yenilənir...');
        req.session.user.nickname = updatedUserDb.nickname;
        req.session.user.fullName = updatedUserDb.full_name;
        req.session.user.email = updatedUserDb.email;

        req.session.save((saveErr) => {
            if (saveErr) {
                console.error("[API /profile PUT 3.3] Session save xətası (profil):", saveErr);
                // DB yeniləndi, amma session yox. Clientə bildirmək vacibdir.
                return res.status(500).json({ message: 'Profil DB-də yeniləndi, lakin sessiya yenilənərkən xəta. Təkrar giriş edin.' });
            }
            console.log(`[API /profile PUT 3.3] UĞURLU: Profil və session yeniləndi: ${updatedUserDb.nickname}, SessionID: ${req.sessionID}`);
            // Clientə göndəriləcək user obyekti (şifrəsiz)
            const updatedUserForClient = {
                id: updatedUserDb.id, nickname: updatedUserDb.nickname,
                fullName: updatedUserDb.full_name, email: updatedUserDb.email
            };
            res.status(200).json({ message: 'Profil uğurla yeniləndi!', updatedUser: updatedUserForClient });
        }); // session.save sonu

    } catch (error) {
        console.error("[API /profile PUT 3.3] Profil yeniləmə xətası:", error);
        // Təkrarlanan açar xətasını tut
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
    // GET /
    // İstifadəçi giriş edibsə oyunlar səhifəsinə, etməyibsə login səhifəsinə yönləndir.
    // Express.static middleware onsuz da public qovluğunda index.html axtarır,
    // amma biz login statusuna görə yönləndirməni təmin edirik.
    console.log(`[API / 3.3] Kök route sorğusu. Session var: ${!!req.session?.user?.id}`);
    if (req.session && req.session.user && req.session.user.id) {
        // Giriş edilib -> Oyunlar səhifəsi
        console.log(`[API / 3.3] Yönləndirmə -> /OYUNLAR/oyunlar/oyunlar.html`);
        res.redirect('/OYUNLAR/oyunlar/oyunlar.html');
    } else {
        // Giriş edilməyib -> Login səhifəsi
        console.log(`[API / 3.3] Yönləndirmə -> /ANA SEHIFE/login/login.html`);
        res.redirect('/ANA SEHIFE/login/login.html');
    }
});

// ------------------------------------------------------------------------
// --- Hissə 3 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Hissə 1, 2, və 3-dən kodlar buradadır) ...

// ------------------------------------------------------------------------
// --- Part 4.1: Socket.IO Middleware & Autentifikasiya ---
// ------------------------------------------------------------------------
// Qeyd: Socket.IO üçün Express session middleware-ni aktivləşdirmək və
// yalnız giriş etmiş istifadəçilərin bağlantısını qəbul etmək.

console.log('[Setup 4.1] Socket.IO üçün middleware konfiqurasiyası başlayır...');

// Socket.IO üçün Session Middleware-i istifadə etmək üçün yardımçı funksiya (wrapper)
// Bu, Express middleware-ni Socket.IO middleware formatına çevirir.
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

// Session middleware-i Socket.IO üçün tətbiq et
// Bu, hər bir socket bağlantısı üçün req.session obyektini əlçatan edir (socket.request.session).
io.use(wrap(sessionMiddleware));
console.log('[Setup 4.1] Socket.IO üçün session middleware (wrap ilə) tətbiq edildi.');

// Socket.IO bağlantılarını yalnız autentifikasiyadan keçmiş istifadəçilər üçün qəbul et
io.use((socket, next) => {
    const session = socket.request.session;
    // Session-un və içindəki user obyektinin mövcudluğunu yoxla
    if (session && session.user && session.user.nickname) {
        // Session etibarlıdırsa, user məlumatını birbaşa socket obyektinə əlavə et (rahat istifadə üçün)
        socket.user = { ...session.user }; // Sessiyadan user məlumatını socket obyektinə kopyala
        console.log(`[Socket Auth 4.1] OK - Socket üçün user təyin edildi: ${socket.user.nickname} (Socket ID: ${socket.id}, SessionID: ${session.id})`);
        next(); // Bağlantıya icazə ver
    } else {
        // Session etibarsızdırsa və ya yoxdursa, bağlantını rədd et
        console.warn(`[Socket Auth 4.1] FAILED - Giriş edilməmiş socket bağlantısı rədd edildi. SessionID: ${session?.id || 'N/A'}`);
        // Client tərəfə xəta göndərərək bağlantını ləğv et
        next(new Error('Authentication error: User not logged in or session expired.'));
    }
});
console.log('[Setup 4.1] Socket.IO üçün autentifikasiya middleware təyin edildi.');


// ------------------------------------------------------------------------
// --- Hissə 4 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Hissə 1, 2, 3, və 4-dən kodlar buradadır) ...

// ------------------------------------------------------------------------
// --- Part 5.1: Socket.IO Bağlantı Handler-i & İlkin Addımlar ---
// ------------------------------------------------------------------------
// Qeyd: Yeni socket bağlantısı qəbul edildikdə işə düşən əsas handler.
// İstifadəçini qlobal `users` obyektinə əlavə edir və ilkin otaq siyahısını göndərir.

console.log('[Setup 5.1] Socket.IO "connection" handler təyin edilir...');

io.on('connection', (socket) => {
    // Bu blok hər yeni uğurlu (autentifikasiyadan keçmiş) socket bağlantısı üçün işə düşür.
    // socket.user obyektinin mövcudluğu io.use() middleware tərəfindən təmin edilir.
    const connectedUser = socket.user; // socket obyektinə əlavə etdiyimiz user məlumatları
    console.log(`[Socket Connect 5.1] ++ İstifadəçi qoşuldu: ${connectedUser.nickname} (Socket ID: ${socket.id}, UserID: ${connectedUser.id})`);

    // İstifadəçinin qoşulma zamanı hansısa otaqda olub olmadığını yoxla (yenidən qoşulma halı)
    // Qeyd: Bu mərhələdə hələ ki, dəqiq otaq bərpası etmirik, sadəcə users obyektini yaradırıq.
    // Otaq bərpası 'player_ready_in_room' hadisəsində ediləcək.
    if (users[socket.id]) {
        // Bu normalda baş verməməlidir, çünki hər bağlantı yeni socket.id alır.
        console.warn(`[Socket Connect 5.1] XƏBƏRDARLIQ: Eyni socket ID (${socket.id}) üçün təkrar bağlantı? Köhnə məlumatlar üzərinə yazılır.`);
    }

    // İstifadəçini 'users' yaddaş obyektinə əlavə et
    users[socket.id] = {
        id: socket.id,           // Unikal socket ID
        userId: connectedUser.id, // DB-dən gələn user ID (yenidən qoşulmanı tanımaq üçün vacib)
        username: connectedUser.nickname,
        currentRoom: null        // Başlanğıcda heç bir otaqda deyil
    };
    console.log(`[Socket Connect 5.1] İstifadəçi "${connectedUser.nickname}" qlobal 'users' obyektinə əlavə edildi.`);
    // console.log(`[Socket Connect 5.1] Hazırkı 'users' obyekti:`, users); // Debug üçün (çoxlu istifadəçidə qarışıq ola bilər)

    // Qoşulan istifadəçiyə (yalnız ona) otaq siyahısını göndər
    // Bu, istifadəçi lobbiyə daxil olduqda və ya səhifəni yenilədikdə otaqları görməsi üçündür.
    console.log(`[Socket Connect 5.1] İlkin otaq siyahısı ${connectedUser.nickname}-ə (${socket.id}) göndərilir...`);
    try {
        // `broadcastRoomList` bütün məlumatları formatlayır, onu çağırmaq kifayətdir.
        const initialRoomList = Object.values(rooms).map(room => {
             const player1SocketId = room.players?.[0];
             const player2SocketId = room.players?.[1];
             // Oyunçu adlarını almaq üçün yenilənmiş yanaşma (həm users, həm gameState)
             const player1Username = (player1SocketId && users[player1SocketId]?.username) || room.gameState?.player1Username;
             const player2Username = (player2SocketId && users[player2SocketId]?.username) || room.gameState?.player2Username;

            return {
                id: room.id, name: room.name, playerCount: room.players?.length ?? 0,
                hasPassword: !!room.password, boardSize: room.boardSize,
                creatorUsername: room.creatorUsername,
                player1Username: player1Username || null,
                player2Username: player2Username || null,
                isAiRoom: !!room.isAiRoom
            };
        });
        socket.emit('room_list_update', initialRoomList);
        console.log(`[Socket Connect 5.1] İlkin otaq siyahısı ${connectedUser.nickname}-ə göndərildi (${initialRoomList.length} otaq).`);
    } catch (listError) {
        console.error("[Socket Connect 5.1] İlkin otaq siyahısı göndərilərkən xəta:", listError);
        socket.emit('room_list_update', []); // Xəta olsa belə boş siyahı göndər
    }

    // ======================================================
    // === BU BLOKUN İÇİNDƏ DİGƏR HADİSƏ DİNLƏYİCİLƏRİ ===
    // ===              (Part 5.2 və sonrası)           ===
    // ======================================================


// --- Part 5.1 Sonu (io.on('connection') bloku hələ bağlanmayıb!) ---
// ------------------------------------------------------------------------
// --------------------------------------------------------------------
    // --- Part 5.2: 'create_room' Hadisə Handler-i ---
    // --------------------------------------------------------------------
    // Qeyd: Yeni oyun otağı yaratmaq üçün clientdən gələn tələbi emal edir.
    // Artıq gameState-i də ilkin hazırlayır (amma başlatmır).

    socket.on('create_room', (data) => {
      // Client 'create_room' hadisəsi göndərdikdə bu funksiya işə düşür
      // data = { name: "Otaq Adı", password: "şifrə" (və ya null), boardSize: "3" }

      const user = socket.user; // io.use() vasitəsilə təyin edilmiş user məlumatı
      const currentUserSocketInfo = users[socket.id]; // Qlobal users obyektindən socket məlumatı

      // İstifadəçi məlumatlarının mövcudluğunu yoxla
      if (!user || !currentUserSocketInfo) {
          console.error(`[Socket Event 5.2 - create_room] XƏTA: user (${user?.nickname}) və ya currentUserSocketInfo (${socket.id}) tapılmadı!`);
          // Clientə xəta mesajı göndər
          return socket.emit('creation_error', 'Server xətası: İstifadəçi məlumatları tapılmadı. Təkrar giriş edin.');
      }
      console.log(`[Socket Event 5.2 - create_room] Hadisə alındı: User=${user.nickname}, Data=`, data);

      // --- Validasiyalar ---
      if (!data || !data.name || data.name.trim().length === 0 || data.name.length > 30) {
          console.warn(`[Socket Event 5.2 - create_room] XƏTA: Keçərsiz otaq adı. User=${user.nickname}`);
          return socket.emit('creation_error', 'Otaq adı boş və ya çox uzun (maks 30) ola bilməz.');
      }
      // Şifrə validasiyası (əgər varsa)
      if (data.password && data.password.length > 0 && (data.password.length < 2 || !(/[a-zA-Z]/.test(data.password) && /\d/.test(data.password)))) {
           console.warn(`[Socket Event 5.2 - create_room] XƏTA: Keçərsiz şifrə formatı. User=${user.nickname}`);
           return socket.emit('creation_error', 'Şifrə tələblərə uyğun deyil (min 2 simvol, 1 hərf + 1 rəqəm).');
      }
      // İstifadəçinin başqa otaqda olub olmadığını yoxla
      if (currentUserSocketInfo.currentRoom) {
          console.warn(`[Socket Event 5.2 - create_room] XƏTA: İstifadəçi (${user.nickname}) artıq ${currentUserSocketInfo.currentRoom} otağındadır.`);
          return socket.emit('creation_error', 'Siz artıq başqa bir otaqdasınız. Yeni otaq yaratmaq üçün əvvəlcə otaqdan çıxın.');
      }
      // Aktiv otaq sayını məhdudlaşdırmaq (istəyə bağlı)
      const currentRoomCount = Object.keys(rooms).length;
      const MAX_ROOMS = 50; // Məsələn, maksimum 50 otaq
      if (currentRoomCount >= MAX_ROOMS) {
          console.warn(`[Socket Event 5.2 - create_room] XƏTA: Maksimum otaq sayına (${MAX_ROOMS}) çatılıb.`);
          return socket.emit('creation_error', `Serverdə maksimum otaq sayına (${MAX_ROOMS}) çatılıb. Daha sonra cəhd edin.`);
      }

      // --- Yeni Otağın Yaradılması ---
      const newRoomId = generateRoomId(); // Yardımçı funksiya ilə ID yarat
      const boardSize = parseInt(data.boardSize, 10) || 3;
      const validatedBoardSize = Math.max(3, Math.min(6, boardSize)); // 3-6 arası limitlə

      // Yeni otaq obyektini yarat
      const newRoom = {
        id: newRoomId,
        name: data.name.trim().slice(0, 30), // Adı təmizlə və limitlə
        password: data.password || null, // Şifrə yoxdursa null
        players: [socket.id], // Yaradan ilk oyunçudur
        boardSize: validatedBoardSize,
        creatorUsername: user.nickname, // Yaradanın adını saxla
        gameState: null, // Oyun başlayanda yaradılacaq (initializeGameState ilə)
        isAiRoom: false, // Bu real oyunçu otağıdır
        deleteTimeout: null // Boş qaldıqda silinmə üçün timeout ID-si
      };

      // Yeni otağı qlobal `rooms` obyektinə əlavə et
      rooms[newRoomId] = newRoom;
      console.log(`[State 5.2] Yeni otaq yaradıldı və rooms obyektinə əlavə edildi: ID=${newRoomId}, Adı=${newRoom.name}`);

      // Yaradan istifadəçinin vəziyyətini yenilə (`users` obyektində)
      currentUserSocketInfo.currentRoom = newRoomId;
      console.log(`[State 5.2] İstifadəçi (${user.nickname}) üçün currentRoom təyin edildi: ${newRoomId}`);

      // Yaradan socket-i Socket.IO otağına qoş
      socket.join(newRoomId);
      console.log(`[Socket IO 5.2] Socket (${socket.id}) ${newRoomId} rumuna qoşuldu.`);

      // Otaq siyahısını bütün clientlərə yenidən göndər
      broadcastRoomList(); // Yardımçı funksiya
      console.log(`[Socket Event 5.2 - create_room] Otaq yaradıldı, siyahı yayımlandı. User=${user.nickname}, RoomID=${newRoomId}`);

      // Client tərəfə otağın uğurla yaradıldığı və qoşulduğu barədə məlumat göndər
      // Client bu məlumatı alıb avtomatik oyun otağı səhifəsinə keçə bilər.
      // Client artıq otaqda olduğu üçün gameState göndərməyə ehtiyac yoxdur,
      // ikinci oyunçu qoşulanda göndəriləcək.
      socket.emit('room_joined', {
           roomId: newRoom.id,
           roomName: newRoom.name,
           boardSize: newRoom.boardSize
      });
      console.log(`[Socket Event 5.2 - create_room] 'room_joined' hadisəsi yaradan clientə (${socket.id}) göndərildi.`);

  }); // socket.on('create_room', ...) sonu

  // ======================================================
  // === BU BLOKUN İÇİNDƏ DİGƏR HADİSƏ DİNLƏYİCİLƏRİ ===
  // ===              (Part 5.3 və sonrası)           ===
  // ======================================================

// --- Part 5.2 Sonu (io.on('connection') bloku hələ bağlanmayıb!) ---
// --------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// io.on('connection', (socket) => {
//     ... (Part 5.1 və 5.2-dən kodlar) ...

    // --------------------------------------------------------------------
    // --- Part 5.3: 'join_room' Hadisə Handler-i (Yenidən İşlənmiş) ---
    // --------------------------------------------------------------------
    // Qeyd: Oyunçunun otağa qoşulma tələbini emal edir. Yenidən qoşulma
    // vəziyyətini nəzərə alır və oyun vəziyyətini sinxronlaşdırır.

    socket.on('join_room', async (data) => { // Async etdik, şifrə yoxlaması üçün
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

      // --- İlkin Yoxlamalar ---
      if (!room) {
          console.warn(`[Socket Event 5.3 - join_room] XƏTA: Otaq tapılmadı (${roomId}). User=${user.nickname}`);
          return socket.emit('join_error', 'Otaq tapılmadı.');
      }
      if (room.isAiRoom) {
          console.warn(`[Socket Event 5.3 - join_room] XƏTA: AI otağına qoşulma cəhdi. User=${user.nickname}`);
          return socket.emit('join_error', 'AI otağına bu şəkildə qoşulmaq olmaz.');
      }

      // --- Şifrə Yoxlaması ---
      if (room.password) {
          if (!data.password) {
              console.warn(`[Socket Event 5.3 - join_room] XƏTA: Şifrə tələb olunur, amma göndərilmədi. Room=${roomId}, User=${user.nickname}`);
              return socket.emit('join_error', 'Bu otaq şifrəlidir. Şifrəni daxil edin.');
          }
          // // Şifrəni DB-dən götürmək lazımdırsa (hazırda yaddaşdadır)
          // const isPasswordCorrect = await bcrypt.compare(data.password, room.password); // Əgər hash saxlasaq
          if (room.password !== data.password) { // Hazırda düz müqayisə edirik
               console.warn(`[Socket Event 5.3 - join_room] XƏTA: Yanlış şifrə. Room=${roomId}, User=${user.nickname}`);
              return socket.emit('join_error', 'Şifrə yanlışdır.');
          }
          console.log(`[Socket Event 5.3 - join_room] Şifrəli otaq (${roomId}) üçün şifrə doğrudur. User=${user.nickname}`);
      }

      // --- Qoşulma Məntiqi ---
      try {
          // İstifadəçinin başqa otaqda olub olmadığını yoxla
          if (currentUserSocketInfo.currentRoom && currentUserSocketInfo.currentRoom !== roomId) {
              console.warn(`[Socket Event 5.3 - join_room] XƏTA: İstifadəçi (${user.nickname}) artıq ${currentUserSocketInfo.currentRoom} otağındadır.`);
              return socket.emit('join_error', 'Siz artıq başqa bir otaqdasınız.');
          }

          // Socket.IO otağına qoş
          socket.join(roomId);
          currentUserSocketInfo.currentRoom = roomId;
          console.log(`[Socket IO 5.3] Socket (${socket.id}) ${roomId} rumuna qoşuldu.`);

          // Otağın planlanmış silinməsi varsa ləğv et
          if (room.deleteTimeout) {
              clearTimeout(room.deleteTimeout);
              delete room.deleteTimeout;
              console.log(`[Socket Event 5.3 - join_room] Otaq ${roomId} üçün planlanmış silmə ləğv edildi.`);
          }

          // --- Yenidən Qoşulma (Reconnect) Halını Yoxla ---
          let isReconnecting = false;
          if (room.gameState && !room.gameState.isGameOver) {
              // Əgər otaqda oyun davam edirsə, bu user ID-nin oyunçulardan biri olub olmadığını yoxla
              if (room.gameState.player1UserId === user.userId && room.gameState.player1SocketId !== socket.id) {
                  console.log(`[Socket Event 5.3 - join_room] İstifadəçi ${user.nickname} (ID: ${user.userId}) Player 1 olaraq yenidən qoşulur.`);
                  // Köhnə socket ID-ni yenisi ilə əvəz et
                  const oldSocketId = room.gameState.player1SocketId;
                  room.gameState.player1SocketId = socket.id;
                  // room.players massivini də yenilə
                  const playerIndex = room.players.indexOf(oldSocketId);
                  if (playerIndex > -1) { room.players.splice(playerIndex, 1, socket.id); }
                  else { room.players.push(socket.id); } // Əgər nədənsə yox idisə, əlavə et
                  isReconnecting = true;
              } else if (room.gameState.player2UserId === user.userId && room.gameState.player2SocketId !== socket.id) {
                  console.log(`[Socket Event 5.3 - join_room] İstifadəçi ${user.nickname} (ID: ${user.userId}) Player 2 olaraq yenidən qoşulur.`);
                  const oldSocketId = room.gameState.player2SocketId;
                  room.gameState.player2SocketId = socket.id;
                  const playerIndex = room.players.indexOf(oldSocketId);
                  if (playerIndex > -1) { room.players.splice(playerIndex, 1, socket.id); }
                  else { room.players.push(socket.id); }
                  isReconnecting = true;
              }
          }

          if (isReconnecting) {
              console.log(`[Socket Event 5.3 - join_room] Yenidən qoşulan oyunçuya (${user.nickname}) hazırkı oyun vəziyyəti göndərilir.`);
              broadcastRoomList(); // Oyunçu sayı dəyişməsə də adlar yenilənə bilər
              emitGameStateUpdate(roomId, 'reconnect'); // Yalnız bu oyunçuya göndərmək əvəzinə, hər kəsə göndərək ki, UI yenilənsin
              // socket.emit('game_state_update', room.gameState); // Yalnız qoşulana göndər
          }
          // --- Normal Qoşulma (İlk dəfə və ya ikinci oyunçu kimi) ---
          else if (!room.players.includes(socket.id)) { // Əgər oyunçu hələ otaqda deyilsə (yenidən qoşulma deyilsə)
              if (room.players.length >= 2) {
                  // Bu yoxlama əslində yuxarıda edilməli idi, amma ehtiyat üçün
                  console.warn(`[Socket Event 5.3 - join_room] XƏTA: Otaq (${roomId}) doludur (yenidən qoşulma deyil). User=${user.nickname}`);
                  socket.leave(roomId); // Socket.IO rumundan çıxart
                  currentUserSocketInfo.currentRoom = null;
                  return socket.emit('join_error', 'Otaq doludur.');
              }

              // Oyunçunu otağa əlavə et
              room.players.push(socket.id);
              console.log(`[State 5.3] Oyunçu ${socket.id} (${user.nickname}) otağın (${roomId}) players massivinə əlavə edildi. Hazırkı oyunçular: ${room.players.length}`);

              // --- Otaqda İkinci Oyunçu Qoşulursa ---
              if (room.players.length === 2) {
                  console.log(`[Socket Event 5.3 - join_room] Otaq ${roomId} doldu. Oyun vəziyyəti yaradılır və zər atma başlanır...`);
                  const player1SocketId = room.players[0];
                  const player2SocketId = socket.id; // İkinci qoşulan budur

                  // Oyun vəziyyətini yarat/sıfırla
                  initializeGameState(room, player1SocketId, player2SocketId);

                  // Rəqib məlumatlarını hər iki tərəfə göndər (Artıq gameState-də var, update göndərmək kifayətdir)
                  const player1 = users[player1SocketId];
                  const player2 = users[player2SocketId];
                  if(player1 && player2){
                      console.log(`[Socket IO 5.3] Rəqib məlumatları göndərilir: ${player1.username} <-> ${player2.username}`);
                      // io.to(player1SocketId).emit('opponent_joined', { username: player2.username }); // Köhnə üsul
                      // io.to(player2SocketId).emit('opponent_joined', { username: player1.username }); // Köhnə üsul
                  } else {
                       console.error(`[Socket Event 5.3 - join_room] XƏTA: Oyunçu məlumatları users obyektində tapılmadı! P1: ${player1SocketId}, P2: ${player2SocketId}`);
                  }
                  
                  // Oyun vəziyyətini hər iki oyunçuya göndər (zər atma statusu ilə)
                  emitGameStateUpdate(roomId, 'second_player_joined');

              } else { // Otaqda ilk oyunçu (bu normalda create_room ilə olur, amma ehtiyat üçün)
                  console.log(`[Socket Event 5.3 - join_room] ${user.nickname} otağa ilk oyunçu kimi qoşuldu (gözlənilməz hal?). Rəqib gözlənilir.`);
                  // gameState hələ yaradılmır, ikinci oyunçu gözlənilir.
              }
              broadcastRoomList(); // Otaq siyahısını yenilə (oyunçu sayı dəyişdi)

          } else {
              // Oyunçu artıq players massivində idi, amma gameState yox idi və ya bitmişdi
              // Bu halda da, otağa qoşulub, yeni oyun üçün rəqib gözləyir
              console.log(`[Socket Event 5.3 - join_room] ${user.nickname} (${socket.id}) otağa qoşuldu (və ya artıq idi). Rəqib gözlənilir.`);
              // Client tərəfə hazırkı vəziyyəti bildirmək üçün boş/gözləmə state göndərə bilərik?
              // Və ya sadəcə room_joined göndərmək kifayətdir, client qalanını room_info ilə idarə edəcək.
              socket.emit('room_joined', { roomId: room.id, roomName: room.name, boardSize: room.boardSize });
          }

      } catch (error) {
          console.error(`[Socket Event 5.3 - join_room] Qoşulma zamanı ümumi xəta. Room=${roomId}, User=${user?.nickname}:`, error);
          if (!socket.disconnected) { // Əgər bağlantı hələ də varsa
               socket.emit('join_error', 'Otağa qoşularkən daxili server xətası baş verdi.');
               // İstifadəçini otaqdan çıxarmağa çalışaq (əgər qoşulmuşdusa)
               socket.leave(roomId);
               if(currentUserSocketInfo) currentUserSocketInfo.currentRoom = null;
          }
      }
  }); // socket.on('join_room', ...) sonu

  // ======================================================
  // === BU BLOKUN İÇİNDƏ DİGƏR HADİSƏ DİNLƏYİCİLƏRİ ===
  // ===              (Part 5.4 və sonrası)           ===
  // ======================================================


// --- Part 5.3 Sonu (io.on('connection') bloku hələ bağlanmayıb!) ---
// --------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// io.on('connection', (socket) => {
//     ... (Part 5.1, 5.2, 5.3-dən kodlar) ...
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

            let gameState = room.gameState; // Mövcud state-i al
            let isReconnecting = false;
            let playerSlotReconnecting = null;

            // --- Yenidən Qoşulma Halını Yoxla (Real Otaqlar Üçün) ---
            if (gameState && !room.isAiRoom) {
                if (gameState.player1UserId === user.userId && gameState.player1SocketId !== socket.id) {
                    playerSlotReconnecting = 1;
                } else if (gameState.player2UserId === user.userId && gameState.player2SocketId !== socket.id) {
                    playerSlotReconnecting = 2;
                }

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
                // Əgər gameState yoxdursa və yenidən qoşulma deyilsə, yeni state yarat
                console.log(`[Socket Event 5.4 - player_ready] ${roomId} üçün yeni gameState yaradılır...`);
                // createInitialGameState artıq mövcud olmalıdır və room.gameState-i təyin etməlidir
                initializeGameState(room, socket.id, null); // Yalnız ilk oyunçunu əlavə edirik
                gameState = room.gameState; // Yenidən alaq

                if (room.isAiRoom) {
                    console.log(`[Socket Event 5.4 - player_ready] AI otağı üçün AI oyunçusu əlavə edilir...`);
                    // AI oyunçusunu əlavə edən funksiya (əgər varsa)
                    // addAiPlayerToGame(gameState, room); // Məsələn: gameState.player2Username = "SNOW"; gameState.player2SocketId = "AI_SNOW";
                    gameState.player2SocketId = 'AI_SNOW'; // Simvolik ID
                    gameState.player2Username = 'SNOW';    // AI adı
                    gameState.player2UserId = 'AI_SNOW';     // Simvolik User ID
                    // AI oyununda zər atma və simvol seçimi mərhələsi avtomatik keçirilsin?
                    // Məsələn, P1 həmişə X, AI həmişə O olsun və P1 başlasın.
                    gameState.player1Symbol = 'X';
                    gameState.player2Symbol = 'O';
                    gameState.currentPlayerSymbol = 'X'; // İnsan oyunçu başlasın
                    gameState.statusMessage = `Sıra: ${gameState.player1Username || 'Siz'}`;
                    gameState.isGameOver = false; // Oyunu başladaq
                    console.log(`[State 5.4] AI oyunu üçün ilkin simvollar və sıra təyin edildi.`);
                } else {
                    // Real multiplayer otağıdırsa, ikinci oyunçu gözlənilir
                    gameState.statusMessage = "Rəqib gözlənilir...";
                }
            }

            // --- Son Vəziyyəti Göndər ---
            if (gameState) {
                console.log(`[Socket IO 5.4] Oyun vəziyyəti (${roomId}) ${user.nickname}-ə (${socket.id}) göndərilir.`);
                // Həmişə emitGameStateUpdate istifadə edək ki, otaqdakı hər kəs (əgər varsa) yenilənsin
                emitGameStateUpdate(roomId, 'player_ready');
            } else {
                // Bu hala normalda düşməməlidir, amma ehtiyat üçün
                console.error(`[Socket Event 5.4 - player_ready] XƏTA: GameState yaradıla bilmədi və ya tapılmadı! Room=${roomId}`);
                socket.emit('game_error', 'Oyun vəziyyəti yaradıla bilmədi.');
            }

            // Otaq məlumatlarını göndər (yaradan, ölçü və s.)
            // Client bu məlumatı başlıqdakı düymələri göstərmək/gizlətmək üçün istifadə edəcək
            try {
                 const roomInfoForClient = getRoomInfoForClient(room); // Belə bir funksiyanız olmalıdır
                 socket.emit('room_info', roomInfoForClient);
                 console.log(`[Socket IO 5.4] room_info göndərildi:`, roomInfoForClient);
            } catch (infoError) {
                 console.error(`[Socket IO 5.4] room_info göndərilərkən xəta:`, infoError);
            }


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

  // ======================================================
  // === BU BLOKUN İÇİNDƏ DİGƏR HADİSƏ DİNLƏYİCİLƏRİ ===
  // ===              (Part 5.5 və sonrası)           ===
  // ======================================================

// --- Part 5.4 Sonu (io.on('connection') bloku hələ bağlanmayıb!) ---
// --------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// io.on('connection', (socket) => {
//     ... (Part 5.1, 5.2, 5.3, 5.4-dən kodlar) ...

    // --------------------------------------------------------------------
    // --- Part 5.5: Otaqdan Ayrılma / Silmə / Kick Hadisələri ---
    // --------------------------------------------------------------------

    // ----- Otaqdan Ayrılma ('leave_room') -----
    socket.on('leave_room', () => {
      // Client "Otaqdan Ayrıl" düyməsinə basdıqda göndərir
      const user = socket.user;
      console.log(`[Socket Event 5.5 - leave_room] Hadisə alındı: User=${user?.nickname} (${socket.id})`);
      // Əsas işi handleDisconnectOrLeave görəcək, onu çağıraq
      // Bu, həm socket bağlantısını kəsmədən ayrılmanı, həm də disconnect-i eyni məntiqlə idarə edir.
      handleDisconnectOrLeave(socket);
  });


  // ----- Otağı Silmə ('delete_room') -----
  socket.on('delete_room', (data) => {
      // Otaq yaradan client otağı silmək istədikdə göndərir
      // data = { roomId: "otaq_id" }
      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      console.log(`[Socket Event 5.5 - delete_room] Hadisə alındı: User=${user?.nickname}, Data=`, data);

      if (!user || !currentUserSocketInfo) {
          console.error(`[Socket Event 5.5 - delete_room] XƏTA: user (${user?.nickname}) və ya currentUserSocketInfo (${socket.id}) tapılmadı!`);
          return socket.emit('delete_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.');
      }
      if (!data || !data.roomId) {
          console.warn(`[Socket Event 5.5 - delete_room] XƏTA: Otaq ID göndərilmədi. User=${user.nickname}`);
          return socket.emit('delete_error', 'Otaq ID göndərilmədi.');
      }

      const roomId = data.roomId;
      const room = rooms[roomId];

      // Yoxlamalar
      if (!room) {
          console.warn(`[Socket Event 5.5 - delete_room] XƏTA: Silinəcək otaq tapılmadı (${roomId}). User=${user.nickname}`);
          return socket.emit('delete_error', 'Silinəcək otaq tapılmadı.');
      }
      if (room.isAiRoom) {
           console.warn(`[Socket Event 5.5 - delete_room] XƏTA: AI otağını silmə cəhdi. User=${user.nickname}`);
          return socket.emit('delete_error', 'AI otaqları silinə bilməz.');
      }
      if (room.creatorUsername !== user.nickname) {
          console.warn(`[Socket Event 5.5 - delete_room] XƏTA: İcazəsiz silmə cəhdi. User=${user.nickname}, Room Creator=${room.creatorUsername}`);
          return socket.emit('delete_error', 'Yalnız otağı yaradan onu silə bilər.');
      }

      console.log(`[State 5.5] Otaq ${roomId} ('${room.name}') ${user.nickname} tərəfindən silinir.`);

      // Otaqdakı BÜTÜN oyunçuları (silən daxil olmaqla?) məlumatlandır və otaqdan çıxart
      // Silən onsuz da lobiyə yönləndirilir, ona kick mesajı göndərməyə ehtiyac yoxdur.
      room.players.forEach(playerId => {
          const playerSocket = io.sockets.sockets.get(playerId);
          if (playerSocket) {
              // Silən şəxs deyilsə, ona bildiriş göndər və otaqdan çıxart
              if (playerId !== socket.id) {
                   console.log(`[Socket IO 5.5] Oyunçuya (${users[playerId]?.username}) otağın silindiyi bildirilir və rumdan çıxarılır.`);
                   playerSocket.emit('room_deleted_kick', { message: `'${room.name}' otağı yaradan tərəfindən silindi.` });
                   playerSocket.leave(roomId);
              }
              // Hər oyunçunun (silən daxil) user state-ni yenilə
              if (users[playerId]) {
                  users[playerId].currentRoom = null;
              }
          }
      });

      // Silən şəxsin öz socketini də rumdan çıxart (əgər hələ çıxmayıbsa)
      socket.leave(roomId);
      if(currentUserSocketInfo) currentUserSocketInfo.currentRoom = null;


      // Otağı qlobal `rooms` obyektindən sil
      delete rooms[roomId];
      // Əgər varsa, planlanmış silmə timeout-unu ləğv et
      if (room.deleteTimeout) {
          clearTimeout(room.deleteTimeout);
          console.log(`[State 5.5] Otaq (${roomId}) üçün planlanmış silmə ləğv edildi (manualla silindiyi üçün).`);
      }

      // Otaq siyahısını yenilə və hamıya göndər
      broadcastRoomList();
      console.log(`[State 5.5] Otaq ${roomId} silindi və siyahı yayımlandı.`);
      // Client tərəfə əlavə təsdiq göndərməyə ehtiyac yoxdur, onsuz da lobiyə yönlənir.
  });


  // ----- Rəqibi Kənarlaşdırma ('kick_opponent') -----
  socket.on('kick_opponent', (data) => {
      // Otaq yaradan rəqibini kənarlaşdırmaq istədikdə göndərir
      // data = { roomId: "otaq_id" }
      const user = socket.user; // Kənaraşdıran istifadəçi (yaradan)
      const currentUserSocketInfo = users[socket.id];
      console.log(`[Socket Event 5.5 - kick_opponent] Hadisə alındı: User=${user?.nickname}, Data=`, data);

      if (!user || !currentUserSocketInfo) {
          console.error(`[Socket Event 5.5 - kick_opponent] XƏTA: user (${user?.nickname}) və ya currentUserSocketInfo (${socket.id}) tapılmadı!`);
          return socket.emit('kick_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.'); // Yeni xəta hadisəsi
      }
      if (!data || !data.roomId) {
          console.warn(`[Socket Event 5.5 - kick_opponent] XƏTA: Otaq ID göndərilmədi. User=${user.nickname}`);
          return socket.emit('kick_error', 'Otaq ID göndərilmədi.');
      }

      const roomId = data.roomId;
      const room = rooms[roomId];

      // Yoxlamalar
      if (!room) {
           console.warn(`[Socket Event 5.5 - kick_opponent] XƏTA: Otaq tapılmadı (${roomId}). User=${user.nickname}`);
          return socket.emit('kick_error', 'Otaq tapılmadı.');
      }
      if (room.isAiRoom) {
           console.warn(`[Socket Event 5.5 - kick_opponent] XƏTA: AI otağından kick etmə cəhdi. User=${user.nickname}`);
          return socket.emit('kick_error', 'AI otağından rəqib çıxarmaq olmaz.');
      }
      if (room.creatorUsername !== user.nickname) {
           console.warn(`[Socket Event 5.5 - kick_opponent] XƏTA: İcazəsiz kick cəhdi. User=${user.nickname}, Creator=${room.creatorUsername}`);
          return socket.emit('kick_error', 'Yalnız otağı yaradan rəqibi çıxara bilər.');
      }

      // Kənarlaşdırılacaq rəqibin socket ID-sini tap
      const opponentSocketId = room.players.find(pId => pId !== socket.id);

      if (!opponentSocketId) {
           console.warn(`[Socket Event 5.5 - kick_opponent] XƏTA: Kənarlaşdırılacaq rəqib otaqda tapılmadı (${roomId}). User=${user.nickname}`);
          return socket.emit('kick_error', 'Rəqib artıq otaqda deyil.');
      }

      // Rəqibin socket obyektini tap
      const opponentSocket = io.sockets.sockets.get(opponentSocketId);
      const opponentUserInfo = users[opponentSocketId];

      console.log(`[State 5.5] Rəqib ${opponentUserInfo?.username} (${opponentSocketId}) ${user.nickname} tərəfindən otaqdan (${roomId}) çıxarılır.`);

      // Rəqibə bildiriş göndər və otaqdan çıxart (əgər qoşuludursa)
      if (opponentSocket) {
          console.log(`[Socket IO 5.5] Rəqibə (${opponentSocketId}) kick mesajı göndərilir.`);
          opponentSocket.emit('room_deleted_kick', { message: "Otaq yaradan tərəfindən çıxarıldınız." });
          opponentSocket.leave(roomId);
      } else {
          console.warn(`[Socket IO 5.5] Kənarlaşdırılan rəqibin (${opponentSocketId}) socket bağlantısı tapılmadı (bəlkə artıq çıxıb?).`);
      }

      // handleDisconnectOrLeave funksiyasını kənarlaşdırılan üçün çağıraraq state-i təmizlə
      // Bu funksiya həm `users` obyektini, həm `room.players`-i təmizləyəcək, həm də `broadcastRoomList` edəcək.
      // Ancaq handleDisconnectOrLeave üçün socketInstance lazımdır, bizdə isə yalnız ID var.
      // Ona görə məntiqi burada təkrarlayaq və ya handleDisconnectOrLeave-i ID ilə işləyən edək.
      // Gəlin handleDisconnectOrLeave-i çağırmaq üçün minimal socket bənzəri obyekt yaradaq.
      const mockSocketInstance = {
           id: opponentSocketId,
           user: opponentUserInfo // users-dən aldığımız məlumat
      };
      handleDisconnectOrLeave(mockSocketInstance); // State təmizləmə və broadcast üçün

      console.log(`[State 5.5] Rəqib (${opponentSocketId}) üçün təmizləmə prosesi başa çatdı.`);
      // Yaradana əlavə təsdiq göndərməyə ehtiyac yoxdur, broadcastRoomList onsuz da UI-ni yeniləyəcək.
  });

  // ======================================================
  // === BU BLOKUN İÇİNDƏ DİGƏR HADİSƏ DİNLƏYİCİLƏRİ ===
  // ===              (Part 5.6 və sonrası)           ===
  // ======================================================

// --- Part 5.5 Sonu (io.on('connection') bloku hələ bağlanmayıb!) ---
// --------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// io.on('connection', (socket) => {
//     ... (Part 5.1, 5.2, 5.3, 5.4, 5.5-dən kodlar) ...

    // --------------------------------------------------------------------
    // --- Part 5.6: 'make_move' Hadisə Handler-i (Yenidən İşlənmiş) ---
    // --------------------------------------------------------------------
    // Qeyd: Client tərəfdən gələn oyun hərəkəti tələbini emal edir.
    // Məntiqi serverdə işlədir və nəticəni hər kəsə göndərir.

    socket.on('make_move', (data) => {
      // Client xanaya kliklədikdə göndərir
      // data = { index: <kliklenen_xana_indeksi>, mark: 'X' (və ya 'O') }
      // Qeyd: Client artıq 'mark'-ı göndərməsinə ehtiyac yoxdur, server kimin sırası olduğunu bilir.
      // Sadəcə data = { index: <kliklenen_xana_indeksi> } göndərməsi kifayətdir. Client tərəfi dəyişməlidir.
      // Amma hələlik köhnə data formatını qəbul edək.

      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      const roomId = currentUserSocketInfo?.currentRoom;

      console.log(`[Socket Event 5.6 - make_move] Hadisə alındı: User=${user?.nickname} (${socket.id}), Room=${roomId}, Data=`, data);

      // --- Yoxlamalar ---
      if (!user || !currentUserSocketInfo) {
           console.error(`[Socket Event 5.6 - make_move] XƏTA: User məlumatları tapılmadı!`);
           return socket.emit('game_error', 'Server xətası: İstifadəçi məlumatları tapılmadı.'); // Yeni xəta hadisəsi
      }
      if (!roomId || !rooms[roomId]) {
          console.error(`[Socket Event 5.6 - make_move] XƏTA: İstifadəçi (${user.nickname}) heç bir otaqda deyil və ya otaq (${roomId}) tapılmadı.`);
          return socket.emit('game_error', 'Siz heç bir otaqda deyilsiniz və ya otaq tapılmadı.');
      }
      if (!rooms[roomId].gameState || rooms[roomId].gameState.isGameOver) {
           console.warn(`[Socket Event 5.6 - make_move] XƏBƏRDARLIQ: Oyun başlamayıb və ya bitib. Room=${roomId}, User=${user.nickname}`);
           return socket.emit('game_error', 'Oyun başlamayıb və ya artıq bitib.');
      }
      if (data === null || typeof data.index !== 'number') {
          console.warn(`[Socket Event 5.6 - make_move] XƏTA: Keçərsiz data formatı (index yoxdur). User=${user.nickname}`);
          return socket.emit('game_error', 'Keçərsiz hərəkət məlumatı.');
      }

      const index = data.index;

      // --- Server Tərəfi Məntiqi Çağır ---
      // handleMakeMoveServer funksiyası sıra, xananın boşluğu kimi yoxlamaları edəcək,
      // lövhəni yeniləyəcək, qazanma/heç-heçəni yoxlayacaq və sıranı dəyişəcək.
      const moveResult = handleMakeMoveServer(roomId, socket.id, index);

      // --- Nəticəni Clientlərə Göndər ---
      if (moveResult) {
          // Hərəkət server tərəfindən uğurla emal edilibsə (istər oyun bitsin, istər davam etsin),
          // yenilənmiş gameState-i otaqdakı bütün oyunçulara göndər.
          console.log(`[Socket IO 5.6 - make_move] Hərəkət uğurlu. Yenilənmiş gameState (${roomId}) göndərilir.`);
          emitGameStateUpdate(roomId, 'make_move');
      } else {
          // Hərəkət server tərəfindən qəbul edilməyibsə (məsələn, sıra səhvi, dolu xana)
          console.warn(`[Socket Event 5.6 - make_move] Server tərəfi hərəkəti qəbul etmədi. User=${user.nickname}, Index=${index}`);
          // Clientə xəta mesajı göndərək ki, niyə hərəkətin olmadığını bilsin
          // (handleMakeMoveServer içindəki loglara baxaraq səbəbi bilmək olar)
          socket.emit('invalid_move', { message: 'Keçərsiz hərəkət (Sıra sizdə deyil və ya xana doludur).' });
      }
  }); // socket.on('make_move', ...) sonu


  // ======================================================
  // === BU BLOKUN İÇİNDƏ DİGƏR HADİSƏ DİNLƏYİCİLƏRİ ===
  // ===              (Part 5.7 və sonrası)           ===
  // ======================================================

// --- Part 5.6 Sonu (io.on('connection') bloku hələ bağlanmayıb!) ---
// --------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// io.on('connection', (socket) => {
//     ... (Part 5.1 - 5.6-dan kodlar) ...

    // --------------------------------------------------------------------
    // --- Part 5.7: 'dice_roll_result' Hadisə Handler-i (Yenidən İşlənmiş) ---
    // --------------------------------------------------------------------
    // Qeyd: Clientdən gələn zər atma nəticəsini qəbul edir, serverdə
    // saxlayır, hər iki nəticə olduqda qalibi təyin edir və vəziyyəti yeniləyir.

    socket.on('dice_roll_result', (data) => {
      // Client zər atdıqdan sonra nəticəsini göndərir
      // data = { roll: <zər_nəticəsi> }

      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      const roomId = currentUserSocketInfo?.currentRoom;

      console.log(`[Socket Event 5.7 - dice_roll] Hadisə alındı: User=${user?.nickname} (${socket.id}), Room=${roomId}, Data=`, data);

      // --- Yoxlamalar ---
      if (!user || !currentUserSocketInfo) { console.error(`[Socket Event 5.7 - dice_roll] XƏTA: User məlumatları tapılmadı!`); return; }
      if (!roomId || !rooms[roomId]) { console.error(`[Socket Event 5.7 - dice_roll] XƏTA: Otaq (${roomId}) tapılmadı. User=${user.nickname}`); return socket.emit('game_error', 'Otaq tapılmadı.'); }
      const room = rooms[roomId];
      if (!room.gameState || room.gameState.isGameOver || room.gameState.currentPlayerSymbol !== null) { // currentPlayerSymbol null olmalıdır (zər atma mərhələsi)
           console.warn(`[Socket Event 5.7 - dice_roll] XƏBƏRDARLIQ: Zər atmaq üçün uyğun olmayan oyun vəziyyəti. Room=${roomId}, User=${user.nickname}, State=`, room.gameState);
           return socket.emit('game_error', 'Hazırda zər atmaq mümkün deyil.');
      }
      if (!data || typeof data.roll !== 'number' || data.roll < 1 || data.roll > 6) {
          console.warn(`[Socket Event 5.7 - dice_roll] XƏTA: Keçərsiz zər nəticəsi. User=${user.nickname}, Data=`, data);
          return socket.emit('game_error', 'Keçərsiz zər nəticəsi göndərildi.');
      }

      const state = room.gameState;
      const playerRoll = data.roll;
      let playerRollField = null; // Hansı oyunçunun nəticəsidir? (player1Roll / player2Roll)

      // --- Nəticəni gameState-də Saxla ---
      if (socket.id === state.player1SocketId) {
          if (state.player1Roll !== null) { console.warn(`[Socket Event 5.7 - dice_roll] XƏBƏRDARLIQ: Player 1 (${user.nickname}) artıq zər atmışdı (${state.player1Roll}). Yeni nəticə: ${playerRoll}`); }
          state.player1Roll = playerRoll;
          playerRollField = 'player1Roll';
          console.log(`[State 5.7] Player 1 (${user.nickname}) zər nəticəsi (${playerRoll}) saxlandı. Room=${roomId}`);
      } else if (socket.id === state.player2SocketId) {
          if (state.player2Roll !== null) { console.warn(`[Socket Event 5.7 - dice_roll] XƏBƏRDARLIQ: Player 2 (${user.nickname}) artıq zər atmışdı (${state.player2Roll}). Yeni nəticə: ${playerRoll}`); }
          state.player2Roll = playerRoll;
          playerRollField = 'player2Roll';
          console.log(`[State 5.7] Player 2 (${user.nickname}) zər nəticəsi (${playerRoll}) saxlandı. Room=${roomId}`);
      } else {
          // Bu socket ID oyunçulardan heç biri deyil (çox qəribə hal)
          console.error(`[Socket Event 5.7 - dice_roll] XƏTA: Zər atan socket (${socket.id}) otağın (${roomId}) oyunçusu deyil!`);
          return socket.emit('game_error', 'Siz bu otağın oyunçusu deyilsiniz.');
      }

      // Clientə öz nəticəsinin alındığını bildirmək üçün dərhal update göndərək? (Optional)
      // emitGameStateUpdate(roomId, 'dice_roll_received'); // Bu, UI-də "?" yerinə rəqəmi göstərə bilər

      // --- Hər İki Oyunçu Zər Atıbsa, Qalibi Təyin Et ---
      if (state.player1Roll !== null && state.player2Roll !== null) {
          console.log(`[Game Logic 5.7] Hər iki oyunçu zər atdı: P1=${state.player1Roll}, P2=${state.player2Roll}. Room=${roomId}`);
          if (state.player1Roll > state.player2Roll) {
              state.diceWinnerSocketId = state.player1SocketId;
              state.symbolPickerSocketId = state.player1SocketId; // Qalib simvol seçir
              state.statusMessage = `${state.player1Username} yüksək atdı! Simvol seçimi...`;
              console.log(`[Game Logic 5.7] Zər qalibi: Player 1 (${state.player1Username}). Room=${roomId}`);
          } else if (state.player2Roll > state.player1Roll) {
              state.diceWinnerSocketId = state.player2SocketId;
              state.symbolPickerSocketId = state.player2SocketId; // Qalib simvol seçir
              state.statusMessage = `${state.player2Username} yüksək atdı! Simvol seçimi...`;
              console.log(`[Game Logic 5.7] Zər qalibi: Player 2 (${state.player2Username}). Room=${roomId}`);
          } else { // Bərabərlik
              state.diceWinnerSocketId = null;
              state.symbolPickerSocketId = null; // Heç kim seçmir
              state.player1Roll = null; // Nəticələri sıfırla
              state.player2Roll = null;
              state.statusMessage = "Bərabərlik! Zərlər təkrar atılır...";
              console.log(`[Game Logic 5.7] Zər bərabərə! Təkrar atılacaq. Room=${roomId}`);
              // Bərabərlik halında da state yeniləməsini göndərək ki, clientlər bilsin
          }
          // Yenilənmiş gameState-i (qalib və ya bərabərlik statusu ilə) hər kəsə göndər
          emitGameStateUpdate(roomId, 'dice_results_processed');
      } else {
          // Hələ ikinci oyunçunun nəticəsi gözlənilir
          const waitingForPlayer = (playerRollField === 'player1Roll') ? state.player2Username : state.player1Username;
          state.statusMessage = `${waitingForPlayer}-in zər atması gözlənilir...`;
          console.log(`[Game Logic 5.7] ${waitingForPlayer}-in zər nəticəsi gözlənilir. Room=${roomId}`);
          // Yalnız bu oyunçunun nəticəsi gəldiyi üçün vəziyyəti yenə də göndərək
          emitGameStateUpdate(roomId, 'one_dice_result_received');
      }

  }); // socket.on('dice_roll_result', ...) sonu


  // ======================================================
  // === BU BLOKUN İÇİNDƏ DİGƏR HADİSƏ DİNLƏYİCİLƏRİ ===
  // ===              (Part 5.8 və sonrası)           ===
  // ======================================================

// --- Part 5.7 Sonu (io.on('connection') bloku hələ bağlanmayıb!) ---
// --------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// io.on('connection', (socket) => {
//     ... (Part 5.1 - 5.7-dən kodlar) ...

    // --------------------------------------------------------------------
    // --- Part 5.8: 'symbol_choice' Hadisə Handler-i (Yenidən İşlənmiş) ---
    // --------------------------------------------------------------------
    // Qeyd: Zəri udan clientdən gələn simvol seçimini qəbul edir,
    // oyunçu simvollarını və ilk sıranı təyin edir, oyunu başladır.

    socket.on('symbol_choice', (data) => {
      // Zəri udan client simvol seçdikdən sonra göndərir
      // data = { symbol: 'X' (və ya 'O') }

      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      const roomId = currentUserSocketInfo?.currentRoom;

      console.log(`[Socket Event 5.8 - symbol_choice] Hadisə alındı: User=${user?.nickname} (${socket.id}), Room=${roomId}, Data=`, data);

      // --- Yoxlamalar ---
      if (!user || !currentUserSocketInfo) { console.error(`[Socket Event 5.8 - symbol_choice] XƏTA: User məlumatları tapılmadı!`); return; }
      if (!roomId || !rooms[roomId]) { console.error(`[Socket Event 5.8 - symbol_choice] XƏTA: Otaq (${roomId}) tapılmadı. User=${user.nickname}`); return socket.emit('game_error', 'Otaq tapılmadı.'); }
      const room = rooms[roomId];
      if (!room.gameState || room.gameState.isGameOver) { console.warn(`[Socket Event 5.8 - symbol_choice] XƏBƏRDARLIQ: Oyun başlamayıb/bitib. Room=${roomId}, User=${user.nickname}`); return socket.emit('game_error', 'Oyun başlamayıb və ya artıq bitib.'); }
      if (room.gameState.player1Symbol !== null || room.gameState.player2Symbol !== null) { console.warn(`[Socket Event 5.8 - symbol_choice] XƏBƏRDARLIQ: Simvollar artıq seçilib. Room=${roomId}, User=${user.nickname}`); return socket.emit('game_error', 'Simvollar artıq seçilib.'); }
      if (socket.id !== room.gameState.symbolPickerSocketId) { // Yalnız zəri udan seçə bilər
          console.warn(`[Socket Event 5.8 - symbol_choice] XƏTA: Simvol seçmə növbəsi bu oyunçuda (${user.nickname}) deyil. Seçməli olan: ${room.gameState.symbolPickerSocketId}`);
          return socket.emit('game_error', 'Simvol seçmə növbəsi sizdə deyil.');
      }
      if (!data || (data.symbol !== 'X' && data.symbol !== 'O')) {
          console.warn(`[Socket Event 5.8 - symbol_choice] XƏTA: Keçərsiz simvol seçimi. User=${user.nickname}, Data=`, data);
          return socket.emit('game_error', 'Keçərsiz simvol seçimi göndərildi.');
      }

      // --- Simvolları və İlk Sıranı Təyin Et ---
      const state = room.gameState;
      const chosenSymbol = data.symbol;
      const opponentSymbol = (chosenSymbol === 'X') ? 'O' : 'X';

      // Simvolları gameState-ə yaz
      if (socket.id === state.player1SocketId) { // Əgər seçən Player 1 idisə
          state.player1Symbol = chosenSymbol;
          state.player2Symbol = opponentSymbol;
      } else { // Seçən Player 2 idisə
          state.player2Symbol = chosenSymbol;
          state.player1Symbol = opponentSymbol;
      }
      console.log(`[State 5.8] Simvollar təyin edildi: P1(${state.player1Username})=${state.player1Symbol}, P2(${state.player2Username})=${state.player2Symbol}. Room=${roomId}`);

      // Oyuna kimin başlayacağını təyin et (simvolu seçən başlayır)
      state.currentPlayerSymbol = chosenSymbol;
      console.log(`[State 5.8] Oyuna başlayan təyin edildi: ${state.currentPlayerSymbol} (${user.nickname}). Room=${roomId}`);

      // Artıq simvol seçimi bitdi
      state.symbolPickerSocketId = null;
      state.isGameOver = false; // Oyun rəsmən başladı!

      // Status mesajını yenilə
      const currentPlayerUsername = (state.currentPlayerSymbol === state.player1Symbol) ? state.player1Username : state.player2Username;
      state.statusMessage = `Sıra: ${currentPlayerUsername || state.currentPlayerSymbol}`;
      state.lastMoveTime = Date.now(); // Oyunun başlama vaxtı kimi

      // --- Yenilənmiş Vəziyyəti Göndər ---
      console.log(`[Socket IO 5.8 - symbol_choice] Simvol seçildi. Oyun başlayır! Yenilənmiş gameState (${roomId}) göndərilir.`);
      emitGameStateUpdate(roomId, 'symbol_chosen_game_started');

  }); // socket.on('symbol_choice', ...) sonu


  // ======================================================
  // === BU BLOKUN İÇİNDƏ DİGƏR HADİSƏ DİNLƏYİCİLƏRİ ===
  // ===              (Part 5.9 və sonrası)           ===
  // ======================================================


// --- Part 5.8 Sonu (io.on('connection') bloku hələ bağlanmayıb!) ---
// --------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// io.on('connection', (socket) => {
//     ... (Part 5.1 - 5.8-dən kodlar) ...

    // --------------------------------------------------------------------
    // --- Part 5.9: Yenidən Başlatma Hadisə Handler-ları ---
    // --------------------------------------------------------------------
    // Qeyd: Oyun bitdikdən sonra oyunçuların yenidən başlatma təklifi
    // göndərməsi və qəbul etməsi məntiqi.

    // ----- Yenidən Başlatma Təklifi ('request_restart') -----
    socket.on('request_restart', () => {
      const user = socket.user;
      const currentUserSocketInfo = users[socket.id];
      const roomId = currentUserSocketInfo?.currentRoom;

      console.log(`[Socket Event 5.9 - request_restart] Hadisə alındı: User=${user?.nickname} (${socket.id}), Room=${roomId}`);

      // --- Yoxlamalar ---
      if (!user || !currentUserSocketInfo) { console.error(`[Socket Event 5.9 - request_restart] XƏTA: User məlumatları yoxdur!`); return; }
      if (!roomId || !rooms[roomId]) { console.error(`[Socket Event 5.9 - request_restart] XƏTA: Otaq (${roomId}) tapılmadı. User=${user.nickname}`); return socket.emit('game_error', 'Otaq tapılmadı.'); }
      const room = rooms[roomId];
      if (!room.gameState) { console.warn(`[Socket Event 5.9 - request_restart] XƏBƏRDARLIQ: Oyun vəziyyəti yoxdur. Room=${roomId}, User=${user.nickname}`); return socket.emit('game_error', 'Oyun vəziyyəti tapılmadı.'); }
      // Yalnız oyun bitdikdən sonra restart təklif etməyə icazə ver
      if (!room.gameState.isGameOver) {
          console.warn(`[Socket Event 5.9 - request_restart] XƏBƏRDARLIQ: Oyun hələ bitməyib. Room=${roomId}, User=${user.nickname}`);
          return socket.emit('game_error', 'Yenidən başlatmaq üçün oyunun bitməsini gözləyin.');
      }
      if (room.players.length < 2) {
           console.warn(`[Socket Event 5.9 - request_restart] XƏBƏRDARLIQ: Otaqda tək oyunçudur. Room=${roomId}, User=${user.nickname}`);
          return socket.emit('game_error', 'Yenidən başlatmaq üçün rəqib lazımdır.');
      }

      // --- Təklifi Rəqibə Göndər ---
      // Rəqibin socket ID-sini tap
      const opponentSocketId = room.players.find(pId => pId !== socket.id);
      if (opponentSocketId && io.sockets.sockets.get(opponentSocketId)) { // Rəqibin hələ də qoşulu olduğunu yoxla
          console.log(`[Socket IO 5.9 - request_restart] Restart təklifi ${user.nickname}-dən ${users[opponentSocketId]?.username}-ə (${opponentSocketId}) göndərilir.`);
          io.to(opponentSocketId).emit('restart_requested', { username: user.nickname });
          // Təklifi göndərənə də bildiriş göndərək (optional)
          socket.emit('info_message', 'Yenidən başlatma təklifi rəqibə göndərildi.');
           // Oyun vəziyyətini də yeniləyək ki, hər iki tərəfdə görünsün
           room.gameState.statusMessage = `${user.nickname} yenidən başlatmağı təklif etdi...`;
           emitGameStateUpdate(roomId, 'restart_requested');
      } else {
          console.warn(`[Socket IO 5.9 - request_restart] Rəqib (${opponentSocketId}) tapılmadı və ya qoşulu deyil. Room=${roomId}`);
          socket.emit('game_error', 'Rəqib tapılmadı və ya artıq otaqda deyil.');
      }
  });


  // ----- Yenidən Başlatma Qəbulu ('accept_restart') -----
  socket.on('accept_restart', () => {
      const user = socket.user; // Təklifi qəbul edən
      const currentUserSocketInfo = users[socket.id];
      const roomId = currentUserSocketInfo?.currentRoom;

      console.log(`[Socket Event 5.9 - accept_restart] Hadisə alındı: User=${user?.nickname} (${socket.id}), Room=${roomId}`);

      // --- Yoxlamalar ---
      if (!user || !currentUserSocketInfo) { console.error(`[Socket Event 5.9 - accept_restart] XƏTA: User məlumatları yoxdur!`); return; }
      if (!roomId || !rooms[roomId]) { console.error(`[Socket Event 5.9 - accept_restart] XƏTA: Otaq (${roomId}) tapılmadı. User=${user.nickname}`); return socket.emit('game_error', 'Otaq tapılmadı.'); }
      const room = rooms[roomId];
      if (!room.gameState) { console.warn(`[Socket Event 5.9 - accept_restart] XƏBƏRDARLIQ: Oyun vəziyyəti yoxdur. Room=${roomId}, User=${user.nickname}`); return socket.emit('game_error', 'Oyun vəziyyəti tapılmadı.'); }
      // Yalnız oyun bitibsə qəbul etməyə icazə ver (və ya təklif statusundadırsa)
      if (!room.gameState.isGameOver && !(room.gameState.statusMessage && room.gameState.statusMessage.includes("təklif"))) {
          console.warn(`[Socket Event 5.9 - accept_restart] XƏBƏRDARLIQ: Oyun bitməyib və ya restart təklifi yoxdur. Room=${roomId}, User=${user.nickname}`);
          return socket.emit('game_error', 'Yenidən başlatmaq üçün oyun bitməli və ya təklif göndərilməlidir.');
      }
       if (room.players.length < 2) {
           console.warn(`[Socket Event 5.9 - accept_restart] XƏBƏRDARLIQ: Otaqda tək oyunçudur. Room=${roomId}, User=${user.nickname}`);
          return socket.emit('game_error', 'Yenidən başlatmaq üçün rəqib lazımdır.');
      }

      // --- Oyunu Sıfırla və Yenidən Başlat ---
      console.log(`[Game Logic 5.9] Restart təklifi qəbul edildi (${user.nickname}). Oyun (${roomId}) sıfırlanır...`);

      // Oyun vəziyyətini sıfırla (initializeGameState çağıraraq)
      // Oyunçu ID-lərini saxlamaq lazımdır
      const player1SocketId = room.gameState.player1SocketId;
      const player2SocketId = room.gameState.player2SocketId;
      initializeGameState(room, player1SocketId, player2SocketId); // Bu, gameState-i "Zər Atılır..." vəziyyətinə gətirəcək

      // Yenilənmiş gameState-i hər iki oyunçuya göndər
      console.log(`[Socket IO 5.9 - accept_restart] Oyun sıfırlandı. Yenilənmiş gameState (${roomId}) göndərilir.`);
      emitGameStateUpdate(roomId, 'restart_accepted');

  }); // socket.on('accept_restart', ...) sonu

  // ======================================================
  // === BU BLOKUN İÇİNDƏ DİGƏR HADİSƏ DİNLƏYİCİLƏRİ ===
  // ===              (Part 5.10 - Son)             ===
  // ======================================================


// --- Part 5.9 Sonu (io.on('connection') bloku hələ bağlanmayıb!) ---
// --------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// io.on('connection', (socket) => {
//     ... (Part 5.1 - 5.9-dan kodlar) ...

    // --------------------------------------------------------------------
    // --- Part 5.10: 'disconnect' Hadisəsi & Təmizləmə Funksiyası ---
    // --------------------------------------------------------------------
    // Qeyd: Socket bağlantısı kəsildikdə (istər istifadəçi bağlasın, istər
    // şəbəkə problemi olsun) işə düşür və istifadəçinin vəziyyətini təmizləyir.

    // ----- Bağlantı Kəsildikdə ('disconnect') -----
    socket.on('disconnect', (reason) => {
      // Socket bağlantısı hər hansı səbəbdən kəsildikdə bu hadisə işə düşür
      const userInfo = users[socket.id]; // users obyektindən məlumatı alaq (əgər varsa)
      console.log(`[Socket Disconnect 5.10] İstifadəçi ayrıldı: ${userInfo?.username || socket.id}. Səbəb: ${reason}`);
      // Əsas təmizləmə işini handleDisconnectOrLeave görəcək
      handleDisconnectOrLeave(socket); // socket obyektini göndərək
  });


  // ----- Otaqdan Ayrılma / Bağlantı Kəsilmə Təmizləmə Funksiyası (Yenilənmiş) -----
  // Bu funksiya həm 'leave_room', həm 'kick_opponent', həm də 'disconnect' üçün çağırılır.
  function handleDisconnectOrLeave(socketInstance) {
      const socketId = socketInstance.id;

      // --- İstifadəçinin hələ də 'users' obyektində olub olmadığını yoxla ---
      // Bu, funksiyanın təkrar çağırılmasının qarşısını alır
      if (!users[socketId]) {
          console.warn(`[handleDisconnectOrLeave 5.10] User ${socketId} artıq emal edilib və ya 'users' obyektində tapılmadı. Keçilir.`);
          return;
      }

      const leavingUserInfo = users[socketId]; // İstifadəçi məlumatını *əvvəlcə* alaq
      const username = leavingUserInfo.username;
      const roomId = leavingUserInfo.currentRoom; // İstifadəçinin hansı otaqda olduğunu bilirik

      console.log(`[handleDisconnectOrLeave 5.10] Emal edilir: User=${username} (${socketId}), Room=${roomId || 'Yoxdur'}`);

      // --- İstifadəçini Otaqdan Sil (Əgər Bir Otaqdadırsa) ---
      let roomExistedAndPlayerRemoved = false; // Otaq siyahısını yeniləmək üçün flag
      if (roomId && rooms[roomId]) {
          const room = rooms[roomId];
          const playerIndex = room.players.indexOf(socketId);

          if (playerIndex > -1) {
              roomExistedAndPlayerRemoved = true; // Bəli, oyunçu bu otaqda idi və silinəcək
              room.players.splice(playerIndex, 1); // Oyunçunu otağın players massivindən sil
              console.log(`[handleDisconnectOrLeave 5.10] ${username} otaqdan (${roomId}) silindi. Qalan oyunçu sayı: ${room.players.length}`);

              // --- Oyun Vəziyyətini Yenilə (Əgər Oyun Gedirdisə) ---
              if (room.gameState) {
                  // Oyunu bitmiş hesab etmək və ya digər oyunçuya bildirmək?
                  // Əgər oyunçu tək qalıbsa, oyunu bitirək.
                  if (room.players.length < 2 && !room.gameState.isGameOver) {
                       console.log(`[handleDisconnectOrLeave 5.10] Rəqib ayrıldığı üçün oyun (${roomId}) bitirilir.`);
                       room.gameState.isGameOver = true;
                       // Qalan oyunçuya bildiriş (əgər varsa)
                       const remainingPlayerId = room.players[0];
                       if (remainingPlayerId) {
                           room.gameState.statusMessage = `${username} oyundan ayrıldı.`;
                           // Qalan oyunçuya yenilənmiş vəziyyəti göndər
                           // emitGameStateUpdate(roomId, 'opponent_left_mid_game'); // Bunu ayrıca etmək olar
                       } else {
                           room.gameState.statusMessage = "Otaq boşaldı."; // Heç kim qalmadı
                       }
                       // Hər halda gameState yeniləməsini göndərək
                       emitGameStateUpdate(roomId, 'opponent_left_game');
                  }
                  // Oyunçunun socket ID-sini gameState-dən null edək (və ya user ID qalsın?)
                  if (room.gameState.player1SocketId === socketId) room.gameState.player1SocketId = null;
                  if (room.gameState.player2SocketId === socketId) room.gameState.player2SocketId = null;
              }

              // --- Boş Qalan Otağı Silmə Məntiqi ---
              if (room.players.length === 0 && !room.isAiRoom) {
                  if (room.deleteTimeout) { clearTimeout(room.deleteTimeout); } // Köhnəni ləğv et
                  const deletionDelay = 300000; // 5 dəqiqə
                  console.log(`[handleDisconnectOrLeave 5.10] Otaq ${roomId} boş qaldı. ${deletionDelay / 60000} dəqiqə sonra silinməsi planlaşdırılır.`);
                  room.deleteTimeout = setTimeout(() => {
                      if (rooms[roomId] && rooms[roomId].players.length === 0) {
                          console.log(`[handleDisconnectOrLeave 5.10] Boş otaq ${roomId} silinir.`);
                          delete rooms[roomId];
                          broadcastRoomList(); // Silindikdən sonra siyahını yenilə
                      } else {
                          console.log(`[handleDisconnectOrLeave 5.10] Otağın (${roomId}) silinməsi ləğv edildi (bəlkə kimsə qoşuldu).`);
                          if (rooms[roomId]) delete rooms[roomId].deleteTimeout;
                      }
                  }, deletionDelay);
              }
               // Əgər yaradan çıxıbsa və otaqda oyunçu qalıbsa, yaradanı dəyiş
               else if (room.players.length === 1 && room.creatorUsername === username && !room.isAiRoom) {
                  const remainingPlayerId = room.players[0];
                  if(users[remainingPlayerId]) {
                       room.creatorUsername = users[remainingPlayerId].username;
                       console.log(`[handleDisconnectOrLeave 5.10] Otaq (${roomId}) yaradanı ${room.creatorUsername}-ə dəyişdi.`);
                  } else {
                       room.creatorUsername = 'Naməlum'; // Qalan oyunçunun məlumatı yoxdursa
                       console.warn(`[handleDisconnectOrLeave 5.10] Qalan oyunçunun (${remainingPlayerId}) məlumatı tapılmadı.`);
                  }
               }

          } else {
              console.warn(`[handleDisconnectOrLeave 5.10] ${username} (${socketId}) ${roomId} otağının oyunçu siyahısında tapılmadı (state uyğunsuzluğu?).`);
          }
      } // if (roomId && rooms[roomId]) sonu

      // --- İstifadəçini Qlobal `users` Obyektindən Sil ---
      // Bütün otaq əməliyyatları bitdikdən sonra silək
      delete users[socketId];
      console.log(`[handleDisconnectOrLeave 5.10] İstifadəçi ${username} (${socketId}) 'users' obyektindən silindi.`);

      // --- Otaq Siyahısını Yenilə (Əgər Oyunçu Həqiqətən Bir Otaqdan Çıxıbsa) ---
      if (roomExistedAndPlayerRemoved) {
          console.log(`[handleDisconnectOrLeave 5.10] ${username} otaqdan çıxdığı üçün otaq siyahısı göndərilir.`);
          broadcastRoomList();
      }
      // Əgər istifadəçi heç bir real otaqda deyildisə, broadcast etməyə ehtiyac yoxdur.
  } // handleDisconnectOrLeave sonu


}); // <<< --- io.on('connection', ...) BLOKUNUN BAĞLANMASI --- <<<

console.log('[Setup 5.10] Socket.IO "connection" handler-i və bütün daxili dinləyicilər təyin edildi.');

// ------------------------------------------------------------------------
// --- Hissə 5 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// Server.js - Yenidən Qurulmuş v5 (Server-Mərkəzli Vəziyyət + Loglama)
// ========================================================================
// ------------------------------------------------------------------------
// --- Part 6.1: Serveri Başlatma & Səliqəli Dayandırma (Log Əlavə Edilib) ---
// ------------------------------------------------------------------------
// Qeyd: HTTP serverini dinləməyə başlayır və server dayandırıldıqda
// bağlantıları səliqəli şəkildə bağlamaq üçün məntiq.

console.log('[Setup 6.1] Serverin başladılması və dayandırılması məntiqi təyin edilir...');

// ----- Serveri Başlatma -----
// PORT mühit dəyişənini və ya default 3000-i istifadə et
const PORT = process.env.PORT || 3000;

// <<< --- YENİ DİAQNOSTİK LOG --- >>>
// server.listen çağırılmazdan dərhal əvvəl log mesajı əlavə edirik
console.log(`[Server Start 6.1] server.listen(${PORT}) funksiyası ÇAĞIRILIR...`); 

server.listen(PORT, () => {
    // --- Bu callback YALNIZ server portu uğurla dinləməyə başladıqda işə düşür ---
    const startTime = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
    console.log('=======================================================');
    // <<< --- BU LOGUN GÖRÜNMƏSİ KRİTİKDİR! --- >>>
    console.log(`---- Server ${PORT} portunda uğurla işə düşdü! ----`); 
    console.log(`---- Canlı Ünvan (təxmini): http://localhost:${PORT} (Render öz URL-ini təqdim edəcək) ----`);
    console.log(`---- Server Başlama Zamanı: ${startTime} ----`);
    
    // Server başladığında standart AI otaqlarını yarat/yoxla
    try {
        createDefaultRooms();
    } catch (err) {
        console.error("[Server Start 6.1] createDefaultRooms zamanı xəta:", err);
    }
    
    // İlkin otaq siyahısını yayımla (əgər qoşulu client varsa)
    try {
        broadcastRoomList();
    } catch (err) {
        console.error("[Server Start 6.1] broadcastRoomList zamanı xəta:", err);
    }
    
    console.log('=======================================================');
});

// server.listen üçün əlavə xəta handlerı (optional, amma faydalı ola bilər)
server.on('error', (error) => {
    console.error(`[Server Start 6.1] server.listen XƏTASI: Port ${PORT} ilə bağlı problem yarandı!`, error);
    // Xətanın növünə görə fərqli addımlar atmaq olar
    if (error.code === 'EADDRINUSE') {
        console.error(`[Server Start 6.1] XƏTA: Port ${PORT} artıq istifadə olunur.`);
    } else {
        console.error('[Server Start 6.1] Naməlum server başlatma xətası.');
    }
    process.exit(1); // Xəta varsa serveri dayandır
});

// ----- Serverin Səliqəli Dayandırılması (Graceful Shutdown) -----
function gracefulShutdown(signal) {
    console.warn(`\n[Shutdown 6.1] ${signal} siqnalı alındı. Server bağlanır...`);
    io.close(() => { 
        console.log('[Shutdown 6.1] Bütün socket bağlantıları bağlandı.');
        server.close((err) => { // HTTP serverini bağla
           if(err) { console.error("[Shutdown 6.1] HTTP server bağlanan zaman xəta:", err); }
           else { console.log('[Shutdown 6.1] HTTP server bağlandı.'); }
           
           pool.end((err) => { // PostgreSQL bağlantı pool-unu bağla
               if(err) { console.error("[Shutdown 6.1] PostgreSQL pool bağlanan zaman xəta:", err); }
               else { console.log('[Shutdown 6.1] PostgreSQL bağlantı pool-u bağlandı.'); }
               
               console.warn('[Shutdown 6.1] Server dayandırıldı.');
               process.exit(err ? 1 : 0); // Əgər xəta varsa xəta kodu ilə çıx
           });
        });
    });

    // Timeout
    setTimeout(() => {
        console.error('[Shutdown 6.1] Graceful shutdown vaxtı bitdi (10s), proses zorla dayandırılır!');
        process.exit(1);
    }, 10000); 
}

// Dayandırılma siqnallarını dinlə
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); 
process.on('SIGINT', () => gracefulShutdown('SIGINT')); 

// Gözlənilməz xətaları tutmaq üçün (optional, amma production üçün yaxşıdır)
process.on('uncaughtException', (error) => {
  console.error('[FATAL ERROR 6.1] Uncaught Exception:', error);
  // Burada xətanı loglamaq və serveri səliqəli dayandırmağa çalışmaq olar
  gracefulShutdown('uncaughtException'); 
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL ERROR 6.1] Unhandled Rejection:', reason);
  // Burada xətanı loglamaq və serveri səliqəli dayandırmağa çalışmaq olar
  gracefulShutdown('unhandledRejection');
});

// ------------------------------------------------------------------------
// --- Server.js Faylının Sonu ---
// ------------------------------------------------------------------------