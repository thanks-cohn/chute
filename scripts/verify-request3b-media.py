"""Real small/large MP4/WebM/MP3 in BOTH viewers; disposable files only.
HTTP test enrollment alias only; production filesystem guards remain real.
"""
import hashlib,importlib.util,json,os,shutil,subprocess,sys,tempfile,threading,time,tracemalloc
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
spec=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/verify-development1-browser.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
from chute.explorer import Explorer,RootGrant,Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer
from chute.store import Store
from playwright.sync_api import sync_playwright,expect

def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as stream:
  while chunk:=stream.read(262144):h.update(chunk)
 return h.hexdigest()

def assets(folder):
 ffmpeg=shutil.which('ffmpeg');assert ffmpeg,'ffmpeg required for genuine generated media'
 result=[]
 for large in (False,True):
  for ext in ('mp4','webm','mp3'):
   path=folder/(('large' if large else 'small')+'.'+ext)
   if ext=='mp3':args=['-f','lavfi','-i','sine=frequency=440:duration='+('900' if large else '3'),'-c:a','libmp3lame','-b:a','320k']
   else:
    args=['-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration='+('9' if large else '3')]
    if ext=='mp4':args+=['-f','lavfi','-i','sine=frequency=440:duration='+('9' if large else '3')]
    if large:args+=['-vf','noise=alls=100:allf=t+u']
    args+=['-c:v','libx264','-preset','ultrafast','-crf','14','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart'] if ext=='mp4' else ['-c:v','libvpx-vp9','-lossless','1','-deadline','realtime','-cpu-used','8']
   print('Generating '+path.name,flush=True);subprocess.run([ffmpeg,'-v','error',*args,str(path)],check=True)
   if large:assert path.stat().st_size>32*1024**2,(path.name,path.stat().st_size)
   result.append({'name':path.name,'size':path.stat().st_size,'sha256':sha(path),'format':ext,'large':large})
 return result

def main():
 out=Path(os.environ.get('CHUTE_MEDIA_EVIDENCE','/tmp/chutey-request3b'));out.mkdir(parents=True,exist_ok=True)
 results=[];concurrency=[]
 with tempfile.TemporaryDirectory(prefix='chutey-media-') as temp:
  root=Path(temp)
  assert shutil.disk_usage(root).free>1024**3,'The disposable media fixture needs at least 1 GiB free; do not run on a nearly full owner drive.'
  approved=root/'approved';approved.mkdir();destination=root/'destination';destination.mkdir();files=assets(approved)
  store=Store(root/'store');engine=Explorer([RootGrant(approved),RootGrant(destination,writable=True)]);session=Session(f.f.ORIGIN)
  server=ChuteServer(('127.0.0.1',17891),store);server.RequestHandlerClass=f.BrowserOriginFixture;server.explorer_api=ExplorerAPI(engine,session)
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   with sync_playwright() as p:
    chrome=os.environ.get('CHUTE_TEST_BROWSER') or shutil.which('chromium') or shutil.which('chrome') or r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    browser=p.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':390,'height':700})
    context.add_init_script(f.f.INIT+'\nif(location.origin==="http://127.0.0.1:17891")chrome.storage.sync.set({chuteyOpenTarget:"chutey",chuteyRevealTarget:"chutey"});window.__nativeSessionToken='+json.dumps(session.token)+';')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:17891/shelf.html');page.get_by_role('tab',name='File Explorer',exact=True).click()
    tracemalloc.start();started=time.monotonic();latencies=[]
    for surface in ('Shelf','Popup'):
     if surface=='Popup':page.goto('http://127.0.0.1:17891/popup.html');page.locator('#popup-local-toggle').click()
     for item in files:
      print('Playing '+surface+' '+item['name']+' '+str(item['size']),flush=True)
      tag='audio' if item['format']=='mp3' else 'video'
      if surface=='Shelf':page.locator('.ex-row').filter(has=page.locator('.ex-name',has_text=item['name'])).dblclick();media=page.locator('.ex-pinned-body '+tag)
      else:page.get_by_role('button',name='▶ '+item['name'],exact=True).click();media=page.locator('.chutey-lightbox-player '+tag)
      expect(media).to_be_visible();media.wait_for(state='attached');page.wait_for_function('(s)=>document.querySelector(s)?.readyState>=1',arg=('.ex-pinned-body ' if surface=='Shelf' else '.chutey-lightbox-player ')+tag,timeout=20000)
      assert media.evaluate('n=>n.paused && n.preload==="metadata" && n.src.includes("/api/explorer/v1/media/")')
      media.evaluate('n=>n.play()');page.wait_for_function('(s)=>document.querySelector(s)?.currentTime>.1',arg=('.ex-pinned-body ' if surface=='Shelf' else '.chutey-lightbox-player ')+tag)
      seek=850 if item['large'] and tag=='audio' else 2
      media.evaluate('(n,t)=>{n.pause();n.currentTime=t}',seek)
      page.wait_for_function('({s,t})=>{let n=document.querySelector(s);return n&&!n.seeking&&Math.abs(n.currentTime-t)<.4}',arg={'s':('.ex-pinned-body ' if surface=='Shelf' else '.chutey-lightbox-player ')+tag,'t':seek},timeout=20000)
      assert media.evaluate('n=>n.paused')
      # Directory browsing and health stay responsive while source is active.
      for _ in range(3):
       t=time.monotonic();page.evaluate('()=>ChuteyExplorerAPI.command("roots")');latencies.append(time.monotonic()-t)
      if surface=='Shelf' and item['name']=='large.mp4':
       meta=next(r for r in engine.execute('list',handle=next(iter(engine.grants)))['result']['entries'] if r['name']==item['name'])
       args={'id':os.urandom(16).hex(),'kind':'local_to_live','handle':meta['handle'],'identity':meta['identity']}
       media.evaluate('n=>n.play()')
       job=page.evaluate('(args)=>ChuteyExplorerAPI.command("transfer_start",args)',args)
       while job['state'] in ('accepted','running'):
        t=time.monotonic();listing=page.evaluate('(handle)=>ChuteyExplorerAPI.command("list",{handle,offset:0,limit:100,sort:"name",query:""})',next(iter(engine.grants)));latency=time.monotonic()-t
        assert len(listing['entries'])==6
        range_status=media.evaluate('async n=>{let r=await fetch(n.src,{headers:{Range:"bytes=1000-3047"}});let b=await r.arrayBuffer();return {status:r.status,size:b.byteLength}}')
        assert range_status=={'status':206,'size':2048}
        health=page.evaluate('async()=> (await fetch("/health")).status');assert health==200
        concurrency.append({'job_state':job['state'],'listing_seconds':latency,'range':range_status,'health':health})
        job=page.evaluate('(id)=>ChuteyExplorerAPI.command("transfer_status",{id})',args['id'])
       assert job['state']=='COMMITTED' and job['receipt']['sha256']==item['sha256'],job
       assert sha(store.get(job['receipt']['file']['id'])[1])==item['sha256']
       media.evaluate('n=>n.pause()')
      page.screenshot(path=str(out/(surface.lower()+'-'+item['name']+'.png')))
      with page.expect_response(lambda response:'/api/explorer/v1/command' in response.url and response.request.post_data_json.get('command')=='release_media'):
       if surface=='Shelf':page.get_by_role('button',name='Stop playback',exact=True).click()
       else:page.keyboard.press('Escape')
      page.wait_for_function('()=>true');assert not server.explorer_api.media
      results.append({**item,'surface':surface,'played':True,'paused':True,'seek_seconds':seek,'ticket_released':True})
    # Large genuine media native copy job + range read + navigation concurrency.
    for item in files:
     row=engine.execute('list',handle=next(iter(engine.grants)))['result']['entries'];row=next(r for r in row if r['name']==item['name'])
     args={'kind':'local_copy','handle':row['handle'],'identity':row['identity'],'destination':list(engine.grants)[1]}
     t=time.monotonic()
     receipt=page.evaluate('(args)=>ChuteyExplorerAPI.transfer(args)',args)
     assert receipt['state']=='COMMITTED' and receipt['sha256']==item['sha256']==sha(destination/item['name'])
     item['copy_seconds']=round(time.monotonic()-t,4)
    current,peak=tracemalloc.get_traced_memory();tracemalloc.stop()
    # Save a real >32 MiB browser File through the popup picker, no base64 relay.
    page.locator('#popup-local-toggle').click()
    large=next(i for i in files if i['large'] and i['format']=='mp3');page.locator('.chutey-intake input[type=file]').set_input_files(str(approved/large['name']))
    expect(page.locator('.chutey-intake [role=status]')).to_contain_text('Verified '+large['name'],timeout=20000)
    saved=store.list()[0];assert saved.size==large['size'] and sha(store.get(saved.id)[1])==large['sha256']
    (approved/'unsupported-codec.mp4').write_bytes(b'Not an MP4 decoder stream')
    page.locator('#popup-local-toggle').click()
    page.get_by_role('button',name='▶ unsupported-codec.mp4',exact=True).click()
    expect(page.locator('.chutey-lightbox-error')).to_contain_text('source is available, but Chrome could not decode',timeout=15000)
    page.keyboard.press('Escape')
    assert not errors,errors
    report={'platform':sys.platform,'resource_snapshot':__import__('chute.runtime_log',fromlist=['resource_snapshot']).resource_snapshot(),'browser':browser.version,'scope':'Real browser and real filesystem guards; test-only HTTP native enrollment; installed extension/owner acceptance pending','media':results,'copies':files,'simultaneous_copy_stream_browse_health':concurrency,'directory_latency_max_seconds':max(latencies),'traced_python_peak_bytes':peak,'elapsed_seconds':round(time.monotonic()-started,3),'browser_file_import':{'name':large['name'],'size':saved.size,'sha256':large['sha256']}}
    (out/'results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));browser.close()
  finally:server.shutdown();server.server_close();thread.join();engine.close()
if __name__=='__main__':main()
