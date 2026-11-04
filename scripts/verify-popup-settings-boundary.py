"""Guard the popup DOM from accidentally embedding/duplicating History in Settings."""
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "extension" / "popup.html").read_text(encoding="utf-8")
CSS = (ROOT / "extension" / "popup-gallery.css").read_text(encoding="utf-8")


class PopupStructure(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.found = {}

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        classes = attributes.get("class", "").split()
        name = attributes.get("id") or (
            "settings-panel" if "settings-panel" in classes
            else "history-nav" if "history-nav" in classes
            else None
        )
        ancestors = [info[1] for info in self.stack]
        if name:
            self.found.setdefault(name, []).append(tuple(ancestors))
        if tag not in self.VOID:
            self.stack.append((tag, name))

    def handle_endtag(self, tag):
        # Correct HTML nesting is a prerequisite for native <details> isolation.
        if not self.stack or self.stack[-1][0] != tag:
            raise AssertionError(f"Unexpected closing </{tag}> after {self.stack[-3:]}")
        self.stack.pop()


parsed = PopupStructure()
parsed.feed(HTML)
assert not parsed.stack, f"Unclosed tags: {parsed.stack}"
assert len(parsed.found["settings-panel"]) == 1
assert len(parsed.found["chutey-popup-gallery"]) == 1
for name in ("history-nav", "history-calendar-popover", "files",
             "history-pagination", "history-sentinel"):
    positions = parsed.found.get(name, [])
    assert len(positions) == 1, f"Expected exactly one {name}, got {len(positions)}"
    assert "chutey-popup-gallery" in positions[0], f"{name} is not in gallery"
    assert "settings-panel" not in positions[0], f"{name} was inserted into Settings"
for name in ("gallery-density", "shelf-viewer-size"):
    positions = parsed.found.get(name, [])
    assert len(positions) == 1
    assert "settings-panel" in positions[0], f"{name} must be a setting"
assert ".settings-panel[open] .settings" in CSS
assert "position:absolute" in CSS
assert "background:#151a13" in CSS
assert "#chutey-popup-gallery" in CSS
print("PASS: one independent History/gallery, isolated Settings popover, density/viewer controls in Settings")
