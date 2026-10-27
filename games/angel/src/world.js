// world.js (ANG-W) - Mundo de Ángel Survivors.
// Colisiones contra el mapa (contrato docs/07 §2) y caja de herramientas de pintura para los mapas.
//
// Convención de obstáculos (la misma en los dos mapas):
//   { type:'circle', x, y, r, kind }            (x,y) = centro
//   { type:'rect',   x, y, w, h, kind }          (x,y) = esquina SUPERIOR IZQUIERDA
// Las entidades que colisionan exponen { x, y, r } y, opcionalmente, { vx, vy }.

export const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Índice espacial por mapa (rejilla uniforme). Se construye una vez, de forma perezosa.
// ---------------------------------------------------------------------------
const CELL = 256;
const EMPTY = [];
const indexCache = new WeakMap();
const cand = [];

function clampInt(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function buildIndex(map) {
  const obs = map.obstacles || EMPTY;
  const cols = Math.max(1, Math.ceil(map.w / CELL));
  const rows = Math.max(1, Math.ceil(map.h / CELL));
  const cells = new Array(cols * rows);
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    let x0, y0, x1, y1;
    if (o.type === 'circle') {
      x0 = o.x - o.r; y0 = o.y - o.r; x1 = o.x + o.r; y1 = o.y + o.r;
    } else {
      x0 = o.x; y0 = o.y; x1 = o.x + o.w; y1 = o.y + o.h;
    }
    const c0 = clampInt(Math.floor(x0 / CELL), 0, cols - 1);
    const c1 = clampInt(Math.floor(x1 / CELL), 0, cols - 1);
    const r0 = clampInt(Math.floor(y0 / CELL), 0, rows - 1);
    const r1 = clampInt(Math.floor(y1 / CELL), 0, rows - 1);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const k = cy * cols + cx;
        if (cells[k]) cells[k].push(i); else cells[k] = [i];
      }
    }
  }
  return { obs, n: obs.length, cols, rows, cells, seen: new Int32Array(obs.length), stamp: 0 };
}

function getIndex(map) {
  const obs = map.obstacles || EMPTY;
  let idx = indexCache.get(map);
  if (!idx || idx.obs !== obs || idx.n !== obs.length) {
    idx = buildIndex(map);
    indexCache.set(map, idx);
  }
  return idx;
}

// Llena `cand` (compartido) con los índices de obstáculos cuyas celdas toca la caja dada, sin repetidos.
function gather(idx, x0, y0, x1, y1) {
  cand.length = 0;
  if (idx.stamp > 2000000000) { idx.seen.fill(0); idx.stamp = 0; }
  const stamp = ++idx.stamp;
  const { cols, rows, cells, seen } = idx;
  const c0 = clampInt(Math.floor(x0 / CELL), 0, cols - 1);
  const c1 = clampInt(Math.floor(x1 / CELL), 0, cols - 1);
  const r0 = clampInt(Math.floor(y0 / CELL), 0, rows - 1);
  const r1 = clampInt(Math.floor(y1 / CELL), 0, rows - 1);
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const cell = cells[cy * cols + cx];
      if (!cell) continue;
      for (let k = 0; k < cell.length; k++) {
        const i = cell[k];
        if (seen[i] !== stamp) { seen[i] = stamp; cand.push(i); }
      }
    }
  }
  return cand;
}

// ---------------------------------------------------------------------------
// Colisión
// ---------------------------------------------------------------------------
const PUSH_EPS = 0.02;

// Quita la componente de velocidad que entra contra la superficie de normal (nx, ny).
function cancelVel(e, nx, ny) {
  if (typeof e.vx !== 'number' || typeof e.vy !== 'number') return;
  const vn = e.vx * nx + e.vy * ny;
  if (vn < 0) { e.vx -= vn * nx; e.vy -= vn * ny; }
}

function clampToBounds(e, map, r) {
  let hit = false;
  if (map.w > r * 2) {
    if (e.x < r) { e.x = r; cancelVel(e, 1, 0); hit = true; }
    else if (e.x > map.w - r) { e.x = map.w - r; cancelVel(e, -1, 0); hit = true; }
  }
  if (map.h > r * 2) {
    if (e.y < r) { e.y = r; cancelVel(e, 0, 1); hit = true; }
    else if (e.y > map.h - r) { e.y = map.h - r; cancelVel(e, 0, -1); hit = true; }
  }
  return hit;
}

function pushCircle(e, o, r, map) {
  let dx = e.x - o.x;
  let dy = e.y - o.y;
  const rr = o.r + r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // Centro exacto: empuja hacia afuera del centro del mapa (o hacia arriba si coincide).
    dx = e.x - map.w * 0.5; dy = e.y - map.h * 0.5;
    d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = 0; dy = -1; d = 1; }
  }
  const nx = dx / d, ny = dy / d;
  e.x = o.x + nx * (rr + PUSH_EPS);
  e.y = o.y + ny * (rr + PUSH_EPS);
  cancelVel(e, nx, ny);
  return true;
}

function pushRect(e, o, r) {
  const x1 = o.x + o.w, y1 = o.y + o.h;
  const px = e.x < o.x ? o.x : e.x > x1 ? x1 : e.x;
  const py = e.y < o.y ? o.y : e.y > y1 ? y1 : e.y;
  const dx = e.x - px, dy = e.y - py;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r && (dx !== 0 || dy !== 0)) return false;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    const push = r - d + PUSH_EPS;
    e.x += nx * push;
    e.y += ny * push;
    cancelVel(e, nx, ny);
    return true;
  }
  // El centro está dentro del rectángulo (o justo en el borde): sale por el lado más cercano.
  const dl = e.x - o.x, dr = x1 - e.x, dt = e.y - o.y, db = y1 - e.y;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) { e.x = o.x - r - PUSH_EPS; cancelVel(e, -1, 0); }
  else if (m === dr) { e.x = x1 + r + PUSH_EPS; cancelVel(e, 1, 0); }
  else if (m === dt) { e.y = o.y - r - PUSH_EPS; cancelVel(e, 0, -1); }
  else { e.y = y1 + r + PUSH_EPS; cancelVel(e, 0, 1); }
  return true;
}

/**
 * Empuja a la entidad { x, y, r } fuera de los obstáculos y dentro de los bordes del mapa.
 * Si la entidad tiene vx/vy, elimina la componente que entra contra la superficie (deslizamiento).
 * Devuelve true si tuvo que moverla.
 */
export function collideWithMap(e, map) {
  if (!e || !map) return false;
  const r = e.r > 0 ? e.r : 0;
  let moved = clampToBounds(e, map, r);
  const idx = getIndex(map);
  if (idx.n === 0) return moved;
  for (let pass = 0; pass < 3; pass++) {
    const list = gather(idx, e.x - r, e.y - r, e.x + r, e.y + r);
    let any = false;
    for (let k = 0; k < list.length; k++) {
      const o = idx.obs[list[k]];
      const hit = o.type === 'circle' ? pushCircle(e, o, r, map) : pushRect(e, o, r);
      if (hit) any = true;
    }
    if (!any) break;
    moved = true;
    clampToBounds(e, map, r);
  }
  return moved;
}

/** true si un círculo de radio r en (x, y) cabe dentro del mapa sin tocar ningún obstáculo. */
export function isFree(map, x, y, r = 0) {
  if (!map) return false;
  if (!(x >= r && y >= r && x <= map.w - r && y <= map.h - r)) return false;
  const idx = getIndex(map);
  if (idx.n === 0) return true;
  const list = gather(idx, x - r, y - r, x + r, y + r);
  for (let k = 0; k < list.length; k++) {
    const o = idx.obs[list[k]];
    if (o.type === 'circle') {
      const dx = x - o.x, dy = y - o.y, rr = o.r + r;
      if (dx * dx + dy * dy < rr * rr) return false;
    } else {
      const x1 = o.x + o.w, y1 = o.y + o.h;
      const px = x < o.x ? o.x : x > x1 ? x1 : x;
      const py = y < o.y ? o.y : y > y1 ? y1 : y;
      const dx = x - px, dy = y - py;
      if (dx * dx + dy * dy < r * r) return false;
      if (dx === 0 && dy === 0 && x > o.x && x < x1 && y > o.y && y < y1) return false;
    }
  }
  return true;
}

/**
 * Punto libre al azar. Con (cx, cy) busca en el anillo [minDist, maxDist] alrededor de ese punto
 * (distribución uniforme por área); si no encuentra, relaja la búsqueda y al final cae en el spawn.
 * `r` (opcional, 28 por defecto) es el radio de holgura que debe caber en el punto.
 * Usa únicamente el rng recibido: es determinista para el anfitrión.
 */
export function randomFreePoint(map, rng, cx, cy, minDist = 0, maxDist = Infinity, r = 28) {
  const w = map.w, h = map.h;
  const hasCenter = Number.isFinite(cx) && Number.isFinite(cy);
  if (hasCenter) {
    const lo = Math.max(0, minDist || 0);
    const hi = Number.isFinite(maxDist) ? Math.max(lo + 1, maxDist) : Math.hypot(w, h);
    for (let i = 0; i < 48; i++) {
      const a = rng.next() * TAU;
      const d = Math.sqrt(lo * lo + rng.next() * (hi * hi - lo * lo));
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      if (isFree(map, x, y, r)) return { x, y };
    }
    // Relajado: cualquier punto libre del mapa que respete al menos la mitad de la distancia mínima.
    const soft = lo * 0.7;
    for (let i = 0; i < 64; i++) {
      const x = r + rng.next() * (w - 2 * r);
      const y = r + rng.next() * (h - 2 * r);
      if (Math.hypot(x - cx, y - cy) < soft) continue;
      if (isFree(map, x, y, r)) return { x, y };
    }
  }
  for (let i = 0; i < 96; i++) {
    const x = r + rng.next() * (w - 2 * r);
    const y = r + rng.next() * (h - 2 * r);
    if (isFree(map, x, y, r)) return { x, y };
  }
  const s = map.spawn || { x: w * 0.5, y: h * 0.5 };
  return { x: s.x, y: s.y };
}

// ---------------------------------------------------------------------------
// Caja de herramientas de pintura (la usan los mapas; se ejecuta una sola vez por partida)
// ---------------------------------------------------------------------------

/** PRNG determinista para el decorado (mulberry32). int(a, b) es inclusivo. */
export function decorRng(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

function parseHex(c) {
  let h = c.charAt(0) === '#' ? c.slice(1) : c;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Aclara (amt > 0) u oscurece (amt < 0) un color #rrggbb; amt en [-1, 1]. */
export function shade(color, amt) {
  const [r, g, b] = parseHex(color);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const f = (v) => Math.round(v + (t - v) * p);
  return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
}

/** #rrggbb + alfa -> rgba(). */
export function rgba(color, a) {
  const [r, g, b] = parseHex(color);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

/** Mezcla lineal de dos colores #rrggbb. */
export function mix(c1, c2, t) {
  const a = parseHex(c1), b = parseHex(c2);
  const f = (i) => Math.round(a[i] + (b[i] - a[i]) * t);
  return 'rgb(' + f(0) + ',' + f(1) + ',' + f(2) + ')';
}

/** Traza (sin rellenar) un rectángulo con esquinas redondeadas. */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** Crea un canvas (DOM). Devuelve null fuera del navegador. */
export function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * Textura de ruido repetible: base + capas de motas. layers = [{ color, alpha, n, rmin, rmax }].
 * Devuelve un canvas size×size o null.
 */
export function noiseTile(size, base, layers, rng) {
  const c = makeCanvas(size, size);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (const L of layers) {
    g.fillStyle = L.color;
    g.globalAlpha = L.alpha;
    for (let i = 0; i < L.n; i++) {
      const x = rng.next() * size, y = rng.next() * size;
      const r = L.rmin + rng.next() * (L.rmax - L.rmin);
      // Dibuja también el reflejo en el borde para que la textura repita sin costuras.
      const wx = x < r ? size : x > size - r ? -size : 0;
      const wy = y < r ? size : y > size - r ? -size : 0;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      if (wx) { g.moveTo(x + wx + r, y); g.arc(x + wx, y, r, 0, TAU); }
      if (wy) { g.moveTo(x + r, y + wy); g.arc(x, y + wy, r, 0, TAU); }
      if (wx && wy) { g.moveTo(x + wx + r, y + wy); g.arc(x + wx, y + wy, r, 0, TAU); }
      g.fill();
    }
  }
  g.globalAlpha = 1;
  return c;
}

/** Rellena un rectángulo con un patrón repetido (o con `fallback` si no hay canvas). */
export function fillTiled(ctx, tile, x, y, w, h, fallback) {
  if (tile) {
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  } else {
    ctx.fillStyle = fallback || '#444';
  }
  ctx.fillRect(x, y, w, h);
}

/** Elipse de sombra suave. */
export function shadowEllipse(ctx, x, y, rx, ry, alpha = 0.3) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Resplandor radial aditivo (luces cálidas). */
export function glowSpot(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

const glowCache = new Map();

/** Resplandor radial pre-renderizado (barato por frame): dibuja un halo de radio r y opacidad `alpha`. */
export function drawGlow(ctx, x, y, r, color, alpha = 1) {
  let c = glowCache.get(color);
  if (c === undefined) {
    c = makeCanvas(64, 64);
    if (c) {
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(color, 1));
      gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    }
    glowCache.set(color, c);
  }
  if (!c) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prev;
}

/**
 * Comprobación de visibilidad contra la cámara de shared/engine/camera.js ((x, y) = esquina superior izquierda,
 * viewW/viewH). Tolerante: si la cámara no expone esos datos, dibuja todo. Deja un margen para el temblor.
 */
export function inView(cam, x, y, r) {
  if (!cam || typeof cam.x !== 'number' || typeof cam.y !== 'number') return true;
  const vw = cam.viewW, vh = cam.viewH;
  if (!(vw > 0) || !(vh > 0)) return true;
  const m = r + 24;
  return x + m >= cam.x && x - m <= cam.x + vw && y + m >= cam.y && y - m <= cam.y + vh;
}

/** Reloj de animación en segundos (los mapas no reciben dt). */
export function clockSeconds() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}
