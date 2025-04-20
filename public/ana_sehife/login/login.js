// public/ana_sehife/login/login.js

document.addEventListener('DOMContentLoaded', () => {
    console.log("Login JS (v2 - fetch) Başladı.");

    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-button');
    const loadingOverlay = document.getElementById('loading-overlay'); // Animasiya elementi
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMessageDiv = document.getElementById('errorMessage');

    if (loginForm && loadingOverlay && loginButton && usernameInput && passwordInput) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (errorMessageDiv) errorMessageDiv.textContent = '';
            if (errorMessageDiv) errorMessageDiv.style.color = '#ff4d4d';
            loginButton.disabled = true;

            const nickname = usernameInput.value.trim();
            const password = passwordInput.value;

            if (!nickname || !password) {
                if (errorMessageDiv) errorMessageDiv.textContent = 'Nickname və şifrə daxil edilməlidir.';
                else alert('Nickname və şifrə daxil edilməlidir.');
                loginButton.disabled = false;
                return;
            }

            // === ANİMASİYANI GÖSTƏR ===
            if (loadingOverlay) loadingOverlay.classList.add('visible');
            // ========================

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', },
                    body: JSON.stringify({ nickname: nickname, password: password }),
                });

                const result = await response.json();

                if (response.ok) { // Uğurlu giriş
                    console.log('Giriş uğurlu:', result);

                    // ----- YENİ ƏLAVƏ EDİLƏN SƏTİR ƏVVƏLKİ KİMİ SİLİNİR -----
                    // if(loadingOverlay) loadingOverlay.classList.remove('visible'); // <-- BU SƏTRİ SİLİN VƏ YA ŞƏRHƏ ALIN

                    // === GECİKMƏ ƏLAVƏ EDİLİR (2 Saniyə) ===
                    const redirectionDelay = 2000; // 2000 millisecond = 2 saniyə
                    console.log(`${redirectionDelay}ms sonra oyunlar səhifəsinə yönləndirilir...`);

                    // Animasiya görünür qalır, yönləndirmə baş verdikdə özü itəcək
                    setTimeout(() => {
                        const playerNameParam = encodeURIComponent(result.nickname || 'Qonaq');
                        window.location.href = `/OYUNLAR/oyunlar/oyunlar.html?playerName=${playerNameParam}`;
                    }, redirectionDelay);
                    // =======================================

                } else {
                    // Server xətası
                    if (errorMessageDiv) errorMessageDiv.textContent = result.message || 'Giriş zamanı naməlum xəta baş verdi.';
                    else alert(result.message || 'Giriş zamanı naməlum xəta baş verdi.');

                    // ----- XƏTA HALINDA ANİMASİYANI GİZLƏT -----
                    if(loadingOverlay) loadingOverlay.classList.remove('visible');
                    // ----------------------------------------
                    loginButton.disabled = false;
                }

            } catch (error) {
                console.error('Fetch error:', error);
                if (errorMessageDiv) errorMessageDiv.textContent = 'Serverlə əlaqə qurmaq mümkün olmadı. İnternetinizi yoxlayın.';
                else alert('Serverlə əlaqə qurmaq mümkün olmadı. İnternetinizi yoxlayın.');

                // ----- XƏTA HALINDA ANİMASİYANI GİZLƏT -----
                if(loadingOverlay) loadingOverlay.classList.remove('visible');
                // ----------------------------------------
                loginButton.disabled = false;
            }
        });
    } else {
        console.error("Giriş səhifəsində lazımi elementlərdən biri tapılmadı!");
    }
});