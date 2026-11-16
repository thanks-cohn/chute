# Media adapter contract — Phase 2 design target, version 1

Status: required architecture, **not an implemented registry**. Phase 1 must
pass its Windows/Chrome gate before implementing the Phase 2 registry or the
Phase 3 Movie Mode UI. The small Explorer preview's optional media_source API
does not establish Movie Mode support.

## Responsibilities and extension boundary

The core owns authorization, opaque file identities, guarded disk access,
format-independent ranges/HEAD, bounded buffers, scheduling, cancellation,
resource budgets and diagnostics. Container/codec policy belongs to adapters.
Core streaming must not restrict bytes to MP4/WebM. No client or adapter gets
an arbitrary absolute path or a general session credential.

Registry registration is an explicit trusted local operation, not a downloaded
script or an HTTP upload-and-execute endpoint. Use a versioned Python interface
and discover installed trusted modules through a controlled registry. Reject
unknown contract versions, duplicate IDs and missing cleanup methods. Future
external transforms run in supervised processes behind the same capability
checks; no arbitrary shell arguments from file metadata.

Proposed adapter interface (contract major version 1):

```python
class MediaAdapter:
    api_version = 1
    adapter_id: str                  # stable namespaced identity
    priority: int
    def probe(self, source, budget) -> MediaDescription: ...
    def supports(self, description, client_capabilities) -> Capability: ...
    def prepare(self, source, description, request, budget, cancellation) -> PlaybackSession: ...
    def close(self, playback_session) -> None: ...
```

- `source`: scoped read capability, identity/size, bounded read_at(offset,length)
  and stat; guarded by the same engine as Explorer and automation. Adapters do
  not open filesystem paths themselves.
- `budget`: deadline, maximum probe bytes, memory, CPU/decode slots, temp space,
  open descriptors and output lifetime. Limits must be selected from measured
  resource availability; exhaustion returns RESOURCE_LIMIT rather than hanging.
- `MediaDescription`: detected container, video/audio codec profiles where
  known, duration/dimensions where known, confidence and unknown fields. MIME
  guesses alone must not be reported as detected codecs. Probes are bounded;
  optional trusted metadata tools require separate installation and sandboxing.
- `client_capabilities`: browser/platform codec support, player features and
  transport requirements. `canPlayType` is a hint; actual decoder errors remain
  possible. Unsupported/unknown must be explicit.
- `Capability`: supported/unsupported/unknown, reason, direct/remux/transcode,
  seek support and required resources. No automatic unrequested transcoding.
- `PlaybackSession`: adapter/version, opaque session ID, output MIME/codec info,
  core-authorized media URL, expiry, seek model, diagnostics and cancellation.
  URLs never carry absolute paths or general authentication secrets.
- `close` is idempotent and releases input handles, output streams, child
  processes and temporary files. Cancellation propagates through every stage.

## Initial and future strategies

Direct-browser adapter: MP4/WebM container eligibility plus client codec
capability checks; use the core range stream with no whole-file Blob or disk
copy. Browser playback/decoding is independent of worker byte throughput.

Future remux adapter: repackage compatible codecs, report whether output is
seekable and whether indexes must be prepared. Seeking cannot assume output
byte offsets equal source offsets. Reuse the core's output-source abstraction.

Future transcoder adapter: explicitly authorized optional transform, constrained
process and bounded output buffering/temp space. Expose cost/capability errors.
No MKV/AVI/HEVC transcoding is required now; these are extension examples.

## Registry/player contract and migration

The engine lists adapter IDs, contract versions and capabilities. Selection is
deterministic, records its reason, and never falls through to another file after
an error. The GUI/CLI requests a playback session, then uses its standard player
and core stream regardless of adapter. Switching strategy does not change
Explorer selection, authorization or Movie Mode controls. Pause or continue on
tab switches is an explicit tested policy; no leaking decoders or streams.

Add new adapters by implementing version 1, registering a unique ID, supplying
bounded probe/prepare/close tests, and advertising capabilities. Compatible
optional fields are additive. Breaking changes require a new contract major;
unsupported versions fail explicitly. Pin and report adapter versions in build
and benchmark receipts. Never claim a planned adapter is installed.

## Required contract tests before Phase 3

1. A test-only synthetic additional container adapter registers and selects
   without changes to core, Explorer, streaming engine or player.
2. Duplicate ID/version mismatch, malformed probe output, budget exhaustion,
   denied source, replaced identity and unsupported codecs fail truthfully.
3. Direct media covers HEAD/ranges/seek and valid browser playback.
4. Cancellation/close/expiry disconnect streams and free every resource; repeated
   close is safe and child processes cannot outlive the session.
5. Concurrent adapters/media/copies/listings respect fair resource budgets.
6. Optional remux/transcode absence leaves direct support usable and reports
   unsupported formats without pretending they decoded.
