"""Native first use must not make Store features depend on external-folder approval."""
import io,json
from pathlib import Path
from unittest.mock import patch,Mock
from types import SimpleNamespace
import pytest
from chute.store import Store
from chute.explorer.native import NativeExplorer
from chute.explorer.protocol import ExplorerError
ORIGIN='chrome-extension://abcdefghijklmnopabcdefghijklmnop'

def test_enrolled_saved_scope_is_read_only_and_never_picks_or_grants_external_paths(tmp_path):
    store=Store(tmp_path/'store');store.add_stream('own.txt',io.BytesIO(b'own bytes'),9)
    external=tmp_path/'external';external.mkdir();(external/'private.txt').write_bytes(b'not granted')
    with patch('chute.explorer.native.private_write'),patch('chute.native_host._allowed_extension_ids',return_value=[ORIGIN.split('//')[1]]),patch('chute.explorer.native.choose_folder',side_effect=AssertionError('No automatic picker')):
        def missing(origin):raise ExplorerError('NEEDS_SELECTION','No external approval')
        grants=SimpleNamespace(load=missing,save=Mock(),directory=tmp_path/'grants')
        native=NativeExplorer(store=grants,saved_store=store)
        response=native.action(ORIGIN,select=False);assert response['scope']=='saved_store' and response['read_only']
        adapter=native.adapter(ORIGIN);root=adapter.engine.execute('roots')['result']['roots'][0]
        assert root['name']=='Saved Chutey files'
        listing=adapter.engine.execute('list',handle=root['handle'])['result'];assert len(listing['entries'])==1
        assert 'private.txt' not in json.dumps(listing) and str(tmp_path) not in json.dumps(listing)
        assert not adapter.engine.grant_for(root['handle']).writable
        with pytest.raises(ExplorerError):native.state(ORIGIN,'begin_transfer',{'operation_id':'a'*32,'destination':root['handle']})
        adapter.session.expires=0
        assert native.action(ORIGIN,select=False)['scope']=='saved_store'
        assert native.state(ORIGIN,'remember_location',{'handle':root['handle'],'view':{}})['remembered'] is False
        with pytest.raises(ExplorerError):native.action('chrome-extension://'+'b'*32,select=False)
        grants.save.assert_not_called()
        with patch('chute.explorer.native.choose_folder',return_value=str(external)):
            selected=native.action(ORIGIN,select=True)
        assert selected['scope']=='approved_folder'
        native.adapter(ORIGIN).engine.close()

def test_old_non_store_native_controller_still_requires_explicit_selection(tmp_path):
    with patch('chute.explorer.native.private_write'),patch('chute.native_host._allowed_extension_ids',return_value=[ORIGIN.split('//')[1]]):
        native=NativeExplorer(store=False)
        with pytest.raises(ExplorerError) as denied:native.action(ORIGIN,select=False)
        assert denied.value.code=='NEEDS_SELECTION'
