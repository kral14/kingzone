// public/OYUNLAR/oyunlar/oyunlar.js (Yenilənmiş - Auth Check, Logout, Profil Edit ilə)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Oyunlar JS (v3 - Tam) Başladı.");

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
    const currentNicknameInput = document.getElementById('edit-current-nickname'); // Gizli input

    let loggedInUser = null; // Giriş etmiş istifadəçi məlumatları

    // --- Yardımçı Funksiyalar ---
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'error') => { // Profil mesajı üçün
        if (!el) return;
        el.textContent = msg;
        el.style.color = type === 'success' ? '#39ff14' : '#ff4d4d';
        el.style.backgroundColor = type === 'success' ? 'rgba(57, 255, 20, 0.15)' : 'rgba(255, 77, 77, 0.15)';
        el.style.borderColor = type === 'success' ? 'rgba(57, 255, 20, 0.5)' : 'rgba(255, 77, 77, 0.5)';
    };
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return String(unsafe);
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // ===== SƏHİFƏ YÜKLƏNƏNDƏ AUTENTİFİKASİYA YOXLAMASI =====
    try {
        console.log("Oyunlar səhifəsi: /check-auth sorğusu göndərilir...");
        const response = await fetch('/check-auth', {
            method: 'GET',
            credentials: 'include' // <<<--- COOKIE GÖNDƏRMƏK ÜÇÜN VACİB!
        });
        const data = await response.json();

        if (!response.ok || !data.loggedIn) {
            console.log("Oyunlar JS: Giriş edilməyib (check-auth), login səhifəsinə yönləndirilir...");
            window.location.href = '../../ANA SEHIFE/login/login.html'; // Girişə yönləndir
            return; // Scriptin qalanı işləməsin
        }

        // Giriş edilib
        loggedInUser = data.user; // İstifadəçi məlumatlarını qlobal dəyişənə yazırıq
        console.log(`Oyunlar JS: Giriş edilib: ${loggedInUser.nickname}`);

        // Xoş gəldin mesajını göstər
        if (welcomePlayerSpan) {
            welcomePlayerSpan.textContent = `Xoş gəldin, ${escapeHtml(loggedInUser.nickname)}!`;
        }

        // Çıxış və Profil düymələri üçün event listener əlavə et
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        } else { console.error("Logout düyməsi tapılmadı!"); }

        if (editProfileBtn && editProfileModal) {
            editProfileBtn.addEventListener('click', openProfileModal);
        } else { console.error("Profil düyməsi və ya modalı tapılmadı!"); }

        if (closeEditModalBtn) {
            closeEditModalBtn.addEventListener('click', closeProfileModal);
        }

        if (editProfileForm) {
            editProfileForm.addEventListener('submit', handleProfileUpdate);
        } else { console.error("Profil formu tapılmadı!"); }

        // Modal xaricində klikləməni idarə et
        window.addEventListener('click', (event) => {
             if (event.target == editProfileModal) {
                  closeProfileModal();
             }
         });


    } catch (error) {
        console.error("Oyunlar JS: Auth yoxlama və ya quraşdırma xətası:", error);
        // Xəta halında da girişə yönləndirək
        alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
        window.location.href = '../../ANA SEHIFE/login/login.html';
        return;
    }
    // =====================================================

    // --- Event Listener Funksiyaları ---

    // Çıxış funksiyası
    async function handleLogout() {
        console.log("Çıxış edilir...");
        try {
            const response = await fetch('/logout', {
                method: 'POST',
                credentials: 'include' // Sessiya cookie-sini göndərmək üçün
            });
            const result = await response.json();

            if (response.ok) {
                console.log("Uğurla çıxış edildi.");
                window.location.href = '../../ANA SEHIFE/login/login.html'; // Giriş səhifəsinə yönləndir
            } else {
                console.error("Çıxış xətası:", result.message);
                alert(`Çıxış zamanı xəta: ${result.message || 'Naməlum xəta'}`);
            }
        } catch (error) {
            console.error("Çıxış fetch xətası:", error);
            alert("Serverlə əlaqə qurmaq mümkün olmadı.");
        }
    }

    // Profil modalını açmaq və məlumatları doldurmaq
    function openProfileModal() {
        if (!loggedInUser) return; // İstifadəçi məlumatı yoxdursa açma

        console.log("Profil modalı açılır...");
        // Mövcud məlumatları formaya doldur
        if(editFullNameInput) editFullNameInput.value = loggedInUser.fullName || '';
        if(editEmailInput) editEmailInput.value = loggedInUser.email || ''; // Emaili də göstərək (server tərəfindən gəlməlidir)
        if(editNicknameInput) editNicknameInput.value = loggedInUser.nickname || '';
        if(editPasswordInput) editPasswordInput.value = ''; // Şifrə sahələrini boşalt
        if(editConfirmPasswordInput) editConfirmPasswordInput.value = '';
        if(editProfileMessage) editProfileMessage.textContent = ''; // Xəta mesajını təmizlə
        // Gizli inputa hazırki nickname-i yazırıq (endpoint üçün lazım ola bilər)
        if(currentNicknameInput) currentNicknameInput.value = loggedInUser.nickname;

        showModal(editProfileModal);
    }

    // Profil modalını bağlamaq
    function closeProfileModal() {
        hideModal(editProfileModal);
    }

    // Profil yeniləmə formasını göndərmək
    async function handleProfileUpdate(event) {
        event.preventDefault(); // Formun standart göndərilməsini dayandır
        if (!loggedInUser || !editProfileForm || !saveProfileButton) return;

        const currentNickname = loggedInUser.nickname; // Hazırki nickname (endpoint üçün)
        const password = editPasswordInput.value;
        const confirmPassword = editConfirmPasswordInput.value;

        // Client-side validasiya
        if (password !== confirmPassword) {
            showMsg(editProfileMessage, 'Yeni şifrələr eyni deyil.', 'error');
            return;
        }
        if (password && password.length < 6) {
            showMsg(editProfileMessage, 'Yeni şifrə minimum 6 simvol olmalıdır.', 'error');
            return;
        }
        if (editNicknameInput.value.trim() && /\s/.test(editNicknameInput.value.trim())) {
            showMsg(editProfileMessage, 'Nickname boşluq ehtiva edə bilməz.', 'error');
            return;
        }
         if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmailInput.value.trim())) {
             showMsg(editProfileMessage, 'Düzgün e-poçt ünvanı daxil edin.', 'error');
             return;
         }


        saveProfileButton.disabled = true; // Düyməni deaktiv et
        showMsg(editProfileMessage, 'Yenilənir...', 'info'); // İnfo mesajı göstər

        const formData = {
            fullName: editFullNameInput.value.trim(),
            email: editEmailInput.value.trim(),
            nickname: editNicknameInput.value.trim(), // Frontend nickname göndərir, backend bunu yeni nickname kimi qəbul edir
            password: password || undefined // Əgər şifrə boşdursa, göndərmirik (undefined)
        };

        try {
            const response = await fetch(`/profile/${currentNickname}`, { // Düzgün endpoint
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include', // Cookie göndər
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (response.ok) {
                showMsg(editProfileMessage, result.message || 'Profil uğurla yeniləndi!', 'success');
                // Sessionda saxlanan user məlumatlarını yeniləyək (əgər lazım gələrsə)
                loggedInUser = result.updatedUser || loggedInUser; // Server yenilənmiş useri qaytarmalıdır
                // Xoş gəldin mesajını da yeniləyək
                if (welcomePlayerSpan) {
                    welcomePlayerSpan.textContent = `Xoş gəldin, ${escapeHtml(loggedInUser.nickname)}!`;
                }
                // Modalı bir müddət sonra bağlayaq
                setTimeout(closeProfileModal, 1500);
            } else {
                showMsg(editProfileMessage, result.message || 'Profil yenilənərkən xəta baş verdi.', 'error');
            }

        } catch (error) {
            console.error('Profil yeniləmə fetch xətası:', error);
            showMsg(editProfileMessage, 'Serverlə əlaqə qurmaq mümkün olmadı.', 'error');
        } finally {
            saveProfileButton.disabled = false; // Düyməni yenidən aktiv et
        }
    }

    // İlkin yükləmə (əgər ehtiyac varsa başqa funksiyalar çağırıla bilər)
    console.log("Oyunlar JS tam yükləndi və hazırdır.");

}); // DOMContentLoaded Sonu