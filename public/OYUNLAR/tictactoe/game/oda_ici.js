// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================
// QEYD: Bu versiya serverin oyun vəziyyətini idarə etməsinə əsaslanır.
// Client yalnız hərəkətləri göndərir və serverdən gələn state ilə UI-ni yeniləyir.
// ========================================================================

// ------------------------------------------------------------------------
// --- Part 1.1: DOMContentLoaded, Qlobal Dəyişənlər, DOM Elementləri ---
// ------------------------------------------------------------------------
// Qeyd: Səhifə yükləndikdə işə düşür, əsas dəyişənləri və HTML element
// referanslarını təyin edir. Oyun vəziyyəti dəyişənləri hələ də var,
// amma onlar serverdən gələn məlumatlarla doldurulacaq.

document.addEventListener('DOMContentLoaded', () => { // Async artıq lazım deyil
    console.log("[Client Init 1.1] DOMContentLoaded - Oda İçi JS (Refaktored v1) Başladı.");

    // ---- Qlobal Dəyişənlər ----
    let loggedInUser = null;            // Giriş etmiş istifadəçi məlumatları (check-auth ilə gələcək)
    let currentRoomId = null;           // Hazırkı otağın ID-si (URL-dən)
    let socket = null;                  // Socket.IO bağlantı obyekti
    let currentGameState = {};          // Serverdən gələn ƏN SON oyun vəziyyətini saxlayacaq obyekt
    let isCurrentUserCreator = false;   // Bu client otağı yaradıb mı? (server room_info ilə göndərəcək)

    // Client tərəfli UI vəziyyət dəyişənləri (server state-indən təsirlənməyən)
    let isDiceRolling = false;          // Zər fırlanma animasiyası gedirmi?
    let isProcessingMove = false;       // Hərəkət serverə göndərilib cavab gözlənilirmi? (Təkrarlanan kliklərin qarşısını almaq üçün)

    // Oyunla bağlı dəyişənlər (bunlar əsasən `currentGameState`dən oxunacaq/yenilənəcək)
    let boardSize = 3;                  // Default, initializeGame-də URL-dən alınıb serverə güvəniləcək
    let cells = [];                     // Lövhə hüceyrələrinin DOM elementləri
    let player1Symbol = '?';            // Bu clientin simvolu (gameState-dən)
    let player2Symbol = '?';            // Rəqibin simvolu (gameState-dən)
    let currentPlayerName = 'Siz';      // Adətən loggedInUser.nickname olacaq
    let opponentPlayerName = 'Rəqib';   // gameState-dən

    // SNOW ilə bağlı qlobal dəyişənlər (Hələlik lokal idarə edilir, gələcəkdə serverə keçirilə bilər)
    let isPlayingAgainstAI = false;     // Lokal olaraq AI çağırmışıqmı?
    // let aiPlayerSymbol = '';         // Artıq gameState-dən gələcək

    console.log("[Client Init 1.1] Qlobal dəyişənlər yaradıldı.");


    // ---- DOM Elementləri Referansları ----
    console.log("[Client Init 1.1] DOM elementləri seçilir...");
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
    // const editBoardSizeSelect = document.getElementById('edit-board-size'); // saveRoomChanges içində birbaşa alına bilər
    // const editRoomNameInput = document.getElementById('edit-room-name');
    // const editRoomPasswordCheck = document.getElementById('edit-room-password-check');
    // const editRoomPasswordInput = document.getElementById('edit-room-password');
    const restartGameBtn = document.getElementById('restart-game-btn');
    const kickOpponentBtn = document.getElementById('kick-opponent-btn');
    const callSnowBtn = document.getElementById('call-snow-btn');
    const removeSnowBtn = document.getElementById('remove-snow-btn');
    const diceRollModal = document.getElementById('dice-roll-modal');
    const diceInstructions = document.getElementById('dice-instructions');
    const diceScene = document.getElementById('dice-scene');
    const diceCubeElement = document.getElementById('dice-cube');
    const yourRollResultDisplay = document.getElementById('your-roll-result');
    const opponentRollResultDisplay = document.getElementById('opponent-roll-result');
    const yourRollBox = document.getElementById('your-roll-box');
    const opponentRollBox = document.getElementById('opponent-roll-box');
    const symbolSelectModal = document.getElementById('symbol-select-modal');
    const symbolSelectTitle = document.getElementById('symbol-select-title');
    const symbolSelectMessage = document.getElementById('symbol-select-message');
    const symbolOptionsDiv = symbolSelectModal?.querySelector('.symbol-options');
    const symbolWaitingMessage = document.getElementById('symbol-waiting-message');

    // DOM elementlərinin mövcudluğunu yoxlayaq (kritik olanları)
    if (!boardElement || !turnIndicator || !gameStatusDisplay || !playerXInfo || !playerOInfo ) {
         console.error("[Client Init 1.1] KRİTİK XƏTA: Əsas oyun UI elementlərindən biri tapılmadı! Kod dayandırılır.");
         // Burada istifadəçiyə xəta mesajı göstərmək və ya səhifəni yeniləməyi təklif etmək olar.
         if(gameLoadingOverlay) hideLoadingOverlay(); // Yükləmə ekranını gizlət
         alert("Oyun interfeysini qurarkən kritik xəta baş verdi. Səhifəni yeniləyin.");
         return; // Kodun qalan hissəsinin işləməsinin qarşısını al
    }
    console.log("[Client Init 1.1] DOM element referansları təyin edildi.");

    // ---- Zar üçün Texniki Dəyişənlər ----
    let currentDiceRotateX = 0; let currentDiceRotateY = 0; let currentDiceRotateZ = 0;
    const diceRotations = { 1:{x:0,y:0}, 6:{x:0,y:180}, 4:{x:0,y:90}, 3:{x:0,y:-90}, 2:{x:-90,y:0}, 5:{x:90,y:0} };
    let isDragging = false; let dragStartX, dragStartY, previousMouseX, previousMouseY;
    const dragThreshold = 10; const rotateSensitivity = 0.4; let initialCenterZ = -55;


// --- Hissə 1.1 Sonu (DOMContentLoaded bloku hələ bağlanmayıb!) ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Hissə 1.1-dən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1.1 - Qlobal dəyişənlər, DOM elementləri) ...

    // ------------------------------------------------------------------------
    // --- Part 1.2: Yardımçı Funksiyalar, URL Parametrləri, Yükləmə Ekranı ---
    // ------------------------------------------------------------------------
    // Qeyd: Tez-tez istifadə olunan kiçik funksiyalar və səhifə yüklənərkən
    // ilkin məlumatların alınması.

    // ---- Yardımçı UI Funksiyaları ----
    const showModal = (modal) => {
        if (modal) {
             console.log(`[UI Helper 1.2] Modal göstərilir: #${modal.id}`);
             modal.style.display = 'block';
        } else {
             console.warn("[UI Helper 1.2] showModal: Göstəriləcək modal elementi tapılmadı.");
        }
    };
    const hideModal = (modal) => {
         if (modal) {
             console.log(`[UI Helper 1.2] Modal gizlədilir: #${modal.id}`);
             modal.style.display = 'none';
         } else {
              console.warn("[UI Helper 1.2] hideModal: Gizlədiləcək modal elementi tapılmadı.");
         }
    };
    // Mesaj göstərmə funksiyası (əsasən otaq ayarları modalı üçün idi, amma qalsın)
    const showMsg = (el, msg, type = 'info', duration = 3000) => {
        if(el){
             el.textContent = msg;
             el.className = `message ${type}`; // CSS klaslarını təyin et
             console.log(`[UI Helper 1.2] Mesaj göstərilir (${type}): "${msg}" Element:`, el.id || el);
             // Əvvəlki timeout varsa təmizlə
             if (el.timeoutId) clearTimeout(el.timeoutId);
             // Müəyyən müddət sonra mesajı silmək üçün timeout (duration <= 0 isə silinmir)
             if (duration > 0) {
                 el.timeoutId = setTimeout(() => {
                     // Yalnız eyni mesaj hələ də göstərilirsə sil
                     if (el.textContent === msg) {
                          el.textContent = '';
                          el.className = 'message'; // Klasları təmizlə
                          console.log(`[UI Helper 1.2] Mesaj silindi (timeout). Element:`, el.id || el);
                     }
                 }, duration);
             }
        } else {
             console.error(`[UI Helper 1.2] showMsg: Mesaj göstərmək üçün element tapılmadı! Mesaj: "${msg}"`);
        }
    };
    // HTML-i təhlükəsizləşdirmək üçün
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return String(unsafe); // String deyilsə, çevir
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    };

    // ---- URL Parametrlərini Alma Funksiyası ----
    // Qeyd: Bu funksiya səhifə yüklənəndə ilkin məlumatları (otaq ID, ölçü) almaq üçün istifadə edilir.
    function getUrlParams() {
        console.log("https://api.rubyonrails.org/classes/ActionController/Parameters.html URL parametrləri oxunur...");
        const params = new URLSearchParams(window.location.search);
        // Otaq ID
        const roomIdParam = params.get('roomId');
        // Otaq Adı
        const roomNameParam = decodeURIComponent(params.get('roomName') || 'Bilinməyən Otaq');
        // Lövhə Ölçüsü (default 3, min 3, max 6)
        const sizeParam = parseInt(params.get('size') || '3', 10);
        const validatedSize = Math.max(3, Math.min(6, sizeParam));
        // Lobidən birbaşa AI ilə oynamaq üçün parametr (?ai=SNOW)
        const urlAiParam = params.get('ai');
        const playWithAI = urlAiParam === 'SNOW';

        const result = {
            roomId: roomIdParam,
            roomName: roomNameParam,
            size: validatedSize,
            playWithAI: playWithAI // Lobidən birbaşa AI oyunu istəyi
        };
        console.log("https://api.rubyonrails.org/classes/ActionController/Parameters.html Alınan parametrlər:", result);
        return result;
    }

    // ---- Yükləmə Ekranı Funksiyaları ----
    function showLoadingOverlay(text = 'Yüklənir...') {
        if(gameLoadingOverlay) {
            const loadingText = gameLoadingOverlay.querySelector('.game-loading-text');
            if(loadingText) loadingText.textContent = text;
            gameLoadingOverlay.classList.add('visible');
            console.log(`[Loading Overlay 1.2] Göstərilir: "${text}"`);
        } else {
            console.error("[Loading Overlay 1.2] gameLoadingOverlay elementi tapılmadı!");
        }
    };
    function hideLoadingOverlay() {
        if(gameLoadingOverlay) {
            gameLoadingOverlay.classList.remove('visible');
            console.log("[Loading Overlay 1.2] Gizlədildi.");
        }
        // else { console.warn("[Loading Overlay 1.2] gameLoadingOverlay elementi onsuz da yox idi."); }
    };


// --- Hissə 1.2 Sonu (DOMContentLoaded bloku hələ bağlanmayıb!) ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Hissə 1.1 və 1.2-dən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 2.1: UI Rendering - Lövhə Ayarları və Yenilənməsi ---
    // ------------------------------------------------------------------------
    // Qeyd: Lövhənin ölçüsünə görə stilləri tənzimləyən, lövhəni yaradan
    // və serverdən gələn `board` massivinə əsasən lövhəni yeniləyən funksiyalar.

    /**
     * Lövhə ölçüsünə görə CSS dəyişənlərini tənzimləyir.
     * @param {number} size - Yeni lövhə ölçüsü (məs. 3, 4, 5, 6).
     */
    function adjustStylesForBoardSize(size) {
        console.log(`[UI Render 2.1] adjustStylesForBoardSize çağırıldı. Ölçü: ${size}`);
        let cellSizeVar = '--cell-size-large-dynamic';
        if (size === 4) cellSizeVar = '--cell-size-medium-dynamic';
        else if (size >= 5) cellSizeVar = '--cell-size-small-dynamic';

        document.documentElement.style.setProperty('--current-cell-size', `var(${cellSizeVar})`);
        document.documentElement.style.setProperty('--current-font-size', `calc(var(${cellSizeVar}) * 0.6)`);
        document.documentElement.style.setProperty('--board-size', size);
        console.log(`[UI Render 2.1] Lövhə ölçüsü ${size}x${size} üçün stillər tənzimləndi.`);

         try { // Zar ölçüsünü də hesablayaq
             const diceSizeValue = getComputedStyle(document.documentElement).getPropertyValue('--dice-size').trim();
             if (diceSizeValue) initialCenterZ = parseFloat(diceSizeValue.replace('px','')) / -2; else initialCenterZ = -55;
         } catch(e) { initialCenterZ = -55; }
    };

    /**
     * HTML-də oyun lövhəsini (hüceyrələri) yaradır.
     * Bu funksiya oyun başlayanda və ya ölçü dəyişdikdə çağırılmalıdır.
     */
    function createBoard() {
        if (!boardElement) { console.error("[UI Render 2.1] createBoard: boardElement tapılmadı!"); return; }
        // Board size qlobal dəyişəndən oxunur (initializeGame-də təyin olunur)
        const cellCount = boardSize * boardSize;
        console.log(`[UI Render 2.1] createBoard: ${boardSize}x${boardSize} (${cellCount} hüceyrə) lövhə yaradılır...`);
        boardElement.innerHTML = ''; // Əvvəlki hüceyrələri təmizlə
        cells = []; // Köhnə referansları təmizlə
        for (let i = 0; i < cellCount; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.index = i;
            cell.style.cursor = 'not-allowed'; // Başlanğıcda bloklu
            boardElement.appendChild(cell);
            cells.push(cell); // Yeni hüceyrə referansını saxla
        }
        console.log(`[UI Render 2.1] createBoard: ${cells.length} hüceyrə yaradıldı.`);
        // Yeni lövhə yaradıldıqdan sonra stilləri tətbiq et
        adjustStylesForBoardSize(boardSize);
    };

    /**
     * Serverdən gələn oyun vəziyyətinə əsasən lövhənin UI-sini yeniləyir.
     * @param {Array<string>} boardState - Serverdən gələn lövhə massivi ('X', 'O', '').
     * @param {boolean} isMyTurn - Hazırda bu clientin sırasıdır? (Klikləməni aktiv/deaktiv etmək üçün).
     * @param {boolean} gameIsOver - Oyun bitibmi? (Klikləməni deaktiv etmək üçün).
     * @param {Array<number>} winningCombo - Qazanan kombinasiyanın indeksləri (varsa).
     */
    function updateBoardUI(boardState, isMyTurn, gameIsOver, winningCombo = []) {
        // console.log(`[UI Render 2.1] updateBoardUI çağırıldı. MyTurn=${isMyTurn}, GameOver=${gameIsOver}`);
        if (!boardElement) { console.error("[UI Render 2.1] updateBoardUI: boardElement tapılmadı!"); return; }
        if (boardState.length !== cells.length) {
            console.error(`[UI Render 2.1] updateBoardUI XƏTA: Server lövhə ölçüsü (${boardState.length}) client hüceyrə sayı (${cells.length}) ilə uyğun gəlmir!`);
            // Bəlkə lövhəni yenidən yaratmaq lazımdır?
            // createBoard(); // Bu riskli ola bilər, state uyğunsuzluğu yarada bilər.
            return;
        }

        const canClick = !gameIsOver && isMyTurn; // Nə vaxt klikləmək olar

        cells.forEach((cell, index) => {
            if (!cell) return; // Ehtiyat
            const serverMark = boardState[index]; // Serverdən gələn işarə

            // Məzmunu yenilə
            if (cell.textContent !== serverMark) {
                 cell.textContent = serverMark;
                 // Klassları təmizlə və yenisini əlavə et
                 cell.classList.remove('X', 'O', 'winning');
                 if (serverMark === 'X') {
                     cell.classList.add('X');
                 } else if (serverMark === 'O') {
                     cell.classList.add('O');
                 }
            }

            // Klikləmə statusunu yenilə
            if (serverMark === '' && canClick) {
                cell.style.cursor = 'pointer';
                // Listenerın təkrar əlavə olunmaması üçün onu əvvəlcə silib sonra əlavə edək
                // (Sadə üsul: Amma hər update-də etmək performansa təsir edə bilər)
                // Daha yaxşı üsul: Listenerı yalnız bir dəfə əlavə etmək və handleCellClick içində yoxlamaq.
                // Hazırda handleCellClick onsuz da yoxlama edir, ona görə listenerı qaldırmayaq.
                // Amma əgər handleCellClick çağırılmırsa, listenerın əlavə olunduğundan əmin olmaq lazımdır.
                // İlkin yaratmada listener əlavə etmədiyimiz üçün burada əlavə edək (əgər yoxdursa).
                // TODO: Listener idarəetməsini optimallaşdır. Hələlik hər dəfə əlavə edək? Yox, risklidir.
                // Ən yaxşısı, listenerı createBoard-da əlavə etmək və handleCellClick-də idarə etməkdir.
                // Let's modify createBoard to add listeners, and handleCellClick to check if click is valid.
                 // Assume handleCellClick handles validity checks.
                 if (!cell.hasAttribute('data-listener-attached')) { // Yalnız listener yoxdursa əlavə et
                      cell.addEventListener('click', handleCellClick);
                      cell.setAttribute('data-listener-attached', 'true');
                 }

            } else {
                cell.style.cursor = 'not-allowed';
                // Əgər listener varsa və artıq klikləmək olmazsa, onu silək? (Optional)
                // Bu, klonlama qədər təmiz olmaya bilər.
                 if (cell.hasAttribute('data-listener-attached')) {
                    cell.removeEventListener('click', handleCellClick); // Listenerı silək
                    cell.removeAttribute('data-listener-attached');
                 }
            }

            // Qazanma xəttini işıqlandır (əgər varsa)
            if (gameIsOver && winningCombo.includes(index)) {
                cell.classList.add('winning');
            } else {
                // Əgər əvvəlki state-də winning idisə, təmizlə
                cell.classList.remove('winning');
            }
        });

        // Lövhənin ümumi görünüşü
        boardElement.style.opacity = gameIsOver ? '0.7' : '1'; // Oyun bitibsə solğunlaşdır
        boardElement.style.pointerEvents = gameIsOver ? 'none' : 'auto'; // Oyun bitibsə bütün klikləri blokla
        // Amma yuxarıdakı fərdi hüceyrə pointerEvents daha dəqiq olmalıdır.
        // Ümumi bloklamanı sıra rəqibdə olduqda etmək daha yaxşıdır (bunu game_state_update handler edəcək).

        // console.log("[UI Render 2.1] updateBoardUI: Lövhə UI yeniləndi.");
    };

// --- Hissə 2.1 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1 və 2.1-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 2.2: UI Rendering - Oyunçu Paneli, Sıra, Düymələr ---
    // ------------------------------------------------------------------------
    // Qeyd: Oyunçu məlumatlarını, sıranı və başlıqdakı düymələrin
    // görünüşünü serverdən gələn vəziyyətə uyğun yeniləyən funksiyalar.

    /**
     * Oyunçu məlumatlarını (ad, simvol, aktiv sıra) UI-də yeniləyir.
     * Bu funksiya serverdən gameState gəldikdə çağırılmalıdır.
     */
    function updatePlayerInfo() {
        console.log(`[UI Render 2.2] updatePlayerInfo çağırıldı. P1=${currentPlayerName}(${player1Symbol}), P2=${opponentPlayerName}(${player2Symbol})`);
        if (!playerXInfo || !playerOInfo || !playerXSymbolDisplay || !playerOSymbolDisplay || !playerXNameDisplay || !playerONameDisplay) {
             console.warn("[UI Render 2.2] updatePlayerInfo: Bəzi oyunçu məlumat elementləri tapılmadı.");
             return;
        }

        // Serverdən gələn `currentGameState`-ə əsasən dəyərləri təyin etməliyik.
        // Hələlik qlobal dəyişənləri istifadə edirik, amma bunlar `game_state_update` handler-ində yenilənəcək.
        const p1Sym = currentGameState.player1Symbol || '?'; // Player 1 həmişə bizik deyə fərz edək? Yox, server ID-yə görə təyin edir.
        const p2Sym = currentGameState.player2Symbol || '?';
        const p1Name = currentGameState.player1Username || "Oyunçu 1";
        const p2Name = currentGameState.player2Username || "Rəqib Gözlənilir..."; // Əgər null gələrsə
        const currentTurnSymbol = currentGameState.currentPlayerSymbol;
        const gameIsOver = currentGameState.isGameOver;

        // Client-in özünü müəyyən etməsi (Server ID göndərəcək)
        let mySymbol = '?';
        let opponentSymbol = '?';
        let myName = currentPlayerName; // Default loggedInUser.nickname
        let oppName = 'Rəqib';

        if (socket && currentGameState.player1SocketId === socket.id) {
            mySymbol = currentGameState.player1Symbol || '?';
            opponentSymbol = currentGameState.player2Symbol || '?';
            myName = currentGameState.player1Username || myName;
            oppName = currentGameState.player2Username || opponentPlayerName;
        } else if (socket && currentGameState.player2SocketId === socket.id) {
            mySymbol = currentGameState.player2Symbol || '?';
            opponentSymbol = currentGameState.player1Symbol || '?';
            myName = currentGameState.player2Username || myName;
            oppName = currentGameState.player1Username || opponentPlayerName;
        } else {
            // Əgər socket ID-lər uyğun gəlmirsə (oyun başlamayıb və ya izləyici?)
             // İlkin dəyərləri saxlayaq
             myName = loggedInUser?.nickname || 'Siz';
             oppName = currentGameState.player1Username === myName ? currentGameState.player2Username : currentGameState.player1Username;
             oppName = oppName || 'Rəqib'; // Əgər hələ təyin olunmayıbsa
             // Simvolları da ilkin saxlayaq
             mySymbol = player1Symbol; // Bu qlobal dəyişənlər hələlik qalsın
             opponentSymbol = player2Symbol;
             console.warn(`[UI Render 2.2] updatePlayerInfo: Socket ID (${socket?.id}) gameState oyunçu ID-ləri ilə (${currentGameState.player1SocketId}, ${currentGameState.player2SocketId}) uyğun gəlmir. UI default göstərilir.`);
        }


        // Player 1 (Bu Client) - UI-də həmişə solda göstərildiyini fərz edirik
        playerXSymbolDisplay.textContent = mySymbol;
        playerXNameDisplay.textContent = escapeHtml(myName);
        playerXInfo.className = `player-info ${mySymbol === 'X' ? 'player-x' : (mySymbol === 'O' ? 'player-o' : '')}`;

        // Player 2 (Rəqib / AI) - UI-də həmişə sağda
        playerOSymbolDisplay.textContent = opponentSymbol;
        playerONameDisplay.textContent = escapeHtml(oppName);
        playerOInfo.className = `player-info ${opponentSymbol === 'X' ? 'player-x' : (opponentSymbol === 'O' ? 'player-o' : '')}`;

        // Aktiv sıranı göstər (əgər oyun bitməyibsə)
        if (!gameIsOver) {
            playerXInfo.classList.toggle('active-player', currentTurnSymbol === mySymbol);
            playerOInfo.classList.toggle('active-player', currentTurnSymbol === opponentSymbol);
        } else {
            playerXInfo.classList.remove('active-player');
            playerOInfo.classList.remove('active-player');
        }
         console.log(`[UI Render 2.2] updatePlayerInfo: UI yeniləndi. Mən=${myName}(${mySymbol}), Rəqib=${oppName}(${opponentSymbol}), Sıra=${currentTurnSymbol}`);
    };

    /**
     * Üst tərəfdəki sıra göstəricisini serverdən gələn vəziyyətə əsasən yeniləyir.
     */
    function updateTurnIndicator() {
        if (!turnIndicator) return;
        console.log("[UI Render 2.2] updateTurnIndicator çağırıldı.");

        const state = currentGameState; // Ən son server state-ini istifadə et

        if (!state || Object.keys(state).length === 0) {
            turnIndicator.textContent = 'Vəziyyət Gözlənilir...';
            return;
        }

        if (state.isGameOver) {
            turnIndicator.textContent = state.winnerSymbol === 'draw' ? "Bərabərə!" : (state.statusMessage || 'Oyun Bitdi');
        } else if (!state.currentPlayerSymbol) {
            // Oyun başlayıb amma sıra hələ təyin olunmayıb (zər, simvol mərhələsi)
            turnIndicator.textContent = state.statusMessage || 'Simvol Seçilir...';
        } else {
            // Oyun davam edir, sırası olanı göstər
            let turnPlayerName = 'Rəqib'; // Default
            if (state.currentPlayerSymbol === state.player1Symbol && state.player1Username) {
                 turnPlayerName = state.player1Username;
            } else if (state.currentPlayerSymbol === state.player2Symbol && state.player2Username) {
                 turnPlayerName = state.player2Username;
            } else {
                 // Adlar hələ tam təyin olunmayıbsa, simvolu göstər
                 turnPlayerName = state.currentPlayerSymbol;
            }
            turnIndicator.textContent = `Sıra: ${escapeHtml(turnPlayerName)} (${state.currentPlayerSymbol})`;
        }
         console.log(`[UI Render 2.2] updateTurnIndicator: Göstərici yeniləndi -> "${turnIndicator.textContent}"`);

        // updatePlayerInfo() burada çağırılmır, çünki o, gameState dəyişəndə onsuz da çağırılacaq.
    };

    /**
     * Başlıqdakı düymələrin görünüşünü serverdən gələn və lokal vəziyyətə görə yeniləyir.
     * Bu funksiya isCurrentUserCreator, isOpponentPresent, isPlayingAgainstAI kimi
     * dəyişənlərin düzgün təyin olunmasını tələb edir.
     */
    function updateHeaderButtonsVisibility() {
        // Bu funksiyanın məntiqi əvvəlki cavabda düzəldilmişdi, onu saxlayırıq.
        // Sadəcə qlobal dəyişənləri (isCurrentUserCreator, isOpponentPresent, isPlayingAgainstAI)
        // serverdən gələn məlumatlarla (xüsusilə room_info) düzgün təyin etmək lazımdır.

        console.log(`[UI Render 2.2] updateHeaderButtonsVisibility çağırıldı. isAI=${isPlayingAgainstAI}, isCreator=${isCurrentUserCreator}, isOpponent=${isOpponentPresent}`);

        // Otaq Ayarları (yalnız yaradan, AI olmayan oyunda)
        const showEdit = !isPlayingAgainstAI && isCurrentUserCreator;
        // Rəqibi Çıxart (yalnız yaradan, real rəqib varsa, AI olmayan oyunda)
        const showKick = !isPlayingAgainstAI && isCurrentUserCreator && isOpponentPresent;
        // SNOW'u Çağır (yalnız yaradan, rəqib yoxdursa, AI olmayan oyunda)
        const showCallSnow = isCurrentUserCreator && !isOpponentPresent && !isPlayingAgainstAI;
        // SNOW'u Çıxart (yalnız yaradan, AI ilə oynayarkən)
        const showRemoveSnow = isCurrentUserCreator && isPlayingAgainstAI;

        if (editRoomBtn) editRoomBtn.style.display = showEdit ? 'inline-flex' : 'none'; else console.warn("[UI Render 2.2] editRoomBtn yoxdur");
        if (kickOpponentBtn) kickOpponentBtn.style.display = showKick ? 'inline-flex' : 'none'; else console.warn("[UI Render 2.2] kickOpponentBtn yoxdur");
        if (callSnowBtn) callSnowBtn.style.display = showCallSnow ? 'inline-flex' : 'none'; else console.warn("[UI Render 2.2] callSnowBtn yoxdur");
        if (removeSnowBtn) removeSnowBtn.style.display = showRemoveSnow ? 'inline-flex' : 'none'; else console.warn("[UI Render 2.2] removeSnowBtn yoxdur");

        // Düymələri deaktiv etmək (görünmürsə)
        if (callSnowBtn) callSnowBtn.disabled = !showCallSnow;
        if (removeSnowBtn) removeSnowBtn.disabled = !showRemoveSnow;

        console.log(`[UI Render 2.2] Düymə görünüşləri: Edit=${showEdit}, Kick=${showKick}, CallSnow=${showCallSnow}, RemoveSnow=${showRemoveSnow}`);
    };


// --- Hissə 2.2 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2.1, 2.2-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 2.3: UI Rendering - Oyun Statusu və Modal Pəncərələr ---
    // ------------------------------------------------------------------------
    // Qeyd: Serverdən gələn gameState-ə əsasən əsas status mesajını
    // yeniləyən və zər atma/simvol seçmə modallarını göstərib/gizlədən funksiya.

    /**
     * Serverdən gələn vəziyyətə uyğun olaraq oyun statusu mesajını və
     * modal pəncərələrin (zər, simvol) görünüşünü idarə edir.
     * @param {object} state - Serverdən gələn `gameState` obyekti.
     */
    function updateGameStatusAndModals(state) {
        console.log(`[UI Render 2.3] updateGameStatusAndModals çağırıldı. Status: "${state?.statusMessage}"`);
        if (!state) {
            console.warn("[UI Render 2.3] updateGameStatusAndModals: Boş state obyekti alındı.");
            if (gameStatusDisplay) gameStatusDisplay.textContent = "Serverdən məlumat gözlənilir...";
            hideModal(diceRollModal);
            hideModal(symbolSelectModal);
            return;
        }

        // --- Əsas Status Mesajını Yenilə ---
        if (gameStatusDisplay) {
            // Serverdən gələn status mesajını göstər
            gameStatusDisplay.textContent = state.statusMessage || '';
            // Qazanma/Bərabərlik klaslarını tətbiq et
            gameStatusDisplay.className = 'game-status'; // Əvvəlcə təmizlə
            if (state.winnerSymbol && state.winnerSymbol !== 'draw') {
                gameStatusDisplay.classList.add('win');
            } else if (state.winnerSymbol === 'draw') {
                gameStatusDisplay.classList.add('draw');
            }
        }

        // --- Zər Atma Modalı ---
        // Server statusu "Zər Atılır..." və ya "Bərabərlik!" kimi bir şeydirsə göstər
        const showDiceModalCondition = state.statusMessage?.includes("Zər Atılır") || state.statusMessage?.includes("Bərabərlik!");
        if (showDiceModalCondition && !state.isGameOver && state.player1Symbol === null) { // Oyun başlamayıbsa və simvol seçilməyibsə
             console.log("[UI Render 2.3] Zər atma modalı göstərilir/yenilənir.");
             if (diceInstructions) {
                // Mesajı serverin statusuna uyğunlaşdır
                 if(state.statusMessage?.includes("Bərabərlik!")) {
                    diceInstructions.textContent = 'Bərabərlik! Təkrar atmaq üçün zərə klikləyin.';
                 } else if (state.player1Roll !== null && state.player2Roll === null) {
                     diceInstructions.textContent = 'Rəqibin zər atması gözlənilir...';
                 } else if (state.player1Roll === null && state.player2Roll !== null) {
                     diceInstructions.textContent = 'Zər atmaq növbəsi sizdədir...'; // Və ya sadəcə server statusu
                 } else {
                     diceInstructions.textContent = state.statusMessage || 'Zər atın...';
                 }
                 // Stil klaslarını da təyin et (əgər lazımdırsa)
                 diceInstructions.className = 'instructions'; // Standart
                 if(state.statusMessage?.includes("Bərabərlik!")) diceInstructions.classList.add('waiting'); // Və ya başqa bir klas
             }
             // Nəticələri yenilə
             if (yourRollResultDisplay) yourRollResultDisplay.textContent = state.player1Roll !== null ? state.player1Roll : '?';
             if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = state.player2Roll !== null ? state.player2Roll : '?';
             // Qutu stillərini yenilə (bərabərlik üçün)
             if(yourRollBox) yourRollBox.classList.toggle('tie', state.statusMessage?.includes("Bərabərlik!"));
             if(opponentRollBox) opponentRollBox.classList.toggle('tie', state.statusMessage?.includes("Bərabərlik!"));
             if(yourRollBox) yourRollBox.classList.remove('winner'); // Qalib stilini təmizlə
             if(opponentRollBox) opponentRollBox.classList.remove('winner');
             // Zəri kliklənə bilən et (əgər sıra bizdədirsə və ya bərabərlikdirsə)
             const canRoll = (state.player1SocketId === socket.id && state.player1Roll === null) ||
                           (state.player2SocketId === socket.id && state.player2Roll === null) ||
                           (state.statusMessage?.includes("Bərabərlik!"));
             if(diceCubeElement) diceCubeElement.style.cursor = canRoll ? 'grab' : 'not-allowed';
             initDice(); // Zərin vizual vəziyyətini sıfırla (animasiya olubsa)
             showModal(diceRollModal);
        } else {
            // Zər atma mərhələsi deyilsə, modalı gizlət
             hideModal(diceRollModal);
        }

        // --- Simvol Seçmə Modalı ---
        // Server statusu "Simvol seçimi..." kimi bir şeydirsə və simvol seçici biziksə göstər
        const showSymbolModalCondition = state.statusMessage?.includes("Simvol seçimi") || state.statusMessage?.includes("Simvol seçin");
        if (showSymbolModalCondition && !state.isGameOver && state.player1Symbol === null) { // Oyun başlamayıbsa və simvol seçilməyibsə
             console.log("[UI Render 2.3] Simvol seçmə modalı göstərilir/yenilənir.");
             const amIPicker = socket && state.symbolPickerSocketId === socket.id;
             if (symbolSelectTitle) symbolSelectTitle.textContent = amIPicker ? "Simvol Seçin" : "Simvol Seçilir";
             if (symbolSelectMessage) symbolSelectMessage.textContent = amIPicker
                 ? "Oyuna başlamaq üçün simvolunuzu seçin:"
                 : `${state.diceWinnerSocketId === state.player1SocketId ? state.player1Username : state.player2Username} simvol seçir...`;

             if (symbolOptionsDiv) {
                 symbolOptionsDiv.style.display = amIPicker ? 'flex' : 'none';
                 // Əgər biz seçiriksə, listenerları əlavə et (əvvəl silib sonra əlavə etmək daha etibarlıdır)
                 if (amIPicker) {
                     symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => {
                         const newButton = button.cloneNode(true);
                         button.parentNode.replaceChild(newButton, button);
                         newButton.addEventListener('click', handleSymbolChoice);
                     });
                 }
             }
             if (symbolWaitingMessage) symbolWaitingMessage.style.display = amIPicker ? 'none' : 'block';

             showModal(symbolSelectModal);
        } else {
             // Simvol seçmə mərhələsi deyilsə, modalı gizlət
             hideModal(symbolSelectModal);
        }
    }

// --- Hissə 2.3 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2.1, 2.2, 2.3-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 2.4: UI Rendering - Oyun Sonu Effektləri ---
    // ------------------------------------------------------------------------
    // Qeyd: Qalib gəldikdə fişəng və parçalanma mətn effektlərini göstərən
    // və gizlədən funksiyalar. Server vəziyyəti oyunun bitdiyini
    // bildirdikdə bu funksiyalar çağırılacaq.

    /**
     * Qalib üçün parçalanma mətn effektini işə salır.
     * @param {string} winnerMark - Qalibin simvolu ('X' və ya 'O').
     */
    function triggerShatterEffect(winnerMark) {
        console.log(`[Effects 2.4] triggerShatterEffect çağırıldı. Qalib: ${winnerMark}`);
        if (!fireworksOverlay || !shatteringTextContainer || !winnerMark) {
            console.warn("[Effects 2.4] triggerShatterEffect: Effekt elementləri tapılmadı və ya qalib simvolu yoxdur.");
            return;
        }
        clearShatteringText(); // Əvvəlki effekti təmizlə

        // Qalibə uyğun mətni server state-dən alaq
        const winnerName = (winnerMark === currentGameState.player1Symbol) ? currentGameState.player1Username : currentGameState.player2Username;
        // Clientin özünün qalib olub olmadığını yoxlayaq
        const isClientWinner = (socket && winnerMark === (currentGameState.player1SocketId === socket.id ? currentGameState.player1Symbol : currentGameState.player2Symbol));

        const text = isClientWinner ? "Siz Qazandınız!" : `${escapeHtml(winnerName || winnerMark)} Qazandı!`;
        const chars = text.split('');

        // Hər hərfi ayrı span-a yerləşdir
        chars.forEach((char, index) => {
            const span = document.createElement('span');
            span.textContent = char === ' ' ? '\u00A0' : char; // Boşluqları qoru
            span.classList.add('shatter-char');
            span.style.setProperty('--char-index', index); // CSS üçün indeks
            shatteringTextContainer.appendChild(span);
        });

        fireworksOverlay.classList.add('visible'); // Fişəng overlayını göstər
        shatteringTextContainer.style.opacity = '1'; // Mətni görünən et

        // Qısa gecikmədən sonra animasiyanı başlat
        setTimeout(() => {
            const spans = shatteringTextContainer.querySelectorAll('.shatter-char');
            let duration = 3000, distance = 170; // Default dəyərlər
            try { // CSS dəyişənlərini oxumağa çalış
               duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-duration').replace('s',''))*1000||3000;
               distance = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-distance').replace('px',''))||170;
            } catch(e){ console.warn("[Effects 2.4] Shatter CSS dəyişənləri oxuna bilmədi."); }

            // Hər hərf üçün təsadüfi hərəkət parametrləri təyin et
            spans.forEach((span, i) => {
                const angle = Math.random()*360; const randDist = Math.random()*distance;
                const tx = Math.cos(angle*Math.PI/180)*randDist; const ty = Math.sin(angle*Math.PI/180)*randDist;
                const tz = (Math.random()-0.5)*distance*0.5; const rot = (Math.random()-0.5)*720;
                const delay = Math.random()*0.1;
                span.style.setProperty('--tx',`${tx}px`); span.style.setProperty('--ty',`${ty}px`);
                span.style.setProperty('--tz',`${tz}px`); span.style.setProperty('--rot',`${rot}deg`);
                span.style.animationDelay=`${delay}s`;
                span.classList.add('animate'); // CSS animasiyasını başlat
            });

            // Animasiya bitdikdən sonra effektləri gizlət
            setTimeout(hideFireworks, duration + 500); // Animasiya müddəti + əlavə vaxt
            console.log(`[Effects 2.4] Shatter animasiyası başladı. Müddət: ${duration}ms`);
        }, 100); // Kiçik başlanğıc gecikməsi
    }

   /**
    * Fişəng və parçalanma effektlərini gizlədir.
    */
   function hideFireworks() {
       if (fireworksOverlay) {
            fireworksOverlay.classList.remove('visible');
            console.log("[Effects 2.4] Fireworks overlay gizlədildi.");
       }
       if (shatteringTextContainer) {
            shatteringTextContainer.style.opacity = '0';
            // Məzmunu dərhal yox, opacity keçidi bitdikdən sonra təmizlə
            setTimeout(clearShatteringText, 500);
       }
   }

   /**
    * Parçalanma mətni konteynerini təmizləyir.
    */
   function clearShatteringText() {
       if (shatteringTextContainer) {
            shatteringTextContainer.innerHTML = '';
            // console.log("[Effects 2.4] Shattering text təmizləndi.");
       }
   }

// --- Hissə 2.4 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1 və 2-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 3.1: Client Əməliyyatları - Xanaya Klikləmə ---
    // ------------------------------------------------------------------------
    // Qeyd: İstifadəçi oyun lövhəsindəki bir xanaya kliklədikdə işə düşür.
    // Əsas işi serverə 'make_move' hadisəsini göndərməkdir.

    /**
     * Oyun lövhəsindəki bir hüceyrəyə kliklənəndə çağırılır.
     * Klikləmənin keçərli olub olmadığını yoxlayır və serverə məlumat göndərir.
     * @param {Event} event - Klik hadisəsi obyekti.
     */
    function handleCellClick(event) {
        console.log("[Client Action 3.1] handleCellClick çağırıldı.");
        const clickedCell = event.target;
        const index = parseInt(clickedCell.dataset.index);

        // --- Client Tərəfi İlkin Yoxlamalar ---
        // Server onsuz da yoxlayacaq, amma clientdə də ilkin yoxlama etmək UI təcrübəsini yaxşılaşdırır.

        // Oyun vəziyyəti serverdən gələn `currentGameState`-dən oxunur
        if (!currentGameState || Object.keys(currentGameState).length === 0) {
            console.warn("[Client Action 3.1] handleCellClick: currentGameState hələ mövcud deyil.");
            // Bəlkə istifadəçiyə mesaj göstərək?
            // alert("Oyun vəziyyəti hələ serverdən alınmayıb. Bir az gözləyin.");
            return;
        }

        // Oyun bitibsə və ya zər atılırsa, klikləməyə icazə vermə
        if (currentGameState.isGameOver || isDiceRolling) { // isDiceRolling hələ də client tərəfli UI state-dir
            console.log(`[Client Action 3.1] handleCellClick: Klik bloklandı (Oyun bitib: ${currentGameState.isGameOver}, Zər atılır: ${isDiceRolling})`);
            return;
        }

        // Sıranın bizdə olub olmadığını yoxla
        let myTurn = false;
        if (socket && currentGameState.currentPlayerSymbol) {
             if (currentGameState.player1SocketId === socket.id && currentGameState.currentPlayerSymbol === currentGameState.player1Symbol) {
                 myTurn = true;
             } else if (currentGameState.player2SocketId === socket.id && currentGameState.currentPlayerSymbol === currentGameState.player2Symbol) {
                 myTurn = true;
             }
        }
        if (!myTurn) {
            console.log("[Client Action 3.1] handleCellClick: Klik bloklandı (Sıra sizdə deyil).");
            // İstifadəçiyə bildirmək olar, amma server onsuz da invalid_move göndərəcək.
            return;
        }

        // Hüceyrənin boş olub olmadığını yoxla (serverdən gələn state-ə əsasən)
        if (currentGameState.board[index] !== '') {
            console.log(`[Client Action 3.1] handleCellClick: Klik bloklandı (Xana ${index} boş deyil: "${currentGameState.board[index]}").`);
            return;
        }

        // Təkrarlanan göndərmələrin qarşısını al (optional)
        if (isProcessingMove) {
            console.warn("[Client Action 3.1] handleCellClick: Əvvəlki hərəkət hələ də emal edilir.");
            return;
        }

        // --- Serverə Göndər ---
        if (socket && socket.connected) {
            console.log(`[Client Action 3.1] Serverə 'make_move' göndərilir. Index: ${index}`);
            isProcessingMove = true; // Emal başladığını qeyd et
            socket.emit('make_move', { index: index });

            // Serverdən cavab (game_state_update və ya invalid_move) gözlənilir.
            // Cavab gəldikdə isProcessingMove = false ediləcək (game_state_update handler-ində).
            // Timeout əlavə etmək olar ki, serverdən cavab gəlməzsə, isProcessingMove sıfırlansın.
            setTimeout(() => {
                 if(isProcessingMove) {
                     console.warn("[Client Action 3.1] make_move cavabı üçün timeout. isProcessingMove sıfırlanır.");
                     isProcessingMove = false;
                 }
             }, 5000); // 5 saniyə

            // Optimistik UI yeniləməsi? (Optional - Server cavabını gözləmədən xananı doldurmaq)
            // Bu, interfeysi daha cəld göstərə bilər, amma server hərəkəti rədd etsə, geri almaq lazım gələcək.
            // Hələlik bunu etməyək, server cavabını gözləyək.
            // clickedCell.textContent = mySymbol; // Məsələn
            // clickedCell.classList.add(mySymbol);
            // clickedCell.style.cursor = 'not-allowed';

        } else {
            console.error("[Client Action 3.1] handleCellClick: Socket bağlantısı yoxdur!");
            alert("Serverlə bağlantı yoxdur. Hərəkət göndərilə bilmədi.");
        }
    }

// --- Hissə 3.1 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3.1-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 3.2: Client Əməliyyatları - Zər Atma ---
    // ------------------------------------------------------------------------
    // Qeyd: İstifadəçi zərə kliklədikdə və ya sürükləyib buraxdıqda çağırılır.
    // Zər animasiyasını göstərir və nəticəni serverə göndərir.

    /**
     * Zər atma animasiyasını başladır və nəticəni serverə göndərir.
     */
    function rollDice() {
        console.log("[Client Action 3.2] rollDice çağırıldı.");

        // --- Client Tərəfi Yoxlamalar ---
        if (!currentGameState || Object.keys(currentGameState).length === 0) { console.warn("[Client Action 3.2] rollDice: currentGameState yoxdur."); return; }
        if (isDiceRolling) { console.log("[Client Action 3.2] rollDice: Artıq zər atılır."); return; }
        if (currentGameState.isGameOver || currentGameState.currentPlayerSymbol !== null) { console.warn("[Client Action 3.2] rollDice: Zər atmaq üçün uyğun olmayan oyun vəziyyəti."); return; }

        // Sıranın bizdə olub olmadığını (və ya bərabərlik olub olmadığını) yoxla
        let canIRoll = false;
        const mySockId = socket?.id;
        if (mySockId) {
             if ((currentGameState.player1SocketId === mySockId && currentGameState.player1Roll === null) ||
                 (currentGameState.player2SocketId === mySockId && currentGameState.player2Roll === null) ||
                 (currentGameState.player1Roll !== null && currentGameState.player2Roll !== null && currentGameState.player1Roll === currentGameState.player2Roll)) // Bərabərlik halı
              {
                 canIRoll = true;
              }
        }

        if (!canIRoll) {
            console.log("[Client Action 3.2] rollDice: Zər atmaq növbəsi sizdə deyil və ya hər iki nəticə gözlənilir.");
            return;
        }
        if (!diceCubeElement) { console.error("[Client Action 3.2] rollDice: diceCubeElement tapılmadı!"); return;}

        // --- Animasiya və Serverə Göndərmə ---
        isDiceRolling = true; // Animasiya başladığını qeyd et
        console.log("[Client Action 3.2] rollDice: Zər atılır...");
        diceCubeElement.style.cursor = 'default';
        // UI-də nəticələri sıfırla (əgər bərabərlik idisə)
        if (yourRollResultDisplay) yourRollResultDisplay.textContent = '?';
        // opponentRollResultDisplay burada sıfırlanmır, server state-dən gələcək
        if(yourRollBox) yourRollBox.className = 'result-box';
        if(opponentRollBox) opponentRollBox.className = 'result-box'; // Bərabərlik/Qalib stillərini sil
        if(diceInstructions) diceInstructions.textContent = 'Zər atılır...';

        // Təsadüfi nəticəni yarat
        const myRoll = Math.floor(Math.random() * 6) + 1;
        console.log(`[Client Action 3.2] rollDice: Atılan zər: ${myRoll}`);

        // Serverə nəticəni göndər
        if (socket && socket.connected) {
             console.log(`[Client Action 3.2] Serverə 'dice_roll_result' göndərilir: { roll: ${myRoll} }`);
             socket.emit('dice_roll_result', { roll: myRoll });
             // Cavabı game_state_update ilə gözləyirik
        } else {
            console.error("[Client Action 3.2] rollDice: Socket bağlantısı yoxdur!");
            alert("Serverlə bağlantı yoxdur. Zər nəticəsi göndərilə bilmədi.");
            isDiceRolling = false; // Animasiyanı ləğv et
            if(diceInstructions) diceInstructions.textContent = 'Serverlə bağlantı xətası!';
            return;
        }

        // --- Lokal Animasiyanı Başlat ---
        let rollDurationValue = '2.0s';
        let rollTimingFunctionValue = 'cubic-bezier(0.3, 0.9, 0.4, 1)';
         try {
             rollDurationValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-duration').trim() || '2.0s';
             rollTimingFunctionValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-timing-function').trim() || 'cubic-bezier(0.3, 0.9, 0.4, 1)';
         } catch (e) { console.warn("CSS dəyişənləri alına bilmədi."); }

        const finalFace = diceRotations[myRoll];
        const fullRotationsX = 360 * (2 + Math.floor(Math.random() * 2));
        const fullRotationsY = 360 * (2 + Math.floor(Math.random() * 2));
        const fullRotationsZ = 360 * (1 + Math.floor(Math.random() * 1));
        const targetRotateX = finalFace.x + fullRotationsX;
        const targetRotateY = finalFace.y + fullRotationsY;
        const targetRotateZ = 0 + fullRotationsZ;

        diceCubeElement.style.transition = `transform ${rollDurationValue} ${rollTimingFunctionValue}`;
        setDiceTransform(targetRotateX, targetRotateY, targetRotateZ);

        // Animasiya bitdikdən sonra isDiceRolling = false et (server cavabından asılı olmayaraq)
        setTimeout(() => {
            console.log("[Client Action 3.2] rollDice: Lokal animasiya bitdi.");
            isDiceRolling = false;
            if (diceCubeElement) {
                 diceCubeElement.style.transition = 'none';
                 // Zərin son vəziyyətini saxla (vizual olaraq)
                 currentDiceRotateX = finalFace.x; currentDiceRotateY = finalFace.y; currentDiceRotateZ = 0;
                 setDiceTransform();
                 // Kursu yenidən ayarla (server state-inə görə - bəlkə updateGameStatusAndModals-da?)
                 // diceCubeElement.style.cursor = 'grab'; // Hələlik belə qalsın
            }
            // Nəticəni serverdən gələn update göstərəcək, burada göstərməyək.
            // if(yourRollResultDisplay) yourRollResultDisplay.textContent = myRoll;
            // Serverdən gələn statusu gözləyək...
            // if(diceInstructions && diceInstructions.textContent === 'Zər atılır...') {
            //     diceInstructions.textContent = 'Nəticə serverə göndərildi...';
            // }

        }, parseFloat(rollDurationValue.replace('s', '')) * 1000 + 100);
    }

    // Zər sürükləmə/klikləmə listenerları bu `rollDice` funksiyasını çağıracaq
    // (handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd)
    // Bu listenerların kodu dəyişməz qaldığı üçün buraya təkrar əlavə etmirəm (Hissə 3.3 idi əvvəlki planda)
    // Onların sadəcə `rollDice()` çağırması kifayətdir.

// --- Hissə 3.2 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3.1, 3.2-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 3.3: Client Əməliyyatları - Simvol Seçimi ---
    // ------------------------------------------------------------------------
    // Qeyd: İstifadəçi simvol seçmə modalında 'X' və ya 'O' düyməsinə
    // kliklədikdə çağırılır. Seçimi serverə göndərir.

    /**
     * Simvol seçmə düyməsinə kliklənəndə çağırılır.
     * Seçimi yoxlayır və serverə 'symbol_choice' hadisəsini göndərir.
     * @param {Event} event - Klik hadisəsi obyekti.
     */
    function handleSymbolChoice(event) {
        console.log("[Client Action 3.3] handleSymbolChoice çağırıldı.");
        const clickedButton = event.target;
        const chosenSymbol = clickedButton.dataset.symbol;

        // --- Client Tərəfi Yoxlamalar ---
        if (!chosenSymbol || (chosenSymbol !== 'X' && chosenSymbol !== 'O')) {
            console.warn("[Client Action 3.3] handleSymbolChoice: Keçərsiz simvol klikləndi.", clickedButton);
            return;
        }
        if (!currentGameState || Object.keys(currentGameState).length === 0) {
            console.warn("[Client Action 3.3] handleSymbolChoice: currentGameState hələ mövcud deyil.");
            return;
        }
        // Server onsuz da yoxlayacaq, amma əminlik üçün: Sıra bizdədirmi?
        if (socket && currentGameState.symbolPickerSocketId !== socket.id) {
             console.warn(`[Client Action 3.3] handleSymbolChoice: Simvol seçmə növbəsi bizdə (${socket.id}) deyil. Seçən olmalı idi: ${currentGameState.symbolPickerSocketId}`);
             // UI səhvi ola bilər ki, düymələr aktiv qalıb. Modalı gizlədək.
             hideModal(symbolSelectModal);
             return;
        }
        // Simvollar artıq seçilibmi? (Yenə də server yoxlayacaq)
        if (currentGameState.player1Symbol !== null || currentGameState.player2Symbol !== null) {
             console.warn("[Client Action 3.3] handleSymbolChoice: Simvollar artıq seçilib.");
             hideModal(symbolSelectModal);
             return;
        }

        // --- Serverə Göndər ---
        if (socket && socket.connected) {
            console.log(`[Client Action 3.3] Serverə 'symbol_choice' göndərilir. Simvol: ${chosenSymbol}`);
            socket.emit('symbol_choice', { symbol: chosenSymbol });

            // Cavabı game_state_update ilə gözləyirik.
            // Modal avtomatik olaraq updateGameStatusAndModals tərəfindən gizlədiləcək.
            // hideModal(symbolSelectModal); // Burada gizlətməyək, server cavabını gözləyək.
            // Statusu lokal olaraq dəyişək? Yox, serverdən gəlsin.
            // if(symbolSelectMessage) symbolSelectMessage.textContent = "Seçim göndərildi...";

        } else {
            console.error("[Client Action 3.3] handleSymbolChoice: Socket bağlantısı yoxdur!");
            alert("Serverlə bağlantı yoxdur. Simvol seçimi göndərilə bilmədi.");
        }
    }

// --- Hissə 3.3 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3.1, 3.2, 3.3-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 3.4: Client Əməliyyatları - Yenidən Başlatma Təklifi ---
    // ------------------------------------------------------------------------
    // Qeyd: İstifadəçi "Yenidən Başlat" düyməsinə kliklədikdə çağırılır.
    // Serverə təklif göndərir. Qəbul edilərsə, server yeni state göndərəcək.

    /**
     * Yenidən başlatma düyməsinə kliklənəndə çağırılır.
     * Lazımi yoxlamaları edir və serverə 'request_restart' hadisəsini göndərir.
     * @param {boolean} accepted - Bu parametr artıq istifadə edilmir (əvvəlki logikadan qalıb).
     */
    function handleRestartGame(accepted = false) { // 'accepted' parametrini artıq nəzərə almırıq
        console.log(`[Client Action 3.4] handleRestartGame çağırıldı.`);

        // --- Client Tərəfi Yoxlamalar ---
         if (!currentGameState || Object.keys(currentGameState).length === 0) {
             console.warn("[Client Action 3.4] handleRestartGame: currentGameState mövcud deyil.");
             return;
         }
         // Yalnız oyun bitibsə restart təklif etmək olar
         if (!currentGameState.isGameOver) {
             console.log("[Client Action 3.4] handleRestartGame: Oyun hələ bitməyib.");
             alert("Yenidən başlatmaq üçün oyunun bitməsini gözləyin.");
             return;
         }
         // Rəqib varmı? (AI olmayan oyun üçün)
         const isMultiplayer = !isPlayingAgainstAI; // isPlayingAgainstAI hələlik lokal idarə olunur
         const opponentExists = currentGameState.player1SocketId && currentGameState.player2SocketId;
         if (isMultiplayer && !opponentExists) {
             console.log("[Client Action 3.4] handleRestartGame: Multiplayer oyunudur amma rəqib yoxdur.");
             alert("Yenidən başlatmaq üçün rəqibin qoşulmasını gözləyin.");
             return;
         }

        // --- Serverə Göndər ---
        if (socket && socket.connected) {
             // AI oyununda restart lokal olaraq idarə edilə bilər? Yoxsa serverə göndərilsin?
             // Server-mərkəzli olduğu üçün gəlin serverə göndərək. Server AI olduğunu bilib özü reset edə bilər.
             // if (isPlayingAgainstAI) {
             //     console.log("[Client Action 3.4] AI oyunu üçün lokal restart çağırılır (Serverə də göndərmək olar)...");
             //     // Serverə AI restart hadisəsi göndər? Məs: socket.emit('request_ai_restart');
             //     // Və ya birbaşa lokal reset? Bu server state ilə uyğunsuzluq yaradar.
             //     // Ən yaxşısı serverə normal request göndərməkdir.
             // }

             console.log("[Client Action 3.4] Serverə 'request_restart' göndərilir.");
             socket.emit('request_restart');
             // UI-də düyməni deaktiv etmək və mesaj göstərmək serverdən gələn state ilə olacaq.
             // Məsələn, server statusu "Restart təklif edildi..." edə bilər.
             // if(gameStatusDisplay) gameStatusDisplay.textContent = "Yenidən başlatma təklifi göndərildi...";
             // if(restartGameBtn) restartGameBtn.disabled = true;

        } else {
            console.error("[Client Action 3.4] handleRestartGame: Socket bağlantısı yoxdur!");
            alert("Serverlə bağlantı yoxdur. Təklif göndərilə bilmədi.");
        }
    }

    // performLocalRestart funksiyası artıq lazımsızdır, çünki client state-i özü reset etmir.
    // Serverdən gələn yeni gameState UI-ni yeniləyəcək (sıfırlanmış vəziyyətə).
    /*
    function performLocalRestart() {
         console.log("performLocalRestart: Oyun vəziyyəti və lövhə sıfırlanır...");
         // ... (köhnə kod) ...
    }
    */
    console.log("[Refactor Note 3.4] performLocalRestart funksiyası artıq istifadə edilmir.");


// --- Hissə 3.4 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3.1 - 3.4-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 3.5: Client Əməliyyatları - SNOW Düymələri ---
    // ------------------------------------------------------------------------
    // Qeyd: SNOW'u çağırmaq və oyundan çıxarmaq üçün düymələrin handler-ları.
    // Hazırda bunlar əsasən lokal client vəziyyətini dəyişir. Gələcəkdə
    // serverə hadisə göndərmələri daha doğru olardı.

    /**
     * "SNOW'u Çağır" düyməsinə basıldıqda işə düşür.
     * Lokal vəziyyəti AI oyununa keçirir və zər atma prosesini başladır.
     */
    function handleCallSnow() {
        console.log("[Client Action 3.5] handleCallSnow çağırıldı.");

        // --- Client Tərəfi Yoxlamalar ---
        // isOpponentPresent qlobal dəyişəni real rəqib VƏ YA AI-nin olub olmadığını göstərir
        if (isOpponentPresent || isPlayingAgainstAI) { // isOpponentPresent yoxlaması kifayətdir əslində
            console.warn("[Client Action 3.5] handleCallSnow: Artıq rəqib var və ya AI ilə oynanılır.");
            return;
        }
        if (!isCurrentUserCreator) { // Yalnız yaradan çağıra bilsin
             alert("Yalnız otaq yaradan SNOW-u çağıra bilər.");
             return;
        }
        // Server bağlantısını yoxlamaq? AI oyunu lokal olduğu üçün bəlkə vacib deyil?
        // Amma otaq məlumatları serverdən gəldiyi üçün yoxlayaq.
        if (!socket || !socket.connected) {
             console.error("[Client Action 3.5] handleCallSnow: Socket bağlantısı yoxdur!");
             alert("Serverlə bağlantı yoxdur. SNOW çağırıla bilmir.");
             return;
        }
        // TODO: Serverə 'request_start_ai' hadisəsi göndər və serverin 'gameState' yaratmasını gözlə.
        // Hələlik lokal davam edirik:

        console.log("[Client Action 3.5] handleCallSnow: SNOW oyuna əlavə edilir (lokal)...");

        // Lokal vəziyyəti yenilə
        isPlayingAgainstAI = true;
        isOpponentPresent = true; // Rəqib yeri doldu (AI ilə)
        opponentPlayerName = "SNOW";
        // aiPlayerSymbol daha sonra təyin olunacaq

        // UI elementlərini yenilə
        updatePlayerInfo();             // Rəqib adını yenilə
        updateHeaderButtonsVisibility(); // Düymələri yenilə ("Remove SNOW" görünsün)
        if (callSnowBtn) callSnowBtn.disabled = true; // Özünü deaktiv et

        // Zər atma prosesini başlat (əgər istifadəçi bunu istəyirdisə)
        // Əvvəlki cavabdakı düzəlişə əsasən zər atma başlasın
        console.log("[Client Action 3.5] handleCallSnow: Zər atma prosesi başladılır...");
        if (gameStatusDisplay) gameStatusDisplay.textContent = "SNOW ilə oyun başlayır. Zər atın!";
        if (turnIndicator) turnIndicator.textContent = 'Zər Atılır...';

        // İlkin oyun vəziyyətini quraq (client tərəfində) - Server etməli idi!
        currentGameState = { // Çox sadələşdirilmiş ilkin state
             board: Array(boardSize * boardSize).fill(''),
             player1SocketId: socket?.id, // Özümüz
             player2SocketId: 'AI_SNOW', // Simvolik AI ID
             player1UserId: loggedInUser?.id,
             player2UserId: 'AI_SNOW',
             player1Username: currentPlayerName,
             player2Username: opponentPlayerName,
             player1Symbol: null, player2Symbol: null,
             player1Roll: null, player2Roll: null,
             diceWinnerSocketId: null, symbolPickerSocketId: null,
             isGameOver: false, // Oyun hələ başlamayıb, zər atılır
             winnerSymbol: null, winningCombination: [],
             statusMessage: "Zər Atılır...",
             lastMoveTime: Date.now()
        };
        // Bu lokal state server ilə sinxron deyil! Yalnız UI-ni idarə etmək üçündür.

        setupDiceModalForRollOff(); // Zər modalını hazırla
        showModal(diceRollModal);   // Zər modalını göstər
        initDice();                 // Zəri başlanğıc vəziyyətinə gətir

        if (restartGameBtn) restartGameBtn.disabled = false; // Restart aktiv olsun
        console.log("[Client Action 3.5] handleCallSnow: Proses tamamlandı (zər atma gözlənilir).");
    }

    /**
     * "SNOW'u Çıxart" düyməsinə basıldıqda işə düşür.
     * Lokal vəziyyəti AI oyunundan çıxarır və rəqib gözləmə vəziyyətinə qaytarır.
     */
    function handleRemoveSnow() {
        console.log("[Client Action 3.5] handleRemoveSnow çağırıldı.");
        // --- Client Tərəfi Yoxlamalar ---
        if (!isPlayingAgainstAI) { // Yalnız AI ilə oynayarkən işləsin
             console.warn("[Client Action 3.5] handleRemoveSnow: Hazırda AI ilə oynanılmır.");
             return;
        }
        if (!isCurrentUserCreator) { // Yalnız yaradan çıxara bilsin
             console.warn("[Client Action 3.5] handleRemoveSnow: Yalnız otaq yaradan SNOW-u çıxara bilər.");
             return;
        }
         // TODO: Serverə 'request_stop_ai' hadisəsi göndər və serverin 'gameState'-i sıfırlamasını gözlə.
         // Hələlik lokal davam edirik:

        console.log("[Client Action 3.5] handleRemoveSnow: SNOW oyundan çıxarılır (lokal)...");

        // Lokal vəziyyəti sıfırla
        isPlayingAgainstAI = false;
        isOpponentPresent = false; // Rəqib yeri boşaldı
        opponentPlayerName = "Rəqib Gözlənilir...";
        aiPlayerSymbol = ''; // Lazım deyil artıq
        isGameOver = true;   // Oyunu bitmiş hesab et

        resetGameStateVars();   // Oyun dəyişənlərini sıfırla (simvollar, sıra vs.)
        resetBoardAndStatus();  // Lövhəni və status mesajlarını təmizlə

        // Qlobal gameState-i də sıfırlayaq (və ya serverdən gələni gözləyək?)
        // Ən yaxşısı serverə bildirməkdir. Hələlik lokal sıfırlayaq:
        currentGameState = {}; // Boş obyektə çevirək

        // UI-ni yenilə
        updatePlayerInfo();             // Rəqib adını yenilə
        updateHeaderButtonsVisibility(); // Düymələri yenilə ("Call SNOW" görünməlidir)

        if(gameStatusDisplay) gameStatusDisplay.textContent = "SNOW oyundan çıxarıldı. Rəqib gözlənilir...";
        if(turnIndicator) turnIndicator.textContent = "Gözlənilir";

        // Açıq qala biləcək modalları bağla
        hideModal(diceRollModal);
        hideModal(symbolSelectModal);

         console.log("[Client Action 3.5] handleRemoveSnow: Proses tamamlandı.");
    }

// --- Hissə 3.5 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3.1 - 3.5-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 3.6: Client Əməliyyatları - Otaq Əməliyyatları ---
    // ------------------------------------------------------------------------
    // Qeyd: Otaq ayarlarını açmaq, yadda saxlamaq, silmək və rəqibi
    // kənarlaşdırmaq üçün funksiyalar. Bunların əksəriyyəti serverlə
    // əlaqə tələb edir və hazırda tam işlək deyil.

    /**
     * Otaq ayarları modal pəncərəsini açır.
     */
    function openEditModal() {
        console.log("[Client Action 3.6] openEditModal çağırıldı.");
        // AI ilə oynayarkən və ya yaradan deyilsə icazə vermə
        if (isPlayingAgainstAI) { alert("AI oyununda otaq ayarları dəyişdirilə bilməz."); return; }
        if (!isCurrentUserCreator) { alert("Yalnız otağı yaradan parametrləri dəyişə bilər."); return; }

        console.warn("[Client Action 3.6] Otaq ayarları funksionallığı hələ tam serverə inteqrasiya edilməyib.");

        // Modal elementlərini tap
        if (!editRoomModal) { console.error("editRoomModal tapılmadı!"); return; }
        const nameInput = editRoomModal.querySelector('#edit-room-name');
        const passwordCheck = editRoomModal.querySelector('#edit-room-password-check');
        const passwordInput = editRoomModal.querySelector('#edit-room-password');
        const boardSizeSelect = editRoomModal.querySelector('#edit-board-size');
        const msgElement = editRoomModal.querySelector('#edit-room-message');

        // Mövcud otaq məlumatlarını modalda göstər (currentRoomData-dan)
        // Qeyd: currentRoomData serverdən 'room_info' ilə gəlməlidir.
        if (nameInput) nameInput.value = currentGameState?.name || currentRoomData.name || ''; // gameState-dən də yoxla
        if (passwordCheck) passwordCheck.checked = currentRoomData.hasPassword || false; // Serverdən gələnə əsasən
        if (passwordInput) {
             passwordInput.value = ''; // Şifrəni heç vaxt göstərmə
             passwordInput.style.display = passwordCheck?.checked ? 'block' : 'none'; // Checkbox-a görə göstər/gizlə
        }
        // Checkbox dəyişdikdə şifrə inputunu göstər/gizlə
        if (passwordCheck && passwordInput) {
             passwordCheck.onchange = null; // Köhnə listenerı sil
             passwordCheck.onchange = () => { passwordInput.style.display = passwordCheck.checked ? 'block' : 'none'; };
        }
        if (boardSizeSelect) {
            // Hazırkı ölçünü gameState-dən və ya currentRoomData-dan al
             const currentSize = currentGameState?.boardSize || currentRoomData.boardSize || boardSize;
             boardSizeSelect.value = currentSize.toString();
        }
        if (msgElement) { msgElement.textContent = ''; msgElement.className = 'message'; } // Mesajı təmizlə

        showModal(editRoomModal); // Modalı göstər
    }

    /**
     * Otaq ayarları modalındakı dəyişiklikləri yadda saxlayır (hələlik əsasən lokal).
     */
    function saveRoomChanges() {
        console.warn("[Client Action 3.6] saveRoomChanges: Bu funksiya hələ tam serverə inteqrasiya edilməyib.");
        if (!editRoomModal) return;

        // Elementləri tap
        const nameInput = editRoomModal.querySelector('#edit-room-name');
        const passwordCheck = editRoomModal.querySelector('#edit-room-password-check');
        const passwordInput = editRoomModal.querySelector('#edit-room-password');
        const boardSizeSelect = editRoomModal.querySelector('#edit-board-size');
        const msgElement = editRoomModal.querySelector('#edit-room-message');

        // Dəyərləri al
        const newName = nameInput?.value.trim();
        const newHasPasswordChecked = passwordCheck?.checked;
        const newBoardSize = parseInt(boardSizeSelect?.value || boardSize.toString(), 10);

        // Validasiyalar
        if (!newName) { showMsg(msgElement, 'Otaq adı boş ola bilməz.', 'error'); return; }
        let newPasswordValue = null; let finalHasPassword = false;
        if (newHasPasswordChecked) {
            if (!passwordInput) { showMsg(msgElement, 'Şifrə sahəsi tapılmadı!', 'error'); return; }
            newPasswordValue = passwordInput.value;
            // Şifrə validasiyası (serverdəki ilə eyni olmalıdır)
            if (!newPasswordValue || newPasswordValue.length < 2 || !(/[a-zA-Z]/.test(newPasswordValue) && /\d/.test(newPasswordValue))) {
                showMsg(msgElement, 'Şifrə tələblərə uyğun deyil (min 2 simvol, 1 hərf+1 rəqəm).', 'error', 5000); return;
            }
            finalHasPassword = true;
        } else {
            finalHasPassword = false; newPasswordValue = null;
        }

        // TODO: Serverə 'update_room_settings' hadisəsi göndər:
        /*
        if (socket && socket.connected) {
            console.log("[Client Action 3.6] Serverə 'update_room_settings' göndərilir...");
            socket.emit('update_room_settings', {
                roomId: currentRoomId,
                newName: newName,
                newPassword: newPasswordValue, // Server null qəbul edib şifrəni silə bilər
                newBoardSize: newBoardSize
            });
            showMsg(msgElement, 'Dəyişikliklər serverə göndərildi...', 'info');
            // Cavabı gözləmədən modalı bağlayaq? Yoxsa serverdən təsdiq gözləyək?
            // hideModal(editRoomModal);
        } else {
             showMsg(msgElement, 'Serverlə bağlantı yoxdur!', 'error');
        }
        */
        // Hələlik lokal dəyişiklikləri tətbiq edək (serverdən gələnə qədər)
        showMsg(msgElement, 'Dəyişikliklər lokal olaraq saxlandı (serverə göndərilməli!).', 'success', 2500);

        let needsRestart = false;
        const oldBoardSize = currentGameState?.boardSize || currentRoomData.boardSize || boardSize;
        if (oldBoardSize !== newBoardSize) {
             needsRestart = true;
             // Qlobal boardSize dəyişənini yenilə (bu əsasdır)
             boardSize = newBoardSize;
             currentRoomData.boardSize = newBoardSize; // Bunu da yeniləyək
             if(currentGameState) currentGameState.boardSize = newBoardSize; // Bunu da
             adjustStylesForBoardSize(boardSize); // Stili yenilə
             createBoard(); // Yeni lövhəni yarat!
        }
        currentRoomData.name = newName;
        currentRoomData.hasPassword = finalHasPassword;
        if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(newName)}`; // Başlığı yenilə

        hideModal(editRoomModal); // Hər halda modalı bağla

        if (needsRestart) {
            console.log("[Client Action 3.6] Ölçü dəyişdiyi üçün oyun yenidən başladılır (performLocalRestart)...");
            // Serverə bildirmək lazımdır! Hələlik yalnız lokal restart edir.
            performLocalRestart(); // Bu funksiya oyun vəziyyətini sıfırlayıb zər modalını göstərməlidir
        }
    }

    /**
     * Otağı silmək üçün serverə tələb göndərir.
     */
    function deleteRoom() {
        console.log("[Client Action 3.6] deleteRoom çağırıldı.");
        // Yoxlamalar
        if (isPlayingAgainstAI) { console.warn("AI otağı silinə bilməz."); return; }
        if (!isCurrentUserCreator) { console.warn("Yalnız yaradan otağı silə bilər."); return; }
        if (!currentRoomId) { console.error("Silinəcək otaq ID-si yoxdur!"); return; }

        // İstifadəçidən təsdiq al
        if (confirm(`'${escapeHtml(currentRoomData.name || currentRoomId)}' otağını silmək istədiyinizə əminsiniz? Bu əməliyyat geri qaytarıla bilməz.`)) {
            console.log(`[Client Action 3.6] Otağı (${currentRoomId}) silmək üçün serverə 'delete_room' göndərilir...`);
            const msgElement = editRoomModal?.querySelector('#edit-room-message');
            if(msgElement) showMsg(msgElement, 'Otaq silinir...', 'info', 0); // Silinməyən mesaj

            if (socket && socket.connected) {
                socket.emit('delete_room', { roomId: currentRoomId });
                // Server 'room_deleted_kick' və ya xəta göndərəcək.
                // Client tərəf həmin hadisələri gözləyib lobiyə yönlənməlidir.
                // Burada dərhal yönləndirmə etməyək.
                // setTimeout(() => { window.location.href = '../lobby/test_odalar.html'; }, 1500);
            } else {
                 alert("Serverlə bağlantı yoxdur. Otaq silinə bilmədi.");
                 if(msgElement) showMsg(msgElement, 'Serverlə bağlantı yoxdur!', 'error');
            }
        }
    }

    /**
     * Rəqibi otaqdan kənarlaşdırmaq üçün serverə tələb göndərir.
     */
    function handleKickOpponent() {
        console.log("[Client Action 3.6] handleKickOpponent çağırıldı.");
        // Yoxlamalar
        if (isPlayingAgainstAI) { console.warn("AI otağından rəqib çıxarmaq olmaz."); return; }
        if (!isCurrentUserCreator) { console.warn("Yalnız yaradan rəqibi çıxara bilər."); return; }
        // isOpponentPresent yoxlaması server tərəfindən ediləcək
        if (!currentRoomId) { console.error("Otaq ID-si yoxdur!"); return; }
        // Rəqibin adını alaq (əgər varsa)
        const opponentNameToKick = opponentPlayerName || "Rəqib";

        if (confirm(`${escapeHtml(opponentNameToKick)}-i otaqdan çıxarmaq istədiyinizə əminsiniz?`)) {
             console.log(`[Client Action 3.6] Rəqibi (${opponentNameToKick}) kənarlaşdırmaq üçün serverə 'kick_opponent' göndərilir...`);

             if (socket && socket.connected) {
                 socket.emit('kick_opponent', { roomId: currentRoomId });
                 // Server cavab olaraq 'opponent_left_game' göndərəcək (qalan oyunçuya)
                 // və otaq siyahısını yeniləyəcək. Client tərəfdə əlavə UI yeniləməsinə
                 // ehtiyac yoxdur, serverdən gələn hadisələr UI-ni yeniləməlidir.
                 // Əvvəlki lokal UI yeniləmələrini kommentə alırıq:
                 /*
                 opponentPlayerName = 'Rəqib Gözlənilir...'; isOpponentPresent = false; isPlayingAgainstAI = false; aiPlayerSymbol = '';
                 // ... (UI yeniləmələri) ...
                 */
             } else {
                 alert("Serverlə bağlantı yoxdur. Rəqib çıxarıla bilmədi.");
             }
        }
    }

// --- Hissə 3.6 Sonu ---
// --- Bütöv Hissə 3 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 4.1: Socket.IO Bağlantısı və Hadisə Dinləyici Çərçivəsi ---
    // ------------------------------------------------------------------------
    // Qeyd: Socket.IO serverinə qoşulmaq və serverdən gələn hadisələri
    // dinləmək üçün funksiyalar.

    /**
     * Socket.IO bağlantısını qurur və əsas bağlantı hadisələrini idarə edir.
     * @param {string} roomIdToJoin - Qoşulmaq üçün otağın ID-si.
     */
    function setupGameSocketConnection(roomIdToJoin) {
        console.log(`[Socket IO 4.1] setupGameSocketConnection çağırıldı. RoomID: ${roomIdToJoin}`);
        // Köhnə bağlantı varsa bağla
        if (socket && socket.connected) {
            console.log(`[Socket IO 4.1] Köhnə socket bağlantısı (${socket.id}) bağlanır.`);
            socket.disconnect();
        }

        // AI oyunu üçün socket bağlantısı lazım deyil (əgər AI tamamilə clientdə işləyirsə)
        // Amma bizim SNOW düyməsi məntiqi hələlik lokal olduğu üçün, real multiplayer halını yoxlayaq
        // `initializeGame` funksiyası onsuz da AI oyununda bunu çağırmır.
        if (!roomIdToJoin) {
            console.error("[Socket IO 4.1] Socket bağlantısı üçün Otaq ID təyin edilməyib!");
            return;
        }

        console.log(`[Socket IO 4.1] ${roomIdToJoin} otağı üçün yeni bağlantı qurulur...`);
        showLoadingOverlay('Serverə qoşulunur...');

        // Yeni socket bağlantısını yarat
        // `io()` funksiyası HTML-də əlavə edilmiş /socket.io/socket.io.js faylından gəlir
        // `forceNew: true` əlavə etmək bəzən köhnə bağlantı problemlərini həll edir, amma ehtiyatlı olmaq lazımdır.
        // socket = io({ reconnectionAttempts: 3, forceNew: true });
        socket = io({ reconnectionAttempts: 3 }); // Qoşulma cəhdlərini məhdudlaşdır

        // --- Əsas Bağlantı Hadisələri ---
        socket.on('connect', () => {
            console.log(`[Socket IO 4.1] >>> connect: Oyun serverinə qoşuldu! Socket ID: ${socket.id}, Otaq ID: ${roomIdToJoin}`);
            hideLoadingOverlay(); // Yükləmə ekranını gizlət

            // Serverə bu otaqda hazır olduğumuzu bildirək. Bu, xüsusilə refresh/reconnect üçün vacibdir.
            // Server bu hadisəni alıb bizə hazırkı oyun vəziyyətini göndərəcək ('game_state_update').
            console.log(`[Socket IO 4.1] <<< emit: 'player_ready_in_room' göndərilir. RoomID: ${roomIdToJoin}`);
            socket.emit('player_ready_in_room', { roomId: roomIdToJoin });

            // İlkin status mesajı (əgər hələ rəqib yoxdursa)
            // Bu, serverdən gələn ilk `game_state_update` ilə onsuz da yenilənəcək.
            // if (gameStatusDisplay && !isOpponentPresent) { gameStatusDisplay.textContent = 'Rəqib gözlənilir...'; }
        });

        socket.on('disconnect', (reason) => {
            console.warn(`[Socket IO 4.1] >>> disconnect: Serverlə bağlantı kəsildi! Səbəb: ${reason}, Socket ID: ${socket.id}`);
            // UI-ni yeniləyərək bağlantının kəsildiyini göstər
            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Bağlantı kəsildi!';
            if (turnIndicator) turnIndicator.textContent = "Offline";
            // Oyunu bitmiş hesab et və lövhəni blokla
            // currentGameState.isGameOver = true; // State serverdədir, lokal dəyişməyək
            if(boardElement){ boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';}
            // Oyunçu məlumatlarını yenilə (Offline statusu göstər?)
            // opponentPlayerName = 'Rəqib (Offline)'; // Bunu etməyək, server state-i əsasdır
            // updatePlayerInfo();
            // Yenidən qoşulma cəhdi avtomatik baş verəcək (reconnectionAttempts: 3)
            showLoadingOverlay('Bağlantı bərpa edilir...'); // Bərpa cəhdini göstər
        });

        socket.on('connect_error', (error) => {
            console.error(`[Socket IO 4.1] >>> connect_error: Qoşulma xətası!`, error);
            hideLoadingOverlay(); // Yükləmə ekranını gizlət
            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Serverə qoşulmaq mümkün olmadı!';
            if (turnIndicator) turnIndicator.textContent = "Xəta";
            if(boardElement){ boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';}
            // Bəlkə başqa cəhd etməyəcək, istifadəçiyə bildirmək lazımdır
            // alert(`Serverə qoşulmaq mümkün olmadı: ${error.message}. Səhifəni yeniləyin.`);
        });

        // --- Oyunla Bağlı Xüsusi Hadisə Dinləyicilərini Quraşdır ---
        setupGameEventListeners(socket);

    } // setupGameSocketConnection sonu


    /**
     * Serverdən gələn oyunla bağlı hadisələri dinləmək üçün listenerları quraşdırır.
     * Əsas işi `game_state_update` hadisəsini idarə etməkdir.
     * @param {object} socketInstance - Aktiv socket bağlantısı.
     */
    function setupGameEventListeners(socketInstance) {
        console.log("[Socket IO 4.1] setupGameEventListeners: Oyun hadisə dinləyiciləri quraşdırılır...");

        // Köhnə listenerları təmizləmək (əgər varsa) - təkrar qoşulmalarda vacibdir
        socketInstance.off('game_state_update');
        socketInstance.off('opponent_left_game'); // Bu hələ də lazımdırmı? Yoxsa state update ilə gəlir? Qalsın.
        socketInstance.off('room_deleted_kick');
        socketInstance.off('force_redirect_lobby');
        socketInstance.off('invalid_move');
        socketInstance.off('game_error');
        socketInstance.off('info_message');
        socketInstance.off('room_info'); // Bunu da game_state_update əvəz edə bilər? Hələlik qalsın.
        // Köhnə hadisələri (artıq state update ilə gəlir) qeyd edək:
        // socketInstance.off('opponent_joined'); // Artıq game_state_update ilə gəlir
        // socketInstance.off('opponent_dice_result'); // Artıq game_state_update ilə gəlir
        // socketInstance.off('opponent_symbol_chosen'); // Artıq game_state_update ilə gəlir
        // socketInstance.off('opponent_moved'); // Artıq game_state_update ilə gəlir
        // socketInstance.off('restart_requested'); // Artıq game_state_update statusMessage ilə gəlir
        // socketInstance.off('restart_accepted'); // Artıq game_state_update ilə gəlir

        console.log("[Socket IO 4.1] Köhnə oyun hadisə dinləyiciləri (əgər varsa) silindi.");

        // ======================================================
        // === ƏSAS HADİSƏ: Oyun Vəziyyəti Yeniləməsi        ===
        // ===         (Hissə 4.2-də olacaq)              ===
        // ======================================================


        // ======================================================
        // === DİGƏR HADİSƏLƏR                               ===
        // ===    (Hissə 4.3-də olacaq)                     ===
        // ======================================================


    } // setupGameEventListeners sonu

// --- Hissə 4.1 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3-dən kodlar) ...

//     function setupGameEventListeners(socketInstance) {
//        console.log("[Socket IO 4.1] setupGameEventListeners: Oyun hadisə dinləyiciləri quraşdırılır...");
//        // ... (Köhnə listenerları silmə kodu - Part 4.1-də) ...

        // --------------------------------------------------------------------
        // --- Part 4.2: ƏSAS HADİSƏ HANDLER-İ - 'game_state_update' ---
        // --------------------------------------------------------------------
        // Qeyd: Server oyun vəziyyəti dəyişdikdə bu hadisəni göndərir.
        // Bütün UI yeniləmələri bu funksiya vasitəsilə idarə olunur.

        socketInstance.on('game_state_update', (newState) => {
            console.log("[Socket Event 4.2] >>> game_state_update alındı. Status:", newState?.statusMessage);
            // console.log("[Socket Event 4.2] Alınan State:", JSON.stringify(newState)); // Çox detallı log

            if (!newState || typeof newState !== 'object') {
                console.error("[Socket Event 4.2] Keçərsiz və ya boş gameState alındı!");
                // Bəlkə istifadəçiyə xəta göstərək?
                if(gameStatusDisplay) gameStatusDisplay.textContent = "Serverdən keçərsiz məlumat alındı.";
                return;
            

            // --- Qlobal Vəziyyəti Yenilə ---
            // Əvvəlki state ilə müqayisə etmək üçün köhnəni saxlaya bilərik (optional)
            // const oldState = { ...currentGameState };
            currentGameState = newState; // Ən son vəziyyəti qlobal dəyişəndə saxla
            console.log("[State Update 4.2] currentGameState yeniləndi.");

            // --- Lokal Dəyişənləri Yenilə (UI üçün lazım olanları) ---
            // Lövhə ölçüsü dəyişibsə (bu normalda baş verməməlidir, amma ehtiyat üçün)
            if (boardSize !== newState.boardSize) {
                 console.warn(`[State Update 4.2] Lövhə ölçüsü dəyişdi! Server: ${newState.boardSize}, Client: ${boardSize}. Lövhə yenidən yaradılır.`);
                 boardSize = newState.boardSize;
                 createBoard(); // Lövhəni yenidən yarat (bu, updateBoardUI-ni də çağırmalıdır?)
                 // updateBoardUI aşağıda onsuz da çağırılır, ona görə createBoard kifayətdir.
            }

            // Oyunçu adlarını və simvollarını yenilə (özümüzü və rəqibi təyin edərək)
            if (socket && newState.player1SocketId === socket.id) {
                currentPlayerName = newState.player1Username || loggedInUser?.nickname || 'Siz';
                opponentPlayerName = newState.player2Username || 'Rəqib';
                player1Symbol = newState.player1Symbol || '?'; // Mənim simvolum
                player2Symbol = newState.player2Symbol || '?'; // Rəqibin simvolu
            } else if (socket && newState.player2SocketId === socket.id) {
                currentPlayerName = newState.player2Username || loggedInUser?.nickname || 'Siz';
                opponentPlayerName = newState.player1Username || 'Rəqib';
                player1Symbol = newState.player2Symbol || '?'; // Mənim simvolum
                player2Symbol = newState.player1Symbol || '?'; // Rəqibin simvolu
            } else {
                // İzləyici və ya qoşulma problemi? Default adları saxlayaq.
                currentPlayerName = loggedInUser?.nickname || 'Siz';
                // Rəqibin adını tapmağa çalışaq
                opponentPlayerName = newState.player1Username === currentPlayerName ? newState.player2Username : newState.player1Username;
                opponentPlayerName = opponentPlayerName || 'Rəqib';
                player1Symbol = '?'; // Simvolları bilmirik
                player2Symbol = '?';
                 console.warn(`[State Update 4.2] Socket ID (${socket?.id}) oyunçu ID-ləri ilə uyğun gəlmir. Ad/Simvol təyinatı default ola bilər.`);
            }

            // Oyunun bitib-bitmədiyini yenilə
            const wasGameOver = typeof currentGameState.isGameOver === 'boolean' ? currentGameState.isGameOver : true; // Əvvəlki state üçün default
            isGameOver = newState.isGameOver; // Qlobal dəyişəni yenilə

            // --- UI Yeniləmə Funksiyalarını Çağır ---
            console.log("[State Update 4.2] UI yeniləmə funksiyaları çağırılır...");

            // 1. Oyunçu məlumat panelini yenilə
            updatePlayerInfo(); // Bu funksiya artıq currentGameState-ə baxır (baxmalıdır)

            // 2. Sıra göstəricisini yenilə
            updateTurnIndicator(); // Bu da currentGameState-ə baxır

            // 3. Oyun lövhəsini yenilə
            const isMyTurnNow = socket && newState.currentPlayerSymbol && newState.currentPlayerSymbol === (newState.player1SocketId === socket.id ? newState.player1Symbol : newState.player2Symbol);
            updateBoardUI(newState.board || [], !!isMyTurnNow, newState.isGameOver, newState.winningCombination || []);

            // 4. Əsas status mesajını və modal pəncərələri yenilə
            updateGameStatusAndModals(newState);

            // 5. Başlıq düymələrinin görünüşünü yenilə (Rəqib qoşuldu/çıxdı və ya AI başladı/bitdi isə vacibdir)
            // isOpponentPresent və isCurrentUserCreator də serverdən gələn məlumatla yenilənməlidir.
            // Hələlik bu dəyişənləri lokal idarə etdiyimiz üçün, updateHeaderButtonsVisibility-ni çağıraq.
            // TODO: isOpponentPresent və isCurrentUserCreator-i server state-dən almaq.
            isOpponentPresent = !!(newState.player1SocketId && newState.player2SocketId); // Server state-inə görə təyin et!
            // isCurrentUserCreator hələ ki, server room_info ilə göndərməlidir (əgər göndərirsə).
            updateHeaderButtonsVisibility();

            // 6. Oyun bitibsə effektləri göstər
            if (newState.isGameOver && !wasGameOver && newState.winnerSymbol && newState.winnerSymbol !== 'draw') {
                // Oyun məhz bu update ilə bitibsə və qalib varsa
                console.log("[State Update 4.2] Oyun bitdi, effektlər göstərilir.");
                triggerShatterEffect(newState.winnerSymbol);
                 // Restart düyməsini aktiv et (əgər deaktiv idisə)
                 if (restartGameBtn) restartGameBtn.disabled = false;
            } else if (!newState.isGameOver && restartGameBtn) {
                 // Oyun (yenidən) başlayıbsa restart düyməsini deaktiv et (təklif göndərilənə qədər)
                 // restartGameBtn.disabled = true; // Bunu server state-inə görə etmək daha yaxşıdır
            }

            // --- Əlavə Təmizləmələr ---
            // Əgər hərəkət emalı gedirdisə, onu sıfırla
            if (isProcessingMove) {
                console.log("[State Update 4.2] isProcessingMove sıfırlanır.");
                isProcessingMove = false;
            }

            console.log("[State Update 4.2] game_state_update emalı bitdi.");
        } ;
         // socketInstance.on('game_state_update', ...) sonu


        // ======================================================
        // === DİGƏR HADİSƏLƏR                               ===
        // ===    (Hissə 4.3-də olacaq)                     ===
        // ======================================================


    // } // setupGameEventListeners funksiyasının sonu (hələ bağlanmayıb)

// --- Hissə 4.2 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3-dən kodlar) ...

function setupGameEventListeners(socketInstance) {
    console.log("[Socket IO 4.1] setupGameEventListeners: Oyun hadisə dinləyiciləri quraşdırılır...");
    // ... (Köhnə listenerları silmə kodu - Part 4.1-də) ...
    // ... (game_state_update listener - Part 4.2-də) ...

    // --------------------------------------------------------------------
    // --- Part 4.3: Digər Socket Hadisə Handler-ları ---
    // --------------------------------------------------------------------
    // Qeyd: Oyun vəziyyəti xaricində serverdən gələn digər siqnalları
    // (məlumat, xəta, yönləndirmə və s.) emal edən handler-lar.

    // ----- Rəqib Oyundan Ayrıldı -----
    // Qeyd: Bu hadisə, server `handleDisconnectOrLeave`-də oyunçu tapıb
    // və otaqda başqa oyunçu qaldıqda göndərilir.
    socketInstance.on('opponent_left_game', (data) => {
        const opponentWhoLeft = data?.username || 'Rəqib';
        console.log(`[Socket Event 4.3] >>> opponent_left_game alındı: ${opponentWhoLeft}`);
        // Bu hadisə gəldikdə, server onsuz da yeni gameState göndərməlidir
        // (isGameOver=true, statusMessage="Rəqib ayrıldı").
        // Ona görə burada əsasən UI yeniləməsi etməyə ehtiyac qalmamalıdır.
        // Sadəcə əlavə bildiriş göstərə bilərik.
        if (gameStatusDisplay) {
             // game_state_update onsuz da statusu yeniləyəcək, amma dərhal göstərək
             gameStatusDisplay.textContent = `${escapeHtml(opponentWhoLeft)} oyundan ayrıldı.`;
             gameStatusDisplay.className = 'game-status warning'; // Xəbərdarlıq stili
        }
         // Lokal state-i də yeniləyək (əgər hələ update gəlməyibsə)
         isOpponentPresent = false;
         opponentPlayerName = "Rəqib Gözlənilir...";
         // isGameOver = true; // Bunu server state-i təyin etsin
         // resetBoardAndStatus(); // Bunu server state-i təyin etsin
         updatePlayerInfo(); // Rəqib adını yenilə
         updateHeaderButtonsVisibility(); // "Call SNOW" görünə bilər
         // Modalları bağla
         hideModal(diceRollModal);
         hideModal(symbolSelectModal);
         if (restartGameBtn) restartGameBtn.disabled = true; // Rəqib yoxdursa, restart olmaz
    });

    // ----- Otaq Silindi / Kick Edildiniz -----
    // Server bu hadisəni otaq silindikdə və ya istifadəçi kick edildikdə göndərir.
    socketInstance.on('room_deleted_kick', (data) => {
        const message = data?.message || 'Otaq silindi və ya otaqdan çıxarıldınız.';
        console.warn(`[Socket Event 4.3] >>> room_deleted_kick alındı: ${message}`);
        alert(message + "\nLobiyə yönləndirilirsiniz."); // İstifadəçiyə bildiriş
        window.location.href = '../lobby/test_odalar.html'; // Lobiyə yönləndir
    });

    // ----- Lobiyə Məcburi Yönləndirmə -----
    // Server hər hansı kritik xəta və ya otağın tapılmaması halında göndərə bilər.
    socketInstance.on('force_redirect_lobby', (data) => {
        const message = data?.message || 'Otaqla bağlı problem yarandı.';
        console.warn(`[Socket Event 4.3] >>> force_redirect_lobby alındı: ${message}`);
        alert(message + "\nLobiyə yönləndirilirsiniz.");
        window.location.href = '../lobby/test_odalar.html';
    });

    // ----- Keçərsiz Hərəkət Bildirişi -----
    // Client keçərsiz hərəkət etməyə çalışdıqda server göndərir.
    socketInstance.on('invalid_move', (data) => {
        const message = data?.message || 'Keçərsiz hərəkət!';
        console.warn(`[Socket Event 4.3] >>> invalid_move alındı: ${message}`);
        // İstəsək, bunu gameStatusDisplay-də müvəqqəti göstərə bilərik
        // showMsg(gameStatusDisplay, message, 'error', 2000); // Məsələn, 2 saniyəlik
        // Və ya sadəcə client tərəfi klikləri bloklamağa davam etsin
    });

    // ----- Ümumi Oyun Xətası -----
    // Serverdə oyunla bağlı gözlənilməz xəta baş verdikdə göndərilir.
    socketInstance.on('game_error', (data) => {
        const message = data?.message || 'Oyunda xəta baş verdi.';
        console.error(`[Socket Event 4.3] >>> game_error alındı: ${message}`);
        // Bunu istifadəçiyə göstərmək vacibdir
        if(gameStatusDisplay) gameStatusDisplay.textContent = `XƏTA: ${message}`;
        alert(`Oyunda xəta baş verdi: ${message}`);
        // Bəlkə oyunu bloklayaq?
        // isGameOver = true; // Server state-i əsasdır
        if(boardElement) boardElement.style.pointerEvents = 'none';
    });

    // ----- Məlumat Mesajı -----
    // Serverdən gələn informativ mesajları göstərmək üçün (məsələn, restart təklifi göndərildi)
    socketInstance.on('info_message', (data) => {
         const message = data?.message || 'Serverdən məlumat.';
         console.log(`[Socket Event 4.3] >>> info_message alındı: ${message}`);
         // Bunu gameStatusDisplay-də göstərə bilərik (əgər oyun statusu ilə qarışmazsa)
         if(gameStatusDisplay && !currentGameState.isGameOver) { // Yalnız oyun bitməyibsə göstər
             // showMsg(gameStatusDisplay, message, 'info', 3000);
             // Və ya başqa bir elementdə göstər
         }
    });

    // ----- İlkin Otaq Məlumatı -----
    // 'player_ready_in_room' cavabı olaraq serverdən gəlir (əgər gameState yoxdursa)
    socketInstance.on('room_info', (roomInfo) => {
         console.log("[Socket Event 4.3] >>> room_info alındı:", roomInfo);
         if(!roomInfo) return;

         // Bu məlumatlar əsasən client tərəfli vəziyyəti (düymələr vs.) ilkin təyin etmək üçündür.
         // gameState gələndə onsuz da çoxu yenilənəcək.
         currentRoomData = { ...currentRoomData, ...roomInfo }; // Lokal otaq məlumatını yenilə

         if(roomInfo.creatorUsername && loggedInUser?.nickname) {
             isCurrentUserCreator = (loggedInUser.nickname === roomInfo.creatorUsername);
             console.log(`[State Update 4.3] Yaradıcı statusu təyin edildi: ${isCurrentUserCreator}`);
         }
         if(roomInfo.opponentUsername && !isOpponentPresent && loggedInUser && roomInfo.opponentUsername !== loggedInUser.nickname) {
             isOpponentPresent = true;
             opponentPlayerName = roomInfo.opponentUsername;
             console.log(`[State Update 4.3] room_info-dan rəqib təyin edildi: ${opponentPlayerName}`);
             updatePlayerInfo(); // UI-ni yenilə
             // Zər atma modalını burada göstərmək? player_ready handler bunu edir.
         }
         updateHeaderButtonsVisibility(); // Düymələri yenilə
    });


    console.log("[Socket IO 4.1] Bütün oyun hadisə dinləyiciləri quraşdırıldı.");

}   // setupGameEventListeners funksiyasının sonu


// --- Hissə 4.3 Sonu ---
// --- Bütöv Hissə 4 Sonu ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3, 4-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 5.1: Oyunu Başlatma Funksiyası (Yenidən İşlənmiş) ---
    // ------------------------------------------------------------------------
    // Qeyd: Səhifə yüklənəndə və autentifikasiya uğurlu olduqda çağırılır.
    // İlkin UI quraşdırmasını edir və server bağlantısını başladır.
    // Oyunun faktiki başlaması serverdən gələn 'game_state_update' ilə olacaq.

    /**
     * Oyun interfeysini ilkin olaraq qurur və serverə qoşulur.
     */
    async function initializeGame() { // Yenidən async etdik (check-auth IIFE içində)
        console.log("[Client Init 5.1] initializeGame çağırıldı.");
        showLoadingOverlay('Oyun interfeysi qurulur...');

        try {
            // URL-dən ilkin məlumatları al
            const params = getUrlParams();
            currentRoomId = params.roomId;
            const receivedRoomName = params.roomName;
            const initialBoardSize = params.size; // Lövhə ölçüsü
            const startWithAI = params.playWithAI; // Lobidən AI ilə başlama tələbi

            // İlkin qlobal dəyişənləri təyin et
            boardSize = initialBoardSize; // Qlobal ölçünü təyin et
            currentPlayerName = loggedInUser?.nickname || 'Siz'; // Auth-dan gələn ad

            // Əsas UI elementlərini yoxla (əgər hələ edilməyibsə)
            if (!playerXNameDisplay || !playerONameDisplay || !roomNameDisplay) {
                 throw new Error("initializeGame: Əsas UI elementləri tapılmadı!");
            }

            // İlkin UI məlumatlarını göstər
            playerXNameDisplay.textContent = currentPlayerName;
            roomNameDisplay.textContent = `Otaq: ${escapeHtml(receivedRoomName)}`;
            playerONameDisplay.textContent = "Gözlənilir..."; // Başlanğıcda həmişə gözlənilir

            // Lövhəni yarat və stilləri tənzimlə
            adjustStylesForBoardSize(boardSize);
            createBoard(); // Boş lövhəni yaradır
            resetBoardAndStatus(); // Lövhənin görünüşünü və statusları sıfırla

            // İlkin otaq məlumatlarını saxlayaq (serverdən gələnə qədər)
            currentRoomData = {
                 id: currentRoomId, name: receivedRoomName, boardSize: boardSize,
                 isAiRoom: startWithAI, creatorUsername: '?', hasPassword: false
            };

            // --- Bağlantı və Oyun Başlatma Məntiqi ---
            if (startWithAI) {
                // Lobidən birbaşa AI oyunu seçilibsə
                console.log("[Client Init 5.1] initializeGame: AI Oyunu (lobidən) hazırlanır...");
                isPlayingAgainstAI = true;
                opponentPlayerName = "SNOW";
                isOpponentPresent = true; // AI rəqib sayılır
                isCurrentUserCreator = true; // AI oyununda həmişə yaradan kimisən
                updatePlayerInfo(); // Oyunçu adlarını göstər
                updateHeaderButtonsVisibility(); // Düymələri göstər/gizlə
                hideLoadingOverlay(); // Yükləmə ekranını gizlət

                // TODO: Server-mərkəzli modeldə, əslində serverə AI oyunu başladılması tələbi göndərilməlidir.
                // Server gameState yaradıb göndərməlidir. Hələlik lokal davam edirik:
                console.warn("[Client Init 5.1] initializeGame: AI oyunu hələlik tam lokal başladılır (serverə bağlanmır).");
                // Lokal olaraq zər atmanı başladaq?
                handleCallSnow(); // Bu funksiya indi zər atmanı başlatmalıdır (əgər istəyiriksə)

            } else {
                // Normal Multiplayer Oyunu
                console.log(`[Client Init 5.1] initializeGame: Multiplayer oyunu (${currentRoomId}) üçün serverə qoşulunur...`);
                if (!currentRoomId) {
                    throw new Error("Multiplayer oyunu üçün Otaq ID-si tapılmadı!");
                }
                isPlayingAgainstAI = false;
                opponentPlayerName = "Rəqib Gözlənilir...";
                isOpponentPresent = false; // Serverdən təsdiq gələnə qədər
                isCurrentUserCreator = false; // Serverdən gələnə qədər
                updatePlayerInfo();
                updateHeaderButtonsVisibility(); // İlkin düymə vəziyyəti
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'Rəqib gözlənilir...';

                // Socket bağlantısını qur (bu, içində hideLoadingOverlay çağıracaq)
                setupGameSocketConnection(currentRoomId);
                // Oyunun başlaması üçün serverdən 'game_state_update' gözlənilir.
            }

            console.log(`[Client Init 5.1] initializeGame: İlkin quraşdırma tamamlandı. AI=${isPlayingAgainstAI}`);

        } catch (initError) {
            console.error("[Client Init 5.1] initializeGame XƏTASI:", initError);
            hideLoadingOverlay();
            // İstifadəçiyə kritik xəta barədə məlumat ver
            if(gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yüklənərkən kritik xəta baş verdi!";
            if(turnIndicator) turnIndicator.textContent = "Xəta";
            alert("Oyun interfeysini qurarkən xəta baş verdi. Lobiyə yönləndirilirsiniz.");
            // window.location.href = '../lobby/test_odalar.html'; // Lobiyə yönləndir
        }
    } // initializeGame sonu


// --- Hissə 5.1 Sonu (DOMContentLoaded bloku hələ bağlanmayıb!) ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3, 4, 5.1-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 5.2: İlkin Autentifikasiya Yoxlaması (IIFE) ---
    // ------------------------------------------------------------------------
    // Qeyd: Bu kod bloku səhifə yüklənən kimi avtomatik işə düşür (IIFE).
    // Serverə /check-auth sorğusu göndərərək istifadəçinin giriş edib
    // etmədiyini yoxlayır və nəticəyə görə ya oyunu başladır (initializeGame)
    // ya da login səhifəsinə yönləndirir.

    (async () => {
        console.log("[Client Init 5.2] İlkin autentifikasiya yoxlaması (IIFE) başladı.");
        try {
            console.log("[Client Init 5.2] Serverə /check-auth sorğusu göndərilir...");
            showLoadingOverlay('Sessiya yoxlanılır...');

            // Fetch API ilə /check-auth sorğusu
            // Session cookie-si avtomatik olaraq brauzer tərəfindən göndərilir
            // (əgər domain uyğunluğu varsa və httpOnly deyilsə).
            // `credentials: 'include'` adətən fərqli domainlər üçün lazımdır,
            // eyni domaində buna ehtiyac olmamalıdır.
            const response = await fetch('/check-auth'); // credentials: 'include' olmadan cəhd edək

            // Cavabı JSON olaraq al
            const data = await response.json();

            // Cavabın uğurlu olub olmadığını və istifadəçi məlumatlarının gəlib gəlmədiyini yoxla
            if (!response.ok || !data.loggedIn || !data.user) {
                console.error(`[Client Init 5.2] /check-auth xətası və ya giriş edilməyib: Status=${response.status}, loggedIn=${data.loggedIn}`);
                // Xəta mesajını göstər və loginə yönləndir
                alert("Sessiya tapılmadı və ya etibarsızdır. Zəhmət olmasa, yenidən giriş edin.");
                // Login səhifəsinin düzgün yolu olduğundan əmin olun
                window.location.href = '/ANA SEHIFE/login/login.html';
                return; //initializeGame çağırılmasın
            }

            // Giriş uğurludursa, qlobal dəyişənləri təyin et
            loggedInUser = data.user;
            currentPlayerName = loggedInUser.nickname; // Əsas oyunçu adını təyin et
            console.log(`[Client Init 5.2] Autentifikasiya uğurlu: ${loggedInUser.nickname} (UserID: ${loggedInUser.id})`);

            // Autentifikasiya uğurlu olduqdan sonra oyunu başlat
            // initializeGame() funksiyasını çağır
            await initializeGame(); // Bu funksiya indi async deyil, amma await qala bilər

        } catch (error) {
            // /check-auth sorğusu zamanı şəbəkə xətası və ya digər gözlənilməz xəta baş verərsə
            console.error("[Client Init 5.2] Autentifikasiya yoxlaması zamanı kritik xəta:", error);
            hideLoadingOverlay(); // Yükləmə ekranını gizlət
            alert("Sessiya yoxlanılarkən serverlə əlaqə qurmaq mümkün olmadı. İnternet bağlantınızı yoxlayın və ya daha sonra təkrar cəhd edin.");
            // Bəlkə burada da login səhifəsinə yönləndirmək lazımdır?
            // window.location.href = '/ANA SEHIFE/login/login.html';
        }
    })(); // IIFE (Immediately Invoked Function Expression) sonu

    // ======================================================
    // === ƏSAS UI HADİSƏ DİNLƏYİCİLƏRİ                  ===
    // ===         (Hissə 5.3-də olacaq)              ===
    // ======================================================

// --- Hissə 5.2 Sonu (DOMContentLoaded bloku hələ bağlanmayıb!) ---
// ------------------------------------------------------------------------
// ========================================================================
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Yenidən Qurulmuş v1 (Server-Mərkəzli Vəziyyətə Uyğunlaşdırılır)
// ========================================================================

// ... (Əvvəlki hissələrdən kodlar buradadır) ...

document.addEventListener('DOMContentLoaded', () => {
    // ... (Part 1, 2, 3, 4, 5.1, 5.2-dən kodlar) ...

    // ------------------------------------------------------------------------
    // --- Part 5.3: Əsas UI Hadisə Dinləyiciləri ---
    // ------------------------------------------------------------------------
    // Qeyd: Düymələrə və digər interaktiv elementlərə klikləmə və s.
    // hadisələrini müvafiq handler funksiyalarına bağlayır.

    console.log("[Client Init 5.3] Əsas UI hadisə dinləyiciləri əlavə edilir...");

    // Otaqdan Ayrıl Düyməsi
    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', () => {
            console.log("[UI Event 5.3] 'Otaqdan Ayrıl' klikləndi.");
            if (confirm("Otaqdan çıxmaq istədiyinizə əminsiniz?")) {
                // AI oyunu deyilsə və socket bağlıdırsa, serverə bildir
                if (!isPlayingAgainstAI && socket && socket.connected) {
                     console.log("[UI Event 5.3] Serverə 'leave_room' göndərilir.");
                     socket.emit('leave_room');
                }
                // Hər halda lobiyə yönləndir
                console.log("[UI Event 5.3] Lobiyə yönləndirilir...");
                window.location.href = '../lobby/test_odalar.html';
            }
        });
        console.log("[Client Init 5.3] -> leaveRoomBtn listener əlavə edildi.");
    } else { console.error("[Client Init 5.3] leaveRoomBtn tapılmadı!"); }

    // Yenidən Başlat Düyməsi
    if (restartGameBtn) {
        restartGameBtn.addEventListener('click', () => handleRestartGame(false)); // handleRestartGame artıq yalnız təklif göndərir
        console.log("[Client Init 5.3] -> restartGameBtn listener əlavə edildi.");
    } else { console.error("[Client Init 5.3] restartGameBtn tapılmadı!"); }

    // Otaq Ayarları Düyməsi
    if (editRoomBtn) {
        editRoomBtn.addEventListener('click', openEditModal);
        console.log("[Client Init 5.3] -> editRoomBtn listener əlavə edildi.");
    } else { console.error("[Client Init 5.3] editRoomBtn tapılmadı!"); }

    // Otaq Ayarları Modalı Bağlama (X)
    if (closeEditModalButton) {
        closeEditModalButton.addEventListener('click', () => hideModal(editRoomModal));
        console.log("[Client Init 5.3] -> closeEditModalButton listener əlavə edildi.");
    } else { console.warn("[Client Init 5.3] closeEditModalButton tapılmadı (modal içində)."); }

    // Modalın Kənarına Klikləmə (Ayarlar Modalı üçün)
    window.addEventListener('click', (event) => {
        if (event.target == editRoomModal) {
             hideModal(editRoomModal);
        }
    });
    console.log("[Client Init 5.3] -> window click listener (modal bağlama) əlavə edildi.");

    // Ayarları Yadda Saxla Düyməsi
    if (saveRoomChangesBtn) {
        saveRoomChangesBtn.addEventListener('click', saveRoomChanges);
        console.log("[Client Init 5.3] -> saveRoomChangesBtn listener əlavə edildi.");
    } else { console.error("[Client Init 5.3] saveRoomChangesBtn tapılmadı!"); }

    // Otağı Sil Düyməsi (Modalın içində)
    if (deleteRoomConfirmBtn) {
        deleteRoomConfirmBtn.addEventListener('click', deleteRoom);
        console.log("[Client Init 5.3] -> deleteRoomConfirmBtn listener əlavə edildi.");
    } else { console.error("[Client Init 5.3] deleteRoomConfirmBtn tapılmadı!"); }

    // Rəqibi Çıxart Düyməsi
    if (kickOpponentBtn) {
        kickOpponentBtn.addEventListener('click', handleKickOpponent);
        console.log("[Client Init 5.3] -> kickOpponentBtn listener əlavə edildi.");
    } else { console.error("[Client Init 5.3] kickOpponentBtn tapılmadı!"); }

    // SNOW'u Çağır Düyməsi
    if (callSnowBtn) {
        callSnowBtn.addEventListener('click', handleCallSnow);
        console.log("[Client Init 5.3] -> callSnowBtn listener əlavə edildi.");
    } else { console.error("[Client Init 5.3] callSnowBtn tapılmadı!"); }

    // SNOW'u Çıxart Düyməsi (Yeni)
    if (removeSnowBtn) {
        removeSnowBtn.addEventListener('click', handleRemoveSnow);
        console.log("[Client Init 5.3] -> removeSnowBtn listener əlavə edildi.");
    } else { console.error("[Client Init 5.3] removeSnowBtn tapılmadı! HTML-ə əlavə etdinizmi?"); }

    // Zər Kubu Hadisələri (Mouse və Touch)
    if (diceCubeElement) {
        diceCubeElement.addEventListener('mousedown', handleMouseDown);
        diceCubeElement.addEventListener('touchstart', handleTouchStart, { passive: false }); // passive:false vacibdir (preventDefault üçün)
        console.log("[Client Init 5.3] -> diceCubeElement listenerları əlavə edildi.");
    } else { console.error("[Client Init 5.3] Zər kub elementi (diceCubeElement) tapılmadı!"); }

    console.log("[Client Init 5.3] Bütün əsas UI listenerlarının əlavə edilməsi cəhdi bitdi.");


}); // <<<--- DOMContentLoaded Listener-inin BAĞLANMASI ---<<<

// ------------------------------------------------------------------------
// --- oda_ici.js Faylının Sonu ---
// ------------------------------------------------------------------------