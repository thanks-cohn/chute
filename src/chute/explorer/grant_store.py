"""Native-only durable consent. Never persist session tokens or opaque handles."""
from __future__ import annotations

import ctypes
from ctypes import wintypes as W
import hashlib
import json
import os
from pathlib import Path

from .protocol import ExplorerError
from .security import RootGrant, component

CONSENT_VERSION = 1


def dpapi(data: bytes, origin: str, *, decrypt=False) -> bytes:
    """Current-user DPAPI with origin/schema entropy; UI is forbidden."""
    if os.name != 'nt':
        raise ExplorerError('UNSUPPORTED_PLATFORM', 'Protected consent requires Windows.')
    class Blob(ctypes.Structure):
        _fields_ = [('size', W.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    def blob(value):
        buffer = (ctypes.c_ubyte * len(value)).from_buffer_copy(value)
        return Blob(len(value), buffer)
    source = blob(data)
    entropy = blob(('chute-explorer-consent-v1:' + origin).encode())
    output = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    function = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.POINTER(Blob),
                         ctypes.c_void_p, ctypes.c_void_p, W.DWORD, ctypes.POINTER(Blob)]
    function.restype = W.BOOL
    if not function(ctypes.byref(source), None, ctypes.byref(entropy), None, None, 1, ctypes.byref(output)):
        raise ExplorerError('CONSENT_INVALID', 'Saved approval cannot be unlocked. Select the folder again.')
    try:
        return ctypes.string_at(output.data, output.size)
    finally:
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.LocalFree.argtypes = [ctypes.c_void_p]
        kernel.LocalFree(output.data)


class GrantStore:
    def __init__(self, directory=None, *, protect=dpapi, writer=None):
        self.directory = directory or Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'Chute' / 'ExplorerGrants'
        self.protect, self.writer = protect, writer

    def path(self, origin):
        return self.directory / (hashlib.sha256(origin.encode()).hexdigest() + '.grant')

    def save(self, origin, descriptor):
        from .native import private_write
        data = {'version': CONSENT_VERSION, 'origin': origin, 'scope': 'read', **descriptor}
        protected=self.protect(json.dumps(data).encode(), origin)
        if len(protected)>65536:
            raise ExplorerError('STATE_LIMIT','Saved approval state is full. Reconcile transfers before continuing.')
        (self.writer or private_write)(self.path(origin), protected)

    def load(self, origin):
        path = self.path(origin)
        if not path.exists():
            raise ExplorerError('NEEDS_SELECTION', 'Select a folder once to approve persistent read access.')
        try:
            if path.is_symlink() or path.stat().st_size > 65536:
                raise ValueError
            data = json.loads(self.protect(path.read_bytes(), origin, decrypt=True))
            if data['version'] != CONSENT_VERSION or data['origin'] != origin or data['scope'] not in {'read','read_write'}:
                raise ValueError
            return data
        except (OSError, ValueError, KeyError, TypeError):
            raise ExplorerError('CONSENT_INVALID', 'Saved approval is unavailable. Select the folder again.')

    def revoke(self, origin):
        self.path(origin).unlink(missing_ok=True)


def describe(grant, path):
    info = grant.stat(grant.id)
    return {'path': str(Path(path).absolute()), 'identity': [info.st_dev, info.st_ino],
            'location': [], 'view': {}, 'scope':'read_write' if grant.writable else 'read'}


def restore(descriptor):
    grant = RootGrant(Path(descriptor['path']), writable=descriptor.get('scope') == 'read_write')
    try:
        info = grant.stat(grant.id)
        if descriptor['identity'] != [info.st_dev, info.st_ino]:
            raise ExplorerError('CONSENT_INVALID', 'The approved folder was replaced. Select it again.')
        parts = descriptor.get('location', [])
        if not isinstance(parts, list) or len(parts) > 256:
            raise ValueError
        for part in parts:
            component(part)
        handle = grant.handle(tuple(parts))
        try:
            with grant.open(handle, directory=True):
                pass
        except (OSError, ExplorerError):
            handle = grant.id  # Missing last directory does not revoke the root.
        return grant, handle
    except BaseException:
        grant.close()
        raise
