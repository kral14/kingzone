// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Socket.IO + Session Auth (v8 - appendChild Fix + AI Logic + Disconnect Listener)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Test Odalar JS (v8 - Full Fixes Attempt) Başladı.");

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
            window.location.href = '../../ANA SEHIFE/login/login.html';
            return;
        }
        loggedInUser = data.user;
        console.log(`Lobby: Giriş edilib: ${loggedInUser.nickname} (ID: ${loggedInUser.id})`);
    } catch (error) {
        console.error("Lobby: Auth yoxlama xətası:", error);
        alert("Sessiya yoxlanılarkən xəta. Giriş səhifəsinə yönləndirilirsiniz.");
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
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'info', duration = 4000) => { /* ... (əvvəlki kimi) ... */ };
    function escapeHtml(unsafe) { /* ... (əvvəlki kimi) ... */ }
    function updateRuleDisplay(selectElement, displayElement) { /* ... (əvvəlki kimi) ... */ }
    function addPlayerHoverListeners(playerSpan) { /* ... (əvvəlki kimi) ... */ }
    // --------------------------

    // --- Header İstifadəçi Məlumatları ---
    if (userInfoPlaceholder) {
        userInfoPlaceholder.textContent = '';
        const welcomeSpan = document.createElement('span');
        welcomeSpan.id = 'welcome-lobby-player';
        welcomeSpan.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUsername)}</strong>! `;
        userInfoPlaceholder.appendChild(welcomeSpan);
    }
    // -----------------------------

     // --- Başlanğıc UI ---
     if (infoMessageArea) {
        console.log("Lobby: 'Serverə qoşulunur...' mesajı göstərilir.");
        infoMessageArea.textContent = 'Serverə qoşulunur...';
        infoMessageArea.style.display = 'block';
     }
     updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay);
     // --------------------

    // --- Socket.IO Bağlantısı ---
    try {
        console.log("Lobby: Socket.IO serverinə qoşulmağa cəhd edilir...");
        socket = io({ reconnectionAttempts: 5 }); // Cəhdləri məhdudlaşdıra bilərik
        console.log("Lobby: io() funksiyası çağırıldı. Socket obyekti:", socket ? "Yaradıldı" : "Yaradılmadı!");
    } catch (e) {
        console.error("Lobby: io() funksiyası çağırılarkən XƏTA:", e);
        showMsg(infoMessageArea, `Real-time serverə qoşulmaq mümkün olmadı (${e.message}).`, 'error', 0);
        return;
    }
    // --------------------------

    // --- Otaq Elementi Yaratma Funksiyası (YENİLƏNMİŞ - Daha Etibarlı Qurma) ---
    function createRoomElement(room) {
        console.log(`[createRoomElement] Başladı - Room ID: ${room?.id}, Name: ${room?.name}`);
        try {
            if (!room || typeof room !== 'object' || !room.id) {
                 console.error("[createRoomElement] XƏTA: Keçərsiz 'room' obyekti!", room);
                 return null;
            }

            const li = document.createElement('li');
            li.className = `room-item ${room.isAiRoom ? 'ai-room' : ''}`;
            li.dataset.roomId = room.id;

            const displayPlayerCount = room.isAiRoom ? 1 : (room.playerCount || 0);
            const maxPlayers = 2;
            const boardSizeText = room.boardSize ? `${room.boardSize}x${room.boardSize}` : '3x3';
            const creatorUsername = room.isAiRoom ? "SNOW" : (room.creatorUsername || 'Naməlum');
            const roomName = escapeHtml(room.name || 'Adsız Otaq');
            const creatorText = `Qurucu: ${escapeHtml(creatorUsername)}`;
            const playerCountText = `${displayPlayerCount}/${maxPlayers}`;

            // Elementləri ayrı-ayrı yaratmaq daha etibarlıdır
            const line1Div = document.createElement('div'); line1Div.className = 'room-item-line1';
            const roomNameSpan = document.createElement('span'); roomNameSpan.className = 'room-name';
            const originalNameTextSpan = document.createElement('span'); originalNameTextSpan.className = 'display-text original-text'; originalNameTextSpan.textContent = roomName;
            const hoverNameTextSpan = document.createElement('span'); hoverNameTextSpan.className = 'display-text hover-text'; hoverNameTextSpan.textContent = creatorText;
            roomNameSpan.appendChild(originalNameTextSpan);
            roomNameSpan.appendChild(hoverNameTextSpan);
            roomNameSpan.addEventListener('mouseenter', () => roomNameSpan.classList.add('is-hovered'));
            roomNameSpan.addEventListener('mouseleave', () => roomNameSpan.classList.remove('is-hovered'));

            const statusDiv = document.createElement('div'); statusDiv.className = 'room-status';
            const sizeSpan = document.createElement('span'); sizeSpan.className = 'players'; sizeSpan.title = 'Lövhə Ölçüsü'; sizeSpan.textContent = boardSizeText;
            statusDiv.appendChild(sizeSpan);
            if (room.hasPassword) {
                const lockSpan = document.createElement('span'); lockSpan.className = 'lock-icon'; lockSpan.title = 'Şifrə ilə qorunur'; lockSpan.textContent = '🔒'; statusDiv.appendChild(lockSpan);
            }
            const countSpan = document.createElement('span'); countSpan.className = 'players'; countSpan.title = 'Oyunçular'; countSpan.textContent = playerCountText;
            statusDiv.appendChild(countSpan);

            line1Div.appendChild(roomNameSpan);
            line1Div.appendChild(statusDiv);
            li.appendChild(line1Div);

            const separatorDiv = document.createElement('div'); separatorDiv.className = 'room-item-separator'; li.appendChild(separatorDiv);

            const line2Div = document.createElement('div'); line2Div.className = 'room-item-line2';
            const playerDisplayDiv = document.createElement('div'); playerDisplayDiv.className = 'player-name-display';

            if (room.isAiRoom) {
                 // innerHTML əvəzinə element yaradırıq
                 const p1 = document.createElement('span'); p1.className = 'player1-name'; p1.textContent = '(Sən)';
                 const vs = document.createElement('span'); vs.className = 'vs-icon'; vs.innerHTML = '<svg fill="currentColor" ...></svg>'; // SVG kodunu bura tam qoymaq lazımdır
                 const p2 = document.createElement('span'); p2.className = 'player2-name'; p2.textContent = 'SNOW';
                 playerDisplayDiv.appendChild(p1); playerDisplayDiv.appendChild(vs); playerDisplayDiv.appendChild(p2);
            } else {
                // Normal otaq (əvvəlki kimi addım-addım yaratmaq olar)
                 const p1Username = room.player1Username;
                 const p2Username = room.player2Username;
                 if (p1Username) { const p1 = document.createElement('span'); p1.className = 'player1-name'; p1.textContent = escapeHtml(p1Username); playerDisplayDiv.appendChild(p1); } else { const p1 = document.createElement('span'); p1.className = 'empty-slot'; p1.textContent = '(Boş)'; playerDisplayDiv.appendChild(p1); }
                 if (p1Username || p2Username) { const vs = document.createElement('span'); vs.className = 'vs-icon'; vs.innerHTML = '<svg fill="currentColor" ...></svg>'; playerDisplayDiv.appendChild(vs); } // SVG kodu
                 if (p2Username) { const p2 = document.createElement('span'); p2.className = 'player2-name'; p2.textContent = escapeHtml(p2Username); playerDisplayDiv.appendChild(p2); } else if (p1Username) { const p2 = document.createElement('span'); p2.className = 'empty-slot'; p2.textContent = '(Boş)'; playerDisplayDiv.appendChild(p2); }
                 if (!p1Username && !p2Username) { const empty = document.createElement('span'); empty.className = 'empty-slot'; empty.textContent = '(Otaq Boşdur)'; playerDisplayDiv.innerHTML = ''; playerDisplayDiv.appendChild(empty); }
                 playerDisplayDiv.querySelectorAll('.player1-name, .player2-name').forEach(addPlayerHoverListeners);
            }
            line2Div.appendChild(playerDisplayDiv);
            li.appendChild(line2Div);

            li.addEventListener('click', () => handleRoomClick(room));
            console.log(`[createRoomElement] Uğurlu - Element yaradıldı:`, li);
            return li; // Yaradılmış li elementini qaytar
        } catch (error) {
             console.error(`[createRoomElement] XƏTA baş verdi - Room ID: ${room?.id}`, error);
             return null; // Xəta olarsa null qaytar
        }
    }
    // -----------------------------------------

    // --- Otaq Siyahısını Göstərmə ---
    function displayRooms(roomsToDisplay) {
         console.log("Lobby: displayRooms funksiyası çağırıldı. Otaq sayı:", roomsToDisplay?.length ?? 0);
         if (!roomListContainer) { console.error("roomListContainer tapılmadı!"); return; }
         roomListContainer.innerHTML = '';
         if (!Array.isArray(roomsToDisplay)) { console.error("displayRooms: roomsToDisplay massiv deyil!"); checkIfRoomListEmpty([]); return; }

         if (roomsToDisplay.length === 0) { checkIfRoomListEmpty([]); }
         else {
             if (infoMessageArea) { infoMessageArea.style.display = 'none'; }
             roomsToDisplay.forEach((room, index) => {
                 console.log(`Lobby: Otaq ${index+1} üçün element yaradılır:`, room);
                 const li = createRoomElement(room); // Elementi yarat
                 if (li && li instanceof Node) { // Yalnız etibarlı elementdirsə əlavə et
                     try {
                         roomListContainer.appendChild(li);
                         requestAnimationFrame(() => { setTimeout(() => { li.classList.add('entering'); }, index * 50); });
                     } catch (appendError) {
                           console.error(`Lobby: appendChild zamanı XƏTA - Otaq ID: ${room?.id}`, appendError, li);
                     }
                 } else {
                      console.error(`Lobby: createRoomElement etibarsız dəyər qaytardı - Otaq ID: ${room?.id}. Element əlavə edilmir.`, li);
                 }
             });
             checkIfRoomListEmpty(roomsToDisplay);
         }
         console.log("Lobby: displayRooms funksiyası bitdi.");
     }
    // --------------------------

    // --- Otaq Siyahısı Boş Nəzarəti ---
    function checkIfRoomListEmpty(rooms) { /* ... */ } // (Əvvəlki kimi)
    // --------------------------

    // --- Otağa Klikləmə (AI Otağı Yönləndirməsi ilə) ---
    function handleRoomClick(room) { /* ... (əvvəlki v7 kodu kimi) ... */ }
    // -----------------------------------------------

    // RedirectToLogin funksiyası
    function redirectToLogin() { /* ... */ } // (Əvvəlki kimi)

    // === Socket.IO Hadisə Dinləyiciləri ===
    if(socket) {
        console.log("Lobby: Socket.IO hadisə dinləyiciləri əlavə edilir...");
        socket.on('connect', () => { /* ... (debug logları ilə əvvəlki kimi) ... */ });
        socket.on('disconnect', (reason) => { /* ... (debug logları ilə əvvəlki kimi) ... */ });
        socket.on('connect_error', (error) => { /* ... (debug logları ilə əvvəlki kimi) ... */ });
        socket.on('room_list_update', (roomListFromServer) => { /* ... (debug logları və try-catch ilə əvvəlki kimi) ... */ });
        socket.on('creation_error', (errorMessage) => { /* ... */ });
        socket.on('join_error', (errorMessage) => { /* ... */ });
        socket.on('room_joined', (data) => { /* ... */ });
        console.log("Lobby: Socket.IO hadisə dinləyiciləri əlavə edildi.");
    } else { console.error("Lobby: Socket obyekti mövcud deyil! Dinləyicilər əlavə edilə bilmir."); }
    // ========================================

    // === DOM Hadisə Dinləyiciləri (Listeners) ===
    // ... (əvvəlki v6/v7 kodu kimi, 'Yeni Oda Oluştur' klik logu daxil) ...
    // ========================================

     console.log("Lobby: DOMContentLoaded sonuna çatdı.");

}); // DOMContentLoaded Sonu