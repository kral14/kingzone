// server/config/redis.js
const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`[Setup] Redis üçün qoşulur: ${redisUrl}`);

const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

// Xəta və qoşulma mesajları üçün listener-lar
pubClient.on('error', (err) => console.error('[Redis ERROR] Pub Client Error:', err));
subClient.on('error', (err) => console.error('[Redis ERROR] Sub Client Error:', err));
pubClient.on('connect', () => console.log('[Redis OK] Pub Client qoşuldu.'));
subClient.on('connect', () => console.log('[Redis OK] Sub Client qoşuldu.'));
// 'ready' hadisələrini əsas server faylında idarə edəcəyik

module.exports = { pubClient, subClient }; // Klientləri export edirik
