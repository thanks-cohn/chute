# Chutey Windows worker, image loading, and Explorer stability — source audit

**Date:** 2026-11-10. **Scope:** thanks-cohn/chute `main` source. **Method:** static review of native helper, HTTP service, extension History/gallery recovery, thumbnail pipeline and local Explorer API/UI. **Not performed:** live Windows diagnostics, workload benchmarks, memory traces, actual crash identification. Risk levels express plausibility/impact, not proof of runtime cause.

## P0 — One short health hiccup may trigger forced process kill

**Location:** `src/chute/native_host.py`, `bridge_alive` (~55–60), `terminate_stale_bridge` (~87–106), `ensure_bridge` (~109–127).

- Health probes default to 0.35s and retry at 0.5s after a brief 0.12s wait.
- When both fail, `ensure_bridge` calls `taskkill /IM Chute.exe /F` (all processes matching the image name), waits 0.18s and relaunches.
- A loaded/temporarily stalled HTTP health response is **not** proof a process is dead. This can terminate a busy but otherwise healthy companion, severing active streams and Explorer sessions. It also risks killing an unrelated copy of Chute.exe. Confirm whether this exact path fires on the affected Windows machine.
- **Fix direction:** identify/own the exact PID, check process-liveness separately from health, use longer and multi-signal degraded-state thresholds, never taskkill by bare image name, and coordinate with active streams. Limit respawn to proven dead/unrecoverable state.
- **Test:** hold health responses >500ms while process is responsive to other requests; verify zero kills. Kill the exact owned process and prove genuine recovery.

## P0 — Recovery actively erases/replaces file UI

**Location:** `extension/bridge-reconnect.js` (~144–180, 183–229); `extension/shelf.js` (~427–466).

- Recovery UI writes `files.innerHTML` on offline, replacing all gallery entries with an error message.
- Upon wake, `refreshView` calls `resetHistory`; that function clears generated thumbnail state, disconnects IntersectionObserver, calls `listElement.replaceChildren()` and recreates all rows. This destroys current image DOM nodes; thumbnails may download/decode again and focus/selection can be lost.
- A MutationObserver scans changes in `#files` and status text for raw transport-error phrases and triggers additional recovery. Though in-page recovery is promise-deduplicated, this couples DOM text to connectivity and increases feedback-loop risk.
- **Fix direction:** make connection state a standalone observable data model, never infer it from rendered prose; preserve gallery DOM and retained thumbnail object URLs across transient backend failures. Patch rows by ID only if data changes. Keep offline state as unobtrusive overlay/indicator without replacing `#files`.
- **Test:** simulate network offline and health flapping while showing 30 thumbnails; assert zero removals of existing tile nodes, stable scroll/selection and no remount-induced flicker.

## P0 — Thumbnail path can fetch/decode original images in full

**Location:** `extension/shelf.js` (~122–180, 183–193, 262–284).

- Cache miss: fetch `/api/files/<id>`, `await response.blob()` (whole original in browser), `createImageBitmap` full-image decode, canvas rescale to 48px, upload WebP thumbnail to companion.
- No obvious concurrency limit in `ensureThumbnail`; eager first 8 plus observer-demanded later images can initiate parallel full-image fetches. `generatedThumbs` is set only once an operation finishes, not when it starts, allowing duplicate work if multiple calls race.
- The code creates object URLs for thumbs; audit lifecycle/revocation particularly on history refresh to avoid accumulations.
- **Fix direction:** server/native companion generates bounded thumbnails on ingest or lazily in a dedicated capped thumbnail pool (retain safe image decompression limits); browser requests only cached thumbnail bytes. Deduplicate by item ID with in-flight promises; cap concurrent decode/network; cancel stale work; URL lifecycle cleanup.
- **Test:** load gallery with 30 large images (100MB+ files as applicable), track original GETs, peak JS memory, network bytes, decode latency, and image paint time. Expect zero original full-image downloads for grid thumbnails when supported.

## P0/P1 — Explorer requests and long transfers compete for limited slots/lock

**Location:** `src/chute/explorer/api.py` (~13–49, 72–93, 113–154).

- Every Explorer request competes for one of four `BoundedSemaphore` slots; excess immediately returns 429 BUSY.
- The `receive` stream acquires `self.engine.lock` for the entire copy. `receive_from_live` and other transfer paths hold it over hashing and copying. Commands requiring the same lock can be delayed while transfers run.
- Same endpoint serves metadata commands, thumbnails and long-lived transfer reads. ThreadingHTTPServer allows threads, but app-level semaphore and lock introduce a bottleneck.
- **Fix direction:** reserve independent lightweight control capacity; narrow critical sections to metadata/grant checks, coordinate grants/handles with transfer-safe refcount leases; keep long I/O outside the global engine lock where safe; assign bounded transfer and thumbnail pools; distinguish BUSY from disconnection.
- **Test:** 1–4 concurrent uploads while sending 100 list/health/thumbnail requests; measure p95 command latency, 429 count, throughput, and worker PID stability.

## P1 — Explorer re-navigation discards thumbnails and selections

**Location:** `extension/explorer-view.js` (~154–170, ~224–237, ~252–260).

- Every non-append `load` clears selections, closes preview, revokes all thumbnails, resets rows, and `list.replaceChildren()` even for refreshes of the same folder. Reconnect/session restore similarly calls `connect` and rebuilds the tree.
- There is a max-three thumbnail pump, which is useful, but reloads can trigger repeat image generation; a separate `thumbnails` map is released wholesale.
- **Fix direction:** distinguish refresh, folder change and explicit reset. Diff by stable file identity, reuse existing thumbnails, preserve viewport/selection/preview for same-folder refreshes, retain short-lived cache across sessions.
- **Test:** refresh same folder repeatedly with 100 photos and assert thumbnails do not blink or re-request unnecessarily.

## P1 — Explorer preview has explicit media size limits

**Locations:** `src/chute/explorer/preview.py` (~46–64); `src/chute/explorer/api.py` (~178–218); `extension/explorer-view.js` (~76–103, ~143–147).

- Thumbnail function rejects originals >16MiB or >24 million pixels rather than generating efficient safe alternatives.
- Image preview path rejects >32MiB and Explorer UI refuses very large previews (a separate 64MiB check); copy-to-clipboard code materializes entire blob into a File. These are deliberate constraints and can make supported local files feel broken/limited. Do not remove safety caps without bounded replacements.
- **Fix direction:** true streaming/ranged media preview and staged/reduced-resolution thumbnails, robust memory and resource limits; clear UX explanations for unsupported files.

## P1 — Layered reconnection amplifies user-visible latency

**Locations:** `extension/bridge-reconnect.js`, `extension/native-wake-page.js`, `extension/background-native.js`, `src/chute/native_host.py`.

- Popup wraps all localhost fetches and on transport exception kicks off wake + several probes; wake can traverse MV3 and native messaging with multi-second timeouts. The native helper itself may terminate and relaunch the companion.
- In-flight GETs are retried automatically after recovery but non-GET actions report `Please try that action again`. That's defensible against duplicate writes but disrupts UX; transfer status/receipt should be reconciled.
- **Fix direction:** distinguish slow request / HTTP 429 / native bridge truly dead. One authoritative lifecycle state across popup, background and native helper. Track process start/stop and exact recovery cause. Coordinate operation receipts, not blind retries.

## Recommended immediate remediation order

1. **Stop aggressive process killing** on two short probes; instrument PID, health, worker start/exit, active transfers. This is the highest-risk potential root of actual disconnections.
2. **Prevent UI destruction** during recovery and refresh; no DOM-text-driven reconnect.
3. **Fix thumbnail creation** to avoid transferring and decoding entire originals for the grid. Bound in-flight work and reuse thumbnails.
4. **Deconflict Explorer locks/slots** by separating control/metadata from file data; benchmark parallel uploads and browsing.
5. Preserve user-approved popup UX tag `chutey-popup-gold-2026-11-10`; make changes in a new branch with regression tests.
6. Benchmark Windows idle and under load: process uptime/restart reason, memory/CPU, p95 health & Explorer command latency, transfer throughput, file sizes, 429 rates, image bytes downloaded, actual per-tile remount counts. Compare against historical worker references.

## Evidence rules

This review identifies **specific code-level defects and risks**, but it does not establish which failure actually occurs on the user's installed machine or whether it runs the exact audited build. Confirm the installed EXE hash, extension version, loaded branch and process logs before presenting a definitive runtime cause. Don't claim that a newer worker is computationally weaker until profiling establishes CPU/memory/IPC bottlenecks. Don't claim fixes have landed; this document is an audit, not implementation.
