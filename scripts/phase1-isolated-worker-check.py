"""Safe candidate entry: ephemeral API self-test only, no install/native registration.

Suitable as a separate PyInstaller test executable on Windows. It never imports
windows_app, opens the owner's files, binds 17891, or registers a Chrome host.
"""
import io
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
            print(json.dumps({'result':'PASS','checks':['temporary approved root','canonical identity','real JPEG thumbnail','8 MiB range fixture','HEAD','ticket release'],
                'installed_worker':'untouched','scope':'isolated API check; not Chrome or sustained playback acceptance'}))
        finally:
            server.shutdown();server.server_close();thread.join();engine.close()
if __name__=='__main__':main()
