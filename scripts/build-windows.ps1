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
        --name Chute `
        --distpath $Dist `
        --workpath (Join-Path $BuildRoot "work") `
        --specpath $BuildRoot `
        (Join-Path $Repo "scripts\desktop-entry.py")
}
finally {
    Pop-Location
}

$Exe = Join-Path $Dist "Chute.exe"
if (-not (Test-Path $Exe)) { throw "Build completed without producing $Exe" }
Write-Host "Built: $Exe"
Write-Host "Customer flow: download Chute.exe and double-click it once."
Write-Host "No Python, PowerShell setup, administrator access, or Windows Service is required for the customer."
