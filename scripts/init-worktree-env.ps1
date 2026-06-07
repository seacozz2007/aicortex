# init-worktree-env.ps1 — Generate .env.worktree with unique DB name and app ports
# Usage: .\scripts\init-worktree-env.ps1 [env_file]

param(
    [string]$EnvFile = ".env.worktree"
)

$ErrorActionPreference = "Stop"

if (Test-Path $EnvFile -and $env:FORCE -ne "1") {
    Write-Host "Refusing to overwrite existing $EnvFile. Re-run with `$env:FORCE=1 if you want to regenerate it." -ForegroundColor Yellow
    exit 1
}

$worktreeName = $env:WORKTREE_NAME
if (-not $worktreeName) {
    $worktreeName = Split-Path -Leaf (Get-Location)
}

# Create a slug from the worktree name
$slug = $worktreeName.ToLower() -replace '[^a-z0-9]', '_' -replace '__+', '_' -replace '^_|_$', ''
if (-not $slug) { $slug = "aicortex" }

# Generate a deterministic offset using the path hash
$offset = [Math]::Abs((Get-Location).Path.GetHashCode()) % 1000

$postgresDb = "aicortex_${slug}_${offset}"
$postgresPort = 5432
$backendPort = 18080 + $offset
$frontendPort = 13000 + $offset
$frontendOrigin = "http://localhost:${frontendPort}"

@"
POSTGRES_DB=${postgresDb}
POSTGRES_USER=aicortex
POSTGRES_PASSWORD=aicortex
POSTGRES_PORT=${postgresPort}
DATABASE_URL=postgres://aicortex:aicortex@localhost:${postgresPort}/${postgresDb}?sslmode=disable

PORT=${backendPort}
JWT_SECRET=change-me-in-production
AICORTEX_DEV_VERIFICATION_CODE=888888
AICORTEX_SERVER_URL=ws://localhost:${backendPort}/ws
AICORTEX_APP_URL=${frontendOrigin}

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=${frontendOrigin}/auth/callback

FRONTEND_PORT=${frontendPort}
FRONTEND_ORIGIN=${frontendOrigin}
NEXT_PUBLIC_API_URL=http://localhost:${backendPort}
NEXT_PUBLIC_WS_URL=ws://localhost:${backendPort}/ws
"@ | Out-File -FilePath $EnvFile -Encoding ascii

Write-Host "Generated $EnvFile for worktree '$worktreeName'" -ForegroundColor Green
Write-Host "  Shared Postgres: localhost:${postgresPort}"
Write-Host "  Database: ${postgresDb}"
Write-Host "  Backend:  http://localhost:${backendPort}"
Write-Host "  Frontend: ${frontendOrigin}"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  .\scripts\setup.ps1    (or make setup-worktree)"
Write-Host "  .\scripts\start.ps1    (or make start-worktree)"
