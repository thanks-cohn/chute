# Alternate Chuteys — artwork drop folder

Put each Chutey expression here as a separate **PNG, WebP, JPG or GIF** file. For best results use square transparent PNG/WebP, about 128×128 or 256×256 pixels, and keep each file modest in size.

Example:

```text
alternate-chuteys/
  smug.png
  astonished.webp
  noodle-brain.gif
```

After adding artwork, from the **repository root**, run:

```powershell
node scripts/sync-alternate-chuteys.mjs
```

This copies accepted images into `extension/alternate-chuteys/` and regenerates its `manifest.json` in a stable order. Chrome loads **only files packaged in the extension**, not arbitrary repository folders, so this step is necessary before reloading the unpacked extension in `chrome://extensions`.

The existing default Chutey remains available as another expression. Link tiles choose from packaged expressions, avoiding identical left/right and up/down neighbors in the currently selected 4×4, 5×4, 5×5, or 6×5 popup layout. The assignment is deterministic for a given page of items and layout, not a new random spin every paint. As you add faces, the variety increases. With only one available expression, unique neighbors are impossible; add at least one alternate. A fallback may appear if an image fails to load.

**Art is cosmetic only.** Never run code from image packs. Avoid enormous animated GIF files; large animations can hurt popup performance. Existing saved items/history are unchanged.

The **popup** is the initial consumer; Shelf icon behavior is not changed in this phase.
