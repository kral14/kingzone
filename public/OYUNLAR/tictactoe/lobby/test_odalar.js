// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Socket.IO + Session Auth (v4 - AI Room Click Fix + Disconnect Listener)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Test Odalar JS (v4 - AI Fix + Disconnect) Başladı.");

    let loggedInUser = null;
    let currentRooms = [];
    let socket = null;

    // ===== GİRİŞ YOXLAMASI =====
    try {
        console.log("Lobby: /check-auth sorğusu göndərilir...");
        const response = await fetch('/check-auth', { credentials: 'include' });
        const data = await response.json();
        if (!response.ok || !data.loggedIn) {
            console.log("Lobby: Giriş edilməyib, loginə yönləndirilir...");
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
    const roomListContainer = document.getElementById('room-list-container');
    const infoMessageArea = document.getElementById('info-message-area');
    const createRoomButton = document.getElementById('create-room-button');
    const userInfoPlaceholder = document.getElementById('user-info-placeholder');
    // Modallar
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
    // --------------------------

    // --- Socket.IO Bağlantısı ---
    try {
        console.log("Socket.IO serverinə qoşulmağa cəhd edilir...");
        socket = io({ /* reconnection options etc. if needed */ });
    } catch (e) {
        console.error("Socket.IO obyekti yaradılarkən xəta:", e);
        showMsg(infoMessageArea, 'Real-time serverə qoşulmaq mümkün olmadı.', 'error', 0);
        return;
    }
    // --------------------------

    // --- Yardımçı Funksiyalar ---
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'info', duration = 4000) => {
         if (!el) return;
         let color = '#d1ecf1'; let bgColor = 'rgba(23, 162, 184, 0.7)'; let borderColor = '#17a2b8';
         if (type === 'error') { color = '#f8d7da'; bgColor = 'rgba(220, 53, 69, 0.7)'; borderColor = '#dc3545'; }
         else if (type === 'success') { color = '#d4edda'; bgColor = 'rgba(40, 167, 69, 0.7)'; borderColor = '#28a745'; }
         else if (type === 'warning') { color = '#fff3cd'; bgColor = 'rgba(255, 193, 7, 0.7)'; borderColor = '#ffc107'; }

         el.textContent = msg;
         el.style.display = 'block';
         el.style.padding = '10px';
         el.style.marginTop = '15px';
         el.style.marginBottom = '10px';
         el.style.borderRadius = '5px';
         el.style.border = `1px solid ${borderColor}`;
         el.style.color = color;
         el.style.backgroundColor = bgColor;
         el.className = `message ${type}`;

         if (el.timeoutId) clearTimeout(el.timeoutId);
         if (duration > 0) {
             el.timeoutId = setTimeout(() => {
                 if (el.textContent === msg) {
                     el.textContent = ''; el.style.display = 'none';
                     el.className = 'message'; el.removeAttribute('style');
                 }
             }, duration);
         }
     };
    function escapeHtml(unsafe) { /* ... */ } // (Əvvəlki kimi)
    function updateRuleDisplay(selectElement, displayElement) { /* ... */ } // (Əvvəlki kimi)
    function addPlayerHoverListeners(playerSpan) { /* ... */ } // (Əvvəlki kimi)
    // --------------------------

    // --- Header İstifadəçi Məlumatları ---
    if (userInfoPlaceholder) { /* ... */ } // (Əvvəlki kimi)
    // -----------------------------

    // --- Otaq Elementi Yaratma Funksiyası (YENİLƏNMİŞ - AI Otaq Sayı Göstərimi) ---
    function createRoomElement(room) {
        const li = document.createElement('li');
        li.classList.add('room-item');
        li.dataset.roomId = room.id;
        if (room.isAiRoom) { li.classList.add('ai-room'); }

        // AI otağında həmişə 1 rəqib (SNOW) var kimi göstərək
        const displayPlayerCount = room.isAiRoom ? 1 : (room.playerCount || 0);
        const maxPlayers = 2;
        const boardSizeText = room.boardSize ? `${room.boardSize}x${room.boardSize}` : '3x3';
        const creatorUsername = room.isAiRoom ? "SNOW" : (room.creatorUsername || 'Naməlum');

        // Line 1: Oda Adı ve Status
        const line1Div = document.createElement('div'); line1Div.className = 'room-item-line1';
        const roomNameSpan = document.createElement('span'); roomNameSpan.className = 'room-name';
        // ... (Oda adı üçün original-text, hover-text əlavə etmə - əvvəlki kimi) ...
        roomNameSpan.innerHTML = `<span class="display-text original-text">${escapeHtml(room.name)}</span><span class="display-text hover-text">Qurucu: ${escapeHtml(creatorUsername)}</span>`;
        roomNameSpan.addEventListener('mouseenter', () => roomNameSpan.classList.add('is-hovered'));
        roomNameSpan.addEventListener('mouseleave', () => roomNameSpan.classList.remove('is-hovered'));
        line1Div.appendChild(roomNameSpan);

        const statusDiv = document.createElement('div'); statusDiv.className = 'room-status';
        statusDiv.innerHTML += `<span class="players" title="Lövhə Ölçüsü">${boardSizeText}</span>`;
        if (room.hasPassword) { statusDiv.innerHTML += `<span class="lock-icon" title="Şifrə ilə qorunur">🔒</span>`; }
        // <<< DÜZƏLİŞ: Oyunçu sayı AI üçün həmişə 1/2 göstərilir >>>
        const playerCountText = `${displayPlayerCount}/${maxPlayers}`;
        statusDiv.innerHTML += `<span class="players" title="Oyunçular">${playerCountText}</span>`;
        line1Div.appendChild(statusDiv);
        li.appendChild(line1Div);

        // Ayırıcı Xətt
        const separatorDiv = document.createElement('div'); separatorDiv.className = 'room-item-separator'; li.appendChild(separatorDiv);

        // Line 2: Oyunçular
        const line2Div = document.createElement('div'); line2Div.className = 'room-item-line2';
        const playerDisplayDiv = document.createElement('div'); playerDisplayDiv.className = 'player-name-display';

        if (room.isAiRoom) {
            playerDisplayDiv.innerHTML = `<span class="player1-name">(Sən)</span>
                                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-robot vs-icon" viewBox="0 0 16 16">...</svg> <span class="player2-name">SNOW</span>`;
        } else {
            // Normal otaq üçün oyunçu göstərimi (əvvəlki kimi)
            if (room.player1Username) { playerDisplayDiv.innerHTML += `<span class="player1-name">${escapeHtml(room.player1Username)}</span>`; } else { playerDisplayDiv.innerHTML += `<span class="empty-slot">(Boş)</span>`; }
            if (room.player1Username || room.player2Username) { playerDisplayDiv.innerHTML += ` <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-swords vs-icon" viewBox="0 0 16 16">...</svg> `; } // Qılınc ikonu
            if (room.player2Username) { playerDisplayDiv.innerHTML += `<span class="player2-name">${escapeHtml(room.player2Username)}</span>`; } else if (room.player1Username) { playerDisplayDiv.innerHTML += `<span class="empty-slot">(Boş)</span>`; }
            if (!room.player1Username && !room.player2Username) { playerDisplayDiv.innerHTML = `<span class="empty-slot">(Otaq Boşdur)</span>`; }
            // Hover listenerlarını əlavə et (əgər lazımdırsa)
             playerDisplayDiv.querySelectorAll('.player1-name, .player2-name').forEach(addPlayerHoverListeners);
        }
        line2Div.appendChild(playerDisplayDiv);
        li.appendChild(line2Div);

        // Otağa klikləmə hadisəsi
        li.addEventListener('click', () => handleRoomClick(room));
        return li;
    }
    // -----------------------------------------

    // --- Otaq Siyahısını Göstərmə ---
    function displayRooms(roomsToDisplay) { /* ... */ } // (Əvvəlki kimi)
    // --------------------------

    // --- Otaq Siyahısı Boş Nəzarəti ---
    function checkIfRoomListEmpty(rooms) { /* ... */ } // (Əvvəlki kimi)
    // --------------------------

    // --- Otağa Klikləmə (YENİLƏNMİŞ - AI Otağı üçün Yönləndirmə) ---
    function handleRoomClick(room) {
        if (!room || !room.id) { console.error("Keçərsiz otaq obyekti:", room); return; }
        console.log(`Otağa klikləndi: ${room.name} (ID: ${room.id}, AI: ${!!room.isAiRoom})`, room);

        // <<< YENİLƏNMİŞ HİSSƏ >>>
        // 1. AI Otağıdırsa
        if (room.isAiRoom) {
             console.log(`AI otağına (${room.name}) klikləndi. Oyuna yönləndirilir...`);
             try {
                 const roomNameParam = encodeURIComponent(room.name || 'AI Otağı');
                 const playerNameParam = encodeURIComponent(loggedInUsername);
                 const boardSize = room.boardSize || 3;
                 // URL-ə ai=SNOW parametrini əlavə edirik
                 const gameUrl = `../game/oda_ici.html?roomId=${room.id}&roomName=${roomNameParam}&playerName=${playerNameParam}&size=${boardSize}&ai=SNOW`;
                 console.log("Yönləndirmə URL:", gameUrl);
                 // Eyni pəncərədə yönləndir
                 window.location.href = gameUrl;
             } catch (e) {
                 console.error("AI oyununa yönləndirmə xətası:", e);
                 showMsg(infoMessageArea, 'AI oyununa keçid zamanı xəta.', 'error');
             }
             return; // AI otağı üçün proses bitdi
        }
        // <<< YENİLƏNMİŞ HİSSƏ SONU >>>

        // 2. Normal İstifadəçi Otağıdırsa (qalan kod əvvəlki kimi)
        if (room.playerCount >= 2 && !room.players?.includes(socket?.id)) { // Otaqdakı oyunçuları yoxlamaq daha dəqiqdir
             showMsg(infoMessageArea, `'${escapeHtml(room.name)}' otağı doludur.`, 'error');
             return;
        }
        if (room.players?.includes(socket?.id)) {
             console.log(`İstifadəçi (${loggedInUsername}) artıq ${room.name} otağındadır. Oyun səhifəsinə yönləndirilir...`);
             try {
                  const roomNameParam = encodeURIComponent(room.name); const playerNameParam = encodeURIComponent(loggedInUsername);
                  const boardSize = room.boardSize || 3;
                  window.location.href = `../game/oda_ici.html?roomId=${room.id}&roomName=${roomNameParam}&playerName=${playerNameParam}&size=${boardSize}`;
             } catch (e) { console.error("Oyun səhifəsinə təkrar yönləndirmə xətası:", e); showMsg(infoMessageArea, 'Oyun səhifəsinə keçid zamanı xəta.', 'error'); }
             return;
         }
        if (room.hasPassword) {
            console.log("Şifrəli otaq, qoşulma modalı açılır.");
            if(joinRoomTitle) joinRoomTitle.textContent = `'${escapeHtml(room.name)}' otağına qoşul`;
            if(joinRoomIdInput) joinRoomIdInput.value = room.id;
            if(joinRoomPasswordInput) joinRoomPasswordInput.value = '';
            if(joinRoomMessage) { joinRoomMessage.textContent = ''; joinRoomMessage.className='message'; joinRoomMessage.removeAttribute('style'); joinRoomMessage.style.display = 'none'; }
            if(joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false;
            showModal(joinRoomModal);
            joinRoomPasswordInput?.focus();
        } else {
            console.log(`Serverə 'join_room' tələbi göndərilir: Room ID = ${room.id}`);
            showMsg(infoMessageArea, `'${escapeHtml(room.name)}' otağına qoşulunur...`, 'info', 0);
            if(socket && socket.connected) { socket.emit('join_room', { roomId: room.id }); }
            else { console.error("Socket bağlantısı yoxdur!"); showMsg(infoMessageArea, 'Serverlə bağlantı yoxdur.', 'error'); }
        }
    }
    // -----------------------------------------------

    // RedirectToLogin funksiyası
    function redirectToLogin() { /* ... */ } // (Əvvəlki kimi)

    // --- Başlanğıc Konfiqurasiyası ---
    if (infoMessageArea) infoMessageArea.textContent = 'Serverə qoşulunur...';
    updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay);
    // ---------------------------------

    // === Socket.IO Hadisə Dinləyiciləri ===
    if(socket) {
        socket.on('connect', () => { /* ... */ }); // (Əvvəlki kimi)

        // <<< YENİLƏNMİŞ disconnect dinləyicisi >>>
        socket.on('disconnect', (reason) => {
            console.error('############################################');
            console.error('###### SOCKET BAĞLANTISI KƏSİLDİ! ######');
            console.error('############################################');
            console.error('Səbəb (Reason):', reason);
            if (reason === 'io server disconnect') { console.warn('Server bağlantını kəsdi.'); }
            else if (reason === 'ping timeout') { console.warn('Ping timeout.'); }
            else if (reason === 'transport close') { console.warn('Transport bağlandı.'); }
            else if (reason === 'transport error') { console.error('Transport xətası.'); }
            else { console.log('Digər səbəb:', reason); }
            showMsg(infoMessageArea, `Serverlə əlaqə kəsildi (${reason}). Yenilənmə tələb oluna bilər.`, 'error', 0);
        });
        // <<< ------------------------------ >>>

        socket.on('connect_error', (error) => { /* ... */ }); // (Əvvəlki kimi)
        socket.on('room_list_update', (roomListFromServer) => { /* ... */ }); // (Əvvəlki kimi, amma displayRooms çağırır)
        socket.on('creation_error', (errorMessage) => { /* ... */ }); // (Əvvəlki kimi)
        socket.on('join_error', (errorMessage) => { /* ... */ }); // (Əvvəlki kimi)
        socket.on('room_joined', (data) => { /* ... */ }); // (Əvvəlki kimi)

    } else { console.error("Socket obyekti mövcud deyil!"); }
    // ========================================

    // === DOM Hadisə Dinləyiciləri (Listeners) ===
    if (createRoomButton) { createRoomButton.addEventListener('click', () => { /* ... */ }); } else { console.error("createRoomButton tapılmadı!"); }
    if (newBoardSizeSelect) { newBoardSizeSelect.addEventListener('change', () => { updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay); }); }
    if (createRoomSubmitBtn) { createRoomSubmitBtn.addEventListener('click', () => { /* ... */ }); } else { console.error("createRoomSubmitBtn tapılmadı!"); }
    if (joinRoomSubmitBtn) { joinRoomSubmitBtn.addEventListener('click', () => { /* ... */ }); } else { console.error("joinRoomSubmitBtn tapılmadı!"); }
    closeButtons.forEach(button => { button.addEventListener('click', () => { /* ... (mesaj təmizləmə ilə) */ }); });
    window.addEventListener('click', (event) => { if (event.target.classList.contains('modal')) { /* ... (mesaj təmizləmə ilə) */ } });
    newRoomNameInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoomSubmitBtn?.click(); });
    newRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoomSubmitBtn?.click(); });
    joinRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinRoomSubmitBtn?.click(); });
    // ========================================

}); // DOMContentLoaded Sonu