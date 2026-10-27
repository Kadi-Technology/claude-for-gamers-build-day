// Bucle principal con timestep fijo y acumulador.
// Contrato: createLoop({ update(dt), render(alpha), hz = 60 }) -> { start(), stop(), paused: bool }
//   - update(dt) se llama con dt = 1/hz constante, cero o varias veces por frame según el tiempo acumulado.
//   - render(alpha) se llama una vez por frame de pantalla; alpha en [0,1) es la fracción de tick pendiente
//     (sirve para interpolar). Con paused = true se sigue llamando a render(1) para que los menús se dibujen.
//   - El tiempo de un frame se acota a 0.25 s (al volver de otra pestaña no hay ráfaga de simulación).
//   - paused es una propiedad de lectura/escritura: paused = true congela update() sin detener render().
//     Mientras está pausado no hay update(), así que para leer entrada en una pausa hay que llamar
//     input.poll() desde render().
//   - Un error dentro de update/render se informa por consola (sin repetir el mismo mensaje cada frame)
//     y el bucle sigue vivo: en una demo pública es mejor un frame malo que una pantalla congelada.
// Extras de solo lectura: running, fps (promedio móvil), ticks, time (segundos simulados), hz, step.

const MAX_FRAME = 0.25; // segundos

export function createLoop({ update, render, hz = 60 } = {}) {
  const rate = Number.isFinite(hz) && hz > 0 ? hz : 60;
  const step = 1 / rate;
  const hasRaf = typeof requestAnimationFrame === 'function';
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const schedule = hasRaf ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(() => fn(now()), 1000 / rate);
  const cancel = hasRaf ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);

  let running = false;
  let handle = 0;
  let last = 0;
  let acc = 0;
  let paused = false;
  let ticks = 0;
  let simTime = 0;
  let fps = rate;
  let lastErr = '';
  let errRepeats = 0;

  function report(err) {
    const msg = err && err.message ? err.message : String(err);
    if (msg === lastErr && ++errRepeats % 600 !== 0) return;
    if (msg !== lastErr) errRepeats = 0;
    lastErr = msg;
    console.error('[loop] error en el bucle:', err);
  }

  function frame(ts) {
    if (!running) return;
    handle = schedule(frame);

    let dt = (ts - last) / 1000;
    last = ts;
    if (!(dt > 0)) dt = 0;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    if (dt > 0) fps += (1 / dt - fps) * 0.1;

    if (!paused) {
      acc += dt;
      while (acc >= step - 1e-9) {
        acc -= step;
        if (typeof update === 'function') {
          try {
            update(step);
          } catch (err) {
            report(err);
          }
        }
        ticks++;
        simTime += step;
        if (!running) return; // update() llamó a stop()
      }
      if (acc < 0) acc = 0;
    }

    if (typeof render === 'function') {
      try {
        render(paused ? 1 : Math.min(1, acc / step));
      } catch (err) {
        report(err);
      }
    }
  }

  function start() {
    if (running) return;
    running = true;
    last = now();
    acc = 0;
    handle = schedule(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancel(handle);
  }

  return {
    start,
    stop,
    get paused() {
      return paused;
    },
    set paused(v) {
      const p = !!v;
      if (p === paused) return;
      paused = p;
      acc = 0; // al reanudar no hay ráfaga de ticks acumulados
    },
    get running() {
      return running;
    },
    get fps() {
      return fps;
    },
    get ticks() {
      return ticks;
    },
    get time() {
      return simTime;
    },
    hz: rate,
    step,
  };
}

export default createLoop;
