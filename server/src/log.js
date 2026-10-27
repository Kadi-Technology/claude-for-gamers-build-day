// Registro minimo a consola (journald en produccion). Nunca imprime secretos ni IPs por mensaje.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export function createLogger(level = 'info', sink = console) {
  const min = LEVELS[level] ?? LEVELS.info;
  const emit = (name, fn) => (...args) => {
    if (LEVELS[name] < min) return;
    fn.call(sink, `${new Date().toISOString()} [${name}]`, ...args);
  };
  return {
    debug: emit('debug', sink.log),
    info: emit('info', sink.log),
    warn: emit('warn', sink.warn),
    error: emit('error', sink.error),
  };
}

export const silentLogger = createLogger('silent');
