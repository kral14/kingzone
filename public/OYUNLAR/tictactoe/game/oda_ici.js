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
    // public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: v2 - Socket.IO İnteqrasiyası + AI URL Parametri - Hissə 3/4

// ---- DOMContentLoaded içində davam edirik (Hissə 2-dən) ----

    // ---- Zər Funksiyaları (Socket.IO ilə) ----

    // Zər modalını mübarizə üçün ayarlayır
    function setupDiceModalForRollOff() {
        // ... (əvvəlki kod kimi - vizual ayarlamalar) ...
        if (isDiceRolling) return;
        console.log("[setupDiceModalForRollOff] Zər modalı mübarizə üçün ayarlanır.");
        if (diceInstructions) {
             // Rəqib qoşulmayıbsa (hələlik), gözləmə mesajı
             const instructionText = isOpponentPresent ? 'Başlayanı təyin etmək üçün zərə klikləyin və ya sürükləyin.' : 'Rəqib gözlənilir...';
             diceInstructions.textContent = instructionText;
             diceInstructions.classList.toggle('opponent-joined', isOpponentPresent);
             diceInstructions.classList.toggle('waiting', !isOpponentPresent);
        }
        if (yourRollResultDisplay) yourRollResultDisplay.textContent = '?';
        if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = '?';
        if (yourRollBox) yourRollBox.className = 'result-box';
        if (opponentRollBox) opponentRollBox.className = 'result-box';
        player1Roll = null; // Öz nəticəmizi sıfırla
        player2Roll = null; // Rəqibin nəticəsini sıfırla (əgər əvvəlki oyundan qalıbsa)
        diceWinner = null;
        if(diceCubeElement) diceCubeElement.style.cursor = isOpponentPresent ? 'grab' : 'not-allowed'; // Rəqib yoxdursa, klikləmək olmaz
        initDice(); // Zərin vizual vəziyyətini sıfırla
    }

    // Zəri fırlatmağa başlayır
    function rollDice() {
        if (isDiceRolling || !isOpponentPresent || !diceCubeElement) {
             console.log(`[rollDice] Bloklandı (rolling=${isDiceRolling}, opponent=${isOpponentPresent})`);
             return; // Zər fırlanırsa və ya rəqib yoxdursa, heç nə etmə
        }
        isDiceRolling = true;
        console.log("[rollDice] Zər atılır...");
        diceCubeElement.style.cursor = 'default';
        if(yourRollBox) yourRollBox.className = 'result-box'; // Köhnə stilləri təmizlə
        if(opponentRollBox) opponentRollBox.className = 'result-box';
        if(yourRollResultDisplay) yourRollResultDisplay.textContent = '?'; // Nəticəni müvəqqəti gizlət
        // if(opponentRollResultDisplay) opponentRollResultDisplay.textContent = '?'; // Rəqibin nəticəsini hələ bilmirik
        if(diceInstructions) diceInstructions.textContent = 'Zər atılır...';

        const myRoll = Math.floor(Math.random() * 6) + 1;
        console.log(`[rollDice] Sizin atışınız: ${myRoll}`);
        player1Roll = myRoll; // Öz nəticəmizi saxla

        // Animasiyanı başlat (əvvəlki kod kimi)
        const rollDurationValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-duration').trim() || '2.0s';
        const rollTimingFunctionValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-timing-function').trim() || 'cubic-bezier(0.3, 0.9, 0.4, 1)';
        const finalFace = diceRotations[myRoll];
        const fullRotationsX = 360 * (2 + Math.floor(Math.random() * 2));
        const fullRotationsY = 360 * (2 + Math.floor(Math.random() * 2));
        const fullRotationsZ = 360 * (1 + Math.floor(Math.random() * 1));
        const targetRotateX = finalFace.x + fullRotationsX;
        const targetRotateY = finalFace.y + fullRotationsY;
        const targetRotateZ = 0 + fullRotationsZ; // Z oxu ətrafında fırlanmanı sıfırlayaq
        diceCubeElement.style.transition = `transform ${rollDurationValue} ${rollTimingFunctionValue}`;
        setDiceTransform(targetRotateX, targetRotateY, targetRotateZ); // targetRotateZ əlavə edildi

        // Multiplayer oyunu üçün nəticəni serverə göndər
        if (!isPlayingAgainstAI && socket && socket.connected) {
             console.log(`[rollDice] Nəticə (${myRoll}) serverə göndərilir ('dice_roll_result')...`);
             socket.emit('dice_roll_result', { roll: myRoll });
        }

        // Animasiya bitdikdən sonra
        setTimeout(() => {
            console.log("[rollDice] Animasiya bitdi.");
            isDiceRolling = false; // Artıq fırlanmır
            diceCubeElement.style.transition = 'none'; // Keçidləri söndür
            currentDiceRotateX = finalFace.x; // Hazırkı vəziyyəti saxla
            currentDiceRotateY = finalFace.y;
            currentDiceRotateZ = 0; // Z oxunu sıfırla
            setDiceTransform(); // Son vəziyyəti tətbiq et

            if(yourRollResultDisplay) yourRollResultDisplay.textContent = myRoll; // Öz nəticəmizi göstər

            if (isPlayingAgainstAI) {
                // AI oyununda rəqibin nəticəsini dərhal simulyasiya et
                const opponentRollValue = Math.floor(Math.random() * 6) + 1;
                 console.log(`[rollDice] AI atışı (simulyasiya): ${opponentRollValue}`);
                player2Roll = opponentRollValue;
                if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = opponentRollValue;
                handleRollOffResults(myRoll, opponentRollValue); // Nəticələri dərhal emal et
            } else {
                // Multiplayer oyununda rəqibin nəticəsini gözləyirik ('opponent_dice_result' hadisəsi)
                console.log("[rollDice] Rəqibin zər nəticəsi gözlənilir...");
                 if (player2Roll !== null) { // Əgər rəqibin nəticəsi artıq gəlibsə (nadiren)
                      console.log("[rollDice] Rəqibin nəticəsi artıq gəlib, handleRollOffResults çağırılır.");
                      handleRollOffResults(myRoll, player2Roll);
                 } else {
                     if(diceInstructions) diceInstructions.textContent = 'Rəqibin zər atması gözlənilir...';
                 }
            }
        }, parseFloat(rollDurationValue.replace('s', '')) * 1000 + 100); // Animasiya + kiçik bufer
    }

    // Hər iki zər nəticəsi bəlli olduqda çağırılır
    function handleRollOffResults(myRoll, opponentRoll) {
        console.log(`[handleRollOffResults] Nəticələr: Siz=${myRoll}, Rəqib=${opponentRoll}`);
        // Nəticələrin göstərildiyindən əmin olaq (rollDice və opponent_dice_result içində onsuz da edilir)
        if(yourRollResultDisplay && yourRollResultDisplay.textContent === '?') yourRollResultDisplay.textContent = myRoll;
        if(opponentRollResultDisplay && opponentRollResultDisplay.textContent === '?') opponentRollResultDisplay.textContent = opponentRoll;

        if (myRoll > opponentRoll) {
            diceWinner = currentPlayerName; // Özümüz qalibik
            if(diceInstructions) diceInstructions.textContent = 'Siz yüksək atdınız! Simvol seçin.';
            if(yourRollBox) yourRollBox.classList.add('winner');
            if(opponentRollBox) opponentRollBox.classList.remove('winner', 'tie');
            triggerDiceScatterAndSymbolSelect(); // Simvol seçiminə keç
        } else if (opponentRoll > myRoll) {
            diceWinner = opponentPlayerName; // Rəqib qalibdir
            if(diceInstructions) diceInstructions.textContent = `${escapeHtml(opponentPlayerName)} yüksək atdı! ${isPlayingAgainstAI ? 'Simvol avtomatik seçiləcək.' : 'Simvol seçimi gözlənilir.'}`;
            if(opponentRollBox) opponentRollBox.classList.add('winner');
            if(yourRollBox) yourRollBox.classList.remove('winner', 'tie');
            triggerDiceScatterAndSymbolSelect(); // Simvol seçiminə keç (rəqibin seçməsini gözlə)
        } else {
            // Bərabərlik
            diceWinner = null;
            player1Roll = null; // Nəticələri sıfırla ki, yenidən atılsın
            player2Roll = null;
            if(diceInstructions) diceInstructions.textContent = 'Bərabərlik! Təkrar atmaq üçün zərə klikləyin.';
            if(yourRollBox) yourRollBox.classList.add('tie');
            if(opponentRollBox) opponentRollBox.classList.add('tie');
            isDiceRolling = false; // Yenidən atmaq üçün flag-i sıfırla
            if (isOpponentPresent && diceCubeElement) diceCubeElement.style.cursor = 'grab'; // Zəri aktiv et
        }
        console.log(`[handleRollOffResults] Qalib: ${diceWinner === null ? 'Bərabərlik' : diceWinner}`);
    }

    // Zəri dağıtma və simvol seçiminə keçid (əvvəlki kod kimi)
    function triggerDiceScatterAndSymbolSelect() { /* ... */ }
    function initDice() { /* ... */ }
    function setDiceTransform(rotX = currentDiceRotateX, rotY = currentDiceRotateY, rotZ = currentDiceRotateZ) { /* ... */ }
    // Zər sürükləmə/klikləmə hadisələri (əvvəlki kod kimi)
    function handleMouseDown(event) { /* ... */ }
    function handleMouseMove(event) { /* ... */ }
    function handleMouseUp(event) { /* ... */ }
    function handleTouchStart(e) { /* ... */ }
    function handleTouchMove(e) { /* ... */ }
    function handleTouchEnd(e) { /* ... */ }
    function handleDiceClickOrDragEnd() { /* ... (İçində rollDice() çağırılır) ... */ }


    // ---- Simvol Seçim Funksiyaları (Socket.IO ilə) ----

    function initSymbolSelection() {
        console.log("[initSymbolSelection] Başladı.");
        if (!symbolSelectModal || !symbolOptionsDiv || !symbolWaitingMessage || !symbolSelectTitle || !symbolSelectMessage) {
            console.error("Simvol seçim modalı elementləri tapılmadı!");
            startGameProcedure('X'); // Fallback: X ilə başla
            return;
        }
        symbolWaitingMessage.style.display = 'none';
        symbolOptionsDiv.style.display = 'flex';

        if (diceWinner === currentPlayerName) { // Əgər biz qalibiksə
            symbolSelectTitle.textContent = "Simvol Seçin";
            symbolSelectMessage.textContent = "Oyuna başlamaq üçün simvolunuzu seçin:";
            // Köhnə listenerları silib yenisini əlavə et (əmin olmaq üçün)
            symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => {
                 const newButton = button.cloneNode(true);
                 button.parentNode.replaceChild(newButton, button);
                 newButton.addEventListener('click', handleSymbolChoice);
            });
        } else { // Əgər rəqib qalibdirsə
            symbolSelectTitle.textContent = "Simvol Seçilir";
            symbolSelectMessage.textContent = `Oyuna "${escapeHtml(opponentPlayerName)}" başlayır. ${isPlayingAgainstAI ? 'Simvol avtomatik seçiləcək.' : 'Rəqib simvol seçir...'}`;
            symbolOptionsDiv.style.display = 'none';
            symbolWaitingMessage.style.display = 'block';
            if (isPlayingAgainstAI) {
                // AI üçün simvolu simulyasiya et
                 simulateOpponentSymbolChoice(500 + Math.random() * 500); // 0.5-1 saniyə gözləmə
            } else {
                // Multiplayer oyununda rəqibdən 'opponent_symbol_chosen' hadisəsini gözləyirik
                console.log("[initSymbolSelection] Rəqibin simvol seçimi gözlənilir...");
            }
        }
        showModal(symbolSelectModal);
    }

    // İstifadəçi simvol seçdikdə çağırılır
    function handleSymbolChoice(event) {
        const chosenSymbol = event.target.dataset.symbol;
        if (!chosenSymbol) return;

        console.log(`[handleSymbolChoice] ${currentPlayerName} "${chosenSymbol}" seçdi.`);

        // Multiplayer oyununda seçimi serverə göndər
        if (!isPlayingAgainstAI && socket && socket.connected) {
            console.log(`[handleSymbolChoice] Simvol seçimi (${chosenSymbol}) serverə göndərilir ('symbol_choice')...`);
            socket.emit('symbol_choice', { symbol: chosenSymbol });
        }

        // Oyunu seçilmiş simvolla başlat (həm AI, həm multiplayer üçün)
        startGameProcedure(chosenSymbol);
    }

    // AI-nin simvol seçimini simulyasiya edir
    function simulateOpponentSymbolChoice(delay) {
        const opponentChoice = (Math.random() > 0.5) ? 'X' : 'O';
        console.log(`[simulateOpponentSymbolChoice] AI "${opponentChoice}" seçdi (simulyasiya).`);
        setTimeout(() => {
             if (symbolSelectModal.style.display === 'block') { // Əgər modal hələ açıqdırsa
                 startGameProcedure(opponentChoice);
             } else {
                  console.warn("[simulateOpponentSymbolChoice] Modal artıq bağlı idi.");
             }
        }, delay);
    }


    // ---- Oyunu Başlatma Proseduru ----
    function startGameProcedure(startingSymbol) {
        console.log(`[startGameProcedure] Oyun "${startingSymbol}" ilə başlayır. Zər qalibi: ${diceWinner}`);
        hideModal(symbolSelectModal); // Simvol modalını bağla

        // Simvolları təyin et
        if (diceWinner === currentPlayerName) { // Əgər biz zəri udmuşuqsa
            player1Symbol = startingSymbol;
            player2Symbol = (startingSymbol === 'X') ? 'O' : 'X';
            currentPlayer = player1Symbol; // Oyuna biz başlayırıq
        } else { // Əgər rəqib zəri udubsa
            player2Symbol = startingSymbol;
            player1Symbol = (startingSymbol === 'X') ? 'O' : 'X';
            currentPlayer = player2Symbol; // Oyuna rəqib başlayır
        }

        // AI oyunudursa, AI simvolunu təyin et
        aiPlayerSymbol = isPlayingAgainstAI ? player2Symbol : '';

        console.log(`[startGameProcedure] Simvollar: P1(${currentPlayerName})=${player1Symbol}, P2(${opponentPlayerName})=${player2Symbol}. Başlayan: ${currentPlayer}`);
        if (isPlayingAgainstAI) console.log(`[startGameProcedure] AI Simvolu: ${aiPlayerSymbol}`);

        isGameOver = false;
        if (restartGameBtn) restartGameBtn.disabled = false; // Yenidən başlat aktiv olur
        updatePlayerInfo(); // Oyunçu info bloklarını yenilə
        updateTurnIndicator(); // Sıranı göstər

        // Hüceyrələrə klik listenerlarını əlavə et
        boardElement.style.opacity = '1'; // Lövhəni görünən et
        console.log("[startGameProcedure] Hüceyrə listenerları əlavə edilir...");
        cells.forEach((cell, index) => {
            // Köhnə listenerları silmək üçün ən etibarlı yol klonlamadır
            const newCell = cell.cloneNode(true);
            cell.parentNode.replaceChild(newCell, cell);
            cells[index] = newCell; // Yeni hüceyrəni massivdə saxla

            if (board[index] === '') { // Yalnız boş hüceyrələrə
                 cells[index].style.cursor = 'pointer';
                 cells[index].addEventListener('click', handleCellClick);
            } else {
                 cells[index].style.cursor = 'not-allowed';
            }
        });
        console.log("[startGameProcedure] Hüceyrə listenerları əlavə edildi.");

        // Oyun başlayanda lövhəni aktiv və ya deaktiv et
        if (!isGameOver) {
             // Əgər sıra bizdədirsə (və ya AI-də deyilsə), lövhə aktivdir
             const isMyTurn = currentPlayer === player1Symbol;
             boardElement.style.pointerEvents = (!isPlayingAgainstAI && !isMyTurn) ? 'none' : 'auto';

             // Əgər AI başlayırsa, ilk hərəkəti etsin
             if (isPlayingAgainstAI && currentPlayer === aiPlayerSymbol) {
                 console.log("[startGameProcedure] AI başlayır, makeAIMove çağırılır.");
                 boardElement.style.pointerEvents = 'none'; // AI hərəkət edərkən lövhəni blokla
                 makeAIMove();
             } else {
                 console.log(`[startGameProcedure] ${isMyTurn ? 'İnsan' : 'Rəqib'} başlayır. Lövhə: ${boardElement.style.pointerEvents}`);
             }
        } else {
             boardElement.style.pointerEvents = 'none'; // Oyun bitibsə deaktiv
        }
         console.log("[startGameProcedure] Bitdi.");
    } // startGameProcedure sonu


    // ---- Oyun Axışı (Socket.IO ilə) ----

    // Hüceyrəyə klikləndikdə
    function handleCellClick(event) {
        console.log("[handleCellClick] Başladı.");
        const clickedCell = event.target;
        const index = parseInt(clickedCell.dataset.index);

        // Klikləmə şərtlərini yoxla
        const myTurn = currentPlayer === player1Symbol;
        if (isGameOver || isDiceRolling || !myTurn || board[index] !== '') {
            console.log(`[handleCellClick] Bloklandı (GameOver=${isGameOver}, DiceRolling=${isDiceRolling}, MyTurn=${myTurn}, Board[${index}]=${board[index]})`);
             return;
        }

        console.log(`[handleCellClick] İnsan ${index} xanasına ${player1Symbol} qoyur.`);

        // Hərəkəti lokal olaraq yerləşdir və nəticəni yoxla
        // placeMark funksiyası sıranı dəyişdirmir
        placeMark(index, player1Symbol);

        // Əgər oyun bitmədisə
        if (!isGameOver) {
            if (isPlayingAgainstAI) {
                // AI Oyununda: Sıranı AI-yə ver və hərəkət etməsini gözlə
                console.log("[handleCellClick] AI Oyunu: Sıra AI-ya keçirilir.");
                switchPlayer(); // Sıranı dəyişdir
                updateTurnIndicator();
                boardElement.style.pointerEvents = 'none'; // AI düşünərkən lövhəni blokla
                makeAIMove();
            } else {
                // Multiplayer Oyununda: Hərəkəti serverə göndər
                console.log(`[handleCellClick] Multiplayer: Hərəkət (${index}, ${player1Symbol}) serverə göndərilir ('make_move')...`);
                if (socket && socket.connected) {
                     socket.emit('make_move', { index: index, mark: player1Symbol });
                     boardElement.style.pointerEvents = 'none'; // Rəqibin hərəkətini gözləyərkən lövhəni blokla
                     // Sıranı dərhal rəqibə keçirə bilərik (UI üçün)
                     switchPlayer();
                     updateTurnIndicator();
                      if (gameStatusDisplay) gameStatusDisplay.textContent = `Sıra: ${opponentPlayerName}`; // Statusu yenilə
                } else {
                     console.error("[handleCellClick] Socket bağlantısı yoxdur, hərəkət göndərilə bilmədi!");
                     // Hərəkəti geri qaytarmaq və ya xəta mesajı göstərmək olar
                     board[index] = ''; // Hərəkəti geri alaq
                     clickedCell.textContent = '';
                     clickedCell.classList.remove(player1Symbol);
                     clickedCell.style.cursor = 'pointer';
                     alert("Serverlə bağlantı yoxdur. Hərəkət edilə bilmədi.");
                }
            }
        } else {
             console.log("[handleCellClick] Oyun insanın hərəkəti ilə bitdi.");
             boardElement.style.pointerEvents = 'none'; // Oyun bitibsə lövhəni blokla
        }
    } // handleCellClick sonu


    // Hərəkəti lövhəyə yerləşdirir və qazanma/bərabərlik yoxlayır
    // Bu funksiya sıranı dəyişdirmir!
    function placeMark(index, mark) {
        console.log(`===== placeMark: Index=${index}, Mark=${mark} =====`);
        if (index < 0 || index >= board.length || board[index] !== '' || isGameOver) {
             console.log(`placeMark: Keçərsiz. Çıxılır.`);
             return false; // Hərəkət yerləşdirilmədi
        }
        board[index] = mark;
        const cellElement = cells[index];
        if (!cellElement) { console.error(`placeMark: Hata! cells[${index}] tapılmadı!`); return false; }

        // Vizual olaraq yerləşdir
        cellElement.textContent = mark;
        cellElement.classList.add(mark === 'X' ? 'X' : 'O'); // Düzgün klası əlavə et
        cellElement.style.cursor = 'not-allowed';
        // Listenerları silmək üçün klonlama (vacibdir!)
        const newCell = cellElement.cloneNode(true);
        cellElement.parentNode.replaceChild(newCell, cellElement);
        cells[index] = newCell; // Yenilənmiş elementi saxla

        console.log(`placeMark: ${index} xanası ${mark} ilə dolduruldu.`);

        // Qazanma və bərabərlik yoxlaması
        const win = checkWin(mark);
        const draw = !win && !board.includes('');

        if (win) {
            console.log(`placeMark: ${mark} qazandı.`);
            endGame(false, mark); // Oyunu bitir (Qalib var)
            highlightWinningCells();
            return true; // Hərəkət yerləşdirildi və oyun bitdi
        } else if (draw) {
            console.log("placeMark: Bərabərlik.");
            endGame(true, null); // Oyunu bitir (Bərabərlik)
            return true; // Hərəkət yerləşdirildi və oyun bitdi
        } else {
            console.log("placeMark: Oyun davam edir.");
            return true; // Hərəkət yerləşdirildi, oyun davam edir
        }
        // console.log("===== placeMark bitdi. =====");
    } // placeMark sonu


    // Sıranı dəyişdirir
    function switchPlayer() {
        if(isGameOver) return;
        currentPlayer = (currentPlayer === player1Symbol) ? player2Symbol : player1Symbol;
        console.log(`switchPlayer: Yeni sıra: ${currentPlayer}`);
        // updateTurnIndicator() bu funksiyadan sonra çağırılmalıdır
    }

    // --- AI Hərəkət Məntiqi (dəyişiklik yoxdur, əvvəlki kod kimi) ---
    function makeAIMove() { /* ... */ }
    function findBestMove() { /* ... */ }
    function getCenterCells(size) { /* ... */ }
    function minimax(currentBoard, depth, isMaximizing, humanSymbol, aiSymbol, maxDepth) { /* ... */ }
    function checkWinnerForMinimax(currentBoard, humanSymbol, aiSymbol) { /* ... */ }


    // --- Qazanma/Bərabərlik Yoxlaması (dəyişiklik yoxdur) ---
    function checkWin(playerSymbolToCheck) { /* ... */ }
    function generateWinConditions(size) { /* ... */ }
    function checkDraw() { /* ... */ }
    function highlightWinningCells() { /* ... */ }

    // --- Hissə 3 Sonu ---
    // public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: v2 - Socket.IO İnteqrasiyası + AI URL Parametri - Hissə 4/4

// ---- DOMContentLoaded içində davam edirik (Hissə 3-dən) ----

    // --- Oyun Sonu ---
    function endGame(isDraw, winnerMark) {
        console.log(`[endGame] Oyun bitdi. Bərabərlik: ${isDraw}, Qazanan İşarə: ${winnerMark}`);
        isGameOver = true;
        boardElement.style.pointerEvents = 'none'; // Lövhəni deaktiv et
        if (restartGameBtn) restartGameBtn.disabled = false; // Yenidən başlat aktiv olur

        const winnerName = winnerMark === player1Symbol ? currentPlayerName : opponentPlayerName;

        if (isDraw) {
            if (gameStatusDisplay) { gameStatusDisplay.textContent = "Oyun Bərabərə!"; gameStatusDisplay.classList.add('draw'); }
            if (turnIndicator) turnIndicator.textContent = "Bərabərə";
        } else {
            if (gameStatusDisplay) { gameStatusDisplay.textContent = `${escapeHtml(winnerName)} Qazandı!`; gameStatusDisplay.classList.add('win'); }
            if (turnIndicator) turnIndicator.textContent = "Bitdi";
             // Qalib üçün effektləri işə sal
             if(winnerMark) triggerShatterEffect(winnerMark); // Yalnız qalib varsa
        }

        // Aktiv oyunçu stilini qaldır
        playerXInfo?.classList.remove('active-player');
        playerOInfo?.classList.remove('active-player');
        updatePlayerInfo(); // Simvolları və adları son vəziyyətdə göstər
    } // endGame sonu


    // --- Effektler (dəyişiklik yoxdur) ---
    function triggerShatterEffect(winnerMark) {
         if (!fireworksOverlay || !shatteringTextContainer || !winnerMark) return;
         clearShatteringText();
         const text = winnerMark === player1Symbol ? "Siz Qazandınız!" : `${escapeHtml(opponentPlayerName)} Qazandı!`;
         const chars = text.split('');
         chars.forEach((char, index) => { /* ... (span yaratma) ... */ });
         fireworksOverlay.classList.add('visible');
         shatteringTextContainer.style.opacity = '1';
         setTimeout(() => { /* ... (animasiyanı başlatma) ... */ }, 100);
     }
    function hideFireworks() { if (fireworksOverlay) fireworksOverlay.classList.remove('visible'); if (shatteringTextContainer) shatteringTextContainer.style.opacity = '0'; setTimeout(clearShatteringText, 500); }
    function clearShatteringText() { if (shatteringTextContainer) shatteringTextContainer.innerHTML = ''; }


    // --- Otaq Əməliyyatları (Serverə göndərmək üçün yenilənməlidir) ---
    // Qeyd: Otaq parametrlərini (ad, şifrə, ölçü) dəyişmək üçün server tərəfində də dəstək olmalıdır (məsələn, 'update_room_settings' socket hadisəsi).
    // Hazırkı kodda bu yoxdur, yalnız client-side görünüşü dəyişir və ölçü dəyişdikdə lokal restart edir.
    function openEditModal() {
         if(isPlayingAgainstAI) { alert("AI oyununda otaq ayarları dəyişdirilə bilməz."); return; }
         if(!isCurrentUserCreator) { alert("Yalnız otağı yaradan parametrləri dəyişə bilər."); return; }
         // ... (modalı doldurma kodu əvvəlki kimi qala bilər) ...
         showModal(editRoomModal);
    }
    function saveRoomChanges() {
         console.log("Otaq dəyişiklikləri yadda saxlanılır (Hələlik yalnız Lokal)...");
         // ... (Validasiya və dəyərləri alma kodu əvvəlki kimi) ...

         // TODO: Serverə 'update_room_settings' hadisəsi göndərmək lazımdır.
         // socket.emit('update_room_settings', { roomId: currentRoomId, name: newName, hasPassword: finalHasPassword, password: newPasswordValue, boardSize: newBoardSize });

         // Hələlik lokal dəyişiklikləri tətbiq edirik (server dəstəyi olmadan)
         let needsRestart = false;
         if (currentRoomData.boardSize !== newBoardSize) {
              needsRestart = true;
              currentRoomData.boardSize = newBoardSize;
              boardSize = newBoardSize;
              adjustStylesForBoardSize(boardSize);
         }
         currentRoomData.name = newName;
         currentRoomData.hasPassword = finalHasPassword;
         if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(newName)}`;

         showMsg(editRoomMessage, 'Dəyişikliklər yadda saxlandı (Lokal).', 'success', 2500);
         hideModal(editRoomModal);

         if (needsRestart) {
              console.log("Ölçü dəyişdiyi üçün oyun yenidən başladılır (Lokal)...");
              // Serverə də bildirmək lazımdır ki, qarşı tərəf də restart etsin
              // socket.emit('force_restart', { reason: 'Board size changed' });
              handleRestartGame(true); // Lokal olaraq dərhal restart et
         }
    }
    function deleteRoom() {
         console.warn("Otaq silinməsi funksiyası çağırıldı (Hələlik yalnız Lokal).");
         if(isPlayingAgainstAI || !isCurrentUserCreator) return; // AI otağı silinməz, yalnız yaradan silə bilər

         if (confirm(`'${escapeHtml(currentRoomData.name)}' otağını silmək istədiyinizə əminsiniz?`)) {
             // TODO: Serverə 'delete_room' hadisəsi göndərmək lazımdır
             // if (socket && socket.connected) socket.emit('delete_room', { roomId: currentRoomId });

              showMsg(editRoomMessage, 'Otaq silinir...', 'info', 0);
              // Hələlik lobiyə yönləndiririk (server silməsini gözləmədən)
              setTimeout(() => {
                  alert("Otaq silindi (Simulyasiya). Lobiyə qayıdırsınız.");
                  window.location.href = '../lobby/test_odalar.html';
              }, 1500);
         }
    }

    // Rəqibi otaqdan çıxarmaq (Server dəstəyi tələb edir)
    function handleKickOpponent() {
        if (isPlayingAgainstAI || !isCurrentUserCreator || !isOpponentPresent) {
             console.log(`Kick şərtləri ödənmir.`); return;
        }
        if (confirm(`${escapeHtml(opponentPlayerName)}-i otaqdan çıxarmaq istədiyinizə əminsiniz?`)) {
             console.log(`${escapeHtml(opponentPlayerName)} otaqdan çıxarılır (Tələb göndərilir)...`);
             // TODO: Serverə 'kick_opponent' hadisəsi göndər
             // if(socket && socket.connected) socket.emit('kick_opponent', { roomId: currentRoomId });
             alert("Kick funksiyası hələ tam aktiv deyil (server dəstəyi lazımdır).");
        }
    }

    // AI Çağırmaq (Oyun içində mənasızdır, lobidə edilməlidir)
    function handleCallSnow() {
         console.log("handleCallSnow: Bu düymə oyun içində işləməməlidir.");
         // Bu düyməni updateHeaderButtonsVisibility içində gizlətmək lazımdır
    }

    // Header düymələrinin görünüşünü tənzimləyir
     function updateHeaderButtonsVisibility() {
         // Edit: AI oyunu deyilsə VƏ mən yaradıcıyamsa
         const showEdit = !isPlayingAgainstAI && isCurrentUserCreator;
         // Kick: AI oyunu deyilsə VƏ mən yaradıcıyamsa VƏ rəqib varsa
         const showKick = !isPlayingAgainstAI && isCurrentUserCreator && isOpponentPresent;
         // Call Snow: Bu düymə oyun içində olmamalıdır
         const showCallSnow = false;

         if (editRoomBtn) editRoomBtn.style.display = showEdit ? 'inline-flex' : 'none';
         if (kickOpponentBtn) kickOpponentBtn.style.display = showKick ? 'inline-flex' : 'none';
         if (callSnowBtn) callSnowBtn.style.display = showCallSnow ? 'inline-flex' : 'none'; // Həmişə gizli
         console.log(`[updateHeaderButtonsVisibility] Düymə görünüşləri: Edit=${showEdit}, Kick=${showKick}, CallSnow=${showCallSnow}`);
     }


    // --- Yeniden Başlatma (Socket.IO ilə) ---
    function handleRestartGame(accepted = false) {
        // Oyun bitməyibsə və ya rəqib yoxdursa (AI oyunu xaric) restart olmaz
        if (!isGameOver || (!isOpponentPresent && !isPlayingAgainstAI)) {
             console.log("Yenidən başlatmaq üçün şərtlər ödənmir.");
             return;
        }

        console.log(`handleRestartGame çağırıldı. Qəbul edilib: ${accepted}`);

        if (isPlayingAgainstAI) {
             // AI oyununda dərhal restart et
             console.log("AI oyunu yenidən başladılır...");
             performLocalRestart();
        } else {
             // Multiplayer oyunu
             if (accepted) {
                  // Əgər qəbul edilibsə (ya biz qəbul etdik, ya da rəqibdən qəbul gəldi)
                  console.log("Multiplayer oyunu yenidən başladılır...");
                  performLocalRestart(); // Lokal restart et
                  // Serverə və ya rəqibə ayrıca bildirməyə ehtiyac yoxdur (əgər 'accept_restart' hər iki tərəfdə restartı trigger edirsə)
             } else {
                  // Əgər yenicə düyməyə basılıbsa (təklif göndərilir)
                  if (socket && socket.connected) {
                       console.log("Yenidən başlatma təklifi serverə göndərilir ('request_restart')...");
                       socket.emit('request_restart');
                       if(gameStatusDisplay) gameStatusDisplay.textContent = "Yenidən başlatma təklifi göndərildi. Rəqib gözlənilir...";
                       // Düyməni müvəqqəti deaktiv etmək olar
                       if(restartGameBtn) restartGameBtn.disabled = true;
                       setTimeout(() => { // Əgər cavab gəlməzsə
                            if(restartGameBtn && restartGameBtn.disabled && isGameOver) { // Hələ də deaktivdirsə və oyun bitibsə
                                 restartGameBtn.disabled = false;
                                 if(gameStatusDisplay && gameStatusDisplay.textContent.includes("gözlənilir")) {
                                      gameStatusDisplay.textContent = "Yenidən başlatma təklifinə cavab gəlmədi.";
                                 }
                            }
                       }, 15000); // 15 saniyə gözlə
                  } else {
                       alert("Serverlə bağlantı yoxdur. Təklif göndərilə bilmədi.");
                  }
             }
        }
    } // handleRestartGame sonu

    // Əsl restart əməliyyatlarını edən funksiya
    function performLocalRestart() {
         console.log("performLocalRestart: Oyun vəziyyəti və lövhə sıfırlanır...");
         hideFireworks();
         resetGameStateVars(); // Oyun dəyişənlərini sıfırla
         resetBoardAndStatus(); // Lövhəni və UI-ni sıfırla

         // Oyunu yenidən zər atma mərhələsinə qaytar
         if (isOpponentPresent) { // Rəqib (və ya AI) varsa
              if (gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yenidən başlayır. Zər atılır...";
              setupDiceModalForRollOff();
              showModal(diceRollModal);
              initDice();
         } else {
              // Bu hal normalda multiplayerdə baş verməməlidir, çünki restart yalnız rəqib varkən təklif edilir/qəbul edilir.
              console.warn("performLocalRestart: Rəqib olmadan restart edilir?");
              if (gameStatusDisplay) gameStatusDisplay.textContent = "Rəqib gözlənilir...";
              hideModal(diceRollModal);
              hideModal(symbolSelectModal);
              updateHeaderButtonsVisibility();
         }
          // Yenidən başlat düyməsi zər atıldıqdan sonra aktiv olacaq (startGameProcedure içində)
          if (restartGameBtn) restartGameBtn.disabled = true;
    }


    // --- Əsas UI Hadisə Dinləyiciləri ---
    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', () => {
            if (confirm("Otaqdan çıxmaq istədiyinizə əminsiniz?")) {
                 // Multiplayer oyununda serverə bildirmək daha yaxşıdır
                 if (!isPlayingAgainstAI && socket && socket.connected) {
                      console.log("Serverə 'leave_room' hadisəsi göndərilir...");
                      socket.emit('leave_room');
                 }
                 // Lobiyə və ya əvvəlki səhifəyə qayıt
                 window.location.href = '../lobby/test_odalar.html'; // Və ya history.back()
            }
        });
    }
     if (restartGameBtn) {
          restartGameBtn.addEventListener('click', () => handleRestartGame(false)); // Restart təklifi göndər/başlat
     }
    if (editRoomBtn) editRoomBtn.addEventListener('click', openEditModal);
    if (closeEditModalButton) closeEditModalButton.addEventListener('click', () => hideModal(editRoomModal));
    window.addEventListener('click', (event) => { if (event.target == editRoomModal) hideModal(editRoomModal); });
    if (saveRoomChangesBtn) saveRoomChangesBtn.addEventListener('click', saveRoomChanges);
    if (deleteRoomConfirmBtn) deleteRoomConfirmBtn.addEventListener('click', deleteRoom);
    if (kickOpponentBtn) kickOpponentBtn.addEventListener('click', handleKickOpponent);
    if (callSnowBtn) callSnowBtn.addEventListener('click', handleCallSnow); // Bu onsuz da gizli olmalıdır

    // Zar ilə bağlı listenerlar (əvvəlki kod kimi)
    if (diceCubeElement) {
         diceCubeElement.addEventListener('mousedown', handleMouseDown);
         diceCubeElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    } else { console.error("Zər kub elementi (diceCubeElement) tapılmadı!"); }

    // Initialize game after authentication is successful (called within auth check)
    // initializeGame(); // Bu artıq yuxarıda auth içində çağırılır

}); // DOMContentLoaded Sonu