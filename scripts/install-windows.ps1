param(
    [string]$SourceExe = ""
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $SourceExe) { $SourceExe = Join-Path $Repo "dist\windows\Chute.exe" }
if (-not (Test-Path $SourceExe)) {
    throw "Chute.exe not found at $SourceExe. Run scripts\build-windows.ps1 first."
}

$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\Chute"
$TargetExe = Join-Path $InstallDir "Chute.exe"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$DataDir = Join-Path $HOME "Chute"

New-Item -ItemType Directory -Force -Path $InstallDir, $DataDir | Out-Null
Get-Process -Name Chute -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Copy-Item -Force $SourceExe $TargetExe

New-Item -Path $RunKey -Force | Out-Null
Set-ItemProperty -Path $RunKey -Name "Chute" -Value ('"{0}"' -f $TargetExe)

$StartMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$ShortcutPath = Join-Path $StartMenu "Chute.lnk"
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetExe
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Description = "Start Chute local browser bridge"
$Shortcut.Save()

Start-Process -FilePath $TargetExe

Write-Host "Chute for Windows installed for the current user."
Write-Host "Program: $TargetExe"
Write-Host "Data:    $DataDir"
Write-Host "Startup: enabled at Windows sign-in (HKCU Run; no service, no admin)."
Write-Host "Bridge:  http://127.0.0.1:17891"
