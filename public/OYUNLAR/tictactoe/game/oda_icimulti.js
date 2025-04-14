// public/OYUNLAR/tictactoe/game/oda_icimulti.js (v4 - Logs & Restart/Decline)
// ==============================================================
// ===== Part 1/6: DOMContentLoaded, Globals, DOM Elements ======
// ==============================================================

document.addEventListener('DOMContentLoaded', () => {
    // !!! Bütün log mesajları "[OdaIci Client v4-logs]" prefiksi ilə başlayacaq !!!
    console.log("[OdaIci Client v4-logs] DOMContentLoaded - Başladı.");

    // ---- Qlobal Dəyişənlər ----
    console.log("[OdaIci Client v4-logs | Part 1] Qlobal dəyişənlər təyin edilir...");
    let loggedInUser = null;            // Giriş etmiş istifadəçi məlumatları (check-auth ilə gələcək)
    let currentRoomId = null;           // Hazırkı otağın ID-si (URL-dən alınacaq)
    let socket = null;                  // Aktiv Socket.IO bağlantısı
    let currentGameState = {};          // Serverdən gələn ƏN SON oyun vəziyyəti
    let isCurrentUserCreator = false;   // Bu client otağı yaradıb mı?
    let currentRoomData = {};           // Otaq haqqında ümumi məlumatlar

    // --- Oyun Vəziyyəti ilə Bağlı Dəyişənlər ---
    let myPlayerState = null;           // Öz oyunçu vəziyyətimiz
    let opponentPlayerState = null;     // Rəqib oyunçu vəziyyəti
    let isMyTurn = false;               // Sıra məndədirmi?
    let isGameOver = false;             // Oyun bitibmi?

    // --- UI Vəziyyət Bayraqları ---
    let isDiceRolling = false;          // Zər fırlanma animasiyası gedirmi?
    let isProcessingMove = false;       // Hərəkət serverə göndərilib cavab gözlənilirmi?
    let isOpponentPresent = false;      // Rəqib qoşulubmu və disconnect olmayıb?

    // --- Oyun Parametrləri ---
    let boardSize = 3;                  // Default, initializeGame-də dəyişəcək
    let cells = [];                     // Lövhə hüceyrələrinin DOM elementləri massivi

    console.log("[OdaIci Client v4-logs | Part 1] Qlobal dəyişənlər təyin edildi.");

    // ---- DOM Elementləri Referansları ----
    console.log("[OdaIci Client v4-logs | Part 1] DOM elementləri seçilir...");
    const gameLoadingOverlay = document.getElementById('game-loading-overlay');
    const roomNameDisplay = document.getElementById('room-name');
    const boardElement = document.getElementById('game-board');
    const turnIndicator = document.getElementById('turn-indicator');
    const gameStatusDisplay = document.getElementById('game-status'); // Lövhənin altındakı status
    // Oyunçu Panelləri
    const player1Info = document.getElementById('player-x-info');
    const player2Info = document.getElementById('player-o-info');
    const player1SymbolDisplay = document.getElementById('player-x-symbol');
    const player2SymbolDisplay = document.getElementById('player-o-symbol');
    const player1NameDisplay = document.getElementById('player-x-name');
    const player2NameDisplay = document.getElementById('player-o-name');
    // Düymələr
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const editRoomBtn = document.getElementById('edit-room-btn');
    const kickOpponentBtn = document.getElementById('kick-opponent-btn');
    const restartGameBtn = document.getElementById('restart-game-btn');
    const gameActionsDiv = document.querySelector('.game-actions'); // Restart/Decline düymələrinin yeri
    // const declineRestartBtn = null; // Bu dinamik yaradılacaq
    // Effektlər
    const fireworksOverlay = document.getElementById('fireworks-overlay');
    const shatteringTextContainer = document.getElementById('shattering-text-container');
    // Otaq Ayarları Modalı
    const editRoomModal = document.getElementById('edit-room-modal');
    const closeEditModalButton = editRoomModal?.querySelector('.close-button[data-modal-id="edit-room-modal"]');
    const saveRoomChangesBtn = document.getElementById('save-room-changes-btn');
    const deleteRoomConfirmBtn = document.getElementById('delete-room-confirm-btn');
    const editRoomMessage = document.getElementById('edit-room-message');
    // Zər Atma Modalı
    const diceRollModal = document.getElementById('dice-roll-modal');
    const diceInstructions = document.getElementById('dice-instructions');
    const diceScene = document.getElementById('dice-scene');
    const diceCubeElement = document.getElementById('dice-cube');
    const yourRollResultDisplay = document.getElementById('your-roll-result');
    const opponentRollResultDisplay = document.getElementById('opponent-roll-result');
    const yourRollBox = document.getElementById('your-roll-box');
    const opponentRollBox = document.getElementById('opponent-roll-box');
    // Simvol Seçmə Modalı
    const symbolSelectModal = document.getElementById('symbol-select-modal');
    const symbolSelectTitle = document.getElementById('symbol-select-title');
    const symbolSelectMessage = document.getElementById('symbol-select-message');
    const symbolOptionsDiv = symbolSelectModal?.querySelector('.symbol-options');
    const symbolWaitingMessage = document.getElementById('symbol-waiting-message');

    // Əsas elementlərin mövcudluğunu yoxla və logla
    const essentialElements = {
        gameLoadingOverlay, roomNameDisplay, boardElement, turnIndicator, gameStatusDisplay,
        player1Info, player2Info, player1SymbolDisplay, player2SymbolDisplay,
        player1NameDisplay, player2NameDisplay, leaveRoomBtn, restartGameBtn, gameActionsDiv,
        diceRollModal, symbolSelectModal, editRoomModal // editRoomModal əlavə edildi
    };
    let missingElements = false;
    for (const key in essentialElements) {
        if (!essentialElements[key]) {
            console.error(`[OdaIci Client v4-logs | Part 1] KRİTİK XƏTA: DOM Elementi tapılmadı: #${key}`);
            missingElements = true;
        } else {
            // console.log(`[OdaIci Client v4-logs | Part 1] DOM Elementi tapıldı: #${key}`); // Çox detallı log
        }
    }
    if (missingElements) {
        alert("Oyun interfeysini qurarkən kritik xəta baş verdi. Bəzi elementlər tapılmadı. Səhifəni yeniləyin və ya developerə müraciət edin.");
        if (gameLoadingOverlay) gameLoadingOverlay.classList.remove('visible');
        // Skriptin davam etməsinin mənası yoxdur
        return;
    }
    console.log("[OdaIci Client v4-logs | Part 1] Bütün əsas DOM element referansları təyin edildi.");

    // ---- Zar Animasiyası üçün Texniki Dəyişənlər ----
    console.log("[OdaIci Client v4-logs | Part 1] Zar animasiyası dəyişənləri təyin edilir...");
    let currentDiceRotateX = 0; let currentDiceRotateY = 0; let currentDiceRotateZ = 0;
    const diceRotations = {
        1: { x: 0, y: 0 }, 6: { x: 0, y: 180 }, 3: { x: 0, y: 90 },
        4: { x: 0, y: -90 }, 2: { x: -90, y: 0 }, 5: { x: 90, y: 0 }
    };
    let isDragging = false; let dragStartX, dragStartY, previousMouseX, previousMouseY;
    const dragThreshold = 10; const rotateSensitivity = 0.4; let initialCenterZ = -55; // Bu dəyər adjustStylesForBoardSize-da yenilənə bilər
    console.log("[OdaIci Client v4-logs | Part 1] Zar animasiyası dəyişənləri təyin edildi.");

    console.log("[OdaIci Client v4-logs] --- Part 1/6 Tamamlandı ---");
    // ==============================
    // ===== PART 1/6 SONU ==========
    // ==============================

    // --- Növbəti hissələr (Part 2, 3, 4, 5, 6) bu blokun içində davam edəcək ---
    // =====================================================================
    // ===== Part 2/6: Helper Functions & Initial Authentication Setup =====
    // =====================================================================
    console.log("[OdaIci Client v4-logs | Part 2] Yardımçı funksiyalar və ilkin auth qurulumu başlayır.");

    // ---- Yardımçı UI Funksiyaları ----
    const showModal = (modal) => {
        const modalId = modal?.id || 'ID_YOXDUR';
        console.log(`[OdaIci Client v4-logs | UI Helper] showModal çağırıldı: #${modalId}`);
        if (modal && modal instanceof HTMLElement) {
             modal.style.display = 'block';
             console.log(`[OdaIci Client v4-logs | UI Helper] Modal #${modalId} göstərildi.`);
        } else {
             console.warn(`[OdaIci Client v4-logs | UI Helper] showModal: Göstəriləcək modal elementi tapılmadı və ya düzgün deyil:`, modal);
        }
    };

    const hideModal = (modal) => {
         const modalId = modal?.id || 'ID_YOXDUR';
         console.log(`[OdaIci Client v4-logs | UI Helper] hideModal çağırıldı: #${modalId}`);
         if (modal && modal instanceof HTMLElement) {
              modal.style.display = 'none';
              console.log(`[OdaIci Client v4-logs | UI Helper] Modal #${modalId} gizlədildi.`);
         } else {
              // console.warn("[OdaIci Client v4-logs | UI Helper] hideModal: Gizlədiləcək modal elementi tapılmadı: ", modal); // Çox detallı ola bilər
         }
    };

    const showMsg = (el, msg, type = 'info', duration = 4000) => {
        const elementId = el?.id || 'ID_YOXDUR';
        console.log(`[OdaIci Client v4-logs | UI Helper] showMsg çağırıldı: Element ID=${elementId}, Mesaj="${msg}", Type=${type}, Duration=${duration}`);
        if (el && el instanceof HTMLElement) {
             el.textContent = msg;
             el.className = 'message'; // Əvvəlki classları təmizlə
             el.classList.add(type);   // Yeni type classını əlavə et
             console.log(`[OdaIci Client v4-logs | UI Helper] Mesaj göstərildi: Element ID=${elementId}, Class=${el.className}`);
             if (el.timeoutId) {
                 clearTimeout(el.timeoutId);
                 console.log(`[OdaIci Client v4-logs | UI Helper] Köhnə mesaj taymeri (ID=${elementId}) təmizləndi.`);
             }
             if (duration > 0) {
                 el.timeoutId = setTimeout(() => {
                     if (el.textContent === msg) { // Əgər mesaj hələ də eynidirsə sil
                          console.log(`[OdaIci Client v4-logs | UI Helper] Mesaj taymeri (ID=${elementId}) bitdi, mesaj silinir.`);
                          el.textContent = '';
                          el.classList.remove(type);
                     } else {
                         console.log(`[OdaIci Client v4-logs | UI Helper] Mesaj taymeri (ID=${elementId}) bitdi, amma mesaj dəyişib, silinmədi.`);
                     }
                 }, duration);
                 console.log(`[OdaIci Client v4-logs | UI Helper] Yeni mesaj taymeri (ID=${elementId}) quruldu: ${duration}ms`);
             }
        } else {
             console.error(`[OdaIci Client v4-logs | UI Helper] showMsg: Mesaj göstəriləcək element tapılmadı! Element=${el}, Mesaj="${msg}"`);
        }
    };

    function escapeHtml(unsafe) {
        // console.log(`[OdaIci Client v4-logs | UI Helper] escapeHtml çağırıldı: Input='${unsafe}'`); // Çox detallı ola bilər
        if (typeof unsafe !== 'string') return String(unsafe);
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    };
    console.log("[OdaIci Client v4-logs | Part 2] Yardımçı UI funksiyaları təyin edildi.");

    // ---- URL Parametrlərini Alma Funksiyası ----
    function getUrlParams() {
        console.log("[OdaIci Client v4-logs | Part 2] getUrlParams funksiyası çağırıldı.");
        const params = new URLSearchParams(window.location.search);
        const roomIdParam = params.get('roomId');
        const roomNameParam = decodeURIComponent(params.get('roomName') || 'Adsız Otaq');
        const sizeParam = parseInt(params.get('size') || '3', 10);
        const validatedSize = isNaN(sizeParam) ? 3 : Math.max(3, Math.min(6, sizeParam));

        const result = {
            roomId: roomIdParam,
            roomName: roomNameParam,
            size: validatedSize
        };
        if (!roomIdParam) {
            console.error("[OdaIci Client v4-logs | Part 2] KRİTİK: URL-də 'roomId' parametri tapılmadı!");
        }
        console.log("[OdaIci Client v4-logs | Part 2] Alınan URL parametrləri:", result);
        return result;
    }

    // ---- Yükləmə Ekranı Funksiyaları ----
    function showLoadingOverlay(text = 'Yüklənir...') {
        console.log(`[OdaIci Client v4-logs | Part 2] showLoadingOverlay çağırıldı: Text="${text}"`);
        if (gameLoadingOverlay) {
            const loadingTextElement = gameLoadingOverlay.querySelector('.game-loading-text');
            if (loadingTextElement) loadingTextElement.textContent = text;
            gameLoadingOverlay.classList.add('visible');
            console.log("[OdaIci Client v4-logs | Part 2] Yükləmə ekranı göstərildi.");
        } else {
            console.error("[OdaIci Client v4-logs | Part 2] gameLoadingOverlay elementi DOM-da tapılmadı!");
        }
    };
    function hideLoadingOverlay() {
        console.log("[OdaIci Client v4-logs | Part 2] hideLoadingOverlay çağırıldı.");
        if (gameLoadingOverlay) {
            gameLoadingOverlay.classList.remove('visible');
            console.log("[OdaIci Client v4-logs | Part 2] Yükləmə ekranı gizlədildi.");
        } else {
             console.warn("[OdaIci Client v4-logs | Part 2] hideLoadingOverlay: gameLoadingOverlay elementi tapılmadı.");
        }
    };
    console.log("[OdaIci Client v4-logs | Part 2] Yükləmə ekranı funksiyaları təyin edildi.");


    // ***********************************************************
    // ===== İlkin Autentifikasiya Yoxlaması (IIFE) =====
    // ***********************************************************
    (async () => {
        console.log("[OdaIci Client v4-logs | Part 2] Autentifikasiya yoxlaması (IIFE) BAŞLADI.");
        try {
            console.log("[OdaIci Client v4-logs | Part 2] Yükləmə ekranı göstərilir (Sessiya yoxlanılır)...");
            showLoadingOverlay('Sessiya yoxlanılır...');

            console.log("[OdaIci Client v4-logs | Part 2] /check-auth sorğusu göndərilir...");
            const response = await fetch('/check-auth', { credentials: 'include' }); // Cookie göndərmək üçün vacibdir
            console.log(`[OdaIci Client v4-logs | Part 2] /check-auth cavabı alındı. Status: ${response.status}`);

            let data;
            try {
                 data = await response.json();
                 console.log("[OdaIci Client v4-logs | Part 2] /check-auth JSON data:", data);
            } catch (jsonError) {
                 console.error("[OdaIci Client v4-logs | Part 2] /check-auth cavabı JSON deyil!", jsonError);
                 const responseText = await response.text();
                 console.error("[OdaIci Client v4-logs | Part 2] Server cavabı (text):", responseText);
                 throw new Error(`Serverdən gözlənilməz cavab alındı (Status: ${response.status})`);
            }


            if (!response.ok || !data.loggedIn || !data.user) {
                console.warn(`[OdaIci Client v4-logs | Part 2] Auth uğursuz və ya giriş edilməyib. Status: ${response.status}, LoggedIn: ${data.loggedIn}`);
                hideLoadingOverlay();
                alert("Oyun otağına daxil olmaq üçün giriş etməlisiniz. Giriş səhifəsinə yönləndirilirsiniz.");
                window.location.href = '/ana_sehife/login/login.html';
                return; // Yönləndirmədən sonra davam etmə
            }

            // Autentifikasiya uğurlu
            loggedInUser = data.user;
            console.log(`[OdaIci Client v4-logs | Part 2] Autentifikasiya UĞURLU: User=${loggedInUser.nickname} (ID: ${loggedInUser.id})`);

            console.log("[OdaIci Client v4-logs | Part 2] initializeGame() çağırılır...");
            // initializeGame() funksiyası Part 6-da təyin olunacaq
            await initializeGame(); // Oyunu başlatmağa başla
            console.log("[OdaIci Client v4-logs | Part 2] initializeGame() çağırışı bitdi (proses davam edir).");

        } catch (error) {
             console.error("[OdaIci Client v4-logs | Part 2] Autentifikasiya və ya ilkin başlatma xətası (IIFE CATCH):", error);
             hideLoadingOverlay();
             alert(`Sessiya yoxlanılarkən və ya oyun başladılarkən xəta baş verdi: ${error.message}\nİnternet bağlantınızı yoxlayın və ya giriş səhifəsinə yönləndirilirsiniz.`);
             // Giriş səhifəsinə yönləndirək ki, istifadəçi təkrar cəhd edə bilsin
             window.location.href = '/ana_sehife/login/login.html';
        } finally {
            console.log("[OdaIci Client v4-logs | Part 2] Autentifikasiya yoxlaması (IIFE) BİTDİ.");
        }
    })(); // IIFE sonu
    // ***********************************************************

    console.log("[OdaIci Client v4-logs] --- Part 2/6 Tamamlandı ---");
    // ==============================
    // ===== PART 2/6 SONU ==========
    // ==============================

     // --- Növbəti hissələr (Part 3, 4, 5, 6) bu blokun içində davam edəcək ---
     // =======================================================
    // ===== Part 3/6: UI Rendering Functions ==============
    // =======================================================
    console.log("[OdaIci Client v4-logs | Part 3] UI rendering funksiyaları təyin edilir...");

    // ---- Lövhə Ölçüsünə Görə Stilləri Tənzimləmə ----
    /**
     * Lövhə ölçüsünə uyğun CSS dəyişənlərini tənzimləyir.
     * @param {number} size - Lövhənin ölçüsü (3-6).
     */
    function adjustStylesForBoardSize(size) {
        console.log(`[OdaIci Client v4-logs | UI Render] adjustStylesForBoardSize çağırıldı. Ölçü: ${size}`);
        if (typeof size !== 'number' || size < 3 || size > 6) {
             console.warn(`[OdaIci Client v4-logs | UI Render] adjustStylesForBoardSize: Keçərsiz ölçü (${size}). Default 3 istifadə olunur.`);
             size = 3;
        }
        let cellSizeVar = '--cell-size-large-dynamic'; // 3x3 üçün default
        if (size === 4) cellSizeVar = '--cell-size-medium-dynamic';
        else if (size >= 5) cellSizeVar = '--cell-size-small-dynamic';

        document.documentElement.style.setProperty('--current-cell-size', `var(${cellSizeVar})`);
        document.documentElement.style.setProperty('--current-font-size', `calc(var(${cellSizeVar}) * 0.6)`);
        document.documentElement.style.setProperty('--board-size', size);
        console.log(`[OdaIci Client v4-logs | UI Render] CSS dəyişənləri təyin edildi: --current-cell-size=${cellSizeVar}, --board-size=${size}`);

        // Zarın mərkəzini hesabla (əgər CSS-dən oxuna bilirsə)
        try {
             const diceSizeValue = getComputedStyle(document.documentElement).getPropertyValue('--dice-size').trim();
             if (diceSizeValue) initialCenterZ = parseFloat(diceSizeValue.replace('px','')) / -2; else initialCenterZ = -55;
             console.log(`[OdaIci Client v4-logs | UI Render] Zar üçün initialCenterZ hesablandı: ${initialCenterZ}`);
        } catch(e) {
             console.warn("[OdaIci Client v4-logs | UI Render] Zar üçün --dice-size CSS dəyişəni oxuna bilmədi. Default istifadə olunur.");
             initialCenterZ = -55;
        }
        console.log(`[OdaIci Client v4-logs | UI Render] Lövhə ölçüsü ${size}x${size} üçün stillər tənzimləndi.`);
    };

    // ---- HTML Lövhəsini Yaratma ----
    /**
     * HTML-də oyun lövhəsini qlobal `boardSize`-a əsasən yaradır.
     */
    function createBoard() {
        console.log(`[OdaIci Client v4-logs | UI Render] createBoard çağırıldı. Mövcud boardSize: ${boardSize}`);
        if (!boardElement) { console.error("[OdaIci Client v4-logs | UI Render] createBoard: boardElement tapılmadı!"); return; }
        if (typeof boardSize !== 'number' || isNaN(boardSize) || boardSize < 3 || boardSize > 6) {
             console.error(`[OdaIci Client v4-logs | UI Render] createBoard: Keçərsiz qlobal boardSize (${boardSize})! Default 3 təyin edilir.`);
             boardSize = 3;
        }

        const cellCount = boardSize * boardSize;
        console.log(`[OdaIci Client v4-logs | UI Render] createBoard: ${boardSize}x${boardSize} (${cellCount} hüceyrə) lövhə yaradılır...`);
        boardElement.innerHTML = ''; // Köhnə lövhəni təmizlə
        cells = []; // Hüceyrə massivini sıfırla

        for (let i = 0; i < cellCount; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.index = i;
            cell.style.cursor = 'not-allowed'; // Başlanğıcda klikləmək olmur
            cell.addEventListener('click', handleCellClick); // Klik dinləyicisi (Part 4-də təyin olunacaq)
            boardElement.appendChild(cell);
            cells.push(cell);
        }
        console.log(`[OdaIci Client v4-logs | UI Render] createBoard: ${cells.length} hüceyrə yaradıldı və listenerlar əlavə edildi.`);
        adjustStylesForBoardSize(boardSize); // Stilləri yeni ölçüyə uyğunlaşdır
    };

    // ---- Lövhənin Görünüşünü Yeniləmə ----
    /**
     * Serverdən gələn `gameState`-ə əsasən lövhənin görünüşünü yeniləyir.
     * @param {string[]} boardState - Lövhə vəziyyəti ('', 'X', 'O').
     * @param {boolean} canPlayerMove - Hazırkı client hərəkət edə bilərmi?
     * @param {boolean} isGameFinished - Oyun bitibmi?
     * @param {number[]} winningCombo - Qazanan xəttin indeksləri.
     */
    function updateBoardUI(boardState, canPlayerMove, isGameFinished, winningCombo = []) {
        // console.log(`[OdaIci Client v4-logs | UI Render] updateBoardUI çağırıldı. canMove=${canPlayerMove}, finished=${isGameFinished}`); // Çox tez-tez çağırıla bilər
        if (!boardElement) { console.error("[OdaIci Client v4-logs | UI Render] updateBoardUI: boardElement tapılmadı!"); return; }
        if (!Array.isArray(cells) || !Array.isArray(boardState) || cells.length !== boardState.length) {
            console.error(`[OdaIci Client v4-logs | UI Render] updateBoardUI XƏTA: Lövhə ölçüsü uyğunsuzluğu! Server: ${boardState?.length ?? 'N/A'}, Client: ${cells?.length ?? 'N/A'}. Lövhə yenidən yaradılır...`);
            const serverBoardSize = currentGameState?.boardSize;
            if (serverBoardSize && typeof serverBoardSize === 'number' && serverBoardSize >= 3 && serverBoardSize <= 6) {
                 boardSize = serverBoardSize;
                 console.log(`[OdaIci Client v4-logs | UI Render] boardSize serverdən alınan (${boardSize}) ilə yeniləndi.`);
            } else {
                boardSize = 3; // Fallback
                console.warn(`[OdaIci Client v4-logs | UI Render] Serverdən etibarlı boardSize alınmadı, 3 təyin edildi.`);
            }
            createBoard(); // Lövhəni sıfırdan yarat
            // Bu funksiyadan çıxaq, çünki yeni yaradılan lövhənin yenilənməsinə ehtiyac yoxdur hələlik
            return;
        }

        // console.log("[OdaIci Client v4-logs | UI Render] Hüceyrələr yenilənir...");
        cells.forEach((cell, index) => {
            if (!cell) return; // Ehtiyat üçün
            const serverMark = boardState[index] || '';

            // 1. Məzmunu (X/O) və Classları Yenilə
            if (cell.textContent !== serverMark) {
                 // console.log(`[OdaIci Client v4-logs | UI Render] Cell ${index} content değişti: '${cell.textContent}' -> '${serverMark}'`); // Çox detallı
                 cell.textContent = serverMark;
                 cell.classList.remove('X', 'O');
                 if (serverMark === 'X') cell.classList.add('X');
                 else if (serverMark === 'O') cell.classList.add('O');
            }

            // 2. Klikləmə İmkanını (Cursor) Yenilə
            const canClickThisCell = serverMark === '' && !isGameFinished && canPlayerMove;
            const expectedCursor = canClickThisCell ? 'pointer' : 'not-allowed';
            if (cell.style.cursor !== expectedCursor) {
                // console.log(`[OdaIci Client v4-logs | UI Render] Cell ${index} cursor değişti: '${cell.style.cursor}' -> '${expectedCursor}'`); // Çox detallı
                cell.style.cursor = expectedCursor;
            }

            // 3. Qazanma Xəttini İşarələ/Təmizlə
            const hasWinningClass = cell.classList.contains('winning');
            const shouldHaveWinningClass = isGameFinished && winningCombo.includes(index);
            if (hasWinningClass !== shouldHaveWinningClass) {
                 // console.log(`[OdaIci Client v4-logs | UI Render] Cell ${index} winning class değişti: ${hasWinningClass} -> ${shouldHaveWinningClass}`); // Çox detallı
                cell.classList.toggle('winning', shouldHaveWinningClass);
            }
        });

        // Lövhənin ümumi görünüşü
        boardElement.style.opacity = isGameFinished ? '0.7' : '1';
        boardElement.style.pointerEvents = (isGameFinished || !canPlayerMove) ? 'none' : 'auto';
        // console.log(`[OdaIci Client v4-logs | UI Render] Lövhə opacity=${boardElement.style.opacity}, pointerEvents=${boardElement.style.pointerEvents}`);
    };

    // ---- Oyunçu Məlumat Panellərini Yeniləmə ----
    function updatePlayerInfo() {
        console.log("[OdaIci Client v4-logs | UI Render] updatePlayerInfo çağırıldı.");
        if (!player1Info || !player2Info || !player1SymbolDisplay || !player2SymbolDisplay || !player1NameDisplay || !player2NameDisplay) {
            console.error("[OdaIci Client v4-logs | UI Render] updatePlayerInfo: Oyunçu paneli elementlərindən biri tapılmadı!");
            return;
        }
        if (!myPlayerState || !opponentPlayerState) {
             console.warn("[OdaIci Client v4-logs | UI Render] updatePlayerInfo: myPlayerState və ya opponentPlayerState hələ təyin edilməyib.");
             // Hələlik default dəyərləri göstərək
              player1SymbolDisplay.textContent = '?';
              player1NameDisplay.textContent = loggedInUser?.nickname || 'Siz (?)';
              player1Info.className = 'player-info player-unknown';
              player1Info.classList.remove('disconnected', 'active-player');
              player2SymbolDisplay.textContent = '?';
              player2NameDisplay.textContent = 'Rəqib (?)';
              player2Info.className = 'player-info player-unknown';
              player2Info.classList.remove('disconnected', 'active-player');
             return;
        }

        const state = currentGameState; // Ən son state istifadə edilir

        const mySymbol = myPlayerState.symbol || '?';
        const myName = myPlayerState.username || loggedInUser?.nickname || 'Siz';
        const myIsDisconnected = myPlayerState.isDisconnected || false;

        const opponentSymbol = opponentPlayerState.symbol || '?';
        const opponentName = opponentPlayerState.username || 'Rəqib';
        const opponentIsDisconnected = opponentPlayerState.isDisconnected || false;

        console.log(`[OdaIci Client v4-logs | UI Render] updatePlayerInfo: Mən=${myName}(${mySymbol})${myIsDisconnected?' [DC]':''}, Rəqib=${opponentName}(${opponentSymbol})${opponentIsDisconnected?' [DC]':''}`);

        // Mənim Panelim
        player1SymbolDisplay.textContent = mySymbol;
        player1NameDisplay.textContent = escapeHtml(myName) + (myIsDisconnected ? ' (Gözlənilir...)' : ''); // Mesajı dəyişək
        player1Info.className = `player-info player-${mySymbol.toLowerCase() || 'unknown'}`; // Class adını kiçik hərflə
        player1Info.classList.toggle('disconnected', myIsDisconnected);

        // Rəqibin Paneli
        player2SymbolDisplay.textContent = opponentSymbol;
        player2NameDisplay.textContent = escapeHtml(opponentName) + (opponentIsDisconnected ? ' (Gözlənilir...)' : ''); // Mesajı dəyişək
        player2Info.className = `player-info player-${opponentSymbol.toLowerCase() || 'unknown'}`; // Class adını kiçik hərflə
        player2Info.classList.toggle('disconnected', opponentIsDisconnected);

        // Aktiv Oyunçu Vurğusu
        const currentPlayerSymbol = state?.currentPlayerSymbol;
        const gameIsActive = state?.gamePhase === 'playing' && !state.isGameOver;

        const isP1Active = gameIsActive && currentPlayerSymbol === mySymbol && !myIsDisconnected;
        const isP2Active = gameIsActive && currentPlayerSymbol === opponentSymbol && !opponentIsDisconnected;

        player1Info.classList.toggle('active-player', isP1Active);
        player2Info.classList.toggle('active-player', isP2Active);
        console.log(`[OdaIci Client v4-logs | UI Render] updatePlayerInfo: Active Player: ${isP1Active ? 'Mən' : (isP2Active ? 'Rəqib' : 'Heç kim')}`);
    };

    // ---- Sıra Göstəricisini Yeniləmə ----
    function updateTurnIndicator() {
        console.log("[OdaIci Client v4-logs | UI Render] updateTurnIndicator çağırıldı.");
        if (!turnIndicator || !currentGameState || !currentGameState.gamePhase) {
             console.warn("[OdaIci Client v4-logs | UI Render] updateTurnIndicator: Göstərici elementi və ya gameState tapılmadı/tam deyil.");
             if(turnIndicator) turnIndicator.textContent = "Vəziyyət yüklənir...";
             return;
        }

        const state = currentGameState;
        let displayText = "Gözlənilir..."; // Default

        // Oyun mərhələsinə görə mətni təyin et (əvvəlki kodla eyni məntiq)
        switch (state.gamePhase) {
            case 'waiting': displayText = state.statusMessage || "Rəqib gözlənilir..."; break;
            case 'dice_roll': displayText = state.statusMessage || "Zər atılır..."; break;
            case 'symbol_select': displayText = state.statusMessage || "Simvol seçilir..."; break;
            case 'playing':
                 if (state.currentPlayerSymbol) {
                    let turnPlayerName = '';
                    // Düzgün oyunçu adını tap (myPlayerState və opponentPlayerState istifadə edərək)
                    if (myPlayerState?.symbol === state.currentPlayerSymbol && !myPlayerState?.isDisconnected) {
                         turnPlayerName = myPlayerState.username || 'Siz';
                    } else if (opponentPlayerState?.symbol === state.currentPlayerSymbol && !opponentPlayerState?.isDisconnected) {
                         turnPlayerName = opponentPlayerState.username || 'Rəqib';
                    }

                    if (isMyTurn && !myPlayerState?.isDisconnected) {
                         displayText = `Sıra Sizdə (${state.currentPlayerSymbol})`;
                    } else if (turnPlayerName) {
                         displayText = `Sıra: ${escapeHtml(turnPlayerName)} (${state.currentPlayerSymbol})`;
                    } else {
                         // Oyunçu tapılmadısa (məs. disconnect olubsa)
                         if(opponentPlayerState?.isDisconnected && state.currentPlayerSymbol === opponentPlayerState?.symbol){
                              displayText = `${escapeHtml(opponentPlayerState?.username || 'Rəqib')} ayrıldı...`;
                         } else if (myPlayerState?.isDisconnected && state.currentPlayerSymbol === myPlayerState?.symbol) {
                              // Bu hal normalda olmamalıdır, çünki disconnect olanın sırası olmaz
                              displayText = `Sıra: ${escapeHtml(myPlayerState?.username || 'Siz')} (Gözlənilir...)`;
                         } else {
                               displayText = `Sıra: (?) (${state.currentPlayerSymbol})`; // Naməlum hal
                         }
                    }
                 } else { displayText = "Oyun davam edir..."; }
                break;
            case 'game_over':
                 if (state.winnerSymbol === 'draw') { displayText = "Oyun Bərabərə!"; }
                 else if (state.winnerSymbol) {
                    let winnerName = '?';
                    if (myPlayerState?.symbol === state.winnerSymbol) winnerName = myPlayerState.username || 'Siz';
                    else if (opponentPlayerState?.symbol === state.winnerSymbol) winnerName = opponentPlayerState.username || 'Rəqib';
                    displayText = (myPlayerState?.symbol === state.winnerSymbol) ? "Siz Qazandınız!" : `${escapeHtml(winnerName)} Qazandı!`;
                 } else { displayText = state.statusMessage || "Oyun Bitdi"; }
                break;
            default: displayText = state.statusMessage || "Vəziyyət naməlumdur...";
        }

        console.log(`[OdaIci Client v4-logs | UI Render] updateTurnIndicator: Mətn='${displayText}', Phase='${state.gamePhase}'`);
        turnIndicator.textContent = displayText;
    }

    // ---- Başlıq Düymələrinin Görünüşü ----
    function updateHeaderButtonsVisibility() {
        console.log("[OdaIci Client v4-logs | UI Render] updateHeaderButtonsVisibility çağırıldı.");
        // isOpponentPresent dəyərini yenilə
        isOpponentPresent = !!(opponentPlayerState?.socketId && !opponentPlayerState.isDisconnected);
        console.log(`[OdaIci Client v4-logs | UI Render] isOpponentPresent=${isOpponentPresent}, isCurrentUserCreator=${isCurrentUserCreator}`);
        const showEdit = isCurrentUserCreator;
        const showKick = isCurrentUserCreator && isOpponentPresent;

        if (editRoomBtn) {
            editRoomBtn.style.display = showEdit ? 'inline-flex' : 'none';
            console.log(`[OdaIci Client v4-logs | UI Render] Edit düyməsi göstərilir: ${showEdit}`);
        }
        if (kickOpponentBtn) {
            kickOpponentBtn.style.display = showKick ? 'inline-flex' : 'none';
             console.log(`[OdaIci Client v4-logs | UI Render] Kick düyməsi göstərilir: ${showKick}`);
        }
    };

    // ---- Oyun Statusu və Modalları Yeniləmə ----
    function updateGameStatusAndModals() {
        console.log("[OdaIci Client v4-logs | UI Render] updateGameStatusAndModals çağırıldı.");
        if (!currentGameState || typeof currentGameState !== 'object') {
             console.error("[OdaIci Client v4-logs | UI Render] updateGameStatusAndModals: currentGameState mövcud deyil!");
             if (gameStatusDisplay) gameStatusDisplay.textContent = "Oyun vəziyyəti alınmadı!";
             hideModal(diceRollModal); hideModal(symbolSelectModal);
             return;
        }
        const state = currentGameState;
        console.log(`[OdaIci Client v4-logs | UI Render] updateGameStatusAndModals: Phase=${state.gamePhase}, StatusMsg='${state.statusMessage}'`);

        // --- Əsas Status Mesajı (Lövhə altı) ---
        if (gameStatusDisplay) {
            let newStatusText = state.statusMessage || "Vəziyyət yenilənir...";
            if (state.gamePhase === 'game_over') { /* ... qalib/bərabərlik mesajı ... */ if (state.winnerSymbol === 'draw') newStatusText = "Oyun Bərabərə!"; else if (state.winnerSymbol) { const winnerName = (myPlayerState?.symbol === state.winnerSymbol) ? (myPlayerState.username || 'Siz') : (opponentPlayerState?.username || state.winnerSymbol); newStatusText = `${escapeHtml(winnerName)} Qazandı!`; } else { newStatusText = "Oyun Bitdi."; } }
            if (gameStatusDisplay.textContent !== newStatusText) { gameStatusDisplay.textContent = newStatusText; console.log(`[OdaIci Client v4-logs | UI Render] gameStatusDisplay yeniləndi: '${newStatusText}'`); }
            gameStatusDisplay.className = 'game-status'; // Classları sıfırla
            if (state.gamePhase === 'game_over') { if (state.winnerSymbol && state.winnerSymbol !== 'draw') gameStatusDisplay.classList.add('win'); else if (state.winnerSymbol === 'draw') gameStatusDisplay.classList.add('draw'); }
            else if (state.gamePhase === 'waiting') { gameStatusDisplay.classList.add('waiting'); }
            if (state.statusMessage?.includes("ayrıldı") || state.statusMessage?.includes("Gözlənilir")) { gameStatusDisplay.classList.add('disconnected-status'); }
        } else { console.error("[OdaIci Client v4-logs | UI Render] gameStatusDisplay elementi tapılmadı!"); }

        // --- Zər Atma Modalı ---
        if (state.gamePhase === 'dice_roll' && !state.isGameOver) {
             console.log("[OdaIci Client v4-logs | UI Render] Zər atma modalı göstərilir.");
             /* ... (modalı göstərmə, təlimatları, nəticələri və qutu stillərini yeniləmə kodu - əvvəlki kimi) ... */
             if(diceInstructions) { const isTie = state.statusMessage?.includes("Bərabərlik!"); const myRoll = myPlayerState?.roll; const opponentRoll = opponentPlayerState?.roll; let instructionText = state.statusMessage || 'Zər atın...'; let waiting = false; if (!isTie) { if (myRoll !== null && opponentRoll === null) { instructionText = `${opponentPlayerState?.username || 'Rəqib'} gözlənilir...`; waiting = true; } else if (myRoll === null && opponentRoll !== null) { instructionText = 'Zər atmaq növbəsi sizdədir.'; } else if (myRoll === null && opponentRoll === null) { instructionText = 'İlk zəri atmaq üçün klikləyin/sürükləyin.'; } } diceInstructions.textContent = instructionText; diceInstructions.className = 'instructions'; if (waiting) diceInstructions.classList.add('waiting'); if (instructionText.includes("Bərabərlik!")) diceInstructions.classList.add('tie-instruction');}
             if (yourRollResultDisplay) yourRollResultDisplay.textContent = myPlayerState?.roll ?? '?';
             if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = opponentPlayerState?.roll ?? '?';
             const isTie = state.statusMessage?.includes("Bərabərlik!"); if(yourRollBox) { yourRollBox.className='result-box'; if (isTie) yourRollBox.classList.add('tie'); else if (myPlayerState?.roll > opponentPlayerState?.roll) yourRollBox.classList.add('winner'); } if(opponentRollBox) { opponentRollBox.className='result-box'; if (isTie) opponentRollBox.classList.add('tie'); else if (opponentPlayerState?.roll > myPlayerState?.roll) opponentRollBox.classList.add('winner'); }
             const canIRoll = !isDiceRolling && (myPlayerState?.roll === null || state.statusMessage?.includes("Bərabərlik!"));
             if(diceCubeElement) { diceCubeElement.style.cursor = canIRoll ? 'grab' : 'not-allowed'; }
             showModal(diceRollModal);
        } else {
             // console.log("[OdaIci Client v4-logs | UI Render] Zər atma modalı gizlədilir (əgər açıq idisə).");
             hideModal(diceRollModal);
        }

        // --- Simvol Seçmə Modalı ---
        if (state.gamePhase === 'symbol_select' && !state.isGameOver) {
             console.log("[OdaIci Client v4-logs | UI Render] Simvol seçmə modalı göstərilir.");
             /* ... (modalı göstərmə, kimin seçdiyini təyin etmə, düymələri aktiv/deaktiv etmə - əvvəlki kimi) ... */
             const amIPicker = socket && state.symbolPickerSocketId === socket.id; const pickerName = (state.player1?.socketId === state.symbolPickerSocketId) ? state.player1.username : state.player2?.username; if (symbolSelectTitle) symbolSelectTitle.textContent = amIPicker ? "Simvol Seçin" : "Simvol Seçilir"; if (symbolSelectMessage) symbolSelectMessage.textContent = amIPicker ? "Oyuna başlamaq üçün simvolunuzu seçin:" : `${escapeHtml(pickerName || '?')} simvol seçir...`; if (symbolOptionsDiv) { symbolOptionsDiv.style.display = amIPicker ? 'flex' : 'none'; symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => { button.disabled = !amIPicker; }); } if (symbolWaitingMessage) { symbolWaitingMessage.style.display = amIPicker ? 'none' : 'block'; if (!amIPicker) { symbolWaitingMessage.textContent = `${escapeHtml(pickerName || '?')} simvol seçir...`; } }
             showModal(symbolSelectModal);
        } else {
             // console.log("[OdaIci Client v4-logs | UI Render] Simvol seçmə modalı gizlədilir (əgər açıq idisə).");
             hideModal(symbolSelectModal);
        }
    } // updateGameStatusAndModals sonu

    // ---- Oyun Sonu Effektləri ----
    function triggerShatterEffect(winnerMark) {
        console.log(`[OdaIci Client v4-logs | Effects] triggerShatterEffect çağırıldı. Qalib: ${winnerMark}`);
        /* ... (Kod əvvəlki kimi) ... */
        if (!fireworksOverlay || !shatteringTextContainer || !winnerMark || winnerMark === 'draw' || fireworksOverlay.classList.contains('visible')) { console.log("[OdaIci Client v4-logs | Effects] Shatter effekti göstərilmir (şərtlər ödənmir)."); return; }
        clearShatteringText();
        const isClientWinner = myPlayerState?.symbol === winnerMark;
        let winnerName = isClientWinner ? "Siz" : (opponentPlayerState?.username || winnerMark);
        const text = isClientWinner ? "Siz Qazandınız!" : `${escapeHtml(winnerName)} Qazandı!`;
        console.log(`[OdaIci Client v4-logs | Effects] Shatter text: "${text}"`);
        const chars = text.split(''); chars.forEach((char, index) => { const span = document.createElement('span'); span.textContent = char === ' ' ? '\u00A0' : char; span.classList.add('shatter-char'); span.style.setProperty('--char-index', index); span.style.setProperty('--tx', '0px'); span.style.setProperty('--ty', '0px'); span.style.setProperty('--tz', '0px'); span.style.setProperty('--rot', '0deg'); shatteringTextContainer.appendChild(span); }); fireworksOverlay.classList.add('visible'); shatteringTextContainer.style.opacity = '1';
        setTimeout(() => { const spans = shatteringTextContainer.querySelectorAll('.shatter-char'); let duration = 3000, distance = 170; try { duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-duration').replace('s',''))*1000||3000; distance = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-distance').replace('px',''))||170; } catch(e){ console.warn("[Effects] Shatter CSS dəyişənləri oxuna bilmədi."); } console.log(`[OdaIci Client v4-logs | Effects] Shatter animasiyası başladılır (Duration: ${duration}ms, Distance: ${distance}px).`); spans.forEach((span) => { const angle = Math.random() * 360; const randDist = Math.random() * distance; const tx = Math.cos(angle * Math.PI / 180) * randDist; const ty = Math.sin(angle * Math.PI / 180) * randDist; const tz = (Math.random() - 0.5) * distance * 0.6; const rot = (Math.random() - 0.5) * 720; const delay = Math.random() * 0.2; span.style.setProperty('--tx',`${tx}px`); span.style.setProperty('--ty',`${ty}px`); span.style.setProperty('--tz',`${tz}px`); span.style.setProperty('--rot',`${rot}deg`); span.style.animationDelay = `${delay}s`; span.classList.add('animate'); }); setTimeout(hideFireworks, duration + 500); }, 100);
    }
    function hideFireworks() {
        console.log("[OdaIci Client v4-logs | Effects] hideFireworks çağırıldı.");
        if (fireworksOverlay) fireworksOverlay.classList.remove('visible');
        if (shatteringTextContainer) { shatteringTextContainer.style.opacity = '0'; setTimeout(clearShatteringText, 500); }
    }
    function clearShatteringText() {
        // console.log("[OdaIci Client v4-logs | Effects] clearShatteringText çağırıldı."); // Çox detallı
        if (shatteringTextContainer) shatteringTextContainer.innerHTML = '';
    }

    // ---- YENİ: Restart Düymələrinin Görünüşünü Yeniləmə ----
    function updateRestartButtonsUI() {
        console.log("[OdaIci Client v4-logs | UI Render] updateRestartButtonsUI çağırıldı.");
        if (!restartGameBtn || !gameActionsDiv || !currentGameState || !currentGameState.gamePhase) {
             console.warn("[OdaIci Client v4-logs | UI Render] Restart düymələri yenilənə bilmir (elementlər və ya state yoxdur).");
             return;
        }

        const state = currentGameState;
        const amIRequester = state.restartRequestedBy === socket?.id;
        const isRequestPendingFromOpponent = state.restartRequestedBy && !amIRequester;
        isOpponentPresent = !!(opponentPlayerState?.socketId && !opponentPlayerState.isDisconnected); // Rəqib var mı?

        console.log(`[OdaIci Client v4-logs | UI Render] Restart Buttons Check: Phase=${state.gamePhase}, OpponentPresent=${isOpponentPresent}, RequestedBy=${state.restartRequestedBy}, MySocket=${socket?.id}`);

        // Əvvəlcə dinamik Rədd Et düyməsini (əgər varsa) silək
        const existingDeclineBtn = gameActionsDiv.querySelector('#decline-restart-btn');
        if (existingDeclineBtn) {
            console.log("[OdaIci Client v4-logs | UI Render] Mövcud 'Rədd Et' düyməsi silinir.");
            existingDeclineBtn.remove();
        }

        // Yalnız oyun bitibsə və rəqib varsa düymələri göstər
        if (state.gamePhase === 'game_over' && isOpponentPresent) {
            restartGameBtn.style.display = 'inline-flex'; // Əsas düyməni göstər

            if (isRequestPendingFromOpponent) {
                // Rəqib təklif edib -> Qəbul/Rədd Et
                console.log("[OdaIci Client v4-logs | UI Render] Restart State: Rəqib təklif edib.");
                restartGameBtn.innerHTML = `<i class="fas fa-check"></i> Təklifi Qəbul Et`;
                restartGameBtn.disabled = false;

                // Rədd Et düyməsini yarat
                console.log("[OdaIci Client v4-logs | UI Render] 'Rədd Et' düyməsi yaradılır.");
                const declineBtn = document.createElement('button');
                declineBtn.id = 'decline-restart-btn';
                declineBtn.className = 'button danger-button'; // Qırmızı stil
                declineBtn.innerHTML = `<i class="fas fa-times"></i> Rədd Et`;
                declineBtn.addEventListener('click', handleDeclineRestart); // Listener əlavə et (Part 4-dəki funksiya)
                gameActionsDiv.appendChild(declineBtn); // Div-ə əlavə et
                console.log("[OdaIci Client v4-logs | UI Render] 'Rədd Et' düyməsi əlavə edildi və listener qoşuldu.");

            } else if (amIRequester) {
                // Mən təklif etmişəm -> Gözləmə
                console.log("[OdaIci Client v4-logs | UI Render] Restart State: Mən təklif etmişəm.");
                restartGameBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Təklif Göndərildi`;
                restartGameBtn.disabled = true;

            } else {
                // Heç kim təklif etməyib -> Normal Restart
                console.log("[OdaIci Client v4-logs | UI Render] Restart State: Təklif yoxdur.");
                restartGameBtn.innerHTML = `<i class="fas fa-redo"></i> Yenidən Başlat`;
                restartGameBtn.disabled = false;
            }
        } else {
            // Oyun bitməyibsə və ya rəqib yoxdursa -> Restart düyməsini gizlət
            console.log("[OdaIci Client v4-logs | UI Render] Restart düyməsi gizlədilir (oyun bitməyib və ya rəqib yoxdur).");
            restartGameBtn.style.display = 'none';
            restartGameBtn.disabled = true;
        }
    } // updateRestartButtonsUI sonu

    console.log("[OdaIci Client v4-logs] --- Part 3/6 Tamamlandı ---");
    // ==============================
    // ===== PART 3/6 SONU ==========
    // ==============================

     // --- Növbəti hissələr (Part 4, 5, 6) bu blokun içində davam edəcək ---
     // ===================================================================
    // ===== Part 4/6: Client Actions (Sending Events to Server) =======
    // ===================================================================
    console.log("[OdaIci Client v4-logs | Part 4] Client tərəfi əməliyyat funksiyaları təyin edilir...");

    // ---- Oyun Lövhəsi Hüceyrəsinə Klikləmə ----
    /**
     * Oyun lövhəsindəki bir xanaya klikləndikdə işə düşür.
     * Hərəkətin etibarlılığını yoxlayır və serverə 'make_move' hadisəsi göndərir.
     * @param {Event} event - Klik hadisəsi obyekti.
     */
    function handleCellClick(event) {
        console.log("[OdaIci Client v4-logs | Action] handleCellClick çağırıldı.");
        if (!event || !event.target) {
             console.warn("[OdaIci Client v4-logs | Action] handleCellClick: Event və ya event.target yoxdur.");
             return;
        }
        const clickedCell = event.target;
        const index = parseInt(clickedCell.dataset.index, 10);

        if (isNaN(index)) {
             console.error(`[OdaIci Client v4-logs | Action] handleCellClick: Keçərsiz xana indeksi: ${clickedCell.dataset.index}`);
             return;
        }
        console.log(`[OdaIci Client v4-logs | Action] handleCellClick: Kliklənən xana indeksi: ${index}`);

        // Yoxlamalar
        if (!currentGameState || Object.keys(currentGameState).length === 0) {
            console.warn("[OdaIci Client v4-logs | Action] handleCellClick: currentGameState hələ mövcud deyil. Hərəkət edilmir.");
            return;
        }
        if (currentGameState.gamePhase !== 'playing') {
            console.log(`[OdaIci Client v4-logs | Action] handleCellClick: Oyun 'playing' fazasında deyil (${currentGameState.gamePhase}). Hərəkət edilmir.`);
            return;
        }
         if (currentGameState.isGameOver) {
            console.log("[OdaIci Client v4-logs | Action] handleCellClick: Oyun bitib. Hərəkət edilmir.");
            return;
        }
        if (!isMyTurn) {
            console.log("[OdaIci Client v4-logs | Action] handleCellClick: Sıra sizdə deyil. Hərəkət edilmir.");
            return;
        }
        if (currentGameState.board[index] !== '') {
            console.log(`[OdaIci Client v4-logs | Action] handleCellClick: Xana ${index} boş deyil ('${currentGameState.board[index]}'). Hərəkət edilmir.`);
            return;
        }
        if (isProcessingMove) {
            console.warn("[OdaIci Client v4-logs | Action] handleCellClick: Əvvəlki hərəkət hələ də emal edilir. Hərəkət edilmir.");
            return;
        }

        // Socket bağlantısını yoxla və hadisəni göndər
        if (socket && socket.connected) {
            console.log(`[OdaIci Client v4-logs | Action] ---> EMIT: 'make_move'. Data: { index: ${index} }`);
            isProcessingMove = true; // Emal başladığını qeyd et
            if (boardElement) boardElement.style.pointerEvents = 'none'; // Lövhəni müvəqqəti blokla
            console.log("[OdaIci Client v4-logs | Action] isProcessingMove = true edildi.");

            socket.emit('make_move', { index: index });

            // Cavab gəlməzsə, bloklamanı ləğv etmək üçün timeout
            setTimeout(() => {
                 if(isProcessingMove) {
                     console.warn(`[OdaIci Client v4-logs | Action] make_move (${index}) cavabı serverdən 5 saniyə ərzində gəlmədi. isProcessingMove = false edilir.`);
                     isProcessingMove = false;
                      if (boardElement && !currentGameState.isGameOver && currentGameState.gamePhase === 'playing' && isMyTurn) {
                          boardElement.style.pointerEvents = 'auto'; // Bloklamanı ləğv et
                          console.log("[OdaIci Client v4-logs | Action] Lövhə pointerEvents 'auto' edildi (Timeout).");
                      }
                 }
             }, 5000); // 5 saniyə gözləmə

        } else {
            console.error("[OdaIci Client v4-logs | Action] handleCellClick: Socket bağlantısı yoxdur və ya bağlı deyil!");
            alert("Serverlə bağlantı yoxdur. Hərəkət göndərilə bilmədi.");
        }
    } // handleCellClick sonu

    // ---- Zər Fırlatma və Animasiya ----
    function setDiceTransform(rotateX = currentDiceRotateX, rotateY = currentDiceRotateY, rotateZ = currentDiceRotateZ) {
        // console.log(`[OdaIci Client v4-logs | Dice] setDiceTransform: X=${rotateX}, Y=${rotateY}, Z=${rotateZ}`); // Çox detallı
        if (diceCubeElement) {
            diceCubeElement.style.transform = `translateZ(${initialCenterZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
        }
    }
    function initDice() {
        console.log("[OdaIci Client v4-logs | Dice] initDice çağırıldı.");
        if (!diceCubeElement) { console.warn("[OdaIci Client v4-logs | Dice] initDice: diceCubeElement tapılmadı."); return;}
        diceCubeElement.style.transition = 'none'; // İlkin vəziyyət üçün animasiyanı söndür
        currentDiceRotateX = diceRotations[1].x; // Başlanğıcda 1 üzünü göstər
        currentDiceRotateY = diceRotations[1].y;
        currentDiceRotateZ = 0;
        setDiceTransform();
        isDiceRolling = false; // Fırlanma bayrağını sıfırla
        // Animasiyanı qısa müddət sonra aktivləşdir
        setTimeout(() => { if(diceCubeElement) diceCubeElement.style.transition = ''; }, 50);
        console.log("[OdaIci Client v4-logs | Dice] initDice: Zər başlanğıc vəziyyətinə gətirildi.");
    }
    function rollDice() {
        console.log("%c[OdaIci Client v4-logs | Dice] rollDice funksiyası çağırıldı.", "color: orange; font-weight: bold;");

        // Yoxlamalar
        if (isDiceRolling) { console.warn("[OdaIci Client v4-logs | Dice] rollDice: Zər artıq fırlanır (isDiceRolling=true)."); return; }
        if (!currentGameState || typeof currentGameState !== 'object' || !currentGameState.gamePhase) { console.warn("[OdaIci Client v4-logs | Dice] rollDice: Oyun vəziyyəti (currentGameState) yoxdur və ya natamamdır."); return; }
        if (currentGameState.gamePhase !== 'dice_roll') { console.warn(`[OdaIci Client v4-logs | Dice] rollDice: Zər atma fazası deyil (${currentGameState.gamePhase}).`); return; }
         if (currentGameState.isGameOver) { console.warn(`[OdaIci Client v4-logs | Dice] rollDice: Oyun bitib.`); return; }
        if (!myPlayerState) { console.warn("[OdaIci Client v4-logs | Dice] rollDice: Oyunçu məlumatları (myPlayerState) yoxdur."); return; }
        const isTieBreak = currentGameState.statusMessage?.includes("Bərabərlik!");
        if (myPlayerState.roll !== null && !isTieBreak) { console.warn(`[OdaIci Client v4-logs | Dice] rollDice: Artıq zər atmısınız (Roll=${myPlayerState.roll}).`); return; }
        if (!socket || !socket.connected) { console.error("[OdaIci Client v4-logs | Dice] rollDice: Socket bağlantısı yoxdur!"); alert("Serverlə bağlantı yoxdur."); return; }
        if (!diceCubeElement || !diceInstructions) { console.error("[OdaIci Client v4-logs | Dice] rollDice: Zər elementi (#dice-cube) və ya təlimat sahəsi (#dice-instructions) tapılmadı!"); return;}

        console.log("[OdaIci Client v4-logs | Dice] rollDice: Bütün yoxlamalar keçdi. Zər atılır...");
        isDiceRolling = true; // Fırlanma başladı
        diceCubeElement.style.cursor = 'default'; // Fırlanarkən cursoru dəyiş
        diceInstructions.textContent = 'Zər fırlanır...';
        diceInstructions.className = 'instructions'; // Stilləri sıfırla
        console.log("[OdaIci Client v4-logs | Dice] isDiceRolling = true edildi, UI yeniləndi.");

        if (isTieBreak) { // Bərabərlik idisə, UI-da köhnə nəticələri təmizlə
            console.log("[OdaIci Client v4-logs | Dice] Bərabərlik idi, nəticə displeyləri sıfırlanır.");
             if (yourRollResultDisplay) yourRollResultDisplay.textContent = '?';
             if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = '?';
             if (yourRollBox) yourRollBox.classList.remove('tie', 'winner');
             if (opponentRollBox) opponentRollBox.classList.remove('tie', 'winner');
        }

        // Lokal olaraq təsadüfi nəticə yarat
        const myRoll = Math.floor(Math.random() * 6) + 1;
        console.log(`[OdaIci Client v4-logs | Dice] Lokal zər nəticəsi: ${myRoll}.`);

        // Serverə göndər
        try {
             // Son bir yoxlama (əgər arada state dəyişibsə)
             if (myPlayerState.roll !== null && !isTieBreak) {
                 console.error("[OdaIci Client v4-logs | Dice] EMIT ƏVVƏLİ YOXLA: Artıq zər atılıb!");
                 isDiceRolling = false;
                 if (diceCubeElement) diceCubeElement.style.cursor = 'not-allowed';
                 return;
             }
             console.log(`[OdaIci Client v4-logs | Dice] ---> EMIT: 'dice_roll_result'. Data: { roll: ${myRoll} }`);
             socket.emit('dice_roll_result', { roll: myRoll });
        } catch (emitError) {
             console.error("[OdaIci Client v4-logs | Dice] rollDice: Socket emit zamanı xəta:", emitError);
             isDiceRolling = false;
             if (diceCubeElement) diceCubeElement.style.cursor = canIRollNow() ? 'grab' : 'not-allowed'; // Cursoru bərpa et
             if (diceInstructions) diceInstructions.textContent = 'Serverə göndərmə xətası!';
             return;
        }

        // Lokal Animasiyanı Başlat
        try {
            console.log("[OdaIci Client v4-logs | Dice] Lokal animasiya başladılır...");
            let rollDurationValue = '2.0s'; let rollTimingFunctionValue = 'cubic-bezier(0.3, 0.9, 0.4, 1)';
            try { // CSS dəyişənlərini oxu
                rollDurationValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-duration').trim() || '2.0s';
                rollTimingFunctionValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-timing-function').trim() || 'cubic-bezier(0.3, 0.9, 0.4, 1)';
            } catch(e) { console.warn("[OdaIci Client v4-logs | Dice] CSS roll dəyişənləri oxuna bilmədi."); }

            const durationMs = parseFloat(rollDurationValue.replace('s', '')) * 1000;
            if (isNaN(durationMs) || durationMs <= 0) throw new Error("Animasiya müddəti (ms) hesablanmadı.");
            console.log(`[OdaIci Client v4-logs | Dice] Animasiya müddəti: ${durationMs}ms`);

            const finalFace = diceRotations[myRoll];
            if (!finalFace) throw new Error(`diceRotations obyektində ${myRoll} üçün dəyər tapılmadı!`);

            // Təsadüfi fırlanma dəyərləri
            const fullRotationsX = 360 * (2 + Math.floor(Math.random() * 3));
            const fullRotationsY = 360 * (2 + Math.floor(Math.random() * 3));
            const fullRotationsZ = 360 * (1 + Math.floor(Math.random() * 2));
            const targetRotateX = finalFace.x + fullRotationsX;
            const targetRotateY = finalFace.y + fullRotationsY;
            const targetRotateZ = 0 + fullRotationsZ; // Z sonda 0 olmalıdır

            console.log(`[OdaIci Client v4-logs | Dice] Animasiya hədəfi: X=${targetRotateX}, Y=${targetRotateY}, Z=${targetRotateZ}`);
            // Animasiyanı tətbiq et
            diceCubeElement.style.transition = `transform ${rollDurationValue} ${rollTimingFunctionValue}`;
            setDiceTransform(targetRotateX, targetRotateY, targetRotateZ);

            // Animasiya bitdikdən sonra bayrağı sıfırla və son vəziyyəti quraşdır
            setTimeout(() => {
                console.log("[OdaIci Client v4-logs | Dice] Animasiya bitdi.");
                isDiceRolling = false;
                if (diceCubeElement) {
                    console.log("[OdaIci Client v4-logs | Dice] Zərin son vəziyyəti tətbiq edilir (animasiyasız).");
                    diceCubeElement.style.transition = 'none'; // Animasiyanı dayandır
                    currentDiceRotateX = finalFace.x; currentDiceRotateY = finalFace.y; currentDiceRotateZ = 0;
                    setDiceTransform(); // Son vəziyyətə dəqiq qoy
                    diceCubeElement.style.cursor = 'not-allowed'; // Artıq ata bilməz
                }
                 console.log("[OdaIci Client v4-logs | Dice] isDiceRolling = false edildi.");
            }, durationMs + 100); // Müddət + kiçik bir buffer

        } catch (animError) {
             console.error("%c[OdaIci Client v4-logs | Dice] rollDice: Animasiya zamanı xəta:", "color: red; font-weight: bold;", animError);
             isDiceRolling = false; // Bayrağı sıfırla
             if (diceCubeElement) diceCubeElement.style.cursor = canIRollNow() ? 'grab' : 'not-allowed';
             if (diceInstructions) diceInstructions.textContent = 'Animasiya xətası!';
        }
    } // rollDice sonu

    // Zər atmaq mümkünlüyünü yoxlayan yardımçı funksiya
    function canIRollNow() {
        if (!currentGameState || !myPlayerState || currentGameState.gamePhase !== 'dice_roll' || currentGameState.isGameOver) {
             return false;
        }
        const isTieBreak = currentGameState.statusMessage?.includes("Bərabərlik!");
        const canRoll = (myPlayerState.roll === null || isTieBreak);
        // console.log(`[OdaIci Client v4-logs | Dice] canIRollNow: ${canRoll}`); // Çox detallı
        return canRoll;
    }

    // Zər Sürükləmə/Klikləmə Hadisə Dinləyiciləri (Log əlavə edilmədi, çox olardı)
    function handleMouseDown(event) { if (event.button !== 0 || isDiceRolling) return; isDragging = true; dragStartX = event.clientX; dragStartY = event.clientY; previousMouseX = event.clientX; previousMouseY = event.clientY; if(diceCubeElement) diceCubeElement.style.cursor = 'grabbing'; }
    function handleMouseMove(event) { if (!isDragging) return; const dx = event.clientX - previousMouseX; const dy = event.clientY - previousMouseY; currentDiceRotateY += dx * rotateSensitivity; currentDiceRotateX -= dy * rotateSensitivity; setDiceTransform(); previousMouseX = event.clientX; previousMouseY = event.clientY; }
    function handleMouseUp(event) { if (event.button !== 0 || !isDragging) return; isDragging = false; const dragDistance = Math.sqrt(Math.pow(event.clientX-dragStartX, 2) + Math.pow(event.clientY-dragStartY, 2)); if (dragDistance < dragThreshold) { console.log("[OdaIci Client v4-logs | Dice] MouseUp - Klik qeydə alındı, rollDice çağırılır."); rollDice(); } else { console.log("[OdaIci Client v4-logs | Dice] MouseUp - Sürükləmə bitdi."); } if(diceCubeElement) diceCubeElement.style.cursor = canIRollNow() ? 'grab' : 'not-allowed'; }
    function handleTouchStart(event) { if (event.touches.length !== 1 || isDiceRolling) return; event.preventDefault(); isDragging = true; const touch = event.touches[0]; dragStartX = touch.clientX; dragStartY = touch.clientY; previousMouseX = touch.clientX; previousMouseY = touch.clientY; /* Cursor dəyişmir */ }
    function handleTouchMove(event) { if (!isDragging || event.touches.length !== 1) return; event.preventDefault(); const touch = event.touches[0]; const dx = touch.clientX - previousMouseX; const dy = touch.clientY - previousMouseY; currentDiceRotateY += dx * rotateSensitivity; currentDiceRotateX -= dy * rotateSensitivity; setDiceTransform(); previousMouseX = touch.clientX; previousMouseY = touch.clientY; }
    function handleTouchEnd(event) { if (!isDragging) return; event.preventDefault(); isDragging = false; const touch = event.changedTouches[0]; if(!touch) return; const dragDistance = Math.sqrt(Math.pow(touch.clientX-dragStartX, 2) + Math.pow(touch.clientY-dragStartY, 2)); if (dragDistance < dragThreshold) { console.log("[OdaIci Client v4-logs | Dice] TouchEnd - Toxunma qeydə alındı, rollDice çağırılır."); rollDice(); } else { console.log("[OdaIci Client v4-logs | Dice] TouchEnd - Sürükləmə bitdi."); } /* Cursor dəyişmir */ }

    // ---- Simvol Seçimi ----
    function handleSymbolChoice(event) {
        console.log("[OdaIci Client v4-logs | Action] handleSymbolChoice çağırıldı.");
        if (!event || !event.target) { console.warn("[OdaIci Client v4-logs | Action] handleSymbolChoice: Event və ya target yoxdur."); return; }
        const clickedButton = event.target;
        const chosenSymbol = clickedButton.dataset.symbol;
        console.log(`[OdaIci Client v4-logs | Action] handleSymbolChoice: Seçilən simvol: ${chosenSymbol}`);

        // Yoxlamalar
        if (!chosenSymbol || (chosenSymbol !== 'X' && chosenSymbol !== 'O')) { console.warn("[OdaIci Client v4-logs | Action] handleSymbolChoice: Keçərsiz simvol."); return; }
        if (!currentGameState || typeof currentGameState !== 'object') { console.warn("[OdaIci Client v4-logs | Action] handleSymbolChoice: currentGameState yoxdur."); return; }
        if (!socket || currentGameState.symbolPickerSocketId !== socket.id) { console.warn("[OdaIci Client v4-logs | Action] handleSymbolChoice: Simvol seçmək növbəsi sizdə deyil."); hideModal(symbolSelectModal); return; }
        if (currentGameState.gamePhase !== 'symbol_select') { console.warn(`[OdaIci Client v4-logs | Action] handleSymbolChoice: Oyun 'symbol_select' fazasında deyil (${currentGameState.gamePhase}).`); hideModal(symbolSelectModal); return; }
         if (currentGameState.isGameOver) { console.warn(`[OdaIci Client v4-logs | Action] handleSymbolChoice: Oyun bitib.`); hideModal(symbolSelectModal); return; }
        // Əgər simvollar artıq təyin edilibsə (nadir hal)
        if (currentGameState.player1?.symbol !== null || currentGameState.player2?.symbol !== null) { console.warn(`[OdaIci Client v4-logs | Action] handleSymbolChoice: Simvollar artıq təyin edilib.`); hideModal(symbolSelectModal); return; }

        // Socket bağlantısını yoxla və hadisəni göndər
        if (socket && socket.connected) {
            console.log(`[OdaIci Client v4-logs | Action] ---> EMIT: 'symbol_choice'. Data: { symbol: ${chosenSymbol} }`);
            socket.emit('symbol_choice', { symbol: chosenSymbol });

            // UI-ı dərhal yenilə (gözləmə rejimi)
            if(symbolSelectMessage) symbolSelectMessage.textContent = "Seçiminiz göndərildi...";
            if(symbolOptionsDiv) symbolOptionsDiv.style.display = 'none';
            if(symbolWaitingMessage) {
                 symbolWaitingMessage.textContent = "Oyun başlayır...";
                 symbolWaitingMessage.style.display = 'block';
            }
            symbolOptionsDiv?.querySelectorAll('.symbol-button').forEach(button => { button.disabled = true; });
            console.log("[OdaIci Client v4-logs | Action] handleSymbolChoice: UI gözləmə rejiminə keçirildi.");
        } else {
            console.error("[OdaIci Client v4-logs | Action] handleSymbolChoice: Socket bağlantısı yoxdur!");
            alert("Serverlə bağlantı yoxdur. Simvol seçimi göndərilə bilmədi.");
        }
    } // handleSymbolChoice sonu

    // ---- Yenidən Başlatma (Təklif/Qəbul) ----
    function handleRestartGame() {
        console.log("[OdaIci Client v4-logs | Action] handleRestartGame çağırıldı.");
        if (!currentGameState || !socket?.connected) { console.error("[OdaIci Client v4-logs | Action] Restart mümkün deyil: State və ya Socket yoxdur."); alert("Oyun vəziyyəti və ya server bağlantısı yoxdur!"); return; }

        const state = currentGameState;
        const amIRequester = state.restartRequestedBy === socket.id;
        const isRequestPendingFromOpponent = state.restartRequestedBy && !amIRequester;

        if (state.gamePhase !== 'game_over') { console.warn("[OdaIci Client v4-logs | Action] handleRestartGame: Oyun hələ bitməyib."); return; }
        isOpponentPresent = !!(opponentPlayerState?.socketId && !opponentPlayerState.isDisconnected);
         if(!isOpponentPresent) { console.warn("[OdaIci Client v4-logs | Action] handleRestartGame: Rəqib yoxdur."); if (gameStatusDisplay) gameStatusDisplay.textContent = "Yenidən başlatmaq üçün rəqib olmalıdır."; updateRestartButtonsUI(); return; }

        if (isRequestPendingFromOpponent) {
            // Rəqib təklif edib, MƏN QƏBUL EDİRƏM
            console.log("[OdaIci Client v4-logs | Action] ---> EMIT: 'accept_restart'");
            socket.emit('accept_restart');
            if (gameStatusDisplay) gameStatusDisplay.textContent = "Yenidən başlatma qəbul edildi...";
            if (restartGameBtn) restartGameBtn.disabled = true; // UI update gələnə qədər deaktiv et
             // Rədd et düyməsini də gizlət/sil
             const declineBtn = gameActionsDiv?.querySelector('#decline-restart-btn');
             if(declineBtn) declineBtn.disabled = true; // və ya remove()

        } else if (!state.restartRequestedBy) {
            // Heç kim təklif etməyib, MƏN TƏKLİF EDİRƏM
            console.log("[OdaIci Client v4-logs | Action] ---> EMIT: 'request_restart'");
            socket.emit('request_restart');
            if (gameStatusDisplay) gameStatusDisplay.textContent = "Yenidən başlatma təklifi göndərildi...";
            if (restartGameBtn) restartGameBtn.disabled = true; // UI update gələnə qədər deaktiv et
        } else { // amIRequester == true
             console.log("[OdaIci Client v4-logs | Action] handleRestartGame: Təklifiniz artıq göndərilib.");
        }
         // Düymələrin son vəziyyəti onsuz da gameStateUpdate ilə gələcək.
    } // handleRestartGame sonu

    // ---- YENİ: Yenidən Başlatma Təklifini Rədd Etmə ----
    function handleDeclineRestart() {
        console.log("[OdaIci Client v4-logs | Action] handleDeclineRestart çağırıldı.");
        if (!currentGameState || !socket?.connected) { console.error("[OdaIci Client v4-logs | Action] Rədd etmək mümkün deyil: State və ya Socket yoxdur."); alert("Oyun vəziyyəti və ya server bağlantısı yoxdur!"); return; }

        const state = currentGameState;
        const isRequestPendingFromOpponent = state.restartRequestedBy && state.restartRequestedBy !== socket.id;

        if (state.gamePhase === 'game_over' && isRequestPendingFromOpponent) {
            console.log("[OdaIci Client v4-logs | Action] ---> EMIT: 'decline_restart'");
            socket.emit('decline_restart');
            if (gameStatusDisplay) gameStatusDisplay.textContent = "Yenidən başlatma təklifi rədd edildi.";
            // Düymələri dərhal gizlədə bilərik və ya update gözləyə bilərik
            if(restartGameBtn) restartGameBtn.disabled = true;
            const declineBtn = gameActionsDiv?.querySelector('#decline-restart-btn');
            if(declineBtn) declineBtn.disabled = true;
        } else {
            console.warn("[OdaIci Client v4-logs | Action] handleDeclineRestart: Rədd ediləcək aktiv təklif yoxdur və ya oyun bitməyib.");
        }
    } // handleDeclineRestart sonu


    // ---- Otaq Əməliyyatları (Edit, Delete, Kick - Log əlavə edildi) ----
    function openEditModal() {
        console.log("[OdaIci Client v4-logs | Action] openEditModal çağırıldı.");
        if (!isCurrentUserCreator) { alert("Yalnız otağı yaradan parametrləri dəyişə bilər."); return; }
        if (!currentRoomData || !currentRoomData.id) { alert("Otaq məlumatları hələ tam alınmayıb."); return; }
        if (!editRoomModal) { console.error("[OdaIci Client v4-logs | Action] openEditModal: editRoomModal elementi tapılmadı!"); return; }
        console.log("[OdaIci Client v4-logs | Action] Otaq Ayarları Modalı açılır. Data:", currentRoomData);
        // Formu doldur
        const nameInput = editRoomModal.querySelector('#edit-room-name');
        const passwordCheck = editRoomModal.querySelector('#edit-room-password-check');
        const passwordInput = editRoomModal.querySelector('#edit-room-password');
        const boardSizeSelect = editRoomModal.querySelector('#edit-board-size');
        const msgElement = editRoomModal.querySelector('#edit-room-message');
        const saveBtn = editRoomModal.querySelector('#save-room-changes-btn');
        const deleteBtn = editRoomModal.querySelector('#delete-room-confirm-btn');

        if (nameInput) nameInput.value = currentRoomData.name || '';
        if (passwordCheck) passwordCheck.checked = currentRoomData.hasPassword || false;
        if (passwordInput) { passwordInput.value = ''; passwordInput.style.display = passwordCheck?.checked ? 'block' : 'none'; }
        if (passwordCheck && passwordInput) { passwordCheck.onchange = () => { passwordInput.style.display = passwordCheck.checked ? 'block' : 'none'; }; }
        if (boardSizeSelect) {
             const currentSize = currentRoomData.boardSize || boardSize; // Otaq datasından və ya qlobaldan götür
             boardSizeSelect.value = currentSize.toString();
             // Oyun davam edərkən ölçü dəyişdirilə bilməz
             const gameInProgress = currentGameState?.gamePhase === 'playing' && !currentGameState.isGameOver;
             boardSizeSelect.disabled = gameInProgress;
             if(gameInProgress) console.log("[OdaIci Client v4-logs | Action] Lövhə ölçüsü dəyişdirilə bilməz (oyun davam edir).");
        }
        if (msgElement) { msgElement.textContent = ''; msgElement.className = 'message'; }
        if (saveBtn) saveBtn.disabled = false;
        if (deleteBtn) deleteBtn.disabled = false;
        showModal(editRoomModal);
    }
    function saveRoomChanges() {
        console.log("[OdaIci Client v4-logs | Action] saveRoomChanges çağırıldı.");
        if (!editRoomModal || !isCurrentUserCreator || !socket?.connected) { console.error("[OdaIci Client v4-logs | Action] saveRoomChanges: Şərtlər ödənmir."); return; }

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
        let newPasswordValue = null;

        // Validasiya
        if (!newName || newName.length > 30) { showMsg(msgElement, 'Otaq adı boş və ya çox uzun ola bilməz (1-30).', 'error'); return; }
        if (newHasPasswordChecked) {
            if (!passwordInput) { showMsg(msgElement, 'Şifrə sahəsi tapılmadı!', 'error'); return; }
            newPasswordValue = passwordInput.value;
            // Şifrə boş ola bilməz (əgər checkbox işarəlidirsə)
            if (!newPasswordValue) { showMsg(msgElement, 'Şifrəli otaq üçün şifrə daxil edilməlidir.', 'error'); return; }
            if (newPasswordValue.length < 2 || newPasswordValue.length > 20) { showMsg(msgElement, 'Şifrə 2-20 simvol olmalıdır.', 'error'); return; }
        }

        const settingsData = { roomId: currentRoomId, newName: newName, newPassword: newPasswordValue, newBoardSize: newBoardSize };
        console.log("[OdaIci Client v4-logs | Action] ---> EMIT: 'update_room_settings'. Data:", settingsData);
        if(saveBtn) saveBtn.disabled = true; if(deleteBtn) deleteBtn.disabled = true;
        showMsg(msgElement, 'Dəyişikliklər yadda saxlanılır...', 'info', 0); // Mesajı göstər, silinməsin
        socket.emit('update_room_settings', settingsData);

        // Timeout əlavə et (server cavab verməsə)
        setTimeout(() => {
             if (saveBtn?.disabled) { // Əgər hələ də disabled isə
                 console.warn("[OdaIci Client v4-logs | Action] update_room_settings cavabı serverdən gəlmədi.");
                 showMsg(msgElement, 'Serverdən cavab gəlmədi. İnternetinizi yoxlayın.', 'error');
                 if(saveBtn) saveBtn.disabled = false; if(deleteBtn) deleteBtn.disabled = false;
             }
         }, 7000); // 7 saniyə
    }
    function deleteRoom() {
        console.log("[OdaIci Client v4-logs | Action] deleteRoom çağırıldı.");
        if (!isCurrentUserCreator || !currentRoomId || !socket?.connected) { console.error("[OdaIci Client v4-logs | Action] deleteRoom: Şərtlər ödənmir."); return; }
        const roomNameToDelete = currentRoomData.name || currentRoomId;
        if (confirm(`'${escapeHtml(roomNameToDelete)}' otağını silmək istədiyinizə əminsiniz? Bu əməliyyat geri qaytarılmazdır.`)) {
            console.log(`[OdaIci Client v4-logs | Action] ---> EMIT: 'delete_room'. Data: { roomId: ${currentRoomId} }`);
            const msgElement = editRoomModal?.querySelector('#edit-room-message');
            const saveBtn = editRoomModal?.querySelector('#save-room-changes-btn');
            const deleteBtn = editRoomModal?.querySelector('#delete-room-confirm-btn');
            if(msgElement) showMsg(msgElement, 'Otaq silinir...', 'info', 0);
            if(saveBtn) saveBtn.disabled = true; if(deleteBtn) deleteBtn.disabled = true;
            socket.emit('delete_room', { roomId: currentRoomId });
            // Serverdən 'room_deleted_kick' gələcək və yönləndirəcək. Timeout lazım deyil.
        } else {
            console.log("[OdaIci Client v4-logs | Action] deleteRoom: İstifadəçi ləğv etdi.");
        }
    }
    function handleKickOpponent() {
        console.log("[OdaIci Client v4-logs | Action] handleKickOpponent çağırıldı.");
        if (!isCurrentUserCreator || !isOpponentPresent || !currentRoomId || !socket?.connected) { console.error("[OdaIci Client v4-logs | Action] handleKickOpponent: Şərtlər ödənmir."); return; }
        const opponentToKick = opponentPlayerState?.username || "Rəqib";
        if (confirm(`${escapeHtml(opponentToKick)}-i otaqdan çıxarmaq istədiyinizə əminsiniz?`)) {
             console.log(`[OdaIci Client v4-logs | Action] ---> EMIT: 'kick_opponent'. Data: { roomId: ${currentRoomId} }`);
             if (kickOpponentBtn) kickOpponentBtn.disabled = true; // Düyməni deaktiv et
             socket.emit('kick_opponent', { roomId: currentRoomId });
             // Cavab gözləməyə ehtiyac yoxdur, server 'opponent_left_game' göndərəcək.
             // Amma düyməni yenidən aktivləşdirmək üçün timeout qoya bilərik.
             setTimeout(() => { if(kickOpponentBtn?.disabled) { console.warn("[OdaIci Client v4-logs | Action] Kick opponent düyməsi hələ də deaktivdir."); if(kickOpponentBtn) kickOpponentBtn.disabled = false; } }, 7000);
        } else {
             console.log("[OdaIci Client v4-logs | Action] handleKickOpponent: İstifadəçi ləğv etdi.");
        }
    }

    console.log("[OdaIci Client v4-logs] --- Part 4/6 Tamamlandı ---");
    // ==============================
    // ===== PART 4/6 SONU ==========
    // ==============================

     // --- Növbəti hissələr (Part 5, 6) bu blokun içində davam edəcək ---
     // ======================================================================
    // ===== Part 5/6: Socket.IO Setup & Basic Event Listeners ==========
    // ======================================================================
    console.log("[OdaIci Client v4-logs | Part 5] Socket.IO qurulumu və əsas hadisə dinləyiciləri təyin edilir...");

    // ---- Socket.IO Bağlantısını Qurma Funksiyası ----
    // ======================================================================
    // ===== Part 5/6: Socket.IO Setup & Basic Event Listeners ==========
    // ======================================================================
    console.log("[OdaIci Client v4-logs | Part 5] Socket.IO qurulumu və əsas hadisə dinləyiciləri təyin edilir...");

    // ---- Socket.IO Bağlantısını Qurma Funksiyası ----
    /**
     * Server ilə Socket.IO bağlantısını qurur və əsas bağlantı hadisələrini dinləyir.
     * @param {string} roomIdToJoin - Qoşulmaq üçün otaq ID-si.
     */
    function setupGameSocketConnection(roomIdToJoin) {
        console.log(`[OdaIci Client v4-logs | Socket Setup] setupGameSocketConnection çağırıldı. RoomID: ${roomIdToJoin}`);

        if (socket && socket.connected) {
            console.warn("[OdaIci Client v4-logs | Socket Setup] Mövcud socket bağlantısı var idi, bağlanır...");
            socket.disconnect();
        }
        socket = null; // Socket obyektini sıfırla

        if (!roomIdToJoin) {
            console.error("[OdaIci Client v4-logs | Socket Setup] KRİTİK XƏTA: Socket bağlantısı üçün Otaq ID təyin edilməyib! Lobiyə yönləndirilir.");
            hideLoadingOverlay();
            alert("Oyun otağına daxil olmaq üçün etibarlı bir Otaq ID lazımdır. Zəhmət olmasa, lobidən yenidən cəhd edin.");
            window.location.href = '../lobby/test_odalar.html';
            return;
        }

        console.log(`[OdaIci Client v4-logs | Socket Setup] ${roomIdToJoin} otağı üçün yeni bağlantı qurulur... Server: ${window.location.origin}`);
        showLoadingOverlay('Serverə qoşulunur...');

        try {
            // Socket.IO clientini başlat (withCredentials əlavə olundu)
            socket = io({
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 10000,
                withCredentials: true // <<<---- ƏVVƏLKİ ADDIMDA ƏLAVƏ EDİLMİŞDİ ----<<<
            });
            console.log("[OdaIci Client v4-logs | Socket Setup] Socket.IO client obyekti yaradıldı (withCredentials: true ilə).");

            // --- Əsas Bağlantı Hadisələri ---

            // !!!---- 'connect' HADİSƏSİ (DƏYİŞİKLİK BURADA) ----!!!
            socket.on('connect', () => {
                console.log(`%c[OdaIci Client v4-logs | Socket Event] >>> connect: Oyun serverinə qoşuldu! Socket ID: ${socket.id}`, "color: lightgreen; font-weight: bold;");
                hideLoadingOverlay(); // Yükləmə ekranını gizlət

                // ---- DƏYİŞİKLİK BURADA ----
                // Serverə hazır olduğumuzu bildirərkən user məlumatını da göndərək
                // loggedInUser və currentRoomId dəyişənləri Part 2-də (auth) və Part 6-da (init) təyin edilir
                if (loggedInUser && loggedInUser.id && loggedInUser.nickname && currentRoomId) {
                    console.log(`[OdaIci Client v4-logs | Socket Event] ---> EMIT: 'player_ready_in_room'. Data: { roomId: ${currentRoomId}, userId: ${loggedInUser.id}, username: ${loggedInUser.nickname} }`);
                    socket.emit('player_ready_in_room', {
                        roomId: currentRoomId,
                        userId: loggedInUser.id,       // User ID əlavə edildi
                        username: loggedInUser.nickname // Username əlavə edildi
                    });
                } else {
                    console.error("[OdaIci Client v4-logs | Socket Event] connect: Kritik məlumatlar (loggedInUser, currentRoomId) tapılmadı! 'player_ready_in_room' göndərilmir.");
                    alert("Oyunçu məlumatları və ya otaq ID tapılmadığı üçün serverə hazır olduğunuz bildirilə bilmədi.");
                    window.location.href = '../lobby/test_odalar.html';
                }
                // ---- DƏYİŞİKLİK SONU ----
            });
            // !!!---- 'connect' HADİSƏSİ SONU ----!!!


            socket.on('disconnect', (reason) => {
                console.warn(`%c[OdaIci Client] SOCKET DISCONNECT alındı! Səbəb (reason): ${reason}`, "color: orange; font-weight: bold;", "Full reason object:", reason);
                console.warn(`%c[OdaIci Client v4-logs | Socket Event] >>> disconnect: Serverlə bağlantı kəsildi! Səbəb: ${reason}`, "color: orange;");
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'Serverlə bağlantı kəsildi!';
                if (turnIndicator) turnIndicator.textContent = "Offline";
                if (boardElement) { boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none'; }
                if (myPlayerState && player1NameDisplay) { player1NameDisplay.textContent = `${escapeHtml(myPlayerState.username || 'Siz')} (Offline)`; player1Info?.classList.add('disconnected'); }
                if (opponentPlayerState && player2NameDisplay) { player2NameDisplay.textContent = `${escapeHtml(opponentPlayerState.username || 'Rəqib')} (Offline)`; player2Info?.classList.add('disconnected');}
                updateRestartButtonsUI();

                if (reason === 'io server disconnect') {
                     console.log("[OdaIci Client v4-logs | Socket Event] Server tərəfindən disconnect edildiyi üçün yenidən qoşulma dayandırıldı.");
                     alert("Server bağlantını kəsdi (məs. başqa cihazdan giriş). Lobiyə yönləndirilirsiniz.");
                     window.location.href = '../lobby/test_odalar.html';
                } else if (reason === 'transport close' || reason === 'ping timeout') {
                     console.log("[OdaIci Client v4-logs | Socket Event] Bağlantı qeyri-stabil idi, yenidən qoşulma cəhd ediləcək...");
                     showLoadingOverlay('Bağlantı kəsildi, bərpa edilir...');
                } else {
                    console.log(`[OdaIci Client v4-logs | Socket Event] Disconnect səbəbi: ${reason}. Yenidən qoşulma cəhd ediləcək.`);
                     showLoadingOverlay('Bağlantı kəsildi, bərpa edilir...');
                }
            });

            socket.on('connect_error', (error) => {
                console.error(`%c[OdaIci Client v4-logs | Socket Event] >>> connect_error: Qoşulma xətası! Səbəb: ${error.message}`, "color: red;", error);
                hideLoadingOverlay();
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'Serverə qoşulmaq mümkün olmadı!';
                if (turnIndicator) turnIndicator.textContent = "Xəta";
                if (boardElement) { boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none'; }
                if (error.message.includes("Authentication Error")) {
                     alert(`Serverə qoşulmaq mümkün olmadı: ${error.message}\nZəhmət olmasa yenidən giriş edin.`);
                     window.location.href = '/ana_sehife/login/login.html';
                } else {
                     alert(`Serverə qoşulmaq mümkün olmadı: ${error.message}\nİnternet bağlantınızı yoxlayın və ya lobiyə qayıdın.`);
                }
            });

            socket.on('connect_timeout', (timeout) => {
                console.error(`%c[OdaIci Client v4-logs | Socket Event] >>> connect_timeout: Qoşulma ${timeout}ms ərzində baş tutmadı!`, "color: red;");
                hideLoadingOverlay();
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'Serverə qoşulma vaxtı bitdi!';
            });

            socket.on('error', (error) => {
                console.error(`%c[OdaIci Client v4-logs | Socket Event] >>> error: Ümumi socket xətası! Səbəb: ${error.message || error}`, "color: red;", error);
            });

            // --- Yenidən Qoşulma Hadisələri ---
            socket.on('reconnect', (attemptNumber) => {
                console.log(`%c[OdaIci Client v4-logs | Socket Event] >>> reconnect: Uğurla yenidən qoşuldu! (Cəhd #${attemptNumber}) Socket ID: ${socket.id}`, "color: lightblue;");
                hideLoadingOverlay();
                // --- DƏYİŞİKLİK BURADA (reconnect üçün də user info göndər) ---
                if (loggedInUser && loggedInUser.id && loggedInUser.nickname && currentRoomId) {
                    console.log("[OdaIci Client v4-logs | Socket Event] ---> EMIT: 'player_ready_in_room' (reconnect sonrası). Data: { roomId: currentRoomId, userId: loggedInUser.id, username: loggedInUser.nickname }");
                     socket.emit('player_ready_in_room', {
                         roomId: currentRoomId,
                         userId: loggedInUser.id,
                         username: loggedInUser.nickname
                     });
                } else {
                    console.warn("[OdaIci Client v4-logs | Socket Event] reconnect: Kritik məlumatlar tapılmadı! 'player_ready_in_room' göndərilmir.");
                }
                // --- DƏYİŞİKLİK SONU ---
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'Yenidən qoşuldu!';
            });

            socket.on('reconnect_attempt', (attemptNumber) => {
                console.log(`[OdaIci Client v4-logs | Socket Event] Yenidən qoşulma cəhdi #${attemptNumber}...`);
                showLoadingOverlay(`Bağlantı bərpa edilir (cəhd ${attemptNumber})...`);
            });

            socket.on('reconnect_error', (error) => {
                console.error(`%c[OdaIci Client v4-logs | Socket Event] >>> reconnect_error: Yenidən qoşulma xətası! Səbəb: ${error.message}`, "color: red;");
                showLoadingOverlay(`Bağlantı xətası: ${error.message}. Cəhd davam edir...`);
            });

            socket.on('reconnect_failed', () => {
                console.error('%c[OdaIci Client v4-logs | Socket Event] >>> reconnect_failed: Bütün yenidən qoşulma cəhdləri uğursuz oldu!', "color: red;");
                hideLoadingOverlay();
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'Serverlə bağlantı bərpa edilə bilmədi!';
                alert('Serverlə bağlantı bərpa edilə bilmədi. Zəhmət olmasa səhifəni yeniləyin və ya lobiyə qayıdın.');
                window.location.href = '../lobby/test_odalar.html';
            });

            // Oyunla bağlı digər hadisələri dinləmək üçün funksiyanı çağır
            setupGameEventListeners(socket);

        } catch (socketError) {
            console.error("[OdaIci Client v4-logs | Socket Setup] Socket.IO clientini başlatarkən xəta:", socketError);
            hideLoadingOverlay();
            alert(`Real-time bağlantı qurularkən xəta baş verdi: ${socketError.message}`);
        }

    } // setupGameSocketConnection sonu

    // ---- Serverdən Gələn Oyun Hadisələrini Dinləmə Funksiyası ----
    // (Bu funksiyanın özündə dəyişiklik yoxdur, əvvəlki Part 5-dəki kimidir)
// Bu funksiya Part 5 içində təyin edilmişdi. Onu bu yeni versiya ilə əvəz edin.

// ---- Serverdən Gələn Oyun Hadisələrini Dinləmə Funksiyası (Loglarla Zənginləşdirilmiş) ----
/**
 * Serverdən gələn oyunla bağlı hadisələri dinləmək üçün listenerları quraşdırır.
 * @param {object} socketInstance - Aktiv socket bağlantısı.
 */
function setupGameEventListeners(socketInstance) {
    console.log("[OdaIci Client v4-logs | Socket Setup] setupGameEventListeners: Oyun hadisə dinləyiciləri quraşdırılır...");

    // Əvvəlki listenerları təmizlə (əgər varsa)
    const eventsToRemove = [
        'game_state_update', 'opponent_left_game', 'room_deleted_kick', 'force_redirect_lobby',
        'invalid_move', 'game_error', 'info_message', 'room_info',
        'update_room_settings_result', 'restart_requested', 'already_connected_elsewhere' // Yeni əlavə edilən
    ];
    eventsToRemove.forEach(event => socketInstance.off(event));
    console.log("[OdaIci Client v4-logs | Socket Setup] Köhnə oyun hadisə dinləyiciləri silindi.");

    // ===== ƏSAS GAME STATE LISTENER =====
    // Bu hadisənin emalı handleGameStateUpdate funksiyasındadır (Part 6)
    // handleGameStateUpdate funksiyasının özündə kifayət qədər log var.
    socketInstance.on('game_state_update', handleGameStateUpdate);
    console.log("[OdaIci Client v4-logs | Socket Setup] Dinləyici quraşdırıldı: 'game_state_update'");
    // =====================================

    // Rəqib Ayrıldı / Bağlantısı Kəsildi
    socketInstance.on('opponent_left_game', (data) => {
        const opponentWhoLeft = data?.username || 'Rəqib';
        const isReconnecting = data?.reconnecting || false;
        console.log(`%c[OdaIci Client v4-logs | Socket Event] <<< opponent_left_game alındı: User=${opponentWhoLeft}, Reconnecting=${isReconnecting}`, "color: orange;", data);
        isOpponentPresent = false; // Rəqib artıq yoxdur/gözlənilir

        // UI yeniləmələri əsasən handleGameStateUpdate tərəfindən ediləcək (server yeni state göndərməlidir),
        // amma burada dərhal reaksiya vermək üçün bəzi UI elementlərini yeniləyə bilərik.
        if (gameStatusDisplay) {
             gameStatusDisplay.textContent = isReconnecting
                 ? `${escapeHtml(opponentWhoLeft)} bağlantısı kəsildi, qayıtması gözlənilir...`
                 : `${escapeHtml(opponentWhoLeft)} oyundan ayrıldı.`;
             gameStatusDisplay.classList.add('disconnected-status');
             console.log(`[OdaIci Client v4-logs | Socket Event] opponent_left_game: Status mesajı yeniləndi.`);
        }
        // Rəqib paneli (əgər varsa)
        if (opponentPlayerState && player2NameDisplay) {
             player2NameDisplay.textContent = `${escapeHtml(opponentPlayerState.username || opponentWhoLeft)} (${isReconnecting ? 'Gözlənilir...' : 'Ayrıldı'})`;
             player2Info?.classList.add('disconnected');
             console.log(`[OdaIci Client v4-logs | Socket Event] opponent_left_game: Rəqib paneli yeniləndi.`);
        }

        updateHeaderButtonsVisibility(); // Kick düyməsini gizlət
        updateRestartButtonsUI();     // Restart düymələrini yenilə/gizlət
        hideModal(diceRollModal);     // Açıq modalları bağla
        hideModal(symbolSelectModal);
        console.log("[OdaIci Client v4-logs | Socket Event] opponent_left_game: UI elementləri (düymələr, modallar) yeniləndi.");
    });
    console.log("[OdaIci Client v4-logs | Socket Setup] Dinləyici quraşdırıldı: 'opponent_left_game'");

    // Otaq Silindi / Otaqdan Çıxarıldın
    socketInstance.on('room_deleted_kick', (data) => {
        const message = data?.message || 'Otaq silindi və ya otaqdan çıxarıldınız.';
        console.warn(`%c[OdaIci Client v4-logs | Socket Event] <<< room_deleted_kick alındı: ${message}`, "color: red;", data);
        hideLoadingOverlay(); // Yükləmə ekranını gizlət
        // Socket bağlantısını kəsək ki, təkrar cəhd etməsin
        socketInstance.disconnect();
        alert(message + "\nLobiyə yönləndirilirsiniz.");
        console.log("[OdaIci Client v4-logs | Socket Event] room_deleted_kick: Lobiyə yönləndirilir...");
        window.location.href = '../lobby/test_odalar.html';
    });
    console.log("[OdaIci Client v4-logs | Socket Setup] Dinləyici quraşdırıldı: 'room_deleted_kick'");

    // Məcburi Lobbiyə Yönləndirmə
    socketInstance.on('force_redirect_lobby', (data) => {
        const message = data?.message || 'Otaqla bağlı problem yarandı.';
        console.warn(`%c[OdaIci Client v4-logs | Socket Event] <<< force_redirect_lobby alındı: ${message}`, "color: red;", data);
        hideLoadingOverlay();
        socketInstance.disconnect();
        alert(message + "\nLobiyə yönləndirilirsiniz.");
        console.log("[OdaIci Client v4-logs | Socket Event] force_redirect_lobby: Lobiyə yönləndirilir...");
        window.location.href = '../lobby/test_odalar.html';
    });
     console.log("[OdaIci Client v4-logs | Socket Setup] Dinləyici quraşdırıldı: 'force_redirect_lobby'");

    // Keçərsiz Gediş
    socketInstance.on('invalid_move', (data) => {
        const message = data?.message || 'Keçərsiz hərəkət!';
        console.warn(`%c[OdaIci Client v4-logs | Socket Event] <<< invalid_move alındı: ${message}`, "color: orange;", data);
        if (gameStatusDisplay) {
             const currentStatusText = currentGameState?.statusMessage || gameStatusDisplay.textContent || "...";
             const displayMsg = `⚠️ ${message}`;
             gameStatusDisplay.textContent = displayMsg;
             gameStatusDisplay.style.color = 'var(--warning-color)';
             console.log(`[OdaIci Client v4-logs | Socket Event] invalid_move: Status mesajı göstərildi: '${displayMsg}'`);
             setTimeout(() => {
                  if (gameStatusDisplay && gameStatusDisplay.textContent === displayMsg) {
                       gameStatusDisplay.textContent = currentStatusText;
                       gameStatusDisplay.style.color = '';
                       console.log(`[OdaIci Client v4-logs | Socket Event] invalid_move: Status mesajı əvvəlki vəziyyətinə (${currentStatusText}) qaytarıldı.`);
                  }
             }, 2500);
        }
        if (isProcessingMove) {
            console.log("[OdaIci Client v4-logs | Socket Event] invalid_move: isProcessingMove = false edilir.");
            isProcessingMove = false;
        }
        if (boardElement && !currentGameState.isGameOver && isMyTurn) {
             boardElement.style.pointerEvents = 'auto';
             console.log("[OdaIci Client v4-logs | Socket Event] invalid_move: Lövhə klikləmə bərpa edildi.");
        }
    });
    console.log("[OdaIci Client v4-logs | Socket Setup] Dinləyici quraşdırıldı: 'invalid_move'");

    // Ümumi Oyun Xətası
    socketInstance.on('game_error', (data) => {
        const message = data?.message || 'Oyunda naməlum xəta baş verdi.';
        console.error(`%c[OdaIci Client v4-logs | Socket Event] <<< game_error alındı: ${message}`, "color: red;", data);
        if(gameStatusDisplay) {
            gameStatusDisplay.textContent = `XƏTA: ${message}`;
            gameStatusDisplay.style.color = 'var(--danger-color)';
            console.log(`[OdaIci Client v4-logs | Socket Event] game_error: Status mesajı göstərildi.`);
        }
        alert(`Oyunda xəta baş verdi: ${message}`);
        if(boardElement) boardElement.style.pointerEvents = 'none';
        updateRestartButtonsUI(); // Restart düymələrini deaktiv et/gizlət
        hideModal(editRoomModal); hideModal(diceRollModal); hideModal(symbolSelectModal);
        console.log("[OdaIci Client v4-logs | Socket Event] game_error: Oyun elementləri deaktiv edildi/gizlədildi.");
    });
    console.log("[OdaIci Client v4-logs | Socket Setup] Dinləyici quraşdırıldı: 'game_error'");

    // İnfo Mesajı (Məsələn, restart rədd edildi)
    socketInstance.on('info_message', (data) => {
         const message = data?.message;
         if(message) {
             console.log(`%c[OdaIci Client v4-logs | Socket Event] <<< info_message alındı: ${message}`, "color: cyan;", data);
             if (gameStatusDisplay) {
                 const currentStatusText = currentGameState?.statusMessage || gameStatusDisplay.textContent || "...";
                 const displayMsg = `ℹ️ ${message}`;
                 gameStatusDisplay.textContent = displayMsg;
                 gameStatusDisplay.style.color = 'var(--primary-color)'; // Mavi rəng
                 console.log(`[OdaIci Client v4-logs | Socket Event] info_message: Status mesajı göstərildi: '${displayMsg}'`);
                 setTimeout(() => {
                      if (gameStatusDisplay && gameStatusDisplay.textContent === displayMsg) {
                           gameStatusDisplay.textContent = currentStatusText;
                           gameStatusDisplay.style.color = '';
                           console.log(`[OdaIci Client v4-logs | Socket Event] info_message: Status mesajı əvvəlki vəziyyətinə (${currentStatusText}) qaytarıldı.`);
                      }
                 }, 3500); // 3.5 saniyə
             }
         } else {
              console.warn("[OdaIci Client v4-logs | Socket Event] <<< info_message: Boş mesaj alındı.");
         }
    });
    console.log("[OdaIci Client v4-logs | Socket Setup] Dinləyici quraşdırıldı: 'info_message'");

    // Otaq Məlumatları Yeniləməsi
    socketInstance.on('room_info', (roomInfo) => {
         console.log(`%c[OdaIci Client v4-logs | Socket Event] <<< room_info alındı:`, "color: magenta;", roomInfo);
         if(!roomInfo) { console.warn("[OdaIci Client v4-logs | Socket Event] room_info: Boş data alındı."); return; }
         currentRoomData = { ...currentRoomData, ...roomInfo };
         // Yaradanı təyin et
         if(roomInfo.creatorUsername && loggedInUser?.nickname) {
             const oldCreatorStatus = isCurrentUserCreator;
             isCurrentUserCreator = (loggedInUser.nickname === roomInfo.creatorUsername);
             if (oldCreatorStatus !== isCurrentUserCreator) {
                  console.log(`[OdaIci Client v4-logs | Socket Event] room_info: isCurrentUserCreator statusu dəyişdi -> ${isCurrentUserCreator}`);
             }
         }
         // Otaq adını yenilə
         if (roomNameDisplay && roomInfo.name && roomNameDisplay.textContent !== `Otaq: ${escapeHtml(roomInfo.name)}`) {
             roomNameDisplay.textContent = `Otaq: ${escapeHtml(roomInfo.name)}`;
             console.log(`[OdaIci Client v4-logs | Socket Event] room_info: Otaq adı yeniləndi: '${roomInfo.name}'`);
         }
         // Başlıq düymələrini yenilə
         updateHeaderButtonsVisibility();
    });
    console.log("[OdaIci Client v4-logs | Socket Setup] Dinləyici quraşdırıldı: 'room_info'");

    // Otaq Ayarları Dəyişikliyi Nəticəsi
    socketInstance.on('update_room_settings_result', (result) => {
         console.log(`%c[OdaIci Client v4-logs | Socket Event] <<< update_room_settings_result alındı:`, "color: magenta;", result);
         const msgElement = editRoomModal?.querySelector('#edit-room-message');
         const saveBtn = editRoomModal?.querySelector('#save-room-changes-btn');
         const deleteBtn = editRoomModal?.querySelector('#delete-room-confirm-btn');
         if (!msgElement || !saveBtn || !deleteBtn) return;

         if (result.success) {
             showMsg(msgElement, result.message || 'Ayarlar yeniləndi!', 'success', 2500);
             console.log("[OdaIci Client v4-logs | Socket Event] update_room_settings_result: Uğurlu.");
             setTimeout(() => { hideModal(editRoomModal); }, 1800);
         } else {
             showMsg(msgElement, result.message || 'Ayarları yeniləmək olmadı.', 'error');
             console.warn("[OdaIci Client v4-logs | Socket Event] update_room_settings_result: Xəta -", result.message);
             saveBtn.disabled = false; // Düymələri yenidən aktivləşdir
             deleteBtn.disabled = false;
         }
     });
     console.log("[OdaIci Client v4-logs | Socket Setup] Dinləyici quraşdırıldı: 'update_room_settings_result'");

    // Yenidən Başlatma Təklifi Gəldi
    socketInstance.on('restart_requested', (data) => {
        const requester = data?.username || 'Rəqib';
        console.log(`%c[OdaIci Client v4-logs | Socket Event] <<< restart_requested alındı: Təklif edən=${requester}`, "color: yellow;", data);
        // UI yeniləməsi 'game_state_update' ilə idarə olunacaq,
        // amma statusu dərhal yeniləyə bilərik.
         if (gameStatusDisplay && currentGameState?.gamePhase === 'game_over') {
             console.log("[OdaIci Client v4-logs | Socket Event] restart_requested: Status mesajı yenilənir.");
             gameStatusDisplay.textContent = `${escapeHtml(requester)} yenidən başlatmağı təklif edir...`;
             gameStatusDisplay.style.color = 'var(--warning-color)';
         }
         // Düymələri yeniləmək üçün update çağırılsın mı? Bəlkə də state update gözləmək daha yaxşıdır.
         // updateRestartButtonsUI();
    });
    console.log("[OdaIci Client v4-logs | Socket Setup] Dinləyici quraşdırıldı: 'restart_requested'");

    // ----- YENİ: 'already_connected_elsewhere' hadisəsi -----
    socketInstance.on('already_connected_elsewhere', (data) => {
         const message = data?.message || 'Başqa cihazdan artıq qoşulmusunuz.';
         console.warn(`%c[OdaIci Client v4-logs | Socket Event] <<< already_connected_elsewhere alındı: ${message}`, "color: red;", data);
         hideLoadingOverlay();
         socketInstance.disconnect(); // Client tərəfli bağlantını da kəsək
         alert(message + "\nLobiyə yönləndirilirsiniz.");
         console.log("[OdaIci Client v4-logs | Socket Event] already_connected_elsewhere: Lobiyə yönləndirilir...");
         window.location.href = '../lobby/test_odalar.html';
    });
    console.log("[OdaIci Client v4-logs | Socket Setup] Dinləyici quraşdırıldı: 'already_connected_elsewhere'");
    // ----- YENİ SONU -----

    console.log("[OdaIci Client v4-logs | Socket Setup] Bütün oyun hadisə dinləyicilərinin quraşdırılması cəhdi bitdi.");
} // setupGameEventListeners sonu
    console.log("[OdaIci Client v4-logs] --- Part 5/6 Tamamlandı ---");
    // ==============================
    // ===== PART 5/6 SONU ==========
    // ==============================

     // --- Növbəti hissə (Part 6) bu blokun içində davam edəcək ---
 
     // --- Növbəti hissə (Part 6) bu blokun içində davam edəcək ---
     // ====================================================================
    // ===== Part 6/6: Game State Listener, Init & UI Listeners =========
    // ====================================================================
    console.log("[OdaIci Client v4-logs | Part 6] Əsas oyun state listener, başlatma və UI listenerlar təyin edilir...");

    // ----- Əsas Oyun Vəziyyəti Dinləyicisi -----
    /**
     * Serverdən gələn 'game_state_update' hadisəsini emal edir.
     * Bütün UI elementlərini yeni vəziyyətə uyğun olaraq yeniləyir.
     * @param {object} newState - Serverdən göndərilən yeni gameState obyekti.
     */
    function handleGameStateUpdate(newState) {
        console.log("%c[OdaIci Client v4-logs | Socket Event] <<< game_state_update alındı.", "color: cyan; font-weight: bold;", newState); // State-i logla

        if (!newState || typeof newState !== 'object') {
            console.error("[OdaIci Client v4-logs | GameState] Keçərsiz gameState alındı!");
            if(gameStatusDisplay) gameStatusDisplay.textContent = "Serverdən keçərsiz vəziyyət alındı!";
            return;
        }

        const oldPhase = currentGameState?.gamePhase; // Köhnə fazanı saxlayaq (effektlər üçün)
        const oldIsGameOver = currentGameState?.isGameOver; // Köhnə game over statusu

        // Ən son state-i qlobal dəyişəndə saxla
        currentGameState = newState;
        isGameOver = newState.isGameOver === true;
        console.log(`[OdaIci Client v4-logs | GameState] Yeni gameState tətbiq edildi. Phase: ${newState.gamePhase}, GameOver: ${isGameOver}`);

        // --- Oyunçu Vəziyyətlərini və Sıranı Təyin Et ---
        myPlayerState = null;
        opponentPlayerState = null;
        // userId əsasında özümüzü və rəqibi tapaq
        if (socket && loggedInUser && newState.player1?.userId === loggedInUser.id) {
             myPlayerState = newState.player1;
             opponentPlayerState = newState.player2;
             console.log("[OdaIci Client v4-logs | GameState] Mən Oyunçu 1 olaraq təyin edildim.");
        } else if (socket && loggedInUser && newState.player2?.userId === loggedInUser.id) {
             myPlayerState = newState.player2;
             opponentPlayerState = newState.player1;
              console.log("[OdaIci Client v4-logs | GameState] Mən Oyunçu 2 olaraq təyin edildim.");
        } else {
             // Bu client izləyicidir və ya qeyri-müəyyən vəziyyətdədir
             // Hər iki oyunçunu da göstərmək üçün təyin edək
             myPlayerState = newState.player1;
             opponentPlayerState = newState.player2;
             console.warn("[OdaIci Client v4-logs | GameState] Bu client üçün spesifik oyunçu slotu təyin edilə bilmədi (izləyici?).");
        }

        isMyTurn = !!(myPlayerState && myPlayerState.symbol && myPlayerState.symbol === newState.currentPlayerSymbol && newState.gamePhase === 'playing' && !isGameOver && !myPlayerState.isDisconnected);
        isOpponentPresent = !!(opponentPlayerState?.socketId && !opponentPlayerState.isDisconnected);
        // isCurrentUserCreator serverdən gələn room_info ilə təyin olunmalıdır, burada yox.
        // currentRoomData istifadə edərək təyin edək (əgər varsa)
        isCurrentUserCreator = loggedInUser && currentRoomData.creatorUsername === loggedInUser.nickname;

        console.log(`[OdaIci Client v4-logs | GameState] Vəziyyət Təyini: isMyTurn=${isMyTurn}, isOpponentPresent=${isOpponentPresent}, isCurrentUserCreator=${isCurrentUserCreator}`);

        // --- Lövhə Ölçüsü Dəyişikliklərini Yoxla ---
        if (newState.boardSize && typeof newState.boardSize === 'number' && newState.boardSize >= 3 && newState.boardSize <= 6 && newState.boardSize !== boardSize) {
            console.warn(`[OdaIci Client v4-logs | GameState] Lövhə ölçüsü dəyişdi! Server: ${newState.boardSize}, Client: ${boardSize}. Lövhə yenidən yaradılır.`);
            boardSize = newState.boardSize;
            createBoard(); // Yeni ölçüdə lövhə yarat
        } else if (!newState.boardSize || newState.boardSize < 3 || newState.boardSize > 6) {
            console.error(`[OdaIci Client v4-logs | GameState] XƏTA: Serverdən etibarlı lövhə ölçüsü (${newState.boardSize}) alınmadı!`);
            // Bəlkə defaulta qayıtmaqdansa, error göstərmək daha yaxşıdır?
            // boardSize = 3; createBoard();
        }

        // --- UI Yeniləmə Funksiyalarını Çağır ---
        console.log("[OdaIci Client v4-logs | GameState] UI yeniləmə funksiyaları çağırılır...");
        updatePlayerInfo();           // Oyunçu panelləri
        updateGameStatusAndModals(); // Alt status, Zər/Simvol modalları
        updateTurnIndicator();        // Üst sıra göstəricisi
        updateHeaderButtonsVisibility(); // Edit/Kick düymələri
        updateBoardUI(newState.board || [], isMyTurn, isGameOver, newState.winningCombination || []); // Oyun lövhəsi
        updateRestartButtonsUI();     // Restart/Accept/Decline düymələri
        console.log("[OdaIci Client v4-logs | GameState] UI yeniləmə funksiyaları çağırıldı (bitdi).");

        // --- Oyun Sonu Effektləri ---
        const gameJustFinished = isGameOver && oldIsGameOver === false; // Oyun məhz indi bitdi?
        if (gameJustFinished && newState.winnerSymbol && newState.winnerSymbol !== 'draw') {
            console.log("[OdaIci Client v4-logs | GameState] Oyun bitdi, qalib var. Shatter effekti çağırılır.");
            triggerShatterEffect(newState.winnerSymbol);
        } else if (!isGameOver && fireworksOverlay?.classList.contains('visible')) {
            // Əgər oyun yenidən başlayıbsa və effekt hələ də görünürsə, gizlət
             console.log("[OdaIci Client v4-logs | GameState] Oyun davam edir/yenidən başlayıb, fişənglər gizlədilir.");
             hideFireworks();
        }

        // --- Hərəkət Emalı Bayrağını Sıfırla ---
        if (isProcessingMove) {
            console.log("[OdaIci Client v4-logs | GameState] isProcessingMove = false edilir (gameStateUpdate alındı).");
            isProcessingMove = false;
            // Lövhə kliklənməsini bərpa et (əgər sıra bizdədirsə)
            if (boardElement && !isGameOver && newState.gamePhase === 'playing' && isMyTurn) {
                 boardElement.style.pointerEvents = 'auto';
                  console.log("[OdaIci Client v4-logs | GameState] Lövhə pointerEvents 'auto' edildi.");
            }
        }

        console.log("%c[OdaIci Client v4-logs | GameState] <<< game_state_update emalı bitdi. >>>", "color: cyan;");
    } // handleGameStateUpdate sonu


    // ---- Oyunu Başlatma Funksiyası ----
    /**
     * Səhifə yükləndikdən və autentifikasiya yoxlandıqdan sonra çağırılır.
     * İlkin UI elementlərini qurur və serverə socket bağlantısını başladır.
     */
    async function initializeGame() {
        console.log("[OdaIci Client v4-logs | Init] initializeGame çağırıldı.");
        showLoadingOverlay('Oyun interfeysi qurulur...');

        try {
            console.log("[OdaIci Client v4-logs | Init] URL parametrləri alınır...");
            const params = getUrlParams();
            currentRoomId = params.roomId;
            boardSize = params.size; // Lövhə ölçüsünü URL-dən al
            currentRoomData = { id: currentRoomId, name: params.roomName, boardSize: boardSize }; // İlkin otaq datası
            console.log(`[OdaIci Client v4-logs | Init] Parametrlər: RoomID=${currentRoomId}, Name='${params.roomName}', Size=${boardSize}`);

            if (!currentRoomId) {
                throw new Error("Multiplayer oyunu üçün Otaq ID tapılmadı!");
            }

            console.log("[OdaIci Client v4-logs | Init] İlkin UI qurulur...");
            if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(params.roomName)}`;
            else console.warn("[OdaIci Client v4-logs | Init] roomNameDisplay elementi tapılmadı.");

            // İlkin oyunçu adlarını təyin et (hələlik)
            if (player1NameDisplay && loggedInUser) player1NameDisplay.textContent = escapeHtml(loggedInUser.nickname);
            else if (player1NameDisplay) player1NameDisplay.textContent = 'Siz (?)';
            else console.warn("[OdaIci Client v4-logs | Init] player1NameDisplay elementi tapılmadı.");

            if (player2NameDisplay) player2NameDisplay.textContent = "Gözlənilir...";
            else console.warn("[OdaIci Client v4-logs | Init] player2NameDisplay elementi tapılmadı.");

            // Lövhəni yarat
            createBoard();

            // Başlıq düymələrini yenilə (hələlik yaradan məlum deyil, gizli qalacaq)
            updateHeaderButtonsVisibility();

            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Serverə qoşulunur...';
            else console.warn("[OdaIci Client v4-logs | Init] gameStatusDisplay elementi tapılmadı.");

            console.log("[OdaIci Client v4-logs | Init] setupGameSocketConnection çağırılır...");
            setupGameSocketConnection(currentRoomId); // Socket bağlantısını başlat
            console.log("[OdaIci Client v4-logs | Init] setupGameSocketConnection çağırışı bitdi (bağlantı prosesi başladı).");

            console.log(`[OdaIci Client v4-logs | Init] initializeGame: İlkin quraşdırma tamamlandı. Socket bağlantısı qurulur...`);

        } catch (initError) {
             console.error("[OdaIci Client v4-logs | Init] initializeGame XƏTASI:", initError);
             hideLoadingOverlay();
             if(gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yüklənərkən kritik xəta!";
             if(turnIndicator) turnIndicator.textContent = "Xəta";
             alert(`Oyun interfeysini qurarkən xəta baş verdi: ${initError.message}\nLobiyə yönləndirilirsiniz.`);
              window.location.href = '../lobby/test_odalar.html';
        }
    } // initializeGame sonu


    // ---- Əsas UI Hadisə Dinləyiciləri ----
    console.log("[OdaIci Client v4-logs | Init] Əsas UI hadisə dinləyiciləri qoşulur...");

    // Ayrılma Düyməsi
    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', () => {
            console.log("[OdaIci Client v4-logs | UI Listener] 'Otaqdan Ayrıl' klikləndi.");
            if (confirm("Otaqdan çıxmaq istədiyinizə əminsiniz? Bu əməliyyat geri qaytarılmazdır.")) {
                 console.log("[OdaIci Client v4-logs | UI Listener] Ayrılma təsdiqləndi.");
                if (socket?.connected) {
                    console.log("[OdaIci Client v4-logs | UI Listener] ---> EMIT: 'leave_room'");
                    socket.emit('leave_room'); // Serverə bildir
                    // Server 'room_deleted_kick' və ya başqa bir event göndərib yönləndirməlidir,
                    // amma ehtiyat üçün biz də yönləndirək bir müddət sonra.
                    showLoadingOverlay("Otaqdan ayrılırsınız...");
                    setTimeout(() => { window.location.href = '../lobby/test_odalar.html'; }, 1500);
                } else {
                    console.warn("[OdaIci Client v4-logs | UI Listener] Socket bağlı deyil, birbaşa yönləndirilir.");
                    window.location.href = '../lobby/test_odalar.html'; // Socket yoxdursa birbaşa yönləndir
                }
            } else {
                 console.log("[OdaIci Client v4-logs | UI Listener] Ayrılma ləğv edildi.");
            }
        });
        console.log("[OdaIci Client v4-logs | Init] Listener qoşuldu: leaveRoomBtn");
    } else console.warn("[OdaIci Client v4-logs | Init] leaveRoomBtn tapılmadı!");

    // Yenidən Başlat Düyməsi
    if (restartGameBtn) {
        restartGameBtn.addEventListener('click', handleRestartGame); // Bu funksiya həm təklif, həm qəbul edir
        console.log("[OdaIci Client v4-logs | Init] Listener qoşuldu: restartGameBtn");
    } else console.warn("[OdaIci Client v4-logs | Init] restartGameBtn tapılmadı!");
    // Qeyd: Rədd et düyməsi dinamik yaradılır, listener updateRestartButtonsUI içində qoşulur.

    // Otaq Ayarları Düyməsi
    if (editRoomBtn) {
        editRoomBtn.addEventListener('click', openEditModal);
        console.log("[OdaIci Client v4-logs | Init] Listener qoşuldu: editRoomBtn");
    } else console.warn("[OdaIci Client v4-logs | Init] editRoomBtn tapılmadı!");

    // Rəqibi Çıxart Düyməsi
    if (kickOpponentBtn) {
        kickOpponentBtn.addEventListener('click', handleKickOpponent);
        console.log("[OdaIci Client v4-logs | Init] Listener qoşuldu: kickOpponentBtn");
    } else console.warn("[OdaIci Client v4-logs | Init] kickOpponentBtn tapılmadı!");

    // Otaq Ayarları Modalı Düymələri
    if (saveRoomChangesBtn) {
        saveRoomChangesBtn.addEventListener('click', saveRoomChanges);
        console.log("[OdaIci Client v4-logs | Init] Listener qoşuldu: saveRoomChangesBtn");
    } else if (editRoomModal) console.warn("[OdaIci Client v4-logs | Init] saveRoomChangesBtn tapılmadı!");

    if (deleteRoomConfirmBtn) {
        deleteRoomConfirmBtn.addEventListener('click', deleteRoom);
        console.log("[OdaIci Client v4-logs | Init] Listener qoşuldu: deleteRoomConfirmBtn");
    } else if (editRoomModal) console.warn("[OdaIci Client v4-logs | Init] deleteRoomConfirmBtn tapılmadı!");

    if (closeEditModalButton) {
        closeEditModalButton.addEventListener('click', () => { console.log("[OdaIci Client v4-logs | UI Listener] Edit modal bağlama düyməsi klikləndi."); hideModal(editRoomModal); });
        console.log("[OdaIci Client v4-logs | Init] Listener qoşuldu: closeEditModalButton");
    } else if (editRoomModal) console.warn("[OdaIci Client v4-logs | Init] closeEditModalButton tapılmadı!");

    // Modal Xaricinə Klikləmə
    window.addEventListener('click', (event) => {
        if (editRoomModal && event.target == editRoomModal) {
             console.log("[OdaIci Client v4-logs | UI Listener] Edit modal xaricinə klikləndi.");
             hideModal(editRoomModal);
        }
        // Zər və Simvol modalları üçün də eyni məntiq əlavə edilə bilər (əgər istenirsə)
        // if (diceRollModal && event.target == diceRollModal) { hideModal(diceRollModal); }
        // if (symbolSelectModal && event.target == symbolSelectModal) { hideModal(symbolSelectModal); }
    });
    console.log("[OdaIci Client v4-logs | Init] Listener qoşuldu: window (modal xarici klik)");

    // Zər Sürükləmə/Klikləmə Dinləyiciləri
    if (diceCubeElement) {
         diceCubeElement.addEventListener('mousedown', handleMouseDown);
         diceCubeElement.addEventListener('touchstart', handleTouchStart, { passive: false });
         // mousemove/up və touchmove/end document-ə qoşulur ki, zərin üstündən çıxsa belə işləsin
         document.addEventListener('mousemove', handleMouseMove);
         document.addEventListener('mouseup', handleMouseUp);
         document.addEventListener('touchmove', handleTouchMove, { passive: false });
         document.addEventListener('touchend', handleTouchEnd);
         initDice(); // Zəri başlanğıc vəziyyətinə gətir
         console.log("[OdaIci Client v4-logs | Init] Zər üçün mouse/touch listenerlar qoşuldu.");
    } else { console.error("[OdaIci Client v4-logs | Init] Zər listenerları qoşula bilmədi: diceCubeElement tapılmadı!"); }

    // Simvol Seçimi Düymələri
    if (symbolOptionsDiv) {
         symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => {
              button.addEventListener('click', handleSymbolChoice);
         });
         console.log("[OdaIci Client v4-logs | Init] Simvol seçimi düymələrinə listenerlar qoşuldu.");
    } else if (symbolSelectModal) { console.error("[OdaIci Client v4-logs | Init] Simvol listenerları qoşula bilmədi: symbolOptionsDiv tapılmadı!"); }


    console.log("[OdaIci Client v4-logs | Init] Əsas UI hadisə dinləyicilərinin qoşulması tamamlandı.");

    console.log("[OdaIci Client v4-logs] --- Part 6/6 Tamamlandı ---");
    console.log("[OdaIci Client v4-logs] --- oda_icimulti.js faylı tamamlandı ---");
// ==============================
// ===== PART 6/6 SONU ==========
// ==============================


}); // <<<--- DOMContentLoaded Listener-inin ƏN SON BAĞLANMASI ---<<<

// ============================================
// ===== oda_icimulti.js Faylının Sonu ======
// ============================================