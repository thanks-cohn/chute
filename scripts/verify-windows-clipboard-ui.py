"""Disposable real Windows Paint/Explorer clipboard acceptance.

Requires an interactive, unlocked Windows desktop, Paint, Pillow and Explorer.
Creates only temporary test files/windows. Never installs anything or touches the
production Chutey store. Failure to focus/find an owned test window fails clearly.
"""
from __future__ import annotations
import ctypes,hashlib,json,os,subprocess,sys,tempfile,time,threading,uuid
from urllib.request import Request,ProxyHandler,build_opener
from urllib.error import HTTPError
from ctypes import wintypes as W
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
from PIL import Image
from chute.explorer import Explorer,RootGrant,Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer
from chute.store import Store
from chute.explorer.clipboard import Clipboard
from chute.explorer.transfers import receive,digest
from chute.explorer.protocol import ExplorerError


def windows():
    result=[];callback=ctypes.WINFUNCTYPE(W.BOOL,W.HWND,W.LPARAM)
    user.EnumWindows.argtypes=[callback,W.LPARAM]
    def visit(hwnd,_):
        if not user.IsWindowVisible(hwnd):return True
        text=ctypes.create_unicode_buffer(2048);user.GetWindowTextW(hwnd,text,len(text));name=ctypes.create_unicode_buffer(128);user.GetClassNameW(hwnd,name,len(name));pid=W.DWORD();user.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
        result.append({'hwnd':hwnd,'title':text.value,'class':name.value,'pid':pid.value});return True
    user.EnumWindows(callback(visit),0);return result

def wait_for(fn,description,seconds=15):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        value=fn()
        if value:return value
        time.sleep(.1)
    raise RuntimeError(description)

def focus(hwnd):
    user.ShowWindow(hwnd,9);user.SetForegroundWindow(hwnd)
    wait_for(lambda:user.GetForegroundWindow()==hwnd,'Windows refused focus for the owned test window',3)

def keys(hwnd,*codes):
    focus(hwnd)
    for code in codes:user.keybd_event(code,0,0,0)
    for code in reversed(codes):user.keybd_event(code,0,2,0)
    time.sleep(.15)

def type_text(hwnd,value):
    # KEYEVENTF_UNICODE into the verified focused dialog, not the global clipboard.
    focus(hwnd)
    ULONG_PTR=ctypes.c_size_t
    class Keyboard(ctypes.Structure):_fields_=[('vk',W.WORD),('scan',W.WORD),('flags',W.DWORD),('time',W.DWORD),('extra',ULONG_PTR)]
    class Mouse(ctypes.Structure):_fields_=[('dx',W.LONG),('dy',W.LONG),('mouseData',W.DWORD),('flags',W.DWORD),('time',W.DWORD),('extra',ULONG_PTR)]
    class Payload(ctypes.Union):_fields_=[('ki',Keyboard),('mi',Mouse)]
    class Input(ctypes.Structure):_fields_=[('type',W.DWORD),('data',Payload)]
    user.SendInput.argtypes=[W.UINT,ctypes.POINTER(Input),ctypes.c_int];user.SendInput.restype=W.UINT
    units=value.encode('utf-16le')
    for offset in range(0,len(units),2):
        unit=int.from_bytes(units[offset:offset+2],'little')
        for flags in (4,6):
            item=Input(type=1,data=Payload(ki=Keyboard(vk=0,scan=unit,flags=flags,time=0,extra=0)))
            if user.SendInput(1,ctypes.byref(item),ctypes.sizeof(item))!=1:raise RuntimeError('Unicode keyboard input failed')

def open_folder(path,owned):
    before={w['hwnd'] for w in windows()};subprocess.Popen(['explorer.exe',str(path)])
    win=wait_for(lambda:next((w for w in windows() if w['hwnd'] not in before and w['class']=='CabinetWClass' and path.name in w['title']),None),'Could not find the owned Explorer test folder')
    owned.add(win['hwnd']);focus(win['hwnd']);return win['hwnd']

def select_owned_file(hwnd,name):
    """Focus the exact file item, not Explorer's address/navigation pane."""
    env={**os.environ,'CHUTE_TEST_EXPLORER_HWND':str(hwnd),'CHUTE_TEST_EXPLORER_NAME':name,'CHUTE_TEST_EXPLORER_STEM':Path(name).stem}
    script=r'''
    Add-Type -AssemblyName UIAutomationClient
    $view=[System.Windows.Automation.AutomationElement]::FromHandle([intptr][int64]$env:CHUTE_TEST_EXPLORER_HWND)
    $condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::ListItem)
    $deadline=[DateTime]::UtcNow.AddSeconds(10)
    do {
      $item=$view.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition) | Where-Object { -not $_.Current.IsOffscreen -and ($_.Current.Name -eq $env:CHUTE_TEST_EXPLORER_NAME -or $_.Current.Name -eq $env:CHUTE_TEST_EXPLORER_STEM) } | Select-Object -First 1
      if ($item) { $item.SetFocus();$item.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select();exit 0 }
      Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Could not focus the exact file in the owned Explorer test window'
    '''
    result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20,creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:raise RuntimeError('Owned Explorer file selection failed; actual Ctrl+C is not verified')

def sha(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def main():
    if os.name!='nt':raise RuntimeError('WINDOWS_UI_REQUIRED: real Paint/Explorer tests require Windows')
    global user
    user=ctypes.WinDLL('user32',use_last_error=True)
    user.GetForegroundWindow.restype=W.HWND
    user.GetClipboardSequenceNumber.restype=W.DWORD
    user.SetForegroundWindow.argtypes=[W.HWND];user.IsWindowVisible.argtypes=[W.HWND]
    user.GetWindowTextW.argtypes=[W.HWND,W.LPWSTR,ctypes.c_int];user.GetClassNameW.argtypes=[W.HWND,W.LPWSTR,ctypes.c_int]
    user.GetWindowThreadProcessId.argtypes=[W.HWND,ctypes.POINTER(W.DWORD)]
    user.ShowWindow.argtypes=[W.HWND,ctypes.c_int];user.PostMessageW.argtypes=[W.HWND,W.UINT,W.WPARAM,W.LPARAM]
    user.keybd_event.argtypes=[ctypes.c_ubyte,ctypes.c_ubyte,W.DWORD,ctypes.c_size_t]
    out=Path(sys.argv[1]) if len(sys.argv)>1 else Path('dist/clipboard-ui-evidence');out.mkdir(parents=True,exist_ok=True)
    report={'scope':'Real authenticated HTTP API + guarded Windows files + actual Paint/Explorer paste; synthetic enrolled session/test grants, no installed Chrome proof','checks':[]}
    def record(check):
        report['checks'].append(check)
        (out/'results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    owned=set()
    with tempfile.TemporaryDirectory(prefix='ChuteyClipboardUI-') as temp:
        root=Path(temp);approved=root/'approved';approved.mkdir();target=root/'Explorer Paste Verification';target.mkdir();incoming=root/'Windows Copy Source';incoming.mkdir();native_target=root/'Native Paste Verification';native_target.mkdir()
        (incoming/'é Windows copy.txt').write_bytes(b'Windows Explorer originated copy\x00\xff')
        (approved/'é Chutey copy.txt').write_bytes(b'Chutey originated copy\x00\xfe')
        for suffix in ('png','jpg','webp'):Image.new('RGB',(40,30),(40,120,200)).save(approved/('pixels.'+suffix))
        engine=Explorer([RootGrant(approved),RootGrant(native_target,writable=True)])
        origin='chrome-extension://abcdefghijklmnopabcdefghijklmnop';session=Session(origin)
        server=ChuteServer(('127.0.0.1',0),Store(root/'temporary-store'));server.explorer_api=ExplorerAPI(engine,session)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        opener=build_opener(ProxyHandler({}));base=f'http://127.0.0.1:{server.server_port}'
        def command(name,args=None):
            request=Request(base+'/api/explorer/v1/command',json.dumps({'command':name,'args':args or {}}).encode(),{'Origin':origin,'Authorization':'Bearer '+session.token,'Content-Type':'application/json'})
            try:
                with opener.open(request,timeout=30) as response:receipt=json.load(response)
            except HTTPError as error:
                failure=json.load(error).get('error',{})
                raise ExplorerError(failure.get('code','HTTP_ERROR'),failure.get('message','Windows clipboard API request failed.')) from None
            assert receipt['state']=='completed',receipt
            return receipt['result']
        def paste(snapshot,destination):
            result=[]
            for item in snapshot['files']:
                job=command('transfer_start',{'id':uuid.uuid4().hex,'kind':'clipboard_to_local','snapshot':snapshot['snapshot'],'index':item['index'],'destination':destination})
                deadline=time.monotonic()+30
                while job['state'] in {'accepted','running'} and time.monotonic()<deadline:
                    time.sleep(.05);job=command('transfer_status',{'id':job['id']})
                assert job['state']=='COMMITTED',job
                result.append(job['receipt']);command('transfer_dismiss',{'id':job['id']})
            command('clipboard_release',{'snapshot':snapshot['snapshot']})
            return result
        try:
            roots=command('roots')['roots'];rows=command('list',{'handle':roots[0]['handle']})['entries']
            # Chutey -> Windows Explorer: real CF_HDROP and physical paste/hash.
            item=next(r for r in rows if r['name']=='é Chutey copy.txt')
            command('clipboard_copy_files',{'files':[{k:item[k] for k in ('handle','identity')}],'user_gesture':True})
            hwnd=open_folder(target,owned);keys(hwnd,0x11,0x56)
            pasted=target/item['name'];wait_for(lambda:pasted.exists(),'Explorer did not paste the native CF_HDROP file')
            assert sha(pasted)==sha(approved/item['name'])
            record({'operation':'Chutey file Copy -> Windows Explorer Ctrl+V','state':'PASS','sha256':sha(pasted)})
            # The same real OS clipboard also feeds Chutey's authenticated job.
            snapshot=command('clipboard_read_files',{'user_gesture':True})
            receipts=paste(snapshot,roots[1]['handle'])
            assert len(receipts)==1 and receipts[0]['sha256']==sha(approved/item['name'])
            record({'operation':'Same Chutey file Copy -> Chutey Paste job','state':'PASS','sha256':receipts[0]['sha256']})
            # Windows Explorer -> Chutey: actual Ctrl+C, purpose-limited read and
            # same verified receive engine used by native copy jobs.
            hwnd=open_folder(incoming,owned);select_owned_file(hwnd,'é Windows copy.txt')
            prior_sequence=user.GetClipboardSequenceNumber();keys(hwnd,0x11,0x43)
            wait_for(lambda:user.GetClipboardSequenceNumber()!=prior_sequence,'Explorer Ctrl+C did not update the Windows clipboard')
            def read_current():
                try:
                    snapshot=command('clipboard_read_files',{'user_gesture':True})
                    if len(snapshot['files'])==1 and snapshot['files'][0]['name']=='é Windows copy.txt':return snapshot
                    command('clipboard_release',{'snapshot':snapshot['snapshot']});return None
                except ExplorerError as error:
                    if error.code in {'CLIPBOARD_BUSY','CLIPBOARD_FORMAT_UNAVAILABLE'}:return None
                    raise
            snapshot=wait_for(read_current,'No Explorer CF_HDROP clipboard after Ctrl+C')
            assert len(snapshot['files'])==1
            for receipt in paste(snapshot,roots[1]['handle']):
                assert receipt['sha256']==sha(incoming/receipt['name'])
                record({'operation':'Windows Explorer Ctrl+C -> Chutey verified Paste','state':'PASS','sha256':receipt['sha256']})
            # Three common image formats -> actual Paint Ctrl+V -> saved PNG,
            # verified by decoding canvas pixels, not clipboard filename/URL.
            for suffix in ('png','jpg','webp'):
                item=next(r for r in rows if r['name']=='pixels.'+suffix)
                command('clipboard_copy_image',{'handle':item['handle'],'identity':item['identity'],'user_gesture':True})
                before={w['hwnd'] for w in windows()};subprocess.Popen(['mspaint.exe'])
                win=wait_for(lambda:next((w for w in windows() if w['hwnd'] not in before and 'paint' in w['title'].lower()),None),'PAINT_UNAVAILABLE: no new owned Paint window; interactive Paint is required')
                hwnd=win['hwnd'];owned.add(hwnd);keys(hwnd,0x11,0x56);time.sleep(.4);keys(hwnd,0x7b) # F12
                dialog=wait_for(lambda:next((w for w in windows() if w['class']=='#32770' and w['pid']==win['pid']),None),'Paint Save As dialog unavailable')
                output=out/('paint-paste-'+suffix+'.png');keys(dialog['hwnd'],0x12,0x4e);keys(dialog['hwnd'],0x11,0x41);type_text(dialog['hwnd'],str(output.resolve()));keys(dialog['hwnd'],0x0d)
                wait_for(lambda:output.exists(),'Paint did not save pasted pixels')
                with Image.open(output) as decoded:
                    pixel=decoded.convert('RGB').getpixel((10,10))
                    assert all(abs(a-b)<=3 for a,b in zip(pixel,(40,120,200))),(suffix,pixel)
                record({'operation':suffix+' pixel Copy -> Paint Ctrl+V -> saved PNG','state':'PASS','pixel':pixel,'evidence':output.name})
                user.PostMessageW(hwnd,0x10,0,0);owned.discard(hwnd)
            report['state']='PASS'
        finally:
            for hwnd in owned:user.PostMessageW(hwnd,0x10,0,0)
            time.sleep(.4)
            if server.explorer_api.jobs:
                for job in list(server.explorer_api.jobs.jobs.values()):
                    thread=job.get('thread')
                    if thread and thread.is_alive():server.explorer_api.jobs.cancel(job['id']);thread.join(30)
            server.shutdown();server.server_close();worker.join()
            if server.explorer_api.clipboard:server.explorer_api.clipboard.close()
            engine.close()
    (out/'results.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))

if __name__=='__main__':
    try:main()
    except Exception as exc:
        failure={'state':'FAILED','reason':str(exc),'acceptance':'Real app paste is NOT verified by this run.'}
        output=Path(sys.argv[1]) if len(sys.argv)>1 else Path('dist/clipboard-ui-evidence')
        output.mkdir(parents=True,exist_ok=True);(output/'failure.json').write_text(json.dumps(failure,indent=2),encoding='utf-8')
        print(json.dumps(failure),file=sys.stderr)
        raise
