// public/ANA SEHIFE/login/login.js (v2 - fetch API ilə)

document.addEventListener('DOMContentLoaded', () => {
    console.log("Login JS (v2 - fetch) Başladı.");

    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-button');
    const loadingOverlay = document.getElementById('loading-overlay');
    const usernameInput = document.getElementById('username'); // Bu HTML-də nickname olaraq qəbul edilməlidir
    const passwordInput = document.getElementById('password');
    // Giriş səhifəsində xəta mesajı üçün bir P elementi əlavə etmək yaxşı olardı
    // Məsələn, formun içinə <p id="errorMessage" class="message"></p> əlavə edin
    // Və CSS-də .message stilini (register.css-dən) bura da köçürün
    const errorMessageDiv = document.getElementById('errorMessage'); // Əgər əlavə etsəniz

    if (loginForm && loadingOverlay && loginButton && usernameInput && passwordInput) {
        loginForm.addEventListener('submit', async (event) => { // async etdik
            event.preventDefault();
            if (errorMessageDiv) errorMessageDiv.textContent = ''; // Xətanı təmizlə
            if (errorMessageDiv) errorMessageDiv.style.color = '#ff4d4d'; // Standard xəta rəngi
            loginButton.disabled = true; // Düyməni deaktiv et

            const nickname = usernameInput.value.trim(); // username inputunu nickname kimi qəbul edirik
            const password = passwordInput.value;

            // Sadə yoxlama
            if (!nickname || !password) {
                if (errorMessageDiv) errorMessageDiv.textContent = 'Nickname və şifrə daxil edilməlidir.';
                else alert('Nickname və şifrə daxil edilməlidir.'); // Əgər errorMessageDiv yoxdursa
                loginButton.disabled = false;
                return;
            }

            // Yükleniyor animasyonunu göster (istəyə bağlı)
            loadingOverlay.classList.add('visible');

            // Məlumatları Serverə Göndərmək (fetch API)
            try {
                const response = await fetch('/login', { // Backend-dəki endpoint
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        nickname: nickname,
                        password: password
                    }),
                });

                const result = await response.json(); // Serverdən gələn cavabı JSON olaraq al

                if (response.ok) { // HTTP status kodu 200 OK
                    console.log('Giriş uğurlu:', result);
                    // Session/Token olmadığı üçün sadəcə yönləndiririk
                    // Uğurlu girişdən sonra oyunlar səhifəsinə yönləndir
                    // Nickname-i URL parametri olaraq göndəririk
                    const playerNameParam = encodeURIComponent(result.nickname || 'Qonaq');
                     window.location.href = `../../OYUNLAR/oyunlar/oyunlar.html?playerName=${playerNameParam}`;

                    // Yönləndirmədən sonra overlayı gizlətməyə ehtiyac yoxdur
                } else {
                    // Server xətası (məs. 400, 401, 500)
                    if (errorMessageDiv) errorMessageDiv.textContent = result.message || 'Giriş zamanı naməlum xəta baş verdi.';
                    else alert(result.message || 'Giriş zamanı naməlum xəta baş verdi.'); // Fallback
                    loadingOverlay.classList.remove('visible'); // Xəta varsa, overlayı gizlət
                    loginButton.disabled = false; // Düyməni aktiv et
                }

            } catch (error) {
                console.error('Fetch error:', error);
                if (errorMessageDiv) errorMessageDiv.textContent = 'Serverlə əlaqə qurmaq mümkün olmadı. İnternetinizi yoxlayın.';
                else alert('Serverlə əlaqə qurmaq mümkün olmadı. İnternetinizi yoxlayın.'); // Fallback
                loadingOverlay.classList.remove('visible'); // Xəta varsa, overlayı gizlət
                loginButton.disabled = false; // Şəbəkə xətası varsa, düyməni yenidən aktiv et
            }
        });
    } else {
        console.error("Giriş səhifəsində lazımi elementlərdən biri tapılmadı!");
    }
});