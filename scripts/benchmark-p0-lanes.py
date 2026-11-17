"""Same-machine baseline/current scoped HTTP byte-engine microbenchmark.

No installation/native enrollment, browser decoding or owner data. Two paced
range readers and a 64-MiB verified copy overlap 1/4/10/32 mixed command bursts.
--runtime can point to a detached historical worktree; report only measurements,
not near-native performance or 30-minute acceptance.
"""
from __future__ import annotations
import argparse,concurrent.futures,hashlib,json,math,os,statistics,subprocess,sys,tempfile,threading,time
from pathlib import Path
from urllib.request import Request,ProxyHandler,build_opener
from urllib.error import HTTPError
parser=argparse.ArgumentParser();parser.add_argument('--runtime',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--backlog',type=int);args=parser.parse_args()
sys.path.insert(0,str(args.runtime.resolve()/'src'))
from chute.explorer import Explorer,RootGrant,Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer
from chute.store import Store
from PIL import Image
if args.backlog is not None:ChuteServer.request_queue_size=args.backlog
ORIGIN='chrome-extension://abcdefghijklmnopabcdefghijklmnop'

def stats(values):
    values=sorted(values)
    return {'count':len(values),**{k:round(values[min(len(values)-1,math.ceil(len(values)*p)-1)],3) for k,p in [('p50_ms',.5),('p95_ms',.95),('p99_ms',.99),('worst_ms',1)]}} if values else {'count':0}

def run():
    result={'source_commit':subprocess.check_output(['git','-C',str(args.runtime),'rev-parse','HEAD'],text=True).strip(),'platform':sys.platform,'python':sys.version.split()[0],'logical_cpus':os.cpu_count(),'listen_backlog':ChuteServer.request_queue_size,'scope':'In-process guarded HTTP fixture on synthetic files. Two paced byte readers, no browser decoder/native enrollment; not owner-machine or native Windows Explorer acceptance.','profiles':[]}
    with tempfile.TemporaryDirectory(prefix='chutey-lanes-') as temp:
        root=Path(temp);approved=root/'approved';approved.mkdir();destination=approved/'destination';destination.mkdir()
        for i in range(512):(approved/f'entry-{i:04}.txt').write_bytes(b'file metadata fixture')
        Image.effect_noise((1600,900),64).convert('RGB').save(approved/'thumbnail.png')
        with (approved/'media.mp4').open('wb') as f:
            for i in range(12):f.write(bytes([i])*1024**2)
        with (approved/'copy.bin').open('wb') as f:
            for i in range(64):f.write(bytes([i])*1024**2)
        original=hashlib.sha256((approved/'copy.bin').read_bytes()).hexdigest()
        engine=Explorer([RootGrant(approved,writable=True)]);session=Session(ORIGIN);api=ExplorerAPI(engine,session);server=ChuteServer(('127.0.0.1',0),Store(root/'store'));server.explorer_api=api
        server.RequestHandlerClass.log_message=lambda *a:None
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        base=f'http://127.0.0.1:{server.server_port}';headers={'Origin':ORIGIN,'Authorization':'Bearer '+session.token,'Content-Type':'application/json'}
        def request(route,body=None,extra=None):
            return build_opener(ProxyHandler({})).open(Request(base+route,data=json.dumps(body).encode() if body is not None else None,headers={**headers,**(extra or {})}),timeout=10)
        def command(name,payload=None):
            with request('/api/explorer/v1/command',{'command':name,'args':payload or {}}) as r:
                value=json.load(r)
                if value['state']!='completed':raise RuntimeError(value['error']['code'])
                return value['result']
        rows=command('list',{'handle':next(iter(engine.grants)),'limit':200,'sort':'name'})['entries']
        # Locate fixture files by engine stat, not a browser-provided filesystem path.
        grant=next(iter(engine.grants.values()))
        def record(name):return engine.execute('stat',handle=grant.handle((name,)))['result']
        thumb=record('thumbnail.png');media=record('media.mp4');copy=record('copy.bin');dest=record('destination');root_handle=grant.id
        try:
            try:command('performance_get');modes=['efficiency','balanced','turbo']
            except HTTPError:modes=['request3-fixed']
            for mode in modes:
                ack=command('performance_set',{'mode':mode}) if mode!='request3-fixed' else {'navigation_and_thumbnail_shared':4,'media':2,'intake':1}
                streams=[];readers=[];cancel=threading.Event();stream_errors=[]
                def reader(source):
                    try:
                        while not cancel.is_set():
                            with request(source['url'],extra={'Range':'bytes=0-'}) as r:
                                while not cancel.is_set() and r.read(262144):time.sleep(.04)
                    except Exception as e:stream_errors.append(type(e).__name__)
                for _ in range(2):
                    source=command('media_source',{k:media[k] for k in ('handle','identity')});streams.append(source)
                    t=threading.Thread(target=reader,args=(source,),daemon=True);t.start();readers.append(t)
                jid=os.urandom(16).hex();started=time.monotonic();job=command('transfer_start',{'id':jid,'kind':'local_copy','handle':copy['handle'],'identity':copy['identity'],'destination':dest['handle']})
                copy_end=[]
                def copy_finished():
                    api.jobs.jobs[jid]['thread'].join();copy_end.append(time.monotonic())
                copy_watcher=threading.Thread(target=copy_finished,daemon=True);copy_watcher.start()
                report={'mode':mode,'ack':ack,'bursts':[]}
                def operation(i):
                    kind=('list','search','thumbnail','control')[i%4];started=time.monotonic()
                    try:
                        if kind=='thumbnail':
                            with request('/api/explorer/v1/content',{**{k:thumb[k] for k in ('handle','identity')},'thumbnail':True}) as response:response.read()
                        else:command({'list':'list','search':'search','control':'capabilities'}[kind],{'handle':root_handle,'limit':100,**({'query':'entry'} if kind=='search' else {})} if kind!='control' else {})
                        return {'kind':kind,'ms':(time.monotonic()-started)*1000,'ok':True}
                    except HTTPError as error:
                        body=json.load(error);return {'kind':kind,'ms':(time.monotonic()-started)*1000,'ok':False,'code':body.get('error',{}).get('code',str(error.code))}
                for width in (1,4,10,32):
                    values=[]
                    with concurrent.futures.ThreadPoolExecutor(max_workers=width) as pool:
                        for _ in range(3):values.extend(pool.map(operation,range(width)))
                    report['bursts'].append({'width':width,'latency':stats([v['ms'] for v in values]),'by_operation':{kind:{'latency':stats([v['ms'] for v in values if v['kind']==kind]),'rejected':sum(not v['ok'] for v in values if v['kind']==kind)} for kind in ('list','search','thumbnail','control')},'accepted':sum(v['ok'] for v in values),'rejected':sum(not v['ok'] for v in values),'errors':sorted(set(v['code'] for v in values if not v['ok']))})
                while job['state'] in ('accepted','running'):
                    time.sleep(.05);job=command('transfer_status',{'id':jid})
                assert job['state']=='COMMITTED' and job['receipt']['sha256']==original,job
                copy_watcher.join();elapsed=copy_end[0]-started
                report['verified_copy']={'bytes':job['bytes'],'sha256':original,'verified_elapsed_seconds':round(elapsed,3),'verified_mib_per_second':round(64/elapsed,3),'overlap_run_wall_seconds':round(time.monotonic()-started,3)}
                command('transfer_dismiss',{'id':jid});cancel.set()
                for t in readers:t.join(20)
                for source in streams:command('release_media',{'ticket':source['ticket']})
                report['stream_reader_errors']=stream_errors
                result['profiles'].append(report)
                print(json.dumps({'mode':mode,'bursts':[{'width':b['width'],'latency':b['latency'],'accepted':b['accepted'],'rejected':b['rejected']} for b in report['bursts']]}),flush=True)
        finally:
            server.shutdown();server.server_close();worker.join();engine.close()
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
run()
