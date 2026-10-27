import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { connectWs, joinAs, postJson, startApp, xocBody } from './helpers.mjs';

// Valor de prueba, no es ningun secreto real.
const SECRET = 'secreto-de-prueba-origen';
const PAST_EVENT = { eventStart: Date.parse('2020-01-01T00:00:00Z') };

async function withSecret(overrides, fn) {
  const srv = await startApp({ originSecret: SECRET, ...PAST_EVENT, ...overrides });
  try {
    await fn(srv);
  } finally {
    await srv.stop();
  }
}

describe('ORIGIN_SECRET', () => {
  test('sin secreto configurado nada se exige', async () => {
    const srv = await startApp(PAST_EVENT);
    try {
      assert.equal(srv.config.originSecret, '');
      assert.equal((await fetch(`${srv.base}/api/leaderboard/angel`)).status, 200);
      assert.equal((await fetch(`${srv.base}/api/health`)).status, 200);
    } finally {
      await srv.stop();
    }
  });

  test('con secreto: todo exige X-Origin-Secret excepto GET /api/health', async () => {
    await withSecret({}, async (srv) => {
      const health = await fetch(`${srv.base}/api/health`);
      assert.equal(health.status, 200);
      assert.equal((await health.json()).ok, true);

      for (const route of ['/', '/index.html', '/api/leaderboard/angel', '/api/leaderboard/xochimilco?scope=all', '/api/otra', '/ws', '/server/package.json']) {
        const res = await fetch(`${srv.base}${route}`);
        assert.equal(res.status, 403, route);
        assert.equal((await res.json()).error, 'forbidden');
      }
      const post = await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody());
      assert.equal(post.status, 403);
      // Ni siquiera con el metodo equivocado en /api/health se salta la regla.
      assert.equal((await fetch(`${srv.base}/api/health`, { method: 'POST' })).status, 403);
    });
  });

  test('un secreto incorrecto, vacio o de otro largo se rechaza; el correcto pasa', async () => {
    await withSecret({}, async (srv) => {
      for (const value of ['otro', SECRET.slice(0, -1), `${SECRET}x`, SECRET.toUpperCase(), ' ']) {
        const res = await fetch(`${srv.base}/api/leaderboard/angel`, { headers: { 'X-Origin-Secret': value } });
        assert.equal(res.status, 403, JSON.stringify(value));
      }
      const ok = await fetch(`${srv.base}/api/leaderboard/angel`, { headers: { 'X-Origin-Secret': SECRET } });
      assert.equal(ok.status, 200);
      const post = await postJson(srv.base, '/api/leaderboard/xochimilco', xocBody(), { 'X-Origin-Secret': SECRET });
      assert.equal(post.status, 201);
    });
  });

  test('los estaticos tambien exigen el secreto', async () => {
    await withSecret({}, async (srv) => {
      assert.equal((await fetch(`${srv.base}/`)).status, 403);
      const res = await fetch(`${srv.base}/README.md`, { headers: { 'X-Origin-Secret': SECRET } });
      assert.ok([200, 404].includes(res.status));
      assert.notEqual(res.status, 403);
    });
  });

  test('el WebSocket sin secreto se rechaza con 403 y con secreto conecta', async () => {
    await withSecret({}, async (srv) => {
      await assert.rejects(connectWs(srv.wsUrl), (err) => err.statusCode === 403);
      await assert.rejects(connectWs(srv.wsUrl, { headers: { 'X-Origin-Secret': 'mal' } }), (err) => err.statusCode === 403);

      const c = await joinAs(srv.wsUrl, 'Autorizado', { headers: { 'X-Origin-Secret': SECRET } });
      c.send({ t: 'create', map: 'reforma', public: false });
      assert.equal((await c.next('room')).t, 'room');
      c.ws.terminate();
    });
  });

  test('el WebSocket solo existe en /ws', async () => {
    const srv = await startApp();
    try {
      await assert.rejects(connectWs(`ws://127.0.0.1:${srv.port}/otra-ruta`), (err) => err.statusCode === 404);
      const plain = await fetch(`${srv.base}/ws`);
      assert.equal(plain.status, 426);
    } finally {
      await srv.stop();
    }
  });
});

describe('IP del cliente para el limite de tasa', () => {
  test('con secreto valido se usa CF-Connecting-IP: cada IP tiene su propio turno', async () => {
    await withSecret({}, async (srv) => {
      const post = (ip) => postJson(srv.base, '/api/leaderboard/xochimilco', xocBody(), { 'X-Origin-Secret': SECRET, 'CF-Connecting-IP': ip });
      assert.equal((await post('203.0.113.1')).status, 201);
      assert.equal((await post('203.0.113.1')).status, 429);
      assert.equal((await post('203.0.113.2')).status, 201);
      assert.equal((await post('2001:db8::7')).status, 201);
      assert.equal((await post('2001:db8::7')).status, 429);
    });
  });

  test('con secreto valido y sin CF-Connecting-IP se usa el primer X-Forwarded-For', async () => {
    await withSecret({}, async (srv) => {
      const post = (xff) => postJson(srv.base, '/api/leaderboard/xochimilco', xocBody(), { 'X-Origin-Secret': SECRET, 'X-Forwarded-For': xff });
      assert.equal((await post('198.51.100.1, 10.0.0.1')).status, 201);
      assert.equal((await post('198.51.100.1, 10.0.0.2')).status, 429);
      assert.equal((await post('198.51.100.9, 10.0.0.1')).status, 201);
    });
  });

  test('CF-Connecting-IP manda sobre X-Forwarded-For', async () => {
    await withSecret({}, async (srv) => {
      const post = (cf, xff) =>
        postJson(srv.base, '/api/leaderboard/xochimilco', xocBody(), { 'X-Origin-Secret': SECRET, 'CF-Connecting-IP': cf, 'X-Forwarded-For': xff });
      assert.equal((await post('203.0.113.50', '192.0.2.1')).status, 201);
      assert.equal((await post('203.0.113.50', '192.0.2.2')).status, 429);
    });
  });

  test('sin ORIGIN_SECRET los headers de IP se ignoran (no se pueden falsificar)', async () => {
    const srv = await startApp(PAST_EVENT);
    try {
      const post = (ip) => postJson(srv.base, '/api/leaderboard/xochimilco', xocBody(), { 'CF-Connecting-IP': ip, 'X-Forwarded-For': ip });
      assert.equal((await post('203.0.113.1')).status, 201);
      assert.equal((await post('203.0.113.2')).status, 429);
    } finally {
      await srv.stop();
    }
  });

  test('un valor de IP basura se ignora y se cae a la IP del socket', async () => {
    await withSecret({}, async (srv) => {
      const post = (ip) => postJson(srv.base, '/api/leaderboard/xochimilco', xocBody(), { 'X-Origin-Secret': SECRET, 'CF-Connecting-IP': ip });
      assert.equal((await post('no es una ip <script>')).status, 201);
      assert.equal((await post('otra basura')).status, 429); // ambas cayeron a 127.0.0.1
    });
  });
});
