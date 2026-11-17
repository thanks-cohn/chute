"""Isolated Phase 1 streaming adapter over the existing authorized file engine."""
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, ProxyHandler, build_opener
from chute.explorer import Explorer, RootGrant, Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer
from chute.store import Store

ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'

class MediaAPITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.file = self.root/'movie.webm'
        with self.file.open('wb') as file:
            file.write(b'0123456789')
            file.truncate(3*1024**3) # sparse, never materialized in RAM or copied
        self.engine = Explorer([RootGrant(self.root)])
        self.session = Session(ORIGIN)
        self.server = ChuteServer(('127.0.0.1',0),Store(self.root/'history'))
        self.adapter = self.server.explorer_api = ExplorerAPI(self.engine,self.session)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'
        self.opener = build_opener(ProxyHandler({}))
        root = self.engine.execute('roots')['result']['roots'][0]['handle']
        self.row = next(row for row in self.engine.execute('list',handle=root)['result']['entries'] if row['name']=='movie.webm')
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        self.engine.close(); self.temp.cleanup()
    def request(self,path,body=None,headers=None,method=None):
        return self.opener.open(Request(self.base+path,
            json.dumps(body).encode() if body is not None else None,
            {'Origin':ORIGIN,'Authorization':'Bearer '+self.session.token,
             'Content-Type':'application/json',**(headers or {})},method=method),timeout=5)
    def command(self,name,args):
        with self.request('/api/explorer/v1/command',{'command':name,'args':args}) as response:
            return json.load(response)['result']
    def source(self):
        return self.command('media_source',{key:self.row[key] for key in ('handle','identity')})
    def test_sparse_large_file_head_ranges_seek_and_revocation(self):
        source = self.source()
        self.assertEqual(source['size'],3*1024**3)
        with self.request(source['url'],headers={'Authorization':''},method='HEAD') as response:
            self.assertEqual(response.status,200)
            self.assertEqual(int(response.headers['Content-Length']),3*1024**3)
            self.assertEqual(response.headers['Accept-Ranges'],'bytes')
            self.assertEqual(response.read(),b'')
        for value,expected,start in [('bytes=1-4',b'1234',1),('bytes=-5',b'\0'*5,3*1024**3-5),('bytes=2000000000-2000000003',b'\0'*4,2000000000)]:
            with self.request(source['url'],headers={'Range':value,'Authorization':''}) as response:
                self.assertEqual(response.status,206)
                self.assertEqual(int(response.headers['Content-Length']),len(expected))
                self.assertEqual(response.headers['Content-Range'],f'bytes {start}-{start+len(expected)-1}/{3*1024**3}')
                self.assertEqual(response.read(),expected)
        for value in ['bytes=9999999999-','bytes=9-2','bytes=-0','bytes=0-1,3-4','bytes='+('9'*5000)+'-']:
            with self.assertRaises(HTTPError) as raised: self.request(source['url'],headers={'Range':value})
            self.assertEqual(raised.exception.code,416)
            self.assertEqual(raised.exception.headers['Content-Range'],f'bytes */{3*1024**3}')
        self.assertEqual(self.command('release_media',{'ticket':source['ticket']}),{'released':True})
        self.assertNotIn(source['ticket'],self.adapter.media)
        with self.assertRaises(HTTPError) as raised: self.request(source['url'])
        self.assertEqual(raised.exception.code,400)
        self.assertEqual(json.load(raised.exception)['error']['code'],'STREAM_EXPIRED')
    def test_authorization_identity_expiry_limits_and_no_paths(self):
        source = self.source()
        self.assertNotIn(str(self.root),json.dumps(source))
        self.assertNotIn(self.session.token,source['url'])
        for headers in [{'Origin':'https://evil.test'},{'Origin':''},{'Host':'evil.test'}]:
            with self.assertRaises(HTTPError) as raised: self.request(source['url'],headers=headers)
            self.assertEqual(raised.exception.code,403)
        self.file.write_bytes(b'replacement')
        with self.assertRaises(HTTPError) as raised: self.request(source['url'])
        self.assertEqual(json.load(raised.exception)['error']['code'],'FILE_CHANGED')
        self.session.expires = 0
        with self.assertRaises(HTTPError) as raised: self.request(source['url'])
        self.assertEqual(raised.exception.code,403)
    def test_missing_identity_is_rejected_and_thumbnail_uses_same_engine(self):
        with self.assertRaises(HTTPError) as raised:
            self.request('/api/explorer/v1/content',{'handle':self.row['handle']})
        self.assertEqual(json.load(raised.exception)['error']['message'],'Expected a file handle.')
        from PIL import Image
        path = self.root/'picture.png'; Image.new('RGB',(800,400),(235,12,20)).save(path)
        row = self.engine.execute('preview',handle=self.engine.grant_for(self.row['handle']).handle(('picture.png',)))['result']
        with self.request('/api/explorer/v1/content',{key:row[key] for key in ('handle','identity')}|{'thumbnail':True}) as response:
            self.assertEqual(response.headers['Content-Type'],'image/jpeg')
            with Image.open(io.BytesIO(response.read())) as image: self.assertEqual(image.size,(256,128))
    def test_generic_or_missing_mime_uses_narrow_extension_fallback(self):
        from unittest.mock import patch
        from chute.explorer.preview import preview_kind
        for name in ('a.PNG','a.jpeg','a.gif','a.webp','a.bmp'):
            self.assertEqual(preview_kind({'kind':'file','name':name,'mime':'application/octet-stream'}),'image')
            self.assertEqual(preview_kind({'kind':'file','name':name,'mime':None}),'image')
        self.assertEqual(preview_kind({'kind':'file','name':'a.svg','mime':None}),'unavailable')
        with patch('chute.explorer.core.mimetypes.guess_type',return_value=('application/octet-stream',None)):
            row=self.engine.execute('preview',handle=self.row['handle'])['result']
            self.assertEqual(row['mime'],'video/webm')
            self.assertEqual(row['preview'],'video')

    def test_script_client_uses_same_authorized_records_and_ranges(self):
        from tools.chutey_api import Client
        client=Client(ORIGIN,self.session.token,self.server.server_port)
        self.assertEqual(client.command('preview',{'handle':self.row['handle']}),self.engine.execute('preview',handle=self.row['handle'])['result'])
        self.assertEqual(client.media_range(self.row['handle'],'bytes=2-5'),b'2345')
        self.assertFalse(self.adapter.media)
        denied=Client(ORIGIN,'wrong',self.server.server_port)
        with self.assertRaises(HTTPError): denied.command('roots')

    def test_cancelled_active_read_stops_at_chunk_boundary(self):
        from types import SimpleNamespace
        chunks=[]
        source={'revoked':False,'expires':float('inf')}
        def write(data):
            chunks.append(data); source['revoked']=True
        handler=SimpleNamespace(command='GET',headers={'Origin':ORIGIN,'Authorization':'Bearer '+self.session.token},
            send_response=lambda *a:None,send_header=lambda *a:None,end_headers=lambda:None,
            wfile=SimpleNamespace(write=write),connection=SimpleNamespace(settimeout=lambda _:None),close_connection=False)
        before=len(os.listdir('/proc/self/fd')) if os.path.isdir('/proc/self/fd') else None
        self.adapter.content(handler,{key:self.row[key] for key in ('handle','identity')},media=source)
        self.assertEqual(sum(map(len,chunks)),262144)
        self.assertTrue(handler.close_connection)
        if before is not None:self.assertEqual(len(os.listdir('/proc/self/fd')),before)

    def test_large_audio_uses_same_bounded_stream_api(self):
        path=self.root/'large.mp3'
        with path.open('wb') as stream:stream.write(b'audio');stream.truncate(96*1024**2)
        grant=self.engine.grant_for(self.row['handle'])
        row=self.engine.execute('preview',handle=grant.handle(('large.mp3',)))['result']
        self.assertEqual(row['preview'],'audio')
        source=self.command('media_source',{key:row[key] for key in ('handle','identity')})
        with self.request(source['url'],headers={'Range':'bytes=0-4'}) as response:
            self.assertEqual(response.status,206);self.assertEqual(response.read(),b'audio')
        self.command('release_media',{'ticket':source['ticket']})

    def test_saved_location_is_scoped_to_store_not_client_path(self):
        item=self.server.store.add_stream('saved.txt',io.BytesIO(b'saved proof'),11,mime='text/plain')
        row=self.command('locate_saved',{'id':item.id})
        self.assertEqual(row['kind'],'file');self.assertNotIn(str(self.root),json.dumps(row))
        parent=self.command('list',{'handle':row['parent']})
        self.assertIn(row['handle'],[file['handle'] for file in parent['entries']])
        with self.request('/api/explorer/v1/content',{key:row[key] for key in ('handle','identity')}) as response:
            self.assertEqual(response.read(),b'saved proof')
        with self.assertRaises(HTTPError):self.command('locate_saved',{'id':item.id,'path':str(self.root)})
        with self.assertRaises(HTTPError):self.command('locate_saved',{'id':'0'*32})

    def test_external_actions_require_session_and_origin_before_dispatch(self):
        from unittest.mock import patch
        with patch('chute.explorer.file_actions.external_action') as dispatch:
            for action in ('open','reveal'):
                for headers in ({'Authorization':'Bearer wrong'},{'Origin':'https://evil.test'}):
                    with self.assertRaises(HTTPError) as error:
                        self.request('/api/explorer/v1/command',{'command':action,'args':{key:self.row[key] for key in ('handle','identity')}},headers=headers)
                    self.assertEqual(error.exception.code,403)
            dispatch.assert_not_called()

    def test_ticket_cap_and_idempotent_release(self):
        sources=[self.source() for _ in range(32)]
        with self.assertRaises(HTTPError) as raised: self.source()
        self.assertEqual(json.load(raised.exception)['error']['code'],'BUSY')
        for _ in range(2): self.command('release_media',{'ticket':sources[0]['ticket']})
        self.assertTrue(self.source()['ticket'])

    def test_highlights_authorization_receipts_and_text_pages(self):
        raw='é😀 actual selection\nline'.encode()
        def send(headers=None):
            return self.opener.open(Request(self.base+'/api/explorer/v1/highlights',raw,{'Origin':ORIGIN,'Authorization':'Bearer '+self.session.token,'Content-Type':'text/plain;charset=utf-8','X-Chute-Capture-ID':'a'*32,**(headers or {})}),timeout=5)
        for headers in ({'Origin':'https://evil.test'},{'Authorization':'Bearer wrong'}):
            with self.assertRaises(HTTPError):send(headers)
        self.assertFalse((self.server.store.root/'highlights.sqlite3').exists())
        with send() as r:first=json.load(r)
        self.assertEqual(first['state'],'COMMITTED');self.assertEqual(first['input_size'],len(raw))
        self.server.store.remove('a'*32)
        with send() as r:repeated=json.load(r)
        self.assertEqual(first['capture_id'],repeated['capture_id']);self.assertFalse(repeated['file']['active'])
        page=self.command('saved_text_page',{'id':'a'*32,'offset':0,'limit':65536})
        self.assertEqual(page['text'],first['received_at']+'\né😀 actual selection\nline')
        row=self.command('locate_saved',{'id':'a'*32});self.assertEqual(row['highlight']['capture_id'],'a'*32)
        self.assertNotIn('path',row['highlight'])
        with self.assertRaises(HTTPError):self.command('saved_text_page',{'id':'a'*32,'path':'/etc/passwd'})

    def test_job_http_authority_and_accepted_is_not_completed(self):
        path=self.root/'copy.txt';path.write_bytes(b'actual copy')
        grant=self.engine.grant_for(self.row['handle']);row=self.engine.execute('stat',handle=grant.handle(('copy.txt',)))['result']
        args={'id':'c'*32,'kind':'local_to_live','handle':row['handle'],'identity':row['identity']}
        for headers in ({'Authorization':'Bearer wrong'},{'Origin':'https://evil.test'}):
            with self.assertRaises(HTTPError):self.request('/api/explorer/v1/command',{'command':'transfer_start','args':args},headers=headers)
        self.assertIsNone(self.adapter.jobs)
        job=self.command('transfer_start',args)
        import time
        for _ in range(300):
            if job['state'] not in {'accepted','running'}:break
            time.sleep(.01);job=self.command('transfer_status',{'id':job['id']})
        self.assertEqual(job['state'],'COMMITTED')
        self.assertEqual(job['receipt']['file']['id'],'c'*32)
        self.assertEqual(self.server.store.get('c'*32)[1].read_bytes(),b'actual copy')
        repeated=self.command('transfer_start',args);self.assertEqual(repeated['receipt'],job['receipt'])
        self.assertEqual(len(self.server.store.list()),1)

    def test_export_survives_same_origin_authenticated_session_renewal(self):
        job=self.command('history_export_create',{'scope':'all','timezone':'UTC'})
        import time
        for _ in range(300):
            if job['state']=='ready':break
            time.sleep(.01);job=self.command('history_export_status',{'id':job['id']})
        self.session=Session(ORIGIN);self.adapter=self.server.explorer_api=ExplorerAPI(self.engine,self.session)
        renewed=self.command('history_export_status',{'id':job['id']})
        self.assertEqual(renewed['state'],'ready')
        self.assertEqual(renewed['url'],job['url'])
        self.command('history_export_cancel',{'id':job['id']})
        self.server.history_exports.close()
