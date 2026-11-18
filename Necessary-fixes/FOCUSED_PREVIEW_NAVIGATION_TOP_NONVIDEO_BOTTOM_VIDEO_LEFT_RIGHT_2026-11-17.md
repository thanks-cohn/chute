# NECESSARY FIX — Focused dual-preview Left/Right navigation: top non-video; bottom video only

**Owner addition:** November 17, 2026
**Priority:** Required for next Chutey Codex owner-acceptance repair, tied to preview design Issue #30.
**Status:** Specification only; NO code, worker, installation, or browser extension was changed.

## Owner's exact intent

> "the bottom video panel, when clicked should be able to go left and right as well BUT it does this for the videos inside the directory, the top one simply does regular iteration and skips over video, to go thru the videos in a directory you just click the bottom video panel once and then use the left and right arrow keys"

The TWO preview panels are **bottom-anchored STACKED SHEETS** over File Explorer: image/document sheet below, video sheet above. Each sheet has its OWN **draggable TOP-edge handle** and can expand to 100% of the Shelf height. Dragging that TOP edge DOWN to the Shelf bottom **COLLAPSES BUT DOES NOT CLOSE** the panel; the grabber remains accessible, and dragging UP re-expands the SAME panel. **Only X closes**; collapsing video must retain playback, position and media ticket. Do not build a shared 50/50 splitter. Each sheet has **independent, click-to-focus keyboard gallery navigation**. The user should never need to move the mouse to each file or open Windows Explorer just to advance within a category.

| Where user clicks to activate | ArrowLeft | ArrowRight | Which files count |
|---|---|---|---|
| **Top image/document preview pane** | Previous non-video previewable file | Next non-video previewable file | Current directory's files in its normal displayed order, skipping every video |
| **Bottom pinned video player pane** | Previous video | Next video | Videos ONLY within the current directory; ignore images, documents and other non-video files |
| **Neither pane active** | Preserve normal Explorer keyboard navigation and focused native controls | Same | No unintended gallery navigation |

### Detailed interaction rules

1. **One click** anywhere on the ordinary background/title of the **bottom video pane** (or equivalent non-control video surface) activates video gallery keyboard focus. After that, Left/Right jumps through video files in the **current directory only**, with no need to right-click files.
2. Clicking the **top preview pane** activates its own keyboard focus. Left/Right advances through the normal file preview sequence but **skips video files**, leaving the bottom player's current video untouched.
3. Focus is obvious and independent. Arrow keys must affect **only the currently active pane**. Changing top preview doesn't steal focus from bottom video when user is navigating videos, and vice versa. Use keyboard-accessible focus and visible focus styling.
4. Each gallery follows the directory's **displayed sort order** and active search/filter rather than filesystem enumeration accidents; handle paginated directory listings without skipping unloaded eligible items. At the beginning/end, clearly stop without wrapping unless a separate setting specifies wraparound.
5. If videos are V1.mp4 and V2.webm mixed among images A.jpg and B.png, bottom: V1 → V2 (skips A/B), while top: A → B (skips V1/V2). Source files are not copied or moved.
6. A new video should replace the previous player in the **same bottom pane**. Stop or release the prior media lease/ticket, cancel superseded loads, start exactly one new candidate; do not create accumulating player nodes or tickets. Do not disturb the currently displayed top image. Avoid stuck 'Loading media…' and silent same-file retry no-ops.
7. The user's intent is **video-file navigation**, not seeking within the current video. Because HTML5 video controls may consume Left/Right to seek, establish deliberate focus priority: when the *video pane* is active, Left/Right navigates files; while a native seek/volume slider or other interactive control is specifically focused, do not hijack that control. Expose an explicit way to refocus the pane without requiring multiple clicks.
8. Typing in search, editing names, menu use, keyboard-focused splitter, native media controls, or another UI surface must keep their normal key meanings. Do not hijack Ctrl/Shift/Alt combinations unexpectedly.
9. The top pane should skip video files even when they're present in the same sorted directory; it can preview ordinary non-video image/text/PDF types as supported. Do not silently introduce a new policy for audio files without examining existing behavior; the requested video gallery is video-only.
10. If the current directory changes while a video remains pinned, its existing video can keep playing as already designed. Left/Right gallery navigation should use an explicitly defined directory scope (the current directory) and never silently jump into another directory or create arbitrary grants. If the current playing file is not in the current directory, choose a predictable first eligible video in the displayed order and show the behavior. No cross-directory traversal.
11. Works whether sheets are compact, half-size, overlapping or expanded to **full Shelf height**. Each **BOTTOM-ANCHORED** sheet's **TOP edge** is dragged independently. Video top edge at Shelf bottom = video collapsed, image visible. Drag video grabber UP again = same video restored. Image top edge at Shelf top + collapsed video = full-height image. Dragging never closes either; ONLY the individual X closes. Preserve active video playback and ticket across collapse/restore.

12. Maintain keyboard accessibility; show visible Previous/Next arrow actions in the pinned player as an alternative to shortcuts, plus a status (e.g. Video 2 of 6), with disabled boundaries. Top preview controls have their own separate state.

## Source-confirmed gap in tested runtime 1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122

- extension/explorer-view.js::navigatePreview(delta) (around lines 243–262) currently filters to all files, **not non-video files**, and only advances the top preview gallery. It can dispatch to showPreview for a video, which then invokes showPinned, so the top arrows are not category-separated.
- extension/explorer-view.js::showPinned(row) (around lines 100–140) creates the bottom player but has **no independent video gallery iterator** and the pane is not made a focusable navigation target. Re-selecting the same pinned file returns early, including after a loading stall.
- The host keydown listener (around lines 561–571) routes Left/Right only to navigatePreview when the top preview is visible, and ignores events from video/audio controls. There is no explicit focus owner for top vs bottom gallery.
- The existing pinned-video region is created independently of the top overlay. Preserve that independence while adding **two independent full-height edge resize controls** per updated Issue #30. Do NOT build a coupled image/video shared splitter.

## Acceptance tests

1. Mixed current directory: JPG → MP4 → PNG → WebM → PDF → MP4. Top Left/Right traverses JPG → PNG → PDF without opening or replacing a video. Bottom Left/Right traverses MP4 → WebM → MP4 without changing the top preview.
2. Click bottom pane once; key Left/Right navigates next/previous video, regardless of which panel was previously focused. Click top once; arrows navigate only non-video files.
3. Arrows work with mixed sorts, search results, and pagination; keys stop cleanly at boundaries; no unexpected folder changes or external Windows Explorer launches.
4. Native video seekbar/volume keyboard operation remains functional when those controls themselves have focus. Search input, menu, splitter focus and other shortcuts remain intact.
5. Rapid Left/Right, pause, retry same short MP4 after error, stop, collapse/expand, and moving directory all avoid stale player/lease leaks, indefinite spinner, and unnecessary BUSY errors.
6. Real installed Windows Chrome + native worker test on low-memory target, not only JS fixtures; include accessibility/focus regression tests and before/after resource measurements.

## Related required work

- Issue #30 — **two bottom-anchored stacked sheets**, each with its own **top-edge** grabber from 0–100% Shelf height; dragging to bottom collapses but doesn't close; drag up restores; only X closes; click pane and Left/Right navigates its file category.
- Necessary-fixes/FILE_EXPLORER_CLICK_PREVIEWS_HISTORY_CLICK_REVEALS_LOCATION_2026-11-17.md.
- Necessary-fixes/EXPLORER_PREVIEW_GENERIC_UNSUPPORTED_OR_OVERSIZE_ERRORS_2026-11-17.md.
- P0 owner-stalled 10-second MP4 and memory/resource growth investigation.

Never modify user's existing installation or GOLD references as part of this documentation. No merge, deployment, or GOLD certification without approval.
