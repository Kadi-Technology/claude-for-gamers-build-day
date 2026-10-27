# 02 · Diseño de juego (GDD)

Reglas comunes: textos en español, sin assets externos (formas de canvas, emojis pre-renderizados y sonido WebAudio), todos los números de balance en `config.js`, modo debug con `?debug=1` o F3, y alias compartido con el lobby.

---

## 1. Ángel Survivors

### 1.1 Concepto
La noche de Día de Muertos, las criaturas del folclor mexicano invaden la Ciudad de México. Sobrevive oleadas infinitas solo o con hasta 3 amigos en línea. Vista cenital, cámara que sigue al jugador y **combate manual**. Vampire Survivors y Boxhead son solo inspiración; nombres, textos y diseño son originales.

### 1.2 Flujo de pantallas
`TÍTULO → MENÚ PRINCIPAL → (SOLO | EN LÍNEA) → SELECCIÓN (skin + escenario) → PARTIDA ⇄ LEVEL-UP / PAUSA → GAME OVER → MENÚ`

- **Menú principal:** Jugar solo · En línea · Controles · Récords · ← Lobby.
- **Selección:** carrusel de skins con vista previa animada y 2 tarjetas de escenario. En línea, el escenario lo elige quien crea la sala y los invitados solo eligen skin.
- **En línea:** Crear sala (empiezas solo de inmediato y se muestra un código de 4 letras) · Unirse con código · Salas abiertas (P2).

### 1.3 Controles (R2)
| Acción | Teclado | Gamepad | Táctil (P2) |
|---|---|---|---|
| Moverse | WASD / flechas | Stick izquierdo | Joystick virtual |
| Apuntar | Mouse; sin mouse, la dirección de mirada con asistencia en cono de 25° | Stick derecho | Automático hacia la mirada |
| **Atacar** (disparo o golpe melee) | **Y** | X / RT | Botón ⚔️ |
| Campanazo (área) | **U** | LB | Botón 🔔 |
| Esquiva (dash con invulnerabilidad de 0.25 s, cooldown 3 s) | **I** | RB | Botón 💨 |
| Elegir arma de la mochila (espacio 1, 2 o 3) | **1 / 2 / 3** | Cruceta ← / ↑ / → | 3 botones de espacio |
| Pausa · Silencio | P / Esc · M | Start | — |

- Cada pulsación de Y es un ataque y mantenerla repite a la cadencia del arma. **Nada ataca solo.**
- Las teclas se pueden reasignar en Controles (P2) y se guardan en localStorage.

### 1.4 Skins (R1)
Son solo cosméticas y no cambian el balance. Se dibujan con formas y emojis, se pre-renderizan una vez por skin y se voltean en horizontal.

| # | Skin | Rasgos visuales | Prioridad |
|---|---|---|---|
| 1 | Luchador | Máscara con colores intercambiables y capa | P0 |
| 2 | Catrina | Sombrero de flores y rostro de calavera | P0 |
| 3 | Charro | Sombrero ancho y traje con botonadura | P0 |
| 4 | Calaverita | Calavera de azúcar con detalles de color | P0 |
| 5 | Chinelo | Barba puntiaguda, sombrero alto y túnica bordada | P1 |
| 6 | Mariachi | Traje negro con plata y moño | P1 |

### 1.5 Escenarios (R1)
Cada mapa es un dato (`maps/<id>.js`), no lógica: tamaño, paleta, obstáculos (círculos y rectángulos), decorado, punto de aparición y reglas de spawn.

| | **Reforma: Glorieta del Ángel** | **Tepito: el Barrio Bravo** (nuevo) |
|---|---|---|
| Forma | Arena abierta de unos 3200×2000 con la columna sólida al centro | Cuadrícula de calles de unos 3000×3000 con manzanas sólidas |
| Obstáculos | Columna del Ángel, fuentes, autos abandonados y camellones | Manzanas, puestos de tianguis con lonas de colores, bocinas de sonidero, un ring de box callejero y diablitos de carga |
| Estrategia | Kiting en círculos alrededor de la columna | Callejones angostos que hacen de embudo: recompensa el área y el bazuca |
| Paleta | Asfalto, dorado y cempasúchil | Lonas rosa, azul y amarillo; murales y papel picado |

**Representación respetuosa de Tepito:** celebrar su comercio, la cultura sonidera, su tradición de box y su arte urbano. Sin estereotipos de crimen, armas reales ni referencias religiosas sensibles.

### 1.6 Enemigos
| Enemigo | Rol | Comportamiento |
|---|---|---|
| Chupacabras | Base | Persigue al jugador |
| Murciélago 🦇 | Rápido y frágil | Llega en enjambres con zigzag |
| Nahual 🐺 | Bruto | Lento, mucha vida, empuja al tocar |
| **Jefa: La Llorona** 👻 | Cada 5 oleadas | Anillo de "gritos", invoca murciélagos, escala en cada aparición y tiene barra de vida en pantalla |

Aparecen fuera de cámara, nunca dentro de obstáculos, y se separan entre sí para no encimarse. En cooperativo, cantidad y vida escalan ×(1 + 0.6·(jugadores − 1)).

### 1.7 Oleadas
Cada oleada dura 30 s con una cuota creciente, seguida de 3 s de respiro con el banner "OLEADA N". Las oleadas múltiplo de 5 traen a la jefa y no terminan hasta derrotarla.

### 1.8 Armas base y maestría
La **mochila** tiene 3 espacios, uno por arma base; **1/2/3** eligen la activa (un espacio vacío no hace nada) y **Y** la usa. Los espacios vacíos se ven atenuados en el HUD. Cada arma tiene niveles 1 a 5 con una barra de **maestría** que se llena con el daño que hace. En el nivel 5 **evoluciona**.

| Arma | Tipo | Ataque con Y | Evolución (nivel 5) |
|---|---|---|---|
| Estaca | Proyectil | Lanza estacas hacia donde apuntas; sube cantidad y perforación | Estaca de Plata (rebota entre enemigos) |
| Látigo | Melee | Barrido en arco frente al jugador; sube ancho y daño | Látigo de Cempasúchil (deja una estela de fuego) |
| Agua bendita 💧 | Lanzable | Frasco al punto apuntado que deja un charco con daño por segundo | Lluvia Bendita (varios frascos) |

Se empieza con la Estaca y las otras dos se desbloquean con las cartas de level-up.

### 1.9 Superarmas (R3)
- Aparecen al azar en el mapa cada 40–60 s (CONFIG), en un punto válido lejos del jugador. Tienen una columna de luz, una flecha en el borde de la pantalla cuando no se ven y desaparecen si nadie las toma en 25 s.
- Se recogen al tocarlas y **reemplazan temporalmente al arma activa**: Y dispara la superarma y un anillo en el HUD muestra el tiempo restante. Al agotarse aparece el aviso "Vuelves a ‹arma›" y se restaura el arma previa con su nivel y maestría intactos.
- Recoger otra superarma reemplaza a la actual. En cooperativo la toma el primero que la toca.

| Superarma | Tipo | Duración | Efecto | Prioridad |
|---|---|---|---|---|
| **Macuahuitl** (espada de obsidiana) | Melee | 15 s | Tajos amplios en arco con un giro de 360° cada tercer golpe | P0 |
| **Minigun Tronadora** | Ráfaga | 12 s | 20 balas por segundo con dispersión; frena un poco al jugador | P0 |
| **Bazuca Cohetón** | Explosivo | 8 cargas o 15 s | Cohete con explosión de área, knockback y shake | P0 |
| **Lanzallamas Chilero** | Cono continuo | 10 s | Daño por segundo en cono y enemigos en llamas | P1 |
| **Rayo de Quetzalcóatl** | Láser | 8 s | Haz que atraviesa todo en la línea de mira | P1 |

### 1.10 Progresión
Los enemigos sueltan gemas de XP que el jugador atrae con un radio de imán. Al subir de nivel aparecen 3 cartas: arma nueva, +daño, +velocidad, +vida máxima con curación, +imán, −cooldown del Campanazo o +1 nivel a un arma.
- **Solo:** el juego se pausa durante la elección.
- **En línea:** el mundo no se pausa; el jugador es invulnerable mientras elige (máximo 8 s) y, si no elige, se toma una carta al azar.

### 1.11 Habilidades
- **Campanazo (U):** onda expansiva con daño y knockback fuerte; cooldown de 8 s.
- **Esquiva (I):** dash corto con i-frames; cooldown de 3 s.

### 1.12 Cooperativo en línea (R10)
- **Crear sala** arranca la partida de inmediato con un solo jugador; el código de 4 letras se ve en pantalla y en pausa. Cualquiera puede **unirse en cualquier momento** hasta llenar 4 lugares.
- Quien se une aparece junto al anfitrión con 2 s de invulnerabilidad, en nivel 1 y con **XP doble** hasta alcanzar el promedio del grupo.
- **Derribado:** el jugador queda como fantasma y revive si un compañero está cerca de él 3 s. Es game over cuando todos caen.
- Si el anfitrión sale, la sala termina con el aviso "El anfitrión salió" y se muestran las estadísticas.
- Cada jugador tiene sus propios level-ups y armas; las gemas son de quien las recoge.

### 1.13 HUD y pantallas
- **HUD:** barra de XP, vida, nivel, oleada, tiempo, kills, armas con su nivel y maestría (la activa resaltada), temporizador de superarma, cooldowns de U e I, barra de la jefa, código de sala y lista de jugadores en cooperativo.
- **Pantallas:** pausa; game over con estadísticas, top 5 local y (P2) envío al leaderboard global.

### 1.14 Juice
Screen shake, flash al golpear, hit-stop en la jefa, números de daño, pétalos de cempasúchil al morir, viñeta roja con poca vida y SFX con WebAudio.

---

## 2. El escape de Xochimilco

### 2.1 Concepto
Eres un ajolote 🦎 que escapa por los canales de Xochimilco. Runner de 3 carriles con vista trasera pseudo-3D; si la perspectiva se complica, se cambia a vista cenital con scroll vertical.

### 2.2 Controles (R4)
| Acción | Teclado | Gamepad | Táctil |
|---|---|---|---|
| Cambiar de carril | A/D o ←/→ | Cruceta o stick | Swipe izquierda/derecha |
| **Saltar** (0.7 s de aire) | **W / ↑ / Espacio** | A | Swipe arriba |
| Bucear (0.8 s; gasta oxígeno) | S / ↓ / Shift | B | Swipe abajo |
| Pausa · Silencio | P / Esc · M | Start | Botón ⏸ |

Saltar y bucear se excluyen entre sí: bajar en el aire acelera la caída (fast-fall). El oxígeno se recarga en la superficie.

### 2.3 Matriz de obstáculos
✔ evita · ✘ choca

| Obstáculo | Ocupa | Carril | Bucear | **Saltar** | Prioridad |
|---|---|---|---|---|---|
| Trajinera 🛶 | 1 carril | ✔ | ✔ (pasa por debajo) | ✘ (demasiado alta) | P0 |
| Red de pesca 🕸️ | 1 carril, de la superficie al fondo | ✔ | ✘ | ✘ | P0 |
| Garza 🦩 (avisa con sombra) | 1 carril, desde arriba | ✔ | ✔ | ✘ (te atrapa en el aire) | P0 |
| Lirio acuático 🌿 | 1–2 carriles en superficie | ✔ | ✔ | ✔ | P0 |
| **Tronco de ahuejote** 🪵 | **3 carriles**, raíces sumergidas | ✘ | ✘ | **✔** | **P0** |
| **Cerca de chinampa** | **3 carriles**, estacas bajo el agua | ✘ | ✘ | **✔** | **P0** |
| **Remolino** 🌀 | **3 carriles**, succiona en superficie y bajo el agua | ✘ | ✘ | **✔** | P1 |
| Carpa saltarina 🐟 | Cruza carriles en arco | ✔ | ✔ | ✘ | P1 |

Los obstáculos se generan con una **biblioteca de patrones** (fragmentos diseñados por nivel de dificultad), no al azar puro. Cada patrón garantiza al menos una respuesta válida y una distancia mínima de reacción según la velocidad.

### 2.4 Coleccionables y power-up
- **Cempasúchil 🌼:** puntos y combo; los arcos de flores en el aire enseñan el salto.
- **Ajolotitos:** vida extra, máximo 3.
- **Chinampa Dash:** impulso con 3 s de invulnerabilidad.

### 2.5 Zonas
Cambian cada 500 m:
1. Canal de día.
2. Mercado flotante.
3. Noche con mariachi (visibilidad reducida).
4. **Isla de las Muñecas** (1500–2000 m, niebla).

Llegar a 2000 m es **ESCAPAR** (pantalla de victoria); luego se puede seguir en modo infinito.

### 2.6 Puntuación y leaderboard (R9)
- **Puntaje** = metros + flores × 10 × combo.
- Al terminar se envía al leaderboard global (`xochimilco`) con el alias compartido. Se muestran tu posición y el top 10.
- Si no hay red, se guarda en el top 5 local y se reintenta una vez.

---

## 3. Lobby dual (R7, R8)
- **Ruta:** `/` (raíz). Los juegos viven en `/games/angel/` y `/games/xochimilco/`, y cada uno tiene un botón "← Lobby".
- **Encabezado:** "Claude for Gamers · Build Day" y "Creado el 26 de octubre de 2026".
- **Dos tarjetas grandes:** emoji o arte de canvas, descripción de una línea, controles, botón JUGAR y (P1) una mini vista animada.
- **Alias:** un campo guardado en `localStorage` (`cfg.profile`) que usan los dos juegos.
- **Leaderboard en vivo:** top 10 de Xochimilco que se refresca cada 15 s y (P2) top de Ángel Survivors.
- **Créditos** visibles sin scroll en escritorio: "Creado el 26 de octubre de 2026 en Claude for Gamers · Gracias a Rich Lira, anfitrión del evento · Construido con la Claude API · Laboratorio de desarrollo de KADI Technology y su KADI Harness", más el aviso de que no es un producto oficial de Anthropic.
- **Navegación sin errores:** cada juego es una página independiente; no hay estado global compartido salvo `cfg.profile`, y los módulos están aislados por carpeta.
