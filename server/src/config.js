// Configuracion del servidor a partir de variables de entorno (docs/07 seccion 4).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XOCHIMILCO_LIMITS } from './validate.js';

export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_EVENT_START = '2026-10-26T17:30:00-06:00';

function intFrom(value, fallback, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function numberFrom(value, fallback, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** CFG_VERSION, o el contenido de VERSION.txt (raiz estatica, raiz del repo o server/), o 'dev'. */
export function resolveVersion(env, staticRoot) {
  const fromEnv = (env.CFG_VERSION ?? '').trim();
  if (fromEnv) return fromEnv.slice(0, 64);
  const candidates = [
    path.join(staticRoot, 'VERSION.txt'),
    path.join(SERVER_DIR, '..', 'VERSION.txt'),
    path.join(SERVER_DIR, 'VERSION.txt'),
  ];
  for (const file of candidates) {
    try {
      const text = readFileSync(file, 'utf8').trim();
      if (text) return text.split(/\r?\n/)[0].trim().slice(0, 64);
    } catch {
      // no existe: se prueba el siguiente
    }
  }
  return 'dev';
}

/**
 * Lee la configuracion. `overrides` se usa en las pruebas para fijar valores sin tocar process.env.
 * Los limites de tasa por defecto son los del doc 03 seccion 6.
 */
export function loadConfig(env = process.env, overrides = {}) {
  const staticRoot = path.resolve(env.STATIC_ROOT || path.join(SERVER_DIR, '..'));

  const storeKind = (env.STORE || 'file').trim().toLowerCase();
  if (storeKind !== 'file' && storeKind !== 'dynamo') {
    throw new Error(`STORE invalido: "${env.STORE}". Usa "file" o "dynamo".`);
  }

  let eventStartIso = (env.EVENT_START || '').trim() || DEFAULT_EVENT_START;
  let eventStart = Date.parse(eventStartIso);
  if (!Number.isFinite(eventStart)) {
    console.warn(`EVENT_START invalido ("${eventStartIso}"), se usa el valor por defecto.`);
    eventStartIso = DEFAULT_EVENT_START;
    eventStart = Date.parse(DEFAULT_EVENT_START);
  }

  const config = {
    port: intFrom(env.PORT, 8080, 0, 65535),
    host: (env.HOST || '').trim() || undefined,
    staticRoot,
    store: storeKind,
    table: (env.TABLE || 'cfg-buildday-leaderboard').trim(),
    region: (env.AWS_REGION || 'us-east-1').trim(),
    dataDir: path.resolve(env.DATA_DIR || path.join(SERVER_DIR, 'data')),
    eventStart,
    eventStartIso,
    version: resolveVersion(env, staticRoot),
    originSecret: (env.ORIGIN_SECRET || '').trim(),
    logLevel: (env.LOG_LEVEL || 'info').trim().toLowerCase(),
    rate: {
      windowMs: intFrom(env.RATE_WINDOW_MS, 10_000, 0, 3_600_000),
      dailyMax: intFrom(env.RATE_DAILY_MAX, 300, 1, 1_000_000),
    },
    rooms: {
      maxRooms: intFrom(env.MAX_ROOMS, 200, 1, 10_000),
      maxPlayers: 4,
      idleMs: intFrom(env.ROOM_IDLE_MS, 30 * 60_000, 1000, 24 * 3_600_000),
      pingMs: intFrom(env.WS_PING_MS, 15_000, 50, 300_000),
      maxMessageBytes: 32 * 1024,
      messagesPerSecond: 60,
      maxSockets: intFrom(env.MAX_SOCKETS, 5000, 1, 100_000),
    },
    // Limites de plausibilidad de Xochimilco (deben ser >= a los de games/xochimilco/src/config.js:
    // SPEED.abs = 36 m/s y SCORE.comboMax = 5).
    limits: {
      xochimilco: {
        maxSpeed: numberFrom(env.XOC_MAX_SPEED, XOCHIMILCO_LIMITS.maxSpeed, 1, 1000), // metros por segundo
        comboMax: numberFrom(env.XOC_COMBO_MAX, XOCHIMILCO_LIMITS.comboMax, 1, 1000),
      },
    },
  };

  return mergeDeep(config, overrides);
}

function mergeDeep(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}
