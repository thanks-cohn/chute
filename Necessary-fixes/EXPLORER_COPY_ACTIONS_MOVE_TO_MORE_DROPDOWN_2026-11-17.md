# NECESSARY FIX — Move Explorer clipboard/copy-recovery toolbar into More dropdown

Date: November 17, 2026
Status: Specification only; not implemented.
Repo/branch: thanks-cohn/chute / fix/chutey-media-worker-2026-11-17

## Owner report and screenshot

The owner provided a screenshot showing the permanent row of six buttons taking up substantial screen space directly above the File Explorer folder/file view, and said:
> "THIS should be in like a drop down menu called More > 'Copy Paste Review previous copy Verify destination Cancel copy Dismiss after review' not hogging all the ... space in the file explorer"
> "you see what i mean? i dotn whnt that there"

**Non-negotiable owner requirement:** REMOVE the entire always-visible six-button horizontal strip, including its border, line wrapping and occupied vertical space. Put these same commands under ONE compact **More ▾** dropdown in the Explorer toolbar, in this exact order:

1. Copy
2. Paste
3. Review previous copy
4. Verify destination
5. Cancel copy
6. Dismiss after review

Do not leave an empty spacer. Do not merely reduce the font size or hide half the buttons. Do not make the replacement menu consume space until opened.

This should be a clearly labeled standalone More dropdown in the File Explorer controls rather than hiding all these operations inside the separate Folder Access permission-settings menu.

## Exact inspected source (tested P0 version 1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122)

- extension/explorer-view.js lines 13–15: creates copyBar (class ex-copy-toolbar), inserts all six buttons, and inserts the row before .ex-workspace.
- extension/explorer-view.js lines 329–333: attaches operation callbacks. Reuse the original callbacks; do NOT change safe copy/recovery API or receipt semantics.
- extension/explorer-view.css lines 142–143: flex-wrap six-button toolbar and border take vertical space. At max-height 500px CSS around lines 150–151 hides the last three; owner requires all six reachable in More at any width and height.
- Existing Folder Access settings dropdown is separate; retain its controls, permissions and behavior. Use safe menu dismissal/interaction patterns without mixing the two menus.

## Acceptance criteria

1. At compact 300–400px Shelf width AND larger sizes, original six-button toolbar row, its divider and consumed height are completely gone. Folder tree/list gains the freed space.
2. A single accessible **More ▾** control opens a small popover/dropdown listing all six actions in specified order. Keyboard Enter/Space, Escape, focus return, outside click and screen reader naming function correctly. Menu stays on screen without interfering with preview panes or Folder Access.
3. All six actions work as before: Clipboard Copy/Paste, pending-copy Review/Verify/Cancel, and Dismiss after review.
4. Maintain safety: unknown/uncertain copy outcomes cannot be silently replayed, confirmation on dismissal still required, immutable receipts/History retained, no write permission granted by opening menu.
5. Context-specific disabled/empty states should be truthful; Ctrl+C/Ctrl+V and right-click menu workflows remain functional.
6. Confirm no extra row/placeholder remains, including during a video plus image preview and the future full-height split design (Issue #30).
7. Regression tests including actual Windows Chrome Shelf screenshot; never assume a UI fixture alone proves layout.

Related: https://github.com/thanks-cohn/chute/issues/30 (preview layout), https://github.com/thanks-cohn/chute/issues/9 (native Browse picker).

Do not modify GOLD references, saved data, archives or installed worker. This document is a requested necessary fix, not a completed code change.
