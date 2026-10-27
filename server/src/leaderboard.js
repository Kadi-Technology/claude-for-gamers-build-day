// API del leaderboard (docs/03 seccion 6): GET y POST /api/leaderboard/:game.
import { GAMES, MAX_BODY_BYTES, validateSubmission } from './validate.js';
import { readBody, sendJson } from './http.js';
import { silentLogger } from './log.js';

const DAY_MS = 24 * 3_600_000;
const MAX_TRACKED_IPS = 50_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const POST_TOP = 10;

/**
 * Limite de tasa por IP: 1 POST cada `windowMs` y `dailyMax` por ventana de 24 h.
 * `take` reserva el turno en el acto (evita rafagas en paralelo) y `refund` lo devuelve si el
 * envio resulta invalido, para que un error de validacion no obligue a esperar.
 */
export function createRateLimiter({ windowMs = 10_000, dailyMax = 300, now = Date.now } = {}) {
  const state = new Map();

  function take(ip) {
    const t = now();
    let s = state.get(ip);
    if (!s) {
      if (state.size >= MAX_TRACKED_IPS) state.delete(state.keys().next().value);
      s = { last: -Infinity, dayStart: t, dayCount: 0 };
      state.set(ip, s);
    }
    if (t - s.dayStart >= DAY_MS) {
      s.dayStart = t;
      s.dayCount = 0;
    }
    if (s.dayCount >= dailyMax) {
      return { ok: false, reason: 'daily_limit', retryAfterMs: s.dayStart + DAY_MS - t };
    }
    const wait = s.last + windowMs - t;
    if (wait > 0) return { ok: false, reason: 'rate_limited', retryAfterMs: wait };
    const ticket = { ok: true, ip, prevLast: s.last, prevDayStart: s.dayStart, prevDayCount: s.dayCount };
    s.last = t;
    s.dayCount += 1;
    return ticket;
  }

  function refund(ticket) {
    const s = state.get(ticket.ip);
    if (!s) return;
    s.last = ticket.prevLast;
    s.dayStart = ticket.prevDayStart;
    s.dayCount = ticket.prevDayCount;
  }

  function sweep() {
    const t = now();
    for (const [ip, s] of state) {
      if (t - s.dayStart >= DAY_MS) state.delete(ip);
    }
  }

  return { take, refund, sweep, size: () => state.size };
}

function parseLimit(raw) {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, n));
}

const toRows = (entries) =>
  entries.map((e, i) => ({ rank: i + 1, alias: e.alias, score: e.score, meta: e.meta, ts: e.ts }));

export function createLeaderboard({ store, config, rateLimiter, now = Date.now, log = silentLogger }) {
  const limiter =
    rateLimiter ?? createRateLimiter({ windowMs: config.rate.windowMs, dailyMax: config.rate.dailyMax, now });

  async function handleGet(res, game, query) {
    const scope = query.get('scope') ?? 'event';
    if (scope !== 'event' && scope !== 'all') {
      sendJson(res, 400, { error: 'bad_scope', msg: 'scope debe ser "event" o "all".' });
      return;
    }
    const limit = parseLimit(query.get('limit'));
    const entries = await store.top(game, scope, limit);
    sendJson(res, 200, toRows(entries));
  }

  async function handlePost(req, res, game, ip) {
    const ticket = limiter.take(ip);
    if (!ticket.ok) {
      const retryAfter = Math.max(1, Math.ceil(ticket.retryAfterMs / 1000));
      const msg =
        ticket.reason === 'daily_limit'
          ? 'Alcanzaste el límite diario de envíos.'
          : `Espera ${retryAfter} s antes de enviar otro puntaje.`;
      sendJson(res, 429, { error: ticket.reason, retryAfter, msg }, { 'Retry-After': String(retryAfter) });
      return;
    }

    const body = await readBody(req, MAX_BODY_BYTES);
    if (!body.ok) {
      limiter.refund(ticket);
      sendJson(res, body.status, { error: body.error, msg: body.msg }, { Connection: 'close' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      limiter.refund(ticket);
      sendJson(res, 400, { error: 'bad_json', msg: 'El cuerpo no es JSON válido.' });
      return;
    }

    const checked = validateSubmission(game, parsed, config.limits);
    if (!checked.ok) {
      limiter.refund(ticket);
      sendJson(res, 400, { error: checked.error, msg: checked.msg });
      return;
    }

    const ts = now();
    const entry = { ...checked.entry, ts };
    const scope = ts >= config.eventStart ? 'event' : 'all';
    const result = await store.put(game, entry);
    if (!result.added && result.existing.score !== entry.score) {
      limiter.refund(ticket);
      sendJson(res, 400, { error: 'duplicate_run', msg: 'Esa partida ya fue registrada con otro puntaje.' });
      return;
    }
    const rank = await store.rankOf(game, entry.score, scope, entry.runId);
    const top = await store.top(game, scope, POST_TOP);
    log.debug(`leaderboard ${game}: ${entry.alias} ${entry.score} (puesto ${rank}${result.added ? '' : ', repetido'})`);
    sendJson(res, 201, { rank, top: toRows(top) });
  }

  /**
   * @param {{pathname:string, query:URLSearchParams, ip:string}} ctx
   */
  async function handle(req, res, { pathname, query, ip }) {
    const match = /^\/api\/leaderboard\/([^/]+)\/?$/.exec(pathname);
    if (!match || !GAMES.includes(match[1])) {
      sendJson(res, 404, { error: 'not_found', msg: 'Ruta o juego desconocido.' });
      return;
    }
    const game = match[1];
    if (req.method === 'GET') return handleGet(res, game, query);
    if (req.method === 'POST') return handlePost(req, res, game, ip);
    sendJson(res, 405, { error: 'method_not_allowed', msg: 'Usa GET o POST.' }, { Allow: 'GET, POST' });
    return undefined;
  }

  return { handle, limiter };
}
