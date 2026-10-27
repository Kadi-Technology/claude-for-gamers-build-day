// Validacion de entradas: alias, envios al leaderboard (docs/03 seccion 6), skins, mapas y codigos de sala.
// Funciones puras, sin I/O, para poder probarlas sin levantar el servidor.

export const GAMES = Object.freeze(['xochimilco', 'angel']);
export const MAX_BODY_BYTES = 2048;
export const MAX_SCORE = 10_000_000;

const ALIAS_MIN = 3;
const ALIAS_MAX = 12;
const ALIAS_CHARS = /^[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ _-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9_-]{1,24}$/;
const CODE_RE = /^[A-Z]{4}$/;

// Palabras bloqueadas. `TOKENS` solo bloquea la palabra completa (evita falsos positivos como
// "computadora" o "Tepito"); `SUBSTRINGS` solo contiene cadenas que no aparecen en palabras comunes.
const BLOCKED_TOKENS = [
  'puta', 'putas', 'puto', 'putos', 'verga', 'vergas', 'pene', 'penes', 'culo', 'culos',
  'cabron', 'cabrona', 'joto', 'jotos', 'marica', 'zorra', 'nazi', 'kkk', 'porno', 'porn',
  'sexo', 'sex', 'fuck', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'rape', 'rapist',
  'hdp', 'ptm', 'ctm', 'chinga', 'chingas',
];
const BLOCKED_SUBSTRINGS = [
  'pendej', 'mierda', 'chingad', 'hijueputa', 'hijoputa', 'hijodeputa', 'culero', 'nigger',
  'nigga', 'faggot', 'hitler', 'maricon', 'bitch', 'fuck', 'shit',
];

const collapse = (s) => s.replace(/(.)\1+/g, '$1');
// La variante sin letras repetidas solo se usa si queda de 4 o mas letras (evita bloquear "K" por "kkk").
const BLOCK_TOKEN_SET = new Set(
  BLOCKED_TOKENS.flatMap((w) => (collapse(w).length >= 4 ? [w, collapse(w)] : [w])),
);
const BLOCK_SUBSTRING_LIST = BLOCKED_SUBSTRINGS.flatMap((w) => [w, collapse(w)]);

function fold(text) {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't');
}

/** true si el alias contiene una palabra bloqueada (ignora acentos, mayusculas y cambios 4=a, 3=e, etc.). */
export function isBlockedAlias(alias) {
  const folded = fold(alias);
  const tokens = folded.split(/[ _-]+/).filter(Boolean);
  for (const token of tokens) {
    if (BLOCK_TOKEN_SET.has(token) || BLOCK_TOKEN_SET.has(collapse(token))) return true;
  }
  const squashed = folded.replace(/[ _-]+/g, '');
  const squashedCollapsed = collapse(squashed);
  // "p u t a" o "pu-ta": el alias completo, sin separadores, es una palabra bloqueada.
  if (BLOCK_TOKEN_SET.has(squashed) || BLOCK_TOKEN_SET.has(squashedCollapsed)) return true;
  return BLOCK_SUBSTRING_LIST.some((w) => squashed.includes(w) || squashedCollapsed.includes(w));
}

const fail = (error, msg) => ({ ok: false, error, msg });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Quita espacios sobrantes y compone acentos (NFC). Devuelve null si no es texto. */
export function normalizeAlias(raw) {
  if (typeof raw !== 'string') return null;
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Alias: 3 a 12 caracteres de [A-Za-z0-9ÁÉÍÓÚÑáéíóúñ _-] y sin palabras bloqueadas. */
export function validateAlias(raw) {
  const alias = normalizeAlias(raw);
  if (alias === null) return fail('bad_alias', 'El alias debe ser texto.');
  if (alias.length < ALIAS_MIN || alias.length > ALIAS_MAX) {
    return fail('bad_alias', `El alias debe tener entre ${ALIAS_MIN} y ${ALIAS_MAX} caracteres.`);
  }
  if (!ALIAS_CHARS.test(alias)) {
    return fail('bad_alias', 'El alias solo admite letras, números, espacios, guion y guion bajo.');
  }
  if (isBlockedAlias(alias)) return fail('bad_alias', 'Ese alias no está permitido. Elige otro.');
  return { ok: true, alias };
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Id de skin (minusculas, 1 a 24 caracteres) o null. */
export function validateSkin(raw) {
  return typeof raw === 'string' && SLUG_RE.test(raw) ? raw : null;
}

/** Id de mapa (minusculas, 1 a 24 caracteres) o null. */
export function validateMap(raw) {
  return typeof raw === 'string' && SLUG_RE.test(raw) ? raw : null;
}

/** Codigo de sala normalizado a mayusculas, o null si no tiene la forma de 4 letras. */
export function normalizeRoomCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

// Margen de redondeo: el cliente puede enviar la distancia con decimales y el puntaje en enteros.
const DISTANCE_SLACK_M = 5;

// Limites por defecto de Xochimilco: dejan margen sobre games/xochimilco/src/config.js
// (velocidad maxima 36 m/s con Chinampa Dash y combo maximo 5).
export const XOCHIMILCO_LIMITS = Object.freeze({ maxSpeed: 45, comboMax: 8 });

function validateXochimilcoMeta(meta, score, limits) {
  if (!isPlainObject(meta)) return fail('bad_meta', 'Falta meta con distance, zone, flowers y durationMs.');
  const { distance, zone, flowers, durationMs } = meta;
  if (!isNum(distance, 0, 200_000)) return fail('bad_meta', 'meta.distance fuera de rango.');
  if (!isInt(zone, 0, 99)) return fail('bad_meta', 'meta.zone fuera de rango.');
  if (!isInt(flowers, 0, 50_000)) return fail('bad_meta', 'meta.flowers fuera de rango.');
  if (!isNum(durationMs, 0, 12 * 3_600_000)) return fail('bad_meta', 'meta.durationMs fuera de rango.');

  const maxSpeed = limits?.maxSpeed ?? XOCHIMILCO_LIMITS.maxSpeed; // m/s
  const comboMax = limits?.comboMax ?? XOCHIMILCO_LIMITS.comboMax;
  // durationMs >= distance / velocidadMax
  if (distance > (maxSpeed * durationMs) / 1000 + DISTANCE_SLACK_M) {
    return fail('implausible', 'Esa partida no es plausible: la distancia no cuadra con la duración.');
  }
  // score <= distance + flowers * 10 * comboMax
  if (score > Math.ceil(distance) + flowers * 10 * comboMax) {
    return fail('implausible', 'Esa partida no es plausible: el puntaje no cuadra con la distancia y las flores.');
  }
  return {
    ok: true,
    meta: { distance: Math.round(distance * 10) / 10, zone, flowers, durationMs: Math.round(durationMs) },
  };
}

function validateAngelMeta(meta, score) {
  if (!isPlainObject(meta)) return fail('bad_meta', 'Falta meta con wave, kills, map y players.');
  const { wave, kills, map, players } = meta;
  if (!isInt(wave, 1, 500)) return fail('bad_meta', 'meta.wave fuera de rango.');
  if (!isInt(kills, 0, 3000 * wave)) return fail('bad_meta', 'meta.kills fuera de rango.');
  const mapId = validateMap(map);
  if (!mapId) return fail('bad_meta', 'meta.map no es válido.');
  if (!isInt(players, 1, 4)) return fail('bad_meta', 'meta.players debe estar entre 1 y 4.');
  // score = oleada * 1000 + kills
  if (score !== wave * 1000 + kills) {
    return fail('implausible', 'El puntaje debe ser oleada × 1000 + bajas.');
  }
  return { ok: true, meta: { wave, kills, map: mapId, players } };
}

/**
 * Valida el cuerpo de POST /api/leaderboard/:game.
 * @returns {{ok:true, entry:{alias,score,runId,meta}} | {ok:false, error:string, msg:string}}
 */
export function validateSubmission(game, body, limits = {}) {
  if (!GAMES.includes(game)) return fail('unknown_game', 'Juego desconocido.');
  if (!isPlainObject(body)) return fail('bad_body', 'El cuerpo debe ser un objeto JSON.');

  const alias = validateAlias(body.alias);
  if (!alias.ok) return alias;

  if (!isUuid(body.runId)) return fail('bad_run_id', 'runId debe ser un UUID.');
  if (!isInt(body.score, 0, MAX_SCORE)) return fail('bad_score', 'El puntaje debe ser un entero válido.');

  const checked =
    game === 'xochimilco'
      ? validateXochimilcoMeta(body.meta, body.score, limits.xochimilco)
      : validateAngelMeta(body.meta, body.score);
  if (!checked.ok) return checked;

  return {
    ok: true,
    entry: { alias: alias.alias, score: body.score, runId: body.runId.toLowerCase(), meta: checked.meta },
  };
}
