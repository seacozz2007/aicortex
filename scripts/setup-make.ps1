# setup-make.ps1 — Add make and bash to PowerShell PATH
# Run: .\scripts\setup-make.ps1

$MakePath = "C:\Program Files (x86)\GnuWin32\bin"
$BashPath = "C:\Program Files\Git\usr\bin"

# Current session
$env:Path += ";$MakePath;$BashPath"

# Permanent (User level)
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
$newPaths = @($MakePath, $BashPath)

foreach ($p in $newPaths) {
    if ($currentPath -split ";" -notcontains $p) {
        $currentPath += ";" + $p
        Write-Host "  Added to PATH: $p" -ForegroundColor Green
    } else {
        Write-Host "  Already in PATH: $p" -ForegroundColor Gray
    }
}

[Environment]::SetEnvironmentVariable("Path", $currentPath, "User")

Write-Host ""
Write-Host "✓ PATH updated permanently (User level)" -ForegroundColor Green
Write-Host ""
Write-Host "Verifying tools:" -ForegroundColor Cyan
Write-Host "  make:  $(make --version | Select-Object -First 1)" -ForegroundColor White
Write-Host "  bash:  $(bash --version | Select-Object -First 1)" -ForegroundColor White
Write-Host ""
Write-Host "NOTE: You need to restart PowerShell for the permanent PATH to take effect." -ForegroundColor Yellow
Write-Host "      But 'make' and 'bash' work in this session already." -ForegroundColor Yellow
