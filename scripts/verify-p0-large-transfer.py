"""Disposable GiB-scale API copy/byte-stream stress, not a decoder/Windows test.
Two paced authorized range readers overlap two sequential, verified native jobs.
Never installs a worker, reads an owner grant or accepts a filesystem source path.
"""
from __future__ import annotations
import argparse,hashlib,json,os,shutil,sys,tempfile,threading,time,tracemalloc
from pathlib import Path
from urllib.request import Request,ProxyHandler,build_opener
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
from chute.explorer import Explorer,RootGrant,Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer,ChuteHandler
from chute.store import Store
from chute.runtime_log import resource_snapshot

def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--mib',type=int,default=1024);p.add_argument('--output',type=Path,required=True);args=p.parse_args();assert 64<=args.mib<=4096
    with tempfile.TemporaryDirectory(prefix='chutey-large-copy-') as temporary:
        root=Path(temporary);assert shutil.disk_usage(root).free>(args.mib*3+512)*1024**2,'Insufficient expendable fixture disk space'
        approved=root/'approved';approved.mkdir();destination=approved/'destination';destination.mkdir();source=approved/'source.mp4'
        pattern=bytes(range(256))*4096;expected=hashlib.sha256()
        with source.open('wb') as out:
            for _ in range(args.mib):out.write(pattern);expected.update(pattern)
            out.flush();os.fsync(out.fileno())
        for i in range(100):(approved/f'metadata-{i:03}.txt').write_bytes(b'fixture')
        original=expected.hexdigest();engine=Explorer([RootGrant(approved,writable=True)]);session=Session('chrome-extension://abcdefghijklmnopabcdefghijklmnop')
        class Quiet(ChuteHandler):
            def log_message(self,*args):pass
        server=ChuteServer(('127.0.0.1',0),Store(root/'store'));server.RequestHandlerClass=Quiet;server.explorer_api=ExplorerAPI(engine,session)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start();base=f'http://127.0.0.1:{server.server_port}'
        headers={'Origin':session.origin,'Authorization':'Bearer '+session.token,'Content-Type':'application/json'}
        def command(name,payload=None):
            req=Request(base+'/api/explorer/v1/command',data=json.dumps({'command':name,'args':payload or {}}).encode(),headers=headers)
            with build_opener(ProxyHandler({})).open(req,timeout=15) as r:value=json.load(r)
            assert value['state']=='completed',value
            return value['result']
        grant=next(iter(engine.grants.values()));meta=command('stat',{'handle':grant.handle(('source.mp4',))});destination_handle=grant.handle(('destination',));cancel=threading.Event();readers=[];leases=[];stream_results=[]
        def stream(lease):
            count=0;started=time.monotonic()
            try:
                while not cancel.is_set():
                    req=Request(base+lease['url'],headers={**headers,'Range':'bytes=0-'})
                    with build_opener(ProxyHandler({})).open(req,timeout=20) as response:
                        assert response.status==206 and response.headers['Accept-Ranges']=='bytes'
                        while not cancel.is_set():
                            block=response.read(262144)
                            if not block:break
                            count+=len(block);time.sleep(.02)
                stream_results.append({'state':'PASS','bytes':count,'elapsed_seconds':round(time.monotonic()-started,3)})
            except Exception as error:stream_results.append({'state':'FAIL','type':type(error).__name__})
        report={'scope':'Linux/in-process HTTP fixture with synthetic .mp4 bytes, no video decoding, native messaging, installed Windows, 4-GB device or near-native claim. Two paced range readers (~100 Mbit/s each) and actual large verified copies.','source_commit':__import__('subprocess').check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'source_bytes':source.stat().st_size,'jobs':[],'resources_before':resource_snapshot()}
        tracemalloc.start();latencies=[];last_renew=time.monotonic();active=None
        try:
            for _ in range(2):
                lease=command('media_source',{k:meta[k] for k in ('handle','identity')});leases.append(lease);thread=threading.Thread(target=stream,args=(lease,),daemon=True);thread.start();readers.append(thread)
            for index in range(2):
                started=time.monotonic();active=command('transfer_start',{'id':os.urandom(16).hex(),'kind':'local_copy','handle':meta['handle'],'identity':meta['identity'],'destination':destination_handle})
                while active['state'] in ('accepted','running'):
                    assert time.monotonic()-started<180,'Copy exceeded bounded stress deadline'
                    before=time.monotonic();command('list',{'handle':grant.id,'limit':100});command('performance_get');latencies.append((time.monotonic()-before)*1000)
                    active=command('transfer_status',{'id':active['id']})
                    if time.monotonic()-last_renew>30:
                        for lease in leases:command('renew_media',{'ticket':lease['ticket']})
                        last_renew=time.monotonic()
                    time.sleep(.025)
                elapsed=time.monotonic()-started
                assert active['state']=='COMMITTED' and active['receipt']['sha256']==original,active
                copied=destination/active['receipt']['name'];assert copied.stat().st_size==args.mib*1024**2 and digest(copied)==original
                report['jobs'].append({'state':'COMMITTED','size':copied.stat().st_size,'sha256':original,'verified_end_to_end_seconds':round(elapsed,3),'verified_mib_per_second':round(args.mib/elapsed,3)})
                command('transfer_dismiss',{'id':active['id']});active=None
            assert digest(source)==original
            cancel.set()
            for thread in readers:thread.join(25)
            assert len(stream_results)==2 and all(v['state']=='PASS' and v['bytes']>0 for v in stream_results),stream_results
            values=sorted(latencies);report.update(result='PASS',streams=stream_results,control_list_plus_metrics_latency={'count':len(values),'p50_ms':round(values[len(values)//2],3),'p95_ms':round(values[min(len(values)-1,int(len(values)*.95))],3),'worst_ms':round(max(values),3)},resources_after=resource_snapshot(),traced_python_peak_bytes=tracemalloc.get_traced_memory()[1],performance=command('performance_get'))
            args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
        finally:
            cancel.set()
            if active and active['state'] in ('accepted','running'):command('transfer_cancel',{'id':active['id']})
            for thread in readers:thread.join(25)
            for lease in leases:command('release_media',{'ticket':lease['ticket']})
            if active:
                job=server.explorer_api.jobs.jobs.get(active['id']);job['thread'].join(30)
            tracemalloc.stop();server.shutdown();server.server_close();worker.join();engine.close()
if __name__=='__main__':main()
