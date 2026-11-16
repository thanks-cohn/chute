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

## Implementation order and safety gates

1. Reproduce and instrument the native `Expected a file handle.` failure in the current pairing without changing the installed worker.
2. Replace inline Explorer previews with the bottom-anchored overlay, without reflow or resizing any other UI; stabilize image/video preview and keyboard selection synchronization.
3. Implement overlay-only drag-to-expand / Expand / restore / X behavior, stopping at the workspace tabs and preserving all persistent navigation controls.
4. Extract the reusable default-images + background-animation presentation module; introduce Options background color, migration, and unit tests.
5. Run focused Chrome and real Windows Explorer tests on a separate test extension/worker pairing, with existing current working pair left as a rollback.
6. Preserve verified working binary, Git refs, and local history/Chute data; do not conflate logged success, visible preview and successful native Open.

## Out of scope for this Codex run: ALL popup entrance animation

**DO NOT implement the four-corners-first animation, nor any other new opening animation or staged reveal.** Current requirement: stable, fully laid-out popup shape from first paint; placeholders first; image decode later; zero unintended flicker/jank. The four-corners idea is deferred to an entirely separate future project.
