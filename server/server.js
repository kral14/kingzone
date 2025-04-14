// server/server.js - Əsas Giriş Nöqtəsi
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const { createAdapter } = require('@socket.io/redis-adapter');

// Konfiqurasiyaları import et
const { pool, testDBConnection } = require('./config/db');
const { pubClient, subClient } = require('./config/redis');
const sessionMiddleware = require('./config/session');

// Routeları import et
const authRoutes = require('./routes/auth.routes.js');

// Socket.IO başladıcı funksiyasını import et
const initializeSocketIO = require('./socket');

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
    pingInterval: 10000,
    pingTimeout: 15000
});
console.log(`[Setup] Socket.IO serveri yaradıldı. CORS Origin: ${process.env.CLIENT_URL || "http://localhost:8080"}`);

// --- Əsas Server Başlatma Funksiyası ---
async function startServer() {
    try {
        console.log("[Server Start] Redis klientlərinin qoşulması gözlənilir...");
        await Promise.all([
            pubClient.connect(),
            subClient.connect()
        ]);
        // 'ready' hadisələrini gözləməyə ehtiyac yoxdur, connect() resolve olduqda hazırdır
        console.log('✅✅✅ Pub/Sub Redis klientləri qoşuldu.');

        // Socket.IO Adapterini Quraşdır
        io.adapter(createAdapter(pubClient, subClient));
        console.log('✅ Socket.IO Redis adapteri konfiqurasiya edildi.');

        console.log("[Server Start] Verilənlər bazası bağlantısı yoxlanılır...");
        await testDBConnection(); // DB-ni yoxla

        // --- Express Middleware-lərini Tətbiq Et ---
        app.use(sessionMiddleware); // Sessiya middleware
        app.use(express.json());    // JSON parser
        app.use(express.urlencoded({ extended: true })); // URL-encoded parser (lazım olarsa)

        // Sorğu Loglama Middleware
        app.use((req, res, next) => {
            if (req.headers.upgrade === 'websocket' || (req.url.includes('.') && !req.url.endsWith('.html'))) return next();
            const userNickname = req.session?.user?.nickname || 'Anonymous';
            console.log(`[HTTP Request] ${req.method} ${req.originalUrl} (User: ${userNickname})`);
            next();
        });

        // Statik Fayllar Middleware
        const publicDirectoryPath = path.join(__dirname, '../public');
        app.use(express.static(publicDirectoryPath));
        console.log('[Setup] Əsas middleware-lər (Session, JSON, Log, Static) tətbiq edildi.');

        // --- Express Routelarını Tətbiq Et ---
        // Bütün autentifikasiya ilə bağlı routeları /api/auth prefiksi ilə əlavə et
        app.use('/api/auth', authRoutes);
        console.log('[Setup] Autentifikasiya routeları (/api/auth) tətbiq edildi.');

        // Kök URL üçün yönləndirmə
        app.get('/', (req, res) => {
            // Artıq giriş səhifəsi statik olaraq təqdim edildiyi üçün,
            // bəlkə də bu yönləndirməyə ehtiyac yoxdur və ya ana səhifəyə yönləndirmək olar.
            // Hələlik saxlayaq:
            res.redirect('/ana_sehife/login/login.html');
        });
        // Qorunan HTML səhifələri üçün routelar artıq lazım deyil,
        // çünki express.static onları təqdim edir və client tərəf check-auth ilə qorumalıdır.

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
            // İlkin otaq siyahısını yayımlamaq üçün broadcastRoomListRedis çağırılmalıdır.
            // Bunu initializeSocketIO içində və ya burada etmək olar.
            // initializeSocketIO-da onsuz da yeni qoşulana göndərilir, ona görə burada etməyək.
        });

        server.on('error', (error) => {
            console.error(`[Server Start ERROR] server.listen XƏTASI: Port ${PORT} problemi!`, error);
            if (error.code === 'EADDRINUSE') { console.error(`XƏTA: Port ${PORT} artıq istifadə olunur.`); }
            gracefulShutdown('Listen Error'); // Xəta olsa səliqəli bağlamağa çalış
        });

    } catch (err) {
        console.error('❌❌❌ Server işə salınarkən KRİTİK XƏTA (Redis, DB və ya başqa):', err);
        process.exit(1); // Kritik xəta zamanı çıxış et
    }
}

// --- Səliqəli Dayandırma ---
async function gracefulShutdown(signal) {
    console.warn(`\n[Shutdown] ${signal} siqnalı alındı. Server bağlanır...`);
    try {
        await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
        console.log('[Shutdown] HTTP server bağlandı.');
        await new Promise((resolve) => io.close(() => resolve()));
        console.log('[Shutdown] Socket.IO bağlandı.');
        await Promise.all([ pubClient.quit().catch(e=>e), subClient.quit().catch(e=>e) ]);
        console.log('[Shutdown] Redis klientləri bağlandı.');
        await pool.end();
        console.log('[Shutdown] DB pool bağlandı.');
        console.warn(`[Shutdown] Server dayandırıldı (${signal}).`);
        process.exit(0);
    } catch (err) {
        console.error("[Shutdown ERROR]:", err);
        process.exit(1);
    } finally {
        setTimeout(() => { console.error('[Shutdown] Timeout! Məcburi çıxış.'); process.exit(1); }, 10000).unref();
    }
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error, origin) => { console.error('[FATAL ERROR] Uncaught Exception:', error, 'Origin:', origin); gracefulShutdown('uncaughtException'); });
process.on('unhandledRejection', (reason, promise) => { console.error('[FATAL ERROR] Unhandled Rejection at:', promise, 'reason:', reason); gracefulShutdown('unhandledRejection'); });

// --- Serveri İşə Sal ---
startServer();

console.log('--- server.js faylının sonu ---');