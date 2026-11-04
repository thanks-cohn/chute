"""Bounded safe preview encoders and single HTTP byte ranges."""
from __future__ import annotations

import io
import os
import re

from .protocol import ExplorerError

SAFE_IMAGES = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"}
SAFE_VIDEO = {"video/mp4", "video/webm", "video/ogg"}


def preview_kind(row):
    mime = row["mime"]
    if row["kind"] != "file":
        return "unavailable"
    if mime in SAFE_IMAGES:
        return "image"
    if mime in SAFE_VIDEO:
        return "video"
    if mime == "application/pdf":
        return "pdf"
    if mime and (mime.startswith("text/") and mime not in {"text/html", "text/javascript"}):
        return "text"
    return "unavailable"


def byte_range(value: str | None, size: int):
    if value is None:
        return 0, size, False
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
    if not match or not any(match.groups()) or size == 0:
        raise ExplorerError("INVALID_RANGE", "Requested byte range is unavailable.")
    left, right = match.groups()
    if left:
        start = int(left)
        end = min(int(right) + 1, size) if right else size
    else:
        start, end = max(0, size - int(right)), size
    if start >= end or start >= size:
        raise ExplorerError("INVALID_RANGE", "Requested byte range is unavailable.")
    return start, end, True


def thumbnail(fd: int) -> bytes:
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError:
        raise ExplorerError("DECODER_UNAVAILABLE", "Install Pillow for image thumbnails.")
    if os.fstat(fd).st_size > 16 * 1024 * 1024:
        raise ExplorerError("PREVIEW_LIMIT", "Image is too large for a thumbnail.")
    try:
        with os.fdopen(os.dup(fd), "rb") as stream:
            with Image.open(stream) as image:
                if image.width * image.height > 24000000:
                    raise ExplorerError("PREVIEW_LIMIT", "Image dimensions exceed the preview limit.")
                image.thumbnail((256, 256))
                result = io.BytesIO()
                image.convert("RGB").save(result, "JPEG", quality=80)
                return result.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ExplorerError("INVALID_IMAGE", "This image cannot be decoded safely.")
