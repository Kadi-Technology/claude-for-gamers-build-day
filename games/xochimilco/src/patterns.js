// Biblioteca de patrones de obstáculos (docs/02 §2.3).
// Cada patrón es un fragmento diseñado con tiempos en SEGUNDOS: track.js los convierte a metros con la velocidad del
// tramo, así la ventana de reacción es la misma a 13 m/s que a 32 m/s. Antes de usarse, cada patrón pasa por un
// verificador (solucionador abstracto) que garantiza al menos una respuesta válida con las restricciones físicas de
// cambio de carril, salto y buceo. Los que no pasan se descartan (ver INVALID).
//
// Matriz (✔ evita · ✘ choca):
//   trajinera  1 carril   carril ✔  bucear ✔  saltar ✘
//   red        1 carril   carril ✔  bucear ✘  saltar ✘
//   garza      1 carril   carril ✔  bucear ✔  saltar ✘   (avisa con sombra)
//   lirio      1-2 carr.  carril ✔  bucear ✔  saltar ✔
//   tronco     3 carriles carril ✘  bucear ✘  saltar ✔
//   cerca      3 carriles carril ✘  bucear ✘  saltar ✔
//   remolino   3 carriles carril ✘  bucear ✘  saltar ✔
//   carpa      cruza carr. carril ✔  bucear ✔  saltar ✘

const ACTS = ['run', 'jump', 'dive'];
const LANE_T = 0.22; // s por carril cambiado (reacción + traslado)
const BUSY_T = 0.85; // s entre dos acciones de aire/agua (salto 0.7 s + margen)
const SETTLE_T = 0.5; // s para volver a la superficie tras saltar o bucear

/** ¿Está a salvo un ajolote en `lane` haciendo `act` frente a este obstáculo? */
export function isSafe(it, lane, act) {
  switch (it.k) {
    case 'trajinera':
    case 'garza':
    case 'carpa':
      return lane !== it.lane || act === 'dive';
    case 'red':
      return lane !== it.lane;
    case 'lirio': {
      const dentro = lane >= it.lane && lane < it.lane + (it.span || 1);
      return !dentro || act !== 'run';
    }
    case 'tronco':
    case 'cerca':
    case 'remolino':
      return act === 'jump';
    default:
      return true;
  }
}

function groupsOf(items) {
  const obs = items.filter((i) => i.k !== 'flores').sort((a, b) => a.t - b.t);
  const out = [];
  for (const it of obs) {
    const g = out[out.length - 1];
    if (g && Math.abs(it.t - g.t) < 0.06) g.items.push(it);
    else out.push({ t: it.t, items: [it] });
  }
  return out;
}

function canGo(pl, pa, l, a, dt) {
  if (Math.abs(pl - l) * LANE_T > dt + 1e-6) return false;
  const busy = pa !== 'run';
  if (a !== 'run' && busy) return dt >= BUSY_T - 1e-6;
  if (a === 'run' && busy) return dt >= SETTLE_T - 1e-6;
  return true;
}

/** ¿Existe una secuencia de respuestas válida? `allowed` restringe las acciones usables. */
export function solvable(items, allowed = ACTS) {
  const gs = groupsOf(items);
  if (gs.length === 0) return true;
  let prev = null;
  for (let gi = 0; gi < gs.length; gi++) {
    const g = gs[gi];
    const cur = [];
    for (let lane = 0; lane < 3; lane++) {
      for (const act of allowed) {
        if (!g.items.every((it) => isSafe(it, lane, act))) continue;
        if (gi === 0) {
          cur.push([lane, act]);
          continue;
        }
        const dt = g.t - gs[gi - 1].t;
        if (prev.some(([pl, pa]) => canGo(pl, pa, lane, act, dt))) cur.push([lane, act]);
      }
    }
    if (cur.length === 0) return false;
    prev = cur;
  }
  return true;
}

export function verifyPattern(p) {
  if (!p || !Array.isArray(p.items) || p.items.length === 0) return false;
  return solvable(p.items);
}

// ---------------------------------------------------------------- constructores
const T = (t, lane) => ({ k: 'trajinera', t, lane });
const R = (t, lane) => ({ k: 'red', t, lane });
const G = (t, lane) => ({ k: 'garza', t, lane });
const L = (t, lane, span = 1) => ({ k: 'lirio', t, lane, span });
const LOG = (t) => ({ k: 'tronco', t });
const FEN = (t) => ({ k: 'cerca', t });
const WHIRL = (t) => ({ k: 'remolino', t });
const CARP = (t, lane, from) => ({ k: 'carpa', t, lane, from });

const line = (t, lane, n = 6, dt = 0.11) => ({ k: 'flores', shape: 'line', t, lane, n, dt });
const dive = (t, lane, n = 5, dt = 0.1) => ({ k: 'flores', shape: 'dive', t, lane, n, dt });
/** Arco de flores en el aire centrado en el instante `tc`: enseña el salto. */
const arc = (tc, lane, n = 5, dt = 0.14) => ({ k: 'flores', shape: 'arc', t: tc - ((n - 1) * dt) / 2, lane, n, dt, peak: 1.45 });
const arcs3 = (tc, n = 5, dt = 0.14) => [0, 1, 2].map((l) => arc(tc, l, n, dt));

// ---------------------------------------------------------------- biblioteca (d = dificultad 1..5)
const RAW = [
  // ---- dificultad 1: aprender (un obstáculo a la vez y flores que enseñan la respuesta)
  { id: 'lirio-uno', d: 1, items: [L(0.7, 1), line(0.1, 0), line(0.1, 2)] },
  { id: 'trajinera-buceo', d: 1, items: [T(0.85, 1), dive(0.5, 1), line(0.1, 0, 7), line(0.1, 2, 7)] },
  { id: 'red-par', d: 1, items: [R(0.7, 0), R(0.7, 1), line(0.1, 2, 6)] },
  { id: 'tronco-uno', d: 1, items: [LOG(0.9), ...arcs3(0.9)] },
  { id: 'cerca-uno', d: 1, items: [FEN(0.9), ...arcs3(0.9)] },
  { id: 'lirio-ancho', d: 1, items: [L(0.7, 0, 2), line(0.1, 2, 6)] },

  // ---- dificultad 2: combinar
  { id: 'zigzag-corto', d: 2, items: [R(0.6, 0), T(0.6, 1), line(0.1, 2, 6), R(1.7, 1), R(1.7, 2), line(1.2, 0, 6)] },
  { id: 'garza-aviso', d: 2, items: [G(0.8, 1), L(0.8, 0), line(0.2, 2, 7)] },
  { id: 'tronco-doble', d: 2, items: [LOG(0.7), LOG(1.85), ...arcs3(0.7), ...arcs3(1.85)] },
  { id: 'tronco-red', d: 2, items: [LOG(0.7), R(1.9, 0), R(1.9, 1), ...arcs3(0.7), line(1.4, 2, 5)] },
  { id: 'remolino-uno', d: 2, items: [WHIRL(0.9), ...arcs3(0.9, 5, 0.12)] },
  { id: 'carpa-uno', d: 2, items: [CARP(0.9, 1, -1), line(0.2, 0, 6), line(0.2, 2, 6)] },
  { id: 'trajineras-par', d: 2, items: [T(0.7, 0), T(0.7, 2), line(0.2, 1, 5), L(1.8, 1), line(1.3, 0, 4), line(1.3, 2, 4)] },

  // ---- dificultad 3: exigir lectura
  { id: 'muro-buceo', d: 3, mustDive: true, items: [T(0.85, 0), G(0.85, 1), T(0.85, 2), dive(0.5, 0), dive(0.5, 1), dive(0.5, 2)] },
  { id: 'cerca-lirio', d: 3, items: [FEN(0.7), L(1.85, 0, 2), ...arcs3(0.7), line(1.4, 2, 5)] },
  { id: 'tronco-carril', d: 3, items: [LOG(0.7), T(1.85, 0), T(1.85, 1), ...arcs3(0.7), line(1.3, 2, 5)] },
  {
    id: 'eslalon-tres',
    d: 3,
    items: [R(0.7, 0), T(0.7, 1), line(0.1, 2, 6), R(1.6, 1), R(1.6, 2), line(1.0, 0, 6), R(2.5, 0), R(2.5, 1), line(1.9, 2, 6)],
  },
  { id: 'carpa-doble', d: 3, items: [CARP(0.9, 0, 1), CARP(1.8, 2, -1), line(0.3, 1, 8)] },
  { id: 'remolino-red', d: 3, items: [WHIRL(0.85), R(2.05, 1), R(2.05, 2), ...arcs3(0.85, 5, 0.12), line(1.6, 0, 5)] },

  // ---- dificultad 4: ritmo
  { id: 'tronco-garza', d: 4, items: [LOG(0.7), G(1.8, 0), G(1.8, 1), ...arcs3(0.7), line(1.3, 2, 5)] },
  { id: 'triple-muro', d: 4, mustDive: true, items: [R(0.85, 0), T(0.85, 1), R(0.85, 2), dive(0.5, 1)] },
  { id: 'cerca-cerca', d: 4, items: [FEN(0.7), FEN(1.78), ...arcs3(0.7), ...arcs3(1.78)] },
  { id: 'sandwich', d: 4, items: [T(0.7, 1), line(0.2, 0, 5), line(0.2, 2, 5), LOG(1.95), ...arcs3(1.95), R(3.1, 0), R(3.1, 1), line(2.6, 2, 5)] },
  { id: 'carpa-tronco', d: 4, items: [CARP(0.9, 1, 1), LOG(2.0), ...arcs3(2.0), line(0.3, 0, 6)] },
  { id: 'remolino-doble', d: 4, items: [WHIRL(0.8), WHIRL(2.25), ...arcs3(0.8, 5, 0.12), ...arcs3(2.25, 5, 0.12)] },

  // ---- dificultad 5: maestría
  {
    id: 'zigzag-largo',
    d: 5,
    items: [
      R(0.6, 0), T(0.6, 1), line(0.1, 2, 4),
      R(1.4, 1), R(1.4, 2), line(0.9, 0, 4),
      R(2.2, 0), T(2.2, 1), line(1.7, 2, 4),
      R(3.0, 1), R(3.0, 2), line(2.5, 0, 4),
    ],
  },
  { id: 'tronco-triple', d: 5, items: [LOG(0.7), LOG(1.6), LOG(2.5), ...arcs3(0.7, 4, 0.13), ...arcs3(1.6, 4, 0.13), ...arcs3(2.5, 4, 0.13)] },
  { id: 'tormenta', d: 5, items: [L(0.7, 0, 2), G(0.7, 2), LOG(1.95), ...arcs3(1.95), line(1.4, 1, 3)] },
  {
    id: 'doble-muro',
    d: 5,
    mustDive: true,
    items: [T(0.8, 0), G(0.8, 1), T(0.8, 2), dive(0.45, 1), R(2.4, 0), T(2.4, 1), R(2.4, 2), dive(2.05, 1)],
  },
  { id: 'red-tronco-red', d: 5, items: [R(0.7, 0), R(0.7, 1), LOG(1.75), ...arcs3(1.75), R(2.85, 1), R(2.85, 2), line(0.2, 2, 5)] },
  { id: 'carpas-remolino', d: 5, items: [CARP(0.8, 1, -1), WHIRL(2.0), ...arcs3(2.0, 5, 0.12), CARP(3.2, 0, 1)] },
];

export const INVALID = [];

function finalize(p) {
  const obs = p.items.filter((i) => i.k !== 'flores');
  const ts = obs.map((i) => i.t);
  const all = p.items.map((i) => (i.k === 'flores' ? i.t + (i.n - 1) * i.dt : i.t));
  return {
    ...p,
    tFirst: Math.min(...ts),
    tLast: Math.max(...ts),
    tEnd: Math.max(...all) + 0.15,
    mustDive: !!p.mustDive || !solvable(p.items, ['run', 'jump']),
    mustJump: !solvable(p.items, ['run', 'dive']),
  };
}

export const PATTERNS = RAW.filter((p) => {
  const ok = verifyPattern(p);
  if (!ok) INVALID.push(p.id);
  return ok;
}).map(finalize);

/** Orden fijo de las primeras apariciones (enseñan carril, buceo, salto). */
export const INTRO_IDS = ['lirio-uno', 'trajinera-buceo', 'tronco-uno', 'red-par', 'cerca-uno', 'lirio-ancho'];

/** Copia de los items con los carriles espejados (0 <-> 2). */
export function mirrorItems(items) {
  return items.map((it) => {
    const c = { ...it };
    if (it.k === 'lirio') c.lane = 2 - it.lane - ((it.span || 1) - 1);
    else if (it.lane !== undefined) c.lane = 2 - it.lane;
    if (it.k === 'carpa') c.from = -it.from;
    return c;
  });
}
