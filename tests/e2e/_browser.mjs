// Utilidades compartidas de las pruebas E2E de "Claude for Gamers - Build Day".
//
// - Usa playwright-core con el Chromium local (no descarga navegadores):
//   CFG_CHROME o %LOCALAPPDATA%\ms-playwright\chromium-1228\chrome-win64\chrome.exe
// - Recolecta errores de consola (console.error), pageerror, crashes y diálogos inesperados.
// - Solo depende de los ganchos de docs/07 §3: __cfgReady, __cfgStats() y, en la prueba
//   cooperativa, __cfgRoom().
// - Cada script recibe la URL base por argv[2] (por defecto http://localhost:8080).

import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_BASE_URL = 'http://localhost:8080';
export const DEFAULT_VIEWPORT = { width: 1366, height: 768 };

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Navegador y URLs
// ---------------------------------------------------------------------------

export function chromePath() {
  if (process.env.CFG_CHROME) return process.env.CFG_CHROME;
  const local = process.env.LOCALAPPDATA;
  if (!local) {
    throw new Error('No se pudo resolver el Chromium: define CFG_CHROME con la ruta de chrome.exe (LOCALAPPDATA no existe).');
  }
  return join(local, 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe');
}

export async function launchBrowser() {
  const executablePath = chromePath();
  if (!existsSync(executablePath)) {
    throw new Error(`No existe el Chromium en ${executablePath}. Define CFG_CHROME con la ruta de chrome.exe.`);
  }
  return chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      // Que el bucle de render no se frene aunque haya varias páginas (prueba cooperativa).
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
}

/** URL base desde argv[2] (por defecto http://localhost:8080), siempre con "/" final. */
export function baseUrlFromArgv(argv = process.argv) {
  const raw = argv[2] && !argv[2].startsWith('--') ? argv[2] : DEFAULT_BASE_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`URL base inválida: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`La URL base debe ser http(s): ${raw}`);
  }
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

/** Une una ruta relativa a la raíz del sitio ("/games/angel/?x=1") con la URL base. */
export function urlFor(base, path) {
  return new URL(String(path).replace(/^\//, ''), base).href;
}

function normalizePath(pathname) {
  let p = pathname.replace(/index\.html$/i, '');
  if (!p.endsWith('/')) p += '/';
  return p;
}

/** true si la URL es la raíz del lobby de la URL base. */
export function isLobbyUrl(url, base) {
  const u = url instanceof URL ? url : new URL(url);
  return normalizePath(u.pathname) === normalizePath(new URL(base).pathname);
}

// ---------------------------------------------------------------------------
// Sesiones (contexto + página) con recolección de errores
// ---------------------------------------------------------------------------

const registry = new Set();

function collectErrors(page, label) {
  const errors = [];
  const push = (kind, text, where = '') => errors.push({ label, kind, text, where });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const loc = msg.location();
    const url = loc && loc.url ? loc.url : '';
    if (/\/favicon\.ico(\?|$)/i.test(url)) return; // los navegadores lo piden solos; no es del juego
    push('console', msg.text(), url ? `${url}:${loc.lineNumber ?? 0}` : '');
  });
  page.on('pageerror', (err) => {
    const frame = String(err && err.stack ? err.stack : '').split('\n')[1];
    push('pageerror', `${err && err.name ? err.name : 'Error'}: ${err && err.message ? err.message : err}`, frame ? frame.trim() : '');
  });
  page.on('crash', () => push('crash', 'La página se cayó (crash del renderizador)'));
  page.on('dialog', async (dialog) => {
    if (dialog.type() !== 'beforeunload') push('dialog', `${dialog.type()}: ${dialog.message()}`);
    try {
      if (dialog.type() === 'beforeunload') await dialog.accept();
      else await dialog.dismiss();
    } catch {
      /* la página ya se cerró */
    }
  });
  return errors;
}

/** Abre un contexto nuevo (localStorage limpio) y una página con recolector de errores. */
export async function openSession(browser, label, options = {}) {
  const { viewport = DEFAULT_VIEWPORT } = options;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  });
  const page = await context.newPage();
  const errors = collectErrors(page, label);
  const session = { label, context, page, errors };
  registry.add(session);
  return session;
}

export async function closeSession(session) {
  registry.delete(session);
  try {
    await session.context.close();
  } catch {
    /* ya cerrado */
  }
}

async function saveFailureShots(name) {
  for (const session of registry) {
    try {
      if (session.page.isClosed()) continue;
      const file = join(tmpdir(), `cfg-e2e-${name}-${session.label}.png`);
      await session.page.screenshot({ path: file, timeout: 5000 });
      console.error(`[${name}] captura de ${session.label}: ${file}`);
    } catch {
      /* sin captura */
    }
  }
}

// ---------------------------------------------------------------------------
// Reporte y ciclo de vida del script
// ---------------------------------------------------------------------------

export function createReport(name) {
  const t0 = Date.now();
  let passed = 0;
  let failed = 0;
  const tag = `[${name}]`;

  const report = {
    name,
    get passed() {
      return passed;
    },
    get failed() {
      return failed;
    },
    step(message) {
      console.log(`${tag} > ${message}`);
    },
    info(message) {
      console.log(`${tag}     ${message}`);
    },
    check(condition, message, detail) {
      if (condition) {
        passed += 1;
        console.log(`${tag}   OK     ${message}`);
        return true;
      }
      failed += 1;
      console.error(`${tag}   FALLO  ${message}${detail ? ` -> ${detail}` : ''}`);
      return false;
    },
    fail(message) {
      failed += 1;
      console.error(`${tag}   FALLO  ${message}`);
    },
    /** Exige 0 errores de consola / pageerror en la sesión y los imprime si los hay. */
    checkNoErrors(session, when = 'toda la prueba') {
      const ok = report.check(
        session.errors.length === 0,
        `0 errores de consola en ${session.label} (${when})`,
        `${session.errors.length} error(es)`,
      );
      if (!ok) {
        for (const e of session.errors) {
          console.error(`${tag}          ${e.kind}: ${e.text}${e.where ? `  [${e.where}]` : ''}`);
        }
      }
      return ok;
    },
    finish() {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const ok = failed === 0;
      const line = `${tag} RESULTADO: ${ok ? 'OK' : 'FALLO'} - ${passed} verificaciones correctas, ${failed} fallidas (${secs} s)`;
      if (ok) console.log(line);
      else console.error(line);
      return ok ? 0 : 1;
    },
  };
  return report;
}

/**
 * Ejecuta el cuerpo de una prueba: lanza el navegador, captura excepciones, cierra todo,
 * imprime el resumen y sale con código 0 (todo bien) o 1 (cualquier fallo).
 */
export async function runMain(name, body, { timeoutMs = 180000 } = {}) {
  const report = createReport(name);
  let browser;
  const watchdog = setTimeout(() => {
    console.error(`[${name}] FALLO  Tiempo agotado: la prueba superó ${Math.round(timeoutMs / 1000)} s`);
    process.exit(1);
  }, timeoutMs);

  try {
    const base = baseUrlFromArgv();
    report.info(`URL base: ${base}`);
    browser = await launchBrowser();
    await body({ browser, base, report });
  } catch (err) {
    report.fail(`Excepción: ${err && err.message ? err.message : err}`);
  }

  if (report.failed > 0) await saveFailureShots(name);
  clearTimeout(watchdog);
  if (browser) {
    try {
      await browser.close();
    } catch {
      /* ya cerrado */
    }
  }
  const code = report.finish();
  // Vaciar stdout/stderr antes de salir para no truncar el resumen cuando se redirige a un archivo o pipe.
  await new Promise((resolve) => process.stdout.write('', resolve));
  await new Promise((resolve) => process.stderr.write('', resolve));
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Ganchos de prueba (docs/07 §3)
// ---------------------------------------------------------------------------

export async function gotoOk(page, url) {
  const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  if (!response) throw new Error(`Sin respuesta al abrir ${url}`);
  if (response.status() >= 400) throw new Error(`HTTP ${response.status()} al abrir ${url}`);
  return response;
}

export async function waitForReady(page, label = 'página', timeoutMs = 20000) {
  try {
    await page.waitForFunction(() => window.__cfgReady === true, null, { timeout: timeoutMs, polling: 100 });
  } catch {
    throw new Error(`${label}: window.__cfgReady no llegó a true en ${timeoutMs} ms (URL ${page.url()})`);
  }
}

/** Lee __cfgStats() de forma segura. Devuelve null si el gancho no existe. */
export async function sampleStats(page) {
  return page.evaluate(() => {
    try {
      if (typeof window.__cfgStats !== 'function') return null;
      const s = window.__cfgStats();
      if (!s || typeof s !== 'object') return null;
      const count = (v) => {
        if (Array.isArray(v)) return v.length;
        if (v instanceof Map || v instanceof Set) return v.size;
        return typeof v === 'number' ? v : undefined;
      };
      return {
        scene: s.scene,
        fps: s.fps,
        entities: s.entities,
        wave: s.wave,
        distance: s.distance,
        players: count(s.players),
      };
    } catch (e) {
      return { error: String(e) };
    }
  });
}

export async function waitForScene(page, scene, timeoutMs = 20000) {
  try {
    await page.waitForFunction(
      (wanted) => {
        try {
          return typeof window.__cfgStats === 'function' && window.__cfgStats().scene === wanted;
        } catch {
          return false;
        }
      },
      scene,
      { timeout: timeoutMs, polling: 100 },
    );
  } catch {
    const last = await sampleStats(page).catch(() => null);
    throw new Error(
      `__cfgStats().scene no llegó a '${scene}' en ${timeoutMs} ms (último: ${JSON.stringify(last)}; URL ${page.url()})`,
    );
  }
}

/** Lee __cfgRoom() de forma segura (prueba cooperativa). */
export async function sampleRoom(page) {
  return page.evaluate(() => {
    try {
      if (typeof window.__cfgRoom !== 'function') return { missing: true };
      const r = window.__cfgRoom();
      if (!r || typeof r !== 'object') return { empty: true };
      const ps = r.players;
      let players = -1;
      if (Array.isArray(ps)) players = ps.length;
      else if (ps instanceof Map || ps instanceof Set) players = ps.size;
      return { code: r.code, players, host: r.host, you: r.you };
    } catch (e) {
      return { error: String(e) };
    }
  });
}

/** Repite fn() hasta que pred(valor) sea verdadero. Devuelve { ok, value, elapsedMs }. */
export async function pollUntil(fn, pred, { timeoutMs = 5000, intervalMs = 100 } = {}) {
  const t0 = Date.now();
  let value;
  for (;;) {
    value = await fn();
    if (pred(value)) return { ok: true, value, elapsedMs: Date.now() - t0 };
    if (Date.now() - t0 >= timeoutMs) return { ok: false, value, elapsedMs: Date.now() - t0 };
    await sleep(intervalMs);
  }
}

// ---------------------------------------------------------------------------
// Simulación de input con línea de tiempo
// ---------------------------------------------------------------------------

/** Cambia de combinación de teclas de movimiento cada stepMs (mantiene las que se repiten). */
export function movementEvents({ durationMs, stepMs = 600, combos }) {
  const events = [];
  let previous = [];
  for (let i = 0, at = 0; at < durationMs; i += 1, at += stepMs) {
    const next = combos[i % combos.length];
    for (const key of previous) if (!next.includes(key)) events.push({ at, type: 'up', key });
    for (const key of next) if (!previous.includes(key)) events.push({ at, type: 'down', key });
    previous = next;
  }
  for (const key of previous) events.push({ at: durationMs, type: 'up', key });
  return events;
}

/** Pulsaciones breves de una tecla: startMs, startMs + everyMs, ... hasta durationMs. */
export function tapEvents({ key, startMs = 0, everyMs, durationMs, holdMs = 60 }) {
  const events = [];
  for (let at = startMs; at < durationMs; at += everyMs) events.push({ at, type: 'press', key, holdMs });
  return events;
}

/** Mantiene una tecla pulsada entre fromMs y toMs. */
export function holdEvents({ key, fromMs = 0, toMs }) {
  return [
    { at: fromMs, type: 'down', key },
    { at: toMs, type: 'up', key },
  ];
}

/** Mueve el mouse en círculo alrededor del centro del viewport para ejercitar el apuntado. */
export function mouseOrbitEvents({ durationMs, everyMs = 200, viewport = DEFAULT_VIEWPORT, radius = 220 }) {
  const events = [];
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  for (let at = 0; at < durationMs; at += everyMs) {
    const a = at / 700;
    events.push({ at, type: 'move', x: Math.round(cx + radius * Math.cos(a)), y: Math.round(cy + radius * Math.sin(a)) });
  }
  return events;
}

const ANGEL_COMBOS = [['w', 'd'], ['d', 's'], ['s', 'a'], ['a', 'w'], ['w'], ['d'], ['s'], ['a']];

/**
 * Entradas típicas de Ángel Survivors: WASD recorriendo el mapa, Y mantenida (se suelta y se
 * vuelve a pulsar a la mitad para ejercitar también el flanco), U e I con sus cooldowns,
 * espacios 1/2/3 de la mochila (los vacíos deben ignorarse) y el mouse en órbita.
 */
export function angelInputEvents(durationMs, viewport = DEFAULT_VIEWPORT) {
  const mid = Math.floor(durationMs / 2);
  const slots = [];
  for (let k = 0, at = 800; at < durationMs; k += 1, at += 1500) {
    slots.push({ at, type: 'press', key: String((k % 3) + 1), holdMs: 50 });
  }
  return [
    ...movementEvents({ durationMs, stepMs: 600, combos: ANGEL_COMBOS }),
    ...holdEvents({ key: 'y', fromMs: 0, toMs: mid }),
    ...holdEvents({ key: 'y', fromMs: mid + 150, toMs: durationMs }),
    ...tapEvents({ key: 'u', startMs: 1200, everyMs: 2500, durationMs }),
    ...tapEvents({ key: 'i', startMs: 2000, everyMs: 1700, durationMs }),
    ...slots,
    ...mouseOrbitEvents({ durationMs, viewport }),
  ];
}

/**
 * Ejecuta una línea de tiempo de entradas durante durationMs y muestrea __cfgStats() cada
 * sampleEveryMs. Eventos: down/up/press (teclado), move (mouse). Siempre suelta las teclas.
 * Devuelve las muestras [{ t, scene, fps, entities, wave, distance, players }].
 */
export async function playTimeline(page, { durationMs, events, sampleEveryMs = 500 }) {
  const timeline = events.filter((e) => e.at >= 0 && e.at <= durationMs).map((e) => ({ ...e }));
  for (let at = 0; at <= durationMs; at += sampleEveryMs) timeline.push({ at, type: 'sample' });
  // Orden estable: las entradas de un instante van antes que la muestra de ese instante.
  timeline.sort((a, b) => a.at - b.at);

  const held = new Set();
  const samples = [];
  const t0 = performance.now();
  try {
    for (const ev of timeline) {
      const wait = ev.at - (performance.now() - t0);
      if (wait > 0) await sleep(wait);
      if (ev.type === 'down') {
        await page.keyboard.down(ev.key);
        held.add(ev.key);
      } else if (ev.type === 'up') {
        await page.keyboard.up(ev.key);
        held.delete(ev.key);
      } else if (ev.type === 'press') {
        await page.keyboard.press(ev.key, { delay: ev.holdMs ?? 60 });
      } else if (ev.type === 'move') {
        await page.mouse.move(ev.x, ev.y);
      } else if (ev.type === 'sample') {
        const s = await sampleStats(page);
        samples.push(s ? { t: Math.round(performance.now() - t0), ...s } : { t: Math.round(performance.now() - t0), missing: true });
      }
    }
    const rest = durationMs - (performance.now() - t0);
    if (rest > 0) await sleep(rest);
  } finally {
    for (const key of held) {
      try {
        await page.keyboard.up(key);
      } catch {
        /* la página ya no existe */
      }
    }
  }
  return samples;
}

const nums = (samples, field) => samples.map((s) => s[field]).filter((v) => typeof v === 'number' && Number.isFinite(v));

/** Resumen numérico de las muestras de __cfgStats(). */
export function summarize(samples) {
  const fps = nums(samples, 'fps');
  const entities = nums(samples, 'entities');
  const waves = nums(samples, 'wave');
  const distances = nums(samples, 'distance');
  const players = nums(samples, 'players');
  return {
    n: samples.length,
    valid: samples.filter((s) => !s.missing && !s.error).length,
    scenes: [...new Set(samples.map((s) => s.scene).filter((v) => typeof v === 'string'))],
    fpsMin: fps.length ? Math.min(...fps) : null,
    fpsAvg: fps.length ? fps.reduce((a, b) => a + b, 0) / fps.length : null,
    entitiesMax: entities.length ? Math.max(...entities) : null,
    waveMax: waves.length ? Math.max(...waves) : null,
    distances,
    distanceMax: distances.length ? Math.max(...distances) : null,
    playersMax: players.length ? Math.max(...players) : null,
  };
}

export function describeSummary(sum) {
  const parts = [`${sum.valid}/${sum.n} muestras`, `escenas: ${sum.scenes.join(', ') || '-'}`];
  if (sum.fpsAvg !== null) parts.push(`fps medio ${sum.fpsAvg.toFixed(0)} (mín ${sum.fpsMin})`);
  if (sum.entitiesMax !== null) parts.push(`entidades máx ${sum.entitiesMax}`);
  if (sum.waveMax !== null) parts.push(`oleada máx ${sum.waveMax}`);
  if (sum.distanceMax !== null) parts.push(`distancia máx ${Math.round(sum.distanceMax)}`);
  if (sum.playersMax !== null) parts.push(`jugadores máx ${sum.playersMax}`);
  return parts.join(' | ');
}

// ---------------------------------------------------------------------------
// Navegación del lobby (sin depender de ids concretos)
// ---------------------------------------------------------------------------

const GAMES = {
  angel: { slug: 'angel', palabra: 'Ángel', otra: 'Xochimilco' },
  xochimilco: { slug: 'xochimilco', palabra: 'Xochimilco', otra: 'Ángel' },
};

async function visibleCount(locator) {
  return locator.filter({ visible: true }).count();
}

async function clickables(page) {
  return page
    .locator('a, button, [role="button"]')
    .evaluateAll((els) =>
      els
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute('href') ? `[${el.getAttribute('href')}]` : ''}:"${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`)
        .slice(0, 20),
    )
    .catch(() => []);
}

/**
 * Entra a un juego desde la tarjeta del lobby. Prueba, en orden: el enlace a /games/<slug>,
 * data-game, el botón JUGAR dentro de la tarjeta que menciona al juego y, por último, un
 * enlace o botón con el nombre del juego.
 */
export async function openGameFromLobby(page, game) {
  const g = GAMES[game];
  if (!g) throw new Error(`Juego desconocido: ${game}`);
  const jugarEnTarjeta =
    `xpath=//*[self::a or self::button or @role='button' or @role='link']` +
    `[contains(translate(normalize-space(.), 'jugar', 'JUGAR'), 'JUGAR')]` +
    `[ancestor::*[contains(normalize-space(.), '${g.palabra}') and not(contains(normalize-space(.), '${g.otra}'))]]`;
  const candidates = [
    page.locator(`a[href*="games/${g.slug}"]`),
    page.locator(`[data-game="${g.slug}"] :is(a, button)`),
    page.locator(`[data-game="${g.slug}"]`),
    page.locator(jugarEnTarjeta),
    page.getByRole('link', { name: new RegExp(g.palabra, 'i') }),
    page.getByRole('button', { name: new RegExp(g.palabra, 'i') }),
  ];
  for (const candidate of candidates) {
    if ((await visibleCount(candidate)) === 0) continue;
    const target = candidate.filter({ visible: true }).first();
    await Promise.all([
      page.waitForURL((u) => u.pathname.includes(`/games/${g.slug}`), { timeout: 15000 }),
      target.click({ timeout: 5000 }),
    ]);
    return true;
  }
  const found = await clickables(page);
  throw new Error(`No se encontró la tarjeta/botón JUGAR de ${g.palabra} en el lobby. Elementos visibles: ${found.join(' ; ')}`);
}

/**
 * Pulsa "← Lobby" en un juego. Si el botón no aparece de inmediato, pulsa Enter una vez
 * (pasa de la pantalla de título al menú principal). Devuelve true si llegó al lobby.
 */
export async function backToLobby(page, base) {
  const finders = () => [
    page.getByRole('link', { name: /Lobby/i }),
    page.getByRole('button', { name: /Lobby/i }),
    page.getByText(/←\s*Lobby/),
    page.locator('a[href="/"], a[href="../../"], a[href="../.."], a[href="/index.html"], a[href="../../index.html"]'),
  ];
  for (let round = 0; round < 2; round += 1) {
    for (const finder of finders()) {
      if ((await visibleCount(finder)) === 0) continue;
      const target = finder.filter({ visible: true }).first();
      await Promise.all([
        page.waitForURL((u) => isLobbyUrl(u, base), { timeout: 15000 }),
        target.click({ timeout: 5000 }),
      ]);
      return true;
    }
    if (round === 0) {
      await page.keyboard.press('Enter');
      await sleep(600);
    }
  }
  const found = await clickables(page);
  console.error(`   (diagnóstico) botones visibles tras buscar "← Lobby": ${found.join(' ; ') || 'ninguno'}`);
  return false;
}

/** true si algún elemento visible que cumple el patrón queda completo dentro del viewport. */
export async function visibleInViewport(page, pattern) {
  const viewport = page.viewportSize();
  for (const locator of await page.getByText(pattern).all()) {
    if (!(await locator.isVisible())) continue;
    const box = await locator.boundingBox();
    if (!box) continue;
    if (box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1) {
      return true;
    }
  }
  return false;
}

/** Texto visible del documento (innerText), vacío si falla. */
export async function bodyText(page) {
  return page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
}
