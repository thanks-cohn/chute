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
            controller=NativeExplorer(store=False)
        with patch('chute.explorer.native.private_write'), patch('chute.native_host._allowed_extension_ids',return_value=[origin.split('//')[1]]):
            with self.assertRaises(ExplorerError): controller.action(origin,select=False)
            with patch('chute.explorer.native.choose_folder',return_value=str(self.root)):
                first=controller.action(origin,select=True)
            with patch('chute.explorer.native.choose_folder',return_value=''):
                with self.assertRaises(ExplorerError): controller.action(origin,select=True)
            second=controller.action(origin,select=False)
            self.assertEqual(first['token'],second['token'])
            with patch('chute.explorer.native.choose_folder',side_effect=AssertionError('spontaneous picker')):
                for _ in range(20):
                    self.assertEqual(controller.action(origin,select=False)['token'],first['token'])
                controller.adapters[origin].session.authorize(origin,'Bearer '+first['token'])
                controller.adapters[origin].session.expires=0
                renewed=controller.action(origin,select=False)
                self.assertNotEqual(renewed['token'],first['token'])
                controller.adapters[origin].session.authorize(origin,'Bearer '+renewed['token'])
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

    def test_enumerated_path_and_open_handle_identities_match(self):
        row=self.command('list',handle=self.grant.id)['entries'][0]
        self.assertEqual(row['identity'],self.command('stat',handle=row['handle'])['identity'])
        listing=self.command('list',handle=row['handle'])
        file=next(value for value in listing['entries'] if value['kind']=='file')
        self.assertEqual(file['identity'],self.command('stat',handle=file['handle'])['identity'])
        with self.grant.open(file['handle']) as fd:
            self.assertEqual(file['identity'],self.grant.windows.file_identity(self.grant.parts(file['handle']),fd=fd))

    def test_real_shell_picker_has_one_dialog_and_cancels(self):
        """Real Windows Shell UI, not a mocked chooser or a Chrome acceptance claim."""
        import ctypes
        from ctypes import wintypes as W
        import sys
        import time
        user=ctypes.WinDLL('user32',use_last_error=True)
        user.OpenInputDesktop.argtypes=[W.DWORD,W.BOOL,W.DWORD]
        user.OpenInputDesktop.restype=W.HANDLE
        user.CloseDesktop.argtypes=[W.HANDLE]
        desktop=user.OpenInputDesktop(0,False,0x1)  # DESKTOP_READOBJECTS
        if not desktop:
            self.skipTest('WINDOWS_UI: no accessible input desktop; picker UI remains unverified')
        user.CloseDesktop(desktop)
        callback_type=ctypes.WINFUNCTYPE(W.BOOL,W.HWND,W.LPARAM)
        user.EnumWindows.argtypes=[callback_type,W.LPARAM]
        user.GetWindowThreadProcessId.argtypes=[W.HWND,ctypes.POINTER(W.DWORD)]
        user.IsWindowVisible.argtypes=[W.HWND]
        user.GetClassNameW.argtypes=[W.HWND,W.LPWSTR,ctypes.c_int]
        user.PostMessageW.argtypes=[W.HWND,W.UINT,W.WPARAM,W.LPARAM]
        process=subprocess.Popen([sys.executable,'-c',
            'from chute.explorer.native import choose_folder; assert choose_folder() == ""'],
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW)
        windows=[]
        @callback_type
        def collect(hwnd,_):
            pid=W.DWORD()
            user.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
            if pid.value==process.pid and user.IsWindowVisible(hwnd):
                name=ctypes.create_unicode_buffer(128)
                user.GetClassNameW(hwnd,name,len(name))
                windows.append((hwnd,name.value))
            return True
        try:
            deadline=time.monotonic()+15
            while time.monotonic()<deadline:
                windows.clear(); user.EnumWindows(collect,0)
                if windows or process.poll() is not None: break
                time.sleep(.1)
            self.assertEqual([name for _,name in windows],['#32770'],
                             'Expected exactly one Shell dialog and no visible helper window')
            # Allow delayed helper/owner windows to surface before counting again.
            time.sleep(.3)
            windows.clear(); user.EnumWindows(collect,0)
            self.assertEqual([name for _,name in windows],['#32770'])
            self.assertTrue(user.PostMessageW(windows[0][0],0x10,0,0))  # WM_CLOSE = cancel
            _,errors=process.communicate(timeout=10)
            self.assertEqual(process.returncode,0,errors.decode(errors='replace'))
        finally:
            if process.poll() is None:
                for hwnd,_ in windows: user.PostMessageW(hwnd,0x10,0,0)
                try: process.wait(timeout=3)
                except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=3)
            process.stdout.close(); process.stderr.close()
