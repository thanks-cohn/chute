from __future__ import annotations

import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from chute.store import Store


class StoreTests(unittest.TestCase):
    def test_add_list_get_remove_and_clear(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "hello.txt"
            source.write_text("hello chute", encoding="utf-8")
            store = Store(root / "state")

            item = store.add(source)
            self.assertEqual(item.name, "hello.txt")
            self.assertEqual(len(store.list()), 1)
            found = store.get(item.id)
            self.assertIsNotNone(found)
            self.assertEqual(found[1].read_text(encoding="utf-8"), "hello chute")
            self.assertTrue(store.remove(item.id))
            self.assertEqual(store.list(), [])

            store.add(source)
            self.assertEqual(store.clear(), 1)
            self.assertEqual(store.list(), [])

    def test_directory_becomes_zip(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            folder = root / "project"
            folder.mkdir()
            (folder / "a.txt").write_text("a", encoding="utf-8")
            store = Store(root / "state")

            item = store.add(folder)
            self.assertEqual(item.name, "project.zip")
            found = store.get(item.id)
            self.assertIsNotNone(found)
            _, archive = found
            with zipfile.ZipFile(archive) as zf:
                self.assertEqual(zf.read("project/a.txt"), b"a")

    def test_browser_stream_becomes_queue_item(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / "state")
            body = b"dropped from chrome"
            item = store.add_stream(
                "browser-note.txt",
                io.BytesIO(body),
                len(body),
                mime="text/plain",
                source_path="browser-drop",
            )

            self.assertEqual(item.name, "browser-note.txt")
            self.assertEqual(item.mime, "text/plain")
            found = store.get(item.id)
            self.assertIsNotNone(found)
            self.assertEqual(found[1].read_bytes(), body)

    def test_short_browser_stream_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / "state")
            with self.assertRaises(ValueError):
                store.add_stream("broken.bin", io.BytesIO(b"12"), 10)
            self.assertEqual(store.list(), [])


if __name__ == "__main__":
    unittest.main()
