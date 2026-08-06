from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from . import __version__
from .server import DEFAULT_HOST, DEFAULT_PORT, serve
from .store import Store


def server_url(port: int = DEFAULT_PORT) -> str:
    return f"http://{DEFAULT_HOST}:{port}"


def server_ready(port: int = DEFAULT_PORT) -> bool:
    try:
        with urllib.request.urlopen(f"{server_url(port)}/health", timeout=0.35) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def ensure_server(port: int = DEFAULT_PORT) -> bool:
    if server_ready(port):
        return True

    command = [sys.executable, "-m", "chute", "serve", "--port", str(port)]
    kwargs: dict[str, object] = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": True,
    }
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(command, **kwargs)

    for _ in range(25):
        if server_ready(port):
            return True
        time.sleep(0.08)
    return False


def human_size(value: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    amount = float(value)
    for unit in units:
        if amount < 1024 or unit == units[-1]:
            return f"{amount:.0f} {unit}" if unit == "B" else f"{amount:.1f} {unit}"
        amount /= 1024
    return f"{value} B"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="chute", description="Send terminal files to the Chute Chrome shelf.")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="command")

    send = sub.add_parser("send", help="copy files or directories into the browser shelf")
    send.add_argument("paths", nargs="+", type=Path)
    send.add_argument("--no-start", action="store_true", help="do not start the local server automatically")
    send.add_argument("--port", type=int, default=DEFAULT_PORT)

    run = sub.add_parser("serve", help="run the localhost bridge")
    run.add_argument("--host", default=DEFAULT_HOST)
    run.add_argument("--port", type=int, default=DEFAULT_PORT)

    sub.add_parser("list", help="list queued files")
    remove = sub.add_parser("remove", help="remove one queued file")
    remove.add_argument("id")
    sub.add_parser("clear", help="remove every queued file")
    path = sub.add_parser("path", help="print Chute's data directory")
    path.add_argument("--json", action="store_true")
    return parser


def normalize_implicit_send(argv: list[str]) -> list[str]:
    commands = {"send", "serve", "list", "remove", "clear", "path", "-h", "--help", "--version"}
    if argv and argv[0] not in commands and not argv[0].startswith("-"):
        return ["send", *argv]
    return argv


def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    args = build_parser().parse_args(normalize_implicit_send(raw))
    store = Store()

    if args.command == "send":
        try:
            items = store.add_many(args.paths)
        except (FileNotFoundError, ValueError) as exc:
            print(f"chute: {exc}", file=sys.stderr)
            return 2
        for item in items:
            print(f"Queued {item.name} ({human_size(item.size)}) [{item.id[:8]}]")
        if not args.no_start and not ensure_server(args.port):
            print("Queued successfully, but the local server did not start.", file=sys.stderr)
            print(f"Run: chute serve --port {args.port}", file=sys.stderr)
            return 1
        print("Open the Chute extension and drag it out.")
        return 0

    if args.command == "serve":
        serve(args.host, args.port)
        return 0

    if args.command == "list":
        items = store.list()
        if not items:
            print("Chute is empty.")
            return 0
        for item in items:
            print(f"{item.id[:8]}  {human_size(item.size):>9}  {item.name}")
        return 0

    if args.command == "remove":
        matches = [item for item in store.list() if item.id == args.id or item.id.startswith(args.id)]
        if len(matches) != 1:
            print("chute: ID must match exactly one queued file", file=sys.stderr)
            return 2
        store.remove(matches[0].id)
        print(f"Removed {matches[0].name}")
        return 0

    if args.command == "clear":
        print(f"Removed {store.clear()} file(s).")
        return 0

    if args.command == "path":
        payload = {"data_dir": str(store.root), "files_dir": str(store.files_dir)}
        print(json.dumps(payload) if args.json else payload["data_dir"])
        return 0

    build_parser().print_help()
    return 0
