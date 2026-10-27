import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { angelBody, postJson, removeDir, startApp, tmpDir, xocBody } from './helpers.mjs';

const NO_LIMIT = { rate: { windowMs: 0, dailyMax: 100_000 } };
const PAST_EVENT = { eventStart: Date.parse('2020-01-01T00:00:00Z') };
const FUTURE_EVENT = { eventStart: Date.parse('2099-01-01T00:00:00Z') };

describe('POST y GET /api/leaderboard/:game', () => {
  test('POST valido responde 201 con rank y top; GET devuelve el ranking', async () => {
    const srv = await startApp({ ...NO_LIMIT, ...PAST_EVENT });
    try {
      const first = await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody({ alias: 'Axolotl', score: 1500 }));
      assert.equal(first.status, 201);
      const created = await first.json();
      assert.equal(created.rank, 1);
      assert.equal(created.top.length, 1);
      assert.deepEqual(Object.keys(created.top[0]).sort(), ['alias', 'meta', 'rank', 'score', 'ts']);
      assert.equal(created.top[0].alias, 'Axolotl');

      const better = await (await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody({ alias: 'Chinampa', score: 1900, meta: { flowers: 80 } }))).json();
      assert.equal(better.rank, 1);
      const worse = await (await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody({ alias: 'Trajinera', score: 1200, meta: { flowers: 0 } }))).json();
      assert.equal(worse.rank, 3);
      assert.deepEqual(worse.top.map((r) => r.alias), ['Chinampa', 'Axolotl', 'Trajinera']);

      const res = await fetch(`${srv.base}/api/leaderboard/xochimilco?scope=event&limit=2`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /^application\/json/);
      const rows = await res.json();
      assert.deepEqual(rows.map((r) => [r.rank, r.alias, r.score]), [[1, 'Chinampa', 1900], [2, 'Axolotl', 1500]]);
      assert.equal(typeof rows[0].ts, 'number');
      assert.deepEqual(rows[0].meta, { distance: 1200, zone: 3, flowers: 80, durationMs: 120_000 });
    } finally {
      await srv.stop();
    }
  });

  test('Angel: POST rechazado (sin envio de puntajes), GET devuelve [] y Xochimilco sigue aceptando', async () => {
    const srv = await startApp({ ...NO_LIMIT, ...PAST_EVENT });
    try {
      const res = await postJson(srv.base, '/api/leaderboard/angel', angelBody());
      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, 'no_submissions');
      assert.deepEqual(await (await fetch(`${srv.base}/api/leaderboard/angel`)).json(), []);
      assert.equal((await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody())).status, 201);
      assert.equal((await (await fetch(`${srv.base}/api/leaderboard/xochimilco`)).json()).length, 1);
    } finally {
      await srv.stop();
    }
  });

  test('GET: scope por defecto event, limit acotado a 1..100 y scope invalido', async () => {
    const srv = await startApp({ ...NO_LIMIT, ...PAST_EVENT });
    try {
      for (let i = 0; i < 25; i += 1) {
        await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody({ alias: `Jugador${i}`, score: 1000 + i }));
      }
      const byDefault = await (await fetch(`${srv.base}/api/leaderboard/xochimilco`)).json();
      assert.equal(byDefault.length, 20);
      assert.equal(byDefault[0].score, 1024);
      assert.equal((await (await fetch(`${srv.base}/api/leaderboard/xochimilco?limit=5`)).json()).length, 5);
      assert.equal((await (await fetch(`${srv.base}/api/leaderboard/xochimilco?limit=0`)).json()).length, 1);
      assert.equal((await (await fetch(`${srv.base}/api/leaderboard/xochimilco?limit=9999`)).json()).length, 25);
      assert.equal((await (await fetch(`${srv.base}/api/leaderboard/xochimilco?limit=abc`)).json()).length, 20);
      const badScope = await fetch(`${srv.base}/api/leaderboard/xochimilco?scope=semana`);
      assert.equal(badScope.status, 400);
      assert.equal((await badScope.json()).error, 'bad_scope');
    } finally {
      await srv.stop();
    }
  });

  test('scope=event excluye lo anterior a EVENT_START; scope=all lo incluye', async () => {
    const srv = await startApp({ ...NO_LIMIT, ...FUTURE_EVENT });
    try {
      const posted = await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody());
      assert.equal(posted.status, 201);
      assert.equal((await posted.json()).rank, 1); // rank y top salen del tablero "all" cuando aun no empieza el evento
      assert.deepEqual(await (await fetch(`${srv.base}/api/leaderboard/xochimilco?scope=event`)).json(), []);
      assert.equal((await (await fetch(`${srv.base}/api/leaderboard/xochimilco?scope=all`)).json()).length, 1);
    } finally {
      await srv.stop();
    }
  });

  test('juego desconocido 404, metodo no permitido 405 y JSON invalido 400', async () => {
    const srv = await startApp(NO_LIMIT);
    try {
      assert.equal((await fetch(`${srv.base}/api/leaderboard/tetris`)).status, 404);
      assert.equal((await fetch(`${srv.base}/api/leaderboard`)).status, 404);
      assert.equal((await fetch(`${srv.base}/api/otra-cosa`)).status, 404);
      const del = await fetch(`${srv.base}/api/leaderboard/angel`, { method: 'DELETE' });
      assert.equal(del.status, 405);
      assert.equal(del.headers.get('allow'), 'GET, POST');
      const broken = await postJson(srv.base, '/api/leaderboard/angel', '{"alias": ');
      assert.equal(broken.status, 400);
      assert.equal((await broken.json()).error, 'bad_json');
      assert.equal((await postJson(srv.base, '/api/leaderboard/angel', '[]')).status, 400);
    } finally {
      await srv.stop();
    }
  });

  test('POST: alias, runId, puntaje y plausibilidad invalidos dan 400 con codigo y mensaje', async () => {
    const srv = await startApp(NO_LIMIT);
    try {
      const cases = [
        [xocBody({ alias: 'ab' }), 'bad_alias'],
        [xocBody({ alias: 'Pendejo' }), 'bad_alias'],
        [xocBody({ runId: 'x' }), 'bad_run_id'],
        [xocBody({ score: 'mucho' }), 'bad_score'],
        [xocBody({ meta: { durationMs: 1000 } }), 'implausible'],
        [xocBody({ score: 99_999 }), 'implausible'],
        [{ alias: 'Ajolote', score: 10, runId: randomUUID() }, 'bad_meta'],
      ];
      for (const [body, code] of cases) {
        const res = await postJson(srv.base, '/api/leaderboard/xochimilco', body);
        assert.equal(res.status, 400, JSON.stringify(body));
        const json = await res.json();
        assert.equal(json.error, code);
        assert.ok(json.msg.length > 0);
      }
      assert.deepEqual(await (await fetch(`${srv.base}/api/leaderboard/xochimilco?scope=all`)).json(), []);
    } finally {
      await srv.stop();
    }
  });

  test('POST: cuerpo de mas de 2 KB se rechaza con 413', async () => {
    const srv = await startApp(NO_LIMIT);
    try {
      const big = xocBody({ alias: 'Ajolote' });
      big.relleno = 'x'.repeat(2500);
      const res = await postJson(srv.base, '/api/leaderboard/xochimilco', big);
      assert.equal(res.status, 413);
      assert.equal((await res.json()).error, 'too_large');
      // Un cuerpo normal sigue pasando despues.
      assert.equal((await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody())).status, 201);
    } finally {
      await srv.stop();
    }
  });

  test('POST con el mismo runId es idempotente; con otro puntaje se rechaza', async () => {
    const srv = await startApp({ ...NO_LIMIT, ...PAST_EVENT });
    try {
      const body = xocBody({ score: 1500 });
      const a = await postJson(srv.base, '/api/leaderboard/xochimilco', body);
      const b = await postJson(srv.base, '/api/leaderboard/xochimilco', body);
      assert.equal(a.status, 201);
      assert.equal(b.status, 201);
      assert.equal((await b.json()).rank, 1);
      assert.equal((await (await fetch(`${srv.base}/api/leaderboard/xochimilco`)).json()).length, 1);
      const tampered = await postJson(srv.base, '/api/leaderboard/xochimilco', { ...body, score: 1900 });
      assert.equal(tampered.status, 400);
      assert.equal((await tampered.json()).error, 'duplicate_run');
    } finally {
      await srv.stop();
    }
  });

  test('los datos sobreviven a un reinicio (store-file en disco)', async () => {
    const dataDir = tmpDir('cfg-persist-');
    try {
      const one = await startApp({ ...NO_LIMIT, ...PAST_EVENT }, { dataDir });
      await postJson(one.base, '/api/leaderboard/xochimilco', xocBody({ alias: 'Persistente' }));
      await one.stop();

      const two = await startApp({ ...NO_LIMIT, ...PAST_EVENT }, { dataDir });
      const rows = await (await fetch(`${two.base}/api/leaderboard/xochimilco`)).json();
      assert.deepEqual(rows.map((r) => r.alias), ['Persistente']);
      await two.stop();
    } finally {
      removeDir(dataDir);
    }
  });
});

describe('limite de tasa', () => {
  test('un segundo POST dentro de la ventana de 10 s recibe 429 con Retry-After', async () => {
    const srv = await startApp(PAST_EVENT); // ventana por defecto: 10 s
    try {
      assert.equal(srv.config.rate.windowMs, 10_000);
      assert.equal(srv.config.rate.dailyMax, 300);
      const first = await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody());
      assert.equal(first.status, 201);
      const second = await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody());
      assert.equal(second.status, 429);
      const retry = Number(second.headers.get('retry-after'));
      assert.ok(retry >= 1 && retry <= 10, `Retry-After ${retry}`);
      const json = await second.json();
      assert.equal(json.error, 'rate_limited');
      assert.equal(json.retryAfter, retry);
      // GET no cuenta para el limite.
      assert.equal((await fetch(`${srv.base}/api/leaderboard/xochimilco`)).status, 200);
    } finally {
      await srv.stop();
    }
  });

  test('un envio invalido no consume el turno', async () => {
    const srv = await startApp(PAST_EVENT);
    try {
      assert.equal((await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody({ alias: 'x' }))).status, 400);
      assert.equal((await postJson(srv.base, '/api/leaderboard/xochimilco', '{roto')).status, 400);
      assert.equal((await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody())).status, 201);
    } finally {
      await srv.stop();
    }
  });

  test('rafagas en paralelo: solo una pasa', async () => {
    const srv = await startApp(PAST_EVENT);
    try {
      const results = await Promise.all(
        Array.from({ length: 6 }, () => postJson(srv.base, '/api/leaderboard/xochimilco', xocBody())),
      );
      const statuses = results.map((r) => r.status).sort();
      assert.deepEqual(statuses, [201, 429, 429, 429, 429, 429]);
    } finally {
      await srv.stop();
    }
  });

  test('tope diario por IP', async () => {
    const srv = await startApp({ rate: { windowMs: 0, dailyMax: 3 }, ...PAST_EVENT });
    try {
      for (let i = 0; i < 3; i += 1) {
        assert.equal((await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody())).status, 201);
      }
      const over = await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody());
      assert.equal(over.status, 429);
      assert.equal((await over.json()).error, 'daily_limit');
      assert.ok(Number(over.headers.get('retry-after')) > 3600);
    } finally {
      await srv.stop();
    }
  });
});
