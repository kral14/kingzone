// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Socket.IO + Session Auth (v9 - Detailed Socket Init Debug)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Test Odalar JS (v9 - Detailed Socket Init Debug) Başladı.");

    let loggedInUser = null;
    let currentRooms = [];
    let socket = null;

    // ===== GİRİŞ YOXLAMASI =====
    try {
        console.log("Lobby: /check-auth sorğusu...");
        const response = await fetch('/check-auth', { credentials: 'include' });
        console.log("Lobby: /check-auth cavabı:", response.status);
        const data = await response.json();
        if (!response.ok || !data.loggedIn) {
            console.error("Lobby: Giriş edilməyib, loginə yönləndirilir...");
            window.location.href = '/ANA SEHIFE/login/login.html'; // Başdakı ../../ silindi, / əlavə edildi
            return;
        }
        loggedInUser = data.user;
        // <<< DEBUG: loggedInUser obyektini tam yoxla >>>
        console.log(`Lobby: Giriş edilib Data:`, loggedInUser);
        if (!loggedInUser || !loggedInUser.nickname) {
            console.error("Lobby: XƏTA - loggedInUser və ya nickname tapılmadı!", loggedInUser);
            alert("İstifadəçi məlumatları alınarkən xəta baş verdi. Təkrar giriş edin.");
            window.location.href = '../../ANA SEHIFE/login/login.html';
            return;
        }
        console.log(`Lobby: Giriş nickname: ${loggedInUser.nickname}`);
        // <<< ------------------------------------ >>>

    } catch (error) {
        console.error("Lobby: Auth yoxlama xətası:", error);
        alert("Sessiya yoxlanılarkən xəta. Giriş səhifəsinə yönləndirilirsiniz.");
        window.location.href = '../../ANA SEHIFE/login/login.html';
        return;
    }
    // ===========================

    // <<< DEBUG: nickname dəyişənini yoxla >>>
    const loggedInUsername = loggedInUser.nickname;
    console.log(`Lobby: loggedInUsername dəyişəni: ${loggedInUsername}`);
    // <<< ----------------------------- >>>


    // --- DOM Elementləri ---
    console.log("Lobby: DOM elementləri seçilir...");
    // ... (əvvəlki kimi bütün elementlər) ...
    const userInfoPlaceholder = document.getElementById('user-info-placeholder');
    console.log("Lobby: DOM elementləri seçildi.");
    // --------------------------

    // --- Yardımçı Funksiyalar ---
    // ... (əvvəlki kimi) ...
    // --------------------------

    // --- Header İstifadəçi Məlumatları ---
    console.log("Lobby: Header mətni təyin edilir...");
    if (userInfoPlaceholder) {
        try {
             userInfoPlaceholder.textContent = '';
             const welcomeSpan = document.createElement('span');
             welcomeSpan.id = 'welcome-lobby-player';
             // <<< DEBUG: escapeHtml və innerHTML əvvəli/sonrası >>>
             const usernameToDisplay = loggedInUsername || '???'; // Undefined olarsa ??? göstər
             console.log(`Lobby: Header üçün istifadəçi adı: "${usernameToDisplay}"`);
             const escapedUsername = escapeHtml(usernameToDisplay);
             console.log(`Lobby: Header üçün escape edilmiş ad: "${escapedUsername}"`);
             welcomeSpan.innerHTML = `Xoş gəldin, <strong>${escapedUsername}</strong>! `;
             console.log(`Lobby: welcomeSpan.innerHTML təyin edildi:`, welcomeSpan.innerHTML);
             userInfoPlaceholder.appendChild(welcomeSpan);
             console.log("Lobby: Header mətni uğurla təyin edildi.");
             // <<< ----------------------------------------- >>>
        } catch (headerError){
             console.error("Lobby: Header mətni təyin edilərkən XƏTA:", headerError);
             if(userInfoPlaceholder) userInfoPlaceholder.textContent = "Xoş gəldin! (Xəta)";
        }
    } else {
        console.warn("Lobby: userInfoPlaceholder elementi tapılmadı!");
    }
    // -----------------------------

    // --- Başlanğıc UI ---
    // ... (əvvəlki kimi) ...
    // --------------------

    // --- Socket.IO Bağlantısı (Try-Catch ilə) ---
    try {
        console.log("Lobby: Socket.IO serverinə qoşulmağa cəhd edilir (try bloku)...");
        // <<< DEBUG: io() funksiyasını çağırmazdan əvvəl yoxla >>>
        if (typeof io === 'undefined') {
             console.error("Lobby: XƏTA - io funksiyası tapılmadı! socket.io.js yüklənməyib?");
             showMsg(infoMessageArea, 'Socket kitabxanası yüklənmədi. Səhifəni yeniləyin.', 'error', 0);
             return;
        }
        // <<< ----------------------------------------- >>>
        socket = io({
             reconnectionAttempts: 3, // 3 dəfə cəhd etsin
             reconnectionDelay: 2000, // 2 saniyə gözləsin
             timeout: 10000 // Qoşulma üçün 10 saniyə gözləsin
        });
        console.log("Lobby: io() funksiyası çağırıldı. Socket obyekti:", socket);

        // <<< DEBUG: Obyekt yaradılandan dərhal sonra statusu yoxla >>>
        if (socket) {
             console.log(`Lobby: Socket obyekti yaradıldı. ID: ${socket.id}, Connected: ${socket.connected}`);
        } else {
             console.error("Lobby: XƏTA - io() funksiyası socket obyekti qaytarmadı!");
        }
        // <<< --------------------------------------------- >>>

    } catch (e) {
        console.error("Lobby: io() funksiyası çağırılarkən XƏTA (catch bloku):", e);
        showMsg(infoMessageArea, `Real-time serverə qoşulmaq mümkün olmadı (${e.message}).`, 'error', 0);
        socket = null; // Xəta varsa, socket obyektini null edək
    }
    // --------------------------

    // --- Otaq Elementi Yaratma Funksiyası ---
    function createRoomElement(room) { /* ... (əvvəlki v8 kodu kimi) ... */ }
    // -----------------------------------------

    // --- Otaq Siyahısını Göstərmə ---
    function displayRooms(roomsToDisplay) { /* ... (əvvəlki v8 kodu kimi) ... */ }
    // --------------------------

    // --- Otaq Siyahısı Boş Nəzarəti ---
    function checkIfRoomListEmpty(rooms) { /* ... */ }
    // --------------------------

    // --- Otağa Klikləmə ---
    function handleRoomClick(room) { /* ... (əvvəlki v8 kodu kimi) ... */ }
    // -----------------------------------------------

    // RedirectToLogin funksiyası
    function redirectToLogin() { /* ... */ }

    // === Socket.IO Hadisə Dinləyiciləri ===
    if(socket) {
        console.log("Lobby: Socket.IO hadisə dinləyiciləri əlavə edilir (socket obyekti mövcuddur)...");
        socket.on('connect', () => {
            console.log('############################################');
            console.log('###### Socket.IO serverinə qoşuldu! ###### ID:', socket.id);
            console.log('############################################');
            if (infoMessageArea && infoMessageArea.textContent.includes('qoşulunur')) {
                infoMessageArea.textContent = 'Otaq siyahısı alınır...';
                infoMessageArea.className = 'message info'; // Stili yenilə
            }
        });
        socket.on('disconnect', (reason) => { /* ... (debug logları ilə əvvəlki kimi) ... */ });
        socket.on('connect_error', (error) => { /* ... (debug logları ilə əvvəlki kimi) ... */ });
        socket.on('room_list_update', (roomListFromServer) => { /* ... (debug logları və try-catch ilə əvvəlki kimi) ... */ });
        socket.on('creation_error', (errorMessage) => { /* ... */ });
        socket.on('join_error', (errorMessage) => { /* ... */ });
        socket.on('room_joined', (data) => { /* ... */ });
        console.log("Lobby: Socket.IO hadisə dinləyiciləri əlavə edildi.");
    } else {
        console.error("Lobby: Socket obyekti mövcud deyil! Socket.IO dinləyiciləri əlavə edilə bilmir.");
        showMsg(infoMessageArea, 'Real-time bağlantı qurulamadı (socket obyekti etibarsızdır).', 'error', 0);
    }
    // ========================================

    // === DOM Hadisə Dinləyiciləri (Listeners) ===
    console.log("Lobby: DOM hadisə dinləyiciləri əlavə edilir...");
    // ... (əvvəlki kimi, createRoomButton üçün log daxil) ...
    // ========================================

     console.log("Lobby: DOMContentLoaded sonuna çatdı.");

}); // DOMContentLoaded Sonu