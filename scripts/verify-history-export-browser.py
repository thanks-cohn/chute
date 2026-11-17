"""Shelf export integration; one real browser download, real authenticated API."""
import importlib.util,io,json,shutil,sys,tempfile,threading,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
spec=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/verify-development1-browser.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
from chute.explorer import Explorer,RootGrant,Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer
from chute.store import Store
from playwright.sync_api import sync_playwright,expect

def main():
 out=Path('/tmp/chutey-request3c');out.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory() as temp:
  root=Path(temp);approved=root/'approved';approved.mkdir();store=Store(root/'store');item=store.add_stream('é.txt',io.BytesIO(b'proof'),5,mime='text/plain');store.remove(item.id);store.recall(item.id)
  baseline={p:p.read_bytes() for p in store.history_dir.iterdir()};engine=Explorer([RootGrant(approved)]);session=Session(f.f.ORIGIN)
  server=ChuteServer(('127.0.0.1',17891),store);server.RequestHandlerClass=f.BrowserOriginFixture;server.explorer_api=ExplorerAPI(engine,session)
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':390,'height':700},accept_downloads=True)
    context.add_init_script(f.f.INIT+'\nwindow.__nativeSessionToken='+json.dumps(session.token)+''';window.__downloadChanges=[];window.chrome.downloads={onChanged:{addListener:fn=>__downloadChanges.push(fn)},download:async options=>{window.__downloadOptions=options;const a=document.createElement('a');a.href=options.url;a.download=options.filename;document.body.append(a);a.click();a.remove();return 41;},cancel:async()=>{},search:async()=>[{id:41,state:'in_progress'}]};''')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:17891/shelf.html')
    page.locator('.chutey-presentation-options summary').click();page.locator('#export-history').scroll_into_view_if_needed()
    with page.expect_download() as download:
     page.get_by_role('button',name='Export History',exact=True).click()
    file=download.value;file.save_as(out/'one-history.zip')
    with zipfile.ZipFile(out/'one-history.zip') as z:
     assert z.testzip() is None;assert len(z.namelist())==3;assert len(json.loads(z.read('history.json'))['events'])==3
    page.reload();page.locator('.chutey-presentation-options summary').click()
    expect(page.locator('#export-status')).to_contain_text('Downloading one ZIP')
    page.evaluate('__downloadChanges.forEach(fn=>fn({id:41,state:{current:"complete"}}))')
    expect(page.locator('#export-status')).to_contain_text('Downloaded one ZIP · 3 events')
    page.screenshot(path=str(out/'shelf-export.png'))
    page.locator('#export-scope').select_option('range');page.locator('#export-from').fill('2026-11-20');page.locator('#export-to').fill('2026-11-01');page.locator('#export-history').click()
    expect(page.locator('#export-status')).to_contain_text('valid From/To')
    page.goto('http://127.0.0.1:17891/popup.html');assert page.locator('#history-export').count()==0
    assert all(p.read_bytes()==v for p,v in baseline.items());assert not errors,errors
    browser.close()
  finally:
   if hasattr(server,'history_exports'):server.history_exports.close()
   server.shutdown();server.server_close();thread.join();engine.close()
 print('PASS 3C Shelf only: real single ZIP download, CSV+JSON, event timeline, local scope validation, unchanged History')
if __name__=='__main__':main()
