# setup-make.ps1 — Ensure make and Git sh work in PowerShell
# Run: .\scripts\setup-make.ps1
#
# make on Windows needs sh.exe (from Git for Windows) to run Makefile recipes.

$ErrorActionPreference = "Stop"

function Add-PathIfExists {
    param(
        [string]$PathToAdd,
        [ref]$CurrentPath
    )
    if (-not (Test-Path $PathToAdd)) {
        Write-Host "  Skip (not found): $PathToAdd" -ForegroundColor DarkGray
        return
    }
    if (($CurrentPath.Value -split ';' | Where-Object { $_ -ne '' }) -notcontains $PathToAdd) {
        if ([string]::IsNullOrWhiteSpace($CurrentPath.Value)) {
            $CurrentPath.Value = $PathToAdd
        } else {
            $CurrentPath.Value += ";$PathToAdd"
        }
        Write-Host "  Added to PATH: $PathToAdd" -ForegroundColor Green
    } else {
        Write-Host "  Already in PATH: $PathToAdd" -ForegroundColor Gray
    }
}

$pathsToAdd = @(
    "C:\Program Files\Git\usr\bin"
)

if (Test-Path "C:\Program Files (x86)\GnuWin32\bin\make.exe") {
    $pathsToAdd += "C:\Program Files (x86)\GnuWin32\bin"
}

$wingetMakeRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
if (Test-Path $wingetMakeRoot) {
    $ezwinMake = Get-ChildItem -Path $wingetMakeRoot -Directory -Filter "ezwinports.make_*" -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName "bin" } |
        Where-Object { Test-Path (Join-Path $_ "make.exe") } |
        Select-Object -First 1
    if ($ezwinMake) {
        $pathsToAdd += $ezwinMake
    }
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
foreach ($p in $pathsToAdd) {
    Add-PathIfExists -PathToAdd $p -CurrentPath ([ref]$userPath)
}
[Environment]::SetEnvironmentVariable("Path", $userPath, "User")

$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$sessionPath = "$machinePath;$userPath"
foreach ($p in $pathsToAdd) {
    if ((Test-Path $p) -and ($sessionPath -split ';' -notcontains $p)) {
        $sessionPath += ";$p"
    }
}
$env:Path = $sessionPath
$env:SHELL = "C:\Program Files\Git\usr\bin\sh.exe"

Write-Host ""
Write-Host "PATH updated for make in PowerShell." -ForegroundColor Green
Write-Host ""
Write-Host "Verifying tools:" -ForegroundColor Cyan
Write-Host "  make: $(make --version | Select-Object -First 1)" -ForegroundColor White
Write-Host "  sh:   $(sh --version 2>&1 | Select-Object -First 1)" -ForegroundColor White
Write-Host ""
Write-Host "You can run: make build" -ForegroundColor Yellow
