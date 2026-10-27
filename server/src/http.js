// Utilidades HTTP compartidas: respuestas JSON, lectura acotada del cuerpo, IP del cliente y secreto de origen.
import { createHash, timingSafeEqual } from 'node:crypto';

export function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) {
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}

export function sendText(res, status, text, headers = {}) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(text);
}

/**
 * Lee el cuerpo completo con un tope de bytes.
 * @returns {Promise<{ok:true, text:string} | {ok:false, status:number, error:string, msg:string}>}
 */
export function readBody(req, limit) {
  return new Promise((resolve) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      resolve({ ok: false, status: 413, error: 'too_large', msg: `El cuerpo supera ${limit} bytes.` });
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('close', onClose);
      resolve(result);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limit) {
        finish({ ok: false, status: 413, error: 'too_large', msg: `El cuerpo supera ${limit} bytes.` });
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => finish({ ok: true, text: Buffer.concat(chunks).toString('utf8') });
    const onError = () => finish({ ok: false, status: 400, error: 'bad_body', msg: 'No se pudo leer el cuerpo.' });
    const onClose = () => finish({ ok: false, status: 400, error: 'bad_body', msg: 'Conexión cerrada antes de tiempo.' });
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('close', onClose);
  });
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

/** Compara el header X-Origin-Secret con el secreto configurado en tiempo constante. */
export function hasValidOriginSecret(req, secret) {
  if (!secret) return false;
  const presented = req.headers['x-origin-secret'];
  if (typeof presented !== 'string' || presented.length === 0) return false;
  return timingSafeEqual(digest(presented), digest(secret));
}

const IP_RE = /^[0-9a-fA-F:.%]{2,64}$/;

function cleanIp(value) {
  if (typeof value !== 'string') return null;
  let ip = value.trim();
  if (ip.startsWith('::ffff:') && ip.includes('.')) ip = ip.slice(7);
  return IP_RE.test(ip) ? ip : null;
}

/**
 * IP del cliente para el limite de tasa. CF-Connecting-IP o X-Forwarded-For solo se creen cuando
 * ORIGIN_SECRET esta configurado y la peticion lo presenta (viene del Worker de Cloudflare).
 */
export function clientIp(req, originSecret) {
  if (originSecret && hasValidOriginSecret(req, originSecret)) {
    const cf = cleanIp(req.headers['cf-connecting-ip']);
    if (cf) return cf;
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string') {
      const first = cleanIp(xff.split(',')[0]);
      if (first) return first;
    }
  }
  return cleanIp(req.socket?.remoteAddress) ?? 'unknown';
}

/** Ruta de una URL de peticion sin query ni fragmento. No usa `new URL` para evitar `//host/ruta`. */
export function splitUrl(rawUrl) {
  const url = typeof rawUrl === 'string' ? rawUrl : '/';
  const hash = url.indexOf('#');
  const noHash = hash >= 0 ? url.slice(0, hash) : url;
  const q = noHash.indexOf('?');
  return {
    pathname: q >= 0 ? noHash.slice(0, q) : noHash,
    search: q >= 0 ? noHash.slice(q) : '',
  };
}
