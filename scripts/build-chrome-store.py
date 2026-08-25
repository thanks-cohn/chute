from __future__ import annotations

import json
import shutil
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"
DIST = ROOT / "dist" / "chrome-store"
RUNTIME_FILES = {
    "manifest.json",
    "shelf.html",
    "shelf.js",
    "shelf-live-refresh.js",
    "shared.css",
    "store-background.js",
    "source-resource.js",
    "image-source-capture.js",
    "store-mascot.js",
}
OPTIONAL_RUNTIME_FILES = {
    "assets/default-shelf.png",
}


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_icon(path: Path, size: int) -> None:
    bg = (17, 19, 15, 255)
    accent = (215, 255, 63, 255)
    pixels = bytearray(bg * (size * size))

    def rect(x0: int, y0: int, x1: int, y1: int, color) -> None:
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(size, x1), min(size, y1)
        for y in range(y0, y1):
            for x in range(x0, x1):
                i = (y * size + x) * 4
                pixels[i:i + 4] = bytes(color)

    pad = max(1, size // 7)
    line = max(1, size // 10)
    cx = size // 2
    rect(cx - line // 2, pad, cx + (line + 1) // 2, size - pad * 2, accent)
    rect(cx - size // 5, size // 2, cx + size // 5, size // 2 + line, accent)
    rect(cx - size // 5, size // 2, cx - size // 5 + line, size // 2 + size // 5, accent)
    rect(cx + size // 5 - line, size // 2, cx + size // 5, size // 2 + size // 5, accent)

    rows = []
    stride = size * 4
    for y in range(size):
        rows.append(b"\x00" + bytes(pixels[y * stride:(y + 1) * stride]))
    payload = b"".join(rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += png_chunk(b"IDAT", zlib.compress(payload, 9))
    png += png_chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def validate_manifest(manifest: dict) -> None:
    if manifest.get("manifest_version") != 3:
        raise SystemExit("Chrome Web Store package must use Manifest V3")
    permissions = set(manifest.get("permissions", []))
    allowed = {"storage", "sidePanel"}
    unexpected = permissions - allowed
    if unexpected:
        raise SystemExit("Unexpected Store permission(s): " + ", ".join(sorted(unexpected)))
    if manifest.get("host_permissions"):
        raise SystemExit("Store build must not declare broad host_permissions")
    if manifest.get("optional_host_permissions"):
        raise SystemExit("Store build must not declare optional host permissions")


def copy_runtime_file(relative: str, package_dir: Path) -> None:
    source = EXTENSION / relative
    target = package_dir / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def main() -> int:
    manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    validate_manifest(manifest)
    version = manifest["version"]
    package_dir = DIST / f"chute-extension-{version}"
    zip_base = DIST / f"chute-chrome-{version}"

    if package_dir.exists():
        shutil.rmtree(package_dir)
    package_dir.mkdir(parents=True, exist_ok=True)

    missing = [name for name in sorted(RUNTIME_FILES) if not (EXTENSION / name).exists()]
    if missing:
        raise SystemExit("Missing Store runtime files: " + ", ".join(missing))

    for name in sorted(RUNTIME_FILES):
        copy_runtime_file(name, package_dir)

    for name in sorted(OPTIONAL_RUNTIME_FILES):
        if (EXTENSION / name).exists():
            copy_runtime_file(name, package_dir)
        else:
            print(f"Optional shelf artwork not found: {name} (built-in arrow fallback will be used)")

    icons = {}
    for size in (16, 32, 48, 128):
        rel = f"icons/icon{size}.png"
        write_icon(package_dir / rel, size)
        icons[str(size)] = rel

    packaged = json.loads((package_dir / "manifest.json").read_text(encoding="utf-8"))
    packaged["icons"] = icons
    packaged.setdefault("action", {})["default_icon"] = icons
    (package_dir / "manifest.json").write_text(json.dumps(packaged, indent=2) + "\n", encoding="utf-8")

    zip_path = zip_base.with_suffix(".zip")
    if zip_path.exists():
        zip_path.unlink()
    shutil.make_archive(str(zip_base), "zip", package_dir)

    print(f"Chrome Web Store ZIP: {zip_path}")
    print("Packaged only the browser-only Chute runtime, including the supported-site mascot; legacy localhost/desktop code is excluded.")
    print("Still required before submission: real screenshots, final listing copy, and privacy-policy review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
