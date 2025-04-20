// main.js (v3 - Ready Signal Logic Moved to socketHandler)
import * as DOM from '/OYUNLAR/tictactoe/game/domElements.js';
import * as State from '/OYUNLAR/tictactoe/game/state.js';
import * as SocketHandler from '/OYUNLAR/tictactoe/game/socketHandler.js';
import * as UIUpdater from '/OYUNLAR/tictactoe/game/uiUpdater.js';
import * as Listeners from '/OYUNLAR/tictactoe/game/eventListeners.js';
import * as Helpers from '/OYUNLAR/tictactoe/game/helpers.js';
import * as DiceManager from '/OYUNLAR/tictactoe/game/diceManager.js';
// Lazım gələrsə ModalManager və Config də import edilə bilər

document.addEventListener('DOMContentLoaded', () => {
    console.log("[Main v3] DOMContentLoaded - Başladı.");

    // DOM elementlərinin mövcudluğunu yoxla
    if (!DOM.checkDOM()) {
        alert("Oyun interfeysi tam yüklənmədi. Səhifəni yeniləyin.");
        return;
    }

    // İlkin quraşdırma üçün asinxron funksiya
    async function initializeGame() {
        console.log("[Main v3] Autentifikasiya yoxlaması başlayır...");
        Helpers.showLoadingOverlay('Sessiya yoxlanılır...'); // Yükləmə ekranını göstər
        try {
            // Autentifikasiya yoxlaması
            const response = await fetch('/api/auth/check-auth');
            const data = await response.json();

            // Giriş edilməyibsə, loginə yönləndir
            if (!response.ok || !data.loggedIn || !data.user) {
                console.warn("[Main v3] Giriş edilməyib, login səhifəsinə yönləndirilir.");
                Helpers.hideLoadingOverlay(); // Yönləndirmədən əvvəl overlayı gizlət
                window.location.href = '/ana_sehife/login/login.html';
                return;
            }

            // Giriş uğurlu, state-i təyin et
            State.setState('loggedInUser', data.user);
            console.log(`[Main v3] Autentifikasiya UĞURLU: User=${State.getState('loggedInUser').nickname}`);

            // URL-dən parametrləri al
            const params = Helpers.getUrlParams();
            if (!params.roomId) {
                 console.error("[Main v3] URL-də roomId tapılmadı!");
                 alert("Otaq ID tapılmadı, lobiyə yönləndirilirsiniz.");
                 Helpers.hideLoadingOverlay();
                 window.location.href = '/OYUNLAR/tictactoe/lobby/test_odalar.html';
                 return;
            }
            // Otaq məlumatlarını state-də saxla
            State.setState('currentRoomId', params.roomId);
            State.setState('boardSize', params.size); // Lövhə ölçüsünü erkən təyin et
            State.updateMultipleStates({
                 currentRoomData: { id: params.roomId, name: params.roomName, boardSize: params.size }
            });
            if (DOM.roomNameDisplay) DOM.roomNameDisplay.textContent = `Otaq: ${Helpers.escapeHtml(params.roomName)}`;

            // --- State-də initialSetupComplete flag-ni false olaraq başlat ---
            State.setState('initialSetupComplete', false); // !!! DÜZƏLİŞ 1 !!!
            // ----------------------------------------------------------------------

            // İlkin UI elementlərini qur
            UIUpdater.initializeUI();
            DiceManager.initDice();
            Listeners.attachAllEventListeners(); // Listenerları qoş

            // --- Socket bağlantısını başlat (Callback olmadan) ---
            SocketHandler.setupGameSocketConnection(); // !!! DÜZƏLİŞ 2: Callback silindi !!!

            console.log("[Main v3] Socket bağlantısı və ilk state gözlənilir...");
            // Yükləmə ekranı artıq socketHandler.js içində gizlədiləcək

        } catch (error) {
            console.error("[Main v3] İlkin başlatma xətası:", error);
            Helpers.hideLoadingOverlay(); // Xəta baş verdikdə overlayı gizlət
            alert(`Oyun yüklənərkən xəta baş verdi: ${error.message}`);
            window.location.href = '/OYUNLAR/tictactoe/lobby/test_odalar.html';
        }
    }

    // !!! DÜZƏLİŞ 3: onSocketReadyAndStateReceived funksiyası buradan silindi !!!

    // Quraşdırma prosesini başlat
    initializeGame();

}); // DOMContentLoaded Sonu

console.log("[Module Loaded] main.js (v3 - Ready Signal Logic Updated)");