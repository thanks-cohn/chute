# Chutey Development 1 / P0 phase handoff

**Branch:** `fix/chutey-media-worker-2026-11-17`  
**Runtime/package source:** `1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122`  
**Final paired verification:** https://github.com/thanks-cohn/chute/actions/runs/44141513522  
**Status:** Phase closed with a verified TEST candidate and a successful complete Windows run. Owner acceptance and the unfinished performance work below remain required. Documentation/test-only closeout commits may follow; runtime changes will not be made as part of this handoff.

## Finished

- Repaired exact-Origin media transport in real Chrome without relaxing worker authorization. Added short authenticated renewable file-specific leases and preserved them across session renewal.
- Pinned Shelf playback independently of directory browsing, search and ordinary previews. Retained MP4/WebM/MP3 streaming and seeking in Shelf and the small popup. Preserved bounded small-media compatibility fallback.
- Added real persisted Efficiency / Balanced / Turbo worker modes and Settings acknowledgment, bounded independent work lanes, HTTP thread/backlog caps, cancellation/coalescing and resource/latency diagnostics.
- Repaired stale pending-copy reconciliation, added visible review/verify/cancel/dismiss controls, preserved durable receipts and prevented uncertain replay. Verified fresh generated job IDs and consecutive copies.
- Implemented separate Windows file-list clipboard and image-pixel clipboard operations. Preserved explicit Copy/Paste inside Chutey. Removed duplicate legacy menu entries.
- Repaired Folder Access overlay/focus, preview keyboard navigation, first-use system Open/Reveal defaults, shared Settings, scoped Restore Defaults and Popup/Shelf toolbar configuration.
- Separated saved History media from external-folder playback opt-out. Added a truthful unsupported-media error instead of a loading dead end.
- Preserved Request 3's popup/Trash It!, single ZIP History export, daily-highlight formatting/preview, background defaults and original YUMMY assets.
- Updated implemented API contracts/OpenAPI, examples, recovery instructions, regression tests, stress tools and build/test packaging.

## Verified

- Linux: **164 passed, 13 skipped, 37 subtests**; JS contracts and actual Chromium regression flows pass.
- Actual browser: 12 small/large MP4/WebM/MP3 playback/seek cases across both viewers; six verified native media copies; old small-MP4 fallback; popup layout, History export/highlights, overlay, keyboard and settings checks.
- Large-file byte-engine stress: two **1-GiB** copies with independent SHA-256 checks alongside two paced range readers; **84.5 / 120.9 MiB/s** verified throughput. Combined in-process fixture RSS peaked at **55.8 MB**. These are Linux measurements, not Windows/4K or near-native claims.
- Earlier actual paired Windows run: **1800.250 seconds**, two movies, 527 combined browsing steps, nine HTTP 206 responses, no player errors, and server-observed correct Origin. The overall run failed its application-clipboard gate, so it is not declared fully accepted.
- Subsequent strict Windows application diagnostic: **all six** Chutey↔Explorer/internal/Paint PNG/JPEG/WebP checks pass. Actual installed Chrome GUI smoke also exercises consecutive clipboard/internal pastes and independent image-pixel readback.
- Final matching candidate: **all gates passed** in run 44141513522. **163 Windows tests / 14 skipped / 27 subtests**, actual Chrome GUI + six application-clipboard checks, **1800.172 seconds**, 15 verified copies, two videos reaching EOF, zero player errors and nine HTTP 206 responses.

## Not finished / not claimed

- **Long-session memory remains unfinished:** Windows worker RSS rose **49.7 → 400.4 MiB**, private memory **35.9 → 530.8 MiB** during the run. Profile and fix the growth, then add a plateau test before promotion. Peak RSS was 410.6 MiB; bounded request buffers are not proof of bounded process memory.
- Owner testing on the intended ~4-GB Windows machine, existing approved D: scope/profile, actual movie codecs/sizes, sleep/wake, sign-in, browser/worker restart, low disk and default-app/toolbar behavior.
- Same-device Windows Explorer performance comparison or a claim of near-native speed. Final Windows combined UI navigation steps had a 4.468-second p95; these include multiple UI actions and waits, not individual API latency.
- High-bitrate 4K/full-length A/V synchronization acceptance. Long synthetic clips are 640×360/12fps video-only; separate short audio cases do not prove full-movie A/V behavior.
- General standalone automation enrollment, thousands-file batch jobs/pause/resume, a codec/transcoding adapter implementation, Movie Mode UI, or Development 2 mascot/portable Explorer work. These were not implemented in this repair phase.
- GOLD certification, merge or deployment. No issue is closed solely on CI success.

## Package and next owner action

Use the [verified matching TEST package](https://github.com/thanks-cohn/chute/actions/runs/44141513522/artifacts/14358435326). Its source is `1e2b2bc`; the full SHA-256 table is in the detailed results and its own `SHA256SUMS.txt`. Its package contains the Windows setup, matching native helper, safe isolated checker, Chrome ZIP, source SHA, checksums and evidence. Verify `SHA256SUMS.txt`; follow [safe installation/rollback instructions](P0-2026-11-17-HANDOFF.md) in a separate VM/account/profile. Do not replace the working owner installation merely to test this candidate.

[Detailed fixes, failures, measurements and final receipts](P0-2026-11-17-IMPLEMENTATION-AND-RESULTS.md) · [Native API](P0-NATIVE-API-2026-11-17.md) · [Clipboard contract](WINDOWS-CLIPBOARD-API.md) · [Recovery contract](PENDING-COPY-RECOVERY-2026-11-17.md)

Installed owner worker/Chrome, saved content, History, archived worker/releases and GOLD references were not touched. Development 2 requires separate explicit owner approval.
