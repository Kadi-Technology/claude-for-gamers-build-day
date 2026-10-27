// Bus de eventos mínimo y síncrono. Contrato: on(evt, fn), off(evt, fn), emit(evt, payload).
// - Las listas de oyentes son inmutables (copy-on-write): se puede hacer on/off dentro de un emit sin saltarse oyentes.
// - Un oyente que lanza no rompe a los demás: el error se informa por consola y la emisión continúa.

export function createBus() {
  const map = new Map();

  function on(evt, fn) {
    if (typeof fn !== 'function') return () => {};
    const cur = map.get(evt);
    if (!cur) map.set(evt, [fn]);
    else if (!cur.includes(fn)) map.set(evt, cur.concat([fn]));
    return () => off(evt, fn);
  }

  function once(evt, fn) {
    if (typeof fn !== 'function') return () => {};
    const wrapper = (payload, name) => {
      off(evt, wrapper);
      fn(payload, name);
    };
    wrapper._orig = fn;
    return on(evt, wrapper);
  }

  function off(evt, fn) {
    const cur = map.get(evt);
    if (!cur) return;
    const next = cur.filter((f) => f !== fn && f._orig !== fn);
    if (next.length === cur.length) return;
    if (next.length) map.set(evt, next);
    else map.delete(evt);
  }

  function emit(evt, payload) {
    const cur = map.get(evt);
    if (!cur) return;
    for (let i = 0; i < cur.length; i++) {
      try {
        cur[i](payload, evt);
      } catch (err) {
        console.error('[bus] error en oyente de "' + String(evt) + '":', err);
      }
    }
  }

  function clear(evt) {
    if (evt === undefined) map.clear();
    else map.delete(evt);
  }

  function count(evt) {
    const cur = map.get(evt);
    return cur ? cur.length : 0;
  }

  return { on, once, off, emit, clear, count };
}

// Bus global compartido por todos los módulos de una página.
const bus = createBus();

export const on = bus.on;
export const once = bus.once;
export const off = bus.off;
export const emit = bus.emit;
export const clear = bus.clear;
export const count = bus.count;
export default bus;
