// Obstáculos, coleccionables y premios: sprites pre-renderizados, colisiones según la matriz del GDD §2.3 y dibujo.
//
//   obstáculo   ocupa        carril  bucear  saltar
//   trajinera   1 carril       ✔       ✔       ✘
//   red         1 carril       ✔       ✘       ✘
//   garza       1 carril       ✔       ✔       ✘
//   lirio       1-2 carriles   ✔       ✔       ✔
//   tronco      3 carriles     ✘       ✘       ✔
//   cerca       3 carriles     ✘       ✘       ✔
//   remolino    3 carriles     ✘       ✘       ✔
//   carpa       cruza carriles ✔       ✔       ✘

import { WORLD, TRAJINERA_NAMES } from './config.js';
import { spr } from './engine.js';
import { DIMS, sx, sy, sc } from './track.js';
import { TAU, clamp, lerp, smooth, hash, rr, ell, circle, vgrad, hgrad, rgrad, shade, marigold, sparkle, axolotlFace } from './art.js';

// ================================================================ comportamiento

/** Posición y altura de la carpa saltarina según su cercanía (salta desde la orilla hacia su carril). */
const LEAP = 24;
export function carpState(e, dist) {
  const dz = e.z - dist;
  if (dz > LEAP + 10) return { vis: false, x: 0, h: 0, tilt: 0, warn: 0 };
  const xs = e.from * (WORLD.canalHalf + 0.5);
  const xt = e.x;
  if (dz > LEAP) return { vis: false, x: xs, h: 0, tilt: 0, warn: 1 - (dz - LEAP) / 10 };
  const u = clamp((LEAP - dz) / (LEAP + 4), 0, 1);
  const f = clamp(u / (LEAP / (LEAP + 4)), 0, 1);
  const x = lerp(xs, xt, f);
  const h = 1.45 * Math.sin(Math.PI * u) + 0.12;
  const tilt = -Math.cos(Math.PI * u) * 0.9;
  return { vis: u < 0.995, x, h, tilt, warn: 0 };
}

/** Altura de la garza (cae desde el cielo hacia su carril) y fuerza de su sombra de aviso. */
export function garzaState(e, dist) {
  const dz = e.z - dist;
  const k = smooth(2.5, 34, dz);
  return { h: lerp(0.25, 7.5, k), shadow: smooth(70, 10, dz), near: 1 - k };
}

function blocks(e, p) {
  switch (e.k) {
    case 'trajinera':
    case 'garza':
    case 'carpa':
      return p.mode !== 'dive';
    case 'red':
      return true;
    case 'lirio':
      return p.mode !== 'dive' && p.h < 0.45;
    case 'tronco':
      return p.mode === 'dive' || p.h < 1.0;
    case 'cerca':
      return p.mode === 'dive' || p.h < 0.9;
    case 'remolino':
      return p.mode === 'dive' || p.h < 0.5;
    default:
      return false;
  }
}

const SOLID = new Set(['trajinera', 'red', 'garza', 'lirio', 'tronco', 'cerca', 'remolino', 'carpa']);

/**
 * Colisiones y recolección del tick. Recorre las entidades que el ajolote cruzó entre prevDist y dist.
 * hooks: hit(e) smash(e) flower(e) life(e) dash(e) meta(e)
 */
export function updateEntities(state, prevDist, hooks) {
  const p = state.player;
  const dist = state.dist;
  const dashing = p.dashT > 0;
  const protectedNow = dashing || p.iframes > 0 || state.god;
  const cy = p.mode === 'dive' ? -0.65 : p.h + 0.35;
  const es = state.entities;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (e.gone) continue;
    const half = e.len / 2 + WORLD.playerDepth;
    if (e.z + half < prevDist || e.z - half > dist) continue;

    if (SOLID.has(e.k)) {
      if (e.hit) continue;
      let ex = e.x;
      if (e.k === 'carpa') ex = carpState(e, dist).x;
      if (Math.abs(p.x - ex) >= e.hw + WORLD.playerHalf) continue;
      if (!blocks(e, p)) continue;
      e.hit = true;
      if (dashing) {
        e.gone = true;
        hooks.smash(e);
      } else if (protectedNow) {
        /* atraviesa sin daño (invulnerable) */
      } else {
        hooks.hit(e);
      }
    } else if (e.k === 'flor') {
      const reach = dashing ? 1.7 : WORLD.playerHalf + e.hw;
      if (Math.abs(p.x - e.x) < reach && Math.abs(cy - e.h) < (dashing ? 1.6 : 0.95)) {
        e.gone = true;
        hooks.flower(e);
      }
    } else if (e.k === 'ajolotito') {
      if (Math.abs(p.x - e.x) < 1.35 && Math.abs(cy - e.h) < 1.5) {
        e.gone = true;
        hooks.life(e);
      }
    } else if (e.k === 'dash') {
      if (Math.abs(p.x - e.x) < 1.35 && Math.abs(cy - e.h) < 1.5) {
        e.gone = true;
        hooks.dash(e);
      }
    } else if (e.k === 'meta') {
      if (!e.hit && dist >= e.z) {
        e.hit = true;
        hooks.meta(e);
      }
    }
  }
}

// ================================================================ sprites

const PPM = 200; // píxeles por metro en trajineras, redes, garzas y lirios

const TRAJ_COLORS = [
  { c1: '#e63946', c2: '#ffd23f', c3: '#2a9d8f' },
  { c1: '#2a9d8f', c2: '#ff9f1c', c3: '#e63946' },
  { c1: '#7b2cbf', c2: '#ffd23f', c3: '#ff5ca8' },
  { c1: '#1d6fd8', c2: '#ffe066', c3: '#ff7b54' },
  { c1: '#f77f00', c2: '#2ec4b6', c3: '#ef476f' },
  { c1: '#ef476f', c2: '#ffd166', c3: '#06d6a0' },
];
const FLOWER_COLS = ['#ff4d6d', '#ffd23f', '#ff9f1c', '#ffffff', '#ff8fab', '#c77dff'];

function trajineraSprite(i) {
  const v = TRAJ_COLORS[i % TRAJ_COLORS.length];
  const name = TRAJINERA_NAMES[i % TRAJINERA_NAMES.length];
  return spr(`xoc:traj:${i}`, 460, 590, (ctx) => {
    const W = 460;
    const wl = 520;
    // casco sumergido
    ctx.fillStyle = 'rgba(8,60,84,0.38)';
    rr(ctx, 34, wl - 6, W - 68, 70, 26);
    ctx.fill();
    // arco floral (detrás del casco)
    const cx = W / 2;
    const base = wl - 80;
    ctx.fillStyle = vgrad(ctx, 30, base, [
      [0, 'rgba(30,20,40,0.85)'],
      [1, 'rgba(60,40,50,0.7)'],
    ]);
    ctx.beginPath();
    ctx.ellipse(cx, base, 172, 395, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fill();
    // mesa y bancas al fondo
    ctx.fillStyle = '#fff3d6';
    rr(ctx, cx - 92, base - 66, 184, 16, 6);
    ctx.fill();
    ctx.fillStyle = v.c2;
    rr(ctx, cx - 120, base - 34, 240, 18, 6);
    ctx.fill();
    // guirnalda de hojas
    ctx.strokeStyle = shade(v.c3, -0.35);
    ctx.lineWidth = 52;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(cx, base, 182, 395, 0, Math.PI, TAU);
    ctx.stroke();
    // flores del arco
    for (let k = 0; k <= 44; k++) {
      const a = Math.PI + (Math.PI * k) / 44;
      const fx = cx + Math.cos(a) * 182;
      const fy = base + Math.sin(a) * 395;
      const r = 13 + hash(k + i * 50) * 10;
      ctx.fillStyle = FLOWER_COLS[(k + i) % FLOWER_COLS.length];
      circle(ctx, fx + (hash(k * 3) - 0.5) * 10, fy + (hash(k * 7) - 0.5) * 10, r);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      circle(ctx, fx - r * 0.25, fy - r * 0.25, r * 0.38);
      ctx.fill();
    }
    // casco sobre el agua
    const hullTop = wl - 96;
    ctx.fillStyle = vgrad(ctx, hullTop, wl, [
      [0, v.c1],
      [1, shade(v.c1, -0.32)],
    ]);
    rr(ctx, 10, hullTop, W - 20, 100, 28);
    ctx.fill();
    ctx.fillStyle = v.c2;
    rr(ctx, 10, hullTop + 38, W - 20, 22, 8);
    ctx.fill();
    ctx.fillStyle = v.c3;
    for (let k = 0; k < 9; k++) {
      const dx = 44 + k * 46;
      ctx.beginPath();
      ctx.moveTo(dx, hullTop + 49);
      ctx.lineTo(dx + 12, hullTop + 40);
      ctx.lineTo(dx + 24, hullTop + 49);
      ctx.lineTo(dx + 12, hullTop + 58);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    rr(ctx, 22, hullTop + 6, W - 44, 10, 5);
    ctx.fill();
    // letrero con el nombre
    ctx.fillStyle = '#fffaf0';
    rr(ctx, cx - 112, 70, 224, 62, 14);
    ctx.fill();
    ctx.strokeStyle = v.c1;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = v.c1;
    ctx.font = '800 38px "Trebuchet MS","Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, cx, 103);
  });
}

function redSprite() {
  return spr('xoc:red', 460, 500, (ctx) => {
    const W = 460;
    const wl = 380;
    // postes
    for (const px of [34, 426]) {
      ctx.fillStyle = 'rgba(70,45,25,0.5)';
      ctx.fillRect(px - 12, wl, 24, 120);
      ctx.fillStyle = hgrad(ctx, px - 12, px + 12, [
        [0, '#6e4a2a'],
        [0.5, '#a57444'],
        [1, '#5c3c20'],
      ]);
      ctx.fillRect(px - 12, 18, 24, wl - 18);
    }
    const mesh = (y0, y1, col) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(48, y0, W - 96, y1 - y0);
      ctx.clip();
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = -500; k < 500; k += 30) {
        ctx.moveTo(48 + k, y0);
        ctx.lineTo(48 + k + 420, y0 + 420);
        ctx.moveTo(48 + k + 420, y0);
        ctx.lineTo(48 + k, y0 + 420);
      }
      ctx.stroke();
      ctx.restore();
    };
    ctx.fillStyle = 'rgba(240,228,190,0.08)';
    ctx.fillRect(48, 70, W - 96, wl - 70);
    mesh(66, wl, 'rgba(244,232,190,0.95)');
    ctx.fillStyle = 'rgba(80,170,200,0.18)';
    ctx.fillRect(48, wl, W - 96, 100);
    mesh(wl, wl + 100, 'rgba(190,225,235,0.55)');
    // cuerda superior con boyas
    ctx.strokeStyle = '#d9c28a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(34, 58);
    ctx.quadraticCurveTo(W / 2, 96, W - 34, 58);
    ctx.stroke();
    for (let k = 0; k < 8; k++) {
      const u = (k + 0.5) / 8;
      const bx = lerp(46, W - 46, u);
      const by = 58 + 38 * 4 * u * (1 - u) * 0.5 + 6;
      ctx.fillStyle = k % 2 ? '#ff7b2c' : '#ffd23f';
      circle(ctx, bx, by, 13);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      circle(ctx, bx - 4, by - 4, 4);
      ctx.fill();
    }
    // plomos
    ctx.fillStyle = 'rgba(40,50,60,0.7)';
    for (let k = 0; k < 10; k++) {
      circle(ctx, 62 + k * 37, wl + 100, 8);
      ctx.fill();
    }
    // pececito atrapado
    ctx.fillStyle = '#ff9f1c';
    ell(ctx, 150, 250, 24, 11, -0.3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(172, 244);
    ctx.lineTo(194, 232);
    ctx.lineTo(192, 262);
    ctx.fill();
    ctx.fillStyle = '#1b1b2e';
    circle(ctx, 136, 247, 3);
    ctx.fill();
  });
}

function garzaSprite(frame) {
  return spr(`xoc:garza:${frame}`, 480, 360, (ctx) => {
    const cx = 240;
    // patas
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 16, 262);
      ctx.lineTo(cx + s * 26, 346);
      ctx.stroke();
      ctx.lineWidth = 5;
      for (let t = -1; t <= 1; t++) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 26, 346);
        ctx.lineTo(cx + s * 26 + t * 14, 356);
        ctx.stroke();
      }
      ctx.lineWidth = 8;
    }
    // alas
    const up = frame === 0;
    for (const s of [-1, 1]) {
      const tipX = cx + s * 218;
      const tipY = up ? 52 : 250;
      const midY = up ? 90 : 205;
      ctx.fillStyle = vgrad(ctx, 60, 250, [
        [0, '#f8fbfa'],
        [1, '#cfd8dc'],
      ]);
      ctx.beginPath();
      ctx.moveTo(cx + s * 30, 150);
      ctx.bezierCurveTo(cx + s * 100, midY - 30, cx + s * 170, midY - 28, tipX, tipY);
      ctx.lineTo(tipX - s * 26, tipY + (up ? 38 : -22));
      ctx.bezierCurveTo(cx + s * 150, midY + 48, cx + s * 90, 232, cx + s * 30, 232);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8f9da4';
      ctx.lineWidth = 3;
      ctx.stroke();
      // plumas primarias oscuras
      ctx.fillStyle = '#546e7a';
      for (let k = 0; k < 5; k++) {
        const fx = tipX - s * (k * 22 + 4);
        const fy = tipY + (up ? k * 11 : -k * 7) + (up ? 4 : 0);
        ell(ctx, fx, fy, 22, 7, s * (up ? 0.5 : -0.4));
        ctx.fill();
      }
    }
    // cuerpo y cuello
    ctx.fillStyle = vgrad(ctx, 120, 270, [
      [0, '#ffffff'],
      [1, '#d7dfe2'],
    ]);
    ell(ctx, cx, 200, 52, 80);
    ctx.fill();
    ctx.strokeStyle = '#f2f6f6';
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(cx, 140);
    ctx.bezierCurveTo(cx + 40, 110, cx - 40, 86, cx, 56);
    ctx.stroke();
    // cabeza y pico
    ctx.fillStyle = '#ffffff';
    ell(ctx, cx, 50, 25, 21);
    ctx.fill();
    ctx.strokeStyle = '#37474f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 30, 40);
    ctx.lineTo(cx - 62, 22);
    ctx.moveTo(cx - 28, 46);
    ctx.lineTo(cx - 64, 40);
    ctx.stroke();
    ctx.fillStyle = '#f2a93b';
    ctx.beginPath();
    ctx.moveTo(cx - 10, 56);
    ctx.lineTo(cx + 10, 56);
    ctx.lineTo(cx, 126);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e08a1e';
    ctx.beginPath();
    ctx.moveTo(cx - 10, 56);
    ctx.lineTo(cx, 56);
    ctx.lineTo(cx, 126);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1b1b2e';
    circle(ctx, cx - 12, 44, 4.5);
    ctx.fill();
    circle(ctx, cx + 12, 44, 4.5);
    ctx.fill();
  });
}

function lirioSprite(span) {
  const w = Math.round((span * WORLD.laneW - 0.1) * PPM);
  return spr(`xoc:lirio:${span}`, w, 150, (ctx) => {
    const n = span * 4;
    for (let k = 0; k < n; k++) {
      const px = ((k + 0.5) / n) * w + (hash(k + 11) - 0.5) * 40;
      const py = 100 + (hash(k + 5) - 0.5) * 36;
      const rx = 56 + hash(k + 3) * 26;
      const ry = rx * 0.3;
      ctx.fillStyle = '#1e6b34';
      ell(ctx, px, py + 6, rx, ry);
      ctx.fill();
      ctx.fillStyle = vgrad(ctx, py - ry, py + ry, [
        [0, '#58b84a'],
        [1, '#2f8a3c'],
      ]);
      ell(ctx, px, py, rx, ry);
      ctx.fill();
      // muesca de la hoja
      ctx.fillStyle = 'rgba(30,100,140,0.85)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + rx * 1.02, py - ry * 0.3);
      ctx.lineTo(px + rx * 1.02, py + ry * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(190,255,170,0.45)';
      ctx.lineWidth = 2;
      ell(ctx, px, py - 1, rx * 0.72, ry * 0.7);
      ctx.stroke();
    }
    // flores de loto
    const fl = span === 1 ? [0.3, 0.72] : [0.16, 0.42, 0.66, 0.88];
    for (let k = 0; k < fl.length; k++) {
      const fx = fl[k] * w;
      const fy = 92 + (hash(k + 20) - 0.5) * 20;
      for (let pidx = -2; pidx <= 2; pidx++) {
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(pidx * 0.42);
        ctx.fillStyle = pidx % 2 ? '#ff8fb8' : '#ff6fa5';
        ell(ctx, 0, -26, 12, 28);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#ffe066';
      circle(ctx, fx, fy - 6, 8);
      ctx.fill();
    }
  });
}

function troncoSprite() {
  return spr('xoc:tronco', 1530, 345, (ctx) => {
    const W = 1530;
    const wl = 195;
    // raíces sumergidas
    ctx.strokeStyle = 'rgba(74,50,34,0.5)';
    ctx.lineCap = 'round';
    for (let k = 0; k < 26; k++) {
      const x0 = 80 + hash(k + 1) * (W - 160);
      ctx.lineWidth = 4 + hash(k + 9) * 8;
      ctx.beginPath();
      ctx.moveTo(x0, wl);
      ctx.bezierCurveTo(x0 + (hash(k + 4) - 0.5) * 90, wl + 40, x0 + (hash(k + 6) - 0.5) * 140, wl + 90, x0 + (hash(k + 8) - 0.5) * 120, wl + 148);
      ctx.stroke();
    }
    // tronco
    ctx.fillStyle = vgrad(ctx, 40, 225, [
      [0, '#8a6038'],
      [0.5, '#5e3f24'],
      [1, '#3c2615'],
    ]);
    rr(ctx, 26, 40, W - 52, 185, 80);
    ctx.fill();
    // corteza
    ctx.lineCap = 'round';
    for (let k = 0; k < 170; k++) {
      const bx = 60 + hash(k + 100) * (W - 120);
      const by = 62 + hash(k + 200) * 140;
      ctx.strokeStyle = hash(k + 300) > 0.5 ? 'rgba(30,18,8,0.5)' : 'rgba(190,140,90,0.35)';
      ctx.lineWidth = 2 + hash(k + 400) * 4;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + 20 + hash(k + 500) * 50, by + (hash(k + 600) - 0.5) * 8);
      ctx.stroke();
    }
    // musgo
    for (let k = 0; k < 22; k++) {
      ctx.fillStyle = `rgba(${70 + hash(k) * 40},${130 + hash(k + 2) * 50},60,0.75)`;
      ell(ctx, 80 + hash(k + 33) * (W - 160), 52 + hash(k + 35) * 30, 24 + hash(k + 37) * 38, 10 + hash(k + 39) * 10);
      ctx.fill();
    }
    // ramas rotas y hojas
    for (const bx of [330, 760, 1170]) {
      ctx.fillStyle = '#4a2f1a';
      rr(ctx, bx, 8, 34, 60, 12);
      ctx.fill();
      for (let l = 0; l < 6; l++) {
        ctx.fillStyle = l % 2 ? '#4f9a3a' : '#63b24a';
        ell(ctx, bx + 17 + (l - 2.5) * 12, 6 - (l % 3) * 4, 6, 22, (l - 2.5) * 0.28);
        ctx.fill();
      }
    }
    // nudos
    for (const kx of [200, 560, 980, 1360]) {
      ctx.fillStyle = '#2f1d0e';
      ell(ctx, kx, 130, 26, 18);
      ctx.fill();
      ctx.strokeStyle = '#8a6038';
      ctx.lineWidth = 3;
      ell(ctx, kx, 130, 14, 9);
      ctx.stroke();
    }
    // línea de agua
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(0, wl - 3, W, 6);
    // peligro: franjas reflectantes en los extremos
    ctx.fillStyle = 'rgba(255,214,64,0.9)';
    for (let k = 0; k < 4; k++) {
      ctx.fillRect(34 + k * 14, 70, 7, 120);
      ctx.fillRect(W - 34 - k * 14 - 7, 70, 7, 120);
    }
  });
}

function cercaSprite() {
  return spr('xoc:cerca', 1530, 330, (ctx) => {
    const W = 1530;
    const wl = 180;
    const step = 118;
    const n = Math.floor((W - 60) / step);
    // estacas sumergidas
    for (let k = 0; k <= n; k++) {
      const px = 50 + k * step;
      ctx.fillStyle = 'rgba(80,56,34,0.5)';
      ctx.fillRect(px - 15, wl, 30, 150);
    }
    // estacas
    for (let k = 0; k <= n; k++) {
      const px = 50 + k * step;
      const top = 22 + hash(k + 7) * 22;
      ctx.fillStyle = hgrad(ctx, px - 17, px + 17, [
        [0, '#7a5230'],
        [0.5, '#b78650'],
        [1, '#654326'],
      ]);
      ctx.beginPath();
      ctx.moveTo(px - 17, wl);
      ctx.lineTo(px - 17, top + 26);
      ctx.lineTo(px, top);
      ctx.lineTo(px + 17, top + 26);
      ctx.lineTo(px + 17, wl);
      ctx.closePath();
      ctx.fill();
    }
    // carrizo tejido
    for (const [by, col] of [
      [66, '#d6b46a'],
      [106, '#b88e45'],
      [146, '#d6b46a'],
    ]) {
      for (let k = 0; k < n; k++) {
        const x0 = 50 + k * step + 17;
        const x1 = 50 + (k + 1) * step - 17;
        ctx.fillStyle = col;
        rr(ctx, x0, by - 12, x1 - x0, 24, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,50,20,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let t = x0 + 6; t < x1; t += 14) {
          ctx.moveTo(t, by - 10);
          ctx.lineTo(t + 6, by + 10);
        }
        ctx.stroke();
      }
    }
    // macetas de cempasúchil
    for (let k = 1; k < n; k += 2) {
      const px = 50 + k * step + step / 2;
      ctx.fillStyle = '#b5532d';
      ctx.beginPath();
      ctx.moveTo(px - 20, 36);
      ctx.lineTo(px + 20, 36);
      ctx.lineTo(px + 14, 66);
      ctx.lineTo(px - 14, 66);
      ctx.closePath();
      ctx.fill();
      marigold(ctx, px - 8, 24, 13);
      marigold(ctx, px + 10, 20, 11);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(0, wl - 3, W, 6);
    ctx.fillStyle = 'rgba(255,214,64,0.9)';
    for (let k = 0; k < 4; k++) {
      ctx.fillRect(10 + k * 12, 70, 6, 100);
      ctx.fillRect(W - 10 - k * 12 - 6, 70, 6, 100);
    }
  });
}

function remolinoSprite(frame) {
  return spr(`xoc:remolino:${frame}`, 960, 320, (ctx) => {
    const W = 960;
    const H = 320;
    // banda de agua revuelta
    ctx.fillStyle = rgrad(ctx, W / 2, H / 2, 20, W / 2, [
      [0, 'rgba(10,50,80,0.0)'],
      [1, 'rgba(10,50,80,0.28)'],
    ]);
    ell(ctx, W / 2, H / 2, W / 2 - 4, H / 2 - 6);
    ctx.fill();
    const rot = (frame / 8) * (Math.PI / 2);
    for (const cx of [160, 480, 800]) {
      const cy = H / 2;
      ctx.fillStyle = rgrad(ctx, cx, cy, 6, 150, [
        [0, '#06243a'],
        [0.45, '#0d4a6b'],
        [1, 'rgba(60,170,190,0.55)'],
      ]);
      circle(ctx, cx, cy, 150);
      ctx.fill();
      ctx.lineCap = 'round';
      for (let arm = 0; arm < 4; arm++) {
        ctx.beginPath();
        for (let s = 0; s <= 40; s++) {
          const u = s / 40;
          const a = rot + arm * (Math.PI / 2) + u * 4.2;
          const r = 10 + u * 138;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(235,252,255,0.85)';
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 15;
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 4;
      circle(ctx, cx, cy, 148);
      ctx.stroke();
    }
  });
}

function carpaSprite() {
  return spr('xoc:carpa', 240, 150, (ctx) => {
    // cola
    ctx.fillStyle = '#ff7b2c';
    ctx.beginPath();
    ctx.moveTo(60, 76);
    ctx.quadraticCurveTo(20, 28, 6, 36);
    ctx.quadraticCurveTo(30, 76, 6, 118);
    ctx.quadraticCurveTo(24, 122, 60, 80);
    ctx.fill();
    // aleta dorsal
    ctx.fillStyle = '#ff9f4d';
    ctx.beginPath();
    ctx.moveTo(100, 44);
    ctx.quadraticCurveTo(130, 8, 162, 40);
    ctx.fill();
    // cuerpo
    ctx.fillStyle = vgrad(ctx, 40, 116, [
      [0, '#ffb347'],
      [0.55, '#ff7b2c'],
      [1, '#fff1d6'],
    ]);
    ell(ctx, 128, 78, 86, 38, 0.04);
    ctx.fill();
    // manchas blancas y rojas
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ell(ctx, 118, 66, 24, 12, -0.2);
    ctx.fill();
    ell(ctx, 160, 88, 16, 9, 0.2);
    ctx.fill();
    ctx.fillStyle = 'rgba(214,40,40,0.75)';
    ell(ctx, 92, 84, 16, 9, 0.1);
    ctx.fill();
    // escamas
    ctx.strokeStyle = 'rgba(160,60,10,0.3)';
    ctx.lineWidth = 2;
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(86 + k * 18 + (r % 2) * 9, 66 + r * 14, 8, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
    }
    // ojo, boca y aleta
    ctx.fillStyle = '#fff';
    circle(ctx, 190, 70, 9);
    ctx.fill();
    ctx.fillStyle = '#1b1b2e';
    circle(ctx, 192, 70, 5);
    ctx.fill();
    ctx.strokeStyle = '#8a3a10';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(210, 84);
    ctx.quadraticCurveTo(200, 92, 192, 90);
    ctx.stroke();
    ctx.fillStyle = '#ff9f4d';
    ctx.beginPath();
    ctx.moveTo(150, 100);
    ctx.quadraticCurveTo(140, 130, 116, 128);
    ctx.quadraticCurveTo(132, 108, 150, 100);
    ctx.fill();
  });
}

function florSprite(under) {
  return spr(under ? 'xoc:flor:u' : 'xoc:flor', 84, 84, (ctx) => {
    if (under) {
      ctx.fillStyle = rgrad(ctx, 42, 42, 8, 40, [
        [0, 'rgba(200,245,255,0.15)'],
        [1, 'rgba(160,230,255,0.55)'],
      ]);
      circle(ctx, 42, 42, 40);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      marigold(ctx, 42, 44, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      circle(ctx, 28, 26, 5);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,200,60,0.13)';
      circle(ctx, 42, 42, 33);
      ctx.fill();
      marigold(ctx, 42, 42, 30);
    }
  });
}

function ajolotitoSprite() {
  return spr('xoc:ajolotito', 156, 156, (ctx) => {
    ctx.fillStyle = rgrad(ctx, 78, 84, 8, 74, [
      [0, 'rgba(255,230,120,0.65)'],
      [1, 'rgba(255,230,120,0)'],
    ]);
    circle(ctx, 78, 84, 74);
    ctx.fill();
    // cuerpecito
    ctx.fillStyle = '#ffc2d6';
    ell(ctx, 78, 128, 28, 20);
    ctx.fill();
    ctx.fillStyle = '#ff9fbd';
    for (const s of [-1, 1]) {
      ell(ctx, 78 + s * 26, 140, 9, 6);
      ctx.fill();
    }
    axolotlFace(ctx, 78, 84, 40, 0.4);
    // corazón
    ctx.fillStyle = '#ff3d6e';
    ctx.beginPath();
    ctx.moveTo(78, 30);
    ctx.bezierCurveTo(60, 14, 48, 34, 78, 50);
    ctx.bezierCurveTo(108, 34, 96, 14, 78, 30);
    ctx.fill();
  });
}

function dashSprite() {
  return spr('xoc:dash', 180, 150, (ctx) => {
    ctx.fillStyle = rgrad(ctx, 90, 78, 10, 86, [
      [0, 'rgba(255,214,64,0.75)'],
      [1, 'rgba(255,160,40,0)'],
    ]);
    circle(ctx, 90, 78, 86);
    ctx.fill();
    // chinampa
    ctx.fillStyle = '#5a3b22';
    ell(ctx, 90, 114, 70, 22);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, 92, 120, [
      [0, '#79c84f'],
      [1, '#3f8f3a'],
    ]);
    ell(ctx, 90, 106, 66, 19);
    ctx.fill();
    marigold(ctx, 58, 86, 20);
    marigold(ctx, 94, 76, 26);
    marigold(ctx, 128, 88, 19);
    // estacas
    ctx.fillStyle = '#8b5a2b';
    for (const dx of [-62, 62]) {
      ctx.fillRect(90 + dx - 4, 96, 8, 30);
    }
    sparkle(ctx, 150, 38, 14, '#fff6c2');
    sparkle(ctx, 32, 52, 10, '#fff6c2');
    // rayo de impulso
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(100, 20);
    ctx.lineTo(80, 52);
    ctx.lineTo(94, 52);
    ctx.lineTo(84, 76);
    ctx.lineTo(112, 42);
    ctx.lineTo(97, 42);
    ctx.closePath();
    ctx.fill();
  });
}

function metaSprite() {
  return spr('xoc:meta', 1560, 555, (ctx) => {
    const W = 1560;
    // pilares de cempasúchil
    for (const px of [75, W - 75]) {
      ctx.fillStyle = '#5a3b22';
      ctx.fillRect(px - 26, 150, 52, 405);
      for (let k = 0; k < 30; k++) {
        marigold(ctx, px + (hash(k + px) - 0.5) * 50, 170 + k * 13, 24 + hash(k) * 8, k % 3 ? '#ff9f1c' : '#ffb830', '#ffd96a');
      }
    }
    // tablero
    ctx.fillStyle = vgrad(ctx, 20, 230, [
      [0, '#ff5ca8'],
      [1, '#a4126b'],
    ]);
    rr(ctx, 90, 24, W - 180, 200, 30);
    ctx.fill();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 12;
    ctx.stroke();
    for (let k = 0; k < 46; k++) {
      marigold(ctx, 110 + k * ((W - 220) / 45), 24, 15, '#ff9f1c', '#ffc83d');
      marigold(ctx, 110 + k * ((W - 220) / 45), 224, 15, '#ff9f1c', '#ffc83d');
    }
    ctx.fillStyle = '#fff6d8';
    ctx.font = '900 118px "Trebuchet MS","Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#6b0f47';
    ctx.strokeText('¡META!', W / 2, 108);
    ctx.fillText('¡META!', W / 2, 108);
    ctx.font = '800 40px "Trebuchet MS","Segoe UI",sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('2000 m · ¡Escapaste de Xochimilco!', W / 2, 184);
    // papel picado
    const cols = ['#ff5ca8', '#ffd23f', '#2ec4b6', '#8f5bff', '#ff7b2c', '#39c46b'];
    for (let k = 0; k < 26; k++) {
      const fx = 150 + k * ((W - 300) / 25);
      ctx.fillStyle = cols[k % cols.length];
      ctx.beginPath();
      ctx.moveTo(fx - 26, 236);
      ctx.lineTo(fx + 26, 236);
      ctx.lineTo(fx + 26, 316);
      ctx.lineTo(fx, 292);
      ctx.lineTo(fx - 26, 316);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      circle(ctx, fx, 262, 8);
      ctx.fill();
    }
  });
}

/** Pre-renderiza todos los sprites (evita tirones la primera vez que aparece cada uno). */
export function prepareObstacleArt() {
  for (let i = 0; i < TRAJ_COLORS.length; i++) trajineraSprite(i);
  redSprite();
  garzaSprite(0);
  garzaSprite(1);
  lirioSprite(1);
  lirioSprite(2);
  troncoSprite();
  cercaSprite();
  for (let f = 0; f < 8; f++) remolinoSprite(f);
  carpaSprite();
  florSprite(false);
  florSprite(true);
  ajolotitoSprite();
  dashSprite();
  metaSprite();
}

// ================================================================ dibujo

function billboard(ctx, img, V, x, d, wM, aM, bM, lift = 0) {
  const s = sc(V, d);
  const px = sx(V, x, d);
  const py = sy(V, d) - lift * s;
  ctx.drawImage(img, px - (wM * s) / 2, py - aM * s, wM * s, (aM + bM) * s);
}

function waterShadow(ctx, V, x, d, wM, a) {
  const s = sc(V, d);
  const px = sx(V, x, d);
  const py = sy(V, d);
  ctx.fillStyle = `rgba(0,25,45,${a})`;
  ctx.beginPath();
  ctx.ellipse(px, py, (wM * s) / 2, Math.max(1.5, wM * s * 0.07), 0, 0, TAU);
  ctx.fill();
}

function foamRing(ctx, V, x, d, wM, t, ph) {
  const s = sc(V, d);
  const px = sx(V, x, d);
  const py = sy(V, d);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(1, s * 0.05);
  const k = 0.5 + 0.5 * Math.sin(t * 2.4 + ph);
  ctx.beginPath();
  ctx.ellipse(px, py, (wM * s) / 2 * (0.9 + k * 0.1), Math.max(1.5, wM * s * 0.065) * (0.9 + k * 0.2), 0, 0, TAU);
  ctx.stroke();
}

/**
 * Dibuja una entidad. env = { camZ, t, fogObs(d) -> 0..1, dist }
 * d (profundidad desde la cámara) = e.z - camZ.
 */
export function drawEntity(ctx, e, V, env) {
  const d = e.z - env.camZ;
  if (d < 1.4 || d > WORLD.far * 1.5) return;
  let a = env.fogObs(d);
  const small = e.k === 'flor' || e.k === 'ajolotito' || e.k === 'dash';
  if (e.k === 'meta') a = (1 - 0.3 * smooth(70, 140, d)) * (d < 4.4 ? smooth(1.6, 4.4, d) : 1); // la meta se ve desde lejos aun con niebla
  else if (small) a *= smooth(2.6, 5.4, d);
  else if (d < 4.4) a *= smooth(1.6, 4.4, d);
  if (a <= 0.01) return;
  ctx.globalAlpha = a;
  const t = env.t;
  const bob = Math.sin(t * 2.1 + e.phase) * 0.035;
  switch (e.k) {
    case 'trajinera': {
      waterShadow(ctx, V, e.x, d, 2.8, 0.22);
      billboard(ctx, trajineraSprite(e.id % TRAJ_COLORS.length), V, e.x, d, 2.3, 2.6, 0.35, bob);
      foamRing(ctx, V, e.x, d, 2.7, t, e.phase);
      break;
    }
    case 'red':
      billboard(ctx, redSprite(), V, e.x, d, 2.3, 1.9, 0.6, bob * 0.5);
      foamRing(ctx, V, e.x, d, 2.2, t, e.phase);
      break;
    case 'garza': {
      const g = garzaState(e, env.dist);
      // sombra de aviso sobre el agua
      if (g.shadow > 0.02) {
        const s = sc(V, d);
        const px = sx(V, e.x, d);
        const py = sy(V, d);
        const rad = (0.9 + g.near * 0.9) * s;
        ctx.fillStyle = `rgba(10,20,40,${0.18 + 0.4 * g.shadow})`;
        ctx.beginPath();
        ctx.ellipse(px, py, rad, rad * 0.22, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,70,70,${0.25 + 0.5 * g.shadow * (0.6 + 0.4 * Math.sin(t * 12))})`;
        ctx.lineWidth = Math.max(1.5, s * 0.06);
        ctx.beginPath();
        ctx.ellipse(px, py, rad * 1.18, rad * 0.26, 0, 0, TAU);
        ctx.stroke();
      }
      const frame = Math.floor(t * 7 + e.phase) % 2;
      ctx.globalAlpha = a;
      billboard(ctx, garzaSprite(frame), V, e.x, d, 2.4, 1.8, 0, g.h - 0.0);
      break;
    }
    case 'lirio': {
      const span = e.span;
      const img = lirioSprite(span);
      const wM = span * WORLD.laneW - 0.1;
      billboard(ctx, img, V, e.x, d, wM, 0.7, 0, bob * 0.6 - 0.05);
      break;
    }
    case 'tronco':
      billboard(ctx, troncoSprite(), V, 0, d, 10.2, 1.3, 1.0, bob * 0.4);
      break;
    case 'cerca':
      billboard(ctx, cercaSprite(), V, 0, d, 10.2, 1.2, 1.0, 0);
      break;
    case 'remolino': {
      const img = remolinoSprite(Math.floor(t * 12) % 8);
      const d1 = d - e.len / 2;
      const d2 = d + e.len / 2;
      const yN = sy(V, Math.max(d1, 1.0));
      const yF = sy(V, d2);
      const wpx = DIMS.remolino.w * sc(V, d);
      ctx.drawImage(img, sx(V, 0, d) - wpx / 2, yF, wpx, Math.max(2, yN - yF));
      break;
    }
    case 'carpa': {
      const c = carpState(e, env.dist);
      if (c.warn > 0.05) {
        // burbujas en la orilla de donde saltará
        const bd = d;
        const s = sc(V, bd);
        const px = sx(V, c.x, bd);
        const py = sy(V, bd);
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * c.warn})`;
        ctx.lineWidth = Math.max(1, s * 0.05);
        for (let r = 0; r < 2; r++) {
          const k = (t * 1.6 + r * 0.5) % 1;
          ctx.beginPath();
          ctx.ellipse(px, py, s * (0.3 + k * 0.7), s * (0.07 + k * 0.14), 0, 0, TAU);
          ctx.stroke();
        }
      } else if (c.vis) {
        const s = sc(V, d);
        const px = sx(V, c.x, d);
        const py = sy(V, d);
        waterShadow(ctx, V, c.x, d, 1.3, 0.2);
        ctx.save();
        ctx.translate(px, py - c.h * s);
        ctx.rotate(c.tilt * (e.from || 1) * -1 * 0.5);
        if (e.from > 0) ctx.scale(-1, 1);
        ctx.globalAlpha = a;
        ctx.drawImage(carpaSprite(), -0.75 * s, -0.5 * s, 1.5 * s, 0.94 * s);
        ctx.restore();
      }
      break;
    }
    case 'flor': {
      const under = e.h < 0;
      const img = florSprite(under);
      const s = sc(V, d);
      const px = sx(V, e.x, d);
      const hh = e.h + Math.sin(t * 4 + e.phase) * 0.06;
      const py = sy(V, d) - hh * s;
      const sz = 0.78 * s * (1 + 0.06 * Math.sin(t * 5 + e.phase));
      if (under) ctx.globalAlpha = a * 0.85;
      ctx.drawImage(img, px - sz / 2, py - sz / 2, sz, sz);
      break;
    }
    case 'ajolotito': {
      const s = sc(V, d);
      const px = sx(V, e.x, d);
      const py = sy(V, d) - (0.6 + Math.sin(t * 3 + e.phase) * 0.12) * s;
      waterShadow(ctx, V, e.x, d, 1.4, 0.2);
      const sz = 1.5 * s;
      ctx.drawImage(ajolotitoSprite(), px - sz / 2, py - sz * 0.55, sz, sz);
      break;
    }
    case 'dash': {
      const s = sc(V, d);
      const px = sx(V, e.x, d);
      const py = sy(V, d) - (0.45 + Math.sin(t * 3 + e.phase) * 0.1) * s;
      const sz = 1.9 * s;
      ctx.drawImage(dashSprite(), px - sz / 2, py - sz * 0.62, sz, sz * 0.83);
      break;
    }
    case 'meta':
      billboard(ctx, metaSprite(), V, 0, d, 10.4, 3.7, 0, 0);
      break;
    default:
      break;
  }
  ctx.globalAlpha = 1;
}

const ICON_SRC = {
  trajinera: () => trajineraSprite(0),
  red: () => redSprite(),
  garza: () => garzaSprite(0),
  lirio: () => lirioSprite(1),
  tronco: () => troncoSprite(),
  cerca: () => cercaSprite(),
  remolino: () => remolinoSprite(0),
  carpa: () => carpaSprite(),
};

/** Canvas pequeño con el dibujo de un obstáculo (para la pantalla "Cómo jugar"). */
export function obstacleIcon(kind, size = 44) {
  const cv = document.createElement('canvas');
  cv.width = size * 2;
  cv.height = size * 2;
  cv.style.width = `${size}px`;
  cv.style.height = `${size}px`;
  const g = cv.getContext('2d');
  const make = ICON_SRC[kind];
  if (g && make) {
    const src = make();
    const k = Math.min((cv.width - 6) / src.width, (cv.height - 6) / src.height);
    const w = src.width * k;
    const h = src.height * k;
    g.drawImage(src, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
  }
  return cv;
}
