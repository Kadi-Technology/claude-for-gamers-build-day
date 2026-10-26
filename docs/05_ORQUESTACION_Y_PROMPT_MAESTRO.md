# 05 · Orquestación Ultra-Eco y prompt maestro

## 1. Modelo de trabajo
- **Orquestador:** la sesión principal de Claude Code en **Opus 5.5** con esfuerzo **xhigh** (se elige en el selector de la app antes de pegar el prompt). Descompone, escribe los scripts de Workflow, lee resultados, decide compuertas e integra. No escribe código de territorio.
- **Skill:** `/kadi-ultra-eco` (el prompt maestro empieza con ella). Activa Workflows con la matriz de tiers y la **Ley Anti-Herencia**: todo subagente lleva `model` y `effort` explícitos.

| Tier | Modelo / esfuerzo | Uso en este build |
|---|---|---|
| T1 Peón | sonnet / xhigh | Escritores por territorio, E2E, servidor, lobby, IaC y refutadores |
| T1m | sonnet / medium | Gates: `npm test`, E2E, cfn-lint, deploy |
| T2 Capitán | opus / high | Cooperativo en línea (NET), integración de Ángel tras un rechazo, revisión de diffs y desempates |
| T3 Estratega | fable / high | Máximo 3: decisiones de contrato (`CONTRACT_CHANGE_REQUEST`), juez go/no-go del release y hallazgos críticos |

**Mezcla objetivo:** ≥ 70 % T1, ≤ 25 % T2, ≤ 5 % T3. **Escala M** (6–20 agentes por workflow), pedida de forma explícita por el PO.

## 2. Reglas KADI aplicadas
- La base `C:\KADI\repos\claude-for-gamers-build-day` es de **solo lectura**.
- Se trabaja en el worktree `C:\KADI\.worktrees\CFG-001`, rama `feat/cfg-001-build-day`, y se pasa `args.worktree` al preludio.
- Los escritores paralelos tienen territorios disjuntos (doc 03 §3), validados con `normRuta`. Los escritores no corren gates globales: lo hace el gate central T1m al cierre de cada ola.
- **Ledger:** aprobación del PO al inicio (`kadi ledger approve`) y cierre al final (`kadi ledger close`). El harness v1.0.0 no tiene `ticket` ni `worktree`; los gates del proyecto son los del doc 03 §8.
- **Commits atómicos por territorio** después de cada gate verde, con push de la rama y un PR en borrador. **El merge a `main` lo decide solo el PO.**
- **Secretos:** se carga la skill `aws-secrets-manager` antes de tocar el secreto de origen; ningún valor entra al contexto.

## 3. Olas y cronograma (escenario A, 150 min)
| Min | Ola | Agentes | Salida | Compuerta |
|---|---|---|---|---|
| 0–5 | Arranque inline | Orquestador | Ledger, worktree, verificación de créditos, D1–D5 confirmadas | — |
| 5–20 | **W0 Cimientos** | 4×T1: ENG, SRV, INF, LOB | Motor compartido, servidor con tests, stack CFN con lint, lobby con créditos | **G0:** server `npm test` + lint verdes; lobby abre sin errores |
| 20–65 | **W1 Juegos** | 4×T1: ANG-W, ANG-C, ANG-G, XOC + 1×T1 E2E | Ángel Survivors (2 mapas, skins, Y/U/I/O, 3 superarmas, jefa) y Xochimilco (salto y matriz completa) | **G1:** E2E de arranque + los 2 juegos con 0 errores; 400 enemigos ≥ 55 FPS |
| 65–105 | **W2 En línea y deploy** | 1×T2 NET · 1×T1 leaderboard en juegos y lobby · 1×T1m deploy · 1×T1 juice/balance · 2×T1 P1 (superarmas 4–5, skins 5–6) | Cooperativo con unión a mitad de partida, leaderboard vivo y URL pública | **G2:** `coop.e2e.mjs` y E2E de arranque **contra la URL pública** |
| 105–130 | **W3 Revisión** | 3×T1 finders (bugs, red y abuso, UX) → `verificar()` → correcciones | Lista de hallazgos verificados y corregidos | Gates de nuevo en verde |
| 130–140 | **W4 Release** | 1×T3 juez go/no-go · 1×T1m | Tag `v1.0.0-buildday`, PR listo, README con URL y guion de demo | El PO aprueba el merge |
| 140–150 | Buffer | — | Demo ensayada | **Sin features nuevas** |

**Reglas de compuerta:**
- **G1 en rojo al minuto 75:** NET pasa a P2. W2 se enfoca en leaderboard y deploy.
- **G2 en rojo al minuto 115:** la demo es local con `store-file`.
- **Escenario B (90 min):** W0 0–10 · W1 10–50 · G1 · W2 50–75 (leaderboard y deploy; NET solo si G1 está verde en el minuto 50) · W4 75–90. W3 se omite y los gates se mantienen.

## 4. PROMPT MAESTRO
Antes de pegarlo:
1. Elige **Opus 5.5 / xhigh** en el selector.
2. Abre la sesión en `C:\KADI`.
3. Pega el bloque completo.

```
/kadi-ultra-eco Build Day "Claude for Gamers" (26-oct-2026). Eres el ORQUESTADOR (Opus). Ejecuta el build E2E con olas Ultra-Eco, escala M por ola (lo pido explícitamente), sin pedirme permiso entre olas. Detente SOLO si: (a) un gate sigue rojo después de 2 rondas de corrección, (b) hace falta un CONTRACT_CHANGE_REQUEST, (c) una acción requiere una aprobación que no esté abajo.

FUENTE DE VERDAD (léela tú una vez; a los subagentes pásales rutas y secciones, nunca volcados):
C:\KADI\repos\claude-for-gamers-build-day\docs\01_EVENTO_Y_ALCANCE.md · 02_GDD.md · 03_ARQUITECTURA_Y_CONTRATOS.md · 04_INFRA_AWS.md · 05_ORQUESTACION_Y_PROMPT_MAESTRO.md
Los contratos del doc 03 están CONGELADOS. Los territorios y dueños de archivo del doc 03 §3 son obligatorios.

ARRANQUE (inline, ≤ 5 min):
1. Hora de inicio = ahora; registra los minutos transcurridos en cada reporte.
2. git -C C:\KADI\repos\claude-for-gamers-build-day fetch origin; git -C C:\KADI\repos\claude-for-gamers-build-day worktree add C:\KADI\.worktrees\CFG-001 -b feat/cfg-001-build-day origin/main
3. node C:\KADI\harness\bin\kadi.mjs ledger approve --tarea CFG-001 --texto "<cita literal de este prompt: Build Day E2E>" --hora <ISO> --fuente chat:<session>
4. Confirma: node ≥ 24, gh auth, credenciales de AWS (aws sts get-caller-identity), wrangler whoami y el Chromium de Playwright del doc 03 §8. Si algo falla, repórtalo en una línea y sigue con lo que no dependa de eso.
5. Aprobaciones del PO para esta sesión: D2=<dominio>, D3=<tope USD>, D4=<licencia>, D5=<teclas>. Escenario de tiempo: <A|B>.

EJECUCIÓN: olas W0 → W4 según la tabla del doc 05 §3, con args.worktree = C:\KADI\.worktrees\CFG-001.
- Cada escritor T1 recibe: su territorio (lista exacta de archivos), las secciones del GDD y del doc 03 que le tocan y su criterio de aceptación. Usa escalar() con criterios en código (schema con campos tipados), nunca con texto libre.
- NET (cooperativo) arranca en T2. La decisión ante un contrato es T3 (máximo 3 T3 en total).
- Gate central T1m al cierre de cada ola con los comandos del doc 03 §8; devuelve la salida literal. Correcciones: ronda 1 en T1 y ronda 2 en T2.
- Tras cada gate verde: commits atómicos por territorio (Conventional Commits en español), push de la rama y PR en borrador "Claude for Gamers - Build Day". Nunca hagas merge a main.
- Deploy (W2) con infra/deploy.ps1 a la cuenta y región del doc 04. Carga la skill aws-secrets-manager antes de crear el secreto de origen. Verifica /api/health con el sha.
- Aplica las compuertas de tiempo del doc 05 §3 y los cortes de alcance del doc 01 §4 sin preguntarme; repórtalos.
- Reglas del evento: el código se escribe ahora, nada pre-hecho. Respeta los créditos del lobby (doc 02 §3) al pie de la letra.

REPORTE (una vez por ola, ≤ 8 líneas): minuto, qué quedó verde, salida literal de los gates, recortes aplicados y siguiente ola.
CIERRE: Informe Ultra-Eco (agentes por tier, escaladas, degradaciones, tokens de salida y ahorro con eco_costos.py), URL pública, enlace al PR, guion de demo de 2 min y kadi ledger close --tarea CFG-001 --resultado PASS|FAIL.
```

## 5. Prompts de rescate (si hacen falta)
- **Ola atascada:** `Reanuda la ola actual con Workflow({scriptPath, resumeFromRunId}); los agentes completados vuelven de caché. Comprueba que el gate posterior a la remediación sí corrió.`
- **Recorte inmediato:** `Aplica el siguiente corte de alcance del doc 01 §4, reporta qué se quitó y vuelve a correr G1.`
- **Antes de la demo:** `Congela: ya no hay features. Corre todos los gates contra la URL pública, prepara el guion de demo con ?debug=1 (B invoca a la Llorona) y dame la URL.`
