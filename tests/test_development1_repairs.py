"""Owner repair regressions: mocked Windows failures + real scoped file engine."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
import pytest
from chute.explorer import Explorer, RootGrant
from chute.explorer.protocol import ExplorerError
from chute.explorer.preview import preview_kind
from chute.explorer.file_actions import external_action
from chute import native_host


def test_one_locked_windows_profile_entry_does_not_destroy_listing(tmp_path):
    (tmp_path/'NTUSER.DAT').write_bytes(b'locked fixture')
    (tmp_path/'ordinary.txt').write_bytes(b'ordinary')
    grant=RootGrant(tmp_path);engine=Explorer([grant])
    original=grant.windows
    @contextmanager
    def guard(*args,**kwargs):yield None,None
    def identity(parts,**kwargs):
        if parts[-1]=='NTUSER.DAT':
            error=OSError('fixture sharing violation');error.winerror=32;raise error
        return 'canonical-ordinary'
    grant.windows=SimpleNamespace(root=tmp_path,guard=guard,file_identity=identity)
    try:
        receipt=engine.execute('list',handle=grant.id)
        assert receipt['state']=='completed'
        rows={row['name']:row for row in receipt['result']['entries']}
        assert rows['ordinary.txt']['identity']=='canonical-ordinary'
        assert rows['NTUSER.DAT']['kind']=='blocked'
        assert rows['NTUSER.DAT']['identity'] is None
        assert rows['NTUSER.DAT']['error']['code']=='FILE_IN_USE'
        assert str(tmp_path) not in json.dumps(receipt)
    finally:grant.windows=original;engine.close()


def test_preserves_enrolled_manifest_ids_and_rejects_wildcards(tmp_path,monkeypatch):
    manifest=tmp_path/'manifest.json';extra=tmp_path/'origins.txt'
    authorized='a'*32;explicit='b'*32
    manifest.write_text(json.dumps({'name':native_host.HOST_NAME,'type':'stdio','allowed_origins':[
        f'chrome-extension://{authorized}/','chrome-extension://*/','https://evil.test/']}))
    extra.write_text(explicit+'\n')
    monkeypatch.setattr(native_host,'native_manifest_path',lambda:manifest)
    monkeypatch.setattr(native_host,'extra_origins_path',lambda:extra)
    monkeypatch.setattr(native_host,'_discover_chute_extension_ids',lambda:[])
    assert native_host._allowed_extension_ids()==[native_host.STORE_EXTENSION_ID,authorized,explicit]
    manifest.write_text(json.dumps({'name':'unrelated','type':'stdio','allowed_origins':[f'chrome-extension://{authorized}/']}))
    assert authorized not in native_host._allowed_extension_ids()


def test_secure_preferences_enrollment_survives_missing_preferences(tmp_path,monkeypatch):
    profile=tmp_path/'User Data'/'Default';profile.mkdir(parents=True)
    extension='c'*32
    (profile/'Secure Preferences').write_text(json.dumps({'extensions':{'settings':{extension:{'manifest':{'name':'Chutey','homepage_url':'https://github.com/thanks-cohn/chute'}}}}}))
    monkeypatch.setattr(native_host,'_chrome_user_data_roots',lambda:[profile.parent])
    assert native_host._discover_chute_extension_ids()==[extension]


def test_audio_capabilities_and_executable_not_media():
    for name,mime in [('music.mp3','audio/mpeg'),('music.wav',None),('music.flac','application/octet-stream')]:
        assert preview_kind({'name':name,'mime':mime,'kind':'file'})=='audio'
    assert preview_kind({'name':'launch.exe','mime':None,'kind':'file'})=='unavailable'


@pytest.mark.parametrize('action',['open','reveal'])
def test_external_actions_resolve_same_authorized_identity(tmp_path,action):
    path=tmp_path/'note.txt';path.write_text('synthetic text')
    @contextmanager
    def opened(handle):
        assert handle=='opaque'
        with path.open('rb') as file:yield file.fileno()
    grant=SimpleNamespace(windows=SimpleNamespace(root=tmp_path),parts=lambda handle:('note.txt',),open=opened)
    engine=SimpleNamespace(grant_for=lambda handle:grant,_record=lambda *args,**kwargs:{'identity':'same','name':'note.txt','kind':'file','mime':'text/plain'})
    launch=Mock();reveal=Mock(return_value='selected')
    with patch('chute.explorer.file_actions.os',SimpleNamespace(name='nt',fstat=os.fstat,startfile=launch)),patch('chute.reveal.reveal_file',reveal):
        result=external_action(engine,action,'opaque','same')
        assert result['action']==action
        if action=='open':launch.assert_called_once_with(str(path),'open');reveal.assert_not_called()
        else:reveal.assert_called_once_with(path);launch.assert_not_called()
        with pytest.raises(ExplorerError,match='file changed'):external_action(engine,action,'opaque','old')


def test_system_open_cannot_execute_disguised_script(tmp_path):
    path=tmp_path/'launch.cmd';path.write_text('echo should never run')
    @contextmanager
    def opened(handle):
        with path.open('rb') as file:yield file.fileno()
    grant=SimpleNamespace(windows=SimpleNamespace(root=tmp_path),parts=lambda handle:('launch.cmd',),open=opened)
    engine=SimpleNamespace(grant_for=lambda handle:grant,_record=lambda *args,**kwargs:{'identity':'same','name':'launch.cmd','kind':'file','mime':'text/plain'})
    launch=Mock()
    with patch('chute.explorer.file_actions.os',SimpleNamespace(name='nt',fstat=os.fstat,startfile=launch)):
        with pytest.raises(ExplorerError,match='System Open supports'):external_action(engine,'open','opaque','same')
    launch.assert_not_called()


def test_manifest_regeneration_keeps_explicit_id_and_never_writes_partial_json(tmp_path,monkeypatch):
    import sys
    from contextlib import nullcontext
    manifest=tmp_path/'host.json';target=tmp_path/'helper.exe';target.write_bytes(b'fixture')
    approved='d'*32
    manifest.write_text(json.dumps({'name':native_host.HOST_NAME,'type':'stdio','allowed_origins':[f'chrome-extension://{approved}/']}))
    fake_registry=SimpleNamespace(HKEY_CURRENT_USER=0,REG_SZ=1,CreateKey=lambda *args:nullcontext('fake-key'),SetValueEx=Mock())
    monkeypatch.setitem(sys.modules,'winreg',fake_registry)
    monkeypatch.setattr(native_host,'native_manifest_path',lambda:manifest)
    monkeypatch.setattr(native_host,'extra_origins_path',lambda:tmp_path/'extra.txt')
    monkeypatch.setattr(native_host,'_discover_chute_extension_ids',lambda:[])
    monkeypatch.setattr(native_host,'os',SimpleNamespace(name='nt',fdopen=os.fdopen,fsync=os.fsync,replace=os.replace))
    for _ in range(3):
        native_host.register_native_host(target)
        payload=json.loads(manifest.read_text())
        assert f'chrome-extension://{approved}/' in payload['allowed_origins']
        assert f'chrome-extension://{native_host.STORE_EXTENSION_ID}/' in payload['allowed_origins']
    assert not list(tmp_path.glob('.chute-manifest-*'))
