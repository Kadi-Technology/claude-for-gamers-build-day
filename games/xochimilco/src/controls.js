// Entrada: teclado (A/D ←/→ carril · W ↑ Espacio saltar · S ↓ Shift bucear), táctil por swipes y gamepad.
// Las acciones de juego se entregan con onAction('left'|'right'|'jump'|'dive'); el resto con onSystem('pause'|'mute'|'confirm'|'back'|...).

const KEY_ACTION = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'dive',
  KeyS: 'dive',
  ShiftLeft: 'dive',
  ShiftRight: 'dive',
};

const SWIPE_PX = 26;

function isTypingTarget(t) {
  const n = t && t.tagName;
  return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || (t && t.isContentEditable === true);
}

function codeOf(e) {
  if (e.code) return e.code;
  // respaldo cuando el evento no trae `code`
  const k = e.key;
  if (k === ' ') return 'Space';
  if (k && k.length === 1) return 'Key' + k.toUpperCase();
  return k || '';
}

export function createControls({ onAction, onSystem, isPlaying, swipeTarget }) {
  const keys = { dive: false, left: false, right: false };

  // ---------------------------------------------------------------- teclado
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target)) {
      if (e.key === 'Enter') onSystem('enter-field');
      return;
    }
    const code = codeOf(e);
    const act = KEY_ACTION[code];
    const playing = isPlaying();
    if (act) {
      if (act === 'dive') keys.dive = true;
      if (playing) {
        e.preventDefault();
        if (!e.repeat) onAction(act);
      } else if (code !== 'Space') {
        // en menús las flechas mueven el foco; Espacio queda para el botón enfocado
        if (code.startsWith('Arrow')) e.preventDefault();
        if (!e.repeat) onSystem('nav-' + act);
      }
      return;
    }
    if (code === 'KeyP' || code === 'Escape') {
      if (!e.repeat) onSystem(code === 'Escape' ? 'back' : 'pause');
      return;
    }
    if (code === 'KeyM') {
      if (!e.repeat) onSystem('mute');
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (!e.repeat) onSystem('confirm', { kbd: true });
    }
  }
  function onKeyUp(e) {
    const code = codeOf(e);
    if (KEY_ACTION[code] === 'dive') keys.dive = false;
  }
  function onBlur() {
    keys.dive = false;
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // ---------------------------------------------------------------- táctil
  let touch = null;
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' || !isPlaying()) return;
    if (e.target && e.target.closest && e.target.closest('button,a,input')) return;
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      swipeTarget.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura de puntero */
    }
  }
  function onPointerMove(e) {
    if (!touch || e.pointerId !== touch.id || !isPlaying()) return;
    const dx = e.clientX - touch.x;
    const dy = e.clientY - touch.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) >= Math.abs(dy)) {
      onAction(dx < 0 ? 'left' : 'right');
      touch.x = e.clientX;
      touch.y = e.clientY;
    } else if (Math.abs(dy) >= SWIPE_PX) {
      onAction(dy < 0 ? 'jump' : 'dive');
      touch.x = e.clientX;
      touch.y = e.clientY;
    }
    e.preventDefault();
  }
  function onPointerUp(e) {
    if (touch && e.pointerId === touch.id) touch = null;
  }
  swipeTarget.addEventListener('pointerdown', onPointerDown);
  swipeTarget.addEventListener('pointermove', onPointerMove, { passive: false });
  swipeTarget.addEventListener('pointerup', onPointerUp);
  swipeTarget.addEventListener('pointercancel', onPointerUp);

  // ---------------------------------------------------------------- gamepad
  const prev = { left: false, right: false, jump: false, dive: false, start: false, a: false, b: false };
  let padOn = false; // hay un gamepad conectado
  function poll() {
    let pad = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected) {
          pad = pads[i];
          break;
        }
      }
    } catch {
      pad = null;
    }
    if (!pad) {
      padOn = false;
      return;
    }
    padOn = true;
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const cur = {
      left: btn(14) || ax < -0.55,
      right: btn(15) || ax > 0.55,
      jump: btn(0) || btn(12) || ay < -0.65,
      dive: btn(1) || btn(13) || ay > 0.65,
      start: btn(9),
      a: btn(0),
      b: btn(1),
    };
    const playing = isPlaying();
    if (playing) {
      if (cur.left && !prev.left) onAction('left');
      if (cur.right && !prev.right) onAction('right');
      if (cur.jump && !prev.jump) onAction('jump');
      if (cur.dive && !prev.dive) onAction('dive');
    } else {
      if (cur.left && !prev.left) onSystem('nav-left');
      if (cur.right && !prev.right) onSystem('nav-right');
      if (cur.jump && !prev.jump) onSystem('nav-jump');
      if (cur.dive && !prev.dive) onSystem('nav-dive');
      if (cur.a && !prev.a) onSystem('confirm');
      if (cur.b && !prev.b) onSystem('back');
    }
    if (cur.start && !prev.start) onSystem('pause');
    if (cur.dive) keys.dive = true;
    else if (prev.dive) keys.dive = false;
    Object.assign(prev, cur);
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    swipeTarget.removeEventListener('pointerdown', onPointerDown);
    swipeTarget.removeEventListener('pointermove', onPointerMove);
    swipeTarget.removeEventListener('pointerup', onPointerUp);
    swipeTarget.removeEventListener('pointercancel', onPointerUp);
  }

  return { keys, poll, dispose };
}
