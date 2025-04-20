// socket/auth.js

const sessionMiddleware = require('../server/config/session');
// socket/auth.js
const { pubClient } = require('../server/config/redis');
const { getUserInfoKey } = require('../utils/redisHelpers');


const AUTH_LOG = '[Socket Auth]';

const socketAuthMiddleware = (socket, next) => {
    // >> AUTH DEBUG: Middleware Başladı <<
    console.log(`\n>> ${AUTH_LOG} Middleware BAŞLADI. Socket ID: ${socket.id}`);
    // -----
    sessionMiddleware(socket.request, {}, async (err) => {
         // >> AUTH DEBUG: Sessiya middleware bitdi <<
         console.log(`   ${AUTH_LOG} Session middleware bitdi. Xəta var? ${!!err}`);
         // -----
        if (err) {
             console.error(`${AUTH_LOG} Session middleware xətası:`, err);
             return next(new Error('Sessiya xətası.'));
        }

        const session = socket.request.session;
         // >> AUTH DEBUG: Sessiya obyekti alındı <<
         console.log(`   ${AUTH_LOG} Session ID: ${session?.id}. User var? ${!!session?.user}`);
         // -----

        if (!session || !session.user || !session.user.id || !session.user.nickname) {
             console.warn(`${AUTH_LOG} Sessiyada etibarlı istifadəçi tapılmadı. Socket: ${socket.id}`);
             return next(new Error('Autentifikasiya olunmayıb.'));
        }

        const userInfo = {
            userId: session.user.id,
            username: session.user.nickname,
            // Profil şəklini və digər məlumatları da əlavə edə bilərik, amma auth üçün bunlar kifayətdir
        };

         // >> AUTH DEBUG: User info formalaşdırıldı <<
         console.log(`   ${AUTH_LOG} User info formalaşdırıldı:`, userInfo);
         // -----

        // --- User məlumatını qısa müddətlik Redis-də saxlamaq (Optional, amma debug üçün faydalı) ---
        const redisUserInfoKey = getUserInfoKey(userInfo.userId);
        try {
             // >> AUTH DEBUG: User info Redis-ə yazılır <<
             console.log(`   ${AUTH_LOG} User info Redis-ə yazılır... Key: ${redisUserInfoKey}`);
             // -----
             await pubClient.set(redisUserInfoKey, JSON.stringify(userInfo), { EX: 300 }); // 5 dəqiqəlik expire
             console.log(`   ${AUTH_LOG} User info Redis-ə yazıldı (EX: 300s).`);
        } catch(redisErr) {
            console.error(`${AUTH_LOG} User info Redis-ə yazılarkən xəta:`, redisErr);
            // Bu kritik xəta olmamalıdır, davam edək
        }
        // --- Redis saxlama sonu ---

        // İstifadəçi məlumatlarını socket bağlantısının request obyektinə əlavə edirik ki,
        // sonrakı handlerlərdə (məsələn, index.js-də) istifadə edə bilək.
        socket.conn.request.userInfoFromAuth = userInfo;
         // >> AUTH DEBUG: User info socket request-ə əlavə edildi <<
         console.log(`   ${AUTH_LOG} User info socket.conn.request-ə əlavə edildi.`);
         // -----

         // >> AUTH DEBUG: next() çağırılır <<
         console.log(`   ${AUTH_LOG} Hər şey qaydasındadır, next() çağırılır...`);
         // -----
        next(); // Autentifikasiya uğurludur, növbəti middleware-ə və ya connection handler-ə keç
    });
};

module.exports = socketAuthMiddleware;