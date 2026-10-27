// hud.js (ANG-G) - HUD en canvas (GDD §1.13), juice (GDD §1.14) y fondo animado de los menús.
// Todo el texto repetido se pinta con fillText en el HUD (pocas líneas por frame); lo que se repite por entidad
// (números de daño, pétalos, destellos) usa sprites en caché y arreglos reutilizados.

import { sprite, emoji } from '../../../shared/engine/sprites.js';
import { CONFIG, xpNeed } from './config.js';
import { WEAPONS, masteryFrac, weaponLabel, MAX_WEAPON_LVL } from './weapons.js';
import { SUPERS } from './superweapons.js';
import { glowSprite } from './abilities.js';

const TAU = Math.PI * 2;
const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

// ===========================================================================
// FX (partículas, destellos, números de daño)
// ===========================================================================
const FX_LIFE = {
  hit: 0.2, death: 0.4, petal: 0.9, explosion: 0.5, ring: 0.45, slash: 0.16, beam: 0.08, fire: 0.4, splash: 0.45,
};
const PETAL_COLORS = ['#ff9f1c', '#ffbf5e', '#ffd166', '#ff7a1a'];

/** api.spawnFx(kind, x, y, a): kind 'hit'|'death'|'petal'|'explosion'|'ring'|'slash'|'beam'|'fire'|'splash'. */
export function spawnFx(state, kind, x, y, a) {
  const pool = state.fx;
  if (pool.count > CONFIG.pools.fx * 0.92) return;
  const f = pool.acquire();
  f.kind = kind;
  f.x = x;
  f.y = y;
  f.a = a || 0;
  f.t = 0;
  f.life = FX_LIFE[kind] || 0.3;
  f.vx = 0;
  f.vy = 0;
  f.s = 1;
  f.c = 0;
  if (kind === 'petal') {
    const ang = Math.random() * TAU;
    const sp = 50 + Math.random() * 150;
    f.vx = Math.cos(ang) * sp;
    f.vy = Math.sin(ang) * sp - 50;
    f.s = 0.7 + Math.random() * 0.7;
    f.c = (Math.random() * PETAL_COLORS.length) | 0;
    f.life = 0.7 + Math.random() * 0.6;
    f.a = Math.random() * TAU;
  } else if (kind === 'death') {
    f.s = 0.8 + Math.random() * 0.4;
  }
}

let FDT = 0;
let FPOOL = null;

function stepFx(f) {
  f.t += FDT;
  if (f.t >= f.life) {
    FPOOL.release(f);
    return;
  }
  if (f.kind === 'petal') {
    f.x += f.vx * FDT;
    f.y += f.vy * FDT;
    const k = 1 - 2.2 * FDT;
    f.vx *= k;
    f.vy = f.vy * k + 90 * FDT;
    f.a += 6 * FDT;
  }
}

export function updateFx(state, dt) {
  FDT = dt;
  FPOOL = state.fx;
  state.fx.forEach(stepFx);
  const nums = state.nums;
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    if (!n.on) continue;
    n.t += dt;
    if (n.t >= n.life) {
      n.on = false;
      continue;
    }
    n.y += n.vy * dt;
    n.vy += 120 * dt;
  }
  if (state.hurtFlash > 0) state.hurtFlash = Math.max(0, state.hurtFlash - dt);
  FPOOL = null;
}

/** Número de daño flotante. `big` = golpe fuerte (dorado y más grande). */
export function spawnDamage(state, x, y, value, big) {
  const nums = state.nums;
  const n = nums[state.numIdx];
  state.numIdx = (state.numIdx + 1) % nums.length;
  n.on = true;
  n.x = x + (Math.random() - 0.5) * 14;
  n.y = y - 14;
  n.vy = -90 - Math.random() * 30;
  n.t = 0;
  n.life = big ? 0.85 : 0.65;
  n.text = String(value);
  n.big = !!big;
}

// --- atlas de dígitos ---
const DG_W = 14;
const DG_H = 22;
const digits = { normal: [], big: [] };

function digitSprite(style, ch) {
  const idx = ch.charCodeAt(0) - 48;
  let s = digits[style][idx];
  if (s) return s;
  s = sprite('ang:dg:' + style + ':' + ch, DG_W + 4, DG_H, (g) => {
    g.font = '900 20px ' + FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 4;
    g.strokeStyle = '#1c1030';
    g.strokeText(ch, (DG_W + 4) / 2, DG_H / 2 + 1);
    g.fillStyle = style === 'big' ? '#ffd23f' : '#ffffff';
    g.fillText(ch, (DG_W + 4) / 2, DG_H / 2 + 1);
  });
  digits[style][idx] = s;
  return s;
}

const flameCols = ['255,150,50', '255,236,130'];

let VL = 0;
let VT = 0;
let VR = 0;
let VB = 0;
let XC = null;

function drawFx(f) {
  const x = f.x;
  const y = f.y;
  if (x < VL || x > VR || y < VT || y > VB) return;
  const k = f.t / f.life;
  const a = 1 - k;
  switch (f.kind) {
    case 'hit': {
      XC.globalAlpha = a;
      XC.strokeStyle = '#fff5c0';
      XC.lineWidth = 2;
      XC.beginPath();
      const r0 = 4 + 6 * k;
      const r1 = 9 + 16 * k;
      for (let i = 0; i < 6; i++) {
        const ang = f.a + (i / 6) * TAU + 0.4;
        XC.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
        XC.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
      }
      XC.stroke();
      XC.globalAlpha = 1;
      break;
    }
    case 'death': {
      const r = (10 + 26 * k) * f.s;
      XC.globalAlpha = a * 0.55;
      XC.fillStyle = '#8f7bb8';
      XC.beginPath();
      XC.arc(x, y, r, 0, TAU);
      XC.fill();
      XC.globalAlpha = a * 0.5;
      XC.fillStyle = '#e9e1ff';
      XC.beginPath();
      XC.arc(x - r * 0.25, y - r * 0.2, r * 0.55, 0, TAU);
      XC.fill();
      XC.globalAlpha = 1;
      break;
    }
    case 'petal': {
      XC.globalAlpha = a < 0.35 ? a / 0.35 : 1;
      XC.fillStyle = PETAL_COLORS[f.c];
      XC.beginPath();
      XC.ellipse(x, y, 5.2 * f.s, 2.7 * f.s, f.a, 0, TAU);
      XC.fill();
      XC.globalAlpha = 1;
      break;
    }
    case 'explosion': {
      const e = 1 - (1 - k) * (1 - k);
      const R = 34 + 88 * e;
      XC.globalCompositeOperation = 'lighter';
      XC.globalAlpha = a * 0.95;
      XC.drawImage(glowSprite('fx-expl', flameCols[0]), x - R, y - R, R * 2, R * 2);
      if (k < 0.4) {
        const w = R * 0.55;
        XC.globalAlpha = (1 - k / 0.4) * 0.9;
        XC.drawImage(glowSprite('fx-expl-core', flameCols[1]), x - w, y - w, w * 2, w * 2);
      }
      XC.globalCompositeOperation = 'source-over';
      XC.globalAlpha = 1;
      break;
    }
    case 'ring': {
      const e = 1 - (1 - k) * (1 - k);
      XC.globalAlpha = a * 0.9;
      XC.strokeStyle = '#ffe08a';
      XC.lineWidth = 2 + 7 * a;
      XC.beginPath();
      XC.arc(x, y, 18 + 110 * e, 0, TAU);
      XC.stroke();
      XC.globalAlpha = 1;
      break;
    }
    case 'slash': {
      XC.globalAlpha = a * 0.75;
      XC.strokeStyle = '#ffffff';
      XC.lineWidth = 1 + 5 * a;
      XC.lineCap = 'round';
      XC.beginPath();
      XC.arc(x, y, 46 + 22 * k, f.a - 0.8, f.a + 0.8);
      XC.stroke();
      XC.globalAlpha = 1;
      break;
    }
    case 'fire': {
      const rad = 16 + 12 * k;
      XC.globalCompositeOperation = 'lighter';
      XC.globalAlpha = a * 0.85;
      XC.drawImage(glowSprite('fx-fire', flameCols[0]), x - rad, y - rad - 22 * k, rad * 2, rad * 2);
      XC.globalCompositeOperation = 'source-over';
      XC.globalAlpha = 1;
      break;
    }
    case 'splash': {
      XC.globalAlpha = a;
      XC.fillStyle = '#9adfff';
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * TAU + f.x * 0.01;
        const r = 6 + 34 * (1 - (1 - k) * (1 - k));
        XC.beginPath();
        XC.arc(x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.7 - 10 * Math.sin(k * Math.PI), 2.6 * a + 1, 0, TAU);
        XC.fill();
      }
      XC.globalAlpha = 1;
      break;
    }
    default:
      break;
  }
}

/** Dibuja fx y números de daño en coordenadas de mundo. */
export function renderFx(ctx, state, view) {
  VL = view.l;
  VT = view.t;
  VR = view.r;
  VB = view.b;
  XC = ctx;
  if (state.fx.count) state.fx.forEach(drawFx);
  const nums = state.nums;
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    if (!n.on) continue;
    if (n.x < VL || n.x > VR || n.y < VT || n.y > VB) continue;
    const pop = n.t < 0.12 ? 1 + 0.55 * (1 - n.t / 0.12) : 1;
    const sc = pop * (n.big ? 1.25 : 1);
    const fade = n.t > n.life - 0.25 ? (n.life - n.t) / 0.25 : 1;
    ctx.globalAlpha = fade < 0 ? 0 : fade;
    const txt = n.text;
    const gw = (DG_W - 1) * sc;
    const gh = DG_H * sc;
    let px = n.x - (txt.length * gw) / 2;
    const py = n.y - gh / 2;
    const style = n.big ? 'big' : 'normal';
    for (let c = 0; c < txt.length; c++) {
      ctx.drawImage(digitSprite(style, txt[c]), px, py, (DG_W + 4) * sc, gh);
      px += gw;
    }
  }
  ctx.globalAlpha = 1;
  XC = null;
}

/** Marca de apuntado cuando el ratón manda: retícula pequeña en el punto apuntado (mundo). */
export function renderReticle(ctx, wx, wy) {
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = '#fff5c0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(wx, wy, 9, 0, TAU);
  ctx.moveTo(wx - 15, wy);
  ctx.lineTo(wx - 5, wy);
  ctx.moveTo(wx + 5, wy);
  ctx.lineTo(wx + 15, wy);
  ctx.moveTo(wx, wy - 15);
  ctx.lineTo(wx, wy - 5);
  ctx.moveTo(wx, wy + 5);
  ctx.lineTo(wx, wy + 15);
  ctx.stroke();
  ctx.restore();
}

// ===========================================================================
// HUD
// ===========================================================================
const toasts = [];
const peak = { bell: 0, dash: 0 };
let vigRed = null;
let vigDark = null;
let vigW = 0;
let vigH = 0;

export function resetHud() {
  toasts.length = 0;
  peak.bell = 0;
  peak.dash = 0;
}

export function toast(text) {
  const now = performance.now() / 1000;
  for (let i = 0; i < toasts.length; i++) {
    if (toasts[i].text === text) {
      toasts[i].t0 = now;
      return;
    }
  }
  toasts.push({ text, t0: now });
  if (toasts.length > 3) toasts.shift();
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function label(g, text, x, y, size, color, align, weight) {
  g.font = (weight || 800) + ' ' + size + 'px ' + FONT;
  g.textAlign = align || 'left';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(3, size * 0.22);
  g.strokeStyle = 'rgba(14,6,26,0.9)';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
}

function ensureVignettes(W, H) {
  if (vigRed && vigW === W && vigH === H) return;
  vigW = W;
  vigH = H;
  const make = (r, g, b, inner, outer) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * inner, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',' + outer + ')');
    x.fillStyle = gr;
    x.fillRect(0, 0, W, H);
    return c;
  };
  vigRed = make(255, 20, 40, 0.28, 0.95);
  vigDark = make(8, 2, 20, 0.34, 0.8);
}

function panel(g, x, y, w, h, r) {
  rr(g, x, y, w, h, r);
  g.fillStyle = 'rgba(18,10,34,0.74)';
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.stroke();
}

function bar(g, x, y, w, h, frac, c1, c2) {
  rr(g, x, y, w, h, h / 2);
  g.fillStyle = 'rgba(8,3,18,0.85)';
  g.fill();
  const f = frac < 0 ? 0 : frac > 1 ? 1 : frac;
  if (f > 0.001) {
    const gr = g.createLinearGradient(x, y, x, y + h);
    gr.addColorStop(0, c1);
    gr.addColorStop(1, c2);
    rr(g, x, y, Math.max(h, w * f), h, h / 2);
    g.fillStyle = gr;
    g.fill();
  }
}

function drawIcon(g, ch, cx, cy, size) {
  g.drawImage(emoji(ch, Math.round(size)), cx - size / 2, cy - size / 2, size, size);
}

function drawCooldown(g, u, cx, cy, icon, key, cd, pk) {
  const r = 27 * u;
  const ready = cd <= 0.0001;
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.fillStyle = 'rgba(18,10,34,0.8)';
  g.fill();
  g.globalAlpha = ready ? 1 : 0.55;
  drawIcon(g, icon, cx, cy - 1 * u, 28 * u);
  g.globalAlpha = 1;
  if (!ready && pk > 0) {
    const frac = Math.min(1, cd / pk);
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r - 1, -Math.PI / 2, -Math.PI / 2 + TAU * frac, false);
    g.closePath();
    g.fillStyle = 'rgba(6,2,16,0.62)';
    g.fill();
    label(g, cd >= 10 ? Math.ceil(cd) + '' : cd.toFixed(1), cx, cy, 14 * u, '#ffffff', 'center', 900);
  }
  g.lineWidth = ready ? 3 * u : 2 * u;
  g.strokeStyle = ready ? '#ffbf5e' : 'rgba(255,255,255,0.22)';
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.stroke();
  // tecla (en celular no se dibuja)
  if (!key) return;
  const kw = 20 * u;
  rr(g, cx - kw / 2, cy + r - 8 * u, kw, 17 * u, 5 * u);
  g.fillStyle = ready ? '#ffbf5e' : '#4b3a6b';
  g.fill();
  label(g, key, cx, cy + r + 0.5 * u, 12 * u, ready ? '#2a1200' : '#e6dcff', 'center', 900);
}

function drawBackpack(g, W, H, u, p, state, touch) {
  const s = 66 * u;
  const gap = 10 * u;
  const total = s * 3 + gap * 2;
  // En celular la mochila va abajo a la izquierda para no chocar con los botones táctiles
  const x0 = touch ? 12 * u : (W - total) / 2;
  const y0 = H - s - (touch ? 14 : 20) * u;
  const sup = p.super && SUPERS[p.super.type] ? SUPERS[p.super.type] : null;

  for (let i = 0; i < 3; i++) {
    const w = p.weapons ? p.weapons[i] : null;
    const x = x0 + i * (s + gap);
    const active = !sup && p.active === i && !!w;
    g.globalAlpha = w ? 1 : 0.38;
    rr(g, x, y0, s, s, 12 * u);
    g.fillStyle = active ? 'rgba(66,40,12,0.88)' : 'rgba(18,10,34,0.8)';
    g.fill();
    g.lineWidth = active ? 3.5 * u : 2 * u;
    g.strokeStyle = active ? '#ffbf5e' : 'rgba(255,255,255,0.2)';
    g.stroke();
    if (active) {
      g.save();
      g.shadowColor = 'rgba(255,191,94,0.7)';
      g.shadowBlur = 14 * u;
      g.stroke();
      g.restore();
    }
    // tecla del espacio
    label(g, String(i + 1), x + 10 * u, y0 + 11 * u, 13 * u, active ? '#ffe9b0' : '#cfc3ea', 'center', 900);
    if (w && WEAPONS[w.id]) {
      drawIcon(g, WEAPONS[w.id].icon, x + s / 2, y0 + s / 2 - 5 * u, 34 * u);
      const maxed = w.lvl >= MAX_WEAPON_LVL;
      label(g, maxed ? '★ ' + w.lvl : 'Nv ' + w.lvl, x + s - 6 * u, y0 + 12 * u, 11 * u, maxed ? '#9ff3e8' : '#ffffff', 'right', 800);
      bar(g, x + 7 * u, y0 + s - 13 * u, s - 14 * u, 6 * u, masteryFrac(w), maxed ? '#8ff3e8' : '#ffd166', maxed ? '#2ec4b6' : '#ff9f1c');
    } else {
      label(g, '—', x + s / 2, y0 + s / 2, 22 * u, 'rgba(255,255,255,0.4)', 'center', 700);
    }
    g.globalAlpha = 1;
  }

  const cx = touch ? x0 + total / 2 : W / 2;
  if (sup) {
    // Anillo con el tiempo restante de la superarma
    const total = sup.duration || 15;
    const left = Math.max(0, p.super.until - state.time);
    const frac = Math.min(1, left / total);
    const ry = y0 - 40 * u;
    const rad = 24 * u;
    g.beginPath();
    g.arc(cx - 60 * u, ry, rad, 0, TAU);
    g.fillStyle = 'rgba(18,10,34,0.85)';
    g.fill();
    g.lineWidth = 6 * u;
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.stroke();
    g.beginPath();
    g.arc(cx - 60 * u, ry, rad, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
    g.strokeStyle = left < 4 && Math.floor(performance.now() / 160) % 2 === 0 ? '#ff5470' : sup.color;
    g.lineCap = 'round';
    g.stroke();
    g.lineCap = 'butt';
    drawIcon(g, sup.icon, cx - 60 * u, ry, 24 * u);
    label(g, sup.nombre, cx - 26 * u, ry - 9 * u, 15 * u, '#ffffff', 'left', 900);
    let extra = left.toFixed(1) + ' s';
    if (p.super.ammo > 0) extra += '  ·  ' + p.super.ammo + ' cargas';
    label(g, extra, cx - 26 * u, ry + 10 * u, 13 * u, sup.color, 'left', 800);
  } else {
    const w = p.weapons ? p.weapons[p.active] : null;
    if (w && WEAPONS[w.id]) {
      label(g, weaponLabel(w) + ' · Nv ' + w.lvl, cx, y0 - 14 * u, 15 * u, '#ffe9b0', 'center', 800);
    }
  }
}

function drawTop(g, W, H, u, p, state, yOff, touch) {
  // --- vida, nivel y XP (arriba a la izquierda; en debug baja para no tapar el panel de FPS)
  const px = 14 * u;
  const py = 14 * u + yOff;
  const pw = 262 * u;
  const ph = 62 * u;
  panel(g, px, py, pw, ph, 14 * u);
  const bx = px + 14 * u;
  const by = py + ph / 2;
  g.beginPath();
  g.arc(bx + 20 * u, by, 22 * u, 0, TAU);
  const lg = g.createLinearGradient(0, by - 22 * u, 0, by + 22 * u);
  lg.addColorStop(0, '#ffbf5e');
  lg.addColorStop(1, '#e0218a');
  g.fillStyle = lg;
  g.fill();
  g.lineWidth = 2.5 * u;
  g.strokeStyle = '#1c1030';
  g.stroke();
  label(g, 'NV', bx + 20 * u, by - 9 * u, 9 * u, '#ffffff', 'center', 900);
  label(g, String(p.lvl), bx + 20 * u, by + 5 * u, 19 * u, '#ffffff', 'center', 900);

  const barX = bx + 52 * u;
  const barW = pw - 52 * u - 28 * u;
  const hpF = p.hpMax > 0 ? p.hp / p.hpMax : 0;
  bar(g, barX, py + 12 * u, barW, 18 * u, hpF, hpF < CONFIG.juice.vignetteHp ? '#ff7a8a' : '#ff5470', '#b3122e');
  label(g, '❤ ' + Math.max(0, Math.ceil(p.hp)) + ' / ' + Math.ceil(p.hpMax), barX + barW / 2, py + 21.5 * u, 12 * u, '#ffffff', 'center', 800);
  const need = xpNeed(p.lvl);
  bar(g, barX, py + 37 * u, barW, 11 * u, p.xp / need, '#ffe08a', '#ff9f1c');
  label(g, 'XP ' + Math.floor(p.xp) + ' / ' + need, barX + barW / 2, py + 42.5 * u, 9 * u, '#ffffff', 'center', 900);

  // --- oleada, tiempo y bajas (arriba al centro)
  // En celular el centro se desplaza entre el panel de vida y el botón de pausa
  const cx = touch ? Math.max(W / 2, (px + pw + W - 64) / 2) : W / 2;
  const waveNo = Math.max(1, state.wave);
  const bossWave = state.phase === 'boss';
  label(g, 'OLEADA ' + waveNo, cx, 24 * u, 22 * u, bossWave ? '#ff8cc8' : '#ffbf5e', 'center', 900);
  const tText = fmtTime(state.time);
  const kText = String(state.stats.kills | 0);
  g.font = '800 ' + 15 * u + 'px ' + FONT;
  const tw = g.measureText(tText).width;
  const kw = g.measureText(kText).width;
  const ic = 16 * u;
  const gap = 5 * u;
  const sep = 22 * u;
  let sx = cx - (ic + gap + tw + sep + ic + gap + kw) / 2;
  drawIcon(g, '🕒', sx + ic / 2, 48 * u, ic);
  sx += ic + gap;
  label(g, tText, sx, 48 * u, 15 * u, '#f7f3ff', 'left', 800);
  sx += tw + sep;
  drawIcon(g, '💀', sx + ic / 2, 48 * u, ic);
  sx += ic + gap;
  label(g, kText, sx, 48 * u, 15 * u, '#f7f3ff', 'left', 800);
  // progreso de oleada
  const pbw = 170 * u;
  let frac;
  let c1 = '#2ec4b6';
  let c2 = '#1b8b80';
  if (state.phase === 'respite') {
    frac = 1 - Math.max(0, state.restT) / CONFIG.waves.rest;
    c1 = '#ffe08a';
    c2 = '#ff9f1c';
  } else if (bossWave) {
    frac = state.boss ? 1 : 0;
    c1 = '#ff8cc8';
    c2 = '#e0218a';
  } else {
    frac = state.waveT / CONFIG.waves.duration;
  }
  if (!state.stress) bar(g, cx - pbw / 2, 62 * u, pbw, 6 * u, frac, c1, c2);

  // --- barra de la jefa
  const boss = state.boss;
  if (boss && !boss.dead) {
    const bw = Math.min(560 * u, W * 0.58);
    const bh = 20 * u;
    const bx0 = W / 2 - bw / 2;
    const by0 = 86 * u;
    panel(g, bx0 - 10 * u, by0 - 26 * u, bw + 20 * u, bh + 38 * u, 12 * u);
    label(g, 'La Llorona  ·  aparición ' + boss.lvl, W / 2, by0 - 11 * u, 15 * u, '#dff0ff', 'center', 900);
    drawIcon(g, '👻', bx0 + 6 * u, by0 - 11 * u, 20 * u);
    bar(g, bx0, by0, bw, bh, boss.hp / boss.hpMax, '#c9a7ff', '#6a3fd0');
    label(g, Math.ceil(boss.hp) + ' / ' + Math.ceil(boss.hpMax), W / 2, by0 + bh / 2 + 0.5 * u, 12 * u, '#ffffff', 'center', 800);
  }
}

function drawBanner(g, W, H, u, state) {
  const b = state.banner;
  if (!b) return;
  const inA = Math.min(1, b.t / 0.25);
  const outA = Math.min(1, (b.dur - b.t) / 0.5);
  const a = Math.max(0, Math.min(inA, outA));
  if (a <= 0) return;
  const pop = 1 + 0.35 * Math.max(0, 1 - b.t / 0.3);
  g.save();
  g.globalAlpha = a;
  g.translate(W / 2, H * 0.4);
  g.scale(pop, pop);
  label(g, 'OLEADA ' + b.wave, 0, 0, 62 * u, b.boss ? '#ff8cc8' : '#ffbf5e', 'center', 900);
  const sub = b.boss ? '¡Llega La Llorona!' : b.wave === 1 ? 'Sobrevive a la noche' : 'Aguanta 30 segundos';
  label(g, sub, 0, 46 * u, 22 * u, '#f7f3ff', 'center', 800);
  g.restore();
}

function drawToasts(g, W, H, u) {
  const now = performance.now() / 1000;
  for (let i = toasts.length - 1; i >= 0; i--) {
    if (now - toasts[i].t0 > 2.6) toasts.splice(i, 1);
  }
  for (let i = 0; i < toasts.length; i++) {
    const t = toasts[i];
    const age = now - t.t0;
    const a = Math.min(1, age / 0.15) * Math.min(1, (2.6 - age) / 0.4);
    const y = H * 0.2 + i * 40 * u + (1 - Math.min(1, age / 0.2)) * -10 * u;
    g.font = '800 ' + 17 * u + 'px ' + FONT;
    const tw = g.measureText(t.text).width + 36 * u;
    g.globalAlpha = Math.max(0, a);
    rr(g, W / 2 - tw / 2, y - 16 * u, tw, 32 * u, 16 * u);
    g.fillStyle = 'rgba(36,19,65,0.92)';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#ff9f1c';
    g.stroke();
    label(g, t.text, W / 2, y + 0.5 * u, 17 * u, '#ffffff', 'center', 800);
    g.globalAlpha = 1;
  }
}

/**
 * Pinta el HUD en espacio de pantalla. `env` = { muted, debug, god }.
 * `p` es el jugador local.
 */
export function renderHud(g, state, p, W, H, env) {
  const u = Math.max(0.6, Math.min(1.5, Math.min(H / 720, W / 960)));
  ensureVignettes(W, H);

  // Viñeta ambiental, viñeta roja con poca vida y destello de daño
  g.globalAlpha = 0.55;
  g.drawImage(vigDark, 0, 0);
  const lowFrac = p.hpMax > 0 ? p.hp / p.hpMax : 1;
  if (!p.down && lowFrac < CONFIG.juice.vignetteHp) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 6);
    g.globalAlpha = (0.35 + 0.35 * pulse) * (1 - lowFrac / CONFIG.juice.vignetteHp);
    g.drawImage(vigRed, 0, 0);
  }
  if (state.hurtFlash > 0) {
    g.globalAlpha = Math.min(1, state.hurtFlash / 0.3) * 0.35;
    g.drawImage(vigRed, 0, 0);
  }
  g.globalAlpha = 1;

  // Cooldown: calibra el máximo con el mayor valor visto desde que estaba listo
  const cdb = p.cooldowns ? p.cooldowns.bell : 0;
  const cdd = p.cooldowns ? p.cooldowns.dash : 0;
  if (cdb <= 0.0001) peak.bell = 0;
  else if (cdb > peak.bell) peak.bell = cdb;
  if (cdd <= 0.0001) peak.dash = 0;
  else if (cdd > peak.dash) peak.dash = cdd;

  const touch = !!(env && env.touch);
  drawTop(g, W, H, u, p, state, env && env.debug ? 168 * u : 0, touch);
  drawBackpack(g, W, H, u, p, state, touch);
  if (touch) {
    // cooldowns encima de la mochila (los botones táctiles ya están a la derecha)
    const cy = H - 66 * u - 14 * u - 46 * u;
    drawCooldown(g, u, 12 * u + 27 * u, cy, '🔔', '', cdb, peak.bell);
    drawCooldown(g, u, 12 * u + 27 * u + 66 * u, cy, '💨', '', cdd, peak.dash);
  } else {
    drawCooldown(g, u, 50 * u, H - 54 * u, '🔔', 'U', cdb, peak.bell);
    drawCooldown(g, u, 50 * u + 70 * u, H - 54 * u, '💨', 'I', cdd, peak.dash);
  }
  drawBanner(g, W, H, u, state);
  drawToasts(g, W, H, u);

  // Guía de teclas al comenzar
  if (!touch && state.time < 16 && !state.stress && !p.super) {
    const a = Math.min(1, (16 - state.time) / 2);
    g.globalAlpha = a;
    const s = 66 * u;
    label(g, 'Y atacar  ·  U Campanazo  ·  I Esquiva  ·  1 2 3 armas  ·  P pausa', W / 2, H - s - 52 * u, 15 * u, '#ffe9b0', 'center', 800);
    g.globalAlpha = 1;
  }

  if (env && env.muted) drawIcon(g, '🔇', W - (touch ? 80 : 168) * u, 30 * u, 22 * u);
  if (env && env.debug && state.god) label(g, 'MODO DIOS', 18 * u, 100 * u + 168 * u, 14 * u, '#ff8cc8', 'left', 900);
}

// ===========================================================================
// Fondo animado de menús
// ===========================================================================
let backdrop = null;
let bdW = 0;
let bdH = 0;
const PAPEL = ['#e0218a', '#ff9f1c', '#2ec4b6', '#ffd166', '#c026d3', '#4cc9f0'];

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildBackdrop(W, H) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rnd = lcg(20261026);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b0520');
  sky.addColorStop(0.55, '#2a1050');
  sky.addColorStop(1, '#6a1b62');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // estrellas
  for (let i = 0; i < 150; i++) {
    g.globalAlpha = 0.25 + rnd() * 0.65;
    g.fillStyle = '#fff6df';
    g.beginPath();
    g.arc(rnd() * W, rnd() * H * 0.62, 0.5 + rnd() * 1.3, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  // luna
  const mx = W * 0.8;
  const my = H * 0.24;
  const mr = Math.min(W, H) * 0.075;
  const mg = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 4);
  mg.addColorStop(0, 'rgba(255,236,190,0.55)');
  mg.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = mg;
  g.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  g.fillStyle = '#fff1cf';
  g.beginPath();
  g.arc(mx, my, mr, 0, TAU);
  g.fill();
  // horizonte de edificios
  const base = H * 0.86;
  let x = -20;
  while (x < W + 20) {
    const bw = 34 + rnd() * 70;
    const bh = 40 + rnd() * H * 0.2;
    g.fillStyle = rnd() < 0.5 ? '#150a28' : '#1d0e36';
    g.fillRect(x, base - bh, bw, H - base + bh);
    for (let wy = base - bh + 8; wy < base - 6; wy += 13) {
      for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
        if (rnd() < 0.28) {
          g.fillStyle = rnd() < 0.7 ? 'rgba(255,191,94,0.75)' : 'rgba(255,140,200,0.65)';
          g.fillRect(wx, wy, 5, 7);
        }
      }
    }
    x += bw + 2;
  }
  // Columna del Ángel (silueta dorada)
  const cx = W * 0.5;
  const ch = H * 0.5;
  g.fillStyle = '#120824';
  g.fillRect(cx - 52, base - 30, 104, H);
  g.fillRect(cx - 38, base - 54, 76, 28);
  g.fillStyle = '#2a1646';
  g.fillRect(cx - 14, base - ch, 28, ch - 30);
  g.fillStyle = '#3b2166';
  g.fillRect(cx - 22, base - ch - 12, 44, 14);
  g.fillStyle = '#e9b84a';
  g.beginPath();
  g.arc(cx, base - ch - 40, 11, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(cx - 8, base - ch - 30);
  g.lineTo(cx + 8, base - ch - 30);
  g.lineTo(cx + 5, base - ch - 12);
  g.lineTo(cx - 5, base - ch - 12);
  g.closePath();
  g.fill();
  for (let s = -1; s <= 1; s += 2) {
    g.beginPath();
    g.moveTo(cx + s * 4, base - ch - 34);
    g.quadraticCurveTo(cx + s * 40, base - ch - 76, cx + s * 54, base - ch - 40);
    g.quadraticCurveTo(cx + s * 30, base - ch - 44, cx + s * 4, base - ch - 24);
    g.closePath();
    g.fill();
  }
  const aura = g.createRadialGradient(cx, base - ch - 40, 4, cx, base - ch - 40, 150);
  aura.addColorStop(0, 'rgba(255,205,90,0.35)');
  aura.addColorStop(1, 'rgba(255,205,90,0)');
  g.fillStyle = aura;
  g.fillRect(cx - 160, base - ch - 200, 320, 320);
  return c;
}

const petals = [];
for (let i = 0; i < 70; i++) {
  const r = lcg(777 + i * 31);
  petals.push({ x0: r(), y0: r(), vy: 22 + r() * 40, ph: r() * TAU, sw: 14 + r() * 40, s: 0.7 + r() * 0.9, c: (r() * PETAL_COLORS.length) | 0 });
}

/** Cielo nocturno de la CDMX con la Columna del Ángel, papel picado y pétalos de cempasúchil. */
export function renderBackdrop(g, W, H, t) {
  if (!backdrop || bdW !== W || bdH !== H) {
    backdrop = buildBackdrop(W, H);
    bdW = W;
    bdH = H;
  }
  g.drawImage(backdrop, 0, 0);
  const u = Math.max(0.75, Math.min(1.5, H / 720));
  // papel picado
  for (let row = 0; row < 2; row++) {
    const y0 = (8 + row * 26) * u;
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, y0);
    g.quadraticCurveTo(W / 2, y0 + 22 * u, W, y0);
    g.stroke();
    const n = Math.ceil(W / (46 * u));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const fx = f * W;
      const fy = y0 + 22 * u * 4 * f * (1 - f);
      const sway = Math.sin(t * 1.6 + i * 0.9 + row) * 0.12;
      g.save();
      g.translate(fx, fy);
      g.rotate(sway);
      g.fillStyle = PAPEL[(i + row * 3) % PAPEL.length];
      g.globalAlpha = 0.9;
      const fw = 30 * u;
      const fh = 24 * u;
      g.beginPath();
      g.moveTo(-fw / 2, 0);
      g.lineTo(fw / 2, 0);
      g.lineTo(fw / 2, fh);
      for (let k = 4; k >= 0; k--) {
        g.lineTo(-fw / 2 + (k * fw) / 4, fh - (k % 2 ? 5 * u : 0));
      }
      g.closePath();
      g.fill();
      g.globalAlpha = 0.55;
      g.fillStyle = '#1a0f2e';
      g.beginPath();
      g.arc(0, fh * 0.42, 3.4 * u, 0, TAU);
      g.fill();
      g.restore();
    }
  }
  // pétalos
  g.globalAlpha = 0.9;
  for (let i = 0; i < petals.length; i++) {
    const p = petals[i];
    const y = (p.y0 * (H + 60) + t * p.vy) % (H + 60) - 30;
    const x = p.x0 * W + Math.sin(t * 0.6 + p.ph) * p.sw;
    g.fillStyle = PETAL_COLORS[p.c];
    g.beginPath();
    g.ellipse(x, y, 6 * p.s, 3 * p.s, t * 1.4 + p.ph, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}
