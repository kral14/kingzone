// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: v6 - Async/Auth Flow Fix

// DOMContentLoaded callback-ini async edirik
document.addEventListener('DOMContentLoaded', async () => {
    console.log("[DEBUG] Lobby JS: DOMContentLoaded baş verdi.");

    // ---- Qlobal Dəyişənlər ----
    let loggedInUser = null;
    let currentRooms = {};
    let socket = null;

    // ---- DOM Elementləri ----
    console.log("[DEBUG] Lobby JS: DOM elementləri seçilir...");
    // (DOM elementlərinin seçilməsi əvvəlki v5 kodu ilə eynidir, qısaltmaq üçün buraya daxil edilmir)
    const roomListContainer = document.getElementById('room-list-container');
    const infoMessageArea = document.getElementById('info-message-area');
    const welcomeText = document.getElementById('welcome-text');
    const createRoomButton = document.getElementById('create-room-button');
    const createRoomModal = document.getElementById('create-room-modal');
    const joinRoomModal = document.getElementById('join-room-modal');
    const newBoardSizeSelect = document.getElementById('new-board-size');
    const newRoomRuleDisplay = document.getElementById('new-room-rule-display');
    const closeButtons = document.querySelectorAll('.close-button');
    const joinRoomIdInput = document.getElementById('join-room-id');
    const joinRoomTitle = document.getElementById('join-room-title');
    const joinRoomPasswordInput = document.getElementById('join-room-password');
    const joinRoomMessage = document.getElementById('join-room-message');
    const joinRoomSubmitBtn = document.getElementById('join-room-submit-btn');
    const createRoomSubmitBtn = document.getElementById('create-room-submit-btn');
    const createRoomMessage = document.getElementById('create-room-message');
    // Yoxlayaq ki, əsas elementlər tapılıb
    if(!createRoomButton) console.error("[DEBUG] Lobby JS: create-room-button TAPILMADI!");
    if(!createRoomModal) console.error("[DEBUG] Lobby JS: create-room-modal TAPILMADI!");

    // ---- Yardımçı Funksiyalar ----
    // (escapeHtml, showModal, hideModal, showMsg, updateRoomRuleDisplay, createRoomElement,
    // checkIfRoomListEmpty, displayRooms, handleRoomClick funksiyaları əvvəlki v5 kodu ilə eynidir,
    // yer tutmamaq üçün təkrar yazılmır, amma kodda olmalıdırlar)
    function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return String(unsafe); return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
    function showModal(modalElement) { console.log("[DEBUG] showModal çağırıldı:", modalElement?.id); if (modalElement) { const messageElement = modalElement.querySelector('.message'); if (messageElement) { messageElement.textContent = ''; messageElement.className = 'message'; } modalElement.style.display = 'block'; const firstInput = modalElement.querySelector('input[type="text"], input[type="password"]'); if(firstInput && firstInput.type !== 'hidden') { setTimeout(() => firstInput.focus(), 50); } } else { console.error("[DEBUG] showModal: Modal elementi tapılmadı!"); } }
    function hideModal(modalElement) { console.log("[DEBUG] hideModal çağırıldı:", modalElement?.id); if (modalElement) { modalElement.style.display = 'none'; const form = modalElement.querySelector('form'); if(form) { form.reset(); console.log("[DEBUG] Modal formu resetləndi."); } else { const inputs = modalElement.querySelectorAll('input'); inputs.forEach(input => { if(input.type !== 'hidden' && input.type !== 'submit' && input.type !== 'button' && input.type !== 'checkbox' && input.type !== 'radio') { input.value = ''; } else if (input.type === 'checkbox' || input.type === 'radio'){ input.checked = false; } }); const selects = modalElement.querySelectorAll('select'); selects.forEach(select => select.selectedIndex = 0); console.log("[DEBUG] Modal inputları/selectləri təmizləndi."); } const messageElement = modalElement.querySelector('.message'); if (messageElement) { messageElement.textContent = ''; messageElement.className = 'message'; } } else { console.error("[DEBUG] hideModal: Modal elementi tapılmadı!"); } }
    function showMsg(element, message, type = 'error') { if (element) { element.textContent = message; element.className = `message ${type}`; } else { console.error(`[DEBUG] showMsg: Mesaj elementi tapılmadı. Mesaj: ${message}`); } }
    function updateRoomRuleDisplay() { console.log("[DEBUG] updateRoomRuleDisplay çağırıldı."); if (!newBoardSizeSelect || !newRoomRuleDisplay) { console.error("[DEBUG] updateRoomRuleDisplay: Select və ya display elementi tapılmadı!"); return; } const size = parseInt(newBoardSizeSelect.value, 10); let ruleText = ''; if (size === 3 || size === 4) { ruleText = "Qazanmaq üçün 3 xana yan-yana lazımdır."; } else if (size === 5 || size === 6) { ruleText = "Qazanmaq üçün 4 xana yan-yana lazımdır."; } newRoomRuleDisplay.textContent = ruleText; }
    function createRoomElement(room) { /* ... v5 kodu ... */ if (!room || typeof room !== 'object' || !room.id || typeof room.playerCount !== 'number' || !loggedInUser) { console.error("[DEBUG] createRoomElement XƏTA: Keçərsiz 'room' və ya 'loggedInUser'!", room, loggedInUser); return null; } try { const li = document.createElement('li'); li.classList.add('room-item'); li.dataset.roomId = room.id; li.dataset.roomName = room.name; const line1 = document.createElement('div'); line1.classList.add('room-item-line1'); const roomNameDiv = document.createElement('div'); roomNameDiv.classList.add('room-name'); const originalTextSpan = document.createElement('span'); originalTextSpan.classList.add('display-text', 'original-text'); originalTextSpan.textContent = escapeHtml(room.name); const hoverTextSpan = document.createElement('span'); hoverTextSpan.classList.add('display-text', 'hover-text'); const hoverTextContent = room.isAiRoom ? "SNOW ilə Oyna" : (room.playerCount < 2 ? "Otağa Qoşul" : "İzlə (tezliklə)"); hoverTextSpan.textContent = hoverTextContent; roomNameDiv.appendChild(originalTextSpan); roomNameDiv.appendChild(hoverTextSpan); roomNameDiv.addEventListener('mouseenter', () => { if (!room.isAiRoom && room.playerCount >= 2) return; roomNameDiv.classList.add('is-hovered'); }); roomNameDiv.addEventListener('mouseleave', () => { roomNameDiv.classList.remove('is-hovered'); }); const roomStatusDiv = document.createElement('div'); roomStatusDiv.classList.add('room-status'); const playersSpan = document.createElement('span'); playersSpan.classList.add('players'); const displayPlayerCount = room.isAiRoom ? Math.min(room.playerCount + 1, 2) : room.playerCount; playersSpan.textContent = room.isAiRoom ? `${displayPlayerCount}/2` : `${room.playerCount}/2`; roomStatusDiv.appendChild(playersSpan); if (room.hasPassword) { const lockIcon = document.createElement('i'); lockIcon.className = 'fas fa-lock lock-icon'; roomStatusDiv.appendChild(lockIcon); } const deleteButtonContainer = document.createElement('div'); if (!room.isAiRoom && room.creatorUsername === loggedInUser.nickname) { const deleteBtn = document.createElement('button'); deleteBtn.classList.add('delete-room-btn'); deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1h3.5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5"/></svg>`; deleteBtn.title = "Otağı Sil"; deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); if (confirm(`'${escapeHtml(room.name)}' otağını silmək istədiyinizə əminsiniz?`)) { if (socket && socket.connected) { console.log(`[DEBUG] Delete button clicked. Emitting 'delete_room' for ${room.id}`); socket.emit('delete_room', { roomId: room.id }); } else { alert("Serverlə bağlantı yoxdur."); } } }); deleteButtonContainer.appendChild(deleteBtn); } line1.appendChild(roomNameDiv); line1.appendChild(roomStatusDiv); line1.appendChild(deleteButtonContainer); const separator = document.createElement('div'); separator.classList.add('room-item-separator'); const line2 = document.createElement('div'); line2.classList.add('room-item-line2'); const playerNameDisplay = document.createElement('div'); playerNameDisplay.classList.add('player-name-display'); const p1NameSpan = document.createElement('span'); p1NameSpan.classList.add('player1-name'); p1NameSpan.textContent = room.player1Username ? escapeHtml(room.player1Username) : (room.isAiRoom ? 'Gözlənilir...' : 'Gözlənilir...'); const vsIconSpan = document.createElement('span'); vsIconSpan.classList.add('vs-icon'); vsIconSpan.innerHTML = `<svg viewBox="0 0 100 100"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="80" font-weight="bold" fill="currentColor">vs</text></svg>`; const p2NameSpan = document.createElement('span'); if (room.isAiRoom) { p2NameSpan.classList.add('player2-name'); p2NameSpan.textContent = "SNOW"; } else if (room.player2Username) { p2NameSpan.classList.add('player2-name'); p2NameSpan.textContent = escapeHtml(room.player2Username); } else { p2NameSpan.classList.add('empty-slot'); p2NameSpan.textContent = 'Boş Slot'; } playerNameDisplay.appendChild(p1NameSpan); playerNameDisplay.appendChild(vsIconSpan); playerNameDisplay.appendChild(p2NameSpan); line2.appendChild(playerNameDisplay); li.appendChild(line1); li.appendChild(separator); li.appendChild(line2); if (room.isAiRoom || room.playerCount < 2) { li.addEventListener('click', () => handleRoomClick(room)); li.style.cursor = 'pointer'; li.title = room.isAiRoom ? "SNOW ilə Oyna" : (room.playerCount < 2 ? "Otağa Qoşul" : ""); } else { li.style.cursor = 'not-allowed'; li.title = "Bu otaq doludur."; } return li; } catch (error) { console.error(`[DEBUG] createRoomElement XƏTASI baş verdi - Room ID: ${room?.id}`, error); return null; } }
    function checkIfRoomListEmpty(roomCount) { /* ... v5 kodu ... */ const infoMessageArea = document.getElementById('info-message-area'); if (!infoMessageArea) return; if (roomCount > 0) { infoMessageArea.style.display = 'none'; } else { infoMessageArea.textContent = 'Hazırda aktiv otaq yoxdur. Yeni bir otaq yaradın!'; infoMessageArea.style.display = 'block'; infoMessageArea.style.color = 'var(--subtle-text)'; } }
    function displayRooms(roomsToDisplay) { /* ... v5 kodu ... */ const roomListContainer = document.getElementById('room-list-container'); if (!roomListContainer) { console.error("roomListContainer tapılmadı!"); return; } const existingElements = {}; roomListContainer.querySelectorAll('.room-item[data-room-id]').forEach(el => { existingElements[el.dataset.roomId] = el; }); let currentRoomCount = 0; roomsToDisplay.forEach((room, index) => { currentRoomCount++; const existingElement = existingElements[room.id]; if (existingElement) { roomListContainer.removeChild(existingElement); const updatedElement = createRoomElement(room); if (updatedElement) { roomListContainer.appendChild(updatedElement); updatedElement.classList.add('entering'); } else { currentRoomCount--; } delete existingElements[room.id]; } else { const newElement = createRoomElement(room); if (newElement) { roomListContainer.appendChild(newElement); requestAnimationFrame(() => { setTimeout(() => { if(newElement.parentNode) newElement.classList.add('entering'); }, index * 30); }); } else { currentRoomCount--; } } }); Object.values(existingElements).forEach(elementToRemove => { elementToRemove.classList.remove('entering'); elementToRemove.classList.add('exiting'); setTimeout(() => { if (elementToRemove.parentNode) elementToRemove.parentNode.removeChild(elementToRemove); checkIfRoomListEmpty(roomListContainer.childElementCount); }, 350); }); checkIfRoomListEmpty(currentRoomCount); }
    function handleRoomClick(room) { /* ... v5 kodu ... */ console.log(`[DEBUG] handleRoomClick çağırıldı: Room ID=${room.id}, Şifrəli=${room.hasPassword}`); if (!socket || !socket.connected) { alert("Serverlə bağlantı yoxdur."); return; } if (!room || !room.id) { console.error("handleRoomClick: Keçərsiz otaq!"); return; } if (room.isAiRoom) { console.log(`AI otağı (${room.id}) artıq dəstəklənmir.`); alert("AI otaqları hazırda dəstəklənmir."); return; } if (room.playerCount >= 2) { console.warn("Dolu otağa klikləndi?"); return; } if (room.hasPassword) { if (joinRoomIdInput) joinRoomIdInput.value = room.id; if (joinRoomTitle) joinRoomTitle.textContent = `Otağa Qoşul: ${escapeHtml(room.name)}`; if (joinRoomPasswordInput) joinRoomPasswordInput.value = ''; if (joinRoomMessage) joinRoomMessage.textContent = ''; joinRoomMessage.className = 'message'; if(joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false; showModal(joinRoomModal); } else { console.log(`[DEBUG] Emitting 'join_room' for room ${room.id}`); socket.emit('join_room', { roomId: room.id }); } }

    // --- Socket.IO Bağlantısı Qurulumu ---
    function setupSocketConnection() { /* ... v5 kodu ... */ if (socket && socket.connected) { socket.disconnect(); } console.log("[DEBUG] Yeni Socket.IO bağlantısı qurulur..."); socket = io({ reconnectionAttempts: 5 }); socket.on('connect', () => { console.log('[DEBUG] Socket.IO Serverinə qoşuldu! ID:', socket.id); if (infoMessageArea) { infoMessageArea.textContent = 'Serverdən otaq siyahısı alınır...'; infoMessageArea.style.color = 'var(--subtle-text)';} }); socket.on('disconnect', (reason) => { console.warn('[DEBUG] Socket.IO bağlantısı kəsildi:', reason); if (infoMessageArea) { infoMessageArea.textContent = 'Serverlə bağlantı kəsildi...'; infoMessageArea.style.color = 'var(--warning-color)';} displayRooms([]); }); socket.on('connect_error', (error) => { console.error('[DEBUG] Socket.IO qoşulma xətası:', error.message); if (infoMessageArea) { infoMessageArea.textContent = 'Serverə qoşulmaq mümkün olmadı.'; infoMessageArea.style.color = 'var(--danger-color)';} displayRooms([]); }); socket.on('room_list_update', (roomsFromServer) => { /* ... v5 kodu ... */ console.log('[DEBUG] room_list_update alındı, Otaq sayı:', roomsFromServer?.length ?? 0); currentRooms = {}; if(Array.isArray(roomsFromServer)) { roomsFromServer.forEach(room => { if(room && room.id) currentRooms[room.id] = room; else console.warn("[DEBUG] Keçərsiz otaq datası:", room); }); displayRooms(Object.values(currentRooms)); } else { console.error("[DEBUG] room_list_update: Array gözlənilirdi!", roomsFromServer); displayRooms([]); } }); socket.on('creation_error', (errorMessage) => { console.error('[DEBUG] Otaq yaratma xətası:', errorMessage); showMsg(createRoomMessage, errorMessage, 'error'); if(createRoomSubmitBtn) createRoomSubmitBtn.disabled = false; }); socket.on('join_error', (errorMessage) => { console.error('[DEBUG] Otağa qoşulma xətası:', errorMessage); showMsg(joinRoomMessage, errorMessage, 'error'); if(joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false; }); socket.on('delete_error', (errorMessage) => { console.error('[DEBUG] Otaq silmə xətası:', errorMessage); alert(`Otaq silinərkən xəta: ${errorMessage}`); }); socket.on('room_joined', (data) => { console.log(`[DEBUG] Otağa uğurla qoşuldunuz: ${data.roomName} (${data.roomId})`); hideModal(joinRoomModal); const params = new URLSearchParams({ roomId: data.roomId, roomName: encodeURIComponent(data.roomName), size: data.boardSize }); window.location.href = `../game/oda_ici.html?${params.toString()}`; }); console.log("[DEBUG] Socket listeners quraşdırıldı."); }

    // ---- Event Listenerları Quraşdırma Funksiyası ----
    function attachLobbyEventListeners() {
        console.log("[DEBUG] Lobby event listenerları quraşdırılır...");
        if (createRoomButton && createRoomModal) {
            createRoomButton.addEventListener('click', () => {
                console.log("[DEBUG] 'Yeni Oda Oluştur' düyməsinə klikləndi!");
                const nameInput = document.getElementById('new-room-name');
                const passInput = document.getElementById('new-room-password');
                const sizeSelect = document.getElementById('new-board-size');
                if(nameInput) nameInput.value = ''; if(passInput) passInput.value = ''; if(sizeSelect) sizeSelect.value = '3';
                if(createRoomMessage) createRoomMessage.textContent = ''; createRoomMessage.className = 'message';
                if(createRoomSubmitBtn) createRoomSubmitBtn.disabled = false;
                updateRoomRuleDisplay(); showModal(createRoomModal);
            });
            console.log("[DEBUG] 'Yeni Oda Oluştur' düyməsinə listener qoşuldu.");
        } else { console.error("[DEBUG] 'Yeni Oda Oluştur' düyməsi və ya modal pəncərə DOM-da tapılmadı!"); }
        if (closeButtons.length > 0) { closeButtons.forEach(button => { button.addEventListener('click', () => { const modalId = button.getAttribute('data-modal-id'); console.log(`[DEBUG] Close button clicked for modal: ${modalId}`); if (modalId) { const modalToClose = document.getElementById(modalId); if (modalToClose) { hideModal(modalToClose); } else { console.error(`[DEBUG] Modal with ID ${modalId} not found to close.`); } } }); }); console.log(`[DEBUG] ${closeButtons.length} ədəd modal bağlama düyməsinə listener qoşuldu.`); } else { console.warn("[DEBUG] Modal bağlama düymələri tapılmadı."); }
        window.addEventListener('click', (event) => { if (event.target === createRoomModal) { console.log("[DEBUG] Click outside Create Room Modal detected."); hideModal(createRoomModal); } if (event.target === joinRoomModal) { console.log("[DEBUG] Click outside Join Room Modal detected."); hideModal(joinRoomModal); } }); console.log("[DEBUG] Window click listener for modals added.");
        if (createRoomSubmitBtn) { createRoomSubmitBtn.addEventListener('click', () => { console.log("[DEBUG] Create Room Submit button clicked."); if (!socket || !socket.connected) { showMsg(createRoomMessage, 'Serverlə bağlantı yoxdur!', 'error'); return; } const nameInput = document.getElementById('new-room-name'); const passInput = document.getElementById('new-room-password'); const sizeSelect = document.getElementById('new-board-size'); const roomName = nameInput.value.trim(); const roomPassword = passInput.value; const boardSize = sizeSelect.value; if (!roomName) { showMsg(createRoomMessage, 'Otaq adı boş ola bilməz.', 'error'); return; } if (roomPassword && roomPassword.length > 0) { if (roomPassword.length < 2 ) { showMsg(createRoomMessage, 'Şifrə minimum 2 simvol olmalıdır.', 'error'); return; } } console.log(`[DEBUG] Emitting 'create_room': Name='${roomName}', Pass='${roomPassword ? '***' : null}', Size=${boardSize}`); showMsg(createRoomMessage, 'Otaq yaradılır...', 'info'); createRoomSubmitBtn.disabled = true; socket.emit('create_room', { name: roomName, password: roomPassword || null, boardSize: boardSize }); setTimeout(() => { if(createRoomSubmitBtn && createRoomSubmitBtn.disabled) { console.warn("[DEBUG] Create room response timeout."); showMsg(createRoomMessage, 'Serverdən cavab gecikir...', 'warning'); createRoomSubmitBtn.disabled = false; } }, 7000); }); console.log("[DEBUG] Listener attached to createRoomSubmitBtn."); } else { console.error("[DEBUG] Create Room Submit Button tapılmadı!"); }
        if (joinRoomSubmitBtn) { joinRoomSubmitBtn.addEventListener('click', () => { console.log("[DEBUG] Join Room Submit button clicked."); if (!socket || !socket.connected) { showMsg(joinRoomMessage, 'Serverlə bağlantı yoxdur!', 'error'); return; } const roomId = joinRoomIdInput.value; const password = joinRoomPasswordInput.value; if (!roomId) { showMsg(joinRoomMessage, 'Otaq ID tapılmadı.', 'error'); return; } if (!password) { showMsg(joinRoomMessage, 'Şifrəni daxil edin.', 'error'); return; } console.log(`[DEBUG] Emitting 'join_room' (with pass): RoomID=${roomId}`); showMsg(joinRoomMessage, 'Otağa qoşulunur...', 'info'); joinRoomSubmitBtn.disabled = true; socket.emit('join_room', { roomId: roomId, password: password }); setTimeout(() => { if(joinRoomSubmitBtn && joinRoomSubmitBtn.disabled) { console.warn("[DEBUG] Join room response timeout."); showMsg(joinRoomMessage, 'Serverdən cavab gecikir...', 'warning'); joinRoomSubmitBtn.disabled = false; } }, 7000); }); console.log("[DEBUG] Listener attached to joinRoomSubmitBtn."); } else { console.error("[DEBUG] Join Room Submit Button tapılmadı!"); }
        if(newBoardSizeSelect) { newBoardSizeSelect.addEventListener('change', updateRoomRuleDisplay); updateRoomRuleDisplay(); console.log("[DEBUG] Listener attached to newBoardSizeSelect."); } else { console.error("[DEBUG] newBoardSizeSelect tapılmadı!"); }
        console.log("[DEBUG] Bütün lobby event listenerlarının qoşulması cəhdi bitdi.");
    } // attachLobbyEventListeners sonu


    // ===== ƏSAS BAŞLANĞIC MƏNTİQİ =====
    console.log("[DEBUG] Lobby JS: Əsas başlanğıc məntiqi başlayır.");
    try {
        console.log("[DEBUG] Lobby: /check-auth sorğusu göndərilir...");
        const response = await fetch('/check-auth'); // credentials: 'include' silindi
        console.log("[DEBUG] Lobby: /check-auth cavabı alındı. Status:", response.status);

        let data;
        try {
            data = await response.json();
        } catch (jsonError) {
             console.error("[DEBUG] Lobby JS: /check-auth cavabı JSON deyil!", jsonError);
             console.error("[DEBUG] Server response text:", await response.text());
             throw new Error(`Serverdən düzgün cavab alınmadı (${response.status})`);
        }

        if (!response.ok || !data.loggedIn || !data.user) {
            console.warn("[DEBUG] Lobby JS: Giriş edilməyib və ya auth xətası. Login səhifəsinə yönləndirilir. Data:", data);
            window.location.href = '/ANA SEHIFE/login/login.html';
            // Yönləndirmədən sonra kodun davam etməməsi üçün return əlavə edək
            return;
        }

        // Autentifikasiya uğurlu oldu
        loggedInUser = data.user;
        console.log(`[DEBUG] Lobby JS: Autentifikasiya uğurlu: ${loggedInUser.nickname}`);
        if (userInfoPlaceholder) userInfoPlaceholder.textContent = `İstifadəçi: ${escapeHtml(loggedInUser.nickname)}`;
        if (welcomeText) welcomeText.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUser.nickname)}</strong>! Oyuna qatmaq üçün otaq seçin və ya yenisini yaradın.`;

        // Auth uğurlu olduqdan sonra Socket və Listenerları quraşdır
        setupSocketConnection();
        attachLobbyEventListeners();

        console.log("[DEBUG] Lobby JS: Autentifikasiya, socket və listenerlar uğurla quraşdırıldı.");

    } catch (error) {
        console.error("[DEBUG] Lobby JS: Başlanğıc zamanı KÖK XƏTA:", error);
        alert(`Lobby yüklənərkən xəta baş verdi. Serverə qoşulmaq mümkün olmaya bilər.\n\nXəta: ${error.message}`);
        if (userInfoPlaceholder) { userInfoPlaceholder.textContent = "Xəta!"; userInfoPlaceholder.style.color = "var(--danger-color)"; }
        if (infoMessageArea) { infoMessageArea.textContent = "Lobby yüklənərkən xəta baş verdi."; infoMessageArea.style.color = "var(--danger-color)"; }
    }

    console.log("[DEBUG] Lobby JS faylının sonu.");

}); // DOMContentLoaded Sonu