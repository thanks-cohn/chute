"""Exercise Win32 metadata and protected-write resource bookkeeping."""
import ctypes
import gc
import os
from pathlib import Path
import tempfile
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from chute.explorer.windows_fs import WindowsFS


class _Function:
    def __init__(self, callback):
        self.callback = callback

    def __call__(self, *args):
        return self.callback(*args)


class _MetadataKernel:
    """Only the metadata calls used by WindowsFS; file data remains on disk."""
    def __init__(self):
        self.handles = {}
        self.next_handle = 1
        self.GetLongPathNameW = _Function(self.expand)
        self.CreateFileW = _Function(self.open)
        self.CloseHandle = _Function(self.close)
        self.GetFileInformationByHandle = _Function(self.info)
        self.GetFinalPathNameByHandleW = _Function(self.final)

    @staticmethod
    def expand(path, buffer, _length):
        buffer.value = str(path)
        return len(buffer.value)

    def open(self, path, *_args):
        Path(path).stat()
        handle = self.next_handle
        self.next_handle += 1
        self.handles[handle] = Path(path)
        return handle

    def close(self, handle):
        del self.handles[handle]
        return 1

    def info(self, handle, pointer):
        path = self.handles[handle]
        stat = path.stat()
        info = pointer._obj
        info.attributes = 0x10 if path.is_dir() else 0
        info.volume = 1
        info.index_high, info.index_low = divmod(stat.st_ino, 1 << 32)
        info.size_high, info.size_low = divmod(stat.st_size, 1 << 32)
        info.written.dwHighDateTime, info.written.dwLowDateTime = divmod(stat.st_mtime_ns, 1 << 32)
        return 1

    def final(self, handle, buffer, _length, _flags):
        return self.expand(self.handles[handle], buffer, _length)


class WindowsMetadataResourceTests(unittest.TestCase):
    def test_repeated_consent_protection_does_not_retain_new_ctypes_types(self):
        from chute.explorer.grant_store import dpapi

        def protect(source, _description, entropy, _reserved, _prompt, flags, output):
            self.assertEqual(flags, 1)  # No Windows UI from protected persistence.
            self.assertEqual(ctypes.string_at(entropy._obj.data, entropy._obj.size),
                             b'chute-explorer-consent-v1:chrome-extension://fixture')
            source, output = source._obj, output._obj
            data = (ctypes.c_ubyte * source.size).from_buffer_copy(ctypes.string_at(source.data, source.size))
            output.size = source.size
            output.data = ctypes.cast(data, ctypes.POINTER(ctypes.c_ubyte))
            return 1

        crypt = SimpleNamespace(CryptProtectData=_Function(protect))
        kernel = SimpleNamespace(LocalFree=_Function(lambda _p: None))
        dll = lambda name, **_kwargs: crypt if name == 'crypt32' else kernel
        with patch.object(ctypes, 'WinDLL', new=dll, create=True), patch.object(os, 'name', 'nt'):
            self.assertEqual(dpapi(b'fixture', 'chrome-extension://fixture'), b'fixture')
            gc.collect()
            cache_size = len(ctypes._pointer_type_cache)
            for _ in range(200):
                self.assertEqual(dpapi(b'fixture', 'chrome-extension://fixture'), b'fixture')
            gc.collect()
            self.assertEqual(len(ctypes._pointer_type_cache), cache_size)

    def test_repeated_protected_writes_do_not_retain_new_ctypes_types(self):
        from chute.explorer.native import private_write

        def create(path, access, sharing, security, disposition, attributes, template):
            self.assertEqual((access, sharing, disposition, attributes, template),
                             (0x40000000, 0, 1, 0x80, None))
            self.assertFalse(security._obj.inherit)
            self.assertEqual(security._obj.descriptor, 1)
            return os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)

        def convert(sddl, revision, output, reserved):
            self.assertEqual((sddl, revision, reserved), ('D:P(A;;FA;;;OW)(A;;FA;;;SY)', 1, None))
            output._obj.value = 1
            return 1

        kernel = SimpleNamespace(CreateFileW=_Function(create), LocalFree=_Function(lambda _p: None))
        advapi = SimpleNamespace(ConvertStringSecurityDescriptorToSecurityDescriptorW=_Function(convert))
        dll = lambda name, **_kwargs: kernel if name == 'kernel32' else advapi
        # The fake HANDLE is an actual CRT descriptor owned by private_write's
        # real file stream. This also exercises flush, close and atomic replace.
        crt = SimpleNamespace(open_osfhandle=lambda fd, _flags: fd)
        with tempfile.TemporaryDirectory(prefix='chutey-private-write-') as temporary:
            target = Path(temporary) / 'events.json'
            with patch.object(ctypes, 'WinDLL', new=dll, create=True), \
                 patch.object(os, 'O_BINARY', 0, create=True), patch.dict(sys.modules, {'msvcrt': crt}):
                private_write(target, b'warmup')
                gc.collect()
                cache_size = len(ctypes._pointer_type_cache)
                for index in range(200):
                    private_write(target, str(index).encode())
                gc.collect()
                self.assertEqual(len(ctypes._pointer_type_cache), cache_size)
            self.assertEqual(target.read_bytes(), b'199')
            self.assertEqual(list(Path(temporary).iterdir()), [target])

    def test_repeated_guarded_identity_does_not_retain_new_ctypes_types(self):
        # ctypes.POINTER keeps each target class in a process-global cache.
        # Exercise both production methods: declaring a fresh local Structure
        # in either one leaks two permanent pointer types per file_identity.
        with tempfile.TemporaryDirectory(prefix='chutey-metadata-') as temporary:
            root = Path(temporary)
            (root / 'clip.mp4').write_bytes(b'metadata only fixture')
            kernel = _MetadataKernel()
            with patch.object(ctypes, 'WinDLL', new=lambda *_args, **_kwargs: kernel, create=True):
                fs = WindowsFS(root)
                identity = fs.file_identity(('clip.mp4',))
                gc.collect()
                cache_size = len(ctypes._pointer_type_cache)
                for _ in range(200):
                    self.assertEqual(fs.file_identity(('clip.mp4',)), identity)
                    self.assertEqual(kernel.handles, {})
                gc.collect()
                self.assertEqual(len(ctypes._pointer_type_cache), cache_size)
                fs.close()


@unittest.skipUnless(os.name == 'nt', 'WINDOWS_REAL_FS: Windows required')
class WindowsRealMetadataResourceTests(unittest.TestCase):
    def test_real_consent_protection_reuses_types_and_roundtrips(self):
        from chute.explorer.grant_store import dpapi
        origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
        protected = dpapi(b'fixture', origin)
        self.assertEqual(dpapi(protected, origin, decrypt=True), b'fixture')
        gc.collect()
        cache_size = len(ctypes._pointer_type_cache)
        for _ in range(200):
            protected = dpapi(b'fixture', origin)
            self.assertEqual(dpapi(protected, origin, decrypt=True), b'fixture')
        gc.collect()
        self.assertEqual(len(ctypes._pointer_type_cache), cache_size)

    def test_real_protected_writes_reuse_types(self):
        from chute.explorer.native import private_write
        with tempfile.TemporaryDirectory(prefix='chutey-private-write-real-') as temporary:
            target = Path(temporary) / 'events.json'
            private_write(target, b'warmup')
            gc.collect()
            cache_size = len(ctypes._pointer_type_cache)
            for index in range(200):
                private_write(target, str(index).encode())
            gc.collect()
            self.assertEqual(len(ctypes._pointer_type_cache), cache_size)
            self.assertEqual(target.read_bytes(), b'199')

    def test_real_guarded_metadata_reuses_types_and_identity(self):
        with tempfile.TemporaryDirectory(prefix='chutey-metadata-real-') as temporary:
            root = Path(temporary)
            (root / 'clip.mp4').write_bytes(b'metadata only fixture')
            fs = WindowsFS(root)
            try:
                identity = fs.file_identity(('clip.mp4',))
                gc.collect()
                cache_size = len(ctypes._pointer_type_cache)
                for _ in range(200):
                    self.assertEqual(fs.file_identity(('clip.mp4',)), identity)
                gc.collect()
                self.assertEqual(len(ctypes._pointer_type_cache), cache_size)
            finally:
                fs.close()
