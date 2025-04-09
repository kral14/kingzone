// public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: v2.4 - SNOW funksionallığı ilə (handleCallSnow + handleRemoveSnow)
// Hissə 1/5 - Qlobal Dəyişənlər, DOM, Yardımçılar, Sıfırlama

document.addEventListener('DOMContentLoaded', () => { // async olmayan versiya
    console.log("Oda İçi JS (v2.4 - SNOW funksionallığı) Başladı.");

    // ---- Qlobal Dəyişənlər ----
    let loggedInUser = null;
    let currentRoomId = null;
    let currentRoomData = {}; // Otaq məlumatlarını saxlamaq üçün (ad, yaradan və s.)
    let socket = null;
    let currentPlayerName = 'Oyunçu'; // Girişdən sonra yenilənəcək
    let opponentPlayerName = 'Rəqib';
    let isOpponentPresent = false; // Otaqda real rəqib və ya AI varmı?
    let isPlayingAgainstAI = false; // Hazırda AI ilə oynanılırmı?
    let aiPlayerSymbol = ''; // AI-nin simvolu (X və ya O)
    let isCurrentUserCreator = false; // Bu client otağı yaradıb mı?

    // ---- Oyun Durumu Dəyişənləri ----
    let board = []; // Oyun lövhəsi (massiv)
    let currentPlayer = ''; // Hazırkı oyunçunun simvolu (X və ya O)
    let player1Symbol = '?'; // Bu clientin simvolu
    let player2Symbol = '?'; // Rəqibin/AI-nin simvolu
    let isGameOver = true; // Oyun bitibmi?
    let boardSize = 3; // Default lövhə ölçüsü
    let cells = []; // Lövhə hüceyrələrinin DOM elementləri
    let winningCombination = []; // Qazanan kombinasiyanın indeksləri
    let player1Roll = null; // Bu clientin zər nəticəsi
    let player2Roll = null; // Rəqibin/AI-nin zər nəticəsi
    let diceWinner = null; // Zər atma qalibinin adı (simvol seçimi üçün)

    // ---- DOM Elementləri ----
    console.log("DOM elementləri seçilir...");
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
    const kickOpponentBtn = document.getElementById('kick-opponent-btn');
    const callSnowBtn = document.getElementById('call-snow-btn'); // SNOW'u Çağır düyməsi
    const removeSnowBtn = document.getElementById('remove-snow-btn'); // SNOW'u Çıxart düyməsi
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
    console.log("DOM element seçimi bitdi.");

    // ---- Zar Değişkenleri ----
    let isDiceRolling = false;
    let currentDiceRotateX = 0; let currentDiceRotateY = 0; let currentDiceRotateZ = 0;
    const diceRotations = { 1: { x: 0, y: 0 }, 6: { x: 0, y: 180 }, 4: { x: 0, y: 90 }, 3: { x: 0, y: -90 }, 2: { x: -90, y: 0 }, 5: { x: 90, y: 0 } };
    let isDragging = false; let dragStartX, dragStartY, previousMouseX, previousMouseY;
    const dragThreshold = 10; const rotateSensitivity = 0.4; let initialCenterZ = -55; // Dinamik olaraq hesablanacaq

    // ---- Yardımçı Fonksiyonlar ----
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    const showMsg = (el, msg, type = 'info', duration = 3000) => { if(el){ el.textContent = msg; el.className = `message ${type}`; if (el.timeoutId) clearTimeout(el.timeoutId); if (duration > 0) { el.timeoutId = setTimeout(() => { if (el.textContent === msg) { el.textContent = ''; el.className = 'message'; } }, duration); } } };
    function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return String(unsafe); return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); };
    function showLoadingOverlay(text = 'Yüklənir...') { if(gameLoadingOverlay) { const loadingText = gameLoadingOverlay.querySelector('.game-loading-text'); if(loadingText) loadingText.textContent = text; gameLoadingOverlay.classList.add('visible'); } else console.error("gameLoadingOverlay elementi tapılmadı!"); };
    function hideLoadingOverlay() { if(gameLoadingOverlay) gameLoadingOverlay.classList.remove('visible'); };

    // ----- URL Parametrlərini Alma -----
    function getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const sizeParam = parseInt(params.get('size') || '3', 10);
        const validatedSize = Math.max(3, Math.min(6, sizeParam));
        const urlAiParam = params.get('ai');
        const playWithAI = urlAiParam === 'SNOW';
        const roomNameParam = decodeURIComponent(params.get('roomName') || 'Bilinməyən Otaq');
        const roomIdParam = params.get('roomId');
        return {
            roomId: roomIdParam,
            roomName: roomNameParam,
            // playerName: decodeURIComponent(params.get('playerName') || 'Qonaq'), // Artıq check-auth ilə gəlir
            size: validatedSize,
            playWithAI: playWithAI
        };
    }

    // ----- Oyun Vəziyyəti Sıfırlama -----
    function resetGameStateVars() {
        board = Array(boardSize * boardSize).fill('');
        currentPlayer = '';
        player1Symbol = '?';
        player2Symbol = '?';
        isGameOver = true;
        winningCombination = [];
        player1Roll = null;
        player2Roll = null;
        diceWinner = null;
        // isPlayingAgainstAI və aiPlayerSymbol burada sıfırlanmır, handleRemoveSnow-da sıfırlanır.
        console.log("[resetGameStateVars] Oyun dəyişənləri sıfırlandı.");
    };
    function resetBoardAndStatus() {
        console.log("[resetBoardAndStatus] Lövhə və status sıfırlanır.");
        if (gameStatusDisplay) { gameStatusDisplay.textContent = ''; gameStatusDisplay.className = 'game-status'; }
        if (turnIndicator) turnIndicator.textContent = 'Gözlənilir...';
        cells.forEach((cell, index) => {
            if (!cell) return; // Ehtiyat üçün yoxlama
            const newCell = cell.cloneNode(true);
            newCell.className = 'cell';
            newCell.textContent = '';
            newCell.style.cursor = 'not-allowed';
            newCell.style.animation = '';
            cell.parentNode?.replaceChild(newCell, cell); // parentNode null ola bilər, yoxlayaq
            cells[index] = newCell;
        });
        updatePlayerInfo();
        if(boardElement){
             boardElement.style.opacity = '0.5';
             boardElement.style.pointerEvents = 'none';
        }
        if (restartGameBtn) restartGameBtn.disabled = true;
        hideFireworks();
        clearShatteringText();
    };

// --- Hissə 1/5 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Hissə 2/5 - UI Yeniləmə Funksiyaları

    // ----- UI Yeniləmələri -----
    function adjustStylesForBoardSize(size) {
        // Lövhə ölçüsünə görə CSS dəyişənlərini tənzimləyir
        let cellSizeVar = '--cell-size-large-dynamic';
        if (size === 4) cellSizeVar = '--cell-size-medium-dynamic';
        else if (size >= 5) cellSizeVar = '--cell-size-small-dynamic';
        
        document.documentElement.style.setProperty('--current-cell-size', `var(${cellSizeVar})`);
        document.documentElement.style.setProperty('--current-font-size', `calc(var(${cellSizeVar}) * 0.6)`);
        document.documentElement.style.setProperty('--board-size', size);
        console.log(`[adjustStylesForBoardSize] Lövhə ölçüsü ${size}x${size} üçün stillər tənzimləndi.`);
        
         try { // Zar ölçüsünü də hesablayaq
             const diceSizeValue = getComputedStyle(document.documentElement).getPropertyValue('--dice-size').trim();
             if (diceSizeValue) initialCenterZ = parseFloat(diceSizeValue.replace('px','')) / -2; else initialCenterZ = -55;
         } catch(e) { initialCenterZ = -55; console.warn("[adjustStylesForBoardSize] Zar ölçüsü CSS-dən alına bilmədi."); }
    };

    function createBoard() {
        // Oyun lövhəsini dinamik olaraq yaradır
        if (!boardElement) { console.error("createBoard: boardElement tapılmadı!"); return; }
        boardElement.innerHTML = ''; cells = [];
        const cellCount = boardSize * boardSize;
        console.log(`[createBoard] ${boardSize}x${boardSize} ölçülü (${cellCount} hüceyrə) lövhə yaradılır...`);
        for (let i = 0; i < cellCount; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.index = i;
            cell.style.cursor = 'not-allowed';
            boardElement.appendChild(cell);
            cells.push(cell);
        }
        console.log(`[createBoard] ${cells.length} hüceyrə yaradıldı.`);
    };

    function updatePlayerInfo() {
        // Oyunçu məlumatlarını UI-də yeniləyir
        if (!playerXInfo || !playerOInfo || !playerXSymbolDisplay || !playerOSymbolDisplay || !playerXNameDisplay || !playerONameDisplay) return;
        playerXSymbolDisplay.textContent = player1Symbol;
        playerXNameDisplay.textContent = escapeHtml(currentPlayerName);
        playerXInfo.className = `player-info ${player1Symbol === 'X' ? 'player-x' : (player1Symbol === 'O' ? 'player-o' : '')}`;
        playerOSymbolDisplay.textContent = player2Symbol;
        playerONameDisplay.textContent = escapeHtml(opponentPlayerName);
        playerOInfo.className = `player-info ${player2Symbol === 'X' ? 'player-x' : (player2Symbol === 'O' ? 'player-o' : '')}`;
        if (!isGameOver) {
            playerXInfo.classList.toggle('active-player', currentPlayer === player1Symbol);
            playerOInfo.classList.toggle('active-player', currentPlayer === player2Symbol);
        } else {
            playerXInfo.classList.remove('active-player');
            playerOInfo.classList.remove('active-player');
        }
    };

    function updateTurnIndicator() {
        // Sıra göstəricisini yeniləyir
        if (!turnIndicator) return;
        if (isGameOver) {
            turnIndicator.textContent = gameStatusDisplay?.textContent?.includes("Qazandı") || gameStatusDisplay?.textContent?.includes("Bərabərə") 
                                      ? gameStatusDisplay.textContent 
                                      : 'Oyun Bitdi';
            return;
        }
        if (!currentPlayer) {
            turnIndicator.textContent = 'Simvol Seçilir...';
            return;
        }
        const turnPlayerName = (currentPlayer === player1Symbol) ? currentPlayerName : opponentPlayerName;
        turnIndicator.textContent = `Sıra: ${escapeHtml(turnPlayerName)} (${currentPlayer})`;
        if (gameStatusDisplay) {
            gameStatusDisplay.textContent = `Sıra: ${escapeHtml(turnPlayerName)}`;
            gameStatusDisplay.className = 'game-status';
        }
        updatePlayerInfo();
    };

    // --- DÜZƏLİŞ EDİLMİŞ funksiya ---
    function updateHeaderButtonsVisibility() {
        // Başlıqdakı düymələrin görünüşünü idarə edir
        // console.log(`[updateHeaderButtonsVisibility] Çağırıldı. isAI=${isPlayingAgainstAI}, isCreator=${isCurrentUserCreator}, isOpponent=${isOpponentPresent}`);
        
        // Otaq Ayarları (yalnız yaradan, AI olmayan oyunda)
        const showEdit = !isPlayingAgainstAI && isCurrentUserCreator;
        // Rəqibi Çıxart (yalnız yaradan, real rəqib varsa, AI olmayan oyunda)
        const showKick = !isPlayingAgainstAI && isCurrentUserCreator && isOpponentPresent; 
        // SNOW'u Çağır (yalnız yaradan, rəqib yoxdursa, AI olmayan oyunda)
        const showCallSnow = isCurrentUserCreator && !isOpponentPresent && !isPlayingAgainstAI; 
        // SNOW'u Çıxart (yalnız yaradan, AI ilə oynayarkən)
        const showRemoveSnow = isCurrentUserCreator && isPlayingAgainstAI; 

        if (editRoomBtn) editRoomBtn.style.display = showEdit ? 'inline-flex' : 'none'; else console.warn("editRoomBtn yoxdur");
        if (kickOpponentBtn) kickOpponentBtn.style.display = showKick ? 'inline-flex' : 'none'; else console.warn("kickOpponentBtn yoxdur");
        if (callSnowBtn) callSnowBtn.style.display = showCallSnow ? 'inline-flex' : 'none'; else console.warn("callSnowBtn yoxdur");
        if (removeSnowBtn) removeSnowBtn.style.display = showRemoveSnow ? 'inline-flex' : 'none'; else console.warn("removeSnowBtn yoxdur"); // removeSnowBtn referansı yuxarıda alınmalıdır
        
        // Düymələri deaktiv etmək (əgər görünmürlərsə)
        if (callSnowBtn) callSnowBtn.disabled = !showCallSnow;
        if (removeSnowBtn) removeSnowBtn.disabled = !showRemoveSnow;
        
        // console.log(`[updateHeaderButtonsVisibility] Düymə görünüşləri: Edit=${showEdit}, Kick=${showKick}, CallSnow=${showCallSnow}, RemoveSnow=${showRemoveSnow}`);
    };

// --- Hissə 2/5 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Hissə 3/5 - Zər Funksiyaları

    // ----- Zər Funksiyaları -----
    function initDice() {
        if (!diceCubeElement) return;
        diceCubeElement.style.transition = 'none';
        currentDiceRotateX = 0; currentDiceRotateY = 0; currentDiceRotateZ = 0;
        setDiceTransform();
        diceCubeElement.style.cursor = isOpponentPresent ? 'grab' : 'not-allowed';
    }

    function setupDiceModalForRollOff() {
        if (isDiceRolling) return;
        console.log("[setupDiceModalForRollOff] Zər modalı mübarizə üçün ayarlanır.");
        if (diceInstructions) {
            const instructionText = isOpponentPresent ? 'Başlayanı təyin etmək üçün zərə klikləyin və ya sürükləyin.' : 'Rəqib gözlənilir...';
            diceInstructions.textContent = instructionText;
            diceInstructions.classList.toggle('opponent-joined', isOpponentPresent);
            diceInstructions.classList.toggle('waiting', !isOpponentPresent);
        }
        if (yourRollResultDisplay) yourRollResultDisplay.textContent = '?';
        if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = '?';
        if (yourRollBox) yourRollBox.className = 'result-box';
        if (opponentRollBox) opponentRollBox.className = 'result-box';
        player1Roll = null; player2Roll = null; diceWinner = null;
        if(diceCubeElement) diceCubeElement.style.cursor = isOpponentPresent ? 'grab' : 'not-allowed';
        initDice();
    }

    function rollDice() {
        if (isDiceRolling || !isOpponentPresent || !diceCubeElement) return;
        isDiceRolling = true;
        console.log("[rollDice] Zər atılır...");
        diceCubeElement.style.cursor = 'default';
        if(yourRollBox) yourRollBox.className = 'result-box';
        if(opponentRollBox) opponentRollBox.className = 'result-box';
        if(yourRollResultDisplay) yourRollResultDisplay.textContent = '?';
        if(diceInstructions) diceInstructions.textContent = 'Zər atılır...';

        const myRoll = Math.floor(Math.random() * 6) + 1;
        console.log(`[rollDice] Sizin atışınız: ${myRoll}`);
        player1Roll = myRoll;

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

        if (!isPlayingAgainstAI && socket && socket.connected) {
             console.log(`[rollDice] Nəticə (${myRoll}) serverə göndərilir ('dice_roll_result')...`);
             socket.emit('dice_roll_result', { roll: myRoll });
        }

        setTimeout(() => {
            console.log("[rollDice] Animasiya bitdi.");
            isDiceRolling = false;
            diceCubeElement.style.transition = 'none';
            currentDiceRotateX = finalFace.x; currentDiceRotateY = finalFace.y; currentDiceRotateZ = 0;
            setDiceTransform();

            if(yourRollResultDisplay) yourRollResultDisplay.textContent = myRoll;

            if (isPlayingAgainstAI) {
                const opponentRollValue = Math.floor(Math.random() * 6) + 1;
                 console.log(`[rollDice] AI atışı (simulyasiya): ${opponentRollValue}`);
                player2Roll = opponentRollValue;
                if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = opponentRollValue;
                handleRollOffResults(myRoll, opponentRollValue);
            } else {
                 if (player2Roll !== null) {
                      console.log("[rollDice] Rəqibin nəticəsi artıq gəlib, handleRollOffResults çağırılır.");
                      handleRollOffResults(myRoll, player2Roll);
                 } else {
                     if(diceInstructions) diceInstructions.textContent = 'Rəqibin zər atması gözlənilir...';
                 }
            }
        }, parseFloat(rollDurationValue.replace('s', '')) * 1000 + 100);
    }

    function handleRollOffResults(myRoll, opponentRoll) {
        console.log(`[handleRollOffResults] Nəticələr: Siz=${myRoll}, Rəqib=${opponentRoll}`);
        if(yourRollResultDisplay && yourRollResultDisplay.textContent === '?') yourRollResultDisplay.textContent = myRoll;
        if(opponentRollResultDisplay && opponentRollResultDisplay.textContent === '?') opponentRollResultDisplay.textContent = opponentRoll;

        if (myRoll > opponentRoll) {
            diceWinner = currentPlayerName;
            if(diceInstructions) diceInstructions.textContent = 'Siz yüksək atdınız! Simvol seçin.';
            if(yourRollBox) yourRollBox.classList.add('winner');
            if(opponentRollBox) opponentRollBox.classList.remove('winner', 'tie');
            triggerDiceScatterAndSymbolSelect();
        } else if (opponentRoll > myRoll) {
            diceWinner = opponentPlayerName;
            if(diceInstructions) diceInstructions.textContent = `${escapeHtml(opponentPlayerName)} yüksək atdı! ${isPlayingAgainstAI ? 'Simvol avtomatik seçiləcək.' : 'Simvol seçimi gözlənilir.'}`;
            if(opponentRollBox) opponentRollBox.classList.add('winner');
            if(yourRollBox) yourRollBox.classList.remove('winner', 'tie');
            triggerDiceScatterAndSymbolSelect();
        } else { // Bərabərlik
            diceWinner = null; player1Roll = null; player2Roll = null;
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
            initDice();
            isDiceRolling = false;
            initSymbolSelection();
        }, 600);
    }

    function setDiceTransform(rotX = currentDiceRotateX, rotY = currentDiceRotateY, rotZ = currentDiceRotateZ) {
        if (!diceCubeElement) return;
        const transformString = `translateZ(${initialCenterZ}px) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;
        diceCubeElement.style.transform = transformString;
    }

    // Zər Sürükləmə/Klikləmə Hadisələri
    function handleDiceClickOrDragEnd() {
        if (isDiceRolling || !isOpponentPresent) { if (!isDiceRolling && isOpponentPresent && diceCubeElement) diceCubeElement.style.cursor = 'grab'; isDragging = false; return; }
        if (isDragging) { isDragging = false; if (isOpponentPresent && diceCubeElement) diceCubeElement.style.cursor = 'grab'; return; }
        if (diceWinner === null) { rollDice(); }
    }
    function handleMouseDown(event) { if (isDiceRolling || !isOpponentPresent || !diceCubeElement) return; diceCubeElement.style.transition = 'none'; isDragging = false; dragStartX = event.clientX; dragStartY = event.clientY; previousMouseX = event.clientX; previousMouseY = event.clientY; window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); };
    function handleMouseMove(event) { if (isDiceRolling || !isDragging || !diceCubeElement) return; const deltaX = event.clientX - previousMouseX; const deltaY = event.clientY - previousMouseY; currentDiceRotateY += deltaX * rotateSensitivity; currentDiceRotateX -= deltaY * rotateSensitivity; setDiceTransform(currentDiceRotateX, currentDiceRotateY, currentDiceRotateZ); previousMouseX = event.clientX; previousMouseY = event.clientY; };
    function handleMouseUp(event) { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); handleDiceClickOrDragEnd(); };
    function handleTouchStart(e) { if (isDiceRolling || !isOpponentPresent || !diceCubeElement) return; diceCubeElement.style.transition = 'none'; isDragging = false; const touch = e.touches[0]; dragStartX = touch.clientX; dragStartY = touch.clientY; previousMouseX = touch.clientX; previousMouseY = touch.clientY; diceCubeElement.addEventListener('touchmove', handleTouchMove, { passive: false }); diceCubeElement.addEventListener('touchend', handleTouchEnd); diceCubeElement.addEventListener('touchcancel', handleTouchEnd); };
    function handleTouchMove(e) { if (isDiceRolling || !diceCubeElement) return; e.preventDefault(); const touch = e.touches[0]; const deltaX = touch.clientX - previousMouseX; const deltaY = touch.clientY - previousMouseY; if (!isDragging) { if (Math.abs(touch.clientX-dragStartX)>dragThreshold || Math.abs(touch.clientY-dragStartY)>dragThreshold) { isDragging = true; } } if (isDragging) { currentDiceRotateY += deltaX*rotateSensitivity; currentDiceRotateX -= deltaY*rotateSensitivity; setDiceTransform(currentDiceRotateX, currentDiceRotateY, currentDiceRotateZ); } previousMouseX = touch.clientX; previousMouseY = touch.clientY; };
    function handleTouchEnd(e) { if(!diceCubeElement) return; diceCubeElement.removeEventListener('touchmove', handleTouchMove); diceCubeElement.removeEventListener('touchend', handleTouchEnd); diceCubeElement.removeEventListener('touchcancel', handleTouchEnd); handleDiceClickOrDragEnd(); };

// --- Hissə 3/5 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Hissə 4/5 - Simvol Seçimi, Oyun Başlama, Oyun Axışı, AI Məntiqi

    // ----- Simvol Seçim Funksiyaları -----
    function initSymbolSelection() {
        console.log("[initSymbolSelection] Başladı.");
        if (!symbolSelectModal || !symbolOptionsDiv || !symbolWaitingMessage || !symbolSelectTitle || !symbolSelectMessage) {
            console.error("Simvol seçim modalı elementləri tapılmadı!");
            startGameProcedure('X'); return;
        }
        symbolWaitingMessage.style.display = 'none';
        symbolOptionsDiv.style.display = 'flex';

        if (diceWinner === currentPlayerName) {
            symbolSelectTitle.textContent = "Simvol Seçin";
            symbolSelectMessage.textContent = "Oyuna başlamaq üçün simvolunuzu seçin:";
            symbolOptionsDiv.querySelectorAll('.symbol-button').forEach(button => {
                 const newButton = button.cloneNode(true);
                 button.parentNode.replaceChild(newButton, button);
                 newButton.addEventListener('click', handleSymbolChoice);
            });
        } else { // Rəqib/AI zəri udubsa
            symbolSelectTitle.textContent = "Simvol Seçilir";
            symbolSelectMessage.textContent = `Oyuna "${escapeHtml(opponentPlayerName)}" başlayır. ${isPlayingAgainstAI ? 'Simvol avtomatik seçiləcək.' : 'Rəqib simvol seçir...'}`;
            symbolOptionsDiv.style.display = 'none';
            symbolWaitingMessage.style.display = 'block';
            if (isPlayingAgainstAI) {
                 simulateOpponentSymbolChoice(500 + Math.random() * 500);
            } else {
                console.log("[initSymbolSelection] Rəqibin simvol seçimi gözlənilir...");
            }
        }
        showModal(symbolSelectModal);
    }

    function handleSymbolChoice(event) {
        const chosenSymbol = event.target.dataset.symbol;
        if (!chosenSymbol) return;
        console.log(`[handleSymbolChoice] ${currentPlayerName} "${chosenSymbol}" seçdi.`);
        if (!isPlayingAgainstAI && socket && socket.connected) {
            console.log(`[handleSymbolChoice] Simvol seçimi (${chosenSymbol}) serverə göndərilir ('symbol_choice')...`);
            socket.emit('symbol_choice', { symbol: chosenSymbol });
        }
        startGameProcedure(chosenSymbol);
    }

    function simulateOpponentSymbolChoice(delay) {
        const opponentChoice = (Math.random() > 0.5) ? 'X' : 'O';
        console.log(`[simulateOpponentSymbolChoice] Rəqib/AI "${opponentChoice}" seçdi (simulyasiya).`);
        setTimeout(() => {
             if (symbolSelectModal && symbolSelectModal.style.display === 'block') {
                 startGameProcedure(opponentChoice);
             } else { console.warn("[simulateOpponentSymbolChoice] Simvol seçim modalı artıq bağlı idi."); }
        }, delay);
    }

    // ----- Oyunu Başlatma -----
    function startGameProcedure(startingSymbol) {
        console.log(`[startGameProcedure] Oyun "${startingSymbol}" ilə başlayır. Zər qalibi: ${diceWinner}`);
        hideModal(symbolSelectModal);

        if (diceWinner === currentPlayerName) {
            player1Symbol = startingSymbol; player2Symbol = (startingSymbol === 'X') ? 'O' : 'X'; currentPlayer = player1Symbol;
        } else {
            player2Symbol = startingSymbol; player1Symbol = (startingSymbol === 'X') ? 'O' : 'X'; currentPlayer = player2Symbol;
        }
        aiPlayerSymbol = isPlayingAgainstAI ? player2Symbol : '';

        console.log(`[startGameProcedure] Simvollar: P1(${currentPlayerName})=${player1Symbol}, P2(${opponentPlayerName})=${player2Symbol}. Başlayan: ${currentPlayer}`);
        if (isPlayingAgainstAI) console.log(`[startGameProcedure] AI Simvolu: ${aiPlayerSymbol}`);

        isGameOver = false;
        if (restartGameBtn) restartGameBtn.disabled = false;
        updatePlayerInfo(); updateTurnIndicator();
        if (gameStatusDisplay) { gameStatusDisplay.textContent = `Sıra: ${currentPlayer === player1Symbol ? currentPlayerName : opponentPlayerName}`; gameStatusDisplay.className = 'game-status'; }
        if (boardElement) boardElement.style.opacity = '1';

        console.log("[startGameProcedure] Hüceyrə listenerları əlavə edilir...");
        cells.forEach((cell, index) => {
            if (!cell) return;
            const newCell = cell.cloneNode(true);
            cell.parentNode?.replaceChild(newCell, cell);
            cells[index] = newCell;
            if (board[index] === '') {
                 cells[index].style.cursor = 'pointer';
                 cells[index].addEventListener('click', handleCellClick);
            } else { cells[index].style.cursor = 'not-allowed'; }
        });
        console.log("[startGameProcedure] Hüceyrə listenerları əlavə edildi.");

        if (!isGameOver) {
             const isMyTurn = currentPlayer === player1Symbol;
             if(boardElement) boardElement.style.pointerEvents = !isMyTurn ? 'none' : 'auto';
             if (isPlayingAgainstAI && currentPlayer === aiPlayerSymbol) {
                 console.log("[startGameProcedure] AI başlayır, makeAIMove çağırılır.");
                 makeAIMove();
             } else { console.log(`[startGameProcedure] ${isMyTurn ? 'İnsan' : 'Rəqib'} başlayır. Lövhə aktivliyi: ${boardElement?.style.pointerEvents}`); }
        } else { if(boardElement) boardElement.style.pointerEvents = 'none'; }
        console.log("[startGameProcedure] Bitdi.");
    }

    // ----- Oyun Axışı -----
    function handleCellClick(event) {
        const clickedCell = event.target;
        const index = parseInt(clickedCell.dataset.index);
        const myTurn = currentPlayer === player1Symbol;
        if (isGameOver || isDiceRolling || !myTurn || board[index] !== '') return;

        console.log(`[handleCellClick] İnsan ${index} xanasına ${player1Symbol} qoyur.`);
        const moveMadeSuccessfully = placeMark(index, player1Symbol);

        if (moveMadeSuccessfully && !isGameOver) {
            if (isPlayingAgainstAI) {
                console.log("[handleCellClick] AI Oyunu: Sıra AI-ya keçirilir.");
                switchPlayer(); updateTurnIndicator();
                if(boardElement) boardElement.style.pointerEvents = 'none';
                makeAIMove();
            } else { // Multiplayer
                console.log(`[handleCellClick] Multiplayer: Hərəkət (${index}, ${player1Symbol}) serverə göndərilir ('make_move')...`);
                if (socket && socket.connected) {
                     socket.emit('make_move', { index: index, mark: player1Symbol });
                     if(boardElement) boardElement.style.pointerEvents = 'none';
                     switchPlayer(); updateTurnIndicator();
                     if (gameStatusDisplay) gameStatusDisplay.textContent = `Sıra: ${opponentPlayerName}`;
                } else {
                     console.error("[handleCellClick] Socket bağlantısı yoxdur!");
                     // Hərəkəti geri almaq (sadə)
                     board[index] = ''; clickedCell.textContent = ''; clickedCell.classList.remove(player1Symbol); clickedCell.style.cursor = 'pointer';
                     alert("Serverlə bağlantı yoxdur. Hərəkət edilə bilmədi.");
                }
            }
        } else if (moveMadeSuccessfully && isGameOver) {
             console.log("[handleCellClick] Oyun insanın hərəkəti ilə bitdi.");
             if(boardElement) boardElement.style.pointerEvents = 'none';
        }
    }

    function placeMark(index, mark) {
        if (index < 0 || index >= board.length || board[index] !== '' || isGameOver) {
             console.warn(`placeMark: Keçərsiz hərəkət cəhdi. Index=${index}, BoardVal=${board[index]}, GameOver=${isGameOver}`);
             return false;
        }
        board[index] = mark;
        const cellElement = cells[index];
        if (!cellElement) { console.error(`placeMark: Hata! cells[${index}] tapılmadı!`); return false; }

        cellElement.textContent = mark; cellElement.classList.add(mark); cellElement.style.cursor = 'not-allowed';
        const newCell = cellElement.cloneNode(true);
        cellElement.parentNode?.replaceChild(newCell, cellElement);
        cells[index] = newCell;

        const win = checkWin(mark);
        const draw = !win && !board.includes('');

        if (win) { console.log(`placeMark: ${mark} qazandı.`); endGame(false, mark); highlightWinningCells(); return true; }
        else if (draw) { console.log("placeMark: Bərabərlik."); endGame(true, null); return true; }
        else { return true; }
    }

    function switchPlayer() {
        if(isGameOver) return;
        currentPlayer = (currentPlayer === player1Symbol) ? player2Symbol : player1Symbol;
    }

    // ----- AI Məntiqi -----
    function makeAIMove() {
        if (isGameOver || currentPlayer !== aiPlayerSymbol) {
            if (!isGameOver && boardElement) boardElement.style.pointerEvents = 'auto'; return;
        }
        console.log("[makeAIMove] AI (SNOW) düşünür...");
        if (gameStatusDisplay) gameStatusDisplay.textContent = "SNOW oynayır...";
        if (boardElement) boardElement.style.pointerEvents = 'none'; // AI düşünərkən blokla

        setTimeout(() => {
            let bestMove = -1;
            try { bestMove = findBestMove(); } catch (aiError) {
                 console.error("[makeAIMove] findBestMove xətası:", aiError);
                 let availableCells = board.map((val, idx) => val === '' ? idx : -1).filter(idx => idx !== -1);
                 if (availableCells.length > 0) bestMove = availableCells[Math.floor(Math.random() * availableCells.length)];
                 console.error("[makeAIMove] Xəta səbəbiylə təsadüfi hərəkət:", bestMove);
            }

            if (bestMove !== -1 && board[bestMove] === '') {
                const moveMadeSuccessfully = placeMark(bestMove, aiPlayerSymbol);
                if (moveMadeSuccessfully && !isGameOver) {
                    console.log("[makeAIMove] AI hərəkət etdi, sıra insana keçir.");
                    switchPlayer(); if (boardElement) boardElement.style.pointerEvents = 'auto'; updateTurnIndicator();
                } else if (moveMadeSuccessfully && isGameOver) {
                     console.log("[makeAIMove] AI hərəkət etdi və oyun bitdi."); if (boardElement) boardElement.style.pointerEvents = 'none'; updateTurnIndicator();
                } else { console.error(`[makeAIMove] placeMark uğursuz oldu! Move: ${bestMove}`); if (boardElement) boardElement.style.pointerEvents = 'auto'; updateTurnIndicator(); }
            } else { // Etibarlı hərəkət tapılmadı
                console.warn(`[makeAIMove] Etibarlı hərəkət tapılmadı (${bestMove})! Lövhə:`, [...board]);
                 if (boardElement) boardElement.style.pointerEvents = 'auto';
                 if(!checkWin(player1Symbol) && !board.includes('')) { console.log("[makeAIMove] Bərabərlik (hərəkət yoxdur)."); if (!isGameOver) endGame(true, null); updateTurnIndicator(); }
                 else { console.warn("[makeAIMove] Hərəkət yoxdur amma oyun bitməyib/bərabərlik deyil?"); updateTurnIndicator(); }
            }
        }, 500 + Math.random() * 300);
    }

    function findBestMove() {
        const humanPlayerSymbol = (aiPlayerSymbol === player1Symbol) ? player2Symbol : player1Symbol;
        // 1. Qazanma Hərəkəti
        for (let i = 0; i < board.length; i++) { if (board[i] === '') { board[i] = aiPlayerSymbol; if (checkWin(aiPlayerSymbol)) { board[i] = ''; return i; } board[i] = ''; } }
        // 2. Bloklama Hərəkəti
        for (let i = 0; i < board.length; i++) { if (board[i] === '') { board[i] = humanPlayerSymbol; if (checkWin(humanPlayerSymbol)) { board[i] = ''; return i; } board[i] = ''; } }
        // 3. Sadə Strategiyalar (Böyük lövhələr)
        if (boardSize >= 5) {
             const centerCells = getCenterCells(boardSize); const availableCenter = centerCells.filter(index => board[index] === '');
             if (availableCenter.length > 0) { return availableCenter[Math.floor(Math.random() * availableCenter.length)]; }
        }
        // 4. Minimax (Kiçik lövhələr)
        else if (boardSize <= 4) {
            let move = -1; let score = -Infinity; let currentMaxDepth = (boardSize === 4) ? 4 : 7;
            const availableMoves = board.map((val, idx) => val === '' ? idx : -1).filter(idx => idx !== -1);
            if (availableMoves.length === board.length) { const corners = [0, boardSize-1, (boardSize-1)*boardSize, boardSize*boardSize-1]; const center = getCenterCells(boardSize); const firstMoves = [...center, ...corners]; return firstMoves[Math.floor(Math.random() * firstMoves.length)]; }
            for (const i of availableMoves) {
                board[i] = aiPlayerSymbol; let currentScore = minimax(board, 0, false, humanPlayerSymbol, aiPlayerSymbol, currentMaxDepth); board[i] = '';
                if (currentScore > score) { score = currentScore; move = i; }
            }
            if (move !== -1) { return move; }
        }
        // 5. Təsadüfi Hərəkət
        let availableCells = board.map((val, idx) => val === '' ? idx : -1).filter(idx => idx !== -1);
        if (availableCells.length > 0) { return availableCells[Math.floor(Math.random() * availableCells.length)]; }
        console.error("[findBestMove] Heç bir hərəkət tapılmadı!"); return -1;
    }

    function getCenterCells(size) { /* ... (əvvəlki kimi) ... */ const centerIndices = []; const isOdd = size % 2 !== 0; if (isOdd) { const center = Math.floor(size / 2); centerIndices.push(center * size + center); } else { const c1 = size / 2 - 1; const c2 = size / 2; centerIndices.push(c1 * size + c1); centerIndices.push(c1 * size + c2); centerIndices.push(c2 * size + c1); centerIndices.push(c2 * size + c2); } return centerIndices; };
    function minimax(currentBoard, depth, isMaximizing, humanSymbol, aiSymbol, maxDepth) { /* ... (əvvəlki kimi) ... */ let winner = checkWinnerForMinimax(currentBoard, humanSymbol, aiSymbol); if (winner === aiSymbol) return 10 - depth; if (winner === humanSymbol) return depth - 10; if (!currentBoard.includes('')) return 0; if (depth >= maxDepth) return 0; if (isMaximizing) { let bestScore = -Infinity; for (let i = 0; i < currentBoard.length; i++) { if (currentBoard[i] === '') { currentBoard[i] = aiSymbol; bestScore = Math.max(bestScore, minimax(currentBoard, depth + 1, false, humanSymbol, aiSymbol, maxDepth)); currentBoard[i] = ''; } } return bestScore; } else { let bestScore = Infinity; for (let i = 0; i < currentBoard.length; i++) { if (currentBoard[i] === '') { currentBoard[i] = humanSymbol; bestScore = Math.min(bestScore, minimax(currentBoard, depth + 1, true, humanSymbol, aiSymbol, maxDepth)); currentBoard[i] = ''; } } return bestScore; } };
    function checkWinnerForMinimax(currentBoard, humanSymbol, aiSymbol) { /* ... (əvvəlki kimi) ... */ const winConditions = generateWinConditions(boardSize); for (const condition of winConditions) { const firstSymbol = currentBoard[condition[0]]; if (firstSymbol !== '' && condition.every(index => currentBoard[index] === firstSymbol)) { return firstSymbol; } } return null; };

// --- Hissə 4/5 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Hissə 5/5 - Oyun Sonu, Effektlər, Otaq Əməliyyatları, Socket, Başlatma

    // ----- Qazanma/Bərabərlik Yoxlaması -----
    function checkWin(playerSymbolToCheck) {
        winningCombination = [];
        const winConditions = generateWinConditions(boardSize);
        for (let i = 0; i < winConditions.length; i++) {
            const condition = winConditions[i];
            const firstSymbol = board[condition[0]];
            if (firstSymbol !== playerSymbolToCheck || firstSymbol === '') continue;
            let allSame = true;
            for (let j = 1; j < condition.length; j++) {
                if (board[condition[j]] !== firstSymbol) { allSame = false; break; }
            }
            if (allSame) { winningCombination = condition; return true; }
        }
        return false;
    };

    function generateWinConditions(size) {
        const conditions = []; const winLength = (size === 3 || size === 4) ? 3 : 4;
        for (let r = 0; r < size; r++) { for (let c = 0; c < size; c++) {
            if (c <= size - winLength) { const rowC = []; for (let k=0; k<winLength; k++) rowC.push(r*size+(c+k)); conditions.push(rowC); }
            if (r <= size - winLength) { const colC = []; for (let k=0; k<winLength; k++) colC.push((r+k)*size+c); conditions.push(colC); }
            if (r <= size - winLength && c <= size - winLength) { const dia1C = []; for(let k=0; k<winLength; k++) dia1C.push((r+k)*size+(c+k)); conditions.push(dia1C); }
            if (r <= size - winLength && c >= winLength - 1) { const dia2C = []; for(let k=0; k<winLength; k++) dia2C.push((r+k)*size+(c-k)); conditions.push(dia2C); }
        } }
        const uniqueConditions = conditions.map(cond => JSON.stringify(cond.sort((a,b)=>a-b)));
        return [...new Set(uniqueConditions)].map(str => JSON.parse(str));
    };

    function checkDraw() { return !board.includes(''); };
    function highlightWinningCells() { winningCombination.forEach(index => { if(cells[index]) cells[index].classList.add('winning'); }); };


    // ----- Oyun Sonu -----
    function endGame(isDraw, winnerMark) {
        console.log(`[endGame] Oyun bitdi. Bərabərlik: ${isDraw}, Qazanan İşarə: ${winnerMark}`);
        isGameOver = true; if(boardElement) boardElement.style.pointerEvents = 'none';
        if (restartGameBtn) restartGameBtn.disabled = false;
        const winnerName = winnerMark === player1Symbol ? currentPlayerName : (winnerMark ? opponentPlayerName : null);
        if (isDraw) { if (gameStatusDisplay) { gameStatusDisplay.textContent = "Oyun Bərabərə!"; gameStatusDisplay.classList.add('draw'); } if (turnIndicator) turnIndicator.textContent = "Bərabərə"; }
        else if (winnerMark && winnerName) { if (gameStatusDisplay) { gameStatusDisplay.textContent = `${escapeHtml(winnerName)} Qazandı!`; gameStatusDisplay.classList.add('win'); } if (turnIndicator) turnIndicator.textContent = "Bitdi"; triggerShatterEffect(winnerMark); }
        else { if (gameStatusDisplay) gameStatusDisplay.textContent = "Oyun Bitdi"; if (turnIndicator) turnIndicator.textContent = "Bitdi"; }
        playerXInfo?.classList.remove('active-player'); playerOInfo?.classList.remove('active-player');
    }

    // ----- Effektlər -----
    function triggerShatterEffect(winnerMark) {
         if (!fireworksOverlay || !shatteringTextContainer || !winnerMark) return;
         clearShatteringText();
         const text = winnerMark === player1Symbol ? "Siz Qazandınız!" : `${escapeHtml(opponentPlayerName)} Qazandı!`;
         const chars = text.split('');
         chars.forEach((char, index) => { const span = document.createElement('span'); span.textContent = char === ' ' ? '\u00A0' : char; span.classList.add('shatter-char'); span.style.setProperty('--char-index', index); shatteringTextContainer.appendChild(span); });
         fireworksOverlay.classList.add('visible'); shatteringTextContainer.style.opacity = '1';
         setTimeout(() => {
             const spans = shatteringTextContainer.querySelectorAll('.shatter-char');
             let duration = 3000, distance = 170;
             try { duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-duration').replace('s',''))*1000||3000; distance = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-distance').replace('px',''))||170; } catch(e){}
             spans.forEach((span, i) => { const angle = Math.random()*360; const randDist = Math.random()*distance; const tx = Math.cos(angle*Math.PI/180)*randDist; const ty = Math.sin(angle*Math.PI/180)*randDist; const tz = (Math.random()-0.5)*distance*0.5; const rot = (Math.random()-0.5)*720; const delay = Math.random()*0.1; span.style.setProperty('--tx',`${tx}px`); span.style.setProperty('--ty',`${ty}px`); span.style.setProperty('--tz',`${tz}px`); span.style.setProperty('--rot',`${rot}deg`); span.style.animationDelay=`${delay}s`; span.classList.add('animate'); });
             setTimeout(hideFireworks, duration + 500);
         }, 100);
     }
    function hideFireworks() { if (fireworksOverlay) fireworksOverlay.classList.remove('visible'); if (shatteringTextContainer) shatteringTextContainer.style.opacity = '0'; setTimeout(clearShatteringText, 500); }
    function clearShatteringText() { if (shatteringTextContainer) shatteringTextContainer.innerHTML = ''; }


    // ----- Otaq Əməliyyatları -----
    function openEditModal() {
        if(isPlayingAgainstAI) { alert("AI oyununda otaq ayarları dəyişdirilə bilməz."); return; }
        if(!isCurrentUserCreator) { alert("Yalnız otağı yaradan parametrləri dəyişə bilər."); return; }
        console.warn("Otaq ayarları funksionallığı hələ tam deyil.");
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
        console.warn("Otaq ayarlarını yadda saxlama funksionallığı hələ tam deyil.");
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
        if (currentRoomData.boardSize !== newBoardSize) { needsRestart = true; currentRoomData.boardSize = newBoardSize; boardSize = newBoardSize; adjustStylesForBoardSize(boardSize); createBoard(); /* Yeni ölçü üçün lövhəni yenidən yarat! */ }
        currentRoomData.name = newName; currentRoomData.hasPassword = finalHasPassword;
        if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(newName)}`;
        // TODO: Serverə 'update_room_settings' emit et
        showMsg(msgElement, 'Dəyişikliklər yadda saxlandı (Lokal).', 'success', 2500);
        hideModal(editRoomModal);
        if (needsRestart) {
             console.log("Ölçü dəyişdiyi üçün oyun yenidən başladılır (performLocalRestart çağırılır)...");
             performLocalRestart(); // Birbaşa bunu çağır
             // TODO: Serverə də ölçü dəyişikliyi və restart tələbi göndərmək lazımdır!
        }
    }
    function deleteRoom() {
        console.warn("Otaq silmə funksionallığı hələ tam deyil.");
        if(isPlayingAgainstAI || !isCurrentUserCreator) return;
        if (confirm(`'${escapeHtml(currentRoomData.name)}' otağını silmək istədiyinizə əminsiniz?`)) {
            const msgElement = editRoomModal?.querySelector('#edit-room-message');
            showMsg(msgElement, 'Otaq silinir...', 'info', 0);
            if (socket && socket.connected) socket.emit('delete_room', { roomId: currentRoomId });
            setTimeout(() => { alert("Otaq silindi. Lobiyə qayıdırsınız."); window.location.href = '../lobby/test_odalar.html'; }, 1500);
        }
    }
    function handleKickOpponent() {
        if (isPlayingAgainstAI || !isCurrentUserCreator || !isOpponentPresent) return;
        if (confirm(`${escapeHtml(opponentPlayerName)}-i otaqdan çıxarmaq istədiyinizə əminsiniz?`)) {
             console.warn("Kick funksionallığı hələ tam deyil.");
             if (socket && socket.connected) socket.emit('kick_opponent', { roomId: currentRoomId });
             // UI dərhal yenilənir, server cavabı gözlənilmir
              opponentPlayerName = 'Rəqib Gözlənilir...'; isOpponentPresent = false; isPlayingAgainstAI = false; aiPlayerSymbol = '';
              if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName; if (playerOSymbolDisplay) playerOSymbolDisplay.textContent = '?'; if (playerOInfo) playerOInfo.className = 'player-info'; playerOInfo?.classList.remove('active-player');
              isGameOver = true; resetGameStateVars(); resetBoardAndStatus();
              if (gameStatusDisplay) gameStatusDisplay.textContent = `Rəqib çıxarıldı. Rəqib gözlənilir...`; if (turnIndicator) turnIndicator.textContent = "Gözlənilir";
              updateHeaderButtonsVisibility(); hideModal(diceRollModal); hideModal(symbolSelectModal);
        }
    }

    // --- SNOW'u Çağırma ---
    function handleCallSnow() {
        console.log("[handleCallSnow] Çağırıldı.");
        if (isOpponentPresent || isPlayingAgainstAI) { console.warn("[handleCallSnow] Artıq rəqib var/AI ilə oynanılır."); return; }
        if (!isCurrentUserCreator) { alert("Yalnız otaq yaradan SNOW-u çağıra bilər."); return; }
        console.log("[handleCallSnow] SNOW oyuna əlavə edilir...");
        isPlayingAgainstAI = true; isOpponentPresent = true; opponentPlayerName = "SNOW"; aiPlayerSymbol = '';
        updatePlayerInfo(); updateHeaderButtonsVisibility();
        if (callSnowBtn) callSnowBtn.disabled = true;

        // Zər atma prosesini başlatmaq üçün (istəyə uyğun olaraq)
        console.log("[handleCallSnow] Zər atma prosesi başladılır...");
        if (gameStatusDisplay) gameStatusDisplay.textContent = "SNOW ilə oyun başlayır. Zər atın!";
        if (turnIndicator) turnIndicator.textContent = 'Zər Atılır...';
        setupDiceModalForRollOff(); showModal(diceRollModal); initDice();

        isGameOver = false; if (restartGameBtn) restartGameBtn.disabled = false;
        console.log("[handleCallSnow] Proses tamamlandı (zər atma gözlənilir).");
    }

    // --- SNOW'u Çıxartma ---
    function handleRemoveSnow() {
        if (!isPlayingAgainstAI || !isCurrentUserCreator) return;
        console.log("SNOW oyundan çıxarılır...");
        isPlayingAgainstAI = false; isOpponentPresent = false; opponentPlayerName = "Rəqib Gözlənilir..."; aiPlayerSymbol = '';
        isGameOver = true;
        resetGameStateVars(); resetBoardAndStatus();
        updatePlayerInfo(); updateHeaderButtonsVisibility();
        if(gameStatusDisplay) gameStatusDisplay.textContent = "SNOW oyundan çıxarıldı. Rəqib gözlənilir...";
        if(turnIndicator) turnIndicator.textContent = "Gözlənilir";
        hideModal(diceRollModal); hideModal(symbolSelectModal);
    }

    // ----- Yeniden Başlatma -----
    function handleRestartGame(accepted = false) {
        if (!isGameOver || (!isOpponentPresent && !isPlayingAgainstAI)) { console.log(`Yenidən başlatmaq üçün şərtlər ödənmir.`); return; }
        console.log(`handleRestartGame çağırıldı. Qəbul edilib: ${accepted}`);
        if (isPlayingAgainstAI) { console.log("AI oyunu yenidən başladılır..."); performLocalRestart(); }
        else { // Multiplayer
             if (accepted) { console.log("Multiplayer oyunu yenidən başladılır..."); performLocalRestart(); }
             else {
                  if (socket && socket.connected) {
                       console.log("Yenidən başlatma təklifi serverə göndərilir ('request_restart')...");
                       socket.emit('request_restart');
                       if(gameStatusDisplay) gameStatusDisplay.textContent = "Yenidən başlatma təklifi göndərildi...";
                       if(restartGameBtn) restartGameBtn.disabled = true;
                       setTimeout(() => { if(restartGameBtn?.disabled && isGameOver) { restartGameBtn.disabled = false; if(gameStatusDisplay?.textContent.includes("gözlənilir")) { gameStatusDisplay.textContent = "Təklifə cavab gəlmədi."; } } }, 15000);
                  } else { alert("Serverlə bağlantı yoxdur."); }
             }
        }
    }
    function performLocalRestart() {
         console.log("performLocalRestart: Oyun vəziyyəti və lövhə sıfırlanır...");
         hideFireworks(); resetGameStateVars(); resetBoardAndStatus();
         if (isOpponentPresent) { // Rəqib (və ya AI) hələ də 'varsa'
              if (gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yenidən başlayır. Zər atılır...";
              setupDiceModalForRollOff(); showModal(diceRollModal); initDice();
         } else { console.warn("performLocalRestart: Rəqib olmadan restart edilir?"); if (gameStatusDisplay) gameStatusDisplay.textContent = "Rəqib gözlənilir..."; hideModal(diceRollModal); hideModal(symbolSelectModal); updateHeaderButtonsVisibility(); }
         if (restartGameBtn) restartGameBtn.disabled = true;
    }


    // ===== SOCKET.IO BAĞLANTISI və OYUN İÇİ HADİSƏLƏR =====
    function setupGameSocketConnection(roomIdToJoin) {
        // ... (Socket bağlantı qurulumu və əsas hadisələr əvvəlki kimi) ...
        if (socket && socket.connected) socket.disconnect();
        if (isPlayingAgainstAI || !roomIdToJoin) { console.log(`[SocketSetup] AI oyunu/RoomID olmadığı üçün socket qurulmur.`); return; }
        console.log(`[SocketSetup] ${roomIdToJoin} otağı üçün bağlantı qurulur...`);
        showLoadingOverlay('Serverə qoşulunur...');
        socket = io({ reconnectionAttempts: 3 });
        socket.on('connect', () => { console.log(`[Socket] Qoşuldu: ${socket.id}, Otaq: ${roomIdToJoin}`); hideLoadingOverlay(); socket.emit('player_ready_in_room', { roomId: roomIdToJoin }); if (gameStatusDisplay && !isOpponentPresent) { gameStatusDisplay.textContent = 'Rəqib gözlənilir...'; } });
        socket.on('disconnect', (reason) => { console.warn('[Socket] Kəsildi:', reason); if (gameStatusDisplay) gameStatusDisplay.textContent = 'Bağlantı kəsildi!'; isGameOver = true; isOpponentPresent = false; opponentPlayerName = 'Rəqib (Offline)'; updatePlayerInfo(); if(boardElement){ boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';} });
        socket.on('connect_error', (error) => { console.error('[Socket] Qoşulma xətası:', error.message); if (gameStatusDisplay) gameStatusDisplay.textContent = 'Qoşulma xətası!'; isGameOver = true; if(boardElement){ boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';} alert(`Serverə qoşulmaq mümkün olmadı: ${error.message}`); });
        socket.on('room_deleted_kick', (data) => { console.warn('Otaq silindi:', data?.message); alert(data?.message || 'Otaq silindi.'); window.location.href = '../lobby/test_odalar.html'; });
        socket.on('force_redirect_lobby', (data) => { console.warn('Lobiya yönləndirmə:', data?.message); alert(data?.message || 'Otaq mövcud deyil.'); window.location.href = '../lobby/test_odalar.html'; });
        setupGameEventListeners(socket); // Oyun hadisə dinləyicilərini quraşdır
    }

    function setupGameEventListeners(socketInstance) {
        // ... (Socket oyun hadisə dinləyiciləri əvvəlki kimi) ...
        console.log("[SocketListeners] Oyun hadisə dinləyiciləri quraşdırılır...");
        socketInstance.on('opponent_joined', (data) => {
             console.log(`[Socket Event] >>> opponent_joined ALINDI:`, data);
             try {
                  if (isPlayingAgainstAI) { console.log("[opponent_joined] AI oyununda ignor edilir."); /* TODO: AI vs Real */ return; }
                  opponentPlayerName = data?.username || 'Rəqib (?)'; isOpponentPresent = true;
                  console.log(`[opponent_joined] Rəqib təyin edildi: ${opponentPlayerName}`);
                  if (playerONameDisplay) playerONameDisplay.textContent = escapeHtml(opponentPlayerName);
                  if (gameStatusDisplay) gameStatusDisplay.textContent = `${opponentPlayerName} qoşuldu. Zər atılır...`;
                  setupDiceModalForRollOff(); showModal(diceRollModal); initDice();
                  updatePlayerInfo(); updateHeaderButtonsVisibility();
             } catch (error) { console.error("<<<<< opponent_joined içində KRİTİK XƏTA! >>>>>", error); if (gameStatusDisplay) gameStatusDisplay.textContent = "Rəqib qoşularkən xəta!"; }
        });
        socketInstance.on('opponent_left_game', (data) => { console.log(`[Socket Event] opponent_left_game alındı:`, data); if (isPlayingAgainstAI) return; const opponentWhoLeft = data?.username || 'Rəqib'; if (gameStatusDisplay) gameStatusDisplay.textContent = `${opponentWhoLeft} ayrıldı.`; if (turnIndicator) turnIndicator.textContent = "Gözlənilir"; isGameOver = true; isOpponentPresent = false; opponentPlayerName = 'Rəqib Gözlənilir...'; resetGameStateVars(); resetBoardAndStatus(); hideModal(diceRollModal); hideModal(symbolSelectModal); if (restartGameBtn) restartGameBtn.disabled = true; updateHeaderButtonsVisibility(); });
        socketInstance.on('opponent_dice_result', (data) => { if (isPlayingAgainstAI || !data || typeof data.roll !== 'number') return; const processResult = () => { player2Roll = data.roll; if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = player2Roll; if (player1Roll !== null) { handleRollOffResults(player1Roll, player2Roll); } }; if (isDiceRolling) { setTimeout(processResult, 500); } else { processResult(); } });
        socketInstance.on('opponent_symbol_chosen', (data) => { if (isPlayingAgainstAI || !data || (data.symbol !== 'X' && data.symbol !== 'O')) return; if (symbolSelectModal?.style.display === 'block') { startGameProcedure(data.symbol); } else { console.warn("opponent_symbol_chosen alındı, amma modal bağlı idi?"); } });
        socketInstance.on('opponent_moved', (data) => { if (isPlayingAgainstAI || !data || typeof data.index !== 'number' || !data.mark || isGameOver) return; const moveMade = placeMark(data.index, data.mark); if (moveMade && !isGameOver) { switchPlayer(); updateTurnIndicator(); if(boardElement) boardElement.style.pointerEvents = 'auto'; if (gameStatusDisplay) gameStatusDisplay.textContent = `Sıra: ${currentPlayerName}`; } else if (moveMade && isGameOver) { if(boardElement) boardElement.style.pointerEvents = 'none'; updateTurnIndicator(); } });
        socketInstance.on('restart_requested', (data) => { if (isGameOver && isOpponentPresent && !isPlayingAgainstAI) { const requester = data?.username || 'Rəqib'; if (confirm(`${requester} yenidən başlatmağı təklif edir. Qəbul edirsiniz?`)) { console.log("Təklif qəbul edildi."); socketInstance.emit('accept_restart'); handleRestartGame(true); } else { console.log("Təklif rədd edildi."); } } else { console.warn("restart_requested alındı, amma şərtlər ödənmir."); } });
        socketInstance.on('restart_accepted', (data) => { if (isGameOver && isOpponentPresent && !isPlayingAgainstAI) { const accepter = data?.username || 'Rəqib'; if (gameStatusDisplay) gameStatusDisplay.textContent = `${accepter} qəbul etdi. Zər atılır...`; handleRestartGame(true); } else { console.warn("restart_accepted alındı, amma şərtlər ödənmir."); } });
        socketInstance.on('room_info', (roomInfo) => { console.log("[Socket Event] room_info alındı:", roomInfo); if(!roomInfo) { console.warn("Boş room_info alındı."); return; } if(roomInfo.creatorUsername) { currentRoomData.creatorUsername = roomInfo.creatorUsername; if(loggedInUser?.nickname) { isCurrentUserCreator = (loggedInUser.nickname === roomInfo.creatorUsername); } else { isCurrentUserCreator = false; } } if(typeof roomInfo.hasPassword === 'boolean'){ currentRoomData.hasPassword = roomInfo.hasPassword; } if(roomInfo.name && roomNameDisplay) { roomNameDisplay.textContent = `Otaq: ${escapeHtml(roomInfo.name)}`; currentRoomData.name = roomInfo.name; } if(roomInfo.opponentUsername && !isOpponentPresent && loggedInUser && roomInfo.opponentUsername !== loggedInUser.nickname) { opponentPlayerName = roomInfo.opponentUsername; isOpponentPresent = true; if(playerONameDisplay) playerONameDisplay.textContent = escapeHtml(opponentPlayerName); if (gameStatusDisplay?.textContent.includes("gözlənilir")) { gameStatusDisplay.textContent = `${opponentPlayerName} artıq otaqdadır. Zər atılır...`; setupDiceModalForRollOff(); showModal(diceRollModal); initDice(); } } else if (roomInfo.opponentUsername && isOpponentPresent && loggedInUser && roomInfo.opponentUsername !== loggedInUser.nickname && opponentPlayerName !== roomInfo.opponentUsername){ opponentPlayerName = roomInfo.opponentUsername; if(playerONameDisplay) playerONameDisplay.textContent = escapeHtml(opponentPlayerName); } updateHeaderButtonsVisibility(); });
    }


    // ===== OYUNU BAŞLATMAQ ÜÇÜN İLK ADDIMLAR =====
    async function initializeGame() {
        // ... (initializeGame funksiyası əvvəlki kimi, dəyişiklik yoxdur) ...
        console.log("[initializeGame] Başladı."); showLoadingOverlay('Oyun interfeysi qurulur...'); try { const params = getUrlParams(); currentRoomId = params.roomId; const receivedRoomName = params.roomName; boardSize = params.size; const startWithAI = params.playWithAI; if (!playerXNameDisplay || !playerONameDisplay || !roomNameDisplay) throw new Error("Əsas UI elementləri tapılmadı!"); playerXNameDisplay.textContent = currentPlayerName; roomNameDisplay.textContent = `Otaq: ${escapeHtml(receivedRoomName)}`; currentRoomData = { id: currentRoomId, name: receivedRoomName, creatorUsername: '?', hasPassword: false, boardSize: boardSize, isAiRoom: startWithAI }; adjustStylesForBoardSize(boardSize); createBoard(); resetGameStateVars(); resetBoardAndStatus(); if (startWithAI) { console.log("[initializeGame] AI Oyunu (lobidən)."); isPlayingAgainstAI = true; opponentPlayerName = "SNOW"; isOpponentPresent = true; isCurrentUserCreator = true; currentRoomData.creatorUsername = currentPlayerName; if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName; updateHeaderButtonsVisibility(); if (gameStatusDisplay) gameStatusDisplay.textContent = 'SNOW ilə oyun başlayır. Zər atın!'; hideLoadingOverlay(); setupDiceModalForRollOff(); showModal(diceRollModal); initDice(); } else { console.log(`[initializeGame] Multiplayer oyunu. RoomID: ${currentRoomId}`); if (!currentRoomId) throw new Error("Multiplayer üçün Otaq ID tapılmadı!"); isPlayingAgainstAI = false; opponentPlayerName = "Rəqib Gözlənilir..."; isOpponentPresent = false; if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName; updateHeaderButtonsVisibility(); if (gameStatusDisplay) gameStatusDisplay.textContent = 'Rəqib gözlənilir...'; setupGameSocketConnection(currentRoomId); } updatePlayerInfo(); console.log(`[initializeGame] İnterfeys quruldu. AI=${isPlayingAgainstAI}`); } catch (initError) { console.error("[initializeGame] Xəta:", initError); hideLoadingOverlay(); if(gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yüklənərkən xəta."; if(turnIndicator) turnIndicator.textContent = "Xəta"; }
    }


    // ===== GİRİŞ YOXLAMASI və BAŞLANĞIC (IIFE ilə) =====
    (async () => {
        // ... (Giriş yoxlaması əvvəlki kimi) ...
         try { console.log("Oda İçi: /check-auth sorğusu..."); showLoadingOverlay('Sessiya yoxlanılır...'); const response = await fetch('/check-auth'); const data = await response.json(); if (!response.ok || !data.loggedIn || !data.user) { console.error(`[/check-auth] Xətası: Status=${response.status}, loggedIn=${data.loggedIn}`); alert("Sessiya tapılmadı/etibarsızdır. Giriş səhifəsinə yönləndirilirsiniz."); window.location.href = '/ANA SEHIFE/login/login.html'; return; } loggedInUser = data.user; currentPlayerName = loggedInUser.nickname; console.log(`Oda İçi: Giriş edilib: ${loggedInUser.nickname}`); await initializeGame(); } catch (error) { console.error("Oda İçi: Auth yoxlama xətası:", error); hideLoadingOverlay(); alert("Sessiya yoxlanılarkən xəta. Giriş səhifəsinə yönləndirilirsiniz."); window.location.href = '/ANA SEHIFE/login/login.html'; }
    })();


    // --- Əsas UI Hadisə Dinləyiciləri ---
    console.log("Əsas UI listenerları əlavə edilir...");
    if (leaveRoomBtn) { leaveRoomBtn.addEventListener('click', () => { if (confirm("Otaqdan çıxmaq istədiyinizə əminsiniz?")) { if (!isPlayingAgainstAI && socket && socket.connected) { socket.emit('leave_room'); } window.location.href = '../lobby/test_odalar.html'; } }); } else { console.error("leaveRoomBtn null idi!"); }
    if (restartGameBtn) { restartGameBtn.addEventListener('click', () => handleRestartGame(false)); } else { console.error("restartGameBtn null idi!"); }
    if (editRoomBtn) { editRoomBtn.addEventListener('click', openEditModal); } else { console.error("editRoomBtn null idi!"); }
    if (closeEditModalButton) { closeEditModalButton.addEventListener('click', () => hideModal(editRoomModal)); }
    window.addEventListener('click', (event) => { if (event.target == editRoomModal) hideModal(editRoomModal); });
    if (saveRoomChangesBtn) { saveRoomChangesBtn.addEventListener('click', saveRoomChanges); } else { console.error("saveRoomChangesBtn null idi!"); }
    if (deleteRoomConfirmBtn) { deleteRoomConfirmBtn.addEventListener('click', deleteRoom); } else { console.error("deleteRoomConfirmBtn null idi!"); }
    if (kickOpponentBtn) { kickOpponentBtn.addEventListener('click', handleKickOpponent); } else { console.error("kickOpponentBtn null idi!"); }
    if (callSnowBtn) { callSnowBtn.addEventListener('click', handleCallSnow); } else { console.error("callSnowBtn null idi!"); }
    if (removeSnowBtn) { removeSnowBtn.addEventListener('click', handleRemoveSnow); } else { console.error("removeSnowBtn null idi!"); } // Yeni listener
    if (diceCubeElement) { diceCubeElement.addEventListener('mousedown', handleMouseDown); diceCubeElement.addEventListener('touchstart', handleTouchStart, { passive: false }); } else { console.error("Zər kub elementi (diceCubeElement) tapılmadı!"); }
    console.log("Əsas UI listenerlarının əlavə edilməsi bitdi.");

}); // DOMContentLoaded Sonu - ƏN SONDA OLMALIDIR