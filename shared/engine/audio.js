// Audio sintetizado con WebAudio: cero archivos de sonido.
// Contrato: sfx(name); setMuted(bool); muted
//   Nombres: 'shoot','hit','death','gem','levelup','boss','bell','splash','jump','dive','pickup','explosion'
//   (extras: 'dash','ui','win','lose','hurt'). Un nombre desconocido se ignora sin error.
//   - El AudioContext se crea hasta el primer gesto del usuario (política de autoplay): antes de eso sfx() no hace nada y no
//     genera avisos en consola.
//   - setMuted() persiste en storage 'cfg.muted'. `muted` es un binding vivo: `import { muted }` siempre está al día.
//   - Anti-saturación: intervalo mínimo por sonido, tope de voces simultáneas y compresor en la salida.
// Extras: toggleMute(), isMuted(), setVolume(v), getVolume(), unlock().

import { load, save } from './storage.js';

export let muted = !!load('cfg.muted', false);

let volume = clamp01(Number(load('cfg.volume', 0.7)));
let ctx = null;
let master = null;
let noiseBuf = null;
let voices = 0;
let gestured = false;
let listening = false;
const lastPlayed = Object.create(null);

const MAX_VOICES = 28;
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'keydown', 'click'];

function clamp01(v) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.7;
}

// ---------------------------------------------------------------- contexto

function canCreate() {
  if (typeof navigator !== 'undefined' && navigator.userActivation) return navigator.userActivation.hasBeenActive;
  return gestured;
}

function ensureCtx() {
  if (ctx) return ctx;
  if (!gestured && !canCreate()) return null;
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
  } catch {
    ctx = null;
    return null;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 18;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  master.connect(comp);
  comp.connect(ctx.destination);

  // Búfer de ruido blanco de 2 s que reutilizan todas las voces de ruido.
  const len = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function onGesture(e) {
  if (e && e.type === 'keydown' && e.key === 'Escape') return; // Esc no cuenta como activación de usuario
  gestured = true;
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'running') {
    stopListening();
    return;
  }
  const p = c.resume();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      if (c.state === 'running') stopListening();
    }).catch(() => {});
  }
}

function startListening() {
  if (listening || typeof window === 'undefined' || !window.addEventListener) return;
  listening = true;
  for (const t of GESTURE_EVENTS) window.addEventListener(t, onGesture, { capture: true, passive: true });
}

function stopListening() {
  if (!listening) return;
  listening = false;
  for (const t of GESTURE_EVENTS) window.removeEventListener(t, onGesture, { capture: true });
}

startListening();

export function unlock() {
  gestured = true;
  const c = ensureCtx();
  if (c && c.state !== 'running') c.resume().catch(() => {});
  return !!c;
}

// ---------------------------------------------------------------- bloques de síntesis

function endVoice(g) {
  voices = Math.max(0, voices - 1);
  try {
    g.disconnect();
  } catch {
    // ya desconectado
  }
}

function envelope(g, t0, atk, peak, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

// Oscilador con barrido de frecuencia y envolvente.
function tone(t, o) {
  const t0 = t + (o.delay || 0);
  const dur = o.dur || 0.15;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(Math.max(1, o.f0), t0);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
  if (o.vib) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = o.vib.rate;
    lg.gain.value = o.vib.depth;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
  }
  const g = ctx.createGain();
  envelope(g, t0, o.atk || 0.004, o.gain || 0.2, dur);
  let node = osc;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master);
  voices++;
  osc.onended = () => endVoice(g);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// Ráfaga de ruido filtrada con barrido de frecuencia y envolvente.
function noise(t, o) {
  const t0 = t + (o.delay || 0);
  const dur = Math.min(o.dur || 0.15, 1.2);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'lowpass';
  f.Q.value = o.q === undefined ? 0.7 : o.q;
  f.frequency.setValueAtTime(Math.max(20, o.f0 || 2000), t0);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
  const g = ctx.createGain();
  envelope(g, t0, o.atk || 0.003, o.gain || 0.2, dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  voices++;
  src.onended = () => endVoice(g);
  src.start(t0, Math.random() * (noiseBuf.duration - dur - 0.1));
  src.stop(t0 + dur + 0.03);
}

// ---------------------------------------------------------------- catálogo de sonidos

// v = variación de tono aleatoria (0.94..1.06) para que el audio repetido no canse.
const SOUNDS = {
  shoot(t, v) {
    tone(t, { type: 'square', f0: 920 * v, f1: 240 * v, dur: 0.1, gain: 0.07, lp: 4200 });
    noise(t, { type: 'highpass', f0: 3000, dur: 0.04, gain: 0.04 });
  },
  hit(t, v) {
    noise(t, { type: 'bandpass', f0: 2000 * v, f1: 600, q: 1.2, dur: 0.08, gain: 0.16 });
    tone(t, { type: 'triangle', f0: 190 * v, f1: 80, dur: 0.09, gain: 0.16 });
  },
  hurt(t, v) {
    tone(t, { type: 'sawtooth', f0: 320 * v, f1: 110, dur: 0.22, gain: 0.14, lp: 1500 });
    noise(t, { type: 'lowpass', f0: 1400, f1: 300, dur: 0.18, gain: 0.12 });
  },
  death(t, v) {
    tone(t, { type: 'sawtooth', f0: 340 * v, f1: 55, dur: 0.34, gain: 0.13, lp: 1800 });
    noise(t, { type: 'lowpass', f0: 1800, f1: 200, dur: 0.28, gain: 0.14 });
  },
  gem(t, v) {
    tone(t, { type: 'sine', f0: 880 * v, dur: 0.09, gain: 0.1 });
    tone(t, { type: 'sine', f0: 1320 * v, dur: 0.14, gain: 0.09, delay: 0.05 });
  },
  pickup(t) {
    tone(t, { type: 'triangle', f0: 523, dur: 0.1, gain: 0.14 });
    tone(t, { type: 'triangle', f0: 784, dur: 0.1, gain: 0.14, delay: 0.07 });
    tone(t, { type: 'triangle', f0: 1046, dur: 0.18, gain: 0.13, delay: 0.14 });
  },
  levelup(t) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < notes.length; i++) {
      tone(t, { type: 'triangle', f0: notes[i], dur: 0.2, gain: 0.15, delay: i * 0.08 });
      tone(t, { type: 'sine', f0: notes[i] * 2, dur: 0.22, gain: 0.05, delay: i * 0.08 });
    }
    tone(t, { type: 'sine', f0: 1568, dur: 0.5, gain: 0.07, delay: 0.34 });
  },
  boss(t) {
    tone(t, { type: 'sawtooth', f0: 74, f1: 46, dur: 1.1, gain: 0.26, lp: 260, vib: { rate: 6, depth: 4 } });
    noise(t, { type: 'lowpass', f0: 160, f1: 60, dur: 0.95, gain: 0.3 });
    tone(t, { type: 'square', f0: 110, dur: 0.34, gain: 0.1, lp: 900, delay: 0.1 });
    tone(t, { type: 'square', f0: 82.4, dur: 0.6, gain: 0.1, lp: 800, delay: 0.46 });
  },
  bell(t) {
    // Campana: parciales inarmónicos con caídas distintas + golpe seco de badajo.
    const base = 330;
    const parts = [
      [0.5, 0.5, 1.5],
      [1, 1, 1.3],
      [1.19, 0.6, 1.0],
      [1.56, 0.4, 0.8],
      [2, 0.34, 0.65],
      [2.74, 0.22, 0.45],
      [4.1, 0.1, 0.25],
    ];
    for (const [ratio, amp, dur] of parts) {
      tone(t, { type: 'sine', f0: base * ratio, dur, gain: 0.2 * amp, atk: 0.003 });
    }
    noise(t, { type: 'highpass', f0: 2500, dur: 0.05, gain: 0.1 });
  },
  splash(t, v) {
    noise(t, { type: 'bandpass', f0: 500, f1: 2200 * v, q: 0.9, dur: 0.28, gain: 0.3, atk: 0.02 });
    tone(t, { type: 'sine', f0: 320, f1: 760, dur: 0.12, gain: 0.12, delay: 0.04 });
    tone(t, { type: 'sine', f0: 420, f1: 980, dur: 0.1, gain: 0.09, delay: 0.12 });
  },
  jump(t, v) {
    tone(t, { type: 'square', f0: 250 * v, f1: 560 * v, dur: 0.15, gain: 0.08, lp: 3000 });
    tone(t, { type: 'sine', f0: 500 * v, f1: 900 * v, dur: 0.12, gain: 0.06, delay: 0.03 });
  },
  dive(t, v) {
    tone(t, { type: 'sine', f0: 560 * v, f1: 170, dur: 0.22, gain: 0.14 });
    noise(t, { type: 'bandpass', f0: 800, f1: 300, q: 1, dur: 0.2, gain: 0.1 });
  },
  dash(t, v) {
    noise(t, { type: 'bandpass', f0: 900, f1: 3200 * v, q: 0.8, dur: 0.16, gain: 0.16, atk: 0.01 });
    tone(t, { type: 'sine', f0: 260, f1: 620, dur: 0.14, gain: 0.07 });
  },
  explosion(t) {
    noise(t, { type: 'lowpass', f0: 1500, f1: 80, dur: 0.6, gain: 0.42 });
    tone(t, { type: 'sine', f0: 130, f1: 34, dur: 0.5, gain: 0.34 });
    noise(t, { type: 'bandpass', f0: 3000, f1: 800, q: 0.6, dur: 0.12, gain: 0.14 });
  },
  ui(t) {
    tone(t, { type: 'triangle', f0: 660, dur: 0.06, gain: 0.09 });
    tone(t, { type: 'triangle', f0: 990, dur: 0.07, gain: 0.07, delay: 0.04 });
  },
  win(t) {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (let i = 0; i < notes.length; i++) {
      tone(t, { type: 'triangle', f0: notes[i], dur: 0.28, gain: 0.14, delay: i * 0.1 });
    }
    tone(t, { type: 'sine', f0: 2093, dur: 0.7, gain: 0.06, delay: 0.5 });
  },
  lose(t) {
    const notes = [392, 349.23, 293.66, 196];
    for (let i = 0; i < notes.length; i++) {
      tone(t, { type: 'sawtooth', f0: notes[i], f1: notes[i] * 0.97, dur: 0.3, gain: 0.1, lp: 1200, delay: i * 0.18 });
    }
  },
};

// Intervalo mínimo entre repeticiones del mismo sonido (ms).
const MIN_GAP = {
  shoot: 45,
  hit: 35,
  hurt: 120,
  death: 50,
  gem: 30,
  pickup: 60,
  levelup: 300,
  boss: 800,
  bell: 150,
  splash: 60,
  jump: 80,
  dive: 80,
  dash: 100,
  explosion: 70,
  ui: 40,
  win: 500,
  lose: 500,
};

// Sonidos que nunca se descartan por exceso de voces.
const PRIORITY = { levelup: 1, boss: 1, explosion: 1, bell: 1, win: 1, lose: 1 };

export function sfx(name) {
  if (muted) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') {
    c.resume().catch(() => {});
    return;
  }
  if (c.state !== 'running') return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const gap = MIN_GAP[name] || 0;
  if (nowMs - (lastPlayed[name] || -1e9) < gap) return;
  if (voices >= MAX_VOICES && !PRIORITY[name]) return;
  lastPlayed[name] = nowMs;
  try {
    fn(c.currentTime + 0.005, 0.94 + Math.random() * 0.12);
  } catch (err) {
    console.error('[audio] no se pudo reproducir "' + name + '":', err);
  }
}

export function setMuted(v) {
  muted = !!v;
  save('cfg.muted', muted);
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.015);
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

export function isMuted() {
  return muted;
}

export function setVolume(v) {
  volume = clamp01(Number(v));
  save('cfg.volume', volume);
  if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.015);
}

export function getVolume() {
  return volume;
}

export default {
  sfx,
  setMuted,
  toggleMute,
  isMuted,
  setVolume,
  getVolume,
  unlock,
  get muted() {
    return muted;
  },
};
