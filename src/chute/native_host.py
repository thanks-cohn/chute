from __future__ import annotations

import json
import os
import re
import shutil
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from .server import DEFAULT_HOST, DEFAULT_PORT

HOST_NAME = "com.thankscohn.chute"
STORE_EXTENSION_ID = "hpcpnigfadojjmnbflfhkfkallfafajb"
_NATIVE_KEY = rf"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}"
_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
_UNINSTALL_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Chute"
_EXTENSION_ID_RE = re.compile(r"^[a-p]{32}$")


def install_dir() -> Path:
    local = os.environ.get("LOCALAPPDATA")
    base = Path(local) if local else (Path.home() / "AppData" / "Local")
    return base / "Programs" / "Chute"


def companion_exe() -> Path:
    return install_dir() / "Chute.exe"


def native_host_exe() -> Path:
    return install_dir() / "Chute-NativeHost.exe"


def native_manifest_path() -> Path:
    return install_dir() / f"{HOST_NAME}.json"


def extra_origins_path() -> Path:
    return install_dir() / "native-origins.txt"


def data_dir() -> Path:
    return (Path.home() / "Chute").resolve()


def _health_url() -> str:
    return f"http://{DEFAULT_HOST}:{DEFAULT_PORT}/health"


def bridge_alive(timeout: float = 0.35) -> bool:
    try:
        with urllib.request.urlopen(_health_url(), timeout=timeout) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def _creation_flags() -> int:
    if os.name != "nt":
        return 0
    return subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW


def launch_bridge() -> bool:
    target = companion_exe()
    if not target.is_file():
        return False
    try:
        subprocess.Popen(
            [str(target), "--background"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            creationflags=_creation_flags(),
        )
        return True
    except OSError:
        return False


def ensure_bridge(timeout: float = 6.0) -> bool:
    if bridge_alive():
        return True
    if not launch_bridge():
        return False
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if bridge_alive(timeout=0.25):
            return True
        time.sleep(0.12)
    return False


def _allowed_extension_ids() -> list[str]:
    ids = [STORE_EXTENSION_ID]
    path = extra_origins_path()
    if path.is_file():
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                candidate = line.strip().lower()
                if _EXTENSION_ID_RE.fullmatch(candidate) and candidate not in ids:
                    ids.append(candidate)
        except OSError:
            pass
    return ids


def register_native_host(target: Path | None = None) -> Path:
    if os.name != "nt":
        raise OSError("Native host registration is Windows-only")
    import winreg

    target = (target or native_host_exe()).resolve()
    manifest = native_manifest_path()
    manifest.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "name": HOST_NAME,
        "description": "Chute local companion wake and uninstall bridge",
        "path": str(target),
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{extension_id}/" for extension_id in _allowed_extension_ids()
        ],
    }
    manifest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, _NATIVE_KEY) as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest.resolve()))
    return manifest


def allow_extension(extension_id: str) -> None:
    extension_id = str(extension_id or "").strip().lower()
    if not _EXTENSION_ID_RE.fullmatch(extension_id):
        raise ValueError("Chrome extension ID must be 32 letters from a through p")
    path = extra_origins_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = set()
    if path.is_file():
        try:
            existing = {line.strip().lower() for line in path.read_text(encoding="utf-8").splitlines()}
        except OSError:
            pass
    existing.add(extension_id)
    path.write_text("\n".join(sorted(existing)) + "\n", encoding="utf-8")
    register_native_host()


def unregister_native_host() -> None:
    if os.name != "nt":
        return
    import winreg

    try:
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, _NATIVE_KEY)
    except FileNotFoundError:
        pass
    try:
        native_manifest_path().unlink()
    except FileNotFoundError:
        pass


def register_windows_uninstaller(target: Path | None = None, version: str = "2.6.0") -> None:
    if os.name != "nt":
        return
    import winreg

    target = (target or companion_exe()).resolve()
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, _UNINSTALL_KEY) as key:
        winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, "Chute")
        winreg.SetValueEx(key, "DisplayVersion", 0, winreg.REG_SZ, version)
        winreg.SetValueEx(key, "Publisher", 0, winreg.REG_SZ, "Chute")
        winreg.SetValueEx(key, "InstallLocation", 0, winreg.REG_SZ, str(install_dir().resolve()))
        winreg.SetValueEx(key, "DisplayIcon", 0, winreg.REG_SZ, str(target))
        winreg.SetValueEx(key, "UninstallString", 0, winreg.REG_SZ, f'"{target}" --uninstall')
        winreg.SetValueEx(key, "QuietUninstallString", 0, winreg.REG_SZ, f'"{target}" --uninstall')
        winreg.SetValueEx(key, "NoModify", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(key, "NoRepair", 0, winreg.REG_DWORD, 1)


def _delete_registry_key(root, path: str) -> None:
    import winreg

    try:
        winreg.DeleteKey(root, path)
    except FileNotFoundError:
        pass


def unregister_windows_components() -> None:
    if os.name != "nt":
        return
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            try:
                winreg.DeleteValue(key, "Chute")
            except FileNotFoundError:
                pass
    except FileNotFoundError:
        pass
    unregister_native_host()
    _delete_registry_key(winreg.HKEY_CURRENT_USER, _UNINSTALL_KEY)


def schedule_uninstall(delete_data: bool = False) -> None:
    unregister_windows_components()
    if os.name != "nt":
        return

    install = str(install_dir().resolve())
    data = str(data_dir())
    cleanup = (
        "timeout /t 2 /nobreak >nul"
        " & taskkill /IM Chute.exe /F >nul 2>nul"
        " & taskkill /IM Chute-NativeHost.exe /F >nul 2>nul"
        f' & rmdir /s /q "{install}"'
    )
    if delete_data:
        cleanup += f' & rmdir /s /q "{data}"'
    subprocess.Popen(
        ["cmd.exe", "/d", "/s", "/c", cleanup],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        creationflags=_creation_flags(),
    )


def _set_binary_stdio() -> None:
    if os.name != "nt":
        return
    import msvcrt

    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)


def _read_message() -> dict | None:
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    if len(raw_length) != 4:
        raise EOFError("Incomplete native message header")
    length = struct.unpack("=I", raw_length)[0]
    if length > 64 * 1024 * 1024:
        raise ValueError("Native message too large")
    payload = sys.stdin.buffer.read(length)
    if len(payload) != length:
        raise EOFError("Incomplete native message body")
    value = json.loads(payload.decode("utf-8"))
    return value if isinstance(value, dict) else {}


def _write_message(payload: dict) -> None:
    data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def native_main() -> int:
    _set_binary_stdio()
    while True:
        message = _read_message()
        if message is None:
            return 0
        action = str(message.get("action") or "")
        if action == "ensure_bridge":
            ok = ensure_bridge()
            _write_message({"ok": ok, "bridge": "ready" if ok else "unavailable"})
            continue
        if action == "ping":
            _write_message({"ok": True, "bridge": bridge_alive()})
            continue
        if action == "uninstall":
            delete_data = bool(message.get("delete_data"))
            _write_message({"ok": True, "delete_data": delete_data})
            schedule_uninstall(delete_data=delete_data)
            return 0
        _write_message({"ok": False, "error": "Unsupported Chute native action"})


def install_bundled_native_host(bundle_root: Path) -> Path:
    source = bundle_root / "Chute-NativeHost.exe"
    target = native_host_exe()
    if not source.is_file():
        raise FileNotFoundError(f"Bundled native host missing: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    register_native_host(target)
    return target
