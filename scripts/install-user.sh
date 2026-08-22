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
EXTENSION_DIR="$REPO_DIR/extension"

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

BROWSER_CMD=""
EXTENSIONS_URL=""

select_browser() {
  candidate=$1
  url=$2
  if [ -n "$BROWSER_CMD" ]; then
    return
  fi
  if command -v "$candidate" >/dev/null 2>&1; then
    BROWSER_CMD=$(command -v "$candidate")
    EXTENSIONS_URL=$url
  fi
}

choose_browser() {
  DEFAULT_BROWSER=""
  if command -v xdg-settings >/dev/null 2>&1; then
    DEFAULT_BROWSER=$(xdg-settings get default-web-browser 2>/dev/null || true)
  fi

  case "$DEFAULT_BROWSER" in
    *opera*)
      select_browser opera "opera://extensions"
      ;;
    *brave*)
      select_browser brave-browser "brave://extensions"
      select_browser brave "brave://extensions"
      ;;
    *microsoft-edge*|*edge*)
      select_browser microsoft-edge-stable "edge://extensions"
      select_browser microsoft-edge "edge://extensions"
      ;;
    *google-chrome*|*chrome*)
      select_browser google-chrome-stable "chrome://extensions"
      select_browser google-chrome "chrome://extensions"
      ;;
    *chromium*)
      select_browser chromium "chrome://extensions"
      select_browser chromium-browser "chrome://extensions"
      ;;
  esac

  # Fallback when the desktop default cannot be resolved or is not Chromium-based.
  select_browser google-chrome-stable "chrome://extensions"
  select_browser google-chrome "chrome://extensions"
  select_browser chromium "chrome://extensions"
  select_browser chromium-browser "chrome://extensions"
  select_browser brave-browser "brave://extensions"
  select_browser brave "brave://extensions"
  select_browser opera "opera://extensions"
  select_browser microsoft-edge-stable "edge://extensions"
  select_browser microsoft-edge "edge://extensions"
}

copy_extension_path() {
  if command -v wl-copy >/dev/null 2>&1; then
    printf '%s' "$EXTENSION_DIR" | wl-copy
    printf 'Extension path copied to clipboard.\n'
    return
  fi
  if command -v xclip >/dev/null 2>&1; then
    printf '%s' "$EXTENSION_DIR" | xclip -selection clipboard
    printf 'Extension path copied to clipboard.\n'
    return
  fi
  if command -v xsel >/dev/null 2>&1; then
    printf '%s' "$EXTENSION_DIR" | xsel --clipboard --input
    printf 'Extension path copied to clipboard.\n'
  fi
}

open_extension_onboarding() {
  choose_browser

  printf '\nAlmost done. Chute will now point you at the browser extension.\n'
  printf 'Extension folder: %s\n' "$EXTENSION_DIR"
  copy_extension_path

  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$EXTENSION_DIR" >/dev/null 2>&1 &
  fi

  if [ -n "$BROWSER_CMD" ]; then
    printf 'Opening your browser Extensions page...\n'
    "$BROWSER_CMD" "$EXTENSIONS_URL" >/dev/null 2>&1 &
    printf '\nFINAL BROWSER STEP:\n'
    printf '  1. Turn on Developer mode.\n'
    printf '  2. Click Load unpacked.\n'
    printf '  3. Choose the extension folder that just opened:\n'
    printf '     %s\n' "$EXTENSION_DIR"
    printf '\nThen Chute is ready.\n'
  else
    printf '\nCould not automatically detect Chrome, Chromium, Brave, Opera, or Edge.\n'
    printf 'Open your browser Extensions page, enable Developer mode, choose Load unpacked,\n'
    printf 'and select: %s\n' "$EXTENSION_DIR"
  fi
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
WantedBy=default.target.target
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

open_extension_onboarding
