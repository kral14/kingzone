// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Socket.IO + Session Auth (v6 - appendChild Debug + AI Fix + Disconnect)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Test Odalar JS (v6 - appendChild Debug) Başladı.");

    // ... (loggedInUser, currentRooms, socket - əvvəlki kimi) ...

    // ===== GİRİŞ YOXLAMASI =====
    // ... (əvvəlki kimi) ...
    // ===========================

    // ... (loggedInUsername, DOM elementləri, Yardımçı funksiyalar, Header - əvvəlki kimi) ...

    // --- Otaq Elementi Yaratma Funksiyası ---
    function createRoomElement(room) {
        console.log(`[createRoomElement] Başladı - Room ID: ${room?.id}, Name: ${room?.name}`); // <<< DEBUG
        try {
            const li = document.createElement('li');
            li.classList.add('room-item');
            // ID null və ya undefined ola bilməz, əmin olaq
            if (!room || !room.id) {
                 console.error("[createRoomElement] XƏTA: Keçərsiz room obyekti və ya room.id yoxdur!", room);
                 return null; // <<< Xətalı vəziyyətdə null qaytar
            }
            li.dataset.roomId = room.id;
            if (room.isAiRoom) { li.classList.add('ai-room'); }

            const displayPlayerCount = room.isAiRoom ? 1 : (room.playerCount || 0);
            const maxPlayers = 2;
            const boardSizeText = room.boardSize ? `${room.boardSize}x${room.boardSize}` : '3x3';
            const creatorUsername = room.isAiRoom ? "SNOW" : (room.creatorUsername || 'Naməlum');

            // Line 1
            const line1Div = document.createElement('div'); line1Div.className = 'room-item-line1';
            const roomNameSpan = document.createElement('span'); roomNameSpan.className = 'room-name';
            roomNameSpan.innerHTML = `<span class="display-text original-text">${escapeHtml(room.name || 'Adsız Otaq')}</span><span class="display-text hover-text">Qurucu: ${escapeHtml(creatorUsername)}</span>`;
            roomNameSpan.addEventListener('mouseenter', () => roomNameSpan.classList.add('is-hovered'));
            roomNameSpan.addEventListener('mouseleave', () => roomNameSpan.classList.remove('is-hovered'));
            line1Div.appendChild(roomNameSpan);

            const statusDiv = document.createElement('div'); statusDiv.className = 'room-status';
            statusDiv.innerHTML += `<span class="players" title="Lövhə Ölçüsü">${boardSizeText}</span>`;
            if (room.hasPassword) { statusDiv.innerHTML += `<span class="lock-icon" title="Şifrə ilə qorunur">🔒</span>`; }
            const playerCountText = `${displayPlayerCount}/${maxPlayers}`;
            statusDiv.innerHTML += `<span class="players" title="Oyunçular">${playerCountText}</span>`;
            line1Div.appendChild(statusDiv);
            li.appendChild(line1Div);

            // Separator
            const separatorDiv = document.createElement('div'); separatorDiv.className = 'room-item-separator'; li.appendChild(separatorDiv);

            // Line 2
            const line2Div = document.createElement('div'); line2Div.className = 'room-item-line2';
            const playerDisplayDiv = document.createElement('div'); playerDisplayDiv.className = 'player-name-display';

            if (room.isAiRoom) {
                playerDisplayDiv.innerHTML = `<span class="player1-name">(Sən)</span>
                                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-robot vs-icon" viewBox="0 0 16 16">...</svg>
                                              <span class="player2-name">SNOW</span>`;
            } else {
                if (room.player1Username) { playerDisplayDiv.innerHTML += `<span class="player1-name">${escapeHtml(room.player1Username)}</span>`; } else { playerDisplayDiv.innerHTML += `<span class="empty-slot">(Boş)</span>`; }
                if (room.player1Username || room.player2Username) { playerDisplayDiv.innerHTML += ` <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-swords vs-icon" viewBox="0 0 16 16">...</svg> `; }
                if (room.player2Username) { playerDisplayDiv.innerHTML += `<span class="player2-name">${escapeHtml(room.player2Username)}</span>`; } else if (room.player1Username) { playerDisplayDiv.innerHTML += `<span class="empty-slot">(Boş)</span>`; }
                if (!room.player1Username && !room.player2Username) { playerDisplayDiv.innerHTML = `<span class="empty-slot">(Otaq Boşdur)</span>`; }
                playerDisplayDiv.querySelectorAll('.player1-name, .player2-name').forEach(addPlayerHoverListeners);
            }
            line2Div.appendChild(playerDisplayDiv);
            li.appendChild(line2Div);

            li.addEventListener('click', () => handleRoomClick(room));

            console.log(`[createRoomElement] Uğurlu - Element yaradıldı:`, li); // <<< DEBUG
            return li; // Hər şey qaydasındadırsa li elementini qaytar
        } catch (error) {
             console.error(`[createRoomElement] XƏTA baş verdi - Room ID: ${room?.id}`, error);
             return null; // <<< Xəta baş verərsə null qaytar
        }
    }
    // -----------------------------------------

    // --- Otaq Siyahısını Göstərmə (YENİLƏNMİŞ - appendChild yoxlaması ilə) ---
    function displayRooms(roomsToDisplay) {
         console.log("Lobby: displayRooms funksiyası çağırıldı. Otaq sayı:", roomsToDisplay?.length ?? 0);
         if (!roomListContainer) { console.error("roomListContainer tapılmadı!"); return; }
         roomListContainer.innerHTML = '';
         if (!Array.isArray(roomsToDisplay)) { console.error("displayRooms: roomsToDisplay massiv deyil!"); checkIfRoomListEmpty([]); return; }

         if (roomsToDisplay.length === 0) {
             checkIfRoomListEmpty([]);
         } else {
             if (infoMessageArea) { console.log("Lobby: Otaqlar var, infoMessageArea gizlədilir."); infoMessageArea.style.display = 'none'; }
             else { console.warn("Lobby: infoMessageArea tapılmadı!"); }

             roomsToDisplay.forEach((room, index) => {
                 console.log(`Lobby: Otaq ${index+1} üçün element yaradılır:`, room); // <<< DEBUG
                 const li = createRoomElement(room); // Elementi yaratmağa cəhd et

                 // <<< YENİ YOXLAMA >>>
                 if (li && li instanceof Node) { // Əgər 'li' null deyilsə və Node tipindədirsə
                     try {
                         console.log(`Lobby: Otaq ${room.id} üçün element əlavə edilir...`); // <<< DEBUG
                         roomListContainer.appendChild(li); // Elementi əlavə et
                         // Animasiya
                         requestAnimationFrame(() => { setTimeout(() => { li.classList.add('entering'); }, index * 50); });
                     } catch (appendError) {
                           console.error(`Lobby: appendChild zamanı XƏTA - Otaq ID: ${room?.id}`, appendError, li); // <<< DEBUG
                     }
                 } else {
                      // Əgər createRoomElement null və ya etibarsız dəyər qaytardısa
                      console.error(`Lobby: createRoomElement etibarsız dəyər qaytardı - Otaq ID: ${room?.id}. Element əlavə edilmir. Qaytarılan dəyər:`, li); // <<< DEBUG
                 }
                 // <<< YOXLA SONU >>>
             });
             checkIfRoomListEmpty(roomsToDisplay);
         }
          console.log("Lobby: displayRooms funksiyası bitdi.");
     }
    // --------------------------

    // ... (qalan kod: checkIfRoomListEmpty, handleRoomClick, redirectToLogin, Socket.IO listeners, DOM listeners - əvvəlki v5 kodu kimi) ...
    // Xüsusilə 'disconnect' listenerinin qaldığından əmin olun!

}); // DOMContentLoaded Sonu