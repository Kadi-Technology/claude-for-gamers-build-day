// Utilidades compartidas por las pruebas: servidor con puerto efimero y cliente WebSocket con cola de mensajes.
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { silentLogger } from '../src/log.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function tmpDir(prefix = 'cfg-test-') {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDir(dir) {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

/**
 * Levanta la app en 127.0.0.1 con puerto efimero.
 * @param {object} [overrides]  se mezcla sobre la configuracion (por ejemplo { rate: { windowMs: 0 } })
 * @param {{env?: object, dataDir?: string, store?: object}} [extra]
 */
export async function startApp(overrides = {}, extra = {}) {
  const ownsDataDir = !extra.dataDir;
  const dataDir = extra.dataDir ?? tmpDir('cfg-data-');
  const config = loadConfig(extra.env ?? {}, { dataDir, host: '127.0.0.1', port: 0, ...overrides });
  const app = await createApp(config, { log: silentLogger, store: extra.store });
  const { port } = await app.listen(0, '127.0.0.1');
  return {
    app,
    config,
    port,
    dataDir,
    base: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    async stop() {
      await app.close();
      if (ownsDataDir) removeDir(dataDir);
    },
  };
}

/** Cuerpo valido de Xochimilco; `over` sustituye campos de primer nivel y `meta` se mezcla. */
export function xocBody(over = {}) {
  return {
    alias: 'Ajolote',
    score: 1500,
    runId: randomUUID(),
    ...over,
    meta: { distance: 1200, zone: 3, flowers: 30, durationMs: 120_000, ...(over.meta ?? {}) },
  };
}

export function angelBody(over = {}) {
  return {
    alias: 'Catrina',
    score: 5012,
    runId: randomUUID(),
    ...over,
    meta: { wave: 5, kills: 12, map: 'reforma', players: 2, ...(over.meta ?? {}) },
  };
}

export function postJson(base, route, body, headers = {}) {
  return fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Cliente WebSocket con cola de mensajes para esperar tipos concretos. */
export async function connectWs(url, options = {}) {
  const ws = new WebSocket(url, options);
  const inbox = [];
  const waiters = [];

  function deliver() {
    for (const waiter of [...waiters]) {
      const index = inbox.findIndex(waiter.match);
      if (index < 0) continue;
      const [message] = inbox.splice(index, 1);
      waiters.splice(waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  }

  ws.on('message', (data) => {
    const raw = data.toString('utf8');
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      message = { t: '__invalid__' };
    }
    Object.defineProperty(message, '__raw', { value: raw, enumerable: false });
    inbox.push(message);
    deliver();
  });

  const closed = new Promise((resolve) => {
    ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
    ws.once('unexpected-response', (_req, res) => {
      reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { statusCode: res.statusCode }));
    });
  });

  const client = {
    ws,
    inbox,
    closed,
    send: (obj) => ws.send(JSON.stringify(obj)),
    sendRaw: (text) => ws.send(text),
    /** Espera un mensaje por tipo (string) o por predicado. */
    next(typeOrFn, timeoutMs = 2000) {
      const match = typeof typeOrFn === 'function' ? typeOrFn : (m) => m.t === typeOrFn;
      return new Promise((resolve, reject) => {
        const waiter = {
          match,
          resolve,
          timer: setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error(`Tiempo agotado esperando ${typeof typeOrFn === 'string' ? typeOrFn : 'mensaje'}`));
          }, timeoutMs),
        };
        waiters.push(waiter);
        deliver();
      });
    },
    /** Verifica que NO llegue un mensaje de ese tipo en `ms`. */
    async none(type, ms = 150) {
      await sleep(ms);
      const found = inbox.find((m) => m.t === type);
      if (found) throw new Error(`Llego un mensaje inesperado: ${JSON.stringify(found).slice(0, 120)}`);
    },
    close() {
      ws.close();
      return closed;
    },
  };
  return client;
}

/** Conecta, envia hello y devuelve el cliente. */
export async function joinAs(url, alias, options = {}) {
  const client = await connectWs(url, options);
  client.send({ t: 'hello', v: 1, alias, skin: 'catrina' });
  return client;
}
