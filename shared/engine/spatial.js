// Rejilla espacial hash para consultas de proximidad. Las entidades exponen { x, y, r }.
// Contrato: createGrid(cellSize) -> { clear(), insert(e), query(x, y, r, out[]) -> out, nearest(x, y, r, filter) }
// Uso típico: clear() + insert() de todas las entidades en cada tick, y luego query()/nearest().
//   query(x, y, r, out)   vacía `out` (o crea uno) y lo llena con las entidades cuyo círculo toca el círculo (x, y, r),
//                         es decir distancia entre centros <= r + e.r. Devuelve `out`.
//   nearest(x, y, r, f)   la entidad más cercana (por distancia entre centros) dentro del mismo alcance que query,
//                         opcionalmente filtrada con f(e) -> boolean. Devuelve null si no hay ninguna.
// Extras: count (entidades insertadas), cellSize.

export function createGrid(cellSize = 64) {
  const cs = cellSize > 0 ? cellSize : 64;
  const inv = 1 / cs;
  const cells = new Map(); // clave de celda -> arreglo de entidades (se reutilizan entre ticks)
  const used = []; // celdas con contenido en este tick
  let maxR = 0;
  let n = 0;

  function key(cx, cy) {
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  function clear() {
    for (let i = 0; i < used.length; i++) used[i].length = 0;
    used.length = 0;
    maxR = 0;
    n = 0;
  }

  function insert(e) {
    const k = key(Math.floor(e.x * inv), Math.floor(e.y * inv));
    let bucket = cells.get(k);
    if (bucket === undefined) {
      bucket = [];
      cells.set(k, bucket);
    }
    if (bucket.length === 0) used.push(bucket);
    bucket.push(e);
    const r = e.r > 0 ? e.r : 0;
    if (r > maxR) maxR = r;
    n++;
  }

  function query(x, y, r, out) {
    if (!out) out = [];
    out.length = 0;
    if (n === 0) return out;
    const reach = r + maxR;
    const x0 = Math.floor((x - reach) * inv);
    const x1 = Math.floor((x + reach) * inv);
    const y0 = Math.floor((y - reach) * inv);
    const y1 = Math.floor((y + reach) * inv);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > used.length) {
      // Alcance enorme frente a la cantidad de celdas ocupadas: recorrer solo las ocupadas.
      for (let u = 0; u < used.length; u++) collect(used[u], x, y, r, out);
    } else {
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const bucket = cells.get(key(cx, cy));
          if (bucket !== undefined && bucket.length) collect(bucket, x, y, r, out);
        }
      }
    }
    return out;
  }

  function collect(bucket, x, y, r, out) {
    for (let i = 0; i < bucket.length; i++) {
      const e = bucket[i];
      const dx = e.x - x;
      const dy = e.y - y;
      const rr = r + (e.r > 0 ? e.r : 0);
      if (dx * dx + dy * dy <= rr * rr) out.push(e);
    }
  }

  function nearest(x, y, r, filter) {
    if (n === 0) return null;
    let best = null;
    let bestD = Infinity;
    const reach = r + maxR;
    const x0 = Math.floor((x - reach) * inv);
    const x1 = Math.floor((x + reach) * inv);
    const y0 = Math.floor((y - reach) * inv);
    const y1 = Math.floor((y + reach) * inv);
    const scanAll = (x1 - x0 + 1) * (y1 - y0 + 1) > used.length;

    const test = (bucket) => {
      for (let i = 0; i < bucket.length; i++) {
        const e = bucket[i];
        const dx = e.x - x;
        const dy = e.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= bestD) continue;
        const rr = r + (e.r > 0 ? e.r : 0);
        if (d2 > rr * rr) continue;
        if (filter && !filter(e)) continue;
        best = e;
        bestD = d2;
      }
    };

    if (scanAll) {
      for (let u = 0; u < used.length; u++) test(used[u]);
    } else {
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const bucket = cells.get(key(cx, cy));
          if (bucket !== undefined && bucket.length) test(bucket);
        }
      }
    }
    return best;
  }

  return {
    clear,
    insert,
    query,
    nearest,
    cellSize: cs,
    get count() {
      return n;
    },
  };
}

export default createGrid;
