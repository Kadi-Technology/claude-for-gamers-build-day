// shared/ui/leaderboard-widget.js · Panel de leaderboard en vivo.
// mountLeaderboard(el, { game, limit = 10, refreshMs = 15000, title, scope = 'event' })
// Pinta solo con textContent (el alias nunca se interpreta como marcado), muestra el estado
// "Sin conexión" y destaca el alias propio (cfg.profile). Trae sus propios estilos,
// así que sirve igual en el lobby y en la pantalla de fin de partida de los juegos.
import { getTop } from '../net/api.js';
import { getProfile } from './profile.js';

const STYLE_ID = 'cfg-lb-style';

const CSS = `
.cfg-lb{--_fg:var(--cfg-lb-fg,#f7efe3);--_muted:var(--cfg-lb-muted,#bfaed0);--_accent:var(--cfg-lb-accent,#ffb000);--_ok:var(--cfg-lb-ok,#4ade80);--_bad:var(--cfg-lb-bad,#fb7185);display:flex;flex-direction:column;gap:8px;min-width:0;color:var(--_fg);font:inherit;text-align:left}
.cfg-lb__head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:1.6rem}
.cfg-lb__title{margin:0;font-size:.95rem;font-weight:800;line-height:1.2;overflow-wrap:anywhere}
.cfg-lb__status{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:.7rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--_muted);white-space:nowrap}
.cfg-lb__dot{width:8px;height:8px;border-radius:50%;background:var(--_muted)}
.cfg-lb[data-state="ok"] .cfg-lb__dot{background:var(--_ok);box-shadow:0 0 0 0 rgba(74,222,128,.55);animation:cfg-lb-pulse 2s ease-out infinite}
.cfg-lb[data-state="ok"] .cfg-lb__status{color:var(--_ok)}
.cfg-lb[data-state="offline"] .cfg-lb__dot{background:var(--_bad)}
.cfg-lb[data-state="offline"] .cfg-lb__status{color:var(--_bad)}
@keyframes cfg-lb-pulse{0%{box-shadow:0 0 0 0 rgba(74,222,128,.55)}70%,100%{box-shadow:0 0 0 7px rgba(74,222,128,0)}}
.cfg-lb__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.cfg-lb__list[hidden],.cfg-lb__msg[hidden],.cfg-lb__retry[hidden]{display:none}
.cfg-lb__row{display:flex;align-items:center;gap:8px;min-height:26px;padding:3px 9px;border-radius:9px;background:rgba(255,255,255,.045);font-size:.88rem;line-height:1.2}
.cfg-lb__row.is-me{background:rgba(255,176,0,.17);box-shadow:inset 0 0 0 1.5px var(--_accent)}
.cfg-lb__rank{flex:0 0 1.7rem;text-align:center;font-weight:800;color:var(--_muted);font-variant-numeric:tabular-nums}
.cfg-lb__alias{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.cfg-lb__me{flex:0 0 auto;padding:1px 7px;border-radius:999px;background:var(--_accent);color:#1b0f00;font-size:.66rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
.cfg-lb__sub{flex:0 0 auto;font-size:.74rem;color:var(--_muted);white-space:nowrap}
.cfg-lb__score{flex:0 0 auto;min-width:3.2rem;text-align:right;font-weight:800;font-variant-numeric:tabular-nums;color:var(--_accent);white-space:nowrap}
.cfg-lb__msg{margin:0;padding:10px 4px;text-align:center;color:var(--_muted);font-size:.88rem}
.cfg-lb__foot{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:24px;font-size:.72rem;color:var(--_muted)}
.cfg-lb__retry{appearance:none;border:1px solid rgba(255,214,140,.35);background:transparent;color:var(--_accent);font:inherit;font-size:.72rem;font-weight:800;line-height:1.2;padding:2px 9px;border-radius:8px;cursor:pointer}
.cfg-lb__retry:hover{background:rgba(255,176,0,.14)}
.cfg-lb__retry:focus-visible{outline:2px solid var(--_accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.cfg-lb[data-state="ok"] .cfg-lb__dot{animation:none}}
`;

const MEDALS = ['🥇', '🥈', '🥉'];

function ensureStyles() {
  try {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  } catch {
    /* sin estilos el panel sigue siendo legible */
  }
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(n) {
  const v = num(n);
  return v === null ? '–' : Math.round(v).toLocaleString('es-MX');
}

/** Texto principal y secundario de cada fila según el juego. */
function describe(game, entry) {
  const meta = entry && typeof entry.meta === 'object' && entry.meta ? entry.meta : {};
  if (game === 'angel') {
    const wave = num(meta.wave);
    const kills = num(meta.kills);
    if (wave !== null) {
      return { main: `Oleada ${fmt(wave)}`, sub: kills !== null ? `${fmt(kills)} kills` : '' };
    }
    return { main: fmt(entry.score), sub: '' };
  }
  const dist = num(meta.distance);
  return { main: fmt(entry.score), sub: dist !== null ? `${fmt(dist)} m` : '' };
}

function cleanEntries(raw, limit) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const alias = typeof e.alias === 'string' ? e.alias : String(e.alias ?? '');
    if (!alias) continue;
    out.push({ rank: num(e.rank), alias, score: e.score, meta: e.meta });
    if (out.length >= limit) break;
  }
  return out;
}

const NOOP_API = Object.freeze({
  refresh: async () => {},
  rerender: () => {},
  pause: () => {},
  resume: () => {},
  destroy: () => {},
});

/**
 * @param {HTMLElement} el contenedor donde se pinta el panel
 * @param {{game:string, limit?:number, refreshMs?:number, title?:string, scope?:'event'|'all', alias?:string|(()=>string)}} [opts]
 * @returns {{refresh:()=>Promise<void>, rerender:()=>void, pause:()=>void, resume:()=>void, destroy:()=>void}}
 */
export function mountLeaderboard(el, opts = {}) {
  if (!el || typeof el.appendChild !== 'function') return NOOP_API;
  ensureStyles();

  const game = typeof opts.game === 'string' && opts.game ? opts.game : 'xochimilco';
  const limit = Math.min(100, Math.max(1, Math.floor(Number(opts.limit)) || 10));
  const refreshMs = opts.refreshMs === 0 || opts.refreshMs === false ? 0 : Math.max(3000, Number(opts.refreshMs) || 15000);
  const scope = opts.scope === 'all' ? 'all' : 'event';
  const title = typeof opts.title === 'string' ? opts.title : 'Clasificación';

  // ---- DOM (solo createElement + textContent) ----
  const root = make('div', 'cfg-lb');
  root.dataset.state = 'loading';
  root.dataset.game = game;
  const head = make('div', 'cfg-lb__head');
  if (title) head.appendChild(make('h3', 'cfg-lb__title', title));
  const status = make('span', 'cfg-lb__status');
  status.setAttribute('role', 'status');
  const dot = make('i', 'cfg-lb__dot');
  dot.setAttribute('aria-hidden', 'true');
  const statusText = make('span', '', 'Cargando…');
  status.append(dot, statusText);
  head.appendChild(status);
  const list = make('ol', 'cfg-lb__list');
  const msg = make('p', 'cfg-lb__msg', 'Cargando clasificación…');
  const foot = make('div', 'cfg-lb__foot');
  const noteLive = refreshMs ? `Se actualiza cada ${Math.round(refreshMs / 1000)} s` : '';
  const note = make('span', '', noteLive);
  const retry = make('button', 'cfg-lb__retry', 'Reintentar');
  retry.type = 'button';
  retry.hidden = true;
  foot.append(note, retry);
  list.hidden = true;
  root.append(head, list, msg, foot);
  el.replaceChildren(root);

  // ---- estado ----
  let entries = null; // últimos datos buenos
  let offline = false;
  let loaded = false;
  let inflight = false;
  let paused = false;
  let destroyed = false;
  let timer = 0;
  let lastSig = '';

  function myAlias() {
    try {
      const raw = typeof opts.alias === 'function' ? opts.alias() : opts.alias !== undefined ? opts.alias : (getProfile() || {}).alias;
      return String(raw ?? '').trim().toLowerCase();
    } catch {
      return '';
    }
  }

  function paintRows(me) {
    list.replaceChildren();
    entries.forEach((e, i) => {
      const li = make('li', 'cfg-lb__row');
      const rank = e.rank !== null && e.rank > 0 ? e.rank : i + 1;
      const isMe = me !== '' && e.alias.trim().toLowerCase() === me;
      if (isMe) li.classList.add('is-me');
      const rankEl = make('span', 'cfg-lb__rank', rank <= 3 ? MEDALS[rank - 1] : String(rank));
      rankEl.title = `Puesto ${rank}`;
      const aliasEl = make('span', 'cfg-lb__alias', e.alias);
      aliasEl.title = e.alias;
      li.append(rankEl, aliasEl);
      if (isMe) li.appendChild(make('span', 'cfg-lb__me', 'tú'));
      const d = describe(game, e);
      if (d.sub) li.appendChild(make('span', 'cfg-lb__sub', d.sub));
      li.appendChild(make('span', 'cfg-lb__score', d.main));
      list.appendChild(li);
    });
  }

  function render() {
    if (destroyed) return;
    const state = !loaded ? 'loading' : offline ? 'offline' : 'ok';
    root.dataset.state = state;
    statusText.textContent = state === 'loading' ? 'Cargando…' : state === 'offline' ? 'Sin conexión' : 'En vivo';

    const hasRows = !!entries && entries.length > 0;
    const me = myAlias();
    const sig = `${state}|${me}|${hasRows ? entries.map((e) => `${e.rank}:${e.alias}:${e.score}`).join(',') : ''}`;
    if (sig === lastSig) return;
    lastSig = sig;

    list.hidden = !hasRows;
    if (hasRows) paintRows(me);

    if (state === 'loading') {
      msg.textContent = 'Cargando clasificación…';
      msg.hidden = false;
    } else if (state === 'offline') {
      msg.textContent = 'Sin conexión con el servidor. Reintentando…';
      msg.hidden = hasRows;
    } else if (!hasRows) {
      msg.textContent = 'Aún no hay puntajes. ¡Sé el primero en el podio!';
      msg.hidden = false;
    } else {
      msg.hidden = true;
    }
    retry.hidden = state !== 'offline';
    note.textContent = state === 'offline' && hasRows ? 'Mostrando los últimos datos' : noteLive;
  }

  async function load() {
    if (inflight || destroyed) return;
    inflight = true;
    let res = null;
    try {
      res = await getTop(game, scope, limit);
    } catch {
      res = null;
    }
    inflight = false;
    if (destroyed) return;
    loaded = true;
    if (res) {
      entries = cleanEntries(res, limit);
      offline = false;
    } else {
      offline = true;
    }
    render();
  }

  function schedule() {
    clearTimeout(timer);
    timer = 0;
    if (destroyed || paused || !refreshMs || document.hidden) return;
    timer = setTimeout(tick, refreshMs);
  }

  async function tick() {
    await load();
    schedule();
  }

  function onVisibility() {
    if (document.hidden) {
      clearTimeout(timer);
      timer = 0;
    } else if (!paused && !destroyed) {
      tick();
    }
  }

  function onOnline() {
    if (!paused && !destroyed) tick();
  }

  const onRetry = () => {
    if (!destroyed) tick();
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  retry.addEventListener('click', onRetry);

  render();
  tick();

  return {
    refresh: () => (destroyed ? Promise.resolve() : tick()),
    rerender() {
      lastSig = '';
      render();
    },
    pause() {
      paused = true;
      clearTimeout(timer);
      timer = 0;
    },
    resume() {
      if (destroyed || !paused) return;
      paused = false;
      tick();
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      timer = 0;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      retry.removeEventListener('click', onRetry);
      el.replaceChildren();
    },
  };
}
