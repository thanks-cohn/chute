"""Request 3A real Chromium HTTP fixture; enrollment simulated, no installation."""
import importlib.util,io,json,shutil,sys,tempfile,threading
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
spec=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/verify-phase1-browser.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
from chute.server import ChuteServer
from chute.store import Store
from PIL import Image
from playwright.sync_api import sync_playwright,expect

def main():
 out=Path('/tmp/chutey-request3a');out.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory() as temp:
  store=Store(Path(temp));image=io.BytesIO();Image.new('RGB',(300,140),'yellow').save(image,'PNG');data=image.getvalue()
  items=[store.add_stream('long image name with accents é and lots of metadata '+str(i)+'.png',io.BytesIO(data),len(data),mime='image/png') for i in range(120)]
  server=ChuteServer(('127.0.0.1',17891),store);server.RequestHandlerClass=f.QuietHandler
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':590});context.add_init_script(f.INIT)
    context.route('**/api/browse?**',lambda route:route.fulfill(response=route.fetch(url=route.request.url.replace('limit=30','limit=200'))))
    page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://127.0.0.1:17891/popup.html');expect(page.locator('.chutey-gallery-tile')).to_have_count(120)
    def scroll_check():
     return page.evaluate('''() => ({tracks:[...document.querySelectorAll('*')].filter(n=>n.scrollHeight>n.clientHeight+2 && ['scroll','auto'].includes(getComputedStyle(n).overflowY)).map(n=>n.tagName+'#'+n.id),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})''')
    assert scroll_check()=={'tracks':['HTML#'],'overflow':False},scroll_check()
    page.screenshot(path=str(out/'popup-closed.png'))
    page.locator('.settings-panel > summary').click()
    assert scroll_check()=={'tracks':['HTML#'],'overflow':False},scroll_check()
    page.screenshot(path=str(out/'popup-settings-open.png'))
    page.set_viewport_size({'width':312,'height':590})
    assert scroll_check()=={'tracks':['HTML#'],'overflow':False},scroll_check()
    page.screenshot(path=str(out/'popup-settings-125-percent-equivalent.png'))
    page.set_viewport_size({'width':390,'height':590})
    page.locator('#clear-chute').scroll_into_view_if_needed();expect(page.locator('#clear-chute')).to_be_in_viewport()
    page.keyboard.press('End');page.locator('.chutey-gallery-tile').last.scroll_into_view_if_needed()
    assert page.evaluate('document.scrollingElement.scrollTop')>1000
    for step in range(4):
     page.locator('#gallery-density').evaluate('(n,v)=>{n.value=v;n.dispatchEvent(new Event("input"))}',str(step))
     boxes=page.locator('.chutey-gallery-tile').evaluate_all('ns=>ns.map(n=>{let r=n.getBoundingClientRect();return [r.width,r.height]})')
     assert all(h>45 and abs(w-h)<1 for w,h in boxes),(step,boxes[-1])
    page.locator('.settings-panel > summary').click()
    row=page.locator('.chutey-gallery-tile').first;row.click();expect(page.locator('.chutey-lightbox')).to_be_visible()
    expect(page.locator('.chutey-lightbox-image')).to_have_js_property('naturalWidth',300)
    assert page.locator('.chutey-lightbox-close').count()==0 and page.get_by_role('button',name='Expand',exact=True).count()==0
    page.keyboard.press('ArrowRight');expect(page.locator('.chutey-lightbox-count')).to_have_text('2 / 120')
    page.keyboard.press('Escape');expect(page.locator('.chutey-lightbox')).to_be_hidden()
    row.click();page.locator('.chutey-lightbox-image').click();expect(page.locator('.chutey-lightbox')).to_be_hidden()
    target=row.get_attribute('data-chute-id');day=items[0].created_at[:10]
    row.click(button='right');expect(page.get_by_role('menuitem',name='Trash It!')).to_be_visible()
    assert len(store.list())==120
    page.get_by_role('menuitem',name='Trash It!').click();expect(page.locator('.chutey-gallery-tile')).to_have_count(119)
    assert store.get(target) and len(store.list())==119
    page.evaluate('(day)=>{selectedDay=day;return resetHistory()}',day)
    archived=page.locator('[data-chute-id="'+target+'"]');expect(archived).to_be_visible()
    archived.focus();page.keyboard.press('Shift+F10');page.get_by_role('menuitem',name='Trash It!').click()
    expect(page.locator('[data-chute-id="'+target+'"]')).to_be_hidden();assert store.get(target)
    page.goto('http://127.0.0.1:17891/shelf.html')
    for width in (390,600):
     page.set_viewport_size({'width':width,'height':700})
     label=page.locator('.ready .file-state').first;expect(label).to_have_text('DRAG ME!')
     assert label.evaluate('n=>n.getClientRects().length')==1
     assert page.locator('.file-tools').first.evaluate('n=>n.getBoundingClientRect().right<=innerWidth')
     page.screenshot(path=str(out/('shelf-'+str(width)+'.png')))
    assert not errors,errors
    (out/'results.json').write_text(json.dumps({'scroll_surfaces':'one document; settings, gallery no inner scroll','densities':'120 full square cards in all four layouts','preview':'click, Escape, image-collapse, arrows; no X/Expand','trash':'live removed; archived presentation hidden; original preserved','shelf':'390 and 600px whole DRAG ME!, controls reachable'},indent=2))
    browser.close()
  finally:server.shutdown();server.server_close();thread.join()
 print('PASS Request3A browser: one scrollbar, settings reachability, 120 cards, lightbox, scoped Trash It!, Shelf labels')
if __name__=='__main__':main()
