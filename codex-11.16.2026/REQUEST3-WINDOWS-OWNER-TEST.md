# Development 1 Request 3 — matching Windows candidate, owner acceptance pending

Only Development 1. Do not begin Development 2. Automated CI is not owner approval.
Source identity: `SOURCE-COMMIT.txt` in this package. Every file's hash is in
`SHA256SUMS.txt`. Use all three components from this ONE artifact/run together.
Old checkpoints, tags/releases and the protected archive remain unchanged.

## Protect the working machine

This package does NOT authorize silently replacing a running worker. Your current
working 62694d6 pair and production Chrome profile/data stay untouched. Preserve
the original archived EXE SHA-256
`C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`,
archive/chutey-11.16-worker at d0939d5 and the earlier GitHub release/build artifacts.
Do not uninstall, stop or restart the host worker to try this candidate.

**Use a disposable Windows VM or Windows Sandbox**, with its own Chrome profile,
localhost namespace and folders. A separate Chrome profile on the SAME Windows
host is insufficient isolation: native registration, port 17891 and self-install
locations are per-user/shared. Do not mount production saved files read/write in
the VM. Use copied samples/new files, never your only original. No test step
requires deleting your History, changing the archive or clearing production data.

## Files and exact opt-in installation

1. Download the successful **Chutey-Dev1-Request3-TEST-SOURCE-RUN** Actions artifact
   linked in the handoff, extract it **inside the VM**, and verify hashes:
   `Get-FileHash .\Chutey-Setup-Development1-Request3-TEST.exe -Algorithm SHA256`
   (and the helper/extension/checker) against SHA256SUMS. Confirm SOURCE-COMMIT.
2. Optional first check: run `Chutey-Phase1-Isolated-Check.exe`. This is **NOT an
   installer**. It uses only temporary data and a random port, does not register
   a native host, and exits. PASS covers actual packaged ZIP/timezone, highlight,
   thumbnail, range and copy modules, not an installed Chrome end-to-end flow.
3. The installer is **Chutey-Setup-Development1-Request3-TEST.exe**. Only inside
   that disposable VM, explicitly double-click it. It is self-installing: it
   creates the VM user's Chute companion/native registration/startup entries.
   The embedded helper is the matching `Chute-NativeHost.exe`; the standalone
   helper is for hash/protocol evidence, **not** something to replace by hand.
4. Extract `Chutey-Extension-Development1-Request3-TEST.zip` to a stable VM folder.
   In VM Chrome `chrome://extensions` → Developer mode → Load unpacked → select
   the directory containing manifest.json. Pin the test icon manually. Use only
   the VM test profile. Grant the added Downloads permission for native Save As.
5. Open a normal webpage and Shelf. Before selecting any external directory, test
   a daily text capture and History Export: the enrolled session should use only
   the read-only Saved Chutey files scope. Local media must still explicitly ask
   for an external authorized folder. If native enrollment is forbidden, note the
   exact unpacked extension ID and diagnostics; use the documented explicit-ID
   authorization in the VM (not a wildcard or production manifest edit). Existing
   production/explicit IDs must survive regeneration. Reload ONLY this VM test
   extension when needed. No step should reset Chrome or reinstall the host.

Keep adequate temporary free space before selecting large samples. The fixture
requires at least 1 GiB; your C: measurement (~2.27 GiB) is not enough to copy a
larger movie. Direct authorized media preview needs no whole-movie temporary copy.
Copy/import requires actual destination bytes plus a small reserve. Record actual
RAM, available commit and disk using the included/repository read-only diagnostics.

## Owner acceptance in required order

### 3A — small toolbar popup and Shelf History

- At 390px, Settings closed/open: exactly one right-edge vertical scrollbar for
  the document. Settings pushes gallery down, controls/tile pages reachable by
  wheel/keyboard, no adjacent gallery/Settings tracks. Check zoom/long labels.
- Browse at least 120 items/pages in 4×4, 5×4, 5×5, 6×5. All later cards remain
  square/full-size; opening has no new entrance animation. Calendar still works.
- Image single click enlarges immediately; no X/Expand controls. Escape/image/
  backdrop closes, focus returns, arrows browse. Right-click or Shift+F10 →
  small trash icon + exact Trash It!; only explicit click removes Live tile.
  Dated History/original bytes remain and Recall works. Archive-only action hides
  that popup presentation without modifying History.
- Shelf at narrow and normal widths: DRAG ME! stays whole on its own line; action
  buttons reachable; Drag address/In history retain their meaning.

### 3C — Shelf Settings History Export

- Export All history, Today and an inclusive custom range. Check your local IANA
  timezone label, cross-month/midnight and daylight-saving boundaries as relevant.
- Each operation produces **exactly one ZIP**, with history.csv, history.json,
  manifest.json. Empty scope still gives those members, no split volumes or
  separate CSV downloads. Counts include add/remove/clear/recall, not only Live.
- Verify Unicode/quotes/newlines; CSV formula-leading strings are safely prefixed.
  Local paths and URL credentials/query/fragment are excluded. Export is metadata
  only. Verify saved files, queue and source daily logs remain unchanged.
- Cancel while building/downloading; test an unwritable/full destination on a
  disposable test disk, never by filling your production drive. No partial ZIP
  is reported as a completed download. A genuine >4-GiB export/ZIP64 and destination
  filesystem limits require sufficient VM test disk and remain separate checks.

### 3D — daily highlighted text and animation preference

- Highlight Unicode/multiline text on a webpage → right-click Chutey, even with
  floating-only mode. Capture multiple entries same day and across local midnight.
- Daily document name Chutey Highlights YYYY-MM-DD.txt. Timestamp from worker
  acceptance is FIRST line of every entry. Then literal text; **exactly TWO
  empty lines** between entries, no leading blanks or decorative dividers.
- Open popup text tile: literal scrollable/wrapped reader, several screens,
  next/previous 64-KiB pages, no HTML execution, Escape/backdrop and focus work.
- Trash Live capture, then dated History GO TO: selects actual daily file and
  bounded passage preview in Chutey. Explicit Windows Reveal alternative selects
  daily file in VM Windows Explorer; not a source webpage. Recall still works.
- New and inherited version-1 animation settings start OFF. Only Shelf → Image
  and background settings has Animate background behind Chutey images. Explicit
  opt-in updates both surfaces, persists, and honors OS reduced motion.
- Confirm original GIF/mascot playback and original verified-save **YUMMY** reaction.
  Failed/partial/uncertain saves must not show a success reaction.

### 3B — both local viewers and actual transfer gestures

- Authorize a disposable local media directory through native picker. In Shelf
  preview, separately open small/large actual H.264/AAC MP4, VP8/VP9 WebM (audio
  codecs where present), MP3. Play, pause, seek forward/back, close/switch and
  check release. Repeat ALL formats in little popup → **Local media** → approved
  file → expanded player. No import is needed and originals remain unchanged.
- Record browser version, codecs, exact byte sizes and SHA-256. Recognized
  extension is not proof of a supported codec; note any actual decoder error.
  Tickets expire after ten minutes/current session after fifteen: reselect after
  expiry. Automatic full-length lease renewal/transcoding/Movie Mode is not included.
- While playing/seeking, Copy selected to Chutey or Copy/Paste into a WRITE-approved
  local folder. Browse another directory and query health; record responsiveness,
  worker/Chrome working set, peak commit, disk and throughput on your 4-GB machine.
- Native copy jobs must reach **COMMITTED**, not merely accepted. Verify source
  and destination Get-FileHash SHA256 and exact sizes. Sources are copies, never
  moved/deleted. Cancel/check pending ID; verify no false completion. One job runs
  at a time; progress bytes exclude the additional verification passes.
- Test Add files/actual OS File drop into popup/Shelf History, and actual File
  drop into WRITE-approved Explorer. Default upload ceiling 8 GiB is distinct
  from free disk and the **32 MiB website drag** fallback. Imports stream File
  bodies; retained ID/Check import handles uncertain receipts without replay.
- Chutey Explorer internal drag/Copy/Paste uses native scoped jobs, no giant
  base64 IPC. Dropping an opaque local reference into mascot is explicitly
  rejected; use Copy selected to Chutey instead. Never save its token as text.
- Website inputs only have bounded legacy relay ≤32 MiB. For larger files use
  that site's native file picker with original local file. Normal Windows drag
  targets depend on Chrome/OS; use Chutey Copy/Paste to an approved folder as the
  explicit reliable alternative. No universal website/Windows drag claim.
- In VM-only files: duplicate names, revocation, locked/missing/replaced source,
  expired ticket, interrupted upload/lost receipt, cancel, full test destination,
  restart after interruption. Inspect destination before any explicit retry.
  Crash recovery preserves source/job status but does not automatically resume
  partial copies; abrupt death may leave owned .part/.chute-stage files for review.

## Reproduction and rollback

Build from SOURCE-COMMIT in a fresh Windows checkout, Python 3.12:
`powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1` and
`powershell -ExecutionPolicy Bypass -File scripts\build-phase1-isolated-check.ps1`,
then `python scripts\build-chrome-store.py`. Build dependency versions are included;
PyInstaller/Pillow/tzdata are pinned. Windows runner image/toolchain timestamps can
change binary bytes; hashes identify THIS exact artifact, not a promise of
bit-identical PyInstaller builds on every host. CI never installs on your machine.

After VM review, discard the VM/test profile to roll back. The production host,
its worker and saved files were never changed. Do not run an old installer over
this test data or migrate original logs as a rollback shortcut. Keep all earlier
release/tag/archive references. If you later want production promotion, request
it separately after your owner acceptance. Development 2 remains unauthorized.
