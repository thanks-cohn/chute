# BUG-2026-11-03-002 — Apparently unresponsive Chute extension after upgrade

**Priority:** P0 — installation compatibility / worker boot diagnosis  
**Branch:** `development-2026-11-03`  
**Status:** Source-level issues identified; user's installed files and service-worker error have **not** been inspected. Avoid declaring a single root cause without device evidence.

## What the repository proves

- The current branch's extension uses local APIs `/api/browse`, `/api/calendar`, and `/api/reveal/{id}`. These must be implemented by the **running local companion**, not merely included in an extension download.
- The public Windows release binaries examined were from older releases. They are not generated automatically for this development branch.
- `.github/workflows/chrome-store-package.yml` builds only `chrome_extension_windows_version`, not this development branch.
- `windows_app.py` may silently accept a locked, running installed `Chute.exe` if `/health` answers; the new binary was then **not installed**, leaving an older API running.
- `background-entry.js` is a Manifest V3 service worker. A displayed **Inactive** status between events is normal; it does not prove failure to boot.
- The development CI checks Python tests and JavaScript syntax but does not yet prove that the service worker successfully executes all `importScripts` and handles events in actual Chrome.

## Preserve the known-good Chute *before* any upgrade

The owner has an original Chute that worked reliably for approximately three months and insists that it must not be deleted, replaced, or silently overwritten.

1. In Windows Task Manager → Details, find the running `Chute.exe` process and use **Open file location**.
2. **While it is still present**, copy the executable to a separate, clearly labeled archival folder. Copy any old original downloaded installer too, if present.
3. Save a SHA-256 hash, size, file version metadata if present, and last-modified timestamp. File timestamps alone do **not** establish original version or deployment date. An installed executable's SHA-256 can be compared with downloadable release checksum files where available.
4. Back up `%USERPROFILE%\Chute` (queue, history, files, thumbnails, provenance) separately. Never confuse app binaries with persistent user data.
5. Only then stop the running Chute process. Stopping Chute does not delete the data.
6. **Do not run a new self-installing companion before backing up:** `self_install_if_needed()` targets `%LOCALAPPDATA%\Programs\Chute\Chute.exe` and may overwrite the old binary when it is no longer running.
7. Treat the known-good archived companion as immutable. Build any new development executable from the matching branch/commit, ideally with its own tagged artifact, and do not publish it as an unqualified 'latest' release.

## Device triage

- Open `chrome://extensions` → Chute → service worker. Record exact **Errors** and startup-console messages. Inactive by itself is not a failure.
- Visit `http://127.0.0.1:17891/health`. A healthy response proves a local HTTP service responds; it does **not** establish which version.
- If the local companion is reachable but the new API calls return 404, verify the installed companion's age/hash and whether its binary was successfully replaced.
- Use the same commit for the extension and companion. For current development branch, merely downloading the public release does not guarantee API parity.

## Required fixes before claiming resolved

- Never silently report an installation succeeded after an executable lock prevents overwriting.
- Report version, build commit and supported API capabilities on `/health`.
- Build a matched versioned extension + companion artifact for the development branch without overwriting a known-good release.
- Add boot smoke tests that execute classic worker scripts in order and test event listener registration.
- Verify startup and click-to-open behavior in a real Windows Chrome profile with precise error evidence.

**No automatic deletion, uninstall, overwrite, migration or forced termination is authorized.**
