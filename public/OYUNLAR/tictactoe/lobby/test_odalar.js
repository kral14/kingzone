// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Socket.IO + Session Auth (v7 - appendChild Fix Attempt + AI Room Fix + Disconnect Listener)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Test Odalar JS (v7 - appendChild Fix Attempt) Başladı.");

    // ... (loggedInUser, currentRooms, socket - əvvəlki kimi) ...
    // ===== GİRİŞ YOXLAMASI =====
    // ... (əvvəlki kimi) ...
    // ===========================
    // ... (loggedInUsername, DOM elementləri - əvvəlki kimi) ...

    // --- Yardımçı Funksiyalar ---
    // ... (showModal, hideModal, showMsg, escapeHtml, updateRuleDisplay, addPlayerHoverListeners - əvvəlki kimi) ...
    // --------------------------
    // --- Header İstifadəçi Məlumatları ---
    // ... (əvvəlki kimi) ...
    // -----------------------------
    // --- Başlanğıc UI ---
    // ... (əvvəlki kimi) ...
    // --------------------
    // --- Socket.IO Bağlantısı ---
    // ... (əvvəlki kimi, debug logları ilə) ...
    // --------------------------

    // --- Otaq Elementi Yaratma Funksiyası (YENİLƏNMİŞ - Sadələşdirilmiş appendChild) ---
    function createRoomElement(room) {
        console.log(`[createRoomElement] Başladı - Room ID: ${room?.id}, Name: ${room?.name}`);
        try {
            if (!room || typeof room !== 'object' || !room.id) {
                 console.error("[createRoomElement] XƏTA: Keçərsiz 'room' obyekti!", room);
                 return null; // Boş və ya etibarsız data üçün null qaytar
            }

            const li = document.createElement('li');
            li.className = `room-item ${room.isAiRoom ? 'ai-room' : ''}`;
            li.dataset.roomId = room.id;

            const displayPlayerCount = room.isAiRoom ? 1 : (room.playerCount || 0);
            const maxPlayers = 2;
            const boardSizeText = room.boardSize ? `${room.boardSize}x${room.boardSize}` : '3x3';
            const creatorUsername = room.isAiRoom ? "SNOW" : (room.creatorUsername || 'Naməlum');
            const roomName = escapeHtml(room.name || 'Adsız Otaq');
            const creatorText = `Qurucu: ${escapeHtml(creatorUsername)}`;
            const playerCountText = `${displayPlayerCount}/${maxPlayers}`;

            // innerHTML yerinə addım-addım quraq
            const line1Div = document.createElement('div'); line1Div.className = 'room-item-line1';

            const roomNameSpan = document.createElement('span'); roomNameSpan.className = 'room-name';
            const originalNameTextSpan = document.createElement('span'); originalNameTextSpan.className = 'display-text original-text'; originalNameTextSpan.textContent = roomName;
            const hoverNameTextSpan = document.createElement('span'); hoverNameTextSpan.className = 'display-text hover-text'; hoverNameTextSpan.textContent = creatorText;
            roomNameSpan.appendChild(originalNameTextSpan);
            roomNameSpan.appendChild(hoverNameTextSpan);
            roomNameSpan.addEventListener('mouseenter', () => roomNameSpan.classList.add('is-hovered'));
            roomNameSpan.addEventListener('mouseleave', () => roomNameSpan.classList.remove('is-hovered'));
            line1Div.appendChild(roomNameSpan);

            const statusDiv = document.createElement('div'); statusDiv.className = 'room-status';
            const sizeSpan = document.createElement('span'); sizeSpan.className = 'players'; sizeSpan.title = 'Lövhə Ölçüsü'; sizeSpan.textContent = boardSizeText; statusDiv.appendChild(sizeSpan);
            if (room.hasPassword) {
                const lockSpan = document.createElement('span'); lockSpan.className = 'lock-icon'; lockSpan.title = 'Şifrə ilə qorunur'; lockSpan.textContent = '🔒'; statusDiv.appendChild(lockSpan);
            }
            const countSpan = document.createElement('span'); countSpan.className = 'players'; countSpan.title = 'Oyunçular'; countSpan.textContent = playerCountText; statusDiv.appendChild(countSpan);
            line1Div.appendChild(statusDiv);
            li.appendChild(line1Div);

            const separatorDiv = document.createElement('div'); separatorDiv.className = 'room-item-separator'; li.appendChild(separatorDiv);

            const line2Div = document.createElement('div'); line2Div.className = 'room-item-line2';
            const playerDisplayDiv = document.createElement('div'); playerDisplayDiv.className = 'player-name-display';

            if (room.isAiRoom) {
                 const p1 = document.createElement('span'); p1.className = 'player1-name'; p1.textContent = '(Sən)';
                 const vs = document.createElement('span'); vs.innerHTML = ' <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-robot vs-icon" viewBox="0 0 16 16">...</svg> '; // SVG ikonu (qısaldılmış)
                 const p2 = document.createElement('span'); p2.className = 'player2-name'; p2.textContent = 'SNOW';
                 playerDisplayDiv.appendChild(p1);
                 playerDisplayDiv.appendChild(vs);
                 playerDisplayDiv.appendChild(p2);
            } else {
                // Normal otaq üçün elementləri yarat
                const p1Username = room.player1Username;
                const p2Username = room.player2Username;

                if (p1Username) { const p1 = document.createElement('span'); p1.className = 'player1-name'; p1.textContent = escapeHtml(p1Username); playerDisplayDiv.appendChild(p1); }
                else { const p1 = document.createElement('span'); p1.className = 'empty-slot'; p1.textContent = '(Boş)'; playerDisplayDiv.appendChild(p1); }

                if (p1Username || p2Username) { const vs = document.createElement('span'); vs.innerHTML = ' <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-swords vs-icon" viewBox="0 0 16 16">...</svg> '; playerDisplayDiv.appendChild(vs); } // Qılınc ikonu (qısaldılmış)

                if (p2Username) { const p2 = document.createElement('span'); p2.className = 'player2-name'; p2.textContent = escapeHtml(p2Username); playerDisplayDiv.appendChild(p2); }
                else if (p1Username) { const p2 = document.createElement('span'); p2.className = 'empty-slot'; p2.textContent = '(Boş)'; playerDisplayDiv.appendChild(p2); }

                if (!p1Username && !p2Username) { const empty = document.createElement('span'); empty.className = 'empty-slot'; empty.textContent = '(Otaq Boşdur)'; playerDisplayDiv.innerHTML = ''; playerDisplayDiv.appendChild(empty); }

                playerDisplayDiv.querySelectorAll('.player1-name, .player2-name').forEach(addPlayerHoverListeners);
            }
            line2Div.appendChild(playerDisplayDiv);
            li.appendChild(line2Div);

            li.addEventListener('click', () => handleRoomClick(room));

            console.log(`[createRoomElement] Uğurlu - Element yaradıldı:`, li);
            return li;
        } catch (error) {
             console.error(`[createRoomElement] XƏTA baş verdi - Room ID: ${room?.id}`, error);
             return null; // Xəta baş verərsə null qaytar
        }
    }
    // -----------------------------------------

    // --- Otaq Siyahısını Göstərmə (appendChild yoxlaması ilə) ---
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
                 console.log(`Lobby: Otaq ${index+1} üçün element yaradılır:`, room);
                 const li = createRoomElement(room); // Elementi yarat

                 if (li && li instanceof Node) { // Etibarlı elementdirsə
                     try {
                         console.log(`Lobby: Otaq ${room.id} üçün element əlavə edilir...`);
                         roomListContainer.appendChild(li); // Əlavə et
                         requestAnimationFrame(() => { setTimeout(() => { li.classList.add('entering'); }, index * 50); });
                     } catch (appendError) {
                           console.error(`Lobby: appendChild zamanı XƏTA - Otaq ID: ${room?.id}`, appendError, li);
                     }
                 } else {
                      console.error(`Lobby: createRoomElement etibarsız dəyər qaytardı - Otaq ID: ${room?.id}. Element əlavə edilmir. Qaytarılan dəyər:`, li);
                 }
             });
             checkIfRoomListEmpty(roomsToDisplay);
         }
          console.log("Lobby: displayRooms funksiyası bitdi.");
     }
    // --------------------------

    // ... (qalan kod: checkIfRoomListEmpty, handleRoomClick, redirectToLogin, Socket.IO listeners, DOM listeners - əvvəlki v6 kodu kimi) ...

}); // DOMContentLoaded Sonu