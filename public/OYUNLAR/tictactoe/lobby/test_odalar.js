// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Socket.IO + Session Auth (Tam Kod)

document.addEventListener('DOMContentLoaded', async () => { // async etdik
    console.log("Test Odalar JS (vX - Session Auth) Başladı.");

    let loggedInUser = null; // Giriş etmiş istifadəçi məlumatları burada saxlanacaq
    let currentRooms = [];
    let socket = null; // Socket obyektini qlobal edək

    // ===== GİRİŞ YOXLAMASI (Session ilə) =====
    try {
        const response = await fetch('/check-auth'); // Serverə yoxlama sorğusu
        const data = await response.json();
        if (!response.ok || !data.loggedIn) {
            console.log("Giriş edilməyib (check-auth), login səhifəsinə yönləndirilir...");
            // Yolun düzgün olduğundan əmin olun (test_odalar.html-dən login.html-ə)
            window.location.href = '../../ANA SEHIFE/login/login.html';
            return; // Scriptin qalanı işləməsin
        }
        // Giriş edilib, istifadəçi məlumatları data.user obyektindədir
        loggedInUser = data.user; // İstifadəçi məlumatlarını qlobal dəyişənə yazırıq
        console.log(`Giriş edilib: ${loggedInUser.nickname}`);

    } catch (error) {
        console.error("Auth yoxlama xətası:", error);
        window.location.href = '../../ANA SEHIFE/login/login.html'; // Xəta olarsa da girişə yönləndir
        return;
    }
    // =======================================

    // Giriş yoxlaması uğurlu olubsa, qalan kod işə düşür
    const loggedInUsername = loggedInUser.nickname; // Qlobal nickname-i alaq

    // --- DOM Elementləri ---
    const roomListContainer = document.getElementById('room-list-container');
    const infoMessageArea = document.getElementById('info-message-area');
    const createRoomButton = document.getElementById('create-room-button');
    const userControlsDiv = document.getElementById('user-controls'); // Header-dəki div (Əgər bu faylda istifadə olunursa)
    // Modal Elementləri
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
     // Giriş yoxlamasından SONRA qoşuluruq
     try {
         console.log("Socket.IO serverinə qoşulmağa cəhd edilir...");
         // Socket.IO server tərəfində session middleware istifadə etdiyi üçün,
         // qoşulma zamanı cookie avtomatik göndəriləcək və server istifadəçini tanıyacaq.
         socket = io(); // Qlobal dəyişənə mənimsədək
     } catch (e) {
          console.error("Socket.IO obyekti yaradılarkən xəta:", e);
          showMsg(infoMessageArea, 'Real-time serverə qoşulmaq mümkün olmadı.', 'error', 0);
          return; // Qoşulma uğursuzdursa, davam etmə
     }
     // --------------------------


    // --- Yardımçı Funksiyalar ---
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'info', duration = 4000) => {
        if (!el) return;
        el.textContent = msg; el.className = `message ${type}`;
        if (el.timeoutId) clearTimeout(el.timeoutId);
        if (duration > 0) { el.timeoutId = setTimeout(() => { if (el.textContent === msg) { el.textContent = ''; el.className = 'message'; } }, duration); }
    };
    function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return String(unsafe); return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
    function updateRuleDisplay(selectElement, displayElement) { /* ... əvvəlki kimi ... */
        if (!selectElement || !displayElement) return; const size = parseInt(selectElement.value, 10); let text = ''; switch (size) { case 3: text = "3x3 - Asan Mod - Qazanmaq: 3 simvol"; break; case 4: text = "4x4 - Orta Mod - Qazanmaq: 3 simvol"; break; case 5: text = "5x5 - Çətin Mod - Qazanmaq: 4 simvol"; break; case 6: text = "6x6 - Çox Çətin Mod - Qazanmaq: 4 simvol"; break; default: text = "Lövhə ölçüsünü seçin."; break; } displayElement.textContent = text;
    }
    function addPlayerHoverListeners(playerSpan) { /* ... əvvəlki kimi ... */
        if (!playerSpan) return; playerSpan.addEventListener('mouseenter', () => playerSpan.classList.add('is-hovered-player')); playerSpan.addEventListener('mouseleave', () => playerSpan.classList.remove('is-hovered-player'));
    }
    // --------------------------

    // --- Profil/Header Funksiyaları (Əgər bu səhifədə də varsa) ---
    // Bu səhifənin HTML-ində də oyunlar.html-dəki kimi header strukturu olmalıdır
    // function renderUserProfileHeader(user) { /* ... oyunlar.js-dən götürülə bilər ... */ }
    // function setupLogoutButton() { /* ... oyunlar.js-dən götürülə bilər ... */ }
    // function setupProfileButton() { /* ... oyunlar.js-dən götürülə bilər ... */ }
    // Header-də xoş gəldin mesajını yeniləyək (əgər varsa)
    const headerWelcome = document.getElementById('welcome-player-header'); // HTML-də belə bir ID varsa
    if (headerWelcome) {
        headerWelcome.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUsername)}</strong>! `;
        // Burada da profil/çıxış düymələri üçün listener əlavə etmək olar
    }
    // -----------------------------


    // --- Otaq Elementi Yaratma Funksiyası ---
    // Bu funksiya içində loggedInUsername qlobal dəyişənini istifadə edir
    function createRoomElement(room) { /* ... əvvəlki kimi ... */
        const li = document.createElement('li'); li.classList.add('room-item'); li.dataset.roomId = room.id;
        const isCreator = room.creatorUsername === loggedInUsername; const playerCount = room.playerCount || 0; const boardSizeText = room.boardSize ? `${room.boardSize}x${room.boardSize}` : '3x3'; const creatorUsername = room.creatorUsername || 'Naməlum';
        const line1Div = document.createElement('div'); line1Div.className = 'room-item-line1'; const roomNameSpan = document.createElement('span'); roomNameSpan.className = 'room-name'; const originalNameTextSpan = document.createElement('span'); originalNameTextSpan.className = 'display-text original-text'; originalNameTextSpan.textContent = escapeHtml(room.name); const hoverNameTextSpan = document.createElement('span'); hoverNameTextSpan.className = 'display-text hover-text'; hoverNameTextSpan.textContent = `Qurucu: ${escapeHtml(creatorUsername)}`; roomNameSpan.appendChild(originalNameTextSpan); roomNameSpan.appendChild(hoverNameTextSpan); roomNameSpan.addEventListener('mouseenter', () => roomNameSpan.classList.add('is-hovered')); roomNameSpan.addEventListener('mouseleave', () => roomNameSpan.classList.remove('is-hovered')); line1Div.appendChild(roomNameSpan);
        const statusDiv = document.createElement('div'); statusDiv.className = 'room-status'; statusDiv.innerHTML += `<span class="players" title="Lövhə Ölçüsü">${boardSizeText}</span>`; if (room.hasPassword) { statusDiv.innerHTML += `<span class="lock-icon" title="Şifrə ilə qorunur">🔒</span>`; } statusDiv.innerHTML += `<span class="players" title="Oyunçular">${playerCount}/2</span>`; line1Div.appendChild(statusDiv);
        const separatorDiv = document.createElement('div'); separatorDiv.className = 'room-item-separator';
        const line2Div = document.createElement('div'); line2Div.className = 'room-item-line2'; const playerDisplayDiv = document.createElement('div'); playerDisplayDiv.className = 'player-name-display';
        if (room.player1Username) { const p1Span = document.createElement('span'); p1Span.className = 'player1-name'; p1Span.textContent = escapeHtml(room.player1Username); addPlayerHoverListeners(p1Span); playerDisplayDiv.appendChild(p1Span); } else { playerDisplayDiv.insertAdjacentHTML('beforeend', `<span class="empty-slot">(Boş)</span>`); }
        if (room.player1Username || room.player2Username) { playerDisplayDiv.insertAdjacentHTML('beforeend', ` <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-swords vs-icon" viewBox="0 0 16 16"> <path d="M1.746 8.032a.5.5 0 0 1 .478-.736l5-1.5a.5.5 0 0 1 .666.478l-1.5 5a.5.5 0 0 1-.478.666l-5 1.5a.5.5 0 0 1-.666-.478l1.5-5z"/> <path d="M14.254 8.968a.5.5 0 0 1-.478.736l-5 1.5a.5.5 0 0 1-.666-.478l1.5-5a.5.5 0 0 1 .478-.666l5-1.5a.5.5 0 0 1 .666.478l-1.5 5z"/> </svg> `); }
        if (room.player2Username) { const p2Span = document.createElement('span'); p2Span.className = 'player2-name'; p2Span.textContent = escapeHtml(room.player2Username); addPlayerHoverListeners(p2Span); playerDisplayDiv.appendChild(p2Span); } else if (room.player1Username) { playerDisplayDiv.insertAdjacentHTML('beforeend', `<span class="empty-slot">(Boş)</span>`); }
        if (!room.player1Username && !room.player2Username) { playerDisplayDiv.innerHTML = `<span class="empty-slot">(Otaq Boşdur)</span>`; }
        line2Div.appendChild(playerDisplayDiv); li.appendChild(line1Div); li.appendChild(separatorDiv); li.appendChild(line2Div); li.addEventListener('click', () => handleRoomClick(room)); return li;
    }
    // --------------------------

    // --- Otaq Siyahısını Göstərmə ---
    function displayRooms(roomsToDisplay) { /* ... əvvəlki kimi ... */
        if (!roomListContainer) { console.error("roomListContainer tapılmadı!"); return; } console.log("Otaqlar göstərilir:", roomsToDisplay); roomListContainer.innerHTML = ''; if (!Array.isArray(roomsToDisplay)) { console.error("Göstəriləcək otaqlar massiv deyil:", roomsToDisplay); checkIfRoomListEmpty([]); return; } if (roomsToDisplay.length === 0) { checkIfRoomListEmpty([]); } else { if (infoMessageArea) infoMessageArea.style.display = 'none'; roomsToDisplay.forEach((room, index) => { try { const li = createRoomElement(room); roomListContainer.appendChild(li); requestAnimationFrame(() => { setTimeout(() => { li.classList.add('entering'); }, index * 50); }); } catch(e) { console.error(`Otaq elementi yaradılarkən xəta (index ${index}, room: ${JSON.stringify(room)}):`, e); } }); checkIfRoomListEmpty(roomsToDisplay); }
    }
    // --------------------------

    // --- Otaq Siyahısı Boş Nəzarəti ---
    function checkIfRoomListEmpty(rooms) { /* ... əvvəlki kimi ... */
        if (!infoMessageArea) return; const userRoomCount = rooms.filter(r => !r.isAiRoom).length; if (userRoomCount === 0) { infoMessageArea.textContent = 'Aktiv istifadəçi otağı tapılmadı. Yeni otaq yaradın!'; infoMessageArea.style.display = 'block'; } else { infoMessageArea.style.display = 'none'; }
    }
    // --------------------------

    // --- Otağa Klikləmə ---
    function handleRoomClick(room) { /* ... əvvəlki kimi ... */
        if (!room || !room.id) { console.error("Keçərsiz otaq obyekti:", room); return; } console.log(`Otağa klikləndi: ${room.name} (ID: ${room.id})`, room); if (room.playerCount >= 2) { showMsg(infoMessageArea, `'${escapeHtml(room.name)}' otağı doludur.`, 'error'); return; } if (room.hasPassword) { console.log("Şifrəli otaq, qoşulma modalı açılır."); if(joinRoomTitle) joinRoomTitle.textContent = `'${escapeHtml(room.name)}' otağına qoşul`; if(joinRoomIdInput) joinRoomIdInput.value = room.id; if(joinRoomPasswordInput) joinRoomPasswordInput.value = ''; if(joinRoomMessage) { joinRoomMessage.textContent = ''; joinRoomMessage.className='message'; } showModal(joinRoomModal); joinRoomPasswordInput?.focus(); } else { console.log(`Serverə qoşulma tələbi göndərilir: Room ID = ${room.id}`); showMsg(infoMessageArea, `'${escapeHtml(room.name)}' otağına qoşulunur...`, 'info', 0); socket.emit('join_room', { roomId: room.id }); }
    }
    // --------------------------

    // --- Başlanğıc Konfiqurasiyası ---
    // renderUserProfileHeader(loggedInUser); // Əgər header bu faylda idarə olunursa
    if (infoMessageArea) infoMessageArea.textContent = 'Serverə qoşulunur...';
    // ---------------------------------


    // === Socket.IO Hadisə Dinləyiciləri ===
    // Socket obyektini yuxarıda yaratmışıq

    if(socket) { // Əgər socket uğurla yaradılıbsa
        socket.on('connect', () => {
            console.log('Socket.IO serverinə qoşuldu! ID:', socket.id);
            if (infoMessageArea && infoMessageArea.textContent === 'Serverə qoşulunur...') {
                infoMessageArea.textContent = 'Serverdən otaq siyahısı alınır...';
            }
            // !!! Vacib: Artıq 'register_user' göndərməyə ehtiyac YOXDUR !!!
            // Server session cookie vasitəsilə kimin qoşulduğunu artıq bilir.
            // socket.emit('register_user', loggedInUsername); // BU SƏTRİ SİLİN VƏ YA KOMMENTƏ ALIN
        });

        socket.on('disconnect', (reason) => {
            console.warn('Socket.IO serverindən ayrıldı! Səbəb:', reason);
            showMsg(infoMessageArea, `Serverlə əlaqə kəsildi (${reason}). Yenidən qoşulmağa çalışılır...`, 'error', 0);
        });

        socket.on('connect_error', (error) => {
            console.error('Socket.IO qoşulma xətası:', error.message); // Xəta mesajını göstərək
            // Server tərəfində Authentication error gələrsə, onu tutaq
             if (error.message === 'Authentication error') {
                 showMsg(infoMessageArea, 'Giriş edilmədiyi üçün real-time serverə qoşulmaq mümkün olmadı. Zəhmət olmasa yenidən giriş edin.', 'error', 0);
                 // Bəlkə bir neçə saniyə sonra loginə yönləndirək?
                 setTimeout(redirectToLogin, 4000);
             } else {
                 showMsg(infoMessageArea, 'Serverə qoşulmaq mümkün olmadı. Serverin işlədiyindən əmin olun.', 'error', 0);
             }
        });

        // Qalan socket hadisələri ('room_list_update', 'creation_error' vs.) əvvəlki kimi qalır
        socket.on('room_list_update', (roomListFromServer) => { console.log('>>> room_list_update ALINDI! <<< Data:', roomListFromServer); currentRooms = roomListFromServer || []; displayRooms(currentRooms); });
        socket.on('creation_error', (errorMessage) => { console.error('Otaq yaratma xətası:', errorMessage); showMsg(createRoomMessage, errorMessage, 'error'); if (createRoomSubmitBtn) createRoomSubmitBtn.disabled = false; });
        socket.on('join_error', (errorMessage) => { console.error('Otağa qoşulma xətası:', errorMessage); if (joinRoomModal && joinRoomModal.style.display === 'block') { showMsg(joinRoomMessage, errorMessage, 'error'); if (joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false; } else { showMsg(infoMessageArea, errorMessage, 'error'); } });
        socket.on('room_created', (data) => { console.log('Otaq yaradıldı:', data); hideModal(createRoomModal); showMsg(infoMessageArea, `'${escapeHtml(data.roomName)}' otağı yaradıldı.`, 'success'); });
        socket.on('room_joined', (data) => { console.log('Otağa qoşuldun:', data); hideModal(joinRoomModal); try { const roomNameParam = encodeURIComponent(data.roomName || 'Bilinməyən Otaq'); const playerNameParam = encodeURIComponent(loggedInUsername); const boardSize = data.boardSize || 3; window.location.href = `../game/oda_ici.html?roomId=${data.roomId}&roomName=${roomNameParam}&playerName=${playerNameParam}&size=${boardSize}`; } catch (e) { console.error("Yönləndirmə xətası:", e); showMsg(infoMessageArea, 'Oyun səhifəsinə keçid zamanı xəta.', 'error'); } });
        socket.on('opponent_joined', (data) => { console.log("Rəqib qoşuldu:", data.username); showMsg(infoMessageArea, `${escapeHtml(data.username)} otağa qoşuldu.`, 'info'); });
        socket.on('opponent_left', (data) => { console.log("Rəqib ayrıldı:", data.username); showMsg(infoMessageArea, `${escapeHtml(data.username)} otaqdan ayrıldı.`, 'warning'); });

    } else {
        console.error("Socket obyekti yaradıla bilmədi!");
    }
    // ========================================


    // === DOM Hadisə Dinləyiciləri ===
    // Otaq yaratma düyməsi və modalı ilə bağlı listenerlar əvvəlki kimi qalır
     if (createRoomButton) { createRoomButton.addEventListener('click', () => { if(newRoomNameInput) newRoomNameInput.value = ''; if(newRoomPasswordInput) newRoomPasswordInput.value = ''; if(newBoardSizeSelect) newBoardSizeSelect.value = '3'; if(createRoomMessage) { createRoomMessage.textContent = ''; createRoomMessage.className = 'message'; } if(createRoomSubmitBtn) createRoomSubmitBtn.disabled = false; updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay); showModal(createRoomModal); newRoomNameInput?.focus(); }); }
     if (newBoardSizeSelect) { newBoardSizeSelect.addEventListener('change', () => { updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay); }); }
     if (createRoomSubmitBtn) { createRoomSubmitBtn.addEventListener('click', () => { const roomName = newRoomNameInput?.value.trim(); const password = newRoomPasswordInput?.value; const boardSize = newBoardSizeSelect?.value; if (!roomName) { showMsg(createRoomMessage, 'Otaq adı boş ola bilməz.', 'error'); return; } if (password && password.length > 0) { if (password.length < 2 || !(/[a-zA-Z]/.test(password) && /\d/.test(password))) { showMsg(createRoomMessage, 'Şifrə tələblərə uyğun deyil.', 'error', 5000); return; } } console.log("Serverə 'create_room' göndərilir..."); createRoomSubmitBtn.disabled = true; showMsg(createRoomMessage, 'Otaq yaradılır...', 'info', 0); socket.emit('create_room', { name: roomName, password: password, boardSize: boardSize }); setTimeout(() => { if (createRoomSubmitBtn && createRoomSubmitBtn.disabled) { showMsg(createRoomMessage, 'Serverdən cavab gecikir...', 'warning'); createRoomSubmitBtn.disabled = false; } }, 10000); }); }
     if (joinRoomSubmitBtn) { joinRoomSubmitBtn.addEventListener('click', () => { const roomId = joinRoomIdInput?.value; const password = joinRoomPasswordInput?.value; if (!roomId) { showMsg(joinRoomMessage, 'Otaq ID tapılmadı!', 'error'); return; } console.log(`Serverə 'join_room' göndərilir: ID = ${roomId}`); joinRoomSubmitBtn.disabled = true; showMsg(joinRoomMessage, 'Otağa qoşulunur...', 'info', 0); socket.emit('join_room', { roomId: roomId, password: password }); setTimeout(() => { if (joinRoomSubmitBtn && joinRoomSubmitBtn.disabled) { showMsg(joinRoomMessage, 'Serverdən cavab gecikir...', 'warning'); joinRoomSubmitBtn.disabled = false; } }, 10000); }); }
     closeButtons.forEach(button => { button.addEventListener('click', () => { const modalId = button.dataset.modalId; if (modalId) hideModal(document.getElementById(modalId)); }); });
     window.addEventListener('click', (event) => { if (event.target.classList.contains('modal')) { hideModal(event.target); } });
     newRoomNameInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoomSubmitBtn?.click(); }); newRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoomSubmitBtn?.click(); }); joinRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinRoomSubmitBtn?.click(); });
    // ========================================

}); // DOMContentLoaded Sonu