"""Opt-in read adapter on the existing Chute server. No enrollment over HTTP."""
from __future__ import annotations

import json
import os
import threading
import secrets
import time
from urllib.parse import urlparse

from .protocol import ExplorerError
from .preview import byte_range, media_mime, preview_kind, thumbnail


class ExplorerAPI:
    def __init__(self, engine, session, *, previous=None):
        self.engine, self.session = engine, session
        from .transfers import Transfers
        self.transfers = Transfers(engine)
        self.slots = threading.BoundedSemaphore(4)
        self.media_slots = threading.BoundedSemaphore(2)
        self.intake_slots = threading.BoundedSemaphore(1)
        self.jobs = None
        self.clipboard = None
        self.media = {}
        self.media_lock = threading.Lock()
        self.media_context={'revoked':False}
        self.media_events=__import__('collections').deque(maxlen=128)
        if previous is not None:
            self.media=previous.media;self.media_lock=previous.media_lock;self.media_context=previous.media_context;self.media_events=previous.media_events
            self.clipboard=previous.clipboard
            self.jobs=previous.jobs
            if self.jobs:self.jobs.api=self
            self.transfers=previous.transfers
            self.saved_grants=getattr(previous,'saved_grants',{})
            self.store_only=getattr(previous,'store_only',False)

    def revoke_media(self):
        with self.media_lock:
            self.media_context['revoked']=True
            for source in self.media.values():source['revoked']=True
            self.media.clear()

    def _performance(self,handler):
        with handler.server.performance_lock:
            if not hasattr(handler.server,'performance'):
                from .performance import Performance
                handler.server.performance=Performance(handler.server.store)
        return handler.server.performance

    def headers(self, handler, status, mime, length, extra=()):
        handler._explorer_headers_sent = True
        handler.send_response(status)
        handler.send_header("Access-Control-Allow-Origin", self.session.origin)
        handler.send_header("Vary", "Origin")
        handler.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Range, X-Chute-Destination, X-Chute-Filename, X-Chute-Operation, X-Chute-Capture-ID, X-Chute-Source")
        handler.send_header("Access-Control-Allow-Methods", "POST, GET, HEAD, OPTIONS")
        handler.send_header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, X-Chutey-Error")
        handler.send_header("Cache-Control", "no-store")
        handler.send_header("X-Content-Type-Options", "nosniff")
        handler.send_header("Content-Security-Policy", "default-src 'none'; sandbox")
        handler.send_header("Content-Type", mime)
        handler.send_header("Content-Length", str(length))
        for key, value in extra:
            handler.send_header(key, value)
        handler.end_headers()

    def json(self, handler, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode()
        extra=[('X-Chutey-Error',value['error']['code'])] if isinstance(value,dict) and isinstance(value.get('error'),dict) and 'code' in value['error'] else []
        self.headers(handler, status, "application/json; charset=utf-8", len(body),extra)
        if handler.command != "HEAD":
            handler.wfile.write(body)

    def route(self, handler):
        handler._explorer_headers_sent = False
        handler._quiet_explorer_read = False
        path=urlparse(handler.path).path
        # Read only a bounded command envelope to classify lightweight control
        # separately from directory scans and CPU-heavy thumbnail decoding.
        if handler.command=='OPTIONS':return self._route(handler)
        lane='media' if path.startswith('/api/explorer/v1/media/') else 'intake' if path.endswith('/receive') or path.endswith('/highlights') else 'control'
        if path.endswith('/content'):
            lane='preview'
            length=handler.headers.get('Content-Length','')
            if length.isdigit() and 2<=int(length)<=16384 and not handler.headers.get('Transfer-Encoding'):
                handler.connection.settimeout(10);raw=handler.rfile.read(int(length));handler._command_raw=raw
                try:
                    if json.loads(raw).get('thumbnail'):lane='thumbnail'
                except (ValueError,AttributeError):pass
        if path.endswith('/command') and handler.command=='POST':
            length=handler.headers.get('Content-Length','')
            if length.isdigit() and 2<=int(length)<=16384 and not handler.headers.get('Transfer-Encoding'):
                handler.connection.settimeout(10)
                raw=handler.rfile.read(int(length));handler._command_raw=raw
                try:command=json.loads(raw).get('command')
                except (ValueError,AttributeError):command=None
                if command in {'list','search','roots','stat','preview'}:lane='navigation'
                if command=='clipboard_copy_image':lane='thumbnail'
        with self._performance(handler).enter(lane) as admitted:
            if not admitted:
                handler.close_connection=True
                self.json(handler,{'state':'failed','error':{'code':'BUSY','message':'This resource lane is busy. Wait briefly; browsing and playback have separate capacity.'}},429)
                return True
            return self._route(handler)

    def _route(self, handler):
        path = urlparse(handler.path).path
        if not path.startswith("/api/explorer/"):
            return False
        try:
            for field in ("Host", "Origin", "Range", "Authorization", "Content-Length", "Content-Type", "X-Chute-Destination", "X-Chute-Filename", "X-Chute-Operation", "X-Chute-Capture-ID", "X-Chute-Source"):
                if len(handler.headers.get_all(field, [])) > 1:
                    raise ExplorerError("INVALID_ARGUMENT", "Duplicate request headers are not allowed.")
            expected_host = f"127.0.0.1:{handler.server.server_port}"
            if handler.headers.get("Host") != expected_host:
                raise ExplorerError("INVALID_HOST", "Loopback Host required.")
            if handler.headers.get("Origin") != self.session.origin:
                raise ExplorerError("UNAUTHORIZED", "Enrolled extension origin required.")
            if handler.command == "OPTIONS":
                self.headers(handler, 204, "application/json", 0)
                return True
            if path.startswith("/api/explorer/v1/media/") and handler.command in {"GET","HEAD"}:
                ticket = path.removeprefix("/api/explorer/v1/media/")
                with self.media_lock:
                    source = self.media.get(ticket)
                if not source or time.monotonic() >= source["expires"]:
                    raise ExplorerError("STREAM_EXPIRED", "The media session expired. Select the file again.")
                if source['revoked'] or self.media_context['revoked']:raise ExplorerError('UNAUTHORIZED','Media access was explicitly revoked.')
                self.content(handler, source["file"], media=source)
                return True
            self.session.authorize(handler.headers.get("Origin", ""), handler.headers.get("Authorization", ""))
            if handler.command != "POST":
                raise ExplorerError("METHOD_NOT_ALLOWED", "Use an authenticated POST command.")
            if path == '/api/explorer/v1/highlights':
                from ..highlights import Highlights,MAX_SELECTION
                if handler.headers.get('Transfer-Encoding') or handler.headers.get('Content-Type')!='text/plain;charset=utf-8':
                    raise ExplorerError('INVALID_ARGUMENT','A known-size UTF-8 selection is required.')
                size=int(handler.headers.get('Content-Length','-1'))
                if not 0<size<=MAX_SELECTION:raise ExplorerError('INVALID_ARGUMENT','Selections are limited to 4 MiB.')
                handler.connection.settimeout(30);raw=handler.rfile.read(size)
                if len(raw)!=size:raise ExplorerError('INVALID_ARGUMENT','Selection ended early.')
                from ..store import _LOCK
                with _LOCK:
                    if handler.server.store.highlights is None:handler.server.store.highlights=Highlights(handler.server.store)
                    try:receipt=handler.server.store.highlights.accept(handler.headers.get('X-Chute-Capture-ID',''),raw,__import__('urllib.parse',fromlist=['unquote']).unquote(handler.headers.get('X-Chute-Source','browser-selection')))
                    except (ValueError,UnicodeError) as exc:raise ExplorerError('HIGHLIGHT_FAILED',str(exc))
                from ..server import public_item
                receipt['file']=public_item(receipt['file'],active=receipt['capture_id'] in handler.server.store.active_ids())
                self.json(handler,receipt,201);return True
            if path == "/api/explorer/v1/receive":
                if handler.headers.get("Transfer-Encoding"):
                    raise ExplorerError("INVALID_ARGUMENT","A known-size file is required.")
                from urllib.parse import unquote
                from .transfers import receive
                size=int(handler.headers.get("Content-Length","-1"))
                destination=handler.headers.get("X-Chute-Destination","")
                name=unquote(handler.headers.get("X-Chute-Filename",""))
                if len(name)>255 or len(destination)>128:
                    raise ExplorerError("INVALID_ARGUMENT","Invalid destination metadata.")
                operation=handler.headers.get("X-Chute-Operation","")
                if hasattr(self,"native_state"):
                    self.native_state('begin_transfer',{'operation_id':operation,'destination':destination})
                handler.connection.settimeout(30)
                authorize=lambda: self.session.authorize(handler.headers.get("Origin",""),handler.headers.get("Authorization",""))
                authorize()
                receipt=receive(self.engine.grant_for(destination),destination,name,handler.rfile,size,authorize=authorize)
                if hasattr(self,"native_state"):
                    self.native_state('finish_transfer',{'operation_id':operation,'receipt':receipt})
                    receipt['operation_id']=operation
                self.json(handler,receipt)
                return True
            if handler.headers.get("Transfer-Encoding") or handler.headers.get("Content-Type") != "application/json":
                raise ExplorerError("INVALID_ARGUMENT", "A bounded JSON request is required.")
            try:
                length = int(handler.headers.get("Content-Length", "-1"))
            except ValueError:
                length = -1
            if not 2 <= length <= 16384:
                raise ExplorerError("INVALID_ARGUMENT", "Request exceeds the command limit.")
            handler.connection.settimeout(10)
            raw = getattr(handler,"_command_raw",None)
            if raw is None:raw=handler.rfile.read(length)
            if len(raw) != length:
                raise ExplorerError("INVALID_ARGUMENT", "Request ended early.")
            try:
                body = json.loads(raw)
            except (ValueError, UnicodeError):
                raise ExplorerError("INVALID_ARGUMENT", "Invalid JSON request.")
            if not isinstance(body, dict):
                raise ExplorerError("INVALID_ARGUMENT", "Expected a command object.")
            if path == "/api/explorer/v1/command":
                if set(body) - {"command", "args"} or not isinstance(body.get("command"), str) or not isinstance(body.get("args", {}), dict):
                    raise ExplorerError("INVALID_ARGUMENT", "Invalid command envelope.")
                handler._quiet_explorer_read=body['command'] in {'capabilities','roots','list','stat','preview','search','saved_text_page','history_export_status','transfer_status','upload_receipt','resume_location','recent_transfers','performance_get','media_policy_get','media_status','media_diagnostics','renew_media'}
                if body["command"] == "capabilities":
                    from .protocol import catalog
                    capabilities = catalog()
                    capabilities['commands'] += ['performance_get','performance_set','media_policy_get','media_policy_set','media_status','media_diagnostics','renew_media','transfer_verify','clipboard_copy_files','clipboard_copy_image','clipboard_read_files','clipboard_release','upload_receipt','transfer_start','transfer_status','transfer_cancel','transfer_dismiss','saved_text_page','history_export_create','history_export_status','history_export_cancel','locate_saved','open','reveal','media_source','release_media']
                    capabilities['blocked'] = {key:value for key,value in capabilities['blocked'].items() if key not in {'open','reveal'}}
                    result={"state":"completed","result":{**capabilities,"transfer":{
                        "source_kind":"local_explorer","maximum_chunk_bytes":262144,
                        "original_bytes":True,"one_use_export":True,
                        "write_consent_required":True,"conflicts":["keep_both","skip"],
                        "commands":["prepare_export","export_to_live","receive_from_live","reconcile_transfer","transfer_start","transfer_status","transfer_cancel","transfer_dismiss"],"asynchronous_copy_jobs":True,"concurrent_jobs":1,
                        "interop_enabled":False},"media":{"commands":["media_source","release_media"],"methods":["GET","HEAD"],"ranges":True,"ticket_limit":32,"ticket_seconds":120,"authenticated_continuation":True,"concurrent_streams":2,"chunk_bytes":262144},"file_actions":{"commands":["locate_saved","open","reveal"],"system_platform":"windows","system_open":"previewable files only"}}}
                elif body['command'] in {'history_export_create','history_export_status','history_export_cancel'}:
                    from ..history_export import HistoryExports,ExportError
                    # Store-wide manager bounds simultaneous jobs across clients.
                    with handler.server.history_exports_lock:
                        if not hasattr(handler.server,'history_exports'):
                            handler.server.history_exports=HistoryExports(handler.server.store)
                    exports=handler.server.history_exports;args=body.get('args',{})
                    owner=self.session.origin
                    try:
                        if body['command']=='history_export_create':value=exports.create(args,owner,self.session.origin)
                        else:
                            if set(args)!={'id'} or not isinstance(args['id'],str):raise ExportError('An export ID is required.')
                            value=exports.status(args['id'],owner) if body['command']=='history_export_status' else exports.cancel(args['id'],owner)
                    except ExportError as exc:raise ExplorerError('EXPORT_FAILED',str(exc))
                    result={'state':'completed','result':value}
                elif body['command'] in {'transfer_start','transfer_status','transfer_cancel','transfer_dismiss'}:
                    from .jobs import TransferJobs
                    with self.engine.lock:
                        if self.jobs is None:self.jobs=TransferJobs(self,handler.server.store)
                    args=body.get('args',{})
                    if body['command']=='transfer_start':value=self.jobs.start(args,handler.headers.get('Authorization',''))
                    else:
                        if set(args)-{'id','reviewed'} or not isinstance(args.get('id'),str):raise ExplorerError('INVALID_ARGUMENT','A transfer job ID is required.')
                        function={'transfer_status':self.jobs.status,'transfer_cancel':self.jobs.cancel,'transfer_dismiss':self.jobs.dismiss}[body['command']]
                        value=function(args['id'],**({'reviewed':args.get('reviewed',False)} if body['command']=='transfer_dismiss' else {}))
                    result={'state':'completed','result':value}
                elif body['command'] in {'performance_get','performance_set'}:
                    args=body.get('args',{})
                    if body['command']=='performance_get':
                        if args:raise ExplorerError('INVALID_ARGUMENT','No performance query arguments.')
                        value=self._performance(handler).get()
                    else:
                        if set(args)!={'mode'}:raise ExplorerError('INVALID_ARGUMENT','A performance mode is required.')
                        value=self._performance(handler).set(args['mode'])
                    result={'state':'completed','result':value}
                elif body['command'] in {'media_policy_get','media_policy_set'} and hasattr(self,'native_state'):
                    result={'state':'completed','result':self.native_state(body['command'],body.get('args',{}))}
                elif body['command'] in {'media_policy_get','media_policy_set'}:
                    if body['command']=='media_policy_set':self.media_allowed=body.get('args',{}).get('allowed') is True
                    result={'state':'completed','result':{'allowed':getattr(self,'media_allowed',True),'migration':'fixture policy'}}
                elif body['command']=='media_status':
                    args=body.get('args',{})
                    if set(args)!={'ticket'}:raise ExplorerError('INVALID_ARGUMENT','Media ticket required.')
                    with self.media_lock:source=self.media.get(args['ticket'])
                    result={'state':'completed','result':{'available':bool(source and not source['revoked'] and not self.media_context['revoked']),'original_get':source.get('last_get') if source else None,'lease_seconds':max(0,source['expires']-time.monotonic()) if source else 0}}
                elif body['command']=='media_diagnostics':
                    result={'state':'completed','result':{'events':list(self.media_events),'active_leases':len(self.media)}}
                elif body['command']=='renew_media':
                    args=body.get('args',{})
                    if set(args)!={'ticket'} or not isinstance(args['ticket'],str):raise ExplorerError('INVALID_ARGUMENT','Media lease ticket required.')
                    with self.media_lock:
                        source=self.media.get(args['ticket'])
                        if not source or source['revoked'] or self.media_context['revoked'] or source['expires']<=time.monotonic():raise ExplorerError('STREAM_EXPIRED','Media lease expired; select the file again.')
                        source['expires']=time.monotonic()+120
                    self.media_events.append({'event':'renew','at':time.monotonic()})
                    result={'state':'completed','result':{'renewed':True,'expires_in':120}}
                elif body['command'] in {'clipboard_copy_files','clipboard_copy_image','clipboard_read_files','clipboard_release'}:
                    from .clipboard import Clipboard
                    with self.engine.lock:
                        if self.clipboard is None:self.clipboard=Clipboard(self.engine)
                    result={'state':'completed','result':self.clipboard.dispatch(body['command'],body.get('args',{}))}
                elif body['command']=='transfer_verify':
                    args=body.get('args',{})
                    if not self.jobs:
                        from .jobs import TransferJobs
                        self.jobs=TransferJobs(self,handler.server.store)
                    result={'state':'completed','result':self.jobs.verify(args.get('id'),args.get('destination'))}
                elif body['command']=='upload_receipt':
                    args=body.get('args',{})
                    if set(args)!={'id'}:raise ExplorerError('INVALID_ARGUMENT','An import ID is required.')
                    result={'state':'completed','result':handler.server.store.upload_receipt(args['id'])}
                elif body['command']=='saved_text_page':
                    from ..highlights import saved_text_page
                    args=body.get('args',{})
                    if 'id' not in args or set(args)-{'id','offset','limit'}:raise ExplorerError('INVALID_ARGUMENT','Invalid text page parameters.')
                    try:page=saved_text_page(handler.server.store,args["id"],**{k:v for k,v in args.items() if k!="id"})
                    except (ValueError,TypeError) as exc:raise ExplorerError('TEXT_UNAVAILABLE',str(exc))
                    result={'state':'completed','result':page}
                elif body["command"] == "locate_saved":
                    from .security import RootGrant
                    import re
                    args = body.get("args", {})
                    if set(args) != {"id"} or not isinstance(args['id'],str) or re.fullmatch(r'[a-f0-9]{32}',args['id']) is None:
                        raise ExplorerError('INVALID_ARGUMENT','A saved Chutey item ID is required.')
                    found = handler.server.store.get(args['id'])
                    if not found: raise ExplorerError('NOT_FOUND','The saved item no longer exists.')
                    _, path = found
                    capture=handler.server.store.highlights.lookup(args['id']) if handler.server.store.highlights else None
                    if capture:path=capture['path']
                    # Store, never client input, supplies this directory. It is
                    # already readable through the existing saved-file interface.
                    directory = path.parent
                    if directory not in {handler.server.store.files_dir, handler.server.store.custom_thumbs_dir}:
                        raise ExplorerError('UNSAFE_ROOT','Saved file is outside its permitted storage.')
                    with self.engine.lock:
                        grants = getattr(self, 'saved_grants', {})
                        grant = grants.get(directory)
                        if grant is None:
                            grant = RootGrant(directory, label='Saved Chutey files')
                            self.engine.grants[grant.id] = grant; grants[directory] = grant; self.saved_grants = grants
                        parts = path.relative_to(directory).parts
                        handle = grant.handle(parts)
                        receipt = self.engine.execute('stat',handle=handle)
                    result = receipt
                    if capture:
                        result['result']['highlight']={k:v for k,v in capture.items() if k!='path'}
                elif body["command"] in {"open", "reveal"}:
                    from .file_actions import external_action
                    args = body.get('args',{})
                    if set(args) != {'handle','identity'} or not all(isinstance(value,str) for value in args.values()):
                        raise ExplorerError('INVALID_ARGUMENT','A file handle and canonical identity are required.')
                    with self.engine.lock:
                        value = external_action(self.engine,body['command'],**args)
                    result = {'state':'completed','result':value}
                elif body["command"] == "media_source":
                    if not getattr(self,'media_allowed',True):raise ExplorerError('MEDIA_CONSENT_REQUIRED','Enable Allow movie media playback in Settings → Folder Access for this approved folder.')
                    args = body.get("args", {})
                    if set(args) != {"handle", "identity"} or not all(isinstance(value,str) for value in args.values()):
                        raise ExplorerError("INVALID_ARGUMENT", "A file handle and identity are required.")
                    with self.engine.lock:
                        grant = self.engine.grant_for(args["handle"])
                        with grant.open(args["handle"]) as fd:
                            row = self.engine._record(grant, grant.parts(args["handle"]), os.fstat(fd), fd=fd)
                        if row["identity"] != args["identity"]:
                            raise ExplorerError("FILE_CHANGED", "The file changed. Refresh the folder.")
                        if preview_kind(row) not in {"video", "audio"}:
                            raise ExplorerError("PREVIEW_UNAVAILABLE", "This file has no supported audio/video preview. Browser codec support varies.")
                    ticket = secrets.token_urlsafe(32)
                    # A short-lived, read-only, origin-bound authority for one file.
                    # Never put the general session token or a filesystem path in a URL.
                    expiry = time.monotonic() + 120
                    with self.media_lock:
                        for key in list(self.media):
                            if self.media[key]["expires"]<=time.monotonic():self.media.pop(key,None)
                        if len(self.media) >= 32:
                            raise ExplorerError("BUSY", "Close an unused media preview before opening another.")
                        self.media[ticket] = {"file":args, "expires":expiry, "revoked":False}
                    self.media_events.append({"event":"issued","at":time.monotonic()})
                    result = {"state":"completed", "result":{"url":"/api/explorer/v1/media/" + ticket,
                        "ticket":ticket,"expires_in":max(0,int(expiry-time.monotonic())),"mime":row["mime"],"size":row["size"],"range":True}}
                elif body["command"] == "release_media":
                    args = body.get("args", {})
                    if set(args) != {"ticket"} or not isinstance(args["ticket"],str):
                        raise ExplorerError("INVALID_ARGUMENT", "A media ticket is required.")
                    with self.media_lock:
                        released = self.media.pop(args["ticket"],None)
                        if released: released["revoked"] = True
                    self.media_events.append({"event":"release","at":time.monotonic()})
                    result = {"state":"completed", "result":{"released":True}}
                elif body["command"] == "prepare_export":
                    with self.engine.lock:
                        result={"state":"completed","result":self.transfers.prepare(**body.get("args",{}))}
                elif body["command"] == "receive_from_live":
                    from .transfers import receive, digest
                    import re
                    args=body.get("args",{})
                    if set(args) != {"id","destination","operation_id"} or re.fullmatch(r"[a-f0-9]{32}",args.get("id","")) is None:
                        raise ExplorerError("INVALID_ARGUMENT","A genuine Live item is required.")
                    found=handler.server.store.get(args["id"])
                    if not found: raise ExplorerError("NOT_FOUND","The Live item is unavailable.")
                    item,path=found
                    if hasattr(self,"native_state"):
                        self.native_state('begin_transfer',{'operation_id':args['operation_id'],'destination':args['destination']})
                    with self.engine.lock, path.open('rb') as source:
                        expected=digest(source); source.seek(0)
                        authorize=lambda: self.session.authorize(handler.headers.get("Origin",""),handler.headers.get("Authorization",""))
                        authorize()
                        result={"state":"completed","result":receive(self.engine.grant_for(args["destination"]),args["destination"],item.name,source,os.fstat(source.fileno()).st_size,expected_sha256=expected,authorize=authorize)}
                    if hasattr(self,"native_state"):
                        self.native_state('finish_transfer',{'operation_id':args['operation_id'],'receipt':result['result']})
                        result['result']['operation_id']=args['operation_id']
                elif body["command"] == "export_to_live":
                    with self.engine.lock:
                        self.session.authorize(handler.headers.get("Origin", ""),handler.headers.get("Authorization", ""))
                        result={"state":"completed","result":self.transfers.to_live(store=handler.server.store,**body.get("args",{}))}
                elif body["command"] in {"resume_location", "remember_location", "revoke_access", "reconcile_transfer", "recent_transfers"} and hasattr(self, "native_state"):
                    result = {"state":"completed", "result":self.native_state(body["command"],body.get("args",{}))}
                else:
                    result = self.engine.execute(body["command"], **body.get("args", {}))
                self.json(handler, result, 200 if result["state"] == "completed" else 400)
            elif path == "/api/explorer/v1/content":
                handler._quiet_explorer_read=True
                if (set(body) - {"handle", "thumbnail", "identity", "original"} or not isinstance(body.get("handle"), str)
                        or not isinstance(body.get("identity"), str) or type(body.get("thumbnail", False)) is not bool or type(body.get("original", False)) is not bool):
                    raise ExplorerError("INVALID_ARGUMENT", "Expected a file handle.")
                self.content(handler, body)
            else:
                raise ExplorerError("NOT_FOUND", "Explorer route not found.")
        except ExplorerError as exc:
            handler.close_connection = True
            if path.startswith('/api/explorer/v1/media/') and handler.command=='GET':
                with self.media_lock:
                    source=self.media.get(path.rsplit('/',1)[-1])
                    if source:source['last_get']={'status':403 if exc.code in {'UNAUTHORIZED','INVALID_HOST'} else 400,'code':exc.code,'origin_present':bool(handler.headers.get('Origin'))}
            self.media_events.append({"event":"request_error","code":exc.code,"origin_present":bool(handler.headers.get("Origin")),"method":handler.command,"at":time.monotonic()})
            if handler._explorer_headers_sent: return True
            status = 416 if exc.code == "INVALID_RANGE" else 403 if exc.code in {"UNAUTHORIZED", "INVALID_HOST"} else 400
            self.json(handler, {"state": "failed", "error": {"code": exc.code, "message": str(exc)}}, status)
        except (OSError, ValueError, TypeError):
            if handler._explorer_headers_sent:
                handler.close_connection = True
                return True
            # Never return absolute paths or internal exception text to the browser.
            try:
                self.json(handler, {"state": "failed", "error": {"code": "UNAVAILABLE", "message": "The file is unavailable."}}, 400)
            except OSError:
                pass
        return True

    def content(self, handler, body, *, authorization=None, media=None):
        grant = self.engine.grant_for(body["handle"])
        with grant.open(body["handle"]) as fd:
            row = self.engine._record(grant, grant.parts(body["handle"]), os.fstat(fd), fd=fd)
            if body.get("identity") != row["identity"]:
                raise ExplorerError("FILE_CHANGED", "The file changed; refresh its preview.")
            original = body.get("original", False)
            if original and (body.get("thumbnail") or row["size"] > 32 * 1024 * 1024):
                raise ExplorerError("TRANSFER_LIMIT", "Use the file picker for files larger than 32 MiB.")
            kind = "original" if original else preview_kind(row)
            if kind == "unavailable":
                raise ExplorerError("PREVIEW_UNAVAILABLE", "Preview unavailable for this file type.")
            if body.get("thumbnail"):
                if kind != "image":
                    raise ExplorerError("PREVIEW_UNAVAILABLE", "This file has no image thumbnail.")
                data = thumbnail(fd)
                self.headers(handler, 200, "image/jpeg", len(data))
                handler.wfile.write(data)
                return
            size = os.fstat(fd).st_size
            if kind == "text" and size > 262144:
                raise ExplorerError("PREVIEW_LIMIT", "Text preview is limited to 256 KiB.")
            if kind == "image" and size > 32 * 1024 * 1024:
                raise ExplorerError("PREVIEW_LIMIT", "Image preview is limited to 32 MiB.")
            try:
                start, end, partial = byte_range(handler.headers.get("Range") if handler.command != "HEAD" else None, size)
            except ExplorerError:
                self.headers(handler, 416, row["mime"], 0, [("Content-Range", f"bytes */{size}"), ("Accept-Ranges","bytes")])
                return
            extra = [("Accept-Ranges", "bytes")]
            if partial:
                extra.append(("Content-Range", f"bytes {start}-{end - 1}/{size}"))
            mime = "text/plain; charset=utf-8" if kind == "text" else media_mime(row)
            if original:
                extra.append(("Content-Disposition", "attachment"))
            handler.connection.settimeout(15)
            if media and handler.command=='GET':media['last_get']={'status':206 if partial else 200,'code':'OK','origin_present':bool(handler.headers.get('Origin'))}
            self.headers(handler, 206 if partial else 200, mime, end - start, extra)
            if handler.command == "HEAD":
                return
            os.lseek(fd, start, os.SEEK_SET)
            remaining = end - start
            while remaining:
                if media and (media["revoked"] or self.media_context["revoked"] or time.monotonic() >= media["expires"]):
                    media['last_get']={'status':403 if media['revoked'] or self.media_context['revoked'] else 400,'code':'UNAUTHORIZED' if media['revoked'] or self.media_context['revoked'] else 'STREAM_EXPIRED','origin_present':bool(handler.headers.get('Origin'))}
                    handler.close_connection = True
                    return
                if not media:self.session.authorize(handler.headers.get("Origin", ""), authorization or handler.headers.get("Authorization", ""))
                data = os.read(fd, min(262144, remaining))
                if not data:
                    handler.close_connection=True
                    raise ExplorerError("FILE_CHANGED","Media ended before the promised byte count.")
                handler.wfile.write(data)
                remaining -= len(data)
