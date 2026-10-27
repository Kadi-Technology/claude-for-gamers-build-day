// Persistencia ligera sobre localStorage. Contrato: load(key, fallback), save(key, value).
// - Todas las claves viven bajo el prefijo 'cfg.' (se añade solo si falta, así 'profile' y 'cfg.profile' son la misma clave).
// - Los valores se guardan como JSON.
// - Nunca lanza: si localStorage no está disponible (modo privado, datos bloqueados, cuota llena) se usa un respaldo en memoria
//   que dura lo que dure la página.

const PREFIX = 'cfg.';
const mem = new Map();

function fullKey(key) {
  const k = String(key);
  return k.startsWith(PREFIX) ? k : PREFIX + k;
}

function backend() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // acceder a window.localStorage puede lanzar con datos bloqueados
  }
}

export function load(key, fallback = null) {
  const k = fullKey(key);
  try {
    const ls = backend();
    if (ls) {
      const raw = ls.getItem(k);
      if (raw !== null) return JSON.parse(raw);
    }
  } catch {
    // JSON corrupto o acceso denegado: seguimos con el respaldo
  }
  return mem.has(k) ? mem.get(k) : fallback;
}

export function save(key, value) {
  const k = fullKey(key);
  try {
    const ls = backend();
    if (ls) {
      ls.setItem(k, JSON.stringify(value));
      mem.delete(k);
      return true;
    }
  } catch {
    // cuota llena o acceso denegado
  }
  mem.set(k, value);
  return false;
}

export function remove(key) {
  const k = fullKey(key);
  mem.delete(k);
  try {
    const ls = backend();
    if (ls) ls.removeItem(k);
  } catch {
    // nada que hacer
  }
}

export default { load, save, remove };
