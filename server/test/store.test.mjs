// Contrato comun de los stores: store-file contra disco y store-dynamo contra un DocumentClient simulado.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createFileStore } from '../src/store-file.js';
import { createDynamoStore, sortKey } from '../src/store-dynamo.js';
import { removeDir, tmpDir } from './helpers.mjs';

const EVENT_START = Date.parse('2026-10-26T17:30:00-06:00');
const BEFORE = EVENT_START - 3_600_000;
const AFTER = EVENT_START + 3_600_000;

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entry = (n, score, ts = AFTER, alias = `Jugador${n}`) => ({ alias, score, runId: id(n), meta: { wave: 1 }, ts });

/** DocumentClient minimo: soporta solo los Get/Put/Query que usa store-dynamo (con paginacion en COUNT). */
function createFakeDocumentClient({ pageSize = 2 } = {}) {
  const items = new Map();
  const calls = [];
  const key = (board, sk) => `${board}\u0000${sk}`;
  return {
    items,
    calls,
    async send(command) {
      const input = command.input;
      calls.push({ name: command.constructor.name, input });
      assert.equal(input.TableName, 'cfg-buildday-leaderboard');
      if (command instanceof GetCommand) {
        return { Item: items.get(key(input.Key.board, input.Key.sk)) };
      }
      if (command instanceof PutCommand) {
        assert.ok(typeof input.Item.board === 'string' && typeof input.Item.sk === 'string');
        items.set(key(input.Item.board, input.Item.sk), { ...input.Item });
        return {};
      }
      if (command instanceof QueryCommand) {
        const board = input.ExpressionAttributeValues[':b'];
        let rows = [...items.values()].filter((i) => i.board === board).sort((a, b) => (a.sk < b.sk ? -1 : 1));
        if (input.KeyConditionExpression.includes('#sk < :sk')) {
          rows = rows.filter((i) => i.sk < input.ExpressionAttributeValues[':sk']);
        } else {
          assert.equal(input.KeyConditionExpression, '#b = :b');
        }
        if (input.Select === 'COUNT') {
          const start = input.ExclusiveStartKey ? rows.findIndex((i) => i.sk === input.ExclusiveStartKey.sk) + 1 : 0;
          const page = rows.slice(start, start + pageSize);
          const more = start + pageSize < rows.length;
          return { Count: page.length, LastEvaluatedKey: more ? { board, sk: page.at(-1).sk } : undefined };
        }
        assert.equal(input.ScanIndexForward, true);
        return { Items: rows.slice(0, input.Limit ?? rows.length) };
      }
      throw new Error(`Comando no soportado: ${command.constructor.name}`);
    },
  };
}

function storeContract(name, makeStore) {
  describe(name, () => {
    test('put y top: orden por puntaje y desempate por runId', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.put('angel', entry(1, 5100));
        await store.put('angel', entry(3, 7020));
        await store.put('angel', entry(2, 5100)); // empata con el 1; runId menor va primero
        await store.put('xochimilco', entry(4, 900));

        const top = await store.top('angel', 'all', 10);
        assert.deepEqual(
          top.map((e) => [e.runId, e.score]),
          [[id(3), 7020], [id(1), 5100], [id(2), 5100]],
        );
        assert.equal(top[0].alias, 'Jugador3');
        assert.deepEqual(top[0].meta, { wave: 1 });
        assert.equal(typeof top[0].ts, 'number');

        assert.equal((await store.top('angel', 'all', 2)).length, 2);
        assert.equal((await store.top('xochimilco', 'all', 10)).length, 1);
        assert.equal((await store.top('angel', 'event', 10)).length, 3);
      } finally {
        await cleanup();
      }
    });

    test('scope event solo incluye registros con ts >= EVENT_START', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.put('xochimilco', entry(1, 100, BEFORE));
        await store.put('xochimilco', entry(2, 90, AFTER));
        assert.deepEqual((await store.top('xochimilco', 'all', 10)).map((e) => e.runId), [id(1), id(2)]);
        assert.deepEqual((await store.top('xochimilco', 'event', 10)).map((e) => e.runId), [id(2)]);
        assert.equal(await store.rankOf('xochimilco', 90, 'event', id(2)), 1);
        assert.equal(await store.rankOf('xochimilco', 90, 'all', id(2)), 2);
      } finally {
        await cleanup();
      }
    });

    test('rankOf cuenta los mejores, con y sin desempate por runId', async () => {
      const { store, cleanup } = await makeStore();
      try {
        for (let n = 1; n <= 7; n += 1) await store.put('angel', entry(n, 1000 * n));
        await store.put('angel', entry(8, 4000));
        assert.equal(await store.rankOf('angel', 7000, 'all'), 1);
        assert.equal(await store.rankOf('angel', 4000, 'all'), 4); // sin runId: los iguales no cuentan
        assert.equal(await store.rankOf('angel', 4000, 'all', id(4)), 4);
        assert.equal(await store.rankOf('angel', 4000, 'all', id(8)), 5);
        assert.equal(await store.rankOf('angel', 1, 'all'), 9);
        assert.equal(await store.rankOf('angel', 999_999, 'all'), 1);
      } finally {
        await cleanup();
      }
    });

    test('put repetido con el mismo runId no duplica', async () => {
      const { store, cleanup } = await makeStore();
      try {
        assert.deepEqual(await store.put('angel', entry(1, 5000)), { added: true });
        assert.deepEqual(await store.put('angel', entry(1, 5000)), { added: false, existing: { score: 5000 } });
        assert.deepEqual(await store.put('angel', entry(1, 6000)), { added: false, existing: { score: 5000 } });
        assert.equal((await store.top('angel', 'all', 10)).length, 1);
        // El mismo runId en otro juego es otra partida.
        assert.deepEqual(await store.put('xochimilco', entry(1, 100)), { added: true });
      } finally {
        await cleanup();
      }
    });
  });
}

storeContract('store-file', async () => {
  const dir = tmpDir('cfg-store-');
  const store = createFileStore({ dir, eventStart: EVENT_START });
  return { store, cleanup: async () => { await store.flush(); removeDir(dir); } };
});

storeContract('store-dynamo (cliente simulado)', async () => {
  const client = createFakeDocumentClient();
  const store = createDynamoStore({ table: 'cfg-buildday-leaderboard', eventStart: EVENT_START, client });
  return { store, cleanup: async () => {} };
});

describe('store-file: persistencia en disco', () => {
  test('recarga lo guardado, escribe de forma atomica y conserva el orden', async () => {
    const dir = tmpDir('cfg-store-');
    try {
      const first = createFileStore({ dir, eventStart: EVENT_START });
      await Promise.all([1, 2, 3, 4, 5].map((n) => first.put('angel', entry(n, n * 1000))));
      await first.flush();

      assert.deepEqual(readdirSync(dir), ['leaderboard.json']); // sin temporales sueltos
      const onDisk = JSON.parse(readFileSync(path.join(dir, 'leaderboard.json'), 'utf8'));
      assert.equal(onDisk.games.angel.length, 5);

      const second = createFileStore({ dir, eventStart: EVENT_START });
      const top = await second.top('angel', 'all', 10);
      assert.deepEqual(top.map((e) => e.score), [5000, 4000, 3000, 2000, 1000]);
      assert.deepEqual(await second.put('angel', entry(5, 5000)), { added: false, existing: { score: 5000 } });
    } finally {
      removeDir(dir);
    }
  });

  test('un archivo corrupto se aparta y se arranca vacio', async () => {
    const dir = tmpDir('cfg-store-');
    try {
      writeFileSync(path.join(dir, 'leaderboard.json'), '{esto no es json');
      const store = createFileStore({ dir, eventStart: EVENT_START });
      assert.deepEqual(await store.top('angel', 'all', 10), []);
      assert.ok(readdirSync(dir).some((f) => f.startsWith('leaderboard.corrupt-')));
      await store.put('angel', entry(1, 1000));
      await store.flush();
      assert.equal(JSON.parse(readFileSync(path.join(dir, 'leaderboard.json'), 'utf8')).games.angel.length, 1);
    } finally {
      removeDir(dir);
    }
  });
});

describe('store-dynamo: forma de los elementos', () => {
  test('clave de ordenamiento: (1e9 - score) en 10 digitos + # + runId', () => {
    assert.equal(sortKey(0, id(1)), `1000000000#${id(1)}`);
    assert.equal(sortKey(5012, id(1)), `0999994988#${id(1)}`);
    assert.ok(sortKey(7000, id(1)) < sortKey(6000, id(1)));
  });

  test('escribe los boards all y event, mas la marca de deduplicacion', async () => {
    const client = createFakeDocumentClient();
    const store = createDynamoStore({ table: 'cfg-buildday-leaderboard', eventStart: EVENT_START, client });
    await store.put('xochimilco', entry(1, 1200, AFTER));
    await store.put('xochimilco', entry(2, 800, BEFORE));
    const boards = [...client.items.values()].map((i) => i.board).sort();
    assert.deepEqual(boards, ['run#xochimilco', 'run#xochimilco', 'xochimilco#all', 'xochimilco#all', 'xochimilco#event']);
    const stored = client.items.get(`xochimilco#event\u0000${sortKey(1200, id(1))}`);
    assert.deepEqual(
      { alias: stored.alias, score: stored.score, runId: stored.runId, game: stored.game, ts: stored.ts },
      { alias: 'Jugador1', score: 1200, runId: id(1), game: 'xochimilco', ts: AFTER },
    );
    // Solo usa PutItem, GetItem y Query (los permisos del rol de instancia).
    assert.deepEqual([...new Set(client.calls.map((c) => c.name))].sort(), ['GetCommand', 'PutCommand']);
    await store.top('xochimilco', 'event', 5);
    await store.rankOf('xochimilco', 1200, 'event', id(1));
    assert.deepEqual([...new Set(client.calls.map((c) => c.name))].sort(), ['GetCommand', 'PutCommand', 'QueryCommand']);
  });
});
