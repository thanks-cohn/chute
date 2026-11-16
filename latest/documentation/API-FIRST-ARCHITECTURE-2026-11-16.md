# Chutey API-first direction and implementation boundary

The owner's November 16 addenda extend the authoritative
`CHUTEY-MASCOT-AND-EXPLORER-DIRECTION-2026-11-16.md`. They do not change
its Phase 1 → Phase 2 → Phase 3 validation gates. The GUI is one authorized
client of the native file/media engine. Every meaningful GUI operation must
have an equivalent documented programmatic operation. Do not build competing
file, transfer or Movie Mode servers. Do not modify other product repositories.

## Existing operations and consumers inspected before extension

- `Explorer.execute` owns roots, list/search, stat and preview. `RootGrant`
  owns opaque file handles, approved root boundaries and guarded file access.
- `ExplorerAPI` authenticates HTTP commands/content and enforces exact enrolled
  extension origin, loopback Host, session lifetime and file identity. It also
  routes existing native consent persistence and transfer operations.
- `Transfers` owns prepare/export capabilities; `receive` writes staged files,
  checks integrity and commits. Existing receive/export receipts are synchronous;
  they are **not** asynchronous jobs and do not support 2,000-file queues.
- `NativeExplorer` owns native consent, session renewal, remembered location,
  revocation and recovery receipts. Folder consent must not be fabricated by a
  script. Native messaging uses length-prefixed JSON, not HTTP enrollment.
- `extension/explorer-api.js` is the shared browser transport. Explorer,
  background drag/drop adapters and the new optional media preview reuse it.
- GUI-only state includes selection sets, preview overlay size, image/background
  preferences and keyboard focus. It does not implement filesystem access.
  `ChuteyPresentation.get/update/reset` exposes the shared presentation operations
  to extension-context automation; these methods grant no filesystem authority.
- Existing CLI `chute send/list/remove/clear/path/serve` operates the existing
  basket. It is not a replacement for scoped Explorer APIs.

## Implemented Phase 1 changes

The preserved November 4 release identifies source commit
`b0727d56f89484d110fe7b1d24e12ba9bf476611` in its `SOURCE-COMMIT.txt`.
That API accepts only `handle`, `identity`, `thumbnail` in a content envelope.
The newer extension added `original:false` to *every* request. The old API's
unknown-key check returns `INVALID_ARGUMENT: Expected a file handle.` This is
a schema incompatibility even with perfectly valid authorized handles. The
shared transport now omits `original` unless an actual original export is
requested. It never substitutes an item ID/path/URL for an opaque handle and
canonical identity. Tests reproduce the archived schema exactly. The installed
Windows executable has not been changed or exercised here.

Phase 1 also adds an **optional test-worker** `media_source/release_media`
interface for Explorer video preview because HTML video cannot use the old
POST-with-Authorization content endpoint directly. It reuses RootGrant,
identity checks, session authorization and bounded disk reads. It is not the
Phase 2 performance engine and has not passed the Windows acceptance gate.
Old companions retain small, bounded clip previews; large video previews
explicitly explain the missing capability. See `LOCAL-API.md` and
`local-api.openapi.json` for implemented contracts only.

Preview, Open in default application and Reveal are distinct. Explorer preview
is implemented. Explorer `open` and `reveal` remain rejected by the existing
permission dispatcher (`NATIVE_CONSENT_REQUIRED`). Do not misreport those as
successful or repurpose a saved basket reveal endpoint for arbitrary Explorer
files. The History "Reveal saved file" action is the existing saved-item API,
not arbitrary filesystem access. Windows open/reveal consent and regression
validation remain Phase 1 blockers.

## Phase 2 requirements (not implemented by this document)

Preserve the exact installed EXE and archived release. Benchmark the original
first under matched workloads on Windows. Extend the established engine with
format-independent byte streaming, fair bounded scheduling, concurrent control
traffic, bounded thumbnails, cancellation, backpressure and diagnostics. Detect
containers/codecs and select strategies through a versioned adapter registry;
see `MEDIA-ADAPTER-CONTRACT.md`. No blanket format or performance guarantees.

Add a permission-scoped local automation enrollment path; do not relax Origin
or require scripts to reverse-engineer Chrome. Existing enrolled sessions can
be exercised with scripts now, but independent automation authentication is
not implemented. Keep versioned schemas, discovery, error codes and migration
notes synchronized with actual implementation.

Long operations must return unique job IDs with queryable state, per-file and
batch receipts, bytes/files progress, throughput, cancellation and explicit
pause/resume/retry eligibility. An accepted request is not a completed copy.
Proposed lifecycle: queued → running → paused/cancelling → completed/failed/
cancelled; interrupted jobs require reconciliation before resumption. This is
a **design target**, not a current endpoint. Implement durable checkpoints,
conflict receipts and integrity verification before exposing large-batch jobs.
Moves delete sources only after verified destination completion. Destructive
operations need explicit separate authority and recovery semantics.

Required parity/stress checks cover GUI/API listings and identity, thumbnails,
separate preview/open/reveal, actual completed copies, jobs/progress/recovery,
range semantics, cancellation cleanup, unauthorized clients, meaningful
connection errors and simultaneous media + transfers + browsing. Benchmarks
must record latency distributions, throughput, memory/CPU/handles/temp usage,
errors, restarts and recovery; include 1/4/8/16 concurrency, multi-GiB files,
random seeks, fault injection and realistic soak duration. No claims about the
owner's hardware from Linux fixture results.

## Phase 3 requirement

Only after both prior gates pass, implement History | File Explorer | Movie Mode.
Use the established adapter registry and media APIs, including a test adapter
proving extensibility. Initial direct MP4/WebM playback is sufficient where
browser codecs support it. Future MKV/AVI/HEVC adapters must not require rewriting
the file engine, streaming engine, Explorer or player. Preserve permission
checks and resource cleanup for every strategy.

## Preservation and promotion

Immutable installed Windows EXE SHA-256:
`C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`.
Chrome reference: `45dc8f034045c8807f5b712f7e8915c7ba76313a`.
Protected archive: `archive-chutey-11.16.2026`.
Only develop on `fix/chutey-popup-stable-first-paint-2026-11-16`.
Do not modify historical releases/tags or installed applications. Build candidate
Windows artifacts separately with source SHA, architecture, checksums,
reproducible commands, benchmark evidence and rollback instructions. Promotion
requires owner approval and verified results; source tests are not promotion.
