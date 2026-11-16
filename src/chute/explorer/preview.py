"""Bounded safe preview encoders and single HTTP byte ranges."""
from __future__ import annotations

import io
import os
import re

from .protocol import ExplorerError

SAFE_IMAGES = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"}
SAFE_AUDIO = {"audio/mpeg", "audio/mp3", "audio/mp4", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm", "audio/flac", "audio/x-flac"}
SAFE_VIDEO = {"video/mp4", "video/webm", "video/ogg"}


# Windows MIME registration may be missing/generic. Narrow extension fallback
# is a format hint, never authority: guarded bytes/decoder checks still apply.
def media_mime(row):
    mime = row.get("mime")
    if mime and mime != "application/octet-stream":
        return mime
    suffix = str(row.get("name", "")).rsplit(".", 1)[-1].lower()
    return {"png":"image/png", "jpg":"image/jpeg", "jpeg":"image/jpeg", "gif":"image/gif",
            "webp":"image/webp", "bmp":"image/bmp", "mp4":"video/mp4", "webm":"video/webm",
            "mp3":"audio/mpeg", "m4a":"audio/mp4", "wav":"audio/wav", "flac":"audio/flac", "oga":"audio/ogg", "ogv":"video/ogg"}.get(suffix, mime or "application/octet-stream")


def preview_kind(row):
    mime = media_mime(row)
    if row["kind"] != "file":
        return "unavailable"
    if mime in SAFE_IMAGES:
        return "image"
    if mime in SAFE_AUDIO:
        return "audio"
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
