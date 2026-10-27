// Estado del juego, velocidad y zonas. Solo main.js lo avanza.

import { WORLD, SPEED, MOVE, LIVES } from './config.js';

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** Velocidad nominal (m/s) a una distancia dada. */
export function speedAt(dist) {
  const d = Math.max(0, dist);
  if (d <= WORLD.goal) {
    return SPEED.start + (SPEED.end - SPEED.start) * Math.pow(d / WORLD.goal, 0.9);
  }
  return SPEED.end + (SPEED.cap - SPEED.end) * (1 - Math.exp(-(d - WORLD.goal) / 1600));
}

/** Zona (0..3) y vuelta (0 = primera) para una distancia. */
export function zoneOf(dist) {
  const n = Math.floor(Math.max(0, dist) / WORLD.zoneLen);
  return { index: n % WORLD.zoneCount, ring: n };
}

/** Nivel de dificultad (1..5) de los patrones a una distancia. */
export function tierAt(dist) {
  if (dist < 260) return 1;
  if (dist < 640) return 2;
  if (dist < 1080) return 3;
  if (dist < 1500) return 4;
  return 5;
}

export function createPlayer() {
  return {
    lane: 1, // carril objetivo
    x: 0, // posición lateral real (m)
    mode: 'swim', // 'swim' | 'jump' | 'dive'
    h: 0, // altura sobre el agua (negativa buceando)
    vy: 0,
    airT: 0,
    fastFall: false,
    diveT: 0,
    jumpBuf: 0,
    diveBuf: 0,
    o2: MOVE.o2Max,
    o2Wait: 0,
    o2Deny: 0,
    iframes: 0,
    dashT: 0,
    tilt: 0,
    squash: 0,
    dead: false,
    deadT: 0,
    spin: 0,
  };
}

export function createState() {
  return {
    scene: 'title', // 'title' | 'howto' | 'records' | 'playing' | 'paused' | 'gameover' | 'victory'
    t: 0, // reloj de animación (s)
    dist: 0,
    speed: 0,
    playTime: 0, // s de juego activo (sin pausas)
    slowT: 0, // s restantes de recuperación tras un golpe
    lives: LIVES.start,
    flowers: 0,
    flowerPts: 0,
    combo: 1,
    comboCount: 0,
    comboT: 0,
    bestCombo: 1,
    smashed: 0,
    hits: 0,
    player: createPlayer(),
    entities: [],
    track: null,
    zone: 0,
    ring: 0,
    won: false, // ya cruzó la meta
    endless: false,
    tainted: false, // usó trampas de depuración: no se publica el puntaje
    god: false,
    seed: 1,
    runId: '',
    lastLifeAt: 0,
    lastDashAt: 0,
  };
}

export function scoreOf(state) {
  return Math.floor(state.dist) + state.flowerPts;
}

export function resetRun(state, seed, startDist = 0) {
  const p = createPlayer();
  state.scene = 'playing';
  state.dist = startDist;
  state.speed = 0;
  state.playTime = 0;
  state.slowT = 0;
  state.lives = LIVES.start;
  state.flowers = 0;
  state.flowerPts = 0;
  state.combo = 1;
  state.comboCount = 0;
  state.comboT = 0;
  state.bestCombo = 1;
  state.smashed = 0;
  state.hits = 0;
  state.player = p;
  state.entities.length = 0;
  state.track = null;
  const z = zoneOf(startDist);
  state.zone = z.index;
  state.ring = z.ring;
  state.won = false;
  state.endless = false;
  state.tainted = startDist > 0;
  state.seed = seed;
  state.runId = '';
  state.lastLifeAt = startDist;
  state.lastDashAt = startDist;
}
