# dev.ps1 — Bootstrap this checkout end-to-end (Windows PowerShell equivalent of `make dev`)
# Usage: .\scripts\dev.ps1
# Equivalent to: make dev

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $RepoRoot

# ---------- Ensure user PATH is up-to-date ----------
$env:Path = [Environment]::GetEnvironmentVariable("Path", "User")

# ---------- Check prerequisites ----------
$missing = @()
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $missing += "node" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { $missing += "pnpm" }
if (-not (Get-Command go -ErrorAction SilentlyContinue)) { $missing += "go" }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { $missing += "docker" }

if ($missing.Count -gt 0) {
    Write-Host "✗ Missing prerequisites: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "  Please install: Node.js v20+, pnpm v10.28+, Go v1.26+, Docker"
    exit 1
}

# ---------- Environment file ----------
if (Test-Path ".git") {
    # Git worktree support
    $envFile = ".env.worktree"
    if (-not (Test-Path $envFile)) {
        Write-Host "==> Worktree detected. Generating $envFile..." -ForegroundColor Cyan
        & "$PSScriptRoot\init-worktree-env.ps1" $envFile
    }
} else {
    $envFile = ".env"
    if (-not (Test-Path $envFile)) {
        Write-Host "==> Creating $envFile from .env.example..." -ForegroundColor Cyan
        Copy-Item ".env.example" $envFile
    }
}

Write-Host "==> Using $envFile" -ForegroundColor Cyan

# Load env file into environment (simple key=value parser, no expansion)
Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*([^#=]+)=(.+)\s*$") {
        $key = $matches[1].Trim()
        $val = $matches[2].Trim()
        if ($val -match '^"(.*)"$' -or $val -match "^'(.*)'$") {
            $val = $matches[1]
        }
        Set-Item -Path "env:$key" -Value $val -ErrorAction SilentlyContinue
    }
}

# Set defaults
if (-not $env:POSTGRES_DB) { $env:POSTGRES_DB = "aicortex" }
if (-not $env:POSTGRES_USER) { $env:POSTGRES_USER = "aicortex" }
if (-not $env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD = "aicortex" }
if (-not $env:POSTGRES_PORT) { $env:POSTGRES_PORT = "5432" }
if (-not $env:PORT) { $env:PORT = "8080" }
if (-not $env:FRONTEND_PORT) { $env:FRONTEND_PORT = "3000" }
if (-not $env:FRONTEND_ORIGIN) { $env:FRONTEND_ORIGIN = "http://localhost:$($env:FRONTEND_PORT)" }

# ---------- Install dependencies ----------
if (-not (Test-Path "node_modules")) {
    Write-Host "==> Installing dependencies..." -ForegroundColor Cyan
    pnpm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# ---------- PostgreSQL via Docker ----------
Write-Host "==> Ensuring shared PostgreSQL container is running on localhost:5432..." -ForegroundColor Cyan
docker compose up -d postgres
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Waiting for PostgreSQL to be ready..." -ForegroundColor Cyan
do {
    $ready = docker compose exec -T postgres pg_isready -U $env:POSTGRES_USER -d postgres 2>$null
    if ($LASTEXITCODE -ne 0) { Start-Sleep -Seconds 1 }
} while ($LASTEXITCODE -ne 0)

Write-Host "==> Ensuring database '$($env:POSTGRES_DB)' exists..." -ForegroundColor Cyan
$dbExists = docker compose exec -T postgres psql -U $env:POSTGRES_USER -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$($env:POSTGRES_DB)'" 2>$null
if ($dbExists -ne "1") {
    docker compose exec -T postgres psql -U $env:POSTGRES_USER -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE `"$($env:POSTGRES_DB)`"" 2>$null
}

Write-Host "✓ PostgreSQL ready (local Docker). Database: $($env:POSTGRES_DB)" -ForegroundColor Green

# ---------- Run migrations ----------
Write-Host "==> Running migrations..." -ForegroundColor Cyan
Set-Location (Join-Path $RepoRoot "server")
go run ./cmd/migrate up
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location $RepoRoot

# ---------- Start services ----------
Write-Host ""
Write-Host "✓ Ready. Starting services..." -ForegroundColor Green
Write-Host "  Backend:  http://localhost:$($env:PORT)" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:$($env:FRONTEND_PORT)" -ForegroundColor Cyan
Write-Host ""

# Start backend
$serverJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    go run ./cmd/server
} -ArgumentList (Join-Path $RepoRoot "server")

# Start frontend
$webJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    pnpm dev:web
} -ArgumentList $RepoRoot

Write-Host "Press Ctrl+C to stop all services..." -ForegroundColor Yellow

try {
    # Wait for either job to complete (or user hits Ctrl+C)
    Wait-Job $serverJob, $webJob -Any | Out-Null
} finally {
    Write-Host "`nStopping services..." -ForegroundColor Yellow
    Stop-Job $serverJob, $webJob -ErrorAction SilentlyContinue
    Remove-Job $serverJob, $webJob -Force -ErrorAction SilentlyContinue
}
