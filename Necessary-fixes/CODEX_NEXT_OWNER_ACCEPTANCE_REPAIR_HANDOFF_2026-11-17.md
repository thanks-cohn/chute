# NEXT CODEX REQUEST — CHUTEY P0 owner-device acceptance and maximum-performance Turbo

**Date:** November 17, 2026
**Repository:** thanks-cohn/chute
**Reference branch:** fix/chutey-media-worker-2026-11-17
**Verified paired TEST source:** 1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122
**Evidence:** https://github.com/thanks-cohn/chute/actions/runs/44141513522
**Scope:** Fix owner's actual Windows failures, then polish necessary UX. No Movie Mode, Development 2, cloud integration or feature migration.

## Owner's primary goal

**ONE video in the bottom player + ONE image in the upper preview + smooth file browsing simultaneously.** This must work without playback stalls, expanding memory consumption, accidental Windows app launch, permission-checkbox hangs, or spurious lane BUSY errors. The owner has a roughly 4-GB Windows PC for actual validation, but Turbo must be designed for separate much more powerful computers too.

### Evidence / verified limitations
- Exact installed Windows worker SHA-256: e17cf38642f0ba82d8bc405a6f1f97756228a510579df1f2a7b2a2e2dbea8a11.
- Exact installed native helper SHA-256: 9b7035e2efa1a314e8d7e5547b475af517bbd1f9556370689d65a260bc4bf72a.
- HKCU Chrome native messaging registered Chute manifest at expected path; **actual loaded Chrome extension ID/version still needs verification** because an older Request 3 ZIP was previously extracted.
- Windows test showed memory rise RSS 49.7 -> 400.4 MiB, private memory 35.9 -> 530.8 MiB over ~30 min. This is unresolved growth, **not yet proven a leak**.
- Owner sees 10-sec MP4s stuck at Loading media and static "Playback stays here while you browse" status, multiple BUSY messages after browsing, intermittent Windows Browse failures (later succeeded), checkbox cannot be toggled in Turbo (does work in Balanced), unwanted Windows location launch from in-Chutey Explorer, and generic unsupported/oversize preview errors.
- Existing docs are the authoritative context; do not infer fixes already completed from CI pass.

## NON-NEGOTIABLE P0 — Deployment-readiness endurance gate (owner's required outcome)

**Chutey must STREAM real video, DISPLAY images, and BROWSE files reliably.** A normal **~30 MB MP4 must work at minute zero AND two hours later**. The previous 30-minute CI result is insufficient for release acceptance.

- Codex must FIRST reproduce and root-cause the owner's real video stalls, lost permissions/Turbo checkbox, spurious BUSY, hanging workers, and measured resource growth. Make actual targeted code fixes; do not merely rewrite requirements or inflate concurrency limits.
- **Real Windows Chrome + matching native helper/worker:** play 10-second MP4 and ~30 MB MP4; seek/pause/repeat/reopen same file; keep previewing images and browsing/searching directories while videos play. Repeat video attempts throughout a **continuous two-hour soak**, then again after two full hours and after selected idle/reopen/reconnect cases. Include long movie playback and changing video files, not only fixture-synthetic clips.
- Run on the owner's constrained approximately 4 GB Windows machine (or representative real hardware) and capable high-end Windows hardware. Check that Turbo does not block playback consent, picker, browse or control-plane while under load.
- Capture worker AND browser RSS/private bytes over time, thread/handle counts, tickets/leases, buffer/cache growth, HTTP Range requests, worker stalls, p95/p99 UI/control latency, error/retry counts. Fix progressive resource growth; prove a steady-state plateau or a measured bounded explanation, not an unexplained upward memory trend. Do not assert a memory leak before isolating root cause.
- **Gate stays FAILED** if any routine 30 MB clip stalls at loading, fails after two hours, cannot retry, UI freezes, navigation becomes unusable, consent checkbox hangs, BUSY storms recur, playback resources grow without bound, or the host requires an unexplained restart.
- Output reproducible stress scripts, CI + real Windows owner-style results with timestamps and metrics, exact matched artifact hashes, rollback, and clear pass/fail. Only after passing all gates and resolving known P0s may Codex describe the build as a **release candidate**. **Deployment requires explicit owner approval; no unsupported claim of zero possible bugs.**
- Hard reference: https://github.com/thanks-cohn/chute/issues/28. Reliability takes priority over appearance and further features.

## Workstream P0-A — Media lifecycle, memory, stalls and responsiveness
1. Reproduce stuck tiny MP4 and trace the full chain (user click → preview metadata → permission check → media_source → ticket → range GET → Chrome ready/decode → playing/EOF). Add redacted per-operation timing and error codes.
2. In extension/explorer-view.js::showPinned, examine early pinnedRow assignment, same-identity early return even if loading failed, cancellation, source/ticket release, lack of bounded timeout or visible failure. Fix so the **same MP4** can be retried after failed/stalled loading. Loading, Ready, Playing, Paused, Failed and EOF states must be truthful. No status implying success before playback starts.
3. Ensure one active player and one current ticket per pane; release obsolete tickets, stop orphaned leases, cancel stale loads, avoid unbounded Blob/decoder/cache growth and ensure switching video doesn't disturb top image.
4. Profile worker and Chrome separately: RSS/private bytes, threads, handle count, active HTTP/media/thumbnail requests, per-lane BUSY, decoder/buffer sizes, queues/locks and timings. Fix growth at the source and demonstrate a stable plateau with realistic long-session and repeated-open/close tests.
5. Preserve media consent, exact Origin checks, provider/path privacy and separate streaming/control lanes; never merely raise semaphore capacity to mask leaks. Investigate why owner sees BUSY with one video + one image.

## Workstream P0-B — REAL Turbo mode for powerful PCs + permission UI regression
**Owner direction:** "Turbo should be the MOST powerful" / "JUST LUNGE and assume you got all the power in the world" / "for people with powerful computers, to maximally enjoy."

- Efficiency = low-resource; Balanced = default responsive; **Turbo = highest-performance profile**, ambitious low-latency, high-throughput prefetch/thumbnail/media browsing on powerful CPUs, RAM and storage.
- The existing static triples in src/chute/explorer/performance.py (Balanced 4/2/2, Turbo 6/3/3 for navigation/thumbnail/prefetch) should not be the final definition of maximum-performance Turbo. Profile and design genuinely hardware-aware, highly parallel but **bounded** scheduling, caching and cancellation; exploit high-end resources aggressively when available. Measure vs Balanced under identical workload on both fast high-spec Windows hardware and constrained 4-GB hardware. Keep safety, verified bytes and UI responsiveness. Do not "assume power" by allowing unlimited memory/threads or hangs.
- **Critical Turbo checkbox regression:** Owner reports Settings → Folder Access shows "Checking approved folder…" and "Allow movie media playback" is unresponsive on Turbo; it works when changing to Balanced. Investigate extension/settings.js::refresh(force), nativeSession(false), Promise.allSettled of performance_get/media_policy_get/roots, disabled states, refreshGeneration races, media_policy_set acknowledgement, control-lane starvation, and locks in NativeExplorer.state. Correlation isn't a proven root cause.
- Policy status/checkbox must remain promptly interactive across Efficiency/Balanced/Turbo, even while doing heavy browsing and video playback. Performance mode must NEVER change scope or toggle/revoke folder consent. If only saved_store scope exists, show explicit reason. Bounded timeouts/retry, no perpetual spinner, no optimistic success.
- Reference: Necessary-fixes/TURBO_MODE_FOLDER_MEDIA_PLAYBACK_CHECKBOX_UNRESPONSIVE_2026-11-17.md

## Workstream P0-C — Windows Shell picker stability
- Browse initially failed with "Windows could not complete folder selection. Try Browse again." and later succeeded. Instrument COM stage + HRESULT, foreground owner window, STA lifecycle, native messaging, cold/warm/delayed picker timing and cancellation, without leaking filesystem paths or tokens.
- Distinguish built-in read-only "Saved Chutey files" fallback from actually approved external folders; don't reset grants simply because Browser reopened.
- Preserve Windows-native folder picker. Test real Windows Shell, not only mocked CI.
- Reference: https://github.com/thanks-cohn/chute/issues/9

## Workstream P1-A — Correct File Explorer vs History clicks
- **In Shelf File Explorer:** First single click on file EXPANDS/OPENS the internal Chutey preview pane even when closed; double-click and Enter also preview inside Chutey. Opening next image replaces image preview; video uses bottom player. Right-click explicit "Open with Windows app", "Reveal / GO TO" and "Preview". Ctrl/Shift multiselect must not preview-storm.
- **In Shelf History:** preserve the CURRENT image tile click/preview functionality (no redesign requested). The explicit **Open BUTTON** reveals the actual saved file location in Windows Explorer **by default** (select where possible), unless the user changes a **Shelf-specific Open setting**. Keep explicit Reveal/GO TO and any optional system-app action distinct. This does NOT change popup images or Shelf File Explorer rows.
- Preserve existing approved folder scopes/History, do not launch external Windows UI on normal in-Chutey file click.
- Reference: Necessary-fixes/FILE_EXPLORER_CLICK_PREVIEWS_HISTORY_CLICK_REVEALS_LOCATION_2026-11-17.md

## Workstream P1-A2 — Popup-only Copy Image + Shelf History Open default (LATEST OWNER CLARIFICATION)
- **Popup small tile:** single-click an image expands its own in-popup viewer, not Windows Explorer. **Right-click tile** offers **Copy image** alongside **Trash It!**.
- **Popup expanded/maximized/lightbox:** right-click image must permit **Copy Image** as well as **Trash It!**, without closing or deleting the image on copy. Preserve existing image-click enlargement and the distinct ↗ Open in Shelf handoff; any explicit file-location Open action is separate and must not hijack image click.
- **Shelf History image card and half/full image preview:** preserve ALL existing click/enlargement/keyboard, lightbox and resize behavior AS IS. **No new Shelf image Copy controls** are requested in this popup-only feature. The user's click-to-enlarge explanation referred to the EXTENSION POPUP, not a change to Shelf.
- **Shelf Open button:** default to revealing the **saved file's local folder in Windows File Explorer** with the file highlighted if supported, UNLESS explicitly overridden by **Shelf-specific Settings**. This ONLY changes Shelf Open: not popup thumbnail clicks, not Chutey's File Explorer row clicks, not the standalone Reveal action.
- **Copy image** means verified actual picture pixels on Windows clipboard for Paint/Paste, not path/filename/link/file-list; reuse scoped `locate_saved` + native `clipboard_copy_image` (existing guarded clipboard API) where applicable. Respect supported formats, size/pixel/memory caps and report failures. Do not delete/mutate History or falsely show success.
- Three independent UI surfaces: **Extension popup image click** = preserve enlargement; **Shelf File Explorer image click** = expand internal preview pane; **Shelf History Open BUTTON** = reveal Windows local saved location by default, subject to Shelf-specific Settings. Shelf History image clicks remain unchanged. Do not mix these with popup Copy Image.
- Reference: Necessary-fixes/POPUP_SHELF_COPY_IMAGE_AND_SHELF_OPEN_DEFAULT_2026-11-17.md

## Workstream P1-B — FINAL geometry: image ABOVE video, shared boundary and reversible collapse

**THIS OVERRIDES EVERY EARLIER OVERLAPPING-PANELS / VIDEO-ON-TOP / FLOATING-RECTANGLES DESCRIPTION.**

- One ordered vertical stack in Shelf File Explorer: **Explorer behind/above → IMAGE/DOCUMENT preview in the UPPER region → VIDEO preview at BOTTOM**. They do NOT overlap. If both are first opened, initialize as **50% image / 50% video** of the available preview area.
- Two horizontal drag positions within entire Shelf: `I` = IMAGE TOP edge; `V` = VIDEO TOP edge, which is also IMAGE BOTTOM edge. Shelf bottom is `H`. Maintain `0 ≤ I ≤ V ≤ H`. Image uses `I..V`, video uses `V..H`. **Moving V necessarily adjusts the area available to the image and video**; it is not separate unconstrained rectangles.
- Drag VIDEO's TOP boundary **DOWN to bottom (V=H)** → video **COLLAPSES**, not closes. Leave its grabber accessible. Drag it UP later → SAME video returns, with position, source, playback and lease preserved. If only video exists, V can run top→bottom, including full video and full collapse.
- Drag IMAGE's TOP boundary **UP (I=0)** → image expands only into the area above video. **Image fills entire Shelf ONLY when image top at Shelf TOP (I=0) AND video top at Shelf BOTTOM (V=H)**. Drag I down to V → image collapses but is not closed; its handle remains usable.
- **ONLY that panel's X button closes the preview**. Resizing, dragging and collapsing never close either panel or implicitly stop/reload video; explicit Stop playback (if present) is a separate action. Each collapsed panel must be easy to drag back open.
- No old fixed 90/120/220px caps or top boundary constrained by file-list/header/toolbars; preview region may occupy full actual Shelf height, with accessible handles and exit/retraction.
- Click IMAGE preview once, Left/Right → non-video previewable files in current directory, skipping videos. Click VIDEO preview once, Left/Right → video files only. Honor directory sort/filter/pagination and native video seekbar controls when focused. Reuse single video player and release superseded tickets when switching video, not when resizing.

**Required demonstration:** initial equal image/video halves; drag video top edge down to bottom (collapsed video); drag image top edge up to top (full-height image); drag video's bottom grabber up to restore video, image shrinks to remaining upper space and playback continues; only X actually closes. Likewise collapse/re-expand lone video without restart.

See https://github.com/thanks-cohn/chute/issues/30 and Necessary-fixes/FOCUSED_PREVIEW_NAVIGATION_TOP_NONVIDEO_BOTTOM_VIDEO_LEFT_RIGHT_2026-11-17.md.

## Workstream P1-C — Compact More menu instead of clipboard row
- Remove full permanent six-button Copy toolbar, its divider and consumed height at every window size.
- Replace with ONE compact **More ▾** popover listing: Copy; Paste; Review previous copy; Verify destination; Cancel copy; Dismiss after review. Keep commands and underlying receipt correctness unchanged, preserve Ctrl+C/Ctrl+V and right-click.
- Reference: Necessary-fixes/EXPLORER_COPY_ACTIONS_MOVE_TO_MORE_DROPDOWN_2026-11-17.md

## Workstream P1-D — Truthful document/image preview failures
- Differentiate unsupported format vs oversize vs decoder/file-changed vs BUSY vs permission. Current UI conflates unavailable and >64 MiB with a generic warning; server image cap 32 MiB, text cap 256 KiB, thumbnail cap 16 MiB; inventory MIME/extension, test supported images and safe downscaling/partial preview where practical.
- Keep strict safe decoding and bounded memory, not unbounded whole-file reads. Explicit alternatives for genuinely unsupported types only.
- Reference: Necessary-fixes/EXPLORER_PREVIEW_GENERIC_UNSUPPORTED_OR_OVERSIZE_ERRORS_2026-11-17.md

## Execution instructions / verification

1. **Phase 1 diagnostic baseline:** study the current implementation, handoff and these Necessary-fixes; reproduce and report root causes. Include comparison to the working historical worker where relevant, without touching GOLD.
2. **Phase 2 implementation:** make narrowly targeted code changes in a **new named repair branch** based on the verified TEST source; use tests and proof of real behavior. Do not modify original saved/installed archives or reference tags.
3. **Phase 3 acceptance:** at least two machine classes (4-GB Windows and fast high-end Windows), with initial equal image/video previews, draggable image-top and shared image-bottom/video-top boundaries, no overlap, reversible collapse, X-only close and full Shelf height, simultaneous pinned video/image/list navigation, 10s and full-length movies, source authorization, switching Turbo/Balanced repeatedly, clicking movie policy checkbox in both, actual Windows picker, Ctrl/Cmd keyboard navigation per pane, History Shelf Open-to-location, **extension popup-only** Copy Image into Windows Paint, **unchanged** Shelf History image preview, Shelf File Explorer preview expansion, and More menu. Mandatory **two-hour real Windows endurance** with ~30 MB MP4 working at start and after two hours, accompanied by video/image browse stress and memory plateau measurements; longer repeated cycles as needed. Observe worker/Chrome RSS and private bytes, active tickets, queue time, per-lane BUSY, p95 interactions and memory trend.
4. **Phase 4 package:** passing Linux/Windows tests, real Chrome + native host + media protocol tests, redacted log/counters/screenshots, high-end vs low-end Turbo benchmark, source commit, SHA256SUMS, matched Windows installer+native helper+Chrome ZIP, documented safe isolated install and rollback. No production merge/release or GOLD certification before explicit owner signoff.

**Strict priority:** P0 reliability, control plane and data/consent correctness before visual polish. No accidental feature creep, no lowering security boundaries, no deletion of user History, files, archives or active GOLD worker.
