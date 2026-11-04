from __future__ import annotations

from .explorer.protocol import ExplorerError

import json
import os
import re
from dataclasses import asdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .provenance import append_image_capture
from .reveal import reveal_file
from .store import Store

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 17891
DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024


def allowed_origin(origin: str | None) -> str | None:
    if not origin:
        return None
    if origin.startswith("chrome-extension://"):
        return origin
    if origin in {
        f"http://{DEFAULT_HOST}:{DEFAULT_PORT}",
        f"http://localhost:{DEFAULT_PORT}",
    }:
        return origin
    return None


def max_upload_bytes() -> int:
    try:
        return int(os.environ.get("CHUTE_MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES))
    except ValueError:
        return DEFAULT_MAX_UPLOAD_BYTES


class ChuteHandler(BaseHTTPRequestHandler):
    server_version = "Chute/2"

    @property
    def store(self) -> Store:
        return self.server.store  # type: ignore[attr-defined]

    def _explorer_route(self) -> bool:
        if not urlparse(self.path).path.startswith("/api/explorer/"):
            return False
        native = getattr(self.server, "native_explorer", None)
        if urlparse(self.path).path == "/api/explorer/native/session":
            import secrets
            expected = f"127.0.0.1:{self.server.server_port}"
            if (not native or self.command != "POST" or self.headers.get("Origin") is not None
                    or self.headers.get("Host") != expected
                    or not secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer " + native.token)):
                self._json({"error": "Native authorization required"}, HTTPStatus.FORBIDDEN)
                return True
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 2 <= length <= 1024: raise ValueError()
                self.connection.settimeout(120)
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict) or set(body) not in ({"origin", "select"}, {"origin", "select", "writable"}) or type(body["select"]) is not bool or type(body.get("writable",False)) is not bool:
                    raise ValueError()
                result = native.action(body["origin"], select=body["select"],writable=body.get("writable",False))
                self._json(result)
            except ExplorerError as exc:
                self._json({'ok':False,'error':str(exc),'code':exc.code}, HTTPStatus.BAD_REQUEST)
            except Exception:
                # Never expose a native path, session token or raw OS exception.
                self._json({"ok": False, "error": "Folder selection was cancelled or unavailable. Select a local, non-system folder and retry."}, HTTPStatus.BAD_REQUEST)
            return True
        adapter = native.adapter(self.headers.get("Origin")) if native else getattr(self.server, "explorer_api", None)
        if adapter is None:
            self._json({"state": "failed", "error": {"code": "EXPLORER_DISABLED", "message": "Start a local read session to browse an approved folder."}}, HTTPStatus.FORBIDDEN)
            return True
        return adapter.route(self)

    def log_message(self, fmt: str, *args: object) -> None:
        if os.environ.get("CHUTE_QUIET") != "1":
            super().log_message(fmt, *args)

    def _cors(self, public: bool = False) -> None:
        if public:
            self.send_header("Access-Control-Allow-Origin", "*")
        else:
            origin = allowed_origin(self.headers.get("Origin"))
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, DELETE, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Chute-Filename, X-Chute-Mime, X-Chute-Source",
        )

    def _json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(
        self,
        file_path: Path,
        content_type: str,
        filename: str | None = None,
        *,
        immutable: bool = False,
    ) -> None:
        self.send_response(HTTPStatus.OK)
        self._cors(public=True)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(file_path.stat().st_size))
        if filename:
            self.send_header("Content-Disposition", f'inline; filename="{_header_name(filename)}"')
        self.send_header(
            "Cache-Control",
            "public, max-age=31536000, immutable" if immutable else "no-store",
        )
        self.end_headers()
        with file_path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                self.wfile.write(chunk)

    def do_OPTIONS(self) -> None:  # noqa: N802
        if self._explorer_route():
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self._explorer_route():
            return
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self._json({"ok": True, "service": "chute", "build": "main-2.6.1-upgrades-2026-11-03", "features": ["browse", "calendar", "reveal"]})
            return

        if path == "/api/files":
            active = self.store.list()
            self._json({"files": [public_item(item, active=True) for item in active]})
            return

        if path == "/api/browse":
            query = parse_qs(parsed.query)
            scope = (query.get("scope") or ["history"])[0]
            requested_day = (query.get("date") or [None])[0]
            try:
                page = int((query.get("page") or ["0"])[0])
                limit = int((query.get("limit") or ["40"])[0])
                if not 0 <= page <= 1_000_000 or not 1 <= limit <= 500:
                    raise ValueError("invalid page or limit")
                if scope not in ("live", "history"):
                    raise ValueError("invalid browse scope")
                if scope == "live" and requested_day is not None:
                    raise ValueError("date does not apply to live browsing")
                if requested_day is not None:
                    import datetime
                    if len(requested_day) != 10 or datetime.date.fromisoformat(requested_day).isoformat() != requested_day:
                        raise ValueError("date must be YYYY-MM-DD")
            except ValueError as exc:
                self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return

            offset = page * limit
            if scope == "live":
                items, has_more = self.store.live_page(offset, limit)
                self._json({
                    "scope": scope, "page": page, "limit": limit,
                    "files": [public_item(item, active=True) for item in items],
                    "has_more": has_more,
                    "date": None, "previous_date": None, "next_date": None
                })
                return

            dates = self.store.history_dates()
            current_day = requested_day or (dates[0] if dates else None)
            items, has_more = self.store.history_page(offset, limit, requested_day)
            active_ids = self.store.active_ids()
            self._json({
                "scope": scope, "page": page, "limit": limit,
                "files": [public_item(item, active=item.id in active_ids) for item in items],
                "has_more": has_more,
                "date": current_day,
                "previous_date": self.store.previous_history_date(current_day) if current_day else None,
                "next_date": self.store.next_history_date(current_day) if current_day else None,
            })
            return

        if path == "/api/calendar":
            month = (parse_qs(parsed.query).get("month") or [""])[0]
            try:
                counts = self.store.history_month_counts(month)
            except ValueError as exc:
                self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return
            self._json({"month": month, "counts": counts})
            return

        if path == "/api/history":
            query = parse_qs(parsed.query)
            requested_day = (query.get("date") or [None])[0]
            dates = self.store.history_dates()
            day = requested_day or (dates[0] if dates else None)
            if day is None:
                self._json(
                    {
                        "date": None,
                        "files": [],
                        "previous_date": None,
                        "next_date": None,
                    }
                )
                return
            active_ids = self.store.active_ids()
            items = self.store.history_day(day)
            self._json(
                {
                    "date": day,
                    "files": [public_item(item, active=item.id in active_ids) for item in items],
                    "previous_date": self.store.previous_history_date(day),
                    "next_date": self.store.next_history_date(day),
                }
            )
            return

        if path.startswith("/api/thumbnails/"):
            item_id = unquote(path.removeprefix("/api/thumbnails/"))
            thumbnail = self.store.get_thumbnail(item_id)
            if thumbnail is None:
                self._json({"error": "thumbnail not found"}, HTTPStatus.NOT_FOUND)
                return
            self._send_file(thumbnail, "image/webp", immutable=True)
            return

        if path.startswith("/api/files/"):
            item_id = unquote(path.removeprefix("/api/files/"))
            found = self.store.get(item_id)
            if not found:
                self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                return
            item, file_path = found
            self._send_file(file_path, item.mime, item.name)
            return

        self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_DELETE(self) -> None:  # noqa: N802
        if self._explorer_route():
            return
        path = urlparse(self.path).path
        if path.startswith("/api/files/"):
            item_id = unquote(path.removeprefix("/api/files/"))
            removed = self.store.remove(item_id)
            self._json({"removed": removed}, HTTPStatus.OK if removed else HTTPStatus.NOT_FOUND)
            return
        self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        if self._explorer_route():
            return
        path = urlparse(self.path).path

        if path.startswith("/api/reveal/"):
            # A desktop action must come from the installed browser extension;
            # never accept a path or command provided by a web page.
            origin = self.headers.get("Origin", "")
            if not origin.startswith("chrome-extension://") or not allowed_origin(origin):
                self._json({"error": "extension origin required"}, HTTPStatus.FORBIDDEN)
                return
            item_id = unquote(path.removeprefix("/api/reveal/"))
            if re.fullmatch(r"[0-9a-f]{32}", item_id) is None:
                self._json({"error": "invalid item id"}, HTTPStatus.BAD_REQUEST)
                return
            found = self.store.get(item_id)
            if found is None:
                self._json({"error": "saved file not found"}, HTTPStatus.NOT_FOUND)
                return
            try:
                selection = reveal_file(found[1])
            except (OSError, ValueError) as exc:
                self._json({"error": str(exc)}, HTTPStatus.SERVICE_UNAVAILABLE)
                return
            self._json({"ok": True, "selection": selection})
            return

        if path == "/api/clear":
            self._json({"removed": self.store.clear()})
            return

        if path == "/api/upload":
            self._receive_upload(custom_thumbnail=False)
            return

        if path == "/api/custom-thumbnails":
            self._receive_upload(custom_thumbnail=True)
            return

        if path == "/api/provenance/image":
            self._receive_image_provenance()
            return

        if path.startswith("/api/recall/"):
            item_id = unquote(path.removeprefix("/api/recall/"))
            item = self.store.recall(item_id)
            if item is None:
                self._json({"error": "history item is no longer available"}, HTTPStatus.NOT_FOUND)
                return
            self._json({"file": public_item(item, active=True)})
            return

        if path.startswith("/api/thumbnails/"):
            item_id = unquote(path.removeprefix("/api/thumbnails/"))
            self._receive_thumbnail(item_id)
            return

        self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def _receive_upload(self, *, custom_thumbnail: bool) -> None:
        origin = allowed_origin(self.headers.get("Origin"))
        if not origin:
            self._json({"error": "extension origin required"}, HTTPStatus.FORBIDDEN)
            return

        length_header = self.headers.get("Content-Length")
        if length_header is None:
            self._json({"error": "Content-Length required"}, HTTPStatus.LENGTH_REQUIRED)
            return
        try:
            size = int(length_header)
        except ValueError:
            self._json({"error": "invalid Content-Length"}, HTTPStatus.BAD_REQUEST)
            return
        if size < 0 or size > max_upload_bytes():
            self._json({"error": "upload too large"}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return

        name = unquote(self.headers.get("X-Chute-Filename", "browser-file"))
        mime = self.headers.get("X-Chute-Mime") or self.headers.get("Content-Type")
        source = unquote(self.headers.get("X-Chute-Source", "browser-drop"))
        if custom_thumbnail and (mime or "").split(";", 1)[0].lower() != "image/webp":
            self._json({"error": "custom thumbnail must be image/webp"}, HTTPStatus.BAD_REQUEST)
            return
        try:
            if custom_thumbnail:
                item = self.store.add_custom_stream(
                    name,
                    self.rfile,
                    size,
                    mime=mime,
                    source_path=source,
                )
            else:
                item = self.store.add_stream(
                    name,
                    self.rfile,
                    size,
                    mime=mime,
                    source_path=source,
                )
        except (OSError, ValueError) as exc:
            self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self._json({"file": public_item(item, active=True)}, HTTPStatus.CREATED)

    def _receive_image_provenance(self) -> None:
        origin = allowed_origin(self.headers.get("Origin"))
        if not origin:
            self._json({"error": "extension origin required"}, HTTPStatus.FORBIDDEN)
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0] != "application/json":
            self._json({"error": "provenance must be application/json"}, HTTPStatus.BAD_REQUEST)
            return

        length_header = self.headers.get("Content-Length")
        if length_header is None:
            self._json({"error": "Content-Length required"}, HTTPStatus.LENGTH_REQUIRED)
            return
        try:
            size = int(length_header)
        except ValueError:
            self._json({"error": "invalid Content-Length"}, HTTPStatus.BAD_REQUEST)
            return
        if size < 2 or size > 128 * 1024:
            self._json({"error": "invalid provenance size"}, HTTPStatus.BAD_REQUEST)
            return

        raw = self.rfile.read(size)
        if len(raw) != size:
            self._json({"error": "provenance upload ended early"}, HTTPStatus.BAD_REQUEST)
            return
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json({"error": "invalid provenance JSON"}, HTTPStatus.BAD_REQUEST)
            return
        if not isinstance(payload, dict) or not str(payload.get("image_url") or "").strip():
            self._json({"error": "image_url is required"}, HTTPStatus.BAD_REQUEST)
            return

        try:
            record = append_image_capture(self.store, payload)
        except OSError as exc:
            self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self._json({"record": record}, HTTPStatus.CREATED)

    def _receive_thumbnail(self, item_id: str) -> None:
        origin = allowed_origin(self.headers.get("Origin"))
        if not origin:
            self._json({"error": "extension origin required"}, HTTPStatus.FORBIDDEN)
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0] != "image/webp":
            self._json({"error": "thumbnail must be image/webp"}, HTTPStatus.BAD_REQUEST)
            return
        length_header = self.headers.get("Content-Length")
        if length_header is None:
            self._json({"error": "Content-Length required"}, HTTPStatus.LENGTH_REQUIRED)
            return
        try:
            size = int(length_header)
            self.store.save_thumbnail(item_id, self.rfile, size)
        except (OSError, ValueError) as exc:
            self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self._json({"ok": True}, HTTPStatus.CREATED)


def public_item(item: object, *, active: bool) -> dict[str, object]:
    row = asdict(item)
    result = {key: row[key] for key in ("id", "name", "size", "mime", "created_at")}
    result["active"] = active
    return result


def _header_name(name: str) -> str:
    return "".join(ch if 32 <= ord(ch) < 127 and ch not in {'"', "\\"} else "_" for ch in name)


class ChuteServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], store: Store) -> None:
        super().__init__(address, ChuteHandler)
        self.store = store
        self.explorer_api = None


def serve(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, root: Path | None = None, *, explorer_root: Path | None = None, explorer_origin: str | None = None) -> None:
    engine = None
    adapter = None
    if explorer_root is not None:
        from .explorer import Explorer, RootGrant, Session
        from .explorer.api import ExplorerAPI
        if host != DEFAULT_HOST or not explorer_origin:
            raise ValueError("Explorer requires loopback and an exact owner-approved extension origin")
        session = Session(explorer_origin)
        engine = Explorer([RootGrant(explorer_root)])
        adapter = ExplorerAPI(engine, session)
    store = Store(root)
    server = ChuteServer((host, port), store)
    server.explorer_api = adapter
    if os.name == "nt" and host == DEFAULT_HOST:
        from .explorer.native import NativeExplorer
        server.native_explorer = NativeExplorer()
    if adapter:
        print("Explorer READ ONLY session (15 minutes; paste in the enrolled Shelf): " + adapter.session.token, flush=True)
    print(f"Chute is listening at http://{host}:{port}")
    print(f"Chute home: {store.root}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if engine:
            engine.close()
