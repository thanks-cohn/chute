# CHUTEY — Mascot presentation module and File Explorer preview reliability direction

**Date:** 2026-11-16  
**Status:** Project direction and bug specifications, NOT implemented or verified  
**Branch:** `fix/chutey-popup-stable-first-paint-2026-11-16`  
**Baseline:** Extension source `45dc8f034045c8807f5b712f7e8915c7ba76313a` paired with installed Windows Chute binary SHA-256 `C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`. Preserve and test against this pairing; do not alter native worker casually.

## A. Dedicated module for default / placeholder mascot images and animated backgrounds

**Requirement:** The default image displayed on gallery cards (mascot / fallback / placeholders) should be managed by its own reusable presentation module, instead of scattered hard-coded image paths or fallbacks. The animation visible *behind* the displayed image must be a separately configurable subsection of the same module.

Proposed boundaries (names are illustrative; inspect code before deciding paths):
- `defaultImage` / `fallbackImage`: chosen default mascot or image and asset resolution, with reliable packaged fallback.
- `backgroundAnimation`: current mathematical/spinning decoration behind the mascot; separately enabled, styled, and controlled, not coupled to thumbnail decoding.
- `backgroundColor`: user-selectable color in Options/Settings, applied to placeholder/card background surfaces as appropriate.
- Config persistence, migration, preview, and reduced-motion support.

**Acceptance:**
1. Default images render even when thumbnails fail or have not arrived; do not substitute a mascot for a verified real thumbnail after decode.
2. The decorative animation appears behind the fallback image, not in front; when a genuine thumbnail is fully visible, animation behind it must not flash or leak through.
3. Users can choose a background color in Options, with an accessible color control and a reset-to-default action. Persist across popup/Shelf restarts; validate and migrate settings. No arbitrary external asset execution.
4. Background animation has a dedicated configuration/control surface. Keep animation separate from popup first-paint performance; do not add blocking work.
5. Defaults remain visually consistent in popup, Shelf, and other relevant Chutey surfaces unless explicitly configured otherwise.
6. Keep thumbnails progressive with stable geometry and respect reduced-motion preferences.

## B. CRITICAL BUG: File Explorer image Open fails

**Observed:** When the user tries to open an image in File Explorer / from preview, Chutey reports **"Expected a file handle."** Images are not opening successfully.

**Investigate rather than assume root cause:** Trace image identity, selected folder/file, native handles, handle issuance/expiry, authorization, bridge payloads and response schemas, and the code path behind Open. Distinguish an image-preview URL or Chute item ID from a valid native filesystem file handle. Do not fabricate success or silently fall back to the wrong file. Avoid making changes to the current proven executable until cause is established and compatible recovery is prepared.

**Acceptance:** Images that should open through Windows File Explorer do so using a valid authorized file identity/handle; invalid or stale handles have explicit, actionable recovery. Opening, revealing, or selecting must not confuse one operation with another. Automated API and Windows integration regression tests cover this exact error.

## C. CRITICAL: Bottom-anchored OVERLAY preview — NEVER resize the file list

**Latest owner clarification overrides previous dock/split-pane language.** The preview currently appears between file entries, causing reflow and apparent size changes. Remove that behavior entirely.

**The preview is a bottom-anchored, topmost overlay ON TOP OF the existing File Explorer content. It is not an in-flow pane and must not resize, shrink, move, repartition, or remeasure the directory list, file cards, scroll container, tab strip or navigation controls.** Its geometry and visibility are independent of the content beneath it.

- Initially show the preview at approximately **one third of the Shelf's available height**, anchored flush to the bottom and overlaying the file content beneath. The file list itself retains **exactly the same layout and dimensions** whether the preview is open, resized, expanded, or closed.
- Position the preview outside the file row/grid, in its own fixed/absolute overlay layer associated with the Shelf viewport. It must never be inserted between list entries.
- The **top edge is a draggable horizontal resizing handle**. Drag it upwards to grow the overlay; drag it downward to shrink. This changes only preview overlay geometry and **never changes the layout of any other element**.
- Allow dragging the top edge **all the way up to the workspace tabs**. The **History** and **File Explorer** tabs must remain visible, accessible and unobscured at maximum height.
- Preserve the top-left Chutey branding and any persistent navigation toolbar controls (Back, Forward, Up directory, Refresh, Home) that occupy the protected header region; the preview may overlay file content below but not cover the protected controls.
- **Expand** instantly grows to the maximum allowed overlay height; a restore action returns to the previously selected overlay height; **X** closes the preview, revealing file content already underneath with **no reflow**.
- Keep the last user-selected divider height as appropriate. Any existing size slider must be coherent with direct drag-to-resize; it must not also resize the file list.
- Selected image/video aspect ratio, decoding, selection changes, arrow-key navigation, playback and metadata must **never change the preview's height, width, or shape**. Contain media within the overlay (letterbox using object-fit:contain).
- The preview is visually topmost relative to file entries, with deliberate layering. Its own controls remain clickable without blocking the persistent tabs/navigation above it.
- Support keyboard-accessible resize and reduced motion; no entrance animation in this Codex run.

## D. Expanded overlay — stops at the persistent tabs/header

At full height the preview overlays nearly the whole Shelf content region **without resizing anything beneath it**. The top boundary stops at the History/File Explorer tabs (and must preserve all persistent header/navigation controls above or alongside the protected region). It is NOT a browser fullscreen modal. Expand and drag-to-top are equivalent maximum-height operations.

## E. Arrow keys always navigate the directory, preview follows

- While the overlay is at one-third height or fully expanded, **Up/Down should continue moving through the directory as though no preview pane exists**, updating the currently selected file's preview.
- The preview must not hijack folder-list selection, create duplicate arrow-key handlers, insert additional file-list entries, or change ordering.
- Arrow keys in focused text fields, dropdowns, sliders, resizer handles or video controls should retain their expected control-specific behavior; otherwise keep the directory navigation owner.
- Navigate quickly among portrait/landscape/square images, videos, PDFs, non-media entries and broken files without preview geometry shifts.
- No stale asynchronous result may show media for a formerly selected file: use request tokens/cancellation, and release unneeded object URLs, streams and media decoders.

## F. CRITICAL: File Explorer must actually see images and video

**User requirement:** Chutey's local File Explorer must display real media previews. Merely showing a filename, generic icon, or a failing `Open` action is unacceptable.

### Images
- Show actual images in the preview overlay, preserving proportions using `object-fit: contain` or the native equivalent.
- Support common formats that the chosen renderer can decode (at minimum PNG, JPEG, GIF, WebP, and BMP; evaluate SVG, AVIF, HEIC and others with explicit capability reporting).
- Animated images should animate if supported, with appropriate loading and reduced-motion handling.
- Use local, authorized file identities/handles and existing local native APIs; avoid converting local paths to unsecured public URLs.
- Decode off the critical UI path; show an immediate stable placeholder, then swap the image in **without changing pane geometry**.
- Display an honest error if the file is missing, corrupted, permission-denied or its format unsupported, without blanking the folder list.

### Videos
- Show a poster frame or video preview for supported local video files and offer **Play/Pause, seek, time/progress, and mute/volume** when the renderer supports playback.
- Start video **paused**, not autoplaying on every arrow-key selection.
- Keep video fitted inside the same preview overlay, with no resizing on metadata load or aspect ratio changes.
- Support common browser/native codecs as actually available (for example MP4/H.264 or WebM), and identify unsupported containers/codecs explicitly; never promise universal decoding without a decoder backend.
- Prefer bounded local streaming/range access instead of loading entire large videos into browser memory. Keep worker and scrolling responsive; stop playback/release resources when navigating away.

### Native bridge / error handling
- Trace the existing `Expected a file handle.` error end-to-end. An item ID, URL, path, preview token and native file handle are not interchangeable. Establish the correct authorized handle and file-byte access contract before changing the native worker.
- Separate **Preview**, **Open in default application**, and **Reveal in Windows Explorer** actions and test each independently.
- Preserve correct error states and access checks. No success notification until the requested action actually succeeds.
- No destructive changes to the presently identified worker binary; test a separately packaged modified worker if native changes are necessary.

### Acceptance and regression tests
1. Open an image: it renders in the bottom-third overlay. Open a video: it has a real poster/playback (if supported), not a generic image fallback.
2. Up/Down rapidly traverses a mixed folder; previews update to the correct file, the list stays scrollable, and **the pane never changes size**.
3. Drag the overlay's top divider from approximately 1/3 height toward the tabs; use Expand, restore, and X. Verify that neither directory layout, scroll container geometry, nor persistent tabs/nav controls change.
4. Broken/missing/unsupported media shows a clear local error and keeps layout and navigation intact.
5. Large media or slow decoding does not freeze the browser popup, Shelf, or Windows worker.
6. Verify opening/revealing in Windows works separately from previewing, including reproduction and resolution of `Expected a file handle.`.
7. Validate actual behavior in Chrome on Windows with both native bridge connected and disconnected; automated unit/UI tests alone are insufficient.

## G. UX BUG: misleading global trash icon in File Explorer

**User report:** Selecting an entry in File Explorer and pressing the top-right trash button appears to do nothing. The control's purpose is unclear.

**Source inspection:** `extension/shelf.html` declares `#clear` with title and accessibility label `Clear Live Chutey`, shared above History and File Explorer tabs. `extension/shelf.js` binds its click to `POST /api/clear`, then refreshes History. It is **not connected to the Explorer selection** and does not delete the highlighted local file.

**Required UI correction:**
- Remove or hide this global Clear Live Chutey control when the File Explorer tab is active; expose the live-basket clear action only where its scope is obvious.
- Give the operation a plain-language label and an appropriate confirmation so users understand what will be emptied; keep dated history protected.
- Never reinterpret the existing `/api/clear` as deletion of selected local files.
- If actual filesystem deletion is offered in a future task, implement it as a separately permissioned action with clear selected-file scope, confirmation, and recoverability where supported.
- Test History versus File Explorer tab switches, empty basket, populated basket, and native disconnection; no silent or misleading outcomes.

**Status:** Design correction documented; existing code not modified by this document.

## H. CRITICAL: Grid View must show actual image thumbnails

**User clarification:** File Explorer's **Grid View** must display real, smaller versions of local images **inside their own file tiles**, independently of whether the bottom overlay preview is open. Generic icons are only acceptable as loading, unsupported-format, or failure fallbacks.

**Existing code:** `extension/explorer-view.js` already tries to queue visible-image thumbnail requests through an `IntersectionObserver` with three concurrent jobs, calling `api.content(row, {thumbnail:true})`. It replaces `.ex-icon` with an `<img>` after receiving bytes. The observer only registers rows whose `row.mime` matches a narrow image MIME regex; errors are swallowed. `extension/explorer-view.css` sizes grid thumbnails to roughly 64×64 pixels. Thus there is **partial thumbnail code, but the reported user-visible behavior is not acceptable**. Do not assume the preview overlay alone will repair the grid.

**Required behavior:**
- Image files in Grid View show actual miniatures cropped/contained consistently within stable tile geometry; preserve filenames and selection styling. List View may also use small thumbnails without changing row height.
- Show placeholder/type icon immediately while image bytes load, then replace it upon successful decode. Never hold up the grid's first paint waiting for images.
- Fix the full thumbnail path: native file handles, MIME determination when absent or generic, authorized bytes/thumbnail API, decoding errors, and URL lifetime. Classify supported image extensions as fallback when MIME is missing.
- Prefer true small decoded thumbnails, not loading entire large originals merely to shrink them visually. Request only visible tiles with bounded concurrency, resource limits and cancellation on folder change.
- An unsupported format or failure leaves a truthful file icon and displays a diagnostic, not a silently indefinite empty tile. Do not confuse preview/Open/Revealing actions with thumbnail retrieval.
- Video entries may show a poster-frame thumbnail where supported; videos still play only in the separate bottom overlay and do not autoplay in the grid.
- Grid thumbnails **must not invoke, insert, resize, or depend on** the preview overlay. Arrow navigation remains in the file list, independent of the overlay.
- Validate populated folders with small/large PNG/JPEG/GIF/WebP images, absent or octet-stream MIME, broken files, videos, scrolled grid, rapid navigation, and native-worker disconnected/reconnected.

**Status:** Required investigation and implementation; not yet fixed. Preserve the current known working installation.

## I. FINAL PHASE — harden the verified native worker for high-throughput local-to-browser streaming

**Owner requirement:** After completing the UI, Grid View, image/video preview, and file-handle repairs in this Codex run, improve the **current established Windows Chute worker implementation** to handle heavy concurrent local-file, image, and video streaming workloads with the greatest *measured sustainable throughput and reliability* achievable on the user's hardware. Symptoms reported under load include popup flicker, failed operations and worker instability; those are reports, not proven root causes.

### Immutable reference / safe development boundary
- Current installed executable: `C:\Users\jg202\AppData\Local\Programs\Chute\Chute.exe`.
- Exact SHA-256: `C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`.
- Matching published binary: https://github.com/thanks-cohn/chute/releases/tag/chute-test-20261104-0529-CST (`Chute-Windows-Explorer-TEST.exe`).
- Chrome extension source reference: `45dc8f034045c8807f5b712f7e8915c7ba76313a`.
- Preserve original installer, executable, source commit and archive docs. **Never overwrite the known-working installed worker during development.** Develop the enhanced worker from its identified source lineage on an isolated branch/build; test independently; maintain explicit rollback and data compatibility.

### Architecture and capability targets
1. **Real local-to-browser byte streaming:** Serve authorized file ranges/chunks from disk to a local loopback browser client; never require reading complete large files or videos into memory. Implement standards-compliant HTTP `Range`, `206 Partial Content`, `Content-Range`, `Accept-Ranges`, `Content-Length`, HEAD and seek behavior where appropriate, including correct rejection of invalid ranges; preserve file integrity and authorization at every request.
2. **Concurrency without starvation:** Sustain several simultaneous media playback/seek operations, thumbnail requests, directory listings, metadata reads and drag/drop transfers. Separate latency-sensitive control/health traffic from expensive decode and transfer work; use bounded worker pools, concurrency limits, backpressure, cancellation and fair scheduling, rather than unlimited threads or queues.
3. **Memory and disk discipline:** Limit buffers, cached thumbnails, decode jobs, per-request memory and total memory consumption. Avoid unnecessary copies, file descriptor leaks, Blob/Object URL leaks, temp-file growth and OS paging. Respect the user's historically constrained Windows machine (approximately 4 GiB RAM and sometimes very little free C: space); do not set arbitrary memory/cache budgets without measuring.
4. **UI isolation:** Heavy native activity must not block or distort popup first paint, Explorer rows, preview overlay, controls or responsiveness. Worker/network stalls should lead to bounded loading/timeout states rather than image flicker, blank panels or misleading completion feedback.
5. **Resilience and observability:** Separate native process death, browser MV3 sleep, native messaging wake failure, loopback transport error, permission/handle expiration, file read errors, cancellation, media decode limitations and client disconnects. Provide truthful API diagnostics, bounded retries/backoff and recovery without duplicate-launch storms. Do not assume the worker is the source of flicker without instrumented evidence.
6. **Security:** Keep loopback-only transport, enforce scoped authenticated/authorized file handles, path traversal prevention, URL/token lifecycle, and origin constraints. Do not expose arbitrary filesystem bytes to websites or send local file locations to cloud services.
7. **Media throughput:** Lazy/priority thumbnail generation and caching with bounded concurrent jobs; responsive full-image viewing; video streaming/seek on supported formats/codecs with range requests and paused-by-default playback; release resources promptly when selection changes or preview closes.
8. **Integrity and compatibility:** Preserve previously working Chutey functionality, user data/history, exact source file identities, native host registration and extension/native protocol parity. Browser UI and native API must agree on valid file handles and failure states; no fake "success."

### Baseline measurements and mandatory stress suite
Record the current binary's results **before** optimization, then compare the enhanced worker under exactly the same conditions. At minimum measure:
- throughput MiB/s, p50/p95/p99 response latency, time-to-first-byte, video startup/seek latency, UI interaction latency;
- process memory (working set and peak), CPU, open handles, disk/temp usage, timeouts, error rate, dropped/aborted operations, process restarts and recovery duration;
- 1/4/8/16 (and hardware-appropriate additional) concurrent file/media requests, different file sizes including multi-GiB sparse/test files without duplicating them, cached/cold paths, repeated random seeks, rapid folder scrolling and thumbnail generation;
- simultaneous local media streaming + Explorer traversal + popup open/close + Shelf usage; native restart, browser restart, Windows sleep/resume and disconnect fault injection;
- extended soak tests with timestamped evidence, realistic workloads and no file or history loss.

**Acceptance:** No worker crashes, unbounded resource growth, silent data corruption, missing files or unrecoverable stalls in the defined feasible stress scenarios; correct range semantics; truthful errors at resource limits; UI remains usable. Report observed sustainable throughput and concurrency at the user's actual hardware limits; no unsupported claims of unlimited throughput or perfect stability. Regression testing must include the current worker behavior and verify the improved version is **not worse** on core critical paths.

### Completion/promotion protocol
- Implement user-facing fixes first, and make the native throughput/stability work the **last dedicated stage**; do not mix risky native rewrites into UI regression debugging.
- Produce separate reproducible Windows build and test artifact with commit, SHA-256, architecture, benchmark results and recovery instructions.
- Verify actual Chutey functionality, Chrome integration and local history integrity on the test pairing, then repeat stress/soak tests.
- Do not replace the currently installed worker or alter preserved GitHub Releases/tags as a side effect of Codex development. Promote only after explicit owner approval and evidence-backed comparison.

## J. Product performance goal: sustained full-length high-bitrate media

The owner wants Chutey reliable enough to stream and watch a **whole 4K-class movie** from local disk to the browser, not merely test a short video clip. This is a stress/performance target, not a specific film. Long-term, Chutey should be a credible everyday local media player.

- The **exact CURRENT installed Windows worker** (SHA-256 `C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`, matching the archived November 4 TEST release) is the engineering foundation. Trace its source lineage; preserve the installed binary and improve its implementation incrementally in isolated, separately packaged builds.
- Provide authenticated loopback local-file streaming with byte-range requests, correct content types/lengths, seek and pause/resume behavior, bounded buffering/read-ahead, and cancellation. Never load an entire movie into RAM or duplicate it on disk just to play it.
- Keep sustained playback smooth under concurrent file browsing, thumbnail jobs, UI interactions and bulk transfers, using fairness, priorities and resource caps.
- Browser codec/hardware decoding is separate from the native worker's byte throughput; report unsupported formats honestly.
- Test full-duration high-bitrate playback, repeated seeks and simultaneous workloads. Measure stalls, seek/startup latency, buffering, sustained MiB/s, CPU, memory, handles and responsiveness. The target is no Chutey-induced stalls on capable hardware, not an unconditional guarantee of universal 4K decoding.

## K. Product performance goal: high-speed robust large-batch file engine

Chutey is intended to become a **serious alternative to Windows File Explorer**, with powerful reliable local transfers and moves—not merely a preview UI.

- Handle large individual files, many thousands of files, complete folder trees, multi-select, drag/drop, authorized copy/move/rename/folder operations, and long/deep paths.
- Use efficient same-volume rename/move when possible. For cross-volume move, copy and verify the destination **before** deleting the source; never delete originals after uncertain or failed copies.
- Offer an observable durable batch queue with per-item and whole-job progress, bytes/sec, pause/resume/cancel/retry, conflicts and clear final receipts. Provide crash-safe checkpoints and resumable/idempotent workflows where possible.
- Respect locks, permissions, disk-full, file collisions, symlinks/junctions, network drives and interrupted operations. Avoid path traversal, unbounded buffering, copy loops and accidental destructive operations.
- Employ bounded concurrent I/O and fair scheduling: lengthy copies must not block the popup, Explorer selection, image thumbnails, the worker health endpoint or active video playback.
- Benchmark throughput (MiB/s and files/s), integrity, resource use and recovery against the archived native worker and Windows Explorer on matched workloads; never claim superiority without real evidence.
- This is a long-term product ambition. Implement and validate foundation functions in phases rather than pretending a complete Explorer replacement is already available.

## L. Movie Mode — dedicated third workspace tab, built LAST

The Shelf's persistent tabs should ultimately be **History | File Explorer | Movie Mode**. Movie Mode is a dedicated full-content-area local video/media player, separate from File Explorer's smaller bottom overlay preview.

- Select an authorized local movie/video/media file from File Explorer or use a Movie Mode file chooser. Preserve a safe handoff of the file handle/identity to the Movie Mode player.
- Use the worker's efficient range-based local streaming APIs, designed and stress-tested **before Movie Mode UI implementation**; do not duplicate media-byte transfer logic in the UI.
- Provide a properly sized player with play/pause, seeking, timeline, elapsed/total time, mute/volume, fullscreen where supported, file information and understandable buffering/errors. Start paused unless user explicitly requests autoplay.
- Prefer browser hardware-supported codecs and report unsupported formats accurately; do not promise every format or implement unrequested automatic transcoding. Support full-length playback with stable controls and media cleanup when switching files/tabs.
- Preserve tabs and coherent navigation; offer an explicit "Watch in Movie Mode" entry from Explorer media selection. When leaving Movie Mode, specify and test whether playback pauses or continues rather than accidentally leaking playback.
- Do not let Movie Mode or an active stream starve file transfers, directory listings or the popup. Media playback must coexist with the file engine.

## Movie Mode media adapters: MKV and FLV are explicit future priorities

**Both MKV (Matroska) and FLV (Flash Video) must be supported by the modular adapter design.** MP4 and WebM may be initial working adapters in Phase 3, but must not be hard-coded as the only possible formats.

- **MKV:** Anticipate large movies, multiple audio tracks, subtitle tracks, variable codec combinations, track selection, seeking, chapters and metadata. Probe actual streams, not just a `.mkv` extension. Prefer direct playback where supported, then streaming remux to a browser-compatible container when codecs allow, then optional transcoding.
- **FLV:** Anticipate archived Flash Video files with older H.264/AVC, Sorenson Spark, VP6, MP3, AAC, or other legacy combinations. Probe codecs; remux where compatible, decode/transcode only as required. Do not assume modern browsers natively support FLV.
- The core worker must expose format-independent authorized byte-range reading, streaming, cancellation, bounded resource use and file metadata. A media-adapter registry/capability contract chooses playback strategy without altering the core file engine.
- Expose versioned APIs for probing, preparing, starting, seeking and closing playback sessions; ensure track metadata and explicit unsupported-codec responses. Keep security and playback stability independent of adapters.
- Include a lightweight test/dummy adapter proving that another format can be registered without modifying the worker streaming core. **Actual MKV and FLV playback adapters may be implemented later**; document the missing support honestly.
- This is primarily a **Movie Mode** extensibility requirement, not a demand for every legacy format in the smaller File Explorer preview overlay.
- Do not let future MKV/FLV support force another worker rewrite. Some additions may still require adapter-specific libraries, codecs, packaging and extensive compatibility tests.

## Mandatory Codex execution sequence (strict)

**PHASE 1 — Appearance / Explorer behavior FIRST.** Finish stable first-paint popup (placeholders first, no entrance animation); mascot/default image and background module/settings; Grid View real image thumbnails; correct image/video previews and native `Expected a file handle.` issue; bottom-anchored **overlay** preview at one-third Shelf height with draggable top edge, Expand/restore/X, no file-grid reflow, unchanged Up/Down directory navigation; correct trash-button scope. Validate these independently on the current working pairing. Avoid unnecessary native binary changes while tracing any API defects.

**PHASE 2 — Current-worker hardening SECOND.** Only after Phase 1, benchmark and strengthen the exact established current-worker architecture in isolated test builds for resilient streaming, local files, high-throughput large batches, bounded memory, stability and crash recovery. **Design the worker's API/architecture in anticipation of Phase 3 Movie Mode from the outset.** Implement byte ranges, seeking, sustained playback fairness, priority scheduling, compatible media interfaces, authenticated file handles, cancellation and diagnostics now; do not wait for the Movie Mode tab to discover those requirements. Stress/soak tests and regression gates must pass before proceeding.

**PHASE 3 — Movie Mode LAST.** Once the strengthened worker is demonstrably capable and passes tests, build the third `Movie Mode` tab and wire it to the already-designed media APIs. Test whole-film playback, seek, switching tabs, concurrent bulk transfer and recovery. Keep the original worker and archived extension safe; owner approval is required before any installed worker replacement.

**No future popup opening/corner animation in any of these phases.** Fix only the unwanted janky opening.

## Implementation order and safety gates

Use the **strict three phases above**: appearance/Explorer first, native worker second (explicitly Movie Mode-ready by design), Movie Mode UI last. Do not parallelize risky native rewrites with the appearance debugging. Preserve the immutable installed worker, documented release checksums, existing source baseline and user data throughout. All replacement binaries require reproducible Windows build artifacts, tests, documented rollback and owner-approved promotion.

## Out of scope for this Codex run: ALL popup entrance animation

**DO NOT implement the four-corners-first animation, nor any other new opening animation or staged reveal.** Current requirement: stable, fully laid-out popup shape from first paint; placeholders first; image decode later; zero unintended flicker/jank. The four-corners idea is deferred to an entirely separate future project.
