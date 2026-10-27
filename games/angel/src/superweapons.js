// Ángel Survivors · ANG-C · Superarmas (R3): spawn aleatorio, columna de luz, flechas de borde,
// recogida, expiración con restauración del arma previa y las cinco armas.
//
// Las superarmas en el mapa son drops { kind:'super', type:<id> } en state.drops. Al recogerlas
// reemplazan temporalmente el arma activa: p.super = { type, until, ammo } y p.prevActive guarda el
// espacio de mochila a restaurar. Nivel y maestría de las armas base nunca se tocan.
// Los proyectiles propios llevan cc = 2 en state.projectiles (los de weapons.js llevan cc = 1).

import { randomFreePoint, isFree } from './world.js';
import { sprite, emoji } from '../../../shared/engine/sprites.js';
import { emit } from '../../../shared/engine/bus.js';
import { weaponLabel } from './weapons.js';
import {
  MAX_ER, dmgMul, glowSprite, viewRect, newProj, freeProj, meleeSweep, knockback, hash01, mapOf, drawSlash,
} from './abilities.js';
import * as CFG from './config.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Balance (ANG-G puede sobrescribirlo desde config.js con Object.assign al arrancar)
// ---------------------------------------------------------------------------------------------
export const SUPER_BALANCE = {
  spawnMin: 40,           // s entre apariciones (GDD §1.9: 40-60 s)
  spawnMax: 60,
  firstMin: 22,           // la primera aparece antes para que la demo la muestre pronto
  firstMax: 32,
  despawn: 25,            // s en el mapa antes de desaparecer
  minDist: 520,           // distancia mínima al jugador al aparecer (px)
  maxDist: 1150,
  pickR: 34,              // radio de recogida de la superarma (px)
  blinkLast: 5,           // s finales en los que parpadea
  macuahuitl: { duration: 15, cadence: 0.34, range: 132, half: 1.2, dmg: 44, spinRange: 165, spinMul: 1.5, kb: 70, spinKb: 135 },
  minigun: { duration: 12, cadence: 0.05, dmg: 8, speed: 920, life: 0.5, spread: 0.13, r: 4, brakeT: 0.12, slow: 0.62 },
  bazuca: { duration: 15, ammo: 8, cadence: 0.7, speed: 540, life: 1.5, r: 8, blastR: 150, blastDmg: 105, blastMin: 0.6, kb: 230 },
  lanzallamas: { duration: 10, cadence: 0.07, range: 235, half: 0.36, dmg: 5.5, burnDps: 14, burnT: 2.5, burnTick: 0.25 },
  rayo: { duration: 8, cadence: 0.1, len: 980, width: 15, dmg: 20 },
};
const SB = SUPER_BALANCE;

// CONFIG.supers (config.js) manda sobre los tiempos de aparición si existe.
try {
  const conf = (CFG && (CFG.CONFIG || CFG.default)) || null;
  const cs = conf && conf.supers;
  if (cs) {
    for (const k of Object.keys(cs)) {
      if (typeof cs[k] === 'number' && isFinite(cs[k]) && typeof SB[k] === 'number') SB[k] = cs[k];
    }
  }
} catch (e) { /* config opcional */ }

const COL_W = 72;
const COL_H = 560;
const DROP_ID0 = 0x40000000; // rango de ids propio para no chocar con las gemas (pickups.js)

// ---------------------------------------------------------------------------------------------
// Registro de superarmas: { id, nombre, icon, kind, color, rgb, duration, ammo?, cadence, onAttack }
// (duration, ammo y cadence son accesores: siguen a SUPER_BALANCE si se ajusta en caliente)
// ---------------------------------------------------------------------------------------------
export const SUPERS = {
  macuahuitl: {
    id: 'macuahuitl', nombre: 'Macuahuitl', icon: '⚔️', kind: 'melee',
    color: '#a77bff', rgb: '167,123,255',
    descripcion: 'Tajos de obsidiana; cada tercer golpe gira 360°',
    get duration() { return SB.macuahuitl.duration; },
    get cadence() { return SB.macuahuitl.cadence; },
    onAttack: attackMacuahuitl,
  },
  minigun: {
    id: 'minigun', nombre: 'Minigun Tronadora', icon: '🔫', kind: 'rafaga',
    color: '#ffcf40', rgb: '255,207,64',
    descripcion: '20 balas por segundo con dispersión; te frena un poco',
    get duration() { return SB.minigun.duration; },
    get cadence() { return SB.minigun.cadence; },
    onAttack: attackMinigun,
  },
  bazuca: {
    id: 'bazuca', nombre: 'Bazuca Cohetón', icon: '🚀', kind: 'explosivo',
    color: '#ff5a3c', rgb: '255,90,60',
    descripcion: 'Cohete con explosión de área, empuje y temblor',
    get duration() { return SB.bazuca.duration; },
    get ammo() { return SB.bazuca.ammo; },
    get cadence() { return SB.bazuca.cadence; },
    onAttack: attackBazuca,
  },
  lanzallamas: {
    id: 'lanzallamas', nombre: 'Lanzallamas Chilero', icon: '🔥', kind: 'cono',
    color: '#ff9a1f', rgb: '255,154,31',
    descripcion: 'Cono continuo de fuego; deja a los enemigos en llamas',
    get duration() { return SB.lanzallamas.duration; },
    get cadence() { return SB.lanzallamas.cadence; },
    onAttack: attackLanzallamas,
  },
  rayo: {
    id: 'rayo', nombre: 'Rayo de Quetzalcóatl', icon: '⚡', kind: 'laser',
    color: '#39ffb6', rgb: '57,255,182',
    descripcion: 'Haz que atraviesa a todos los enemigos en la línea de mira',
    get duration() { return SB.rayo.duration; },
    get cadence() { return SB.rayo.cadence; },
    onAttack: attackRayo,
  },
};

export const SUPER_IDS = ['macuahuitl', 'minigun', 'bazuca', 'lanzallamas', 'rayo'];

// ---------------------------------------------------------------------------------------------
// Estado propio por partida
// ---------------------------------------------------------------------------------------------
const stores = new WeakMap();
const BURN_CAP = 200;

function store(state) {
  let s = stores.get(state);
  if (!s) {
    s = {
      nextAt: -1, last: '', nid: DROP_ID0, clock: 0,
      pl: [], rel: [], hits: [], q: [], q2: [],
      blasts: [],
      burn: [], burnFree: [], burnCount: 0,
    };
    for (let i = 0; i < 16; i++) s.blasts.push({ on: false, x: 0, y: 0, own: null });
    stores.set(state, s);
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------------------------------------
/**
 * Hace aparecer una superarma en el mapa. Sin argumentos elige tipo y punto al azar lejos de un
 * jugador. Útil para los atajos de debug de main.js (por ejemplo, F para forzar una superarma).
 * Devuelve el drop o null.
 */
export function spawnSuper(state, api, type, x, y) {
  const st = store(state);
  const drops = state.drops;
  if (!drops) return null;
  const rng = api.rng;
  if (!type || !SUPERS[type]) {
    let id = '';
    for (let tries = 0; tries < 6; tries++) {
      id = SUPER_IDS[Math.floor(rng.next() * SUPER_IDS.length) % SUPER_IDS.length];
      if (id !== st.last) break;
    }
    type = id;
  }
  if (typeof x !== 'number' || typeof y !== 'number') {
    const pl = st.pl;
    pl.length = 0;
    for (const p of state.players.values()) {
      if (!p.down) pl.push(p);
    }
    if (!pl.length) return null;
    const anchor = pl[Math.floor(rng.next() * pl.length) % pl.length];
    const pt = randomFreePoint(mapOf(api, state), rng, anchor.x, anchor.y, SB.minDist, SB.maxDist);
    if (!pt) return null;
    x = pt.x;
    y = pt.y;
  }
  const d = drops.acquire();
  if (!d) return null;
  const def = SUPERS[type];
  const T = typeof state.time === 'number' ? state.time : st.clock;
  d.id = st.nid++;
  d.kind = 'super';
  d.type = type;
  d.x = x;
  d.y = y;
  d.value = 0;
  d.r = 30;
  d.vx = 0;
  d.vy = 0;
  d.mag = 0;
  d.born = T;
  d.until = T + SB.despawn;
  d.ph = hash01(d.id) * TAU;
  st.last = type;
  emit('super:spawn', { id: d.id, type, x, y });
  api.toast('¡' + def.nombre + ' en el mapa!');
  api.sfx('pickup');
  return d;
}

// ---------------------------------------------------------------------------------------------
// Ataques (se llaman desde weapons.attack cuando p.super existe; la cadencia la pone attack)
// ---------------------------------------------------------------------------------------------
function dirAngle(sp, aim) {
  const a = Math.atan2(aim.y, aim.x);
  sp.fa = a;
  return a;
}

function attackMacuahuitl(state, p, aim, api) {
  const sp = p.super;
  const B = SB.macuahuitl;
  sp.n = (sp.n || 0) + 1;
  const spin = sp.n % 3 === 0;
  const a = dirAngle(sp, aim);
  const range = spin ? B.spinRange : B.range;
  const half = spin ? Math.PI : B.half;
  const dmg = B.dmg * (spin ? B.spinMul : 1) * dmgMul(p);
  meleeSweep(state, api, p, aim.x, aim.y, range, half, dmg, 'macuahuitl', spin ? B.spinKb : B.kb, null);
  const pr = newProj(state, 2, 'swing', p.pid, p.x, p.y);
  if (pr) {
    pr.ang = a;
    pr.arc = half;
    pr.len = range;
    pr.life = pr.max = spin ? 0.3 : 0.22;
    pr.ev = spin ? 1 : 0;
  }
  api.spawnFx('slash', p.x, p.y, a);
  api.sfx('hit');
  if (spin) {
    api.shake(7, 180);
    api.spawnFx('ring', p.x, p.y, 0);
  }
}

function attackMinigun(state, p, aim, api) {
  const sp = p.super;
  const B = SB.minigun;
  const a0 = dirAngle(sp, aim);
  const a = a0 + (api.rng.next() * 2 - 1) * B.spread;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const pr = newProj(state, 2, 'bullet', p.pid, p.x + cs * ((p.r || 14) + 8), p.y + sn * ((p.r || 14) + 8));
  if (pr) {
    pr.vx = cs * B.speed;
    pr.vy = sn * B.speed;
    pr.r = B.r;
    pr.dmg = B.dmg * dmgMul(p);
    pr.life = pr.max = B.life;
  }
  sp.brake = B.brakeT;
  sp.flash = 0.06;
  sp.n = (sp.n || 0) + 1;
  if (sp.n % 3 === 1) api.sfx('shoot');
  if (sp.n % 6 === 1) api.shake(1.5, 60);
}

function attackBazuca(state, p, aim, api) {
  const sp = p.super;
  const B = SB.bazuca;
  if (!(sp.ammo > 0)) return;
  const a = dirAngle(sp, aim);
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const pr = newProj(state, 2, 'rocket', p.pid, p.x + cs * ((p.r || 14) + 10), p.y + sn * ((p.r || 14) + 10));
  if (pr) {
    pr.vx = cs * B.speed;
    pr.vy = sn * B.speed;
    pr.r = B.r;
    pr.dmg = B.blastDmg * dmgMul(p);
    pr.life = pr.max = B.life;
  }
  sp.ammo--;
  sp.flash = 0.1;
  if (sp.ammo <= 0) {
    // última carga: la superarma se agota apenas el cohete tiene tiempo de salir
    const T = typeof state.time === 'number' ? state.time : store(state).clock;
    sp.until = Math.min(sp.until, T + 0.5);
  }
  api.sfx('shoot');
  api.shake(4, 110);
}

function attackLanzallamas(state, p, aim, api) {
  const sp = p.super;
  const B = SB.lanzallamas;
  const a = dirAngle(sp, aim);
  const st = store(state);
  const dm = dmgMul(p);
  const hits = st.hits;
  hits.length = 0;
  meleeSweep(state, api, p, aim.x, aim.y, B.range, B.half, B.dmg * dm, 'lanzallamas', 0, hits);
  for (let i = 0; i < hits.length; i++) ignite(st, hits[i], p.pid, B.burnDps * dm);
  sp.flameT = 0.14;
  sp.n = (sp.n || 0) + 1;
  if (sp.n % 2 === 1) {
    api.spawnFx('fire', p.x + aim.x * ((p.r || 14) + 30), p.y + aim.y * ((p.r || 14) + 30), a);
  }
  if (sp.n % 5 === 1) api.sfx('shoot');
}

function attackRayo(state, p, aim, api) {
  const sp = p.super;
  const B = SB.rayo;
  const a = dirAngle(sp, aim);
  const st = store(state);
  const dm = dmgMul(p);
  const dx = aim.x;
  const dy = aim.y;
  const mx = p.x + dx * B.len * 0.5;
  const my = p.y + dy * B.len * 0.5;
  st.q.length = 0;
  const list = api.enemiesNear(mx, my, B.len * 0.5 + MAX_ER, st.q);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!(e.hp > 0)) continue;
    const ex = e.x - p.x;
    const ey = e.y - p.y;
    const along = ex * dx + ey * dy;
    const er = e.r || 12;
    if (along < -er || along > B.len + er) continue;
    const perp = Math.abs(ex * dy - ey * dx);
    if (perp > er + B.width) continue;
    api.damageEnemy(e, B.dmg * dm, p.pid, 'rayo');
  }
  const pr = newProj(state, 2, 'beam', p.pid, p.x, p.y);
  if (pr) {
    pr.ang = a;
    pr.len = B.len;
    pr.life = pr.max = 0.16;
  }
  sp.n = (sp.n || 0) + 1;
  if (sp.n % 2 === 1) api.spawnFx('beam', p.x, p.y, a);
  if (sp.n % 4 === 1) api.sfx('shoot');
  if (sp.n % 3 === 1) api.shake(2, 70);
}

// ---------------------------------------------------------------------------------------------
// Quemaduras del lanzallamas (registro pooleado)
// ---------------------------------------------------------------------------------------------
function ignite(st, e, pid, dps) {
  let b = e._bs;
  if (b && b.on && b.st === st && b.e === e && b.id === e.id) {
    b.t = SB.lanzallamas.burnT;
    if (dps > b.dps) b.dps = dps;
    return;
  }
  if (st.burnFree.length) {
    b = st.burnFree.pop();
  } else if (st.burnCount < BURN_CAP) {
    b = { on: false, st, e: null, id: 0, t: 0, acc: 0, dps: 0, pid: null };
    st.burnCount++;
  } else {
    return;
  }
  b.on = true;
  b.e = e;
  b.id = e.id;
  b.t = SB.lanzallamas.burnT;
  b.acc = 0;
  b.dps = dps;
  b.pid = pid;
  e._bs = b;
  st.burn.push(b);
}

function dropBurn(st, i) {
  const list = st.burn;
  const b = list[i];
  const last = list.length - 1;
  list[i] = list[last];
  list.length = last;
  if (b.e && b.e._bs === b) b.e._bs = null;
  b.on = false;
  b.e = null;
  st.burnFree.push(b);
}

function stepBurn(st, dt, api) {
  const list = st.burn;
  const BT = SB.lanzallamas.burnTick;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    const e = b.e;
    if (!e || !(e.hp > 0) || e.id !== b.id) { dropBurn(st, i); continue; }
    b.t -= dt;
    if (b.t <= 0) { dropBurn(st, i); continue; }
    b.acc += dt;
    if (b.acc >= BT) {
      b.acc -= BT;
      api.damageEnemy(e, b.dps * BT, b.pid, 'lanzallamas');
      if (e.hp > 0 && hash01((e.id | 0) + ((b.t * 10) | 0)) < 0.35) api.spawnFx('fire', e.x, e.y, 0);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Actualización (paso 6 del tick)
// ---------------------------------------------------------------------------------------------
let cS = null;
let cDt = 0;
let cApi = null;
let cSt = null;
let cT = 0;
let cMap = null;

function releaseDrop(d) {
  d.kind = '';
  d.id = 0;
  cS.drops.release(d);
}

/**
 * Equipa una superarma al jugador (recogida, debug o pruebas). Si ya tenía una, la reemplaza
 * conservando el arma base a restaurar. Devuelve true si el tipo existe.
 */
export function grantSuper(state, p, type, api) {
  const def = SUPERS[type];
  if (!def || !p) return false;
  const T = typeof state.time === 'number' ? state.time : store(state).clock;
  if (p.super) clearSlow(p, p.super);
  else p.prevActive = p.active; // si ya tenía una, se conserva el arma base original
  p.super = {
    type, until: T + def.duration, ammo: def.ammo || 0,
    n: 0, brake: 0, flameT: 0, flash: 0, fa: 0, slowOn: 0,
  };
  if (p.cooldowns) p.cooldowns.attack = 0;
  api.toast('¡' + def.nombre + '!');
  api.sfx('pickup');
  api.shake(5, 160);
  api.spawnFx('ring', p.x, p.y, 0);
  emit('super:pickup', { pid: p.pid, type });
  return true;
}

function dropStep(d) {
  if (d.kind !== 'super') return;
  if (cT >= d.until) {
    cSt.rel.push(d);
    return;
  }
  const pl = cSt.pl;
  const pr = SB.pickR;
  for (let i = 0; i < pl.length; i++) {
    const p = pl[i];
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    const rr = (p.r || 14) + pr;
    if (dx * dx + dy * dy <= rr * rr) {
      grantSuper(cS, p, d.type, cApi);
      cSt.rel.push(d);
      return;
    }
  }
}

/** Quita el frenado de la minigun (usa p.slowMul, que player.js multiplica a la velocidad). */
function clearSlow(p, sp) {
  if (!sp || !(sp.slowOn > 0)) return;
  const v = (p.slowMul > 0 ? p.slowMul : 1) / sp.slowOn;
  p.slowMul = Math.abs(v - 1) < 1e-6 ? 1 : v;
  sp.slowOn = 0;
}

function setSlow(p, sp, on) {
  if (on && !(sp.slowOn > 0)) {
    sp.slowOn = SB.minigun.slow;
    p.slowMul = (p.slowMul > 0 ? p.slowMul : 1) * sp.slowOn;
  } else if (!on) {
    clearSlow(p, sp);
  }
}

/** Devuelve el arma base a la que vuelve el jugador tras una superarma. */
function restoreWeapon(p) {
  const ws = p.weapons;
  let idx = p.prevActive;
  if (!(idx >= 0 && idx < ws.length && ws[idx])) {
    idx = 0;
    for (let i = 0; i < ws.length; i++) {
      if (ws[i]) { idx = i; break; }
    }
  }
  p.active = idx;
  return ws[idx];
}

function expire(p, silent) {
  clearSlow(p, p.super);
  p.super = null;
  const w = restoreWeapon(p);
  if (!silent && w) {
    cApi.toast('Vuelves a ' + weaponLabel(w));
    cApi.sfx('pickup');
  }
  emit('super:expire', { pid: p.pid });
}

const MIN_STEP = 14;

function explodeRocket(pr) {
  const api = cApi;
  const B = SB.bazuca;
  const R = B.blastR;
  pr.life = 0;
  const st = cSt;
  st.q2.length = 0;
  const list = api.enemiesNear(pr.x, pr.y, R + MAX_ER, st.q2);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!(e.hp > 0)) continue;
    const ex = e.x - pr.x;
    const ey = e.y - pr.y;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d - (e.r || 12) > R) continue;
    const f = d / R > 1 ? 1 : d / R;
    api.damageEnemy(e, pr.dmg * (1 - (1 - B.blastMin) * f), pr.own, 'bazuca');
    knockback(cS, e, ex, ey, B.kb * (1 - 0.5 * f), 0.28);
  }
  // el anillo visual se crea al terminar de iterar el pool (no se adquiere mientras se recorre)
  const pb = st.blasts;
  let slot = null;
  for (let i = 0; i < pb.length; i++) {
    if (!pb[i].on) { slot = pb[i]; break; }
  }
  if (slot) {
    slot.on = true;
    slot.x = pr.x;
    slot.y = pr.y;
    slot.own = pr.own;
  }
  api.spawnFx('explosion', pr.x, pr.y, 0);
  api.sfx('explosion');
  api.shake(15, 340);
}

function stepRocket(pr) {
  const api = cApi;
  const dt = cDt;
  pr.life -= dt;
  const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
  const n = Math.max(1, Math.ceil((sp * dt) / MIN_STEP));
  const sdt = dt / n;
  for (let s = 0; s < n; s++) {
    pr.x += pr.vx * sdt;
    pr.y += pr.vy * sdt;
    if (cMap && !isFree(cMap, pr.x, pr.y, 3)) { explodeRocket(pr); return; }
    cSt.q.length = 0;
    const list = api.enemiesNear(pr.x, pr.y, pr.r + MAX_ER, cSt.q);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!(e.hp > 0)) continue;
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      const rr = (e.r || 12) + pr.r;
      if (dx * dx + dy * dy <= rr * rr) { explodeRocket(pr); return; }
    }
  }
  if (pr.life <= 0) explodeRocket(pr);
}

function stepBullet(pr) {
  const api = cApi;
  const dt = cDt;
  pr.life -= dt;
  const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
  const n = Math.max(1, Math.ceil((sp * dt) / MIN_STEP));
  const sdt = dt / n;
  for (let s = 0; s < n; s++) {
    pr.x += pr.vx * sdt;
    pr.y += pr.vy * sdt;
    if (cMap && !isFree(cMap, pr.x, pr.y, 1)) { pr.life = 0; return; }
    cSt.q.length = 0;
    const list = api.enemiesNear(pr.x, pr.y, pr.r + MAX_ER, cSt.q);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!(e.hp > 0)) continue;
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      const rr = (e.r || 12) + pr.r;
      if (dx * dx + dy * dy <= rr * rr) {
        api.damageEnemy(e, pr.dmg, pr.own, 'minigun');
        pr.life = 0;
        return;
      }
    }
  }
}

function projStep(pr) {
  if (pr.cc !== 2) return;
  switch (pr.k) {
    case 'bullet': stepBullet(pr); break;
    case 'rocket': stepRocket(pr); break;
    case 'swing':
    case 'beam': {
      // siguen al jugador mientras duran
      pr.life -= cDt;
      const o = cS.players.get(pr.own);
      if (o) { pr.x = o.x; pr.y = o.y; }
      break;
    }
    default: pr.life -= cDt; break; // 'blast'
  }
  if (pr.life <= 0) cSt.rel.push(pr);
}

/** Spawn, despawn, recogida, expiración, frenado de la minigun, quemaduras y proyectiles de superarma. */
export function updateSupers(state, dt, api) {
  const st = store(state);
  st.clock += dt;
  const T = typeof state.time === 'number' ? state.time : st.clock;
  const drops = state.drops;
  if (!drops) return;

  // jugadores vivos (para recogida y spawn)
  const pl = st.pl;
  pl.length = 0;
  for (const p of state.players.values()) {
    if (!p.down) pl.push(p);
  }

  // temporizador de aparición
  if (st.nextAt < 0) st.nextAt = T + SB.firstMin + (SB.firstMax - SB.firstMin) * api.rng.next();
  if (T >= st.nextAt && pl.length) {
    spawnSuper(state, api);
    st.nextAt = T + SB.spawnMin + (SB.spawnMax - SB.spawnMin) * api.rng.next();
  }

  cS = state; cDt = dt; cApi = api; cSt = st; cT = T; cMap = mapOf(api, state);

  // despawn + recogida
  drops.forEach(dropStep);

  // jugadores: expiración, frenado de la minigun y temporizadores visuales
  for (const p of state.players.values()) {
    const sp = p.super;
    if (!sp) continue;
    if (p.down) { expire(p, true); continue; }
    if (T >= sp.until || SUPERS[sp.type] === undefined) { expire(p, false); continue; }
    if (sp.flameT > 0) sp.flameT -= dt;
    if (sp.flash > 0) sp.flash -= dt;
    if (sp.type === 'minigun') {
      if (sp.brake > 0) sp.brake -= dt;
      setSlow(p, sp, sp.brake > 0);
    }
  }

  // proyectiles de superarma
  state.projectiles.forEach(projStep);

  // quemaduras
  stepBurn(st, dt, api);

  // anillos de explosión pendientes
  const pb = st.blasts;
  for (let i = 0; i < pb.length; i++) {
    const b = pb[i];
    if (!b.on) continue;
    b.on = false;
    const fx = newProj(state, 2, 'blast', b.own, b.x, b.y);
    if (fx) {
      fx.len = SB.bazuca.blastR;
      fx.life = fx.max = 0.42;
    }
  }

  // liberar lo marcado
  const rel = st.rel;
  for (let i = 0; i < rel.length; i++) {
    const o = rel[i];
    if (o.cc === 2) freeProj(state, o);
    else releaseDrop(o);
  }
  rel.length = 0;
  cS = null; cApi = null; cSt = null; cMap = null;
}

// ---------------------------------------------------------------------------------------------
// Render (coordenadas de mundo: main.js ya aplicó la cámara)
// ---------------------------------------------------------------------------------------------
const SS = 2;
const vr = { x0: 0, y0: 0, x1: 0, y1: 0 };
const pt = { x: 0, y: 0 };
let rCtx = null;
let rNow = 0;
let rS = null;
const colSprites = {};
const rocketSpr = { s: null };
const rLineDash = [10, 8];

function columnSprite(def) {
  let s = colSprites[def.id];
  if (s) return s;
  s = sprite('cfg-super-col-' + def.id, COL_W * SS, COL_H * SS, (g) => {
    g.scale(SS, SS);
    const v = g.createLinearGradient(0, COL_H, 0, 0);
    v.addColorStop(0, 'rgba(' + def.rgb + ',0.9)');
    v.addColorStop(0.35, 'rgba(' + def.rgb + ',0.45)');
    v.addColorStop(1, 'rgba(' + def.rgb + ',0)');
    g.fillStyle = v;
    g.fillRect(0, 0, COL_W, COL_H);
    g.globalCompositeOperation = 'destination-in';
    const h = g.createLinearGradient(0, 0, COL_W, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.3, 'rgba(0,0,0,0.85)');
    h.addColorStop(0.5, 'rgba(0,0,0,1)');
    h.addColorStop(0.7, 'rgba(0,0,0,0.85)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, COL_W, COL_H);
  });
  colSprites[def.id] = s;
  return s;
}

function rocketSprite() {
  if (rocketSpr.s) return rocketSpr.s;
  rocketSpr.s = sprite('cfg-rocket', 40 * SS, 16 * SS, (g) => {
    g.scale(SS, SS);
    // cuerpo
    g.fillStyle = '#c9ced6';
    g.fillRect(4, 4, 24, 8);
    g.fillStyle = '#e8ecf2';
    g.fillRect(4, 4, 24, 3);
    // franja roja
    g.fillStyle = '#e0412c';
    g.fillRect(12, 4, 5, 8);
    // punta
    g.beginPath();
    g.moveTo(28, 3);
    g.lineTo(38, 8);
    g.lineTo(28, 13);
    g.closePath();
    g.fillStyle = '#e0412c';
    g.fill();
    // aletas
    g.fillStyle = '#7b8494';
    g.beginPath();
    g.moveTo(4, 4); g.lineTo(0, 0); g.lineTo(8, 4); g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(4, 12); g.lineTo(0, 16); g.lineTo(8, 12); g.closePath(); g.fill();
  });
  return rocketSpr.s;
}

function drawDrop(d) {
  if (d.kind !== 'super') return;
  const def = SUPERS[d.type];
  if (!def) return;
  if (d.x < vr.x0 || d.x > vr.x1 || d.y < vr.y0 || d.y - COL_H > vr.y1) return;
  const ctx = rCtx;
  const t = rNow;
  let fade = 1;
  if (d.until > 0 && typeof rS.time === 'number') {
    const left = d.until - rS.time;
    if (left < SB.blinkLast) fade = Math.floor(t * 6) % 2 ? 0.35 : 1;
  }
  const pulse = 0.5 + 0.5 * Math.sin(t * 3 + (d.ph || 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // halo en el suelo
  ctx.globalAlpha = (0.55 + 0.25 * pulse) * fade;
  const gr = 62 + 8 * pulse;
  ctx.drawImage(glowSprite('super-' + def.id, def.rgb), d.x - gr, d.y - gr, gr * 2, gr * 2);
  // columna de luz
  ctx.globalAlpha = (0.55 + 0.3 * pulse) * fade;
  ctx.drawImage(columnSprite(def), d.x - COL_W / 2, d.y - COL_H + 8, COL_W, COL_H);
  ctx.restore();
  // anillo giratorio
  ctx.save();
  ctx.globalAlpha = 0.9 * fade;
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 3;
  ctx.setLineDash(rLineDash);
  ctx.lineDashOffset = -t * 30;
  ctx.beginPath();
  ctx.arc(d.x, d.y, 30 + 3 * pulse, 0, TAU);
  ctx.stroke();
  ctx.restore();
  // icono
  const bob = Math.sin(t * 3.2 + (d.ph || 0)) * 4;
  ctx.globalAlpha = fade;
  ctx.drawImage(emoji(def.icon, 40), d.x - 20, d.y - 26 + bob, 40, 40);
  ctx.globalAlpha = 1;
}

/** Superarmas en el mapa: columna de luz, halo, anillo e icono. */
export function renderSupers(ctx, state, cam) {
  const drops = state.drops;
  if (!drops || !drops.count) return;
  viewRect(ctx, vr);
  rCtx = ctx;
  rNow = performance.now() * 0.001;
  rS = state;
  drops.forEach(drawDrop);
  rCtx = null;
  rS = null;
}

// --- Efectos de las superarmas (proyectiles, conos, auras): los dibuja weapons.renderWeapons ---

function drawBullet(pr) {
  const ctx = rCtx;
  const tx = pr.x - pr.vx * 0.05;
  const ty = pr.y - pr.vy * 0.05;
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#ffb938';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(pr.x, pr.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#fff1b8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(pr.x, pr.y);
  ctx.stroke();
}

function drawRocket(pr) {
  const ctx = rCtx;
  const a = Math.atan2(pr.vy, pr.vx);
  const fl = 0.8 + 0.4 * Math.sin(rNow * 50 + pr.x * 0.1);
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.rotate(a);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.9;
  const gs = 22 * fl;
  ctx.drawImage(glowSprite('rocket-fire', '255,150,40'), -gs - 14, -gs, gs * 2, gs * 2);
  ctx.globalAlpha = 0.95;
  const g2 = 11 * fl;
  ctx.drawImage(glowSprite('rocket-core', '255,240,170'), -g2 - 16, -g2, g2 * 2, g2 * 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(rocketSprite(), -20, -8, 40, 16);
  ctx.restore();
}

function drawBlast(pr) {
  const ctx = rCtx;
  const k = 1 - pr.life / pr.max;
  const e = 1 - (1 - k) * (1 - k) * (1 - k);
  const R = pr.len * (0.25 + 0.75 * e);
  const a = 1 - k;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.85 * a;
  ctx.drawImage(glowSprite('blast', '255,140,50'), pr.x - R * 1.3, pr.y - R * 1.3, R * 2.6, R * 2.6);
  if (k < 0.3) {
    ctx.globalAlpha = (1 - k / 0.3) * 0.9;
    const w = R * 0.9;
    ctx.drawImage(glowSprite('blast-core', '255,244,200'), pr.x - w, pr.y - w, w * 2, w * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = 3 + 10 * a;
  ctx.beginPath();
  ctx.arc(pr.x, pr.y, R, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

const OBS_PAL = { cols: ['#6a45e8', '#1c1036', '#dff7ff'], w: [26, 15, 4], glow: null };

function drawSwing(pr) {
  const ctx = rCtx;
  const fade = pr.life / pr.max;
  if (!OBS_PAL.glow) OBS_PAL.glow = glowSprite('obsidiana', '150,120,255');
  ctx.save();
  drawSlash(ctx, pr.x, pr.y, pr.len * (pr.ev ? 0.9 : 0.8), pr.ang, pr.arc, 1 - fade, fade, OBS_PAL, !!pr.ev);
  ctx.restore();
}

function drawBeam(pr) {
  const ctx = rCtx;
  const a = pr.life / pr.max;
  const cs = Math.cos(pr.ang);
  const sn = Math.sin(pr.ang);
  const ex = pr.x + cs * pr.len;
  const ey = pr.y + sn * pr.len;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.28 * a;
  ctx.strokeStyle = '#1fe8a0';
  ctx.lineWidth = 36;
  ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.globalAlpha = 0.7 * a;
  ctx.strokeStyle = '#6dffd0';
  ctx.lineWidth = 15;
  ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(ex, ey); ctx.stroke();
  // listón dorado ondulante (pluma de Quetzalcóatl)
  ctx.globalAlpha = 0.85 * a;
  ctx.strokeStyle = '#ffd54a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const off = Math.sin(t * 17 - rNow * 32) * 8 * (1 - t * 0.35);
    const px = pr.x + cs * pr.len * t - sn * off;
    const py = pr.y + sn * pr.len * t + cs * off;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSuperProj(pr) {
  if (pr.cc !== 2) return;
  if (pr.k === 'bullet' && (pr.x < vr.x0 || pr.x > vr.x1 || pr.y < vr.y0 || pr.y > vr.y1)) return;
  switch (pr.k) {
    case 'rocket': drawRocket(pr); break;
    case 'blast': drawBlast(pr); break;
    case 'swing': drawSwing(pr); break;
    case 'beam': drawBeam(pr); break;
    default: break;
  }
}

function drawFlame(p, sp) {
  const ctx = rCtx;
  const B = SB.lanzallamas;
  const cs = Math.cos(sp.fa);
  const sn = Math.sin(sp.fa);
  const tn = Math.tan(B.half);
  const spY = glowSprite('flame-y', '255,236,130');
  const spO = glowSprite('flame-o', '255,140,40');
  const spR = glowSprite('flame-r', '225,50,20');
  const k = sp.flameT > 0.07 ? 1 : Math.max(0, sp.flameT / 0.07);
  const base = (p.r || 14) * 0.6;
  for (let i = 0; i < 14; i++) {
    const t = (i / 14 + rNow * 2.4) % 1;
    const s = base + B.range * t;
    const lat = Math.sin(rNow * 13 + i * 1.9) * s * tn * 0.7;
    const x = p.x + cs * s - sn * lat;
    const y = p.y + sn * s + cs * lat;
    const rad = 12 + 34 * t;
    ctx.globalAlpha = (1 - t) * 0.85 * k;
    const spr = t < 0.3 ? spY : t < 0.65 ? spO : spR;
    ctx.drawImage(spr, x - rad, y - rad, rad * 2, rad * 2);
  }
}

function drawBurning(st) {
  const ctx = rCtx;
  const list = st.burn;
  if (!list.length) return;
  const spO = glowSprite('flame-o', '255,140,40');
  const spY = glowSprite('flame-y', '255,236,130');
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const e = b.e;
    if (!e || e.x < vr.x0 || e.x > vr.x1 || e.y < vr.y0 || e.y > vr.y1) continue;
    const er = e.r || 12;
    const fl = 0.85 + 0.3 * Math.sin(rNow * 22 + (e.id | 0) * 1.3);
    const rad = er * 1.5 * fl;
    ctx.globalAlpha = 0.8;
    ctx.drawImage(spO, e.x - rad, e.y - er * 0.4 - rad, rad * 2, rad * 2);
    const r2 = rad * 0.55;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(spY, e.x - r2, e.y - er * 0.55 - r2, r2 * 2, r2 * 2);
  }
}

/** Dibuja proyectiles, conos, auras y quemaduras de las superarmas. Lo llama weapons.renderWeapons. */
export function renderSuperFx(ctx, state, cam) {
  const st = stores.get(state);
  if (!st) return;
  viewRect(ctx, vr);
  rCtx = ctx;
  rNow = performance.now() * 0.001;
  rS = state;

  // balas de la minigun en un solo trazo por bala (estilo constante)
  ctx.save();
  ctx.lineCap = 'round';
  state.projectiles.forEach(drawBulletIf);
  ctx.restore();

  // cohetes, explosiones, tajos y rayos
  state.projectiles.forEach(drawSuperProj);

  // auras, conos de fuego y fogonazos de los jugadores con superarma
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.players.values()) {
    const sp = p.super;
    if (!sp) continue;
    const def = SUPERS[sp.type];
    if (!def) continue;
    if (p.x < vr.x0 || p.x > vr.x1 || p.y < vr.y0 || p.y > vr.y1) continue;
    const pulse = 0.5 + 0.5 * Math.sin(rNow * 5 + (p.pid | 0));
    const ar = (p.r || 14) * (2.4 + 0.3 * pulse);
    ctx.globalAlpha = 0.34 + 0.12 * pulse;
    ctx.drawImage(glowSprite('super-' + def.id, def.rgb), p.x - ar, p.y - ar, ar * 2, ar * 2);
    if (sp.type === 'lanzallamas' && sp.flameT > 0) drawFlame(p, sp);
    if (sp.flash > 0 && (sp.type === 'minigun' || sp.type === 'bazuca')) {
      const fr = sp.type === 'minigun' ? 24 : 34;
      const mx = p.x + Math.cos(sp.fa) * ((p.r || 14) + 14);
      const my = p.y + Math.sin(sp.fa) * ((p.r || 14) + 14);
      ctx.globalAlpha = Math.min(1, sp.flash * 14);
      ctx.drawImage(glowSprite('muzzle', '255,226,140'), mx - fr, my - fr, fr * 2, fr * 2);
    }
  }
  drawBurning(st);
  ctx.restore();
  rCtx = null;
  rS = null;
}

function drawBulletIf(pr) {
  if (pr.cc !== 2 || pr.k !== 'bullet') return;
  if (pr.x < vr.x0 || pr.x > vr.x1 || pr.y < vr.y0 || pr.y > vr.y1) return;
  drawBullet(pr);
}

// --- Flechas en el borde de la pantalla (espacio de pantalla, tras restaurar la cámara) ---

function toScreen(cam, wx, wy, out) {
  let r = null;
  out.x = NaN;
  out.y = NaN;
  if (cam && typeof cam.worldToScreen === 'function') r = cam.worldToScreen(wx, wy, out);
  let sx = NaN;
  let sy = NaN;
  if (Array.isArray(r)) { sx = r[0]; sy = r[1]; }
  else if (r && typeof r === 'object') { sx = r.x; sy = r.y; }
  else { sx = out.x; sy = out.y; }
  if (!isFinite(sx) || !isFinite(sy)) {
    // sin worldToScreen utilizable: se asume que cam.x / cam.y es la esquina superior izquierda
    sx = wx - (cam ? cam.x : 0);
    sy = wy - (cam ? cam.y : 0);
  }
  out.x = sx;
  out.y = sy;
  return out;
}

let aCtx = null;
let aCam = null;
let aW = 0;
let aH = 0;
let aNow = 0;
const ARROW_MX = 44; // margen lateral
const ARROW_MT = 86; // arriba (barra de oleada y vida)
const ARROW_MB = 112; // abajo (mochila y cooldowns)

function drawArrow(d) {
  if (d.kind !== 'super') return;
  const def = SUPERS[d.type];
  if (!def) return;
  toScreen(aCam, d.x, d.y, pt);
  const sx = pt.x;
  const sy = pt.y;
  if (sx >= 8 && sx <= aW - 8 && sy >= 8 && sy <= aH - 8) return; // ya se ve
  const cx = aW / 2;
  const cy = aH / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  if (dx === 0 && dy === 0) return;
  const kx = (cx - ARROW_MX) / Math.max(Math.abs(dx), 0.0001);
  const ky = (dy < 0 ? cy - ARROW_MT : aH - cy - ARROW_MB) / Math.max(Math.abs(dy), 0.0001);
  const k = Math.min(kx, ky);
  const ax = cx + dx * k;
  const ay = cy + dy * k;
  const ang = Math.atan2(dy, dx);
  const pulse = 0.5 + 0.5 * Math.sin(aNow * 6);
  const ctx = aCtx;
  ctx.save();
  ctx.translate(ax, ay);
  // halo
  ctx.globalAlpha = 0.5 + 0.3 * pulse;
  const hr = 34 + 5 * pulse;
  ctx.drawImage(glowSprite('super-' + def.id, def.rgb), -hr, -hr, hr * 2, hr * 2);
  // insignia
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(14,10,24,0.82)';
  ctx.beginPath();
  ctx.arc(0, 0, 19, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = def.color;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.drawImage(emoji(def.icon, 24), -12, -12, 24, 24);
  // punta apuntando a la superarma
  ctx.rotate(ang);
  ctx.fillStyle = def.color;
  ctx.beginPath();
  ctx.moveTo(32 + 3 * pulse, 0);
  ctx.lineTo(21, -9);
  ctx.lineTo(21, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Flechas en el borde de la pantalla hacia las superarmas fuera de cámara (espacio de pantalla). */
export function renderSuperArrows(ctx, state, cam, viewW, viewH) {
  const drops = state.drops;
  if (!drops || !drops.count) return;
  aCtx = ctx;
  aCam = cam;
  aW = viewW;
  aH = viewH;
  aNow = performance.now() * 0.001;
  drops.forEach(drawArrow);
  aCtx = null;
  aCam = null;
}
