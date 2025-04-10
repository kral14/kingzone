// ========================================================================
// oda_icimulti.js - Multiplayer Oyunları üçün Client Tərəfi Kodu
// ========================================================================
// QEYD: Bu fayl oda_ici.js-dən AI məntiqi çıxarılaraq yaradılıb və
// server_multi.js ilə əlaqə saxlayır.
// ========================================================================

// ------------------------------------------------------------------------
// --- Part 1.1: DOMContentLoaded, Qlobal Dəyişənlər, DOM Elementləri ---
// ------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    console.log("[Client Init 1.1] DOMContentLoaded - Oda İçi MULTIPLAYER JS Başladı.");

    // ---- Qlobal Dəyişənlər ----
    let loggedInUser = null;            // Giriş etmiş istifadəçi məlumatları (check-auth ilə gələcək)
    let currentRoomId = null;           // Hazırkı otağın ID-si (URL-dən)
    let socket = null;                  // Socket.IO bağlantı obyekti (server_multi.js-ə)
    let currentGameState = {};          // Serverdən gələn ƏN SON oyun vəziyyətini saxlayacaq obyekt
    let isCurrentUserCreator = false;   // Bu client otağı yaradıb mı? (server room_info ilə göndərəcək)
    let currentRoomData = {};           // Otaq haqqında ilkin məlumatlar (lobby və ya room_info-dan)

    // Client tərəfli UI vəziyyət dəyişənləri
    let isDiceRolling = false;          // Zər fırlanma animasiyası gedirmi?
    let isProcessingMove = false;       // Hərəkət serverə göndərilib cavab gözlənilirmi?
    let isOpponentPresent = false;      // Rəqib qoşulubmu? (Server state-dən alınacaq)

    // Oyunla bağlı dəyişənlər (əsasən `currentGameState`dən oxunacaq/yenilənəcək)
    let boardSize = 3;                  // Default, initializeGame-də URL-dən alınıb serverə güvəniləcək
    let cells = [];                     // Lövhə hüceyrələrinin DOM elementləri
    let player1Symbol = '?';            // Bu clientin simvolu (gameState-dən)
    let player2Symbol = '?';            // Rəqibin simvolu (gameState-dən)
    let currentPlayerName = 'Siz';      // loggedInUser.nickname olacaq
    let opponentPlayerName = 'Rəqib';   // gameState-dən
    let isGameOver = false;             // Oyun bitibmi? (Server state-dən alınacaq)

    // isPlayingAgainstAI dəyişəni artıq lazım deyil.

    console.log("[Client Init 1.1] Qlobal dəyişənlər yaradıldı (Multiplayer).");


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
    const restartGameBtn = document.getElementById('restart-game-btn');
    const kickOpponentBtn = document.getElementById('kick-opponent-btn');
    // AI düymələri artıq lazım deyil
    // const callSnowBtn = document.getElementById('call-snow-btn');
    // const removeSnowBtn = document.getElementById('remove-snow-btn');
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

    // DOM elementlərinin mövcudluğunu yoxlayaq
    if (!boardElement || !turnIndicator || !gameStatusDisplay || !playerXInfo || !playerOInfo ) {
         console.error("[Client Init 1.1] KRİTİK XƏTA: Əsas oyun UI elementləri tapılmadı!");
         if(gameLoadingOverlay) hideLoadingOverlay(); // hideLoadingOverlay hələ təyin olunmayıb, problem ola bilər
         alert("Oyun interfeysini qurarkən kritik xəta baş verdi. Səhifəni yeniləyin.");
         return;
    }
    console.log("[Client Init 1.1] DOM element referansları təyin edildi.");

    // ---- Zar üçün Texniki Dəyişənlər ----
    let currentDiceRotateX = 0; let currentDiceRotateY = 0; let currentDiceRotateZ = 0;
    const diceRotations = { 1:{x:0,y:0}, 6:{x:0,y:180}, 4:{x:0,y:90}, 3:{x:0,y:-90}, 2:{x:-90,y:0}, 5:{x:90,y:0} };
    let isDragging = false; let dragStartX, dragStartY, previousMouseX, previousMouseY;
    const dragThreshold = 10; const rotateSensitivity = 0.4; let initialCenterZ = -55;


// --- Hissə 1 Sonu ---
// --- Hissə 1.1 Sonu (DOMContentLoaded bloku hələ bağlanmayıb!) ---

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1.1 - Qlobal dəyişənlər, DOM elementləri) ...

    // ------------------------------------------------------------------------
    // --- Part 1.2: Yardımçı Funksiyalar, URL Parametrləri, Yükləmə Ekranı ---
    // ------------------------------------------------------------------------

    // ---- Yardımçı UI Funksiyaları ----
    const showModal = (modal) => {
        if (modal) { modal.style.display = 'block'; }
        else { console.warn("[UI Helper 1.2] showModal: Modal tapılmadı."); }
    };
    const hideModal = (modal) => {
         if (modal) { modal.style.display = 'none'; }
         else { console.warn("[UI Helper 1.2] hideModal: Modal tapılmadı."); }
    };
    const showMsg = (el, msg, type = 'info', duration = 3000) => { // Bu funksiya editRoomMessage üçün hələ də lazımdır
        if(el){
             el.textContent = msg;
             el.className = `message ${type}`;
             if (el.timeoutId) clearTimeout(el.timeoutId);
             if (duration > 0) {
                 el.timeoutId = setTimeout(() => {
                     if (el.textContent === msg) { el.textContent = ''; el.className = 'message'; }
                 }, duration);
             }
        } else { console.error(`[UI Helper 1.2] showMsg: Element tapılmadı! Mesaj: "${msg}"`); }
    };
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return String(unsafe);
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    };

    // ---- URL Parametrlərini Alma Funksiyası (AI parametri çıxarıldı) ----
    function getUrlParams() {
        console.log("URL parametrləri oxunur (Multiplayer)...");
        const params = new URLSearchParams(window.location.search);
        const roomIdParam = params.get('roomId');
        const roomNameParam = decodeURIComponent(params.get('roomName') || 'Bilinməyən Otaq');
        const sizeParam = parseInt(params.get('size') || '3', 10);
        const validatedSize = Math.max(3, Math.min(6, sizeParam));
        // playWithAI parametri artıq yoxdur

        const result = {
            roomId: roomIdParam,
            roomName: roomNameParam,
            size: validatedSize
            // playWithAI: false // Həmişə false olacaq
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
            // console.log(`[Loading Overlay 1.2] Göstərilir: "${text}"`);
        } else { console.error("[Loading Overlay 1.2] gameLoadingOverlay elementi tapılmadı!"); }
    };
    function hideLoadingOverlay() {
        if(gameLoadingOverlay) {
            gameLoadingOverlay.classList.remove('visible');
            // console.log("[Loading Overlay 1.2] Gizlədildi.");
        }
    };


// --- Hissə 1.2 Sonu ---
// ------------------------------------------------------------------------
// --- Part 2.1: UI Rendering - Lövhə Ayarları və Yenilənməsi ---
// ------------------------------------------------------------------------

    function adjustStylesForBoardSize(size) {
        // console.log(`[UI Render 2.1] adjustStylesForBoardSize çağırıldı. Ölçü: ${size}`);
        if (typeof size !== 'number' || size < 3 || size > 6) {
             console.error(`[UI Render 2.1] adjustStylesForBoardSize: Keçərsiz ölçü (${size}). Default 3 istifadə olunur.`);
             size = 3;
        }
        let cellSizeVar = '--cell-size-large-dynamic';
        if (size === 4) cellSizeVar = '--cell-size-medium-dynamic';
        else if (size >= 5) cellSizeVar = '--cell-size-small-dynamic';

        document.documentElement.style.setProperty('--current-cell-size', `var(${cellSizeVar})`);
        document.documentElement.style.setProperty('--current-font-size', `calc(var(${cellSizeVar}) * 0.6)`);
        document.documentElement.style.setProperty('--board-size', size);
        // console.log(`[UI Render 2.1] Lövhə ölçüsü ${size}x${size} üçün stillər tənzimləndi.`);

         try {
             const diceSizeValue = getComputedStyle(document.documentElement).getPropertyValue('--dice-size').trim();
             if (diceSizeValue) initialCenterZ = parseFloat(diceSizeValue.replace('px','')) / -2; else initialCenterZ = -55;
         } catch(e) { initialCenterZ = -55; }
    };

    function createBoard() {
        if (!boardElement) { console.error("[UI Render 2.1] createBoard: boardElement tapılmadı!"); return; }
        if (typeof boardSize !== 'number' || isNaN(boardSize) || boardSize < 3 || boardSize > 6) {
             console.error(`[UI Render 2.1] createBoard: Keçərsiz qlobal boardSize (${boardSize})! Lövhə yaradıla bilmir.`);
             return;
        }
        const cellCount = boardSize * boardSize;
        console.log(`[UI Render 2.1] createBoard: ${boardSize}x${boardSize} (${cellCount} hüceyrə) lövhə yaradılır...`);
        boardElement.innerHTML = '';
        cells = [];
        for (let i = 0; i < cellCount; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.index = i;
            cell.style.cursor = 'not-allowed';
            cell.addEventListener('click', handleCellClick); // Listenerı burada əlavə edirik
            cell.setAttribute('data-listener-attached', 'true');
            boardElement.appendChild(cell);
            cells.push(cell);
        }
        console.log(`[UI Render 2.1] createBoard: ${cells.length} hüceyrə yaradıldı.`);
        adjustStylesForBoardSize(boardSize);
    };

    function updateBoardUI(boardState, isMyTurn, gameIsOver, winningCombo = []) {
        if (!boardElement) { console.error("[UI Render 2.1] updateBoardUI: boardElement tapılmadı!"); return; }
        // cells massivinin mövcudluğunu və uzunluğunu yoxla
        if (!Array.isArray(cells) || !Array.isArray(boardState) || cells.length !== boardState.length) {
            console.error(`[UI Render 2.1] updateBoardUI XƏTA: Server lövhə ölçüsü (${boardState?.length ?? 'N/A'}) client hüceyrə sayı (${cells?.length ?? 'N/A'}) ilə uyğun gəlmir! Lövhə yenidən yaradılır...`);
            // Qlobal boardSize-ın düzgün olduğundan əmin olaq (əgər state-də boardSize varsa onu istifadə et)
            const serverBoardSize = currentGameState?.boardSize;
            if(serverBoardSize && typeof serverBoardSize === 'number' && serverBoardSize >= 3 && serverBoardSize <= 6){
                 boardSize = serverBoardSize; // Qlobal ölçünü düzəlt
            } // Əks halda mövcud qlobal boardSize istifadə olunacaq
            createBoard(); // Lövhəni yenidən yarat
            return; // Bu update-i burax, növbəti update düzgün lövhə ilə işləyəcək
        }

        const canClick = !gameIsOver && isMyTurn;

        cells.forEach((cell, index) => {
            if (!cell) return;
            const serverMark = boardState[index];
            // Məzmunu yenilə
            if (cell.textContent !== serverMark) {
                 cell.textContent = serverMark;
                 cell.classList.remove('X', 'O');
                 if (serverMark === 'X') cell.classList.add('X');
                 else if (serverMark === 'O') cell.classList.add('O');
            }
            // Klikləmə statusunu (cursor) yenilə
            cell.style.cursor = (serverMark === '' && canClick) ? 'pointer' : 'not-allowed';
            // Qazanma xəttini işıqlandır
            if (gameIsOver && winningCombo.includes(index)) {
                cell.classList.add('winning');
            } else {
                cell.classList.remove('winning');
            }
        });
        // Lövhənin ümumi görünüşü
        boardElement.style.opacity = gameIsOver ? '0.7' : '1';
        boardElement.style.pointerEvents = (gameIsOver || !isMyTurn) ? 'none' : 'auto';
    };

// --- Hissə 2.1 Sonu ---
// ------------------------------------------------------------------------
// --- Part 2.2: UI Rendering - Oyunçu Paneli, Sıra, Düymələr ---
// ------------------------------------------------------------------------

    function updatePlayerInfo() {
        if (!playerXInfo || !playerOInfo || !playerXSymbolDisplay || !playerOSymbolDisplay || !playerXNameDisplay || !playerONameDisplay) { return; }

        const state = currentGameState;
        let mySymbol = '?'; let opponentSymbol = '?';
        let myName = loggedInUser?.nickname || 'Siz'; let oppName = 'Rəqib';

        if (socket && state.player1SocketId === socket.id) {
            mySymbol = state.player1Symbol || '?'; opponentSymbol = state.player2Symbol || '?';
            myName = state.player1Username || myName; oppName = state.player2Username || 'Gözlənilir...';
        } else if (socket && state.player2SocketId === socket.id) {
            mySymbol = state.player2Symbol || '?'; opponentSymbol = state.player1Symbol || '?';
            myName = state.player2Username || myName; oppName = state.player1Username || 'Gözlənilir...';
        } else { /* İzləyici və ya hələ tam qoşulmayıb */
            mySymbol = state.player1Symbol || '?'; opponentSymbol = state.player2Symbol || '?';
            myName = state.player1Username || myName; oppName = state.player2Username || oppName;
        }

        playerXSymbolDisplay.textContent = mySymbol;
        playerXNameDisplay.textContent = escapeHtml(myName);
        playerXInfo.className = `player-info player-${mySymbol}`;

        playerOSymbolDisplay.textContent = opponentSymbol;
        playerONameDisplay.textContent = escapeHtml(oppName);
        playerOInfo.className = `player-info player-${opponentSymbol}`;

        if (!state.isGameOver && state.currentPlayerSymbol) {
            playerXInfo.classList.toggle('active-player', state.currentPlayerSymbol === mySymbol);
            playerOInfo.classList.toggle('active-player', state.currentPlayerSymbol === opponentSymbol);
        } else {
            playerXInfo.classList.remove('active-player');
            playerOInfo.classList.remove('active-player');
        }
    };

    function updateTurnIndicator() {
        if (!turnIndicator) return;
        const state = currentGameState;
        if (!state || Object.keys(state).length === 0) { turnIndicator.textContent = 'Vəziyyət Gözlənilir...'; return; }

        if (state.isGameOver) {
            let winnerName = "Oyun Bitdi";
            if(state.winnerSymbol === 'draw') winnerName = "Bərabərə!";
            else if (state.winnerSymbol === state.player1Symbol) winnerName = `${escapeHtml(state.player1Username || '?')} Qazandı!`;
            else if (state.winnerSymbol === state.player2Symbol) winnerName = `${escapeHtml(state.player2Username || '?')} Qazandı!`;
            turnIndicator.textContent = winnerName;
        } else if (!state.currentPlayerSymbol) {
            turnIndicator.textContent = state.statusMessage || 'Simvol Seçilir...';
        } else {
            let turnPlayerName = '';
            if (state.currentPlayerSymbol === state.player1Symbol) turnPlayerName = state.player1Username || '?';
            else if (state.currentPlayerSymbol === state.player2Symbol) turnPlayerName = state.player2Username || '?';

            let displayText = (socket && state.currentPlayerSymbol === (state.player1SocketId === socket.id ? state.player1Symbol : state.player2Symbol))
                ? `Sıra Sizdə (${state.currentPlayerSymbol})`
                : `Sıra: ${escapeHtml(turnPlayerName)} (${state.currentPlayerSymbol})`;
            turnIndicator.textContent = displayText;
        }
    };

    /**
     * Başlıqdakı düymələrin görünüşünü yeniləyir (AI düymələri çıxarılıb).
     */
    function updateHeaderButtonsVisibility() {
        // isCurrentUserCreator və isOpponentPresent qlobal dəyişənlərinə əsaslanır
        // console.log(`[UI Render 2.2] updateHeaderButtonsVisibility çağırıldı. isCreator=${isCurrentUserCreator}, isOpponent=${isOpponentPresent}`);

        const showEdit = isCurrentUserCreator; // AI yoxlaması çıxdı
        const showKick = isCurrentUserCreator && isOpponentPresent; // AI yoxlaması çıxdı

        if (editRoomBtn) editRoomBtn.style.display = showEdit ? 'inline-flex' : 'none';
        // else console.warn("[UI Render 2.2] editRoomBtn yoxdur");
        if (kickOpponentBtn) kickOpponentBtn.style.display = showKick ? 'inline-flex' : 'none';
        // else console.warn("[UI Render 2.2] kickOpponentBtn yoxdur");

        // AI düymələri artıq yoxdur
        // if (callSnowBtn) callSnowBtn.style.display = 'none';
        // if (removeSnowBtn) removeSnowBtn.style.display = 'none';
    };


// --- Hissə 2 Sonu ---
// ------------------------------------------------------------------------
// --- Part 2.3: UI Rendering - Oyun Statusu və Modal Pəncərələr ---
// ------------------------------------------------------------------------
// Qeyd: Serverdən gələn gameState-ə əsasən əsas status mesajını
// yeniləyən və zər atma/simvol seçmə modallarını idarə edən funksiya.

    /**
     * Serverdən gələn vəziyyətə uyğun olaraq oyun statusu mesajını və
     * modal pəncərələrin (zər, simvol) görünüşünü idarə edir.
     * @param {object} state - Serverdən gələn `gameState` obyekti.
     */
    function updateGameStatusAndModals(state) {
        // console.log(`[UI Render 2.3] updateGameStatusAndModals çağırıldı. Status: "${state?.statusMessage}"`);
        if (!state) {
            // console.warn("[UI Render 2.3] updateGameStatusAndModals: Boş state obyekti alındı.");
            if (gameStatusDisplay) gameStatusDisplay.textContent = "Serverdən məlumat gözlənilir...";
            hideModal(diceRollModal);
            hideModal(symbolSelectModal);
            return;
        }

        // --- Əsas Status Mesajını Yenilə ---
        if (gameStatusDisplay) {
            // Turn Indicator onsuz da qalib/bərabərə mesajını göstərir.
            gameStatusDisplay.textContent = state.statusMessage || (state.isGameOver ? "Oyun Bitdi" : "Oyun Davam Edir");
            // Statusa uyğun CSS klasları
            gameStatusDisplay.className = 'game-status';
            if (state.winnerSymbol && state.winnerSymbol !== 'draw') gameStatusDisplay.classList.add('win');
            else if (state.winnerSymbol === 'draw') gameStatusDisplay.classList.add('draw');
            else if (!state.player1SocketId || !state.player2SocketId) gameStatusDisplay.classList.add('waiting');
        }

        // --- Zər Atma Modalı ---
        const showDiceModalCondition = (state.statusMessage?.includes("Zər Atılır") || state.statusMessage?.includes("Bərabərlik!"))
                                       && state.player1Symbol === null && state.player2Symbol === null && !state.isGameOver;
        if (showDiceModalCondition) {
             // console.log("[UI Render 2.3] Zər atma modalı göstərilir/yenilənir.");
             if (diceInstructions) {
                 if(state.statusMessage?.includes("Bərabərlik!")) {
                    diceInstructions.textContent = 'Bərabərlik! Təkrar atmaq üçün zərə klikləyin.';
                 } else {
                    const mySockId = socket?.id;
                    let instructionText = state.statusMessage || 'Zər atın...';
                    if(mySockId === state.player1SocketId && state.player1Roll === null && state.player2Roll !== null) instructionText = 'Zər atmaq növbəsi sizdədir...';
                    else if (mySockId === state.player1SocketId && state.player1Roll !== null && state.player2Roll === null) instructionText = 'Rəqibin zər atması gözlənilir...';
                    else if (mySockId === state.player2SocketId && state.player2Roll === null && state.player1Roll !== null) instructionText = 'Zər atmaq növbəsi sizdədir...';
                    else if (mySockId === state.player2SocketId && state.player2Roll !== null && state.player1Roll === null) instructionText = 'Rəqibin zər atması gözlənilir...';
                    else if (state.player1Roll === null && state.player2Roll === null) instructionText = 'İlk zəri atmaq üçün klikləyin...';
                    diceInstructions.textContent = instructionText;
                 }
                 diceInstructions.className = 'instructions';
                 if(state.statusMessage?.includes("Bərabərlik!") || diceInstructions.textContent.includes("gözlənilir")) diceInstructions.classList.add('waiting');
             }

             const mySockId = socket?.id;
             const myRoll = (mySockId === state.player1SocketId) ? state.player1Roll : state.player2Roll;
             const oppRoll = (mySockId === state.player1SocketId) ? state.player2Roll : state.player1Roll;
             if (yourRollResultDisplay) yourRollResultDisplay.textContent = myRoll !== null ? myRoll : '?';
             if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = oppRoll !== null ? oppRoll : '?';

             const isTie = state.statusMessage?.includes("Bərabərlik!");
             if(yourRollBox) yourRollBox.classList.toggle('tie', isTie);
             if(opponentRollBox) opponentRollBox.classList.toggle('tie', isTie);
             if(!isTie && myRoll !== null && oppRoll !== null) {
                 if(yourRollBox) yourRollBox.classList.toggle('winner', myRoll > oppRoll);
                 if(opponentRollBox) opponentRollBox.classList.toggle('winner', oppRoll > myRoll);
             } else {
                 if(yourRollBox) yourRollBox.classList.remove('winner');
                 if(opponentRollBox) opponentRollBox.classList.remove('winner');
             }

             const canRoll = !isDiceRolling && ( (mySockId === state.player1SocketId && state.player1Roll === null) || (mySockId === state.player2SocketId && state.player2Roll === null) || isTie );
             if(diceCubeElement) diceCubeElement.style.cursor = canRoll ? 'grab' : 'not-allowed';

             showModal(diceRollModal);
        } else {
             hideModal(diceRollModal);
        }

        // --- Simvol Seçmə Modalı ---
        const showSymbolModalCondition = state.statusMessage?.includes("Simvol seç")
                                         && state.player1Symbol === null && state.player2Symbol === null && !state.isGameOver;
        if (showSymbolModalCondition) {
             // console.log("[UI Render 2.3] Simvol seçmə modalı göstərilir/yenilənir.");
             const amIPicker = socket && state.symbolPickerSocketId === socket.id;
             if (symbolSelectTitle) symbolSelectTitle.textContent = amIPicker ? "Simvol Seçin" : "Simvol Seçilir";
             if (symbolSelectMessage) symbolSelectMessage.textContent = amIPicker
                 ? "Oyuna başlamaq üçün simvolunuzu seçin:"
                 : `${state.diceWinnerSocketId === state.player1SocketId ? (state.player1Username || '?') : (state.player2Username || '?')} simvol seçir...`;

             if (symbolOptionsDiv) {
                 symbolOptionsDiv.style.display = amIPicker ? 'flex' : 'none';
                 symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => { button.disabled = !amIPicker; });
             }
             if (symbolWaitingMessage) symbolWaitingMessage.style.display = amIPicker ? 'none' : 'block';

             showModal(symbolSelectModal);
        } else {
             hideModal(symbolSelectModal);
        }
    }

// --- Hissə 2.3 Sonu ---
// ------------------------------------------------------------------------
// --- Part 2.4: UI Rendering - Oyun Sonu Effektləri ---
// ------------------------------------------------------------------------

    function triggerShatterEffect(winnerMark) {
        // console.log(`[Effects 2.4] triggerShatterEffect çağırıldı. Qalib: ${winnerMark}`);
        if (!fireworksOverlay || !shatteringTextContainer || !winnerMark || winnerMark === 'draw') { return; }
        clearShatteringText();

        const state = currentGameState;
        const winnerName = (winnerMark === state.player1Symbol) ? state.player1Username : state.player2Username;
        const isClientWinner = (socket && winnerMark === (state.player1SocketId === socket.id ? state.player1Symbol : state.player2Symbol));

        const text = isClientWinner ? "Siz Qazandınız!" : `${escapeHtml(winnerName || winnerMark)} Qazandı!`;
        const chars = text.split('');

        chars.forEach((char, index) => {
            const span = document.createElement('span');
            span.textContent = char === ' ' ? '\u00A0' : char;
            span.classList.add('shatter-char');
            span.style.setProperty('--char-index', index);
            shatteringTextContainer.appendChild(span);
        });

        fireworksOverlay.classList.add('visible');
        shatteringTextContainer.style.opacity = '1';

        setTimeout(() => {
            const spans = shatteringTextContainer.querySelectorAll('.shatter-char');
            let duration = 3000, distance = 170;
            try {
               duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-duration').replace('s',''))*1000||3000;
               distance = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-distance').replace('px',''))||170;
            } catch(e){ console.warn("Shatter CSS dəyişənləri oxuna bilmədi."); }

            spans.forEach((span, i) => {
                const angle = Math.random()*360; const randDist = Math.random()*distance;
                const tx = Math.cos(angle*Math.PI/180)*randDist; const ty = Math.sin(angle*Math.PI/180)*randDist;
                const tz = (Math.random()-0.5)*distance*0.5; const rot = (Math.random()-0.5)*720;
                const delay = Math.random()*0.1;
                span.style.setProperty('--tx',`${tx}px`); span.style.setProperty('--ty',`${ty}px`);
                span.style.setProperty('--tz',`${tz}px`); span.style.setProperty('--rot',`${rot}deg`);
                span.style.animationDelay=`${delay}s`;
                span.classList.add('animate');
            });

            setTimeout(hideFireworks, duration + 500);
            // console.log(`[Effects 2.4] Shatter animasiyası başladı. Müddət: ${duration}ms`);
        }, 100);
    }

   function hideFireworks() {
       if (fireworksOverlay) fireworksOverlay.classList.remove('visible');
       if (shatteringTextContainer) {
            shatteringTextContainer.style.opacity = '0';
            setTimeout(clearShatteringText, 500);
       }
   }

   function clearShatteringText() { if (shatteringTextContainer) shatteringTextContainer.innerHTML = ''; }

// --- Hissə 2.4 Sonu ---
// ------------------------------------------------------------------------
// --- Part 3.1: Client Əməliyyatları - Xanaya Klikləmə ---
// ------------------------------------------------------------------------

    function handleCellClick(event) {
        // console.log("[Client Action 3.1] handleCellClick çağırıldı.");
        const clickedCell = event.target;
        const index = parseInt(clickedCell.dataset.index);

        if (!currentGameState || Object.keys(currentGameState).length === 0 || isNaN(index)) { return; }
        if (currentGameState.isGameOver || isDiceRolling) { return; }

        let myTurn = false;
        const mySockId = socket?.id;
        if (mySockId && currentGameState.currentPlayerSymbol) {
             if (currentGameState.player1SocketId === mySockId && currentGameState.currentPlayerSymbol === currentGameState.player1Symbol) myTurn = true;
             else if (currentGameState.player2SocketId === mySockId && currentGameState.currentPlayerSymbol === currentGameState.player2Symbol) myTurn = true;
        }
        if (!myTurn) { return; }
        if (currentGameState.board[index] !== '') { return; }
        if (isProcessingMove) { console.warn("Əvvəlki hərəkət emal edilir."); return; }

        if (socket && socket.connected) {
            console.log(`[Client Action 3.1] Serverə 'make_move' göndərilir. Index: ${index}`);
            isProcessingMove = true;
            if (boardElement) boardElement.style.pointerEvents = 'none'; // Blokla
            socket.emit('make_move', { index: index });

            setTimeout(() => {
                 if(isProcessingMove) {
                     console.warn("[Client Action 3.1] make_move cavabı timeout. isProcessingMove sıfırlanır, lövhə aktivləşdirilir.");
                     isProcessingMove = false;
                      if (boardElement && !currentGameState.isGameOver) boardElement.style.pointerEvents = 'auto';
                 }
             }, 5000); // 5 saniyə timeout
        } else {
            console.error("[Client Action 3.1] handleCellClick: Socket bağlantısı yoxdur!");
            alert("Serverlə bağlantı yoxdur. Hərəkət göndərilə bilmədi.");
        }
    }

// --- Hissə 3.1 Sonu ---
// ------------------------------------------------------------------------
// --- Part 3.2: Client Əməliyyatları - Zər Atma ---
// ------------------------------------------------------------------------

    function setDiceTransform(rotateX = currentDiceRotateX, rotateY = currentDiceRotateY, rotateZ = currentDiceRotateZ) {
        if (diceCubeElement) {
            diceCubeElement.style.transform = `translateZ(${initialCenterZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
        }
    }

    function initDice() {
        if (!diceCubeElement) return;
        // console.log("[Dice 3.2] initDice çağırıldı.");
        diceCubeElement.style.transition = 'none';
        currentDiceRotateX = diceRotations[1].x; currentDiceRotateY = diceRotations[1].y; currentDiceRotateZ = 0;
        setDiceTransform();
        isDiceRolling = false;
    }

    function rollDice() {
        if (!currentGameState || isDiceRolling || currentGameState.isGameOver || currentGameState.currentPlayerSymbol !== null) { return; }

        let canIRoll = false;
        const mySockId = socket?.id;
        const isTie = currentGameState.statusMessage?.includes("Bərabərlik!");
        if (mySockId && ( isTie || (currentGameState.player1SocketId === mySockId && currentGameState.player1Roll === null) || (currentGameState.player2SocketId === mySockId && currentGameState.player2Roll === null))) {
             canIRoll = true;
        }
        if (!canIRoll) { return; }
        if (!diceCubeElement || !diceInstructions) { console.error("Zər elementi tapılmadı!"); return;}

        isDiceRolling = true;
        console.log("[Client Action 3.2] rollDice: Zər atılır...");
        diceCubeElement.style.cursor = 'default';
        diceInstructions.textContent = 'Zər atılır...';
        diceInstructions.className = 'instructions';
        if(isTie){ // Bərabərlik idisə nəticələri sıfırla
            if (yourRollResultDisplay) yourRollResultDisplay.textContent = '?';
            if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = '?';
            if(yourRollBox) yourRollBox.className = 'result-box';
            if(opponentRollBox) opponentRollBox.className = 'result-box';
        }

        const myRoll = Math.floor(Math.random() * 6) + 1;

        if (socket && socket.connected) {
             socket.emit('dice_roll_result', { roll: myRoll });
        } else {
            console.error("Socket bağlantısı yoxdur!"); alert("Serverlə bağlantı yoxdur.");
            isDiceRolling = false; diceInstructions.textContent = 'Serverlə bağlantı xətası!';
            if(diceCubeElement) diceCubeElement.style.cursor = 'grab'; return;
        }

        // Lokal Animasiya
        let rollDurationValue = '2.0s'; let rollTimingFunctionValue = 'cubic-bezier(0.3, 0.9, 0.4, 1)';
        try { rollDurationValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-duration').trim() || '2.0s'; rollTimingFunctionValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-timing-function').trim() || 'cubic-bezier(0.3, 0.9, 0.4, 1)'; } catch (e) {}

        const finalFace = diceRotations[myRoll];
        const fullRotationsX = 360 * (2 + Math.floor(Math.random() * 3));
        const fullRotationsY = 360 * (2 + Math.floor(Math.random() * 3));
        const fullRotationsZ = 360 * (1 + Math.floor(Math.random() * 2));
        const targetRotateX = finalFace.x + fullRotationsX;
        const targetRotateY = finalFace.y + fullRotationsY;
        const targetRotateZ = 0 + fullRotationsZ;

        diceCubeElement.style.transition = `transform ${rollDurationValue} ${rollTimingFunctionValue}`;
        setDiceTransform(targetRotateX, targetRotateY, targetRotateZ);

        setTimeout(() => {
            isDiceRolling = false;
            if (diceCubeElement) {
                 diceCubeElement.style.transition = 'none';
                 currentDiceRotateX = finalFace.x; currentDiceRotateY = finalFace.y; currentDiceRotateZ = 0;
                 setDiceTransform();
            }
            if(diceInstructions.textContent === 'Zər atılır...') {
                 diceInstructions.textContent = 'Rəqib gözlənilir...'; // Serverdən gələcək status daha dəqiq olacaq
                 diceInstructions.classList.add('waiting');
            }
        }, parseFloat(rollDurationValue.replace('s', '')) * 1000 + 50);
    }

    // --- Zər Sürükləmə/Klikləmə Hadisələri ---
    function handleMouseDown(event) { if (event.button !== 0) return; isDragging = true; dragStartX = event.clientX; dragStartY = event.clientY; previousMouseX = event.clientX; previousMouseY = event.clientY; if(diceCubeElement) diceCubeElement.style.cursor = 'grabbing'; }
    function handleMouseMove(event) { if (!isDragging) return; const dx = event.clientX - previousMouseX; const dy = event.clientY - previousMouseY; currentDiceRotateY += dx * rotateSensitivity; currentDiceRotateX -= dy * rotateSensitivity; setDiceTransform(); previousMouseX = event.clientX; previousMouseY = event.clientY; }
    function handleMouseUp(event) { if (event.button !== 0 || !isDragging) return; isDragging = false; const dragDistance = Math.sqrt(Math.pow(event.clientX-dragStartX, 2) + Math.pow(event.clientY-dragStartY, 2)); if (dragDistance < dragThreshold) { rollDice(); } if(diceCubeElement) diceCubeElement.style.cursor = 'grab'; }
    function handleTouchStart(event) { if (event.touches.length !== 1) return; event.preventDefault(); isDragging = true; const touch = event.touches[0]; dragStartX = touch.clientX; dragStartY = touch.clientY; previousMouseX = touch.clientX; previousMouseY = touch.clientY; }
    function handleTouchMove(event) { if (!isDragging || event.touches.length !== 1) return; event.preventDefault(); const touch = event.touches[0]; const dx = touch.clientX - previousMouseX; const dy = touch.clientY - previousMouseY; currentDiceRotateY += dx * rotateSensitivity; currentDiceRotateX -= dy * rotateSensitivity; setDiceTransform(); previousMouseX = touch.clientX; previousMouseY = touch.clientY; }
    function handleTouchEnd(event) { if (!isDragging) return; event.preventDefault(); isDragging = false; const touch = event.changedTouches[0]; const dragDistance = Math.sqrt(Math.pow(touch.clientX-dragStartX, 2) + Math.pow(touch.clientY-dragStartY, 2)); if (dragDistance < dragThreshold) { rollDice(); } }

    // Qlobal mouse/touch listenerları (sürükləmə üçün) - Bunları Part 5.3-də əlavə edək
    // document.addEventListener('mousemove', handleMouseMove);
    // document.addEventListener('mouseup', handleMouseUp);
    // document.addEventListener('touchmove', handleTouchMove, { passive: false });
    // document.addEventListener('touchend', handleTouchEnd);


// --- Hissə 3 Sonu ---
// ------------------------------------------------------------------------
// --- Part 3.3: Client Əməliyyatları - Simvol Seçimi ---
// ------------------------------------------------------------------------

function handleSymbolChoice(event) {
    // console.log("[Client Action 3.3] handleSymbolChoice çağırıldı.");
    const clickedButton = event.target;
    const chosenSymbol = clickedButton.dataset.symbol;

    if (!chosenSymbol || (chosenSymbol !== 'X' && chosenSymbol !== 'O')) { return; }
    if (!currentGameState || Object.keys(currentGameState).length === 0) { return; }
    if (socket && currentGameState.symbolPickerSocketId !== socket.id) { hideModal(symbolSelectModal); return; }
    if (currentGameState.player1Symbol !== null || currentGameState.player2Symbol !== null) { hideModal(symbolSelectModal); return; }

    if (socket && socket.connected) {
        console.log(`[Client Action 3.3] Serverə 'symbol_choice' göndərilir. Simvol: ${chosenSymbol}`);
        socket.emit('symbol_choice', { symbol: chosenSymbol });
        if(symbolSelectMessage) symbolSelectMessage.textContent = "Seçim göndərildi...";
        if(symbolOptionsDiv) symbolOptionsDiv.style.display = 'none';
        if(symbolWaitingMessage) symbolWaitingMessage.style.display = 'block';
        clickedButton.disabled = true;
    } else {
        console.error("Socket bağlantısı yoxdur!"); alert("Serverlə bağlantı yoxdur.");
    }
}

// --- Hissə 3.3 Sonu ---
// ------------------------------------------------------------------------
// --- Part 3.4: Client Əməliyyatları - Yenidən Başlatma Təklifi ---
// ------------------------------------------------------------------------

function handleRestartGame() {
    // console.log(`[Client Action 3.4] handleRestartGame çağırıldı.`);
    if (!currentGameState || !currentGameState.isGameOver) { return; } // Yalnız oyun bitibsə
    // Rəqibin olub olmadığını yoxla (gameState-dən)
    if (!currentGameState.player1SocketId || !currentGameState.player2SocketId) { return; }
    // Təklif artıq aktivdirsə göndərmə
    if (currentGameState.statusMessage?.includes("təklif")) { return; }

    if (socket && socket.connected) {
         console.log("[Client Action 3.4] Serverə 'request_restart' göndərilir.");
         socket.emit('request_restart');
         if(gameStatusDisplay) gameStatusDisplay.textContent = "Yenidən başlatma təklifi göndərildi...";
         if(restartGameBtn) restartGameBtn.disabled = true;
    } else {
        console.error("Socket bağlantısı yoxdur!"); alert("Serverlə bağlantı yoxdur.");
    }
}

// --- Hissə 3.4 Sonu ---
// ------------------------------------------------------------------------
// --- Part 3.5: Client Əməliyyatları - SNOW Düymələri (SİLİNDİ) ---
// ------------------------------------------------------------------------
// handleCallSnow() və handleRemoveSnow() funksiyaları multiplayer üçün lazım deyil.

// --- Hissə 3.5 Sonu ---
// ------------------------------------------------------------------------
// --- Part 3.6: Client Əməliyyatları - Otaq Əməliyyatları ---
// ------------------------------------------------------------------------

function openEditModal() {
    console.log("[Client Action 3.6] openEditModal çağırıldı.");
    // AI yoxlaması silindi
    if (!isCurrentUserCreator) { alert("Yalnız otağı yaradan parametrləri dəyişə bilər."); return; }
    if (!currentRoomData || !currentRoomData.id) { alert("Otaq məlumatları hələ tam alınmayıb."); return; }
    if (!editRoomModal) { console.error("editRoomModal tapılmadı!"); return; }

    const nameInput = editRoomModal.querySelector('#edit-room-name');
    const passwordCheck = editRoomModal.querySelector('#edit-room-password-check');
    const passwordInput = editRoomModal.querySelector('#edit-room-password');
    const boardSizeSelect = editRoomModal.querySelector('#edit-board-size');
    const msgElement = editRoomModal.querySelector('#edit-room-message');
    const saveBtn = editRoomModal.querySelector('#save-room-changes-btn');
    const deleteBtn = editRoomModal.querySelector('#delete-room-confirm-btn');

    if (nameInput) nameInput.value = currentRoomData.name || '';
    if (passwordCheck) passwordCheck.checked = currentRoomData.hasPassword || false;
    if (passwordInput) {
         passwordInput.value = '';
         passwordInput.style.display = passwordCheck?.checked ? 'block' : 'none';
    }
    if (passwordCheck && passwordInput) {
         passwordCheck.onchange = null;
         passwordCheck.onchange = () => { passwordInput.style.display = passwordCheck.checked ? 'block' : 'none'; };
    }
    if (boardSizeSelect) {
         const currentSize = currentRoomData.boardSize || boardSize;
         boardSizeSelect.value = currentSize.toString();
         // Oyun gedirsə ölçü dəyişməni blokla?
         boardSizeSelect.disabled = !!(currentGameState?.player1SocketId && currentGameState?.player2SocketId && !currentGameState?.isGameOver);
    }
    if (msgElement) { msgElement.textContent = ''; msgElement.className = 'message'; }
    if (saveBtn) saveBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;

    showModal(editRoomModal);
}

function saveRoomChanges() {
    console.log("[Client Action 3.6] saveRoomChanges çağırıldı.");
    if (!editRoomModal) return;
    if (!isCurrentUserCreator) return; // Ehtiyat üçün

    const nameInput = editRoomModal.querySelector('#edit-room-name');
    const passwordCheck = editRoomModal.querySelector('#edit-room-password-check');
    const passwordInput = editRoomModal.querySelector('#edit-room-password');
    const boardSizeSelect = editRoomModal.querySelector('#edit-board-size');
    const msgElement = editRoomModal.querySelector('#edit-room-message');
    const saveBtn = editRoomModal.querySelector('#save-room-changes-btn');
    const deleteBtn = editRoomModal.querySelector('#delete-room-confirm-btn');

    const newName = nameInput?.value.trim();
    const newHasPasswordChecked = passwordCheck?.checked;
    const newBoardSize = parseInt(boardSizeSelect?.value || boardSize.toString(), 10);

    if (!newName) { showMsg(msgElement, 'Otaq adı boş ola bilməz.', 'error'); return; }
    let newPasswordValue = null;
    if (newHasPasswordChecked) {
        if (!passwordInput) { showMsg(msgElement, 'Şifrə sahəsi tapılmadı!', 'error'); return; }
        newPasswordValue = passwordInput.value;
        if (!newPasswordValue) { showMsg(msgElement, 'Şifrəli otaq üçün şifrə daxil edilməlidir.', 'error', 5000); return; }
        // Server ətraflı yoxlama edəcək
    } else { newPasswordValue = null; } // Şifrəni sil

    if (socket && socket.connected) {
        console.log("[Client Action 3.6] Serverə 'update_room_settings' göndərilir...");
        if(saveBtn) saveBtn.disabled = true;
        if(deleteBtn) deleteBtn.disabled = true;
        showMsg(msgElement, 'Dəyişikliklər göndərilir...', 'info', 0);

        socket.emit('update_room_settings', {
            roomId: currentRoomId, newName: newName,
            newPassword: newPasswordValue, newBoardSize: newBoardSize
        });

        setTimeout(() => { // Timeout
             if (saveBtn?.disabled) {
                 showMsg(msgElement, 'Serverdən cavab gəlmədi.', 'error');
                 if(saveBtn) saveBtn.disabled = false;
                 if(deleteBtn) deleteBtn.disabled = false;
             }
         }, 7000);
    } else { showMsg(msgElement, 'Serverlə bağlantı yoxdur!', 'error'); }
}

function deleteRoom() {
    console.log("[Client Action 3.6] deleteRoom çağırıldı.");
    if (!isCurrentUserCreator) return;
    if (!currentRoomId) { console.error("Silinəcək otaq ID-si yoxdur!"); return; }

    if (confirm(`'${escapeHtml(currentRoomData.name || currentRoomId)}' otağını silmək istədiyinizə əminsiniz?`)) {
        console.log(`[Client Action 3.6] Serverə 'delete_room' göndərilir...`);
        const msgElement = editRoomModal?.querySelector('#edit-room-message');
        const saveBtn = editRoomModal?.querySelector('#save-room-changes-btn');
        const deleteBtn = editRoomModal?.querySelector('#delete-room-confirm-btn');

        if(msgElement) showMsg(msgElement, 'Otaq silinir...', 'info', 0);
        if(saveBtn) saveBtn.disabled = true;
        if(deleteBtn) deleteBtn.disabled = true;

        if (socket && socket.connected) {
            socket.emit('delete_room', { roomId: currentRoomId });
            // Client 'room_deleted_kick' hadisəsini gözləyir (Part 5-də)
        } else {
             alert("Serverlə bağlantı yoxdur.");
             if(msgElement) showMsg(msgElement, 'Serverlə bağlantı yoxdur!', 'error');
             if(saveBtn) saveBtn.disabled = false; if(deleteBtn) deleteBtn.disabled = false;
        }
    }
}

function handleKickOpponent() {
    console.log("[Client Action 3.6] handleKickOpponent çağırıldı.");
    if (!isCurrentUserCreator || !isOpponentPresent) { return; } // Rəqib olmalıdır
    if (!currentRoomId) { console.error("Otaq ID-si yoxdur!"); return; }

    const opponentToKick = opponentPlayerName || "Rəqib";
    if (confirm(`${escapeHtml(opponentToKick)}-i otaqdan çıxarmaq istədiyinizə əminsiniz?`)) {
         console.log(`[Client Action 3.6] Serverə 'kick_opponent' göndərilir...`);
         if (kickOpponentBtn) kickOpponentBtn.disabled = true;

         if (socket && socket.connected) {
             socket.emit('kick_opponent', { roomId: currentRoomId });
             // Server cavabını ('opponent_left_game' və ya 'game_state_update') gözlə
         } else {
             alert("Serverlə bağlantı yoxdur.");
             if (kickOpponentBtn) kickOpponentBtn.disabled = false;
         }
         setTimeout(() => { // Timeout
             if(kickOpponentBtn?.disabled) { if(kickOpponentBtn) kickOpponentBtn.disabled = false; }
         }, 7000);
    }
}

// --- Hissə 3.6 Sonu ---
// ------------------------------------------------------------------------
// --- Part 4.1: Socket.IO Bağlantısı və Hadisə Dinləyici Çərçivəsi ---
// ------------------------------------------------------------------------

function setupGameSocketConnection(roomIdToJoin) {
    console.log(`[Socket IO 4.1] setupGameSocketConnection çağırıldı. RoomID: ${roomIdToJoin}`);
    if (socket && socket.connected) { socket.disconnect(); }

    if (!roomIdToJoin) {
        console.error("[Socket IO 4.1] Socket bağlantısı üçün Otaq ID təyin edilməyib!");
        hideLoadingOverlay(); alert("Otaq ID tapılmadı.");
         window.location.href = '../lobby/test_odalar.html'; // Lobiyə yönləndir
        return;
    }

    console.log(`[Socket IO 4.1] ${roomIdToJoin} otağı üçün yeni bağlantı qurulur...`);
    showLoadingOverlay('Serverə qoşulunur...');

    // Qoşulacağımız serverin ünvanı (əgər fərqlidirsə)
    // const serverUrl = "http://localhost:10001"; // Məsələn, server_multi.js üçün
    // socket = io(serverUrl, { reconnectionAttempts: 3 }); // Ünvanı göstərə bilərik
    socket = io({ reconnectionAttempts: 3 }); // Eyni origin-dən qoşulduğunu fərz edirik

    socket.on('connect', () => {
        console.log(`[Socket IO 4.1] >>> connect: Oyun serverinə qoşuldu! Socket ID: ${socket.id}`);
        hideLoadingOverlay();
        console.log(`[Socket IO 4.1] <<< emit: 'player_ready_in_room' göndərilir. RoomID: ${roomIdToJoin}`);
        socket.emit('player_ready_in_room', { roomId: roomIdToJoin });
    });

    socket.on('disconnect', (reason) => {
        console.warn(`[Socket IO 4.1] >>> disconnect: Serverlə bağlantı kəsildi! Səbəb: ${reason}`);
        if (gameStatusDisplay) gameStatusDisplay.textContent = 'Bağlantı kəsildi!';
        if (turnIndicator) turnIndicator.textContent = "Offline";
        if(boardElement){ boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';}
        if (playerONameDisplay && isOpponentPresent) playerONameDisplay.textContent += ' (Offline)';
        showLoadingOverlay('Bağlantı bərpa edilir...');
    });

    socket.on('connect_error', (error) => {
        console.error(`[Socket IO 4.1] >>> connect_error: Qoşulma xətası!`, error);
        hideLoadingOverlay();
        if (gameStatusDisplay) gameStatusDisplay.textContent = 'Serverə qoşulmaq mümkün olmadı!';
        if (turnIndicator) turnIndicator.textContent = "Xəta";
        if(boardElement){ boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';}
        alert(`Serverə qoşulmaq mümkün olmadı: ${error.message}. Lobiyə yönləndirilirsiniz.`);
         window.location.href = '../lobby/test_odalar.html';
    });

    // Oyunla bağlı hadisələri dinləmək üçün funksiya (Part 5-də olacaq)
    setupGameEventListeners(socket);

} // setupGameSocketConnection sonu

/**
 * Serverdən gələn oyunla bağlı hadisələri dinləmək üçün listenerları quraşdırır.
 * (Tərifi növbəti hissədə olacaq)
 * @param {object} socketInstance - Aktiv socket bağlantısı.
 */
function setupGameEventListeners(socketInstance) {
    console.log("[Socket IO 4.1] setupGameEventListeners: Oyun hadisə dinləyiciləri quraşdırılır (Multiplayer)...");

    // Köhnə listenerları təmizləmək
    const eventsToRemove = [
        'game_state_update', 'opponent_left_game', 'room_deleted_kick',
        'force_redirect_lobby', 'invalid_move', 'game_error',
        'info_message', 'room_info', 'update_room_settings_result',
        'restart_requested' // Client tərəfdə bu hadisə üçün xüsusi handler
    ];
    eventsToRemove.forEach(event => socketInstance.off(event));
    console.log("[Socket IO 4.1] Köhnə oyun hadisə dinləyiciləri (əgər varsa) silindi.");

    // Yeni listenerlar növbəti hissədə əlavə olunacaq
} // setupGameEventListeners funksiyasının ilkin tərifi

// --- Hissə 4 Sonu ---
// --- Hissə 4 Sonu (setupGameEventListeners funksiyası hələ boşdur!) ---

// document.addEventListener('DOMContentLoaded', () => {
//     ... (Part 1, 2, 3, 4-dən kodlar) ...

    // --------------------------------------------------------------------
    // --- Part 4.2 & 4.3: Socket.IO Hadisə Dinləyiciləri ---
    // --------------------------------------------------------------------
    /**
     * Serverdən gələn oyunla bağlı hadisələri dinləmək üçün listenerları quraşdırır.
     * @param {object} socketInstance - Aktiv socket bağlantısı.
     */
    function setupGameEventListeners(socketInstance) { // Funksiyanın içini doldururuq
        console.log("[Socket IO 4.1] setupGameEventListeners: Oyun hadisə dinləyiciləri quraşdırılır (Multiplayer)...");

        // Köhnə listenerları təmizləmək (Part 4-də edildi)
        const eventsToRemove = [ /* ... (Part 4-dəki siyahı) ... */ 'game_state_update', 'opponent_left_game', 'room_deleted_kick', 'force_redirect_lobby', 'invalid_move', 'game_error', 'info_message', 'room_info', 'update_room_settings_result', 'restart_requested' ];
        eventsToRemove.forEach(event => socketInstance.off(event));
        // console.log("[Socket IO 4.1] Köhnə oyun hadisə dinləyiciləri (əgər varsa) silindi."); // Təkrar loga ehtiyac yoxdur

        // ----- ƏSAS HADİSƏ: 'game_state_update' -----
        socketInstance.on('game_state_update', (newState) => {
            // console.log("[Socket Event 4.2] >>> game_state_update alındı. Status:", newState?.statusMessage);

            if (!newState || typeof newState !== 'object') {
                console.error("[Socket Event 4.2] Keçərsiz gameState alındı!"); return;
            }
            const oldState = currentGameState; // Köhnəni saxlayaq
            currentGameState = newState; // Qlobal state-i yenilə
            isGameOver = newState.isGameOver; // Qlobal isGameOver-u yenilə

            // --- BoardSize uyğunsuzluğunu yoxla (daha etibarlı) ---
            // Yalnız newState-də boardSize varsa və bizimkindən fərqlidirsə dəyişək
            if (newState.boardSize && typeof newState.boardSize === 'number' && newState.boardSize !== boardSize) {
                 console.warn(`[State Update 4.2] Lövhə ölçüsü dəyişdi! Server: ${newState.boardSize}, Client: ${boardSize}. Lövhə yenidən yaradılır.`);
                 boardSize = newState.boardSize;
                 createBoard(); // Lövhəni yenidən yarat
                 // UI update funksiyaları onsuz da aşağıda çağırılır
            } else if (!newState.boardSize && typeof boardSize !== 'number') {
                // Əgər serverdən ölçü gəlmədisə və bizimki də düzgün deyilsə, defaulta qaytar
                console.error("[State Update 4.2] XƏTA: Nə serverdən, nə də clientdən düzgün boardSize yoxdur! Default 3 təyin edilir.");
                boardSize = 3;
                createBoard();
            }

            isOpponentPresent = !!(newState.player1SocketId && newState.player2SocketId); // Rəqib var/yox

            // --- UI Yeniləmələri ---
            updatePlayerInfo();
            updateTurnIndicator();
            const isMyTurnNow = socket && newState.currentPlayerSymbol && newState.currentPlayerSymbol === (newState.player1SocketId === socket.id ? newState.player1Symbol : newState.player2Symbol);
            // updateBoardUI ölçü yoxlamasını özü edəcək
            updateBoardUI(newState.board || [], !!isMyTurnNow, newState.isGameOver, newState.winningCombination || []);
            updateGameStatusAndModals(newState);
            updateHeaderButtonsVisibility(); // Rəqib qoşulduqda/çıxdıqda vacibdir

            // --- Oyun Sonu Effektləri ---
            const justFinished = newState.isGameOver && !oldState?.isGameOver;
            if (justFinished && newState.winnerSymbol && newState.winnerSymbol !== 'draw') {
                triggerShatterEffect(newState.winnerSymbol);
            } else if (!newState.isGameOver) {
                 hideFireworks(); // Oyun davam edirsə effektləri gizlət
            }

            // --- Düymə Vəziyyətləri ---
            if (restartGameBtn) {
                 restartGameBtn.disabled = !(newState.isGameOver && isOpponentPresent && !newState.statusMessage?.includes("təklif"));
            }
            // AI düymələri yoxdur
            if(kickOpponentBtn) kickOpponentBtn.disabled = !(isCurrentUserCreator && isOpponentPresent);
            if(editRoomBtn) editRoomBtn.disabled = !isCurrentUserCreator;


            if (isProcessingMove) { isProcessingMove = false; } // Hərəkət emalını sıfırla

            // console.log("[State Update 4.2] game_state_update emalı bitdi.");
        }); // socketInstance.on('game_state_update', ...) sonu


        // ----- Digər Hadisələr -----
        socketInstance.on('opponent_left_game', (data) => {
            const opponentWhoLeft = data?.username || 'Rəqib';
            console.log(`[Socket Event 4.3] >>> opponent_left_game alındı: ${opponentWhoLeft}`);
            if (gameStatusDisplay) {
                 gameStatusDisplay.textContent = `${escapeHtml(opponentWhoLeft)} oyundan ayrıldı.`;
                 gameStatusDisplay.className = 'game-status waiting';
            }
            isOpponentPresent = false;
            updateHeaderButtonsVisibility();
            if (restartGameBtn) restartGameBtn.disabled = true;
            hideModal(diceRollModal); hideModal(symbolSelectModal);
            // updatePlayerInfo() növbəti game_state_update ilə çağırılacaq
        });

        socketInstance.on('room_deleted_kick', (data) => {
            const message = data?.message || 'Otaq silindi və ya otaqdan çıxarıldınız.';
            console.warn(`[Socket Event 4.3] >>> room_deleted_kick alındı: ${message}`);
            alert(message + "\nLobiyə yönləndirilirsiniz.");
            window.location.href = '../lobby/test_odalar.html';
        });

        socketInstance.on('force_redirect_lobby', (data) => {
            const message = data?.message || 'Otaqla bağlı problem yarandı.';
            console.warn(`[Socket Event 4.3] >>> force_redirect_lobby alındı: ${message}`);
            alert(message + "\nLobiyə yönləndirilirsiniz.");
            window.location.href = '../lobby/test_odalar.html';
        });

        socketInstance.on('invalid_move', (data) => {
            const message = data?.message || 'Keçərsiz hərəkət!';
            console.warn(`[Socket Event 4.3] >>> invalid_move alındı: ${message}`);
            if (gameStatusDisplay) { /* Müvəqqəti mesaj göstər - əvvəlki kod kimi */ }
            if (isProcessingMove) { isProcessingMove = false; }
            if (boardElement) boardElement.style.pointerEvents = 'auto'; // Lövhəni aktivləşdir
        });

        socketInstance.on('game_error', (data) => {
            const message = data?.message || 'Oyunda xəta baş verdi.';
            console.error(`[Socket Event 4.3] >>> game_error alındı: ${message}`);
            if(gameStatusDisplay) gameStatusDisplay.textContent = `XƏTA: ${message}`;
            alert(`Oyunda xəta baş verdi: ${message}`);
            if(boardElement) boardElement.style.pointerEvents = 'none';
            hideModal(editRoomModal); hideModal(diceRollModal); hideModal(symbolSelectModal);
        });

        socketInstance.on('info_message', (data) => {
             const message = data?.message || 'Serverdən məlumat.';
             console.log(`[Socket Event 4.3] >>> info_message alındı: ${message}`);
             // Bunu gameStatus-da müvəqqəti göstərə bilərik
             if (gameStatusDisplay) { /* ... */ }
        });

        socketInstance.on('room_info', (roomInfo) => { // Bu hələ də gələ bilər
             console.log("[Socket Event 4.3] >>> room_info alındı:", roomInfo);
             if(!roomInfo) return;
             currentRoomData = { ...currentRoomData, ...roomInfo }; // Update local data

             if(roomInfo.creatorUsername && loggedInUser?.nickname) {
                 isCurrentUserCreator = (loggedInUser.nickname === roomInfo.creatorUsername);
             }
             isOpponentPresent = !!roomInfo.opponentUsername;
             if (isOpponentPresent && !opponentPlayerName.includes(roomInfo.opponentUsername)) { // Əgər rəqib yeni qoşulubsa
                  opponentPlayerName = roomInfo.opponentUsername;
                  updatePlayerInfo();
             }
             if (roomNameDisplay && roomInfo.name) roomNameDisplay.textContent = `Otaq: ${escapeHtml(roomInfo.name)}`;
             // isPlayingAgainstAI artıq yoxdur
             updateHeaderButtonsVisibility();
        });

         socketInstance.on('update_room_settings_result', (result) => { // Ayar nəticəsi
             console.log("[Socket Event 4.3] >>> update_room_settings_result alındı:", result);
             const msgElement = editRoomModal?.querySelector('#edit-room-message');
             const saveBtn = editRoomModal?.querySelector('#save-room-changes-btn');
             const deleteBtn = editRoomModal?.querySelector('#delete-room-confirm-btn');
             if (!msgElement) return;

             if (result.success) {
                 showMsg(msgElement, result.message || 'Ayarlar yeniləndi!', 'success', 2000);
                 // gameState yeniləməsi onsuz da gələcək, sadəcə modalı bağlayaq
                 setTimeout(() => { hideModal(editRoomModal); }, 1500);
             } else {
                 showMsg(msgElement, result.message || 'Ayarları yeniləmək olmadı.', 'error');
                 if(saveBtn) saveBtn.disabled = false; // Düymələri aktivləşdir
                 if(deleteBtn) deleteBtn.disabled = false;
             }
         });

        // ----- Restart Təklifi Bildirişi -----
        socketInstance.on('restart_requested', (data) => {
            const requester = data?.username || 'Rəqib';
            console.log(`[Socket Event 4.3] >>> restart_requested alındı: Təklif edən=${requester}`);
            if (gameStatusDisplay && currentGameState?.isGameOver) {
                gameStatusDisplay.textContent = `${escapeHtml(requester)} yenidən başlatmağı təklif edir. Qəbul etmək üçün "Yenidən Başlat" düyməsinə basın.`;
                // Restart düyməsini aktiv et (qəbul etmək üçün)
                if(restartGameBtn) restartGameBtn.disabled = false;
            }
        });


        console.log("[Socket IO 4.1] Bütün multiplayer oyun hadisə dinləyiciləri quraşdırıldı.");

    } // setupGameEventListeners funksiyasının sonu


// --- Hissə 4 Sonu ---
// ------------------------------------------------------------------------
// --- Part 5.1: Oyunu Başlatma Funksiyası (Multiplayer üçün sadələşdirilib) ---
// ------------------------------------------------------------------------

    async function initializeGame() {
        console.log("[Client Init 5.1] initializeGame çağırıldı (Multiplayer).");
        showLoadingOverlay('Oyun interfeysi qurulur...');
        try {
            const params = getUrlParams(); // AI yoxlaması olmadan
            currentRoomId = params.roomId;
            const receivedRoomName = params.roomName;
            const initialBoardSize = params.size;

            if (!currentRoomId) throw new Error("Multiplayer oyunu üçün Otaq ID tapılmadı!");

            boardSize = initialBoardSize;
            currentPlayerName = loggedInUser?.nickname || 'Siz';

            if (!playerXNameDisplay || !playerONameDisplay || !roomNameDisplay) throw new Error("initializeGame: Əsas UI elementləri tapılmadı!");

            playerXNameDisplay.textContent = currentPlayerName;
            roomNameDisplay.textContent = `Otaq: ${escapeHtml(receivedRoomName)}`;
            playerONameDisplay.textContent = "Gözlənilir...";

            adjustStylesForBoardSize(boardSize);
            createBoard();

            currentRoomData = { id: currentRoomId, name: receivedRoomName, boardSize: boardSize }; // İlkin məlumatlar

            console.log(`[Client Init 5.1] Multiplayer oyunu (${currentRoomId}) üçün serverə qoşulunur...`);
            updatePlayerInfo();
            updateHeaderButtonsVisibility();
            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Serverə qoşulunur...';

            setupGameSocketConnection(currentRoomId); // Socket bağlantısını qur

            console.log(`[Client Init 5.1] initializeGame: İlkin quraşdırma tamamlandı (Multiplayer).`);

        } catch (initError) {
            console.error("[Client Init 5.1] initializeGame XƏTASI:", initError);
            hideLoadingOverlay();
            if(gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yüklənərkən kritik xəta baş verdi!";
            if(turnIndicator) turnIndicator.textContent = "Xəta";
            alert("Oyun interfeysini qurarkən xəta baş verdi. Lobiyə yönləndirilirsiniz.");
             window.location.href = '../lobby/test_odalar.html';
        }
    } // initializeGame sonu

// --- Hissə 5.1 Sonu ---
// ------------------------------------------------------------------------
// --- Part 5.2: İlkin Autentifikasiya Yoxlaması (IIFE) ---
// ------------------------------------------------------------------------
    (async () => {
        // console.log("[Client Init 5.2] İlkin autentifikasiya yoxlaması başladı.");
        try {
            // console.log("[Client Init 5.2] Serverə /check-auth sorğusu göndərilir...");
            showLoadingOverlay('Sessiya yoxlanılır...');
            const response = await fetch('/check-auth', { credentials: 'include' });
            const data = await response.json();
            if (!response.ok || !data.loggedIn || !data.user) {
                console.error(`[Client Init 5.2] /check-auth xətası və ya giriş edilməyib.`);
                alert("Sessiya tapılmadı və ya etibarsızdır. Giriş edin.");
                window.location.href = '/ANA SEHIFE/login/login.html';
                return;
            }
            loggedInUser = data.user;
            currentPlayerName = loggedInUser.nickname;
            console.log(`[Client Init 5.2] Autentifikasiya uğurlu: ${loggedInUser.nickname}`);
            await initializeGame(); // Oyunu başlat
        } catch (error) {
            console.error("[Client Init 5.2] Autentifikasiya xətası:", error);
            hideLoadingOverlay();
            alert("Sessiya yoxlanılarkən xəta. İnternetinizi yoxlayın.");
             window.location.href = '/ANA SEHIFE/login/login.html';
        }
    })(); // IIFE sonu

    // ------------------------------------------------------------------------
    // --- Part 5.3: Əsas UI Hadisə Dinləyiciləri (AI düymələri olmadan) ---
    // ------------------------------------------------------------------------
    console.log("[Client Init 5.3] Əsas UI hadisə dinləyiciləri əlavə edilir...");

    if (leaveRoomBtn) { leaveRoomBtn.addEventListener('click', () => { if (confirm("Otaqdan çıxmaq istədiyinizə əminsiniz?")) { if (socket?.connected) socket.emit('leave_room'); window.location.href = '../lobby/test_odalar.html'; } }); } else { console.error("leaveRoomBtn tapılmadı!"); }
    if (restartGameBtn) { restartGameBtn.addEventListener('click', handleRestartGame); } else { console.error("restartGameBtn tapılmadı!"); }
    if (editRoomBtn) { editRoomBtn.addEventListener('click', openEditModal); } // else { console.warn("editRoomBtn tapılmadı!"); }
    if (closeEditModalButton) { closeEditModalButton.addEventListener('click', () => hideModal(editRoomModal)); }
    window.addEventListener('click', (event) => { if (event.target == editRoomModal) hideModal(editRoomModal); });
    if (saveRoomChangesBtn) { saveRoomChangesBtn.addEventListener('click', saveRoomChanges); } else { console.error("saveRoomChangesBtn tapılmadı!"); }
    if (deleteRoomConfirmBtn) { deleteRoomConfirmBtn.addEventListener('click', deleteRoom); } else { console.error("deleteRoomConfirmBtn tapılmadı!"); }
    if (kickOpponentBtn) { kickOpponentBtn.addEventListener('click', handleKickOpponent); } // else { console.warn("kickOpponentBtn tapılmadı!"); }
    // AI düymələri üçün listenerlar yoxdur
    if (diceCubeElement) { diceCubeElement.addEventListener('mousedown', handleMouseDown); diceCubeElement.addEventListener('touchstart', handleTouchStart, { passive: false }); } else { console.error("diceCubeElement tapılmadı!"); }
    if (symbolOptionsDiv) { symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => { button.addEventListener('click', handleSymbolChoice); }); } else { console.error("symbolOptionsDiv tapılmadı!"); }

    // Zər sürükləmə üçün qlobal listenerlar
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    console.log("[Client Init 5.3] Bütün əsas UI listenerlarının əlavə edilməsi cəhdi bitdi.");

}); // <<<--- DOMContentLoaded Listener-inin BAĞLANMASI ---<<<

// ------------------------------------------------------------------------
// --- oda_icimulti.js Faylının Sonu ---
// ------------------------------------------------------------------------