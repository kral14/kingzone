// public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: v2 - Socket.IO İnteqrasiyası + AI URL Parametri - Hissə 1/4

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Oda İçi JS (v2 - Socket.IO) Başladı.");

    // ---- Qlobal Dəyişənlər ----
    let loggedInUser = null;        // Giriş etmiş istifadəçi (Auth ilə alınır)
    let currentRoomId = null;       // Hazırkı otağın ID-si (URL-dən və ya serverdən)
    let currentRoomData = {};       // Otaq haqqında məlumat (serverdən gələcək)
    let socket = null;              // Socket.IO bağlantısı
    let currentPlayerName = 'Oyunçu'; // Bu istifadəçinin adı
    let opponentPlayerName = 'Rəqib';  // Rəqibin adı
    let isOpponentPresent = false;    // Rəqib qoşulubmu?
    let isPlayingAgainstAI = false;   // AI ilə oynanılır?
    let aiPlayerSymbol = '';        // AI-nin simvolu ('X' və ya 'O')
    let isCurrentUserCreator = false; // Bu istifadəçi otağı yaradıbmı? (Server təyin etməli)

    // ---- Oyun Durumu Dəyişənləri ----
    let board = [];
    let currentPlayer = '';         // Hazırkı sıra kimdədir ('X' və ya 'O')
    let player1Symbol = '?';        // Bu oyunçunun simvolu
    let player2Symbol = '?';        // Rəqibin simvolu
    let isGameOver = true;
    let boardSize = 3;              // Default
    let cells = [];
    let winningCombination = [];
    let player1Roll = null;         // Bu oyunçunun zər nəticəsi
    let player2Roll = null;         // Rəqibin zər nəticəsi
    let diceWinner = null;          // Zər atmanın qalibi (username)

    // ---- DOM Elementləri ----
    const gameLoadingOverlay = document.getElementById('game-loading-overlay');
    const roomNameDisplay = document.getElementById('room-name');
    const boardElement = document.getElementById('game-board');
    const turnIndicator = document.getElementById('turn-indicator');
    const gameStatusDisplay = document.getElementById('game-status');
    const playerXInfo = document.getElementById('player-x-info');
    const playerOInfo = document.getElementById('player-o-info');
    const playerXSymbolDisplay = document.getElementById('player-x-symbol');
    const playerOSymbolDisplay = document.getElementById('player-o-symbol');
    const playerXNameDisplay = document.getElementById('player-x-name');
    const playerONameDisplay = document.getElementById('player-o-name');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const fireworksOverlay = document.getElementById('fireworks-overlay');
    const shatteringTextContainer = document.getElementById('shattering-text-container');
    const editRoomBtn = document.getElementById('edit-room-btn');
    const editRoomModal = document.getElementById('edit-room-modal');
    const closeEditModalButton = editRoomModal?.querySelector('.close-button');
    const saveRoomChangesBtn = document.getElementById('save-room-changes-btn');
    const deleteRoomConfirmBtn = document.getElementById('delete-room-confirm-btn');
    const editRoomMessage = document.getElementById('edit-room-message');
    const editBoardSizeSelect = document.getElementById('edit-board-size');
    const editRoomNameInput = document.getElementById('edit-room-name');
    const editRoomPasswordCheck = document.getElementById('edit-room-password-check');
    const editRoomPasswordInput = document.getElementById('edit-room-password');
    const restartGameBtn = document.getElementById('restart-game-btn');
    const kickOpponentBtn = document.getElementById('kick-opponent-btn'); // Hələlik saxlayırıq
    const callSnowBtn = document.getElementById('call-snow-btn'); // Hələlik saxlayırıq

    // Zar Modalı Elementləri
    const diceRollModal = document.getElementById('dice-roll-modal');
    const diceInstructions = document.getElementById('dice-instructions');
    const diceScene = document.getElementById('dice-scene');
    const diceCubeElement = document.getElementById('dice-cube');
    const yourRollResultDisplay = document.getElementById('your-roll-result');
    const opponentRollResultDisplay = document.getElementById('opponent-roll-result');
    const yourRollBox = document.getElementById('your-roll-box');
    const opponentRollBox = document.getElementById('opponent-roll-box');

    // Simvol Seçim Modalı Elementləri
    const symbolSelectModal = document.getElementById('symbol-select-modal');
    const symbolSelectTitle = document.getElementById('symbol-select-title');
    const symbolSelectMessage = document.getElementById('symbol-select-message');
    const symbolOptionsDiv = symbolSelectModal?.querySelector('.symbol-options');
    const symbolWaitingMessage = document.getElementById('symbol-waiting-message');

    // ---- Zar Değişkenleri ----
    let isDiceRolling = false;
    let currentDiceRotateX = 0; let currentDiceRotateY = 0; let currentDiceRotateZ = 0;
    const diceRotations = { /* ... (əvvəlki kimi) ... */ };
    let isDragging = false; let dragStartX, dragStartY, previousMouseX, previousMouseY;
    const dragThreshold = 10; const rotateSensitivity = 0.4; let initialCenterZ = -55;

    // ---- Yardımçı Fonksiyonlar ----
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'info', duration = 3000) => { /* ... (əvvəlki kimi) ... */ };
    function escapeHtml(unsafe) { /* ... (əvvəlki kimi) ... */ }
    function showLoadingOverlay(text = 'Yüklənir...') {
        if(gameLoadingOverlay) {
            const loadingText = gameLoadingOverlay.querySelector('.game-loading-text');
            if(loadingText) loadingText.textContent = text;
            gameLoadingOverlay.classList.add('visible');
        } else console.error("gameLoadingOverlay elementi tapılmadı!");
    }
    function hideLoadingOverlay() { if(gameLoadingOverlay) gameLoadingOverlay.classList.remove('visible'); }

    // ----- URL Parametrlərini Alma Funksiyası -----
    function getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const sizeParam = parseInt(params.get('size') || '3', 10);
        const validatedSize = Math.max(3, Math.min(6, sizeParam));
        const urlAiParam = params.get('ai'); // Check for 'SNOW' or other AI identifiers
        const playWithAI = urlAiParam === 'SNOW'; // Yalnız 'SNOW' olarsa AI oyunu hesab edək
        const roomNameParam = decodeURIComponent(params.get('roomName') || 'Bilinməyən Otaq');
        const roomIdParam = params.get('roomId'); // Otaq ID-sini al

        return {
            roomId: roomIdParam, // null ola bilər (AI oyunlarında)
            roomName: roomNameParam,
            playerName: decodeURIComponent(params.get('playerName') || 'Qonaq'),
            size: validatedSize,
            playWithAI: playWithAI
        };
    }


    // ===== GİRİŞ YOXLAMASI (Session ilə) =====
    try {
        console.log("Oda İçi: /check-auth sorğusu...");
        showLoadingOverlay('Sessiya yoxlanılır...');
        const response = await fetch('/check-auth');
        const data = await response.json();
        if (!response.ok || !data.loggedIn) {
            console.log("Oda İçi: Giriş edilməyib, login səhifəsinə yönləndirilir...");
            window.location.href = '/ANA SEHIFE/login/login.html';
            return;
        }
        loggedInUser = data.user;
        currentPlayerName = loggedInUser.nickname; // loggedInUser adını birbaşa mənimsədək
        console.log(`Oda İçi: Giriş edilib: ${loggedInUser.nickname}`);

        // Giriş uğurlu oldusa, oyunu başlat
        initializeGame();

    } catch (error) {
        console.error("Oda İçi: Auth yoxlama xətası:", error);
        hideLoadingOverlay();
        alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
        window.location.href = '/ANA SEHIFE/login/login.html';
        return;
    }
    // =======================================


    // ===== OYUNUN İLK QURAŞDIRILMASI =====
    function initializeGame() {
        console.log("[initializeGame] Başladı.");
        showLoadingOverlay('Oyun interfeysi qurulur...');

        try {
            const params = getUrlParams();
            // currentPlayerName artıq yuxarıda təyin edilib
            currentRoomId = params.roomId; // Normal oyunlar üçün ID
            const receivedRoomName = params.roomName;
            boardSize = params.size;
            isPlayingAgainstAI = params.playWithAI; // URL-dən AI statusunu alırıq

            // Player 1 adını göstər
            if (playerXNameDisplay) playerXNameDisplay.textContent = currentPlayerName;

            if (isPlayingAgainstAI) {
                console.log("[initializeGame] AI Oyunu (SNOW) başladılır.");
                currentRoomId = `ai_local_${Date.now()}`; // AI oyunları üçün unikal lokal ID
                opponentPlayerName = "SNOW";
                isOpponentPresent = true;
                isCurrentUserCreator = true; // AI oyununda istifadəçi həmişə 'yaradıcı'dır
                currentRoomData = { // AI oyunları üçün minimal otaq datası
                     id: currentRoomId, name: receivedRoomName, creatorUsername: currentPlayerName,
                     hasPassword: false, boardSize: boardSize, isAiRoom: true
                };
                if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(currentRoomData.name)}`;
                if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;
                updateHeaderButtonsVisibility();
                adjustStylesForBoardSize(boardSize);
                createBoard();
                resetGameStateVars();
                // AI oyunu üçün Socket.IO bağlantısı qurmağa ehtiyac YOXDUR (əgər yalnız oyun üçün istifadə edilirsə)
                // Oyunu birbaşa zər atma mərhələsinə keçirək
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'SNOW ilə oyun başlayır. Zər atın!';
                hideLoadingOverlay(); // Yükləməni gizlət
                setupDiceModalForRollOff();
                showModal(diceRollModal);
                initDice();

            } else {
                // Normal (Multiplayer) Oyun
                console.log(`[initializeGame] Multiplayer oyunu başladılır. RoomID: ${currentRoomId}`);
                if (!currentRoomId) {
                    throw new Error("Multiplayer oyunu üçün Otaq ID tapılmadı!");
                }
                opponentPlayerName = "Rəqib Gözlənilir...";
                isOpponentPresent = false;
                // isCurrentUserCreator serverdən gəlməlidir, hələlik false qəbul edək
                isCurrentUserCreator = false; // Bu, serverdən 'room_info' kimi bir hadisə ilə təyin edilməlidir
                 currentRoomData = { // İlkin məlumat, serverdən gələcəklə yenilənəcək
                      id: currentRoomId, name: receivedRoomName, creatorUsername: '?',
                      hasPassword: false, boardSize: boardSize, isAiRoom: false
                 };
                 if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(currentRoomData.name)}`;
                 if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;
                 updateHeaderButtonsVisibility(); // Başlanğıcda düymələri göstər/gizlə
                 adjustStylesForBoardSize(boardSize);
                 createBoard();
                 resetGameStateVars();
                 if (gameStatusDisplay) gameStatusDisplay.textContent = 'Rəqib gözlənilir...';
                 boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';
                 if (restartGameBtn) restartGameBtn.disabled = true;

                // --- Socket.IO Bağlantısını Qur (YALNIZ MULTIPLAYER ÜÇÜN) ---
                setupGameSocketConnection(currentRoomId);
                // --- Socket.IO qoşulduqdan və opponent_joined gəldikdən sonra oyun başlayacaq ---
                hideLoadingOverlay(); // Yükləməni gizlət (rəqib gözləmə statusu göstəriləcək)
            }

            // Zar ölçüsünü hesabla
            try {
                const diceSizeValue = getComputedStyle(document.documentElement).getPropertyValue('--dice-size').trim();
                if (diceSizeValue) initialCenterZ = parseFloat(diceSizeValue.replace('px','')) / -2;
            } catch(e) { console.error("[initGame] CSS --dice-size alınarkən xəta:", e); initialCenterZ = -55; }

            // Player info başlanğıc vəziyyəti
            updatePlayerInfo();

            console.log(`[initializeGame] Oyun interfeysi quruldu. AI=${isPlayingAgainstAI}`);

        } catch (initError) {
            console.error("[initializeGame] Ümumi xəta:", initError);
            hideLoadingOverlay();
            if(gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yüklənərkən xəta baş verdi.";
            if(turnIndicator) turnIndicator.textContent = "Xəta";
        }
    } // initializeGame sonu


    // ===== SOCKET.IO BAĞLANTISI və OYUN İÇİ HADİSƏLƏR =====
    function setupGameSocketConnection(roomId) {
        if (socket && socket.connected) {
            console.warn("Artıq mövcud socket bağlantısı var. Köhnəsi bağlanılır...");
            socket.disconnect();
        }
        if (isPlayingAgainstAI) {
             console.log("AI oyununda socket bağlantısı qurulmur.");
             return;
        }
         if (!roomId) {
             console.error("setupGameSocketConnection: Otaq ID təyin edilməyib!");
             return;
         }

        console.log(`[SocketSetup] ${roomId} otağı üçün Socket.IO bağlantısı qurulur...`);
        showLoadingOverlay('Serverə qoşulunur...'); // Rəqib gözləyərkən də göstərmək olar

        socket = io({
             reconnectionAttempts: 3, // Daha az cəhd oyun içində
             // Session cookie avtomatik göndərilməlidir (əgər eyni domaindirsə)
             // Əks halda, withCredentials lazım ola bilər:
             // transportOptions: { polling: { extraHeaders: { Authorization: "Bearer token..." } } } // Başqa auth növü üçün
        });

        // --- Əsas Bağlantı Hadisələri ---
        socket.on('connect', () => {
            console.log(`[Socket] Oyun serverinə qoşuldu! Socket ID: ${socket.id}, Otaq ID: ${roomId}`);
            hideLoadingOverlay();
            // Serverə bu otağa qoşulduğumuzu bildirək (əgər server tərəfi bunu gözləyirsə)
            // socket.emit('confirm_game_join', { roomId: roomId });
             if (gameStatusDisplay && !isOpponentPresent) { // Əgər hələ rəqib yoxdursa
                 gameStatusDisplay.textContent = 'Rəqib gözlənilir...';
             }
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Socket] Serverlə bağlantı kəsildi:', reason);
            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Bağlantı kəsildi!';
            if (turnIndicator) turnIndicator.textContent = "Offline";
             isGameOver = true;
             isOpponentPresent = false; // Rəqib də ayrılmış sayılır
             opponentPlayerName = 'Rəqib (Offline)';
             updatePlayerInfo();
            boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';
            // Təkrar qoşulma cəhdləri bitdikdə istifadəçini lobiyə yönləndirmək olar
        });

        socket.on('connect_error', (error) => {
            console.error('[Socket] Qoşulma xətası:', error.message);
            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Qoşulma xətası!';
            if (turnIndicator) turnIndicator.textContent = "Xəta";
            isGameOver = true;
            boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';
        });

        // Otaq silindikdə serverdən gələn mesaj
        socket.on('room_deleted_kick', (data) => {
             console.warn('Otaq silindiyi üçün çıxarıldınız:', data?.message);
             alert(data?.message || 'Otaq yaradan tərəfindən silindi.');
             window.location.href = '../lobby/test_odalar.html'; // Lobiyə yönləndir
        });

        // --- Oyunla Bağlı Hadisələr (Hissə 2-də təyin ediləcək) ---
        setupGameEventListeners(socket); // Dinləyiciləri ayrı funksiyada quraşdıraq

    } // setupGameSocketConnection sonu


    // ---- Oyun İçi Hadisə Dinləyicilərinin Quraşdırılması ----
    function setupGameEventListeners(socketInstance) {
        console.log("[SocketListeners] Oyun hadisə dinləyiciləri quraşdırılır...");

        // RƏQİBİN QOŞULMASI
        socketInstance.on('opponent_joined', (data) => {
            console.log(`[Socket Event] opponent_joined alındı:`, data);
            if (!data || !data.username) {
                console.warn("opponent_joined: Keçərsiz data alındı.");
                opponentPlayerName = 'Rəqib (?)';
            } else {
                opponentPlayerName = data.username;
            }
            isOpponentPresent = true;
            if (playerONameDisplay) playerONameDisplay.textContent = escapeHtml(opponentPlayerName);
             if (gameStatusDisplay) gameStatusDisplay.textContent = `${opponentPlayerName} qoşuldu. Zər atılır...`;

            // Rəqib qoşulduqda zər modalını göstər
            setupDiceModalForRollOff();
            showModal(diceRollModal);
            initDice();
            updatePlayerInfo(); // Rəqib adını yenilə
            updateHeaderButtonsVisibility(); // Kick düyməsini göstər (əgər creator-dırsa)
        });

       // ... Digər dinləyicilər (Hissə 2-də) ...

    } // setupGameEventListeners sonu

    // --- Hissə 1 Sonu ---
    // public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: v2 - Socket.IO İnteqrasiyası + AI URL Parametri - Hissə 2/4

// ---- DOMContentLoaded içində davam edirik (Hissə 1-dən) ----

    // ---- Oyun İçi Hadisə Dinləyicilərinin Quraşdırılması (Davamı) ----
    function setupGameEventListeners(socketInstance) {
        // ... (opponent_joined listener-ı Hissə 1-də idi) ...

        // RƏQİBİN AYRILMASI
        socketInstance.on('opponent_left_game', (data) => {
            console.log(`[Socket Event] opponent_left_game alındı:`, data);
            const opponentWhoLeft = data?.username || 'Rəqib';
            if (gameStatusDisplay) gameStatusDisplay.textContent = `${opponentWhoLeft} otaqdan ayrıldı.`;
            if (turnIndicator) turnIndicator.textContent = "Gözlənilir";
            isGameOver = true;
            isOpponentPresent = false;
            opponentPlayerName = 'Rəqib Gözlənilir...';
            // Simvolları və oyun vəziyyətini sıfırla
            resetGameStateVars();
            // Lövhəni və UI-ni sıfırla
            resetBoardAndStatus();
            // Zər və simvol modallarını gizlət
            hideModal(diceRollModal);
            hideModal(symbolSelectModal);
            // Yenidən başlat düyməsini deaktiv et
            if (restartGameBtn) restartGameBtn.disabled = true;
            // Header düymələrini yenilə (Call Snow görünə bilər)
            updateHeaderButtonsVisibility();
        });

        // RƏQİBİN ZƏR NƏTİCƏSİ
        socketInstance.on('opponent_dice_result', (data) => {
             console.log(`[Socket Event] opponent_dice_result alındı:`, data);
             if (!data || typeof data.roll !== 'number') {
                 console.warn("opponent_dice_result: Keçərsiz data alındı.");
                 return;
             }
             if (isDiceRolling) { // Əgər hələ animasiya gedirsə, bir az gözləyək
                  console.log("Zər animasiyası bitməyib, opponent_dice_result üçün qısa gözləmə...");
                  setTimeout(() => {
                       player2Roll = data.roll;
                       if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = player2Roll;
                       // Əgər öz nəticəmiz də varsa, qalibi təyin et
                       if (player1Roll !== null) {
                           console.log("Hər iki zər nəticəsi mövcuddur, handleRollOffResults çağırılır (gecikmə ilə).");
                           handleRollOffResults(player1Roll, player2Roll);
                       }
                  }, 500); // Yarım saniyə gözlə
             } else {
                  player2Roll = data.roll;
                  if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = player2Roll;
                  // Əgər öz nəticəmiz də varsa, qalibi təyin et
                  if (player1Roll !== null) {
                       console.log("Hər iki zər nəticəsi mövcuddur, handleRollOffResults çağırılır.");
                       handleRollOffResults(player1Roll, player2Roll);
                  }
             }
        });

        // RƏQİBİN SİMVOL SEÇİMİ
        socketInstance.on('opponent_symbol_chosen', (data) => {
            console.log(`[Socket Event] opponent_symbol_chosen alındı:`, data);
            if (!data || (data.symbol !== 'X' && data.symbol !== 'O')) {
                console.warn("opponent_symbol_chosen: Keçərsiz simvol alındı.");
                // Fallback olaraq 'X' seçək?
                 startGameProcedure('X'); // Varsayılan olaraq X ilə başla
                return;
            }
            // Rəqib simvolu seçdi, oyunu onun seçdiyi simvolla başlat
             if (symbolSelectModal.style.display === 'block') { // Əgər modal hələ açıqdırsa
                 startGameProcedure(data.symbol);
             } else {
                  console.log("opponent_symbol_chosen alındı, amma simvol seçim modalı artıq bağlıdır.");
             }
        });

        // RƏQİBİN HƏRƏKƏTİ
        socketInstance.on('opponent_moved', (data) => {
            console.log(`[Socket Event] opponent_moved alındı:`, data);
            if (!data || typeof data.index !== 'number' || !data.mark || isGameOver || isPlayingAgainstAI) {
                console.warn("opponent_moved: Keçərsiz data, oyun bitib və ya AI oyunu.", data);
                return;
            }
            // Rəqibin (player2) hərəkətini lövhədə yerləşdir
            placeMark(data.index, data.mark); // Bu funksiya currentPlayer-i dəyişdirmir

            // Əgər oyun rəqibin hərəkəti ilə bitmədisə, sıranı özümüzə (player1) qaytar
            if (!isGameOver) {
                switchPlayer(); // Sıranı dəyişdir (indi player1-də olmalıdır)
                updateTurnIndicator();
                boardElement.style.pointerEvents = 'auto'; // Lövhəni aktiv et
                 if (gameStatusDisplay) gameStatusDisplay.textContent = `Sıra: ${currentPlayerName}`; // Statusu yenilə
            } else {
                 boardElement.style.pointerEvents = 'none'; // Oyun bitibsə lövhəni deaktiv et
            }
        });

        // YENİDƏN BAŞLATMA TƏKLİFİ ALINDI
        socketInstance.on('restart_requested', (data) => {
             console.log(`[Socket Event] restart_requested alındı: ${data?.username}`);
             if (isGameOver && isOpponentPresent) { // Yalnız oyun bitdikdə və rəqib qoşulu olduqda
                  const requester = data?.username || 'Rəqib';
                  // Sadə bir təsdiq mesajı ilə
                  if (confirm(`${requester} oyunu yenidən başlatmağı təklif edir. Qəbul edirsiniz?`)) {
                       // Qəbul etdikdə serverə bildir
                       console.log("Yenidən başlatma təklifi qəbul edildi, serverə 'accept_restart' göndərilir.");
                       socketInstance.emit('accept_restart');
                       // Öz tərəfimizdə də oyunu yenidən başlat (serverdən gələn 'restart_accepted' ilə də etmək olar)
                       handleRestartGame(true); // true -> qəbul edildiyi üçün
                  } else {
                       // Rədd etdikdə (hələlik heç nə etmirik, serverə bildirmək olar)
                       console.log("Yenidən başlatma təklifi rədd edildi.");
                       // socketInstance.emit('reject_restart'); // İstəyə bağlı
                  }
             } else {
                  console.warn("restart_requested alındı, amma oyun bitməyib və ya rəqib yoxdur.");
             }
        });

        // YENİDƏN BAŞLATMA QƏBUL EDİLDİ
        socketInstance.on('restart_accepted', (data) => {
            console.log(`[Socket Event] restart_accepted alındı: ${data?.username}`);
             if (isGameOver && isOpponentPresent) {
                  const accepter = data?.username || 'Rəqib';
                  if (gameStatusDisplay) gameStatusDisplay.textContent = `${accepter} yenidən başlatmağı qəbul etdi. Zər atılır...`;
                  // Oyunu yenidən başlat
                  handleRestartGame(true); // true -> qəbul edildiyi üçün
             } else {
                   console.warn("restart_accepted alındı, amma oyun bitməyib və ya rəqib yoxdur.");
             }
        });

    } // setupGameEventListeners sonu


    // ---- Yardımçı Oyun Funksiyaları ----

    function adjustStylesForBoardSize(size) { /* ... (Hissə 1-dəki kimi) ... */ }

    function createBoard() { /* ... (Hissə 1-dəki kimi) ... */ }

    // Oyun vəziyyətini sıfırlamaq üçün funksiya
     function resetGameStateVars() {
         board = Array(boardSize * boardSize).fill('');
         currentPlayer = ''; // Sıra zər və simvol seçimindən sonra təyin olunacaq
         player1Symbol = '?';
         player2Symbol = '?';
         isGameOver = true; // Oyun hələ başlamayıb
         winningCombination = [];
         player1Roll = null;
         player2Roll = null;
         diceWinner = null;
         // aiPlayerSymbol sıfırlanmır, isPlayingAgainstAI-dən asılıdır
         console.log("[resetGameStateVars] Oyun dəyişənləri sıfırlandı.");
     }

     // Lövhəni və status mesajlarını sıfırlamaq üçün funksiya
     function resetBoardAndStatus() {
         console.log("[resetBoardAndStatus] Lövhə və status sıfırlanır.");
         if (gameStatusDisplay) {
             gameStatusDisplay.textContent = ''; // Mesajı təmizlə
             gameStatusDisplay.className = 'game-status'; // Stilləri sıfırla
         }
         if (turnIndicator) turnIndicator.textContent = 'Gözlənilir...';

         // Remove event listeners and reset cells
         cells.forEach((cell, index) => {
             const newCell = cell.cloneNode(true); // Köhnə listenerları silmək üçün klonla
             newCell.className = 'cell'; // Stilləri sıfırla
             newCell.textContent = '';
             newCell.style.cursor = 'not-allowed'; // Başlanğıcda kliklənməz
             newCell.style.animation = ''; // Animasiyaları sıfırla
             cell.parentNode.replaceChild(newCell, cell);
             cells[index] = newCell; // Yeni elementi massivdə saxla
         });

         updatePlayerInfo(); // Oyunçu info bloklarını yenilə
         boardElement.style.opacity = '0.5'; // Lövhəni solğunlaşdır
         boardElement.style.pointerEvents = 'none'; // Klikləməni blokla
         if (restartGameBtn) restartGameBtn.disabled = true; // Yenidən başlat düyməsini deaktiv et
         hideFireworks(); // Əgər varsa, fişəng effektini gizlət
         clearShatteringText(); // Əgər varsa, parçalanma mətnini təmizlə
     }

     // Oyunçu məlumatlarını (ad, simvol, aktiv sıra) yeniləmək üçün funksiya
      function updatePlayerInfo() {
          if (!playerXInfo || !playerOInfo || !playerXSymbolDisplay || !playerOSymbolDisplay || !playerXNameDisplay || !playerONameDisplay) {
              console.error("Oyunçu məlumat elementləri tapılmadı!"); return;
          }

          // Player 1 (Bu Client)
          playerXSymbolDisplay.textContent = player1Symbol;
          playerXNameDisplay.textContent = escapeHtml(currentPlayerName);
          playerXInfo.className = `player-info ${player1Symbol === 'X' ? 'player-x' : (player1Symbol === 'O' ? 'player-o' : '')}`; // Add class based on symbol

          // Player 2 (Rəqib və ya AI)
          playerOSymbolDisplay.textContent = player2Symbol;
          playerONameDisplay.textContent = escapeHtml(opponentPlayerName);
          playerOInfo.className = `player-info ${player2Symbol === 'X' ? 'player-x' : (player2Symbol === 'O' ? 'player-o' : '')}`;

          // Aktiv sıranı göstər
           if (!isGameOver) {
               playerXInfo.classList.toggle('active-player', currentPlayer === player1Symbol);
               playerOInfo.classList.toggle('active-player', currentPlayer === player2Symbol);
           } else {
                playerXInfo.classList.remove('active-player');
                playerOInfo.classList.remove('active-player');
           }
      }

      // Növbə indikatorunu yeniləmək üçün funksiya
      function updateTurnIndicator() {
          if (isGameOver) {
               if (turnIndicator) turnIndicator.textContent = 'Oyun Bitdi';
               return;
          }
          if (!currentPlayer) { // Hələ sıra təyin edilməyibsə
               if (turnIndicator) turnIndicator.textContent = 'Simvol Seçilir...';
               return;
          }
          console.log(`[updateTurnIndicator] Növbə yenilənir: ${currentPlayer}`);
          if (turnIndicator) {
               const turnPlayerName = (currentPlayer === player1Symbol) ? currentPlayerName : opponentPlayerName;
               turnIndicator.textContent = `Sıra: ${escapeHtml(turnPlayerName)} (${currentPlayer})`;
          }
          if (gameStatusDisplay) {
               const turnPlayerName = (currentPlayer === player1Symbol) ? currentPlayerName : opponentPlayerName;
               gameStatusDisplay.textContent = `Sıra: ${escapeHtml(turnPlayerName)}`;
               gameStatusDisplay.className = 'game-status'; // Stilləri sıfırla
          }
          updatePlayerInfo(); // Aktiv oyunçu stilini də yeniləyək
      }

    // --- Hissə 2 Sonu ---