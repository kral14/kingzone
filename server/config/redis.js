// server/config/redis.js
const { createClient } = require('redis'); // CommonJS require istifadə edirik

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`[Redis] Bağlantı URL: ${redisUrl}`);

// --- Clientlərin Yaradılması ---
// Əsas client (əsasən adi əmrlər və PUBLISH üçün)
const pubClient = createClient({
    url: redisUrl
    // Əgər lazım olarsa, əlavə seçimlər:
    // database: 0,
    // password: 'your_redis_password'
});

// Kopyalanmış client (əsasən SUBSCRIBE üçün)
// Bu, əgər pubClient bloklayan bir əmr (məsələn, BRPOP) işlədirsə,
// subClient-in abunəlikləri dinləməyə davam etməsi üçün faydalıdır.
const subClient = pubClient.duplicate();

console.log('[Redis] pubClient və subClient yaradıldı.');

// --- Hadisə Dinləyiciləri (Event Listeners) ---
// Hər iki client üçün eyni dinləyiciləri quraşdıran köməkçi funksiya
function setupClientListeners(clientName, client) {
    // Xəta baş verdikdə
    client.on('error', (err) => console.error(`❌ [Redis XƏTA] ${clientName}:`, err));
    // Qoşulmağa başlayanda (hələ hazır deyil)
    client.on('connect', () => console.log(`🔌 [Redis QOŞULUR] ${clientName} qoşulma prosesinə başladı...`));
    // Qoşulub hazır olduqda
    client.on('ready', () => console.log(`✅ [Redis HAZIR] ${clientName} qoşuldu və əmrlər üçün hazırdır.`));
    // Yenidən qoşulmağa cəhd etdikdə
    client.on('reconnecting', () => console.warn(`⏳ [Redis YENİDƏN QOŞULUR] ${clientName} bağlantı kəsildi, yenidən qoşulmağa çalışır...`));
    // Bağlantı tam kəsildikdə (yenidən qoşulmayacaq)
    client.on('end', () => console.log(`🚫 [Redis BAĞLANDI] ${clientName} bağlantısı kəsildi.`));
}

console.log('[Redis] pubClient və subClient üçün hadisə dinləyiciləri quraşdırılır...');
setupClientListeners('PubClient', pubClient);
setupClientListeners('SubClient', subClient);

// --- Qoşulma Funksiyası ---
// Bu funksiya server.js faylında server işə düşməzdən ƏVVƏL çağırılmalıdır.
// Bu, hər iki client-in .connect() metodunu çağırır.
const connectRedisClients = async () => {
    console.log('[Redis] pubClient.connect() və subClient.connect() çağırılır...');
    try {
        // Hər iki client-i paralel olaraq qoşmağa çalışırıq
        await Promise.all([
            pubClient.connect(),
            subClient.connect()
        ]);
        // Promise.all bitibsə, hər iki .connect() uğurla tamamlanıb (və ya xəta verib)
        console.log('✅ [Redis] Hər iki client üçün .connect() uğurla tamamlandı.');
        // Əmin olmaq üçün 'ready' statusunu gözləmək də olar, amma adətən .connect() kifayətdir.
    } catch (err) {
        console.error('❌❌ [Redis KRİTİK XƏTA] Client qoşulması zamanı xəta:', err);
        // Qoşulma mümkün olmadıqda proqramı dayandırmaq məsləhətdir
        // process.exit(1);
        throw err; // Xətanı yuxarı ötürürük ki, server.js xəbərdar olsun
    }
};

// --- Exportlar ---
// Hər iki client-i və qoşulma funksiyasını export edirik
module.exports = {
    pubClient, // Adi əmrlər və publish üçün istifadə edin
    subClient, // Subscribe üçün istifadə edin
    connectRedisClients // Server başladılarkən bunu çağırın
};

console.log('[Redis] redis.js faylının konfiqurasiyası tamamlandı.');