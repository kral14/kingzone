// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Socket.IO + Session Auth (v3 - Disconnect Listener ilə)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Test Odalar JS (v3 - Disconnect Listener) Başladı.");

    let loggedInUser = null; // Giriş etmiş istifadəçi məlumatları
    let currentRooms = []; // Hazırki otaqların siyahısı
    let socket = null; // Qlobal socket obyekti

    // ===== GİRİŞ YOXLAMASI (Session ilə) =====
    try {
        console.log("Lobby: /check-auth sorğusu göndərilir...");
        const response = await fetch('/check-auth', {
            credentials: 'include' // Cookie göndərmək üçün vacibdir
        });
        const data = await response.json();

        if (!response.ok || !data.loggedIn) {
            console.log("Lobby: Giriş edilməyib (/check-auth), login səhifəsinə yönləndirilir...");
            window.location.href = '../../ANA SEHIFE/login/login.html';
            return; // Scriptin qalanı işləməsin
        }
        // Giriş edilib
        loggedInUser = data.user;
        console.log(`Lobby: Giriş edilib: ${loggedInUser.nickname} (ID: ${loggedInUser.id})`);

    } catch (error) {
        console.error("Lobby: Auth yoxlama xətası:", error);
        alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
        window.location.href = '../../ANA SEHIFE/login/login.html';
        return;
    }
    // =======================================

    // --- Giriş uğurlu oldusa davam edirik ---
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
        socket = io({
             // withCredentials: true // Ehtiyac olarsa və fərqli domain/subdomain varsa lazım ola bilər
             // reconnectionAttempts: 5 // Avtomatik yenidən qoşulma cəhdlərinin sayı (default: sonsuz)
             // reconnectionDelay: 1000 // Yenidən qoşulma cəhdləri arasındakı başlanğıc gecikmə (ms)
        });
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
        let color = '#d1ecf1'; let bgColor = 'rgba(23, 162, 184, 0.7)'; let borderColor = '#17a2b8';
        if (type === 'error') { color = '#f8d7da'; bgColor = 'rgba(220, 53, 69, 0.7)'; borderColor = '#dc3545'; }
        else if (type === 'success') { color = '#d4edda'; bgColor = 'rgba(40, 167, 69, 0.7)'; borderColor = '#28a745'; }
        else if (type === 'warning') { color = '#fff3cd'; bgColor = 'rgba(255, 193, 7, 0.7)'; borderColor = '#ffc107'; }

        el.textContent = msg;
        // Mesajı göstərmək üçün stilləri əlavə edək (əgər .message klası yoxdursa)
        el.style.display = 'block'; // Görünən et
        el.style.padding = '10px';
        el.style.marginTop = '15px';
        el.style.marginBottom = '10px';
        el.style.borderRadius = '5px';
        el.style.border = `1px solid ${borderColor}`;
        el.style.color = color;
        el.style.backgroundColor = bgColor;
        el.className = `message ${type}`; // Klassı da təyin edək

        if (el.timeoutId) clearTimeout(el.timeoutId);
        if (duration > 0) {
            el.timeoutId = setTimeout(() => {
                if (el.textContent === msg) { // Əgər mesaj hələ də eynidirsə
                    el.textContent = '';
                    el.style.display = 'none'; // Gizlət
                    el.className = 'message'; // Klassı sıfırla
                    el.removeAttribute('style'); // İnline stilləri sil
                }
            }, duration);
        }
    };
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return String(unsafe);
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function updateRuleDisplay(selectElement, displayElement) {
        if (!selectElement || !displayElement) return;
        const size = parseInt(selectElement.value, 10);
        let text = '';
        switch (size) {
            case 3: text = "3x3 - Qazanmaq üçün: 3 simvol"; break;
            case 4: text = "4x4 - Qazanmaq üçün: 3 simvol"; break;
            case 5: text = "5x5 - Qazanmaq üçün: 4 simvol"; break;
            case 6: text = "6x6 - Qazanmaq üçün: 4 simvol"; break;
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

    // --- Header İstifadəçi Məlumatları ---
    if (userInfoPlaceholder) {
        userInfoPlaceholder.textContent = ''; // Placeholder mətnini sil
        const welcomeSpan = document.createElement('span');
        welcomeSpan.id = 'welcome-lobby-player';
        welcomeSpan.innerHTML = `Xoş gəldin, <strong>${escapeHtml(loggedInUsername)}</strong>! `;
        userInfoPlaceholder.appendChild(welcomeSpan);
        // Qeyd: Çıxış və Profil redaktə düymələri artıq oyunlar.html-dədir
    }
    // -----------------------------

    // --- Otaq Elementi Yaratma Funksiyası (YENİLƏNMİŞ - AI otaqları üçün) ---
    function createRoomElement(room) {
        const li = document.createElement('li');
        li.classList.add('room-item');
        li.dataset.roomId = room.id;
        // AI otağı üçün xüsusi class əlavə edək (stil və ya klik üçün)
        if (room.isAiRoom) {
            li.classList.add('ai-room');
        }

        const isCreator = room.creatorUsername === loggedInUsername;
        // Oyunçu sayını AI otaqları üçün fərqli hesablayaq
        const displayPlayerCount = room.isAiRoom ? (room.players.length > 0 ? 1 : 0) : (room.playerCount || 0); // AI otağında oyunçu varsa 1, yoxsa 0
        const maxPlayers = 2; // Həmişə 2 nəfərlikdir
        const boardSizeText = room.boardSize ? `${room.boardSize}x${room.boardSize}` : '3x3';
        const creatorUsername = room.isAiRoom ? "SNOW" : (room.creatorUsername || 'Naməlum'); // AI otaqlarını SNOW yaradıb

        // --- Line 1: Oda Adı ve Status ---
        const line1Div = document.createElement('div');
        line1Div.className = 'room-item-line1';

        // Oda Adı (hover efekti ilə)
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

        // Status İkonları
        const statusDiv = document.createElement('div');
        statusDiv.className = 'room-status';
        statusDiv.innerHTML += `<span class="players" title="Lövhə Ölçüsü">${boardSizeText}</span>`;
        if (room.hasPassword) { // Şifrə ikonu
            statusDiv.innerHTML += `<span class="lock-icon" title="Şifrə ilə qorunur">🔒</span>`;
        }
        // Oyunçu sayı (AI otaqları üçün "1/2" göstərək)
        const playerCountText = room.isAiRoom ? `1/${maxPlayers}` : `${displayPlayerCount}/${maxPlayers}`;
        statusDiv.innerHTML += `<span class="players" title="Oyunçular">${playerCountText}</span>`;
        line1Div.appendChild(statusDiv);

        li.appendChild(line1Div);
        // -------------------------------

        // --- Ayırıcı Xətt ---
        const separatorDiv = document.createElement('div');
        separatorDiv.className = 'room-item-separator';
        li.appendChild(separatorDiv);
        // --------------------

        // --- Line 2: Oyunçular ---
        const line2Div = document.createElement('div');
        line2Div.className = 'room-item-line2';
        const playerDisplayDiv = document.createElement('div');
        playerDisplayDiv.className = 'player-name-display';

        if (room.isAiRoom) {
             // AI Otağı: Qoşulan oyunçu (əgər varsa) vs SNOW
             if (room.player1Username) { // Əgər insan oyunçu qoşulubsa
                 const p1Span = document.createElement('span');
                 p1Span.className = 'player1-name'; // Stil üçün
                 p1Span.textContent = escapeHtml(room.player1Username);
                 addPlayerHoverListeners(p1Span);
                 playerDisplayDiv.appendChild(p1Span);
             } else { // Hələ heç kim qoşulmayıbsa
                 playerDisplayDiv.insertAdjacentHTML('beforeend', `<span class="empty-slot">(Boş)</span>`);
             }
             // VS ikonu
              playerDisplayDiv.insertAdjacentHTML('beforeend', ` <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-robot vs-icon" viewBox="0 0 16 16"><path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5M3 8.062C3 6.76 4.235 5.765 5.53 5.886a26.6 26.6 0 0 0 4.94 0C11.765 5.765 13 6.76 13 8.062v1.157a.93.93 0 0 1-.765.935c-.845.147-2.34.346-4.235.346s-3.39-.2-4.235-.346A.93.93 0 0 1 3 9.219zm0 1.748v.196a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.5-.5v-1.338c0-.467.2-.898.547-1.172a25 25 0 0 1 4.723-1.954a.49.49 0 0 1 .572-.003 25 25 0 0 1 4.723 1.954c.347.274.547.705.547 1.172v1.338a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.5-.5v-.196C12.417 9.896 11.32 9.5 8 9.5s-4.417.396-4.999.51M10 11.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0"/><path d="M4 1.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5V3a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 3zM2.5 4a.5.5 0 0 0-.5.5v8.043a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V4.5a.5.5 0 0 0-.5-.5h-11Z"/></svg> `);
             // SNOW adı
             const snowSpan = document.createElement('span');
             snowSpan.className = 'player2-name'; // Stil üçün
             snowSpan.textContent = 'SNOW';
             playerDisplayDiv.appendChild(snowSpan);

        } else {
            // Normal Otaq
             if (room.player1Username) {
                 const p1Span = document.createElement('span');
                 p1Span.className = 'player1-name';
                 p1Span.textContent = escapeHtml(room.player1Username);
                 addPlayerHoverListeners(p1Span);
                 playerDisplayDiv.appendChild(p1Span);
             } else {
                 playerDisplayDiv.insertAdjacentHTML('beforeend', `<span class="empty-slot">(Boş)</span>`);
             }
             // VS İkonu (əgər ən az bir oyunçu varsa)
             if (room.player1Username || room.player2Username) {
                 playerDisplayDiv.insertAdjacentHTML('beforeend', ` <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-swords vs-icon" viewBox="0 0 16 16"><path d="M1.746 8.032a.5.5 0 0 1 .478-.736l5-1.5a.5.5 0 0 1 .666.478l-1.5 5a.5.5 0 0 1-.478.666l-5 1.5a.5.5 0 0 1-.666-.478l1.5-5z"/><path d="M14.254 8.968a.5.5 0 0 1-.478.736l-5 1.5a.5.5 0 0 1-.666-.478l1.5-5a.5.5 0 0 1 .478-.666l5-1.5a.5.5 0 0 1 .666.478l-1.5 5z"/></svg> `);
             }
             if (room.player2Username) {
                 const p2Span = document.createElement('span');
                 p2Span.className = 'player2-name';
                 p2Span.textContent = escapeHtml(room.player2Username);
                 addPlayerHoverListeners(p2Span);
                 playerDisplayDiv.appendChild(p2Span);
             } else if (room.player1Username) { // Əgər birinci oyunçu var, ikinci yoxdursa
                 playerDisplayDiv.insertAdjacentHTML('beforeend', `<span class="empty-slot">(Boş)</span>`);
             }
             // Əgər heç kim yoxdursa
             if (!room.player1Username && !room.player2Username) {
                 playerDisplayDiv.innerHTML = `<span class="empty-slot">(Otaq Boşdur)</span>`;
             }
        }
        line2Div.appendChild(playerDisplayDiv);
        li.appendChild(line2Div);
        // --------------------------

        // Otağa klikləmə hadisəsi
        li.addEventListener('click', () => handleRoomClick(room));

        return li;
    }
    // -----------------------------------------

    // --- Otaq Siyahısını Göstərmə ---
    function displayRooms(roomsToDisplay) {
        if (!roomListContainer) { console.error("roomListContainer tapılmadı!"); return; }
        console.log("Otaqlar göstərilir:", roomsToDisplay);
        roomListContainer.innerHTML = ''; // Əvvəlki siyahını təmizlə
        if (!Array.isArray(roomsToDisplay)) {
            console.error("Göstəriləcək otaqlar massiv deyil:", roomsToDisplay);
            checkIfRoomListEmpty([]);
            return;
        }
        if (roomsToDisplay.length === 0) {
            checkIfRoomListEmpty([]); // Boş mesajını göstər
        } else {
            if (infoMessageArea) infoMessageArea.style.display = 'none'; // Məlumat mesajını gizlət
            roomsToDisplay.forEach((room, index) => {
                try {
                    const li = createRoomElement(room);
                    roomListContainer.appendChild(li);
                    // Animasiya üçün kiçik gecikmə
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            li.classList.add('entering');
                        }, index * 50); // Hər element üçün 50ms gecikmə
                    });
                } catch(e) {
                    console.error(`Otaq elementi yaradılarkən xəta (index ${index}, room: ${JSON.stringify(room)}):`, e);
                }
            });
            checkIfRoomListEmpty(roomsToDisplay); // Əmin olmaq üçün yenə yoxla (lazım olmaya bilər)
        }
    }
    // --------------------------

    // --- Otaq Siyahısı Boş Nəzarəti ---
    function checkIfRoomListEmpty(rooms) {
        if (!infoMessageArea) return;
        // Yalnız istifadəçi tərəfindən yaradılmış otaqları sayırıq
        const userRoomCount = rooms.filter(r => !r.isAiRoom).length;
        if (userRoomCount === 0) {
            infoMessageArea.textContent = 'Aktiv istifadəçi otağı tapılmadı. Yeni otaq yaradın!';
            infoMessageArea.style.display = 'block';
            infoMessageArea.style.padding = '40px 0';
            infoMessageArea.style.fontStyle = 'italic';
            infoMessageArea.style.fontSize = '1.1em';
            infoMessageArea.style.textAlign = 'center';
        } else {
            infoMessageArea.style.display = 'none';
        }
    }
    // --------------------------

    // --- Otağa Klikləmə (YENİLƏNMİŞ - AI otaqları üçün) ---
    function handleRoomClick(room) {
        if (!room || !room.id) { console.error("Keçərsiz otaq obyekti:", room); return; }
        console.log(`Otağa klikləndi: ${room.name} (ID: ${room.id}, AI: ${room.isAiRoom})`, room);

        // 1. AI Otağıdırsa
        if (room.isAiRoom) {
             console.log(`AI otağına (${room.name}) klikləndi. Oyuna yönləndirilir...`);
             try {
                 const roomNameParam = encodeURIComponent(room.name || 'AI Otağı');
                 const playerNameParam = encodeURIComponent(loggedInUsername);
                 const boardSize = room.boardSize || 3;
                 // AI oyununa yönləndirmə (ai=SNOW parametri ilə)
                 const gameUrl = `../game/oda_ici.html?roomId=${room.id}&roomName=${roomNameParam}&playerName=${playerNameParam}&size=${boardSize}&ai=SNOW`;
                 console.log("Yönləndirmə URL:", gameUrl);
                 window.location.href = gameUrl;
             } catch (e) {
                 console.error("AI oyununa yönləndirmə xətası:", e);
                 showMsg(infoMessageArea, 'AI oyununa keçid zamanı xəta.', 'error');
             }
             return; // AI otağı üçün proses bitdi
        }

        // 2. Normal İstifadəçi Otağıdırsa
        // Otaq doludursa xəbərdarlıq et
        if (room.playerCount >= 2 && !room.players.includes(socket?.id)) { // Özü daxil deyilsə və doludursa
             showMsg(infoMessageArea, `'${escapeHtml(room.name)}' otağı doludur.`, 'error');
             return;
        }
        // İstifadəçi artıq bu otaqdadırsa (məs. səhifə yenilənib, amma hələ də users obyektindədir)
         if (room.players.includes(socket?.id)) {
             console.log(`İstifadəçi (${loggedInUsername}) artıq ${room.name} otağındadır. Oyun səhifəsinə yönləndirilir...`);
             try {
                  const roomNameParam = encodeURIComponent(room.name);
                  const playerNameParam = encodeURIComponent(loggedInUsername);
                  const boardSize = room.boardSize || 3;
                  window.location.href = `../game/oda_ici.html?roomId=${room.id}&roomName=${roomNameParam}&playerName=${playerNameParam}&size=${boardSize}`;
             } catch (e) { console.error("Oyun səhifəsinə təkrar yönləndirmə xətası:", e); showMsg(infoMessageArea, 'Oyun səhifəsinə keçid zamanı xəta.', 'error'); }
             return;
         }

        // Şifrəlidirsə modalı aç
        if (room.hasPassword) {
            console.log("Şifrəli otaq, qoşulma modalı açılır.");
            if(joinRoomTitle) joinRoomTitle.textContent = `'${escapeHtml(room.name)}' otağına qoşul`;
            if(joinRoomIdInput) joinRoomIdInput.value = room.id;
            if(joinRoomPasswordInput) joinRoomPasswordInput.value = '';
            if(joinRoomMessage) { joinRoomMessage.textContent = ''; joinRoomMessage.className='message'; joinRoomMessage.removeAttribute('style'); }
            if(joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false;
            showModal(joinRoomModal);
            joinRoomPasswordInput?.focus();
        }
        // Şifrəsizdirsə birbaşa qoşulma tələbi göndər
        else {
            console.log(`Serverə 'join_room' tələbi göndərilir: Room ID = ${room.id}`);
            showMsg(infoMessageArea, `'${escapeHtml(room.name)}' otağına qoşulunur...`, 'info', 0); // Gözləmə mesajı
             // Düyməni disable edək (təsadüfən iki dəfə basılmasın)
             // const clickedElement = document.querySelector(`[data-room-id="${room.id}"]`);
             // if(clickedElement) clickedElement.style.pointerEvents = 'none'; // Klikləməni blokla
            if(socket) socket.emit('join_room', { roomId: room.id }); // Şifrəsiz qoşulma
            else console.error("Socket bağlantısı yoxdur!");
        }
    }
    // -----------------------------------------------

    // RedirectToLogin funksiyası
    function redirectToLogin() {
        window.location.href = '../../ANA SEHIFE/login/login.html';
    }

    // --- Başlanğıc Konfiqurasiyası ---
    if (infoMessageArea) infoMessageArea.textContent = 'Serverə qoşulunur...';
    updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay); // Başlanğıcda qaydanı göstər
    // ---------------------------------


    // === Socket.IO Hadisə Dinləyiciləri ===
    if(socket) {
        socket.on('connect', () => {
            console.log('Lobby: Socket.IO serverinə qoşuldu! ID:', socket.id);
            if (infoMessageArea && infoMessageArea.textContent === 'Serverə qoşulunur...') {
                infoMessageArea.textContent = 'Serverdən otaq siyahısı alınır...';
            }
            // İstifadəçini serverə qeyd etməyə ehtiyac yoxdur, sessiondan tanınır
        });

        socket.on('disconnect', (reason) => {
            // <<< ƏVVƏLKİ CAVABDA ƏLAVƏ EDİLMİŞ DETALLI LOG KODU BURADA >>>
            console.error('############################################');
            console.error('###### SOCKET BAĞLANTISI KƏSİLDİ! ######');
            console.error('############################################');
            console.error('Səbəb (Reason):', reason);

            if (reason === 'io server disconnect') {
                 console.warn('Server bağlantını kəsdi (ehtimalla logout və ya başqa səbəb).');
                 // Loginə yönləndirək
                 // alert("Serverlə əlaqə kəsildi. Yenidən giriş tələb olunur.");
                 // redirectToLogin();
            } else if (reason === 'ping timeout') {
                 console.warn('Serverdən vaxtında cavab gəlmədi (ping timeout). Şəbəkə problemi ola bilər.');
            } else if (reason === 'transport close') {
                 console.warn('Bağlantı qapandı (transport close). Şəbəkə kəsilməsi və ya səhifənin bağlanması ola bilər.');
            } else if (reason === 'transport error') {
                 console.error('Bağlantı xətası baş verdi (transport error).');
            } else {
                console.log('Bağlantı kəsilməsinin digər səbəbi:', reason);
            }
            showMsg(infoMessageArea, `Serverlə əlaqə kəsildi (${reason}). Səhifəni yeniləyin və ya internet bağlantınızı yoxlayın.`, 'error', 0);
             // Avtomatik yenidən qoşulma onsuz da baş verir (əgər deaktiv edilməyibsə)
             // Amma əgər auth xətası ilə kəsilməyibsə, istifadəçiyə məlumat vermək yaxşıdır.
        });

        socket.on('connect_error', (error) => {
            console.error('Lobby: Socket.IO qoşulma xətası:', error.message);
             // Əgər xəta autentifikasiya ilə bağlıdırsa
             if (error.message === 'Authentication error') {
                 showMsg(infoMessageArea, 'Giriş zaman aşımına uğradı və ya etibarsızdır. Zəhmət olmasa yenidən giriş edin.', 'error', 0);
                 // Biraz gözləyib loginə yönləndir
                 setTimeout(redirectToLogin, 4000);
             } else {
                 // Digər qoşulma xətaları
                 showMsg(infoMessageArea, 'Serverə qoşulmaq mümkün olmadı. Serverin işlədiyindən əmin olun.', 'error', 0);
             }
        });

        socket.on('room_list_update', (roomListFromServer) => {
             console.log('>>> Lobby: room_list_update ALINDI! <<< Otaq sayı:', roomListFromServer?.length || 0);
             // console.log('Alınan otaqlar:', roomListFromServer); // Detallı baxmaq üçün
             currentRooms = roomListFromServer || [];
             displayRooms(currentRooms); // Otaqları göstərən funksiyanı çağır
        });

        socket.on('creation_error', (errorMessage) => {
             console.error('Otaq yaratma xətası (serverdən):', errorMessage);
             showMsg(createRoomMessage, errorMessage, 'error');
             if (createRoomSubmitBtn) createRoomSubmitBtn.disabled = false; // Düyməni aktiv et
        });

        socket.on('join_error', (errorMessage) => {
             console.error('Otağa qoşulma xətası (serverdən):', errorMessage);
             // Hansı modal açıqdırsa, orada mesajı göstər
             if (joinRoomModal && joinRoomModal.style.display === 'block') {
                 showMsg(joinRoomMessage, errorMessage, 'error');
                 if (joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false; // Şifrə modalındakı düymə
             } else {
                 // Əgər modal açıq deyilsə (şifrəsiz qoşulma cəhdində xəta olubsa)
                 showMsg(infoMessageArea, errorMessage, 'error');
                 // Otaq elementlərindəki pointer-events'i bərpa etmək lazım ola bilər
                 // document.querySelectorAll('.room-item').forEach(item => item.style.pointerEvents = 'auto');
             }
        });

        // Bu hadisə artıq create_room zamanı GÖNDƏRİLMİR
        // socket.on('room_created', (data) => { ... });

        socket.on('room_joined', (data) => {
             // Bu hadisə yalnız uğurlu qoşulmadan sonra gəlməlidir
             console.log('Otağa uğurla qoşuldun (server cavabı):', data);
             hideModal(joinRoomModal); // Şifrə modalını bağla (əgər açıqdırsa)
             try {
                  const roomNameParam = encodeURIComponent(data.roomName || 'Bilinməyən Otaq');
                  const playerNameParam = encodeURIComponent(loggedInUsername);
                  const boardSize = data.boardSize || 3;
                  console.log(`Oyun otağına yönləndirilir: ${data.roomId}`);
                  window.location.href = `../game/oda_ici.html?roomId=${data.roomId}&roomName=${roomNameParam}&playerName=${playerNameParam}&size=${boardSize}`;
             } catch (e) {
                 console.error("Yönləndirmə xətası ('room_joined' zamanı):", e);
                 showMsg(infoMessageArea, 'Oyun səhifəsinə keçid zamanı xəta.', 'error');
             }
        });

        // Bu səhifədə lazım olmayan hadisələr
        // socket.on('opponent_joined', ...);
        // socket.on('opponent_left_game', ...);

    } else {
        // Socket obyekti heç yaradılmayıbsa
        console.error("Socket obyekti mövcud deyil! Bağlantı qurulmayıb.");
        showMsg(infoMessageArea, 'Real-time bağlantı qurulamadı.', 'error', 0);
    }
    // ========================================


    // === DOM Hadisə Dinləyiciləri (Listeners) ===
    if (createRoomButton) {
         createRoomButton.addEventListener('click', () => {
             // Modal açılmazdan əvvəl inputları və mesajı təmizlə
             if(newRoomNameInput) newRoomNameInput.value = '';
             if(newRoomPasswordInput) newRoomPasswordInput.value = '';
             if(newBoardSizeSelect) newBoardSizeSelect.value = '3'; // Default
             if(createRoomMessage) { createRoomMessage.textContent = ''; createRoomMessage.className = 'message'; createRoomMessage.removeAttribute('style'); createRoomMessage.style.display = 'none';} // Mesajı gizlət
             if(createRoomSubmitBtn) createRoomSubmitBtn.disabled = false; // Düyməni aktiv et
             updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay); // Qaydanı yenilə
             showModal(createRoomModal);
             newRoomNameInput?.focus(); // Oda adı inputuna fokuslan
        });
    } else { console.error("createRoomButton elementi tapılmadı!"); }

    if (newBoardSizeSelect) {
         newBoardSizeSelect.addEventListener('change', () => {
            updateRuleDisplay(newBoardSizeSelect, newBoardSizeRuleDisplay);
        });
    }

    if (createRoomSubmitBtn) {
         createRoomSubmitBtn.addEventListener('click', () => {
             const roomName = newRoomNameInput?.value.trim();
             const password = newRoomPasswordInput?.value; // Boş da ola bilər
             const boardSize = newBoardSizeSelect?.value;

             // Frontend validasiyası
             if (!roomName) {
                  showMsg(createRoomMessage, 'Otaq adı boş ola bilməz.', 'error');
                  return;
             }
             // Şifrə validasiyası (əgər daxil edilibsə)
             if (password && password.length > 0) {
                 if (password.length < 2 || !(/[a-zA-Z]/.test(password) && /\d/.test(password))) {
                     showMsg(createRoomMessage, 'Şifrə tələblərə uyğun deyil (min 2 krk, 1 hərf+1 rəqəm).', 'error', 5000);
                     return;
                 }
             }

             console.log("Serverə 'create_room' hadisəsi göndərilir...");
             createRoomSubmitBtn.disabled = true; // Düyməni deaktiv et
             showMsg(createRoomMessage, 'Otaq yaradılır...', 'info', 0); // Proses gedir mesajı

             if(socket && socket.connected) { // Socket bağlıdırsa göndər
                 socket.emit('create_room', {
                     name: roomName,
                     password: password || null, // Boşdursa null göndər
                     boardSize: boardSize
                 });
             } else {
                 console.error("Socket bağlantısı yoxdur və ya kəsilib! Otaq yaratmaq mümkün deyil.");
                 showMsg(createRoomMessage, 'Serverlə bağlantı yoxdur. Otaq yaratmaq mümkün olmadı.', 'error');
                 createRoomSubmitBtn.disabled = false; // Düyməni yenidən aktiv et
             }
             // Serverdən cavab gəlməzsə düyməni aktiv etmək üçün timeout (opsional)
             setTimeout(() => {
                  if (createRoomSubmitBtn && createRoomSubmitBtn.disabled) {
                       // Əgər hələ də 'Otaq yaradılır...' mesajı görünürsə, xəbərdarlıq et
                       if(createRoomMessage.textContent === 'Otaq yaradılır...') {
                           showMsg(createRoomMessage, 'Serverdən cavab gecikir...', 'warning');
                       }
                       createRoomSubmitBtn.disabled = false;
                  }
             }, 10000); // 10 saniyə
        });
    } else { console.error("createRoomSubmitBtn elementi tapılmadı!"); }

    if (joinRoomSubmitBtn) {
        joinRoomSubmitBtn.addEventListener('click', () => {
            const roomId = joinRoomIdInput?.value;
            const password = joinRoomPasswordInput?.value;

            if (!roomId) {
                 showMsg(joinRoomMessage, 'Otaq ID tapılmadı!', 'error');
                 return;
            }
            // Şifrəli otaq üçün şifrənin daxil edildiyini yoxla
            if (!password) {
                 showMsg(joinRoomMessage, 'Zəhmət olmasa, otaq şifrəsini daxil edin.', 'error');
                 return;
            }

            console.log(`Serverə 'join_room' hadisəsi göndərilir (şifrə ilə): ID = ${roomId}`);
            joinRoomSubmitBtn.disabled = true; // Düyməni deaktiv et
            showMsg(joinRoomMessage, 'Otağa qoşulunur...', 'info', 0);

            if(socket && socket.connected) {
                socket.emit('join_room', {
                    roomId: roomId,
                    password: password
                });
            } else {
                 console.error("Socket bağlantısı yoxdur və ya kəsilib! Otağa qoşulmaq mümkün deyil.");
                 showMsg(joinRoomMessage, 'Serverlə bağlantı yoxdur. Otağa qoşulmaq mümkün olmadı.', 'error');
                 joinRoomSubmitBtn.disabled = false; // Düyməni yenidən aktiv et
            }
            // Timeout (opsional)
            setTimeout(() => {
                 if (joinRoomSubmitBtn && joinRoomSubmitBtn.disabled) {
                      if(joinRoomMessage.textContent === 'Otağa qoşulunur...') {
                          showMsg(joinRoomMessage, 'Serverdən cavab gecikir...', 'warning');
                      }
                      joinRoomSubmitBtn.disabled = false;
                 }
            }, 10000); // 10 saniyə
       });
    } else { console.error("joinRoomSubmitBtn elementi tapılmadı!"); }

    // Modal bağlama düymələri
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
             const modalId = button.dataset.modalId;
             if (modalId) {
                  const modalToHide = document.getElementById(modalId);
                  if (modalToHide) {
                      hideModal(modalToHide);
                      // Modalı bağlayanda içindəki mesajı təmizlə
                      const messageElement = modalToHide.querySelector('.message');
                      if (messageElement) { messageElement.textContent = ''; messageElement.className = 'message'; messageElement.removeAttribute('style'); messageElement.style.display = 'none';}
                  }
             }
        });
    });
    // Modal xaricinə klikləyəndə bağlama
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
             hideModal(event.target);
             const messageElement = event.target.querySelector('.message');
             if (messageElement) { messageElement.textContent = ''; messageElement.className = 'message'; messageElement.removeAttribute('style'); messageElement.style.display = 'none';}
        }
    });
    // Enter düyməsi ilə form göndərmə
    newRoomNameInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoomSubmitBtn?.click(); });
    newRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoomSubmitBtn?.click(); });
    joinRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinRoomSubmitBtn?.click(); });
    // ========================================

}); // DOMContentLoaded Sonu