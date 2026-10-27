// maps/reforma.js (ANG-W) - Reforma: Glorieta del Ángel. Arena abierta de 3200x2000 de noche.
// Columna dorada al centro (obstáculo sólido), fuentes, autos abandonados, camellones con árboles,
// macetones de cempasúchil y cuatro parques en las esquinas. Es un dato: no tiene lógica de juego.
//
// Obstáculos: { type:'circle', x, y, r, kind } | { type:'rect', x, y, w, h, kind } con (x,y) = esquina superior izquierda.

import {
  TAU, decorRng, shade, roundRect, makeCanvas, noiseTile, fillTiled, glowSpot, drawGlow, inView, clockSeconds,
} from '../world.js';

const W = 3200;
const H = 2000;
const CX = 1600;
const CY = 1000;
const BORDER = 84;

const PAL = {
  asphalt: '#343845',
  sidewalk: '#7a7589',
  curb: '#b9b4c6',
  grass: '#2d6a3e',
  stone: '#a39b86',
  gold: '#f5b82e',
  goldLight: '#ffe08a',
  goldDark: '#a8710f',
  marigold: ['#ff8a1a', '#ffa51f', '#f26a0f', '#ffb62e'],
  laneWhite: 'rgba(238,234,214,0.78)',
  laneYellow: '#f2c230',
};

// ---------------------------------------------------------------------------
// Disposición (datos)
// ---------------------------------------------------------------------------
const PARKS = [
  { x: 150, y: 150, w: 1110, h: 440, sx: -1, sy: -1 },
  { x: 1940, y: 150, w: 1110, h: 440, sx: 1, sy: -1 },
  { x: 150, y: 1410, w: 1110, h: 440, sx: -1, sy: 1 },
  { x: 1940, y: 1410, w: 1110, h: 440, sx: 1, sy: 1 },
];

// Árboles de parque (desplazamientos desde el centro del parque, ya espejados por cuadrante)
const PARK_TREES = [[-440, -130], [-300, 140], [-180, -150], [200, -150], [310, 150], [450, -110]];

// Camellones (rect). Los árboles se dibujan encima.
const MEDIANS = [
  { x: 150, y: 972, w: 410, h: 56 },
  { x: 700, y: 972, w: 290, h: 56 },
  { x: 2210, y: 972, w: 290, h: 56 },
  { x: 2640, y: 972, w: 410, h: 56 },
  { x: 1572, y: 120, w: 56, h: 400 },
  { x: 1572, y: 1480, w: 56, h: 400 },
];

// Autos abandonados: (x,y) = centro. Horizontales 150x72, verticales 72x150. Autobús 300x84.
const CARS = [
  { x: 330, y: 700, kind: 'taxi', hz: true },
  { x: 560, y: 860, color: '#2e86c1' },
  { x: 900, y: 780, color: '#c0392b', hz: true },
  { x: 2330, y: 780, kind: 'bus' },
  { x: 2700, y: 700, color: '#f4d03f' },
  { x: 2880, y: 850, color: '#7d3c98' },
  { x: 2960, y: 700, kind: 'taxi' },
  { x: 410, y: 1105, color: '#16a085' },
  { x: 640, y: 1292, kind: 'bus', bx: 1 },
  { x: 1040, y: 1180, color: '#ecf0f1' },
  { x: 2330, y: 1120, color: '#e67e22', hz: true },
  { x: 2640, y: 1270, color: '#2c3e50' },
  { x: 2970, y: 1170, kind: 'taxi' },
  { x: 1413, y: 270, v: true, color: '#c0392b' },
  { x: 1787, y: 300, v: true, kind: 'taxi', hz: true },
  { x: 1681, y: 410, v: true, color: '#2e86c1' },
  { x: 1413, y: 590, v: true, color: '#f4d03f' },
  { x: 1413, y: 1610, v: true, color: '#7d3c98' },
  { x: 1787, y: 1720, v: true, color: '#16a085', hz: true },
  { x: 1681, y: 1560, v: true, kind: 'taxi' },
  { x: 1519, y: 1790, v: true, color: '#ecf0f1' },
];

// Bloqueos de concreto en los extremos de las vías (también son obstáculos)
const BARRICADES = [
  { x: BORDER + 6, y: 668, w: 38, h: 326, horiz: false },
  { x: BORDER + 6, y: 1006, w: 38, h: 326, horiz: false },
  { x: W - BORDER - 44, y: 668, w: 38, h: 326, horiz: false },
  { x: W - BORDER - 44, y: 1006, w: 38, h: 326, horiz: false },
  { x: 1368, y: BORDER + 6, w: 192, h: 38, horiz: true },
  { x: 1640, y: BORDER + 6, w: 192, h: 38, horiz: true },
  { x: 1368, y: H - BORDER - 44, w: 192, h: 38, horiz: true },
  { x: 1640, y: H - BORDER - 44, w: 192, h: 38, horiz: true },
];

const FOUNTAIN_R = 72;
const TREE_R = 28;
const PLANTER_R = 34;
const COLUMN_R = 118;

function buildObstacles() {
  const out = [];
  out.push({ type: 'circle', x: CX, y: CY, r: COLUMN_R, kind: 'columna' });
  for (const p of PARKS) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    out.push({ type: 'circle', x: cx, y: cy, r: FOUNTAIN_R, kind: 'fuente' });
    for (const [ox, oy] of PARK_TREES) {
      out.push({ type: 'circle', x: cx + ox * p.sx, y: cy + oy * p.sy, r: TREE_R, kind: 'arbol' });
    }
  }
  for (const m of MEDIANS) out.push({ type: 'rect', x: m.x, y: m.y, w: m.w, h: m.h, kind: 'camellon' });
  for (const b of BARRICADES) out.push({ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, kind: 'barricada' });
  for (const c of carRects()) out.push({ type: 'rect', x: c.x, y: c.y, w: c.w, h: c.h, kind: c.kind === 'bus' ? 'autobus' : 'auto' });
  for (const pl of planterSpots()) out.push({ type: 'circle', x: pl.x, y: pl.y, r: PLANTER_R, kind: 'maceta' });
  return out;
}

function carRects() {
  return CARS.map((c) => {
    let w = 150, h = 72;
    if (c.kind === 'bus') { w = 300; h = 84; }
    if (c.v) { const t = w; w = h; h = t; }
    return { ...c, x: c.x - w / 2, y: c.y - h / 2, w, h };
  });
}

function planterSpots() {
  const spots = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 6) + (i * Math.PI) / 3;
    spots.push({ x: Math.round(CX + Math.cos(a) * 400), y: Math.round(CY + Math.sin(a) * 400) });
  }
  return spots;
}

const OBSTACLES = buildObstacles();
const FOUNTAINS = PARKS.map((p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 }));
const HAZARD_CARS = carRects().filter((c) => c.hz);
const BARRICADE_LIGHTS = [];

// ---------------------------------------------------------------------------
// Utilidades de dibujo propias del mapa
// ---------------------------------------------------------------------------
function marigold(ctx, x, y, r, rng) {
  const c = PAL.marigold[(rng.next() * PAL.marigold.length) | 0];
  ctx.fillStyle = c;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + r;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd95a';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,40,0,0.35)';
  ctx.beginPath();
  ctx.arc(x + r * 0.1, y + r * 0.12, r * 0.18, 0, TAU);
  ctx.fill();
}

function marigoldBed(ctx, rng, cx, cy, rx, ry, n) {
  // Hojas primero
  ctx.fillStyle = '#1f5a30';
  for (let i = 0; i < n * 0.8; i++) {
    const a = rng.next() * TAU, d = Math.sqrt(rng.next());
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 6, 3.4, rng.next() * TAU, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < n; i++) {
    const a = rng.next() * TAU, d = Math.sqrt(rng.next());
    marigold(ctx, cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 4.2 + rng.next() * 2.6, rng);
  }
}

function pavers(size, base, line, rng) {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = rng.next() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    g.fillRect(rng.next() * size, rng.next() * size, 3 + rng.next() * 7, 2 + rng.next() * 5);
  }
  g.strokeStyle = line;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, 0.75); g.lineTo(size, 0.75);
  g.moveTo(0.75, 0); g.lineTo(0.75, size);
  g.moveTo(0, size / 2); g.lineTo(size, size / 2);
  g.moveTo(size / 2, 0); g.lineTo(size / 2, size / 2);
  g.stroke();
  return c;
}

function drawTree(ctx, x, y, r, rng) {
  ctx.save();
  // Sombra proyectada hacia abajo-derecha
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.55, y + r * 0.75, r * 1.05, r * 0.8, 0.4, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#123821';
  ctx.fillStyle = '#1d5a33';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
  const blobs = [[-0.32, -0.3, 0.62, '#2b7a46'], [0.3, -0.18, 0.55, '#2f8349'], [-0.1, 0.32, 0.5, '#26703f'], [-0.22, -0.4, 0.34, '#43a55c']];
  for (const b of blobs) {
    ctx.fillStyle = b[3];
    ctx.beginPath(); ctx.arc(x + b[0] * r, y + b[1] * r, b[2] * r, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(160,230,150,0.35)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(x - r * 0.35 + rng.next() * r * 0.5, y - r * 0.4 + rng.next() * r * 0.5, 2 + rng.next() * 3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawCar(ctx, c) {
  const horiz = c.w >= c.h;
  const L = Math.max(c.w, c.h), Wd = Math.min(c.w, c.h);
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  const isBus = c.kind === 'bus';
  const body = c.kind === 'taxi' ? '#ff6fb5' : isBus ? '#c8102e' : c.color;
  // Sombra
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  roundRect(ctx, c.x + 9, c.y + 13, c.w, c.h, 16);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  if (!horiz) ctx.rotate(Math.PI / 2);
  if (c.bx || (!isBus && ((c.x * 7 + c.y * 3) | 0) % 2 === 0)) ctx.scale(-1, 1);
  const hl = L / 2, hw = Wd / 2;
  // Ruedas
  ctx.fillStyle = '#14121a';
  for (const sx of isBus ? [-0.34, 0.3] : [-0.3, 0.3]) {
    for (const sy of [-1, 1]) {
      roundRect(ctx, L * sx - 14, sy * (hw - 1) - 5, 28, 10, 4);
      ctx.fill();
    }
  }
  // Carrocería
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#161224';
  roundRect(ctx, -hl, -hw, L, Wd, isBus ? 12 : 17);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.stroke();
  // Brillo (luz desde arriba-izquierda)
  const grad = ctx.createLinearGradient(0, -hw, 0, hw);
  grad.addColorStop(0, 'rgba(255,255,255,0.28)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.3)');
  roundRect(ctx, -hl + 2, -hw + 2, L - 4, Wd - 4, isBus ? 10 : 15);
  ctx.fillStyle = grad;
  ctx.fill();

  if (isBus) {
    // Techo con franja blanca, unidades de aire y ventanas laterales
    ctx.fillStyle = '#f4f1e6';
    ctx.fillRect(-hl + 14, -9, L - 28, 18);
    ctx.fillStyle = '#7b1020';
    ctx.fillRect(-hl + 14, -11, L - 28, 3);
    ctx.fillRect(-hl + 14, 8, L - 28, 3);
    ctx.fillStyle = '#9aa3b0';
    for (const ux of [-80, 0, 80]) { roundRect(ctx, ux - 22, -26, 44, 14, 3); ctx.fill(); roundRect(ctx, ux - 22, 12, 44, 14, 3); ctx.fill(); }
    ctx.fillStyle = '#1d2a44';
    for (let wx = -hl + 24; wx < hl - 40; wx += 28) { ctx.fillRect(wx, -hw + 4, 20, 5); ctx.fillRect(wx, hw - 9, 20, 5); }
    ctx.fillStyle = '#1d2a44';
    roundRect(ctx, hl - 30, -hw + 6, 20, Wd - 12, 5);
    ctx.fill();
    ctx.fillStyle = '#fff6bf';
    ctx.fillRect(hl - 6, -hw + 8, 4, 10);
    ctx.fillRect(hl - 6, hw - 18, 4, 10);
  } else {
    // Cabina
    const roof = c.kind === 'taxi' ? '#fdf2f8' : shade(body, 0.18);
    roundRect(ctx, -L * 0.23, -hw + 8, L * 0.46, Wd - 16, 11);
    ctx.fillStyle = roof;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(22,18,36,0.85)';
    ctx.stroke();
    // Parabrisas y medallón
    ctx.fillStyle = '#1d2a44';
    roundRect(ctx, L * 0.2, -hw + 10, L * 0.12, Wd - 20, 5);
    ctx.fill();
    roundRect(ctx, -L * 0.33, -hw + 11, L * 0.1, Wd - 22, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(L * 0.22, -hw + 12, 3, Wd - 24);
    // Línea de puertas
    ctx.strokeStyle = 'rgba(22,18,36,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-2, -hw + 3); ctx.lineTo(-2, -hw + 8);
    ctx.moveTo(-2, hw - 3); ctx.lineTo(-2, hw - 8);
    ctx.stroke();
    if (c.kind === 'taxi') {
      ctx.fillStyle = '#ffd23f';
      roundRect(ctx, -9, -7, 18, 14, 3);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#161224';
      ctx.stroke();
    }
  }
  // Faros y calaveras
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath(); ctx.ellipse(hl - 4, -hw * 0.62, 3.4, 5, 0, 0, TAU); ctx.ellipse(hl - 4, hw * 0.62, 3.4, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e53935';
  ctx.beginPath(); ctx.ellipse(-hl + 4, -hw * 0.62, 2.8, 5, 0, 0, TAU); ctx.ellipse(-hl + 4, hw * 0.62, 2.8, 5, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

// Unos pétalos de cempasúchil sobre algunos autos (ofrenda)
function carPetals(ctx, c, rng) {
  ctx.fillStyle = '#ff9a1f';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse(c.x + c.w * (0.25 + rng.next() * 0.5), c.y + c.h * (0.2 + rng.next() * 0.6), 3.2, 1.7, rng.next() * 3, 0, TAU);
    ctx.fill();
  }
}

function drawFountainStatic(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x + 12, y + 16, FOUNTAIN_R, FOUNTAIN_R * 0.92, 0.3, 0, TAU); ctx.fill();
  // Borde de piedra
  let g = ctx.createRadialGradient(x - 20, y - 20, 8, x, y, FOUNTAIN_R);
  g.addColorStop(0, '#dcd6c4'); g.addColorStop(1, '#8e8774');
  ctx.fillStyle = g; ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, FOUNTAIN_R, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6f6958';
  ctx.beginPath(); ctx.arc(x, y, FOUNTAIN_R - 9, 0, TAU); ctx.fill();
  // Agua
  g = ctx.createRadialGradient(x - 14, y - 14, 4, x, y, FOUNTAIN_R - 12);
  g.addColorStop(0, '#7de6f2'); g.addColorStop(0.7, '#2ba6c6'); g.addColorStop(1, '#16799c');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, FOUNTAIN_R - 12, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.6;
  for (const rr of [24, 36, 48]) { ctx.beginPath(); ctx.arc(x, y, rr, 0.3, 2.2); ctx.stroke(); }
  // Pilar central y taza
  ctx.fillStyle = '#c9c2ae'; ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9fe9f2';
  ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.arc(x - 3, y - 3, 3.4, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawPlanter(ctx, x, y, rng) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 12, PLANTER_R, PLANTER_R * 0.9, 0.3, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 2.6;
  let g = ctx.createRadialGradient(x - 8, y - 8, 3, x, y, PLANTER_R);
  g.addColorStop(0, '#d98a5a'); g.addColorStop(1, '#9a4b24');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, PLANTER_R, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3b2a1c';
  ctx.beginPath(); ctx.arc(x, y, PLANTER_R - 6, 0, TAU); ctx.fill();
  ctx.restore();
  marigoldBed(ctx, rng, x, y, PLANTER_R - 9, PLANTER_R - 9, 16);
}

function drawLampPost(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x + 5, y + 7, 9, 6, 0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2b2733'; ctx.strokeStyle = '#120e1a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd98a';
  ctx.beginPath(); ctx.arc(x, y, 3.8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fffbe8';
  ctx.beginPath(); ctx.arc(x - 0.8, y - 0.8, 1.7, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Fondo (se pinta una sola vez en un offscreen de 3200x2000)
// ---------------------------------------------------------------------------
function drawGround(ctx, rng) {
  const tile = noiseTile(256, PAL.asphalt, [
    { color: '#292c37', alpha: 0.55, n: 320, rmin: 0.6, rmax: 1.9 },
    { color: '#4b5164', alpha: 0.45, n: 240, rmin: 0.5, rmax: 1.5 },
    { color: '#1d2029', alpha: 0.3, n: 26, rmin: 1.8, rmax: 4 },
  ], rng);
  fillTiled(ctx, tile, 0, 0, W, H, PAL.asphalt);
  // Manchas grandes para que no se note la repetición del mosaico
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, W), y = rng.range(0, H), r = rng.range(120, 360);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng.next() < 0.55;
    g.addColorStop(0, dark ? 'rgba(10,10,20,0.16)' : 'rgba(120,130,160,0.09)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Grietas y parches
  ctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    let x = rng.range(100, W - 100), y = rng.range(100, H - 100);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 3 + (rng.next() * 5) | 0;
    for (let s = 0; s < segs; s++) { x += rng.range(-34, 34); y += rng.range(-34, 34); ctx.lineTo(x, y); }
    ctx.strokeStyle = 'rgba(8,8,16,0.42)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Marcas de llanta en las vías
  ctx.strokeStyle = 'rgba(10,10,18,0.28)';
  ctx.lineWidth = 7;
  for (let i = 0; i < 22; i++) {
    const y = rng.next() < 0.5 ? rng.range(700, 960) : rng.range(1040, 1300);
    const x = rng.range(100, 2900);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 120, y + rng.range(-30, 30), x + 240, y + rng.range(-30, 30), x + rng.range(300, 520), y + rng.range(-20, 20));
    ctx.stroke();
  }
  // Alcantarillas
  for (const [mx, my] of [[820, 1000 - 70], [2380, 1000 + 70], [1600 - 70, 380], [1600 + 70, 1620], [1230, 660 + 30]]) {
    ctx.fillStyle = '#23252e'; ctx.strokeStyle = '#14151b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, 22, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,125,145,0.5)'; ctx.lineWidth = 1.4;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(mx - 15, my + k * 6); ctx.lineTo(mx + 15, my + k * 6); ctx.stroke(); }
  }
}

function drawRoadMarkings(ctx) {
  ctx.save();
  // Líneas de carril de la avenida (discontinuas)
  ctx.strokeStyle = PAL.laneWhite;
  ctx.lineWidth = 5;
  ctx.setLineDash([46, 38]);
  for (const y of [740, 820, 900, 1100, 1180, 1260]) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1000, y); ctx.moveTo(2200, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // Calle vertical
  for (const x of [1466, 1734]) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 470); ctx.moveTo(x, 1530); ctx.lineTo(x, H); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Líneas de borde de la avenida
  ctx.lineWidth = 6;
  for (const y of [668, 1332]) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1100, y); ctx.moveTo(2100, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // Doble amarilla junto a los camellones
  ctx.strokeStyle = PAL.laneYellow;
  ctx.lineWidth = 3;
  for (const dy of [-8, 8]) {
    ctx.beginPath(); ctx.moveTo(0, 1000 + dy); ctx.lineTo(1000, 1000 + dy); ctx.moveTo(2200, 1000 + dy); ctx.lineTo(W, 1000 + dy); ctx.stroke();
  }
  for (const dx of [-8, 8]) {
    ctx.beginPath(); ctx.moveTo(1600 + dx, 0); ctx.lineTo(1600 + dx, 470); ctx.moveTo(1600 + dx, 1530); ctx.lineTo(1600 + dx, H); ctx.stroke();
  }
  // Pasos peatonales
  ctx.fillStyle = 'rgba(238,234,214,0.72)';
  for (const zx of [1034, 2122]) {
    for (let y = 672; y < 968; y += 30) ctx.fillRect(zx, y, 44, 16);
    for (let y = 1032; y < 1330; y += 30) ctx.fillRect(zx, y, 44, 16);
  }
  for (const zy of [440, 1520]) {
    for (let x = 1368; x < 1566; x += 30) ctx.fillRect(x, zy, 16, 44);
    for (let x = 1634; x < 1832; x += 30) ctx.fillRect(x, zy, 16, 44);
  }
  // Anillo de la glorieta
  ctx.strokeStyle = PAL.laneWhite;
  ctx.lineWidth = 5;
  ctx.setLineDash([44, 36]);
  ctx.beginPath(); ctx.arc(CX, CY, 376, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = PAL.laneYellow;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(CX, CY, 330, 0, TAU); ctx.stroke();
  // Flechas pintadas
  ctx.fillStyle = 'rgba(238,234,214,0.55)';
  for (const [ax, ay, dir] of [[500, 780, 0], [2700, 1180, Math.PI], [1413, 560, Math.PI / 2], [1787, 1440, -Math.PI / 2]]) {
    ctx.save();
    ctx.translate(ax, ay); ctx.rotate(dir);
    ctx.beginPath();
    ctx.moveTo(-34, -7); ctx.lineTo(8, -7); ctx.lineTo(8, -20); ctx.lineTo(36, 0); ctx.lineTo(8, 20); ctx.lineTo(8, 7); ctx.lineTo(-34, 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawBorder(ctx, rng) {
  const tile = pavers(64, '#767186', 'rgba(20,16,30,0.35)', rng);
  // Banda de banqueta alrededor de todo el mapa
  fillTiled(ctx, tile, 0, 0, W, BORDER, PAL.sidewalk);
  fillTiled(ctx, tile, 0, H - BORDER, W, BORDER, PAL.sidewalk);
  fillTiled(ctx, tile, 0, BORDER, BORDER, H - BORDER * 2, PAL.sidewalk);
  fillTiled(ctx, tile, W - BORDER, BORDER, BORDER, H - BORDER * 2, PAL.sidewalk);
  // Guarnición interior
  ctx.strokeStyle = PAL.curb;
  ctx.lineWidth = 5;
  ctx.strokeRect(BORDER, BORDER, W - BORDER * 2, H - BORDER * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(BORDER + 5, BORDER + 5, W - BORDER * 2 - 10, H - BORDER * 2 - 10);
  // Seto exterior con flores
  const hedge = (x, y, w, h, horiz) => {
    ctx.fillStyle = '#1b4a29';
    ctx.fillRect(x, y, w, h);
    const n = Math.floor((horiz ? w : h) / 22);
    for (let i = 0; i < n; i++) {
      const px = horiz ? x + 11 + i * 22 : x + w / 2;
      const py = horiz ? y + h / 2 : y + 11 + i * 22;
      ctx.fillStyle = i % 2 ? '#26703f' : '#2e8149';
      ctx.beginPath(); ctx.arc(px, py, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(150,230,140,0.3)';
      ctx.beginPath(); ctx.arc(px - 4, py - 4, 6, 0, TAU); ctx.fill();
      if (rng.next() < 0.28) marigold(ctx, px + rng.range(-5, 5), py + rng.range(-5, 5), 4, rng);
    }
    ctx.strokeStyle = '#0f2a18';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
  };
  hedge(0, 0, W, 30, true);
  hedge(0, H - 30, W, 30, true);
  hedge(0, 30, 30, H - 60, false);
  hedge(W - 30, 30, 30, H - 60, false);
  // Pilares de piedra en las esquinas
  for (const [px, py] of [[0, 0], [W - 70, 0], [0, H - 70], [W - 70, H - 70]]) {
    ctx.fillStyle = '#8c8573'; ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 3;
    roundRect(ctx, px, py, 70, 70, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b5ad97';
    roundRect(ctx, px + 10, py + 10, 50, 50, 5); ctx.fill();
    ctx.fillStyle = PAL.gold;
    ctx.beginPath(); ctx.arc(px + 35, py + 35, 11, 0, TAU); ctx.fill(); ctx.stroke();
  }
}

function drawBarricades(ctx) {
  // Bloqueos de concreto con franjas naranja en los extremos de las vías
  const block = (x, y, w, h, horiz) => {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, x + 6, y + 8, w, h, 6); ctx.fill();
    ctx.fillStyle = '#e9e6dc'; ctx.strokeStyle = '#1c1624'; ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 6); ctx.fill(); ctx.stroke();
    ctx.save();
    roundRect(ctx, x, y, w, h, 6); ctx.clip();
    ctx.fillStyle = '#ff7a1a';
    const step = 26;
    for (let i = -h; i < (horiz ? w : h) + h; i += step * 2) {
      ctx.beginPath();
      if (horiz) { ctx.moveTo(x + i, y); ctx.lineTo(x + i + step, y); ctx.lineTo(x + i + step - h, y + h); ctx.lineTo(x + i - h, y + h); }
      else { ctx.moveTo(x, y + i); ctx.lineTo(x + w, y + i - w); ctx.lineTo(x + w, y + i - w + step); ctx.lineTo(x, y + i + step); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  };
  for (const b of BARRICADES) block(b.x, b.y, b.w, b.h, b.horiz);
  BARRICADE_LIGHTS.length = 0;
  for (const y of [668, 1006, 1294]) { BARRICADE_LIGHTS.push({ x: BORDER + 25, y: y + 18 }, { x: W - BORDER - 25, y: y + 18 }); }
  for (const x of [1368, 1560, 1640, 1832]) { BARRICADE_LIGHTS.push({ x: x + 10, y: BORDER + 25 }, { x: x + 10, y: H - BORDER - 25 }); }
}

function drawParks(ctx, rng) {
  const grassTile = noiseTile(192, PAL.grass, [
    { color: '#3b8550', alpha: 0.5, n: 300, rmin: 0.8, rmax: 2.2 },
    { color: '#1f5030', alpha: 0.5, n: 260, rmin: 0.8, rmax: 2 },
    { color: '#ffd24a', alpha: 0.5, n: 8, rmin: 1.2, rmax: 1.9 },
  ], rng);
  const stoneTile = pavers(56, '#9d967f', 'rgba(40,32,22,0.35)', rng);
  for (const p of PARKS) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    // Banqueta alrededor del parque
    ctx.save();
    roundRect(ctx, p.x - 70, p.y - 70, p.w + 140, p.h + 140, 34);
    ctx.fillStyle = ctx.createPattern(pavers(64, '#7a7589', 'rgba(20,16,30,0.35)', rng) || document.createElement('canvas'), 'repeat');
    ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = PAL.curb; ctx.stroke();
    // Césped
    roundRect(ctx, p.x, p.y, p.w, p.h, 24);
    ctx.save();
    ctx.clip();
    fillTiled(ctx, grassTile, p.x, p.y, p.w, p.h, PAL.grass);
    // Franjas de siega
    for (let i = 0; i < p.w; i += 90) {
      ctx.fillStyle = (i / 90) % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect(p.x + i, p.y, 90, p.h);
    }
    // Senderos en cruz y anillo de piedra
    ctx.fillStyle = ctx.createPattern(stoneTile || document.createElement('canvas'), 'repeat');
    ctx.fillRect(p.x, cy - 30, p.w, 60);
    ctx.fillRect(cx - 30, p.y, 60, p.h);
    ctx.beginPath(); ctx.arc(cx, cy, 138, 0, TAU); ctx.arc(cx, cy, 96, 0, TAU, true); ctx.fill();
    ctx.restore();
    // Bordes de los senderos
    ctx.strokeStyle = 'rgba(30,24,16,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 138, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 96, 0, TAU); ctx.stroke();
    ctx.restore();
    // Setos bajos en el borde del césped
    ctx.strokeStyle = '#1b4a29'; ctx.lineWidth = 7;
    roundRect(ctx, p.x + 5, p.y + 5, p.w - 10, p.h - 10, 22); ctx.stroke();
    // Camas de cempasúchil en los cuatro cuadrantes del parque
    for (const [ox, oy] of [[-170, -95], [170, -95], [-170, 95], [170, 95], [-380, 0], [380, 0]]) {
      marigoldBed(ctx, rng, cx + ox * p.sx, cy + oy * p.sy, 62, 30, 46);
    }
  }
}

function drawPetalTrails(ctx, rng) {
  // Caminos de pétalos de cempasúchil que guían hacia el Ángel (ofrenda)
  const trails = [
    [[260, 330], [700, 640], [1000, 760], [1330, 900]],
    [[2940, 330], [2500, 640], [2200, 760], [1870, 900]],
    [[260, 1670], [700, 1360], [1000, 1240], [1330, 1100]],
    [[2940, 1670], [2500, 1360], [2200, 1240], [1870, 1100]],
  ];
  for (const t of trails) {
    for (let i = 0; i < 150; i++) {
      const u = rng.next();
      const m = 1 - u;
      const x = m * m * m * t[0][0] + 3 * m * m * u * t[1][0] + 3 * m * u * u * t[2][0] + u * u * u * t[3][0];
      const y = m * m * m * t[0][1] + 3 * m * m * u * t[1][1] + 3 * m * u * u * t[2][1] + u * u * u * t[3][1];
      const spread = 6 + u * 14;
      ctx.fillStyle = rng.next() < 0.7 ? '#ff8a1a' : '#ffc23a';
      ctx.globalAlpha = 0.5 + rng.next() * 0.45;
      ctx.beginPath();
      ctx.ellipse(x + rng.range(-spread, spread) * 2, y + rng.range(-spread, spread) * 2, 4 + rng.next() * 2.4, 1.9 + rng.next(), rng.next() * TAU, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawIsland(ctx, rng) {
  // Isleta de piedra
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.arc(CX + 8, CY + 10, 306, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(CX - 60, CY - 60, 40, CX, CY, 300);
  g.addColorStop(0, '#bdb59d'); g.addColorStop(1, '#948c77');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(CX, CY, 304, 0, TAU); ctx.fill();
  ctx.strokeStyle = PAL.curb; ctx.lineWidth = 12; ctx.stroke();
  ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(CX, CY, 310, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, CY, 298, 0, TAU); ctx.stroke();
  // Adoquín: anillos y radios
  ctx.strokeStyle = 'rgba(40,32,22,0.28)'; ctx.lineWidth = 2;
  for (const r of [150, 190, 230, 270]) { ctx.beginPath(); ctx.arc(CX, CY, r, 0, TAU); ctx.stroke(); }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    ctx.beginPath(); ctx.moveTo(CX + Math.cos(a) * 130, CY + Math.sin(a) * 130); ctx.lineTo(CX + Math.cos(a) * 296, CY + Math.sin(a) * 296); ctx.stroke();
  }
  ctx.restore();
  // Anillo de cempasúchil
  for (let i = 0; i < 360; i++) {
    const a = rng.next() * TAU, d = 205 + rng.next() * 52;
    if (Math.abs(((a * 4) / TAU) % 1 - 0.5) < 0.04) continue;
    marigold(ctx, CX + Math.cos(a) * d, CY + Math.sin(a) * d, 4.6 + rng.next() * 3, rng);
  }
  // Veladoras alrededor de la base
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU + 0.1;
    const x = CX + Math.cos(a) * 150, y = CY + Math.sin(a) * 150;
    glowSpot(ctx, x, y, 26, '#ffb347', 0.45);
    ctx.fillStyle = '#f4efe0'; ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, 4.4, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffcf3a';
    ctx.beginPath(); ctx.arc(x, y - 0.5, 2.2, 0, TAU); ctx.fill();
  }
}

// --- Monumento a la Independencia: vista cenital con altura (2.5D) ---------
const GOLD_HI = '#ffd966';
const GOLD_MID = '#d4a017';
const GOLD_LO = '#7a4d08';
const INK = '#2a2433';

function goldGradX(ctx, x0, x1) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#8a5a0c'); g.addColorStop(0.26, '#fff0b0'); g.addColorStop(0.5, GOLD_HI);
  g.addColorStop(0.78, GOLD_MID); g.addColorStop(1, '#7a4d08');
  return g;
}

function stoneGradX(ctx, x0, x1) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#8d8672'); g.addColorStop(0.3, '#f1ead4'); g.addColorStop(0.6, '#d3cab0'); g.addColorStop(1, '#8a8470');
  return g;
}

// Grupo escultorico de bronce visto desde arriba (Ley, Justicia, Guerra, Paz)
function bronzeGroup(ctx, x, y, a, kind) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#7e7763'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  roundRect(ctx, -19, -17, 38, 34, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#a79f88'; roundRect(ctx, -16, -14, 32, 28, 4); ctx.fill();
  const bz = ctx.createRadialGradient(-3, -3, 1, 0, 0, 16);
  bz.addColorStop(0, '#8a7a50'); bz.addColorStop(0.55, '#4a3f27'); bz.addColorStop(1, '#241d12');
  ctx.fillStyle = bz; ctx.strokeStyle = '#120d07'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(-2, 0, 7, 12, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(8, 6, 5, 8, 0.3, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(-2, -1, 4.6, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(8, 3, 3.2, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.lineCap = 'round';
  if (kind === 'ley') {
    ctx.fillStyle = '#6d5f38'; ctx.strokeStyle = '#120d07';
    ctx.fillRect(-14, -10, 9, 13); ctx.strokeRect(-14, -10, 9, 13);
    ctx.strokeStyle = '#b79a4a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-12, -6); ctx.lineTo(-7, -6); ctx.moveTo(-12, -2); ctx.lineTo(-7, -2); ctx.stroke();
  } else if (kind === 'justicia') {
    ctx.strokeStyle = '#8a7a50'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(-14, -14); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, -4); ctx.lineTo(-10, -4); ctx.stroke();
  } else if (kind === 'guerra') {
    ctx.fillStyle = '#5a4c2c'; ctx.strokeStyle = '#120d07'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(-13, 2, 7, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9c8a56'; ctx.beginPath(); ctx.arc(-13, 2, 2.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a7a50'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(12, -15); ctx.stroke();
  } else {
    ctx.strokeStyle = '#4d7a45'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-14, 10); ctx.quadraticCurveTo(-18, -2, -12, -13); ctx.stroke();
    ctx.fillStyle = '#5f9a55';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(-15 + (i % 2) * 5, 6 - i * 4.2, 3.2, 1.5, 0.5, 0, TAU); ctx.fill(); }
  }
  ctx.fillStyle = 'rgba(214,180,100,0.45)';
  ctx.beginPath(); ctx.ellipse(-4, -3, 2.2, 5, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

// Leon de bronce guiado por un nino (al frente, +y)
function lionWithChild(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#7e7763'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  roundRect(ctx, -24, -26, 48, 52, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#a79f88'; roundRect(ctx, -21, -23, 42, 46, 5); ctx.fill();
  const bz = ctx.createRadialGradient(-4, -4, 1, 0, 0, 24);
  bz.addColorStop(0, '#8a7a50'); bz.addColorStop(0.6, '#4a3f27'); bz.addColorStop(1, '#241d12');
  ctx.fillStyle = bz; ctx.strokeStyle = '#120d07'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-2, -18); ctx.quadraticCurveTo(10, -26, 9, -12); ctx.stroke();
  for (const [lx, ly] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) { ctx.beginPath(); ctx.ellipse(lx, ly, 3, 5, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(0, -2, 9, 17, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 15, 11, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6d5d38'; ctx.beginPath(); ctx.arc(0, 18, 6.2, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#120d07'; ctx.beginPath(); ctx.arc(-2, 21, 1, 0, TAU); ctx.arc(2, 21, 1, 0, TAU); ctx.fill();
  ctx.fillStyle = bz; ctx.strokeStyle = '#120d07';
  ctx.beginPath(); ctx.ellipse(16, 12, 4, 5.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(16, 16, 3.2, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#9c8a56'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(14, 12); ctx.lineTo(9, 15); ctx.stroke();
  ctx.fillStyle = 'rgba(214,180,100,0.45)'; ctx.beginPath(); ctx.ellipse(-3, -5, 2, 7, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

function laurelWreath(ctx, x, y, r) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.86, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = GOLD_MID; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.86, 0, 0, TAU); ctx.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    ctx.fillStyle = i % 2 ? GOLD_HI : '#f2b72c'; ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.86, 4.6, 2.1, a + 1.1, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function monGlint(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = '#fffbe6';
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s * 0.8, y); ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s * 0.8, y); ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
  ctx.restore();
}

function victoryFigure(ctx, vx, vy) {
  // vy = pies de la Victoria; la figura sube hacia -y
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const sy = vy - 52; // linea de hombros
  // alas abiertas hacia atras/arriba, pluma a pluma
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const ang = -Math.PI / 2 + s * (0.18 + i * 0.145);
      const len = 98 - i * 5.2;
      const w = 11 - i * 0.45;
      const rx = vx + s * 6, ry = sy + 6;
      const tx = rx + Math.cos(ang) * len, ty = ry + Math.sin(ang) * len;
      const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
      const fg = ctx.createLinearGradient(rx, ry, tx, ty);
      fg.addColorStop(0, '#fff0b0'); fg.addColorStop(0.55, GOLD_HI); fg.addColorStop(1, '#c98a10');
      ctx.fillStyle = fg; ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.quadraticCurveTo(rx + Math.cos(ang) * len * 0.5 + nx, ry + Math.sin(ang) * len * 0.5 + ny, tx, ty);
      ctx.quadraticCurveTo(rx + Math.cos(ang) * len * 0.5 - nx * 0.5, ry + Math.sin(ang) * len * 0.5 - ny * 0.5, rx, ry);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(122,77,8,0.5)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(rx + Math.cos(ang) * 6, ry + Math.sin(ang) * 6); ctx.lineTo(tx - Math.cos(ang) * 4, ty - Math.sin(ang) * 4); ctx.stroke();
    }
  }
  // tunica con pliegues
  ctx.fillStyle = goldGradX(ctx, vx - 20, vx + 20); ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(vx - 8, sy);
  ctx.quadraticCurveTo(vx - 10, sy + 20, vx - 22, vy);
  ctx.lineTo(vx + 15, vy);
  ctx.quadraticCurveTo(vx + 9, sy + 22, vx + 8, sy);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(122,77,8,0.5)'; ctx.lineWidth = 1;
  for (const f of [-12, -5, 2, 9]) {
    ctx.beginPath(); ctx.moveTo(vx + f * 0.35, sy + 14); ctx.quadraticCurveTo(vx + f * 0.8, sy + 28, vx + f, vy - 1); ctx.stroke();
  }
  // brazo derecho (a la izquierda del espectador) alzando la corona de laurel
  ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(vx - 6, sy + 4); ctx.quadraticCurveTo(vx - 16, sy - 8, vx - 24, sy - 28); ctx.stroke();
  ctx.strokeStyle = GOLD_HI; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(vx - 6, sy + 4); ctx.quadraticCurveTo(vx - 16, sy - 8, vx - 24, sy - 28); ctx.stroke();
  // brazo izquierdo con la cadena rota
  ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(vx + 7, sy + 4); ctx.quadraticCurveTo(vx + 16, sy + 8, vx + 20, sy + 18); ctx.stroke();
  ctx.strokeStyle = GOLD_HI; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(vx + 7, sy + 4); ctx.quadraticCurveTo(vx + 16, sy + 8, vx + 20, sy + 18); ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const cx2 = vx + 20 + Math.sin(i * 0.9) * 3, cy2 = sy + 20 + i * 5;
    ctx.fillStyle = i % 2 ? GOLD_MID : GOLD_HI; ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx2, cy2, 2.6, 3.6, i % 2 ? 0.6 : -0.5, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // cabeza y cabello
  ctx.fillStyle = '#fff0b0'; ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(vx, sy - 8, 8, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = GOLD_MID; ctx.beginPath(); ctx.ellipse(vx + 2, sy - 12, 8.6, 5.4, 0.3, Math.PI, TAU); ctx.fill();
  // corona de laurel alzada
  laurelWreath(ctx, vx - 25, sy - 38, 11);
  ctx.restore();
}

function drawAngelColumn(ctx) {
  const bx = CX, by = CY - 2;        // pie de la columna
  const H = 196;                       // altura aparente del fuste (hacia arriba-pantalla)
  const topY = by - 28 - H;            // remate del fuste
  const wB = 28, wT = 22;              // semiancho base / cima

  // --- Sombra larga proyectada sobre el asfalto (luz desde arriba-izquierda)
  ctx.save();
  const dx = 0.72, dy = 0.69, L = 430;
  const sg = ctx.createLinearGradient(bx, by, bx + dx * L, by + dy * L);
  sg.addColorStop(0, 'rgba(0,0,0,0.5)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(bx - 26, by + 4);
  ctx.lineTo(bx + 26, by - 8);
  ctx.lineTo(bx + 20 + dx * L, by - 8 + dy * L);
  ctx.lineTo(bx - 20 + dx * L, by + 8 + dy * L);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(bx + dx * L * 0.93, by + dy * L * 0.93, 70, 20, 0.8, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, bx - 60, CY - 56, 166, 166, 8); ctx.fill();
  ctx.restore();

  // --- Escalinata circular de la glorieta (anillos de cantera)
  const ringC = ['#8c846f', '#a39b86', '#b9b19b', '#cbc3ab', '#d8d0b8'];
  ctx.lineWidth = 2.4; ctx.strokeStyle = INK;
  for (let i = 0; i < ringC.length; i++) {
    ctx.fillStyle = ringC[i];
    ctx.beginPath(); ctx.arc(bx, CY, COLUMN_R - i * 5.5, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(42,36,51,0.28)'; ctx.lineWidth = 1;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * (COLUMN_R - 22), CY + Math.sin(a) * (COLUMN_R - 22)); ctx.lineTo(bx + Math.cos(a) * COLUMN_R, CY + Math.sin(a) * COLUMN_R); ctx.stroke();
  }

  // --- Basamento cuadrangular escalonado
  const tiers = [[82, '#aaa28b'], [72, '#bdb59e'], [62, '#cfc7ae']];
  for (const [h, c] of tiers) {
    ctx.fillStyle = c; ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
    roundRect(ctx, bx - h, CY - h, h * 2, h * 2, 4); ctx.fill(); ctx.stroke();
    const lg = ctx.createLinearGradient(bx - h, CY - h, bx + h, CY + h);
    lg.addColorStop(0, 'rgba(255,255,255,0.28)'); lg.addColorStop(0.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = lg; roundRect(ctx, bx - h, CY - h, h * 2, h * 2, 4); ctx.fill();
  }
  // Cuatro grupos de bronce en las esquinas: Ley, Justicia, Guerra y Paz
  const kinds = ['ley', 'justicia', 'guerra', 'paz'];
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
    bronzeGroup(ctx, bx + sx * 67, CY + sy * 67, Math.atan2(sy, sx), kinds[i]);
  });
  // Leon de bronce guiado por un nino, al frente
  lionWithChild(ctx, bx, CY + 78);

  // --- Columna corintia en perspectiva oblicua (se levanta hacia arriba-pantalla)
  ctx.fillStyle = stoneGradX(ctx, bx - 40, bx + 40); ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
  roundRect(ctx, bx - 40, by - 24, 80, 32, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#bfb79e';
  ctx.beginPath(); ctx.ellipse(bx, by - 24, 40, 12, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = goldGradX(ctx, bx - 32, bx + 32); ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(bx, by - 26, 31, 9, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // fuste
  const shaftBase = by - 28;
  ctx.fillStyle = stoneGradX(ctx, bx - wB, bx + wB); ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(bx - wB, shaftBase); ctx.lineTo(bx - wT, topY); ctx.lineTo(bx + wT, topY); ctx.lineTo(bx + wB, shaftBase);
  ctx.ellipse(bx, shaftBase, wB, 7.5, 0, 0, Math.PI, false);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 1.1;
  for (let k = -5; k <= 5; k++) {
    const f = k / 5.6;
    ctx.strokeStyle = k < 0 ? 'rgba(80,70,50,0.38)' : 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.moveTo(bx + f * wB, shaftBase + 3); ctx.lineTo(bx + f * wT, topY + 2); ctx.stroke();
  }
  for (const t of [0.1, 0.27, 0.46, 0.66, 0.86]) {
    const y = shaftBase + (topY - shaftBase) * t, w = wB + (wT - wB) * t;
    ctx.fillStyle = goldGradX(ctx, bx - w - 3, bx + w + 3); ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(bx, y, w + 3, 4.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // capitel dorado con hojas de acanto
  const capY = topY, capH = 30;
  ctx.fillStyle = goldGradX(ctx, bx - 30, bx + 30); ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(bx - wT, capY); ctx.lineTo(bx - 31, capY - capH); ctx.lineTo(bx + 31, capY - capH); ctx.lineTo(bx + wT, capY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(122,77,8,0.7)'; ctx.lineWidth = 1.3;
  for (let k = -3; k <= 3; k++) {
    ctx.beginPath(); ctx.moveTo(bx + k * 4.6, capY - 1); ctx.quadraticCurveTo(bx + k * 7.6 + 3, capY - capH * 0.55, bx + k * 8.8, capY - capH + 6); ctx.stroke();
  }
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.arc(bx + s * 27, capY - capH + 7, 4.2, 0, TAU); ctx.fillStyle = GOLD_HI; ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = goldGradX(ctx, bx - 36, bx + 36); ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(bx, capY - capH - 2, 36, 8.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
  const pY = capY - capH - 5;
  ctx.fillStyle = goldGradX(ctx, bx - 14, bx + 14); ctx.strokeStyle = GOLD_LO; ctx.lineWidth = 1.8;
  roundRect(ctx, bx - 12, pY - 14, 24, 14, 3); ctx.fill(); ctx.stroke();

}

// Victoria alada: se dibuja al final del fondo para quedar por encima de jardineras y camellones
function drawAngelVictory(ctx) {
  const bx = CX, by = CY - 2;
  const capH = 30, topY = by - 28 - 196;
  const pY = topY - capH - 5;
  const K = 1.32;
  const vY = pY - 12, hy = vY - 52 * K;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowSpot(ctx, bx, hy, 250, '#ffcf5a', 0.42);
  glowSpot(ctx, bx, hy, 130, GOLD_HI, 0.35);
  ctx.strokeStyle = 'rgba(255,217,102,0.22)'; ctx.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI + (i / 15) * Math.PI;
    ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * 100, hy + Math.sin(a) * 100); ctx.lineTo(bx + Math.cos(a) * 205, hy + Math.sin(a) * 205); ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(bx, vY); ctx.scale(K, K); ctx.translate(-bx, -vY);
  victoryFigure(ctx, bx, vY);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowSpot(ctx, bx - 33, vY - 120, 54, '#fff0b0', 0.7);
  ctx.restore();
  monGlint(ctx, bx - 33, vY - 120, 13);
  monGlint(ctx, bx + 70, vY - 82, 9);
  monGlint(ctx, bx - 76, vY - 52, 7);
  monGlint(ctx, bx + 6, topY - 10, 6);
}

function drawMedianTrees(ctx, rng) {
  for (const m of MEDIANS) {
    // Jardinera
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, m.x + 6, m.y + 9, m.w, m.h, 12); ctx.fill();
    ctx.fillStyle = '#9b9585'; ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 3;
    roundRect(ctx, m.x, m.y, m.w, m.h, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a3322';
    roundRect(ctx, m.x + 6, m.y + 6, m.w - 12, m.h - 12, 8); ctx.fill();
    ctx.restore();
    const horiz = m.w > m.h;
    const len = horiz ? m.w : m.h;
    const n = Math.max(1, Math.floor(len / 96));
    // Cempasúchil entre árboles y árboles encima
    for (let i = 0; i < n * 3; i++) {
      const t = (i + 0.5) / (n * 3);
      marigold(ctx, horiz ? m.x + 18 + t * (m.w - 36) : m.x + m.w / 2 + rng.range(-8, 8), horiz ? m.y + m.h / 2 + rng.range(-8, 8) : m.y + 18 + t * (m.h - 36), 4.4, rng);
    }
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      drawTree(ctx, horiz ? m.x + t * m.w : m.x + m.w / 2, horiz ? m.y + m.h / 2 : m.y + t * m.h, 30, rng);
    }
  }
}

function drawLights(ctx) {
  const lamps = [];
  for (let x = 240; x < 1100; x += 280) { lamps.push([x, 640], [x, 1360]); }
  for (let x = 2300; x < 3100; x += 280) { lamps.push([x, 640], [x, 1360]); }
  for (let y = 240; y < 560; y += 160) { lamps.push([1344, y], [1856, y]); }
  for (let y = 1440; y < 1800; y += 160) { lamps.push([1344, y], [1856, y]); }
  for (const p of PARKS) lamps.push([p.x + p.w / 2 - 90, p.y + p.h / 2], [p.x + p.w / 2 + 90, p.y + p.h / 2]);
  for (let i = 0; i < 6; i++) { const a = i * (TAU / 6); lamps.push([CX + Math.cos(a) * 318, CY + Math.sin(a) * 318]); }
  for (const [x, y] of lamps) drawLampPost(ctx, x, y);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y] of lamps) glowSpot(ctx, x, y, 210, '#ffb347', 0.2);
  ctx.restore();
}

function drawBackground(ctx) {
  const rng = decorRng(0xA4E1);
  ctx.save();
  ctx.lineJoin = 'round';
  drawGround(ctx, rng);
  drawRoadMarkings(ctx);
  drawBorder(ctx, rng);
  drawBarricades(ctx);
  drawParks(ctx, rng);
  drawPetalTrails(ctx, rng);
  drawIsland(ctx, rng);
  drawAngelColumn(ctx);
  drawMedianTrees(ctx, rng);
  for (const f of FOUNTAINS) drawFountainStatic(ctx, f.x, f.y);
  for (const p of PARKS) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (const [ox, oy] of PARK_TREES) drawTree(ctx, cx + ox * p.sx, cy + oy * p.sy, 40, rng);
  }
  for (const pl of planterSpots()) drawPlanter(ctx, pl.x, pl.y, rng);
  for (const c of carRects()) { drawCar(ctx, c); if (!c.hz && rng.next() < 0.5) carPetals(ctx, c, rng); }
  drawLights(ctx);
  drawAngelVictory(ctx);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Capa dinámica (cada frame, antes de pickups/enemigos): agua, luces de emergencia, destellos del Ángel
// ---------------------------------------------------------------------------
let glowDot = null;
function getGlowDot() {
  if (glowDot || typeof document === 'undefined') return glowDot;
  glowDot = makeCanvas(48, 48);
  const g = glowDot.getContext('2d');
  const gr = g.createRadialGradient(24, 24, 1, 24, 24, 24);
  gr.addColorStop(0, 'rgba(255,180,60,1)');
  gr.addColorStop(0.4, 'rgba(255,140,20,0.55)');
  gr.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 48, 48);
  return glowDot;
}

function sparkle(ctx, x, y, s, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#fffbe0';
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.2, y - s * 0.2); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.2, y + s * 0.2);
  ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.2, y + s * 0.2); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.2, y - s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawObstacles(ctx, cam) {
  const t = clockSeconds();
  // Fuentes: ondas y chorros
  for (const f of FOUNTAINS) {
    if (!inView(cam, f.x, f.y, 100)) continue;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.45 + i / 3) % 1;
      ctx.strokeStyle = 'rgba(220,250,255,' + (0.62 * (1 - ph)) + ')';
      ctx.beginPath(); ctx.arc(0, 0, 14 + ph * 40, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(235,252,255,0.85)';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + t * 0.6;
      const ph = (t * 1.1 + i * 0.37) % 1;
      const rr = 6 + ph * 30;
      const up = Math.sin(ph * Math.PI) * 10;
      ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr - up, 2.3 * (1 - ph * 0.4), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // Luces de emergencia de autos y barricadas
  const dot = getGlowDot();
  if (dot) {
    const on = (t % 1.2) < 0.6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (on) {
      for (const c of HAZARD_CARS) {
        if (!inView(cam, c.x + c.w / 2, c.y + c.h / 2, 120)) continue;
        for (const [ox, oy] of [[0, 0], [c.w, 0], [0, c.h], [c.w, c.h]]) ctx.drawImage(dot, c.x + ox - 24, c.y + oy - 24);
      }
    }
    const bon = ((t + 0.3) % 1.6) < 0.8;
    if (bon) {
      for (const l of BARRICADE_LIGHTS) {
        if (!inView(cam, l.x, l.y, 40)) continue;
        ctx.drawImage(dot, l.x - 24, l.y - 24);
      }
    }
    ctx.restore();
  }
  // Destellos y halo de la Victoria (barato: un glow + 5 destellos)
  if (inView(cam, CX, CY - 150, 440)) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, CX - 6, CY - 341, 120 + pulse * 20, '#ffd966', 0.16 + pulse * 0.08);
    ctx.restore();
    const spots = [[-58, -380], [70, -350], [-110, -320], [100, -390], [-24, -430], [0, -240], [-30, 26], [38, 40]];
    for (let i = 0; i < spots.length; i++) {
      const ph = (t * 0.9 + i * 0.37) % 1;
      const a = Math.max(0, Math.sin(ph * Math.PI));
      if (a > 0.02) sparkle(ctx, CX + spots[i][0], CY + spots[i][1], 3 + a * 6, a);
    }
  }
}

export default {
  id: 'reforma',
  nombre: 'Reforma: Glorieta del Ángel',
  descripcion: 'Arena abierta de noche alrededor de la Columna del Ángel. Corre en círculos, esquiva los autos abandonados y aprovecha los camellones.',
  w: W,
  h: H,
  spawn: { x: CX, y: 1215 },
  fondo: '#1c1f2a',
  obstacles: OBSTACLES,
  drawBackground,
  drawObstacles,
};
