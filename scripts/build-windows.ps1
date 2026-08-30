param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BuildRoot = Join-Path $Repo ".build\windows"
$Venv = Join-Path $BuildRoot "venv"
$Dist = Join-Path $Repo "dist\windows"
$Extension = Join-Path $Repo "extension"
$NativeEntry = Join-Path $Repo "scripts\windows-native-host.py"
$WindowsEntry = Join-Path $Repo "scripts\windows-entry.py"

New-Item -ItemType Directory -Force -Path $BuildRoot, $Dist | Out-Null
if (Test-Path $Venv) { Remove-Item -Recurse -Force $Venv }

& $Python -m venv $Venv
$Py = Join-Path $Venv "Scripts\python.exe"
& $Py -m pip install --upgrade pip
& $Py -m pip install pyinstaller $Repo

if (-not (Test-Path (Join-Path $Extension "manifest.json"))) {
    throw "Extension bundle is missing manifest.json: $Extension"
}

Push-Location $Repo
try {
    # Native Messaging requires real stdin/stdout pipes, so this helper uses the
    # console subsystem. Chrome launches it with redirected stdio; no console
    # window is shown to the user during normal native-messaging use.
    & $Py -m PyInstaller `
        --noconfirm `
        --clean `
        --onefile `
        --console `
        --name Chute-NativeHost `
        --distpath $Dist `
        --workpath (Join-Path $BuildRoot "native-work") `
        --specpath (Join-Path $BuildRoot "native-spec") `
        $NativeEntry

    $NativeExe = Join-Path $Dist "Chute-NativeHost.exe"
    if (-not (Test-Path $NativeExe)) { throw "Native host build did not produce $NativeExe" }

    # Customers still download one setup EXE. The native host and browser files
    # are embedded and copied into the per-user Chute install on first run.
    & $Py -m PyInstaller `
        --noconfirm `
        --clean `
        --onefile `
        --windowed `
        --name Chute-Windows `
        --add-data "$Extension;extension" `
        --add-binary "$NativeExe;." `
        --distpath $Dist `
        --workpath (Join-Path $BuildRoot "work") `
        --specpath (Join-Path $BuildRoot "spec") `
        $WindowsEntry
}
finally {
    Pop-Location
}

$Exe = Join-Path $Dist "Chute-Windows.exe"
if (-not (Test-Path $Exe)) { throw "Build completed without producing $Exe" }
Write-Host "Built: $Exe"
Write-Host "Bundled native host: $(Join-Path $Dist 'Chute-NativeHost.exe')"
Write-Host "Bundled extension: $Extension"
Write-Host "Customer flow: download Chute-Windows.exe and double-click once."
Write-Host "It self-installs per-user; no admin, service, or Python required."
