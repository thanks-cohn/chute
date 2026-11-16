"""No production paths/processes: bounded logs and fail-closed recovery."""
from contextlib import contextmanager
import io
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
import pytest
from chute.runtime_log import BoundedLog, safe_exception
from chute import native_host, windows_app


def test_log_rotation_retains_error_and_bounds_disk_across_restart(tmp_path):
    legacy=tmp_path/'chute.log';legacy.write_bytes(b'legacy must remain untouched')
    path=tmp_path/'chute-runtime.log'
    for restart in range(3):
        with BoundedLog(path,max_bytes=1024,backups=2) as log:
            for number in range(60):log.write('routine synthetic line '+str(number)+'\n')
            log.write('ERROR crash evidence '+str(restart)+'\n')
    logs=[p for p in tmp_path.glob('chute-runtime.log*') if not p.name.endswith('.lock')]
    assert len(logs)<=3
    assert all(p.stat().st_size<=1024 for p in logs)
    assert sum(p.stat().st_size for p in logs)<=3072
    assert 'ERROR crash evidence 2' in path.read_text()
    assert legacy.read_bytes()==b'legacy must remain untouched'


def test_large_unicode_log_writes_stream_in_bounded_chunks(tmp_path):
    import tracemalloc
    text='雪'*500000
    log=BoundedLog(tmp_path/'runtime.log',max_bytes=65536,backups=2)
    tracemalloc.start();log.write(text);_,peak=tracemalloc.get_traced_memory();tracemalloc.stop()
    assert peak<256000
    assert all(p.stat().st_size<=65536 for p in tmp_path.glob('runtime.log*'))


def test_rotation_lock_or_disk_failure_does_not_crash_server(tmp_path):
    log=BoundedLog(tmp_path/'runtime.log',max_bytes=256,backups=1)
    log.write('a'*250)
    with patch('chute.runtime_log.os.replace',side_effect=PermissionError('locked test file')):
        assert log.write('error evidence\n')==15
    assert log.dropped_writes==1
    assert (tmp_path/'runtime.log').read_text()=='a'*250
    log.write('later error survives\n')
    assert '[log writes unavailable: 1]' in (tmp_path/'runtime.log').read_text()
    assert 'later error survives' in (tmp_path/'runtime.log').read_text()


def test_runtime_exception_does_not_export_private_values():
    try:raise OSError('private token and filename must not leave this exception')
    except OSError as error:diagnostic=safe_exception(error)
    assert diagnostic['type']=='OSError' and diagnostic['frames']
    assert 'private token' not in json.dumps(diagnostic)


@contextmanager
def acquired(_target):yield True


def setup_recovery(tmp_path,monkeypatch,pids):
    target=tmp_path/'Chute.exe';target.write_bytes(b'candidate fixture, never executed')
    monkeypatch.setattr(native_host,'companion_exe',lambda:target)
    monkeypatch.setattr(native_host,'bridge_alive',lambda **kwargs:False)
    monkeypatch.setattr('chute.windows_processes.launch_guard',acquired)
    monkeypatch.setattr('chute.windows_processes.matching_pids',lambda _:pids)
    # Replace this module's os reference only; do not turn pathlib into WindowsPath.
    monkeypatch.setattr(native_host,'os',SimpleNamespace(name='nt',fdopen=os.fdopen,replace=os.replace))
    launch=Mock(return_value=False);monkeypatch.setattr(native_host,'launch_bridge',launch)
    return target,launch


@pytest.mark.parametrize('pids',[[1234],None])
def test_hung_or_unknown_process_is_never_killed_or_restarted(tmp_path,monkeypatch,pids):
    _,launch=setup_recovery(tmp_path,monkeypatch,pids)
    with patch.object(native_host.subprocess,'run') as kill:
        assert native_host.ensure_bridge() is False
        assert native_host.terminate_stale_bridge() is False
        kill.assert_not_called();launch.assert_not_called()


def test_repeated_dead_process_wake_requests_are_rate_limited(tmp_path,monkeypatch):
    target,launch=setup_recovery(tmp_path,monkeypatch,[])
    clock=[1000.0];monkeypatch.setattr(native_host.time,'time',lambda:clock[0])
    for _ in range(25):assert native_host.ensure_bridge() is False
    assert launch.call_count==1
    clock[0]+=3;native_host.ensure_bridge();assert launch.call_count==2
    clock[0]+=5;native_host.ensure_bridge();assert launch.call_count==3
    clock[0]+=10
    for _ in range(25):assert native_host.ensure_bridge() is False
    assert launch.call_count==3
    receipt=json.loads((target.parent/'chutey-recovery-state.json').read_text())
    assert set(receipt)=={'attempts','not_before'}
    clock[0]+=121
    assert native_host.ensure_bridge() is False;assert launch.call_count==3
    clock[0]+=601
    native_host.ensure_bridge();assert launch.call_count==4
    assert str(target) not in json.dumps(receipt)


def test_corrupt_recovery_state_fails_closed(tmp_path,monkeypatch):
    target,launch=setup_recovery(tmp_path,monkeypatch,[])
    (target.parent/'chutey-recovery-state.json').write_text('{broken')
    assert native_host.ensure_bridge() is False;launch.assert_not_called()


def test_windows_installer_refuses_live_target_without_any_taskkill(monkeypatch,tmp_path):
    monkeypatch.setattr(windows_app,'os',SimpleNamespace(name='nt'))
    monkeypatch.setattr(windows_app,'installed_exe',lambda:tmp_path/'Chute.exe')
    monkeypatch.setattr('chute.windows_processes.matching_pids',lambda _:[999])
    with patch.object(windows_app.subprocess,'run') as kill:
        with pytest.raises(OSError):windows_app._stop_old_installed_copy()
        kill.assert_not_called()


@pytest.mark.skipif(os.name!='nt',reason='Windows actual process image enumeration required')
def test_windows_enumeration_finds_current_exact_python_image():
    import sys
    from chute.windows_processes import matching_pids
    assert os.getpid() in matching_pids(Path(sys.executable))


def test_lightweight_status_and_low_noise_private_request_logging(tmp_path,monkeypatch):
    import threading
    from urllib.request import Request,ProxyHandler,build_opener
    from urllib.error import HTTPError
    from chute.server import ChuteServer
    from chute.store import Store
    store=Store(tmp_path/'state');server=ChuteServer(('127.0.0.1',0),store)
    output=io.StringIO();monkeypatch.setattr('sys.stderr',output);monkeypatch.delenv('CHUTE_QUIET',raising=False)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    opener=build_opener(ProxyHandler({}));base=f'http://127.0.0.1:{server.server_port}'
    try:
        for path in ['/health','/api/status','/api/files']*10:
            with opener.open(base+path) as response:
                value=json.load(response)
                if path=='/api/status':assert value=={'service':'chute','count':0}
        assert output.getvalue()==''
        with opener.open(Request(base+'/api/upload',data=b'verified data',headers={'Origin':'chrome-extension://'+'a'*32,'Content-Type':'text/plain','X-Chute-Filename':'private-file-name.txt'})) as response:
            assert json.load(response)['file']['size']==13
        with opener.open(base+'/api/status') as response:assert json.load(response)['count']==1
        with pytest.raises(HTTPError):opener.open(base+'/api/files/private-secret?token=not-for-logs')
        logged=output.getvalue()
        assert 'route=upload status=201' in logged and 'status=404' in logged
        assert 'private-secret' not in logged and 'not-for-logs' not in logged and 'private-file-name' not in logged
        before=output.getvalue()
        try:raise BrokenPipeError('ordinary client cancellation')
        except BrokenPipeError:server.handle_error(None,None)
        assert output.getvalue()==before
        try:raise OSError('private disk error details')
        except OSError:server.handle_error(None,None)
        assert 'OSError' in output.getvalue() and 'private disk error details' not in output.getvalue()
    finally:server.shutdown();server.server_close();thread.join()



def test_duplicate_worker_start_exits_before_discovery_or_server(monkeypatch,tmp_path):
    @contextmanager
    def occupied(_target):yield False
    monkeypatch.setattr(windows_app,'os',SimpleNamespace(name='nt'))
    monkeypatch.setattr(windows_app,'_ensure_data_layout',Mock())
    monkeypatch.setattr(windows_app,'self_install_if_needed',lambda:False)
    monkeypatch.setattr(windows_app,'installed_exe',lambda:tmp_path/'Chute.exe')
    monkeypatch.setattr('chute.windows_processes.instance_guard',occupied)
    discovery=Mock();serve=Mock()
    monkeypatch.setattr(windows_app,'_start_native_origin_refresh',discovery)
    monkeypatch.setattr(windows_app,'serve',serve)
    monkeypatch.setattr('sys.argv',['candidate'])
    assert windows_app.main()==0
    discovery.assert_not_called();serve.assert_not_called()
