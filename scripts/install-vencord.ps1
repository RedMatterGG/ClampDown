param(
    [string]$VencordPath = (Join-Path $env:LOCALAPPDATA 'ClampDown\Vencord'),
    [switch]$BuildOnly
)
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$pluginSource = Join-Path $sourceRoot 'dist\vencord\clampDown.desktop'
if (-not (Test-Path -LiteralPath (Join-Path $pluginSource 'index.tsx'))) { throw 'Build ClampDown first: npm install; npm run build' }
foreach ($tool in @('git','node','npx.cmd')) { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Install $tool before running this installer." } }
$VencordPath = [IO.Path]::GetFullPath($VencordPath)
if (-not (Test-Path -LiteralPath $VencordPath)) {
    & git clone --depth 1 https://github.com/Vendicated/Vencord.git $VencordPath
    if ($LASTEXITCODE -ne 0) { throw 'Could not clone Vencord.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $VencordPath 'src\plugins'))) { throw 'The target is not a Vencord source checkout.' }
$destination = Join-Path $VencordPath 'src\userplugins\clampDown.desktop'
if (Test-Path -LiteralPath $destination) {
    $backup = "$destination.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Copy-Item -LiteralPath $destination -Destination $backup -Recurse
    Write-Host "Existing ClampDown source backed up to $backup"
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Get-ChildItem -LiteralPath $pluginSource -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $destination $_.Name) -Force }
Push-Location $VencordPath
try {
    & npx.cmd --yes pnpm@11.9.0 install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Vencord dependency installation failed.' }
    & npx.cmd --yes pnpm@11.9.0 build --standalone
    if ($LASTEXITCODE -ne 0) { throw 'Vencord build failed.' }
    if (-not $BuildOnly) {
        & npx.cmd --yes pnpm@11.9.0 inject
        if ($LASTEXITCODE -ne 0) { throw 'Vencord installation failed.' }
    }
} finally { Pop-Location }
Write-Host 'ClampDown built. Restart Discord, then enable ClampDown in Settings > Vencord > Plugins.'
