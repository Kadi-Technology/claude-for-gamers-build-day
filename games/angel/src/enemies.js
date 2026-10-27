// enemies.js (ANG-G) - Enemigos de Ángel Survivors (GDD §1.6): chupacabras, murciélago, nahual y la jefa La Llorona.
// IA de persecución con separación por rejilla espacial, anillo de gritos, invocaciones y render con sprites en caché.
// Sin objetos nuevos por frame en caliente: callbacks de módulo, arreglos reutilizados y pools.

import { sprite, emoji } from '../../../shared/engine/sprites.js';
import { emit } from '../../../shared/engine/bus.js';
import { collideWithMap } from './world.js';
import { hurtPlayer } from './player.js';
import { CONFIG } from './config.js';

const TAU = Math.PI * 2;
const E = CONFIG.enemies;

export const ENEMY_TYPES = Object.keys(E);

// ---------------------------------------------------------------------------
// Escalado
// ---------------------------------------------------------------------------
export function coopScale(state) {
  return 1 + CONFIG.coop.scale * Math.max(0, state.players.size - 1);
}

const SC = { hp: 1, dmg: 1, spd: 1 };
/** Multiplicadores por oleada (y por jugadores). Devuelve un objeto compartido: léelo de inmediato. */
export function scaleFor(state) {
  const n = Math.max(0, state.wave - 1);
  const S = CONFIG.scaling;
  SC.hp = (1 + S.hpPerWave * n) * coopScale(state);
  SC.dmg = 1 + S.dmgPerWave * n;
  SC.spd = Math.min(S.spdCap, 1 + S.spdPerWave * n);
  return SC;
}

// ---------------------------------------------------------------------------
// Alta y baja
// ---------------------------------------------------------------------------
/** opts: { frozen, level }. Devuelve el enemigo o null si el tipo no existe. */
export function spawnEnemy(state, type, x, y, opts) {
  const T = E[type];
  if (!T) return null;
  const e = state.enemies.acquire();
  if (!e) return null;
  const sc = scaleFor(state);
  const boss = type === 'llorona';
  const lvl = (opts && opts.level) || 1;
  e.id = state.nextId++;
  e.type = type;
  e.x = x;
  e.y = y;
  e.r = T.r;
  e.vx = 0;
  e.vy = 0;
  e.dead = false;
  e.boss = boss;
  e.frozen = !!(opts && opts.frozen);
  const v = (e.id * 0.6180339887) % 1;
  e.hpMax = boss ? T.hp * Math.pow(T.hpGrow, lvl - 1) * coopScale(state) : T.hp * sc.hp;
  e.hp = e.hpMax;
  e.spd = T.speed * (boss ? 1 : sc.spd) * (boss ? 1 : 0.92 + 0.16 * v);
  e.dmg = T.dmg * sc.dmg;
  e.xp = T.xp;
  e.mass = T.mass;
  e.accel = T.accel;
  e.t = v * 3;
  e.ph = v * TAU;
  e.flash = 0;
  e.fl = v < 0.5 ? 0 : 1;
  e.cd = 0;
  e.avoidT = 0;
  e.avoidDir = v < 0.5 ? 1 : -1;
  e.chk = 0.3 + v * 0.3;
  e.sx = x;
  e.sy = y;
  e.lvl = lvl;
  e.ringT = boss ? T.firstRing : 0;
  e.sumT = boss ? T.firstSummon : 0;
  e.tele = 0;
  e.ringOff = 0;
  e.strafe = 1;
  e.enr = 0;
  e.numT = 0;
  e.dmgAcc = 0;
  e._kb = null;
  e.bw = 0;
  return e;
}

/** Marca un enemigo como muerto; se libera del pool al inicio del siguiente tick. */
export function markDead(state, e) {
  if (e.dead) return;
  e.dead = true;
  if (e.hp > 0) e.hp = 0;
  state.deadList.push(e);
  if (state.boss === e) state.boss = null;
}

/** Libera los muertos del tick anterior. */
export function flushDead(state) {
  const list = state.deadList;
  for (let i = 0; i < list.length; i++) state.enemies.release(list[i]);
  list.length = 0;
}

/** Quita a un enemigo sin recompensas (saltar oleada, reinicios). */
export function removeEnemy(state, e) {
  markDead(state, e);
}

// ---------------------------------------------------------------------------
// Disparos de la jefa ("gritos")
// ---------------------------------------------------------------------------
export function fireShot(state, x, y, ang, speed, dmg, life, r) {
  const shots = state.shots;
  const n = shots.length;
  let s = null;
  for (let i = 0; i < n; i++) {
    const k = (state.shotIdx + i) % n;
    if (!shots[k].on) {
      s = shots[k];
      state.shotIdx = (k + 1) % n;
      break;
    }
  }
  if (!s) return null;
  s.on = true;
  s.x = x;
  s.y = y;
  s.vx = Math.cos(ang) * speed;
  s.vy = Math.sin(ang) * speed;
  s.r = r || 9;
  s.life = life;
  s.dmg = dmg;
  return s;
}

export function clearShots(state) {
  for (let i = 0; i < state.shots.length; i++) state.shots[i].on = false;
}

export function countShots(state) {
  let n = 0;
  for (let i = 0; i < state.shots.length; i++) if (state.shots[i].on) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Actualización
// ---------------------------------------------------------------------------
let S = null;
let DT = 0;
let API = null;
let MAP = null;
const TG = [];
const NB = [];
const SUMMONS = [];
let MX = 0;
let MY = 0;
let MS = 0;

function nearestTarget(e) {
  let best = TG[0];
  if (TG.length === 1) return best;
  let bd = Infinity;
  for (let i = 0; i < TG.length; i++) {
    const p = TG[i];
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Aplica un golpe al jugador: daño con i-frames, empuje y juice. Devuelve true si entró. */
export function hitPlayer(state, api, p, dmg, nx, ny, push) {
  if (state.god) return false;
  if (!hurtPlayer(p, dmg)) return false;
  p.lastHurt = state.time;
  if (push > 0) {
    p.vx += nx * push;
    p.vy += ny * push;
  }
  api.sfx('hit');
  api.shake(CONFIG.juice.shakeHurt[0], CONFIG.juice.shakeHurt[1]);
  state.hurtFlash = 0.3;
  emit('player:hit', { pid: p.pid, dmg });
  return true;
}

function touch(e, p, dx, dy) {
  if (e.type === 'nahual' && e.cd > 0) return;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  const push = e.type === 'nahual' ? E.nahual.push : e.boss ? 520 : 200;
  if (hitPlayer(S, API, p, e.dmg, nx, ny, push) && e.type === 'nahual') e.cd = E.nahual.pushCd;
}

function bossBrain(e, tg, d, nx, ny) {
  const T = E.llorona;
  MS = e.spd;
  MX = nx;
  MY = ny;
  const want = T.distance;
  if (e.tele > 0) {
    MS = e.spd * 0.25;
  } else if (d > want + 70) {
    MS = e.spd;
  } else if (d < want - 70) {
    MX = -nx;
    MY = -ny;
    MS = e.spd * 0.8;
  } else {
    MX = -ny * e.strafe;
    MY = nx * e.strafe;
    MS = e.spd * 0.65;
    if (((e.t * 0.35) | 0) % 2 === 0) e.strafe = 1;
    else e.strafe = -1;
  }
  const half = e.hp < e.hpMax * 0.5 ? 0.75 : 1;
  const grow = 1 + 0.12 * (e.lvl - 1);

  if (e.tele > 0) {
    e.tele -= DT;
    if (e.tele <= 0) {
      fireRing(e);
      e.ringT = (T.ringEvery / grow) * half;
    }
  } else {
    e.ringT -= DT;
    if (e.ringT <= 0) {
      e.tele = T.telegraph;
      API.sfx('boss');
      API.spawnFx('ring', e.x, e.y, 0);
    }
  }
  e.sumT -= DT;
  if (e.sumT <= 0) {
    e.sumT = T.summonEvery * half;
    SUMMONS.push(e);
  }
}

function fireRing(e) {
  const T = E.llorona;
  const n = Math.min(30, T.ringShots + 2 * (e.lvl - 1));
  const sp = T.ringSpeed * (1 + 0.06 * (e.lvl - 1));
  const dmg = T.ringDmg * (1 + 0.1 * (e.lvl - 1));
  const off = e.ringOff;
  e.ringOff += Math.PI / n;
  for (let i = 0; i < n; i++) {
    fireShot(S, e.x, e.y, off + (i / n) * TAU, sp, dmg, T.ringLife, 9);
  }
  API.spawnFx('explosion', e.x, e.y, 0);
  API.shake(CONFIG.juice.shakeBoss[0] * 0.6, 220);
}

function separate(e) {
  const g = S.grid;
  NB.length = 0;
  g.query(e.x, e.y, e.r + 4, NB);
  let px = 0;
  let py = 0;
  const n = NB.length > 12 ? 12 : NB.length;
  for (let i = 0; i < n; i++) {
    const o = NB[i];
    if (o === e || o.dead) continue;
    let ox = e.x - o.x;
    let oy = e.y - o.y;
    const min = e.r + o.r;
    const d2 = ox * ox + oy * oy;
    if (d2 >= min * min) continue;
    let d = Math.sqrt(d2);
    if (d < 0.01) {
      const a = e.ph + o.id;
      ox = Math.cos(a);
      oy = Math.sin(a);
      d = 1;
    }
    const w = o.mass / (e.mass + o.mass);
    const k = ((min - d) * w) / d;
    px += ox * k;
    py += oy * k;
  }
  e.x += px * 0.65;
  e.y += py * 0.65;
}

function stepEnemy(e) {
  if (e.dead) return;
  if (e.flash > 0) e.flash -= DT;
  if (e.numT > 0) e.numT -= DT;
  if (e.frozen) return;
  e.t += DT;
  if (e.cd > 0) e.cd -= DT;

  const tg = nearestTarget(e);
  const dx = tg.x - e.x;
  const dy = tg.y - e.y;
  let d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) d = 0.001;
  let nx = dx / d;
  let ny = dy / d;
  let speed = e.spd;

  if (e.type === 'murcielago') {
    const T = E.murcielago;
    const amp = d > 90 ? T.zigAmp : T.zigAmp * 0.25;
    const o = Math.sin(e.t * T.zigFreq + e.ph) * amp;
    const c = Math.cos(o);
    const s = Math.sin(o);
    const tx = nx * c - ny * s;
    ny = nx * s + ny * c;
    nx = tx;
  } else if (e.boss) {
    bossBrain(e, tg, d, nx, ny);
    nx = MX;
    ny = MY;
    speed = MS;
  }

  // Rodeo de obstáculos: si lleva rato sin avanzar, gira ±70° durante un momento.
  if (e.avoidT > 0) {
    e.avoidT -= DT;
    const a = e.avoidDir * 1.2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tx = nx * c - ny * s;
    ny = nx * s + ny * c;
    nx = tx;
  }

  const k = DT * e.accel > 1 ? 1 : DT * e.accel;
  e.vx += (nx * speed - e.vx) * k;
  e.vy += (ny * speed - e.vy) * k;
  e.x += e.vx * DT;
  e.y += e.vy * DT;

  if (!e.boss) separate(e);
  collideWithMap(e, MAP);

  e.chk -= DT;
  if (e.chk <= 0) {
    e.chk = 0.4;
    const mx = e.x - e.sx;
    const my = e.y - e.sy;
    if (e.avoidT <= 0 && d > e.r + tg.r + 40 && mx * mx + my * my < speed * speed * 0.0125) {
      e.avoidT = 0.8;
      e.avoidDir = -e.avoidDir;
    }
    e.sx = e.x;
    e.sy = e.y;
  }

  // Contacto con jugadores
  for (let i = 0; i < TG.length; i++) {
    const p = TG[i];
    const rr = p.r + e.r - 2;
    const ddx = p.x - e.x;
    const ddy = p.y - e.y;
    if (ddx * ddx + ddy * ddy < rr * rr) touch(e, p, ddx, ddy);
  }
}

function updateShots() {
  const shots = S.shots;
  const w = MAP.w;
  const h = MAP.h;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (!s.on) continue;
    s.life -= DT;
    s.x += s.vx * DT;
    s.y += s.vy * DT;
    if (s.life <= 0 || s.x < -40 || s.y < -40 || s.x > w + 40 || s.y > h + 40) {
      s.on = false;
      continue;
    }
    for (let j = 0; j < TG.length; j++) {
      const p = TG[j];
      const rr = p.r + s.r;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (dx * dx + dy * dy < rr * rr) {
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        // Si el jugador esquiva o tiene i-frames, hitPlayer devuelve false y el grito lo atraviesa.
        if (hitPlayer(S, API, p, s.dmg, dx / d, dy / d, 260)) s.on = false;
        break;
      }
    }
  }
}

/** Paso 7 del tick: mueve a los enemigos, resuelve contacto y dispara los gritos de la jefa. */
export function updateEnemies(state, dt, api) {
  S = state;
  DT = dt;
  API = api;
  MAP = state.mapDef;
  TG.length = 0;
  for (const p of state.players.values()) if (!p.down) TG.push(p);
  if (TG.length === 0) return;
  SUMMONS.length = 0;
  state.enemies.forEach(stepEnemy);
  updateShots();
  for (let i = 0; i < SUMMONS.length; i++) summonBats(SUMMONS[i]);
  SUMMONS.length = 0;
}

function summonBats(boss) {
  if (boss.dead) return;
  const T = E.llorona;
  const n = Math.min(14, T.summonCount + 2 * (boss.lvl - 1));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + boss.t;
    const b = spawnEnemy(S, 'murcielago', boss.x + Math.cos(a) * 70, boss.y + Math.sin(a) * 70);
    if (b) {
      b.vx = Math.cos(a) * 120;
      b.vy = Math.sin(a) * 120;
    }
  }
  API.spawnFx('ring', boss.x, boss.y, 0);
  API.sfx('boss');
  API.toast('La Llorona invoca murciélagos');
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function ell(g, x, y, rx, ry, rot) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
}

function tri(g, x1, y1, x2, y2, x3, y3) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineTo(x3, y3);
  g.closePath();
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const OUT = '#1c1030';

function drawChupa(g, w, h, f) {
  const cx = w * 0.46;
  const cy = h * 0.55;
  const st = f ? 1 : -1;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // cola
  g.strokeStyle = '#3f6130';
  g.lineWidth = 4.5;
  g.beginPath();
  g.moveTo(cx - 15, cy - 1);
  g.quadraticCurveTo(cx - 25, cy - 3 + st * 2, cx - 24, cy - 12);
  g.stroke();
  // patas traseras y delanteras
  g.fillStyle = '#2b3a22';
  rrect(g, cx - 14 + st * 2, cy + 6, 6, 11, 2);
  g.fill();
  rrect(g, cx + 4 - st * 2, cy + 6, 6, 11, 2);
  g.fill();
  // cuerpo
  g.fillStyle = '#5f8a46';
  g.strokeStyle = OUT;
  g.lineWidth = 2.2;
  ell(g, cx, cy, 17, 11);
  g.fill();
  g.stroke();
  g.fillStyle = '#a5c673';
  ell(g, cx + 1, cy + 5, 11, 5);
  g.fill();
  // púas
  g.fillStyle = '#d6453d';
  for (let i = 0; i < 5; i++) {
    const px = cx - 12 + i * 6.2;
    tri(g, px, cy - 8, px + 3, cy - 17 - (i % 2) * 3, px + 6.2, cy - 8);
    g.fill();
  }
  // cabeza
  g.fillStyle = '#6a9a4f';
  ell(g, cx + 14, cy - 3, 9, 8);
  g.fill();
  g.stroke();
  ell(g, cx + 21, cy - 1, 6.5, 4.6);
  g.fill();
  g.stroke();
  // ojo brillante y colmillos
  g.fillStyle = '#ff2a2a';
  g.beginPath();
  g.arc(cx + 16, cy - 6, 2.6, 0, TAU);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(cx + 15.4, cy - 6.7, 0.9, 0, TAU);
  g.fill();
  tri(g, cx + 19, cy + 2, cx + 20.5, cy + 6.5, cx + 22, cy + 2);
  g.fill();
  tri(g, cx + 23, cy + 2, cx + 24.5, cy + 6, cx + 26, cy + 2);
  g.fill();
  // patas delanteras (encima)
  g.fillStyle = '#34452a';
  rrect(g, cx - 6 - st * 2, cy + 7, 6, 10, 2);
  g.fill();
  rrect(g, cx + 11 + st * 2, cy + 7, 6, 10, 2);
  g.fill();
}

function drawBat(g, w, h, f) {
  const cx = w / 2;
  const cy = h * 0.58;
  const up = f ? -1 : 1;
  g.lineJoin = 'round';
  // alas
  g.fillStyle = '#4a3466';
  g.strokeStyle = OUT;
  g.lineWidth = 2;
  for (let s = -1; s <= 1; s += 2) {
    const tipY = cy + up * 11 - 3;
    g.beginPath();
    g.moveTo(cx + s * 4, cy - 4);
    g.quadraticCurveTo(cx + s * 12, cy - 12 + (up > 0 ? 8 : 0), cx + s * 19, tipY);
    g.lineTo(cx + s * 15, tipY + (up > 0 ? -3 : 3));
    g.lineTo(cx + s * 12, tipY + (up > 0 ? -6 : 6) + 2);
    g.lineTo(cx + s * 8, tipY + (up > 0 ? -4 : 4));
    g.lineTo(cx + s * 5, cy + 4);
    g.closePath();
    g.fill();
    g.stroke();
  }
  // cuerpo
  g.fillStyle = '#2f2145';
  ell(g, cx, cy, 6, 8);
  g.fill();
  g.stroke();
  // cabeza, orejas y ojos
  g.fillStyle = '#3b2a52';
  g.beginPath();
  g.arc(cx, cy - 8, 5.5, 0, TAU);
  g.fill();
  g.stroke();
  tri(g, cx - 5, cy - 11, cx - 4, cy - 18, cx - 1, cy - 12);
  g.fill();
  tri(g, cx + 5, cy - 11, cx + 4, cy - 18, cx + 1, cy - 12);
  g.fill();
  g.fillStyle = '#ff3b4f';
  g.beginPath();
  g.arc(cx - 2.3, cy - 8.5, 1.5, 0, TAU);
  g.arc(cx + 2.3, cy - 8.5, 1.5, 0, TAU);
  g.fill();
  g.fillStyle = '#fff';
  tri(g, cx - 2, cy - 4.6, cx - 1.2, cy - 2.2, cx - 0.4, cy - 4.6);
  g.fill();
  tri(g, cx + 0.4, cy - 4.6, cx + 1.2, cy - 2.2, cx + 2, cy - 4.6);
  g.fill();
}

function drawNahual(g, w, h, f) {
  const cx = w / 2;
  const cy = h * 0.52;
  const gr = g.createRadialGradient(cx, cy, 4, cx, cy, w * 0.5);
  gr.addColorStop(0, 'rgba(160,90,255,0.55)');
  gr.addColorStop(0.6, 'rgba(110,50,200,0.22)');
  gr.addColorStop(1, 'rgba(110,50,200,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.drawImage(emoji('🐺', 50), cx - 25, cy - 25 + (f ? 0 : -2), 50, 50);
  // ojos de espíritu
  g.fillStyle = '#b6ff6a';
  g.globalAlpha = 0.9;
  g.beginPath();
  g.arc(cx - 8, cy - 5 + (f ? 0 : -2), 1.8, 0, TAU);
  g.arc(cx + 8, cy - 5 + (f ? 0 : -2), 1.8, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}

function drawLlorona(g, w, h, f) {
  const cx = w / 2;
  const sway = f ? 3 : -3;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // cabello largo detrás
  g.fillStyle = '#0f0a1c';
  g.beginPath();
  g.moveTo(cx - 15, 22);
  g.quadraticCurveTo(cx - 24, 60, cx - 18 + sway, 100);
  g.lineTo(cx + 18 + sway, 100);
  g.quadraticCurveTo(cx + 24, 60, cx + 15, 22);
  g.closePath();
  g.fill();
  // vestido
  const dg = g.createLinearGradient(0, 40, 0, h);
  dg.addColorStop(0, '#fbfbff');
  dg.addColorStop(1, '#b9c8ee');
  g.fillStyle = dg;
  g.strokeStyle = '#6f7fb0';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - 14, 44);
  g.quadraticCurveTo(cx - 30, 80, cx - 44 + sway, h - 8);
  for (let i = 0; i < 6; i++) {
    const x0 = cx - 44 + sway + (i * 88) / 6;
    const x1 = cx - 44 + sway + ((i + 1) * 88) / 6;
    g.quadraticCurveTo((x0 + x1) / 2, h - 2 - (i % 2 ? 0 : 10), x1, h - 8);
  }
  g.quadraticCurveTo(cx + 30, 80, cx + 14, 44);
  g.closePath();
  g.fill();
  g.stroke();
  // brazos extendidos
  g.strokeStyle = '#eef0ff';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(cx - 12, 48);
  g.quadraticCurveTo(cx - 34, 52 + sway, cx - 40, 74 + sway);
  g.moveTo(cx + 12, 48);
  g.quadraticCurveTo(cx + 34, 52 - sway, cx + 40, 74 - sway);
  g.stroke();
  g.fillStyle = '#e4e0f5';
  g.beginPath();
  g.arc(cx - 40, 76 + sway, 5, 0, TAU);
  g.arc(cx + 40, 76 - sway, 5, 0, TAU);
  g.fill();
  // cabeza
  g.fillStyle = '#dfe3f3';
  g.strokeStyle = '#1c1030';
  g.lineWidth = 2;
  ell(g, cx, 32, 14, 17);
  g.fill();
  g.stroke();
  // flequillo
  g.fillStyle = '#0f0a1c';
  g.beginPath();
  g.moveTo(cx - 14, 30);
  g.quadraticCurveTo(cx - 8, 10, cx, 14);
  g.quadraticCurveTo(cx + 8, 10, cx + 14, 30);
  g.quadraticCurveTo(cx + 6, 22, cx, 24);
  g.quadraticCurveTo(cx - 6, 22, cx - 14, 30);
  g.fill();
  // ojos huecos y lágrimas
  g.fillStyle = '#12091f';
  ell(g, cx - 5.5, 33, 2.6, 4);
  g.fill();
  ell(g, cx + 5.5, 33, 2.6, 4);
  g.fill();
  g.strokeStyle = '#6fd0ff';
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(cx - 5.5, 37);
  g.lineTo(cx - 6.5, 50 + (f ? 3 : 0));
  g.moveTo(cx + 5.5, 37);
  g.lineTo(cx + 6.5, 50 + (f ? 0 : 3));
  g.stroke();
  // boca de grito
  g.fillStyle = '#12091f';
  ell(g, cx, 44, 3.4, f ? 5.4 : 4.2);
  g.fill();
}

const META = {};
let built = false;
let SHADOW = null;
let AURA = null;
let SCREAM = null;

function makeSet(type, w, h, draw) {
  const out = [];
  for (let f = 0; f < 2; f++) {
    for (let fl = 0; fl < 2; fl++) {
      for (let fs = 0; fs < 2; fs++) {
        out[(f * 2 + fl) * 2 + fs] = sprite(`ang:${type}:${f}:${fl}:${fs}`, w, h, (g) => {
          g.save();
          if (fl) {
            g.translate(w, 0);
            g.scale(-1, 1);
          }
          draw(g, w, h, f);
          g.restore();
          if (fs) {
            g.globalCompositeOperation = 'source-atop';
            g.fillStyle = 'rgba(255,255,255,0.78)';
            g.fillRect(0, 0, w, h);
            g.globalCompositeOperation = 'source-over';
          }
        });
      }
    }
  }
  return out;
}

function buildSprites() {
  if (built) return;
  built = true;
  const C = E.chupacabras;
  const B = E.murcielago;
  const N = E.nahual;
  const L = E.llorona;
  META.chupacabras = { set: makeSet('chupa', C.w, C.h, drawChupa), w: C.w, h: C.h, up: 2, bob: 0, fps: 7, sw: 34, sh: 12 };
  META.murcielago = { set: makeSet('bat', B.w, B.h, drawBat), w: B.w, h: B.h, up: 4, bob: 3, fps: 11, sw: 22, sh: 8 };
  META.nahual = { set: makeSet('nahual', N.w, N.h, drawNahual), w: N.w, h: N.h, up: 2, bob: 0, fps: 4, sw: 52, sh: 16 };
  META.llorona = { set: makeSet('llorona', L.w, L.h, drawLlorona), w: L.w, h: L.h, up: 6, bob: 4, fps: 3, sw: 78, sh: 22 };
  SHADOW = sprite('ang:shadow', 64, 20, (g) => {
    const gr = g.createRadialGradient(32, 10, 2, 32, 10, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.42)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.save();
    g.translate(32, 10);
    g.scale(1, 0.32);
    g.translate(-32, -32);
    g.fillRect(0, 0, 64, 64);
    g.restore();
  });
  AURA = sprite('ang:aura', 256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, 'rgba(150,200,255,0.55)');
    gr.addColorStop(0.5, 'rgba(110,150,255,0.22)');
    gr.addColorStop(1, 'rgba(110,150,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  });
  SCREAM = sprite('ang:scream', 40, 40, (g) => {
    const gr = g.createRadialGradient(20, 20, 1, 20, 20, 20);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(190,225,255,0.95)');
    gr.addColorStop(0.7, 'rgba(110,150,255,0.45)');
    gr.addColorStop(1, 'rgba(110,150,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 40, 40);
  });
}

let CTX = null;
let RT = 0;
let VL = 0;
let VT = 0;
let VR = 0;
let VB = 0;

function drawOne(e) {
  if (e.dead || e.boss) return;
  const x = e.x;
  const y = e.y;
  if (x < VL || x > VR || y < VT || y > VB) return;
  const m = META[e.type];
  if (!m) return;
  if (e.vx > 8) e.fl = 0;
  else if (e.vx < -8) e.fl = 1;
  const frame = ((RT * m.fps + e.ph) | 0) & 1;
  const idx = (frame * 2 + e.fl) * 2 + (e.flash > 0 ? 1 : 0);
  const bob = m.bob ? Math.sin(RT * 9 + e.ph) * m.bob : 0;
  CTX.drawImage(SHADOW, (x - m.sw / 2) | 0, (y + e.r * 0.55) | 0, m.sw, m.sh);
  CTX.drawImage(m.set[idx], (x - m.w / 2) | 0, (y - m.h / 2 - m.up + bob) | 0, m.w, m.h);
  if (e.hp < e.hpMax && !e.frozen) {
    const bw = 26;
    const bx = (x - bw / 2) | 0;
    const by = (y - m.h / 2 - m.up - 5 + bob) | 0;
    CTX.fillStyle = 'rgba(12,6,24,0.75)';
    CTX.fillRect(bx - 1, by - 1, bw + 2, 5);
    CTX.fillStyle = e.hp / e.hpMax > 0.4 ? '#ffb02e' : '#ff4d5e';
    CTX.fillRect(bx, by, (bw * e.hp) / e.hpMax, 3);
  }
}

function drawBoss(e) {
  if (e.dead) return;
  const m = META.llorona;
  const x = e.x;
  const y = e.y;
  if (x < VL - 120 || x > VR + 120 || y < VT - 120 || y > VB + 120) return;
  if (e.vx > 8) e.fl = 0;
  else if (e.vx < -8) e.fl = 1;
  const frame = ((RT * m.fps + e.ph) | 0) & 1;
  const idx = (frame * 2 + e.fl) * 2 + (e.flash > 0 ? 1 : 0);
  const bob = Math.sin(RT * 2.4) * m.bob;
  const pulse = 0.75 + 0.25 * Math.sin(RT * 4);
  CTX.save();
  CTX.globalAlpha = (e.tele > 0 ? 1 : 0.7) * pulse;
  CTX.drawImage(AURA, x - 150, y - 150 - 6, 300, 300);
  CTX.restore();
  CTX.drawImage(SHADOW, (x - m.sw / 2) | 0, (y + e.r * 0.8) | 0, m.sw, m.sh);
  CTX.drawImage(m.set[idx], (x - m.w / 2) | 0, (y - m.h / 2 - m.up + bob) | 0, m.w, m.h);
  if (e.tele > 0) {
    const T = E.llorona.telegraph;
    const k = 1 - e.tele / T;
    CTX.save();
    CTX.globalAlpha = 0.35 + 0.5 * k;
    CTX.strokeStyle = '#bfe3ff';
    CTX.lineWidth = 3 + 4 * k;
    CTX.beginPath();
    CTX.arc(x, y, 40 + 90 * (1 - k), 0, TAU);
    CTX.stroke();
    CTX.restore();
  }
}

function drawShots(state) {
  const shots = state.shots;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (!s.on) continue;
    if (s.x < VL || s.x > VR || s.y < VT || s.y > VB) continue;
    const sz = s.r * 3.1;
    CTX.drawImage(SCREAM, (s.x - sz / 2) | 0, (s.y - sz / 2) | 0, sz, sz);
  }
}

/** Dibuja enemigos y gritos en coordenadas de mundo. `view` = { l, t, r, b } con margen incluido. */
export function renderEnemies(ctx, state, cam, view) {
  buildSprites();
  CTX = ctx;
  RT = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  VL = view.l;
  VT = view.t;
  VR = view.r;
  VB = view.b;
  state.enemies.forEach(drawOne);
  if (state.boss) drawBoss(state.boss);
  drawShots(state);
  CTX = null;
}

/** Cuántos enemigos vivos hay (sin contar los marcados como muertos este tick). */
export function aliveCount(state) {
  return state.enemies.count - state.deadList.length;
}
