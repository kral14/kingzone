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
    let currentRoomData = {};           // Otaq haqqında ilkin məlumatlar (lobby və ya room_info-dan)

    // Client tərəfli UI vəziyyət dəyişənləri (server state-indən təsirlənməyən)
    let isDiceRolling = false;          // Zər fırlanma animasiyası gedirmi?
    let isProcessingMove = false;       // Hərəkət serverə göndərilib cavab gözlənilirmi? (Təkrarlanan kliklərin qarşısını almaq üçün)
    let isOpponentPresent = false;      // Rəqib qoşulubmu? (Server state-dən alınacaq)

    // Oyunla bağlı dəyişənlər (bunlar əsasən `currentGameState`dən oxunacaq/yenilənəcək)
    let boardSize = 3;                  // Default, initializeGame-də URL-dən alınıb serverə güvəniləcək
    let cells = [];                     // Lövhə hüceyrələrinin DOM elementləri
    let player1Symbol = '?';            // Bu clientin simvolu (gameState-dən)
    let player2Symbol = '?';            // Rəqibin simvolu (gameState-dən)
    let currentPlayerName = 'Siz';      // Adətən loggedInUser.nickname olacaq
    let opponentPlayerName = 'Rəqib';   // gameState-dən
    let isGameOver = false;             // Oyun bitibmi? (Server state-dən alınacaq)

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
    const closeEditModalButton = editRoomModal?.querySelector('.close-button'); // Optional chaining
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
    // Düzəliş: Artıq `}` yoxdur
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


// --- Hissə 1 Sonu ---
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
        console.log("URL parametrləri oxunur..."); // https://api.rubyonrails.org/classes/ActionController/Parameters.html çıxarıldı
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
        console.log("Alınan parametrlər:", result);
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
            // Listenerları burada əlavə edək ki, hər update-də əlavə/silməyək
            cell.addEventListener('click', handleCellClick);
            cell.setAttribute('data-listener-attached', 'true'); // Əlavə olunduğunu qeyd edək
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
        if (!cells || cells.length !== boardState.length) {
            console.error(`[UI Render 2.1] updateBoardUI XƏTA: Server lövhə ölçüsü (${boardState.length}) client hüceyrə sayı (${cells?.length ?? 0}) ilə uyğun gəlmir! Lövhə yenidən yaradılır...`);
            createBoard(); // Lövhəni yenidən yaratmaq daha təhlükəsizdir
            // return; // Yenidən yaradıldıqdan sonra bu update işləməyəcək, növbəti update-i gözləmək lazımdır
        }


        const canClick = !gameIsOver && isMyTurn; // Nə vaxt klikləmək olar

        cells.forEach((cell, index) => {
            if (!cell) return; // Ehtiyat
            const serverMark = boardState[index]; // Serverdən gələn işarə

            // Məzmunu yenilə
            if (cell.textContent !== serverMark) {
                 cell.textContent = serverMark;
                 // Klassları təmizlə və yenisini əlavə et
                 cell.classList.remove('X', 'O'); // winning ayrıca idarə olunur
                 if (serverMark === 'X') {
                     cell.classList.add('X');
                 } else if (serverMark === 'O') {
                     cell.classList.add('O');
                 }
            }

            // Klikləmə statusunu (cursor) yenilə
            // Listener onsuz da createBoard-da əlavə olunub
            if (serverMark === '' && canClick) {
                cell.style.cursor = 'pointer';
            } else {
                cell.style.cursor = 'not-allowed';
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
        // Ümumi pointerEvents-i sıra rəqibdə olduqda bloklamaq daha məntiqlidir
        boardElement.style.pointerEvents = (gameIsOver || !isMyTurn) ? 'none' : 'auto';

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
        // console.log(`[UI Render 2.2] updatePlayerInfo çağırıldı.`);
        if (!playerXInfo || !playerOInfo || !playerXSymbolDisplay || !playerOSymbolDisplay || !playerXNameDisplay || !playerONameDisplay) {
             console.warn("[UI Render 2.2] updatePlayerInfo: Bəzi oyunçu məlumat elementləri tapılmadı.");
             return;
        }

        const state = currentGameState; // Ən son server state-ini istifadə et

        // Oyunçuları və simvolları müəyyən et
        let mySymbol = '?';
        let opponentSymbol = '?';
        let myName = loggedInUser?.nickname || 'Siz'; // Default
        let oppName = 'Rəqib';          // Default

        if (socket && state.player1SocketId === socket.id) {
            mySymbol = state.player1Symbol || '?';
            opponentSymbol = state.player2Symbol || '?';
            myName = state.player1Username || myName;
            oppName = state.player2Username || (state.player2SocketId ? opponentPlayerName : 'Gözlənilir...'); // Rəqib varsa adını göstər, yoxsa gözlə
        } else if (socket && state.player2SocketId === socket.id) {
            mySymbol = state.player2Symbol || '?';
            opponentSymbol = state.player1Symbol || '?';
            myName = state.player2Username || myName;
            oppName = state.player1Username || opponentPlayerName;
        } else {
            // İzləyici və ya qoşulma problemi? Yaxud AI oyunu hələ başlamayıb?
             // İlkin məlumatları göstərək
             mySymbol = state.player1SocketId ? state.player1Symbol : '?'; // Əgər P1 varsa, onun simvolu
             opponentSymbol = state.player2SocketId ? state.player2Symbol : '?';
             myName = state.player1SocketId ? (state.player1Username || 'Oyunçu 1') : myName;
             oppName = state.player2SocketId ? (state.player2Username || 'Oyunçu 2') : oppName;
             // console.warn(`[UI Render 2.2] updatePlayerInfo: Socket ID (${socket?.id}) oyunçu ID-ləri ilə (${state.player1SocketId}, ${state.player2SocketId}) uyğun gəlmir. UI default göstərilir.`);
        }

        // Player X (Biz) - Solda
        playerXSymbolDisplay.textContent = mySymbol;
        playerXNameDisplay.textContent = escapeHtml(myName);
        playerXInfo.className = `player-info player-${mySymbol}`; // player-X və ya player-O klası

        // Player O (Rəqib) - Sağda
        playerOSymbolDisplay.textContent = opponentSymbol;
        playerONameDisplay.textContent = escapeHtml(oppName);
        playerOInfo.className = `player-info player-${opponentSymbol}`; // player-X və ya player-O klası

        // Aktiv sıranı göstər (əgər oyun bitməyibsə)
        if (!state.isGameOver && state.currentPlayerSymbol) {
            playerXInfo.classList.toggle('active-player', state.currentPlayerSymbol === mySymbol);
            playerOInfo.classList.toggle('active-player', state.currentPlayerSymbol === opponentSymbol);
        } else {
            playerXInfo.classList.remove('active-player');
            playerOInfo.classList.remove('active-player');
        }
         // console.log(`[UI Render 2.2] updatePlayerInfo: UI yeniləndi. Mən=${myName}(${mySymbol}), Rəqib=${oppName}(${opponentSymbol}), Sıra=${state.currentPlayerSymbol}`);
    };

    /**
     * Üst tərəfdəki sıra göstəricisini serverdən gələn vəziyyətə əsasən yeniləyir.
     */
    function updateTurnIndicator() {
        if (!turnIndicator) return;
        // console.log("[UI Render 2.2] updateTurnIndicator çağırıldı.");

        const state = currentGameState; // Ən son server state-ini istifadə et

        if (!state || Object.keys(state).length === 0) {
            turnIndicator.textContent = 'Vəziyyət Gözlənilir...';
            return;
        }

        if (state.isGameOver) {
            // Qalib varsa adını, yoxsa "Bərabərə" göstər
            let winnerName = "Oyun Bitdi";
            if(state.winnerSymbol === 'draw') {
                winnerName = "Bərabərə!";
            } else if (state.winnerSymbol === state.player1Symbol) {
                 winnerName = `${escapeHtml(state.player1Username || 'Oyunçu 1')} Qazandı!`;
            } else if (state.winnerSymbol === state.player2Symbol) {
                 winnerName = `${escapeHtml(state.player2Username || 'Oyunçu 2')} Qazandı!`;
            }
            turnIndicator.textContent = winnerName;
        } else if (!state.currentPlayerSymbol) {
            // Oyun başlayıb amma sıra hələ təyin olunmayıb (zər, simvol mərhələsi)
            turnIndicator.textContent = state.statusMessage || 'Simvol Seçilir...';
        } else {
            // Oyun davam edir, sırası olanı göstər
            let turnPlayerName = '';
            if (state.currentPlayerSymbol === state.player1Symbol) {
                 turnPlayerName = state.player1Username || 'Oyunçu 1';
            } else if (state.currentPlayerSymbol === state.player2Symbol) {
                 turnPlayerName = state.player2Username || 'Oyunçu 2';
            }
            // Əgər socket ID bizə aiddirsə "Sıra Sizdə" göstərək
            let displayText = '';
            if (socket && state.currentPlayerSymbol === (state.player1SocketId === socket.id ? state.player1Symbol : state.player2Symbol)) {
                displayText = `Sıra Sizdə (${state.currentPlayerSymbol})`;
            } else {
                displayText = `Sıra: ${escapeHtml(turnPlayerName)} (${state.currentPlayerSymbol})`;
            }
             turnIndicator.textContent = displayText;
        }
         // console.log(`[UI Render 2.2] updateTurnIndicator: Göstərici yeniləndi -> "${turnIndicator.textContent}"`);

    };

    /**
     * Başlıqdakı düymələrin görünüşünü serverdən gələn və lokal vəziyyətə görə yeniləyir.
     */
    function updateHeaderButtonsVisibility() {
        // Bu funksiya qlobal dəyişənlərə əsaslanır: isCurrentUserCreator, isPlayingAgainstAI, isOpponentPresent
        // Bu dəyişənlər initializeGame, socket event handlers (room_info, opponent_left_game),
        // və handleCallSnow/handleRemoveSnow tərəfindən yenilənməlidir.

        // console.log(`[UI Render 2.2] updateHeaderButtonsVisibility çağırıldı. isAI=${isPlayingAgainstAI}, isCreator=${isCurrentUserCreator}, isOpponent=${isOpponentPresent}`);

        // Otaq Ayarları (yalnız yaradan, AI olmayan oyunda)
        const showEdit = isCurrentUserCreator && !isPlayingAgainstAI;
        // Rəqibi Çıxart (yalnız yaradan, real rəqib varsa, AI olmayan oyunda)
        const showKick = isCurrentUserCreator && !isPlayingAgainstAI && isOpponentPresent;
        // SNOW'u Çağır (yalnız yaradan, rəqib yoxdursa, AI olmayan oyunda)
        const showCallSnow = isCurrentUserCreator && !isPlayingAgainstAI && !isOpponentPresent;
        // SNOW'u Çıxart (yalnız yaradan, AI ilə oynayarkən)
        const showRemoveSnow = isCurrentUserCreator && isPlayingAgainstAI;

        // Elementlərin mövcudluğunu yoxlayaq
        if (editRoomBtn) editRoomBtn.style.display = showEdit ? 'inline-flex' : 'none'; else console.warn("[UI Render 2.2] editRoomBtn yoxdur");
        if (kickOpponentBtn) kickOpponentBtn.style.display = showKick ? 'inline-flex' : 'none'; else console.warn("[UI Render 2.2] kickOpponentBtn yoxdur");
        if (callSnowBtn) callSnowBtn.style.display = showCallSnow ? 'inline-flex' : 'none'; else console.warn("[UI Render 2.2] callSnowBtn yoxdur");
        if (removeSnowBtn) removeSnowBtn.style.display = showRemoveSnow ? 'inline-flex' : 'none'; else console.warn("[UI Render 2.2] removeSnowBtn yoxdur");

        // Deaktiv etmə (görünməyən düyməni deaktiv etməyə ehtiyac yoxdur)
        // if (callSnowBtn) callSnowBtn.disabled = !showCallSnow;
        // if (removeSnowBtn) removeSnowBtn.disabled = !showRemoveSnow;

        // console.log(`[UI Render 2.2] Düymə görünüşləri: Edit=${showEdit}, Kick=${showKick}, CallSnow=${showCallSnow}, RemoveSnow=${showRemoveSnow}`);
    };


// --- Hissə 2.2 Sonu ---
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
        // console.log(`[UI Render 2.3] updateGameStatusAndModals çağırıldı. Status: "${state?.statusMessage}"`);
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
            // Turn Indicator onsuz da qalib/bərabərə mesajını göstərir, statusu daha informativ edək
            if (state.isGameOver) {
                gameStatusDisplay.textContent = state.statusMessage || "Oyun Bitdi";
            } else {
                gameStatusDisplay.textContent = state.statusMessage || "Oyun Davam Edir";
            }

            // Qazanma/Bərabərlik klaslarını tətbiq et
            gameStatusDisplay.className = 'game-status'; // Əvvəlcə təmizlə
            if (state.winnerSymbol && state.winnerSymbol !== 'draw') {
                gameStatusDisplay.classList.add('win');
            } else if (state.winnerSymbol === 'draw') {
                gameStatusDisplay.classList.add('draw');
            } else if (!state.player1SocketId || !state.player2SocketId) {
                gameStatusDisplay.classList.add('waiting'); // Rəqib gözləyirsə
            }
        }

        // --- Zər Atma Modalı ---
        // Server statusu "Zər Atılır..." və ya "Bərabərlik!" kimi bir şeydirsə və simvollar təyin olunmayıbsa göstər
        const showDiceModalCondition = (state.statusMessage?.includes("Zər Atılır") || state.statusMessage?.includes("Bərabərlik!"))
                                       && state.player1Symbol === null && state.player2Symbol === null;
        if (showDiceModalCondition && !state.isGameOver) { // Oyun başlamayıbsa
             console.log("[UI Render 2.3] Zər atma modalı göstərilir/yenilənir.");
             if (diceInstructions) {
                // Mesajı serverin statusuna uyğunlaşdır
                 if(state.statusMessage?.includes("Bərabərlik!")) {
                    diceInstructions.textContent = 'Bərabərlik! Təkrar atmaq üçün zərə klikləyin.';
                 } else {
                    // Sıranın kimdə olduğunu yoxla
                    const mySockId = socket?.id;
                    const amIPlayer1 = mySockId === state.player1SocketId;
                    const amIPlayer2 = mySockId === state.player2SocketId;
                    let instructionText = state.statusMessage || 'Zər atın...'; // Default

                    if(amIPlayer1 && state.player1Roll === null && state.player2Roll !== null){
                         instructionText = 'Zər atmaq növbəsi sizdədir...';
                    } else if (amIPlayer1 && state.player1Roll !== null && state.player2Roll === null){
                        instructionText = 'Rəqibin zər atması gözlənilir...';
                    } else if (amIPlayer2 && state.player2Roll === null && state.player1Roll !== null){
                        instructionText = 'Zər atmaq növbəsi sizdədir...';
                    } else if (amIPlayer2 && state.player2Roll !== null && state.player1Roll === null){
                         instructionText = 'Rəqibin zər atması gözlənilir...';
                    } else if (state.player1Roll === null && state.player2Roll === null) {
                         instructionText = 'İlk zəri atmaq üçün klikləyin...';
                    }
                    diceInstructions.textContent = instructionText;
                 }
                 // Stil klaslarını da təyin et (əgər lazımdırsa)
                 diceInstructions.className = 'instructions'; // Standart
                 if(state.statusMessage?.includes("Bərabərlik!")) diceInstructions.classList.add('waiting'); // Və ya başqa bir klas
                 else if(diceInstructions.textContent.includes("gözlənilir")) diceInstructions.classList.add('waiting');
             }
             // Nəticələri yenilə (kimin P1/P2 olduğuna görə)
             const mySockId = socket?.id;
             const myRoll = (mySockId === state.player1SocketId) ? state.player1Roll : state.player2Roll;
             const oppRoll = (mySockId === state.player1SocketId) ? state.player2Roll : state.player1Roll;

             if (yourRollResultDisplay) yourRollResultDisplay.textContent = myRoll !== null ? myRoll : '?';
             if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = oppRoll !== null ? oppRoll : '?';

             // Qutu stillərini yenilə (bərabərlik/qalib üçün)
             const isTie = state.statusMessage?.includes("Bərabərlik!");
             if(yourRollBox) yourRollBox.classList.toggle('tie', isTie);
             if(opponentRollBox) opponentRollBox.classList.toggle('tie', isTie);
             // Qalib stilini (əgər bərabərlik yoxdursa və nəticələr varsa)
             if(!isTie && myRoll !== null && oppRoll !== null) {
                 if(yourRollBox) yourRollBox.classList.toggle('winner', myRoll > oppRoll);
                 if(opponentRollBox) opponentRollBox.classList.toggle('winner', oppRoll > myRoll);
             } else {
                 if(yourRollBox) yourRollBox.classList.remove('winner');
                 if(opponentRollBox) opponentRollBox.classList.remove('winner');
             }

             // Zəri kliklənə bilən et (əgər sıra bizdədirsə və ya bərabərlikdirsə)
             const canRoll = !isDiceRolling && (
                            (mySockId === state.player1SocketId && state.player1Roll === null) ||
                            (mySockId === state.player2SocketId && state.player2Roll === null) ||
                            isTie );
             if(diceCubeElement) diceCubeElement.style.cursor = canRoll ? 'grab' : 'not-allowed';

             // initDice(); // Zərin vizual vəziyyətini sıfırla (animasiya olubsa) - Bunu rollDice içində edək
             showModal(diceRollModal);
        } else {
            // Zər atma mərhələsi deyilsə, modalı gizlət
             hideModal(diceRollModal);
        }

        // --- Simvol Seçmə Modalı ---
        // Server statusu "Simvol seçimi..." kimi bir şeydirsə və simvollar təyin olunmayıbsa göstər
        const showSymbolModalCondition = state.statusMessage?.includes("Simvol seç")
                                         && state.player1Symbol === null && state.player2Symbol === null;
        if (showSymbolModalCondition && !state.isGameOver) {
             console.log("[UI Render 2.3] Simvol seçmə modalı göstərilir/yenilənir.");
             const amIPicker = socket && state.symbolPickerSocketId === socket.id;
             if (symbolSelectTitle) symbolSelectTitle.textContent = amIPicker ? "Simvol Seçin" : "Simvol Seçilir";
             if (symbolSelectMessage) symbolSelectMessage.textContent = amIPicker
                 ? "Oyuna başlamaq üçün simvolunuzu seçin:"
                 : `${state.diceWinnerSocketId === state.player1SocketId ? (state.player1Username || 'Oyunçu 1') : (state.player2Username || 'Oyunçu 2')} simvol seçir...`;

             if (symbolOptionsDiv) {
                 symbolOptionsDiv.style.display = amIPicker ? 'flex' : 'none';
                 // Əgər biz seçiriksə, listenerları əlavə et (əvvəl silib sonra əlavə etmək daha etibarlıdır)
                 if (amIPicker) {
                     symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => {
                         // Effektivlik üçün: listener onsuz da handleSymbolChoice olaraq təyin edilib, təkrar əlavə etməyək
                         // Yalnız düyməni aktiv/deaktiv edək? Ya da olduğu kimi qalsın.
                         // const newButton = button.cloneNode(true); // Klonlama lazım deyil
                         // button.parentNode.replaceChild(newButton, button);
                         // newButton.addEventListener('click', handleSymbolChoice);
                         button.disabled = false; // Aktiv edək
                     });
                 } else {
                      symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => {
                         button.disabled = true; // Deaktiv edək
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
        if (!fireworksOverlay || !shatteringTextContainer || !winnerMark || winnerMark === 'draw') {
            console.warn("[Effects 2.4] triggerShatterEffect: Effekt elementləri tapılmadı, qalib simvolu yoxdur və ya bərabərlikdir.");
            return;
        }
        clearShatteringText(); // Əvvəlki effekti təmizlə

        // Qalibə uyğun mətni server state-dən alaq
        const state = currentGameState;
        const winnerName = (winnerMark === state.player1Symbol) ? state.player1Username : state.player2Username;
        // Clientin özünün qalib olub olmadığını yoxlayaq
        const isClientWinner = (socket && winnerMark === (state.player1SocketId === socket.id ? state.player1Symbol : state.player2Symbol));

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
//     ... (Part 1, 2-dən kodlar) ...

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
        // console.log("[Client Action 3.1] handleCellClick çağırıldı.");
        const clickedCell = event.target;
        const index = parseInt(clickedCell.dataset.index);

        // --- Client Tərəfi İlkin Yoxlamalar ---
        if (!currentGameState || Object.keys(currentGameState).length === 0) {
            console.warn("[Client Action 3.1] handleCellClick: currentGameState hələ mövcud deyil.");
            return;
        }

        // Oyun bitibsə, zər atılırsa, klikləməyə icazə vermə
        if (currentGameState.isGameOver || isDiceRolling) {
            // console.log(`[Client Action 3.1] handleCellClick: Klik bloklandı (Oyun bitib: ${currentGameState.isGameOver}, Zər atılır: ${isDiceRolling})`);
            return;
        }

        // Sıranın bizdə olub olmadığını yoxla
        let myTurn = false;
        const mySockId = socket?.id;
        if (mySockId && currentGameState.currentPlayerSymbol) {
             if (currentGameState.player1SocketId === mySockId && currentGameState.currentPlayerSymbol === currentGameState.player1Symbol) {
                 myTurn = true;
             } else if (currentGameState.player2SocketId === mySockId && currentGameState.currentPlayerSymbol === currentGameState.player2Symbol) {
                 myTurn = true;
             }
        }
        if (!myTurn) {
            // console.log("[Client Action 3.1] handleCellClick: Klik bloklandı (Sıra sizdə deyil).");
            return;
        }

        // Hüceyrənin boş olub olmadığını yoxla
        if (currentGameState.board[index] !== '') {
            // console.log(`[Client Action 3.1] handleCellClick: Klik bloklandı (Xana ${index} boş deyil: "${currentGameState.board[index]}").`);
            return;
        }

        // Təkrarlanan göndərmələrin qarşısını al
        if (isProcessingMove) {
            console.warn("[Client Action 3.1] handleCellClick: Əvvəlki hərəkət hələ də emal edilir.");
            return;
        }

        // --- Serverə Göndər ---
        if (socket && socket.connected) {
            console.log(`[Client Action 3.1] Serverə 'make_move' göndərilir. Index: ${index}`);
            isProcessingMove = true; // Emal başladığını qeyd et
            // Lövhəni dərhal bloklayaq (server cavabına qədər)
            if (boardElement) boardElement.style.pointerEvents = 'none';

            socket.emit('make_move', { index: index });

            // Serverdən cavab (game_state_update) gözlənilir.
            // Cavab gəldikdə isProcessingMove = false ediləcək və pointerEvents yenilənəcək.
            // Timeout əlavə edək ki, serverdən cavab gəlməzsə, bloklama qaldırılsın.
            setTimeout(() => {
                 if(isProcessingMove) {
                     console.warn("[Client Action 3.1] make_move cavabı üçün timeout. isProcessingMove sıfırlanır, lövhə aktivləşdirilir.");
                     isProcessingMove = false;
                      if (boardElement && !currentGameState.isGameOver) boardElement.style.pointerEvents = 'auto'; // Əgər oyun bitməyibsə
                 }
             }, 5000); // 5 saniyə
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

    /** Zərin vizual vəziyyətini (dönməsini) tətbiq edir */
    function setDiceTransform(rotateX = currentDiceRotateX, rotateY = currentDiceRotateY, rotateZ = currentDiceRotateZ) {
        if (diceCubeElement) {
            diceCubeElement.style.transform = `translateZ(${initialCenterZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
        }
    }

    /** Zərin ilkin vizual vəziyyətini və listenerlarını qurur */
    function initDice() {
        if (!diceCubeElement) return;
        console.log("[Dice 3.2] initDice çağırıldı.");
        diceCubeElement.style.transition = 'none'; // Animasiyanı söndür
        // Başlanğıc vəziyyətini təyin et (məsələn, 1 üzü yuxarıda)
        currentDiceRotateX = diceRotations[1].x;
        currentDiceRotateY = diceRotations[1].y;
        currentDiceRotateZ = 0;
        setDiceTransform(); // İlkin vəziyyəti tətbiq et
        isDiceRolling = false; // Animasiya getmir
        // Kursu server state-inə görə updateGameStatusAndModals təyin edəcək
        // diceCubeElement.style.cursor = 'grab';
    }

    /**
     * Zər atma animasiyasını başladır və nəticəni serverə göndərir.
     */
    function rollDice() {
        // console.log("[Client Action 3.2] rollDice çağırıldı.");

        // --- Client Tərəfi Yoxlamalar ---
        if (!currentGameState || Object.keys(currentGameState).length === 0) { console.warn("[Client Action 3.2] rollDice: currentGameState yoxdur."); return; }
        if (isDiceRolling) { /*console.log("[Client Action 3.2] rollDice: Artıq zər atılır.");*/ return; }
        if (currentGameState.isGameOver || currentGameState.currentPlayerSymbol !== null) { console.warn("[Client Action 3.2] rollDice: Zər atmaq üçün uyğun olmayan oyun vəziyyəti."); return; }

        // Sıranın bizdə olub olmadığını (və ya bərabərlik olub olmadığını) yoxla
        let canIRoll = false;
        const mySockId = socket?.id;
        const isTie = currentGameState.statusMessage?.includes("Bərabərlik!");
        if (mySockId) {
             if (isTie || // Bərabərlikdirsə həmişə ata bilərik
                 (currentGameState.player1SocketId === mySockId && currentGameState.player1Roll === null) ||
                 (currentGameState.player2SocketId === mySockId && currentGameState.player2Roll === null)
                ) {
                 canIRoll = true;
              }
        }

        if (!canIRoll) {
            // console.log("[Client Action 3.2] rollDice: Zər atmaq növbəsi sizdə deyil.");
            return;
        }
        if (!diceCubeElement || !diceInstructions) { console.error("[Client Action 3.2] rollDice: diceCubeElement və ya diceInstructions tapılmadı!"); return;}

        // --- Animasiya və Serverə Göndərmə ---
        isDiceRolling = true; // Animasiya başladığını qeyd et
        console.log("[Client Action 3.2] rollDice: Zər atılır...");
        diceCubeElement.style.cursor = 'default'; // Animasiya zamanı kursoru dəyiş
        diceInstructions.textContent = 'Zər atılır...';
        diceInstructions.className = 'instructions'; // Gözləmə/bərabərlik stilini sil
        // Nəticə qutularını sıfırla (əgər bərabərlik idisə)
        if(isTie){
            if (yourRollResultDisplay) yourRollResultDisplay.textContent = '?';
            if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = '?';
            if(yourRollBox) yourRollBox.className = 'result-box';
            if(opponentRollBox) opponentRollBox.className = 'result-box';
        }

        // Təsadüfi nəticəni yarat
        const myRoll = Math.floor(Math.random() * 6) + 1;
        // console.log(`[Client Action 3.2] rollDice: Atılan zər: ${myRoll}`);

        // Serverə nəticəni göndər
        if (socket && socket.connected) {
             // console.log(`[Client Action 3.2] Serverə 'dice_roll_result' göndərilir: { roll: ${myRoll} }`);
             socket.emit('dice_roll_result', { roll: myRoll });
             // Cavabı game_state_update ilə gözləyirik
        } else {
            console.error("[Client Action 3.2] rollDice: Socket bağlantısı yoxdur!");
            alert("Serverlə bağlantı yoxdur. Zər nəticəsi göndərilə bilmədi.");
            isDiceRolling = false; // Animasiyanı ləğv et
            diceInstructions.textContent = 'Serverlə bağlantı xətası!';
            diceCubeElement.style.cursor = 'grab'; // Kursu geri qaytar
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
        // Daha realistik fırlanma üçün təsadüfi tam dövrələr
        const fullRotationsX = 360 * (2 + Math.floor(Math.random() * 3)); // 2-4 arası tam dövrə
        const fullRotationsY = 360 * (2 + Math.floor(Math.random() * 3));
        const fullRotationsZ = 360 * (1 + Math.floor(Math.random() * 2)); // Z oxu ətrafında da fırlansın
        const targetRotateX = finalFace.x + fullRotationsX;
        const targetRotateY = finalFace.y + fullRotationsY;
        const targetRotateZ = 0 + fullRotationsZ; // Z oxu üçün 0 dərəcə hədəf

        diceCubeElement.style.transition = `transform ${rollDurationValue} ${rollTimingFunctionValue}`;
        setDiceTransform(targetRotateX, targetRotateY, targetRotateZ);

        // Animasiya bitdikdən sonra
        setTimeout(() => {
            // console.log("[Client Action 3.2] rollDice: Lokal animasiya bitdi.");
            isDiceRolling = false; // Animasiyanı bitir
            if (diceCubeElement) {
                 diceCubeElement.style.transition = 'none'; // Növbəti ani dəyişikliklər üçün
                 // Zərin son vizual vəziyyətini saxla (tam dövrələrsiz)
                 currentDiceRotateX = finalFace.x;
                 currentDiceRotateY = finalFace.y;
                 currentDiceRotateZ = 0; // Z-ni sıfırla
                 setDiceTransform(); // Son vəziyyətə gətir
                 // Kurs server state-i gəldikdən sonra yenilənəcək (updateGameStatusAndModals tərəfindən)
                 // diceCubeElement.style.cursor = 'grab';
            }
            // Nəticəni serverdən gələn update göstərəcək, burada göstərməyək.
            // Serverdən gələn statusu gözləyək...
            if(diceInstructions.textContent === 'Zər atılır...') {
                 diceInstructions.textContent = 'Rəqib gözlənilir...'; // Və ya serverin göndərəcəyi status
                 diceInstructions.classList.add('waiting');
            }

        }, parseFloat(rollDurationValue.replace('s', '')) * 1000 + 50); // Animasiya + kiçik bufer
    }

    // --- Zər Sürükləmə/Klikləmə Hadisələri ---
    function handleMouseDown(event) { if (event.button !== 0) return; isDragging = true; dragStartX = event.clientX; dragStartY = event.clientY; previousMouseX = event.clientX; previousMouseY = event.clientY; if(diceCubeElement) diceCubeElement.style.cursor = 'grabbing'; }
    function handleMouseMove(event) { if (!isDragging) return; const dx = event.clientX - previousMouseX; const dy = event.clientY - previousMouseY; currentDiceRotateY += dx * rotateSensitivity; currentDiceRotateX -= dy * rotateSensitivity; setDiceTransform(); previousMouseX = event.clientX; previousMouseY = event.clientY; }
    function handleMouseUp(event) { if (event.button !== 0 || !isDragging) return; isDragging = false; const dragDistance = Math.sqrt(Math.pow(event.clientX-dragStartX, 2) + Math.pow(event.clientY-dragStartY, 2)); if (dragDistance < dragThreshold) { rollDice(); } if(diceCubeElement) diceCubeElement.style.cursor = 'grab'; }
    function handleTouchStart(event) { if (event.touches.length !== 1) return; event.preventDefault(); isDragging = true; const touch = event.touches[0]; dragStartX = touch.clientX; dragStartY = touch.clientY; previousMouseX = touch.clientX; previousMouseY = touch.clientY; }
    function handleTouchMove(event) { if (!isDragging || event.touches.length !== 1) return; event.preventDefault(); const touch = event.touches[0]; const dx = touch.clientX - previousMouseX; const dy = touch.clientY - previousMouseY; currentDiceRotateY += dx * rotateSensitivity; currentDiceRotateX -= dy * rotateSensitivity; setDiceTransform(); previousMouseX = touch.clientX; previousMouseY = touch.clientY; }
    function handleTouchEnd(event) { if (!isDragging) return; event.preventDefault(); isDragging = false; const touch = event.changedTouches[0]; const dragDistance = Math.sqrt(Math.pow(touch.clientX-dragStartX, 2) + Math.pow(touch.clientY-dragStartY, 2)); if (dragDistance < dragThreshold) { rollDice(); } }

    // Qlobal mouse/touch listenerları (sürükləmə üçün)
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);


// --- Hissə 3.2 Sonu ---
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
        // console.log("[Client Action 3.3] handleSymbolChoice çağırıldı.");
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
        // Sıranın bizdə olub olmadığını yoxla
        if (socket && currentGameState.symbolPickerSocketId !== socket.id) {
             console.warn(`[Client Action 3.3] handleSymbolChoice: Simvol seçmə növbəsi bizdə (${socket.id}) deyil. Seçən olmalı idi: ${currentGameState.symbolPickerSocketId}`);
             hideModal(symbolSelectModal); // UI səhvi ola bilər, modalı gizlədək.
             return;
        }
        // Simvollar artıq seçilibmi?
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
            // Statusu lokal olaraq dəyişək?
            if(symbolSelectMessage) symbolSelectMessage.textContent = "Seçim göndərildi...";
            if(symbolOptionsDiv) symbolOptionsDiv.style.display = 'none';
            if(symbolWaitingMessage) symbolWaitingMessage.style.display = 'block';
            clickedButton.disabled = true; // Təkrar klikləmənin qarşısını al

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
     */
    function handleRestartGame() {
        // console.log(`[Client Action 3.4] handleRestartGame çağırıldı.`);

        // --- Client Tərəfi Yoxlamalar ---
         if (!currentGameState || Object.keys(currentGameState).length === 0) {
             console.warn("[Client Action 3.4] handleRestartGame: currentGameState mövcud deyil.");
             return;
         }
         // Yalnız oyun bitibsə restart təklif etmək olar
         if (!currentGameState.isGameOver) {
             // console.log("[Client Action 3.4] handleRestartGame: Oyun hələ bitməyib.");
             // alert("Yenidən başlatmaq üçün oyunun bitməsini gözləyin.");
             return; // Səssizcə çıxaq
         }
         // Rəqib varmı? (AI olmayan oyun üçün) - isPlayingAgainstAI hələlik lokal idarə olunur
         const opponentExists = !!(currentGameState.player1SocketId && currentGameState.player2SocketId && currentGameState.player2SocketId !== 'AI_SNOW');
         if (!isPlayingAgainstAI && !opponentExists) {
             // console.log("[Client Action 3.4] handleRestartGame: Multiplayer oyunudur amma rəqib yoxdur.");
             // alert("Yenidən başlatmaq üçün rəqibin qoşulmasını gözləyin.");
             return; // Səssizcə çıxaq
         }

         // Təklif artıq göndərilibsə (və ya rəqib göndəribsə) təkrar göndərmə
         if (currentGameState.statusMessage?.includes("təklif")) {
             console.log("[Client Action 3.4] handleRestartGame: Yenidən başlatma təklifi artıq aktivdir.");
             return;
         }

        // --- Serverə Göndər ---
        if (socket && socket.connected) {
             console.log("[Client Action 3.4] Serverə 'request_restart' göndərilir.");
             socket.emit('request_restart');
             // UI-də düyməni deaktiv etmək və mesaj göstərmək serverdən gələn state ilə olacaq.
             if(gameStatusDisplay) gameStatusDisplay.textContent = "Yenidən başlatma təklifi göndərildi...";
             if(restartGameBtn) restartGameBtn.disabled = true;

        } else {
            console.error("[Client Action 3.4] handleRestartGame: Socket bağlantısı yoxdur!");
            alert("Serverlə bağlantı yoxdur. Təklif göndərilə bilmədi.");
        }
    }

    // performLocalRestart funksiyası artıq lazım deyil
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
    // Bunlar serverə müvafiq hadisələri göndərir.

    /**
     * "SNOW'u Çağır" düyməsinə basıldıqda işə düşür.
     * Serverə AI oyununu başlatmaq üçün tələb göndərir.
     */
    function handleCallSnow() {
        console.log("[Client Action 3.5] handleCallSnow çağırıldı.");

        // --- Client Tərəfi Yoxlamalar ---
        if (isOpponentPresent || isPlayingAgainstAI) {
            console.warn("[Client Action 3.5] handleCallSnow: Artıq rəqib var və ya AI ilə oynanılır.");
            return;
        }
        if (!isCurrentUserCreator) {
             alert("Yalnız otaq yaradan SNOW-u çağıra bilər.");
             return;
        }
        if (!socket || !socket.connected) {
             console.error("[Client Action 3.5] handleCallSnow: Socket bağlantısı yoxdur!");
             alert("Serverlə bağlantı yoxdur. SNOW çağırıla bilmir.");
             return;
        }
        if (!currentRoomId) {
             console.error("[Client Action 3.5] handleCallSnow: Otaq ID-si mövcud deyil!");
             alert("Otaq ID tapılmadığı üçün SNOW çağırıla bilmir.");
             return;
        }

        console.log("[Client Action 3.5] handleCallSnow: Serverə 'request_start_ai' göndərilir...");

        // Serverə AI oyununu başlatma tələbini göndər
        socket.emit('request_start_ai', { roomId: currentRoomId });

        // UI-ni dərhal yeniləməyək, serverdən gələcək 'game_state_update' cavabını gözləyək.
        // Cavab gələndə UI (rəqib adı, düymələr, status) avtomatik yenilənəcək.
        if (callSnowBtn) callSnowBtn.disabled = true; // Düyməni deaktiv et (cavab gələnə qədər)
        if (gameStatusDisplay) gameStatusDisplay.textContent = "SNOW oyuna dəvət edilir..."; // Keçici status
    }

    /**
     * "SNOW'u Çıxart" düyməsinə basıldıqda işə düşür.
     * Serverə AI oyununu dayandırmaq üçün tələb göndərir.
     */
    function handleRemoveSnow() {
        console.log("[Client Action 3.5] handleRemoveSnow çağırıldı.");

        // --- Client Tərəfi Yoxlamalar ---
        if (!isPlayingAgainstAI) {
             console.warn("[Client Action 3.5] handleRemoveSnow: Hazırda AI ilə oynanılmır.");
             return;
        }
        if (!isCurrentUserCreator) {
             console.warn("[Client Action 3.5] handleRemoveSnow: Yalnız otaq yaradan SNOW-u çıxara bilər.");
             return;
        }
        if (!socket || !socket.connected) {
            console.error("[Client Action 3.5] handleRemoveSnow: Socket bağlantısı yoxdur!");
            alert("Serverlə bağlantı yoxdur. SNOW çıxarıla bilmir.");
            return;
        }
         if (!currentRoomId) {
             console.error("[Client Action 3.5] handleRemoveSnow: Otaq ID-si mövcud deyil!");
             return;
         }

        console.log("[Client Action 3.5] handleRemoveSnow: Serverə 'request_stop_ai' göndərilir...");

        // Serverə AI oyununu dayandırma tələbini göndər
        socket.emit('request_stop_ai', { roomId: currentRoomId });

        // UI-ni dərhal yeniləməyək, serverdən gələcək 'game_state_update' cavabını gözləyək.
        if (removeSnowBtn) removeSnowBtn.disabled = true; // Düyməni deaktiv et
        if (gameStatusDisplay) gameStatusDisplay.textContent = "SNOW oyundan çıxarılır..."; // Keçici status
    }

    /** Köhnə lokal restart funksiyaları (artıq istifadə edilmir) */
    function resetGameStateVars() { console.warn("resetGameStateVars çağırıldı (köhnəlmiş)"); }
    function resetBoardAndStatus() { console.warn("resetBoardAndStatus çağırıldı (köhnəlmiş)"); }
    function setupDiceModalForRollOff() { console.warn("setupDiceModalForRollOff çağırıldı (köhnəlmiş)"); }

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
    // kənarlaşdırmaq üçün funksiyalar. Bunlar serverlə əlaqə tələb edir.

    /**
     * Otaq ayarları modal pəncərəsini açır.
     */
    function openEditModal() {
        console.log("[Client Action 3.6] openEditModal çağırıldı.");
        // Yoxlamalar
        if (isPlayingAgainstAI) { alert("AI oyununda otaq ayarları dəyişdirilə bilməz."); return; }
        if (!isCurrentUserCreator) { alert("Yalnız otağı yaradan parametrləri dəyişə bilər."); return; }

        // Serverdən gələn ən son otaq məlumatını istifadə edək (currentRoomData)
        if (!currentRoomData || !currentRoomData.id) {
             console.error("[Client Action 3.6] openEditModal: Cari otaq məlumatları tapılmadı!");
             alert("Otaq məlumatları alınarkən xəta baş verdi.");
             return;
        }

        // Modal elementlərini tap
        if (!editRoomModal) { console.error("editRoomModal tapılmadı!"); return; }
        const nameInput = editRoomModal.querySelector('#edit-room-name');
        const passwordCheck = editRoomModal.querySelector('#edit-room-password-check');
        const passwordInput = editRoomModal.querySelector('#edit-room-password');
        const boardSizeSelect = editRoomModal.querySelector('#edit-board-size');
        const msgElement = editRoomModal.querySelector('#edit-room-message');
        const saveBtn = editRoomModal.querySelector('#save-room-changes-btn');
        const deleteBtn = editRoomModal.querySelector('#delete-room-confirm-btn');


        // Mövcud otaq məlumatlarını modalda göstər
        if (nameInput) nameInput.value = currentRoomData.name || '';
        if (passwordCheck) passwordCheck.checked = currentRoomData.hasPassword || false;
        if (passwordInput) {
             passwordInput.value = ''; // Şifrəni heç vaxt göstərmə
             passwordInput.style.display = passwordCheck?.checked ? 'block' : 'none';
        }
        // Checkbox dəyişdikdə şifrə inputunu göstər/gizlə
        if (passwordCheck && passwordInput) {
             // Köhnə listenerı silmək üçün onchange əvəzinə add/removeEventListener istifadə etmək daha yaxşıdır
             // Amma hələlik belə qalsın
             passwordCheck.onchange = null;
             passwordCheck.onchange = () => { passwordInput.style.display = passwordCheck.checked ? 'block' : 'none'; };
        }
        if (boardSizeSelect) {
            // Hazırkı ölçünü currentRoomData-dan al
             const currentSize = currentRoomData.boardSize || boardSize; // Fallback olaraq qlobal boardSize
             boardSizeSelect.value = currentSize.toString();
             // Hazırda oyun gedirsə ölçü seçimini blokla? Server onsuz da icazə verməyəcək.
             // boardSizeSelect.disabled = !!(currentGameState.player1SocketId && currentGameState.player2SocketId && !currentGameState.isGameOver);
        }
        if (msgElement) { msgElement.textContent = ''; msgElement.className = 'message'; }
        if (saveBtn) saveBtn.disabled = false; // Əvvəlcə aktiv olsun
        if (deleteBtn) deleteBtn.disabled = false;

        showModal(editRoomModal); // Modalı göstər
    }

    /**
     * Otaq ayarları modalındakı dəyişiklikləri serverə göndərir.
     */
    function saveRoomChanges() {
        console.log("[Client Action 3.6] saveRoomChanges çağırıldı.");
        if (!editRoomModal) return;

        const nameInput = editRoomModal.querySelector('#edit-room-name');
        const passwordCheck = editRoomModal.querySelector('#edit-room-password-check');
        const passwordInput = editRoomModal.querySelector('#edit-room-password');
        const boardSizeSelect = editRoomModal.querySelector('#edit-board-size');
        const msgElement = editRoomModal.querySelector('#edit-room-message');
        const saveBtn = editRoomModal.querySelector('#save-room-changes-btn');
        const deleteBtn = editRoomModal.querySelector('#delete-room-confirm-btn');

        // Dəyərləri al
        const newName = nameInput?.value.trim();
        const newHasPasswordChecked = passwordCheck?.checked;
        const newBoardSize = parseInt(boardSizeSelect?.value || boardSize.toString(), 10);

        // Validasiyalar
        if (!newName) { showMsg(msgElement, 'Otaq adı boş ola bilməz.', 'error'); return; }
        let newPasswordValue = null;
        if (newHasPasswordChecked) {
            if (!passwordInput) { showMsg(msgElement, 'Şifrə sahəsi tapılmadı!', 'error'); return; }
            newPasswordValue = passwordInput.value;
            // Şifrə validasiyası (serverdəki ilə eyni olmalıdır - məsələn, boş ola bilməz)
            // if (!newPasswordValue || newPasswordValue.length < 2 || !(/[a-zA-Z]/.test(newPasswordValue) && /\d/.test(newPasswordValue))) {
            if (!newPasswordValue) { // Sadəcə boş olmadığını yoxlayaq, server ətraflı yoxlasın
                showMsg(msgElement, 'Şifrəli otaq üçün şifrə daxil edilməlidir.', 'error', 5000); return;
            }
        } else {
            newPasswordValue = null; // Şifrəni silmək üçün null göndər
        }

        // Serverə göndər
        if (socket && socket.connected) {
            console.log("[Client Action 3.6] Serverə 'update_room_settings' göndərilir...");
            if(saveBtn) saveBtn.disabled = true;
            if(deleteBtn) deleteBtn.disabled = true; // Digər əməliyyatları da blokla
            showMsg(msgElement, 'Dəyişikliklər serverə göndərilir...', 'info', 0); // Silinməyən mesaj

            socket.emit('update_room_settings', {
                roomId: currentRoomId, // Qlobal dəyişən
                newName: newName,
                newPassword: newPasswordValue, // Server null qəbul edib şifrəni silə bilər
                newBoardSize: newBoardSize
            });
            // Cavab üçün 'game_state_update' və ya 'room_info' və ya 'game_error' gözlənilir.
            // Uğurlu olarsa, serverdən gələn məlumat UI-ni yeniləyəcək və modalı bağlamaq olar.
            // Uğursuz olarsa, server 'game_error' göndərib mesaj verəcək.
            // Timeout əlavə edək ki, cavab gəlməzsə düymələr aktivləşsin.
            setTimeout(() => {
                 if (saveBtn?.disabled) {
                     showMsg(msgElement, 'Serverdən cavab gəlmədi. Təkrar yoxlayın.', 'error');
                     if(saveBtn) saveBtn.disabled = false;
                     if(deleteBtn) deleteBtn.disabled = false;
                 }
             }, 7000); // 7 saniyə

        } else {
             showMsg(msgElement, 'Serverlə bağlantı yoxdur!', 'error');
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

        if (confirm(`'${escapeHtml(currentRoomData.name || currentRoomId)}' otağını silmək istədiyinizə əminsiniz? Bu əməliyyat geri qaytarıla bilməz.`)) {
            console.log(`[Client Action 3.6] Otağı (${currentRoomId}) silmək üçün serverə 'delete_room' göndərilir...`);
            const msgElement = editRoomModal?.querySelector('#edit-room-message');
            const saveBtn = editRoomModal?.querySelector('#save-room-changes-btn');
            const deleteBtn = editRoomModal?.querySelector('#delete-room-confirm-btn');

            if(msgElement) showMsg(msgElement, 'Otaq silinir...', 'info', 0);
            if(saveBtn) saveBtn.disabled = true;
            if(deleteBtn) deleteBtn.disabled = true;

            if (socket && socket.connected) {
                socket.emit('delete_room', { roomId: currentRoomId });
                // Server 'room_deleted_kick' göndərərək client-i lobiyə yönləndirməlidir.
                // Client tərəfi həmin hadisəni gözləyir (Part 4.3-də).
            } else {
                 alert("Serverlə bağlantı yoxdur. Otaq silinə bilmədi.");
                 if(msgElement) showMsg(msgElement, 'Serverlə bağlantı yoxdur!', 'error');
                 if(saveBtn) saveBtn.disabled = false;
                 if(deleteBtn) deleteBtn.disabled = false;
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
        if (!isOpponentPresent) { console.log("Çıxarılacaq rəqib yoxdur."); return; } // Rəqib yoxdursa heçnə etmə
        if (!currentRoomId) { console.error("Otaq ID-si yoxdur!"); return; }

        const opponentToKick = opponentPlayerName || "Rəqib";

        if (confirm(`${escapeHtml(opponentToKick)}-i otaqdan çıxarmaq istədiyinizə əminsiniz?`)) {
             console.log(`[Client Action 3.6] Rəqibi (${opponentToKick}) kənarlaşdırmaq üçün serverə 'kick_opponent' göndərilir...`);
             if (kickOpponentBtn) kickOpponentBtn.disabled = true; // Düyməni deaktiv et

             if (socket && socket.connected) {
                 socket.emit('kick_opponent', { roomId: currentRoomId });
                 // Server cavab olaraq 'opponent_left_game' və ya 'game_state_update' göndərəcək.
                 // UI yeniləməsi həmin hadisələrlə olacaq.
             } else {
                 alert("Serverlə bağlantı yoxdur. Rəqib çıxarıla bilmədi.");
                 if (kickOpponentBtn) kickOpponentBtn.disabled = false; // Xəta baş verərsə aktiv et
             }
             // Timeout əlavə et (əgər cavab gəlməzsə)
             setTimeout(() => {
                 if(kickOpponentBtn?.disabled) {
                     console.warn("Kick opponent cavabı gəlmədi.");
                     if(kickOpponentBtn) kickOpponentBtn.disabled = false;
                 }
             }, 7000);
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

        if (!roomIdToJoin) {
            console.error("[Socket IO 4.1] Socket bağlantısı üçün Otaq ID təyin edilməyib!");
            hideLoadingOverlay();
            alert("Otaq ID tapılmadığı üçün serverə qoşulmaq mümkün deyil.");
            // Lobiyə yönləndir?
             window.location.href = '../lobby/test_odalar.html';
            return;
        }

        console.log(`[Socket IO 4.1] ${roomIdToJoin} otağı üçün yeni bağlantı qurulur...`);
        showLoadingOverlay('Serverə qoşulunur...');

        // Yeni socket bağlantısını yarat
        socket = io({
             reconnectionAttempts: 3, // 3 dəfə cəhd etsin
             // query: { roomId: roomIdToJoin } // Ehtiyac yoxdur, player_ready_in_room ilə göndərilir
        });

        // --- Əsas Bağlantı Hadisələri ---
        socket.on('connect', () => {
            console.log(`[Socket IO 4.1] >>> connect: Oyun serverinə qoşuldu! Socket ID: ${socket.id}, Otaq ID: ${roomIdToJoin}`);
            hideLoadingOverlay(); // Yükləmə ekranını gizlət

            // Serverə bu otaqda hazır olduğumuzu bildirək.
            console.log(`[Socket IO 4.1] <<< emit: 'player_ready_in_room' göndərilir. RoomID: ${roomIdToJoin}`);
            socket.emit('player_ready_in_room', { roomId: roomIdToJoin });
        });

        socket.on('disconnect', (reason) => {
            console.warn(`[Socket IO 4.1] >>> disconnect: Serverlə bağlantı kəsildi! Səbəb: ${reason}, Socket ID: ${socket.id}`);
            // UI-ni yenilə
            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Bağlantı kəsildi!';
            if (turnIndicator) turnIndicator.textContent = "Offline";
            if(boardElement){ boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';}
            // Oyunçu məlumatlarında Offline göstər?
            if (playerONameDisplay && playerONameDisplay.textContent !== 'Gözlənilir...') {
                 playerONameDisplay.textContent += ' (Offline)';
            }
            // Yenidən qoşulma cəhdi avtomatik baş verəcək
            showLoadingOverlay('Bağlantı bərpa edilir...');
        });

        socket.on('connect_error', (error) => {
            console.error(`[Socket IO 4.1] >>> connect_error: Qoşulma xətası!`, error);
            hideLoadingOverlay(); // Yükləmə ekranını gizlət
            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Serverə qoşulmaq mümkün olmadı!';
            if (turnIndicator) turnIndicator.textContent = "Xəta";
            if(boardElement){ boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';}
            alert(`Serverə qoşulmaq mümkün olmadı: ${error.message}. Lobiyə yönləndirilirsiniz.`);
             window.location.href = '../lobby/test_odalar.html';
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

        // Köhnə listenerları təmizləmək
        const eventsToRemove = [
            'game_state_update', 'opponent_left_game', 'room_deleted_kick',
            'force_redirect_lobby', 'invalid_move', 'game_error',
            'info_message', 'room_info', 'update_room_settings_result' // Yeni hadisə?
        ];
        eventsToRemove.forEach(event => socketInstance.off(event));

        console.log("[Socket IO 4.1] Köhnə oyun hadisə dinləyiciləri (əgər varsa) silindi.");

        // ======================================================
        // === ƏSAS HADİSƏ: Oyun Vəziyyəti Yeniləməsi        ===
        // ===         (Hissə 4.2-də olacaq - növbəti hissə) ===
        // ======================================================


        // ======================================================
        // === DİGƏR HADİSƏLƏR                               ===
        // ===    (Hissə 4.3-də olacaq - növbəti hissə)      ===
        // ======================================================


    // --- Hissə 4.1 Sonu ---
    // --- Part 4.1 Sonu (setupGameEventListeners funksiyası hələ açıqdır!) ---
// ========================================================================

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3-dən kodlar) ...

//     function setupGameEventListeners(socketInstance) {
//        console.log("[Socket IO 4.1] setupGameEventListeners: Oyun hadisə dinləyiciləri quraşdırılır...");
//        // ... (Köhnə listenerları silmə kodu - Part 4.1-də) ...

        // --------------------------------------------------------------------
        // --- Part 4.2: ƏSAS HADİSƏ HANDLER-İ - 'game_state_update' ---
        // --------------------------------------------------------------------
        socketInstance.on('game_state_update', (newState) => {
            console.log("[Socket Event 4.2] >>> game_state_update alındı. Status:", newState?.statusMessage);
            // console.log("[Socket Event 4.2] Alınan State:", JSON.stringify(newState)); // Detallı log

            if (!newState || typeof newState !== 'object') {
                console.error("[Socket Event 4.2] Keçərsiz və ya boş gameState alındı!");
                if(gameStatusDisplay) gameStatusDisplay.textContent = "Serverdən keçərsiz məlumat alındı.";
                return;
            }

            // --- Qlobal Vəziyyəti Yenilə ---
            const oldState = currentGameState; // Keçidləri yoxlamaq üçün köhnəni saxlayaq
            currentGameState = newState;
            isGameOver = newState.isGameOver; // Qlobal isGameOver yenilə
             console.log("[State Update 4.2] currentGameState yeniləndi.");

            // --- Lokal Dəyişənləri Yenilə ---
            if (boardSize !== newState.boardSize) {
                 console.warn(`[State Update 4.2] Lövhə ölçüsü dəyişdi! Server: ${newState.boardSize}, Client: ${boardSize}. Lövhə yenidən yaradılır.`);
                 boardSize = newState.boardSize;
                 createBoard();
                 // Lövhə yenidən yaradıldığı üçün UI update-i növbəti dövrəyə saxla? Yox, davam edək.
            }

            // Rəqibin olub olmadığını yenilə
            isOpponentPresent = !!(newState.player1SocketId && newState.player2SocketId);
             // isPlayingAgainstAI və isCurrentUserCreator serverdən gələn room_info ilə yenilənməlidir
             // Hələlik fərz edirik ki, onlar doğrudur.

            // --- UI Yeniləmə Funksiyalarını Çağır ---
            // console.log("[State Update 4.2] UI yeniləmə funksiyaları çağırılır...");
            updatePlayerInfo();
            updateTurnIndicator();
            const isMyTurnNow = socket && newState.currentPlayerSymbol && newState.currentPlayerSymbol === (newState.player1SocketId === socket.id ? newState.player1Symbol : newState.player2Symbol);
            updateBoardUI(newState.board || [], !!isMyTurnNow, newState.isGameOver, newState.winningCombination || []);
            updateGameStatusAndModals(newState);
            updateHeaderButtonsVisibility(); // Rəqib qoşulduqda/çıxdıqda vacibdir

            // --- Oyun Sonu Effektləri ---
            const justFinished = newState.isGameOver && !oldState?.isGameOver;
            if (justFinished && newState.winnerSymbol && newState.winnerSymbol !== 'draw') {
                console.log("[State Update 4.2] Oyun bitdi, effektlər göstərilir.");
                triggerShatterEffect(newState.winnerSymbol);
            } else {
                 hideFireworks(); // Oyun bitməyibsə və ya bərabərlikdirsə effektləri gizlət
            }

            // --- Düymə Vəziyyətləri ---
            if (restartGameBtn) {
                 // Oyun bitibsə və restart təklifi yoxdursa, aktiv et
                 restartGameBtn.disabled = !(newState.isGameOver && !newState.statusMessage?.includes("təklif"));
            }
            if(callSnowBtn) callSnowBtn.disabled = isOpponentPresent || !isCurrentUserCreator || isPlayingAgainstAI;
            if(removeSnowBtn) removeSnowBtn.disabled = !(isCurrentUserCreator && isPlayingAgainstAI);
            if(kickOpponentBtn) kickOpponentBtn.disabled = !(isCurrentUserCreator && isOpponentPresent && !isPlayingAgainstAI);
            if(editRoomBtn) editRoomBtn.disabled = !(isCurrentUserCreator && !isPlayingAgainstAI);

            // --- Əlavə Təmizləmələr ---
            if (isProcessingMove) {
                // console.log("[State Update 4.2] isProcessingMove sıfırlanır.");
                isProcessingMove = false;
                // Lövhə pointerEvents updateBoardUI tərəfindən onsuz da idarə olunur
            }

            // Otaq ayarları dəyişdirilibsə modalı bağla və mesajı təmizlə
            // (Bunu ayrıca 'update_room_settings_result' hadisəsi ilə etmək daha yaxşıdır)
            // if (oldState.name !== newState.name || ...) { hideModal(editRoomModal); }

            // console.log("[State Update 4.2] game_state_update emalı bitdi.");
        }); // socketInstance.on('game_state_update', ...) sonu


        // --------------------------------------------------------------------
        // --- Part 4.3: Digər Socket Hadisə Handler-ları ---
        // --------------------------------------------------------------------

        // ----- Rəqib Oyundan Ayrıldı -----
        socketInstance.on('opponent_left_game', (data) => {
            const opponentWhoLeft = data?.username || 'Rəqib';
            console.log(`[Socket Event 4.3] >>> opponent_left_game alındı: ${opponentWhoLeft}`);
            // Əsas UI yeniləmələri onsuz da növbəti 'game_state_update' ilə gələcək.
            // Sadəcə əlavə mesaj göstərə bilərik.
            if (gameStatusDisplay) {
                 gameStatusDisplay.textContent = `${escapeHtml(opponentWhoLeft)} oyundan ayrıldı.`;
                 gameStatusDisplay.className = 'game-status waiting'; // Gözləmə stili
            }
            isOpponentPresent = false; // Lokal state-i yeniləyək
            updateHeaderButtonsVisibility(); // "Call SNOW" görünə bilər
            if (restartGameBtn) restartGameBtn.disabled = true;
            hideModal(diceRollModal);
            hideModal(symbolSelectModal);
        });

        // ----- Otaq Silindi / Kick Edildiniz -----
        socketInstance.on('room_deleted_kick', (data) => {
            const message = data?.message || 'Otaq silindi və ya otaqdan çıxarıldınız.';
            console.warn(`[Socket Event 4.3] >>> room_deleted_kick alındı: ${message}`);
            alert(message + "\nLobiyə yönləndirilirsiniz.");
            window.location.href = '../lobby/test_odalar.html';
        });

        // ----- Lobiyə Məcburi Yönləndirmə -----
        socketInstance.on('force_redirect_lobby', (data) => {
            const message = data?.message || 'Otaqla bağlı problem yarandı.';
            console.warn(`[Socket Event 4.3] >>> force_redirect_lobby alındı: ${message}`);
            alert(message + "\nLobiyə yönləndirilirsiniz.");
            window.location.href = '../lobby/test_odalar.html';
        });

        // ----- Keçərsiz Hərəkət Bildirişi -----
        socketInstance.on('invalid_move', (data) => {
            const message = data?.message || 'Keçərsiz hərəkət!';
            console.warn(`[Socket Event 4.3] >>> invalid_move alındı: ${message}`);
            // Müvəqqəti mesaj göstərək
            if (gameStatusDisplay) {
                 const originalText = gameStatusDisplay.textContent;
                 gameStatusDisplay.textContent = message;
                 gameStatusDisplay.style.color = 'var(--danger-color)';
                 setTimeout(() => {
                     // Yalnız mesaj hələ dəyişməyibsə, geri qaytar
                     if (gameStatusDisplay.textContent === message) {
                         gameStatusDisplay.textContent = originalText;
                         gameStatusDisplay.style.color = ''; // Rəngi sıfırla
                     }
                 }, 2500);
            }
             // Hərəkət emalı bloklanmışdısa, onu açaq
             if (isProcessingMove) { isProcessingMove = false; }
             if (boardElement) boardElement.style.pointerEvents = 'auto'; // Lövhəni aktivləşdir
        });

        // ----- Ümumi Oyun Xətası -----
        socketInstance.on('game_error', (data) => {
            const message = data?.message || 'Oyunda xəta baş verdi.';
            console.error(`[Socket Event 4.3] >>> game_error alındı: ${message}`);
            if(gameStatusDisplay) gameStatusDisplay.textContent = `XƏTA: ${message}`;
            alert(`Oyunda xəta baş verdi: ${message}`);
            if(boardElement) boardElement.style.pointerEvents = 'none';
            // Modal açıqdırsa bağla
            hideModal(editRoomModal);
            hideModal(diceRollModal);
            hideModal(symbolSelectModal);
             // Düymələri yenidən aktivləşdirək? Bəlkə lazım deyil, onsuz da xəta var.
        });

        // ----- Məlumat Mesajı -----
        socketInstance.on('info_message', (data) => {
             const message = data?.message || 'Serverdən məlumat.';
             console.log(`[Socket Event 4.3] >>> info_message alındı: ${message}`);
             // Bunu ayrıca bir bildiriş sahəsində göstərmək daha yaxşı olar
             // Hələlik gameStatus-da göstərə bilərik (müvəqqəti)
             // showMsg(gameStatusDisplay, message, 'info', 3000);
        });

        // ----- İlkin/Yenilənmiş Otaq Məlumatı -----
        socketInstance.on('room_info', (roomInfo) => {
             console.log("[Socket Event 4.3] >>> room_info alındı:", roomInfo);
             if(!roomInfo) return;

             currentRoomData = { ...currentRoomData, ...roomInfo }; // Lokal otaq məlumatını yenilə

             // Yaradan statusunu yenilə
             if(roomInfo.creatorUsername && loggedInUser?.nickname) {
                 const wasCreator = isCurrentUserCreator;
                 isCurrentUserCreator = (loggedInUser.nickname === roomInfo.creatorUsername);
                 if(isCurrentUserCreator !== wasCreator) {
                     console.log(`[State Update 4.3] Yaradıcı statusu yeniləndi: ${isCurrentUserCreator}`);
                 }
             }
             // Rəqib statusunu yenilə (bu opponent_left_game/game_state_update ilə də edilir)
             const opponentJustJoined = roomInfo.opponentUsername && !isOpponentPresent;
             isOpponentPresent = !!roomInfo.opponentUsername;
             if (opponentJustJoined) {
                  opponentPlayerName = roomInfo.opponentUsername;
                  console.log(`[State Update 4.3] room_info-dan rəqib təyin edildi: ${opponentPlayerName}`);
                  updatePlayerInfo();
                  hideModal(diceRollModal); // Əgər açıq idisə bağla
                  hideModal(symbolSelectModal);
             }

             // Otaq adını yenilə
             if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(roomInfo.name || '?')}`;

             // AI statusunu yenilə
             const wasAI = isPlayingAgainstAI;
             isPlayingAgainstAI = roomInfo.isAiRoom || false;
              if(isPlayingAgainstAI !== wasAI) {
                  console.log(`[State Update 4.3] AI oyun statusu yeniləndi: ${isPlayingAgainstAI}`);
              }

             updateHeaderButtonsVisibility(); // Düymələri yenilə

             // Əgər otaq ayarları modalı açıqdırsa, onu bağlayaq (çünki məlumatlar yeniləndi)
             // Bu, 'update_room_settings_result' ilə daha yaxşı idarə olunur.
             // hideModal(editRoomModal);
        });

         // ----- Otaq Ayarları Yeniləmə Nəticəsi -----
         socketInstance.on('update_room_settings_result', (result) => {
             console.log("[Socket Event 4.3] >>> update_room_settings_result alındı:", result);
             const msgElement = editRoomModal?.querySelector('#edit-room-message');
             const saveBtn = editRoomModal?.querySelector('#save-room-changes-btn');
             const deleteBtn = editRoomModal?.querySelector('#delete-room-confirm-btn');

             if (result.success) {
                 showMsg(msgElement, result.message || 'Ayarlar uğurla yeniləndi!', 'success', 2000);
                 // Server onsuz da room_info və/və ya game_state_update göndərəcək.
                 // Həmin hadisələr UI-ni yeniləyəcək. Sadəcə modalı bağlayaq.
                 setTimeout(() => {
                      hideModal(editRoomModal);
                      // Düymələri yenidən aktivləşdirməyə ehtiyac yoxdur, modal bağlanır.
                 }, 1500);
             } else {
                 showMsg(msgElement, result.message || 'Ayarları yeniləmək mümkün olmadı.', 'error');
                 // Düymələri yenidən aktivləşdir
                 if(saveBtn) saveBtn.disabled = false;
                 if(deleteBtn) deleteBtn.disabled = false;
             }
         });


        console.log("[Socket IO 4.1] Bütün oyun hadisə dinləyiciləri quraşdırıldı.");

    } // <<<--- setupGameEventListeners funksiyasının BAĞLANMASI ---<<<


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
    /**
     * Oyun interfeysini ilkin olaraq qurur və serverə qoşulur.
     */
    async function initializeGame() {
        console.log("[Client Init 5.1] initializeGame çağırıldı.");
        showLoadingOverlay('Oyun interfeysi qurulur...');

        try {
            // URL-dən ilkin məlumatları al
            const params = getUrlParams();
            currentRoomId = params.roomId;
            const receivedRoomName = params.roomName;
            const initialBoardSize = params.size;
            const startWithAI = params.playWithAI;

            // İlkin qlobal dəyişənləri təyin et
            boardSize = initialBoardSize;
            currentPlayerName = loggedInUser?.nickname || 'Siz';

            // Əsas UI elementlərini yoxla
            if (!playerXNameDisplay || !playerONameDisplay || !roomNameDisplay) {
                 throw new Error("initializeGame: Əsas UI elementləri tapılmadı!");
            }

            // İlkin UI məlumatlarını göstər
            playerXNameDisplay.textContent = currentPlayerName;
            roomNameDisplay.textContent = `Otaq: ${escapeHtml(receivedRoomName)}`;
            playerONameDisplay.textContent = "Gözlənilir...";

            // Lövhəni yarat və stilləri tənzimlə
            adjustStylesForBoardSize(boardSize);
            createBoard();
            // resetBoardAndStatus(); // Bu artıq lazım deyil, server state-i gələcək

            // İlkin otaq məlumatlarını saxlayaq
            currentRoomData = {
                 id: currentRoomId, name: receivedRoomName, boardSize: boardSize,
                 isAiRoom: startWithAI, // AI ilə başladığını qeyd edək
                 // digər məlumatlar serverdən gələcək
            };
             isPlayingAgainstAI = startWithAI; // İlkin AI statusunu təyin et

            // --- Bağlantı və Oyun Başlatma Məntiqi ---
            // Həm AI, həm də Multiplayer üçün serverə qoşuluruq. Server AI oyununu idarə edəcək.
            if (!currentRoomId) {
                throw new Error("Oyun üçün Otaq ID-si tapılmadı!");
            }

            console.log(`[Client Init 5.1] initializeGame: Oyun (${currentRoomId}) üçün serverə qoşulunur... AI: ${isPlayingAgainstAI}`);
            // opponentPlayerName = "Rəqib Gözlənilir..."; // Server state-i gələnə qədər
            // isOpponentPresent = false;
            // isCurrentUserCreator = false;
            updatePlayerInfo(); // İlkin vəziyyəti göstər
            updateHeaderButtonsVisibility(); // İlkin düymə vəziyyəti
            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Serverə qoşulunur...';

            // Socket bağlantısını qur (bu, içində hideLoadingOverlay çağıracaq)
            setupGameSocketConnection(currentRoomId);
            // Oyunun başlaması üçün serverdən 'game_state_update' və 'room_info' gözlənilir.

            console.log(`[Client Init 5.1] initializeGame: İlkin quraşdırma tamamlandı.`);

        } catch (initError) {
            console.error("[Client Init 5.1] initializeGame XƏTASI:", initError);
            hideLoadingOverlay();
            if(gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yüklənərkən kritik xəta baş verdi!";
            if(turnIndicator) turnIndicator.textContent = "Xəta";
            alert("Oyun interfeysini qurarkən xəta baş verdi. Lobiyə yönləndirilirsiniz.");
             window.location.href = '../lobby/test_odalar.html';
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
    (async () => {
        console.log("[Client Init 5.2] İlkin autentifikasiya yoxlaması (IIFE) başladı.");
        try {
            console.log("[Client Init 5.2] Serverə /check-auth sorğusu göndərilir...");
            showLoadingOverlay('Sessiya yoxlanılır...');

            const response = await fetch('/check-auth', {
                 credentials: 'include' // Session cookie göndərmək üçün vacib ola bilər
            });

            const data = await response.json();

            if (!response.ok || !data.loggedIn || !data.user) {
                console.error(`[Client Init 5.2] /check-auth xətası və ya giriş edilməyib: Status=${response.status}, loggedIn=${data.loggedIn}`);
                alert("Sessiya tapılmadı və ya etibarsızdır. Zəhmət olmasa, yenidən giriş edin.");
                window.location.href = '/ANA SEHIFE/login/login.html';
                return;
            }

            loggedInUser = data.user;
            currentPlayerName = loggedInUser.nickname;
            console.log(`[Client Init 5.2] Autentifikasiya uğurlu: ${loggedInUser.nickname} (UserID: ${loggedInUser.id})`);

            // Autentifikasiya uğurlu olduqdan sonra oyunu başlat
            await initializeGame();

        } catch (error) {
            console.error("[Client Init 5.2] Autentifikasiya yoxlaması zamanı kritik xəta:", error);
            hideLoadingOverlay();
            alert("Sessiya yoxlanılarkən serverlə əlaqə qurmaq mümkün olmadı. İnternet bağlantınızı yoxlayın və ya daha sonra təkrar cəhd edin.");
             window.location.href = '/ANA SEHIFE/login/login.html';
        }
    })(); // IIFE (Immediately Invoked Function Expression) sonu

    // ======================================================
    // === ƏSAS UI HADİSƏ DİNLƏYİCİLƏRİ                  ===
    // ======================================================
    // ------------------------------------------------------------------------
    // --- Part 5.3: Əsas UI Hadisə Dinləyiciləri ---
    // ------------------------------------------------------------------------
    console.log("[Client Init 5.3] Əsas UI hadisə dinləyiciləri əlavə edilir...");

    // Otaqdan Ayrıl Düyməsi
    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', () => {
            console.log("[UI Event 5.3] 'Otaqdan Ayrıl' klikləndi.");
            if (confirm("Otaqdan çıxmaq istədiyinizə əminsiniz?")) {
                if (socket && socket.connected) {
                     console.log("[UI Event 5.3] Serverə 'leave_room' göndərilir.");
                     socket.emit('leave_room');
                }
                console.log("[UI Event 5.3] Lobiyə yönləndirilir...");
                window.location.href = '../lobby/test_odalar.html';
            }
        });
        console.log("[Client Init 5.3] -> leaveRoomBtn listener əlavə edildi.");
    } else { console.error("[Client Init 5.3] leaveRoomBtn tapılmadı!"); }

    // Yenidən Başlat Düyməsi
    if (restartGameBtn) {
        restartGameBtn.addEventListener('click', handleRestartGame);
        console.log("[Client Init 5.3] -> restartGameBtn listener əlavə edildi.");
    } else { console.error("[Client Init 5.3] restartGameBtn tapılmadı!"); }

    // Otaq Ayarları Düyməsi
    if (editRoomBtn) {
        editRoomBtn.addEventListener('click', openEditModal);
        console.log("[Client Init 5.3] -> editRoomBtn listener əlavə edildi.");
    } else { console.warn("[Client Init 5.3] editRoomBtn tapılmadı!"); } // Xəta deyil, gizli ola bilər

    // Otaq Ayarları Modalı Bağlama (X)
    if (closeEditModalButton) {
        closeEditModalButton.addEventListener('click', () => hideModal(editRoomModal));
        console.log("[Client Init 5.3] -> closeEditModalButton listener əlavə edildi.");
    } // else { console.warn("[Client Init 5.3] closeEditModalButton tapılmadı (modal içində)."); }

    // Modalın Kənarına Klikləmə (Ayarlar Modalı üçün)
    window.addEventListener('click', (event) => {
        if (event.target == editRoomModal) { hideModal(editRoomModal); }
        if (event.target == diceRollModal) { /* Zər modalı kənara kliklə bağlanmasın? */ }
        if (event.target == symbolSelectModal) { /* Simvol modalı kənara kliklə bağlanmasın? */ }
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
    } else { console.warn("[Client Init 5.3] kickOpponentBtn tapılmadı!"); }

    // SNOW'u Çağır Düyməsi
    if (callSnowBtn) {
        callSnowBtn.addEventListener('click', handleCallSnow);
        console.log("[Client Init 5.3] -> callSnowBtn listener əlavə edildi.");
    } else { console.warn("[Client Init 5.3] callSnowBtn tapılmadı!"); }

    // SNOW'u Çıxart Düyməsi
    if (removeSnowBtn) {
        removeSnowBtn.addEventListener('click', handleRemoveSnow);
        console.log("[Client Init 5.3] -> removeSnowBtn listener əlavə edildi.");
    } else { console.warn("[Client Init 5.3] removeSnowBtn tapılmadı!"); }

    // Zər Kubu Hadisələri (Mouse və Touch - Listenerlar əvvəlki hissədə qlobal əlavə edilib)
    if (diceCubeElement) {
        diceCubeElement.addEventListener('mousedown', handleMouseDown); // Klik və sürükləmə başlanğıcı
        diceCubeElement.addEventListener('touchstart', handleTouchStart, { passive: false }); // Toxunma üçün
        console.log("[Client Init 5.3] -> diceCubeElement listenerları (mousedown/touchstart) əlavə edildi.");
    } else { console.error("[Client Init 5.3] Zər kub elementi (diceCubeElement) tapılmadı!"); }

    // Simvol Seçmə Düymələri
    if (symbolOptionsDiv) {
         symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => {
              button.addEventListener('click', handleSymbolChoice);
         });
         console.log("[Client Init 5.3] -> Simvol seçmə düymələrinə listenerlar əlavə edildi.");
    } else { console.error("[Client Init 5.3] Simvol seçmə düymələri (symbolOptionsDiv) tapılmadı!"); }

    console.log("[Client Init 5.3] Bütün əsas UI listenerlarının əlavə edilməsi cəhdi bitdi.");


}); // <<<--- DOMContentLoaded Listener-inin BAĞLANMASI ---<<<

// ------------------------------------------------------------------------
// --- oda_ici.js Faylının Sonu ---
// ------------------------------------------------------------------------