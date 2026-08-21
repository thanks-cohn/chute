#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PYTHON=${PYTHON:-python3}
BUILD_ROOT="$REPO_DIR/.build/linux"
VENV="$BUILD_ROOT/venv"
DIST="$REPO_DIR/dist/linux"

mkdir -p "$BUILD_ROOT" "$DIST"
rm -rf "$VENV"

"$PYTHON" -m venv "$VENV"
PY="$VENV/bin/python"
"$PY" -m pip install --upgrade pip
"$PY" -m pip install pyinstaller "$REPO_DIR"

cd "$REPO_DIR"
"$PY" -m PyInstaller \
  --noconfirm \
  --clean \
  --onefile \
  --name Chute \
  --distpath "$DIST" \
  --workpath "$BUILD_ROOT/work" \
  --specpath "$BUILD_ROOT" \
  "$REPO_DIR/scripts/desktop-entry.py"

if [ ! -x "$DIST/Chute" ]; then
  printf 'Build completed without producing %s/Chute\n' "$DIST" >&2
  exit 1
fi

printf 'Built: %s/Chute\n' "$DIST"
printf 'The customer does not need Python.\n'
printf 'For broad distro compatibility, produce release binaries on the oldest glibc baseline you support.\n'
printf 'Next: ./scripts/install-linux.sh\n'
