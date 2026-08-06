from __future__ import annotations

import json
import os
from dataclasses import asdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

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
    server_version = "Chute/0.2"

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

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            self._json({"ok": True, "service": "chute"})
            return
        if path == "/api/files":
            self._json({"files": [public_item(item) for item in self.store.list()]})
            return
        if path.startswith("/api/files/"):
            item_id = unquote(path.removeprefix("/api/files/"))
            found = self.store.get(item_id)
            if not found:
                self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                return
            item, file_path = found
            self.send_response(HTTPStatus.OK)
            self._cors(public=True)
            self.send_header("Content-Type", item.mime)
            self.send_header("Content-Length", str(file_path.stat().st_size))
            self.send_header("Content-Disposition", f'inline; filename="{_header_name(item.name)}"')
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with file_path.open("rb") as handle:
                while chunk := handle.read(1024 * 1024):
                    self.wfile.write(chunk)
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
            self._receive_upload()
            return
        self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def _receive_upload(self) -> None:
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
        try:
            item = self.store.add_stream(name, self.rfile, size, mime=mime, source_path=source)
        except (OSError, ValueError) as exc:
            self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self._json({"file": public_item(item)}, HTTPStatus.CREATED)


def public_item(item: object) -> dict[str, object]:
    row = asdict(item)
    return {key: row[key] for key in ("id", "name", "size", "mime", "created_at")}


def _header_name(name: str) -> str:
    return "".join(ch if 32 <= ord(ch) < 127 and ch not in {'"', "\\"} else "_" for ch in name)


class ChuteServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], store: Store) -> None:
        super().__init__(address, ChuteHandler)
        self.store = store


def serve(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, root: Path | None = None) -> None:
    server = ChuteServer((host, port), Store(root))
    print(f"Chute is listening at http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
