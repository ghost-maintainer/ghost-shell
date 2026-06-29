param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("x64", "arm64")]
  [string]$Arch,

  [Parameter(Mandatory = $true)]
  [string]$RustTarget
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$packagingDir = Join-Path $root "packaging/windows"
$iconsDir = Join-Path $root "src-tauri/icons"
$buildDir = Join-Path $root "build"
$stagingDir = Join-Path $packagingDir "msix-staging"
$exePath = Join-Path $root "src-tauri/target/$RustTarget/release/ghost-shell.exe"
$manifestPath = Join-Path $packagingDir "Package.appxmanifest"

if (-not (Test-Path $exePath)) {
  throw "Release binary not found at $exePath. Build the Windows target before packaging MSIX."
}

$packageJson = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$parts = $packageJson.version.Split(".")
while ($parts.Count -lt 4) { $parts += "0" }
$msixVersion = ($parts[0..3] -join ".")

$manifest = Get-Content $manifestPath -Raw
$manifest = $manifest -replace 'Version="[^"]+"', "Version=`"$msixVersion`""

if (Test-Path $stagingDir) {
  Remove-Item $stagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null

$assetsDir = Join-Path $stagingDir "Assets"
New-Item -ItemType Directory -Path $assetsDir | Out-Null

Copy-Item $exePath (Join-Path $stagingDir "ghost-shell.exe")
Set-Content -Path (Join-Path $stagingDir "Package.appxmanifest") -Value $manifest -Encoding UTF8

$assetFiles = @(
  "StoreLogo.png",
  "Square44x44Logo.png",
  "Square71x71Logo.png",
  "Square89x89Logo.png",
  "Square107x107Logo.png",
  "Square142x142Logo.png",
  "Square150x150Logo.png",
  "Square284x284Logo.png",
  "Square310x310Logo.png"
)

foreach ($file in $assetFiles) {
  $source = Join-Path $iconsDir $file
  if (Test-Path $source) {
    Copy-Item $source (Join-Path $assetsDir $file)
  }
}

Push-Location $packagingDir
try {
  if (-not (Get-Command winapp -ErrorAction SilentlyContinue)) {
    throw "winapp CLI is not installed. Install with: winget install Microsoft.WinAppCLI"
  }

  $pfx = if ($env:WINDOWS_SIGN_PFX_PATH) { $env:WINDOWS_SIGN_PFX_PATH } else { "devcert.pfx" }
  $pfxPassword = if ($env:WINDOWS_SIGN_PFX_PASSWORD) { $env:WINDOWS_SIGN_PFX_PASSWORD } else { "password" }

  if (-not (Test-Path $pfx)) {
    Write-Host "Generating development MSIX certificate (publisher must match Package.appxmanifest)..."
    & winapp cert generate --if-exists skip
    if ($LASTEXITCODE -ne 0) {
      throw "winapp cert generate failed with exit code $LASTEXITCODE"
    }
  }

  New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
  $outputName = "Ghost Shell_${msixVersion}_${Arch}.msix"

  Write-Host "Packaging MSIX for $Arch..."
  & winapp pack $stagingDir --cert $pfx --cert-password $pfxPassword --output (Join-Path $buildDir $outputName)
  if ($LASTEXITCODE -ne 0) {
    throw "winapp pack failed with exit code $LASTEXITCODE"
  }

  Write-Host "MSIX created: $(Join-Path $buildDir $outputName)"
}
finally {
  Pop-Location
  if (Test-Path $stagingDir) {
    Remove-Item $stagingDir -Recurse -Force
  }
}
