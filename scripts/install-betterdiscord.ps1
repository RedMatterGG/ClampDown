param([string]$PluginsPath = (Join-Path $env:APPDATA 'BetterDiscord\plugins'))
$ErrorActionPreference = 'Stop'
$source = Join-Path (Split-Path -Parent $PSScriptRoot) 'dist\ClampDown.plugin.js'
if (-not (Test-Path -LiteralPath $source)) { throw 'Build ClampDown first: npm install; npm run build' }
if (-not (Test-Path -LiteralPath $PluginsPath)) { throw 'BetterDiscord plugins folder not found. Install BetterDiscord first or supply -PluginsPath.' }
$destination = Join-Path $PluginsPath 'ClampDown.plugin.js'
if (Test-Path -LiteralPath $destination) { Copy-Item -LiteralPath $destination -Destination "$destination.backup-$(Get-Date -Format yyyyMMdd-HHmmss)" }
Copy-Item -LiteralPath $source -Destination $destination -Force
Write-Host 'ClampDown installed. Enable it in Discord > Settings > BetterDiscord > Plugins.'
