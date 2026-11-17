"""Bounded, close-before-rename runtime logs; never opens legacy chute.log."""
from __future__ import annotations
import io
import json
import os
from pathlib import Path
import shutil
import threading
import traceback


class BoundedLog(io.TextIOBase):
    def __init__(self, path: Path, *, max_bytes=2*1024*1024, backups=2):
        if max_bytes < 256 or not 0 <= backups <= 8:
            raise ValueError('Invalid log retention limits')
        self.path=Path(path); self.max_bytes=max_bytes; self.backups=backups
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self.lock=threading.RLock(); self.dropped_writes=0

    @property
    def encoding(self): return 'utf-8'
    def writable(self): return True
    def flush(self): pass  # Each append closes its own file handle.

    def _rotate(self):
        for index in range(self.backups,0,-1):
            destination=Path(str(self.path)+'.'+str(index))
            source=self.path if index==1 else Path(str(self.path)+'.'+str(index-1))
            if source.exists(): os.replace(source,destination)
        if not self.backups: self.path.unlink(missing_ok=True)

    def write(self,value):
        try: return self._write(value)
        except OSError:
            self.dropped_writes+=1
            return len(value)

    def _write(self, value):
        if not isinstance(value,str): raise TypeError('Log text required')
        with self.lock:
            # Concurrent Windows processes take a byte lock, with no blocking
            # wait on stdout. Ordinary threads share the in-process lock.
            with (Path(str(self.path)+'.lock')).open('a+b') as guard:
                locked=False
                try:
                    if os.name=='nt':
                        import msvcrt
                        if guard.tell()==0: guard.write(b'0');guard.flush()
                        guard.seek(0);msvcrt.locking(guard.fileno(),msvcrt.LK_NBLCK,1);locked=True
                    else:
                        import fcntl
                        fcntl.flock(guard.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB);locked=True
                    size=self.path.stat().st_size if self.path.exists() else 0
                    # Do not silently destroy an unrelated or pre-existing huge
                    # file. This logger's own files cannot exceed max_bytes.
                    if size>self.max_bytes: raise OSError('Oversized unmanaged runtime log')
                    prefix=f'[log writes unavailable: {self.dropped_writes}]\n' if self.dropped_writes else ''
                    chunk_chars=min(4096,max(1,self.max_bytes//4))
                    for text in (prefix,value):
                        for start in range(0,len(text),chunk_chars):
                            data=text[start:start+chunk_chars].encode('utf-8',errors='replace')
                            if size+len(data)>self.max_bytes: self._rotate();size=0
                            with self.path.open('ab') as output: output.write(data)
                            size+=len(data)
                    self.dropped_writes=0
                except OSError:
                    self.dropped_writes+=1
                finally:
                    if locked and os.name=='nt':
                        guard.seek(0);msvcrt.locking(guard.fileno(),msvcrt.LK_UNLCK,1)
        return len(value)


def safe_exception(error):
    result={'event':'exception','type':type(error).__name__,
        'frames':[{'file':Path(frame.filename).name,'function':frame.name,'line':frame.lineno}
                  for frame in traceback.extract_tb(error.__traceback__)[-12:]]}
    for key in ('errno','winerror'):
        if isinstance(getattr(error,key,None),int):result[key]=getattr(error,key)
    return result


def resource_snapshot():
    """Numbers only; no environment dump, user paths, tokens or command lines."""
    result={'event':'runtime_resources','pid':os.getpid()}
    try: result['disk_free_bytes']=shutil.disk_usage(Path.home().anchor or '/').free
    except OSError: pass
    if os.name=='nt':
        import ctypes
        class Memory(ctypes.Structure):
            _fields_=[('length',ctypes.c_ulong),('load',ctypes.c_ulong)]+[(name,ctypes.c_ulonglong) for name in
                ('total','available','page_total','page_available','virtual_total','virtual_available','extended')]
        memory=Memory();memory.length=ctypes.sizeof(memory)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
            result.update(memory_total_bytes=memory.total,memory_available_bytes=memory.available,
                          commit_limit_bytes=memory.page_total,commit_available_bytes=memory.page_available)
        # Current-process counters only, never enumerate unrelated processes.
        from ctypes import wintypes as W
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        kernel.GetCurrentProcess.restype=W.HANDLE
        process=kernel.GetCurrentProcess()
        class Counters(ctypes.Structure):
            _fields_=[('cb',W.DWORD),('faults',W.DWORD)]+[(name,ctypes.c_size_t) for name in
                ('peak_rss','rss','peak_pool_paged','pool_paged','peak_pool_nonpaged','pool_nonpaged','pagefile','peak_pagefile','private')]
        counters=Counters();counters.cb=ctypes.sizeof(counters)
        psapi=ctypes.WinDLL('psapi',use_last_error=True)
        psapi.GetProcessMemoryInfo.argtypes=[W.HANDLE,ctypes.c_void_p,W.DWORD]
        if psapi.GetProcessMemoryInfo(process,ctypes.byref(counters),counters.cb):
            result.update(process_rss_bytes=counters.rss,process_peak_rss_bytes=counters.peak_rss,process_private_bytes=counters.private)
        kernel.GetProcessTimes.argtypes=[W.HANDLE]+[ctypes.POINTER(W.FILETIME)]*4
        times=[W.FILETIME() for _ in range(4)]
        if kernel.GetProcessTimes(process,*(ctypes.byref(value) for value in times)):
            result['process_cpu_seconds']=sum((value.dwHighDateTime<<32)+value.dwLowDateTime for value in times[2:])/10_000_000
    else:
        try:
            import resource
            usage=resource.getrusage(resource.RUSAGE_SELF)
            result.update(process_cpu_seconds=usage.ru_utime+usage.ru_stime,process_peak_rss_bytes=usage.ru_maxrss*(1 if __import__('sys').platform=='darwin' else 1024))
            with open('/proc/self/statm') as stream:result['process_rss_bytes']=int(stream.read().split()[1])*os.sysconf('SC_PAGE_SIZE')
        except (OSError,ImportError,ValueError,IndexError):pass
    result['python_threads']=threading.active_count()
    return result
