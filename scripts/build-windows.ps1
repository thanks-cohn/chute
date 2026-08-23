param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BuildRoot = Join-Path $Repo ".build\windows"
$Venv = Join-Path $BuildRoot "venv"
$Dist = Join-Path $Repo "dist\windows"

New-Item -ItemType Directory -Force -Path $BuildRoot, $Dist | Out-Null
if (Test-Path $Venv) { Remove-Item -Recurse -Force $Venv }

& $Python -m venv $Venv
$Py = Join-Path $Venv "Scripts\python.exe"
& $Py -m pip install --upgrade pip
& $Py -m pip install pyinstaller $Repo

Push-Location $Repo
try {
    & $Py -m PyInstaller `
        --noconfirm `
        --clean `
        --onefile `
        --windowed `
        --name Chute-Windows `
        --distpath $Dist `
        --workpath (Join-Path $BuildRoot "work") `
        --specpath $BuildRoot `
        (Join-Path $Repo "scripts\windows-entry.py")
}
finally {
    Pop-Location
}

$Exe = Join-Path $Dist "Chute-Windows.exe"
if (-not (Test-Path $Exe)) { throw "Build completed without producing $Exe" }
Write-Host "Built: $Exe"
Write-Host "Customer flow: download Chute-Windows.exe and double-click once."
Write-Host "It self-installs per-user; no admin, Windows Service, or Python required."
Write-Host "Install the Chute browser extension separately from the Chrome Web Store."
