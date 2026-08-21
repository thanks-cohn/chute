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

checkpoint_tree() {
  name=$1
  source="$DATA_DIR/$name"
  destination=$2
  if [ ! -d "$source" ]; then
    return
  fi
  mkdir -p "$destination/$name"
  if ! cp -al "$source/." "$destination/$name/"; then
    printf 'Could not checkpoint %s. Update aborted; your Chute data was not modified.\n' "$source" >&2
    rm -rf "$destination"
    exit 1
  fi
}

make_update_snapshot() {
  files_before=$(snapshot_count "$DATA_DIR/files")
  thumbs_before=$(snapshot_count "$DATA_DIR/thumbs")
  custom_before=$(snapshot_count "$DATA_DIR/custom-thumbnails")
  history_before=$(snapshot_count "$DATA_DIR/history")

  if [ "$files_before" -eq 0 ] && [ "$thumbs_before" -eq 0 ] && [ "$custom_before" -eq 0 ] && [ "$history_before" -eq 0 ] && [ ! -f "$DATA_DIR/queue.json" ]; then
    return
  fi

  stamp=$(date -u '+%Y%m%dT%H%M%SZ')
  snapshot="$SAFETY_DIR/$stamp"
  mkdir -p "$snapshot"

  printf 'Creating pre-update Chute safety checkpoint...\n'

  # Immutable artifact trees use hard links: deleting a live pathname later
  # cannot destroy the bytes owned by this checkpoint, and large collections
  # do not get duplicated on disk merely because Chute was updated.
  checkpoint_tree files "$snapshot"
  checkpoint_tree thumbs "$snapshot"
  checkpoint_tree custom-thumbnails "$snapshot"

  # Mutable logs/manifests are copied by value so later appends/replacements do
  # not mutate the checkpointed version.
  if [ -d "$DATA_DIR/history" ]; then
    cp -a "$DATA_DIR/history" "$snapshot/history"
  fi
  for manifest in queue.json image-provenance.jsonl image-provenance.txt; do
    if [ -f "$DATA_DIR/$manifest" ]; then
      cp -a "$DATA_DIR/$manifest" "$snapshot/$manifest"
    fi
  done

  {
    printf 'created_utc=%s\n' "$stamp"
    printf 'data_dir=%s\n' "$DATA_DIR"
    printf 'files=%s\n' "$files_before"
    printf 'thumbs=%s\n' "$thumbs_before"
    printf 'custom_thumbnails=%s\n' "$custom_before"
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
