# 03 · Arquitectura y contratos

Este documento **congela los contratos** entre territorios para que los subagentes escriban en paralelo desde el minuto 0. Cambiar un contrato durante el build requiere un `CONTRACT_CHANGE_REQUEST` al orquestador, que decide (T3).

## 1. Principios
1. **Sin paso de build en el frontend:** ES modules nativos, sin CDN y sin dependencias. Hace falta servirlos por HTTP (el servidor del repo o `python -m http.server`), no con `file://`.
2. **Un solo proceso Node** sirve el sitio estático, `/api/*` (leaderboard) y `/ws` (salas). El single player no depende del servidor.
3. **El single player es 100 % cliente.** Si `/api` o `/ws` fallan, los dos juegos siguen jugables y avisan "sin conexión".
4. **Cooperativo con anfitrión autoritativo:** el navegador que crea la sala simula el mundo y el servidor solo **retransmite**, sin simular ni parsear las snapshots.
5. **Un dueño por archivo** en cada ola (ver §3).

## 2. Estructura del repo
```
/
├─ index.html                     Lobby dual
├─ lobby/        lobby.css · lobby.js
├─ shared/
│  ├─ engine/    loop.js · input.js · pool.js · spatial.js · sprites.js · audio.js
│  │             camera.js · rng.js · storage.js · debug.js · bus.js
│  ├─ ui/        theme.css · toast.js · leaderboard-widget.js · profile.js
│  └─ net/       api.js (cliente REST) · room.js (cliente WebSocket)
├─ games/
│  ├─ angel/       index.html · src/{config,main,state,skins,player,enemies,waves,
│  │               weapons,superweapons,abilities,pickups,hud,menus,coop}.js · src/maps/{reforma,tepito}.js
│  └─ xochimilco/  index.html · src/{config,main,state,track,patterns,obstacles,player,zones,hud,menus}.js
├─ server/       package.json · src/{index,static,rooms,leaderboard,validate,store-file,store-dynamo}.js · test/*.test.mjs
├─ infra/        cfn/stack.yaml · worker/{wrangler.toml,src/index.js} · deploy.ps1 · TEARDOWN.md
├─ tests/e2e/    lobby.e2e.mjs · angel.e2e.mjs · xochimilco.e2e.mjs · coop.e2e.mjs
└─ docs/
```

## 3. Territorios y dueños de archivo
| Territorio | Archivos | Ola | Tier inicial |
|---|---|---|---|
| ENG motor compartido | `shared/engine/*`, `shared/ui/theme.css`, `shared/ui/toast.js`, `shared/ui/profile.js` | W0 | T1 |
| SRV servidor | `server/**` | W0 | T1 |
| INF infraestructura | `infra/**` | W0 | T1 (incluye cfn-lint) |
| LOB lobby | `index.html`, `lobby/**`, `shared/ui/leaderboard-widget.js`, `shared/net/api.js` | W0 | T1 |
| ANG-W mundo | `games/angel/src/{maps/*,skins,player}.js` | W1 | T1 |
| ANG-C combate | `games/angel/src/{weapons,superweapons,abilities,pickups}.js` | W1 | T1 → T2 |
| ANG-G juego | `games/angel/index.html`, `games/angel/src/{config,main,state,enemies,waves,hud,menus}.js` | W1 | T1 → T2 (integrador del juego) |
| XOC Xochimilco | `games/xochimilco/**` | W1 | T1 |
| NET cooperativo | `shared/net/room.js`, `games/angel/src/coop.js` (+ ganchos acotados en `main.js` vía ANG-G) | W2 | **T2** |
| E2E pruebas | `tests/e2e/**` | W1–W2 | T1 |

## 4. Contrato del motor compartido (`shared/engine`)
Firmas congeladas. La implementación es libre siempre que respete la firma y la semántica.

```text
loop.js     createLoop({ update(dt), render(alpha), hz = 60 }) -> { start(), stop(), paused: bool }
            Timestep fijo con acumulador; dt acotado a 0.25 s al volver de otra pestaña.
input.js    createInput({ bindings }) -> { axis(): {x,y} (normalizado), aim(): {x,y}|null,
            down(action), pressed(action) (flanco del frame), setBindings(b), poll() }
            Acciones estándar: 'up','down','left','right','attack','ability1' (U),'ability2' (I),'slot1','slot2','slot3' (1/2/3),
            'jump','dive','pause','mute','confirm','back'. Teclado + Gamepad API (+ táctil vía addTouchControls(layout)).
pool.js     createPool(factory, size) -> { acquire(), release(obj), forEach(fn), count }
spatial.js  createGrid(cellSize) -> { clear(), insert(e), query(x,y,r, out[]) -> out, nearest(x,y,r, filter) }
            Las entidades exponen { x, y, r }.
sprites.js  sprite(key, w, h, drawFn(ctx)) -> HTMLCanvasElement en caché; emoji(char, size) -> canvas en caché
            Prohibido fillText por entidad y por frame.
camera.js   createCamera(viewW, viewH) -> { x, y, follow(target, dt), shake(intensity, ms), apply(ctx), worldToScreen(), screenToWorld() }
audio.js    sfx(name) con nombres 'shoot','hit','death','gem','levelup','boss','bell','splash','jump','dive','pickup','explosion'; setMuted(bool); muted
rng.js      createRng(seed) -> { next(), range(a,b), int(a,b), pick(arr) }   // determinista
storage.js  load(key, fallback), save(key, value)    // con try/catch; claves con prefijo 'cfg.'
debug.js    enabled (por ?debug=1 o F3); overlay(ctx, stats); hotkeys({ G, N, L, B, ... })
bus.js      on(evt, fn), off(evt, fn), emit(evt, payload)
```

**Eventos de bus** (Ángel Survivors): `enemy:killed {id,type,x,y,by}`, `player:hit {pid,dmg}`, `player:down {pid}`, `levelup {pid,options}`, `wave:start {n}`, `boss:spawn`, `super:spawn {id,type,x,y}`, `super:pickup {pid,type}`, `super:expire {pid}`.

**Perfil compartido** (`shared/ui/profile.js`): `getProfile() -> { alias, skin }`, `setProfile(p)`, guardado en la clave `cfg.profile`.

## 5. Estado de Ángel Survivors (forma congelada)
```text
state = {
  mode: 'solo' | 'host' | 'guest',  map: 'reforma' | 'tepito',  tick, time, wave, phase,
  players: Map<pid, { pid, alias, skin, x, y, r, hp, hpMax, lvl, xp, facing:{x,y},
                      weapons: [{ id, lvl, mastery }], active: 0..2,
                      super: null | { type, until, ammo }, prevActive, cooldowns:{ bell, dash }, down: bool }>,
  enemies: pool<{ id, type, x, y, r, hp, hpMax, vx, vy }>,
  projectiles: pool<…>, drops: pool<{ id, kind: 'gem'|'super', type, x, y, value }>, fx: pool<…>
}
```
- Solo `main.js` (ANG-G) avanza el estado. Los demás módulos exportan `update(state, dt, ctx)` y `render(ctx, state, cam)` puros sobre su parte.
- Las armas exportan un registro `WEAPONS[id] = { kind, cadence, onAttack(state, player, aim), onUpdate?, render? }` y las superarmas `SUPERS[type] = { duration, ammo?, onAttack, … }`.
- **Restaurar el arma tras una superarma:** `player.prevActive` se guarda al recoger y se restaura en `super:expire`. Nivel y maestría nunca se tocan.

## 6. API del leaderboard (`/api`)
```
GET  /api/health                                     -> 200 { ok: true, version, uptime }
GET  /api/leaderboard/:game?scope=event|all&limit=20 -> 200 [{ rank, alias, score, meta, ts }]
POST /api/leaderboard/:game                          -> 201 { rank, top: [...] } | 400 | 429
     body: { alias, score, runId, meta: { distance, zone, flowers, durationMs } }
```
- `:game` ∈ {`xochimilco`, `angel`}. Para `angel`: `score = oleada·1000 + kills`, con `meta = { wave, kills, map, players }`.
- **Validación:**
  - `alias`: 3–12 caracteres de `[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ _-]` y una lista básica de palabras bloqueadas.
  - `runId`: UUID único.
  - Plausibilidad: `durationMs ≥ distance / velocidadMax`, y `score ≤ distance + flowers·10·comboMax`.
  - Límite de 1 POST cada 10 s por IP y 300 por día; cuerpo de 2 KB como máximo.
- **`scope=event`** filtra los registros con `ts ≥ EVENT_START` (variable de entorno; por defecto `2026-10-26T17:30:00-06:00`).
- **Store** (interfaz): `put(game, entry)`, `top(game, scope, limit)`, `rankOf(game, score)`.
  - Implementaciones: `store-file` (desarrollo local, JSON con escritura atómica) y `store-dynamo` (producción).
  - Tabla DynamoDB `cfg-buildday-leaderboard`: PK `board` = `<game>#<scope>`, SK `sk` = `(1e9 - score)` con relleno de 10 dígitos + `#` + runId. Se escribe en los boards `event` y `all`. El top se lee con Query y `Limit`.

## 7. Protocolo en línea (`/ws`, JSON v1)
**Sobre de mensaje:** `{ "t": "<tipo>", ... }`. El servidor valida solo el sobre y el tamaño (≤ 32 KB) y **retransmite sin parsear** los tipos `snap`, `full`, `in`, `lvl` y `pick`.

| Dirección | `t` | Campos | Notas |
|---|---|---|---|
| C→S | `hello` | `v:1, alias, skin` | Primer mensaje obligatorio |
| C→S | `create` | `map, public` | Responde `room`; quien crea es el host |
| C→S | `join` | `code` | Errores: `full`, `not_found`, `closed` |
| C→S | `leave` | — | |
| S→C | `room` | `code, you, host, players:[{pid,alias,skin}]` | |
| S→C | `peer_join` / `peer_leave` | `pid, alias, skin` / `pid` | El host responde a `peer_join` con un `full` |
| S→C | `room_closed` | `reason: 'host_left'\|'idle'` | |
| S→C | `error` | `code, msg` | |
| guest→host | `in` | `seq, mx, my, ax, ay, b, slot` | 30 Hz o al cambiar; `b` = bitmask attack(1)/ability1(2)/ability2(4); `slot` = 0..2 |
| guest→host | `pick` | `opt` | Carta de level-up elegida |
| host→guests | `snap` | `tick, p:[[pid,x,y,hp,lvl,active,superType,flags]], e:[[id,type,x,y,hpPct]], d:[[id,kind,type,x,y]], fx:[[kind,x,y,a]], w:[wave,phase,bossHpPct]` | 15 Hz con enteros redondeados; máximo 220 enemigos en línea |
| host→guest | `full` | Estado completo serializado | Al entrar y cada 10 s |
| host→guest | `lvl` | `pid, options` | Menú de level-up de ese jugador |

- **Cliente invitado:** interpolación con un buffer de 100 ms; predicción local de su propio movimiento con corrección suave (lerp) hacia la posición del host. Proyectiles y partículas son cosméticos y se recrean a partir de `fx`.
- **Servidor:**
  - Códigos de 4 letras sin caracteres ambiguos y un máximo de 200 salas.
  - Ping cada 15 s; se cierra la sala tras 60 s sin host.
  - Límite de 60 mensajes por segundo por socket.
  - `/api/health` reporta las salas y sockets activos.
- **Capacidad:** cada sala de 4 genera unos 90 KB/s de subida del host y unos 270 KB/s de fan-out. Una t4g.small aguanta de sobra 20–40 salas simultáneas; el límite real es la transferencia (doc 04).

## 8. Pruebas y gates
| Gate | Comando | Verde si |
|---|---|---|
| Servidor | `cd server && npm test` (`node --test`) | Todas pasan: validate, rooms y leaderboard con store-file |
| Arranque E2E | `node tests/e2e/lobby.e2e.mjs <url>` | Lobby → Ángel → Lobby → Xochimilco → Lobby con 0 errores de consola |
| Juegos E2E | `angel.e2e.mjs`, `xochimilco.e2e.mjs` | Arrancan en debug, simulan 20 s de input (Y, U, I, O, salto, buceo) y 0 errores de consola |
| Cooperativo E2E | `coop.e2e.mjs <url>` | El navegador A crea sala y juega; B se une con el código a mitad de oleada; B ve los enemigos de A en ≤ 2 s; A ve a B moverse |
| Rendimiento | Modo debug en Ángel con 400 enemigos | ≥ 55 FPS en la laptop del evento |
| Infra | `cfn-lint infra/cfn/stack.yaml` | Sin errores |

Playwright usa el Chromium local: `%LOCALAPPDATA%\ms-playwright\chromium-1228\chrome-win64\chrome.exe` (el mismo que la E2E de Requiem).
