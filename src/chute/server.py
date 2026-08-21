from __future__ import annotations

import json
import os
from dataclasses import asdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .provenance import append_image_capture
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
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self._json({"ok": True, "service": "chute"})
            return

        if path == "/api/files":
            active = self.store.list()
            self._json({"files": [public_item(item, active=True) for item in active]})
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
        path = urlparse(self.path).path
        if path.startswith("/api/files/"):
            item_id = unquote(path.removeprefix("/api/files/"))
            removed = self.store.remove(item_id)
            self._json({"removed": removed}, HTTPStatus.OK if removed else HTTPStatus.NOT_FOUND)
            return
        self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path

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


def serve(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, root: Path | None = None) -> None:
    store = Store(root)
    server = ChuteServer((host, port), store)
    print(f"Chute is listening at http://{host}:{port}")
    print(f"Chute home: {store.root}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
