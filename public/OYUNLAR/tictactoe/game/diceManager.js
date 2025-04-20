// modules/diceManager.js (v11 - Focused on Final State Accuracy)
import * as DOM from './domElements.js';
import * as State from './state.js';
import * as SocketHandler from './socketHandler.js';
import * as Config from './config.js';

// --- Variables ---
let currentDiceRotateX = 0;
let currentDiceRotateY = 0;
let currentDiceRotateZ = 0; // Keep Z rotation for potential future use
let initialCenterZ = -55; // Will be updated based on CSS
const diceRotations = { // Target rotations for each face
    1: { x: 0,   y: 0   }, 6: { x: 0,   y: 180 }, 3: { x: 0,   y: 90  },
    4: { x: 0,   y: -90 }, 2: { x: -90, y: 0   }, 5: { x: 90,  y: 0   }
};
let isDragging = false;
let dragStartX, dragStartY, previousMouseX, previousMouseY;
const dragThreshold = 15;
const rotateSensitivity = Config.DEFAULT_ROTATE_SENSITIVITY || 0.4;

// Animation Parameters
const THROW_HEIGHT = -90;
const PREP_TRANSLATE_Z = 15;
const TOTAL_DURATION_MS = Config.DEFAULT_ROLL_DURATION_MS || 2000;
const PREP_DURATION_RATIO = 0.1;
const THROW_DURATION_RATIO = 0.4;
const THROW_TIMING_FUNC = 'cubic-bezier(0.3, 0.7, 0.4, 1)';
const FALL_TIMING_FUNC = 'cubic-bezier(0.6, -0.28, 0.74, 0.05)';

// --- Functions ---

// Applies the transform style to the dice element
function setTransform(rotateX = currentDiceRotateX, rotateY = currentDiceRotateY, rotateZ = currentDiceRotateZ, translateY = 0, translateZOffset = 0) {
    // Store current values (might not be strictly necessary anymore but good practice)
    currentDiceRotateX = rotateX;
    currentDiceRotateY = rotateY;
    currentDiceRotateZ = rotateZ;
    if (DOM.diceCubeElement) {
        const finalTranslateZ = initialCenterZ + translateZOffset;
        // IMPORTANT: Use integer values for degrees to avoid potential browser rendering issues
        const rx = Math.round(rotateX);
        const ry = Math.round(rotateY);
        const rz = Math.round(rotateZ);
        const ty = Math.round(translateY);
        const tzo = Math.round(finalTranslateZ);

        const transformString = `translateY(${ty}px) translateZ(${tzo}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
        DOM.diceCubeElement.style.transform = transformString;
    }
}

// Updates the initial Z position based on CSS --dice-size
export function updateInitialCenterZ() {
     try {
          const diceSizeValue = getComputedStyle(document.documentElement).getPropertyValue('--dice-size').trim();
          initialCenterZ = parseFloat(diceSizeValue.replace('px','')) / -2;
          console.log(`[DiceManager] InitialCenterZ updated to: ${initialCenterZ} based on --dice-size: ${diceSizeValue}`);
     } catch(e) {
         initialCenterZ = -55;
         console.warn('[DiceManager] --dice-size CSS variable not found or invalid. Using fallback Z: -55px');
     }
     setTransform(); // Apply initial transform
}

// Resets the dice to its initial state (face 1 up)
export function initDice() {
    console.log("[DiceManager] initDice");
    if (!DOM.diceCubeElement) return;
    State.setState('isDiceRolling', false);
    DOM.diceCubeElement.style.transition = 'none'; // No transition during init
    const face1 = diceRotations[1];
    currentDiceRotateX = face1.x;
    currentDiceRotateY = face1.y;
    currentDiceRotateZ = 0; // Reset Z rotation
    updateInitialCenterZ(); // Apply transform
}

// Main dice roll animation function
export function rollDice() {
    console.log("%c[DiceManager] rollDice (v11 - Focus on Final State) called.", "color: green; font-weight: bold;");

    // === Validation Checks ===
    const gameState = State.getState('currentGameState');
    const myState = State.getState('myPlayerState');
    const isDiceRolling = State.getState('isDiceRolling');
    const socketConnected = State.getState('socket')?.connected;
    if (isDiceRolling || !gameState || gameState.gamePhase !== 'dice_roll' || gameState.isGameOver || !myState) {
        console.log("[DiceManager] Roll cancelled: Invalid state or already rolling."); return;
    }
    const isTieBreak = gameState.statusMessage?.includes("Bərabərlik!");
    if (myState.roll !== null && !isTieBreak) {
        console.log("[DiceManager] Roll cancelled: Already rolled (not tie-break)."); return;
    }
    if (!socketConnected || !DOM.diceCubeElement || !DOM.diceInstructions || !DOM.diceScene) {
        console.error("[DiceManager] Roll cancelled: Missing socket or DOM elements."); return;
    }
    // === ===

    State.setState('isDiceRolling', true);
    DOM.diceCubeElement.style.cursor = 'default';
    DOM.diceInstructions.textContent = 'Zər atılır...';
    DOM.diceInstructions.className = 'instructions';
    DOM.diceScene.classList.add('is-smoking');

    if (isTieBreak) { /* Clear results - code omitted for brevity */ }

    // === GET ACTUAL RESULT & SEND ===
    const localRollResult = Math.floor(Math.random() * 6) + 1;
    console.log(`%c[DiceManager] ***** ACTUAL ROLL RESULT: ${localRollResult} *****`, "background: yellow; color: black; font-weight: bold;");
    SocketHandler.sendDiceRoll(localRollResult);
    // === ===

    try {
        // Target face based on ACTUAL result
        const finalFace = diceRotations[localRollResult];
        if (!finalFace) throw new Error(`Invalid dice face calculation for result: ${localRollResult}`);

        // Calculate durations
        const prepDurationMs = TOTAL_DURATION_MS * PREP_DURATION_RATIO;
        const throwDurationMs = TOTAL_DURATION_MS * THROW_DURATION_RATIO;
        const fallDurationMs = TOTAL_DURATION_MS - prepDurationMs - throwDurationMs;

        // --- Stage 1: Preparation ---
        const prepRotateX = currentDiceRotateX - 10;
        const prepRotateY = currentDiceRotateY + Math.random() * 20 - 10;
        const prepRotateZ = Math.random() * 30 - 15;
        DOM.diceCubeElement.style.transition = `transform ${prepDurationMs}ms ease-out`;
        setTransform(prepRotateX, prepRotateY, prepRotateZ, 0, PREP_TRANSLATE_Z);

        // --- Stage 2: Throw Up ---
        setTimeout(() => {
            const throwRotationsX = 360 * (2 + Math.floor(Math.random() * 3)); // More spins
            const throwRotationsY = 360 * (2 + Math.floor(Math.random() * 3));
            const throwRotationsZ = 360 * (1 + Math.floor(Math.random() * 2));
            // Target rotation at the peak of the throw
            const targetThrowRotateX = prepRotateX + throwRotationsX; // Start from prep rotation
            const targetThrowRotateY = prepRotateY + throwRotationsY;
            const targetThrowRotateZ = prepRotateZ + throwRotationsZ;

            DOM.diceCubeElement.style.transition = `transform ${throwDurationMs}ms ${THROW_TIMING_FUNC}`;
            setTransform(targetThrowRotateX, targetThrowRotateY, targetThrowRotateZ, THROW_HEIGHT, 0); // Move to apex

            // --- Stage 3: Fall Down & Settle ---
            setTimeout(() => {
                // Calculate the final target rotation, adding *fewer* full spins
                // Ensure the base angles match the ACTUAL finalFace
                const finalTargetX = finalFace.x + 360 * (1 + Math.floor(Math.random()));
                const finalTargetY = finalFace.y + 360 * (1 + Math.floor(Math.random()));
                const finalTargetZ = 0; // Final Z rotation should be 0

                console.log(`[DiceManager] Stage 3: Falling. Target angles (with spins): x=${finalTargetX}, y=${finalTargetY}, z=${finalTargetZ}`);
                console.log(`[DiceManager] --> Based on finalFace for result ${localRollResult}: x=${finalFace.x}, y=${finalFace.y}`);

                DOM.diceCubeElement.style.transition = `transform ${fallDurationMs}ms ${FALL_TIMING_FUNC}`;
                setTransform(finalTargetX, finalTargetY, finalTargetZ, 0, 0); // Fall to ground, rotate to final face

                // --- Stage 4: Cleanup ---
                setTimeout(() => {
                    console.log(`[DiceManager] Stage 4: Cleanup. Ensuring final face is exactly ${localRollResult}.`);

                    if (DOM.diceCubeElement) {
                        // --- KEY FIX: Remove transition FIRST ---
                        DOM.diceCubeElement.style.transition = 'none';
                        // ---------------------------------------
                    }
                    if (DOM.diceScene) {
                         DOM.diceScene.classList.remove('is-smoking');
                    }

                    // --- KEY FIX: Apply EXACT final rotation (no extra spins) ---
                    currentDiceRotateX = finalFace.x;
                    currentDiceRotateY = finalFace.y;
                    currentDiceRotateZ = 0; // Ensure Z is zero
                    console.log(`[DiceManager Cleanup] Setting EXACT final transform: x=${currentDiceRotateX}, y=${currentDiceRotateY}, z=${currentDiceRotateZ}`);
                    setTransform(currentDiceRotateX, currentDiceRotateY, currentDiceRotateZ, 0, 0);
                    // --- ---

                    State.setState('isDiceRolling', false);
                    if (DOM.diceCubeElement) {
                         DOM.diceCubeElement.style.cursor = canIRollNow() ? 'grab' : 'not-allowed';
                    }
                     console.log("[DiceManager] Cleanup complete.");

                }, fallDurationMs + 50); // Allow fall transition to finish

            }, throwDurationMs); // After throw finishes

        }, prepDurationMs); // After prep finishes

    } catch (animError) {
         console.error("[DiceManager] rollDice animation error:", animError);
         // Reset state and UI in case of error
         State.setState('isDiceRolling', false);
         if (DOM.diceCubeElement) DOM.diceCubeElement.style.cursor = 'grab';
         if (DOM.diceInstructions) DOM.diceInstructions.textContent = 'Animation error!';
         if (DOM.diceScene) DOM.diceScene.classList.remove('is-smoking');
         initDice(); // Reset dice visual position
    }
}

// Helper to check if the player can roll
function canIRollNow() {
    const gameState = State.getState('currentGameState');
    const myState = State.getState('myPlayerState');
    const isDiceRolling = State.getState('isDiceRolling');
    if (isDiceRolling || !gameState || gameState.gamePhase !== 'dice_roll' || gameState.isGameOver || !myState) return false;
    const isTieBreak = gameState.statusMessage?.includes("Bərabərlik!");
    return (myState.roll === null || isTieBreak);
}


// --- Mouse/Touch Event Handlers (No changes needed here from v10) ---
export function handleMouseDown(event) {
    if (event.button !== 0 || State.getState('isDiceRolling') || !canIRollNow()) return;
    if(DOM.diceScene) DOM.diceScene.classList.remove('is-smoking');
    if(DOM.diceCubeElement) DOM.diceCubeElement.style.transition = 'none';
    isDragging = false;
    dragStartX = event.clientX; dragStartY = event.clientY;
    previousMouseX = event.clientX; previousMouseY = event.clientY;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}
export function handleMouseMove(event) {
    if (!isDragging) {
        if (Math.abs(event.clientX - dragStartX) > dragThreshold || Math.abs(event.clientY - dragStartY) > dragThreshold) {
            isDragging = true;
            if (DOM.diceCubeElement) DOM.diceCubeElement.style.cursor = 'grabbing';
        } else { return; }
    }
    const deltaX = event.clientX - previousMouseX;
    const deltaY = event.clientY - previousMouseY;
    currentDiceRotateY += deltaX * rotateSensitivity;
    currentDiceRotateX -= deltaY * rotateSensitivity;
    // Keep Z rotation as is during drag, or reset to 0? Let's keep it.
    setTransform(currentDiceRotateX, currentDiceRotateY, currentDiceRotateZ);
    previousMouseX = event.clientX;
    previousMouseY = event.clientY;
}
export function handleMouseUp(event) {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    if (DOM.diceCubeElement) {
        DOM.diceCubeElement.style.cursor = canIRollNow() ? 'grab' : 'not-allowed';
    }
    if (!isDragging && !State.getState('isDiceRolling') && canIRollNow()) {
        rollDice(); // Roll if it was a click
    }
    // If dragging, we might want to snap back or just leave it as is. Let's leave it.
    isDragging = false;
}

export function handleTouchStart(e) {
    if (State.getState('isDiceRolling') || e.touches.length !== 1 || !canIRollNow()) return;
    if(DOM.diceScene) DOM.diceScene.classList.remove('is-smoking');
    if(DOM.diceCubeElement) DOM.diceCubeElement.style.transition = 'none';
    isDragging = false;
    const touch = e.touches[0];
    dragStartX = touch.clientX; dragStartY = touch.clientY;
    previousMouseX = touch.clientX; previousMouseY = touch.clientY;
    DOM.diceCubeElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    DOM.diceCubeElement.addEventListener('touchend', handleTouchEnd);
    DOM.diceCubeElement.addEventListener('touchcancel', handleTouchEnd);
}
export function handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - previousMouseX;
    const deltaY = touch.clientY - previousMouseY;
    if (!isDragging) {
        if (Math.abs(touch.clientX - dragStartX) > dragThreshold || Math.abs(touch.clientY - dragStartY) > dragThreshold) {
            isDragging = true;
        }
    }
    if (isDragging) {
        currentDiceRotateY += deltaX * rotateSensitivity;
        currentDiceRotateX -= deltaY * rotateSensitivity;
        setTransform(currentDiceRotateX, currentDiceRotateY, currentDiceRotateZ);
    }
    previousMouseX = touch.clientX;
    previousMouseY = touch.clientY;
}
export function handleTouchEnd(e) {
    DOM.diceCubeElement.removeEventListener('touchmove', handleTouchMove);
    DOM.diceCubeElement.removeEventListener('touchend', handleTouchEnd);
    DOM.diceCubeElement.removeEventListener('touchcancel', handleTouchEnd);
    if (!isDragging && !State.getState('isDiceRolling') && canIRollNow()) {
        rollDice(); // Roll if it was a tap
    }
    isDragging = false;
}

console.log("[Module Loaded] diceManager.js (v11 - Focused on Final State)");