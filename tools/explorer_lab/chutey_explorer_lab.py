#!/usr/bin/env python3
"""Deterministic independent oracle against chute.explorer, never a mock engine."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import random
import shutil
import stat
import struct
import zlib
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from chute.explorer import Explorer, RootGrant
from chute.explorer.protocol import BLOCKED_COMMANDS, READ_COMMANDS, catalog

REGISTRY = {}


def scenario(name):
    def register(fn):
        REGISTRY[name] = fn
        return fn
    return register


def inventory(root):
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Inventory requires an existing real directory")
    def unavailable(error):
        raise error
    result = {}
    for directory, dirs, files in os.walk(root, followlinks=False, onerror=unavailable):
        for name in sorted(dirs + files):
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            if path.is_symlink():
                result[relative] = {"kind": "link"}
            elif path.is_dir():
                result[relative] = {"kind": "directory"}
            else:
                if not stat.S_ISREG(path.lstat().st_mode):
                    raise ValueError("Special files are not supported in the fixture inventory")
                digest = hashlib.sha256()
                with path.open("rb") as stream:
                    while data := stream.read(262144):
                        digest.update(data)
                result[relative] = {"kind": "file", "size": path.stat().st_size, "sha256": digest.hexdigest()}
    return result


def write(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def checked(engine, command, **args):
    receipt = engine.execute(command, **args)
    assert receipt["state"] == "completed", receipt
    return receipt


@scenario("capabilities")
def capabilities(engine, root, handle, seed):
    result = checked(engine, "capabilities")
    assert set(result["result"]["commands"]) == set(READ_COMMANDS)
    assert not result["result"]["writable"]
    return result


@scenario("roots")
def roots(engine, root, handle, seed):
    result = checked(engine, "roots")
    assert [row["handle"] for row in result["result"]["roots"]] == [handle]
    return result


@scenario("list")
def listing(engine, root, handle, seed):
    names = []
    page = 0
    while True:
        receipt = checked(engine, "list", handle=handle, offset=page, limit=13)
        result = receipt["result"]
        names.extend(row["name"] for row in result["entries"])
        page = result["next_offset"]
        if page is None:
            break
    expected = sorted([p.name for p in root.iterdir()], key=lambda name: (name.casefold(), name))
    assert names == expected
    assert len(names) == len(set(names))
    return receipt


@scenario("stat")
def stat_file(engine, root, handle, seed):
    rows = checked(engine, "search", handle=handle, query="note.txt")["result"]["entries"]
    receipt = checked(engine, "stat", handle=rows[0]["handle"])
    assert receipt["result"]["size"] == len((root / "note.txt").read_bytes())
    assert receipt["result"]["parent"] == handle
    return receipt


@scenario("search")
def search(engine, root, handle, seed):
    receipt = checked(engine, "search", handle=handle, query="UNICODE")
    assert [row["name"] for row in receipt["result"]["entries"]] == ["Unicode-雪.txt"]
    return receipt


@scenario("preview")
def preview(engine, root, handle, seed):
    row = checked(engine, "search", handle=handle, query="note.txt")["result"]["entries"][0]
    receipt = checked(engine, "preview", handle=row["handle"])
    assert receipt["result"]["preview"] == "text"
    grant = engine.grant_for(row["handle"])
    with grant.open(row["handle"]) as fd:
        # Independent expected bytes, not the receipt's claimed metadata.
        assert os.read(fd, 262144) == (root / "note.txt").read_bytes()
    return receipt


@scenario("bounded-navigation")
def bounded(engine, root, handle, seed):
    rng = random.Random(seed)
    for _ in range(40):
        limit = rng.randint(1, 100)
        order = rng.choice(["name", "size", "date", "type"])
        receipt = checked(engine, "list", handle=handle, limit=limit, sort=order)
        assert len(receipt["result"]["entries"]) <= limit
        for row in receipt["result"]["entries"]:
            assert (root / row["name"]).lstat().st_size == row["size"]
    return receipt


@scenario("invalid-handle")
def invalid(engine, root, handle, seed):
    receipt = engine.execute("stat", handle="../../etc/passwd")
    assert receipt["error"]["code"] == "INVALID_HANDLE"
    return receipt


@scenario("symlink-escape")
def symlink(engine, root, handle, seed):
    if not (root / "escape").is_symlink():
        return {"classification": "UNSUPPORTED", "reason": "Host cannot create test symlinks"}
    row = checked(engine, "search", handle=handle, query="escape")["result"]["entries"][0]
    assert row["kind"] == "blocked"
    receipt = engine.execute("stat", handle=row["handle"])
    assert receipt["state"] == "failed"
    return receipt


for blocked in BLOCKED_COMMANDS:
    def gate(engine, root, handle, seed, operation=blocked):
        receipt = engine.execute(operation, handle=handle)
        assert receipt["error"]["code"] == "NATIVE_CONSENT_REQUIRED"
        return {"classification": "BLOCKED", "receipt": receipt,
                "reason": "Native consent, Windows handle guards and mutation recovery remain unverified."}
    REGISTRY[blocked] = gate


def read_plan(path):
    plan = json.loads(Path(path).read_text()) if path else {"seed": 731, "scenarios": list(REGISTRY)}
    if not isinstance(plan, dict) or set(plan) - {"seed", "scenarios"}:
        raise ValueError("Plan accepts only seed and registered scenarios; no arbitrary paths or commands")
    if type(plan.get("seed", 731)) is not int:
        raise ValueError("seed must be an integer")
    names = plan.get("scenarios", list(REGISTRY))
    if not isinstance(names, list) or len(names) > 1000 or any(name not in REGISTRY for name in names):
        raise ValueError("Unknown or unbounded scenario list")
    return {"seed": plan.get("seed", 731), "scenarios": names}


def run(plan, out):
    out.mkdir(parents=True, exist_ok=False)
    fixture = out / "fixture"
    fixture.mkdir()
    write(out / "ownership.json", {"schema": 1, "fixture": "fixture"})
    rng = random.Random(plan["seed"])
    (fixture / "note.txt").write_text("Independent oracle\n" * 3000, encoding="utf-8")
    (fixture / "Unicode-雪.txt").write_bytes("雪".encode())
    (fixture / "empty").mkdir()
    (fixture / "deep" / "nested").mkdir(parents=True)
    (fixture / "zero.bin").touch()
    (fixture / "deep" / "nested" / "note.txt").write_bytes(b"same basename; independent nested source")
    (fixture / ("long-" + "x" * 180 + ".txt")).write_bytes(b"long name")
    # Original generated, license-free PNG; real decoder checks live in browser/API tests.
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress((b"\0" + bytes((200, 40, 90)) * 8) * 8)) + chunk(b"IEND", b"")
    (fixture / "generated.png").write_bytes(png)
    with (fixture / "sparse.bin").open("wb") as sparse:
        sparse.seek(1024 * 1024 - 1)
        sparse.write(b"\0")
    for i in range(137):
        (fixture / f"seed-{i:04}.bin").write_bytes(rng.randbytes(rng.randint(0, 4096)))
    try:
        (fixture / "escape").symlink_to(out / "ownership.json")
    except OSError:
        pass
    before = inventory(fixture)
    write(out / "plan.json", plan)
    write(out / "before.json", before)
    results = []
    engine = None
    try:
        engine = Explorer([RootGrant(fixture)])
        handle = next(iter(engine.grants))
        with (out / "journal.jsonl").open("w", encoding="utf-8") as journal:
            for name in plan["scenarios"]:
                journal.write(json.dumps({"scenario": name, "state": "intent", "seed": plan["seed"]}) + "\n")
                journal.flush()
                os.fsync(journal.fileno())
                try:
                    receipt = REGISTRY[name](engine, fixture, handle, plan["seed"])
                    assert inventory(fixture) == before, "Forbidden filesystem side effect"
                    verdict = receipt.get("classification", "PASS")
                    row = {"scenario": name, "verdict": verdict, "receipt": receipt}
                except Exception as exc:
                    row = {"scenario": name, "verdict": "FAIL", "reason": str(exc)}
                results.append(row)
                journal.write(json.dumps(row, ensure_ascii=False) + "\n")
                journal.flush()
                os.fsync(journal.fileno())
    finally:
        if engine:
            engine.close()
        after = inventory(fixture)
        write(out / "after.json", after)
        write(out / "diff.json", {key: {"before": before.get(key), "after": after.get(key)} for key in before.keys() | after.keys() if before.get(key) != after.get(key)})
    counts = {verdict: sum(row["verdict"] == verdict for row in results) for verdict in ("PASS", "FAIL", "BLOCKED", "UNSUPPORTED", "UNKNOWN")}
    summary = {"seed": plan["seed"], "counts": counts, "results": results,
               "coverage": {"registered": list(REGISTRY), "executed": plan["scenarios"],
                            "gaps": ["mutations/restart/cancellation", "Windows locks and reparse points", "live site drags", "offline volumes"]}}
    write(out / "summary.json", summary)
    with (out / "results.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["scenario", "verdict"])
        writer.writeheader()
        writer.writerows({key: row[key] for key in writer.fieldnames} for row in results)
    (out / "report.md").write_text("# Explorer laboratory\n\n" + "\n".join(f"- {row['scenario']}: {row['verdict']}" for row in results) + "\n\nRead-only production API; blocked operations are not passes. See summary.json for coverage gaps.\n")
    print(json.dumps(counts))
    return 1 if counts["FAIL"] else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["doctor", "capabilities", "inventory", "preflight", "snapshot", "run", "status", "diff", "report", "retry", "cleanup"])
    parser.add_argument("--plan")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--run", type=Path)
    parser.add_argument("--root", type=Path)
    parser.add_argument("--scenario")
    parser.add_argument("--before", type=Path)
    parser.add_argument("--after", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)
    if args.command == "doctor":
        print(json.dumps({"python": sys.version.split()[0], "platform": os.name, "native_handle_guard": os.name == "posix", "writable": False}))
    elif args.command == "capabilities":
        print(json.dumps(catalog(), indent=2))
    elif args.command == "snapshot":
        root = args.root or (args.run / "fixture" if args.run else None)
        if root is None:
            parser.error("snapshot requires --run or --root; a plan alone is not an observed snapshot")
        data = inventory(root)
        if args.out:
            with args.out.open("x", encoding="utf-8") as stream:
                json.dump(data, stream, indent=2, ensure_ascii=False)
        else:
            print(json.dumps(data, indent=2, ensure_ascii=False))
    elif args.command in {"preflight", "run", "retry"}:
        plan = read_plan(args.plan)
        if args.command == "retry":
            if not args.run or not args.scenario:
                parser.error("retry requires --run and --scenario; uncertain mutations are never replayed")
            previous = json.loads((args.run / "summary.json").read_text())
            matches = [row for row in previous["results"] if row["scenario"] == args.scenario]
            if not matches or any(row.get("receipt", {}).get("state") == "uncertain" for row in matches):
                parser.error("No safe known scenario to retry")
            if args.scenario not in READ_COMMANDS and args.scenario not in {"bounded-navigation", "invalid-handle", "symlink-escape"}:
                parser.error("Only read-only scenarios may be retried")
            plan["scenarios"] = [args.scenario]
        if args.dry_run or args.command == "preflight":
            print(json.dumps({"plan": plan, "writes": "none", "snapshot": "run generates before/after in a newly owned fixture"}))
        else:
            if not args.out:
                parser.error("run requires a new --out directory")
            return run(plan, args.out)
    elif args.command == "inventory":
        if not args.root:
            parser.error("inventory requires --root (read only)")
        print(json.dumps(inventory(args.root), indent=2))
    elif args.command == "diff":
        if not args.before or not args.after:
            parser.error("diff requires --before and --after")
        before, after = json.loads(args.before.read_text()), json.loads(args.after.read_text())
        print(json.dumps({key: [before.get(key), after.get(key)] for key in before.keys() | after.keys() if before.get(key) != after.get(key)}, indent=2))
    else:
        if not args.run:
            parser.error("command requires --run")
        if args.command == "cleanup":
            root = args.run.resolve(strict=True)
            marker = json.loads((root / "ownership.json").read_text())
            target = root / "fixture"
            if marker != {"schema": 1, "fixture": "fixture"} or target.is_symlink() or target.resolve().parent != root:
                raise ValueError("Unverified fixture ownership")
            expected = json.loads((root / "after.json").read_text())
            if inventory(target) != expected:
                raise ValueError("Fixture changed after the run; preserve it for owner reconciliation")
            if args.execute:
                shutil.rmtree(target)
            print("Removed owned fixture; evidence retained." if args.execute else "Dry run: remove only the run-owned fixture; retain reports.")
        else:
            print((args.run / ("report.md" if args.command == "report" else "summary.json")).read_text())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
