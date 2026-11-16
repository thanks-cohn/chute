# Chutey popup: stable first paint (November 16, 2026)

## Reported issue
On clicking the extension popup, owner sees upper-left region appear, then right region, then the popup settles. Cause **not yet confirmed**; asynchronous thumbnail decode, first-run layout calculation, or initial browser popup painting are plausible.

## Requested now
- Popup geometry should be stable from first paint, independently of the native worker and thumbnail availability.
- Paint a complete gallery placeholder grid first, using inert fixed-geometry slots.
- Replace placeholders after history **data** arrives; allow actual thumbnails to decode progressively inside their existing tiles.
- Keep density controls, image preview, native bridge, history, drag/drop, and Shelf behavior unchanged.
- Do not wait for image downloads before first paint.
- Keep current native Windows worker byte-for-byte unchanged (see CURRENT-WORKING-PAIR.md).

## Implementation on this fix branch
- `extension/popup.html`: 16 static placeholders in initial 4x4 grid.
- `extension/popup-gallery.css`: visually quiet fixed-size placeholders.
- `extension/popup-gallery.js`: clear initial aria-busy state after the normal History renderer replaces the placeholders.
- Normal History renderer is still authoritative; thumbnails remain independently asynchronous. The existing code may still have layout or browser rendering causes for the reported flash. This fix is **not** yet verified in installed Chrome.

## Acceptance / verification
1. Open popup repeatedly with localhost healthy. Outline and card positions should appear stable without corner-by-corner assembly.
2. Repeat with slow image responses and failed thumbnails; placeholders should appear without waiting, then actual tiles should remain fixed as thumbnails decode.
3. Test with native worker stopped/disconnected. Popup should not shrink or shift; verify error feedback and recovery still work.
4. Repeat at 4x4, 5x4, 5x5, 6x5; grid size must remain stable.
5. Run existing popup/gallery tests and Chrome screenshots before merging.
6. Confirm there are no new animations, popup resizes, excessive image requests, or worker changes.

## Explicit scope exclusion for this Codex run
**DO NOT IMPLEMENT any entrance animation, including the earlier four-corners-first concept.** No staged corner reveal, decorative popup open effects, sequential shell construction, or animation-dependent opening. The sole goal is an immediate complete stable popup outline with placeholders first and progressive image loading inside fixed tiles. Any future four-corner entrance animation is a separate project and outside this run.

## Baseline
Source branch based on `archive-chutey-11.16.2026`. Original extension source commit `45dc8f034045c8807f5b712f7e8915c7ba76313a`. Native worker is the released November 4 TEST EXE matching SHA-256 `C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`; **not modified by this branch**.
