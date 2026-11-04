# CODEX P0 — Persistent permissioned Explorer, native drag-and-drop, and CHUTE ↔ REDOWN bridge

**Repository:** `thanks-cohn/chute`  
**Starting point:** latest `main`; inspect HEAD and outstanding branches/PRs before coding.  
**Implementation:** focused branch `codex/chute-persistent-explorer-dnd-redown-2026-11-04` (choose a collision-free suffix if it exists), one reviewable PR, **no auto-merge/deployment**.  
**Priority:** P0 persistent, instant Explorer → P0/P1 real local drag/drop → P1 protocol-bound REDOWN interoperability.  
**User principle:** **“Just drag and drop. Simple.”** An already permissioned folder is available every time; no pointless re-selection or slow picker.  
**Status:** implementation request, NOT evidence that the feature has shipped.

## 0. Outcomes and non-negotiables

1. If I deliberately approved a folder, CHUTE's File Explorer remembers that permission, returns to my **last browsed directory and view**, and opens responsively on future Shelf opens and supported Windows companion restarts. No repeated `Select Folder` merely to start browsing. If access is genuinely revoked/invalid, explain why and request consent **once**, never silently broaden scope.
2. CHUTE's **existing** Live basket drag pipeline also works with real local Explorer files in both directions where Chrome/Windows permits. This means original file bytes—not an icon, thumbnail, path-shaped string, fake URL shortcut, synthetic “success,” or a Chute Store ID fabricated from a local Explorer handle.
3. Start real CHUTE ↔ REDOWN drag/copy compatibility both ways using the existing disabled versioned protocol; release a usable **secure adapter foundation**, then wire verified end-to-end paths only after both sides implement actual permissioned receive/send. Do not assume native cross-extension drag events carry private formats.
4. Preserve the just-fixed CHUTE pop-out lightbox, Shelf card clicks, nonoverlapping card geometry, History pagination, existing functional website/Live basket drag, and Windows Explorer navigation. Never quietly replace a working feature with new demo UI.
5. **No access to arbitrary folders without consent.** Folder approval must be explicit, revocable, origin-bound, scoped (read vs write), user-bound and safely persisted by the native companion. No private folder paths or long-lived session tokens in Chrome storage, web drag data, cloud APIs or logs.
6. Use **one existing MV3 worker**, **one existing native companion** and **one production Python Explorer engine**—extend these, do not fork/rebuild.

## 1. Actual source baseline (verify against newest commits)

| Component | Current observed behavior | Target |
|---|---|---|
| `src/chute/explorer/native.py` | `NativeExplorer.adapters` is **process-local**; `explorer_resume` can only reuse an in-memory grant. `choose_folder` uses Tkinter `filedialog.askdirectory`. | Protected persistent per-user approved roots; native Windows picker improvements; fast revalidation and resume after restart. |
| `extension/explorer-view.js` | Saves `chuteyExplorerLastHandle` in Chrome local storage and attempts it on session reconnect, then falls back to approved root. Handles expire when root engine restarts. Explicit `dropEffect="none"` and rejected workspace drops. | Remember logical subpath *inside* native protected permission authority, remint opaque handles after restart; enable drag/drop with secure adapters. |
| `extension/explorer-api.js` | Read-only authenticated commands; `nativeSession(select)`; preview endpoints only. | Capability-discovery, scoped source reads and destination writes, streaming + progress, typed receipts. |
| `src/chute/explorer/security.py`, `windows_fs.py` | Native root guards, opaque handles, origin-scoped 15-minute session. | Preserve guards and short session TTL while safely persisting *authorization*, **not** bearer token. |
| `extension/shelf.js`, `drag-relay.js`, `content.js`, `direct-drop-google-yandex.js`, `drop-lifecycle.js`, `bin.js` | `CHUTE_ITEM:` and `application/x-chute-item` are **Live Chute Store IDs**, existing browser adapters and capture pipeline. | Shared typed dispatch with a distinct Explorer source/destination identity; do not conflate Store ID with Explorer file handle. |
| `src/chute/explorer/interop.py`, `docs/explorer/INTEROP.md` | `TransferIntent` v1 validation, **capabilities().enabled=False**, no actual transfer authority/transport. | Preserve schema semantics; versioned opt-in secure bridge, verified participant discovery, native-granted one-shot transfer lifecycle. |
| `thanks-cohn/REDOWN` | Separate extension/provider file explorer and authenticated cloud destinations. | REDOWN-owned provider adapter remains sole cloud credential owner; CHUTE-owned native adapter remains sole local-filesystem authority. |

Other required reading: `In_Progress/CODEX_CONNECT_EXISTING_DRAG_DROP_TO_EXPLORER_GOOGLE_YANDEX_CHATGPT_BIDIRECTIONAL_2026-11-04.md`, `In_Progress/CODEX_DRAG_DROP_LOCAL_EXPLORER_IMPLEMENTATION.md`, `In_Progress/CODEX_P0_WINDOWS_EXPLORER_FAST_FIRST_PROGRAMMATIC_CORE.md`, `In_Progress/REDOWN_CHUTEY_BIDIRECTIONAL_INTEROP.md`, `bugs/CHUTEY_WINDOWS_EXPLORER_SELECT_FOLDER_NATIVE_ACTION_MISMATCH_2026-11-04.md`, `extension/popup-gallery.js`, `extension/shelf-gallery-preview.js`. For REDOWN read `docs/proposals/CHUTEY_REDOWNS_CLOUD_LOCAL_INTEROP.md` if present and current provider/upload/download internals. Confirm real source; do not infer unpublished working APIs.

## 2. Milestone A — persistent owner-approved folders (FIRST TESTABLE RELEASE)

**Authorization state versus session state are different.** Short-lived HTTP bearer tokens/opaque root handles **must not** be persisted as reusable authorization. Persist a narrowly scoped owner-approved Windows root grant only through protected native storage, bound to the logged-in user, installed enrolled extension identity, consent version and root identity. DPAPI plus proper owner/SYSTEM ACL and correct revocation semantics are candidates—review implementation/security before choosing.

- On first approval, store a protected native grant descriptor. Restore after Shelf reload, browser restart, companion restart/relaunch, machine reboot and extension worker sleep **when native trust assumptions are satisfied**. Use a fresh short-lived session, remint opaque handles and revalidate root identity/canonical boundaries at every restart.
- Keep last opened relative directory under each approved root, sort, filter, grid/list and scroll state. A disappeared/moved/renamed subdirectory gracefully returns to its approved root without losing the original root approval. Never persist a private absolute path in Chrome state; native state owns private path/identity. Multiple approved roots may be supported by design; at least the most recent root must work end-to-end.
- Clearly separate `Select another folder` (new explicit user consent), `Reconnect` (repair native session), `Revoke access` (native grant deletion), and normal `Refresh`. Initial Shelf opening triggers resume automatically; a valid grant never opens the folder picker.
- For legacy process-only permissions, prompt **once** to establish persistent authorization; do not invent implied durable consent or silently import old paths. Session expiry ≠ permission revocation.
- Repair slow `Select Folder`: measure native-host launch, existing bridge wake, POST/session, Tk initialization, picker creation and **picker visible latency**. Prefer reliable Windows native folder chooser if verified faster; do not invent latency numbers, block UI thread, or freeze browse while showing dialog. Keep cancel non-destructive.
- Show ready/empty/unauthorized/offline/recovering distinctly with gentle compact state. Cache current visible listing only for fast appearance, mark stale while verifying it and never render it as validated access after permission revocation. No background recursive scanning.
- Native path validation remains Windows no-follow/reparse-safe; preserve root escapes protection and exact extension allowlisting. Secure state corruption/tampering, different OS user, native host version mismatch, revoked/missing folder, or stale handle must fail safely with a single meaningful CTA.

**A acceptance:** first consent once → browse nested child → close Shelf/reopen → close/restart companion → reopen Shelf → Windows reboot simulation/test where feasible → same approved root and last directory reappear without picker. Revoke → all access stops and previously rendered content disappears. Restore latency report warm/cold using actual Windows build, separate from unit-test timings.

## 3. Milestone B — local files use CHUTE's proven drag-and-drop

**B1 outbound (shippable before write permission):** Local file row / selected files → CHUTE Live basket or legitimately supported Google Images/Lens, Yandex or ChatGPT user-initiated drop surface. Preserve original filename, extension, MIME, contents, metadata only as necessary. Source adapter accepts an opaque native handle + file identity under a validated read grant, not plain path; use a short-lived, one-use drag capability and bounded streaming, not the preview-limited endpoint for arbitrary content. Integrate with `drag-relay.js`, `content.js`, `direct-drop-google-yandex.js`, `drop-lifecycle.js`. Reuse existing relay/state machine with a new distinct source kind `local_explorer`, do not alter behavior of `chute_store` sources.

**B2 inbound (requires explicit write consent):** Browser dragged actual bytes/Live basket item → **specific** approved Windows folder. Handle targets: current-folder empty space, folder rows, tree nodes; clear hover destination + copy cursor; keyboard fallback. Native approval must authorize *write to this root/destination*, separately from read. DataTransfer.files/items and genuine image bytes are allowed when available; source URL/link-only is not a successful file transfer. Resolve in controlled extension/companion, not untrusted webpage code. Write via Python engine: safe names, bounded chunks, backpressure, staging on destination filesystem, fsync/verified readback hash, atomic publish, independently verified final directory and filename. Default **KEEP BOTH**; SKIP allowed; REPLACE only after explicit confirmation and separate safety gates. COPY by default, never auto-delete source. Never overwrite on mere drop hover or touch.

**B3 local ↔ local:** use same Python operations for authorized folder-to-folder copies, multi-select, cut/paste only when source/destination authority verified. Batch receipts and durable, bounded queue states. No separate JS filesystem mutation engine. Broken/partial transfer should reconcile, not fake green success.

**Required states:** `PREPARED`, `READING`, `DELIVERY_ATTEMPTED`, `RECEIVING`, `STAGED`, `VERIFIED`, `COMMITTED`, `CANCELLED`, `FAILED`, `UNCERTAIN`; distinguish whether a website **accepted** a synthetic drop from mere initiation. No unsupported “100% saved” on timer. Safely stop/reconcile on window close or interrupted stream. Site-specific browser trust limitations must be reported as BLOCKED with a user-initiated fallback (not bypassed).

**B acceptance:** drag one real PNG, PDF, text file from authorized Explorer to Live and back to an exact nested write-approved directory, with independent byte hash and name verification; test eligible Google/Yandex/ChatGPT surfaces separately and do NOT claim they work without installed-site proof. Verify selection, drag overlay, thumbnail, card positions, and existing Live CHUTE/History do not regress.

## 4. Milestone C — secure CHUTE ↔ REDOWN compatibility layer (START NOW, enable incrementally)

The owner wants **drag and drop to and from REDOWN**, not another disconnected wizard. Build the **protocol and adapters** now, in parallel with local drag engine work; activation follows verified permissions. V1 UX: drag/copy local → a specific REDOWN cloud provider/bucket/folder; drag/copy REDOWN cloud object(s) → a specific CHUTE authorized local directory. When browser cross-extension drag cannot share payloads, use an explicit user-clicked `Send to REDOWN` / `Save to CHUTE` fallback using the *same underlying transfer intent*, with matching destination picker. Never claim that synthetic Chrome events equal real native drop.

- Reuse `src/chute/explorer/interop.py::TransferIntent` and `docs/explorer/INTEROP.md`; evolve version explicitly and backwards-compatibly. Implement provider-neutral `prepare`, `read`, `receive`, `verify`, `commit`, `cancel`, `reconcile` and capability negotiation. Keep `enabled=false` until a secure end-to-end authority+verification gate genuinely passes.
- One-use, expiry-bound, target/operation-bound intents, random correlation IDs, nonce/replay prevention, exact participant identity, origin allowlisting, and user gesture/consent. The wire-level intent **alone is not authorization**. Never expose native path, cloud credentials, source webpage URL or full browsing provenance to provider APIs; REDOWN should get only original file bytes and minimal required filename/type metadata.
- CHUTE owns local read/write/staging/verify under scoped native grants. REDOWN owns OAuth, R2/S3 credentials, object listing, authenticated source downloads and destination upload verification. No REDOWN cloud tokens in CHUTE, no privileged local filesystem authority in REDOWN pages. No second MV3 worker, open proxy, broad loopback CORS or arbitrary HTTP fetch service.
- Bounded streams with backpressure and cancellation, avoid full-file memory copies and base64 JSON. Size limits derive from real participant/provider capabilities; do not hardcode an arbitrary product file-size cap. Existing v1 300 MB validation is provisional and must be negotiated/migrated carefully instead of silently promising 5 TB.
- Local → REDOWN: preserve provider's existing destination configuration, explicit exact cloud target and conflict policy; cloud completed only when provider-confirmed upload and appropriate readback/receipt. REDOWN → CHUTE: exact approved directory, staged local file, independent readback hash. Reconcile uncertain state before retry; no blind duplicate writes.
- Design a reusable adapter for future Rcomplex OS integration, without making either application depend on being installed with the other. For unsupported/absent partner, keep the source app fully usable.
- Mirror the protocol portion in a separate, clearly scoped REDOWN PR only if write access is available and after inspecting REDOWN current code. Avoid importing code or credentials across repositories. A Chutey-only contract/fixture does **not** constitute working live REDOWN integration.

**C acceptance:** two locally mocked/fixture participants complete both directions with real disposable bytes and independent SHA-256; one side absent/revoked, duplicate intent, malformed payload, expired nonce, interrupted transfer and conflict policy fail safely. Installed extension-to-extension handshake and actual live provider transfers require separately authorized test accounts and owner approval. Report fixture vs installed Chrome vs live R2/Drive/Dropbox/OneDrive as distinct evidence levels.

## 5. Verification and programmatic testing

Use existing Python Explorer's **actual production** operations, not UI mocks, for headless scenario tests. Cheap disposable fixtures only (tiny PNG/PDF/TXT, nested folders, name conflicts, locked files, partial streams). Incorporate existing `tests/test_explorer*.py`, `tools/explorer_lab/`, Chrome extension fixture checks, native host pairing checks, and regressions for History/Shelf/pop-out and existing Chute Store drag transport. Include controlled Windows installed-pair smoke tests and screenshot geometry tests for minimum Shelf width/pop-out 390 px and all grid densities 4×4, 5×4, 5×5, 6×5. Confirm no overlapping cards, no double-opening pop-out/Shelf, and no unintended folder chooser at startup.

Test matrix must distinguish `PYTHON_ENGINE`, `WINDOWS_NATIVE`, `CHROME_FIXTURE`, `INSTALLED_CHROME`, `LIVE_SITE`, `REDOWN_FIXTURE`, `REDOWN_LIVE_PROVIDER` with per-direction PASS/FAIL/BLOCKED/NOT_TESTED and evidence/receipts. No sensitive paths/tokens in checked-in traces. Include source/destination hashes, exact operation status, and a minimal redacted diagnostic ledger.

**Safety / time:** do not access or mutate real user files in automation; no large files, endurance tests, real site/cloud uploads or provider credentials without explicit owner approval. Security reviews required before enabling native write and cross-extension trust. Don't weaken CSP, bypass native-host enrollment, or claim successful native/installed tests from Linux mocks. Prefer small verified milestones over massive speculative rewrites.

## 6. Codex execution order and deliverables

1. Inspect HEAD / open PRs, baseline file audit, run quick tests; produce root cause findings for repeated picker and slow popup.
2. Deliver **Milestone A first** on a usable matched Windows EXE + Chrome unpacked extension test pair: persistent authorization, last folder restore, fast picker and UI ready states. Provide paired artifact links, hashes, rollback and install instructions.
3. Deliver **B1** real local-source drag with source-kind isolation and site fixtures; ship/test without waiting for B2 permissions.
4. Deliver **B2/B3** scoped native writable destination and verified local transfers. Proof must include exact-folder local bytes and independent checks; no in-progress claims presented as completion.
5. In parallel establish **C** shared REDOWN protocol fixtures and adapter API. Enable verified cross-extension communication only after enrolled participant handshake; stage separate REDOWN integration PR as appropriate.
6. Run regression/security suite; publish a PR with clear accepted/blocked matrix and screenshots/receipts. **Do not merge, deploy, or change the owner's installed production pair without authorization.**

### Exit criteria (no substitutes)

- Approved Explorer automatically opens last browsed folder after companion restart, with no picker; new folder still requires consent.
- Existing CHUTE Live drag pipeline still works, and actual local Explorer file bytes traverse its shared transport.
- User-approved drops go to the exact local folder and are independently hash-verified.
- REDOWN compatibility protocol has tested, secure bidirectional fixture adapters, with live status accurately marked (not falsely “integrated”).
- Shelf/pop-out lightbox, card interactions, UI geometry and History have no regression.
- Testable source changes, versioned protocol, paired Windows/Chrome artifacts, PR and explicit evidence receipt.

---

## LIGHTWEIGHT CODEX STARTER

> In `thanks-cohn/chute`, read `In_Progress/CODEX_P0_PERSISTENT_PERMISSIONED_EXPLORER_DRAG_DROP_REDOWNS_BRIDGE_2026-11-04.md` and **IMPLEMENT** it. First make previously approved Windows folders persist safely across companion restart and reopen instantly at the last browsed directory without picker. Then connect actual local Explorer file drag/drop to CHUTE's existing Live basket and Google/Yandex/ChatGPT transport using original bytes and distinct opaque source capabilities. Implement explicitly authorized, verified writes into selected local folders with Python engine and KEEP BOTH default. Begin CHUTE ↔ REDOWN secure bidirectional protocol adapters using the existing disabled TransferIntent contract; test locally with real byte fixtures, never claim live cloud transfer from mocks. Preserve Shelf/pop-out fixes, existing worker, security and History. Use small disposable tests, produce matched Windows/Chrome test artifacts, evidence and reviewable PR. Do not merge, deploy, use real user files or cloud credentials without consent.
