# 04 · Infraestructura AWS (R9)

## 1. Objetivo
- Muchas personas jugando a la vez **sin interferir**.
- Leaderboard global persistente.
- Salas cooperativas de hasta 4 jugadores.
- Todo con IaC, sin SSH y con un desmontaje limpio después del evento.

## 2. Por qué esta arquitectura
| Opción | Veredicto |
|---|---|
| **Cloudflare (TLS, caché y Worker) → EC2 t4g.medium en us-east-1 + DynamoDB** | **Elegida.** Repite el patrón ya probado en producción de Requiem (`requiem-mp`): Worker → EC2 con secreto de origen, operación por SSM y release en S3. Un proceso Node largo mantiene las salas en memoria y la región da baja latencia para CDMX |
| API Gateway WebSocket + Lambda | Descartada: cobra por mensaje (15 Hz × N jugadores), agrega latencia y obliga a guardar el estado de la sala fuera de la memoria |
| ECS Fargate + ALB | Descartada para el evento: más piezas y más tiempo de arranque sin beneficio a esta escala |

**Aislamiento entre jugadores:** el single player corre completo en el navegador, con el estático cacheado por Cloudflare, así que miles de partidas simultáneas no comparten nada. En línea, cada sala está aislada en memoria por código, y el leaderboard es la única pieza compartida (escrituras atómicas en DynamoDB).

## 3. Diagrama
```
Navegador ──HTTPS/WSS──▶ Cloudflare Worker  (gamers.kadi.technology, D2)
                            │  agrega el header X-Origin-Secret
                            ▼  HTTP :80 (el SG solo admite los rangos IP de Cloudflare)
                     EC2 t4g.medium · Amazon Linux 2023 arm64 · Node 24 · systemd "cfg-server"
                      ├─ /            estático (lobby y juegos)
                      ├─ /api/*       leaderboard ──▶ DynamoDB cfg-buildday-leaderboard (on-demand, PITR)
                      └─ /ws          salas (en memoria)
                     Rol de instancia: SSM core + DynamoDB (solo esa tabla) + S3 GetObject (prefijo de releases)
```

## 4. Stack CloudFormation `cfg-buildday` (lo escribe INF en W0)
Archivo `infra/cfn/stack.yaml`:
- **EC2** t4g.medium con EIP, IMDSv2 obligatorio, EBS gp3 de 8 GB cifrado, sin key pair (solo SSM). La UserData instala Node 24 y deja listo el servicio systemd `cfg-server` y el script `cfg-deploy`, que descarga el tarball de S3 y reinicia el servicio.
- **Security group:** entrada solo al puerto 80 desde las listas IPv4 e IPv6 de Cloudflare (parámetro). Sin el puerto 22.
- **DynamoDB** `cfg-buildday-leaderboard`: on-demand, PK `board` (S), SK `sk` (S), PITR activado y cifrado por defecto.
- **IAM:** rol de instancia con `AmazonSSMManagedInstanceCore` + `dynamodb:PutItem/Query/GetItem` sobre el ARN de la tabla + `s3:GetObject` sobre `kadi-releases-384668480384/cfg-buildday/*`.
- **Observabilidad:** alarma `StatusCheckFailed_System` con auto-recover y alarma de CPU > 80 % durante 5 min. Logs del servicio en journald, consultables por SSM.
- **Etiquetas:** `proyecto=claude-for-gamers-build-day`, `evento=2026-10-26` y `dueno=kadi`. Sin guiones largos en nombres ni descripciones.
- **Antes de desplegar:** `cfn-lint` y `aws cloudformation validate-template`.

## 5. Secreto de origen
- `X-Origin-Secret` evita que alguien salte Cloudflare y le pegue directo a la EIP.
- Se guarda en SSM Parameter Store (SecureString) `/cfg-buildday/origin-secret`, igual que Requiem, y como secreto del Worker (`wrangler secret put ORIGIN_SECRET`).
- **Regla de la sesión:** antes de tocar cualquier secreto, el agente carga la skill `aws-secrets-manager`. El valor nunca entra al contexto, al repo ni a los logs; se genera y se escribe con un pipeline que no lo imprime.

## 6. Despliegue (`infra/deploy.ps1`)
1. Corre `npm test` en `server/` y aborta si hay rojos.
2. Empaqueta el repo (sin `node_modules`, `.git`, `docs/` ni `tests/`) como `cfg-buildday-<sha>.tgz` y lo sube a `s3://kadi-releases-384668480384/cfg-buildday/`.
3. Lanza `cfg-deploy <sha>` por SSM Run Command y espera el resultado. En la instancia corre `npm ci --omit=dev` y reinicia el servicio.
4. Verifica `https://<dominio>/api/health` y exige que muestre la `version` igual al `<sha>`.
5. Corre la E2E de arranque contra la URL pública.

Gotchas heredados de Requiem: arrancar node con `realpath` (no a través de un symlink) y normalizar los permisos del tar de Windows. Si Cloudflare inyecta `beacon.min.js`, la CSP debe permitirlo.

## 7. Costos (estimados, **verificar con la calculadora al aprobar D3**)
| Concepto | Supuesto | Orden de magnitud |
|---|---|---|
| EC2 t4g.medium + EIP + EBS | ~8 días encendida | USD 5–8 |
| DynamoDB on-demand | Miles de escrituras y lecturas | < USD 1 |
| Transferencia de salida | 2 h con 10 salas llenas ≈ 20 GB | USD 2–4 |
| Worker de Cloudflare | Plan gratuito | USD 0 |

No pude confirmar las tarifas exactas de us-east-1 en esta preparación (el MCP de precios de AWS no conectó). La solicitud D3 de hasta USD 25 cubre el caso pesimista.

## 8. Capacidad
- **Estático:** lo sirve la caché de Cloudflare, sin límite práctico.
- **Salas:** una t4g.medium (2 vCPU, 2 GB) retransmite sin parsear. El CPU no es el cuello de botella; el ancho de banda sí: unos 270 KB/s por sala llena, así que 40 salas son unos 11 MB/s.
- **Prueba de carga** (W2, opcional): un script con 40 sockets simulando 10 salas durante 60 s; verde si p95 < 150 ms y no se pierde ninguna snapshot.

## 9. Operación y desmontaje
- Ver logs y reiniciar, siempre por SSM: `aws ssm send-command --document-name AWS-RunShellScript ...` con `journalctl -u cfg-server -n 200`.
- **Desmontaje** (`infra/TEARDOWN.md`, requiere aprobación del PO):
  1. Exportar el top del leaderboard a `docs/RESULTADOS.md`.
  2. `aws cloudformation delete-stack --stack-name cfg-buildday`.
  3. Borrar el Worker y la ruta.
  4. Borrar `/cfg-buildday/origin-secret`.
- **Verificar disponibilidad regional** antes del deploy (t4g y DynamoDB en us-east-1). Requiem ya usa t4g ahí.
