"""Production byte transfers using tiny disposable files, never user folders."""
import hashlib
import io
import os
from pathlib import Path
import tempfile
import unittest

from chute.explorer import Explorer, RootGrant
from chute.explorer.protocol import ExplorerError
from chute.explorer.transfers import Transfers, receive
from chute.store import Store


class TransferTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'source').mkdir(); (self.root / 'target' / 'nested').mkdir(parents=True)
        self.source = RootGrant(self.root / 'source')
        self.target = RootGrant(self.root / 'target', writable=True)
        self.engine = Explorer([self.source,self.target]); self.addCleanup(self.engine.close)
        self.transfers = Transfers(self.engine)
        self.destination = self.target.handle(('nested',))
        self.store = Store(self.root / 'live')

    def source_row(self, name, data):
        (self.root/'source'/name).write_bytes(data)
        return next(row for row in self.engine.execute('list',handle=self.source.id)['result']['entries'] if row['name']==name)

    def test_png_pdf_txt_original_live_roundtrip_nested_keep_both(self):
        from PIL import Image
        png = io.BytesIO(); Image.new('RGB',(2,2),(20,40,60)).save(png,format='PNG')
        fixtures = [('tiny.png',png.getvalue()), ('tiny.pdf',b'%PDF-1.4\n%%EOF'), ('雪.txt',b'tiny\x00original bytes')]
        for name, data in fixtures:
            with self.subTest(name=name):
                row = self.source_row(name,data)
                prepared = self.transfers.prepare(row['handle'],row['identity'])
                receipt = self.transfers.to_live(prepared['capability'],self.store)
                self.assertEqual(receipt['state'],'COMMITTED')
                item, file = self.store.get(receipt['file']['id'])
                self.assertEqual(file.read_bytes(),data)
                self.assertEqual(receipt['sha256'],hashlib.sha256(data).hexdigest())
                for index in range(2):
                    with file.open('rb') as stream:
                        copied = receive(self.target,self.destination,name,stream,len(data),expected_sha256=receipt['sha256'])
                    expected_name = name if index == 0 else f'{Path(name).stem} (1){Path(name).suffix}'
                    self.assertEqual(copied['name'],expected_name)
                    final = self.root/'target'/'nested'/expected_name
                    self.assertEqual(hashlib.sha256(final.read_bytes()).hexdigest(),hashlib.sha256(data).hexdigest())
                    self.assertEqual(final.read_bytes(),data)
                self.assertEqual((self.root/'source'/name).read_bytes(),data)
                with self.assertRaises(ExplorerError): self.transfers.to_live(prepared['capability'],self.store)

    def test_read_only_links_traversal_partial_hash_revocation_fail_safely(self):
        for name in ('../escape','C:\\escape','NUL','bad:stream','x.'):
            with self.assertRaises(ExplorerError): receive(self.target,self.destination,name,io.BytesIO(b'a'),1)
        with self.assertRaises(ExplorerError): receive(self.source,self.source.id,'x',io.BytesIO(b'a'),1)
        with self.assertRaises(ExplorerError): receive(self.target,self.destination,'partial',io.BytesIO(b'a'),2)
        with self.assertRaises(ExplorerError): receive(self.target,self.destination,'bad',io.BytesIO(b'a'),1,expected_sha256='0'*64)
        def revoked(): raise ExplorerError('UNAUTHORIZED','Revoked')
        with self.assertRaises(ExplorerError): receive(self.target,self.destination,'revoked',io.BytesIO(b'a'),1,authorize=revoked)
        self.assertEqual(list((self.root/'target'/'nested').iterdir()),[])
        if os.name == 'posix':
            (self.root/'target'/'link').symlink_to(self.root/'source',target_is_directory=True)
            with self.assertRaises(OSError): receive(self.target,self.target.handle(('link',)),'x',io.BytesIO(b'a'),1)
            self.assertFalse((self.root/'source'/'x').exists())

    def test_expiry_changed_source_and_skip(self):
        row = self.source_row('original',b'before')
        now = [0]; transfers = Transfers(self.engine,clock=lambda:now[0])
        prepared = transfers.prepare(row['handle'],row['identity']); now[0]=61
        with self.assertRaises(ExplorerError): transfers.to_live(prepared['capability'],self.store)
        prepared = self.transfers.prepare(row['handle'],row['identity'])
        (self.root/'source'/'original').write_bytes(b'changed bytes')
        with self.assertRaises(ExplorerError): self.transfers.to_live(prepared['capability'],self.store)
        receive(self.target,self.destination,'same',io.BytesIO(b'old'),3)
        receipt = receive(self.target,self.destination,'same',io.BytesIO(b'new'),3,conflict='skip')
        self.assertEqual(receipt['state'],'CANCELLED')
        self.assertEqual((self.root/'target'/'nested'/'same').read_bytes(),b'old')
        self.assertFalse(list((self.root/'target'/'nested').glob('.chute-stage-*')))
