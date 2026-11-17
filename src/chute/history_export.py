"""Read-only snapshot ledger export. One ZIP64 archive, bounded event buffers."""
from __future__ import annotations
import csv,hashlib,io,json,os,re,secrets,shutil,tempfile,threading,time,zipfile
from datetime import date,datetime,timezone
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
from .store import _LOCK

class ExportError(ValueError): pass

class HistoryExports:
    def __init__(self,store):
        self.store=store;self.jobs={};self.lock=threading.RLock()
        import atexit
        atexit.register(self.close)
        self.stopping=threading.Event()
        threading.Thread(target=self._janitor,daemon=True).start()

    def _janitor(self):
        while not self.stopping.wait(60):
            with self.lock:self.expire()

    def close(self):
        self.stopping.set()
        with self.lock:
            for job in self.jobs.values():
                job['cancel'].set()
                if job['state'] not in {'accepted','running'}:shutil.rmtree(job['directory'],ignore_errors=True)

    def create(self,args,owner,origin=""):
        if set(args)-{'scope','timezone','from','to'}:raise ExportError('Unknown export parameter.')
        scope=args.get('scope');zone=args.get('timezone')
        if scope not in {'all','today','range'} or not isinstance(zone,str):raise ExportError('Select a scope and local timezone.')
        try:tz=ZoneInfo(zone)
        except (ZoneInfoNotFoundError,ValueError):raise ExportError('Unknown local timezone.')
        cutoff=datetime.now(timezone.utc)
        start=end=None
        if scope=='today':start=end=cutoff.astimezone(tz).date()
        if scope=='range':
            try:
                start=date.fromisoformat(args['from']);end=date.fromisoformat(args['to'])
                if str(start)!=args['from'] or str(end)!=args['to'] or start>end:raise ValueError()
            except (ValueError,TypeError,KeyError):raise ExportError('Use an inclusive From/To range, with From no later than To.')
        with self.lock:
            self.expire()
            if any(j['state'] in {'accepted','running'} for j in self.jobs.values()):raise ExportError('An export is running. Wait or cancel it first.')
            if sum(j['state']=='ready' for j in self.jobs.values())>=4:raise ExportError('Download or cancel an earlier export first.')
            # Capture byte cutoffs under the same lock as appends. Later saves
            # are excluded, including the tail of an unfinished snapshot line.
            for ident,j in list(self.jobs.items()):
                if len(self.jobs)>16 and j["state"] in {"failed","cancelled"}:del self.jobs[ident]
            snapshots=[]
            with _LOCK:
                for path in sorted(self.store.history_dir.glob('????-??-??.tsv')):
                    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}\.tsv',path.name) or path.is_symlink():raise ExportError('Unsafe history snapshot.')
                    st=path.stat();snapshots.append((path,st.st_dev,st.st_ino,st.st_size))
            ident=secrets.token_urlsafe(24);ticket=secrets.token_urlsafe(32)
            directory=Path(tempfile.mkdtemp(prefix='chutey-history-export-'))
            job={'id':ident,'ticket':ticket,'owner':owner,'origin':origin,'state':'accepted','count':0,'phase':'snapshot','cancel':threading.Event(),'created':time.monotonic(),'directory':directory,'path':directory/'history.zip','scope':scope,'timezone':zone,'from':str(start) if start else None,'to':str(end) if end else None,'cutoff':cutoff.isoformat(),'snapshots':snapshots,'tz':tz,'error':None}
            span='all' if scope=='all' else str(start)+'_to_'+str(end)
            job['filename']='chutey-history-'+span+'-'+cutoff.strftime('%Y%m%dT%H%M%SZ')+'.zip'
            self.jobs[ident]=job
            threading.Thread(target=self._build,args=(job,),daemon=True).start()
            return self.status(ident,owner)

    def _events(self,j):
        for path,dev,ino,limit in j['snapshots']:
            st=path.stat()
            if path.is_symlink() or (st.st_dev,st.st_ino)!=(dev,ino) or st.st_size<limit:raise ExportError('History changed incompatibly during the snapshot. Retry.')
            with path.open('rb') as handle:
                left=limit
                while left:
                    if j['cancel'].is_set():raise InterruptedError()
                    raw=handle.readline(min(left,1024*1024+1));left-=len(raw)
                    if not raw:raise ExportError('History snapshot ended early.')
                    if len(raw)>1024*1024:raise ExportError('A history metadata record exceeds the safe export limit.')
                    if not raw.endswith(b'\n'):
                        if left:raise ExportError('Invalid history record.')
                        break # snapshot excludes an unfinished append
                    line=raw.decode('utf-8')
                    if line.startswith('#') or not line.strip():continue
                    parsed=self.store._parse_history_line(line)
                    if parsed is None:raise ExportError('A history record is malformed; single export could not complete.')
                    stamp,event,item=parsed
                    try:received=datetime.fromisoformat(stamp.replace('Z','+00:00'))
                    except ValueError:raise ExportError('Invalid history timestamp.')
                    if received.tzinfo is None:raise ExportError('History timestamp lacks timezone.')
                    if received>datetime.fromisoformat(j['cutoff']):continue
                    local=received.astimezone(j['tz'])
                    if j['from'] and not j['from']<=local.date().isoformat()<=j['to']:continue
                    source='';source_kind='redacted'
                    try:
                        url=urlsplit(item.source_path)
                        if url.scheme in {'http','https'} and url.hostname:
                            # Queries, fragments and userinfo may carry secrets.
                            source=urlunsplit((url.scheme,url.hostname+(':'+str(url.port) if url.port else ''),url.path,'',''));source_kind='web_url_without_credentials_query_fragment'
                    except ValueError:pass
                    yield {'timestamp_utc':stamp,'timestamp_local':local.isoformat(),'event':event,'id':item.id,'name':item.name,'stored_name':Path(item.stored_name).name,'size':item.size,'mime':item.mime,'source':source,'source_kind':source_kind}

    def _build(self,j):
        try:
            if shutil.disk_usage(j['directory']).free<8*1024*1024:raise OSError('Insufficient temporary disk space')
            j['state']='running';j['phase']='csv'
            with zipfile.ZipFile(j['path'],'w',compression=zipfile.ZIP_DEFLATED,allowZip64=True) as archive:
                count=0
                with archive.open('history.csv','w',force_zip64=True) as raw:
                    text=io.TextIOWrapper(raw,encoding='utf-8',newline='');writer=csv.writer(text)
                    columns=['timestamp_utc','timestamp_local','event','id','name','stored_name','size','mime','source','source_kind'];writer.writerow(columns)
                    for event in self._events(j):
                        values=[event[k] for k in columns]
                        writer.writerow(["'"+v if isinstance(v,str) and v.lstrip().startswith(('=','+','-','@','\t','\r')) else v for v in values]);count+=1;j['count']=count
                    text.flush();text.detach()
                j['phase']='json'
                with archive.open('history.json','w',force_zip64=True) as raw:
                    raw.write(b'{"schema":"chutey.history.events/1","events":[');other=0
                    for event in self._events(j):
                        if other:raw.write(b',')
                        raw.write(json.dumps(event,ensure_ascii=False,separators=(',',':')).encode());other+=1
                    raw.write(b']}')
                    if other!=count:raise ExportError('Snapshot representations disagree.')
                manifest={k:j[k] for k in ('scope','timezone','from','to','cutoff','count')}
                manifest.update(schema='chutey.history.events/1',contents='All recorded chronological events, including add/remove/clear/recall. Metadata only.',source_policy='Local paths redacted; web URL credentials, query and fragment excluded.',snapshot='Complete lines at captured byte cutoffs; later appends excluded; per-file chronological order.')
                archive.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False))
            j['phase']='verifying'
            with zipfile.ZipFile(j['path']) as archive:
                if archive.namelist()!=['history.csv','history.json','manifest.json']:raise ExportError('Invalid archive members.')
                for name in archive.namelist():
                    with archive.open(name) as member:
                        while member.read(256*1024):
                            if j['cancel'].is_set():raise InterruptedError()
            digest=hashlib.sha256()
            with j['path'].open('rb') as handle:
                while chunk:=handle.read(256*1024):
                    if j['cancel'].is_set():raise InterruptedError()
                    digest.update(chunk)
            if j['cancel'].is_set():raise InterruptedError()
            j.update(state='ready',phase='ready',size=j['path'].stat().st_size,sha256=digest.hexdigest())
        except InterruptedError:j.update(state='cancelled',phase='cancelled')
        except Exception as exc:
            j.update(state='failed',phase='failed',error=str(exc) if isinstance(exc,ExportError) else 'The single ZIP could not complete. Check free space and access, then retry; no history was changed.')
        finally:
            j.pop('snapshots',None)
            if j['state']!='ready':shutil.rmtree(j['directory'],ignore_errors=True)

    def status(self,ident,owner):
        with self.lock:
            self.expire();j=self.jobs.get(ident)
            if not j or j['owner']!=owner:raise ExportError('Export not found or expired.')
            result={k:j.get(k) for k in ('id','state','phase','count','scope','timezone','from','to','cutoff','filename','size','sha256','error')}
            if j['state']=='ready':result['url']='/api/explorer/v1/history-download/'+j['ticket']
            return result

    def cancel(self,ident,owner):
        with self.lock:
            self.status(ident,owner);j=self.jobs[ident];j['cancel'].set()
            if j['state']=='ready':j['state']='cancelled';shutil.rmtree(j['directory'],ignore_errors=True)
            return {'id':ident,'state':j['state']}

    def download(self,ticket):
        with self.lock:
            self.expire()
            for j in self.jobs.values():
                if secrets.compare_digest(j['ticket'],ticket) and j['state']=='ready':return j
        raise ExportError('Archive download expired or unavailable.')

    def expire(self):
        for ident,j in list(self.jobs.items()):
            if time.monotonic()-j['created']>3600:
                j['cancel'].set()
                if j['state'] not in {'accepted','running'}:shutil.rmtree(j['directory'],ignore_errors=True);del self.jobs[ident]
