# Phase 1 candidate: isolated Windows validation handoff

> Development 1 update: this document records the earlier candidate. For current repairs, scoped Open/Reveal support and the outstanding Windows acceptance gate, see [Development 1 results](../../codex-11.16.2026/DEVELOPMENT1-IMPLEMENTATION-AND-VALIDATION.md).

Status: **Phase 1 partially implemented; Windows acceptance pending.**
Do not proceed to worker performance optimization or Movie Mode until the
Phase 1 gates below pass. The owner elected to run these Windows checks.
No claim of installed Chrome success or full Phase 1 completion is made.

## Preserve the working installation

Keep the host's installed worker, Chrome profile, history, startup/native-host
registration and recovery archives untouched. Do not stop/restart/uninstall it,
run a new installer on that host, reload its unpacked extension, or overwrite
its extension directory. Immutable references:

- Worker SHA-256 `C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`
- Release `chute-test-20261104-0529-CST`, EXE `Chute-Windows-Explorer-TEST.exe`
- Release SOURCE-COMMIT: `b0727d56f89484d110fe7b1d24e12ba9bf476611`
- Extension `45dc8f034045c8807f5b712f7e8915c7ba76313a`
- Archive branch `archive-chutey-11.16.2026`

**Use a disposable Windows VM or Windows Sandbox with its own Chrome profile
and synthetic files.** Do not map writable host application/history directories
into it. A separate Chrome profile on the production host is insufficient for
candidate native installer testing: the existing installer changes shared user
native-host registration, startup and installed executable paths.

The generated `dist/phase1-review` review bundle contains source, hashes,
synthetic screenshots and Linux test results. Check SHA256SUMS before use. Its
SOURCE-COMMIT identifies the candidate. Source/archive and extension ZIPs are
review artifacts, not authorization to replace a working installation.

## 1. Windows API and canonical identity tests

Extract candidate source in the disposable VM. From that source directory:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e . pytest==9.2.0 Pillow==13.0.0
.\.venv\Scripts\python.exe -m pytest -q --junitxml=phase1-windows-tests.xml
.\.venv\Scripts\python.exe scripts\phase1-isolated-worker-check.py
```

Inspect the actual test summary: Windows real-filesystem/identity tests must
execute, rather than being skipped. POSIX-only tests can legitimately skip.
Capture command exit codes and results; do not share tokens or private paths.
The isolated checker uses only a temporary generated directory and an ephemeral
loopback port, then tears down. It never imports windows_app, installs the
product, registers native messaging, changes startup, binds production port
17891, or accesses original user files. Its WebM-named range fixture is **not**
a playable movie; browser media tests use separately generated real WebM.

Optional build of the isolated checker, **Windows only**:

```powershell
powershell -NoProfile -File scripts\build-phase1-isolated-check.ps1 -Python py
# If py selects another interpreter, pass the full Python 3.12 executable path.
Get-FileHash dist\phase1-isolated\Chutey-Phase1-Isolated-Check.exe -Algorithm SHA256
.\dist\phase1-isolated\Chutey-Phase1-Isolated-Check.exe
```

The build script pins PyInstaller/Pillow, records source SHA and resolved build
dependencies, and never launches its output. This test EXE is not an installer,
production worker or native-host replacement. Record Windows/Python versions,
architecture, full dependency receipt, executable hash and test output. The
Windows build script has **not** been executed in the Linux cloud environment;
no Windows artifact/hash is claimed here. PyInstaller builds are not promised
bit-for-bit deterministic across different toolchains.

## 2. Archived-worker compatibility, inside a disposable VM

1. Obtain the archived release EXE through its preserved GitHub release. Verify
   its SHA-256 against the exact baseline above before executing the **copy in
   the disposable VM**. Do not change the host's original executable.
2. Prepare baseline extension source `45dc8f...` in the VM. Load that VM-only
   extension and establish synthetic folder access. Record native protocol and
   worker health/version. Confirm the baseline image/thumbnail failure before
   modifying the VM extension.
3. Load the candidate extension in a separate disposable test profile, using
   the registered/native-approved test ID. All native messaging enrollment
   changes occur inside the VM. Do not copy profile/registry changes to the host.
4. Confirm PNG/JPEG/GIF/WebP/BMP preview and real Grid thumbnails using the
   unchanged archived worker. Check that content payloads omit `original:false`.
   Invalid/expired identities must produce an actionable error. An explicit
   original export to an old worker may remain unsupported; do not claim it
   completed. Large-video streaming must report missing capability rather than
   allocate the whole file in memory.
5. Test connected, disconnected and recovered VM-native states. Native picker,
   wake/reconnect and exact file identities must be exercised, not mocked.

No deployment or promotion is authorized by this procedure. Use disposable
snapshots to keep baseline and candidate worker runs separate.

## 3. Candidate pairing and actual browser acceptance

For candidate worker packaging in a **second clean disposable VM**, the
existing `scripts/build-windows.ps1` builds the normal companion and helper.
That output **self-installs when launched**; never run it on the working host.
Record source SHA, dependency versions, architecture and SHA-256 separately.
This normal packaging path was not executed in Linux. Install only in the
clean disposable VM, then load its matching candidate extension there.

Use only synthetic mixed folders (small/large PNG/JPEG/GIF/WebP/BMP; corrupt
images; generic/missing MIME cases; portrait/landscape/square images; text,
PDF, folders, supported MP4/WebM and unsupported files).

- Popup: repeatedly open at 4×4, 5×4, 5×5 and 6×5. Complete placeholder grid must
  precede data/decoding; shell and tile positions stay fixed with slow/missing
  thumbnails and native offline. No opening/corner animation or staged reveal.
- Settings: choose packaged default image, background color, animation on/off
  and speed. Check reload persistence, reset, reduced motion, shared Shelf
  appearance and fully opaque decoded thumbnails with no animation leakage.
- Grid: visible images decode inside their own stable tiles without opening
  the overlay. Scroll, rapidly change folders, corrupt files, disconnect and
  refresh/reconnect; failed thumbnails need a diagnostic and successful retry.
- Overlay: initial one-third height, bottom anchored above file content. Drag
  to protected tabs/nav boundary, expand, restore, close, keyboard resize.
  Compare list/grid rectangles, row positions and scroll dimensions before,
  during and after. None may resize/reflow. Preserve tabs, branding and nav.
- Navigation: Up/Down in open/expanded/closed preview; rapid mixed selections;
  text inputs, dropdowns, resize grips and video controls retain their keys.
  Delayed results must never display the previous selected file.
- Media: actual images animate where supported; real MP4/WebM starts paused,
  plays/seeks with browser controls, fits the unchanged overlay and cleans up
  on close or tab change. Inspect actual 206/HEAD/range behavior, errors, and
  resource use. A short clip does not establish sustained 4K/movie capability.
- Trash: absent in Explorer; History action clearly says empty live basket,
  asks confirmation, preserves dated history/originals, handles empty and
  populated Live state and reports disconnection truthfully.
- **Remaining native gap:** default-application Open and Windows Explorer
  Reveal are distinct from Preview. Current Explorer dispatcher still blocks
  Open/Reveal pending native consent support. Record these as unsupported;
  do not mark this acceptance item passed. The saved-basket Reveal button is
  not a substitute. A separate consent/API implementation and real Windows
  regression evidence are still needed to complete Phase 1.

Return redacted test results, exit codes, VM platform, exact source/executable
hashes, browser version and screenshots/recordings. Do not include session
credentials, stream tickets or private filenames.

## Cloud evidence already obtained

- Python 3.12.14 / Node 24.22.1; editable development installation and pip check.
- 84 Python tests passed, 9 skipped, 37 passed subtests. The skipped native
  Windows checks are not passes.
- Existing worker boot, thumbnails, tabs/mascot, drag, API, popup fixture,
  package and settings-boundary regressions passed.
- Linux Chromium fixture: 16 placeholder boxes exactly match decoded card
  boxes; all density skeleton counts, offline shell, saved appearance settings,
  real Grid thumbnails/corrupt diagnostics, paused WebM playback/seek, stable
  overlay and media release tested.
- Separate Chromium geometry fixture at 390/900 widths: drag/keyboard resizing,
  expand/restore/close, unchanged list/grid metrics, arrows, History and menus.
- API tests: sparse 3 GiB source without materialization/copy, HEAD, prefix/
  suffix/arbitrary ranges, 416 semantics, wrong Origin/Host/token, replacement,
  expiry, ticket cap/release, active cancellation and file-descriptor cleanup,
  MIME fallback and a script client using the same authoritative records.
- Installed-extension check attempted and blocked by Chromium administrator
  policy: `Loading of unpacked extensions is disabled by the administrator.`
  Policy was not changed. Linux fixtures are not installed-Chrome evidence.
- No original-binary benchmarks, prolonged media soak, user-hardware results,
  Windows candidate EXE build, native Open/Reveal success, Phase 2 adapter
  registry or Phase 3 Movie Mode are claimed.
