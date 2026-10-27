// Pista: proyección pseudo-3D de la vista trasera y generador de obstáculos a partir de la biblioteca de patrones.
//
// Proyección: la cámara está a d0 metros detrás del ajolote. Un punto del mundo (x lateral, d profundidad desde la
// cámara) cae en pantalla en  sx = cx + (x - camX)·focal/d + curva(d)  y  sy = horizonte + camH·focal/d.
// La curva solo desplaza en pantalla (cosmética): el carril del jugador (d = d0) no se mueve, así que no afecta al juego.

import { WORLD, PACING, laneX } from './config.js';
import { PATTERNS, INTRO_IDS, mirrorItems } from './patterns.js';
import { speedAt, tierAt } from './state.js';

// ---------------------------------------------------------------- dimensiones de cada entidad (metros)
//   w: ancho · len: profundidad en z · a: alto sobre el agua · b: profundidad bajo el agua
export const DIMS = {
  trajinera: { w: 2.3, len: 3.4, a: 2.6, b: 0.35, hw: 1.0 },
  red: { w: 2.3, len: 0.7, a: 1.9, b: 0.6, hw: 1.0 },
  garza: { w: 2.4, len: 1.4, a: 1.8, b: 0, hw: 1.0 },
  lirio: { w: 2.3, len: 2.4, a: 0.7, b: 0, hw: 1.05 },
  tronco: { w: 10.2, len: 1.5, a: 1.3, b: 1.0, hw: 6 },
  cerca: { w: 10.2, len: 0.8, a: 1.2, b: 1.0, hw: 6 },
  remolino: { w: 9.6, len: 3.2, a: 0, b: 0, hw: 6 },
  carpa: { w: 1.3, len: 1.2, a: 0.9, b: 0, hw: 0.9 },
  flor: { w: 0.7, len: 0.6, a: 0.7, b: 0, hw: 0.8 },
  ajolotito: { w: 1.3, len: 0.8, a: 1.2, b: 0, hw: 1.0 },
  dash: { w: 1.5, len: 0.8, a: 1.1, b: 0, hw: 1.1 },
  meta: { w: 10.4, len: 2.0, a: 3.7, b: 0, hw: 99 },
};

// ---------------------------------------------------------------- vista y proyección
export function makeView(w, h) {
  const portrait = h > w * 1.1;
  const horizon = Math.round(h * (portrait ? 0.3 : 0.36));
  const s0 = Math.min(h * 0.2, w * 0.1); // píxeles por metro a la profundidad del jugador
  const d0 = WORLD.d0;
  const focal = s0 * d0;
  const yPlayer = h * 0.8;
  const camH = (yPlayer - horizon) / s0;
  return { w, h, cx: w / 2, horizon, s0, focal, camH, d0, camX: 0, curve: 0, portrait, yPlayer };
}

export function sc(V, d) {
  return V.focal / d;
}
export function sy(V, d) {
  return V.horizon + (V.camH * V.focal) / d;
}
function bend(V, d) {
  const u = d - V.d0;
  return u > 0 ? V.curve * V.w * 0.000036 * u * u : 0;
}
export function sx(V, x, d) {
  return V.cx + (x - V.camX) * (V.focal / d) + bend(V, d);
}

// ---------------------------------------------------------------- generador
export function createTrack(rng, startDist = 0) {
  const v0 = speedAt(startDist);
  return {
    rng,
    nextId: 1,
    nextZ: startDist + 14, // primer punto libre
    lastObsZ: startDist, // z del último obstáculo (para la distancia mínima de reacción)
    introIdx: startDist > 0 ? INTRO_IDS.length : 0,
    first: startDist <= 0,
    recent: [],
    lastMustDive: false,
    metaDone: startDist > WORLD.goal,
    lastLifeZ: startDist,
    lastDashZ: startDist,
    v0,
  };
}

/** Reposiciona el generador tras un salto de distancia (debug). */
export function skipTo(state, dist) {
  const tr = state.track;
  if (!tr) return;
  state.entities.length = 0;
  tr.nextZ = dist + 40;
  tr.lastObsZ = dist;
  tr.first = false;
  tr.introIdx = INTRO_IDS.length;
  tr.metaDone = dist > WORLD.goal - 5;
  tr.lastLifeZ = dist;
  tr.lastDashZ = dist;
}

function byId(id) {
  return PATTERNS.find((p) => p.id === id);
}

function weightedPick(rng, list, tier) {
  let total = 0;
  const ws = list.map((p) => {
    const w = p.d === tier ? 6 : p.d === tier - 1 ? 3 : p.d >= tier - 3 ? 1 : 0.4;
    total += w;
    return w;
  });
  let r = rng.next() * total;
  for (let i = 0; i < list.length; i++) {
    r -= ws[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

function choosePattern(state, tr, z) {
  const tier = tierAt(z);
  let cands = PATTERNS.filter((p) => p.d <= tier && !tr.recent.includes(p.id));
  if (tr.lastMustDive) cands = cands.filter((p) => !p.mustDive);
  if (cands.length === 0) cands = PATTERNS.filter((p) => p.d <= tier);
  return weightedPick(tr.rng, cands, tier);
}

function push(state, e) {
  e.id = state.track.nextId++;
  e.hit = false;
  state.entities.push(e);
  return e;
}

function obstacleFromItem(it, z) {
  const d = DIMS[it.k];
  const e = { k: it.k, z, len: d.len, lane: it.lane ?? 1, span: it.span || 1, from: it.from || 0, x: 0, hw: d.hw, w: d.w };
  if (it.k === 'lirio') {
    e.x = laneX(it.lane) + ((e.span - 1) * WORLD.laneW) / 2;
    e.w = e.span * WORLD.laneW - 0.1;
    e.hw = e.w / 2 - 0.1;
  } else if (it.lane !== undefined) {
    e.x = laneX(it.lane);
  }
  e.phase = (z * 7.13) % 6.28;
  e.variant = Math.floor((z * 0.37) % 3);
  return e;
}

function pushFlowers(state, it, z0, v) {
  const n = it.n;
  const x = laneX(it.lane);
  for (let i = 0; i < n; i++) {
    const z = z0 + (it.t + i * it.dt) * v;
    let h = 0.35;
    if (it.shape === 'arc') h = 0.35 + (it.peak || 1.45) * Math.sin((Math.PI * i) / Math.max(1, n - 1));
    else if (it.shape === 'dive') h = -0.7;
    push(state, { k: 'flor', z, x, h, len: DIMS.flor.len, hw: DIMS.flor.hw, phase: i * 0.7 });
  }
}

function fillGap(state, zA, zB, v) {
  const tr = state.track;
  const rng = tr.rng;
  if (zB - zA < 1.1 * v) return;
  const spacing = 0.115 * v;
  const room = zB - zA;
  const lane = rng.int(0, 3);
  const mid = (zA + zB) / 2;
  const wantLife = state.lives < 3 && zA - tr.lastLifeZ > PACING.lifeEvery && rng.next() < 0.75;
  const wantDash = !wantLife && zA - tr.lastDashZ > PACING.dashEvery && rng.next() < 0.6;
  if (wantLife || wantDash) {
    const l = rng.int(0, 3);
    push(state, { k: wantLife ? 'ajolotito' : 'dash', z: mid, x: laneX(l), h: 0.45, len: DIMS.ajolotito.len, hw: DIMS.ajolotito.hw, phase: 0 });
    if (wantLife) tr.lastLifeZ = mid;
    else tr.lastDashZ = mid;
    // flores que llevan hasta el premio
    for (let z = zA + 0.2 * v; z < mid - 2.5; z += spacing) push(state, { k: 'flor', z, x: laneX(l), h: 0.35, len: DIMS.flor.len, hw: DIMS.flor.hw, phase: z });
    return;
  }
  const n = Math.max(3, Math.min(11, Math.floor((room - 0.4 * v) / spacing)));
  const kind = rng.next();
  if (kind < 0.4) {
    for (let i = 0; i < n; i++) push(state, { k: 'flor', z: zA + 0.2 * v + i * spacing, x: laneX(lane), h: 0.35, len: DIMS.flor.len, hw: DIMS.flor.hw, phase: i * 0.7 });
  } else {
    // ola: serpentea entre dos carriles
    const a = lane;
    const b = (lane + 1 + rng.int(0, 2)) % 3;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : i / (n - 1);
      const s = u * u * (3 - 2 * u);
      const x = laneX(a) + (laneX(b) - laneX(a)) * s;
      push(state, { k: 'flor', z: zA + 0.2 * v + i * spacing, x, h: 0.35, len: DIMS.flor.len, hw: DIMS.flor.hw, phase: i * 0.7 });
    }
  }
}

function placeMeta(state, v) {
  const tr = state.track;
  push(state, { k: 'meta', z: WORLD.goal, x: 0, h: 0, len: DIMS.meta.len, hw: 99, phase: 0 });
  // camino de flores hacia la meta
  const spacing = 0.12 * v;
  for (let z = Math.max(WORLD.goal - 12 * spacing, tr.nextZ + 5); z < WORLD.goal - 2; z += spacing) {
    push(state, { k: 'flor', z, x: 0, h: 0.35, len: DIMS.flor.len, hw: DIMS.flor.hw, phase: z });
  }
  tr.metaDone = true;
  tr.nextZ = WORLD.goal + 70;
  tr.lastObsZ = WORLD.goal;
}

function spawnNext(state) {
  const tr = state.track;
  const rng = tr.rng;
  const v = speedAt(tr.nextZ);

  let pat;
  if (tr.introIdx < INTRO_IDS.length) pat = byId(INTRO_IDS[tr.introIdx++]);
  else pat = choosePattern(state, tr, tr.nextZ);
  const mirror = tr.introIdx > 1 && rng.next() < 0.5;
  const items = mirror ? mirrorItems(pat.items) : pat.items;

  const gapT = tr.first ? PACING.introLead : PACING.gapT[Math.min(4, pat.d - 1)];
  tr.first = false;
  const z0 = Math.max(tr.nextZ, tr.lastObsZ + gapT * v - pat.tFirst * v);
  const zEnd = z0 + pat.tEnd * v;

  // La meta (2000 m) se despeja: ningún obstáculo cerca de ella.
  if (!tr.metaDone && zEnd > WORLD.goal - 45) {
    placeMeta(state, v);
    return;
  }

  const tMin = Math.min(...items.map((i) => i.t));
  fillGap(state, tr.nextZ, z0 + tMin * v - 0.25 * v, v);

  for (const it of items) {
    if (it.k === 'flores') pushFlowers(state, it, z0, v);
    else push(state, obstacleFromItem(it, z0 + it.t * v));
  }
  tr.nextZ = zEnd + 0.3 * v;
  tr.lastObsZ = z0 + pat.tLast * v;
  tr.lastMustDive = !!pat.mustDive;
  tr.recent.push(pat.id);
  if (tr.recent.length > 3) tr.recent.shift();
}

/** Mantiene generado el tramo por delante y descarta lo que quedó atrás. */
export function ensureTrack(state) {
  const tr = state.track;
  if (!tr) return;
  let guard = 0;
  while (tr.nextZ < state.dist + PACING.spawnAhead && guard++ < 40) spawnNext(state);
  const limit = state.dist - PACING.keepBehind;
  const es = state.entities;
  let w = 0;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (e.z + e.len / 2 >= limit && !e.gone) es[w++] = e;
  }
  es.length = w;
}
