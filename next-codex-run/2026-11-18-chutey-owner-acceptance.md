# NEXT CODEX RUN — 2026-11-18 (America/Chicago)

**Owner instructions recorded:** Wednesday, November 18, 2026 (CST)  
**Repository:** `thanks-cohn/chute`  
**Starting branch:** `fix/chutey-p0-playback-starter`  
**Owner local TEST checkout:** `C:\Users\jg202\Desktop\Chutey-Phase1-TEST`  
**Priority:** Necessary owner-acceptance repairs, not experimental polish  
**Status:** REQUIREMENTS ONLY — this document does not implement, release, install, or test the changes on the owner's computer.

## Owner's reported defects and latest requirements

1. **Popup Copy Image is much too slow:** Chutey shows `Copying original image pixels…` for far longer than Chrome's native right-click `Copy image`. It does eventually copy, but the owner expects near-native speed, not a noticeable Python/worker pipeline delay.
2. **Two draggable preview boundaries are missing:** The upper image/document pane and bottom video pane must form ONE bounded vertical stack in the Shelf File Explorer. BOTH edges must move to the **absolute top and absolute bottom of the entire available Shelf preview area**, without old 90/120/220px or toolbar/workspace caps; no overlays or independent overlapping rectangles.
3. **Opening semantics — latest owner correction:** **Double-click** an image/video/file in Chutey File Explorer opens the supported media **inside Chutey's preview**. **Right-click → Open Native** launches the file in the Windows-associated native application. Single-click may select/focus the file; it is **not** the command for native Open. Keep **Reveal / GO TO** as a separate file-location action.
4. **Selecting a folder automatically enables media playback:** Once the user has explicitly selected/authorized a folder in Chutey, that authorized folder should immediately be usable for image, audio and video browsing/preview/playback without a **second approval/prompt/picker** just for playback. **Automatic media-ready folder behavior is the default ON**, with a Settings toggle so the user can turn it OFF. Do not silently enlarge access to non-selected folders or grant write access.

5. **New crash report, Nov 18 (P0):** The owner reports that this very Chutey TEST version crashed today. Root cause and exact failing process remain unknown. Treat as an urgent investigation requiring diagnostics, controlled reproduction and regression coverage; see [Issue #32](https://github.com/thanks-cohn/chute/issues/32).

## A. Fast native-feeling Copy Image — small Chrome extension popup

**Current code path:** `extension/popup-gallery.js` runs `nativeSession(false)` -> `locate_saved({id})` -> `clipboard_copy_image({handle,identity,user_gesture:true})`. The worker `src/chute/explorer/clipboard.py` uses Pillow to decode and rebuild CF_DIB, CF_DIBV5, PNG and verifies clipboard bytes. This is not evidence that Python is inherently slow; measure round trips, disk/permission latency, decoding, multi-format encoding, Windows clipboard ownership and low-memory effects.

**Required correction**
- For the popup's **Copy Image** action, prefer Chrome/Chromium's supported, authorized clipboard write when feasible, e.g., `navigator.clipboard.write` with an `image/png` `ClipboardItem`. This is **actual full-resolution image pixels**. Do not copy a filename, URL, saved-item identifier, tiny thumbnail, or compressed arbitrary textual representation.
- Measure click-to-clipboard-ready p50/p95 across common PNG and JPEG sizes on owner-like low-memory hardware. Avoid unnecessary round trips and redundant multi-format image conversions. If decoding/conversion is unavoidable, do it with bounded memory, avoid caching full-size pixels indefinitely and release resources promptly.
- Verify extension context, content security restrictions, foreground user activation, actual Chrome permission behavior, and Paint compatibility. Async fetching before `navigator.clipboard.write` may lose user activation; test a real Chrome extension popup, not just fake DOM fixtures. A browser clipboard write resolution does not establish a later Paste.
- Use existing authenticated/guarded native clipboard API as an **honest fallback** where the browser fast path cannot copy safely. Do not blindly perform both; no double-writes and no false success banner when uncertain.
- **Keep** `Trash It!` as the separate non-destructive live-removal action; Copy Image must never hide, delete, recall, or change dated History. Keep expanded/maximized preview visible after copy. Show actionable failure messages; never silently replace originals or downsample to achieve speed.
- **Important distinction:** The owner is describing the **small toolbar extension popup** for Copy Image. The separate Shelf File Explorer's copy controls are different features.

**Acceptance:** A saved PNG/JPEG on an authorized real Windows 11 + Chrome machine -> right-click thumbnail, expanded image and maximized popup -> Copy Image -> paste actual original pixels into Paint; no delete/preview closure; compare latency with Chrome-native Copy image on same source. Test clipboard busy, low RAM, PNG alpha, JPEG, large images and user activation loss. Keep instrumentation with per-stage elapsed milliseconds for real regressions.

## B. Full-range, touching, independently draggable image/video preview panes

**Primary contract:** GitHub Issue #30 — https://github.com/thanks-cohn/chute/issues/30  
**Related detailed owner note:** `Necessary-fixes/FOCUSED_PREVIEW_NAVIGATION_TOP_NONVIDEO_BOTTOM_VIDEO_LEFT_RIGHT_2026-11-17.md`.

From TOP to BOTTOM within the whole Shelf File Explorer preview surface:
- Folder/file Explorer underneath any previews
- **Upper IMAGE/DOCUMENT** preview
- **Lower VIDEO** preview anchored at Shelf bottom

There are two independent effective horizontal draggable coordinates:
- `I`: **IMAGE TOP edge**
- `V`: **VIDEO TOP edge = IMAGE BOTTOM edge**
- `H`: Shelf bottom
- `0 <= I <= V <= H`

**Do not constrain either handle to the center area or the old file-list/workspace rectangle.** The user explicitly reiterates: the grips can reach **all the way UP** to `0` and **all the way DOWN** to `H`, covering the full Shelf vertical range if desired.

**Rules**
- Both first opened: the two preview heights are **50/50** of their combined initial available preview region, touching without overlap. Define and test how that region initially opens relative to Explorer; both have equal heights.
- Drag video grip UP: video grows while image shrinks; drag video grip DOWN to `H`: **video collapses but remains open**, with visible draggable handle at bottom. Pull it UP again: restore the SAME player/source/ticket/seek time, without reloading or stopping. Video may occupy full Shelf when `V=0` and upper image is collapsed.
- Drag image top grip UP to `0`: image grows upward. Drag it DOWN until `I=V`: image collapses without closing; handle stays visible and can be dragged back.
- Image uses **full Shelf** only when `I=0` and `V=H`, i.e., video is collapsed. Never let image occupy the video's visible region. One panel changing height adjusts its neighbor; two panes do not overlap or steal pointer events.
- If only one pane is open, it may expand through the entire Shelf, collapse to zero with a usable grabber, then re-expand.
- **Only X closes** and releases content/tickets/preview state. Drag/collapse/resize/search/focus changes never implicitly close or reset a preview; video continues playing unless user explicitly pauses or stops. If there is a separate Stop button, its meaning must remain distinct from X and collapse.
- Handles: accessible with mouse and keyboard, pointer capture, stable z-order, large enough to grab at extreme edges, announce effective size; no dead-end handle at 0% or 100%. Persist sensible user-defined ratios and restore them across ordinary Shell redraws without leaking private file paths.
- Focused arrow navigation: click upper pane -> Left/Right cycles **non-video previewable** files in current directory; click lower pane -> Left/Right cycles **video only** in current directory; respect sort, filter, pagination; keyboard when focused on actual video native controls must still allow seek/volume. No accidental file movement or external Windows Explorer launch.
- Keep browsing and preview playback independent, clean stale tickets on actual close, no 429 BUSY storms, no unbounded buffering on a 4 GB computer.

**Current source evidence:** `extension/explorer-view.js` creates an `.ex-resize` for the upper preview and limits it to a workspace-derived max and min 120 px. The pinned lower `.ex-pinned-player` lacks its own resize grip. `extension/explorer-view.css` hard-codes `--ex-pinned-height:clamp(90px,33%,220px)`; `.ex-preview` is constrained above it. The single-gallery iterator includes mixed file types. This is unfinished, not a proven user misconfiguration.

**Acceptance:** Full-Shelf 0..H drag travel; video grip DOWN -> collapse -> drag UP -> same playing video restored; image grip UP to top, video grip DOWN to bottom -> full-image coverage; reverse; test narrow ~300-400px Shelf, full screen, touch/pointer and keyboard. With both panels open they never visually overlap, both are usable; only X closes. Use real Chrome DOM/screenshots, not CSS-only snapshots.

## C. Double-click inside Chutey; right-click → Open Native (owner correction, November 18)

**This newer instruction supersedes the earlier assumption that one click must open the preview.** Owner clarification: "the opening inside Chutey is true for double clicks but if they right click and click Open Native, it will open the native interface."

**Current code conflict:** `extension/explorer-view.js` binds `node.ondblclick` to configurable `fileAction(row,"open")`, which can invoke the Windows-associated application when the saved Open target is `system`. It also opens on single click only when the upper preview was already visible. The context menu currently has generic `Open` and `Preview` actions but lacks a clearly separate `Open Native` command.

**Required behaviors and UI labels**
- **Single-click an image/file** — selects/focuses its row. If the owner later decides to keep a one-click preview shortcut, make that distinct from and not a replacement for the mandatory double-click behavior; do **not** launch the native OS viewer on single-click.
- **Double-click image/document** — opens/previews **inside Chutey**, in the UPPER image/document pane. This works when the preview pane was previously hidden as well as when it is visible, does not open Windows Photo Viewer/Paint/browser file handler, and does not touch History.
- **Double-click supported video/audio** — opens in Chutey's LOWER pinned media player, without silently replacing the upper image pane or launching native media apps.
- **Right-click a file → Open Native** — intentionally opens the **original authorized file** in its Windows-associated application through existing safe native file-open protocol. Use the explicit visible text **Open Native**, not generic `Open`. Do not route this action through internal Chutey preview. A missing/changed grant or missing native handler shows an actionable error rather than silently switching behavior.
- **Right-click → Preview in Chutey** — optional explicit internal preview command, separate from **Open Native**. **Reveal / GO TO** remains a **third** action that reveals the saved file in Windows Explorer, not necessarily opens the file itself.
- **Double-click directory** retains navigation into the directory, not media preview or native Open. Ctrl/Shift multi-selection should not accidentally start media. Keyboard Enter on a focused file should have clearly documented consistent behavior (prefer internal Chutey preview, with Open Native as an explicit separate command).
- A new image replaces only the upper preview and keeps the currently playing lower video alive, preserving existing pane geometry. Rapid switching must cancel stale requests and release old image object URLs. Supported-media failure should be shown inside the intended pane, not by launching native apps.
- Keep the separate small Chrome popup image behavior and Shelf History Open setting untouched by this File Explorer repair.

**Acceptance matrix:** Single click JPG selects without native app; **double-click JPG/PNG from closed preview** opens upper image in Chutey; **double-click MP4** opens bottom player in Chutey; right-click JPG → **Open Native** opens Windows' associated image application; right-click MP4 → **Open Native** opens associated media player; **Reveal / GO TO** opens file location rather than same as Open Native; double-click folder enters folder. User-defined generic Open preferences must not override this explicit double-click vs Open Native contract.

## D. Folder selection automatically grants media-readiness (DEFAULT ON)

**Owner's new November 18 rule:** When Chutey asks to **choose an authorized folder**, that same user authorization should enable everything read-only media preview/playback requires **within that selected folder and its authorized descendants**. It should *not* ask the user to authorize again merely to view a video, audio track, image, thumbnail or text from the same folder.

**Required implementation**
- Introduce Settings control (in the appropriate Chutey Settings surface): **“Automatically enable media playback for selected folders”**, **ON by default**; explicit OFF should be respected/persisted and clearly described.
- ON: after explicit folder choice and successful verified **read** grant, probe/prepare supported media preview/playback in the background under the existing grant, without second picker/approval. Keep folder browsing and previews usable if preparation has a retryable fault; defer necessary work transparently. Never fabricate Ready if missing native capability. Allow the user to disable auto-preparation without losing existing read grants.
- OFF: do not proactively initialize or autoplay media when selecting a folder; **explicit user action** to preview/play can still use the already-authorized folder read grant and must not force a redundant consent prompt. Make the UX behavior precise and test ON/OFF persistence.
- **No automatic playback starts** merely from selecting a folder; “playback abilities” means immediately capable of preview/play when chosen. No downloading/copying full original files to local temp just to gain capability; use bounded streaming/HTTP ranges and browser decoder, with existing authorized handles and identities. No silent grant escalation (writes/other folders/network sharing), new OAuth or access to non-selected folders.
- On companion restart, restore/reconcile already-verified grants using the existing secure protocol; re-prompt only when the original grant is actually invalid/revoked or OS/Chrome truly requires it. If permission is genuinely needed, show one specific, truthful remediation message. Access state is not equivalent to media ticket readiness.
- Apply to images, videos and audio wherever the media preview API supports them. Do not auto-enable unrequested microphone, camera or capture permissions.

**Acceptance:** 1) Fresh Chrome/Windows session -> select a folder once -> browse its images and click MP4 -> play within Chutey without another consent. 2) Toggle OFF -> select folder -> no proactive prep/autoplay; explicit playback still works under granted read access. 3) Toggle ON again -> future approved folders media-ready. 4) Restart worker/Chrome -> valid existing authorization reused without repeated prompts; revoked grant requires explicit reapproval. 5) Low memory ~200-300 MiB free, 4 GiB physical -> bounded resource behavior and honest failures.

## E. New P0 crash of current Chutey TEST build — November 18, 2026

**User-observed failure:** The owner reports that the Chutey version currently being tested **crashed today**. This is a new P0 bug; no evidence yet proves whether it was the extension, the popup/side panel, Chrome's renderer, native Chute.exe/NativeHost or an external OS termination. **Do not diagnose the crash as Python, a memory leak, Copy Image, or media streaming without logs.**

**Tracked bug:** [GitHub Issue #32 — Current Chutey TEST build crashed](https://github.com/thanks-cohn/chute/issues/32).

**Environment/context:** Windows 11 10.0.22000.1219, ~4 GB physical RAM, low free memory observed in earlier tests; Chrome unpacked extension `2.6.1.1`, TEST branch `fix/chutey-p0-playback-starter`, initial checkout `5e42457` (PR #31 merged). The Windows worker is installed separately; latest code checkout/extension does not itself establish a newly installed worker. Exact crash time, steps, logs and exit reason are **not yet known**.

**Mandatory investigation**
- Preserve owner files, History, current extension build, installed worker, native host and archival GOLD version. Capture paired extension id/version/commit and worker/native host executable SHA-256 before repairs.
- First identify **which process or component actually failed**, with timestamp, crash code/stack and last action; distinguish Windows Event Viewer Application Error, Windows Error Reporting, Chutey diagnostic log, Chrome extension error, renderer crash, Chrome MV3 service worker ordinary inactivity, worker HTTP hang and deliberate user closure.
- Reproduce across popup Copy Image, large images, Shelf Explorer image preview, dual video/image panels, video media tickets/retries and memory pressure **only as hypotheses**; measure memory, handle growth, queue/busy responses and crash telemetry with bounded diagnostics.
- Check restart/recovery, no lost saved content, no false receipts, queue preservation, no duplicate worker launches and no needless consent prompts. Use smallest evidence-backed fix, regression tests and extended low-RAM Windows owner acceptance.
- Never advise disabling Defender, killing Explorer, wiping saved content or overwriting the archived worker to mask the failure. Mark fixed **only after** root cause, controlled reproduction or solid fault evidence, tests, and real owner acceptance.

**Status:** Bug recorded and investigation requested; no crash fix or root cause has been established.

## F. Definition of Done / engineering handoff

- Begin with `fix/chutey-p0-playback-starter` but make code changes on a **separate new branch**, preserving owner-installed binaries, saved files, History, local data, the GOLD worker backup, and `Chutey-Worker-ARCHIVE`. Do not alter main or issue #30's agreed geometry.
- Implement/review minimal safe changes in `extension/popup-gallery.js`, `extension/explorer-view.js`, `extension/explorer-view.css`, native clipboard/media adapter only where measured necessary, and Settings persistence/UI.
- Add targeted unit/DOM tests plus real Chrome/Windows integration checks. Verify combined behaviors, not merely that menu labels exist.
- Prioritize real playback reliability on low-resource Windows: investigate stage-specific timeouts and 429 storms from Issue #28 rather than raising every concurrency cap. No suggestion to terminate Explorer, disable Defender or change process priority as a feature workaround.
- Supply evidence: observed before/after Copy Image latency, file-type coverage, screenshots/video of both handles reaching top/bottom, single-click preview, both folder auto-readiness settings states, Chrome worker pairing, memory and stream ticket cleanup. Distinguish CI passes from owner-machine validation.
- **Do not mark completed simply because a specification exists**. Leave merge/release pending user testing.

**Related issues:**  
- https://github.com/thanks-cohn/chute/issues/32 — NEW P0 user-reported crash of current Chutey version (2026-11-18)  
- https://github.com/thanks-cohn/chute/issues/28 — streaming stability / 429 / RAM  
- https://github.com/thanks-cohn/chute/issues/30 — exact dual-pane geometry  
- `Necessary-fixes/POPUP_SHELF_COPY_IMAGE_AND_SHELF_OPEN_DEFAULT_2026-11-17.md` — popup Copy Image and distinct Shelf History Open behavior  
- `Necessary-fixes/FOCUSED_PREVIEW_NAVIGATION_TOP_NONVIDEO_BOTTOM_VIDEO_LEFT_RIGHT_2026-11-17.md` — focused galleries

**Owner summary (latest):** *Copy an image as quickly as Chrome; DOUBLE-CLICK a file to open it INSIDE Chutey; RIGHT-CLICK → Open Native to launch Windows' associated app; drag both preview boundaries all the way up or down; choose a folder once and have its supported media ready without a second authorization, with automatic preparation configurable in Settings; urgently investigate today's crash of the current TEST version.*
