// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Düzəliş edilmiş v2 (Scope Problemi Həlli) - Hissə 1/2

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Lobby JS (Scope Fix) Başladı.");

    // ---- Qlobal Dəyişənlər ----
    let loggedInUser = null;
    let currentRooms = {};
    let socket = null;

    // ---- DOM Elementləri ----
    const roomListContainer = document.getElementById('room-list-container');
    const infoMessageArea = document.getElementById('info-message-area');
    const createRoomButton = document.getElementById('create-room-button');
    const createRoomModal = document.getElementById('create-room-modal');
    const createRoomSubmitBtn = document.getElementById('create-room-submit-btn');
    const createRoomMessage = document.getElementById('create-room-message');
    const newRoomNameInput = document.getElementById('new-room-name');
    const newRoomPasswordInput = document.getElementById('new-room-password');
    const newBoardSizeSelect = document.getElementById('new-board-size');
    const newRoomRuleDisplay = document.getElementById('new-room-rule-display');
    const joinRoomModal = document.getElementById('join-room-modal');
    const joinRoomTitle = document.getElementById('join-room-title');
    const joinRoomIdInput = document.getElementById('join-room-id');
    const joinRoomPasswordInput = document.getElementById('join-room-password');
    const joinRoomSubmitBtn = document.getElementById('join-room-submit-btn');
    const joinRoomMessage = document.getElementById('join-room-message');
    const userInfoPlaceholder = document.getElementById('user-info-placeholder');
    const welcomeText = document.getElementById('welcome-text');
    const closeButtons = document.querySelectorAll('.close-button');

    // ---- Yardımçı Funksiyalar (Əvvəlcədən Təyin Edilir) ----
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

    // ---- Otaq Elementi Yaratma (Əvvəlcədən Təyin Edilir) ----
     function createRoomElement(room) {
        // console.log("[createRoomElement] Başladı - Room:", JSON.stringify(room));
        if (!room || typeof room !== 'object' || !room.id || !loggedInUser) {
            console.error("[createRoomElement] XƏTA: Keçərsiz 'room' obyekti və ya 'loggedInUser' yoxdur!", room);
            return null;
        }

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

            const roomStatusDiv = document.createElement('div');
            roomStatusDiv.classList.add('room-status');
            const playersSpan = document.createElement('span');
            playersSpan.classList.add('players');
            playersSpan.textContent = `${room.playerCount}/2`;
            roomStatusDiv.appendChild(playersSpan);

            if (room.hasPassword) {
                const lockIcon = document.createElement('i');
                lockIcon.className = 'fas fa-lock lock-icon';
                roomStatusDiv.appendChild(lockIcon);
            }

            const deleteButtonContainer = document.createElement('div');
            if (!room.isAiRoom && room.creatorUsername === loggedInUser.nickname) {
                 const deleteBtn = document.createElement('button');
                 deleteBtn.classList.add('delete-room-btn');
                 deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1h3.5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5"/></svg>`;
                 deleteBtn.title = "Otağı Sil";
                 deleteBtn.addEventListener('click', (e) => {
                     e.stopPropagation();
                     if (confirm(`'${escapeHtml(room.name)}' otağını silmək istədiyinizə əminsiniz?`)) {
                          if (socket && socket.connected) {
                               console.log(`"delete_room" hadisəsi göndərilir: roomId=${room.id}`);
                               socket.emit('delete_room', { roomId: room.id });
                          } else {
                               alert("Serverlə bağlantı yoxdur.");
                          }
                     }
                 });
                 deleteButtonContainer.appendChild(deleteBtn);
            }

            line1.appendChild(roomNameDiv);
            line1.appendChild(roomStatusDiv);
            line1.appendChild(deleteButtonContainer);

            // --- Ayırıcı Xətt ---
            const separator = document.createElement('div');
            separator.classList.add('room-item-separator');

            // --- Alt Satır ---
            const line2 = document.createElement('div');
            line2.classList.add('room-item-line2');
            const playerNameDisplay = document.createElement('div');
            playerNameDisplay.classList.add('player-name-display');

            const p1NameSpan = document.createElement('span');
            p1NameSpan.classList.add('player1-name');
            p1NameSpan.textContent = room.player1Username ? escapeHtml(room.player1Username) : 'Gözlənilir...';

            const vsIconSpan = document.createElement('span');
            vsIconSpan.classList.add('vs-icon');
            vsIconSpan.innerHTML = `<svg viewBox="0 0 100 100"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="80" font-weight="bold" fill="currentColor">vs</text></svg>`;

            const p2NameSpan = document.createElement('span');
            if (room.player2Username) {
                p2NameSpan.classList.add('player2-name');
                p2NameSpan.textContent = escapeHtml(room.player2Username);
            } else {
                p2NameSpan.classList.add('empty-slot');
                p2NameSpan.textContent = room.isAiRoom ? escapeHtml(room.creatorUsername) : 'Boş Slot';
            }

            [p1NameSpan, p2NameSpan].forEach(span => {
                 if (span.textContent && span.textContent !== 'Gözlənilir...' && span.textContent !== 'Boş Slot') {
                      span.addEventListener('mouseenter', () => {
                           document.querySelectorAll('.player1-name, .player2-name').forEach(s => s.classList.remove('is-hovered-player'));
                           span.classList.add('is-hovered-player');
                      });
                      span.addEventListener('mouseleave', () => {
                           span.classList.remove('is-hovered-player');
                      });
                 }
            });

            playerNameDisplay.appendChild(p1NameSpan);
            playerNameDisplay.appendChild(vsIconSpan);
            playerNameDisplay.appendChild(p2NameSpan);
            line2.appendChild(playerNameDisplay);

            li.appendChild(line1);
            li.appendChild(separator);
            li.appendChild(line2);

            // Click listener
            if (!room.isAiRoom || room.playerCount < 1) { // AI room can be clicked if empty
                li.addEventListener('click', () => handleRoomClick(room));
                li.style.cursor = 'pointer';
            } else if(room.isAiRoom && room.playerCount >=1) {
                 li.style.cursor = 'not-allowed'; // Cannot join occupied AI room
                 li.title = "Bu AI otağı hazırda istifadə edilir.";
            } else if(!room.isAiRoom && room.playerCount >= 2) {
                li.style.cursor = 'not-allowed'; // Cannot join full normal room
                 li.title = "Bu otaq doludur.";
            }

            return li;

        } catch (error) {
            console.error(`[createRoomElement] XƏTA baş verdi - Room ID: ${room?.id}`, error);
            return null;
        }
    } // createRoomElement Sonu


    // ---- Otaq Siyahısı Boş Nəzarəti (Əvvəlcədən Təyin Edilir) ----
    function checkIfRoomListEmpty(roomCount) {
        // console.log(`checkIfRoomListEmpty: roomCount=${roomCount}`); // Bunu azaltmaq olar
        if (!infoMessageArea) return;
        if (roomCount > 0) {
            infoMessageArea.style.display = 'none';
        } else {
            infoMessageArea.textContent = 'Hazırda aktiv otaq yoxdur. Yeni bir otaq yaradın!';
            infoMessageArea.style.display = 'block';
            infoMessageArea.style.color = 'var(--subtle-text)';
        }
    } // checkIfRoomListEmpty sonu


    // ---- Otaq Siyahısını Göstərmə (Əvvəlcədən Təyin Edilir) ----
    function displayRooms(roomsToDisplay) {
        console.log("Lobby: displayRooms funksiyası çağırıldı. Göstəriləcək otaq sayı:", roomsToDisplay?.length ?? 0);
        if (!roomListContainer) {
            console.error("roomListContainer tapılmadı!");
            return;
        }

        const existingElements = {};
         roomListContainer.querySelectorAll('.room-item[data-room-id]').forEach(el => {
             existingElements[el.dataset.roomId] = el;
         });

        const incomingRoomIds = new Set(roomsToDisplay.map(room => room.id));
        let hasVisibleRooms = false;
        let currentRoomCount = 0; // Görünən otaqları saymaq üçün

        // Add or update rooms
        roomsToDisplay.forEach((room, index) => {
             currentRoomCount++;
            const existingElement = existingElements[room.id];
            if (existingElement) {
                // TODO: Update existing element if needed (e.g., player names, count)
                delete existingElements[room.id];
                hasVisibleRooms = true;
            } else {
                const newElement = createRoomElement(room);
                if (newElement) {
                    roomListContainer.appendChild(newElement);
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            if(newElement.parentNode === roomListContainer) { // Hələ də DOM-dadırsa
                                 newElement.classList.add('entering');
                            }
                        }, index * 30);
                    });
                    hasVisibleRooms = true;
                } else {
                    currentRoomCount--; // Element yaradıla bilmədisə sayma
                }
            }
        });

         // Remove rooms that are no longer in the list
         Object.values(existingElements).forEach(elementToRemove => {
              elementToRemove.classList.remove('entering');
              elementToRemove.classList.add('exiting');
              setTimeout(() => {
                   if (elementToRemove.parentNode === roomListContainer) {
                        roomListContainer.removeChild(elementToRemove);
                   }
                   // Check emptiness after removal attempt
                   checkIfRoomListEmpty(roomListContainer.childElementCount);
              }, 350);
         });


         // Check emptiness based on current count before removals finish
         checkIfRoomListEmpty(currentRoomCount);

        // console.log("Lobby: displayRooms funksiyası bitdi.");
    } // displayRooms Sonu

     // ---- Otağa Klikləmə (Əvvəlcədən Təyin Edilir) ----
     function handleRoomClick(room) {
         if (!socket || !socket.connected) {
             alert("Serverlə bağlantı yoxdur. Zəhmət olmasa səhifəni yeniləyin.");
             return;
         }
        if (!room || !room.id) return;

        console.log(`Otağa klikləndi: ${room.name} (${room.id}), AI: ${room.isAiRoom}, Şifrəli: ${room.hasPassword}, Dolu: ${room.playerCount >= 2}`);

        // AI Otağına Qoşulma
        if (room.isAiRoom) {
            if(room.playerCount >= 1) {
                 // alert("Bu AI otağı hazırda başqası tərəfindən istifadə edilir."); // Onsuz da kliklənməz olmalıdır
                 console.warn("Dolu AI otağına klikləmə hadisəsi işlədi?");
                 return;
            }
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
            // alert("Bu otaq artıq doludur."); // Onsuz da kliklənməz olmalıdır
            console.warn("Dolu normal otağa klikləmə hadisəsi işlədi?");
            return;
        }

        if (room.hasPassword) {
            console.log(`Şifrəli otaq (${room.id}) üçün modal açılır.`);
            if (joinRoomIdInput) joinRoomIdInput.value = room.id;
            if (joinRoomTitle) joinRoomTitle.textContent = `Otağa Qoşul: ${escapeHtml(room.name)}`;
            if (joinRoomPasswordInput) joinRoomPasswordInput.value = '';
            if (joinRoomMessage) joinRoomMessage.textContent = ''; joinRoomMessage.className = 'message';
             if(joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false;
            showModal(joinRoomModal);
        } else {
            console.log(`Şifrəsiz otağa (${room.id}) qoşulma tələbi göndərilir...`);
            socket.emit('join_room', { roomId: room.id });
        }
    } // handleRoomClick Sonu


    // ===== GİRİŞ YOXLAMASI (Session ilə) - Başlanğıcda Edilir =====
    try {
        console.log("Lobby: /check-auth sorğusu göndərilir...");
        const response = await fetch('/check-auth');
        const data = await response.json();

        if (!response.ok || !data.loggedIn || !data.user) {
            console.log("Lobby JS: Giriş edilməyib, login səhifəsinə yönləndirilir...");
            window.location.href = '/ANA SEHIFE/login/login.html';
            return;
        }

        loggedInUser = data.user;
        console.log(`Lobby JS: Giriş edilib: ${loggedInUser.nickname}`);

        if (userInfoPlaceholder) userInfoPlaceholder.textContent = `İstifadəçi: ${escapeHtml(loggedInUser.nickname)}`;
        if (welcomeText) welcomeText.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUser.nickname)}</strong>! Oyuna qatmaq üçün otaq seçin və ya yenisini yaradın.`;

        // Socket Bağlantısını Qur
        setupSocketConnection(); // <- Autentifikasiya uğurlu olduqdan sonra çağırılır

    } catch (error) {
        console.error("Lobby JS: Auth yoxlama xətası:", error);
        alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
        // window.location.href = '/ANA SEHIFE/login/login.html';
        if (userInfoPlaceholder) { userInfoPlaceholder.textContent = "Xəta!"; userInfoPlaceholder.style.color = "var(--danger-color)"; }
        if (infoMessageArea) { infoMessageArea.textContent = "Serverlə əlaqə qurmaq mümkün olmadı."; infoMessageArea.style.color = "var(--danger-color)"; }
        return;
    }

    // =======================================

    // --- Hissə 1 Sonu ---
    // public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Düzəliş edilmiş v2 (Scope Problemi Həlli) - Hissə 2/2

// ---- DOMContentLoaded içində davam edirik (Hissə 1-dən) ----

    // ---- Socket.IO Bağlantısı Qurulumu və Hadisə Dinləyiciləri ----
    function setupSocketConnection() {
        if (socket && socket.connected) {
             console.log("Köhnə socket bağlantısı bağlanılır...");
             socket.disconnect();
        }

        console.log("Yeni Socket.IO bağlantısı qurulur...");
        socket = io({
            reconnectionAttempts: 5,
        });

        // --- Əsas Socket Hadisələri ---
        socket.on('connect', () => {
            console.log('Socket.IO Serverinə qoşuldu! ID:', socket.id);
             if (infoMessageArea) {
                 infoMessageArea.textContent = 'Serverdən otaq siyahısı alınır...';
                 infoMessageArea.style.color = 'var(--subtle-text)';
             }
             // Server qoşulduqda avtomatik olaraq ilkin siyahını göndərməlidir (server.js logikasına əsasən)
        });

        socket.on('disconnect', (reason) => {
            console.warn('Socket.IO bağlantısı kəsildi:', reason);
             if (infoMessageArea) {
                 infoMessageArea.textContent = 'Serverlə bağlantı kəsildi. Yenidən qoşulmağa cəhd edilir...';
                 infoMessageArea.style.color = 'var(--warning-color)';
             }
             // Clear the room list on disconnect to avoid showing stale data
             displayRooms([]);
             currentRooms = {};
        });

        socket.on('connect_error', (error) => {
            console.error('Socket.IO qoşulma xətası:', error.message);
             if (infoMessageArea) {
                 infoMessageArea.textContent = 'Serverə qoşulmaq mümkün olmadı.';
                 infoMessageArea.style.color = 'var(--danger-color)';
             }
             displayRooms([]); // Clear rooms on connection error
             currentRooms = {};
        });

        // --- Otaqlarla Bağlı Hadisələr ---

        // Bu listener artıq funksiyalar təyin olunduqdan *sonra* əlavə edilir
        socket.on('room_list_update', (roomsFromServer) => {
            console.log('Lobby: room_list_update alındı, Otaq sayı:', roomsFromServer?.length ?? 0);
            currentRooms = {}; // Obyekti təmizlə
            if(Array.isArray(roomsFromServer)) {
                roomsFromServer.forEach(room => {
                    if(room && room.id) {
                        currentRooms[room.id] = room; // Obyekt olaraq saxla
                    } else {
                         console.warn("room_list_update: Keçərsiz otaq datası alındı:", room);
                    }
                });
                 // İndi `displayRooms` funksiyası tapılmalıdır
                 displayRooms(Object.values(currentRooms));
            } else {
                 console.error("room_list_update: Array formatında data gözlənilirdi, amma başqa tip gəldi:", roomsFromServer);
                 displayRooms([]);
            }
        });

        socket.on('creation_error', (errorMessage) => {
            console.error('Otaq yaratma xətası:', errorMessage);
            showMsg(createRoomMessage, errorMessage, 'error');
             if(createRoomSubmitBtn) createRoomSubmitBtn.disabled = false;
        });

        socket.on('join_error', (errorMessage) => {
             console.error('Otağa qoşulma xətası:', errorMessage);
             showMsg(joinRoomMessage, errorMessage, 'error');
             if(joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false;
        });

        socket.on('room_joined', (data) => {
            console.log(`Otağa uğurla qoşuldunuz: ${data.roomName} (${data.roomId})`);
            hideModal(joinRoomModal);
            // Oyun səhifəsinə yönləndir
            const params = new URLSearchParams({
                 roomId: data.roomId,
                 roomName: encodeURIComponent(data.roomName),
                 playerName: encodeURIComponent(loggedInUser.nickname),
                 size: data.boardSize,
                 // AI otağı üçün əlavə parametr göndərməyə ehtiyac yoxdur, server bilir
             });
             window.location.href = `../game/oda_ici.html?${params.toString()}`;
        });

        socket.on('delete_error', (errorMessage) => {
              console.error('Otaq silmə xətası:', errorMessage);
              alert(`Otaq silinərkən xəta: ${errorMessage}`); // İstifadəçiyə bildirək
        });

    } // setupSocketConnection sonu


    // ---- Modal Pəncərələrin İşləməsi və Form Göndərmə ----

    // Yeni Otaq Yaratma
    if (createRoomButton && createRoomModal) {
        createRoomButton.addEventListener('click', () => {
             console.log("Yeni otaq yaratma modalı açılır.");
             if(newRoomNameInput) newRoomNameInput.value = '';
             if(newRoomPasswordInput) newRoomPasswordInput.value = '';
             if(newBoardSizeSelect) newBoardSizeSelect.value = '3';
             updateRoomRuleDisplay();
             if(createRoomMessage) createRoomMessage.textContent = ''; createRoomMessage.className = 'message';
             if(createRoomSubmitBtn) createRoomSubmitBtn.disabled = false;
             showModal(createRoomModal);
        });
    } else {
        console.error("Otaq yaratma düyməsi və ya modalı tapılmadı!");
    }

    if (createRoomSubmitBtn && newRoomNameInput && newRoomPasswordInput && newBoardSizeSelect) {
        createRoomSubmitBtn.addEventListener('click', () => {
            if (!socket || !socket.connected) {
                 showMsg(createRoomMessage, 'Serverlə bağlantı yoxdur!', 'error');
                 return;
            }

            const roomName = newRoomNameInput.value.trim();
            const roomPassword = newRoomPasswordInput.value;
            const boardSize = newBoardSizeSelect.value;

            if (!roomName) { showMsg(createRoomMessage, 'Otaq adı boş ola bilməz.', 'error'); return; }
            if (roomPassword && roomPassword.length > 0) {
                 if (roomPassword.length < 2) { showMsg(createRoomMessage, 'Şifrə ən az 2 simvol olmalıdır.', 'error'); return; }
                 if (!(/[a-zA-Z]/.test(roomPassword) && /\d/.test(roomPassword))) { showMsg(createRoomMessage, 'Şifrə ən az 1 hərf və 1 rəqəm ehtiva etməlidir.', 'error'); return; }
            }

            console.log(`"create_room" hadisəsi göndərilir:`, { name: roomName, password: roomPassword ? '***' : null, boardSize });
            showMsg(createRoomMessage, 'Otaq yaradılır...', 'info');
            createRoomSubmitBtn.disabled = true;

            socket.emit('create_room', {
                name: roomName,
                password: roomPassword || null,
                boardSize: boardSize
            });

            // Cavab gözləmə timeout
             setTimeout(() => {
                  if(createRoomSubmitBtn && createRoomSubmitBtn.disabled) { // Submit button could be gone if modal closed quickly
                     console.warn("Otaq yaratma cavabı çox gecikdi, düymə aktiv edilir.");
                     // showMsg(createRoomMessage, 'Serverdən cavab alınmadı.', 'error');
                     createRoomSubmitBtn.disabled = false;
                  }
             }, 7000); // Timeout müddətini bir az artırdıq (7 saniyə)

            // Modalın bağlanmasını serverdən uğurlu cavab gəldikdən sonra etmək daha yaxşı olar,
            // amma hələlik sadəlik üçün burada saxlayırıq.
             // socket.on('room_created_successfully', () => hideModal(createRoomModal)); // Ideal budur
              setTimeout(() => hideModal(createRoomModal), 500); // İlkin bağlama

        });
    } else {
         console.error("Yeni otaq yaratma formu elementləri tapılmadı!");
    }

    // Şifrəli Otağa Qoşulma
    if (joinRoomSubmitBtn && joinRoomIdInput && joinRoomPasswordInput) {
         joinRoomSubmitBtn.addEventListener('click', () => {
              if (!socket || !socket.connected) {
                  showMsg(joinRoomMessage, 'Serverlə bağlantı yoxdur!', 'error');
                  return;
              }

             const roomId = joinRoomIdInput.value;
             const password = joinRoomPasswordInput.value;

             if (!roomId) { showMsg(joinRoomMessage, 'Otaq ID tapılmadı.', 'error'); return; }
             if (!password) { showMsg(joinRoomMessage, 'Zəhmət olmasa, şifrəni daxil edin.', 'error'); return; }

             console.log(`"join_room" (şifrə ilə) hadisəsi göndərilir: roomId=${roomId}`);
              showMsg(joinRoomMessage, 'Otağa qoşulunur...', 'info');
              joinRoomSubmitBtn.disabled = true;

             socket.emit('join_room', { roomId: roomId, password: password });

              // Timeout
              setTimeout(() => {
                   if(joinRoomSubmitBtn && joinRoomSubmitBtn.disabled) {
                        console.warn("Otağa qoşulma cavabı çox gecikdi, düymə aktiv edilir.");
                        joinRoomSubmitBtn.disabled = false;
                        // showMsg(joinRoomMessage, 'Serverdən cavab alınmadı.', 'error');
                   }
              }, 7000); // 7 saniyə timeout
         });
    } else {
         console.error("Otağa qoşulma modalı elementləri tapılmadı!");
    }

    // Modal Bağlama Düymələri
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modalId = button.getAttribute('data-modal-id');
            const modalToClose = document.getElementById(modalId);
            if (modalToClose) {
                hideModal(modalToClose);
            }
        });
    });

    // Modal Xaricinə Klikləmə
    window.addEventListener('click', (event) => {
        if (event.target === createRoomModal) hideModal(createRoomModal);
        if (event.target === joinRoomModal) hideModal(joinRoomModal);
    });

    // Board Size Seçimində Qaydanı Yeniləmə
    if(newBoardSizeSelect) {
         newBoardSizeSelect.addEventListener('change', updateRoomRuleDisplay);
         // Initialize the rule display on load
         updateRoomRuleDisplay();
     }

    console.log("Lobby JS bütün quraşdırmanı bitirdi.");

}); // DOMContentLoaded Sonu