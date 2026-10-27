// gamers.kadi.technology -> origen AWS (EC2 cfg-buildday).
// Cloudflare termina TLS; el Worker reenvia HTTP y WebSocket al servidor de juego
// agregando X-Origin-Secret, que el origen exige en todo menos GET /api/health.
// El security group del origen solo admite los rangos IP de Cloudflare.

const HSTS = 'max-age=31536000';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

// Estaticos inmutables entre despliegues cortos: Cloudflare los guarda 5 min (igual que el max-age del origen).
// El HTML, /api/* y /ws nunca se guardan en la caché de borde.
const STATIC_EXT = /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|mp3|ogg|wav|map)$/i;

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), { status, headers: JSON_HEADERS });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    // wrangler secret put recibe el valor por stdin: se recortan saltos de línea finales por si llegaran.
    const originSecret = (env.ORIGIN_SECRET || '').trim();
    if (!env.ORIGIN || !originSecret) {
      return jsonError(503, 'El servicio todavía no está configurado. Inténtalo en un minuto.');
    }

    const isWebSocket = (request.headers.get('Upgrade') || '').toLowerCase() === 'websocket';
    const isApiOrWs = url.pathname.startsWith('/api/') || url.pathname === '/api' || url.pathname === '/ws';
    const target = new URL(url.pathname + url.search, env.ORIGIN);

    // new Request(url, request) copia metodo, cuerpo (en streaming) y cabeceras, y las deja editables.
    const upstream = new Request(target.toString(), request);
    const clientIp = request.headers.get('cf-connecting-ip') || '';
    upstream.headers.set('X-Origin-Secret', originSecret);
    upstream.headers.set('X-Forwarded-For', clientIp);
    upstream.headers.set('X-Real-IP', clientIp);
    upstream.headers.set('X-Forwarded-Proto', 'https');

    const cacheable =
      !isWebSocket && !isApiOrWs && (request.method === 'GET' || request.method === 'HEAD') && STATIC_EXT.test(url.pathname);
    const init = cacheable
      ? { cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': 300, '300-599': -1 } } }
      : undefined;

    let res;
    try {
      res = await fetch(upstream, init);
    } catch (err) {
      return jsonError(502, 'El servidor de juego no responde. Inténtalo en un minuto.');
    }

    // El apretón WebSocket (101) se devuelve tal cual para que Cloudflare enlace ambos sockets.
    if (isWebSocket || res.status === 101) return res;

    const out = new Response(res.body, res);
    out.headers.set('Strict-Transport-Security', HSTS);
    return out;
  },
};
