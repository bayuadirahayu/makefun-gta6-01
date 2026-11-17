// Keyboard and mouse input, read once per frame and handed to the game as plain state.
// Keys are tracked by physical code (KeyW, not the letter) so layouts do not matter. The
// mouse orbits the camera by dragging; clicking the canvas asks for pointer lock, which makes
// the orbit smooth and is released by Esc. Actions are edge-triggered: takeActions() returns
// the actions pressed since the last call and clears them.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_PUNCH = 8;
export const ACTION_RELOAD = 16;
export const ACTION_MUTE = 32;

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  KeyE: ACTION_ENTER_CAR,
  KeyF: ACTION_PUNCH,
  KeyR: ACTION_RELOAD,
  KeyM: ACTION_MUTE,
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let locked = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) {
      actions |= action;
      event.preventDefault();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseMove(event) {
    if (locked) {
      mouseDX += event.movementX;
      mouseDY += event.movementY;
    } else if (mouseDown) {
      mouseDX += event.movementX;
      mouseDY += event.movementY;
    }
  }

  function onMouseDown(event) {
    if (event.button === 0) {
      mouseDown = true;
      held.add('Mouse0');
      if (document.pointerLockElement !== canvas) {
        try {
          canvas.requestPointerLock();
        } catch {
          // Pointer lock is a nicety; dragging still orbits without it.
        }
      }
    }
  }

  function onMouseUp(event) {
    if (event.button === 0) {
      mouseDown = false;
      held.delete('Mouse0');
    }
  }

  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }

  function onBlur() {
    held.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    /** WASD/arrows as a -1..1 pair: x is strafe/right, y is forward. */
    move() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      return { x, y };
    },
    /** True while Shift is held (sprint on foot). */
    sprint() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    /** True while Space is held (handbrake while driving). */
    handbrake() {
      return held.has('Space');
    },
    /** True while the left mouse button is held (fire the pistol). */
    firing() {
      return held.has('Mouse0');
    },
    /** Mouse orbit deltas since the last call, in pixels; consumed on read. */
    takeMouse() {
      const out = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return out;
    },
    /** Edge-triggered actions since the last call; consumed on read. */
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
    /** Drive straight to the menu: used by the shot stager, which never touches keys. */
    press(action) {
      actions |= action;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };
}
