import hashlib,json,os,time,threading
from pathlib import Path
import pytest
from chute.explorer import Explorer,RootGrant,Session
from chute.explorer.api import ExplorerAPI
from chute.explorer.jobs import TransferJobs
from chute.explorer.protocol import ExplorerError
from chute.store import Store
ORIGIN='chrome-extension://abcdefghijklmnopabcdefghijklmnop'

@pytest.fixture
def fixture(tmp_path):
    source=tmp_path/'source';target=tmp_path/'target';source.mkdir();target.mkdir()
    file=source/'large.bin'
    with file.open('wb') as handle:
        for i in range(65):handle.write(bytes([i])*1024*1024)
    engine=Explorer([RootGrant(source),RootGrant(target,writable=True)]);session=Session(ORIGIN);api=ExplorerAPI(engine,session);store=Store(tmp_path/'store');jobs=TransferJobs(api,store)
    row=engine.execute('list',handle=next(iter(engine.grants)))['result']['entries'][0]
    destination=list(engine.grants)[1]
    yield source,target,engine,api,store,jobs,row,destination
    if jobs.active:
        jobs.cancel(jobs.active)
        for _ in range(1000):
            if not jobs.active:break
            time.sleep(.01)
    engine.close()

def wait(jobs,j):
    for _ in range(1500):
        j=jobs.status(j['id'])
        if j['state'] not in {'accepted','running'}:return j
        time.sleep(.01)
    pytest.fail('job timed out')

def start(jobs,api,**args):return jobs.start({'id':os.urandom(16).hex(),**args},'Bearer '+api.session.token)
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        while b:=f.read(262144):h.update(b)
    return h.hexdigest()

def test_real_large_native_copies_receipts_idempotence_restart(fixture):
    source,target,engine,api,store,jobs,row,destination=fixture
    original=sha(source/'large.bin')
    args={'id':'a'*32,'kind':'local_copy','handle':row['handle'],'identity':row['identity'],'destination':destination}
    j=wait(jobs,jobs.start(args,'Bearer '+api.session.token));assert j['state']=='COMMITTED',j
    assert j['bytes']==j['size']==65*1024**2 and j['receipt']['sha256']==original==sha(target/'large.bin')
    repeated=jobs.start(args,'Bearer '+api.session.token);assert repeated['state']=='COMMITTED' and len(list(target.iterdir()))==1
    live=wait(jobs,start(jobs,api,kind='local_to_live',handle=row['handle'],identity=row['identity']));assert live['state']=='COMMITTED',live
    ident=live['receipt']['file']['id'];assert sha(store.get(ident)[1])==original
    back=wait(jobs,start(jobs,api,kind='live_to_local',live_id=ident,destination=destination));assert back['state']=='COMMITTED',back
    assert sha(target/'large (1).bin')==original and (source/'large.bin').exists()
    restarted=TransferJobs(api,store);assert restarted.status(j['id'])['state']=='COMMITTED'
    assert len(list(target.iterdir()))==2

def test_cancel_and_no_space_leave_no_partial_success(fixture,monkeypatch):
    source,target,engine,api,store,jobs,row,destination=fixture
    import chute.explorer.jobs as module
    original=module.digest
    def slow(stream,check=lambda:None):
        def slower():time.sleep(.005);check()
        return original(stream,slower)
    monkeypatch.setattr(module,'digest',slow)
    job=start(jobs,api,kind='local_copy',handle=row['handle'],identity=row['identity'],destination=destination)
    jobs.cancel(job['id']);assert wait(jobs,job)['state']=='cancelled';assert not list(target.iterdir())
    import shutil
    monkeypatch.setattr(shutil,'disk_usage',lambda p:type('Disk',(),{'free':1})())
    job=wait(jobs,start(jobs,api,kind='local_copy',handle=row['handle'],identity=row['identity'],destination=destination));assert job['state']=='failed' and 'disk space' in job['error']
    assert not list(target.iterdir()) and (source/'large.bin').exists()

def test_unauthorized_changed_and_interrupted_receipts(fixture):
    source,target,engine,api,store,jobs,row,destination=fixture
    with pytest.raises(ExplorerError):start(jobs,api,kind='local_copy',handle=row['handle'],identity='wrong',destination=destination)
    with pytest.raises(ExplorerError):start(jobs,api,kind='local_copy',handle=row['handle'],identity=row['identity'],destination=next(iter(engine.grants)))
    fake={'id':'b'*32,'origin':ORIGIN,'state':'running','kind':'local_copy','size':99,'bytes':20}
    (jobs.directory/('b'*32+'.json')).write_text(json.dumps(fake))
    restarted=TransferJobs(api,store);assert restarted.status('b'*32)['state']=='UNCERTAIN'
    with pytest.raises(ExplorerError):restarted.dismiss('b'*32)

def test_terminal_state_and_capacity_publish_after_durable_receipt(fixture,monkeypatch):
    source,target,engine,api,store,jobs,row,destination=fixture
    entered=threading.Event();release=threading.Event()
    persist=jobs._persist
    def delayed(j):
        if j['state']=='COMMITTED':entered.set();assert release.wait(5)
        persist(j)
    monkeypatch.setattr(jobs,'_persist',delayed)
    first=start(jobs,api,kind='local_to_live',handle=row['handle'],identity=row['identity'])
    assert entered.wait(10)
    before=time.monotonic();pending=jobs.status(first['id'])
    assert pending['state']=='running' and pending['phase']=='committing_receipt'
    assert time.monotonic()-before<.5,'Status must stay responsive during slow durable receipt writes'
    release.set();finished=wait(jobs,first);assert finished['state']=='COMMITTED'
    second=start(jobs,api,kind='local_copy',handle=row['handle'],identity=row['identity'],destination=destination)
    jobs.cancel(second['id']);wait(jobs,second)
