// player.js (ANG-W) - Jugador de Ángel Survivors: creación, movimiento, apuntado, esquiva y render.
//
// Contrato (docs/07 §2): createPlayer({pid, alias, skin, x, y}) · updatePlayer(state, p, inp, dt, api) · renderPlayer(ctx, p, state).
//   inp = { mx, my, ax, ay, attack, ability1, ability2, slot }
//   - mx,my : eje de movimiento (se recorta a longitud 1).
//   - ax,ay : apuntado. Un vector con |v| <= 1.5 se toma como DIRECCIÓN (stick / vector unitario);
//             si no, como PUNTO DEL MUNDO (mouse ya convertido con camera.screenToWorld).
//             Ausente, NaN o (0,0) = sin apuntado: se usa la dirección de mirada con asistencia de cono.
// updatePlayer deja el resultado en p.aim = { x, y, d, dist } (vector unitario + distancia al punto apuntado;
// `d` y `dist` valen lo mismo: main.js lee `d` y weapons.js lee `dist`)
// y en p.facing. main.js / weapons.js deben usar p.aim como `aim` de attack().
// Cooldowns (cooldowns.attack|bell|dash) NO se tocan aquí: los avanzan weapons.js / abilities.js.
// useDash() solo tiene que poner p.dashT > 0; el desplazamiento, la dirección y los i-frames los resuelve este módulo.

import { collideWithMap, TAU, roundRect, makeCanvas } from './world.js';
import { skinSprite, isSkinId } from './skins.js';
import { sprite } from '../../../shared/engine/sprites.js';
import * as CFG from './config.js';

// ---------------------------------------------------------------------------
// Ajustes. Si config.js exporta CONFIG.player con estas claves, mandan; si no, estos valores.
// ---------------------------------------------------------------------------
const DEFAULTS = {
  speed: 230,          // px/s
  radius: 16,          // radio de colisión
  hp: 100,
  accel: 15,           // 1/s: qué tan rápido alcanza la velocidad objetivo
  friction: 20,        // 1/s: qué tan rápido frena al soltar las teclas
  dashTime: 0.25,      // s de esquiva con invulnerabilidad
  dashSpeed: 820,      // px/s durante la esquiva (~205 px)
  hurtIframes: 0.5,    // s de invulnerabilidad tras recibir daño
  aimCone: 25,         // grados de cada lado para la asistencia de apuntado
  assistRange: 520,    // px: alcance de la asistencia
  aimDist: 260,        // px: distancia por defecto del punto apuntado
  magnet: 90,          // px: radio base del imán de gemas
};

let tuned = null;
function tuning() {
  if (tuned) return tuned;
  let src = null;
  try { src = (CFG && (CFG.CONFIG || CFG.default)) || null; } catch (e) { src = null; }
  const pc = src && src.player && typeof src.player === 'object' ? src.player : null;
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = pc ? pc[k] : undefined;
    out[k] = typeof v === 'number' && isFinite(v) && v > 0 ? v : DEFAULTS[k];
  }
  out.coneCos = Math.cos((out.aimCone * Math.PI) / 180);
  tuned = out;
  return out;
}

export const PLAYER_COLORS = ['#ffd23f', '#3ddc97', '#4cc9f0', '#ff6fb5'];
const SPRITE_PX = 48;
const NO_INPUT = { mx: 0, my: 0, ax: NaN, ay: NaN, attack: false, ability1: false, ability2: false, slot: -1 };
const nearBuf = [];

function isNum(v) {
  return typeof v === 'number' && isFinite(v);
}

function cleanAlias(alias) {
  const s = String(alias == null ? '' : alias).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return s || 'Jugador';
}

/** Índice 0..3 estable por pid (número, "p2", "sala-3", texto...). */
export function playerColorIndex(pid) {
  if (typeof pid === 'number' && isFinite(pid)) return ((Math.floor(pid) % 4) + 4) % 4;
  const s = String(pid);
  const m = /(\d+)\s*$/.exec(s);
  if (m) return parseInt(m[1], 10) % 4;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 4;
}

export function playerColor(pid) {
  return PLAYER_COLORS[playerColorIndex(pid)];
}

// ---------------------------------------------------------------------------
// Creación
// ---------------------------------------------------------------------------
export function createPlayer({ pid, alias = 'Jugador', skin = 'luchador', x = 0, y = 0 } = {}) {
  const T = tuning();
  return {
    pid,
    alias: cleanAlias(alias),
    skin: isSkinId(skin) ? skin : 'luchador',
    x, y, r: T.radius,
    vx: 0, vy: 0,
    hp: T.hp, hpMax: T.hp,
    lvl: 1, xp: 0, kills: 0,
    facing: { x: 1, y: 0 },
    aim: { x: 1, y: 0, d: 0, dist: 0 },
    aimAssist: false,
    weapons: [{ id: 'estaca', lvl: 1, mastery: 0 }, null, null],
    active: 0,
    prevActive: 0,
    super: null,
    cooldowns: { attack: 0, bell: 0, dash: 0 },
    iframes: 0,
    dashT: 0,
    dashDir: { x: 1, y: 0 },
    down: false,
    // Modificadores que alimentan las cartas de level-up (los demás módulos los leen con estos nombres).
    speedMul: 1,
    slowMul: 1,
    dmgMul: 1,
    magnetR: T.magnet,
    bellCdMul: 1,
    // Internos de este módulo
    _hp: T.hp,
    _dashing: false,
    _dashEl: 0,
    hurtFlash: 0,
    flip: 1,
  };
}

/** true si el jugador no puede recibir daño ahora mismo. */
export function isInvulnerable(p) {
  return !p || p.down || p.iframes > 0 || p.dashT > 0;
}

/**
 * Aplica daño respetando los i-frames y abre los 0.5 s de invulnerabilidad con parpadeo.
 * Devuelve true si el golpe entró. (enemies.js puede usarlo; si no, updatePlayer detecta la pérdida de vida.)
 */
export function hurtPlayer(p, dmg) {
  if (isInvulnerable(p) || !(dmg > 0)) return false;
  p.hp = Math.max(0, p.hp - dmg);
  p._hp = p.hp;
  p.iframes = Math.max(p.iframes, tuning().hurtIframes);
  p.hurtFlash = 0.2;
  return true;
}

// ---------------------------------------------------------------------------
// Actualización
// ---------------------------------------------------------------------------
function coneDist(p, dx, dy, e, cosMin) {
  const vx = e.x - p.x, vy = e.y - p.y;
  const d = Math.hypot(vx, vy);
  if (d < 1) return -1;
  if ((vx * dx + vy * dy) / d < cosMin) return -1;
  return d;
}

// Asistencia de cono: si hay un enemigo dentro de ±25° de la dirección de mirada, apunta a él.
function assistToward(p, dir, api, T) {
  if (!api) return false;
  let target = null;
  let td = Infinity;
  if (typeof api.nearestEnemy === 'function') {
    const n = api.nearestEnemy(p.x, p.y, T.assistRange);
    if (n) {
      const d = coneDist(p, dir.x, dir.y, n, T.coneCos);
      if (d >= 0) { target = n; td = d; }
    }
  }
  if (!target && typeof api.enemiesNear === 'function') {
    nearBuf.length = 0;
    const list = api.enemiesNear(p.x, p.y, T.assistRange, nearBuf) || nearBuf;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e) continue;
      const d = coneDist(p, dir.x, dir.y, e, T.coneCos);
      if (d >= 0 && d < td) { target = e; td = d; }
    }
  }
  if (!target) return false;
  const vx = target.x - p.x, vy = target.y - p.y;
  const l = Math.hypot(vx, vy) || 1;
  dir.x = vx / l;
  dir.y = vy / l;
  dir.dist = td;
  dir.d = td;
  return true;
}

export function updatePlayer(state, p, inp, dt, api) {
  if (!p) return;
  const T = tuning();
  inp = inp || NO_INPUT;
  if (!(dt > 0)) return;
  const map = (api && api.map) || (state && state.mapDef) || null;

  // Temporizadores propios (cooldowns.* no se tocan).
  if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);
  if (p.hurtFlash > 0) p.hurtFlash = Math.max(0, p.hurtFlash - dt);

  // Si alguien le quitó vida sin pasar por hurtPlayer(), abre los i-frames de daño aquí.
  if (isNum(p._hp) && p.hp < p._hp - 0.001) {
    p.iframes = Math.max(p.iframes, T.hurtIframes);
    p.hurtFlash = 0.2;
  }
  p._hp = p.hp;

  // Derribado o muerto: sin control, solo frena y se queda sobre el mapa.
  if (p.down || p.hp <= 0) {
    p.dashT = 0;
    p._dashing = false;
    const k = 1 - Math.exp(-dt * 10);
    p.vx -= p.vx * k;
    p.vy -= p.vy * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (map) collideWithMap(p, map);
    return;
  }

  let mx = isNum(inp.mx) ? inp.mx : 0;
  let my = isNum(inp.my) ? inp.my : 0;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const moving = ml > 0.1;

  // --- Esquiva (I): useDash() pone dashT > 0; aquí se fija la dirección y se resuelve el empuje.
  if (p.dashT > 0) {
    if (!p._dashing) {
      p._dashing = true;
      p._dashEl = 0;
      let dx = mx, dy = my;
      if (!moving) { dx = p.facing.x; dy = p.facing.y; }
      const dl = Math.hypot(dx, dy) || 1;
      if (!p.dashDir) p.dashDir = { x: 1, y: 0 };
      p.dashDir.x = dx / dl;
      p.dashDir.y = dy / dl;
    }
    p._dashEl += dt;
    const left = T.dashTime - p._dashEl;
    if (left <= 0) {
      p._dashing = false;
      p.dashT = 0;
      p.vx = p.dashDir.x * T.dashSpeed * 0.3;
      p.vy = p.dashDir.y * T.dashSpeed * 0.3;
    } else {
      p.dashT = left;
      if (p.iframes < left) p.iframes = left;
      p.vx = p.dashDir.x * T.dashSpeed;
      p.vy = p.dashDir.y * T.dashSpeed;
    }
  } else if (p._dashing) {
    p._dashing = false;
  }

  // --- Movimiento con aceleración (fuera de la esquiva)
  if (!p._dashing) {
    const speed = T.speed * (p.speedMul > 0 ? p.speedMul : 1) * (p.slowMul > 0 ? p.slowMul : 1);
    const k = 1 - Math.exp(-dt * (moving ? T.accel : T.friction));
    p.vx += (mx * speed - p.vx) * k;
    p.vy += (my * speed - p.vy) * k;
    if (!moving && Math.abs(p.vx) + Math.abs(p.vy) < 4) { p.vx = 0; p.vy = 0; }
  }

  // --- Integración con subpasos (la esquiva es rápida) y colisión contra el mapa
  const stepX = p.vx * dt, stepY = p.vy * dt;
  const dist = Math.hypot(stepX, stepY);
  const n = Math.min(8, Math.max(1, Math.ceil(dist / (p.r * 0.7))));
  for (let i = 0; i < n; i++) {
    p.x += stepX / n;
    p.y += stepY / n;
    if (map) collideWithMap(p, map);
  }

  // --- Dirección de mirada y apuntado
  const aim = p.aim || (p.aim = { x: 1, y: 0, d: 0, dist: 0 });
  let ax = 0, ay = 0, explicit = false, aimD = 0;
  if (isNum(inp.ax) && isNum(inp.ay) && (inp.ax !== 0 || inp.ay !== 0)) {
    const mag = Math.hypot(inp.ax, inp.ay);
    if (mag <= 1.5) {
      ax = inp.ax / mag; ay = inp.ay / mag; explicit = true;
    } else {
      const wx = inp.ax - p.x, wy = inp.ay - p.y;
      const wd = Math.hypot(wx, wy);
      if (wd > 4) { ax = wx / wd; ay = wy / wd; aimD = wd; explicit = true; }
    }
  }
  const face = p.facing;
  if (explicit) {
    face.x = ax; face.y = ay;
  } else if (moving) {
    face.x = mx / ml; face.y = my / ml;
  }
  if (face.x > 0.25) p.flip = 1; else if (face.x < -0.25) p.flip = -1;

  aim.x = explicit ? ax : face.x;
  aim.y = explicit ? ay : face.y;
  aim.dist = aim.d = explicit ? aimD : T.aimDist;
  p.aimAssist = false;
  if (!explicit) p.aimAssist = assistToward(p, aim, api, T);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const aliasCache = new Map();
let measureCtx = null;

function aliasSprite(alias, color) {
  const key = alias + '|' + color;
  let c = aliasCache.get(key);
  if (c) return c;
  if (aliasCache.size > 24) aliasCache.clear();
  if (!measureCtx) {
    const mc = makeCanvas(2, 2);
    measureCtx = mc ? mc.getContext('2d') : null;
  }
  const font = '700 13px "Segoe UI", system-ui, sans-serif';
  let tw = alias.length * 8;
  if (measureCtx) {
    measureCtx.font = font;
    tw = measureCtx.measureText(alias).width;
  }
  const w = Math.ceil(tw) + 22;
  const h = 20;
  c = sprite('angel.alias.' + key, w, h, (g) => {
    g.fillStyle = 'rgba(12,6,24,0.7)';
    roundRect(g, 0, 0, w, h, 10);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(10, h / 2, 3.4, 0, TAU);
    g.fill();
    g.font = font;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText(alias, 17, h / 2 + 0.5);
  });
  c = { img: c, w, h };
  aliasCache.set(key, c);
  return c;
}

let glow = null;
function glowSprite() {
  if (!glow) {
    glow = sprite('angel.player.glow', 96, 96, (g) => {
      const gr = g.createRadialGradient(48, 48, 4, 48, 48, 46);
      gr.addColorStop(0, 'rgba(255,236,160,0.95)');
      gr.addColorStop(0.5, 'rgba(255,190,60,0.38)');
      gr.addColorStop(1, 'rgba(255,170,40,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 96, 96);
    });
  }
  return glow;
}

function nowSec() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

// Estado de animación por jugador, derivado de las posiciones dibujadas (sirve también para jugadores remotos).
function visualState(p, t) {
  let v = p._vis;
  if (!v) {
    v = p._vis = { px: p.x, py: p.y, pt: t, walk: 0, speed: 0, trail: [], flip: 1, hit: 0 };
    for (let i = 0; i < 6; i++) v.trail.push({ x: 0, y: 0, a: 0, flip: 1 });
    v.head = 0;
  }
  return v;
}

export function renderPlayer(ctx, p, state) {
  if (!p) return;
  const t = nowSec();
  const v = visualState(p, t);
  const dtr = Math.min(0.1, Math.max(0.001, t - v.pt));
  const ddx = p.x - v.px, ddy = p.y - v.py;
  const moved = Math.hypot(ddx, ddy);
  const teleported = moved > 500;
  const speed = teleported ? 0 : moved / dtr;
  v.speed += (speed - v.speed) * Math.min(1, dtr * 14);
  v.walk += teleported ? 0 : moved * 0.085;
  v.px = p.x; v.py = p.y; v.pt = t;

  const facing = p.facing || { x: 1, y: 0 };
  if (facing.x > 0.25) v.flip = 1; else if (facing.x < -0.25) v.flip = -1;
  const flip = v.flip;

  const coop = !!(state && ((state.mode && state.mode !== 'solo') || (state.players && state.players.size > 1)));
  const colorIdx = coop ? playerColorIndex(p.pid) : 0;
  const ring = PLAYER_COLORS[colorIdx];
  // Varios luchadores en la sala: cada uno recibe otra paleta de máscara (el de menor índice conserva la roja).
  let variant = 0;
  if (coop && p.skin === 'luchador' && state.players) {
    for (const q of state.players.values()) {
      if (q !== p && q.skin === 'luchador' && playerColorIndex(q.pid) < colorIdx) variant++;
    }
  }
  const spr = skinSprite(p.skin, SPRITE_PX, variant);

  const ghost = !!(p.down || p.hp <= 0);
  const dashing = p.dashT > 0 || v.speed > 540;
  const walking = v.speed > 18 && !ghost;
  const stride = Math.sin(v.walk);
  const bob = ghost ? Math.sin(t * 2.4) * 3 - 8 : walking ? Math.abs(stride) * 3 : Math.sin(t * 2.6) * 0.7;
  const baseX = p.x;
  const feetY = p.y + 19;

  // Estela de la esquiva
  if (dashing && !ghost) {
    const tr = v.trail[v.head];
    tr.x = p.x; tr.y = p.y; tr.a = 0.38; tr.flip = flip;
    v.head = (v.head + 1) % v.trail.length;
  }
  for (let i = 0; i < v.trail.length; i++) {
    const tr = v.trail[i];
    if (tr.a <= 0.01) continue;
    ctx.save();
    ctx.globalAlpha = tr.a;
    ctx.translate(tr.x, tr.y - 3);
    ctx.scale(tr.flip * 1.12, 0.92);
    ctx.drawImage(spr, -SPRITE_PX / 2, -27, SPRITE_PX, SPRITE_PX);
    ctx.restore();
    tr.a -= dtr * 1.9;
  }

  // Sombra y anillo de color del jugador
  const lift = ghost ? 8 : Math.max(0, bob);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,' + (ghost ? 0.18 : 0.34) + ')';
  ctx.beginPath();
  ctx.ellipse(baseX, feetY - 1, 15 - lift * 0.5, 6 - lift * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = ring;
  ctx.globalAlpha = ghost ? 0.4 : 0.92;
  ctx.beginPath();
  ctx.ellipse(baseX, feetY - 1, 22, 8.6, 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = ghost ? 0.05 : 0.14;
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.restore();

  // Aura de superarma
  if (p.super && !ghost) {
    const g = glowSprite();
    const pulse = 0.7 + 0.3 * Math.sin(t * 7);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 * pulse;
    const s = 92 + pulse * 10;
    ctx.drawImage(g, baseX - s / 2, p.y - 4 - s / 2, s, s);
    ctx.restore();
  }

  // Indicador de apuntado (chevron pequeño del color del jugador)
  if (!ghost) {
    const aim = p.aim || facing;
    const al = Math.hypot(aim.x, aim.y) || 1;
    const ux = aim.x / al, uy = aim.y / al;
    const dist = 38 + Math.sin(t * 6) * 1.2;
    const cx = baseX + ux * dist, cy = p.y + 2 + uy * dist * 0.85;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.globalAlpha = p.aimAssist ? 0.95 : 0.7;
    ctx.fillStyle = ring;
    ctx.strokeStyle = 'rgba(12,6,24,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(-4, -5.5); ctx.lineTo(-1, 0); ctx.lineTo(-4, 5.5);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  // Zapatos que caminan
  if (!ghost) {
    ctx.fillStyle = '#2b1a14';
    const liftA = walking ? Math.max(0, stride) * 3.2 : 0;
    const liftB = walking ? Math.max(0, -stride) * 3.2 : 0;
    const sw = walking ? stride * 3 : 0;
    ctx.beginPath(); ctx.ellipse(baseX - 7 + sw, feetY - 1.5 - liftA, 5.2, 3.1, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(baseX + 7 - sw, feetY - 1.5 - liftB, 5.2, 3.1, 0, 0, TAU); ctx.fill();
  }

  // Parpadeo tras daño (la esquiva no parpadea: deja estela)
  let alpha = 1;
  if (ghost) alpha = 0.5;
  else if (p.iframes > 0 && !dashing) alpha = Math.floor(t * 18) % 2 === 0 ? 1 : 0.32;
  else if (dashing) alpha = 0.88;

  // Cuerpo: rebote, aplastado al caminar, inclinación según velocidad lateral
  const sq = ghost ? 0 : walking ? Math.sin(v.walk * 2) * 0.035 : Math.sin(t * 2.6) * 0.012;
  const tilt = ghost ? Math.sin(t * 1.7) * 0.06 : Math.max(-0.14, Math.min(0.14, (ddx / dtr) * 0.00032 * (teleported ? 0 : 1)));
  const dashStretch = dashing && !ghost ? 1.14 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(baseX, feetY - bob);
  ctx.rotate(tilt);
  ctx.scale(flip * (1 - sq * 0.6) * dashStretch, (1 + sq) / (dashStretch > 1 ? 1.08 : 1));
  ctx.drawImage(spr, -SPRITE_PX / 2, -SPRITE_PX + 1, SPRITE_PX, SPRITE_PX);
  if (p.hurtFlash > 0 && !ghost) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, p.hurtFlash * 4) * 0.85;
    ctx.drawImage(spr, -SPRITE_PX / 2, -SPRITE_PX + 1, SPRITE_PX, SPRITE_PX);
  }
  ctx.restore();

  // Aureola del derribado
  if (ghost) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ffe58a';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(baseX, p.y - 33 - bob, 10, 3.4, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // Alias y barrita de vida en cooperativo
  if (coop && p.alias) {
    const a = aliasSprite(p.alias, ring);
    const ay = p.y - 31 - (ghost ? 8 : 0) - 22;
    ctx.drawImage(a.img, baseX - a.w / 2, ay, a.w, a.h);
    if (!ghost && p.hpMax > 0 && p.hp < p.hpMax) {
      const bw = 34, bx = baseX - bw / 2, by = ay + a.h + 2;
      ctx.fillStyle = 'rgba(12,6,24,0.7)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
      ctx.fillStyle = p.hp / p.hpMax > 0.35 ? '#3ddc97' : '#ff4d5e';
      ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, p.hp / p.hpMax)), 4);
    }
  }
}
