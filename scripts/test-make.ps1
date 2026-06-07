# test-make.ps1 - Verify make + dev environment
$env:Path = [Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "=== Tool Versions ===" -ForegroundColor Cyan
Write-Host "make:  $(make --version | Select-Object -First 1)"
Write-Host "bash:  $(bash --version | Select-Object -First 1)"
Write-Host "node:  $(node --version)"
Write-Host "pnpm:  $(pnpm --version)"
Write-Host "go:    $(go version)"
Write-Host "docker: $((docker --version 2>$null) ?? 'NOT FOUND')"
Write-Host ""

# Test make build (just check the commands, don't fully rebuild)
Write-Host "=== Testing: make available ===" -ForegroundColor Cyan
if (Get-Command make -ErrorAction SilentlyContinue) {
    Write-Host "✓ make is available" -ForegroundColor Green
} else {
    Write-Host "✗ make NOT found" -ForegroundColor Red
}
