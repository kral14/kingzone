// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Düzəliş edilmiş v4 (playerCount Xətası Düzəlişi) - Hissə 1/2

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Lobby JS (playerCount Fix) Başladı.");

    // ---- Qlobal Dəyişənlər ----
    let loggedInUser = null;
    let currentRooms = {};
    let socket = null;

    // ---- DOM Elementləri ----
    const roomListContainer = document.getElementById('room-list-container');
    const infoMessageArea = document.getElementById('info-message-area');
    // ... (digər DOM elementləri əvvəlki kimi) ...
    const welcomeText = document.getElementById('welcome-text');
    const closeButtons = document.querySelectorAll('.close-button');

    // ---- Yardımçı Funksiyalar ----
    // ... (escapeHtml, showModal, hideModal, showMsg, updateRoomRuleDisplay əvvəlki kimi) ...
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return String(unsafe);
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function showModal(modalElement) {
        if (modalElement) {
            const messageElement = modalElement.querySelector('.message');
            if (messageElement) {
                messageElement.textContent = '';
                messageElement.className = 'message';
            }
            modalElement.style.display = 'block';
            const firstInput = modalElement.querySelector('input[type="text"], input[type="password"]');
            if(firstInput && firstInput.type !== 'hidden') {
                setTimeout(() => firstInput.focus(), 50);
            }
        } else {
            console.error("showModal: Modal elementi tapılmadı!");
        }
    }

    function hideModal(modalElement) {
        if (modalElement) {
            modalElement.style.display = 'none';
            const form = modalElement.querySelector('form');
            if(form) form.reset();
             else {
                 const inputs = modalElement.querySelectorAll('input');
                 inputs.forEach(input => {
                    if(input.type !== 'hidden' && input.type !== 'submit' && input.type !== 'button' && input.type !== 'checkbox' && input.type !== 'radio') {
                        input.value = '';
                    } else if (input.type === 'checkbox' || input.type === 'radio'){
                         input.checked = false;
                    }
                 });
                 const selects = modalElement.querySelectorAll('select');
                 selects.forEach(select => select.selectedIndex = 0);
             }
            const messageElement = modalElement.querySelector('.message');
             if (messageElement) {
                 messageElement.textContent = '';
                 messageElement.className = 'message';
             }
        } else {
            console.error("hideModal: Modal elementi tapılmadı!");
        }
    }

    function showMsg(element, message, type = 'error') {
        if (element) {
            element.textContent = message;
            element.className = `message ${type}`;
        } else {
             console.error(`showMsg: Mesaj elementi tapılmadı. Mesaj: ${message}`);
        }
    }

     function updateRoomRuleDisplay() {
         const newBoardSizeSelect = document.getElementById('new-board-size');
         const newRoomRuleDisplay = document.getElementById('new-room-rule-display');
         if (!newBoardSizeSelect || !newRoomRuleDisplay) return;
         const size = parseInt(newBoardSizeSelect.value, 10);
         let ruleText = '';
         if (size === 3 || size === 4) {
             ruleText = "Qazanmaq üçün 3 xana yan-yana lazımdır.";
         } else if (size === 5 || size === 6) {
             ruleText = "Qazanmaq üçün 4 xana yan-yana lazımdır.";
         }
         newRoomRuleDisplay.textContent = ruleText;
     }


    // ---- Otaq Elementi Yaratma (playerCount Düzəlişi ilə) ----
    function createRoomElement(room) {
        // console.log("[createRoomElement] Başladı - Room:", JSON.stringify(room)); // Bunu debug üçün aça bilərsiniz
        // <<< DƏYİŞİKLİK BAŞLANĞICI: room.playerCount yoxlaması >>>
        if (!room || typeof room !== 'object' || !room.id || typeof room.playerCount !== 'number' || !loggedInUser) {
            console.error("[createRoomElement] XƏTA: Keçərsiz 'room' obyekti (playerCount yoxdur?) və ya 'loggedInUser' yoxdur!", room);
            return null;
        }
        // <<< DƏYİŞİKLİK SONU >>>

        try {
            const li = document.createElement('li');
            li.classList.add('room-item');
            li.dataset.roomId = room.id;
            li.dataset.roomName = room.name;
            li.dataset.isAi = room.isAiRoom || false;
            li.dataset.requiresPassword = room.hasPassword || false;

            // --- Üst Satır ---
            const line1 = document.createElement('div');
            line1.classList.add('room-item-line1');

            // Oda Adı
            const roomNameDiv = document.createElement('div');
            roomNameDiv.classList.add('room-name');
            const originalTextSpan = document.createElement('span');
            originalTextSpan.classList.add('display-text', 'original-text');
            originalTextSpan.textContent = escapeHtml(room.name);
            const hoverTextSpan = document.createElement('span');
            hoverTextSpan.classList.add('display-text', 'hover-text');
            const hoverTextContent = room.isAiRoom ? "SNOW ilə Oyna" : (room.playerCount < 2 ? "Otağa Qoşul" : "İzlə (tezliklə)");
            hoverTextSpan.textContent = hoverTextContent;
            roomNameDiv.appendChild(originalTextSpan);
            roomNameDiv.appendChild(hoverTextSpan);

             roomNameDiv.addEventListener('mouseenter', () => {
                 if (!room.isAiRoom && room.playerCount >= 2) return;
                 roomNameDiv.classList.add('is-hovered');
             });
             roomNameDiv.addEventListener('mouseleave', () => {
                 roomNameDiv.classList.remove('is-hovered');
             });

            // Oda Statusu
            const roomStatusDiv = document.createElement('div');
            roomStatusDiv.classList.add('room-status');
            const playersSpan = document.createElement('span');
            playersSpan.classList.add('players');

            // <<< DƏYİŞİKLİK BAŞLANĞICI: room.playerCount istifadəsi >>>
            // Serverdən gələn playerCount istifadə edilir
            const displayPlayerCount = room.isAiRoom ? Math.min(room.playerCount + 1, 2) : room.playerCount;
            playersSpan.textContent = room.isAiRoom ? `${displayPlayerCount}/2` : `${room.playerCount}/2`;
            // <<< DƏYİŞİKLİK SONU >>>

            roomStatusDiv.appendChild(playersSpan);

            if (room.hasPassword) {
                const lockIcon = document.createElement('i');
                lockIcon.className = 'fas fa-lock lock-icon';
                roomStatusDiv.appendChild(lockIcon);
            }

            // Silmə Düyməsi
            const deleteButtonContainer = document.createElement('div');
            if (!room.isAiRoom && room.creatorUsername === loggedInUser.nickname) {
                 const deleteBtn = document.createElement('button');
                 deleteBtn.classList.add('delete-room-btn');
                 deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1h3.5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5"/></svg>`;
                 deleteBtn.title = "Otağı Sil";
                 deleteBtn.addEventListener('click', (e) => { /* ... (silmə logikası əvvəlki kimi) ... */ });
                 deleteButtonContainer.appendChild(deleteBtn);
            }

            line1.appendChild(roomNameDiv);
            line1.appendChild(roomStatusDiv);
            line1.appendChild(deleteButtonContainer);

            // Ayırıcı Xətt
            const separator = document.createElement('div');
            separator.classList.add('room-item-separator');

            // Alt Satır
            const line2 = document.createElement('div');
            line2.classList.add('room-item-line2');
            const playerNameDisplay = document.createElement('div');
            playerNameDisplay.classList.add('player-name-display');

            // Oyunçu Adları (player1Username, player2Username serverdən gəlir)
            const p1NameSpan = document.createElement('span');
            p1NameSpan.classList.add('player1-name');
            p1NameSpan.textContent = room.player1Username ? escapeHtml(room.player1Username) : (room.isAiRoom ? 'Gözlənilir...' : 'Gözlənilir...');

            const vsIconSpan = document.createElement('span');
            vsIconSpan.classList.add('vs-icon');
            vsIconSpan.innerHTML = `<svg viewBox="0 0 100 100"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="80" font-weight="bold" fill="currentColor">vs</text></svg>`;

            const p2NameSpan = document.createElement('span');
            if (room.isAiRoom) {
                 p2NameSpan.classList.add('player2-name');
                 p2NameSpan.textContent = escapeHtml(room.creatorUsername); // SNOW
            } else if (room.player2Username) {
                p2NameSpan.classList.add('player2-name');
                p2NameSpan.textContent = escapeHtml(room.player2Username);
            } else {
                p2NameSpan.classList.add('empty-slot');
                p2NameSpan.textContent = 'Boş Slot';
            }

            // Hover listenerları (əvvəlki kimi)
             [p1NameSpan, p2NameSpan].forEach(span => { /* ... */ });

            playerNameDisplay.appendChild(p1NameSpan);
            playerNameDisplay.appendChild(vsIconSpan);
            playerNameDisplay.appendChild(p2NameSpan);
            line2.appendChild(playerNameDisplay);

            li.appendChild(line1);
            li.appendChild(separator);
            li.appendChild(line2);

            // Klik Listener (əvvəlki kimi)
            if (room.isAiRoom || room.playerCount < 2) {
                li.addEventListener('click', () => handleRoomClick(room));
                li.style.cursor = 'pointer';
                li.title = room.isAiRoom ? "SNOW ilə Oyna" : (room.playerCount < 2 ? "Otağa Qoşul" : "");
            } else {
                li.style.cursor = 'not-allowed';
                li.title = "Bu otaq doludur.";
            }

            return li;

        } catch (error) {
            console.error(`[createRoomElement] XƏTA baş verdi - Room ID: ${room?.id}`, error);
            return null;
        }
    } // createRoomElement Sonu

    // ---- Otaq Siyahısı Boş Nəzarəti ----
    // ... (əvvəlki kimi) ...
     function checkIfRoomListEmpty(roomCount) {
         const infoMessageArea = document.getElementById('info-message-area');
         if (!infoMessageArea) return;
         if (roomCount > 0) {
             infoMessageArea.style.display = 'none';
         } else {
             infoMessageArea.textContent = 'Hazırda aktiv otaq yoxdur. Yeni bir otaq yaradın!';
             infoMessageArea.style.display = 'block';
             infoMessageArea.style.color = 'var(--subtle-text)';
         }
     }

    // ---- Otaq Siyahısını Göstərmə ----
    // ... (əvvəlki kimi, artıq düzəldilmiş createRoomElement istifadə edəcək) ...
     function displayRooms(roomsToDisplay) {
         const roomListContainer = document.getElementById('room-list-container');
         console.log("Lobby: displayRooms funksiyası çağırıldı. Göstəriləcək otaq sayı:", roomsToDisplay?.length ?? 0);
         if (!roomListContainer) { console.error("roomListContainer tapılmadı!"); return; }

         const existingElements = {};
         roomListContainer.querySelectorAll('.room-item[data-room-id]').forEach(el => { existingElements[el.dataset.roomId] = el; });

         let currentRoomCount = 0;

         roomsToDisplay.forEach((room, index) => {
             currentRoomCount++;
             const existingElement = existingElements[room.id];
             if (existingElement) {
                 // Optimallaşdırma: Yalnız dəyişən məlumatları yeniləmək olar
                 // Hələlik sadə yol: Köhnəni sil, yenisini əlavə et
                 roomListContainer.removeChild(existingElement);
                 const updatedElement = createRoomElement(room); // Düzəldilmiş funksiya çağırılır
                 if (updatedElement) {
                     roomListContainer.appendChild(updatedElement);
                     updatedElement.classList.add('entering'); // Görünüş üçün
                 } else { currentRoomCount--; }
                 delete existingElements[room.id];
             } else {
                 const newElement = createRoomElement(room); // Düzəldilmiş funksiya çağırılır
                 if (newElement) {
                     roomListContainer.appendChild(newElement);
                     requestAnimationFrame(() => { setTimeout(() => { if(newElement.parentNode) newElement.classList.add('entering'); }, index * 30); });
                 } else { currentRoomCount--; }
             }
         });

         Object.values(existingElements).forEach(elementToRemove => {
             elementToRemove.classList.remove('entering'); elementToRemove.classList.add('exiting');
             setTimeout(() => { if (elementToRemove.parentNode) elementToRemove.parentNode.removeChild(elementToRemove); checkIfRoomListEmpty(roomListContainer.childElementCount); }, 350);
         });

         checkIfRoomListEmpty(currentRoomCount);
     }


    // --- Hissə 1 Sonu ---
    // public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Düzəliş edilmiş v4 (playerCount Xətası Düzəlişi) - Hissə 2/2

// ---- DOMContentLoaded içində davam edirik (Hissə 1-dən) ----

    // ---- Otağa Klikləmə ----
    function handleRoomClick(room) {
        // Bu funksiya əvvəlki v3 versiyası ilə eynidir,
        // çünki AI otaqlarına klikləmə və yönləndirmə logikası artıq düzgün idi.
        if (!socket || !socket.connected) {
            alert("Serverlə bağlantı yoxdur. Zəhmət olmasa səhifəni yeniləyin.");
            return;
        }
       if (!room || !room.id) {
            console.error("handleRoomClick: Keçərsiz otaq parametri!");
            return;
       }

       console.log(`Otağa klikləndi: ${room.name} (${room.id}), AI: ${room.isAiRoom}, Şifrəli: ${room.hasPassword}, Oyunçu sayı (server): ${room.playerCount}`);

       // AI Otağına Qoşulma
       if (room.isAiRoom) {
           console.log(`AI otağına (${room.id}) yönləndirilir...`);
           const params = new URLSearchParams({
                roomId: room.id,
                roomName: encodeURIComponent(room.name),
                playerName: encodeURIComponent(loggedInUser.nickname),
                size: room.boardSize,
                ai: 'SNOW'
            });
            window.location.href = `../game/oda_ici.html?${params.toString()}`;
            return;
       }

       // Normal Otağa Qoşulma
       if (room.playerCount >= 2) {
           console.warn("Dolu normal otağa klikləmə hadisəsi işlədi?");
           return;
       }

       if (room.hasPassword) {
           console.log(`Şifrəli otaq (${room.id}) üçün modal açılır.`);
           const joinRoomIdInput = document.getElementById('join-room-id');
           const joinRoomTitle = document.getElementById('join-room-title');
           const joinRoomPasswordInput = document.getElementById('join-room-password');
           const joinRoomMessage = document.getElementById('join-room-message');
           const joinRoomSubmitBtn = document.getElementById('join-room-submit-btn');

           if (joinRoomIdInput) joinRoomIdInput.value = room.id;
           if (joinRoomTitle) joinRoomTitle.textContent = `Otağa Qoşul: ${escapeHtml(room.name)}`;
           if (joinRoomPasswordInput) joinRoomPasswordInput.value = '';
           if (joinRoomMessage) joinRoomMessage.textContent = ''; joinRoomMessage.className = 'message';
            if(joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false;
           showModal(document.getElementById('join-room-modal')); // Modal ID ilə çağırırıq
       } else {
           console.log(`Şifrəsiz otağa (${room.id}) qoşulma tələbi göndərilir...`);
           socket.emit('join_room', { roomId: room.id });
       }
   } // handleRoomClick Sonu


   // ===== GİRİŞ YOXLAMASI (Başlanğıcda) =====
   try {
       console.log("Lobby: /check-auth sorğusu göndərilir...");
       const response = await fetch('/check-auth');
       const data = await response.json();

       if (!response.ok || !data.loggedIn || !data.user) {
           console.log("Lobby JS: Giriş edilməyib, loginə yönləndirilir...");
           window.location.href = '/ANA SEHIFE/login/login.html';
           return;
       }

       loggedInUser = data.user;
       console.log(`Lobby JS: Giriş edilib: ${loggedInUser.nickname}`);
       const userInfoPlaceholder = document.getElementById('user-info-placeholder');
       const welcomeText = document.getElementById('welcome-text');
       if (userInfoPlaceholder) userInfoPlaceholder.textContent = `İstifadəçi: ${escapeHtml(loggedInUser.nickname)}`;
       if (welcomeText) welcomeText.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUser.nickname)}</strong>! Oyuna qatmaq üçün otaq seçin və ya yenisini yaradın.`;

       // Socket Bağlantısını Qur
       setupSocketConnection();

   } catch (error) {
       console.error("Lobby JS: Auth yoxlama xətası:", error);
       alert("Sessiya yoxlanılarkən xəta baş verdi.");
       const userInfoPlaceholder = document.getElementById('user-info-placeholder');
       const infoMessageArea = document.getElementById('info-message-area');
       if (userInfoPlaceholder) { userInfoPlaceholder.textContent = "Xəta!"; userInfoPlaceholder.style.color = "var(--danger-color)"; }
       if (infoMessageArea) { infoMessageArea.textContent = "Serverlə əlaqə qurmaq mümkün olmadı."; infoMessageArea.style.color = "var(--danger-color)"; }
       return;
   }
   // =======================================


   // ---- Socket.IO Bağlantısı Qurulumu və Hadisə Dinləyiciləri ----
   function setupSocketConnection() {
       if (socket && socket.connected) { socket.disconnect(); }

       console.log("Yeni Socket.IO bağlantısı qurulur...");
       socket = io({ reconnectionAttempts: 5 });

       socket.on('connect', () => {
           console.log('Socket.IO Serverinə qoşuldu! ID:', socket.id);
           const infoMessageArea = document.getElementById('info-message-area');
            if (infoMessageArea) { infoMessageArea.textContent = 'Serverdən otaq siyahısı alınır...'; infoMessageArea.style.color = 'var(--subtle-text)';}
       });

       socket.on('disconnect', (reason) => {
           console.warn('Socket.IO bağlantısı kəsildi:', reason);
            const infoMessageArea = document.getElementById('info-message-area');
            if (infoMessageArea) { infoMessageArea.textContent = 'Serverlə bağlantı kəsildi...'; infoMessageArea.style.color = 'var(--warning-color)';}
            displayRooms([]); currentRooms = {};
       });

       socket.on('connect_error', (error) => {
           console.error('Socket.IO qoşulma xətası:', error.message);
            const infoMessageArea = document.getElementById('info-message-area');
            if (infoMessageArea) { infoMessageArea.textContent = 'Serverə qoşulmaq mümkün olmadı.'; infoMessageArea.style.color = 'var(--danger-color)';}
            displayRooms([]); currentRooms = {};
       });

       // Otaq Siyahısı Yeniləməsi
       socket.on('room_list_update', (roomsFromServer) => {
           console.log('Lobby: room_list_update alındı, Otaq sayı:', roomsFromServer?.length ?? 0);
           currentRooms = {};
           if(Array.isArray(roomsFromServer)) {
               roomsFromServer.forEach(room => { if(room && room.id) currentRooms[room.id] = room; else console.warn("Keçərsiz otaq datası:", room); });
                displayRooms(Object.values(currentRooms)); // `displayRooms` artıq təyin olunub
           } else { console.error("room_list_update: Array gözlənilirdi!", roomsFromServer); displayRooms([]); }
       });

       // Xəta Hadisələri
       socket.on('creation_error', (errorMessage) => {
           console.error('Otaq yaratma xətası:', errorMessage);
           showMsg(document.getElementById('create-room-message'), errorMessage, 'error');
           const btn = document.getElementById('create-room-submit-btn'); if(btn) btn.disabled = false;
       });
       socket.on('join_error', (errorMessage) => {
            console.error('Otağa qoşulma xətası:', errorMessage);
            showMsg(document.getElementById('join-room-message'), errorMessage, 'error');
            const btn = document.getElementById('join-room-submit-btn'); if(btn) btn.disabled = false;
       });
       socket.on('delete_error', (errorMessage) => { console.error('Otaq silmə xətası:', errorMessage); alert(`Otaq silinərkən xəta: ${errorMessage}`); });

       // Otağa Uğurlu Qoşulma
       socket.on('room_joined', (data) => {
           console.log(`Otağa uğurla qoşuldunuz: ${data.roomName} (${data.roomId})`);
           hideModal(document.getElementById('join-room-modal'));
           const params = new URLSearchParams({ roomId: data.roomId, roomName: encodeURIComponent(data.roomName), playerName: encodeURIComponent(loggedInUser.nickname), size: data.boardSize });
           window.location.href = `../game/oda_ici.html?${params.toString()}`;
       });

   } // setupSocketConnection sonu


   // ---- Modal Pəncərələrin İşləməsi və Form Göndərmə ----
   const createRoomButton = document.getElementById('create-room-button');
   const createRoomModal = document.getElementById('create-room-modal');
   const joinRoomModal = document.getElementById('join-room-modal');

   if (document.getElementById('create-room-button') && createRoomModal) {
       (document.getElementById('create-room-button')).addEventListener('click', () => {
            console.log("Yeni otaq yaratma modalı açılır.");
            const nameInput = document.getElementById('new-room-name');
            const passInput = document.getElementById('new-room-password');
            const sizeSelect = document.getElementById('new-board-size');
            const msg = document.getElementById('create-room-message');
            const btn = document.getElementById('create-room-submit-btn');
            if(nameInput) nameInput.value = '';
            if(passInput) passInput.value = '';
            if(sizeSelect) sizeSelect.value = '3';
            updateRoomRuleDisplay();
            if(msg) msg.textContent = ''; msg.className = 'message';
            if(btn) btn.disabled = false;
            showModal(createRoomModal);
       });
   } else { console.error("Otaq yaratma düyməsi/modalı tapılmadı!"); }

   const createRoomSubmitBtn = document.getElementById('create-room-submit-btn');
   if (createRoomSubmitBtn) {
       createRoomSubmitBtn.addEventListener('click', () => {
            const msg = document.getElementById('create-room-message');
            if (!socket || !socket.connected) { showMsg(msg, 'Serverlə bağlantı yoxdur!', 'error'); return; }
            const nameInput = document.getElementById('new-room-name');
            const passInput = document.getElementById('new-room-password');
            const sizeSelect = document.getElementById('new-board-size');
            const roomName = nameInput.value.trim();
            const roomPassword = passInput.value;
            const boardSize = sizeSelect.value;
            if (!roomName) { showMsg(msg, 'Otaq adı boş ola bilməz.', 'error'); return; }
            if (roomPassword && roomPassword.length > 0) {
                if (roomPassword.length < 2 || !(/[a-zA-Z]/.test(roomPassword) && /\d/.test(roomPassword))) {
                    showMsg(msg, 'Şifrə tələblərə uyğun deyil.', 'error'); return;
                }
            }
            console.log(`"create_room" hadisəsi göndərilir...`);
            showMsg(msg, 'Otaq yaradılır...', 'info');
            createRoomSubmitBtn.disabled = true;
            socket.emit('create_room', { name: roomName, password: roomPassword || null, boardSize: boardSize });
            setTimeout(() => { if(createRoomSubmitBtn && createRoomSubmitBtn.disabled) { console.warn("Yaratma cavabı gecikdi."); createRoomSubmitBtn.disabled = false; } }, 7000);
            setTimeout(() => hideModal(createRoomModal), 500);
       });
   } else { console.error("Yeni otaq yaratma submit düyməsi tapılmadı!"); }

   const joinRoomSubmitBtn = document.getElementById('join-room-submit-btn');
   if (joinRoomSubmitBtn) {
        joinRoomSubmitBtn.addEventListener('click', () => {
            const msg = document.getElementById('join-room-message');
            if (!socket || !socket.connected) { showMsg(msg, 'Serverlə bağlantı yoxdur!', 'error'); return; }
            const idInput = document.getElementById('join-room-id');
            const passInput = document.getElementById('join-room-password');
            const roomId = idInput.value;
            const password = passInput.value;
            if (!roomId) { showMsg(msg, 'Otaq ID tapılmadı.', 'error'); return; }
            if (!password) { showMsg(msg, 'Şifrəni daxil edin.', 'error'); return; }
            console.log(`"join_room" (şifrə ilə) hadisəsi göndərilir: roomId=${roomId}`);
            showMsg(msg, 'Otağa qoşulunur...', 'info');
            joinRoomSubmitBtn.disabled = true;
            socket.emit('join_room', { roomId: roomId, password: password });
            setTimeout(() => { if(joinRoomSubmitBtn && joinRoomSubmitBtn.disabled) { console.warn("Qoşulma cavabı gecikdi."); joinRoomSubmitBtn.disabled = false; } }, 7000);
        });
   } else { console.error("Otağa qoşulma submit düyməsi tapılmadı!"); }

   // Modal Bağlama
   document.querySelectorAll('.close-button').forEach(button => { button.addEventListener('click', () => { const modalId = button.getAttribute('data-modal-id'); if (modalId) hideModal(document.getElementById(modalId)); }); });
   window.addEventListener('click', (event) => { if (event.target === createRoomModal) hideModal(createRoomModal); if (event.target === joinRoomModal) hideModal(joinRoomModal); });

   // Board Size Seçimi
   const sizeSelect = document.getElementById('new-board-size');
   if(sizeSelect) { sizeSelect.addEventListener('change', updateRoomRuleDisplay); updateRoomRuleDisplay(); }

   console.log("Lobby JS bütün quraşdırmanı bitirdi.");

}); // DOMContentLoaded Sonu