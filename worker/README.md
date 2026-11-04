# Chutey worker & local companion — source-of-truth map for Codex

> **Existing infrastructure, not a request to implement another worker.**
> Do not copy, fork, repackage or replace these modules inside this directory.
> This folder is a discovery/index entrypoint so a future coding agent knows
> which production-owned source files already power the *working* Chutey.

## There are two different "workers"

| Runtime responsibility | Actual source in this repository | What it does |
| --- | --- | --- |
| Chrome Manifest V3 background service worker | [`extension/background-entry.js`](../extension/background-entry.js), declared in [`extension/manifest.json`](../extension/manifest.json) | Imports extension background modules. Responsible for extension lifecycle, menus, side panel integration and native companion wake. |
| Native bridge / wake-up adapter | [`extension/background-native.js`](../extension/background-native.js), [`extension/native-wake-page.js`](../extension/native-wake-page.js), [`extension/bridge-reconnect.js`](../extension/bridge-reconnect.js) | Uses `com.thankscohn.chute` native messaging and checks local companion health. Preserve the working boot/reconnect logic. |
| Local Windows worker / actual filesystem authority | [`src/chute/server.py`](../src/chute/server.py), [`src/chute/store.py`](../src/chute/store.py), [`src/chute/windows_app.py`](../src/chute/windows_app.py), [`src/chute/native_host.py`](../src/chute/native_host.py) | Existing Python application, serving `127.0.0.1:17891`, storing/revealing local files and integrating with Windows. **Extend this, not the Chrome worker, to implement the Explorer filesystem API.** |
| Browser drag/drop transport | [`extension/content.js`](../extension/content.js), [`extension/drag-relay.js`](../extension/drag-relay.js), [`extension/bin.js`](../extension/bin.js), [`extension/direct-drop-google-yandex.js`](../extension/direct-drop-google-yandex.js) | Existing browser-side drag delivery and intake. Reuse its successful paths; empirically test cross-origin/OS-level limitations rather than assuming a synthetic drag always works. |
| User interface mount point | [`extension/shelf.html`](../extension/shelf.html), [`extension/workspace-tabs.js`](../extension/workspace-tabs.js), [`extension/explorer-shell.css`](../extension/explorer-shell.css) | The File Explorer tab exists but is currently a placeholder. Build a *thin* GUI client here. |

## Source, executable, and why a separate /worker copy would be harmful

**The worker source is already committed.** The compiled `Chute.exe` and `Chute-NativeHost.exe` are built from these sources by the existing Windows build workflow and scripts. They are **not** missing source dependencies that need to be uploaded here. A duplicate service-worker tree would drift from `extension/background-entry.js`; a binary copied into Git would be a stale opaque artifact rather than the engine Codex should edit.

- Known-working, user-tested checkpoint: `chute-v2.6.1-main-upgrades-2026-11-03-working`, pinned to `8fc7a3f698632ffa42f2f14db59fa5be7d271e86`.
- Windows artifact and matching Chrome extension: [original Windows Actions run](https://github.com/thanks-cohn/chute/actions/runs/41770688623), [original Chrome Actions run](https://github.com/thanks-cohn/chute/actions/runs/41770688602), and [known-working GitHub release](https://github.com/thanks-cohn/chute/releases/tag/chute-v2.6.1-main-upgrades-2026-11-03-working).
- Build workflow source: [`.github/workflows/main-upgrades-windows.yml`](../.github/workflows/main-upgrades-windows.yml), [`scripts/build-windows.ps1`](../scripts/build-windows.ps1).
- These links identify an earlier, tested binary pairing. New features added after that source tag **require a newly built and tested Windows companion** and **must not be silently claimed to exist in the old EXE**.

## File Explorer architecture rule for Codex

```text
  Chutey Shelf Explorer tab (rendering, CSS, UX)
                 |
         scoped local API adapter
                 |
     existing Python Chute companion
                 |
       versioned File Explorer API
       |         |          |
    list/stat   transfers   preview/stream
       |         |          |
       +-- Windows filesystem (user-approved roots only)

        Python scenario game also calls
         the *same* production engine
```

**One Chrome MV3 worker. One installed Chutey companion. One production filesystem engine.** Multiple small Python modules inside the companion are fine; parallel duplicate application entrypoints, a second local daemon and a copied browser worker are not.

For the full implementation contract, read [`In_Progress/CODEX_DRAG_DROP_LOCAL_EXPLORER_IMPLEMENTATION.md`](../In_Progress/CODEX_DRAG_DROP_LOCAL_EXPLORER_IMPLEMENTATION.md) before coding. The important distinction: the API *can* be tested without Chrome; the real drag-and-drop integrations *also* need real installed Chrome acceptance tests.

## Security warning

The current `server.py` checks `allowed_origin` for existing routes, but this is not a sufficiently strong authorization mechanism for new broad local filesystem writes. Add authenticated, explicitly granted **root-scoped capabilities**, strict origin validation and traversal/reparse-point checks before exposing new write endpoints. Do not weaken existing startup/extension auth to make the demo work. Do not make the API listen on non-loopback interfaces by default.

**No new worker binaries, credentials, real user folders, or private backups belong in this directory.**
