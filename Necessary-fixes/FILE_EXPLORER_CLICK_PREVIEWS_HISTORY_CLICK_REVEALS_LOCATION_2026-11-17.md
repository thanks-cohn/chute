# NECESSARY FIX — File Explorer click PREVIEWS; History click OPENS saved local location

**Owner clarification:** November 17, 2026  
**Priority:** Critical interaction/UX correctness; owner-device regression  
**Repository/working branch:** `thanks-cohn/chute` / `fix/chutey-media-worker-2026-11-17`  
**Related preview-layout issue:** [#30](https://github.com/thanks-cohn/chute/issues/30).  
**Scope:** Restore user-intuitive click semantics. Separate from P0 Windows Browse picker failure [#9](https://github.com/thanks-cohn/chute/issues/9) and the separate BUSY/lane investigation.

## Owner's explicit rule

> Clicking the image opens the local location! NO! I wanted that for HISTORY, obviously not for the File Explorer. If the File Explorer is already there, it should open the preview pane! If it's the History thing, that should open the local location.

There are **two distinct contexts** and their actions MUST NOT be inherited blindly from one another:

| Context | Default click/tap on image or file | Default double-click / Enter | Separate explicit actions |
|---|---|---|---|
| **File Explorer** (user is already browsing their local filesystem in Chutey) | **Select and open/update the in-Chutey preview pane** on the FIRST click, even if the preview pane is currently closed | **Preview/open inside Chutey**, not Windows File Explorer or the associated system app; Enter should have the same intended result | Context menu may offer **Preview**, **Open in Windows associated application**, **Reveal / GO TO in Windows Explorer** as clearly different, explicitly labeled commands |
| **History** (saved Chutey items) | **Open/reveal the saved file's local directory in Windows File Explorer, selecting/highlighting that file where supported**; do not confuse this with navigating an already open Chutey File Explorer | Same local-location behavior unless an explicitly labeled alternate action is used | Keep explicit **Preview in Chutey** if desired, **Open saved file with app**, and **Reveal location**; unambiguous labels rather than an overloaded generic Open |
| **Folder row in Chutey File Explorer** | Select; double-click/Enter navigates into that folder; a convenient single-click navigation can be evaluated separately | Navigate into folder, not file preview | Explicit Windows location action if desired |

**Crucial usability constraints:**
- A first click on a file **must create/show the preview pane**. It must NOT require the pane to have already been open.
- Clicking a second image updates the **same** image/document preview without spawning Windows Explorer, launching Paint/Photos/another app, or opening a second independent image pane.
- Selecting an MP4/MP3/WebM launches or updates the intentional **pinned media preview** within the established Chutey media surface, rather than opening Windows Explorer. Respect original media authorization, playback leases, Stop/Close and existing user-selected playback settings; do not regress streaming.
- Browser-standard multi-select modifiers (Ctrl, Shift) must NOT inadvertently open many previews; when selecting ranges, maintain selection without unnecessarily streaming/previewing every item. Single click without modifiers previews.
- **History location** is the authoritative saved-file directory, not a reconstructed guessed path, arbitrary folder grant, or History's date/category view. If a saved file was deleted/moved, report an explicit missing-file result; no arbitrary directory access.
- The History rule applies to the item action explicitly requested by owner; if existing thumbnails have intentional lightbox behavior, separate the visual preview affordance from the primary local-location affordance and make it obvious. Do not unintentionally remove gallery functionality or saved-history retention while implementing the owner's desired default.
- A system Open and system Reveal must **never** share one ambiguous default in File Explorer. Preferences may configure explicit commands, but the File Explorer primary click/Enter remains internal preview under this clarified product rule.

## Inspected source showing why this mistake happened (exact TEST source `1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122`)

1. `extension/explorer-view.js` file row `node.onclick` currently does `select(row,event)` and conditionally invokes `showPreview(row)` **only if** `!preview.hidden` and the row is a non-media file. Therefore first click when preview closed does not open it, and selecting a media file is handled differently.
2. Its `node.ondblclick` and `node.onkeydown` Enter call `fileAction(row,'open')` for files.
3. `fileAction` reads `window.ChuteyFileActions.get().chuteyOpenTarget` and dispatches `api.command('open',...)` for `target==='system'` by default; this takes File Explorer out of the Chutey preview experience.
4. `extension/file-actions.js` defines defaults `chuteyRevealTarget:'system',chuteyOpenTarget:'system'`, and the Settings panel currently uses broad shared preferences across contexts. Split these appropriately so the history reveal preference does not change what clicking a local file in Chutey File Explorer does.
5. `extension/shelf.js` History actions include `window.ChuteyFileActions.saved(file,'reveal')` for **Reveal/GO TO** and `saved(file,'open')` for Open; `extension/shelf-gallery-preview.js` separately makes History cards preview images. This pre-existing design has a tension with the owner's new directive; Codex should intentionally specify/update the primary History click hit target and explicit preview affordance, not accidentally suppress History's optional in-Chutey image viewer.
6. `extension/explorer-view.js` already has `showPreview(row)` and `showPinned(row)`, so the normal File Explorer click should use those internal preview controls directly rather than going through a system-open route.

## Necessary acceptance checks (actual Windows Chrome)

1. With no visible preview: **single-click JPEG or PNG in File Explorer → Chutey preview pane appears**; no Windows application or Explorer window.
2. With image preview visible: click next JPEG/PNG → same preview updates; no stale image. Double-click/Enter on file → in-Chutey preview, not Windows location or system app.
3. Click MP4/WebM/MP3 → pinned playback surface inside Chutey; selecting image while video is pinned displays the image alongside player, according to [#30](https://github.com/thanks-cohn/chute/issues/30), without involuntary video stop.
4. Explicit File Explorer context **Reveal / GO TO** → opens actual location in Windows Explorer; explicitly labeled **Open with system application** → uses system app; explicit **Preview** → in-Chutey pane.
5. In History, primary **location action** for a saved file opens the actual local containing folder with file highlighted if feasible. Invalid/missing item yields truthful error; the History image preview/lightbox remains available through its separately labeled action.
6. Ctrl/Shift multi-select does not cause a preview storm or `BUSY` lane exhaustion.
7. File Explorer directory navigation, approved-root consent and saved History are unaffected; no storage deletion, no extra folder-picker consent if existing grant remains valid.
8. Tests must cover FIRST click vs double-click/Enter, context menu, both History/Explorer tabs, settings defaults, Chrome restart, and existing saved History items.

## Implementation guardrails

- Use the existing preview APIs, do not add filesystem permissions, arbitrary path input, or bypass Windows guardrails.
- Keep the pinned-video lease independent of ordinary image navigation, and preserve user choice to explicitly Stop.
- Preserve data, installation, GOLD/reference workers, original styling, source bytes, History and backup archives.
- First investigate and report, then implement a **narrow targeted fix** on the development branch; do not silently merge/release or declare GOLD.
- **This is a product behavior specification, not a completed code fix.**
