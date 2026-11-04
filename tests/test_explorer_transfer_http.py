"""Actual authenticated HTTP/native controller operations on disposable roots."""
import hashlib
import http.client
import json
from pathlib import Path
import secrets
import tempfile
import threading
import unittest
from unittest.mock import patch

from chute.explorer.grant_store import GrantStore
from chute.explorer.native import NativeExplorer
from chute.server import ChuteServer
from chute.store import Store

ORIGIN='chrome-extension://'+'abcdefghijklmnop'*2


class TransferHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.root=Path(self.temp.name)
        (self.root/'approved'/'nested').mkdir(parents=True)
        (self.root/'approved'/'original.txt').write_bytes(b'original\x00bytes')
        self.store=GrantStore(self.root/'protected',protect=lambda value,origin,**kw:value,
            writer=lambda path,value:(path.parent.mkdir(exist_ok=True),path.write_bytes(value)))
        with patch('chute.explorer.native.private_write'):
            self.native=NativeExplorer(store=self.store)
        self.enrolled=patch('chute.native_host._allowed_extension_ids',return_value=[ORIGIN.split('//')[1]])
        self.enrolled.start()
        self.server=ChuteServer(('127.0.0.1',0),Store(self.root/'live'))
        self.server.native_explorer=self.native
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start()
        self.approve(False)

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        for adapter in self.native.adapters.values(): adapter.engine.close()
        self.enrolled.stop(); self.temp.cleanup()

    def approve(self,writable):
        with patch('chute.explorer.native.choose_folder',return_value=str(self.root/'approved')):
            response=self.native.action(ORIGIN,select=True,writable=writable)
        self.token=response['token']
        self.grant=next(iter(self.native.adapter(ORIGIN).engine.grants.values()))
        self.destination=self.grant.handle(('nested',))

    def request(self,route,body,extra=None,origin=ORIGIN):
        connection=http.client.HTTPConnection(*self.server.server_address,timeout=5)
        headers={'Origin':origin,'Authorization':'Bearer '+self.token,'Content-Type':'application/json'}
        headers.update(extra or {})
        connection.request('POST','/api/explorer/v1/'+route,body=body,headers=headers)
        response=connection.getresponse(); result=(response.status,json.loads(response.read())); connection.close()
        return result

    def command(self,name,**args):
        return self.request('command',json.dumps({'command':name,'args':args}))

    def test_binary_exact_destination_hash_journal_restart_and_replay(self):
        self.approve(True)
        operation=secrets.token_hex(16); data=b'tiny\x00original bytes'
        headers={'Content-Type':'application/octet-stream','X-Chute-Destination':self.destination,
                 'X-Chute-Filename':'tiny.txt','X-Chute-Operation':operation}
        status,receipt=self.request('receive',data,headers)
        self.assertEqual(status,200,receipt); self.assertEqual(receipt['state'],'COMMITTED')
        self.assertEqual((self.root/'approved'/'nested'/'tiny.txt').read_bytes(),data)
        self.assertEqual(receipt['sha256'],hashlib.sha256(data).hexdigest())
        self.assertEqual(self.request('receive',data,headers)[0],400)
        self.assertFalse((self.root/'approved'/'nested'/'tiny (1).txt').exists())
        with patch('chute.explorer.native.private_write'):
            restored=NativeExplorer(store=self.store)
        try:
            response=restored.action(ORIGIN,select=False)
            self.assertFalse(response['read_only'])
            reconciled=restored.state(ORIGIN,'reconcile_transfer',{'operation_id':operation})
            self.assertEqual(reconciled['state'],'COMMITTED')
            (self.root/'approved'/'nested'/'tiny.txt').write_bytes(b'changed')
            self.assertEqual(restored.state(ORIGIN,'reconcile_transfer',{'operation_id':operation})['state'],'UNCERTAIN')
        finally:
            for adapter in restored.adapters.values(): adapter.engine.close()

    def test_read_only_origin_and_genuine_live_roundtrip(self):
        operation=secrets.token_hex(16)
        headers={'Content-Type':'application/octet-stream','X-Chute-Destination':self.destination,
                 'X-Chute-Filename':'tiny.txt','X-Chute-Operation':operation}
        self.assertEqual(self.request('receive',b'x',headers)[0],400)
        self.assertEqual(self.request('receive',b'x',headers,origin='https://untrusted.test')[0],403)
        self.assertFalse((self.root/'approved'/'nested'/'tiny.txt').exists())
        rows=self.command('list',handle=self.grant.id)[1]['result']['entries']
        row=next(row for row in rows if row['name']=='original.txt')
        prepared=self.command('prepare_export',handle=row['handle'],identity=row['identity'])[1]['result']
        exported=self.command('export_to_live',capability=prepared['capability'])[1]['result']
        self.assertEqual(exported['state'],'COMMITTED')
        self.assertEqual(self.command('export_to_live',capability=prepared['capability'])[0],400)
        self.approve(True)
        status,receipt=self.command('receive_from_live',id=exported['file']['id'],destination=self.destination,operation_id=secrets.token_hex(16))
        self.assertEqual(status,200,receipt)
        self.assertEqual((self.root/'approved'/'nested'/'original.txt').read_bytes(),b'original\x00bytes')
        self.assertEqual(receipt['result']['sha256'],exported['sha256'])
