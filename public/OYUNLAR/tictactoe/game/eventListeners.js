// modules/eventListeners.js
import * as DOM from './domElements.js';
import * as State from './state.js';
import * as SocketHandler from './socketHandler.js';
import * as ModalManager from './modalManager.js';
import * as DiceManager from './diceManager.js';
import * as UIUpdater from './uiUpdater.js';
import * as Helpers from './helpers.js';

// --- Əsas Hadisə Dinləyicilərini Qoşma Funksiyası ---
export function attachAllEventListeners() {
    console.log("[EventListeners] Hadisə dinləyiciləri qoşulur...");

    // Ayrılma Düyməsi
    if (DOM.leaveRoomBtn) {
        DOM.leaveRoomBtn.addEventListener('click', handleLeaveRoom);
        console.log("[EventListeners] Listener qoşuldu: leaveRoomBtn");
    } else {
        console.warn("[EventListeners] leaveRoomBtn HTML-də tapılmadı!");
    }

    // Yenidən Başlat Düyməsi
    if (DOM.restartGameBtn) {
        DOM.restartGameBtn.addEventListener('click', handleRestartAction);
        console.log("[EventListeners] Listener qoşuldu: restartGameBtn");
    } else {
        console.warn("[EventListeners] restartGameBtn tapılmadı!");
    }

    // Rədd Et düyməsi üçün listener
    if (DOM.gameActionsDiv) {
         DOM.gameActionsDiv.addEventListener('click', (event) => {
             if (event.target && event.target.id === 'decline-restart-btn') {
                 handleDeclineRestartAction();
             }
         });
         console.log("[EventListeners] Dinamik decline düyməsi üçün listener gameActionsDiv-ə qoşuldu.");
    } else {
         console.warn("[EventListeners] gameActionsDiv tapılmadı (Decline düyməsi üçün)!");
    }

    // Otaq Ayarları Düyməsi (AKTİVLƏŞDİRİLDİ)
    if (DOM.editRoomBtn) {
        DOM.editRoomBtn.addEventListener('click', ModalManager.openEditModal);
        console.log("[EventListeners] Listener qoşuldu: editRoomBtn");
    } else {
        console.warn("[EventListeners] editRoomBtn HTML-də tapılmadı!");
    }

    // Rəqibi Çıxart Düyməsi (AKTİVLƏŞDİRİLDİ)
    if (DOM.kickOpponentBtn) {
       DOM.kickOpponentBtn.addEventListener('click', handleKickOpponentAction);
       console.log("[EventListeners] Listener qoşuldu: kickOpponentBtn");
    } else {
        console.warn("[EventListeners] kickOpponentBtn HTML-də tapılmadı!");
    }

    // Otaq Ayarları Modalı Düymələri (AKTİVLƏŞDİRİLDİ)
    if (DOM.saveRoomChangesBtn) {
        DOM.saveRoomChangesBtn.addEventListener('click', ModalManager.saveRoomChanges);
        console.log("[EventListeners] Listener qoşuldu: saveRoomChangesBtn");
    } else {
        console.warn("[EventListeners] saveRoomChangesBtn HTML-də tapılmadı!");
    }
    if (DOM.deleteRoomConfirmBtn) {
        DOM.deleteRoomConfirmBtn.addEventListener('click', ModalManager.deleteRoom);
        console.log("[EventListeners] Listener qoşuldu: deleteRoomConfirmBtn");
    } else {
        console.warn("[EventListeners] deleteRoomConfirmBtn HTML-də tapılmadı!");
    }
    if (DOM.closeEditModalButton) {
        DOM.closeEditModalButton.addEventListener('click', () => Helpers.hideModal(DOM.editRoomModal));
        console.log("[EventListeners] Listener qoşuldu: closeEditModalButton");
    } else {
         console.warn("[EventListeners] closeEditModalButton tapılmadı!");
    }

    // Modal Xaricinə Klikləmə
    window.addEventListener('click', handleWindowClickForModals);
    console.log("[EventListeners] Listener qoşuldu: window (modal xarici klik)");

    // Zər Sürükləmə/Klikləmə Dinləyiciləri
    if (DOM.diceCubeElement) {
        DOM.diceCubeElement.addEventListener('mousedown', DiceManager.handleMouseDown);
        DOM.diceCubeElement.addEventListener('touchstart', DiceManager.handleTouchStart, { passive: false });
        // document.addEventListener('mousemove', DiceManager.handleMouseMove); // <<< BU SƏTRİ SİLİN VƏ YA ŞƏRHƏ ALIN
        // document.addEventListener('mouseup', DiceManager.handleMouseUp); // <<< BU SƏTRİ SİLİN VƏ YA ŞƏRHƏ ALIN
        // Touch listenerları onsuz da diceManager.js içində dinamik olaraq əlavə edilib/qaldırılır.
        console.log("[EventListeners] Zər üçün mousedown/touchstart listenerlar qoşuldu (move/up dinamik olaraq əlavə olunur)."); // Log mesajını yenilədik
   } else {
       console.warn("[EventListeners] diceCubeElement tapılmadı!");
   }

    // Simvol Seçimi Düymələri
    if (DOM.symbolButtons && DOM.symbolButtons.length > 0) {
         DOM.symbolButtons.forEach(button => {
              button.addEventListener('click', handleSymbolChoiceAction);
         });
         console.log("[EventListeners] Simvol seçimi düymələrinə listenerlar qoşuldu.");
    } else {
         console.warn("[EventListeners] symbolButtons tapılmadı və ya boşdur!");
    }

    // Oyun Lövhəsi Hüceyrələri üçün listener (Event Delegation ilə)
    if (DOM.boardElement) {
        DOM.boardElement.removeEventListener('click', handleCellClick);
        DOM.boardElement.addEventListener('click', handleCellClick);
        console.log("[EventListeners] Listener qoşuldu: boardElement (delegation)");
    } else {
         console.error("[EventListeners] Board Element (DOM.boardElement) tapılmadı!");
    }

    console.log("[EventListeners] Bütün listener qoşulmaları tamamlandı.");
}


// --- Hadisə Handler Funksiyaları ---

function handleLeaveRoom() {
    console.log("[Listener] 'Otaqdan Ayrıl' klikləndi.");
    if (confirm("Otaqdan çıxmaq istədiyinizə əminsiniz?")) {
        SocketHandler.sendLeaveRoom();
        Helpers.showLoadingOverlay("Otaqdan ayrılırsınız...");
        setTimeout(() => { window.location.href = '../lobby/test_odalar.html'; }, 1500);
    }
}

function handleRestartAction() {
    console.log("[Listener] Restart/Accept düyməsi klikləndi.");
    const state = State.getState('currentGameState');
    const socketId = State.getState('socket')?.id;
    if (!state || !socketId || state.gamePhase !== 'game_over') {
         console.warn("[Restart Action] Şərtlər ödənmir (phase, socketId). State:", state);
         return;
    }

    const amIRequester = state.restartRequestedBy === socketId;
    const isRequestPendingFromOpponent = state.restartRequestedBy && !amIRequester;

    if (isRequestPendingFromOpponent) {
        console.log("[Restart Action] Təklif qəbul edilir...");
        SocketHandler.sendAcceptRestart();
        if (DOM.gameStatusDisplay) DOM.gameStatusDisplay.textContent = "Yenidən başlatma qəbul edildi...";
        if (DOM.restartGameBtn) DOM.restartGameBtn.disabled = true;
        const declineBtn = DOM.gameActionsDiv?.querySelector('#decline-restart-btn');
        if(declineBtn) declineBtn.disabled = true;

    } else if (!state.restartRequestedBy) {
        console.log("[Restart Action] Təklif göndərilir...");
        SocketHandler.sendRequestRestart();
        if (DOM.gameStatusDisplay) DOM.gameStatusDisplay.textContent = "Yenidən başlatma təklifi göndərildi...";
         if (DOM.restartGameBtn) {
            DOM.restartGameBtn.disabled = true;
            DOM.restartGameBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Təklif Göndərildi`;
         }
    } else {
         console.log("[Restart Action] Artıq təklif göndərilib və ya başqa vəziyyət.");
    }
}

function handleDeclineRestartAction() {
     console.log("[Listener] Decline Restart düyməsi klikləndi.");
     SocketHandler.sendDeclineRestart();
     if (DOM.gameStatusDisplay) DOM.gameStatusDisplay.textContent = "Yenidən başlatma təklifi rədd edildi.";
     if(DOM.restartGameBtn) DOM.restartGameBtn.disabled = true;
     const declineBtn = DOM.gameActionsDiv?.querySelector('#decline-restart-btn');
     if(declineBtn) declineBtn.disabled = true;
}


function handleKickOpponentAction() {
    console.log("[Listener] Kick Opponent klikləndi.");
    const opponentName = State.getState('opponentPlayerState')?.username || "Rəqib";
    if (confirm(`${Helpers.escapeHtml(opponentName)}-i otaqdan çıxarmaq istədiyinizə əminsiniz?`)) {
         if (DOM.kickOpponentBtn) DOM.kickOpponentBtn.disabled = true;
         SocketHandler.sendKickOpponent(State.getState('currentRoomId'));
          setTimeout(() => { if(DOM.kickOpponentBtn?.disabled) DOM.kickOpponentBtn.disabled = false; }, 7000);
    }
}

function handleWindowClickForModals(event) {
    // Otaq ayarları modalı
    if (DOM.editRoomModal && event.target == DOM.editRoomModal) {
        Helpers.hideModal(DOM.editRoomModal);
    }
    // Zər və Simvol modalları avtomatik bağlanmamalıdır
}

function handleSymbolChoiceAction(event) {
    console.log("[Listener] Simvol seçimi klikləndi.");
    const clickedButton = event.target.closest('.symbol-button');
    if (!clickedButton) return;

    const chosenSymbol = clickedButton.dataset.symbol;
    const state = State.getState('currentGameState');
    const socketId = State.getState('socket')?.id;

    if (!chosenSymbol || (chosenSymbol !== 'X' && chosenSymbol !== 'O')) {
        console.warn("[Symbol Choice] Keçərsiz simvol:", chosenSymbol);
        return;
    }
    if (!state || state.gamePhase !== 'symbol_select' || state.isGameOver || socketId !== state.symbolPickerSocketId) {
         console.warn("[Listener] Simvol seçimi üçün uyğun olmayan vəziyyət.");
         return;
    }

    console.log(`[Symbol Choice] Seçilən simvol: ${chosenSymbol}. Göndərilir...`);
    SocketHandler.sendSymbolChoice(chosenSymbol);
}

// Oyun taxtasına klikləmə (Event Delegation ilə)
export function handleCellClick(event) {
     console.log(`%c[Listener] handleCellClick TRIGGERED (delegated)!`, 'color: green; font-weight: bold;');
     const clickedCell = event.target.closest('.cell');

     if (!clickedCell) { return; }
     const index = parseInt(clickedCell.dataset.index, 10);
     console.log(`[handleCellClick] Kliklənən xana indeksi: ${index}`);
     if (isNaN(index)) { console.error('[handleCellClick] XƏTA: Keçərsiz xana indeksi!'); return; }

     const state = State.getState('currentGameState');
     const isMyTurn = State.getState('isMyTurn');
     const isProcessingMove = State.getState('isProcessingMove');
     const isGameOver = State.getState('isGameOver');

     console.log(`[handleCellClick] Yoxlama: state? ${!!state}, phase='playing'? ${state?.gamePhase === 'playing'}, gameOver? ${isGameOver}, myTurn? ${isMyTurn}, empty? ${state?.board?.[index] === ''}, processing? ${isProcessingMove}`);

     if (!state || state.gamePhase !== 'playing' || isGameOver || !isMyTurn || typeof state.board?.[index] === 'undefined' || state.board[index] !== '' || isProcessingMove) {
         console.warn('[handleCellClick] Gediş üçün şərtlər ödənmədi. Gediş göndərilmir.');
          if (!isMyTurn && state?.gamePhase === 'playing' && !isGameOver) { UIUpdater.showTemporaryGameStatus("Rəqibin növbəsidir!", "warning", 1500); }
          else if (state?.board?.[index] !== '') { UIUpdater.showTemporaryGameStatus("Bu xana artıq doludur!", "warning", 1500); }
         return;
     }

     console.log(`%c[handleCellClick] Bütün şərtlər ödənildi. sendMakeMove çağırılır... Index: ${index}`, 'color: green; font-weight: bold;');
     SocketHandler.sendMakeMove(index);
}

console.log("[Module Loaded] eventListeners.js (Yenilənmiş v4 - Modal Listeners Aktiv)");