// Menús en DOM: título, cómo jugar, récords, pausa, fin de partida y pantalla ESCAPASTE.
// Todo el texto dinámico (alias incluido) se pinta con textContent.

import { el, add, clear, fmt } from './dom.js';
import { ALIAS_RE, WORLD, ZONES, NET } from './config.js';
import { obstacleIcon } from './obstacles.js';
import { axolotlFace } from './art.js';

const MATRIX = [
  ['trajinera', 'Trajinera', 1, 1, 0],
  ['red', 'Red de pesca', 1, 0, 0],
  ['garza', 'Garza (avisa con sombra)', 1, 1, 0],
  ['lirio', 'Lirio acuático', 1, 1, 1],
  ['tronco', 'Tronco de ahuejote', 0, 0, 1],
  ['cerca', 'Cerca de chinampa', 0, 0, 1],
  ['remolino', 'Remolino', 0, 0, 1],
  ['carpa', 'Carpa saltarina', 1, 1, 0],
];

const CONTROLS = [
  ['Cambiar de carril', 'A / D · ← / →'],
  ['Saltar (0.7 s en el aire)', 'W · ↑ · Espacio'],
  ['Bucear (0.8 s, gasta oxígeno)', 'S · ↓ · Shift'],
  ['Pausa · Silencio', 'P / Esc · M'],
];

function chip(label, ok) {
  return el('span', `chip ${ok ? 'ok' : 'no'}`, `${ok ? '✔' : '✘'} ${label}`);
}

function button(label, cls, onClick, attrs) {
  const b = el('button', `btn ${cls || ''}`.trim(), label, { type: 'button', ...(attrs || {}) });
  b.addEventListener('click', onClick);
  return b;
}

function lobbyLink() {
  return el('a', 'btn ghost', '← Lobby', { href: '../../' });
}

/** Lista numerada de récords (alias con textContent). */
function lbList(rows, me) {
  const ol = el('ol', 'lb');
  rows.forEach((r, i) => {
    const mine = me && r.alias === me.alias && Number(r.score) === Number(me.score);
    const li = el('li', `lb-row${mine ? ' me' : ''}`);
    const rank = r.rank !== undefined && r.rank !== null ? r.rank : i + 1;
    const dist = r.meta && Number.isFinite(Number(r.meta.distance)) ? r.meta.distance : r.distance;
    add(
      li,
      el('span', 'lb-rank', String(rank)),
      el('span', 'lb-alias', String(r.alias)),
      el('span', 'lb-score', fmt(Number(r.score) || 0)),
      el('span', 'lb-meta', dist !== undefined && dist !== null ? `${fmt(Number(dist))} m` : ''),
    );
    ol.appendChild(li);
  });
  return ol;
}

export function createMenus(root, api) {
  const layer = el('div', 'menus');
  layer.hidden = true;
  root.appendChild(layer);

  let current = null;
  let token = 0; // invalida respuestas de red de pantallas anteriores
  let resultBox = null;
  let resultStats = null;
  let aliasInput = null;
  let aliasErr = null;

  function panel(cls) {
    clear(layer);
    const p = el('div', `panel ${cls || ''}`.trim());
    layer.appendChild(p);
    layer.hidden = false;
    return p;
  }

  function focusPrimary() {
    requestAnimationFrame(() => {
      const target = layer.querySelector('.btn.primary') || layer.querySelector('.btn');
      if (target && !layer.hidden) {
        try {
          target.focus({ preventScroll: true });
        } catch {
          /* sin foco */
        }
      }
    });
  }

  // ---------------------------------------------------------------- título
  function showTitle() {
    const p = panel('title');
    const art = el('canvas', 'title-art', null, { width: '200', height: '150', 'aria-hidden': 'true' });
    const g = art.getContext('2d');
    if (g) {
      g.fillStyle = 'rgba(255,214,64,0.28)';
      g.beginPath();
      g.arc(100, 78, 70, 0, Math.PI * 2);
      g.fill();
      axolotlFace(g, 100, 84, 52, 0.5);
    }
    add(
      p,
      art,
      el('div', 'kicker', 'EL ESCAPE DE'),
      el('h1', 'logo', 'XOCHIMILCO'),
      el('p', 'lead', 'Un ajolote, tres carriles y 2000 m de canales. ¡Salta, bucea y escapa!'),
    );
    const field = el('label', 'field');
    add(field, el('span', null, 'Tu alias (3 a 12 caracteres)'));
    aliasInput = el('input', null, null, {
      type: 'text',
      maxlength: '12',
      autocomplete: 'nickname',
      spellcheck: 'false',
      placeholder: 'Ajolote',
      'aria-label': 'Tu alias',
    });
    aliasInput.value = api.getAlias();
    aliasInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        startRun();
      }
    });
    aliasInput.addEventListener('input', () => {
      aliasErr.textContent = '';
    });
    aliasErr = el('p', 'err', '', { role: 'alert' });
    add(field, aliasInput);
    add(p, field, aliasErr);
    add(p, button('¡A nadar!', 'primary big', startRun));
    const row = el('div', 'row');
    add(row, button('Cómo jugar', '', () => show('howto')), button('Récords', '', () => show('records')));
    add(p, row, lobbyLink());
    add(p, el('p', 'foot', 'Claude for Gamers · Build Day · 26 de octubre de 2026'));
    focusPrimary();
  }

  function startRun() {
    const alias = (aliasInput ? aliasInput.value : '').trim();
    if (!ALIAS_RE.test(alias)) {
      aliasErr.textContent = 'Usa de 3 a 12 caracteres: letras, números, espacios, guion o guion bajo.';
      aliasInput.focus();
      return;
    }
    api.start(alias);
  }

  // ---------------------------------------------------------------- cómo jugar
  function showHowto() {
    const p = panel('howto');
    add(p, el('h2', null, 'Cómo jugar'));
    const grid = el('div', 'howto-grid');
    const c1 = el('section', 'card');
    add(c1, el('h3', null, 'Controles'));
    const dl = el('dl', 'keys');
    for (const [a, b] of CONTROLS) add(dl, el('dt', null, a), el('dd', null, b));
    add(c1, dl);
    add(
      c1,
      el('p', 'small', 'Táctil: desliza ← → para cambiar de carril, ↑ para saltar y ↓ para bucear.'),
      el('p', 'small', 'Gamepad: cruceta o stick para el carril · A salta · B bucea · Start pausa.'),
      el('p', 'small', 'Saltar y bucear se excluyen: bajar en el aire acelera la caída.'),
    );
    const c2 = el('section', 'card');
    add(c2, el('h3', null, 'Obstáculos'));
    const tbl = el('div', 'obs');
    for (const [kind, name, lane, dive, jump] of MATRIX) {
      const row = el('div', 'obs-row');
      const icon = obstacleIcon(kind, 44);
      icon.className = 'obs-icon';
      add(row, icon, el('span', 'obs-name', name), chip('carril', lane), chip('bucear', dive), chip('saltar', jump));
      tbl.appendChild(row);
    }
    add(c2, tbl);
    add(grid, c1, c2);
    add(p, grid);
    const tips = el('ul', 'tips');
    add(
      tips,
      el('li', null, 'Tronco, cerca y remolino ocupan los 3 carriles: ¡solo se esquivan saltando!'),
      el('li', null, 'Los arcos de flores en el aire te enseñan cuándo saltar. 🌼 = puntos × combo.'),
      el('li', null, `Los ajolotitos dan vida extra (máximo ${3}). El Chinampa Dash te hace invulnerable 3 s.`),
      el('li', null, `Llega a ${fmt(WORLD.goal)} m para escapar. Después puedes seguir en modo infinito.`),
    );
    add(p, tips, button('Volver', 'primary', () => show('title')));
    focusPrimary();
  }

  // ---------------------------------------------------------------- récords
  function showRecords() {
    const p = panel('records');
    add(p, el('h2', null, 'Récords'));
    const global = el('section', 'card');
    add(global, el('h3', null, `Top ${NET.topN} del evento`));
    const gBox = el('div', 'lb-box', 'Cargando…');
    add(global, gBox);
    const local = el('section', 'card');
    add(local, el('h3', null, 'Tus mejores en este dispositivo'));
    renderLocal(local);
    add(p, global, local, button('Volver', 'primary', () => show('title')));
    focusPrimary();
    const my = ++token;
    api.fetchTop().then((rows) => {
      if (my !== token || current !== 'records') return;
      clear(gBox);
      if (!rows) gBox.textContent = 'Sin conexión: no se pudo cargar el top del evento.';
      else if (rows.length === 0) gBox.textContent = 'Aún no hay puntajes. ¡Sé el primero!';
      else gBox.appendChild(lbList(rows.slice(0, NET.topN), null));
    });
  }

  function renderLocal(host, me) {
    const rows = api.localTop();
    if (!rows.length) {
      host.appendChild(el('p', 'small', 'Todavía no hay partidas guardadas.'));
      return;
    }
    host.appendChild(lbList(rows.slice(0, NET.localN), me));
  }

  // ---------------------------------------------------------------- pausa
  function showPause() {
    const p = panel('pause');
    add(p, el('h2', null, 'Pausa'), el('p', 'lead', 'El agua te espera.'));
    const col = el('div', 'col');
    const mute = button(api.isMuted() ? 'Activar sonido' : 'Silenciar', '', () => {
      api.toggleMute();
      mute.textContent = api.isMuted() ? 'Activar sonido' : 'Silenciar';
    });
    add(col, button('Reanudar', 'primary big', () => api.resume()), button('Reiniciar', '', () => api.restart()), mute, button('Salir al título', '', () => api.title()));
    add(p, col, lobbyLink());
    focusPrimary();
  }

  // ---------------------------------------------------------------- fin de partida / escapaste
  function statBox(label, value) {
    const b = el('div', 'stat');
    add(b, el('span', 'stat-v', value), el('span', 'stat-l', label));
    return b;
  }

  function statsGrid(st) {
    const g = el('div', 'stats');
    add(
      g,
      statBox('Puntaje', fmt(st.score)),
      statBox('Distancia', `${fmt(st.distance)} m`),
      statBox('Flores', fmt(st.flowers)),
      statBox('Mejor combo', `×${st.bestCombo}`),
    );
    return g;
  }

  function showEnd(kind, data) {
    const victory = kind === 'victory';
    const p = panel(victory ? 'end victory' : 'end');
    const st = data.stats;
    resultStats = st;
    if (victory) {
      add(p, el('div', 'kicker', '¡LO LOGRASTE!'), el('h1', 'logo win', 'ESCAPASTE'), el('p', 'lead', `Cruzaste los ${fmt(WORLD.goal)} m de Xochimilco. ¡Eres el ajolote más rápido del canal!`));
    } else if (kind === 'final') {
      add(p, el('div', 'kicker', st.won ? '¡ESCAPASTE Y SIGUIERON LOS CANALES!' : 'FIN DEL ESCAPE'), el('h2', null, st.won ? 'Gran carrera' : '¡Te atraparon!'), el('p', 'lead', `Llegaste a la zona ${st.zone}: ${ZONES[st.zone - 1].nombre}.`));
    }
    add(p, statsGrid(st));
    if (victory) {
      const col = el('div', 'col');
      add(
        col,
        button('Seguir nadando (modo infinito)', 'primary big', () => api.continueEndless()),
        button('Terminar y publicar mi puntaje', '', () => api.finish()),
        button('Jugar de nuevo', '', () => api.restart()),
      );
      add(p, col, lobbyLink());
      resultBox = null;
      focusPrimary();
      return;
    }
    resultBox = el('div', 'result');
    add(p, resultBox);
    renderResult(data.result || { status: 'skipped' });
    const row = el('div', 'row');
    add(row, button('Jugar de nuevo', 'primary big', () => api.restart()), button('Título', '', () => api.title()));
    add(p, row, lobbyLink());
    focusPrimary();
  }

  function renderResult(res) {
    if (!resultBox) return;
    clear(resultBox);
    const status = el('p', `status ${res.status}`);
    switch (res.status) {
      case 'sending':
        status.textContent = 'Enviando tu puntaje al leaderboard…';
        break;
      case 'ok':
        status.textContent = res.rank ? `¡Eres el #${fmt(res.rank)} del evento!` : 'Puntaje publicado en el leaderboard.';
        break;
      case 'offline':
        status.textContent = 'Sin conexión: tu puntaje quedó guardado en este dispositivo.';
        break;
      case 'skipped':
        status.textContent = res.note || 'Puntaje no publicado.';
        break;
      default:
        status.textContent = '';
    }
    resultBox.appendChild(status);
    if (res.top && res.top.length) {
      add(resultBox, el('h3', null, `Top ${NET.topN} del evento`), lbList(res.top.slice(0, NET.topN), resultStats ? { alias: resultStats.alias, score: resultStats.score } : null));
    }
    const loc = el('div', 'local');
    add(loc, el('h3', null, 'Tus mejores aquí'));
    renderLocal(loc, resultStats ? { alias: resultStats.alias, score: resultStats.score } : null);
    resultBox.appendChild(loc);
  }

  // ---------------------------------------------------------------- API
  function show(name, data) {
    token++;
    current = name;
    switch (name) {
      case 'title':
        showTitle();
        break;
      case 'howto':
        showHowto();
        break;
      case 'records':
        showRecords();
        break;
      case 'pause':
        showPause();
        break;
      case 'victory':
        showEnd('victory', data);
        break;
      case 'gameover':
        showEnd('final', data);
        break;
      default:
        hide();
    }
  }

  function hide() {
    token++;
    current = null;
    layer.hidden = true;
    clear(layer);
    resultBox = null;
  }

  function updateResult(res) {
    if (current === 'gameover') renderResult(res);
  }

  function focusables() {
    return Array.from(layer.querySelectorAll('button:not([disabled]),a[href],input'));
  }

  function move(dir) {
    const list = focusables();
    if (!list.length) return;
    let i = list.indexOf(document.activeElement);
    i = i < 0 ? 0 : (i + dir + list.length) % list.length;
    list[i].focus({ preventScroll: true });
  }

  /** Activa el elemento enfocado (gamepad) o, si no hay, el botón principal. */
  function activate() {
    const a = document.activeElement;
    if (a && layer.contains(a) && (a.tagName === 'BUTTON' || a.tagName === 'A')) {
      a.click();
      return;
    }
    const prim = layer.querySelector('.btn.primary');
    if (prim) prim.click();
  }

  function focusIsOnControl() {
    const a = document.activeElement;
    return !!(a && layer.contains(a) && (a.tagName === 'BUTTON' || a.tagName === 'A' || a.tagName === 'INPUT'));
  }

  return {
    show,
    hide,
    updateResult,
    move,
    activate,
    focusIsOnControl,
    get current() {
      return current;
    },
    get visible() {
      return !layer.hidden;
    },
  };
}
