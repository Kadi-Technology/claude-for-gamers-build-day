import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, SERVER_DIR } from '../src/config.js';
import { safeSegments } from '../src/static.js';
import { removeDir, startApp, tmpDir } from './helpers.mjs';

const SECRET_TEXT = 'CONTENIDO-SECRETO';

/** GET sin normalizar la ruta (fetch limpia los ".."; aqui queremos mandarlos tal cual). */
function rawGet(port, rawPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('estaticos con una raiz de prueba', () => {
  let root;
  let outside;
  let srv;
  let fileLinkWorks = false;
  let dirLinkWorks = false;

  before(async () => {
    outside = tmpDir('cfg-static-');
    root = path.join(outside, 'root');
    for (const dir of ['sub', 'empty', 'docs', 'server', 'infra', 'tests', '.git', 'node_modules/pkg', 'games/angel', 'acentos']) {
      mkdirSync(path.join(root, dir), { recursive: true });
    }
    const files = {
      'index.html': '<!doctype html><title>Lobby</title><p>Hola</p>',
      'app.js': 'export const x = 1;',
      'mod.mjs': 'export default 2;',
      'style.css': 'body{color:#222}',
      'data.json': '{"a":1}',
      'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'sound.wav': 'RIFF',
      'VERSION.txt': 'abc1234',
      'sub/index.html': '<!doctype html><p>Sub</p>',
      'games/angel/index.html': '<!doctype html><p>Angel</p>',
      'acentos/ñandú.txt': 'con eñe',
      'docs/secret.md': SECRET_TEXT,
      'server/x.js': SECRET_TEXT,
      'infra/x.yaml': SECRET_TEXT,
      'tests/x.mjs': SECRET_TEXT,
      '.git/config': SECRET_TEXT,
      '.env': SECRET_TEXT,
      'node_modules/pkg/index.js': SECRET_TEXT,
    };
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(root, name), content);
    writeFileSync(path.join(outside, 'fuera.txt'), SECRET_TEXT);
    writeFileSync(path.join(root, 'png.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    try {
      symlinkSync(path.join(outside, 'fuera.txt'), path.join(root, 'enlace.txt'));
      fileLinkWorks = true;
    } catch {
      fileLinkWorks = false; // Windows sin permiso de enlaces simbolicos de archivo
    }
    try {
      symlinkSync(path.join(root, 'docs'), path.join(root, 'atajo'), 'junction');
      symlinkSync(outside, path.join(root, 'salida'), 'junction');
      dirLinkWorks = true;
    } catch {
      dirLinkWorks = false;
    }
    srv = await startApp({ staticRoot: root });
  });

  after(async () => {
    await srv.stop();
    removeDir(outside);
  });

  test('sirve el index en / con MIME y Cache-Control de HTML', async () => {
    const res = await fetch(`${srv.base}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(await res.text(), /<p>Hola<\/p>/);
    assert.equal((await fetch(`${srv.base}/index.html`)).status, 200);
  });

  test('MIME correctos (.js como text/javascript) y max-age=300 fuera del HTML', async () => {
    const expected = {
      '/app.js': 'text/javascript; charset=utf-8',
      '/mod.mjs': 'text/javascript; charset=utf-8',
      '/style.css': 'text/css; charset=utf-8',
      '/data.json': 'application/json; charset=utf-8',
      '/logo.svg': 'image/svg+xml',
      '/png.png': 'image/png',
      '/sound.wav': 'audio/wav',
      '/VERSION.txt': 'text/plain; charset=utf-8',
    };
    for (const [route, type] of Object.entries(expected)) {
      const res = await fetch(`${srv.base}${route}`);
      assert.equal(res.status, 200, route);
      assert.equal(res.headers.get('content-type'), type, route);
      assert.equal(res.headers.get('cache-control'), 'public, max-age=300', route);
      await res.arrayBuffer();
    }
  });

  test('nombres con acentos y espacios codificados en la URL', async () => {
    const res = await fetch(`${srv.base}/acentos/${encodeURIComponent('ñandú.txt')}`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'con eñe');
  });

  test('carpetas: / y /sub/ sirven su index; /sub redirige a /sub/; sin index es 404', async () => {
    assert.match(await (await fetch(`${srv.base}/sub/`)).text(), /Sub/);
    assert.match(await (await fetch(`${srv.base}/games/angel/`)).text(), /Angel/);
    const redirect = await fetch(`${srv.base}/games/angel`, { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), '/games/angel/');
    const withQuery = await rawGet(srv.port, '/sub?debug=1');
    assert.equal(withQuery.status, 308);
    assert.equal(withQuery.headers.location, '/sub/?debug=1');
    assert.equal((await fetch(`${srv.base}/empty/`)).status, 404);
    assert.equal((await fetch(`${srv.base}/empty`, { redirect: 'manual' })).status, 308);
    assert.equal((await fetch(`${srv.base}/no-existe.js`)).status, 404);
  });

  test('ETag y If-None-Match devuelven 304; HEAD no trae cuerpo; otros metodos 405', async () => {
    const first = await fetch(`${srv.base}/app.js`);
    const etag = first.headers.get('etag');
    assert.ok(etag);
    await first.arrayBuffer();
    const cached = await fetch(`${srv.base}/app.js`, { headers: { 'If-None-Match': etag } });
    assert.equal(cached.status, 304);

    const head = await rawGet(srv.port, '/app.js', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.headers['content-length'], String('export const x = 1;'.length));
    assert.equal(head.body, '');

    const post = await fetch(`${srv.base}/app.js`, { method: 'POST', body: 'x' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
  });

  test('server/, infra/, .git/, docs/ y tests/ no se sirven (tampoco con otras mayusculas o %-codificados)', async () => {
    const blocked = [
      '/docs/secret.md',
      '/DOCS/secret.md',
      '/Docs/secret.md',
      '/%64ocs/secret.md',
      '/server/x.js',
      '/Server/x.js',
      '/%73erver/x.js',
      '/infra/x.yaml',
      '/INFRA/x.yaml',
      '/tests/x.mjs',
      '/.git/config',
      '/.GIT/config',
      '/.env',
      '/node_modules/pkg/index.js',
      '/sub/node_modules/pkg/index.js',
      '/docs',
      '/docs/',
      '/server/',
    ];
    for (const route of blocked) {
      const res = await rawGet(srv.port, route);
      assert.ok([404, 308].includes(res.status), `${route} -> ${res.status}`);
      if (res.status === 308) assert.equal((await rawGet(srv.port, res.headers.location)).status, 404, route);
      assert.ok(!res.body.includes(SECRET_TEXT), route);
    }
  });

  test('path traversal bloqueado en todas sus formas', async () => {
    const attacks = [
      '/../fuera.txt',
      '/../../fuera.txt',
      '/sub/../../fuera.txt',
      '/sub/../docs/secret.md',
      '/%2e%2e/fuera.txt',
      '/%2E%2E/fuera.txt',
      '/..%2ffuera.txt',
      '/..%2Ffuera.txt',
      '/%2e%2e%2ffuera.txt',
      '/..%5cfuera.txt',
      '/sub/..%5c..%5cfuera.txt',
      '/sub/%2e%2e/%2e%2e/fuera.txt',
      '/....//fuera.txt',
      '/.%2e/fuera.txt',
      '/app.js%00.png',
      '/%00',
      '/docs./secret.md',
      '/docs%20/secret.md',
      '/docs::$INDEX_ALLOCATION/secret.md',
      '/index.html::$DATA',
      '/C:/Windows/win.ini',
      '/c%3a/Windows/win.ini',
      '/DOCS~1/secret.md',
      '//fuera.txt',
      '/\\fuera.txt',
      '/%',
      '/%zz',
      '/%c0%ae%c0%ae/fuera.txt',
    ];
    for (const attack of attacks) {
      const res = await rawGet(srv.port, attack);
      assert.ok([400, 404].includes(res.status), `${attack} -> ${res.status}`);
      assert.ok(!res.body.includes(SECRET_TEXT), attack);
    }
  });

  test('un enlace simbolico o junction que escapa de la raiz o apunta a docs/ no se sirve', async (t) => {
    const routes = [];
    if (fileLinkWorks) routes.push('/enlace.txt');
    if (dirLinkWorks) routes.push('/atajo/secret.md', '/salida/fuera.txt', '/salida/root/docs/secret.md');
    if (routes.length === 0) {
      t.skip('esta maquina no permite crear enlaces');
      return;
    }
    for (const route of routes) {
      const res = await rawGet(srv.port, route);
      assert.equal(res.status, 404, route);
      assert.ok(!res.body.includes(SECRET_TEXT), route);
    }
  });

  test('safeSegments: normaliza y rechaza', () => {
    assert.deepEqual(safeSegments('/'), []);
    assert.deepEqual(safeSegments('/games//angel/'), ['games', 'angel']);
    assert.equal(safeSegments('/a/../b'), null);
    assert.equal(safeSegments('/.hidden'), null);
    assert.equal(safeSegments('/Docs/x'), null);
    assert.equal(safeSegments('/x'.repeat(2) + '/' + 'a'.repeat(300)), null);
  });
});

describe('estaticos con la raiz por defecto (raiz del repo)', () => {
  test('STATIC_ROOT por defecto es la raiz del repo y no expone server/, docs/ ni tests/', async () => {
    const repoRoot = path.resolve(SERVER_DIR, '..');
    assert.equal(loadConfig({}).staticRoot, repoRoot);
    const srv = await startApp();
    try {
      assert.equal(path.resolve(srv.config.staticRoot), repoRoot);
      for (const route of [
        '/server/package.json',
        '/server/src/index.js',
        '/server/src/validate.js',
        '/server/test/static.test.mjs',
        '/server/node_modules/ws/package.json',
        '/docs/01_EVENTO_Y_ALCANCE.md',
        '/docs/07_CONTRATO_INTERNO.md',
        '/DOCS/07_CONTRATO_INTERNO.md',
        '/tests/package.json',
        '/infra/cfn/stack.yaml',
        '/.git',
        '/.gitignore',
      ]) {
        const res = await rawGet(srv.port, route);
        assert.equal(res.status, 404, route);
      }
    } finally {
      await srv.stop();
    }
  });
});
