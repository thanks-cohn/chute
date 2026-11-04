"""Explicit process-local grants and descriptor-relative, no-follow POSIX access.

Windows needs a native handle/reparse-point implementation before the HTTP adapter
can be enabled. Deliberately fail closed rather than substitute resolve()+open().
"""
from __future__ import annotations

import contextlib
import os
from pathlib import Path
import re
import secrets
import stat
import time

from .protocol import ExplorerError


def component(name: str) -> str:
    if (not isinstance(name, str) or not name or name in {".", ".."}
            or len(name) > 255 or name[-1:] in {" ", "."}
            or any(ord(c) < 32 or c in '/\\:<>"|?*' for c in name)
            or re.fullmatch(r"(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", name)):
        raise ExplorerError("INVALID_NAME", "This filename is not supported.")
    return name


class RootGrant:
    """Grant only from trusted Python/native code, never from an HTTP path."""
    def __init__(self, root: Path, *, label: str | None = None):
        if os.name != "posix" or not hasattr(os, "O_NOFOLLOW"):
            raise ExplorerError("UNSUPPORTED_PLATFORM", "Native Windows handle guards are not yet verified.")
        raw = Path(root).absolute()
        if raw != raw.resolve(strict=True) or not raw.is_dir():
            raise ExplorerError("UNSAFE_ROOT", "Select a real directory without symbolic links.")
        self.fd = os.open(raw, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.id = secrets.token_urlsafe(24)
        self.label = label or raw.name or "Local files"
        self.handles = {self.id: ()}
        self._reverse = {(): self.id}

    def close(self):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None

    def handle(self, parts: tuple[str, ...]) -> str:
        if parts not in self._reverse:
            if len(self.handles) >= 50000:
                raise ExplorerError("HANDLE_LIMIT", "Reconnect to refresh directory handles.")
            value = secrets.token_urlsafe(24)
            self._reverse[parts] = value
            self.handles[value] = parts
        return self._reverse[parts]

    def parts(self, handle: str) -> tuple[str, ...]:
        if not isinstance(handle, str) or handle not in self.handles:
            raise ExplorerError("INVALID_HANDLE", "This file reference has expired.")
        return self.handles[handle]

    @contextlib.contextmanager
    def open(self, handle: str, *, directory: bool = False):
        parts = self.parts(handle)
        if self.fd is None:
            raise ExplorerError("EXPIRED", "Reconnect to the local companion.")
        fd = os.dup(self.fd)
        try:
            for index, part in enumerate(parts):
                component(part)
                flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
                if directory or index < len(parts) - 1:
                    flags |= os.O_DIRECTORY
                child = os.open(part, flags, dir_fd=fd)
                os.close(fd)
                fd = child
            info = os.fstat(fd)
            if not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
                raise ExplorerError("UNSAFE_TYPE", "Special files and links cannot be opened.")
            if directory and not stat.S_ISDIR(info.st_mode):
                raise ExplorerError("NOT_DIRECTORY", "Select a folder.")
            yield fd
        finally:
            os.close(fd)


class Session:
    def __init__(self, origin: str, *, ttl: float = 900):
        if re.fullmatch(r"chrome-extension://[a-p]{32}", origin) is None:
            raise ExplorerError("INVALID_ORIGIN", "An exact enrolled extension origin is required.")
        self.origin = origin
        self.token = secrets.token_urlsafe(32)
        self.expires = time.monotonic() + min(ttl, 900)

    def authorize(self, origin: str, bearer: str):
        if (time.monotonic() >= self.expires or origin != self.origin
                or not secrets.compare_digest(bearer, "Bearer " + self.token)):
            raise ExplorerError("UNAUTHORIZED", "Reconnect with a current local read session.")
