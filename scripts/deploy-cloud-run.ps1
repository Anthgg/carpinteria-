<#
.SYNOPSIS
  Despliega Ordenada 360 en Cloud Run (un servicio, frontend ingress + backend sidecar).

.DESCRIPTION
  1. Verifica configuración y que los working trees estén limpios (las imágenes se etiquetan por commit).
  2. (Opcional -Build) construye y sube las imágenes a Artifact Registry; si no, exige que ya existan.
  3. Exige `npm run db:supabase:status` = "up to date". NUNCA migra: si hay migraciones pendientes,
     aborta y hay que ejecutarlas a propósito (`npm run db:supabase:deploy` con confirmación).
  4. Renderiza deploy/cloudrun/service.template.yaml y ejecuta `gcloud run services replace`.

  No lee ni imprime secretos: el servicio referencia Secret Manager por nombre y versión. De
  Bcarpinteria/.env.supabase solo toma valores NO secretos (SUPABASE_URL, bucket, VAPID público…).

.EXAMPLE
  ./scripts/deploy-cloud-run.ps1 -ProjectId ordenada-360-xxxxxx -PublicBaseUrl https://ordenada-360-123.us-east5.run.app -Build
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$PublicBaseUrl,
  [string]$Region = 'us-east5',
  [switch]$Build,
  [switch]$AllowPublic,
  [int]$MinInstances = 0,
  [int]$MaxInstances = 3,
  [string]$DatabaseUrlVersion = '1',
  [string]$SupabaseSecretKeyVersion = '1',
  [string]$JwtSecretVersion = '1',
  [string]$VapidPrivateKeyVersion = '1'
)
$ErrorActionPreference = 'Stop'
function Fail($message) { Write-Error $message; exit 1 }

$frontendRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path (Split-Path -Parent $frontendRoot) 'Bcarpinteria'
if ($PublicBaseUrl -notmatch '^https://[a-z0-9.-]+$') { Fail 'PublicBaseUrl debe ser https://host (sin barra final).' }
if (-not (Test-Path (Join-Path $backendRoot 'package.json'))) { Fail "No se encontró el backend en $backendRoot." }

# Valores no secretos desde .env.supabase (las claves secretas nunca se leen aquí).
$envFile = Join-Path $backendRoot '.env.supabase'
if (-not (Test-Path $envFile)) { Fail 'Falta Bcarpinteria/.env.supabase (valores no secretos de Supabase/VAPID).' }
$config = @{}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^(SUPABASE_URL|SUPABASE_STORAGE_BUCKET|VAPID_SUBJECT|VAPID_PUBLIC_KEY|PUSH_TEST_ORDER_CODES)\s*=\s*"?([^"]*)"?\s*$') { $config[$Matches[1]] = $Matches[2] }
}
foreach ($key in 'SUPABASE_URL', 'SUPABASE_STORAGE_BUCKET') { if (-not $config[$key]) { Fail "Falta $key en .env.supabase." } }

# Imágenes etiquetadas por commit: los árboles deben estar limpios.
foreach ($repo in $frontendRoot, $backendRoot) {
  if (git -C $repo status --porcelain) { Fail "Hay cambios sin commitear en $repo; las imágenes se etiquetan por commit." }
}
$registry = "$Region-docker.pkg.dev/$ProjectId/ordenada360"
$backendImage = "$registry/backend:$(git -C $backendRoot rev-parse --short HEAD)"
$frontendImage = "$registry/frontend:$(git -C $frontendRoot rev-parse --short HEAD)"

if ($Build) {
  docker build -t $backendImage --target production $backendRoot; if ($LASTEXITCODE) { Fail 'Falló el build del backend.' }
  docker build -t $frontendImage --target cloudrun $frontendRoot; if ($LASTEXITCODE) { Fail 'Falló el build del frontend.' }
  docker push $backendImage; if ($LASTEXITCODE) { Fail 'Falló el push del backend.' }
  docker push $frontendImage; if ($LASTEXITCODE) { Fail 'Falló el push del frontend.' }
}
# Despliega por digest (inmutable).
$images = @{}
foreach ($pair in @(@('backend', $backendImage), @('frontend', $frontendImage))) {
  $digest = gcloud artifacts docker images describe $pair[1] --project $ProjectId --format 'value(image_summary.digest)' 2>$null
  if (-not $digest) { Fail "No existe la imagen $($pair[1]). Usa -Build." }
  $images[$pair[0]] = "$($pair[1].Split(':')[0])@$digest"
}

# Migraciones: solo comprobación. Nunca se aplican desde aquí.
Push-Location $backendRoot
try {
  $status = (npm run -s db:supabase:status 2>&1) -join "`n"
} finally { Pop-Location }
if ($status -notmatch 'Database schema is up to date') {
  Fail "El esquema de Supabase no está al día. Revisa 'npm run db:supabase:status' y migra a propósito antes de desplegar."
}

$template = Get-Content (Join-Path $frontendRoot 'deploy/cloudrun/service.template.yaml') -Raw
$values = @{
  REGION = $Region; SERVICE_ACCOUNT = "ordenada-360-runtime@$ProjectId.iam.gserviceaccount.com"; MIN_INSTANCES = "$MinInstances"; MAX_INSTANCES = "$MaxInstances"
  FRONTEND_IMAGE = $images.frontend; BACKEND_IMAGE = $images.backend; PUBLIC_BASE_URL = $PublicBaseUrl
  SUPABASE_URL = $config.SUPABASE_URL; SUPABASE_STORAGE_BUCKET = $config.SUPABASE_STORAGE_BUCKET
  VAPID_SUBJECT = "$($config.VAPID_SUBJECT)"; VAPID_PUBLIC_KEY = "$($config.VAPID_PUBLIC_KEY)"; PUSH_TEST_ORDER_CODES = "$($config.PUSH_TEST_ORDER_CODES)"
  DATABASE_URL_VERSION = $DatabaseUrlVersion; SUPABASE_SECRET_KEY_VERSION = $SupabaseSecretKeyVersion
  JWT_SECRET_VERSION = $JwtSecretVersion; VAPID_PRIVATE_KEY_VERSION = $VapidPrivateKeyVersion
}
foreach ($key in $values.Keys) { $template = $template.Replace("{{$key}}", "'" + ($values[$key] -replace "'", "''") + "'") }
if ($template -match '\{\{[A-Z_]+\}\}') { Fail "Quedaron valores sin completar en la plantilla: $($Matches[0])" }
$rendered = Join-Path ([System.IO.Path]::GetTempPath()) "ordenada-360-service-$([guid]::NewGuid()).yaml"
Set-Content -Path $rendered -Value $template -Encoding utf8
try {
  gcloud run services replace $rendered --region $Region --project $ProjectId --quiet
  if ($LASTEXITCODE) { Fail 'Falló el despliegue.' }
} finally { Remove-Item $rendered -ErrorAction SilentlyContinue }

if ($AllowPublic) {
  gcloud run services add-iam-policy-binding ordenada-360 --region $Region --project $ProjectId --member allUsers --role roles/run.invoker --quiet | Out-Null
}
$url = gcloud run services describe ordenada-360 --region $Region --project $ProjectId --format 'value(status.url)'
Write-Host "Servicio: $url"
Write-Host "Imágenes: $($images.backend) | $($images.frontend)"
if ($url -ne $PublicBaseUrl) { Write-Warning "La URL del servicio ($url) difiere de PublicBaseUrl ($PublicBaseUrl): vuelve a desplegar con la URL real." }
