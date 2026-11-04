"""One scriptable production command dispatcher. Mutations deliberately gated."""
from __future__ import annotations

import errno
import mimetypes
import os
import stat
import threading
import uuid

from .protocol import BLOCKED_COMMANDS, ExplorerError, VERSION, catalog
from .security import RootGrant, component


class Explorer:
    def __init__(self, grants: list[RootGrant]):
        self.grants = {grant.id: grant for grant in grants}
        self.lock = threading.RLock()

    def close(self):
        for grant in self.grants.values():
            grant.close()

    def grant_for(self, handle: str) -> RootGrant:
        for grant in self.grants.values():
            if handle in grant.handles:
                return grant
        raise ExplorerError("INVALID_HANDLE", "This file reference has expired.")

    def _record(self, grant, parts, info, *, fd=None, defer_identity=False):
        name = parts[-1] if parts else grant.label
        kind = "directory" if stat.S_ISDIR(info.st_mode) else "file"
        if getattr(info, "st_file_attributes", 0) & 0x400 or not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
            kind = "blocked"
        return {"handle": grant.handle(parts), "name": name, "kind": kind,
                "size": info.st_size, "modified_ns": info.st_mtime_ns,
                "mime": (mimetypes.guess_type(name)[0] or "application/octet-stream") if kind == "file" else None,
                "identity": (None if defer_identity or kind == "blocked" else grant.windows.file_identity(parts,fd=fd)) if grant.windows else f"{info.st_dev}:{info.st_ino}:{info.st_mtime_ns}:{info.st_size}"}

    def execute(self, command: str, **args) -> dict:
        operation_id = uuid.uuid4().hex
        try:
            with self.lock:
                result = self._execute(command, args)
            return {"version": VERSION, "operation_id": operation_id,
                    "state": "completed", "result": result}
        except ExplorerError as exc:
            code, message = exc.code, str(exc)
        except OSError as exc:
            code = {errno.ENOENT: "NOT_FOUND", errno.EACCES: "PERMISSION_DENIED",
                    errno.EPERM: "PERMISSION_DENIED", errno.ELOOP: "UNSAFE_LINK",
                    errno.ENOTDIR: "NOT_DIRECTORY"}.get(exc.errno, "UNAVAILABLE")
            message = "The item is unavailable or cannot be accessed safely."
        except (TypeError, ValueError, KeyError):
            code, message = "INVALID_ARGUMENT", "Check the command arguments."
        return {"version": VERSION, "operation_id": operation_id, "state": "failed",
                "error": {"code": code, "message": message}}

    def _execute(self, command, args):
        schemas = {"capabilities": set(), "roots": set(), "stat": {"handle"},
                   "preview": {"handle"}, "list": {"handle", "offset", "limit", "sort", "descending", "query"},
                   "search": {"handle", "offset", "limit", "sort", "descending", "query"}}
        if command in BLOCKED_COMMANDS:
            raise ExplorerError("NATIVE_CONSENT_REQUIRED", "This action awaits verified native folder consent and transfer safety.")
        if command not in schemas:
            raise ExplorerError("UNSUPPORTED_COMMAND", "This command is not supported.")
        if set(args) - schemas[command]:
            raise ExplorerError("INVALID_ARGUMENT", "Unexpected command argument.")
        if command == "capabilities":
            return catalog()
        if command == "roots":
            return {"roots": [{"handle": g.id, "name": g.label, "kind": "directory"} for g in self.grants.values()]}
        handle = args["handle"]
        grant = self.grant_for(handle)
        parts = grant.parts(handle)
        if command in {"stat", "preview"}:
            row = self._record(grant, parts, grant.stat(handle))
            row["parent"] = grant.handle(parts[:-1]) if parts else None
            if command == "preview":
                from .preview import preview_kind
                row["preview"] = preview_kind(row)
            return row
        limit, offset = args.get("limit", 100), args.get("offset", 0)
        sort = args.get("sort", "name")
        query = args.get("query", "")
        descending = args.get("descending", False)
        if (type(limit) is not int or not 1 <= limit <= 200 or type(offset) is not int
                or not 0 <= offset <= 20000 or sort not in {"name", "size", "date", "type"}
                or not isinstance(query, str) or len(query) > 256 or type(descending) is not bool):
            raise ExplorerError("INVALID_ARGUMENT", "Invalid directory page or sort.")
        rows = []
        with grant.entries(handle) as entries:
            for index, entry in enumerate(entries):
                if index >= 20000:
                    raise ExplorerError("DIRECTORY_LIMIT", "This directory exceeds the current 20,000-item limit.")
                if query.casefold() not in entry.name.casefold():
                    continue
                try:
                    component(entry.name)
                    info = entry.stat(follow_symlinks=False)
                    rows.append(self._record(grant, parts + (entry.name,), info, defer_identity=bool(grant.windows)))
                except ExplorerError:
                    continue
                except FileNotFoundError:
                    raise ExplorerError("DIRECTORY_CHANGED", "Folder changed; refresh before continuing.")
        key = {"name": lambda r: (r["name"].casefold(), r["name"]),
               "size": lambda r: (r["size"], r["name"]),
               "date": lambda r: (r["modified_ns"], r["name"]),
               "type": lambda r: (r["mime"] or "", r["name"])}[sort]
        rows.sort(key=key, reverse=descending)
        page=rows[offset:offset+limit]
        if grant.windows:
            # Only materialize stable HANDLE identities for the bounded page.
            # No recursive scan and no handle-open for every unreturned entry.
            for row in page:
                if row['kind'] != 'blocked':
                    row['identity']=grant.windows.file_identity(grant.parts(row['handle']))
        return {"entries": page, "total": len(rows),
                "next_offset": offset + limit if offset + limit < len(rows) else None,
                "parent": grant.handle(parts[:-1]) if parts else None,
                "name": parts[-1] if parts else grant.label,
                "consistency": "live; refresh after concurrent changes"}
