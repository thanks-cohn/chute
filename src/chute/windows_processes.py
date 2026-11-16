"""Read-only exact-image process discovery and local interprocess exclusion.

Health failures never authorize killing a process. No name-based termination.
"""
from __future__ import annotations
from contextlib import contextmanager
import hashlib
import os
from pathlib import Path


def matching_pids(target: Path):
    """Return exact-image PIDs; None means identity could not be established."""
    if os.name!='nt': return None
    import ctypes
    from ctypes import wintypes as W
    class Entry(ctypes.Structure):
        _fields_=[('size',W.DWORD),('usage',W.DWORD),('pid',W.DWORD),('heap',ctypes.c_size_t),
                  ('module',W.DWORD),('threads',W.DWORD),('parent',W.DWORD),('priority',W.LONG),
                  ('flags',W.DWORD),('exe',W.WCHAR*260)]
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    k.CreateToolhelp32Snapshot.argtypes=[W.DWORD,W.DWORD];k.CreateToolhelp32Snapshot.restype=W.HANDLE
    k.Process32FirstW.argtypes=[W.HANDLE,ctypes.POINTER(Entry)];k.Process32FirstW.restype=W.BOOL
    k.Process32NextW.argtypes=[W.HANDLE,ctypes.POINTER(Entry)];k.Process32NextW.restype=W.BOOL
    k.OpenProcess.argtypes=[W.DWORD,W.BOOL,W.DWORD];k.OpenProcess.restype=W.HANDLE
    k.QueryFullProcessImageNameW.argtypes=[W.HANDLE,W.DWORD,W.LPWSTR,ctypes.POINTER(W.DWORD)];k.QueryFullProcessImageNameW.restype=W.BOOL
    k.CloseHandle.argtypes=[W.HANDLE];k.CloseHandle.restype=W.BOOL
    snapshot=k.CreateToolhelp32Snapshot(2,0)
    if snapshot==ctypes.c_void_p(-1).value: return None
    result=[];expected=os.path.normcase(os.path.realpath(target));unknown=False
    try:
        entry=Entry();entry.size=ctypes.sizeof(entry)
        available=k.Process32FirstW(snapshot,ctypes.byref(entry))
        if not available: return None
        while available:
            if entry.exe.casefold()==target.name.casefold():
                process=k.OpenProcess(0x1000,False,entry.pid)
                if not process: unknown=True
                else:
                    try:
                        name=ctypes.create_unicode_buffer(32768);size=W.DWORD(len(name))
                        if not k.QueryFullProcessImageNameW(process,0,name,ctypes.byref(size)): unknown=True
                        elif os.path.normcase(os.path.realpath(name.value))==expected:result.append(entry.pid)
                    finally:k.CloseHandle(process)
            available=k.Process32NextW(snapshot,ctypes.byref(entry))
        # ERROR_NO_MORE_FILES is the only complete enumeration outcome.
        if ctypes.get_last_error()!=18: unknown=True
        return None if unknown else result
    finally:k.CloseHandle(snapshot)


@contextmanager
def launch_guard(target: Path, *, purpose="wake"):
    if os.name!='nt':
        yield False;return
    import ctypes
    from ctypes import wintypes as W
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    k.CreateMutexW.argtypes=[ctypes.c_void_p,W.BOOL,W.LPCWSTR];k.CreateMutexW.restype=W.HANDLE
    k.WaitForSingleObject.argtypes=[W.HANDLE,W.DWORD];k.WaitForSingleObject.restype=W.DWORD
    k.ReleaseMutex.argtypes=[W.HANDLE];k.CloseHandle.argtypes=[W.HANDLE]
    identity=hashlib.sha256(os.path.normcase(os.path.realpath(target)).encode()).hexdigest()[:24]
    if purpose not in {'wake','server'}: raise ValueError('Invalid mutex purpose')
    mutex=k.CreateMutexW(None,False,'Local\\Chutey-'+purpose+'-'+identity)
    if not mutex:yield False;return
    acquired=k.WaitForSingleObject(mutex,100) in {0,0x80}
    try:yield acquired
    finally:
        if acquired:k.ReleaseMutex(mutex)
        k.CloseHandle(mutex)


@contextmanager
def instance_guard(target: Path):
    # Different from the launch mutex: helper can wait for /health while this
    # lifetime guard is held by the serving process, without deadlocking it.
    with launch_guard(target,purpose='server') as acquired:
        yield acquired
