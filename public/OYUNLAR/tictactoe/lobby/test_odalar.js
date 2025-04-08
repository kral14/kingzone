// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Socket.IO + Session Auth (Delay + Credentials Fix - Tam Kod)

document.addEventListener('DOMContentLoaded', () => { // async burdan silinir
    console.log("Test Odalar JS (Delay + Credentials Fix) Başladı.");

    let loggedInUser = null; // Giriş etmiş istifadəçi məlumatları
    let currentRooms = [];
    let socket = null; // Socket obyekti

    // --- DOM Elementləri ---
    // (Əvvəlki kodunuzdakı kimi tam siyahı)
    const roomListContainer = document.getElementById('room-list-container');
    const infoMessageArea = document.getElementById('info-message-area');
    const createRoomButton = document.getElementById('create-room-button');
    const userControlsDiv = document.getElementById('user-controls');
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
    // --------------------------

    // --- Yardımçı Funksiyalar ---
    // (showModal, hideModal, showMsg, escapeHtml, updateRuleDisplay, addPlayerHoverListeners - əvvəlki kodunuzdakı kimi)
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'info', duration = 4000) => {
        if (!el) return;
        let color = '#d1ecf1'; let bgColor = 'rgba(23, 162, 184, 0.7)'; let borderColor = '#17a2b8';
        if (type === 'error') { color = '#f8d7da'; bgColor = 'rgba(220, 53, 69, 0.7)'; borderColor = '#dc3545'; }
        else if (type === 'success') { color = '#d4edda'; bgColor = 'rgba(40, 167, 69, 0.7)'; borderColor = '#28a745'; }
        else if (type === 'warning') { color = '#fff3cd'; bgColor = 'rgba(255, 193, 7, 0.7)'; borderColor = '#ffc107'; }
        el.textContent = msg; el.className = `message ${type}`;
        el.style.color = color; el.style.backgroundColor = bgColor; el.style.borderColor = borderColor;
        el.style.padding = '10px'; el.style.borderRadius = '5px';
        if (el.timeoutId) clearTimeout(el.timeoutId);
        if (duration > 0) { el.timeoutId = setTimeout(() => { if (el.textContent === msg) { el.textContent = ''; el.className = 'message'; el.removeAttribute('style'); } }, duration); }
    };
    function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return String(unsafe); return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
    function updateRuleDisplay(selectElement, displayElement) {
        if (!selectElement || !displayElement) return; const size = parseInt(selectElement.value, 10); let text = ''; switch (size) { case 3: text = "3x3 - Qazanmaq: 3 simvol"; break; case 4: text = "4x4 - Qazanmaq: 3 simvol"; break; case 5: text = "5x5 - Qazanmaq: 4 simvol"; break; case 6: text = "6x6 - Qazanmaq: 4 simvol"; break; default: text = "Lövhə ölçüsünü seçin."; break; } displayElement.textContent = text;
    }
    function addPlayerHoverListeners(playerSpan) {
        if (!playerSpan) return; playerSpan.addEventListener('mouseenter', () => playerSpan.classList.add('is-hovered-player')); playerSpan.addEventListener('mouseleave', () => playerSpan.classList.remove('is-hovered-player'));
        // Mustafa hover effekti (əgər aktualdırsa)
        if (playerSpan.textContent.toLowerCase() === 'mustafa') { playerSpan.classList.add('is-mustafa-hover'); /* ... tooltip ... */ }
    }
    function redirectToLogin() { window.location.href = '../../ANA SEHIFE/login/login.html'; }
    // --------------------------

    // ===== AUTENTİFİKASİYA YOXLAMASI (GECİKMƏ İLƏ) =====
    setTimeout(async () => { // <<<--- setTimeout BAŞLANĞICI
        try {
            console.log("Lobby: /check-auth sorğusu göndərilir (gecikmə ilə)...");
            const response = await fetch('/check-auth', {
                credentials: 'include' // <<<--- DÜZƏLİŞ BURADADIR!
            });
            const data = await response.json();

            if (!response.ok || !data.loggedIn) {
                console.log("Lobby: Giriş edilməyib (check-auth), login səhifəsinə yönləndirilir...");
                redirectToLogin();
                return;
            }

            // Giriş edilib
            loggedInUser = data.user;
            console.log(`Lobby: Giriş edilib: ${loggedInUser.nickname}`);

            // UI və Socket bağlantısını quraşdır
            setupUIAndSocket(loggedInUser.nickname);

        } catch (error) {
            console.error("Lobby: Auth yoxlama xətası:", error);
            alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
            redirectToLogin();
        }
    }, 500); // <<<--- 500 millisaniyə gözləmə
    // =====================================================


    // --- UI və Socket Quraşdırma Funksiyası ---
    function setupUIAndSocket(loggedInUsername) {
        // Header-də istifadəçi adını göstər
        if (userInfoPlaceholder) {
            userInfoPlaceholder.textContent = '';
            const welcomeSpan = document.createElement('span');
            welcomeSpan.id = 'welcome-lobby-player';
            welcomeSpan.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUsername)}</strong>! `;
            userInfoPlaceholder.appendChild(welcomeSpan);
            // Opsional: Çıxış linkini də bura əlavə etmək olar
        }

        // Socket.IO Bağlantısını Quraşdır
        try {
            console.log("Socket.IO serverinə qoşulmağa cəhd edilir...");
            socket = io({ /* withCredentials: true */ }); // Socket obyektini təyin et
            setupSocketListeners(socket, loggedInUsername); // Listenerları quraşdır
        } catch (e) {
            console.error("Socket.IO obyekti yaradılarkən xəta:", e);
            showMsg(infoMessageArea, 'Real-time serverə qoşulmaq mümkün olmadı.', 'error', 0);
            return;
        }

        // DOM Olay Dinləyicilərini Quraşdır
        setupDOMListeners(socket);

        // Başlanğıc mesajı
        if (infoMessageArea) infoMessageArea.textContent = 'Serverə qoşulunur...';
    }


    // --- Otaq Elementi Yaratma Funksiyası ---
    function createRoomElement(room, currentLoggedInUsername) {
        const li = document.createElement('li'); li.classList.add('room-item'); li.dataset.roomId = room.id;
        const isCreator = room.creatorUsername === currentLoggedInUsername; const playerCount = room.playerCount || 0; const boardSizeText = room.boardSize ? `${room.boardSize}x${room.boardSize}` : '3x3'; const creatorUsername = room.creatorUsername || 'Naməlum';
        const line1Div = document.createElement('div'); line1Div.className = 'room-item-line1'; const roomNameSpan = document.createElement('span'); roomNameSpan.className = 'room-name'; const originalNameTextSpan = document.createElement('span'); originalNameTextSpan.className = 'display-text original-text'; originalNameTextSpan.textContent = escapeHtml(room.name); const hoverNameTextSpan = document.createElement('span'); hoverNameTextSpan.className = 'display-text hover-text'; hoverNameTextSpan.textContent = `Qurucu: ${escapeHtml(creatorUsername)}`; roomNameSpan.appendChild(originalNameTextSpan); roomNameSpan.appendChild(hoverNameTextSpan); roomNameSpan.addEventListener('mouseenter', () => roomNameSpan.classList.add('is-hovered')); roomNameSpan.addEventListener('mouseleave', () => roomNameSpan.classList.remove('is-hovered')); line1Div.appendChild(roomNameSpan);
        const statusDiv = document.createElement('div'); statusDiv.className = 'room-status'; statusDiv.innerHTML += `<span class="players" title="Lövhə Ölçüsü">${boardSizeText}</span>`; if (room.hasPassword) { statusDiv.innerHTML += `<span class="lock-icon" title="Şifrə ilə qorunur">🔒</span>`; } statusDiv.innerHTML += `<span class="players" title="Oyunçular">${playerCount}/2</span>`; line1Div.appendChild(statusDiv);
        const separatorDiv = document.createElement('div'); separatorDiv.className = 'room-item-separator';
        const line2Div = document.createElement('div'); line2Div.className = 'room-item-line2'; const playerDisplayDiv = document.createElement('div'); playerDisplayDiv.className = 'player-name-display';
        if (room.player1Username) { const p1Span = document.createElement('span'); p1Span.className = 'player1-name'; p1Span.textContent = escapeHtml(room.player1Username); addPlayerHoverListeners(p1Span); playerDisplayDiv.appendChild(p1Span); } else { playerDisplayDiv.insertAdjacentHTML('beforeend', `<span class="empty-slot">(Boş)</span>`); }
        if (room.player1Username || room.player2Username) { playerDisplayDiv.insertAdjacentHTML('beforeend', ` <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-swords vs-icon" viewBox="0 0 16 16"><path d="M1.746 8.032a.5.5 0 0 1 .478-.736l5-1.5a.5.5 0 0 1 .666.478l-1.5 5a.5.5 0 0 1-.478.666l-5 1.5a.5.5 0 0 1-.666-.478l1.5-5z"/><path d="M14.254 8.968a.5.5 0 0 1-.478.736l-5 1.5a.5.5 0 0 1-.666-.478l1.5-5a.5.5 0 0 1 .478-.666l5-1.5a.5.5 0 0 1 .666.478l-1.5 5z"/></svg> `); }
        if (room.player2Username) { const p2Span = document.createElement('span'); p2Span.className = 'player2-name'; p2Span.textContent = escapeHtml(room.player2Username); addPlayerHoverListeners(p2Span); playerDisplayDiv.appendChild(p2Span); } else if (room.player1Username) { playerDisplayDiv.insertAdjacentHTML('beforeend', `<span class="empty-slot">(Boş)</span>`); }
        if (!room.player1Username && !room.player2Username) { playerDisplayDiv.innerHTML = `<span class="empty-slot">(Otaq Boşdur)</span>`; }
        line2Div.appendChild(playerDisplayDiv); li.appendChild(line1Div); li.appendChild(separatorDiv); li.appendChild(line2Div); li.addEventListener('click', () => handleRoomClick(room)); return li;
    }
    // --------------------------

    // --- Otaq Siyahısını Göstərmə ---
    function displayRooms(roomsToDisplay) {
        if (!roomListContainer) return; console.log("Otaqlar göstərilir:", roomsToDisplay); roomListContainer.innerHTML = ''; if (!Array.isArray(roomsToDisplay)) { checkIfRoomListEmpty([]); return; } if (roomsToDisplay.length === 0) { checkIfRoomListEmpty([]); } else { if (infoMessageArea) infoMessageArea.style.display = 'none'; roomsToDisplay.forEach((room, index) => { try { const li = createRoomElement(room, loggedInUser.nickname); roomListContainer.appendChild(li); requestAnimationFrame(() => { setTimeout(() => { li.classList.add('entering'); }, index * 50); }); } catch(e) { console.error(`Otaq elementi xətası:`, e); } }); checkIfRoomListEmpty(roomsToDisplay); }
    }
    // --------------------------

    // --- Otaq Siyahısı Boş Nəzarəti ---
    function checkIfRoomListEmpty(rooms) {
        if (!infoMessageArea) return; const userRoomCount = rooms.filter(r => !r.isAiRoom).length; if (userRoomCount === 0) { infoMessageArea.textContent = 'Aktiv otaq yoxdur. Yeni otaq yaradın!'; infoMessageArea.style.display = 'block'; /* ... CSS stilləri ... */ } else { infoMessageArea.style.display = 'none'; }
    }
    // --------------------------

    // --- Otağa Klikləmə ---
    function handleRoomClick(room) {
        if (!room || !room.id) { console.error("Keçərsiz otaq:", room); return; } console.log(`Otağa klikləndi: ${room.name}`, room); if (room.playerCount >= 2) { showMsg(infoMessageArea, `'${escapeHtml(room.name)}' doludur.`, 'error'); return; }
        if (room.hasPassword) {
            if(joinRoomTitle) joinRoomTitle.textContent = `'${escapeHtml(room.name)}' otağına qoşul`; if(joinRoomIdInput) joinRoomIdInput.value = room.id; if(joinRoomPasswordInput) joinRoomPasswordInput.value = ''; if(joinRoomMessage) { joinRoomMessage.textContent = ''; joinRoomMessage.className='message'; joinRoomMessage.removeAttribute('style'); } showModal(joinRoomModal); joinRoomPasswordInput?.focus();
        } else {
            showMsg(infoMessageArea, `'${escapeHtml(room.name)}' otağına qoşulunur...`, 'info', 0);
            if(socket) socket.emit('join_room', { roomId: room.id }); else { console.error("Socket yoxdur!"); showMsg(infoMessageArea, 'Serverlə bağlantı yoxdur.', 'error');}
        }
    }
    // --------------------------


    // === Socket.IO Hadisə Dinləyicilərini Quraşdırma ===
    function setupSocketListeners(socketInstance, currentUsername) {
        if(!socketInstance) return;

        socketInstance.on('connect', () => {
            console.log('Lobby: Socket qoşuldu! ID:', socketInstance.id);
            if (infoMessageArea && infoMessageArea.textContent === 'Serverə qoşulunur...') { infoMessageArea.textContent = 'Otaq siyahısı alınır...'; }
        });
        socketInstance.on('disconnect', (reason) => { console.warn('Lobby: Socket ayrıldı!', reason); showMsg(infoMessageArea, `Serverlə əlaqə kəsildi (${reason}).`, 'error', 0); });
        socketInstance.on('connect_error', (error) => { console.error('Lobby: Socket qoşulma xətası:', error.message); if (error.message.includes('Authentication error')) { showMsg(infoMessageArea, 'Giriş etibarsızdır.', 'error', 0); setTimeout(redirectToLogin, 3000); } else { showMsg(infoMessageArea, 'Serverə qoşulmaq mümkün olmadı.', 'error', 0); } });
        socketInstance.on('room_list_update', (rooms) => { console.log('>>> Lobby: room_list_update ALINDI!', rooms); currentRooms = rooms || []; displayRooms(currentRooms); });
        socketInstance.on('creation_error', (msg) => { console.error('Otaq yaratma xətası:', msg); showMsg(createRoomMessage, msg, 'error'); if (createRoomSubmitBtn) createRoomSubmitBtn.disabled = false; });
        socketInstance.on('join_error', (msg) => { console.error('Otağa qoşulma xətası:', msg); if (joinRoomModal?.style.display === 'block') { showMsg(joinRoomMessage, msg, 'error'); if (joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false; } else { showMsg(infoMessageArea, msg, 'error'); } });
        socketInstance.on('room_created', (data) => { console.log('Otaq yaradıldı (cavab):', data); hideModal(createRoomModal); /* 'room_joined' yönləndirəcək */ });
        socketInstance.on('room_joined', (data) => {
             console.log('Otağa qoşuldun (cavab):', data); hideModal(joinRoomModal);
             try {
                  const roomNameParam = encodeURIComponent(data.roomName || 'Adsız Otaq');
                  const playerNameParam = encodeURIComponent(currentUsername);
                  const boardSize = data.boardSize || 3;
                  console.log(`Oyun otağına yönləndirilir: ${data.roomId}`);
                  window.location.href = `../game/oda_ici.html?roomId=${data.roomId}&roomName=${roomNameParam}&playerName=${playerNameParam}&size=${boardSize}`;
             } catch (e) { console.error("Yönləndirmə xətası:", e); showMsg(infoMessageArea, 'Oyun səhifəsinə keçid xətası.', 'error'); }
        });
    }
    // ========================================


    // === DOM Hadisə Dinləyicilərini Quraşdırma ===
    function setupDOMListeners(socketInstance) {
        if (createRoomButton) { createRoomButton.addEventListener('click', () => { /* ... modalı aç, formanı təmizlə ... */ if(newRoomNameInput) newRoomNameInput.value = ''; if(newRoomPasswordInput) newRoomPasswordInput.value = ''; if(newBoardSizeSelect) newBoardSizeSelect.value = '3'; if(createRoomMessage) { createRoomMessage.textContent = ''; createRoomMessage.className = 'message'; createRoomMessage.removeAttribute('style'); } if(createRoomSubmitBtn) createRoomSubmitBtn.disabled = false; updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay); showModal(createRoomModal); newRoomNameInput?.focus(); }); } else { console.error("createRoomButton tapılmadı!"); }
        if (newBoardSizeSelect) { newBoardSizeSelect.addEventListener('change', () => { updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay); }); }
        if (createRoomSubmitBtn) { createRoomSubmitBtn.addEventListener('click', () => { /* ... validasiya et və socket.emit('create_room', ...) göndər ... */ const roomName = newRoomNameInput?.value.trim(); const password = newRoomPasswordInput?.value; const boardSize = newBoardSizeSelect?.value; if (!roomName) { showMsg(createRoomMessage, 'Otaq adı boş ola bilməz.', 'error'); return; } if (password && (password.length < 2 || !(/[a-zA-Z]/.test(password) && /\d/.test(password)))) { showMsg(createRoomMessage, 'Şifrə tələblərə uyğun deyil.', 'error', 5000); return; } console.log("Serverə 'create_room' göndərilir..."); createRoomSubmitBtn.disabled = true; showMsg(createRoomMessage, 'Otaq yaradılır...', 'info', 0); if(socketInstance) socketInstance.emit('create_room', { name: roomName, password: password || null, boardSize: boardSize }); else { showMsg(createRoomMessage, 'Serverlə bağlantı yoxdur.', 'error'); createRoomSubmitBtn.disabled = false; return; } setTimeout(() => { if (createRoomSubmitBtn?.disabled) { showMsg(createRoomMessage, 'Serverdən cavab gecikir...', 'warning'); createRoomSubmitBtn.disabled = false; } }, 10000); }); } else { console.error("createRoomSubmitBtn tapılmadı!"); }
        if (joinRoomSubmitBtn) { joinRoomSubmitBtn.addEventListener('click', () => { /* ... validasiya et və socket.emit('join_room', ...) göndər ... */ const roomId = joinRoomIdInput?.value; const password = joinRoomPasswordInput?.value; if (!roomId) { showMsg(joinRoomMessage, 'Otaq ID tapılmadı!', 'error'); return; } if (!password) { showMsg(joinRoomMessage, 'Zəhmət olmasa, şifrəni daxil edin.', 'error'); return; } console.log(`Serverə 'join_room' göndərilir: ID = ${roomId}`); joinRoomSubmitBtn.disabled = true; showMsg(joinRoomMessage, 'Otağa qoşulunur...', 'info', 0); if(socketInstance) socketInstance.emit('join_room', { roomId: roomId, password: password }); else { showMsg(joinRoomMessage, 'Serverlə bağlantı yoxdur.', 'error'); joinRoomSubmitBtn.disabled = false; return; } setTimeout(() => { if (joinRoomSubmitBtn?.disabled) { showMsg(joinRoomMessage, 'Serverdən cavab gecikir...', 'warning'); joinRoomSubmitBtn.disabled = false; } }, 10000); }); } else { console.error("joinRoomSubmitBtn tapılmadı!"); }
        closeButtons.forEach(button => { button.addEventListener('click', () => { /* ... modalı bağla ... */ const modalId = button.dataset.modalId; if (modalId) { const modal = document.getElementById(modalId); if(modal) { hideModal(modal); const msgEl = modal.querySelector('.message'); if(msgEl){ msgEl.textContent=''; msgEl.className='message'; msgEl.removeAttribute('style');}} } }); });
        window.addEventListener('click', (event) => { if (event.target.classList.contains('modal')) { /* ... modalı bağla ... */ hideModal(event.target); const msgEl = event.target.querySelector('.message'); if(msgEl){ msgEl.textContent=''; msgEl.className='message'; msgEl.removeAttribute('style');} } });
        newRoomNameInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoomSubmitBtn?.click(); });
        newRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoomSubmitBtn?.click(); });
        joinRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinRoomSubmitBtn?.click(); });
    }
    // ========================================

}); // DOMContentLoaded Sonu