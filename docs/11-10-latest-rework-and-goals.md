# 11/10 - latest rework and goals

**Project:** Chutey / Chute | **Date:** November 10, 2026 | **Repository:** `thanks-cohn/chute` | **Source of truth:** `main` for the latest integrated work; historical GOLD tags for worker recovery behavior.

> **OWNER'S RELEASE-BLOCKING PRIORITY: FIX THE USER EXPERIENCE FIRST.** The current Chutey Shelf/popup is inconsistent and frustrating, and its Windows worker experiences intermittent disconnect/reconnect cycles while transferring or streaming data. The owner reports visible flicker, disruptions, and the error: **“Chute is asleep. Automatic reconnect failed. Hit Reconnect above to ask the Windows helper again. First time using Chute on this Windows PC?”** The worker is not acceptable for release in its current observed state. Do not claim a fix without reproducing and validating it on Windows.

## 0. Branch, baseline and safety rules

- Start new implementation work from `main` so the current integrated Chutey Explorer/Shelf features are not discarded.
- Historical references: `chute-windows-v2.6.1-rc1` (documented recovery tests) and `chute-v2.6.1-main-upgrades-2026-11-03-working` (later user-confirmed matched pair, source `8fc7a3f698632ffa42f2f14db59fa5be7d271e86`). **These are different versions.**
- The owner reported a previous original Chute Windows companion running reliably for roughly three months. Its *exact installed binary identity has not been independently matched* to the older RC1 tag. Never present RC1 as proven to be that three-month binary until compared by installer/version/hash or other evidence.
- The complete historical evidence boundary is in `docs/GOLD_STANDARD_WORKER.md`.
- Create a separate implementation branch/PR. Never rewrite historical tags or discard current Explorer features; preserve local data. No fake success/ready states.

## 1. P0 — Shelf and popup UX (must fix before release)

**User-observed failure:** Clicking a small Shelf/popup tile sometimes expands it slightly, sometimes enormously; repeated identical actions do not produce predictable results. Opening the extension and clicking the Shelf also produces inconsistent behavior. This makes the interface unusable.

**Required behavior and implementation investigation:**
1. Reproduce with rapid clicks, single/double clicks, keyboard activation, fresh popup, restored popup, varying viewport, content dimensions, and while the backend is disconnecting.
2. Establish **one canonical per-tile state machine**: closed / selected / expanded / previewing, with explicit transitions. Exactly one action per intended user input. Document the separate behavior of select, open preview, expand/collapse, and drag; no ambiguous gestures.
3. Audit event propagation, duplicated listeners, click vs double-click races, stale asynchronous image sizes, CSS transitions, ResizeObserver loops, popup auto-resizing, and state remounts. Instrument each transition (input, previous state, next state, item ID, reason).
4. Expansion must be bounded by the viewport and produce a consistent geometry for the same tile+state. No sudden giant blow-ups, overlapping controls, unexpected scroll jumps, or popup windows changing size on their own.
5. Shelf is immediately usable even when the Windows worker is unavailable. Its previously rendered content stays in place and controls do not disappear.
6. Keep existing intentional gallery, thumbnail, preview, Explorer, keyboard, and drag-and-drop behavior; do not revert all UI changes wholesale.

**P0 acceptance:** Repeated identical clicks yield identical geometry/state (including keyboard input); no random small/huge pop-outs, no flashing/remounting, no stray window opening. Validate with actual Chrome popup/side panel/overlay, not only DOM unit tests. Add automated interaction regression coverage and screen recordings or screenshots.

## 2. P0 — Zero-flicker disconnect/reconnect UX

**User-observed failure:** Transfers or streaming operations appear to coincide with Windows bridge disconnections; extension UI flickers and reconnects, sometimes showing the terminal “Chute is asleep” message. These are reports/hypotheses, not yet measured root cause.

- Connection health must **not** own/reset visible Shelf/Explorer component identity. Preserve route, selections, expanded tiles, thumbnails, scroll position, local item state and transfer indicators.
- Separate `connected`, `degraded`, `reconnecting`, `native helper unavailable`, `companion not running`, `health check timed out`, `API failed`, and `blocked by policy`. Avoid broad “asleep” when the underlying condition is unknown.
- Reconnect in the background with bounded backoff, deduplicated attempts, process identity and last-known health; display unobtrusive actionable status instead of replacing the entire interface with an error screen.
- Do not treat a slow/heavy transfer as process death. Health requests and UI commands must not queue behind file payloads.
- Explicit manual Reconnect invokes the same observable recovery API and reports result. Don't force user intervention if an automatic healthy recovery is possible.
- Record timeline of extension MV3 lifecycle, native messaging host, companion PID, local HTTP bridge, health/stream durations, error codes, and UI state transitions.

**Acceptance:** Kill the companion, suspend the Chrome service worker, reconnect, transfer multi-GB items, switch panels, and sleep/resume Windows. The view remains stable, with no visible flicker or lost state; failures display accurate, actionable status.

## 3. P0/P1 — GOLD TURBO worker revamp: near-native local performance

**Goal:** Preserve/restore the original Chute's dependable wake/boot/recovery pathway while upgrading the current worker to approach native Windows local file performance for supported operations. “Near-native” is a benchmark goal, not a guarantee; Chrome and browser drag/drop enforce real limitations.

- **Two logical lanes:** lightweight control/health/navigation/metadata traffic independent from heavy streaming/bulk transfer traffic.
- **Actual binary streaming where supported:** avoid repeated Base64 conversions, full-file buffering, blocking JSON/native-messaging payloads, unnecessary serialization and copies. Bound memory by chunk window and concurrency, not file size.
- **Backpressure and concurrency controls:** bounded queues, cancellation, resumable operations where safe, proper streaming cancellation/cleanup, limits for simultaneous previews/uploads/downloads; no unbounded threads or per-request process spawning.
- **Latency-first UX:** thumbnails/decode off the hot path; prioritize control signals and active preview requests over background work; prevent main-thread stalls, excessive DOM reflows, and image decode storms.
- **Worker reliability:** keep old native helper installation/registration, reliable wakeup, idempotent launch, health verification and retry behaviors where proven; determine whether stalls arise from CPU, memory, Python/GIL, IPC blocking, serial transfer architecture, port ownership, or process death rather than blindly blaming horsepower.
- **Transparent tests:** instrument throughput, first-byte latency, p50/p95 UI command latency during transfers, max RSS, CPU, event-loop stalls, disconnect rates, reconnect times, and user-visible paint/layout stability.
- Compare with Windows Explorer/native local file copy on the same device and storage for representative 1 MB, 100 MB, 1 GB, 10 GB workloads; record constraints and overhead. Test many small files as well as few giant ones.
- For any GUI control there should be a corresponding observable API when technically possible. Test actual behavior, not just a passing mocked contract.

**Acceptance goals (initial targets subject to evidence):** zero visual flicker from backend reconnection; ordinary interactions target 60 FPS on capable systems, low-latency controls while multi-GB streaming runs, bounded transfer memory, graceful shutdown/restart, and throughput approaching native baseline without sacrificing reliability.

## 4. Product feature preservation

- The latest Chutey Explorer experience from main must survive: two-panel local Explorer, tree and thumbnails, configurable preview/keyboard navigation, real drag and drop between desktop/browser, ChatGPT/Google/Yandex drop flows, history and calendar, clipboard work as developed.
- No forced full redesign while fixing tile interaction, and no degradation of native-file handoff behavior.
- Keep Shell picker responsive (open/cancel) and avoid permission prompt loops and duplicate windows.
- Distinguish **known product requirements** from implemented and tested functionality. Verify support on actual Windows/Chrome before asserting parity.

## 5. Execution sequence and release gate

1. Freeze symptom captures: reproducible tile click sequences, popup geometry before/after, time-stamped stream/disconnect examples and screenshots.
2. Fix tile event/state/layout determinism and backend-independent render persistence **first**, in a minimal reviewable PR. Automated UI tests and manual Windows checks.
3. Fix connection-state ownership and eliminate flicker/remounts. Fault-injection on worker kill, native host failure, health timeouts, MV3 suspension, and sleep/resume.
4. Compare current worker vs both GOLD historical references and find specific lifecycle/IPC regressions.
5. Isolate/control streaming and optimize binary transfer, buffer management and concurrency; benchmark before/after against Windows native baseline.
6. Extended real-device endurance testing; compare failure counts and reconnect telemetry.
7. Only after passing gates, merge into `main`; release notes must list measured improvements, outstanding constraints and exact paired extension+worker versions.

## 6. Explicit non-goals / guardrails

- Do not paper over disconnects with an endless spinner, success animation, silent hard reset or aggressive repeated worker respawn.
- Do not replace current Chutey worker with an old build without checking API/Explorer compatibility.
- Do not equate a GitHub CI build with months of real-world endurance or infer the old worker's exact installed hash.
- Do not solve streaming instability merely by increasing retries, moving files into the browser's memory, or blocking the UI.
- Do not modify REDOWN or Click2Cloud in this focused Chute/Chutey work.

## 7. Completion checklist

- [ ] Shelf tile expansion deterministic and bounded
- [ ] Extension popup/shelf navigation stable over 100 repeated interactions
- [ ] UI remains mounted and state preserved during transient disconnection
- [ ] Worker failures diagnosed with exact failing boundary and reason
- [ ] Automatic wake/reconnect verified on actual Windows
- [ ] Health and control requests remain responsive during multi-GB streaming
- [ ] Streaming memory stays bounded; latency/throughput benchmark recorded
- [ ] No regressions to drag-and-drop, preview, Explorer, history, calendar
- [ ] Historical GOLD references and new build identities retained
- [ ] Real Windows manual validation and long-running soak test completed

**Status at creation:** This document records the user's latest priorities and proposed acceptance contract. **It does not claim any UX or worker bug has been fixed.**
