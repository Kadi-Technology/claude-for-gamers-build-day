#Requires -Version 7.0
<#
.SYNOPSIS
  Despliega un release del servidor de Claude for Gamers en la instancia cfg-buildday (us-east-1).

.DESCRIPTION
  Pasos (docs/04 §6):
    1. npm test en server/ (aborta si hay rojos; se omite con -SkipTests).
    2. Empaqueta HEAD con git archive (sin node_modules, .git, docs, tests ni infra) como
       cfg-buildday-<sha>.tgz y lo sube a s3://kadi-releases-384668480384/cfg-buildday/ (mx-central-1).
    3. Lanza cfg-deploy <sha> por SSM Run Command en us-east-1 y espera el resultado
       (en la instancia: descarga, npm ci --omit=dev, symlink current y reinicio; revierte si no queda sano).
    4. Verifica https://gamers.kadi.technology/api/health y exige version = sha.
    5. Corre la E2E de arranque contra la URL pública (se omite con -SkipE2E).

  La infraestructura se crea antes con infra/provision.ps1 (stack cfg-buildday, secreto de origen y Worker).

.EXAMPLE
  pwsh infra/deploy.ps1
  pwsh infra/deploy.ps1 -SkipTests
  pwsh infra/deploy.ps1 -Sha 1a2b3c4      # revierte a un release que ya está en S3
#>
[CmdletBinding()]
param(
  [switch]$SkipTests,
  [switch]$SkipE2E,
  [switch]$AllowDirty,
  [switch]$Worker,
  [string]$Sha,
  [string]$AwsProfile = 'kadi-admin',
  [string]$Region = 'us-east-1',
  [string]$ReleaseRegion = 'mx-central-1',
  [string]$Bucket = 'kadi-releases-384668480384',
  [string]$StackName = 'cfg-buildday',
  [string]$Domain = 'gamers.kadi.technology'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Invoke-Aws {
  param([Parameter(Mandatory)][string[]]$Arguments, [string]$AwsRegion = $Region)
  $out = & aws @Arguments --profile $AwsProfile --region $AwsRegion
  if ($LASTEXITCODE -ne 0) { throw "aws $($Arguments[0]) $($Arguments[1]) falló (código $LASTEXITCODE)." }
  return $out
}

function Get-StackOutput([string]$Key) {
  $v = Invoke-Aws @('cloudformation', 'describe-stacks', '--stack-name', $StackName, '--query', "Stacks[0].Outputs[?OutputKey=='$Key'].OutputValue", '--output', 'text')
  if (-not $v -or $v -eq 'None') { throw "El stack $StackName no tiene el output $Key. ¿Corriste infra/provision.ps1?" }
  return ($v | Out-String).Trim()
}

# --- 1. Versión y árbol limpio ---------------------------------------------------------------
$rollback = [bool]$Sha
if ($rollback) {
  if ($Sha -notmatch '^[0-9A-Za-z._-]+$') { throw "Sha inválido: $Sha" }
} else {
  $dirty = git status --porcelain
  if ($dirty -and -not $AllowDirty) {
    throw "Hay cambios sin commit. Commitea antes de desplegar (el paquete sale de HEAD) o usa -AllowDirty.`n$($dirty -join "`n")"
  }
  if ($dirty) { Write-Warning 'Árbol sucio: solo se despliega lo que está commiteado en HEAD.' }
  $Sha = (git rev-parse --short HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $Sha) { throw 'No se pudo leer el sha de HEAD.' }
}
$key = "cfg-buildday/cfg-buildday-$Sha.tgz"
Write-Host "Release $Sha -> s3://$Bucket/$key"

if (-not $rollback) {
  # --- 2. Pruebas del servidor ----------------------------------------------------------------
  if ($SkipTests) {
    Write-Warning 'Pruebas omitidas (-SkipTests).'
  } else {
    Push-Location (Join-Path $root 'server')
    try {
      if (-not (Test-Path 'node_modules')) {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci en server/ falló.' }
      }
      npm test
      if ($LASTEXITCODE -ne 0) { throw 'Pruebas del servidor en rojo: no se despliega.' }
    } finally { Pop-Location }
  }

  # --- 3. Paquete y subida a S3 ---------------------------------------------------------------
  git cat-file -e "${Sha}:server/src/index.js"
  if ($LASTEXITCODE -ne 0) { throw "El commit $Sha no tiene server/src/index.js." }
  git cat-file -e "${Sha}:server/package-lock.json" 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Warning 'server/package-lock.json no está commiteado: la instancia usará npm install en vez de npm ci.' }

  $pkg = Join-Path ([IO.Path]::GetTempPath()) "cfg-buildday-$Sha.tgz"
  git archive --format=tar.gz -o $pkg $Sha -- . ':(exclude)docs' ':(exclude)tests' ':(exclude)infra' ':(exclude)server/test' ':(exclude).git*'
  if ($LASTEXITCODE -ne 0) { throw 'git archive falló.' }
  Write-Host ("Paquete {0} ({1:N1} MB)" -f $pkg, ((Get-Item $pkg).Length / 1MB))

  Invoke-Aws @('s3', 'cp', $pkg, "s3://$Bucket/$key", '--only-show-errors') -AwsRegion $ReleaseRegion | Out-Null
  Remove-Item $pkg -Force
} else {
  & aws s3api head-object --bucket $Bucket --key $key --profile $AwsProfile --region $ReleaseRegion --query ContentLength --output text | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "No existe s3://$Bucket/${key}: no se puede revertir a $Sha." }
  Write-Host "Reversión al release $Sha (ya está en S3)."
}

# --- 4. Worker opcional (el origen sale del stack) -------------------------------------------
$instanceId = Get-StackOutput 'InstanceId'
if ($Worker) {
  $dns = Get-StackOutput 'PublicDns'
  Push-Location (Join-Path $PSScriptRoot 'worker')
  try {
    npx --yes wrangler@4 deploy --var "ORIGIN:http://$dns"
    if ($LASTEXITCODE -ne 0) { throw 'wrangler deploy falló.' }
  } finally { Pop-Location }
}

# --- 5. SSM Run Command: cfg-deploy <sha> ----------------------------------------------------
Write-Host "Esperando a que $instanceId esté en línea en SSM..."
$online = $false
foreach ($i in 1..30) {
  $ping = & aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$instanceId" --query 'InstanceInformationList[0].PingStatus' --output text --profile $AwsProfile --region $Region
  if ($ping -eq 'Online') { $online = $true; break }
  Start-Sleep -Seconds 6
}
if (-not $online) { throw "La instancia $instanceId no está Online en SSM." }

$paramFile = Join-Path ([IO.Path]::GetTempPath()) "cfg-ssm-$Sha.json"
@{ commands = @("/usr/local/bin/cfg-deploy $Sha"); executionTimeout = @('900') } | ConvertTo-Json -Compress | Set-Content -Path $paramFile -Encoding utf8NoBOM
try {
  $cmdId = (Invoke-Aws @('ssm', 'send-command', '--instance-ids', $instanceId, '--document-name', 'AWS-RunShellScript',
      '--parameters', "file://$paramFile", '--comment', "cfg-deploy $Sha", '--query', 'Command.CommandId', '--output', 'text') | Out-String).Trim()
} finally { Remove-Item $paramFile -Force -ErrorAction SilentlyContinue }
Write-Host "Comando SSM $cmdId"

$terminal = @('Success', 'Failed', 'Cancelled', 'TimedOut', 'DeliveryTimedOut', 'ExecutionTimedOut', 'Undeliverable', 'Terminated')
$deadline = (Get-Date).AddMinutes(15)
$status = ''
do {
  Start-Sleep -Seconds 4
  $status = (& aws ssm get-command-invocation --command-id $cmdId --instance-id $instanceId --query Status --output text --profile $AwsProfile --region $Region 2>$null | Out-String).Trim()
} while ($status -notin $terminal -and (Get-Date) -lt $deadline)

$stdout = & aws ssm get-command-invocation --command-id $cmdId --instance-id $instanceId --query StandardOutputContent --output text --profile $AwsProfile --region $Region
$stderr = & aws ssm get-command-invocation --command-id $cmdId --instance-id $instanceId --query StandardErrorContent --output text --profile $AwsProfile --region $Region
if ($stdout) { Write-Host ($stdout -join "`n") }
if ($status -ne 'Success') {
  if ($stderr) { Write-Host ($stderr -join "`n") -ForegroundColor Red }
  throw "cfg-deploy terminó con estado '$status'."
}

# --- 6. Verificación pública: /api/health con version = sha ----------------------------------
$healthOk = $false
foreach ($i in 1..30) {
  try {
    $h = Invoke-RestMethod -Uri "https://$Domain/api/health?cb=$([DateTime]::UtcNow.Ticks)" -TimeoutSec 10
    if ($h.ok -and $h.version -eq $Sha) { $healthOk = $true; break }
    Write-Host "health: version=$($h.version) (esperaba $Sha)"
  } catch {
    Write-Host "health: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 4
}
if (-not $healthOk) { throw "https://$Domain/api/health no devolvió version=$Sha. ¿Está desplegado el Worker (infra/provision.ps1 o -Worker)?" }
Write-Host "OK https://$Domain/api/health -> version=$Sha" -ForegroundColor Green

# --- 7. E2E de arranque contra la URL pública -------------------------------------------------
$e2e = Join-Path $root 'tests/e2e/lobby.e2e.mjs'
if ($SkipE2E) {
  Write-Warning 'E2E omitida (-SkipE2E).'
} elseif (-not (Test-Path $e2e)) {
  Write-Warning 'No existe tests/e2e/lobby.e2e.mjs; se omite la E2E de arranque.'
} else {
  node $e2e "https://$Domain"
  if ($LASTEXITCODE -ne 0) { throw 'La E2E de arranque falló contra la URL pública.' }
  Write-Host 'E2E de arranque en verde.' -ForegroundColor Green
}

Write-Host "Despliegue completo: $Sha en https://$Domain"
