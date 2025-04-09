// public/OYUNLAR/oyunlar/oyunlar.js (v4 - Auth Check Delay, Logout, Profil Edit ilə Tam Kod)

document.addEventListener('DOMContentLoaded', () => { // async burdan silinir, setTimeout içinə keçir
    console.log("Oyunlar JS (v4 - Delay Fix) Başladı.");

    // --- DOM Elementləri ---
    const welcomePlayerSpan = document.getElementById('welcome-player');
    const logoutBtn = document.getElementById('logout-btn');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const editProfileModal = document.getElementById('edit-profile-modal');
    const closeEditModalBtn = document.getElementById('close-edit-modal');
    const editProfileForm = document.getElementById('edit-profile-form');
    const editFullNameInput = document.getElementById('edit-fullName');
    const editEmailInput = document.getElementById('edit-email');
    const editNicknameInput = document.getElementById('edit-nickname');
    const editPasswordInput = document.getElementById('edit-password');
    const editConfirmPasswordInput = document.getElementById('edit-confirmPassword');
    const editProfileMessage = document.getElementById('edit-profile-message');
    const saveProfileButton = document.getElementById('save-profile-button');
    const currentNicknameInput = document.getElementById('edit-current-nickname');

    let loggedInUser = null;

    // --- Yardımçı Funksiyalar ---
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'error') => {
        if (!el) return;
        el.textContent = msg;
        el.style.color = type === 'success' ? '#39ff14' : '#ff4d4d';
        el.style.backgroundColor = type === 'success' ? 'rgba(57, 255, 20, 0.15)' : 'rgba(255, 77, 77, 0.15)';
        el.style.borderColor = type === 'success' ? 'rgba(57, 255, 20, 0.5)' : 'rgba(255, 77, 77, 0.5)';
        // Mesajın görünməsi üçün stil əlavə edək (əgər CSS-də yoxdursa)
        el.style.padding = '8px 12px';
        el.style.marginTop = '15px';
        el.style.borderRadius = '5px';
        el.style.borderWidth = '1px';
        el.style.borderStyle = 'solid';
        el.style.minHeight = '1.3em';
    };
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return String(unsafe);
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // ===== AUTENTİFİKASİYA YOXLAMASI (GECİKMƏ İLƏ) =====
    // Brauzerə yeni cookie-ni emal etmək üçün kiçik bir vaxt veririk
    setTimeout(async () => { // <<<--- setTimeout BAŞLANĞICI
        try {
            console.log("Oyunlar səhifəsi: /check-auth sorğusu göndərilir (gecikmə ilə)...");
            const response = await fetch('/check-auth', {
                method: 'GET',
                credentials: 'include' // Cookie göndərilir
            });
            const data = await response.json();

            if (!response.ok || !data.loggedIn) {
                console.log("Oyunlar JS: Giriş edilməyib (check-auth), login səhifəsinə yönləndirilir...");
                window.location.href = '/ANA SEHIFE/login/login.html'; // Başdakı ../../ silindi, / əlavə edildi
                return;
            }

            // Giriş edilib
            loggedInUser = data.user;
            console.log(`Oyunlar JS: Giriş edilib: ${loggedInUser.nickname}`);

            // UI elementlərini və Listenerları quraşdır
            setupUIAndListeners();

        } catch (error) {
            console.error("Oyunlar JS: Auth yoxlama xətası:", error);
            alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
            window.location.href = '/ANA SEHIFE/login/login.html';
        }
    }, 500); // <<<--- 500 millisaniyə (yarım saniyə) gözləmə müddəti
    // =====================================================

    // --- UI və Olay Dinləyicilərini Quraşdırma Funksiyası ---
    function setupUIAndListeners() {
        if (!loggedInUser) return; // Ehtiyat üçün yoxlama

        // Xoş gəldin mesajı
        if (welcomePlayerSpan) {
            welcomePlayerSpan.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUser.nickname)}</strong>!`;
        }

        // Listenerlar
        if (logoutBtn) {
            logoutBtn.removeEventListener('click', handleLogout); // Köhnə listenerı sil (əgər varsa)
            logoutBtn.addEventListener('click', handleLogout);
        } else { console.error("Logout düyməsi tapılmadı!"); }

        if (editProfileBtn && editProfileModal) {
            editProfileBtn.removeEventListener('click', openProfileModal); // Köhnə listenerı sil
            editProfileBtn.addEventListener('click', openProfileModal);
        } else { console.error("Profil düyməsi və ya modalı tapılmadı!"); }

        if (closeEditModalBtn) {
            closeEditModalBtn.removeEventListener('click', closeProfileModal); // Köhnə listenerı sil
            closeEditModalBtn.addEventListener('click', closeProfileModal);
        }

        if (editProfileForm) {
            editProfileForm.removeEventListener('submit', handleProfileUpdate); // Köhnə listenerı sil
            editProfileForm.addEventListener('submit', handleProfileUpdate);
        } else { console.error("Profil formu tapılmadı!"); }

        // Modal xaricinə klikləmə (bu listener təkrar əlavə olunmamalıdır)
        // Bunu ya bir dəfə əlavə edin, ya da əmin olun ki, təkrar olunmur.
        // window.addEventListener('click', (event) => { ... });

        console.log("Oyunlar JS UI və Listenerlar quraşdırıldı.");
    }


    // --- Olay Dinləyici Funksiyaları ---

    async function handleLogout() {
        console.log("Çıxış edilir...");
        try {
            const response = await fetch('/logout', { method: 'POST', credentials: 'include' });
            const result = await response.json();
            if (response.ok) {
                console.log("Uğurla çıxış edildi."); window.location.href = '../../ANA SEHIFE/login/login.html';
            } else { console.error("Çıxış xətası:", result.message); alert(`Çıxış zamanı xəta: ${result.message || 'Naməlum xəta'}`); }
        } catch (error) { console.error("Çıxış fetch xətası:", error); alert("Serverlə əlaqə qurmaq mümkün olmadı."); }
    }

    function openProfileModal() {
        if (!loggedInUser) return;
        console.log("Profil modalı açılır...");
        if(editFullNameInput) editFullNameInput.value = loggedInUser.fullName || '';
        if(editEmailInput) editEmailInput.value = loggedInUser.email || '';
        if(editNicknameInput) editNicknameInput.value = loggedInUser.nickname || '';
        if(editPasswordInput) editPasswordInput.value = '';
        if(editConfirmPasswordInput) editConfirmPasswordInput.value = '';
        if(editProfileMessage) { editProfileMessage.textContent = ''; editProfileMessage.removeAttribute('style'); } // Stili də təmizlə
        if(currentNicknameInput) currentNicknameInput.value = loggedInUser.nickname;
        showModal(editProfileModal);
    }

    function closeProfileModal() { hideModal(editProfileModal); }

    async function handleProfileUpdate(event) {
        event.preventDefault();
        if (!loggedInUser || !editProfileForm || !saveProfileButton) return;

        const currentNickname = loggedInUser.nickname;
        const password = editPasswordInput.value;
        const confirmPassword = editConfirmPasswordInput.value;

        // Validasiya
        if (password !== confirmPassword) { showMsg(editProfileMessage, 'Yeni şifrələr eyni deyil.'); return; }
        if (password && password.length < 6) { showMsg(editProfileMessage, 'Yeni şifrə min. 6 simvol olmalıdır.'); return; }
        const newNickname = editNicknameInput.value.trim();
        const email = editEmailInput.value.trim();
        const fullName = editFullNameInput.value.trim();
        if (!fullName || !email || !newNickname) { showMsg(editProfileMessage, 'Ad Soyad, Email və Nickname boş ola bilməz.'); return; }
        if (/\s/.test(newNickname)) { showMsg(editProfileMessage, 'Nickname boşluq ehtiva edə bilməz.'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMsg(editProfileMessage, 'Düzgün e-poçt ünvanı daxil edin.'); return; }

        saveProfileButton.disabled = true;
        showMsg(editProfileMessage, 'Yenilənir...', 'info');

        const formData = { fullName, email, nickname: newNickname, password: password || undefined };

        try {
            const response = await fetch(`/profile/${currentNickname}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, credentials: 'include', body: JSON.stringify(formData) });
            const result = await response.json();
            if (response.ok) {
                showMsg(editProfileMessage, result.message || 'Profil uğurla yeniləndi!', 'success');
                loggedInUser = result.updatedUser || loggedInUser; // Lokal user datasını yenilə
                if (welcomePlayerSpan) { welcomePlayerSpan.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUser.nickname)}</strong>!`; }
                setTimeout(closeProfileModal, 1500);
            } else { showMsg(editProfileMessage, result.message || 'Profil yenilənərkən xəta.', 'error'); }
        } catch (error) { console.error('Profil yeniləmə fetch xətası:', error); showMsg(editProfileMessage, 'Serverlə əlaqə mümkün olmadı.', 'error');
        } finally { saveProfileButton.disabled = false; }
    }

     // Modal xaricinə klikləmə listenerı (bir dəfə əlavə olunur)
     window.addEventListener('click', (event) => {
         if (event.target == editProfileModal) { closeProfileModal(); }
     });

    console.log("Oyunlar JS ilkin quraşdırma bitdi.");

}); // DOMContentLoaded Sonu