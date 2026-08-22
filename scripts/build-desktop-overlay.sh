#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SOURCE="$REPO_DIR/desktop/chute-desktop.cpp"
OUT=${1:-"${XDG_DATA_HOME:-$HOME/.local/share}/chute-runtime/chute-desktop"}
CXX=${CXX:-c++}

if ! command -v "$CXX" >/dev/null 2>&1; then
  printf 'Desktop Chute needs a C++ compiler. Could not find: %s\n' "$CXX" >&2
  exit 2
fi

if ! command -v pkg-config >/dev/null 2>&1; then
  printf 'Desktop Chute needs pkg-config.\n' >&2
  exit 2
fi

if ! pkg-config --exists Qt6Widgets; then
  printf 'Desktop Chute needs Qt 6 Widgets development files (Qt6Widgets.pc).\n' >&2
  exit 2
fi

mkdir -p "$(dirname -- "$OUT")"

# Qt6Widgets pulls the required Qt6Gui/Qt6Core link flags through pkg-config.
# Intentional shell splitting is used for compiler flags returned by pkg-config.
# shellcheck disable=SC2046
"$CXX" -std=c++17 -O2 -Wall -Wextra \
  $(pkg-config --cflags Qt6Widgets) \
  "$SOURCE" -o "$OUT" \
  $(pkg-config --libs Qt6Widgets)

chmod 755 "$OUT"
printf 'Built desktop Chute: %s\n' "$OUT"
