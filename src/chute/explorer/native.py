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


def choose_folder(*, writable=False):
    """Windows Shell picker on the request thread, without importing/booting Tk."""
    if os.name != 'nt':
        raise ExplorerError('UNSUPPORTED_PLATFORM','The native folder picker requires Windows.')
    from .windows_picker import pick_folder
    return pick_folder(writable=writable)


class NativeExplorer:
    def __init__(self, *, store=None):
        from .grant_store import GrantStore
        self.store = store if store is not None else (GrantStore() if os.name == "nt" else None)
        from collections import deque
        self.events = deque(maxlen=64)
        self.descriptors = {}
        self.token=secrets.token_urlsafe(32)
        self.adapters={}
        self.lock=threading.Lock()
        self.selection_lock=threading.Lock()
        private_write(control_path(),json.dumps({'token':self.token}).encode())

    def action(self, origin, *, select, writable=False):
        from ..native_host import _allowed_extension_ids
        import time
        started=time.perf_counter()
        session=Session(origin)
        if origin.removeprefix('chrome-extension://') not in _allowed_extension_ids():
            raise ExplorerError('UNAUTHORIZED','This Chutey installation is not enrolled.')
        if not self.selection_lock.acquire(blocking=False):
            raise ExplorerError('BUSY','A folder selection is already open.')
        outcome='completed'
        try:
            # Native consent UI must not hold the authorization/state lock.
            # Existing browsing and view persistence remain available while it is open.
            path=(choose_folder(writable=True) if writable else choose_folder()) if select else None
            if select and not path:
                raise ExplorerError('CANCELLED','No folder was selected. Existing access is unchanged.')
            with self.lock:
                old=self.adapters.get(origin)
                if select:
                    from .grant_store import describe
                    grant=RootGrant(Path(path),writable=writable)
                    descriptor=describe(grant,path)
                    try:
                        if self.store: self.store.save(origin,descriptor)
                    except BaseException:
                        grant.close(); raise
                    self.descriptors[origin]=descriptor
                    engine=Explorer([grant])
                    adapter=ExplorerAPI(engine,session)
                    # Replacing consent invalidates previous sessions immediately.
                    self.adapters[origin]=adapter
                    if old:
                        old.session.expires=0
                        with old.engine.lock: old.engine.close()
                elif old:
                    # Reopening Shelf renews same root without broadening scope.
                    grant=next(iter(old.engine.grants.values()))
                    grant.stat(grant.id)  # Revalidate the original guarded root.
                    # Multiple Shelf/popup surfaces share the origin. Reopening one
                    # must not revoke the other surface's still-valid session.
                    if old.session.expires > time.monotonic():
                        adapter=old
                        session=old.session
                    else:
                        adapter=ExplorerAPI(old.engine,session)
                        adapter.resume_handle=getattr(old,'resume_handle',grant.id)
                        self.adapters[origin]=adapter
                elif self.store:
                    from .grant_store import restore
                    descriptor=self.store.load(origin)
                    grant,handle=restore(descriptor)
                    engine=Explorer([grant])
                    adapter=ExplorerAPI(engine,session)
                    adapter.resume_handle=handle
                    self.descriptors[origin]=descriptor
                    self.adapters[origin]=adapter
                else:
                    raise ExplorerError('NEEDS_SELECTION','Select a folder to begin browsing.')
                adapter.native_state=lambda command,args: self.state(origin,command,args)
                return {'ok':True,'token':session.token,'expires_in':max(0,int(session.expires-time.monotonic())),'read_only':not next(iter(adapter.engine.grants.values())).writable,
                        'native_roundtrip_ms':round((time.perf_counter()-started)*1000,2),
                        'protocol':'1.1','persistent':bool(self.store)}
        except Exception as error:
            outcome = error.code if isinstance(error, ExplorerError) else 'UNAVAILABLE'
            raise
        finally:
            self.selection_lock.release()
            # Bounded diagnostics contain action/outcome/timing only. Never roots,
            # handles, tokens, filenames, or content. Trace failure cannot break consent.
            with self.lock:
                self.events.append({'at_unix_ms':round(time.time()*1000),'action':'select_write' if select and writable else 'select' if select else 'resume',
                                    'picker_requested':bool(select), 'outcome':outcome,
                                    'elapsed_ms':round((time.perf_counter()-started)*1000,2)})
                if os.name == 'nt':
                    try:
                        directory = self.store.directory.parent if self.store else control_path().parent
                        private_write(directory / 'explorer-events.json',json.dumps(list(self.events)).encode())
                    except OSError: pass

    def state(self, origin, command, args):
        adapter=self.adapters[origin]
        with self.lock, adapter.engine.lock:
            if command == 'recent_transfers':
                if args: raise ExplorerError('INVALID_ARGUMENT','Unexpected receipt arguments.')
                operations=self.descriptors[origin].get('operations',{})
                return {'operations':[{key:value for key,value in entry.items() if key != 'location'} for entry in operations.values()]}
            if command in {'begin_transfer','finish_transfer','reconcile_transfer'}:
                import re
                operation=args.get('operation_id','')
                if re.fullmatch(r'[a-f0-9]{32}',operation) is None:
                    raise ExplorerError('INVALID_ARGUMENT','Invalid operation identity.')
                descriptor=self.descriptors[origin]
                operations=dict(descriptor.get('operations',{}))
                if command == 'begin_transfer':
                    if operation in operations:
                        raise ExplorerError('RECONCILE_REQUIRED','This operation already exists. Reconcile before retrying.')
                    if len(operations)>=64:
                        raise ExplorerError('JOURNAL_FULL','Reconcile existing transfers before starting more.')
                    grant=adapter.engine.grant_for(args['destination'])
                    if not grant.writable:
                        raise ExplorerError('WRITE_CONSENT_REQUIRED','Approve writes first.')
                    operations[operation]={'state':'UNCERTAIN','operation_id':operation,
                                           'location':list(grant.parts(args['destination']))}
                elif command == 'finish_transfer':
                    entry=operations.get(operation)
                    if entry is None: raise ExplorerError('NOT_FOUND','Operation unavailable.')
                    receipt=args['receipt']
                    operations[operation]={**entry,**{key:receipt[key] for key in ('state','name','size','sha256') if key in receipt}}
                else:
                    entry=operations.get(operation)
                    if entry is None: raise ExplorerError('NOT_FOUND','Operation unavailable.')
                    result={key:value for key,value in entry.items() if key != 'location'}
                    if entry['state']=='COMMITTED':
                        from .transfers import digest
                        grant=next(iter(adapter.engine.grants.values()))
                        handle=grant.handle(tuple(entry['location'])+(entry['name'],))
                        try:
                            with grant.open(handle) as fd, os.fdopen(os.dup(fd),'rb') as stream:
                                if digest(stream)!=entry['sha256']: result['state']='UNCERTAIN'
                        except (OSError,ExplorerError): result['state']='UNCERTAIN'
                    return result
                descriptor={**descriptor,'operations':operations}
                if self.store: self.store.save(origin,descriptor)
                self.descriptors[origin]=descriptor
                return {'recorded':True}
            if command == 'resume_location':
                if args: raise ExplorerError('INVALID_ARGUMENT','Unexpected location arguments.')
                grant=next(iter(adapter.engine.grants.values()))
                handle=getattr(adapter,'resume_handle',grant.id)
                try:
                    with grant.open(handle,directory=True): pass
                except (OSError,ExplorerError): handle=grant.id
                return {'handle':handle,
                        'view':self.descriptors.get(origin,{}).get('view',{})}
            if command == 'revoke_access':
                if args: raise ExplorerError('INVALID_ARGUMENT','Unexpected revoke arguments.')
                if self.store: self.store.revoke(origin)
                adapter.session.expires=0
                adapter.engine.close()
                self.adapters.pop(origin,None)
                self.descriptors.pop(origin,None)
                return {'revoked':True}
            if command != 'remember_location' or set(args) != {'handle','view'}:
                raise ExplorerError('INVALID_ARGUMENT','Invalid location command.')
            view=args['view']
            if (not isinstance(view,dict) or set(view)-{'sort','query','grid','scroll'}
                    or view.get('sort','name') not in {'name','size','date','type'}
                    or not isinstance(view.get('query',''),str) or len(view.get('query',''))>256
                    or type(view.get('grid',False)) is not bool
                    or type(view.get('scroll',0)) is not int or not 0<=view.get('scroll',0)<=10000000):
                raise ExplorerError('INVALID_ARGUMENT','Invalid view settings.')
            grant=adapter.engine.grant_for(args['handle'])
            with grant.open(args['handle'],directory=True): pass
            descriptor={**self.descriptors[origin], 'location':list(grant.parts(args['handle'])), 'view':view}
            if self.store: self.store.save(origin,descriptor)
            self.descriptors[origin]=descriptor
            adapter.resume_handle=args['handle']
            return {'remembered':True}

    def adapter(self, origin): return self.adapters.get(origin)
