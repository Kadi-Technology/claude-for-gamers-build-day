// Ángel Survivors · ANG-C · Habilidades (Campanazo U, Esquiva I) y kit de combate compartido.
//
// - Campanazo (U): onda expansiva con daño, knockback fuerte, anillo visual y shake. Cooldown 8 s.
// - Esquiva (I): pone el cooldown y p.dashT; player.js mueve al jugador y da los i-frames. Aquí también la estela visual.
// - Kit compartido (usado por weapons.js, superweapons.js y pickups.js): empuje de enemigos con registro
//   pooleado, barrido melee en arco/cono, proyectiles pooleados sobre state.projectiles, utilidades de render.
//
// Todo el estado propio vive en un WeakMap indexado por `state` (no ensucia la forma congelada del estado).
// Sin objetos nuevos por frame en caliente: pools preasignados, arreglos reutilizados y callbacks hoisted.

import { collideWithMap } from './world.js';
import { sprite } from '../../../shared/engine/sprites.js';
import * as CFG from './config.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Balance (ANG-G puede sobrescribir estos valores desde config.js con Object.assign al arrancar)
// ---------------------------------------------------------------------------------------------
export const ABILITY_BALANCE = {
  bell: {
    cooldown: 8,        // s
    radius: 285,        // px que alcanza la onda
    speed: 840,         // px/s a los que se expande
    damage: 60,         // daño en el centro
    falloff: 0.35,      // pierde hasta 35 % en el borde
    knock: 190,         // px de empuje (knockback fuerte)
    knockTime: 0.26,    // s que dura el empuje
    shake: 12,
    shakeMs: 300,
  },
  dash: {
    cooldown: 3,        // s
    time: 0.25,         // s de dashT que pone useDash (player.js resuelve la duración real y los i-frames)
    ghostGap: 0.03,     // s entre imágenes residuales
    ghostLife: 0.34,    // s que dura cada imagen
  },
  knockMax: 320,        // tope de empuje por golpe (px)
  magnetBase: 120,      // radio de imán base (px)
};

// CONFIG.balance (config.js) manda sobre estos valores si existe; main.js puede repetir la copia sin efecto.
function mergeNums(dst, src) {
  if (!dst || !src || typeof src !== 'object') return;
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (typeof v === 'number' && isFinite(v) && typeof dst[k] === 'number') dst[k] = v;
  }
}
try {
  const conf = (CFG && (CFG.CONFIG || CFG.default)) || null;
  const cb = conf && conf.balance;
  if (cb) {
    mergeNums(ABILITY_BALANCE.bell, cb.bell);
    mergeNums(ABILITY_BALANCE.dash, cb.dash);
    mergeNums(ABILITY_BALANCE, { magnetBase: cb.magnetBase });
  }
} catch (e) { /* config opcional */ }

/** Mapa activo: api.map (contrato) o state.mapDef como respaldo. */
export function mapOf(api, state) {
  return (api && api.map) || (state && state.mapDef) || null;
}

/** Radio máximo razonable de un enemigo; se suma a las consultas espaciales. */
export const MAX_ER = 36;

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------
export function alive(e) {
  return !!e && e.hp > 0;
}

/** Hash determinista 0..1 a partir de un entero (aleatoriedad cosmética sin Math.random). */
export function hash01(n) {
  let x = (Math.imul((n | 0) + 0x9e3779b9, 2654435761) >>> 0);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

function posNum(v, def) {
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : def;
}

/** Multiplicador de daño del jugador (carta "+daño"). Campo opcional `p.dmgMul`. */
export function dmgMul(p) {
  return p ? posNum(p.dmgMul, 1) : 1;
}

/** Radio de imán del jugador (carta "+imán"). Campo opcional `p.magnetR` en px. */
export function magnetRadius(p) {
  return p ? posNum(p.magnetR, ABILITY_BALANCE.magnetBase) : ABILITY_BALANCE.magnetBase;
}

/** Cooldown efectivo del Campanazo (carta "−cooldown"). Campo opcional `p.bellCdMul`. */
export function bellCooldown(p) {
  return ABILITY_BALANCE.bell.cooldown * (p ? posNum(p.bellCdMul, 1) : 1);
}

export function dashCooldown() {
  return ABILITY_BALANCE.dash.cooldown;
}

/**
 * Normaliza el apuntado a un vector unitario en `out`. Si `aim` es nulo o cero usa la mirada del
 * jugador. `out.dist` es la distancia al punto apuntado (0 = sin dato).
 */
export function aimInto(out, p, aim) {
  let x = aim && typeof aim.x === 'number' ? aim.x : 0;
  let y = aim && typeof aim.y === 'number' ? aim.y : 0;
  let m = Math.sqrt(x * x + y * y);
  if (!(m > 0.001)) {
    const f = p && p.facing;
    x = f && typeof f.x === 'number' ? f.x : 1;
    y = f && typeof f.y === 'number' ? f.y : 0;
    m = Math.sqrt(x * x + y * y);
  }
  if (!(m > 0.001)) {
    x = 1; y = 0; m = 1;
  }
  out.x = x / m;
  out.y = y / m;
  // distancia al punto apuntado: aim.dist (contrato), aim.d (alias) o p.aim.dist (lo deja player.js)
  let dist = 0;
  if (aim && typeof aim.dist === 'number' && isFinite(aim.dist) && aim.dist > 0) dist = aim.dist;
  else if (aim && typeof aim.d === 'number' && isFinite(aim.d) && aim.d > 0) dist = aim.d;
  else {
    const pa = p && p.aim;
    if (pa && typeof pa.dist === 'number' && isFinite(pa.dist) && pa.dist > 0 && pa.x * out.x + pa.y * out.y > 0.98) {
      dist = pa.dist;
    }
  }
  out.dist = dist;
  return out;
}

/**
 * Rectángulo visible en coordenadas de mundo, deducido de la transformación actual del contexto
 * (funciona con cualquier convención de cámara siempre que se haya aplicado con ctx).
 */
export function viewRect(ctx, out) {
  const m = ctx.getTransform();
  const s = m.a > 0.0001 ? m.a : 1;
  const c = ctx.canvas;
  const pad = 90;
  out.x0 = -m.e / s - pad;
  out.y0 = -m.f / s - pad;
  out.x1 = (c.width - m.e) / s + pad;
  out.y1 = (c.height - m.f) / s + pad;
  return out;
}

/**
 * Tajo animado: una franja brillante que barre el arco [ang-arc, ang+arc] (o el circulo si `full`) mientras
 * el efecto vive. `u` = progreso 0..1, `fade` = 1..0. `pal` = { cols:[c1,c2,c3], w:[w1,w2,w3], glow? }.
 * Dibuja en coordenadas de mundo; el llamador guarda/restaura el contexto.
 */
export function drawSlash(ctx, x, y, r, ang, arc, u, fade, pal, full) {
  const span = full ? TAU : arc * 2;
  const start = full ? ang : ang - arc;
  const sweep = u * 1.7 > 1 ? 1 : u * 1.7;
  const head = start + span * sweep;
  const tail = Math.max(start, head - span * 0.62);
  ctx.lineCap = 'round';
  // arco tenue completo (la huella del golpe)
  ctx.globalAlpha = 0.3 * fade;
  ctx.strokeStyle = pal.cols[0];
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, start, start + span);
  ctx.stroke();
  if (head - tail < 0.01) return;
  // franja brillante en tres capas
  ctx.globalAlpha = Math.min(1, fade * 1.8);
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = pal.cols[i];
    ctx.lineWidth = pal.w[i] * (0.35 + 0.65 * fade);
    ctx.beginPath();
    ctx.arc(x, y, r, tail, head);
    ctx.stroke();
  }
  // chispa en la punta
  if (pal.glow) {
    const hx = x + Math.cos(head) * r;
    const hy = y + Math.sin(head) * r;
    const gr = 26 * (0.6 + 0.4 * fade);
    ctx.globalAlpha = Math.min(1, fade * 1.6);
    ctx.drawImage(pal.glow, hx - gr, hy - gr, gr * 2, gr * 2);
  }
}

const glowCache = new Map();
/** Sprite radial suave (halo) pre-renderizado. `rgb` = 'r,g,b'. Devuelve un canvas de 128×128 px. */
export function glowSprite(name, rgb) {
  let s = glowCache.get(name);
  if (s) return s;
  s = sprite('cfg-glow-' + name, 128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(' + rgb + ',1)');
    grd.addColorStop(0.35, 'rgba(' + rgb + ',0.55)');
    grd.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  });
  glowCache.set(name, s);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Proyectiles pooleados sobre state.projectiles
//   cc = 1 → de weapons.js · cc = 2 → de superweapons.js · cc = 0/otro → ajeno (no se toca)
// ---------------------------------------------------------------------------------------------
export function newProj(state, cc, k, own, x, y) {
  const pool = state.projectiles;
  if (!pool) return null;
  const pr = pool.acquire();
  if (!pr) return null;
  pr.cc = cc;
  pr.k = k;
  pr.own = own;
  pr.x = x;
  pr.y = y;
  pr.vx = 0;
  pr.vy = 0;
  pr.r = 6;
  pr.dmg = 0;
  pr.life = 1;
  pr.max = 1;
  pr.ang = 0;
  pr.arc = 0;
  pr.len = 0;
  pr.tk = 0;
  pr.hl = 0;
  pr.ev = 0;
  pr.lv = 1;
  pr.wid = '';
  pr.sx = x;
  pr.sy = y;
  pr.tx = x;
  pr.ty = y;
  if (!pr.hit) pr.hit = [];
  pr.hit.length = 0;
  return pr;
}

export function freeProj(state, pr) {
  pr.cc = 0;
  pr.k = '';
  state.projectiles.release(pr);
}

// ---------------------------------------------------------------------------------------------
// Estado propio por partida
// ---------------------------------------------------------------------------------------------
const stores = new WeakMap();
let waveUid = 1; // global: los marcadores `e.bw` no chocan aunque los pools de enemigos se reutilicen entre partidas
const WAVES = 6;
const GHOSTS = 48;
const KB_CAP = 400;

function store(state) {
  let s = stores.get(state);
  if (s) return s;
  s = {
    wi: 0,
    waves: [],
    kbList: [],
    kbFree: [],
    kbCount: 0,
    ghosts: [],
    gi: 0,
    dash: new Map(),
    out: [],
  };
  for (let i = 0; i < WAVES; i++) {
    s.waves.push({ on: false, x: 0, y: 0, r: 0, t: 0, uid: 0, pid: null, dmg: 0 });
  }
  for (let i = 0; i < GHOSTS; i++) {
    s.ghosts.push({ on: false, x: 0, y: 0, r: 0, t: 0, life: 1, px: 0, py: 0 });
  }
  stores.set(state, s);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Empuje de enemigos (knockback con registro pooleado)
// ---------------------------------------------------------------------------------------------
function resistOf(e) {
  let r = typeof e.kbResist === 'number' ? e.kbResist : 0;
  if (e.boss || e.isBoss || e.type === 'llorona' || e.type === 'jefa') r = Math.max(r, 0.85);
  return r > 0.95 ? 0.95 : r;
}

/**
 * Empuja a `e` en la dirección (dx,dy) un total de `dist` px repartidos en `dur` s (frena al final).
 * Los jefes casi no se mueven. El empuje se aplica en updateAbilities.
 */
export function knockback(state, e, dx, dy, dist, dur) {
  if (!e || !(e.hp > 0)) return;
  let m = Math.sqrt(dx * dx + dy * dy);
  if (m < 0.0001) {
    const a = hash01(e.id | 0) * TAU;
    dx = Math.cos(a);
    dy = Math.sin(a);
    m = 1;
  }
  // los enemigos pesados (Nahual, jefa) salen menos empujados; los livianos (murciélago) más
  const mass = e.mass > 0 ? e.mass : 1;
  const mf = Math.min(1.3, 1 / Math.sqrt(mass));
  const d = Math.min(dist, ABILITY_BALANCE.knockMax) * mf * (1 - resistOf(e));
  if (d < 1) return;
  const time = dur > 0 ? dur : 0.25;
  const v0 = (3 * d) / time; // ∫(1-t/T)² dt = T/3  →  distancia total = v0·T/3
  const st = store(state);
  let k = e._kb;
  if (!(k && k.on && k.st === st && k.e === e && k.id === e.id)) {
    if (st.kbFree.length) {
      k = st.kbFree.pop();
    } else if (st.kbCount < KB_CAP) {
      k = { on: false, st, e: null, id: 0, vx: 0, vy: 0, t: 0, dur: 1 };
      st.kbCount++;
    } else {
      return;
    }
    st.kbList.push(k);
    e._kb = k;
  }
  k.on = true;
  k.e = e;
  k.id = e.id;
  k.vx = (dx / m) * v0;
  k.vy = (dy / m) * v0;
  k.t = 0;
  k.dur = time;
}

function dropKb(st, i) {
  const list = st.kbList;
  const k = list[i];
  const last = list.length - 1;
  list[i] = list[last];
  list.length = last;
  if (k.e && k.e._kb === k) k.e._kb = null;
  k.on = false;
  k.e = null;
  st.kbFree.push(k);
}

// ---------------------------------------------------------------------------------------------
// Barrido melee (arco/cono) compartido por Látigo, Macuahuitl y Lanzallamas
// ---------------------------------------------------------------------------------------------
const sweepBuf = [];

/**
 * Daña a los enemigos dentro de un sector centrado en el jugador.
 * (dx,dy) = dirección unitaria; `half` = semiancho del arco en rad (π = círculo completo).
 * `kb` = empuje en px (0 = ninguno). Si se pasa `hitsOut`, recibe los enemigos golpeados.
 * Devuelve cuántos enemigos golpeó.
 */
export function meleeSweep(state, api, p, dx, dy, range, half, dmg, wid, kb, hitsOut) {
  sweepBuf.length = 0;
  const list = api.enemiesNear(p.x, p.y, range + MAX_ER, sweepBuf);
  const full = half >= Math.PI - 0.01;
  let hits = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!(e.hp > 0)) continue;
    const ex = e.x - p.x;
    const ey = e.y - p.y;
    const d = Math.sqrt(ex * ex + ey * ey);
    const er = e.r || 12;
    if (d > range + er) continue;
    if (!full && d > er) {
      let c = (ex * dx + ey * dy) / d;
      if (c > 1) c = 1; else if (c < -1) c = -1;
      let sr = er / d;
      if (sr > 1) sr = 1;
      if (Math.acos(c) - Math.asin(sr) > half) continue;
    }
    api.damageEnemy(e, dmg, p.pid, wid);
    if (kb > 0) knockback(state, e, ex, ey, kb, 0.18);
    if (hitsOut) hitsOut.push(e);
    hits++;
  }
  return hits;
}

// ---------------------------------------------------------------------------------------------
// Habilidades
// ---------------------------------------------------------------------------------------------

/** Campanazo (U). Se llama en el flanco de la tecla. Devuelve true si se activó. */
export function useBell(state, p, api) {
  if (!p || p.down) return false;
  const cd = p.cooldowns;
  if (!cd || cd.bell > 0.0001) return false;
  const B = ABILITY_BALANCE.bell;
  const st = store(state);
  let w = null;
  for (let i = 0; i < st.waves.length; i++) {
    if (!st.waves[i].on) { w = st.waves[i]; break; }
  }
  if (!w) w = st.waves[st.wi++ % st.waves.length];
  w.on = true;
  w.x = p.x;
  w.y = p.y;
  w.r = 0;
  w.t = 0;
  w.uid = waveUid++;
  w.pid = p.pid;
  w.dmg = B.damage * dmgMul(p);
  cd.bell = bellCooldown(p);
  api.sfx('bell');
  api.shake(B.shake, B.shakeMs);
  api.spawnFx('ring', p.x, p.y, 0);
  return true;
}

/**
 * Esquiva (I). Pone el cooldown, activa `p.dashT` (player.js fija la dirección, mueve al jugador y da
 * los i-frames) y lanza el efecto visual. Devuelve true si el cooldown estaba listo.
 */
export function useDash(state, p, api) {
  if (!p || p.down) return false;
  const cd = p.cooldowns;
  if (!cd || cd.dash > 0.0001) return false;
  cd.dash = dashCooldown();
  if (!(p.dashT > 0)) p.dashT = ABILITY_BALANCE.dash.time;
  const f = p.facing;
  api.spawnFx('petal', p.x, p.y, f ? Math.atan2(f.y, f.x) : 0);
  api.sfx('jump');
  return true;
}

function addGhost(st, p) {
  const g = st.ghosts[st.gi++ % st.ghosts.length];
  g.on = true;
  g.x = p.x;
  g.y = p.y;
  g.r = p.r || 14;
  g.t = 0;
  g.life = ABILITY_BALANCE.dash.ghostLife;
}

/** Cooldowns, ondas del Campanazo, empujes y estela de la esquiva. Paso 5 del tick. */
export function updateAbilities(state, dt, api) {
  const st = store(state);
  const D = ABILITY_BALANCE.dash;

  for (const p of state.players.values()) {
    const cd = p.cooldowns;
    if (!cd) continue;
    if (cd.bell > 0) cd.bell = cd.bell > dt ? cd.bell - dt : 0;
    if (cd.dash > 0) cd.dash = cd.dash > dt ? cd.dash - dt : 0;
    let ds = st.dash.get(p.pid);
    if (!ds) {
      ds = { t: 0 };
      st.dash.set(p.pid, ds);
    }
    if (p.dashT > 0) {
      ds.t -= dt;
      if (ds.t <= 0) {
        ds.t = D.ghostGap;
        addGhost(st, p);
      }
    } else {
      ds.t = 0;
    }
  }

  // Ondas del Campanazo
  const B = ABILITY_BALANCE.bell;
  for (let i = 0; i < st.waves.length; i++) {
    const w = st.waves[i];
    if (!w.on) continue;
    w.t += dt;
    w.r = w.t * B.speed;
    if (w.r > B.radius) w.r = B.radius;
    st.out.length = 0;
    const list = api.enemiesNear(w.x, w.y, w.r + MAX_ER, st.out);
    for (let j = 0; j < list.length; j++) {
      const e = list[j];
      if (!(e.hp > 0) || e.bw === w.uid) continue;
      const ex = e.x - w.x;
      const ey = e.y - w.y;
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d - (e.r || 12) > w.r) continue; // la onda aún no llega
      e.bw = w.uid;
      const fall = 1 - B.falloff * (d / B.radius > 1 ? 1 : d / B.radius);
      api.damageEnemy(e, w.dmg * fall, w.pid, 'campanazo');
      knockback(state, e, ex, ey, B.knock * (0.55 + 0.45 * fall), B.knockTime);
    }
    if (w.r >= B.radius) w.on = false;
  }

  // Empujes activos
  const map = mapOf(api, state);
  const kl = st.kbList;
  for (let i = kl.length - 1; i >= 0; i--) {
    const k = kl[i];
    const e = k.e;
    if (!e || !(e.hp > 0) || e.id !== k.id) { dropKb(st, i); continue; }
    k.t += dt;
    if (k.t >= k.dur) { dropKb(st, i); continue; }
    const s = 1 - k.t / k.dur;
    const f = s * s * dt;
    e.x += k.vx * f;
    e.y += k.vy * f;
    if (map) collideWithMap(e, map);
  }

  // Estela de la esquiva
  for (let i = 0; i < st.ghosts.length; i++) {
    const g = st.ghosts[i];
    if (!g.on) continue;
    g.t += dt;
    if (g.t >= g.life) g.on = false;
  }
}

// ---------------------------------------------------------------------------------------------
// Render (coordenadas de mundo: main.js ya aplicó la cámara)
// ---------------------------------------------------------------------------------------------
let ringSpr = null;
const vr = { x0: 0, y0: 0, x1: 0, y1: 0 };

function ringSprite() {
  if (ringSpr) return ringSpr;
  ringSpr = sprite('cfg-bell-ring', 256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,214,90,0)');
    grd.addColorStop(0.62, 'rgba(255,214,90,0.04)');
    grd.addColorStop(0.9, 'rgba(255,226,130,0.75)');
    grd.addColorStop(1, 'rgba(255,226,130,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });
  return ringSpr;
}

export function renderAbilities(ctx, state, cam) {
  const st = stores.get(state);
  if (!st) return;
  viewRect(ctx, vr);
  const B = ABILITY_BALANCE.bell;

  // Imágenes residuales de la esquiva
  let any = false;
  for (let i = 0; i < st.ghosts.length; i++) {
    const g = st.ghosts[i];
    if (!g.on) continue;
    if (g.x < vr.x0 || g.x > vr.x1 || g.y < vr.y0 || g.y > vr.y1) continue;
    if (!any) {
      ctx.save();
      ctx.fillStyle = '#9fe8ff';
      any = true;
    }
    const a = 1 - g.t / g.life;
    ctx.globalAlpha = 0.55 * a * a;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.r * (0.75 + 0.35 * a), 0, TAU);
    ctx.fill();
  }
  if (any) ctx.restore();

  // Ondas del Campanazo
  for (let i = 0; i < st.waves.length; i++) {
    const w = st.waves[i];
    if (!w.on || w.r < 2) continue;
    if (w.x + w.r < vr.x0 || w.x - w.r > vr.x1 || w.y + w.r < vr.y0 || w.y - w.r > vr.y1) continue;
    const prog = w.r / B.radius;
    const a = 1 - prog;
    ctx.save();
    ctx.globalAlpha = 0.85 * a;
    ctx.drawImage(ringSprite(), w.x - w.r * 1.12, w.y - w.r * 1.12, w.r * 2.24, w.r * 2.24);
    ctx.globalAlpha = Math.min(1, a * 1.4);
    ctx.lineWidth = 4 + 14 * a;
    ctx.strokeStyle = '#ffd25a';
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff6d6';
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r * 0.94, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
