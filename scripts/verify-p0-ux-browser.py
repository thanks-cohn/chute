"""Real Chromium UX fixture; Chrome enrollment mocked, real worker/guarded files.
This is NOT owner-installed Windows acceptance or native clipboard testing.
"""
import importlib.util,io,json,mimetypes,os,shutil,sys,tempfile,threading
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
spec=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/verify-development1-browser.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
from chute.explorer import Explorer,RootGrant,Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer
from chute.store import Store
from PIL import Image
from playwright.sync_api import sync_playwright,expect

def main():
 out=Path(os.environ.get('CHUTE_UX_EVIDENCE','/tmp/chutey-p0-ux'));out.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='chutey-p0-ux-') as temp:
  root=Path(temp);approved=root/'approved';approved.mkdir();store=Store(root/'store')
  for i,color in enumerate(('red','green','blue')):Image.new('RGB',(280,150),color).save(approved/('%02d-image.png'%i))
  (approved/'unsupported.mkv').write_bytes(b'not a supported media stream');mimetypes.add_type('video/x-matroska','.mkv')
  item=store.add_stream('saved.txt',io.BytesIO(b'kept original'),13,mime='text/plain')
  baseline={p:p.read_bytes() for p in store.history_dir.iterdir()}
  session=Session(f.f.ORIGIN);engine=Explorer([RootGrant(approved)])
  server=ChuteServer(('127.0.0.1',17891),store);server.RequestHandlerClass=f.BrowserOriginFixture;server.explorer_api=ExplorerAPI(engine,session)
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHUTE_TEST_BROWSER') or shutil.which('chromium') or shutil.which('chrome') or r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':700});context.add_init_script(f.f.INIT+'\nwindow.__nativeSessionToken='+json.dumps(session.token)+''';window.__nativeActions=[];const priorNative=chrome.runtime.sendNativeMessage;chrome.runtime.sendNativeMessage=async(h,m)=>{__nativeActions.push(m.action);return priorNative(h,m);};window.__toolbarMessages=[];chrome.runtime.sendMessage=async m=>{__toolbarMessages.push(m);return {ok:true};};''')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:17891/popup.html')
    page.locator('.settings-panel > summary').click()
    expect(page.locator('#restore-ui-defaults')).to_be_visible()
    # Defaults are system only for previously-unset preferences.
    page.wait_for_function('window.ChuteyFileActions?.get().chuteyOpenTarget==="system"')
    expect(page.locator('#toolbar-entry')).to_have_value('popup')
    for mode in ('shelf','popup'):
     page.locator('#toolbar-entry').select_option(mode)
     page.wait_for_function('(mode)=>JSON.parse(localStorage.getItem("test-sync")).chuteToolbarEntry===mode',arg=mode)
    page.locator('[data-file-preference=chuteyOpenTarget]').select_option('chutey')
    page.locator('[data-file-preference=chuteyRevealTarget]').select_option('chutey')
    page.reload();page.locator('.settings-panel > summary').click()
    expect(page.locator('[data-file-preference=chuteyOpenTarget]')).to_have_value('chutey')
    # Restore changes only explicit presentation/interaction preferences.
    page.evaluate('chrome.storage.sync.set({sentinelGrant:"KEEP",connectionCredential:"KEEP",chuteyExplorerThumbnails:false})')
    page.once('dialog',lambda dialog:dialog.accept());page.locator('#restore-ui-defaults').click()
    page.wait_for_function('window.ChuteyFileActions.get().chuteyOpenTarget==="system"')
    assert page.evaluate('JSON.parse(localStorage.getItem("test-sync")).chuteyExplorerThumbnails') is True
    assert page.evaluate('JSON.parse(localStorage.getItem("test-sync")).sentinelGrant')=='KEEP'
    assert page.evaluate('JSON.parse(localStorage.getItem("test-sync")).connectionCredential')=='KEEP'
    assert all(p.read_bytes()==v for p,v in baseline.items()) and store.get(item.id)[1].read_bytes()==b'kept original'
    # Inspect each relevant surface's real acknowledged performance UI.
    for surface in ('popup.html','shelf.html'):
     page.goto('http://127.0.0.1:17891/'+surface)
     page.locator('.settings-panel > summary' if surface.startswith('popup') else '.chutey-presentation-options > summary').click()
     for mode in ('efficiency','balanced','turbo'):
      page.locator('#performance-mode').select_option(mode)
      expect(page.locator('#performance-status')).to_contain_text(mode)
     page.screenshot(path=str(out/(surface+'-settings.png')))
    # Playback feature consent is separate from folder scope and does not reopen picker.
    movie=page.locator('#movie-media-allowed');initial_movie=movie.is_checked()
    movie.set_checked(not initial_movie)
    expect(page.locator('#movie-media-status')).to_contain_text('enabled' if not initial_movie else 'disabled')
    assert not page.evaluate('__nativeActions.some(action=>action.includes("select_folder"))')
    movie.set_checked(initial_movie)
    # Set deliberate Chutey preference for image preview (system is first-use default).
    page.locator('[data-file-preference=chuteyOpenTarget]').select_option('chutey')
    page.locator('.chutey-presentation-options > summary').click()
    page.get_by_role('tab',name='File Explorer',exact=True).click()
    expect(page.locator('.ex-row')).to_have_count(4)
    for width,height in ((390,700),(300,400)):
     page.set_viewport_size({'width':width,'height':height})
     page.locator('.ex-row',has_text='00-image.png').dblclick()
     image=page.locator('.ex-preview-body img');expect(image).to_have_js_property('naturalWidth',280)
     image.click()
     page.keyboard.press('ArrowRight');expect(page.locator('.ex-preview strong')).to_have_text('01-image.png')
     page.keyboard.press('ArrowRight');expect(page.locator('.ex-preview strong')).to_have_text('02-image.png')
     page.keyboard.press('ArrowLeft')
     expect(page.locator('.ex-preview strong')).to_have_text('01-image.png')
     if page.get_by_role('button',name='Restore preview height',exact=True).count():page.get_by_role('button',name='Restore preview height',exact=True).click()
     page.get_by_role('button',name='Expand preview',exact=True).click()
     image.click();page.keyboard.press('ArrowRight');expect(page.locator('.ex-preview strong')).to_have_text('02-image.png')
     page.locator('.ex-more-settings summary').click();menu=page.locator('.ex-advanced-actions');expect(menu).to_be_visible()
     r=menu.bounding_box();assert r and r['x']>=0 and r['y']>=0 and r['x']+r['width']<=width+1 and r['y']+r['height']<=height+1,r
     control=menu.get_by_label('Show image thumbnails',exact=True);control.scroll_into_view_if_needed()
     assert control.evaluate('n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===n||n.contains(hit)}')
     control.uncheck();expect(control).not_to_be_checked();control.check()
     page.screenshot(path=str(out/('folder-access-'+str(width)+'x'+str(height)+'.png')))
     page.keyboard.press('Escape');expect(menu).not_to_be_visible()
     image.click();page.keyboard.press('ArrowLeft');expect(page.locator('.ex-preview strong')).to_have_text('01-image.png')
     page.get_by_role('button',name='Close preview',exact=True).click()
    page.locator('.ex-row',has_text='unsupported.mkv').click(button='right')
    page.get_by_role('menuitem',name='Preview',exact=True).click()
    expect(page.locator('.ex-pinned-body')).to_contain_text('Preview unavailable for this media format')
    expect(page.locator('.ex-pinned-body video,.ex-pinned-body audio')).to_have_count(0)
    assert not errors,errors
    report={'scope':'Real browser and guarded worker; native Chrome enrollment mocked','settings':'restore scoped to UI/performance, first-use system action defaults, explicit Chutey preserved, persisted toolbar setting','performance_modes':'worker acknowledgements for Efficiency/Balanced/Turbo in popup and Shelf','folder_access':'hit-tested top layer above expanded preview at 390x700 and 300x400, controls clickable, Escape closes','keyboard':'image center click Right/Right/Left and after expand, no extra arrow button click','data':'History, original bytes and unrelated grants/credential sentinel unchanged'}
    (out/'results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));browser.close()
  finally:server.shutdown();server.server_close();thread.join();engine.close()
if __name__=='__main__':main()
