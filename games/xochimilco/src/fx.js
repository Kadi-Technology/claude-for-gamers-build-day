// Juice: partículas (salpicaduras, pétalos, burbujas, escombros, confeti), sacudida de pantalla y líneas de velocidad.
// Todo en coordenadas de pantalla (px lógicos del canvas).

import { TAU, hash, clamp } from './art.js';

const MAX = 320;
const parts = [];
let shakeAmp = 0;
let shakeT = 0;
let shakeDur = 0.0001;
let reduced = false;
try {
  reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
} catch {
  reduced = false;
}

export const flash = { a: 0, r: 255, g: 255, b: 255 };

export function resetFx() {
  parts.length = 0;
  shakeAmp = 0;
  shakeT = 0;
  flash.a = 0;
}

export function shake(amp, dur = 0.3) {
  const a = reduced ? amp * 0.25 : amp;
  if (a >= shakeAmp * (shakeT / shakeDur)) {
    shakeAmp = a;
    shakeT = dur;
    shakeDur = dur;
  }
}

export function shakeOffset() {
  if (shakeT <= 0) return { x: 0, y: 0 };
  const k = shakeAmp * (shakeT / shakeDur);
  return { x: (Math.random() - 0.5) * 2 * k, y: (Math.random() - 0.5) * 2 * k };
}

export function flashScreen(r, g, b, a) {
  flash.r = r;
  flash.g = g;
  flash.b = b;
  flash.a = Math.max(flash.a, reduced ? a * 0.4 : a);
}

function add(p) {
  if (parts.length >= MAX) parts.shift();
  parts.push(p);
}

export function splash(x, y, power = 1, col = '#d8f6ff') {
  const n = Math.round(10 * power);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
    const v = (160 + Math.random() * 260) * Math.sqrt(power);
    add({ k: 'drop', x, y, vx: Math.cos(a) * v * 0.7, vy: Math.sin(a) * v, g: 900, life: 0.5 + Math.random() * 0.35, max: 0.85, size: 2 + Math.random() * 3.5 * power, col });
  }
  ring(x, y, 22 * power, 'rgba(255,255,255,0.8)');
}

export function ring(x, y, r, col = 'rgba(255,255,255,0.8)', life = 0.55) {
  add({ k: 'ring', x, y, vx: 0, vy: 0, g: 0, life, max: life, size: r, col });
}

export function petals(x, y, n = 6) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const v = 60 + Math.random() * 180;
    add({
      k: 'petal',
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 90,
      g: 260,
      life: 0.6 + Math.random() * 0.4,
      max: 1,
      size: 4 + Math.random() * 4,
      col: Math.random() < 0.5 ? '#ff9f1c' : '#ffc83d',
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 12,
    });
  }
}

export function bubbles(x, y, n = 5) {
  for (let i = 0; i < n; i++) {
    add({ k: 'bubble', x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 24, vy: -40 - Math.random() * 70, g: -30, life: 0.7 + Math.random() * 0.6, max: 1.2, size: 2 + Math.random() * 4, col: 'rgba(220,250,255,0.9)' });
  }
}

/** Gotitas sueltas que caen del cuerpo mojado (sin anillo). */
export function drip(x, y, n = 1, col = '#d8f6ff') {
  for (let i = 0; i < n; i++) {
    add({ k: 'drop', x, y, vx: (Math.random() - 0.5) * 50, vy: 20 + Math.random() * 70, g: 900, life: 0.3 + Math.random() * 0.25, max: 0.55, size: 1.6 + Math.random() * 2.2, col });
  }
}

export function debris(x, y, n = 14, cols = ['#8a6038', '#c9a35a', '#e63946']) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.8;
    const v = 200 + Math.random() * 380;
    add({
      k: 'debris',
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      g: 1100,
      life: 0.7 + Math.random() * 0.5,
      max: 1.2,
      size: 4 + Math.random() * 8,
      col: cols[i % cols.length],
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 16,
    });
  }
}

export function sparks(x, y, n = 10, col = '#fff2a8') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const v = 100 + Math.random() * 240;
    add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, life: 0.45 + Math.random() * 0.3, max: 0.75, size: 3 + Math.random() * 4, col });
  }
}

export function confetti(w, h, n = 90) {
  const cols = ['#ff9f1c', '#ffc83d', '#ff5ca8', '#2ec4b6', '#8f5bff', '#ffffff'];
  for (let i = 0; i < n; i++) {
    add({
      k: 'debris',
      x: Math.random() * w,
      y: -20 - Math.random() * h * 0.4,
      vx: (Math.random() - 0.5) * 120,
      vy: 80 + Math.random() * 220,
      g: 90,
      life: 3 + Math.random() * 2.5,
      max: 5.5,
      size: 5 + Math.random() * 7,
      col: cols[i % cols.length],
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 10,
    });
  }
}

export function updateFx(dt) {
  if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
  if (flash.a > 0) flash.a = Math.max(0, flash.a - dt * 2.4);
  let w = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.rot !== undefined) p.rot += p.vr * dt;
    parts[w++] = p;
  }
  parts.length = w;
}

export function drawFx(ctx) {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const k = clamp(p.life / p.max, 0, 1);
    switch (p.k) {
      case 'drop':
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
        break;
      case 'ring': {
        const u = 1 - k;
        ctx.globalAlpha = k * 0.9;
        ctx.strokeStyle = p.col;
        ctx.lineWidth = 2 + 3 * k;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * (0.4 + u * 2.2), p.size * (0.4 + u * 2.2) * 0.3, 0, 0, TAU);
        ctx.stroke();
        break;
      }
      case 'petal':
        ctx.globalAlpha = Math.min(1, k * 1.8);
        ctx.fillStyle = p.col;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        break;
      case 'bubble':
        ctx.globalAlpha = Math.min(1, k * 1.5) * 0.9;
        ctx.strokeStyle = p.col;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
        break;
      case 'debris':
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillStyle = p.col;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
        break;
      case 'spark':
        ctx.globalAlpha = k;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * k, 0, TAU);
        ctx.fill();
        break;
      default:
        break;
    }
  }
  ctx.globalAlpha = 1;
}

/** Líneas de velocidad que salen del punto de fuga. intensity 0..1. */
export function drawSpeedLines(ctx, V, intensity, t, col = '255,255,255') {
  if (intensity <= 0.02) return;
  const n = 26;
  const cx = V.cx + V.curve * V.w * 0.12;
  const cy = V.horizon + 8;
  const R = Math.hypot(V.w, V.h);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const ang = hash(i * 13 + 1) * Math.PI; // 0..π: solo hacia abajo y a los lados
    const speed = 0.9 + hash(i * 7 + 3) * 0.9;
    const ph = (t * speed + hash(i * 5 + 9)) % 1;
    const r0 = (0.14 + ph * ph * 0.95) * R * 0.62;
    const len = (0.04 + ph * 0.22) * R * 0.5 * (0.6 + intensity);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    ctx.strokeStyle = `rgba(${col},${(0.05 + 0.34 * intensity) * Math.sin(Math.PI * ph)})`;
    ctx.lineWidth = 1 + ph * 3.2;
    ctx.beginPath();
    ctx.moveTo(cx + dx * r0, cy + dy * r0);
    ctx.lineTo(cx + dx * (r0 + len), cy + dy * (r0 + len));
    ctx.stroke();
  }
}
