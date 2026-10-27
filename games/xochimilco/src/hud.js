// HUD en DOM: distancia y barra de progreso a la meta, puntos y combo, vidas (ajolotitos), oxígeno, Chinampa Dash,
// banner de zona y avisos. Solo escribe en el DOM cuando un valor cambia.

import { el, add, setText, fmt } from './dom.js';
import { WORLD, LIVES, SCORE, MOVE, DASH, ZONES } from './config.js';
import { scoreOf, clamp } from './state.js';
import { axolotlFace } from './art.js';
import { isTouchPhone, canFullscreen, toggleFullscreen } from '../../../shared/ui/mobile.js';

function restart(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth; // fuerza el reflujo para reiniciar la animación CSS
  node.classList.add(cls);
}

export function createHud(root, cbs) {
  const hud = el('div', 'hud');
  hud.hidden = true;

  // ---- arriba a la izquierda: distancia y progreso
  const tl = el('div', 'hud-tl');
  const distBox = el('div', 'hud-dist');
  const distN = el('span', 'hud-dist-n', '0');
  add(distBox, distN, el('span', 'hud-dist-u', ' m'));
  const prog = el('div', 'hud-prog');
  const progFill = el('i');
  add(prog, progFill);
  for (let k = 1; k <= 3; k++) {
    const tick = el('b', 'hud-tick');
    tick.style.left = `${k * 25}%`;
    prog.appendChild(tick);
  }
  prog.appendChild(el('span', 'hud-flag', '🏁'));
  const zoneName = el('div', 'hud-zone', '');
  add(tl, distBox, prog, zoneName);

  // ---- arriba a la derecha: puntos, combo, flores y botones
  const tr = el('div', 'hud-tr');
  const scoreBox = el('div', 'hud-score');
  const scoreN = el('span', 'hud-score-n', '0');
  add(scoreBox, el('span', 'hud-score-l', 'PUNTOS'), scoreN);
  const comboBox = el('div', 'hud-combo');
  comboBox.hidden = true;
  const comboTxt = el('span', 'hud-combo-t', '×1');
  const comboFill = el('i');
  add(comboBox, comboTxt, comboFill);
  const flowersBox = el('div', 'hud-flowers', '🌼 0');
  const btns = el('div', 'hud-btns');
  const bPause = el('button', 'hud-btn', '⏸', { type: 'button', 'aria-label': 'Pausa' });
  const bMute = el('button', 'hud-btn', '🔊', { type: 'button', 'aria-label': 'Silenciar' });
  bPause.addEventListener('click', () => {
    bPause.blur(); // para que la barra espaciadora siga siendo "saltar"
    cbs.onPause();
  });
  bMute.addEventListener('click', () => {
    bMute.blur();
    cbs.onMute();
  });
  add(btns, bMute, bPause);
  if (isTouchPhone() && canFullscreen()) {
    // Solo celular: botón de pantalla completa
    const bFs = el('button', 'hud-btn', '⛶', { type: 'button', 'aria-label': 'Pantalla completa' });
    bFs.addEventListener('click', () => {
      bFs.blur();
      toggleFullscreen();
    });
    btns.insertBefore(bFs, bMute);
  }
  add(tr, scoreBox, comboBox, flowersBox, btns);

  // ---- abajo: vidas y oxígeno
  const lives = el('div', 'hud-lives');
  const liveCv = [];
  for (let i = 0; i < LIVES.max; i++) {
    const cv = el('canvas', 'hud-life', null, { width: '44', height: '44', 'aria-hidden': 'true' });
    const g = cv.getContext('2d');
    if (g) axolotlFace(g, 22, 24, 13, 0.6);
    liveCv.push(cv);
    lives.appendChild(cv);
  }
  const o2 = el('div', 'hud-o2');
  const o2Bar = el('div', 'hud-o2-bar');
  const o2Fill = el('i');
  const o2Mark = el('b', 'hud-o2-mark');
  o2Mark.style.left = `${(MOVE.diveCost / MOVE.o2Max) * 100}%`;
  add(o2Bar, o2Fill, o2Mark);
  add(o2, el('span', 'hud-o2-l', '🫧 OXÍGENO'), o2Bar);
  const dash = el('div', 'hud-dash');
  dash.hidden = true;
  const dashFill = el('i');
  add(dash, el('span', null, '🌺 CHINAMPA DASH'), dashFill);

  // ---- banner de zona y avisos
  const banner = el('div', 'hud-banner');
  const bannerKicker = el('div', 'hud-banner-k', '');
  const bannerTitle = el('div', 'hud-banner-t', '');
  const bannerSub = el('div', 'hud-banner-s', '');
  add(banner, bannerKicker, bannerTitle, bannerSub);
  const toasts = el('div', 'hud-toasts');
  toasts.setAttribute('aria-live', 'polite');
  const hint = el('div', 'hud-hint');
  hint.hidden = true;

  add(hud, tl, tr, lives, o2, dash, banner, toasts, hint);
  root.appendChild(hud);

  // caché para no tocar el DOM sin necesidad
  const last = { pct: -1, zone: '', combo: 0, comboW: -1, flowers: -1, lives: -1, o2: -1, o2Low: null, deny: null, dash: -1, muted: null };

  function update(state) {
    const p = state.player;
    setText(distN, fmt(Math.floor(state.dist)));
    const pct = Math.round(clamp(state.dist / WORLD.goal, 0, 1) * 1000) / 10;
    if (pct !== last.pct) {
      last.pct = pct;
      progFill.style.width = `${pct}%`;
    }
    const zi = state.zone;
    const zn = `Zona ${zi + 1} · ${ZONES[zi].nombre}${state.ring >= WORLD.zoneCount ? ' · ∞' : ''}`;
    if (zn !== last.zone) {
      last.zone = zn;
      zoneName.textContent = zn;
    }
    setText(scoreN, fmt(scoreOf(state)));
    if (state.combo !== last.combo) {
      last.combo = state.combo;
      comboBox.hidden = state.combo <= 1;
      comboTxt.textContent = `×${state.combo}`;
      if (state.combo > 1) restart(comboBox, 'pop');
    }
    if (state.combo > 1) {
      const w = Math.round(clamp(state.comboT / SCORE.comboWindow, 0, 1) * 50) * 2;
      if (w !== last.comboW) {
        last.comboW = w;
        comboFill.style.width = `${w}%`;
      }
    }
    if (state.flowers !== last.flowers) {
      last.flowers = state.flowers;
      flowersBox.textContent = `🌼 ${state.flowers}`;
    }
    if (state.lives !== last.lives) {
      last.lives = state.lives;
      for (let i = 0; i < liveCv.length; i++) liveCv[i].classList.toggle('off', i >= state.lives);
    }
    const o2p = Math.round((p.o2 / MOVE.o2Max) * 100);
    if (o2p !== last.o2) {
      last.o2 = o2p;
      o2Fill.style.width = `${o2p}%`;
    }
    const low = p.o2 < MOVE.diveCost;
    if (low !== last.o2Low) {
      last.o2Low = low;
      o2.classList.toggle('low', low);
    }
    const deny = p.o2Deny > 0;
    if (deny !== last.deny) {
      last.deny = deny;
      o2.classList.toggle('deny', deny);
    }
    if (p.dashT > 0) {
      const w = Math.round((p.dashT / DASH.time) * 50) * 2;
      if (w !== last.dash) {
        last.dash = w;
        dash.hidden = false;
        dashFill.style.width = `${w}%`;
      }
    } else if (last.dash !== -1) {
      last.dash = -1;
      dash.hidden = true;
    }
  }

  function showZone(index, ring) {
    const z = ZONES[index];
    bannerKicker.textContent = ring >= WORLD.zoneCount ? `ZONA ${index + 1} · MODO INFINITO` : `ZONA ${index + 1} DE ${WORLD.zoneCount}`;
    bannerTitle.textContent = z.nombre.toUpperCase();
    bannerSub.textContent = z.sub;
    banner.style.setProperty('--accent', z.pal.accent);
    restart(banner, 'show');
  }

  function showMessage(kicker, title, sub, accent = '#ffd23f') {
    bannerKicker.textContent = kicker;
    bannerTitle.textContent = title;
    bannerSub.textContent = sub;
    banner.style.setProperty('--accent', accent);
    restart(banner, 'show');
  }

  function toast(text, kind = '') {
    const t = el('div', `toast ${kind}`, text);
    toasts.appendChild(t);
    while (toasts.childNodes.length > 3) toasts.removeChild(toasts.firstChild);
    setTimeout(() => {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 1750);
  }

  let hintTimer = 0;
  function showHint(text, ms = 7000) {
    hint.textContent = text;
    hint.hidden = false;
    restart(hint, 'show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      hint.hidden = true;
    }, ms);
  }

  function setMuted(m) {
    if (m === last.muted) return;
    last.muted = m;
    bMute.textContent = m ? '🔇' : '🔊';
    bMute.setAttribute('aria-pressed', m ? 'true' : 'false');
  }

  function show(v) {
    hud.hidden = !v;
    if (!v) banner.classList.remove('show');
  }

  function reset() {
    last.pct = -1;
    last.zone = '';
    last.combo = 0;
    last.comboW = -1;
    last.flowers = -1;
    last.lives = -1;
    last.o2 = -1;
    last.dash = -1;
    dash.hidden = true;
    hint.hidden = true;
    toasts.textContent = '';
  }

  return { update, showZone, showMessage, showHint, toast, setMuted, show, reset };
}
