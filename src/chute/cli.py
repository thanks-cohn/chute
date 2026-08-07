from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from . import __version__
from .server import DEFAULT_HOST, DEFAULT_PORT, serve
from .store import Store


SYSTEMD_UNIT_NAME = "chute.service"


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


def systemd_unit_path() -> Path:
    return Path.home() / ".config" / "systemd" / "user" / SYSTEMD_UNIT_NAME


def systemd_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def require_systemd() -> bool:
    if not sys.platform.startswith("linux"):
        print("chute: systemd setup is available on Linux only", file=sys.stderr)
        return False
    if shutil.which("systemctl") is None:
        print("chute: systemctl was not found on this machine", file=sys.stderr)
        return False
    return True


def install_systemd(port: int = DEFAULT_PORT) -> int:
    if not require_systemd():
        return 2

    unit_path = systemd_unit_path()
    unit_path.parent.mkdir(parents=True, exist_ok=True)
    unit = f"""[Unit]
Description=Chute localhost file bridge

[Service]
Type=simple
ExecStart={systemd_quote(sys.executable)} -m chute serve --port {port}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
"""
    unit_path.write_text(unit, encoding="utf-8")

    try:
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
        subprocess.run(["systemctl", "--user", "enable", "--now", SYSTEMD_UNIT_NAME], check=True)
    except subprocess.CalledProcessError as exc:
        print(f"chute: systemctl failed with exit code {exc.returncode}", file=sys.stderr)
        print(f"The unit was written to {unit_path}.", file=sys.stderr)
        return exc.returncode or 1

    print(f"Installed {unit_path}")
    print("Chute will now start at login via: systemctl --user enable --now chute.service")
    return 0


def remove_systemd() -> int:
    if not require_systemd():
        return 2

    unit_path = systemd_unit_path()
    subprocess.run(["systemctl", "--user", "disable", "--now", SYSTEMD_UNIT_NAME], check=False)
    if unit_path.exists():
        unit_path.unlink()
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
    print(f"Removed {SYSTEMD_UNIT_NAME}")
    return 0


def systemd_status() -> int:
    if not require_systemd():
        return 2
    return subprocess.run(["systemctl", "--user", "status", SYSTEMD_UNIT_NAME]).returncode


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

    systemd = sub.add_parser("systemd", help="manage Chute as a Linux systemd user service")
    systemd_sub = systemd.add_subparsers(dest="systemd_action", required=True)
    systemd_install = systemd_sub.add_parser("install", help="install and enable Chute at login")
    systemd_install.add_argument("--port", type=int, default=DEFAULT_PORT)
    systemd_sub.add_parser("remove", help="disable and remove the Chute user service")
    systemd_sub.add_parser("status", help="show the Chute user service status")

    sub.add_parser("list", help="list queued files")
    remove = sub.add_parser("remove", help="remove one queued file")
    remove.add_argument("id")
    sub.add_parser("clear", help="remove every queued file")
    path = sub.add_parser("path", help="print Chute's data directory")
    path.add_argument("--json", action="store_true")
    return parser


def normalize_implicit_send(argv: list[str]) -> list[str]:
    commands = {"send", "serve", "systemd", "list", "remove", "clear", "path", "-h", "--help", "--version"}
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
            if sys.platform.startswith("linux"):
                print("For login autostart: chute systemd install", file=sys.stderr)
            return 1
        print("Open the Chute extension and drag it out.")
        return 0

    if args.command == "serve":
        serve(args.host, args.port)
        return 0

    if args.command == "systemd":
        if args.systemd_action == "install":
            return install_systemd(args.port)
        if args.systemd_action == "remove":
            return remove_systemd()
        if args.systemd_action == "status":
            return systemd_status()

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
