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

preflight_browser_setup() {
  printf '\n'
  printf '========================================\n'
  printf ' CHUTE — ONE THING BEFORE INSTALLING\n'
  printf '========================================\n'
  printf '\n'
  printf 'In every Chromium browser where you want Chute to work:\n'
  printf '  1. Open the browser Extensions page.\n'
  printf '  2. Turn on Developer mode.\n'
  printf '\n'
  printf 'Do that first. Chute will handle the computer-side setup next.\n'
  printf 'At the end, you will only need to click Load unpacked in each browser.\n'
  printf '\n'

  if [ -t 0 ]; then
    printf 'Press Enter when Developer mode is enabled in the browser(s) you want... '
    read -r _chute_ready
    printf '\nPerfect. Installing Chute...\n\n'
  else
    printf 'Installing Chute...\n\n'
  fi
}

preflight_browser_setup

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
  checkpoint_tree files "$snapshot"
  checkpoint_tree thumbs "$snapshot"
  checkpoint_tree custom-thumbnails "$snapshot"

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

copy_extension_path() {
  if command -v wl-copy >/dev/null 2>&1; then
    printf '%s' "$EXTENSION_DIR" | wl-copy
    printf 'Extension folder path copied to clipboard.\n'
    return
  fi
  if command -v xclip >/dev/null 2>&1; then
    printf '%s' "$EXTENSION_DIR" | xclip -selection clipboard
    printf 'Extension folder path copied to clipboard.\n'
    return
  fi
  if command -v xsel >/dev/null 2>&1; then
    printf '%s' "$EXTENSION_DIR" | xsel --clipboard --input
    printf 'Extension folder path copied to clipboard.\n'
  fi
}

open_first_browser_command() {
  label=$1
  url=$2
  shift 2

  for candidate in "$@"; do
    if command -v "$candidate" >/dev/null 2>&1; then
      printf 'Opening %s Extensions...\n' "$label"
      "$candidate" "$url" >/dev/null 2>&1 &
      return 0
    fi
  done
  return 1
}

open_extension_onboarding() {
  printf '\n========================================\n'
  printf ' CHUTE INSTALLED — LAST STEP\n'
  printf '========================================\n\n'
  printf 'Chute extension folder:\n  %s\n\n' "$EXTENSION_DIR"

  copy_extension_path

  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$EXTENSION_DIR" >/dev/null 2>&1 &
  fi

  opened=0
  if open_first_browser_command "Google Chrome" "chrome://extensions" google-chrome-stable google-chrome; then opened=1; fi
  if open_first_browser_command "Chromium" "chrome://extensions" chromium chromium-browser; then opened=1; fi
  if open_first_browser_command "Brave" "brave://extensions" brave-browser brave; then opened=1; fi
  if open_first_browser_command "Opera" "opera://extensions" opera; then opened=1; fi
  if open_first_browser_command "Microsoft Edge" "edge://extensions" microsoft-edge-stable microsoft-edge; then opened=1; fi

  printf '\nIn each browser where you want Chute:\n'
  printf '  1. Click Load unpacked.\n'
  printf '  2. Select the Chute extension folder that just opened.\n'
  printf '\nThat is it. Chute is ready.\n'

  if [ "$opened" -eq 0 ]; then
    printf '\nNo supported Chromium browser was detected automatically.\n'
    printf 'Open its Extensions page yourself and click Load unpacked.\n'
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
WantedBy=default.target
EOF

systemctl --user stop chute.service >/dev/null 2>&1 || true
systemctl --user daemon-reload
systemctl --user enable --now chute.service

printf '\nChute computer-side setup is complete.\n'
printf 'Data:    %s\n' "$DATA_DIR"
printf 'Service: systemctl --user status chute.service\n'

open_extension_onboarding
