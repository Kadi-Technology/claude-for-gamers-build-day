// Punto de entrada: `node server/src/index.js` (o `npm start` dentro de server/).
import { loadConfig } from './config.js';
import { createLogger } from './log.js';
import { createApp } from './app.js';

const config = loadConfig();
const log = createLogger(config.logLevel);

const app = await createApp(config, { log });
const { port } = await app.listen(config.port, config.host);
log.info(
  `cfg-server ${config.version} escuchando en el puerto ${port} ` +
    `(store=${config.store}, raiz=${config.staticRoot}, origen protegido=${config.originSecret ? 'si' : 'no'})`,
);

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log.info(`${signal} recibido, cerrando`);
  const force = setTimeout(() => process.exit(1), 5000);
  force.unref();
  try {
    await app.close();
  } catch (err) {
    log.error(`Error al cerrar: ${err.message}`);
  }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Los manejadores de mensajes ya capturan sus errores; esto evita que un fallo inesperado tire todas las salas.
process.on('uncaughtException', (err) => log.error(`uncaughtException: ${err.stack ?? err.message}`));
process.on('unhandledRejection', (err) => log.error(`unhandledRejection: ${err?.stack ?? err}`));
