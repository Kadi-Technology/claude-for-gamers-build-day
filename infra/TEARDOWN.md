# Desmontaje de la infraestructura (Claude for Gamers - Build Day)

La infraestructura vive **un día** (D3: tope de USD 25, región `us-east-1`). El desmontaje está previsto para el **2026-10-27** y **requiere la aprobación del PO**: borra datos y no se puede deshacer.

Todos los comandos usan el perfil `kadi-admin` (el mismo de Requiem). Ejecútalos desde la raíz del repo, en PowerShell 7.

## 0. Antes de empezar
- [ ] El PO aprobó el desmontaje por escrito en el chat.
- [ ] El evento terminó y ya no se necesita `https://gamers.kadi.technology`.
- [ ] Recuento de lo que existe (para comparar al final):

```powershell
aws cloudformation describe-stacks --stack-name cfg-buildday --region us-east-1 --profile kadi-admin --query "Stacks[0].[StackStatus,Outputs]"
```

## 1. Exportar el leaderboard (resultados del evento)
Guarda el top en `docs/RESULTADOS.md` **antes** de borrar la tabla. La API pública devuelve el top por juego:

```powershell
foreach ($g in 'xochimilco', 'angel') {
  "## $g"
  Invoke-RestMethod "https://gamers.kadi.technology/api/leaderboard/${g}?scope=event&limit=20" | ConvertTo-Json -Depth 6
}
```

Respaldo completo de la tabla (se conserva hasta que el PO diga que se borre):

```powershell
aws dynamodb create-backup --table-name cfg-buildday-leaderboard --backup-name cfg-buildday-final --region us-east-1 --profile kadi-admin
```

Nota: los respaldos bajo demanda no se borran con el stack; tienen un costo mínimo por GB-mes. Bórralo cuando el PO lo indique con `aws dynamodb delete-backup --backup-arn <arn>`.

## 2. Borrar el stack
Elimina la instancia EC2, la IP elástica, el security group, el rol IAM, las alarmas y la tabla DynamoDB (con su PITR).

```powershell
aws cloudformation delete-stack --stack-name cfg-buildday --region us-east-1 --profile kadi-admin
aws cloudformation wait stack-delete-complete --stack-name cfg-buildday --region us-east-1 --profile kadi-admin
```

Si falla, revisa qué recurso bloquea el borrado:

```powershell
aws cloudformation describe-stack-events --stack-name cfg-buildday --region us-east-1 --profile kadi-admin --query "StackEvents[?ResourceStatus=='DELETE_FAILED'].[LogicalResourceId,ResourceStatusReason]" --output table
```

## 3. Borrar el Worker y la ruta
Quita el Worker `cfg-buildday` y el dominio personalizado `gamers.kadi.technology`:

```powershell
Push-Location infra/worker
npx --yes wrangler@4 delete --name cfg-buildday
Pop-Location
```

Verifica en el panel de Cloudflare (Workers & Pages > cfg-buildday ya no aparece) y en **DNS** de la zona `kadi.technology` que no queda ningún registro de `gamers`. Si queda alguno, bórralo a mano.

## 4. Borrar el secreto de origen

```powershell
aws ssm delete-parameter --name /cfg-buildday/origin-secret --region us-east-1 --profile kadi-admin
```

## 5. Limpieza opcional de los releases en S3
Los paquetes `cfg-buildday-<sha>.tgz` pesan pocos MB. Si el PO quiere borrarlos (el bucket vive en `mx-central-1` y es compartido con otros proyectos, así que **solo** el prefijo `cfg-buildday/`):

```powershell
aws s3 ls s3://kadi-releases-384668480384/cfg-buildday/ --region mx-central-1 --profile kadi-admin
aws s3 rm s3://kadi-releases-384668480384/cfg-buildday/ --recursive --region mx-central-1 --profile kadi-admin
```

## 6. Verificación final

```powershell
# El stack ya no existe (debe fallar con "does not exist")
aws cloudformation describe-stacks --stack-name cfg-buildday --region us-east-1 --profile kadi-admin
# No quedan IPs elásticas ni instancias con la etiqueta del proyecto
aws ec2 describe-addresses --region us-east-1 --profile kadi-admin --filters Name=tag:proyecto,Values=claude-for-gamers-build-day
aws ec2 describe-instances --region us-east-1 --profile kadi-admin --filters Name=tag:proyecto,Values=claude-for-gamers-build-day Name=instance-state-name,Values=pending,running,stopping,stopped
# La tabla ya no existe
aws dynamodb describe-table --table-name cfg-buildday-leaderboard --region us-east-1 --profile kadi-admin
# El dominio ya no responde desde el Worker
curl.exe -sI https://gamers.kadi.technology
```

- [ ] Stack, IP elástica, instancia y tabla: sin resultados.
- [ ] Worker y dominio: eliminados.
- [ ] Parámetro `/cfg-buildday/origin-secret`: eliminado.
- [ ] Un día después, revisar Cost Explorer filtrando por la etiqueta `proyecto=claude-for-gamers-build-day` para confirmar que el gasto se detuvo y quedó por debajo de USD 25.
