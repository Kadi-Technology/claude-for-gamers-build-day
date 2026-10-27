// El ajolote: movimiento (carriles, salto de 0.7 s con fast-fall, buceo de 0.8 s con oxígeno) y dibujo.

import { MOVE, WORLD, laneX } from './config.js';
import { spr } from './engine.js';
import { sx } from './track.js';
import { TAU, clamp, lerp, ell, circle, vgrad, rgrad } from './art.js';

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

// ================================================================ sprites

function bodySprite() {
  return spr('xoc:axo:body', 220, 210, (ctx) => {
    const cx = 110;
    // patas traseras
    ctx.fillStyle = '#f48fb4';
    for (const s of [-1, 1]) {
      ell(ctx, cx + s * 50, 128, 17, 11, s * 0.5);
      ctx.fill();
      ctx.fillStyle = '#ffd0e0';
      for (let k = -1; k <= 1; k++) {
        circle(ctx, cx + s * 58 + k * 5, 137 + Math.abs(k) * 1.5, 3.4);
        ctx.fill();
      }
      ctx.fillStyle = '#f48fb4';
    }
    // cuerpo
    ctx.fillStyle = vgrad(ctx, 62, 150, [
      [0, '#ffc1d6'],
      [1, '#f58bb0'],
    ]);
    ell(ctx, cx, 106, 50, 44);
    ctx.fill();
    // cresta dorsal
    ctx.strokeStyle = 'rgba(214,92,140,0.7)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, 70);
    ctx.quadraticCurveTo(cx + 4, 106, cx, 146);
    ctx.stroke();
    // pecas
    ctx.fillStyle = 'rgba(200,70,120,0.28)';
    for (const [dx, dy, r] of [[-26, 100, 4.5], [24, 112, 5], [-18, 128, 3.5], [30, 94, 3.8], [-34, 116, 3.2], [12, 134, 4]]) {
      circle(ctx, cx + dx, dy, r);
      ctx.fill();
    }
    // patas delanteras
    ctx.fillStyle = '#f9a4c3';
    for (const s of [-1, 1]) {
      ell(ctx, cx + s * 44, 66, 16, 10, -s * 0.5);
      ctx.fill();
    }
    // cabeza
    ctx.fillStyle = vgrad(ctx, 24, 78, [
      [0, '#ffd9e6'],
      [1, '#ffb3cd'],
    ]);
    ell(ctx, cx, 52, 42, 32);
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,92,140,0.45)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ell(ctx, cx - 4, 38, 18, 8, -0.2);
    ctx.fill();
    // ojos
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#ffd9e6';
      circle(ctx, cx + s * 19, 42, 10);
      ctx.fill();
      ctx.fillStyle = '#16162a';
      circle(ctx, cx + s * 19, 41, 7.2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      circle(ctx, cx + s * 19 - 2, 38, 2.6);
      ctx.fill();
    }
    // mejillas
    ctx.fillStyle = 'rgba(255,95,143,0.4)';
    for (const s of [-1, 1]) {
      ell(ctx, cx + s * 30, 58, 7, 4.5);
      ctx.fill();
    }
  });
}

function tailSprite() {
  return spr('xoc:axo:tail', 120, 100, (ctx) => {
    const cx = 60;
    ctx.fillStyle = vgrad(ctx, 0, 100, [
      [0, '#f58bb0'],
      [1, '#ffc1d6'],
    ]);
    ctx.beginPath();
    ctx.moveTo(cx - 17, 0);
    ctx.bezierCurveTo(cx - 28, 40, cx - 46, 70, cx - 22, 94);
    ctx.quadraticCurveTo(cx, 104, cx + 22, 94);
    ctx.bezierCurveTo(cx + 46, 70, cx + 28, 40, cx + 17, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,92,140,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214,92,140,0.35)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) {
      ctx.moveTo(cx + k * 7, 14);
      ctx.lineTo(cx + k * 14, 88);
    }
    ctx.stroke();
  });
}

function drawGills(ctx, cx, cy, k, t, dash) {
  // tres ramas por lado; k = px por unidad del sprite
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(t * 7 + i * 1.2 + (s > 0 ? 0.8 : 0)) * 0.1;
      const ang = -0.1 + i * 0.5 + sway; // radianes desde el eje horizontal hacia arriba
      const bx = cx + s * 36 * k;
      const by = cy + (i - 1) * 8 * k;
      const len = (54 - i * 4) * k;
      const ex = bx + s * Math.cos(ang) * len;
      const ey = by - Math.sin(ang) * len;
      const mx = bx + s * Math.cos(ang - 0.35) * len * 0.5;
      const my = by - Math.sin(ang - 0.35) * len * 0.5;
      ctx.strokeStyle = dash ? '#ff2f7a' : '#ff4f87';
      ctx.lineWidth = 8 * k;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
      ctx.strokeStyle = '#ff8fb1';
      ctx.lineWidth = 3.2 * k;
      for (let f = 1; f <= 4; f++) {
        const u = f / 5;
        const px = (1 - u) * (1 - u) * bx + 2 * u * (1 - u) * mx + u * u * ex;
        const py = (1 - u) * (1 - u) * by + 2 * u * (1 - u) * my + u * u * ey;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + s * 9 * k, py - 9 * k);
        ctx.stroke();
      }
    }
  }
}

/** Dibuja al ajolote. env = { t, tint } */
export function drawPlayer(ctx, state, V, env) {
  const p = state.player;
  const s = V.s0;
  const px = sx(V, p.x, V.d0);
  const py = V.yPlayer;
  const t = env.t;
  const underwater = p.mode === 'dive';
  const hPx = Math.max(0, p.h) * s;
  const dash = p.dashT > 0;

  // estela y sombra sobre el agua
  const shadowA = clamp(0.3 - hPx / (s * 6), 0.05, 0.3);
  ctx.fillStyle = `rgba(0,30,50,${underwater ? 0.1 : shadowA})`;
  ctx.beginPath();
  ctx.ellipse(px, py + 2, s * 0.85, s * 0.2, 0, 0, TAU);
  ctx.fill();
  if (!p.dead) {
    ctx.strokeStyle = `rgba(255,255,255,${0.32 + 0.1 * Math.sin(t * 9)})`;
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px - s * 0.5, py + s * 0.06);
    ctx.quadraticCurveTo(px - s * 1.0, py + s * 0.5, px - s * 1.6, py + s * 1.0);
    ctx.moveTo(px + s * 0.5, py + s * 0.06);
    ctx.quadraticCurveTo(px + s * 1.0, py + s * 0.5, px + s * 1.6, py + s * 1.0);
    ctx.stroke();
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
    ctx.ellipse(px, py + s * 0.02 - hPx * 0.0, s * 1.15, s * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#4fa844';
    ctx.beginPath();
    ctx.ellipse(px, py - s * 0.04, s * 1.05, s * 0.25, 0, 0, TAU);
    ctx.fill();
  }

  const blink = p.iframes > 0 && !dash && Math.floor(t * 18) % 2 === 0;
  ctx.save();
  let alpha = 1;
  if (underwater) alpha = 0.55;
  if (blink) alpha *= 0.4;
  if (p.dead) alpha = clamp(1 - (p.deadT - 0.4) / 0.7, 0.15, 1);
  ctx.globalAlpha = alpha;

  const bob = p.mode === 'swim' ? Math.sin(t * 8) * s * 0.03 : 0;
  const depthPx = p.h < 0 ? -p.h * s * 0.55 : 0;
  const cy = py - hPx + depthPx + bob;
  const k = (s * 1.4) / 220; // escala del sprite
  const sq = p.squash;
  const sxScale = 1 + sq * 0.5;
  const syScale = 1 - sq * 0.5 + (p.mode === 'jump' ? clamp(p.vy * 0.012, -0.12, 0.14) : 0);

  ctx.translate(px, cy);
  ctx.rotate(p.tilt + (p.dead ? p.spin : 0));
  ctx.scale(sxScale, syScale * (p.dead ? -1 : 1));

  // cola (detrás del cuerpo, hacia la cámara)
  const wig = Math.sin(t * 10) * 0.28 * (p.mode === 'swim' ? 1 : 0.4);
  ctx.save();
  ctx.translate(0, -6 * k);
  ctx.rotate(wig);
  ctx.drawImage(tailSprite(), -60 * k, 0, 120 * k, 100 * k);
  ctx.restore();
  // branquias detrás de la cabeza
  drawGills(ctx, 0, -88 * k, k, t, dash);
  // cuerpo (el origen está a la altura del agua)
  ctx.drawImage(bodySprite(), -110 * k, -140 * k, 220 * k, 210 * k);
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
