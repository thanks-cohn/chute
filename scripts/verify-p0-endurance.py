"""Disposable Windows/Chrome P0 playback + navigation + mixed-lane benchmark.

--seconds 1800 is a genuine wall-clock run at playbackRate=1. Short runs are
explicitly reported as smoke tests. HTTP transport simulates native enrollment;
extension transport uses an actual unpacked extension with a test native RPC shim.
No installed worker/profile/user data is accessed by either fixture transport.
"""
from __future__ import annotations
import argparse,concurrent.futures,hashlib,importlib.util,json,math,mimetypes,os,shutil,socket,statistics,subprocess,sys,tempfile,threading,time
from types import SimpleNamespace
from collections import Counter,deque
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
from chute.server import ChuteHandler,ChuteServer
from chute.store import Store
from chute.explorer.native import NativeExplorer
from chute.runtime_log import resource_snapshot
from PIL import Image
from playwright.sync_api import sync_playwright,expect
spec=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/verify-phase1-browser.py');fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
FIXTURE_ORIGIN='chrome-extension://abcdefghijklmnopabcdefghijklmnop'
UI_ORIGIN='http://localhost:17891'

def percentile(values,p):
    if not values:return None
    return round(sorted(values)[min(len(values)-1,math.ceil(len(values)*p)-1)],3)

def summary(values):return {'count':len(values),'p50_ms':percentile(values,.5),'p95_ms':percentile(values,.95),'p99_ms':percentile(values,.99),'worst_ms':round(max(values),3) if values else None}

def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

class EvidenceHandler(ChuteHandler):
    def log_message(self,*args):pass
    def _explorer_route(self):
        self._original_origin=self.headers.get('Origin')
        # Only the HTTP fixture's real cross-origin Origin is mapped. Missing
        # Origins stay missing and production authorization must reject them.
        if self.server.http_fixture and self._original_origin==UI_ORIGIN:
            self.headers.replace_header('Origin',self.server.test_origin)
        return super()._explorer_route()
    def send_response(self,code,*args):
        self._response_status=int(code);return super().send_response(code,*args)
    def send_header(self,name,value):
        if self.server.http_fixture and name.lower()=='access-control-allow-origin' and value==self.server.test_origin:
            value=UI_ORIGIN
        return super().send_header(name,value)
    def end_headers(self):
        if self.path.startswith('/api/explorer/v1/media/'):
            original=getattr(self,'_original_origin',self.headers.get('Origin'))
            category='missing' if original is None else 'fixture' if original==UI_ORIGIN else 'enrolled' if original==self.server.test_origin else 'other'
            with self.server.evidence_lock:
                self.server.media_requests.append({'seconds':round(time.monotonic()-self.server.evidence_started,3),'method':self.command,'status':getattr(self,'_response_status',0),'range':bool(self.headers.get('Range')),'origin_present':original is not None,'origin_category':category})
        return super().end_headers()
    def do_POST(self):
        if self.path=='/__p0/native':
            if self.headers.get('Origin') not in {self.server.test_origin,UI_ORIGIN}:
                self.send_error(403);return
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=4096:self.send_error(400);return
            action=json.loads(self.rfile.read(size)).get('action')
            if action=='get_native_capabilities':value={'ok':True,'safe_recovery':1,'explorer_protocol':'1.1'}
            elif action=='explorer_resume':value=self.server.native_explorer.action(self.server.test_origin,select=False)
            else:value={'ok':False,'code':'TEST_PICKER_FORBIDDEN','error':'No unrequested picker in an endurance run'}
            body=json.dumps(value).encode();self.send_response(200);self.send_header('Access-Control-Allow-Origin',UI_ORIGIN if self.server.http_fixture else self.server.test_origin);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
        super().do_POST()
    def do_OPTIONS(self):
        if self.path=='/__p0/native':
            self.send_response(204);self.send_header('Access-Control-Allow-Origin',UI_ORIGIN if self.server.http_fixture else self.server.test_origin);self.send_header('Access-Control-Allow-Methods','POST');self.send_header('Access-Control-Allow-Headers','Content-Type');self.end_headers();return
        super().do_OPTIONS()
    def do_GET(self):
        name=self.path.split('?',1)[0].lstrip('/');asset=ROOT/'extension'/name
        if self.server.http_fixture and name and '..' not in name and asset.is_file() and asset.resolve().is_relative_to(ROOT/'extension'):
            data=asset.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(name)[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
        super().do_GET()

NATIVE_SHIM="""chrome.runtime.sendNativeMessage=async(_host,message)=>{
 const r=await fetch('http://127.0.0.1:17891/__p0/native',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:message.action})});
 if(!r.ok)throw Error('Test native RPC failed '+r.status);return r.json();};"""

BURST_JS="""async ({width,root,thumbnail})=>{
 const batch=await Promise.all(Array.from({length:width},async(_,i)=>{
  const start=performance.now();try{
   const command=i%4===0?'roots':i%4===1?'list':i%4===2?'search':'performance_get';
   const args=command==='list'||command==='search'?{handle:root,offset:0,limit:100,sort:'name',query:command==='search'?'image':''}:{};
   await ChuteyExplorerAPI.command(command,args);
   return {command,ok:true,ms:performance.now()-start};
  }catch(e){return {ok:false,code:e.code||'ERROR',ms:performance.now()-start};}
 }));return batch;
}"""

MEDIA_STATE="""n=>({connected:n.isConnected,time:n.currentTime,duration:n.duration,paused:n.paused,ended:n.ended,ready:n.readyState,rate:n.playbackRate,error:n.error?{code:n.error.code}:null})"""
INSTALL_OBSERVERS="""n=>{
 window.__p0PinnedNode=n;window.__p0Events={counts:{},errors:[],lastProgress:performance.now()};
 for(const event of ['error','waiting','stalled','playing','pause','seeking','seeked','ended','abort','emptied'])n.addEventListener(event,()=>{
  const e=window.__p0Events;e.counts[event]=(e.counts[event]||0)+1;
  if(event==='error')e.errors.push({seconds:performance.now()/1000,code:n.error?.code||0});
 });
 n.addEventListener('timeupdate',()=>{window.__p0Events.lastProgress=performance.now();});
 window.__p0LongTasks=[];try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(window.__p0LongTasks.length<4096)window.__p0LongTasks.push(e.duration);}).observe({entryTypes:['longtask']});}catch{}
}"""

def generate(folder,seconds):
    ffmpeg=shutil.which('ffmpeg');assert ffmpeg,'FFmpeg required only for synthetic fixture creation'
    records=[];duration=max(40,seconds+90);clip_seconds=4
    for ext in ('mp4','webm'):
        clip=folder/('segment.'+ext);target=folder/('movie.'+ext)
        cmd=[ffmpeg,'-v','error','-f','lavfi','-i',f'testsrc2=size=640x360:rate=12:duration={clip_seconds}','-vf','noise=alls=30:allf=t+u']
        cmd+=['-c:v','libx264','-preset','ultrafast','-b:v','1800k','-pix_fmt','yuv420p'] if ext=='mp4' else ['-c:v','libvpx','-deadline','realtime','-cpu-used','8','-b:v','1800k']
        subprocess.run([*cmd,str(clip)],check=True)
        listing=folder/('concat-'+ext+'.txt');listing.write_text(('file '+repr(clip.name)+'\n')*math.ceil(duration/clip_seconds),encoding='utf-8')
        mux=[ffmpeg,'-v','error','-f','concat','-safe','0','-i',str(listing),'-c','copy']
        if ext=='mp4':mux+=['-movflags','+faststart']
        subprocess.run([*mux,str(target)],check=True);clip.unlink();listing.unlink()
        records.append({'format':ext,'bytes':target.stat().st_size,'sha256':digest(target),'duration_at_least_seconds':duration})
    for branch in range(8):
        directory=folder/f'branch-{branch:02}';directory.mkdir()
        for i in range(24):Image.new('RGB',(320,180),((branch*31)%255,(i*9)%255,90)).save(directory/f'image-{i:03}.png')
        (directory/'document.txt').write_text('literal document lines\n'*1000,encoding='utf-8')
    for suffix in ('png','jpg','webp'):Image.new('RGB',(40,30),(40,120,200)).save(folder/('clipboard-pixels.'+suffix))
    (folder/'destination').mkdir()
    with (folder/'copy-source.bin').open('wb') as stream:
        for i in range(64):stream.write(bytes([i])*1024*1024)
    return records

def command(page,name,args=None):return page.evaluate('([command,args])=>ChuteyExplorerAPI.command(command,args)',[name,args or {}])

def preview(page,name):
    row=page.locator('.ex-row').filter(has=page.locator('.ex-name',has_text=name));row.click(button='right');page.get_by_role('menuitem',name='Preview',exact=True).click()

class InstalledWorker:
    """Explicit CI-only self-install in a new user-data namespace, never owner host."""
    def __init__(self,root,installer):self.root=root;self.installer=Path(installer).resolve();self.environment=None;self.started=False
    def prepare(self):
        if os.name!='nt' or os.environ.get('GITHUB_ACTIONS')!='true':raise RuntimeError('Installed transport is allowed only in an ephemeral Windows GitHub Actions runner')
        import winreg
        self.keys=[r'Software\Google\Chrome\NativeMessagingHosts\com.thankscohn.chute',r'Software\Microsoft\Windows\CurrentVersion\Uninstall\Chute']
        for key in self.keys:
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER,key):raise RuntimeError('Existing Chutey registration: refusing isolated test installation')
            except FileNotFoundError:pass
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,r'Software\Microsoft\Windows\CurrentVersion\Run') as key:
                winreg.QueryValueEx(key,'Chute');raise RuntimeError('Existing Chutey startup entry: refusing test installation')
        except FileNotFoundError:pass
        try:
            with socket.create_connection(('127.0.0.1',17891),timeout=.3):raise RuntimeError('Existing listener on17891: refusing to touch it')
        except (ConnectionRefusedError,TimeoutError,OSError) as e:
            if isinstance(e,RuntimeError):raise
        # Chrome uses Windows Known Folders as well as environment variables;
        # spoofing LOCALAPPDATA/USERPROFILE makes Chrome reject remote debugging.
        # Install only into a verified-empty ephemeral CI account instead.
        local=Path(os.environ['LOCALAPPDATA'])
        self.owned_directories=[local/'Programs'/'Chute',local/'Chute',Path.home()/'Chute']
        if any(path.exists() for path in self.owned_directories):raise RuntimeError('Existing Chutey files: refusing CI installation')
        env={'CHUTE_HOME':str(self.root/'store')};Path(env['CHUTE_HOME']).mkdir(parents=True,exist_ok=True)
        self.environment=patch.dict(os.environ,env);self.environment.start();self.target=self.owned_directories[0]/'Chute.exe'
    def start(self,origin,approved):
        from chute.explorer.security import RootGrant
        from chute.explorer.grant_store import GrantStore,describe
        # This is explicit fixture provisioning, not proof of Shell picker UX.
        grant=RootGrant(approved,writable=True)
        try:
            descriptor=describe(grant,approved);descriptor.update(media_allowed=True,media_policy_version=1,media_policy_migrated=False)
            GrantStore().save(origin,descriptor)
        finally:grant.close()
        result=subprocess.run([str(self.installer)],timeout=40,check=True);self.started=True
        from urllib.request import build_opener,ProxyHandler
        opener=build_opener(ProxyHandler({}));deadline=time.monotonic()+40
        while True:
            try:
                with opener.open('http://127.0.0.1:17891/health',timeout=1) as response:
                    if json.load(response).get('service')=='chute':break
            except OSError:
                if time.monotonic()>deadline:raise RuntimeError('Owned packaged worker did not start')
                time.sleep(.3)
        subprocess.run([str(self.target),'--allow-extension',origin.split('//')[1]],timeout=20,check=True)
        assert digest(self.target)==digest(self.installer),'Installed worker bytes differ from this candidate'
        helper=self.target.with_name('Chute-NativeHost.exe');bundled=self.installer.with_name('Chute-NativeHost.exe')
        assert digest(helper)==digest(bundled),'Installed helper bytes differ from this candidate'
        return {'installer_sha256':digest(self.installer),'installed_worker_sha256':digest(self.target),'native_helper_sha256':digest(helper),'consent':'DPAPI provisioned synthetic approved root; Shell picker not tested','native_messaging':'genuine Chrome/native-host/worker'}
    def close(self):
        if self.environment is None:return
        import ctypes,winreg
        from ctypes import wintypes as W
        from chute.windows_processes import matching_pids
        if self.started:
            pids=matching_pids(self.target)
            if pids is None:raise RuntimeError('Cannot identify owned test worker for cleanup; no process was killed')
            kernel=ctypes.WinDLL('kernel32',use_last_error=True)
            kernel.OpenProcess.argtypes=[W.DWORD,W.BOOL,W.DWORD];kernel.OpenProcess.restype=W.HANDLE
            kernel.QueryFullProcessImageNameW.argtypes=[W.HANDLE,W.DWORD,W.LPWSTR,ctypes.POINTER(W.DWORD)];kernel.QueryFullProcessImageNameW.restype=W.BOOL
            kernel.TerminateProcess.argtypes=[W.HANDLE,W.UINT];kernel.CloseHandle.argtypes=[W.HANDLE]
            for pid in pids:
                handle=kernel.OpenProcess(0x1001,False,pid)
                if not handle:continue
                try:
                    image=ctypes.create_unicode_buffer(32768);length=W.DWORD(len(image))
                    if kernel.QueryFullProcessImageNameW(handle,0,image,ctypes.byref(length)) and os.path.normcase(os.path.realpath(image.value))==os.path.normcase(os.path.realpath(self.target)):
                        kernel.TerminateProcess(handle,0)
                finally:kernel.CloseHandle(handle)
            time.sleep(.4)
        for path in self.keys:
            try:winreg.DeleteKey(winreg.HKEY_CURRENT_USER,path)
            except FileNotFoundError:pass
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,r'Software\Microsoft\Windows\CurrentVersion\Run',0,winreg.KEY_SET_VALUE) as key:winreg.DeleteValue(key,'Chute')
        except FileNotFoundError:pass
        self.environment.stop()
        for directory in self.owned_directories:
            if directory.exists():shutil.rmtree(directory)

def run(args):
    out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
    report={'result':'RUNNING','transport':args.transport,'scope':'Actual Windows/Chrome and filesystem guards; native messaging shim with real session renewal, not installed native-host/owner acceptance','requested_wall_seconds':args.seconds,'samples':[],'bursts':[],'errors':[]}
    report_path=out/'endurance-results.json'
    def save():report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
    save()
    with tempfile.TemporaryDirectory(prefix='chutey-p0-endurance-') as temp:
        root=Path(temp);assert shutil.disk_usage(root).free>3*1024**3,'The disposable full-media fixture needs 3 GiB free; use an isolated test disk.'
        approved=root/'approved';approved.mkdir();report['assets']=generate(approved,args.seconds)
        installed=InstalledWorker(root,args.installer) if args.transport=='installed' else None
        if installed:installed.prepare()
        store=Store(root/'store')
        server=SimpleNamespace() if installed else ChuteServer(('127.0.0.1',17891),store)
        if not installed:server.RequestHandlerClass=EvidenceHandler
        server.http_fixture=args.transport=='http';server.test_origin=FIXTURE_ORIGIN;server.evidence_lock=threading.Lock();server.media_requests=deque(maxlen=20000);server.evidence_started=time.monotonic()
        worker=None
        if not installed:worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        controller=None;browser=None;context=None
        try:
            with sync_playwright() as p:
                chrome=os.environ.get('CHUTE_TEST_BROWSER') or shutil.which('chromium') or shutil.which('chrome') or r'C:\Program Files\Google\Chrome\Application\chrome.exe'
                flags=['--no-sandbox','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']
                if args.transport in {'extension','installed'}:
                    # Current Chrome supports explicit CDP unpacked registration.
                    # The obsolete --load-extension/--disable-extensions-except
                    # combination blocked this registration in the paired CI.
                    context=p.chromium.launch_persistent_context(str(root/'profile'),executable_path=chrome,headless=True,ignore_default_args=['--disable-extensions'],args=[*flags,'--enable-unsafe-extension-debugging'])
                    registered=context.browser.new_browser_cdp_session().send('Extensions.loadUnpacked',{'path':str(ROOT/'extension')})
                    server.test_origin='chrome-extension://'+registered['id']
                    entry=server.test_origin
                    if not installed:context.add_init_script(NATIVE_SHIM)
                else:
                    browser=p.chromium.launch(executable_path=chrome,headless=True,args=flags);context=browser.new_context(viewport={'width':900,'height':800})
                    context.add_init_script(fixture.INIT+'\n'+NATIVE_SHIM);entry=UI_ORIGIN
                if installed:
                    report['installed_pair']=installed.start(server.test_origin,approved)
                    report['scope']='Actual packaged Windows worker + actual unpacked Chrome extension + real native messaging; only test-owned DPAPI folder consent is provisioned'
                else:
                    native_patches=[patch('chute.explorer.native.private_write'),patch('chute.native_host._allowed_extension_ids',side_effect=lambda:[server.test_origin.split('//')[1]]),patch('chute.explorer.native.choose_folder',return_value=str(approved))]
                    for native_patch in native_patches:native_patch.start()
                    controller=NativeExplorer(store=False,saved_store=store);controller.action(server.test_origin,select=True,writable=True);server.native_explorer=controller
                page=context.new_page();popup=context.new_page();page_errors=[]
                browser_metrics=context.browser.new_browser_cdp_session()
                heap_metrics=context.new_cdp_session(page)
                def chrome_resources():
                    processes=browser_metrics.send('SystemInfo.getProcessInfo')['processInfo']
                    heap=heap_metrics.send('Runtime.getHeapUsage')
                    return {'cpu_seconds_by_type':dict((kind,round(sum(v['cpuTime'] for v in processes if v['type']==kind),3)) for kind in {v['type'] for v in processes}),
                            'process_count':len(processes),'shelf_js_heap_used_bytes':heap['usedSize'],'shelf_js_heap_total_bytes':heap['totalSize']}
                if installed:
                    def response_evidence(response):
                        if '/api/explorer/v1/media/' not in response.url:return
                        headers=response.request.headers;origin=headers.get('origin')
                        server.media_requests.append({'seconds':round(time.monotonic()-server.evidence_started,3),'method':response.request.method,'status':response.status,'range':bool(headers.get('range')),'origin_present':origin is not None,'origin_category':'missing' if origin is None else 'enrolled' if origin==server.test_origin else 'other'})
                    context.on('response',response_evidence)
                for surface in (page,popup):surface.on('pageerror',lambda e:page_errors.append(type(e).__name__))
                page.goto(entry+'/shelf.html');page.get_by_role('tab',name='File Explorer',exact=True).click();expect(page.locator('.ex-row')).not_to_have_count(0)
                if installed:
                    diagnostic=page.evaluate('()=>chrome.runtime.sendMessage({type:"chute-diagnostics"})')
                    assert diagnostic and 'recovery' in diagnostic,'Actual MV3 background did not respond'
                    report['background']='Actual installed extension worker responded to diagnostics'
                command(page,'media_policy_set',{'allowed':True});root_handle=command(page,'roots')['roots'][0]['handle'];listing=command(page,'list',{'handle':root_handle,'limit':100})['entries']
                source=next(row for row in listing if row['name']=='copy-source.bin');destination=next(row for row in listing if row['name']=='destination')
                # Command floods are bounded. 429s are counted, never called pass as responsiveness.
                for mode in ('efficiency','balanced','turbo'):
                    ack=command(page,'performance_set',{'mode':mode});assert ack['mode']==mode;report['bursts'].append({'mode':mode,'ack':ack,'widths':[]});mode_record=report['bursts'][-1]
                    for width in (1,4,10,32):
                        values=page.evaluate(BURST_JS,{'width':width,'root':root_handle,'thumbnail':None});mode_record['widths'].append({'width':width,'latency':summary([v['ms'] for v in values]),'errors':dict(Counter(v.get('code') for v in values if not v['ok']))})
                assert len({json.dumps(v['ack'].get('effective_limits'),sort_keys=True) for v in report['bursts']})>1,'Performance modes must apply distinct budgets'
                command(page,'performance_set',{'mode':'balanced'})
                if installed:
                    # Actual Chrome GUI -> packaged native clipboard -> same
                    # guarded job engine. No direct clipboard API shortcut here.
                    source_row=page.locator('.ex-row').filter(has=page.locator('.ex-name',has_text='copy-source.bin'))
                    source_row.click(button='right');expect(page.get_by_role('menuitem',name='Copy',exact=True)).to_have_count(1)
                    page.get_by_role('menuitem',name='Copy inside Chutey',exact=True).click()
                    source_row.click();page.keyboard.press('Control+c')
                    expect(page.locator('.ex-status')).to_contain_text('to Windows clipboard')
                    page.locator('.ex-row').filter(has=page.locator('.ex-name',has_text='destination')).dblclick()
                    clipboard_checks=[]
                    for index in range(3):
                        if index<2:page.locator('[data-copy=paste]').click()
                        else:
                            page.locator('.ex-list').click(button='right',position={'x':3,'y':3})
                            page.get_by_role('menuitem',name='Paste inside Chutey',exact=True).click()
                        filename='copy-source.bin' if index==0 else f'copy-source ({index}).bin'
                        expect(page.locator('.ex-name').filter(has_text=filename)).to_be_visible(timeout=30000)
                        assert digest(approved/'destination'/filename)==digest(approved/'copy-source.bin')
                        pending=page.evaluate('async()=> (await chrome.storage.local.get({chuteyPendingTransfer:null})).chuteyPendingTransfer')
                        assert pending is None,'A verified GUI copy left its pending marker'
                        clipboard_checks.append({'operation':'Windows clipboard Paste' if index<2 else 'Copy/Paste inside Chutey','state':'PASS','bytes':67108864,'sha256':digest(approved/'destination'/filename)})
                    page.get_by_role('button',name='Parent folder',exact=True).click()
                    expect(page.locator('.ex-breadcrumb')).not_to_contain_text('destination')
                    from PIL import ImageGrab
                    for suffix in ('png','jpg','webp'):
                        row=page.locator('.ex-row').filter(has=page.locator('.ex-name',has_text='clipboard-pixels.'+suffix))
                        row.click(button='right');page.get_by_role('menuitem',name='Copy image pixels to Windows clipboard',exact=True).click()
                        expect(page.locator('.ex-status')).to_contain_text('Copied image pixels')
                        image=ImageGrab.grabclipboard();assert isinstance(image,Image.Image),'GUI clipboard contained a file list instead of image pixels'
                        pixel=image.convert('RGB').getpixel((10,10));assert all(abs(a-b)<=3 for a,b in zip(pixel,(40,120,200)))
                        clipboard_checks.append({'operation':'Chrome '+suffix+' pixel Copy -> independent Windows clipboard image read','state':'PASS','pixel':pixel})
                    report['installed_gui_clipboard']=clipboard_checks;save()
                preview(page,'movie.mp4');main=page.locator('.ex-pinned-body video')
                try:
                    expect(main).to_be_visible();page.wait_for_function('()=>document.querySelector(".ex-pinned-body video")?.readyState>=1')
                except Exception:
                    report['startup_playback_status']=page.locator('.ex-pinned-player').inner_text()[:300]
                    report['media_diagnostics']=command(page,'media_diagnostics')
                    page.screenshot(path=str(out/'playback-start-failed.png'));save();raise
                popup.goto(entry+'/popup.html');popup.locator('#popup-local-toggle').click();popup.get_by_role('button',name='▶ movie.webm',exact=True).click();second=popup.locator('.chutey-lightbox-player video');expect(second).to_be_visible();popup.wait_for_function('()=>document.querySelector(".chutey-lightbox-player video")?.readyState>=1')
                for media in (main,second):media.evaluate(INSTALL_OBSERVERS);media.evaluate('n=>{n.muted=true;return n.play()}')
                started=time.monotonic();last_times=[0,0];stalled_since=[None,None];iteration=0;latencies=[];copy_jobs=[];mode_history=[];last_copy=-999;branch_open=False
                while time.monotonic()-started<args.seconds:
                    elapsed=time.monotonic()-started
                    state=[]
                    for i,media in enumerate((main,second)):
                        value=media.evaluate(MEDIA_STATE);assert value['connected'] and value['rate']==1 and not value['error'] and not value['ended'],value
                        assert media.evaluate('n=>n===window.__p0PinnedNode'),'Player was recreated during navigation'
                        if value['paused']:raise AssertionError('Playback paused without an intentional test action')
                        if value['time']<=last_times[i]+.05:
                            stalled_since[i]=stalled_since[i] or time.monotonic()
                            assert time.monotonic()-stalled_since[i]<8,'Playback stalled beyond 8 seconds'
                        else:stalled_since[i]=None
                        last_times[i]=value['time'];state.append(value)
                    t=time.monotonic()
                    if not branch_open:
                        page.locator('.ex-filter input').fill('');page.locator('.ex-row').filter(has=page.locator('.ex-name',has_text=f'branch-{iteration%8:02}')).dblclick();expect(page.locator('.ex-breadcrumb')).to_contain_text('branch-');branch_open=True
                    else:
                        page.locator('.ex-filter input').fill('image');page.wait_for_timeout(220)
                        page.locator('.ex-list').evaluate('n=>n.scrollTop=n.scrollHeight')
                        if iteration%3==0:
                            preview(page,'image-001.png');expect(page.locator('.ex-preview-body img')).to_be_visible();page.locator('.ex-preview-body img').click();page.keyboard.press('ArrowRight');page.keyboard.press('ArrowLeft')
                        page.locator('.ex-filter input').fill('');page.get_by_role('button',name='Parent folder',exact=True).click();expect(page.locator('.ex-breadcrumb')).not_to_contain_text('branch-');branch_open=False
                        if iteration%9==0:
                            page.get_by_role('button',name='Back',exact=True).click();expect(page.locator('.ex-breadcrumb')).to_contain_text('branch-')
                            page.get_by_role('button',name='Forward',exact=True).click();expect(page.locator('.ex-breadcrumb')).not_to_contain_text('branch-')
                    latencies.append((time.monotonic()-t)*1000)
                    if iteration%6==0:
                        page.locator('.ex-more-settings summary').click();panel=page.locator('.ex-advanced-actions');expect(panel).to_be_visible()
                        toggle=panel.get_by_label('Show image thumbnails',exact=True);toggle.scroll_into_view_if_needed()
                        assert toggle.evaluate('n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n}'),'Folder Access is obscured'
                        page.keyboard.press('Escape');expect(panel).not_to_be_visible()
                    if iteration%10==0:
                        page.set_viewport_size({'width':390 if iteration%20==0 else 900,'height':800})
                        active=('efficiency','balanced','turbo')[(iteration//10)%3];ack=command(page,'performance_set',{'mode':active});mode_history.append({'elapsed':round(elapsed,3),'mode':active,'effective':ack})
                    if elapsed-last_copy>max(10,min(120,args.seconds/4)):
                        jid=os.urandom(16).hex();job=command(page,'transfer_start',{'id':jid,'kind':'local_copy','handle':source['handle'],'identity':source['identity'],'destination':destination['handle']});copy_jobs.append({'id':jid,'state':job['state']});last_copy=elapsed
                    for job in copy_jobs:
                        if job['state'] in ('accepted','running'):
                            status=command(page,'transfer_status',{'id':job['id']});job.update(status)
                            if job['state']=='COMMITTED':
                                assert job['receipt']['sha256']==digest(approved/'copy-source.bin');command(page,'transfer_dismiss',{'id':job['id']});job.pop('id',None)
                            elif job['state'] not in ('accepted','running'):raise AssertionError('Copy did not commit: '+str(job.get('error')))
                    if iteration and iteration%40==0:
                        for media in (main,second):media.evaluate('n=>{const t=n.currentTime;n.pause();n.currentTime=Math.min(n.duration-10,t+1);return n.play()}')
                    if iteration%15==0:
                        sample={'elapsed_seconds':round(elapsed,3),'media':state,'harness_resources':resource_snapshot(),'chrome_resources':chrome_resources(),'mode':command(page,'performance_get')};report['samples'].append(sample);report['navigation']=summary(latencies);report['mode_history']=mode_history;save()
                        print(json.dumps({'event':'endurance_progress','elapsed_seconds':round(elapsed),'iteration':iteration,'media_times':[round(s['time'],1) for s in state]}),flush=True)
                    iteration+=1;page.wait_for_timeout(1500)
                report['wall_seconds']=round(time.monotonic()-started,3);report['navigation']=summary(latencies);report['mode_history']=mode_history
                for name,media,surface in [('mp4',main,page),('webm',second,popup)]:
                    assert not media.evaluate('n=>n.error');media.evaluate('n=>{n.currentTime=n.duration-1;return n.play()}');surface.wait_for_function('()=>window.__p0PinnedNode?.ended',timeout=20000)
                    report[name]={'final':media.evaluate(MEDIA_STATE),'events':surface.evaluate('window.__p0Events'),'long_tasks':summary(surface.evaluate('window.__p0LongTasks'))}
                    report[name]['worker_authorization']=surface.evaluate('async()=>ChuteyExplorerAPI.command("media_status",{ticket:new URL(window.__p0PinnedNode.src).pathname.split("/").pop()})')
                    surface.screenshot(path=str(out/(name+'-end.png')))
                report['network_origin_note']='Playwright request headers may precede DNR; worker_authorization records the server-observed Origin.';report['http_media_requests']=list(server.media_requests);report['http_statuses']=dict(Counter(str(r['status']) for r in server.media_requests));report['copy_jobs']=[{k:v for k,v in j.items() if k not in {'id','receipt'}} for j in copy_jobs]
                assert not page_errors,page_errors;assert not any(r['status']>=400 for r in server.media_requests),report['http_statuses'];assert report['wall_seconds']>=args.seconds
                report['result']='PASS';report['endurance_gate']='30-minute elapsed gate passed' if args.seconds>=1800 else 'SMOKE ONLY: not a 30-minute acceptance';report['browser']=context.browser.version if context.browser else browser.version;report['platform']=sys.platform;save();print(json.dumps({k:v for k,v in report.items() if k not in {'samples','http_media_requests'}},indent=2))
        except Exception as error:
            report['result']='FAIL';report['errors'].append({'type':type(error).__name__,'message':str(error)[:180]});report['http_media_requests']=list(server.media_requests);save();raise
        finally:
            # sync_playwright has already stopped on exceptional exit.
            for client in (context,browser):
                if client:
                    try:client.close()
                    except Exception as close_error:
                        if 'Event loop is closed' not in str(close_error):raise
            if worker:server.shutdown();server.server_close();worker.join()
            if installed:installed.close()
            else:
                for native_patch in reversed(locals().get('native_patches',[])):native_patch.stop()
            if controller:
                for adapter in controller.adapters.values():adapter.engine.close()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--seconds',type=int,default=1800);parser.add_argument('--transport',choices=('http','extension','installed'),default='http');parser.add_argument('--installer',default='dist/windows/Chute-Windows.exe');parser.add_argument('--output',default=os.environ.get('CHUTE_P0_EVIDENCE','/tmp/chutey-p0-endurance'));args=parser.parse_args();assert args.seconds>=10
    run(args)
if __name__=='__main__':main()
