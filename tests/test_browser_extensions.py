from __future__ import annotations

import json

from chute.browser_extensions import discover_chute_extension_ids


DEV_EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop"
OTHER_EXTENSION_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"


def _write_chute_manifest(path):
    path.mkdir(parents=True)
    (path / "manifest.json").write_text(
        json.dumps({
            "name": "Chute",
            "homepage_url": "https://github.com/thanks-cohn/chute",
        }),
        encoding="utf-8",
    )


def test_discovers_random_unpacked_id_from_secure_preferences(tmp_path):
    user_data = tmp_path / "User Data"
    profile = user_data / "Default"
    profile.mkdir(parents=True)
    extension_root = tmp_path / "checkout" / "extension"
    _write_chute_manifest(extension_root)

    settings = {
        "extensions": {
            "settings": {
                DEV_EXTENSION_ID: {
                    "path": str(extension_root),
                    "manifest": {"name": "Chute"},
                }
            }
        }
    }
    (profile / "Secure Preferences").write_text(json.dumps(settings), encoding="utf-8")

    assert discover_chute_extension_ids([user_data]) == [DEV_EXTENSION_ID]


def test_discovers_bom_prefixed_secure_preferences(tmp_path):
    user_data = tmp_path / "User Data"
    profile = user_data / "Default"
    profile.mkdir(parents=True)
    extension_root = tmp_path / "checkout" / "extension"
    _write_chute_manifest(extension_root)

    settings = {
        "extensions": {
            "settings": {
                DEV_EXTENSION_ID: {
                    "path": str(extension_root),
                    "manifest": {"name": "Chute"},
                }
            }
        }
    }
    (profile / "Secure Preferences").write_text(json.dumps(settings), encoding="utf-8-sig")

    assert discover_chute_extension_ids([user_data]) == [DEV_EXTENSION_ID]


def test_discovers_from_preferences_and_rejects_non_chute(tmp_path):
    user_data = tmp_path / "User Data"
    profile = user_data / "Profile 1"
    profile.mkdir(parents=True)
    extension_root = tmp_path / "checkout" / "extension"
    _write_chute_manifest(extension_root)

    settings = {
        "extensions": {
            "settings": {
                DEV_EXTENSION_ID: {
                    "path": str(extension_root),
                    "manifest": {
                        "name": "Chute",
                        "homepage_url": "https://github.com/thanks-cohn/chute",
                    },
                },
                OTHER_EXTENSION_ID: {
                    "path": str(tmp_path / "other-extension"),
                    "manifest": {
                        "name": "Not Chute",
                        "homepage_url": "https://example.com",
                    },
                },
            }
        }
    }
    (profile / "Preferences").write_text(json.dumps(settings), encoding="utf-8")

    assert discover_chute_extension_ids([user_data]) == [DEV_EXTENSION_ID]


def test_relative_unpacked_path_is_resolved_from_profile(tmp_path):
    user_data = tmp_path / "User Data"
    profile = user_data / "Default"
    extension_root = profile / "dev-extension"
    _write_chute_manifest(extension_root)

    settings = {
        "extensions": {
            "settings": {
                DEV_EXTENSION_ID: {
                    "path": "dev-extension",
                    "manifest": {"name": "Chute"},
                }
            }
        }
    }
    (profile / "Secure Preferences").write_text(json.dumps(settings), encoding="utf-8")

    assert discover_chute_extension_ids([user_data]) == [DEV_EXTENSION_ID]
