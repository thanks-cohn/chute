"""Reveal a Chute item in the operating system's file manager.

This module only accepts a path resolved by the local Store; browser requests
must never supply an arbitrary filesystem path.
"""

from __future__ import annotations

import ctypes
import os
from pathlib import Path
import shutil
import subprocess
import sys


def reveal_file(path: Path) -> str:
    """Show a saved file in its folder; return 'selected' or 'folder'.

    Desktop focus policies can limit foreground activation (notably Wayland).
    The result describes the operation accepted by the file manager, rather
    than a guarantee that the window manager granted focus.
    """
    file_path = Path(path).resolve(strict=True)
    if not file_path.is_file():
        raise FileNotFoundError(f"Chute file does not exist: {file_path}")

    if sys.platform == "win32":
        return _reveal_windows(file_path)
    if sys.platform.startswith("linux"):
        return _reveal_linux(file_path)
    raise OSError("Opening a file location is not supported on this operating system.")


def _select_windows_shell(file_path: Path) -> None:
    """Use the Windows shell API to open Explorer with this file selected."""
    from ctypes import wintypes

    shell32 = ctypes.windll.shell32
    ole32 = ctypes.windll.ole32

    ole32.CoInitializeEx.argtypes = [ctypes.c_void_p, wintypes.DWORD]
    ole32.CoInitializeEx.restype = ctypes.c_long
    ole32.CoUninitialize.argtypes = []
    ole32.CoUninitialize.restype = None
    ole32.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    ole32.CoTaskMemFree.restype = None

    shell32.SHParseDisplayName.argtypes = [
        wintypes.LPCWSTR, ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_void_p), wintypes.DWORD,
        ctypes.c_void_p,
    ]
    shell32.SHParseDisplayName.restype = ctypes.c_long
    shell32.SHOpenFolderAndSelectItems.argtypes = [
        ctypes.c_void_p, wintypes.UINT, ctypes.c_void_p, wintypes.DWORD,
    ]
    shell32.SHOpenFolderAndSelectItems.restype = ctypes.c_long

    initialized = ole32.CoInitializeEx(None, 2)  # COINIT_APARTMENTTHREADED
    if initialized not in (0, 1):
        raise OSError(f"Could not initialize Windows shell (HRESULT {initialized}).")

    pidl = ctypes.c_void_p()
    try:
        parsed = shell32.SHParseDisplayName(str(file_path), None, ctypes.byref(pidl), 0, None)
        if parsed != 0 or not pidl.value:
            raise OSError(f"Could not locate file in Windows shell (HRESULT {parsed}).")

        # With cidl=0 the fully qualified PIDL is the *item* to select,
        # not merely a folder to open (documented Shell API behavior).
        shown = shell32.SHOpenFolderAndSelectItems(pidl, 0, None, 0)
        if shown != 0:
            raise OSError(f"Windows Explorer could not select the file (HRESULT {shown}).")
    finally:
        if pidl.value:
            ole32.CoTaskMemFree(pidl)
        ole32.CoUninitialize()


def _reveal_windows(file_path: Path) -> str:
    try:
        _select_windows_shell(file_path)
    except (OSError, AttributeError):
        # Older/restricted Windows shells: Explorer can still select the item.
        subprocess.Popen(
            ["explorer.exe", "/select,", str(file_path)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    return "selected"


def _reveal_linux(file_path: Path) -> str:
    uri = file_path.as_uri()
    if shutil.which("gdbus"):
        try:
            subprocess.run(
                [
                    "gdbus", "call", "--session",
                    "--dest", "org.freedesktop.FileManager1",
                    "--object-path", "/org/freedesktop/FileManager1",
                    "--method", "org.freedesktop.FileManager1.ShowItems",
                    f"['{uri}']", "",
                ],
                check=True,
                timeout=5,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return "selected"
        except (OSError, subprocess.SubprocessError):
            pass

    # Prefer native selection switches when FileManager1 is unavailable.
    for executable in ("dolphin", "nautilus", "thunar"):
        if shutil.which(executable):
            subprocess.Popen(
                [executable, "--select", str(file_path)],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return "selected"

    if shutil.which("xdg-open"):
        subprocess.Popen(
            ["xdg-open", str(file_path.parent)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        return "folder"  # xdg-open cannot guarantee selecting the actual file.

    raise OSError("No supported Linux desktop file manager is available.")
