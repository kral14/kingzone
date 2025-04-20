// public/OYUNLAR/oyunlar/oyunlar.js (v4 - Düzəlişli + Çıxış Təsdiq/Animasiya/Gecikmə)

document.addEventListener('DOMContentLoaded', () => {
    console.log("Oyunlar JS (v4 - Delay Fix + Logout Enhancement) Başladı.");

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
    const cancelProfileBtn = document.getElementById('cancel-profile-button');
    const editPasswordInput = document.getElementById('edit-password');
    const editConfirmPasswordInput = document.getElementById('edit-confirmPassword');
    const editProfileMessage = document.getElementById('edit-profile-message');
    const saveProfileButton = document.getElementById('save-profile-button');
    const currentNicknameInput = document.getElementById('edit-current-nickname');
    const loadingOverlay = document.getElementById('loading-overlay'); // Animasiya elementi
    let loggedInUser = null;

    // --- Yardımçı Funksiyalar ---
    const showModal = (modal) => { if (modal) modal.style.display = 'flex'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };

    const showMsg = (el, msg, type = 'error') => {
        if (!el) return;
        el.textContent = msg;
        // --- Stil təyin etmək üçün daha etibarlı yol ---
        el.className = 'message'; // Əvvəlki tipləri təmizlə
        el.classList.add(type); // Yeni tipi əlavə et
        // Stil atributlarını birbaşa dəyişmək əvəzinə CSS klasları istifadə etmək daha yaxşıdır
        // Amma əgər CSS-də error/success/info klasları yoxdursa, əvvəlki stil kodları qala bilər.
        // Sadəlik üçün əvvəlki stil kodlarını saxlayıram:
        el.style.color = type === 'success' ? '#39ff14' : (type === 'info' ? '#6aaaff' : '#ff4d4d');
        el.style.backgroundColor = type === 'success' ? 'rgba(57, 255, 20, 0.15)' : (type === 'info' ? 'rgba(74, 144, 226, 0.1)' : 'rgba(255, 77, 77, 0.15)');
        el.style.borderColor = type === 'success' ? 'rgba(57, 255, 20, 0.5)' : (type === 'info' ? 'rgba(74, 144, 226, 0.3)' : 'rgba(255, 77, 77, 0.5)');
        el.style.padding = '8px 12px';
        el.style.marginTop = '15px';
        el.style.borderRadius = '5px';
        el.style.borderWidth = '1px';
        el.style.borderStyle = 'solid';
        el.style.minHeight = '1.3em';
        // ---------------------------------------------
    };
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return String(unsafe);
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // ===== AUTENTİFİKASİYA YOXLAMASI (GECİKMƏ İLƏ) =====
    setTimeout(async () => {
        try {
            console.log("Oyunlar səhifəsi: /check-auth sorğusu göndərilir (gecikmə ilə)...");
            const response = await fetch('/api/auth/check-auth', {
                method: 'GET',
                credentials: 'include'
            });
            // Cavabı JSON kimi almağa çalışaq, xəta olarsa tutaq
            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                console.error("Auth check cavabı JSON deyil:", response.status, response.statusText);
                throw new Error(`Serverdən gözlənilməz cavab alındı (${response.status}).`);
            }

            if (!response.ok || !data.loggedIn || !data.user) { // user obyektini də yoxlayaq
                console.log("Oyunlar JS: Giriş edilməyib (check-auth), login səhifəsinə yönləndirilir...");
                window.location.href = '/ana_sehife/login/login.html';
                return;
            }

            loggedInUser = data.user;
            console.log(`Oyunlar JS: Giriş edilib: ${loggedInUser.nickname}`);
            setupUIAndListeners(); // Listenerları yalnız auth uğurlu olduqdan sonra qoş

        } catch (error) {
            console.error("Oyunlar JS: Auth yoxlama xətası:", error);
            alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
            window.location.href = '/ana_sehife/login/login.html';
        }
    }, 500);
    // =====================================================


   // --- UI və Olay Dinləyicilərini Quraşdırma Funksiyası (TƏK VERSİYA) ---
function setupUIAndListeners() {
    if (!loggedInUser) {
        console.warn("setupUIAndListeners çağırıldı amma loggedInUser yoxdur!");
        return;
    }
    console.log("UI və Listenerlar quraşdırılır (sadə remove/add üsulu)...");

    // --- Xoş gəldin mesajı ---
    if (welcomePlayerSpan) {
        welcomePlayerSpan.innerHTML =
            `Xoş gəldin, <strong>${escapeHtml(loggedInUser.nickname)}</strong>!`;
    } else {
        console.error("welcomePlayerSpan elementi tapılmadı!");
    }

    // --- Logout düyməsinə listener ---
    if (logoutBtn) {
        logoutBtn.removeEventListener('click', handleLogout);
        logoutBtn.addEventListener('click', handleLogout);
        console.log("Logout düyməsinə listener qoşuldu.");
    } else {
        console.error("Logout düyməsi tapılmadı!");
    }

    // --- Profili Düzənlə düyməsinə listener ---
    if (editProfileBtn && editProfileModal) {
        editProfileBtn.removeEventListener('click', openProfileModal);
        editProfileBtn.addEventListener('click', openProfileModal);
        console.log("Profil redaktə düyməsinə listener qoşuldu.");
    } else {
        console.error("Profil redaktə düyməsi (editProfileBtn) və ya modal (editProfileModal) tapılmadı!");
    }

    // --- Ləğv Et düyməsinə listener ---
    if (cancelProfileBtn) {
        cancelProfileBtn.removeEventListener('click', closeProfileModal);
        cancelProfileBtn.addEventListener('click', closeProfileModal);
        console.log("Ləğv Et düyməsinə listener qoşuldu.");
    } else {
        console.error("cancelProfileBtn tapılmadı!");
    }

    // --- Modal-un bağlanması üçün × düyməsinə listener ---
    if (closeEditModalBtn) {
        closeEditModalBtn.removeEventListener('click', closeProfileModal);
        closeEditModalBtn.addEventListener('click', closeProfileModal);
        console.log("× düyməsinə listener qoşuldu.");
    } else {
        console.error("closeEditModalBtn tapılmadı!");
    }

    // --- Profil formunun submit listener-i ---
    if (editProfileForm) {
        editProfileForm.removeEventListener('submit', handleProfileUpdate);
        editProfileForm.addEventListener('submit', handleProfileUpdate);
        console.log("Profil formuna submit listener qoşuldu.");
    } else {
        console.error("Profil formu tapılmadı!");
    }

    console.log("Oyunlar JS UI və Listenerlar quraşdırılması tamamlandı.");
} // setupUIAndListeners funksiyasının sonu

    // --- Olay Dinləyici Funksiyaları ---

    // --- handleLogout funksiyası (Təsdiq + Animasiya + Gecikmə ilə) ---
    async function handleLogout() {
        console.log("Çıxış düyməsi basıldı...");

        if (!confirm("Çıxış etmək istədiyinizə əminsinizmi?")) {
            console.log("Çıxış ləğv edildi.");
            return;
        }
        console.log("Çıxış təsdiqləndi, proses başlayır...");

        if (loadingOverlay) {
            loadingOverlay.classList.add('visible');
            console.log("Animasiya overlay göstərildi.");
        } else {
            console.warn("Mövcud animasiya overlay elementi ('loading-overlay' ID-li?) tapılmadı!");
        }

        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });

            let result;
            try {
                result = await response.json();
            } catch (jsonError) {
                console.error("Çıxış cavabı JSON deyil:", response.status, response.statusText);
                if (loadingOverlay) loadingOverlay.classList.remove('visible');
                alert(`Çıxış zamanı serverdən gözlənilməz cavab alındı (${response.status}).`);
                return;
            }

            if (response.ok) {
                console.log("Uğurla çıxış edildi.");
                const logoutDelay = 2000;
                console.log(`${logoutDelay}ms sonra giriş səhifəsinə yönləndirilir...`);
                setTimeout(() => {
                    window.location.href = '/ana_sehife/login/login.html';
                }, logoutDelay);
            } else {
                console.error("Çıxış xətası (server):", result.message);
                if (loadingOverlay) loadingOverlay.classList.remove('visible');
                alert(`Çıxış zamanı xəta: ${result.message || 'Naməlum xəta'}`);
            }
        } catch (error) {
            console.error("Çıxış fetch xətası:", error);
            if (loadingOverlay) loadingOverlay.classList.remove('visible');
            alert("Serverlə əlaqə qurmaq mümkün olmadı.");
        }
    } // handleLogout sonu


    // --- Profil Modal Funksiyaları ---
    function openProfileModal() {
        if (!loggedInUser) return;
        console.log("Profil modalı açılır...");
        if (editFullNameInput) editFullNameInput.value = loggedInUser.fullName || '';
        if (editEmailInput) editEmailInput.value = loggedInUser.email || '';
        if (editNicknameInput) editNicknameInput.value = loggedInUser.nickname || '';
        if (editPasswordInput) editPasswordInput.value = '';
        if (editConfirmPasswordInput) editConfirmPasswordInput.value = '';
        if (editProfileMessage) { editProfileMessage.textContent = ''; editProfileMessage.className = 'message'; editProfileMessage.removeAttribute('style'); } // Stili də təmizlə
        if (currentNicknameInput) currentNicknameInput.value = loggedInUser.nickname; // Hidden input üçün
        if (saveProfileButton) saveProfileButton.disabled = false; // Düyməni aktiv et
        showModal(editProfileModal);
    }

    function closeProfileModal() {
        hideModal(editProfileModal);
    }

    // --- Profil Yeniləmə Handler ---
    async function handleProfileUpdate(event) {
        event.preventDefault();
        if (!loggedInUser || !editProfileForm || !saveProfileButton) return;

        const currentNickname = loggedInUser.nickname; // Serverə göndərmək üçün
        const password = editPasswordInput.value;
        const confirmPassword = editConfirmPasswordInput.value;

        // --- Validasiya ---
        if (password !== confirmPassword) { showMsg(editProfileMessage, 'Yeni şifrələr eyni deyil.', 'error'); return; }
        if (password && password.length < 6) { showMsg(editProfileMessage, 'Yeni şifrə min. 6 simvol olmalıdır.', 'error'); return; }

        const newNickname = editNicknameInput.value.trim();
        const email = editEmailInput.value.trim();
        const fullName = editFullNameInput.value.trim();

        if (!fullName || !email || !newNickname) { showMsg(editProfileMessage, 'Ad Soyad, Email və Nickname boş ola bilməz.', 'error'); return; }
        if (/\s/.test(newNickname)) { showMsg(editProfileMessage, 'Nickname boşluq ehtiva edə bilməz.', 'error'); return; }
        if (newNickname.length < 3) { showMsg(editProfileMessage, 'Nickname minimum 3 hərf olmalıdır.', 'error'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMsg(editProfileMessage, 'Düzgün e-poçt ünvanı daxil edin.', 'error'); return; }
        // --- Validasiya Sonu ---

        saveProfileButton.disabled = true;
        showMsg(editProfileMessage, 'Yenilənir...', 'info');

        // Serverə göndəriləcək data
        const formData = {
            fullName,
            email,
            nickname: newNickname, // Yeni nickname göndərilir
            password: password || undefined // Yalnız dolu olduqda göndər
        };

        try {
            // URL-də mövcud nickname istifadə olunur
            const response = await fetch(`/api/auth/profile/${encodeURIComponent(currentNickname)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData)
            });
            const result = await response.json();

            if (response.ok) {
                showMsg(editProfileMessage, result.message || 'Profil uğurla yeniləndi!', 'success');
                loggedInUser = result.updatedUser || loggedInUser; // Lokal user datasını yenilə
                // Header-dəki adı yenilə
                if (welcomePlayerSpan) { welcomePlayerSpan.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUser.nickname)}</strong>!`; }
                // Nickname dəyişibsə, hidden inputu da yenilə (növbəti redaktə üçün)
                if (currentNicknameInput) currentNicknameInput.value = loggedInUser.nickname;

                closeProfileModal();
            } else {
                // Serverdən gələn xəta mesajını göstər
                showMsg(editProfileMessage, result.message || 'Profil yenilənərkən xəta.', 'error');
            }
        } catch (error) {
            console.error('Profil yeniləmə fetch xətası:', error);
            showMsg(editProfileMessage, 'Serverlə əlaqə mümkün olmadı.', 'error');
        } finally {
            // Düyməni yenidən aktiv et
            if (saveProfileButton) saveProfileButton.disabled = false;
        }
    } // handleProfileUpdate sonu

    // Modal xaricinə klikləmə listenerı (qlobal olaraq bir dəfə qoşulur)
    window.addEventListener('click', (event) => {
        if (editProfileModal && event.target == editProfileModal) {
            closeProfileModal();
        }
    });

    console.log("Oyunlar JS ilkin quraşdırma bitdi.");

}); // DOMContentLoaded Sonu