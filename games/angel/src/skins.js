// skins.js (ANG-W) - Las 6 skins de Ángel Survivors.
// Cada skin se dibuja con formas de canvas (y unos pocos emojis) en un espacio de diseño de 100x100,
// se pre-renderiza UNA vez con sprites.js y se reutiliza (el flip horizontal lo hace player.js).
// Legibles a ~48 px: contorno oscuro grueso, cabezas grandes y colores muy distintos entre skins.

import { sprite, emoji } from '../../../shared/engine/sprites.js';
import { TAU, roundRect } from './world.js';

export const SKINS = [
  { id: 'luchador', nombre: 'Luchador', desc: 'Máscara, capa y mucho corazón', color: '#e63946' },
  { id: 'catrina', nombre: 'Catrina', desc: 'Elegancia de ultratumba con flores', color: '#c026d3' },
  { id: 'charro', nombre: 'Charro', desc: 'Sombrero ancho y botonadura de oro', color: '#1f8a5b' },
  { id: 'calaverita', nombre: 'Calaverita', desc: 'Dulce de azúcar y mucho color', color: '#22d3ee' },
  { id: 'chinelo', nombre: 'Chinelo', desc: 'Barba puntiaguda y túnica bordada', color: '#facc15' },
  { id: 'mariachi', nombre: 'Mariachi', desc: 'Traje negro con plata y moño', color: '#cfd3dc' },
];

export const SKIN_IDS = SKINS.map((s) => s.id);

/** Paletas intercambiables de la máscara del Luchador (el color de cada jugador en cooperativo). */
export const LUCHADOR_PALETTES = [
  { mask: '#e63946', accent: '#ffd23f', trim: '#ffffff', cape: '#1d4ed8' },
  { mask: '#2563eb', accent: '#f8fafc', trim: '#facc15', cape: '#dc2626' },
  { mask: '#16a34a', accent: '#fde047', trim: '#ffffff', cape: '#7c3aed' },
  { mask: '#9333ea', accent: '#22d3ee', trim: '#fde047', cape: '#ea580c' },
];

export function isSkinId(id) {
  return SKIN_IDS.indexOf(id) !== -1;
}

export function skinInfo(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

// ---------------------------------------------------------------------------
// Utilidades de dibujo (coordenadas de diseño 0..100)
// ---------------------------------------------------------------------------
const OUT = '#1c1030';

function paint(ctx, fill, lw, stroke) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw) { ctx.strokeStyle = stroke || OUT; ctx.lineWidth = lw; ctx.stroke(); }
}

function circle(ctx, x, y, r, fill, lw = 3, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  paint(ctx, fill, lw, stroke);
}

function oval(ctx, x, y, rx, ry, fill, lw = 3, stroke, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  paint(ctx, fill, lw, stroke);
}

function poly(ctx, pts, fill, lw = 3, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  paint(ctx, fill, lw, stroke);
}

function rrect(ctx, x, y, w, h, r, fill, lw = 3, stroke) {
  roundRect(ctx, x, y, w, h, r);
  paint(ctx, fill, lw, stroke);
}

function line(ctx, x0, y0, x1, y1, color, lw) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function flower(ctx, x, y, r, petal, center, n = 5, lw = 1.2) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    circle(ctx, x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.46, petal, lw);
  }
  circle(ctx, x, y, r * 0.38, center, lw);
}

function star(ctx, x, y, ro, ri, fill, lw = 1.5, stroke, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    const r = i % 2 === 0 ? ro : ri;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  paint(ctx, fill, lw, stroke);
}

function drawEmoji(ctx, ch, cx, cy, s, k) {
  const c = emoji(ch, Math.max(8, Math.round(s * k)));
  if (c) ctx.drawImage(c, cx - s / 2, cy - s / 2, s, s);
}

// Brazos y manos genéricos (pegados al torso)
function arms(ctx, sleeve, skin, cuff) {
  for (const sx of [-1, 1]) {
    const ax = 50 + sx * 27;
    oval(ctx, ax, 71, 7, 13, sleeve, 3, OUT, sx * 0.12);
    if (cuff) oval(ctx, ax + sx * 1.5, 80, 7.2, 3.6, cuff, 2, OUT, sx * 0.12);
    circle(ctx, ax + sx * 2.5, 85, 5.2, skin, 2.6);
  }
}

// ---------------------------------------------------------------------------
// Luchador
// ---------------------------------------------------------------------------
function drawLuchador(ctx, k, v) {
  const P = LUCHADOR_PALETTES[v];
  const skin = '#e9a977';
  // Capa
  ctx.beginPath();
  ctx.moveTo(34, 52);
  ctx.lineTo(66, 52);
  ctx.lineTo(84, 90);
  ctx.quadraticCurveTo(78, 99, 70, 93);
  ctx.quadraticCurveTo(60, 99, 50, 93);
  ctx.quadraticCurveTo(40, 99, 30, 93);
  ctx.quadraticCurveTo(22, 99, 16, 90);
  ctx.closePath();
  paint(ctx, P.cape, 3);
  ctx.beginPath();
  ctx.moveTo(40, 58); ctx.lineTo(24, 90); ctx.moveTo(60, 58); ctx.lineTo(76, 90);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Torso
  rrect(ctx, 30, 55, 40, 32, 9, skin, 3);
  line(ctx, 50, 58, 50, 74, 'rgba(120,60,30,0.45)', 1.6);
  ctx.beginPath(); ctx.arc(41, 66, 7, 0.2, Math.PI - 0.4); ctx.strokeStyle = 'rgba(120,60,30,0.45)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.beginPath(); ctx.arc(59, 66, 7, 0.4, Math.PI - 0.2); ctx.stroke();
  // Pantalón y cinturón de campeón
  rrect(ctx, 30, 79, 40, 14, 5, P.mask, 3);
  line(ctx, 50, 81, 50, 92, P.accent, 3.4);
  rrect(ctx, 29, 76, 42, 8, 3, '#f5c518', 2.6);
  star(ctx, 50, 80, 5, 2.2, P.mask, 1.6);
  // Brazos con muñequeras
  for (const sx of [-1, 1]) {
    const ax = 50 + sx * 27;
    oval(ctx, ax, 69, 7, 13, skin, 3, OUT, sx * 0.12);
    oval(ctx, ax + sx * 1.5, 79, 8, 4.4, P.accent, 2.4, OUT, sx * 0.12);
    circle(ctx, ax + sx * 2.5, 85.5, 5.6, P.mask, 2.6);
  }
  // Cabeza + máscara
  circle(ctx, 50, 34, 21, skin, 0);
  ctx.save();
  ctx.beginPath();
  ctx.arc(50, 34, 21, 0, TAU);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(15, 5); ctx.lineTo(85, 5); ctx.lineTo(85, 45);
  ctx.quadraticCurveTo(50, 58, 15, 45);
  ctx.closePath();
  ctx.fillStyle = P.mask;
  ctx.fill();
  poly(ctx, [[45, 10], [55, 10], [57, 24], [50, 46], [43, 24]], P.accent, 0);
  // Rayos laterales de la máscara
  poly(ctx, [[27, 26], [36, 30], [29, 38]], P.accent, 0);
  poly(ctx, [[73, 26], [64, 30], [71, 38]], P.accent, 0);
  ctx.restore();
  // Ojos con borde de color
  for (const sx of [-1, 1]) {
    oval(ctx, 50 + sx * 9.5, 34, 7, 5, '#ffffff', 2.4, P.trim, sx * 0.28);
    oval(ctx, 50 + sx * 9.5, 34, 7.9, 5.9, null, 1.6, OUT, sx * 0.28);
    circle(ctx, 50 + sx * 9, 34.6, 2.7, '#1c1030', 0);
  }
  rrect(ctx, 44, 46.5, 12, 5, 2.5, '#f1c7a3', 1.8);
  circle(ctx, 50, 34, 21, null, 3);
  // Nudo de la máscara
  circle(ctx, 50, 56, 3, P.accent, 2);
}

// ---------------------------------------------------------------------------
// Catrina
// ---------------------------------------------------------------------------
function drawCatrina(ctx, k) {
  // Cabello largo detrás
  rrect(ctx, 25, 31, 50, 34, 14, '#150d22', 3);
  // Vestido
  ctx.beginPath();
  ctx.moveTo(36, 61);
  ctx.lineTo(64, 61);
  ctx.quadraticCurveTo(72, 78, 79, 94);
  ctx.lineTo(21, 94);
  ctx.quadraticCurveTo(28, 78, 36, 61);
  ctx.closePath();
  paint(ctx, '#3b1a5c', 3);
  // Estampado de flores del vestido
  const dots = [[34, 80, '#ff8c1a'], [48, 86, '#ff4fa3'], [62, 78, '#ffd23f'], [41, 70, '#ff4fa3'], [58, 68, '#ff8c1a'], [70, 88, '#ff4fa3'], [28, 88, '#ffd23f']];
  for (const d of dots) circle(ctx, d[0], d[1], 2.8, d[2], 1);
  // Encaje del dobladillo
  for (let x = 25; x <= 75; x += 6.2) circle(ctx, x, 93.5, 3.2, '#fff7ea', 1.6);
  // Brazos (mangas moradas, manos de hueso)
  for (const sx of [-1, 1]) {
    const ax = 50 + sx * 25;
    oval(ctx, ax, 71, 6.5, 12, '#5b2a86', 3, OUT, sx * 0.14);
    circle(ctx, ax + sx * 2.5, 84, 5, '#faf3e6', 2.4);
  }
  // Cuello de encaje y escote
  oval(ctx, 50, 63, 14, 5.4, '#fff7ea', 2.4);
  poly(ctx, [[44, 63], [56, 63], [50, 72]], '#ff4fa3', 2);
  // Calavera
  circle(ctx, 50, 44, 18.5, '#faf3e6', 3);
  // Ojos decorados
  for (const sx of [-1, 1]) {
    const ex = 50 + sx * 8.2;
    oval(ctx, ex, 43, 8.6, 9.4, null, 2.6, '#d946ef');
    oval(ctx, ex, 43, 6, 7.2, '#1a1020', 0);
    circle(ctx, ex - 1.4, 40.6, 1.4, '#ffffff', 0);
  }
  poly(ctx, [[50, 47.5], [47.2, 53], [52.8, 53]], '#1a1020', 1);
  circle(ctx, 34.5, 52, 2.3, 'rgba(255,79,163,0.85)', 0);
  circle(ctx, 65.5, 52, 2.3, 'rgba(255,79,163,0.85)', 0);
  ctx.beginPath(); ctx.moveTo(39, 58); ctx.quadraticCurveTo(50, 61, 61, 58);
  ctx.strokeStyle = '#1a1020'; ctx.lineWidth = 2; ctx.stroke();
  for (let x = 42; x <= 58; x += 4) line(ctx, x, 56.5, x, 60.2, '#1a1020', 1.4);
  // Sombrero de ala ancha con flores
  oval(ctx, 50, 29, 37, 9.5, '#2a1740', 3);
  ctx.beginPath();
  ctx.moveTo(35, 28); ctx.quadraticCurveTo(36, 8, 50, 8); ctx.quadraticCurveTo(64, 8, 65, 28);
  ctx.closePath();
  paint(ctx, '#2a1740', 3);
  rrect(ctx, 35.5, 21, 29, 6, 2, '#c026d3', 2);
  flower(ctx, 33, 24, 8.5, '#ff8c1a', '#ffd23f', 6, 1.4);
  flower(ctx, 45, 15, 7.5, '#ff4fa3', '#fff1a8', 5, 1.3);
  flower(ctx, 60, 17, 8.5, '#ffd23f', '#e8590c', 6, 1.4);
  flower(ctx, 70, 29, 6.2, '#e63946', '#ffd23f', 5, 1.2);
  // Rosa en la mano derecha
  drawEmoji(ctx, '🌹', 80, 78, 17, k);
}

// ---------------------------------------------------------------------------
// Charro
// ---------------------------------------------------------------------------
function drawCharro(ctx, k) {
  const skin = '#d9a273';
  const jacket = '#1c6b45';
  const gold = '#f5c518';
  // Lazo
  ctx.beginPath();
  ctx.ellipse(85, 74, 7.5, 13, 0.2, 0, TAU);
  ctx.strokeStyle = OUT; ctx.lineWidth = 5.4; ctx.stroke();
  ctx.strokeStyle = '#d8b077'; ctx.lineWidth = 2.6; ctx.stroke();
  // Pantalón con franja dorada
  rrect(ctx, 31, 78, 38, 16, 5, '#14482e', 3);
  line(ctx, 36, 80, 36, 92, gold, 2.2);
  line(ctx, 64, 80, 64, 92, gold, 2.2);
  // Saco
  rrect(ctx, 28, 58, 44, 29, 10, jacket, 3);
  poly(ctx, [[42, 59], [58, 59], [50, 74]], '#f7f1e3', 1.8);
  poly(ctx, [[46, 60], [54, 60], [50, 66]], '#c0392b', 1.2);
  // Botonadura
  for (const bx of [38.5, 61.5]) {
    for (let by = 66; by <= 84; by += 4.6) circle(ctx, bx, by, 1.9, gold, 1.2);
  }
  rrect(ctx, 28, 83, 44, 5, 2, gold, 2);
  circle(ctx, 50, 85.5, 2.6, '#ffe58a', 1.4);
  // Brazos
  arms(ctx, jacket, skin, gold);
  // Cara
  circle(ctx, 50, 43, 18, skin, 3);
  for (const sx of [-1, 1]) {
    oval(ctx, 50 + sx * 7.4, 41, 3.6, 4, '#ffffff', 1.4);
    circle(ctx, 50 + sx * 7.2, 41.6, 1.9, '#1c1030', 0);
    line(ctx, 50 + sx * 3.6, 35.6, 50 + sx * 11.4, 34.4 + (sx < 0 ? 0.6 : 0), '#1c1030', 2.4);
  }
  // Bigote
  ctx.fillStyle = '#1c1030';
  ctx.beginPath();
  ctx.moveTo(50, 47);
  ctx.quadraticCurveTo(40, 44, 33, 50);
  ctx.quadraticCurveTo(40, 52.5, 50, 51);
  ctx.quadraticCurveTo(60, 52.5, 67, 50);
  ctx.quadraticCurveTo(60, 44, 50, 47);
  ctx.fill();
  ctx.beginPath(); ctx.moveTo(44, 55.5); ctx.quadraticCurveTo(50, 58, 56, 55.5);
  ctx.strokeStyle = '#7a3b2e'; ctx.lineWidth = 1.8; ctx.stroke();
  // Sombrero de charro
  oval(ctx, 50, 29, 42, 11, '#e8c27a', 3);
  oval(ctx, 50, 29, 37, 8.6, null, 1.6, gold);
  ctx.beginPath();
  ctx.moveTo(34, 29); ctx.quadraticCurveTo(34, 9, 50, 8); ctx.quadraticCurveTo(66, 9, 66, 29);
  ctx.quadraticCurveTo(50, 35, 34, 29);
  ctx.closePath();
  paint(ctx, '#f2d596', 3);
  ctx.beginPath(); ctx.moveTo(40, 14); ctx.quadraticCurveTo(50, 17, 60, 14);
  ctx.strokeStyle = 'rgba(120,80,20,0.4)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(34.4, 24); ctx.quadraticCurveTo(50, 30, 65.6, 24); ctx.lineTo(65.8, 29); ctx.quadraticCurveTo(50, 35, 34.2, 29); ctx.closePath();
  paint(ctx, '#b3202a', 2);
  for (let x = 40; x <= 60; x += 5) circle(ctx, x, 29.4 - Math.abs(x - 50) * 0.04, 1.4, gold, 0.8);
}

// ---------------------------------------------------------------------------
// Calaverita
// ---------------------------------------------------------------------------
function drawCalaverita(ctx, k) {
  // Cuerpecito
  rrect(ctx, 33, 62, 34, 28, 11, '#7c3aed', 3);
  const conf = [[40, 70, '#facc15'], [58, 68, '#22d3ee'], [48, 80, '#ff4fa3'], [62, 80, '#facc15'], [38, 84, '#22d3ee']];
  for (const c of conf) circle(ctx, c[0], c[1], 2, c[2], 0);
  oval(ctx, 50, 62, 15, 5, '#14b8a6', 2.6);
  for (const sx of [-1, 1]) {
    const ax = 50 + sx * 24;
    oval(ctx, ax, 74, 5.5, 11, '#faf3e6', 3, OUT, sx * 0.2);
    circle(ctx, ax + sx * 3, 85, 5, '#faf3e6', 2.4);
  }
  rrect(ctx, 36, 86, 28, 7, 3, '#5b21b6', 2.4);
  // Cabeza de azúcar
  oval(ctx, 50, 36, 27, 25, '#fffaf0', 3);
  // Borde festoneado de colores
  const cols = ['#ff4fa3', '#22d3ee', '#facc15', '#a855f7'];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    circle(ctx, 50 + Math.cos(a) * 23.2, 36 + Math.sin(a) * 21.4, 2.3, cols[i % 4], 1);
  }
  // Ojos con flor de azúcar
  for (const sx of [-1, 1]) {
    const ex = 50 + sx * 11;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      circle(ctx, ex + Math.cos(a) * 9.8, 36 + Math.sin(a) * 9.8, 2.6, i % 2 ? '#22d3ee' : '#ff4fa3', 1);
    }
    circle(ctx, ex, 36, 7.4, '#1a1020', 1.5);
    circle(ctx, ex, 36, 3.6, '#facc15', 0);
    circle(ctx, ex - 1.4, 34.4, 1.4, '#ffffff', 0);
  }
  // Nariz de corazón
  circle(ctx, 47.8, 47, 2.6, '#ff4fa3', 1);
  circle(ctx, 52.2, 47, 2.6, '#ff4fa3', 1);
  poly(ctx, [[45.4, 48.2], [54.6, 48.2], [50, 53]], '#ff4fa3', 1);
  // Dientes de colores
  rrect(ctx, 36, 54, 28, 6, 2.4, '#ffffff', 1.8);
  for (let x = 40.7; x < 64; x += 4.7) line(ctx, x, 54.4, x, 59.6, OUT, 1.1);
  // Flor y espirales de la frente
  flower(ctx, 50, 17.5, 7, '#ff8c1a', '#ffd23f', 6, 1.2);
  ctx.strokeStyle = '#14b8a6'; ctx.lineWidth = 1.9;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(50 + sx * 15, 20, 4, Math.PI * 0.2, Math.PI * 1.6);
    ctx.stroke();
  }
  // Mejillas de corazón
  for (const sx of [-1, 1]) {
    star(ctx, 50 + sx * 20, 47, 3.1, 1.3, '#e63946', 0.8, null, 4);
  }
  drawEmoji(ctx, '✨', 15, 12, 14, k);
  drawEmoji(ctx, '✨', 86, 58, 11, k);
}

// ---------------------------------------------------------------------------
// Chinelo
// ---------------------------------------------------------------------------
function drawChinelo(ctx, k) {
  const skin = '#f0c9a0';
  // Plumas del sombrero (contorno + color)
  const plumes = [
    { c: '#ff4fa3', pts: [[46, 17], [28, 11], [24, 3]] },
    { c: '#22d3ee', pts: [[50, 16], [48, 6], [56, 1.5]] },
    { c: '#facc15', pts: [[54, 17], [72, 11], [76, 3]] },
  ];
  ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
    for (const p of plumes) {
      ctx.beginPath();
      ctx.moveTo(p.pts[0][0], p.pts[0][1]);
      ctx.quadraticCurveTo(p.pts[1][0], p.pts[1][1], p.pts[2][0], p.pts[2][1]);
      ctx.strokeStyle = pass === 0 ? OUT : p.c;
      ctx.lineWidth = pass === 0 ? 8.4 : 5;
      ctx.stroke();
    }
  }
  // Túnica bordada
  rrect(ctx, 27, 63, 46, 29, 8, '#0e7490', 3);
  ctx.save();
  roundRect(ctx, 27, 63, 46, 29, 8);
  ctx.clip();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.5;
  for (let i = -3; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo(20 + i * 9, 62); ctx.lineTo(56 + i * 9, 98); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(80 - i * 9, 62); ctx.lineTo(44 - i * 9, 98); ctx.stroke();
  }
  ctx.restore();
  flower(ctx, 38, 78, 6.5, '#ff4fa3', '#facc15', 5, 1.2);
  flower(ctx, 62, 78, 6.5, '#ff4fa3', '#facc15', 5, 1.2);
  flower(ctx, 50, 86, 6, '#f97316', '#fff1a8', 5, 1.2);
  // Flecos blancos
  for (let x = 30; x <= 70; x += 5) circle(ctx, x, 92, 2.2, '#ffffff', 1.2);
  // Brazos
  arms(ctx, '#0e7490', skin, '#facc15');
  // Barba puntiaguda
  ctx.beginPath();
  ctx.moveTo(37, 55);
  ctx.quadraticCurveTo(50, 60, 63, 55);
  ctx.lineTo(50, 90);
  ctx.closePath();
  paint(ctx, '#4a2c1a', 3);
  ctx.strokeStyle = 'rgba(255,220,170,0.4)';
  ctx.lineWidth = 1.2;
  for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(50 + dx * 0.6, 60); ctx.lineTo(50 + dx * 0.1, 82); ctx.stroke(); }
  // Cara con malla
  circle(ctx, 50, 47, 15.5, skin, 3);
  ctx.save();
  ctx.beginPath(); ctx.arc(50, 47, 15.5, 0, TAU); ctx.clip();
  ctx.strokeStyle = 'rgba(90,40,20,0.38)';
  ctx.lineWidth = 0.9;
  for (let i = -16; i <= 16; i += 4) {
    ctx.beginPath(); ctx.moveTo(50 + i - 16, 31); ctx.lineTo(50 + i + 16, 63); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(50 + i + 16, 31); ctx.lineTo(50 + i - 16, 63); ctx.stroke();
  }
  ctx.restore();
  for (const sx of [-1, 1]) {
    oval(ctx, 50 + sx * 6, 46, 3, 3.4, '#ffffff', 1.2);
    circle(ctx, 50 + sx * 5.8, 46.4, 1.7, '#1c1030', 0);
  }
  circle(ctx, 40, 52, 2.4, 'rgba(255,79,163,0.7)', 0);
  circle(ctx, 60, 52, 2.4, 'rgba(255,79,163,0.7)', 0);
  circle(ctx, 50, 47, 15.5, null, 3);
  // Sombrero alto
  poly(ctx, [[36, 37], [64, 37], [61, 15], [39, 15]], '#4c1d95', 3);
  oval(ctx, 50, 15, 11.5, 3.4, '#7c3aed', 2.4);
  rrect(ctx, 36.5, 28, 27, 8, 2, '#facc15', 2);
  for (let x = 40; x <= 60; x += 5) { poly(ctx, [[x - 2.5, 36], [x, 29.5], [x + 2.5, 36]], '#e11d74', 0.8); }
  oval(ctx, 50, 37.5, 17, 4.2, '#4c1d95', 2.6);
}

// ---------------------------------------------------------------------------
// Mariachi
// ---------------------------------------------------------------------------
function drawMariachi(ctx, k) {
  const skin = '#c98c5c';
  const black = '#17141f';
  const silver = '#d7dbe5';
  // Guitarra
  ctx.beginPath(); ctx.moveTo(72, 70); ctx.lineTo(87, 46);
  ctx.strokeStyle = OUT; ctx.lineWidth = 6.2; ctx.stroke();
  ctx.strokeStyle = '#5a2d12'; ctx.lineWidth = 3.2; ctx.stroke();
  rrect(ctx, 84, 40, 7, 9, 2, '#5a2d12', 2);
  oval(ctx, 71, 83, 10.5, 8.6, '#c2701f', 3);
  oval(ctx, 72.5, 72, 7.6, 6.4, '#c2701f', 3);
  oval(ctx, 72, 77, 8.4, 6, '#c2701f', 0);
  circle(ctx, 72, 79, 3.2, '#2a1408', 1.2);
  // Pantalón
  rrect(ctx, 31, 78, 38, 16, 5, black, 3);
  line(ctx, 36, 80, 36, 92, silver, 1.8);
  line(ctx, 64, 80, 64, 92, silver, 1.8);
  // Saco con filigrana de plata
  rrect(ctx, 28, 58, 44, 29, 10, black, 3);
  poly(ctx, [[42, 59], [58, 59], [50, 75]], '#f7f7fb', 1.8);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(50 + sx * 9, 62); ctx.quadraticCurveTo(50 + sx * 20, 70, 50 + sx * 14, 82);
    ctx.moveTo(50 + sx * 12, 66); ctx.quadraticCurveTo(50 + sx * 17, 72, 50 + sx * 20, 78);
    ctx.strokeStyle = silver; ctx.lineWidth = 1.8; ctx.stroke();
    circle(ctx, 50 + sx * 25, 61, 3, silver, 1.4);
  }
  for (let by = 78; by <= 86; by += 4.2) circle(ctx, 50, by, 1.7, silver, 1);
  // Brazos
  arms(ctx, black, skin, silver);
  // Cara
  circle(ctx, 50, 43, 18, skin, 3);
  for (const sx of [-1, 1]) {
    oval(ctx, 50 + sx * 7.4, 41, 3.4, 3.8, '#ffffff', 1.3);
    circle(ctx, 50 + sx * 7.2, 41.4, 1.8, '#1c1030', 0);
    line(ctx, 50 + sx * 4, 36, 50 + sx * 11, 35.2, '#1c1030', 2.2);
  }
  ctx.beginPath(); ctx.moveTo(40, 49); ctx.quadraticCurveTo(50, 46, 60, 49);
  ctx.strokeStyle = '#1c1030'; ctx.lineWidth = 2.4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(43, 54); ctx.quadraticCurveTo(50, 59, 57, 54);
  ctx.strokeStyle = '#7a2e1e'; ctx.lineWidth = 2; ctx.stroke();
  // Moño rojo
  poly(ctx, [[50, 62], [37, 55.5], [37, 68.5]], '#d11f3a', 2.2);
  poly(ctx, [[50, 62], [63, 55.5], [63, 68.5]], '#d11f3a', 2.2);
  circle(ctx, 50, 62, 3.6, '#a3122b', 2);
  // Sombrero negro con plata
  oval(ctx, 50, 29, 36, 9.6, black, 3);
  oval(ctx, 50, 29, 33, 7.6, null, 1.6, silver);
  ctx.beginPath();
  ctx.moveTo(35, 29); ctx.quadraticCurveTo(35, 9, 50, 8); ctx.quadraticCurveTo(65, 9, 65, 29);
  ctx.quadraticCurveTo(50, 34, 35, 29);
  ctx.closePath();
  paint(ctx, '#211c2e', 3);
  ctx.beginPath(); ctx.moveTo(35.4, 23.5); ctx.quadraticCurveTo(50, 29, 64.6, 23.5); ctx.lineTo(64.8, 28.5); ctx.quadraticCurveTo(50, 33.5, 35.2, 28.5); ctx.closePath();
  paint(ctx, silver, 1.8);
  for (let x = 40; x <= 60; x += 5) circle(ctx, x, 28.3, 1.3, black, 0);
}

const DRAW = {
  luchador: drawLuchador,
  catrina: drawCatrina,
  charro: drawCharro,
  calaverita: drawCalaverita,
  chinelo: drawChinelo,
  mariachi: drawMariachi,
};

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
const cache = new Map();

/**
 * Canvas pre-renderizado de la skin, size x size px, mirando a la derecha. Está en caché:
 * llamarlo cada frame es barato. `variant` (0..3) solo cambia los colores de la máscara del Luchador.
 */
export function skinSprite(id, size = 48, variant = 0) {
  const sid = DRAW[id] ? id : 'luchador';
  const px = Math.max(8, Math.round(size) || 48);
  const n = LUCHADOR_PALETTES.length;
  const v = sid === 'luchador' ? (((variant | 0) % n) + n) % n : 0;
  const key = sid + '|' + px + '|' + v;
  let c = cache.get(key);
  if (c) return c;
  const k = px / 100;
  c = sprite('angel.skin.' + key, px, px, (ctx) => {
    ctx.save();
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    DRAW[sid](ctx, k, v);
    ctx.restore();
  });
  cache.set(key, c);
  return c;
}

/**
 * Pinta una skin con animación de reposo (rebote suave y respiración) para menús y carruseles.
 * (cx, cy) = centro de la zona; `size` = lado del sprite; t = tiempo en segundos.
 */
export function drawSkinPreview(ctx, id, cx, cy, size, t = 0, variant = 0, flip = 1) {
  const spr = skinSprite(id, size, variant);
  const bob = Math.abs(Math.sin(t * 3.2));
  const sq = 1 + bob * 0.05;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,' + (0.32 - bob * 0.08) + ')';
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.46, size * (0.3 - bob * 0.03), size * 0.07, 0, 0, TAU);
  ctx.fill();
  ctx.translate(cx, cy + size * 0.46 - bob * size * 0.07);
  ctx.scale(flip / sq, sq);
  ctx.drawImage(spr, -size / 2, -size * 0.96, size, size);
  ctx.restore();
}
