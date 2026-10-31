<!-- ESTADO-VERIFICADO-2026-10-31 -->
# Claude for Gamers · Build Day

Dos juegos de navegador y un lobby dual creados en vivo el **26 de octubre de 2026** durante el evento comunitario **Claude for Gamers** (Ciudad de México), organizado por Rich Lira.

El repositorio contiene el código fuente completo, el lobby dual, las suites de pruebas automatizadas y el servidor Node.js que gestiona estáticos, salas en línea y el sistema de leaderboard con validación de plausibilidad.

---

## 🎮 Los Juegos

| Juego | Género | Modos | Escenarios / Contenido |
|---|---|---|---|
| **Ángel Survivors** | Supervivencia cenital por oleadas con combate activo y apuntado asistido | Un jugador (cooperativo en línea planificado en protocolo de salas) | 6 skins temáticas (Luchador, Catrina, Ajolote, etc.), 5 superarmas, 2 escenarios (Paseo de la Reforma y Tepito) |
| **El escape de Xochimilco** | Runner de 3 carriles en perspectiva pseud-3D (cambio de carril, buceo y salto) | Un jugador · Leaderboard global con validación anti-trampas | Canales de Xochimilco, trajineras, redes, garzas, lirios, remolinos y meta en 2000 m |
| **Lobby Dual** | Hub web responsivo | Acceso a ambos juegos y clasificación en vivo | Perfil sincronizado de alias, miniaturas animadas en canvas y widgets reactivos |

---

## 🕹️ Controles y Soporte Multi-Dispositivo

La interfaz y el motor de entrada fueron desarrollados para responder tanto en computadoras de escritorio/laptops como en tabletas y teléfonos móviles mediante gestos táctiles y controles superpuestos.

| Juego | Laptop / Escritorio | Celular / Tableta (Táctil) |
|---|---|---|
| **Ángel Survivors** | `WASD` / Flechas: Moverse<br>`Y`: Atacar (mantenida repite, apuntado automático al enemigo cercano)<br>`U`: Campanazo (onda expansiva)<br>`I`: Esquiva / Dash con invulnerabilidad<br>`1` / `2` / `3`: Selección de arma<br>`P` / `Esc`: Pausa · `M`: Silencio | Joystick virtual flotante (mano izquierda)<br>Botones de acción táctiles: ⚔️ Atacar, 🔔 Campanazo, 💨 Esquiva<br>Botones superiores: Armas `1`/`2`/`3` y pausa ⏸️ |
| **El escape de Xochimilco** | `A` / `D` (o `←` / `→`): Cambiar carril<br>`W` / `Espacio` (o `↑`): Saltar obstáculos altos (troncos, remolinos)<br>`S` / `Shift` (o `↓`): Bucear bajo trajineras y redes (consume O₂)<br>`P` / `Esc`: Pausa · `M`: Silencio | Deslizamientos táctiles (Swipes):<br>`←` / `→`: Cambio de carril<br>`↑`: Saltar<br>`↓`: Bucear |

Ambos juegos cuentan con soporte de Gamepad (API estándar de navegador).

---

## 🛡️ Sistema de Leaderboard y Seguridad

El backend implementa un sistema de clasificación diseñado para entornos competitivos y redes compartidas:

1. **Validación de Plausibilidad Física:**
   - Control de velocidad máxima permitida (`durationMs >= distance / maxSpeed`).
   - Control de cota superior de puntuación (`score <= distance + flowers * 10 * comboMax`).
   - Límite absoluto de distancia (`distance <= 30000 m`) y consistencia en flores recogidas (`flowers <= distance`).
2. **Filtro de Alias:**
   - 3 a 12 caracteres alfanuméricos, guiones y espacios (normalización Unicode NFC).
   - Lista de palabras no permitidas con análisis contextual para evitar falsos positivos comunes.
3. **Control de Tasa (Rate Limiting):**
   - Ventana de 10 segundos entre envíos por jugador y límite diario por IP.
   - Compatibilidad con cabeceras `CF-Connecting-IP` y `X-Forwarded-For` protegidas mediante firma de origen (`ORIGIN_SECRET`).
4. **Almacenamiento Dual:**
   - Motor en archivo local (`store-file` en formato JSON atómico) para desarrollo y despliegues autónomos.
   - Motor DynamoDB (`store-dynamo` con claves compuestas de ordenamiento) para escalabilidad en la nube.

---

## 💻 Stack Técnico

- **Frontend:**
  - JavaScript Vanilla moderno (ES Modules nativos).
  - HTML5 Canvas 2D sin frameworks pesados ni dependencias externas en tiempo de ejecución.
  - CSS3 responsivo (CSS Grid, Flexbox, media queries adaptativas, `viewport-fit=cover` y safe-area insets).
- **Backend / Servidor:**
  - Node.js (>=22).
  - `node:http` nativo para entrega de estáticos con encabezados de caché seguros y mitigación de path traversal.
  - `ws` para el protocolo de salas multijugador y señalización en tiempo real.
  - `@aws-sdk/client-dynamodb` / `@aws-sdk/lib-dynamodb` para persistencia en AWS.
- **Pruebas Automatizadas:**
  - 100 pruebas unitarias y de integración que pasan sin fallos (93 en servidor, 7 en generador de patrones de Xochimilco).
  - Pruebas E2E automatizadas con Playwright Chromium local.

---

## 🚀 Cómo Correr Localmente

### Requisitos Previos
- Node.js versión 22 o superior.
- Git.

### 1. Clonar e Instalar Dependencias
```bash
git clone https://github.com/Kadi-Technology/claude-for-gamers-build-day.git
cd claude-for-gamers-build-day
cd server
npm ci
```

### 2. Iniciar el Servidor
```bash
npm start
```
El servidor arrancará en el puerto 8080 por defecto. Abre tu navegador en:
```
http://localhost:8080
```

Para usar un puerto personalizado:
```bash
PORT=18111 npm start
```

### 3. Ejecutar las Pruebas
```bash
# Pruebas del servidor (HTTP, WebSocket, DynamoDB, leaderboard y seguridad)
npm test

# Pruebas de patrones y resolución de Xochimilco
node --test ../games/xochimilco/test/patrones.test.mjs
```

---

## ⚠️ Estado del Proyecto y Límites Conocidos

- **Versión del build:** `v1.0.2-buildday` (compromiso `d42a0c2`).
- **Cooperativo en línea:** El protocolo WebSocket y la gestión de salas de 4 jugadores están implementados y cubiertos por pruebas (`server/src/rooms.js`), pero la sincronización de combate de Ángel Survivors se reservó para un release posterior debido a la restricción de tiempo del evento en vivo.
- **Infraestructura AWS:** La infraestructura temporal desplegada durante el evento en `us-east-1` (detallada en `infra/04_INFRA_AWS.md`) fue retirada tras la conclusión de la jornada de acuerdo con el protocolo de desmontaje (`infra/TEARDOWN.md`). El juego es 100% funcional localmente.
- **Ramas en GitHub:** El desarrollo completo del Build Day reside en la rama `feat/cfg-001-build-day` (etiquetado con `v1.0.0-buildday`, `v1.0.1-buildday` y `v1.0.2-buildday`). La rama `main` contiene el plan inicial de pre-evento (`0f2e689`).

---

## 📜 Créditos y Licencia

- Creado en vivo el 26 de octubre de 2026 en el evento comunitario **Claude for Gamers** (Ciudad de México).
- Agradecimiento especial a **Rich Lira**, anfitrión del evento.
- Desarrollado con asistencia de la **Claude API** y orquestación multi-modelo.
- Laboratorio de ingeniería de **[KADI Technology](https://kadi.technology)**.
- Licencia: **MIT** (consulta el archivo [LICENSE](LICENSE) para más detalles).

*Proyecto comunitario. No es un producto oficial de Anthropic. "Claude" es una marca comercial de Anthropic.*
