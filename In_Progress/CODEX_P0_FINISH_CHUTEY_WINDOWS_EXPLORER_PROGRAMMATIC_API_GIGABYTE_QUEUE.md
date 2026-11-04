# CODEX P0 — FINISH THE REAL CHUTEY WINDOWS FILE EXPLORER
## Programmatic-first Python engine · gigabyte-scale operations · durable queue · whole-directory clipboard · browser/local access

**Repository:** `thanks-cohn/chute`  
**Working branch:** `codex/chutey-explorer-windows-usable-asap-2026-11-04` (already branched from the latest `main` checkpoint; inspect HEAD before coding)  
**Priority:** P0 — **make the Explorer usable on Windows as soon as safely possible, so debugging starts against the real product.**  
**Owner's principle:** “Set a new standard for programmatic access through browser and local. Drag/drop may hit platform limits, but everything the systems legitimately expose programmatically must be accessible.”  
**Status:** Implementation request, **not** an implemented feature or proof of Windows acceptance. Do not merge/deploy/install production releases without approval.

## 0. WHAT WAS NOT FINISHED — DO NOT REPEAT THE LAST RUN

The previous implementation, starting at `3fd27da9731b0ac71c0b639c43cc5de0973383aa`, added real POSIX **read-only** Explorer internals and a Shelf view. But `src/chute/explorer/security.py` explicitly rejects Windows root grants; `src/chute/explorer/protocol.py` explicitly blocks `mkdir`, `rename`, `copy`, `move`, `trash`, `receive`, `open`, and `reveal`; native pairing for approved Windows folders has not been built; and REDOWN/cloud handoff is only a disabled contract.

**That is not the Windows File Explorer the owner wants.** Read-only fixtures and screenshots are valuable tests, not a finished product. The owner wants the working Windows build first, then rapid feedback-driven repairs. Keep working rather than presenting the old read-only state as completed.

One browser CI issue also requires a focused fix: `scripts/verify-explorer-browser.py` uses string-based `page.wait_for_function`, which fails under extension CSP `script-src 'self'` because it invokes eval. Replace string evaluation with Playwright locator and image-property assertions or other policy-compliant checks; **never enable `unsafe-eval`** or weaken extension CSP to make CI green. The browser test does not itself prove that production preview rendering is defective.

## 1. READ ACTUAL SOURCE AND PRESERVE WHAT ALREADY WORKS

Read first:
- `worker/README.md`: identifies the **one** current Chrome MV3 worker at `extension/background-entry.js`, existing native messaging/wakeup and existing Python companion in `src/chute/`. The `worker/` directory is an index, **not a missing binary or a reason to duplicate code**.
- `In_Progress/CODEX_DRAG_DROP_LOCAL_EXPLORER_IMPLEMENTATION.md`: full user requirements, bottom-overlay previews, custom right-click, cross-browser drag, real Python engine.
- `In_Progress/LOCAL_EXPLORER_AND_IMAGE_TRANSFORMS_API.md`, `In_Progress/REDOWN_CHUTEY_BIDIRECTIONAL_INTEROP.md`.
- `docs/explorer/README.md`, `docs/explorer/PR_BODY.md`, `docs/explorer/INTEROP.md`: original audit, limitations and evidence.
- `src/chute/explorer/{core,security,protocol,api,interop,preview}.py`; `src/chute/{server,store,native_host,windows_app,reveal}.py`.
- `extension/{shelf,explorer-view,explorer-api,workspace-tabs,background-entry,background-native,drag-relay,content,bin}.js`, HTML, CSS and packaging.
- `tools/explorer_lab/chutey_explorer_lab.py`, existing checks/CI and tests.
- REDOWN `IMPORTANT/UNIVERSAL_AGENTIC_TEST_CORPUS_AND_PIPELINE.md`: independently verified, **iteratively self-correcting** testing.

Preserve the known-working tag `chute-v2.6.1-main-upgrades-2026-11-03-working` as rollback checkpoint. **No new Chrome service worker, local daemon, duplicate native host, replacement History database, duplicate JS filesystem engine or uploaded opaque EXE in the repo.** The current extension/companion and existing wake/reconnect logic are production owners. Add focused modules/adapters within them.

## 2. PROGRAMMATIC ACCESS IS THE PRODUCT CONTRACT, NOT A DEVELOPER BONUS

Build an importable, versioned, documented **single Python File Explorer engine** whose behavior is the source of truth for all supported file operations. It must be fully scriptable *without a browser GUI* on authorized fixture roots. The GUI, context menu, drag/drop, OS clipboard adapters and CLI call the **same** operation dispatcher.

Provide and independently test the actual supported equivalents of:
- `capabilities`, `listRoots`, `listDir`, `stat`, `search`, `getMetadata`, `preview`, `readStream`, `open`, `reveal`.
- `mkdir`, `rename`, `copy`, `move`, `trash`, `receiveStream`, `verify`, `reconcile`; safe multi-item/bulk and recursive-directory variants.
- `copySelection`, `cutSelection`, `paste`, `getClipboardCapabilities`; distinguish Chutey internal clipboard from OS clipboard. Do not declare paste successful before a real object exists with the intended bytes.
- `enqueue`, `getJob`, `listJobs`, `pause`, `resume`, `cancel`, `retrySafe`, `getProgress`; and a machine-readable operation/fault/receipt log.
- `describeCapabilities`, `describeLimitations`, `getPerformanceMetrics`, `explainFailure` and a versioned input/output/error schema.

These names are suggested design contracts **not currently implemented endpoints**. Publish exactly what exists as each phase lands; no phantom methods or optimistic capabilities.

**Programmatic does not mean unprivileged.** Python can operate on roots explicitly approved by the local user/OS; the extension must use verified extension identity, native consent and least-privilege time-limited grants. File APIs may never grant a webpage arbitrary path access. If Chrome or a site blocks a drag/drop path, return an honest `UNSUPPORTED` or `NEEDS_USER_GESTURE` reason and continue supporting every permitted programmatic workflow: OS/native clipboard, file selection, Chutey→Chutey, bound content-script transfer, and explicit authorized local/cloud adapter.

## 3. THE FIRST USABLE WINDOWS BUILD IS P0-A

**The very first deliverable should be a paired Windows companion and Chrome build that lets the owner use Chutey as a local file browser.** Do not wait for every advanced bulk feature, all 1,000 generated tests or cloud interop before exposing a safe, real, functional vertical slice.

1. Implement **Windows-safe root enrollment** through the existing trusted Windows companion/native flow and exact extension identity. The user deliberately selects approved directories via native UI. Record scoped, revocable grants and expiration. Do not require manually pasting a POSIX session token into the Windows Shelf.
2. Implement actual Windows filesystem handles/identity and robust junction, symlink, reparse, UNC, reserved-name, TOCTOU and unapproved-path protections. Use native Win32 APIs/handles where necessary; don't port POSIX `O_NOFOLLOW` assumptions or rely solely on `Path.resolve()`.
3. Show one or more authorized roots in the existing Shelf Explorer tab; list folders/files, navigate parent/back/forward, search/sort, switch list/grid, open real image/text/other supported previews with a **bottom overlay that does not shrink the Explorer**, show correct failure states.
4. Provide real **Open** and **Reveal** for permitted files with safe, scoped Windows integration. For a permitted Chutey History item, prefer opening/selecting it **inside the Chutey Shelf** when the Shelf exists, with explicit external Windows Explorer fallback/choice. Do not silently launch File Explorer when the Chutey internal target is usable.
5. Build the paired Windows binary and Chrome extension as **review/test artifacts**, with clear install/use instructions and environment/version identification. Never silently replace the working public release. Test with the installed product, not only a localhost fixture.

**P0-A pass example:** owner selects an actual permitted folder in Chutey on Windows, sees its real subfolders and files, opens an image in Shelf preview, opens a nested folder, returns, sees correct breadcrumbs, can open/reveal the right target, and restarts/reconnects without losing permission boundaries. A product pretending an unavailable root is empty is a FAIL.

## 4. REAL MUTATIONS AND CLIPBOARD ARE P0-B — INCLUDING WHOLE FOLDERS

Once Windows-scoped permissions are proven, implement real operations within those permissions in the same Python dispatcher. **Don't create UI controls that are enabled while the backend returns only `NATIVE_CONSENT_REQUIRED`.**

- **Copy/Cut/Paste in Chutey** via custom right-click menu and Ctrl+C/Ctrl+X/Ctrl+V; multi-select files and **entire recursive folder trees** (children included), including large directories, empty subdirectories and deep nesting.
- **Paste from Windows Explorer into Chutey** when supported by a trusted OS clipboard/native bridge (e.g. inspected/validated Windows shell file-list formats). Chutey can accept a trusted *list of selected paths* only after verifying user intent and destination permission. A Chrome webpage does **not** gain authority just because a clipboard entry contains a path.
- **Copy from Chutey into Windows Explorer** using OS-recognized clipboard formats when supported and safely controlled by the existing companion. Provide clear fallback for source streams/folders that Windows shell cannot represent.
- **Paste into files/folders appropriately:** a file-system Paste targets a selected authorized destination directory, not arbitrary byte insertion into unknown file formats. For text/image content insertion into a supported document editor, that is a separate typed clipboard action with declared capability; do not conflate the two.
- **Cut/move:** preserve source until destination is fully verified and operation committed; same-volume atomic rename may be eligible; cross-volume move is verified copy+safe delete. Cancellation/interruption must not delete originals or leave successful-looking partial output.
- **Conflict handling:** KEEP BOTH default for intake/copy, with SKIP and explicitly confirmed REPLACE where safe. Directory-to-existing-directory collision semantics must be explicit; never quietly overwrite a whole tree.
- **Directory safety:** reject self-copy loops (parent into descendant), path traversal, symlink/junction escapes, filesystem cycles and unsupported device paths; prevent recursive infinite loops. Do not blindly follow symlinks.
- **Clipboard lifetime:** explain what is copied (file references vs text/bytes), expiration, stale/deleted originals, permissions and cross-process behavior. Never upload private file bytes to a provider or remote page just because the user copied a name.

Other features: safe mkdir, rename, remove-to-trash, local drag source→destination, local↔browser transfers where browser trust permits, and Explorer-scoped right-click + keyboard parity. Make the operations **real**, with precise receipt IDs and IDs of actual resulting objects.

## 5. GIGABYTE MOVEMENT AND DURABLE QUEUE ARE CORE REQUIREMENTS

Do not implement multi-gigabyte operations by loading entire files into Python or the browser. Use **bounded chunked streaming with backpressure**, direct local filesystem operations where safe, cancellable transactional staging, incremental SHA-256, atomic publication/reconciliation when available, and independent destination verification. Memory must be bounded independently of file size.

- **Large files:** exercise 1 GiB, multi-GiB and large nested-directory totals on disposable filesystems, respecting actual available disk/test budgets. Sparse files can validate offsets/state handling but are **not** a substitute for physically transferring bytes when measuring throughput. No unsupported “unlimited file size” marketing claim.
- **Fast path:** same-volume atomic moves where safe; efficient streaming and concurrency for cross-volume copies; avoid redundant buffer conversions, per-chunk UI updates and expensive diagnostics on hot paths. Rate-limit progress reports, not necessary fault observations.
- **Queued work:** when a permitted operation cannot start immediately because of concurrency, resource pressure, disk arbitration or rate limits, **enqueue it** with a durable unique job/operation ID, creation time, target, authorization state, deterministic conflict policy and discoverable progress. Do not reject valid work merely because workers are occupied.
- **Honest admission:** queueing is not a license to accept an unbounded amount of jobs; use explicit finite capacity, disk space and quotas, with `QUEUE_FULL`/resource failure when a job cannot be safely admitted, not silently discarded or claimed accepted.
- **Job state machine:** `ACCEPTED → QUEUED → RUNNING → VERIFYING → COMMITTED` or `FAILED / CANCELLED / BLOCKED / UNCERTAIN`. Track bytes planned, bytes attempted, independently verified bytes, retries, time, throughput and reason codes. UI success only at verified COMMITTED.
- **Crash/restart recovery:** persist jobs atomically (versioned SQLite/WAL or equivalently robust journal) and reconcile staged partial operations on restart. Never automatically replay an uncertain destructive write; mark UNCERTAIN and ask for an explicit safe decision.
- **Scope expiration:** when root permission is revoked/expires, pause/block pending jobs without bypassing authorization. Recovery must renew consent rather than reuse forbidden handles.
- **Bulk/folder transfer:** enqueue a folder as one top-level intent with individually tracked child objects/errors, truthful partial-state reporting and bounded traversal; support resumable non-destructive work only where proven safe.
- **No cloud upload assumption:** local multi-GiB capacity is separate from provider quotas, browser process size limits, native messaging message size and site drag acceptance. Stream through appropriate authorized native routes.

## 6. THE PYTHON LAB IS AN ENGINEERING INSTRUMENT

The owner expects a best-in-class, **fully programmatically testable** engine that future agents can admire, understand, reproduce and extend. Build on `tools/explorer_lab/chutey_explorer_lab.py`, not a second simulated file engine.

Provide a scriptable scenario API/CLI and deterministic corpus:
- `doctor`, `capabilities`, `inventory`, `preflight`, `generate`, `run`, `replay`, `snapshot`, `diff`, `bench`, `report`, `coverage`, `cleanup` (exact names may vary, but publish them).
- Generate realistic disposable trees: zero-byte files, 1 GiB+ streams, mixed-size trees, deep nesting, name collisions, Unicode, long paths, locked handles, corrupted streams, junction/reparse escapes, full disk, access revocation, timeouts, concurrency, restarting the worker/companion mid-transfer and delayed queues.
- **Independent oracle:** expected folder tree and bytes/hash are sourced from the input fixture/contract and an independent filesystem inventory, never accepted merely because the implementation says `completed`. Deliberately mutate destination bytes/paths and confirm tests fail.
- Run original/fixed seed, neighboring state/transition cases and full regression suite after each defect. Record origin fault, affected modules, negative expected effects, correction commit, verified fix and permanent regression case.
- Distinguish finite-model exhaustive coverage from unbounded real-world input; publish actual contract, branch, transition and failure-boundary denominators, not only a number of green cases.
- **Performance lab:** measure throughput MiB/s and GiB/h, per-op latency p50/p95/p99, queue wait, dispatch, first-byte and completion times, sustained large-file/copy-tree speed, peak RSS/heap, CPU, I/O, open handles, disk pressure, worst-case restart and crash recovery; compare direct API against GUI adapter overhead. Record OS, filesystem/volume type, device, power state and cache/warm/cold distinctions. Separate sparse, cached and physically written tests.
- Collect metrics for 1 KB, 1 MB, 100 MB, 1 GiB and larger approved sizes, plus 1, 10, 1,000 and 10,000-file trees where resources allow. No fake “max supported” inference from one successful run.
- Run Windows local **actual API** tests in CI and installed-companion/extension E2E; retain Linux POSIX tests independently. A POSIX read-only green is not a Windows write proof.
- Publish per-test `PASS / FAIL / BLOCKED / UNKNOWN / UNSUPPORTED`, evidence class `PYTHON / WINDOWS_REAL_FS / INSTALLED_CHROME / LIVE_SITE / REDOWN_LIVE_PROVIDER`, environment, source hashes, seeds, reproducible commands, before/after snapshots, hashes and benchmarks.
- Explicitly test the no-progress and finite-resource behavior of the queue; ensure hanging operations cannot starve interactive browsing.

The self-correcting pipeline can run repeated **local, authorized fixture** repair/test cycles on a development branch; agents never edit production data, weaken expected oracles, merge or deploy autonomously.

## 7. BROWSER AND LOCAL — MAKE EVERYTHING LEGITIMATELY ACCESSIBLE

The long-term principle is **no arbitrary UI-only functionality**: if the OS, native API, extension or approved browser host grants a capability, expose it through a stable authorized programmatic operation that the GUI can call.

- Browser may limit synthetic drag/drop trust, native OS clipboard access, file-input control, folder-drop handling, cross-origin frames, focus and extension privileges. Do not circumvent these protections or claim universal web uploader success.
- Provide alternatives through explicit user gestures and scoped native/extension routes; `DataTransferItem.webkitGetAsEntry`/File System Access APIs may be used only where supported and legitimately user-granted. If a site refuses a programmatic drop, expose its limitation and help the user complete permitted native actions.
- Stage real bytes and original directory structure; never treat a `.url` shortcut or source URL as an image file.
- Preserve Chutey↔REDOWN interoperability planning, but independently verify safe cloud/local transfer with exact identity, bytes and destination. The disabled transfer-intent type is **not** an implemented transfer.
- Do not publish arbitrary local filesystem RPC, token, debug server or consent bypass to websites.

## 8. SHELF UX AND OPEN-INSIDE-CHUTEY RULE

Preserve premium compact Explorer styling and the existing History tab. The Shelf is Chutey's **native home for file work**: if the Shelf is already open and the user clicks **Open** in the small extension popup, open/select/preview that exact file **inside the Shelf** (use existing side-panel integration and actual file ID), rather than automatically forcing Windows Explorer. If the Shelf is closed, open it with selected item if permitted; offer explicit Windows Explorer action where supported. Test focus and multiple-window routing, file missing/archived state, and OS fallback. Do not silently reinterpret unsupported file types or route the wrong object.

A separate `Ideas/CHUTEY_POPUP_SQUARE_GALLERY_EXPANDED_PREVIEW_AND_COMEDY_YEARBOOK_2026-11-04.md` contains **deferred** square-gallery expanded navigation, goofy yearbook illustrations, pixelated Chutey antics and painting-escape easter eggs. **DO NOT IMPLEMENT THOSE IN THIS P0.**

## 9. EXECUTION ORDER: MAKE IT RUN, THEN IMPROVE IT — NOT ANOTHER DOCUMENTATION STOP

**P0-A — usable Windows browser ASAP:** repair CSP-unsafe CI test, implement safe native root selection + Windows filesystem handles, show actual Windows files/folders, navigation/search/preview/Open within Chutey and reliable paired Windows EXE+Chrome test artifact. Get this approved local test build into the owner's hands for interactive debugging.

**P0-B — real file operations:** implement secure verified mkdir/rename/copy/move/trash, clipboard Copy/Cut/Paste **including whole directories**, local folder intake and cross-volume operation semantics. Test actual Windows outcomes with independent bytes/hashes.

**P0-C — multi-GB and durable queue:** streaming jobs, bounded concurrency, durable journal, retry/recovery/cancellation, performance evidence. Do not call earlier MVP complete if bulk directory work and queue are only mocked.

**P0-D — browser/local drag interoperability:** prove user-gesture-supported routes against actual installed Chrome and representative sites; explicit unsupported list; REDOWN cloud transfers only after separately authorized real verification.

For every phase, commit code and real tests, produce reproducible reports, Windows + extension downloadable test-build artifacts and accurate pass/fail/blocked matrix. **Do not stop after a documentation report unless the blocking technical issue is truly irreducible within current permissions/environment; keep progressing on independent safe work.** If something is legitimately blocked, state the exact barrier, minimal next repair, and how the owner can run the partial product now.

**Do not merge or deploy to main without explicit approval.** No fake successful saves, no permanent credential or unrestricted-root storage, no rewriting old Chutey/Windows/Chrome boot code without source-backed proof.

## 10. DEFINITION OF THE FINISHED PRODUCT

A user can select an authorized Windows folder, see it in Chutey's real Shelf Explorer, browse and edit it like a familiar premium file manager, copy/cut/paste entire folders through keyboard/right-click and approved clipboard, drag/send files through supported browser routes, queue multiple GiB operations without freezing UI, inspect real progress, close/reopen/restart and reconcile safely, and receive a verified final destination/hash receipt. **The exact same semantics are callable and benchmarkable through Python with no GUI**.

A new authorized agent can discover the operations, generate deterministic fixtures and adverse edge cases, measure true latency/throughput/limits, detect wrong bytes, minimize a failure, fix owning code, and rerun complete regressions. The product should aspire to a new benchmark for secure, fast, readable and teachable **browser + local programmatic file infrastructure**—with proof, not marketing claims.

### Lightweight starter for Codex

> In `thanks-cohn/chute`, on `codex/chutey-explorer-windows-usable-asap-2026-11-04`, read and execute `In_Progress/CODEX_P0_FINISH_CHUTEY_WINDOWS_EXPLORER_PROGRAMMATIC_API_GIGABYTE_QUEUE.md`. Finish the **Windows** Python Explorer using existing Chutey worker/companion, repair CSP-unsafe CI, deliver a paired working Windows+Chrome test build early, then true directory clipboard copy/paste, multi-GiB streaming+durable queue and reproducible Python latency/limit lab. Every supported UI action must call the same programmatic API. Preserve old working functionality, block unsafe capabilities honestly, do not modify deferred gallery/mascot ideas, and do not auto-merge/deploy. Commit code/tests and publish precise verified versus blocked evidence.
