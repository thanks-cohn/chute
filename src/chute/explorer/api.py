"""Opt-in read adapter on the existing Chute server. No enrollment over HTTP."""
from __future__ import annotations

import json
import os
import threading
from urllib.parse import urlparse

from .protocol import ExplorerError
from .preview import byte_range, preview_kind, thumbnail


class ExplorerAPI:
    def __init__(self, engine, session):
        self.engine, self.session = engine, session
        from .transfers import Transfers
        self.transfers = Transfers(engine)
        self.slots = threading.BoundedSemaphore(4)

    def headers(self, handler, status, mime, length, extra=()):
        handler._explorer_headers_sent = True
        handler.send_response(status)
        handler.send_header("Access-Control-Allow-Origin", self.session.origin)
        handler.send_header("Vary", "Origin")
        handler.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Range, X-Chute-Destination, X-Chute-Filename, X-Chute-Operation")
        handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        handler.send_header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges")
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
        self.headers(handler, status, "application/json; charset=utf-8", len(body))
        handler.wfile.write(body)

    def route(self, handler):
        handler._explorer_headers_sent = False
        if not self.slots.acquire(blocking=False):
            handler.close_connection = True
            self.json(handler, {"state": "failed", "error": {"code": "BUSY", "message": "The companion is busy. Try browsing again shortly."}}, 429)
            return True
        try:
            return self._route(handler)
        finally:
            self.slots.release()

    def _route(self, handler):
        path = urlparse(handler.path).path
        if not path.startswith("/api/explorer/"):
            return False
        try:
            for field in ("Host", "Origin", "Authorization", "Content-Length", "Content-Type", "X-Chute-Destination", "X-Chute-Filename", "X-Chute-Operation"):
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
            self.session.authorize(handler.headers.get("Origin", ""), handler.headers.get("Authorization", ""))
            if handler.command != "POST":
                raise ExplorerError("METHOD_NOT_ALLOWED", "Use an authenticated POST command.")
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
                with self.engine.lock:
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
            raw = handler.rfile.read(length)
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
                if body["command"] == "capabilities":
                    from .protocol import catalog
                    result={"state":"completed","result":{**catalog(),"transfer":{
                        "source_kind":"local_explorer","maximum_chunk_bytes":262144,
                        "original_bytes":True,"one_use_export":True,
                        "write_consent_required":True,"conflicts":["keep_both","skip"],
                        "commands":["prepare_export","export_to_live","receive_from_live","reconcile_transfer"],
                        "interop_enabled":False}}}
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
                if (set(body) - {"handle", "thumbnail", "identity", "original"} or not isinstance(body.get("handle"), str)
                        or not isinstance(body.get("identity"), str) or type(body.get("thumbnail", False)) is not bool or type(body.get("original", False)) is not bool):
                    raise ExplorerError("INVALID_ARGUMENT", "Expected a file handle.")
                self.content(handler, body)
            else:
                raise ExplorerError("NOT_FOUND", "Explorer route not found.")
        except ExplorerError as exc:
            handler.close_connection = True
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

    def content(self, handler, body):
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
            start, end, partial = byte_range(handler.headers.get("Range"), size)
            extra = [("Accept-Ranges", "bytes")]
            if partial:
                extra.append(("Content-Range", f"bytes {start}-{end - 1}/{size}"))
            mime = "text/plain; charset=utf-8" if kind == "text" else row["mime"]
            if original:
                extra.append(("Content-Disposition", "attachment"))
            self.headers(handler, 206 if partial else 200, mime, end - start, extra)
            os.lseek(fd, start, os.SEEK_SET)
            remaining = end - start
            while remaining:
                self.session.authorize(handler.headers.get("Origin", ""), handler.headers.get("Authorization", ""))
                data = os.read(fd, min(262144, remaining))
                if not data:
                    break
                handler.wfile.write(data)
                remaining -= len(data)
