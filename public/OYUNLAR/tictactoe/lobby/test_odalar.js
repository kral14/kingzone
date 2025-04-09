// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Düzəliş edilmiş v3 (AI Otaqları Düzəlişi) - Hissə 1/2

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Lobby JS (AI Room Fix) Başladı.");

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

    // ---- Yardımçı Funksiyalar ----
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

    // ---- Otaq Elementi Yaratma (AI Düzəlişi ilə) ----
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

            // Oda Adı (Hover Effekti ilə)
            const roomNameDiv = document.createElement('div');
            roomNameDiv.classList.add('room-name');
            const originalTextSpan = document.createElement('span');
            originalTextSpan.classList.add('display-text', 'original-text');
            originalTextSpan.textContent = escapeHtml(room.name);
            const hoverTextSpan = document.createElement('span');
            hoverTextSpan.classList.add('display-text', 'hover-text');
            // <<< DƏYİŞİKLİK BAŞLANĞICI: AI Hover Mətni >>>
            const hoverTextContent = room.isAiRoom ? "SNOW ilə Oyna" : (room.playerCount < 2 ? "Otağa Qoşul" : "İzlə (tezliklə)");
            // <<< DƏYİŞİKLİK SONU >>>
            hoverTextSpan.textContent = hoverTextContent;
            roomNameDiv.appendChild(originalTextSpan);
            roomNameDiv.appendChild(hoverTextSpan);

             roomNameDiv.addEventListener('mouseenter', () => {
                 // <<< DƏYİŞİKLİK BAŞLANĞICI: AI olmayan dolu otaqlar xaric hover >>>
                 if (!room.isAiRoom && room.playerCount >= 2) return;
                 // <<< DƏYİŞİKLİK SONU >>>
                 roomNameDiv.classList.add('is-hovered');
             });
             roomNameDiv.addEventListener('mouseleave', () => {
                 roomNameDiv.classList.remove('is-hovered');
             });

            // Oda Statusu (Oyunçu sayı, Kilid)
            const roomStatusDiv = document.createElement('div');
            roomStatusDiv.classList.add('room-status');
            const playersSpan = document.createElement('span');
            playersSpan.classList.add('players');
            // <<< DƏYİŞİKLİK BAŞLANĞICI: AI Otaq Oyunçu Sayı Göstərimi >>>
            // Əgər AI otağıdırsa və boşdursa 1/2 göstər (SNOW üçün), dolu AI otağı 2/2 göstərir (serverdən gələn playerCount əsasında)
            // Normal otaqlar üçün serverdən gələn playerCount istifadə edilir
            const displayPlayerCount = room.isAiRoom ? Math.min(room.players.length + 1, 2) : room.players.length;
            playersSpan.textContent = room.isAiRoom ? `${displayPlayerCount}/2` : `${room.playerCount}/2`;
             // <<< DƏYİŞİKLİK SONU >>>
            roomStatusDiv.appendChild(playersSpan);

            if (room.hasPassword) {
                const lockIcon = document.createElement('i');
                lockIcon.className = 'fas fa-lock lock-icon';
                roomStatusDiv.appendChild(lockIcon);
            }

            // Silmə Düyməsi (Yalnız yaradan üçün və AI otağı deyilsə)
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

            // Oyunçu 1 Adı
            const p1NameSpan = document.createElement('span');
            p1NameSpan.classList.add('player1-name');
            // AI otağında real oyunçu varsa onu göstər, yoxsa "Gözlənilir..."
            p1NameSpan.textContent = room.player1Username ? escapeHtml(room.player1Username) : (room.isAiRoom ? 'Gözlənilir...' : 'Gözlənilir...');

            // VS İkonu
            const vsIconSpan = document.createElement('span');
            vsIconSpan.classList.add('vs-icon');
            vsIconSpan.innerHTML = `<svg viewBox="0 0 100 100"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="80" font-weight="bold" fill="currentColor">vs</text></svg>`;

            // Oyunçu 2 Adı və ya Boş Slot / SNOW
            const p2NameSpan = document.createElement('span');
            // <<< DƏYİŞİKLİK BAŞLANĞICI: AI Otağında P2 Göstərimi >>>
            if (room.isAiRoom) {
                 p2NameSpan.classList.add('player2-name'); // SNOW-u da oyunçu kimi göstərək
                 p2NameSpan.textContent = escapeHtml(room.creatorUsername); // Serverdə AI üçün "SNOW" yazmışdıq
            } else if (room.player2Username) {
                p2NameSpan.classList.add('player2-name');
                p2NameSpan.textContent = escapeHtml(room.player2Username);
            } else {
                p2NameSpan.classList.add('empty-slot');
                p2NameSpan.textContent = 'Boş Slot';
            }
            // <<< DƏYİŞİKLİK SONU >>>

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

            // <<< DƏYİŞİKLİK BAŞLANĞICI: Klik Listener (AI daxil) >>>
            // AI otaqları həmişə kliklənə bilər (handleRoomClick içində dolu olub-olmadığını yönləndirmədən əvvəl yoxlayacaq)
            // Normal otaqlar isə yalnız dolu deyilsə kliklənə bilər
            if (room.isAiRoom || room.playerCount < 2) {
                li.addEventListener('click', () => handleRoomClick(room));
                li.style.cursor = 'pointer';
                 li.title = room.isAiRoom ? "SNOW ilə Oyna" : (room.playerCount < 2 ? "Otağa Qoşul" : ""); // Tooltip əlavə edək
            } else {
                li.style.cursor = 'not-allowed';
                li.title = "Bu otaq doludur.";
            }
            // <<< DƏYİŞİKLİK SONU >>>

            return li;

        } catch (error) {
            console.error(`[createRoomElement] XƏTA baş verdi - Room ID: ${room?.id}`, error);
            return null;
        }
    } // createRoomElement Sonu


    // ---- Otaq Siyahısı Boş Nəzarəti ----
    function checkIfRoomListEmpty(roomCount) {
        if (!infoMessageArea) return;
        if (roomCount > 0) {
            infoMessageArea.style.display = 'none';
        } else {
            infoMessageArea.textContent = 'Hazırda aktiv otaq yoxdur. Yeni bir otaq yaradın!';
            infoMessageArea.style.display = 'block';
            infoMessageArea.style.color = 'var(--subtle-text)';
        }
    } // checkIfRoomListEmpty sonu


    // ---- Otaq Siyahısını Göstərmə ----
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
        let currentRoomCount = 0;

        // Add or update rooms
        roomsToDisplay.forEach((room, index) => {
             currentRoomCount++;
            const existingElement = existingElements[room.id];
            if (existingElement) {
                // TODO: Update existing element (optimallaşdırma üçün)
                // Hələlik sadəcə köhnəni silib yenisini əlavə edirik (daha asandır)
                roomListContainer.removeChild(existingElement);
                const updatedElement = createRoomElement(room);
                 if (updatedElement) {
                     roomListContainer.appendChild(updatedElement);
                     // Animasiya üçün klası dərhal əlavə edək
                     updatedElement.classList.add('entering'); // update animasiyası üçün fərqli klas ola bilər
                 } else {
                     currentRoomCount--;
                 }
                delete existingElements[room.id]; // Artıq işləndi

            } else {
                // Yeni otaq
                const newElement = createRoomElement(room);
                if (newElement) {
                    roomListContainer.appendChild(newElement);
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            if(newElement.parentNode === roomListContainer) {
                                 newElement.classList.add('entering');
                            }
                        }, index * 30);
                    });
                } else {
                    currentRoomCount--;
                }
            }
        });

         // Remove rooms no longer present
         Object.values(existingElements).forEach(elementToRemove => {
              elementToRemove.classList.remove('entering');
              elementToRemove.classList.add('exiting');
              setTimeout(() => {
                   if (elementToRemove.parentNode === roomListContainer) {
                        roomListContainer.removeChild(elementToRemove);
                   }
                   checkIfRoomListEmpty(roomListContainer.childElementCount);
              }, 350);
         });

         checkIfRoomListEmpty(currentRoomCount);
    } // displayRooms Sonu

    // --- Hissə 1 Sonu ---
    // public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Düzəliş edilmiş v3 (AI Otaqları Düzəlişi) - Hissə 2/2

// ---- DOMContentLoaded içində davam edirik (Hissə 1-dən) ----

    // ---- Otağa Klikləmə (AI Düzəlişi ilə) ----
    function handleRoomClick(room) {
        if (!socket || !socket.connected) {
            alert("Serverlə bağlantı yoxdur. Zəhmət olmasa səhifəni yeniləyin.");
            return;
        }
        if (!room || !room.id) {
             console.error("handleRoomClick: Keçərsiz otaq parametri!");
             return;
        }

        console.log(`Otağa klikləndi: ${room.name} (${room.id}), AI: ${room.isAiRoom}, Şifrəli: ${room.hasPassword}, Oyunçu sayı (server): ${room.playerCount}`);

        // <<< DƏYİŞİKLİK BAŞLANĞICI: AI Otağına Qoşulma (Birbaşa Yönləndirmə) >>>
        if (room.isAiRoom) {
            // AI otaqları üçün dolu olub olmadığını yoxlamağa ehtiyac yoxdur,
            // server tərəfindən idarə olunmur, birbaşa oyuna keçirik.
            console.log(`AI otağına (${room.id}) yönləndirilir...`);
            const params = new URLSearchParams({
                 roomId: room.id, // ID-ni yenə də göndərək, bəlkə lazım olar
                 roomName: encodeURIComponent(room.name),
                 playerName: encodeURIComponent(loggedInUser.nickname),
                 size: room.boardSize,
                 ai: 'SNOW' // AI olduğunu bildirən parametr
             });
             // Oyun səhifəsinin düzgün yolunu göstərdiyinizdən əmin olun
             window.location.href = `../game/oda_ici.html?${params.toString()}`;
             return; // AI otağı üçün proses burada bitir
        }
        // <<< DƏYİŞİKLİK SONU >>>

        // Normal Otağa Qoşulma (əvvəlki kimi)
        if (room.playerCount >= 2) {
            console.warn("Dolu normal otağa klikləmə hadisəsi işlədi?");
            // alert("Bu otaq artıq doludur."); // Kliklənməz olmalıdır
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


    // ===== GİRİŞ YOXLAMASI (Başlanğıcda) =====
    try {
        console.log("Lobby: /check-auth sorğusu göndərilir...");
        const response = await fetch('/check-auth');
        const data = await response.json();

        if (!response.ok || !data.loggedIn || !data.user) {
            console.log("Lobby JS: Giriş edilməyib, login səhifəsinə yönləndirilir...");
            window.location.href = '/ANA SEHIFE/login/login.html'; // Adjust path if needed
            return;
        }

        loggedInUser = data.user;
        console.log(`Lobby JS: Giriş edilib: ${loggedInUser.nickname}`);

        if (userInfoPlaceholder) userInfoPlaceholder.textContent = `İstifadəçi: ${escapeHtml(loggedInUser.nickname)}`;
        if (welcomeText) welcomeText.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUser.nickname)}</strong>! Oyuna qatmaq üçün otaq seçin və ya yenisini yaradın.`;

        // Socket Bağlantısını Qur
        setupSocketConnection(); // Autentifikasiya uğurlu olduqdan sonra çağırılır

    } catch (error) {
        console.error("Lobby JS: Auth yoxlama xətası:", error);
        alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
        // window.location.href = '/ANA SEHIFE/login/login.html';
        if (userInfoPlaceholder) { userInfoPlaceholder.textContent = "Xəta!"; userInfoPlaceholder.style.color = "var(--danger-color)"; }
        if (infoMessageArea) { infoMessageArea.textContent = "Serverlə əlaqə qurmaq mümkün olmadı."; infoMessageArea.style.color = "var(--danger-color)"; }
        return;
    }
    // =======================================


    // ---- Socket.IO Bağlantısı Qurulumu və Hadisə Dinləyiciləri ----
    function setupSocketConnection() {
        if (socket && socket.connected) {
             console.log("Köhnə socket bağlantısı bağlanılır...");
             socket.disconnect();
        }

        console.log("Yeni Socket.IO bağlantısı qurulur...");
        socket = io({ reconnectionAttempts: 5 });

        // --- Əsas Socket Hadisələri ---
        socket.on('connect', () => {
            console.log('Socket.IO Serverinə qoşuldu! ID:', socket.id);
             if (infoMessageArea) {
                 infoMessageArea.textContent = 'Serverdən otaq siyahısı alınır...';
                 infoMessageArea.style.color = 'var(--subtle-text)';
             }
        });

        socket.on('disconnect', (reason) => {
            console.warn('Socket.IO bağlantısı kəsildi:', reason);
             if (infoMessageArea) {
                 infoMessageArea.textContent = 'Serverlə bağlantı kəsildi...';
                 infoMessageArea.style.color = 'var(--warning-color)';
             }
             displayRooms([]);
             currentRooms = {};
        });

        socket.on('connect_error', (error) => {
            console.error('Socket.IO qoşulma xətası:', error.message);
             if (infoMessageArea) {
                 infoMessageArea.textContent = 'Serverə qoşulmaq mümkün olmadı.';
                 infoMessageArea.style.color = 'var(--danger-color)';
             }
             displayRooms([]);
             currentRooms = {};
        });

        // --- Otaqlarla Bağlı Hadisələr ---
        socket.on('room_list_update', (roomsFromServer) => {
            console.log('Lobby: room_list_update alındı, Otaq sayı:', roomsFromServer?.length ?? 0);
            currentRooms = {};
            if(Array.isArray(roomsFromServer)) {
                roomsFromServer.forEach(room => {
                    if(room && room.id) {
                        currentRooms[room.id] = room;
                    } else {
                         console.warn("room_list_update: Keçərsiz otaq datası alındı:", room);
                    }
                });
                 displayRooms(Object.values(currentRooms));
            } else {
                 console.error("room_list_update: Array formatında data gözlənilirdi!", roomsFromServer);
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
            const params = new URLSearchParams({
                 roomId: data.roomId,
                 roomName: encodeURIComponent(data.roomName),
                 playerName: encodeURIComponent(loggedInUser.nickname),
                 size: data.boardSize,
             });
             // Normal otaq üçün AI parametri göndərmirik
             window.location.href = `../game/oda_ici.html?${params.toString()}`;
        });

        socket.on('delete_error', (errorMessage) => {
              console.error('Otaq silmə xətası:', errorMessage);
              alert(`Otaq silinərkən xəta: ${errorMessage}`);
        });

    } // setupSocketConnection sonu


    // ---- Modal Pəncərələrin İşləməsi və Form Göndərmə ----
    // (Bu hissə əvvəlki kodla eynidir, dəyişikliyə ehtiyac yoxdur)

    // Yeni Otaq Yaratma düyməsi
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
    } else { console.error("Otaq yaratma düyməsi və ya modalı tapılmadı!"); }

    // Yeni Otaq Yaratma Submit
    if (createRoomSubmitBtn && newRoomNameInput && newRoomPasswordInput && newBoardSizeSelect) {
        createRoomSubmitBtn.addEventListener('click', () => {
             if (!socket || !socket.connected) { showMsg(createRoomMessage, 'Serverlə bağlantı yoxdur!', 'error'); return; }
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
            socket.emit('create_room', { name: roomName, password: roomPassword || null, boardSize: boardSize });
             setTimeout(() => { if(createRoomSubmitBtn && createRoomSubmitBtn.disabled) { console.warn("Otaq yaratma cavabı gecikdi."); createRoomSubmitBtn.disabled = false; } }, 7000);
             setTimeout(() => hideModal(createRoomModal), 500);
        });
    } else { console.error("Yeni otaq yaratma formu elementləri tapılmadı!"); }

    // Şifrəli Otağa Qoşulma Submit
    if (joinRoomSubmitBtn && joinRoomIdInput && joinRoomPasswordInput) {
         joinRoomSubmitBtn.addEventListener('click', () => {
              if (!socket || !socket.connected) { showMsg(joinRoomMessage, 'Serverlə bağlantı yoxdur!', 'error'); return; }
             const roomId = joinRoomIdInput.value;
             const password = joinRoomPasswordInput.value;
             if (!roomId) { showMsg(joinRoomMessage, 'Otaq ID tapılmadı.', 'error'); return; }
             if (!password) { showMsg(joinRoomMessage, 'Zəhmət olmasa, şifrəni daxil edin.', 'error'); return; }
             console.log(`"join_room" (şifrə ilə) hadisəsi göndərilir: roomId=${roomId}`);
              showMsg(joinRoomMessage, 'Otağa qoşulunur...', 'info');
              joinRoomSubmitBtn.disabled = true;
             socket.emit('join_room', { roomId: roomId, password: password });
              setTimeout(() => { if(joinRoomSubmitBtn && joinRoomSubmitBtn.disabled) { console.warn("Otağa qoşulma cavabı gecikdi."); joinRoomSubmitBtn.disabled = false; } }, 7000);
         });
    } else { console.error("Otağa qoşulma modalı elementləri tapılmadı!"); }

    // Modal Bağlama
    closeButtons.forEach(button => { button.addEventListener('click', () => { const modalId = button.getAttribute('data-modal-id'); if (modalId) hideModal(document.getElementById(modalId)); }); });
    window.addEventListener('click', (event) => { if (event.target === createRoomModal) hideModal(createRoomModal); if (event.target === joinRoomModal) hideModal(joinRoomModal); });

    // Board Size Seçimində Qayda
    if(newBoardSizeSelect) { newBoardSizeSelect.addEventListener('change', updateRoomRuleDisplay); updateRoomRuleDisplay(); }

    console.log("Lobby JS bütün quraşdırmanı bitirdi.");

}); // DOMContentLoaded Sonu