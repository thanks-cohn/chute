"""One bounded COPY queue reusing Transfers and guarded receive, no second engine."""
from __future__ import annotations
import json,os,re,threading,time,uuid
from pathlib import Path
from .protocol import ExplorerError
from .transfers import receive,digest

class TransferJobs:
    def __init__(self,api,store):
        self.api=api;self.store=store;self.lock=threading.RLock();self.jobs={};self.active=None
        import hashlib
        self.directory=store.root/'transfer-jobs'/hashlib.sha256(api.session.origin.encode()).hexdigest()[:32];self.directory.mkdir(parents=True,exist_ok=True)
        # Durable status survives worker restart. Old handles are never reused.
        for path in sorted(self.directory.glob('*.json'))[-64:]:
            try:
                job=json.loads(path.read_text());ident=job['id']
                if not re.fullmatch('[a-f0-9]{32}',ident) or job.get('origin')!=api.session.origin:continue
                if job['state'] in {'accepted','running'}:job.update(state='UNCERTAIN',error='Worker interrupted. Inspect the preserved destination before starting a new copy.')
                self.jobs[ident]=job
            except (OSError,ValueError,KeyError):continue

    def _persist(self,j):
        public={k:v for k,v in j.items() if k not in {'cancel','args','thread','authorization'}}
        path=self.directory/(j['id']+'.json');temp=path.with_suffix('.part')
        with temp.open('w',encoding='utf-8') as out:json.dump(public,out,ensure_ascii=False);out.flush();os.fsync(out.fileno())
        os.replace(temp,path)

    def start(self,args,authorization):
        if set(args)-{'id','kind','handle','identity','destination','live_id'}:raise ExplorerError('INVALID_ARGUMENT','Unknown transfer arguments.')
        ident=args.get('id');kind=args.get('kind')
        if not isinstance(ident,str) or not re.fullmatch('[a-f0-9]{32}',ident) or kind not in {'local_to_live','local_copy','live_to_local'}:raise ExplorerError('INVALID_ARGUMENT','A stable transfer ID and copy kind are required.')
        with self.lock:
            if ident in self.jobs:return self.status(ident)
            if self.active:raise ExplorerError('BUSY','One copy is already active. Cancel or wait for it before starting another.')
            if len(self.jobs)>=64:raise ExplorerError('JOURNAL_FULL','64 transfer receipts retained. Reconcile and dismiss an old receipt first.')
            if kind=='live_to_local':
                if set(args)!={'id','kind','live_id','destination'} or not self.store.get(args['live_id']):raise ExplorerError('NOT_FOUND','Choose a saved item.')
                size=self.store.get(args['live_id'])[0].size
            else:
                if set(args)!={'id','kind','handle','identity'} | ({'destination'} if kind=='local_copy' else set()):raise ExplorerError('INVALID_ARGUMENT','Choose a source handle and canonical identity.')
                meta=self.api.engine.execute('stat',handle=args['handle'])
                if meta['state']!='completed' or meta['result']['identity']!=args['identity'] or meta['result']['kind']!='file':raise ExplorerError('FILE_CHANGED','Refresh the source before copying.')
                size=meta['result']['size']
            if kind!='local_to_live':
                grant=self.api.engine.grant_for(args['destination'])
                if not grant.writable:raise ExplorerError('WRITE_CONSENT_REQUIRED','Approve destination writes first.')
                with grant.open(args['destination'],directory=True):pass
            j={'id':ident,'origin':self.api.session.origin,'state':'accepted','phase':'queued','kind':kind,'size':size,'bytes':0,'started':time.monotonic(),'args':args,'authorization':authorization,'cancel':threading.Event(),'error':None,'receipt':None}
            try:self._persist(j)
            except OSError:raise ExplorerError('NO_SPACE','Cannot persist a transfer intent. Check free disk space before retrying.')
            self.jobs[ident]=j;self.active=ident
            threading.Thread(target=self._run,args=(j,),daemon=True).start();return self.status(ident)

    def _best_persist(self,j):
        try:self._persist(j)
        except OSError:j.update(state='UNCERTAIN',error='Receipt persistence failed. Check free disk space and inspect the destination before retrying.')

    def status(self,ident):
        with self.lock:
            j=self.jobs.get(ident)
            if not j:raise ExplorerError('NOT_FOUND','Transfer not found.')
            return {k:j.get(k) for k in ('id','state','phase','kind','size','bytes','error','receipt')}

    def cancel(self,ident):
        with self.lock:
            j=self.jobs.get(ident)
            if not j:raise ExplorerError('NOT_FOUND','Transfer not found.')
            if j['state'] in {'accepted','running'}:j['cancel'].set()
            return self.status(ident)

    def dismiss(self,ident):
        with self.lock:
            j=self.jobs.get(ident)
            if not j or j['state'] not in {'COMMITTED','cancelled','failed'}:raise ExplorerError('RECONCILE_REQUIRED','Only a final receipt may be dismissed; uncertain copies must be inspected first.')
            (self.directory/(ident+'.json')).unlink(missing_ok=True);del self.jobs[ident];return {'dismissed':True}

    def _published_live(self,j):
        return bool(self.store.get(j['id'])) or any(self.store.files_dir.glob(j['id']+'-*'))

    def _run(self,j):
        committed=False
        def check():
            if j['cancel'].is_set():raise ExplorerError('CANCELLED','Copy cancelled before publication.')
            self.api.session.authorize(self.api.session.origin,j['authorization'])
        def progress(n):
            j['bytes']+=n;j['phase']='verifying_destination' if j['bytes']==j['size'] else 'copying'
        try:
            j['state']='running';j['phase']='verifying_source';self._persist(j);a=j['args'];check()
            if j['kind']=='local_to_live':
                with self.api.engine.lock:source=self.api.transfers.prepare(a['handle'],a['identity'])
                receipt=self.api.transfers.to_live(source['capability'],self.store,authorize=check,item_id=j['id'],progress=progress)
            else:
                if j['kind']=='local_copy':
                    with self.api.engine.lock:source=self.api.transfers.prepare(a['handle'],a['identity'])
                    context=self.api.transfers.read(source['capability'])
                else:
                    import contextlib
                    @contextlib.contextmanager
                    def saved():
                        item,path=self.store.get(a['live_id'])
                        with path.open('rb') as stream:yield {'name':item.name,'size':os.fstat(stream.fileno()).st_size},stream
                    context=saved()
                with context as (row,stream):
                    expected=digest(stream,check);stream.seek(0)
                    class Source:
                        def read(self,size):check();block=stream.read(size);progress(len(block));return block
                    receipt=receive(self.api.engine.grant_for(a['destination']),a['destination'],row['name'],Source(),row['size'],expected_sha256=expected,authorize=check)
                    committed=receipt['state']=='COMMITTED'
            committed=True;j.update(state='COMMITTED',phase='complete',receipt=receipt,bytes=j['size']);self._persist(j)
        except ExplorerError as exc:
            j.update(state='UNCERTAIN' if committed or exc.code=='UNCERTAIN' or self._published_live(j) else 'cancelled' if exc.code=='CANCELLED' else 'failed',error=str(exc));self._best_persist(j)
        except Exception:
            j.update(state='UNCERTAIN' if committed or self._published_live(j) else 'failed',error='Copy interrupted or destination disk/access failed. Inspect its receipt and destination before retrying.');self._best_persist(j)
        finally:
            j.pop('authorization',None);j.pop('args',None)
            with self.lock:self.active=None
