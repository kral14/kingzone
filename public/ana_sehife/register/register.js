// public/ana_sehife/register/register.js (v2 - fetch API ilə)

document.addEventListener('DOMContentLoaded', function() {
    console.log("Register JS (v2 - fetch) Başladı.");

    const registerForm = document.getElementById('register-form');
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const nicknameInput = document.getElementById('nickname'); // Yeni sahə
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const errorMessageDiv = document.getElementById('errorMessage');
    const registerButton = document.getElementById('register-button');

    if (registerForm && fullNameInput && emailInput && nicknameInput && passwordInput && confirmPasswordInput && errorMessageDiv && registerButton) {
        registerForm.addEventListener('submit', async function(event) { // async etdik
            event.preventDefault();
            errorMessageDiv.textContent = ''; // Xətanı təmizlə
            errorMessageDiv.style.color = '#ff4d4d'; // Standard xəta rəngi
            registerButton.disabled = true; // Düyməni deaktiv et

            const fullName = fullNameInput.value.trim();
            const email = emailInput.value.trim();
            const nickname = nicknameInput.value.trim(); // Nickname alırıq
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            // Client-side validasiya
            if (!fullName || !email || !nickname || !password || !confirmPassword) {
                errorMessageDiv.textContent = 'Bütün sahələri doldurun.';
                registerButton.disabled = false; // Düyməni aktiv et
                return;
            }
            if (password !== confirmPassword) {
                errorMessageDiv.textContent = 'Şifrələr eyni deyil.';
                passwordInput.value = ''; confirmPasswordInput.value = ''; passwordInput.focus();
                registerButton.disabled = false;
                return;
            }
            if (password.length < 6) {
                errorMessageDiv.textContent = 'Şifrə minimum 6 simvol olmalıdır.';
                registerButton.disabled = false;
                return;
            }
            if (/\s/.test(nickname)) { // Nickname-də boşluq yoxlaması
                 errorMessageDiv.textContent = 'Nickname boşluq ehtiva edə bilməz.';
                 registerButton.disabled = false;
                 return;
            }
             // Sadə email formatı
             if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                 errorMessageDiv.textContent = 'Düzgün e-poçt ünvanı daxil edin.';
                 registerButton.disabled = false;
                 return;
             }


            // Məlumatları Serverə Göndərmək (fetch API)
            try {
                const response = await fetch('/register', { // Backend-dəki endpoint
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ // Məlumatları JSON olaraq göndər
                        fullName: fullName,
                        email: email,
                        nickname: nickname,
                        password: password
                        // confirmPassword göndərməyə ehtiyac yoxdur, server yoxlamır
                    }),
                });

                const result = await response.json(); // Serverdən gələn cavabı JSON olaraq al

                if (response.ok) { // HTTP status kodu 2xx (məs. 201 Created)
                    errorMessageDiv.textContent = result.message + ' Giriş səhifəsinə yönləndirilir...';
                    errorMessageDiv.style.color = '#39ff14'; // Uğur rəngi

                    // Uğurlu qeydiyyatdan sonra login səhifəsinə yönləndir
                    setTimeout(() => {
                         window.location.href = '../login/login.html'; // Giriş səhifəsi
                    }, 2000);
                    // Formu təmizləməyə ehtiyac yoxdur, yönlənirik
                } else {
                    // Server xətası (məs. 400, 409, 500)
                    errorMessageDiv.textContent = result.message || 'Qeydiyyat zamanı naməlum xəta baş verdi.';
                    registerButton.disabled = false; // Xəta varsa, düyməni yenidən aktiv et
                }

            } catch (error) {
                console.error('Fetch error:', error);
                errorMessageDiv.textContent = 'Serverlə əlaqə qurmaq mümkün olmadı. İnternetinizi yoxlayın.';
                registerButton.disabled = false; // Şəbəkə xətası varsa, düyməni yenidən aktiv et
            }
        });
    } else {
        console.error("Qeydiyyat formu üçün lazımi elementlərdən biri tapılmadı!");
    }
});