from __future__ import annotations

import io
import json
import tempfile
import unittest
from pathlib import Path

from chute.provenance import append_image_capture
from chute.store import Store


class ProvenanceTests(unittest.TestCase):
    def test_image_capture_is_one_self_contained_jsonl_line(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / "state")

            original_body = b"full-image"
            original = store.add_stream(
                "original.jpg",
                io.BytesIO(original_body),
                len(original_body),
                mime="image/jpeg",
                source_path="https://cdn.example/full.jpg",
            )
            custom_body = b"custom-webp"
            custom = store.add_stream(
                "original-512x512.webp",
                io.BytesIO(custom_body),
                len(custom_body),
                mime="image/webp",
                source_path="https://cdn.example/full.jpg",
            )
            thumb_body = b"RIFFmini-webp"
            thumb = store.save_thumbnail(original.id, io.BytesIO(thumb_body), len(thumb_body))

            record = append_image_capture(
                store,
                {
                    "capture_id": "capture-123",
                    "page_url": "https://example.com/post/123?view=full#image",
                    "image_url": "https://cdn.example/full.jpg?token=abc",
                    "downloaded_image_id": original.id,
                    "mini_thumbnail_id": original.id,
                    "custom_thumbnail_id": custom.id,
                    "source_link_file_id": None,
                },
            )

            path = store.root / "image-provenance.jsonl"
            lines = path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            saved = json.loads(lines[0])
            self.assertEqual(saved, record)
            self.assertEqual(saved["schema"], "chute-image-capture-1")
            self.assertEqual(saved["capture_id"], "capture-123")
            self.assertEqual(saved["page_url"], "https://example.com/post/123?view=full#image")
            self.assertEqual(saved["image_url"], "https://cdn.example/full.jpg?token=abc")
            self.assertTrue(saved["downloaded_image"])
            self.assertEqual(saved["downloaded_image_location"], str(store.get(original.id)[1].resolve()))
            self.assertTrue(saved["mini_thumbnail"])
            self.assertEqual(saved["mini_thumbnail_location"], str(thumb.resolve()))
            self.assertTrue(saved["custom_thumbnail"])
            self.assertEqual(saved["custom_thumbnail_location"], str(store.get(custom.id)[1].resolve()))
            self.assertFalse(saved["source_link_file"])
            self.assertIsNone(saved["source_link_file_location"])
            self.assertRegex(saved["capture_date"], r"^\d{4}-\d{2}-\d{2}$")
            self.assertIn("T", saved["captured_at"])

    def test_absent_artifacts_are_explicit_false_and_null(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / "state")
            record = append_image_capture(
                store,
                {
                    "page_url": "https://example.com/gallery",
                    "image_url": "https://example.com/image.png",
                },
            )

            for key in ("downloaded_image", "mini_thumbnail", "custom_thumbnail", "source_link_file"):
                self.assertFalse(record[key])
                self.assertIsNone(record[f"{key}_location"])


if __name__ == "__main__":
    unittest.main()
