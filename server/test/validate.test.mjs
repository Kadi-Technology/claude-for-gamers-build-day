import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  isBlockedAlias,
  isUuid,
  normalizeRoomCode,
  validateAlias,
  validateMap,
  validateSkin,
  validateSubmission,
} from '../src/validate.js';
import { angelBody, xocBody } from './helpers.mjs';

test('alias: acepta 3 a 12 caracteres del conjunto permitido', () => {
  for (const alias of ['abc', 'Ajolote', 'Ángel_01', 'ñandú-7', 'Doña Luz', 'ÁÉÍÓÚÑáéíóúñ', 'Tepito', 'computadora', '123456789012']) {
    const r = validateAlias(alias);
    assert.equal(r.ok, true, `${alias} deberia ser valido`);
    assert.equal(r.alias, alias);
  }
});

test('alias: rechaza largo fuera de rango y caracteres no permitidos', () => {
  for (const alias of ['', 'ab', '1234567890123', 'Hola!', 'a@b.com', 'emoji😀x', 'tab\u0000x', 'ü ü ü', '<b>hola</b>']) {
    const r = validateAlias(alias);
    assert.equal(r.ok, false, `${JSON.stringify(alias)} deberia ser invalido`);
    assert.equal(r.error, 'bad_alias');
    assert.ok(r.msg.length > 0);
  }
  for (const value of [null, undefined, 42, {}, ['abc']]) {
    assert.equal(validateAlias(value).ok, false);
  }
});

test('alias: recorta y colapsa espacios antes de medir; compone acentos (NFC)', () => {
  assert.equal(validateAlias('  Ana   Luz  ').alias, 'Ana Luz');
  assert.equal(validateAlias('   ').ok, false);
  assert.equal(validateAlias(' ab ').ok, false);
  const decomposed = 'José Luz'; // e + acento combinado
  const r = validateAlias(decomposed);
  assert.equal(r.ok, true);
  assert.equal(r.alias, 'José Luz');
});

test('alias: bloquea palabras ofensivas sin falsos positivos comunes', () => {
  for (const alias of ['puta', 'PUTO', 'Pu7a', 'p u t a', 'Pendejo', 'pendejazo', 'hdp', 'f-u-c-k', 'MIERDA', 'Hitler', 'nazi', 'Niggaz', 'cabrón', 'puuuta']) {
    assert.equal(isBlockedAlias(alias), true, `${alias} deberia bloquearse`);
  }
  for (const alias of ['Tepito', 'computadora', 'Nazario', 'Scunthorpe', 'Mr K', 'Pitufo', 'Cabrales', 'Computa']) {
    assert.equal(isBlockedAlias(alias), false, `${alias} NO deberia bloquearse`);
  }
  const r = validateAlias('Pendejo');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'bad_alias');
});

test('runId: solo UUID', () => {
  assert.equal(isUuid(randomUUID()), true);
  assert.equal(isUuid('123e4567-e89b-12d3-a456-426614174000'), true);
  for (const bad of ['', 'abc', '123e4567e89b12d3a456426614174000', 42, null, '123e4567-e89b-12d3-a456-42661417400g']) {
    assert.equal(isUuid(bad), false);
  }
});

test('skin, mapa y codigo de sala', () => {
  assert.equal(validateSkin('catrina'), 'catrina');
  assert.equal(validateSkin('Catrina!'), null);
  assert.equal(validateSkin(7), null);
  assert.equal(validateMap('tepito'), 'tepito');
  assert.equal(validateMap(''), null);
  assert.equal(validateMap('../x'), null);
  assert.equal(normalizeRoomCode(' abcd '), 'ABCD');
  assert.equal(normalizeRoomCode('abc'), null);
  assert.equal(normalizeRoomCode('ab12'), null);
  assert.equal(normalizeRoomCode(1234), null);
});

test('xochimilco: un envio valido se normaliza y conserva solo los campos conocidos', () => {
  const body = xocBody({ alias: '  Ajolote  ', runId: '123E4567-E89B-12D3-A456-426614174000', extra: 'x' });
  body.meta.surprise = true;
  const r = validateSubmission('xochimilco', body);
  assert.equal(r.ok, true);
  assert.deepEqual(r.entry, {
    alias: 'Ajolote',
    score: 1500,
    runId: '123e4567-e89b-12d3-a456-426614174000',
    meta: { distance: 1200, zone: 3, flowers: 30, durationMs: 120_000 },
  });
});

test('xochimilco: plausibilidad de duracion (durationMs >= distance / velocidadMax)', () => {
  // 45 m/s por defecto: 1200 m necesitan al menos unos 26.6 s.
  assert.equal(validateSubmission('xochimilco', xocBody({ meta: { durationMs: 27_000 } })).ok, true);
  const r = validateSubmission('xochimilco', xocBody({ meta: { durationMs: 5_000 } }));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'implausible');
  // Con un limite de velocidad mas bajo el mismo envio deja de ser plausible.
  const slow = validateSubmission('xochimilco', xocBody({ meta: { durationMs: 27_000 } }), { xochimilco: { maxSpeed: 10 } });
  assert.equal(slow.ok, false);
});

test('xochimilco: plausibilidad de puntaje (score <= distance + flores * 10 * comboMax)', () => {
  // distancia 1200 + 30 flores * 10 * 8 = 3600 como maximo.
  assert.equal(validateSubmission('xochimilco', xocBody({ score: 3600 })).ok, true);
  const r = validateSubmission('xochimilco', xocBody({ score: 3601 }));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'implausible');
  assert.equal(validateSubmission('xochimilco', xocBody({ score: 1201, meta: { flowers: 0 } })).ok, false);
  assert.equal(validateSubmission('xochimilco', xocBody({ score: 1200, meta: { flowers: 0 } })).ok, true);
});

test('xochimilco: tipos y rangos invalidos', () => {
  const bad = [
    xocBody({ score: -1 }),
    xocBody({ score: 1.5 }),
    xocBody({ score: '1500' }),
    xocBody({ score: 10_000_001 }),
    xocBody({ runId: 'no-es-uuid' }),
    xocBody({ alias: 'a' }),
    xocBody({ meta: { distance: -5 } }),
    xocBody({ meta: { distance: 'mucho' } }),
    xocBody({ meta: { zone: 1.5 } }),
    xocBody({ meta: { flowers: -1 } }),
    xocBody({ meta: { durationMs: Number.NaN } }),
  ];
  for (const body of bad) {
    const r = validateSubmission('xochimilco', body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.ok(typeof r.error === 'string' && typeof r.msg === 'string');
  }
  const noMeta = xocBody();
  delete noMeta.meta;
  assert.equal(validateSubmission('xochimilco', noMeta).ok, false);
  for (const body of [null, 'texto', 5, [], undefined]) {
    assert.equal(validateSubmission('xochimilco', body).ok, false);
  }
  assert.equal(validateSubmission('otro-juego', xocBody()).error, 'unknown_game');
});

test('angel: score = oleada * 1000 + kills', () => {
  const ok = validateSubmission('angel', angelBody());
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.entry.meta, { wave: 5, kills: 12, map: 'reforma', players: 2 });

  const mismatch = validateSubmission('angel', angelBody({ score: 9999 }));
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, 'implausible');

  assert.equal(validateSubmission('angel', angelBody({ score: 12_345, meta: { wave: 12, kills: 345 } })).ok, true);
});

test('angel: rangos de meta', () => {
  const bad = [
    angelBody({ meta: { wave: 0 } }),
    angelBody({ meta: { wave: 501 }, score: 501_012 }),
    angelBody({ meta: { kills: -1 }, score: 4999 }),
    angelBody({ meta: { players: 5 } }),
    angelBody({ meta: { players: 0 } }),
    angelBody({ meta: { map: '../etc' } }),
    angelBody({ meta: { map: 7 } }),
  ];
  for (const body of bad) {
    assert.equal(validateSubmission('angel', body).ok, false, JSON.stringify(body));
  }
  assert.equal(validateSubmission('angel', angelBody({ meta: { map: 'tepito', players: 4 } })).ok, true);
});
