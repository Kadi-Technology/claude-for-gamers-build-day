// Adaptador fino sobre shared/engine, shared/ui y shared/net (contratos docs/03 §4 y docs/07).
// Todo el acceso a otros territorios pasa por aquí; si algo falta o falla, el juego sigue jugable y sin errores.

import * as loopM from '../../../shared/engine/loop.js';
import * as spritesM from '../../../shared/engine/sprites.js';
import * as audioM from '../../../shared/engine/audio.js';
import * as rngM from '../../../shared/engine/rng.js';
import * as storageM from '../../../shared/engine/storage.js';
import * as debugM from '../../../shared/engine/debug.js';
import * as profileM from '../../../shared/ui/profile.js';
import { getTop, postScore } from '../../../shared/net/api.js';
import { ALIAS_RE, DEFAULT_ALIAS, GAME_ID, NET } from './config.js';

// ---------------------------------------------------------------- bucle
export function makeLoop(update, render) {
  return loopM.createLoop({
    update: (dt) => update(dt > 1 ? dt / 1000 : dt),
    render,
    hz: 60,
  });
}

// ---------------------------------------------------------------- sprites
export function spr(key, w, h, draw) {
  return spritesM.sprite(key, w, h, draw);
}
export function emojiSprite(ch, size) {
  return spritesM.emoji(ch, size);
}

// ---------------------------------------------------------------- aleatorio
export function makeRng(seed) {
  return rngM.createRng(seed);
}

// ---------------------------------------------------------------- audio
const lastSfx = Object.create(null);
export function sfx(name, minGapMs = 0) {
  try {
    if (minGapMs > 0) {
      const now = performance.now();
      if (now - (lastSfx[name] || 0) < minGapMs) return;
      lastSfx[name] = now;
    }
    audioM.sfx(name);
  } catch {
    /* el sonido nunca debe romper el juego */
  }
}
export function isMuted() {
  try {
    return !!audioM.muted;
  } catch {
    return false;
  }
}
export function toggleMute() {
  try {
    audioM.setMuted(!isMuted());
  } catch {
    /* sin audio */
  }
  return isMuted();
}

// ---------------------------------------------------------------- almacenamiento
export function loadStore(key, fallback) {
  try {
    return storageM.load(key, fallback);
  } catch {
    return fallback;
  }
}
export function saveStore(key, value) {
  try {
    storageM.save(key, value);
  } catch {
    /* sin almacenamiento */
  }
}

// ---------------------------------------------------------------- depuración
export function debugOn() {
  try {
    if (typeof debugM.enabled === 'boolean') return debugM.enabled;
  } catch {
    /* continúa */
  }
  return false;
}
export function debugOverlay(ctx, stats) {
  try {
    debugM.overlay(ctx, stats);
  } catch {
    /* sin overlay */
  }
}
export function debugHotkeys(map) {
  try {
    return debugM.hotkeys(map);
  } catch {
    return () => {};
  }
}

// ---------------------------------------------------------------- perfil / alias compartido (cfg.profile)
export function validAlias(a) {
  return typeof a === 'string' && ALIAS_RE.test(a.trim());
}
export function getAlias() {
  try {
    const p = profileM.getProfile();
    if (p && validAlias(p.alias)) return p.alias.trim();
  } catch {
    /* sin perfil */
  }
  return '';
}
export function setAlias(alias) {
  try {
    const cur = profileM.getProfile() || {};
    profileM.setProfile({ ...cur, alias: alias.trim() });
  } catch {
    /* sin perfil */
  }
}
export function aliasOrDefault() {
  return getAlias() || DEFAULT_ALIAS;
}

// ---------------------------------------------------------------- leaderboard (devuelven null si falla)
export async function fetchTop(limit = NET.topN) {
  try {
    const r = await getTop(GAME_ID, 'event', limit);
    return Array.isArray(r) ? r : null;
  } catch {
    return null;
  }
}
export async function sendScore(body) {
  try {
    const r = await postScore(GAME_ID, body);
    return r && typeof r === 'object' ? r : null;
  } catch {
    return null;
  }
}

export function uuid() {
  try {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* continúa */
  }
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += h[8 + Math.floor(Math.random() * 4)];
    else s += h[Math.floor(Math.random() * 16)];
  }
  return s;
}
