// public/OYUNLAR/tictactoe/lobby/test_odalar.js
// Version: Socket.IO + Session Auth (v10 - Super Simple createRoomElement Debug)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Test Odalar JS (v10 - Super Simple Debug) Başladı.");

    // ... (loggedInUser, currentRooms, socket - əvvəlki kimi) ...
    // ===== GİRİŞ YOXLAMASI =====
    // ... (əvvəlki kimi) ...
    // ===========================
    // ... (loggedInUsername, DOM elementləri, Yardımçı funksiyalar (escapeHtml lazım olacaq), Header - əvvəlki kimi) ...
    // --- Socket.IO Bağlantısı ---
    // ... (əvvəlki kimi) ...
    // --------------------------

    // --- Otaq Elementi Yaratma Funksiyası (SUPER SADƏLƏŞDİRİLMİŞ) ---
    function createRoomElement(room) {
        console.log(`[createRoomElement - v10 Simple] Başladı - Room ID: ${room?.id}, Name: ${room?.name}`);
        try {
            if (!room || typeof room !== 'object' || !room.id) {
                 console.error("[createRoomElement - v10 Simple] XƏTA: Keçərsiz 'room' obyekti!", room);
                 return null;
            }

            // Sadəcə bir li elementi yaradırıq və içərisinə otağın adını yazırıq
            const li = document.createElement('li');
            li.style.border = "1px solid white"; // Görünməsi üçün müvəqqəti stil
            li.style.padding = "5px";
            li.style.marginBottom = "5px";
            li.textContent = `Otaq: ${escapeHtml(room.name || 'Adsız')} (ID: ${room.id}, AI: ${!!room.isAiRoom})`; // Əsas məlumatlar
             li.dataset.roomId = room.id; // ID-ni saxlayaq

             // <<< Klikləmə hadisəsini hələlik əlavə etmirik ki, sadə qalsın >>>
             // li.addEventListener('click', () => handleRoomClick(room));

            console.log(`[createRoomElement - v10 Simple] Element yaradıldı:`, li);
            return li; // Sadə li elementini qaytar
        } catch (error) {
             console.error(`[createRoomElement - v10 Simple] XƏTA baş verdi - Room ID: ${room?.id}`, error);
             return null;
        }
    }
    // -----------------------------------------

    // --- Otaq Siyahısını Göstərmə ---
    // (Əvvəlki v8/v9 kodu kimi qalır - içindəki debug logları ilə)
    function displayRooms(roomsToDisplay) {
         console.log("Lobby: displayRooms funksiyası çağırıldı. Otaq sayı:", roomsToDisplay?.length ?? 0);
         if (!roomListContainer) { console.error("roomListContainer tapılmadı!"); return; }
         roomListContainer.innerHTML = '';
         if (!Array.isArray(roomsToDisplay)) { console.error("displayRooms: roomsToDisplay massiv deyil!"); checkIfRoomListEmpty([]); return; }

         if (roomsToDisplay.length === 0) { checkIfRoomListEmpty([]); }
         else {
             if (infoMessageArea) { console.log("Lobby: Otaqlar var, infoMessageArea gizlədilir."); infoMessageArea.style.display = 'none'; }
             else { console.warn("Lobby: infoMessageArea tapılmadı!"); }

             roomsToDisplay.forEach((room, index) => {
                 console.log(`Lobby: Otaq ${index+1} üçün element yaradılır:`, room);
                 const li = createRoomElement(room); // Sadə elementi yarat

                 if (li && li instanceof Node) {
                     try {
                         console.log(`Lobby: Otaq ${room.id} üçün element əlavə edilir...`);
                         roomListContainer.appendChild(li); // Əlavə et
                         // Animasiya hələlik lazım deyil
                         // requestAnimationFrame(() => { setTimeout(() => { li.classList.add('entering'); }, index * 50); });
                     } catch (appendError) {
                           console.error(`Lobby: appendChild zamanı XƏTA - Otaq ID: ${room?.id}`, appendError, li);
                     }
                 } else {
                      console.error(`Lobby: createRoomElement etibarsız dəyər qaytardı - Otaq ID: ${room?.id}. Element əlavə edilmir.`, li);
                 }
             });
             checkIfRoomListEmpty(roomsToDisplay);
         }
          console.log("Lobby: displayRooms funksiyası bitdi.");
     }
    // --------------------------

    // --- Otaq Siyahısı Boş Nəzarəti ---
    function checkIfRoomListEmpty(rooms) { /* ... */ }
    // --------------------------

    // --- Otağa Klikləmə (Sadələşdirilmiş elementlə işləməyəcək, amma qalsın) ---
    function handleRoomClick(room) { console.warn("handleRoomClick çağırıldı, amma elementlər sadə olduğu üçün klik işləməyəcək."); /* ... (əvvəlki v8 kodu kimi) ... */ }
    // -----------------------------------------------

    // ... (qalan kod: redirectToLogin, Socket.IO listeners, DOM listeners - əvvəlki v8/v9 kodu kimi) ...

}); // DOMContentLoaded Sonu