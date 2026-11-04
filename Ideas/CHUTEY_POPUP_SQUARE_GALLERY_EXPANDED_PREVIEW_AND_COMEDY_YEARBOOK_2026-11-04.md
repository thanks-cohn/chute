# IDEA — Chutey's Pocket Gallery: Square Tiles, Expanded Viewer and Comedy Yearbook

**Product:** Chute / Chutey browser extension  
**Owner's idea:** November 4, 2026  
**Location:** `Ideas/`  
**Status:** FUTURE DESIGN NOTE ONLY — **DO NOT IMPLEMENT OR MODIFY CHUTEY NOW.** This note authorizes no code, CSS, assets, tests, UI changes, merging, or deployment.

## Concept

The small Chutey extension pop-out should optionally display a tight **gallery of little square image/icon tiles** instead of its current vertical list. Clicking a tile expands it into a large, focused preview **within the same extension popup**. In expanded mode, a user can browse **Next/right** and **Previous/left**, one file at a time, **without leaving expanded mode**. Normal pagination still works: only the **presentation format changes**, not the History dataset, date selection, page size, loaded items or paging semantics.

In expanded mode, display the item's **actual name as a clickable rename control**, with safe cancel/confirm and error handling. Do not equate editing the display label with a verified filesystem rename: call the authorized existing backend or declare unsupported, preserve extension/identity and prevent data loss.

## Compact gallery and expanded-view interaction

1. Open the existing approximately 390 px Chrome extension popup, keeping its current History/date selection and Previous/Next page controls.
2. Enter a compact square gallery layout with stable tile geometry, real previews when available, and crisp file-type icons or character placeholders elsewhere. Avoid loading original full-resolution files just to render thumbnail tiles.
3. Click/tap/keyboard-activate any tile. Show a larger viewer **in the same popup**, with a prominent file preview, editable filename and accessible previous/next arrows.
4. Navigate adjacent items with right/left controls; remain expanded while the focused item changes. Arrow keys can participate when focus is not in the filename editor.
5. When the end of the current page is reached, use the **existing** paginated data source to go forward/backward if an adjacent page exists, keeping the expanded viewer open and maintaining the true item index. Do not silently truncate History or fetch the whole archive.
6. Close/Back returns to the gallery at the same scroll/page/item, and doesn't disturb active/archived state, Recall, Open, drag-out or the original file.
7. Handle empty, missing, stale, deleted or unsupported previews gracefully with understandable labels; never present a placeholder mascot portrait as the actual saved file.

## Chutey's silly family-yearbook portraits

When an image/file preview is unavailable—or while a preview is loading—show a rotating selection of **original illustrated Chutey character poses**, like the world's most ridiculous family yearbook.

**Example original future art directions:** Chutey kissing a cat, making a goofy tongue-out face, leaning too far into the camera, fake-serious yearbook portrait, caught mid-prank, half-hidden behind a folder, wearing an absurd hat, giggling mischievously, making a triumphant pose, accidentally falling over, looking guilty, photobombing another Chutey portrait.

Treat these as original characters/jokes and art directions, **not pre-existing assets**. Keep layouts legible and the substitute explicitly labeled `Preview unavailable` or `Loading preview` so the user never mistakes a goofy Chutey image for their file. Reuse a small shared library of images/short actions for loading, idle, empty, failure and playful feedback, with varied seeded or context-aware selection and bounded repetition.

## Shelf-triggered goofy animation

**Additional owner idea:** *Different actions in the Shelf move Chutey's small icon/mascot to perform context-sensitive, silly, goofy animations.* The mascot isn't just static branding:

| Shelf event | Possible subtle Chutey reaction |
| --- | --- |
| Open History | Pops into a yearbook-like pose, glances at recent images |
| Switch History ↔ File Explorer | Slides, tumbles or leaps toward the selected tab |
| Expand a preview | Pretends to stretch the picture to full size |
| Go Next / Previous | Silly sideways shuffle or fake-dramatic turn |
| Load a thumbnail | Wobbles impatiently or takes a quick goofy pose |
| Preview unavailable | Playful tongue-out, surprised eyes or comically confused expression |
| Rename a file | Conjures a tiny pencil and looks intensely serious |
| Successful saved/recall action | Tiny celebratory bounce **only after** verified operation completion |
| Actual failed operation | Comic startled reaction, but retain a real readable failure state |
| Clear live Chute | Small dust-cloud/cartoon tidy-up without implying archived History was deleted |

Movements must be **small, non-blocking and optional**, not cover clickable controls, steal focus, trigger accidental drags or prevent file operations. Throttle rapid events; support reduced motion/mute/off and lower-spec fallback. The image gallery and animation contract should stay independent from file/History backend semantics. Never infer completion from an animation or misrepresent a failed operation as successful.

## Architecture and later acceptance

- **Future only:** preserve current Chutey main UI, History, settings, extension packaging and Windows companion untouched. The owner explicitly requested **a note for later, not changes right now**.
- Existing popup already uses a compact width, thumbnails, dated History and explicit pagination; reuse its actual data flow rather than duplicating History or inventing another storage source.
- Thumbnail, full preview, filename edit and navigation must be driven by valid file IDs and authorized existing operations, not merely CSS mockups.
- Test crossing a page boundary **while still expanded**, changing History date, preview failure, missing thumbnail, real saved image, missing file, rename conflict/permission denial, keyboard focus, memory limits and cached thumbnail reuse.
- Test all Shelf animations as independent, interruptible, deterministic event listeners; no animation can mutate files or leak source URLs.
- Asset design and behavior can later coordinate with the future **REDOWN Mascot API**, but Chutey must not become dependent on it or import unnecessary privileged engine code.

**Owner's governing vision:** A cute, fast square gallery that becomes a larger swipe-through viewer, accompanied by Chutey's mischievous family-yearbook personality, with expressive little animations in response to Shelf actions. Preserve the functional Chute beneath the playful surface.
