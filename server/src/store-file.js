// Store de desarrollo local: JSON en server/data/ con escritura atomica (archivo temporal + rename).
//
// Interfaz comun de store (la misma que store-dynamo.js):
//   put(game, entry)                      -> { added: boolean, existing?: { score } }
//   top(game, scope, limit)               -> [{ alias, score, runId, meta, ts }] de mayor a menor puntaje
//   rankOf(game, score, scope, runId?)    -> posicion (1 = primero); con runId desempata como el orden de top()
// `entry` = { alias, score, runId, meta, ts } con ts en milisegundos desde epoch.
// scope 'event' = registros con ts >= EVENT_START; scope 'all' = todos.
// Orden: puntaje descendente y, en empate, runId ascendente (igual que la clave de ordenamiento de DynamoDB).
import { promises as fsp, readFileSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { GAMES } from './validate.js';
import { silentLogger } from './log.js';

const FILE_NAME = 'leaderboard.json';
const MAX_PER_GAME = 20_000;

function compareEntries(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
}

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { alias, score, runId, meta, ts } = raw;
  if (typeof alias !== 'string' || !Number.isSafeInteger(score) || typeof runId !== 'string') return null;
  if (!Number.isFinite(ts)) return null;
  return { alias, score, runId, meta: meta && typeof meta === 'object' ? meta : {}, ts };
}

export function createFileStore({ dir, eventStart, log = silentLogger, maxPerGame = MAX_PER_GAME }) {
  const file = path.join(dir, FILE_NAME);
  /** @type {Record<string, Array<object>>} */
  const boards = Object.fromEntries(GAMES.map((g) => [g, []]));
  /** @type {Record<string, Map<string, number>>} */
  const runIds = Object.fromEntries(GAMES.map((g) => [g, new Map()]));

  function insertSorted(list, entry) {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compareEntries(list[mid], entry) <= 0) lo = mid + 1;
      else hi = mid;
    }
    list.splice(lo, 0, entry);
  }

  function load() {
    if (!existsSync(file)) return;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      // Conserva el archivo danado para revisarlo y arranca vacio.
      const backup = path.join(dir, `leaderboard.corrupt-${Date.now()}.json`);
      try {
        renameSync(file, backup);
      } catch {
        // sin acceso: se ignora
      }
      log.error(`leaderboard.json ilegible (${err.message}); se arranca vacio`);
      return;
    }
    for (const game of GAMES) {
      const list = Array.isArray(parsed?.games?.[game]) ? parsed.games[game] : [];
      for (const raw of list) {
        const entry = sanitizeEntry(raw);
        if (!entry || runIds[game].has(entry.runId)) continue;
        runIds[game].set(entry.runId, entry.score);
        boards[game].push(entry);
      }
      boards[game].sort(compareEntries);
    }
  }
  load();

  let queued = null;
  let writing = Promise.resolve();

  async function writeAtomic() {
    await fsp.mkdir(dir, { recursive: true });
    const snapshot = JSON.stringify({ v: 1, games: boards });
    const tmp = path.join(dir, `${FILE_NAME}.${process.pid}.${Date.now()}.tmp`);
    const handle = await fsp.open(tmp, 'w');
    try {
      await handle.writeFile(snapshot, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    for (let attempt = 0; ; attempt += 1) {
      try {
        await fsp.rename(tmp, file);
        return;
      } catch (err) {
        const transient = ['EPERM', 'EACCES', 'EBUSY'].includes(err.code);
        if (!transient || attempt >= 5) {
          await fsp.rm(tmp, { force: true }).catch(() => {});
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
  }

  /** Agrupa escrituras: varias llamadas seguidas comparten un solo archivo nuevo. */
  function persist() {
    if (queued) return queued;
    const run = writing.then(() => {
      queued = null;
      return writeAtomic();
    });
    queued = run;
    writing = run.catch((err) => log.error(`No se pudo guardar el leaderboard: ${err.message}`));
    return run;
  }

  const inScope = (entry, scope) => scope !== 'event' || entry.ts >= eventStart;

  return {
    kind: 'file',

    async put(game, entry) {
      const known = runIds[game].get(entry.runId);
      if (known !== undefined) return { added: false, existing: { score: known } };
      const stored = { alias: entry.alias, score: entry.score, runId: entry.runId, meta: entry.meta, ts: entry.ts };
      runIds[game].set(stored.runId, stored.score);
      insertSorted(boards[game], stored);
      if (boards[game].length > maxPerGame) {
        const dropped = boards[game].pop();
        runIds[game].delete(dropped.runId);
      }
      await persist();
      return { added: true };
    },

    async top(game, scope, limit) {
      const out = [];
      for (const entry of boards[game]) {
        if (!inScope(entry, scope)) continue;
        out.push({ ...entry, meta: { ...entry.meta } });
        if (out.length >= limit) break;
      }
      return out;
    },

    async rankOf(game, score, scope = 'event', runId) {
      let ahead = 0;
      for (const entry of boards[game]) {
        if (!inScope(entry, scope)) continue;
        if (entry.score > score || (runId !== undefined && entry.score === score && entry.runId < runId)) ahead += 1;
      }
      return ahead + 1;
    },

    /** Espera a que termine la escritura pendiente (cierre ordenado). */
    async flush() {
      await writing;
    },
  };
}
