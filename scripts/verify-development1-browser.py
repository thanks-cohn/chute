"""Owner Development 1 regressions. HTTP browser fixture, not installed Chrome."""
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
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
spec=importlib.util.spec_from_file_location('phase1_fixture',ROOT/'scripts/verify-phase1-browser.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
from chute.explorer import Explorer,RootGrant,Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer
from chute.store import Store
from PIL import Image
from playwright.sync_api import sync_playwright,expect


class BrowserOriginFixture(f.QuietHandler):
    # Test-only origin alias, so real HTTP media streams need no DevTools
    # route.fetch buffer. Session tokens, file identities and grants stay real.
    def _explorer_route(self):
        if self.path.startswith('/api/explorer/'):
            origin=self.headers.get('Origin')
            if origin in (None,'http://127.0.0.1:17891'):
                if origin is None:self.headers['Origin']=f.ORIGIN
                else:self.headers.replace_header('Origin',f.ORIGIN)
        return super()._explorer_route()


def main():
    out=Path('/tmp/chutey-development1');out.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        root=Path(temp);approved=root/'approved';approved.mkdir();store=Store(root/'history')
        image=io.BytesIO();Image.new('RGB',(320,160),(40,120,180)).save(image,'PNG');data=image.getvalue()
        for i in range(120):store.add_stream(f'image-{i:03}.png',io.BytesIO(data),len(data),mime='image/png')
        (approved/'00-image.png').write_bytes(data)
        (approved/'01-document.txt').write_text('Scrollable document line\n'*3000)
        (approved/'02-image.png').write_bytes(data)
        for name,args in [('03-small.mp4',['-f','lavfi','-i','color=c=red:s=160x90:d=3','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart']),('04-large.mp3',['-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','libmp3lame'])]:
            subprocess.run(['ffmpeg','-v','error',*args,str(approved/name)],check=True)
        with (approved/'04-large.mp3').open('r+b') as audio:audio.truncate(80*1024**2)
        session=Session(f.ORIGIN);engine=Explorer([RootGrant(approved)])
        server=ChuteServer(('127.0.0.1',17891),store);server.RequestHandlerClass=BrowserOriginFixture
        server.explorer_api=ExplorerAPI(engine,session);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
                context=browser.new_context(viewport={'width':390,'height':800})
                context.add_init_script(f.INIT+'\nif(location.origin==="http://127.0.0.1:17891")chrome.storage.sync.set({chuteyOpenTarget:"chutey",chuteyRevealTarget:"chutey"});window.__nativeSessionToken='+json.dumps(session.token)+';')
                # Deliberately feed 120 real saved records through the real renderer
                # in one scrolling page, beyond normal 30-record pagination.
                context.route('**/api/browse?**',lambda route:route.fulfill(response=route.fetch(url=route.request.url.replace('limit=30','limit=200'))))
                page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto('http://127.0.0.1:17891/popup.html')
                expect(page.locator('.chutey-gallery-tile')).to_have_count(120)
                old_css=page.add_style_tag(content=".chutey-gallery-popup #files {height:400px;max-height:400px;overflow-y:auto;grid-auto-rows:auto;grid-template-rows:repeat(4,min-content)} .chutey-gallery-popup #files .chutey-gallery-tile {aspect-ratio:1!important;height:auto}")
                broken=page.locator('.chutey-gallery-tile').evaluate_all('nodes=>nodes.map(node=>node.getBoundingClientRect().height)')
                assert min(broken)<20,'The prior CSS must reproduce collapsed implicit rows'
                old_css.evaluate('node=>node.remove()')
                measurements=[]
                for step in range(4):
                    page.locator('#gallery-density').evaluate('(node,step)=>{node.value=step;node.dispatchEvent(new Event("input",{bubbles:true}))}',str(step))
                    boxes=page.locator('.chutey-gallery-tile').evaluate_all('nodes=>nodes.map(node=>{let r=node.getBoundingClientRect();return {w:r.width,h:r.height}})')
                    assert all(box['h']>45 and abs(box['w']-box['h'])<1 for box in boxes),(step,boxes)
                    assert max(box['h'] for box in boxes)-min(box['h'] for box in boxes)<1
                    page.evaluate('document.scrollingElement.scrollTop=document.scrollingElement.scrollHeight')
                    last=page.locator('.chutey-gallery-tile').last
                    expect(last.locator('.file-thumb')).to_have_js_property('naturalWidth',320)
                    measurements.append({'density':step,'cards':len(boxes),'min_height':min(box['h'] for box in boxes)})
                page.screenshot(path=str(out/'popup-bottom-120-cards.png'))
                page.goto('http://127.0.0.1:17891/shelf.html');page.get_by_role('tab',name='File Explorer',exact=True).click()
                page.get_by_role('button',name='Toggle grid',exact=True).click()
                expect(page.locator('.ex-row[data-thumbnail=ready]')).to_have_count(2)
                page.locator('.ex-more-settings summary').click();page.get_by_label('Show image thumbnails',exact=True).uncheck()
                expect(page.locator('.ex-icon img')).to_have_count(0)
                page.reload();page.get_by_role('tab',name='File Explorer',exact=True).click()
                page.locator('.ex-more-settings summary').click();expect(page.get_by_label('Show image thumbnails')).not_to_be_checked()
                expect(page.locator('.ex-icon img')).to_have_count(0)
                page.get_by_label('Show image thumbnails').check();expect(page.locator('.ex-row[data-thumbnail=ready]')).to_have_count(2)
                page.locator('.ex-more-settings summary').click()
                picture=page.locator('.ex-row',has_text='00-image.png');picture.dblclick()
                expect(page.locator('.ex-preview-body img')).to_have_js_property('naturalWidth',320)
                geometry=lambda:page.locator('.ex-list').bounding_box()
                before=geometry();overlay=page.locator('.ex-preview').bounding_box()
                page.get_by_role('button',name='Next file',exact=True).click();expect(page.locator('.ex-preview-body pre')).to_be_visible()
                selected=page.locator('.ex-row[aria-selected=true]').get_attribute('data-handle')
                page.locator('.ex-row[aria-selected=true]').focus()
                page.keyboard.press('ArrowDown');assert page.locator('.ex-preview-body').evaluate('node=>node.scrollTop')>0
                assert page.locator('.ex-row[aria-selected=true]').get_attribute('data-handle')==selected
                page.locator('.ex-preview-body').hover();page.mouse.wheel(0,150)
                page.wait_for_function("document.querySelector('.ex-preview-body').scrollTop>48")
                page.keyboard.press('ArrowRight');expect(page.locator('.ex-preview strong')).to_have_text('02-image.png')
                page.keyboard.press('ArrowLeft');expect(page.locator('.ex-preview strong')).to_have_text('01-document.txt')
                assert geometry()==before;assert page.locator('.ex-preview').bounding_box()==overlay
                page.keyboard.press('Escape');expect(page.locator('.ex-preview')).to_be_hidden()
                # Preserve the known working small MP4 and play large audio via
                # a media source URL, never a whole-file Blob.
                for name,tag in [('03-small.mp4','video'),('04-large.mp3','audio')]:
                    print('Checking '+name,flush=True)
                    page.locator('.ex-row',has_text=name).dblclick();media=page.locator('.ex-pinned-body '+tag)
                    expect(media).to_be_visible();page.wait_for_function('(tag)=>document.querySelector(".ex-pinned-body "+tag)?.readyState>=1',arg=tag)
                    assert media.evaluate('node=>node.paused && node.src.includes("/api/explorer/v1/media/")')
                    media.evaluate('node=>node.play()');page.wait_for_function('(tag)=>document.querySelector(".ex-pinned-body "+tag).currentTime>0',arg=tag)
                    with page.expect_response(lambda response:'/api/explorer/v1/command' in response.url and response.request.post_data_json.get('command')=='release_media'):
                        page.get_by_role('button',name='Stop playback',exact=True).click()
                    assert not server.explorer_api.media
                # Archived-worker compatibility: lack of media_source must
                # retain the known-working small MP4 Blob fallback.
                def old_media_command(route):
                    if route.request.post_data_json.get('command')=='media_source':
                        route.fulfill(status=400,json={'state':'failed','error':{'code':'UNSUPPORTED_COMMAND','message':'This command is not supported.'}})
                    else:route.fallback()
                page.route('**/api/explorer/v1/command',old_media_command)
                page.locator('.ex-row',has_text='03-small.mp4').dblclick()
                expect(page.locator('.ex-pinned-body video')).to_be_visible()
                page.wait_for_function('document.querySelector(".ex-pinned-body video")?.readyState>=1')
                assert page.locator('.ex-pinned-body video').evaluate('node=>node.src.startsWith("blob:")')
                page.locator('.ex-pinned-body video').evaluate('node=>node.play()')
                page.wait_for_function('document.querySelector(".ex-pinned-body video").currentTime>0')
                page.get_by_role('button',name='Stop playback',exact=True).click()
                page.unroute('**/api/explorer/v1/command',old_media_command)
                # Explicit Chutey saved-file Reveal opens its directory in Chutey and
                # selects the exact saved file, not Windows or another file.
                page.get_by_role('tab',name='History',exact=True).click()
                item=page.locator('#files .file-row').first
                saved_id=item.get_attribute('data-chute-id')
                item.locator('button.open').click()
                expect(page.get_by_role('tab',name='File Explorer',exact=True)).to_have_attribute('aria-selected','true')
                expect(page.locator('.ex-breadcrumb')).to_have_text('Saved Chutey files')
                expect(page.locator('.ex-row[aria-selected=true]')).to_have_count(1)
                expect(page.locator('.ex-row[aria-selected=true] .ex-name')).to_contain_text(saved_id)
                expect(page.locator('.ex-preview')).to_be_hidden()
                # System Reveal preference keeps the original endpoint and never
                # silently substitutes the native scoped-file command.
                page.get_by_role('tab',name='History',exact=True).click()
                page.locator('.chutey-presentation-options > summary').click()
                page.locator('[data-file-preference=chuteyRevealTarget]').select_option('system')
                page.locator('.chutey-presentation-options > summary').click()
                revealed=[]
                page.route('**/api/reveal/*',lambda route:(revealed.append(route.request.url),route.fulfill(json={'ok':True,'action':'selected'})))
                with page.expect_response(lambda response:'/api/reveal/' in response.url):
                    page.locator('#files .file-row').first.locator('button.open').click()
                assert len(revealed)==1
                assert not errors,errors
                results={'scope':'Linux HTTP fixture, consent simulated; Windows acceptance pending','popup_120_cards':measurements,'thumbnails':'default real miniatures; icon preference persists','gallery':'buttons/Left/Right; Up/Down and wheel scroll documents; Escape; stable overlay/list','media':'real small MP4 and sparse-padded 80 MiB MP3 play paused by default via stream API','saved_reveal':'Explicit Chutey preference selects containing directory; explicit Windows alternative reuses original endpoint'}
                (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
                browser.close()
        finally:server.shutdown();server.server_close();thread.join();engine.close()
if __name__=='__main__':main()
