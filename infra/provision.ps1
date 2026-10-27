#Requires -Version 7.0
<#
.SYNOPSIS
  Crea (o actualiza) la infraestructura de Claude for Gamers: stack cfg-buildday, secreto de origen y Worker.

.DESCRIPTION
  1. aws cloudformation deploy del stack cfg-buildday en us-east-1 (EC2 t4g.medium, DynamoDB, IAM, alarmas).
  2. Secreto de origen: si /cfg-buildday/origin-secret no existe (o con -RotateSecret) genera 48 bytes aleatorios
     y los guarda como SSM SecureString y como secreto del Worker (ORIGIN_SECRET). El valor vive solo en memoria:
     no se imprime, no se escribe en archivos y nunca se lee de vuelta (no se usa get-secret-value).
  3. Despliega el Worker cfg-buildday (gamers.kadi.technology) con ORIGIN = PublicDns del stack.
  4. Con -RotateSecret reinicia cfg-server por SSM para que lea el secreto nuevo.

  El código del servidor se despliega aparte con infra/deploy.ps1.

.EXAMPLE
  pwsh infra/provision.ps1
  pwsh infra/provision.ps1 -RotateSecret
#>
[CmdletBinding()]
param(
  [switch]$RotateSecret,
  [switch]$SkipWorker,
  [string]$AwsProfile = 'kadi-admin',
  [string]$Region = 'us-east-1',
  [string]$StackName = 'cfg-buildday',
  [string]$SecretName = '/cfg-buildday/origin-secret'
)
$ErrorActionPreference = 'Stop'
$infra = $PSScriptRoot
$root = Split-Path $infra -Parent
Set-Location $root

function Invoke-Aws {
  param([Parameter(Mandatory)][string[]]$Arguments)
  $out = & aws @Arguments --profile $AwsProfile --region $Region
  if ($LASTEXITCODE -ne 0) { throw "aws $($Arguments[0]) $($Arguments[1]) falló (código $LASTEXITCODE)." }
  return $out
}

function Get-StackOutput([string]$Key) {
  $v = Invoke-Aws @('cloudformation', 'describe-stacks', '--stack-name', $StackName, '--query', "Stacks[0].Outputs[?OutputKey=='$Key'].OutputValue", '--output', 'text')
  return ($v | Out-String).Trim()
}

# --- 1. Stack --------------------------------------------------------------------------------
Write-Host "Validando la plantilla..."
Invoke-Aws @('cloudformation', 'validate-template', '--template-body', "file://$infra/cfn/stack.yaml", '--query', 'Parameters[0].ParameterKey', '--output', 'text') | Out-Null

Write-Host "Desplegando el stack $StackName en $Region (tarda unos minutos)..."
Invoke-Aws @('cloudformation', 'deploy', '--stack-name', $StackName, '--template-file', "$infra/cfn/stack.yaml",
  '--capabilities', 'CAPABILITY_NAMED_IAM', '--no-fail-on-empty-changeset',
  '--tags', 'proyecto=claude-for-gamers-build-day', 'evento=2026-10-26', 'dueno=kadi')

$instanceId = Get-StackOutput 'InstanceId'
$publicIp = Get-StackOutput 'PublicIp'
$publicDns = Get-StackOutput 'PublicDns'
$tableName = Get-StackOutput 'TableName'
Write-Host "InstanceId : $instanceId"
Write-Host "PublicIp   : $publicIp"
Write-Host "PublicDns  : $publicDns"
Write-Host "TableName  : $tableName"

# --- 2. Secreto de origen ---------------------------------------------------------------------
$exists = $false
$found = & aws ssm describe-parameters --parameter-filters "Key=Name,Option=Equals,Values=$SecretName" --query 'Parameters[0].Name' --output text --profile $AwsProfile --region $Region
if ($LASTEXITCODE -eq 0 -and $found -and $found -ne 'None') { $exists = $true }
$newSecret = (-not $exists) -or $RotateSecret

if ($newSecret) {
  $bytes = [byte[]]::new(48)
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  [Array]::Clear($bytes, 0, $bytes.Length)

  # --value=... (con "=") evita que un valor que empiece con "-" se tome como opción.
  & aws ssm put-parameter --name $SecretName --type SecureString --overwrite "--value=$secret" `
    --description 'Secreto X-Origin-Secret entre el Worker cfg-buildday y el origen EC2' `
    --profile $AwsProfile --region $Region --output text | Out-Null
  if ($LASTEXITCODE -ne 0) { $secret = $null; throw 'No se pudo guardar el parámetro SSM del secreto de origen.' }
  & aws ssm add-tags-to-resource --resource-type Parameter --resource-id $SecretName `
    --tags Key=proyecto,Value=claude-for-gamers-build-day Key=evento,Value=2026-10-26 Key=dueno,Value=kadi `
    --profile $AwsProfile --region $Region | Out-Null
  Write-Host "Secreto de origen guardado en SSM ($SecretName)."
} else {
  Write-Host "El secreto $SecretName ya existe; no se toca (usa -RotateSecret para regenerarlo)."
}

# --- 3. Worker --------------------------------------------------------------------------------
if (-not $SkipWorker) {
  Push-Location (Join-Path $infra 'worker')
  try {
    npx --yes wrangler@4 deploy --var "ORIGIN:http://$publicDns"
    if ($LASTEXITCODE -ne 0) { throw 'wrangler deploy falló.' }
    if ($newSecret) {
      # El valor entra por stdin; wrangler no lo imprime.
      $secret | npx --yes wrangler@4 secret put ORIGIN_SECRET
      if ($LASTEXITCODE -ne 0) { throw 'wrangler secret put ORIGIN_SECRET falló.' }
    }
  } finally {
    Pop-Location
    $secret = $null
  }
} else {
  $secret = $null
}

# --- 4. Rotación: el servicio lee el secreto al arrancar --------------------------------------
if ($RotateSecret) {
  $cmd = @{ commands = @('systemctl is-enabled cfg-server >/dev/null 2>&1 && systemctl restart cfg-server || true') } | ConvertTo-Json -Compress
  $tmp = Join-Path ([IO.Path]::GetTempPath()) 'cfg-rotate.json'
  Set-Content -Path $tmp -Value $cmd -Encoding utf8NoBOM
  try {
    Invoke-Aws @('ssm', 'send-command', '--instance-ids', $instanceId, '--document-name', 'AWS-RunShellScript',
      '--parameters', "file://$tmp", '--query', 'Command.CommandId', '--output', 'text') | Out-Null
    Write-Host 'Reinicio de cfg-server solicitado por SSM.'
  } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Write-Host "Listo. Siguiente paso: pwsh infra/deploy.ps1  (despliega el código del servidor)." -ForegroundColor Green
