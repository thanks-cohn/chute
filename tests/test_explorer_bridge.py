"""REDOWN_FIXTURE only: two permissioned local participants, no live providers."""
import hashlib
from pathlib import Path
import secrets
import tempfile
import unittest

from chute.explorer import Explorer, RootGrant
from chute.explorer.interop import AdapterBridge, capabilities
from chute.explorer.interop_adapter import NativeTransferAdapter
from chute.explorer.protocol import ExplorerError
from chute.explorer.transfers import Transfers


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.adapters = {}; self.grants = {}; self.refs = {}
        for name, peer in [('chute','redown_fixture'),('redown_fixture','chute')]:
            path = self.root/name; path.mkdir(); (path/'nested').mkdir()
            grant = RootGrant(path,writable=True); self.addCleanup(grant.close)
            engine = Explorer([grant]); transfers = Transfers(engine)
            ref = secrets.token_urlsafe(32)
            self.grants[name]=grant; self.refs[name]=ref
            self.adapters[name] = NativeTransferAdapter(transfers,peers=[peer],destinations={ref:(grant,grant.handle(('nested',)))})
        self.clock = [0]
        self.bridge = AdapterBridge(self.adapters,clock=lambda:self.clock[0])

    def intent(self, sender, receiver, data=b'tiny original bytes'):
        name = 'fixture.txt'; (self.root/sender/name).write_bytes(data)
        adapter = self.adapters[sender]; grant = self.grants[sender]
        row = next(row for row in adapter.transfers.engine.execute('list',handle=grant.id)['result']['entries'] if row['name']==name)
        source = adapter.transfers.prepare(row['handle'],row['identity'])
        return dict(version='1.0',correlation_id=secrets.token_hex(16),direction='local_to_cloud' if sender=='chute' else 'cloud_to_local',
            source=source['capability'],destination=self.refs[receiver],name=name,mime='text/plain',size=len(data),sha256=hashlib.sha256(data).hexdigest())

    def test_both_directions_independent_hashes_and_one_use(self):
        self.assertFalse(capabilities()['enabled'])
        for sender,receiver in [('chute','redown_fixture'),('redown_fixture','chute')]:
            intent = self.intent(sender,receiver)
            prepared = self.bridge.prepare(intent,sender=sender,receiver=receiver,user_gesture=True)
            result = self.bridge.commit(prepared['nonce'],sender=sender,receiver=receiver)
            self.assertEqual(result['state'],'COMMITTED')
            data = (self.root/receiver/'nested'/'fixture.txt').read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(),intent['sha256'])
            self.assertEqual((self.root/sender/'fixture.txt').read_bytes(),data)
            self.assertEqual(self.bridge.reconcile(intent['correlation_id'],receiver=receiver)['state'],'COMMITTED')
            with self.assertRaises(ExplorerError): self.bridge.commit(prepared['nonce'],sender=sender,receiver=receiver)
            with self.assertRaises(ExplorerError): self.bridge.prepare(intent,sender=sender,receiver=receiver,user_gesture=True)
            with self.assertRaises(ExplorerError): self.bridge.reconcile(intent['correlation_id'],receiver=sender)

    def test_absent_peer_revocation_expiry_cancellation_and_bad_hash(self):
        intent = self.intent('chute','redown_fixture')
        with self.assertRaises(ExplorerError): self.bridge.prepare(intent,sender='chute',receiver='missing',user_gesture=True)
        with self.assertRaises(ExplorerError): self.bridge.prepare(intent,sender='chute',receiver='redown_fixture',user_gesture=False)
        prepared = self.bridge.prepare(intent,sender='chute',receiver='redown_fixture',user_gesture=True)
        self.clock[0]=61
        with self.assertRaises(ExplorerError): self.bridge.commit(prepared['nonce'],sender='chute',receiver='redown_fixture')
        intent = self.intent('chute','redown_fixture'); intent['sha256']='0'*64
        prepared = self.bridge.prepare(intent,sender='chute',receiver='redown_fixture',user_gesture=True)
        with self.assertRaises(ExplorerError): self.bridge.commit(prepared['nonce'],sender='chute',receiver='redown_fixture')
        self.assertEqual(self.bridge.reconcile(intent['correlation_id'],receiver='redown_fixture')['state'],'UNCERTAIN')
        self.assertEqual(list((self.root/'redown_fixture'/'nested').iterdir()),[])
        intent = self.intent('chute','redown_fixture')
        prepared = self.bridge.prepare(intent,sender='chute',receiver='redown_fixture',user_gesture=True)
        self.grants['redown_fixture'].writable=False
        with self.assertRaises(ExplorerError): self.bridge.commit(prepared['nonce'],sender='chute',receiver='redown_fixture')
        intent = self.intent('chute','redown_fixture'); self.grants['redown_fixture'].writable=True
        prepared = self.bridge.prepare(intent,sender='chute',receiver='redown_fixture',user_gesture=True)
        self.assertEqual(self.bridge.cancel(prepared['nonce'],sender='chute',receiver='redown_fixture')['state'],'CANCELLED')
