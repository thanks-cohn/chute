from __future__ import annotations

import json
import mimetypes
import os
import shutil
import tempfile
import threading
import uuid
import zipfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO, Callable, Iterable
from urllib.parse import quote, unquote

_LOCK = threading.RLock()
_HISTORY_MAGIC = "# CHUTE-HISTORY\t1\tUTF-8\tTSV\tPCT\n"
_HISTORY_COLUMNS = "# timestamp_utc\tevent\tid\tname\tstored_name\tsize\tmime\tsource_path\n"


def data_home() -> Path:
    override = os.environ.get("CHUTE_HOME")
    if override:
        return Path(override).expanduser().resolve()
    return (Path.home() / "Chute").resolve()


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _encode_field(value: str) -> str:
    return quote(str(value), safe="-._~")


def _decode_field(value: str) -> str:
    return unquote(value)


@dataclass(frozen=True)
class QueueItem:
    id: str
    name: str
    stored_name: str
    size: int
    mime: str
    created_at: str
    source_path: str


class Store:
    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or data_home()).expanduser().resolve()
        self.files_dir = self.root / "files"
        self.thumbs_dir = self.root / "thumbs"
        self.history_dir = self.root / "history"
        self.queue_path = self.root / "queue.json"
        self.files_dir.mkdir(parents=True, exist_ok=True)
        self.thumbs_dir.mkdir(parents=True, exist_ok=True)
        self.history_dir.mkdir(parents=True, exist_ok=True)
        if not self.queue_path.exists():
            self._write_queue([])

    def _read_queue(self) -> list[dict]:
        try:
            data = json.loads(self.queue_path.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def _write_queue(self, rows: list[dict]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix="queue-", suffix=".json", dir=self.root)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(rows, handle, separators=(",", ":"), ensure_ascii=False)
                handle.write("\n")
            os.replace(temp_name, self.queue_path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

    def _append_queue(self, item: QueueItem) -> None:
        rows = self._read_queue()
        if not any(row.get("id") == item.id for row in rows):
            rows.append(asdict(item))
            self._write_queue(rows)

    def _history_path(self, timestamp: str) -> Path:
        return self.history_dir / f"{timestamp[:10]}.tsv"

    def _append_history(self, event: str, item: QueueItem, timestamp: str | None = None) -> None:
        stamp = timestamp or utc_timestamp()
        path = self._history_path(stamp)
        new_file = not path.exists() or path.stat().st_size == 0
        fields = (
            stamp,
            event,
            item.id,
            item.name,
            item.stored_name,
            str(item.size),
            item.mime,
            item.source_path,
        )
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            if new_file:
                handle.write(_HISTORY_MAGIC)
                handle.write(_HISTORY_COLUMNS)
            handle.write("\t".join(_encode_field(field) for field in fields))
            handle.write("\n")

    def _parse_history_line(self, line: str) -> tuple[str, str, QueueItem] | None:
        if not line or line.startswith("#"):
            return None
        parts = line.rstrip("\n").split("\t")
        if len(parts) != 8:
            return None
        stamp, event, item_id, name, stored_name, size, mime, source_path = (
            _decode_field(part) for part in parts
        )
        try:
            item_size = int(size)
        except ValueError:
            return None
        item = QueueItem(
            id=item_id,
            name=name,
            stored_name=stored_name,
            size=item_size,
            mime=mime,
            created_at=stamp,
            source_path=source_path,
        )
        return stamp, event, item

    def history_dates(self) -> list[str]:
        dates = [
            path.stem
            for path in self.history_dir.glob("????-??-??.tsv")
            if path.is_file()
        ]
        dates.sort(reverse=True)
        return dates

    def history_day(self, day: str | None = None) -> list[QueueItem]:
        dates = self.history_dates()
        if day is None:
            if not dates:
                return []
            day = dates[0]
        path = self.history_dir / f"{day}.tsv"
        if not path.is_file():
            return []
        items: list[QueueItem] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            parsed = self._parse_history_line(line)
            if parsed and parsed[1] == "add":
                items.append(parsed[2])
        items.reverse()
        return items

    def previous_history_date(self, day: str) -> str | None:
        dates = self.history_dates()
        try:
            index = dates.index(day)
        except ValueError:
            return dates[0] if dates else None
        return dates[index + 1] if index + 1 < len(dates) else None

    def next_history_date(self, day: str) -> str | None:
        dates = self.history_dates()
        try:
            index = dates.index(day)
        except ValueError:
            return None
        return dates[index - 1] if index > 0 else None

    def _find_history_item(self, item_id: str) -> QueueItem | None:
        for day in self.history_dates():
            path = self.history_dir / f"{day}.tsv"
            for line in path.read_text(encoding="utf-8").splitlines():
                parsed = self._parse_history_line(line)
                if parsed and parsed[1] == "add" and parsed[2].id == item_id:
                    return parsed[2]
        return None

    def list(self) -> list[QueueItem]:
        with _LOCK:
            valid: list[dict] = []
            changed = False
            for row in self._read_queue():
                if (self.files_dir / row.get("stored_name", "")).is_file():
                    valid.append(row)
                else:
                    changed = True
            if changed:
                self._write_queue(valid)
            valid.sort(key=lambda row: row.get("created_at", ""), reverse=True)
            return [QueueItem(**row) for row in valid]

    def active_ids(self) -> set[str]:
        return {item.id for item in self.list()}

    def add_many(self, paths: Iterable[Path]) -> list[QueueItem]:
        return [self.add(path) for path in paths]

    def add(self, path: Path) -> QueueItem:
        source = path.expanduser().resolve()
        if not source.exists():
            raise FileNotFoundError(f"No such file or directory: {path}")

        prepared, display_name, cleanup = self._prepare(source)
        try:
            item_id = uuid.uuid4().hex
            safe_name = Path(display_name).name or "file"
            stored_name = f"{item_id}-{safe_name}"
            destination = self.files_dir / stored_name
            shutil.copy2(prepared, destination)
            mime = mimetypes.guess_type(display_name)[0] or "application/octet-stream"
            item = QueueItem(
                id=item_id,
                name=display_name,
                stored_name=stored_name,
                size=destination.stat().st_size,
                mime=mime,
                created_at=utc_timestamp(),
                source_path=str(source),
            )
            with _LOCK:
                self._append_queue(item)
                self._append_history("add", item, item.created_at)
            return item
        finally:
            cleanup()

    def add_stream(
        self,
        name: str,
        stream: BinaryIO,
        size: int,
        mime: str | None = None,
        source_path: str = "browser-drop",
    ) -> QueueItem:
        if size < 0:
            raise ValueError("Upload size cannot be negative")

        display_name = Path(name).name.strip() or "browser-file"
        item_id = uuid.uuid4().hex
        stored_name = f"{item_id}-{display_name}"
        destination = self.files_dir / stored_name
        partial = self.files_dir / f".{stored_name}.part"
        remaining = size

        try:
            with partial.open("wb") as handle:
                while remaining:
                    chunk = stream.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError("Upload ended before the declared size")
                    handle.write(chunk)
                    remaining -= len(chunk)
            os.replace(partial, destination)

            item = QueueItem(
                id=item_id,
                name=display_name,
                stored_name=stored_name,
                size=destination.stat().st_size,
                mime=mime or mimetypes.guess_type(display_name)[0] or "application/octet-stream",
                created_at=utc_timestamp(),
                source_path=source_path,
            )
            with _LOCK:
                self._append_queue(item)
                self._append_history("add", item, item.created_at)
            return item
        except Exception:
            partial.unlink(missing_ok=True)
            destination.unlink(missing_ok=True)
            raise

    def _prepare(self, source: Path) -> tuple[Path, str, Callable[[], None]]:
        if source.is_file():
            return source, source.name, lambda: None
        if not source.is_dir():
            raise ValueError(f"Unsupported path type: {source}")

        temp_dir = Path(tempfile.mkdtemp(prefix="chute-zip-"))
        archive = temp_dir / f"{source.name or 'directory'}.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for child in sorted(source.rglob("*")):
                if child.is_file():
                    zf.write(child, Path(source.name) / child.relative_to(source))
        return archive, archive.name, lambda: shutil.rmtree(temp_dir, ignore_errors=True)

    def get(self, item_id: str) -> tuple[QueueItem, Path] | None:
        item = next((candidate for candidate in self.list() if candidate.id == item_id), None)
        if item is None:
            item = self._find_history_item(item_id)
        if item is None:
            return None
        path = self.files_dir / item.stored_name
        return (item, path) if path.is_file() else None

    def remove(self, item_id: str) -> bool:
        with _LOCK:
            rows = self._read_queue()
            kept: list[dict] = []
            removed_item: QueueItem | None = None
            for row in rows:
                if row.get("id") == item_id:
                    removed_item = QueueItem(**row)
                else:
                    kept.append(row)
            if removed_item is None:
                return False
            self._write_queue(kept)
            self._append_history("remove", removed_item)
            return True

    def clear(self) -> int:
        with _LOCK:
            rows = self._read_queue()
            items = [QueueItem(**row) for row in rows]
            self._write_queue([])
            for item in items:
                self._append_history("clear", item)
            return len(items)

    def recall(self, item_id: str) -> QueueItem | None:
        with _LOCK:
            active = next((item for item in self.list() if item.id == item_id), None)
            if active is not None:
                return active
            item = self._find_history_item(item_id)
            if item is None:
                return None
            path = self.files_dir / item.stored_name
            if not path.is_file():
                return None
            self._append_queue(item)
            self._append_history("recall", item)
            return item

    def thumbnail_path(self, item_id: str) -> Path:
        return self.thumbs_dir / f"{item_id}.webp"

    def get_thumbnail(self, item_id: str) -> Path | None:
        path = self.thumbnail_path(item_id)
        return path if path.is_file() else None

    def save_thumbnail(self, item_id: str, stream: BinaryIO, size: int) -> Path:
        if size < 0 or size > 256 * 1024:
            raise ValueError("Thumbnail must be 256 KiB or smaller")
        found = self.get(item_id)
        if found is None or not found[0].mime.startswith("image/"):
            raise ValueError("Thumbnail target is not a known image")
        destination = self.thumbnail_path(item_id)
        partial = self.thumbs_dir / f".{item_id}.webp.part"
        remaining = size
        try:
            with partial.open("wb") as handle:
                while remaining:
                    chunk = stream.read(min(64 * 1024, remaining))
                    if not chunk:
                        raise ValueError("Thumbnail upload ended before the declared size")
                    handle.write(chunk)
                    remaining -= len(chunk)
            os.replace(partial, destination)
            return destination
        except Exception:
            partial.unlink(missing_ok=True)
            raise
