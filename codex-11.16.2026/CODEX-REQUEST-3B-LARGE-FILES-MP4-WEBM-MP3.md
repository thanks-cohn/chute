# CODEX REQUEST 3B — DEVELOPMENT 1 ONLY: large files, MP4/WebM/MP3

**Owner feedback, 2026-11-16:** Matching Development 1 worker and extension now work on the user's Windows 11 PC. **Large files still do not reliably work**; MP4, WebM and MP3 require real verification. Issue [#18](https://github.com/thanks-cohn/chute/issues/18). Read the master Request 3 and the original Development 1 Request 1. No Development 2 work.

## Confirmed source observations — DO NOT confuse limitations

At source commit `62694d6`:
- `extension/explorer-view.js`: outgoing Explorer dragstart rejects `source.size > 32*1024*1024`, message "Use the file picker for files larger than 32 MiB." This is a specific **Explorer drag path**, not proof that all file imports cap at 32 MiB.
- That file's `chutey-read-explorer-drag` incoming handoff decodes `data.base64` into `Uint8Array` and makes `new File`. This creates potentially huge in-browser copies. Track upstream `extension/background-*.js` implementation and any Chrome messaging payload limits.
- `extension/explorer-api.js` posts an actual `File` as octet-stream to `/api/explorer/v1/receive`; `src/chute/explorer/transfers.py` reads/writes in 256 KiB chunks with a verified staged copy. Maintain byte integrity and permissions.
- `src/chute/server.py` ordinary `/api/upload` uses `CHUTE_MAX_UPLOAD_BYTES`, default 8 GiB; `src/chute/store.py` streams in 1 MiB increments. These are backend pieces, **not end-to-end guarantees** for every UI gesture.
- `src/chute/explorer/interop.py` has a 300,000,000-byte cap but that versioned local/cloud adapter reports `enabled:false` and is not proof of the active path's cap. Keep experimental interop authority and scope separate.
- `src/chute/explorer/preview.py` recognizes `video/mp4`, `video/webm`, `audio/mpeg`, and `extension/explorer-view.js` uses bounded `media_source` byte-range playback when present. `tests/test_explorer_media.py` includes sparse 3-GiB WebM and 96-MiB MP3 range tests, **not proof of decoding full real MP4/WebM/MP3 in Chrome on owner's Windows PC**.

## Work to perform

1. **Reproduce and report by gesture, not conjecture.** Matrix: browser right-click or drag into live Chutey; Windows Explorer file drop into the popup/Shelf/Chutey Explorer; Chutey Explorer local->live; live->approved local Explorer; Chutey item drag to normal Windows file target; Chutey item drag to supported website file input. Separate supported, blocked-by-browser, unimplemented and failing paths. For each report filename type, exact test size, result/error, source and destination bytes/receipts.
2. **Implement safe large-file transfer on supported paths** without full-file base64, `File.arrayBuffer`, unbounded `Blob`, `JSON.stringify` of bytes or arbitrary giant browser messaging objects. Use bounded chunking/backpressure/streaming and explicitly authorized handles or protocol where technically supported. A 32-MiB cap may be removed **only after** the actual replacement path has integrity/security tests; no unsupported shortcut that silently loses bytes. Preserve existing small file flows.
3. **Real media acceptance**: small and large valid MP4 (e.g., H.264/AAC), WebM (e.g., VP8/VP9/Opus) and MP3: save, list, identify MIME, preview/play, pause, seek, close/cleanup, drag/copy to allowed local target, SHA-256 end-to-end on transferred bytes. Differentiate container recognized from codec actually supported by Chrome, and from missing/cancelled/broken media tickets. No fake success and no automatic transcoding implied.
4. **Resource and failure protection**: User's machine has 4 GB RAM and as little as ~2.27 GB C: free. Avoid whole-file loads, excessive thumbnails, simultaneous transfers, stale temp files or logs. Check available destination disk space and error gracefully before/while intake; file size beyond free disk is **not a software memory leak**. Include known size, unknown/partial size, network interruption, browser shutdown, cancelled transfer, duplicate name, disk-full, revoked folder, expired ticket, corrupted bytes, crash/restart and lost receipt.
5. **Honest receipts**: Verify committed file size/bytes/digest as supported; no "YUMMY" or success counters before confirmed commit; on uncertain receipts reconcile before retry; do not replay a large upload automatically and create duplicates. Source is never deleted by copy.
6. **Scope**: Keep cloud-provider/REDOWN integration disabled unless already supported; no promise of unlimited files, cross-site drag or 4K Movie Mode. If Chrome/Windows drag protocol cannot carry large files, provide an explicit, reachable safe alternative UI rather than pretending it works.
7. **Validation**: bounded-memory tests for large sparse files + real bytes and real media on Windows; range HEAD/GET seek; memory/commit/disk/latency instrumentation for 4 GB class system; responsive folder UI while copying or playing. No private file contents in logs.

## Deliverables and gate
Confirmed root cause(s) vs unresolved guesses, exact changed code, tests/evidence for every tested media format and file size, known unsupported modes, safe cancellation/disk failures, source SHA. If native changes needed: build and upload a **matching isolated test Windows companion + native host + Chrome extension**, identify `Chutey-Setup` clearly, provide checksums and explicit opt-in install steps. Do not silently replace running installed worker or modify archived worker, stored files/history, production Chrome profiles or snapshots.

**Development 1 owner acceptance pending. STOP. Development 2 not authorized.**
