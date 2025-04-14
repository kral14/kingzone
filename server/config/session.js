// server/config/session.js
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./db'); // DB konfiqurasiyasından pool-u import edirik

if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET mühit dəyişəni tapılmadı!');
}

const sessionMiddleware = session({
    store: new pgSession({
        pool: pool,                // Import edilmiş pool
        tableName: 'user_sessions',
        pruneSessionInterval: 60 * 15 // 15 dəqiqədə bir köhnə sessiyaları təmizlə (saniyə)
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

module.exports = sessionMiddleware; // Hazır middleware-i export edirik