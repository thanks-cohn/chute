# Development 1 pre-Codex audit — Windows crashes, missing receipt animation, polling and logs
**Date:** 2026-11-16. **Scope:** source-backed handoff for the CURRENT Phase 1 repair branch; this is a diagnosis and test plan, **not** a claim that new bugs are fixed.
**Repair code candidate:** `f5cefb5` (95 passed, 11 skipped, 37 subtests; real Windows acceptance pending). Branch includes later documentation-only follow-ups.

## Evidence from the owner's machine
- Chutey reportedly crashed/disappeared and needed a notification click to restart. A *separate* temporary Chrome test window also reportedly crashed. The affected process and root cause are **unknown**; do not assume the native worker caused Chrome's crash or vice versa.
- Chutey's familiar file-received animation was no longer visible after a drop.
- C: free space was measured at ~0.25 GiB, later ~1.05 GiB, while available RAM measured **283 MB** on a roughly 4 GB Windows 11 machine. These measurements show severe pressure but are **not** proof of crash cause.
- `%LOCALAPPDATA%\Chute\logs\chute.log` measured **373,125,474 bytes** (~356 MiB), last modified 2026-11-16 13:46. Last 20 lines showed successful `GET /api/files HTTP/1.1 200` about every 1–2 seconds. No crash trace was provided. Do not claim every log byte is polling without sampling.

## A. CONFIRMED: fast full-list polling + unbounded request logs
- `extension/bin.js:266-287`: `refreshCount()` calls `GET /api/files`, downloads/parses the `files` list, and uses only its length as the counter.
- `extension/bin.js:457-458`: `refreshCount(); setInterval(refreshCount, 1200);` — nominally **50 requests per minute per active mascot iframe**. Investigate real tab/iframe counts. No visible-tab pause or in-flight deduplication is visible in that function.
- `extension/shelf.js:617-635`: an additional history check fires every **5000ms** when its local guards permit.
- `src/chute/server.py:83-85`: routine HTTP access messages are logged unless `CHUTE_QUIET=1`; `src/chute/windows_app.py:233-245` appends stdout/stderr to `chute.log`, with no rotation visible in that path.
**Codex starting fix:** dedupe and bound idle file-list requests; prefer event-driven or lightweight status/count requests and explicit refresh on verified drops; avoid multiplying polling across tabs. Filter routine successful polling logs while retaining errors. Add size-bounded log rotation/retention with Windows-safe file handling. Do not overwrite/truncate the live production log or the protected worker to reclaim space.
**Tests:** per-tab and multi-tab idle request count; background/foreground transitions; count promptly updates on verified intake; log size stays bounded across restart/rotation; failures remain diagnosable.

## B. CONFIRMED CODE PRESENT, BEHAVIOR UNVERIFIED: received-file animation
- `extension/bin.js:216-240` still defines `animate("success")`, `YUMMY`, happy face `^ ^`, bouncing count and an **850ms** feedback timer; `extension/bin.css:145-151` still defines `.bin.success` and `@keyframes happy`. CSS matches earlier known-working source `45dc8f...`. **The animation is not deleted.**
- `extension/bin.js:351-386`: drop intake awaits `uploadBlob()`, calls `refreshCount()`, calls `showSuccessFeedback()` after the sequence, then calls `refreshCount()` again in `finally`. `refreshCount` itself resets labels when there is no active success timer. Audit races and ordering, especially multi-file and intermittent offline paths.
- `extension/content.js:309-355` routes page drag/drop to Chutey based on landing zone; `extension/bin.js:415-453` handles direct and forwarded drops; `extension/content-auto-hide.js:60-103,220-260` may hide depending on drag and pointer lifecycle.
**Hypotheses, not proven:** the successful upload never reaches this code path; feedback is rapidly overwritten; the host/iframe is hidden/recreated during feedback; refresh/error interrupts the sequence; CSS transition obscures animation. Trace precise event chain and compare original on an actual drag/drop. **Do not redesign mascot art or fake receipt success.**
**Tests:** actual successful single/multi-file drops visibly trigger original reaction; failed/drop-rejected cases do not show success; status/count update; auto-hide/context menu do not interrupt the intended reaction.

## C. Recovery exists but has coverage and process-safety gaps
- `extension/background-native.js:70-133` has on-demand native `ensure_bridge`, attempted at extension service-worker startup/browser startup/install and on failed bridge requests. `extension/native-wake-page.js` supplies a page-level bridge wake route; `extension/bridge-reconnect.js:52-115,181-248` has page-focused/failed-request recovery. These are **not evidence of an always-on independent watchdog**, nor can they re-enable a disabled Chrome extension.
- `src/chute/native_host.py:88-131`: `ensure_bridge()` attempts health probes and calls `terminate_stale_bridge()`, which uses **`taskkill /IM Chute.exe /F`** against *all matching processes* after a failed pair of fast health checks. That can kill a working protected process in a multi-process/test scenario. Investigate before designing additional auto-restart loops, use process identity/ownership with cautious health confirmation, rate limits, and no duplicated worker processes.
- `src/chute/windows_app.py:136-148,160-179` has self-install/replacement logic that can stop and replace `Chute.exe`. **Never build/run candidate self-install on the owner's live Windows installation**. Use disposable Windows VM and isolated checker per `DEVELOPMENT1-IMPLEMENTATION-AND-VALIDATION.md`.
- `extension/content-auto-hide.js:298-336` intentionally hides based on settings/hover and watches for initial missing host; distinguish expected 10-second hide from actual lost extension/content script. Manifest V3 service-worker sleep is expected behavior; pinning/reenabling an extension is Chrome-controlled.
**Tests:** kill owned candidate in isolated Windows VM; hung health endpoint; native-host denial; Chrome MV3 suspension, background tab, sleep/wake; true content-script loss vs intended hide; repeated rapid failures with backoff/circuit breaker; no production process kills or noisy notifications as prerequisite.

## D. Windows host diagnostics first
Collect **read-only** Windows Reliability Monitor/Event Viewer/Chrome crash timestamps and Chutey worker log error samples (avoid exposing private paths/tokens). Correlate with disk/RAM/commit/pagefile pressure and installed-vs-test profile. A Chrome window failure does **not** establish root cause in Chutey, especially under extreme low headroom. Reproduce after reclaiming several GB and avoiding simultaneous browser windows.

## Narrow Codex execution plan, no speculative features
1. Validate current source and preserve `f5cefb5` review candidate; separate documentation changes from application code.
2. Make a minimal, measured fix for polling and noisy/unbounded logging, with coverage.
3. Trace drop-to-success animation and restore **the original visual reaction**, with observed real drop test.
4. Improve recovery in an independent, bounded, process-safe way; do not introduce self-reloading crash loops.
5. Run isolated Windows acceptance for old Phase 1 features plus these three issues, report precise evidence and unresolved cases.
6. Only after completed Development 1 is owner-reviewed, create Development 2 from its **final repaired and validated commit**. The always-on-top portable Explorer, its controls, folder drops, and nostalgic yellow legal-pad appearance belong to Development 2; do not start them yet.

**Protect:** original installed `Chute.exe` (SHA-256 `C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`), existing extension/data, history, files, Chrome profiles and archived baseline. No data deletion or installed-binary replacement as an audit side effect.
