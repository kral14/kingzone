document.addEventListener('DOMContentLoaded', () => {
    console.log("Login JS Başladı.");

    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-button');
    const loadingOverlay = document.getElementById('loading-overlay');
    const usernameInput = document.getElementById('username'); // Bu input HTML-də var

    // Elementlərin mövcudluğunu yoxlayaq
    if (loginForm && loadingOverlay && loginButton && usernameInput) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault(); // Formun normal gönderimini engelle

            console.log("Giriş Yap butonuna tıklandı.");

            // Şifrə inputunu da seçək (gələcəkdə validasiya üçün lazım ola bilər)
            const passwordInput = document.getElementById('password');

            // Kullanıcı adını alıp sonraki sayfaya gönderebiliriz
            const username = usernameInput.value.trim();
            const password = passwordInput ? passwordInput.value : ''; // Şifrəni alaq (əgər varsa)

             // Sadə yoxlama: Sahələr boş olmasın (əgər tələb olunursa)
             // if (!username || !password) {
             //     alert("Zəhmət olmasa, həm kullanıcı adı, həm də şifrə sahəsini doldurun.");
             //     return; // Prosesi dayandır
             // }

            const playerNameParam = encodeURIComponent(username || 'Misafir'); // Boşsa Misafir yap

            // 1. Yükleniyor animasyonunu göster
            loadingOverlay.classList.add('visible');
            loginButton.disabled = true; // Butonu pasif yap
            // Arxa planda scroll olmasın deyə body-ə class əlavə edə bilərik
            // document.body.style.overflow = 'hidden';

            // 2. Simüle edilmiş yükleme süresi (örneğin 1.5 saniye)
            // Gerçek bir uygulamada burada sunucuya kullanıcı adı/şifrə göndərilir,
            // cavab gözlənilir (uğurlu/uğursuz giriş).
            setTimeout(() => {
                console.log("Yönlendirme yapılıyor...");

                // 3. Oyunlar sayfasına yönlendir (YOL YENİLƏNİB)
                // Kullanıcı adını da URL parametresi olarak ekleyelim
                // Bu kod sizi oyun seçmə səhifəsinə aparacaq
                 window.location.href = `../../OYUNLAR/oyunlar/oyunlar.html?playerName=${playerNameParam}`;
                
                

                // Yönlendirme sonrası (genelde gerek kalmaz ama geri tuşu vb. durumlar üçün):
                // loadingOverlay.classList.remove('visible');
                // loginButton.disabled = false;
                // document.body.style.overflow = 'auto'; // Scroll'u bərpa et

            }, 1500); // 1500 milisaniye = 1.5 saniye bekle
        });
    } else {
        // Hansı elementin tapılmadığını daha dəqiq göstərək
        console.error("Giriş səhifəsində lazımi elementlərdən biri tapılmadı!");
        if (!loginForm) console.error("ID 'login-form' olan element tapılmadı.");
        if (!loginButton) console.error("ID 'login-button' olan element tapılmadı.");
        if (!loadingOverlay) console.error("ID 'loading-overlay' olan element tapılmadı.");
        if (!usernameInput) console.error("ID 'username' olan element tapılmadı.");
    }
});