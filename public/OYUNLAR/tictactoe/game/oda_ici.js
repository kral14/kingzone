// public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: v2.2 - Socket.IO + AI URL + Debug Logs - Hissə 1/5

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Oda İçi JS (v2.2 - Debug Logs) Başladı.");

    // ---- Qlobal Dəyişənlər ----
    let loggedInUser = null;
    let currentRoomId = null;
    let currentRoomData = {};
    let socket = null;
    let currentPlayerName = 'Oyunçu';
    let opponentPlayerName = 'Rəqib';
    let isOpponentPresent = false;
    let isPlayingAgainstAI = false;
    let aiPlayerSymbol = '';
    let isCurrentUserCreator = false;

    // ---- Oyun Durumu Dəyişənləri ----
    let board = [];
    let currentPlayer = '';
    let player1Symbol = '?';
    let player2Symbol = '?';
    let isGameOver = true;
    let boardSize = 3;
    let cells = [];
    let winningCombination = [];
    let player1Roll = null;
    let player2Roll = null;
    let diceWinner = null;

    // ---- DOM Elementləri ----
    console.log("DOM elementləri seçilir...");
    const gameLoadingOverlay = document.getElementById('game-loading-overlay');
    console.log('gameLoadingOverlay:', gameLoadingOverlay ? 'Tapıldı' : 'Tapılmadı!');
    const roomNameDisplay = document.getElementById('room-name');
    console.log('roomNameDisplay:', roomNameDisplay ? 'Tapıldı' : 'Tapılmadı!');
    const boardElement = document.getElementById('game-board');
    console.log('boardElement:', boardElement ? 'Tapıldı' : 'Tapılmadı!');
    const turnIndicator = document.getElementById('turn-indicator');
    console.log('turnIndicator:', turnIndicator ? 'Tapıldı' : 'Tapılmadı!');
    const gameStatusDisplay = document.getElementById('game-status');
    console.log('gameStatusDisplay:', gameStatusDisplay ? 'Tapıldı' : 'Tapılmadı!');
    const playerXInfo = document.getElementById('player-x-info');
    console.log('playerXInfo:', playerXInfo ? 'Tapıldı' : 'Tapılmadı!');
    const playerOInfo = document.getElementById('player-o-info');
    console.log('playerOInfo:', playerOInfo ? 'Tapıldı' : 'Tapılmadı!');
    const playerXSymbolDisplay = document.getElementById('player-x-symbol');
    console.log('playerXSymbolDisplay:', playerXSymbolDisplay ? 'Tapıldı' : 'Tapılmadı!');
    const playerOSymbolDisplay = document.getElementById('player-o-symbol');
    console.log('playerOSymbolDisplay:', playerOSymbolDisplay ? 'Tapıldı' : 'Tapılmadı!');
    const playerXNameDisplay = document.getElementById('player-x-name');
    console.log('playerXNameDisplay:', playerXNameDisplay ? 'Tapıldı' : 'Tapılmadı!');
    const playerONameDisplay = document.getElementById('player-o-name');
    console.log('playerONameDisplay:', playerONameDisplay ? 'Tapıldı' : 'Tapılmadı!');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    console.log('leaveRoomBtn:', leaveRoomBtn ? 'Tapıldı' : 'Tapılmadı!');
    const fireworksOverlay = document.getElementById('fireworks-overlay');
    console.log('fireworksOverlay:', fireworksOverlay ? 'Tapıldı' : 'Tapılmadı!');
    const shatteringTextContainer = document.getElementById('shattering-text-container');
    console.log('shatteringTextContainer:', shatteringTextContainer ? 'Tapıldı' : 'Tapılmadı!');
    const editRoomBtn = document.getElementById('edit-room-btn');
    console.log('editRoomBtn:', editRoomBtn ? 'Tapıldı' : 'Tapılmadı!');
    const editRoomModal = document.getElementById('edit-room-modal');
    console.log('editRoomModal:', editRoomModal ? 'Tapıldı' : 'Tapılmadı!');
    const closeEditModalButton = editRoomModal?.querySelector('.close-button');
    console.log('closeEditModalButton:', closeEditModalButton ? 'Tapıldı' : 'Tapılmadı (Modal içində)');
    const saveRoomChangesBtn = document.getElementById('save-room-changes-btn');
    console.log('saveRoomChangesBtn:', saveRoomChangesBtn ? 'Tapıldı' : 'Tapılmadı!');
    const deleteRoomConfirmBtn = document.getElementById('delete-room-confirm-btn');
    console.log('deleteRoomConfirmBtn:', deleteRoomConfirmBtn ? 'Tapıldı' : 'Tapılmadı!');
    const editRoomMessage = document.getElementById('edit-room-message');
    console.log('editRoomMessage:', editRoomMessage ? 'Tapıldı' : 'Tapılmadı!');
    const editBoardSizeSelect = document.getElementById('edit-board-size');
    console.log('editBoardSizeSelect:', editBoardSizeSelect ? 'Tapıldı' : 'Tapılmadı!');
    const editRoomNameInput = document.getElementById('edit-room-name');
    console.log('editRoomNameInput:', editRoomNameInput ? 'Tapıldı' : 'Tapılmadı!');
    const editRoomPasswordCheck = document.getElementById('edit-room-password-check');
    console.log('editRoomPasswordCheck:', editRoomPasswordCheck ? 'Tapıldı' : 'Tapılmadı!');
    const editRoomPasswordInput = document.getElementById('edit-room-password');
    console.log('editRoomPasswordInput:', editRoomPasswordInput ? 'Tapıldı' : 'Tapılmadı!');
    const restartGameBtn = document.getElementById('restart-game-btn');
    console.log('restartGameBtn:', restartGameBtn ? 'Tapıldı' : 'Tapılmadı!');
    const kickOpponentBtn = document.getElementById('kick-opponent-btn');
    console.log('kickOpponentBtn:', kickOpponentBtn ? 'Tapıldı' : 'Tapılmadı!');
    const callSnowBtn = document.getElementById('call-snow-btn');
    console.log('callSnowBtn:', callSnowBtn ? 'Tapıldı' : 'Tapılmadı!');
    const diceRollModal = document.getElementById('dice-roll-modal');
    console.log('diceRollModal:', diceRollModal ? 'Tapıldı' : 'Tapılmadı!');
    const diceInstructions = document.getElementById('dice-instructions');
    console.log('diceInstructions:', diceInstructions ? 'Tapıldı' : 'Tapılmadı!');
    const diceScene = document.getElementById('dice-scene');
    console.log('diceScene:', diceScene ? 'Tapıldı' : 'Tapılmadı!');
    const diceCubeElement = document.getElementById('dice-cube');
    console.log('diceCubeElement:', diceCubeElement ? 'Tapıldı' : 'Tapılmadı!');
    const yourRollResultDisplay = document.getElementById('your-roll-result');
    console.log('yourRollResultDisplay:', yourRollResultDisplay ? 'Tapıldı' : 'Tapılmadı!');
    const opponentRollResultDisplay = document.getElementById('opponent-roll-result');
    console.log('opponentRollResultDisplay:', opponentRollResultDisplay ? 'Tapıldı' : 'Tapılmadı!');
    const yourRollBox = document.getElementById('your-roll-box');
    console.log('yourRollBox:', yourRollBox ? 'Tapıldı' : 'Tapılmadı!');
    const opponentRollBox = document.getElementById('opponent-roll-box');
    console.log('opponentRollBox:', opponentRollBox ? 'Tapıldı' : 'Tapılmadı!');
    const symbolSelectModal = document.getElementById('symbol-select-modal');
    console.log('symbolSelectModal:', symbolSelectModal ? 'Tapıldı' : 'Tapılmadı!');
    const symbolSelectTitle = document.getElementById('symbol-select-title');
    console.log('symbolSelectTitle:', symbolSelectTitle ? 'Tapıldı' : 'Tapılmadı!');
    const symbolSelectMessage = document.getElementById('symbol-select-message');
    console.log('symbolSelectMessage:', symbolSelectMessage ? 'Tapıldı' : 'Tapılmadı!');
    const symbolOptionsDiv = symbolSelectModal?.querySelector('.symbol-options');
    console.log('symbolOptionsDiv:', symbolOptionsDiv ? 'Tapıldı' : 'Tapılmadı (Modal içində)');
    const symbolWaitingMessage = document.getElementById('symbol-waiting-message');
    console.log('symbolWaitingMessage:', symbolWaitingMessage ? 'Tapıldı' : 'Tapılmadı!');
    console.log("DOM element seçimi bitdi.");

    // ---- Zar Değişkenleri ----
    let isDiceRolling = false;
    let currentDiceRotateX = 0; let currentDiceRotateY = 0; let currentDiceRotateZ = 0;
    const diceRotations = { 1: { x: 0, y: 0 }, 6: { x: 0, y: 180 }, 4: { x: 0, y: 90 }, 3: { x: 0, y: -90 }, 2: { x: -90, y: 0 }, 5: { x: 90, y: 0 } };
    let isDragging = false; let dragStartX, dragStartY, previousMouseX, previousMouseY;
    const dragThreshold = 10; const rotateSensitivity = 0.4; let initialCenterZ = -55;

    // ---- Yardımçı Fonksiyonlar ----
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'info', duration = 3000) => { if(el){ el.textContent = msg; el.className = `message ${type}`; if (el.timeoutId) clearTimeout(el.timeoutId); if (duration > 0) { el.timeoutId = setTimeout(() => { if (el.textContent === msg) { el.textContent = ''; el.className = 'message'; } }, duration); } } };
    function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return String(unsafe); return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); };
    function showLoadingOverlay(text = 'Yüklənir...') { if(gameLoadingOverlay) { const loadingText = gameLoadingOverlay.querySelector('.game-loading-text'); if(loadingText) loadingText.textContent = text; gameLoadingOverlay.classList.add('visible'); } else console.error("gameLoadingOverlay elementi tapılmadı!"); };
    function hideLoadingOverlay() { if(gameLoadingOverlay) gameLoadingOverlay.classList.remove('visible'); };

    // ----- URL Parametrlərini Alma -----
    function getUrlParams() { const params = new URLSearchParams(window.location.search); const sizeParam = parseInt(params.get('size') || '3', 10); const validatedSize = Math.max(3, Math.min(6, sizeParam)); const urlAiParam = params.get('ai'); const playWithAI = urlAiParam === 'SNOW'; const roomNameParam = decodeURIComponent(params.get('roomName') || 'Bilinməyən Otaq'); const roomIdParam = params.get('roomId'); return { roomId: roomIdParam, roomName: roomNameParam, playerName: decodeURIComponent(params.get('playerName') || 'Qonaq'), size: validatedSize, playWithAI: playWithAI }; }

    // ----- Oyun Vəziyyəti Sıfırlama -----
    function resetGameStateVars() { board = Array(boardSize * boardSize).fill(''); currentPlayer = ''; player1Symbol = '?'; player2Symbol = '?'; isGameOver = true; winningCombination = []; player1Roll = null; player2Roll = null; diceWinner = null; /*console.log("[resetGameStateVars] Oyun dəyişənləri sıfırlandı.");*/ };
    function resetBoardAndStatus() { /*console.log("[resetBoardAndStatus] Lövhə və status sıfırlanır.");*/ if (gameStatusDisplay) { gameStatusDisplay.textContent = ''; gameStatusDisplay.className = 'game-status'; } if (turnIndicator) turnIndicator.textContent = 'Gözlənilir...'; cells.forEach((cell, index) => { const newCell = cell.cloneNode(true); newCell.className = 'cell'; newCell.textContent = ''; newCell.style.cursor = 'not-allowed'; newCell.style.animation = ''; cell.parentNode.replaceChild(newCell, cell); cells[index] = newCell; }); updatePlayerInfo(); boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none'; if (restartGameBtn) restartGameBtn.disabled = true; hideFireworks(); clearShatteringText(); };

    // ----- UI Yeniləmələri -----
    function adjustStylesForBoardSize(size) { let cellSizeVar = '--cell-size-large-dynamic'; if (size === 4) cellSizeVar = '--cell-size-medium-dynamic'; else if (size >= 5) cellSizeVar = '--cell-size-small-dynamic'; document.documentElement.style.setProperty('--current-cell-size', `var(${cellSizeVar})`); document.documentElement.style.setProperty('--current-font-size', `calc(var(${cellSizeVar}) * 0.6)`); document.documentElement.style.setProperty('--board-size', size); };
    function createBoard() { if (!boardElement) { console.error("createBoard: boardElement tapılmadı!"); return; } boardElement.innerHTML = ''; cells = []; for (let i = 0; i < boardSize * boardSize; i++) { const cell = document.createElement('div'); cell.classList.add('cell'); cell.dataset.index = i; boardElement.appendChild(cell); cells.push(cell); } };
    function updatePlayerInfo() { if (!playerXInfo || !playerOInfo || !playerXSymbolDisplay || !playerOSymbolDisplay || !playerXNameDisplay || !playerONameDisplay) return; playerXSymbolDisplay.textContent = player1Symbol; playerXNameDisplay.textContent = escapeHtml(currentPlayerName); playerXInfo.className = `player-info ${player1Symbol === 'X' ? 'player-x' : (player1Symbol === 'O' ? 'player-o' : '')}`; playerOSymbolDisplay.textContent = player2Symbol; playerONameDisplay.textContent = escapeHtml(opponentPlayerName); playerOInfo.className = `player-info ${player2Symbol === 'X' ? 'player-x' : (player2Symbol === 'O' ? 'player-o' : '')}`; if (!isGameOver) { playerXInfo.classList.toggle('active-player', currentPlayer === player1Symbol); playerOInfo.classList.toggle('active-player', currentPlayer === player2Symbol); } else { playerXInfo.classList.remove('active-player'); playerOInfo.classList.remove('active-player'); } };
    function updateTurnIndicator() { if (isGameOver) { if (turnIndicator) turnIndicator.textContent = 'Oyun Bitdi'; return; } if (!currentPlayer) { if (turnIndicator) turnIndicator.textContent = 'Simvol Seçilir...'; return; } const turnPlayerName = (currentPlayer === player1Symbol) ? currentPlayerName : opponentPlayerName; if (turnIndicator) turnIndicator.textContent = `Sıra: ${escapeHtml(turnPlayerName)} (${currentPlayer})`; if (gameStatusDisplay) { gameStatusDisplay.textContent = `Sıra: ${escapeHtml(turnPlayerName)}`; gameStatusDisplay.className = 'game-status'; } updatePlayerInfo(); };
    function updateHeaderButtonsVisibility() {
        // console.log(`[updateHeaderButtonsVisibility] Çağırıldı. isAI=${isPlayingAgainstAI}, isCreator=${isCurrentUserCreator}, isOpponent=${isOpponentPresent}`);
        // console.log('--> editRoomBtn:', editRoomBtn);
        // console.log('--> kickOpponentBtn:', kickOpponentBtn);
        // console.log('--> callSnowBtn:', callSnowBtn);
        const showEdit = !isPlayingAgainstAI && isCurrentUserCreator;
        const showKick = !isPlayingAgainstAI && isCurrentUserCreator && isOpponentPresent;
        const showCallSnow = false; // Bu düyməni ümumiyyətlə gizlədirik
        if (editRoomBtn) { editRoomBtn.style.display = showEdit ? 'inline-flex' : 'none'; } else { /*console.warn("updateHeaderButtonsVisibility: editRoomBtn null idi!");*/ }
        if (kickOpponentBtn) { kickOpponentBtn.style.display = showKick ? 'inline-flex' : 'none'; } else { /*console.warn("updateHeaderButtonsVisibility: kickOpponentBtn null idi!");*/ }
        if (callSnowBtn) { callSnowBtn.style.display = showCallSnow ? 'inline-flex' : 'none'; } else { /*console.warn("updateHeaderButtonsVisibility: callSnowBtn null idi!");*/ }
    };

// --- Hissə 1 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: v2.2 - Socket.IO + AI URL + Debug Logs - Hissə 2/5

// ---- DOMContentLoaded içində davam edirik (Hissə 1-dən) ----

    // ----- Zər Funksiyaları -----
    function initDice() {
        // Zərin ilkin vizual vəziyyətini ayarlayır
        if (!diceCubeElement) return;
        diceCubeElement.style.transition = 'none'; // Animasiyanı dayandır
        currentDiceRotateX = 0; // Fırlanma bucaqlarını sıfırla
        currentDiceRotateY = 0;
        currentDiceRotateZ = 0;
        setDiceTransform(); // Transformu tətbiq et
        diceCubeElement.style.cursor = isOpponentPresent ? 'grab' : 'not-allowed'; // Klikləmə imkanını ayarla
        // console.log("[initDice] Zər başlanğıc mövqeyinə gətirildi.");
    }

    function setupDiceModalForRollOff() {
        // Zər modalını oyunçu seçimi üçün hazırlayır
        if (isDiceRolling) return; // Əgər zər hələ fırlanırsa, heç nə etmə
        console.log("[setupDiceModalForRollOff] Zər modalı mübarizə üçün ayarlanır.");
        if (diceInstructions) {
            const instructionText = isOpponentPresent ? 'Başlayanı təyin etmək üçün zərə klikləyin və ya sürükləyin.' : 'Rəqib gözlənilir...';
            diceInstructions.textContent = instructionText;
            diceInstructions.classList.toggle('opponent-joined', isOpponentPresent);
            diceInstructions.classList.toggle('waiting', !isOpponentPresent);
        }
        if (yourRollResultDisplay) yourRollResultDisplay.textContent = '?';
        if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = '?';
        if (yourRollBox) yourRollBox.className = 'result-box'; // Qalib/bərabərlik stillərini təmizlə
        if (opponentRollBox) opponentRollBox.className = 'result-box';
        player1Roll = null; // Nəticələri sıfırla
        player2Roll = null;
        diceWinner = null;
        if(diceCubeElement) diceCubeElement.style.cursor = isOpponentPresent ? 'grab' : 'not-allowed'; // Zəri aktiv/deaktiv et
        initDice(); // Zərin vizual vəziyyətini sıfırla
    }

    function rollDice() {
        // Zəri fırlatma funksiyası
        if (isDiceRolling || !isOpponentPresent || !diceCubeElement) {
            // console.log(`[rollDice] Bloklandı (rolling=${isDiceRolling}, opponent=${isOpponentPresent})`);
            return;
        }
        isDiceRolling = true; // Fırlanma başladığını işarələ
        console.log("[rollDice] Zər atılır...");
        diceCubeElement.style.cursor = 'default'; // Klikləməni müvəqqəti söndür
        if(yourRollBox) yourRollBox.className = 'result-box'; // Stilləri təmizlə
        if(opponentRollBox) opponentRollBox.className = 'result-box';
        if(yourRollResultDisplay) yourRollResultDisplay.textContent = '?'; // Nəticələri gizlət
        if(diceInstructions) diceInstructions.textContent = 'Zər atılır...'; // Mesajı yenilə

        // Öz atışımızı təyin et
        const myRoll = Math.floor(Math.random() * 6) + 1;
        console.log(`[rollDice] Sizin atışınız: ${myRoll}`);
        player1Roll = myRoll; // Nəticəni saxla

        // Animasiya parametrləri
        const rollDurationValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-duration').trim() || '2.0s';
        const rollTimingFunctionValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-timing-function').trim() || 'cubic-bezier(0.3, 0.9, 0.4, 1)';
        const finalFace = diceRotations[myRoll]; // Hədəf üz
        // Təsadüfi tam dövrələr əlavə et
        const fullRotationsX = 360 * (2 + Math.floor(Math.random() * 2));
        const fullRotationsY = 360 * (2 + Math.floor(Math.random() * 2));
        const fullRotationsZ = 360 * (1 + Math.floor(Math.random() * 1));
        // Hədəf bucaqları hesabla
        const targetRotateX = finalFace.x + fullRotationsX;
        const targetRotateY = finalFace.y + fullRotationsY;
        const targetRotateZ = 0 + fullRotationsZ; // Z oxunu sıfırlayaq

        // Animasiyanı başlat
        diceCubeElement.style.transition = `transform ${rollDurationValue} ${rollTimingFunctionValue}`;
        setDiceTransform(targetRotateX, targetRotateY, targetRotateZ);

        // Multiplayer oyununda nəticəni serverə göndər
        if (!isPlayingAgainstAI && socket && socket.connected) {
             console.log(`[rollDice] Nəticə (${myRoll}) serverə göndərilir ('dice_roll_result')...`);
             socket.emit('dice_roll_result', { roll: myRoll });
        }

        // Animasiya bitdikdən sonra
        setTimeout(() => {
            console.log("[rollDice] Animasiya bitdi.");
            isDiceRolling = false; // Fırlanma bitdi
            diceCubeElement.style.transition = 'none'; // Keçidləri söndür
            // Zərin son vəziyyətini saxla (animasiya bitdiyi kimi)
            currentDiceRotateX = finalFace.x;
            currentDiceRotateY = finalFace.y;
            currentDiceRotateZ = 0; // Z fırlanmasını sıfırla
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
                // Multiplayer oyununda rəqibin nəticəsini gözləyirik
                // console.log("[rollDice] Rəqibin zər nəticəsi gözlənilir...");
                 if (player2Roll !== null) { // Əgər rəqibin nəticəsi artıq gəlibsə
                      // console.log("[rollDice] Rəqibin nəticəsi artıq gəlib, handleRollOffResults çağırılır.");
                      handleRollOffResults(myRoll, player2Roll);
                 } else {
                     if(diceInstructions) diceInstructions.textContent = 'Rəqibin zər atması gözlənilir...';
                 }
            }
        }, parseFloat(rollDurationValue.replace('s', '')) * 1000 + 100); // Animasiya müddəti + kiçik bufer
    }

    function handleRollOffResults(myRoll, opponentRoll) {
        // Hər iki nəticə bəlli olduqda qalibi təyin edir
        console.log(`[handleRollOffResults] Nəticələr: Siz=${myRoll}, Rəqib=${opponentRoll}`);
        // Nəticələrin göstərildiyindən əmin ol (ehtiyat üçün)
        if(yourRollResultDisplay && yourRollResultDisplay.textContent === '?') yourRollResultDisplay.textContent = myRoll;
        if(opponentRollResultDisplay && opponentRollResultDisplay.textContent === '?') opponentRollResultDisplay.textContent = opponentRoll;

        if (myRoll > opponentRoll) {
            diceWinner = currentPlayerName; // Qalib bizik
            if(diceInstructions) diceInstructions.textContent = 'Siz yüksək atdınız! Simvol seçin.';
            if(yourRollBox) yourRollBox.classList.add('winner'); // Vizual işarələmə
            if(opponentRollBox) opponentRollBox.classList.remove('winner', 'tie');
            triggerDiceScatterAndSymbolSelect(); // Növbəti mərhələyə keç
        } else if (opponentRoll > myRoll) {
            diceWinner = opponentPlayerName; // Qalib rəqibdir
            if(diceInstructions) diceInstructions.textContent = `${escapeHtml(opponentPlayerName)} yüksək atdı! ${isPlayingAgainstAI ? 'Simvol avtomatik seçiləcək.' : 'Simvol seçimi gözlənilir.'}`;
            if(opponentRollBox) opponentRollBox.classList.add('winner');
            if(yourRollBox) yourRollBox.classList.remove('winner', 'tie');
            triggerDiceScatterAndSymbolSelect(); // Növbəti mərhələyə keç
        } else {
            // Bərabərlik halı
            diceWinner = null;
            player1Roll = null; // Nəticələri sıfırla ki, yenidən atılsın
            player2Roll = null;
            if(diceInstructions) diceInstructions.textContent = 'Bərabərlik! Təkrar atmaq üçün zərə klikləyin.';
            if(yourRollBox) yourRollBox.classList.add('tie'); // Vizual işarələmə
            if(opponentRollBox) opponentRollBox.classList.add('tie');
            isDiceRolling = false; // Yenidən atmaq mümkün olsun
            if (isOpponentPresent && diceCubeElement) diceCubeElement.style.cursor = 'grab'; // Zəri aktiv et
        }
        // console.log(`[handleRollOffResults] Qalib: ${diceWinner === null ? 'Bərabərlik' : diceWinner}`);
    }

    function triggerDiceScatterAndSymbolSelect() {
        // Zəri vizual olaraq dağıdır və simvol seçim modalını göstərir
        if (!diceScene) return;
        console.log("[triggerDiceScatterAndSymbolSelect] Zər dağılır və simvol seçiminə keçilir.");
        diceScene.classList.add('scatter'); // CSS animasiyasını işə sal
        setTimeout(() => {
            hideModal(diceRollModal); // Zər modalını gizlət
            diceScene.classList.remove('scatter'); // Animasiya klasını sil
            initDice(); // Zəri başlanğıc vəziyyətinə qaytar
            isDiceRolling = false; // Fırlanma bitdi
            initSymbolSelection(); // Simvol seçimi mərhələsini başlat
        }, 600); // CSS animasiyasının bitməsini gözlə (0.5s + buffer)
    }

    function setDiceTransform(rotX = currentDiceRotateX, rotY = currentDiceRotateY, rotZ = currentDiceRotateZ) {
        // Zərin CSS transformunu ayarlar
        if (!diceCubeElement) return;
        const transformString = `translateZ(${initialCenterZ}px) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;
        diceCubeElement.style.transform = transformString;
    }

    // Zərin sürüklənməsi və kliklənməsi üçün hadisə dinləyiciləri
    function handleDiceClickOrDragEnd() {
        // Klik və ya sürükləmə bitdikdə çağırılır
        if (isDiceRolling || !isOpponentPresent) { // Fırlanırsa və ya rəqib yoxdursa
            if (!isDiceRolling && isOpponentPresent && diceCubeElement) diceCubeElement.style.cursor = 'grab'; // Kursu düzəlt
            isDragging = false; return;
        }
        if (isDragging) { // Əgər sürükləmə idisə
            isDragging = false;
            if (isOpponentPresent && diceCubeElement) diceCubeElement.style.cursor = 'grab'; // Kursu düzəlt
            return; // Sürükləmə zər atmanı trigger etmir
        }
        // Əgər klik idisə və hələ qalib yoxdursa (bərabərlik və ya ilk atış)
        if (diceWinner === null) {
             rollDice(); // Zəri at
        }
    }
    function handleMouseDown(event) { if (isDiceRolling || !isOpponentPresent) return; diceCubeElement.style.transition = 'none'; isDragging = false; dragStartX = event.clientX; dragStartY = event.clientY; previousMouseX = event.clientX; previousMouseY = event.clientY; window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); };
    function handleMouseMove(event) { if (isDiceRolling) return; const deltaX = event.clientX - previousMouseX; const deltaY = event.clientY - previousMouseY; if (!isDragging) { if (Math.abs(event.clientX - dragStartX) > dragThreshold || Math.abs(event.clientY - dragStartY) > dragThreshold) { isDragging = true; if(diceCubeElement) diceCubeElement.style.cursor = 'grabbing'; } } if (isDragging) { currentDiceRotateY += deltaX * rotateSensitivity; currentDiceRotateX -= deltaY * rotateSensitivity; setDiceTransform(currentDiceRotateX, currentDiceRotateY, currentDiceRotateZ); } previousMouseX = event.clientX; previousMouseY = event.clientY; };
    function handleMouseUp(event) { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); handleDiceClickOrDragEnd(); };
    function handleTouchStart(e) { if (isDiceRolling || !isOpponentPresent) return; diceCubeElement.style.transition = 'none'; isDragging = false; const touch = e.touches[0]; dragStartX = touch.clientX; dragStartY = touch.clientY; previousMouseX = touch.clientX; previousMouseY = touch.clientY; diceCubeElement.addEventListener('touchmove', handleTouchMove, { passive: false }); diceCubeElement.addEventListener('touchend', handleTouchEnd); diceCubeElement.addEventListener('touchcancel', handleTouchEnd); };
    function handleTouchMove(e) { if (isDiceRolling) return; e.preventDefault(); const touch = e.touches[0]; const deltaX = touch.clientX - previousMouseX; const deltaY = touch.clientY - previousMouseY; if (!isDragging) { if (Math.abs(touch.clientX-dragStartX)>dragThreshold || Math.abs(touch.clientY-dragStartY)>dragThreshold) { isDragging = true; } } if (isDragging) { currentDiceRotateY += deltaX*rotateSensitivity; currentDiceRotateX -= deltaY*rotateSensitivity; setDiceTransform(currentDiceRotateX, currentDiceRotateY, currentDiceRotateZ); } previousMouseX = touch.clientX; previousMouseY = touch.clientY; };
    function handleTouchEnd(e) { diceCubeElement.removeEventListener('touchmove', handleTouchMove); diceCubeElement.removeEventListener('touchend', handleTouchEnd); diceCubeElement.removeEventListener('touchcancel', handleTouchEnd); handleDiceClickOrDragEnd(); };

// --- Hissə 2 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: v2.2 - Socket.IO + AI URL + Debug Logs - Hissə 3/5

// ---- DOMContentLoaded içində davam edirik (Hissə 2-dən) ----

    // ----- Simvol Seçim Funksiyaları -----
    function initSymbolSelection() {
        // Zər atma nəticəsinə görə simvol seçim modalını hazırlayır və göstərir
        console.log("[initSymbolSelection] Başladı.");
        if (!symbolSelectModal || !symbolOptionsDiv || !symbolWaitingMessage || !symbolSelectTitle || !symbolSelectMessage) {
            console.error("Simvol seçim modalı elementləri tapılmadı!");
            startGameProcedure('X'); // Fallback olaraq X ilə başla
            return;
        }
        symbolWaitingMessage.style.display = 'none'; // Gözləmə mesajını gizlət
        symbolOptionsDiv.style.display = 'flex'; // Seçim düymələrini göstər

        if (diceWinner === currentPlayerName) { // Əgər bu client zəri udubsa
            symbolSelectTitle.textContent = "Simvol Seçin";
            symbolSelectMessage.textContent = "Oyuna başlamaq üçün simvolunuzu seçin:";
            // Listenerların təkrar əlavə olunmaması üçün əvvəlcə silib sonra əlavə edirik
            symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => {
                 const newButton = button.cloneNode(true); // Köhnə listenerları silmək üçün
                 button.parentNode.replaceChild(newButton, button);
                 newButton.addEventListener('click', handleSymbolChoice); // Yeni listener əlavə et
            });
        } else { // Əgər rəqib/AI zəri udubsa
            symbolSelectTitle.textContent = "Simvol Seçilir";
            symbolSelectMessage.textContent = `Oyuna "${escapeHtml(opponentPlayerName)}" başlayır. ${isPlayingAgainstAI ? 'Simvol avtomatik seçiləcək.' : 'Rəqib simvol seçir...'}`;
            symbolOptionsDiv.style.display = 'none'; // Seçim düymələrini gizlət
            symbolWaitingMessage.style.display = 'block'; // Gözləmə mesajını göstər
            if (isPlayingAgainstAI) {
                // AI üçün simvol seçimini simulyasiya et
                 simulateOpponentSymbolChoice(500 + Math.random() * 500); // Təsadüfi gözləmə
            } else {
                // Multiplayerdə rəqibin seçimini gözləyirik ('opponent_symbol_chosen' hadisəsi)
                console.log("[initSymbolSelection] Rəqibin simvol seçimi gözlənilir...");
            }
        }
        showModal(symbolSelectModal); // Modalı göstər
    }

    function handleSymbolChoice(event) {
        // İstifadəçi simvol düyməsinə kliklədikdə çağırılır
        const chosenSymbol = event.target.dataset.symbol;
        if (!chosenSymbol) return; // Kliklənən element simvol düyməsi deyilsə

        console.log(`[handleSymbolChoice] ${currentPlayerName} "${chosenSymbol}" seçdi.`);

        // Multiplayer oyununda seçimi serverə göndər
        if (!isPlayingAgainstAI && socket && socket.connected) {
            console.log(`[handleSymbolChoice] Simvol seçimi (${chosenSymbol}) serverə göndərilir ('symbol_choice')...`);
            socket.emit('symbol_choice', { symbol: chosenSymbol });
        }

        // Oyunu seçilmiş simvolla başlat (həm AI, həm multiplayer üçün)
        startGameProcedure(chosenSymbol);
    }

    function simulateOpponentSymbolChoice(delay) {
        // AI-nin və ya offline rəqibin simvol seçimini simulyasiya edir
        const opponentChoice = (Math.random() > 0.5) ? 'X' : 'O'; // Təsadüfi seçir
        console.log(`[simulateOpponentSymbolChoice] Rəqib/AI "${opponentChoice}" seçdi (simulyasiya).`);
        setTimeout(() => {
             // Əgər modal hələ də açıqdırsa (istifadəçi gözləyirsə)
             if (symbolSelectModal && symbolSelectModal.style.display === 'block') {
                 startGameProcedure(opponentChoice); // Oyunu başlat
             } else {
                  // Bu hal, əgər istifadəçi modalı özü bağlayıbsa baş verə bilər
                  console.warn("[simulateOpponentSymbolChoice] Simvol seçim modalı artıq bağlı idi.");
             }
        }, delay); // Verilən gecikmə qədər gözlə
    }

    // ----- Oyunu Başlatma -----
    function startGameProcedure(startingSymbol) {
        // Zər nəticəsi və simvol seçiminə əsasən oyunu başladır
        console.log(`[startGameProcedure] Oyun "${startingSymbol}" ilə başlayır. Zər qalibi: ${diceWinner}`);
        hideModal(symbolSelectModal); // Simvol seçim modalını gizlət

        // Oyunçu simvollarını təyin et
        if (diceWinner === currentPlayerName) { // Əgər biz zəri udmuşuqsa
            player1Symbol = startingSymbol;
            player2Symbol = (startingSymbol === 'X') ? 'O' : 'X';
            currentPlayer = player1Symbol; // Oyuna biz başlayırıq
        } else { // Əgər rəqib/AI zəri udubsa
            player2Symbol = startingSymbol;
            player1Symbol = (startingSymbol === 'X') ? 'O' : 'X';
            currentPlayer = player2Symbol; // Oyuna rəqib/AI başlayır
        }

        // AI simvolunu təyin et (əgər AI oyunudursa)
        aiPlayerSymbol = isPlayingAgainstAI ? player2Symbol : '';

        console.log(`[startGameProcedure] Simvollar: P1(${currentPlayerName})=${player1Symbol}, P2(${opponentPlayerName})=${player2Symbol}. Başlayan: ${currentPlayer}`);
        if (isPlayingAgainstAI) console.log(`[startGameProcedure] AI Simvolu: ${aiPlayerSymbol}`);

        isGameOver = false; // Oyun başladı
        if (restartGameBtn) restartGameBtn.disabled = false; // Yenidən başlat düyməsini aktiv et
        updatePlayerInfo(); // UI-də simvolları və adları göstər
        updateTurnIndicator(); // Sıranı göstər

        if (gameStatusDisplay) { gameStatusDisplay.textContent = `Sıra: ${currentPlayer === player1Symbol ? currentPlayerName : opponentPlayerName}`; gameStatusDisplay.className = 'game-status'; }

        boardElement.style.opacity = '1'; // Lövhəni tam görünən et

        // Hüceyrələrə klik listenerlarını yenidən əlavə et (köhnələri silmək üçün klonlama)
        console.log("[startGameProcedure] Hüceyrə listenerları əlavə edilir...");
        cells.forEach((cell, index) => {
            const newCell = cell.cloneNode(true); // Klonla
            cell.parentNode.replaceChild(newCell, cell); // Əvəz et
            cells[index] = newCell; // Yeni elementi massivdə saxla

            if (board[index] === '') { // Yalnız boş hüceyrələr üçün
                 cells[index].style.cursor = 'pointer';
                 cells[index].addEventListener('click', handleCellClick);
            } else {
                 cells[index].style.cursor = 'not-allowed';
            }
        });
        console.log("[startGameProcedure] Hüceyrə listenerları əlavə edildi.");

        // Oyunun ilk vəziyyətini ayarla (lövhənin aktivliyi, AI-nin ilk gedişi)
        if (!isGameOver) {
             const isMyTurn = currentPlayer === player1Symbol;
             // Multiplayerdə sıra rəqibdədirsə, lövhəni blokla
             boardElement.style.pointerEvents = (!isPlayingAgainstAI && !isMyTurn) ? 'none' : 'auto';

             // Əgər AI başlayırsa, ilk hərəkəti etsin
             if (isPlayingAgainstAI && currentPlayer === aiPlayerSymbol) {
                 console.log("[startGameProcedure] AI başlayır, makeAIMove çağırılır.");
                 boardElement.style.pointerEvents = 'none'; // AI düşünərkən blokla
                 makeAIMove();
             } else {
                 console.log(`[startGameProcedure] ${isMyTurn ? 'İnsan' : 'Rəqib'} başlayır. Lövhə: ${boardElement.style.pointerEvents}`);
             }
        } else {
             boardElement.style.pointerEvents = 'none'; // Oyun bitibsə blokla
        }
         console.log("[startGameProcedure] Bitdi.");
    }

    // ----- Oyun Axışı -----
    function handleCellClick(event) {
        // Hüceyrəyə klikləndikdə çağırılır
        const clickedCell = event.target;
        const index = parseInt(clickedCell.dataset.index);
        const myTurn = currentPlayer === player1Symbol;

        // Klikləmə şərtlərini yoxla
        if (isGameOver || isDiceRolling || !myTurn || board[index] !== '') {
             // console.log(`[handleCellClick] Bloklandı (GameOver=${isGameOver}, DiceRolling=${isDiceRolling}, MyTurn=${myTurn}, Board[${index}]=${board[index]})`);
             return;
        }
        console.log(`[handleCellClick] İnsan ${index} xanasına ${player1Symbol} qoyur.`);

        // Hərəkəti lövhəyə yerləşdir (bu funksiya sıranı dəyişdirmir)
        placeMark(index, player1Symbol);

        // Əgər hərəkət oyunu bitirmədisə
        if (!isGameOver) {
            if (isPlayingAgainstAI) {
                // AI Oyununda: Sıranı AI-yə ver və hərəkət et
                // console.log("[handleCellClick] AI Oyunu: Sıra AI-ya keçirilir.");
                switchPlayer(); // Sıranı dəyişdir
                updateTurnIndicator(); // UI-ni yenilə
                boardElement.style.pointerEvents = 'none'; // Lövhəni blokla
                makeAIMove(); // AI hərəkət etsin
            } else {
                // Multiplayer Oyununda: Hərəkəti serverə göndər
                // console.log(`[handleCellClick] Multiplayer: Hərəkət (${index}, ${player1Symbol}) serverə göndərilir ('make_move')...`);
                if (socket && socket.connected) {
                     socket.emit('make_move', { index: index, mark: player1Symbol });
                     boardElement.style.pointerEvents = 'none'; // Lövhəni blokla (rəqibi gözlə)
                     switchPlayer(); // Sıranı UI-də dəyişdir
                     updateTurnIndicator(); // UI-ni yenilə
                      if (gameStatusDisplay) gameStatusDisplay.textContent = `Sıra: ${opponentPlayerName}`; // Statusu yenilə
                } else {
                     // Socket bağlıdırsa, hərəkəti geri al
                     console.error("[handleCellClick] Socket bağlantısı yoxdur!");
                     board[index] = ''; // Lövhədən sil
                     clickedCell.textContent = ''; // Vizual olaraq sil
                     clickedCell.classList.remove(player1Symbol); // Klası sil
                     clickedCell.style.cursor = 'pointer'; // Yenidən kliklənə bilən et
                     alert("Serverlə bağlantı yoxdur. Hərəkət edilə bilmədi.");
                }
            }
        } else {
            // Oyun bu hərəkətlə bitdi
             console.log("[handleCellClick] Oyun insanın hərəkəti ilə bitdi.");
             boardElement.style.pointerEvents = 'none'; // Lövhəni blokla
        }
    }

    function placeMark(index, mark) {
        // Verilən işarəni lövhəyə yerləşdirir və oyunun bitib-bitmədiyini yoxlayır
        // Bu funksiya özü sıranı dəyişdirmir!
        // console.log(`===== placeMark: Index=${index}, Mark=${mark} =====`);
        if (index < 0 || index >= board.length || board[index] !== '' || isGameOver) {
             // console.log(`placeMark: Keçərsiz. Index=${index}, BoardVal=${board[index]}, GameOver=${isGameOver}`);
             return false; // Keçərsiz hərəkət
        }
        board[index] = mark; // Lövhəni yenilə
        const cellElement = cells[index];
        if (!cellElement) { console.error(`placeMark: Hata! cells[${index}] tapılmadı!`); return false; }

        // Vizual olaraq işarəni yerləşdir və klikləməni söndür
        cellElement.textContent = mark;
        cellElement.classList.add(mark); // 'X' və ya 'O' klası
        cellElement.style.cursor = 'not-allowed';

        // Listenerları silmək üçün klonlama (event listener sızmasının qarşısını alır)
        const newCell = cellElement.cloneNode(true);
        cellElement.parentNode.replaceChild(newCell, cellElement);
        cells[index] = newCell; // Yeni elementi massivdə saxla

        // console.log(`placeMark: ${index} xanası ${mark} ilə dolduruldu.`);

        // Qazanma və bərabərlik yoxlaması
        const win = checkWin(mark);
        const draw = !win && !board.includes(''); // Qazanma yoxdursa və boş xana qalmayıbsa

        if (win) {
            console.log(`placeMark: ${mark} qazandı.`);
            endGame(false, mark); // Oyunu bitir (qalib var)
            highlightWinningCells(); // Qazanan xanaları işıqlandır
            return true; // Hərəkət edildi, oyun bitdi
        } else if (draw) {
            console.log("placeMark: Bərabərlik.");
            endGame(true, null); // Oyunu bitir (bərabərlik)
            return true; // Hərəkət edildi, oyun bitdi
        } else {
            // console.log("placeMark: Oyun davam edir.");
            return true; // Hərəkət edildi, oyun davam edir
        }
    }

    function switchPlayer() {
        // Sıranı dəyişdirir
        if(isGameOver) return;
        currentPlayer = (currentPlayer === player1Symbol) ? player2Symbol : player1Symbol;
        // console.log(`switchPlayer: Yeni sıra: ${currentPlayer}`);
        // Bu funksiyadan sonra updateTurnIndicator() çağırılmalıdır
    }

    // ----- AI Məntiqi -----
    function makeAIMove() {
        // AI-nin hərəkətini hesablayır və yerləşdirir
        if (isGameOver || currentPlayer !== aiPlayerSymbol) {
            // console.log(`[makeAIMove] Bloklandı (GameOver=${isGameOver}, Current=${currentPlayer}, AISymbol=${aiPlayerSymbol})`);
            if (!isGameOver && boardElement) boardElement.style.pointerEvents = 'auto'; // Lövhəni aktivləşdir (əgər sıradan çıxıbsa)
            return;
        }
        console.log("[makeAIMove] AI (SNOW) düşünür...");
        if (gameStatusDisplay) gameStatusDisplay.textContent = "SNOW oynayır...";

        // Təsadüfi gözləmə ilə daha təbii görünüş
        setTimeout(() => {
            // console.log("[makeAIMove] AI setTimeout callback başladı. Lövhə:", [...board]);
            let bestMove = -1;
            try {
                 bestMove = findBestMove(); // Ən yaxşı hərəkəti tap
                 // console.log("[makeAIMove] AI üçün ən yaxşı hərəkət tapıldı:", bestMove);
            } catch (aiError) {
                 // Xəta olarsa, təsadüfi hərəkət et
                 console.error("[makeAIMove] findBestMove xətası:", aiError);
                 let availableCells = []; for(let i=0; i<board.length; i++) if(board[i]==='') availableCells.push(i);
                 if (availableCells.length > 0) bestMove = availableCells[Math.floor(Math.random() * availableCells.length)];
                 console.error("[makeAIMove] Xəta səbəbiylə təsadüfi hərəkət:", bestMove);
            }

            // Əgər etibarlı hərəkət tapılıbsa
            if (bestMove !== -1 && board[bestMove] === '') {
                placeMark(bestMove, aiPlayerSymbol); // Hərəkəti yerləşdir
                if (!isGameOver) { // Əgər oyun bitmədisə
                    // console.log("[makeAIMove] AI hərəkət etdi, sıra insana keçir.");
                    switchPlayer(); // Sıranı insana ver
                    if (boardElement) boardElement.style.pointerEvents = 'auto'; // Lövhəni aktiv et
                    updateTurnIndicator(); // UI-ni yenilə
                } else {
                     console.log("[makeAIMove] AI hərəkət etdi və oyun bitdi.");
                }
            } else {
                // Etibarlı hərəkət tapılmadı (çox nadir hal)
                console.warn(`[makeAIMove] Etibarlı hərəkət tapılmadı (${bestMove})!`);
                 if (boardElement) boardElement.style.pointerEvents = 'auto'; // Lövhəni aktiv et
                 // Bərabərlik yoxlaması
                 if(!checkWin(player1Symbol) && !board.includes('')) {
                      console.log("[makeAIMove] Bərabərlik (hərəkət yoxdur).");
                      endGame(true, null);
                 } else {
                      console.warn("[makeAIMove] Hərəkət yoxdur amma oyun bitməyib?");
                      updateTurnIndicator(); // Sıranı göstər
                 }
            }
             // console.log("[makeAIMove] AI setTimeout callback bitdi.");
        }, 500 + Math.random() * 300); // 0.5 - 0.8 saniyə gözləmə
    }

    function findBestMove() {
        // AI üçün ən yaxşı hərəkəti tapan funksiya (Minimax və sadə strategiyalar)
        // console.log(`%c[findBestMove] Başladı. boardSize=${boardSize}, AI Symbol=${aiPlayerSymbol}`, "color: cyan");
        const humanPlayerSymbol = player1Symbol;

        // 1. Qazanma Hərəkəti (Bir hərəkətlə udmaq mümkündürsə)
        for (let i = 0; i < board.length; i++) {
             if (board[i] === '') { board[i] = aiPlayerSymbol; if (checkWin(aiPlayerSymbol)) { board[i] = ''; return i; } board[i] = ''; }
        }

        // 2. Bloklama Hərəkəti (Rəqibin bir hərəkətlə udmasının qarşısını al)
        for (let i = 0; i < board.length; i++) {
             if (board[i] === '') { board[i] = humanPlayerSymbol; if (checkWin(humanPlayerSymbol)) { board[i] = ''; return i; } board[i] = ''; }
        }

        // 3. Sadə Strategiyalar (Böyük lövhələr üçün Minimax yerinə)
        if (boardSize >= 5) {
             // Mərkəzi xanaları prioritetləşdir
             const centerCells = getCenterCells(boardSize);
             const availableCenter = centerCells.filter(index => board[index] === '');
             if (availableCenter.length > 0) return availableCenter[Math.floor(Math.random() * availableCenter.length)];
             // TODO: Daha mürəkkəb strategiyalar əlavə etmək olar (çəngəl yaratma/bloklama)
        }
        // 4. Minimax (Kiçik lövhələr üçün)
        else if (boardSize <= 4) {
            let move = -1; let score = -Infinity;
            let currentMaxDepth = (boardSize === 4) ? 4 : 6; // 4x4 üçün dərinliyi məhdudlaşdırırıq
            const availableMoves = []; for(let i=0; i<board.length; i++) { if(board[i] === '') availableMoves.push(i); }

            for (const i of availableMoves) {
                board[i] = aiPlayerSymbol;
                let currentScore = minimax(board, 0, false, humanPlayerSymbol, aiPlayerSymbol, currentMaxDepth);
                board[i] = '';
                if (currentScore > score) { score = currentScore; move = i; }
            }
            if (move !== -1) return move;
        }

        // 5. Təsadüfi Etibarlı Hərəkət (Əgər yuxarıdakılar işləməzsə)
        let availableCells = []; for (let i = 0; i < board.length; i++) { if (board[i] === '') availableCells.push(i); }
        if (availableCells.length > 0) return availableCells[Math.floor(Math.random() * availableCells.length)];

        console.error("[findBestMove] Heç bir hərəkət tapılmadı!");
        return -1; // Hərəkət tapılmadı
    }

    function getCenterCells(size) { const centerIndices = []; const isOdd = size % 2 !== 0; if (isOdd) { const center = Math.floor(size / 2); centerIndices.push(center * size + center); } else { const c1 = size / 2 - 1; const c2 = size / 2; centerIndices.push(c1 * size + c1); centerIndices.push(c1 * size + c2); centerIndices.push(c2 * size + c1); centerIndices.push(c2 * size + c2); } return centerIndices; };
    function minimax(currentBoard, depth, isMaximizing, humanSymbol, aiSymbol, maxDepth) { let winner = checkWinnerForMinimax(currentBoard, humanSymbol, aiSymbol); if (winner === aiSymbol) return 10 - depth; if (winner === humanSymbol) return depth - 10; if (!currentBoard.includes('')) return 0; if (depth >= maxDepth) return 0; if (isMaximizing) { let bestScore = -Infinity; for (let i = 0; i < currentBoard.length; i++) { if (currentBoard[i] === '') { currentBoard[i] = aiSymbol; bestScore = Math.max(bestScore, minimax(currentBoard, depth + 1, false, humanSymbol, aiSymbol, maxDepth)); currentBoard[i] = ''; } } return bestScore; } else { let bestScore = Infinity; for (let i = 0; i < currentBoard.length; i++) { if (currentBoard[i] === '') { currentBoard[i] = humanSymbol; bestScore = Math.min(bestScore, minimax(currentBoard, depth + 1, true, humanSymbol, aiSymbol, maxDepth)); currentBoard[i] = ''; } } return bestScore; } };
    function checkWinnerForMinimax(currentBoard, humanSymbol, aiSymbol) { const winConditions = generateWinConditions(boardSize); for (const condition of winConditions) { const cell1 = currentBoard[condition[0]]; if (cell1 !== '' && condition.every(index => currentBoard[index] === cell1)) return cell1; } return null; };

    // ----- Qazanma/Bərabərlik Yoxlaması -----
    function checkWin(playerSymbolToCheck) { winningCombination = []; const winConditions = generateWinConditions(boardSize); for (let i = 0; i < winConditions.length; i++) { const condition = winConditions[i]; const firstSymbol = board[condition[0]]; if (firstSymbol !== playerSymbolToCheck || firstSymbol === '') continue; let allSame = true; for (let j = 1; j < condition.length; j++) { if (board[condition[j]] !== firstSymbol) { allSame = false; break; } } if (allSame) { winningCombination = condition; return true; } } return false; };
    function generateWinConditions(size) { const conditions = []; const winLength = (size === 3 || size === 4) ? 3 : 4; for (let r = 0; r < size; r++) { for (let c = 0; c < size; c++) { if (c <= size - winLength) { const rowC = []; for (let k = 0; k < winLength; k++) rowC.push(r*size+(c+k)); conditions.push(rowC); } if (r <= size - winLength) { const colC = []; for (let k = 0; k < winLength; k++) colC.push((r+k)*size+c); conditions.push(colC); } if (r <= size - winLength && c <= size - winLength) { const dia1C = []; for (let k = 0; k<winLength; k++) dia1C.push((r+k)*size+(c+k)); conditions.push(dia1C); } if (r <= size - winLength && c >= winLength - 1) { const dia2C = []; for (let k = 0; k<winLength; k++) dia2C.push((r+k)*size+(c-k)); conditions.push(dia2C); } } } const uniqueConditions = conditions.map(cond => JSON.stringify(cond.sort((a,b)=>a-b))); return [...new Set(uniqueConditions)].map(str => JSON.parse(str)); };
    function checkDraw() { return !board.includes(''); };
    function highlightWinningCells() { winningCombination.forEach(index => { if(cells[index]) cells[index].classList.add('winning'); }); };

// --- Hissə 3 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: v2.2 - Socket.IO + AI URL + Debug Logs - Hissə 4/5

// ---- DOMContentLoaded içində davam edirik (Hissə 3-dən) ----

    // ----- Oyun Sonu -----
    function endGame(isDraw, winnerMark) {
        // Oyun bitdikdə çağırılır, statusu yeniləyir, effektləri işə salır
        console.log(`[endGame] Oyun bitdi. Bərabərlik: ${isDraw}, Qazanan İşarə: ${winnerMark}`);
        isGameOver = true; // Oyunun bitdiyini işarələ
        boardElement.style.pointerEvents = 'none'; // Lövhəni deaktiv et
        if (restartGameBtn) restartGameBtn.disabled = false; // Yenidən başlat düyməsini aktiv et

        const winnerName = winnerMark === player1Symbol ? currentPlayerName : opponentPlayerName; // Qalibin adını tap

        if (isDraw) {
            // Bərabərlik halı
            if (gameStatusDisplay) { gameStatusDisplay.textContent = "Oyun Bərabərə!"; gameStatusDisplay.classList.add('draw'); }
            if (turnIndicator) turnIndicator.textContent = "Bərabərə";
        } else {
            // Qalib varsa
            if (gameStatusDisplay) { gameStatusDisplay.textContent = `${escapeHtml(winnerName)} Qazandı!`; gameStatusDisplay.classList.add('win'); }
            if (turnIndicator) turnIndicator.textContent = "Bitdi";
             // Qalib üçün qeyd etmə effektləri
             if(winnerMark) triggerShatterEffect(winnerMark);
        }

        // Aktiv oyunçu stilini hər iki tərəfdən qaldır
        playerXInfo?.classList.remove('active-player');
        playerOInfo?.classList.remove('active-player');
        updatePlayerInfo(); // Oyunçu məlumatlarını son vəziyyətə görə yenilə
    } // endGame sonu


    // ----- Effektlər -----
    function triggerShatterEffect(winnerMark) {
        // Qalib üçün parçalanma mətn effektini işə salır
         if (!fireworksOverlay || !shatteringTextContainer || !winnerMark) return;
         clearShatteringText(); // Köhnə mətni təmizlə
         // Qalibə uyğun mətni yarat
         const text = winnerMark === player1Symbol ? "Siz Qazandınız!" : `${escapeHtml(opponentPlayerName)} Qazandı!`;
         const chars = text.split('');
         // Hər hərfi ayrı span-a yerləşdir
         chars.forEach((char, index) => { const span = document.createElement('span'); span.textContent = char === ' ' ? '\u00A0' : char; span.classList.add('shatter-char'); span.style.setProperty('--char-index', index); shatteringTextContainer.appendChild(span); });
         fireworksOverlay.classList.add('visible'); // Fişəng overlayını göstər
         shatteringTextContainer.style.opacity = '1'; // Mətni görünən et
         // Qısa gecikmədən sonra animasiyanı başlat
         setTimeout(() => {
             const spans = shatteringTextContainer.querySelectorAll('.shatter-char');
             // CSS dəyişənlərindən animasiya parametrlərini al
             const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-duration').replace('s',''))*1000||3000;
             const distance = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-distance').replace('px',''))||170;
             // Hər hərf üçün təsadüfi hərəkət parametrləri təyin et
             spans.forEach((span, i) => { const angle = Math.random()*360; const randDist = Math.random()*distance; const tx = Math.cos(angle*Math.PI/180)*randDist; const ty = Math.sin(angle*Math.PI/180)*randDist; const tz = (Math.random()-0.5)*distance*0.5; const rot = (Math.random()-0.5)*720; const delay = Math.random()*0.1; span.style.setProperty('--tx',`${tx}px`); span.style.setProperty('--ty',`${ty}px`); span.style.setProperty('--tz',`${tz}px`); span.style.setProperty('--rot',`${rot}deg`); span.style.animationDelay=`${delay}s`; span.classList.add('animate'); });
             // Animasiya bitdikdən sonra effektləri gizlət
             setTimeout(hideFireworks, duration + 500);
         }, 100);
     }
    function hideFireworks() {
        // Fişəng və parçalanma effektlərini gizlədir
        if (fireworksOverlay) fireworksOverlay.classList.remove('visible');
        if (shatteringTextContainer) shatteringTextContainer.style.opacity = '0';
        setTimeout(clearShatteringText, 500); // Mətnin tamamilə itməsini gözləyib təmizlə
    }
    function clearShatteringText() {
        // Parçalanma mətni konteynerini təmizləyir
        if (shatteringTextContainer) shatteringTextContainer.innerHTML = '';
    }


    // ----- Otaq Əməliyyatları (Placeholder - Server tərəfi lazımdır) -----
    function openEditModal() {
        // Otaq ayarları modalını açır (əgər icazə varsa)
        if(isPlayingAgainstAI) { alert("AI oyununda otaq ayarları dəyişdirilə bilməz."); return; }
        if(!isCurrentUserCreator) { alert("Yalnız otağı yaradan parametrləri dəyişə bilər."); return; }
        console.warn("Otaq ayarları funksionallığı hələ tam deyil (serverlə əlaqə yoxdur).");
        // Modalın içini doldur (əvvəlki kod kimi)
        if (!editRoomModal) return;
        const nameInput = editRoomModal.querySelector('#edit-room-name');
        const passwordCheck = editRoomModal.querySelector('#edit-room-password-check');
        const passwordInput = editRoomModal.querySelector('#edit-room-password');
        const boardSizeSelect = editRoomModal.querySelector('#edit-board-size');
        const msgElement = editRoomModal.querySelector('#edit-room-message');
        if(nameInput) nameInput.value = currentRoomData.name || '';
        if(passwordCheck) passwordCheck.checked = currentRoomData.hasPassword || false;
        if(passwordInput) { passwordInput.value = ''; passwordInput.style.display = passwordCheck?.checked ? 'block' : 'none'; }
        if(passwordCheck && passwordInput) { passwordCheck.onchange = null; passwordCheck.onchange = () => { passwordInput.style.display = passwordCheck.checked ? 'block' : 'none'; }; }
        if(boardSizeSelect) boardSizeSelect.value = currentRoomData.boardSize.toString();
        if(msgElement) { msgElement.textContent = ''; msgElement.className = 'message'; }
        showModal(editRoomModal);
    }
    function saveRoomChanges() {
        // Otaq ayarlarını yadda saxlayır (hələlik yalnız lokal)
        console.warn("Otaq ayarlarını yadda saxlama funksionallığı hələ tam deyil (serverə göndərilmir).");
        if (!editRoomModal) return;
        const nameInput = editRoomModal.querySelector('#edit-room-name');
        const passwordCheck = editRoomModal.querySelector('#edit-room-password-check');
        const passwordInput = editRoomModal.querySelector('#edit-room-password');
        const boardSizeSelect = editRoomModal.querySelector('#edit-board-size');
        const msgElement = editRoomModal.querySelector('#edit-room-message');
        const newName = nameInput?.value.trim();
        const newHasPasswordChecked = passwordCheck?.checked;
        const newBoardSize = parseInt(boardSizeSelect?.value || currentRoomData.boardSize.toString(), 10);
        if (!newName) { showMsg(msgElement, 'Otaq adı boş ola bilməz.', 'error'); return; }
        let newPasswordValue = null; let finalHasPassword = false;
        if (newHasPasswordChecked) { if (!passwordInput) { showMsg(msgElement, 'Şifrə sahəsi tapılmadı!', 'error'); return; } newPasswordValue = passwordInput.value; if (!newPasswordValue || newPasswordValue.length < 2 || !(/[a-zA-Z]/.test(newPasswordValue) && /\d/.test(newPasswordValue))) { showMsg(msgElement, 'Şifrə tələblərə uyğun deyil.', 'error', 5000); return; } finalHasPassword = true; } else { finalHasPassword = false; newPasswordValue = null; }
        let needsRestart = false;
        if (currentRoomData.boardSize !== newBoardSize) { needsRestart = true; currentRoomData.boardSize = newBoardSize; boardSize = newBoardSize; adjustStylesForBoardSize(boardSize); }
        currentRoomData.name = newName; currentRoomData.hasPassword = finalHasPassword;
        if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(newName)}`;
        // TODO: Serverə 'update_room_settings' emit et
        showMsg(msgElement, 'Dəyişikliklər yadda saxlandı (Lokal).', 'success', 2500);
        hideModal(editRoomModal);
        if (needsRestart) { console.log("Ölçü dəyişdiyi üçün oyun yenidən başladılır..."); handleRestartGame(true); /* Serverə də bildirmək lazımdır! */ }
    }
    function deleteRoom() {
        // Otağı silir (hələlik yalnız lokal simulyasiya)
        console.warn("Otaq silmə funksionallığı hələ tam deyil (serverə göndərilmir).");
        if(isPlayingAgainstAI || !isCurrentUserCreator) return; // Şərtlər
        if (confirm(`'${escapeHtml(currentRoomData.name)}' otağını silmək istədiyinizə əminsiniz?`)) {
            const msgElement = editRoomModal?.querySelector('#edit-room-message');
            showMsg(msgElement, 'Otaq silinir...', 'info', 0);
            // TODO: Serverə 'delete_room' emit et
             if (socket && socket.connected) socket.emit('delete_room', { roomId: currentRoomId });
            // Lobiyə yönləndir (serverdən təsdiq gözləmədən)
            setTimeout(() => {
                alert("Otaq silindi. Lobiyə qayıdırsınız.");
                window.location.href = '../lobby/test_odalar.html';
            }, 1500);
        }
    }
    function handleKickOpponent() {
        // Rəqibi qovur (hələlik yalnız lokal simulyasiya)
        if (isPlayingAgainstAI || !isCurrentUserCreator || !isOpponentPresent) return; // Şərtlər
        if (confirm(`${escapeHtml(opponentPlayerName)}-i otaqdan çıxarmaq istədiyinizə əminsiniz?`)) {
             console.warn("Kick funksionallığı hələ tam deyil (serverə göndərilmir).");
             // TODO: Serverə 'kick_opponent' emit et
             if (socket && socket.connected) socket.emit('kick_opponent', { roomId: currentRoomId });

             // Lokal olaraq rəqibin ayrılmasını simulyasiya edək
              opponentPlayerName = 'Rəqib Gözlənilir...'; isOpponentPresent = false; isPlayingAgainstAI = false; aiPlayerSymbol = '';
              if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName; if (playerOSymbolDisplay) playerOSymbolDisplay.textContent = '?'; if (playerOInfo) playerOInfo.className = 'player-info'; playerOInfo?.classList.remove('active-player');
              isGameOver = true; resetGameStateVars(); resetBoardAndStatus();
              if (gameStatusDisplay) gameStatusDisplay.textContent = `Rəqib çıxarıldı. Rəqib gözlənilir...`; if (turnIndicator) turnIndicator.textContent = "Gözlənilir";
              updateHeaderButtonsVisibility(); hideModal(diceRollModal); hideModal(symbolSelectModal);
        }
    }
    function handleCallSnow() {
        // Bu funksiya oyun içində mənasızdır, lobidən gəlmək daha məntiqlidir.
        console.log("handleCallSnow: Oyun içində işləmir.");
    }


    // ----- Yeniden Başlatma -----
    function handleRestartGame(accepted = false) {
        // Oyunu yenidən başlatma məntiqi
        // Oyun bitməyibsə və ya multiplayerdə rəqib yoxdursa, heç nə etmə
        if (!isGameOver || (!isOpponentPresent && !isPlayingAgainstAI)) {
             console.log(`Yenidən başlatmaq üçün şərtlər ödənmir (GameOver=${isGameOver}, OpponentPresent=${isOpponentPresent}, IsAI=${isPlayingAgainstAI}).`);
             return;
        }
        console.log(`handleRestartGame çağırıldı. Qəbul edilib: ${accepted}`);

        if (isPlayingAgainstAI) {
             // AI oyununda dərhal lokal restart et
             console.log("AI oyunu yenidən başladılır...");
             performLocalRestart();
        } else {
             // Multiplayer oyunu
             if (accepted) {
                  // Əgər qəbul edilibsə (ya biz qəbul etdik, ya rəqibdən gəldi)
                  console.log("Multiplayer oyunu yenidən başladılır...");
                  performLocalRestart(); // Lokal restart et
                  // Serverə və ya rəqibə təkrar bildirməyə ehtiyac yoxdur,
                  // çünki 'accept_restart' hər iki tərəfdə bunu etməlidir.
             } else {
                  // Əgər restart düyməsinə basılıbsa (təklif göndərilir)
                  if (socket && socket.connected) {
                       console.log("Yenidən başlatma təklifi serverə göndərilir ('request_restart')...");
                       socket.emit('request_restart'); // Serverə təklifi göndər
                       if(gameStatusDisplay) gameStatusDisplay.textContent = "Yenidən başlatma təklifi göndərildi. Rəqib gözlənilir...";
                       if(restartGameBtn) restartGameBtn.disabled = true; // Cavab gələnə qədər deaktiv et
                       // Cavab üçün timeout
                       setTimeout(() => {
                            if(restartGameBtn && restartGameBtn.disabled && isGameOver) { // Hələ də deaktivdirsə
                                 restartGameBtn.disabled = false;
                                 if(gameStatusDisplay && gameStatusDisplay.textContent.includes("gözlənilir")) {
                                      gameStatusDisplay.textContent = "Yenidən başlatma təklifinə cavab gəlmədi.";
                                 }
                            }
                       }, 15000); // 15 saniyə
                  } else {
                       alert("Serverlə bağlantı yoxdur. Təklif göndərilə bilmədi.");
                  }
             }
        }
    } // handleRestartGame sonu

    function performLocalRestart() {
        // Əsl restart əməliyyatlarını edən funksiya
         console.log("performLocalRestart: Oyun vəziyyəti və lövhə sıfırlanır...");
         hideFireworks(); // Effektləri gizlət
         resetGameStateVars(); // Oyun dəyişənlərini sıfırla
         resetBoardAndStatus(); // Lövhəni və UI-ni sıfırla

         if (isOpponentPresent) { // Rəqib (və ya AI) hələ də 'varsa'
              if (gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yenidən başlayır. Zər atılır...";
              setupDiceModalForRollOff(); // Zər modalını hazırla
              showModal(diceRollModal); // Modalı göstər
              initDice(); // Zəri sıfırla
         } else {
              // Bu hal normalda yalnız rəqib ayrıldıqdan sonra baş verə bilər
              console.warn("performLocalRestart: Rəqib olmadan restart edilir?");
              if (gameStatusDisplay) gameStatusDisplay.textContent = "Rəqib gözlənilir...";
              hideModal(diceRollModal); hideModal(symbolSelectModal); updateHeaderButtonsVisibility();
         }
          if (restartGameBtn) restartGameBtn.disabled = true; // Restart düyməsi oyun başlayana qədər deaktiv olur
    }

// --- Hissə 4 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: v2.2 - Socket.IO + AI URL + Debug Logs - Hissə 5/5

// ---- DOMContentLoaded içində davam edirik (Hissə 4-dən) ----

    // ===== SOCKET.IO BAĞLANTISI və OYUN İÇİ HADİSƏLƏR =====
    function setupGameSocketConnection(roomId) {
        // Socket.IO bağlantısını qurur (əgər AI oyunu deyilsə)
        if (socket && socket.connected) socket.disconnect(); // Köhnəni bağla
        if (isPlayingAgainstAI || !roomId) {
            console.log(`[SocketSetup] AI oyunu (${isPlayingAgainstAI}) və ya RoomID (${roomId}) olmadığı üçün socket qurulmur.`);
            return;
        }
        console.log(`[SocketSetup] ${roomId} otağı üçün bağlantı qurulur...`);
        showLoadingOverlay('Serverə qoşulunur...');

        socket = io({ reconnectionAttempts: 3 }); // Qoşulma cəhdlərini məhdudlaşdır

        // --- Əsas Bağlantı Hadisələri ---
        socket.on('connect', () => {
            console.log(`[Socket] Oyun serverinə qoşuldu! ID: ${socket.id}, Otaq ID: ${roomId}`);
            hideLoadingOverlay();
            // Serverə bu otaqda olduğumuzu bildirək (Join prosesi üçün vacib ola bilər)
            socket.emit('player_ready_in_room', { roomId: roomId }); // Yeni hadisə adı
            if (gameStatusDisplay && !isOpponentPresent) { gameStatusDisplay.textContent = 'Rəqib gözlənilir...'; }
        });
        socket.on('disconnect', (reason) => {
            console.warn('[Socket] Serverlə bağlantı kəsildi:', reason);
            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Bağlantı kəsildi!';
            if (turnIndicator) turnIndicator.textContent = "Offline";
            isGameOver = true;
            isOpponentPresent = false;
            opponentPlayerName = 'Rəqib (Offline)';
            updatePlayerInfo();
            boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';
            // Təkrar qoşulma uğursuz olsa, lobiyə yönləndirmək olar
            // socket.io avtomatik cəhd edəcək ('reconnectionAttempts: 3')
        });
        socket.on('connect_error', (error) => {
            console.error('[Socket] Qoşulma xətası:', error.message);
            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Qoşulma xətası!';
            if (turnIndicator) turnIndicator.textContent = "Xəta";
            isGameOver = true;
            boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';
             alert(`Serverə qoşulmaq mümkün olmadı: ${error.message}`);
        });
        socket.on('room_deleted_kick', (data) => {
             console.warn('Otaq silindiyi üçün çıxarıldınız:', data?.message);
             alert(data?.message || 'Otaq yaradan tərəfindən silindi.');
             window.location.href = '../lobby/test_odalar.html'; // Lobiyə yönləndir
        });

        // --- Oyunla Bağlı Hadisələr ---
        setupGameEventListeners(socket); // Əvvəlki hissələrdə təyin edilmiş funksiyanı çağırırıq

    } // setupGameSocketConnection sonu


    function setupGameEventListeners(socketInstance) {
        // Oyunla bağlı Socket.IO hadisələrini dinləyir
        console.log("[SocketListeners] Oyun hadisə dinləyiciləri quraşdırılır...");

        // RƏQİBİN QOŞULMASI
        socketInstance.on('opponent_joined', (data) => {
            console.log(`[Socket Event] opponent_joined alındı:`, data);
            if (isPlayingAgainstAI) return; // Əgər AI ilə oynayırdıqsa, real rəqib qoşulması mesajını ignor et
            opponentPlayerName = data?.username || 'Rəqib (?)';
            isOpponentPresent = true;
            if (playerONameDisplay) playerONameDisplay.textContent = escapeHtml(opponentPlayerName);
            if (gameStatusDisplay) gameStatusDisplay.textContent = `${opponentPlayerName} qoşuldu. Zər atılır...`;
            // Zər modalını hazırla və göstər
            setupDiceModalForRollOff();
            showModal(diceRollModal);
            initDice(); // Zəri sıfırla və klikləməni aktiv et
            updatePlayerInfo(); // UI yenilə
            updateHeaderButtonsVisibility(); // Düymələri yenilə
        });

        // RƏQİBİN AYRILMASI
        socketInstance.on('opponent_left_game', (data) => {
            console.log(`[Socket Event] opponent_left_game alındı:`, data);
            if (isPlayingAgainstAI) return; // AI oyununda bu hadisə baş verməməlidir
            const opponentWhoLeft = data?.username || 'Rəqib';
            if (gameStatusDisplay) gameStatusDisplay.textContent = `${opponentWhoLeft} otaqdan ayrıldı.`;
            if (turnIndicator) turnIndicator.textContent = "Gözlənilir";
            isGameOver = true;
            isOpponentPresent = false;
            opponentPlayerName = 'Rəqib Gözlənilir...';
            resetGameStateVars();
            resetBoardAndStatus();
            hideModal(diceRollModal);
            hideModal(symbolSelectModal);
            if (restartGameBtn) restartGameBtn.disabled = true;
            updateHeaderButtonsVisibility(); // Header düymələrini yenilə
        });

        // RƏQİBİN ZƏR NƏTİCƏSİ
        socketInstance.on('opponent_dice_result', (data) => {
            console.log(`[Socket Event] opponent_dice_result alındı:`, data);
            if (isPlayingAgainstAI || !data || typeof data.roll !== 'number') return; // AI oyununda və ya data səhvdirsə ignor et
            const processResult = () => {
                player2Roll = data.roll;
                if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = player2Roll;
                if (player1Roll !== null) { // Əgər öz nəticəmiz də varsa
                    handleRollOffResults(player1Roll, player2Roll); // Nəticəni emal et
                }
            };
            if (isDiceRolling) { setTimeout(processResult, 500); } else { processResult(); } // Animasiya gedirsə gözlə
        });

        // RƏQİBİN SİMVOL SEÇİMİ
        socketInstance.on('opponent_symbol_chosen', (data) => {
            console.log(`[Socket Event] opponent_symbol_chosen alındı:`, data);
            if (isPlayingAgainstAI || !data || (data.symbol !== 'X' && data.symbol !== 'O')) return; // AI və ya səhv data
            // Modal açıqdırsa, oyunu rəqibin seçdiyi simvolla başlat
            if (symbolSelectModal && symbolSelectModal.style.display === 'block') {
                startGameProcedure(data.symbol);
            } else { console.warn("opponent_symbol_chosen alındı, amma modal bağlı idi?"); }
        });

        // RƏQİBİN HƏRƏKƏTİ
        socketInstance.on('opponent_moved', (data) => {
            console.log(`[Socket Event] opponent_moved alındı:`, data);
            if (isPlayingAgainstAI || !data || typeof data.index !== 'number' || !data.mark || isGameOver) return; // AI, səhv data, oyun bitibsə ignor et

            placeMark(data.index, data.mark); // Rəqibin hərəkətini yerləşdir

            if (!isGameOver) { // Əgər oyun bitmədisə
                switchPlayer(); // Sıranı özümüzə ver
                updateTurnIndicator(); // UI yenilə
                boardElement.style.pointerEvents = 'auto'; // Lövhəni aktiv et
                if (gameStatusDisplay) gameStatusDisplay.textContent = `Sıra: ${currentPlayerName}`;
            } else {
                boardElement.style.pointerEvents = 'none'; // Oyun bitibsə deaktiv et
            }
        });

        // YENİDƏN BAŞLATMA TƏKLİFİ ALINDI
        socketInstance.on('restart_requested', (data) => {
             console.log(`[Socket Event] restart_requested alındı: ${data?.username}`);
             if (isGameOver && isOpponentPresent && !isPlayingAgainstAI) { // Yalnız multiplayer oyun bitdikdə
                  const requester = data?.username || 'Rəqib';
                  if (confirm(`${requester} oyunu yenidən başlatmağı təklif edir. Qəbul edirsiniz?`)) {
                       console.log("Yenidən başlatma təklifi qəbul edildi.");
                       socketInstance.emit('accept_restart'); // Serverə qəbul etdiyimizi bildir
                       handleRestartGame(true); // Lokal olaraq restart et
                  } else {
                       console.log("Yenidən başlatma təklifi rədd edildi.");
                       // Rədd etmə mesajı serverə göndərilə bilər (istəyə bağlı)
                       // socketInstance.emit('reject_restart');
                  }
             } else { console.warn("restart_requested alındı, amma şərtlər ödənmir."); }
        });

        // YENİDƏN BAŞLATMA QƏBUL EDİLDİ
        socketInstance.on('restart_accepted', (data) => {
            console.log(`[Socket Event] restart_accepted alındı: ${data?.username}`);
             if (isGameOver && isOpponentPresent && !isPlayingAgainstAI) { // Yalnız multiplayer oyun bitdikdə
                  const accepter = data?.username || 'Rəqib';
                  if (gameStatusDisplay) gameStatusDisplay.textContent = `${accepter} yenidən başlatmağı qəbul etdi. Zər atılır...`;
                  // Oyunu yenidən başlat (hər iki tərəf restart edir)
                  handleRestartGame(true);
             } else { console.warn("restart_accepted alındı, amma şərtlər ödənmir."); }
        });

         // Server tərəfindən istifadəçi məlumatlarını təsdiqləmək üçün
         socketInstance.on('room_info', (roomInfo) => {
              console.log("[Socket Event] room_info alındı:", roomInfo);
              if(!roomInfo) return;
              // Yaradanı təyin et
              if(roomInfo.creatorUsername) {
                   currentRoomData.creatorUsername = roomInfo.creatorUsername;
                   isCurrentUserCreator = (loggedInUser.nickname === roomInfo.creatorUsername);
                   console.log(`Otaq yaradanı təyin edildi: ${roomInfo.creatorUsername}. Bu client yaradıcıdır: ${isCurrentUserCreator}`);
              }
              // Şifrə statusunu yenilə
              if(typeof roomInfo.hasPassword === 'boolean'){
                   currentRoomData.hasPassword = roomInfo.hasPassword;
              }
              // Otaq adını yenilə
              if(roomInfo.name && roomNameDisplay) {
                   roomNameDisplay.textContent = `Otaq: ${escapeHtml(roomInfo.name)}`;
                   currentRoomData.name = roomInfo.name;
              }
              // Rəqib adını yenilə (əgər varsa və hələ təyin edilməyibsə)
              if(roomInfo.opponentUsername && !isOpponentPresent) {
                   console.log(`room_info-dan rəqib adı təyin edilir: ${roomInfo.opponentUsername}`);
                   opponentPlayerName = roomInfo.opponentUsername;
                   isOpponentPresent = true;
                   if(playerONameDisplay) playerONameDisplay.textContent = escapeHtml(opponentPlayerName);
                   // Əgər rəqib varsa, oyun statusunu yeniləmək və zər mərhələsinə keçmək lazım ola bilər
                   if (gameStatusDisplay && gameStatusDisplay.textContent.includes("gözlənilir")) {
                        gameStatusDisplay.textContent = `${opponentPlayerName} artıq otaqdadır. Zər atılır...`;
                        setupDiceModalForRollOff();
                        showModal(diceRollModal);
                        initDice();
                   }
              }
              // Düymələrin görünüşünü yenilə
              updateHeaderButtonsVisibility();
         });

    } // setupGameEventListeners sonu


    // ===== OYUNU BAŞLATMAQ ÜÇÜN İLK ADDIMLAR =====
    function initializeGame() {
        // URL parametrlərini alır, autentifikasiyanı yoxlayır (artıq edilib), UI-ni qurur
        console.log("[initializeGame] Başladı.");
        showLoadingOverlay('Oyun interfeysi qurulur...');

        try {
            const params = getUrlParams();
            currentRoomId = params.roomId;
            const receivedRoomName = params.roomName;
            boardSize = params.size;
            isPlayingAgainstAI = params.playWithAI;

            if (!playerXNameDisplay) throw new Error("playerXNameDisplay elementi tapılmadı!");
            playerXNameDisplay.textContent = currentPlayerName; // Auth-dan gələn ad

            if (isPlayingAgainstAI) {
                // AI Oyunu
                console.log("[initializeGame] AI Oyunu (SNOW) başladılır.");
                opponentPlayerName = "SNOW";
                isOpponentPresent = true;
                isCurrentUserCreator = true; // AI oyununda user həmişə yaradıcıdır
                currentRoomData = { id: currentRoomId || `ai_local_${Date.now()}`, name: receivedRoomName, creatorUsername: currentPlayerName, hasPassword: false, boardSize: boardSize, isAiRoom: true };
                if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(currentRoomData.name)}`;
                if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;
                updateHeaderButtonsVisibility();
                adjustStylesForBoardSize(boardSize);
                createBoard();
                resetGameStateVars();
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'SNOW ilə oyun başlayır. Zər atın!';
                hideLoadingOverlay();
                setupDiceModalForRollOff();
                showModal(diceRollModal);
                initDice();
            } else {
                // Normal (Multiplayer) Oyun
                console.log(`[initializeGame] Multiplayer oyunu başladılır. RoomID: ${currentRoomId}`);
                if (!currentRoomId) throw new Error("Multiplayer oyunu üçün Otaq ID tapılmadı!");
                opponentPlayerName = "Rəqib Gözlənilir...";
                isOpponentPresent = false;
                isCurrentUserCreator = false; // Serverdən gələcək məlumatla təyin olunacaq
                currentRoomData = { id: currentRoomId, name: receivedRoomName, creatorUsername: '?', hasPassword: false, boardSize: boardSize, isAiRoom: false };
                if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(currentRoomData.name)}`;
                if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;
                updateHeaderButtonsVisibility();
                adjustStylesForBoardSize(boardSize);
                createBoard();
                resetGameStateVars();
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'Rəqib gözlənilir...';
                boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';
                if (restartGameBtn) restartGameBtn.disabled = true;
                setupGameSocketConnection(currentRoomId); // Socket bağlantısını qur
                hideLoadingOverlay(); // Yükləməni gizlət
            }
            try { const diceSizeValue = getComputedStyle(document.documentElement).getPropertyValue('--dice-size').trim(); if (diceSizeValue) initialCenterZ = parseFloat(diceSizeValue.replace('px','')) / -2; } catch(e) { initialCenterZ = -55; }
            updatePlayerInfo();
            console.log(`[initializeGame] Oyun interfeysi quruldu. AI=${isPlayingAgainstAI}`);
        } catch (initError) {
            console.error("[initializeGame] Ümumi xəta:", initError);
            hideLoadingOverlay();
            if(gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yüklənərkən xəta baş verdi.";
            if(turnIndicator) turnIndicator.textContent = "Xəta";
        }
    } // initializeGame sonu


    // ===== GİRİŞ YOXLAMASI və BAŞLANĞIC (IIFE ilə) =====
    // Bu hissə kodun ən sonunda yerləşir və səhifə yüklənəndə işə düşür
    (async () => {
        try {
            console.log("Oda İçi: /check-auth sorğusu...");
            showLoadingOverlay('Sessiya yoxlanılır...');
            const response = await fetch('/check-auth');
            const data = await response.json();
            if (!response.ok || !data.loggedIn) {
                // Yolu dəqiqləşdirin
                window.location.href = '/ANA SEHIFE/login/login.html';
                return;
            }
            loggedInUser = data.user;
            currentPlayerName = loggedInUser.nickname; // İstifadəçi adını qlobal dəyişənə yaz
            console.log(`Oda İçi: Giriş edilib: ${loggedInUser.nickname}`);

            initializeGame(); // Autentifikasiya uğurlu olduqdan sonra oyunu başlat

        } catch (error) {
            console.error("Oda İçi: Auth yoxlama xətası:", error);
            hideLoadingOverlay();
            alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
            // Yolu dəqiqləşdirin
            window.location.href = '/ANA SEHIFE/login/login.html';
        }
    })(); // Async IIFE (Immediately Invoked Function Expression) sonu

    // --- Əsas UI Hadisə Dinləyiciləri ---
    // Bu listenerlar DOM hazır olduqdan sonra bir dəfə təyin edilir
    console.log("Əsas UI listenerları əlavə edilir...");
    if (leaveRoomBtn) { leaveRoomBtn.addEventListener('click', () => { if (confirm("Otaqdan çıxmaq istədiyinizə əminsiniz?")) { if (!isPlayingAgainstAI && socket && socket.connected) { socket.emit('leave_room'); } window.location.href = '../lobby/test_odalar.html'; } }); console.log("--> leaveRoomBtn listener əlavə edildi."); } else { console.error("leaveRoomBtn null idi!"); }
    if (restartGameBtn) { restartGameBtn.addEventListener('click', () => handleRestartGame(false)); console.log("--> restartGameBtn listener əlavə edildi."); } else { console.error("restartGameBtn null idi!"); }
    if (editRoomBtn) { editRoomBtn.addEventListener('click', openEditModal); console.log("--> editRoomBtn listener əlavə edildi."); } else { console.error("editRoomBtn null idi!"); }
    if (closeEditModalButton) { closeEditModalButton.addEventListener('click', () => hideModal(editRoomModal)); console.log("--> closeEditModalButton listener əlavə edildi."); } else { console.warn("closeEditModalButton null idi (normal ola bilər)."); }
    window.addEventListener('click', (event) => { if (event.target == editRoomModal) hideModal(editRoomModal); }); console.log("--> window click listener (modal bağlama) əlavə edildi.");
    if (saveRoomChangesBtn) { saveRoomChangesBtn.addEventListener('click', saveRoomChanges); console.log("--> saveRoomChangesBtn listener əlavə edildi."); } else { console.error("saveRoomChangesBtn null idi!"); }
    if (deleteRoomConfirmBtn) { deleteRoomConfirmBtn.addEventListener('click', deleteRoom); console.log("--> deleteRoomConfirmBtn listener əlavə edildi."); } else { console.error("deleteRoomConfirmBtn null idi!"); }
    if (kickOpponentBtn) { kickOpponentBtn.addEventListener('click', () => handleKickOpponent(false)); console.log("--> kickOpponentBtn listener əlavə edildi."); } else { console.error("kickOpponentBtn null idi!"); }
    if (callSnowBtn) { callSnowBtn.addEventListener('click', handleCallSnow); console.log("--> callSnowBtn listener əlavə edildi."); } else { console.error("callSnowBtn null idi!"); }
    if (diceCubeElement) { diceCubeElement.addEventListener('mousedown', handleMouseDown); diceCubeElement.addEventListener('touchstart', handleTouchStart, { passive: false }); console.log("--> diceCubeElement listenerları əlavə edildi."); } else { console.error("Zər kub elementi (diceCubeElement) tapılmadı!"); }
    console.log("Əsas UI listenerlarının əlavə edilməsi bitdi.");

}); // DOMContentLoaded Sonu - BU ƏN SONDA OLMALIDIR