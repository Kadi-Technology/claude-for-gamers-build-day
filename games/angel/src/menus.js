// menus.js (ANG-G) - Pantallas de Ángel Survivors en DOM (GDD §1.2): título, menú principal, controles, récords,
// selección (carrusel de skins + escenarios), level-up, pausa y game over.
// Todo el texto se escribe con textContent (nunca innerHTML). Usa las clases de shared/ui/theme.css.

import { SKINS, skinSprite, drawSkinPreview } from './skins.js';
import { MAP_LIST, mapBackground } from './state.js';
import { CONFIG } from './config.js';

function el(tag, cls, text, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
  return n;
}

function button(text, cls, onClick) {
  const b = el('button', 'btn ' + (cls || ''), text, { type: 'button' });
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
}

const CONTROLS = [
  ['Moverse', ['W', 'A', 'S', 'D'], 'o las flechas'],
  ['Apuntar', ['Mouse'], 'o la dirección en la que miras (con asistencia)'],
  ['Atacar', ['Y'], 'mantenla para repetir; nada ataca solo'],
  ['Campanazo', ['U'], 'onda expansiva con empuje (8 s)'],
  ['Esquiva', ['I'], 'dash con invulnerabilidad (3 s)'],
  ['Arma de la mochila', ['1', '2', '3'], 'elige el espacio activo'],
  ['Pausa', ['P', 'Esc'], ''],
  ['Silencio', ['M'], ''],
];

/**
 * createMenus({ root, lobbyLink, getAlias, getScores, cb })
 *   root       contenedor DOM de las pantallas
 *   lobbyLink  <a> "← Lobby": flota arriba a la derecha y baja a la lista del menú principal
 *   getAlias() alias del jugador; getScores() top local ya ordenado
 *   cb: { onStart({skin,map}), onResume(), onRestart(), onQuit(), onPick(i), onSelectionChange({skin,map}) }
 */
export function createMenus({ root, lobbyLink, getAlias, getScores, cb }) {
  let current = null;
  let node = null;
  let prev = null; // pantalla a la que vuelve "Atrás"
  let raf = 0;
  const sel = { skin: SKINS[0].id, map: MAP_LIST[0].id };
  let levelUpCount = 0;

  function stopAnim() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function placeLobby(container) {
    if (!lobbyLink) return;
    if (container) {
      lobbyLink.className = 'btn btn-ghost';
      container.appendChild(lobbyLink);
    } else {
      lobbyLink.className = 'lobby-link';
      document.body.appendChild(lobbyLink);
    }
  }

  function focusables() {
    if (!node) return [];
    return Array.from(node.querySelectorAll('button:not([disabled]), a[href]'));
  }

  function focusFirst() {
    if (!node) return;
    const f = node.querySelector('[data-autofocus]') || focusables()[0];
    if (f && typeof f.focus === 'function') f.focus({ preventScroll: true });
  }

  function mount(name, n, container) {
    stopAnim();
    placeLobby(null);
    if (node && node.parentNode) node.parentNode.removeChild(node);
    node = n;
    current = name;
    (container || root).appendChild(n);
    root.classList.add('open');
    document.body.classList.toggle('menu-open', true);
    focusFirst();
  }

  function hide() {
    stopAnim();
    placeLobby(null);
    if (node && node.parentNode) node.parentNode.removeChild(node);
    node = null;
    current = null;
    root.classList.remove('open');
    document.body.classList.remove('menu-open');
    const a = document.activeElement;
    if (a && a !== document.body && typeof a.blur === 'function') a.blur();
  }

  // ---------------------------------------------------------------------
  // Título
  // ---------------------------------------------------------------------
  function showTitle() {
    prev = null;
    const o = el('section', 'overlay clear scr scr-title', null, { 'aria-label': 'Ángel Survivors' });
    const wrap = el('div', 'title-wrap');
    wrap.appendChild(el('div', 'deco', '💀 🌼 🦇 👻 🔔'));
    const logo = el('h1', 'logo');
    logo.appendChild(el('span', 'l1', 'ÁNGEL'));
    logo.appendChild(el('span', 'l2', 'SURVIVORS'));
    wrap.appendChild(logo);
    wrap.appendChild(el('p', 'tagline', 'Noche de Día de Muertos · Ciudad de México'));
    const go = button('Comenzar', 'btn-lg', () => showMain());
    go.setAttribute('data-autofocus', '1');
    wrap.appendChild(go);
    wrap.appendChild(el('p', 'press', 'Pulsa cualquier tecla o toca la pantalla'));
    wrap.appendChild(el('p', 'foot', 'Claude for Gamers · Build Day · 26 de octubre de 2026'));
    o.appendChild(wrap);
    o.addEventListener('pointerdown', (e) => {
      if (e.target === o || e.target === wrap) showMain();
    });
    mount('title', o);
  }

  // ---------------------------------------------------------------------
  // Menú principal
  // ---------------------------------------------------------------------
  function showMain() {
    prev = null;
    const o = el('section', 'overlay clear scr scr-main', null, { 'aria-label': 'Menú principal' });
    const wrap = el('div', 'panel-wrap');
    const logo = el('h2', 'logo small');
    logo.appendChild(el('span', 'l1', 'ÁNGEL'));
    logo.appendChild(el('span', 'l2', 'SURVIVORS'));
    wrap.appendChild(logo);
    const who = el('p', 'who muted');
    who.appendChild(document.createTextNode('Jugador: '));
    who.appendChild(el('b', null, getAlias()));
    wrap.appendChild(who);
    const list = el('div', 'menu');
    const solo = button('Jugar solo', 'btn-lg', () => showSelect('main'));
    solo.setAttribute('data-autofocus', '1');
    list.appendChild(solo);
    const online = button('', 'btn-lg btn-turquoise online', null);
    online.setAttribute('disabled', '');
    online.setAttribute('aria-disabled', 'true');
    online.appendChild(el('span', null, 'En línea'));
    online.appendChild(el('span', 'badge badge-magenta', 'Próximamente'));
    list.appendChild(online);
    list.appendChild(button('Controles', 'btn-ghost', () => showControls('main')));
    list.appendChild(button('Récords', 'btn-ghost', () => showRecords()));
    wrap.appendChild(list);
    o.appendChild(wrap);
    mount('main', o);
    placeLobby(list);
  }

  // ---------------------------------------------------------------------
  // Controles
  // ---------------------------------------------------------------------
  function showControls(from) {
    prev = from || 'main';
    const o = el('section', 'overlay scr scr-controls' + (from === 'pause' ? '' : ' clear'), null, { 'aria-label': 'Controles' });
    const wrap = el('div', 'card panel-wrap wide');
    wrap.appendChild(el('h2', 'title', 'Controles'));
    const tbl = el('div', 'ctl');
    for (const [name, keys, note] of CONTROLS) {
      const row = el('div', 'ctl-row');
      row.appendChild(el('span', 'ctl-name', name));
      const ks = el('span', 'ctl-keys');
      for (const k of keys) ks.appendChild(el('kbd', 'kbd', k));
      if (note) ks.appendChild(el('span', 'muted small', note));
      row.appendChild(ks);
      tbl.appendChild(row);
    }
    wrap.appendChild(tbl);
    wrap.appendChild(el('p', 'muted small', 'Cada pulsación de Y es un ataque. Las superarmas reemplazan temporalmente al arma activa.'));
    const back = button('← Atrás', '', () => back2());
    back.setAttribute('data-autofocus', '1');
    wrap.appendChild(back);
    o.appendChild(wrap);
    mount('controls', o);
  }

  // ---------------------------------------------------------------------
  // Récords
  // ---------------------------------------------------------------------
  function scoreTable(scores, highlight) {
    const t = el('div', 'scores');
    if (!scores.length) {
      t.appendChild(el('p', 'muted center', 'Aún no hay récords. ¡Sobrevive a la primera oleada!'));
      return t;
    }
    const head = el('div', 'score-row head');
    ['#', 'Jugador', 'Oleada', 'Bajas', 'Tiempo'].forEach((h) => head.appendChild(el('span', null, h)));
    t.appendChild(head);
    scores.forEach((s, i) => {
      const row = el('div', 'score-row' + (highlight && s.ts === highlight.ts && s.alias === highlight.alias ? ' me' : ''));
      row.appendChild(el('span', null, String(i + 1)));
      row.appendChild(el('span', 'who', s.alias));
      row.appendChild(el('span', null, String(s.wave)));
      row.appendChild(el('span', null, String(s.kills)));
      row.appendChild(el('span', null, fmtTime(s.time)));
      t.appendChild(row);
    });
    return t;
  }

  function showRecords() {
    prev = 'main';
    const o = el('section', 'overlay clear scr scr-records', null, { 'aria-label': 'Récords' });
    const wrap = el('div', 'card panel-wrap wide');
    wrap.appendChild(el('h2', 'title', 'Récords'));
    wrap.appendChild(el('p', 'muted small', 'Tus mejores partidas en este navegador (puntaje = oleada × 1000 + bajas).'));
    wrap.appendChild(scoreTable(getScores().slice(0, CONFIG.records.show), null));
    const back = button('← Atrás', '', () => back2());
    back.setAttribute('data-autofocus', '1');
    wrap.appendChild(back);
    o.appendChild(wrap);
    mount('records', o);
  }

  // ---------------------------------------------------------------------
  // Selección: skin + escenario
  // ---------------------------------------------------------------------
  function skinIndex() {
    const i = SKINS.findIndex((s) => s.id === sel.skin);
    return i < 0 ? 0 : i;
  }

  function showSelect(from) {
    prev = from || 'main';
    const o = el('section', 'overlay clear scr scr-select', null, { 'aria-label': 'Selección de héroe y escenario' });
    const wrap = el('div', 'card panel-wrap xwide');
    const grid = el('div', 'sel-grid');
    const left = el('div', 'sel-col');
    const right = el('div', 'sel-col');

    left.appendChild(el('h2', 'title', 'Elige a tu héroe'));
    const car = el('div', 'carousel');
    const prevB = button('‹', 'btn-ghost arrow', () => moveSkin(-1));
    prevB.setAttribute('aria-label', 'Skin anterior');
    const nextB = button('›', 'btn-ghost arrow', () => moveSkin(1));
    nextB.setAttribute('aria-label', 'Skin siguiente');
    const stage = el('div', 'stage');
    const cv = el('canvas', 'preview', null, { width: 200, height: 200, 'aria-hidden': 'true' });
    const nameEl = el('div', 'skin-name');
    const descEl = el('div', 'skin-desc muted small');
    stage.appendChild(cv);
    stage.appendChild(nameEl);
    stage.appendChild(descEl);
    car.appendChild(prevB);
    car.appendChild(stage);
    car.appendChild(nextB);
    left.appendChild(car);

    const dots = el('div', 'dots', null, { role: 'group', 'aria-label': 'Skins' });
    const dotBtns = SKINS.map((s) => {
      const b = el('button', 'dot', null, { type: 'button', 'aria-label': s.nombre, title: s.nombre });
      const c = el('canvas', null, null, { width: 44, height: 44, 'aria-hidden': 'true' });
      const g = c.getContext('2d');
      try {
        g.drawImage(skinSprite(s.id, 44), 0, 0, 44, 44);
      } catch (err) {
        g.fillStyle = s.color || '#888';
        g.fillRect(8, 8, 28, 28);
      }
      b.appendChild(c);
      b.addEventListener('click', () => setSkin(s.id));
      dots.appendChild(b);
      return b;
    });
    left.appendChild(dots);

    right.appendChild(el('h2', 'title', 'Elige el escenario'));
    const maps = el('div', 'maps', null, { role: 'group', 'aria-label': 'Escenarios' });
    const mapBtns = MAP_LIST.map((m, idx) => {
      const b = el('button', 'map-card', null, { type: 'button' });
      const c = el('canvas', 'thumb', null, { width: 240, height: 140, 'aria-hidden': 'true' });
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 240, 140);
      gr.addColorStop(0, '#2a1050');
      gr.addColorStop(1, '#6a1b62');
      g.fillStyle = gr;
      g.fillRect(0, 0, 240, 140);
      b.appendChild(c);
      const txt = el('span', 'map-txt');
      txt.appendChild(el('b', 'map-name', m.nombre));
      txt.appendChild(el('span', 'map-desc muted small', m.descripcion || ''));
      b.appendChild(txt);
      b.addEventListener('click', () => setMap(m.id));
      maps.appendChild(b);
      // El fondo se pinta una vez y se reutiliza en la partida; se difiere para no retrasar la pantalla.
      setTimeout(() => {
        if (node !== o) return;
        try {
          const bg = mapBackground(m);
          const ar = c.width / c.height;
          let sw = bg.width;
          let sh = bg.width / ar;
          if (sh > bg.height) {
            sh = bg.height;
            sw = bg.height * ar;
          }
          g.drawImage(bg, (bg.width - sw) / 2, (bg.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
        } catch (err) {
          /* se queda el degradado */
        }
      }, 40 + idx * 120);
      return b;
    });
    right.appendChild(maps);
    grid.appendChild(left);
    grid.appendChild(right);
    wrap.appendChild(grid);

    const row = el('div', 'row actions');
    row.appendChild(button('← Atrás', 'btn-ghost', () => back2()));
    const play = button('¡A jugar!', 'btn-lg', () => cb.onStart({ skin: sel.skin, map: sel.map }));
    play.setAttribute('data-autofocus', '1');
    row.appendChild(play);
    wrap.appendChild(row);
    o.appendChild(wrap);
    mount('select', o);

    function refresh() {
      const s = SKINS[skinIndex()];
      nameEl.textContent = s.nombre;
      descEl.textContent = s.desc || '';
      dotBtns.forEach((b, i) => b.classList.toggle('on', i === skinIndex()));
      mapBtns.forEach((b, i) => {
        const on = MAP_LIST[i].id === sel.map;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    function setSkin(id) {
      sel.skin = id;
      refresh();
      if (cb.onSelectionChange) cb.onSelectionChange({ skin: sel.skin, map: sel.map });
    }
    function moveSkin(d) {
      const i = (skinIndex() + d + SKINS.length) % SKINS.length;
      setSkin(SKINS[i].id);
    }
    function setMap(id) {
      sel.map = id;
      refresh();
      if (cb.onSelectionChange) cb.onSelectionChange({ skin: sel.skin, map: sel.map });
    }
    o._moveSkin = moveSkin;
    o._moveMap = (d) => {
      const i = MAP_LIST.findIndex((m) => m.id === sel.map);
      setMap(MAP_LIST[(i + d + MAP_LIST.length) % MAP_LIST.length].id);
    };
    refresh();

    // Vista previa animada del héroe elegido
    const g = cv.getContext('2d');
    const t0 = performance.now();
    const frame = (now) => {
      if (node !== o) return;
      const t = (now - t0) / 1000;
      g.clearRect(0, 0, cv.width, cv.height);
      const flip = Math.sin(t * 0.9) > 0 ? 1 : -1;
      try {
        drawSkinPreview(g, sel.skin, cv.width / 2, cv.height * 0.52, 150, t, 0, flip);
      } catch (err) {
        /* sin vista previa */
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------
  // Level-up
  // ---------------------------------------------------------------------
  function showLevelUp(info) {
    prev = null;
    const o = el('section', 'overlay scr scr-levelup', null, { 'aria-label': 'Subes de nivel' });
    const wrap = el('div', 'panel-wrap xwide center');
    wrap.appendChild(el('h2', 'title', '¡Nivel ' + info.level + '!'));
    wrap.appendChild(el('p', 'subtitle', 'Elige una mejora (teclas 1, 2 o 3)'));
    const cards = el('div', 'cards');
    info.options.forEach((opt, i) => {
      const b = el('button', 'upcard kind-' + (opt.kind || 'stat'), null, { type: 'button' });
      b.appendChild(el('span', 'up-key', String(i + 1)));
      b.appendChild(el('span', 'up-icon', opt.icon));
      b.appendChild(el('b', 'up-title', opt.titulo));
      b.appendChild(el('span', 'up-desc', opt.desc));
      if (opt.tag) b.appendChild(el('span', 'badge badge-marigold', opt.tag));
      b.addEventListener('click', () => cb.onPick(i));
      if (i === 0) b.setAttribute('data-autofocus', '1');
      cards.appendChild(b);
    });
    wrap.appendChild(cards);
    o.appendChild(wrap);
    levelUpCount = info.options.length;
    mount('levelup', o);
  }

  // ---------------------------------------------------------------------
  // Pausa
  // ---------------------------------------------------------------------
  function showPause() {
    prev = null;
    const o = el('section', 'overlay scr scr-pause', null, { 'aria-label': 'Pausa' });
    const wrap = el('div', 'panel-wrap');
    wrap.appendChild(el('h2', 'title center', 'Pausa'));
    const list = el('div', 'menu');
    const cont = button('Continuar', 'btn-lg', () => cb.onResume());
    cont.setAttribute('data-autofocus', '1');
    list.appendChild(cont);
    list.appendChild(button('Controles', 'btn-ghost', () => showControls('pause')));
    list.appendChild(button('Reiniciar partida', 'btn-ghost', () => cb.onRestart()));
    list.appendChild(button('Salir al menú', 'btn-ghost', () => cb.onQuit()));
    wrap.appendChild(list);
    wrap.appendChild(el('p', 'muted small center', 'P o Esc para continuar'));
    o.appendChild(wrap);
    mount('pause', o);
  }

  // ---------------------------------------------------------------------
  // Game over
  // ---------------------------------------------------------------------
  function showGameOver(sum) {
    prev = null;
    const o = el('section', 'overlay scr scr-over', null, { 'aria-label': 'Fin de la partida' });
    const wrap = el('div', 'card panel-wrap wide');
    wrap.appendChild(el('h2', 'title center', sum.newBest ? '¡Nuevo récord!' : '¡Has caído!'));
    wrap.appendChild(el('p', 'subtitle center', 'Llegaste a la oleada ' + sum.wave + ' con ' + sum.kills + ' bajas'));
    const grid = el('div', 'stats');
    const items = [
      ['Oleada', String(sum.wave)],
      ['Nivel', String(sum.lvl)],
      ['Bajas', String(sum.kills)],
      ['Tiempo', fmtTime(sum.time)],
      ['Jefas derrotadas', String(sum.bosses)],
      ['Daño total', String(Math.round(sum.damage))],
    ];
    for (const [k, v] of items) {
      const c = el('div', 'stat');
      c.appendChild(el('span', 'stat-v', v));
      c.appendChild(el('span', 'stat-k muted small', k));
      grid.appendChild(c);
    }
    wrap.appendChild(grid);
    wrap.appendChild(el('h3', 'sub-h', 'Top 5 de este navegador'));
    wrap.appendChild(scoreTable(sum.scores.slice(0, CONFIG.records.show), sum.entry));
    const row = el('div', 'row actions');
    const again = button('Jugar de nuevo', 'btn-lg', () => cb.onRestart());
    again.setAttribute('data-autofocus', '1');
    row.appendChild(again);
    row.appendChild(button('Menú principal', 'btn-ghost', () => cb.onQuit()));
    wrap.appendChild(row);
    o.appendChild(wrap);
    mount('gameover', o);
  }

  // ---------------------------------------------------------------------
  // Navegación
  // ---------------------------------------------------------------------
  function back2() {
    if (prev === 'pause') showPause();
    else showMain();
  }

  /** "Atrás" (Esc): true si la pantalla actual lo consumió. */
  function back() {
    if (current === 'controls' || current === 'records' || current === 'select') {
      back2();
      return true;
    }
    return false;
  }

  function isModifier(k) {
    return k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta' || k === 'CapsLock' || k === 'Tab' || k === 'F3' || k === 'F5' || k === 'F11' || k === 'F12';
  }

  /** Teclado de las pantallas. Devuelve true si la tecla se consumió. */
  function handleKey(e) {
    if (!current || e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key;
    if (current === 'title') {
      if (isModifier(k) || k === 'Escape') return false;
      if (k === 'Enter' || k === ' ') return false; // el botón enfocado ya reacciona
      showMain();
      return true;
    }
    if (current === 'levelup') {
      if (k === '1' || k === '2' || k === '3') {
        const i = Number(k) - 1;
        if (i < levelUpCount) {
          cb.onPick(i);
          return true;
        }
      }
    }
    if (current === 'select' && node) {
      if (k === 'ArrowLeft') {
        node._moveSkin(-1);
        e.preventDefault();
        return true;
      }
      if (k === 'ArrowRight') {
        node._moveSkin(1);
        e.preventDefault();
        return true;
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        node._moveMap(k === 'ArrowUp' ? -1 : 1);
        e.preventDefault();
        return true;
      }
    }
    if (k === 'ArrowUp' || k === 'ArrowDown' || ((k === 'ArrowLeft' || k === 'ArrowRight') && current === 'levelup')) {
      const list = focusables();
      if (list.length) {
        const i = list.indexOf(document.activeElement);
        const d = k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 1;
        const n = i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length;
        list[n].focus({ preventScroll: true });
        e.preventDefault();
        return true;
      }
    }
    return false;
  }

  return {
    get current() {
      return current;
    },
    get open() {
      return current !== null;
    },
    get selection() {
      return { skin: sel.skin, map: sel.map };
    },
    setSelection(s) {
      if (s && SKINS.some((x) => x.id === s.skin)) sel.skin = s.skin;
      if (s && MAP_LIST.some((m) => m.id === s.map)) sel.map = s.map;
    },
    showTitle,
    showMain,
    showControls,
    showRecords,
    showSelect,
    showLevelUp,
    showPause,
    showGameOver,
    hide,
    back,
    handleKey,
  };
}

