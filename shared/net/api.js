// shared/net/api.js · Cliente REST del leaderboard (doc 03 §6).
// Contrato: getTop(game, scope = 'event', limit = 10) y postScore(game, body).
// Ambas usan rutas relativas al origen (/api/...), cortan a los 4 s con
// AbortController y devuelven null ante cualquier fallo: nunca lanzan.

const API_BASE = '/api';
const TIMEOUT_MS = 4000;
const GAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;

async function request(path, init) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => {
    try {
      if (ctl) ctl.abort();
    } catch {
      /* nada que hacer */
    }
  }, TIMEOUT_MS);
  try {
    const res = await fetch(path, { ...init, signal: ctl ? ctl.signal : undefined });
    if (!res || !res.ok) return null;
    // El temporizador sigue vivo mientras se lee el cuerpo: el límite cubre toda la respuesta.
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Top del leaderboard de un juego.
 * @param {string} game 'xochimilco' | 'angel'
 * @param {'event'|'all'} [scope='event']
 * @param {number} [limit=10]
 * @returns {Promise<Array<{rank:number, alias:string, score:number, meta:object, ts:number}>|null>}
 */
export async function getTop(game, scope = 'event', limit = 10) {
  try {
    if (typeof game !== 'string' || !GAME_RE.test(game)) return null;
    const sc = scope === 'all' ? 'all' : 'event';
    const n = Math.min(100, Math.max(1, Math.floor(Number(limit)) || 10));
    const data = await request(`${API_BASE}/leaderboard/${encodeURIComponent(game)}?scope=${sc}&limit=${n}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.top)) return data.top;
    return null;
  } catch {
    return null;
  }
}

/**
 * Envía un puntaje. Respuesta esperada: 201 { rank, top }.
 * @param {string} game 'xochimilco' | 'angel'
 * @param {{alias:string, score:number, runId:string, meta:object}} body
 * @returns {Promise<{rank:number, top:Array}|null>} null si hubo 400, 429, timeout o falta de red
 */
export async function postScore(game, body) {
  try {
    if (typeof game !== 'string' || !GAME_RE.test(game)) return null;
    if (!body || typeof body !== 'object') return null;
    const data = await request(`${API_BASE}/leaderboard/${encodeURIComponent(game)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}
