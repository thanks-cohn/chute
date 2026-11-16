# Development 1 repair candidate — November 16, 2026

Branch: `codex/2026-11-16-phase1-repairs` (started at `bf02a5b`).
Status: **source repairs implemented; owner Windows acceptance still pending**.
This is not permission to replace the working installation or begin Development 2.
The final commit SHA is supplied in the push report and review bundle manifest.

Authoritative scope: [two sequential developments](TWO-SEQUENTIAL-DEVELOPMENTS.md)
and [owner repair requirements](OWNER-PHASE1-CODEX-REQUEST.md). The portable
Explorer's warm yellow legal-pad surfaces and brown accents belong to
Development 2; no sticky-mascot branch, redesign or theme was created here.

## Repairs and root-cause evidence

1. **Popup slivers:** compared with `45dc8f034045c8807f5b712f7e8915c7ba76313a`.
   The earlier code measured a square cell and used it for all implicit tracks.
   The previous candidate instead defined only N explicit min-content rows and
   set implicit rows to auto. Absolutely positioned tile contents contributed
   no intrinsic row height; containment/percentage heights left subsequent rows
   as slivers. Replaced the limited explicit tracks with one width-derived
   square `grid-auto-rows` rule for every row, reserving a known scrollbar width.
   No stored file, image or history was changed. The regression test restores
   the old CSS and observes heights below 20px, removes it, then verifies 120
   real saved records at every density, including the last decoded image.
   Density is viewport presentation, not a collection-size limit. Normal
   30-record pagination and bounded/lazy image fetching remain unchanged.
2. **Thumbnail-first Explorer:** real miniatures remain enabled by default;
   Folder Access settings now offer a persisted generic-icon alternative.
   Images retain their tile geometry; out-of-view/folder requests are cancelled
   with at most three active requests. Failed images retain diagnostics and
   Refresh retries them. No preview click is needed to request a visible tile.
3. **Preview gallery:** visible Previous/Next buttons and Left/Right select
   adjacent loaded files, loading another directory page when needed. Up/Down
   scroll the current document while preview is open; wheel scrolls normally.
   Inputs, resizer, menu and native audio/video controls retain their keys.
   Closed-preview directory navigation remains unchanged. Escape/X closes;
   overlay geometry and list dimensions are unchanged by navigation.
4. **Profile listing candidate fix:** each Windows page previously materialized
   every entry's identity without catching individual failures. A sharing-
   denied NTUSER.DAT or inaccessible child could fail the *entire* profile with
   the generic unavailable message. Individual failures now become blocked
   entries with FILE_IN_USE / PERMISSION_DENIED / underlying safe error codes;
   usable siblings still list. Metadata/identity probes request attributes
   rather than unnecessarily requesting GENERIC_READ on directories. File byte
   reads retain guarded read authority and strict no-reparse protections.
   This is a demonstrated code-path defect, **not proof of the owner's exact
   Windows failure**, which still needs real-machine evidence.
5. **Drive root candidate support:** explicit native selection may grant a
   local drive root, including USB. UNC/device paths remain denied. Every
   descendant access continues to guard parents, forbid reparse traversal and
   detect root replacement. Windows, Program Files (including x86) and
   ProgramData subtrees stay protected even inside a selected drive root.
   Merely starting the worker does not grant a drive. Actual USB validation is
   pending; the added Windows test validates only the test drive's root policy.
6. **Native enrollment:** regeneration previously reconstructed its list from
   discovery plus a separate file, discarding IDs explicitly present only in
   the existing host manifest. It now merges valid exact IDs from a matching
   Chute stdio manifest and reads Chrome Secure Preferences as well as
   Preferences. The production Store ID and explicit extra-origin file stay
   supported. Wildcards, web origins and unrelated manifests are ignored.
   Manifest replacement is atomic, avoiding a transient truncated JSON file.
   Tests regenerate three times without discovery and retain approved IDs.
   Old running binaries can still overwrite configuration using their old
   code; no production helper/registry/manifest was changed by this work.
7. **Audio and video:** the former preview classifier had no audio kind and
   the UI rejected large media/loaded small files as Blobs. Candidate MP3,
   M4A, WAV, FLAC, Ogg/WebM audio uses an audio element and the same authorized
   range source as video; playback starts paused. A real small H.264 MP4 plays
   through both the candidate source and the legacy small-video Blob fallback.
   An 80 MiB sparse-padded MP3 containing a valid generated clip plays through
   the source URL. This tests the previous size gate, not a full-length audio
   soak. Codec/container errors and unavailable old-worker capabilities are
   explicit. No claim of MKV/AVI/FLV adapters, 4K throughput or Movie Mode.
8. **Mascot right-click:** native context-menu focus/blur caused immediate
   auto-hide. The existing iframe now sends an interaction pin through its
   source-checked parent boundary; blur/timers cannot hide the mascot while
   that pin is active. Focus, dismissal/pointer interaction or Escape releases
   it and resumes the existing visible interval. Artwork, clicks, current drop
   destination and native/browser context menu are preserved. No Stage 2 menu
   or relocation implementation was added.
9. **File action defaults:** `chuteyRevealTarget` and `chuteyOpenTarget` default
   to `chutey`, with persistent `system` alternatives in Settings. Saved-file
   Reveal defaults to the containing directory in Chutey with the exact file
   selected; locate_saved resolves an actual Store ID to guarded handles and
   never treats an ID as a handle or accepts a client path. It cannot grant
   arbitrary directories. The explicit Windows saved-file Reveal alternative
   calls the original `/api/reveal/{id}` endpoint unchanged. Explorer's Open,
   Reveal and Preview are separate operations: explicit Preview ignores Open
   preference; system Open/Reveal use new authenticated, identity-checked
   candidate commands over the existing RootGrant engine. System Open permits
   only known passive media/text/PDF suffixes, never executables/scripts/
   shortcuts even if their MIME registration says text/plain. Receipt status
   accepted means OS dispatch, not proof a window displayed the file. Older
   workers report unsupported operations; there is no silent system fallback.

## Executed checks (Linux cloud)

- Python: **95 passed, 11 skipped, 37 passed subtests**. Windows tests are
  among the skipped checks; they are not passes.
- JavaScript syntax; worker boot, thumbnail/icon, tabs/mascot, drag, API,
  popup-gallery, package and settings-boundary regressions passed.
- First-paint Chromium fixture: complete placeholders, all four densities,
  offline geometry, appearance preferences and real media previews.
- Explorer Chromium fixture at 390/900 widths: list/grid metrics remain fixed
  through divider drag, keyboard resize, expand/restore/close, gallery
  navigation, multi-selection, menu operations and History switching.
- Development 1 Chromium fixture: 120 cards with reproduction of prior faulty
  CSS; bottom-of-collection image decoding; persistent generic-icon option;
  Left/Right/buttons and Up/Down/wheel scrolling; MP4 and large MP3 playback;
  legacy small MP4 fallback; exact saved-file selection and original Windows
  Reveal endpoint routing. These are HTTP fixtures with simulated enrollment/
  Origin, not installed Chrome or actual OS Shell acceptance.
- API tests cover saved-file location without client paths, origin/session
  rejection before external dispatch, canonical identities, replaced files,
  stream ranges/HEAD/cancellation/ticket lifecycle, large sparse media and
  mocked Windows Open versus Reveal. Fake-clock mascot test proves context
  activity survives blur/15 seconds of timers and auto-hide resumes after
  dismissal. Native-ID regeneration and inaccessible-profile-entry cases pass.
- The first browser streaming test used DevTools buffered routing for a large
  MP3 and lost its browser target. The final harness streams directly over
  HTTP with a test-only Origin alias instead; production origin checks remain
  strict. Do not use buffered test routing as a worker memory benchmark.

Reproduce from the candidate checkout:

```sh
.venv/bin/python -m pytest -q
node scripts/verify-chutey-tabs-and-mascot.cjs
node scripts/verify-explorer-api.cjs
.venv/bin/python scripts/verify-phase1-browser.py
.venv/bin/python scripts/verify-explorer-browser.py --fixture /tmp/chutey-dev1-overlay
.venv/bin/python scripts/verify-development1-browser.py
.venv/bin/python scripts/build-chrome-store.py
```

Browser fixtures need Chromium, ffmpeg, Pillow and Playwright. They use
synthetic files and port 17891 **in this isolated cloud environment only**.
Never run them against or stop the owner's working host service.

## Required Windows handoff and gate

Use a disposable Windows VM/Sandbox and a separate test Chrome profile. Preserve
host data and installed worker/extension; a separate Chrome profile alone is
insufficient isolation for a self-installing native worker. Candidate desktop
EXEs must only be built/launched in the disposable VM. The existing isolated
checker builds without installation via
`scripts/build-phase1-isolated-check.ps1`; normal `build-windows.ps1` output is
self-installing and must never run on the production host. No Windows EXE was
built or launched by this Linux session. Record candidate source SHA, build
architecture, dependencies, hashes and raw test exit codes in the VM.

In a **separate test checkout**, update using Windows CMD:

```bat
git fetch origin && git switch codex/2026-11-16-phase1-repairs && git pull --ff-only origin codex/2026-11-16-phase1-repairs
```

Then run Windows Python tests and the isolated checker (Python 3.12):

```bat
py -3.12 -m venv .venv && .venv\Scripts\python.exe -m pip install -e . pytest==9.2.0 Pillow==13.0.0 && .venv\Scripts\python.exe -m pytest -q --junitxml=development1-windows.xml && .venv\Scripts\python.exe scripts\phase1-isolated-worker-check.py
```

Owner review must include:

- Actual profile folder that failed, relevant Win32 error (no private path or
  token disclosure), readable/locked/denied children and unaffected siblings.
- Explicitly selected USB root; child browsing, protected system descendants,
  junctions/replacement, disconnect/reconnect and permission denial.
- Original production ID plus an explicitly authorized test ID across helper
  regeneration/restarts in the VM. Distinguish host forbidden from HTTP health.
- Installed Chrome popup with 100+ saved images across scrolling/pages and all
  densities; thumbnail/icon settings, rapid navigation and native disconnected.
- TXT/document wheel/Up/Down scrolling versus gallery Left/Right, stable overlay,
  media cleanup, small MP4 and representative real large MP3/MP4 files/codecs.
- Existing mascot right-click/dismissal, idle hiding, click and file drops.
- Default Chutey Open/Reveal, Settings persistence, **actual** Windows Reveal
  selecting the right file and system Open dispatch; explicit Preview remains
  inside Chutey. Check invalid/stale handles and unsupported executables.

**Development 1 is not declared complete.** These Windows checks and owner
review are outstanding. The required sequence forbids creating
`codex/2026-11-16-sticky-mascot` until this gate passes. Once confirmed, fork it
from the final validated Development 1 SHA, including any subsequent Windows
fixes, and apply the legal-pad theme to the entire portable Explorer window.

## Protected baseline state

No installed Windows worker, native host registration, original Chrome profile,
image/history data, archived branch, historical tag or release was modified.
Protected worker SHA-256 remains the reference:
`C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`.
The code was developed only on the requested Development 1 branch. Test files
and candidate ZIPs are separate generated outputs; source push is not product
promotion and does not activate a new installed worker.
