// modules/helpers.js
import * as DOM from './domElements.js'; // Loading overlay üçün lazım ola bilər

// --- Yardımçı UI Funksiyaları ---
export function showModal(modal) {
    const modalId = modal?.id || 'ID_YOXDUR';
    console.log(`[UI Helper] showModal çağırıldı: #${modalId}`);
    if (modal && modal instanceof HTMLElement) {
         modal.style.display = 'block';
         console.log(`[UI Helper] Modal #${modalId} göstərildi.`);
    } else {
         console.warn(`[UI Helper] showModal: Göstəriləcək modal elementi tapılmadı:`, modal);
    }
};

export function hideModal(modal) {
     const modalId = modal?.id || 'ID_YOXDUR';
     console.log(`[UI Helper] hideModal çağırıldı: #${modalId}`);
     if (modal && modal instanceof HTMLElement) {
          modal.style.display = 'none';
          console.log(`[UI Helper] Modal #${modalId} gizlədildi.`);
     }
};

export function showMsg(el, msg, type = 'info', duration = 4000) {
    const elementId = el?.id || 'ID_YOXDUR';
    console.log(`[UI Helper] showMsg: Elem=${elementId}, Msg="${msg}", Type=${type}`);
    if (el && el instanceof HTMLElement) {
         el.textContent = msg;
         el.className = 'message'; // Əvvəlki classları təmizlə
         el.classList.add(type);   // Yeni type classını əlavə et
         if (el.timeoutId) clearTimeout(el.timeoutId);
         if (duration > 0) {
             el.timeoutId = setTimeout(() => {
                 if (el.textContent === msg) {
                      el.textContent = '';
                      el.classList.remove(type);
                 }
             }, duration);
         }
    } else {
         console.error(`[UI Helper] showMsg: Mesaj göstəriləcək element tapılmadı! Elem=${el}, Msg="${msg}"`);
    }
};

export function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return String(unsafe);
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
};

// ---- URL Parametrlərini Alma Funksiyası ----
export function getUrlParams() {
    console.log("[Helper] getUrlParams funksiyası çağırıldı.");
    const params = new URLSearchParams(window.location.search);
    const roomIdParam = params.get('roomId');
    const roomNameParam = decodeURIComponent(params.get('roomName') || 'Adsız Otaq');
    const sizeParam = parseInt(params.get('size') || '3', 10);
    const validatedSize = isNaN(sizeParam) ? 3 : Math.max(3, Math.min(6, sizeParam)); // 3-6 arası

    const result = {
        roomId: roomIdParam,
        roomName: roomNameParam,
        size: validatedSize
    };
    if (!roomIdParam) console.error("[Helper] KRİTİK: URL-də 'roomId' parametri tapılmadı!");
    console.log("[Helper] Alınan URL parametrləri:", result);
    return result;
}

// ---- Yükləmə Ekranı Funksiyaları ----
export function showLoadingOverlay(text = 'Yüklənir...') {
    console.log(`[Helper] showLoadingOverlay: Text="${text}"`);
    if (DOM.gameLoadingOverlay) {
        const loadingTextElement = DOM.gameLoadingOverlay.querySelector('.game-loading-text');
        if (loadingTextElement) loadingTextElement.textContent = text;
        DOM.gameLoadingOverlay.classList.add('visible');
    } else {
        console.error("[Helper] gameLoadingOverlay elementi DOM-da tapılmadı!");
    }
};
export function hideLoadingOverlay() {
    console.log("[Helper] hideLoadingOverlay çağırıldı.");
    if (DOM.gameLoadingOverlay) {
        DOM.gameLoadingOverlay.classList.remove('visible');
    }
};

console.log("[Module Loaded] helpers.js");