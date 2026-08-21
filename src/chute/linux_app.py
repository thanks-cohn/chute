from __future__ import annotations

import contextlib
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

from .server import DEFAULT_HOST, DEFAULT_PORT, serve


def _health_url() -> str:
    return f"http://{DEFAULT_HOST}:{DEFAULT_PORT}/health"


def already_running() -> bool:
    try:
        with urllib.request.urlopen(_health_url(), timeout=0.35) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def data_dir() -> Path:
    return (Path.home() / "Chute").resolve()


def install_path() -> Path:
    return Path(os.environ.get("XDG_BIN_HOME", str(Path.home() / ".local" / "bin"))) / "chute-desktop"


def autostart_path() -> Path:
    config = Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config")))
    return config / "autostart" / "chute.desktop"


def log_path() -> Path:
    state = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local" / "state")))
    path = state / "chute" / "chute.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _current_exe() -> Path:
    return Path(sys.executable if getattr(sys, "frozen", False) else sys.argv[0]).resolve()


def _ensure_data_layout() -> None:
    root = data_dir()
    for name in ("files", "thumbs", "custom-thumbnails", "history"):
        (root / name).mkdir(parents=True, exist_ok=True)


def _write_autostart(target: Path) -> None:
    path = autostart_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Name=Chute\n"
        f"Exec={target} --background\n"
        "Terminal=false\n"
        "X-GNOME-Autostart-enabled=true\n",
        encoding="utf-8",
    )


def _launch_quiet(target: Path) -> None:
    subprocess.Popen(
        [str(target), "--background"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        start_new_session=True,
    )


def self_install_if_needed() -> bool:
    if os.name == "nt" or not getattr(sys, "frozen", False):
        return False

    source = _current_exe()
    target = install_path().expanduser().resolve()
    if source == target:
        _write_autostart(target)
        return False

    target.parent.mkdir(parents=True, exist_ok=True)
    _ensure_data_layout()
    shutil.copy2(source, target)
    target.chmod(target.stat().st_mode | 0o111)
    _write_autostart(target)
    _launch_quiet(target)
    return True


def main() -> int:
    if os.name == "nt":
        print("This Chute desktop build is for Linux.", file=sys.stderr)
        return 2

    _ensure_data_layout()
    try:
        if self_install_if_needed():
            return 0
    except OSError as exc:
        with log_path().open("a", encoding="utf-8") as log:
            print(f"Chute self-install failed: {exc}", file=log)
        return 1

    if already_running():
        return 0

    with log_path().open("a", encoding="utf-8", buffering=1) as log:
        with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
            print("Starting Chute for Linux on 127.0.0.1:17891", flush=True)
            print(f"Chute data: {data_dir()}", flush=True)
            try:
                serve(DEFAULT_HOST, DEFAULT_PORT)
            except OSError as exc:
                print(f"Chute could not start: {exc}", flush=True)
                return 1
            except KeyboardInterrupt:
                return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
