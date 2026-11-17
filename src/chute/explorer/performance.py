"""Hardware-aware bounded admission lanes, persisted presets, redacted metrics."""
import contextlib,json,os,threading,time,collections
from pathlib import Path
MODES={'efficiency':(2,1,1),'balanced':(4,2,2),'turbo':(6,3,3)}
class Performance:
    def __init__(self,store):
        self.path=store.root/'performance.json';self.lock=threading.RLock();self.mode='balanced';self.active=collections.Counter();self.rejected=collections.Counter();self.latencies={};self.completed=collections.Counter()
        try:
            mode=json.loads(self.path.read_text(encoding='utf-8'))['mode']
            if mode in MODES:self.mode=mode
        except (OSError,ValueError,KeyError):pass
    def hardware(self):
        from ..runtime_log import resource_snapshot
        h=resource_snapshot();available=h.get('memory_available_bytes')
        if available is None:
            try:
                with open('/proc/meminfo') as f:
                    values=dict(line.split(':',1) for line in f)
                available=int(values['MemAvailable'].split()[0])*1024
            except (OSError,KeyError,ValueError):available=512*1024**2
        return {'available_memory_bytes':available,'cpu_count':os.cpu_count() or 1,'low_memory':available<512*1024**2}
    def limits(self):
        h=self.hardware();nav,thumb,prefetch=MODES[self.mode]
        if h['available_memory_bytes']<1536*1024**2:nav=min(nav,3);thumb=min(thumb,2)
        if h['low_memory']:nav=thumb=1;prefetch=0
        thumb=min(thumb,max(1,h['cpu_count']//2))
        return {'control':4,'preview':2,'navigation':nav,'thumbnail':thumb,'media':2,'intake':1,'chunk_bytes':262144,'thumbnail_prefetch':prefetch,'http_threads':32}
    def get(self):
        with self.lock:
            metrics={}
            for lane,samples in self.latencies.items():
                values=sorted(samples)
                metrics[lane]={'completed':self.completed[lane],'busy':self.rejected[lane],'active':self.active[lane],**{k:round(values[min(len(values)-1,int((len(values)-1)*p))]*1000,3) for k,p in [('p50_ms',.5),('p95_ms',.95),('p99_ms',.99),('worst_ms',1)]}}
            from ..runtime_log import resource_snapshot
            return {'mode':self.mode,'effective_limits':self.limits(),'hardware':self.hardware(),'resources':resource_snapshot(),'metrics':metrics,'queue_policy':'bounded admission; no stale click queue'}
    def set(self,mode):
        if mode not in MODES:raise ValueError('Choose efficiency, balanced or turbo.')
        with self.lock:
            path=self.path.with_suffix('.tmp')
            with path.open('w',encoding='utf-8') as out:json.dump({'version':1,'mode':mode},out);out.flush();os.fsync(out.fileno())
            os.replace(path,self.path);self.mode=mode
        return self.get()
    @contextlib.contextmanager
    def enter(self,lane):
        start=time.monotonic()
        with self.lock:
            granted=self.active[lane]<self.limits()[lane]
            if granted:self.active[lane]+=1
            else:self.rejected[lane]+=1
        try:yield granted
        finally:
            if granted:
                with self.lock:
                    self.active[lane]-=1;self.completed[lane]+=1
                    self.latencies.setdefault(lane,collections.deque(maxlen=512)).append(time.monotonic()-start)
