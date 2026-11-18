# Playback and memory repair results — November 17, 2026

Pushed repair branch: `fix/chutey-p0-playback-starter`.
Packaged/tested source: `07cd88d143ec32d53bc65dec44b1d400e4736f15`.
Runtime repair commits: `f4320133e36734f44e130d425ae64d0b138f0106`
and `f08e07c8edb8e694261b1f7572b7193944abb353`.
The later commit adds the post-idle playback/browsing check.
Documentation/evidence-only commits may follow this packaged source.

**Status: targeted repairs implemented and short paired Windows acceptance
passed. Not GOLD; owner hardware and long-duration acceptance remain open.**
No installed owner worker, helper, Chrome profile, History, saved data, approved
folders, original YUMMY assets, archived releases, tags or GOLD references were
replaced. No merge, deployment or Development 2 work was performed.

## Root causes and actual repairs

1. **Permanent ctypes target-type retention in the Windows worker.**
   `WindowsFS.guard`/`handle_identity`, `private_write` and `dpapi` declared local
   Structure classes and passed each new class to ctypes.POINTER. CPython's
   process-global pointer-type cache retained those classes permanently. Closing
   files or collecting garbage could not release them. Each path now reuses one
   module-level structure with the same fields, permissions, ACL and DPAPI entropy.
2. **Released streams still occupied media slots.** Two non-reading loopback
   clients blocked response writes even after their tickets were released. On
   Linux, baseline release acknowledged in about 3 ms but both slots remained
   occupied for 14.875 seconds; an immediate fresh range request returned BUSY.
   Active sockets are now tracked and shut down on release/revocation. The first
   Windows gate proved shutdown alone insufficient there: six blocked-reader
   checks failed, despite passing on Linux. The correction uses single partial
   sends with 200 ms cancellation checks, correct byte offsets and the existing
   15-second no-progress limit. The final Windows gate passes those checks, with
   slot cleanup asserted within two seconds and immediate valid range retry.
   The earlier precise Linux timings were console measurements; the durable
   regression asserts the cleanup bound. It does not claim 7 ms Windows cleanup.
3. **Failed selections could not retry the same video.** Shelf remembered the
   selected row before loading succeeded and returned early on every same-row
   selection. It now reuses only a healthy player. Loading/error/close paths
   invalidate old generations, abort pending preview/content reads, stop timers
   and renewal, clear media src/handlers, revoke fallback URLs and release tickets.
   Late-issued tickets are released without creating another player. Failed
   media cleanup runs before bounded diagnostics; those diagnostics avoid HEAD
   against a locally released ticket. Metadata-only preload and paused playback
   stay valid; resize remains separate from Stop/Close.

The measured ctypes leak is real worker Python allocation retention, distinct
from browser decoder memory, normal caches and allocator working-set retention.
The owner's complete 40→500 MB observation is **not fully attributed**: its exact
process, memory column and reproduction trace have not been supplied. A 500 MB
Chrome process sum does not by itself establish a leak, and 40 MB is not a memory
budget imposed by these tests.

## Before/after allocation evidence

Actual production methods, fake Win32 APIs, Python 3.12.14 on Linux, retained
tracemalloc allocations after GC. These are not whole-process Windows RSS values.

| Method | Calls | Retained bytes before | Retained bytes after | Extra pointer types before → after |
| --- | ---: | ---: | ---: | ---: |
| WindowsFS.handle_identity | 2,000 | 14,937,328 | 96 | 2,000 → 0 |
| private_write | 200 | 1,132,144 | 144 | 200 → 0 |
| dpapi | 200 | 1,093,312 | 168 | 200 → 0 |

Source hashes and raw measurements:
[`ctypes-before.json`](playback-starter-evidence/2026-11-17/ctypes-before.json),
[`ctypes-after.json`](playback-starter-evidence/2026-11-17/ctypes-after.json).
Reproduce in separate Python processes with
`scripts/benchmark-windows-ctypes.py --source-ref 9cde0e854a9a51604c49ec72084850fbd92a9c9c`
and without `--source-ref`. The real Windows metadata, protected-write and DPAPI
round-trip regression counterparts all pass in the Windows gate.

## Actual packaged Windows/Chrome measurement

[Passing run 44213998146](https://github.com/thanks-cohn/chute/actions/runs/44213998146),
Chrome `156.0.8078.80`, Windows GitHub Actions, genuine native messaging and the
exact packaged installer/helper. The fixture preapproves only a synthetic
disposable folder through DPAPI. It does not test Shell picker UI or owner files.
The generated MP4 is **31,180,283 bytes**, 10 seconds, H.264/AAC. Total lifecycle
observation: **72.672 seconds**; actual closed-player idle: **30.047 seconds**.

| Observation | Worker RSS MiB | Worker private MiB | Chrome private sum MiB | Shelf JS heap MiB | Tickets / active stream slots |
| --- | ---: | ---: | ---: | ---: | --- |
| Before repeated cycles | 37.297 | 25.297 | 295.707 | 4.558 | 0 / 0 |
| After 12 cycles | 37.430 | 25.352 | 376.547 | 4.435 | 0 / 0 |
| After idle | 37.547 | 25.438 | 322.812 | 4.398 | 0 / 0 |
| Played again and browsed after idle | 37.613 | 25.547 | 359.551 | 4.318 | 0 / 0 |

Worker Python threads were three at the idle samples. Five immediately after
the final replay/navigation includes transient request work. These observations
support cleanup across this workload; they do not establish an hours-long trend.
Chrome values sum CDP-visible processes, including decoder/renderer work;
summed RSS can double count shared pages. No forced garbage collection or
working-set trimming was used during browser tests. Raw per-sample counters are
in [`windows-playback.json`](playback-starter-evidence/2026-11-17/windows-playback.json).
Linux decoder evidence is retained separately, including the portable send-loop
run; its worker RSS also includes the Python test driver, so it is not an
isolated native-worker comparison.

## Executed tests

* **Windows: 58 passed**, no skips, in 33.83 seconds. Includes actual Windows
  metadata, secure-write and DPAPI loops; correct byte ranges/HEAD/seek; file
  identity/auth rejection; partial-send integrity; stalled-client timeout;
  release/revoke/policy cancellation and subsequent range retry; native consent
  and existing performance/transfer behavior. XML is in the matching artifact.
* **Linux: 55 passed, 3 Windows-only skipped**, in 23.21 seconds, same four test
  files. Shared worker boot, Explorer API, media Origin scoping and media
  diagnostics Node checks pass on Linux and Windows. Packaged helper framing
  verification and Chrome ZIP packaging pass on Windows.
* **Real Windows Chrome GUI through packaged worker: PASS.** MP4 play, pause,
  seek, finish and replay; four image previews and directory browsing during
  playback; same-file retry after injected metadata BUSY and failed media GET;
  hung preview cancellation; late-ticket cleanup; 12 play/switch/close/History/
  return cycles; popup playback, Escape, reopen and page close; short idle,
  then successful playback and directory browsing. Every explicit closure
  settles to zero media leases and active stream slots. The initial failures
  were investigated and corrected, not waived or hidden by higher limits.
* Linux actual-decoder 12-cycle portable-writer run also passes, 66.098 seconds,
  plus the updated post-idle path smoke check. These are accelerated checks,
  explicitly separate from long-duration evidence.

## Matching TEST package and exact hashes

Download [artifact 14387995714](https://github.com/thanks-cohn/chute/actions/runs/44213998146/artifacts/14387995714).
It contains the installer, native helper, Chrome ZIP, source SHA, test XML,
raw browser evidence, installation/testing instructions and SHA256SUMS.txt.
Every entry in its hash manifest was independently verified after download.
The actually installed CI worker bytes match the setup's recorded hash.
All 64 non-manifest ZIP assets match the tested extension source, allowing only
Windows CRLF line endings in text files; the manifest is semantically identical.
The package's complete manifest is also preserved in
[`windows-package-SHA256SUMS.txt`](playback-starter-evidence/2026-11-17/windows-package-SHA256SUMS.txt).

| File | SHA-256 |
| --- | --- |
| Chutey-Playback-Starter-TEST.exe | `3f0b155ec22012c8629feef28d494d3fcfaefe8d255505a31a485c608ee865ed` |
| Chute-NativeHost.exe | `65aa63a3d2cea5602b084a97d2b16f5c21a9e31d16eb2218b8cb5617f02e703b` |
| Chutey-Chrome-Playback-Starter-TEST.zip | `889d80f15013bcf0573ce66da41f8cdd12b83b6cc5238c2a9f2ba7a8b3f469b6` |

Use the isolated Windows Sandbox/VM instructions in
[`P0-PLAYBACK-STARTER-HANDOFF.md`](P0-PLAYBACK-STARTER-HANDOFF.md).
The setup self-installs; running it in the owner's working account would replace
the current installation and is **not authorized**. No rollback on that account
is needed because it was not touched. Discard the disposable test VM/profile.

## Changed files

* `src/chute/explorer/windows_fs.py`, `native.py`, `grant_store.py`: reuse the
  three ctypes layouts; native media-policy revocation calls the shared cleanup.
* `src/chute/explorer/api.py`: track active ticket sockets, atomic revocation/
  registration, bounded cancellable partial sends and existing finally cleanup.
* `extension/explorer-view.js`, `popup-gallery.js`, `media-playback.js`: same-file
  retry, resource/timer cleanup, paused metadata semantics and bounded diagnostics.
* `tests/test_windows_fs_resources.py`, `test_explorer_media.py`,
  `scripts/verify-media-diagnostics.cjs`: exercised-path and transport regressions.
* `scripts/benchmark-windows-ctypes.py`, `verify-playback-starter.py`,
  `.github/workflows/chutey-playback-starter.yml`: reproducible allocation and
  real-decoder checks, isolated matching Windows package and optional idle soak.
* This report, the handoff and raw evidence document scope and actual outcomes.

## Remaining acceptance and limits

[Two-hour idle run 44214046352](https://github.com/thanks-cohn/chute/actions/runs/44214046352)
was started on the exact packaged/tested source and is **still in progress as of
this report**. It closes all players, keeps Explorer open, samples control/memory
counters every ten seconds for 7,200 real seconds, then reopens the MP4 and
browses folders. Do not call it two-hour continuous playback, completely
unpolled idle, a memory plateau or a pass before its results are available.
Initial older-revision jobs failed the Windows cancellation gate before any
idle soak; superseded jobs were cancelled after adding the post-idle assertion.

Owner-machine acceptance, a long Windows/browser memory trend, full-length
MP4/WebM movies, sustained playback while performing heavy copies, resource-
constrained 4 GB hardware, idle/reconnect recovery over hours and Shell picker
UX remain unverified by this focused pass. The previous broader build's
30-minute result is not reused as certification of this changed worker.
The starter test intentionally targets ordinary MP4; it does not requalify all
containers/codecs. Existing UI overlap/layout requests from the larger handoff
remain deferred, as do Movie Mode/adapters and Development 2. There is no
production promotion, merge or owner installation approval in these results.
