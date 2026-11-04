"""Native handoff contracts with real tiny production root grants, no OS dialog."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from chute.explorer.native import NativeExplorer
from chute.explorer.protocol import ExplorerError

ORIGIN='chrome-extension://abcdefghijklmnopabcdefghijklmnop'

class NativeConsentTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='chutey-consent-tiny-')
        self.root=Path(self.temp.name)
        writer=patch('chute.explorer.native.private_write'); writer.start(); self.addCleanup(writer.stop)
        (self.root/'actual.txt').write_bytes(b'bytes')
        with patch('chute.explorer.native.private_write'):
            self.controller=NativeExplorer(store=False)
        self.enrolled=patch('chute.native_host._allowed_extension_ids',return_value=[ORIGIN.split('//')[1]])
        self.enrolled.start()
    def tearDown(self):
        for adapter in self.controller.adapters.values(): adapter.engine.close()
        self.enrolled.stop();self.temp.cleanup()
    def test_selection_and_reopen_keep_same_scope(self):
        with patch('chute.explorer.native.choose_folder',return_value=str(self.root)):
            first=self.controller.action(ORIGIN,select=True)
        engine=self.controller.adapter(ORIGIN).engine
        root=engine.execute('roots')['result']['roots'][0]['handle']
        self.assertEqual(engine.execute('list',handle=root)['result']['entries'][0]['name'],'actual.txt')
        second=self.controller.action(ORIGIN,select=False)
        self.assertEqual(first['token'],second['token'])
        self.assertIs(engine,self.controller.adapter(ORIGIN).engine)
        self.controller.adapter(ORIGIN).session.authorize(ORIGIN,'Bearer '+second['token'])
        self.controller.adapter(ORIGIN).session.authorize(ORIGIN,'Bearer '+first['token'])
    def test_cancel_and_unenrolled_do_not_grant(self):
        with patch('chute.explorer.native.choose_folder',return_value=''):
            with self.assertRaises(ExplorerError): self.controller.action(ORIGIN,select=True)
        with self.assertRaises(ExplorerError): self.controller.action('chrome-extension://'+'p'*32,select=True)
        self.assertEqual(self.controller.adapters,{})
    def test_native_host_rejects_spoofed_message_origin(self):
        from chute.native_host import native_main
        with patch('chute.native_host._set_binary_stdio'), patch('sys.argv',['native','https://untrusted.test']), patch('chute.native_host._read_message',side_effect=[{'action':'explorer_select_folder','origin':ORIGIN,'path':str(self.root)},None]), patch('chute.native_host._write_message') as send, patch('chute.native_host.ensure_bridge') as wake:
            self.assertEqual(native_main(),0)
            self.assertFalse(send.call_args.args[0]['ok'])
            wake.assert_not_called()

    def test_existing_browse_state_does_not_wait_for_open_picker(self):
        import threading
        with patch('chute.explorer.native.choose_folder',return_value=str(self.root)):
            self.controller.action(ORIGIN,select=True)
        entered=threading.Event();release=threading.Event();returned=threading.Event()
        def choose():
            entered.set();release.wait(3);return ''
        def selection():
            try:self.controller.action(ORIGIN,select=True)
            except ExplorerError:pass
        def browse():
            self.controller.state(ORIGIN,'resume_location',{});returned.set()
        with patch('chute.explorer.native.choose_folder',side_effect=choose):
            picker=threading.Thread(target=selection);picker.start()
            try:
                self.assertTrue(entered.wait(1))
                reader=threading.Thread(target=browse);reader.start()
                self.assertTrue(returned.wait(1),'Existing browse state blocked behind native picker')
            finally:
                release.set();picker.join(3)
                if 'reader' in locals():reader.join(3)

    def test_twenty_reopens_and_expiry_never_invoke_picker(self):
        with patch('chute.explorer.native.choose_folder',return_value=str(self.root)):
            first=self.controller.action(ORIGIN,select=True)
        with patch('chute.explorer.native.choose_folder',side_effect=AssertionError('spontaneous picker')):
            for _ in range(20):
                self.assertEqual(self.controller.action(ORIGIN,select=False)['token'],first['token'])
            self.controller.adapter(ORIGIN).session.expires=0
            renewed=self.controller.action(ORIGIN,select=False)
        self.assertNotEqual(renewed['token'],first['token'])
        self.controller.adapter(ORIGIN).session.authorize(ORIGIN,'Bearer '+renewed['token'])
        self.assertEqual(len(self.controller.events),22)
        self.assertTrue(all(not entry['picker_requested'] for entry in list(self.controller.events)[1:]))

    def test_cancel_preserves_previous_token_and_folder(self):
        with patch('chute.explorer.native.choose_folder',return_value=str(self.root)):
            first=self.controller.action(ORIGIN,select=True)
        adapter=self.controller.adapter(ORIGIN)
        before=self.controller.state(ORIGIN,'resume_location',{})
        with patch('chute.explorer.native.choose_folder',return_value=''):
            with self.assertRaises(ExplorerError) as error:self.controller.action(ORIGIN,select=True)
        self.assertEqual(error.exception.code,'CANCELLED')
        self.assertIs(self.controller.adapter(ORIGIN),adapter)
        self.assertEqual(self.controller.state(ORIGIN,'resume_location',{}),before)
        adapter.session.authorize(ORIGIN,'Bearer '+first['token'])

    def test_resume_failure_does_not_instruct_user_to_select(self):
        from chute.native_host import native_main
        with patch('chute.native_host._set_binary_stdio'), patch('sys.argv',['native',ORIGIN]), patch('chute.native_host._read_message',side_effect=[{'action':'explorer_resume'},None]), patch('chute.native_host._write_message') as send, patch('chute.native_host.ensure_bridge',return_value=False):
            self.assertEqual(native_main(),0)
        self.assertEqual(send.call_args.args[0]['code'],'BRIDGE_UNAVAILABLE')
        self.assertNotIn('Select',send.call_args.args[0]['error'])
