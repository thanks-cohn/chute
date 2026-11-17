"""Versioned native clipboard adapter over guarded file identities.

No HTTP/native command accepts a filesystem path. File-list import authority comes
only from an explicit Paste of the actual OS clipboard, never a web page string.
CF_HDROP transfers paths, not file bytes; image copy transfers actual bitmap pixels.
"""
from __future__ import annotations
import contextlib,io,os,queue,secrets,struct,threading,time
from pathlib import Path
from .protocol import ExplorerError
from .security import RootGrant

VERSION=1
CF_DIB=8; CF_HDROP=15; CF_DIBV5=17
MAX_FILES=128;MAX_IMAGE_BYTES=32*1024**2;MAX_IMAGE_PIXELS=8_500_000

def dropfiles(paths):
    return struct.pack('<IiiII',20,0,0,0,1)+('\0'.join(str(p) for p in paths)+'\0\0').encode('utf-16le')

def image_formats(fd):
    """Bounded decoding; DIB for Paint, V5/PNG retain alpha where supported."""
    from PIL import Image,UnidentifiedImageError
    if os.fstat(fd).st_size>MAX_IMAGE_BYTES:raise ExplorerError('CLIPBOARD_IMAGE_LIMIT','Image clipboard copy is limited to 32 MiB encoded images.')
    try:
        with os.fdopen(os.dup(fd),'rb') as stream,Image.open(stream) as source:
            if source.format not in {'PNG','JPEG','WEBP','BMP','GIF'}:raise ExplorerError('UNSUPPORTED_FORMAT','Clipboard pixels support PNG, JPEG, WebP, BMP and first-frame GIF.')
            w,h=source.size
            if w*h>MAX_IMAGE_PIXELS:raise ExplorerError('CLIPBOARD_IMAGE_LIMIT','Image dimensions exceed the bounded clipboard pixel budget.')
            if os.name=='nt':
                import ctypes
                class Memory(ctypes.Structure):
                    _fields_=[('length',ctypes.c_ulong),('load',ctypes.c_ulong)]+[(n,ctypes.c_ulonglong) for n in ('total','available','page_total','page_available','virtual_total','virtual_available','extended')]
                memory=Memory();memory.length=ctypes.sizeof(memory)
                if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)) and memory.available < w*h*32+64*1024**2:
                    raise ExplorerError('RESOURCE_LIMIT','Not enough available memory for a safe image clipboard copy. Try a smaller image.')
            rgba=source.convert('RGBA')
            header=bytearray(124)
            struct.pack_into('<IiiHHIIiiII',header,0,124,w,-h,1,32,3,w*h*4,2835,2835,0,0)
            struct.pack_into('<IIIII',header,40,0x00ff0000,0x0000ff00,0x000000ff,0xff000000,0x73524742)
            struct.pack_into('<I',header,108,4) # LCS_GM_IMAGES
            v5=bytes(header)+rgba.tobytes('raw','BGRA')
            # Classic DIB for apps which do not consume V5 alpha. Composite alpha
            # onto white rather than exposing uninitialized/transparent RGB.
            flat=Image.new('RGB',(w,h),'white');flat.paste(rgba,mask=rgba.getchannel('A'))
            bitmap=io.BytesIO();flat.save(bitmap,'BMP');dib=bitmap.getvalue()[14:]
            png=io.BytesIO();rgba.save(png,'PNG')
            return {CF_DIB:dib,CF_DIBV5:v5,'PNG':png.getvalue()},w,h
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError):
        raise ExplorerError('INVALID_IMAGE','The image could not be decoded safely.') from None


class WindowsClipboard:
    """Single hidden-window owner, message pumping, bounded admission and calls."""
    def __init__(self):
        if os.name!='nt':raise ExplorerError('UNSUPPORTED_PLATFORM','Windows clipboard requires the Windows companion.')
        self.queue=queue.Queue(maxsize=1);self.busy=threading.Lock();self.ready=threading.Event();self.error=None
        self.thread=threading.Thread(target=self._run,name='chutey-clipboard',daemon=True);self.thread.start()
        if not self.ready.wait(3) or self.error:raise ExplorerError('CLIPBOARD_UNAVAILABLE','The native clipboard owner could not start.')

    def _run(self):
        import ctypes
        from ctypes import wintypes as W
        self.ctypes=ctypes;self.W=W;self.user=ctypes.WinDLL('user32',use_last_error=True);self.kernel=ctypes.WinDLL('kernel32',use_last_error=True);self.shell=ctypes.WinDLL('shell32',use_last_error=True)
        u,k=self.user,self.kernel
        u.CreateWindowExW.argtypes=[W.DWORD,W.LPCWSTR,W.LPCWSTR,W.DWORD,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,W.HWND,W.HMENU,W.HINSTANCE,ctypes.c_void_p];u.CreateWindowExW.restype=W.HWND
        u.OpenClipboard.argtypes=[W.HWND];u.OpenClipboard.restype=W.BOOL
        u.CloseClipboard.argtypes=[];u.CloseClipboard.restype=W.BOOL
        u.EmptyClipboard.argtypes=[];u.EmptyClipboard.restype=W.BOOL
        u.SetClipboardData.argtypes=[W.UINT,W.HANDLE];u.SetClipboardData.restype=W.HANDLE
        u.GetClipboardData.argtypes=[W.UINT];u.GetClipboardData.restype=W.HANDLE
        u.IsClipboardFormatAvailable.argtypes=[W.UINT];u.IsClipboardFormatAvailable.restype=W.BOOL
        u.RegisterClipboardFormatW.argtypes=[W.LPCWSTR];u.RegisterClipboardFormatW.restype=W.UINT
        u.GetOpenClipboardWindow.argtypes=[];u.GetOpenClipboardWindow.restype=W.HWND
        u.GetClipboardSequenceNumber.argtypes=[];u.GetClipboardSequenceNumber.restype=W.DWORD
        u.PeekMessageW.argtypes=[ctypes.POINTER(W.MSG),W.HWND,W.UINT,W.UINT,W.UINT];u.PeekMessageW.restype=W.BOOL
        u.TranslateMessage.argtypes=[ctypes.POINTER(W.MSG)];u.DispatchMessageW.argtypes=[ctypes.POINTER(W.MSG)]
        k.GlobalAlloc.argtypes=[W.UINT,ctypes.c_size_t];k.GlobalAlloc.restype=W.HGLOBAL
        k.GlobalLock.argtypes=[W.HGLOBAL];k.GlobalLock.restype=ctypes.c_void_p
        k.GlobalUnlock.argtypes=[W.HGLOBAL];k.GlobalUnlock.restype=W.BOOL
        k.GlobalFree.argtypes=[W.HGLOBAL];k.GlobalFree.restype=W.HGLOBAL
        k.GlobalSize.argtypes=[W.HGLOBAL];k.GlobalSize.restype=ctypes.c_size_t
        self.shell.DragQueryFileW.argtypes=[W.HANDLE,W.UINT,W.LPWSTR,W.UINT];self.shell.DragQueryFileW.restype=W.UINT
        self.hwnd=u.CreateWindowExW(0,'STATIC','Chutey Clipboard Owner',0,0,0,0,0,W.HWND(-3),None,None,None)
        if not self.hwnd:self.error=True
        self.ready.set()
        if self.error:return
        message=W.MSG()
        while True:
            while u.PeekMessageW(ctypes.byref(message),None,0,0,1):u.TranslateMessage(ctypes.byref(message));u.DispatchMessageW(ctypes.byref(message))
            try:task=self.queue.get(timeout=.02)
            except queue.Empty:continue
            try:task['result']=self._write(task['formats']) if task['command']=='write' else self._read_paths()
            except Exception as exc:task['error']=exc
            finally:task['done'].set();self.busy.release()

    @contextlib.contextmanager
    def _opened(self):
        for _ in range(10):
            if self.user.OpenClipboard(self.hwnd):break
            time.sleep(.02)
        else:
            if self.user.GetOpenClipboardWindow():raise ExplorerError('CLIPBOARD_BUSY','Another window is holding the Windows clipboard. Close its clipboard dialog and retry.')
            raise ExplorerError('CLIPBOARD_UNAVAILABLE','This Windows desktop did not allow clipboard access. Use an interactive unlocked test session and retry.')
        try:yield
        finally:self.user.CloseClipboard()

    def _call(self,command,formats=None):
        if not self.busy.acquire(blocking=False):raise ExplorerError('CLIPBOARD_BUSY','A clipboard operation is already active. Wait before retrying.')
        task={'command':command,'formats':formats,'done':threading.Event()};self.queue.put_nowait(task)
        if not task['done'].wait(4):raise ExplorerError('CLIPBOARD_UNCERTAIN','The Windows clipboard owner has not responded. Inspect the clipboard before retrying; no automatic replay.')
        if 'error' in task:
            if isinstance(task['error'],ExplorerError):raise task['error']
            raise ExplorerError('CLIPBOARD_UNAVAILABLE','Windows could not complete the clipboard operation.') from None
        return task['result']

    def write(self,formats):return self._call('write',formats)
    def read_paths(self):return self._call('paths')

    def _write(self,formats):
        c,k,u=self.ctypes,self.kernel,self.user;prepared=[];transferred=set()
        try:
            for format_,data in formats.items():
                ident=u.RegisterClipboardFormatW(format_) if isinstance(format_,str) else format_
                if not ident:raise ExplorerError('CLIPBOARD_UNAVAILABLE','Windows could not register the requested clipboard format.')
                handle=k.GlobalAlloc(0x42,len(data)) # MOVEABLE | ZEROINIT, including allocator padding
                if not handle:raise ExplorerError('RESOURCE_LIMIT','Windows could not allocate clipboard memory.')
                prepared.append((ident,handle,data));pointer=k.GlobalLock(handle)
                if not pointer:raise ExplorerError('RESOURCE_LIMIT','Windows could not lock clipboard memory.')
                try:c.memmove(pointer,data,len(data))
                finally:k.GlobalUnlock(handle)
            with self._opened():
                if not u.EmptyClipboard():raise ExplorerError('CLIPBOARD_BUSY','Windows clipboard could not be opened for writing.')
                for ident,handle,data in prepared:
                    if not u.SetClipboardData(ident,handle):raise ExplorerError('CLIPBOARD_UNCERTAIN','Windows accepted only part of the clipboard formats. Inspect the clipboard before retrying.')
                    transferred.add(handle)
                # Verify bytes while still holding the clipboard lock. No claim
                # is made about a later application's Paste completing.
                for ident,handle,data in prepared:
                    actual=u.GetClipboardData(ident)
                    if not actual or k.GlobalSize(actual)<len(data):raise ExplorerError('CLIPBOARD_VERIFY_FAILED','Clipboard readback did not match the requested data.')
                    pointer=k.GlobalLock(actual)
                    if not pointer:raise ExplorerError('CLIPBOARD_VERIFY_FAILED','Clipboard readback was unavailable.')
                    try:
                        if c.string_at(pointer,len(data))!=data:raise ExplorerError('CLIPBOARD_VERIFY_FAILED','Clipboard bytes did not match.')
                    finally:k.GlobalUnlock(actual)
                return {'sequence':int(u.GetClipboardSequenceNumber()),'verified':True}
        finally:
            for _,handle,_ in prepared:
                if handle not in transferred:k.GlobalFree(handle)

    def _read_paths(self):
        with self._opened():
            if not self.user.IsClipboardFormatAvailable(CF_HDROP):raise ExplorerError('CLIPBOARD_FORMAT_UNAVAILABLE','Windows clipboard has no real file list. Copy files in Explorer first.')
            handle=self.user.GetClipboardData(CF_HDROP)
            if not handle:raise ExplorerError('CLIPBOARD_FORMAT_UNAVAILABLE','The file-list clipboard owner did not provide its data.')
            if self.kernel.GlobalSize(handle)>1024*1024:raise ExplorerError('CLIPBOARD_LIMIT','The Windows file-list metadata exceeds the clipboard budget.')
            count=self.shell.DragQueryFileW(handle,0xffffffff,None,0)
            if not 1<=count<=MAX_FILES:raise ExplorerError('CLIPBOARD_LIMIT','Paste supports at most 128 clipboard files per snapshot.')
            paths=[];total=0
            for i in range(count):
                size=self.shell.DragQueryFileW(handle,i,None,0);total+=size
                if not 1<=size<=32767 or total>65536:raise ExplorerError('CLIPBOARD_LIMIT','The Windows file-list metadata exceeds the clipboard budget.')
                buffer=self.ctypes.create_unicode_buffer(size+1)
                if self.shell.DragQueryFileW(handle,i,buffer,size+1)!=size:raise ExplorerError('CLIPBOARD_CHANGED','Clipboard file-list changed while being read.')
                paths.append(buffer.value)
            return int(self.user.GetClipboardSequenceNumber()),paths

_backend=None;_backend_lock=threading.Lock()
def backend():
    global _backend
    with _backend_lock:
        if _backend is None:_backend=WindowsClipboard()
        return _backend

class Clipboard:
    def __init__(self,engine,*,driver=None,clock=time.monotonic):
        self.engine=engine;self.driver=driver;self.clock=clock;self.snapshots={};self.lock=threading.RLock()
    def _driver(self):return self.driver or backend()
    @staticmethod
    def _gesture(user_gesture):
        if user_gesture is not True:raise ExplorerError('USER_GESTURE_REQUIRED','Use an explicit Copy or Paste action for Windows clipboard access.')
    @contextlib.contextmanager
    def _file(self,handle,identity):
        grant=self.engine.grant_for(handle)
        with grant.open(handle) as fd:
            row=self.engine._record(grant,grant.parts(handle),os.fstat(fd),fd=fd)
            if row['kind']!='file' or row['identity']!=identity:raise ExplorerError('FILE_CHANGED','The clipboard source changed. Refresh and copy it again.')
            if not grant.windows and self.driver is None:raise ExplorerError('UNSUPPORTED_PLATFORM','Windows clipboard requires a guarded Windows source.')
            path=grant.windows.root.joinpath(*grant.parts(handle)) if grant.windows else Path('/proc/self/fd/'+str(fd)).resolve()
            yield row,fd,path
    def copy_files(self,files,*,user_gesture=False):
        self._gesture(user_gesture)
        if not isinstance(files,list) or not 1<=len(files)<=MAX_FILES or any(not isinstance(f,dict) or set(f)!={'handle','identity'} or not all(isinstance(v,str) for v in f.values()) for f in files):raise ExplorerError('INVALID_ARGUMENT','Choose 1 through 128 authorized files.')
        with contextlib.ExitStack() as stack:
            paths=[stack.enter_context(self._file(**f))[2] for f in files]
            if sum(len(str(p)) for p in paths)>65536:raise ExplorerError('CLIPBOARD_LIMIT','The selected file-list metadata exceeds the clipboard budget.')
            receipt=self._driver().write({CF_HDROP:dropfiles(paths),'Preferred DropEffect':struct.pack('<I',1)})
        return {'version':VERSION,'operation':'copy_files','state':'COPIED','kind':'windows_file_list','count':len(paths),**receipt,'message':'File list copied for Windows Explorer Paste; destination copy has not occurred yet.'}
    def copy_image(self,handle,identity,*,user_gesture=False):
        self._gesture(user_gesture)
        with self._file(handle,identity) as (row,fd,_):
            formats,w,h=image_formats(fd);receipt=self._driver().write(formats)
        return {'version':VERSION,'operation':'copy_image','state':'COPIED','kind':'windows_image_pixels','width':w,'height':h,'formats':['CF_DIB','CF_DIBV5','PNG'],**receipt,'message':'Image pixels copied to Windows clipboard; target application Paste is separate.'}
    def _expire(self):
        for ident,snapshot in list(self.snapshots.items()):
            if snapshot['expires']<=self.clock():
                for entry in snapshot['entries']:entry['grant'].close()
                del self.snapshots[ident]
    def read_files(self,*,user_gesture=False):
        self._gesture(user_gesture)
        with self.lock:
            self._expire()
            if len(self.snapshots)>=8:raise ExplorerError('CLIPBOARD_BUSY','Too many clipboard paste snapshots are active. Wait five minutes or release one.')
            sequence,paths=self._driver().read_paths();entries=[]
            try:
                for raw in paths:
                    path=Path(raw)
                    if not path.is_absolute() or path.name in {'','..','.'}:raise ExplorerError('UNSAFE_ROOT','Clipboard file reference is not an absolute local file.')
                    grant=RootGrant(path.parent,label='Windows clipboard import',writable=False)
                    try:
                        handle=grant.handle((path.name,))
                        with grant.open(handle) as fd:
                            row=self.engine._record(grant,(path.name,),os.fstat(fd),fd=fd)
                            if row['kind']!='file':raise ExplorerError('UNSUPPORTED_FORMAT','Clipboard directory paste is not supported; select files.')
                    except BaseException:grant.close();raise
                    entries.append({'grant':grant,'row':row})
                ident=secrets.token_urlsafe(32);self.snapshots[ident]={'entries':entries,'expires':self.clock()+300,'sequence':sequence}
            except BaseException:
                for entry in entries:entry['grant'].close()
                raise
            return {'version':VERSION,'snapshot':ident,'expires_in':300,'sequence':sequence,'files':[{'index':i,**{k:e['row'][k] for k in ('name','size','identity','mime')}} for i,e in enumerate(entries)]}
    @contextlib.contextmanager
    def read(self,snapshot,index):
        with self.lock:
            self._expire();source=self.snapshots.get(snapshot)
            if source is None:raise ExplorerError('CLIPBOARD_EXPIRED','Clipboard paste snapshot expired. Paste again to obtain current files.')
            if type(index) is not int or not 0<=index<len(source['entries']):raise ExplorerError('INVALID_ARGUMENT','Invalid clipboard file index.')
            entry=source['entries'][index];grant=entry['grant'];row=entry['row']
        with grant.open(row['handle']) as fd:
            actual=self.engine._record(grant,grant.parts(row['handle']),os.fstat(fd),fd=fd)
            if actual['identity']!=row['identity']:raise ExplorerError('FILE_CHANGED','A clipboard source changed or was removed. Copy it again in Windows.')
            with os.fdopen(os.dup(fd),'rb') as stream:yield actual,stream
    def release(self,snapshot):
        with self.lock:
            source=self.snapshots.pop(snapshot,None)
            if source:
                for entry in source['entries']:entry['grant'].close()
        return {'released':True}
    def dispatch(self,command,args):
        schemas={
            'clipboard_copy_files':({'files','user_gesture'},self.copy_files),
            'clipboard_copy_image':({'handle','identity','user_gesture'},self.copy_image),
            'clipboard_read_files':({'user_gesture'},self.read_files),
            'clipboard_release':({'snapshot'},self.release)}
        if command not in schemas or not isinstance(args,dict):raise ExplorerError('INVALID_ARGUMENT','Unknown clipboard operation.')
        values=dict(args);version=values.pop('version',VERSION)
        if type(version) is not int or version!=VERSION:raise ExplorerError('UNSUPPORTED_VERSION','Unsupported clipboard API version.')
        keys,function=schemas[command]
        if set(values)!=keys:raise ExplorerError('INVALID_ARGUMENT','Invalid clipboard arguments; browser filesystem paths are not accepted.')
        if command=='clipboard_copy_image' and not all(isinstance(values[k],str) for k in ('handle','identity')):raise ExplorerError('INVALID_ARGUMENT','Choose an authorized image handle and identity.')
        if command=='clipboard_release' and not isinstance(values['snapshot'],str):raise ExplorerError('INVALID_ARGUMENT','A clipboard snapshot ID is required.')
        return function(**values)

    def close(self):
        for ident in list(self.snapshots):self.release(ident)
