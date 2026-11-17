"""Idempotent received-at captures and recoverable append-only daily documents."""
from __future__ import annotations
import hashlib,json,os,re,sqlite3,threading,uuid
from datetime import datetime,timezone
from pathlib import Path
from contextlib import contextmanager
from .store import QueueItem,_LOCK,_encode_field,_HISTORY_MAGIC,_HISTORY_COLUMNS
MAX_SELECTION=4*1024*1024

class Highlights:
    def __init__(self,store,clock=None):
        self.store=store;self.clock=clock or (lambda:datetime.now().astimezone());self.lock=threading.RLock()
        self.path=store.root/'highlights.sqlite3'
        with self._db() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS days(day TEXT PRIMARY KEY,document TEXT UNIQUE,total INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS captures(seq INTEGER PRIMARY KEY,id TEXT UNIQUE NOT NULL,day TEXT NOT NULL,received TEXT NOT NULL,local TEXT NOT NULL,source TEXT NOT NULL,digest TEXT NOT NULL,payload BLOB NOT NULL,offset INTEGER NOT NULL,published INTEGER NOT NULL DEFAULT 0);''')
        self.recovery_error=None
        try:self.recover()
        except (OSError,ValueError):self.recovery_error='A daily highlight document needs recovery review. Original bytes were preserved.' 

    @contextmanager
    def _db(self):
        db=sqlite3.connect(self.path,timeout=30);db.row_factory=sqlite3.Row;db.execute('PRAGMA synchronous=FULL')
        try:
            with db:yield db
        finally:db.close()

    def _document(self,day,document):return self.store.files_dir/(document+'-Chutey Highlights '+day+'.txt')

    def accept(self,ident,raw,source='browser-selection'):
        if not isinstance(ident,str) or not re.fullmatch('[a-f0-9]{32}',ident):raise ValueError('A stable capture ID is required.')
        if not raw or len(raw)>MAX_SELECTION:raise ValueError('Selections must contain 1 byte through 4 MiB.')
        text=raw.decode('utf-8',errors='strict');digest=hashlib.sha256(raw).hexdigest()
        if not text.rstrip('\r\n'):raise ValueError('Select non-empty text.')
        with _LOCK,self.lock,self._db() as db:
            previous=db.execute('SELECT digest FROM captures WHERE id=?',(ident,)).fetchone()
            if previous:
                if previous['digest']!=digest:raise ValueError('Capture ID already belongs to different text.')
            else:
                now=self.clock()
                if now.tzinfo is None:raise ValueError('Worker clock must include its local timezone.')
                day=now.date().isoformat();utc=now.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
                local=now.isoformat(timespec='seconds',sep=' ')
                payload=(local+'\n'+text.rstrip('\r\n')).encode('utf-8')
                row=db.execute('SELECT * FROM days WHERE day=?',(day,)).fetchone()
                document=row['document'] if row else uuid.uuid4().hex;offset=row['total'] if row else 0
                size=len(payload)+(3 if offset else 0)
                db.execute('INSERT OR REPLACE INTO days VALUES(?,?,?)',(day,document,offset+size))
                db.execute('INSERT INTO captures(id,day,received,local,source,digest,payload,offset) VALUES(?,?,?,?,?,?,?,?)',(ident,day,utc,local,str(source)[:4096],digest,payload,offset))
                db.commit() # durable intent before any daily file or metadata writes
            self._recover(db)
            row=db.execute('SELECT * FROM captures WHERE id=?',(ident,)).fetchone();info=self.lookup(ident,db)
            return {'state':'COMMITTED','capture_id':ident,'received_at':row['local'],'input_size':len(raw),'input_sha256':digest,'document_id':info['document_id'],'entry_offset':info['entry_offset'],'file':self.store.get(ident)[0]}

    def recover(self):
        with _LOCK,self.lock,self._db() as db:self._recover(db)

    def _recover(self,db):
        for row in db.execute('SELECT captures.*,days.document FROM captures JOIN days USING(day) WHERE published=0 ORDER BY seq'):
            path=self._document(row['day'],row['document']);payload=bytes(row['payload']);prefix=b'\n\n\n' if row['offset'] else b'';entry=prefix+payload
            # Never truncate an unexpected original. Verify partial journal bytes,
            # then append only missing suffix. A mismatch fails closed for review.
            with path.open('r+b' if path.exists() else 'x+b') as handle:
                handle.seek(0,2);size=handle.tell()
                if size<row['offset']:raise ValueError('Daily highlight document is incomplete; recovery needs review.')
                handle.seek(row['offset']);present=handle.read(len(entry))
                if not entry.startswith(present):raise ValueError('Daily highlight document changed; original preserved.')
                if len(present)<len(entry):handle.seek(0,2);handle.write(entry[len(present):]);handle.flush();os.fsync(handle.fileno())
            # Independent immutable capture bytes preserve drag receipts and
            # original per-capture size even while the daily aggregate grows.
            name='Chutey Highlights '+row['day']+'.txt';stored=row['id']+'-'+name;capture=self.store.files_dir/stored
            if capture.exists():
                if capture.read_bytes()!=payload:raise ValueError('Original highlight bytes changed; recovery stopped.')
            else:
                partial=capture.with_name('.'+row['id']+'.highlight.part')
                if partial.exists() and not payload.startswith(partial.read_bytes()):raise ValueError('Highlight staging bytes changed; recovery stopped.')
                with partial.open('wb') as handle:handle.write(payload);handle.flush();os.fsync(handle.fileno())
                os.replace(partial,capture)
            item=QueueItem(row['id'],name,stored,len(payload),'text/plain;charset=utf-8',row['received'],row['source'])
            if self.store._find_history_item(item.id) is None:
                self.store._append_queue(item);self._publish_history(item)
                for durable in (self.store.queue_path,self.store._history_path(item.created_at)):
                    with durable.open('r+b') as handle:os.fsync(handle.fileno())
            # Existing historical capture must never be recalled implicitly after
            # its owner removed it from Live, including a repeated lost receipt.
            db.execute('UPDATE captures SET published=1 WHERE id=?',(item.id,));db.commit()

    def _publish_history(self,item):
        path=self.store._history_path(item.created_at)
        fields=(item.created_at,'add',item.id,item.name,item.stored_name,str(item.size),item.mime,item.source_path)
        record=('\t'.join(_encode_field(v) for v in fields)+'\n').encode()
        if path.exists():
            with path.open('rb') as handle:
                size=os.fstat(handle.fileno()).st_size;handle.seek(max(0,size-65536));tail=handle.read()
            if tail and not tail.endswith(b'\n'):
                partial=tail.rsplit(b'\n',1)[-1]
                # Only finish a proven prefix of this pending capture's record
                # or the first-file header; never truncate another event.
                expected=(_HISTORY_MAGIC+_HISTORY_COLUMNS).encode()+record if size==len(tail) and not b'\n' in tail else record
                if expected.startswith(tail) and size==len(tail):remaining=expected[len(tail):]
                elif record.startswith(partial):remaining=record[len(partial):]
                else:raise ValueError('History append needs review; existing records preserved.')
                with path.open('ab') as handle:handle.write(remaining);handle.flush();os.fsync(handle.fileno())
                return
        self.store._append_history('add',item,item.created_at)

    def lookup(self,ident,db=None):
        if db is None:
            with self.lock,self._db() as connection:return self.lookup(ident,connection)
        row=db.execute('SELECT captures.*,days.document FROM captures JOIN days USING(day) WHERE id=?',(ident,)).fetchone()
        if row is None:return None
        return {'path':self._document(row['day'],row['document']),'document_id':row['document'],'entry_offset':row['offset']+(3 if row['offset'] else 0),'capture_id':row['id'],'received_at':row['local']}


def saved_text_page(store,ident,offset=0,limit=65536):
    if not re.fullmatch('[a-f0-9]{32}',ident) or type(offset) is not int or offset<0 or type(limit) is not int or not 4<=limit<=65536:raise ValueError('Invalid text page.')
    found=store.get(ident)
    if not found:raise ValueError('Saved text not found.')
    item,path=found
    if not item.mime.startswith('text/') and not item.name.lower().endswith(('.txt','.md','.log','.csv','.json')):raise ValueError('This saved item is not supported text.')
    info=store.highlights.lookup(ident) if store.highlights else None
    if info:path=info['path']
    with path.open('rb') as handle:
        size=os.fstat(handle.fileno()).st_size
        if offset>size:raise ValueError('Text offset is outside the saved document.')
        handle.seek(offset);raw=handle.read(limit)
        # Keep valid UTF-8 code points whole across pages. Existing non-UTF8 text
        # uses replacement characters; highlight captures themselves are strict.
        import codecs
        decoder=codecs.getincrementaldecoder('utf-8')('replace');text=decoder.decode(raw,final=offset+len(raw)>=size);pending=decoder.getstate()[0]
        end=offset+len(raw)-len(pending)
        return {'text':text,'offset':offset,'next':end if end<size else None,'size':size,'entry_offset':info['entry_offset'] if info else 0,'capture_id':ident}
