import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_EVENT_START, loadConfig, SERVER_DIR } from '../src/config.js';
import { joinAs, removeDir, sleep, startApp, tmpDir } from './helpers.mjs';

describe('GET /api/health', () => {
  test('responde ok, version, uptime, rooms y sockets', async () => {
    const srv = await startApp({}, { env: { CFG_VERSION: 'abc1234' } });
    try {
      const res = await fetch(`${srv.base}/api/health`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /^application\/json/);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const body = await res.json();
      assert.deepEqual(Object.keys(body).sort(), ['ok', 'rooms', 'sockets', 'uptime', 'version']);
      assert.equal(body.ok, true);
      assert.equal(body.version, 'abc1234');
      assert.equal(typeof body.uptime, 'number');
      assert.ok(body.uptime >= 0);
      assert.equal(body.rooms, 0);
      assert.equal(body.sockets, 0);
    } finally {
      await srv.stop();
    }
  });

  test('cuenta las salas y los sockets activos', async () => {
    const srv = await startApp();
    try {
      const host = await joinAs(srv.wsUrl, 'Anfitrion');
      host.send({ t: 'create', map: 'reforma', public: false });
      await host.next('room');
      const guest = await joinAs(srv.wsUrl, 'Invitado');
      const idle = await joinAs(srv.wsUrl, 'Curioso');
      const during = await (await fetch(`${srv.base}/api/health`)).json();
      assert.equal(during.rooms, 1);
      assert.equal(during.sockets, 3);

      host.ws.terminate();
      guest.ws.terminate();
      idle.ws.terminate();
      await sleep(100);
      const after = await (await fetch(`${srv.base}/api/health`)).json();
      assert.equal(after.rooms, 0);
      assert.equal(after.sockets, 0);
    } finally {
      await srv.stop();
    }
  });

  test('HEAD funciona y otros metodos dan 405', async () => {
    const srv = await startApp();
    try {
      assert.equal((await fetch(`${srv.base}/api/health`, { method: 'HEAD' })).status, 200);
      assert.equal((await fetch(`${srv.base}/api/health`, { method: 'POST' })).status, 405);
    } finally {
      await srv.stop();
    }
  });
});

describe('configuracion', () => {
  test('valores por defecto de docs/07 seccion 4', () => {
    const cfg = loadConfig({});
    assert.equal(cfg.port, 8080);
    assert.equal(cfg.store, 'file');
    assert.equal(cfg.table, 'cfg-buildday-leaderboard');
    assert.equal(cfg.region, 'us-east-1');
    assert.equal(DEFAULT_EVENT_START, '2026-10-26T17:30:00-06:00');
    assert.equal(cfg.eventStart, Date.parse('2026-10-26T17:30:00-06:00'));
    assert.equal(cfg.eventStart, Date.UTC(2026, 9, 26, 23, 30, 0));
    assert.equal(cfg.originSecret, '');
    assert.equal(cfg.staticRoot, path.resolve(SERVER_DIR, '..'));
    assert.equal(cfg.dataDir, path.join(SERVER_DIR, 'data'));
  });

  test('lee las variables de entorno', () => {
    const cfg = loadConfig({
      PORT: '9090',
      STATIC_ROOT: '.',
      STORE: 'dynamo',
      TABLE: 'otra-tabla',
      AWS_REGION: 'us-east-2',
      EVENT_START: '2026-10-27T00:00:00Z',
      CFG_VERSION: 'v1',
      ORIGIN_SECRET: 'x',
    });
    assert.equal(cfg.port, 9090);
    assert.equal(cfg.store, 'dynamo');
    assert.equal(cfg.table, 'otra-tabla');
    assert.equal(cfg.region, 'us-east-2');
    assert.equal(cfg.eventStart, Date.parse('2026-10-27T00:00:00Z'));
    assert.equal(cfg.version, 'v1');
    assert.equal(cfg.originSecret, 'x');
    assert.equal(cfg.staticRoot, path.resolve('.'));
  });

  test('STORE invalido falla al arrancar y EVENT_START invalido cae al valor por defecto', () => {
    assert.throws(() => loadConfig({ STORE: 'mysql' }), /STORE/);
    const cfg = loadConfig({ EVENT_START: 'manana' });
    assert.equal(cfg.eventStart, Date.parse(DEFAULT_EVENT_START));
  });

  test('version: CFG_VERSION, luego VERSION.txt de la raiz estatica, luego dev', () => {
    const dir = tmpDir('cfg-version-');
    try {
      writeFileSync(path.join(dir, 'VERSION.txt'), 'deadbee\n');
      assert.equal(loadConfig({ STATIC_ROOT: dir }).version, 'deadbee');
      assert.equal(loadConfig({ STATIC_ROOT: dir, CFG_VERSION: 'manual' }).version, 'manual');
    } finally {
      removeDir(dir);
    }
  });
});

describe('arranque real (node src/index.js)', () => {
  test('arranca, responde health, sirve el repo y se apaga limpio', async () => {
    const dataDir = tmpDir('cfg-boot-');
    const child = spawn(process.execPath, [path.join(SERVER_DIR, 'src', 'index.js')], {
      env: { ...process.env, PORT: '0', DATA_DIR: dataDir, CFG_VERSION: 'boot-test', ORIGIN_SECRET: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: SERVER_DIR,
    });
    let output = '';
    child.stdout.on('data', (d) => {
      output += d;
    });
    child.stderr.on('data', (d) => {
      output += d;
    });
    try {
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No arranco a tiempo. Salida: ${output}`)), 10_000);
        child.on('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`El proceso termino con codigo ${code}. Salida: ${output}`));
        });
        const check = setInterval(() => {
          const match = /escuchando en el puerto (\d+)/.exec(output);
          if (match) {
            clearInterval(check);
            clearTimeout(timer);
            resolve(Number(match[1]));
          }
        }, 20);
      });
      const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
      assert.equal(health.ok, true);
      assert.equal(health.version, 'boot-test');
      assert.equal((await fetch(`http://127.0.0.1:${port}/server/package.json`)).status, 404);
      assert.ok(!/error/i.test(output), output);
    } finally {
      child.removeAllListeners('exit');
      child.kill();
      await sleep(100);
      removeDir(dataDir);
    }
  });
});
