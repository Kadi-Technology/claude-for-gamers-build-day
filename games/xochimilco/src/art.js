// Utilidades de dibujo y color compartidas por los sprites (todo con formas de canvas, sin assets externos).

export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function smooth(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Hash determinista de un entero a [0,1). */
export function hash(n) {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- color
const colorCache = new Map();
export function rgb(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    const h = hex.replace('#', '');
    const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    c = [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
    colorCache.set(hex, c);
  }
  return c;
}
export function toCss(c, a = 1) {
  return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function mix(hexA, hexB, t) {
  return toCss(mixRgb(rgb(hexA), rgb(hexB), t));
}
export function shade(hex, amt) {
  // amt > 0 aclara hacia blanco, amt < 0 oscurece hacia negro
  const c = rgb(hex);
  return amt >= 0 ? toCss(mixRgb(c, [255, 255, 255], amt)) : toCss(mixRgb(c, [0, 0, 0], -amt));
}
export function alpha(hex, a) {
  return toCss(rgb(hex), a);
}

// ---------------------------------------------------------------- formas
export function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}
export function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}
export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
}
export function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
export function hgrad(ctx, x0, x1, stops) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
export function rgrad(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
export function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
}

/** Flor de cempasúchil de varias capas de pétalos. */
export function marigold(ctx, x, y, r, base = '#ff9f1c', light = '#ffc83d', core = '#c2550d') {
  const rings = [
    { n: 12, rr: 1, pr: 0.46, col: base },
    { n: 10, rr: 0.72, pr: 0.4, col: light },
    { n: 8, rr: 0.46, pr: 0.34, col: base },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * TAU + ring.rr;
      ctx.fillStyle = ring.col;
      ell(ctx, x + Math.cos(a) * r * 0.5 * ring.rr, y + Math.sin(a) * r * 0.5 * ring.rr, r * ring.pr * 0.62, r * ring.pr, a + Math.PI / 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = core;
  circle(ctx, x, y, r * 0.2);
  ctx.fill();
}

/** Estrella de brillo de 4 puntas. */
export function sparkle(ctx, x, y, r, col = '#fff') {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** Ajolote de frente (carita) para vidas, premios y menús. cx,cy = centro de la cabeza, r = radio de la cabeza. */
export function axolotlFace(ctx, cx, cy, r, t = 0) {
  const gill = '#ff5f8f';
  const gill2 = '#ff8fb1';
  // branquias: tres ramas por lado
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const a = (-0.35 + i * 0.42) * side;
      const sway = Math.sin(t * 3 + i * 1.3 + side) * 0.08;
      const bx = cx + side * r * 0.82;
      const by = cy - r * 0.05 + (i - 1) * r * 0.2;
      const len = r * (0.78 - i * 0.06);
      const ex = bx + side * Math.cos(a + sway) * len;
      const ey = by - Math.sin(a + sway + 0.25) * len * 0.9 - r * 0.1;
      ctx.strokeStyle = i === 1 ? gill : gill2;
      ctx.lineCap = 'round';
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + side * len * 0.5, by - len * 0.35, ex, ey);
      ctx.stroke();
      // plumitas
      ctx.lineWidth = r * 0.07;
      for (let k = 1; k <= 3; k++) {
        const u = k / 4;
        const px = bx + (ex - bx) * u + side * len * 0.1 * Math.sin(u * 3);
        const py = by + (ey - by) * u - len * 0.12 * Math.sin(u * 3.2);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + side * r * 0.2, py - r * 0.2);
        ctx.stroke();
      }
    }
  }
  // cabeza
  ctx.fillStyle = vgrad(ctx, cy - r, cy + r, [
    [0, '#ffe3ec'],
    [1, '#ffb8cf'],
  ]);
  ell(ctx, cx, cy, r, r * 0.86);
  ctx.fill();
  ctx.strokeStyle = 'rgba(214,100,140,0.55)';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
  // mejillas
  ctx.fillStyle = 'rgba(255,111,150,0.5)';
  ell(ctx, cx - r * 0.55, cy + r * 0.2, r * 0.17, r * 0.11);
  ctx.fill();
  ell(ctx, cx + r * 0.55, cy + r * 0.2, r * 0.17, r * 0.11);
  ctx.fill();
  // ojos
  ctx.fillStyle = '#1b1b2e';
  circle(ctx, cx - r * 0.34, cy - r * 0.08, r * 0.13);
  ctx.fill();
  circle(ctx, cx + r * 0.34, cy - r * 0.08, r * 0.13);
  ctx.fill();
  ctx.fillStyle = '#fff';
  circle(ctx, cx - r * 0.3, cy - r * 0.12, r * 0.045);
  ctx.fill();
  circle(ctx, cx + r * 0.38, cy - r * 0.12, r * 0.045);
  ctx.fill();
  // sonrisa
  ctx.strokeStyle = '#b4416b';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.12, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}
