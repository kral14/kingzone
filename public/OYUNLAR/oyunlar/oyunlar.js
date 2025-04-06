// public/OYUNLAR/oyunlar/oyunlar.js (v3 - Session Auth ilə)

document.addEventListener('DOMContentLoaded', async () => { // async etdik
    console.log("Oyunlar JS (v3 - Session Auth) Başladı.");

    const welcomePlayerSpan = document.getElementById('welcome-player');
    const userInfoContainer = document.getElementById('user-info');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const logoutBtn = document.getElementById('logout-btn');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const editProfileModal = document.getElementById('edit-profile-modal');
    const closeEditModalBtn = document.getElementById('close-edit-modal');
    const editProfileForm = document.getElementById('edit-profile-form');
    const saveProfileButton = document.getElementById('save-profile-button');
    const editProfileMessage = document.getElementById('edit-profile-message');
    const gamesGrid = document.getElementById('games-grid'); // Oyun kartları konteyneri

    // Elementləri yoxlayaq
    if (!welcomePlayerSpan || !userInfoContainer || !userMenuDropdown || !logoutBtn || !editProfileBtn || !editProfileModal || !closeEditModalBtn || !editProfileForm || !saveProfileButton || !editProfileMessage || !gamesGrid) {
        console.error("Oyunlar səhifəsində lazımi elementlərdən biri tapılmadı!");
        // Yönləndirməni checkAuth funksiyası edəcək
        // window.location.href = '../../ANA SEHIFE/login/login.html';
        return;
    }

    let currentUser = null; // Giriş etmiş istifadəçi məlumatlarını saxlamaq üçün

    // 1. Giriş Vəziyyətini Yoxlamaq (Serverdən)
    async function checkAuth() {
        try {
            const response = await fetch('/check-auth'); // Backend-dəki endpoint
            const data = await response.json();

            if (response.ok && data.loggedIn && data.user) {
                console.log("İstifadəçi giriş edib:", data.user);
                currentUser = data.user; // İstifadəçi məlumatlarını saxla
                welcomePlayerSpan.textContent = `Xoş gəldin, ${currentUser.nickname}!`;
                // Oyun kartlarına linkləri düzəlt (nickname əlavə et)
                updateGameLinks(currentUser.nickname);
                return true; // Giriş edilib
            } else {
                console.log("İstifadəçi giriş etməyib.");
                window.location.href = '../../ANA SEHIFE/login/login.html'; // Girişə yönləndir
                return false; // Giriş edilməyib
            }
        } catch (error) {
            console.error("Auth yoxlama xətası:", error);
            // Bəlkə serverə qoşulma xətasıdır, girişə yönləndirək
            window.location.href = '../../ANA SEHIFE/login/login.html';
            return false;
        }
    }

    // Oyun kartlarına düzgün playerName parametrini əlavə edən funksiya
    function updateGameLinks(nickname) {
         const gameCardLinks = gamesGrid.querySelectorAll('.game-card-link');
         gameCardLinks.forEach(link => {
             const originalHref = link.getAttribute('href');
             // Əvvəlki playerName parametrini silək (əgər varsa)
             const url = new URL(originalHref, window.location.origin);
             url.searchParams.delete('playerName');
             // Yenisini əlavə edək
             url.searchParams.set('playerName', nickname);
             link.setAttribute('href', url.pathname + url.search);

             // Köhnə click listenerları silib yenisini əlavə etməyə ehtiyac yoxdur,
             // çünki linkin özü artıq düzgün parametri daşıyır.
             // Amma əgər əvvəlki listener qalıbsa, onu silmək yaxşıdır.
             // link.removeEventListener('click', handleGameLinkClick); // Əgər belə bir listener var idisə
         });
    }

    // Səhifə yüklənəndə autentifikasiyanı yoxla
    const isLoggedIn = await checkAuth();

    // Əgər giriş edilməyibsə, qalan kod işləməsin (checkAuth artıq yönləndirib)
    if (!isLoggedIn) return;

    // ----- Giriş Edilmiş İstifadəçi Üçün Hadisə Dinləyiciləri -----

    // 2. Çıxış Düyməsi
    logoutBtn.addEventListener('click', async () => {
        console.log("Çıxış edilir...");
        try {
            const response = await fetch('/logout', { method: 'POST' });
            if (response.ok) {
                window.location.href = '../../ANA SEHIFE/login/login.html';
            } else {
                alert("Çıxış zamanı xəta baş verdi.");
            }
        } catch (error) {
            console.error("Logout fetch xətası:", error);
            alert("Serverlə əlaqə xətası.");
        }
    });

    // 3. Profil Düzəliş Modalı Açmaq
    editProfileBtn.addEventListener('click', async () => {
        console.log("Profil düzəliş modalı açılır...");
        editProfileMessage.textContent = ''; // Köhnə mesajı təmizlə
        editProfileMessage.style.color = '#ff4d4d'; // Standard xəta rəngi

        if (!currentUser) { // currentUser checkAuth-dan sonra dolu olmalıdır
             alert("İstifadəçi məlumatları tapılmadı. Zəhmət olmasa səhifəni yeniləyin.");
             return;
        }

        // Hazırkı istifadəçi məlumatlarını (artıq currentUser obyektində var) forma dolduraq
        // Serverdən yenidən çəkməyə ehtiyac yoxdur, amma istəsəniz GET /profile/:nickname yenə istifadə edə bilərsiniz
        try {
            document.getElementById('edit-current-nickname').value = currentUser.nickname;
            document.getElementById('edit-fullName').value = currentUser.fullName || ''; // Əgər sessionda saxlanıbsa
            // Emaili almaq üçün serverə sorğu göndərmək lazım gələ bilər, çünki sessionda saxlamadıq
            // Və ya sessiona əlavə edə bilərik
            // Hələlik boş qalsın və ya serverdən çəkilsin
             const profileResponse = await fetch(`/profile/${encodeURIComponent(currentUser.nickname)}`);
             if (!profileResponse.ok) throw new Error('Profil datası alınamadı');
             const profileData = await profileResponse.json();
             document.getElementById('edit-email').value = profileData.email || '';

            document.getElementById('edit-nickname').value = currentUser.nickname || '';
            document.getElementById('edit-password').value = '';
            document.getElementById('edit-confirmPassword').value = '';

            editProfileModal.style.display = 'block';

        } catch (error) {
             console.error("Profil modalını açarkən xəta:", error);
             alert("Profil məlumatları yüklənərkən xəta baş verdi.");
        }
    });

    // 4. Profil Düzəliş Modalı Bağlamaq
    closeEditModalBtn.addEventListener('click', () => { editProfileModal.style.display = 'none'; });
    window.addEventListener('click', (event) => { if (event.target == editProfileModal) { editProfileModal.style.display = "none"; } });

    // 5. Profil Düzəliş Formunu Göndərmək
    editProfileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        editProfileMessage.textContent = ''; editProfileMessage.style.color = '#ff4d4d';
        saveProfileButton.disabled = true;

        const currentNickname = document.getElementById('edit-current-nickname').value; // Hansı user-i dəyişirik
        const fullName = document.getElementById('edit-fullName').value.trim();
        const email = document.getElementById('edit-email').value.trim();
        const nickname = document.getElementById('edit-nickname').value.trim();
        const password = document.getElementById('edit-password').value;
        const confirmPassword = document.getElementById('edit-confirmPassword').value;

        // Client-side validasiya (əvvəlki kimi)
        if (!fullName || !email || !nickname) { editProfileMessage.textContent = 'Ad Soyad, E-poçt və Nickname boş ola bilməz.'; saveProfileButton.disabled = false; return; }
         if (/\s/.test(nickname)) { editProfileMessage.textContent = 'Nickname boşluq ehtiva edə bilməz.'; saveProfileButton.disabled = false; return; }
         if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { editProfileMessage.textContent = 'Düzgün e-poçt ünvanı daxil edin.'; saveProfileButton.disabled = false; return; }

        let passwordData = undefined;
        if (password || confirmPassword) {
            if (password !== confirmPassword) { editProfileMessage.textContent = 'Yeni şifrələr eyni deyil.'; saveProfileButton.disabled = false; return; }
            if (password.length < 6) { editProfileMessage.textContent = 'Yeni şifrə minimum 6 simvol olmalıdır.'; saveProfileButton.disabled = false; return; }
            passwordData = password;
        }

        try {
            const response = await fetch(`/profile/${encodeURIComponent(currentNickname)}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json', },
                 body: JSON.stringify({ fullName, email, nickname, password: passwordData }),
             });

            const result = await response.json();

            if (response.ok) {
                 editProfileMessage.style.color = '#39ff14';
                 editProfileMessage.textContent = result.message + ' Səhifə yenilənir...';
                 // currentUser obyektini yeniləyək (əgər lazımdırsa)
                 currentUser = result.updatedUser || currentUser;
                 welcomePlayerSpan.textContent = `Xoş gəldin, ${currentUser.nickname}!`; // Üst hissəni yenilə
                 updateGameLinks(currentUser.nickname); // Linkləri yenilə

                 setTimeout(() => {
                     editProfileModal.style.display = 'none';
                     // window.location.reload(); // Səhifəni yeniləməyə bilərik, çünki artıq UI yeniləndi
                 }, 1500);
                 saveProfileButton.disabled = false; // Proses bitdi

            } else {
                 editProfileMessage.textContent = result.message || 'Profil yenilənərkən xəta baş verdi.';
                 saveProfileButton.disabled = false;
            }
        } catch(error) {
             console.error('Profil yeniləmə fetch xətası:', error);
             editProfileMessage.textContent = 'Serverlə əlaqə qurmaq mümkün olmadı.';
             saveProfileButton.disabled = false;
        }
    });

}); // DOMContentLoaded Sonu