# Chutey grab assets

The browser mascot looks for these bundled state images in this directory:

- `default.png` — normal resting state
- `hover.png` — pointer-over / attentive state
- `grab.png` — active drop/grab state; also used as the small Grab button icon

If one of these files is absent or cannot be decoded, Chute falls back to the built-in CSS mascot so the floating mascot never becomes invisible just because an art asset is missing.

Users may optionally override each state from Chute Settings. Those user-selected images are stored locally in `chrome.storage.local`; bundled assets remain the default and no image is uploaded to a Chute server.
