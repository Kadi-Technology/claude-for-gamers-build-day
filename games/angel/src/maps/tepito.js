// maps/tepito.js (ANG-W) - Tepito: el Barrio Bravo. Cuadrícula de calles de 3000x3000 con manzanas sólidas,
// callejones angostos, tianguis de lonas rosa/azul/amarillo, bocinas de sonidero, un ring de box callejero,
// diablitos de carga, murales y papel picado. Celebra su comercio, su cultura sonidera, su tradición de box y su arte urbano.
//
// Obstáculos: { type:'circle', x, y, r, kind } | { type:'rect', x, y, w, h, kind } con (x,y) = esquina superior izquierda.

import {
  TAU, decorRng, shade, rgba, roundRect, noiseTile, fillTiled, glowSpot, drawGlow, inView, clockSeconds,
} from '../world.js';

const W = 3000;
const H = 3000;
const M = 151;            // margen exterior hasta la primera manzana
const B = 370;            // lado de una manzana
const S = 212;            // ancho de las calles
const STEP = B + S;
const WALL = 46;          // muro perimetral con murales
const FACADE = 56;        // franja de fachada visible de cada edificio (vista 3/4)
const ALLEY = 110;        // ancho de los callejones angostos
const CX = W / 2;
const CY = H / 2;

const TARPS = ['#ff4fa3', '#2f7dff', '#ffd23f'];
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

// Mapa de manzanas: S sólida · a/b/c mercado (filas, columnas, islas) · V/H callejón vertical/horizontal · R plaza del ring
const LAYOUT = [
  'SaVaS',
  'bScSb',
  'HcRcH',
  'bScSb',
  'SaVaS',
];

const gx = (i) => M + i * STEP;

// ---------------------------------------------------------------------------
// Datos de la escena (se construyen una sola vez al cargar el módulo)
// ---------------------------------------------------------------------------
const OBSTACLES = [];
const BUILDINGS = [];   // { x, y, w, h, i }
const STALLS = [];      // { x, y, w, h, c }
const MARKETS = [];     // { x, y, w, h }
const SPEAKERS = [];    // { x, y, w, h }
const DIABLITOS = [];   // { x, y }
const RING = { x: CX - 108, y: CY - 108, w: 216, h: 216 };
const PLAZA = { x: gx(2), y: gx(2), w: B, h: B };

function addRect(x, y, w, h, kind) {
  OBSTACLES.push({ type: 'rect', x, y, w, h, kind });
}

function addCircle(x, y, r, kind) {
  OBSTACLES.push({ type: 'circle', x, y, r, kind });
}

function addBuilding(x, y, w, h, i) {
  BUILDINGS.push({ x, y, w, h, i });
  addRect(x, y, w, h, 'manzana');
}

function addStall(x, y, w, h, n, solid = true) {
  STALLS.push({ x, y, w, h, c: TARPS[n % 3], n });
  if (solid) addRect(x, y, w, h, 'puesto');
}

function buildScene() {
  let n = 0;
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 5; i++) {
      const t = LAYOUT[j][i];
      const bx = gx(i), by = gx(j);
      n++;
      if (t === 'S') {
        addBuilding(bx, by, B, B, n);
      } else if (t === 'V') {
        const sw = (B - ALLEY) / 2;
        addBuilding(bx, by, sw, B, n);
        addBuilding(bx + sw + ALLEY, by, sw, B, n + 7);
      } else if (t === 'H') {
        const sh = (B - ALLEY) / 2;
        addBuilding(bx, by, B, sh, n);
        addBuilding(bx, by + sh + ALLEY, B, sh, n + 7);
      } else if (t === 'a') {
        // Dos hileras horizontales de tres puestos
        MARKETS.push({ x: bx, y: by, w: B, h: B });
        for (let k = 0; k < 3; k++) {
          addStall(bx + 35 + k * 102, by + 38, 96, 64, n + k, false);
          addStall(bx + 35 + k * 102, by + B - 38 - 64, 96, 64, n + k + 1, false);
        }
        addRect(bx + 35, by + 38, 300, 64, 'puesto');
        addRect(bx + 35, by + B - 38 - 64, 300, 64, 'puesto');
      } else if (t === 'b') {
        // Dos hileras verticales de tres puestos
        MARKETS.push({ x: bx, y: by, w: B, h: B });
        for (let k = 0; k < 3; k++) {
          addStall(bx + 38, by + 35 + k * 102, 64, 96, n + k, false);
          addStall(bx + B - 38 - 64, by + 35 + k * 102, 64, 96, n + k + 2, false);
        }
        addRect(bx + 38, by + 35, 64, 300, 'puesto');
        addRect(bx + B - 38 - 64, by + 35, 64, 300, 'puesto');
      } else if (t === 'c') {
        // Cuatro islas de puestos
        MARKETS.push({ x: bx, y: by, w: B, h: B });
        addStall(bx + 50, by + 50, 110, 84, n);
        addStall(bx + B - 50 - 110, by + 50, 110, 84, n + 1);
        addStall(bx + 50, by + B - 50 - 84, 110, 84, n + 2);
        addStall(bx + B - 50 - 110, by + B - 50 - 84, 110, 84, n + 3);
      } else if (t === 'R') {
        addRect(RING.x, RING.y, RING.w, RING.h, 'ring');
        // Cuatro torres de bocinas en las esquinas de la plaza
        for (const [sx, sy] of [[bx + 4, by + 4], [bx + B - 4 - 64, by + 4], [bx + 4, by + B - 4 - 80], [bx + B - 4 - 64, by + B - 4 - 80]]) {
          SPEAKERS.push({ x: sx, y: sy, w: 64, h: 80 });
          addRect(sx, sy, 64, 80, 'bocina');
        }
      }
    }
  }
  // Bocinas de sonidero en esquinas de calle, y diablitos de carga repartidos por las calles
  const corner = (i, j) => [gx(i) - S / 2, gx(j) - S / 2];
  for (const [i, j] of [[1, 1], [3, 1], [1, 3], [3, 3]]) {
    const [cx, cy] = corner(i, j);
    const sx = cx - 32, sy = cy - 40;
    SPEAKERS.push({ x: sx, y: sy, w: 64, h: 80 });
    addRect(sx, sy, 64, 80, 'bocina');
  }
  const dia = [
    [gx(1) - S / 2 + 56, gx(0) + B / 2], [gx(2) - S / 2 - 50, gx(1) + B / 2 + 60], [gx(3) - S / 2 + 40, gx(4) + B / 2 - 70],
    [gx(4) - S / 2 + 20, gx(3) + B / 2], [gx(0) + B / 2 + 40, gx(1) - S / 2 + 50], [gx(1) + B / 2 - 60, gx(2) - S / 2 - 40],
    [gx(2) + B / 2 + 50, gx(3) - S / 2 + 60], [gx(3) + B / 2, gx(4) - S / 2 - 30], [gx(4) + B / 2 - 30, gx(1) - S / 2 + 40],
    [gx(0) + B / 2 - 70, gx(3) - S / 2 - 40], [gx(1) - S / 2 - 30, gx(3) + B / 2 + 50], [gx(3) - S / 2 + 50, gx(2) + B / 2 - 20],
  ];
  for (const [x, y] of dia) {
    DIABLITOS.push({ x, y });
    addCircle(x, y, 24, 'diablito');
  }
}
buildScene();

// ---------------------------------------------------------------------------
// Utilidades de pintura propias del mapa
// ---------------------------------------------------------------------------
function emojiText(ctx, ch, x, y, size, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = Math.round(size) + 'px ' + EMOJI_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
  ctx.restore();
}

function outlinedText(ctx, text, x, y, size, fill, outline, maxW) {
  ctx.save();
  ctx.font = '900 italic ' + Math.round(size) + 'px Impact, "Arial Black", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.strokeStyle = outline;
  if (maxW) ctx.strokeText(text, x, y, maxW); else ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  if (maxW) ctx.fillText(text, x, y, maxW); else ctx.fillText(text, x, y);
  ctx.restore();
}

function frets(ctx, x, y, w, h, c1, c2) {
  // Greca escalonada (xicalcoliuhqui) en una franja
  const u = h / 4;
  ctx.fillStyle = c1;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = c2;
  for (let px = x; px < x + w; px += u * 6) {
    ctx.beginPath();
    ctx.moveTo(px, y + h);
    ctx.lineTo(px, y + u);
    ctx.lineTo(px + u * 3, y + u);
    ctx.lineTo(px + u * 3, y + u * 3);
    ctx.lineTo(px + u, y + u * 3);
    ctx.lineTo(px + u, y + u * 2);
    ctx.lineTo(px + u * 2, y + u * 2);
    ctx.lineTo(px + u * 2, y + u * 2 + 1);
    ctx.lineTo(px + u * 4, y + u * 2 + 1);
    ctx.lineTo(px + u * 4, y + h);
    ctx.closePath();
    ctx.fill();
  }
}

// Mural horizontal de w x h con 6 variantes (sol, box, sonidero, flores, grecas, tianguis)
function drawMural(ctx, x, y, w, h, v, rng) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const c = h / 2;
  switch (((v % 6) + 6) % 6) {
    case 0: {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#ff7a2f'); g.addColorStop(0.5, '#ff2f92'); g.addColorStop(1, '#6a2fd1');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      const sx = x + Math.min(w * 0.22, 70), sy = y + c;
      ctx.fillStyle = '#ffe14d';
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        ctx.beginPath(); ctx.moveTo(sx + Math.cos(a - 0.1) * h * 0.4, sy + Math.sin(a - 0.1) * h * 0.4);
        ctx.lineTo(sx + Math.cos(a) * h * 0.66, sy + Math.sin(a) * h * 0.66);
        ctx.lineTo(sx + Math.cos(a + 0.1) * h * 0.4, sy + Math.sin(a + 0.1) * h * 0.4); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(sx, sy, h * 0.36, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff9a1f'; ctx.beginPath(); ctx.arc(sx, sy, h * 0.24, 0, TAU); ctx.fill();
      outlinedText(ctx, 'TEPITO', x + w * 0.62, y + c, h * 0.56, '#ffffff', '#2a1048', w * 0.5);
      frets(ctx, x, y + h - 9, w, 9, 'rgba(30,10,60,0.55)', '#ffd23f');
      break;
    }
    case 1: {
      ctx.fillStyle = '#d7263d'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#1b4fd1';
      ctx.beginPath(); ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w * 0.35, y + h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd23f';
      for (let i = 0; i < 7; i++) { const sx = x + rng.range(10, w - 10), sy = y + rng.range(6, h - 6); ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2; const r = k % 2 ? 3 : 7; ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#fff';
      emojiText(ctx, '🥊', x + w * 0.2, y + c, h * 0.8);
      emojiText(ctx, '🥊', x + w * 0.8, y + c, h * 0.8);
      outlinedText(ctx, 'BOX', x + w * 0.5, y + c, h * 0.62, '#ffffff', '#1a0a2a', w * 0.3);
      break;
    }
    case 2: {
      ctx.fillStyle = '#1a0f3d'; ctx.fillRect(x, y, w, h);
      const bars = Math.floor(w / 9);
      for (let i = 0; i < bars; i++) {
        const bh = (0.25 + rng.next() * 0.7) * h;
        const g = ctx.createLinearGradient(0, y + h - bh, 0, y + h);
        g.addColorStop(0, '#ff2fb0'); g.addColorStop(0.6, '#2fe1ff'); g.addColorStop(1, '#ffe14d');
        ctx.fillStyle = g; ctx.fillRect(x + 3 + i * 9, y + h - bh, 6, bh);
      }
      emojiText(ctx, '🔊', x + w * 0.14, y + c, h * 0.7);
      emojiText(ctx, '🎶', x + w * 0.86, y + c, h * 0.62);
      outlinedText(ctx, 'SONIDERO', x + w * 0.5, y + c, h * 0.5, '#fff6a8', '#1a0a2a', w * 0.55);
      break;
    }
    case 3: {
      // Flores y corazones: celebra la vida y el barrio (sin calaveras ni iconografía religiosa)
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, '#14b8a6'); g.addColorStop(1, '#0e7490');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      for (let i = 0; i < 26; i++) { ctx.fillStyle = rng.next() < 0.5 ? '#ff9a1f' : '#ffd23f'; ctx.beginPath(); ctx.arc(x + rng.range(0, w), y + rng.range(0, h), 3 + rng.next() * 3, 0, TAU); ctx.fill(); }
      emojiText(ctx, '🌺', x + w * 0.14, y + c, h * 0.7);
      emojiText(ctx, '🌼', x + w * 0.86, y + c, h * 0.7);
      emojiText(ctx, '💛', x + w * 0.3, y + h * 0.28, h * 0.34);
      emojiText(ctx, '💖', x + w * 0.7, y + h * 0.74, h * 0.34);
      outlinedText(ctx, '¡VIVA LA VIDA!', x + w * 0.5, y + c, h * 0.42, '#ffffff', '#07323a', w * 0.55);
      break;
    }
    case 4: {
      const cols = [['#e11d74', '#ffd23f'], ['#0ea5a4', '#fff1c1'], ['#6d28d9', '#ff9a1f']];
      const bh = h / 3;
      for (let k = 0; k < 3; k++) frets(ctx, x, y + k * bh, w, bh, cols[k][0], cols[k][1]);
      ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#2a1048'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x + w * 0.5, y + c, h * 0.36, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e11d74'; ctx.beginPath(); ctx.arc(x + w * 0.5, y + c, h * 0.2, 0, TAU); ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, y, w, h);
      for (let k = 0; k * 22 < w; k++) { ctx.fillStyle = k % 2 ? '#ff4fa3' : '#2f7dff'; ctx.fillRect(x + k * 22, y, 22, h * 0.42); }
      emojiText(ctx, '🍉', x + w * 0.16, y + h * 0.72, h * 0.5);
      emojiText(ctx, '🌽', x + w * 0.84, y + h * 0.72, h * 0.5);
      outlinedText(ctx, 'TIANGUIS', x + w * 0.5, y + h * 0.7, h * 0.4, '#ffffff', '#3a1450', w * 0.5);
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(20,8,32,0.8)'; ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

function roofProp(ctx, type, px, py, rng) {
  switch (type) {
    case 0: { // tinaco
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.arc(px + 6, py + 8, 14, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(px - 5, py - 5, 2, px, py, 15);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9fb7e0');
      ctx.fillStyle = g; ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 14, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,60,110,0.4)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(px, py, 8, 0, TAU); ctx.stroke();
      break;
    }
    case 1: { // tendedero
      const len = 60 + rng.next() * 50;
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(px - len / 2 + 5, py + 9, len, 3);
      ctx.strokeStyle = 'rgba(30,20,30,0.75)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(px - len / 2, py); ctx.lineTo(px + len / 2, py); ctx.stroke();
      const cs = ['#ff4fa3', '#ffd23f', '#2f7dff', '#ffffff', '#3ddc97', '#ff7a2f'];
      for (let q = 0; q < len - 8; q += 12) { ctx.fillStyle = cs[rng.int(0, 5)]; ctx.fillRect(px - len / 2 + 3 + q, py + 1, 8, 12); }
      ctx.fillStyle = '#2a2433'; ctx.fillRect(px - len / 2 - 2, py - 4, 4, 8); ctx.fillRect(px + len / 2 - 2, py - 4, 4, 8);
      break;
    }
    case 2: { // caseta de escaleras
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px - 20 + 8, py - 16 + 10, 40, 32);
      ctx.fillStyle = '#d8d2c2'; ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 2.4;
      ctx.fillRect(px - 20, py - 16, 40, 32); ctx.strokeRect(px - 20, py - 16, 40, 32);
      ctx.fillStyle = '#9a9484'; ctx.fillRect(px - 16, py - 12, 32, 6);
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(px - 6, py + 2, 12, 14);
      break;
    }
    case 3: { // maceta / jardín
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(px + 5, py + 6, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b5532e'; ctx.beginPath(); ctx.arc(px, py, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2f8349'; ctx.beginPath(); ctx.arc(px - 1, py - 1, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#43a55c'; ctx.beginPath(); ctx.arc(px - 3, py - 3, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff9a1f'; for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(px + rng.range(-6, 6), py + rng.range(-6, 6), 2.4, 0, TAU); ctx.fill(); }
      break;
    }
    case 4: { // antena parabólica
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(px + 6, py + 7, 12, 10, 0.4, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(px - 3, py - 3, 1, px, py, 12);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#b9bfcc');
      ctx.fillStyle = g; ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 11, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 9, py - 9); ctx.stroke();
      ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(px + 9, py - 9, 2.6, 0, TAU); ctx.fill();
      break;
    }
    case 5: { // aire acondicionado
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(px - 18 + 6, py - 13 + 8, 36, 26);
      ctx.fillStyle = '#c9cdd6'; ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 2;
      ctx.fillRect(px - 18, py - 13, 36, 26); ctx.strokeRect(px - 18, py - 13, 36, 26);
      ctx.fillStyle = '#4a4658'; ctx.beginPath(); ctx.arc(px - 6, py, 8, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8a8698'; ctx.lineWidth = 1.2;
      for (let q = -1; q <= 1; q++) { ctx.beginPath(); ctx.moveTo(px - 14, py + q * 4); ctx.lineTo(px + 14, py + q * 4); ctx.stroke(); }
      break;
    }
    default: { // sombrilla con mesa
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(px + 6, py + 8, 15, 0, TAU); ctx.fill();
      const c1 = TARPS[rng.int(0, 2)];
      ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 2;
      for (let q = 0; q < 8; q++) {
        ctx.fillStyle = q % 2 ? c1 : '#ffffff';
        ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, 15, (q / 8) * TAU, ((q + 1) / 8) * TAU); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(px, py, 15, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#2a2433'; ctx.beginPath(); ctx.arc(px, py, 2, 0, TAU); ctx.fill();
    }
  }
}

function drawRoof(ctx, x, y, w, h, style, rng) {
  const bases = ['#8a8794', '#b5532e', '#1fb3a6', '#d9a441', '#d6427a'];
  const base = bases[style % bases.length];
  const cols = Math.max(1, Math.round(w / 125));
  const rows = Math.max(1, Math.round(h / 120));
  const cw = w / cols, ch = h / rows;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x + c * cw, cy = y + r * ch;
      const tint = rng.range(-0.12, 0.12);
      const col = shade(base, tint);
      const kind = rng.int(0, 4);
      ctx.save();
      ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
      ctx.fillStyle = col; ctx.fillRect(cx, cy, cw, ch);
      // Acabado de la azotea
      if (kind === 0) {
        ctx.strokeStyle = 'rgba(40,12,0,0.32)'; ctx.lineWidth = 2;
        for (let ty = cy + 10; ty < cy + ch; ty += 12) { ctx.beginPath(); ctx.moveTo(cx, ty); ctx.lineTo(cx + cw, ty); ctx.stroke(); }
      } else if (kind === 1) {
        const lona = TARPS[rng.int(0, 2)];
        ctx.fillStyle = lona; ctx.fillRect(cx + 12, cy + 12, cw - 24, ch - 24);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let k = 0; k * 20 < cw - 24; k++) if (k % 2) ctx.fillRect(cx + 12 + k * 20, cy + 12, 20, ch - 24);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(cx + 12, cy + 12, cw - 24, ch - 24);
      } else if (kind === 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        for (let ty = cy + 18; ty < cy + ch; ty += 36) for (let tx = cx + 18; tx < cx + cw; tx += 36) { ctx.beginPath(); ctx.moveTo(tx, ty - 8); ctx.lineTo(tx + 8, ty); ctx.lineTo(tx, ty + 8); ctx.lineTo(tx - 8, ty); ctx.closePath(); ctx.fill(); }
      } else if (kind === 3) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(cx + rng.range(10, cw - 10), cy + rng.range(10, ch - 10), rng.range(8, 22), rng.range(5, 12), rng.range(0, 3), 0, TAU); ctx.fill(); }
      } else {
        ctx.fillStyle = 'rgba(140,200,255,0.5)'; ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 2;
        for (let k = 0; k < 2; k++) { const sx = cx + 16 + k * (cw / 2 - 6), sy = cy + ch - 46; ctx.fillRect(sx, sy, 34, 28); ctx.strokeRect(sx, sy, 34, 28); ctx.beginPath(); ctx.moveTo(sx + 17, sy); ctx.lineTo(sx + 17, sy + 28); ctx.stroke(); }
      }
      // Detalle de ruido
      for (let k = 0; k < cw * ch / 520; k++) {
        ctx.fillStyle = rng.next() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
        ctx.fillRect(cx + rng.next() * cw, cy + rng.next() * ch, 3 + rng.next() * 9, 2 + rng.next() * 6);
      }
      // Objetos de la azotea
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) roofProp(ctx, rng.int(0, 6), cx + 24 + rng.next() * (cw - 48), cy + 24 + rng.next() * (ch - 48), rng);
      // Pretil de la casa
      ctx.strokeStyle = shade(col, -0.45); ctx.lineWidth = 5; ctx.strokeRect(cx + 2.5, cy + 2.5, cw - 5, ch - 5);
      ctx.strokeStyle = shade(col, 0.3); ctx.lineWidth = 1.6; ctx.strokeRect(cx + 0.8, cy + 0.8, cw - 1.6, ch - 1.6);
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#1a1422'; ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

function drawFacade(ctx, b, rng) {
  const fx = b.x, fy = b.y + b.h - FACADE, fw = b.w, fh = FACADE;
  const walls = ['#e9d5a6', '#f1c9b0', '#c9e0d2', '#e6d0e8', '#f3e3a2'];
  const wall = walls[b.i % walls.length];
  ctx.fillStyle = wall;
  ctx.fillRect(fx, fy, fw, fh);
  const gr = ctx.createLinearGradient(0, fy, 0, fy + fh);
  gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(0.3, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = gr; ctx.fillRect(fx, fy, fw, fh);
  if (b.i % 5 < 2) {
    // Fachada con mural
    drawMural(ctx, fx + 6, fy + 6, fw - 12, fh - 12, b.i + (b.i >> 2), rng);
  } else {
    // Negocios: toldos de colores, cortinas y ventanas encendidas
    const n = Math.max(1, Math.floor(fw / 62));
    const cw = fw / n;
    for (let k = 0; k < n; k++) {
      const cx = fx + k * cw;
      const awn = TARPS[(b.i + k) % 3];
      if ((k + b.i) % 3 === 0) {
        // Ventanas del piso alto
        ctx.fillStyle = '#26324a'; ctx.strokeStyle = '#161220'; ctx.lineWidth = 2;
        ctx.fillRect(cx + 10, fy + 7, cw - 20, 20); ctx.strokeRect(cx + 10, fy + 7, cw - 20, 20);
        ctx.fillStyle = rng.next() < 0.6 ? '#ffd98a' : '#3b4a6b';
        ctx.fillRect(cx + 13, fy + 10, cw - 26, 14);
      } else {
        ctx.fillStyle = '#2a2230'; ctx.fillRect(cx + 6, fy + 18, cw - 12, fh - 18);
        ctx.fillStyle = rng.next() < 0.7 ? '#ffcf70' : '#b9b6c4';
        ctx.fillRect(cx + 9, fy + 27, cw - 18, fh - 29);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        for (let q = 0; q < 3; q++) ctx.fillRect(cx + 12 + q * ((cw - 30) / 3), fy + 32, 6, 10);
        // Toldo con festón
        ctx.fillStyle = awn; ctx.strokeStyle = '#161220'; ctx.lineWidth = 2;
        ctx.fillRect(cx + 3, fy + 8, cw - 6, 14); ctx.strokeRect(cx + 3, fy + 8, cw - 6, 14);
        ctx.fillStyle = '#ffffff';
        for (let q = cx + 3; q < cx + cw - 9; q += 14) ctx.fillRect(q + 7, fy + 8, 7, 14);
        ctx.fillStyle = awn;
        for (let q = cx + 3; q < cx + cw - 9; q += 14) { ctx.beginPath(); ctx.arc(q + 7, fy + 22, 7, 0, Math.PI); ctx.fill(); }
      }
    }
  }
  ctx.strokeStyle = '#1a1422'; ctx.lineWidth = 3;
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(fx + 1.5, fy + 1.5, fw - 3, 3);
}

function drawBuilding(ctx, b, rng) {
  // Sombra hacia abajo-derecha
  ctx.fillStyle = 'rgba(0,0,0,0.33)';
  ctx.fillRect(b.x + 18, b.y + 22, b.w, b.h);
  // Banqueta
  ctx.fillStyle = '#7d7889';
  roundRect(ctx, b.x - 12, b.y - 12, b.w + 24, b.h + 24, 10);
  ctx.fill();
  ctx.strokeStyle = '#b8b2c6'; ctx.lineWidth = 3; ctx.stroke();
  drawFacade(ctx, b, rng);
  drawRoof(ctx, b.x, b.y, b.w, b.h - FACADE, b.i + 1, rng);
}

function drawStall(ctx, s, rng) {
  const { x, y, w, h, c } = s;
  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, x + 9, y + 12, w, h, 6); ctx.fill();
  // Mercancía asomando por el frente
  const goods = ['#e63946', '#ff9a1f', '#3ddc97', '#ffd23f', '#7c3aed', '#22d3ee'];
  const horiz = w >= h;
  const cnt = Math.floor((horiz ? w : h) / 12);
  for (let k = 0; k < cnt; k++) {
    ctx.fillStyle = rng.pick(goods);
    ctx.strokeStyle = 'rgba(20,10,30,0.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (horiz) ctx.arc(x + 8 + k * 12, y + h + 1, 4.6, 0, TAU); else ctx.arc(x + w + 1, y + 8 + k * 12, 4.6, 0, TAU);
    ctx.fill(); ctx.stroke();
  }
  // Lona: franjas alternadas con combadura
  ctx.save();
  roundRect(ctx, x, y, w, h, 7);
  ctx.clip();
  ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  if (horiz) { for (let k = 0; k * 24 < w; k++) if (k % 2) ctx.fillRect(x + k * 24, y, 24, h); }
  else { for (let k = 0; k * 24 < h; k++) if (k % 2) ctx.fillRect(x, y + k * 24, w, 24); }
  const g = ctx.createRadialGradient(x + w * 0.4, y + h * 0.35, 4, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(10,0,30,0.38)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  // Pliegues
  ctx.strokeStyle = 'rgba(10,0,30,0.22)'; ctx.lineWidth = 1.5;
  for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + (w / 3) * k, y); ctx.lineTo(x + (w / 3) * k + rng.range(-5, 5), y + h); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#1a1220'; ctx.lineWidth = 3;
  roundRect(ctx, x, y, w, h, 7); ctx.stroke();
  // Postes y cuerdas
  ctx.fillStyle = '#2a2433';
  for (const [px, py] of [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]]) { ctx.beginPath(); ctx.arc(px, py, 3.2, 0, TAU); ctx.fill(); }
  // Foquito del puesto
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 3.4, 0, TAU); ctx.fill();
}

function drawSpeakerStatic(ctx, s) {
  const { x, y, w, h } = s;
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  roundRect(ctx, x + 10, y + 14, w, h, 8); ctx.fill();
  // Cara superior
  ctx.fillStyle = '#4b4658'; ctx.strokeStyle = '#120e1a'; ctx.lineWidth = 3;
  roundRect(ctx, x, y, w, h, 8); ctx.fill(); ctx.stroke();
  const tg = ctx.createLinearGradient(x, y, x + w, y + 36);
  tg.addColorStop(0, '#7a7488'); tg.addColorStop(1, '#3c374a');
  ctx.fillStyle = tg;
  roundRect(ctx, x + 3, y + 3, w - 6, 34, 6); ctx.fill();
  ctx.strokeStyle = '#1a1422'; ctx.lineWidth = 2.4;
  roundRect(ctx, x + 16, y + 11, w - 32, 10, 5); ctx.stroke();
  // Frente
  ctx.fillStyle = '#17131f';
  roundRect(ctx, x + 3, y + 38, w - 6, h - 41, 5); ctx.fill();
  // Pega de colores (luces del sonidero)
  const leds = ['#ff2fb0', '#2fe1ff', '#ffe14d'];
  for (let k = 0; k < 3; k++) { ctx.fillStyle = leds[k]; ctx.beginPath(); ctx.arc(x + w - 12 - k * 8, y + 44, 2.2, 0, TAU); ctx.fill(); }
  // Bocinas (conos)
  for (const cx of [x + 20, x + w - 20]) {
    const cy = y + 62;
    ctx.fillStyle = '#0b0910'; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6a6478'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#26212f'; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#403a4e'; ctx.beginPath(); ctx.arc(cx, cy, 4.6, 0, TAU); ctx.fill();
  }
}

function drawDiablito(ctx, d, rng) {
  const { x, y } = d;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 12, 24, 20, 0.3, 0, TAU); ctx.fill();
  // Ruedas
  ctx.fillStyle = '#17131f';
  roundRect(ctx, x - 24, y + 4, 10, 22, 4); ctx.fill();
  roundRect(ctx, x + 14, y + 4, 10, 22, 4); ctx.fill();
  // Caja grande + caja pequeña + bulto
  const cols = [['#c89355', '#a87238'], ['#b98547', '#9b6a35'], ['#4f8fd6', '#366aa5'], ['#e0a64b', '#c4872f']];
  const a = cols[rng.int(0, 3)], b = cols[rng.int(0, 3)];
  ctx.lineWidth = 2.4; ctx.strokeStyle = '#2a1a0e';
  ctx.fillStyle = a[0]; roundRect(ctx, x - 20, y - 6, 40, 30, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = a[1]; ctx.fillRect(x - 20, y + 14, 40, 10);
  ctx.strokeStyle = '#f4ead0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - 20, y + 9); ctx.lineTo(x + 20, y + 9); ctx.stroke();
  ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 2.4;
  ctx.fillStyle = b[0]; roundRect(ctx, x - 15, y - 22, 30, 20, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = b[1]; ctx.fillRect(x - 15, y - 9, 30, 7);
  // Mango
  ctx.strokeStyle = '#4a4658'; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(x - 14, y - 22); ctx.lineTo(x - 14, y - 26); ctx.lineTo(x + 14, y - 26); ctx.lineTo(x + 14, y - 22); ctx.stroke();
}

function drawRing(ctx) {
  const { x, y, w, h } = RING;
  // Piso de la plaza: círculos pintados alrededor del ring
  ctx.save();
  ctx.lineWidth = 8;
  const rings = [['#ff4fa3', 262], ['#ffd23f', 280], ['#2f7dff', 298]];
  for (const [c, r] of rings) { ctx.strokeStyle = rgba(c, 0.6); ctx.setLineDash([26, 18]); ctx.beginPath(); ctx.arc(CX, CY, r, 0, TAU); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.restore();
  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  roundRect(ctx, x + 14, y + 20, w, h, 12); ctx.fill();
  // Plataforma de madera
  ctx.fillStyle = '#6b4a2b'; ctx.strokeStyle = '#1a120a'; ctx.lineWidth = 4;
  roundRect(ctx, x, y, w, h, 12); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
  for (let k = 1; k < 8; k++) { ctx.beginPath(); ctx.moveTo(x, y + (h / 8) * k); ctx.lineTo(x + w, y + (h / 8) * k); ctx.stroke(); }
  // Lona del cuadrilátero
  const cg = ctx.createRadialGradient(CX - 30, CY - 30, 10, CX, CY, 140);
  cg.addColorStop(0, '#4f86ff'); cg.addColorStop(1, '#1d46b8');
  ctx.fillStyle = cg; ctx.strokeStyle = '#0d1d54'; ctx.lineWidth = 3;
  roundRect(ctx, x + 22, y + 22, w - 44, h - 44, 6); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(CX, CY, 44, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CX, y + 30); ctx.lineTo(CX, y + h - 30); ctx.moveTo(x + 30, CY); ctx.lineTo(x + w - 30, CY); ctx.stroke();
  outlinedText(ctx, 'BOX', CX, CY + 2, 38, '#ffffff', '#0d1d54', 90);
  emojiText(ctx, '🥊', CX - 62, CY - 62, 26);
  emojiText(ctx, '🥊', CX + 62, CY + 62, 26);
  // Esquineros y cuerdas
  const pc = ['#e63946', '#ffffff', '#2f7dff', '#e63946'];
  const posts = [[x + 22, y + 22], [x + w - 22, y + 22], [x + w - 22, y + h - 22], [x + 22, y + h - 22]];
  const ropes = ['#e63946', '#ffffff', '#2f7dff'];
  ctx.lineJoin = 'miter';
  for (let r = 0; r < 3; r++) {
    const o = r * 3.6;
    ctx.strokeStyle = 'rgba(10,6,20,0.55)'; ctx.lineWidth = 5.4;
    ctx.strokeRect(x + 22 + o, y + 22 + o, w - 44 - o * 2, h - 44 - o * 2);
    ctx.strokeStyle = ropes[r]; ctx.lineWidth = 3;
    ctx.strokeRect(x + 22 + o, y + 22 + o, w - 44 - o * 2, h - 44 - o * 2);
  }
  ctx.lineJoin = 'round';
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = pc[k]; ctx.strokeStyle = '#0d0a14'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(posts[k][0], posts[k][1], 11, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(posts[k][0] - 3, posts[k][1] - 3, 3.4, 0, TAU); ctx.fill();
  }
  // Campana en el poste suroeste
  emojiText(ctx, '🔔', x + 8, y + h + 14, 22);
}

function drawMarketFloor(ctx, m, rng) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, m.x - 9, m.y - 9, m.w + 18, m.h + 18, 14); ctx.fill();
  ctx.fillStyle = '#7d7889';
  roundRect(ctx, m.x - 12, m.y - 12, m.w + 24, m.h + 24, 14); ctx.fill();
  ctx.strokeStyle = '#b8b2c6'; ctx.lineWidth = 3; ctx.stroke();
  const g = ctx.createLinearGradient(m.x, m.y, m.x + m.w, m.y + m.h);
  g.addColorStop(0, '#7a6f66'); g.addColorStop(1, '#615a62');
  ctx.fillStyle = g;
  roundRect(ctx, m.x, m.y, m.w, m.h, 8); ctx.fill();
  roundRect(ctx, m.x, m.y, m.w, m.h, 8); ctx.clip();
  // Baldosas
  ctx.strokeStyle = 'rgba(20,12,24,0.28)'; ctx.lineWidth = 1.6;
  for (let k = m.x; k < m.x + m.w; k += 46) { ctx.beginPath(); ctx.moveTo(k, m.y); ctx.lineTo(k, m.y + m.h); ctx.stroke(); }
  for (let k = m.y; k < m.y + m.h; k += 46) { ctx.beginPath(); ctx.moveTo(m.x, k); ctx.lineTo(m.x + m.w, k); ctx.stroke(); }
  // Cartones y manchas
  for (let k = 0; k < 14; k++) {
    ctx.fillStyle = rng.next() < 0.5 ? 'rgba(200,150,90,0.55)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(m.x + rng.next() * m.w, m.y + rng.next() * m.h, 14 + rng.next() * 22, 10 + rng.next() * 14);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Fondo (se pinta una sola vez en un offscreen de 3000x3000)
// ---------------------------------------------------------------------------
function drawStreets(ctx, rng) {
  const tile = noiseTile(256, '#4a4554', [
    { color: '#3a3544', alpha: 0.55, n: 320, rmin: 0.6, rmax: 1.9 },
    { color: '#5d576b', alpha: 0.45, n: 240, rmin: 0.5, rmax: 1.5 },
    { color: '#2a2634', alpha: 0.3, n: 26, rmin: 1.8, rmax: 4 },
  ], rng);
  fillTiled(ctx, tile, 0, 0, W, H, '#4a4554');
  for (let i = 0; i < 90; i++) {
    const x = rng.range(0, W), y = rng.range(0, H), r = rng.range(110, 320);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng.next() < 0.55 ? 'rgba(12,8,22,0.17)' : 'rgba(150,140,180,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Líneas amarillas discontinuas al centro de cada calle
  ctx.save();
  ctx.strokeStyle = 'rgba(242,194,48,0.7)'; ctx.lineWidth = 4; ctx.setLineDash([34, 30]);
  for (let k = 0; k < 4; k++) {
    const c = gx(k) + B + S / 2;
    ctx.beginPath(); ctx.moveTo(c, M); ctx.lineTo(c, H - M); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(M, c); ctx.lineTo(W - M, c); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Cebras en las bocas de cada cruce
  ctx.fillStyle = 'rgba(238,234,214,0.5)';
  for (let a = 0; a < 4; a++) {
    for (let b2 = 0; b2 < 4; b2++) {
      const x0 = gx(a) + B, y0 = gx(b2) + B;
      for (let k = 0; k < 7; k++) {
        const o = 16 + k * 28;
        ctx.fillRect(x0 + o, y0 - 46, 14, 32);
        ctx.fillRect(x0 + o, y0 + S + 14, 14, 32);
        ctx.fillRect(x0 - 46, y0 + o, 32, 14);
        ctx.fillRect(x0 + S + 14, y0 + o, 32, 14);
      }
    }
  }
  ctx.restore();
  // Grietas, alcantarillas y charcos
  ctx.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    let x = rng.range(60, W - 60), y = rng.range(60, H - 60);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) { x += rng.range(-30, 30); y += rng.range(-30, 30); ctx.lineTo(x, y); }
    ctx.strokeStyle = 'rgba(8,6,16,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const sx = gx(rng.int(0, 3)) + B + S / 2 + rng.range(-50, 50);
    const sy = gx(rng.int(0, 4)) + rng.range(0, B);
    ctx.fillStyle = '#201c28'; ctx.strokeStyle = '#100c16'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 20, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(130,125,150,0.5)'; ctx.lineWidth = 1.4;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(sx - 14, sy + k * 6); ctx.lineTo(sx + 14, sy + k * 6); ctx.stroke(); }
  }
  for (let i = 0; i < 18; i++) {
    const px = rng.range(200, W - 200), py = rng.range(200, H - 200);
    const g = ctx.createRadialGradient(px - 6, py - 4, 2, px, py, 40);
    g.addColorStop(0, 'rgba(120,150,200,0.45)'); g.addColorStop(1, 'rgba(60,70,110,0.05)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(px, py, 38, 17, rng.range(-0.3, 0.3), 0, TAU); ctx.fill();
  }
}

function drawPerimeter(ctx, rng) {
  const drawSide = (len, rot) => {
    ctx.save();
    if (rot === 1) { ctx.translate(W, 0); ctx.rotate(Math.PI / 2); }
    else if (rot === 2) { ctx.translate(W, H); ctx.rotate(Math.PI); }
    else if (rot === 3) { ctx.translate(0, H); ctx.rotate(-Math.PI / 2); }
    ctx.fillStyle = '#b8825a';
    ctx.fillRect(0, 0, len, WALL);
    let x = 0, v = rot * 2;
    while (x < len - 20) {
      const sw = Math.min(len - x, 300 + rng.int(0, 160));
      if (sw > 60) drawMural(ctx, x + 4, 5, sw - 8, WALL - 10, v++, rng);
      x += sw;
    }
    // Remate y sombra interior del muro
    ctx.fillStyle = '#d9b48a'; ctx.fillRect(0, 0, len, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(0, WALL, len, 10);
    ctx.fillStyle = '#2a1a12'; ctx.fillRect(0, WALL - 3, len, 3);
    ctx.restore();
  };
  drawSide(W, 0); drawSide(H, 1); drawSide(W, 2); drawSide(H, 3);
  // Banqueta junto al muro
  ctx.strokeStyle = 'rgba(184,178,198,0.8)'; ctx.lineWidth = 5;
  ctx.strokeRect(WALL + 6, WALL + 6, W - WALL * 2 - 12, H - WALL * 2 - 12);
}

function drawPapelPicado(ctx, rng) {
  // Cadenas de papel picado sobre las calles: sombra en el piso + banderines de colores
  const cols = ['#ff4fa3', '#2f7dff', '#ffd23f', '#3ddc97', '#ff7a2f', '#a855f7'];
  const strings = [];
  for (let a = 0; a < 4; a++) {
    for (let b2 = 0; b2 < 5; b2++) {
      // Calle vertical (cruza de manzana a manzana) en la fila b2
      if (rng.next() < 0.7) strings.push([gx(a) + B - 6, gx(b2) + B * (0.3 + rng.next() * 0.4), gx(a + 1) + 6, gx(b2) + B * (0.3 + rng.next() * 0.4)]);
      if (rng.next() < 0.7) strings.push([gx(b2) + B * (0.3 + rng.next() * 0.4), gx(a) + B - 6, gx(b2) + B * (0.3 + rng.next() * 0.4), gx(a + 1) + 6]);
    }
  }
  for (const [x0, y0, x1, y1] of strings) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const sag = 10;
    // Sombra
    ctx.save();
    ctx.translate(16, 26);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let t = 8; t < len - 8; t += 17) {
      const u = t / len;
      const px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * sag * 0.5;
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.fillRect(-6, 0, 12, 16); ctx.restore();
    }
    ctx.restore();
    // Cuerda y banderines
    ctx.strokeStyle = 'rgba(40,30,50,0.75)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1); ctx.stroke();
    let ci = rng.int(0, 5);
    for (let t = 8; t < len - 8; t += 17) {
      const u = t / len;
      const px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * sag * 0.5;
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
      ctx.fillStyle = cols[ci++ % cols.length];
      ctx.globalAlpha = 0.92;
      ctx.fillRect(-6, 0, 12, 16);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(0, 5, 2.2, 0, TAU); ctx.arc(-3.4, 11, 1.6, 0, TAU); ctx.arc(3.4, 11, 1.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
}

// Resplandores de color sobre el piso (antes de pintar edificios y puestos, para no desteñirlos)
function drawGroundLights(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of STALLS) glowSpot(ctx, s.x + s.w / 2, s.y + s.h / 2 + 18, 120, s.c, 0.13);
  for (let a = 0; a < 4; a++) for (let b2 = 0; b2 < 4; b2++) glowSpot(ctx, gx(a) + B + S / 2, gx(b2) + B + S / 2, 240, '#ffb347', 0.2);
  glowSpot(ctx, CX, CY, 420, '#ffd27a', 0.2);
  ctx.restore();
}

function drawLampPosts(ctx) {
  for (let a = 0; a < 4; a++) for (let b2 = 0; b2 < 4; b2++) {
    const x = gx(a) + B + S / 2, y = gx(b2) + B + S / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 5, y + 7, 9, 6, 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2733'; ctx.strokeStyle = '#120e1a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(x, y, 3.8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(x - 0.8, y - 0.8, 1.6, 0, TAU); ctx.fill();
  }
}

function drawBackground(ctx) {
  const rng = decorRng(0x7E917);
  ctx.save();
  ctx.lineJoin = 'round';
  drawStreets(ctx, rng);
  drawPerimeter(ctx, rng);
  for (const m of MARKETS) drawMarketFloor(ctx, m, rng);
  drawGroundLights(ctx);
  // Plaza del ring: suelo pintado
  ctx.fillStyle = 'rgba(255,210,63,0.10)';
  ctx.beginPath(); ctx.arc(CX, CY, 330, 0, TAU); ctx.fill();
  drawRing(ctx);
  for (const b of BUILDINGS) drawBuilding(ctx, b, rng);
  for (const s of STALLS) drawStall(ctx, s, rng);
  for (const s of SPEAKERS) drawSpeakerStatic(ctx, s);
  for (const d of DIABLITOS) drawDiablito(ctx, d, rng);
  drawPapelPicado(ctx, rng);
  drawLampPosts(ctx);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Capa dinámica: las bocinas laten con el bajo y las luces del ring parpadean
// ---------------------------------------------------------------------------
function drawObstacles(ctx, cam) {
  const t = clockSeconds();
  const beat = (t * 2.1) % 1;
  const kick = Math.exp(-beat * 5.5);
  for (const s of SPEAKERS) {
    if (!inView(cam, s.x + s.w / 2, s.y + s.h / 2, 120)) continue;
    ctx.save();
    for (const cx of [s.x + 20, s.x + s.w - 20]) {
      const cy = s.y + 62;
      ctx.fillStyle = 'rgba(' + (60 + kick * 120 | 0) + ',' + (50 + kick * 30 | 0) + ',' + (80 + kick * 60 | 0) + ',1)';
      ctx.beginPath(); ctx.arc(cx, cy, 8.5 + kick * 2.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,240,' + (0.55 * kick) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 15 + (1 - kick) * 4, 0, TAU); ctx.stroke();
    }
    // Ondas de sonido hacia el frente
    for (let k = 0; k < 2; k++) {
      const ph = (t * 1.2 + k * 0.5) % 1;
      ctx.strokeStyle = 'rgba(255,230,160,' + (0.35 * (1 - ph)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h, 10 + ph * 46, 0.2, Math.PI - 0.2); ctx.stroke();
    }
    ctx.restore();
  }
  // Foquitos alrededor del ring
  if (inView(cam, CX, CY, 340)) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cols = ['#ff4fa3', '#ffd23f', '#2f7dff'];
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * TAU;
      const on = Math.sin(t * 5 + k * 0.9) > 0.1;
      if (!on) continue;
      drawGlow(ctx, CX + Math.cos(a) * 168, CY + Math.sin(a) * 168, 22, cols[k % 3], 0.5);
    }
    ctx.restore();
  }
}

export default {
  id: 'tepito',
  nombre: 'Tepito: el Barrio Bravo',
  descripcion: 'Calles, callejones angostos y tianguis de lonas de colores alrededor de un ring de box callejero. El embudo perfecto para el área y el bazuca.',
  w: W,
  h: H,
  spawn: { x: CX, y: PLAZA.y + PLAZA.h - 26 },
  fondo: '#2a2236',
  obstacles: OBSTACLES,
  drawBackground,
  drawObstacles,
};
