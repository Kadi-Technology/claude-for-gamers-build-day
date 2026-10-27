// lobby/lobby.js · Lobby dual de Claude for Gamers · Build Day (R7, R8).
// Alias compartido (cfg.profile), leaderboard en vivo y arte de canvas ligero.
// Sin dependencias externas: solo profile.js y el widget del leaderboard.
import { getProfile, setProfile } from '../shared/ui/profile.js';
import { mountLeaderboard } from '../shared/ui/leaderboard-widget.js';

const TAU = Math.PI * 2;
const VW = 400; // espacio virtual del arte (5:2)
const VH = 160;
const STILL_T = 3.1; // instante que se pinta con movimiento reducido

const stats = { fps: 0, entities: 0 };

// Ganchos de prueba (docs/07 §3). Se definen antes que nada para que nunca falten.
window.__cfgReady = false;
window.__cfgStats = () => ({ scene: 'lobby', fps: Math.round(stats.fps), entities: stats.entities });

const $ = (sel) => document.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mod = (a, n) => ((a % n) + n) % n;
const frac = (a) => a - Math.floor(a);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ell(c, x, y, rx, ry, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  c.fill();
}

/* ======================================================================
   Alias compartido
   ====================================================================== */

const ALIAS_BAD = /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ _-]/g;
const ALIAS_OK = /^[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ _-]{3,12}$/;
const HINT_DEFAULT = 'Se usa en los dos juegos y en la clasificación.';

function readProfile() {
  try {
    const p = getProfile();
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function initAlias(onChange) {
  const input = $('#alias-input');
  const hint = $('#alias-hint');
  const form = $('#alias-form');
  if (!input || !hint) return;

  const say = (text, tone) => {
    hint.textContent = text;
    if (tone) hint.dataset.tone = tone;
    else delete hint.dataset.tone;
  };
  const saved = () => String(readProfile().alias ?? '');
  const normalize = (raw) =>
    String(raw ?? '')
      .normalize('NFC')
      .replace(ALIAS_BAD, '')
      .replace(/ {2,}/g, ' ')
      .slice(0, 12);

  const show = () => {
    input.value = saved();
    say(HINT_DEFAULT);
  };
  show();

  let composing = false;

  function onInput() {
    const cleaned = normalize(input.value);
    if (cleaned !== input.value) input.value = cleaned;
    const alias = cleaned.trim();
    if (!alias) {
      say('Escribe de 3 a 12 caracteres para guardar tu alias.');
      return;
    }
    if (!ALIAS_OK.test(alias)) {
      say('Usa de 3 a 12 caracteres: letras, números, espacio, guion o guion bajo.', 'warn');
      return;
    }
    if (alias === saved()) {
      say(`Guardado como ${alias}.`, 'ok');
      return;
    }
    try {
      setProfile({ ...readProfile(), alias });
    } catch {
      /* se verifica abajo leyendo el perfil */
    }
    if (saved() === alias) {
      say(`Guardado como ${alias}.`, 'ok');
      onChange();
    } else {
      say('No se pudo guardar ese alias. Prueba con otro.', 'warn');
    }
  }

  input.addEventListener('compositionstart', () => {
    composing = true;
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    onInput();
  });
  input.addEventListener('input', () => {
    if (!composing) onInput();
  });
  // Al salir del campo se muestra siempre lo que realmente quedó guardado.
  input.addEventListener('blur', show);
  if (form) {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      input.blur();
    });
  }
  // Otra pestaña (o un juego) cambió el perfil.
  window.addEventListener('storage', (ev) => {
    if (ev.key !== null && ev.key !== 'cfg.profile') return;
    if (document.activeElement !== input) show();
    onChange();
  });
  window.addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return;
    if (document.activeElement !== input) show();
    onChange();
  });
}

/* ======================================================================
   Leaderboard con pestañas
   ====================================================================== */

function initBoard() {
  const defs = {
    xochimilco: 'Top 10 · Xochimilco',
    angel: 'Top 10 · Ángel Survivors',
  };
  const tabs = Array.from(document.querySelectorAll('.tab[role="tab"]'));
  const widgets = {};
  let current = '';

  function widgetFor(game) {
    if (widgets[game]) return widgets[game];
    const host = document.getElementById(`lb-${game}`);
    if (!host) return null;
    widgets[game] = mountLeaderboard(host, { game, limit: 10, refreshMs: 15000, title: defs[game] });
    return widgets[game];
  }

  function select(game, focus) {
    if (!defs[game] || game === current) return;
    const prev = current;
    current = game;
    if (prev && widgets[prev]) widgets[prev].pause();
    for (const tab of tabs) {
      const on = tab.dataset.game === game;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
      if (on && focus) tab.focus();
    }
    const w = widgetFor(game);
    if (w && prev) w.resume();
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab.dataset.game, false));
    tab.addEventListener('keydown', (ev) => {
      const i = tabs.indexOf(tab);
      let next = -1;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (i + 1) % tabs.length;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
      else if (ev.key === 'Home') next = 0;
      else if (ev.key === 'End') next = tabs.length - 1;
      if (next < 0) return;
      ev.preventDefault();
      select(tabs[next].dataset.game, true);
    });
  }

  select('xochimilco', false);

  return {
    rerender() {
      for (const w of Object.values(widgets)) w.rerender();
    },
    refreshCurrent() {
      if (widgets[current]) widgets[current].refresh();
    },
  };
}

/* ======================================================================
   Arte: Ángel (silueta dorada + murciélagos)
   ====================================================================== */

function createAngelScene() {
  const rand = mulberry32(2610);
  const stars = [];
  for (let i = 0; i < 38; i++) {
    stars.push({ x: rand() * VW, y: rand() * 78, r: 0.4 + rand() * 0.8, p: rand() * TAU, s: 1.2 + rand() * 2.4 });
  }
  const bats = [];
  for (let i = 0; i < 7; i++) {
    bats.push({
      cx: 50 + rand() * 300,
      cy: 36 + rand() * 48,
      rx: 50 + rand() * 120,
      ry: 6 + rand() * 20,
      sp: 0.28 + rand() * 0.34,
      ph: rand() * TAU,
      sz: 0.7 + rand() * 0.75,
      fl: 10 + rand() * 6,
    });
  }
  const petals = [];
  for (let i = 0; i < 18; i++) {
    petals.push({
      x: rand() * VW,
      y: rand() * VH,
      vx: 5 + rand() * 9,
      vy: 7 + rand() * 9,
      ph: rand() * TAU,
      sz: 1.4 + rand() * 1.5,
      c: i % 3 === 0 ? '#ff7a1a' : '#ffb000',
    });
  }
  const FLAG_COLORS = ['#ff4f8b', '#ffb000', '#2dd4bf', '#a855f7', '#ff7a1a', '#60a5fa'];
  let halo = null;

  function wing(c) {
    c.beginPath();
    c.moveTo(199, 34);
    c.bezierCurveTo(192, 37, 183, 33, 178, 22);
    c.bezierCurveTo(177, 19, 177, 16, 178, 13);
    c.bezierCurveTo(182, 17, 186, 17, 189, 19);
    c.bezierCurveTo(188, 22, 192, 23, 195, 25);
    c.bezierCurveTo(194, 27, 197, 28, 199, 29);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(110, 60, 8, 0.65)';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(199, 31);
    c.lineTo(180, 16);
    c.moveTo(199, 32.5);
    c.lineTo(181, 23);
    c.moveTo(198.5, 34);
    c.lineTo(186, 29.5);
    c.stroke();
  }

  function drawStatic(c) {
    // Cielo
    const sky = c.createLinearGradient(0, 0, 0, VH);
    sky.addColorStop(0, '#09041a');
    sky.addColorStop(0.45, '#2e0f47');
    sky.addColorStop(0.78, '#9d3320');
    sky.addColorStop(1, '#f59e0b');
    c.fillStyle = sky;
    c.fillRect(0, 0, VW, VH);

    // Luna
    const mg = c.createRadialGradient(334, 36, 4, 334, 36, 48);
    mg.addColorStop(0, 'rgba(255, 240, 200, 0.5)');
    mg.addColorStop(1, 'rgba(255, 240, 200, 0)');
    c.fillStyle = mg;
    c.fillRect(280, 0, 120, 100);
    c.fillStyle = '#fff1cf';
    ell(c, 334, 36, 14, 14);
    c.fillStyle = 'rgba(190, 150, 130, 0.35)';
    ell(c, 329, 40, 4, 3.4);
    ell(c, 338, 31, 2.6, 2.2);

    // Horizonte de la ciudad
    const r = mulberry32(77);
    let x = -4;
    while (x < VW) {
      const w = 12 + r() * 16;
      const h = 14 + r() * 28;
      c.fillStyle = r() < 0.5 ? '#1c0b2c' : '#220f33';
      c.fillRect(x, 138 - h, w, h + 6);
      if (r() < 0.25) c.fillRect(x + w / 2 - 0.6, 138 - h - 6, 1.2, 6);
      c.fillStyle = 'rgba(255, 179, 71, 0.75)';
      for (let k = 0; k < 4; k++) {
        if (r() < 0.55) c.fillRect(x + 2 + r() * (w - 5), 138 - h + 3 + r() * (h - 8), 1.2, 1.6);
      }
      x += w + 1 + r() * 3;
    }

    // Suelo con brillo dorado bajo el monumento
    const ground = c.createLinearGradient(0, 136, 0, VH);
    ground.addColorStop(0, '#1d0e2e');
    ground.addColorStop(1, '#0a0412');
    c.fillStyle = ground;
    c.fillRect(0, 138, VW, VH - 138);
    const gg = c.createRadialGradient(200, 144, 2, 200, 144, 90);
    gg.addColorStop(0, 'rgba(255, 190, 70, 0.32)');
    gg.addColorStop(1, 'rgba(255, 190, 70, 0)');
    c.fillStyle = gg;
    c.fillRect(100, 110, 200, 50);

    // Monumento a la Independencia (silueta frontal)
    const gold = c.createLinearGradient(176, 0, 224, 0);
    gold.addColorStop(0, '#9a5c12');
    gold.addColorStop(0.32, '#ffe28f');
    gold.addColorStop(0.55, '#ffcf5a');
    gold.addColorStop(1, '#8e540f');
    const stone = c.createLinearGradient(190, 0, 210, 0);
    stone.addColorStop(0, '#7d6652');
    stone.addColorStop(0.3, '#ffe9bd');
    stone.addColorStop(0.62, '#e0c28a');
    stone.addColorStop(1, '#6b5240');

    // Basamento escalonado de cantera
    c.fillStyle = '#6f5a48';
    c.fillRect(166, 134, 68, 5);
    c.fillStyle = '#8a7260';
    c.fillRect(172, 129, 56, 5);
    c.fillStyle = '#a58b72';
    c.fillRect(178, 124, 44, 5);
    c.fillStyle = 'rgba(255, 226, 160, 0.35)';
    c.fillRect(166, 134, 68, 0.8);
    c.fillRect(172, 129, 56, 0.8);
    c.fillRect(178, 124, 44, 0.8);

    // Grupos de bronce en las esquinas (Ley, Justicia, Guerra y Paz) y leon al frente
    for (const [bx, by, bs] of [[170, 134, 1], [230, 134, 1], [176, 129, 0.85], [224, 129, 0.85]]) {
      c.fillStyle = '#2a1a12';
      ell(c, bx, by - 3.2 * bs, 2.5 * bs, 3.4 * bs);
      ell(c, bx + 2.6 * bs, by - 2 * bs, 1.8 * bs, 2.6 * bs);
      ell(c, bx, by - 7.4 * bs, 1.5 * bs, 1.6 * bs);
      c.fillRect(bx - 3.6 * bs, by - 1.2 * bs, 7.4 * bs, 1.4);
      c.fillStyle = 'rgba(255, 207, 90, 0.6)';
      c.fillRect(bx - 0.9 * bs, by - 6 * bs, 0.8, 5 * bs);
    }
    c.fillStyle = '#2a1a12';
    ell(c, 200, 132, 5, 1.7);
    ell(c, 205.4, 130.8, 1.8, 1.8);
    ell(c, 195, 130.6, 1, 1.4);
    c.fillRect(197, 133, 6, 0.9);

    // Base dorada y fuste estriado de cantera clara con anillos dorados
    c.fillStyle = gold;
    c.fillRect(190, 120, 20, 4);
    c.fillStyle = stone;
    c.beginPath();
    c.moveTo(191.5, 120);
    c.lineTo(208.5, 120);
    c.lineTo(206.5, 68);
    c.lineTo(193.5, 68);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(70, 40, 20, 0.4)';
    c.lineWidth = 0.5;
    c.beginPath();
    for (const dx of [-5, -3, -1, 1, 3, 5]) {
      c.moveTo(200 + dx * 1.3, 119);
      c.lineTo(200 + dx * 1.0, 69);
    }
    c.stroke();
    c.fillStyle = gold;
    for (const ry of [114, 102, 90, 79, 71]) {
      const hwR = 6.9 - (120 - ry) * 0.0115;
      c.fillRect(200 - hwR - 1.2, ry, 2 * hwR + 2.4, 1.9);
    }

    // Capitel dorado con acanto
    c.fillStyle = gold;
    c.beginPath();
    c.moveTo(193.5, 68);
    c.lineTo(190, 58);
    c.lineTo(210, 58);
    c.lineTo(206.5, 68);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(110, 60, 8, 0.6)';
    c.lineWidth = 0.5;
    c.beginPath();
    for (const dx of [-5, -2.5, 0, 2.5, 5]) {
      c.moveTo(200 + dx * 0.9, 67.5);
      c.quadraticCurveTo(200 + dx * 1.5 + 0.8, 63, 200 + dx * 1.7, 59);
    }
    c.stroke();
    c.fillStyle = gold;
    c.fillRect(187.5, 55.6, 25, 2.6);
    c.fillRect(194, 50, 12, 5.6);

    // Victoria alada dorada: alas abiertas, corona de laurel en alto y cadena rota
    c.save();
    c.translate(200, 50);
    c.scale(0.3, 0.3);
    lobbyVictory(c, 0.78);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'lighter';
    const vg = c.createRadialGradient(200, 28, 2, 200, 28, 38);
    vg.addColorStop(0, 'rgba(255, 233, 160, 0.5)');
    vg.addColorStop(1, 'rgba(255, 200, 80, 0)');
    c.fillStyle = vg;
    c.fillRect(160, 0, 80, 70);
    c.restore();
    c.fillStyle = '#fffbe6';
    for (const [sx, sy, sr] of [[192, 20, 1.5], [216, 22, 1.1], [180, 36, 0.9]]) {
      c.beginPath();
      c.moveTo(sx, sy - sr * 2); c.lineTo(sx + sr * 0.5, sy - sr * 0.5); c.lineTo(sx + sr * 2, sy); c.lineTo(sx + sr * 0.5, sy + sr * 0.5);
      c.lineTo(sx, sy + sr * 2); c.lineTo(sx - sr * 0.5, sy + sr * 0.5); c.lineTo(sx - sr * 2, sy); c.lineTo(sx - sr * 0.5, sy - sr * 0.5);
      c.closePath();
      c.fill();
    }
  }

  // Victoria alada (se dibuja en coordenadas locales: pies en 0,0; sube hacia -y)
  function lobbyVictory(c, wl) {
    const GH = '#ffd966', GM = '#d4a017', GL = '#7a4d08';
    const sy = -52;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const s of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const ang = -Math.PI / 2 + s * (0.2 + i * 0.15);
        const len = (98 - i * 5.2) * wl;
        const w = 11 - i * 0.45;
        const rx = s * 6, ry = sy + 6;
        const tx = rx + Math.cos(ang) * len, ty = ry + Math.sin(ang) * len;
        const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
        const fg = c.createLinearGradient(rx, ry, tx, ty);
        fg.addColorStop(0, '#fff0b0');
        fg.addColorStop(0.55, GH);
        fg.addColorStop(1, '#c98a10');
        c.fillStyle = fg;
        c.strokeStyle = GL;
        c.lineWidth = 1.7;
        c.beginPath();
        c.moveTo(rx, ry);
        c.quadraticCurveTo(rx + Math.cos(ang) * len * 0.5 + nx, ry + Math.sin(ang) * len * 0.5 + ny, tx, ty);
        c.quadraticCurveTo(rx + Math.cos(ang) * len * 0.5 - nx * 0.5, ry + Math.sin(ang) * len * 0.5 - ny * 0.5, rx, ry);
        c.fill();
        c.stroke();
      }
    }
    const tg = c.createLinearGradient(-20, 0, 20, 0);
    tg.addColorStop(0, '#8a5a0c');
    tg.addColorStop(0.3, '#fff0b0');
    tg.addColorStop(0.55, GH);
    tg.addColorStop(1, '#a8710f');
    c.fillStyle = tg;
    c.strokeStyle = GL;
    c.lineWidth = 1.9;
    c.beginPath();
    c.moveTo(-8, sy);
    c.quadraticCurveTo(-10, sy + 20, -22, 0);
    c.lineTo(15, 0);
    c.quadraticCurveTo(9, sy + 22, 8, sy);
    c.closePath();
    c.fill();
    c.stroke();
    // brazo con la corona (a la izquierda del espectador) y brazo con la cadena
    for (const [w1, col] of [[8, GL], [5, GH]]) {
      c.strokeStyle = col;
      c.lineWidth = w1;
      c.beginPath();
      c.moveTo(-6, sy + 4);
      c.quadraticCurveTo(-17, sy - 10, -25, sy - 32);
      c.stroke();
      c.beginPath();
      c.moveTo(7, sy + 4);
      c.quadraticCurveTo(16, sy + 8, 21, sy + 18);
      c.stroke();
    }
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? GM : GH;
      c.strokeStyle = GL;
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(21 + Math.sin(i * 0.9) * 3, sy + 21 + i * 6, 3, 4.4, i % 2 ? 0.6 : -0.5, 0, TAU);
      c.fill();
      c.stroke();
    }
    c.fillStyle = '#fff0b0';
    c.strokeStyle = GL;
    c.lineWidth = 1.8;
    c.beginPath();
    c.arc(0, sy - 8, 8.5, 0, TAU);
    c.fill();
    c.stroke();
    // corona de laurel alzada, sobre un fondo oscuro para que contraste con las alas
    const wx = -27, wy = sy - 44;
    c.fillStyle = 'rgba(70, 30, 0, 0.55)';
    c.beginPath();
    c.arc(wx, wy, 17, 0, TAU);
    c.fill();
    c.strokeStyle = GL;
    c.lineWidth = 5;
    c.beginPath();
    c.arc(wx, wy, 12, 0, TAU);
    c.stroke();
    c.strokeStyle = GM;
    c.lineWidth = 2.4;
    c.beginPath();
    c.arc(wx, wy, 12, 0, TAU);
    c.stroke();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      c.fillStyle = i % 2 ? '#fff0b0' : GH;
      c.strokeStyle = GL;
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(wx + Math.cos(a) * 12, wy + Math.sin(a) * 12, 5.4, 2.6, a + 1.1, 0, TAU);
      c.fill();
      c.stroke();
    }
  }


  function bat(c, x, y, s, flap) {
    const w = Math.sin(flap);
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.fillStyle = '#14061f';
    c.strokeStyle = 'rgba(214, 160, 255, 0.45)';
    c.lineWidth = 0.55;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * 1.5, -1);
      c.quadraticCurveTo(side * 8, -7 - 5 * w, side * 15, -2 - 7 * w);
      c.quadraticCurveTo(side * 12, 1 - 2 * w, side * 10.5, 3 - 3 * w);
      c.quadraticCurveTo(side * 8, 1, side * 6.5, 4 - 2 * w);
      c.quadraticCurveTo(side * 4, 1.5, side * 1.5, 4);
      c.closePath();
      c.fill();
      c.stroke();
    }
    ell(c, 0, 1, 2.4, 3.8);
    ell(c, 0, -3, 2.2, 2.2);
    c.beginPath();
    c.moveTo(-2, -4.4);
    c.lineTo(-1.6, -7.4);
    c.lineTo(-0.4, -4.8);
    c.moveTo(2, -4.4);
    c.lineTo(1.6, -7.4);
    c.lineTo(0.4, -4.8);
    c.fill();
    c.fillStyle = '#ff5a6e';
    c.fillRect(-1.3, -3.5, 0.9, 0.9);
    c.fillRect(0.4, -3.5, 0.9, 0.9);
    c.restore();
  }

  function drawDynamic(c, t) {
    // Estrellas
    c.fillStyle = '#fff6dc';
    for (const s of stars) {
      c.globalAlpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
      c.fillRect(s.x, s.y, s.r * 1.6, s.r * 1.6);
    }
    c.globalAlpha = 1;

    // Halo dorado que respira alrededor de la figura
    if (!halo) {
      halo = c.createRadialGradient(200, 26, 2, 200, 26, 48);
      halo.addColorStop(0, 'rgba(255, 214, 120, 1)');
      halo.addColorStop(1, 'rgba(255, 170, 40, 0)');
    }
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.28 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.6));
    c.fillStyle = halo;
    c.fillRect(140, 0, 120, 100);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    // Papel picado
    c.strokeStyle = 'rgba(255, 240, 210, 0.55)';
    c.lineWidth = 0.6;
    c.beginPath();
    for (let x = 0; x <= VW; x += 8) {
      const u = (x - 200) / 200;
      const y = 3 + 9 * (1 - u * u);
      if (x === 0 || Math.abs(x - 200) < 44 || Math.abs(x - 8 - 200) < 44) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    for (let i = 0, x = 6; x < VW; x += 17, i++) {
      if (Math.abs(x - 200) < 44) continue;
      const u = (x - 200) / 200;
      const y = 3 + 9 * (1 - u * u);
      const sway = Math.sin(t * 2 + i) * 1.1;
      c.fillStyle = FLAG_COLORS[i % FLAG_COLORS.length];
      c.beginPath();
      c.moveTo(x - 6, y);
      c.lineTo(x + 6, y);
      c.lineTo(x + sway, y + 11);
      c.closePath();
      c.fill();
    }

    // Murciélagos
    for (const b of bats) {
      const a = t * b.sp + b.ph;
      bat(c, b.cx + Math.cos(a) * b.rx, b.cy + Math.sin(a * 1.7) * b.ry, b.sz, t * b.fl + b.ph);
    }

    // Pétalos de cempasúchil
    for (const p of petals) {
      const x = mod(p.x + p.vx * t + Math.sin(t * 1.3 + p.ph) * 9, VW + 20) - 10;
      const y = mod(p.y + p.vy * t, VH + 20) - 10;
      c.fillStyle = p.c;
      c.globalAlpha = 0.9;
      ell(c, x, y, p.sz, p.sz * 0.55, t * 1.4 + p.ph);
    }
    c.globalAlpha = 1;
  }

  return { drawStatic, drawDynamic, entities: bats.length + petals.length };
}

/* ======================================================================
   Arte: Xochimilco (canal con ajolote)
   ====================================================================== */

const HZ = 72; // horizonte
const hw = (d) => 26 + 174 * d; // semiancho del canal a profundidad d (0 lejos, 1 cerca)
const yAt = (d) => HZ + (VH - HZ) * d;

function cloud(c, x, y, s) {
  ell(c, x, y, 16 * s, 5 * s);
  ell(c, x + 10 * s, y - 3 * s, 10 * s, 5 * s);
  ell(c, x - 9 * s, y - 2 * s, 9 * s, 4 * s);
}

function ahuejote(c, x, y, k) {
  c.fillStyle = '#3b2a1a';
  c.fillRect(x - 1.2 * k, y - 26 * k, 2.4 * k, 26 * k);
  c.fillStyle = '#1c5b2b';
  ell(c, x, y - 40 * k, 6.5 * k, 20 * k);
  c.fillStyle = '#2f8a3c';
  ell(c, x - 1.5 * k, y - 43 * k, 3.8 * k, 14 * k, -0.08);
  c.fillStyle = '#58b858';
  ell(c, x - 2.4 * k, y - 48 * k, 1.8 * k, 7 * k, -0.1);
}

function flower(c, x, y, k) {
  c.fillStyle = '#ff9a1a';
  ell(c, x, y, 2.6 * k, 1.6 * k);
  c.fillStyle = '#ffd166';
  ell(c, x, y - 0.2 * k, 1.3 * k, 0.8 * k);
}

function trajinera(c, x, y, k, stripe, arch) {
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  c.fillStyle = 'rgba(0, 40, 60, 0.35)';
  ell(c, 0, 1, 34, 4);
  // interior bajo el arco
  c.fillStyle = '#2a1a12';
  c.beginPath();
  c.arc(0, -9, 26, Math.PI, TAU);
  c.closePath();
  c.fill();
  // casco
  c.fillStyle = '#3a2216';
  c.beginPath();
  c.moveTo(-30, -9);
  c.lineTo(30, -9);
  c.lineTo(26, 0);
  c.lineTo(-26, 0);
  c.closePath();
  c.fill();
  c.fillStyle = stripe;
  c.fillRect(-29, -8, 58, 3);
  // letrero
  c.fillStyle = '#fff3d6';
  c.fillRect(-13, -21, 26, 8);
  c.fillStyle = stripe;
  c.fillRect(-10, -18.5, 8, 1.8);
  c.fillRect(-1, -18.5, 11, 1.8);
  c.fillRect(-10, -15.8, 14, 1.4);
  // arco floral
  c.strokeStyle = arch;
  c.lineWidth = 3.4;
  c.beginPath();
  c.arc(0, -9, 26, Math.PI, TAU);
  c.stroke();
  const dots = ['#ff4f8b', '#ffd166', '#ff7a1a', '#2dd4bf', '#ffffff'];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i * Math.PI) / 12;
    c.fillStyle = dots[i % dots.length];
    ell(c, Math.cos(a) * 26, -9 + Math.sin(a) * 26, 2.6, 2.6);
  }
  c.restore();
}

function axolotl(c, cx, cy, t, sx, sy) {
  c.save();
  c.translate(cx, cy);
  c.scale(sx, sy);
  // cola
  c.fillStyle = '#ff9fbd';
  c.beginPath();
  c.moveTo(10, 4);
  c.quadraticCurveTo(26, 8, 30, -2);
  c.quadraticCurveTo(24, 14, 8, 11);
  c.closePath();
  c.fill();
  // patas
  c.fillStyle = '#ff9fbd';
  ell(c, -12, 9, 4.4, 3, 0.3);
  ell(c, 12, 9, 4.4, 3, -0.3);
  // cuerpo
  const body = c.createLinearGradient(0, -6, 0, 14);
  body.addColorStop(0, '#ffc9da');
  body.addColorStop(1, '#ff8fb3');
  c.fillStyle = body;
  ell(c, 0, 2, 17, 12);
  c.fillStyle = '#ffe3ec';
  ell(c, 0, 6, 10, 6);
  // branquias
  c.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(t * 5 + i * 1.3 + (side > 0 ? 1.6 : 0)) * 0.2;
      const ang = -0.95 + i * 0.5 + sway;
      const bx = side * 13.5;
      const by = -12 + i * 3.6;
      const len = 13 + (i === 1 ? 2 : 0);
      const dx = side * Math.cos(ang);
      const dy = Math.sin(ang);
      const tx = bx + dx * len;
      const ty = by + dy * len;
      c.strokeStyle = '#ff4f7a';
      c.lineWidth = 2.3;
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(tx, ty);
      c.stroke();
      c.lineWidth = 1.3;
      c.beginPath();
      for (const f of [0.55, 0.8]) {
        const px = bx + dx * len * f;
        const py = by + dy * len * f;
        c.moveTo(px, py);
        c.lineTo(px + side * 2.4, py - 4.2);
      }
      c.stroke();
    }
  }
  c.lineCap = 'butt';
  // cabeza
  const head = c.createLinearGradient(0, -20, 0, 2);
  head.addColorStop(0, '#ffd2e0');
  head.addColorStop(1, '#ff9fbd');
  c.fillStyle = head;
  ell(c, 0, -9, 16, 11);
  // ojos
  c.fillStyle = '#2a1330';
  ell(c, -6.5, -11, 2.1, 2.3);
  ell(c, 6.5, -11, 2.1, 2.3);
  c.fillStyle = '#ffffff';
  ell(c, -5.8, -11.9, 0.75, 0.75);
  ell(c, 7.2, -11.9, 0.75, 0.75);
  // mejillas y sonrisa
  c.fillStyle = 'rgba(255, 90, 140, 0.45)';
  ell(c, -11, -6, 2.6, 1.8);
  ell(c, 11, -6, 2.6, 1.8);
  c.strokeStyle = '#9d3355';
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(-4, -5.6);
  c.quadraticCurveTo(0, -2.4, 4, -5.6);
  c.stroke();
  // flor de cempasúchil en la cabeza
  c.fillStyle = '#ff9a1a';
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6;
    ell(c, 10 + Math.cos(a) * 2.6, -18 + Math.sin(a) * 2.6, 1.9, 1.9);
  }
  c.fillStyle = '#ffd166';
  ell(c, 10, -18, 1.8, 1.8);
  c.restore();
}

function createXochimilcoScene() {
  const rand = mulberry32(1521);
  const ripples = [];
  for (let i = 0; i < 9; i++) ripples.push({ off: (rand() * 2 - 1) * 0.8, len: 0.5 + rand() * 0.7, ph: i / 9 });
  const flowers = [];
  for (let i = 0; i < 5; i++) flowers.push({ lane: (rand() * 2 - 1) * 0.55, ph: rand() });
  const boats = [
    { lane: -1, ph: 0.1, stripe: '#ff4f8b', arch: '#ffb000' },
    { lane: 1, ph: 0.62, stripe: '#2dd4bf', arch: '#ff4f8b' },
  ];
  const glints = [];
  for (let i = 0; i < 7; i++) glints.push({ x: 188 + rand() * 24, y: HZ + 2 + rand() * 12, p: rand() * TAU, s: 2 + rand() * 3 });

  function drawStatic(c) {
    // Cielo
    const sky = c.createLinearGradient(0, 0, 0, HZ + 2);
    sky.addColorStop(0, '#1769b0');
    sky.addColorStop(0.6, '#62bfe6');
    sky.addColorStop(1, '#ffe2a6');
    c.fillStyle = sky;
    c.fillRect(0, 0, VW, HZ + 2);
    const sun = c.createRadialGradient(312, 48, 3, 312, 48, 40);
    sun.addColorStop(0, 'rgba(255, 248, 210, 0.95)');
    sun.addColorStop(0.3, 'rgba(255, 224, 140, 0.45)');
    sun.addColorStop(1, 'rgba(255, 224, 140, 0)');
    c.fillStyle = sun;
    c.fillRect(260, 0, 140, 90);
    c.fillStyle = '#fff6cf';
    ell(c, 312, 48, 11, 11);
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    cloud(c, 60, 22, 1);
    cloud(c, 196, 14, 0.7);
    cloud(c, 356, 26, 0.8);

    // Volcanes
    c.fillStyle = '#5b82b8';
    c.beginPath();
    c.moveTo(20, HZ);
    c.lineTo(78, 46);
    c.lineTo(90, 40);
    c.lineTo(100, 46);
    c.lineTo(160, HZ);
    c.closePath();
    c.fill();
    c.fillStyle = '#6b8fc2';
    c.beginPath();
    c.moveTo(205, HZ);
    c.lineTo(250, 54);
    c.lineTo(268, 50);
    c.lineTo(285, 58);
    c.lineTo(310, 53);
    c.lineTo(350, HZ);
    c.closePath();
    c.fill();
    c.fillStyle = '#eef5ff';
    c.beginPath();
    c.moveTo(78, 46);
    c.lineTo(90, 40);
    c.lineTo(100, 46);
    c.lineTo(96, 49);
    c.lineTo(90, 46.5);
    c.lineTo(84, 50);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(250, 54);
    c.lineTo(268, 50);
    c.lineTo(274, 54);
    c.lineTo(268, 55.5);
    c.lineTo(260, 56);
    c.closePath();
    c.fill();
    const haze = c.createLinearGradient(0, 50, 0, HZ);
    haze.addColorStop(0, 'rgba(255, 226, 166, 0)');
    haze.addColorStop(1, 'rgba(255, 226, 166, 0.8)');
    c.fillStyle = haze;
    c.fillRect(0, 50, VW, HZ - 50 + 1);

    // Agua del canal
    const water = c.createLinearGradient(0, HZ, 0, VH);
    water.addColorStop(0, '#78d6d6');
    water.addColorStop(0.25, '#23a1b6');
    water.addColorStop(1, '#075a73');
    c.fillStyle = water;
    c.beginPath();
    c.moveTo(200 - hw(0), HZ);
    c.lineTo(200 + hw(0), HZ);
    c.lineTo(200 + hw(1), VH);
    c.lineTo(200 - hw(1), VH);
    c.closePath();
    c.fill();

    // Chinampas a ambos lados
    const bank = c.createLinearGradient(0, HZ, 0, VH);
    bank.addColorStop(0, '#6bbf59');
    bank.addColorStop(1, '#2a7a3b');
    c.fillStyle = bank;
    c.beginPath();
    c.moveTo(0, HZ);
    c.lineTo(200 - hw(0), HZ);
    c.lineTo(0, VH);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(VW, HZ);
    c.lineTo(200 + hw(0), HZ);
    c.lineTo(VW, VH);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(190, 240, 150, 0.8)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(200 - hw(0), HZ);
    c.lineTo(0, VH);
    c.moveTo(200 + hw(0), HZ);
    c.lineTo(VW, VH);
    c.stroke();

    // Arbustos lejanos en el horizonte
    const r = mulberry32(31);
    c.fillStyle = '#2b7a3a';
    for (let x = 4; x < VW; x += 9 + r() * 8) {
      if (x > 160 && x < 240) continue;
      ell(c, x, HZ - 1, 6 + r() * 5, 3 + r() * 2);
    }

    // Ahuejotes
    for (const d of [0.04, 0.14, 0.27, 0.43, 0.63, 0.88]) {
      const k = 0.18 + 0.82 * d;
      const y = yAt(d);
      const off = 6 + 12 * d;
      ahuejote(c, 200 - hw(d) - off, y, k);
      ahuejote(c, 200 + hw(d) + off, y, k);
    }
  }

  function drawDynamic(c, t) {
    // Destellos del sol sobre el agua
    c.fillStyle = '#fffbe0';
    for (const g of glints) {
      c.globalAlpha = Math.max(0, Math.sin(t * g.s + g.p)) * 0.8;
      c.fillRect(g.x, g.y, 2.4, 0.7);
    }
    c.globalAlpha = 1;

    // Ondas que avanzan hacia el jugador
    c.strokeStyle = '#d8fbff';
    c.lineCap = 'round';
    for (const rp of ripples) {
      const d = frac(t * 0.17 + rp.ph);
      const y = yAt(d);
      const half = hw(d) * 0.28 * rp.len;
      const x = 200 + rp.off * hw(d);
      c.globalAlpha = 0.08 + 0.34 * d;
      c.lineWidth = 0.5 + 1.1 * d;
      c.beginPath();
      c.moveTo(x - half, y);
      c.lineTo(x + half, y);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.lineCap = 'butt';

    // Flores de cempasúchil flotando
    for (const f of flowers) {
      const d = frac(t * 0.14 + f.ph);
      if (d < 0.04) continue;
      c.globalAlpha = d > 0.92 ? (1 - d) / 0.08 : 1;
      flower(c, 200 + f.lane * hw(d), yAt(d) + 1, 0.3 + 0.9 * d);
    }
    c.globalAlpha = 1;

    // Trajineras
    const live = [];
    for (const b of boats) {
      const d = frac(t / 10 + b.ph);
      if (d < 0.06 || d > 0.96) continue;
      live.push({ b, d });
    }
    live.sort((a, b) => a.d - b.d);
    for (const { b, d } of live) {
      c.globalAlpha = d > 0.88 ? clamp((0.96 - d) / 0.08, 0, 1) : clamp((d - 0.06) / 0.06, 0, 1);
      trajinera(c, 200 + b.lane * hw(d) * 0.62, yAt(d), 0.13 + 0.87 * d, b.stripe, b.arch);
    }
    c.globalAlpha = 1;

    // Ajolote: flota y de vez en cuando salta
    const cyc = t % 4.2;
    let lift = 0;
    let sx = 1.08;
    let sy = 1.08;
    if (cyc < 0.85) {
      const s = Math.sin((Math.PI * cyc) / 0.85);
      lift = s * 24;
      sx = 1.08 - 0.08 * s;
      sy = 1.08 + 0.12 * s;
    } else if (cyc < 1.1) {
      const s = Math.sin((Math.PI * (cyc - 0.85)) / 0.25);
      sx = 1.08 + 0.12 * s;
      sy = 1.08 - 0.14 * s;
      lift = 0;
    } else {
      lift = Math.sin(t * 2.1) * 1.2;
    }
    const baseY = 141;
    c.fillStyle = 'rgba(0, 30, 50, 0.32)';
    ell(c, 200, baseY + 8, Math.max(8, 21 - lift * 0.3), 4);
    if (cyc >= 0.85 && cyc < 1.75) {
      const u = (cyc - 0.85) / 0.9;
      c.strokeStyle = '#e8fdff';
      c.lineWidth = 1.2;
      c.globalAlpha = (1 - u) * 0.7;
      c.beginPath();
      c.ellipse(200, baseY + 8, 18 + u * 30, 4 + u * 7, 0, 0, TAU);
      c.stroke();
      c.globalAlpha = 1;
    }
    axolotl(c, 200, baseY - lift, t, sx, sy);
  }

  return { drawStatic, drawDynamic, entities: boats.length + ripples.length + flowers.length + 1 };
}

/* ======================================================================
   Bucle de arte (solo corre si hay un canvas visible y la pestaña está activa)
   ====================================================================== */

function initArt() {
  const defs = [
    ['art-angel', createAngelScene],
    ['art-xochimilco', createXochimilcoScene],
  ];
  const arts = [];
  for (const [id, build] of defs) {
    const canvas = document.getElementById(id);
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) continue;
    arts.push({ canvas, ctx, scene: build(), layer: null, s: 1, ox: 0, oy: 0, visible: true });
  }
  stats.entities = arts.reduce((n, a) => n + a.scene.entities, 0);

  const reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(reduceMq && reduceMq.matches);
  const nowSec = () => (reduced() ? STILL_T : performance.now() / 1000);

  let raf = 0;
  let lastNow = 0;

  function setup(art) {
    const { canvas } = art;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(cw * dpr));
    const ph = Math.max(1, Math.round(ch * dpr));
    if (art.layer && canvas.width === pw && canvas.height === ph) return true;
    canvas.width = pw;
    canvas.height = ph;
    art.s = Math.max(pw / VW, ph / VH);
    art.ox = (pw - VW * art.s) / 2;
    art.oy = (ph - VH * art.s) / 2;
    const layer = document.createElement('canvas');
    layer.width = pw;
    layer.height = ph;
    const lc = layer.getContext('2d');
    lc.setTransform(art.s, 0, 0, art.s, art.ox, art.oy);
    art.scene.drawStatic(lc);
    art.layer = layer;
    return true;
  }

  function draw(art, t) {
    if (!setup(art)) return false;
    const c = art.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.drawImage(art.layer, 0, 0);
    c.setTransform(art.s, 0, 0, art.s, art.ox, art.oy);
    art.scene.drawDynamic(c, t);
    c.setTransform(1, 0, 0, 1, 0, 0);
    return true;
  }

  const shouldRun = () => !document.hidden && !reduced() && arts.some((a) => a.visible);

  function frame(now) {
    raf = 0;
    if (!shouldRun()) return;
    if (lastNow) {
      const dt = now - lastNow;
      if (dt > 0 && dt < 250) {
        const inst = 1000 / dt;
        stats.fps = stats.fps ? stats.fps * 0.9 + inst * 0.1 : inst;
      }
    }
    lastNow = now;
    const t = now / 1000;
    for (const art of arts) if (art.visible) draw(art, t);
    window.__cfgReady = true;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || !shouldRun()) return;
    lastNow = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastNow = 0;
  }

  // Primer frame síncrono: el lobby ya tiene arte aunque rAF tarde en llegar.
  for (const art of arts) draw(art, nowSec());
  start();

  // Con movimiento reducido o la pestaña oculta rAF no corre: el gancho de pruebas igual debe resolverse.
  setTimeout(() => {
    window.__cfgReady = true;
  }, 1500);
  if (reduced()) window.__cfgReady = true;

  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      for (const art of arts) {
        art.layer = null; // fuerza a reconstruir la capa estática con la nueva resolución
        draw(art, nowSec());
      }
    });
    for (const art of arts) ro.observe(art.canvas);
  } else {
    window.addEventListener('resize', () => {
      for (const art of arts) {
        art.layer = null;
        draw(art, nowSec());
      }
    });
  }

  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const art = arts.find((a) => a.canvas === e.target);
        if (art) art.visible = e.isIntersecting;
      }
      if (shouldRun()) start();
      else stop();
    });
    for (const art of arts) io.observe(art.canvas);
  }

  document.addEventListener('visibilitychange', () => {
    if (shouldRun()) start();
    else stop();
  });
  if (reduceMq) {
    const onMotion = () => {
      if (reduced()) {
        stop();
        for (const art of arts) draw(art, STILL_T);
      } else {
        start();
      }
    };
    if (typeof reduceMq.addEventListener === 'function') reduceMq.addEventListener('change', onMotion);
    else if (typeof reduceMq.addListener === 'function') reduceMq.addListener(onMotion);
  }
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) start();
  });
}

/* ======================================================================
   Arranque
   ====================================================================== */

let board = null;
try {
  board = initBoard();
} catch {
  board = null;
}
try {
  initAlias(() => {
    if (board) board.rerender();
  });
} catch {
  /* el alias es opcional: el lobby sigue siendo navegable */
}
try {
  initArt();
} catch {
  window.__cfgReady = true;
}
window.addEventListener('pageshow', (ev) => {
  if (ev.persisted && board) board.refreshCurrent();
});
