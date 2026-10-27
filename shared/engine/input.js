// Entrada unificada: teclado + ratón (apuntado) + Gamepad API + controles táctiles.
//
// Contrato (doc 03 §4):
//   createInput({ bindings }) -> { axis(), aim(), down(action), pressed(action), setBindings(b), poll() }
//   Acciones estándar: 'up','down','left','right','attack','ability1','ability2','slot1','slot2','slot3',
//                      'jump','dive','pause','mute','confirm','back'.
//
// Semántica:
//   poll()            se llama UNA vez al inicio de cada update(). Congela el estado de este tick.
//   down(a)           la acción está sostenida en este tick.
//   pressed(a)        flanco: pasó de suelta a pulsada desde el tick anterior. Una pulsación más corta que un frame
//                     (keydown + keyup entre dos polls) también cuenta, así que ninguna tecla se pierde.
//   axis()            {x, y} de movimiento, módulo <= 1 (diagonal del teclado normalizada). x: derecha +, y: ABAJO +.
//                     Prioridad: teclado > joystick táctil > stick izquierdo del gamepad.
//   aim()             vector unitario {x, y} de apuntado o null. Stick derecho si está activo; si no, ratón (solo si se movió
//                     hace menos de `mouseTimeoutMs`, 4 s por defecto, y hay origen); si no, null (el juego usa la mirada).
//   setAimOrigin(sx, sy)   origen del apuntado, en el MISMO espacio que el ratón: píxeles del canvas (el espacio de
//                     camera.worldToScreen cuando la vista es canvas.width x canvas.height). setAimOrigin(null) lo borra.
//   addTouchControls(layout)  crea joystick virtual + botones DOM SOLO en dispositivos táctiles (devuelve un handle; en
//                     escritorio no toca el DOM y el handle es inerte). layout: 'angel' | 'runner' | objeto
//                     { joystick, swipe, buttons:[{action,label,aria,group:'main'|'slots'|'top'}], force, preset }.
//
// Bindings: { accion: ['KeyW', 'ArrowUp', ...] }. Cada entrada es un KeyboardEvent.code ('KeyY', 'Digit1', 'Space'),
// un botón de ratón ('Mouse0') o un solo carácter ('y') que se compara con event.key en minúsculas.
// Extras: released(a), getBindings(), device(), aimPoint(), resetAim(), destroy(), touchActive,
//         exports keyLabel(), loadBindings(), saveBindings(), DEFAULT_BINDINGS, ACTIONS, TOUCH_PRESETS.

import { load, save } from './storage.js';

export const ACTIONS = Object.freeze([
  'up', 'down', 'left', 'right',
  'attack', 'ability1', 'ability2',
  'slot1', 'slot2', 'slot3',
  'jump', 'dive',
  'pause', 'mute', 'confirm', 'back',
]);

export const DEFAULT_BINDINGS = Object.freeze({
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['KeyY'],
  ability1: ['KeyU'],
  ability2: ['KeyI'],
  slot1: ['Digit1', 'Numpad1'],
  slot2: ['Digit2', 'Numpad2'],
  slot3: ['Digit3', 'Numpad3'],
  jump: ['KeyW', 'ArrowUp', 'Space'],
  dive: ['KeyS', 'ArrowDown', 'ShiftLeft', 'ShiftRight'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  confirm: ['Enter', 'NumpadEnter'],
  back: ['Backspace'],
});

export const TOUCH_PRESETS = {
  angel: {
    joystick: true,
    buttons: [
      { action: 'attack', label: '⚔️', aria: 'Atacar', group: 'main' },
      { action: 'ability1', label: '🔔', aria: 'Campanazo', group: 'main' },
      { action: 'ability2', label: '💨', aria: 'Esquiva', group: 'main' },
      { action: 'slot1', label: '1', aria: 'Arma 1', group: 'slots' },
      { action: 'slot2', label: '2', aria: 'Arma 2', group: 'slots' },
      { action: 'slot3', label: '3', aria: 'Arma 3', group: 'slots' },
      { action: 'pause', label: '⏸', aria: 'Pausa', group: 'top' },
    ],
  },
  runner: {
    swipe: true,
    buttons: [{ action: 'pause', label: '⏸', aria: 'Pausa', group: 'top' }],
  },
};
TOUCH_PRESETS.xochimilco = TOUCH_PRESETS.runner;

const KEY_LABELS = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Espacio',
  Escape: 'Esc',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Backspace: 'Retroceso',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  Tab: 'Tab',
  Mouse0: 'Clic izq.',
  Mouse1: 'Clic central',
  Mouse2: 'Clic der.',
};

// Etiqueta legible de un binding para mostrar en pantalla ('KeyY' -> 'Y', 'ArrowUp' -> '↑').
export function keyLabel(entry) {
  const e = String(entry);
  if (KEY_LABELS[e]) return KEY_LABELS[e];
  let m = /^Key([A-Z])$/.exec(e);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(e);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(e);
  if (m) return 'Num ' + m[1];
  if (e.length === 1) return e.toUpperCase();
  return e;
}

function normEntries(v) {
  const arr = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  const out = [];
  for (const x of arr) {
    const s = String(x);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

// Bindings guardados por el usuario ('cfg.bindings') sobre los de fábrica.
export function loadBindings() {
  const saved = load('cfg.bindings', null);
  const out = {};
  for (const k of Object.keys(DEFAULT_BINDINGS)) out[k] = DEFAULT_BINDINGS[k].slice();
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(saved)) {
      const e = normEntries(saved[k]);
      if (e.length) out[k] = e;
    }
  }
  return out;
}

export function saveBindings(b) {
  return save('cfg.bindings', b);
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function isTextTarget(t) {
  const n = t && t.tagName;
  return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || (!!t && t.isContentEditable === true);
}

function isActivatable(t) {
  const n = t && t.tagName;
  return n === 'BUTTON' || n === 'A' || n === 'SUMMARY';
}

function interactiveTarget(t) {
  return !!(t && t.closest && t.closest('button, a, input, select, textarea, summary, [role="button"], .cfg-touch-btn'));
}

function isTouchDevice() {
  try {
    const q = new URLSearchParams(location.search).get('touch');
    if (q === '1') return true;
    if (q === '0') return false;
  } catch {
    // sin location
  }
  try {
    if (matchMedia('(pointer: coarse)').matches) return true;
    if (navigator.maxTouchPoints > 0 && !matchMedia('(any-pointer: fine)').matches) return true;
  } catch {
    // sin matchMedia
  }
  return false;
}

const DEADZONE = 0.2;
const AIM_DEADZONE = 0.35;
const PAD_DIR = 0.5;
const JOY_RADIUS = 56;
const SWIPE_MIN = 32;

const INERT_TOUCH = Object.freeze({
  active: false,
  root: null,
  destroy() {},
  setLabel() {},
  setActive() {},
  setVisible() {},
});

let current = null; // última entrada creada (para los exports de módulo)

export function createInput(opts = {}) {
  const dpadMode = opts.dpad === 'move' || opts.dpad === 'both' ? opts.dpad : 'slots';
  const mouseTimeoutMs = Number.isFinite(opts.mouseTimeoutMs) ? opts.mouseTimeoutMs : 4000;
  const aimTarget = opts.target || null;

  // ------------------------------------------------------------ bindings
  const bindings = {};
  let actionList = [];
  const byCode = new Map(); // code -> [acciones]
  const byChar = new Map(); // carácter -> [acciones]

  function rebuild() {
    actionList = Object.keys(bindings);
    byCode.clear();
    byChar.clear();
    for (const a of actionList) {
      for (const e of bindings[a]) {
        const map = e.length === 1 ? byChar : byCode;
        const key = e.length === 1 ? e.toLowerCase() : e;
        const list = map.get(key);
        if (list) {
          if (!list.includes(a)) list.push(a);
        } else {
          map.set(key, [a]);
        }
      }
    }
  }

  function setBindings(b) {
    if (b && typeof b === 'object') {
      for (const k of Object.keys(b)) bindings[k] = normEntries(b[k]);
    }
    rebuild();
  }

  function getBindings() {
    const out = {};
    for (const k of actionList) out[k] = bindings[k].slice();
    return out;
  }

  for (const k of Object.keys(DEFAULT_BINDINGS)) bindings[k] = DEFAULT_BINDINGS[k].slice();
  setBindings(opts.bindings);

  // ------------------------------------------------------------ estado por tick
  const keysDown = new Set();
  const charsDown = new Set();
  const codeToChar = new Map();
  const tap = Object.create(null); // pulsaciones (teclado/táctil) acumuladas desde el último poll
  const kbTap = Object.create(null); // lo mismo pero solo teclado/ratón (alimenta axis())
  const prevHeld = Object.create(null);
  const downNow = Object.create(null);
  const pressedNow = Object.create(null);
  const releasedNow = Object.create(null);
  const padHeld = Object.create(null);
  const touchCount = Object.create(null); // botones táctiles sostenidos por acción
  const joyHeld = Object.create(null); // direcciones digitales del joystick táctil
  let axX = 0;
  let axY = 0;
  let padX = 0;
  let padY = 0;
  let padAimX = 0;
  let padAimY = 0;
  let padAimOn = false;
  let joyX = 0;
  let joyY = 0;
  let lastDevice = 'keyboard';

  // ------------------------------------------------------------ ratón
  const mouse = { x: 0, y: 0, t: -1e9, seen: false };
  let origin = null;
  let lastCanvas = null;

  function canvasFor(e) {
    if (aimTarget) return aimTarget;
    const t = e && e.target;
    if (t && t.tagName === 'CANVAS') {
      lastCanvas = t;
      return t;
    }
    if (lastCanvas && lastCanvas.isConnected) return lastCanvas;
    if (typeof document !== 'undefined') {
      lastCanvas = document.querySelector('canvas');
      return lastCanvas;
    }
    return null;
  }

  function noteMouse(e) {
    const c = canvasFor(e);
    let x = e.clientX;
    let y = e.clientY;
    if (c && c.getBoundingClientRect) {
      const r = c.getBoundingClientRect();
      const w = c.width || r.width;
      const h = c.height || r.height;
      x = (e.clientX - r.left) * (w / (r.width || 1));
      y = (e.clientY - r.top) * (h / (r.height || 1));
    }
    mouse.x = x;
    mouse.y = y;
    mouse.t = now();
    mouse.seen = true;
  }

  function mouseActive() {
    return mouse.seen && now() - mouse.t < mouseTimeoutMs;
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch') {
      lastDevice = 'touch';
      return;
    }
    noteMouse(e);
    lastDevice = 'mouse';
  }

  function onMouseFallback(e) {
    // Navegadores sin Pointer Events
    noteMouse(e);
    lastDevice = 'mouse';
  }

  function onPointerButton(e, isDown) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const code = 'Mouse' + e.button;
    if (!isDown) {
      keysDown.delete(code);
      return;
    }
    noteMouse(e);
    const acts = byCode.get(code);
    if (!acts) return;
    if (isTextTarget(e.target) || interactiveTarget(e.target)) return;
    if (keysDown.has(code)) return;
    keysDown.add(code);
    for (const a of acts) {
      tap[a] = true;
      kbTap[a] = true;
    }
    lastDevice = 'mouse';
  }

  // ------------------------------------------------------------ teclado
  function shouldPrevent(code, e) {
    if (code.startsWith('Arrow')) return true;
    if (code === 'Space') return !isActivatable(e.target);
    if (code === 'Backspace') return true;
    return false;
  }

  // Algunos teclados virtuales y extensiones emiten eventos sin `code`: se usa el carácter como identificador.
  function codeOf(e, ch) {
    return e.code || (ch ? 'Char:' + ch : '');
  }

  function onKeyDown(e) {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTextTarget(e.target)) return;
    const ch = e.key && e.key.length === 1 ? e.key.toLowerCase() : null;
    const code = codeOf(e, ch);
    if (!code) return;
    const byC = byCode.get(code);
    const byK = ch ? byChar.get(ch) : undefined;
    if (!byC && !byK) return;
    if (shouldPrevent(code, e)) e.preventDefault();
    if (keysDown.has(code)) return; // autorepetición: ya estaba pulsada
    keysDown.add(code);
    if (ch) {
      charsDown.add(ch);
      codeToChar.set(code, ch);
    }
    if (byC) {
      for (const a of byC) {
        tap[a] = true;
        kbTap[a] = true;
      }
    }
    if (byK) {
      for (const a of byK) {
        tap[a] = true;
        kbTap[a] = true;
      }
    }
    lastDevice = 'keyboard';
  }

  function onKeyUp(e) {
    // Siempre se procesa (aunque el foco esté en un campo) para no dejar teclas atascadas.
    const code = codeOf(e, e.key && e.key.length === 1 ? e.key.toLowerCase() : null);
    if (!code) return;
    keysDown.delete(code);
    const ch = codeToChar.get(code);
    if (ch !== undefined) {
      charsDown.delete(ch);
      codeToChar.delete(code);
    }
  }

  function releaseAll() {
    keysDown.clear();
    charsDown.clear();
    codeToChar.clear();
  }

  function onVisibility() {
    if (typeof document !== 'undefined' && document.hidden) releaseAll();
  }

  function keyboardHeld(action) {
    const list = bindings[action];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.length === 1 ? charsDown.has(e.toLowerCase()) : keysDown.has(e)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ gamepad
  function readPad() {
    for (let i = 0; i < actionList.length; i++) padHeld[actionList[i]] = false;
    padX = 0;
    padY = 0;
    padAimX = 0;
    padAimY = 0;
    padAimOn = false;

    let gp = null;
    try {
      const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null;
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const g = list[i];
          if (g && g.connected) {
            gp = g;
            break;
          }
        }
      }
    } catch {
      gp = null;
    }
    if (!gp) return;

    const btn = (i) => {
      const b = gp.buttons[i];
      return !!b && (b.pressed || b.value > 0.5);
    };
    const axes = gp.axes || [];
    let any = false;

    const lx = axes[0] || 0;
    const ly = axes[1] || 0;
    const lm = Math.hypot(lx, ly);
    if (lm > DEADZONE) {
      const s = Math.min(1, (lm - DEADZONE) / (1 - DEADZONE));
      padX = (lx / lm) * s;
      padY = (ly / lm) * s;
      any = true;
    }
    const rx = axes[2] || 0;
    const ry = axes[3] || 0;
    const rm = Math.hypot(rx, ry);
    if (rm > AIM_DEADZONE) {
      padAimOn = true;
      padAimX = rx / rm;
      padAimY = ry / rm;
      any = true;
    }

    const dL = btn(14);
    const dU = btn(12);
    const dR = btn(15);
    const dD = btn(13);
    const dpadMove = dpadMode === 'move' || dpadMode === 'both';
    const dpadSlots = dpadMode === 'slots' || dpadMode === 'both';
    if (dpadMove && padX === 0 && padY === 0 && (dL || dU || dR || dD)) {
      const dx = (dR ? 1 : 0) - (dL ? 1 : 0);
      const dy = (dD ? 1 : 0) - (dU ? 1 : 0);
      const m = Math.hypot(dx, dy) || 1;
      padX = dx / m;
      padY = dy / m;
    }

    padHeld.left = padX < -PAD_DIR;
    padHeld.right = padX > PAD_DIR;
    padHeld.up = padY < -PAD_DIR;
    padHeld.down = padY > PAD_DIR;
    padHeld.attack = btn(2) || btn(7); // X / RT
    padHeld.ability1 = btn(4); // LB
    padHeld.ability2 = btn(5); // RB
    if (dpadSlots) {
      padHeld.slot1 = dL;
      padHeld.slot2 = dU;
      padHeld.slot3 = dR;
    }
    padHeld.jump = btn(0); // A
    padHeld.dive = btn(1); // B
    padHeld.pause = btn(9); // Start
    padHeld.mute = btn(8); // Back/Select
    padHeld.confirm = btn(0);
    padHeld.back = btn(1);

    for (let i = 0; i < gp.buttons.length && !any; i++) if (btn(i)) any = true;
    if (any) lastDevice = 'gamepad';
  }

  // ------------------------------------------------------------ poll
  function poll() {
    readPad();
    let kx = 0;
    let ky = 0;
    for (let i = 0; i < actionList.length; i++) {
      const a = actionList[i];
      const kb = keyboardHeld(a) || kbTap[a] === true;
      kbTap[a] = false;
      const held = kb || padHeld[a] === true || touchCount[a] > 0 || joyHeld[a] === true;
      const tapped = tap[a] === true;
      tap[a] = false;
      pressedNow[a] = tapped || (held && !prevHeld[a]);
      releasedNow[a] = !held && (prevHeld[a] === true || tapped);
      downNow[a] = held || tapped;
      prevHeld[a] = held;
      if (kb) {
        if (a === 'left') kx -= 1;
        else if (a === 'right') kx += 1;
        else if (a === 'up') ky -= 1;
        else if (a === 'down') ky += 1;
      }
    }

    if (kx !== 0 || ky !== 0) {
      const m = Math.hypot(kx, ky);
      axX = kx / m;
      axY = ky / m;
    } else if (joyX !== 0 || joyY !== 0) {
      axX = joyX;
      axY = joyY;
    } else {
      axX = padX;
      axY = padY;
    }
  }

  function aim() {
    if (padAimOn) return { x: padAimX, y: padAimY };
    if (origin && mouseActive()) {
      const dx = mouse.x - origin.x;
      const dy = mouse.y - origin.y;
      const d = Math.hypot(dx, dy);
      if (d >= 6) return { x: dx / d, y: dy / d };
    }
    return null;
  }

  function aimPoint() {
    return mouseActive() ? { x: mouse.x, y: mouse.y } : null;
  }

  function setAimOrigin(sx, sy) {
    if (sx === null || sx === undefined || !Number.isFinite(sx) || !Number.isFinite(sy)) {
      origin = null;
      return;
    }
    if (!origin) origin = { x: sx, y: sy };
    else {
      origin.x = sx;
      origin.y = sy;
    }
  }

  function resetAim() {
    mouse.seen = false;
    mouse.t = -1e9;
  }

  // ------------------------------------------------------------ táctil
  let touchHandle = null;

  function addTouchControls(layout = 'angel') {
    if (typeof document === 'undefined') return INERT_TOUCH;
    let cfg = layout;
    if (typeof cfg === 'string') cfg = TOUCH_PRESETS[cfg] || TOUCH_PRESETS.angel;
    else if (cfg && typeof cfg === 'object' && cfg.preset && TOUCH_PRESETS[cfg.preset]) {
      cfg = Object.assign({}, TOUCH_PRESETS[cfg.preset], cfg);
    }
    if (!cfg || typeof cfg !== 'object') cfg = TOUCH_PRESETS.angel;

    let urlForce = false;
    try {
      urlForce = new URLSearchParams(location.search).get('touch') === '1';
    } catch {
      urlForce = false;
    }
    const allowMouse = !!cfg.force || urlForce;
    if (!allowMouse && !isTouchDevice()) return INERT_TOUCH;

    if (touchHandle) touchHandle.destroy();
    ensureTouchStyle();

    const parent = cfg.parent || document.body;
    const root = document.createElement('div');
    root.className = 'cfg-touch';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Controles táctiles');
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    const cleanups = [];
    const buttons = new Map(); // acción -> elemento
    const groups = {};

    function groupEl(name) {
      if (!groups[name]) {
        const g = document.createElement('div');
        g.className = 'cfg-touch-group cfg-touch-g-' + name;
        root.appendChild(g);
        groups[name] = g;
      }
      return groups[name];
    }

    // --- botones
    const list = Array.isArray(cfg.buttons) ? cfg.buttons : [];
    const mainDefs = list.filter((b) => (b.group || 'main') === 'main');
    const mainSize = 88;
    const subSize = 66;
    const R = 112;

    list.forEach((def) => {
      const group = def.group || 'main';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cfg-touch-btn cfg-touch-b-' + group;
      btn.dataset.action = def.action;
      btn.textContent = def.label || '';
      btn.setAttribute('aria-label', def.aria || def.action);

      if (group === 'main') {
        const idx = mainDefs.indexOf(def);
        const size = idx === 0 ? mainSize : subSize;
        btn.style.width = size + 'px';
        btn.style.height = size + 'px';
        if (idx === 0) {
          btn.classList.add('cfg-touch-primary');
          btn.style.right = '0px';
          btn.style.bottom = '0px';
        } else {
          const others = mainDefs.length - 1;
          const deg = others === 1 ? 150 : 178 - (idx - 1) * (86 / (others - 1));
          const rad = (deg * Math.PI) / 180;
          const c = mainSize / 2; // centro del botón principal desde la esquina
          btn.style.right = Math.round(c - R * Math.cos(rad) - size / 2) + 'px';
          btn.style.bottom = Math.round(c + R * Math.sin(rad) - size / 2) + 'px';
        }
      }

      let pid = null;
      const press = (e) => {
        e.preventDefault();
        if (pid !== null) return;
        pid = e.pointerId;
        try {
          btn.setPointerCapture(pid);
        } catch {
          // el puntero ya no existe
        }
        touchCount[def.action] = (touchCount[def.action] || 0) + 1;
        tap[def.action] = true;
        btn.classList.add('on');
        lastDevice = 'touch';
      };
      const release = (e) => {
        if (pid === null || (e && e.pointerId !== undefined && e.pointerId !== pid)) return;
        pid = null;
        touchCount[def.action] = Math.max(0, (touchCount[def.action] || 0) - 1);
        btn.classList.remove('on');
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      cleanups.push(() => {
        if (pid !== null) {
          pid = null;
          touchCount[def.action] = Math.max(0, (touchCount[def.action] || 0) - 1);
        }
      });

      groupEl(group).appendChild(btn);
      buttons.set(def.action, btn);
    });

    // --- joystick flotante (mitad izquierda de la pantalla) y gestos de deslizamiento
    let joyId = null;
    let joyOx = 0;
    let joyOy = 0;
    let base = null;
    let thumb = null;
    if (cfg.joystick) {
      base = document.createElement('div');
      base.className = 'cfg-touch-joy';
      thumb = document.createElement('div');
      thumb.className = 'cfg-touch-thumb';
      base.appendChild(thumb);
      root.appendChild(base);
    }

    const sw = { id: null, x: 0, y: 0, t: 0, fired: false };

    function setJoy(dx, dy) {
      const len = Math.hypot(dx, dy);
      const k = len > JOY_RADIUS ? JOY_RADIUS / len : 1;
      const cx = dx * k;
      const cy = dy * k;
      thumb.style.transform = 'translate(-50%,-50%) translate(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px)';
      let nx = cx / JOY_RADIUS;
      let ny = cy / JOY_RADIUS;
      const m = Math.hypot(nx, ny);
      if (m < 0.12) {
        nx = 0;
        ny = 0;
      }
      joyX = nx;
      joyY = ny;
      joyHeld.left = nx < -0.45;
      joyHeld.right = nx > 0.45;
      joyHeld.up = ny < -0.45;
      joyHeld.down = ny > 0.45;
    }

    function endJoy() {
      joyId = null;
      joyX = 0;
      joyY = 0;
      joyHeld.left = joyHeld.right = joyHeld.up = joyHeld.down = false;
      if (base) base.classList.remove('on');
    }

    function onDown(e) {
      if (e.pointerType === 'mouse' && !allowMouse) return;
      if (interactiveTarget(e.target)) return;
      lastDevice = 'touch';
      if (cfg.joystick && joyId === null && e.clientX < window.innerWidth * 0.55) {
        joyId = e.pointerId;
        joyOx = e.clientX;
        joyOy = e.clientY;
        base.style.left = joyOx + 'px';
        base.style.top = joyOy + 'px';
        base.classList.add('on');
        setJoy(0, 0);
        return;
      }
      if (cfg.swipe && sw.id === null) {
        sw.id = e.pointerId;
        sw.x = e.clientX;
        sw.y = e.clientY;
        sw.t = now();
        sw.fired = false;
      }
    }

    function fire(actions) {
      for (const a of actions) tap[a] = true;
    }

    function onMove(e) {
      if (e.pointerId === joyId) {
        setJoy(e.clientX - joyOx, e.clientY - joyOy);
        return;
      }
      if (e.pointerId === sw.id && !sw.fired) {
        const dx = e.clientX - sw.x;
        const dy = e.clientY - sw.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
        sw.fired = true;
        if (Math.abs(dx) > Math.abs(dy)) fire([dx < 0 ? 'left' : 'right']);
        else fire(dy < 0 ? ['up', 'jump'] : ['down', 'dive']);
      }
    }

    function onUp(e) {
      if (e.pointerId === joyId) {
        endJoy();
        return;
      }
      if (e.pointerId === sw.id) {
        const dist = Math.hypot(e.clientX - sw.x, e.clientY - sw.y);
        if (!sw.fired && dist < 14 && now() - sw.t < 350) fire(['confirm']);
        sw.id = null;
      }
    }

    if (cfg.joystick || cfg.swipe) {
      window.addEventListener('pointerdown', onDown, { passive: true });
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp, { passive: true });
      window.addEventListener('pointercancel', onUp, { passive: true });
      cleanups.push(() => {
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        endJoy();
        sw.id = null;
      });
    }

    // Sin gestos nativos del navegador mientras se juega.
    const prevHtml = document.documentElement.style.touchAction;
    const prevBody = document.body ? document.body.style.touchAction : '';
    document.documentElement.style.touchAction = 'none';
    if (document.body) document.body.style.touchAction = 'none';
    cleanups.push(() => {
      document.documentElement.style.touchAction = prevHtml;
      if (document.body) document.body.style.touchAction = prevBody;
    });

    parent.appendChild(root);

    const handle = {
      active: true,
      root,
      destroy() {
        for (const fn of cleanups) fn();
        cleanups.length = 0;
        if (root.parentNode) root.parentNode.removeChild(root);
        if (touchHandle === handle) touchHandle = null;
      },
      setLabel(action, text) {
        const b = buttons.get(action);
        if (b) b.textContent = String(text);
      },
      setActive(action, on) {
        const b = buttons.get(action);
        if (b) b.classList.toggle('active', !!on);
      },
      setVisible(v) {
        root.style.display = v ? '' : 'none';
        if (!v) {
          endJoy();
          sw.id = null;
        }
      },
    };
    touchHandle = handle;
    return handle;
  }

  // ------------------------------------------------------------ ciclo de vida
  const onPointerDownBtn = (e) => onPointerButton(e, true);
  const onPointerUpBtn = (e) => onPointerButton(e, false);
  const hasPointer = typeof window !== 'undefined' && 'PointerEvent' in window;
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    if (hasPointer) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerdown', onPointerDownBtn, { passive: true });
      window.addEventListener('pointerup', onPointerUpBtn, { passive: true });
    } else {
      window.addEventListener('mousemove', onMouseFallback, { passive: true });
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  }

  function destroy() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseAll);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerDownBtn);
    window.removeEventListener('pointerup', onPointerUpBtn);
    window.removeEventListener('mousemove', onMouseFallback);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    if (touchHandle) touchHandle.destroy();
    if (current === api) current = null;
  }

  const api = {
    axis: () => ({ x: axX, y: axY }),
    aim,
    down: (a) => downNow[a] === true,
    pressed: (a) => pressedNow[a] === true,
    released: (a) => releasedNow[a] === true,
    setBindings,
    getBindings,
    poll,
    setAimOrigin,
    aimPoint,
    resetAim,
    addTouchControls,
    device: () => lastDevice,
    destroy,
    get touchActive() {
      return !!touchHandle;
    },
  };
  current = api;
  return api;
}

// --- Atajos a nivel de módulo: operan sobre la última entrada creada.
export function setAimOrigin(sx, sy) {
  if (current) current.setAimOrigin(sx, sy);
}

export function addTouchControls(layout) {
  return current ? current.addTouchControls(layout) : INERT_TOUCH;
}

// ------------------------------------------------------------ estilos táctiles
function ensureTouchStyle() {
  if (typeof document === 'undefined' || document.getElementById('cfg-touch-style')) return;
  const st = document.createElement('style');
  st.id = 'cfg-touch-style';
  st.textContent = [
    '.cfg-touch{position:fixed;inset:0;z-index:60;pointer-events:none;touch-action:none;-webkit-user-select:none;user-select:none}',
    '.cfg-touch-group{position:absolute;pointer-events:none}',
    '.cfg-touch-g-main{right:max(18px,env(safe-area-inset-right));bottom:max(22px,env(safe-area-inset-bottom));width:88px;height:88px}',
    '.cfg-touch-g-slots{left:50%;transform:translateX(-50%);bottom:max(12px,env(safe-area-inset-bottom));display:flex;gap:10px}',
    '.cfg-touch-g-top{right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top))}',
    '.cfg-touch-btn{pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent;display:grid;place-items:center;',
    'font:700 1.6rem/1 system-ui,sans-serif;color:var(--text,#f7f3ff);background:rgba(26,15,46,.62);',
    'border:2px solid rgba(255,159,28,.75);border-radius:50%;box-shadow:0 4px 14px rgba(0,0,0,.45);padding:0;cursor:pointer;',
    'transition:transform .08s,background .08s}',
    '.cfg-touch-b-main{position:absolute;font-size:1.9rem}',
    '.cfg-touch-primary{border-color:var(--magenta,#e0218a);background:rgba(224,33,138,.34);font-size:2.3rem}',
    '.cfg-touch-b-slots{position:relative;width:54px;height:54px;font-size:1.25rem;border-color:rgba(46,196,182,.8)}',
    '.cfg-touch-b-top{position:relative;width:46px;height:46px;font-size:1.2rem}',
    '.cfg-touch-btn.active{background:rgba(46,196,182,.4);border-color:var(--turquoise,#2ec4b6)}',
    '.cfg-touch-btn.on{transform:scale(.92);background:rgba(255,159,28,.5)}',
    '.cfg-touch-joy{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;opacity:0;',
    'background:rgba(247,243,255,.08);border:2px solid rgba(247,243,255,.35);transition:opacity .12s}',
    '.cfg-touch-joy.on{opacity:1}',
    '.cfg-touch-thumb{position:absolute;left:50%;top:50%;width:52px;height:52px;border-radius:50%;',
    'background:rgba(255,159,28,.7);border:2px solid rgba(255,255,255,.7);transform:translate(-50%,-50%)}',
    '@media (prefers-reduced-motion:reduce){.cfg-touch-btn,.cfg-touch-joy{transition:none}}',
  ].join('');
  document.head.appendChild(st);
}

export default createInput;
