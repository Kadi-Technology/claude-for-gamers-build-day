// Pool de objetos reutilizables sin asignaciones en caliente.
// Contrato: createPool(factory, size) -> { acquire(), release(obj), forEach(fn), count }
//   acquire()      devuelve un objeto activo (nunca null: si el pool se agota crece con factory()).
//                  El objeto NO se reinicia: quien lo adquiere inicializa sus campos
//                  (o pasa un reset(obj) como tercer argumento y se invoca en cada acquire).
//   release(obj)   lo devuelve al pool; liberar dos veces o un objeto ajeno no hace nada.
//   forEach(fn)    recorre los objetos activos con fn(obj, i). Es seguro liberar el objeto actual dentro de fn;
//                  los objetos adquiridos durante el recorrido no se visitan hasta el siguiente.
//   count          cantidad de objetos activos.
// Extras: items (arreglo vivo de activos, solo lectura), capacity, clear(), has(obj).

const IDX = Symbol('poolIndex');

export function createPool(factory, size = 0, reset) {
  const active = []; // objetos en uso (liberación O(1) con swap-remove)
  const free = []; // objetos disponibles
  let capacity = 0;

  function make() {
    const obj = factory();
    obj[IDX] = -1;
    capacity++;
    return obj;
  }

  for (let i = 0; i < size; i++) free.push(make());

  function acquire() {
    const obj = free.length ? free.pop() : make();
    obj[IDX] = active.length;
    active.push(obj);
    if (reset) reset(obj);
    return obj;
  }

  function release(obj) {
    if (!obj) return;
    const i = obj[IDX];
    if (i === undefined || i < 0 || active[i] !== obj) return;
    const last = active.pop();
    if (last !== obj) {
      active[i] = last;
      last[IDX] = i;
    }
    obj[IDX] = -1;
    free.push(obj);
  }

  function forEach(fn) {
    // Hacia atrás: liberar el elemento actual (swap-remove) nunca salta uno sin visitar.
    for (let i = active.length - 1; i >= 0; i--) {
      const obj = active[i];
      if (obj !== undefined) fn(obj, i);
    }
  }

  function clear() {
    for (let i = active.length - 1; i >= 0; i--) {
      const obj = active[i];
      obj[IDX] = -1;
      free.push(obj);
    }
    active.length = 0;
  }

  function has(obj) {
    return !!obj && obj[IDX] >= 0 && active[obj[IDX]] === obj;
  }

  return {
    acquire,
    release,
    forEach,
    clear,
    has,
    get count() {
      return active.length;
    },
    get items() {
      return active;
    },
    get capacity() {
      return capacity;
    },
  };
}

export default createPool;
