// modules/socketHandler.js (LOGLAR ƏLAVƏ EDİLMİŞ VERSİYA)

// --- FUNKSIYA F0: İMPORTLAR ---
// DÜZGÜN İMPORTLAR:
import { io } from "/socket.io/socket.io.esm.min.js";
import * as State from './state.js';
import * as UIUpdater from './uiUpdater.js';
import * as ModalManager from './modalManager.js';
import * as Helpers from './helpers.js';
// ====================

let socket = null;

// --- FUNKSIYA F1: Əsas Bağlantı Funksiyası ---
export function setupGameSocketConnection() {
    // >> F1-L1: Funksiyanın başlanğıcı
    console.log("[CLIENT-DEBUG F1-L1] setupGameSocketConnection BAŞLADI.");

    const currentSocket = State.getState('socket');
    if (currentSocket && currentSocket.connected) {
        console.warn("[SocketHandler] Mövcud socket bağlantısı var idi, bağlanır...");
        currentSocket.disconnect();
    }
    State.setState('socket', null);

    const roomId = State.getState('currentRoomId');
    if (!roomId) {
        console.error("[SocketHandler] KRİTİK XƏTA: Socket bağlantısı üçün Otaq ID təyin edilməyib!");
        Helpers.showLoadingOverlay("Otaq ID tapılmadı!");
        setTimeout(() => { window.location.href = '/OYUNLAR/tictactoe/lobby/test_odalar.html'; }, 2000);
        return;
    }

    // >> F1-L2: Yeni bağlantı qurulur
    console.log(`[CLIENT-DEBUG F1-L2] ${roomId} otağı üçün yeni bağlantı qurulur...`);
    Helpers.showLoadingOverlay('Serverə qoşulunur...');

    try {
        socket = io({
            transports: ['websocket'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 10000,
        });
        State.setState('socket', socket);
        // >> F1-L3: Socket obyekti yaradıldı
        console.log("[CLIENT-DEBUG F1-L3] Socket.IO client obyekti yaradıldı və state-ə yazıldı.");

        // Listenerları qoşuruq
        attachBasicListeners(socket); // F4-ə gedir
        attachGameListeners(socket);  // F5-ə gedir

    } catch (socketError) {
        console.error("[SocketHandler] Socket.IO clientini başlatarkən xəta:", socketError);
        Helpers.hideLoadingOverlay();
        alert(`Real-time bağlantı qurularkən xəta baş verdi: ${socketError.message}`);
        window.location.href = '/OYUNLAR/tictactoe/lobby/test_odalar.html';
    }
    // >> F1-L4: Funksiyanın sonu
    console.log("[CLIENT-DEBUG F1-L4] setupGameSocketConnection TAMAMLANDI.");
}

// --- FUNKSIYA F2: Serverə Hazır Siqnalı Göndərmə ---
export function sendPlayerReady() {
    // >> F2-L1: Funksiyanın başlanğıcı
    console.log("[CLIENT-DEBUG F2-L1] sendPlayerReady BAŞLADI.");

    const socketInstance = State.getState('socket');
    const userInfo = State.getState('loggedInUser');
    const roomId = State.getState('currentRoomId');

    // Socketin bağlı olduğunu bir daha yoxlayaq
    if (socketInstance && socketInstance.connected && userInfo && roomId) {
        // >> F2-L2: Hazır siqnalı göndərilir
        console.log(`%c[CLIENT-DEBUG F2-L2] ---> EMIT: 'player_ready_in_room'. SocketID: ${socketInstance.id}, RoomID: ${roomId}`, 'color: orange; font-weight: bold;');
        socketInstance.emit('player_ready_in_room', { roomId: roomId });
    } else {
        // >> F2-L3: Hazır siqnalı göndərilə bilmədi
        console.error("[CLIENT-DEBUG F2-L3 ERROR] player_ready göndərilə bilmir!", {
             socketExists: !!socketInstance,
             isConnected: socketInstance?.connected,
             hasUserInfo: !!userInfo,
             hasRoomId: !!roomId
        });
        alert("Serverə hazır olduğunuzu bildirmək mümkün olmadı. Səhifəni yeniləyin.");
        Helpers.hideLoadingOverlay();
    }
     // >> F2-L4: Funksiyanın sonu
     console.log("[CLIENT-DEBUG F2-L4] sendPlayerReady TAMAMLANDI.");
}

// --- FUNKSIYA F3: Digər Göndərmə Funksiyaları ---
// ... (sendMakeMove, sendDiceRoll, sendSymbolChoice və digər göndərmə funksiyaları olduğu kimi qalır,
//      onlara log əlavə etməyə hələlik ehtiyac yoxdur) ...
export function sendMakeMove(index) {
    const socketInstance = State.getState('socket');
    if (socketInstance && socketInstance.connected) {
        console.log(`[SocketHandler] ---> EMIT: 'make_move'. Data: { index: ${index} }`);
        State.setState('isProcessingMove', true);
        UIUpdater.disableBoardInteraction();
        socketInstance.emit('make_move', { index: index });
        setTimeout(() => { if (State.getState('isProcessingMove')) { console.warn(`[SocketHandler] make_move (${index}) cavabı serverdən 5 saniyə ərzində gəlmədi...`); State.setState('isProcessingMove', false); if (State.getState('isMyTurn')) { UIUpdater.enableBoardInteraction(); } } }, 5000);
    } else { console.error("[SocketHandler ERROR] make_move göndərilə bilmir - socket bağlı deyil!"); alert("Serverlə bağlantı yoxdur."); }
}
export function sendDiceRoll(rollResult) {
    const socketInstance = State.getState('socket');
    if (socketInstance && socketInstance.connected) { console.log(`[SocketHandler] ---> EMIT: 'dice_roll_result'. Data: { roll: ${rollResult} }`); socketInstance.emit('dice_roll_result', { roll: rollResult }); }
    else { console.error("[SocketHandler ERROR] dice_roll_result göndərilə bilmir - socket bağlı deyil!"); }
}
export function sendSymbolChoice(symbol) {
    const socketInstance = State.getState('socket');
    if (socketInstance && socketInstance.connected) { console.log(`[SocketHandler] ---> EMIT: 'symbol_choice'. Data: { symbol: ${symbol} }`); socketInstance.emit('symbol_choice', { symbol: symbol }); ModalManager.showSymbolWaiting(); }
    else { console.error("[SocketHandler ERROR] symbol_choice göndərilə bilmir - socket bağlı deyil!"); alert("Serverlə bağlantı yoxdur."); }
}
export function sendRequestRestart() {
    const socketInstance = State.getState('socket');
    if (socketInstance && socketInstance.connected) { console.log("[SocketHandler] ---> EMIT: 'request_restart'"); socketInstance.emit('request_restart'); }
    else { console.error("[SocketHandler ERROR] request_restart göndərilə bilmir - socket bağlı deyil!"); }
}
export function sendAcceptRestart() {
    const socketInstance = State.getState('socket');
    if (socketInstance && socketInstance.connected) { console.log("[SocketHandler] ---> EMIT: 'accept_restart'"); socketInstance.emit('accept_restart'); }
    else { console.error("[SocketHandler ERROR] accept_restart göndərilə bilmir - socket bağlı deyil!"); }
}
export function sendDeclineRestart() {
    const socketInstance = State.getState('socket');
    if (socketInstance && socketInstance.connected) { console.log("[SocketHandler] ---> EMIT: 'decline_restart'"); socketInstance.emit('decline_restart'); }
    else { console.error("[SocketHandler ERROR] decline_restart göndərilə bilmir - socket bağlı deyil!"); }
}
export function sendLeaveRoom() {
    const socketInstance = State.getState('socket');
    if (socketInstance && socketInstance.connected) { console.log("[SocketHandler] ---> EMIT: 'leave_room'"); socketInstance.emit('leave_room'); }
    else { console.warn("[SocketHandler] Socket bağlı deyil, birbaşa yönləndirilir (leave_room)."); window.location.href = '/OYUNLAR/tictactoe/lobby/test_odalar.html'; }
}
export function sendUpdateRoomSettings(settingsData) {
    const socketInstance = State.getState('socket');
    if (socketInstance && socketInstance.connected) { console.log("[SocketHandler] ---> EMIT: 'update_room_settings'", settingsData); socketInstance.emit('update_room_settings', settingsData); }
    else { console.error("[SocketHandler ERROR] update_room_settings göndərilə bilmir - socket bağlı deyil!"); }
}
export function sendDeleteRoom(roomId) {
    const socketInstance = State.getState('socket');
    if (socketInstance && socketInstance.connected) { console.log(`[SocketHandler] ---> EMIT: 'delete_room'. Data: { roomId: ${roomId} }`); socketInstance.emit('delete_room', { roomId: roomId }); }
    else { console.error("[SocketHandler ERROR] delete_room göndərilə bilmir - socket bağlı deyil!"); }
}
export function sendKickOpponent(roomId) {
    const socketInstance = State.getState('socket');
    if (socketInstance && socketInstance.connected) { console.log(`[SocketHandler] ---> EMIT: 'kick_opponent'. Data: { roomId: ${roomId} }`); socketInstance.emit('kick_opponent', { roomId: roomId }); }
    else { console.error("[SocketHandler ERROR] kick_opponent göndərilə bilmir - socket bağlı deyil!"); }
}


// --- FUNKSIYA F4: Əsas Bağlantı Hadisə Dinləyiciləri ---
function attachBasicListeners(socketInstance) {
    console.log("[CLIENT-DEBUG F4-L1] attachBasicListeners BAŞLADI.");

    socketInstance.on('connect', () => {
        console.log(`%c[CLIENT-DEBUG F4-L2] >>> connect: Oyun serverinə qoşuldu! Socket ID: ${socketInstance.id}`, "color: lightgreen; font-weight: bold;");
        console.log("[CLIENT-DEBUG F4-L2] 'connect' hadisəsi baş verdi, öncə join_room emit ediləcək...");

        const roomId = State.getState('currentRoomId');
        const roomPass = State.getState('currentRoomPassword') || null;
        console.log(`[SocketHandler] ---> EMIT: 'join_room'. roomId=${roomId}, password=${roomPass}`);
        socketInstance.emit('join_room', { roomId, password: roomPass });
    });

    socketInstance.on('room_joined', (roomData) => {
        console.log("[CLIENT-DEBUG] <<< room_joined alındı:", roomData);
        Helpers.hideLoadingOverlay();
        sendPlayerReady();
    });
    socketInstance.on('disconnect', (reason) => {
        // >> F4-L3: 'disconnect' hadisəsi alındı
        console.error(`%c[CLIENT-DEBUG F4-L3] >>> disconnect BAŞ VERDİ! Reason: ${reason}.`, "color: red; font-weight: bold;");
        console.warn(`%c[CLIENT-DEBUG F4-L3] >>> disconnect: Serverlə bağlantı kəsildi! Səbəb: ${reason}`, "color: orange;");
        UIUpdater.handleDisconnectionUI();
        if (reason === 'io server disconnect' || reason === 'io client disconnect') { console.log("[SocketHandler] Server/client disconnect, no retry."); }
        else { console.log(`[SocketHandler] Disconnect səbəbi: ${reason}. Yenidən qoşulma cəhd ediləcək...`); Helpers.showLoadingOverlay('Bağlantı kəsildi, bərpa edilir...'); }
        State.setState('initialSetupComplete', false);
    });

    socketInstance.on('connect_error', (error) => {
         // >> F4-L4: 'connect_error' hadisəsi alındı
        console.error(`%c[CLIENT-DEBUG F4-L4] >>> connect_error: Qoşulma xətası! Səbəb: ${error.message}`, "color: red;", error);
        Helpers.hideLoadingOverlay();
        UIUpdater.handleConnectionErrorUI(`Serverə qoşulmaq mümkün olmadı: ${error.message}`);
        State.setState('initialSetupComplete', false);
        setTimeout(() => { window.location.href = '/OYUNLAR/tictactoe/lobby/test_odalar.html'; }, 3000);
    });

   socketInstance.on('reconnect', (attemptNumber) => {
        // >> F4-L5: 'reconnect' hadisəsi alındı
        console.log(`%c[CLIENT-DEBUG F4-L5] >>> reconnect: Uğurla yenidən qoşuldu! (Cəhd #${attemptNumber}) Socket ID: ${socketInstance.id}`, "color: lightblue;");
        Helpers.hideLoadingOverlay();
    });

   // ... (reconnect_attempt, reconnect_error, reconnect_failed, error, already_connected_elsewhere olduğu kimi qalır) ...
    socketInstance.on('reconnect_attempt', (attemptNumber) => { console.log(`[SocketHandler] Yenidən qoşulma cəhdi #${attemptNumber}...`); Helpers.showLoadingOverlay(`Bağlantı bərpa edilir (cəhd ${attemptNumber})...`); });
    socketInstance.on('reconnect_error', (error) => { console.error(`%c[SocketHandler] >>> reconnect_error: Yenidən qoşulma xətası! Səbəb: ${error.message}`, "color: red;"); Helpers.showLoadingOverlay(`Bağlantı xətası: ${error.message}. Cəhd davam edir...`); });
    socketInstance.on('reconnect_failed', () => { console.error('%c[SocketHandler] >>> reconnect_failed: Bütün yenidən qoşulma cəhdləri uğursuz oldu!', "color: red;"); Helpers.hideLoadingOverlay(); UIUpdater.handleConnectionErrorUI('Serverlə bağlantı bərpa edilə bilmədi!'); alert('Serverlə bağlantı bərpa edilə bilmədi...'); State.setState('initialSetupComplete', false); window.location.href = '/OYUNLAR/tictactoe/lobby/test_odalar.html'; });
    socketInstance.on('error', (error) => { console.error(`%c[SocketHandler] >>> error: Ümumi socket xətası! Səbəb: ${error.message || error}`, "color: red;", error); });
    socketInstance.on('already_connected_elsewhere', (data) => { const message = data?.message || 'Başqa cihazdan artıq qoşulmusunuz.'; console.warn(`%c[SocketHandler] <<< already_connected_elsewhere alındı: ${message}`, "color: red;", data); Helpers.hideLoadingOverlay(); socketInstance.disconnect(); alert(message + "\nLobiyə yönləndirilirsiniz."); State.setState('initialSetupComplete', false); window.location.href = '/OYUNLAR/tictactoe/lobby/test_odalar.html'; });

    // >> F4-L6: Funksiyanın sonu
    console.log("[CLIENT-DEBUG F4-L6] attachBasicListeners TAMAMLANDI.");
}

// --- FUNKSIYA F5: Oyuna Xas Hadisə Dinləyiciləri ---
function attachGameListeners(socketInstance) {
    // >> F5-L1: Funksiyanın başlanğıcı
    console.log("[CLIENT-DEBUG F5-L1] attachGameListeners BAŞLADI.");

    // ===== ƏSAS GAME STATE LISTENER =====
    socketInstance.on('game_state_update', (newState) => {
        // >> F5-L2: 'game_state_update' alındı
        console.log(`%c<<<<< [CLIENT-DEBUG F5-L2] game_state_update ALINDI! >>>>>`, 'background: #11a; color: #fff; font-size: 1.1em;');
        console.log(`      Phase: ${newState?.gamePhase}, BoardSize: ${newState?.boardSize}`);
        const isInitial = !State.getState('initialSetupComplete');
        console.log(`      Bu ilk update-dir? ${isInitial}`);
        // -----

        try {
            // >> F5-L3: State emalı başlayır
            console.log('[CLIENT-DEBUG F5-L3] State.processGameStateUpdate çağırılır...');
            State.processGameStateUpdate(newState);
            console.log('[CLIENT-DEBUG F5-L3] State.processGameStateUpdate tamamlandı.');
            // -----

            // >> F5-L4: UI yeniləməsi başlayır
            console.log('[CLIENT-DEBUG F5-L4] UIUpdater.renderUIBasedOnState çağırılır...');
            UIUpdater.renderUIBasedOnState();
            console.log('[CLIENT-DEBUG F5-L4] UIUpdater.renderUIBasedOnState tamamlandı.');
            // -----

            console.log(`%c[CLIENT-DEBUG F5-L5] game_state_update uğurla emal edildi.`, 'color: lightblue;');

            if (isInitial) {
                 // >> F5-L6: İlk update emal olundu, overlay gizlədilir
                 console.log("%c[CLIENT-DEBUG F5-L6] İlk update emal edildi. Loading overlay gizlədilir və initialSetupComplete=true edilir.", "color: yellow;");
                 Helpers.hideLoadingOverlay();
                 State.setState('initialSetupComplete', true);
                 console.log("%c[CLIENT-DEBUG F5-L6] Initial setup complete flag təyin edildi.", "color: yellow;");
                 // -----
            }

        } catch (error) {
             // >> F5-L7: 'game_state_update' emalında xəta
            console.error('%c[CLIENT-DEBUG F5-L7 KRİTİK XƏTA] game_state_update emal edilərkən xəta:', 'color: red; font-weight: bold;', error);
            console.error('      Xətaya səbəb olan state:', newState);
            UIUpdater.showPersistentGameStatus("Oyun vəziyyəti emal edilərkən xəta!", 'error');
             // -----
        }
    });

    // ... (digər oyun hadisələri: opponent_left_game, room_deleted_kick və s. olduğu kimi qalır) ...
     socketInstance.on('opponent_left_game', (data) => { console.log(`%c[SocketHandler] <<< opponent_left_game alındı:`, "color: orange;", data); try { State.handleOpponentLeft(data); UIUpdater.renderUIBasedOnState(); ModalManager.hideAllGameModals(); } catch (error) { console.error('%c[CRITICAL CLIENT ERROR] opponent_left_game emal edilərkən xəta:', 'color: red; font-weight: bold;', error); } });
     socketInstance.on('room_deleted_kick', (data) => { const message = data?.message || 'Otaq silindi/çıxarıldınız.'; console.warn(`%c[SocketHandler] <<< room_deleted_kick alındı: ${message}`, "color: red;", data); Helpers.hideLoadingOverlay(); socketInstance.disconnect(); alert(message + "\nLobiyə yönləndirilirsiniz."); State.setState('initialSetupComplete', false); window.location.href = '/OYUNLAR/tictactoe/lobby/test_odalar.html'; });
     socketInstance.on('force_redirect_lobby', (data) => { const message = data?.message || 'Otaqla bağlı problem yarandı.'; console.warn(`%c[SocketHandler] <<< force_redirect_lobby alındı: ${message}`, "color: red;", data); Helpers.hideLoadingOverlay(); socketInstance.disconnect(); alert(message + "\nLobiyə yönləndirilirsiniz."); State.setState('initialSetupComplete', false); window.location.href = '/OYUNLAR/tictactoe/lobby/test_odalar.html'; });
     socketInstance.on('invalid_move', (data) => { const message = data?.message || 'Keçərsiz hərəkət!'; console.warn(`%c[SocketHandler] <<< invalid_move alındı: ${message}`, "color: orange;", data); UIUpdater.showTemporaryGameStatus(`⚠️ ${message}`, 'warning', 2500); if (State.getState('isProcessingMove')) { State.setState('isProcessingMove', false); } if (State.getState('isMyTurn')) { UIUpdater.enableBoardInteraction(); } });
     socketInstance.on('game_error', (data) => { const message = data?.message || 'Oyunda naməlum xəta baş verdi.'; console.error(`%c[SocketHandler] <<< game_error alındı: ${message}`, "color: red;", data); UIUpdater.showPersistentGameStatus(`XƏTA: ${message}`, 'error'); UIUpdater.disableBoardInteraction(); UIUpdater.updateRestartButtonsUI(); ModalManager.hideAllGameModals(); });
     socketInstance.on('info_message', (data) => { const message = data?.message; if(message) { console.log(`%c[SocketHandler] <<< info_message alındı: ${message}`, "color: cyan;", data); UIUpdater.showTemporaryGameStatus(`ℹ️ ${message}`, 'info', 3500); } else { console.warn("[SocketHandler] <<< info_message: Boş mesaj alındı."); } });
     socketInstance.on('room_info', (roomInfo) => { console.log(`%c[SocketHandler] <<< room_info alındı:`, "color: magenta;", roomInfo); State.updateRoomData(roomInfo); UIUpdater.renderRoomInfo(); });
     socketInstance.on('update_room_settings_result', (result) => { console.log(`%c[SocketHandler] <<< update_room_settings_result alındı:`, "color: magenta;", result); ModalManager.handleUpdateSettingsResult(result); });
     socketInstance.on('restart_requested', (data) => { const requester = data?.username || 'Rəqib'; console.log(`%c[SocketHandler] <<< restart_requested alındı: Təklif edən=${requester}`, "color: yellow;", data); });

    // >> F5-L8: Funksiyanın sonu
    console.log("[CLIENT-DEBUG F5-L8] attachGameListeners TAMAMLANDI.");
}

// --- FUNKSIYA F6: Faylın sonundakı log ---
// >> F6-L1: Modul yüklənməsi
console.log("[CLIENT-DEBUG F6-L1] Modul yükləndi: socketHandler.js (Loglar Əlavə Edilmiş)");
// -----