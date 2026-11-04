# Persistent Explorer and local-copy adapter test pair

This is an experimental review build, not a production release or installed-Windows acceptance certificate. Use only disposable folders/files. Do not replace an owner's installed pair or upload to a website/cloud provider during automated testing.

## What changed

The native companion stores explicit new read or read/write consent using **current-user DPAPI**, origin/schema-bound entropy and owner/SYSTEM-only file ACLs. Protected state owns the root path, filesystem identity, relative last folder, filter/sort/grid/scroll and bounded operation receipts. Chrome no longer saves the current folder handle. Sessions remain memory-only, exact-origin and 15 minutes; reconnect remints handles after companion restart. Existing process-only approval requires one explicit durable approval. Windows file identities use the same guarded HANDLE fields for listing, stat and opened streams; directory-entry stat representations are not used as authorization identities. Changed root identity, undecryptable state, unsupported consent version and unenrolled origins fail closed. A missing last child falls back to the same approved root.

Select another folder opens consent; Reconnect renews a session; Refresh lists the current folder; Revoke deletes protected authorization and clears visible content. Write approval is a separate **READ AND WRITE** native Shell picker. It selects the root to authorize rather than silently promoting read access. Cancellation preserves existing consent. The Shell picker replaces Tk initialization. Its consent lock is separate from browse/state access, so an open picker does not block the existing folder view. `native_roundtrip_ms` measures native action elapsed time, **including human selection time**, not picker-visible latency. Actual Windows warm/cold/visible latency remains unmeasured.

`get_native_capabilities` detects older helpers before Explorer actions. Native-host installation stages and hashes the bundled helper, atomically replaces it, verifies installed bytes and refuses to register a mismatched/locked update. A failed replacement preserves the previous helper and fails installation instead of claiming success.

## Local copies and browser fallback

Select files and click **Copy to Live** (or start a file drag once to prepare it). Python consumes a session-bound, 60-second one-use `local_explorer` source capability, reads original bytes under guarded handles and independently hashes the genuine Store copy. Drag the prepared row again, or drag the Live card, using the existing relay/site transport. Explorer handles are never Store IDs. No Explorer bearer token/path/source capability is put in public drag formats. A materialized copy has a real Store ID and a distinct source-kind tag.

This release uses an explicit **Live-copy fallback**, not synchronous arbitrary-file export directly into a website during the first drag. Live receives bytes before website delivery is attempted. Website acceptance is not claimed. Website trust restrictions and support for synthetic events are unchanged.

After approving writes, drop actual browser `File` objects or genuine Live items on the current directory, a directory row or a tree folder. Paste actual clipboard files into the focused list as a keyboard alternative. Link-only drops are rejected. Each copy uses bounded reads, exclusive randomized staging on the destination filesystem, fsync, independent hash readback, no-clobber hard-link publication and final handle/hash verification. Default conflict handling is KEEP BOTH; Python also supports SKIP. Replace, move, cut, recursive directory transfer and source deletion remain unavailable.

Inbound binary/Live copies persist an uncertain receipt **before** writing, then a committed receipt after verification. **Check last copy** rechecks the most recent receipt, including after browser/companion restart. `reconcile_transfer(operation_id)` rechecks committed bytes after restart. Duplicate operation IDs are refused. Interrupted/unrecorded completion remains UNCERTAIN; there is no automatic retry or duplicate write. The initial journal holds at most 64 receipts and fails closed when full; archival/acknowledgment UI and recovery of orphan staging files after abrupt process termination remain follow-up work. This is a bounded serial copy foundation, not a durable general batch scheduler. A process interruption may leave a `.chute-stage-*` file; do not delete/retry uncertain copies blindly.

## REDOWN foundation

Wire `TransferIntent` remains backwards-compatible **1.0**, COPY/KEEP BOTH or SKIP, with its existing provisional 300 MB ceiling. `AdapterBridge` and `NativeTransferAdapter` exercise prepare/read/receive/verify/commit/cancel/reconcile, exact registered peers, user-gesture admission, expiry, one-use nonces, replay rejection and participant size negotiation. Local fixtures exercise both directions with independent SHA-256. The bridge is callable only from trusted Python; it exposes no HTTP participant registration or cross-extension message handler. Its ledger is process-local unless a trusted caller supplies persistence; installed trust and durable cross-app recovery are not implemented.

`capabilities().enabled` remains **false**. REDOWN source at `8665e8b6da056293a3a2384e72c314ac14a83b8a` was inspected: its proposal remains unshipped, `extension/beta/file-api.mjs` delegates to existing provider methods, and Explorer drag uses REDOWN-private `application/x-redown-beta` selection state. No matching installed cross-extension trust/send/receive adapter was found. No REDOWN code, account credentials, live downloads/uploads or remote provider writes were performed. These CHUTE-side fixtures do not constitute a REDOWN integration or REDOWN PR.

## Evidence matrix

| Class | Direction/check | Result in Linux development instance |
|---|---|---|
| PYTHON_ENGINE | New consent, warm/fresh controller resume, reminted handles, child fallback, invalid identity/state/origin, revocation | PASS |
| PYTHON_ENGINE | Tiny real PNG/PDF/TXT → Live → exact nested directory, original-byte/hash/name checks, KEEP BOTH, source survival | PASS |
| PYTHON_ENGINE | Read-only write rejection, invalid names, symlink escape, partial stream, bad hash, expired/replayed source, SKIP | PASS |
| PYTHON_ENGINE | Real authenticated binary HTTP/Live receive, duplicate operation rejection, restart receipt revalidation | PASS |
| CHROME_FIXTURE | Explorer thumbnails/original preview, History, context keyboard, overlay geometry, 390/900 px | PASS |
| CHROME_FIXTURE | Production UI Copy to Live, typed existing relay, actual-file/Live drops into exact nested directory, receipt recheck and revoke clearing | PASS (native consent injected, real engine/HTTP/bytes) |
| CHROME_FIXTURE | Popup all 4×4, 5×4, 5×5, 6×5 densities at 390 px, expanded-card nonoverlap, real picture/caption clicks, local lightbox, no implicit Shelf | PASS |
| WINDOWS_NATIVE | DPAPI, owner ACL, separate-process resume, reparse guards, original-byte copies and native helper replacement/packaged protocol | PASS in Windows CI checkpoint `29765b0`, run [41818017457](https://github.com/thanks-cohn/chute/actions/runs/41818017457); final branch follow-up requires its own run |
| WINDOWS_NATIVE | Actual native Shell dialog visibility, cold/warm user timing and reboot | NOT_TESTED; requires interactive Windows acceptance |
| INSTALLED_CHROME | Real enrolled Windows native host, restart/reboot and first-picker interaction | NOT_TESTED |
| LIVE_SITE | Google/Yandex/ChatGPT acceptance in either direction | NOT_TESTED; no live uploads |
| REDOWN_FIXTURE | Both mocked participant directions; bytes/hashes, absent/revoked peer, replay, expiry, bad hash and cancellation | PASS |
| REDOWN_LIVE_PROVIDER | Installed handshake; R2/Drive/Dropbox/OneDrive reads/writes | DISABLED / NOT_TESTED |

Commands: `PYTHONPATH=src python -m pytest -q`; existing worker/thumbnail/tab/package/Settings/updated popup DOM fixtures; `scripts/verify-explorer-browser.py /tmp/chute-browser --fixture`; `scripts/verify-explorer-gallery.py`; `scripts/verify-explorer-copy-browser.py`; `tools/explorer_lab/verify_transfer_pair.py <receipt.json>`. Browser receipts/screenshots are under `docs/explorer/evidence/persistent-transfers-2026-11-04/`. The old popup VM test expected automatic Shelf opening and lacked current DOM APIs; its fixture was updated to assert the current preserved local-lightbox/explicit-handoff behavior. Production popup/Shelf preview code was not changed.

## Matched package and Windows acceptance

The branch push triggers `.github/workflows/explorer-windows-pair.yml` on Windows. It tests the same commit, builds the existing companion plus native helper and Chrome ZIP, smoke-starts the packaged companion in an isolated CI home, and uploads a **single matched artifact** with `SOURCE-COMMIT.txt`, this guide and `SHA256SUMS.txt`. A workflow definition or successful push is not proof the Windows build passed. Check the actual run/artifact before installing; never substitute an older EXE for this extension.

1. Download the single successful matched TEST artifact; verify every SHA-256 using PowerShell `Get-FileHash`. Both halves must have the same `SOURCE-COMMIT.txt`.
2. On a disposable Windows test profile, run its EXE once. If the helper is locked/mismatched, close the test Chrome/companion processes and retry; do not erase History.
3. Load the paired unpacked Chrome ZIP folder through Chrome Developer mode. Approve a tiny disposable folder once, browse a nested folder, change view, close/reopen Shelf, restart the companion and reopen. Confirm no picker, correct root/child/view and fresh session. Repeat after a test reboot. Record Windows picker-visible, warm and cold timings separately.
4. Revoke and verify listing/preview disappear and old session/handle requests fail. Reapprove read-only and confirm writes fail. Approve a disposable read/write root and copy tiny PNG/PDF/TXT into an exact nested target. Independently inspect names and hashes with `Get-FileHash`; test KEEP BOTH and source survival.
5. Try Copy to Live and prepared-row/Live drag only against an approved local fixture. Installed-site and cross-extension tests need their own authorization/evidence.

Rollback: close this test profile and test companion; reload the previously installed matching extension and reinstall the previously known-good matching companion. Keep History/data. Old versions do not consume this protected consent schema; leave it untouched or explicitly Revoke in the test pair first. Do not delete arbitrary Chute data directories. This branch does not merge, deploy, publish a release or replace an installed production pair.

Remaining release gates: independent Windows/security review, actual paired EXE and installed Chrome acceptance, exact picker-visible timings, single-gesture native/website export where supported, batch/cut/move/recursive operations, journal archival/staging recovery, authenticated REDOWN enrollment/provider adapters and separately authorized joint acceptance.
