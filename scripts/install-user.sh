#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
RUNTIME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/chute-runtime"
VENV_DIR="$RUNTIME_DIR/venv"
BIN_DIR="$HOME/.local/bin"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_PATH="$UNIT_DIR/chute.service"
DATA_DIR="${CHUTE_HOME:-$HOME/Chute}"
SAFETY_DIR="$DATA_DIR/.update-safety"

if ! command -v python3 >/dev/null 2>&1; then
  printf 'Chute requires Python 3.10 or newer.\n' >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  printf 'Chute automatic startup requires systemd/systemctl.\n' >&2
  exit 1
fi

mkdir -p "$RUNTIME_DIR" "$BIN_DIR" "$UNIT_DIR" "$DATA_DIR"

snapshot_count() {
  target=$1
  if [ -d "$target" ]; then
    find "$target" -type f -print | wc -l | tr -d ' '
  else
    printf '0'
  fi
}

make_update_snapshot() {
  files_before=$(snapshot_count "$DATA_DIR/files")
  thumbs_before=$(snapshot_count "$DATA_DIR/thumbs")
  history_before=$(snapshot_count "$DATA_DIR/history")

  # A fresh install with no user data does not need a checkpoint.
  if [ "$files_before" -eq 0 ] && [ "$thumbs_before" -eq 0 ] && [ "$history_before" -eq 0 ] && [ ! -f "$DATA_DIR/queue.json" ]; then
    return
  fi

  stamp=$(date -u '+%Y%m%dT%H%M%SZ')
  snapshot="$SAFETY_DIR/$stamp"
  mkdir -p "$snapshot"

  printf 'Creating pre-update Chute safety checkpoint...\n'

  # Preserved files and generated thumbnails are immutable Chute artifacts in
  # normal operation. Hard links retain their bytes if a buggy future update
  # unlinks the live pathname, without duplicating the file contents.
  if [ -d "$DATA_DIR/files" ]; then
    mkdir -p "$snapshot/files"
    if ! cp -al "$DATA_DIR/files/." "$snapshot/files/"; then
      printf 'Could not create hard-link checkpoint for %s/files. Update aborted; your data was not modified.\n' "$DATA_DIR" >&2
      rm -rf "$snapshot"
      exit 1
    fi
  fi

  if [ -d "$DATA_DIR/thumbs" ]; then
    mkdir -p "$snapshot/thumbs"
    if ! cp -al "$DATA_DIR/thumbs/." "$snapshot/thumbs/"; then
      printf 'Could not create hard-link checkpoint for %s/thumbs. Update aborted; your data was not modified.\n' "$DATA_DIR" >&2
      rm -rf "$snapshot"
      exit 1
    fi
  fi

  # History and manifests can be appended/replaced during normal use, so copy
  # their current bytes rather than hard-linking their mutable inode.
  if [ -d "$DATA_DIR/history" ]; then
    cp -a "$DATA_DIR/history" "$snapshot/history"
  fi
  for manifest in queue.json image-provenance.jsonl; do
    if [ -f "$DATA_DIR/$manifest" ]; then
      cp -a "$DATA_DIR/$manifest" "$snapshot/$manifest"
    fi
  done

  {
    printf 'created_utc=%s\n' "$stamp"
    printf 'data_dir=%s\n' "$DATA_DIR"
    printf 'files=%s\n' "$files_before"
    printf 'thumbs=%s\n' "$thumbs_before"
    printf 'history_files=%s\n' "$history_before"
  } > "$snapshot/MANIFEST.txt"

  printf 'Safety checkpoint: %s\n' "$snapshot"
}

make_update_snapshot

printf 'Creating Chute private Python environment...\n'
python3 -m venv "$VENV_DIR"

if ! "$VENV_DIR/bin/python" -m pip --version >/dev/null 2>&1; then
  "$VENV_DIR/bin/python" -m ensurepip --upgrade
fi

printf 'Installing Chute into its private runtime...\n'
"$VENV_DIR/bin/python" -m pip install --upgrade --no-deps "$REPO_DIR"
ln -sfn "$VENV_DIR/bin/chute" "$BIN_DIR/chute"

cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Chute localhost file bridge
After=default.target

[Service]
Type=simple
ExecStart="$VENV_DIR/bin/chute" serve
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
printf 'Data:     %s\n' "$DATA_DIR"
printf 'Safety:   %s\n' "$SAFETY_DIR"
printf 'Service:  systemctl --user status chute.service\n'
printf 'Logs:     journalctl --user -u chute.service -f\n'
printf '\nThe service starts automatically with your user session.\n'
printf 'For startup at machine boot even before login, enable lingering once:\n'
printf '  sudo loginctl enable-linger %s\n' "$(id -un)"
printf '\nLoad the browser extension from:\n  %s/extension\n' "$REPO_DIR"
