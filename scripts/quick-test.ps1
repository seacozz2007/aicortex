# quick-test.ps1 - Quick PATH check in PowerShell
$env:Path = [Environment]::GetEnvironmentVariable("Path", "User")
Write-Host "=== PATH Test ==="
Write-Host "node:  $(node --version 2>$null)"
Write-Host "go:    $(go version 2>$null)"
Write-Host "pnpm:  $(pnpm --version 2>$null)"
Write-Host "docker: $((docker --version 2>$null) -replace 'Docker version ', '')"
Write-Host "make:  $(make --version 2>$null | Select-Object -First 1)"
