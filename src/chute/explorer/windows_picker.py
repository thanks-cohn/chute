"""One Shell-owned IFileOpenDialog; no Tk/helper window and no legacy fallback."""
from __future__ import annotations

import ctypes
from ctypes import wintypes as W
import uuid

from .protocol import ExplorerError


def pick_folder(*, writable=False):
    # Called only by an explicit consent action, on its request thread (STA).
    ole = ctypes.WinDLL('ole32')
    ole.CoInitializeEx.argtypes = [ctypes.c_void_p, W.DWORD]
    ole.CoInitializeEx.restype = ctypes.c_long
    result = ole.CoInitializeEx(None, 2)  # COINIT_APARTMENTTHREADED
    if result not in (0, 1):
        raise ExplorerError('PICKER_UNAVAILABLE', 'Windows could not open the folder picker. Try Browse again.')
    dialog, item = ctypes.c_void_p(), ctypes.c_void_p()
    path = ctypes.c_void_p()
    def guid(value):
        return (ctypes.c_ubyte * 16).from_buffer_copy(uuid.UUID(value).bytes_le)
    def method(pointer, index, *types):
        table = ctypes.cast(pointer, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
        return ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, *types)(table[index])
    def checked(result):
        if result < 0:
            raise ExplorerError('PICKER_UNAVAILABLE', 'Windows could not complete folder selection. Try Browse again.')
    try:
        cls = guid('DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7')
        iid = guid('D57C7288-D4AD-4768-BE02-9D969532D960')
        ole.CoCreateInstance.argtypes = [ctypes.c_void_p, ctypes.c_void_p, W.DWORD, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
        checked(ole.CoCreateInstance(cls, None, 1, iid, ctypes.byref(dialog)))
        options = W.DWORD()
        checked(method(dialog, 10, ctypes.POINTER(W.DWORD))(dialog, ctypes.byref(options)))
        # FOS_PICKFOLDERS | FORCEFILESYSTEM | PATHMUSTEXIST | NOCHANGEDIR
        checked(method(dialog, 9, W.DWORD)(dialog, options.value | 0x20 | 0x40 | 0x800 | 0x8))
        checked(method(dialog, 17, W.LPCWSTR)(dialog, 'Choose a folder to save files in' if writable else 'Choose a folder to browse'))
        user = ctypes.WinDLL('user32', use_last_error=True)
        user.GetForegroundWindow.restype = W.HWND
        result = method(dialog, 3, W.HWND)(dialog, user.GetForegroundWindow())
        if result & 0xffffffff == 0x800704c7:  # HRESULT_FROM_WIN32(ERROR_CANCELLED)
            return ''
        checked(result)
        checked(method(dialog, 20, ctypes.POINTER(ctypes.c_void_p))(dialog, ctypes.byref(item)))
        checked(method(item, 5, W.DWORD, ctypes.POINTER(ctypes.c_void_p))(item, 0x80058000, ctypes.byref(path)))  # SIGDN_FILESYSPATH
        return ctypes.wstring_at(path)
    finally:
        ole.CoTaskMemFree.argtypes = [ctypes.c_void_p]
        if path: ole.CoTaskMemFree(path)
        if item: method(item, 2)(item)
        if dialog: method(dialog, 2)(dialog)
        ole.CoUninitialize()
