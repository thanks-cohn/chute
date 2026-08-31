from __future__ import annotations

import json
import os
import re
from pathlib import Path

CHUTE_HOMEPAGE = "github.com/thanks-cohn/chute"
_EXTENSION_ID_RE = re.compile(r"^[a-p]{32}$")


def chrome_user_data_roots() -> list[Path]:
    local = os.environ.get("LOCALAPPDATA")
    if not local:
        return []
    base = Path(local)
    return [
        base / "Google" / "Chrome" / "User Data",
        base / "Google" / "Chrome Beta" / "User Data",
        base / "Google" / "Chrome Dev" / "User Data",
        base / "Google" / "Chrome SxS" / "User Data",
        base / "Chromium" / "User Data",
    ]


def _read_json(path: Path) -> object:
    # utf-8-sig accepts ordinary UTF-8 and also tolerates a BOM. Chrome itself
    # normally writes plain JSON, but Windows tooling/editors can add a BOM.
    return json.loads(path.read_text(encoding="utf-8-sig"))


def _is_chute_manifest(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    name = str(value.get("name") or "").strip().lower()
    homepage = str(value.get("homepage_url") or "").strip().lower()
    return name == "chute" and CHUTE_HOMEPAGE in homepage


def _path_is_chute(raw_path: object, profile_dir: Path) -> bool:
    if not raw_path:
        return False
    candidate = Path(str(raw_path)).expanduser()
    paths = [candidate]
    if not candidate.is_absolute():
        paths.append(profile_dir / candidate)
    for path in paths:
        try:
            manifest = _read_json(path / "manifest.json")
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            continue
        if _is_chute_manifest(manifest):
            return True
    return False


def _profile_state_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for name in ("Preferences", "Secure Preferences"):
        direct = root / name
        if direct.is_file():
            files.append(direct)
        files.extend(path for path in root.glob(f"*/{name}") if path.is_file())
    return files


def discover_chute_extension_ids(roots: list[Path] | None = None) -> list[str]:
    """Return every loaded Chute extension ID Chrome currently knows about.

    Chrome assigns unpacked extensions an ID that may differ from the Web Store
    ID. We inspect both Preferences and Secure Preferences and only accept an ID
    when the embedded manifest or the extension's on-disk manifest identifies
    this Chute repository.
    """
    found: list[str] = []
    seen_files: set[Path] = set()

    for root in roots if roots is not None else chrome_user_data_roots():
        if not root.is_dir():
            continue
        for state_file in _profile_state_files(root):
            try:
                resolved = state_file.resolve()
            except OSError:
                resolved = state_file
            if resolved in seen_files:
                continue
            seen_files.add(resolved)

            try:
                payload = _read_json(state_file)
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                continue
            if not isinstance(payload, dict):
                continue

            settings = payload.get("extensions", {}).get("settings", {})
            if not isinstance(settings, dict):
                continue

            for extension_id, entry in settings.items():
                candidate = str(extension_id or "").strip().lower()
                if not _EXTENSION_ID_RE.fullmatch(candidate) or not isinstance(entry, dict):
                    continue
                is_chute = _is_chute_manifest(entry.get("manifest"))
                if not is_chute:
                    is_chute = _path_is_chute(entry.get("path"), state_file.parent)
                if is_chute and candidate not in found:
                    found.append(candidate)

    return found
