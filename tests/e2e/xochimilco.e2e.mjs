// E2E de Xochimilco: arranca con autostart y debug, simula 15 s de input
// (A, D, W, S y Espacio) y verifica que la distancia crece, con 0 errores de consola.
// Uso: node tests/e2e/xochimilco.e2e.mjs [urlBase]   (por defecto http://localhost:8080)

import {
  runMain,
  openSession,
  gotoOk,
  urlFor,
  waitForReady,
  waitForScene,
  playTimeline,
  tapEvents,
  summarize,
  describeSummary,
} from './_browser.mjs';

const DURACION_MS = 15000;

// Cambios de carril: izquierda, centro, derecha, centro... (A, D, D, A) cada 800 ms.
function carriles() {
  const secuencia = ['a', 'd', 'd', 'a'];
  const eventos = [];
  for (let i = 0, at = 600; at < DURACION_MS; i += 1, at += 800) {
    eventos.push({ at, type: 'press', key: secuencia[i % secuencia.length], holdMs: 60 });
  }
  return eventos;
}

function construirEventos() {
  return [
    // G = modo Dios en debug (docs/07 §3): evita que un choque corte los 15 s de input.
    { at: 150, type: 'press', key: 'g', holdMs: 60 },
    ...carriles(),
    ...tapEvents({ key: 'w', startMs: 1000, everyMs: 3000, durationMs: DURACION_MS }),
    ...tapEvents({ key: 's', startMs: 2000, everyMs: 3000, durationMs: DURACION_MS }),
    ...tapEvents({ key: 'Space', startMs: 2800, everyMs: 3000, durationMs: DURACION_MS }),
  ];
}

await runMain(
  'xochimilco',
  async ({ browser, base, report }) => {
    report.step('Xochimilco: autostart y debug');
    const session = await openSession(browser, 'xochimilco');
    const { page } = session;

    await gotoOk(page, urlFor(base, '/games/xochimilco/?autostart=1&debug=1'));
    await waitForReady(page, 'Xochimilco');
    report.check(true, 'Xochimilco llegó a __cfgReady');

    try {
      await waitForScene(page, 'playing', 10000);
      report.check(true, "Xochimilco llegó a scene 'playing'");
    } catch (err) {
      report.check(false, "Xochimilco llegó a scene 'playing'", err.message);
    }

    report.info(`Simulando ${DURACION_MS / 1000} s de input (A, D, W, S, Espacio)...`);
    const samples = await playTimeline(page, { durationMs: DURACION_MS, events: construirEventos(), sampleEveryMs: 500 });
    const resumen = summarize(samples);
    report.info(describeSummary(resumen));

    report.check(
      resumen.valid === resumen.n && resumen.n > 0,
      `__cfgStats() responde con un objeto válido en las ${resumen.n} muestras`,
      `válidas: ${resumen.valid}/${resumen.n}`,
    );

    const distancias = resumen.distances;
    const inicio = distancias.length ? distancias[0] : null;
    const mitad = samples.find((s) => s.t >= DURACION_MS / 2 && typeof s.distance === 'number');
    const maxima = resumen.distanceMax;
    report.check(
      distancias.length === samples.length,
      '__cfgStats().distance es un número en todas las muestras',
      `con distancia: ${distancias.length}/${samples.length}`,
    );
    report.check(
      inicio !== null && maxima !== null && maxima > inicio,
      'La distancia crece durante la partida',
      `inicio: ${inicio}, máxima: ${maxima}`,
    );
    report.check(
      inicio !== null && !!mitad && mitad.distance > inicio,
      'La distancia ya había crecido a mitad de la prueba',
      `inicio: ${inicio}, a los ${mitad ? mitad.t : '?'} ms: ${mitad ? mitad.distance : '?'}`,
    );
    report.info(
      `Distancia: ${inicio === null ? '?' : Math.round(inicio)} -> ${mitad ? Math.round(mitad.distance) : '?'} (mitad) -> ${maxima === null ? '?' : Math.round(maxima)} (máx). Sigue creciendo al final: ${
        distancias.length >= 2 && distancias[distancias.length - 1] > (mitad ? mitad.distance : Infinity) ? 'sí' : 'no'
      }`,
    );
    report.check(new URL(page.url()).pathname.startsWith('/games/xochimilco'), 'La página sigue en /games/xochimilco/', page.url());

    report.checkNoErrors(session, `${DURACION_MS / 1000} s de juego`);
  },
  { timeoutMs: 120000 },
);
