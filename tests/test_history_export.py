import csv,hashlib,io,json,time,zipfile,tracemalloc
from dataclasses import replace
from datetime import datetime,timezone
from pathlib import Path
import pytest
from chute.history_export import HistoryExports,ExportError
from chute.store import Store,QueueItem

def done(exports,job,owner='owner'):
    for _ in range(1000):
        state=exports.status(job['id'],owner)
        if state['state'] not in {'accepted','running'}:return state
        time.sleep(.01)
    pytest.fail('export did not finish')

def event(store,stamp,name='é😀, "name"\n=not formula',kind='add',source='C:\\private\\secret'):
    item=QueueItem('a'*32,name,'saved.txt',17,'text/plain',stamp,source)
    store._append_history(kind,item,stamp)

def read(exports,j):
    job=exports.download(j['url'].rsplit('/',1)[-1])
    with zipfile.ZipFile(job['path']) as z:
        assert z.testzip() is None
        assert set(z.namelist())=={'history.csv','history.json','manifest.json'}
        return json.loads(z.read('history.json'))['events'],list(csv.DictReader(io.StringIO(z.read('history.csv').decode()))),json.loads(z.read('manifest.json'))

def test_single_zip_snapshot_utf8_ledger_redaction(tmp_path):
    store=Store(tmp_path);event(store,'2026-11-01T05:30:00Z');event(store,'2026-11-01T07:30:00Z',kind='remove');event(store,'2026-11-02T05:59:59Z',kind='recall');event(store,'2026-11-02T06:00:00Z',kind='clear')
    original={p:p.read_bytes() for p in store.history_dir.iterdir()};queue=store.queue_path.read_bytes()
    exports=HistoryExports(store)
    try:
        job=done(exports,exports.create({'scope':'range','timezone':'America/Chicago','from':'2026-11-01','to':'2026-11-01'},'owner'))
        assert job['state']=='ready',job
        events,rows,manifest=read(exports,job)
        assert len(events)==len(rows)==3
        assert [e['event'] for e in events]==['add','remove','recall']
        assert events[0]['timestamp_local'].endswith('-05:00') and events[1]['timestamp_local'].endswith('-06:00')
        assert events[0]['source']=='' and events[0]['name']=='é😀, "name"\n=not formula'
        assert all(p.read_bytes()==v for p,v in original.items()) and store.queue_path.read_bytes()==queue
        assert len(list(exports.download(job['url'].split('/')[-1])['directory'].iterdir()))==1
        assert manifest['count']==3
        with pytest.raises(ExportError):exports.status(job['id'],'intruder')
        exports.cancel(job['id'],'owner')
        with pytest.raises(ExportError):exports.download(job['url'].split('/')[-1])
    finally:exports.close()

@pytest.mark.parametrize('args',[{'scope':'range','timezone':'UTC','from':'2026-02-30','to':'2026-03-01'},{'scope':'range','timezone':'UTC','from':'2026-03-02','to':'2026-03-01'},{'scope':'today','timezone':'../../bad'},{'scope':'all','timezone':'UTC','path':'/etc/passwd'}])
def test_invalid_scope(tmp_path,args):
    exports=HistoryExports(Store(tmp_path))
    try:
        with pytest.raises(ExportError):exports.create(args,'owner')
    finally:exports.close()

def test_empty_today_and_formula(tmp_path):
    store=Store(tmp_path);exports=HistoryExports(store)
    try:
        job=done(exports,exports.create({'scope':'today','timezone':'Pacific/Honolulu'},'owner'));assert job['count']==0
        assert read(exports,job)[0]==[];exports.cancel(job['id'],'owner')
        event(store,datetime.now(timezone.utc).isoformat(),name=' =HYPERLINK("bad")',source='https://user:secret@example.org/path?token=private#key')
        job=done(exports,exports.create({'scope':'all','timezone':'UTC'},'owner'))
        events,rows,_=read(exports,job);assert rows[0]['name'].startswith("'") and events[0]['name'].startswith(' =')
        assert events[0]['source']=='https://example.org/path'
    finally:exports.close()

def test_zip64_bounded_snapshot_growth_and_failure(tmp_path,monkeypatch):
    store=Store(tmp_path);event(store,'2026-11-01T00:00:00Z')
    # Exercise the stdlib's real ZIP64 structures at a reduced size boundary.
    monkeypatch.setattr(zipfile,'ZIP64_LIMIT',1000)
    exports=HistoryExports(store);original_events=exports._events
    def growing(j):
        event(store,'2026-11-02T00:00:00Z')
        yield from original_events(j)
    monkeypatch.setattr(exports,'_events',growing)
    try:
        job=done(exports,exports.create({'scope':'all','timezone':'UTC'},'owner'));assert job['count']==1
        assert len(read(exports,job)[0])==1
        with zipfile.ZipFile(exports.download(job['url'].split('/')[-1])['path']) as z:assert z.getinfo('history.csv').extract_version>=45
        exports.cancel(job['id'],'owner')
        def broken(j):raise OSError(28,'disk full');yield
        monkeypatch.setattr(exports,'_events',broken)
        job=done(exports,exports.create({'scope':'all','timezone':'UTC'},'owner'));assert job['state']=='failed' and 'single ZIP' in job['error']
        assert not exports.jobs[job['id']]['directory'].exists()
    finally:exports.close()

def test_large_ledger_memory_and_cancel(tmp_path):
    store=Store(tmp_path)
    for i in range(15000):event(store,'2026-11-01T00:00:00Z',name='Record '+str(i)+' é')
    exports=HistoryExports(store);tracemalloc.start()
    try:
        job=done(exports,exports.create({'scope':'all','timezone':'UTC'},'owner'))
        _,peak=tracemalloc.get_traced_memory();assert job['count']==15000 and peak<12*1024*1024,(job,peak)
        print('15000-event single ZIP Python peak bytes:',peak)
        exports.cancel(job['id'],'owner')
        job=exports.create({'scope':'all','timezone':'UTC'},'owner');exports.cancel(job['id'],'owner');job=done(exports,job)
        assert job['state']=='cancelled'
    finally:tracemalloc.stop();exports.close()

def test_ready_lifetime_begins_after_build_and_foreign_owner_stays_denied(tmp_path):
    exports=HistoryExports(Store(tmp_path))
    try:
        created=exports.create({'scope':'all','timezone':'UTC'},'origin')
        for _ in range(1000):
            job=exports.status(created['id'],'origin')
            if job['state']=='ready':break
            time.sleep(.01)
        exports.jobs[job['id']]['created']-=7200
        assert exports.status(job['id'],'origin')['state']=='ready'
        with pytest.raises(ExportError):exports.status(job['id'],'foreign-origin')
    finally:exports.close()
