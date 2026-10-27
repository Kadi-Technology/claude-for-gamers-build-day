// E2E del lobby: lobby -> Ángel -> lobby -> Xochimilco -> lobby con 0 errores de consola.
// Uso: node tests/e2e/lobby.e2e.mjs [urlBase]   (por defecto http://localhost:8080)
// Verifica R7 (navegación) y R8 (créditos visibles sin scroll en escritorio).

import {
  runMain,
  openSession,
  gotoOk,
  urlFor,
  waitForReady,
  sampleStats,
  openGameFromLobby,
  backToLobby,
  visibleInViewport,
  bodyText,
  isLobbyUrl,
} from './_browser.mjs';

const CREDITOS = [
  { nombre: '26 de octubre', patron: /26 de octubre/i },
  { nombre: 'Rich Lira', patron: /Rich Lira/i },
  { nombre: 'Claude API', patron: /Claude API/i },
  { nombre: 'KADI Harness', patron: /KADI Harness/i },
];

async function checkLobbyCompleto(page, report) {
  const texto = await bodyText(page);

  report.check(/Claude for Gamers/i.test(texto) && /Build Day/i.test(texto), 'Encabezado "Claude for Gamers · Build Day"');
  report.check(/Ángel/i.test(texto) && /Xochimilco/i.test(texto), 'Las dos tarjetas (Ángel y Xochimilco) están en el lobby');
  report.check(/JUGAR/i.test(texto), 'Las tarjetas tienen botón JUGAR');

  for (const credito of CREDITOS) {
    report.check(credito.patron.test(texto), `Créditos mencionan "${credito.nombre}"`);
  }
  report.check(
    /oficial[\s\S]{0,60}Anthropic|Anthropic[\s\S]{0,60}oficial/i.test(texto),
    'Aviso de que no es un producto oficial de Anthropic',
  );

  const viewport = page.viewportSize();
  const fuera = [];
  for (const credito of CREDITOS) {
    if (!(await visibleInViewport(page, credito.patron))) fuera.push(credito.nombre);
  }
  report.check(
    fuera.length === 0,
    `Créditos visibles sin scroll en ${viewport.width}x${viewport.height}`,
    fuera.length ? `fuera del viewport: ${fuera.join(', ')}` : undefined,
  );

  const stats = await sampleStats(page);
  report.check(
    !!stats && typeof stats.scene === 'string' && stats.scene.length > 0,
    'El lobby expone __cfgStats() con scene',
    `valor: ${JSON.stringify(stats)}`,
  );
}

async function checkLobbyDeVuelta(page, report, contexto) {
  const texto = await bodyText(page);
  const completo = /Claude for Gamers/i.test(texto) && /Ángel/i.test(texto) && /Xochimilco/i.test(texto) && /Rich Lira/i.test(texto) && /KADI Harness/i.test(texto);
  report.check(completo, `El lobby se muestra completo ${contexto}`);
}

async function visitarJuego(page, report, base, juego, nombre) {
  report.step(`Ir a ${nombre} desde la tarjeta del lobby`);
  await openGameFromLobby(page, juego);
  const url = new URL(page.url());
  report.check(url.pathname.startsWith(`/games/${juego}`), `La tarjeta lleva a /games/${juego}/`, `URL: ${page.url()}`);
  await waitForReady(page, nombre);
  report.check(true, `${nombre} llegó a __cfgReady`);

  const stats = await sampleStats(page);
  report.check(
    !!stats && typeof stats.scene === 'string',
    `${nombre} expone __cfgStats() con scene`,
    `valor: ${JSON.stringify(stats)}`,
  );

  report.step(`Volver al lobby con "← Lobby" desde ${nombre}`);
  const volvio = await backToLobby(page, base);
  report.check(volvio, `El botón "← Lobby" de ${nombre} existe y lleva al lobby`, `URL: ${page.url()}`);
  if (!volvio) {
    // Seguimos la prueba para reportar el resto de fallos de la cadena.
    await gotoOk(page, urlFor(base, '/'));
  }
  report.check(isLobbyUrl(page.url(), base), `De vuelta en la raíz del lobby tras ${nombre}`, `URL: ${page.url()}`);
  await waitForReady(page, `lobby tras ${nombre}`);
  await checkLobbyDeVuelta(page, report, `tras ${nombre}`);
}

await runMain(
  'lobby',
  async ({ browser, base, report }) => {
    const session = await openSession(browser, 'lobby');
    const { page } = session;

    report.step('Cargar el lobby');
    await gotoOk(page, urlFor(base, '/'));
    await waitForReady(page, 'lobby');
    report.check(true, 'El lobby llegó a __cfgReady');
    await checkLobbyCompleto(page, report);

    await visitarJuego(page, report, base, 'angel', 'Ángel Survivors');
    await visitarJuego(page, report, base, 'xochimilco', 'Xochimilco');

    report.checkNoErrors(session, 'lobby -> Ángel -> lobby -> Xochimilco -> lobby');
  },
  { timeoutMs: 120000 },
);
