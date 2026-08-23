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

_APP_NAME = "Chute"
_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"


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


def install_dir() -> Path:
    local = os.environ.get("LOCALAPPDATA")
    base = Path(local) if local else (Path.home() / "AppData" / "Local")
    return base / "Programs" / _APP_NAME


def installed_exe() -> Path:
    return install_dir() / "Chute.exe"


def log_path() -> Path:
    local = os.environ.get("LOCALAPPDATA")
    base = Path(local) if local else Path.home()
    path = base / "Chute" / "logs" / "chute.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _current_exe() -> Path:
    return Path(sys.executable if getattr(sys, "frozen", False) else sys.argv[0]).resolve()


def _same_path(left: Path, right: Path) -> bool:
    return os.path.normcase(str(left.resolve())) == os.path.normcase(str(right.resolve()))


def _register_startup(target: Path) -> None:
    import winreg

    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, _RUN_KEY) as key:
        winreg.SetValueEx(key, _APP_NAME, 0, winreg.REG_SZ, f'"{target}" --background')


def _ensure_data_layout() -> None:
    root = data_dir()
    for name in ("files", "thumbs", "custom-thumbnails", "history"):
        (root / name).mkdir(parents=True, exist_ok=True)


def _launch_quiet(target: Path) -> None:
    flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
    subprocess.Popen(
        [str(target), "--background"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        creationflags=flags,
    )


def self_install_if_needed() -> bool:
    """Install the downloaded Chute companion for the current Windows user.

    Returns True when the current process should exit because the installed copy
    was launched. No administrator privileges or Windows Service are used.
    """

    if os.name != "nt" or not getattr(sys, "frozen", False):
        return False

    source = _current_exe()
    target = installed_exe()
    if _same_path(source, target):
        _register_startup(target)
        return False

    target.parent.mkdir(parents=True, exist_ok=True)
    _ensure_data_layout()

    try:
        shutil.copy2(source, target)
    except PermissionError:
        if already_running():
            return True
        raise

    _register_startup(target)
    _launch_quiet(target)
    return True


def main() -> int:
    if os.name != "nt":
        print("This Chute companion build is for Windows.", file=sys.stderr)
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

    path = log_path()
    with path.open("a", encoding="utf-8", buffering=1) as log:
        with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
            print("Starting Chute for Windows on 127.0.0.1:17891", flush=True)
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
