"""Tiny Windows-real-FS milestone A proof. No real folders or large fixtures."""
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from chute.explorer import Explorer, RootGrant, Session
from chute.explorer.protocol import ExplorerError


@unittest.skipUnless(os.name == 'nt', 'WINDOWS_REAL_FS: Windows required')
class WindowsBrowseTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='chutey-windows-tiny-')
        self.root=Path(self.temp.name)
        (self.root/'nested'/'empty').mkdir(parents=True)
        (self.root/'nested'/'雪.txt').write_bytes(b'exact fixture bytes')
        self.grant=RootGrant(self.root)
        self.engine=Explorer([self.grant])
    def tearDown(self):
        self.engine.close(); self.temp.cleanup()
    def command(self,name,**args):
        receipt=self.engine.execute(name,**args)
        self.assertEqual(receipt['state'],'completed',receipt)
        return receipt['result']
    def test_browse_parent_stat_and_original_stream(self):
        root=self.command('roots')['roots'][0]['handle']
        folder=self.command('list',handle=root)['entries'][0]
        rows=self.command('list',handle=folder['handle'])
        self.assertEqual(rows['parent'],root)
        file=next(row for row in rows['entries'] if row['name']=='雪.txt')
        self.assertEqual(self.command('preview',handle=file['handle'])['preview'],'text')
        self.assertEqual(self.command('stat',handle=folder['handle'])['kind'],'directory')
        with self.grant.open(file['handle']) as fd:
            self.assertEqual(os.read(fd,100),b'exact fixture bytes')
    def test_reparse_junction_blocked(self):
        outside=self.root/'outside'; outside.mkdir()
        link=self.root/'link'
        result=subprocess.run(['cmd','/c','mklink','/J',str(link),str(outside)],capture_output=True)
        self.assertEqual(result.returncode,0)
        try:
            rows=self.command('list',handle=self.grant.id)['entries']
            item=next(row for row in rows if row['name']=='link')
            self.assertEqual(item['kind'],'blocked')
            self.assertEqual(self.engine.execute('list',handle=item['handle'])['state'],'failed')
            with self.assertRaises(ExplorerError): RootGrant(link)
        finally: link.rmdir()
    def test_native_consent_cancel_resume_and_scopes(self):
        from chute.explorer.native import NativeExplorer
        origin='chrome-extension://abcdefghijklmnopabcdefghijklmnop'
        with patch('chute.explorer.native.private_write'):
            controller=NativeExplorer()
        with patch('chute.native_host._allowed_extension_ids',return_value=[origin.split('//')[1]]):
            with self.assertRaises(ExplorerError): controller.action(origin,select=False)
            with patch('chute.explorer.native.choose_folder',return_value=str(self.root)):
                first=controller.action(origin,select=True)
            with patch('chute.explorer.native.choose_folder',return_value=''):
                with self.assertRaises(ExplorerError): controller.action(origin,select=True)
            second=controller.action(origin,select=False)
            self.assertNotEqual(first['token'],second['token'])
            controller.adapters[origin].engine.close()
    def test_acl_file_and_real_thumbnail(self):
        from chute.explorer.native import private_write
        from chute.explorer.preview import thumbnail
        from PIL import Image
        control=self.root/'control.json'
        private_write(control,b'test-only-secret')
        self.assertEqual(control.read_bytes(),b'test-only-secret')
        acl=subprocess.run(['icacls',str(control)],capture_output=True,text=True)
        self.assertEqual(acl.returncode,0)
        self.assertNotIn('Everyone',acl.stdout)
        image=self.root/'tiny.png'; Image.new('RGB',(16,16),(20,40,60)).save(image)
        row=next(row for row in self.command('list',handle=self.grant.id)['entries'] if row['name']=='tiny.png')
        with self.grant.open(row['handle']) as fd: data=thumbnail(fd)
        with Image.open(io.BytesIO(data)) as decoded: self.assertEqual(decoded.size,(16,16))
    def test_source_replaced_requires_new_consent(self):
        moved=self.root.with_name(self.root.name+'-old')
        self.root.rename(moved)
        try:
            self.root.mkdir()
            receipt=self.engine.execute('list',handle=self.grant.id)
            self.assertEqual(receipt['error']['code'],'DIRECTORY_CHANGED')
        finally:
            self.root.rmdir(); moved.rename(self.root)
