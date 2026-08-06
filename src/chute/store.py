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

_LOCK = threading.RLock()


def data_home() -> Path:
    override = os.environ.get("CHUTE_HOME")
    if override:
        return Path(override).expanduser().resolve()

    if os.name == "nt":
        root = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return root / "Chute"

    if sys_platform() == "darwin":
        return Path.home() / "Library" / "Application Support" / "Chute"

    root = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return root / "chute"


def sys_platform() -> str:
    import sys

    return sys.platform


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
        self.queue_path = self.root / "queue.json"
        self.files_dir.mkdir(parents=True, exist_ok=True)
        if not self.queue_path.exists():
            self._write([])

    def _read(self) -> list[dict]:
        try:
            data = json.loads(self.queue_path.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def _write(self, rows: list[dict]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix="queue-", suffix=".json", dir=self.root)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(rows, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
            os.replace(temp_name, self.queue_path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

    def _append_item(self, item: QueueItem) -> None:
        with _LOCK:
            rows = self._read()
            rows.append(asdict(item))
            self._write(rows)

    def list(self) -> list[QueueItem]:
        with _LOCK:
            valid: list[dict] = []
            changed = False
            for row in self._read():
                if (self.files_dir / row.get("stored_name", "")).is_file():
                    valid.append(row)
                else:
                    changed = True
            if changed:
                self._write(valid)
            valid.sort(key=lambda row: row.get("created_at", ""), reverse=True)
            return [QueueItem(**row) for row in valid]

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
                created_at=datetime.now(timezone.utc).isoformat(),
                source_path=str(source),
            )
            self._append_item(item)
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
                created_at=datetime.now(timezone.utc).isoformat(),
                source_path=source_path,
            )
            self._append_item(item)
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
        for item in self.list():
            if item.id == item_id:
                path = self.files_dir / item.stored_name
                if path.is_file():
                    return item, path
        return None

    def remove(self, item_id: str) -> bool:
        with _LOCK:
            rows = self._read()
            kept: list[dict] = []
            removed = False
            for row in rows:
                if row.get("id") == item_id:
                    removed = True
                    (self.files_dir / row.get("stored_name", "")).unlink(missing_ok=True)
                else:
                    kept.append(row)
            if removed:
                self._write(kept)
            return removed

    def clear(self) -> int:
        with _LOCK:
            rows = self._read()
            for row in rows:
                (self.files_dir / row.get("stored_name", "")).unlink(missing_ok=True)
            self._write([])
            return len(rows)
