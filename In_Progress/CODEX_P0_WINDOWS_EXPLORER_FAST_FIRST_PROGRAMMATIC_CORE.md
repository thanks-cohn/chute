# CODEX P0 — Make Chutey's Windows File Explorer usable NOW
## Fast-first delivery, excellent programmatic Python foundation, lightweight verification

**Repository:** `thanks-cohn/chute`  
**Implementation branch:** `codex/chutey-explorer-windows-usable-asap-2026-11-04`  
**Owner priority:** A real Windows File Explorer that the owner can install and debug immediately. **Working functionality before ambitious scale or exhaustive stress campaigns.**  
**Stage:** Implementation request. This document does not mean the code is completed.  
**Rollback:** `checkpoint/chutey-explorer-before-p0-2026-11-04` is a separately pinned pre-implementation checkpoint; do not move the tag or overwrite existing released binaries.

## 0. THE OWNER'S CLARIFICATION — THIS SUPERSEDES THE EARLIER BROAD P0 BRIEF

The owner wants the API to be robust, fast, highly programmable and ultimately suitable as a reference implementation of browser/local file operations. **But the immediate deliverable is a usable File Explorer**.

**Do not interpret scale requirements as an instruction to move enormous files, create large data fixtures, stress disks, upload to cloud providers, or perform expensive benchmarking now.** None of that is necessary for the first working product. Architect correct streaming, backpressure and queue semantics; **test with tiny disposable files, controlled streams and injected failures**. Full-scale physical transfer testing belongs to a later owner-approved performance milestone.

**Hard rule for this run:** NO cloud uploads, NO downloads of large media or repositories for test data, NO disk-filling or endurance tests, NO automatic stress generation, NO provider credentials, NO touching real user files. Never use test-generated data outside uniquely owned disposable roots. Any heavier real test requires a separate explicit owner approval and a declared safety/resource budget.

Ship progressively. The owner should be able to test the Windows Explorer in a paired Chrome extension + Windows companion build **before** the complete future queue/interop/500-scenario framework is implemented.

## 1. WHAT WAS ACTUALLY INSPECTED — START FROM THE WORKING CODE

The last implementation checkpoint, `3fd27da9731b0ac71c0b639c43cc5de0973383aa`, already has real code; reuse it.

| Existing source | Current behavior / blocker | Required correction |
|---|---|---|
| `extension/background-entry.js` plus `background-native.js`, `native-wake-page.js` | One existing Chrome MV3 service worker, native wake/reconnect, messaging, and Shelf integration. | KEEP the worker. Do not create or rewrite it without demonstrated root-cause need. |
| `src/chute/server.py`, `windows_app.py`, `native_host.py`, `store.py`, `reveal.py` | The existing Windows companion, local HTTP bridge, History and Windows reveal code already exist. | Extend only necessary paths, preserving installed pairing, reconnect, History and known-good drag behavior. |
| `src/chute/explorer/{core,api,protocol,security,preview}.py` | Importable read-only Python core. `security.py` refuses Windows roots; `protocol.py` blocks file mutations. | Implement safe Windows root grants and incrementally enable verified operations in this SAME engine. |
| `extension/explorer-api.js` and `explorer-view.js` | Shelf uses current Python transport but demands manual read-session token, and rejects drops. | Replace Windows developer-token workflow with a trusted native folder selection/permission flow; preserve thin view/controller. |
| `tools/explorer_lab/chutey_explorer_lab.py` and `tests/test_explorer*.py` | Real source-owned test API and small deterministic fixtures already exist. | Grow progressively; use real filesystem effects and independent expected outputs. |
| `src/chute/explorer/interop.py` | REDOWN handoff schema exists, but actual transfer is disabled. | Preserve typed contract, defer actual cloud integration. |
| `scripts/verify-explorer-browser.py` | Previous CI failed because string `page.wait_for_function` violates Chrome extension CSP: `script-src 'self'`. | Use Playwright locator-based polling / compliant attribute-property assertions. NEVER enable `unsafe-eval`. |

Read and honor `worker/README.md`, `In_Progress/CODEX_DRAG_DROP_LOCAL_EXPLORER_IMPLEMENTATION.md`, `In_Progress/LOCAL_EXPLORER_AND_IMAGE_TRANSFORMS_API.md`, and `docs/explorer/README.md`. They describe the full eventual product. **This fast-first document overrides their schedule and testing intensity where they would delay a usable Windows build.**

## 2. P0-A — THE FIRST INSTALLED WINDOWS EXPLORER BUILD

**First goal:** an owner-approved folder opens inside Chutey's existing File Explorer Shelf tab, with visible real files and working navigation/preview. Produce the paired test build immediately after that is secure and demonstrably functional, rather than postponing artifacts until every future API is written.

1. Add **trusted native folder picker/selection**, using existing Windows companion/native integration and binding authorization to the enrolled extension ID, user gesture and specific permitted root(s). No arbitrary webpage path authorization, no unprotected write APIs, no permanent globally scoped token.
2. Implement **safe Windows filesystem access** for directory roots, real handles and identity checks. Enforce reparse/junction/symlink and path-traversal protections, explicit permission scope, reserved names, sensitive path restrictions, concurrent-change checks, and fail-closed behavior. Do not copy POSIX no-follow logic without a verified Windows equivalent.
3. Through the existing `Explorer.execute` dispatcher, return trustworthy `capabilities`, `roots`, `list`, `stat`, `search`, `preview` and paginated navigation. A blocked/unavailable folder must **never** appear as empty or successfully opened.
4. In the existing Shelf, build intuitive compact navigation, parent/back/forward, directory tree, breadcrumbs, sortable list/grid, real thumbnail and preview, keyboard access, and context menu. Preview must **overlay the bottom** without squeezing or scrolling away the original file list.
5. Give users a visible, natural **Select folder / Allow** path. Do not demand a manually pasted developer token in the normal Windows experience. Safe authorization errors should be clear and recoverable.
6. Preserve the original Chutey History, drag basket, pixel mascot, tabs, existing Windows installer/worker, and browser action behavior. Neither the planned popup gallery nor the mascot easter eggs is part of this task.
7. Provide a **paired, downloadable review artifact** (Windows companion + compatible Chrome extension), exact setup instructions, build SHAs and rollback notes. Do not replace the published release or merge to `main` without approval.

**P0-A pass:** The owner installs the paired test build on Windows, selects a disposable directory, sees genuine subfolders/files, navigates into/out of them, previews a genuine saved image, closes/reopens Shelf and can reconnect without losing file integrity or unauthorized permission elevation.

**Do not finish this phase by returning another documentation-only read-only POSIX report.** If Windows executable/build environment is blocked, still complete independently possible real code and CI, provide the exact blocker and working test artifacts when attainable.

## P1 UI correction, November 4 — Preview browsing never collapses

Owner's new instruction **overrides** earlier preview height wording. See [the scoped implementation report](../bugs/CHUTEY_EXPLORER_HALF_HEIGHT_BROWSING_EXPANDING_PREVIEW_AND_ARROW_GALLERY_2026-11-04.md).

When the preview opens, the **allocated** tree/file browsing workspace changes to roughly the upper half of the available Explorer content height, retaining independent scrolling. The bottom viewer can be resized upward as far as immediately below protected top calendar/navigation controls; beyond the half split it **overlays** the Explorer, never compressing its allocated browsing workspace below 50%. Close preview to restore full browsing height and scroll. Provide clickable and keyboard Left/Right image navigation in current sort/filter order, including pagination. Update the old `before == after` height test to reflect this new requirement. Fix within current Shelf JS/CSS, preserving Python/native behavior.

## 3. P0-B — MAKE IT A GENUINE FILE EXPLORER

After the first Windows-browse milestone is available for owner debugging, implement operations in the same production Python API and wire their actual results to UI affordances:

- New Folder; Rename; Copy; Cut; Paste; Move; Trash; safe Open and Reveal; multi-select; undo/reconciliation where actually supported.
- **Whole directory copy/cut/paste**, including subfolders and empty directories, across *authorized* source and destination roots. Reject self-copy into descendants and loops, never traverse junctions outside grants.
- Native Windows clipboard integration for real OS shell file/folder selections, if permitted and verified. Chutey internal clipboard and OS clipboard must be separate typed capabilities. Ctrl+C/X/V and right-click menu Paste must drive the same command operations as Python.
- Default KEEP BOTH for copy/intake conflicts; SKIP and explicitly consented REPLACE only where safely implemented. Never silently overwrite.
- Local drag-in/out and folder targets progressively, respecting browser trust limits; don't create fake shortcuts or treat a synthetic drag as verified file acceptance.
- Show operation status and independent file/folder result, not an animation/timer-derived success.

**P0-B pass:** In a disposable Windows root, a full folder tree copied and pasted inside Chutey actually appears with the expected names and original contents. Independent Python inventory verifies results. Cancel, invalid source, missing destination, duplicate name and denied permission produce accurate non-success statuses.

## 4. EXCELLENT API FOUNDATION — WITHOUT HEAVY DATA MOVEMENT

**Every supported user-facing file action must have a fully programmatically accessible equivalent in the single Python production engine.** An agent or Python CLI must be able to exercise the identical semantics without a GUI.

Core design, even when initially only partially implemented:
- Versioned schemas with typed request and receipt objects, operation identifiers, exact source/destination identity, error codes and discoverable capability states (`implemented`, `gated`, `unsupported`, `not_tested`).
- A single authoritative dispatcher for UI, CLI, context menu, clipboard, tests and later extensions. No second JavaScript filesystem engine.
- Stream-based operations with **bounded memory and backpressure independent of file length**. Avoid `read()` of entire arbitrary files, giant in-memory blobs or one-message native-transfer designs. Default buffer and concurrency budgets must be explicit and measured with **small** fixtures.
- A job/queue abstraction: `ACCEPTED`, `QUEUED`, `RUNNING`, `VERIFYING`, `COMMITTED`, `FAILED`, `CANCELLED`, `UNCERTAIN`. The first implementation may have limited concurrency, but the interface must allow durable scheduling and safe restart reconciliation later without breaking clients.
- **No unbounded job admission:** finite queue capacity, backpressure, known quotas, cancellation and explicit `QUEUE_FULL` or blocked status when admission is unsafe.
- For local file movement, correct source preservation, conflict handling, staged writes, verified bytes/hash and atomic final publication when supported. No automatic replay of uncertain destructive writes.
- Clear trust boundaries: only native-approved roots, verified extension pairing, expiry/revocation, authenticated loopback requests, no arbitrary page-controlled absolute paths.
- Module boundaries designed for later **special abilities** (safe Git/archive imports, authorized local-video imports, transformations, cloud handoffs) without implementing them now. New abilities use the same authorized operation, queue and receipt contracts.

**Do not optimize prematurely or rewrite the working runtime for theoretical speed.** Keep performance hooks and instrumentation cheap; improve based on reproducible measurements.

## 5. PYTHON GOLDEN-SCENARIO CAPABILITY: DESIGN NOW, GROW LATER

The owner eventually wants a **500+ independently specified, executable scenario corpus against the actual engine**, inspired by REDOWN and Click2Cloud. **Do not try to manufacture hundreds of tests before the owner has a usable Explorer.**

Build the foundation now:
- A versioned scenario format with stable IDs, initial authorized fixture state, command sequence, expected outcome and forbidden side effects.
- Python runner invokes the real `Explorer` code, not a mock replacement; inject only filesystem, time, resource and failure boundaries where appropriate.
- Independently verify source/destination bytes, names, directory-tree structure and relevant operation journals. A response saying `COMMITTED` is insufficient.
- Add a compact meaningful initial suite covering safe Windows root selection, navigation, preview, small copy/paste of whole trees, conflict policies, permission failure, cancellation, queued/blocked admission, crash recovery metadata, and memory limits.
- Use tiny generated file contents, empty nested directories, controlled streams, synthetic logical lengths and deterministic fault injection. **Do not create physically huge files or move real user data to achieve coverage.**
- Record `PASS / FAIL / BLOCKED / UNKNOWN / NOT_TESTED` by proof class (`PYTHON_LOGICAL`, `WINDOWS_REAL_FS`, `INSTALLED_CHROME`, `LIVE_SITE`, `PROVIDER`). Preserve independent failures and seeds as permanent regressions.
- Later expand toward a justified 500-case atlas with meaningful state/transition, boundary and interaction coverage; avoid padded case counts. Prioritize self-correcting reproduce → diagnose → patch → reverify loops in a development branch.

**Default automated-test resource policy:** use small disposable fixture roots only, with **32 MiB total fixture-data budget per job** unless explicitly approved otherwise; explicit timeouts and finite concurrency; no external downloads or provider uploads. Write all reports without exposing private paths, tokens or file contents. A later high-volume benchmark requires the owner's separate, affirmative approval and an explicit run budget.

**Performance profiling at this stage:** measure operation latency p50/p95/p99, queue admission/wait, initial response, simulated stream backpressure, cancellation, small-file throughput and memory growth. Label these results **development-fixture measurements**, never evidence of high-volume sustained performance.

## 6. CHROME REALITY — PROGRAMMABILITY DOES NOT OVERRIDE SECURITY

Browser extensions cannot force every website to accept synthetic drops, access file picker results without a valid gesture, or read arbitrary Windows folders. Support every *legitimately exposed* operation programmatically through granted native/extension capabilities; return truthful `UNSUPPORTED`/`NEEDS_USER_GESTURE` when a platform boundary prevents it.

Existing Chutey↔REDOWN interoperability `In_Progress/REDOWN_CHUTEY_BIDIRECTIONAL_INTEROP.md` is a **later integration**, not a requirement to block the Windows Explorer milestone. Do not use real provider secrets or upload anything to prove local Explorer functionality.

For the small popup's **Open** action, prefer opening/selecting the item inside an available Chutey Shelf in a later UI phase, with an explicit external-file-manager alternative. The earlier user request to preserve the cute gallery/mascot/painting-escape ideas is **documentation only**; do not implement these here.

## 7. REPAIR CI AND REPORT REAL VERIFICATION

Fix the failed Chrome test without weakening CSP. On Windows and Linux CI, run existing tests and real-source code/fixture checks, clearly flagging unsupported platform combinations rather than pretending a POSIX test proves Windows behavior.

Publish a concise receipt for each milestone:
- `A: Windows owner-approved browse + preview`
- `B: Windows file operations + real folder clipboard copy/paste`
- `C: bounded streaming/queue and safe recovery foundation`
- `D: Python scriptable golden test runner and initial fixtures`
- `E: browser/local and later REDOWN handoffs`

For each: implementation commits, command used, results, exact runtime/OS, tested operation, expected/actual bytes and state where applicable, known failures, and `PASS/BLOCKED/NOT_TESTED`. Installed Chrome, real Windows clipboard, physical high-volume sustained transfers, and live provider evidence are **separate acceptance classes**.

**Crucial:** A is the first user-facing deliverable. Do not delay A to complete B–E. Do not present an early A checkpoint as the *entire* Explorer being done.

## 8. EXECUTION INSTRUCTIONS FOR CODEX

1. Check the current branch, pinned checkpoint and actual code. Read the cited source and run existing cheap tests.
2. Patch the extension-CSP test; avoid `unsafe-eval`. Audit and implement native Windows authorization + safe root handle access.
3. Make existing Chutey Shelf browse real Windows files, render thumbnails/overlays and provide a natural permissions workflow.
4. **Build and publish paired Windows companion + Chrome extension review/test artifacts as soon as A is verified.** Give the owner exact download/install/test steps, SHA/version and rollback path. Do not wait for long-running stress tests.
5. Continue B operations, then C robust streaming/queue foundation, then D expanding Python scenario lab, with each milestone independently runnable and documented. E third-party/browser/provider integrations are later.
6. Keep every change focused, reversible and backed by actual source/test evidence. Rerun relevant regressions after defects. Do not falsify outcomes or silently skip a failed gate.
7. **Do not touch user files, do not run high-volume transfers, do not upload to external providers, do not merge or deploy** without explicit user approval.

**Success for this run:** the owner can install a matching build and immediately begin browsing, previewing and debugging Chutey's local Explorer on Windows, while Codex establishes a clean, versioned, safe Python file API that can grow into full clipboard, job-queue and automated golden-scenario engineering. The latter goal must **support**, not delay, the working Explorer.

---

### Lightweight starter

> In `thanks-cohn/chute` on branch `codex/chutey-explorer-windows-usable-asap-2026-11-04`, read `In_Progress/CODEX_P0_WINDOWS_EXPLORER_FAST_FIRST_PROGRAMMATIC_CORE.md` and implement it. **First get a safe, owner-authorized Windows folder browser with real previews working inside the existing Chutey Shelf, then produce paired downloadable Windows EXE + Chrome test artifacts immediately for debugging.** Reuse existing worker, native companion and production Python Explorer; no duplicate engines. Continue real file operations and full-directory clipboard Copy/Cut/Paste, with size-independent bounded streaming and job/queue contracts, all programmatically accessible through the same Python API. Build the initial independent-oracle golden tests using *small disposable fixtures only*, designing for a larger future scenario corpus. Fix Chrome CSP-test errors without weakening policy. **Never run expensive file transfers or upload to providers**; no real user data. Preserve existing Chute functions and deferred mascot/gallery notes. Commit code/tests/artifacts and precise PASS/BLOCKED evidence to the development branch only; don't auto-merge or deploy.
