// Store de produccion en DynamoDB (docs/03 seccion 6, docs/04 seccion 4). Misma interfaz que store-file.js.
//
// Tabla `cfg-buildday-leaderboard` (on-demand): PK `board` (S), SK `sk` (S).
//   board = "<game>#<scope>" con scope event|all. sk = (1e9 - score) con 10 digitos + "#" + runId,
//   asi una consulta ascendente devuelve el puntaje mas alto primero (empates por runId).
//   Ademas se guarda una marca de deduplicacion: board = "run#<game>", sk = runId.
// Permisos usados por el rol de instancia: PutItem, GetItem y Query (no hace falta DeleteItem ni Scan).
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const SCORE_BASE = 1e9;

export function sortKey(score, runId) {
  return `${String(SCORE_BASE - score).padStart(10, '0')}#${runId}`;
}

function toEntry(item) {
  return { alias: item.alias, score: item.score, runId: item.runId, meta: item.meta ?? {}, ts: item.ts };
}

/**
 * @param {object} options
 * @param {string} options.table
 * @param {string} [options.region]
 * @param {number} options.eventStart  ms desde epoch
 * @param {{send: Function}} [options.client]  cliente de documentos; se inyecta en las pruebas
 */
export function createDynamoStore({ table, region = 'us-east-1', eventStart, client }) {
  const doc =
    client ??
    DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
      marshallOptions: { removeUndefinedValues: true },
    });

  const board = (game, scope) => `${game}#${scope}`;

  return {
    kind: 'dynamo',

    async put(game, entry) {
      const dedupeKey = { board: `run#${game}`, sk: entry.runId };
      const seen = await doc.send(new GetCommand({ TableName: table, Key: dedupeKey, ConsistentRead: true }));
      if (seen.Item) return { added: false, existing: { score: seen.Item.score } };

      const sk = sortKey(entry.score, entry.runId);
      const base = {
        sk,
        game,
        alias: entry.alias,
        score: entry.score,
        runId: entry.runId,
        meta: entry.meta,
        ts: entry.ts,
      };
      await doc.send(new PutCommand({ TableName: table, Item: { board: board(game, 'all'), ...base } }));
      if (entry.ts >= eventStart) {
        await doc.send(new PutCommand({ TableName: table, Item: { board: board(game, 'event'), ...base } }));
      }
      // La marca va al final: si algo fallo antes, el reintento vuelve a escribir las mismas claves.
      await doc.send(
        new PutCommand({ TableName: table, Item: { ...dedupeKey, score: entry.score, ts: entry.ts } }),
      );
      return { added: true };
    },

    async top(game, scope, limit) {
      const out = await doc.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: '#b = :b',
          ExpressionAttributeNames: { '#b': 'board' },
          ExpressionAttributeValues: { ':b': board(game, scope) },
          ScanIndexForward: true,
          Limit: limit,
          ConsistentRead: true,
        }),
      );
      return (out.Items ?? []).map(toEntry);
    },

    async rankOf(game, score, scope = 'event', runId) {
      // Cuenta los elementos que van antes: sk menor que "<puntaje>" (estrictamente mayores)
      // o que "<puntaje>#<runId>" (incluye empates con runId menor).
      const bound = runId === undefined ? String(SCORE_BASE - score).padStart(10, '0') : sortKey(score, runId);
      let ahead = 0;
      let startKey;
      do {
        const input = {
          TableName: table,
          KeyConditionExpression: '#b = :b AND #sk < :sk',
          ExpressionAttributeNames: { '#b': 'board', '#sk': 'sk' },
          ExpressionAttributeValues: { ':b': board(game, scope), ':sk': bound },
          Select: 'COUNT',
          ConsistentRead: true,
        };
        if (startKey) input.ExclusiveStartKey = startKey;
        const out = await doc.send(new QueryCommand(input));
        ahead += out.Count ?? 0;
        startKey = out.LastEvaluatedKey;
      } while (startKey);
      return ahead + 1;
    },

    async flush() {},
  };
}
