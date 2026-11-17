"""Safe candidate entry: ephemeral API self-test only, no install/native registration.

Suitable as a separate PyInstaller test executable on Windows. It never imports
windows_app, opens the owner's files, binds 17891, or registers a Chrome host.
"""
import io
import time
import json
from pathlib import Path
import tempfile
import threading
from urllib.request import Request, ProxyHandler, build_opener
from PIL import Image
from chute.explorer import Explorer, RootGrant, Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer
from chute.store import Store

ORIGIN='chrome-extension://abcdefghijklmnopabcdefghijklmnop'

def main():
    with tempfile.TemporaryDirectory(prefix='chutey-phase1-isolated-') as temp:
        root=Path(temp); folder=root/'approved';folder.mkdir()
        Image.new('RGB',(400,200),(200,40,60)).save(folder/'picture.png')
        video=folder/'range-fixture.webm'
        with video.open('wb') as file:file.write(b'0123456789');file.truncate(8*1024*1024)
        engine=Explorer([RootGrant(folder)]);session=Session(ORIGIN)
        server=ChuteServer(('127.0.0.1',0),Store(root/'history'))
        server.explorer_api=ExplorerAPI(engine,session)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        opener=build_opener(ProxyHandler({}));base=f'http://127.0.0.1:{server.server_port}'
        def request(path,body=None,headers=None,method=None):
            return opener.open(Request(base+path,json.dumps(body).encode() if body is not None else None,
                {'Origin':ORIGIN,'Authorization':'Bearer '+session.token,'Content-Type':'application/json',**(headers or {})},method=method),timeout=5)
        def command(name,args=None):
            with request('/api/explorer/v1/command',{'command':name,'args':args or {}}) as response:
                receipt=json.load(response)
            assert receipt['state']=='completed',receipt.get('error',{}).get('code')
            return receipt['result']
        try:
            folder_handle=command('roots')['roots'][0]['handle']
            rows=command('list',{'handle':folder_handle})['entries']
            picture=next(row for row in rows if row['name']=='picture.png')
            meta=command('preview',{'handle':picture['handle']})
            assert picture['identity']==meta['identity'] and meta['preview']=='image'
            with request('/api/explorer/v1/content',{key:meta[key] for key in ('handle','identity')}|{'thumbnail':True}) as response:
                with Image.open(io.BytesIO(response.read())) as image:assert image.size==(256,128)
            row=next(row for row in rows if row['name']=='range-fixture.webm')
            media=command('media_source',{key:row[key] for key in ('handle','identity')})
            with request(media['url'],headers={'Range':'bytes=2-5'}) as response:
                assert response.status==206 and response.read()==b'2345'
                assert response.headers['Content-Range']=='bytes 2-5/8388608'
            with request(media['url'],method='HEAD') as response:assert response.read()==b''
            command('release_media',{'ticket':media['ticket']})
            assert not server.explorer_api.media
            # First-use enrollment has only the known Store root, no external
            # folder picker, writes, native registration or installed data.
            from chute.explorer import native as authority
            from chute import native_host
            prior_write,prior_ids=authority.private_write,native_host._allowed_extension_ids
            try:
                authority.private_write=lambda *args:None
                native_host._allowed_extension_ids=lambda:[ORIGIN.split('//')[1]]
                controller=authority.NativeExplorer(store=False,saved_store=server.store)
                own=controller.action(ORIGIN,select=False)
                assert own['scope']=='saved_store' and own['read_only']
                controller.adapter(ORIGIN).engine.close()
            finally:authority.private_write,native_host._allowed_extension_ids=prior_write,prior_ids
            # Prove new dynamically reached modules/timezone data in the EXE.
            export=command('history_export_create',{'scope':'all','timezone':'America/Chicago'})
            for _ in range(200):
                if export['state'] not in {'accepted','running'}:break
                time.sleep(.01);export=command('history_export_status',{'id':export['id']})
            assert export['state']=='ready',export
            with request(export['url']) as response:
                import zipfile
                with zipfile.ZipFile(io.BytesIO(response.read())) as archive:
                    assert archive.testzip() is None and len(archive.namelist())==3
            command('history_export_cancel',{'id':export['id']})
            raw='Packaged é😀 highlight'.encode()
            with opener.open(Request(base+'/api/explorer/v1/highlights',raw,{'Origin':ORIGIN,'Authorization':'Bearer '+session.token,'Content-Type':'text/plain;charset=utf-8','X-Chute-Capture-ID':'a'*32}),timeout=10) as response:
                capture=json.load(response)
            assert capture['state']=='COMMITTED'
            assert command('saved_text_page',{'id':'a'*32})['text'].endswith('Packaged é😀 highlight')
            job=command('transfer_start',{'id':'b'*32,'kind':'local_to_live','handle':picture['handle'],'identity':picture['identity']})
            for _ in range(300):
                if job['state'] not in {'accepted','running'}:break
                time.sleep(.01);job=command('transfer_status',{'id':job['id']})
            assert job['state']=='COMMITTED',job
            print(json.dumps({'result':'PASS','checks':['temporary approved root','canonical identity','real JPEG thumbnail','8 MiB range fixture','HEAD','ticket release','single ZIP64 export/timezone data','daily UTF-8 highlight','bounded text page','verified asynchronous copy','first-use enrolled Store-only scope'],
                'installed_worker':'untouched','scope':'isolated API check; not Chrome or sustained playback acceptance'}))
        finally:
            server.shutdown();server.server_close();thread.join();engine.close()
if __name__=='__main__':main()
