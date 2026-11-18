# Targeted playback and memory repair — TEST candidate

Branch: `fix/chutey-p0-playback-starter`, based on reference branch
`fix/chutey-media-worker-2026-11-17` at
`9cde0e854a9a51604c49ec72084850fbd92a9c9c`.
Read `Necessary-fixes/CODEX_NEXT_OWNER_ACCEPTANCE_REPAIR_HANDOFF_2026-11-17.md`
for the remaining product acceptance gates. This pass repairs existing playback
and memory defects; it does not implement its deferred UI redesign.

## What changed

* Reuse Win32 metadata structure types. The previous code declared a new ctypes
  structure per metadata read, then called POINTER on it; CPython permanently
  cached each new target type. Repeated authorized directory/file reads therefore
  retained Python allocations even after closing files and collecting garbage.
  The same defect in native-session protected writes and saved-consent DPAPI
  calls is fixed by reusing those structure types, with their security unchanged.
* Explicit release/revocation shuts down active media sockets. Previously a
  non-reading client could hold both media admission slots until a blocked send's
  15-second timeout, even after release acknowledged. A fresh video then got BUSY.
  The first Windows CI gate demonstrated that shutdown alone does not reliably
  wake Winsock's blocked sendall. Media body writes now use single partial sends
  with 200 ms cancellation checks and a 15-second no-progress deadline; only
  acknowledged bytes advance the buffer. This keeps backpressure bounded and
  avoids resending a partial chunk after a timeout.
  File descriptors and admission counters still close through their existing
  finally blocks. Limits, authentication, file identities and folder consent are
  preserved.
* Failed/loading selections can retry the same file. Stop/error/page close clear
  player events, pending preview reads, timers, lease renewal, src, object URLs
  and tickets. Late ticket responses are released. A valid paused metadata-only
  preload remains open; stopping playback and resizing remain distinct actions.
* Playback error cleanup runs immediately. Bounded diagnostics do not HEAD a
  ticket that cleanup has just revoked or overwrite a newer player's status.

## Reproduce focused verification

Use Python 3.12, project dependencies, pytest, Pillow, Playwright, FFmpeg and
Chrome/Chromium. No installed Chutey is needed for the HTTP fixture:

```sh
python -m pytest -q tests/test_windows_fs_resources.py tests/test_explorer_media.py
node scripts/verify-media-diagnostics.cjs
python scripts/verify-playback-starter.py --transport http --cycles 12 --idle-seconds 30 --output /tmp/chutey-playback
python scripts/benchmark-windows-ctypes.py --help
```

Raw before/after allocation measurements are in
`playback-starter-evidence/2026-11-17/ctypes-{before,after}.json`.
Those exercise actual methods with fake Win32 APIs, tracing Python retained
allocations after GC, not whole-worker RSS: 2,000 identity reads retain
14,937,328 → 96 bytes; 200 protected writes retain 1,132,144 → 144 bytes;
200 DPAPI calls retain 1,093,312 → 168 bytes. Each retained pointer-type delta
falls to zero. Real Windows regression counterparts are included.

The browser script generates an approximately 30 MB, 10-second MP4 with a real
H.264/AAC stream. It exercises play/pause/seek/end/replay, four image previews,
directory browsing, failed metadata and GET retry, repeated player replacement,
explicit close, History navigation/return, popup playback/closure and idle time.
Samples include worker memory, media slots/tickets, Shelf JS heap, and summed
CDP-visible Chrome process RSS (plus private bytes on Windows). RSS sums can count
shared pages more than once. No forced GC or working-set trimming hides normal
retention. HTTP fixture worker memory includes its Python test driver and is
not an isolated native-worker measurement.

`.github/workflows/chutey-playback-starter.yml` builds the matching Windows setup,
helper and Chrome ZIP, runs the same checks using real native messaging on an
ephemeral Windows runner, and uploads exact hashes, source SHA and evidence.
Its installed transport refuses an existing Chutey registration, data directory
or worker listener and is prohibited outside ephemeral Windows GitHub Actions.
The automatic run has a 30-second idle check. Dispatch with `idle_seconds=7200`
for an actual two-hour idle observation; short runs do not certify it.

## Isolated owner testing and rollback

1. Download the passing **Chutey-Playback-Starter-TEST** Actions artifact for the
   source commit under review. Check `SOURCE-COMMIT.txt`, `ACCEPTANCE-STATUS.txt`,
   `evidence/results.json`, the Windows test XML and `SHA256SUMS.txt`.
2. Verify bytes with PowerShell `Get-FileHash <file> -Algorithm SHA256` before
   using them. The setup and helper must match the accompanying Chrome ZIP.
3. Use a disposable Windows Sandbox/VM and a separate Chrome profile. Copy in
   disposable test media. **Do not run this setup in the owner's working account:**
   it self-installs and can replace an existing Chutey installation. No owner
   installation/restart/replacement is authorized by this repair pass.
4. In the disposable account only, run `Chutey-Playback-Starter-TEST.exe` once.
   Extract the Chrome ZIP, load it unpacked at `chrome://extensions`, then enroll
   its displayed ID using the test-installed `Chute.exe --allow-extension <ID>`.
   Approve only the disposable media directory using the normal Folder Access
   flow and explicitly enable its media policy if prompted.
5. Test ordinary MP4 play/pause/seek/end/replay, image previews and folder browsing
   during playback. Repeat switches and Stop/Close, switch away and return, then
   leave Explorer idle. Watch worker and Chrome processes separately. Preserve
   actual wall-clock duration, memory samples and any error before reporting pass.
6. Close/discard the entire disposable VM/profile after testing. Rollback on the
   owner machine is unnecessary because its installation, data and GOLD references
   remain untouched. Promoting a candidate requires separate owner approval.

## Limits

Passing a short synthetic test does not certify the owner's 4 GB machine, real
full-length movies, two-hour playback, Shell picker UX, all codecs, large-copy
endurance or absence of every memory leak. The observed 40→500 MB report cannot
be attributed completely to one process/category without owner measurements.
The fixed ctypes retention and blocked socket defects are independently
reproducible causes, distinct from browser decoder/cache working sets and OS
allocator retention. Exact measured results and unresolved gates accompany the
candidate; nothing here promotes a build to GOLD or authorizes Development 2.
