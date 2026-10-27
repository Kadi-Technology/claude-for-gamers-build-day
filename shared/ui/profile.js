// Perfil compartido entre el lobby y los dos juegos. Se guarda en la clave 'cfg.profile' vía storage.js.
// Contrato: getProfile() -> { alias, skin }, setProfile(p)
//   - Alias por defecto: 'Jugador' + 3 dígitos (se genera una vez y se guarda, así no cambia entre llamadas).
//   - El alias siempre cumple la validación del servidor: 3 a 12 caracteres de [A-Za-z0-9ÁÉÍÓÚÑáéíóúñ _-].
//   - setProfile acepta cambios parciales ({ alias } o { skin }), sanea los valores y devuelve el perfil guardado.
//     Un alias que quede con menos de 3 caracteres se ignora y se conserva el anterior.
// Extras: sanitizeAlias(s), isValidAlias(s), randomAlias(), ALIAS_MIN, ALIAS_MAX, DEFAULT_SKIN.
// Emite 'profile:change' en el bus cuando se guarda un cambio.

import { load, save } from '../engine/storage.js';
import { emit } from '../engine/bus.js';

export const ALIAS_MIN = 3;
export const ALIAS_MAX = 12;
export const DEFAULT_SKIN = 'luchador';

const KEY = 'cfg.profile';
const DISALLOWED = /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ _-]/g;
const ALLOWED_FULL = /^[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ _-]{3,12}$/;
const SKIN_RE = /^[A-Za-z0-9_-]{1,24}$/;

// Quita caracteres no permitidos, colapsa espacios y recorta a 12.
export function sanitizeAlias(value) {
  return String(value === undefined || value === null ? '' : value)
    .normalize('NFC')
    .replace(DISALLOWED, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ALIAS_MAX)
    .trim();
}

export function isValidAlias(value) {
  return typeof value === 'string' && ALLOWED_FULL.test(value);
}

export function randomAlias() {
  return 'Jugador' + (100 + Math.floor(Math.random() * 900));
}

export function getProfile() {
  const raw = load(KEY, null);
  const stored = raw && typeof raw === 'object' ? raw : null;

  let alias = stored && typeof stored.alias === 'string' ? sanitizeAlias(stored.alias) : '';
  const skin = stored && typeof stored.skin === 'string' && SKIN_RE.test(stored.skin) ? stored.skin : DEFAULT_SKIN;

  let dirty = !stored;
  if (alias.length < ALIAS_MIN) {
    alias = randomAlias();
    dirty = true;
  }
  if (dirty) save(KEY, { alias, skin });
  return { alias, skin };
}

export function setProfile(p) {
  const cur = getProfile();
  const patch = p && typeof p === 'object' ? p : {};

  let alias = cur.alias;
  if (typeof patch.alias === 'string') {
    const a = sanitizeAlias(patch.alias);
    if (a.length >= ALIAS_MIN) alias = a;
  }
  let skin = cur.skin;
  if (typeof patch.skin === 'string' && SKIN_RE.test(patch.skin)) skin = patch.skin;

  const next = { alias, skin };
  save(KEY, next);
  if (alias !== cur.alias || skin !== cur.skin) emit('profile:change', next);
  return { alias: next.alias, skin: next.skin };
}

export default { getProfile, setProfile };
