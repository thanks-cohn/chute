# Request 3 sequential repair evidence

Development 1 only; installed worker, profiles, archives and user data untouched.

## 3A — completed before 3C implementation

Confirmed root cause: fixed 590px body plus independent 400px gallery and
absolute, 280px scrolling Settings created competing vertical scroll surfaces.
Settings and gallery now use natural document flow and one root scrollbar.
Every implicit grid row retains its width-derived square geometry. History
metadata and the unbroken DRAG ME!/Drag address/In history label have separate
lines; narrow Shelf actions use their own row.

Popup image preview opens directly, closes via image/backdrop/Escape, restores
focus and retains arrows. No X or Expand. ContextMenu/Shift+F10 and right-click
open Trash It!: live DELETE preserves bytes and historical add; archived-only
hides that popup presentation without writing History. Failure stays visible.

Executed Linux Chromium HTTP fixtures (native enrollment simulated):
- `verify-request3a-browser.py`: one root scroll surface with Settings closed/open,
  all controls reachable, no horizontal overflow, 120 square cards in four
  densities; image/keyboard/context menu and non-destructive archive behavior;
  narrow/normal Shelf screenshots in `/tmp/chutey-request3a/`.
- `verify-development1-browser.py`: 120-card geometry, old fault reproduction,
  thumbnail setting, Explorer keys/overlay, actual small MP4 and padded MP3,
  saved-file Reveal and explicit system routing passed.
- `verify-receipt-browser.py`: real trusted browser drops and original YUMMY,
  failed/partial/uncertain receipt cases passed.
- JS popup gallery and Python Settings DOM boundary checks passed.

Actual installed Chrome, OS zoom/touch, Windows native shell and owner acceptance
remain pending. These HTTP fixtures do not claim Windows installation validation.

## 3C — completed after 3A, before 3D implementation

Shelf Settings owns the sole export UI; popup has none. Uses authenticated native
command sessions and a scoped download capability, one ZIP64 temporary archive,
streamed CSV+JSON representations of complete chronological event snapshots,
CRC checks + SHA-256 before ready. Save As uses native browser Downloads, not a
whole-archive JS Blob. Cancellation and failures clean owned temporary output.

`tests/test_history_export.py`: 8 passed. Includes DST fall-back, local/UTC
midnight, removed/recall/clear events, empty Today, invalid dates/timezone/extra
path input, Unicode/quotes/newlines/formulas, URL-secret/local-path redaction,
foreign job owner, ZIP64 structures with reduced stdlib size boundary, concurrent
appends excluded from snapshot, disk-error cleanup, cancellation and 15,000-event
stress. Traced peak Python allocation: 925,575 bytes (not whole-process RSS).
`verify-history-export-browser.py`: real single browser ZIP download, actual
CSV/JSON/event counts and unmodified source logs; Shelf-only placement passed.
Screenshot `/tmp/chutey-request3c/shelf-export.png`. Native enrollment simulated.
Actual >4-GiB ZIP, Windows destination filesystem limits and installed Chrome
Save As remain owner acceptance checks; the size rule uses Python ZIP64 rather
than an arbitrary split limit. See HISTORY-EXPORT-API.md for implemented contracts.
