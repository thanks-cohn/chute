"""Native-only folder consent on the existing companion. No webpage path input."""
from __future__ import annotations
import ctypes
from ctypes import wintypes as W
import json
import os
from pathlib import Path
import secrets
import threading
from . import Explorer, RootGrant, Session
from .api import ExplorerAPI
from .protocol import ExplorerError


def control_path():
    return Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'Chute' / 'explorer-control.json'


def private_write(path, data):
    """Create a protected owner+SYSTEM-only file before writing any secret bytes."""
    path.parent.mkdir(parents=True,exist_ok=True)
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    advapi=ctypes.WinDLL('advapi32',use_last_error=True)
    class SA(ctypes.Structure):
        _fields_=[('length',W.DWORD),('descriptor',ctypes.c_void_p),('inherit',W.BOOL)]
    descriptor=ctypes.c_void_p()
    convert=advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW
    convert.argtypes=[W.LPCWSTR,W.DWORD,ctypes.POINTER(ctypes.c_void_p),ctypes.c_void_p]
    if not convert('D:P(A;;FA;;;OW)(A;;FA;;;SY)',1,ctypes.byref(descriptor),None):
        raise ctypes.WinError(ctypes.get_last_error())
    sa=SA(ctypes.sizeof(SA),descriptor,False)
    create=kernel.CreateFileW
    create.argtypes=[W.LPCWSTR,W.DWORD,W.DWORD,ctypes.POINTER(SA),W.DWORD,W.DWORD,W.HANDLE]; create.restype=W.HANDLE
    # Fresh random filename avoids inheriting a pre-existing file's ACL.
    temporary=path.with_name('explorer-'+secrets.token_hex(16)+'.tmp')
    handle=create(str(temporary),0x40000000,0,ctypes.byref(sa),1,0x80,None)
    kernel.LocalFree.argtypes=[ctypes.c_void_p]; kernel.LocalFree(descriptor)
    if handle == ctypes.c_void_p(-1).value: raise ctypes.WinError(ctypes.get_last_error())
    import msvcrt
    fd=msvcrt.open_osfhandle(handle,os.O_WRONLY|os.O_BINARY)
    with os.fdopen(fd,'wb') as stream:
        stream.write(data); stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary,path)


def choose_folder():
    import tkinter as tk
    from tkinter import filedialog
    root=tk.Tk(); root.withdraw()
    try:
        root.attributes('-topmost',True)
        return filedialog.askdirectory(parent=root,title='Allow Chutey to browse this local folder (read only)',mustexist=True)
    finally: root.destroy()


class NativeExplorer:
    def __init__(self):
        self.token=secrets.token_urlsafe(32)
        self.adapters={}
        self.lock=threading.Lock()
        private_write(control_path(),json.dumps({'token':self.token}).encode())

    def action(self, origin, *, select):
        from ..native_host import _allowed_extension_ids
        session=Session(origin)
        if origin.removeprefix('chrome-extension://') not in _allowed_extension_ids():
            raise ExplorerError('UNAUTHORIZED','This Chutey installation is not enrolled.')
        if not self.lock.acquire(blocking=False):
            raise ExplorerError('BUSY','A folder selection is already open.')
        try:
            old=self.adapters.get(origin)
            if select:
                path=choose_folder()
                if not path: raise ExplorerError('CANCELLED','No folder was selected. Existing access is unchanged.')
                engine=Explorer([RootGrant(Path(path))])
                adapter=ExplorerAPI(engine,session)
                # Leave in-flight old reads alive; old sessions expire naturally.
                self.adapters[origin]=adapter
                if old: old.engine.close()
            elif old:
                # Reopening Shelf renews same root without broadening scope.
                adapter=ExplorerAPI(old.engine,session)
                self.adapters[origin]=adapter
            else:
                raise ExplorerError('NEEDS_SELECTION','Select a folder to begin browsing.')
            return {'ok':True,'token':session.token,'expires_in':900,'read_only':True}
        finally: self.lock.release()

    def adapter(self, origin): return self.adapters.get(origin)
