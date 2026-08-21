#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
BUILD_ROOT="$REPO_DIR/.build/linux"
VENV="$BUILD_ROOT/venv"
DIST="$REPO_DIR/dist/linux"

mkdir -p "$BUILD_ROOT" "$DIST"
rm -rf "$VENV"
python3 -m venv "$VENV"
"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install pyinstaller "$REPO_DIR"

"$VENV/bin/python" -m PyInstaller \
  --noconfirm \
  --clean \
  --onefile \
  --name Chute-Linux-x86_64 \
  --distpath "$DIST" \
  --workpath "$BUILD_ROOT/work" \
  --specpath "$BUILD_ROOT" \
  "$REPO_DIR/scripts/linux-entry.py"

EXE="$DIST/Chute-Linux-x86_64"
[ -f "$EXE" ] || { printf 'Build completed without producing %s\n' "$EXE" >&2; exit 1; }
chmod +x "$EXE"
printf 'Built: %s\n' "$EXE"
printf 'Customer flow: download, make executable if the browser removed the bit, and run once. No systemd required.\n'
