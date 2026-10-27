// Generador pseudoaleatorio determinista (mulberry32).
// Contrato: createRng(seed) -> { next(), range(a,b), int(a,b), pick(arr) }
//   next()      -> float en [0, 1)
//   range(a,b)  -> float en [a, b)            range(n) equivale a range(0, n)
//   int(a,b)    -> entero en [a, b)  (b EXCLUSIVO, como un índice de arreglo)   int(n) equivale a int(0, n)
//   pick(arr)   -> elemento al azar (undefined si el arreglo está vacío)
// Extras: chance(p), sign(), shuffle(arr) (in situ), fork(), getState()/setState(s), seed.

function hashString(str) {
  // FNV-1a de 32 bits
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function toSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Number.isInteger(seed) ? seed >>> 0 : hashString(String(seed));
  }
  if (seed === undefined || seed === null) return 0x9e3779b9;
  return hashString(String(seed));
}

export function createRng(seed) {
  const initial = toSeed(seed);
  let s = initial;

  function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function range(a, b) {
    if (b === undefined) {
      b = a;
      a = 0;
    }
    return a + next() * (b - a);
  }

  function int(a, b) {
    if (b === undefined) {
      b = a;
      a = 0;
    }
    const lo = Math.ceil(a);
    const hi = Math.ceil(b);
    if (hi <= lo) return lo;
    return lo + Math.floor(next() * (hi - lo));
  }

  function pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(next() * arr.length)];
  }

  function chance(p = 0.5) {
    return next() < p;
  }

  function sign() {
    return next() < 0.5 ? -1 : 1;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function fork() {
    return createRng((next() * 4294967296) >>> 0);
  }

  return {
    next,
    range,
    int,
    pick,
    chance,
    sign,
    shuffle,
    fork,
    getState: () => s,
    setState: (v) => {
      s = v | 0;
    },
    get seed() {
      return initial;
    },
  };
}

export default createRng;
