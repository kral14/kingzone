// public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: v2.3 - SNOW düyməsi düzəlişləri ilə
// Hissə 1/5 - Qlobal Dəyişənlər, DOM, Yardımçılar, Sıfırlama

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Oda İçi JS (v2.3 - SNOW Düzəlişləri) Başladı.");

    // ---- Qlobal Dəyişənlər ----
    let loggedInUser = null;
    let currentRoomId = null;
    let currentRoomData = {}; // Otaq məlumatlarını saxlamaq üçün (ad, yaradan və s.)
    let socket = null;
    let currentPlayerName = 'Oyunçu'; // Girişdən sonra yenilənəcək
    let opponentPlayerName = 'Rəqib';
    let isOpponentPresent = false;
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
    const callSnowBtn = document.getElementById('call-snow-btn'); // SNOW düyməsi
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
        const playWithAI = urlAiParam === 'SNOW'; // Əgər URL-də ?ai=SNOW varsa, AI oyunu olaraq başla
        const roomNameParam = decodeURIComponent(params.get('roomName') || 'Bilinməyən Otaq');
        const roomIdParam = params.get('roomId'); // Real otaq ID-si və ya AI üçün yaradılmış ID
        return {
            roomId: roomIdParam,
            roomName: roomNameParam,
            playerName: decodeURIComponent(params.get('playerName') || 'Qonaq'), // Bu parametr artıq check-auth ilə gəlir, ehtiyac qalmayıb
            size: validatedSize,
            playWithAI: playWithAI // Lobidən birbaşa AI ilə oynamaq üçün
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
        // isPlayingAgainstAI və aiPlayerSymbol sıfırlanmır, çünki restart AI oyununu davam etdirə bilər
        // isOpponentPresent də sıfırlanmır, çünki AI varsa, opponent var sayılır
        console.log("[resetGameStateVars] Oyun dəyişənləri sıfırlandı (AI statusu qorunur).");
    };
    function resetBoardAndStatus() {
        console.log("[resetBoardAndStatus] Lövhə və status sıfırlanır.");
        if (gameStatusDisplay) { gameStatusDisplay.textContent = ''; gameStatusDisplay.className = 'game-status'; }
        if (turnIndicator) turnIndicator.textContent = 'Gözlənilir...';
        // Hüceyrələri təmizlə və listenerları sil (klonlama ilə)
        cells.forEach((cell, index) => {
            const newCell = cell.cloneNode(true);
            newCell.className = 'cell';
            newCell.textContent = '';
            newCell.style.cursor = 'not-allowed';
            newCell.style.animation = ''; // Animasiyaları sil
            cell.parentNode.replaceChild(newCell, cell);
            cells[index] = newCell;
        });
        updatePlayerInfo(); // Oyunçu məlumatlarını yenilə (? simvolları ilə)
        boardElement.style.opacity = '0.5'; // Lövhəni solğunlaşdır
        boardElement.style.pointerEvents = 'none'; // Klikləməni blokla
        if (restartGameBtn) restartGameBtn.disabled = true; // Yenidən başlat düyməsini deaktiv et
        hideFireworks(); // Effektləri gizlət
        clearShatteringText(); // Mətn effektini təmizlə
    };

// --- Hissə 1/5 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Hissə 2/5 - UI Yeniləmə Funksiyaları

    // ----- UI Yeniləmələri -----
    function adjustStylesForBoardSize(size) {
        // Lövhə ölçüsünə görə CSS dəyişənlərini (hüceyrə ölçüsü, şrift ölçüsü) tənzimləyir
        let cellSizeVar = '--cell-size-large-dynamic'; // Default 3x3 üçün
        if (size === 4) {
            cellSizeVar = '--cell-size-medium-dynamic';
        } else if (size >= 5) {
            cellSizeVar = '--cell-size-small-dynamic';
        }
        document.documentElement.style.setProperty('--current-cell-size', `var(${cellSizeVar})`);
        document.documentElement.style.setProperty('--current-font-size', `calc(var(${cellSizeVar}) * 0.6)`);
        document.documentElement.style.setProperty('--board-size', size); // Grid layout üçün
        console.log(`[adjustStylesForBoardSize] Lövhə ölçüsü ${size}x${size} üçün stillər tənzimləndi.`);
        // Zar ölçüsünü də burada hesablaya bilərik
         try {
             const diceSizeValue = getComputedStyle(document.documentElement).getPropertyValue('--dice-size').trim();
             if (diceSizeValue) initialCenterZ = parseFloat(diceSizeValue.replace('px','')) / -2; else initialCenterZ = -55;
             console.log(`[adjustStylesForBoardSize] Zar üçün initialCenterZ: ${initialCenterZ}`);
         } catch(e) {
             initialCenterZ = -55;
             console.warn("[adjustStylesForBoardSize] Zar ölçüsü CSS-dən alına bilmədi.");
         }
    };

    function createBoard() {
        // Oyun lövhəsini (hüceyrələri) dinamik olaraq yaradır
        if (!boardElement) { console.error("createBoard: boardElement tapılmadı!"); return; }
        boardElement.innerHTML = ''; // Köhnə hüceyrələri təmizlə
        cells = []; // Hüceyrə massivini sıfırla
        const cellCount = boardSize * boardSize;
        console.log(`[createBoard] ${boardSize}x${boardSize} ölçülü (${cellCount} hüceyrə) lövhə yaradılır...`);
        for (let i = 0; i < cellCount; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.index = i; // Hər hüceyrəyə indeksini verək
            cell.style.cursor = 'not-allowed'; // Başlanğıcda klikləməni bağla
            boardElement.appendChild(cell);
            cells.push(cell); // Yeni hüceyrəni massivə əlavə et
        }
        console.log(`[createBoard] ${cells.length} hüceyrə yaradıldı.`);
    };

    function updatePlayerInfo() {
        // Oyunçu məlumatlarını (ad, simvol, aktiv sıra) UI-də yeniləyir
        if (!playerXInfo || !playerOInfo || !playerXSymbolDisplay || !playerOSymbolDisplay || !playerXNameDisplay || !playerONameDisplay) {
             console.warn("updatePlayerInfo: Bəzi oyunçu məlumat elementləri tapılmadı.");
             return;
        }
        // Player 1 (Bu Client)
        playerXSymbolDisplay.textContent = player1Symbol; // X və ya O
        playerXNameDisplay.textContent = escapeHtml(currentPlayerName); // Oyunçu adı
        playerXInfo.className = `player-info ${player1Symbol === 'X' ? 'player-x' : (player1Symbol === 'O' ? 'player-o' : '')}`; // Simvola görə klas

        // Player 2 (Rəqib / AI)
        playerOSymbolDisplay.textContent = player2Symbol; // X və ya O
        playerONameDisplay.textContent = escapeHtml(opponentPlayerName); // Rəqib adı / "SNOW" / "Gözlənilir..."
        playerOInfo.className = `player-info ${player2Symbol === 'X' ? 'player-x' : (player2Symbol === 'O' ? 'player-o' : '')}`;

        // Aktiv sıranı göstər (əgər oyun bitməyibsə)
        if (!isGameOver) {
            playerXInfo.classList.toggle('active-player', currentPlayer === player1Symbol);
            playerOInfo.classList.toggle('active-player', currentPlayer === player2Symbol);
        } else {
            // Oyun bitibsə, aktiv sıranı hər ikisindən qaldır
            playerXInfo.classList.remove('active-player');
            playerOInfo.classList.remove('active-player');
        }
        // console.log("[updatePlayerInfo] Oyunçu məlumatları yeniləndi.");
    };

    function updateTurnIndicator() {
        // Üst tərəfdəki sıra göstəricisini yeniləyir
        if (!turnIndicator) return;

        if (isGameOver) {
            if (gameStatusDisplay?.textContent && !gameStatusDisplay.textContent.includes("Qazandı") && !gameStatusDisplay.textContent.includes("Bərabərə")) {
                 // Oyun bitibsə amma status mesajı yoxdursa (məs. rəqib ayrıldı)
                 turnIndicator.textContent = 'Oyun Bitdi';
            } else if (gameStatusDisplay?.textContent) {
                 // Oyun bitibsə və status mesajı varsa, onu göstər
                 turnIndicator.textContent = gameStatusDisplay.textContent;
            } else {
                 turnIndicator.textContent = 'Oyun Bitdi';
            }
            return;
        }
        if (!currentPlayer) {
            // Simvol hələ seçilməyibsə (zər atılır və ya simvol seçilir)
            turnIndicator.textContent = 'Simvol Seçilir...';
            return;
        }
        // Sırası olan oyunçunun adını və simvolunu göstər
        const turnPlayerName = (currentPlayer === player1Symbol) ? currentPlayerName : opponentPlayerName;
        turnIndicator.textContent = `Sıra: ${escapeHtml(turnPlayerName)} (${currentPlayer})`;

        // Aşağıdakı status mesajını da yeniləyək (əgər varsa)
        if (gameStatusDisplay) {
            gameStatusDisplay.textContent = `Sıra: ${escapeHtml(turnPlayerName)}`;
            gameStatusDisplay.className = 'game-status'; // Əvvəlki win/draw klaslarını təmizlə
        }
        updatePlayerInfo(); // Aktiv oyunçu fonunu yeniləmək üçün
        // console.log("[updateTurnIndicator] Sıra göstəricisi yeniləndi.");
    };

    function updateHeaderButtonsVisibility() {
        // Başlıqdakı düymələrin (Otaq Ayarları, Rəqibi Çıxart, SNOW'u Çağır) görünüşünü idarə edir
        // console.log(`[updateHeaderButtonsVisibility] Çağırıldı. isAI=${isPlayingAgainstAI}, isCreator=${isCurrentUserCreator}, isOpponent=${isOpponentPresent}`);

        // Otaq Ayarları (yalnız yaradan, AI olmayan oyunda)
        const showEdit = !isPlayingAgainstAI && isCurrentUserCreator;
        // Rəqibi Çıxart (yalnız yaradan, rəqib varsa, AI olmayan oyunda)
        const showKick = !isPlayingAgainstAI && isCurrentUserCreator && isOpponentPresent;
        // SNOW'u Çağır (yalnız yaradan, rəqib yoxdursa, AI olmayan oyunda) --- DÜZƏLİŞ EDİLDİ ---
        const showCallSnow = isCurrentUserCreator && !isOpponentPresent && !isPlayingAgainstAI;

        if (editRoomBtn) { editRoomBtn.style.display = showEdit ? 'inline-flex' : 'none'; } else { console.warn("updateHeaderButtonsVisibility: editRoomBtn null idi!"); }
        if (kickOpponentBtn) { kickOpponentBtn.style.display = showKick ? 'inline-flex' : 'none'; } else { console.warn("updateHeaderButtonsVisibility: kickOpponentBtn null idi!"); }
        if (callSnowBtn) {
            callSnowBtn.style.display = showCallSnow ? 'inline-flex' : 'none';
            callSnowBtn.disabled = !showCallSnow; // Görünmürsə, deaktiv də olsun
        } else { console.warn("updateHeaderButtonsVisibility: callSnowBtn null idi!"); }
        // console.log(`[updateHeaderButtonsVisibility] Düymə görünüşləri: Edit=${showEdit}, Kick=${showKick}, CallSnow=${showCallSnow}`);
    };

// --- Hissə 2/5 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Hissə 3/5 - Zər Funksiyaları

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
        let rollDurationValue = '2.0s';
        let rollTimingFunctionValue = 'cubic-bezier(0.3, 0.9, 0.4, 1)';
         try {
             rollDurationValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-duration').trim() || '2.0s';
             rollTimingFunctionValue = getComputedStyle(document.documentElement).getPropertyValue('--roll-timing-function').trim() || 'cubic-bezier(0.3, 0.9, 0.4, 1)';
         } catch (e) { console.warn("CSS dəyişənləri alına bilmədi."); }

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
                 if (player2Roll !== null) { // Əgər rəqibin nəticəsi artıq gəlibsə
                      console.log("[rollDice] Rəqibin nəticəsi artıq gəlib, handleRollOffResults çağırılır.");
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
        console.log(`[handleRollOffResults] Qalib: ${diceWinner === null ? 'Bərabərlik' : diceWinner}`);
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
    function handleMouseDown(event) { if (isDiceRolling || !isOpponentPresent) return; if(!diceCubeElement) return; diceCubeElement.style.transition = 'none'; isDragging = false; dragStartX = event.clientX; dragStartY = event.clientY; previousMouseX = event.clientX; previousMouseY = event.clientY; window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); };
    function handleMouseMove(event) { if (isDiceRolling || !isDragging) return; const deltaX = event.clientX - previousMouseX; const deltaY = event.clientY - previousMouseY; currentDiceRotateY += deltaX * rotateSensitivity; currentDiceRotateX -= deltaY * rotateSensitivity; setDiceTransform(currentDiceRotateX, currentDiceRotateY, currentDiceRotateZ); previousMouseX = event.clientX; previousMouseY = event.clientY; };
    function handleMouseUp(event) { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); handleDiceClickOrDragEnd(); };
    function handleTouchStart(e) { if (isDiceRolling || !isOpponentPresent) return; if(!diceCubeElement) return; diceCubeElement.style.transition = 'none'; isDragging = false; const touch = e.touches[0]; dragStartX = touch.clientX; dragStartY = touch.clientY; previousMouseX = touch.clientX; previousMouseY = touch.clientY; diceCubeElement.addEventListener('touchmove', handleTouchMove, { passive: false }); diceCubeElement.addEventListener('touchend', handleTouchEnd); diceCubeElement.addEventListener('touchcancel', handleTouchEnd); };
    function handleTouchMove(e) { if (isDiceRolling) return; e.preventDefault(); const touch = e.touches[0]; const deltaX = touch.clientX - previousMouseX; const deltaY = touch.clientY - previousMouseY; if (!isDragging) { if (Math.abs(touch.clientX-dragStartX)>dragThreshold || Math.abs(touch.clientY-dragStartY)>dragThreshold) { isDragging = true; } } if (isDragging) { currentDiceRotateY += deltaX*rotateSensitivity; currentDiceRotateX -= deltaY*rotateSensitivity; setDiceTransform(currentDiceRotateX, currentDiceRotateY, currentDiceRotateZ); } previousMouseX = touch.clientX; previousMouseY = touch.clientY; };
    function handleTouchEnd(e) { if(!diceCubeElement) return; diceCubeElement.removeEventListener('touchmove', handleTouchMove); diceCubeElement.removeEventListener('touchend', handleTouchEnd); diceCubeElement.removeEventListener('touchcancel', handleTouchEnd); handleDiceClickOrDragEnd(); };

// --- Hissə 3/5 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Hissə 4/5 - Simvol Seçimi, Oyun Başlama, Oyun Axışı, AI Məntiqi

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
        symbolOptionsDiv.style.display = 'flex';    // Seçim düymələrini göstər

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
                 // Rəqibin seçdiyi simvolu serverə göndərməyə ehtiyac yoxdur (AI-dır)
                 startGameProcedure(opponentChoice); // Oyunu başlat
             } else {
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
                 // Listenerın təkrar əlavə olunmadığından əmin olmaq çətindir,
                 // amma klonlama bu problemi həll edir.
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
             // AI oyununda isə sıra AI-dədirsə, lövhəni blokla
             boardElement.style.pointerEvents = !isMyTurn ? 'none' : 'auto';

             // Əgər AI başlayırsa, ilk hərəkəti etsin
             if (isPlayingAgainstAI && currentPlayer === aiPlayerSymbol) {
                 console.log("[startGameProcedure] AI başlayır, makeAIMove çağırılır.");
                 makeAIMove(); // Bu funksiya özü lövhəni bloklayıb sonra açacaq
             } else {
                 console.log(`[startGameProcedure] ${isMyTurn ? 'İnsan' : 'Rəqib'} başlayır. Lövhə aktivliyi: ${boardElement.style.pointerEvents}`);
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
        const moveMadeSuccessfully = placeMark(index, player1Symbol);

        // Əgər hərəkət uğurlu oldusa və oyunu bitirmədisə
        if (moveMadeSuccessfully && !isGameOver) {
            if (isPlayingAgainstAI) {
                // AI Oyununda: Sıranı AI-yə ver və hərəkət et
                console.log("[handleCellClick] AI Oyunu: Sıra AI-ya keçirilir.");
                switchPlayer(); // Sıranı dəyişdir
                updateTurnIndicator(); // UI-ni yenilə
                boardElement.style.pointerEvents = 'none'; // Lövhəni blokla
                makeAIMove(); // AI hərəkət etsin
            } else {
                // Multiplayer Oyununda: Hərəkəti serverə göndər
                console.log(`[handleCellClick] Multiplayer: Hərəkət (${index}, ${player1Symbol}) serverə göndərilir ('make_move')...`);
                if (socket && socket.connected) {
                     socket.emit('make_move', { index: index, mark: player1Symbol });
                     boardElement.style.pointerEvents = 'none'; // Lövhəni blokla (rəqibi gözlə)
                     switchPlayer(); // Sıranı UI-də dəyişdir
                     updateTurnIndicator(); // UI-ni yenilə
                     if (gameStatusDisplay) gameStatusDisplay.textContent = `Sıra: ${opponentPlayerName}`; // Statusu yenilə
                } else {
                     // Socket bağlıdırsa, hərəkəti geri al (ehtiyat üçün)
                     console.error("[handleCellClick] Socket bağlantısı yoxdur!");
                     board[index] = ''; // Lövhədən sil
                     clickedCell.textContent = ''; // Vizual olaraq sil
                     clickedCell.classList.remove(player1Symbol); // Klası sil
                     clickedCell.style.cursor = 'pointer'; // Yenidən kliklənə bilən et
                     // Listenerı yenidən əlavə etmək üçün klonlama lazımdır, amma bu kompleksdir, sadəcə alert verək
                     alert("Serverlə bağlantı yoxdur. Hərəkət edilə bilmədi.");
                }
            }
        } else if (moveMadeSuccessfully && isGameOver) {
            // Oyun bu hərəkətlə bitdi
             console.log("[handleCellClick] Oyun insanın hərəkəti ilə bitdi.");
             boardElement.style.pointerEvents = 'none'; // Lövhəni blokla
        }
        // Əgər moveMadeSuccessfully false idisə (placeMark xətası), heç nə etmə
    }

    function placeMark(index, mark) {
        // Verilən işarəni lövhəyə yerləşdirir və oyunun bitib-bitmədiyini yoxlayır
        // console.log(`===== placeMark: Index=${index}, Mark=${mark} =====`);
        if (index < 0 || index >= board.length || board[index] !== '' || isGameOver) {
             console.warn(`placeMark: Keçərsiz hərəkət cəhdi. Index=${index}, BoardVal=${board[index]}, GameOver=${isGameOver}`);
             return false; // Keçərsiz hərəkət
        }
        board[index] = mark; // Lövhəni yenilə
        const cellElement = cells[index];
        if (!cellElement) { console.error(`placeMark: Hata! cells[${index}] tapılmadı!`); return false; }

        // Vizual olaraq işarəni yerləşdir və klikləməni söndür
        cellElement.textContent = mark;
        cellElement.classList.add(mark); // 'X' və ya 'O' klası
        cellElement.style.cursor = 'not-allowed';

        // Listenerları silmək üçün klonlama (əgər varsa)
        // Əgər startGameProcedure-də onsuz da klonlanıbsa, burada təkrar ehtiyac olmaya bilər,
        // amma kliklənən hüceyrənin listenerını qaldırmaq üçün edək.
        const newCell = cellElement.cloneNode(true);
        cellElement.parentNode.replaceChild(newCell, cellElement);
        cells[index] = newCell; // Yeni elementi massivdə saxla

        // console.log(`placeMark: ${index} xanası ${mark} ilə dolduruldu.`);

        // Qazanma və bərabərlik yoxlaması
        const win = checkWin(mark);
        const draw = !win && !board.includes('');

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
            console.log(`[makeAIMove] Bloklandı (GameOver=${isGameOver}, Current=${currentPlayer}, AISymbol=${aiPlayerSymbol})`);
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
                 console.error("[makeAIMove] findBestMove xətası:", aiError);
                 let availableCells = []; for(let i=0; i<board.length; i++) if(board[i]==='') availableCells.push(i);
                 if (availableCells.length > 0) bestMove = availableCells[Math.floor(Math.random() * availableCells.length)];
                 console.error("[makeAIMove] Xəta səbəbiylə təsadüfi hərəkət:", bestMove);
            }

            if (bestMove !== -1 && board[bestMove] === '') {
                const moveMadeSuccessfully = placeMark(bestMove, aiPlayerSymbol); // Hərəkəti yerləşdir
                if (moveMadeSuccessfully && !isGameOver) { // Əgər hərəkət edildi və oyun bitmədisə
                    console.log("[makeAIMove] AI hərəkət etdi, sıra insana keçir.");
                    switchPlayer(); // Sıranı insana ver
                    if (boardElement) boardElement.style.pointerEvents = 'auto'; // Lövhəni aktiv et
                    updateTurnIndicator(); // UI-ni yenilə
                } else if (moveMadeSuccessfully && isGameOver) {
                     console.log("[makeAIMove] AI hərəkət etdi və oyun bitdi.");
                     if (boardElement) boardElement.style.pointerEvents = 'none'; // Lövhəni blokla
                     updateTurnIndicator(); // Oyun bitdi statusunu göstər
                } else {
                     // placeMark false qaytardı (nadir hal)
                      console.error(`[makeAIMove] placeMark uğursuz oldu! Move: ${bestMove}`);
                      if (boardElement) boardElement.style.pointerEvents = 'auto'; // Lövhəni açmağa çalış
                      updateTurnIndicator(); // UI-ni yenilə
                }
            } else {
                // Etibarlı hərəkət tapılmadı (bərabərlik və ya xəta)
                console.warn(`[makeAIMove] Etibarlı hərəkət tapılmadı (${bestMove})! Lövhə:`, [...board]);
                 if (boardElement) boardElement.style.pointerEvents = 'auto'; // Lövhəni aktiv et
                 // Bərabərlik yoxlaması (qazanma yoxdursa və boş xana qalmayıbsa)
                 if(!checkWin(player1Symbol) && !board.includes('')) {
                      console.log("[makeAIMove] Bərabərlik (hərəkət yoxdur).");
                      if (!isGameOver) endGame(true, null); // Oyunu bitir (əgər hələ bitməyibsə)
                      updateTurnIndicator();
                 } else {
                      console.warn("[makeAIMove] Hərəkət yoxdur amma oyun bitməyib və ya bərabərlik deyil?");
                      updateTurnIndicator(); // Sıranı göstər (bəlkə də ilişib?)
                 }
            }
             // console.log("[makeAIMove] AI setTimeout callback bitdi.");
        }, 500 + Math.random() * 300); // 0.5 - 0.8 saniyə gözləmə
    }

    function findBestMove() {
        // AI üçün ən yaxşı hərəkəti tapan funksiya (Minimax və sadə strategiyalar)
        // console.log(`%c[findBestMove] Başladı. boardSize=${boardSize}, AI Symbol=${aiPlayerSymbol}`, "color: cyan");
        const humanPlayerSymbol = (aiPlayerSymbol === player1Symbol) ? player2Symbol : player1Symbol; // Düzgün insan simvolunu tap

        // 1. Qazanma Hərəkəti
        for (let i = 0; i < board.length; i++) { if (board[i] === '') { board[i] = aiPlayerSymbol; if (checkWin(aiPlayerSymbol)) { board[i] = ''; /*console.log("AI Move: Win");*/ return i; } board[i] = ''; } }
        // 2. Bloklama Hərəkəti
        for (let i = 0; i < board.length; i++) { if (board[i] === '') { board[i] = humanPlayerSymbol; if (checkWin(humanPlayerSymbol)) { board[i] = ''; /*console.log("AI Move: Block");*/ return i; } board[i] = ''; } }

        // 3. Sadə Strategiyalar (Böyük lövhələr üçün Minimax yerinə)
        if (boardSize >= 5) {
             // Mərkəzi xanaları prioritetləşdir
             const centerCells = getCenterCells(boardSize);
             const availableCenter = centerCells.filter(index => board[index] === '');
             if (availableCenter.length > 0) { /*console.log("AI Move: Center");*/ return availableCenter[Math.floor(Math.random() * availableCenter.length)];}
             // TODO: Çəngəl yaratma/bloklama kimi daha mürəkkəb strategiyalar əlavə et
        }
        // 4. Minimax (Kiçik lövhələr üçün)
        else if (boardSize <= 4) {
            let move = -1; let score = -Infinity;
            let currentMaxDepth = (boardSize === 4) ? 4 : 7; // 3x3 üçün dərinliyi artıraq, 4x4 üçün məhdud
            const availableMoves = []; for(let i=0; i<board.length; i++) { if(board[i] === '') availableMoves.push(i); }
             // console.log(`Minimax running. Depth=${currentMaxDepth}, Moves=${availableMoves.length}`);
             // Boş lövhədə ilk gedişi optimallaşdır (mərkəz və ya künc)
            if (availableMoves.length === board.length) {
                const corners = [0, boardSize-1, (boardSize-1)*boardSize, boardSize*boardSize-1];
                const center = getCenterCells(boardSize);
                const firstMoves = [...center, ...corners];
                return firstMoves[Math.floor(Math.random() * firstMoves.length)];
            }

            for (const i of availableMoves) {
                board[i] = aiPlayerSymbol;
                let currentScore = minimax(board, 0, false, humanPlayerSymbol, aiPlayerSymbol, currentMaxDepth);
                board[i] = '';
                if (currentScore > score) { score = currentScore; move = i; }
            }
            if (move !== -1) { /*console.log(`AI Move: Minimax (score ${score})`);*/ return move; }
        }

        // 5. Təsadüfi Etibarlı Hərəkət
        let availableCells = []; for (let i = 0; i < board.length; i++) { if (board[i] === '') availableCells.push(i); }
        if (availableCells.length > 0) { /*console.log("AI Move: Random");*/ return availableCells[Math.floor(Math.random() * availableCells.length)]; }

        console.error("[findBestMove] Heç bir hərəkət tapılmadı!");
        return -1; // Hərəkət tapılmadı
    }

    function getCenterCells(size) { const centerIndices = []; const isOdd = size % 2 !== 0; if (isOdd) { const center = Math.floor(size / 2); centerIndices.push(center * size + center); } else { const c1 = size / 2 - 1; const c2 = size / 2; centerIndices.push(c1 * size + c1); centerIndices.push(c1 * size + c2); centerIndices.push(c2 * size + c1); centerIndices.push(c2 * size + c2); } return centerIndices; };
    function minimax(currentBoard, depth, isMaximizing, humanSymbol, aiSymbol, maxDepth) { let winner = checkWinnerForMinimax(currentBoard, humanSymbol, aiSymbol); if (winner === aiSymbol) return 10 - depth; if (winner === humanSymbol) return depth - 10; if (!currentBoard.includes('')) return 0; if (depth >= maxDepth) return 0; if (isMaximizing) { let bestScore = -Infinity; for (let i = 0; i < currentBoard.length; i++) { if (currentBoard[i] === '') { currentBoard[i] = aiSymbol; bestScore = Math.max(bestScore, minimax(currentBoard, depth + 1, false, humanSymbol, aiSymbol, maxDepth)); currentBoard[i] = ''; } } return bestScore; } else { let bestScore = Infinity; for (let i = 0; i < currentBoard.length; i++) { if (currentBoard[i] === '') { currentBoard[i] = humanSymbol; bestScore = Math.min(bestScore, minimax(currentBoard, depth + 1, true, humanSymbol, aiSymbol, maxDepth)); currentBoard[i] = ''; } } return bestScore; } };
    function checkWinnerForMinimax(currentBoard, humanSymbol, aiSymbol) { const winConditions = generateWinConditions(boardSize); for (const condition of winConditions) { const firstSymbol = currentBoard[condition[0]]; if (firstSymbol !== '' && condition.every(index => currentBoard[index] === firstSymbol)) { return firstSymbol; } } return null; };

// --- Hissə 4/5 Sonu ---
// public/OYUNLAR/tictactoe/game/oda_ici.js
// Hissə 5/5 - Oyun Sonu, Effektlər, Otaq Əməliyyatları, Socket, Başlatma

    // ----- Qazanma/Bərabərlik Yoxlaması -----
    function checkWin(playerSymbolToCheck) {
        // Verilən simvol üçün qazanma vəziyyətini yoxlayır
        winningCombination = []; // Əvvəlki qazanmanı təmizlə
        const winConditions = generateWinConditions(boardSize);
        for (let i = 0; i < winConditions.length; i++) {
            const condition = winConditions[i];
            const firstSymbol = board[condition[0]];
            // Yalnız yoxlanılan simvolla başlayan və boş olmayan xanaları nəzərə al
            if (firstSymbol !== playerSymbolToCheck || firstSymbol === '') continue;

            let allSame = true;
            // Kombinasiyadakı bütün xanaların eyni simvol olduğunu yoxla
            for (let j = 1; j < condition.length; j++) {
                if (board[condition[j]] !== firstSymbol) {
                    allSame = false;
                    break;
                }
            }
            if (allSame) {
                winningCombination = condition; // Qazanan kombinasiyanı saxla
                return true; // Qazanan tapıldı
            }
        }
        return false; // Qazanan tapılmadı
    };

    function generateWinConditions(size) {
        // Verilmiş lövhə ölçüsü üçün bütün mümkün qazanma kombinasiyalarını yaradır
        // 3x3 və 4x4 üçün 3 yan-yana, 5x5 və 6x6 üçün 4 yan-yana qaydası
        const conditions = [];
        const winLength = (size === 3 || size === 4) ? 3 : 4;

        for (let r = 0; r < size; r++) { // Sətirlər üzrə
            for (let c = 0; c < size; c++) { // Sütunlar üzrə
                // Üfüqi
                if (c <= size - winLength) {
                    const rowCondition = [];
                    for (let k = 0; k < winLength; k++) rowCondition.push(r * size + (c + k));
                    conditions.push(rowCondition);
                }
                // Şaquli
                if (r <= size - winLength) {
                    const colCondition = [];
                    for (let k = 0; k < winLength; k++) colCondition.push((r + k) * size + c);
                    conditions.push(colCondition);
                }
                // Diaqonal (Sol yuxarıdan sağ aşağı)
                if (r <= size - winLength && c <= size - winLength) {
                    const diag1Condition = [];
                    for (let k = 0; k < winLength; k++) diag1Condition.push((r + k) * size + (c + k));
                    conditions.push(diag1Condition);
                }
                // Diaqonal (Sağ yuxarıdan sol aşağı)
                if (r <= size - winLength && c >= winLength - 1) {
                    const diag2Condition = [];
                    for (let k = 0; k < winLength; k++) diag2Condition.push((r + k) * size + (c - k));
                    conditions.push(diag2Condition);
                }
            }
        }
        // Təkrar kombinasiyaları aradan qaldırmaq üçün (ehtimal azdır, amma ehtiyat üçün)
        const uniqueConditions = conditions.map(cond => JSON.stringify(cond.sort((a,b)=>a-b)));
        return [...new Set(uniqueConditions)].map(str => JSON.parse(str));
    };

    function checkDraw() {
        // Bərabərlik vəziyyətini yoxlayır (lövhədə boş xana qalmayıbsa)
        return !board.includes('');
    };

    function highlightWinningCells() {
        // Qazanan kombinasiyadakı hüceyrələri vizual olaraq işıqlandırır
        winningCombination.forEach(index => {
            if(cells[index]) cells[index].classList.add('winning');
        });
    };


    // ----- Oyun Sonu -----
    function endGame(isDraw, winnerMark) {
        // Oyun bitdikdə çağırılır, statusu yeniləyir, effektləri işə salır
        console.log(`[endGame] Oyun bitdi. Bərabərlik: ${isDraw}, Qazanan İşarə: ${winnerMark}`);
        isGameOver = true; // Oyunun bitdiyini işarələ
        if(boardElement) boardElement.style.pointerEvents = 'none'; // Lövhəni deaktiv et
        if (restartGameBtn) restartGameBtn.disabled = false; // Yenidən başlat düyməsini aktiv et

        const winnerName = winnerMark === player1Symbol ? currentPlayerName : (winnerMark ? opponentPlayerName : null);

        if (isDraw) {
            if (gameStatusDisplay) { gameStatusDisplay.textContent = "Oyun Bərabərə!"; gameStatusDisplay.classList.add('draw'); }
            if (turnIndicator) turnIndicator.textContent = "Bərabərə";
        } else if (winnerMark && winnerName) { // Qalib varsa
            if (gameStatusDisplay) { gameStatusDisplay.textContent = `${escapeHtml(winnerName)} Qazandı!`; gameStatusDisplay.classList.add('win'); }
            if (turnIndicator) turnIndicator.textContent = "Bitdi";
            triggerShatterEffect(winnerMark); // Qalib üçün effekt
        } else {
             // Qalib yoxdursa və bərabərlik də deyilsə (məs. rəqib ayrıldı)
             if (gameStatusDisplay) gameStatusDisplay.textContent = "Oyun Bitdi";
             if (turnIndicator) turnIndicator.textContent = "Bitdi";
        }

        // Aktiv oyunçu stilini hər iki tərəfdən qaldır
        playerXInfo?.classList.remove('active-player');
        playerOInfo?.classList.remove('active-player');
        // updatePlayerInfo(); // Oyunçu məlumatlarını son vəziyyətə görə yenilə (simvollar qalsın)
    }

    // ----- Effektlər -----
    function triggerShatterEffect(winnerMark) {
        // Qalib üçün parçalanma mətn effektini işə salır
         if (!fireworksOverlay || !shatteringTextContainer || !winnerMark) return;
         clearShatteringText();
         const text = winnerMark === player1Symbol ? "Siz Qazandınız!" : `${escapeHtml(opponentPlayerName)} Qazandı!`;
         const chars = text.split('');
         chars.forEach((char, index) => { const span = document.createElement('span'); span.textContent = char === ' ' ? '\u00A0' : char; span.classList.add('shatter-char'); span.style.setProperty('--char-index', index); shatteringTextContainer.appendChild(span); });
         fireworksOverlay.classList.add('visible');
         shatteringTextContainer.style.opacity = '1';
         setTimeout(() => {
             const spans = shatteringTextContainer.querySelectorAll('.shatter-char');
             let duration = 3000, distance = 170; // Default values
             try {
                duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-duration').replace('s',''))*1000||3000;
                distance = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shatter-distance').replace('px',''))||170;
             } catch(e){ console.warn("Shatter CSS dəyişənləri alına bilmədi."); }

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
        console.warn("Otaq ayarları funksionallığı hələ tam deyil (serverlə əlaqə yoxdur).");
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
        console.warn("Otaq silmə funksionallığı hələ tam deyil (serverə göndərilmir).");
        if(isPlayingAgainstAI || !isCurrentUserCreator) return;
        if (confirm(`'${escapeHtml(currentRoomData.name)}' otağını silmək istədiyinizə əminsiniz?`)) {
            const msgElement = editRoomModal?.querySelector('#edit-room-message');
            showMsg(msgElement, 'Otaq silinir...', 'info', 0);
            if (socket && socket.connected) socket.emit('delete_room', { roomId: currentRoomId });
            setTimeout(() => {
                alert("Otaq silindi. Lobiyə qayıdırsınız.");
                window.location.href = '../lobby/test_odalar.html';
            }, 1500);
        }
    }
    function handleKickOpponent() {
        if (isPlayingAgainstAI || !isCurrentUserCreator || !isOpponentPresent) return;
        if (confirm(`${escapeHtml(opponentPlayerName)}-i otaqdan çıxarmaq istədiyinizə əminsiniz?`)) {
             console.warn("Kick funksionallığı hələ tam deyil.");
             if (socket && socket.connected) socket.emit('kick_opponent', { roomId: currentRoomId });
             // Serverdən təsdiq gəlməsini gözləmək daha yaxşıdır, amma lokalda dərhal UI yeniləyək
              opponentPlayerName = 'Rəqib Gözlənilir...'; isOpponentPresent = false; isPlayingAgainstAI = false; aiPlayerSymbol = '';
              if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName; if (playerOSymbolDisplay) playerOSymbolDisplay.textContent = '?'; if (playerOInfo) playerOInfo.className = 'player-info'; playerOInfo?.classList.remove('active-player');
              isGameOver = true; resetGameStateVars(); resetBoardAndStatus();
              if (gameStatusDisplay) gameStatusDisplay.textContent = `Rəqib çıxarıldı. Rəqib gözlənilir...`; if (turnIndicator) turnIndicator.textContent = "Gözlənilir";
              updateHeaderButtonsVisibility(); hideModal(diceRollModal); hideModal(symbolSelectModal);
        }
    }

    // --- YENİ VƏ YA DƏYİŞDİRİLMİŞ handleCallSnow funksiyası ---
    function handleCallSnow() {
        console.log("[handleCallSnow] Çağırıldı.");
        if (isOpponentPresent || isPlayingAgainstAI) { console.warn("[handleCallSnow] Artıq rəqib var və ya AI ilə oynanılır. Çağırış ləğv edildi."); return; }
        if (!isCurrentUserCreator) { alert("Yalnız otaq yaradan SNOW-u çağıra bilər."); return; }
        console.log("[handleCallSnow] SNOW oyuna əlavə edilir...");
        isPlayingAgainstAI = true; isOpponentPresent = true; opponentPlayerName = "SNOW"; aiPlayerSymbol = '';
        updatePlayerInfo(); updateHeaderButtonsVisibility();
        if (callSnowBtn) callSnowBtn.disabled = true;
        console.log("[handleCallSnow] Simvol seçimi başladılır...");
        // Zər qalibini təyin et (insan başlasın simvolu seçsin)
        diceWinner = currentPlayerName;
        initSymbolSelection(); // Simvol seçim modalını aç/idare et
        isGameOver = false;
        if (restartGameBtn) restartGameBtn.disabled = false;
        if (gameStatusDisplay) { gameStatusDisplay.textContent = "SNOW ilə oyun başlayır. Simvol seçilir..."; gameStatusDisplay.className = 'game-status'; }
        if (turnIndicator) turnIndicator.textContent = 'Simvol Seçilir...';
        console.log("[handleCallSnow] Proses tamamlandı.");
    }


    // ----- Yeniden Başlatma -----
    function handleRestartGame(accepted = false) {
        if (!isGameOver || (!isOpponentPresent && !isPlayingAgainstAI)) { console.log(`Yenidən başlatmaq üçün şərtlər ödənmir.`); return; }
        console.log(`handleRestartGame çağırıldı. Qəbul edilib: ${accepted}`);
        if (isPlayingAgainstAI) { console.log("AI oyunu yenidən başladılır..."); performLocalRestart(); }
        else { // Multiplayer
             if (accepted) { console.log("Multiplayer oyunu yenidən başladılır..."); performLocalRestart(); }
             else { // Təklif göndər
                  if (socket && socket.connected) {
                       console.log("Yenidən başlatma təklifi serverə göndərilir ('request_restart')...");
                       socket.emit('request_restart');
                       if(gameStatusDisplay) gameStatusDisplay.textContent = "Yenidən başlatma təklifi göndərildi. Rəqib gözlənilir...";
                       if(restartGameBtn) restartGameBtn.disabled = true;
                       // Cavab üçün timeout (optional)
                       setTimeout(() => { if(restartGameBtn && restartGameBtn.disabled && isGameOver) { restartGameBtn.disabled = false; if(gameStatusDisplay && gameStatusDisplay.textContent.includes("gözlənilir")) { gameStatusDisplay.textContent = "Təklifə cavab gəlmədi."; } } }, 15000);
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
        if (socket && socket.connected) socket.disconnect();
        if (isPlayingAgainstAI || !roomIdToJoin) { console.log(`[SocketSetup] AI oyunu (${isPlayingAgainstAI}) və ya RoomID (${roomIdToJoin}) olmadığı üçün socket qurulmur.`); return; }
        console.log(`[SocketSetup] ${roomIdToJoin} otağı üçün bağlantı qurulur...`);
        showLoadingOverlay('Serverə qoşulunur...');
        socket = io({ reconnectionAttempts: 3 });

        // --- Əsas Bağlantı Hadisələri ---
        socket.on('connect', () => {
            console.log(`[Socket] Oyun serverinə qoşuldu! Socket ID: ${socket.id}, Otaq ID: ${roomIdToJoin}`);
            hideLoadingOverlay();
            socket.emit('player_ready_in_room', { roomId: roomIdToJoin }); // Serverə bu otaqda olduğumuzu bildir
            console.log("[Socket] 'player_ready_in_room' hadisəsi göndərildi.");
            if (gameStatusDisplay && !isOpponentPresent) { gameStatusDisplay.textContent = 'Rəqib gözlənilir...'; }
        });
        socket.on('disconnect', (reason) => { console.warn('[Socket] Serverlə bağlantı kəsildi:', reason); if (gameStatusDisplay) gameStatusDisplay.textContent = 'Bağlantı kəsildi!'; isGameOver = true; isOpponentPresent = false; opponentPlayerName = 'Rəqib (Offline)'; updatePlayerInfo(); boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none'; });
        socket.on('connect_error', (error) => { console.error('[Socket] Qoşulma xətası:', error.message); if (gameStatusDisplay) gameStatusDisplay.textContent = 'Qoşulma xətası!'; isGameOver = true; boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none'; alert(`Serverə qoşulmaq mümkün olmadı: ${error.message}`); });
        socket.on('room_deleted_kick', (data) => { console.warn('Otaq silindiyi üçün çıxarıldınız:', data?.message); alert(data?.message || 'Otaq yaradan tərəfindən silindi.'); window.location.href = '../lobby/test_odalar.html'; });
        socket.on('force_redirect_lobby', (data) => { console.warn('Server lobiyə yönləndirmə tələb etdi:', data?.message); alert(data?.message || 'Otaq mövcud deyil və ya xəta baş verdi.'); window.location.href = '../lobby/test_odalar.html'; });

        // --- Oyunla Bağlı Hadisələr ---
        setupGameEventListeners(socket);
    }

    function setupGameEventListeners(socketInstance) {
        console.log("[SocketListeners] Oyun hadisə dinləyiciləri quraşdırılır...");
        socketInstance.on('opponent_joined', (data) => {
             console.log(`[Socket Event] >>> opponent_joined ALINDI:`, data);
             try {
                  if (isPlayingAgainstAI) {
                       console.log("[opponent_joined] AI oyununda rəqib qoşulması ignor edilir (hələlik).");
                       // TODO: AI ilə oynayarkən real rəqib qoşulma məntiqini burada idarə et
                       // Məsələn, bildiriş göstər, seçim təklif et.
                       return;
                  }
                  opponentPlayerName = data?.username || 'Rəqib (?)';
                  isOpponentPresent = true;
                  console.log(`[opponent_joined] Rəqib təyin edildi: ${opponentPlayerName}`);
                  if (playerONameDisplay) playerONameDisplay.textContent = escapeHtml(opponentPlayerName);
                  if (gameStatusDisplay) gameStatusDisplay.textContent = `${opponentPlayerName} qoşuldu. Zər atılır...`;
                  setupDiceModalForRollOff(); showModal(diceRollModal); initDice();
                  updatePlayerInfo(); updateHeaderButtonsVisibility();
             } catch (error) { console.error("<<<<< opponent_joined içində KRİTİK XƏTA! >>>>>", error); if (gameStatusDisplay) gameStatusDisplay.textContent = "Rəqib qoşularkən xəta!"; }
        });
        socketInstance.on('opponent_left_game', (data) => {
            console.log(`[Socket Event] opponent_left_game alındı:`, data);
            if (isPlayingAgainstAI) return; // Əgər AI ilə oynayırdıqsa, bu hadisə mənasızdır
            const opponentWhoLeft = data?.username || 'Rəqib';
            if (gameStatusDisplay) gameStatusDisplay.textContent = `${opponentWhoLeft} otaqdan ayrıldı.`;
            if (turnIndicator) turnIndicator.textContent = "Gözlənilir";
            isGameOver = true; isOpponentPresent = false; opponentPlayerName = 'Rəqib Gözlənilir...';
            resetGameStateVars(); resetBoardAndStatus();
            hideModal(diceRollModal); hideModal(symbolSelectModal);
            if (restartGameBtn) restartGameBtn.disabled = true;
            updateHeaderButtonsVisibility(); // Call SNOW düyməsi görünə bilər
        });
        socketInstance.on('opponent_dice_result', (data) => { if (isPlayingAgainstAI || !data || typeof data.roll !== 'number') return; const processResult = () => { player2Roll = data.roll; if (opponentRollResultDisplay) opponentRollResultDisplay.textContent = player2Roll; if (player1Roll !== null) { handleRollOffResults(player1Roll, player2Roll); } }; if (isDiceRolling) { setTimeout(processResult, 500); } else { processResult(); } });
        socketInstance.on('opponent_symbol_chosen', (data) => { if (isPlayingAgainstAI || !data || (data.symbol !== 'X' && data.symbol !== 'O')) return; if (symbolSelectModal && symbolSelectModal.style.display === 'block') { startGameProcedure(data.symbol); } else { console.warn("opponent_symbol_chosen alındı, amma modal bağlı idi?"); } });
        socketInstance.on('opponent_moved', (data) => { if (isPlayingAgainstAI || !data || typeof data.index !== 'number' || !data.mark || isGameOver) return; const moveMade = placeMark(data.index, data.mark); if (moveMade && !isGameOver) { switchPlayer(); updateTurnIndicator(); if(boardElement) boardElement.style.pointerEvents = 'auto'; if (gameStatusDisplay) gameStatusDisplay.textContent = `Sıra: ${currentPlayerName}`; } else if (moveMade && isGameOver) { if(boardElement) boardElement.style.pointerEvents = 'none'; updateTurnIndicator(); } });
        socketInstance.on('restart_requested', (data) => { if (isGameOver && isOpponentPresent && !isPlayingAgainstAI) { const requester = data?.username || 'Rəqib'; if (confirm(`${requester} oyunu yenidən başlatmağı təklif edir. Qəbul edirsiniz?`)) { console.log("Təklif qəbul edildi."); socketInstance.emit('accept_restart'); handleRestartGame(true); } else { console.log("Təklif rədd edildi."); } } else { console.warn("restart_requested alındı, amma şərtlər ödənmir."); } });
        socketInstance.on('restart_accepted', (data) => { if (isGameOver && isOpponentPresent && !isPlayingAgainstAI) { const accepter = data?.username || 'Rəqib'; if (gameStatusDisplay) gameStatusDisplay.textContent = `${accepter} yenidən başlatmağı qəbul etdi. Zər atılır...`; handleRestartGame(true); } else { console.warn("restart_accepted alındı, amma şərtlər ödənmir."); } });
        socketInstance.on('room_info', (roomInfo) => {
             console.log("[Socket Event] room_info alındı:", roomInfo);
             if(!roomInfo) { console.warn("Boş room_info alındı."); return; }
             if(roomInfo.creatorUsername) { currentRoomData.creatorUsername = roomInfo.creatorUsername; if(loggedInUser?.nickname) { isCurrentUserCreator = (loggedInUser.nickname === roomInfo.creatorUsername); } else { isCurrentUserCreator = false; } }
             if(typeof roomInfo.hasPassword === 'boolean'){ currentRoomData.hasPassword = roomInfo.hasPassword; }
             if(roomInfo.name && roomNameDisplay) { roomNameDisplay.textContent = `Otaq: ${escapeHtml(roomInfo.name)}`; currentRoomData.name = roomInfo.name; }
             // Rəqib adını yenilə (əgər varsa VƏ BU İSTİFADƏÇİ DEYİLSƏ VƏ HƏLƏ TƏYİN EDİLMƏYİBSƏ)
              if(roomInfo.opponentUsername && !isOpponentPresent && loggedInUser && roomInfo.opponentUsername !== loggedInUser.nickname) {
                  console.log(`room_info-dan rəqib adı təyin edilir: ${roomInfo.opponentUsername}`);
                  opponentPlayerName = roomInfo.opponentUsername; isOpponentPresent = true;
                  if(playerONameDisplay) playerONameDisplay.textContent = escapeHtml(opponentPlayerName);
                  if (gameStatusDisplay && gameStatusDisplay.textContent.includes("gözlənilir")) { gameStatusDisplay.textContent = `${opponentPlayerName} artıq otaqdadır. Zər atılır...`; setupDiceModalForRollOff(); showModal(diceRollModal); initDice(); }
              } else if (roomInfo.opponentUsername && isOpponentPresent && loggedInUser && roomInfo.opponentUsername !== loggedInUser.nickname && opponentPlayerName !== roomInfo.opponentUsername){
                 console.log(`room_info-dan rəqib adı yenilənir: ${roomInfo.opponentUsername}`); opponentPlayerName = roomInfo.opponentUsername; if(playerONameDisplay) playerONameDisplay.textContent = escapeHtml(opponentPlayerName);
              }
             updateHeaderButtonsVisibility(); // Yaradıcı statusuna görə düymələri yenilə
        });
    }


    // ===== OYUNU BAŞLATMAQ ÜÇÜN İLK ADDIMLAR =====
    async function initializeGame() {
        console.log("[initializeGame] Başladı.");
        showLoadingOverlay('Oyun interfeysi qurulur...');
        try {
            const params = getUrlParams();
            currentRoomId = params.roomId;
            const receivedRoomName = params.roomName;
            boardSize = params.size;
            const startWithAI = params.playWithAI; // Lobidən gələn AI parametri

            if (!playerXNameDisplay || !playerONameDisplay || !roomNameDisplay) throw new Error("Əsas UI elementləri tapılmadı!");
            playerXNameDisplay.textContent = currentPlayerName; // Auth-dan gələn ad
            roomNameDisplay.textContent = `Otaq: ${escapeHtml(receivedRoomName)}`;

            // İlkin currentRoomData-nı dolduraq (serverdən gələni gözləyərkən)
            currentRoomData = { id: currentRoomId, name: receivedRoomName, creatorUsername: '?', hasPassword: false, boardSize: boardSize, isAiRoom: startWithAI };

            adjustStylesForBoardSize(boardSize); // Stilləri ayarla
            createBoard(); // Lövhəni yarat
            resetGameStateVars(); // Oyun dəyişənlərini sıfırla
            resetBoardAndStatus(); // Lövhə UI-ni sıfırla

            if (startWithAI) {
                // Lobidən birbaşa AI oyunu olaraq başla
                console.log("[initializeGame] AI Oyunu (SNOW) başladılır (lobidən).");
                isPlayingAgainstAI = true;
                opponentPlayerName = "SNOW";
                isOpponentPresent = true;
                isCurrentUserCreator = true; // AI oyununda client həmişə "yaradan" kimidir
                currentRoomData.creatorUsername = currentPlayerName; // Özümüzü yaradan kimi göstərək
                if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;
                updateHeaderButtonsVisibility(); // Düymələri göstər/gizlə
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'SNOW ilə oyun başlayır. Zər atın!';
                hideLoadingOverlay();
                setupDiceModalForRollOff(); showModal(diceRollModal); initDice();
            } else {
                // Normal (Multiplayer) Oyun
                console.log(`[initializeGame] Multiplayer oyunu başladılır. RoomID: ${currentRoomId}`);
                if (!currentRoomId) throw new Error("Multiplayer oyunu üçün Otaq ID tapılmadı!");
                isPlayingAgainstAI = false;
                opponentPlayerName = "Rəqib Gözlənilir...";
                isOpponentPresent = false;
                // isCurrentUserCreator serverdən gələn 'room_info' ilə təyin olunacaq
                if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;
                updateHeaderButtonsVisibility(); // İlkin düymə vəziyyəti
                if (gameStatusDisplay) gameStatusDisplay.textContent = 'Rəqib gözlənilir...';
                setupGameSocketConnection(currentRoomId); // Socket bağlantısını qur (bu hideLoadingOverlay çağıracaq)
            }
            updatePlayerInfo(); // Son UI yeniləməsi
            console.log(`[initializeGame] Oyun interfeysi quruldu. AI=${isPlayingAgainstAI}`);
        } catch (initError) {
            console.error("[initializeGame] Ümumi xəta:", initError);
            hideLoadingOverlay();
            if(gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yüklənərkən xəta baş verdi.";
            if(turnIndicator) turnIndicator.textContent = "Xəta";
        }
    }


    // ===== GİRİŞ YOXLAMASI və BAŞLANĞIC (IIFE ilə) =====
    (async () => {
        try {
            console.log("Oda İçi: /check-auth sorğusu...");
            showLoadingOverlay('Sessiya yoxlanılır...');
            // check-auth sorğusu üçün credential göndərməyə ehtiyac yoxdur,
            // çünki session cookie avtomatik gedir (əgər domainlər uyğundursa).
            const response = await fetch('/check-auth'); // Credentials: 'include' olmadan
            const data = await response.json();

            if (!response.ok || !data.loggedIn || !data.user) {
                console.error(`[/check-auth] Xətası: Status=${response.status}, loggedIn=${data.loggedIn}`);
                alert("Sessiya tapılmadı və ya etibarsızdır. Giriş səhifəsinə yönləndirilirsiniz.");
                window.location.href = '/ANA SEHIFE/login/login.html';
                return;
            }
            loggedInUser = data.user;
            currentPlayerName = loggedInUser.nickname; // İstifadəçi adını qlobal dəyişənə yaz
            console.log(`Oda İçi: Giriş edilib: ${loggedInUser.nickname}`);

            // Giriş uğurlu olduqdan sonra oyunu başlat
            await initializeGame(); // initializeGame indi async deyil, amma await qala bilər

        } catch (error) {
            console.error("Oda İçi: Auth yoxlama xətası:", error);
            hideLoadingOverlay();
            alert("Sessiya yoxlanılarkən xəta baş verdi. Giriş səhifəsinə yönləndirilirsiniz.");
            window.location.href = '/ANA SEHIFE/login/login.html';
        }
    })(); // Async IIFE sonu


    // --- Əsas UI Hadisə Dinləyiciləri ---
    console.log("Əsas UI listenerları əlavə edilir...");
    if (leaveRoomBtn) { leaveRoomBtn.addEventListener('click', () => { if (confirm("Otaqdan çıxmaq istədiyinizə əminsiniz?")) { if (!isPlayingAgainstAI && socket && socket.connected) { socket.emit('leave_room'); } window.location.href = '../lobby/test_odalar.html'; } }); } else { console.error("leaveRoomBtn null idi!"); }
    if (restartGameBtn) { restartGameBtn.addEventListener('click', () => handleRestartGame(false)); } else { console.error("restartGameBtn null idi!"); }
    if (editRoomBtn) { editRoomBtn.addEventListener('click', openEditModal); } else { console.error("editRoomBtn null idi!"); }
    if (closeEditModalButton) { closeEditModalButton.addEventListener('click', () => hideModal(editRoomModal)); }
    window.addEventListener('click', (event) => { if (event.target == editRoomModal) hideModal(editRoomModal); });
    if (saveRoomChangesBtn) { saveRoomChangesBtn.addEventListener('click', saveRoomChanges); } else { console.error("saveRoomChangesBtn null idi!"); }
    if (deleteRoomConfirmBtn) { deleteRoomConfirmBtn.addEventListener('click', deleteRoom); } else { console.error("deleteRoomConfirmBtn null idi!"); }
    if (kickOpponentBtn) { kickOpponentBtn.addEventListener('click', handleKickOpponent); } else { console.error("kickOpponentBtn null idi!"); } // handleKickOpponent funksiyası düzəldilməlidir
    if (callSnowBtn) { callSnowBtn.addEventListener('click', handleCallSnow); } else { console.error("callSnowBtn null idi!"); } // handleCallSnow funksiyası düzəldildi
    if (diceCubeElement) { diceCubeElement.addEventListener('mousedown', handleMouseDown); diceCubeElement.addEventListener('touchstart', handleTouchStart, { passive: false }); } else { console.error("Zər kub elementi (diceCubeElement) tapılmadı!"); }
    console.log("Əsas UI listenerlarının əlavə edilməsi bitdi.");

}); // DOMContentLoaded Sonu - ƏN SONDA OLMALIDIR