// server/middleware/isAuthenticated.js

// Bu middleware funksiyası bir yolun (route) yalnız giriş etmiş (autentifikasiyadan keçmiş)
// istifadəçilər tərəfindən əlçatan olmasını təmin edir.
const isAuthenticated = (req, res, next) => {
    // Sessiyada user obyekti və onun id-si varsa, istifadəçi giriş edib
    if (req.session?.user?.id) {
        return next(); // Növbəti addıma keçməyə icazə ver
    }

    // Əgər giriş edilməyibsə
    console.warn(`[Auth Check FAILED] HTTP - Giriş tələb olunur. Path: ${req.originalUrl}`);

    // API sorğusu olduğu üçün 401 statusu ilə JSON cavabı qaytarırıq
    // (Client tərəf bu statusa görə yönləndirmə edə bilər)
    return res.status(401).json({ loggedIn: false, message: 'Bu əməliyyat üçün giriş tələb olunur.' });
};

module.exports = isAuthenticated; // Funksiyanı export edirik