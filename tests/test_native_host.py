from __future__ import annotations

import json

from chute import native_host


DEV_EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop"
OTHER_EXTENSION_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"


def test_discovers_unpacked_chute_extension_id(tmp_path, monkeypatch):
    user_data = tmp_path / "User Data"
    profile = user_data / "Default"
    profile.mkdir(parents=True)

    extension_root = tmp_path / "checkout" / "extension"
    extension_root.mkdir(parents=True)
    (extension_root / "manifest.json").write_text(
        json.dumps({
            "name": "Chute",
            "homepage_url": "https://github.com/thanks-cohn/chute",
        }),
        encoding="utf-8",
    )

    preferences = {
        "extensions": {
            "settings": {
                DEV_EXTENSION_ID: {
                    "path": str(extension_root),
                    "manifest": {"name": "Chute"},
                },
                OTHER_EXTENSION_ID: {
                    "path": str(tmp_path / "not-chute"),
                    "manifest": {"name": "Chute"},
                },
            }
        }
    }
    (profile / "Preferences").write_text(json.dumps(preferences), encoding="utf-8")

    monkeypatch.setattr(native_host, "_chrome_user_data_roots", lambda: [user_data])

    assert native_host._discover_chute_extension_ids() == [DEV_EXTENSION_ID]


def test_allowed_extension_ids_keep_store_and_discovered_ids(tmp_path, monkeypatch):
    monkeypatch.setattr(native_host, "_discover_chute_extension_ids", lambda: [DEV_EXTENSION_ID])
    monkeypatch.setattr(native_host, "extra_origins_path", lambda: tmp_path / "native-origins.txt")

    ids = native_host._allowed_extension_ids()

    assert ids[0] == native_host.STORE_EXTENSION_ID
    assert DEV_EXTENSION_ID in ids
