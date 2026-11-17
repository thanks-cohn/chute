# NECESSARY FIX — Shelf File Explorer click expands internal preview; Shelf History Open reveals saved file location

**Owner clarification:** November 17, 2026

**LATEST OWNER CORRECTION:** There are THREE independent surfaces. (1) **Extension POPUP**: clicking an image already enlarges its popup viewer; preserve that behavior and add **Copy Image** alongside Trash in popup tile and expanded/maximized popup menus. (2) **SHELF FILE EXPLORER**: clicking a local file should open/expand the in-Chutey preview panel, not launch the Windows file manager. The owner explicitly confirms that is the desired Shelf File Explorer behavior. (3) **SHELF HISTORY**: do NOT change its image tile click/preview behavior under this clarification; its separate **Open BUTTON** should default to the file's real location in Windows Explorer unless Shelf-specific Settings override. Do NOT add Copy Image to Shelf half/full History preview as part of the popup-only request. See [corrected necessary fix](POPUP_SHELF_COPY_IMAGE_AND_SHELF_OPEN_DEFAULT_2026-11-17.md).  
**Priority:** Critical interaction/UX correctness; owner-device regression  
**Repository/working branch:** `thanks-cohn/chute` / `fix/chutey-media-worker-2026-11-17`  
**Related preview-layout issue:** [#30](https://github.com/thanks-cohn/chute/issues/30).  
**Scope:** Restore user-intuitive click semantics. Separate from P0 Windows Browse picker failure [#9](https://github.com/thanks-cohn/chute/issues/9) and the separate BUSY/lane investigation.

## Owner's explicit rule

> Clicking the image opens the local location! NO! I wanted that for HISTORY, obviously not for the File Explorer. If the File Explorer is already there, it should open the preview pane! If it's the History thing, that should open the local location.

There are **three distinct interfaces** and their actions MUST NOT be inherited blindly from one another:

| Context | Default click/tap on image or file | Default double-click / Enter | Separate explicit actions |
|---|---|---|---|
| **Shelf File Explorer** (user is browsing their local filesystem in Chutey) | **Expand/open/update the in-Chutey preview pane** on the FIRST click, even if it is currently closed | Preview/open **inside Chutey**, not Windows File Explorer or its associated app | Context menu: distinct Preview / Open with system application / Reveal / GO TO |
| **Shelf History** (saved Chutey items) | **Preserve existing image click, preview, resize and keyboard behavior without redesign.** | No new image tile/double-click requirement in this popup-specific clarification | Its explicit **Open BUTTON** defaults to reveal the actual file location in Windows Explorer, except when a **Shelf-specific Settings override** requests otherwise. Keep Reveal/GO TO separate. No new Shelf Copy Image UI from the popup request |
| **Folder row in Shelf File Explorer** | Select; double-click/Enter navigates into that folder; a convenient single-click navigation can be evaluated separately | Navigate into folder, not file preview | Explicit Windows location action if desired |

**Crucial usability constraints:**
- A first click on a file **must create/show the preview pane**. It must NOT require the pane to have already been open.
- Clicking a second image updates the **same** image/document preview without spawning Windows Explorer, launching Paint/Photos/another app, or opening a second independent image pane.
- Selecting an MP4/MP3/WebM launches or updates the intentional **pinned media preview** within the established Chutey media surface, rather than opening Windows Explorer. Respect original media authorization, playback leases, Stop/Close and existing user-selected playback settings; do not regress streaming.
- Browser-standard multi-select modifiers (Ctrl, Shift) must NOT inadvertently open many previews; when selecting ranges, maintain selection without unnecessarily streaming/previewing every item. Single click without modifiers previews.
- **Shelf History Open/Reveal location** is the authoritative saved-file directory, not a reconstructed guessed path, arbitrary folder grant, or History's date/category view. If a saved file was deleted/moved, report an explicit missing-file result; no arbitrary directory access.
- Preserve the Shelf History image tile/lightbox unchanged. The user's popup image click-to-expand description was not a request to change Shelf History. **Only the Shelf History Open BUTTON** gains a configurable default to reveal its saved local folder. Add Copy Image alongside Trash **in the extension popup and its expanded/maximized popup viewer**, not to the Shelf History preview under this request.
- A system Open and system Reveal must **never** share one ambiguous default in File Explorer. Preferences may configure explicit commands, but the File Explorer primary click/Enter remains internal preview under this clarified product rule.

## Inspected source showing why this mistake happened (exact TEST source `1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122`)

1. `extension/explorer-view.js` file row `node.onclick` currently does `select(row,event)` and conditionally invokes `showPreview(row)` **only if** `!preview.hidden` and the row is a non-media file. Therefore first click when preview closed does not open it, and selecting a media file is handled differently.
2. Its `node.ondblclick` and `node.onkeydown` Enter call `fileAction(row,'open')` for files.
3. `fileAction` reads `window.ChuteyFileActions.get().chuteyOpenTarget` and dispatches `api.command('open',...)` for `target==='system'` by default; this takes File Explorer out of the Chutey preview experience.
4. `extension/file-actions.js` defines defaults `chuteyRevealTarget:'system',chuteyOpenTarget:'system'`, and the Settings panel currently uses broad shared preferences across contexts. Split these appropriately so the history reveal preference does not change what clicking a local file in Chutey File Explorer does.
5. `extension/shelf.js` Shelf History actions include `window.ChuteyFileActions.saved(file,'reveal')` for **Reveal/GO TO** and `saved(file,'open')` for Open; `extension/shelf-gallery-preview.js` separately makes History cards preview images. Codex should adjust only the explicit **Shelf History Open BUTTON**, not the existing History tile click/lightbox behavior.
6. `extension/explorer-view.js` already has `showPreview(row)` and `showPinned(row)`, so the normal File Explorer click should use those internal preview controls directly rather than going through a system-open route.

## Necessary acceptance checks (actual Windows Chrome)

1. With no visible preview: **single-click JPEG or PNG in File Explorer → Chutey preview pane appears**; no Windows application or Explorer window.
2. With image preview visible: click next JPEG/PNG → same preview updates; no stale image. Double-click/Enter on file → in-Chutey preview, not Windows location or system app.
3. Click MP4/WebM/MP3 → pinned playback surface inside Chutey; selecting image while video is pinned displays the image alongside player, according to [#30](https://github.com/thanks-cohn/chute/issues/30), without involuntary video stop.
4. Explicit File Explorer context **Reveal / GO TO** → opens actual location in Windows Explorer; explicitly labeled **Open with system application** → uses system app; explicit **Preview** → in-Chutey pane.
5. **Shelf History:** Preserve the current image click/preview behavior. Its explicit **Open BUTTON** reveals the actual saved local containing folder by default, highlighting the file if feasible, subject to a Shelf-specific setting. **Popup** image tiles and expanded/maximized viewer have Copy Image alongside Trash, verified by an actual Windows clipboard paste; this feature does not add Copy to Shelf History previews. Invalid/missing items give truthful errors.
6. Ctrl/Shift multi-select does not cause a preview storm or `BUSY` lane exhaustion.
7. File Explorer directory navigation, approved-root consent and saved History are unaffected; no storage deletion, no extra folder-picker consent if existing grant remains valid.
8. Tests must cover FIRST click vs double-click/Enter, context menu, both History/Explorer tabs, settings defaults, Chrome restart, and existing saved History items.

## Implementation guardrails

- Use the existing preview APIs, do not add filesystem permissions, arbitrary path input, or bypass Windows guardrails.
- Keep the pinned-video lease independent of ordinary image navigation, and preserve user choice to explicitly Stop.
- Preserve data, installation, GOLD/reference workers, original styling, source bytes, History and backup archives.
- First investigate and report, then implement a **narrow targeted fix** on the development branch; do not silently merge/release or declare GOLD.
- **This is a product behavior specification, not a completed code fix.**
