# CODEX REQUEST 3A — DEVELOPMENT 1 ONLY: Mini-popup settings and tiles; Shelf History cards

**Owner feedback: November 16, 2026.** Repository `thanks-cohn/chute`. Work only within Development 1: `codex/2026-11-16-phase1-repairs`. Initial tested repair source: `62694d6f821481c7857d134a8ddd1ba6e6aded83`. Read `CODEX-REQUEST-1-DEVELOPMENT1-FIX-AND-STOP.md` and the new master `CODEX-REQUEST-3-DEVELOPMENT1-OWNER-ACCEPTANCE.md`. **Do not begin Development 2**.

Related GitHub issues: [#15](https://github.com/thanks-cohn/chute/issues/15) and [#16](https://github.com/thanks-cohn/chute/issues/16).

## A. SMALL CHROME EXTENSION POP-OUT — NOT SHELF

The owner is talking about the **little extension popup that opens from Chrome's toolbar button**: `extension/popup.html`, `extension/popup-gallery.css`, `extension/popup-gallery.js`, `extension/popup.js`, and shared CSS. **Not the Shelf side panel, and not the separate Explorer or native Windows window.**

**Non-negotiable appearance/behavior: one scrollbar vertically, none horizontally.**
- Popup Settings currently exhibits *lateral/horizontal scrolling* and awkward separated scrolling areas. Arrange **every Settings control vertically in readable rows**; allow labels to wrap and form controls to shrink within 390px. No sideways/horizontal scrollbar, no offscreen controls.
- The **whole little popup has one natural top-to-bottom up/down vertical scroll surface** when its content exceeds Chrome's popup viewport. When Settings expands, it must push the gallery down in normal document flow, not overlay it with a separate scrollable 280px popover. Do not leave competing independent scrollbars inside Settings or the gallery.
- Inspect rules already in `popup-gallery.css`: `.settings-panel[open] .settings {position:absolute;max-height:min(280px,48vh);overflow-y:auto}`, `#files {height:400px;overflow-y:auto}`, and fixed `html/body` 390x590 `overflow:hidden`. Those actively create multiple scrolling/overflow regions. Refactor deliberately; not a cosmetic scrollbar-hiding patch.
- Maintain 4×4/5×4/5×5/6×5 density, 30-item paging, 120-item regression, gallery tile dimensions, placeholders/skeletons, calendar and navigation, and previews. Do not make tall Settings cause a tiny cropped gallery; scrolling the single popup is fine.
- For layout, prevent `min-width:auto`/fixed-width control overflow, and keep scrollbar gutter stable. Test at actual 390px popup viewport plus text zoom and long strings; no horizontal scroll (`scrollWidth <= clientWidth`) anywhere. Keep focus and keyboard access, no nested wheel scroll trap.
- This is **specifically the extension popup Settings**, not Shelf Settings. Shelf Settings gets a different History Export request (3C).

## B. Small popup thumbnails and expanded image

- **Single-click thumbnail/image -> enlarge it directly** (existing popup local lightbox can be reused). No Expand button on a tile or in the expanded view; **no X close button** in the tiny tiles or expanded image UI. Provide intuitive click-away/click-image-to-collapse behavior and **Escape**; keep previous/next where useful and keyboard accessibility/focus restoration. Avoid invisible uncloseable modal traps.
- **Right-click thumbnail OR its enlarged image -> compact native-feeling context menu**. The relevant menu item is a *small trash icon* (temporary, to be redesigned later) and exact visible text **`Trash It!`**. Not "Remove from Chutey", "Delete permanently", "Clear history", or an X.
- Action semantics: remove selected item **from the visible live Chutey/popup**, never permanently from dated History or original stored file. For an active item, review/reuse `DELETE /api/files/{id}` which removes the live queue record and appends a removal event while preserving the historical saved-item add event. For a dated/archived-only tile, **only hide it from the current popup presentation**, or disable the live removal command; never delete or rewrite a historical record or claim a live removal happened. Context menu must clearly reflect the non-destructive scope. After `Trash It!`, remove the visible tile and update lightbox selection/count and focus without ghosts. Verify original can be found via dated History and Recalled.
- A right-click must not unintentionally trigger file drag, auto-hide, thumbnail open, browser default menu over the custom menu or deletion without explicit click. Use a normal user-triggered action, no silent auto-delete. Provide keyboard or touch alternative to context menu without restoring X/Expand clutter.
- Inspect `popup-gallery.js` existing click-to-preview and lightbox markup (still has `.chutey-lightbox-close` ×), and `shelf.js` existing live removal. Reuse what works.

## C. SHELF History card — DIFFERENT SURFACE

In `extension/shelf.html`, `extension/shelf.js` and `extension/shared.css`: active card currently renders `size · timestamp · DRAG ME!` within `.file-meta` next to 3 action buttons and a grid with `42px minmax(0,1fr) auto`. On narrow panels owner sees `DRAG` at the end of line 2 and lone `ME!` at left of line 3.

- Keep the **whole exact phrase `DRAG ME!` together and readable** as a separate aligned label or dedicated line, not broken across lines. Align at left below concise metadata; let action buttons reflow to their own row if necessary on narrow Shelf widths.
- Preserve alternate states `Drag address` and `In history`, action semantics, keyboard interactions, history navigation and native scrolling. The fix must not affect popup tile geometry.

## D. Test/evidence and hard stop

- Browser screenshot/DOM regression for popup Settings **closed and expanded** at 390px, including all controls reachable with **one vertical scrollbar and zero horizontal scrollbars**. Test ScrollHeight/Width, wheel and keyboard, no clipped content.
- Screenshot Shelf History rows in narrow and normal Chrome side-panel sizes; `DRAG ME!` must remain whole, actions reachable, long names/times truncated gracefully.
- Test popup image click, Escape, click-away, arrow navigation, right-click `Trash It!`, live queue update and dated History recall. Check archive-only behavior never changes history. No X/Expand UI.
- Preserve original **YUMMY** verified-save reaction, 10-second mascot behavior, thumbnail lazy loading, original media, file contents, logs and transfer receipts. Run all relevant existing JS/Chromium tests; add explicit regressions.
- Do not reinstall/replace owner's working Windows worker or touch the archival backup. Commit source/tests on Development 1 and hand off owner test plan. **STOP: Development 2 NOT authorized.**
