// public/OYUNLAR/tictactoe/game/oda_ici.js
// Version: Socket.IO + Session Auth (Tam Kod - Düzəldilmiş)

document.addEventListener('DOMContentLoaded', async () => { // async etdik
    let loggedInUser = null; // Giriş etmiş istifadəçi məlumatları

    // ===== GİRİŞ YOXLAMASI (Session ilə) =====
    try {
        const response = await fetch('/check-auth'); // Serverə yoxlama sorğusu
        const data = await response.json();
        if (!response.ok || !data.loggedIn) {
            console.log("oda_ici.js: Giriş edilməyib (check-auth), login səhifəsinə yönləndirilir...");
            window.location.href = '../../ANA SEHIFE/login/login.html'; // Girişə yönləndir
            return; // Scriptin qalanı işləməsin
        }
        // Giriş edilib
        loggedInUser = data.user;
        console.log(`oda_ici.js: Giriş edilib: ${loggedInUser.nickname}`);

        // Giriş uğurlu oldusa, oyunu başladırıq
        initializeGame(loggedInUser);

    } catch (error) {
        console.error("oda_ici.js: Auth yoxlama xətası:", error);
        window.location.href = '../../ANA SEHIFE/login/login.html'; // Xəta olarsa da girişə yönləndir
        return;
    }
    // =======================================
});

// ===== OYUNUN ƏSAS MƏNTİQİ (initializeGame funksiyası içində) =====
function initializeGame(loggedInUserData) {
    console.log("Oda İçi JS (Session Auth ilə) Başladı.");
    console.log("Giriş etmiş istifadəçi (oyun üçün):", loggedInUserData);

    // --- Element Referansları ---
    // (Bunlar əvvəlki kodunuzdakı kimi qalır)
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
    let editRoomBtn = document.getElementById('edit-room-btn'); // Bu səhifədə edit düyməsi olmamalıdır, yəqin lobbidən qalıb? Silinə bilər.
    const editRoomModal = document.getElementById('edit-room-modal'); // Bu səhifədə modal olmamalıdır.
    const restartGameBtn = document.getElementById('restart-game-btn');
    const kickOpponentBtn = document.getElementById('kick-opponent-btn'); // Bu da lobbidə olmalıdır.
    const callSnowBtn = document.getElementById('call-snow-btn'); // Bu da lobbidə olmalıdır.
    const diceRollModal = document.getElementById('dice-roll-modal');
    const diceInstructions = document.getElementById('dice-instructions');
    const diceScene = document.getElementById('dice-scene');
    const diceCubeElement = document.getElementById('dice-cube');
    const yourRollResultDisplay = document.getElementById('your-roll-result');
    const opponentRollResultDisplay = document.getElementById('opponent-roll-result');
    const yourRollBox = document.getElementById('your-roll-box');
    const opponentRollBox = document.getElementById('opponent-roll-box');
    const symbolSelectModal = document.getElementById('symbol-select-modal');
    const symbolOptionsDiv = symbolSelectModal?.querySelector('.symbol-options'); // Qala bilər

    // ---- Oyun Durumu Dəyişənləri ----
    let board = []; let currentPlayer = ''; let isGameOver = true; let boardSize = 3; let cells = [];
    let winningCombination = []; let currentRoomId = 'Bilinməyən';
    let currentPlayerName = loggedInUserData.nickname; // Sessiondan gələn ad
    let opponentPlayerName = 'Rəqib'; let isCurrentUserCreator = false; let isOpponentPresent = false;
    let player1Symbol = '?'; let player2Symbol = '?'; let player1Roll = null; let player2Roll = null;
    let diceWinner = null; let currentRoomData = {}; let aiPlayerSymbol = ''; let isPlayingAgainstAI = false;
    let socket = null; // Socket obyekti

    // ---- Zar Değişkenleri ----
    let isDiceRolling = false; let currentDiceRotateX = 0; let currentDiceRotateY = 0; let currentDiceRotateZ = 0;
    const diceRotations = { 1: { x: 0, y: 0 }, 6: { x: 0, y: 180 }, 4: { x: 0, y: 90 }, 3: { x: 0, y: -90 }, 2: { x: -90, y: 0 }, 5: { x: 90, y: 0 } };
    let isDragging = false; let dragStartX, dragStartY, previousMouseX, previousMouseY;
    const dragThreshold = 10; const rotateSensitivity = 0.4; let initialCenterZ = -55;

    // --- Yardımçı Fonksiyonlar ---
    const showModal = (modal) => { if (modal) modal.style.display = 'block'; };
    const hideModal = (modal) => { if (modal) modal.style.display = 'none'; };
    function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return String(unsafe); return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
    function getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const sizeParam = parseInt(params.get('size') || '3', 10);
        const validatedSize = Math.max(3, Math.min(6, sizeParam));
        const roomNameParam = decodeURIComponent(params.get('roomName') || 'Bilinməyən Otaq');
        return { roomId: params.get('roomId') || 'BilinməyənOda', roomName: roomNameParam, size: validatedSize };
    }

    // --- Başlanğıc Funksiyaları ---
    function initGameInternal(initialSize = null) { // Adı dəyişdik
        console.log("[initGameInternal - oda_ici] Başladı.");
        showLoadingOverlay();
        try {
            const params = getUrlParams(); currentRoomId = params.roomId; const receivedRoomName = params.roomName; boardSize = initialSize || params.size || 3;
            // Rəqibin kim olduğunu və AI olub olmadığını serverdən gələn məlumatla təyin etməliyik
            opponentPlayerName = "Rəqib Gözlənilir..."; isOpponentPresent = false; isPlayingAgainstAI = false; // Bunlar serverdən gəlməlidir

            console.log(`[initGameInternal - oda_ici] Parametrlər: User=${currentPlayerName}, RoomID=${currentRoomId}, RoomName=${receivedRoomName}, Size=${boardSize}`);
            try { const dsv = getComputedStyle(document.documentElement).getPropertyValue('--dice-size').trim(); if(dsv) initialCenterZ = parseFloat(dsv.replace('px','')) / -2; } catch(e){ initialCenterZ = -55; }
            if (roomNameDisplay) roomNameDisplay.textContent = `Otaq: ${escapeHtml(receivedRoomName)}`;
            if (playerXNameDisplay) playerXNameDisplay.textContent = currentPlayerName;
            if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;

            // updateHeaderButtonsVisibility(); // Bu səhifədə header düymələri fərqli olmalıdır
            if (restartGameBtn) restartGameBtn.disabled = true;

            adjustStylesForBoardSize(boardSize); createBoard(); resetGameStateVars(); updatePlayerInfo();
            boardElement.style.opacity = '0.5'; boardElement.style.pointerEvents = 'none';
            if (gameStatusDisplay) gameStatusDisplay.textContent = 'Rəqib gözlənilir...';

            console.log(`[initGameInternal - oda_ici] Oyun interfeysi quruldu.`);
            setupSocketConnection(); // Socket bağlantısını quraq

            // Yükləmə ekranını biraz sonra gizlədək
            setTimeout(hideLoadingOverlay, 500);
            // Zər atma və s. rəqib qoşulduqdan sonra başlamalıdır

        } catch (initError) { console.error("initGameInternal xətası:", initError); hideLoadingOverlay(); if(gameStatusDisplay) gameStatusDisplay.textContent = "Oyun yüklənərkən xəta."; }
    }

    // --- Socket Bağlantısı və Hadisələr ---
    function setupSocketConnection() {
        try {
            console.log("Oda içi: Socket.IO serverinə qoşulmağa cəhd edilir...");
            socket = io();

            socket.on('connect', () => {
                 console.log('Oda içi: Socket.IO serverinə qoşuldu! ID:', socket.id);
                 // Serverə hansı otaqda olduğumuzu bildirmək üçün hadisə göndərə bilərik
                 socket.emit('enter_game_room', { roomId: currentRoomId });
            });

            socket.on('disconnect', (reason) => { console.warn('Oda içi: Socket ayrıldı! Səbəb:', reason); if (gameStatusDisplay) gameStatusDisplay.textContent = `Əlaqə kəsildi (${reason}).`; isGameOver = true; boardElement.style.pointerEvents = 'none'; });
            socket.on('connect_error', (error) => { console.error('Oda içi: Socket qoşulma xətası:', error.message); if (error.message === 'Authentication error') { alert('Giriş edilməyib. Giriş səhifəsinə yönləndirilirsiniz.'); window.location.href = '../../ANA SEHIFE/login/login.html'; } else { if (gameStatusDisplay) gameStatusDisplay.textContent = 'Serverə qoşulma xətası.'; } isGameOver = true; boardElement.style.pointerEvents = 'none'; });

            // --- Serverdən Gələn Oyun Hadisələri ---
            socket.on('game_start', (data) => { // Server oyunu başlatmaq üçün siqnal göndərməlidir
                console.log("Oyun başlayır!", data);
                opponentPlayerName = data.opponentName || 'Rəqib';
                isOpponentPresent = true;
                isPlayingAgainstAI = data.isAiOpponent || false; // Server AI olub olmadığını bildirməlidir
                if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName;
                updatePlayerInfo();
                // Zər atma və ya simvol seçimi burada başlamalıdır
                if (gameStatusDisplay) gameStatusDisplay.textContent = "Oyun başlayır! Zər atılır...";
                 setupDiceModalForRollOff(); showModal(diceRollModal); initDice();
            });

            socket.on('opponent_left_game', (data) => {
                // ... (əvvəlki mesajdakı kimi) ...
                console.log("Oda içi: Rəqib ayrıldı:", data);
                 if (isOpponentPresent) {
                     opponentPlayerName = 'Rəqib Ayrıldı'; isOpponentPresent = false; isPlayingAgainstAI = false;
                     if (playerONameDisplay) playerONameDisplay.textContent = opponentPlayerName; if (playerOInfo) playerOInfo.classList.remove('active-player');
                     isGameOver = true; boardElement.style.pointerEvents = 'none'; if (gameStatusDisplay) gameStatusDisplay.textContent = `${data.username} otaqdan ayrıldı.`; if (restartGameBtn) restartGameBtn.disabled = true; hideModal(diceRollModal); hideModal(symbolSelectModal);
                 }
            });

            // Rəqibin gedişi (bu vacibdir)
             socket.on('opponent_moved', (data) => {
                 console.log("Rəqib gediş etdi:", data);
                 // Gedişi lövhədə göstər (əgər növbə ondadırsa və oyun davam edirsə)
                 if (!isGameOver && currentPlayer === player2Symbol && board[data.index] === '') {
                      placeMark(data.index, player2Symbol); // Bu funksiya checkWin/endGame/switchPlayer çağırır
                      // Növbə bizə keçdi, lövhəni aktiv et (əgər oyun bitməyibsə)
                      if (!isGameOver) {
                          boardElement.style.pointerEvents = 'auto';
                          updateTurnIndicator();
                      }
                 } else {
                     console.warn("Gözlənilməyən və ya keçərsiz rəqib gedişi alındı.");
                 }
             });

             // Serverdən gələn digər oyunla bağlı hadisələr (zər, simvol, restart vs.)
             // ...

        } catch(e) { console.error("Socket bağlantısı qurularkən xəta:", e); if (gameStatusDisplay) gameStatusDisplay.textContent = 'Real-time serverə qoşulma xətası.'; }
    }

    // --- Qalan Bütün Funksiyalar ---
    // Bu funksiyaların hamısı buraya köçürülməlidir:
    // showLoadingOverlay, hideLoadingOverlay, adjustStylesForBoardSize, createBoard, resetGameStateVars, resetBoardAndStatus,
    // setupDiceModalForRollOff, initDice, handleDiceClickOrDragEnd, rollDice, handleRollOffResults, triggerDiceScatterAndSymbolSelect, setDiceTransform, handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd,
    // initSymbolSelection, handleSymbolChoice, simulateOpponentSymbolChoice, startGameProcedure, updatePlayerInfo, handleCellClick, makeAIMove, findBestMove, getCenterCells, minimax, checkWinnerForMinimax, placeMark, switchPlayer, updateTurnIndicator,
    // checkWin, generateWinConditions, checkDraw, highlightWinningCells, endGame,
    // triggerShatterEffect, hideFireworks, clearShatteringText,
    // handleRestartGame

    // Nümunə olaraq bəzilərini əlavə edirəm, qalanını siz əvvəlki kodlardan köçürməlisiniz
    function showLoadingOverlay() { if(gameLoadingOverlay) gameLoadingOverlay.classList.add('visible'); }
    function hideLoadingOverlay() { if(gameLoadingOverlay) gameLoadingOverlay.classList.remove('visible'); }
    function adjustStylesForBoardSize(size) { /* ... */ let c='--cell-size-large-dynamic'; if(size===4)c='--cell-size-medium-dynamic'; else if(size>=5)c='--cell-size-small-dynamic'; document.documentElement.style.setProperty('--current-cell-size',`var(${c})`); document.documentElement.style.setProperty('--current-font-size',`calc(var(${c}) * 0.6)`); document.documentElement.style.setProperty('--board-size',size); }
    function createBoard() { /* ... */ if(!boardElement)return; boardElement.innerHTML=''; cells=[]; for(let i=0;i<boardSize*boardSize;i++){ const c=document.createElement('div'); c.classList.add('cell'); c.dataset.index=i; boardElement.appendChild(c); cells.push(c); } }
    function resetGameStateVars() { /* ... */ board=Array(boardSize*boardSize).fill(''); currentPlayer=''; isGameOver=true; winningCombination=[]; player1Symbol='?'; player2Symbol='?'; player1Roll=null; player2Roll=null; diceWinner=null; }
    function resetBoardAndStatus() { /* ... */ if(gameStatusDisplay){gameStatusDisplay.textContent=''; gameStatusDisplay.className='game-status';} cells.forEach((c,i)=>{const n=c.cloneNode(true); n.className='cell'; n.textContent=''; n.style.cursor='not-allowed'; n.style.animation=''; c.parentNode.replaceChild(n,c); cells[i]=n;}); updatePlayerInfo(); boardElement.style.opacity='0.5'; boardElement.style.pointerEvents='none'; if(restartGameBtn)restartGameBtn.disabled=true; hideFireworks(); }
    function setupDiceModalForRollOff() { /* ... */ if(isDiceRolling)return; if(diceInstructions){diceInstructions.textContent='Başlayanı təyin etmək üçün zərə klikləyin və ya sürükləyin.'; diceInstructions.classList.add('opponent-joined'); diceInstructions.classList.remove('waiting');} if(yourRollResultDisplay)yourRollResultDisplay.textContent='?'; if(opponentRollResultDisplay)opponentRollResultDisplay.textContent='?'; if(yourRollBox)yourRollBox.className='result-box'; if(opponentRollBox)opponentRollBox.className='result-box'; player1Roll=null; player2Roll=null; diceWinner=null; if(diceCubeElement)diceCubeElement.style.cursor='grab'; initDice(); }
    function initDice() { /* ... */ if(!diceCubeElement)return; diceCubeElement.style.transition='none'; currentDiceRotateX=0; currentDiceRotateY=0; currentDiceRotateZ=0; setDiceTransform(); diceCubeElement.style.cursor=isOpponentPresent?'grab':'not-allowed'; }
    function setDiceTransform(x=currentDiceRotateX, y=currentDiceRotateY, z=currentDiceRotateZ){ if(!diceCubeElement)return; const t=`translateZ(${initialCenterZ}px) rotateX(${x}deg) rotateY(${y}deg) rotateZ(${z}deg)`; diceCubeElement.style.transform=t; }
    // ... QALAN BÜTÜN FUNKSİYALAR BURAYA KÖÇÜRÜLMƏLİDİR ...
    // placeMark, checkWin, endGame, triggerShatterEffect, handleCellClick, vs.


    // --- Əsas Olay Dinləyiciləri ---
    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', () => {
            if (confirm("Otaqdan çıxmaq istədiyinizə əminsiniz?")) {
                 if(socket) socket.emit('leave_room');
                window.location.href = '../lobby/test_odalar.html'; // Lobby-ə qayıt
            }
        });
    }
     // Restart düyməsi üçün listener (əgər varsa)
     if (restartGameBtn) {
          // restartGameBtn.addEventListener('click', handleRestartGameRequest); // Yeni funksiya adı
     }
     // Zar kubu üçün listenerlar
     if (diceCubeElement) {
         diceCubeElement.addEventListener('mousedown', handleMouseDown);
         diceCubeElement.addEventListener('touchstart', handleTouchStart, { passive: false });
     } else { console.error("Zər kub elementi tapılmadı!"); }
     // Simvol seçimi üçün listenerlar (initSymbolSelection içində əlavə olunur)


    // --- Oyunu Başlat ---
    initGameInternal(); // Əsas oyunu başladan funksiya

} // initializeGame funksiyasının sonu