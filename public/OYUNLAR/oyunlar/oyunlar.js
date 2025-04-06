document.addEventListener('DOMContentLoaded', () => {
    console.log("Oyunlar JS Başladı.");

    const welcomePlayerSpan = document.getElementById('welcome-player');

    // URL-dən playerName parametrini alaq
    const urlParams = new URLSearchParams(window.location.search);
    const playerName = urlParams.get('playerName');

    if (welcomePlayerSpan && playerName) {
        // Güvənlik üçün HTML-i təmizləyək (sadə variant)
        const escapedPlayerName = playerName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        welcomePlayerSpan.textContent = `Xoş gəldin, ${escapedPlayerName}!`;
    } else if (welcomePlayerSpan) {
        welcomePlayerSpan.textContent = 'Xoş gəldin, Qonaq!';
    }

    // Gələcəkdə oyunları dinamik yükləmək üçün kod bura əlavə oluna bilər
});
