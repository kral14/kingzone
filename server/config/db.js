// server/config/db.js
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL mühit dəyişəni tapılmadı!');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
    // Production üçün lazım olarsa SSL konfiqurasiyası əlavə edilə bilər
    // ssl: { rejectUnauthorized: false }
});

async function testDBConnection() {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log(`---- [DB Check OK] Verilənlər bazasına uğurla qoşuldu: ${new Date(result.rows[0].now).toISOString()} ----`);
    } catch (err) {
        console.error('[FATAL ERROR] Verilənlər bazasına qoşulma xətası!', err.stack);
        // Burada process.exit(1) etməyək, bunu əsas server faylı idarə etsin
        throw err; // Xətanı yuxarı ötürək
    } finally {
        if (client) client.release();
    }
}

module.exports = { pool, testDBConnection }; // Pool və test funksiyasını export edirik