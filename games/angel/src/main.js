// main.js (ANG-G) - Integrador de Ángel Survivors (modo solo).
// Único dueño del avance del estado: reconstruye state.grid en cada tick y construye la `api` que reciben los demás
// módulos (docs/07 §2). Orden del tick y del render EXACTOS de docs/07 §2.
//
//   tick:   1 input · 2 updatePlayer · 3 attack(Y)/useBell(U)/useDash(I)/slot(1-3) · 4 updateWeapons · 5 updateAbilities
//           6 updateSupers · 7 enemigos · 8 updatePickups · 9 oleadas · 10 fx
//   render: fondo → obstáculos → pickups → supers → enemigos → proyectiles → jugadores → fx → flechas → HUD → menús
//
// Ganchos de prueba (docs/07 §3): window.__cfgReady, window.__cfgStats(); parámetros ?autostart=solo&map=&skin=,
// ?debug=1, ?stress=N (solo con debug) y ?seed=N.

import { createLoop } from '../../../shared/engine/loop.js';
import { createInput } from '../../../shared/engine/input.js';
import { createCamera } from '../../../shared/engine/camera.js';
import { createRng } from '../../../shared/engine/rng.js';
import * as audio from '../../../shared/engine/audio.js';
import * as dbg from '../../../shared/engine/debug.js';
import { load, save } from '../../../shared/engine/storage.js';
import { emit } from '../../../shared/engine/bus.js';
import { getProfile, setProfile } from '../../../shared/ui/profile.js';
import { initMobile, isTouchPhone, toggleFullscreen, canFullscreen } from '../../../shared/ui/mobile.js';

import { CONFIG, xpNeed } from './config.js';
import { createState, getMap, mapBackground, MAPS } from './state.js';
import { createPlayer, updatePlayer, renderPlayer } from './player.js';
import {
  attack, addMastery, grantWeapon, levelUpWeapon, updateWeapons, renderWeapons, WEAPONS, WEAPON_IDS,
  MAX_WEAPON_LVL, WEAPON_BALANCE,
} from './weapons.js';
import { updateSupers, renderSupers, renderSuperArrows, spawnSuper, SUPER_BALANCE, SUPER_IDS } from './superweapons.js';
import { useBell, useDash, updateAbilities, renderAbilities, ABILITY_BALANCE } from './abilities.js';
import { dropGem, updatePickups, renderPickups, PICKUP_BALANCE } from './pickups.js';
import { SKINS, isSkinId } from './skins.js';
import { updateEnemies, renderEnemies, markDead, flushDead, countShots, aliveCount } from './enemies.js';
import { initWaves, updateWaves, skipWave, spawnBoss, spawnStress } from './waves.js';
import {
  spawnFx, spawnDamage, updateFx, renderFx, renderReticle, toast, resetHud, renderHud, renderBackdrop,
} from './hud.js';
import { createMenus } from './menus.js';

const TAU = Math.PI * 2;
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------------------
// Balance: config.js manda sobre los valores por defecto de los módulos de combate
// ---------------------------------------------------------------------------
function applyBalance() {
  const B = CONFIG.balance;
  Object.assign(ABILITY_BALANCE.bell, B.bell);
  Object.assign(ABILITY_BALANCE.dash, B.dash);
  ABILITY_BALANCE.magnetBase = B.magnetBase;
  Object.assign(PICKUP_BALANCE, B.pickups);
  Object.assign(SUPER_BALANCE, {
    spawnMin: CONFIG.supers.spawnMin, spawnMax: CONFIG.supers.spawnMax, despawn: CONFIG.supers.despawn,
  });
  if (Array.isArray(B.mastery)) {
    WEAPON_BALANCE.mastery.length = 0;
    for (const v of B.mastery) WEAPON_BALANCE.mastery.push(v);
  }
}
applyBalance();

// ---------------------------------------------------------------------------
// Pantalla y cámara
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const uiRoot = document.getElementById('ui');
const lobbyLink = document.getElementById('lobby');

let viewW = 1280;
let viewH = 720;
let cam = createCamera(viewW, viewH);

function resize() {
  const w = Math.max(320, window.innerWidth || 1280);
  const h = Math.max(240, window.innerHeight || 720);
  const s = Math.min(1, CONFIG.view.maxW / w, CONFIG.view.maxH / h);
  viewW = Math.round(w * s);
  viewH = Math.round(h * s);
  canvas.width = viewW;
  canvas.height = viewH;
  cam.resize(viewW, viewH);
  if (state) {
    state.viewW = viewW;
    state.viewH = viewH;
  }
}

// ---------------------------------------------------------------------------
// Estado de la sesión
// ---------------------------------------------------------------------------
let scene = 'menu'; // 'menu' (título, principal, selección...) | 'playing' | 'levelup' | 'paused' | 'gameover'
let state = null;
let rng = createRng(1);
let player = null;
let mapBg = null;
let lastSel = { skin: 'luchador', map: 'reforma' };
let pending = null; // cartas de level-up en pantalla
let inputLock = 0;
let atkBuf = 0;
let ready = false;
let tickMs = 0;
let errCount = 0;
let superCycle = 0;
const seenErrors = new Set();

const input = createInput({ target: canvas, mouseTimeoutMs: 15000 });
CONFIG.autoAim = load('angel.autoaim', CONFIG.autoAim) !== false;
const touch = input.addTouchControls('angel');
touch.setVisible(false);
if (input.touchActive) document.body.classList.add('touch');
// Solo en celular/tableta táctil: pantalla completa, sin zoom por gestos y menos enemigos para mantener los FPS.
const IS_TOUCH_PHONE = isTouchPhone();
initMobile();
if (IS_TOUCH_PHONE) {
  CONFIG.waves.maxAlive = Math.min(CONFIG.waves.maxAlive, 150);
  if (canFullscreen()) {
    const fs = document.createElement('button');
    fs.type = 'button';
    fs.className = 'fs-btn';
    fs.textContent = '⛶';
    fs.setAttribute('aria-label', 'Pantalla completa');
    fs.addEventListener('click', toggleFullscreen);
    document.body.appendChild(fs);
  }
}

// ---------------------------------------------------------------------------
// Guardas: un módulo con un fallo no congela el resto del juego (se informa una vez por mensaje)
// ---------------------------------------------------------------------------
function fail(name, err) {
  errCount++;
  const key = name + ':' + (err && err.message ? err.message : String(err));
  if (seenErrors.has(key)) return;
  seenErrors.add(key);
  console.error('[angel] ' + name + ' falló:', err);
}

function step(name, fn, a, b, c, d, e, f) {
  try {
    return fn(a, b, c, d, e, f);
  } catch (err) {
    fail(name, err);
    return undefined;
  }
}

/** Nombre de escena para los ganchos de prueba: 'title' | 'menu' | 'playing' | 'levelup' | 'paused' | 'gameover'. */
function sceneName() {
  return scene === 'menu' && menus.current === 'title' ? 'title' : scene;
}

// ---------------------------------------------------------------------------
// api de docs/07 §2
// ---------------------------------------------------------------------------
const aliveFilter = (e) => !e.dead && e.hp > 0;
const sfxLast = Object.create(null);

function enemiesNear(x, y, r, out) {
  const o = state.grid.query(x, y, r, out);
  let w = 0;
  for (let i = 0; i < o.length; i++) {
    const e = o[i];
    if (!e.dead && e.hp > 0) o[w++] = e;
  }
  o.length = w;
  return o;
}

function nearestEnemy(x, y, r) {
  return state.grid.nearest(x, y, r, aliveFilter);
}

function addXp(p, value) {
  if (!p || p.down || !(value > 0)) return;
  p.xp += value;
  let guard = 8;
  while (guard-- > 0 && p.xp >= xpNeed(p.lvl)) {
    p.xp -= xpNeed(p.lvl);
    p.lvl++;
    state.stats.levels++;
    state.levelQueue.push(p.pid);
  }
}

function killEnemy(e, srcPid) {
  const p = state.players.get(srcPid) || null;
  markDead(state, e);
  state.stats.kills++;
  if (p) p.kills = (p.kills || 0) + 1;
  emit('enemy:killed', { id: e.id, type: e.type, x: e.x, y: e.y, by: srcPid });
  spawnFx(state, 'death', e.x, e.y, 0);
  const petals = e.boss ? 14 : e.type === 'nahual' ? 5 : 3;
  for (let i = 0; i < petals; i++) spawnFx(state, 'petal', e.x, e.y, 0);
  api.sfx('death');
  if (e.boss) {
    spawnFx(state, 'explosion', e.x, e.y, 0);
    api.sfx('explosion');
    api.shake(CONFIG.juice.shakeBossDeath[0], CONFIG.juice.shakeBossDeath[1]);
    api.hitstop(CONFIG.juice.hitstopBossDeath);
    api.toast('La Llorona se desvanece');
    state.stats.bosses++;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      dropGem(state, e.x + Math.cos(a) * 46, e.y + Math.sin(a) * 46, e.xp / n);
    }
    for (const q of state.players.values()) if (!q.down) q.hp = Math.min(q.hpMax, q.hp + 25);
  } else {
    dropGem(state, e.x, e.y, e.xp);
  }
}

function damageEnemy(e, dmg, srcPid, weaponId) {
  if (e.dead || !(e.hp > 0) || !(dmg > 0)) return;
  e.hp -= dmg;
  e.flash = CONFIG.juice.flashEnemy;
  state.stats.damage += dmg;
  const p = state.players.get(srcPid) || null;
  if (p && weaponId) addMastery(p, weaponId, dmg, api);

  e.dmgAcc += dmg;
  if (e.numT <= 0 && e.dmgAcc >= 1) {
    spawnDamage(state, e.x, e.y - e.r, Math.round(e.dmgAcc), e.dmgAcc >= 35);
    e.dmgAcc = 0;
    e.numT = CONFIG.juice.numMin;
  }
  if (!e.boss && p) {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    e.vx += (dx / d) * 140;
    e.vy += (dy / d) * 140;
  }
  spawnFx(state, 'hit', e.x, e.y, (e.id * 1.7) % TAU);
  api.sfx('hit');
  if (e.hp <= 0) {
    killEnemy(e, srcPid);
  } else if (e.boss && !e.enr && e.hp < e.hpMax * 0.5) {
    // Segunda fase de la jefa: más rápida con los gritos y las invocaciones (ver bossBrain).
    e.enr = 1;
    api.hitstop(CONFIG.juice.hitstopBossEnrage);
    api.shake(CONFIG.juice.shakeBoss[0], CONFIG.juice.shakeBoss[1]);
    api.sfx('boss');
    api.toast('¡La Llorona se enfurece!');
  }
}

const api = {
  rng,
  map: null,
  damageEnemy,
  enemiesNear,
  nearestEnemy,
  addXp,
  spawnFx(kind, x, y, a) {
    if (state) spawnFx(state, kind, x, y, a);
  },
  sfx(name) {
    const now = performance.now();
    if (now - (sfxLast[name] || 0) < 28) return;
    sfxLast[name] = now;
    audio.sfx(name);
  },
  shake(intensity, ms) {
    cam.shake(intensity, ms);
  },
  hitstop(ms) {
    if (!state) return;
    const s = Math.min(ms, CONFIG.juice.hitstopMax) / 1000;
    if (s > state.hitstop) state.hitstop = s;
  },
  toast,
};

// ---------------------------------------------------------------------------
// Récords locales (top 5)
// ---------------------------------------------------------------------------
function loadScores() {
  const a = load(CONFIG.records.key, []);
  if (!Array.isArray(a)) return [];
  return a.filter((x) => x && typeof x.score === 'number' && typeof x.alias === 'string');
}

function addScore(entry) {
  const a = loadScores();
  a.push(entry);
  a.sort((x, y) => y.score - x.score || y.ts - x.ts);
  if (a.length > CONFIG.records.keep) a.length = CONFIG.records.keep;
  save(CONFIG.records.key, a);
  return a;
}

// ---------------------------------------------------------------------------
// Menús
// ---------------------------------------------------------------------------
const menus = createMenus({
  root: uiRoot,
  lobbyLink,
  getAlias: () => getProfile().alias,
  getScores: loadScores,
  cb: {
    onStart: (sel) => startGame(sel),
    onResume: () => resumeGame(),
    onRestart: () => startGame(lastSel),
    onQuit: () => quitToMenu(),
    onPick: (i) => pickCard(i),
    onSelectionChange: (sel) => {
      setProfile({ skin: sel.skin });
      save('angel.map', sel.map);
    },
  },
});

// ---------------------------------------------------------------------------
// Cartas de level-up (GDD §1.10)
// ---------------------------------------------------------------------------
function ownedWeapon(p, id) {
  for (let i = 0; i < p.weapons.length; i++) if (p.weapons[i] && p.weapons[i].id === id) return p.weapons[i];
  return null;
}

function freeSlot(p) {
  for (let i = 0; i < 3; i++) if (!p.weapons[i]) return i;
  return -1;
}

function pct(v) {
  return Math.round(v * 100);
}

function buildCards(p) {
  const C = CONFIG.cards;
  const pool = [];
  if (freeSlot(p) >= 0) {
    for (const id of WEAPON_IDS) {
      if (ownedWeapon(p, id)) continue;
      const def = WEAPONS[id];
      pool.push({
        w: 3.2, kind: 'weapon', icon: def.icon, titulo: def.nombre, desc: def.descripcion, tag: 'Arma nueva',
        apply(q) {
          const slot = grantWeapon(q, id);
          if (slot >= 0) api.toast(def.nombre + ' en el espacio ' + (slot + 1) + ' (tecla ' + (slot + 1) + ')');
        },
      });
    }
  }
  for (let i = 0; i < p.weapons.length; i++) {
    const w = p.weapons[i];
    if (!w || w.lvl >= MAX_WEAPON_LVL) continue;
    const def = WEAPONS[w.id];
    pool.push({
      w: 2.4, kind: 'weapon', icon: def.icon, titulo: def.nombre + ' +1', tag: 'Nivel ' + w.lvl + ' → ' + (w.lvl + 1),
      desc: w.lvl + 1 >= MAX_WEAPON_LVL ? 'Evoluciona a ' + def.evolved.nombre : 'Más potencia, alcance y cadencia',
      apply(q) {
        levelUpWeapon(q, w.id, api);
      },
    });
  }
  const dm = p.dmgMul || 1;
  pool.push({
    w: 2, kind: 'stat', icon: '💥', titulo: 'Más daño', desc: '+' + pct(C.dmg) + ' % de daño (ahora ×' + dm.toFixed(2) + ')', tag: 'Mejora',
    apply(q) {
      q.dmgMul = (q.dmgMul || 1) + C.dmg;
    },
  });
  pool.push({
    w: 1.6, kind: 'stat', icon: '👟', titulo: 'Más velocidad', desc: '+' + pct(C.speed) + ' % de velocidad de movimiento', tag: 'Mejora',
    apply(q) {
      q.speedMul = Math.min(1.9, (q.speedMul || 1) + C.speed);
    },
  });
  pool.push({
    w: 1.6, kind: 'stat', icon: '❤️', titulo: 'Más vida', desc: '+' + C.hp + ' de vida máxima y curas ' + C.heal, tag: 'Mejora',
    apply(q) {
      q.hpMax += C.hp;
      q.hp = Math.min(q.hpMax, q.hp + C.heal);
      q._hp = q.hp;
    },
  });
  pool.push({
    w: 1.2, kind: 'stat', icon: '🧲', titulo: 'Imán', desc: '+' + pct(C.magnet) + ' % de radio para atraer gemas', tag: 'Mejora',
    apply(q) {
      q.magnetR = (q.magnetR || CONFIG.player.magnet) * (1 + C.magnet);
    },
  });
  pool.push({
    w: 1.2, kind: 'stat', icon: '🔔', titulo: 'Campanazo veloz', desc: '−' + pct(C.bell) + ' % de enfriamiento del Campanazo', tag: 'Mejora',
    apply(q) {
      q.bellCdMul = Math.max(0.3, (q.bellCdMul || 1) - C.bell);
    },
  });

  const out = [];
  for (let n = 0; n < 3 && pool.length; n++) {
    let total = 0;
    for (const c of pool) total += c.w;
    let r = rng.next() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function openLevelUp() {
  const pid = state.levelQueue.shift();
  const p = state.players.get(pid);
  if (!p) return;
  const options = buildCards(p);
  pending = { p, options };
  scene = 'levelup';
  touch.setVisible(false);
  menus.showLevelUp({
    level: p.lvl,
    options: options.map((o) => ({ kind: o.kind, icon: o.icon, titulo: o.titulo, desc: o.desc, tag: o.tag })),
  });
  api.sfx('levelup');
  emit('levelup', { pid, options: options.map((o) => o.titulo) });
}

function pickCard(i) {
  if (scene !== 'levelup' || !pending) return;
  const c = pending.options[i];
  if (!c) return;
  step('carta', c.apply, pending.p);
  api.sfx('pickup');
  pending = null;
  if (state.levelQueue.length) {
    openLevelUp();
    return;
  }
  menus.hide();
  scene = 'playing';
  touch.setVisible(true);
  inputLock = CONFIG.player.inputLockAfterMenu;
}

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------
function validSel(sel) {
  const prof = getProfile();
  const skin = sel && isSkinId(sel.skin) ? sel.skin : isSkinId(prof.skin) ? prof.skin : SKINS[0].id;
  const map = sel && MAPS[sel.map] ? sel.map : 'reforma';
  return { skin, map };
}

function startGame(selIn, opts) {
  const o = opts || {};
  const sel = validSel(selIn);
  lastSel = sel;
  menus.setSelection(sel);
  const mapDef = getMap(sel.map);
  try {
    mapBg = mapBackground(mapDef);
  } catch (err) {
    fail('mapBackground', err);
    mapBg = null;
  }
  const seed = o.seed !== undefined ? o.seed >>> 0 : (Math.random() * 0xffffffff) >>> 0;
  rng = createRng(seed);
  state = createState({ mode: 'solo', map: mapDef, seed });
  state.viewW = viewW;
  state.viewH = viewH;
  api.rng = rng;
  api.map = mapDef;

  const prof = getProfile();
  player = createPlayer({ pid: 1, alias: prof.alias, skin: sel.skin, x: mapDef.spawn.x, y: mapDef.spawn.y });
  player.magnetR = CONFIG.player.magnet;
  player.lastHurt = -99;
  state.players.set(player.pid, player);
  initWaves(state);
  resetHud();
  pending = null;
  atkBuf = 0;
  cam.setBounds(mapDef.w, mapDef.h);
  cam.snap(player);
  state.camX = cam.x;
  state.camY = cam.y;

  scene = 'playing';
  menus.hide();
  touch.setVisible(true);
  canvas.classList.add('playing');
  inputLock = CONFIG.player.inputLockAfterMenu;

  if (o.stress > 0) spawnStress(state, api, o.stress);
}

function pauseGame() {
  if (scene !== 'playing') return;
  scene = 'paused';
  touch.setVisible(false);
  menus.showPause();
}

function resumeGame() {
  if (scene !== 'paused') return;
  scene = 'playing';
  menus.hide();
  touch.setVisible(true);
  inputLock = CONFIG.player.inputLockAfterMenu;
}

function quitToMenu() {
  state = null;
  player = null;
  mapBg = null;
  pending = null;
  scene = 'menu';
  touch.setVisible(false);
  canvas.classList.remove('playing');
  menus.showMain();
}

function endGame() {
  const s = state;
  const p = player;
  const prof = getProfile();
  const entry = {
    alias: prof.alias,
    score: Math.max(0, s.wave) * 1000 + s.stats.kills,
    wave: Math.max(1, s.wave),
    kills: s.stats.kills,
    lvl: p.lvl,
    time: Math.round(s.time),
    bosses: s.stats.bosses,
    skin: p.skin,
    map: s.map,
    ts: Date.now(),
  };
  const scores = addScore(entry);
  const rank = scores.findIndex((x) => x.ts === entry.ts && x.alias === entry.alias);
  scene = 'gameover';
  touch.setVisible(false);
  menus.showGameOver({
    wave: entry.wave, lvl: entry.lvl, kills: entry.kills, time: s.time, bosses: entry.bosses,
    damage: s.stats.damage, scores, entry, newBest: rank === 0,
  });
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------
const INP = { mx: 0, my: 0, ax: NaN, ay: NaN, attack: false, ability1: false, ability2: false, slot: -1 };
const AIM = { x: 1, y: 0, dist: 0 };
const PT = { x: 0, y: 0 };
let retOn = false;
let retX = 0;
let retY = 0;

function readInput(p) {
  const ax = input.axis();
  INP.mx = ax.x;
  INP.my = ax.y;
  cam.worldToScreen(p.x, p.y, PT);
  const ox = PT.x;
  const oy = PT.y;
  input.setAimOrigin(ox, oy);
  retOn = false;
  const a = input.aim();
  if (a) {
    let fromMouse = false;
    const ap = input.aimPoint();
    if (ap) {
      const dx = ap.x - ox;
      const dy = ap.y - oy;
      const d = Math.sqrt(dx * dx + dy * dy);
      // El punto del ratón se pasa como PUNTO DEL MUNDO (|v| > 1.5); un stick, como dirección unitaria.
      if (d > 6 && (dx * a.x + dy * a.y) / d > 0.995) {
        cam.screenToWorld(ap.x, ap.y, PT);
        INP.ax = PT.x;
        INP.ay = PT.y;
        retOn = true;
        retX = PT.x;
        retY = PT.y;
        fromMouse = true;
      }
    }
    if (!fromMouse) {
      INP.ax = a.x;
      INP.ay = a.y;
    }
  } else {
    INP.ax = NaN;
    INP.ay = NaN;
  }
  INP.attack = input.down('attack');
  INP.ability1 = input.pressed('ability1');
  INP.ability2 = input.pressed('ability2');
  INP.slot = input.pressed('slot1') ? 0 : input.pressed('slot2') ? 1 : input.pressed('slot3') ? 2 : -1;
}

function autoRange(p) {
  const R = CONFIG.autoRange;
  if (p.super) return R[p.super.type] || R.default;
  const w = p.weapons ? p.weapons[p.active] : null;
  if (!w) return R.default;
  if (w.id === 'latigo') {
    const lv = Math.min(Math.max(w.lvl | 0, 1), MAX_WEAPON_LVL);
    return (WEAPON_BALANCE.latigo.range[lv - 1] || 100) + R.latigoPad;
  }
  return R[w.id] || R.default;
}

function doActions(p, dt) {
  if (INP.slot >= 0 && p.weapons[INP.slot]) {
    p.active = INP.slot;
    if (p.super) p.prevActive = INP.slot;
    api.sfx('ui');
  }
  if (input.pressed('attack')) atkBuf = CONFIG.player.attackBuffer;
  else if (atkBuf > 0) atkBuf -= dt;
  if (INP.attack || atkBuf > 0) {
    const a = p.aim;
    AIM.x = a ? a.x : p.facing.x;
    AIM.y = a ? a.y : p.facing.y;
    AIM.dist = a && a.d > 0 ? a.d : 0;
    if (CONFIG.autoAim && !p.down) {
      // apuntado automatico: hacia el enemigo mas cercano dentro del alcance del arma
      const e = nearestEnemy(p.x, p.y, autoRange(p));
      if (e) {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        AIM.x = dx / d;
        AIM.y = dy / d;
        AIM.dist = d;
      }
    }
    if (step('attack', attack, state, p, AIM, api)) atkBuf = 0;
  }
  if (INP.ability1) step('useBell', useBell, state, p, api);
  // player.js ejecuta el desplazamiento y los i-frames cuando dashT > 0; abilities.js solo maneja el cooldown.
  if (INP.ability2 && step('useDash', useDash, state, p, api)) p.dashT = CONFIG.player.dashTime;
}

function insertEnemy(e) {
  if (!e.dead) state.grid.insert(e);
}

function tick(dt) {
  if (dt > 0.05) dt = 0.05;
  const s = state;
  const p = player;
  if (s.hitstop > 0) {
    s.hitstop -= dt;
    cam.follow(p, dt);
    return;
  }
  const t0 = performance.now();
  s.tick++;
  s.time += dt;
  flushDead(s);
  s.grid.clear();
  s.enemies.forEach(insertEnemy);

  // 1-3: entrada, jugador y acciones
  readInput(p);
  step('updatePlayer', updatePlayer, s, p, INP, dt, api);
  if (inputLock > 0) inputLock--;
  else if (!p.down) doActions(p, dt);

  // 4-6: armas, habilidades y superarmas
  step('updateWeapons', updateWeapons, s, dt, api);
  step('updateAbilities', updateAbilities, s, dt, api);
  step('updateSupers', updateSupers, s, dt, api);
  s.camX = cam.x;
  s.camY = cam.y;
  // 7-10: enemigos, gemas, oleadas y fx
  step('updateEnemies', updateEnemies, s, dt, api);
  step('updatePickups', updatePickups, s, dt, api);
  step('updateWaves', updateWaves, s, dt, api);
  step('updateFx', updateFx, s, dt);

  // Regeneración suave y caída
  if (!p.down) {
    if (p.hp < p.hpMax && s.time - p.lastHurt > CONFIG.player.regenDelay) {
      p.hp = Math.min(p.hpMax, p.hp + CONFIG.player.regen * dt);
      p._hp = p.hp;
    }
    if (p.hp <= 0) {
      p.down = true;
      s.over = true;
      s.overT = 0;
      emit('player:down', { pid: p.pid });
      spawnFx(s, 'explosion', p.x, p.y, 0);
      audio.sfx('lose');
      api.shake(14, 500);
      api.toast('¡Has caído!');
    }
  }
  if (s.over) {
    s.overT += dt;
    if (s.overT > 1.2) endGame();
  } else if (s.levelQueue.length) {
    openLevelUp();
  }

  cam.follow(p, dt);
  tickMs += (performance.now() - t0 - tickMs) * 0.1;
}

function update(dt) {
  input.poll();
  if (input.pressed('mute')) {
    const m = audio.toggleMute();
    if (scene === 'playing') toast(m ? 'Sonido desactivado' : 'Sonido activado');
  }
  if (input.pressed('pause')) {
    if (scene === 'playing') pauseGame();
    else if (scene === 'paused' && menus.current === 'pause') resumeGame();
    else if (menus.open) menus.back();
  }
  if (scene === 'playing' && state && player) tick(dt);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const ENV = { muted: false, debug: false, god: false, touch: IS_TOUCH_PHONE && input.touchActive };

function renderWorld() {
  const s = state;
  const p = player;
  const map = s.mapDef;
  const m = CONFIG.view.margin;
  const v = s.view;
  v.l = cam.x - m;
  v.t = cam.y - m;
  v.r = cam.x + viewW + m;
  v.b = cam.y + viewH + m;

  ctx.fillStyle = map.fondo || '#14101e';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.save();
  cam.apply(ctx);
  if (mapBg) {
    const sx = Math.max(0, Math.floor(cam.x) - 16);
    const sy = Math.max(0, Math.floor(cam.y) - 16);
    const ex = Math.min(mapBg.width, Math.ceil(cam.x + viewW) + 16);
    const ey = Math.min(mapBg.height, Math.ceil(cam.y + viewH) + 16);
    if (ex > sx && ey > sy) ctx.drawImage(mapBg, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
  }
  if (map.drawObstacles) step('drawObstacles', map.drawObstacles, ctx, cam);
  step('renderPickups', renderPickups, ctx, s, cam);
  step('renderSupers', renderSupers, ctx, s, cam);
  step('renderEnemies', renderEnemies, ctx, s, cam, v);
  step('renderWeapons', renderWeapons, ctx, s, cam);
  step('renderAbilities', renderAbilities, ctx, s, cam);
  for (const q of s.players.values()) step('renderPlayer', renderPlayer, ctx, q, s);
  if (scene === 'playing' && !p.down) {
    if (CONFIG.autoAim) {
      // apuntado automatico: sin retícula del mouse; se marca el enemigo objetivo si existe
      const te = nearestEnemy(p.x, p.y, autoRange(p));
      if (te) renderReticle(ctx, te.x, te.y);
    } else if (retOn) {
      renderReticle(ctx, retX, retY);
    }
  }
  step('renderFx', renderFx, ctx, s, v);
  ctx.restore();
  ctx.save();
  step('renderSuperArrows', renderSuperArrows, ctx, s, cam, viewW, viewH);
  ctx.restore();
  ENV.muted = audio.muted;
  ENV.debug = dbg.enabled;
  ENV.god = s.god;
  ctx.save();
  step('renderHud', renderHud, ctx, s, p, viewW, viewH, ENV);
  ctx.restore();
}

function render() {
  const now = performance.now();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (state && player && scene !== 'menu') {
    renderWorld();
  } else {
    ctx.save();
    renderBackdrop(ctx, viewW, viewH, now / 1000);
    ctx.restore();
  }
  if (dbg.enabled) {
    const s = state;
    dbg.overlay(ctx, {
      escena: sceneName(),
      oleada: s ? s.wave + ' (' + s.phase + ')' : '-',
      enemigos: s ? aliveCount(s) : 0,
      proyectiles: s ? s.projectiles.count : 0,
      gemas: s ? s.drops.count : 0,
      fx: s ? s.fx.count : 0,
      'tick ms': tickMs,
      dios: s ? s.god : false,
      errores: errCount,
    });
  } else {
    dbg.overlay(ctx, null);
  }
  if (!ready) {
    ready = true;
    window.__cfgReady = true;
  }
}

// ---------------------------------------------------------------------------
// Ganchos de prueba (docs/07 §3)
// ---------------------------------------------------------------------------
window.__cfgStats = function __cfgStats() {
  const s = state;
  let entities = 0;
  if (s) entities = aliveCount(s) + countShots(s) + s.projectiles.count + s.drops.count + s.players.size;
  return {
    scene: sceneName(),
    fps: dbg.fps(),
    entities,
    wave: s ? s.wave : 0,
    players: s ? s.players.size : 0,
    menu: menus.current,
    phase: s ? s.phase : null,
    enemies: s ? aliveCount(s) : 0,
    kills: s ? s.stats.kills : 0,
    hp: player ? player.hp : 0,
    lvl: player ? player.lvl : 0,
    time: s ? s.time : 0,
    god: s ? s.god : false,
    tickMs: Math.round(tickMs * 100) / 100,
    errors: errCount,
  };
};

// ---------------------------------------------------------------------------
// Teclado de menús y atajos de debug
// ---------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  menus.handleKey(e);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

dbg.hotkeys({
  G() {
    if (!state) return;
    state.god = !state.god;
    toast(state.god ? 'Modo dios activado' : 'Modo dios desactivado');
  },
  N() {
    if (scene === 'playing') skipWave(state, api);
  },
  L() {
    if (scene === 'playing' && !player.down) addXp(player, xpNeed(player.lvl) - player.xp + 0.01);
  },
  B() {
    if (scene === 'playing') spawnBoss(state, api);
  },
  F() {
    if (scene === 'playing') step('spawnSuper', spawnSuper, state, api);
  },
  V() {
    // Superarma al instante bajo el jugador (cicla los cinco tipos): útil para la demo.
    if (scene !== 'playing' || player.down) return;
    const type = SUPER_IDS[superCycle++ % SUPER_IDS.length];
    step('spawnSuper', spawnSuper, state, api, type, player.x, player.y);
  },
  K() {
    // Daño fuerte a la jefa: para mostrar su derrota sin pelear toda la barra.
    if (scene === 'playing' && state.boss) damageEnemy(state.boss, 300, player.pid, null);
  },
  H() {
    if (scene === 'playing') {
      player.hp = player.hpMax;
      player._hp = player.hp;
    }
  },
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
window.addEventListener('resize', resize);
resize();

const profile = getProfile();
menus.setSelection({ skin: isSkinId(profile.skin) ? profile.skin : SKINS[0].id, map: load('angel.map', 'reforma') });

const loop = createLoop({ update, render, hz: 60 });

const auto = params.get('autostart');
if (auto === 'solo' || auto === '1' || auto === 'true') {
  const stress = dbg.enabled ? Math.max(0, parseInt(params.get('stress') || '0', 10) || 0) : 0;
  const seedParam = params.get('seed');
  startGame(
    { skin: params.get('skin') || profile.skin, map: params.get('map') || 'reforma' },
    { stress, seed: seedParam !== null && seedParam !== '' ? Number(seedParam) : undefined },
  );
} else {
  scene = 'menu';
  menus.showTitle();
}

loop.start();
