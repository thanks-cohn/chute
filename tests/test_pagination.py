from __future__ import annotations

import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

from chute.server import ChuteServer
from chute.store import Store


class PagedHistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / "state")
        self.items = [
            self.store.add_stream(f"file-{index:03}.txt", io.BytesIO(b"x"), 1)
            for index in range(200)
        ]

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_40_at_a_time_without_50_item_truncation(self) -> None:
        pages = [self.store.history_page(page * 40, 40) for page in range(5)]
        self.assertEqual([len(files) for files, _more in pages], [40] * 5)
        self.assertEqual([more for _, more in pages], [True, True, True, True, False])
        self.assertEqual(
            [file.id for page, _ in pages for file in page],
            [item.id for item in reversed(self.items)]
        )
        self.assertEqual(self.store.history_page(200, 40), ([], False))

    def test_user_chosen_200_item_page_is_supported(self) -> None:
        self.assertEqual(len(self.store.history_page(0, 200)[0]), 200)
        self.assertFalse(self.store.history_page(0, 200)[1])
        self.assertEqual(len(self.store.live_page(0, 200)[0]), 200)

    def test_live_pagination_and_clear_leaves_history_intact(self) -> None:
        first, more = self.store.live_page(0, 40)
        self.assertEqual(len(first), 40)
        self.assertTrue(more)
        self.assertEqual(self.store.clear(), 200)
        self.assertEqual(self.store.live_page(0, 40), ([], False))
        history, more = self.store.history_page(0, 40)
        self.assertEqual(len(history), 40)
        self.assertTrue(more)
        self.assertEqual(len(self.store.history_page(160, 40)[0]), 40)

    def test_crosses_dates_without_repeat_or_lost_items(self) -> None:
        old = self.items[0]
        self.store._append_history("add", old, "2020-02-29T10:00:00Z")
        page, more = self.store.history_page(196, 40)
        self.assertEqual(len(page), 5)
        self.assertEqual(page[-1].id, old.id)
        self.assertFalse(more)
        previous_day, more = self.store.history_page(0, 40, "2020-02-29")
        self.assertEqual([file.id for file in previous_day], [old.id])
        self.assertFalse(more)

    def test_empty_days_do_not_block_pagination(self) -> None:
        self.assertEqual(self.store.history_page(0, 40, "2000-01-01"), ([], False))

    def test_rejects_invalid_sizes_and_offsets(self) -> None:
        for offset, limit in [(-1, 40), (0, 0), (0, 501)]:
            with self.subTest(offset=offset, limit=limit):
                with self.assertRaises(ValueError):
                    self.store.history_page(offset, limit)


class PagedBrowseAPITests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / "state")
        for index in range(85):
            self.store.add_stream(f"test-{index}.txt", io.BytesIO(b"x"), 1)
        self.server = ChuteServer(("127.0.0.1", 0), self.store)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}/api/browse"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temp.cleanup()

    def browse(self, **query: object) -> tuple[int, dict]:
        url = self.base + "?" + urlencode(query)
        try:
            with urlopen(url, timeout=3) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def test_pagination_returns_only_requested_window(self) -> None:
        results = [self.browse(scope="history", page=i, limit=40) for i in range(3)]
        self.assertEqual([status for status, _ in results], [200] * 3)
        self.assertEqual([len(row["files"]) for _, row in results], [40, 40, 5])
        self.assertEqual([row["has_more"] for _, row in results], [True, True, False])
        ids = [file["id"] for _, row in results for file in row["files"]]
        self.assertEqual(len(set(ids)), 85)

    def test_archived_history_still_paginates_after_clear(self) -> None:
        self.store.clear()
        status, live = self.browse(scope="live", page=0, limit=40)
        self.assertEqual(status, 200)
        self.assertEqual(live["files"], [])
        status, archive = self.browse(scope="history", page=1, limit=40)
        self.assertEqual(status, 200)
        self.assertEqual(len(archive["files"]), 40)
        self.assertTrue(all(not row["active"] for row in archive["files"]))

    def test_invalid_pagination_is_rejected(self) -> None:
        for params in (
            {"scope": "history", "limit": 501},
            {"scope": "live", "page": -1},
            {"scope": "unknown"},
            {"scope": "history", "date": "2026-33-99"},
            {"scope": "live", "date": "2020-02-29"},
        ):
            with self.subTest(params=params):
                self.assertEqual(self.browse(**params)[0], 400)


if __name__ == "__main__":
    unittest.main()
