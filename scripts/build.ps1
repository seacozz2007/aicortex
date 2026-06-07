# Build.ps1 — Build the server, CLI, and migrate binaries into server/bin
# Usage: .\scripts\build.ps1
# Equivalent to: make build

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$ServerDir = Join-Path $RepoRoot "server"
$BinDir = Join-Path $ServerDir "bin"

# Ensure bin directory exists
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

# Get version info from git
Push-Location $RepoRoot
try {
    $Version = git describe --tags --always --dirty 2>$null
    if (-not $Version) { $Version = "dev" }

    $Commit = git rev-parse --short HEAD 2>$null
    if (-not $Commit) { $Commit = "unknown" }

    $Date = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
}
finally {
    Pop-Location
}

Write-Host "==> Building server..." -ForegroundColor Cyan
Set-Location $ServerDir
go build -ldflags "-X main.version=$Version -X main.commit=$Commit" -o (Join-Path $BinDir "server.exe") ./cmd/server

Write-Host "==> Building aicortex CLI..." -ForegroundColor Cyan
go build -ldflags "-X main.version=$Version -X main.commit=$Commit -X main.date=$Date" -o (Join-Path $BinDir "aicortex.exe") ./cmd/aicortex

Write-Host "==> Building migrate..." -ForegroundColor Cyan
go build -o (Join-Path $BinDir "migrate.exe") ./cmd/migrate

Write-Host "" -ForegroundColor Cyan
Write-Host "✓ Build complete! Binaries in server/bin/:" -ForegroundColor Green
Get-ChildItem $BinDir | ForEach-Object {
    Write-Host "  $($_.Name) ($([math]::Round($_.Length / 1MB, 2)) MB)" -ForegroundColor Gray
}
