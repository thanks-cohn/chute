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


def test_native_host_accepts_chutey_and_legacy_chute_manifests():
    for label in ("Chute", "Chutey"):
        assert native_host._is_chute_manifest({
            "name": label,
            "homepage_url": "https://github.com/thanks-cohn/chute",
        })
        assert not native_host._is_chute_manifest({
            "name": label,
            "homepage_url": "https://example.com",
        })


def test_native_bundle_atomic_verified_replacement_and_locked_failure(tmp_path, monkeypatch):
    from unittest.mock import Mock
    import pytest
    bundle=tmp_path/'bundle'; bundle.mkdir()
    source=bundle/'Chute-NativeHost.exe'; source.write_bytes(b'new host bytes')
    target=tmp_path/'installed'/'host.exe'; target.parent.mkdir(); target.write_bytes(b'old host bytes')
    monkeypatch.setattr(native_host,'native_host_exe',lambda:target)
    register=Mock(); monkeypatch.setattr(native_host,'register_native_host',register)
    assert native_host.install_bundled_native_host(bundle)==target
    assert target.read_bytes()==source.read_bytes()
    register.assert_called_once_with(target)
    register.reset_mock(); source.write_bytes(b'updated bytes')
    def locked(*args): raise PermissionError('locked fixture')
    monkeypatch.setattr(native_host.os,'replace',locked)
    with pytest.raises(PermissionError): native_host.install_bundled_native_host(bundle)
    assert target.read_bytes()==b'new host bytes'
    register.assert_not_called()
    assert not list(target.parent.glob('.chute-native-*'))
