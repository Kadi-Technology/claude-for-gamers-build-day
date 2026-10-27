// Avisos breves (toasts) accesibles.
// Contrato: toast(texto, ms = 2000)
//   - Se pintan con textContent (nunca innerHTML) dentro de una región aria-live="polite" para lectores de pantalla.
//   - Si el mismo texto ya está visible, se reinicia su temporizador en vez de apilar copias (útil para avisos repetidos).
//   - Máximo 4 a la vez; el más viejo se retira.
//   - Devuelve una función para descartar el aviso antes de tiempo.
// Es autónomo: inyecta sus propios estilos y usa los tokens de theme.css si están cargados (con valores de respaldo).

const MAX_VISIBLE = 4;
const FADE_MS = 260;
const STYLE_ID = 'cfg-toast-style';
const HOST_ID = 'cfg-toast-host';

let host = null;
const live = []; // { el, text, timer, dismiss }

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = [
    '#' + HOST_ID + '{position:fixed;left:0;right:0;top:max(12px,env(safe-area-inset-top));display:flex;',
    'flex-direction:column;align-items:center;gap:8px;padding:0 16px;pointer-events:none;z-index:2147483000}',
    '.cfg-toast{max-width:min(92vw,520px);padding:10px 18px;border-radius:999px;text-align:center;overflow-wrap:anywhere;',
    'font:700 15px/1.3 var(--font,system-ui,-apple-system,"Segoe UI",sans-serif);color:var(--text,#f7f3ff);',
    'background:var(--night-2,#241341);border:1.5px solid var(--marigold,#ff9f1c);',
    'box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 18px rgba(255,159,28,.25);',
    'opacity:0;transform:translateY(-10px) scale(.98);transition:opacity ' + FADE_MS + 'ms ease,transform ' + FADE_MS + 'ms ease}',
    '.cfg-toast.in{opacity:1;transform:none}',
    '@media (prefers-reduced-motion:reduce){.cfg-toast{transition:none;transform:none}}',
  ].join('');
  document.head.appendChild(st);
}

function ensureHost() {
  if (typeof document === 'undefined') return null;
  if (host && host.isConnected) return host;
  const parent = document.body || document.documentElement;
  if (!parent) return null;
  injectStyle();
  host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'false');
    parent.appendChild(host);
  }
  return host;
}

// Crea la región viva en cuanto el DOM está listo: los lectores de pantalla anuncian mejor un contenedor ya existente.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureHost, { once: true });
  else ensureHost();
}

function remove(entry) {
  const i = live.indexOf(entry);
  if (i >= 0) live.splice(i, 1);
  clearTimeout(entry.timer);
  entry.el.classList.remove('in');
  setTimeout(() => {
    if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
  }, FADE_MS + 40);
}

export function toast(texto, ms = 2000) {
  const h = ensureHost();
  const text = String(texto === undefined || texto === null ? '' : texto).trim();
  if (!h || !text) return () => {};
  const life = Number.isFinite(ms) ? Math.max(400, ms) : 2000;

  const dup = live.find((t) => t.text === text);
  if (dup) {
    clearTimeout(dup.timer);
    dup.timer = setTimeout(dup.dismiss, life);
    return dup.dismiss;
  }

  while (live.length >= MAX_VISIBLE) remove(live[0]);

  const el = document.createElement('div');
  el.className = 'cfg-toast';
  el.textContent = text;
  h.appendChild(el);

  const entry = { el, text, timer: 0, dismiss: null };
  entry.dismiss = () => remove(entry);
  entry.timer = setTimeout(entry.dismiss, life);
  live.push(entry);

  // Forzar el cálculo de estilos antes de añadir la clase para que la transición de entrada se dispare.
  void el.offsetWidth;
  el.classList.add('in');

  return entry.dismiss;
}

export default toast;
