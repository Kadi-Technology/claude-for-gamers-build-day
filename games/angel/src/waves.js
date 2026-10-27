// waves.js (ANG-G) - Oleadas de Ángel Survivors (GDD §1.7).
// Cada oleada dura 30 s con una cuota creciente de enemigos, seguida de 3 s de respiro con el banner "OLEADA N".
// Las oleadas múltiplo de 5 traen a La Llorona y no terminan hasta derrotarla.

import { emit } from '../../../shared/engine/bus.js';
import { CONFIG } from './config.js';
import { spawnEnemy, coopScale, removeEnemy, aliveCount } from './enemies.js';
import { randomFreePoint, isFree } from './world.js';

const W = CONFIG.waves;

export function isBossWave(n) {
  return n > 0 && n % W.bossEvery === 0;
}

/** Cuota de "unidades" de enemigo de la oleada n (un chupacabras = 1, un nahual = 4). */
export function waveQuota(n) {
  return Math.round(W.quotaBase + W.quotaLin * n + W.quotaQuad * n * n);
}

function makeBanner(n, rest) {
  return { wave: n, t: 0, dur: rest + 1.3, boss: isBossWave(n) };
}

/** Deja el estado listo para la primera oleada (respiro inicial con el banner "OLEADA 1"). */
export function initWaves(state) {
  state.wave = 0;
  state.phase = 'respite';
  state.restT = W.firstRest;
  state.waveT = 0;
  state.owed = 0;
  state.quota = 0;
  state.bossSpawned = false;
  state.bossDownT = 0;
  state.banner = makeBanner(1, W.firstRest);
}

// ---------------------------------------------------------------------------
// Puntos de aparición
// ---------------------------------------------------------------------------
function randomAnchor(state, api) {
  let anchor = null;
  let k = 0;
  for (const p of state.players.values()) {
    if (p.down) continue;
    k++;
    if (api.rng.next() * k < 1) anchor = p;
  }
  return anchor;
}

/** Punto libre fuera de cámara alrededor de un jugador al azar; null si no hay jugadores vivos. */
function spawnPoint(state, api, minD, maxD) {
  const anchor = randomAnchor(state, api);
  if (!anchor) return null;
  for (let tries = 0; tries < 3; tries++) {
    const pt = randomFreePoint(state.mapDef, api.rng, anchor.x, anchor.y, minD, maxD);
    if (!pt) continue;
    const dx = pt.x - anchor.x;
    const dy = pt.y - anchor.y;
    if (dx * dx + dy * dy >= CONFIG.spawn.minPlayerDist * CONFIG.spawn.minPlayerDist) return pt;
  }
  return null;
}

/**
 * Punto libre justo fuera de la cámara: sobre el perímetro de la vista ampliada con un margen, más un empuje
 * aleatorio hacia afuera. Si no hay hueco válido (esquinas del mapa) cae al anillo radial de world.js.
 */
function normalSpawnPoint(state, api) {
  const anchor = randomAnchor(state, api);
  if (!anchor) return null;
  const m = CONFIG.spawn.margin;
  const x0 = state.camX - m;
  const x1 = state.camX + state.viewW + m;
  const y0 = state.camY - m;
  const y1 = state.camY + state.viewH + m;
  const w = x1 - x0;
  const h = y1 - y0;
  const map = state.mapDef;
  const rng = api.rng;
  for (let i = 0; i < 18; i++) {
    const r = rng.next() * (w + h);
    const out = rng.next() * CONFIG.spawn.band;
    let x;
    let y;
    if (r < w) {
      x = x0 + r;
      y = rng.next() < 0.5 ? y0 - out : y1 + out;
    } else {
      y = y0 + (r - w);
      x = rng.next() < 0.5 ? x0 - out : x1 + out;
    }
    if (isFree(map, x, y, 24)) return { x, y };
  }
  const half = Math.hypot(state.viewW, state.viewH) / 2 + m;
  return spawnPoint(state, api, half, half + CONFIG.spawn.band);
}

// ---------------------------------------------------------------------------
// Aparición según cuota
// ---------------------------------------------------------------------------
function spawnSwarm(state, api, count) {
  const pt = normalSpawnPoint(state, api);
  if (!pt) return 0;
  let made = 0;
  for (let i = 0; i < count; i++) {
    const a = api.rng.next() * Math.PI * 2;
    const d = 20 + api.rng.next() * 70;
    if (spawnEnemy(state, 'murcielago', pt.x + Math.cos(a) * d, pt.y + Math.sin(a) * d)) made++;
  }
  return made;
}

function spawnOne(state, api, type) {
  const pt = normalSpawnPoint(state, api);
  if (!pt) return false;
  return !!spawnEnemy(state, type, pt.x, pt.y);
}

function spawnOwed(state, api) {
  const n = state.wave;
  let guard = 6;
  while (state.owed >= 1 && guard-- > 0) {
    if (aliveCount(state) >= W.maxAlive) {
      state.owed = Math.min(state.owed, 12);
      return;
    }
    const wBat = n >= W.batFrom ? 2.5 + 0.35 * n : 0;
    const wNah = n >= W.nahualFrom ? 0.8 + 0.22 * n : 0;
    const r = api.rng.next() * (10 + wBat + wNah);
    if (r < wBat) {
      const want = Math.min(W.swarmMax, W.swarmMin + Math.floor(n / 2));
      const g = Math.min(want, Math.floor(state.owed));
      if (g >= 3) {
        state.owed -= spawnSwarm(state, api, g);
        continue;
      }
    } else if (r < wBat + wNah && state.owed >= W.nahualCost) {
      if (spawnOne(state, api, 'nahual')) state.owed -= W.nahualCost;
      continue;
    }
    if (spawnOne(state, api, 'chupacabras')) state.owed -= 1;
    else state.owed -= 0.25;
  }
}

// ---------------------------------------------------------------------------
// Ciclo de oleadas
// ---------------------------------------------------------------------------
export function startWave(state, n, api) {
  state.wave = n;
  state.waveT = 0;
  const boss = isBossWave(n);
  state.phase = boss ? 'boss' : 'wave';
  state.quota = Math.round(waveQuota(n) * coopScale(state) * (boss ? W.bossQuotaMul : 1));
  // Una primera tanda al empezar para que la acción llegue pronto (el resto entra de forma continua).
  state.owed = boss ? 0 : Math.min(W.openingBurst, Math.floor(state.quota * 0.3));
  state.bossSpawned = false;
  state.bossDownT = 0;
  emit('wave:start', { n });
  if (boss) spawnBoss(state, api);
}

function endWave(state, api) {
  state.phase = 'respite';
  state.restT = W.rest;
  state.banner = makeBanner(state.wave + 1, W.rest);
  state.stats.wavesCleared++;
  for (const p of state.players.values()) {
    if (!p.down && p.hp < p.hpMax) p.hp = Math.min(p.hpMax, p.hp + W.healOnClear);
  }
  api.toast('¡Oleada ' + state.wave + ' superada!');
  api.sfx('pickup');
}

/** Paso 9 del tick. */
export function updateWaves(state, dt, api) {
  const b = state.banner;
  if (b) {
    b.t += dt;
    if (b.t > b.dur) state.banner = null;
  }
  if (state.stress || state.over) return;
  if (state.phase === 'respite') {
    state.restT -= dt;
    if (state.restT <= 0) startWave(state, state.wave + 1, api);
    return;
  }
  state.waveT += dt;
  const span = W.duration * W.spawnWindow;
  if (state.waveT < span) {
    state.owed = Math.min(state.owed + (state.quota / span) * dt, 40);
    spawnOwed(state, api);
  }
  if (isBossWave(state.wave)) {
    if (state.bossSpawned && !state.boss) {
      state.bossDownT += dt;
      if (state.bossDownT >= 1.6) endWave(state, api);
    }
  } else if (state.waveT >= W.duration) {
    endWave(state, api);
  }
}

/** Debug (N): salta a la siguiente oleada de inmediato; si había jefa, desaparece sin recompensa. */
export function skipWave(state, api) {
  if (state.boss) removeEnemy(state, state.boss);
  state.boss = null;
  startWave(state, state.wave + 1, api);
  state.banner = { wave: state.wave, t: 0, dur: 1.8, boss: isBossWave(state.wave) };
  api.toast('Oleada ' + state.wave);
}

/** Invoca a La Llorona (jefa de oleada o debug B). Escala en cada aparición. */
export function spawnBoss(state, api) {
  if (state.boss) return state.boss;
  const pt = spawnPoint(state, api, 380, 520);
  const anchor = randomAnchor(state, api);
  const x = pt ? pt.x : anchor ? anchor.x + 420 : state.mapDef.spawn.x;
  const y = pt ? pt.y : anchor ? anchor.y : state.mapDef.spawn.y;
  state.bossCount++;
  const e = spawnEnemy(state, 'llorona', x, y, { level: state.bossCount });
  if (!e) return null;
  state.boss = e;
  state.bossSpawned = true;
  state.bossDownT = 0;
  api.spawnFx('ring', x, y, 0);
  api.shake(CONFIG.juice.shakeBoss[0], CONFIG.juice.shakeBoss[1]);
  api.sfx('boss');
  api.toast('¡Llega La Llorona!');
  emit('boss:spawn', { id: e.id, level: e.lvl, x, y });
  return e;
}

/** Debug (?stress=N): N enemigos inmóviles repartidos alrededor del punto de aparición. */
export function spawnStress(state, api, count) {
  const S = CONFIG.stress;
  const n = Math.max(0, Math.min(S.max, count | 0));
  const types = ['chupacabras', 'murcielago', 'chupacabras', 'nahual'];
  const c = state.mapDef.spawn;
  let made = 0;
  for (let i = 0; i < n; i++) {
    const pt = randomFreePoint(state.mapDef, api.rng, c.x, c.y, S.minDist, S.maxDist);
    if (spawnEnemy(state, types[i % types.length], pt.x, pt.y, { frozen: true })) made++;
  }
  state.stress = true;
  state.banner = null;
  return made;
}
