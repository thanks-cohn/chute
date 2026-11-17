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

def verification(jobs,job):
    deadline=time.monotonic()+15
    while time.monotonic()<deadline:
        current=jobs.status(job['id'])
        if current.get('verification',{}).get('state')!='VERIFYING':return current
        time.sleep(.01)
    pytest.fail('verification timed out')

def test_receipt_reconciliation_revalidates_same_artifact_after_new_handles(fixture):
    source,target,engine,api,store,jobs,row,destination=fixture
    job=wait(jobs,start(jobs,api,kind='local_copy',handle=row['handle'],identity=row['identity'],destination=destination))
    assert jobs.verify(job['id'])['verification']['verified']
    renewed_engine=Explorer([RootGrant(target,writable=True)])
    renewed_api=ExplorerAPI(renewed_engine,Session(ORIGIN));renewed=TransferJobs(renewed_api,store)
    try:
        verified=renewed.verify(job['id'])
        assert verified['state']=='COMMITTED' and verified['verification']['verified']
        assert str(target) not in json.dumps(verified),'No private absolute destination leaks'
        # A changed file cannot be silently acknowledged as the original receipt.
        with (target/'large.bin').open('r+b') as stream:stream.write(b'altered')
        verification_result=verification(renewed,renewed.verify(job['id']))
        assert verification_result['verification']['verified'] is False
        assert verification_result['verification']['code']=='VERIFY_FAILED'
    finally:renewed_engine.close()

def test_legacy_receipt_needs_scoped_destination_and_keeps_evidence(fixture):
    source,target,engine,api,store,jobs,row,destination=fixture
    job=wait(jobs,start(jobs,api,kind='local_copy',handle=row['handle'],identity=row['identity'],destination=destination))
    private=jobs.jobs[job['id']];private.pop('artifact_identity');private.pop('destination_scope');jobs._persist(private)
    assert jobs.verify(job['id'])['verification']['code']=='DESTINATION_SCOPE_REQUIRED'
    confirmed=verification(jobs,jobs.verify(job['id'],destination))
    assert confirmed['verification']['verified'] and confirmed['state']=='COMMITTED'
    jobs.dismiss(job['id'])
    assert (jobs.directory/(job['id']+'.json')).exists(),'Acknowledgement preserves durable evidence'
    repeated=jobs.start({'id':job['id'],'kind':'local_copy','handle':row['handle'],'identity':row['identity'],'destination':destination},'Bearer '+api.session.token)
    assert repeated['state']=='COMMITTED' and len(list(target.iterdir()))==1
    uncertain={'id':'f'*32,'origin':ORIGIN,'state':'UNCERTAIN','kind':'local_copy','size':3,'bytes':1,'receipt':None}
    jobs._persist(uncertain)
    with pytest.raises(ExplorerError):jobs.dismiss(uncertain['id'])
    jobs.dismiss(uncertain['id'],reviewed=True)
    assert jobs.status(uncertain['id'])['dismissed'] is True
    assert json.loads((jobs.directory/(uncertain['id']+'.json')).read_text())['state']=='UNCERTAIN'

def test_native_clipboard_snapshot_uses_same_verified_copy_engine(fixture):
    import contextlib
    source,target,engine,api,store,jobs,row,destination=fixture
    grant=engine.grant_for(row['handle'])
    class NativeClipboard:
        @contextlib.contextmanager
        def read(self,snapshot,index):
            assert snapshot=='private-snapshot' and index==0
            with grant.open(row['handle']) as fd,os.fdopen(os.dup(fd),'rb') as stream:yield row,stream
    api.clipboard=NativeClipboard()
    job=wait(jobs,start(jobs,api,kind='clipboard_to_local',snapshot='private-snapshot',index=0,destination=destination))
    assert job['state']=='COMMITTED' and job['receipt']['sha256']==sha(source/'large.bin')==sha(target/'large.bin')
    with pytest.raises(ExplorerError):start(jobs,api,kind='clipboard_to_local',snapshot='private-snapshot',index=0,destination=destination,path=str(source/'large.bin'))

def test_status_is_responsive_during_slow_admission_fsync(fixture,monkeypatch):
    source,target,engine,api,store,jobs,row,destination=fixture
    entered=threading.Event();release=threading.Event();results=[]
    persist=jobs._persist
    def slow(job):
        if job['state']=='accepted':entered.set();assert release.wait(5)
        persist(job)
    monkeypatch.setattr(jobs,'_persist',slow)
    ident='e'*32
    thread=threading.Thread(target=lambda:results.append(jobs.start({'id':ident,'kind':'local_copy','handle':row['handle'],'identity':row['identity'],'destination':destination},'Bearer '+api.session.token)))
    thread.start();assert entered.wait(5)
    before=time.monotonic();status=jobs.status(ident)
    assert status['state']=='accepted' and status['phase']=='persisting_intent' and time.monotonic()-before<.5
    jobs.cancel(ident);release.set();thread.join(10);assert not thread.is_alive()
    assert wait(jobs,status)['state']=='cancelled' and not list(target.iterdir())

@pytest.mark.parametrize('revoke',[False,True])
def test_accepted_job_survives_bearer_expiry_but_not_explicit_revoke(fixture,monkeypatch,revoke):
    source,target,engine,api,store,jobs,row,destination=fixture
    import chute.explorer.jobs as module
    real_digest=module.digest;entered=threading.Event();release=threading.Event()
    def pause(stream,check=lambda:None):
        entered.set();assert release.wait(5)
        return real_digest(stream,check)
    monkeypatch.setattr(module,'digest',pause)
    job=start(jobs,api,kind='local_copy',handle=row['handle'],identity=row['identity'],destination=destination)
    assert entered.wait(5)
    api.session.expires=time.monotonic()-1
    if revoke:api.revoke_media()
    release.set();result=wait(jobs,job)
    if revoke:
        assert result['state']=='failed' and not list(target.iterdir())
    else:
        assert result['state']=='COMMITTED' and result['receipt']['sha256']==sha(target/'large.bin')
    with pytest.raises(ExplorerError):start(jobs,api,kind='local_copy',handle=row['handle'],identity=row['identity'],destination=destination)
