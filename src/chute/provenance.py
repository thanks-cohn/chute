from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

_PROVENANCE_LOCK = threading.RLock()
_TEXT_BLOCK_MARKER = "# CHUTE-IMAGE-CAPTURE\t1"


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


def _file_uri(path_value: object) -> str:
    text = _clean_text(path_value)
    if not text:
        return ""
    try:
        return Path(text).resolve().as_uri()
    except ValueError:
        return ""


def _append_clickable_text(destination: Path, record: dict[str, object]) -> None:
    downloaded_uri = _file_uri(record.get("downloaded_image_location"))
    mini_uri = _file_uri(record.get("mini_thumbnail_location"))
    custom_uri = _file_uri(record.get("custom_thumbnail_location"))
    source_link_uri = _file_uri(record.get("source_link_file_location"))

    lines = [
        _TEXT_BLOCK_MARKER,
        f"CAPTURE DATE: {record['capture_date']}",
        f"CAPTURED AT: {record['captured_at']}",
        f"CAPTURE ID: {record['capture_id']}",
        f"PAGE URL: {record['page_url']}",
        f"IMAGE URL: {record['image_url']}",
        f"DOWNLOADED IMAGE: {'yes' if record['downloaded_image'] else 'no'}",
        f"DOWNLOADED IMAGE LOCATION: {downloaded_uri or 'none'}",
        f"MINI THUMBNAIL: {'yes' if record['mini_thumbnail'] else 'no'}",
        f"MINI THUMBNAIL LOCATION: {mini_uri or 'none'}",
        f"CUSTOM THUMBNAIL: {'yes' if record['custom_thumbnail'] else 'no'}",
        f"CUSTOM THUMBNAIL LOCATION: {custom_uri or 'none'}",
        f"SOURCE LINK FILE: {'yes' if record['source_link_file'] else 'no'}",
        f"SOURCE LINK FILE LOCATION: {source_link_uri or 'none'}",
    ]

    with destination.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines))
        handle.write("\n\n")


def append_image_capture(store: Any, payload: dict[str, object]) -> dict[str, object]:
    """Append one canonical JSONL record and one clickable plain-text block."""

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

    jsonl_destination = Path(store.root) / "image-provenance.jsonl"
    text_destination = Path(store.root) / "image-provenance.txt"
    jsonl_destination.parent.mkdir(parents=True, exist_ok=True)

    with _PROVENANCE_LOCK:
        with jsonl_destination.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
            handle.write("\n")
        _append_clickable_text(text_destination, record)

    return record
