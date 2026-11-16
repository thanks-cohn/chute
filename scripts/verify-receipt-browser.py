"""Interactive Chromium drag/drop through real content, iframe, intake and Store.

Chrome enrollment/native APIs are simulated. Mouse drag events, file bytes,
HTTP receipts, count broker and original CSS reaction execute in the browser.
"""
import asyncio
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import threading
from urllib.parse import unquote
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
spec=importlib.util.spec_from_file_location('phase1',ROOT/'scripts/verify-phase1-browser.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
from chute.server import ChuteServer
from chute.store import Store
from playwright.async_api import async_playwright,expect

INIT=r"""(() => {
 const listeners=[],messages=[];
 const storage=(area)=>({get:(defaults,callback)=>{const data={...defaults,...JSON.parse(localStorage.getItem('mock-'+area)||'{}')};if(callback)callback(data);return Promise.resolve(data);},set:async patch=>{
 const prior=JSON.parse(localStorage.getItem('mock-'+area)||'{}');localStorage.setItem('mock-'+area,JSON.stringify({...prior,...patch}));for(const fn of listeners)fn(Object.fromEntries(Object.entries(patch).map(([key,newValue])=>[key,{newValue}])),area);
 }});
 window.addEventListener('storage',event=>{if(!event.key?.startsWith('mock-'))return;const area=event.key.slice(5),data=JSON.parse(event.newValue||'{}');for(const fn of listeners)fn(Object.fromEntries(Object.entries(data).map(([key,newValue])=>[key,{newValue}])),area);});
 window.chrome={runtime:{getURL:path=>new URL(path,location.origin).href,onMessage:{addListener:fn=>messages.push(fn)},onStartup:{addListener(){}},onInstalled:{addListener(){}},sendMessage:(message,callback)=>{const p=window.__sendToWorker(message);if(callback)p.then(callback);return p;},sendNativeMessage:(_host,message,callback)=>callback({ok:false,safe_recovery:1})},
 storage:{sync:storage('sync'),session:storage('session'),onChanged:{addListener:fn=>listeners.push(fn)}},
 action:{setBadgeBackgroundColor:async()=>{},setBadgeText:async()=>{}}};
 window.__dispatchMessage=(message,sender)=>new Promise(resolve=>{for(const fn of messages){const handled=fn(message,sender,resolve);if(handled===true||handled===false)return;}resolve({ok:false});});
})();"""

class Handler(f.QuietHandler):
    lost_attempts=0
    def _json(self,payload,status=200):
        if self.path=='/api/upload' and unquote(self.headers.get('X-Chute-Filename',''))=='lost-receipt.txt' and int(status)==201:
            import socket
            type(self).lost_attempts+=1
            self.close_connection=True;self.connection.shutdown(socket.SHUT_RDWR);self.connection.close();return
        super()._json(payload,status)
    def do_GET(self):
        if self.path=='/fixture.html':
            body=b'''<!doctype html><style>#source {width:180px;height:70px;background:#cdf;margin:30px}body{height:700px}</style><div id="source" draggable="true">Drag real file payload</div><script>window.batch=['one.txt'];document.querySelector('#source').addEventListener('dragstart',event=>{for(const name of window.batch)event.dataTransfer.items.add(new File(['Receipt browser proof '+name],name,{type:'text/plain'}));});</script>'''
            self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
        super().do_GET()
    def do_POST(self):
        if self.headers.get('Origin')=='http://127.0.0.1:17891':self.headers.replace_header('Origin',f.ORIGIN)
        if self.path=='/api/upload' and unquote(self.headers.get('X-Chute-Filename','')).startswith('blocked'):
            self.connection.settimeout(3);self.rfile.read(int(self.headers.get('Content-Length','0')))
            self._json({'error':'Synthetic blocked save'},403);return
        super().do_POST()

async def main():
    out=Path('/tmp/chutey-receipt-browser');out.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        store=Store(Path(temp)/'synthetic-state');server=ChuteServer(('127.0.0.1',17891),store);server.RequestHandlerClass=Handler
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            async with async_playwright() as p:
                browser=await p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
                context=await browser.new_context(viewport={'width':900,'height':750})
                hub=await context.new_page()
                async def send(source,message):
                    return await hub.evaluate('([message])=>window.__dispatchMessage(message,{tab:{id:1},frameId:1})',[message])
                await context.expose_binding('__sendToWorker',send)
                await context.add_init_script(INIT)
                await hub.goto('http://127.0.0.1:17891/fixture.html')
                await hub.add_script_tag(url='http://127.0.0.1:17891/background-native.js')
                await hub.add_script_tag(url='http://127.0.0.1:17891/background-status.js')
                page=await context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                await page.goto('http://127.0.0.1:17891/fixture.html')
                await page.evaluate("window.trustedDrops=[];document.addEventListener('drop',event=>trustedDrops.push({trusted:event.isTrusted,files:[...event.dataTransfer.files].map(file=>file.name)}),true)")
                await page.add_script_tag(url='http://127.0.0.1:17891/content.js')
                await page.add_script_tag(url='http://127.0.0.1:17891/content-auto-hide.js')
                for _ in range(40):
                    frames=[frame for frame in page.frames if frame.url.endswith('/bin.html')]
                    if frames:break
                    await asyncio.sleep(.05)
                frame=frames[0];await frame.wait_for_selector('#bin')
                await frame.evaluate("window.reactions=[];window.bounceSeen=false;document.querySelector('#bin').addEventListener('animationstart',event=>{reactions.push(event.animationName);if(event.animationName==='happy')bounceSeen=document.querySelector('#count').getAnimations().some(animation=>animation.effect.getKeyframes().some(frame=>String(frame.transform).includes('1.28')));})")
                cdp=await context.new_cdp_session(page)
                async def drop(names):
                    # Chromium's native input path supplies real local file
                    # objects. No synthetic DOM drop or CSS class mutation.
                    files=[]
                    for name in names:
                        path=Path(temp)/name;path.write_text('Receipt browser proof '+name);files.append(str(path))
                    bounds=await page.locator('#__chute_sticky_host').bounding_box()
                    data={'items':[],'files':files,'dragOperationsMask':1}
                    await cdp.send('Input.dispatchDragEvent',{'type':'dragEnter','x':100,'y':100,'data':data})
                    for kind in ('dragOver','drop'):
                        await cdp.send('Input.dispatchDragEvent',{'type':kind,'x':bounds['x']+bounds['width']/2,'y':bounds['y']+bounds['height']/2,'data':data})
                await drop(['one.txt'])
                await expect(frame.locator('#label')).to_have_text('YUMMY')
                await expect(frame.locator('#face')).to_have_text('^ ^')
                await expect(frame.locator('#count')).to_have_text('1')
                assert await frame.locator('#bin').evaluate('node=>getComputedStyle(node).animationName')=='happy'
                assert await frame.evaluate('window.bounceSeen')
                await page.evaluate("window.dispatchEvent(new Event('blur'))")
                assert await page.locator('#__chute_sticky_host').evaluate('node=>new DOMMatrix(getComputedStyle(node).transform).m41')==0
                await page.screenshot(path=str(out/'original-received-reaction.png'))
                await asyncio.sleep(.5)
                assert len(store.list())==1
                await drop(['two.txt','three.txt'])
                await expect(frame.locator('#label')).to_have_text('YUMMY')
                await expect(frame.locator('#count')).to_have_text('3')
                assert len(store.list())==3
                await asyncio.sleep(.5)
                reactions=await frame.evaluate("window.reactions.filter(name=>name==='happy').length")
                await drop(['blocked.txt'])
                await expect(frame.locator('#bin')).to_have_class('bin failure')
                await asyncio.sleep(.5)
                assert len(store.list())==3
                assert await frame.evaluate("window.reactions.filter(name=>name==='happy').length")==reactions
                # Partial batch: the first receipt is real, the blocked second
                # cannot produce an all-success reaction or discard saved data.
                await drop(['partial.txt','blocked-second.txt'])
                await asyncio.sleep(.6)
                assert len(store.list())==4
                assert await frame.evaluate("window.reactions.filter(name=>name==='happy').length")==reactions
                # A periodic count refresh cannot erase an active success label.
                await drop(['fourth-confirmed.txt'])
                await expect(frame.locator('#label')).to_have_text('YUMMY')
                await frame.evaluate('refreshCount()')
                await expect(frame.locator('#label')).to_have_text('YUMMY')
                await expect(frame.locator('#count')).to_have_text('5')
                await asyncio.sleep(.5)
                # Recover a missing host by reusing the same single host/frame;
                # do not reload the page or restore an intentionally hidden one.
                await page.evaluate("document.querySelector('#__chute_sticky_host').remove()")
                await expect(page.locator('#__chute_sticky_host')).to_have_count(1)
                await asyncio.sleep(.1)
                assert len(store.list())==5
                trusted=await page.evaluate('window.trustedDrops')
                assert all(drop['trusted'] for drop in trusted) and any(len(drop['files'])==2 for drop in trusted)
                # Also exercise a real mouse HTML5 webpage-text drag.
                await page.locator('#source').drag_to(page.locator('#__chute_sticky_host'))
                frames=[candidate for candidate in page.frames if candidate.url.endswith('/bin.html')]
                await frames[0].evaluate("window.reactions=[];document.querySelector('#bin').addEventListener('animationstart',event=>reactions.push(event.animationName))")
                await expect(frames[0].locator('#label')).to_have_text('YUMMY')
                assert len(store.list())==6
                await asyncio.sleep(.5)
                before_reactions=await frames[0].evaluate("window.reactions?.filter(name=>name==='happy').length || 0")
                await drop(['lost-receipt.txt'])
                await expect(frames[0].locator('#label')).to_have_text('CHECK')
                assert Handler.lost_attempts==1
                assert len(store.list())==7
                assert await frames[0].evaluate("window.reactions?.filter(name=>name==='happy').length || 0")==before_reactions
                assert not errors,errors
                metrics=await hub.evaluate('ChuteStatus.diagnostics()')
                results={'scope':'Interactive Linux Chromium HTTP fixture; Chrome enrollment simulated; not owner Windows acceptance',
                    'drops':'trusted Chromium input file drags plus mouse HTML5 webpage-text drag; single/batch bytes committed to Store',
                    'original_reaction':'happy CSS animation, YUMMY, happy face, count bounce; visible through blur',
                    'negative_cases':'blocked and partial batch do not play happy reaction; partial receipt remains saved',
                    'refresh':'count reads do not erase active reaction; no write resubmission',
                    'lost_receipt':'one backend commit, one POST, no success reaction and CHECK status; no replay', 'remount':'one host restored; stored files preserved','count_metrics':metrics,'saved_files':len(store.list())}
                (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
                await browser.close()
        finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':asyncio.run(main())
