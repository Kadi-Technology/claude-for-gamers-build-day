// El ajolote: movimiento (carriles, salto de 0.7 s con fast-fall, buceo de 0.8 s con oxígeno) y dibujo.

import { MOVE, WORLD, laneX } from './config.js';
import { sx } from './track.js';
import { TAU, clamp, lerp, mix, circle, rgrad } from './art.js';
import { bubbles, drip } from './fx.js';

const G = (8 * MOVE.jumpPeak) / (MOVE.jumpTime * MOVE.jumpTime);
const V0 = (4 * MOVE.jumpPeak) / MOVE.jumpTime;

function startJump(p, hooks) {
  p.mode = 'jump';
  p.vy = V0;
  p.h = 0.001;
  p.airT = 0;
  p.fastFall = false;
  p.jumpBuf = 0;
  p.squash = -0.25; // estiramiento al despegar
  hooks.jump();
}

function startDive(p, hooks) {
  if (p.o2 < MOVE.diveCost) {
    p.o2Deny = 0.4;
    p.diveBuf = 0;
    hooks.deny();
    return;
  }
  p.o2 -= MOVE.diveCost;
  p.mode = 'dive';
  p.diveT = MOVE.diveTime;
  p.diveBuf = 0;
  hooks.dive();
}

/**
 * Avanza al ajolote un tick.
 * actions: cola de acciones del tick ('left' | 'right' | 'jump' | 'dive'); keys: estado de teclas sostenidas ({ dive }).
 * hooks: lane(dir) jump() land(fuerza) dive() emerge() deny()
 */
export function updatePlayer(state, dt, actions, keys, hooks) {
  const p = state.player;
  if (p.dead) {
    p.deadT += dt;
    p.spin += dt * 9;
    return;
  }
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (a === 'left') {
      if (p.lane > 0) {
        p.lane--;
        hooks.lane(-1);
      }
    } else if (a === 'right') {
      if (p.lane < WORLD.lanes - 1) {
        p.lane++;
        hooks.lane(1);
      }
    } else if (a === 'jump') {
      p.jumpBuf = MOVE.jumpBuffer;
    } else if (a === 'dive') {
      if (p.mode === 'jump') p.fastFall = true;
      else p.diveBuf = MOVE.diveBuffer;
    }
  }
  if (p.jumpBuf > 0) p.jumpBuf = Math.max(0, p.jumpBuf - dt);
  if (p.diveBuf > 0) p.diveBuf = Math.max(0, p.diveBuf - dt);

  if (p.mode === 'swim') {
    if (p.jumpBuf > 0) startJump(p, hooks);
    else if (p.diveBuf > 0) startDive(p, hooks);
  } else if (p.mode === 'jump') {
    const fast = p.fastFall || keys.dive;
    p.vy -= G * (fast && p.vy < 0.5 * V0 ? MOVE.fastFall : fast ? 1.8 : 1) * dt;
    p.h += p.vy * dt;
    p.airT += dt;
    if (p.h <= 0 && p.vy < 0) {
      const impact = clamp(-p.vy / V0, 0, 2);
      p.h = 0;
      p.vy = 0;
      p.mode = 'swim';
      p.fastFall = false;
      p.squash = 0.35 + impact * 0.2;
      hooks.land(impact);
      if (p.jumpBuf > 0) startJump(p, hooks);
    }
  } else if (p.mode === 'dive') {
    p.diveT -= dt;
    const el = MOVE.diveTime - p.diveT;
    const dIn = clamp(el / 0.1, 0, 1);
    const dOut = clamp(p.diveT / 0.14, 0, 1);
    p.h = -MOVE.diveDepth * Math.min(dIn, dOut);
    if (p.diveT <= 0) {
      p.mode = 'swim';
      p.h = 0;
      p.o2Wait = MOVE.o2Delay;
      p.squash = 0.2;
      hooks.emerge();
      if (p.jumpBuf > 0) startJump(p, hooks);
    }
  }

  // oxígeno
  if (p.mode !== 'dive') {
    if (p.o2Wait > 0) p.o2Wait -= dt;
    else p.o2 = Math.min(MOVE.o2Max, p.o2 + MOVE.o2Regen * dt);
  }
  if (p.o2Deny > 0) p.o2Deny -= dt;

  // lateral
  const tx = laneX(p.lane);
  const k = 1 - Math.exp(-MOVE.laneRate * dt);
  p.x += (tx - p.x) * k;
  if (Math.abs(tx - p.x) < 0.002) p.x = tx;
  p.tilt = lerp(p.tilt, clamp((tx - p.x) * 0.2, -0.4, 0.4), 1 - Math.exp(-18 * dt));
  p.squash *= Math.exp(-11 * dt);

  if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);
  if (p.dashT > 0) {
    p.dashT = Math.max(0, p.dashT - dt);
    if (p.dashT === 0) hooks.dashEnd();
  }
}

// ================================================================ dibujo (todo procedural, sin objetos por frame)

const N = 16; // puntos de la columna (cabeza -> punta de la cola)
const SPX = new Float32Array(N);
const SPY = new Float32Array(N);
const HW = new Float32Array(N);
const PAL = [];
const SPOTS = [[0.07, -0.45, 3.2], [0.12, 0.5, 2.6], [0.2, -0.2, 3], [0.27, 0.42, 2.8], [0.34, -0.5, 2.4], [0.42, 0.2, 2.6], [0.52, -0.25, 2.2], [0.6, 0.15, 2]];
const GILL_ANG = [1.05, 0.5, -0.05];
const GILL_LEN = [78, 70, 62];
let phase = 0;
let jfS = 0;
let lastRt = 0;
let lastEnvT = -1;
let bubT = 0;
let dripT = 0;

/** Paleta con 5 niveles de tinte azul (buceo). Se calcula una vez por nivel. */
function palette(lvl) {
  let P = PAL[lvl];
  if (P) return P;
  const m = (lvl / 4) * 0.62;
  const c = (h) => mix(h, '#2f93c4', m);
  P = {
    body: c('#f7a8c4'),
    head: c('#fbb8cf'),
    light: c('#ffdbe8'),
    dark: c('#d9709b'),
    spot: c('#c9507f'),
    leg: c('#f292b6'),
    gill: c('#e0218a'),
    gillL: c('#ff4fa8'),
    fin: c('#ffd9a6'),
    line: c('#c65a8c'),
    cheek: c('#ff7fa8'),
  };
  PAL[lvl] = P;
  return P;
}

function finW(i) {
  const q = (i / (N - 1) - 0.18) / 0.82;
  return q <= 0 ? 0 : Math.sin(Math.PI * Math.min(1, q)) * 15;
}

function spinePath(ctx, fin, jw) {
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const w = (HW[i] + (fin ? finW(i) : 0)) * jw;
    if (i === 0) ctx.moveTo(SPX[i] - w, SPY[i]);
    else ctx.lineTo(SPX[i] - w, SPY[i]);
  }
  for (let i = N - 1; i >= 0; i--) {
    const w = (HW[i] + (fin ? finW(i) : 0)) * jw;
    ctx.lineTo(SPX[i] + w, SPY[i]);
  }
  ctx.closePath();
}

/** Patita remando; ang ya lleva el signo del lado. */
function leg(ctx, bx, by, s, ang, len, wid, P) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(ang);
  ctx.fillStyle = P.leg;
  ctx.beginPath();
  ctx.ellipse(s * len * 0.5, 0, len * 0.5, wid, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = P.light;
  for (let j = -1; j <= 1; j++) {
    ctx.beginPath();
    ctx.arc(s * len * 0.96, j * wid * 0.62, wid * 0.34, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Rama de branquia plumosa: tallo curvo + filamentos a ambos lados. ang = radianes hacia arriba desde la horizontal. */
function gill(ctx, bx, by, s, ang, L, P) {
  const dx = s * Math.cos(ang);
  const dy = -Math.sin(ang);
  const ex = bx + dx * L;
  const ey = by + dy * L;
  const cx = bx + dx * L * 0.5;
  const cy = by + dy * L * 0.5 - L * 0.14;
  ctx.lineCap = 'round';
  ctx.strokeStyle = P.gill;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(cx, cy, ex, ey);
  ctx.stroke();
  ctx.strokeStyle = P.gillL;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  for (let f = 0; f < 8; f++) {
    const u = 0.16 + f * 0.105;
    const v = 1 - u;
    const x = v * v * bx + 2 * u * v * cx + u * u * ex;
    const y = v * v * by + 2 * u * v * cy + u * u * ey;
    let tx = 2 * v * (cx - bx) + 2 * u * (ex - cx);
    let ty = 2 * v * (cy - by) + 2 * u * (ey - cy);
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const fl = 24 * (1 - u * 0.4);
    for (let q = -1; q <= 1; q += 2) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + (tx * 0.5 - ty * 0.85 * q) * fl, y + (ty * 0.5 + tx * 0.85 * q) * fl);
    }
  }
  ctx.stroke();
  ctx.fillStyle = P.gillL;
  ctx.beginPath();
  ctx.arc(ex, ey, 3.6, 0, TAU);
  ctx.fill();
}

/** Dibuja al ajolote. env = { t, tint } */
export function drawPlayer(ctx, state, V, env) {
  const p = state.player;
  const s = V.s0;
  const px = sx(V, p.x, V.d0);
  const py = V.yPlayer;
  const t = env.t;
  const rt = performance.now() * 0.001;
  const dt = Math.min(0.05, Math.max(0, rt - lastRt));
  lastRt = rt;
  const underwater = p.mode === 'dive';
  const jumping = p.mode === 'jump';
  const hPx = Math.max(0, p.h) * s;
  const dash = p.dashT > 0;
  const spd = clamp(state.speed / 30, 0, 1);

  // reloj de nado: la frecuencia sube con la velocidad (la fase se acumula, sin saltos)
  phase += dt * (6.5 + spd * 7.5 + (dash ? 3 : 0));
  jfS += ((jumping ? 1 : 0) - jfS) * Math.min(1, dt * 14);
  const jf = jfS;
  const depthK = clamp(-p.h / MOVE.diveDepth, 0, 1);
  const P = palette(Math.round(depthK * 4));

  // sombra
  const shadowA = clamp(0.3 - hPx / (s * 6), 0.05, 0.3);
  ctx.fillStyle = `rgba(0,30,50,${underwater ? 0.1 : shadowA})`;
  ctx.beginPath();
  ctx.ellipse(px, py + 2, s * 0.85, s * 0.2, 0, 0, TAU);
  ctx.fill();

  // estela: V de espuma + ondas que se abren detrás + gotitas de espuma
  if (!p.dead && !underwater) {
    const wa = clamp(1 - hPx / (s * 1.6), 0, 1) * (0.55 + spd * 0.45);
    if (wa > 0.02) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#fff';
      ctx.globalAlpha = wa * (0.42 + 0.1 * Math.sin(t * 9));
      ctx.lineWidth = Math.max(1.5, s * 0.04);
      ctx.beginPath();
      ctx.moveTo(px - s * 0.5, py + s * 0.06);
      ctx.quadraticCurveTo(px - s * 1.0, py + s * 0.5, px - s * 1.6, py + s * 1.0);
      ctx.moveTo(px + s * 0.5, py + s * 0.06);
      ctx.quadraticCurveTo(px + s * 1.0, py + s * 0.5, px + s * 1.6, py + s * 1.0);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const u = (rt * (0.7 + spd * 0.9) + i / 3) % 1;
        ctx.globalAlpha = wa * (1 - u) * 0.5;
        ctx.lineWidth = Math.max(1.2, s * 0.04) * (1 - u * 0.5);
        ctx.beginPath();
        ctx.ellipse(px + Math.sin(phase - u * 3) * s * 0.1, py + s * (0.2 + u * 1.0), s * (0.45 + u * 0.9), s * (0.07 + u * 0.2), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 8; i++) {
        const u = (rt * 1.1 + i * 0.13) % 1;
        const side = i & 1 ? 1 : -1;
        ctx.globalAlpha = wa * (1 - u) * 0.75;
        ctx.beginPath();
        ctx.arc(px + side * s * (0.45 + u * 1.15) + Math.sin(rt * 5 + i) * s * 0.04, py + s * (0.08 + u * 0.95), Math.max(1, s * 0.04 * (1 - u * 0.6)), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // chinampa-dash: balsa de flores bajo el ajolote
  if (dash) {
    ctx.fillStyle = rgrad(ctx, px, py - s * 0.5, s * 0.2, s * 2.2, [
      [0, 'rgba(255,220,90,0.55)'],
      [1, 'rgba(255,170,40,0)'],
    ]);
    circle(ctx, px, py - s * 0.5, s * 2.2);
    ctx.fill();
    ctx.fillStyle = '#5a3b22';
    ctx.beginPath();
    ctx.ellipse(px, py + s * 0.02, s * 1.15, s * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#4fa844';
    ctx.beginPath();
    ctx.ellipse(px, py - s * 0.04, s * 1.05, s * 0.25, 0, 0, TAU);
    ctx.fill();
  }

  const blink = p.iframes > 0 && !dash && Math.floor(t * 18) % 2 === 0;
  let alpha = 1;
  if (underwater) alpha = 0.55;
  if (blink) alpha *= 0.4;
  if (p.dead) alpha = clamp(1 - (p.deadT - 0.4) / 0.7, 0.15, 1);

  const bob = p.mode === 'swim' ? Math.sin(phase * 0.8) * s * 0.03 : 0;
  const depthPx = p.h < 0 ? -p.h * s * 0.55 : 0;
  const cy = py - hPx + depthPx + bob;
  const k = (s * 1.4) / 220; // escala del dibujo (unidades de 220 px)

  // burbujas al bucear y gotas al saltar (reutiliza el sistema de partículas de fx.js)
  if (env.t !== lastEnvT) {
    lastEnvT = env.t;
    if (!p.dead) {
      if (underwater) {
        bubT -= dt;
        if (bubT <= 0) {
          bubT = 0.06 + Math.random() * 0.08;
          bubbles(px + (Math.random() - 0.5) * s * 0.5, cy - s * 0.35, Math.random() < 0.3 ? 2 : 1);
        }
      } else if (jumping && p.h > 0.05) {
        dripT -= dt;
        if (dripT <= 0) {
          dripT = 0.045;
          drip(px + (Math.random() - 0.5) * s * 0.9, cy + s * (0.1 + Math.random() * 0.3), 1);
        }
      }
    }
  }

  const sq = p.squash;
  const sxScale = 1 + sq * 0.5;
  const syScale = 1 - sq * 0.5 + (jumping ? clamp(p.vy * 0.012, -0.12, 0.14) : 0);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px, cy);
  ctx.rotate(p.tilt * 1.6 + (p.dead ? p.spin : 0)); // inclinación hacia el lado al cambiar de carril
  ctx.scale(sxScale, syScale * (p.dead ? -1 : 1));
  ctx.scale(k, k); // desde aquí: unidades de 220 px; origen = nivel del agua, la cabeza hacia -y
  ctx.lineJoin = 'round';

  // columna: ondulación sinusoidal cuerpo + cola (más amplia hacia la punta), desfasada
  const stretch = 1 + 0.2 * jf;
  const amp = (13 + spd * 5) * (1 - 0.65 * jf) * (underwater ? 1.15 : 1);
  const bend = -p.tilt * 70;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    SPY[i] = -62 + 150 * u * stretch;
    SPX[i] = Math.sin(phase - u * 3.6) * amp * (0.12 + u * 0.95) + bend * u * u;
    HW[i] = u < 0.34 ? 46 - u * 14 : 4 + 37 * Math.pow(1 - (u - 0.34) / 0.66, 0.8);
  }
  const jw = 1 - 0.1 * jf;

  // aleta dorsal translúcida de la cola
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillStyle = P.fin;
  spinePath(ctx, true, jw);
  ctx.fill();
  ctx.strokeStyle = P.fin;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 4; i < N - 1; i += 2) {
    const w = HW[i] * jw;
    const fw = (HW[i] + finW(i)) * jw;
    ctx.moveTo(SPX[i] - w, SPY[i]);
    ctx.lineTo(SPX[i] - fw, SPY[i] + 3);
    ctx.moveTo(SPX[i] + w, SPY[i]);
    ctx.lineTo(SPX[i] + fw, SPY[i] + 3);
  }
  ctx.stroke();
  ctx.globalAlpha = alpha;

  // 4 patitas: remo alterno en diagonal (se pliegan hacia atrás al saltar)
  const lbase = 0.55 + 0.7 * jf;
  const lamp = 0.5 * (1 - 0.7 * jf);
  for (let side = -1; side <= 1; side += 2) {
    const fo = side < 0 ? 0 : Math.PI;
    leg(ctx, SPX[4] + side * HW[4] * 0.9, SPY[4] + 4, side, side * (lbase + Math.sin(phase + fo + Math.PI) * lamp), 42, 10, P);
    leg(ctx, SPX[1] + side * HW[1] * 0.85, SPY[1], side, side * (lbase - 0.1 + Math.sin(phase + fo) * lamp), 36, 9.5, P);
  }

  // cuerpo + cola
  ctx.fillStyle = P.body;
  spinePath(ctx, false, jw);
  ctx.fill();
  ctx.strokeStyle = P.light; // vientre más claro asomando por los costados
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = P.dark; // línea dorsal
  ctx.globalAlpha = alpha * 0.55;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(SPX[1], SPY[1]);
  for (let i = 2; i < N - 1; i++) ctx.lineTo(SPX[i], SPY[i]);
  ctx.stroke();
  ctx.fillStyle = P.spot; // pecas
  ctx.globalAlpha = alpha * 0.32;
  for (let j = 0; j < SPOTS.length; j++) {
    const sp = SPOTS[j];
    const i = Math.round(sp[0] * (N - 1) * 1.6);
    if (i >= N) continue;
    ctx.beginPath();
    ctx.arc(SPX[i] + sp[1] * HW[i], SPY[i], sp[2], 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = alpha;

  // cabeza ancha y aplanada, con las branquias externas a cada lado
  ctx.save();
  ctx.translate(SPX[0] * 0.6 + p.tilt * 30, -88);
  ctx.scale(1.18, 1.1);
  ctx.rotate(Math.sin(phase - 0.5) * 0.05 + p.tilt * 0.3);
  const gsw = 0.14 * (underwater ? 1.5 : 1);
  for (let sd = -1; sd <= 1; sd += 2) {
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(phase * 0.9 + i * 1.1 + (sd > 0 ? 0.9 : 0)) * gsw;
      const ang = lerp(GILL_ANG[i] + sway, -0.95 + i * 0.12 + sway * 0.4, jf); // al saltar, hacia atrás
      gill(ctx, sd * 42, -4 + (i - 1) * 11, sd, ang, GILL_LEN[i] * (1 - 0.1 * jf), P);
    }
  }
  ctx.fillStyle = P.head;
  ctx.beginPath();
  ctx.ellipse(0, 0, 49, 31, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = P.line;
  ctx.globalAlpha = alpha * 0.55;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.4;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(-6, -17, 24, 7, -0.15, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.5;
  ctx.fillStyle = P.cheek;
  for (let sd = -1; sd <= 1; sd += 2) {
    ctx.beginPath();
    ctx.ellipse(sd * 34, 5, 8, 5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = alpha;
  // ojos pequeños y oscuros + sonrisa
  for (let sd = -1; sd <= 1; sd += 2) {
    ctx.fillStyle = P.light;
    ctx.beginPath();
    ctx.arc(sd * 26, -11, 9.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#16162a';
    ctx.beginPath();
    ctx.arc(sd * 26, -11, 6.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sd * 26 - 2, -13.5, 2.3, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = '#a73a68';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -14, 13, 0.18 * Math.PI, 0.82 * Math.PI);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
  ctx.globalAlpha = 1;

  // velo de agua sobre el ajolote sumergido y anillo en la superficie
  if (underwater) {
    ctx.fillStyle = 'rgba(40,150,190,0.22)';
    ctx.beginPath();
    ctx.ellipse(px, py - s * 0.2, s * 0.95, s * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    const q = (t * 2.2) % 1;
    ctx.beginPath();
    ctx.ellipse(px, py, s * (0.7 + q * 0.7), s * (0.14 + q * 0.14), 0, 0, TAU);
    ctx.stroke();
  }
}
