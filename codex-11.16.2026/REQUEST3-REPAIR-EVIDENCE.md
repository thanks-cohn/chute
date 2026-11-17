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

## 3D — completed after 3C, before 3B implementation

Implemented native authenticated daily capture API with durable ID/digest intent,
per-capture immutable originals, worker-local received-at timestamp and exact two
empty lines between entries. Original chronological add events remain intact.
Recovery finishes known partial writes without truncating unexpected originals;
a damaged aggregate cannot prevent ordinary Store startup. Bounded 64-KiB text
pages serve popup reader and capture-position GO TO. Archived cards now offer
GO TO without Recall. Default decoration migrates OFF; Shelf-only explicit switch
persists across tabs/restarts and respects reduced motion. YUMMY source preserved.

`test_highlights.py` plus `test_explorer_media.py`: 16 passed, including concurrent
captures, DST repeated hour/day rollover, exact Unicode/newline bytes, stable
receipts and no implicit recall, restart/partial daily file/capture/history
recovery, changed-original fail-closed behavior, strict session/origin and no path
arguments. `verify-highlights-browser.py` passed: actual background capture
operation to real worker, daily file bytes, several-screen literal scroll reader,
long-word wrapping, paging, injection inertness, Trash/archived GO TO, inherited
true → OFF, Shelf-only opt-in/storage updates/reduced motion. Screenshot
`/tmp/chutey-request3d/popup-text-reader.png`. No installed Windows claims.

Repeated `verify-request3a-browser.py`, `verify-phase1-browser.py`, popup JS,
worker boot, thumbnail/icons, tabs/mascot, Explorer API/drag checks passed.
Windows native picker/shell, power-loss filesystem behavior and production Chrome
remain owner checks. Daily selection maximum 4 MiB; growing documents use bounded
pages rather than a full-memory read. See DAILY-HIGHLIGHTS-API.md for limitations.

## 3B — implemented last, after 3A/3C/3D passed

Confirmed paths: the old Explorer→local/web relay made a full arrayBuffer,
base64 string and File, capped at 32 MiB. Native Copy/Paste and internal reference
drops now use the SAME guarded Transfers engine through asynchronous jobs;
source/target verification runs outside the global Explorer lock. Known-ID
progress/cancel/results are persisted; accepted/running are not COMMITTED.
Actual OS File bodies can be picked/dropped into popup/Shelf History and stream
to Store with free-space checks, bounded buffers, fsync, independent SHA-256
readback and retained receipt IDs. Active/verification status is inspectable.
Duplicate intake IDs cannot remove another active staging file; preexisting
staging files are preserved. Unknown publication outcomes require review, not replay.

Shelf and small popup now BOTH support direct authorized-folder media. Popup has
an explicit Local media/Choose authorized folder route, using existing native
root grants; no arbitrary paths, original-file trash or automatic movie import.
Video/audio players share media_source ranges, metadata preload, cancellation and
release. Source transport remains format-independent; Chrome decodes. A real test
caught and fixed zero-width popup audio controls. Range/body concurrency has
separate reserved limits from directory/control requests. Successful status/read
POSTs do not fill logs; failures/mutations remain logged with existing rotation.

Linux real Chromium test `verify-request3b-media.py`: all **12 viewer cases** passed:
small MP4 1,031,341 bytes, WebM 1,242,705, MP3 122,296; genuine large generated MP4
45,679,223, WebM 67,078,232, MP3 36,003,047 bytes. Large video contains actual
high-entropy encoded frames; audio is 900 seconds, not sparse padding. Every format
played, paused, sought (large MP3 to 850s), closed and released in BOTH viewers.
All six native destination copies matched source SHA-256. A genuine 36,003,047-byte
browser File import also matched its persisted digest. This is in addition to
existing sparse 3-GiB range/HEAD/416/revocation tests, not a substitute for decoding.

During a verified large MP4→Live copy, simultaneous playback, 2-KiB range requests,
real listings and health checks succeeded. JSON evidence records measured times,
all exact hashes, copy durations, stream/control samples, traced Python peak and
browser version. Traced peak ~2.7 MiB is allocation evidence, NOT Windows RSS or
a promise for 4-GB hardware. CPU/browser decoder memory and owner disk throughput
need actual Windows measurements. HTTP native enrollment is simulated; filesystem
and decoder operations are real. No owner worker/process/profile was touched.

New copy tests cover 65-MiB real bytes to/from Live and approved local folders,
SHA-256, duplicate IDs, durable restart receipts/UNCERTAIN interruption, cancellation,
no-space failure, unauthorized origins/tokens/write scopes and changed identities.
Browser/File tests preserve original YUMMY; no completion on failed/partial/uncertain
receipts. Existing 120-card geometry, overlay, thumbnail, native wake and old schema
contracts were rechecked. The preview fixture's DevTools buffering/disposal race
was removed using its test-only direct HTTP Origin alias; production checks unchanged.

Integration fixes also retain export jobs across authenticated same-origin session
renewal and Shelf reopen. Ready ZIP expiry begins after construction, not before a
long build; native browser download completion is separately tracked. No second ZIP
is created to avoid a resource limit. OpenAPI and actual API docs were extended.

### Honest boundaries

Windows/installed Chrome owner acceptance remains pending. No claim of universal
OS/website drag, full-length lease renewal, resumable copies, 4K Movie Mode,
transcoding, mass Premium batches, unrelated integrations or Development 2.
Website byte relay stays bounded at 32 MiB; larger files use that website's file
picker. Local reference→mascot drop is rejected without saving its token as text;
Copy selected to Chutey is the supported native alternative. Actual OS file drops
and native-copy actions are distinct from opaque references. Upload default 8 GiB,
experimental disabled 300-MB interop, free disk and browser drag limits remain
separate. After abrupt death, owned stages may need scoped manual review; no
broad cleanup or source deletion. See DEVELOPMENT1-TRANSFER-MEDIA-API.md and the
owner Windows test plan for precise supported/unsupported paths and expiry limits.

Pre-push full Linux Python run: **126 passed, 12 skipped, 37 subtests**;
new isolated staging-preservation/digest-receipt test separately passed and is
now included in normal collection. JS/package checks and real browser regressions
passed. A transient 3A browser-run timeout during concurrent checks passed on
isolated repeat; no unexecuted/failed run is counted as an acceptance pass.
Upstream owner documentation about future multi-instance/compact Explorer is
preserved by merge; it remains explicitly held Development 2 work, untouched by
this implementation. The new Windows workflow builds on an ephemeral runner and
never executes a self-installing binary on the owner's machine.

### First Windows CI gate and corrections

Run 43991855855 (source 7dcbf49) failed before packaging; no failed binaries were
published. Four failing assertions were investigated rather than skipped:
- Two native-copy tests exposed a real final-state/capacity race under slower
  Windows fsync. Terminal status is now published under the job lock ONLY after
  its durable receipt and capacity release. A deliberately blocked final write
  regression proves a client cannot see completion early or get spurious BUSY
  on its next copy. Old worker-thread cleanup cannot clear a newer job's slot.
- The UTF-8 recovery file was correctly encoded; its test used Windows' default
  cp1252 reader. The test now explicitly decodes UTF-8. Persisted job JSON also
  explicitly reads UTF-8 to protect Unicode names after restart.
- Windows READ_ATTRIBUTES can enumerate a locked file while data access is denied.
  The profile-sibling test now verifies readable metadata or an honest blocked
  row AND independently asserts actual byte reads remain sharing-denied. No
  security bypass or production code relaxation was introduced for that test.

Shared media diagnostics now probe an erroring stream with a bounded HEAD and
safe X-Chutey-Error code. Available-source codec/damaged-file failures are distinct
from expired tickets, revoked sessions, missing/changed files and disconnected
workers. Real Chromium rejects a damaged MP4 with a decode-specific message;
the positive twelve media cases still pass. Cleanup detaches error callbacks and
uses existing release operations. Actual File bytes retain precedence over an
incidental opaque text sideband; opaque-reference-only mascot drops stay blocked.

Windows CI timing also showed the old “sparse” test fixture used ordinary NTFS
truncate, spending ~20–30 seconds allocating/zeroing 3 GiB per case. It now marks
only its newly created disposable fixture with FSCTL_SET_SPARSE before extension.
This changes no product/owner file, keeps the same logical 3-GiB range checks,
and makes the resource test genuinely sparse on Windows as well as POSIX.
