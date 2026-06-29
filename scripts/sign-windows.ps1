param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$BinaryPath
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$defaultPfx = Join-Path $root "packaging/windows/devcert.pfx"
$pfx = if ($env:WINDOWS_SIGN_PFX_PATH) { $env:WINDOWS_SIGN_PFX_PATH } else { $defaultPfx }

if (-not (Test-Path $pfx)) {
  Write-Host "No Windows signing certificate found at $pfx — skipping Authenticode signing."
  exit 0
}

$password = if ($env:WINDOWS_SIGN_PFX_PASSWORD) { $env:WINDOWS_SIGN_PFX_PASSWORD } else { "password" }
$timestamp = if ($env:WINDOWS_SIGN_TIMESTAMP_URL) {
  $env:WINDOWS_SIGN_TIMESTAMP_URL
} else {
  "http://timestamp.digicert.com"
}

$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) {
  $sdkSignTool = Get-ChildItem -Path "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "x64\\signtool\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if ($sdkSignTool) {
    $signtool = $sdkSignTool.FullName
  }
}

if (-not $signtool) {
  Write-Host "signtool.exe not found — skipping Authenticode signing."
  exit 0
}

Write-Host "Signing $BinaryPath"
& $signtool sign /fd SHA256 /f $pfx /p $password /tr $timestamp /td SHA256 $BinaryPath
if ($LASTEXITCODE -ne 0) {
  Write-Error "signtool failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}
