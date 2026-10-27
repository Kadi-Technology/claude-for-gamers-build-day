// Modo debug: se activa con ?debug=1 o alternando con F3.
// Contrato: enabled; overlay(ctx, stats); hotkeys({ G, N, L, B, ... })
//   enabled            booleano (binding vivo: `import { enabled }` siempre refleja el valor actual).
//   overlay(ctx, stats) dibuja arriba a la izquierda FPS (promedio móvil de 60 frames) y los datos extra de `stats`
//                      (objeto { clave: valor } o arreglo de líneas). Sin debug activo solo muestrea el tiempo de frame
//                      (coste despreciable) para que fps() siga siendo válido en __cfgStats().
//   hotkeys(map)       registra callbacks por tecla ('G', 'N', 'F5', 'Digit1', ...). Solo se ejecutan con debug activo y
//                      nunca mientras se escribe en un campo de texto. Devuelve una función para desregistrarlos.
// Extras: fps(), frameMs(), toggle(), setEnabled(b), onToggle(fn).

function readFlag() {
  try {
    const v = new URLSearchParams(location.search).get('debug');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export let enabled = readFlag();

const listeners = new Set();
const registry = new Map();
const FRAMES = 60;
const samples = new Float32Array(FRAMES);
let sampleCount = 0;
let sampleIdx = 0;
let lastT = 0;
let fpsAvg = 60;
let msAvg = 16.7;

export function setEnabled(v) {
  const next = !!v;
  if (next === enabled) return enabled;
  enabled = next;
  for (const fn of listeners) {
    try {
      fn(enabled);
    } catch (err) {
      console.error('[debug] error en onToggle:', err);
    }
  }
  return enabled;
}

export function toggle() {
  return setEnabled(!enabled);
}

export function onToggle(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function sample() {
  const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (lastT) {
    let dt = t - lastT;
    if (dt > 250) dt = 250; // ignora pausas largas (pestaña oculta)
    if (dt > 0) {
      samples[sampleIdx] = dt;
      sampleIdx = (sampleIdx + 1) % FRAMES;
      if (sampleCount < FRAMES) sampleCount++;
      let sum = 0;
      for (let i = 0; i < sampleCount; i++) sum += samples[i];
      msAvg = sum / sampleCount;
      fpsAvg = 1000 / msAvg;
    }
  }
  lastT = t;
}

export function fps() {
  return Math.round(fpsAvg * 10) / 10;
}

export function frameMs() {
  return Math.round(msAvg * 10) / 10;
}

function fmt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (v === null || v === undefined) return '-';
  return String(v);
}

export function overlay(ctx, stats) {
  sample();
  if (!enabled || !ctx) return;

  const lines = ['FPS ' + fpsAvg.toFixed(1) + '  (' + msAvg.toFixed(1) + ' ms)'];
  if (Array.isArray(stats)) {
    for (const s of stats) lines.push(String(s));
  } else if (stats && typeof stats === 'object') {
    for (const k of Object.keys(stats)) lines.push(k + ': ' + fmt(stats[k]));
  }
  if (registry.size) lines.push('teclas: ' + Array.from(registry.keys()).join(' '));
  lines.push('F3 oculta el panel');

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.font = '12px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  const lh = 15;
  const pad = 6;
  ctx.fillStyle = 'rgba(10,5,22,0.78)';
  ctx.fillRect(6, 6, w + pad * 2, lines.length * lh + pad * 2);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === 0 ? (fpsAvg >= 55 ? '#5be37d' : fpsAvg >= 30 ? '#ffbf5e' : '#ff5470') : '#f7f3ff';
    ctx.fillText(lines[i], 6 + pad, 6 + pad + i * lh);
  }
  ctx.restore();
}

export function hotkeys(map) {
  const added = [];
  if (map && typeof map === 'object') {
    for (const k of Object.keys(map)) {
      if (typeof map[k] !== 'function') continue;
      const name = k.length === 1 ? k.toUpperCase() : k;
      registry.set(name, map[k]);
      added.push([name, map[k]]);
    }
  }
  return () => {
    for (const [name, fn] of added) if (registry.get(name) === fn) registry.delete(name);
  };
}

function isTyping(t) {
  const n = t && t.tagName;
  return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || (t && t.isContentEditable === true);
}

function onKeyDown(e) {
  if (e.code === 'F3') {
    if (e.repeat) return;
    e.preventDefault();
    toggle();
    return;
  }
  if (!enabled || registry.size === 0) return;
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
  const byKey = e.key && e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const fn = registry.get(byKey) || registry.get(e.code);
  if (!fn) return;
  e.preventDefault();
  if (e.repeat) return;
  try {
    fn(e);
  } catch (err) {
    console.error('[debug] error en hotkey ' + byKey + ':', err);
  }
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', onKeyDown);
}

export default {
  get enabled() {
    return enabled;
  },
  overlay,
  hotkeys,
  fps,
  frameMs,
  toggle,
  setEnabled,
  onToggle,
};
