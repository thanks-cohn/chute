"""Versioned, JSON-compatible Explorer contract; no absolute paths in receipts."""
from __future__ import annotations

VERSION = "1.0"
READ_COMMANDS = ("capabilities", "roots", "list", "stat", "search", "preview")
BLOCKED_COMMANDS = ("mkdir", "rename", "copy", "move", "trash", "receive", "open", "reveal")


class ExplorerError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def catalog() -> dict:
    return {"version": VERSION, "commands": list(READ_COMMANDS),
            "blocked": {name: "NATIVE_CONSENT_REQUIRED" for name in BLOCKED_COMMANDS},
            "limits": {"page": 200, "directory": 20000, "text_bytes": 262144,
                       "thumbnail_bytes": 16777216, "sessions_seconds": 900},
            "transforms": "reserved; unsupported", "writable": False}
