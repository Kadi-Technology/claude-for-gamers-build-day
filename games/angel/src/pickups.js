// Ángel Survivors · ANG-C · Gemas de XP: soltar, imán, recogida y render.
//
// Las gemas viven en state.drops con { id, kind:'gem', type: nivel de color 0..4, x, y, value }.
// `type` codifica el color para que los invitados (que solo reciben [id,kind,type,x,y]) las pinten igual.
// Las superarmas (kind:'super') las maneja superweapons.js; aquí se ignoran.

import { sprite } from '../../../shared/engine/sprites.js';
import { viewRect, magnetRadius, hash01 } from './abilities.js';
import * as CFG from './config.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Balance (ANG-G puede sobrescribirlo desde config.js con Object.assign al arrancar)
// ---------------------------------------------------------------------------------------------
export const PICKUP_BALANCE = {
  maxGems: 420,          // por encima de esto, las gemas nuevas se funden en la última (el XP no se pierde)
  collectPad: 6,         // px extra sobre p.r + gema para recoger
  autoMagnetAge: 45,     // s: una gema vieja vuela sola hacia el jugador (acota la cantidad en pantalla)
  homingMin: 340,        // px/s al entrar al imán
  homingMax: 940,        // px/s al estar encima
  oldHoming: 560,        // px/s de las gemas con auto-imán
  popFriction: 5.2,      // frenado del chispazo inicial
  sfxGap: 0.05,          // s mínimos entre sonidos de gema
};

// CONFIG.balance.pickups (config.js) manda sobre estos valores si existe.
try {
  const conf = (CFG && (CFG.CONFIG || CFG.default)) || null;
  const cp = conf && conf.balance && conf.balance.pickups;
  if (cp) {
    for (const k of Object.keys(cp)) {
      if (typeof cp[k] === 'number' && isFinite(cp[k]) && typeof PICKUP_BALANCE[k] === 'number') PICKUP_BALANCE[k] = cp[k];
    }
  }
} catch (e) { /* config opcional */ }

/** Niveles de color por valor: 0 azul · 1 verde · 2 dorado · 3 naranja · 4 violeta. */
export const GEM_TIERS = [
  { upTo: 3,        color: '#4fd8ff', light: '#e2f9ff', size: 18 },
  { upTo: 8,        color: '#5dff8a', light: '#e6ffec', size: 20 },
  { upTo: 20,       color: '#ffd23f', light: '#fff7d1', size: 23 },
  { upTo: 50,       color: '#ff8a3d', light: '#ffe5cf', size: 26 },
  { upTo: Infinity, color: '#d77bff', light: '#f6e2ff', size: 30 },
];

export function gemTier(value) {
  for (let i = 0; i < GEM_TIERS.length - 1; i++) {
    if (value < GEM_TIERS[i].upTo) return i;
  }
  return GEM_TIERS.length - 1;
}

// ---------------------------------------------------------------------------------------------
// Estado propio por partida
// ---------------------------------------------------------------------------------------------
const stores = new WeakMap();

function store(state) {
  let s = stores.get(state);
  if (!s) {
    s = { nextId: 1, pl: [], rel: [], sfxCd: 0, lastGem: null, lastGemId: 0, t: 0 };
    stores.set(state, s);
  }
  return s;
}

function gemRadius(tier) {
  return 5 + tier * 1.2;
}

/**
 * Suelta una gema de XP en (x,y). Si el pool está saturado el valor se funde en la última gema
 * viva, así el XP nunca se pierde. Devuelve la gema o null.
 */
export function dropGem(state, x, y, value) {
  if (!state || !state.drops || !(value > 0)) return null;
  const st = store(state);
  const pool = state.drops;
  let d = null;
  if (pool.count < PICKUP_BALANCE.maxGems) d = pool.acquire();
  if (!d) {
    const g = st.lastGem;
    if (g && g.kind === 'gem' && g.id === st.lastGemId) {
      g.value += value;
      g.type = gemTier(g.value);
      g.r = gemRadius(g.type);
      return g;
    }
    d = pool.acquire();
    if (!d) return null;
  }
  const id = st.nextId++;
  const tier = gemTier(value);
  const h = hash01(id);
  const a = h * TAU;
  const sp = 70 + 110 * hash01(id + 7919);
  d.id = id;
  d.kind = 'gem';
  d.type = tier;
  d.x = x;
  d.y = y;
  d.value = value;
  d.r = gemRadius(tier);
  d.vx = Math.cos(a) * sp;
  d.vy = Math.sin(a) * sp;
  d.mag = 0;
  d.born = typeof state.time === 'number' ? state.time : 0;
  d.ph = h * TAU;
  d.until = 0;
  st.lastGem = d;
  st.lastGemId = id;
  return d;
}

// ---------------------------------------------------------------------------------------------
// Actualización (paso 8 del tick)
// ---------------------------------------------------------------------------------------------
let cDt = 0;
let cApi = null;
let cSt = null;

function gemStep(d) {
  if (d.kind !== 'gem') return;
  const st = cSt;
  const dt = cDt;
  const pl = st.pl;

  // jugador vivo más cercano
  let best = null;
  let bd = 1e18;
  for (let i = 0; i < pl.length; i++) {
    const p = pl[i];
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    const dd = dx * dx + dy * dy;
    if (dd < bd) { bd = dd; best = p; }
  }

  // chispazo inicial con fricción
  if (!d.mag && (d.vx !== 0 || d.vy !== 0)) {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    const f = 1 - PICKUP_BALANCE.popFriction * dt;
    d.vx *= f > 0 ? f : 0;
    d.vy *= f > 0 ? f : 0;
    if (d.vx * d.vx + d.vy * d.vy < 9) { d.vx = 0; d.vy = 0; }
  }
  if (!best) return;

  const dist = Math.sqrt(bd);
  const magR = magnetRadius(best);
  const old = st.t - d.born > PICKUP_BALANCE.autoMagnetAge;
  if (!d.mag && (dist < magR || old)) {
    d.mag = 1;
    d.vx = 0;
    d.vy = 0;
  }
  if (d.mag) {
    let sp;
    if (dist < magR) {
      const k = 1 - dist / magR;
      sp = PICKUP_BALANCE.homingMin + (PICKUP_BALANCE.homingMax - PICKUP_BALANCE.homingMin) * k;
    } else {
      sp = PICKUP_BALANCE.oldHoming;
    }
    if (dist > 0.001) {
      const step = Math.min(sp * dt, dist);
      d.x += ((best.x - d.x) / dist) * step;
      d.y += ((best.y - d.y) / dist) * step;
    }
  }

  // recogida
  const reach = (best.r || 14) + d.r + PICKUP_BALANCE.collectPad;
  if (dist <= reach) {
    cApi.addXp(best, d.value);
    if (st.sfxCd <= 0) {
      cApi.sfx('gem');
      st.sfxCd = PICKUP_BALANCE.sfxGap;
    }
    st.rel.push(d);
  }
}

/** Imán y recogida de gemas → api.addXp. */
export function updatePickups(state, dt, api) {
  const drops = state.drops;
  if (!drops) return;
  const st = store(state);
  st.t = typeof state.time === 'number' ? state.time : st.t + dt;
  if (st.sfxCd > 0) st.sfxCd -= dt;
  const pl = st.pl;
  pl.length = 0;
  for (const p of state.players.values()) {
    if (!p.down) pl.push(p);
  }
  cDt = dt;
  cApi = api;
  cSt = st;
  drops.forEach(gemStep);
  const rel = st.rel;
  for (let i = 0; i < rel.length; i++) {
    const d = rel[i];
    d.kind = '';
    d.id = 0;
    drops.release(d);
  }
  rel.length = 0;
  cApi = null;
  cSt = null;
}

// ---------------------------------------------------------------------------------------------
// Render (coordenadas de mundo: main.js ya aplicó la cámara)
// ---------------------------------------------------------------------------------------------
const SS = 2; // los sprites se pre-renderizan al doble para verse nítidos en pantallas HiDPI
const gemSprites = [];
const vr = { x0: 0, y0: 0, x1: 0, y1: 0 };
let rCtx = null;
let rNow = 0;

function gemSprite(tier) {
  let s = gemSprites[tier];
  if (s) return s;
  const T = GEM_TIERS[tier];
  const n = T.size;
  s = sprite('cfg-gem-' + tier, n * SS, n * SS, (g) => {
    g.scale(SS, SS);
    const c = n / 2;
    // halo
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, T.color + 'aa');
    grd.addColorStop(1, T.color + '00');
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
    // rombo con facetas
    const r = n * 0.3;
    g.beginPath();
    g.moveTo(c, c - r * 1.25);
    g.lineTo(c + r, c);
    g.lineTo(c, c + r * 1.25);
    g.lineTo(c - r, c);
    g.closePath();
    g.fillStyle = T.color;
    g.fill();
    g.beginPath();
    g.moveTo(c, c - r * 1.25);
    g.lineTo(c + r, c);
    g.lineTo(c, c);
    g.closePath();
    g.fillStyle = T.light;
    g.globalAlpha = 0.75;
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.moveTo(c, c - r * 1.25);
    g.lineTo(c + r, c);
    g.lineTo(c, c + r * 1.25);
    g.lineTo(c - r, c);
    g.closePath();
    g.stroke();
  });
  gemSprites[tier] = s;
  return s;
}

function drawGem(d) {
  if (d.kind !== 'gem') return;
  if (d.x < vr.x0 || d.x > vr.x1 || d.y < vr.y0 || d.y > vr.y1) return;
  let tier = d.type;
  if (typeof tier !== 'number' || tier < 0 || tier >= GEM_TIERS.length) tier = gemTier(d.value || 1);
  const n = GEM_TIERS[tier | 0].size;
  const bob = Math.sin(rNow * 4.2 + (d.ph || 0)) * 1.6;
  rCtx.drawImage(gemSprite(tier | 0), d.x - n / 2, d.y - n / 2 + bob, n, n);
}

export function renderPickups(ctx, state, cam) {
  const drops = state.drops;
  if (!drops || !drops.count) return;
  viewRect(ctx, vr);
  rCtx = ctx;
  rNow = performance.now() * 0.001;
  drops.forEach(drawGem);
  rCtx = null;
}
