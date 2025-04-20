// server/server.js - Əsas Giriş Nöqtəsi (Düzəlişli Versiya)
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const { createAdapter } = require('@socket.io/redis-adapter');

// Konfiqurasiyaları import et
const { pool, testDBConnection } = require('./config/db');
const { pubClient, subClient } = require('./config/redis'); // pubClient lazım olacaq
const sessionMiddleware = require('./config/session');

// Routeları import et
const authRoutes = require('./routes/auth.routes.js');

// Socket.IO başladıcı funksiyasını import et
const initializeSocketIO = require('../socket/index.js');

// --- Express Tətbiqini Yarat ---
const app = express();
const server = http.createServer(app);

// --- Socket.IO Serverini Yarat ---
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:8080",
        methods: ["GET", "POST"],
        credentials: true
    },
    pingInterval: 30000, // 20 saniyəyə artırıldı
    pingTimeout: 45000,  // 30 saniyəyə artırıldı
    transports: ['websocket'] // Yalnız WebSocket istifadəsi
});
console.log(`[Setup] Socket.IO serveri yaradıldı. CORS Origin: ${process.env.CLIENT_URL || "http://localhost:8080"}`);

// Session middleware-ni Socket.IO üçün əlçatan et
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
console.log('[Setup] Express session middleware Socket.IO üçün əlavə edildi.');

// --- YENİ: Redis Təmizləmə Funksiyası ---
async function clearAllGameDataFromRedis() {
    console.warn("[Redis Cleanup] Server başladılır, köhnə oyun məlumatları silinir...");
    try {
        // "room:" ilə başlayan bütün açarları tap və sil
        let cursorRoom = 0;
        do {
            const reply = await pubClient.scan(cursorRoom, { MATCH: 'room:*', COUNT: 100 });
            cursorRoom = reply.cursor;
            const keys = reply.keys;
            if (keys.length > 0) {
                console.log(`[Redis Cleanup] Silinir (room:*): ${keys.length} açar`);
                await pubClient.del(keys);
            }
        } while (cursorRoom !== 0);

        // "socket:" ilə başlayan bütün açarları tap və sil
        let cursorSocket = 0;
        do {
            const reply = await pubClient.scan(cursorSocket, { MATCH: 'socket:*', COUNT: 100 });
            cursorSocket = reply.cursor;
            const keys = reply.keys;
            if (keys.length > 0) {
                console.log(`[Redis Cleanup] Silinir (socket:*): ${keys.length} açar`);
                await pubClient.del(keys);
            }
        } while (cursorSocket !== 0);

        // "activeRooms" setini sil
        const deletedActiveRooms = await pubClient.del('activeRooms');
        console.log(`[Redis Cleanup] 'activeRooms' seti silindi: ${deletedActiveRooms > 0 ? 'Bəli' : 'Yox (və ya boş idi)'}`);

        console.warn("[Redis Cleanup] Köhnə oyun məlumatlarının silinməsi tamamlandı.");
        return true;
    } catch (error) {
        console.error("[Redis Cleanup ERROR] Köhnə məlumatlar silinərkən xəta:", error);
        return false; // Xəta baş verərsə bildirmək üçün
    }
}
// --- YENİ FUNKSİYA SONU ---


// --- Əsas Server Başlatma Funksiyası ---
async function startServer() {
    try {
        console.log("[Server Start] Redis klientlərinin qoşulması gözlənilir...");
        await Promise.all([
            pubClient.connect(),
            subClient.connect()
        ]);
        console.log('✅✅✅ Pub/Sub Redis klientləri qoşuldu.');

        // ----- YENİ ADDIM: REDIS-i TƏMİZLƏ -----
        await clearAllGameDataFromRedis();
        // ----- YENİ ADDIM SONU -----

        // Socket.IO Adapterini Quraşdır
        io.adapter(createAdapter(pubClient, subClient));
        console.log('✅ Socket.IO Redis adapteri konfiqurasiya edildi.');

        console.log("[Server Start] Verilənlər bazası bağlantısı yoxlanılır...");
        await testDBConnection(); // DB-ni yoxla

        // --- Express Middleware-lərini Tətbiq Et ---
        app.use(sessionMiddleware); // Sessiya middleware
        app.use(express.json());    // JSON parser
        app.use(express.urlencoded({ extended: true })); // URL-encoded parser

        // Sorğu Loglama Middleware
        app.use((req, res, next) => {
            // Statik fayl və WebSocket sorğularını loglamayaq
            if (req.headers.upgrade === 'websocket' || (req.url.includes('.') && !req.url.endsWith('.html'))) {
                return next();
            }
            const userNickname = req.session?.user?.nickname || 'Anonymous';
            console.log(`[HTTP Request] ${req.method} ${req.originalUrl} (User: ${userNickname})`);
            next();
        });

        // Statik Fayllar Middleware
        const publicDirectoryPath = path.join(__dirname, '../public');
        app.use(express.static(publicDirectoryPath));
        console.log('[Setup] Əsas middleware-lər (Session, JSON, Log, Static) tətbiq edildi.');

        // --- Express Routelarını Tətbiq Et ---
        app.use('/api/auth', authRoutes);
        console.log('[Setup] Autentifikasiya routeları (/api/auth) tətbiq edildi.');

        // Kök URL üçün yönləndirmə
        app.get('/', (req, res) => {
            res.redirect('/ana_sehife/login/login.html');
        });

        // --- Socket.IO Başlat ---
        initializeSocketIO(io); // Socket.IO məntiqini başladırıq

        // --- Serveri Dinləməyə Başla ---
        const PORT = process.env.PORT || 8080;
        server.listen(PORT, '0.0.0.0', () => {
            const startTime = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
            console.log('=====================================================================');
            console.log(`---- Server (Refactored + Redis) ${PORT} portunda işə düşdü! ----`);
            console.log(`---- Server Başlama Zamanı: ${startTime} ----`);
            console.log('=====================================================================');
        });

        server.on('error', (error) => {
            console.error(`[Server Start ERROR] server.listen XƏTASI: Port ${PORT} problemi!`, error);
            if (error.code === 'EADDRINUSE') { console.error(`XƏTA: Port ${PORT} artıq istifadə olunur.`); }
            gracefulShutdown('Listen Error');
        });

    } catch (err) {
        console.error('❌❌❌ Server işə salınarkən KRİTİK XƏTA (Redis, DB və ya başqa):', err);
        process.exit(1);
    }
}

// --- Səliqəli Dayandırma ---
async function gracefulShutdown(signal) {
    console.warn(`\n[Shutdown] ${signal} siqnalı alındı. Server bağlanır...`);
    try {
        // HTTP serverini bağla
        await new Promise((resolve, reject) => {
            server.close(err => {
                if (err) return reject(err);
                console.log('[Shutdown] HTTP server bağlandı.');
                resolve();
            });
        });

        // Socket.IO serverini bağla
        await new Promise((resolve) => {
            io.close(() => {
                console.log('[Shutdown] Socket.IO bağlandı.');
                resolve();
            });
        });

        // Redis klientlərini bağla (xətaları tutmaqla)
        await Promise.all([
             pubClient.quit().catch(e => console.error('[Shutdown WARN] PubClient quit error:', e)),
             subClient.quit().catch(e => console.error('[Shutdown WARN] SubClient quit error:', e))
         ]);
        console.log('[Shutdown] Redis klientləri bağlandı.');

        // DB poolunu bağla
        await pool.end();
        console.log('[Shutdown] DB pool bağlandı.');

        console.warn(`[Shutdown] Server dayandırıldı (${signal}).`);
        process.exit(0);
    } catch (err) {
        console.error("[Shutdown ERROR]:", err);
        process.exit(1);
    } finally {
        // Əgər hər şey düzgün bağlanmazsa, məcburi çıxış
        setTimeout(() => {
            console.error('[Shutdown] Timeout! Məcburi çıxış.');
            process.exit(1);
        }, 10000).unref(); // 10 saniyə gözlə
    }
}

// Siqnalları dinlə
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Tutulmayan xətaları dinlə
process.on('uncaughtException', (error, origin) => {
    console.error('[FATAL ERROR] Uncaught Exception:', error, 'Origin:', origin);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
});

// --- Serveri İşə Sal ---
startServer();

console.log('--- server.js faylının sonu ---');