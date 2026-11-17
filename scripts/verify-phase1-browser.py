"""Isolated Linux Chromium UI checks; not a Windows/installed-extension claim."""
from __future__ import annotations
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
spec=importlib.util.spec_from_file_location('explorer_fixture',ROOT/'scripts/verify-explorer-browser.py')
fixture=importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)
from chute.explorer import Explorer, RootGrant, Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer
from chute.store import Store
from PIL import Image
from playwright.sync_api import sync_playwright, expect

ORIGIN='chrome-extension://abcdefghijklmnopabcdefghijklmnop'
INIT=r"""(() => {
 const listeners=[];
 window.addEventListener('storage',event=>{if(!event.key?.startsWith('test-'))return;const before=JSON.parse(event.oldValue||'{}'),after=JSON.parse(event.newValue||'{}');const changes=Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k])).map(k=>[k,{oldValue:before[k],newValue:after[k]}]));for(const fn of listeners)fn(changes,event.key.slice(5));});
 const store=(area)=>({get:async defaults=>Object.assign({},defaults,JSON.parse(localStorage.getItem('test-'+area)||'{}')),
 set:async patch=>{const prior=JSON.parse(localStorage.getItem('test-'+area)||'{}');localStorage.setItem('test-'+area,JSON.stringify({...prior,...patch}));for(const fn of listeners)fn(Object.fromEntries(Object.entries(patch).map(([key,newValue])=>[key,{newValue,oldValue:prior[key]}])),area);},remove:async keys=>{const prior=JSON.parse(localStorage.getItem("test-"+area)||"{}");for(const key of (Array.isArray(keys)?keys:[keys]))delete prior[key];localStorage.setItem("test-"+area,JSON.stringify(prior));}});
 window.chrome={storage:{local:store('local'),sync:store('sync'),session:store('session'),onChanged:{addListener:fn=>listeners.push(fn)}},
 runtime:{getURL:path=>new URL(path,location.href).href,sendMessage:async()=>({}),onMessage:{addListener(){}},connectNative(){throw Error('fixture only')},
 sendNativeMessage:async()=>({ok:true,safe_recovery:1,explorer_protocol:'1.1',protocol:'1.1',read_only:true,token:window.__nativeSessionToken})}};
})();"""

class QuietHandler(fixture.FixtureHandler):
    def log_message(self,*args): pass

def main():
    out=Path('/tmp/chutey-phase1-browser');out.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='chutey-phase1-') as temp:
        root=Path(temp); approved=root/'approved';approved.mkdir()
        store=Store(root/'history')
        for index in range(16):
            data=io.BytesIO();Image.new('RGB',(240+index*5,160),(index*12,90,120)).save(data,'PNG')
            store.add_stream(f'picture-{index:02}.png',io.BytesIO(data.getvalue()),len(data.getvalue()),mime='image/png')
        Image.new('RGB',(300,140),(200,40,80)).save(approved/'a.png')
        (approved/'b.png').write_bytes(b'broken')
        # Real video decoder, metadata, paused playback and seek; no movie claim.
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:d=6','-c:v','libvpx','-b:v','100k',str(approved/'c.webm')],check=True)
        engine=Explorer([RootGrant(approved)]); session=Session(ORIGIN)
        server=ChuteServer(('127.0.0.1',17891),store);server.RequestHandlerClass=QuietHandler
        server.explorer_api=ExplorerAPI(engine,session)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
                context=browser.new_context(viewport={'width':390,'height':800})
                context.add_init_script(INIT+'\nwindow.__nativeSessionToken='+json.dumps(session.token)+';')
                context.route('**/api/explorer/**',lambda route:route.fulfill(response=route.fetch(headers={**route.request.headers,'origin':ORIGIN})))
                page=context.new_page(); errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                pending=[];page.route('**/api/browse?**',lambda route:pending.append(route))
                page.goto('http://127.0.0.1:17891/popup.html',wait_until='domcontentloaded')
                expect(page.locator('.chutey-popup-placeholder')).to_have_count(16)
                rects=lambda selector:page.locator(selector).evaluate_all('(nodes)=>nodes.map(n=>{let r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})')
                before=rects('.chutey-popup-placeholder')
                assert all(box[2]>0 and abs(box[2]-box[3])<1 for box in before),before
                assert page.evaluate('document.body.getBoundingClientRect().height')==590
                page.screenshot(path=str(out/'popup-first-paint.png'))
                for route in list(pending):route.continue_()
                page.unroute('**/api/browse?**')
                expect(page.locator('.chutey-gallery-tile')).to_have_count(16)
                expect(page.locator('.file-icon.has-thumbnail')).to_have_count(16)
                after=rects('.chutey-gallery-tile')
                assert before==after,(before,after)
                expect(page.locator('#files')).not_to_have_attribute('aria-busy','true')
                page.locator('.settings-panel summary').click()
                page.locator('[data-presentation-color]').fill('#654321')
                assert page.locator('[data-presentation-animation]').count()==0
                expect(page.locator('[data-presentation-status]')).to_have_text('Saved')
                page.reload()
                expect(page.locator('html')).to_have_attribute('data-chutey-background-animation','false')
                assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--chutey-card-background').trim()")=='#654321'
                page.locator('.settings-panel summary').click()
                page.locator('[data-presentation-reset]').click()
                expect(page.locator('[data-presentation-color]')).to_have_value('#293728')
                page.locator('.settings-panel summary').click()
                for step,columns in [(1,5),(2,5),(3,6),(0,4)]:
                    page.locator('#gallery-density').evaluate('(node,value)=>{node.value=value;node.dispatchEvent(new Event("input",{bubbles:true}))}',str(step))
                    page.reload()
                    expect(page.locator('body')).to_have_attribute('data-gallery-layout',{0:'4x4',1:'5x4',2:'5x5',3:'6x5'}[step])
                    assert len(page.locator('#files').evaluate('node=>getComputedStyle(node).gridTemplateColumns.split(" ")'))==columns
                    assert page.evaluate('document.body.getBoundingClientRect().height')==590
                # Each cached density paints its complete skeleton before data.
                for step,count in [(1,20),(2,25),(3,30),(0,16)]:
                    page.locator('#gallery-density').evaluate('(node,value)=>{node.value=value;node.dispatchEvent(new Event("input",{bubbles:true}))}',str(step))
                    blocked=[];page.route('**/api/browse?**',lambda route:blocked.append(route))
                    page.reload(wait_until='domcontentloaded')
                    expect(page.locator('.chutey-popup-placeholder')).to_have_count(count)
                    assert page.evaluate('document.body.getBoundingClientRect().height')==590
                    for route in list(blocked):route.continue_()
                    page.unroute('**/api/browse?**')
                    expect(page.locator('.chutey-gallery-tile')).to_have_count(16)
                # Offline: fixed outline, placeholders remain, no blocking image prerequisite.
                page.route('**/api/browse?**',lambda route:route.abort())
                page.reload();expect(page.locator('.chutey-popup-placeholder')).to_have_count(16)
                assert page.evaluate('document.body.getBoundingClientRect().height')==590
                page.unroute('**/api/browse?**')
                page.goto('http://127.0.0.1:17891/shelf.html')
                page.get_by_role('tab',name='File Explorer',exact=True).click()
                expect(page.locator('#clear')).to_be_hidden()
                page.get_by_role('button',name='Toggle grid',exact=True).click()
                expect(page.locator('.ex-row[data-thumbnail=ready]')).to_have_count(1)
                expect(page.locator('.ex-row[data-thumbnail=failed]')).to_have_count(1)
                assert 'Thumbnail unavailable' in page.locator('.ex-row[data-thumbnail=failed]').get_attribute('title')
                video=page.locator('.ex-row',has_text='c.webm');video.dblclick()
                expect(page.locator('.ex-preview-body video')).to_be_visible()
                page.wait_for_function('document.querySelector(".ex-preview-body video")?.readyState>=1')
                media=page.locator('.ex-preview-body video')
                assert media.evaluate('node=>node.paused && !node.autoplay && node.src.includes("/api/explorer/v1/media/")')
                media.evaluate('node=>node.currentTime=3')
                page.wait_for_function('Math.abs(document.querySelector(".ex-preview-body video").currentTime-3)<.3')
                geometry=page.locator('.ex-preview').bounding_box()
                media.evaluate('node=>node.play()');page.wait_for_function('document.querySelector(".ex-preview-body video").currentTime>3.1')
                assert page.locator('.ex-preview').bounding_box()==geometry
                # Hiding Explorer is also a cancellation boundary.
                page.get_by_role('tab',name='History',exact=True).click()
                page.wait_for_function('document.querySelector(".ex-preview").hidden')
                assert not server.explorer_api.media
                page.get_by_role('tab',name='File Explorer',exact=True).click()
                video.dblclick();expect(page.locator('.ex-preview-body video')).to_be_visible()
                page.get_by_role('button',name='Close preview',exact=True).click()
                page.wait_for_function('document.querySelector(".ex-preview").hidden')
                assert not server.explorer_api.media,'Closing preview revokes its media authority'
                page.get_by_role('tab',name='History',exact=True).click()
                expect(page.locator('#clear')).to_be_visible()
                dialogs=[]
                page.on('dialog',lambda dialog:(dialogs.append(dialog.message),dialog.dismiss()))
                page.locator('#clear').click();assert dialogs
                assert len(store.list())==16,'Cancel preserves Live files'
                assert not errors,errors
                page.screenshot(path=str(out/'history.png'))
                context.close();browser.close()
                results={'popup_first_paint':'16 placeholders match 16 decoded tile boxes','density':'all four layouts; fixed 590px shell; reload persistence','settings':'color, animation and reset persist','offline':'fixed shell and placeholders','thumbnails':'real decoded grid miniature and diagnostic on corrupt image','video':'real WebM paused, plays, seeks through optional API; stable overlay; release on close','trash':'hidden in Explorer; cancellation preserves 16 Live files','scope':'Linux browser fixture; native consent simulated; Windows acceptance outstanding'}
                (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
        finally:
            server.shutdown();server.server_close();thread.join();engine.close()
if __name__=='__main__':main()
