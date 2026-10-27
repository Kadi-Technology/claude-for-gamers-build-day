// Caché de sprites pre-renderizados. Regla del proyecto: PROHIBIDO fillText por entidad y por frame;
// el texto/emoji se dibuja una sola vez aquí y luego se estampa con drawImage.
// Contrato:
//   sprite(key, w, h, drawFn(ctx)) -> HTMLCanvasElement en caché (si ya existe con ese key y tamaño, se devuelve tal cual)
//   emoji(char, size)              -> canvas cuadrado de size x size en caché, con el glifo centrado y ajustado al cuadro
// Extras: flipX(canvas) (copia volteada en horizontal, en caché), clearSprites(), spriteCount().

const cache = new Map();
const flipped = new WeakMap();

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

function makeCanvas(w, h) {
  let c;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
  } else if (typeof OffscreenCanvas !== 'undefined') {
    c = new OffscreenCanvas(1, 1);
  } else {
    throw new Error('sprites.js necesita un entorno con canvas');
  }
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function sprite(key, w, h, drawFn) {
  const hit = cache.get(key);
  const cw = Math.max(1, Math.ceil(w));
  const ch = Math.max(1, Math.ceil(h));
  if (hit && hit.width === cw && hit.height === ch) return hit;
  const c = makeCanvas(cw, ch);
  const ctx = c.getContext('2d');
  if (ctx && typeof drawFn === 'function') drawFn(ctx, c);
  cache.set(key, c);
  return c;
}

// Fracción del cuadro que ocupa el lado mayor del glifo (deja un margen para sombras y antialias).
const EMOJI_FILL = 0.94;
let work = null; // lienzo de trabajo reutilizable para medir la tinta real del glifo

function workCanvas(side) {
  if (!work) {
    work = makeCanvas(side, side);
  } else if (work.width < side || work.height < side) {
    work.width = side;
    work.height = side;
  }
  return work;
}

export function emoji(char, size = 32) {
  const s = Math.max(2, Math.round(size));
  const key = 'emoji:' + char + ':' + s;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  if (g) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    let drawn = false;
    try {
      // 1) Se dibuja el glifo grande en un lienzo de trabajo y se mide su tinta real.
      const side = Math.ceil(s * 2.6);
      const wc = workCanvas(side);
      const w = wc.getContext('2d', { willReadFrequently: true });
      w.clearRect(0, 0, wc.width, wc.height);
      w.textAlign = 'center';
      w.textBaseline = 'middle';
      w.font = Math.round(s * 1.3) + 'px ' + EMOJI_FONT;
      w.fillText(char, side / 2, side / 2);
      const data = w.getImageData(0, 0, side, side).data;
      let x0 = side;
      let y0 = side;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < side; y++) {
        const row = y * side * 4;
        for (let x = 0; x < side; x++) {
          if (data[row + x * 4 + 3] > 16) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      // 2) Se reduce al cuadro final: lado mayor = EMOJI_FILL * s, centrado en la tinta.
      if (x1 >= x0 && y1 >= y0) {
        const bw = x1 - x0 + 1;
        const bh = y1 - y0 + 1;
        const k = (s * EMOJI_FILL) / Math.max(bw, bh);
        g.drawImage(wc, x0, y0, bw, bh, s / 2 - (bw * k) / 2, s / 2 - (bh * k) / 2, bw * k, bh * k);
        drawn = true;
      }
    } catch {
      drawn = false; // sin getImageData: se usa el trazado directo
    }
    if (!drawn) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = Math.round(s * 0.82) + 'px ' + EMOJI_FONT;
      g.fillText(char, s / 2, s / 2 + s * 0.04);
    }
  }
  cache.set(key, c);
  return c;
}

export function flipX(src) {
  let out = flipped.get(src);
  if (out) return out;
  out = makeCanvas(src.width, src.height);
  const g = out.getContext('2d');
  if (g) {
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
  }
  flipped.set(src, out);
  return out;
}

export function clearSprites() {
  cache.clear();
}

export function spriteCount() {
  return cache.size;
}

export default { sprite, emoji, flipX, clearSprites, spriteCount };
