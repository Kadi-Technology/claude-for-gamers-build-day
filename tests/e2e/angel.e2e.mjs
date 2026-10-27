// E2E de Ángel Survivors: arranca en modo debug con autostart, simula 10 s de input
// (WASD, Y mantenida, U, I, 1, 2, 3 y mouse) en cada mapa y exige 0 errores de consola.
// Uso: node tests/e2e/angel.e2e.mjs [urlBase]   (por defecto http://localhost:8080)

import {
  runMain,
  openSession,
  closeSession,
  gotoOk,
  urlFor,
  waitForReady,
  waitForScene,
  playTimeline,
  angelInputEvents,
  summarize,
  describeSummary,
} from './_browser.mjs';

const DURACION_MS = 10000;
const MAPAS = ['reforma', 'tepito'];

async function jugarMapa(browser, base, report, mapa) {
  report.step(`Ángel en el mapa ${mapa}: autostart solo, skin catrina, debug`);
  const session = await openSession(browser, `angel-${mapa}`);
  const { page } = session;

  const url = urlFor(base, `/games/angel/?autostart=solo&map=${mapa}&skin=catrina&debug=1`);
  await gotoOk(page, url);
  await waitForReady(page, `Ángel (${mapa})`);
  await waitForScene(page, 'playing', 20000);
  report.check(true, `Ángel (${mapa}) llegó a scene 'playing'`);

  report.info(`Simulando ${DURACION_MS / 1000} s de input en ${mapa}...`);
  const samples = await playTimeline(page, { durationMs: DURACION_MS, events: angelInputEvents(DURACION_MS), sampleEveryMs: 500 });
  const resumen = summarize(samples);
  report.info(describeSummary(resumen));

  report.check(
    resumen.valid === resumen.n && resumen.n > 0,
    `__cfgStats() responde con un objeto válido en las ${resumen.n} muestras (${mapa})`,
    `válidas: ${resumen.valid}/${resumen.n}`,
  );
  const malformadas = samples.filter(
    (s) => !(typeof s.scene === 'string' && typeof s.fps === 'number' && typeof s.entities === 'number'),
  );
  report.check(
    malformadas.length === 0,
    `__cfgStats() trae scene (texto), fps y entities (números) en todas las muestras (${mapa})`,
    malformadas.length ? `${malformadas.length} muestra(s) mal formada(s), p. ej. ${JSON.stringify(malformadas[0])}` : undefined,
  );
  report.check(
    resumen.entitiesMax !== null && resumen.entitiesMax > 0,
    `Aparecen enemigos durante la partida en ${mapa} (entities > 0)`,
    `entidades máx: ${resumen.entitiesMax}`,
  );
  report.check(new URL(page.url()).pathname.startsWith('/games/angel'), `La página sigue en /games/angel/ (${mapa})`, page.url());

  report.checkNoErrors(session, `${mapa}, ${DURACION_MS / 1000} s de juego`);
  await closeSession(session);
}

await runMain(
  'angel',
  async ({ browser, base, report }) => {
    for (const mapa of MAPAS) {
      await jugarMapa(browser, base, report, mapa);
    }
  },
  { timeoutMs: 150000 },
);
