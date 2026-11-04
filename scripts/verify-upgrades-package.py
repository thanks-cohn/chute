"""Static contract checks for the main-based v2.6.1 Chute upgrade package.

Called in CI before making Windows/Chrome artifacts. Protects native wake
behavior that was missing in the earlier development branch.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "extension"
manifest = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))
assert manifest["version"] == "2.6.1"
assert manifest["name"] == "Chutey", "Chrome side-panel header must be Chutey"
assert manifest["short_name"] == "Chutey"
assert manifest["action"]["default_title"] == "Chutey"
assert "<title>Chutey</title>" in (EXT / "shelf.html").read_text(encoding="utf-8")
assert '<div class="title">Chutey</div>' in (EXT / "shelf.html").read_text(encoding="utf-8")

assert manifest["background"]["service_worker"] == "background-entry.js"
assert "nativeMessaging" in manifest["permissions"]
assert "sidePanel" in manifest["permissions"]

entry = (EXT / "background-entry.js").read_text(encoding="utf-8")
required_imports = [
    "background-native.js",
    "background.js",
    "background-custom-size.js",
    "background-provenance.js",
    "background-custom-storage-compat.js",
    "background-context-resolver.js",
    "background-context-menu.js",
    "background-sidepanel.js",
]
for name in required_imports:
    assert (EXT / name).is_file(), f"Missing boot dependency: {name}"
    assert f'"{name}"' in entry, f"Worker is not importing: {name}"
assert entry.index('"background-native.js"') < entry.index('"background.js"')

for page in ("popup.html", "shelf.html"):
    html = (EXT / page).read_text(encoding="utf-8")
    for script in (
        "native-wake-page.js", "bridge-reconnect.js", "shelf.js",
        "workflow-fixes.js", "calendar.js"
    ):
        assert f'src="{script}"' in html, f"{page} is missing {script}"
        assert (EXT / script).is_file()
    assert html.index('src="native-wake-page.js"') < html.index('src="bridge-reconnect.js"')
    assert html.index('src="bridge-reconnect.js"') < html.index('src="shelf.js"')
    for element in ("history-calendar-toggle", "history-pagination", "history-page-prev", "history-page-next"):
        assert f'id="{element}"' in html, f"{page} has no {element}"

for script, expected in (
    ("background-native.js", "chute-ensure-bridge"),
    ("bridge-reconnect.js", "ChuteBridgeOfflineError"),
    ("shelf.js", "fetchHistoryPage"),
    ("calendar.js", "calendar-money"),
):
    assert expected in (EXT / script).read_text(encoding="utf-8"), (script, expected)

bg = (EXT / "background.js").read_text(encoding="utf-8")
assert "attach-file" not in bg, "Legacy attach handler should not be wired"

server = (ROOT / "src/chute/server.py").read_text(encoding="utf-8")
for api in ("/api/browse", "/api/calendar", "/api/reveal/"):
    assert api in server, f"Companion is missing required development endpoint {api}"

# Images previously had an IntersectionObserver on a hidden IMG, so none loaded.
# Open success must not inject a developer-style status line into the Shelf.
shelf = (EXT / "shelf.js").read_text(encoding="utf-8")
css = (EXT / "shared.css").read_text(encoding="utf-8")
assert "thumbObserver.observe(icon)" in shelf
assert "thumbObserver.observe(thumb)" not in shelf
assert 'const icon = entry.target;' in shelf
assert "Showing ${file.name} in your file manager" not in shelf
assert "Opened folder containing ${file.name}" not in shelf
assert 'class="file-type-svg"' in shelf
assert '.file-fallback' in css

# Chrome Load unpacked must display Chute's own artwork, not generic puzzle icon.
for size in ("16", "32", "48", "128"):
    path = f"icons/icon{size}.png"
    assert manifest["icons"][size] == path
    assert manifest["action"]["default_icon"][size] == path
    icon = EXT / path
    assert icon.is_file(), path
    data = icon.read_bytes()
    assert data.startswith(b"\x89PNG\r\n\x1a\n"), path
    assert int.from_bytes(data[16:20], "big") == int(size)
    assert int.from_bytes(data[20:24], "big") == int(size)

print("PASS: main-based v2.6.1 native boot and upgraded API contract")
