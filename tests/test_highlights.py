import io,os,sqlite3,threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from zoneinfo import ZoneInfo
import pytest
from chute.store import Store
from chute.highlights import Highlights,saved_text_page

def test_exact_daily_bytes_timestamp_two_empty_lines_and_restart(tmp_path):
    store=Store(tmp_path);times=iter([datetime(2026,11,1,1,10,tzinfo=ZoneInfo('America/Chicago')),datetime(2026,11,1,1,15,tzinfo=ZoneInfo('America/Chicago'),fold=1),datetime(2026,11,2,0,0,tzinfo=ZoneInfo('America/Chicago'))])
    highlights=Highlights(store,lambda:next(times));store.highlights=highlights
    first=highlights.accept('a'*32,'é 😀\nline 2\n\n'.encode());second=highlights.accept('b'*32,'text <script>no()</script>\n'.encode())
    path=highlights.lookup('a'*32)['path'];expected='2026-11-01 01:10:00-05:00\né 😀\nline 2\n\n\n2026-11-01 01:15:00-06:00\ntext <script>no()</script>'
    assert path.read_bytes()==expected.encode('utf-8')
    assert second['entry_offset']==expected.encode().index(b'2026-11-01 01:15')
    original=store.get('a'*32)[1].read_bytes();assert original=='2026-11-01 01:10:00-05:00\né 😀\nline 2'.encode()
    store.remove('a'*32)
    repeated=highlights.accept('a'*32,'é 😀\nline 2\n\n'.encode());assert repeated['received_at']==first['received_at']
    assert path.read_bytes()==expected.encode() and 'a'*32 not in store.active_ids()
    third=highlights.accept('c'*32,b'new day');assert highlights.lookup('c'*32)['path']!=path
    restarted=Store(tmp_path);assert restarted.get('a'*32)[1].read_bytes()==original
    assert restarted.highlights.lookup('a'*32)['path'].read_bytes()==expected.encode()
    assert restarted.recall('a'*32)
    with pytest.raises(ValueError):highlights.accept('a'*32,b'different')
    assert sum(len(store.history_day(day)) for day in store.history_dates())==3

def test_concurrent_captures_and_bounded_unicode_pages(tmp_path):
    store=Store(tmp_path);h=Highlights(store,lambda:datetime.fromisoformat('2026-11-16T23:59:59-06:00'));store.highlights=h
    with ThreadPoolExecutor(max_workers=8) as pool:
        receipts=list(pool.map(lambda i:h.accept(f'{i:032x}',(('é😀 long word '+str(i)+'\n')*9000).encode()),range(8)))
    path=h.lookup(receipts[0]['capture_id'])['path'];raw=path.read_bytes()
    assert raw.count(b'2026-11-16 23:59:59-06:00')==8 and len(store.list())==8
    texts=[];offset=0
    while True:
        page=saved_text_page(store,receipts[0]['capture_id'],offset,65536);texts.append(page['text'])
        if page['next'] is None:break
        assert page['next']>offset;offset=page['next']
    assert ''.join(texts).encode()==raw and '�' not in ''.join(texts)

def test_recovery_after_partial_daily_write_and_metadata_crash(tmp_path,monkeypatch):
    store=Store(tmp_path);h=Highlights(store,lambda:datetime.fromisoformat('2026-11-16T12:00:00-06:00'));store.highlights=h
    def interrupted(db):raise OSError('simulated power loss after durable journal')
    monkeypatch.setattr(h,'_recover',interrupted)
    with pytest.raises(OSError):h.accept('d'*32,'Recover é😀'.encode())
    with h._db() as db:
        row=db.execute('SELECT * FROM captures JOIN days USING(day)').fetchone();path=h._document(row['day'],row['document']);path.write_bytes(bytes(row['payload'])[:9])
    restarted=Store(tmp_path);assert restarted.get('d'*32)
    assert restarted.highlights.lookup('d'*32)['path'].read_text(encoding='utf-8')=='2026-11-16 12:00:00-06:00\nRecover é😀'
    assert len(restarted.list())==1 and len(restarted.history_day('2026-11-16'))==1

def test_changed_original_preserved_and_bad_parameters(tmp_path,monkeypatch):
    store=Store(tmp_path);h=Highlights(store);store.highlights=h
    def interrupted(db):raise OSError()
    monkeypatch.setattr(h,'_recover',interrupted)
    with pytest.raises(OSError):h.accept('e'*32,b'original')
    with h._db() as db:
        row=db.execute('SELECT * FROM captures JOIN days USING(day)').fetchone();path=h._document(row['day'],row['document']);path.write_bytes(b'owner changed this')
    assert Store(tmp_path).highlights.recovery_error
    assert path.read_bytes()==b'owner changed this'
    for ident,raw in [('../bad',b'a'),('f'*32,b'\xff'),('f'*32,b'\n\n')]:
        with pytest.raises((ValueError,UnicodeError)):h.accept(ident,raw)

def test_partial_capture_and_history_append_finish_exactly_once(tmp_path,monkeypatch):
    from chute.store import _HISTORY_MAGIC,_HISTORY_COLUMNS,_encode_field
    store=Store(tmp_path);h=Highlights(store,lambda:datetime.fromisoformat('2026-11-16T12:00:00-06:00'));store.highlights=h
    def interrupted(db):raise OSError()
    monkeypatch.setattr(h,'_recover',interrupted)
    with pytest.raises(OSError):h.accept('a'*32,b'pending text')
    with h._db() as db:
        row=db.execute('SELECT * FROM captures JOIN days USING(day)').fetchone()
        name='Chutey Highlights '+row['day']+'.txt';stored=row['id']+'-'+name;payload=bytes(row['payload'])
        (store.files_dir/('.'+row['id']+'.highlight.part')).write_bytes(payload[:4])
        fields=(row['received'],'add',row['id'],name,stored,str(len(payload)),'text/plain;charset=utf-8',row['source'])
        record=('\t'.join(_encode_field(v) for v in fields)+'\n').encode()
        store._history_path(row['received']).write_bytes((_HISTORY_MAGIC+_HISTORY_COLUMNS).encode()+record[:35])
    restarted=Store(tmp_path);assert restarted.highlights.recovery_error is None
    assert len(restarted.history_day('2026-11-16'))==1
    assert restarted.get('a'*32)[1].read_bytes()==payload
    assert restarted.highlights.lookup('a'*32)['path'].read_bytes()==payload
