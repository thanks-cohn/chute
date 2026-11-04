from __future__ import annotations

import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from chute.server import ChuteServer
from chute.store import Store


class CalendarStoreTests(unittest.TestCase):
    def test_daily_counts_survive_clear_and_recall_without_duplication(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp))
            items = [
                store.add_stream(f"capture-{i}.txt", io.BytesIO(b"ok"), 2)
                for i in range(50)
            ]
            day = items[0].created_at[:10]
            month = day[:7]

            self.assertEqual(store.history_month_counts(month)[day], 50)
            self.assertEqual(store.clear(), 50)
            self.assertEqual(store.list(), [])
            self.assertEqual(store.history_month_counts(month)[day], 50)

            self.assertIsNotNone(store.recall(items[0].id))
            self.assertEqual(store.history_month_counts(month)[day], 50)

            # Repeating an 'add' event with the same ID is not a second save.
            store._append_history("add", items[0], items[0].created_at)
            self.assertEqual(store.history_month_counts(month)[day], 50)

    def test_month_filters_and_invalid_names(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp))
            item = store.add_stream("a.txt", io.BytesIO(b"a"), 1)
            self.assertEqual(store.history_month_counts("2001-02"), {})
            self.assertEqual(store.history_month_counts(item.created_at[:7])[item.created_at[:10]], 1)
            for month in ["2026-00", "2026-13", "2026/11", "../2026", "2026-1", ""]:
                with self.subTest(month=month):
                    with self.assertRaises(ValueError):
                        store.history_month_counts(month)

    def test_preserved_history_keeps_past_date_counts(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp))
            item = store.add_stream("a.txt", io.BytesIO(b"a"), 1)
            store._append_history("add", item, "2020-02-29T10:00:00Z")
            self.assertEqual(store.history_month_counts("2020-02"), {"2020-02-29": 1})
            self.assertEqual(store.history_month_counts("2020-03"), {})
            store.clear()
            self.assertEqual(store.history_month_counts("2020-02"), {"2020-02-29": 1})


class CalendarAPITests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name))
        self.item = self.store.add_stream("capture.txt", io.BytesIO(b"ok"), 2)
        self.server = ChuteServer(("127.0.0.1", 0), self.store)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/api/calendar"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temp.cleanup()

    def fetch(self, suffix: str) -> tuple[int, dict]:
        try:
            with urlopen(Request(self.url + suffix), timeout=2) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def test_endpoint_reports_archived_history_after_clear(self) -> None:
        day = self.item.created_at[:10]
        month = day[:7]
        self.assertEqual(self.fetch(f"?month={month}")[1]["counts"], {day: 1})
        self.store.clear()
        status, payload = self.fetch(f"?month={month}")
        self.assertEqual(status, 200)
        self.assertEqual(payload["counts"], {day: 1})

    def test_endpoint_rejects_invalid_month(self) -> None:
        status, payload = self.fetch("?month=2026-13")
        self.assertEqual(status, 400)
        self.assertIn("error", payload)


if __name__ == "__main__":
    unittest.main()
