#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
RUNTIME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/chute-runtime"
VENV_DIR="$RUNTIME_DIR/venv"
BIN_DIR="$HOME/.local/bin"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_PATH="$UNIT_DIR/chute.service"

if ! command -v python3 >/dev/null 2>&1; then
  printf 'Chute requires Python 3.10 or newer.\n' >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  printf 'Chute automatic startup requires systemd/systemctl.\n' >&2
  exit 1
fi

mkdir -p "$RUNTIME_DIR" "$BIN_DIR" "$UNIT_DIR" "$HOME/Chute"

printf 'Creating Chute private Python environment...\n'
python3 -m venv "$VENV_DIR"

if ! "$VENV_DIR/bin/python" -m pip --version >/dev/null 2>&1; then
  "$VENV_DIR/bin/python" -m ensurepip --upgrade
fi

printf 'Installing Chute into its private runtime...\n'
"$VENV_DIR/bin/python" -m pip install --upgrade "$REPO_DIR"
ln -sfn "$VENV_DIR/bin/chute" "$BIN_DIR/chute"

cat > "$UNIT_PATH" <<'EOF'
[Unit]
Description=Chute localhost file bridge
After=default.target

[Service]
Type=simple
ExecStart=%h/.local/share/chute-runtime/venv/bin/chute serve
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
EOF

# Stop an earlier service instance before reloading the installed runtime.
systemctl --user stop chute.service >/dev/null 2>&1 || true
systemctl --user daemon-reload
systemctl --user enable --now chute.service

printf '\nChute is installed. No virtual-environment activation is needed.\n'
printf 'CLI:      %s/chute\n' "$BIN_DIR"
printf 'Data:     %s/Chute\n' "$HOME"
printf 'Service:  systemctl --user status chute.service\n'
printf 'Logs:     journalctl --user -u chute.service -f\n'
printf '\nThe service starts automatically with your user session.\n'
printf 'For startup at machine boot even before login, enable lingering once:\n'
printf '  sudo loginctl enable-linger %s\n' "$(id -un)"
printf '\nLoad the browser extension from:\n  %s/extension\n' "$REPO_DIR"
