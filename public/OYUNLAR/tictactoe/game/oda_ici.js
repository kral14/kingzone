// public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: Socket.IO + Session Auth (Tam Kod)

// ===== GİRİŞ YOXLAMASI (Session ilə) =====
// DOMContentLoaded burada ayrıca yazırıq, çünki bu fayl özü yüklənəndə yoxlama etməlidir.
document.addEventListener('DOMContentLoaded', async () => { // async etdik
    let loggedInUser = null; // Giriş etmiş istifadəçi məlumatları

    try {
        const response = await fetch('/check-auth'); // Serverə yoxlama sorğusu
        const data = await response.json();
        if (!response.ok || !data.loggedIn) {
            console.log("oda_ici.js: Giriş edilməyib (check-auth), login səhifəsinə yönləndirilir...");
            // Yolun düzgün olduğundan əmin olun (oda_ici.html-dən login.html-ə)
            window.location.href = '../../ANA SEHIFE/login/login.html';
            return; // Scriptin qalanı işləməsin
        }
        // Giriş edilib, istifadəçi məlumatları data.user obyektindədir
        loggedInUser = data.user;
        console.log(`oda_ici.js: Giriş edilib: ${loggedInUser.nickname}`);

        // Giriş uğurlu oldusa, oyunun qalanını başladan funksiyanı çağırırıq
        initializeGame(loggedInUser);

    } catch (error) {
        console.error("oda_ici.js: Auth yoxlama xətası:", error);
        window.location.href = '../../ANA SEHIFE/login/login.html'; // Xəta olarsa da girişə yönləndir
        return;
    }
});
// =======================================


// ===== OYUNUN ƏSAS MƏNTİQİ (initializeGame funksiyası içində) =====
function initializeGame(loggedInUserData) {
    // loggedInUserData.nickname, loggedInUserData.id kimi məlumatları burada istifadə edə bilərsiniz

    console.log("Oda İçi JS (Session Auth ilə) Başladı.");
    console.log("Giriş etmiş istifadəçi (oyun üçün):", loggedInUserData);

    // ---- Element Referansları ----
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
    let editRoomBtn = document.getElementById('edit-room-btn');
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
    const kickOpponentBtn = document.getElementById('kick-opponent-btn');
    const callSnowBtn = document.getElementById('call-snow-btn');
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

    // ---- Oyun Durumu Dəyişənləri ----
    let board = [];
    let currentPlayer = '';
    let isGameOver = true;
    let boardSize = 3;
    let cells = [];
    let winningCombination = [];
    let currentRoomId = 'Bilinməyən';
    let currentPlayerName = 'Oyunçu';
    let opponentPlayerName = 'Rəqib';
    let isCurrentUserCreator = false;
    let isOpponentPresent = false;
    let player1Symbol = '?';
    let player2Symbol = '?';
    let player1Roll = null;
    let player2Roll = null;
    let diceWinner = null;
    let currentRoomData = {};
    let aiPlayerSymbol = '';
    let isPlayingAgainstAI = false;

    // ---- Zar Değişkenleri ----
    let isDiceRolling = false;
    let currentDiceRotateX = 0; let currentDiceRotateY = 0; let currentDiceRotateZ = 0;
    const diceRotations = {
        1: { x: 0, y: 0 },      // Üst üz 1
        6: { x: 0, y: 180 },    // Üst üz 6 (1-in əksi)
        4: { x: 0, y: 90 },     // Üst üz 4
        3: { x: 0, y: -90 },    // Üst üz 3
        2: { x: -90, y: 0 },    // Üst üz 2
        5: { x: 90, y: 0 }      // Üst üz 5 (2-nin əksi)
    };
    let isDragging = false; let dragStartX, dragStartY, previousMouseX, previousMouseY;
    const dragThreshold = 10; const rotateSensitivity = 0.4; let initialCenterZ = -55;

    // --- Yardımçı Fonksiyonlar ---
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'info', duration = 3000) => {
        if(el) {
            el.textContent = msg; el.className = `message ${type}`;
            if (el.timeoutId) clearTimeout(el.timeoutId);
            if (duration > 0) {
                el.timeoutId = setTimeout(() => { if (el.textContent === msg) { el.textContent = ''; el.className = 'message'; } }, duration);
            }
        }
     };
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return String(unsafe);
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // <<<--- OTAQ ADI DÜZƏLİŞİ BURADA: getUrlParams funksiyası ---<<<
    function getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const sizeParam = parseInt(params.get('size') || '3', 10);
        const validatedSize = Math.max(3, Math.min(6, sizeParam));
        const urlAiParam = params.get('ai');
        let playWithAI = urlAiParam === 'SNOW' || urlAiParam === 'true';
        // <<<--- Otaq adını URL-dən alırıq ---<<<
        const roomNameParam = decodeURIComponent(params.get('roomName') || 'Bilinməyən Otaq');

        return {
            roomId: params.get('roomId') || 'BilinməyənOda',
            // <<<--- Obyektə əlavə edirik ---<<<
            roomName: roomNameParam,
            playerName: decodeURIComponent(params.get('playerName') || 'Qonaq'),
            size: validatedSize,
            ai: playWithAI
        };
    }

    // --- Başlanğıc Funksiyaları ---
    // <<<--- OTAQ ADI DÜZƏLİŞİ BURADA: initGame funksiyası ---<<<
    function initGame(initialSize = null) {
        console.log("[initGame] Başladı.");
        showLoadingOverlay();

        try {
            const params = getUrlParams();
            currentRoomId = params.roomId;
            currentPlayerName = params.playerName;
            // <<<--- Alınan adı dəyişənə mənimsədirik ---<<<
            const receivedRoomName = params.roomName;
            boardSize = initialSize || params.size || 3;
            isPlayingAgainstAI = params.ai;
            isOpponentPresent = isPlayingAgainstAI;
            opponentPlayerName = isPlayingAgainstAI ? "SNOW" : "Rəqib Gözlənilir...";
            isCurrentUserCreator = !isPlayingAgainstAI; // Sadələşdirilmiş: AI deyilsə qurucudur

            // Mövcud otaq məlumatlarını simulyasiya edirik
            currentRoomData = {
                 id: currentRoomId,
                 // <<<--- Alınan adı istifadə edirik ---<<<
                 name: receivedRoomName,
                 creatorUsername: isCurrentUserCreator ? currentPlayerName : "Sistem", // Serverdən qurucunu almalı
                 hasPassword: false, // Serverdən almalı (bu da ötürülə bilər)
                 boardSize: boardSize,
                 isAiRoom: currentRoomId.startsWith('snow_') || isPlayingAgainstAI // AI otağı olub olmadığını daha dəqiq yoxla
            };
            // <<<--- Konsol mesajını yeniləyirik ---<<<
            console.log(`[initGame] Parametrlər: User=${currentPlayerName}, RoomID=${currentRoomId}, RoomName=${receivedRoomName}, Size=${boardSize}, AI=${isPlayingAgainstAI}, Creator=${isCurrentUserCreator}`);

            try {
                const diceSizeValue = getComputedStyle(document.documentElement).getPropertyValue('--dice-size').trim();
                if (diceSizeValue) initialCenterZ = parseFloat(diceSizeValue.replace('px','')) / -2;
            } catch(e) { console.error("[initGame] CSS --dice-size alınarkən xəta:", e); initialCenterZ = -55; }

            // Artıq düzgün otaq adı göstəriləcək
            if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(currentRoomData.name)}`;

            if (playerXNameDisplay) playerXNameDisplay.textContent = currentPlayerName;
            if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;

            updateHeaderButtonsVisibility(); // Düymələri yenilə

            // Edit düyməsi listener-ını yenidən əlavə etmək
            if (editRoomBtn && editRoomBtn.style.display !== 'none') {
                 const newEditBtn = editRoomBtn.cloneNode(true);
                 editRoomBtn.parentNode.replaceChild(newEditBtn, editRoomBtn);
                 editRoomBtn = newEditBtn;
                 editRoomBtn.addEventListener('click', openEditModal);
            }

            if (restartGameBtn) restartGameBtn.disabled = true;

            adjustStylesForBoardSize(boardSize);
            createBoard();
            resetGameStateVars();
            updatePlayerInfo();
            boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';

            if (isOpponentPresent) {
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'Zər atmağa hazırlaşın...';
             } else {
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'Rəqib gözlənilir... (və ya SNOW-u çağırın)';
             }

            console.log(`[initGame] Oyun interfeysi quruldu.`);

            const loadingScreenDuration = 300;
            setTimeout(() => {
                hideLoadingOverlay();
                try {
                    if (isOpponentPresent) {
                        console.log("[initGame] Rəqib hazır, zər atma modalı göstərilir.");
                        setupDiceModalForRollOff(); showModal(diceRollModal); initDice(); // Zər fix
                    } else {
                        console.log("[initGame] Rəqib yoxdur, gözləmə vəziyyəti.");
                    }
                } catch (callbackError) { console.error("[initGame] setTimeout callback xətası:", callbackError); }
            }, loadingScreenDuration);

            console.log("[initGame] Bitdi.");

        } catch (initError) {
            console.error("[initGame] Ümumi xəta:", initError);
            hideLoadingOverlay();
            if(gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yüklənərkən xəta baş verdi.";
        }
    }

    // === REAL OYUNÇU QOŞULMA MƏNTİQİ (KONSEPTUAL) ===
    function handleRealPlayerJoin(newPlayerData) {
        console.log("Real oyunçu qoşuldu:", newPlayerData);
        if (!isPlayingAgainstAI || !isCurrentUserCreator) return;
        if (confirm(`${newPlayerData.name} otağa qoşuldu. SNOW əvəzinə onunla oynamaq istəyirsiniz?`)) {
            console.log("Oyunçu real rəqiblə oynamağı seçdi.");
            handleKickOpponent(true); // AI-ni sistem tərəfindən kick et
            opponentPlayerName = newPlayerData.name;
            isOpponentPresent = true;
            isPlayingAgainstAI = false;
            aiPlayerSymbol = '';
            if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;
            updateHeaderButtonsVisibility();
            resetGameStateVars();
            resetBoardAndStatus();
            if (gameStatusDisplay) gameStatusDisplay.textContent = `${opponentPlayerName} qoşuldu. Zər atılır...`;
            setupDiceModalForRollOff();
            showModal(diceRollModal);
            initDice();
        } else {
            console.log("Oyunçu SNOW ilə oynamağa davam etməyi seçdi.");
            // socket.emit('room_busy', newPlayerData.id);
        }
    }

    function showLoadingOverlay() {
        if(gameLoadingOverlay) gameLoadingOverlay.classList.add('visible');
        else console.error("gameLoadingOverlay elementi tapılmadı!");
    }
    function hideLoadingOverlay() {
        if(gameLoadingOverlay) gameLoadingOverlay.classList.remove('visible');
    }

    // <<<--- KICK SNOW DÜZƏLİŞİ BURADA: updateHeaderButtonsVisibility funksiyası ---<<<
    function updateHeaderButtonsVisibility() {
        const showEdit = isCurrentUserCreator && !isPlayingAgainstAI && !currentRoomData.isAiRoom;
        // Kick düyməsi: Qurucusan VƏ rəqib var (AI VƏ YA REAL)
        const showKick = isCurrentUserCreator && isOpponentPresent; // <<<--- !isPlayingAgainstAI şərti qaldırıldı
        const showCallSnow = isCurrentUserCreator && !isOpponentPresent;

        if (editRoomBtn) editRoomBtn.style.display = showEdit ? 'inline-flex' : 'none';
        if (kickOpponentBtn) kickOpponentBtn.style.display = showKick ? 'inline-flex' : 'none'; // Artıq AI olanda da görünə bilər
        if (callSnowBtn) callSnowBtn.style.display = showCallSnow ? 'inline-flex' : 'none';
        console.log(`[updateHeaderButtonsVisibility] Düymə görünüşləri: Edit=${showEdit}, Kick=${showKick}, CallSnow=${showCallSnow}`);
    }

    function adjustStylesForBoardSize(size) {
        let cellSizeVar = '--cell-size-large-dynamic';
        if (size === 4) cellSizeVar = '--cell-size-medium-dynamic';
        else if (size >= 5) cellSizeVar = '--cell-size-small-dynamic';
        document.documentElement.style.setProperty('--current-cell-size', `var(${cellSizeVar})`);
        document.documentElement.style.setProperty('--current-font-size', `calc(var(${cellSizeVar}) * 0.6)`);
        document.documentElement.style.setProperty('--board-size', size);
        console.log(`[adjustStylesForBoardSize] Lövhə stili ${size}x${size} üçün ayarlandı.`);
    }

    function createBoard() {
        if (!boardElement) return;
        boardElement.innerHTML = ''; cells = [];
        for (let i = 0; i < boardSize * boardSize; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell'); cell.dataset.index = i;
            boardElement.appendChild(cell); cells.push(cell);
        }
        console.log(`[createBoard] ${boardSize * boardSize} ölçülü lövhə yaradıldı.`);
    }

    function resetGameStateVars() {
        board = Array(boardSize * boardSize).fill(''); currentPlayer = '';
        isGameOver = true; winningCombination = [];
        player1Symbol = '?'; player2Symbol = '?';
        player1Roll = null; player2Roll = null; diceWinner = null;
        // aiPlayerSymbol is not reset here, it depends on isPlayingAgainstAI which might persist
        console.log("[resetGameStateVars] Oyun dəyişənləri sıfırlandı.");
    }

    function resetBoardAndStatus() {
        console.log("[resetBoardAndStatus] Lövhə və status sıfırlanır.");
        if (gameStatusDisplay) { gameStatusDisplay.textContent = ''; gameStatusDisplay.className = 'game-status'; }
        cells.forEach((cell, index) => {
            const newCell = cell.cloneNode(true);
            newCell.className = 'cell'; newCell.textContent = '';
            newCell.style.cursor = 'not-allowed'; newCell.style.animation = '';
            cell.parentNode.replaceChild(newCell, cell);
            cells[index] = newCell;
        });
        updatePlayerInfo();
        boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';
        if (restartGameBtn) restartGameBtn.disabled = true;
        hideFireworks();
    }

    // ---- Zar Funksiyaları ----
    function setupDiceModalForRollOff() {
        if (isDiceRolling) return;
        console.log("[setupDiceModalForRollOff] Zər modalı mübarizə üçün ayarlanır.");
        if (diceInstructions) {
            diceInstructions.textContent = 'Başlayanı təyin etmək üçün zərə klikləyin və ya sürükləyin.';
            diceInstructions.classList.add('opponent-joined');
            diceInstructions.classList.remove('waiting');
        }
        if (yourRollResultDisplay) yourRollResultDisplay.textContent = '?';
        if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = '?';
        if (yourRollBox) yourRollBox.className = 'result-box';
        if (opponentRollBox) opponentRollBox.className = 'result-box';
        player1Roll = null; player2Roll = null; diceWinner = null;
        if(diceCubeElement) diceCubeElement.style.cursor = 'grab';
        initDice();
    }

    // <<<--- ZƏR ORİYENTASİYA DÜZƏLİŞİ BURADA: initDice funksiyası ---<<<
    function initDice() {
        if (!diceCubeElement) return;
        diceCubeElement.style.transition = 'none';
        // Zəri daha düz vəziyyətdə başlat
        currentDiceRotateX = 0;
        currentDiceRotateY = 0;
        currentDiceRotateZ = 0;
        setDiceTransform();
        diceCubeElement.style.cursor = isOpponentPresent ? 'grab' : 'not-allowed';
        console.log("[initDice] Zər başlanğıc mövqeyinə gətirildi (daha düz).");
    }

    function handleDiceClickOrDragEnd() {
        console.log("[handleDiceClickOrDragEnd] Başladı.");
        if (isDiceRolling || !isOpponentPresent) {
            console.log(`[handleDiceClickOrDragEnd] Bloklandı (rolling=${isDiceRolling}, opponent=${isOpponentPresent})`);
            if (!isDiceRolling && isOpponentPresent && diceCubeElement) diceCubeElement.style.cursor = 'grab';
            isDragging = false;
            return;
        }
        if (isDragging) {
            console.log("[handleDiceClickOrDragEnd] Sürükləmə bitdi, zər atılmır.");
            isDragging = false;
             if (isOpponentPresent && diceCubeElement) diceCubeElement.style.cursor = 'grab';
            return;
        }
        if (diceWinner === null) {
             console.log("[handleDiceClickOrDragEnd] Klik aşkarlandı, zər atılır...");
             rollDice();
        } else {
             console.log("[handleDiceClickOrDragEnd] Klik aşkarlandı, amma zər nəticəsi artıq bəlli.");
        }
    }

    function rollDice() {
        if (isDiceRolling || !isOpponentPresent || !diceCubeElement) return;
        isDiceRolling = true;
        console.log("[rollDice] Zər atılır...");
        diceCubeElement.style.cursor = 'default';
        if(yourRollBox) yourRollBox.className = 'result-box';
        if(opponentRollBox) opponentRollBox.className = 'result-box';
        const myRoll = Math.floor(Math.random() * 6) + 1;
        const opponentRollValue = Math.floor(Math.random() * 6) + 1;
        console.log(`[rollDice] Atışlar: Sizin=${myRoll}, Rəqib=${opponentRollValue}`);
        if(yourRollResultDisplay) yourRollResultDisplay.textContent = '?';
        if(opponentRollResultDisplay) opponentRollResultDisplay.textContent = '?';
        if(diceInstructions) diceInstructions.textContent = 'Zarlar atılır...';
        const rollDurationValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-duration').trim() || '2.0s';
        const rollTimingFunctionValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-timing-function').trim() || 'cubic-bezier(0.3, 0.9, 0.4, 1)';
        const finalFace = diceRotations[myRoll];
        const fullRotationsX = 360 * (2 + Math.floor(Math.random() * 2));
        const fullRotationsY = 360 * (2 + Math.floor(Math.random() * 2));
        const fullRotationsZ = 360 * (1 + Math.floor(Math.random() * 1));
        const targetRotateX = finalFace.x + fullRotationsX;
        const targetRotateY = finalFace.y + fullRotationsY;
        const targetRotateZ = 0 + fullRotationsZ;
        diceCubeElement.style.transition = `transform ${rollDurationValue} ${rollTimingFunctionValue}`;
        setDiceTransform(targetRotateX, targetRotateY, targetRotateZ);
        setTimeout(() => {
            console.log("[rollDice] Animasiya bitdi.");
            diceCubeElement.style.transition = 'none';
            currentDiceRotateX = finalFace.x;
            currentDiceRotateY = finalFace.y;
            currentDiceRotateZ = 0;
            // Zərin son vəziyyətini dəyişmirik, atılan üz yuxarıda qalır
            setDiceTransform();
            handleRollOffResults(myRoll, opponentRollValue);
        }, parseFloat(rollDurationValue.replace('s', '')) * 1000 + 100);
    }

    function handleRollOffResults(myRoll, opponentRoll) {
        player1Roll = myRoll; player2Roll = opponentRoll;
        if(yourRollResultDisplay) yourRollResultDisplay.textContent = myRoll;
        if(opponentRollResultDisplay) opponentRollResultDisplay.textContent = opponentRoll;
        console.log(`[handleRollOffResults] Nəticələr: Sizin=${myRoll}, Rəqib=${opponentRoll}`);
        if (myRoll > opponentRoll) {
            diceWinner = currentPlayerName;
            if(diceInstructions) diceInstructions.textContent = 'Siz yüksək atdınız! Simvol seçin.';
            if(yourRollBox) yourRollBox.classList.add('winner');
            triggerDiceScatterAndSymbolSelect();
        } else if (opponentRoll > myRoll) {
            diceWinner = opponentPlayerName;
            if(diceInstructions) diceInstructions.textContent = `${opponentPlayerName} yüksək atdı! ${isPlayingAgainstAI ? 'Simvol avtomatik seçiləcək.' : 'Simvol seçimi gözlənilir.'}`;
            if(opponentRollBox) opponentRollBox.classList.add('winner');
            triggerDiceScatterAndSymbolSelect();
        } else {
            diceWinner = null;
            if(diceInstructions) diceInstructions.textContent = 'Bərabərlik! Təkrar atmaq üçün zərə klikləyin.';
            if(yourRollBox) yourRollBox.classList.add('tie');
            if(opponentRollBox) opponentRollBox.classList.add('tie');
            isDiceRolling = false;
            if (isOpponentPresent && diceCubeElement) diceCubeElement.style.cursor = 'grab';
        }
        console.log(`[handleRollOffResults] Qalib: ${diceWinner === null ? 'Bərabərlik' : diceWinner}`);
    }

    function triggerDiceScatterAndSymbolSelect() {
        if (!diceScene) return;
        console.log("[triggerDiceScatterAndSymbolSelect] Zər dağılır və simvol seçiminə keçilir.");
        diceScene.classList.add('scatter');
        setTimeout(() => {
            hideModal(diceRollModal);
            diceScene.classList.remove('scatter');
            initDice(); // Zəri başlanğıc vəziyyətinə qaytar
            isDiceRolling = false;
            initSymbolSelection();
        }, 600);
    }

    function setDiceTransform(rotX = currentDiceRotateX, rotY = currentDiceRotateY, rotZ = currentDiceRotateZ) {
        if (!diceCubeElement) return;
        const transformString = `translateZ(${initialCenterZ}px) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;
        diceCubeElement.style.transform = transformString;
    }

    function handleMouseDown(event) {
        if (isDiceRolling || !isOpponentPresent) return;
        diceCubeElement.style.transition = 'none'; isDragging = false;
        dragStartX = event.clientX; dragStartY = event.clientY;
        previousMouseX = event.clientX; previousMouseY = event.clientY;
        window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp);
    }
    function handleMouseMove(event) {
        if (isDiceRolling) return;
        const deltaX = event.clientX - previousMouseX; const deltaY = event.clientY - previousMouseY;
        if (!isDragging) { if (Math.abs(event.clientX - dragStartX) > dragThreshold || Math.abs(event.clientY - dragStartY) > dragThreshold) { isDragging = true; if(diceCubeElement) diceCubeElement.style.cursor = 'grabbing'; console.log("Sürükləmə başladı."); } }
        if (isDragging) { currentDiceRotateY += deltaX * rotateSensitivity; currentDiceRotateX -= deltaY * rotateSensitivity; setDiceTransform(currentDiceRotateX, currentDiceRotateY, currentDiceRotateZ); }
        previousMouseX = event.clientX; previousMouseY = event.clientY;
    }
    function handleMouseUp(event) {
        window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp);
        console.log("Mouse Up - Sürükləmə bitdi mi? ", isDragging);
        handleDiceClickOrDragEnd();
    }
    function handleTouchStart(e) {
        if (isDiceRolling || !isOpponentPresent) return;
        diceCubeElement.style.transition = 'none'; isDragging = false; const touch = e.touches[0];
        dragStartX = touch.clientX; dragStartY = touch.clientY;
        previousMouseX = touch.clientX; previousMouseY = touch.clientY;
        diceCubeElement.addEventListener('touchmove', handleTouchMove, { passive: false });
        diceCubeElement.addEventListener('touchend', handleTouchEnd);
        diceCubeElement.addEventListener('touchcancel', handleTouchEnd);
    }
    function handleTouchMove(e) {
        if (isDiceRolling) return; e.preventDefault(); const touch = e.touches[0];
        const deltaX = touch.clientX - previousMouseX; const deltaY = touch.clientY - previousMouseY;
        if (!isDragging) { if (Math.abs(touch.clientX-dragStartX)>dragThreshold || Math.abs(touch.clientY-dragStartY)>dragThreshold) { isDragging = true; console.log("Touch Sürükləmə başladı.");} }
        if (isDragging) { currentDiceRotateY += deltaX*rotateSensitivity; currentDiceRotateX -= deltaY*rotateSensitivity; setDiceTransform(currentDiceRotateX, currentDiceRotateY, currentDiceRotateZ); }
        previousMouseX = touch.clientX; previousMouseY = touch.clientY;
    }
    function handleTouchEnd(e) {
        diceCubeElement.removeEventListener('touchmove', handleTouchMove); diceCubeElement.removeEventListener('touchend', handleTouchEnd); diceCubeElement.removeEventListener('touchcancel', handleTouchEnd);
        console.log("Touch End - Sürükləmə bitdi mi? ", isDragging);
        handleDiceClickOrDragEnd();
    }

    // ---- Simvol Seçim Funksiyaları ----
    function initSymbolSelection() {
        console.log("[initSymbolSelection] Başladı.");
        if (!symbolSelectModal || !symbolOptionsDiv || !symbolWaitingMessage || !symbolSelectTitle || !symbolSelectMessage) { console.error("Simvol seçim modalı elementləri tapılmadı!"); startGameProcedure('X'); return; }
        symbolWaitingMessage.style.display = 'none'; symbolOptionsDiv.style.display = 'flex';
        if (diceWinner === currentPlayerName) {
            symbolSelectTitle.textContent = "Simvol Seçin"; symbolSelectMessage.textContent = "Oyuna başlamaq üçün simvolunuzu seçin:";
            symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => { const newButton = button.cloneNode(true); button.parentNode.replaceChild(newButton, button); newButton.addEventListener('click', handleSymbolChoice); });
        } else {
            symbolSelectTitle.textContent = "Simvol Seçilir"; symbolSelectMessage.textContent = `Oyuna "${opponentPlayerName}" başlayır. ${isPlayingAgainstAI ? 'Simvol avtomatik seçiləcək.' : 'Rəqib simvol seçir...'}`;
            symbolOptionsDiv.style.display = 'none'; symbolWaitingMessage.style.display = 'block';
            const choiceDelay = isPlayingAgainstAI ? 500 : 2000; simulateOpponentSymbolChoice(choiceDelay);
        }
        showModal(symbolSelectModal);
    }
    function handleSymbolChoice(event) {
        const chosenSymbol = event.target.dataset.symbol; if (!chosenSymbol) return;
        console.log(`[handleSymbolChoice] ${currentPlayerName} "${chosenSymbol}" seçdi.`); startGameProcedure(chosenSymbol);
    }
    function simulateOpponentSymbolChoice(delay) {
        const opponentChoice = (Math.random() > 0.5) ? 'X' : 'O';
        console.log(`[simulateOpponentSymbolChoice] Rəqib/AI "${opponentChoice}" seçdi (simulyasiya).`);
        setTimeout(() => { if (symbolSelectModal && symbolSelectModal.style.display === 'block') startGameProcedure(opponentChoice); else console.warn("[simulateOpponentSymbolChoice] Modal artıq bağlı idi."); }, delay);
    }

    // ---- Oyunu Başlatma Proseduru ----
     function startGameProcedure(startingSymbol) {
        console.log(`[startGameProcedure] Oyun "${startingSymbol}" ilə başlayır. Zər qalibi: ${diceWinner}`);
        hideModal(symbolSelectModal);
        if (diceWinner === currentPlayerName) { player1Symbol = startingSymbol; player2Symbol = (startingSymbol === 'X') ? 'O' : 'X'; currentPlayer = player1Symbol; }
        else { player2Symbol = startingSymbol; player1Symbol = (startingSymbol === 'X') ? 'O' : 'X'; currentPlayer = player2Symbol; }
        aiPlayerSymbol = isPlayingAgainstAI ? player2Symbol : '';
        console.log(`[startGameProcedure] Simvollar: P1(${currentPlayerName})=${player1Symbol}, P2(${opponentPlayerName})=${player2Symbol}. Başlayan: ${currentPlayer}`);
        if (isPlayingAgainstAI) console.log(`[startGameProcedure] AI Simvolu: ${aiPlayerSymbol}`);
        isGameOver = false; if (restartGameBtn) restartGameBtn.disabled = false;
        updatePlayerInfo(); updateTurnIndicator();
        if (gameStatusDisplay) { gameStatusDisplay.textContent = `Sıra: ${currentPlayer}`; gameStatusDisplay.className = 'game-status'; }
        boardElement.style.opacity = '1';
        console.log("[startGameProcedure] Hüceyrə listenerları əlavə edilir...");
        cells.forEach((cell, index) => {
            const newCell = cell.cloneNode(true); cell.parentNode.replaceChild(newCell, cell); cells[index] = newCell;
            if (board[index] === '') { cells[index].style.cursor = 'pointer'; cells[index].addEventListener('click', handleCellClick); }
            else { cells[index].style.cursor = 'not-allowed'; }
        });
        console.log("[startGameProcedure] Hüceyrə listenerları əlavə edildi.");
        console.log(`[startGameProcedure] AI sırası yoxlanılır: isGameOver=${isGameOver}, isAI=${isPlayingAgainstAI}, current=${currentPlayer}, aiSymbol=${aiPlayerSymbol}`);
        if (!isGameOver && isPlayingAgainstAI && currentPlayer === aiPlayerSymbol) {
            console.log("[startGameProcedure] AI başlayır, makeAIMove çağırılır.");
            boardElement.style.pointerEvents = 'none'; makeAIMove();
        } else if (!isGameOver) {
            console.log("[startGameProcedure] İnsan başlayır, lövhə aktiv edilir.");
            boardElement.style.pointerEvents = 'auto';
        } else { console.log("[startGameProcedure] Oyun bitmiş vəziyyətdədir?"); }
         console.log("[startGameProcedure] Bitdi.");
    }

    // Oyunçu Məlumatlarını Yenilə
    function updatePlayerInfo() {
        if (!playerXInfo || !playerOInfo || !playerXSymbolDisplay || !playerOSymbolDisplay || !playerXNameDisplay || !playerONameDisplay) { console.error("Oyunçu məlumat elementləri tapılmadı!"); return; }
        if (player1Symbol === '?' || player2Symbol === '?') {
             playerXSymbolDisplay.textContent = '?'; playerOSymbolDisplay.textContent = '?';
             playerXNameDisplay.textContent = currentPlayerName; playerONameDisplay.textContent = opponentPlayerName;
             playerXInfo.classList.remove('active-player', 'player-x', 'player-o'); playerOInfo.classList.remove('active-player', 'player-x', 'player-o'); return;
        }
        playerXSymbolDisplay.textContent = player1Symbol; playerXNameDisplay.textContent = currentPlayerName;
        playerXInfo.className = `player-info ${player1Symbol === 'X' ? 'player-x' : 'player-o'}`;
        playerOSymbolDisplay.textContent = player2Symbol; playerONameDisplay.textContent = opponentPlayerName;
        playerOInfo.className = `player-info ${player2Symbol === 'X' ? 'player-x' : 'player-o'}`;
        playerXInfo.classList.toggle('active-player', currentPlayer === player1Symbol && !isGameOver);
        playerOInfo.classList.toggle('active-player', currentPlayer === player2Symbol && !isGameOver);
      }

    // --- Oyun Axışı ---
    function handleCellClick(event) {
        console.log("[handleCellClick] Başladı.");
        const clickedCell = event.target;
        const index = parseInt(clickedCell.dataset.index);
        if (isGameOver || isDiceRolling || (currentPlayer !== player1Symbol) || board[index] !== '') {
            console.log(`[handleCellClick] Bloklandı (GameOver=${isGameOver}, DiceRolling=${isDiceRolling}, CurrentPlayer=${currentPlayer}, MySymbol=${player1Symbol}, Board[${index}]=${board[index]})`);
             return;
        }
        console.log(`[handleCellClick] İnsan ${index} xanasına ${player1Symbol} qoyur.`);
        placeMark(index, player1Symbol);
        if (!isGameOver) {
            console.log("[handleCellClick] Oyun bitmədi, növbə AI-ya/Rəqibə keçirilir.");
            switchPlayer();
             if (isPlayingAgainstAI && currentPlayer === aiPlayerSymbol) {
                 console.log("[handleCellClick] Sıra AI-da, makeAIMove çağırılır.");
                 boardElement.style.pointerEvents = 'none';
                 makeAIMove();
             } else {
                console.log("[handleCellClick] Sıra digər insana keçdi (AI deyil).");
                updateTurnIndicator();
             }
        } else { console.log("[handleCellClick] Oyun insanın hərəkəti ilə bitdi."); }
    }

    function makeAIMove() {
        if (isGameOver || currentPlayer !== aiPlayerSymbol) { console.log(`[makeAIMove] Bloklandı`); if (!isGameOver && boardElement) boardElement.style.pointerEvents = 'auto'; return; }
        console.log("[makeAIMove] AI (SNOW) düşünür...");
        if (gameStatusDisplay) gameStatusDisplay.textContent = "SNOW oynayır...";
        setTimeout(() => {
            console.log("[makeAIMove] AI setTimeout callback başladı. Lövhə:", [...board]);
            let bestMove = -1;
            try {
                 bestMove = findBestMove();
                 console.log("[makeAIMove] AI üçün ən yaxşı hərəkət tapıldı:", bestMove);
            } catch (aiError) {
                 console.error("[makeAIMove] findBestMove xətası:", aiError);
                 let availableCells = []; for(let i=0; i<board.length; i++) if(board[i]==='') availableCells.push(i);
                 if (availableCells.length > 0) bestMove = availableCells[Math.floor(Math.random() * availableCells.length)];
                 console.error("[makeAIMove] Xəta səbəbiylə təsadüfi hərəkət:", bestMove);
            }
            if (bestMove !== -1 && board[bestMove] === '') {
                placeMark(bestMove, aiPlayerSymbol);
                if (!isGameOver) {
                    console.log("[makeAIMove] AI hərəkət etdi, sıra insana keçir.");
                    switchPlayer(); if (boardElement) boardElement.style.pointerEvents = 'auto'; updateTurnIndicator();
                } else { console.log("[makeAIMove] AI hərəkət etdi və oyun bitdi."); }
            } else {
                console.warn(`[makeAIMove] Etibarlı hərəkət tapılmadı (${bestMove})!`);
                 if (boardElement) boardElement.style.pointerEvents = 'auto';
                if(!checkWinnerForMinimax(board, player1Symbol, aiPlayerSymbol) && !board.includes('')) { console.log("[makeAIMove] Bərabərlik (hərəkət yoxdur)."); endGame(true, null); }
                else { console.warn("[makeAIMove] Hərəkət yoxdur amma oyun bitməyib?"); updateTurnIndicator(); }
            }
             console.log("[makeAIMove] AI setTimeout callback bitdi.");
        }, 500 + Math.random() * 300);
    }

    // <<<--- 4x4 AI DONMA DÜZƏLİŞİ BURADA: findBestMove funksiyası ---<<<
    function findBestMove() {
        console.log(`%c[findBestMove] Başladı. boardSize=${boardSize}, AI Symbol=${aiPlayerSymbol}`, "color: cyan");
        const humanPlayerSymbol = player1Symbol;
        const winLength = (boardSize <= 4) ? 3 : 4;
        const startTime = performance.now();

        if (boardSize === 4) console.log("[findBestMove 4x4] AI Başlanğıc Lövhə:", [...board]);

        // 1. Qazanma Hərəkəti
        for (let i = 0; i < board.length; i++) {
             if (board[i] === '') { board[i] = aiPlayerSymbol; if (checkWin(aiPlayerSymbol)) { board[i] = ''; console.log(`%c[findBestMove] Qazanma hərəkəti: ${i}`, "color: lime"); return i; } board[i] = ''; }
        }

        // 2. Bloklama Hərəkəti
        for (let i = 0; i < board.length; i++) {
             if (board[i] === '') { board[i] = humanPlayerSymbol; if (checkWin(humanPlayerSymbol)) { board[i] = ''; console.log(`%c[findBestMove] Bloklama hərəkəti: ${i}`, "color: yellow"); return i; } board[i] = ''; }
        }

        // 3. Xüsusi Strategiyalar (Böyük lövhələr)
        if (boardSize >= 5) {
             const centerCells = getCenterCells(boardSize);
             const availableCenter = centerCells.filter(index => board[index] === '');
             if (availableCenter.length > 0) { const move = availableCenter[Math.floor(Math.random() * availableCenter.length)]; console.log(`%c[findBestMove] Sadə AI: Mərkəz seçildi: ${move}`, "color: orange"); return move; }
        }
        // 4. Minimax (Kiçik lövhələr)
        else if (boardSize <= 4) {
            console.log(`[findBestMove] Minimax başladı (size=${boardSize})...`);
            let move = -1;
            let score = -Infinity;
            // <<<--- Dərinlik 4-ə Geri Qaytarıldı ---<<<
            let currentMaxDepth = (boardSize === 4) ? 4 : 6; // Donmanın qarşısını almaq üçün 4x4 dərinliyini 4 etdik
            console.log(`[findBestMove] Minimax maxDepth: ${currentMaxDepth}`);

            let analyzedMoves = 0;
            const availableMoves = [];
            for(let i=0; i<board.length; i++) { if(board[i] === '') availableMoves.push(i); }

            for (const i of availableMoves) {
                analyzedMoves++;
                board[i] = aiPlayerSymbol;
                let currentScore = minimax(board, 0, false, humanPlayerSymbol, aiPlayerSymbol, currentMaxDepth);
                board[i] = '';
                 if (boardSize === 4) console.log(`[findBestMove 4x4] Minimax: Hərəkət=${i}, Skor=${currentScore}`);
                if (currentScore > score) {
                    score = currentScore;
                    move = i;
                }
                // Əgər çox uzun çəkirsə, burada bir timeout və ya iteration limiti əlavə etmək olar
                // if (performance.now() - startTime > 1000) { console.warn("Minimax timeout!"); break; }
            }
            const endTime = performance.now();
            console.log(`%c[findBestMove] Minimax bitdi (${analyzedMoves}/${availableMoves.length} hərəkət analiz edildi, ${Math.round(endTime - startTime)}ms). Nəticə: ${move} (Skor: ${score})`, "color: violet");
            if (move !== -1) return move;
             else console.warn("[findBestMove] Minimax hərəkət tapmadı (size <= 4). Təsadüfiyə keçilir...");
        }

        // 5. Təsadüfi Hərəkət
        let availableCells = [];
        for (let i = 0; i < board.length; i++) { if (board[i] === '') availableCells.push(i); }
        if (availableCells.length > 0) {
            const move = availableCells[Math.floor(Math.random() * availableCells.length)];
            console.log(`%c[findBestMove] Təsadüfi boş xana seçildi: ${move}`, "color: orange");
            return move;
        }

        console.error("[findBestMove] Heç bir hərəkət tapılmadı!");
        return -1;
    }

    function getCenterCells(size) {
        const centerIndices = []; const isOdd = size % 2 !== 0;
        if (isOdd) { const center = Math.floor(size / 2); centerIndices.push(center * size + center); }
        else { const c1 = size / 2 - 1; const c2 = size / 2; centerIndices.push(c1 * size + c1); centerIndices.push(c1 * size + c2); centerIndices.push(c2 * size + c1); centerIndices.push(c2 * size + c2); }
        return centerIndices;
    }

    function minimax(currentBoard, depth, isMaximizing, humanSymbol, aiSymbol, maxDepth) {
        let winner = checkWinnerForMinimax(currentBoard, humanSymbol, aiSymbol);
        if (winner === aiSymbol) return 10 - depth;
        if (winner === humanSymbol) return depth - 10;
        if (!currentBoard.includes('')) return 0;
        if (depth >= maxDepth) return 0;

        // if (boardSize === 4 && depth <= 1) console.log(`[Minimax d=${depth} max=${isMaximizing}]`);

        if (isMaximizing) {
            let bestScore = -Infinity;
            for (let i = 0; i < currentBoard.length; i++) {
                if (currentBoard[i] === '') {
                    currentBoard[i] = aiSymbol;
                    bestScore = Math.max(bestScore, minimax(currentBoard, depth + 1, false, humanSymbol, aiSymbol, maxDepth));
                    currentBoard[i] = '';
                }
            }
            return bestScore;
        } else {
            let bestScore = Infinity;
            for (let i = 0; i < currentBoard.length; i++) {
                if (currentBoard[i] === '') {
                    currentBoard[i] = humanSymbol;
                    bestScore = Math.min(bestScore, minimax(currentBoard, depth + 1, true, humanSymbol, aiSymbol, maxDepth));
                    currentBoard[i] = '';
                }
            }
            return bestScore;
        }
    }

    function checkWinnerForMinimax(currentBoard, humanSymbol, aiSymbol) {
        const winConditions = generateWinConditions(boardSize);
        for (const condition of winConditions) { const cell1 = currentBoard[condition[0]]; if (cell1 !== '' && condition.every(index => currentBoard[index] === cell1)) return cell1; } return null;
    }

    function placeMark(index, mark) {
        console.log(`===== placeMark: Index=${index}, Mark=${mark} =====`);
        if (index < 0 || index >= board.length || board[index] !== '' || isGameOver) { console.log(`placeMark: Keçərsiz. Çıxılır.`); return; }
        board[index] = mark;
        const cellElement = cells[index];
        if (!cellElement) { console.error(`placeMark: Hata! cells[${index}] tapılmadı!`); return; }
        cellElement.textContent = mark; cellElement.classList.add(mark);
        cellElement.style.cursor = 'not-allowed';
        const newCell = cellElement.cloneNode(true);
        cellElement.parentNode.replaceChild(newCell, cellElement);
        cells[index] = newCell;
        console.log(`placeMark: ${index} xanası ${mark} ilə dolduruldu.`);
        const win = checkWin(mark); const draw = !win && !board.includes('');
        if (win) { console.log(`placeMark: ${mark} qazandı.`); endGame(false, mark); highlightWinningCells(); }
        else if (draw) { console.log("placeMark: Bərabərlik."); endGame(true, null); }
        else { console.log("placeMark: Oyun davam edir."); }
        console.log("===== placeMark bitdi. =====");
    }

    function switchPlayer() { if(isGameOver) return; currentPlayer = (currentPlayer === player1Symbol) ? player2Symbol : player1Symbol; console.log(`switchPlayer: Yeni sıra: ${currentPlayer}`); }

    function updateTurnIndicator() {
        if (isGameOver) return; console.log(`[updateTurnIndicator] Növbə yenilənir: ${currentPlayer}`);
        if (turnIndicator) { const turnPlayerName = (currentPlayer === player1Symbol) ? currentPlayerName : opponentPlayerName; turnIndicator.textContent = `Sıra: ${turnPlayerName} (${currentPlayer})`; }
        if(gameStatusDisplay && !isGameOver){ const turnPlayerName = (currentPlayer === player1Symbol) ? currentPlayerName : opponentPlayerName; gameStatusDisplay.textContent = `Sıra: ${turnPlayerName}`; gameStatusDisplay.className = 'game-status'; }
        updatePlayerInfo();
    }

    // --- Qazanma/Bərabərlik Yoxlaması ---
    function checkWin(playerSymbolToCheck) {
        winningCombination = []; const winConditions = generateWinConditions(boardSize);
        for (let i = 0; i < winConditions.length; i++) { const condition = winConditions[i]; const firstSymbol = board[condition[0]]; if (firstSymbol !== playerSymbolToCheck || firstSymbol === '') continue;
            let allSame = true; for (let j = 1; j < condition.length; j++) { if (board[condition[j]] !== firstSymbol) { allSame = false; break; } }
            if (allSame) { winningCombination = condition; console.log(`[checkWin] Qazanma tapıldı: ${condition.join(', ')}`); return true; } } return false;
    }
    function generateWinConditions(size) {
        const conditions = []; const winLength = (size === 3 || size === 4) ? 3 : 4;
        for (let r = 0; r < size; r++) { for (let c = 0; c < size; c++) {
                if (c <= size - winLength) { const rowC = []; for (let k = 0; k < winLength; k++) rowC.push(r*size+(c+k)); conditions.push(rowC); }
                if (r <= size - winLength) { const colC = []; for (let k = 0; k < winLength; k++) colC.push((r+k)*size+c); conditions.push(colC); }
                if (r <= size - winLength && c <= size - winLength) { const dia1C = []; for (let k = 0; k<winLength; k++) dia1C.push((r+k)*size+(c+k)); conditions.push(dia1C); }
                if (r <= size - winLength && c >= winLength - 1) { const dia2C = []; for (let k = 0; k<winLength; k++) dia2C.push((r+k)*size+(c-k)); conditions.push(dia2C); } } }
        const uniqueConditions = conditions.map(cond => JSON.stringify(cond.sort((a,b)=>a-b))); const finalConditions = [...new Set(uniqueConditions)].map(str => JSON.parse(str));
        return finalConditions;
    }
    function checkDraw() { return !board.includes(''); }
    function highlightWinningCells() { winningCombination.forEach(index => { if(cells[index]) cells[index].classList.add('winning'); }); }

    // --- Oyun Sonu ---
    function endGame(isDraw, winnerMark) {
        console.log(`[endGame] Oyun bitdi. Bərabərlik: ${isDraw}, Qazanan İşarə: ${winnerMark}`);
        isGameOver = true; boardElement.style.pointerEvents = 'none'; if (restartGameBtn) restartGameBtn.disabled = false;
        const winnerName = winnerMark === player1Symbol ? currentPlayerName : opponentPlayerName;
        if (isDraw) { if (gameStatusDisplay) { gameStatusDisplay.textContent = "Oyun Bərabərə!"; gameStatusDisplay.classList.add('draw'); } if (turnIndicator) turnIndicator.textContent = "Bərabərə"; }
        else { if (gameStatusDisplay) { gameStatusDisplay.textContent = `${winnerName} Qazandı!`; gameStatusDisplay.classList.add('win'); } if (turnIndicator) turnIndicator.textContent = "Bitdi"; triggerShatterEffect(winnerMark); }
        playerXInfo?.classList.remove('active-player'); playerOInfo?.classList.remove('active-player');
    }

    // --- Effektler ---
    function triggerShatterEffect(winnerMark) {
        if (!fireworksOverlay || !shatteringTextContainer || !winnerMark) return; clearShatteringText();
        const text = winnerMark === player1Symbol ? "Siz Qazandınız!" : `${opponentPlayerName} Qazandı!`; const chars = text.split('');
        chars.forEach((char, index) => { const span = document.createElement('span'); span.textContent = char === ' ' ? '\u00A0' : char; span.classList.add('shatter-char'); span.style.setProperty('--char-index', index); shatteringTextContainer.appendChild(span); });
        fireworksOverlay.classList.add('visible'); shatteringTextContainer.style.opacity = '1';
        setTimeout(() => {
            const spans = shatteringTextContainer.querySelectorAll('.shatter-char'); const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-duration').replace('s',''))*1000||3000; const distance = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-distance').replace('px',''))||170;
            spans.forEach((span, i) => { const angle = Math.random()*360; const randDist = Math.random()*distance; const tx = Math.cos(angle*Math.PI/180)*randDist; const ty = Math.sin(angle*Math.PI/180)*randDist; const tz = (Math.random()-0.5)*distance*0.5; const rot = (Math.random()-0.5)*720; const delay = Math.random()*0.1; span.style.setProperty('--tx',`${tx}px`); span.style.setProperty('--ty',`${ty}px`); span.style.setProperty('--tz',`${tz}px`); span.style.setProperty('--rot',`${rot}deg`); span.style.animationDelay=`${delay}s`; span.classList.add('animate'); });
            setTimeout(hideFireworks, duration + 500);
        }, 100);
    }
    function hideFireworks() { if (fireworksOverlay) fireworksOverlay.classList.remove('visible'); if (shatteringTextContainer) shatteringTextContainer.style.opacity = '0'; setTimeout(clearShatteringText, 500); }
    function clearShatteringText() { if (shatteringTextContainer) shatteringTextContainer.innerHTML = ''; }

    // --- Otaq Əməliyyatları ---
    function openEditModal() {
        if (!editRoomModal) { console.error("Oda düzenleme modal elementi tapılmadı!"); alert("Otaq ayarları açılamadı."); return; }
        const nameInput = document.getElementById('edit-room-name');
        const passwordCheck = document.getElementById('edit-room-password-check');
        const passwordInput = document.getElementById('edit-room-password');
        const boardSizeSelect = document.getElementById('edit-board-size');
        const msgElement = document.getElementById('edit-room-message');
        if(nameInput) nameInput.value = currentRoomData.name || '';
        if(passwordCheck) passwordCheck.checked = currentRoomData.hasPassword || false;
        if(passwordInput) { passwordInput.value = ''; passwordInput.style.display = passwordCheck?.checked ? 'block' : 'none'; }
        if(passwordCheck && passwordInput) { passwordCheck.onchange = null; passwordCheck.onchange = () => { passwordInput.style.display = passwordCheck.checked ? 'block' : 'none'; }; }
        if(boardSizeSelect) boardSizeSelect.value = currentRoomData.boardSize.toString();
        if(msgElement) { msgElement.textContent = ''; msgElement.className = 'message'; }
        showModal(editRoomModal);
    }
    function saveRoomChanges() {
         console.log("Otaq dəyişiklikləri yadda saxlanılır...");
         const nameInput = document.getElementById('edit-room-name');
         const passwordCheck = document.getElementById('edit-room-password-check');
         const passwordInput = document.getElementById('edit-room-password');
         const boardSizeSelect = document.getElementById('edit-board-size');
         const msgElement = document.getElementById('edit-room-message');
         const newName = nameInput?.value.trim();
         const newHasPasswordChecked = passwordCheck?.checked;
         const newBoardSize = parseInt(boardSizeSelect?.value || currentRoomData.boardSize.toString(), 10);
         if (!newName) { showMsg(msgElement, 'Otaq adı boş ola bilməz.', 'error'); return; }
         let newPasswordValue = null;
         let finalHasPassword = false;
         if (newHasPasswordChecked) {
             if (!passwordInput) { showMsg(msgElement, 'Şifrə sahəsi tapılmadı!', 'error'); return; }
             newPasswordValue = passwordInput.value;
             if (!newPasswordValue) { showMsg(msgElement, 'Şifrə aktivdirsə, şifrə daxil edilməlidir.', 'error'); return; }
             if (newPasswordValue.length < 2) { showMsg(msgElement, 'Yeni şifrə ən az 2 simvol olmalıdır.', 'error'); return; }
             const hasLetter = /[a-zA-Z]/.test(newPasswordValue);
             const hasDigit = /\d/.test(newPasswordValue);
             if (!hasLetter || !hasDigit) { showMsg(msgElement, 'Şifrə ən az 1 hərf və 1 rəqəm ehtiva etməlidir.', 'error', 5000); return; }
             finalHasPassword = true;
             console.log("Oyun içi şifrə validasiyadan keçdi.");
         } else { finalHasPassword = false; newPasswordValue = null; }
         let needsRestart = false;
         if (currentRoomData.boardSize !== newBoardSize) {
             needsRestart = true;
             currentRoomData.boardSize = newBoardSize;
             boardSize = newBoardSize;
             adjustStylesForBoardSize(boardSize);
         }
         currentRoomData.name = newName;
         currentRoomData.hasPassword = finalHasPassword;
         currentRoomData.dummyPassword = newPasswordValue; // Prototip üçün
         if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(newName)}`;
         console.log("Serverə göndəriləcək məlumatlar (simulyasiya):", { roomId: currentRoomId, name: newName, hasPassword: finalHasPassword, password: newPasswordValue, boardSize: newBoardSize });
         showMsg(msgElement, 'Dəyişikliklər yadda saxlandı (Klient).', 'success', 2500);
         hideModal(editRoomModal);
         if (needsRestart) { console.log("Ölçü dəyişdiyi üçün oyun yenidən başladılır..."); handleRestartGame(); }
    }
    function deleteRoom() {
         console.warn("Otaq silinməsi funksiyası çağırıldı.");
         if (confirm(`'${escapeHtml(currentRoomData.name)}' otağını silmək istədiyinizə əminsiniz? Bu əməliyyat geri qaytarıla bilməz!`)) {
             showMsg(editRoomMessage, 'Otaq silinir...', 'info', 0);
             console.log(`Serverə silmə tələbi (simulyasiya): roomId=${currentRoomId}`);
             setTimeout(() => {
                 alert("Otaq silindi (Simulyasiya).");
                 window.location.href = '../lobby/test_odalar.html?playerName=' + encodeURIComponent(currentPlayerName);
             }, 1500);
         }
    }

    // <<<--- KICK SNOW DÜZƏLİŞİ BURADA: handleKickOpponent funksiyası ---<<<
    function handleKickOpponent(triggeredBySystem = false) {
        // Şərt: Qurucu olmalı VƏ rəqib mövcud olmalıdır (AI VƏ YA REAL)
        if (!isCurrentUserCreator || !isOpponentPresent) {
             console.log(`Kick şərtləri ödənmir: Creator=${isCurrentUserCreator}, OpponentPresent=${isOpponentPresent}`);
             return;
        }

        const opponentToKick = opponentPlayerName;
        const wasAI = isPlayingAgainstAI; // Qovulanın AI olub olmadığını yadda saxla

        if (!triggeredBySystem) {
             // İstifadəçi klikləyibsə təsdiq al
             if (!confirm(`${opponentToKick}-i otaqdan çıxarmaq istədiyinizə əminsiniz?`)) return;
        } else {
            // Sistem tərəfindən çağırılıbsa (məs. real oyunçu qoşulduqda)
            console.log(`${opponentToKick} sistem tərəfindən avtomatik olaraq kick edilir.`);
        }

        console.log(`${opponentToKick} otaqdan çıxarılır (simulyasiya)...`);
        // Serverə müvafiq tələbi göndərmək lazımdır
        // if (wasAI) { console.log("Serverə AI kick siqnalı göndərilir..."); }
        // else { console.log("Serverə real oyunçu kick siqnalı göndərilir..."); }

        // Rəqib məlumatlarını sıfırla
        opponentPlayerName = 'Rəqib Gözlənilir...';
        isOpponentPresent = false;
        isPlayingAgainstAI = false; // Rəqib qovulduğu üçün AI statusu da sıfırlanır
        aiPlayerSymbol = '';

        // UI yeniləmələri
        if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;
        if (playerOSymbolDisplay) playerOSymbolDisplay.textContent = '?';
        if (playerOInfo) playerOInfo.className = 'player-info';
        playerOInfo?.classList.remove('active-player');

        isGameOver = true;
        resetGameStateVars();
        resetBoardAndStatus();

        if (gameStatusDisplay) gameStatusDisplay.textContent = `${opponentToKick} otaqdan çıxarıldı. Rəqib gözlənilir... (və ya SNOW-u çağırın)`;
        if (turnIndicator) turnIndicator.textContent = "Gözlənilir";

        updateHeaderButtonsVisibility(); // "Call Snow" düyməsi görünməlidir
        hideModal(diceRollModal);
        hideModal(symbolSelectModal);

        if (wasAI) { console.log("SNOW (AI) otaqdan çıxarıldı."); }
        else { console.log(`Real oyunçu ${opponentToKick} otaqdan çıxarıldı.`); }
    }

    function handleCallSnow() {
        if (!isCurrentUserCreator || isOpponentPresent) { console.log(`SNOW çağırma şərtləri ödənmir: Creator=${isCurrentUserCreator}, OpponentPresent=${isOpponentPresent}`); return; }
        console.log("SNOW (AI) çağırılır...");
        opponentPlayerName = "SNOW";
        isOpponentPresent = true;
        isPlayingAgainstAI = true;
        if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;
        updateHeaderButtonsVisibility();
        resetGameStateVars();
        resetBoardAndStatus();
        if (gameStatusDisplay) gameStatusDisplay.textContent = "SNOW çağırıldı. Zər atılır...";
        setupDiceModalForRollOff();
        showModal(diceRollModal);
        initDice();
        // Serverə məlumat göndərmək (əgər lazımdırsa): fetch('/api/ai_called', ...)
    }

    // --- Yeniden Başlatma ---
    function handleRestartGame() {
        if (isDiceRolling) { console.log("Zər atılarkən yenidən başlamaq olmaz."); return; }
        console.log("Oyun yenidən başladılır (hazırki ölçü ilə)...");
        hideFireworks();
        board = Array(boardSize * boardSize).fill(''); currentPlayer = ''; isGameOver = true; winningCombination = [];
        player1Symbol = '?'; player2Symbol = '?'; player1Roll = null; player2Roll = null; diceWinner = null;
        // Keep AI state consistent if restarting mid-game vs AI
        aiPlayerSymbol = isPlayingAgainstAI ? player2Symbol : ''; // Re-determine AI symbol based on current state
        createBoard();
        resetBoardAndStatus();
        if (isOpponentPresent) {
             if (gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yenidən başlayır. Zər atılır...";
             setupDiceModalForRollOff(); showModal(diceRollModal); initDice();
        } else {
             if (gameStatusDisplay) gameStatusDisplay.textContent = "Rəqib gözlənilir... (və ya SNOW-u çağırın)";
             hideModal(diceRollModal); hideModal(symbolSelectModal); updateHeaderButtonsVisibility();
             if (restartGameBtn) restartGameBtn.disabled = true;
        }
    }

    // --- Olay Dinləyiciləri ---
    if (leaveRoomBtn) leaveRoomBtn.addEventListener('click', () => { if (confirm("Otaqdan çıxmaq istədiyinizə əminsiniz?")) window.history.back(); });
    if (closeEditModalButton) closeEditModalButton.addEventListener('click', () => hideModal(editRoomModal));
    window.addEventListener('click', (event) => { if (event.target == editRoomModal) hideModal(editRoomModal); });
    if (saveRoomChangesBtn) saveRoomChangesBtn.addEventListener('click', saveRoomChanges);
    if (deleteRoomConfirmBtn) deleteRoomConfirmBtn.addEventListener('click', deleteRoom);
    if (restartGameBtn) restartGameBtn.addEventListener('click', handleRestartGame);
    if (kickOpponentBtn) kickOpponentBtn.addEventListener('click', () => handleKickOpponent(false));
    if (callSnowBtn) callSnowBtn.addEventListener('click', handleCallSnow);
    if (diceCubeElement) {
         diceCubeElement.addEventListener('mousedown', handleMouseDown);
         diceCubeElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    } else { console.error("Zər kub elementi (diceCubeElement) tapılmadı!"); }

    // --- Oyunu Başlat ---
    initGame();

}; // DOMContentLoaded Sonu