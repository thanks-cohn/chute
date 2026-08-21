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


def log_path() -> Path:
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Chute" / "logs"
    else:
        state_home = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local" / "state")))
        base = state_home / "chute"
    base.mkdir(parents=True, exist_ok=True)
    return base / "chute.log"


def _same_path(left: Path, right: Path) -> bool:
    try:
        return os.path.normcase(str(left.resolve())) == os.path.normcase(str(right.resolve()))
    except OSError:
        return os.path.normcase(str(left)) == os.path.normcase(str(right))


def _windows_install_target() -> Path:
    local_app_data = Path(os.environ.get("LOCALAPPDATA", str(Path.home())))
    return local_app_data / "Programs" / "Chute" / "Chute.exe"


def _register_windows_startup(target: Path) -> None:
    import winreg

    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
        winreg.SetValueEx(key, "Chute", 0, winreg.REG_SZ, f'"{target}"')


def _launch_windows_installed(target: Path) -> None:
    creationflags = 0
    creationflags |= getattr(subprocess, "CREATE_NO_WINDOW", 0)
    creationflags |= getattr(subprocess, "DETACHED_PROCESS", 0)
    subprocess.Popen(
        [str(target), "--installed"],
        cwd=str(target.parent),
        close_fds=True,
        creationflags=creationflags,
    )


def _bootstrap_windows() -> bool:
    if os.name != "nt" or not getattr(sys, "frozen", False):
        return False

    current = Path(sys.executable)
    target = _windows_install_target()
    target.parent.mkdir(parents=True, exist_ok=True)

    if _same_path(current, target):
        _register_windows_startup(target)
        return False

    # The downloaded Chute.exe is itself the installer. No PowerShell, Python,
    # administrator privileges, or Windows Service is required.
    if target.exists() and already_running():
        _register_windows_startup(target)
        return True

    temporary = target.with_suffix(".new.exe")
    shutil.copy2(current, temporary)
    os.replace(temporary, target)
    _register_windows_startup(target)
    _launch_windows_installed(target)
    return True


def _linux_install_target() -> Path:
    data_home = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share")))
    return data_home / "chute" / "Chute"


def _register_linux_autostart(target: Path) -> None:
    config_home = Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config")))
    autostart = config_home / "autostart"
    autostart.mkdir(parents=True, exist_ok=True)
    desktop = autostart / "chute.desktop"
    desktop.write_text(
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Name=Chute\n"
        "Comment=Local browser file bridge\n"
        f'Exec="{target}" --installed\n'
        "Terminal=false\n"
        "X-GNOME-Autostart-enabled=true\n",
        encoding="utf-8",
    )


def _launch_linux_installed(target: Path) -> None:
    subprocess.Popen(
        [str(target), "--installed"],
        cwd=str(target.parent),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        start_new_session=True,
    )


def _bootstrap_linux() -> bool:
    if os.name == "nt" or not sys.platform.startswith("linux") or not getattr(sys, "frozen", False):
        return False

    current = Path(sys.executable)
    target = _linux_install_target()
    target.parent.mkdir(parents=True, exist_ok=True)

    if _same_path(current, target):
        _register_linux_autostart(target)
        return False

    if target.exists() and already_running():
        _register_linux_autostart(target)
        return True

    temporary = target.with_name(".Chute.new")
    shutil.copy2(current, temporary)
    temporary.chmod(0o755)
    os.replace(temporary, target)
    target.chmod(0o755)
    _register_linux_autostart(target)
    _launch_linux_installed(target)
    return True


def main() -> int:
    try:
        if _bootstrap_windows() or _bootstrap_linux():
            return 0
    except OSError as exc:
        path = log_path()
        with path.open("a", encoding="utf-8") as log:
            print(f"Chute desktop bootstrap failed: {exc}", file=log)
        return 1

    if already_running():
        return 0

    path = log_path()
    with path.open("a", encoding="utf-8", buffering=1) as log:
        with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
            print(f"Starting Chute on {DEFAULT_HOST}:{DEFAULT_PORT}", flush=True)
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
