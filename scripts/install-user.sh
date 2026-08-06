#!/usr/bin/env sh
set -eu
python3 -m pip install --user .
printf '\nInstalled the CLI. Test it with:\n  chute --version\n\nThen load the Chrome extension from:\n  %s/extension\n' "$(pwd)"
