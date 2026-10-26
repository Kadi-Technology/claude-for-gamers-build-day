# Claude for Gamers - Build Day

Dos juegos de navegador y un lobby dual creados en vivo el **26 de octubre de 2026** en el evento comunitario **Claude for Gamers** (Ciudad de México).

| Juego | Género | Modos |
|---|---|---|
| **Ángel Survivors** | Supervivencia cenital por oleadas con disparo manual, superarmas y 2 escenarios (Reforma y Tepito) | Solo · En línea cooperativo hasta 4 (unirse a mitad de partida) |
| **El escape de Xochimilco** | Runner de 3 carriles: esquivar, bucear y saltar | Solo · Leaderboard global del evento |

> **Estado:** preparación. Este repositorio solo contiene la documentación de diseño. **Todo el código se escribe durante el bloque de build del evento**, como piden sus reglas.

## Créditos
- Creado el 26 de octubre de 2026 durante **Claude for Gamers**.
- Gracias a **Rich Lira**, anfitrión del evento.
- Construido con la **Claude API** (Claude Code con orquestación multiagente).
- Desarrollado en el laboratorio de **[KADI Technology](https://kadi.technology)** con su **KADI Harness**.

Proyecto comunitario. No es un producto oficial de Anthropic. "Claude" es una marca de Anthropic.

## Documentación
| Documento | Contenido |
|---|---|
| [01 Evento y alcance](docs/01_EVENTO_Y_ALCANCE.md) | Reglas del evento, los 10 requisitos priorizados, cortes de alcance y decisiones pendientes |
| [02 Diseño de juego (GDD)](docs/02_GDD.md) | Ángel Survivors, Xochimilco y lobby dual |
| [03 Arquitectura y contratos](docs/03_ARQUITECTURA_Y_CONTRATOS.md) | Estructura del repo, módulos, dueños de archivo, protocolo en línea y API del leaderboard |
| [04 Infraestructura AWS](docs/04_INFRA_AWS.md) | Despliegue, capacidad, costos, seguridad y desmontaje |
| [05 Orquestación y prompt maestro](docs/05_ORQUESTACION_Y_PROMPT_MAESTRO.md) | Olas Ultra-Eco, gates, cronograma y el prompt que arranca el build |
| [06 Checklist previo al evento](docs/06_CHECKLIST_PRE_EVENTO.md) | Lo que debe estar listo antes de que empiece el reloj |

## Cómo correr (cuando exista el código)
```bash
cd server && npm ci && npm start   # sirve el lobby, los juegos, /api y /ws en http://localhost:8080
```
