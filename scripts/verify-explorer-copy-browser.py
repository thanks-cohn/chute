"""CHROME_FIXTURE: real UI/native engine/Store copy paths; no OS consent or site proof."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
from unittest.mock import patch

from playwright.sync_api import sync_playwright, expect

spec=importlib.util.spec_from_file_location('browser_fixture',Path(__file__).with_name('verify-explorer-browser.py'))
fixture=importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)
from chute.explorer.native import NativeExplorer

ORIGIN='chrome-extension://'+'abcdefghijklmnop'*2


def main():
    out=Path('/tmp/chute-copy-browser');out.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='chute-copy-ui-') as temp:
        root=Path(temp); (root/'approved'/'nested').mkdir(parents=True)
        original=b'original local source\x00bytes'
        (root/'approved'/'source.txt').write_bytes(original)
        with patch('chute.explorer.native.private_write'):
            native=NativeExplorer(store=False)
        with patch('chute.native_host._allowed_extension_ids',return_value=[ORIGIN.split('//')[1]]),patch('chute.explorer.native.choose_folder',return_value=str(root/'approved')):
            session=native.action(ORIGIN,select=True,writable=True)
        server=fixture.ChuteServer(('127.0.0.1',17891),fixture.Store(root/'live'))
        server.RequestHandlerClass=fixture.FixtureHandler;server.native_explorer=native
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with sync_playwright() as playwright:
                browser=playwright.chromium.launch(executable_path=os.environ.get('CHUTE_TEST_CHROME') or shutil.which('chromium') or playwright.chromium.executable_path,
                    headless=True,args=['--no-sandbox'])
                context=browser.new_context(viewport={'width':390,'height':800})
                context.add_init_script('window.__session='+json.dumps(session)+';')
                context.add_init_script("""window.__relays=[];window.chrome={storage:{local:{get:async d=>d,set:async()=>{},remove:async()=>{}},sync:{get:async d=>d},session:{get:async d=>d,remove:async()=>{}},onChanged:{addListener(){}}},runtime:{sendNativeMessage:async()=>({...window.__session,explorer_protocol:'1.1'}),sendMessage:async value=>{window.__relays.push(value);return {};},onMessage:{addListener(){}},connectNative(){throw Error('fixture')}}};""")
                context.route('http://127.0.0.1:17891/api/explorer/**',lambda route:route.fulfill(response=route.fetch(headers={**route.request.headers,'origin':ORIGIN})))
                page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto('http://127.0.0.1:17891/shelf.html');page.get_by_role('tab',name='File Explorer',exact=True).click()
                source=page.locator('.ex-row',has_text='source.txt');source.wait_for()
                source.click();page.get_by_role('button',name='Copy to Live',exact=True).click()
                expect(page.locator('.ex-status')).to_contain_text('Original files verified in Live')
                items=server.store.list();assert len(items)==1
                item=items[0];assert server.store.get(item.id)[1].read_bytes()==original
                token=source.evaluate("""node=>{const dataTransfer=new DataTransfer();node.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));return dataTransfer.getData('application/x-chute-item');}""")
                assert token.startswith('CHUTE_ITEM:')
                from urllib.parse import unquote
                decoded=json.loads(unquote(token[len('CHUTE_ITEM:'):]))
                assert decoded['id']==item.id and decoded['source_kind']=='local_explorer'
                assert page.evaluate("window.__relays.some(value=>value.type==='chute-drag-out-start' && value.file.source_kind==='local_explorer')")
                folder=page.locator('.ex-row',has_text='nested')
                folder.evaluate("""node=>{const dataTransfer=new DataTransfer();dataTransfer.items.add(new File(['incoming actual bytes'],'incoming.txt',{type:'text/plain'}));node.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));}""")
                expect(page.locator('.ex-status')).to_contain_text('Verified 1 saved copy/copies.')
                assert (root/'approved'/'nested'/'incoming.txt').read_bytes()==b'incoming actual bytes'
                assert not (root/'approved'/'incoming.txt').exists()
                folder.evaluate("""(node,token)=>{const dataTransfer=new DataTransfer();dataTransfer.setData('application/x-chute-item',token);node.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));}""",token)
                expect(page.locator('.ex-status')).to_contain_text('Verified 1 saved copy/copies.')
                # Wait for the second actual native publication, not a prior status string.
                page.get_by_role('button',name='Check last copy',exact=True).click()
                expect(page.locator('.ex-status')).to_contain_text('Verified saved copy: source.txt')
                final=(root/'approved'/'nested'/'source.txt').read_bytes();assert final==original
                page.screenshot(path=str(out/'exact-folder-copy.png'))
                page.get_by_role('button',name='Revoke access',exact=True).click()
                expect(page.locator('.ex-status')).to_contain_text('Access revoked')
                expect(page.locator('.ex-row')).to_have_count(0);assert native.adapter(ORIGIN) is None
                assert not errors,errors
                receipt={'class':'CHROME_FIXTURE','native_consent':'injected disposable grant; not Windows picker/DPAPI proof',
                    'copy_to_live':'PASS','typed_existing_relay':'PASS','actual_file_drop_exact_nested_folder':'PASS',
                    'live_drop_exact_nested_folder':'PASS','receipt_revalidation':'PASS','revoke_clears_view':'PASS',
                    'source_sha256':hashlib.sha256(original).hexdigest(),'destination_sha256':hashlib.sha256(final).hexdigest(),
                    'site_delivery':'NOT_TESTED','installed_extension':'NOT_TESTED'}
                (out/'results.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2));browser.close()
        finally:
            server.shutdown();server.server_close();thread.join()
            for adapter in native.adapters.values():adapter.engine.close()


if __name__=='__main__':main()
