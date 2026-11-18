"""Measure retained ctypes allocations in actual production methods.

Win32 APIs are FAKE: this measures Python allocations and pointer-type retention,
not Windows RSS, encryption, ACL correctness, playback or whole-worker stability.
Protected writes still use real disposable files, fsync and atomic replacement.
Run separate processes with/without --source-ref for comparable source snapshots.
"""
from __future__ import annotations
import argparse
import ctypes
from datetime import datetime, timezone
import gc
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import time
import tracemalloc
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))


class Function:
    def __init__(self, callback):
        self.callback = callback

    def __call__(self, *args):
        return self.callback(*args)


def fake_metadata(_handle, pointer):
    info = pointer._obj
    info.volume = 1
    info.index_low = 2
    info.written.dwLowDateTime = 3
    info.size_low = 4
    return 1


def fake_create(path, *_args):
    return os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)


def fake_descriptor(_sddl, _revision, output, _reserved):
    output._obj.value = 1
    return 1


def fake_protect(source, _description, _entropy, _reserved, _prompt, _flags, output):
    source, output = source._obj, output._obj
    data = (ctypes.c_ubyte * source.size).from_buffer_copy(ctypes.string_at(source.data, source.size))
    output.size = source.size
    output.data = ctypes.cast(data, ctypes.POINTER(ctypes.c_ubyte))
    return 1


def source_module(stem, source_ref, hashes):
    relative = 'src/chute/explorer/' + stem + '.py'
    source = (subprocess.check_output(['git', 'show', source_ref + ':' + relative], cwd=ROOT)
              if source_ref else (ROOT / relative).read_bytes())
    hashes[relative] = hashlib.sha256(source).hexdigest()
    module = ModuleType('chute.explorer._allocation_probe_' + stem)
    module.__file__ = str(ROOT / relative)
    exec(compile(source, module.__file__, 'exec'), module.__dict__)
    return module


def measure(operation, calls):
    operation()  # Warm imports, stable pointer types and the one output file.
    gc.collect()
    before_types = len(ctypes._pointer_type_cache)
    tracemalloc.start()
    before_bytes = tracemalloc.get_traced_memory()[0]
    started = time.perf_counter()
    for _ in range(calls):
        operation()
    elapsed = time.perf_counter() - started
    gc.collect()
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return {'measured_calls': calls, 'warmup_calls': 1, 'elapsed_seconds': round(elapsed, 6),
            'pointer_types_before': before_types, 'pointer_types_after': len(ctypes._pointer_type_cache),
            'retained_pointer_types': len(ctypes._pointer_type_cache) - before_types,
            'retained_tracemalloc_bytes_after_gc': current - before_bytes,
            'peak_tracemalloc_bytes': peak}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-ref', help='Read production method sources from this Git commit instead of the working tree.')
    parser.add_argument('--identity-calls', type=int, default=2000)
    parser.add_argument('--write-calls', type=int, default=200)
    parser.add_argument('--dpapi-calls', type=int, default=200)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if min(args.identity_calls, args.write_calls, args.dpapi_calls) < 1:
        parser.error('All call counts must be positive.')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    source_ref = (subprocess.check_output(['git', 'rev-parse', '--verify', '--end-of-options',
                                         args.source_ref + '^{commit}'], cwd=ROOT, text=True).strip()
                  if args.source_ref else None)
    hashes = {}
    windows_fs, native, grant_store = [source_module(stem, source_ref, hashes)
                                       for stem in ('windows_fs', 'native', 'grant_store')]
    report = {'scope': 'FAKE Win32 API, actual production methods; Python allocations only, NOT Windows RSS or acceptance',
              'at_utc': datetime.now(timezone.utc).isoformat(), 'python': platform.python_version(),
              'platform': sys.platform, 'source_commit': source_ref or head,
              'source_from_working_tree': source_ref is None, 'source_sha256': hashes, 'operations': {}}
    kernel = SimpleNamespace(GetFileInformationByHandle=Function(fake_metadata),
                             CreateFileW=Function(fake_create), LocalFree=Function(lambda _p: None))
    advapi = SimpleNamespace(ConvertStringSecurityDescriptorToSecurityDescriptorW=Function(fake_descriptor))
    crypt = SimpleNamespace(CryptProtectData=Function(fake_protect))
    libraries = {'kernel32': kernel, 'advapi32': advapi, 'crypt32': crypt}
    crt = SimpleNamespace(open_osfhandle=lambda fd, _flags: fd)
    with tempfile.TemporaryDirectory(prefix='chutey-ctypes-allocation-') as temporary:
        target = Path(temporary) / 'events.json'
        with patch.object(ctypes, 'WinDLL', new=lambda name, **_kwargs: libraries[name], create=True), \
             patch.object(os, 'O_BINARY', 0, create=True), patch.dict(sys.modules, {'msvcrt': crt}):
            def identity():
                assert windows_fs.WindowsFS.handle_identity(1) == '1:2:3:4'
            report['operations']['WindowsFS.handle_identity'] = measure(identity, args.identity_calls)
            report['operations']['private_write'] = measure(lambda: native.private_write(target, b'fixture'), args.write_calls)
            assert target.read_bytes() == b'fixture'
            with patch.object(os, 'name', 'nt'):
                def protect():
                    assert grant_store.dpapi(b'fixture', 'chrome-extension://fixture') == b'fixture'
                report['operations']['dpapi'] = measure(protect, args.dpapi_calls)
    encoded = json.dumps(report, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding='utf-8')
    print(encoded, end='')


if __name__ == '__main__':
    main()
