// Servidor de estaticos acotado a STATIC_ROOT (docs/07 seccion 4).
// Bloquea path traversal, archivos ocultos y las carpetas server/, infra/, .git/, docs/ y tests/.
import { createReadStream, realpathSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { sendText } from './http.js';
import { silentLogger } from './log.js';

const BLOCKED_DIRS = new Set(['server', 'infra', 'docs', 'tests', 'node_modules']);
// Caracteres que Windows trata de forma especial en nombres (flujos alternos, comodines, etc.).
const BAD_SEGMENT_CHARS = /[\u0000-\u001f:*?"<>|~\\]/;

export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
});

/** Parte la ruta en segmentos seguros. Devuelve null si algo en ella no debe servirse. */
export function safeSegments(decodedPath) {
  const segments = [];
  for (const segment of decodedPath.split('/')) {
    if (segment === '') continue;
    if (segment === '.' || segment === '..') return null;
    if (segment.length > 255) return null;
    if (segment.startsWith('.')) return null;
    if (BAD_SEGMENT_CHARS.test(segment)) return null;
    if (segment.endsWith('.') || segment.endsWith(' ')) return null;
    segments.push(segment);
  }
  if (segments.length > 0 && BLOCKED_DIRS.has(segments[0].toLowerCase())) return null;
  if (segments.some((s) => s.toLowerCase() === 'node_modules')) return null;
  return segments;
}

function notFound(res) {
  sendText(res, 404, 'No encontrado');
}

export function createStatic({ root, log = silentLogger }) {
  // La version nativa expande nombres cortos 8.3 de Windows igual que fsp.realpath, asi las rutas son comparables.
  const rootReal = realpathSync.native(root);
  const rootPrefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;

  const within = (candidate) => candidate === rootReal || candidate.startsWith(rootPrefix);

  /** true si la ruta real (tras resolver enlaces) cae en una carpeta bloqueada o fuera de la raiz. */
  function blockedReal(realFile) {
    if (!within(realFile)) return true;
    const rel = path.relative(rootReal, realFile).split(path.sep);
    return rel.length > 0 && BLOCKED_DIRS.has(rel[0].toLowerCase());
  }

  async function statOrNull(file) {
    try {
      return await fsp.stat(file);
    } catch {
      return null;
    }
  }

  async function serve(req, res, { pathname, search }) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Método no permitido', { Allow: 'GET, HEAD' });
      return;
    }
    if (!pathname.startsWith('/')) {
      sendText(res, 400, 'Petición inválida');
      return;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      sendText(res, 400, 'Petición inválida');
      return;
    }
    const segments = safeSegments(decoded);
    if (segments === null) {
      notFound(res);
      return;
    }

    let file = path.join(rootReal, ...segments);
    if (!within(file)) {
      notFound(res);
      return;
    }
    let st = await statOrNull(file);
    if (st?.isDirectory()) {
      if (!pathname.endsWith('/') && segments.length > 0) {
        // Las rutas relativas de index.html necesitan la barra final.
        const location = `/${segments.map(encodeURIComponent).join('/')}/${/^\?[\w=&%.,-]*$/.test(search) ? search : ''}`;
        res.writeHead(308, { Location: location, 'Cache-Control': 'no-cache', 'Content-Length': 0 });
        res.end();
        return;
      }
      file = path.join(file, 'index.html');
      st = await statOrNull(file);
    }
    if (!st || !st.isFile()) {
      notFound(res);
      return;
    }

    let real;
    try {
      real = await fsp.realpath(file);
    } catch {
      notFound(res);
      return;
    }
    if (blockedReal(real)) {
      notFound(res);
      return;
    }

    const ext = path.extname(real).toLowerCase();
    const type = MIME_TYPES[ext] ?? 'application/octet-stream';
    const isHtml = ext === '.html' || ext === '.htm';
    const etag = `W/"${st.size.toString(16)}-${Math.trunc(st.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': type,
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=300',
      'Last-Modified': st.mtime.toUTCString(),
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    };

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    pipeline(createReadStream(real), res, (err) => {
      if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') log.warn(`Error al servir ${segments.join('/')}: ${err.message}`);
    });
  }

  return { serve, root: rootReal };
}
