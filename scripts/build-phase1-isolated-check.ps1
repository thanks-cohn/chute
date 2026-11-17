param([string]$Python = "python")
$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BuildRoot = Join-Path $Repo "build\phase1-isolated"
$Dist = Join-Path $Repo "dist\phase1-isolated"
$Venv = Join-Path $BuildRoot "venv"
New-Item -ItemType Directory -Force $BuildRoot, $Dist | Out-Null
& $Python -m venv $Venv
if ($LASTEXITCODE -ne 0) { throw "venv failed" }
$Py = Join-Path $Venv "Scripts\python.exe"
& $Py -m pip install pyinstaller==6.22.3 Pillow==13.0.0 $Repo
if ($LASTEXITCODE -ne 0) { throw "dependency installation failed" }
& $Py -m PyInstaller --noconfirm --clean --onefile --collect-data tzdata --console --hidden-import PIL.Image --name Chutey-Phase1-Isolated-Check --distpath $Dist --workpath (Join-Path $BuildRoot "work") --specpath $BuildRoot (Join-Path $Repo "scripts\phase1-isolated-worker-check.py")
if ($LASTEXITCODE -ne 0) { throw "candidate build failed" }
$Exe = Join-Path $Dist "Chutey-Phase1-Isolated-Check.exe"
$SourceReceipt = Join-Path $Repo "SOURCE-COMMIT.txt"
if (Test-Path $SourceReceipt) {
    $Commit = (Get-Content $SourceReceipt -Raw).Trim()
} else {
    $Commit = git -C $Repo rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw "source identity unavailable" }
}
if ($Commit -notmatch '^[a-f0-9]{40}$') { throw "invalid source identity" }
$Commit | Set-Content (Join-Path $Dist "SOURCE-COMMIT.txt")
(Get-FileHash $Exe -Algorithm SHA256 | Format-List | Out-String) | Set-Content (Join-Path $Dist "SHA256.txt")
& $Py --version
& $Py -m pip freeze | Set-Content (Join-Path $Dist "BUILD-DEPENDENCIES.txt")
Write-Output "Built $Exe. It is a temporary API self-test, not an installer or production worker. Nothing was launched."
