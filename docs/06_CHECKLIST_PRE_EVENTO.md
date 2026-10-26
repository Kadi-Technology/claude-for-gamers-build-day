# 06 · Checklist previo al evento

Marcar antes de las 5:30 p. m. del 26 de octubre de 2026. Ninguno de estos puntos escribe código.

## Cuentas y herramientas (laptop del evento)
- [ ] Claude Code abierto en `C:\KADI`, con **Opus 5.5 / xhigh** seleccionado. La skill `/kadi-ultra-eco` aparece en la lista
- [ ] Créditos de la Claude API activos (se entregan en el evento)
- [ ] `gh auth status` en verde con la cuenta que administra `Kadi-Technology`
- [ ] `aws sts get-caller-identity` en verde (cuenta 384668480384) y región `mx-central-1`
- [ ] `npx wrangler whoami` en verde (Cloudflare de kadi.technology)
- [ ] `node --version` ≥ 24 y `cfn-lint --version` disponible (si no está: `pip install cfn-lint`)
- [ ] El Chromium de Playwright existe en `%LOCALAPPDATA%\ms-playwright\chromium-1228\chrome-win64\chrome.exe`
- [ ] Laptop conectada a la corriente, sin suspensión, con el internet del evento probado (y hotspot de respaldo)

## Decisiones del PO (doc 01 §5)
- [ ] D1: reglas confirmadas con Rich Lira (duración del build, si se permite infraestructura previa, restricciones de contenido)
- [ ] D2: dominio (`gamers.kadi.technology` recomendado)
- [ ] D3: tope de gasto AWS (USD 25 recomendado)
- [ ] D4: licencia del repo público (MIT recomendada)
- [ ] D5: teclas (Y ataque · U Campanazo · I Esquiva · O cambiar arma)
- [ ] Escenario de tiempo A (150 min) o B (90 min)

## Al empezar el reloj
1. Rellenar los marcadores `<…>` del prompt maestro (doc 05 §4).
2. Pegarlo en Claude Code.
3. Tener a la mano el lobby (`http://localhost:8080`) y la URL pública para la demo.

## Guion de demo (2 min)
1. **Lobby:** fecha, créditos y leaderboard en vivo (15 s).
2. **Ángel Survivors:** cambiar skin, entrar a Tepito, disparar con Y, Campanazo con U, recoger la bazuca y ver cómo vuelve el arma (40 s).
3. **Cooperativo:** un celular o una segunda laptop se une con el código a mitad de oleada (25 s).
4. **Xochimilco:** saltar un tronco, bucear bajo una trajinera y aparecer en el leaderboard (25 s).
5. **Cierre:** "Hecho hoy con Claude: orquestador Opus y subagentes por tiers en el KADI Harness" (15 s).
