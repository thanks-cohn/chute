# Optional REDOWN handoff, version 1.0 (disabled)

Read together with `In_Progress/REDOWN_CHUTEY_BIDIRECTIONAL_INTEROP.md` and REDOWN's `docs/proposals/CHUTEY_REDOWNS_CLOUD_LOCAL_INTEROP.md`. This document and `chute.explorer.interop.TransferIntent` define the interface now; neither claims transfers work. No REDOWN code or credentials are copied into Chutey.

The source and destination are opaque one-use, short-lived references minted by their respective engines following an explicit user gesture and exact destination consent. They are **not** a path, bucket key, OAuth credential or generic URL. A control message contains version, random correlation ID, direction, source/destination references, basename, MIME, exact size, expected SHA-256, COPY intent, and KEEP BOTH/SKIP policy. V1 refuses move and replace. Unknown fields/versions, invalid Windows names and path-shaped references fail validation. The parsed object alone conveys **no authority**.

Proposed participant interface:

```
prepare(intent, verified_participant, user_gesture) -> expiring grant / blocked
read(grant, offset, maximum=262144) -> bounded bytes + next offset
receive(grant, bounded_stream, cancellation) -> staging receipt
verify(grant) -> independent read-back hash + exact destination identity
commit(grant, verified_hash) -> completed / partial / failed / cancelled / uncertain
reconcile(correlation_id) -> durable receipt; NEVER automatic replay
```

One stream at a time, consumer-driven backpressure, 256 KiB chunks, known size, 300 MB provisional ceiling (current REDOWN direct adapter ceiling; discover the actual provider limit before prepare). Chutey must stage/flush/verify/atomically publish locally; REDOWN retains its provider-owned upload/staging/auth/readback. Completion requires destination readback bytes/hash and preserved source. Stream interruption is pending/uncertain until reconciliation; it cannot cause blind retry or source removal. Cancellation cannot claim already dispatched cloud writes were undone.

Before binding this interface to HTTP/native messaging: verify enrolled identities on **both** sides through an authenticated native handoff; bind root/participant/action/expiry/nonce; prevent replay; enforce native Windows no-follow handles; add persistent operation ledger, size/hash quotas, staging recovery and explicit conflict resolution. Old REDOWN extensions do not understand this schema. Do not expose the local read-session bearer token to REDOWN or web pages. The current Shelf rejects drops explicitly.

Required joint acceptance remains BLOCKED: independently hash PNG/PDF/video R2→selected local nested folder and local→selected R2 nested folder; test Drive, Dropbox and OneDrive separately with approved credentials; classify real cross-extension drag separately from explicit Send to/Save to fallback; test interruption, disk full, revocation, duplicate delivery, source survival and traversal/reparse attempts. No live provider writes were attempted in this task.

## Implemented adapter foundation (review build, still disabled)

`AdapterBridge` now implements the trusted-code lifecycle and `NativeTransferAdapter`
connects bounded original-byte reads and independently verified writes to the existing
Python root guards. The wire schema remains 1.0. Participant names must already be
registered by trusted native code; a wire intent, `user_gesture` flag or peer string
never enrolls a browser extension. No HTTP or external-message activation exists.
See [test-pair evidence and limitations](PERSISTENT_TRANSFERS_TEST.md), especially
process-local cross-app ledger state and the absence of an installed REDOWN adapter.
