// server/controllers/auth.controller.js
const bcrypt = require('bcrypt');
const { pool } = require('../config/db'); // DB pool-u config-dən alırıq
const saltRounds = 10; // Sabiti burada da təyin edə bilərik və ya config-dən ala bilərik

// Qeydiyyat Məntiqi
exports.registerUser = async (req, res) => {
    const { fullName, email, nickname, password } = req.body;
    if (!fullName || !email || !nickname || !password || password.length < 6 || nickname.length < 3 || /\s/.test(nickname)) { return res.status(400).json({ success: false, message: 'Form məlumatları natamam və ya yanlışdır (nickname min 3 hərf, boşluqsuz; şifrə min 6 hərf).' }); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return res.status(400).json({ success: false, message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
    try {
        const checkUser = await pool.query('SELECT email, nickname FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2) LIMIT 1', [email, nickname]);
        if (checkUser.rows.length > 0) {
            const existing = checkUser.rows[0];
            let message = (existing.email.toLowerCase() === email.toLowerCase() && existing.nickname.toLowerCase() === nickname.toLowerCase()) ? 'Bu email və nickname artıq istifadə olunur.' : (existing.email.toLowerCase() === email.toLowerCase() ? 'Bu email artıq istifadə olunur.' : 'Bu nickname artıq istifadə olunur.');
            return res.status(409).json({ success: false, message: message });
        }
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUserQuery = `INSERT INTO users (full_name, email, nickname, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nickname`;
        const newUser = await pool.query(newUserQuery, [fullName, email, nickname, hashedPassword]);
        console.log(`[Register OK] İstifadəçi qeydiyyatdan keçdi: ${newUser.rows[0].nickname} (ID: ${newUser.rows[0].id})`);
        res.status(201).json({ success: true, message: 'Qeydiyyat uğurlu oldu!', nickname: newUser.rows[0].nickname });
    } catch (error) { console.error('[Register ERROR] Qeydiyyat zamanı DB xətası:', error); res.status(500).json({ success: false, message: 'Server xətası baş verdi.' }); }
};

// Giriş Məntiqi
exports.loginUser = async (req, res) => {
    const { nickname, password } = req.body;
    if (!nickname || !password) { return res.status(400).json({ success: false, message: 'Nickname və şifrə daxil edilməlidir.' }); }
    try {
        const result = await pool.query('SELECT * FROM users WHERE LOWER(nickname) = LOWER($1)', [nickname]);
        if (result.rows.length === 0) { return res.status(401).json({ success: false, message: 'Nickname və ya şifrə yanlışdır.' }); }
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            req.session.user = { id: user.id, nickname: user.nickname, fullName: user.full_name, email: user.email };
            console.log(`[Login OK] İstifadəçi giriş etdi: ${user.nickname} (ID: ${user.id}), Session ID: ${req.session.id}`);
            res.status(200).json({ success: true, message: 'Giriş uğurludur!', nickname: user.nickname });
        } else { console.log(`[Login FAIL] Parol səhvdir: ${user.nickname}`); res.status(401).json({ success: false, message: 'Nickname və ya şifrə yanlışdır.' }); }
    } catch (error) { console.error('[Login ERROR] Giriş zamanı xəta:', error); res.status(500).json({ success: false, message: 'Server xətası baş verdi.' }); }
};

// Çıxış Məntiqi
exports.logoutUser = (req, res) => {
    const userNickname = req.session?.user?.nickname || 'Bilinməyən';
    console.log(`[/logout] Çıxış sorğusu alındı: User=${userNickname}`);
    req.session.destroy(err => {
        if (err) { console.error('[/logout ERROR] Sessiya məhv edilərkən xəta:', err); return res.status(500).json({ success: false, message: 'Çıxış zamanı server xətası.' }); }
        res.clearCookie('connect.sid'); console.log(`[/logout OK] Sessiya məhv edildi: User=${userNickname}`);
        res.status(200).json({ success: true, message: 'Uğurla çıxış edildi.' });
    });
};

// Auth Yoxlama Məntiqi
exports.checkAuthStatus = (req, res) => {
    if (req.session?.user?.id) { res.status(200).json({ loggedIn: true, user: req.session.user }); }
    else { res.status(200).json({ loggedIn: false, user: null }); }
};

// Profil Yeniləmə Məntiqi
exports.updateUserProfile = async (req, res) => {
    const targetNickname = req.params.nickname; const loggedInUserId = req.session.user.id; const loggedInNickname = req.session.user.nickname;
    const { fullName, email, nickname: newNickname, password } = req.body;
    if (targetNickname.toLowerCase() !== loggedInNickname.toLowerCase()) { return res.status(403).json({ success: false, message: 'Yalnız öz profilinizi yeniləyə bilərsiniz.' }); }
    if (!fullName || !email || !newNickname || newNickname.length < 3 || /\s/.test(newNickname)) { return res.status(400).json({ success: false, message: 'Ad Soyad, Email və Nickname boş ola bilməz (nickname min 3 hərf, boşluqsuz).' }); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return res.status(400).json({ success: false, message: 'Düzgün e-poçt ünvanı daxil edin.' }); }
    if (password && password.length < 6) { return res.status(400).json({ success: false, message: 'Yeni şifrə minimum 6 simvol olmalıdır.' }); }
    try {
        const checkConflict = await pool.query('SELECT id FROM users WHERE (LOWER(email) = LOWER($1) OR LOWER(nickname) = LOWER($2)) AND id != $3 LIMIT 1', [email, newNickname, loggedInUserId]);
        if (checkConflict.rows.length > 0) { return res.status(409).json({ success: false, message: 'Bu email və ya nickname artıq başqa istifadəçi tərəfindən istifadə olunur.' }); }
        let updateQuery = 'UPDATE users SET full_name = $1, email = $2, nickname = $3'; const queryParams = [fullName, email, newNickname]; let paramIndex = 4;
        if (password) { const hashedPassword = await bcrypt.hash(password, saltRounds); updateQuery += `, password_hash = $${paramIndex}`; queryParams.push(hashedPassword); paramIndex++; }
        updateQuery += ` WHERE id = $${paramIndex} RETURNING id, nickname, full_name, email`; queryParams.push(loggedInUserId);
        const result = await pool.query(updateQuery, queryParams);
        if (result.rows.length === 0) { return res.status(404).json({ success: false, message: 'Profil yenilənərkən xəta (istifadəçi tapılmadı).' }); }
        const updatedUser = result.rows[0]; console.log(`[/profile UPDATE OK] Profil yeniləndi: ${updatedUser.nickname}`);
        req.session.user = { id: updatedUser.id, nickname: updatedUser.nickname, fullName: updatedUser.full_name, email: updatedUser.email };
        req.session.save((err) => {
            if (err) { console.error('[/profile UPDATE ERROR] Sessiya yadda saxlanılarkən xəta:', err); return res.status(200).json({ success: true, message: 'Profil uğurla yeniləndi! (Sessiya xətası)', updatedUser: req.session.user }); }
            res.status(200).json({ success: true, message: 'Profil uğurla yeniləndi!', updatedUser: req.session.user });
        });
    } catch (error) { console.error('[/profile UPDATE ERROR] Profil yenilənərkən DB xətası:', error); res.status(500).json({ success: false, message: 'Server xətası baş verdi.' }); }
};