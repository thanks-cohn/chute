from __future__ import annotations

import json
import shutil
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"
DIST = ROOT / "dist" / "chrome-store"

FONT = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    " ": ["00000"] * 7,
}


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, pixels: bytearray) -> None:
    rows = []
    stride = width * 4
    for y in range(height):
        rows.append(b"\x00" + bytes(pixels[y * stride:(y + 1) * stride]))
    data = b"".join(rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += png_chunk(b"IDAT", zlib.compress(data, 9))
    png += png_chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def canvas(width: int, height: int, color=(17, 19, 15, 255)) -> bytearray:
    r, g, b, a = color
    return bytearray([r, g, b, a] * width * height)


def rect(pixels: bytearray, width: int, height: int, x0: int, y0: int, x1: int, y1: int, color) -> None:
    x0, x1 = max(0, x0), min(width, x1)
    y0, y1 = max(0, y0), min(height, y1)
    r, g, b, a = color
    for y in range(y0, y1):
        for x in range(x0, x1):
            i = (y * width + x) * 4
            pixels[i:i + 4] = bytes((r, g, b, a))


def draw_chute(pixels: bytearray, width: int, height: int, cx: int, cy: int, size: int) -> None:
    yellow = (255, 232, 122, 255)
    brown = (74, 58, 19, 255)
    tape = (235, 225, 184, 255)
    x0 = cx - size // 2
    y0 = cy - size // 2
    rect(pixels, width, height, x0 + size // 8, y0 + size // 5, x0 + size - size // 8, y0 + size - size // 10, yellow)
    rect(pixels, width, height, x0 + size // 4, y0 + size // 11, x0 + size * 3 // 4, y0 + size // 4, tape)
    rect(pixels, width, height, x0 + size // 5, y0 + size // 4, x0 + size * 4 // 5, y0 + size * 2 // 5, brown)
    eye = max(1, size // 16)
    rect(pixels, width, height, cx - size // 5, cy + size // 10, cx - size // 5 + eye, cy + size // 10 + eye, brown)
    rect(pixels, width, height, cx + size // 5 - eye, cy + size // 10, cx + size // 5, cy + size // 10 + eye, brown)
    rect(pixels, width, height, cx - size // 6, cy + size // 4, cx + size // 6, cy + size // 4 + eye, brown)


def draw_text(pixels: bytearray, width: int, height: int, text: str, x: int, y: int, scale: int, color) -> None:
    cursor = x
    for char in text.upper():
        glyph = FONT.get(char, FONT[" "])
        for gy, row in enumerate(glyph):
            for gx, bit in enumerate(row):
                if bit == "1":
                    rect(pixels, width, height, cursor + gx * scale, y + gy * scale, cursor + (gx + 1) * scale, y + (gy + 1) * scale, color)
        cursor += 6 * scale


def make_icon(size: int, path: Path) -> None:
    pixels = canvas(size, size)
    pad = max(2, size // 12)
    rect(pixels, size, size, pad, pad, size - pad, size - pad, (28, 32, 24, 255))
    draw_chute(pixels, size, size, size // 2, size // 2, int(size * 0.72))
    write_png(path, size, size, pixels)


def make_promo(width: int, height: int, path: Path) -> None:
    pixels = canvas(width, height)
    rect(pixels, width, height, 0, 0, width, height, (17, 19, 15, 255))
    accent = (215, 255, 63, 255)
    cream = (244, 245, 238, 255)
    size = int(min(height * 0.72, width * 0.28))
    draw_chute(pixels, width, height, int(width * 0.20), height // 2, size)
    scale = max(2, int(height / 70))
    draw_text(pixels, width, height, "CHUTE", int(width * 0.40), int(height * 0.31), scale * 2, accent)
    draw_text(pixels, width, height, "PICK UP DROP ANYWHERE", int(width * 0.40), int(height * 0.58), scale, cream)
    write_png(path, width, height, pixels)


def referenced_files(manifest: dict) -> set[str]:
    refs: set[str] = {"manifest.json"}
    background = manifest.get("background", {})
    if background.get("service_worker"):
        refs.add(background["service_worker"])
    action = manifest.get("action", {})
    if action.get("default_popup"):
        refs.add(action["default_popup"])
    panel = manifest.get("side_panel", {})
    if panel.get("default_path"):
        refs.add(panel["default_path"])
    for entry in manifest.get("content_scripts", []):
        refs.update(entry.get("js", []))
        refs.update(entry.get("css", []))
    for entry in manifest.get("web_accessible_resources", []):
        refs.update(entry.get("resources", []))
    return refs


def validate_manifest(manifest: dict) -> None:
    if manifest.get("manifest_version") != 3:
        raise SystemExit("Chrome Web Store package must use Manifest V3")
    description = str(manifest.get("description") or "")
    if not description or len(description) > 132:
        raise SystemExit(f"Manifest description must be 1-132 characters; got {len(description)}")
    permissions = set(manifest.get("permissions", []))
    forbidden_unused = {"activeTab", "scripting"} & permissions
    if forbidden_unused:
        raise SystemExit("Remove unused permissions before Store upload: " + ", ".join(sorted(forbidden_unused)))


def main() -> int:
    manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    validate_manifest(manifest)
    version = manifest["version"]
    package_dir = DIST / f"chute-extension-{version}"
    assets_dir = DIST / "store-assets"
    zip_base = DIST / f"chute-chrome-{version}"

    if package_dir.exists():
        shutil.rmtree(package_dir)
    package_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(EXTENSION, package_dir)

    icons = {}
    for size in (16, 32, 48, 128):
        rel = f"icons/icon{size}.png"
        make_icon(size, package_dir / rel)
        icons[str(size)] = rel

    packaged_manifest = json.loads((package_dir / "manifest.json").read_text(encoding="utf-8"))
    packaged_manifest["icons"] = icons
    packaged_manifest.setdefault("action", {})["default_icon"] = icons
    (package_dir / "manifest.json").write_text(json.dumps(packaged_manifest, indent=2) + "\n", encoding="utf-8")

    missing = [ref for ref in referenced_files(packaged_manifest) if not (package_dir / ref).exists()]
    if missing:
        raise SystemExit("Missing manifest resources: " + ", ".join(sorted(missing)))

    zip_path = zip_base.with_suffix(".zip")
    if zip_path.exists():
        zip_path.unlink()
    shutil.make_archive(str(zip_base), "zip", package_dir)

    make_icon(128, assets_dir / "store-icon-128.png")
    make_promo(440, 280, assets_dir / "small-promo-440x280.png")
    make_promo(1400, 560, assets_dir / "marquee-1400x560.png")

    print(f"Chrome Web Store ZIP: {zip_path}")
    print(f"Store icon:           {assets_dir / 'store-icon-128.png'}")
    print(f"Small promo tile:     {assets_dir / 'small-promo-440x280.png'}")
    print(f"Marquee tile:         {assets_dir / 'marquee-1400x560.png'}")
    print("Still required: at least one real screenshot of the working extension.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
