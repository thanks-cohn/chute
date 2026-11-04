# Intuitive Explorer implementation — TEST only; acceptance incomplete

This branch implements the 2026-11-04 P0 brief. It is not a release approval.
Do not merge or install over the only known-good pair until Windows acceptance is recorded.

## Picker/reconnect investigation

Compared the reported pair source `b0727d56f89484d110fe7b1d24e12ba9bf476611`
with baseline main `5cb7ff304d7fb5150c4aa1919dc0c73b1519987c`.
Both use SHBrowseForFolderW, a console-subsystem NativeHost, and invalidate the
previous session on each resume. Neither browser transport renews expired sessions.
These are confirmed code findings, not identification of the owner's observed window.
The native picker is called only by explicit select actions in these sources;
we have NOT reproduced a spontaneous picker, identified its owning process/window,
or captured Windows taskbar evidence. Linux cannot establish those facts.

Changed warm resume to preserve a valid token/adapter across simultaneous surfaces;
expired sessions renew using the existing guarded root and remembered location.
The browser coalesces concurrent resumes, retries auth rejection once, and recovers
read-only requests from a cold bridge. A network failure never automatically replays
a potentially committed write. An invalidated process-local handle reloads the saved
location once. Cancelled selection leaves the prior grant and view untouched.
Bridge errors retain a distinct category instead of instructing users to select again.

The explicit picker now uses IFileOpenDialog/FOS_PICKFOLDERS on an STA request thread,
owned by the foreground window. No Tk/helper owner window or legacy fallback is created.
The NativeHost uses the GUI subsystem and wraps inherited Chrome pipes without
allocating a console. The packaged framed-RPC CI test remains a required gate:
windowed packaging is NOT validated merely by Python unit tests.
A failed helper exits without a PyInstaller exception popup.

For Windows reproduction, `%LOCALAPPDATA%/Chute/explorer-events.json` retains at most
64 action/outcome/duration records, without paths, handles, filenames, tokens, or bytes.
This distinguishes explicit select requests from resume and records cancellation/errors.
It is a diagnostic aid, not evidence that a picker actually became visible.

## Drag and interaction implementation

The previous dragstart deliberately cancelled the first attempt, copied into Live,
and requested a second drag. It now emits a short-lived opaque source reference on
attempt one. Only extension pages can register it. The worker resolves the guarded
original on drop; the session token never goes to the webpage. Registration/drop
ordering is awaited and references survive worker suspension in session storage.
Expired references are removed on the next registration. Source identity and origin
authorization are still checked on the content endpoint. No original is pre-copied
into Live. Binary files retain their bytes/MIME; exports have attachment/nosniff headers.

This is the existing browser-adapter pipeline, NOT a native Windows OS file drag.
Receivers may reject synthetic file events. No upload success is asserted from event
dispatch. Receiver errors display a brief inline notice. This bounded browser path
supports one file up to 32 MiB (leaving room for base64 within Chrome message limits); larger files require the destination's file picker.
Premium entitlement is not invented: bulk selection works, but bulk transfers remain
unavailable pending an authoritative entitlement adapter. REDOWN is not implemented.

Single click selects; double click/Enter previews or enters folders. Ctrl/Shift,
loaded-item Ctrl+A, selected right-click preservation, and geometric grid arrows are
implemented. Closed previews stay closed on arrows; open previews follow selection.
Explorer and Shelf History previews participate in document flow beneath their row.
Copy/Paste and Ctrl+C/V support an internal single-file byte clipboard and confirmed
KEEP BOTH writes. This is NOT the Windows OS file clipboard; cross-application paste
is not implemented or claimed. Rename remains unavailable because its native command
is not authorized by the existing engine. Folder Access holds permission/troubleshooting
controls; the splitter retains path-free ratio persistence.
Branding uses Your Everything, DRAG ME!, and the existing Feed Chutey! action.

## Executed checks and evidence

- Complete pinned pytest 9.2.0 suite: 77 passed, 9 Windows-only skips, 37 subtests passed (Linux).
- Python unittest discovery: 76 run, 67 passed, 9 Windows-only skips (Linux).
- New regressions: 20 resumes without picker; expiry rotation; cancel preserves session
  and location; bridge failure category; authenticated exact binary export without Live
  mutation, stale identity and unauthorized reads rejected.
- `node scripts/verify-explorer-api.cjs`: stale pairs rejected, concurrent resume
  coalesces, expired request retries once without selecting.
- `node scripts/verify-explorer-drag.cjs`: first-drop exact bytes, registration/drop
  race, worker restart with persisted reference, active receiver and expiry restrictions.
  This is a JS worker harness, NOT real website acceptance.
- Worker boot, thumbnail, tabs/mascot, Settings boundary, package contracts and JS syntax.
- `PYTHONPATH=src python3 scripts/verify-explorer-browser.py --fixture <output>`:
  real Linux Chromium, HTTP-served extension assets, simulated Chrome/native APIs,
  production Python read backend. Passed at 390px list and 900px grid: click/arrow/preview,
  range selection, context selection, first-drag reference (synthetic dragstart), keyboard
  splitter, thumbnails, text scrolling, History inline positioning and tab restoration.
  Screenshots and measurements: [evidence](evidence/intuitive-interactions/results.json).
  Screenshots show the changed fixture UI, not the owner's Windows system or a before/after
  Windows reproduction. No first-attempt real website delivery counts are available.

Installed-extension execution was attempted separately with system Chromium. Initial
service-worker waits timed out; the explicit unpacked-extension CDP loader diagnosed:
**Loading of unpacked extensions is disabled by the administrator.** The managed browser
policy was not modified. Consequently no installed-extension or real website interaction
result is claimed here. Fixture mode does not establish extension permissions/enrollment.

## Matched artifacts, installation and rollback

The first remote Windows run (41838330949) failed its old assertion that warm resume
must rotate the token. That assertion now checks shared-token validity across 20 reopens
and rotation only after expiry; no tests were disabled. The updated run is required.

The branch triggers `.github/workflows/explorer-windows-pair.yml` (or dispatch on this
exact branch). It tests Windows filesystem behavior, builds both halves from the same
checkout, installs the test EXE in an isolated CI home, checks the bundled helper's
SHA-256 and framed native protocol, then uploads ONE artifact named
`Chutey-Windows-Chrome-Explorer-TEST-<full SHA>`.
It contains the EXE, Chrome ZIP, SOURCE-COMMIT.txt, SHA256SUMS.txt and this evidence guide.
It does not publish a release. A green CI run still does not satisfy interactive gates.
The earlier successful run [41838687885](https://github.com/thanks-cohn/chute/actions/runs/41838687885)
built a matched pair at `5f6057c647d394f42563986b440a5ff844b5d564` (85 cases, zero failures,
14 platform skips). The follow-up source adds a real Shell picker open/count/cancel
Windows test; it explicitly skips if no input desktop is accessible. Even a pass is a
Windows runner UI check, not Windows 11/Chrome user acceptance. Use the artifact pinned
to the final commit being reviewed, not files mixed from different runs.

No locally built Windows EXE is claimed: the current development machine is Linux.

Before installation, verify all hashes and the source SHA in the matched artifact.
Back up Chute's data and protected grant state while its companion is stopped; keep
both halves of the previously working pair. Stop the old companion, install the TEST
EXE, and load the unpacked Chrome ZIP in Developer mode (avoid simultaneous test copies
with different extension IDs). Check health and native protocol before testing grants.
Rollback by stopping the TEST companion and reinstalling both previous matching halves;
restore backed-up data/grants if needed. Do not revoke working grants just to switch builds.

## Outstanding stop-ship gates

Windows 11 installation and real UI interaction remain unexecuted. Record process/build
SHA, parent-child tree, window class/title, exact native request sequence and redacted
screen recording including taskbar. Reproduce the reported old pair before calling its
window cause fixed. Verify exactly one standard dialog for intentional Browse; cancel,
search, foreground/modal behavior, no helper/debug window or shortcut creation.

With valid consent: 20 Shelf reopens AND 20 popup reopens, new tab, Chrome restart,
companion restart/autostart, actual 15-minute expiry, Windows sleep/wake, stale pair,
revocation, moved/inaccessible root and fresh profile. Expect zero spontaneous dialogs.
Run first-gesture real-byte receipt checks across local Explorer/Live/authorized folders,
ChatGPT, Google/Lens and Yandex; unsupported destinations must be reported separately.
Record actual attempt counts, pointerdown/dragstart/dragover/drop/receipt timestamps,
missing/large sources, Escape, cross-window/popup closure, rapid drags, zoom 125/150%,
long sessions and legitimately entitled bulk. No results are inferred from fixture tests.
Native clipboard, Premium bulk, REDOWN and Rename still need implementation/integration.
