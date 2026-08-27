# Chutey holding expression deck

Drop numbered mascot images in this directory to give Chutey randomized expressions while a file is held over him without being released.

Supported extensions: `.png`, `.webp`, `.gif`

Use contiguous numbering starting at 1:

- `1.png`
- `2.png`
- `3.png`
- ...

You can use up to 32 images. Do not leave gaps in the numbering; discovery stops at the first missing number.

Behavior:

1. A file enters Chutey: `../grab.png` is shown immediately.
2. If the file remains there for a randomized 2–3 seconds, the holding deck begins.
3. Chutey randomly chooses a holding expression and changes at irregular intervals (roughly 0.65–1.8 seconds).
4. The same frame is not intentionally selected twice in a row.
5. Moving the file away or dropping it cancels the holding state immediately.
