// modules/modalManager.js
import * as DOM from './domElements.js';
import * as State from './state.js';
import * as Helpers from './helpers.js';
import * as Config from './config.js';
import * as SocketHandler from './socketHandler.js'; // update_settings göndərmək üçün

// --- Modal Göstərmə/Gizlətmə ---
// Helpers.showModal ve Helpers.hideModal artıq mövcuddur

export function hideAllGameModals() {
    Helpers.hideModal(DOM.diceRollModal);
    Helpers.hideModal(DOM.symbolSelectModal);
    // Edit modalı ayrıca idarə olunsun
}

// --- Oyun Modallarını İdarə Etmə ---
export function updateGameModalsVisibility() {
    const state = State.getState('currentGameState');
    if (!state || typeof state !== 'object') return;

    // Zər Atma Modalı
    if (state.gamePhase === 'dice_roll' && !state.isGameOver) {
        updateDiceModalUI(); // Aşağıda təyin olunacaq
        Helpers.showModal(DOM.diceRollModal);
    } else {
        Helpers.hideModal(DOM.diceRollModal);
    }

    // Simvol Seçmə Modalı
    if (state.gamePhase === 'symbol_select' && !state.isGameOver) {
        updateSymbolSelectModalUI(); // Aşağıda təyin olunacaq
        Helpers.showModal(DOM.symbolSelectModal);
    } else {
        Helpers.hideModal(DOM.symbolSelectModal);
    }
}

// --- Zər Modalı UI Yeniləməsi ---
function updateDiceModalUI() {
    const state = State.getState('currentGameState');
    const myState = State.getState('myPlayerState');
    const opponentState = State.getState('opponentPlayerState');
    const isDiceRolling = State.getState('isDiceRolling'); // Bu state diceManager tərəfindən idarə olunmalıdır

    if (!state || !DOM.diceInstructions || !DOM.yourRollResultDisplay || !DOM.opponentRollResultDisplay || !DOM.yourRollBox || !DOM.opponentRollBox || !DOM.diceCubeElement) return;

    const isTie = state.statusMessage?.includes("Bərabərlik!");
    const myRoll = myState?.roll;
    const opponentRoll = opponentState?.roll;
    let instructionText = state.statusMessage || 'Zər atın...';
    let waiting = false;

    if (!isTie) {
        if (myRoll !== null && opponentRoll === null) {
            instructionText = `${Helpers.escapeHtml(opponentState?.username || 'Rəqib')} gözlənilir...`;
            waiting = true;
        } else if (myRoll === null && opponentRoll !== null) {
            instructionText = 'Zər atmaq növbəsi sizdədir.';
        } else if (myRoll === null && opponentRoll === null) {
            instructionText = 'İlk zəri atmaq üçün klikləyin/sürükləyin.';
        }
    }
    DOM.diceInstructions.textContent = instructionText;
    DOM.diceInstructions.className = 'instructions';
    if (waiting) DOM.diceInstructions.classList.add('waiting');
    if (instructionText.includes("Bərabərlik!")) DOM.diceInstructions.classList.add('tie-instruction');

    DOM.yourRollResultDisplay.textContent = myRoll ?? '?';
    DOM.opponentRollResultDisplay.textContent = opponentRoll ?? '?';

    DOM.yourRollBox.className = 'result-box';
    if (isTie) DOM.yourRollBox.classList.add('tie');
    else if (myRoll !== null && opponentRoll !== null && myRoll > opponentRoll) DOM.yourRollBox.classList.add('winner');

    DOM.opponentRollBox.className = 'result-box';
    if (isTie) DOM.opponentRollBox.classList.add('tie');
    else if (myRoll !== null && opponentRoll !== null && opponentRoll > myRoll) DOM.opponentRollBox.classList.add('winner');

    const canIRoll = !isDiceRolling && (myRoll === null || isTie);
    DOM.diceCubeElement.style.cursor = canIRoll ? 'grab' : 'not-allowed';
}

// --- Simvol Seçmə Modalı UI Yeniləməsi ---
function updateSymbolSelectModalUI() {
    const state = State.getState('currentGameState');
    const socketId = State.getState('socket')?.id;

    if (!state || !socketId || !DOM.symbolSelectModal || !DOM.symbolSelectTitle || !DOM.symbolSelectMessage || !DOM.symbolOptionsDiv || !DOM.symbolWaitingMessage) return;

    const amIPicker = state.symbolPickerSocketId === socketId;
    const pickerState = (state.player1?.socketId === state.symbolPickerSocketId) ? state.player1 : state.player2;
    const pickerName = pickerState?.username || '?';

    DOM.symbolSelectTitle.textContent = amIPicker ? "Simvol Seçin" : "Simvol Seçilir";
    DOM.symbolSelectMessage.textContent = amIPicker ? "Oyuna başlamaq üçün simvolunuzu seçin:" : `${Helpers.escapeHtml(pickerName)} simvol seçir...`;

    DOM.symbolOptionsDiv.style.display = amIPicker ? 'flex' : 'none';
    DOM.symbolButtons.forEach(button => { button.disabled = !amIPicker; });

    DOM.symbolWaitingMessage.style.display = amIPicker ? 'none' : 'block';
    if (!amIPicker) DOM.symbolWaitingMessage.textContent = `${Helpers.escapeHtml(pickerName)} simvol seçir...`;
}
export function showSymbolWaiting() { // Simvol seçildikdən sonra çağırıla bilər
     if (DOM.symbolSelectMessage) DOM.symbolSelectMessage.textContent = "Seçiminiz göndərildi...";
     if (DOM.symbolOptionsDiv) DOM.symbolOptionsDiv.style.display = 'none';
     if (DOM.symbolWaitingMessage) {
          DOM.symbolWaitingMessage.textContent = "Oyun başlayır...";
          DOM.symbolWaitingMessage.style.display = 'block';
     }
     DOM.symbolButtons.forEach(button => { button.disabled = true; });
}

// --- Otaq Ayarları Modalı ---
export function openEditModal() {
    console.log("[ModalManager] openEditModal çağırıldı.");
    const isCreator = State.getState('isCurrentUserCreator');
    const roomData = State.getState('currentRoomData');

    if (!isCreator) { alert("Yalnız otağı yaradan parametrləri dəyişə bilər."); return; }
    if (!roomData?.id) { alert("Otaq məlumatları hələ tam alınmayıb."); return; }
    if (!DOM.editRoomModal) { console.error("[ModalManager] openEditModal: editRoomModal elementi tapılmadı!"); return; }

    // Formu doldur (DOM elementləri domElements.js-dən gəlir)
    if (DOM.editRoomNameInput) DOM.editRoomNameInput.value = roomData.name || '';
    if (DOM.editRoomPasswordCheck) DOM.editRoomPasswordCheck.checked = roomData.hasPassword || false; // hasPassword serverdən gəlməlidir
    if (DOM.editRoomPasswordInput) {
        DOM.editRoomPasswordInput.value = '';
        DOM.editRoomPasswordInput.style.display = DOM.editRoomPasswordCheck?.checked ? 'block' : 'none';
    }
    if (DOM.editRoomPasswordCheck && DOM.editRoomPasswordInput) {
        DOM.editRoomPasswordCheck.onchange = () => { DOM.editRoomPasswordInput.style.display = DOM.editRoomPasswordCheck.checked ? 'block' : 'none'; };
    }
    if (DOM.editBoardSizeSelect) {
         const currentSize = State.getState('boardSize'); // State-dən al
         DOM.editBoardSizeSelect.value = currentSize.toString();
         // Oyun davam edərkən ölçü dəyişdirilə bilməz
         const gameState = State.getState('currentGameState');
         const gameInProgress = gameState?.gamePhase === 'playing' && !gameState.isGameOver;
         DOM.editBoardSizeSelect.disabled = gameInProgress;
    }
    if (DOM.editRoomMessage) { DOM.editRoomMessage.textContent = ''; DOM.editRoomMessage.className = 'message'; }
    if (DOM.saveRoomChangesBtn) DOM.saveRoomChangesBtn.disabled = false;
    if (DOM.deleteRoomConfirmBtn) DOM.deleteRoomConfirmBtn.disabled = false;

    Helpers.showModal(DOM.editRoomModal);
}

export function saveRoomChanges() { // Bu funksiya eventListeners.js-dən çağırılır
    console.log("[ModalManager] saveRoomChanges çağırıldı.");
    if (!DOM.editRoomModal || !State.getState('isCurrentUserCreator') || !State.getState('socket')?.connected) return;

    const newName = DOM.editRoomNameInput?.value.trim();
    const newHasPasswordChecked = DOM.editRoomPasswordCheck?.checked;
    const newBoardSize = parseInt(DOM.editBoardSizeSelect?.value || State.getState('boardSize').toString(), 10);
    let newPasswordValue = null;

    if (!newName || newName.length > 30) { Helpers.showMsg(DOM.editRoomMessage, 'Otaq adı boş və ya çox uzun ola bilməz (1-30).', 'error'); return; }
    if (newHasPasswordChecked) {
        if (!DOM.editRoomPasswordInput) { Helpers.showMsg(DOM.editRoomMessage, 'Şifrə sahəsi tapılmadı!', 'error'); return; }
        newPasswordValue = DOM.editRoomPasswordInput.value;
        if (!newPasswordValue) { Helpers.showMsg(DOM.editRoomMessage, 'Şifrəli otaq üçün şifrə daxil edilməlidir.', 'error'); return; }
        if (newPasswordValue.length < 2 || newPasswordValue.length > 20) { Helpers.showMsg(DOM.editRoomMessage, 'Şifrə 2-20 simvol olmalıdır.', 'error'); return; }
    }

    const settingsData = {
        roomId: State.getState('currentRoomId'),
        newName: newName,
        newPassword: newPasswordValue, // null və ya string olacaq
        newBoardSize: newBoardSize
    };

    Helpers.showMsg(DOM.editRoomMessage, 'Dəyişikliklər yadda saxlanılır...', 'info', 0);
    if(DOM.saveRoomChangesBtn) DOM.saveRoomChangesBtn.disabled = true;
    if(DOM.deleteRoomConfirmBtn) DOM.deleteRoomConfirmBtn.disabled = true;

    // SocketHandler vasitəsilə göndər
    SocketHandler.sendUpdateRoomSettings(settingsData); // Bu funksiya socketHandler.js-də olmalıdır

    // Timeout
    setTimeout(() => {
        if (DOM.saveRoomChangesBtn?.disabled) {
            console.warn("[ModalManager] update_room_settings cavabı serverdən gəlmədi.");
            Helpers.showMsg(DOM.editRoomMessage, 'Serverdən cavab gəlmədi.', 'error');
            if(DOM.saveRoomChangesBtn) DOM.saveRoomChangesBtn.disabled = false;
            if(DOM.deleteRoomConfirmBtn) DOM.deleteRoomConfirmBtn.disabled = false;
        }
    }, Config.SETTINGS_RESPONSE_TIMEOUT);
}

export function deleteRoom() { // Bu funksiya eventListeners.js-dən çağırılır
    console.log("[ModalManager] deleteRoom çağırıldı.");
    const isCreator = State.getState('isCurrentUserCreator');
    const roomId = State.getState('currentRoomId');
    const socketConnected = State.getState('socket')?.connected;
    const roomName = State.getState('currentRoomData')?.name || roomId;

    if (!isCreator || !roomId || !socketConnected) return;

    if (confirm(`'${Helpers.escapeHtml(roomName)}' otağını silmək istədiyinizə əminsiniz?`)) {
        Helpers.showMsg(DOM.editRoomMessage, 'Otaq silinir...', 'info', 0);
        if(DOM.saveRoomChangesBtn) DOM.saveRoomChangesBtn.disabled = true;
        if(DOM.deleteRoomConfirmBtn) DOM.deleteRoomConfirmBtn.disabled = true;
        SocketHandler.sendDeleteRoom(roomId); // socketHandler.js-də
    }
}

export function handleUpdateSettingsResult(result) { // socketHandler.js tərəfindən çağırılır
     if (!DOM.editRoomMessage || !DOM.saveRoomChangesBtn || !DOM.deleteRoomConfirmBtn) return;
     if (result.success) {
         Helpers.showMsg(DOM.editRoomMessage, result.message || 'Ayarlar yeniləndi!', 'success', 2500);
         setTimeout(() => { Helpers.hideModal(DOM.editRoomModal); }, 1800);
     } else {
         Helpers.showMsg(DOM.editRoomMessage, result.message || 'Ayarları yeniləmək olmadı.', 'error');
         DOM.saveRoomChangesBtn.disabled = false;
         DOM.deleteRoomConfirmBtn.disabled = false;
     }
}


// --- Oyun Sonu Effektləri ---
export function triggerShatterEffect(winnerMark) {
    console.log(`[ModalManager] triggerShatterEffect: Winner=${winnerMark}`);
    if (!DOM.fireworksOverlay || !DOM.shatteringTextContainer || !winnerMark || winnerMark === 'draw' || DOM.fireworksOverlay.classList.contains('visible')) {
         return;
    }
    clearShatteringText(); // Köhnəni təmizlə

    const myState = State.getState('myPlayerState');
    const opponentState = State.getState('opponentPlayerState');
    const isClientWinner = myState?.symbol === winnerMark;
    let winnerName = isClientWinner ? "Siz" : (opponentState?.username || winnerMark);
    const text = isClientWinner ? "Siz Qazandınız!" : `${Helpers.escapeHtml(winnerName)} Qazandı!`;

    const chars = text.split('');
    chars.forEach((char, index) => {
        const span = document.createElement('span');
        span.textContent = char === ' ' ? '\u00A0' : char;
        span.classList.add('shatter-char');
        span.style.setProperty('--char-index', index);
        DOM.shatteringTextContainer.appendChild(span);
    });

    DOM.fireworksOverlay.classList.add('visible');
    DOM.shatteringTextContainer.style.opacity = '1';

    setTimeout(() => {
        const spans = DOM.shatteringTextContainer.querySelectorAll('.shatter-char');
        let duration = Config.DEFAULT_SHATTER_DURATION_MS;
        let distance = Config.DEFAULT_SHATTER_DISTANCE_PX;
        try { duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(Config.SHATTER_DURATION_VAR).replace('s',''))*1000||duration; distance = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(Config.SHATTER_DISTANCE_VAR).replace('px',''))||distance; } catch(e){}

        spans.forEach((span) => {
            const angle = Math.random() * 360; const randDist = Math.random() * distance;
            const tx = Math.cos(angle * Math.PI / 180) * randDist; const ty = Math.sin(angle * Math.PI / 180) * randDist;
            const tz = (Math.random() - 0.5) * distance * 0.6; const rot = (Math.random() - 0.5) * 720;
            const delay = Math.random() * 0.2;
            span.style.setProperty('--tx',`${tx}px`); span.style.setProperty('--ty',`${ty}px`);
            span.style.setProperty('--tz',`${tz}px`); span.style.setProperty('--rot',`${rot}deg`);
            span.style.animationDelay = `${delay}s`;
            span.classList.add('animate');
        });
        setTimeout(hideFireworks, duration + 500);
    }, 100);
}

export function hideFireworks() {
    if (DOM.fireworksOverlay) DOM.fireworksOverlay.classList.remove('visible');
    if (DOM.shatteringTextContainer) {
        DOM.shatteringTextContainer.style.opacity = '0';
        setTimeout(clearShatteringText, 500);
    }
}

function clearShatteringText() {
    if (DOM.shatteringTextContainer) DOM.shatteringTextContainer.innerHTML = '';
}

console.log("[Module Loaded] modalManager.js");