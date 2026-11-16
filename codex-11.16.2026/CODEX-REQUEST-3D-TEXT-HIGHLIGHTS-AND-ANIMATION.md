# CODEX REQUEST 3D — DEVELOPMENT 1 ONLY: Highlighted text -> daily file; popup text preview; History GO TO; background animation OFF

**Owner follow-up, November 16, 2026.** Repository `thanks-cohn/chute`, branch `codex/2026-11-16-phase1-repairs`. Issue [#19](https://github.com/thanks-cohn/chute/issues/19). Read the master [Request 3](CODEX-REQUEST-3-DEVELOPMENT1-OWNER-ACCEPTANCE.md); implementation order is 3A, 3C, **this 3D**, then 3B **worker streaming last**. Do not start 3B's worker rewrite while working on this request. This is part of **Development 1**, and **Development 2 remains explicitly unauthorized**.

## 1. Highlight text → right-click "Chutey" → timestamped DAILY TEXT file

Owner user flow:
1. Highlight/select text on any supported normal webpage.
2. Right-click the selection and choose the obvious **Chutey** action in the Chrome context menu, exactly as with images (avoid making selection context unavailable just because floating mascot is enabled).
3. The full selection is sent to the existing **local** Chutey companion, saved durably as real plain UTF-8 text, associated with the **user's local date** (not an unspecified timezone).
4. **Organize the selected text in a daily text file**, e.g., `Chutey Highlights 2026-11-16.txt`. Each new capture on that date is a new clearly separated, individually timestamped passage; don't overwrite earlier highlights. New day → new daily file.
5. Preserve stable per-capture identities/history records, so every capture remains discoverable in dated History and GO TO can find its precise daily text document. Prefer a stable entry locator (capture ID / timestamp / offset) so GO TO can scroll to that passage inside the file, without allowing arbitrary filesystem paths. Distinguish storage date from UTC history event date, DST and cross-midnight boundaries. Design safe append/update with atomicity, concurrency, recovery and duplicate-suppression after lost receipts; don't change/delete an existing original without a verified plan.
6. Don't turn selected text into markup/HTML, don't change webpage selection content or silently alter spacing, line breaks or Unicode; record page/source metadata only to the extent already authorized and keep it out of the visible text unless intended. Avoid gratuitous memory copies for large selections.

**Existing code:** `extension/background.js::sendContextToChute` already handles `info.selectionText` but currently uploads one `selection-<timestamp>.txt` for **each** selection. `extension/background-context-menu.js` only adds `selection` to the context menu in `context`/`both` modes, while image context is always present. Extend rather than regress the existing image right-click handling and verified `/api/upload` receipts. `src/chute/store.py` uses append-only dated history events, which must remain immutable.

**Uncertainty to resolve in code:** If the daily file is a living append-only aggregate, don't confuse a capture's source item ID with its daily document ID. Model daily document + distinct timestamped capture records or an equivalent safe, retrievable mapping. A capture removed from Live never erases historical text or the daily file.

## 2. Small Chrome popup: expandable TEXT reader, scroll vertically

The owner means **the 390px toolbar extension pop-out**, not Shelf's File Explorer. Text items are legitimate gallery tiles, just like image tiles. Clicking a text tile opens the popup's enlarged viewer, rendering the **actual saved UTF-8 text** with original line breaks, readable typography and vertical scrolling within the expanded reading view. Handle long paragraphs by wrapping, not horizontal scroll. No inner X or Expand button; close via click-backdrop/Escape with focus restored, and retain selection/history navigation controls where applicable. Avoid unsafe `innerHTML` for user content: `textContent` or equivalent escaped DOM only. Read in bounded chunks/pages for long files so a 4 GB Windows machine remains responsive. The normal popup Settings/gallery page retains **ONE vertical scrollbar and ZERO horizontal scrollbars** when the expanded reader is closed (see 3A); the expanded modal's reading scroll must be intuitive and not trap background scroll/focus.

**Existing code:** `extension/popup-gallery.js` has a click-to-lightbox handler only for `isPreviewableImage(file)`. `extension/shelf.js::fileKind` already detects `text/` and `.txt`. Reuse one preview surface for image and text, do not create incompatible overlays or reintroduce close-X UI.

**History GO TO:** In Shelf History, `Reveal / GO TO` for a saved highlight navigates to the exact saved daily file (and ideally to the correct timestamped selection inside it) via existing `extension/file-actions.js` / file action preference. Default Chutey File Explorer, explicit Windows Explorer option; never claim to open a file if it wasn't found, never silently open an unrelated source page. A removed-from-Live highlight remains searchable and recallable.

**Trash It!** popup context menu applies only to the live item; it never erases the stored daily file or its original recorded highlights. Context menu label **Trash It!** with small temporary trash-can icon, exactly as specified in Request 3A/#16. History entry remains.

## 3. Default animation behind Chutey images OFF; Shelf Settings option

The owner dislikes the spinning geometry/orbit in the background **behind Chutey pictures/icons** in the mini popup. Disable **decorative fallback-card animation by default**, including on pre-existing installations that inherited the current default-on setting unless they explicitly opted in. Preserve Chutey mascot itself, original animated characters/GIF playback, **YUMMY verified-save success reaction** and normal file thumbnails.

Add an obvious persistent **"Animate background behind Chutey images"** switch under **Shelf → Image and background settings**, not the little toolbar popup Settings. OFF: no moving background geometry behind Chutey images (static image/solid backing, no hidden animation consuming CPU). ON: optional original visual effect returns without affecting saved files or thumbnail display. Respect operating-system reduced-motion preference. Ensure toggle updates both mini popup and Shelf promptly, survives restart. Consider migration/versioning to avoid old `animation:true` defaults being resurrected through storage.

**Existing code:**
- `extension/default-presentation.js` sets `defaults.animation:true` and currently injects animation switch wherever a `[data-presentation-settings]` fieldset exists, including popup and Shelf. **Only Shelf should show this specific control.**
- `extension/default-presentation.css` owns animated `file-icon.chutey-mascot-fallback::before/::after`.
- `extension/popup-gallery.css` separately defines `chute-gallery-turn` animation on mini popup icons (and has overrides at bottom). Gate both sets consistently using the persisted switch and CSS rules. Avoid unintentional CSS specificity overrides that make the animation move despite OFF.
- Do not merely disable all animation globally; the YUMMY/success sequence must stay intact.

## Verification and delivery

- Browser integration: highlighted text with line breaks, emoji and accents; multiple captures same local day, different local days, copy source preserving Unicode; no dropped writes, duplication after uncertainty, incorrect timestamps or wrong History date.
- The **exact saved text** survives restart and is viewable in popup expanded scrollable text reader. Test several screens of text, very long words, text injection (HTML/JS as literal characters), keyboard, wheel, Chrome 390px popup and no lateral overflow.
- History GO TO after Live "Trash It!" navigates/locates correct saved daily file and capture, and does not erase original. Other text/image/file GO TO behaviors unchanged.
- Existing default-on data migration and new install both show background **OFF** until explicitly enabled in Shelf; custom selection persists across Chrome restarts and updates; popup and Shelf honor state; reduced-motion respected; no change to YUMMY.
- Screenshot plus automated UI tests with clear test results, source changes and any limitations. No silent modification to user's installed companion, user files, archive, history or production Chrome profile. If native change needed, build a newly named **matching isolated** Windows test artifact and extension for owner consent.
- Commit/push on Development 1 branch; provide owner Windows acceptance instructions and STOP. **Do not start or create Development 2.**
