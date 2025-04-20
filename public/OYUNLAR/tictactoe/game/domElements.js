// modules/domElements.js

// Əsas elementlər
export const gameLoadingOverlay = document.getElementById('game-loading-overlay');
export const roomNameDisplay = document.getElementById('room-name');
export const boardElement = document.getElementById('game-board');
export const turnIndicator = document.getElementById('turn-indicator');
export const gameStatusDisplay = document.getElementById('game-status');

// Oyunçu Panelləri
export const player1Info = document.getElementById('player-x-info');
export const player2Info = document.getElementById('player-o-info');
export const player1SymbolDisplay = document.getElementById('player-x-symbol');
export const player2SymbolDisplay = document.getElementById('player-o-symbol');
export const player1NameDisplay = document.getElementById('player-x-name');
export const player2NameDisplay = document.getElementById('player-o-name');

// Düymələr (YENİLƏNİB)
export const leaveRoomBtn = document.getElementById('leave-room-btn');
export const editRoomBtn = document.getElementById('edit-room-btn');
export const kickOpponentBtn = document.getElementById('kick-opponent-btn');
export const restartGameBtn = document.getElementById('restart-game-btn');
export const gameActionsDiv = document.querySelector('.game-actions');

// Effektlər
export const fireworksOverlay = document.getElementById('fireworks-overlay');
export const shatteringTextContainer = document.getElementById('shattering-text-container');

// Otaq Ayarları Modalı (YENİLƏNİB)
export const editRoomModal = document.getElementById('edit-room-modal');
// data-modal-id atributuna görə seçici düzəldildi
export const closeEditModalButton = editRoomModal?.querySelector('.close-button[data-modal-id="edit-room-modal"]');
export const saveRoomChangesBtn = document.getElementById('save-room-changes-btn');
export const deleteRoomConfirmBtn = document.getElementById('delete-room-confirm-btn');
export const editRoomMessage = document.getElementById('edit-room-message');
export const editRoomNameInput = document.getElementById('edit-room-name');
export const editRoomPasswordCheck = document.getElementById('edit-room-password-check');
export const editRoomPasswordInput = document.getElementById('edit-room-password');
export const editBoardSizeSelect = document.getElementById('edit-board-size');

// Zər Atma Modalı
export const diceRollModal = document.getElementById('dice-roll-modal');
export const diceInstructions = document.getElementById('dice-instructions');
export const diceScene = document.getElementById('dice-scene'); // <<< BU ƏLAVƏ OLUNDU
export const diceCubeElement = document.getElementById('dice-cube');
export const yourRollResultDisplay = document.getElementById('your-roll-result');
export const opponentRollResultDisplay = document.getElementById('opponent-roll-result');
export const yourRollBox = document.getElementById('your-roll-box');
export const opponentRollBox = document.getElementById('opponent-roll-box');

// Simvol Seçmə Modalı
export const symbolSelectModal = document.getElementById('symbol-select-modal');
export const symbolSelectTitle = document.getElementById('symbol-select-title');
export const symbolSelectMessage = document.getElementById('symbol-select-message');
export const symbolOptionsDiv = symbolSelectModal?.querySelector('.symbol-options');
export const symbolWaitingMessage = document.getElementById('symbol-waiting-message');
export const symbolButtons = symbolOptionsDiv ? Array.from(symbolOptionsDiv.querySelectorAll('.symbol-button')) : []; // Array.from əlavə olundu

// Bütün hüceyrələr (lövhə yaradılanda doldurulacaq)
let cells = [];
export function getCells() { return cells; }
export function setCells(newCells) { cells = newCells; }


// Bütün əsas elementlərin mövcudluğunu yoxlamaq üçün funksiya
export function checkDOM() {
    const essential = {
        gameLoadingOverlay, boardElement, turnIndicator, gameStatusDisplay,
        player1NameDisplay, player2NameDisplay, diceRollModal, symbolSelectModal,
        diceCubeElement,
        // Yeni əlavə olunan kritik elementləri bura əlavə etmək olar (əgər lazımdırsa)
        editRoomModal // Otaq ayarları modalının varlığı yoxlanılır
    };
    let allFound = true;
    console.log("[DOM Check V3] Checking MINIMAL essential elements...");
    for (const key in essential) {
        if (!essential[key]) {
            console.error(`[DOM Check V3] KRİTİK XƏTA: Vacib DOM Elementi tapılmadı: #${key}`);
            allFound = false;
        }
    }
    if (!allFound) {
         console.error("[DOM Check V3] Bəzi VACİB DOM elementləri tapılmadı! main.js tam işləməyəcək.");
    } else {
         console.log("[DOM Check V3] Minimal vacib DOM elementləri tapıldı.");
    }
    return allFound;
}

console.log("[Module Loaded] domElements.js (Yenilənmiş v4 - diceScene Added)");