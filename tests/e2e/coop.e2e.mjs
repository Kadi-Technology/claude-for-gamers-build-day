// E2E cooperativo de Ángel Survivors (ola W2): dos contextos independientes.
//   A crea la sala y juega 5 s; B se une con el código a mitad de la partida.
//   En <= 5 s B ve 2 jugadores y enemigos (entities > 0) y A ve 2 jugadores.
// Uso: node tests/e2e/coop.e2e.mjs [urlBase]   (por defecto http://localhost:8080)
//
// Ganchos: __cfgReady, __cfgStats() y __cfgRoom() -> { code, players: [...] }
// (ver contract_change_request: __cfgRoom no está todavía en docs/07 §3).

import {
  runMain,
  openSession,
  closeSession,
  gotoOk,
  urlFor,
  waitForReady,
  playTimeline,
  angelInputEvents,
  holdEvents,
  movementEvents,
  mouseOrbitEvents,
  sampleRoom,
  sampleStats,
  pollUntil,
  summarize,
  describeSummary,
  sleep,
} from './_browser.mjs';

const ANTES_DE_UNIRSE_MS = 5000; // A juega solo antes de que B entre
const A_DESPUES_MS = 14000; // A sigue jugando mientras B se une y se mueve
const LIMITE_UNION_MS = 5000; // B tiene 5 s para ver la sala y los enemigos de A
const B_JUEGA_MS = 3000;

function describirHook(sala) {
  if (!sala) return 'sin respuesta';
  if (sala.missing) return 'window.__cfgRoom no existe';
  if (sala.empty) return 'window.__cfgRoom() devolvió null/vacío';
  if (sala.error) return `error: ${sala.error}`;
  return JSON.stringify(sala);
}

function eventosB(durationMs) {
  // B camina en círculos y ataca para que A lo vea moverse.
  return [
    ...movementEvents({ durationMs, stepMs: 500, combos: [['d'], ['d', 's'], ['s'], ['a', 's'], ['a'], ['a', 'w'], ['w'], ['d', 'w']] }),
    ...holdEvents({ key: 'y', fromMs: 0, toMs: durationMs }),
    ...mouseOrbitEvents({ durationMs }),
  ];
}

await runMain(
  'coop',
  async ({ browser, base, report }) => {
    const A = await openSession(browser, 'A-anfitrion');
    const B = await openSession(browser, 'B-invitado');

    // --- A crea la sala y juega -------------------------------------------------------
    report.step('A abre Ángel, crea la sala y lee el código');
    await gotoOk(A.page, urlFor(base, '/games/angel/?room=create&autostart=solo&map=reforma&debug=1'));
    await waitForReady(A.page, 'A');

    const conCodigo = await pollUntil(
      () => sampleRoom(A.page),
      (s) => !!s && typeof s.code === 'string' && /^[A-Z]{4}$/i.test(s.code),
      { timeoutMs: 15000, intervalMs: 200 },
    );
    if (!conCodigo.ok) {
      throw new Error(`A no obtuvo un código de sala de 4 letras en 15 s (__cfgRoom: ${describirHook(conCodigo.value)})`);
    }
    const codigo = conCodigo.value.code;
    report.check(true, `A creó la sala con código ${codigo}`, `tras ${conCodigo.elapsedMs} ms`);

    report.step(`A juega ${ANTES_DE_UNIRSE_MS / 1000} s antes de que entre B`);
    const muestrasA1 = await playTimeline(A.page, {
      durationMs: ANTES_DE_UNIRSE_MS,
      events: angelInputEvents(ANTES_DE_UNIRSE_MS),
      sampleEveryMs: 500,
    });
    report.info(`A: ${describeSummary(summarize(muestrasA1))}`);

    // A sigue jugando en segundo plano mientras B se une (la partida está a mitad de oleada).
    const jugandoA = playTimeline(A.page, {
      durationMs: A_DESPUES_MS,
      events: angelInputEvents(A_DESPUES_MS),
      sampleEveryMs: 1000,
    });
    // Evita un rechazo sin manejar si B falla antes de esperar a A.
    jugandoA.catch(() => {});

    // --- B se une con el código -------------------------------------------------------
    report.step(`B se une a la sala ${codigo} a mitad de partida`);
    await gotoOk(B.page, urlFor(base, `/games/angel/?room=${encodeURIComponent(codigo)}&debug=1`));
    await waitForReady(B.page, 'B');

    const t0 = Date.now();
    const visto = { bJugadores: null, bEnemigos: null, aJugadores: null };
    let ultimoB;
    let ultimoStatsB;
    let ultimoA;
    while (Date.now() - t0 < LIMITE_UNION_MS) {
      [ultimoB, ultimoStatsB, ultimoA] = await Promise.all([sampleRoom(B.page), sampleStats(B.page), sampleRoom(A.page)]);
      const ahora = Date.now() - t0;
      if (visto.bJugadores === null && ultimoB && ultimoB.players === 2) visto.bJugadores = ahora;
      if (visto.bEnemigos === null && ultimoStatsB && typeof ultimoStatsB.entities === 'number' && ultimoStatsB.entities > 0) {
        visto.bEnemigos = ahora;
      }
      if (visto.aJugadores === null && ultimoA && ultimoA.players === 2) visto.aJugadores = ahora;
      if (visto.bJugadores !== null && visto.bEnemigos !== null && visto.aJugadores !== null) break;
      await sleep(100);
    }

    report.check(
      visto.bJugadores !== null,
      `B ve __cfgRoom().players.length === 2 en <= ${LIMITE_UNION_MS / 1000} s`,
      visto.bJugadores === null ? `B: ${describirHook(ultimoB)}` : undefined,
    );
    if (visto.bJugadores !== null) report.info(`B vio 2 jugadores a los ${visto.bJugadores} ms de cargar`);
    report.check(
      visto.bEnemigos !== null,
      `B ve __cfgStats().entities > 0 (los enemigos de A) en <= ${LIMITE_UNION_MS / 1000} s`,
      visto.bEnemigos === null ? `B stats: ${JSON.stringify(ultimoStatsB)}` : undefined,
    );
    if (visto.bEnemigos !== null) report.info(`B vio enemigos a los ${visto.bEnemigos} ms de cargar`);
    report.check(
      visto.aJugadores !== null,
      `A ve __cfgRoom().players.length === 2 en <= ${LIMITE_UNION_MS / 1000} s`,
      visto.aJugadores === null ? `A: ${describirHook(ultimoA)}` : undefined,
    );
    if (visto.aJugadores !== null) report.info(`A vio 2 jugadores a los ${visto.aJugadores} ms`);
    report.check(
      !!ultimoB && typeof ultimoB.code === 'string' && ultimoB.code.toUpperCase() === codigo.toUpperCase(),
      'B está en la misma sala (mismo código)',
      `A: ${codigo}, B: ${ultimoB ? ultimoB.code : '?'}`,
    );

    // --- Ambos juegan juntos ----------------------------------------------------------
    report.step(`B juega ${B_JUEGA_MS / 1000} s mientras A sigue jugando`);
    const muestrasB = await playTimeline(B.page, {
      durationMs: B_JUEGA_MS,
      events: eventosB(B_JUEGA_MS),
      sampleEveryMs: 500,
    });
    report.info(`B: ${describeSummary(summarize(muestrasB))}`);
    const muestrasA2 = await jugandoA;
    report.info(`A (con B dentro): ${describeSummary(summarize(muestrasA2))}`);

    const [finalA, finalB] = await Promise.all([sampleRoom(A.page), sampleRoom(B.page)]);
    report.check(
      !!finalA && finalA.players === 2 && !!finalB && finalB.players === 2,
      'Al terminar siguen los 2 jugadores en la sala (A y B)',
      `A: ${describirHook(finalA)} | B: ${describirHook(finalB)}`,
    );

    report.checkNoErrors(A, 'crear sala y jugar');
    report.checkNoErrors(B, 'unirse y jugar');

    await closeSession(B);
    await closeSession(A);
  },
  { timeoutMs: 150000 },
);
