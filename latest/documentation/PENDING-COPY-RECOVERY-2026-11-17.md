# Pending copy reconciliation (#27)

The browser retains one `chuteyPendingTransfer` ID (mirrored to local storage for
full Chrome restart and to session storage for existing clients) until it has a verified terminal
receipt or the user explicitly reviews and dismisses it. Before a new intentional
copy the transport queries that SAME ID; it does not automatically resubmit it.

- accepted/running: report phase and copied byte progress; Cancel is available.
- COMMITTED: `transfer_verify {id}` reopens the destination through its authorized
  root and compares the canonical artifact identity/size to the independently
  hashed receipt. If unchanged, the old marker is safely acknowledged/cleared.
- Older receipts without a private destination locator require
  `transfer_verify {id,destination:<approved directory handle>}`. The worker hashes
  that guarded file asynchronously. Status returns `verification:VERIFYING` until
  it matches; unrelated file names, sizes, hashes or roots cannot verify a receipt.
- failed/cancelled: show their reason and permit explicit dismissal after review.
- UNCERTAIN or missing: preserve bytes/ID/evidence; require destination review.
  Missing is not proof of rejection and never causes automatic replay.
- worker unavailable: preserve the marker and report disconnection distinctly.

Public methods on ChuteyExplorerAPI: `reviewPending({destination?,onProgress?})`,
`cancelPending()`, `dismissPending({reviewed:true})`. `transfer()` uses the same
reconciliation before admission. Web Locks serialize cross-surface admission and
marker changes; a module-local promise queue is the fallback. Network exceptions
never replay transfer_start. A retained ID is not silently overwritten by another
copy. Newly issued direct completed receipts require size/digest validation before
UI success/count events.

Native `TransferJobs.verify(id,destination=None)` returns normal job status with a
`verification` object. Verification is a bounded background read when a full hash
is needed. Status/cancel remain responsive during admission and final-receipt
fsync. Terminal state and released queue capacity publish together after durability.
Private journal root IDs/relative components are never public response fields.

`transfer_dismiss {id,reviewed:true}` preserves failed/cancelled/uncertain evidence
and marks it dismissed, allowing another intentional operation. COMMITTED normal
acknowledgement also keeps the durable receipt on disk. Dismissed receipts do not
consume active memory/admission capacity, and reusing an old ID still returns its
old outcome rather than performing the file copy again. No History, original,
published destination or uncertain stage is deleted by reconciliation/dismissal.

Native clipboard Paste uses `clipboard_to_local` with snapshot, index and approved
writable destination handle. The clipboard adapter alone resolves the native
CF_HDROP paths and revalidates their identities. The job consumes its bounded
read context and the existing receive/verify/no-clobber engine. Browser requests
cannot provide arbitrary source paths. Internal local_copy remains available.
