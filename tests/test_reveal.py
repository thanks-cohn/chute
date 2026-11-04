from __future__ import annotations

import io
import json
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from chute.reveal import reveal_file
from chute.server import ChuteServer
from chute.store import Store


class RevealTests(unittest.TestCase):
    def test_missing_file_does_not_launch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(FileNotFoundError):
                reveal_file(Path(temp) / "missing.txt")

    def test_windows_native_shell_selects_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp, "a file.txt")
            path.write_text("test", encoding="utf-8")
            with (
                mock.patch("chute.reveal.sys.platform", "win32"),
                mock.patch("chute.reveal._select_windows_shell") as shell,
            ):
                self.assertEqual(reveal_file(path), "selected")
                shell.assert_called_once_with(path.resolve())

    def test_windows_fallback_selects_file_with_explorer(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp, "a file.txt")
            path.write_text("test", encoding="utf-8")
            with (
                mock.patch("chute.reveal.sys.platform", "win32"),
                mock.patch("chute.reveal._select_windows_shell", side_effect=OSError("not supported")),
                mock.patch("chute.reveal.subprocess.Popen") as popen,
            ):
                self.assertEqual(reveal_file(path), "selected")
                self.assertEqual(
                    popen.call_args.args[0],
                    ["explorer.exe", "/select,", str(path.resolve())],
                )

    def test_linux_uses_filemanager_dbus_showitems_with_encoded_uri(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp, "space & name.txt")
            path.write_text("test", encoding="utf-8")
            with (
                mock.patch("chute.reveal.sys.platform", "linux"),
                mock.patch("chute.reveal.shutil.which", return_value="/usr/bin/gdbus"),
                mock.patch("chute.reveal.subprocess.run") as run,
            ):
                self.assertEqual(reveal_file(path), "selected")
                args = run.call_args.args[0]
                self.assertIn("org.freedesktop.FileManager1.ShowItems", args)
                self.assertIn(path.resolve().as_uri(), args[-2])
                self.assertIn("%20", args[-2])

    def test_linux_falls_back_to_parent_if_select_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp, "test.txt")
            path.write_text("test", encoding="utf-8")
            binaries = {"gdbus": "/usr/bin/gdbus", "xdg-open": "/usr/bin/xdg-open"}
            with (
                mock.patch("chute.reveal.sys.platform", "linux"),
                mock.patch("chute.reveal.shutil.which", side_effect=binaries.get),
                mock.patch(
                    "chute.reveal.subprocess.run",
                    side_effect=subprocess.CalledProcessError(1, ["gdbus"]),
                ),
                mock.patch("chute.reveal.subprocess.Popen") as popen,
            ):
                self.assertEqual(reveal_file(path), "folder")
                self.assertEqual(popen.call_args.args[0], ["xdg-open", str(path.resolve().parent)])

    def test_linux_native_fallback_selects_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp, "test.txt")
            path.write_text("test", encoding="utf-8")
            with (
                mock.patch("chute.reveal.sys.platform", "linux"),
                mock.patch("chute.reveal.shutil.which", side_effect=lambda x: "/usr/bin/dolphin" if x == "dolphin" else None),
                mock.patch("chute.reveal.subprocess.Popen") as popen,
            ):
                self.assertEqual(reveal_file(path), "selected")
                self.assertEqual(popen.call_args.args[0], ["dolphin", "--select", str(path.resolve())])


class RevealEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / "state")
        self.item = self.store.add_stream("proof.txt", io.BytesIO(b"hello"), 5)
        self.server = ChuteServer(("127.0.0.1", 0), self.store)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temp.cleanup()

    def post(self, item_id: str, origin: str = "chrome-extension://validextensionid") -> tuple[int, dict]:
        request = Request(
            f"{self.base_url}/api/reveal/{item_id}",
            data=b"",
            method="POST",
            headers={"Origin": origin},
        )
        try:
            with urlopen(request, timeout=2) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def test_valid_extension_id_opens_only_store_file(self) -> None:
        with mock.patch("chute.server.reveal_file", return_value="selected") as reveal:
            status, response = self.post(self.item.id)
            self.assertEqual(status, 200)
            self.assertEqual(response, {"ok": True, "selection": "selected"})
            reveal.assert_called_once_with(self.store.get(self.item.id)[1])

    def test_web_origins_and_unknown_ids_cannot_launch(self) -> None:
        with mock.patch("chute.server.reveal_file") as reveal:
            self.assertEqual(self.post(self.item.id, "https://example.com")[0], 403)
            self.assertEqual(self.post("not-an-id")[0], 400)
            self.assertEqual(self.post("f" * 32)[0], 404)
            reveal.assert_not_called()

    def test_archived_preserved_item_can_still_be_revealed(self) -> None:
        self.assertTrue(self.store.remove(self.item.id))
        with mock.patch("chute.server.reveal_file", return_value="folder"):
            status, response = self.post(self.item.id)
            self.assertEqual(status, 200)
            self.assertEqual(response["selection"], "folder")


if __name__ == "__main__":
    unittest.main()
