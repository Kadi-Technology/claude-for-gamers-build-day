# infra/ - AWS y Cloudflare de Claude for Gamers

Referencia: `docs/04_INFRA_AWS.md`. Región `us-east-1`, perfil `kadi-admin`, PowerShell 7.

```
Navegador -> Cloudflare Worker (gamers.kadi.technology) -> EC2 t4g.medium :80 -> DynamoDB cfg-buildday-leaderboard
                  + X-Origin-Secret                         (systemd cfg-server)
```

| Archivo | Para qué |
|---|---|
| `cfn/stack.yaml` | Stack `cfg-buildday`: EC2 (AL2023 arm64, IMDSv2, gp3 cifrado, sin key pair) + EIP, SG solo :80 desde Cloudflare, DynamoDB, IAM, alarmas |
| `worker/` | Worker `cfg-buildday`: proxy HTTP y WebSocket al origen con `X-Origin-Secret` |
| `lint.ps1` | Valida la plantilla (cfn-lint + validate-template) y la sintaxis del Worker; encuentra cfn-lint aunque no esté en el PATH y falla con código 1 si no existe |
| `provision.ps1` | Crea el stack, el secreto de origen (SSM + Worker) y publica el Worker |
| `deploy.ps1` | Despliega el código: pruebas, paquete a S3, `cfg-deploy` por SSM, verifica `/api/health` |
| `TEARDOWN.md` | Desmontaje del 2026-10-27 (requiere aprobación del PO) |

## Primera vez
```powershell
pwsh infra/lint.ps1             # cfn-lint + validate-template + sintaxis del Worker (-SkipAws sin credenciales)
pwsh infra/provision.ps1        # stack + secreto + Worker
pwsh infra/deploy.ps1           # código del servidor
```

## Cada despliegue de código
```powershell
pwsh infra/deploy.ps1                  # pruebas, paquete, SSM, health con version = sha, E2E de arranque
pwsh infra/deploy.ps1 -SkipTests       # sin npm test
pwsh infra/deploy.ps1 -Sha 1a2b3c4     # volver a un release que ya está en S3
```

## Operación (siempre por SSM, sin SSH)
```powershell
$id = aws cloudformation describe-stacks --stack-name cfg-buildday --region us-east-1 --profile kadi-admin --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text

# Logs recientes del servicio
$c = aws ssm send-command --instance-ids $id --document-name AWS-RunShellScript --region us-east-1 --profile kadi-admin --parameters 'commands=["journalctl -u cfg-server -n 200 --no-pager"]' --query Command.CommandId --output text
Start-Sleep 3; aws ssm get-command-invocation --command-id $c --instance-id $id --region us-east-1 --profile kadi-admin --query StandardOutputContent --output text

# Reiniciar el servicio
aws ssm send-command --instance-ids $id --document-name AWS-RunShellScript --region us-east-1 --profile kadi-admin --parameters 'commands=["systemctl restart cfg-server"]'
```

## En la instancia
- `/usr/local/bin/cfg-deploy <sha>`: baja `s3://kadi-releases-384668480384/cfg-buildday/cfg-buildday-<sha>.tgz` (bucket en `mx-central-1`), extrae en `/opt/cfg/releases/<sha>`, `npm ci --omit=dev` en `server/`, escribe `VERSION.txt`, mueve el symlink `/opt/cfg/current`, reinicia y exige `/api/health` con esa `version`; si no queda sano, vuelve al release anterior. Conserva los 3 releases más recientes.
- `cfg-server.service`: usuario `cfg`, puerto 80 (`CAP_NET_BIND_SERVICE`), `STORE=dynamo`, `AWS_REGION=us-east-1`. Antes de cada arranque lee `ORIGIN_SECRET` de SSM `/cfg-buildday/origin-secret` y arranca `node-24` con la ruta `realpath` de `server/src/index.js`.

## Contrato con el servidor
- `GET /api/health` debe responder sin `X-Origin-Secret` y con `version` igual al contenido de `VERSION.txt` (también llega como `CFG_VERSION`).
- Las demás rutas exigen `X-Origin-Secret` (variable `ORIGIN_SECRET`).
- El Worker manda la IP real del visitante en `X-Forwarded-For` y `X-Real-IP` (el origen solo recibe tráfico de Cloudflare, así que es confiable para el límite de tasa).
