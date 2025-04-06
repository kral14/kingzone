document.addEventListener('DOMContentLoaded', function() {
    console.log("Register JS Başladı."); // Log mesajı

    // Elementləri yeni ID-lər və strukturla seçirik
    const registerForm = document.getElementById('register-form'); // Form ID
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const errorMessageDiv = document.getElementById('errorMessage'); // Mesaj P elementi
    const registerButton = document.getElementById('register-button'); // Button ID

    // Elementlərin tapılıb-tapılmadığını yoxlayaq
    if (!registerForm) console.error("register-form tapılmadı.");
    if (!fullNameInput) console.error("fullName input tapılmadı.");
    if (!emailInput) console.error("email input tapılmadı.");
    if (!passwordInput) console.error("password input tapılmadı.");
    if (!confirmPasswordInput) console.error("confirmPassword input tapılmadı.");
    if (!errorMessageDiv) console.error("errorMessage p elementi tapılmadı.");
    if (!registerButton) console.error("register-button tapılmadı.");


    if (registerForm && fullNameInput && emailInput && passwordInput && confirmPasswordInput && errorMessageDiv && registerButton) {
        registerForm.addEventListener('submit', function(event) {
            // Formanın standart göndərilməsinin qarşısını alırıq
            event.preventDefault();

            // Əvvəlki xəta mesajını təmizləyirik
            errorMessageDiv.textContent = ''; // .message klassı olduğu üçün arxa fon CSS ilə idarə olunacaq

            // Sahələrin dəyərlərini alırıq
            const fullName = fullNameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            // --- VALIDASIYA (Yoxlama) ---
            // 1. Boş sahələri yoxlamaq
            if (!fullName || !email || !password || !confirmPassword) {
                errorMessageDiv.textContent = 'Bütün sahələri doldurun.';
                return; // Funksiyadan çıxırıq
            }

            // 2. E-poçt formatını yoxlamaq (sadə yoxlama)
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(email)) {
                errorMessageDiv.textContent = 'Düzgün e-poçt ünvanı daxil edin.';
                return;
            }

            // 3. Şifrələrin eyni olub olmadığını yoxlamaq
            if (password !== confirmPassword) {
                errorMessageDiv.textContent = 'Şifrələr eyni deyil.';
                // Şifrə sahələrini təmizləyə bilərik
                passwordInput.value = '';
                confirmPasswordInput.value = '';
                passwordInput.focus(); // İlk şifrə sahəsinə fokuslan
                return;
            }

            // 4. Şifrənin minimum uzunluğunu yoxlamaq (məsələn, 6 simvol)
            if (password.length < 6) {
                errorMessageDiv.textContent = 'Şifrə minimum 6 simvol olmalıdır.';
                return;
            }

            // --- Hər şey qaydasındadırsa ---
            console.log('Qeydiyyat məlumatları:', { fullName, email, password });
            // Düyməni deaktiv edib, mesaj göstərə bilərik
            registerButton.disabled = true;
            errorMessageDiv.textContent = 'Qeydiyyat uğurludur! Yönləndirilir...';
            errorMessageDiv.style.color = '#39ff14'; // Yaşıl rəng (uğur mesajı)

            // Burada məlumatları serverə göndərmək üçün kod yazılmalıdır (AJAX/fetch istifadə edərək)
            // Məsələn:
            // fetch('/register-endpoint', { ... }) ...

            // Uğurlu qeydiyyatdan sonra login səhifəsinə yönləndirək (2 saniyə sonra)
            setTimeout(() => {
                 window.location.href = '../login/login.html'; // Yönləndirmə yolu
            }, 2000);

            // Formu təmizləməyə ehtiyac yoxdur, çünki yönləndiririk
            // registerForm.reset();
        });
    } else {
        console.error("Qeydiyyat formu üçün lazımi elementlərdən biri tapılmadı!");
    }
});