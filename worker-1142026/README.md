# Chutey working worker snapshot — November 4, 2026

**Immutable-intent source snapshot, not a second running worker.** This directory preserves a byte-for-byte copy of the Chrome MV3 worker and closely coupled native Windows/Python companion source, from known working `main` source **ed5cad974fecacba7b05419db248affebca724f2**.

## What is included

- `chrome/background-entry.js` and every `importScripts` module it loads, plus supporting wake/reconnect modules and the extension manifest.
- `companion/src/chute/` and `companion/scripts/` copies of the Windows companion, native host and Explorer read-only API/Windows guard sources, and Windows packaging entrypoints.
- `SOURCE-MAP.tsv`: exact canonical path → snapshot path → Git blob SHA, enabling agents to verify byte-for-byte identity.

## IMPORTANT: do not install this folder as an extension

The real production Chrome extension **continues to load** `extension/background-entry.js`. Its original dependency paths, manifest, UI and assets remain in `extension/`. The real native host and Python companion remain at `src/chute/` with the existing packaging scripts. This is a **reference snapshot** so future Codex work can inspect a working state. Do **not** point the extension manifest at this folder, start a second worker, fork the Python engine, or patch copied files as if they were production. Any new changes belong in the canonical files.

For a runnable, matched build use the GitHub Release assets **Chute-Windows-Explorer-TEST.exe** and **chute-chrome-2.6.1.zip** released under tag `chutey-worker-1142026`. These are from the verified paired Actions run [41795692460](https://github.com/thanks-cohn/chute/actions/runs/41795692460), source `a6214d494e4db89f765717b85ac03f69391b454a`. The production snapshot files listed here were compared with that matched binary source and are identical. Only documentation/release metadata was added afterward.

## Limitations

- This is a **Windows Explorer P0-A test-build candidate**, read-only directory access; no claim of completed write, clipboard, folder-drop or full REDOWN integration.
- A successful GitHub Actions build does not establish universal live site acceptance or owner-installed acceptance.
- Avoid storing credentials, browser profiles, private filesystem content, user data or compiled executables in Git.
- Keep the older stable release `chute-v2.6.1-main-upgrades-2026-11-03-working` intact; this release is deliberately marked **prerelease** to avoid overriding stable latest.
- The working pair must be installed as a matching Windows companion and Chrome unpacked extension; do not mix it with the old native-host executable.

## Verification

For each `SOURCE-MAP.tsv` row, compare the snapshot file with its canonical path and/or Git blob SHA. At release time the CI workflow repeats this comparison and checks both against the original paired-build source commit. Workloads use tiny local fixtures only; no network uploads beyond GitHub release artifacts.
