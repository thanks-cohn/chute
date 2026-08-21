from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

_PROVENANCE_LOCK = threading.RLock()


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _item_path(store: Any, item_id: object) -> str | None:
    value = _clean_text(item_id)
    if not value:
        return None
    found = store.get(value)
    if found is None:
        return None
    return str(Path(found[1]).resolve())


def _thumbnail_path(store: Any, item_id: object) -> str | None:
    value = _clean_text(item_id)
    if not value:
        return None
    found = store.get_thumbnail(value)
    if found is None:
        return None
    return str(Path(found).resolve())


def append_image_capture(store: Any, payload: dict[str, object]) -> dict[str, object]:
    """Append exactly one self-contained JSONL record for one browser image capture."""

    now = datetime.now().astimezone()
    downloaded_location = _item_path(store, payload.get("downloaded_image_id"))
    custom_location = _item_path(store, payload.get("custom_thumbnail_id"))
    mini_location = _thumbnail_path(store, payload.get("mini_thumbnail_id"))
    source_link_location = _item_path(store, payload.get("source_link_file_id"))

    record: dict[str, object] = {
        "schema": "chute-image-capture-1",
        "capture_id": _clean_text(payload.get("capture_id")) or uuid.uuid4().hex,
        "captured_at": now.isoformat(timespec="milliseconds"),
        "capture_date": now.date().isoformat(),
        "page_url": _clean_text(payload.get("page_url")),
        "image_url": _clean_text(payload.get("image_url")),
        "downloaded_image": downloaded_location is not None,
        "downloaded_image_location": downloaded_location,
        "mini_thumbnail": mini_location is not None,
        "mini_thumbnail_location": mini_location,
        "custom_thumbnail": custom_location is not None,
        "custom_thumbnail_location": custom_location,
        "source_link_file": source_link_location is not None,
        "source_link_file_location": source_link_location,
    }

    destination = Path(store.root) / "image-provenance.jsonl"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with _PROVENANCE_LOCK:
        with destination.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
            handle.write("\n")

    return record
