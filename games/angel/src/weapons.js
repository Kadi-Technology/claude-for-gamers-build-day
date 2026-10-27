// Ángel Survivors · ANG-C · Armas base: Estaca, Látigo y Agua bendita (niveles 1-5, maestría por daño
// y evolución en el nivel 5). Combate MANUAL: nada ataca solo; attack() solo se llama con Y presionada
// y respeta la cadencia del arma (o de la superarma si p.super).
//
// Los proyectiles, charcos y estelas viven en state.projectiles con cc = 1 (los de superarmas, cc = 2).
// Ningún objeto nuevo por frame en caliente: pools del estado, arreglos reutilizados y callbacks hoisted.

import { isFree } from './world.js';
import { sprite } from '../../../shared/engine/sprites.js';
import { SUPERS, renderSuperFx } from './superweapons.js';
import {
  MAX_ER, dmgMul, aimInto, meleeSweep, newProj, freeProj, viewRect, glowSprite, mapOf, drawSlash,
} from './abilities.js';

const TAU = Math.PI * 2;
export const MAX_WEAPON_LVL = 5;
export const EVOLVE_LVL = 5;
const CARRY = 0.034; // s de adelanto de cadencia que se arrastran entre ataques (compensa el paso fijo)

// ---------------------------------------------------------------------------------------------
// Balance (ANG-G puede sobrescribirlo desde config.js con Object.assign al arrancar)
// Los arreglos van indexados por nivel: [nv1, nv2, nv3, nv4, nv5(evolución)].
// ---------------------------------------------------------------------------------------------
export const WEAPON_BALANCE = {
  mastery: [110, 240, 420, 650], // daño necesario para pasar de nv1→2, 2→3, 3→4 y 4→5
  estaca: {
    cadence: [0.42, 0.39, 0.36, 0.33, 0.30],
    dmg: [18, 21, 25, 30, 40],
    count: [1, 1, 2, 2, 3],       // estacas por disparo
    hits: [1, 2, 2, 3, 5],        // enemigos que atraviesa (nv5: golpes totales entre rebotes)
    spread: 0.16,                 // rad entre estacas del mismo disparo
    speed: 640, plataSpeed: 720,
    life: 0.95, plataLife: 1.3,
    r: 6,
    bounceR: 340,                 // alcance de rebote de la Estaca de Plata
  },
  latigo: {
    cadence: [0.62, 0.58, 0.54, 0.5, 0.46],
    dmg: [26, 31, 37, 44, 54],
    range: [100, 108, 118, 130, 155],
    half: [0.75, 0.85, 0.95, 1.1, 1.3], // semiancho del arco (rad)
    kb: [32, 36, 40, 46, 60],
    emberN: 5, emberLife: 1.7, emberR: 28, emberDps: 26, emberTick: 0.3, // estela de fuego (nv5)
  },
  agua: {
    cadence: [1.0, 0.95, 0.9, 0.85, 1.05],
    dps: [14, 18, 23, 29, 26],          // daño por segundo del charco
    radius: [72, 80, 88, 96, 82],
    dur: [3.0, 3.4, 3.8, 4.2, 4.6],
    tick: 0.4, throw: 240, minThrow: 90, maxThrow: 400, flight: 0.5,
    rain: 4, scatter: 150,              // Lluvia Bendita: frascos y dispersión
  },
};
const WB = WEAPON_BALANCE;

function clampLvl(l) {
  l = l | 0;
  return l < 1 ? 1 : l > MAX_WEAPON_LVL ? MAX_WEAPON_LVL : l;
}

// ---------------------------------------------------------------------------------------------
// Registro de armas
// ---------------------------------------------------------------------------------------------
export const WEAPONS = {
  estaca: {
    id: 'estaca', nombre: 'Estaca', icon: '🗡️', kind: 'proyectil', color: '#d9a15a',
    descripcion: 'Lanza estacas hacia donde apuntas; sube cantidad y perforación',
    cadence: (lvl) => WB.estaca.cadence[clampLvl(lvl) - 1],
    onAttack: estacaAttack,
    evolved: { nombre: 'Estaca de Plata', descripcion: 'Las estacas de plata rebotan entre enemigos' },
  },
  latigo: {
    id: 'latigo', nombre: 'Látigo', icon: '➰', kind: 'melee', color: '#c98a3a',
    descripcion: 'Barrido en arco frente a ti; sube ancho y daño',
    cadence: (lvl) => WB.latigo.cadence[clampLvl(lvl) - 1],
    onAttack: latigoAttack,
    evolved: { nombre: 'Látigo de Cempasúchil', descripcion: 'Cada barrido deja una estela de fuego' },
  },
  agua: {
    id: 'agua', nombre: 'Agua bendita', icon: '💧', kind: 'lanzable', color: '#5cc8ff',
    descripcion: 'Lanza un frasco al punto apuntado y deja un charco que quema',
    cadence: (lvl) => WB.agua.cadence[clampLvl(lvl) - 1],
    onAttack: aguaAttack,
    evolved: { nombre: 'Lluvia Bendita', descripcion: 'Llueven varios frascos a la vez' },
  },
};

export const WEAPON_IDS = ['estaca', 'latigo', 'agua'];

// ---------------------------------------------------------------------------------------------
// Maestría, niveles y evolución
// ---------------------------------------------------------------------------------------------
/** Daño de maestría que hace falta para salir del nivel `lvl` (en nivel 5 devuelve el tope). */
export function masteryMax(lvl) {
  const i = clampLvl(lvl) - 1;
  return WB.mastery[i > WB.mastery.length - 1 ? WB.mastery.length - 1 : i];
}

/** Fracción 0..1 de la barra de maestría (siempre 1 en el nivel 5). */
export function masteryFrac(w) {
  if (!w) return 0;
  if (w.lvl >= MAX_WEAPON_LVL) return 1;
  const f = w.mastery / masteryMax(w.lvl);
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

export function isEvolved(w) {
  return !!w && w.lvl >= EVOLVE_LVL;
}

/** Nombre a mostrar: el de la evolución si el arma está en nivel 5. */
export function weaponLabel(w) {
  if (!w) return '';
  const d = WEAPONS[w.id];
  if (!d) return String(w.id);
  return w.lvl >= EVOLVE_LVL ? d.evolved.nombre : d.nombre;
}

function announceLevel(p, w, api) {
  if (!api) return;
  const d = WEAPONS[w.id];
  if (w.lvl >= EVOLVE_LVL) {
    api.toast('¡' + d.nombre + ' evoluciona: ' + d.evolved.nombre + '!');
    api.sfx('levelup');
    api.shake(8, 240);
    api.spawnFx('ring', p.x, p.y, 0);
    api.spawnFx('petal', p.x, p.y, 0);
  } else {
    api.toast(d.nombre + ' nivel ' + w.lvl);
    api.sfx('levelup');
  }
}

/**
 * Suma `dmg` de maestría al arma `weaponId` del jugador; sube de nivel y evoluciona en el 5.
 * Los ids que no son armas de la mochila (superarmas, Campanazo) se ignoran: no dan maestría.
 */
export function addMastery(p, weaponId, dmg, api) {
  if (!p || !p.weapons || !(dmg > 0)) return;
  let w = null;
  for (let i = 0; i < p.weapons.length; i++) {
    const x = p.weapons[i];
    if (x && x.id === weaponId) { w = x; break; }
  }
  if (!w) return;
  if (w.lvl >= MAX_WEAPON_LVL) {
    w.mastery = masteryMax(MAX_WEAPON_LVL);
    return;
  }
  w.mastery += dmg;
  let leveled = false;
  while (w.lvl < MAX_WEAPON_LVL && w.mastery >= masteryMax(w.lvl)) {
    w.mastery -= masteryMax(w.lvl);
    w.lvl++;
    leveled = true;
  }
  if (w.lvl >= MAX_WEAPON_LVL) w.mastery = masteryMax(MAX_WEAPON_LVL);
  if (leveled) announceLevel(p, w, api);
}

/** +1 nivel directo (carta de level-up). Devuelve true si subió. */
export function levelUpWeapon(p, weaponId, api) {
  if (!p || !p.weapons) return false;
  for (let i = 0; i < p.weapons.length; i++) {
    const w = p.weapons[i];
    if (w && w.id === weaponId) {
      if (w.lvl >= MAX_WEAPON_LVL) return false;
      w.lvl++;
      w.mastery = w.lvl >= MAX_WEAPON_LVL ? masteryMax(MAX_WEAPON_LVL) : 0;
      announceLevel(p, w, api);
      return true;
    }
  }
  return false;
}

/**
 * Pone el arma en el primer espacio libre de la mochila (nv 1, maestría 0). Si ya la tiene devuelve
 * su espacio. Devuelve el espacio 0..2 o -1 si el id no existe o la mochila está llena.
 */
export function grantWeapon(p, id) {
  if (!p || !WEAPONS[id]) return -1;
  if (!p.weapons) p.weapons = [null, null, null];
  while (p.weapons.length < 3) p.weapons.push(null);
  for (let i = 0; i < 3; i++) {
    if (p.weapons[i] && p.weapons[i].id === id) return i;
  }
  for (let i = 0; i < 3; i++) {
    if (!p.weapons[i]) {
      p.weapons[i] = { id, lvl: 1, mastery: 0 };
      return i;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------
// Ataque (Y): respeta la cadencia y usa la superarma si p.super
// ---------------------------------------------------------------------------------------------
const aimBuf = { x: 1, y: 0, dist: 0 };

/**
 * Intenta atacar con el arma activa (o la superarma). `aim` = {x,y} dirección de apuntado
 * (opcional `dist` = distancia al punto apuntado, para el frasco). Devuelve true si disparó.
 * Solo debe llamarse cuando la tecla Y está presionada.
 */
export function attack(state, p, aim, api) {
  if (!p || p.down) return false;
  let cd = p.cooldowns;
  if (!cd) cd = p.cooldowns = { attack: 0, bell: 0, dash: 0 };
  if (cd.attack > 0.0001) return false;
  const carry = cd.attack < -CARRY ? -CARRY : cd.attack;
  aimInto(aimBuf, p, aim || p.aim);
  const sp = p.super;
  if (sp) {
    const sd = SUPERS[sp.type];
    if (sd) {
      sd.onAttack(state, p, aimBuf, api);
      cd.attack = sd.cadence + carry;
      return true;
    }
  }
  const w = p.weapons ? p.weapons[p.active] : null;
  if (!w) return false;
  const def = WEAPONS[w.id];
  if (!def) return false;
  def.onAttack(state, p, aimBuf, api);
  cd.attack = def.cadence(w.lvl) + carry;
  return true;
}

function estacaAttack(state, p, aim, api) {
  const w = p.weapons[p.active];
  const lv = clampLvl(w.lvl);
  const B = WB.estaca;
  const ev = lv >= EVOLVE_LVL;
  const n = B.count[lv - 1];
  const base = Math.atan2(aim.y, aim.x);
  const dmg = B.dmg[lv - 1] * dmgMul(p);
  const speed = ev ? B.plataSpeed : B.speed;
  const off = (p.r || 14) + 8;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * B.spread;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    const pr = newProj(state, 1, 'bolt', p.pid, p.x + cs * off, p.y + sn * off);
    if (!pr) break;
    pr.vx = cs * speed;
    pr.vy = sn * speed;
    pr.r = B.r;
    pr.dmg = dmg;
    pr.life = pr.max = ev ? B.plataLife : B.life;
    pr.hl = B.hits[lv - 1];
    pr.ev = ev ? 1 : 0;
    pr.lv = lv;
    pr.wid = 'estaca';
  }
  api.sfx('shoot');
}

function latigoAttack(state, p, aim, api) {
  const w = p.weapons[p.active];
  const lv = clampLvl(w.lvl);
  const B = WB.latigo;
  const ev = lv >= EVOLVE_LVL;
  const a = Math.atan2(aim.y, aim.x);
  const range = B.range[lv - 1];
  const half = B.half[lv - 1];
  const dm = dmgMul(p);
  const pr = newProj(state, 1, 'arc', p.pid, p.x, p.y);
  if (pr) {
    pr.ang = a;
    pr.arc = half;
    pr.len = range;
    pr.life = pr.max = 0.2;
    pr.ev = ev ? 1 : 0;
  }
  api.spawnFx('slash', p.x, p.y, a);
  api.sfx('shoot');
  if (ev) {
    // estela de fuego a lo largo del arco
    const N = B.emberN;
    for (let i = 0; i < N; i++) {
      const ea = a + ((i / (N - 1)) * 2 - 1) * half * 0.85;
      const ex = p.x + Math.cos(ea) * range * 0.78;
      const ey = p.y + Math.sin(ea) * range * 0.78;
      const em = newProj(state, 1, 'ember', p.pid, ex, ey);
      if (!em) break;
      em.r = B.emberR;
      em.dmg = B.emberDps * B.emberTick * dm;
      em.life = em.max = B.emberLife;
      em.tk = 0.12 + 0.1 * (i / N);
      em.ev = 1;
      em.lv = lv;
      em.wid = 'latigo';
      if (i % 2 === 0) api.spawnFx('fire', ex, ey, 0);
    }
  }
  // el golpe se aplica al final: la maestría puede subir de nivel durante el barrido
  meleeSweep(state, api, p, aim.x, aim.y, range, half, B.dmg[lv - 1] * dm, 'latigo', B.kb[lv - 1], null);
}

function aguaAttack(state, p, aim, api) {
  const w = p.weapons[p.active];
  const lv = clampLvl(w.lvl);
  const B = WB.agua;
  const ev = lv >= EVOLVE_LVL;
  let dist = aim.dist > 0 ? aim.dist : B.throw;
  dist = dist < B.minThrow ? B.minThrow : dist > B.maxThrow ? B.maxThrow : dist;
  let tx = p.x + aim.x * dist;
  let ty = p.y + aim.y * dist;
  const map = mapOf(api, state);
  if (map) {
    // si el punto cae dentro de un obstáculo se acerca al jugador hasta encontrar suelo libre
    let k = 0;
    while (k < 12 && dist > 40 && !isFree(map, tx, ty, 8)) {
      dist -= 28;
      tx = p.x + aim.x * dist;
      ty = p.y + aim.y * dist;
      k++;
    }
  }
  const count = ev ? B.rain : 1;
  const rng = api.rng;
  const dm = dmgMul(p);
  for (let i = 0; i < count; i++) {
    let fx = tx;
    let fy = ty;
    if (i > 0) {
      const ang = rng.next() * TAU;
      const rad = Math.sqrt(rng.next()) * B.scatter;
      fx = tx + Math.cos(ang) * rad;
      fy = ty + Math.sin(ang) * rad;
      if (map && !isFree(map, fx, fy, 8)) { fx = tx; fy = ty; }
    }
    const pr = newProj(state, 1, 'flask', p.pid, p.x, p.y);
    if (!pr) break;
    pr.sx = p.x;
    pr.sy = p.y;
    pr.tx = fx;
    pr.ty = fy;
    pr.max = B.flight + i * 0.08;
    pr.tk = 0;
    pr.ev = ev ? 1 : 0;
    pr.lv = lv;
    pr.wid = 'agua';
    pr.r = B.radius[lv - 1];       // radio del charco
    pr.len = B.dur[lv - 1];        // duración del charco
    pr.dmg = B.dps[lv - 1] * B.tick * dm; // daño por pulso
  }
  api.sfx('shoot');
}

// ---------------------------------------------------------------------------------------------
// Estado propio por partida
// ---------------------------------------------------------------------------------------------
const stores = new WeakMap();

function store(state) {
  let s = stores.get(state);
  if (!s) {
    s = { rel: [], q: [], q2: [], splashCd: 0 };
    stores.set(state, s);
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Actualización (paso 4 del tick)
// ---------------------------------------------------------------------------------------------
let cS = null;
let cDt = 0;
let cApi = null;
let cSt = null;
let cMap = null;

function keyOf(e) {
  return e.id !== undefined ? e.id : e;
}

/** Tras un golpe, la Estaca de Plata se redirige al enemigo más cercano que aún no haya golpeado. */
function bounceFrom(pr, from) {
  const api = cApi;
  const st = cSt;
  st.q2.length = 0;
  const list = api.enemiesNear(from.x, from.y, WB.estaca.bounceR, st.q2);
  let best = null;
  let bd = 1e18;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t === from || !(t.hp > 0)) continue;
    if (pr.hit.indexOf(keyOf(t)) !== -1) continue;
    const dx = t.x - from.x;
    const dy = t.y - from.y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = t; }
  }
  if (!best) return false;
  const a = Math.atan2(best.y - from.y, best.x - from.x);
  pr.x = from.x;
  pr.y = from.y;
  pr.vx = Math.cos(a) * WB.estaca.plataSpeed;
  pr.vy = Math.sin(a) * WB.estaca.plataSpeed;
  if (pr.life < 0.6) pr.life = 0.6;
  api.spawnFx('hit', from.x, from.y, a);
  return true;
}

function stepBolt(pr) {
  const api = cApi;
  const dt = cDt;
  const st = cSt;
  pr.life -= dt;
  const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
  const n = Math.max(1, Math.ceil((sp * dt) / 14));
  const sdt = dt / n;
  for (let s = 0; s < n; s++) {
    pr.x += pr.vx * sdt;
    pr.y += pr.vy * sdt;
    if (cMap && !isFree(cMap, pr.x, pr.y, 2)) {
      api.spawnFx('hit', pr.x, pr.y, 0);
      pr.life = 0;
      return;
    }
    st.q.length = 0;
    const list = api.enemiesNear(pr.x, pr.y, pr.r + MAX_ER, st.q);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!(e.hp > 0)) continue;
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      const rr = (e.r || 12) + pr.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      const key = keyOf(e);
      if (pr.hit.indexOf(key) !== -1) continue;
      pr.hit.push(key);
      api.damageEnemy(e, pr.dmg, pr.own, 'estaca');
      pr.hl--;
      if (pr.hl <= 0) { pr.life = 0; return; }
      if (pr.ev) bounceFrom(pr, e);
      break; // la lista pudo quedar obsoleta: se reconsulta en el siguiente subpaso
    }
  }
}

function stepFlask(pr) {
  const api = cApi;
  pr.tk += cDt;
  const u = pr.tk / pr.max;
  if (u < 1) {
    pr.x = pr.sx + (pr.tx - pr.sx) * u;
    pr.y = pr.sy + (pr.ty - pr.sy) * u;
    return;
  }
  // aterriza: el mismo objeto pasa a ser un charco
  pr.k = 'puddle';
  pr.x = pr.tx;
  pr.y = pr.ty;
  pr.life = pr.max = pr.len;
  pr.tk = 0.05;
  api.spawnFx('splash', pr.x, pr.y, 0);
  if (cSt.splashCd <= 0) {
    api.sfx('splash');
    cSt.splashCd = 0.12;
  }
}

/** Charcos (agua) y brasas (látigo evolucionado): daño por pulso en un círculo. */
function stepZone(pr, tick) {
  const api = cApi;
  pr.life -= cDt;
  if (pr.life <= 0) return;
  pr.tk -= cDt;
  if (pr.tk > 0) return;
  pr.tk += tick;
  const st = cSt;
  st.q.length = 0;
  const list = api.enemiesNear(pr.x, pr.y, pr.r + MAX_ER, st.q);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!(e.hp > 0)) continue;
    const dx = e.x - pr.x;
    const dy = e.y - pr.y;
    const rr = pr.r + (e.r || 12) * 0.5;
    if (dx * dx + dy * dy <= rr * rr) api.damageEnemy(e, pr.dmg, pr.own, pr.wid);
  }
}

function projStep(pr) {
  if (pr.cc !== 1) return;
  switch (pr.k) {
    case 'bolt': stepBolt(pr); break;
    case 'flask': stepFlask(pr); break;
    case 'puddle': stepZone(pr, WB.agua.tick); break;
    case 'ember': stepZone(pr, WB.latigo.emberTick); break;
    default: {
      // 'arc' (tajo visual): sigue al jugador mientras dura
      pr.life -= cDt;
      const o = cS.players.get(pr.own);
      if (o) { pr.x = o.x; pr.y = o.y; }
      break;
    }
  }
  if (pr.life <= 0) cSt.rel.push(pr);
}

/** Cooldown de ataque, estacas en vuelo, frascos, charcos y estelas de fuego. */
export function updateWeapons(state, dt, api) {
  const st = store(state);
  if (st.splashCd > 0) st.splashCd -= dt;
  for (const p of state.players.values()) {
    const cd = p.cooldowns;
    if (!cd) continue;
    if (cd.attack > -CARRY) {
      const v = cd.attack - dt;
      cd.attack = v < -CARRY ? -CARRY : v;
    }
  }
  const pool = state.projectiles;
  if (!pool) return;
  cS = state; cDt = dt; cApi = api; cSt = st; cMap = mapOf(api, state);
  pool.forEach(projStep);
  const rel = st.rel;
  for (let i = 0; i < rel.length; i++) freeProj(state, rel[i]);
  rel.length = 0;
  cS = null; cApi = null; cSt = null; cMap = null;
}

// ---------------------------------------------------------------------------------------------
// Render (coordenadas de mundo: main.js ya aplicó la cámara)
// ---------------------------------------------------------------------------------------------
const SS = 2;
const vr = { x0: 0, y0: 0, x1: 0, y1: 0 };
const spr = { stake: null, plata: null, flask: null, flaskEv: null, puddle: null, puddleEv: null };
let rCtx = null;
let rNow = 0;
const dashPat = [8, 8];

function stakeSprite(silver) {
  const key = silver ? 'plata' : 'stake';
  if (spr[key]) return spr[key];
  const W = 44;
  const H = 12;
  spr[key] = sprite(silver ? 'cfg-estaca-plata' : 'cfg-estaca', W * SS, H * SS, (g) => {
    g.scale(SS, SS);
    // astil
    const sh = g.createLinearGradient(0, 0, 0, H);
    if (silver) {
      sh.addColorStop(0, '#f4f8ff');
      sh.addColorStop(0.5, '#aebdd6');
      sh.addColorStop(1, '#7283a0');
    } else {
      sh.addColorStop(0, '#d49a58');
      sh.addColorStop(0.5, '#a56a2e');
      sh.addColorStop(1, '#6e421a');
    }
    g.fillStyle = sh;
    g.fillRect(4, 3, 28, 6);
    // punta
    g.beginPath();
    g.moveTo(32, 1.5);
    g.lineTo(W - 0.5, H / 2);
    g.lineTo(32, H - 1.5);
    g.closePath();
    g.fillStyle = silver ? '#ffffff' : '#f6e7c8';
    g.fill();
    // plumas
    g.fillStyle = silver ? '#7fb8ff' : '#d8402e';
    g.beginPath();
    g.moveTo(0, 0.5); g.lineTo(8, H / 2); g.lineTo(0, H - 0.5); g.lineTo(3, H / 2);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(20,10,0,0.55)';
    g.lineWidth = 0.7;
    g.strokeRect(4, 3, 28, 6);
  });
  return spr[key];
}

function flaskSprite(ev) {
  const key = ev ? 'flaskEv' : 'flask';
  if (spr[key]) return spr[key];
  const S = 22;
  spr[key] = sprite(ev ? 'cfg-frasco-ev' : 'cfg-frasco', S * SS, S * SS, (g) => {
    g.scale(SS, SS);
    // cuerpo
    g.beginPath();
    g.moveTo(8, 4);
    g.lineTo(14, 4);
    g.lineTo(14, 8);
    g.quadraticCurveTo(19, 11, 18, 16);
    g.quadraticCurveTo(17, 20.5, 11, 20.5);
    g.quadraticCurveTo(5, 20.5, 4, 16);
    g.quadraticCurveTo(3, 11, 8, 8);
    g.closePath();
    g.fillStyle = ev ? 'rgba(255,238,170,0.95)' : 'rgba(120,205,255,0.95)';
    g.fill();
    g.lineWidth = 1.2;
    g.strokeStyle = ev ? '#b8862a' : '#2b6fb0';
    g.stroke();
    // brillo
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.beginPath();
    g.ellipse(8, 14, 1.6, 3.6, 0.3, 0, TAU);
    g.fill();
    // corcho
    g.fillStyle = '#b07a3c';
    g.fillRect(7.5, 1.5, 7, 3.5);
    // cruz bendita
    g.strokeStyle = ev ? '#8a5a00' : '#ffffff';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(11, 11); g.lineTo(11, 17);
    g.moveTo(8.5, 13.5); g.lineTo(13.5, 13.5);
    g.stroke();
  });
  return spr[key];
}

function puddleSprite(ev) {
  const key = ev ? 'puddleEv' : 'puddle';
  if (spr[key]) return spr[key];
  const S = 160;
  spr[key] = sprite(ev ? 'cfg-charco-ev' : 'cfg-charco', S, S, (g) => {
    const c = S / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    if (ev) {
      grd.addColorStop(0, 'rgba(255,246,200,0.55)');
      grd.addColorStop(0.7, 'rgba(255,214,110,0.38)');
      grd.addColorStop(0.92, 'rgba(255,224,140,0.6)');
      grd.addColorStop(1, 'rgba(255,224,140,0)');
    } else {
      grd.addColorStop(0, 'rgba(170,225,255,0.5)');
      grd.addColorStop(0.7, 'rgba(70,150,255,0.34)');
      grd.addColorStop(0.92, 'rgba(130,205,255,0.6)');
      grd.addColorStop(1, 'rgba(130,205,255,0)');
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  });
  return spr[key];
}

function offscreen(x, y, m) {
  return x < vr.x0 - m || x > vr.x1 + m || y < vr.y0 - m || y > vr.y1 + m;
}

function drawBolt(pr) {
  if (offscreen(pr.x, pr.y, 0)) return;
  const ctx = rCtx;
  const a = Math.atan2(pr.vy, pr.vx);
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.rotate(a);
  // estela de movimiento
  ctx.globalAlpha = pr.ev ? 0.5 : 0.32;
  ctx.fillStyle = pr.ev ? '#cfe3ff' : '#ffd9a0';
  ctx.beginPath();
  ctx.moveTo(-18, -3);
  ctx.lineTo(-78, 0);
  ctx.lineTo(-18, 3);
  ctx.closePath();
  ctx.fill();
  if (pr.ev) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.65;
    ctx.drawImage(glowSprite('plata', '170,205,255'), -44, -26, 88, 52);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(stakeSprite(!!pr.ev), -22, -6, 44, 12);
  ctx.restore();
}

const WHIP_PAL = { cols: ['#8a5524', '#f0b45e', '#fff4d6'], w: [16, 9, 3.5], glow: null };
const WHIP_PAL_EVO = { cols: ['#ff6a10', '#ffc02e', '#fff8dc'], w: [24, 13, 5], glow: null };

function drawArc(pr) {
  if (offscreen(pr.x, pr.y, pr.len)) return;
  const ctx = rCtx;
  const fade = pr.life / pr.max;
  const u = 1 - fade;
  ctx.save();
  if (pr.ev) {
    if (!WHIP_PAL_EVO.glow) WHIP_PAL_EVO.glow = glowSprite('flame-y', '255,236,130');
    ctx.globalCompositeOperation = 'lighter';
    drawSlash(ctx, pr.x, pr.y, pr.len * 0.82, pr.ang, pr.arc, u, fade, WHIP_PAL_EVO, false);
  } else {
    if (!WHIP_PAL.glow) WHIP_PAL.glow = glowSprite('whip-tip', '255,226,170');
    drawSlash(ctx, pr.x, pr.y, pr.len * 0.82, pr.ang, pr.arc, u, fade, WHIP_PAL, false);
  }
  ctx.restore();
}

function drawEmber(pr) {
  if (offscreen(pr.x, pr.y, pr.r * 2)) return;
  const ctx = rCtx;
  const fade = pr.life < 0.45 ? pr.life / 0.45 : 1;
  const fl = 0.85 + 0.3 * Math.sin(rNow * 18 + pr.x * 0.13 + pr.y * 0.07);
  const rad = pr.r * 1.5 * fl;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.62 * fade;
  ctx.drawImage(glowSprite('flame-o', '255,140,40'), pr.x - rad, pr.y - rad, rad * 2, rad * 2);
  const r2 = rad * 0.42;
  ctx.globalAlpha = 0.7 * fade;
  ctx.drawImage(glowSprite('flame-y', '255,236,130'), pr.x - r2, pr.y - r2 - 2, r2 * 2, r2 * 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawFlask(pr) {
  const ctx = rCtx;
  const u = pr.tk / pr.max;
  const h = Math.sin(Math.PI * (u > 1 ? 1 : u)) * 74;
  // marca del punto de caída
  if (!offscreen(pr.tx, pr.ty, pr.r)) {
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.2 * Math.sin(rNow * 9);
    ctx.strokeStyle = pr.ev ? '#ffe08a' : '#8fd6ff';
    ctx.lineWidth = 2;
    ctx.setLineDash(dashPat);
    ctx.lineDashOffset = -rNow * 24;
    ctx.beginPath();
    ctx.arc(pr.tx, pr.ty, pr.r * (0.55 + 0.45 * u), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  if (offscreen(pr.x, pr.y - h, 20)) return;
  // sombra
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(pr.x, pr.y, 8, 4, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(pr.x, pr.y - h);
  ctx.rotate(u * 9);
  ctx.drawImage(flaskSprite(!!pr.ev), -14, -14, 28, 28);
  ctx.restore();
}

function drawPuddle(pr) {
  if (offscreen(pr.x, pr.y, pr.r)) return;
  const ctx = rCtx;
  const fade = pr.life < 0.6 ? pr.life / 0.6 : 1;
  const born = pr.max - pr.life;
  const grow = born < 0.18 ? born / 0.18 : 1;
  const r = pr.r * (0.35 + 0.65 * grow);
  ctx.globalAlpha = fade;
  ctx.drawImage(puddleSprite(!!pr.ev), pr.x - r, pr.y - r, r * 2, r * 2);
  // ondas
  ctx.strokeStyle = pr.ev ? '#fff1b8' : '#d6f1ff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    const f = (rNow * 0.7 + i * 0.5 + pr.x * 0.003) % 1;
    ctx.globalAlpha = fade * 0.45 * (1 - f);
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, r * (0.2 + 0.7 * f), 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Primera pasada: lo que va pegado al suelo (charcos y brasas). */
function drawGround(pr) {
  if (pr.cc !== 1) return;
  if (pr.k === 'puddle') drawPuddle(pr);
  else if (pr.k === 'ember') drawEmber(pr);
}

/** Segunda pasada: lo que vuela o golpea por encima. */
function drawAir(pr) {
  if (pr.cc !== 1) return;
  switch (pr.k) {
    case 'bolt': drawBolt(pr); break;
    case 'arc': drawArc(pr); break;
    case 'flask': drawFlask(pr); break;
    default: break;
  }
}

/** Dibuja charcos y estelas (debajo), estacas, tajos y frascos; luego los efectos de superarma. */
export function renderWeapons(ctx, state, cam) {
  const pool = state.projectiles;
  if (!pool) return;
  viewRect(ctx, vr);
  rCtx = ctx;
  rNow = performance.now() * 0.001;
  if (pool.count) {
    pool.forEach(drawGround);
    pool.forEach(drawAir);
  }
  rCtx = null;
  renderSuperFx(ctx, state, cam);
}
