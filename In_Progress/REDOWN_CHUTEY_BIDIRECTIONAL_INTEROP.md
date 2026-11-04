# Chutey ↔ REDOWN — Bidirectional local/cloud drag-and-drop interoperability

**Status:** implementation requirement / coordination spec. Not implemented or verified just because this document exists.
**Priority:** core product outcome after (and in parallel with) the Chutey Python File Explorer engine.
**Direction:** REDOWN connected-cloud folders ↔ Chutey authorized local folders.
**Owner UX principle:** Just drag and drop. Simple.

## Target experience

1. **Cloud → local:** In REDOWN Universal File Explorer, select an image, video, document or several real cloud files and drag them onto a specific Chutey Explorer directory. Chutey writes the original **file bytes** to exactly that chosen directory (not the Live basket), retains the true name/type and proves the final saved contents. A URL shortcut is never masqueraded as the image.
2. **Local → cloud:** In Chutey File Explorer, drag local files or a supported folder subtree onto a specific REDOWN provider/bucket/directory. REDOWN uses its existing authenticated provider adapter to upload actual bytes into that chosen location, preserving names and verifying the destination. Chutey does **not** handle REDOWN's Google/Dropbox/OneDrive OAuth credentials or R2 tokens.
3. **Both apps continue working separately.** Chutey's local filesystem service is independent of REDOWN cloud auth; REDOWN's cloud adapter is independent of Chutey's local permission authority.
4. **Default copy, never implicit move.** Destructive moves require distinct intent plus confirmed write/readback before independently authorized source deletion. KEEP BOTH on conflict, with SKIP and explicit REPLACE available.

## Shared protocol and architecture

- Build a **versioned, optional interop contract** with an operation/correlation ID, source kind, destination capability, user gesture/consent, filename, content type, expected size if known, streaming data, cancellation, integrity receipt and final outcome. Each app implements its own small adapter to its existing production file engine.
- Chutey side: the existing local Python companion owns secure root-scoped directory handles and writes. Its Python scenario game uses these very same production functions without the GUI. REDOWN side: existing Cloud Explorer/provider API owns authenticated provider reads, downloads and uploads. **No second worker**, no duplicate provider adapter, no arbitrary privileged proxy.
- Prefer authenticated bounded streams with backpressure; avoid assembling huge files as base64 messages or full-memory blobs. Create an isolated staged file, verify source/target bytes/hash and final exact path, then publish with safe conflict policy. Cloud-provider receipts are not themselves proof of final file contents.
- Chrome extensions cannot assume private storage, page DOM, or events are accessible across extension origins. REDOWN's in-explorer drag token and Chutey's application/x-chute-item token are currently **different internal mechanisms**. Do not claim native cross-extension drag support without installed-Chrome proof.
- A trusted bridge/handoff requires **explicit user action**, allowlisted and verifiable participant identities, short-lived unguessable grants, scope-limited operations, request origin and anti-CSRF protection, strict path and cloud-identity validation and no credential exposure. Chutey's current generic chrome-extension origin allowance is not sufficient authorization for broad local filesystem writes.
- Provide user-initiated actions such as **Save to Chutey…** and **Send to REDOWN…** as a genuine, visible fallback where Chrome blocks direct drag between extensions. Both must call the same real transfer engine and prompt for exact destination. Do not fake a trusted drop by dispatching a synthetic DragEvent and saying transfer succeeded.
- Never pass Chutey's absolute local path or browsing provenance to cloud providers. Providers may receive only file bytes, filename and minimum required metadata. REDOWN's TRUE REMOTE URL-to-R2 save remains a separate workflow: a cloud→local operation intentionally creates local bytes; local→cloud intentionally uploads locally held bytes.

## Where Codex should work

**Chutey (this repo):** extension/shelf.html + explorer GUI adapter; extension/content.js, drag-relay.js and current native wake/bridge; src/chute/explorer/ production API and Python scenario lab. The existing File Explorer tab has already been created. Use separate explorer CSS/skin tokens, bottom OVERLAY preview, tree and custom local right-click menu. Do not break History or existing boot.

**REDOWN (its repo):** add export/send/import handoff into the Universal File Explorer and its existing cloud provider adapter, retaining REDOWN's Cloudflare R2, Google Drive, Dropbox and OneDrive behavior, provenance privacy, verified-save gating and authorized storage scopes. Reference companion spec: https://github.com/thanks-cohn/REDOWN/blob/main/docs/proposals/CHUTEY_REDOWNS_CLOUD_LOCAL_INTEROP.md

**Source references:** Chutey extension/drag-relay.js, extension/content.js, extension/direct-drop-google-yandex.js; REDOWN extension/beta/explorer.mjs, extension/beta/file-api.mjs, docs/beta/EXPLORER.md, docs/EXPLORER_CONTEXT_MENU_REPORT.md; testing reference REDOWN tools/lab/README.md.

## Acceptance: demonstrate the REAL operation

- At least one authorized real R2 object → Chutey chosen local folder with exact final path + independently verified original bytes/hash.
- One local file → authorized REDOWN R2 bucket + nested folder with independently verified content; then try other connected providers (Google Drive, Dropbox, OneDrive) separately, marking unavailable credential/session scenarios BLOCKED rather than claiming pass.
- Actual PNG, PDF and video; Unicode names, duplicate names, zero-byte and large streamed files within genuine limits; multi-selection and nested folder destinations; lost connection, browser/process restart, revoked auth, full disk, partial upload, cancellation, conflict, symlink/path-escape attempts, duplicate delivery.
- Preserve source for copy; never publish success for just initiated transport. Verified move must have independently checked destination before source deletion.
- Run deterministic isolated Python cases and negative/security tests against the *same* Chutey file API; real Chrome drag/drop and live provider outcomes are **separately tested and labeled**.
- A passing internal drag test doesn't prove cross-extension drag. Record whether a genuine Chrome drag, a user-initiated action, or an unsupported fallback was used.

This requirement supplements In_Progress/CODEX_DRAG_DROP_LOCAL_EXPLORER_IMPLEMENTATION.md. The existing known-working Chutey release tag and Windows EXE remain untouched; this interop feature will require new paired builds and authorization tests.
