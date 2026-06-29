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

Write-Host "Signing $BinaryPath"
& signtool sign /fd SHA256 /f $pfx /p $password /tr $timestamp /td SHA256 $BinaryPath
if ($LASTEXITCODE -ne 0) {
  throw "signtool failed with exit code $LASTEXITCODE"
}
