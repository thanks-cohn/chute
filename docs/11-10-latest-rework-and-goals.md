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

---

## 8. New direction (November 10) — Feed Chutey: highlighted text, notes, screenshots

**Owner's priority:** Chutey should accept not only files, images and links, but also *selected text*. Highlight text anywhere on an accessible web page → right-click → **Feed Chutey** → it appears as a small text/note tile in the extension popup and Shelf. Clicking that tile immediately opens a beautiful, readable **note viewer**, not an engineering/debug panel. This turns Chutey into a frictionless cross-browser temporary collection and tool surface, without requiring users to open a text editor or a file picker.

### 8.1 P1 — Highlight → Feed Chutey → note viewer (implement first)

1. Support a context-menu entry **Feed Chutey** for text selections. Register on the `selection` context; use Chrome's provided selection information when available rather than brittle page scraping. Preserve the exact highlighted text, including line breaks and Unicode.
2. Context-menu action sends structured selected text through the extension's existing API/native-helper pathway into Chutey's local store. Make commands idempotent by request ID and queue or report accurately if worker unavailable. Do **not** falsely show success on failed saves.
3. Create a normal tile with a distinct simple text/note icon or user-enabled Chute face, readable preview snippet (clamped), and stable item ID. Do not dump JSON, internal URLs, file paths or diagnostic strings into the gallery.
4. **One click on the tile → one deterministic in-popup/in-Shelf note viewer** (use the appropriate surface, not an uncontrolled series of resizes). Clean typography, suitable width, line breaks intact, scrolling for lengthy notes, close/Escape, keyboard navigation, copy-all button, and optional drag-out as text. No separate `Open` button.
5. Support retrieval, deletion, recall, browsing by date and search/filter later through the same API surface as other items. Day history should not be erased by clearing the live basket.
6. Prefer one compact metadata JSON record per note within the existing date/history indexing scheme, rather than large rewrites of a single daily JSON file. **The owner's proposed daily JSON grouping is a logical view:** day-scoped entries in a reliable indexed local store, with optional atomic daily JSON export/backup. Avoid a single concurrent-write hotspot or data corruption.
7. Example logical record (illustrative contract, not a claim about implemented schema):

```json
{
  "id": "<generated item id>",
  "type": "text-note",
  "created_at": "ISO-8601 local capture time",
  "day": "YYYY-MM-DD",
  "text": "<exact selected Unicode text>",
  "source": {"page_url": "<optional capture metadata>", "page_title": "<optional title>"},
  "active": true
}
```

8. **Privacy and safety:** Capturing is *explicitly user-initiated*, local by default. The selection is never transmitted to third-party services; source URL/title are optional metadata, not part of text. Avoid capturing sensitive fields, password editors, or prohibited pages. Escape displayed text; never inject selected text as HTML or execute scripts. Limit selection length and handle excessively large excerpts gracefully.
9. Keep native clipboard, drag/drop, text-file export and external-tool interoperability open as later capabilities, without overcomplicating the first note viewer.

**Acceptance:** Highlight a multi-line paragraph, right-click **Feed Chutey**, verify exactly one durable local text entry with the same characters, click it to open the note viewer, copy it, switch dates, reconnect the worker and recall it. Test empty selections, Unicode, very long snippets, unsupported pages, duplicate requests and worker failure; ensure nothing silently disappears.

### 8.2 P2 — Screenshot → Feed Chutey (phase after notes)

- Add a separate **Feed Screenshot to Chutey** command/shortcut for a user-requested screenshot. Start with a visible-tab capture when Chrome permissions and active-tab context allow; optionally expand to user-selected region or window later.
- Capture must clearly specify *what* is being captured; do not silently take screenshots or capture unrelated tabs. Respect Chrome permissions and restricted pages.
- Save the actual image bytes as a normal Chutey image entry with time/date metadata. The popup/Shelf displays its thumbnail and uses the exact same deterministic image preview flow as ordinary pictures.
- The user should be able to invoke the screenshot operation directly without navigating through multiple intermediate windows. A customizable keyboard shortcut is a preferred entry point where supported.
- Avoid full-resolution screenshot buffers inside Native Messaging JSON. Transfer binary bytes through a bounded stream/local bridge when possible, with a lightweight control request and verified local write.
- Screenshots must remain separate items from captured text unless the user deliberately associates them; do not entangle failure of one with the other.

**Acceptance:** One explicit screenshot action → one verified image in Chutey → immediate thumbnail/preview/drag/copy. No unrequested screenshot, UI flicker, or duplicate item.

### 8.3 P2/P3 — Chute Faces gallery and downloadable expansion packs

- The owner intends to gradually create **~100 distinct Chute faces**, particularly humorous/meme expressions shown on **link/shortcut tiles** in place of the same default face.
- Begin with a simple `faces/` asset registry plus optional pack metadata; stable deterministic selection by item ID rather than changing randomly on each render, to avoid flickering. Allow a future user-picked face, pack selection and expansion packs.
- Real image files use their actual thumbnails. Link tiles may show the Chute mascot face gallery. Text notes should have a recognizable note treatment unless deliberately customized.
- Files should be lazily loaded, cacheable and bounded in size. Expansion packs must not degrade popup startup, drag/drop or worker recovery.

### 8.4 P2/P3 — User-created backgrounds / animated mascot backdrops

**Owner's separate idea:** Open up the artwork *behind the little Chutey mascot* so people can submit or import their own GIF loops, mathematical/procedural visualizations, or static images. Preserve the user-approved original living mathematical background as the **default and fallback**; do not remove it.

- Support a user-controlled `Mascot Background` choice: Default / Static Image / Animated GIF / Procedural Theme (when supported). Keep the actual mascot face and foreground independently replaceable from the background.
- Permit local asset import and, later, creator-submitted theme/expansion packs with review/moderation and explicit installation.
- Animated GIFs and procedural effects must stay behind the mascot, with fixed clipping/bounds and no layout shift, interfering pointer events or animation-driven worker traffic. Honor reduced-motion preferences and allow disable/pause.
- Define size, frame rate, CPU/GPU and memory budgets; make load failures fall back silently to the default. Never run arbitrary untrusted JavaScript as a theme; prefer sandboxed/validated declarative parameters for procedural visuals.
- Save theme preferences locally, separately from users' file/history data. The art system is cosmetic and must not complicate core file saves or note retrieval.

### 8.5 UX doctrine and work priority

1. **Do selected-text capture and the note viewer first.** They create immediate utility and are mechanically simple to test.
2. **Screenshot capture comes next** and should reuse the ordinary image pipeline.
3. **Chute Faces and mascot backdrop customization are modular optional layers**, not prerequisites to making Chutey reliably usable.
4. The popup remains minimalist, visual-first, keyboard accessible, predictable and low-flicker. Hide engineering diagnostics from end users while keeping them inspectable via API/debug mode.
5. Maintain GUI-to-API parity, exact saved-item verification and GOLD reliability requirements.

**Implementation status at documentation time:** These are new product requirements and design proposals, not completed features. Implement on a reviewable Chute-specific branch and test against the existing popup GOLD UX checkpoint `chutey-popup-gold-2026-11-10` without changing that tag. Do not touch Click2Cloud or REDOWN.
