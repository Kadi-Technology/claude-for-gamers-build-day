import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_ALPHABET, withPid } from '../src/rooms.js';
import { connectWs, joinAs, sleep, startApp } from './helpers.mjs';

const CODE_RE = /^[A-HJ-NP-Z]{4}$/;

/** Host con sala creada. */
async function hostRoom(srv, alias = 'Anfitrion', map = 'reforma') {
  const host = await joinAs(srv.wsUrl, alias);
  host.send({ t: 'create', map, public: false });
  const room = await host.next('room');
  return { host, room };
}

async function guestJoin(srv, code, alias) {
  const guest = await joinAs(srv.wsUrl, alias);
  guest.send({ t: 'join', code });
  return guest;
}

async function withServer(overrides, fn) {
  const srv = await startApp(overrides);
  const clients = [];
  const track = (c) => {
    clients.push(c);
    return c;
  };
  try {
    await fn(srv, track);
  } finally {
    for (const c of clients) c.ws.terminate();
    await srv.stop();
  }
}

describe('protocolo de salas', () => {
  test('create responde room con codigo de 4 letras sin I/O/0/1; quien crea es el host', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv, 'Luchador', 'tepito');
      track(host);
      assert.match(room.code, CODE_RE);
      assert.equal(room.t, 'room');
      assert.equal(room.you, room.host);
      assert.equal(room.map, 'tepito');
      assert.deepEqual(room.players, [{ pid: room.you, alias: 'Luchador', skin: 'catrina' }]);
      assert.equal(CODE_ALPHABET.length, 24);
      assert.ok(!/[IO01]/.test(CODE_ALPHABET));
    });
  });

  test('los codigos son unicos y siempre validos', async () => {
    await withServer({ rooms: { maxRooms: 200 } }, async (srv, track) => {
      const codes = new Set();
      for (let i = 0; i < 40; i += 1) {
        const { host, room } = await hostRoom(srv, `Host${i}`);
        track(host);
        assert.match(room.code, CODE_RE);
        codes.add(room.code);
      }
      assert.equal(codes.size, 40);
      assert.equal(srv.app.rooms.stats().rooms, 40);
    });
  });

  test('join en cualquier momento: el invitado recibe room y el host peer_join', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      track(host);
      // Ya hay trafico en la sala antes de que entre el invitado.
      host.send({ t: 'snap', tick: 100, p: [] });

      const guest = track(await guestJoin(srv, room.code.toLowerCase(), 'Invitado'));
      const joined = await guest.next('room');
      assert.equal(joined.code, room.code);
      assert.equal(joined.host, room.host);
      assert.notEqual(joined.you, room.host);
      assert.equal(joined.map, 'reforma');
      assert.deepEqual(joined.players.map((p) => p.alias), ['Anfitrion', 'Invitado']);

      const peer = await host.next('peer_join');
      assert.deepEqual(peer, { t: 'peer_join', pid: joined.you, alias: 'Invitado', skin: 'catrina' });
      // El invitado no recibe su propio peer_join.
      await guest.none('peer_join');
    });
  });

  test('la sala admite 4 jugadores y el quinto recibe error full', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      track(host);
      const guests = [];
      for (let i = 1; i <= 3; i += 1) {
        const g = track(await guestJoin(srv, room.code, `Invitado${i}`));
        guests.push(g);
        await g.next('room');
      }
      const fifth = track(await guestJoin(srv, room.code, 'Quinto'));
      const err = await fifth.next('error');
      assert.equal(err.code, 'full');
      assert.ok(err.msg.length > 0);
      // Si alguien sale, vuelve a haber lugar.
      guests[0].send({ t: 'leave' });
      await host.next((m) => m.t === 'peer_leave');
      fifth.send({ t: 'join', code: room.code });
      const ok = await fifth.next('room');
      assert.equal(ok.players.length, 4);
    });
  });

  test('join con codigo inexistente o mal formado responde not_found', async () => {
    await withServer({}, async (srv, track) => {
      const c = track(await joinAs(srv.wsUrl, 'Perdido'));
      for (const code of ['ZZZZ', 'ab', 'AB12', 'IIII', '', null, 42]) {
        c.send({ t: 'join', code });
        const err = await c.next('error');
        assert.equal(err.code, 'not_found', `codigo ${JSON.stringify(code)}`);
      }
    });
  });

  test('relevo host -> invitados: snap llega identico a todos los invitados y no rebota al host', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      track(host);
      const g1 = track(await guestJoin(srv, room.code, 'Uno'));
      const g2 = track(await guestJoin(srv, room.code, 'Dos'));
      await g1.next('room');
      await g2.next('room');

      // Espacios y claves en un orden poco habitual: el servidor no debe tocar el texto.
      const raw = '{"t":"snap",  "tick":7,"p":[[1,10,20,100,1,0,0,0]],"e":[[5,1,300,200,100]],"w":[1,0,0] }';
      host.sendRaw(raw);
      const a = await g1.next('snap');
      const b = await g2.next('snap');
      assert.equal(a.__raw, raw);
      assert.equal(b.__raw, raw);
      await host.none('snap');
    });
  });

  test('relevo invitado -> host: in y pick llegan solo al host con el pid del remitente', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      track(host);
      const g1 = track(await guestJoin(srv, room.code, 'Uno'));
      const g2 = track(await guestJoin(srv, room.code, 'Dos'));
      const r1 = await g1.next('room');
      const r2 = await g2.next('room');

      g1.send({ t: 'in', seq: 1, mx: 1, my: 0, ax: 0, ay: 0, b: 1, slot: 0 });
      const in1 = await host.next('in');
      assert.equal(in1.pid, r1.you);
      assert.equal(in1.seq, 1);
      assert.equal(in1.b, 1);

      // Un pid falsificado por el cliente se pisa con el real.
      g2.send({ t: 'in', pid: r1.you, seq: 2, mx: 0, my: 1, ax: 0, ay: 0, b: 0, slot: 1 });
      const in2 = await host.next('in');
      assert.equal(in2.pid, r2.you);
      assert.equal(in2.slot, 1);

      g2.send({ t: 'pick', opt: 2 });
      const pick = await host.next('pick');
      assert.deepEqual(pick, { t: 'pick', opt: 2, pid: r2.you });

      await g1.none('in');
      await g2.none('in');
      await g2.none('pick');
    });
  });

  test('un invitado no puede hablar por el host ni el host por un invitado', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      track(host);
      const g1 = track(await guestJoin(srv, room.code, 'Uno'));
      const g2 = track(await guestJoin(srv, room.code, 'Dos'));
      await g1.next('room');
      await g2.next('room');

      g1.send({ t: 'snap', tick: 1 });
      g1.send({ t: 'full', state: {} });
      g1.send({ t: 'lvl', pid: 3, options: [1, 2, 3] });
      host.send({ t: 'in', seq: 1 });
      host.send({ t: 'pick', opt: 0 });
      await g2.none('snap');
      await g2.none('full');
      await g2.none('lvl');
      await host.none('in');
      await host.none('pick');
    });
  });

  test('full y lvl: con destinatario van solo a ese invitado; sin destinatario, a todos', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      track(host);
      const g1 = track(await guestJoin(srv, room.code, 'Uno'));
      const g2 = track(await guestJoin(srv, room.code, 'Dos'));
      const r1 = await g1.next('room');
      const r2 = await g2.next('room');

      host.send({ t: 'full', to: r2.you, state: { wave: 3 } });
      assert.deepEqual((await g2.next('full')).state, { wave: 3 });
      await g1.none('full');

      host.send({ t: 'lvl', pid: r1.you, options: ['a', 'b', 'c'] });
      assert.deepEqual((await g1.next('lvl')).options, ['a', 'b', 'c']);
      await g2.none('lvl');

      host.send({ t: 'full', state: { wave: 4 } });
      assert.deepEqual((await g1.next('full')).state, { wave: 4 });
      assert.deepEqual((await g2.next('full')).state, { wave: 4 });
      host.send({ t: 'lvl', options: [9] });
      await g1.next('lvl');
      await g2.next('lvl');
    });
  });

  test('peer_leave a los demas; los pid no se reutilizan', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      track(host);
      const g1 = track(await guestJoin(srv, room.code, 'Uno'));
      const g2 = track(await guestJoin(srv, room.code, 'Dos'));
      const r1 = await g1.next('room');
      await g2.next('room');

      g1.send({ t: 'leave' });
      assert.deepEqual(await host.next('peer_leave'), { t: 'peer_leave', pid: r1.you });
      assert.equal((await g2.next('peer_leave')).pid, r1.you);

      const g3 = track(await guestJoin(srv, room.code, 'Tres'));
      const r3 = await g3.next('room');
      assert.ok(r3.you > r1.you, 'el pid de quien entra despues nunca repite uno anterior');
      assert.equal(r3.players.length, 3);

      // Un socket que se cae tambien avisa.
      g2.ws.terminate();
      assert.equal((await host.next('peer_leave')).t, 'peer_leave');
    });
  });

  test('si el host sale, todos reciben room_closed host_left y la sala deja de existir', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      track(host);
      const g1 = track(await guestJoin(srv, room.code, 'Uno'));
      const g2 = track(await guestJoin(srv, room.code, 'Dos'));
      await g1.next('room');
      await g2.next('room');

      host.send({ t: 'leave' });
      assert.deepEqual(await g1.next('room_closed'), { t: 'room_closed', reason: 'host_left' });
      assert.deepEqual(await g2.next('room_closed'), { t: 'room_closed', reason: 'host_left' });
      await sleep(20);
      assert.equal(srv.app.rooms.stats().rooms, 0);

      const late = track(await joinAs(srv.wsUrl, 'Tarde'));
      late.send({ t: 'join', code: room.code });
      assert.equal((await late.next('error')).code, 'closed');

      // Los invitados siguen conectados y pueden crear su propia sala.
      g1.send({ t: 'create', map: 'tepito', public: false });
      assert.notEqual((await g1.next('room')).code, room.code);
    });
  });

  test('si el socket del host se cae, los invitados reciben room_closed host_left', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      const g1 = track(await guestJoin(srv, room.code, 'Uno'));
      await g1.next('room');
      host.ws.terminate();
      assert.equal((await g1.next('room_closed')).reason, 'host_left');
    });
  });

  test('errores de uso: sin hello, hello invalido, sala doble y mapa invalido', async () => {
    await withServer({}, async (srv, track) => {
      const c = track(await connectWs(srv.wsUrl));
      c.send({ t: 'create', map: 'reforma', public: false });
      assert.equal((await c.next('error')).code, 'hello_required');
      c.send({ t: 'join', code: 'ABCD' });
      assert.equal((await c.next('error')).code, 'hello_required');
      c.send({ t: 'snap', tick: 1 });
      assert.equal((await c.next('error')).code, 'hello_required');

      c.send({ t: 'hello', v: 2, alias: 'Valido', skin: 'catrina' });
      assert.equal((await c.next('error')).code, 'unsupported_version');
      c.send({ t: 'hello', v: 1, alias: 'x', skin: 'catrina' });
      assert.equal((await c.next('error')).code, 'bad_alias');
      c.send({ t: 'hello', v: 1, alias: 'Pendejo', skin: 'catrina' });
      assert.equal((await c.next('error')).code, 'bad_alias');

      c.send({ t: 'hello', v: 1, alias: 'Valido', skin: 'catrina' });
      c.send({ t: 'create', map: '../x', public: false });
      assert.equal((await c.next('error')).code, 'bad_request');
      c.send({ t: 'create', map: 'reforma', public: true });
      await c.next('room');
      c.send({ t: 'create', map: 'reforma', public: false });
      assert.equal((await c.next('error')).code, 'already_in_room');
      c.send({ t: 'join', code: 'ABCD' });
      assert.equal((await c.next('error')).code, 'already_in_room');
    });
  });

  test('mensajes mal formados: JSON roto, sin t, tipo desconocido y binarios', async () => {
    await withServer({}, async (srv, track) => {
      const c = track(await joinAs(srv.wsUrl, 'Valido'));
      c.sendRaw('{"t": ');
      assert.equal((await c.next('error')).code, 'bad_json');
      c.sendRaw('"solo texto"');
      assert.equal((await c.next('error')).code, 'bad_message');
      c.sendRaw('[1,2,3]');
      assert.equal((await c.next('error')).code, 'bad_message');
      c.send({ x: 1 });
      assert.equal((await c.next('error')).code, 'bad_message');
      c.send({ t: 'teletransportar' });
      assert.equal((await c.next('error')).code, 'unknown_type');
      c.ws.send(Buffer.from([1, 2, 3]));
      assert.equal((await c.next('error')).code, 'bad_message');
      // La conexion sigue viva y usable.
      c.send({ t: 'create', map: 'reforma', public: false });
      await c.next('room');
    });
  });

  test('tamano: hasta 32 KB pasa; mas de 32 KB da too_large sin cortar; mucho mas corta el socket', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      track(host);
      const guest = track(await guestJoin(srv, room.code, 'Uno'));
      await guest.next('room');

      const padded = (bytes) => {
        const head = '{"t":"snap","pad":"';
        const tail = '"}';
        return head + 'a'.repeat(bytes - head.length - tail.length) + tail;
      };
      host.sendRaw(padded(32 * 1024));
      assert.equal((await guest.next('snap')).__raw.length, 32 * 1024);

      host.sendRaw(padded(32 * 1024 + 1));
      assert.equal((await host.next('error')).code, 'too_large');
      await guest.none('snap');
      // Sigue conectado.
      host.send({ t: 'snap', tick: 2 });
      assert.equal((await guest.next('snap')).tick, 2);

      host.sendRaw(padded(200 * 1024));
      const closed = await host.closed;
      assert.equal(closed.code, 1009);
    });
  });

  test('limite de 60 mensajes por segundo por socket', async () => {
    await withServer({}, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      track(host);
      const guest = track(await guestJoin(srv, room.code, 'Uno'));
      await guest.next('room');

      for (let i = 0; i < 200; i += 1) host.send({ t: 'snap', tick: i });
      const err = await host.next('error');
      assert.equal(err.code, 'rate_limited');
      await sleep(200);
      const received = guest.inbox.filter((m) => m.t === 'snap').length;
      assert.ok(received >= 1 && received <= 120, `llegaron ${received} snapshots`);

      // Pasado un segundo vuelve a funcionar.
      await sleep(1100);
      host.send({ t: 'snap', tick: 9999 });
      assert.equal((await guest.next((m) => m.t === 'snap' && m.tick === 9999)).tick, 9999);
    });
  });

  test('se desconecta a quien insiste en pasarse del limite', async () => {
    await withServer({}, async (srv, track) => {
      const c = track(await joinAs(srv.wsUrl, 'Spammer'));
      const deadline = Date.now() + 8000;
      let closed = false;
      c.closed.then(() => {
        closed = true;
      });
      while (!closed && Date.now() < deadline) {
        for (let i = 0; i < 100; i += 1) {
          if (c.ws.readyState === 1) c.send({ t: 'leave' });
        }
        await sleep(100);
      }
      assert.equal(closed, true);
      assert.equal((await c.closed).code, 1008);
    });
  });

  test('maximo de salas: la que excede recibe server_full', async () => {
    await withServer({ rooms: { maxRooms: 3 } }, async (srv, track) => {
      for (let i = 0; i < 3; i += 1) track((await hostRoom(srv, `Host${i}`)).host);
      const extra = track(await joinAs(srv.wsUrl, 'Extra'));
      extra.send({ t: 'create', map: 'reforma', public: false });
      assert.equal((await extra.next('error')).code, 'server_full');
    });
  });

  test('el maximo de salas por defecto es 200', async () => {
    await withServer({}, async (srv) => {
      assert.equal(srv.config.rooms.maxRooms, 200);
      assert.equal(srv.config.rooms.maxPlayers, 4);
      assert.equal(srv.config.rooms.pingMs, 15_000);
      assert.equal(srv.config.rooms.messagesPerSecond, 60);
      assert.equal(srv.config.rooms.maxMessageBytes, 32 * 1024);
    });
  });

  test('una sala sin mensajes se cierra con room_closed idle', async () => {
    await withServer({ rooms: { idleMs: 250, sweepMs: 50 } }, async (srv, track) => {
      const { host, room } = await hostRoom(srv);
      track(host);
      const g1 = track(await guestJoin(srv, room.code, 'Uno'));
      await g1.next('room');
      assert.equal((await host.next('room_closed', 3000)).reason, 'idle');
      assert.equal((await g1.next('room_closed', 3000)).reason, 'idle');
      assert.equal(srv.app.rooms.stats().rooms, 0);
    });
  });

  test('la actividad mantiene viva la sala', async () => {
    await withServer({ rooms: { idleMs: 400, sweepMs: 50 } }, async (srv, track) => {
      const { host } = await hostRoom(srv);
      track(host);
      for (let i = 0; i < 8; i += 1) {
        host.send({ t: 'snap', tick: i });
        await sleep(100);
      }
      await host.none('room_closed', 10);
      assert.equal(srv.app.rooms.stats().rooms, 1);
    });
  });

  test('ping periodico: el cliente que responde sigue; el que no, se cierra', async () => {
    await withServer({ rooms: { pingMs: 80 } }, async (srv, track) => {
      const alive = track(await joinAs(srv.wsUrl, 'Vivo'));
      const dead = track(await joinAs(srv.wsUrl, 'Muerto', { autoPong: false }));
      let pings = 0;
      alive.ws.on('ping', () => {
        pings += 1;
      });
      await dead.closed;
      assert.ok(pings >= 1, `el cliente vivo recibio ${pings} pings`);
      assert.equal(alive.ws.readyState, 1);
    });
  });

  test('quien no manda hello a tiempo es desconectado', async () => {
    await withServer({ rooms: { helloTimeoutMs: 120 } }, async (srv, track) => {
      const c = track(await connectWs(srv.wsUrl));
      const err = await c.next('error');
      assert.equal(err.code, 'hello_timeout');
      assert.equal((await c.closed).code, 1008);
    });
  });
});

describe('withPid', () => {
  test('anade el pid como ultima clave, sin parsear, y prevalece sobre uno falsificado', () => {
    assert.equal(withPid('{"t":"in","seq":1}', 3), '{"t":"in","seq":1,"pid":3}');
    assert.equal(withPid('{"t":"pick"}\n', 2), '{"t":"pick","pid":2}\n');
    assert.deepEqual(JSON.parse(withPid('{"t":"in","pid":99,"seq":1}', 3)), { t: 'in', pid: 3, seq: 1 });
    assert.equal(withPid('no es json', 1), null);
    assert.equal(withPid('{"t":"in"} basura', 1), null);
  });
});
