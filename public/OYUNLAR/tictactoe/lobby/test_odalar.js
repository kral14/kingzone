// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Socket.IO + Profil/Logout (Tam Kod)

document.addEventListener('DOMContentLoaded', () => {
    console.log("Test Odalar JS (Socket.IO + Profil - Tam) Başladı.");

    // --- Global Dəyişənlər və İlkin Yoxlama ---
    let loggedInUser = null;
    let currentRooms = []; // Otaq siyahısı serverdən gələcək

    function getUserFromStorage() {
        const userDataString = localStorage.getItem('ticTacToeUser');
        if (userDataString) {
            try {
                return JSON.parse(userDataString);
            } catch (e) {
                console.error("localStorage-dan istifadəçi məlumatını oxuma xətası:", e);
                localStorage.removeItem('ticTacToeUser');
                return null;
            }
        }
        return null;
    }

    function redirectToLogin() {
        console.log("İstifadəçi giriş etməyib. Giriş səhifəsinə yönləndirilir...");
        window.location.replace('/ANA SEHIFE/login/login.html');
    }

    // Səhifə yüklənəndə istifadəçi məlumatını al və yoxla
    loggedInUser = getUserFromStorage();
    if (!loggedInUser || !loggedInUser.username) {
        redirectToLogin();
        return; // İstifadəçi yoxdursa, skriptin qalanını icra etmə
    }
    const loggedInUsername = loggedInUser.username;
    console.log(`Giriş etmiş istifadəçi: ${loggedInUsername}`);
    // ---------------------------------------

    // --- Socket.IO Bağlantısı ---
    console.log("Socket.IO serverinə qoşulmağa cəhd edilir...");
    const socket = io();
    // --------------------------

    // --- DOM Elementləri ---
    const roomListContainer = document.getElementById('room-list-container');
    const infoMessageArea = document.getElementById('info-message-area');
    // const welcomeText = document.getElementById('welcome-text'); // Artıq header-də göstərilir
    const createRoomButton = document.getElementById('create-room-button');
    const userControlsDiv = document.getElementById('user-controls'); // Header-dəki yeni div
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

    // --- Yardımçı Funksiyalar ---
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'info', duration = 4000) => {
        if (!el) return;
        el.textContent = msg;
        el.className = `message ${type}`;
        // Clear previous timeout to prevent messages disappearing too early
        if (el.timeoutId) clearTimeout(el.timeoutId);
        if (duration > 0) {
            el.timeoutId = setTimeout(() => {
                if (el.textContent === msg) { // Only clear if the message hasn't changed
                    el.textContent = '';
                    el.className = 'message';
                }
            }, duration);
        }
    };
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return String(unsafe);
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    function updateRuleDisplay(selectElement, displayElement) {
        if (!selectElement || !displayElement) return;
        const size = parseInt(selectElement.value, 10); let text = '';
        switch (size) {
            case 3: text = "3x3 - Asan Mod - Qazanmaq: 3 simvol"; break;
            case 4: text = "4x4 - Orta Mod - Qazanmaq: 3 simvol"; break;
            case 5: text = "5x5 - Çətin Mod - Qazanmaq: 4 simvol"; break;
            case 6: text = "6x6 - Çox Çətin Mod - Qazanmaq: 4 simvol"; break;
            default: text = "Lövhə ölçüsünü seçin."; break;
        }
        displayElement.textContent = text;
    }
    function addPlayerHoverListeners(playerSpan) {
        if (!playerSpan) return;
        playerSpan.addEventListener('mouseenter', () => playerSpan.classList.add('is-hovered-player'));
        playerSpan.addEventListener('mouseleave', () => playerSpan.classList.remove('is-hovered-player'));
    }
    // --------------------------

    // --- Profil/Header Funksiyaları ---
    function renderUserProfileHeader(user) {
        if (!userControlsDiv || !user || !user.username) {
            console.warn("Header render edilə bilmədi: Div və ya user tapılmadı.");
            return;
        }

        const placeholder = document.getElementById('user-info-placeholder');
        if (placeholder) placeholder.remove();

        // Elementlərin artıq mövcud olub olmadığını yoxlayaq (səhifə yenilənmələri üçün)
        if (document.getElementById('welcome-player')) return;

        const welcomeSpan = document.createElement('span');
        welcomeSpan.id = 'welcome-player';
        welcomeSpan.innerHTML = `Xoş gəldin, <strong>${escapeHtml(user.username)}</strong>! `;

        const profileButton = document.createElement('button');
        profileButton.id = 'profile-menu-btn';
        profileButton.className = 'header-link profile-button';
        profileButton.textContent = 'Profil';

        const logoutButton = document.createElement('button');
        logoutButton.id = 'logout-button';
        logoutButton.className = 'header-link logout-button';
        logoutButton.textContent = 'Çıxış';

        const backButton = userControlsDiv.querySelector('a[href="javascript:history.back();"]');
        if (backButton) {
            userControlsDiv.insertBefore(welcomeSpan, backButton);
            userControlsDiv.insertBefore(profileButton, backButton);
            userControlsDiv.insertBefore(logoutButton, backButton);
        } else { // Əgər geri düyməsi yoxdursa, sona əlavə et
            userControlsDiv.appendChild(welcomeSpan);
            userControlsDiv.appendChild(profileButton);
            userControlsDiv.appendChild(logoutButton);
        }

        setupLogoutButton();
        setupProfileButton();
    }

    function setupLogoutButton() {
        const logoutBtn = document.getElementById('logout-button');
        if (logoutBtn) {
             // Köhnə listener varsa silək (ehtiyat üçün)
             logoutBtn.replaceWith(logoutBtn.cloneNode(true));
             document.getElementById('logout-button').addEventListener('click', () => {
                console.log("Çıxış düyməsinə basıldı.");
                localStorage.removeItem('ticTacToeUser');
                redirectToLogin();
            });
        }
    }

    function setupProfileButton() {
        const profileBtn = document.getElementById('profile-menu-btn');
        if (profileBtn) {
             // Köhnə listener varsa silək
             profileBtn.replaceWith(profileBtn.cloneNode(true));
             document.getElementById('profile-menu-btn').addEventListener('click', () => {
                alert('Profil redaktəsi funksiyası gələcəkdə əlavə olunacaq.');
            });
        }
    }
    // -----------------------------

    // --- Otaq Elementi Yaratma Funksiyası ---
    function createRoomElement(room) {
        const li = document.createElement('li');
        li.classList.add('room-item');
        li.dataset.roomId = room.id;

        const isCreator = room.creatorUsername === loggedInUsername;
        const playerCount = room.playerCount || 0;
        const boardSizeText = room.boardSize ? `${room.boardSize}x${room.boardSize}` : '3x3';
        const creatorUsername = room.creatorUsername || 'Naməlum';

        // Line 1
        const line1Div = document.createElement('div');
        line1Div.className = 'room-item-line1';
        const roomNameSpan = document.createElement('span');
        roomNameSpan.className = 'room-name';
        const originalNameTextSpan = document.createElement('span');
        originalNameTextSpan.className = 'display-text original-text';
        originalNameTextSpan.textContent = escapeHtml(room.name);
        const hoverNameTextSpan = document.createElement('span');
        hoverNameTextSpan.className = 'display-text hover-text';
        hoverNameTextSpan.textContent = `Qurucu: ${escapeHtml(creatorUsername)}`;
        roomNameSpan.appendChild(originalNameTextSpan);
        roomNameSpan.appendChild(hoverNameTextSpan);
        roomNameSpan.addEventListener('mouseenter', () => roomNameSpan.classList.add('is-hovered'));
        roomNameSpan.addEventListener('mouseleave', () => roomNameSpan.classList.remove('is-hovered'));
        line1Div.appendChild(roomNameSpan);

        const statusDiv = document.createElement('div');
        statusDiv.className = 'room-status';
        statusDiv.innerHTML += `<span class="players" title="Lövhə Ölçüsü">${boardSizeText}</span>`;
        if (room.hasPassword) { statusDiv.innerHTML += `<span class="lock-icon" title="Şifrə ilə qorunur">🔒</span>`; }
        statusDiv.innerHTML += `<span class="players" title="Oyunçular">${playerCount}/2</span>`;
        // Silmə düyməsini hələlik əlavə etmirik
        line1Div.appendChild(statusDiv);

        // Separator
        const separatorDiv = document.createElement('div');
        separatorDiv.className = 'room-item-separator';

        // Line 2
        const line2Div = document.createElement('div');
        line2Div.className = 'room-item-line2';
        const playerDisplayDiv = document.createElement('div');
        playerDisplayDiv.className = 'player-name-display';

        if (room.player1Username) { const p1Span = document.createElement('span'); p1Span.className = 'player1-name'; p1Span.textContent = escapeHtml(room.player1Username); addPlayerHoverListeners(p1Span); playerDisplayDiv.appendChild(p1Span); }
        else { playerDisplayDiv.insertAdjacentHTML('beforeend', `<span class="empty-slot">(Boş)</span>`); }

        if (room.player1Username || room.player2Username) { playerDisplayDiv.insertAdjacentHTML('beforeend', ` <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-swords vs-icon" viewBox="0 0 16 16"> <path d="M1.746 8.032a.5.5 0 0 1 .478-.736l5-1.5a.5.5 0 0 1 .666.478l-1.5 5a.5.5 0 0 1-.478.666l-5 1.5a.5.5 0 0 1-.666-.478l1.5-5z"/> <path d="M14.254 8.968a.5.5 0 0 1-.478.736l-5 1.5a.5.5 0 0 1-.666-.478l1.5-5a.5.5 0 0 1 .478-.666l5-1.5a.5.5 0 0 1 .666.478l-1.5 5z"/> </svg> `); }

        if (room.player2Username) { const p2Span = document.createElement('span'); p2Span.className = 'player2-name'; p2Span.textContent = escapeHtml(room.player2Username); addPlayerHoverListeners(p2Span); playerDisplayDiv.appendChild(p2Span); }
        else if (room.player1Username) { playerDisplayDiv.insertAdjacentHTML('beforeend', `<span class="empty-slot">(Boş)</span>`); }

        if (!room.player1Username && !room.player2Username) { playerDisplayDiv.innerHTML = `<span class="empty-slot">(Otaq Boşdur)</span>`; }

        line2Div.appendChild(playerDisplayDiv);

        // Assemble
        li.appendChild(line1Div);
        li.appendChild(separatorDiv);
        li.appendChild(line2Div);

        // Click listener
        li.addEventListener('click', () => handleRoomClick(room));

        return li;
    }
    // --------------------------

    // --- Otaq Siyahısını Göstərmə ---
    function displayRooms(roomsToDisplay) {
        if (!roomListContainer) {
            console.error("roomListContainer elementi tapılmadı!");
            return;
        }
        console.log("Otaqlar göstərilir:", roomsToDisplay);
        roomListContainer.innerHTML = ''; // Clear previous list

        if (!Array.isArray(roomsToDisplay)) {
             console.error("Göstəriləcək otaqlar massiv deyil:", roomsToDisplay);
             checkIfRoomListEmpty([]);
             return;
        }

        if (roomsToDisplay.length === 0) {
            checkIfRoomListEmpty([]);
        } else {
            if (infoMessageArea) infoMessageArea.style.display = 'none';
            roomsToDisplay.forEach((room, index) => {
                 try {
                     const li = createRoomElement(room);
                     roomListContainer.appendChild(li);
                     requestAnimationFrame(() => {
                         setTimeout(() => { li.classList.add('entering'); }, index * 50);
                     });
                 } catch(e) {
                      console.error(`Otaq elementi yaradılarkən xəta (index ${index}, room: ${JSON.stringify(room)}):`, e);
                 }
            });
            checkIfRoomListEmpty(roomsToDisplay);
        }
    }
    // --------------------------

    // --- Otaq Siyahısı Boş Nəzarəti ---
    function checkIfRoomListEmpty(rooms) {
        if (!infoMessageArea) return;
        // Serverdən gələn real otaqları sayırıq (AI otaqları gələcəkdə əlavə oluna bilər)
        const userRoomCount = rooms.filter(r => !r.isAiRoom).length;

        if (userRoomCount === 0) {
            infoMessageArea.textContent = 'Aktiv istifadəçi otağı tapılmadı. Yeni otaq yaradın!';
            infoMessageArea.style.display = 'block';
        } else {
            infoMessageArea.style.display = 'none';
        }
    }
    // --------------------------

    // --- Otağa Klikləmə ---
    function handleRoomClick(room) {
        if (!room || !room.id) {
            console.error("Keçərsiz otaq obyekti:", room);
            return;
        }
        console.log(`Otağa klikləndi: ${room.name} (ID: ${room.id})`, room);

        if (room.playerCount >= 2) {
            showMsg(infoMessageArea, `'${escapeHtml(room.name)}' otağı doludur.`, 'error');
            return;
        }

        if (room.hasPassword) {
            console.log("Şifrəli otaq, qoşulma modalı açılır.");
            if(joinRoomTitle) joinRoomTitle.textContent = `'${escapeHtml(room.name)}' otağına qoşul`;
            if(joinRoomIdInput) joinRoomIdInput.value = room.id;
            if(joinRoomPasswordInput) joinRoomPasswordInput.value = '';
            if(joinRoomMessage) { joinRoomMessage.textContent = ''; joinRoomMessage.className='message'; }
            showModal(joinRoomModal);
            joinRoomPasswordInput?.focus();
        } else {
            console.log(`Serverə qoşulma tələbi göndərilir: Room ID = ${room.id}`);
            // Qoşulma tələbi göndər (şifrəsiz)
             showMsg(infoMessageArea, `'${escapeHtml(room.name)}' otağına qoşulunur...`, 'info', 0);
            socket.emit('join_room', { roomId: room.id });
        }
    }
    // --------------------------


    // --- Başlanğıc Konfiqurasiyası ---
    // Header-də profil məlumatını göstər
    renderUserProfileHeader(loggedInUser);
    // İlkin mesaj
    if (infoMessageArea) infoMessageArea.textContent = 'Serverə qoşulunur...';
    // ---------------------------------


    // === Socket.IO Hadisə Dinləyiciləri ===

    socket.on('connect', () => {
        console.log('Socket.IO serverinə qoşuldu! ID:', socket.id);
        if (infoMessageArea && infoMessageArea.textContent === 'Serverə qoşulunur...') {
             infoMessageArea.textContent = 'Serverdən otaq siyahısı alınır...';
        }
        // Qoşulduqdan sonra istifadəçi adını serverə bildir
        socket.emit('register_user', loggedInUsername);
    });

    socket.on('disconnect', (reason) => {
        console.warn('Socket.IO serverindən ayrıldı! Səbəb:', reason);
        showMsg(infoMessageArea, `Serverlə əlaqə kəsildi (${reason}). Yenidən qoşulmağa çalışılır...`, 'error', 0);
        // Socket.IO avtomatik təkrar qoşulmağa çalışacaq
    });

    socket.on('connect_error', (error) => {
        console.error('Socket.IO qoşulma xətası:', error);
         showMsg(infoMessageArea, 'Serverə qoşulmaq mümkün olmadı. Serverin işlədiyindən əmin olun.', 'error', 0);
    });


    socket.on('room_list_update', (roomListFromServer) => {
        console.log('>>> room_list_update HADİSƏSİ ALINDI! <<< Data:', roomListFromServer);
        currentRooms = roomListFromServer || []; // Əgər null gələrsə, boş massiv olsun
        displayRooms(currentRooms);
    });

    socket.on('creation_error', (errorMessage) => {
        console.error('Otaq yaratma xətası:', errorMessage);
        showMsg(createRoomMessage, errorMessage, 'error');
        if (createRoomSubmitBtn) createRoomSubmitBtn.disabled = false;
    });

    socket.on('join_error', (errorMessage) => {
        console.error('Otağa qoşulma xətası:', errorMessage);
        // Qoşulma modalı açıqdırsa orada, deyilsə əsas info sahəsində göstər
        if (joinRoomModal && joinRoomModal.style.display === 'block') {
             showMsg(joinRoomMessage, errorMessage, 'error');
             if (joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false;
        } else {
             showMsg(infoMessageArea, errorMessage, 'error');
        }
    });

    socket.on('room_created', (data) => {
        console.log('Otaq uğurla yaradıldı (Server Təsdiqi):', data);
        hideModal(createRoomModal);
        // Siyahı 'room_list_update' ilə yenilənəcək
         showMsg(infoMessageArea, `'${escapeHtml(data.roomName)}' otağı yaradıldı.`, 'success');
    });

    socket.on('room_joined', (data) => {
        console.log('Otağa uğurla qoşuldun (Server Təsdiqi):', data);
        hideModal(joinRoomModal); // Qoşulma modalını bağla
        // Oyun səhifəsinə yönləndir
        try {
            const roomNameParam = encodeURIComponent(data.roomName || 'Bilinməyən Otaq');
            const playerNameParam = encodeURIComponent(loggedInUsername);
            const boardSize = data.boardSize || 3;
            window.location.href = `../game/oda_ici.html?roomId=${data.roomId}&roomName=${roomNameParam}&playerName=${playerNameParam}&size=${boardSize}`;
        } catch (e) {
            console.error("Yönləndirmə xətası:", e);
            showMsg(infoMessageArea, 'Oyun səhifəsinə keçid zamanı xəta.', 'error');
        }
    });

    socket.on('opponent_joined', (data) => {
        console.log("Rəqib qoşuldu:", data.username);
        showMsg(infoMessageArea, `${escapeHtml(data.username)} otağa qoşuldu.`, 'info');
        // Otaq siyahısı onsuz da yenilənəcək (playerCount)
    });

    socket.on('opponent_left', (data) => {
        console.log("Rəqib ayrıldı:", data.username);
         showMsg(infoMessageArea, `${escapeHtml(data.username)} otaqdan ayrıldı.`, 'warning');
        // Otaq siyahısı onsuz da yenilənəcək (playerCount / otaq silinməsi)
    });

    // ========================================


    // === DOM Hadisə Dinləyiciləri ===

    if (createRoomButton) {
        createRoomButton.addEventListener('click', () => {
            if(newRoomNameInput) newRoomNameInput.value = '';
            if(newRoomPasswordInput) newRoomPasswordInput.value = '';
            if(newBoardSizeSelect) newBoardSizeSelect.value = '3';
            if(createRoomMessage) { createRoomMessage.textContent = ''; createRoomMessage.className = 'message'; }
            if(createRoomSubmitBtn) createRoomSubmitBtn.disabled = false; // Düyməni aktiv et
            updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay);
            showModal(createRoomModal);
            newRoomNameInput?.focus();
        });
    }

    if (newBoardSizeSelect) {
        newBoardSizeSelect.addEventListener('change', () => {
            updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay);
        });
    }

    if (createRoomSubmitBtn) {
        createRoomSubmitBtn.addEventListener('click', () => {
            const roomName = newRoomNameInput?.value.trim();
            const password = newRoomPasswordInput?.value;
            const boardSize = newBoardSizeSelect?.value;

            if (!roomName) {
                showMsg(createRoomMessage, 'Otaq adı boş ola bilməz.', 'error'); return;
            }
            if (password && password.length > 0) {
                 if (password.length < 2 || !(/[a-zA-Z]/.test(password) && /\d/.test(password))) {
                       showMsg(createRoomMessage, 'Şifrə tələblərə uyğun deyil (min 2 krk, 1 hərf + 1 rəqəm).', 'error', 5000); return;
                 }
            }

            console.log("Serverə 'create_room' hadisəsi göndərilir...");
            createRoomSubmitBtn.disabled = true;
            showMsg(createRoomMessage, 'Otaq yaradılır...', 'info', 0);
            socket.emit('create_room', { name: roomName, password: password, boardSize: boardSize });

             setTimeout(() => {
                  if (createRoomSubmitBtn && createRoomSubmitBtn.disabled) { // Əgər hələ də deaktivdirsə
                     showMsg(createRoomMessage, 'Serverdən cavab gecikir...', 'warning');
                     createRoomSubmitBtn.disabled = false; // Yenidən aktiv et
                  }
             }, 10000);
        });
    }

    if (joinRoomSubmitBtn) {
        joinRoomSubmitBtn.addEventListener('click', () => {
            const roomId = joinRoomIdInput?.value;
            const password = joinRoomPasswordInput?.value;

            if (!roomId) { showMsg(joinRoomMessage, 'Otaq ID tapılmadı!', 'error'); return; }
            // Şifrənin boş olub olmadığını clientdə yoxlamağa ehtiyac yoxdur, server onsuz da yoxlayacaq

            console.log(`Serverə 'join_room' hadisəsi göndərilir: Room ID = ${roomId}`);
            joinRoomSubmitBtn.disabled = true;
            showMsg(joinRoomMessage, 'Otağa qoşulunur...', 'info', 0);
            socket.emit('join_room', { roomId: roomId, password: password });

             setTimeout(() => {
                 if (joinRoomSubmitBtn && joinRoomSubmitBtn.disabled) {
                     showMsg(joinRoomMessage, 'Serverdən cavab gecikir...', 'warning');
                     joinRoomSubmitBtn.disabled = false;
                 }
             }, 10000);
        });
    }

    // Modal bağlama və Enter düymələri (əvvəlki kimi)
    closeButtons.forEach(button => { /* ... */ });
    window.addEventListener('click', (event) => { /* ... */ });
    newRoomNameInput?.addEventListener('keypress', (e) => { /* ... */ });
    newRoomPasswordInput?.addEventListener('keypress', (e) => { /* ... */ });
    joinRoomPasswordInput?.addEventListener('keypress', (e) => { /* ... */ });

    // ========================================

}); // DOMContentLoaded Sonu