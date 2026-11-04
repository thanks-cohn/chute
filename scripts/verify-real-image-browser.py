"""Real Chrome rendering test: saved PNG bytes must become visible Shelf pixels.

Uses an isolated temporary Chute store and a real local ChuteServer. Never uses
the owner's real Chute history, Chrome profile, or installed companion.
"""
from __future__ import annotations

import io
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import zlib
from http import HTTPStatus
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from chute.server import ChuteHandler, ChuteServer  # noqa: E402
from chute.store import Store  # noqa: E402


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(
        ">I", zlib.crc32(kind + payload) & 0xFFFFFFFF
    )


def real_png() -> bytes:
    # 16 x 16 actual image bytes, independently decodable by Chrome.
    width = height = 16
    pixels = b"".join(
        b"\x00" + b"".join(bytes((x * 16, y * 16, 90, 255)) for x in range(width))
        for y in range(height)
    )
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + png_chunk(b"IDAT", zlib.compress(pixels))
        + png_chunk(b"IEND", b"")
    )


FIXTURE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chutey Image E2E</title><link rel="stylesheet" href="/_assets/shared.css">
<style>body { width: 390px; height: 600px; }</style></head>
<body><div id="status">Starting</div><main id="files" class="file-list"></main>
<div id="proof" data-image-rendered="no">WAITING_FOR_REAL_IMAGE</div>
<script>
window.chrome = Object.assign(window.chrome || {}, {
  storage: {
    sync: {get: async () => ({
      chutePageSize: 40, chuteThumbnails: true, chuteDragOutMode: "file"
    })},
    onChanged: {addListener() {}}
  },
  runtime: {sendMessage() {}}
});
window.setInterval(() => {
  const img = document.querySelector("#files .file-thumb");
  const icon = img?.closest(".file-icon");
  if (img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0 &&
      img.hidden === false && icon?.classList.contains("has-thumbnail")) {
    const proof = document.querySelector("#proof");
    proof.dataset.imageRendered = "yes";
    proof.textContent = "ACTUAL_IMAGE_RENDERED";
  }
}, 100);
</script>
<script src="/_assets/shelf.js"></script>
<script src="/_assets/workflow-fixes.js"></script>
</body></html>"""


class FixtureHandler(ChuteHandler):
    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        mime = None
        payload = None
        if path == "/fixture.html":
            payload, mime = FIXTURE.encode("utf-8"), "text/html; charset=utf-8"
        elif path in {
            "/_assets/shared.css", "/_assets/shelf.js", "/_assets/workflow-fixes.js"
        }:
            asset = ROOT / "extension" / path.rsplit("/", 1)[1]
            payload = asset.read_bytes()
            mime = "text/css" if asset.suffix == ".css" else "text/javascript"
        if payload is None:
            return super().do_GET()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)


def chrome_path() -> str | None:
    manual = os.environ.get("CHUTE_TEST_CHROME")
    if manual:
        return manual
    for item in [
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
        shutil.which("chrome"),
        Path(os.environ.get("PROGRAMFILES", "C:/Program Files")) /
        "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)")) /
        "Google/Chrome/Application/chrome.exe",
    ]:
        if item and Path(item).is_file():
            return str(item)
    return None


def main() -> None:
    chrome = chrome_path()
    if not chrome:
        raise SystemExit("BLOCKED: Chrome binary unavailable; cannot claim real visual preview.")
    with tempfile.TemporaryDirectory(prefix="chute-image-browser-") as temp:
        store = Store(Path(temp) / "chute-state")
        data = real_png()
        store.add_stream("real-picture.png", io.BytesIO(data), len(data), mime="image/png")
        server = ChuteServer(("127.0.0.1", 17891), store)
        server.RequestHandlerClass = FixtureHandler
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            command = [
                chrome,
                "--headless=new", "--disable-gpu", "--disable-background-networking",
                "--no-default-browser-check", "--no-first-run",
                "--no-sandbox", f"--user-data-dir={Path(temp) / 'chrome-profile'}",
                "--virtual-time-budget=8000", "--dump-dom",
                "http://127.0.0.1:17891/fixture.html",
            ]
            process = subprocess.run(
                command, capture_output=True, text=True, errors="replace", timeout=75
            )
            output = process.stdout
            if process.returncode != 0 or 'data-image-rendered="yes"' not in output:
                print(output[-5000:])
                print(process.stderr[-3500:], file=sys.stderr)
                raise AssertionError(
                    "FAIL: a real saved image was not displayed in the Chrome Shelf. "
                    f"Chrome exit code: {process.returncode}"
                )
            assert "ACTUAL_IMAGE_RENDERED" in output
            print("PASS: real Chrome decoded and displayed original Chute image in Shelf")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    main()
