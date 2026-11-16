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

## C. CRITICAL BUG: Explorer's embedded preview resizes when navigating

**Current undesirable behavior:** The preview pane is positioned in the bottom section of the right-hand File Explorer pane. Moving selection with Up/Down changes the preview's shape/size.

**Required behavior:**
- Preview remains docked in that lower right area in **fixed geometry** throughout directory traversal.
- Preview size changes **only** through the existing preview-size slider, explicit Expand control, and closing via X (which hides it). Image aspect ratios and metadata must not alter panel size.
- Use `object-fit: contain` / equivalent; letterbox inside the fixed preview instead of resizing the container.
- Preserve user-selected preview size when switching between tall, wide, square, small, or invalid images.
- No inadvertent drag-resize, click-induced collapse/expand, image-decoding layout shift, or resizing from scroll position.
- The current half/full settings must map deterministically to the specified pane geometry; verify intended slider semantics in the existing UI.

## D. Expanded image preview: entire available Shelf content area

The preview Expand action should fill the **available Shelf working area**, excluding and retaining these visible controls:
- top-left Chutey icon/branding;
- History and File Explorer tabs;
- Back, Forward, Up one directory, Refresh, and Home navigation buttons.

The expanded preview must respect those persistent controls and should not take over the whole browser window or obscure essential navigation. Restore the previous fixed pane size on collapse. Close with X according to existing close semantics.

## E. Directory keyboard navigation independent of preview

When a preview is open — docked **or expanded** — Up and Down must continue traversing File Explorer's current directory **exactly as if no preview were present**, and update the image shown to match the current file selection.

- Arrow keys move the active directory selection; preview is a *read-only projection* of that selection, not a keyboard focus trap.
- Preserve the current directory, file ordering, and navigation semantics.
- A non-image selection should show a stable non-image / unavailable state without resizing the pane.
- Do not create simultaneous competing arrow-key handlers from gallery, modal/lightbox, and File Explorer.
- Do not steal input from text fields, sliders, menus, or other controls whose native arrow-key behavior the user is actively using.
- Test rapidly traversing mixed aspect ratios, non-images, large images, cached/missing images and keyboard focus changes; no size changes, jank, unexpected pane disappearance or skipping files.

## Implementation order and safety gates

1. Reproduce and instrument the native `Expected a file handle.` failure in the current pairing without changing the installed worker.
2. Stabilize Explorer preview geometry and keyboard selection/preview synchronization.
3. Implement correct scoped expanded preview, preserving navigation controls.
4. Extract the reusable default-images + background-animation presentation module; introduce Options background color, migration, and unit tests.
5. Run focused Chrome and real Windows Explorer tests on a separate test extension/worker pairing, with existing current working pair left as a rollback.
6. Preserve verified working binary, Git refs, and local history/Chute data; do not conflate logged success, visible preview and successful native Open.

## Future idea, not part of this bugfix

A deliberate **four-corners-first** popup entrance animation may be explored later. The current priority is one stable complete popup silhouette, placeholders first, real images loaded asynchronously, and reliable Explorer behavior.
