// Verifica que store-dynamo arma peticiones validas con el SDK real de AWS (lib-dynamodb) contra un
// endpoint local falso: no sale a internet ni usa credenciales reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createDynamoStore, sortKey } from '../src/store-dynamo.js';

const EVENT_START = Date.parse('2026-10-26T17:30:00-06:00');
const RUN_ID = '00000000-0000-4000-8000-000000000001';

function startFakeDynamo(respond) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const target = String(req.headers['x-amz-target'] ?? '');
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      requests.push({ op: target.split('.').pop(), body, contentType: req.headers['content-type'] });
      const payload = respond(target.split('.').pop(), body);
      res.writeHead(200, { 'Content-Type': 'application/x-amz-json-1.0', 'x-amzn-RequestId': 'test' });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port }));
  });
}

test('put, top y rankOf generan peticiones DynamoDB validas y leen las respuestas', async () => {
  const fake = await startFakeDynamo((op) => {
    if (op === 'GetItem') return {};
    if (op === 'PutItem') return {};
    if (op === 'Query') {
      return {
        Count: 2,
        Items: [
          {
            board: { S: 'angel#event' },
            sk: { S: sortKey(7000, RUN_ID) },
            alias: { S: 'Catrina' },
            score: { N: '7000' },
            runId: { S: RUN_ID },
            meta: { M: { wave: { N: '7' }, map: { S: 'tepito' } } },
            ts: { N: String(EVENT_START + 1000) },
          },
        ],
      };
    }
    throw new Error(`operacion inesperada ${op}`);
  });
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: 'us-east-1',
      endpoint: `http://127.0.0.1:${fake.port}`,
      credentials: { accessKeyId: 'AKIDTESTONLY', secretAccessKey: 'solo-para-pruebas-locales' },
      maxAttempts: 1,
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  try {
    const store = createDynamoStore({ table: 'cfg-buildday-leaderboard', eventStart: EVENT_START, client });
    const entry = { alias: 'Catrina', score: 7000, runId: RUN_ID, meta: { wave: 7, map: 'tepito' }, ts: EVENT_START + 1000 };
    assert.deepEqual(await store.put('angel', entry), { added: true });

    const ops = fake.requests.map((r) => r.op);
    assert.deepEqual(ops, ['GetItem', 'PutItem', 'PutItem', 'PutItem']);
    const [get, putAll, putEvent, putMark] = fake.requests.map((r) => r.body);
    assert.deepEqual(get.Key, { board: { S: 'run#angel' }, sk: { S: RUN_ID } });
    assert.equal(get.ConsistentRead, true);
    assert.equal(putAll.TableName, 'cfg-buildday-leaderboard');
    assert.equal(putAll.Item.board.S, 'angel#all');
    assert.equal(putAll.Item.sk.S, `0999993000#${RUN_ID}`);
    assert.equal(putAll.Item.score.N, '7000');
    assert.equal(putAll.Item.alias.S, 'Catrina');
    assert.deepEqual(putAll.Item.meta, { M: { wave: { N: '7' }, map: { S: 'tepito' } } });
    assert.equal(putEvent.Item.board.S, 'angel#event');
    assert.equal(putMark.Item.board.S, 'run#angel');

    const top = await store.top('angel', 'event', 5);
    assert.deepEqual(top, [{ alias: 'Catrina', score: 7000, runId: RUN_ID, meta: { wave: 7, map: 'tepito' }, ts: EVENT_START + 1000 }]);
    const query = fake.requests.at(-1).body;
    assert.equal(fake.requests.at(-1).op, 'Query');
    assert.equal(query.KeyConditionExpression, '#b = :b');
    assert.deepEqual(query.ExpressionAttributeNames, { '#b': 'board' });
    assert.deepEqual(query.ExpressionAttributeValues, { ':b': { S: 'angel#event' } });
    assert.equal(query.Limit, 5);
    assert.equal(query.ScanIndexForward, true);
    assert.equal(query.ConsistentRead, true);

    assert.equal(await store.rankOf('angel', 7000, 'event', RUN_ID), 3); // Count 2 + 1
    const rank = fake.requests.at(-1).body;
    assert.equal(rank.KeyConditionExpression, '#b = :b AND #sk < :sk');
    assert.deepEqual(rank.ExpressionAttributeNames, { '#b': 'board', '#sk': 'sk' });
    assert.equal(rank.ExpressionAttributeValues[':sk'].S, `0999993000#${RUN_ID}`);
    assert.equal(rank.Select, 'COUNT');
    assert.equal(rank.ExclusiveStartKey, undefined);
  } finally {
    client.destroy();
    await new Promise((resolve) => fake.server.close(resolve));
  }
});

test('createDynamoStore por defecto construye su cliente sin llamar a AWS', () => {
  const store = createDynamoStore({ table: 'cfg-buildday-leaderboard', region: 'us-east-1', eventStart: EVENT_START });
  assert.equal(store.kind, 'dynamo');
  assert.equal(typeof store.put, 'function');
  assert.equal(typeof store.top, 'function');
  assert.equal(typeof store.rankOf, 'function');
});
