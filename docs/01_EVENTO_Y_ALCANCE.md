# 01 · Evento y alcance

## 1. El evento
- **Nombre:** Claude for Gamers (comunidad Claude, Ciudad de México).
- **Fecha:** lunes 26 de octubre de 2026, 5:30 p. m. (America/Mexico_City).
- **Anfitrión:** Rich Lira.
- **Créditos de API:** se entregan al inicio del evento. Antes de recibirlos no se escribe código.

### Reglas conocidas y supuestos
No encontramos las reglas publicadas de esta edición. Mientras no se confirmen, asumimos el formato del evento hermano del mismo anfitrión, *Claude Code for Builders - Build Day*: bienvenida, orientación, un bloque de build de 55 min, una pausa, un sprint final de 35 min, demos relámpago (Show & Tell) y votación comunitaria con reconocimientos a lo "más útil", "más creativo" y "más ambicioso".

| Regla (supuesta) | Cómo la cumplimos |
|---|---|
| El código se escribe durante el evento | El repo solo trae documentación de diseño. El primer commit de código se hace después de que arranque el reloj y el historial de git lo prueba |
| Se presenta una demo corta | Guion de demo de 2 min en la ola final; URL pública y modo debug para mostrar a la jefa sin jugar 5 oleadas |
| Votación comunitaria | Apuntamos a "más ambicioso": dos juegos, cooperativo en línea y leaderboard en vivo que el público usa durante las pruebas |
| Uso de Claude | Todo el build lo hace Claude Code: Opus orquesta con `/kadi-ultra-eco` y despacha subagentes Sonnet, Opus y Fable |

**Confirmar con el anfitrión al llegar (D1):** duración real del build, si se permite tener la infraestructura AWS ya creada (sin código de juego) y si hay restricciones de tema o contenido.

### Presupuesto de tiempo
| Escenario | Build efectivo | Plan |
|---|---|---|
| A (nuestra referencia) | 150 min | Las 10 piezas completas (ver doc 05) |
| B (formato Build Day) | 90 min (55 + 35) | Cooperativo en línea pasa a P2 y solo entra si la compuerta G1 está en verde |

## 2. Requisitos priorizados
P0 = indispensable para la demo · P1 = se espera completo · P2 = ambicioso, protegido por compuertas.

| # | Requisito del PO | Prioridad | Criterio de aceptación |
|---|---|---|---|
| R1 | Ángel Survivors con menú principal: elegir skin del personaje y escenario (Ángel o **Tepito**, nuevo) | P0 | Menú con al menos 4 skins (P1: 6) y 2 escenarios jugables, con colisiones y spawns válidos en ambos |
| R2 | Disparo y golpe melee **manuales con Y**; habilidades con las teclas siguientes | P0 | Sin Y no hay daño de armas. U, I y O activan habilidades (ver GDD §1.3). Mantener Y repite a la cadencia del arma |
| R3 | **Superarmas** que aparecen al azar en el mapa (melee, minigun, bazuca, etc.) con tiempo limitado; al terminar se vuelve al arma anterior | P0: 3 · P1: 5 | Aparecen, se recogen al tocarlas, muestran su temporizador y restauran el arma previa sin perder el progreso |
| R4 | Xochimilco: **salto** además de carriles y buceo, con obstáculos que **solo** se esquivan saltando | P0 | Matriz de obstáculos del GDD §2.3 implementada; los de solo salto ocupan los 3 carriles y castigan el buceo |
| R5 | Carpeta nueva dentro del laboratorio KADI | Hecho en preparación | `C:\KADI\repos\claude-for-gamers-build-day`, registrado en el KADI Harness |
| R6 | Repo público **Claude for Gamers - Build Day** | Hecho en preparación | `github.com/Kadi-Technology/claude-for-gamers-build-day` |
| R7 | **Lobby dual** que aloja los 2 juegos y permite ir de uno a otro sin errores | P0 | E2E lobby → juego → lobby → otro juego → lobby, sin errores de consola |
| R8 | El lobby presenta la fecha (26 de octubre), agradece a Rich Lira, a la Claude API y al laboratorio KADI con su KADI Harness | P0 | Texto de créditos visible sin hacer scroll en escritorio |
| R9 | Instancia AWS para que muchas personas jueguen al mismo tiempo sin interferir, más **leaderboard** del ajolote | P1 | URL pública con HTTPS; el single player es 100 % cliente; leaderboard global persistente con top 20 del evento |
| R10 | Ángel Survivors **en línea**, hasta 4 jugadores, crear sala o jugar solo, y **unirse a una partida ya empezada** | P2 (escenario A: P1) | Dos navegadores: A empieza solo en sala, B se une con código a mitad de oleada y ambos ven el mismo estado |

## 3. Fuera de alcance (explícito)
- Cuentas de usuario o login: el alias vive en `localStorage` y se comparte entre los dos juegos.
- Migración de anfitrión: si el host sale, la sala termina con un aviso.
- Anti-trampas fuerte: solo validación de plausibilidad y límite de tasa (doc 03 §6).
- Assets externos, CDNs o paso de build en el frontend: todo son ES modules nativos, formas de canvas, emojis y sonido sintetizado.

## 4. Cortes de alcance (si el reloj aprieta)
En este orden:
1. Las superarmas 4 y 5 (lanzallamas y Rayo de Quetzalcóatl).
2. Las skins 5 y 6.
3. Leaderboard de Ángel Survivors (el de Xochimilco se queda).
4. Lista de salas públicas (unirse por código se queda).
5. Cooperativo en línea completo. El juego sigue funcionando offline aunque el servidor caiga.

**Nunca se recortan:** R2, R4, R7 y R8, ni el modo solo de ambos juegos.

## 5. Decisiones del PO (resueltas el 26-oct-2026 al iniciar el build)
Estas decisiones mandan sobre cualquier otro texto de `docs/`.

| ID | Decisión | Valor |
|---|---|---|
| D1 | Duración del build | **120 min** de referencia (se puede terminar antes). Se permite desplegar en AWS para que el público juegue |
| D2 | Dominio público | `gamers.kadi.technology` |
| D3 | Gasto AWS | Tope de USD 25. Infraestructura viva **un día**; desmontaje el 2026-10-27. Región **us-east-1** |
| D4 | Licencia | MIT |
| D5 | Teclas | **Y** ataque · **U** Campanazo · **I** Esquiva · **1/2/3** eligen el arma de la mochila (3 espacios). No existe la tecla O |
| D6 | Modelos | Orquestador Opus xhigh; **todos** los subagentes en Sonnet, con el esfuerzo elegido por tarea |
