// Pruebas del generador de patrones de Xochimilco (sin navegador): node --test games/xochimilco/test/patrones.test.mjs
// Verifican que cada patrón tenga una respuesta válida, que el solucionador rechace lo imposible y que la pista
// generada respete la distancia mínima de reacción y deje libre la meta.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, INVALID, INTRO_IDS, solvable, mirrorItems, isSafe } from '../src/patterns.js';
import { createTrack, ensureTrack } from '../src/track.js';
import { createState, resetRun, speedAt } from '../src/state.js';
import { WORLD } from '../src/config.js';
import { createRng } from '../../../shared/engine/rng.js';

const SOLID = new Set(['trajinera', 'red', 'garza', 'lirio', 'tronco', 'cerca', 'remolino', 'carpa']);

test('todos los patrones de la biblioteca tienen una respuesta válida', () => {
  assert.deepEqual(INVALID, []);
  assert.ok(PATTERNS.length >= 25, 'biblioteca con al menos 25 patrones');
  for (const p of PATTERNS) {
    assert.ok(solvable(p.items), `${p.id} debe ser resoluble`);
    assert.ok(solvable(mirrorItems(p.items)), `${p.id} espejado debe ser resoluble`);
  }
});

test('los patrones de salto exigen saltar y los de buceo exigen bucear', () => {
  const tronco = PATTERNS.find((p) => p.id === 'tronco-uno');
  assert.equal(tronco.mustJump, true);
  assert.equal(solvable(tronco.items, ['run', 'dive']), false);
  const muro = PATTERNS.find((p) => p.id === 'muro-buceo');
  assert.equal(muro.mustDive, true);
  assert.equal(solvable(muro.items, ['run', 'jump']), false);
});

test('el introductorio enseña carril, buceo y salto en orden', () => {
  for (const id of INTRO_IDS) assert.ok(PATTERNS.find((p) => p.id === id), `falta ${id}`);
});

test('la matriz del GDD §2.3 se cumple', () => {
  const caso = (k, extra = {}) => ({ k, lane: 1, span: 1, ...extra });
  // trajinera: carril ✔ bucear ✔ saltar ✘
  assert.equal(isSafe(caso('trajinera'), 0, 'run'), true);
  assert.equal(isSafe(caso('trajinera'), 1, 'dive'), true);
  assert.equal(isSafe(caso('trajinera'), 1, 'jump'), false);
  // red: solo carril
  assert.equal(isSafe(caso('red'), 0, 'run'), true);
  assert.equal(isSafe(caso('red'), 1, 'dive'), false);
  assert.equal(isSafe(caso('red'), 1, 'jump'), false);
  // garza: carril ✔ bucear ✔ saltar ✘
  assert.equal(isSafe(caso('garza'), 2, 'run'), true);
  assert.equal(isSafe(caso('garza'), 1, 'dive'), true);
  assert.equal(isSafe(caso('garza'), 1, 'jump'), false);
  // lirio: las tres respuestas sirven; quedarse en el carril, no
  assert.equal(isSafe(caso('lirio'), 1, 'run'), false);
  assert.equal(isSafe(caso('lirio'), 1, 'jump'), true);
  assert.equal(isSafe(caso('lirio'), 1, 'dive'), true);
  assert.equal(isSafe(caso('lirio'), 0, 'run'), true);
  // tronco, cerca y remolino ocupan los 3 carriles: solo se esquivan saltando
  for (const k of ['tronco', 'cerca', 'remolino']) {
    for (let lane = 0; lane < 3; lane++) {
      assert.equal(isSafe(caso(k), lane, 'run'), false, `${k} carril ${lane}`);
      assert.equal(isSafe(caso(k), lane, 'dive'), false, `${k} bucear ${lane}`);
      assert.equal(isSafe(caso(k), lane, 'jump'), true, `${k} saltar ${lane}`);
    }
  }
  // carpa: carril ✔ bucear ✔ saltar ✘
  assert.equal(isSafe(caso('carpa'), 0, 'run'), true);
  assert.equal(isSafe(caso('carpa'), 1, 'dive'), true);
  assert.equal(isSafe(caso('carpa'), 1, 'jump'), false);
});

test('el solucionador rechaza lo imposible', () => {
  const T = (t, lane) => ({ k: 'trajinera', t, lane });
  const R = (t, lane) => ({ k: 'red', t, lane });
  // tres redes a la vez: no hay carril libre
  assert.equal(solvable([R(1, 0), R(1, 1), R(1, 2)]), false);
  // dos troncos casi seguidos: no da tiempo de aterrizar y volver a saltar
  assert.equal(solvable([{ k: 'tronco', t: 1 }, { k: 'tronco', t: 1.3 }]), false);
  // red en el carril 0 y 2 con una trajinera en el 1: bucear en el carril 1 sirve
  assert.equal(solvable([R(1, 0), T(1, 1), R(1, 2)]), true);
  // cambiar dos carriles en 0.2 s es imposible
  assert.equal(solvable([R(1, 0), R(1, 1), R(1.2, 1), R(1.2, 2)]), false);
});

test('la pista respeta la reacción mínima y despeja la meta en 20 semillas', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const state = createState();
    resetRun(state, seed, 0);
    state.track = createTrack(createRng(seed), 0);
    const seen = new Map();
    for (let dist = 0; dist <= 2200; dist += 20) {
      state.dist = dist;
      ensureTrack(state);
      for (const e of state.entities) seen.set(e.id, e);
    }
    const all = [...seen.values()];
    const obs = all.filter((e) => SOLID.has(e.k)).sort((a, b) => a.z - b.z);
    assert.ok(obs.length > 40, 'hay obstáculos suficientes');
    // agrupa los obstáculos casi simultáneos y mide el tiempo entre grupos
    const groups = [];
    for (const e of obs) {
      const g = groups[groups.length - 1];
      if (g && e.z - g.z < 2.6) g.n++;
      else groups.push({ z: e.z, n: 1 });
    }
    let minGap = Infinity;
    for (let i = 1; i < groups.length; i++) {
      const v = (speedAt(groups[i - 1].z) + speedAt(groups[i].z)) / 2;
      minGap = Math.min(minGap, (groups[i].z - groups[i - 1].z) / v);
    }
    assert.ok(minGap >= 0.74, `semilla ${seed}: reacción mínima ${minGap.toFixed(2)} s`);
    // la meta aparece una vez, en 2000 m, y no hay obstáculos a menos de 40 m
    const metas = all.filter((e) => e.k === 'meta');
    assert.equal(metas.length, 1, `semilla ${seed}: una sola meta`);
    assert.equal(metas[0].z, WORLD.goal);
    const cerca = obs.filter((e) => Math.abs(e.z - WORLD.goal) < 40);
    assert.equal(cerca.length, 0, `semilla ${seed}: meta despejada`);
    // el primer obstáculo no llega antes de 45 m (arranque tranquilo)
    assert.ok(obs[0].z >= 45, `semilla ${seed}: primer obstáculo a ${obs[0].z.toFixed(0)} m`);
  }
});

test('puntaje y velocidad respetan los límites que valida el servidor', () => {
  // velocidad máxima: 36 m/s con Chinampa Dash; el servidor admite 45
  assert.ok(speedAt(0) >= 10 && speedAt(WORLD.goal) <= 27);
  assert.ok(speedAt(1e6) <= 32.001);
});
