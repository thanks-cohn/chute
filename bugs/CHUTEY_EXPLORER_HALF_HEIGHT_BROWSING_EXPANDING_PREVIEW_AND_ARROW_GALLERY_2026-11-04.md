# P1 — Chutey File Explorer: half-height browsing floor, expandable preview and left/right gallery navigation

**Owner report:** November 4, 2026, from an actually working Windows Shelf Explorer test build.  
**Status:** implementation request / bug report, not yet a runtime fix.  
**Scope:** `thanks-cohn/chute` existing Shelf File Explorer; do not alter unrelated Chutey History, extension popup, mascot art, native pairing, worker, filesystem grants or file API.

## Definitive owner layout correction — supersedes earlier “never shrink” wording

The previous written requirement said the preview must never shrink the Explorer. **The owner has explicitly revised that.** The actual desired behavior:

1. **No preview:** directory tree and file list occupy the normal available Explorer workspace.
2. **Open a file/image preview:** the Explorer becomes a compact, **independently scrollable upper-half browsing region**, approximately 50% of the *available Explorer content area*, while the preview is visible below it. Keep folder tree and list usable, stable and readable; don't reset the folder path, selection, grid/list preference, page position or scroll.
3. **Resize the bottom preview larger:** the preview card **may rise much higher, up to immediately beneath the top calendar/navigation controls**. Its upper edge must not cover the protected header, tabs, calendar/top toolbar or other critical controls. **Do not keep the old hard-coded 70% maximum preview height.** Compute a safe top boundary from the actual visible layout, not from an assumed screen height.
4. **Never collapse the browsing region past half size:** as preview height exceeds the split point, **the card overlays the Explorer** instead of reducing the directory tree/list area below its 50% sizing floor. The underlying browsing viewport keeps its own dimensions and scroll position. It can become *visually occluded* by an intentionally maximized card; that's acceptable. It must not be forced into a tiny unusable strip or zero-height pane.
5. **Shrink the preview again:** the Explorer returns to a normal visible ~50% browsing area as the preview comes back toward the split point. On closing preview, return Explorer to full height and its prior scroll state.
6. Maintain a separate scrollable document/image preview body. Scrollbars and resizer must remain visible/usable where exposed, and long filenames must not cause wrap/collapse. Both narrow ~390px and wide ~900px layouts should remain professional.

**Geometry rule:** Define the “half” based on the content region available after fixed top controls; don't use 50% of full screen height while ignoring top UI. The floor belongs to the **Explorer's allocated DOM/layout area**, not necessarily its visibly uncovered area when preview is intentionally enlarged. Resize stops at the calendar/top-controls boundary. If the Shelf is so short that normal minimum heights conflict, degrade gracefully by preserving essential controls and scrolling; don't clamp to impossible dimensions.

## Current code trace — why it fails

- `extension/explorer-view.css`: `#chutey-explorer-view .ex-workspace { flex:1; min-height:0 }` stays full-height. `.ex-preview` is absolutely positioned at bottom, initially `height:48%`, and `max-height:70%`. **Opening a preview doesn't allocate half-height browse space; instead, the panel covers its lower rows.**
- `extension/explorer-view.js::showPreview` opens the preview, but doesn't apply a half-height state to the workspace. `closePreview` hides it.
- `extension/explorer-view.js` resize handler clamps to `0.3..0.7` of host height, preventing the card from rising near the top navigation/calendar limit.
- `extension/explorer-view.js` has Up/Down focus movement for rows but **no previous/next preview navigation** via Left/Right. It has no preview Previous/Next controls, nor a page-boundary gallery handoff.
- `scripts/verify-explorer-browser.py` currently asserts `before == after` for **Explorer width, height and columns** after showing a preview. **That old height assertion encodes the requirement the owner has now superseded.** Do not keep a knowingly contradictory green test.

## Required changes — thin UI only, reuse existing API

- Prefer **CSS layout states** such as `.ex-preview-open` plus a 50%-height allocated upper workspace, with the bottom absolute preview still floating and resizable. Do not create a second file browser, rebuild DOM per preview, or mutate Python file-grant semantics.
- Keep the top controls visible and untouched (for Explorer tab, use its actual header/toolbar/navigation; on History/calendar tab ensure preview cannot bleed across hidden panels).
- Update the preview resize logic to clamp to a measured top boundary; clamp **preview only**, never reduce the Explorer's allocated browsing area below its half-height floor. Recalculate on Shelf resize and preserve/adjust the active preview size safely.
- Ensure tree/list are separately scrollable and visible in their uncovered half; scroll remains possible under pagination and preview transitions.
- **Add visible Previous and Next arrow controls on preview** and support keyboard `ArrowLeft`/`ArrowRight` while preview is open, provided focus isn't in a text input, editor, filename field, native media control or other control that needs the arrows.
- Gallery order: current folder's **image files** in the current sort/filter order; skip directories. Keep preview open and update its name, thumbnail/image and selected item. Use actual file handles, not guessed URLs or filenames.
- Across an existing API pagination boundary, lazily load the next page when appropriate and advance to the next matching image; avoid loading the entire archive, duplicate images, losing filter/sort, or changing browsing folder. Previous should work for already loaded pages; if only forward loading exists, document and implement the minimum safe backward-navigation state required. Disable arrows truthfully at actual boundaries.
- Avoid races: rapid arrows, preview closing during fetch, stale response after folder change, and image failing to decode must never show the wrong image or leak object URLs. Reuse cancellation and preview request IDs.
- Update selection highlight and scroll the selected image into the visible portion of the list **without scrolling the whole Shelf or resetting the independent Explorer scrollbar**. When the preview grows over the list, preserve selection and scroll without forcing the viewport to jump under the overlay.
- No file writes, no worker replacement, no cloud upload, no giant fixtures. This is a focused **UI/keyboard/layout** repair.

## Real browser acceptance / test updates

1. Start with no preview; record browse list/tree geometry and scroll offset.
2. Open a real fixture PNG. Verify Explorer allocated browsing height becomes about **50% of available content height**; its own `scrollHeight > clientHeight` and `scrollTop` can change without moving the preview. Test 390px and 900px Shelf widths.
3. Drag preview top upward beyond the normal half split. Verify preview top can reach just below the protected top controls while **Explorer allocated height stays >= approximately half** (allow small pixel rounding). Verify top calendar/navigation not occluded.
4. Drag back down: preview resizes; Explorer returns to a usable upper-half viewport, no collapsed strip; after closing preview Explorer regains full browsing allocation and prior scroll.
5. Click Previous/Next and press Left/Right for at least three genuine image files. Assert a *real different* `handle`, filename, source pixel/image dimensions, and active selected row each time; preview never closes.
6. Cross a page boundary with more than 100 mixed files/images and no huge content fixtures, preserving filter/sort, expected order and preventing duplicate or skipped images.
7. Test last/first image, no images, missing image, rapid repeated key presses, disabled arrows, zoom, video/text preview, keyboard inputs, narrow Shelf and viewport resize.
8. Retain image-origin/History and native-host/Windows permission tests, and update `scripts/verify-explorer-browser.py` to remove the old **unchanged Explorer height** oracle. Continue to require unchanged **width/column count** except deliberate responsive breakpoint changes.
9. Verify against actual installed Chrome extension when possible; classify fixture-only test separately. A screenshot or CSS change without interaction/geometry assertions is not sufficient.

## Implementation delivery

Work on a focused review branch from the latest Chutey source, commit code and regression tests, provide before/after screenshots and a compact test report, and produce a matching Chrome extension test package. The Python companion should not require rebuilding if only Shelf HTML/CSS/JS changed. Do not merge to `main` or replace the owner's working installed package without approval.

**Owner's design principle:** **“The viewing card may become enormous, but the file browser never collapses.”** Make it easy to browse, scroll and switch images while previewing.
