// Ensambla el servidor unico: estaticos, /api/* (leaderboard), /api/health y /ws (salas).
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createFileStore } from './store-file.js';
import { createLeaderboard } from './leaderboard.js';
import { createRooms } from './rooms.js';
import { createStatic } from './static.js';
import { clientIp, hasValidOriginSecret, sendJson, splitUrl } from './http.js';
import { createLogger } from './log.js';

async function createStore(config, log) {
  if (config.store === 'dynamo') {
    // Import perezoso: en modo `file` no se carga el SDK de AWS.
    const { createDynamoStore } = await import('./store-dynamo.js');
    return createDynamoStore({ table: config.table, region: config.region, eventStart: config.eventStart });
  }
  return createFileStore({ dir: config.dataDir, eventStart: config.eventStart, log });
}

function rejectUpgrade(socket, status, reason) {
  if (socket.writable) {
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
  socket.setTimeout(2000, () => socket.destroy());
}

/**
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {{log?: object, store?: object}} [deps]  `store` permite inyectar un store en pruebas
 */
export async function createApp(config, deps = {}) {
  const log = deps.log ?? createLogger(config.logLevel);
  const store = deps.store ?? (await createStore(config, log));
  const rooms = createRooms({ ...config.rooms, log });
  const leaderboard = createLeaderboard({ store, config, log });
  const statics = createStatic({ root: config.staticRoot, log });
  const startedAt = Date.now();

  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    // Tope duro del transporte; el limite de aplicacion (32 KB) responde con un error sin cortar la conexion.
    maxPayload: config.rooms.maxMessageBytes * 2,
  });

  function health() {
    const { rooms: roomCount, sockets } = rooms.stats();
    return {
      ok: true,
      version: config.version,
      uptime: Math.round((Date.now() - startedAt) / 1000),
      rooms: roomCount,
      sockets,
    };
  }

  async function handleRequest(req, res) {
    const { pathname, search } = splitUrl(req.url);
    const isHealth = pathname === '/api/health' && (req.method === 'GET' || req.method === 'HEAD');

    if (config.originSecret && !isHealth && !hasValidOriginSecret(req, config.originSecret)) {
      sendJson(res, 403, { error: 'forbidden', msg: 'Acceso denegado.' });
      return;
    }
    if (pathname === '/api/health') {
      if (!isHealth) {
        sendJson(res, 405, { error: 'method_not_allowed', msg: 'Usa GET.' }, { Allow: 'GET, HEAD' });
        return;
      }
      sendJson(res, 200, health());
      return;
    }
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      await leaderboard.handle(req, res, {
        pathname,
        query: new URLSearchParams(search),
        ip: clientIp(req, config.originSecret),
      });
      return;
    }
    if (pathname === '/ws') {
      sendJson(res, 426, { error: 'upgrade_required', msg: 'Este endpoint es solo WebSocket.' }, { Upgrade: 'websocket' });
      return;
    }
    await statics.serve(req, res, { pathname, search });
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      log.error(`Error en ${req.method} ${String(req.url).slice(0, 120)}: ${err.stack ?? err.message}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal', msg: 'Error interno del servidor.' });
      else res.destroy();
    });
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    const { pathname } = splitUrl(req.url);
    if (pathname !== '/ws') {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }
    if (config.originSecret && !hasValidOriginSecret(req, config.originSecret)) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    if (rooms.stats().sockets >= config.rooms.maxSockets) {
      rejectUpgrade(socket, 503, 'Service Unavailable');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      rooms.attach(ws);
    });
  });

  const sweepTimer = setInterval(() => leaderboard.limiter.sweep(), 10 * 60_000);
  sweepTimer.unref();

  return {
    server,
    wss,
    rooms,
    store,
    leaderboard,
    config,
    health,

    listen(port = config.port, host = config.host) {
      return new Promise((resolve, reject) => {
        const onError = (err) => reject(err);
        server.once('error', onError);
        const onListening = () => {
          server.off('error', onError);
          resolve({ port: server.address().port });
        };
        if (host) server.listen(port, host, onListening);
        else server.listen(port, onListening);
      });
    },

    async close() {
      clearInterval(sweepTimer);
      rooms.close();
      if (wss.clients.size > 0) await new Promise((resolve) => setTimeout(resolve, 150));
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await store.flush?.();
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      if (server.listening) await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
