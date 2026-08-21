from __future__ import annotations

import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from chute.store import Store


class StoreTests(unittest.TestCase):
    def test_add_remove_history_and_recall(self) -> None:
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
            preserved_path = found[1]
            self.assertEqual(preserved_path.read_text(encoding="utf-8"), "hello chute")

            self.assertTrue(store.remove(item.id))
            self.assertEqual(store.list(), [])
            self.assertTrue(preserved_path.is_file())

            recalled = store.recall(item.id)
            self.assertIsNotNone(recalled)
            self.assertEqual(recalled.id, item.id)
            self.assertEqual(len(store.list()), 1)

            day = item.created_at[:10]
            history = store.history_day(day)
            self.assertEqual([entry.id for entry in history], [item.id])
            log = (store.history_dir / f"{day}.tsv").read_text(encoding="utf-8")
            self.assertTrue(log.startswith("# CHUTE-HISTORY\t1\tUTF-8\tTSV\tPCT\n"))
            self.assertIn("\tadd\t", log)
            self.assertIn("\tremove\t", log)
            self.assertIn("\trecall\t", log)

    def test_clear_keeps_preserved_files_recallable(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "hello.txt"
            source.write_text("hello chute", encoding="utf-8")
            store = Store(root / "state")
            item = store.add(source)
            preserved = store.get(item.id)[1]

            self.assertEqual(store.clear(), 1)
            self.assertEqual(store.list(), [])
            self.assertTrue(preserved.exists())
            self.assertIsNotNone(store.recall(item.id))

    def test_history_percent_encoding_survives_tabs_and_unicode(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / "state")
            body = b"hello"
            item = store.add_stream(
                "cute image.txt",
                io.BytesIO(body),
                len(body),
                mime="text/plain",
                source_path="browser\t源\nline",
            )
            history = store.history_day(item.created_at[:10])
            self.assertEqual(history[0].source_path, "browser\t源\nline")
            self.assertEqual(history[0].name, "cute image.txt")

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

    def test_thumbnail_is_stored_separately(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / "state")
            body = b"not-decoded-by-python"
            item = store.add_stream(
                "tiny.png",
                io.BytesIO(body),
                len(body),
                mime="image/png",
            )
            thumb = b"RIFFfake-webp"
            path = store.save_thumbnail(item.id, io.BytesIO(thumb), len(thumb))
            self.assertEqual(path.parent, store.thumbs_dir)
            self.assertEqual(path.read_bytes(), thumb)

    def test_short_browser_stream_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / "state")
            with self.assertRaises(ValueError):
                store.add_stream("broken.bin", io.BytesIO(b"12"), 10)
            self.assertEqual(store.list(), [])


if __name__ == "__main__":
    unittest.main()
