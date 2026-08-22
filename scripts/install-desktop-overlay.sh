#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
RUNTIME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/chute-runtime"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
DESKTOP_BIN="$RUNTIME_DIR/chute-desktop"
RUNNER="$RUNTIME_DIR/run-chute-desktop.sh"
AUTOSTART_FILE="$AUTOSTART_DIR/chute-desktop.desktop"

printf '\nBuilding desktop Chute overlay...\n'
if ! sh "$REPO_DIR/scripts/build-desktop-overlay.sh" "$DESKTOP_BIN"; then
  printf '\nDesktop overlay was not installed.\n'
  printf 'The browser Chute is still installed and usable.\n'
  printf 'For the desktop overlay, this experimental build currently needs a C++ compiler and Qt 6 Widgets development files.\n'
  exit 0
fi

mkdir -p "$RUNTIME_DIR" "$AUTOSTART_DIR"

cat > "$RUNNER" <<EOF
#!/usr/bin/env sh
set -eu

# KDE Wayland sessions normally expose DISPLAY through XWayland. During the
# v2.5 prototype we deliberately prefer xcb when it is available because X11
# positioning lets Chute stay anchored to the exact lower-right desktop zone.
if [ -n "\${DISPLAY:-}" ]; then
  export QT_QPA_PLATFORM="\${CHUTE_QT_PLATFORM:-xcb}"
fi

export CHUTE_CLI="${HOME}/.local/bin/chute"
exec "$DESKTOP_BIN"
EOF
chmod 755 "$RUNNER"

cat > "$AUTOSTART_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Chute Desktop
Comment=Persistent local Chute drop zone
Exec="$RUNNER"
Terminal=false
StartupNotify=false
X-KDE-autostart-after=panel
EOF

# Replace an older experimental overlay if one is running, then start this one
# in the current graphical session. Failure here should not break the installer;
# the XDG autostart entry will try again on the next desktop login.
pkill -x chute-desktop >/dev/null 2>&1 || true
nohup "$RUNNER" >/dev/null 2>&1 &

printf 'Desktop Chute installed.\n'
printf 'Overlay:   %s\n' "$DESKTOP_BIN"
printf 'Autostart: %s\n' "$AUTOSTART_FILE"
printf 'It should appear in the lower-right desktop zone and auto-hide after 10 seconds.\n'
