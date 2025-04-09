// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Socket.IO + Session Auth (v5 - Debug Logs + AI Fix + Disconnect Listener)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Test Odalar JS (v5 - Debug Logs) Başladı.");

    let loggedInUser = null;
    let currentRooms = [];
    let socket = null;

    // ===== GİRİŞ YOXLAMASI =====
    try {
        console.log("Lobby: /check-auth sorğusu göndərilir...");
        const response = await fetch('/check-auth', { credentials: 'include' });
        console.log("Lobby: /check-auth cavabı alındı. Status:", response.status);
        const data = await response.json();
        if (!response.ok || !data.loggedIn) {
            console.error("Lobby: Giriş edilməyib (/check-auth), loginə yönləndirilir...");
            window.location.href = '../../ANA SEHIFE/login/login.html';
            return;
        }
        loggedInUser = data.user;
        console.log(`Lobby: Giriş edilib: ${loggedInUser.nickname} (ID: ${loggedInUser.id})`);
    } catch (error) {
        console.error("Lobby: Auth yoxlama xətası:", error);
        alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
        window.location.href = '../../ANA SEHIFE/login/login.html';
        return;
    }
    // ===========================

    const loggedInUsername = loggedInUser.nickname;

    // --- DOM Elementləri ---
    console.log("Lobby: DOM elementləri seçilir...");
    const roomListContainer = document.getElementById('room-list-container');
    const infoMessageArea = document.getElementById('info-message-area');
    const createRoomButton = document.getElementById('create-room-button');
    const userInfoPlaceholder = document.getElementById('user-info-placeholder');
    const createRoomModal = document.getElementById('create-room-modal');
    const createRoomSubmitBtn = document.getElementById('create-room-submit-btn');
    const createRoomMessage = document.getElementById('create-room-message');
    const newRoomNameInput = document.getElementById('new-room-name');
    const newRoomPasswordInput = document.getElementById('new-room-password');
    const newBoardSizeSelect = document.getElementById('new-board-size');
    const newBoardSizeRuleDisplay = document.getElementById('new-room-rule-display');
    const joinRoomModal = document.getElementById('join-room-modal');
    const joinRoomSubmitBtn = document.getElementById('join-room-submit-btn');
    const joinRoomMessage = document.getElementById('join-room-message');
    const joinRoomTitle = document.getElementById('join-room-title');
    const joinRoomIdInput = document.getElementById('join-room-id');
    const joinRoomPasswordInput = document.getElementById('join-room-password');
    const closeButtons = document.querySelectorAll('.close-button');
    console.log("Lobby: DOM elementləri seçildi.");
    // --------------------------

    // --- Yardımçı Funksiyalar ---
    const showModal = (modal) => { console.log("showModal çağırıldı:", modal?.id); if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { console.log("hideModal çağırıldı:", modal?.id); if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'info', duration = 4000) => { /* ... (əvvəlki kimi, amma log əlavə etmək olar) ... */ if(el) el.style.display = 'block'; el.textContent = msg; /*...*/ };
    function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return String(unsafe); return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
    function updateRuleDisplay(selectElement, displayElement) { /* ... */ }
    function addPlayerHoverListeners(playerSpan) { /* ... */ }
    // --------------------------

    // --- Header İstifadəçi Məlumatları ---
    if (userInfoPlaceholder) { /* ... */ }
    // -----------------------------

     // --- Başlanğıc UI ---
     if (infoMessageArea) {
        console.log("Lobby: 'Serverə qoşulunur...' mesajı göstərilir.");
        infoMessageArea.textContent = 'Serverə qoşulunur...';
        infoMessageArea.style.display = 'block'; // Görünən et
     }
     updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay);
     // --------------------

    // --- Socket.IO Bağlantısı ---
    try {
        console.log("Lobby: Socket.IO serverinə qoşulmağa cəhd edilir...");
        socket = io({
             // reconnection: false // Test üçün avtomatik təkrar qoşulmanı bağlayaq
        });
        // <<< DEBUG: Socket obyekti yaradıldı mı? >>>
        console.log("Lobby: io() funksiyası çağırıldı. Socket obyekti:", socket ? "Yaradıldı" : "Yaradılmadı!");
        // <<< ------------------------------------ >>>
    } catch (e) {
        console.error("Lobby: io() funksiyası çağırılarkən XƏTA:", e);
        showMsg(infoMessageArea, `Real-time serverə qoşulmaq mümkün olmadı (${e.message}).`, 'error', 0);
        return;
    }
    // --------------------------


    // --- Otaq Elementi Yaratma Funksiyası ---
    function createRoomElement(room) { /* ... (əvvəlki v4 kodu kimi) ... */ }
    // -----------------------------------------

    // --- Otaq Siyahısını Göstərmə ---
    function displayRooms(roomsToDisplay) {
         console.log("Lobby: displayRooms funksiyası çağırıldı. Otaq sayı:", roomsToDisplay?.length ?? 0);
         if (!roomListContainer) { console.error("roomListContainer tapılmadı!"); return; }
         roomListContainer.innerHTML = '';
         if (!Array.isArray(roomsToDisplay)) { console.error("displayRooms: roomsToDisplay massiv deyil!"); checkIfRoomListEmpty([]); return; }

         if (roomsToDisplay.length === 0) {
             checkIfRoomListEmpty([]);
         } else {
             // <<< DEBUG: Məlumat mesajını gizlətməzdən əvvəl yoxla >>>
             if (infoMessageArea) {
                 console.log("Lobby: Otaqlar var, infoMessageArea gizlədilir.");
                 infoMessageArea.style.display = 'none';
             } else {
                 console.warn("Lobby: infoMessageArea tapılmadı!");
             }
             // <<< ------------------------------------------ >>>
             roomsToDisplay.forEach((room, index) => {
                 try {
                     const li = createRoomElement(room);
                     roomListContainer.appendChild(li);
                     requestAnimationFrame(() => { setTimeout(() => { li.classList.add('entering'); }, index * 50); });
                 } catch(e) { console.error(`Otaq elementi yaradılarkən xəta:`, e, room); }
             });
             checkIfRoomListEmpty(roomsToDisplay);
         }
          console.log("Lobby: displayRooms funksiyası bitdi.");
     }
    // --------------------------

    // --- Otaq Siyahısı Boş Nəzarəti ---
    function checkIfRoomListEmpty(rooms) { /* ... */ }
    // --------------------------

    // --- Otağa Klikləmə ---
    function handleRoomClick(room) { /* ... (əvvəlki v4 kodu kimi, AI yönləndirməsi daxil) ... */ }
    // -----------------------------------------------

    // RedirectToLogin funksiyası
    function redirectToLogin() { window.location.href = '../../ANA SEHIFE/login/login.html'; }

    // === Socket.IO Hadisə Dinləyiciləri ===
    if(socket) {
        console.log("Lobby: Socket.IO hadisə dinləyiciləri əlavə edilir...");

        socket.on('connect', () => {
            // <<< DEBUG: Connect hadisəsi işə düşdü mü? >>>
            console.log('############################################');
            console.log('###### Socket.IO serverinə qoşuldu! ###### ID:', socket.id);
            console.log('############################################');
            // <<< ------------------------------------- >>>
            if (infoMessageArea && infoMessageArea.textContent === 'Serverə qoşulunur...') {
                console.log("Lobby: 'connect' hadisəsi - infoMessageArea təmizlənir.");
                infoMessageArea.textContent = 'Otaq siyahısı alınır...'; // Artıq qoşulduq
                infoMessageArea.style.display = 'block'; // Görünən qalsın
            } else if (infoMessageArea) {
                 console.log("Lobby: 'connect' hadisəsi - infoMessageArea fərqli idi:", infoMessageArea.textContent);
                 // Qoşulma bərpa olubsa, xəta mesajını təmizlə
                 if(infoMessageArea.classList.contains('error')) {
                      infoMessageArea.textContent = 'Otaq siyahısı alınır...';
                      infoMessageArea.className = 'message info';
                      infoMessageArea.removeAttribute('style');
                      infoMessageArea.style.display = 'block';
                 }
            }
        });

        socket.on('disconnect', (reason) => {
            // <<< DEBUG: Disconnect logu əvvəlki kimi qalır >>>
            console.error('############################################');
            console.error('###### SOCKET BAĞLANTISI KƏSİLDİ! ######');
            console.error('############################################');
            console.error('Səbəb (Reason):', reason);
            if (reason === 'io server disconnect') { console.warn('Server bağlantını kəsdi.'); }
            else if (reason === 'ping timeout') { console.warn('Ping timeout.'); }
            else if (reason === 'transport close') { console.warn('Transport bağlandı.'); }
            else if (reason === 'transport error') { console.error('Transport xətası.'); }
            else { console.log('Digər səbəb:', reason); }
            showMsg(infoMessageArea, `Serverlə əlaqə kəsildi (${reason}).`, 'error', 0);
        });

        socket.on('connect_error', (error) => {
            // <<< DEBUG: Connect error logu >>>
            console.error('############################################');
            console.error('###### Socket.IO Qoşulma Xətası! ######');
            console.error('############################################');
            console.error('Xəta Mesajı:', error.message);
            console.error('Xəta Obyekti:', error);
            // <<< ----------------------------- >>>
             if (error.message === 'Authentication error') {
                 showMsg(infoMessageArea, 'Giriş etibarsızdır. Yenidən giriş edin.', 'error', 0);
                 setTimeout(redirectToLogin, 4000);
             } else {
                 showMsg(infoMessageArea, 'Serverə qoşulmaq mümkün olmadı. Şəbəkəni və server statusunu yoxlayın.', 'error', 0);
             }
        });

        socket.on('room_list_update', (roomListFromServer) => {
             console.log('>>> Lobby: room_list_update ALINDI! Otaq sayı:', roomListFromServer?.length || 0);
             currentRooms = roomListFromServer || [];
             // <<< DEBUG: displayRooms ətrafında try-catch >>>
             try {
                  console.log("Lobby: displayRooms çağırılır...");
                  displayRooms(currentRooms);
             } catch(displayError) {
                  console.error("Lobby: displayRooms funksiyasında XƏTA:", displayError);
                  showMsg(infoMessageArea, "Otaq siyahısı göstərilərkən xəta baş verdi.", "error");
             }
             // <<< ------------------------------------- >>>
        });

        socket.on('creation_error', (errorMessage) => { /* ... */ });
        socket.on('join_error', (errorMessage) => { /* ... */ });
        socket.on('room_joined', (data) => { /* ... */ });

        console.log("Lobby: Socket.IO hadisə dinləyiciləri əlavə edildi.");

    } else {
        console.error("Lobby: Socket obyekti mövcud deyil! Dinləyicilər əlavə edilə bilmir.");
        showMsg(infoMessageArea, 'Real-time bağlantı qurulamadı (socket obyekti yoxdur).', 'error', 0);
    }
    // ========================================


    // === DOM Hadisə Dinləyiciləri (Listeners) ===
    console.log("Lobby: DOM hadisə dinləyiciləri əlavə edilir...");
    if (createRoomButton) {
        createRoomButton.addEventListener('click', () => {
            console.log("Lobby: 'Yeni Oda Oluştur' düyməsinə klikləndi.");
            // ... (modalı açan kod - əvvəlki kimi) ...
            showModal(createRoomModal);
            // ...
        });
    } else { console.error("createRoomButton elementi tapılmadı!"); }

    // ... (qalan DOM dinləyiciləri - əvvəlki kimi) ...
    console.log("Lobby: DOM hadisə dinləyiciləri əlavə edildi.");
    // ========================================

     console.log("Lobby: DOMContentLoaded sonuna çatdı.");

}); // DOMContentLoaded Sonu