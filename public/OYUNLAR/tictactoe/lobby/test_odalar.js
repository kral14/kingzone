// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Düzəliş edilmiş (Tam Funksionallıq) - Hissə 1/2

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Lobby JS (Tam Funksionallıq) Başladı.");

    // ---- Qlobal Dəyişənlər ----
    let loggedInUser = null; // Giriş etmiş istifadəçi məlumatları (check-auth ilə alınacaq)
    let currentRooms = {}; // Serverdən alınan otaqların state-i (obyekt olaraq saxlayaq)
    let socket = null; // Socket.IO bağlantısı

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
    const newRoomRuleDisplay = document.getElementById('new-room-rule-display'); // Qayda göstərmək üçün
    const joinRoomModal = document.getElementById('join-room-modal');
    const joinRoomTitle = document.getElementById('join-room-title');
    const joinRoomIdInput = document.getElementById('join-room-id');
    const joinRoomPasswordInput = document.getElementById('join-room-password');
    const joinRoomSubmitBtn = document.getElementById('join-room-submit-btn');
    const joinRoomMessage = document.getElementById('join-room-message');
    const userInfoPlaceholder = document.getElementById('user-info-placeholder');
    const welcomeText = document.getElementById('welcome-text');

    // Modal bağlama düymələri
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
            // Reset any previous messages
            const messageElement = modalElement.querySelector('.message');
            if (messageElement) {
                messageElement.textContent = '';
                messageElement.className = 'message'; // Reset classes
            }
            modalElement.style.display = 'block';
            // Autofocus the first input if available
            const firstInput = modalElement.querySelector('input[type="text"], input[type="password"]');
            if(firstInput && firstInput.type !== 'hidden') {
                setTimeout(() => firstInput.focus(), 50); // Slight delay for transition
            }
        } else {
            console.error("showModal: Modal elementi tapılmadı!");
        }
    }

    function hideModal(modalElement) {
        if (modalElement) {
            modalElement.style.display = 'none';
            // Reset form fields within the modal if it's a form modal
            const form = modalElement.querySelector('form');
            if(form) form.reset(); // Reset form fields
             else { // If no form tag, reset inputs manually
                 const inputs = modalElement.querySelectorAll('input');
                 inputs.forEach(input => {
                    if(input.type !== 'hidden' && input.type !== 'submit' && input.type !== 'button' && input.type !== 'checkbox' && input.type !== 'radio') {
                        input.value = '';
                    } else if (input.type === 'checkbox' || input.type === 'radio'){
                         input.checked = false;
                    }
                 });
                 const selects = modalElement.querySelectorAll('select');
                 selects.forEach(select => select.selectedIndex = 0); // Reset selects to first option
             }
            // Clear messages again on hide
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
            element.className = `message ${type}`; // success, error, info
        } else {
             console.error(`showMsg: Mesaj elementi tapılmadı. Mesaj: ${message}`);
        }
    }

    // ----- Board Size Seçimində Qaydanı Göstərmək -----
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

    // ===== GİRİŞ YOXLAMASI (Session ilə) =====
    try {
        console.log("Lobby: /check-auth sorğusu göndərilir...");
        const response = await fetch('/check-auth');
        const data = await response.json();

        if (!response.ok || !data.loggedIn || !data.user) {
            console.log("Lobby JS: Giriş edilməyib, login səhifəsinə yönləndirilir...");
            window.location.href = '/ANA SEHIFE/login/login.html';
            return; // Scriptin qalanı işləməsin
        }

        loggedInUser = data.user;
        console.log(`Lobby JS: Giriş edilib: ${loggedInUser.nickname}`);

        // Header və xoş gəldin mətnini yenilə
        if (userInfoPlaceholder) {
            userInfoPlaceholder.textContent = `İstifadəçi: ${escapeHtml(loggedInUser.nickname)}`;
        }
         if (welcomeText) {
             // Mətni fərdiləşdir (isteğe bağlı)
             welcomeText.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUser.nickname)}</strong>! Oyuna qatmaq üçün otaq seçin və ya yenisini yaradın.`;
         }


        // Giriş uğurlu oldusa, Socket.IO bağlantısını qur
        setupSocketConnection();

    } catch (error) {
        console.error("Lobby JS: Auth yoxlama xətası:", error);
        alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
        // window.location.href = '/ANA SEHIFE/login/login.html';
        if (userInfoPlaceholder) {
             userInfoPlaceholder.textContent = "Xəta!";
             userInfoPlaceholder.style.color = "var(--danger-color)";
        }
         if (infoMessageArea) {
              infoMessageArea.textContent = "Serverlə əlaqə qurmaq mümkün olmadı.";
              infoMessageArea.style.color = "var(--danger-color)";
          }

        return;
    }
    // =======================================


    // ---- Socket.IO Bağlantısı və Əsas Hadisələr ----
    function setupSocketConnection() {
        // Əgər köhnə bağlantı varsa, onu bağla
        if (socket && socket.connected) {
             console.log("Köhnə socket bağlantısı bağlanılır...");
             socket.disconnect();
        }

        console.log("Yeni Socket.IO bağlantısı qurulur...");
        socket = io({
            // transports: ['websocket'], // Bəzən lazım ola bilər
            reconnectionAttempts: 5, // Təkrar qoşulma cəhdləri
            // auth lazımdırsa (server tərəfi sessiondan alır deyəsən, ehtiyac olmaya bilər)
            // auth: { token: "your_auth_token_if_needed" }
        });

        socket.on('connect', () => {
            console.log('Socket.IO Serverinə qoşuldu! ID:', socket.id);
            // Qoşulduqda serverdən ilkin otaq siyahısını gözləyirik (server.js göndərir)
             if (infoMessageArea) {
                 infoMessageArea.textContent = 'Serverdən otaq siyahısı alınır...';
                 infoMessageArea.style.color = 'var(--subtle-text)'; // Reset color
             }
        });

        socket.on('disconnect', (reason) => {
            console.warn('Socket.IO bağlantısı kəsildi:', reason);
             if (infoMessageArea) {
                 infoMessageArea.textContent = 'Serverlə bağlantı kəsildi. Yenidən qoşulmağa cəhd edilir...';
                 infoMessageArea.style.color = 'var(--warning-color)';
             }
            // Təkrar qoşulma cəhdləri avtomatik olacaq (reconnectionAttempts)
            // Əgər bütün cəhdlər uğursuz olsa, istifadəçiyə məlumat vermək olar
        });

        socket.on('connect_error', (error) => {
            console.error('Socket.IO qoşulma xətası:', error.message);
             if (infoMessageArea) {
                 infoMessageArea.textContent = 'Serverə qoşulmaq mümkün olmadı.';
                 infoMessageArea.style.color = 'var(--danger-color)';
             }
            // İstifadəçiyə kritik xəta barədə məlumat verə bilərsiniz
        });

        // --- Otaq Əməliyyatları üçün Hadisə Dinləyiciləri (Part 2-də ətraflı) ---
        socket.on('room_list_update', (rooms) => {
            console.log('Lobby: room_list_update alındı, Otaq sayı:', rooms?.length ?? 0);
            // Gələn arrayi obyektə çevirərək saxlayaq
            currentRooms = {};
            if(Array.isArray(rooms)) {
                rooms.forEach(room => {
                    if(room && room.id) {
                        currentRooms[room.id] = room;
                    } else {
                         console.warn("room_list_update: Keçərsiz otaq datası alındı:", room);
                    }
                });
                 displayRooms(Object.values(currentRooms)); // Obyekti arraya çevirib göndər
            } else {
                 console.error("room_list_update: Array formatında data gözlənilirdi, amma başqa tip gəldi:", rooms);
                 displayRooms([]); // Boş siyahı göstər
            }
        });

        socket.on('creation_error', (errorMessage) => {
            console.error('Otaq yaratma xətası:', errorMessage);
            showMsg(createRoomMessage, errorMessage, 'error');
             if(createRoomSubmitBtn) createRoomSubmitBtn.disabled = false; // Düyməni aktiv et
        });

        socket.on('join_error', (errorMessage) => {
             console.error('Otağa qoşulma xətası:', errorMessage);
             showMsg(joinRoomMessage, errorMessage, 'error');
             if(joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false; // Düyməni aktiv et
        });

        // Qoşulma uğurlu olduqda server bu hadisəni göndərməlidir
        socket.on('room_joined', (data) => {
            console.log(`Otağa uğurla qoşuldunuz: ${data.roomName} (${data.roomId})`);
            hideModal(joinRoomModal); // Parol modalını bağla
             // Oyun səhifəsinə yönləndir (oda_ici.html)
             // URL-ə otaq ID-sini, otaq adını və istifadəçi adını əlavə edək
             const params = new URLSearchParams({
                 roomId: data.roomId,
                 roomName: encodeURIComponent(data.roomName), // Adı URL üçün kodlaşdır
                 playerName: encodeURIComponent(loggedInUser.nickname), // Oyunçu adını kodlaşdır
                 size: data.boardSize // Board ölçüsünü əlavə et
             });
             window.location.href = `../game/oda_ici.html?${params.toString()}`;
        });

         // Server tərəfindən göndərilən silmə xətası (əgər varsa)
         socket.on('delete_error', (errorMessage) => {
              console.error('Otaq silmə xətası:', errorMessage);
              // Bu xətanı göstərmək üçün xüsusi bir yer yoxdur, amma konsolda qalır
              // İstəsəniz, alert() ilə göstərə bilərsiniz
              // alert(`Otaq silinərkən xəta: ${errorMessage}`);
         });

    } // setupSocketConnection sonu


    // ---- Modal Pəncərələrin Açılması/Bağlanması ----
    if (createRoomButton && createRoomModal) {
        createRoomButton.addEventListener('click', () => {
             console.log("Yeni otaq yaratma modalı açılır.");
             // Reset fields before showing
             if(newRoomNameInput) newRoomNameInput.value = '';
             if(newRoomPasswordInput) newRoomPasswordInput.value = '';
             if(newBoardSizeSelect) newBoardSizeSelect.value = '3'; // Default 3x3
             updateRoomRuleDisplay(); // İlk qaydanı göstər
             if(createRoomMessage) createRoomMessage.textContent = ''; createRoomMessage.className = 'message';
              if(createRoomSubmitBtn) createRoomSubmitBtn.disabled = false;
            showModal(createRoomModal);
        });
    } else {
        console.error("Otaq yaratma düyməsi və ya modalı tapılmadı!");
    }

    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modalId = button.getAttribute('data-modal-id');
            const modalToClose = document.getElementById(modalId);
            if (modalToClose) {
                console.log(`${modalId} modalı bağlanır.`);
                hideModal(modalToClose);
            } else {
                console.error(`Bağlanacaq modal tapılmadı: ${modalId}`);
            }
        });
    });

    // Klikləmə ilə modal xaricinə bağlama
    window.addEventListener('click', (event) => {
        if (event.target === createRoomModal) {
            hideModal(createRoomModal);
        }
        if (event.target === joinRoomModal) {
            hideModal(joinRoomModal);
        }
    });

    // ---- Yeni Otaq Yaratma Formasının Göndərilməsi ----
    if (createRoomSubmitBtn && newRoomNameInput && newRoomPasswordInput && newBoardSizeSelect) {
        createRoomSubmitBtn.addEventListener('click', () => {
            const roomName = newRoomNameInput.value.trim();
            const roomPassword = newRoomPasswordInput.value; // trim() etmirik, boşluq ola bilər
            const boardSize = newBoardSizeSelect.value;

            if (!roomName) {
                showMsg(createRoomMessage, 'Otaq adı boş ola bilməz.', 'error');
                return;
            }

             // Client-side şifrə validasiyası (serverdəki ilə eyni)
             if (roomPassword && roomPassword.length > 0) {
                 if (roomPassword.length < 2) {
                     showMsg(createRoomMessage, 'Şifrə ən az 2 simvol olmalıdır.', 'error');
                     return;
                 }
                 if (!(/[a-zA-Z]/.test(roomPassword) && /\d/.test(roomPassword))) {
                      showMsg(createRoomMessage, 'Şifrə ən az 1 hərf və 1 rəqəm ehtiva etməlidir.', 'error');
                      return;
                 }
             }


            console.log(`"create_room" hadisəsi göndərilir:`, { name: roomName, password: roomPassword ? '***' : null, boardSize });
             showMsg(createRoomMessage, 'Otaq yaradılır...', 'info');
             createRoomSubmitBtn.disabled = true; // Düyməni deaktiv et

            socket.emit('create_room', {
                name: roomName,
                password: roomPassword || null, // Boş şifrəni null olaraq göndər
                boardSize: boardSize
            });

            // Serverdən cavab (room_list_update və ya creation_error) gözlənilir
            // Uğurlu olarsa, otaq siyahısı avtomatik yenilənəcək
            // Xəta olarsa, 'creation_error' listener-ı mesajı göstərəcək
            // Müvəffəqiyyət mesajını burada göstərməyə bilərik, çünki siyahı yenilənəcək
             setTimeout(() => { // Əgər serverdən cavab gəlməzsə düyməni aktivləşdir
                  if(createRoomSubmitBtn.disabled) {
                     console.warn("Otaq yaratma cavabı çox gecikdi, düymə aktiv edilir.");
                     // showMsg(createRoomMessage, 'Serverdən cavab alınmadı.', 'error'); // İstəyə bağlı
                     createRoomSubmitBtn.disabled = false;
                  }
             }, 5000); // 5 saniyə timeout

             // Uğurlu yaratmadan sonra modalı bağlaya bilərik (serverdən təsdiq gəlməsini gözləmədən)
             // Ancaq xəta baş verərsə istifadəçi formanı yenidən doldurmalı olacaq.
             // Ən yaxşısı 'room_list_update' gözləmək və ya serverdən xüsusi təsdiq mesajı almaqdır.
             // Hələlik sadəlik üçün bağlayaq:
              setTimeout(() => hideModal(createRoomModal), 500); // Yarım saniyə sonra bağla

        });
    } else {
         console.error("Yeni otaq yaratma formu elementləri tapılmadı!");
    }

    // Board size seçimində qaydanı yeniləmək üçün listener
     if(newBoardSizeSelect) {
         newBoardSizeSelect.addEventListener('change', updateRoomRuleDisplay);
     }

}); // DOMContentLoaded Sonu (Hələ ki, davamı var)

// --- Hissə 1 Sonu ---
// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Düzəliş edilmiş (Tam Funksionallıq) - Hissə 2/2

// ---- DOMContentLoaded içində davam edirik (Hissə 1-dən) ----

    // ---- Otaq Elementi Yaratma (Tam Versiya) ----
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
            li.dataset.roomName = room.name; // Adı data atributunda saxlayaq
            li.dataset.isAi = room.isAiRoom || false; // AI otağı olub olmadığını saxlayaq
            li.dataset.requiresPassword = room.hasPassword || false; // Şifrə tələb edib etmədiyini saxlayaq

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
            const hoverTextContent = room.isAiRoom ? "SNOW ilə Oyna" : (room.playerCount < 2 ? "Otağa Qoşul" : "İzlə (tezliklə)");
            hoverTextSpan.textContent = hoverTextContent;
            roomNameDiv.appendChild(originalTextSpan);
            roomNameDiv.appendChild(hoverTextSpan);

             // Oda Adına Hover Listenerları
             roomNameDiv.addEventListener('mouseenter', () => {
                 if (!room.isAiRoom && room.playerCount >= 2) return; // Dolu otaq üçün hover dəyişməsin
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
            playersSpan.textContent = `${room.playerCount}/2`;
            roomStatusDiv.appendChild(playersSpan);

            if (room.hasPassword) {
                const lockIcon = document.createElement('i');
                lockIcon.className = 'fas fa-lock lock-icon'; // Font Awesome ikonu
                roomStatusDiv.appendChild(lockIcon);
            }

            // Silmə Düyməsi (Yalnız yaradan üçün və AI otağı deyilsə)
            const deleteButtonContainer = document.createElement('div'); // Buttonu konteynerə alaq
            if (!room.isAiRoom && room.creatorUsername === loggedInUser.nickname) {
                 const deleteBtn = document.createElement('button');
                 deleteBtn.classList.add('delete-room-btn');
                 deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1h3.5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5"/></svg>`;
                 deleteBtn.title = "Otağı Sil"; // Tooltip üçün
                 deleteBtn.addEventListener('click', (e) => {
                     e.stopPropagation(); // li elementinə klikləmənin keçməsinin qarşısını al
                     if (confirm(`'${escapeHtml(room.name)}' otağını silmək istədiyinizə əminsiniz?`)) {
                          if (socket && socket.connected) {
                               console.log(`"delete_room" hadisəsi göndərilir: roomId=${room.id}`);
                               socket.emit('delete_room', { roomId: room.id });
                               // Serverdən 'room_list_update' və ya 'delete_error' gözlənilir
                          } else {
                               alert("Serverlə bağlantı yoxdur.");
                          }
                     }
                 });
                 deleteButtonContainer.appendChild(deleteBtn);
            }


            line1.appendChild(roomNameDiv);
            line1.appendChild(roomStatusDiv);
            line1.appendChild(deleteButtonContainer); // Silmə düyməsi konteynerini əlavə et

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
            p1NameSpan.textContent = room.player1Username ? escapeHtml(room.player1Username) : 'Gözlənilir...';

            // VS İkonu
            const vsIconSpan = document.createElement('span');
            vsIconSpan.classList.add('vs-icon');
            vsIconSpan.innerHTML = `<svg viewBox="0 0 100 100"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="80" font-weight="bold" fill="currentColor">vs</text></svg>`; // Simple SVG VS

            // Oyunçu 2 Adı və ya Boş Slot
            const p2NameSpan = document.createElement('span');
            if (room.player2Username) {
                p2NameSpan.classList.add('player2-name');
                p2NameSpan.textContent = escapeHtml(room.player2Username);
            } else {
                p2NameSpan.classList.add('empty-slot');
                p2NameSpan.textContent = room.isAiRoom ? escapeHtml(room.creatorUsername) : 'Boş Slot'; // AI otağında yaradanı göstər
            }

             // Hover effektləri üçün listenerlar (adlar üzərinə)
             [p1NameSpan, p2NameSpan].forEach(span => {
                 if (span.textContent && span.textContent !== 'Gözlənilir...' && span.textContent !== 'Boş Slot') {
                      span.addEventListener('mouseenter', () => {
                           // Bütün spanlardakı hover klaslarını təmizlə
                           document.querySelectorAll('.player1-name, .player2-name').forEach(s => s.classList.remove('is-hovered-player'));
                           // Hazırki spanı vurğula
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

            // Elementləri li içinə yığ
            li.appendChild(line1);
            li.appendChild(separator);
            li.appendChild(line2);

            // Bütün 'li' elementinə klik listener-ı əlavə et
             if (!room.isAiRoom || room.playerCount < 2) { // Dolu olmayan və ya AI otağına klik etmək olar
                 li.addEventListener('click', () => handleRoomClick(room));
                 li.style.cursor = 'pointer';
             } else {
                 li.style.cursor = 'not-allowed'; // Dolu otaqlara klik etmək olmaz
             }


            // console.log("[createRoomElement] Element yaradıldı:", li);
            return li;

        } catch (error) {
            console.error(`[createRoomElement] XƏTA baş verdi - Room ID: ${room?.id}`, error);
            return null; // Xəta halında null qaytar
        }
         // createRoomElement Sonu


        // ---- Otaq Siyahısını Göstərmə ----
    function displayRooms(roomsToDisplay) {
        console.log("Lobby: displayRooms funksiyası çağırıldı. Otaq sayı:", roomsToDisplay?.length ?? 0);
        if (!roomListContainer) {
            console.error("roomListContainer tapılmadı!");
            return;
        }

        // Köhnə elementləri idarə etmək üçün saxlayaq
        const existingElements = {};
         roomListContainer.querySelectorAll('.room-item[data-room-id]').forEach(el => {
             existingElements[el.dataset.roomId] = el;
         });

        const incomingRoomIds = new Set(roomsToDisplay.map(room => room.id));
        let hasVisibleRooms = false;

        // Add or update rooms
        roomsToDisplay.forEach((room, index) => {
            const existingElement = existingElements[room.id];
            if (existingElement) {
                // TODO: Otaq məlumatları dəyişibsə elementi yeniləmək (daha mürəkkəb)
                // Hələlik sadəcə saxlayırıq
                delete existingElements[room.id]; // Bunu saxla, silinməyəcək
                hasVisibleRooms = true;
            } else {
                // Yeni otaq elementi yarat
                const newElement = createRoomElement(room);
                if (newElement) {
                    roomListContainer.appendChild(newElement);
                    // Giriş animasiyası
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            newElement.classList.add('entering');
                        }, index * 30); // Tədrici animasiya
                    });
                    hasVisibleRooms = true;
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
                   // Çıxarıldıqdan sonra boş olub olmadığını yoxla
                   checkIfRoomListEmpty(roomListContainer.childElementCount);
              }, 350); // CSS animasiya müddəti qədər gözlə
         });


        // Hələ də çıxarılmayan elementlər varsa (yəni görünən otaqlar)
        if(hasVisibleRooms) {
            checkIfRoomListEmpty(1); // Ən azı bir otaq var
        } else if (Object.keys(existingElements).length === 0) { // Həm yeni yoxdur, həm də köhnələr silinirsə
             checkIfRoomListEmpty(0); // Boşdur
        }
        // console.log("Lobby: displayRooms funksiyası bitdi.");
    } // displayRooms Sonu


    // ---- Otaq Siyahısı Boş Nəzarəti ----
    function checkIfRoomListEmpty(roomCount) {
         console.log(`checkIfRoomListEmpty: roomCount=${roomCount}`);
        if (!infoMessageArea) return;
        if (roomCount > 0) {
            infoMessageArea.style.display = 'none';
        } else {
            infoMessageArea.textContent = 'Hazırda aktiv otaq yoxdur. Yeni bir otaq yaradın!';
            infoMessageArea.style.display = 'block';
            infoMessageArea.style.color = 'var(--subtle-text)';
        }
    }

    // ---- Otağa Klikləmə ----
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
                 alert("Bu AI otağı hazırda başqası tərəfindən istifadə edilir. Başqasını seçin və ya sonra cəhd edin.");
                 return;
            }
            console.log(`AI otağına (${room.id}) yönləndirilir...`);
            // AI otağına qoşulmaq üçün xüsusi URL yaradırıq
             const params = new URLSearchParams({
                 roomId: room.id,
                 roomName: encodeURIComponent(room.name),
                 playerName: encodeURIComponent(loggedInUser.nickname),
                 size: room.boardSize,
                 ai: 'SNOW' // AI olduğunu bildiririk
             });
              window.location.href = `../game/oda_ici.html?${params.toString()}`;
             return;
        }

        // Normal Otağa Qoşulma
        if (room.playerCount >= 2) {
            alert("Bu otaq artıq doludur.");
            // Gələcəkdə izləmə funksiyası əlavə edilə bilər
            return;
        }

        if (room.hasPassword) {
            console.log(`Şifrəli otaq (${room.id}) üçün modal açılır.`);
            if (joinRoomIdInput) joinRoomIdInput.value = room.id;
            if (joinRoomTitle) joinRoomTitle.textContent = `Otağa Qoşul: ${escapeHtml(room.name)}`;
            if (joinRoomPasswordInput) joinRoomPasswordInput.value = ''; // Şifrə sahəsini təmizlə
            if (joinRoomMessage) joinRoomMessage.textContent = ''; joinRoomMessage.className = 'message';
             if(joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false;
            showModal(joinRoomModal);
        } else {
            console.log(`Şifrəsiz otağa (${room.id}) qoşulma tələbi göndərilir...`);
            // Şifrə tələb olunmursa, birbaşa qoşulma tələbi göndər
            socket.emit('join_room', { roomId: room.id });
             // Serverdən 'room_joined' və ya 'join_error' gözlənilir
        }
    } // handleRoomClick Sonu

    // ---- Şifrəli Otağa Qoşulma Formasının Göndərilməsi ----
    if (joinRoomSubmitBtn && joinRoomIdInput && joinRoomPasswordInput) {
         joinRoomSubmitBtn.addEventListener('click', () => {
             const roomId = joinRoomIdInput.value;
             const password = joinRoomPasswordInput.value;

             if (!roomId) {
                  showMsg(joinRoomMessage, 'Otaq ID tapılmadı. Səhifəni yeniləyin.', 'error');
                  return;
             }
             if (!password) {
                  showMsg(joinRoomMessage, 'Zəhmət olmasa, şifrəni daxil edin.', 'error');
                  return;
             }

             console.log(`"join_room" (şifrə ilə) hadisəsi göndərilir: roomId=${roomId}`);
              showMsg(joinRoomMessage, 'Otağa qoşulunur...', 'info');
              joinRoomSubmitBtn.disabled = true; // Düyməni deaktiv et

             socket.emit('join_room', {
                  roomId: roomId,
                  password: password
             });

             // Serverdən 'room_joined' və ya 'join_error' gözlənilir
              setTimeout(() => { // Timeout
                   if(joinRoomSubmitBtn.disabled) {
                        console.warn("Otağa qoşulma cavabı çox gecikdi, düymə aktiv edilir.");
                        joinRoomSubmitBtn.disabled = false;
                         // showMsg(joinRoomMessage, 'Serverdən cavab alınmadı.', 'error'); // İstəyə bağlı
                   }
              }, 5000); // 5 saniyə timeout
         });
    } else {
         console.error("Otağa qoşulma modalı elementləri tapılmadı!");
    }


}; // DOMContentLoaded Sonu