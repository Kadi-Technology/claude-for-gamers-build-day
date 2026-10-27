// Salas cooperativas (docs/03 seccion 7). El servidor es un relevo: valida el sobre y el tamano,
// administra quien esta en cada sala y retransmite snap/full/in/lvl/pick sin parsear su contenido.
//
// Convenciones que el contrato deja abiertas (los clientes de shared/net/room.js deben respetarlas):
//  - pid: entero asignado por el servidor dentro de la sala. El host es siempre 1, los invitados
//    reciben 2, 3, 4... y un pid nunca se reutiliza mientras la sala exista.
//  - Los mensajes `in` y `pick` llegan al host con el campo `pid` del remitente anadido por el
//    servidor (ultima clave del objeto, por lo que prevalece sobre cualquier `pid` que envie el cliente).
//  - `full` y `lvl` son para todos los invitados; si el host pone "to":<pid> (en `full`) o
//    "pid":<pid> (en `lvl`) como primer campo tras "t", se entregan solo a ese invitado.
//  - `room` incluye ademas `map` y `public`. `peer_join` y `peer_leave` se envian a todos los demas
//    miembros (el host responde a `peer_join` con un `full`).
//  - Cuando el host sale o su socket se cae, todos reciben `room_closed` con reason `host_left`;
//    una sala sin mensajes durante `idleMs` se cierra con reason `idle`.
import { randomInt } from 'node:crypto';
import { normalizeRoomCode, validateAlias, validateMap, validateSkin } from './validate.js';
import { silentLogger } from './log.js';

/** 24 letras: sin I ni O (y, al ser solo letras, sin 0 ni 1). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 4;
const AVOID_CODES = new Set(['PUTA', 'CACA', 'TETA', 'ANAL', 'CUNT', 'FUCK', 'PEDA', 'CULE', 'VERG', 'PENE']);

const OPEN = 1;
const RELAY_TYPES = new Set(['snap', 'full', 'in', 'lvl', 'pick']);
const HOST_TO_GUESTS = new Set(['snap', 'full', 'lvl']);
const PEEK_TYPE_RE = /^\s*\{\s*"t"\s*:\s*"([a-z_]{1,16})"/;
const TARGET_RE = {
  full: /^\s*\{\s*"t"\s*:\s*"full"\s*,\s*"to"\s*:\s*(\d{1,6})\s*[,}]/,
  lvl: /^\s*\{\s*"t"\s*:\s*"lvl"\s*,\s*"pid"\s*:\s*(\d{1,6})\s*[,}]/,
};

const CLOSED_TTL_MS = 10 * 60_000;
const MAX_CLOSED_TOMBSTONES = 5000;
const SNAP_SKIP_BYTES = 512 * 1024; // un invitado lento deja de recibir snapshots
const SLOW_CLIENT_BYTES = 8 * 1024 * 1024; // y si acumula tanto, se le corta
const MAX_VIOLATION_WINDOWS = 5;

/**
 * Anade `"pid":<n>` como ultima clave de un objeto JSON en texto, sin parsearlo.
 * @returns {string|null} null si el texto no termina en una llave de cierre
 */
export function withPid(text, pid) {
  const end = text.lastIndexOf('}');
  if (end < 0 || text.slice(end + 1).trim() !== '') return null;
  return `${text.slice(0, end)},"pid":${pid}${text.slice(end)}`;
}

export function createRooms(options = {}) {
  const {
    maxRooms = 200,
    maxPlayers = 4,
    idleMs = 30 * 60_000,
    pingMs = 15_000,
    sweepMs = 30_000,
    helloTimeoutMs = 10_000,
    maxMessageBytes = 32 * 1024,
    messagesPerSecond = 60,
    maxSockets = 5000,
    log = silentLogger,
    now = Date.now,
  } = options;

  /** @type {Map<string, object>} */
  const rooms = new Map();
  /** @type {Map<string, number>} codigo -> vence el aviso "closed" */
  const closedCodes = new Map();
  /** @type {Set<object>} */
  const clients = new Set();

  // ---------- envio ----------
  function sendRaw(client, data, opts) {
    const ws = client.ws;
    if (ws.readyState !== OPEN) return false;
    try {
      ws.send(data, opts);
      return true;
    } catch (err) {
      log.warn(`No se pudo enviar a un socket: ${err.message}`);
      return false;
    }
  }

  const send = (client, obj) => sendRaw(client, JSON.stringify(obj));

  const sendError = (client, code, msg) => send(client, { t: 'error', code, msg });

  function broadcast(room, obj, except) {
    const text = JSON.stringify(obj);
    for (const member of room.members.values()) {
      if (member !== except) sendRaw(member, text);
    }
  }

  // ---------- salas ----------
  function isClosedCode(code) {
    const until = closedCodes.get(code);
    if (until === undefined) return false;
    if (until <= now()) {
      closedCodes.delete(code);
      return false;
    }
    return true;
  }

  function newCode() {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (rooms.has(code) || AVOID_CODES.has(code) || isClosedCode(code)) continue;
      return code;
    }
    return null;
  }

  const playersOf = (room) =>
    [...room.members.values()].map((m) => ({ pid: m.pid, alias: m.alias, skin: m.skin }));

  const roomMessage = (room, client) => ({
    t: 'room',
    code: room.code,
    you: client.pid,
    host: room.host.pid,
    map: room.map,
    public: room.public,
    players: playersOf(room),
  });

  function closeRoom(room, reason) {
    if (!rooms.delete(room.code)) return;
    closedCodes.set(room.code, now() + CLOSED_TTL_MS);
    if (closedCodes.size > MAX_CLOSED_TOMBSTONES) closedCodes.delete(closedCodes.keys().next().value);
    const members = [...room.members.values()];
    room.members.clear();
    for (const member of members) {
      member.room = null;
      member.pid = null;
      send(member, { t: 'room_closed', reason });
    }
    log.info(`Sala ${room.code} cerrada (${reason}); salas activas: ${rooms.size}`);
  }

  function leaveRoom(client) {
    const room = client.room;
    if (!room) return;
    const pid = client.pid;
    room.members.delete(pid);
    client.room = null;
    client.pid = null;
    room.lastActivity = now();
    if (room.host === client) closeRoom(room, 'host_left');
    else broadcast(room, { t: 'peer_leave', pid }, null);
  }

  // ---------- mensajes de control ----------
  function onHello(client, msg) {
    if (client.room) return sendError(client, 'already_in_room', 'Ya estás en una sala.');
    if (msg.v !== 1) return sendError(client, 'unsupported_version', 'Versión de protocolo no soportada.');
    const alias = validateAlias(msg.alias);
    if (!alias.ok) return sendError(client, 'bad_alias', alias.msg);
    client.alias = alias.alias;
    client.skin = validateSkin(msg.skin) ?? 'luchador';
    client.ready = true;
    clearTimeout(client.helloTimer);
    client.helloTimer = null;
    return undefined;
  }

  function requireReady(client) {
    if (client.ready) return true;
    sendError(client, 'hello_required', 'Primero envía hello con tu alias.');
    return false;
  }

  function onCreate(client, msg) {
    if (!requireReady(client)) return;
    if (client.room) {
      sendError(client, 'already_in_room', 'Ya estás en una sala.');
      return;
    }
    if (rooms.size >= maxRooms) {
      sendError(client, 'server_full', 'Hay demasiadas salas activas. Intenta de nuevo en un momento.');
      return;
    }
    const map = msg.map === undefined ? 'reforma' : validateMap(msg.map);
    if (!map) {
      sendError(client, 'bad_request', 'El mapa no es válido.');
      return;
    }
    const code = newCode();
    if (!code) {
      sendError(client, 'server_full', 'No se pudo generar un código de sala. Intenta de nuevo.');
      return;
    }
    const room = {
      code,
      map,
      public: msg.public === true,
      host: client,
      members: new Map(),
      nextPid: 1,
      createdAt: now(),
      lastActivity: now(),
    };
    client.pid = room.nextPid;
    room.nextPid += 1;
    client.room = room;
    room.members.set(client.pid, client);
    rooms.set(code, room);
    send(client, roomMessage(room, client));
    log.info(`Sala ${code} creada (${map}); salas activas: ${rooms.size}`);
  }

  function onJoin(client, msg) {
    if (!requireReady(client)) return;
    if (client.room) {
      sendError(client, 'already_in_room', 'Ya estás en una sala.');
      return;
    }
    const code = normalizeRoomCode(msg.code);
    const room = code ? rooms.get(code) : undefined;
    if (!room) {
      if (code && isClosedCode(code)) sendError(client, 'closed', 'Esa sala ya se cerró.');
      else sendError(client, 'not_found', 'No existe una sala con ese código.');
      return;
    }
    if (room.members.size >= maxPlayers) {
      sendError(client, 'full', `La sala está llena (máximo ${maxPlayers} jugadores).`);
      return;
    }
    client.pid = room.nextPid;
    room.nextPid += 1;
    client.room = room;
    room.members.set(client.pid, client);
    room.lastActivity = now();
    send(client, roomMessage(room, client));
    broadcast(room, { t: 'peer_join', pid: client.pid, alias: client.alias, skin: client.skin }, client);
    log.info(`Sala ${room.code}: entra un jugador (${room.members.size}/${maxPlayers})`);
  }

  // ---------- relevo ----------
  function relay(client, type, text, raw) {
    const room = client.room;
    if (!room) return; // sin sala: se descarta en silencio
    room.lastActivity = now();
    const isHost = room.host === client;

    if (HOST_TO_GUESTS.has(type)) {
      if (!isHost) return; // un invitado no puede hablar por el host
      let only = null;
      if (type !== 'snap') {
        const match = TARGET_RE[type].exec(text);
        if (match) only = Number(match[1]);
      }
      for (const member of room.members.values()) {
        if (member === client) continue;
        if (only !== null && member.pid !== only) continue;
        if (type === 'snap' && member.ws.bufferedAmount > SNAP_SKIP_BYTES) {
          if (member.ws.bufferedAmount > SLOW_CLIENT_BYTES) member.ws.terminate();
          continue;
        }
        sendRaw(member, raw, { binary: false });
      }
      return;
    }

    // in / pick: del invitado hacia el host, con su pid
    if (isHost) return;
    const stamped = withPid(text, client.pid);
    if (stamped !== null) sendRaw(room.host, stamped);
  }

  function overRate(client) {
    const t = now();
    if (t - client.winStart >= 1000) {
      if (!client.winExceeded) client.violations = 0;
      client.winStart = t;
      client.winCount = 0;
      client.winExceeded = false;
    }
    client.winCount += 1;
    if (client.winCount <= messagesPerSecond) return false;
    if (!client.winExceeded) {
      client.winExceeded = true;
      client.violations += 1;
      sendError(client, 'rate_limited', 'Demasiados mensajes por segundo.');
      if (client.violations >= MAX_VIOLATION_WINDOWS) client.ws.close(1008, 'rate_limited');
    }
    return true;
  }

  function onMessage(client, data, isBinary) {
    if (overRate(client)) return;
    if (isBinary) {
      sendError(client, 'bad_message', 'Solo se aceptan mensajes de texto JSON.');
      return;
    }
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (raw.length > maxMessageBytes) {
      sendError(client, 'too_large', `El mensaje supera ${maxMessageBytes} bytes.`);
      return;
    }
    const text = raw.toString('utf8');

    const peek = PEEK_TYPE_RE.exec(text);
    if (peek && RELAY_TYPES.has(peek[1])) {
      if (!client.ready) {
        sendError(client, 'hello_required', 'Primero envía hello con tu alias.');
        return;
      }
      relay(client, peek[1], text, raw);
      return;
    }

    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      sendError(client, 'bad_json', 'El mensaje no es JSON válido.');
      return;
    }
    if (msg === null || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') {
      sendError(client, 'bad_message', 'El mensaje debe ser un objeto con el campo "t".');
      return;
    }

    if (RELAY_TYPES.has(msg.t)) {
      // Mismo mensaje con las claves en otro orden: se relaya el texto original.
      if (!client.ready) sendError(client, 'hello_required', 'Primero envía hello con tu alias.');
      else relay(client, msg.t, text, raw);
      return;
    }

    switch (msg.t) {
      case 'hello':
        onHello(client, msg);
        break;
      case 'create':
        onCreate(client, msg);
        break;
      case 'join':
        onJoin(client, msg);
        break;
      case 'leave':
        if (requireReady(client)) leaveRoom(client);
        break;
      default:
        sendError(client, 'unknown_type', `Tipo de mensaje desconocido: ${msg.t.slice(0, 24)}`);
    }
  }

  // ---------- ciclo de vida de sockets ----------
  function cleanup(client) {
    clearTimeout(client.helloTimer);
    client.helloTimer = null;
    clients.delete(client);
    try {
      leaveRoom(client);
    } catch (err) {
      log.error(`Error al limpiar un socket: ${err.stack ?? err.message}`);
    }
  }

  function attach(ws) {
    if (clients.size >= maxSockets) {
      ws.close(1013, 'server_busy');
      return null;
    }
    const client = {
      ws,
      alias: null,
      skin: null,
      ready: false,
      room: null,
      pid: null,
      alive: true,
      winStart: now(),
      winCount: 0,
      winExceeded: false,
      violations: 0,
      helloTimer: null,
    };
    clients.add(client);
    client.helloTimer = setTimeout(() => {
      if (client.ready) return;
      sendError(client, 'hello_timeout', 'Se esperaba hello.');
      ws.close(1008, 'hello_timeout');
    }, helloTimeoutMs);
    client.helloTimer.unref?.();

    ws.on('message', (data, isBinary) => {
      try {
        onMessage(client, data, isBinary);
      } catch (err) {
        log.error(`Error al procesar un mensaje: ${err.stack ?? err.message}`);
        sendError(client, 'internal', 'Error interno del servidor.');
      }
    });
    ws.on('pong', () => {
      client.alive = true;
    });
    ws.on('error', (err) => log.debug(`Error de socket: ${err.message}`));
    ws.on('close', () => cleanup(client));
    return client;
  }

  // ---------- temporizadores ----------
  const pingTimer = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.ws.terminate();
        continue;
      }
      client.alive = false;
      try {
        client.ws.ping();
      } catch {
        // el socket ya se esta cerrando
      }
    }
  }, pingMs);
  pingTimer.unref?.();

  const sweepTimer = setInterval(() => {
    const t = now();
    for (const room of [...rooms.values()]) {
      if (t - room.lastActivity > idleMs) closeRoom(room, 'idle');
    }
    for (const [code, until] of closedCodes) {
      if (until <= t) closedCodes.delete(code);
    }
  }, sweepMs);
  sweepTimer.unref?.();

  return {
    attach,
    stats: () => ({ rooms: rooms.size, sockets: clients.size }),
    /** Cierra todos los sockets (apagado ordenado). */
    close() {
      clearInterval(pingTimer);
      clearInterval(sweepTimer);
      for (const client of [...clients]) {
        clearTimeout(client.helloTimer);
        try {
          client.ws.close(1001, 'server_shutdown');
        } catch {
          client.ws.terminate();
        }
      }
    },
  };
}
