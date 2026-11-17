# NECESSARY FIX — Popup image Copy actions; Shelf History Open defaults to Windows Explorer

**Latest owner correction:** November 17, 2026
**Priority:** Necessary next Codex repair, narrowly scoped
**Status:** SPECIFICATION ONLY — not implemented
**Scope boundaries:** (1) Chutey extension popup image context menu and its expanded/maximized popup preview, and (2) the separate **Shelf History Open BUTTON**. **No changes to Shelf image-click behavior or Shelf preview controls are authorized by this request.**

## Corrected owner intent — DO NOT CONFLATE POPUP WITH SHELF

The owner corrected an earlier assistant interpretation:

> "this is only for the extension pop out, not the shelf! 'Clicking an image should enlarge/preview it.' i mean keep current functionality but i stated that to distinguish with what the open button should do in the same expanded pop out, the shelfs HISTORY open should default to the local windows opener or the like, UNLESS, the settings dictate differently!"

**Precisely:**

| Surface | Action | Requirement |
|---|---|---|
| **Extension popup small image tile** | Click image | **KEEP CURRENT BEHAVIOR** — enlarge/preview the image in the popup. This is background context, **not a new requirement for Shelf** |
| **Extension popup small image tile** | Right-click | Add **Copy Image** alongside existing **Trash It!** |
| **Extension popup expanded / maximized image preview** | Right-click image / image actions | **Copy Image** must be available alongside **Trash It!** in BOTH expanded and maximized popup states. Leave preview open after copying |
| **Extension popup expanded Open action**, if presented for the saved file | Click explicit Open | Treat this as a **separate file-location action**, not another invocation of thumbnail image enlargement. Use the real local saved location where supported. The existing arrow **↗ Open in Shelf** is specifically a *Shelf handoff*, not the same named Open-file/location action; do not silently repurpose it or claim the current build already has a local-file Open button |
| **Shelf → History** | Click its explicit **Open** BUTTON | **By default, reveal/open the saved item's actual location in Windows File Explorer**, selecting the file when supported. **Only if Settings explicitly specifies an alternate target** should that button behave differently |
| **Shelf → History image tile or image preview** | Click/expand/right-click | **NO CHANGE REQUESTED**. Preserve current Shelf behaviors and controls; do not impose the popup click/Copy changes on Shelf |
| **Chutey File Explorer tab** | Select file | Keep independent File Explorer-preview repair contract; do not let these popup/Shelf History rules change it |

**Context:** The user mentioned the popup's existing click-to-expand behavior to distinguish it from an **Open** button. It was NOT permission to change Shelf History image-click functionality. Also **Copy Image in expanded/maximized** here refers to the **extension popup**, NOT adding Copy controls to the Shelf half/full/maximized preview.

## Copy Image means actual image pixels

- Copy decoded original image pixels to the Windows clipboard so Paste works in Paint/other compatible apps — **not a filename, path, URL, link, or thumbnail pointer**.
- The file and dated History must be unchanged. Copy should never invoke Trash, Recall, or Hide.
- Confirm a verified clipboard-write result before displaying "Copied Image"; show a specific actionable error otherwise.
- Protect image decoder memory, user gesture and native permissions; don't bypass folder grants or silently downscale originals.
- Include keyboard context menu invocation (ContextMenu / Shift+F10) and accessible focus.

## Existing exact TEST source inspected: 1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122

- `extension/popup-gallery.js` currently preserves popup tile click-to-preview. The right-click `.chutey-popup-menu` (tile and lightbox) has ONLY **Trash It!**; extend it to Copy Image in the popup.
- `extension/popup-gallery.js` currently includes an **↗ Open in Shelf** handoff control in the enlarged preview, NOT an explicitly named Windows file-location Open button. Do not mistake these controls for one another; keep the handoff unless separately told to change it.
- `extension/shelf.js` currently creates Shelf History Open, Reveal, Trash and other item tools. **Only change the behavior of its explicit Open button**, giving it a Shelf-specific configurable default to Windows **file location**, not just launching the associated app.
- `extension/file-actions.js` has a shared `chuteyOpenTarget:'system'` setting whose system option is the **Windows-associated application**, rather than reveal location. Codex must give the Shelf History Open button its own default/setting; never silently globally change File Explorer or popup thumbnail actions. Migrate/reconcile preexisting explicit user settings rather than clobbering them.
- The existing guarded `locate_saved` and `clipboard_copy_image` native APIs can be evaluated/reused for saved popup images. Clipboard image input is currently bounded by supported formats and 32 MiB encoded/8.5-million-pixel limits; no unsafe bypass.
- **Do not change `extension/shelf-gallery-preview.js` image click, resize or copy behavior under this task**. Earlier draft incorrectly proposed adding Copy to Shelf preview; that proposal is withdrawn.

## Required acceptance

1. Popup image tile click continues to enlarge in the popup exactly as before; no Windows Explorer launch for that click.
2. Right-click popup tile, expanded popup image, and maximized popup image → menu with **Copy Image** and **Trash It!**. Copy verified into real Windows clipboard and pasted into Paint; no deletion or viewer closure on copy.
3. Popup's actual file **Open/location** action (if displayed) remains distinct from image-click enlargement and from the existing **↗ Open in Shelf** navigation; do not mislabel controls or accidentally change the handoff.
4. **Shelf History Open BUTTON** defaults to revealing saved file in Windows Explorer. User's explicit alternate preference in Shelf Settings overrides this button alone.
5. Shelf image tile click, half/full image preview, lightbox and gallery navigation behave exactly as before. No Shelf-wide Copy Image addition from this request.
6. Chutey File Explorer click-to-preview remains governed by its separate necessary-fix document.
7. Handle absent/moved local image, clipboard busy, unsupported format, low RAM and permission expiry truthfully; no auto-consent, unsafe path guessing, or unverified success.
8. Tests on installed Windows Chrome popup (including enlarged/maximized) and Shelf History Open button with/without a Settings override.

**Conflict resolution:** This latest correction supersedes any older documentation that says Shelf image clicks must newly enlarge, or that Copy Image must be added to Shelf expanded/full preview, under this popup-specific feature request.

No install, merge, release, archive deletion, GOLD tag changes or owner-device changes authorized by writing this specification.
