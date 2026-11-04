"""Windows read authority: real no-reparse handles held through each operation.

Read-only directory sharing prevents rename/delete/reparse substitution while a
path is used. Files are opened from guarded parents, with writes/deletes denied.
UNC, device namespaces, volume roots and Windows system trees are not grants.
"""
from __future__ import annotations
import contextlib
import ctypes
from ctypes import wintypes as W
import os
from pathlib import Path
from .protocol import ExplorerError


def validate_root(path):
    raw = str(path)
    if raw.startswith(('\\\\', '//')) or ':' in raw[2:] or not Path(raw).is_absolute():
        raise ExplorerError('UNSAFE_ROOT', 'Select a local folder, not a network or device path.')
    absolute = os.path.abspath(raw)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    expand = kernel.GetLongPathNameW
    expand.argtypes = [W.LPCWSTR, W.LPWSTR, W.DWORD]; expand.restype = W.DWORD
    buffer = ctypes.create_unicode_buffer(32768)
    count = expand(absolute, buffer, len(buffer))
    if not count or count >= len(buffer):
        raise ctypes.WinError(ctypes.get_last_error())
    # Expand DOS aliases only, never resolve a junction/symlink into an authorized root.
    root = Path(buffer.value)
    if root == Path(root.anchor):
        raise ExplorerError('UNSAFE_ROOT', 'Select a folder rather than an entire drive.')
    protected = [Path(os.environ.get('WINDIR', r'C:\Windows')),
                 Path(os.environ.get('ProgramFiles', r'C:\Program Files')),
                 Path(os.environ.get('ProgramData', r'C:\ProgramData'))]
    if any(root == p or root.is_relative_to(p) for p in protected):
        raise ExplorerError('UNSAFE_ROOT', 'System folders are not available to Explorer.')
    return root


class WindowsFS:
    def __init__(self, root):
        self.root = validate_root(root)
        self.closed = False
        with self.guard((), directory=True) as (_, info):
            self.identity = info.st_dev, info.st_ino

    @contextlib.contextmanager
    def guard(self, parts, *, directory=False):
        if self.closed:
            raise ExplorerError('EXPIRED', 'Select the folder again.')
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        create = kernel.CreateFileW
        create.argtypes = [W.LPCWSTR,W.DWORD,W.DWORD,ctypes.c_void_p,W.DWORD,W.DWORD,W.HANDLE]
        create.restype = W.HANDLE
        close = kernel.CloseHandle; close.argtypes = [W.HANDLE]; close.restype = W.BOOL
        class Info(ctypes.Structure):
            _fields_ = [('attributes',W.DWORD),('created',W.FILETIME),('accessed',W.FILETIME),('written',W.FILETIME),('volume',W.DWORD),('size_high',W.DWORD),('size_low',W.DWORD),('links',W.DWORD),('index_high',W.DWORD),('index_low',W.DWORD)]
        get = kernel.GetFileInformationByHandle; get.argtypes=[W.HANDLE,ctypes.POINTER(Info)]; get.restype=W.BOOL
        final = kernel.GetFinalPathNameByHandleW; final.argtypes=[W.HANDLE,W.LPWSTR,W.DWORD,W.DWORD]; final.restype=W.DWORD
        handles=[]
        paths=list(reversed(self.root.parents)) + [self.root]
        path=self.root
        for part in parts:
            from .security import component
            component(part); path=path / part; paths.append(path)
        try:
            for index, candidate in enumerate(paths):
                last=index == len(paths)-1
                # OPEN_EXISTING, OPEN_REPARSE_POINT, BACKUP_SEMANTICS. No write/delete sharing.
                access=0x80000000 if last and not directory else 0x80
                handle=create(str(candidate),access,1,None,3,0x02200000,None)
                if handle == ctypes.c_void_p(-1).value:
                    raise ctypes.WinError(ctypes.get_last_error())
                handles.append(handle)
                info=Info()
                if not get(handle,ctypes.byref(info)):
                    raise ctypes.WinError(ctypes.get_last_error())
                if info.attributes & 0x400 or (not last or directory) and not info.attributes & 0x10:
                    raise ExplorerError('UNSAFE_LINK','Links, junctions and reparse points are unavailable.')
                buffer=ctypes.create_unicode_buffer(32768)
                count=final(handle,buffer,len(buffer),0)
                if not count or count >= len(buffer) or os.path.normcase(buffer.value.removeprefix('\\\\?\\')) != os.path.normcase(str(candidate)):
                    raise ExplorerError('DIRECTORY_CHANGED','The folder identity changed. Select it again.')
                if candidate == self.root:
                    key = (info.volume, info.index_high, info.index_low)
                    if hasattr(self, 'root_key') and key != self.root_key:
                        raise ExplorerError('DIRECTORY_CHANGED','The selected folder was replaced.')
                    self.root_key = key
            yield handles[-1], os.stat(path,follow_symlinks=False)
        finally:
            for handle in reversed(handles): close(handle)

    @contextlib.contextmanager
    def open(self, parts):
        import msvcrt
        with self.guard(parts) as (handle, info):
            if not __import__('stat').S_ISREG(info.st_mode):
                raise ExplorerError('UNSAFE_TYPE','Select a regular file.')
            # Duplicate so the guard retains exclusive ownership of its HANDLE.
            kernel=ctypes.WinDLL('kernel32',use_last_error=True)
            kernel.GetCurrentProcess.restype=W.HANDLE
            kernel.DuplicateHandle.argtypes=[W.HANDLE,W.HANDLE,W.HANDLE,ctypes.POINTER(W.HANDLE),W.DWORD,W.BOOL,W.DWORD]
            duplicate=W.HANDLE(); process=kernel.GetCurrentProcess()
            if not kernel.DuplicateHandle(process,handle,process,ctypes.byref(duplicate),0,False,2):
                raise ctypes.WinError(ctypes.get_last_error())
            fd=msvcrt.open_osfhandle(duplicate.value,os.O_RDONLY|os.O_BINARY)
            try: yield fd
            finally: os.close(fd)

    def close(self): self.closed=True

    @staticmethod
    def handle_identity(handle):
        """One canonical identity for enumeration, stat and opened byte streams.

        Windows DirEntry.stat may report zero dev/ino; CRT fstat and path stat
        can also differ. Do not compare those representations for authorization.
        """
        class Info(ctypes.Structure):
            _fields_=[('attributes',W.DWORD),('created',W.FILETIME),('accessed',W.FILETIME),
                      ('written',W.FILETIME),('volume',W.DWORD),('size_high',W.DWORD),
                      ('size_low',W.DWORD),('links',W.DWORD),('index_high',W.DWORD),('index_low',W.DWORD)]
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        get=kernel.GetFileInformationByHandle
        get.argtypes=[W.HANDLE,ctypes.POINTER(Info)];get.restype=W.BOOL
        info=Info()
        if not get(handle,ctypes.byref(info)): raise ctypes.WinError(ctypes.get_last_error())
        return f'{info.volume}:{(info.index_high<<32)|info.index_low}:{(info.written.dwHighDateTime<<32)|info.written.dwLowDateTime}:{(info.size_high<<32)|info.size_low}'

    def file_identity(self, parts, *, fd=None):
        if fd is not None:
            import msvcrt
            return self.handle_identity(msvcrt.get_osfhandle(fd))
        with self.guard(parts) as (handle,_):
            return self.handle_identity(handle)
