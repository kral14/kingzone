// modules/config.js - DÜZƏLİŞLİ İMPORT YOLLARI

// Düzəliş: Import yollarından "/modules/" seqmenti silinir.
// Yollar veb kökündən başlayır.
import * as State from '/OYUNLAR/tictactoe/game/state.js';
import * as SocketHandler from '/OYUNLAR/tictactoe/game/socketHandler.js';
// ... digər importlar (əgər varsa, onlar da düzəldilməlidir) ...

export const DEFAULT_BOARD_SIZE = 3;
export const MIN_BOARD_SIZE = 3;
export const MAX_BOARD_SIZE = 6;

// Timeout dəyərləri (client tərəfi)
export const MOVE_RESPONSE_TIMEOUT = 5000; // ms
export const SETTINGS_RESPONSE_TIMEOUT = 7000; // ms

// Animasiya və effektlər (CSS dəyişənlərinin adları)
export const DICE_ROLL_DURATION_VAR = '--roll-duration';
export const DICE_TIMING_FUNC_VAR = '--roll-timing-function';
export const SHATTER_DURATION_VAR = '--shatter-duration';
export const SHATTER_DISTANCE_VAR = '--shatter-distance';

// Default animasiya dəyərləri (CSS alınmadıqda istifadə üçün)
export const DEFAULT_ROLL_DURATION_MS = 2000;
export const DEFAULT_SHATTER_DURATION_MS = 3000;
export const DEFAULT_SHATTER_DISTANCE_PX = 170;

console.log("[Module Loaded] config.js (Paths Fixed)");