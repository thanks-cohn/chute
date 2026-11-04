"""Real filesystem and loopback tests, with independent byte/name oracles."""
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

from chute.explorer import Explorer, ExplorerError, RootGrant, Session
from chute.explorer.api import ExplorerAPI
from chute.explorer.preview import byte_range, thumbnail
from chute.explorer.protocol import BLOCKED_COMMANDS
from chute.explorer.security import component
from chute.server import ChuteServer
from chute.store import Store

ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"


@unittest.skipUnless(os.name == "posix", "Windows native handle guard is explicitly unsupported")
class ExplorerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="chutey-api-test-")
        self.root = Path(self.temp.name) / "fixture"
        self.root.mkdir()
        self.grant = RootGrant(self.root)
        self.engine = Explorer([self.grant])
        self.handle = self.grant.id

    def tearDown(self):
        self.engine.close()
        self.temp.cleanup()

    def run_command(self, command, **args):
        result = self.engine.execute(command, **args)
        self.assertEqual(result["state"], "completed", result)
        return result["result"]

    def file(self, name="hello.txt", data=b"hello world"):
        (self.root / name).write_bytes(data)
        return next(row for row in self.run_command("list", handle=self.handle)["entries"] if row["name"] == name)

    def test_list_empty_is_success(self):
        result = self.run_command("list", handle=self.handle)
        self.assertEqual(result["entries"], [])
        self.assertIsNone(result["next_offset"])

    def test_pagination_unicode_sort_search_and_parent(self):
        for i in range(211):
            (self.root / f"file-{i:03}.txt").write_bytes(bytes([i % 256]))
        (self.root / "雪").mkdir()
        rows = []
        for offset in (0, 100, 200):
            rows.extend(self.run_command("list", handle=self.handle, offset=offset)["entries"])
        self.assertEqual([row["name"] for row in rows], sorted(p.name for p in self.root.iterdir()))
        row = self.run_command("search", handle=self.handle, query="雪")["entries"][0]
        self.assertEqual(self.run_command("list", handle=row["handle"])["parent"], self.handle)
        self.assertEqual(self.run_command("stat", handle=row["handle"])["kind"], "directory")

    def test_no_paths_in_receipts(self):
        row = self.file()
        result = self.run_command("stat", handle=row["handle"])
        self.assertNotIn(str(self.root), json.dumps(result))
        receipt = self.engine.execute("stat", handle="../../etc/passwd")
        self.assertEqual(receipt["error"]["code"], "INVALID_HANDLE")

    def test_reserved_names(self):
        for name in ("..", ".", "a/b", "a\\b", "NUL.txt", "com1", "a:", "x.", "a\x00b", " "):
            with self.subTest(name=name), self.assertRaises(ExplorerError):
                component(name)

    def test_symlink_and_fifo_denied(self):
        outside = Path(self.temp.name) / "outside.txt"
        outside.write_bytes(b"private")
        (self.root / "link.txt").symlink_to(outside)
        os.mkfifo(self.root / "pipe")
        rows = self.run_command("list", handle=self.handle)["entries"]
        self.assertTrue(all(row["kind"] == "blocked" for row in rows))
        for row in rows:
            self.assertEqual(self.engine.execute("stat", handle=row["handle"])["state"], "failed")

    def test_replaced_ancestor_never_follows_link(self):
        (self.root / "folder").mkdir()
        (self.root / "folder" / "file.txt").write_bytes(b"allowed")
        folder = self.run_command("list", handle=self.handle)["entries"][0]
        row = self.run_command("list", handle=folder["handle"])["entries"][0]
        (self.root / "folder").rename(self.root / "moved")
        (self.root / "folder").symlink_to(Path(self.temp.name), target_is_directory=True)
        self.assertEqual(self.engine.execute("stat", handle=row["handle"])["state"], "failed")

    def test_missing_and_invalid_types(self):
        row = self.file()
        (self.root / row["name"]).unlink()
        self.assertEqual(self.engine.execute("stat", handle=row["handle"])["error"]["code"], "NOT_FOUND")
        for args in ({"limit": 0}, {"offset": -1}, {"limit": True}, {"query": []}, {"descending": "yes"}, {"sort": "shell"}, {"path": "/tmp"}):
            self.assertEqual(self.engine.execute("list", handle=self.handle, **args)["state"], "failed")

    def test_mutations_are_explicitly_blocked(self):
        row = self.file()
        before = (self.root / row["name"]).read_bytes()
        for command in BLOCKED_COMMANDS:
            receipt = self.engine.execute(command, handle=row["handle"])
            self.assertEqual(receipt["error"]["code"], "NATIVE_CONSENT_REQUIRED")
        self.assertEqual((self.root / row["name"]).read_bytes(), before)

    def test_decode_thumbnail_real_pixels_and_damage(self):
        from PIL import Image
        path = self.root / "photo.png"
        Image.new("RGB", (1024, 512), (240, 10, 20)).save(path)
        row = self.run_command("list", handle=self.handle)["entries"][0]
        with self.grant.open(row["handle"]) as fd:
            data = thumbnail(fd)
        with Image.open(io.BytesIO(data)) as image:
            self.assertEqual(image.size, (256, 128))
            r, g, b = image.getpixel((30, 30))
            self.assertGreater(r, 230)
            self.assertLess(g, 20)
        path.write_bytes(b"damaged")
        with self.grant.open(row["handle"]) as fd, self.assertRaises(ExplorerError):
            thumbnail(fd)

    def test_range_contract(self):
        self.assertEqual(byte_range(None, 10), (0, 10, False))
        for value, expected in [("bytes=2-4", (2, 5, True)), ("bytes=-3", (7, 10, True)), ("bytes=8-", (8, 10, True)), ("bytes=0-100", (0, 10, True))]:
            self.assertEqual(byte_range(value, 10), expected)
        for value in ("bytes=10-", "bytes=-0", "bytes=4-2", "bytes=0-1,4-5", "garbage"):
            with self.assertRaises(ExplorerError):
                byte_range(value, 10)

    def test_session_expiry_and_exact_origin(self):
        session = Session(ORIGIN, ttl=-1)
        with self.assertRaises(ExplorerError):
            session.authorize(ORIGIN, "Bearer " + session.token)
        session = Session(ORIGIN)
        for origin, bearer in ((ORIGIN + "/", "Bearer " + session.token), (ORIGIN, "wrong")):
            with self.assertRaises(ExplorerError):
                session.authorize(origin, bearer)

    def test_http_auth_origin_host_range_and_disabled(self):
        row = self.file(data=b"hello world")
        session = Session(ORIGIN)
        server = ChuteServer(("127.0.0.1", 0), Store(Path(self.temp.name) / "history"))
        server.explorer_api = ExplorerAPI(self.engine, session)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}/api/explorer/v1/"
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        def request(body, headers=None, route="command", method="POST"):
            return opener.open(urllib.request.Request(base + route, json.dumps(body).encode() if method == "POST" else None, {"Origin": ORIGIN, "Authorization": "Bearer " + session.token, "Content-Type": "application/json", **(headers or {})}, method=method), timeout=5)
        try:
            with request({"command": "roots"}) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers["Access-Control-Allow-Origin"], ORIGIN)
            for headers in ({"Origin": "https://evil.test"}, {"Authorization": "Bearer wrong"}, {"Host": "evil.test"}, {"Origin": "chrome-extension://pppppppppppppppppppppppppppppppp"}):
                with self.assertRaises(urllib.error.HTTPError) as error:
                    request({"command": "roots"}, headers)
                self.assertEqual(error.exception.code, 403)
            with request({"handle": row["handle"], "identity": row["identity"]}, {"Range": "bytes=1-4"}, "content") as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(response.headers["Content-Range"], "bytes 1-4/11")
                self.assertEqual(response.read(), b"ello")
                self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
            with self.assertRaises(urllib.error.HTTPError) as error:
                request({"handle": row["handle"], "identity": row["identity"]}, {"Range": "bytes=99-"}, "content")
            self.assertEqual(error.exception.code, 416)
            binary = self.file("original.bin", bytes(range(256))*5)
            with request({"handle":binary["handle"],"identity":binary["identity"],"original":True},route="content") as response:
                self.assertEqual(response.read(),bytes(range(256))*5)
                self.assertEqual(response.headers["Content-Disposition"],"attachment")
            # Original export neither invents a preview nor relaxes identity/auth.
            for body, headers in (({"handle":binary["handle"],"identity":binary["identity"]},{}),
                                  ({"handle":binary["handle"],"identity":"stale","original":True},{}),
                                  ({"handle":binary["handle"],"identity":binary["identity"],"original":True},{"Authorization":"Bearer wrong"})):
                with self.assertRaises(urllib.error.HTTPError): request(body,headers,route="content")
            self.assertEqual(server.store.list(),[],"Original export must not pre-copy into Live")
            with (self.root / "large.bin").open("wb") as large: large.truncate(32*1024*1024+1)
            large=next(value for value in self.run_command("list",handle=self.handle)["entries"] if value["name"]=="large.bin")
            with self.assertRaises(urllib.error.HTTPError) as error:
                request({"handle":large["handle"],"identity":large["identity"],"original":True},route="content")
            self.assertEqual(json.load(error.exception)["error"]["code"],"TRANSFER_LIMIT")
            (self.root / row["name"]).write_bytes(b"changed")
            with self.assertRaises(urllib.error.HTTPError):
                request({"handle": row["handle"], "identity": row["identity"]}, route="content")
            server.explorer_api = None
            with self.assertRaises(urllib.error.HTTPError) as error:
                request({"command": "roots"})
            self.assertEqual(error.exception.code, 403)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_unreadable_and_active_preview_types(self):
        (self.root / "private").mkdir()
        private = self.run_command("list", handle=self.handle)["entries"][0]
        (self.root / "private").chmod(0)
        try:
            if os.geteuid() == 0:
                self.skipTest("Root bypasses permission bits; cannot claim permission-denied proof")
            receipt = self.engine.execute("list", handle=private["handle"])
            self.assertEqual(receipt["error"]["code"], "PERMISSION_DENIED")
        finally:
            (self.root / "private").chmod(0o700)
        for name in ("active.html", "active.svg", "active.js"):
            row = self.file(name, b"<script>alert(1)</script>")
            self.assertEqual(self.run_command("preview", handle=row["handle"])["preview"], "unavailable")

    def test_deep_path_many_entries_and_stable_sort(self):
        current = self.root
        handle = self.handle
        for index in range(30):
            name = f"branch-{index}-雪"
            current = current / name
            current.mkdir()
            listing = self.run_command("list", handle=handle)
            handle = next(row["handle"] for row in listing["entries"] if row["name"] == name)
        (current / "leaf.txt").write_bytes(b"deep")
        row = self.run_command("list", handle=handle)["entries"][0]
        self.assertEqual(self.run_command("stat", handle=row["handle"])["size"], 4)
        for index in range(2001):
            (self.root / f"entry-{index:04}.bin").touch()
        result = self.run_command("list", handle=self.handle, offset=2000, limit=200)
        self.assertEqual(result["total"], 2002)
        self.assertEqual(len(result["entries"]), 2)
        self.assertIsNone(result["next_offset"])
