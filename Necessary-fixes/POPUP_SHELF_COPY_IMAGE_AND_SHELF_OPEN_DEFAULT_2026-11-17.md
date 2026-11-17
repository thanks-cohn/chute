# NECESSARY FIX — Image Copy in popup and Shelf previews; Shelf Open defaults to Windows file location

**Owner clarification:** November 17, 2026
**Priority:** Required next Chutey Codex acceptance repair (interaction correctness).
**Status:** Specification / source inspection only; NOT implemented.
**Scope:** Chutey Chrome toolbar popup, Shelf History gallery, popup expanded lightbox, Shelf half/full (expanded/maximized) image preview.
**Important:** This later clarification supersedes earlier notes wherever they imply that clicking a History **image** itself should reveal its folder. Image click PREVIEWS; the **Shelf Open button** REVEALS the Windows location by default.

## Exact owner's intent

> "the extension pop out in chutey, you can right click and copy the images as well, AND the open button, opens ... in the local file explorer, UNLESS stated differently in the settings, this is only for the shelf! but click on the image expands it, instead of just trash in both the expanded and maximized it should allow one to copy the image!"

### Final UX rules per surface

| Surface/action | Expected behavior |
|---|---|
| Chrome toolbar popup: **single-click an image tile** | Opens/enlarges the image in Chutey's own popup preview/lightbox; no Windows Explorer launch |
| Chrome toolbar popup: **right-click image tile** | Context menu offering **Copy image** AND **Trash It!** as separate, accurately labeled actions |
| Chrome toolbar popup: **right-click enlarged image** | **Copy image** available alongside **Trash It!**; do not close preview unexpectedly on copy |
| Shelf History: **single-click image card** | Opens/enlarges in-Shelf image preview; no automatic system Explorer launch |
| Shelf History: **right-click image card** | **Copy image** available, with existing permitted actions preserved |
| Shelf image preview: **expanded/half/full/maximized** | **Copy image** available in all modes (toolbar/button or image context menu), alongside existing actions; works after resizing and when maximized |
| Shelf History: explicit **Open** button | **Default: reveal the item's real saved local folder in WINDOWS File Explorer, select/highlight image where supported.** If the user explicitly changes **Shelf Open** behavior in Settings, honor that choice. This applies ONLY to Shelf Open; do not globally change File Explorer row or popup image clicks |
| Chutey File Explorer (separate tab) | Ordinary file click opens internal image/video preview per existing necessary-fix contract; Windows system Open/Reveal only when explicitly requested via its own controls |

**Copy semantics:** "Copy image" means actual picture pixels/bitmap/PNG-compatible clipboard content, ready for Ctrl+V into Paint or another image-capable program. NOT filename, local path, URL, thumbnail-link, or file-list clipboard copy by default. Do not mutate the file, remove it from History or create extra saved image copies. Show "Copied image" only after the clipboard operation is verified; failure needs actionable and accurate message. A right-click menu should work using mouse and keyboard equivalents (ContextMenu/Shift+F10). Avoid hijacking ordinary text/input right-click.

### Existing source and why this matters (TEST reference 1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122)

- extension/popup-gallery.js creates popup lightbox, and right-click menu class .chutey-popup-menu that currently contains **only Trash It!**. Both popup cards and lightbox surface currently invoke that same trash-only menu. Expand this menu with separately wired Copy image; do not make copy delete/hide anything.
- Popup image tile click already calls openPreview(file,row); preserve this behavior.
- extension/shelf-gallery-preview.js creates the Shelf History image preview and supports expanded/restored half/full viewing, but its viewer toolbar contains only resize/close. Add a clear **Copy image** action in the half/full viewer and on its picture context menu.
- extension/shelf.js creates History card "Open" and "Reveal" buttons, currently sending Open through ChuteyFileActions.saved(file,'open') and Reveal through saved(file,'reveal').
- extension/file-actions.js currently has global default chuteyOpenTarget='system' meaning **Windows-associated application**, NOT reveal location. The owner now wants **Shelf-specific Open default = Windows Explorer reveal saved file location**, with an explicit Shelf-specific settings override. Do not silently reuse the unrelated File Explorer's click action or change popup tile behavior. Existing setting/older explicit preferences should be migrated/handled with care rather than overwritten unexpectedly.
- The existing native API **clipboard_copy_image** supports converting guarded original PNG/JPEG/WebP/BMP/GIF images into Windows DIB/DIBV5/PNG clipboard formats, with size/pixel/memory caps, authenticated user gesture, guarded file handle+identity and verified clipboard write. A saved image can be resolved with **locate_saved**; evaluate using the existing API for popup/Shelf safely. Do not bypass consent/authorization, assume arbitrary images are supported, or feed arbitrary paths to a native command.
- The native image clipboard implementation currently limits encoded input to 32 MiB and 8.5 million decoded pixels. Offer truthful errors for unsupported/large images; optional bounded downsample/copy fallback must be separately justified, not silent copying of a low-res thumbnail unless clearly labeled.

### Conflict resolution with earlier History location request

The user's latest, more precise instruction is: **the image itself enlarges when clicked; the Shelf Open button opens the local file location unless Settings override it**. Any earlier ambiguous "History click = Reveal" prose must be read as applying to the dedicated History Open/GO TO location action, not to the image-thumbnail click. Keep preview and location distinct. **Do not launch Windows Explorer when a user single-clicks an image to expand it.**

### Acceptance / regression tests

1. Popup tile single-click expands image; right-click tile shows Copy image and Trash It!; Copy puts real image pixels on Windows clipboard without deleting.
2. Popup enlarged lightbox: right-click image offers Copy image and Trash It! and clipboard image pastes correctly into Paint; image stays enlarged after copy.
3. Shelf History tile click expands image; both half/expanded and full/maximized image preview allow Copy image; show confirmation only on successful verified clipboard write.
4. Shelf History Open button defaults to Windows Explorer **folder reveal** and selects actual saved image if supported, not Photos/Paint; changing **Shelf Open target** in Settings changes this button only, leaving popup tile clicks and Chutey File Explorer internal previews unchanged.
5. Explicit Reveal/GO TO continues working. Missing/moved saved image shows real error; no guessing arbitrary path. History retention/Trash behavior is unaffected.
6. Supported image formats (PNG/JPEG/WebP/BMP/GIF first frame), unsupported images, oversize/low-memory, clipboard busy, authorization failure and stale item give specific messages. No false "Copied" claims, no unbounded memory allocation or hidden file mutation.
7. Test compact popup, Shelf narrow view, half/full and maximized preview, keyboard menu focus/return, Chrome restart, and existing stored user preferences.
8. Test real Windows clipboard paste into Paint and another compatible app where available; avoid asserting image copy works based solely on internal mock tests.

**No worker reinstall, merge, GOLD promotion, History deletion or deployment is authorized by this document.**
