// El escape de Xochimilco · integrador: bucle, escenas, puntuación, red y ganchos de prueba.
// Escenas (scene): 'title' | 'howto' | 'records' | 'playing' | 'paused' | 'gameover' | 'victory'.

import { WORLD, SPEED, LIVES, DASH, SCORE, NET, DEFAULT_ALIAS } from './config.js';
import { makeLoop, makeRng, sfx, isMuted, toggleMute, loadStore, saveStore, debugOn, debugOverlay, debugHotkeys, getAlias, setAlias, aliasOrDefault, fetchTop, sendScore, uuid, validAlias } from './engine.js';
import { createState, resetRun, speedAt, zoneOf, scoreOf, clamp } from './state.js';
import { makeView, sx, sy, sc, createTrack, ensureTrack, skipTo } from './track.js';
import { updatePlayer, drawPlayer } from './player.js';
import { updateEntities, drawEntity, prepareObstacleArt } from './obstacles.js';
import { paletteAt, makeFog, drawSky, drawGround, drawHaze, drawMist, drawDarkness, drawFireflies, collectScenery, drawScenery, prepareZoneArt } from './zones.js';
import { resetFx, updateFx, drawFx, drawSpeedLines, shake, shakeOffset, flash, flashScreen, splash, petals, bubbles, debris, sparks, confetti } from './fx.js';
import { createControls } from './controls.js';
import { createHud } from './hud.js';
import { createMenus } from './menus.js';
import { initMobile } from '../../../shared/ui/mobile.js';

initMobile(); // solo celular/tableta táctil: sin zoom por gestos y pantalla completa en el primer toque

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const AUTOSTART = params.get('autostart') === '1' || params.get('autostart') === 'true';

// ---------------------------------------------------------------- DOM y canvas
const app = document.getElementById('app');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const state = createState();
let V = makeView(1280, 720);
let dpr = 1;
let runAlias = DEFAULT_ALIAS;
let renderedOnce = false;
let wasDebug = false;
const actionQueue = [];
let lastFlowerSfx = 0;
const pending = { retry: null };

let dprCap = 1.5; // la resolución baja sola si el equipo no llega a ~40 fps
let lowFps = 0;
function resize() {
  const w = Math.max(320, app.clientWidth || window.innerWidth);
  const h = Math.max(240, app.clientHeight || window.innerHeight);
  // limita los píxeles totales para que pantallas grandes y de alta densidad sigan fluidas
  dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, dprCap, Math.sqrt(3.2e6 / (w * h))));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const keep = { camX: V.camX, curve: V.curve, camZ: V.camZ };
  V = makeView(w, h);
  V.camX = keep.camX;
  V.curve = keep.curve;
  V.camZ = keep.camZ || 0;
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- HUD y menús
const hud = createHud(app, {
  onPause: () => doPause(),
  onMute: () => {
    toggleMute();
    hud.setMuted(isMuted());
  },
});
hud.setMuted(isMuted());

// ---------------------------------------------------------------- récords locales (top 5)
const LOCAL_KEY = 'xochimilco.top5';
function localTop() {
  const rows = loadStore(LOCAL_KEY, []);
  return Array.isArray(rows) ? rows.filter((r) => r && typeof r.score === 'number').sort((a, b) => b.score - a.score).slice(0, NET.localN) : [];
}
function saveLocal(st) {
  const rows = localTop();
  rows.push({ alias: st.alias, score: st.score, distance: st.distance, ts: Date.now() });
  rows.sort((a, b) => b.score - a.score);
  saveStore(LOCAL_KEY, rows.slice(0, NET.localN));
}

const menus = createMenus(app, {
  getAlias: () => getAlias() || '',
  start: (alias) => {
    setAlias(alias);
    startRun(alias);
  },
  resume: () => doResume(),
  restart: () => startRun(runAlias),
  title: () => toTitle(),
  continueEndless: () => continueEndless(),
  finish: () => endRun(),
  toggleMute: () => {
    toggleMute();
    hud.setMuted(isMuted());
  },
  isMuted: () => isMuted(),
  fetchTop: () => fetchTop(NET.topN),
  localTop,
});

// ---------------------------------------------------------------- entrada
const controls = createControls({
  swipeTarget: app,
  isPlaying: () => state.scene === 'playing',
  onAction: (a) => {
    if (state.scene === 'playing' && actionQueue.length < 6) actionQueue.push(a);
  },
  onSystem: (name, info) => {
    switch (name) {
      case 'pause':
        if (state.scene === 'playing') doPause();
        else if (state.scene === 'paused') doResume();
        break;
      case 'back':
        if (state.scene === 'playing') doPause();
        else if (state.scene === 'paused') doResume();
        else if (menus.current === 'howto' || menus.current === 'records') menus.show('title');
        break;
      case 'mute':
        toggleMute();
        hud.setMuted(isMuted());
        break;
      case 'confirm':
        if (!menus.visible) break;
        if (info && info.kbd && menus.focusIsOnControl()) break; // Enter nativo sobre un botón ya lo activa
        menus.activate();
        break;
      case 'nav-jump':
      case 'nav-left':
        if (menus.visible) menus.move(-1);
        break;
      case 'nav-dive':
      case 'nav-right':
        if (menus.visible) menus.move(1);
        break;
      default:
        break;
    }
  },
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.scene === 'playing') doPause();
});

// ---------------------------------------------------------------- escenas
function showScene(name) {
  state.scene = name;
}

function toTitle() {
  showScene('title');
  actionQueue.length = 0;
  hud.show(false);
  hud.reset();
  resetFx();
  state.entities.length = 0;
  state.track = null;
  state.player.x = 0;
  state.player.lane = 1;
  state.player.dashT = 0;
  state.player.iframes = 0;
  state.player.dead = false;
  state.player.mode = 'swim';
  state.player.h = 0;
  state.speed = 18;
  menus.show('title');
}

function startRun(alias) {
  runAlias = validAlias(alias) ? alias.trim() : aliasOrDefault();
  const seedParam = Number(params.get('seed'));
  const seed = Number.isFinite(seedParam) && params.get('seed') !== null ? seedParam >>> 0 : (Math.random() * 4294967296) >>> 0;
  let startDist = 0;
  if (debugOn()) {
    const zp = Number(params.get('zone'));
    if (Number.isFinite(zp) && zp >= 1 && zp <= 4) startDist = (zp - 1) * WORLD.zoneLen + 20;
  }
  const keepGod = state.god;
  resetRun(state, seed, startDist);
  state.god = keepGod;
  if (keepGod) state.tainted = true;
  state.runId = uuid();
  state.track = createTrack(makeRng(seed), startDist);
  ensureTrack(state);
  actionQueue.length = 0;
  resetFx();
  hud.reset();
  hud.show(true);
  hud.setMuted(isMuted());
  menus.hide();
  showScene('playing');
  hud.showZone(state.zone, state.ring);
  showControlHint();
}

/** Pista de controles en las primeras partidas de cada dispositivo (no en autostart). */
function showControlHint() {
  if (AUTOSTART) return;
  const shown = Number(loadStore('xochimilco.hints', 0)) || 0;
  if (shown >= 3) return;
  saveStore('xochimilco.hints', shown + 1);
  let coarse = false;
  try {
    coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch {
    coarse = false;
  }
  hud.showHint(coarse ? 'Desliza ← → para cambiar de carril · ↑ salta · ↓ bucea' : 'A / D o ← →: carril  ·  W / ↑ / Espacio: saltar  ·  S / ↓ / Shift: bucear');
}

function doPause() {
  if (state.scene !== 'playing') return;
  actionQueue.length = 0;
  showScene('paused');
  menus.show('pause');
}

function doResume() {
  if (state.scene !== 'paused') return;
  actionQueue.length = 0;
  menus.hide();
  showScene('playing');
  try {
    canvas.focus();
  } catch {
    /* sin foco */
  }
}

function continueEndless() {
  if (state.scene !== 'victory') return;
  state.endless = true;
  state.player.iframes = 2.2;
  state.speed = Math.max(state.speed, 6);
  menus.hide();
  hud.show(true);
  actionQueue.length = 0;
  showScene('playing');
  hud.showMessage('MODO INFINITO', '¡SIGUE NADANDO!', 'Las zonas se repiten y cada vez es más rápido.', '#c9ff7a');
}

// ---------------------------------------------------------------- puntaje y red
function collectStats() {
  return {
    alias: runAlias,
    score: scoreOf(state),
    distance: Math.floor(state.dist),
    flowers: state.flowers,
    bestCombo: state.bestCombo,
    zone: state.zone + 1,
    durationMs: Math.round(state.playTime * 1000),
    won: state.won,
  };
}

function clearRetry() {
  if (pending.retry) {
    clearTimeout(pending.retry);
    pending.retry = null;
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

async function submit(st, payload, isRetry) {
  const res = await withTimeout(sendScore(payload), NET.waitMs);
  const stillHere = menus.current === 'gameover' && state.runId === payload.runId;
  if (res && (res.rank !== undefined || Array.isArray(res.top))) {
    let top = Array.isArray(res.top) ? res.top : null;
    if (!top) top = await withTimeout(fetchTop(NET.topN), NET.waitMs);
    if (stillHere) menus.updateResult({ status: 'ok', rank: res.rank, top: top || [] });
    return;
  }
  if (stillHere) menus.updateResult({ status: 'offline' });
  if (!isRetry) {
    clearRetry();
    pending.retry = setTimeout(() => {
      pending.retry = null;
      submit(st, payload, true);
    }, NET.retryMs);
  }
}

function endRun() {
  hud.show(false);
  const st = collectStats();
  state.scene = 'gameover';
  saveLocal(st);
  let result;
  let payload = null;
  if (state.tainted) {
    result = { status: 'skipped', note: 'Modo debug: el puntaje no se publica en el leaderboard.' };
  } else if (st.distance < NET.minPostDist) {
    result = { status: 'skipped', note: `Nada que publicar: llega al menos a ${NET.minPostDist} m para entrar al leaderboard.` };
  } else {
    result = { status: 'sending' };
    payload = {
      alias: st.alias,
      score: st.score,
      runId: state.runId || uuid(),
      meta: { distance: st.distance, zone: st.zone, flowers: st.flowers, durationMs: st.durationMs },
    };
    state.runId = payload.runId;
  }
  menus.show('gameover', { stats: st, result });
  if (payload) submit(st, payload, false);
}

// ---------------------------------------------------------------- ganchos del ajolote y de las entidades
function screenOfPlayer() {
  const p = state.player;
  return { x: sx(V, p.x, V.d0), y: V.yPlayer - Math.max(0, p.h) * V.s0, base: V.yPlayer };
}

const playerHooks = {
  lane(dir) {
    const s = screenOfPlayer();
    splash(s.x - dir * V.s0 * 0.4, s.base, 0.4);
  },
  jump() {
    const s = screenOfPlayer();
    sfx('jump');
    splash(s.x, s.base, 0.55);
  },
  land(impact) {
    const s = screenOfPlayer();
    sfx('splash', 90);
    splash(s.x, s.base, 0.7 + impact * 0.5);
    shake(2 + impact * 3, 0.16);
  },
  dive() {
    const s = screenOfPlayer();
    sfx('dive');
    splash(s.x, s.base, 0.9);
    bubbles(s.x, s.base, 6);
  },
  emerge() {
    const s = screenOfPlayer();
    sfx('splash', 90);
    splash(s.x, s.base, 0.6);
    bubbles(s.x, s.base, 3);
  },
  deny() {
    sfx('ui', 150);
    hud.toast('Sin oxígeno: espera a que se recargue 🫧', 'warn');
  },
  dashEnd() {
    hud.toast('Se acabó el Chinampa Dash');
  },
};

function entityScreen(e) {
  const d = Math.max(2, e.z - (state.dist - V.d0));
  return { x: sx(V, e.x, d), y: sy(V, d) - (e.h || 0) * sc(V, d) };
}

function die() {
  const p = state.player;
  p.dead = true;
  p.deadT = 0;
  p.spin = 0;
  p.dashT = 0;
  state.slowT = 0;
  sfx('lose');
  sfx('death');
  shake(18, 0.6);
  flashScreen(255, 40, 40, 0.5);
  hud.toast('¡Te atraparon!', 'bad');
}

const entityHooks = {
  hit() {
    const p = state.player;
    const s = screenOfPlayer();
    state.lives -= 1;
    state.hits += 1;
    state.combo = 1;
    state.comboCount = 0;
    state.comboT = 0;
    debris(s.x, s.y - V.s0 * 0.4, 16);
    splash(s.x, s.base, 1.6, '#ffffff');
    shake(14, 0.45);
    flashScreen(255, 70, 70, 0.4);
    sfx('hurt');
    sfx('hit');
    if (state.lives <= 0) {
      state.lives = 0;
      die();
    } else {
      p.iframes = LIVES.iframes;
      state.slowT = LIVES.slowRecover;
      state.speed *= LIVES.hitSlow;
      hud.toast(`¡Auch! Te ${state.lives === 1 ? 'queda 1 vida' : `quedan ${state.lives} vidas`}`, 'bad');
    }
  },
  smash(e) {
    state.smashed += 1;
    const s = entityScreen(e);
    debris(s.x, s.y, 14, ['#8a6038', '#c9a35a', '#ffd23f', '#ffffff']);
    splash(s.x, sy(V, Math.max(2, e.z - (state.dist - V.d0))), 1.2);
    shake(6, 0.2);
    sfx('explosion', 90);
  },
  flower(e) {
    const pts = SCORE.flower * state.combo;
    state.flowers += 1;
    state.flowerPts += pts;
    state.comboT = SCORE.comboWindow;
    state.comboCount += 1;
    if (state.comboCount >= SCORE.comboEvery && state.combo < SCORE.comboMax) {
      state.comboCount = 0;
      state.combo += 1;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      hud.toast(`¡Combo ×${state.combo}!`, 'good');
      sfx('pickup');
    } else if (state.combo >= SCORE.comboMax) {
      state.comboCount = 0;
    }
    const now = performance.now();
    if (now - lastFlowerSfx > 55) {
      lastFlowerSfx = now;
      sfx('gem');
    }
    const s = entityScreen(e);
    petals(s.x, s.y, 5);
  },
  life(e) {
    const s = entityScreen(e);
    sparks(s.x, s.y, 14, '#ff9fc4');
    sfx('pickup');
    if (state.lives < LIVES.max) {
      state.lives += 1;
      hud.toast('¡Ajolotito! +1 vida 🦎', 'good');
    } else {
      const pts = SCORE.flower * state.combo * 3;
      state.flowers += 3;
      state.flowerPts += pts;
      hud.toast('¡Vidas al máximo! +3 🌼', 'good');
    }
  },
  dash(e) {
    const p = state.player;
    p.dashT = DASH.time;
    const s = entityScreen(e);
    sparks(s.x, s.y, 22, '#ffe066');
    flashScreen(255, 220, 90, 0.35);
    sfx('dash');
    sfx('pickup');
    hud.toast('¡Chinampa Dash! 3 s de invulnerabilidad 🌺', 'good');
  },
  meta() {
    if (state.won) return;
    state.won = true;
    state.scene = 'victory';
    state.player.iframes = 0;
    confetti(V.w, V.h, 120);
    sfx('win');
    sfx('levelup');
    hud.show(false);
    menus.show('victory', { stats: collectStats() });
  },
};

// ---------------------------------------------------------------- actualización
function targetSpeed() {
  const p = state.player;
  let v = speedAt(state.dist);
  if (state.slowT > 0) {
    const k = 1 - state.slowT / LIVES.slowRecover;
    v *= LIVES.hitSlow + (1 - LIVES.hitSlow) * k * k;
  }
  if (p.dashT > 0) v *= DASH.mult;
  // arranque suave
  v *= 0.35 + 0.65 * clamp(state.playTime / SPEED.launch, 0, 1);
  return Math.min(v, SPEED.abs);
}

function stepPlay(dt) {
  const p = state.player;
  const actions = actionQueue.length ? actionQueue.splice(0) : actionQueue;
  const prevDist = state.dist;
  state.playTime += dt;

  if (p.dead) {
    state.speed *= Math.exp(-4 * dt);
    const wdt = dt * 0.4;
    state.dist += state.speed * wdt;
    updatePlayer(state, dt, [], controls.keys, playerHooks);
    if (p.deadT > LIVES.deathTime) endRun();
    updateFx(dt);
    return;
  }

  if (state.slowT > 0) state.slowT = Math.max(0, state.slowT - dt);
  const target = targetSpeed();
  state.speed += (target - state.speed) * (1 - Math.exp(-(target > state.speed ? 2.6 : 5) * dt));
  state.speed = clamp(state.speed, 0, SPEED.abs);
  state.dist += state.speed * dt;

  updatePlayer(state, dt, actions, controls.keys, playerHooks);
  ensureTrack(state);
  updateEntities(state, prevDist, entityHooks);
  if (state.scene !== 'playing') return; // la meta cambió de escena

  // combo
  if (state.comboT > 0) {
    state.comboT -= dt;
    if (state.comboT <= 0) {
      state.comboT = 0;
      state.combo = 1;
      state.comboCount = 0;
    }
  }

  // zona
  const z = zoneOf(state.dist);
  if (z.index !== state.zone || z.ring !== state.ring) {
    state.zone = z.index;
    state.ring = z.ring;
    hud.showZone(z.index, z.ring);
    sfx('bell');
    sfx('levelup');
  }
  updateFx(dt);
}

function stepTitle(dt) {
  state.speed = 18;
  state.dist += state.speed * dt;
  if (state.dist > WORLD.goal) state.dist -= WORLD.goal;
  const p = state.player;
  p.x = Math.sin(state.t * 0.8) * 0.9;
  p.tilt = Math.cos(state.t * 0.8) * -0.12;
  updateFx(dt);
}

function stepVictory(dt) {
  state.speed *= Math.exp(-2.4 * dt);
  if (state.speed < 0.2) state.speed = 0;
  state.dist += state.speed * dt;
  updatePlayer(state, dt, [], controls.keys, playerHooks);
  updateFx(dt);
}

function step(dt) {
  controls.poll();
  switch (state.scene) {
    case 'title':
    case 'howto':
    case 'records':
      state.t += dt;
      stepTitle(dt);
      break;
    case 'playing':
      state.t += dt;
      stepPlay(dt);
      break;
    case 'victory':
      state.t += dt;
      stepVictory(dt);
      break;
    case 'gameover':
      state.t += dt * 0.5;
      updateFx(dt);
      break;
    default:
      break; // paused: el mundo se congela
  }
}

// ---------------------------------------------------------------- dibujo
function curveAt(d) {
  return 0.75 * Math.sin(d * 0.0021 + 1.0) * (0.55 + 0.45 * Math.sin(d * 0.00073));
}

const pool = [];
const sorted = [];
const env = { t: 0, camZ: 0, dist: 0, fog: null, fogObs: null, playerX: 0, playerY: 0 };
const byDepthDesc = (a, b) => b.d - a.d;

function render(alpha) {
  const scn = state.scene;
  const moving = scn === 'playing' || scn === 'title' || scn === 'howto' || scn === 'records' || scn === 'victory';
  const rd = state.dist + (moving ? state.speed * alpha * STEP : 0);
  const p = state.player;
  V.camZ = rd - V.d0;
  V.camX = p.x * 0.55;
  V.curve = curveAt(rd);
  const P = paletteAt(rd);
  const fog = makeFog(P);
  env.t = state.t;
  env.camZ = V.camZ;
  env.dist = rd;
  env.fog = fog;
  env.fogObs = makeFog(P, 0.4); // obstáculos y premios nunca desaparecen del todo en la niebla
  env.playerX = sx(V, p.x, V.d0);
  env.playerY = V.yPlayer;

  const sh = shakeOffset();
  ctx.setTransform(dpr, 0, 0, dpr, sh.x * dpr, sh.y * dpr);
  // balanceo suave de la cámara al cambiar de carril
  if (Math.abs(p.tilt) > 0.001) {
    ctx.translate(V.cx, V.yPlayer);
    ctx.rotate(p.tilt * 0.05);
    ctx.translate(-V.cx, -V.yPlayer);
  }

  drawSky(ctx, V, P, env);
  drawGround(ctx, V, P, env);

  // lista de dibujo ordenada por profundidad (lo lejano primero)
  let n = collectScenery(pool, 0, V.camZ);
  const es = state.entities;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (e.gone) continue;
    const d = e.z - V.camZ;
    if (d < 1.2 || d > WORLD.far * 1.5) continue;
    let r = pool[n];
    if (!r) r = pool[n] = { d: 0, kind: 0, ref: null };
    r.d = d;
    r.kind = 1;
    r.ref = e;
    n++;
  }
  let pr = pool[n];
  if (!pr) pr = pool[n] = { d: 0, kind: 0, ref: null };
  pr.d = p.mode === 'dive' ? V.d0 + 3.2 : V.d0;
  pr.kind = 2;
  pr.ref = null;
  n++;
  sorted.length = n;
  for (let i = 0; i < n; i++) sorted[i] = pool[i];
  sorted.sort(byDepthDesc);
  for (let i = 0; i < n; i++) {
    const r = sorted[i];
    if (r.kind === 0) drawScenery(ctx, r, V, P, env);
    else if (r.kind === 1) drawEntity(ctx, r.ref, V, env);
    else drawPlayer(ctx, state, V, env);
  }
  ctx.globalAlpha = 1;

  drawHaze(ctx, V, P);
  drawMist(ctx, V, P, env);

  // efectos
  const dashing = p.dashT > 0;
  const lines = clamp((state.speed - 12) / 18, 0, 1) * 0.55 + (dashing ? 0.55 : 0);
  if (scn === 'playing') drawSpeedLines(ctx, V, lines, state.t, dashing ? '255,226,120' : '255,255,255');
  drawFx(ctx);
  drawDarkness(ctx, V, P, env);
  drawFireflies(ctx, V, P, env);

  if (dashing) {
    const g = ctx.createRadialGradient(V.cx, V.h * 0.55, V.h * 0.35, V.cx, V.h * 0.55, Math.max(V.w, V.h) * 0.75);
    g.addColorStop(0, 'rgba(255,214,64,0)');
    g.addColorStop(1, 'rgba(255,190,40,0.32)');
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, V.w + 80, V.h + 80);
  }
  if (flash.a > 0.01) {
    ctx.fillStyle = `rgba(${flash.r},${flash.g},${flash.b},${flash.a})`;
    ctx.fillRect(-40, -40, V.w + 80, V.h + 80);
  }
  // viñeta roja con una sola vida
  if (state.lives === 1 && (scn === 'playing' || scn === 'paused')) {
    const pulse = 0.5 + 0.5 * Math.sin(state.t * 4);
    const g = ctx.createRadialGradient(V.cx, V.h * 0.5, V.h * 0.45, V.cx, V.h * 0.5, Math.max(V.w, V.h) * 0.8);
    g.addColorStop(0, 'rgba(200,20,40,0)');
    g.addColorStop(1, `rgba(200,20,40,${0.16 + 0.12 * pulse})`);
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, V.w + 80, V.h + 80);
  }

  if (scn === 'playing' || scn === 'paused' || scn === 'victory') hud.update(state);

  const dbg = debugOn();
  if (dbg !== wasDebug) {
    wasDebug = dbg;
    document.body.classList.toggle('debug', dbg);
  }
  if (dbg) {
    debugOverlay(ctx, {
      escena: scn,
      distancia: Math.floor(state.dist),
      velocidad: Math.round(state.speed * 10) / 10,
      zona: state.zone + 1,
      vidas: state.lives,
      entidades: es.length,
      combo: state.combo,
      dios: state.god,
      carril: p.lane,
      modo: p.mode,
      oxigeno: Math.round(p.o2),
    });
  } else {
    debugOverlay(ctx, null);
  }

  // calidad adaptativa: si el promedio de fps cae por debajo de 40 durante ~1.5 s, baja la densidad de píxeles
  if (renderedOnce && (scn === 'playing' || scn === 'victory') && loop.fps > 0 && loop.fps < 40) {
    if (++lowFps > 90 && dprCap > 1) {
      dprCap = Math.max(1, dprCap - 0.25);
      lowFps = 0;
      resize();
    }
  } else {
    lowFps = 0;
  }

  if (!renderedOnce) {
    renderedOnce = true;
    window.__cfgReady = true;
  }
}

// ---------------------------------------------------------------- depuración (?debug=1 o F3)
debugHotkeys({
  G: () => {
    state.god = !state.god;
    state.tainted = true;
    hud.toast(state.god ? 'Modo dios: ACTIVADO' : 'Modo dios: apagado', 'good');
  },
  Z: () => {
    if (state.scene !== 'playing') return;
    const next = (Math.floor(state.dist / WORLD.zoneLen) + 1) * WORLD.zoneLen + 2;
    state.dist = next;
    state.tainted = true;
    skipTo(state, next);
    ensureTrack(state);
    hud.toast('Salto de zona (debug)', 'good');
  },
  L: () => {
    if (state.scene !== 'playing') return;
    state.lives = Math.min(LIVES.max, state.lives + 1);
    state.tainted = true;
  },
});

// ---------------------------------------------------------------- ganchos de prueba (docs/07 §3)
window.__cfgStats = () => ({
  scene: state.scene,
  fps: Math.round((loop.fps || 0) * 10) / 10,
  entities: state.entities.length,
  distance: Math.floor(state.dist),
  players: 1,
  zone: state.zone + 1,
  lives: state.lives,
  score: scoreOf(state),
  flowers: state.flowers,
  speed: Math.round(state.speed * 10) / 10,
});
window.__cfgXoc = { state, get view() { return V; } };

// ---------------------------------------------------------------- arranque
prepareObstacleArt();
prepareZoneArt();

const loop = makeLoop(step, render);
toTitle();
if (AUTOSTART) startRun(aliasOrDefault());
loop.start();
