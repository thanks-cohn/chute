from __future__ import annotations

import contextlib
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from .browser_extensions import discover_chute_extension_ids
from .native_host import (
    allow_extension,
    install_bundled_native_host,
    register_windows_uninstaller,
    schedule_uninstall,
)
from .server import DEFAULT_HOST, DEFAULT_PORT, serve

_APP_NAME = "Chute"
_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
_NATIVE_REFRESH_SECONDS = 5.0


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


def _bundled_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parents[2]


def _install_native_host_bundle() -> Path:
    return install_bundled_native_host(_bundled_root())


def _authorize_loaded_chute_extensions() -> int:
    authorized = 0
    for extension_id in discover_chute_extension_ids():
        try:
            allow_extension(extension_id)
            authorized += 1
        except (OSError, ValueError):
            continue
    return authorized


def _native_origin_refresh_loop() -> None:
    while True:
        time.sleep(_NATIVE_REFRESH_SECONDS)
        try:
            _authorize_loaded_chute_extensions()
        except Exception:
            # Discovery is a compatibility aid. Never let it take down Chute.
            pass


def _start_native_origin_refresh() -> None:
    thread = threading.Thread(
        target=_native_origin_refresh_loop,
        name="ChuteNativeOriginRefresh",
        daemon=True,
    )
    thread.start()


def _stop_old_installed_copy() -> None:
    """Stop Chute.exe before replacing it, even when its health endpoint is dead."""
    if os.name != "nt":
        return
    try:
        subprocess.run(
            ["taskkill", "/IM", "Chute.exe", "/F"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except OSError:
        return
    time.sleep(0.45)


def _copy_installed_exe(source: Path, target: Path) -> None:
    """Replace a just-stopped Chute.exe, tolerating short Windows file-lock lag."""
    last_error: PermissionError | None = None
    for _ in range(12):
        try:
            shutil.copy2(source, target)
            return
        except PermissionError as exc:
            last_error = exc
            time.sleep(0.15)
    if last_error is not None:
        raise last_error


def _refresh_windows_registration(target: Path) -> None:
    # Refresh every time the installed app starts. The Store ID is always
    # accepted by the bundled native host; loaded unpacked Chute IDs are learned
    # from Chrome profile state and persisted as additional allowed origins.
    _register_startup(target)
    _install_native_host_bundle()
    _authorize_loaded_chute_extensions()
    register_windows_uninstaller(target, version="2.6.1")


def self_install_if_needed() -> bool:
    """Install the downloaded Chute companion for the current Windows user."""
    if os.name != "nt" or not getattr(sys, "frozen", False):
        return False

    source = _current_exe()
    target = installed_exe()
    if _same_path(source, target):
        _refresh_windows_registration(target)
        return False

    target.parent.mkdir(parents=True, exist_ok=True)
    _ensure_data_layout()
    _stop_old_installed_copy()
    _copy_installed_exe(source, target)
    _refresh_windows_registration(target)
    _launch_quiet(target)
    return True


def main() -> int:
    if os.name != "nt":
        print("This Chute companion build is for Windows.", file=sys.stderr)
        return 2

    args = sys.argv[1:]
    if "--uninstall" in args:
        schedule_uninstall(delete_data="--delete-data" in args)
        return 0

    if "--allow-extension" in args:
        try:
            index = args.index("--allow-extension")
            allow_extension(args[index + 1])
            return 0
        except (IndexError, ValueError) as exc:
            with log_path().open("a", encoding="utf-8") as log:
                print(f"Could not allow development extension: {exc}", file=log)
            return 2

    _ensure_data_layout()

    try:
        if self_install_if_needed():
            return 0
    except OSError as exc:
        with log_path().open("a", encoding="utf-8") as log:
            print(f"Chute self-install failed: {exc}", file=log)
        return 1

    # Keep learning newly loaded unpacked Chute IDs while the companion is up.
    _start_native_origin_refresh()

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
