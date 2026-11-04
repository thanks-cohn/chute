"""Real engine/restart tests; fake crypto is never Windows DPAPI evidence."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from chute.explorer.grant_store import GrantStore, dpapi
from chute.explorer.native import NativeExplorer
from chute.explorer.protocol import ExplorerError

ORIGIN = 'chrome-extension://' + 'abcdefghijklmnop' * 2


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'approved'
        (self.root / 'nested').mkdir(parents=True)
        self.store = GrantStore(Path(self.temp.name) / 'state',
            protect=lambda data, origin, **kw: data,
            writer=lambda path, data: (path.parent.mkdir(exist_ok=True), path.write_bytes(data)))
        self.enrolled = patch('chute.native_host._allowed_extension_ids', return_value=[ORIGIN.split('//')[1]])
        self.enrolled.start(); self.addCleanup(self.enrolled.stop)
        self.controllers = []
        self.addCleanup(self.close)

    def close(self):
        for controller in self.controllers:
            for adapter in controller.adapters.values(): adapter.engine.close()

    def controller(self):
        with patch('chute.explorer.native.private_write'):
            controller = NativeExplorer(store=self.store)
        self.controllers.append(controller)
        return controller

    def approve(self):
        controller = self.controller()
        with patch('chute.explorer.native.choose_folder', return_value=str(self.root)):
            controller.action(ORIGIN, select=True)
        engine = controller.adapter(ORIGIN).engine
        grant = next(iter(engine.grants.values()))
        folder = engine.execute('list', handle=grant.id)['result']['entries'][0]['handle']
        controller.state(ORIGIN, 'remember_location', {'handle':folder,
            'view':{'sort':'date', 'grid':True, 'query':'tiny', 'scroll':12}})
        return controller, grant, folder

    def test_restart_remints_handles_and_restores_location_without_picker(self):
        first, grant, folder = self.approve()
        token = first.adapter(ORIGIN).session.token
        second = self.controller()
        with patch('chute.explorer.native.choose_folder', side_effect=AssertionError('unexpected picker')):
            response = second.action(ORIGIN, select=False)
        location = second.state(ORIGIN, 'resume_location', {})
        self.assertNotEqual(response['token'], token)
        self.assertNotEqual(location['handle'], folder)
        self.assertEqual(second.adapter(ORIGIN).engine.execute('stat', handle=location['handle'])['result']['name'], 'nested')
        self.assertEqual(location['view']['scroll'], 12)
        with self.assertRaises(ExplorerError): second.adapter(ORIGIN).engine.grant_for(folder)
        # Warm reconnect must preserve the same logical location too.
        second.action(ORIGIN, select=False)
        self.assertEqual(second.state(ORIGIN, 'resume_location', {})['handle'], location['handle'])

    def test_missing_child_falls_back_to_approved_root(self):
        self.approve(); (self.root / 'nested').rmdir()
        controller = self.controller(); controller.action(ORIGIN, select=False)
        grant = next(iter(controller.adapter(ORIGIN).engine.grants.values()))
        self.assertEqual(controller.state(ORIGIN, 'resume_location', {})['handle'], grant.id)

    def test_replaced_root_revocation_corruption_and_scope_fail_closed(self):
        first, grant, folder = self.approve()
        # Identity mismatch models a root substituted at the same path.
        data = self.store.load(ORIGIN); data['identity'] = [-1, -1]; self.store.save(ORIGIN, data)
        with self.assertRaises(ExplorerError): self.controller().action(ORIGIN, select=False)
        first.state(ORIGIN, 'revoke_access', {})
        self.assertIsNone(first.adapter(ORIGIN))
        with self.assertRaises(ExplorerError): grant.parts('unknown')
        with self.assertRaises(ExplorerError): self.controller().action(ORIGIN, select=False)
        self.store.path(ORIGIN).write_bytes(b'invalid')
        with self.assertRaises(ExplorerError): self.controller().action(ORIGIN, select=False)
        with self.assertRaises(ExplorerError): self.controller().action('chrome-extension://'+'p'*32, select=False)

    def test_only_valid_relative_location_can_be_saved(self):
        controller, grant, _ = self.approve()
        for args in ({'handle':'C:/private','view':{}}, {'handle':grant.id,'view':{'scroll':-1}},
                     {'handle':grant.id,'view':{'path':'private'}}):
            with self.assertRaises(ExplorerError): controller.state(ORIGIN, 'remember_location', args)

    @unittest.skipUnless(os.name == 'nt', 'WINDOWS_NATIVE: DPAPI and owner ACL require Windows')
    def test_real_dpapi_origin_binding_and_persistent_restart(self):
        self.store = GrantStore(Path(self.temp.name) / 'protected')
        first, _, _ = self.approve()
        ciphertext = self.store.path(ORIGIN).read_bytes()
        self.assertNotIn(str(self.root).encode(), ciphertext)
        with self.assertRaises(ExplorerError): dpapi(ciphertext, 'chrome-extension://'+'p'*32, decrypt=True)
        second = self.controller(); second.action(ORIGIN, select=False)
        self.assertEqual(second.state(ORIGIN, 'resume_location', {})['view']['scroll'], 12)

    @unittest.skipUnless(os.name == 'nt', 'WINDOWS_NATIVE: fresh process requires Windows DPAPI')
    def test_real_dpapi_restores_in_fresh_process_without_picker(self):
        import subprocess
        import sys
        self.store = GrantStore(Path(self.temp.name) / 'protected')
        self.approve()
        program = '''
import json, sys
from pathlib import Path
from unittest.mock import patch
from chute.explorer.native import NativeExplorer
from chute.explorer.grant_store import GrantStore
origin='chrome-extension://'+'abcdefghijklmnop'*2
with patch('chute.explorer.native.private_write'), patch('chute.native_host._allowed_extension_ids',return_value=[origin.split('//')[1]]), patch('chute.explorer.native.choose_folder',side_effect=AssertionError('unexpected picker')):
    controller=NativeExplorer(store=GrantStore(Path(sys.argv[1])))
    controller.action(origin,select=False)
    location=controller.state(origin,'resume_location',{})
    row=controller.adapter(origin).engine.execute('stat',handle=location['handle'])
    print(json.dumps({'name':row['result']['name'],'view':location['view']}))
    controller.adapter(origin).engine.close()
'''
        result=subprocess.run([sys.executable,'-c',program,str(self.store.directory)],capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,'Fresh-process persistent consent failed')
        receipt=json.loads(result.stdout)
        self.assertEqual(receipt['name'],'nested')
        self.assertEqual(receipt['view']['scroll'],12)
