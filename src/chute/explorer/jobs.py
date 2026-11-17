"""One bounded COPY queue reusing Transfers and guarded receive, no second engine."""
from __future__ import annotations
import contextlib,json,os,re,threading,time,uuid
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
                job=json.loads(path.read_text(encoding="utf-8"));ident=job['id']
                if not re.fullmatch('[a-f0-9]{32}',ident) or job.get('origin')!=api.session.origin:continue
                if job['state'] in {'accepted','running'}:job.update(state='UNCERTAIN',error='Worker interrupted. Inspect the preserved destination before starting a new copy.')
                if not job.get('dismissed'):self.jobs[ident]=job
            except (OSError,ValueError,KeyError):continue

    def _persist(self,j):
        public={k:v for k,v in j.items() if k not in {'cancel','args','thread','authorization','session','permission_context','deadline'}}
        path=self.directory/(j['id']+'.json');temp=path.with_suffix('.part')
        with temp.open('w',encoding='utf-8') as out:json.dump(public,out,ensure_ascii=False);out.flush();os.fsync(out.fileno())
        os.replace(temp,path)

    def _get(self,ident):
        if not isinstance(ident,str) or not re.fullmatch('[a-f0-9]{32}',ident):raise ExplorerError('INVALID_ARGUMENT','A transfer ID is required.')
        job=self.jobs.get(ident)
        if job is None:
            try:
                job=json.loads((self.directory/(ident+'.json')).read_text(encoding='utf-8'))
                if job.get('origin')!=self.api.session.origin:raise ValueError()
                if job.get('state') in {'accepted','running'}:job={**job,'state':'UNCERTAIN','error':'Worker interrupted. Review the preserved destination before retrying.'}
            except (OSError,ValueError):raise ExplorerError('NOT_FOUND','Transfer receipt not found. Its completion is unknown; review the destination before retrying.')
        return job

    def _root_key(self,grant):
        grant.stat(grant.id)  # revocation/root replacement checks remain authoritative
        if grant.windows:return ['windows',*grant.windows.root_key]
        info=os.fstat(grant.fd);return ['posix',info.st_dev,info.st_ino]

    @contextlib.contextmanager
    def _artifact(self,j,destination=None):
        receipt=j.get('receipt') or {}
        expected=receipt.get('sha256')
        if not isinstance(expected,str) or re.fullmatch('[a-f0-9]{64}',expected) is None:
            raise ExplorerError('RECEIPT_INCOMPLETE','No verified digest is recorded. Review the preserved destination manually.')
        if j['kind']=='local_to_live':
            found=self.store.get(receipt.get('file',{}).get('id',''))
            if not found:raise ExplorerError('NOT_FOUND','Saved destination file is unavailable.')
            with found[1].open('rb') as stream:
                info=os.fstat(stream.fileno())
                yield stream,['stored',info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns],None
            return
        from .security import component
        name=component(receipt.get('name',''))
        if destination:
            grant=self.api.engine.grant_for(destination)
            parts=grant.parts(destination)
            with grant.open(destination,directory=True):pass
        else:
            scope=j.get('destination_scope') or {}
            grant=None
            for candidate in list(self.api.engine.grants.values()):
                try:
                    if self._root_key(candidate)==scope.get('root'):grant=candidate;break
                except (OSError,ExplorerError):continue
            if grant is None:raise ExplorerError('DESTINATION_SCOPE_REQUIRED','Select the approved destination folder, then Verify destination.')
            parts=tuple(component(part) for part in scope.get('parts',[]))
        handle=grant.handle(parts+(name,))
        with grant.open(handle) as fd,os.fdopen(os.dup(fd),'rb') as stream:
            row=self.api.engine._record(grant,parts+(name,),os.fstat(fd),fd=fd)
            yield stream,row['identity'],{'root':self._root_key(grant),'parts':list(parts)}

    def start(self,args,authorization):
        self.api.session.authorize(self.api.session.origin,authorization)
        if set(args)-{'id','kind','handle','identity','destination','live_id','snapshot','index'}:raise ExplorerError('INVALID_ARGUMENT','Unknown transfer arguments.')
        ident=args.get('id');kind=args.get('kind')
        if not isinstance(ident,str) or not re.fullmatch('[a-f0-9]{32}',ident) or kind not in {'local_to_live','local_copy','live_to_local','clipboard_to_local'}:raise ExplorerError('INVALID_ARGUMENT','A stable transfer ID and copy kind are required.')
        with self.lock:
            if ident in self.jobs or (self.directory/(ident+'.json')).exists():return self.status(ident)
            if self.active:raise ExplorerError('BUSY','One copy is already active. Cancel or wait for it before starting another.')
        if kind=='live_to_local':
            if set(args)!={'id','kind','live_id','destination'} or not self.store.get(args['live_id']):raise ExplorerError('NOT_FOUND','Choose a saved item.')
            size=self.store.get(args['live_id'])[0].size
        elif kind=='clipboard_to_local':
            if set(args)!={'id','kind','snapshot','index','destination'} or type(args['index']) is not int:raise ExplorerError('INVALID_ARGUMENT','Choose a native clipboard snapshot and file index.')
            if not getattr(self.api,'clipboard',None):raise ExplorerError('CLIPBOARD_UNAVAILABLE','Native clipboard support is unavailable.')
            with self.api.clipboard.read(args['snapshot'],args['index']) as (row,stream):size=row['size']
        else:
            if set(args)!={'id','kind','handle','identity'} | ({'destination'} if kind=='local_copy' else set()):raise ExplorerError('INVALID_ARGUMENT','Choose a source handle and canonical identity.')
            meta=self.api.engine.execute('stat',handle=args['handle'])
            if meta['state']!='completed' or meta['result']['identity']!=args['identity'] or meta['result']['kind']!='file':raise ExplorerError('FILE_CHANGED','Refresh the source before copying.')
            size=meta['result']['size']
        if kind!='local_to_live':
            grant=self.api.engine.grant_for(args['destination'])
            if not grant.writable:raise ExplorerError('WRITE_CONSENT_REQUIRED','Approve destination writes first.')
            with grant.open(args['destination'],directory=True):pass
        # Accepted jobs hold only their fixed source/destination authority. Broad
        # client-session expiry must not abort a multi-hour copy. Explicit grant
        # revocation, cancellation and a hard 24-hour job deadline still stop it.
        j={'id':ident,'origin':self.api.session.origin,'state':'accepted','phase':'queued','kind':kind,'size':size,'bytes':0,'started':time.monotonic(),'args':args,'permission_context':self.api.media_context,'deadline':time.monotonic()+86400,'cancel':threading.Event(),'error':None,'receipt':None}
        if kind!='local_to_live':j['destination_scope']={'root':self._root_key(grant),'parts':list(grant.parts(args['destination']))}
        with self.lock:
            if ident in self.jobs or (self.directory/(ident+'.json')).exists():return self.status(ident)
            if self.active:raise ExplorerError('BUSY','One copy is already active. Cancel or wait for it before starting another.')
            if len(self.jobs)>=64:raise ExplorerError('JOURNAL_FULL','Review existing transfer receipts before starting more copies.')
            j['phase']='persisting_intent';self.jobs[ident]=j;self.active=ident
        # Admission fsync must not monopolize status/cancellation on a slow disk.
        try:self._persist(j)
        except OSError:
            with self.lock:
                j.update(state='failed',error='Cannot persist the copy intent. No copy was started; check free disk space.');self.active=None
            raise ExplorerError('NO_SPACE','Cannot persist a transfer intent. Check free disk space before retrying.')
        thread=threading.Thread(target=self._run,args=(j,),daemon=True);j['thread']=thread
        thread.start();return self.status(ident)


    def _finish(self,j,state,**values):
        # fsync may be slow on Windows: keep status/cancellation responsive and
        # report RUNNING until durable commit. Publish terminal state and free
        # capacity together, so a completed receipt never leaves spurious BUSY.
        with self.lock:
            j['phase']='committing_receipt'
            final={**j,**values,'state':state}
        try:self._persist(final)
        except OSError:final.update(state='UNCERTAIN',error='Receipt persistence failed. Inspect the destination before retrying.')
        with self.lock:
            j.update(final)
            if self.active==j['id']:self.active=None

    def status(self,ident):
        with self.lock:
            j=self._get(ident)
            return {k:j.get(k) for k in ('id','state','phase','kind','size','bytes','error','receipt','verification','dismissed')}

    def cancel(self,ident):
        with self.lock:
            j=self._get(ident)
            if j['state'] in {'accepted','running'} or j.get('verification',{}).get('state')=='VERIFYING':j['cancel'].set()
            return self.status(ident)

    def dismiss(self,ident,reviewed=False):
        with self.lock:
            j=self._get(ident)
            if j['state'] in {'accepted','running'} or j.get('verification',{}).get('state')=='VERIFYING':raise ExplorerError('RECONCILE_REQUIRED','The copy or verification is still active.')
            if j['state']=='COMMITTED' and not reviewed:
                self._persist({**j,'dismissed':True,'acknowledged_at':time.time()});self.jobs.pop(ident,None)
            elif reviewed is True:
                # Keep the original job and evidence, including uncertainty. Only
                # dismiss its UI blocking state after an explicit destination review.
                self._persist({**j,'dismissed':True,'reviewed_at':time.time()});self.jobs.pop(ident,None)
            else:raise ExplorerError('RECONCILE_REQUIRED','Review the failed, cancelled or uncertain destination before dismissal.')
            return {'dismissed':True,'evidence_preserved':reviewed is True}

    def verify(self,ident,destination=None):
        with self.lock:
            j=self._get(ident)
            if j['state'] in {'accepted','running'}:return self.status(ident)
            if j.get('verification',{}).get('state')=='VERIFYING':return self.status(ident)
            if j['state'] not in {'COMMITTED','UNCERTAIN'}:return self.status(ident)
        try:
            with self._artifact(j,destination) as (stream,identity,scope):
                size=os.fstat(stream.fileno()).st_size
                expected_size=(j.get('receipt') or {}).get('size',(j.get('receipt') or {}).get('file',{}).get('size'))
                if j.get('artifact_identity')==identity and size==expected_size:
                    with self.lock:j['verification']={'state':'VERIFIED','verified':True};self.jobs[ident]=j
                    return self.status(ident)
        except (OSError,ExplorerError) as exc:
            with self.lock:
                j['verification']={'state':'REVIEW_REQUIRED','verified':False,'code':getattr(exc,'code','UNAVAILABLE'),'message':str(exc) if isinstance(exc,ExplorerError) else 'Destination is missing, changed or unavailable.'};self.jobs[ident]=j
            return self.status(ident)
        with self.lock:
            if self.active:raise ExplorerError('BUSY','Wait for the active copy before verifying this destination.')
            self.active=ident;j['verification']={'state':'VERIFYING','verified':False};j['cancel']=threading.Event();self.jobs[ident]=j
            thread=threading.Thread(target=self._verify,args=(j,destination),daemon=True);j['thread']=thread;thread.start()
            return self.status(ident)

    def _verify(self,j,destination):
        permission_context=self.api.media_context;deadline=time.monotonic()+86400
        def check():
            if j['cancel'].is_set():raise ExplorerError('CANCELLED','Verification cancelled; original job evidence retained.')
            if permission_context['revoked']:raise ExplorerError('UNAUTHORIZED','Folder access was explicitly revoked.')
            if time.monotonic()>=deadline:raise ExplorerError('EXPIRED','Verification exceeded its bounded job deadline.')
        try:
            with self._artifact(j,destination) as (stream,identity,scope):
                actual=digest(stream,check);size=os.fstat(stream.fileno()).st_size
                expected=j['receipt'];expected_size=expected.get('size',expected.get('file',{}).get('size'))
                if actual!=expected['sha256'] or size!=expected_size:raise ExplorerError('VERIFY_FAILED','Destination does not match the recorded copy digest. Original job evidence retained.')
            update={'artifact_identity':identity,'verification':{'state':'VERIFIED','verified':True},'error':None}
            if scope:update['destination_scope']=scope
            self._finish(j,'COMMITTED',**update)
        except (ExplorerError,OSError) as exc:
            with self.lock:
                j['verification']={'state':'REVIEW_REQUIRED','verified':False,'code':getattr(exc,'code','UNAVAILABLE'),'message':str(exc) if isinstance(exc,ExplorerError) else 'Destination verification failed.'}
        finally:
            with self.lock:
                if self.active==j['id']:self.active=None

    def _published_live(self,j):
        return bool(self.store.get(j['id'])) or any(self.store.files_dir.glob(j['id']+'-*'))

    def _run(self,j):
        committed=False
        def check():
            if j['cancel'].is_set():raise ExplorerError('CANCELLED','Copy cancelled before publication.')
            if j['permission_context']['revoked']:raise ExplorerError('UNAUTHORIZED','Folder access was explicitly revoked.')
            if time.monotonic()>=j['deadline']:raise ExplorerError('EXPIRED','Copy exceeded its bounded job deadline. Review the destination.')
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
                elif j['kind']=='clipboard_to_local':
                    context=self.api.clipboard.read(a['snapshot'],a['index'])
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
            committed=True;j['receipt']=receipt
            with self._artifact(j) as (stream,identity,scope):
                j['artifact_identity']=identity
                if scope:j['destination_scope']=scope
            self._finish(j,'COMMITTED',phase='complete',receipt=receipt,bytes=j['size'],verification={'state':'VERIFIED','verified':True})
        except ExplorerError as exc:
            self._finish(j,'UNCERTAIN' if committed or exc.code=='UNCERTAIN' or self._published_live(j) else 'cancelled' if exc.code=='CANCELLED' else 'failed',error=str(exc))
        except Exception:
            self._finish(j,'UNCERTAIN' if committed or self._published_live(j) else 'failed',error='Copy interrupted or destination disk/access failed. Inspect its receipt and destination before retrying.')
        finally:
            j.pop('args',None);j.pop('permission_context',None);j.pop('deadline',None)
            with self.lock:
                if self.active==j['id']:self.active=None
