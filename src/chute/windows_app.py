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
_ONBOARDING_MARKER = ".extension-onboarding-v1"


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


def extension_dir() -> Path:
    return install_dir() / "extension"


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
    flags = 0
    if os.name == "nt":
        flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
    subprocess.Popen(
        [str(target), "--background"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        creationflags=flags,
    )


def _bundled_extension_dir() -> Path:
    if getattr(sys, "frozen", False):
        root = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    else:
        root = Path(__file__).resolve().parents[2]
    return root / "extension"


def _install_extension_bundle() -> Path | None:
    source = _bundled_extension_dir()
    manifest = source / "manifest.json"
    if not manifest.is_file():
        return None

    target = extension_dir()
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target, dirs_exist_ok=True)
    return target


def _browser_candidates() -> list[tuple[str, str, list[Path]]]:
    local = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    program_files = Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
    program_files_x86 = Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"))

    opera_paths = [
        local / "Programs" / "Opera" / "opera.exe",
        local / "Programs" / "Opera GX" / "opera.exe",
    ]
    programs = local / "Programs"
    if programs.is_dir():
        opera_paths.extend(programs.glob("Opera*/opera.exe"))

    return [
        (
            "Chrome",
            "chrome://extensions/",
            [
                local / "Google" / "Chrome" / "Application" / "chrome.exe",
                program_files / "Google" / "Chrome" / "Application" / "chrome.exe",
                program_files_x86 / "Google" / "Chrome" / "Application" / "chrome.exe",
            ],
        ),
        (
            "Edge",
            "edge://extensions/",
            [
                program_files_x86 / "Microsoft" / "Edge" / "Application" / "msedge.exe",
                program_files / "Microsoft" / "Edge" / "Application" / "msedge.exe",
            ],
        ),
        (
            "Brave",
            "brave://extensions/",
            [
                local / "BraveSoftware" / "Brave-Browser" / "Application" / "brave.exe",
                program_files / "BraveSoftware" / "Brave-Browser" / "Application" / "brave.exe",
                program_files_x86 / "BraveSoftware" / "Brave-Browser" / "Application" / "brave.exe",
            ],
        ),
        ("Opera", "opera://extensions/", opera_paths),
    ]


def _detected_browsers() -> list[tuple[str, str, Path]]:
    detected: list[tuple[str, str, Path]] = []
    seen: set[str] = set()
    for name, url, candidates in _browser_candidates():
        for candidate in candidates:
            try:
                resolved = candidate.resolve()
            except OSError:
                resolved = candidate
            key = os.path.normcase(str(resolved))
            if key in seen or not resolved.is_file():
                continue
            seen.add(key)
            detected.append((name, url, resolved))
            break
    return detected


def _copy_path_to_clipboard(path: Path) -> None:
    try:
        subprocess.run(
            ["clip.exe"],
            input=str(path),
            text=True,
            check=False,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except OSError:
        pass


def _show_setup_message(path: Path, browser_names: list[str]) -> None:
    try:
        import ctypes

        browsers = ", ".join(browser_names) if browser_names else "your Chromium browser"
        message = (
            "Chute is installed and running.\n\n"
            f"I opened the Extensions page for: {browsers}.\n\n"
            "To enable the browser half before the Web Store release:\n"
            "1. Turn on Developer mode.\n"
            "2. Click Load unpacked.\n"
            "3. Choose the Chute extension folder that just opened.\n\n"
            f"The folder path is also copied to your clipboard:\n{path}"
        )
        ctypes.windll.user32.MessageBoxW(None, message, "Finish Chute browser setup", 0x40)
    except Exception:
        pass


def _open_extension_onboarding(path: Path) -> None:
    marker = install_dir() / _ONBOARDING_MARKER
    if marker.exists():
        return

    browsers = _detected_browsers()
    flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    for _, url, exe in browsers:
        try:
            subprocess.Popen(
                [str(exe), url],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
                creationflags=flags,
            )
        except OSError:
            continue

    try:
        subprocess.Popen(["explorer.exe", str(path)], creationflags=flags)
    except OSError:
        pass

    _copy_path_to_clipboard(path)
    _show_setup_message(path, [name for name, _, _ in browsers])
    try:
        marker.write_text("Browser extension onboarding shown.\n", encoding="utf-8")
    except OSError:
        pass


def self_install_if_needed() -> bool:
    """Install a downloaded frozen Chute.exe for the current user and relaunch it.

    Returns True when the current process should exit because the installed copy
    was launched. No administrator privileges or Windows Service are used.
    """

    if os.name != "nt" or not getattr(sys, "frozen", False):
        return False

    source = _current_exe()
    target = installed_exe()
    if _same_path(source, target):
        _register_startup(target)
        _install_extension_bundle()
        return False

    target.parent.mkdir(parents=True, exist_ok=True)
    _ensure_data_layout()

    try:
        shutil.copy2(source, target)
    except PermissionError:
        # An older installed Chute may already be running. Do not damage user
        # data or fail noisily; the existing bridge remains usable.
        if already_running():
            return True
        raise

    extension = _install_extension_bundle()
    _register_startup(target)
    _launch_quiet(target)
    if extension is not None:
        _open_extension_onboarding(extension)
    return True


def main() -> int:
    if os.name != "nt":
        print("This Chute desktop build is for Windows.", file=sys.stderr)
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
            print(f"Chute extension: {extension_dir()}", flush=True)
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
