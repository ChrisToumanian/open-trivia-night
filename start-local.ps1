param([ValidateRange(1, 65535)][int]$Port = 8080)

$ErrorActionPreference = 'Stop'
$triviaNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$triviaNodePath = if ($triviaNodeCommand) { $triviaNodeCommand.Source } else {
    Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $triviaNodePath)) { throw 'Install Node.js 24 with npm, then run npm ci in this project.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\better-sqlite3'))) { throw 'Dependencies are missing. Run npm ci in this project first.' }
$triviaPreviousPort = $env:PORT
try {
    $env:PORT = [string]$Port
    Write-Host "Host: http://localhost:$Port/host.html"
    Write-Host "Players: http://localhost:$Port/play.html"
    Write-Host 'Press Ctrl+C to stop the server.'
    & $triviaNodePath (Join-Path $PSScriptRoot 'api\https-server.js')
    if ($LASTEXITCODE -ne 0) { throw "Server exited with code $LASTEXITCODE" }
} finally { $env:PORT = $triviaPreviousPort }
