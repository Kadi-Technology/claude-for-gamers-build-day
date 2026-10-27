#Requires -Version 7.0
<#
.SYNOPSIS
  Valida la infraestructura de Claude for Gamers sin depender de que cfn-lint esté en el PATH.

.DESCRIPTION
  1. cfn-lint sobre infra/cfn/stack.yaml. Busca el ejecutable en este orden:
       a) cfn-lint en el PATH
       b) <APPDATA>\Python\Python*\Scripts\cfn-lint.exe  (pip install --user, el caso de este equipo)
       c) <Python>\Scripts\cfn-lint.exe junto al python del PATH
       d) python -c "from cfnlint.runner import main"  (cfn-lint 1.x no trae cfnlint/__main__.py,
          así que `python -m cfnlint` no funciona; este es su punto de entrada real)
     Si no encuentra ninguno, FALLA con código 1 y el mensaje de instalación (nunca devuelve 0 en silencio).
  2. aws cloudformation validate-template en us-east-1 (omitir con -SkipAws, p. ej. sin credenciales).
  3. Sintaxis del Worker (ES module) con node --check.

  Código de salida: 0 todo válido, 1 cualquier fallo o herramienta no encontrada.

.EXAMPLE
  pwsh infra/lint.ps1
  pwsh infra/lint.ps1 -SkipAws
#>
[CmdletBinding()]
param(
  [switch]$SkipAws,
  [string]$AwsProfile = 'kadi-admin',
  [string]$Region = 'us-east-1'
)
$ErrorActionPreference = 'Stop'
$infra = $PSScriptRoot
$template = Join-Path $infra 'cfn/stack.yaml'
$worker = Join-Path $infra 'worker/src/index.js'
$failed = $false

function Find-CfnLint {
  $cmd = Get-Command cfn-lint -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) { return @{ Exe = $cmd.Source; Args = @(); How = "PATH ($($cmd.Source))" } }

  $roots = @()
  if ($env:APPDATA) { $roots += Join-Path $env:APPDATA 'Python' }
  foreach ($r in $roots) {
    if (Test-Path $r) {
      $hit = Get-ChildItem -Path $r -Directory -Filter 'Python*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'Scripts/cfn-lint.exe' } |
        Where-Object { Test-Path $_ } | Select-Object -First 1
      if ($hit) { return @{ Exe = $hit; Args = @(); How = $hit } }
    }
  }

  $py = Get-Command python -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($py) {
    $scripts = Join-Path (Split-Path $py.Source -Parent) 'Scripts/cfn-lint.exe'
    if (Test-Path $scripts) { return @{ Exe = $scripts; Args = @(); How = $scripts } }
    # Sin -I: el modo aislado oculta el site-packages del usuario donde pip --user instala cfn-lint.
    & $py.Source -c 'import cfnlint' 2>$null
    if ($LASTEXITCODE -eq 0) {
      return @{
        Exe  = $py.Source
        Args = @('-c', 'import sys; from cfnlint.runner import main; sys.argv[0] = "cfn-lint"; sys.exit(main())')
        How  = "$($py.Source) (cfnlint.runner)"
      }
    }
  }
  return $null
}

# --- 1. cfn-lint ------------------------------------------------------------------------------
$lint = Find-CfnLint
if (-not $lint) {
  Write-Host 'cfn-lint: NO ENCONTRADO. Instálalo con: python -m pip install --user cfn-lint' -ForegroundColor Red
  exit 1
}
Write-Host "cfn-lint: $($lint.How)"
& $lint.Exe @($lint.Args) $template
if ($LASTEXITCODE -ne 0) {
  Write-Host "cfn-lint: hallazgos en $template (código $LASTEXITCODE)" -ForegroundColor Red
  $failed = $true
} else {
  Write-Host 'cfn-lint: OK (sin errores ni advertencias)' -ForegroundColor Green
}

# --- 2. validate-template ---------------------------------------------------------------------
if ($SkipAws) {
  Write-Warning 'aws cloudformation validate-template omitido (-SkipAws).'
} else {
  & aws cloudformation validate-template --template-body "file://$template" --profile $AwsProfile --region $Region --query 'Parameters[].ParameterKey' --output text | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "validate-template: falló (código $LASTEXITCODE)" -ForegroundColor Red
    $failed = $true
  } else {
    Write-Host "validate-template ($Region): OK" -ForegroundColor Green
  }
}

# --- 3. Sintaxis del Worker -------------------------------------------------------------------
Get-Content -Raw $worker | node --input-type=module --check
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Worker: error de sintaxis en infra/worker/src/index.js' -ForegroundColor Red
  $failed = $true
} else {
  Write-Host 'Worker: sintaxis OK' -ForegroundColor Green
}

if ($failed) { exit 1 }
Write-Host 'Infraestructura válida.' -ForegroundColor Green
exit 0
