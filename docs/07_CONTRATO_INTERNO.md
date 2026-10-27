# 07 · Contrato interno del build (congelado al iniciar la ola W1)

Complementa el doc 03. Si algo choca, manda este documento.

## 1. Reglas de código (todos los territorios)
- **Frontend:** ES modules nativos con imports **relativos**, por ejemplo `../../shared/engine/loop.js` desde `games/angel/src/`. Sin dependencias, sin CDN y sin build. Se sirve desde la **raíz del repo**.
- **Textos de UI** en español con acentos correctos.
- **Gráficos:** solo formas de canvas y emojis pre-renderizados con `sprites.js`.
- **Números de balance** en el `config.js` de cada juego.
- **Prohibido:** `eval`, `innerHTML` con datos del usuario (el alias se pinta con `textContent`) y peticiones a hosts externos.

## 2. Contrato interno de Ángel Survivors (`games/angel/src/`)
`main.js` (ANG-G) es el **único** que avanza el estado, reconstruye `state.grid` (`spatial.createGrid`) en cada tick y construye la `api` que reciben los demás módulos:

```text
api = {
  rng,                                   // createRng(seed)
  map,                                   // definición del mapa activo
  damageEnemy(enemy, dmg, srcPid, weaponId),  // aplica daño, knockback leve, números de daño, maestría (llama weapons.addMastery) y muerte
  enemiesNear(x, y, r, out) -> out,     // consulta state.grid
  nearestEnemy(x, y, r) -> enemy|null,
  addXp(player, value),
  spawnFx(kind, x, y, a),               // kind: 'hit'|'death'|'petal'|'explosion'|'ring'|'slash'|'beam'|'fire'|'splash'
  sfx(name), shake(intensity, ms), hitstop(ms), toast(text)
}
```

| Archivo (dueño) | Exporta |
|---|---|
| `world.js` (ANG-W) | `collideWithMap(e, map)` empuja `{x,y,r}` fuera de los obstáculos y dentro de los bordes · `isFree(map, x, y, r)` · `randomFreePoint(map, rng, cx, cy, minDist, maxDist) -> {x,y}` |
| `maps/reforma.js`, `maps/tepito.js` (ANG-W) | `export default { id, nombre, descripcion, w, h, spawn:{x,y}, obstacles:[{type:'circle',x,y,r,kind}\|{type:'rect',x,y,w,h,kind}], drawBackground(ctx) /* una vez, en offscreen de w×h */, drawObstacles(ctx, cam) /* opcional */ }` |
| `skins.js` (ANG-W) | `SKINS = [{ id, nombre }]` (ids: `luchador`, `catrina`, `charro`, `calaverita`, `chinelo`, `mariachi`) · `skinSprite(id, size) -> canvas` en caché |
| `player.js` (ANG-W) | `createPlayer({pid, alias, skin, x, y})` con la forma del doc 03 §5, más `weapons: [{id:'estaca',lvl:1,mastery:0}, null, null]`, `active: 0`, `cooldowns: { attack:0, bell:0, dash:0 }`, `iframes` y `dashT` · `updatePlayer(state, p, inp, dt, api)`: movimiento, facing, apuntado, dash y colisión · `renderPlayer(ctx, p, state)` |
| `weapons.js` (ANG-C) | `WEAPONS = { estaca, latigo, agua }`, cada una `{ id, nombre, icon, kind, cadence(lvl), onAttack(state,p,aim,api), evolved: {nombre} }` · `attack(state, p, aim, api)` respeta la cadencia y usa la superarma si `p.super` · `addMastery(p, weaponId, dmg, api)` sube de nivel y evoluciona en el 5 · `grantWeapon(p, id)` la pone en el primer espacio libre · `updateWeapons(state, dt, api)` maneja proyectiles, charcos y estelas en `state.projectiles` · `renderWeapons(ctx, state, cam)` |
| `superweapons.js` (ANG-C) | `SUPERS = { macuahuitl, minigun, bazuca, lanzallamas, rayo }` · `updateSupers(state, dt, api)`: spawn, despawn, recogida (`p.prevActive`) y expiración con restauración y toast "Vuelves a ‹arma›" · `renderSupers(ctx, state, cam)` con columna de luz · `renderSuperArrows(ctx, state, cam, viewW, viewH)` |
| `abilities.js` (ANG-C) | `useBell(state,p,api)`, `useDash(state,p,api)`, `updateAbilities(state,dt,api)`, `renderAbilities(ctx,state,cam)` |
| `pickups.js` (ANG-C) | `dropGem(state, x, y, value)`, `updatePickups(state, dt, api)` (imán y recogida → `api.addXp`), `renderPickups(ctx, state, cam)` |
| `enemies.js`, `waves.js`, `hud.js`, `menus.js`, `config.js`, `state.js`, `main.js`, `index.html` (ANG-G) | Libre, respetando lo anterior. `state.js` exporta `createState({mode, map, seed})` con pools (`pool.js`) para enemies, projectiles, drops y fx |

**Input que `main.js` pasa a `updatePlayer` y `attack`:** `inp = { mx, my, ax, ay, attack, ability1, ability2, slot /* -1 o 0..2 en el flanco */ }`.

**Orden del tick en `main.js`:**
1. input
2. `updatePlayer`
3. `attack` (Y), `useBell` (U, en el flanco), `useDash` (I, en el flanco) y `slot` (1/2/3, solo si el espacio tiene arma)
4. `updateWeapons`
5. `updateAbilities`
6. `updateSupers`
7. enemigos
8. `updatePickups`
9. oleadas
10. fx

**Orden de render:** fondo → obstáculos → pickups → supers → enemigos → proyectiles → jugadores → fx → flechas → HUD → menús.

## 3. Ganchos de prueba (ambos juegos y el lobby)
- `window.__cfgReady = true` después del primer frame renderizado.
- `window.__cfgStats() -> { scene, fps, entities, wave?, distance?, players? }`.
- **Parámetros de URL de Ángel:**
  - `?autostart=solo&map=reforma|tepito&skin=<id>` salta los menús.
  - `?debug=1` activa el modo debug.
  - `?stress=400` mete N enemigos inmóviles (solo con debug).
  - `?room=create` y `?room=ABCD` se usan en W2.
- **Parámetros de URL de Xochimilco:** `?autostart=1`, `?debug=1` (G = God mode, Z = saltar zona).
- **Nada debe lanzar errores de consola** al cargar, durante 20 s de juego ni al volver al lobby.

## 4. Servidor
- **Arranque:** `node server/src/index.js`. Requiere Node ≥ 24 y `ws` como única dependencia de runtime, más `@aws-sdk/client-dynamodb` y `@aws-sdk/lib-dynamodb` para el store de producción.
- **Variables de entorno:**

| Variable | Default / uso |
|---|---|
| `PORT` | 8080 |
| `STATIC_ROOT` | La raíz del repo (`..` desde `server/`) |
| `STORE` | `file` (en `server/data/`) o `dynamo` |
| `TABLE` | `cfg-buildday-leaderboard` |
| `AWS_REGION` | `us-east-1` |
| `EVENT_START` | `2026-10-26T17:30:00-06:00` |
| `CFG_VERSION` | `dev` por defecto, o el contenido de `VERSION.txt` si existe |
| `ORIGIN_SECRET` | Si existe, exige el header `X-Origin-Secret` en todo excepto `GET /api/health` |

- **Estáticos:** solo bajo `STATIC_ROOT`, con bloqueo de path traversal y sin servir `server/`, `infra/`, `.git/`, `docs/` ni `tests/`. MIME correctos (`.js` como `text/javascript`). `Cache-Control: no-cache` en HTML y `max-age=300` en el resto.
- **Rutas:** `/ws` es el WebSocket del protocolo del doc 03 §7 y `/api/*` el leaderboard del doc 03 §6.
