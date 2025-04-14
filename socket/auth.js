// server/socket/auth.js
const { pubClient } = require('../config/redis'); // Redis klientini alırıq
const { getUserInfoKey } = require('../utils/redisHelpers'); // Yardımçı funksiyanı alırıq

// Socket.IO bağlantıları üçün Autentifikasiya Middleware-i
// Bu middleware hər yeni socket bağlantısı cəhdində işləyir
const socketAuthMiddleware = async (socket, next) => {
    const session = socket.request.session; // Express sessiyasını əldə edirik

    // Sessiya və içində user məlumatları varmı?
    if (session?.user?.id && session.user.nickname) {
        const userInfo = {
            userId: session.user.id,
            username: session.user.nickname
        };
        const userInfoKey = getUserInfoKey(socket.id);
        try {
            // User məlumatlarını qısa müddətlik Redis-də saxlayaq (disconnect üçün faydalı ola bilər)
            await pubClient.hSet(userInfoKey, {
                userId: userInfo.userId.toString(),
                username: userInfo.username
            });
            await pubClient.expire(userInfoKey, 60 * 60 * 1); // 1 saatlıq expire

            // User məlumatlarını socket obyektinə də əlavə edək ki, disconnect anında əlçatan olsun
            socket.conn.request.userInfoFromAuth = userInfo; // Bu, disconnect handler-də istifadə olunacaq

            // console.log(`[Socket Auth OK] User info stored for ${socket.id}`);
            next(); // Autentifikasiya uğurlu, bağlantıya icazə ver
        } catch (err) {
            console.error(`[Socket Auth ERROR] Redis user info yazılarkən xəta (Socket: ${socket.id}):`, err);
            next(new Error('Server xətası: Sessiya məlumatları saxlanılmadı.')); // Xəta ilə rədd et
        }
    } else {
        // Sessiya yoxdursa və ya user məlumatı natamamdısa
        console.warn(`[Socket Auth FAILED] Bağlantı rədd edildi (Sessiya tapılmadı/etibarsız). Socket ID: ${socket.id}`);
        next(new Error('Authentication Error: Giriş edilməyib və ya sessiya bitib.')); // Xəta ilə rədd et
    }
};

module.exports = socketAuthMiddleware;