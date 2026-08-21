param(
    [switch]$RemoveData
)

$ErrorActionPreference = "Stop"
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\Chute"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$ShortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Chute.lnk"
$DataDir = Join-Path $HOME "Chute"

Get-Process -Name Chute -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $RunKey -Name "Chute" -ErrorAction SilentlyContinue
Remove-Item -Force $ShortcutPath -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue

if ($RemoveData) {
    Remove-Item -Recurse -Force $DataDir -ErrorAction SilentlyContinue
    Write-Host "Removed Chute and local data."
} else {
    Write-Host "Removed Chute. Local basket/history was preserved at $DataDir"
    Write-Host "Run again with -RemoveData if you deliberately want to delete it."
}
