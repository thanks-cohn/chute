"""Request 3D acceptance in HTTP Chromium fixture, actual saved daily bytes."""
import importlib.util,io,json,shutil,sys,tempfile,threading
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
spec=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/verify-development1-browser.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
from chute.explorer import Explorer,RootGrant,Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer
from chute.store import Store
from playwright.sync_api import sync_playwright,expect

def main():
 out=Path('/tmp/chutey-request3d');out.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory() as temp:
  root=Path(temp);approved=root/'approved';approved.mkdir();store=Store(root/'store');engine=Explorer([RootGrant(approved)]);session=Session(f.f.ORIGIN)
  server=ChuteServer(('127.0.0.1',17891),store);server.RequestHandlerClass=f.BrowserOriginFixture;server.explorer_api=ExplorerAPI(engine,session)
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':390,'height':590})
    context.add_init_script(f.f.INIT+'\nif(location.origin==="http://127.0.0.1:17891")chrome.storage.sync.set({chuteyOpenTarget:"chutey",chuteyRevealTarget:"chutey"});window.__nativeSessionToken='+json.dumps(session.token)+';')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:17891/popup.html')
    page.evaluate("localStorage.setItem('test-sync',JSON.stringify({chuteyPresentation:{version:1,animation:true,color:'#123456'}}))")
    page.reload();expect(page.locator('html')).to_have_attribute('data-chutey-background-animation','false');assert page.locator('[data-presentation-animation]').count()==0
    page.add_script_tag(path=str(ROOT/'extension/background-highlights.js'))
    text='é😀 first line\n<script>window.__injected=true</script>\n'+('A very long line '+('Z'*100)+'\n')*2200
    first=page.evaluate('(text)=>ChuteyHighlights.capture(text,"https://example.test/source")',text)
    second=page.evaluate('(text)=>ChuteyHighlights.capture(text,"https://example.test/source")',"Second selection é😀\nnext line")
    daily=store.highlights.lookup(first['capture_id'])['path'];expected=(first['received_at']+'\n'+text+'\n\n'+second['received_at']+'\nSecond selection é😀\nnext line').encode()
    # text ends with one newline; the entry boundary normalizes it to exactly 3.
    assert daily.read_bytes()==expected
    page.reload();row=page.locator('[data-chute-id="'+first['capture_id']+'"]');row.click()
    reader=page.locator('.chutey-lightbox-reader pre');expect(reader).to_contain_text('<script>window.__injected=true</script>')
    assert not page.evaluate('Boolean(window.__injected)');assert reader.evaluate('n=>n.scrollWidth<=n.clientWidth')
    reader.focus();page.keyboard.press('ArrowDown');page.wait_for_function('document.querySelector(".chutey-lightbox-reader pre").scrollTop>0')
    reader.hover();page.mouse.wheel(0,400);page.screenshot(path=str(out/'popup-text-reader.png'))
    page.locator('[data-text-next]').click();expect(page.locator('[data-text-position]')).not_to_contain_text('Bytes 0–')
    page.keyboard.press('Escape');expect(page.locator('.chutey-lightbox')).to_be_hidden()
    row.click(button='right');page.get_by_role('menuitem',name='Trash It!').click();expect(row).to_have_count(0);assert daily.read_bytes()==expected
    page.goto('http://127.0.0.1:17891/shelf.html');archived=page.locator('[data-chute-id="'+first['capture_id']+'"]');expect(archived).to_be_visible()
    # Archived captures need a GO TO without having to recall them first.
    archived.locator('.open').click();expect(page.get_by_role('tab',name='File Explorer',exact=True)).to_have_attribute('aria-selected','true')
    expect(page.locator('.ex-preview-body pre')).to_contain_text('é😀 first line')
    expect(page.locator('.ex-row[aria-selected=true] .ex-name')).to_contain_text('Chutey Highlights')
    page.locator('.chutey-presentation-options > summary').click();toggle=page.get_by_label('Animate background behind Chutey images',exact=True);expect(toggle).not_to_be_checked();toggle.check()
    expect(page.locator('html')).to_have_attribute('data-chutey-background-animation','true')
    popup=context.new_page();popup.goto('http://127.0.0.1:17891/popup.html');expect(popup.locator('html')).to_have_attribute('data-chutey-background-animation','true')
    toggle.uncheck();expect(popup.locator('html')).to_have_attribute('data-chutey-background-animation','false')
    toggle.check();popup.emulate_media(reduced_motion='reduce')
    assert popup.locator('.file-icon').first.evaluate('n=>getComputedStyle(n,"::before").animationName')=='none'
    popup.reload();expect(popup.locator('html')).to_have_attribute('data-chutey-background-animation','true')
    assert not errors,errors;browser.close()
  finally:server.shutdown();server.server_close();thread.join();engine.close()
 print('PASS 3D: exact received-at daily bytes, Unicode, two blank lines, popup paged reader, archived GO TO, default-OFF migration, Shelf opt-in across tabs, reduced motion')
if __name__=='__main__':main()
