// Zonas: paletas, cielo, agua, chinampas y escenografía de cada tramo de 500 m (docs/02 §2.5).
//   1 Canal de día · 2 Mercado flotante · 3 Noche con mariachi (visibilidad reducida) · 4 Isla de las Muñecas (niebla)

import { WORLD, ZONES } from './config.js';
import { spr, emojiSprite } from './engine.js';
import { sx, sy, sc } from './track.js';
import { TAU, clamp, lerp, smooth, hash, rgb, toCss, mixRgb, shade, rr, ell, circle, vgrad, hgrad, rgrad, quad, marigold } from './art.js';

// ================================================================ paleta interpolada
const COLOR_KEYS = ['skyTop', 'skyMid', 'skyLow', 'orbCol', 'hillFar', 'hillNear', 'cloud', 'waterFar', 'waterNear', 'waterBand', 'sparkle', 'bankA', 'bankB', 'shore', 'shoreDark', 'fog', 'leaf', 'leaf2', 'trunk', 'accent'];
const NUM_KEYS = ['orbX', 'orbY', 'cloudA', 'fogMax', 'fogNear', 'fogFar', 'dark', 'star'];

const PAL = { c: {}, r: {}, n: {}, orb: 'sun', zone: 0, nextZone: 0, u: 1, mist: 0 };

function zoneAtIndex(i) {
  return ZONES[((i % WORLD.zoneCount) + WORLD.zoneCount) % WORLD.zoneCount];
}

/** Paleta para una distancia: se mezcla con la de la zona vecina cerca de cada frontera. */
export function paletteAt(dist) {
  const j = Math.round(Math.max(0, dist) / WORLD.zoneLen);
  const a = zoneAtIndex(Math.max(0, j - 1));
  const b = zoneAtIndex(j);
  const u = j === 0 ? 1 : smooth(j * WORLD.zoneLen - 60, j * WORLD.zoneLen + 30, dist);
  const A = a.pal;
  const B = b.pal;
  for (const k of COLOR_KEYS) {
    const m = mixRgb(rgb(A[k]), rgb(B[k]), u);
    PAL.r[k] = m;
    PAL.c[k] = toCss(m);
  }
  for (const k of NUM_KEYS) PAL.n[k] = lerp(A[k], B[k], u);
  PAL.orb = u > 0.5 ? B.orb : A.orb;
  PAL.zone = j === 0 ? 0 : (j) % WORLD.zoneCount;
  PAL.u = u;
  PAL.mist = clamp((PAL.n.fogMax - 0.6) / 0.28, 0, 1);
  return PAL;
}

/** Función de niebla: multiplicador de opacidad 0..1 según la profundidad. */
export function makeFog(P, min = 0.18) {
  const n = P.n;
  return (d) => 1 - (1 - min) * n.fogMax * smooth(n.fogNear, n.fogFar, d);
}

// ================================================================ sprites de escenografía
const SPP = 64; // píxeles por metro

function ahuejoteSprite(zone, variant) {
  const pal = zoneAtIndex(zone).pal;
  const W = 282;
  const H = 640;
  return spr(`xoc:ahu:${zone}:${variant}`, W, H, (ctx) => {
    const cx = W / 2;
    // tronco
    ctx.fillStyle = hgrad(ctx, cx - 18, cx + 18, [
      [0, shade(pal.trunk, -0.2)],
      [0.5, shade(pal.trunk, 0.15)],
      [1, shade(pal.trunk, -0.3)],
    ]);
    ctx.beginPath();
    ctx.moveTo(cx - 17, H);
    ctx.quadraticCurveTo(cx - 9, H * 0.62, cx - 7, H * 0.36);
    ctx.lineTo(cx + 7, H * 0.36);
    ctx.quadraticCurveTo(cx + 9, H * 0.62, cx + 17, H);
    ctx.closePath();
    ctx.fill();
    // ramas
    ctx.strokeStyle = shade(pal.trunk, -0.1);
    ctx.lineCap = 'round';
    for (let b = 0; b < 7; b++) {
      const by = H * (0.5 - b * 0.05);
      const s = b % 2 ? 1 : -1;
      ctx.lineWidth = 6 - b * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, by);
      ctx.quadraticCurveTo(cx + s * 40, by - 30, cx + s * (52 + hash(b + variant * 9) * 26), by - 70);
      ctx.stroke();
    }
    // follaje: racimos colgantes
    const n = 78;
    for (let i = 0; i < n; i++) {
      const u = hash(i * 3 + variant * 101 + 1);
      const v = hash(i * 5 + variant * 53 + 2);
      const ang = u * TAU;
      const rad = Math.sqrt(v);
      const px = cx + Math.cos(ang) * rad * W * 0.4;
      const py = H * 0.3 + Math.sin(ang) * rad * H * 0.27;
      const rx = 16 + hash(i + 7 + variant) * 16;
      const ry = 26 + hash(i + 9 + variant) * 32;
      ctx.fillStyle = hash(i + 11) > 0.5 ? pal.leaf : pal.leaf2;
      ell(ctx, px, py, rx, ry, (hash(i + 13) - 0.5) * 0.6);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ell(ctx, px + rx * 0.25, py + ry * 0.2, rx * 0.7, ry * 0.8, 0.1);
      ctx.fill();
      // hebras colgantes
      ctx.strokeStyle = pal.leaf2;
      ctx.lineWidth = 2.4;
      for (let h = -1; h <= 1; h++) {
        ctx.beginPath();
        ctx.moveTo(px + h * rx * 0.55, py + ry * 0.4);
        ctx.quadraticCurveTo(px + h * rx * 0.8, py + ry * 1.0, px + h * rx * 0.5, py + ry * 1.5);
        ctx.stroke();
      }
    }
  });
}

function dollSprite() {
  return spr('xoc:doll', 56, 120, (ctx) => {
    ctx.strokeStyle = '#b9ab94';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(28, 24);
    ctx.stroke();
    // vestido raído
    ctx.fillStyle = '#8f7f6a';
    ctx.beginPath();
    ctx.moveTo(18, 56);
    ctx.lineTo(38, 56);
    ctx.lineTo(48, 112);
    ctx.lineTo(40, 106);
    ctx.lineTo(34, 116);
    ctx.lineTo(28, 108);
    ctx.lineTo(22, 117);
    ctx.lineTo(16, 106);
    ctx.lineTo(8, 112);
    ctx.closePath();
    ctx.fill();
    // brazos
    ctx.strokeStyle = '#e6d9c3';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(18, 60);
    ctx.lineTo(6, 80);
    ctx.moveTo(38, 60);
    ctx.lineTo(50, 78);
    ctx.stroke();
    // cabeza
    ctx.fillStyle = '#eadfca';
    circle(ctx, 28, 40, 17);
    ctx.fill();
    ctx.fillStyle = '#2b1f18';
    ctx.beginPath();
    ctx.arc(28, 36, 18, Math.PI * 1.02, Math.PI * 1.98);
    ctx.fill();
    ctx.fillRect(10, 34, 4, 22);
    ctx.fillRect(42, 34, 4, 20);
    ctx.fillStyle = '#111';
    circle(ctx, 22, 42, 3);
    ctx.fill();
    circle(ctx, 34, 42, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(170,60,60,0.55)';
    circle(ctx, 18, 49, 3.5);
    ctx.fill();
    circle(ctx, 38, 49, 3.5);
    ctx.fill();
    ctx.strokeStyle = '#6b2a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(23, 52);
    ctx.lineTo(33, 52);
    ctx.stroke();
  });
}

function secoSprite(variant) {
  const W = 282;
  const H = 580;
  return spr(`xoc:seco:${variant}`, W, H, (ctx) => {
    const cx = W / 2;
    ctx.fillStyle = '#2f2820';
    ctx.beginPath();
    ctx.moveTo(cx - 20, H);
    ctx.quadraticCurveTo(cx - 10, H * 0.6, cx - 8, H * 0.3);
    ctx.lineTo(cx + 8, H * 0.3);
    ctx.quadraticCurveTo(cx + 12, H * 0.6, cx + 20, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2f2820';
    ctx.lineCap = 'round';
    const br = [
      [0.62, -1, 110, 70],
      [0.5, 1, 120, 90],
      [0.4, -1, 90, 110],
      [0.32, 1, 80, 80],
      [0.52, -1, 60, 40],
    ];
    for (let b = 0; b < br.length; b++) {
      const [yy, s, dx, dy] = br[b];
      ctx.lineWidth = 9 - b;
      const by = H * yy;
      ctx.beginPath();
      ctx.moveTo(cx, by);
      ctx.quadraticCurveTo(cx + s * dx * 0.5, by - dy * 0.2, cx + s * dx, by - dy);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + s * dx * 0.7, by - dy * 0.7);
      ctx.lineTo(cx + s * dx * 0.95, by - dy * 1.25);
      ctx.stroke();
    }
    // musgo colgante
    ctx.strokeStyle = 'rgba(160,185,150,0.7)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 18; k++) {
      const mx = cx + (hash(k + variant * 31) - 0.5) * W * 0.8;
      const my = H * (0.1 + hash(k + 5) * 0.4);
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.quadraticCurveTo(mx + 6, my + 24, mx - 2, my + 40 + hash(k) * 30);
      ctx.stroke();
    }
  });
}

function casitaSprite(variant) {
  const cols = [
    ['#f0d3a4', '#c0392b'],
    ['#9fd3c7', '#e67e22'],
  ][variant % 2];
  const W = 250;
  const H = 200;
  return spr(`xoc:casa:${variant}`, W, H, (ctx) => {
    ctx.fillStyle = cols[0];
    rr(ctx, 12, 52, W - 24, H - 52, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(W - 60, 52, 48, H - 52);
    ctx.fillStyle = cols[1];
    rr(ctx, 4, 36, W - 8, 26, 6);
    ctx.fill();
    ctx.fillStyle = '#5a3b22';
    rr(ctx, 40, 100, 52, H - 100, 4);
    ctx.fill();
    ctx.fillStyle = '#ffd96a';
    rr(ctx, 130, 90, 60, 52, 4);
    ctx.fill();
    ctx.strokeStyle = '#6b4a2b';
    ctx.lineWidth = 5;
    ctx.strokeRect(130, 90, 60, 52);
    ctx.beginPath();
    ctx.moveTo(160, 90);
    ctx.lineTo(160, 142);
    ctx.stroke();
    // macetas con flores
    marigold(ctx, 150, 86, 14);
    marigold(ctx, 176, 84, 12);
    // tendedero con banderines
    const cs = ['#ff5ca8', '#ffd23f', '#2ec4b6', '#8f5bff'];
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = cs[k % 4];
      ctx.beginPath();
      ctx.moveTo(16 + k * 36, 66);
      ctx.lineTo(34 + k * 36, 66);
      ctx.lineTo(25 + k * 36, 84);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function puestoSprite(variant) {
  const cols = [
    ['#e63946', '#fff3d6'],
    ['#2a9d8f', '#ffe066'],
    ['#7b2cbf', '#ffd6e8'],
  ][variant % 3];
  const W = 282;
  const H = 232;
  return spr(`xoc:puesto:${variant}`, W, H, (ctx) => {
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(22, 40, 8, H - 40);
    ctx.fillRect(W - 30, 40, 8, H - 40);
    // mesa
    ctx.fillStyle = '#a77649';
    rr(ctx, 14, 150, W - 28, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#8c5f36';
    ctx.fillRect(20, 170, W - 40, 58);
    // mercancía
    const fruit = ['#e63946', '#f4a261', '#7ac74f', '#ffd23f', '#ff6b9d'];
    for (let k = 0; k < 18; k++) {
      ctx.fillStyle = fruit[k % fruit.length];
      circle(ctx, 40 + (k % 9) * 24 + (Math.floor(k / 9) % 2) * 10, 142 - Math.floor(k / 9) * 14, 12);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      circle(ctx, 36 + (k % 9) * 24 + (Math.floor(k / 9) % 2) * 10, 137 - Math.floor(k / 9) * 14, 3.5);
      ctx.fill();
    }
    // toldo rayado
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = k % 2 ? cols[1] : cols[0];
      ctx.beginPath();
      ctx.moveTo(8 + k * 33, 30);
      ctx.lineTo(8 + (k + 1) * 33, 30);
      ctx.lineTo(8 + (k + 1) * 33, 70);
      ctx.arc(8 + (k + 0.5) * 33, 70, 16.5, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(8, 30, W - 16, 8);
    // globos de papel
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = ['#ff5ca8', '#ffd23f', '#2ec4b6', '#ff7b2c'][k];
      ell(ctx, 36 + k * 70, 18, 11, 14);
      ctx.fill();
    }
  });
}

function farolSprite() {
  return spr('xoc:farol', 72, 250, (ctx) => {
    ctx.fillStyle = '#3a281a';
    ctx.fillRect(32, 40, 8, 210);
    ctx.fillRect(14, 40, 44, 6);
    ctx.strokeStyle = '#3a281a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(36, 46);
    ctx.lineTo(36, 58);
    ctx.stroke();
    ctx.fillStyle = vgrad(ctx, 56, 120, [
      [0, '#ffb347'],
      [1, '#ff5a36'],
    ]);
    ell(ctx, 36, 88, 22, 32);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,20,10,0.55)';
    ctx.lineWidth = 2;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.ellipse(36, 88, Math.abs(k) * 11 + 3, 32, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffe9a8';
    ell(ctx, 36, 88, 9, 20);
    ctx.fill();
    ctx.fillStyle = '#6b1c10';
    ctx.fillRect(26, 54, 20, 5);
    ctx.fillRect(26, 118, 20, 5);
  });
}

function glowSprite(kind) {
  const cols = {
    warm: ['rgba(255,214,120,0.95)', 'rgba(255,150,60,0)'],
    pink: ['rgba(255,170,230,0.9)', 'rgba(255,100,200,0)'],
    cool: ['rgba(190,235,255,0.9)', 'rgba(120,190,255,0)'],
    green: ['rgba(210,255,140,0.95)', 'rgba(150,255,90,0)'],
  }[kind];
  return spr(`xoc:glow:${kind}`, 128, 128, (ctx) => {
    ctx.fillStyle = rgrad(ctx, 64, 64, 0, 64, [
      [0, cols[0]],
      [0.35, cols[0].replace(/[\d.]+\)$/, '0.4)')],
      [1, cols[1]],
    ]);
    ctx.fillRect(0, 0, 128, 128);
  });
}

function mariachiSprite() {
  const W = 300;
  const H = 205;
  return spr('xoc:mariachi', W, H, (ctx) => {
    // casco
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    rr(ctx, 16, H - 36, W - 32, 30, 14);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, H - 62, H - 20, [
      [0, '#2a9d8f'],
      [1, '#16605a'],
    ]);
    rr(ctx, 6, H - 64, W - 12, 46, 18);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(10, H - 46, W - 20, 8);
    // músicos
    const xs = [66, 150, 234];
    const hats = ['#1b1b2e', '#1b1b2e', '#1b1b2e'];
    for (let i = 0; i < 3; i++) {
      const x = xs[i];
      // cuerpo (traje negro con botonadura plateada)
      ctx.fillStyle = '#16161f';
      rr(ctx, x - 22, 88, 44, 70, 12);
      ctx.fill();
      ctx.fillStyle = '#d9dde3';
      for (let b = 0; b < 4; b++) {
        circle(ctx, x, 98 + b * 14, 3);
        ctx.fill();
      }
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.moveTo(x - 7, 88);
      ctx.lineTo(x + 7, 88);
      ctx.lineTo(x, 100);
      ctx.closePath();
      ctx.fill();
      // cabeza y sombrero
      ctx.fillStyle = '#d8a574';
      circle(ctx, x, 70, 17);
      ctx.fill();
      ctx.fillStyle = '#16161f';
      ctx.beginPath();
      ctx.moveTo(x - 17, 70);
      ctx.quadraticCurveTo(x, 78, x + 17, 70);
      ctx.lineTo(x + 17, 74);
      ctx.quadraticCurveTo(x, 84, x - 17, 74);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = hats[i];
      ell(ctx, x, 58, 36, 9);
      ctx.fill();
      rr(ctx, x - 16, 30, 32, 30, 10);
      ctx.fill();
      ctx.fillStyle = '#d9dde3';
      ctx.fillRect(x - 16, 52, 32, 4);
      // boca abierta cantando
      ctx.fillStyle = '#5a1a14';
      ell(ctx, x, 77, 4, 3);
      ctx.fill();
    }
    // instrumentos
    ctx.fillStyle = '#b5651d'; // guitarrón
    ell(ctx, 66, 132, 22, 28, 0.2);
    ctx.fill();
    ctx.strokeStyle = '#6b3a10';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(72, 112);
    ctx.lineTo(96, 76);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f'; // trompeta
    ctx.fillRect(122, 96, 42, 8);
    ctx.beginPath();
    ctx.moveTo(164, 92);
    ctx.lineTo(186, 80);
    ctx.lineTo(186, 120);
    ctx.lineTo(164, 108);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c99a00';
    ctx.lineWidth = 3;
    ctx.strokeRect(128, 106, 28, 12);
    ctx.fillStyle = '#a4521d'; // violín
    ell(ctx, 232, 114, 15, 20, -0.5);
    ctx.fill();
    ctx.strokeStyle = '#3a1d0a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(228, 104);
    ctx.lineTo(262, 80);
    ctx.stroke();
  });
}

function cabanaSprite(zone) {
  const W = 270;
  const H = 205;
  const night = zone === 2;
  return spr(`xoc:cabana:${zone}`, W, H, (ctx) => {
    ctx.fillStyle = night ? '#3a2a22' : '#2e2a24';
    ctx.beginPath();
    ctx.moveTo(10, H);
    ctx.lineTo(10, 74);
    ctx.lineTo(W / 2, 20);
    ctx.lineTo(W - 10, 74);
    ctx.lineTo(W - 10, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 12; k++) {
      ctx.beginPath();
      ctx.moveTo(10 + k * 21.5, 80 + (k % 3) * 2);
      ctx.lineTo(10 + k * 21.5, H);
      ctx.stroke();
    }
    ctx.fillStyle = '#17110c';
    ctx.beginPath();
    ctx.moveTo(24, 74);
    ctx.lineTo(W / 2, 14);
    ctx.lineTo(W - 24, 74);
    ctx.lineTo(W - 10, 82);
    ctx.lineTo(W / 2, 28);
    ctx.lineTo(10, 82);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = night ? '#ffcf6a' : '#0e1512';
    rr(ctx, 40, 100, 50, 46, 4);
    ctx.fill();
    ctx.fillStyle = '#17110c';
    rr(ctx, 160, 116, 54, H - 116, 4);
    ctx.fill();
  });
}

function carrizalSprite() {
  return spr('xoc:carrizal', 140, 128, (ctx) => {
    ctx.lineCap = 'round';
    for (let k = 0; k < 16; k++) {
      const x = 14 + hash(k + 3) * 112;
      const hgt = 70 + hash(k + 9) * 52;
      ctx.strokeStyle = k % 3 ? '#6f9a3b' : '#9bb94a';
      ctx.lineWidth = 3 + hash(k) * 2;
      ctx.beginPath();
      ctx.moveTo(x, 128);
      ctx.quadraticCurveTo(x + (hash(k + 1) - 0.5) * 26, 128 - hgt * 0.6, x + (hash(k + 2) - 0.5) * 50, 128 - hgt);
      ctx.stroke();
      if (k % 5 === 0) {
        ctx.fillStyle = '#6b4a2b';
        rr(ctx, x - 3 + (hash(k + 2) - 0.5) * 50, 128 - hgt - 18, 7, 22, 3);
        ctx.fill();
      }
    }
  });
}

function floresSprite() {
  return spr('xoc:flores', 116, 72, (ctx) => {
    ctx.strokeStyle = '#3f8f3a';
    ctx.lineWidth = 3;
    for (let k = 0; k < 9; k++) {
      ctx.beginPath();
      ctx.moveTo(12 + k * 11, 72);
      ctx.lineTo(10 + k * 11 + (k % 2 ? 6 : -6), 38);
      ctx.stroke();
    }
    for (let k = 0; k < 7; k++) {
      marigold(ctx, 16 + k * 14.5, 34 + (k % 3) * 8 - (k === 3 ? 12 : 0), 11 + (k % 2) * 2);
    }
  });
}

function canoaSprite(variant) {
  const W = 180;
  const H = 110;
  return spr(`xoc:canoa:${variant}`, W, H, (ctx) => {
    const cols = [
      ['#ff7b2c', '#e63946', '#ffd23f'],
      ['#7ac74f', '#ffd23f', '#ff5ca8'],
    ][variant % 2];
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    rr(ctx, 12, H - 22, W - 24, 18, 9);
    ctx.fill();
    for (let k = 0; k < 14; k++) {
      ctx.fillStyle = cols[k % 3];
      circle(ctx, 30 + (k % 7) * 20 + (Math.floor(k / 7)) * 8, H - 44 - Math.floor(k / 7) * 15, 12);
      ctx.fill();
    }
    ctx.fillStyle = '#9b6a3c';
    rr(ctx, 4, H - 46, W - 8, 36, 14);
    ctx.fill();
    ctx.fillStyle = '#c99a5b';
    ctx.fillRect(10, H - 38, W - 20, 6);
  });
}

function cloudSprite() {
  return spr('xoc:cloud', 260, 100, (ctx) => {
    const blobs = [
      [60, 66, 40],
      [110, 48, 48],
      [168, 60, 42],
      [210, 70, 30],
      [30, 74, 24],
    ];
    ctx.fillStyle = '#fff';
    for (const [x, y, r] of blobs) {
      circle(ctx, x, y, r);
      ctx.fill();
    }
    ctx.fillRect(30, 70, 190, 26);
    ctx.fillStyle = 'rgba(180,200,225,0.35)';
    ell(ctx, 130, 92, 100, 8);
    ctx.fill();
  });
}

function crowSprite(frame) {
  return spr(`xoc:crow:${frame}`, 96, 56, (ctx) => {
    ctx.fillStyle = '#1d1a1f';
    ctx.strokeStyle = '#1d1a1f';
    ctx.lineCap = 'round';
    const up = frame === 0;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(48, 30);
      ctx.quadraticCurveTo(48 + s * 20, up ? 4 : 30, 48 + s * 44, up ? 12 : 44);
      ctx.quadraticCurveTo(48 + s * 26, up ? 24 : 36, 48, 38);
      ctx.closePath();
      ctx.fill();
    }
    ell(ctx, 48, 34, 9, 12);
    ctx.fill();
    circle(ctx, 48, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#5a4a2a';
    ctx.beginPath();
    ctx.moveTo(46, 21);
    ctx.lineTo(50, 21);
    ctx.lineTo(48, 28);
    ctx.fill();
  });
}

function papelSprite() {
  const W = 1280;
  const H = 150;
  return spr('xoc:papel', W, H, (ctx) => {
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.quadraticCurveTo(W / 2, 40, W, 8);
    ctx.stroke();
    const cols = ['#ff5ca8', '#ffd23f', '#2ec4b6', '#8f5bff', '#ff7b2c', '#4cc86a'];
    const n = 20;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const x = u * W;
      const y = 8 + 32 * 4 * u * (1 - u) * 0.5 + 6;
      ctx.fillStyle = cols[k % cols.length];
      ctx.beginPath();
      ctx.moveTo(x - 28, y);
      ctx.lineTo(x + 28, y);
      ctx.lineTo(x + 28, y + 76);
      for (let z = 0; z < 4; z++) {
        ctx.lineTo(x + 28 - (z + 0.5) * 14, y + 96);
        ctx.lineTo(x + 28 - (z + 1) * 14, y + 76);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      circle(ctx, x, y + 28, 7);
      ctx.fill();
      for (let c = -1; c <= 1; c += 2) {
        circle(ctx, x + c * 15, y + 50, 4.5);
        ctx.fill();
      }
      ell(ctx, x, y + 58, 5, 9);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  });
}

/** Pre-renderiza la escenografía. */
export function prepareZoneArt() {
  for (let z = 0; z < WORLD.zoneCount; z++) {
    ahuejoteSprite(z, 0);
    ahuejoteSprite(z, 1);
    cabanaSprite(z);
  }
  dollSprite();
  secoSprite(0);
  secoSprite(1);
  casitaSprite(0);
  casitaSprite(1);
  for (let i = 0; i < 3; i++) puestoSprite(i);
  farolSprite();
  for (const k of ['warm', 'pink', 'cool', 'green']) glowSprite(k);
  mariachiSprite();
  carrizalSprite();
  floresSprite();
  canoaSprite(0);
  canoaSprite(1);
  cloudSprite();
  papelSprite();
  emojiSprite('🎶', 64);
  crowSprite(0);
  crowSprite(1);
}

// ================================================================ escenografía por segmento
const SEG = 11;
const sceneCache = new Map();

const MIX = [
  {
    near: [['carrizal', 30], ['flores', 24], ['canoa', 28], ['none', 18]],
    far: [['ahuejote', 40], ['casita', 20], ['carrizal', 10], ['none', 30]],
  },
  {
    near: [['canoa', 50], ['flores', 14], ['carrizal', 14], ['none', 22]],
    far: [['puesto', 46], ['casita', 14], ['ahuejote', 20], ['none', 20]],
  },
  {
    near: [['farol', 38], ['carrizal', 20], ['mariachi', 18], ['canoa', 4], ['none', 20]],
    far: [['cabana', 14], ['ahuejote', 40], ['none', 46]],
  },
  {
    near: [['carrizal', 36], ['canoa', 8], ['none', 56]],
    far: [['seco', 52], ['cabana', 14], ['none', 34]],
  },
];

function pickWeighted(list, u) {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = u * total;
  for (const [name, w] of list) {
    r -= w;
    if (r <= 0) return name;
  }
  return list[list.length - 1][0];
}

function sceneryFor(seg) {
  let items = sceneCache.get(seg);
  if (items) return items;
  items = [];
  const zone = (((Math.floor((seg * SEG) / WORLD.zoneLen) % WORLD.zoneCount) + WORLD.zoneCount) % WORLD.zoneCount);
  const mix = MIX[zone];
  for (const side of [-1, 1]) {
    const base = seg * 2 + (side > 0 ? 1 : 0);
    // hilera de ahuejotes (o árboles secos) que bordea el canal
    const lineType = zone === 3 ? 'seco' : 'ahuejote';
    items.push({
      type: lineType,
      side,
      x: WORLD.canalHalf + 0.9 + hash(base + 1) * 0.8,
      z: seg * SEG + (side > 0 ? SEG * 0.5 : 0) + hash(base + 2) * 2.5,
      v: Math.floor(hash(base + 3) * 2),
      ph: hash(base + 4) * TAU,
      flip: hash(base + 5) > 0.5,
      zone,
    });
    const near = pickWeighted(mix.near, hash(base + 6));
    if (near !== 'none') {
      // las embarcaciones decorativas quedan siempre fuera de los carriles para no confundirse con obstáculos
      let nx = WORLD.canalHalf + 0.5 + hash(base + 7) * 1.4;
      if (near === 'canoa') nx = WORLD.canalHalf + 0.6 + hash(base + 7) * 0.6;
      else if (near === 'mariachi') nx = WORLD.canalHalf + 3.2 + hash(base + 7) * 1.2;
      items.push({
        type: near,
        side,
        x: nx,
        z: seg * SEG + hash(base + 8) * SEG,
        v: Math.floor(hash(base + 9) * 3),
        ph: hash(base + 10) * TAU,
        flip: hash(base + 11) > 0.5,
        zone,
      });
    }
    const far = pickWeighted(mix.far, hash(base + 12));
    if (far !== 'none') {
      items.push({
        type: far,
        side,
        x: WORLD.canalHalf + 3.4 + hash(base + 13) * 5.5,
        z: seg * SEG + hash(base + 14) * SEG,
        v: Math.floor(hash(base + 15) * 3),
        ph: hash(base + 16) * TAU,
        flip: hash(base + 17) > 0.5,
        zone,
      });
    }
  }
  if (zone === 1 && seg % 4 === 0) items.push({ type: 'papel', side: 0, x: 0, z: seg * SEG + 3, v: 0, ph: 0, flip: false, zone });
  if (zone === 3 && seg % 5 === 2) items.push({ type: 'cuervo', side: hash(seg) > 0.5 ? 1 : -1, x: 0, z: seg * SEG + 5, v: 0, ph: hash(seg + 3) * TAU, flip: false, zone });
  sceneCache.set(seg, items);
  if (sceneCache.size > 90) {
    const minKeep = seg - 20;
    for (const k of sceneCache.keys()) if (k < minKeep) sceneCache.delete(k);
  }
  return items;
}

/** Agrega a `out` (reutilizando objetos) la escenografía visible. Devuelve el nuevo largo. */
export function collectScenery(out, n, camZ) {
  const s0 = Math.floor((camZ + 1.6) / SEG);
  const s1 = Math.floor((camZ + WORLD.far + 14) / SEG);
  for (let seg = s0; seg <= s1; seg++) {
    const items = sceneryFor(seg);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const d = it.z - camZ;
      if (d < 1.6 || d > WORLD.far + 16) continue;
      let r = out[n];
      if (!r) r = out[n] = { d: 0, kind: 0, ref: null };
      r.d = d;
      r.kind = 0;
      r.ref = it;
      n++;
    }
  }
  return n;
}

const DIM = {
  ahuejote: [4.4, 10],
  seco: [4.4, 9.06],
  casita: [3.9, 3.1],
  puesto: [4.4, 3.6],
  farol: [1.1, 3.9],
  mariachi: [4.7, 3.2],
  cabana: [4.2, 3.2],
  carrizal: [2.2, 2.0],
  flores: [1.8, 1.1],
  canoa: [2.8, 1.7],
};

function drawBill(ctx, img, V, x, d, w, h, flip = false, lift = 0) {
  const s = sc(V, d);
  const px = sx(V, x, d);
  const py = sy(V, d) - lift * s;
  const pw = w * s;
  if (px + pw / 2 < -20 || px - pw / 2 > V.w + 20) return false;
  if (flip) {
    ctx.save();
    ctx.translate(px, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -pw / 2, py - h * s, pw, h * s);
    ctx.restore();
  } else {
    ctx.drawImage(img, px - pw / 2, py - h * s, pw, h * s);
  }
  return true;
}

/** Dibuja un elemento de escenografía. env = { t, fog(d), night(0..1) } */
export function drawScenery(ctx, it, V, P, env) {
  const d = it.d;
  const o = it.ref;
  let a = env.fog(d);
  if (d < 3.6) a *= smooth(1.6, 3.6, d);
  if (a <= 0.02) return;
  ctx.globalAlpha = a;
  const t = env.t;
  const x = o.x * o.side;
  const sway = Math.sin(t * 1.4 + o.ph);
  switch (o.type) {
    case 'ahuejote':
      drawBill(ctx, ahuejoteSprite(o.zone, o.v), V, x, d, DIM.ahuejote[0], DIM.ahuejote[1], o.flip);
      break;
    case 'seco': {
      drawBill(ctx, secoSprite(o.v), V, x, d, DIM.seco[0], DIM.seco[1], o.flip);
      // muñecas colgando (se balancean)
      const s = sc(V, d);
      const px = sx(V, x, d);
      const py = sy(V, d);
      const hooks = [
        [-0.9, 5.8],
        [0.7, 6.6],
        [-0.3, 4.4],
      ];
      const img = dollSprite();
      for (let i = 0; i < hooks.length; i++) {
        const [hx, hy] = hooks[i];
        const ang = Math.sin(t * 1.3 + o.ph + i * 1.9) * 0.16;
        ctx.save();
        ctx.translate(px + hx * s * (o.flip ? -1 : 1), py - hy * s);
        ctx.rotate(ang);
        const dw = 0.62 * s;
        ctx.drawImage(img, -dw / 2, 0, dw, dw * (120 / 56));
        ctx.restore();
      }
      break;
    }
    case 'casita':
      drawBill(ctx, casitaSprite(o.v), V, x, d, DIM.casita[0], DIM.casita[1], o.flip);
      break;
    case 'puesto':
      drawBill(ctx, puestoSprite(o.v), V, x, d, DIM.puesto[0], DIM.puesto[1], o.flip);
      break;
    case 'farol': {
      drawBill(ctx, farolSprite(), V, x, d, DIM.farol[0], DIM.farol[1], false);
      const glow = clamp(P.n.dark * 1.9, 0, 1);
      if (glow > 0.05) {
        const s = sc(V, d);
        const px = sx(V, x, d);
        const py = sy(V, d) - 2.65 * s;
        const gs = s * 4.2 * (1 + 0.05 * sway);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * glow * 0.75;
        ctx.drawImage(glowSprite('warm'), px - gs / 2, py - gs / 2, gs, gs);
        ctx.globalCompositeOperation = 'source-over';
      }
      break;
    }
    case 'mariachi': {
      const bobH = Math.sin(t * 2.3 + o.ph) * 0.05;
      drawBill(ctx, mariachiSprite(), V, x, d, DIM.mariachi[0], DIM.mariachi[1], o.flip, bobH);
      const s = sc(V, d);
      const px = sx(V, x, d);
      const py = sy(V, d);
      // notas musicales flotando
      for (let i = 0; i < 3; i++) {
        const u = (t * 0.5 + i / 3 + o.ph) % 1;
        const ns = (0.5 + 0.2 * Math.sin(i)) * s;
        ctx.globalAlpha = a * Math.sin(Math.PI * u);
        ctx.drawImage(emojiSprite('🎶', 64), px + (i - 1) * s * 1.2 + Math.sin(u * 6 + i) * s * 0.3, py - (3.3 + u * 2.4) * s, ns, ns);
      }
      const glow = clamp(P.n.dark * 1.9, 0, 1);
      if (glow > 0.05) {
        const gs = s * 6;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * glow * 0.4;
        ctx.drawImage(glowSprite('pink'), px - gs / 2, py - 1.8 * s - gs / 2, gs, gs);
        ctx.globalCompositeOperation = 'source-over';
      }
      break;
    }
    case 'cabana':
      drawBill(ctx, cabanaSprite(o.zone), V, x, d, DIM.cabana[0], DIM.cabana[1], o.flip);
      break;
    case 'carrizal':
      drawBill(ctx, carrizalSprite(), V, x, d, DIM.carrizal[0], DIM.carrizal[1], o.flip, 0);
      break;
    case 'flores':
      drawBill(ctx, floresSprite(), V, x, d, DIM.flores[0], DIM.flores[1], o.flip, 0);
      break;
    case 'canoa':
      drawBill(ctx, canoaSprite(o.v), V, x, d, DIM.canoa[0], DIM.canoa[1], o.flip, Math.sin(t * 2 + o.ph) * 0.04);
      break;
    case 'papel': {
      const s = sc(V, d);
      const wM = WORLD.canalHalf * 2 + 2.4;
      const px = sx(V, 0, d);
      const py = sy(V, d) - 5.2 * s;
      const pw = wM * s;
      ctx.drawImage(papelSprite(), px - pw / 2, py, pw, pw * (150 / 1280) * 1.0);
      break;
    }
    case 'cuervo': {
      const s = sc(V, d);
      const px = sx(V, x * 0.4 + Math.sin(t * 0.6 + o.ph) * 2, d);
      const py = sy(V, d) - (5 + Math.sin(t * 1.1 + o.ph) * 0.7) * s;
      const sz = 0.9 * s;
      ctx.globalAlpha = a * 0.85;
      ctx.drawImage(crowSprite(Math.floor(t * 5 + o.ph) % 2), px - sz, py - sz * 0.58, sz * 2, sz * 1.17);
      break;
    }
    default:
      break;
  }
  ctx.globalAlpha = 1;
}

// ================================================================ cielo y fondo
function hillPath(ctx, V, base, amp, off, f1, f2, seed) {
  ctx.beginPath();
  ctx.moveTo(-50, V.horizon + 4);
  const n = 36;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * (V.w + 100) - 50;
    const u = x + off;
    const hgt = amp * (0.55 + 0.3 * Math.sin(u * f1 + seed) + 0.2 * Math.sin(u * f2 + seed * 2.3) + 0.12 * Math.sin(u * f1 * 3.1 + seed * 5));
    ctx.lineTo(x, base - hgt);
  }
  ctx.lineTo(V.w + 50, V.horizon + 4);
  ctx.closePath();
}

export function drawSky(ctx, V, P, env) {
  const t = env.t;
  const hz = V.horizon;
  ctx.fillStyle = vgrad(ctx, 0, hz + 4, [
    [0, P.c.skyTop],
    [0.55, P.c.skyMid],
    [1, P.c.skyLow],
  ]);
  ctx.fillRect(-48, -48, V.w + 96, hz + 53);

  // estrellas
  const starA = P.n.star;
  if (starA > 0.02) {
    for (let i = 0; i < 90; i++) {
      const x = hash(i * 3 + 1) * V.w + V.curve * 18;
      const y = hash(i * 3 + 2) * hz * 0.86;
      const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + hash(i) * 2.5) + i);
      ctx.fillStyle = `rgba(255,255,255,${starA * (0.25 + 0.6 * tw) * (1 - y / hz)})`;
      const sz = 1 + hash(i * 3) * 1.6;
      ctx.fillRect(x, y, sz, sz);
    }
  }

  // sol o luna
  const ox = P.n.orbX * V.w + V.curve * 26 - V.camX * 3;
  const oy = P.n.orbY * hz * 1.5;
  const orbR = hz * 0.085;
  const orbCol = P.c.orbCol;
  ctx.fillStyle = rgrad(ctx, ox, oy, orbR * 0.6, orbR * 4.4, [
    [0, P.orb === 'moon' ? 'rgba(200,210,255,0.35)' : 'rgba(255,240,170,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillRect(ox - orbR * 5, oy - orbR * 5, orbR * 10, orbR * 10);
  ctx.fillStyle = orbCol;
  circle(ctx, ox, oy, orbR);
  ctx.fill();
  if (P.orb === 'moon') {
    ctx.fillStyle = P.c.skyMid;
    circle(ctx, ox + orbR * 0.45, oy - orbR * 0.2, orbR * 0.92);
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // nubes
  const ca = P.n.cloudA;
  if (ca > 0.03) {
    const cloud = cloudSprite();
    for (let i = 0; i < 7; i++) {
      const spd = 4 + hash(i + 5) * 8;
      const w = (150 + hash(i + 1) * 170) * (V.w / 1280 + 0.35);
      const span = V.w + w * 2;
      const x = ((hash(i) * span + t * spd) % span) - w - V.camX * (2 + i * 0.4) + V.curve * 14;
      const y = hz * (0.08 + hash(i + 9) * 0.5);
      ctx.globalAlpha = ca * (0.5 + 0.5 * hash(i + 2));
      ctx.drawImage(cloud, x, y, w, w * 0.385);
    }
    ctx.globalAlpha = 1;
  }

  // montañas lejanas, volcán y colinas
  const parX = V.curve * 70 + V.camX * 5;
  ctx.fillStyle = P.c.hillFar;
  hillPath(ctx, V, hz + 2, hz * 0.28, parX * 0.5, 0.0042, 0.011, 1.7);
  ctx.fill();
  // volcán (Popocatépetl)
  const vx = V.w * 0.2 - parX * 0.35;
  const vh = hz * 0.46;
  const vw = hz * 0.62;
  ctx.fillStyle = P.c.hillFar;
  ctx.beginPath();
  ctx.moveTo(vx - vw, hz + 2);
  ctx.lineTo(vx - vw * 0.16, hz - vh);
  ctx.lineTo(vx + vw * 0.16, hz - vh);
  ctx.lineTo(vx + vw, hz + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${0.55 - P.n.dark * 0.35})`;
  ctx.beginPath();
  ctx.moveTo(vx - vw * 0.16, hz - vh);
  ctx.lineTo(vx + vw * 0.16, hz - vh);
  ctx.lineTo(vx + vw * 0.28, hz - vh * 0.72);
  ctx.lineTo(vx + vw * 0.08, hz - vh * 0.82);
  ctx.lineTo(vx - vw * 0.06, hz - vh * 0.7);
  ctx.lineTo(vx - vw * 0.27, hz - vh * 0.72);
  ctx.closePath();
  ctx.fill();
  // penacho de humo
  ctx.fillStyle = `rgba(230,230,240,${0.35 - P.n.dark * 0.2})`;
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.07 + i * 0.25) % 1;
    circle(ctx, vx + k * vw * 0.5, hz - vh - k * vh * 0.45, vw * (0.05 + k * 0.1));
    ctx.fill();
  }
  ctx.fillStyle = P.c.hillNear;
  hillPath(ctx, V, hz + 3, hz * 0.17, parX, 0.0068, 0.017, 4.1);
  ctx.fill();
}

// ================================================================ agua y chinampas
const D_NEAR = 1.5;
const D_FAR = 900;

function strip(ctx, V, xa, xb, da, db) {
  const d1 = Math.max(da, D_NEAR);
  const d2 = Math.max(db, D_NEAR + 0.01);
  const y1 = sy(V, d1);
  const y2 = sy(V, d2);
  quad(ctx, sx(V, xa, d1), y1, sx(V, xb, d1), y1, sx(V, xb, d2), y2, sx(V, xa, d2), y2);
}

const DEPTHS = (() => {
  const a = [];
  const n = 28;
  for (let i = 0; i <= n; i++) a.push(D_NEAR * Math.pow(D_FAR / D_NEAR, i / n));
  return a;
})();

function edgePolygon(ctx, V, xa, xb) {
  ctx.beginPath();
  for (let i = 0; i < DEPTHS.length; i++) {
    const d = DEPTHS[i];
    const px = sx(V, xa, d);
    const py = sy(V, d);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  for (let i = DEPTHS.length - 1; i >= 0; i--) {
    const d = DEPTHS[i];
    ctx.lineTo(sx(V, xb, d), sy(V, d));
  }
  ctx.closePath();
}

export function drawGround(ctx, V, P, env) {
  const camZ = env.camZ;
  const t = env.t;
  const h = V.h;
  const hz = V.horizon;
  const ch = WORLD.canalHalf;

  // ---- agua
  ctx.fillStyle = vgrad(ctx, hz, h, [
    [0, P.c.waterFar],
    [0.55, P.c.waterNear],
    [1, P.c.waterNear],
  ]);
  edgePolygon(ctx, V, -ch, ch);
  ctx.fill();

  // franjas que avanzan: dan sensación de velocidad
  const STRIPE = 4;
  const z0 = Math.floor((camZ + D_NEAR) / STRIPE);
  const z1 = Math.floor((camZ + 150) / STRIPE);
  ctx.fillStyle = P.c.waterBand;
  for (let i = z0; i <= z1; i++) {
    if (i & 1) continue;
    const da = i * STRIPE - camZ;
    const db = da + STRIPE * 0.5;
    ctx.globalAlpha = 0.085 * (1 - clamp(da / 150, 0, 1));
    strip(ctx, V, -ch, ch, da, db);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // destellos
  ctx.strokeStyle = P.c.sparkle;
  ctx.lineCap = 'round';
  const c0 = Math.floor(camZ / 5);
  for (let c = c0 + 1; c < c0 + 30; c++) {
    for (let j = 0; j < 2; j++) {
      const hh = hash(c * 2 + j);
      const z = c * 5 + hh * 5;
      const d = z - camZ;
      if (d < 2) continue;
      const x = (hash(c * 5 + j + 100) - 0.5) * 2 * (ch - 0.4);
      const s = sc(V, d);
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + c * 1.7 + j * 2.1);
      ctx.globalAlpha = 0.5 * tw * (1 - clamp(d / 100, 0, 1));
      ctx.lineWidth = Math.max(1, s * 0.05);
      const px = sx(V, x, d);
      const py = sy(V, d);
      ctx.beginPath();
      ctx.moveTo(px - s * (0.25 + hh * 0.4), py);
      ctx.lineTo(px + s * (0.25 + hh * 0.4), py);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // marcas de carril (rayas discontinuas muy suaves)
  for (const bx of [-WORLD.laneW / 2, WORLD.laneW / 2]) {
    const DASH = 3;
    const k0 = Math.floor((camZ + D_NEAR) / (DASH * 2));
    const k1 = Math.floor((camZ + 80) / (DASH * 2));
    ctx.fillStyle = '#ffffff';
    for (let k = k0; k <= k1; k++) {
      const da = k * DASH * 2 - camZ;
      const db = da + DASH;
      if (db < D_NEAR) continue;
      ctx.globalAlpha = 0.17 * (1 - clamp(da / 85, 0, 1));
      strip(ctx, V, bx - 0.05, bx + 0.05, da, db);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // reflejo de la luna
  if (P.orb === 'moon' && P.n.star > 0.3) {
    const mx = P.n.orbX * V.w + V.curve * 26 - V.camX * 3;
    ctx.strokeStyle = 'rgba(230,236,255,0.5)';
    for (let i = 0; i < 16; i++) {
      const y = hz + 4 + i * i * 1.9 + 3;
      const wv = Math.sin(t * 2 + i) * (4 + i * 1.4);
      ctx.globalAlpha = (1 - i / 16) * 0.5 * P.n.star;
      ctx.lineWidth = 2 + i * 0.5;
      ctx.beginPath();
      ctx.moveTo(mx - 10 - i * 4 + wv, y);
      ctx.lineTo(mx + 10 + i * 4 + wv, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- chinampas (orillas)
  for (const side of [-1, 1]) {
    const xe = side * ch;
    const xo = side * (ch + 90);
    ctx.fillStyle = vgrad(ctx, hz, h, [
      [0, P.c.bankB],
      [1, P.c.bankA],
    ]);
    edgePolygon(ctx, V, xe, xo);
    ctx.fill();
    // surcos de cultivo
    const ROW = 3;
    const r0 = Math.floor((camZ + D_NEAR) / ROW);
    const r1 = Math.floor((camZ + 120) / ROW);
    ctx.fillStyle = P.c.bankB;
    for (let i = r0; i <= r1; i++) {
      if (i & 1) continue;
      const da = i * ROW - camZ;
      ctx.globalAlpha = 0.55 * (1 - clamp(da / 120, 0, 1));
      strip(ctx, V, xe + side * 1.2, xo, da, da + ROW);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // orilla de tierra
    ctx.fillStyle = P.c.shore;
    edgePolygon(ctx, V, xe, xe + side * 0.9);
    ctx.fill();
    ctx.fillStyle = P.c.shoreDark;
    edgePolygon(ctx, V, xe - side * 0.1, xe + side * 0.12);
    ctx.fill();
  }
}

// ================================================================ atmósfera
export function drawHaze(ctx, V, P) {
  const hz = V.horizon;
  const fm = P.n.fogMax;
  if (fm < 0.02) return;
  const [r, g, b] = P.r.fog;
  const top = hz - V.h * 0.11;
  const bot = hz + V.h * 0.3;
  const gr = ctx.createLinearGradient(0, top, 0, bot);
  const col = (a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  gr.addColorStop(0, col(0));
  gr.addColorStop((hz - top) / (bot - top), col(fm * 0.92));
  gr.addColorStop(1, col(0));
  ctx.fillStyle = gr;
  ctx.fillRect(0, top, V.w, bot - top);
}

/** Bancos de niebla que cruzan el canal (Isla de las Muñecas). */
export function drawMist(ctx, V, P, env) {
  if (P.mist < 0.05) return;
  const t = env.t;
  const [r, g, b] = P.r.fog;
  for (let i = 0; i < 5; i++) {
    const d = 18 + i * 17 + ((env.camZ * 0.0) % 1);
    const s = sc(V, d);
    const y = sy(V, d) - s * 0.5;
    const x = V.cx + Math.sin(t * 0.12 + i * 2.1) * V.w * 0.35 + V.curve * V.w * 0.05;
    const w = V.w * (0.7 + i * 0.12);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, w * 0.5);
    gr.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},${0.5 * P.mist})`);
    gr.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},0)`);
    ctx.fillStyle = gr;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.22);
    ctx.translate(-x, -y);
    ctx.fillRect(x - w * 0.5, y - w * 0.5, w, w);
    ctx.restore();
  }
}

/** Oscuridad de la noche con foco de visión alrededor del ajolote, y luciérnagas. */
export function drawDarkness(ctx, V, P, env) {
  const dk = P.n.dark;
  if (dk < 0.02) return;
  const px = env.playerX;
  const py = env.playerY;
  const R = Math.max(V.w, V.h);
  const tint = P.zone === 2 || P.u < 0.5 ? '4,6,28' : '10,22,18';
  const gr = ctx.createRadialGradient(px, py - V.h * 0.12, V.h * 0.22, px, py - V.h * 0.12, R * 0.78);
  gr.addColorStop(0, `rgba(${tint},0)`);
  gr.addColorStop(0.5, `rgba(${tint},${dk * 0.55})`);
  gr.addColorStop(1, `rgba(${tint},${dk})`);
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, V.w, V.h);
}

export function drawFireflies(ctx, V, P, env) {
  const a = P.n.star;
  if (a < 0.05) return;
  const t = env.t;
  ctx.globalCompositeOperation = 'lighter';
  const g = glowSprite('green');
  for (let i = 0; i < 22; i++) {
    const bx = hash(i * 7 + 1) * V.w;
    const by = V.horizon + 20 + hash(i * 7 + 2) * V.h * 0.45;
    const x = bx + Math.sin(t * (0.4 + hash(i) * 0.5) + i * 3.1) * 40;
    const y = by + Math.cos(t * (0.5 + hash(i + 3) * 0.4) + i) * 28;
    const tw = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 5.3);
    ctx.globalAlpha = a * 0.65 * tw;
    const sz = 22 + hash(i + 9) * 22;
    ctx.drawImage(g, x - sz / 2, y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
