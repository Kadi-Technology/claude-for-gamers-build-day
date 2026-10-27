// state.js (ANG-G) - Estado de Ángel Survivors: pools, registro de mapas y caché de fondos.
// Forma congelada en docs/03 §5; los campos extra (mapDef, shots, nums...) son propios de main.js.

import { createPool } from '../../../shared/engine/pool.js';
import { createGrid } from '../../../shared/engine/spatial.js';
import { CONFIG } from './config.js';
import reforma from './maps/reforma.js';
import tepito from './maps/tepito.js';

export const MAP_LIST = [reforma, tepito];
export const MAPS = { reforma, tepito };

export function getMap(id) {
  if (id && typeof id === 'object' && id.w && id.h) return id;
  return MAPS[id] || reforma;
}

// ---------------------------------------------------------------------------
// Fondo del mapa: se pinta UNA vez en un canvas de w×h y se reutiliza.
// ---------------------------------------------------------------------------
const bgCache = new Map();

export function mapBackground(map) {
  let bg = bgCache.get(map.id);
  if (bg) return bg;
  bg = document.createElement('canvas');
  bg.width = Math.max(1, Math.round(map.w));
  bg.height = Math.max(1, Math.round(map.h));
  const g = bg.getContext('2d');
  try {
    map.drawBackground(g);
  } catch (err) {
    console.warn('[state] el fondo del mapa falló, se usa un color liso:', err && err.message);
    g.fillStyle = '#2a2236';
    g.fillRect(0, 0, bg.width, bg.height);
  }
  bgCache.set(map.id, bg);
  return bg;
}

export function hasMapBackground(map) {
  return bgCache.has(map.id);
}

// ---------------------------------------------------------------------------
// Fábricas de los pools (forma estable de los objetos)
// ---------------------------------------------------------------------------
function makeEnemy() {
  return {
    id: 0, type: '', x: 0, y: 0, r: 12, hp: 1, hpMax: 1, vx: 0, vy: 0,
    dead: false, boss: false, frozen: false,
    spd: 0, dmg: 0, xp: 1, mass: 1, accel: 8,
    t: 0, ph: 0, flash: 0, fl: 0, cd: 0,
    avoidT: 0, avoidDir: 1, chk: 0, sx: 0, sy: 0,
    lvl: 1, ringT: 0, sumT: 0, tele: 0, ringOff: 0, strafe: 1, enr: 0,
    numT: 0, dmgAcc: 0,
    _kb: null, bw: 0, // registros de empuje y onda que usa abilities.js
  };
}

function makeProjectile() {
  return { id: 0, cc: 0, k: '', own: 0, x: 0, y: 0, vx: 0, vy: 0, r: 6, dmg: 0, life: 0, max: 1, hit: null };
}

function makeDrop() {
  return { id: 0, kind: '', type: 0, x: 0, y: 0, value: 0, r: 8, vx: 0, vy: 0 };
}

function makeFx() {
  return { kind: '', x: 0, y: 0, a: 0, t: 0, life: 0.3, vx: 0, vy: 0, s: 1, c: 0 };
}

function makeShot() {
  return { on: false, x: 0, y: 0, vx: 0, vy: 0, r: 8, life: 0, dmg: 0, big: false };
}

function makeNum() {
  return { on: false, x: 0, y: 0, vy: 0, t: 0, life: 0.7, text: '', big: false, hot: false };
}

/**
 * createState({ mode, map, seed }) - `map` puede ser el id ('reforma'|'tepito') o la definición del mapa.
 * state.map es el id (docs/03 §5) y state.mapDef la definición completa.
 */
export function createState({ mode = 'solo', map = 'reforma', seed = 1 } = {}) {
  const mapDef = getMap(map);
  const P = CONFIG.pools;
  const shots = [];
  for (let i = 0; i < P.shots; i++) shots.push(makeShot());
  const nums = [];
  for (let i = 0; i < P.nums; i++) nums.push(makeNum());

  const state = {
    mode,
    map: mapDef.id,
    mapDef,
    seed,
    tick: 0,
    time: 0,
    wave: 0,
    phase: 'respite', // 'respite' | 'wave' | 'boss'
    players: new Map(),
    enemies: createPool(makeEnemy, P.enemies),
    projectiles: createPool(makeProjectile, P.projectiles),
    drops: createPool(makeDrop, P.drops),
    fx: createPool(makeFx, P.fx),
    grid: createGrid(CONFIG.grid.cell),

    // Identificadores únicos de enemigos.
    nextId: 1,
    newId() {
      return this.nextId++;
    },

    // Tamaño de la vista lógica (lo actualiza main.js al redimensionar).
    viewW: 1280,
    viewH: 720,
    camX: 0, // esquina superior izquierda de la cámara (la fija main.js)
    camY: 0,
    view: { l: 0, t: 0, r: 0, b: 0 },

    // Enemigos
    boss: null,
    deadList: [],
    shots,
    shotIdx: 0,
    nums,
    numIdx: 0,

    // Oleadas
    waveT: 0,
    restT: CONFIG.waves.firstRest,
    quota: 0,
    owed: 0,
    bossCount: 0,
    bossSpawned: false,
    bossDownT: 0,
    banner: null, // { wave, t, dur, boss }

    // Partida
    levelQueue: [],
    hitstop: 0,
    god: false,
    stress: false,
    over: false,
    overT: 0,
    hurtFlash: 0,
    stats: { kills: 0, damage: 0, bosses: 0, wavesCleared: 0, levels: 0 },
  };
  return state;
}

export default createState;
