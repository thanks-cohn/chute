"""CHROME_FIXTURE: real popup layout/lightbox at every density, no native proof."""
import importlib.util
import io
import json
import os
import shutil
from pathlib import Path
import tempfile
import threading

from PIL import Image
from playwright.sync_api import sync_playwright, expect

spec=importlib.util.spec_from_file_location('explorer_browser',Path(__file__).with_name('verify-explorer-browser.py'))
fixture=importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)


def main():
    out=Path('/tmp/chute-gallery'); out.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        store=fixture.Store(Path(temp)/'live')
        png=io.BytesIO(); Image.new('RGB',(3,2),(70,140,210)).save(png,format='PNG'); data=png.getvalue()
        for index in range(31): store.add_stream(f'tiny-{index}.png',io.BytesIO(data),len(data),mime='image/png')
        server=fixture.ChuteServer(('127.0.0.1',17891),store); server.RequestHandlerClass=fixture.FixtureHandler
        thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
        try:
            with sync_playwright() as playwright:
                browser=playwright.chromium.launch(executable_path=os.environ.get('CHUTE_TEST_CHROME') or shutil.which('chromium') or playwright.chromium.executable_path,headless=True,args=['--no-sandbox'])
                context=browser.new_context(viewport={'width':390,'height':800})
                context.add_init_script("""window.__shelfOpens=0; window.chrome={storage:{sync:{get:async d=>d,set:async()=>{}},local:{get:async d=>d,set:async()=>{}},session:{get:async d=>d,set:async()=>{},remove:async()=>{}},onChanged:{addListener(){}}},runtime:{sendMessage:async()=>({}),onMessage:{addListener(){}},connectNative(){throw Error('fixture')}},sidePanel:{open:async()=>{window.__shelfOpens++}},tabs:{query:async()=>[{windowId:1}]}};""")
                page=context.new_page(); errors=[]; page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto('http://127.0.0.1:17891/popup.html')
                page.locator('#files .file-row').first.wait_for()
                results=[]
                for density,label in enumerate(['4x4','5x4','5x5','6x5']):
                    page.locator('#gallery-density').evaluate('(node,value)=>{node.value=value;node.dispatchEvent(new Event("input",{bubbles:true}));}',str(density))
                    page.wait_for_function('label=>document.body.dataset.galleryLayout===label',arg=label)
                    row=page.locator('#files .file-row').first
                    row.locator('.file-name').click(position={'x':2,'y':2})
                    page.wait_for_function('document.querySelector("#files .file-row").classList.contains("chutey-gallery-expanded")')
                    boxes=page.locator('#files .file-row').evaluate_all('nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})')
                    assert 0<len(boxes)<=30
                    for i,a in enumerate(boxes):
                        for b in boxes[i+1:]:
                            assert min(a['x']+a['w'],b['x']+b['w'])-max(a['x'],b['x'])<=0.5 or min(a['y']+a['h'],b['y']+b['h'])-max(a['y'],b['y'])<=0.5,(label,a,b)
                    row.locator('.file-icon').click(position={'x':10,'y':10})
                    expect(page.locator('.chutey-lightbox')).to_be_visible()
                    expect(page.locator('.chutey-lightbox-image')).to_have_js_property('naturalWidth',3)
                    assert page.evaluate('window.__shelfOpens')==0
                    page.screenshot(path=str(out/f'popup-{label}.png'))
                    page.get_by_role('button',name='Close preview',exact=True).click()
                    expect(page.locator('.chutey-lightbox')).to_be_hidden()
                    results.append({'class':'CHROME_FIXTURE','density':label,'width':390,'nonoverlap':'PASS','lightbox':'PASS','no_implicit_shelf_open':'PASS'})
                    row.locator('.file-name').click(position={'x':2,'y':2})
                assert not errors,errors
                (out/'results.json').write_text(json.dumps(results,indent=2)); print(json.dumps(results,indent=2))
                browser.close()
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__=='__main__': main()
