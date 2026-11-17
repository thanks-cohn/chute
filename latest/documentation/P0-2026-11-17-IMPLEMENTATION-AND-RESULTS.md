# P0 Development 1 repair candidate — implementation and evidence

**Branch:** `fix/chutey-media-worker-2026-11-17`. Descends from Request 3 `1cca0406c9a81c658feabc0d7aa57aad4028247f` through the documentation/audit head `f9d76e26f032dc5887153d0f8206fbfcee5c23ca`; no old-main runtime replacement. Development 2 / portable mascot development is not started. No merge, owner install, production promotion, GOLD retag or archive rewrite is authorized or performed.

**Status:** TEST candidate; Windows endurance/application gates and owner device acceptance must be assessed from the actual run evidence below. Do not infer completion from this implementation list.

Installation/rollback: [safe handoff](P0-2026-11-17-HANDOFF.md). Implemented API contracts: [P0 API](P0-NATIVE-API-2026-11-17.md), [OpenAPI](local-api.openapi.json), [clipboard](WINDOWS-CLIPBOARD-API.md), [copy recovery](PENDING-COPY-RECOVERY-2026-11-17.md).

## Root causes and corrections

1. **Actual Windows/Chrome media authorization failure captured.** Run [44129501779](https://github.com/thanks-cohn/chute/actions/runs/44129501779), source `8472162`, used the actual packaged worker/helper, genuine native messaging and an actual unpacked Chrome extension. Directory commands and native enrollment succeeded. Media Range GET and diagnostic HEAD returned **403** with missing Origin in browser request metadata. See the [redacted failure evidence](p0-evidence/2026-11-17/windows-origin-failure-8472162.json). Chrome 156 omits Origin on these privileged media requests despite crossorigin=anonymous. The worker's strict Origin check was preserved. A new extension DNR session rule restores the exact extension Origin only for its own initiator and GET/HEAD to the exact loopback media path; website/general API traffic cannot match. Background acknowledgment precedes playback. The subsequent candidate reached real paired playback/browsing/copying, then hit a test-harness CSP wait failure after the short playback loop. The full final gate remains separately recorded below.
2. **Independent source-confirmed lifetime defects.** Request 3 limits tickets to ten minutes and sessions to fifteen, and checks the broad bearer during media reads. New file-specific 120-second leases renew every 45 seconds through authenticated control; ordinary session replacement shares the existing lease registry. Explicit root revocation, release, expired leases and changed identities still stop access. Accepted fixed-authority copy jobs also survive ordinary bearer expiry, with explicit cancellation/revocation checks and a 24-hour deadline. Tests cover both continuation and rejection. The owner's original first failing GET was not remotely captured, so this reproduction does not prove every observed owner 403 had the same cause.
3. **Source-confirmed navigation cancellation.** `load(handle)` previously closed/released the media preview. Playback now owns a pinned element and lease, independent of file lists, tree/search, pagination and ordinary document/image previews. Intentional Preview/Open can replace it; ordinary selection cannot. Root revocation and terminal continuation failures stop playback; transient BUSY does not erase buffered media.
4. **Reproduced stale navigation race and render blocking.** A pending search debounce could abort a later Parent/folder click and load the stale branch. Explicit navigation now clears it and aborts obsolete requests. View persistence is coalesced and does not hold list rendering behind fsync. Read-only directory scans no longer hold the global engine lock; handle-map insertion remains synchronized. Transfer admission/receipt fsync does not hold status/cancel locks, and terminal state/capacity publish together.
5. **Measured connection-admission bottleneck.** Python 3.12's listen backlog of five introduced approximately one-second TCP retry delays in 32-request bursts. A controlled backlog-64 experiment reduced that delay; the implementation now uses a bounded 64-connection backlog and independent **32 HTTP-request-thread** ceiling. Separate control/navigation/preview/thumbnail/media/intake lanes retain immediate backpressure. No unlimited thread pool or stale-command queue was added.
6. **Stale-copy dead end and a regression caught during development.** Pending jobs are reconciled by their original ID and guarded durable receipt, not replayed. Verified COMMITTED clears the marker; active, failed, cancelled, UNCERTAIN, missing and disconnected states remain distinct. Reviewed dismissal preserves journals. Visible recovery controls sit beside Paste; the old menu uses the same recovery API. The larger browser regression caught a new null-marker equality bug in fresh copies without IDs; it was fixed and an automated two-copy regression added before delivery. Duplicate legacy Copy/Paste menu entries were removed while preserving explicit internal operations.

## Issues #20–#28: implementation and evidence boundaries

| Issue | Repair | Evidence / remaining boundary |
|---|---|---|
| #20 | First-use Open/Reveal defaults to system; explicit Chutey preference preserved; saved-file Open resolves Store identity before passive OS dispatch | JS contract, real browser preference/Chutey navigation tests; owner OS associations/third-party file manager still need acceptance |
| #21 | Actual unsupported format/size/codec/transport reasons replace obsolete native-integration warning | Actual decoder tests include unsupported stream; old bounded small-media fallback preserved |
| #22 | Exact-Origin Chrome transport, renewable scoped leases, adapter continuity, original GET diagnostics | Windows 403 reproduction, negative Origin/range/revocation tests; final paired endurance recorded below |
| #23 | Shared Settings: top scoped Restore Defaults, Popup/Shelf toolbar choice, Folder Access, real Efficiency/Balanced/Turbo acknowledgment | Browser preservation/mode tests, persisted worker configuration, Chrome API contract tests; actual owner toolbar/profile restart remains an acceptance check |
| #24 | Top-layer Folder Access with bounded placement, outside click/Escape and focus | Hit-tested real Chromium controls above expanded preview at 390×700 and 300×400; final Windows UX results packaged |
| #25 | Passive image/background establishes preview focus; existing navigation function retained | Actual image-center click Right/Right/Left, expanded preview and compact sizes; editable/media controls keep their keys |
| #26 | Separate versioned native clipboard module: normal CF_HDROP Copy/Paste, distinct image pixels, explicit preserved internal copy | Win32 format regression; installed GUI and actual Explorer/Paint application gates recorded in Windows artifact; no filename-as-pixels claim |
| #27 | Original-ID verification/review/cancel/dismiss, durable markers across Chrome restart, no uncertain replay or silent overwrite | Lost response, interrupted journal, no-space/cancel, same-artifact/legacy verification, two generated-ID copies, actual media/native-copy regressions |
| #28 | Bounded adaptive lanes, preset budgets, stale cancellation/coalescing, thread/backlog caps and redacted metrics | Same-machine source microbenchmark and actual 30-minute paired benchmark; no near-native or 4-GB tuning claim without intended-device measurements |

## Local regression results

- **164 passed, 13 skipped, 37 subtests** in the final Linux Python run (44.35 s). Windows-only tests are not counted as Linux successes.
- JS checks pass for MV3 cold boot/recovery, worker compatibility, thumbnail icons, transfer receipts/reconciliation, fresh generated IDs, toolbar/default preferences, media diagnostics/terminal renewal handling, and the tightly scoped Origin rule.
- Actual Chromium browser regressions pass: popup first paint/scrollbars/density, 120-card layout, image lightbox/Trash It!, single ZIP CSV+JSON History export, exact daily-highlight Unicode/timestamps/two-empty-line formatting and paged previews, archived GO TO under explicit Chutey preference, default-OFF decoration, overlay/focus/settings preservation, original small MP4 fallback, and MP4/WebM/MP3 streaming/copying.
- The larger [media/copy fixture](p0-evidence/2026-11-17/linux-media-copy-regression.json) passes **12 playback/seek cases** (three formats × small/large × Shelf/popup), six independently verified native copies, browser File import and unsupported-codec diagnosis. Large MP4/WebM/MP3 files exceed the old 32-MiB relay boundary; they are not whole-media Blobs. Max measured directory request latency in that run: **30.12 ms**. Python tracemalloc peak **2,743,242 bytes** is traced Python allocation, not total worker/Chrome RSS.
- Short 15-second browser smoke runs are explicitly not 30-minute acceptance.

## Same-machine source baseline / mixed byte-engine microbenchmark

Reproduce with `scripts/benchmark-p0-lanes.py --runtime PATH_TO_SOURCE --output report.json`. A detached worktree of Request 3 supplies the baseline without modifying its branch, installed executables or data. The fixture has 512 metadata entries, a decoded thumbnail, two continuously paced range readers and a verified 64-MiB copy. Three waves each of 1/4/10/32 mixed requests run per profile. This is an in-process Linux byte-engine benchmark, not native messaging, movie decoding, an installed Windows baseline or Windows Explorer parity. CPU counts and exact source commits are in the [baseline](p0-evidence/2026-11-17/linux-request3-baseline.json) and [repair](p0-evidence/2026-11-17/linux-repair-lanes.json) JSON. The scheduler and copy I/O implementation at benchmark commit `380c189` remains unchanged. Later fixes adjust media-consent classification, extension transport/UI and test tooling; the benchmark is explicitly attributed to its measured source.

| 32-request burst, 96 requests total | Overall p95 ms | Control p95 ms | Rejected control / 24 | Verified-copy MiB/s including integrity passes |
|---|---:|---:|---:|---:|
| Request 3 fixed shared cap | 1167.871 | 1112.783 | 18 | 53.485 |
| Repair Efficiency | 245.803 | 163.596 | 1 | 72.114 |
| Repair Balanced | 322.143 | 182.579 | 1 | 43.682 |
| Repair Turbo | 357.980 | 231.116 | 3 | 37.875 |

Latency samples include bounded BUSY responses; they are not accepted-only latency. Burst rejection remains intentional under saturation. All modes accepted every four-request wave; Turbo accepted all ten-request-wave requests in this run. Higher admission can reduce verified-copy throughput under competing work; **Turbo is not uniformly faster**. These are initial measured budgets, not final tuning for a 4-GB Windows device. No raw-copy throughput, high-bitrate 4K or near-native speed is claimed.


## GiB-scale byte-engine stress

The separate [large-transfer fixture](p0-evidence/2026-11-17/linux-gib-transfer.json)
passed two consecutive **1,073,741,824-byte** native copies, checking both receipts
and independent destination/source SHA-256. Two paced range readers stayed active
and read approximately 286/288 MB during the workload. Verified end-to-end copy
rates were **84.510 and 120.907 MiB/s**, including integrity work. Across 208 combined
list + performance queries, p50 was **51.321 ms**, p95 **92.572 ms**, worst **121.510 ms**.
The combined in-process fixture's RSS peaked at **55,758,848 bytes**; Python traced
allocation peaked at **3,179,404 bytes**. This includes its HTTP clients and server,
not a separately measured installed worker. Source bytes are synthetic .mp4 data;
this exercises the format-independent byte engine, **not video decoding or 4K
movie playback**. Reproduce with `scripts/verify-p0-large-transfer.py --mib 1024
--output report.json` on an expendable test disk with sufficient free space.

## Windows paired artifact and final gates

The earlier [paired run 44132927899](https://github.com/thanks-cohn/chute/actions/runs/44132927899) completed **1800.250 seconds**, two real videos, **527** combined browsing steps and nine media HTTP **206** responses, with no player errors and worker-observed Origin present. Its overall workflow failed the clipboard application gate; the test did not establish exact Explorer item focus and hid the structured API error code. The corrected harness selects/focuses the specific owned file, waits for a clipboard sequence change and handles the actual bounded transient error codes. A later [strict clipboard diagnostic 44141513640](https://github.com/thanks-cohn/chute/actions/runs/44141513640) passed all six actual file/pixel/Explorer/Paint checks after those test-harness corrections. The earlier playback report is preserved as [measured evidence](p0-evidence/2026-11-17/windows-first-30-minute-1b65b2d.json). It is not substituted for the latest candidate.

Latest exact candidate: `1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122`, [paired run 44141513522](https://github.com/thanks-cohn/chute/actions/runs/44141513522). Its final 1800-second gate and the full workflow passed; exact hashes/results are recorded in the final receipt below. The artifact must contain exact `SOURCE-COMMIT.txt`, setup/helper/Chrome ZIP SHA-256, JUnit, installed smoke, compact UX, real clipboard application evidence, and 1800-second real-time playback/navigation metrics. A failure here remains a release blocker; do not mark issues closed or GOLD merely because the source compiles.

The first Windows run's combined navigation steps included search waits, image preview/key actions and folder transitions: p50 **813 ms**, p95 **3718 ms**, worst **5484 ms**. These are not individual API response times. This is a material limit on any near-native claim; inspect the per-lane/burst measurements in the report separately. Long synthetic video fixtures are 640×360/12fps without audio tracks; separate short MP4-with-audio and MP3 cases do not prove full-length A/V synchronization or 4K playback.

## Remaining owner/hardware acceptance

The protected worker, installed Chrome profile, approved D: scope, actual saved files/History and original YUMMY assets are untouched. Owner acceptance still needs the intended ~4-GB Windows device and its real media/codecs/large files, approved D: tree, actual OS associations/toolbar behavior, same-device Explorer comparison, sleep/wake, sign-in, low disk, process/browser restart and prolonged workload. Unit fault injection and synthetic CI workloads are useful evidence, not that full real-world gate. Current limits include one native copy per origin, 20,000 entries per directory, 50,000 handles per grant, bounded image decoding, and browser-supported codecs. No Movie Mode tab, transcoder, independent scripting enrollment, general batch pause/resume, arbitrary-path API or Development 2 mascot was added.

## Final paired receipt — PASS, TEST only

- Exact source: `1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122`.
- [Successful complete Windows run](https://github.com/thanks-cohn/chute/actions/runs/44141513522).
- [Download the matching Windows/Chrome TEST package](https://github.com/thanks-cohn/chute/actions/runs/44141513522/artifacts/14358435326) (GitHub sign-in; 90-day artifact retention).
- **163 Windows tests passed, 14 skipped, 27 subtests passed**. Linux: **164 passed, 13 skipped, 37 subtests passed**.
- Actual packaged worker/helper + actual Chrome 156.0.8078.80 + genuine native messaging: **1800.172 seconds**, two videos, **515** combined browsing steps, **15** independently verified 64-MiB copy jobs, **nine HTTP 206 media responses**, zero player errors, and worker-observed Origin present. Both players reached EOF with their original elements intact. Explicit test pause/seeks are counted separately from errors.
- Six installed GUI clipboard/internal-copy/pixel-readback checks and all six real Explorer/Paint application checks passed. `ACCEPTANCE-STATUS.txt` records `clipboard_apps=success`.
- Downloaded manifest: **24 files** independently hash-verified. All **65 extension files** match the tested source after normalizing Windows text line endings; binary assets match exactly.

| Packaged file | SHA-256 |
|---|---|
| Windows TEST setup | `e17cf38642f0ba82d8bc405a6f1f97756228a510579df1f2a7b2a2e2dbea8a11` |
| Chrome TEST ZIP | `7998e425dd99bc90ff322499baceb677887bd8933df964fb86688639b70e8f9d` |
| Matching native helper | `9b7035e2efa1a314e8d7e5547b475af517bbd1f9556370689d65a260bc4bf72a` |
| Safe isolated checker | `f2808c825fa754cb8ab13f2f30cdcb9545dacffc6fea05d3240c2fec1c7fa6d7` |

[Machine-readable final receipt](p0-evidence/2026-11-17/windows-final-package-receipt.json) · [Full endurance evidence](p0-evidence/2026-11-17/windows-final-30-minute-1e2b2bc.json) · [Actual application evidence](p0-evidence/2026-11-17/windows-final-clipboard-apps.json)

## Important unfinished performance work

**The bounded long-session memory goal is not achieved/validated yet.** In this successful Windows run, sampled worker RSS rose from **49.7 MiB** at startup to **400.4 MiB** near the end; private memory rose from **35.9 to 530.8 MiB**. Peak RSS was **410.6 MiB**. The same worker PID remained alive. This trend needs profiling and a memory-plateau regression before production promotion or a claim of predictable long-session operation on ~4-GB machines. Bounded I/O buffers and admission lanes do not by themselves prove bounded process memory. A concrete next inspection target is per-call ctypes structure/pointer-type creation in `windows_fs.py` and `runtime_log.py`; that is a hypothesis, not a verified allocation root cause.

Combined GUI navigation steps measured p50 **812 ms**, p95 **4468 ms**, worst **6406 ms**. The final worker-side control lane measured p95 **31 ms** and navigation service p95 **47 ms**; the combined GUI steps include several actions and waits. The gap needs profiling before a near-native claim. Thumbnail admission recorded **1797 BUSY** rejections under the mixed workload; control recorded none. These are visible capacity limits, not silently completed work.

The CI machine had roughly **16 GiB RAM**, not the owner's ~4-GB device. Full-length high-bitrate 4K A/V, multi-day reliability, actual D: hardware, sleep/wake and same-device Explorer comparisons remain owner/future engineering gates. The phase is handed off here without starting further implementation.
