# CODEX IMPLEMENTATION REQUEST — Chutey Premium Local File Explorer

**Repository:** `thanks-cohn/chute`  
**Base:** current `main` (inspect its HEAD when starting, don't assume a stale SHA)  
**Deliverable:** implement on a new focused `codex/chutey-api-first-local-explorer` branch, run tests, and open a reviewable PR. **Do not auto-merge to main or change the known-working release.**  
**Owner directive:** "Drag and drop. Simple."  
**Status of this file:** IMPLEMENTATION PROMPT — not a claim that an Explorer or Python test game currently exists.

## 1. Primary outcome: Windows Explorer intuition, Chutey premium finish

Build a genuinely useful, standardized, beautiful local file explorer inside the **existing** Chutey Shelf tab named **File Explorer**. It should be obvious to use without a tutorial: compact navigation, nested expandable directories, small crisp file/folder icons, attractive real thumbnails, familiar keyboard behavior, precise drag/drop and an in-app right-click menu. Use a sophisticated dark visual system aligned with Chutey, impeccable spacing and a consistent icon vocabulary, restrained transitions, polished selection/hover/focus feedback and adequate scrollbar gutters.

**Few or no ordinary text buttons.** Prefer small icon controls with accessible names and hover tooltips. Do not remove critical accessibility: all actions remain operable through keyboard and menu/accessible labels. Avoid giant controls, redundant dialogs and overdecorated cards. A user should think: "Why can't Windows Explorer feel this effortless?"

**Foundational architectural constraint:** The filesystem engine is a **complete, importable, versioned, independently scriptable Python File Explorer API first**. The Shelf is a thin client. The CSS is a separate presentation layer, and later a SKIN API will be able to restyle the Explorer without affecting data, file safety or command semantics. A headless Python script should be able to perform every supported operation before anyone clicks a GUI control.

Two distinct goals must both pass:

1. **Engine success:** exact file operations and independent byte-verified results, fully reproducible by a REDOWN-style Python scenario "game" with no browser UI.
2. **Experience success:** an intuitive, fast, premium GUI that faithfully drives that same engine and can transfer images to/from supported browser pages.

Do not claim that a visual success animation is proof of a successful write.

## 2. Read the current architecture and reuse existing workers

Start with [`worker/README.md`](../worker/README.md). There is **already** a Chrome MV3 worker at `extension/background-entry.js` and an existing Python Windows companion in `src/chute/`. **Do not create another background worker, Windows service, or native host just for Explorer.** Extend the current Python companion using focused modules and route a scoped adapter through the current localhost bridge.

Inspect all of the following current sources, recording actual behavior and limitations:

- `extension/manifest.json`, `background-entry.js`, `background-native.js`, `native-wake-page.js`, `bridge-reconnect.js`
- `extension/shelf.html`, `workspace-tabs.js`, `workspace-tabs.css`, `explorer-shell.css`, `shelf.js`, `workflow-fixes.js`, `shared.css`
- `extension/content.js`, `drag-relay.js`, `bin.js`, `direct-drop-google-yandex.js`, `content-image-resolver.js`, `bin-image-resolver.js`, `drop-lifecycle.js`
- `src/chute/server.py`, `store.py`, `windows_app.py`, `native_host.py`, `browser_extensions.py`, `reveal.py`
- `tests/`, `scripts/verify-worker-boot.cjs`, `verify-real-image-browser.py`, `verify-thumbnail-icons.cjs`, `verify-chutey-tabs-and-mascot.cjs`, all applicable existing CI.

Read `In_Progress/LOCAL_EXPLORER_AND_IMAGE_TRANSFORMS_API.md` and `In_Progress/CHUTEY_WORKSPACE_TABS_AND_SKIN_API.md`.

### REDOWN references (patterns, NOT copied provider code)

Inspect from `thanks-cohn/REDOWN`:

- `docs/beta/EXPLORER.md`
- `extension/beta/explorer.mjs`
- `extension/explorer-destination-menu.js`
- `docs/EXPLORER_CONTEXT_MENU_REPORT.md`
- `tools/lab/redown_lab.py`, `tools/lab/README.md`
- `IMPORTANT/UNIVERSAL_AGENTIC_TEST_CORPUS_AND_PIPELINE.md`

Reuse *ideas*: one operation dispatcher; nested destination trees; copy/move internal clipboard; dynamic folder loading; clear status/uncertainty; testable real engine; scenario inventory/hash oracle; native and browser evidence separated. Do **not** transplant Cloudflare Worker, cloud APIs, secrets, provider-specific routes or their constraints.

Create a concise source-audit table in the PR, especially explaining which existing Chutey drag flows are actually verified and what the Chrome cross-window and synthetic-drag limitations are.

## 3. The fully testable Python File Explorer API is the foundation

The file engine belongs to the **existing Windows Python companion**, and must run headlessly in unit and scenario tests. Create well-bounded modules, e.g.:

```
src/chute/explorer/
  __init__.py
  core.py                 # allowed roots, list, paginated browse, stat, search
  operations.py           # mkdir, rename, copy, move, safe trash, receives
  preview.py              # file preview metadata and safe streaming/byte ranges
  security.py             # sessions, root capabilities, handles, path guards
  protocol.py             # versioned schemas, error codes, receipts
  api.py                  # companion HTTP adapter to the SAME core methods
```

Module names may change after audit, but the separation and testability may not. Keep existing Chute storage/History code authoritative for its existing resources.

Implement a versioned capability catalog and **one command route** (or a small stable family) with typed inputs, outputs and reason-coded failures. Expose:

- Discover authorized local roots/drives, enumerate directory children (paginated, stable ordering), stat file/folder, navigate parent/child, refresh, sort and search within a folder. Correctly distinguish empty from unreadable or temporarily unavailable directories.
- Generate safe image thumbnails without loading entire large directories/files into browser memory. Stream original bytes on demand. Preview support as described below.
- Create folder, rename, copy, move, trash/delete with explicit intent, conflicts (default KEEP BOTH for copies/intake; SKIP and explicitly confirmed REPLACE), progress, and exact destination. Avoid destructive overwrite defaults.
- Open and reveal in Windows using the existing safe reveal patterns. Failed/unsupported operations produce truthful errors.
- File/folder intake with a supplied *user-granted directory handle*, selected filename, byte stream and a verified receipt. Accept genuinely delivered file bytes rather than treating a URL string as an image.
- Structured operation ID and receipts for started/completed/partial/failed/cancelled/**uncertain**, with exact resulting bytes/metadata when available; no auto-retry after an uncertain mutation.
- Interruption/restart handling: never report finished while transfer is still pending. Staging + flush/verification + atomic destination publication where supported; on crash, preserve safe evidence and offer reconciliation instead of blind replay.
- Scalable navigation: empty folder, thousands of items, deep branches, Unicode, long paths, locked/permission denied, offline volumes, reparse points, duplicate filenames and concurrent changes.

**Critical security requirement:** Current `server.py` accepts any `chrome-extension://` origin on some existing routes. That is NOT an adequate authorization boundary for new arbitrary filesystem writes. Before adding a local Explorer mutation/ingest route, use verified enrolled Chutey extension identity, authenticated short-lived root-scoped capabilities, explicit user-selected directory consent, restrictive Origin/CSRF and DNS-rebinding defenses, non-guessable handle references and safe origin checks. Never let an untrusted page submit an absolute local path and have Chutey write there. Deny traversal, symlink/junction/reparse escapes, unsupported UNC/network locations, forbidden Windows names, special files/devices and unapproved privilege escalation. Limit memory, bytes, concurrency and dangerous content. Keep the actual filesystem access inside Python; no Chrome remote scripting or arbitrary shell commands.

A single Python engine must serve keyboard, menu, drag/drop, test CLI and GUI commands. **No competing JS semantics.**

## 4. The actual File Explorer GUI — polished, separate and skinnable

Mount inside existing `#chutey-explorer-view`. Do not recreate or replace the existing tabs, and preserve the previously implemented behavior: the active tab moves to the left and `chrome.storage.local.chuteyShelfActiveTab` remembers what the user left open.

Inside File Explorer:

- A compact folder/tree navigator with expandable chevrons for children, indentation and breadcrumbs; parent/back/forward and sensible root/drives entry. Easy direct folder selection for drag targets.
- File contents show real thumbnails for images where possible; otherwise consistent crisp type icons. Compact filename, size/date and minimal metadata. Sorting by name/type/date/size; lightweight search; list by default at narrow width; optional grid via small icon.
- Single click selects/previews file; double-click navigates folder or invokes safe Open action as appropriate; keyboard arrows, Enter, Esc, F2, Ctrl/Cmd+C/X/V, multiselection, context menu key/Shift+F10. Do not hijack input typing.
- Folder rows and tree branches support precise drag-hover targeting, visible drop highlighting and autoscroll; user knows exactly which folder will receive the item.
- Preserve folder path, expanded nodes, selected entries, scroll and sort when switching to History and back, and ideally upon reopening the Shelf (separate persisted keys from tab preference).
- No unnecessary pop-out page to browse ordinary files. A file dialog can be used when native OS authorization genuinely requires it.
- Loading state, empty folder, permission error, operation progress/cancellation and completed result are clear without large constant debug banners.

**CSS contract:** All Explorer-specific selectors belong to separate `extension/explorer-*.css` scoped under `#chutey-explorer-view`; use the already present `--chutey-explorer-*` tokens in `explorer-shell.css`. Separate DOM layout, event logic, file operation logic and skin tokens. The eventual SKIN API should allow new colors, typography, icons and animation presets with a validated declarative theme, without granting filesystem/network privileges or injecting arbitrary JS/HTML. Premium finish is required, but skin work must not block correctness.

> **OWNER SUPERSEDING PREVIEW CORRECTION — NOVEMBER 4, 2026:** The previous “never compress/shrink” requirement and its unchanged-height geometry test below are **historical and superseded**. The current authoritative specification is [the half-height Explorer + expandable preview + Left/Right gallery bug](../bugs/CHUTEY_EXPLORER_HALF_HEIGHT_BROWSING_EXPANDING_PREVIEW_AND_ARROW_GALLERY_2026-11-04.md): on preview open allocate roughly half of available Explorer content height for an independently scrollable browser; the preview card may rise nearly to protected top/calendar controls, and beyond the half split it must **overlay**, not further shrink the browser. The file Explorer must never collapse below its 50% allocated size. Closing restores full height/scroll. Left/Right moves through image files and pagination without closing preview. This correction takes precedence over conflicting instructions in this section and old browser tests.

## 5. Preview behavior — BOTTOM OVERLAY, NEVER COMPRESS THE EXPLORER

The user specifically requires:

**Single-click a file → a generous bottom preview window overlays the Explorer.**

- Preview should occupy roughly 40–55% of the visible Explorer area by default, with responsive min/max dimensions, an unobtrusive drag-to-resize handle and small close icon. Do not cover the Shelf header/tabs.
- **The preview overlays the lower Explorer. It must NOT split, shrink, push, compress, or reflow the underlying folder explorer**, nor recalculate grid columns. The main folder/tree viewport retains its original size and its **own scrollbar** so scrolling continues normally. The preview and documents have independent scroll containers.
- The file list remains full-sized behind the preview. Closing the preview restores exact selection, folder expansion and scroll; choosing another file updates the same preview rather than opening additional windows. Exposed upper files remain interactive; allow natural access to files beneath via Explorer scrolling.
- Images display the actual saved image with aspect-fit, clean optional zoom/fit icon controls, loading/error states. Never show an icon in place of a decodable stored picture.
- Video is **playable** using native browser controls, pause/seek and byte-range (HTTP 206) streaming. Closing or switching files pauses/stops playback and cancels unnecessary transfers.
- Documents are **scrollable** within the preview: safe browser-supported PDF and readable plain text first. Add other genuinely supported renderers only if feasible, without executing scripts/macros or uploading sensitive documents to third-party preview services. Unsupported DOCX/etc. gets a clear "Preview unavailable" plus safe Open/Reveal actions. Do not promise arbitrary formats renderable.
- Large/unreadable/damaged content should fail gracefully without blocking the Explorer.

**Mandatory visual regression:** real Chrome/Playwright (or equivalent installed-browser) screenshot/geometry test of opening preview must assert unchanged Explorer width, height and column layout; main Explorer becomes/remains scrollable; bottom preview actually overlaps lower files; its document scroll stays inside it; History stays intact. A flex/grid split pane that reduces the Explorer area **fails acceptance**, even if both components display.

## Cross-product requirement: REDOWN clouds ↔ Chutey local Explorer

**Mandatory target, coordinated across both repositories:** read
[Chutey's interoperability contract](REDOWN_CHUTEY_BIDIRECTIONAL_INTEROP.md) and
[REDOWN's counterpart](https://github.com/thanks-cohn/REDOWN/blob/main/docs/proposals/CHUTEY_REDOWNS_CLOUD_LOCAL_INTEROP.md)
before implementing drag/drop. The target is **real bidirectional file transfer**:
cloud file from a connected REDOWN provider → the exact user-selected Chutey
local directory; Chutey local file → the exact REDOWN cloud provider/bucket/folder.
Preserve filename and actual bytes, stream large files within real limits,
verify final contents, and default to COPY. Never claim a `.url` shortcut is
an image or a synthetic event is verified drag-and-drop.

Chutey owns the scoped local filesystem engine, REDOWN owns its authenticated
cloud adapters. Define a versioned, short-lived, permissioned transfer handoff
with joint tests, without a second worker or exposed cloud tokens/local paths.
Browser cross-extension drag has real restrictions: implement a user-initiated
Send to/Save to handoff as a truthful fallback and distinguish mocked versus
installed-Chrome/live-provider results. **Do not defer designing the adapter
interface until after GUI completion.** The Chutey API-first Explorer must stay
usable independently if the REDOWN-side integration is not yet built.

## 6. Drag and drop is the primary way files move

### A. Local Explorer → web (Google, ChatGPT, Yandex)

A user drags an Explorer image and drops it on a supported upload area in another Chrome page/window. **Use the existing Chutey file token, relay, native data fetch and site-specific compatibility code**, adding a narrow Explorer adapter for real local files (not only already-saved Chute basket IDs).

Inspect the working flow in `drag-relay.js`, `content.js`, `direct-drop-google-yandex.js` and `bin.js`. Keep real filename, MIME, bytes and visible status. For a saved local file, use a safe opaque reference to read bytes and build an actual `File` on the receiving side only when permitted. Synthetic `DragEvent` may not count as a trusted cross-window drag or be accepted by site upload APIs. Test real user drags on Google, ChatGPT and Yandex independently; report per-site support status and browser limitations **without pretending success**. Where Chrome prevents true direct drag, supply a clear user-initiated fallback through the native file picker / clipboard / existing Chutey basket route, not an invisible fake upload.

Do not disclose a local filesystem absolute path in third-party site data. Preserve normal webpage drag behavior.

### B. Browser page → Explorer target folder

A user drags a webpage image, downloaded file, link or text onto **an explicitly selected local directory**. The hovered folder is the destination. Preserve nested paths correctly; show confirmation and the actual resulting file. Do not always send it to `~/Chute/files` or the generic Live basket.

- Prefer direct actual `File`/Blob bytes; for an image URL resolve bytes through existing authorized Chutey capture where supported, checking MIME, response status, size, filename and contents.
- If a URL cannot be fetched, **do not silently save a `.url` and call it an image**. Offer a distinct "Save link shortcut" action or a visible unsupported reason.
- Never allow an arbitrary web page to pick a filesystem destination via an untrusted path; the chosen target must be a scoped capability originally granted through Chutey.
- Stage/verify write and check the exact path/file content before reporting success. On naming conflicts use a clear KEEP BOTH/SKIP/explicit REPLACE rule.
- Support multiple files and robust error feedback; prevent downloads from executing, opening or rendering active content unsafely.

### C. Explorer → Explorer

Drag a file or directory onto a folder to move it; modifier / explicit choice copies instead. Same-directory copy gives a safe new name; prohibit move into self/descendant, invalid cross-volume assumptions, symlink escapes, clobber, lost source or incomplete copy. Include a drop target for the current directory and expandable tree. Allow graceful cancellation and source/destination verification.

Make supported actions discoverable through icon affordances and the in-app right-click menu instead of extra big buttons.

## 7. Explorer-specific RIGHT-CLICK MENU — REDOWN approach, LOCAL semantics

Within `#chutey-explorer-view`, implement a polished custom context menu **only for Explorer file/folder/background surfaces**. Do not globally replace the browser/OS right-click menu. Reuse REDOWN's thoughtful UX principles, not its R2 adapter.

Context-aware actions:
- Files: **Preview**, **Open**, **Reveal in Windows**, **Copy**, **Cut**, **Copy to…**, **Move to…**, **Rename**, **Duplicate**, **Properties**, **Delete/Move to Recycle Bin** (confirmation); add applicable supported actions (e.g., image transform) in later phases.
- Folders: **Open**, **Expand/Collapse**, **Copy**, **Cut**, **Copy to…**, **Move to…**, **Rename**, **New folder inside**, **Properties**, and safe Delete.
- Background: **New Folder**, **Paste**, **Refresh**, optional sort/view icons.
- **Copy to…** and **Move to…** open a nested *local* directory tree with **Copy here / Move here** at each valid destination. Pagination/lazy children, hover/click expansion, viewport edge flipping and disabled self/descendant destinations. Lazy listing must never block a valid "here" action.
- Support pointer, touch, keyboard Up/Down/Home/End, Right/Left, Escape, focus and scrolling. Close on outside click or completed action. Disabled actions cannot fire.
- The menu, keyboard, icons and drag gestures all invoke the same production API command dispatcher with a validated selection and target. No independent menu-only copy/move logic. Internal clipboard is scoped and predictable; don't claim system-wide Windows clipboard transfers without actual OS integration.
- On failure, explain the cause in concise user language; preserve detailed opt-in diagnostic receipts for scripts/agents. Never print raw internal debugging strings in the regular Shelf.

## 8. Python "API GAME": execute scripts against EVERY supported operation

**Build the testing harness as part of the feature, not as an optional later project.** REDOWN's Python universal file API testing experiment is the design reference, but this harness must exercise *Chutey's actual production local Explorer engine*, not an imitation.

Suggested `tools/explorer_lab/chutey_explorer_lab.py` commands:

```
doctor
capabilities
inventory --root <approved-fixture-root>
preflight --plan <plan.json>
snapshot --plan <plan.json>
run --plan <plan.json> --out <run-dir>
run --plan <plan.json> --dry-run
status --run <run-dir>
diff --before <file> --after <file>
report --run <run-dir>
retry --run <old-run> --scenario <id> --plan <new-plan> --out <new-run>
cleanup --run <run-dir> [--execute]
```

Keep tests reproducible, read-only by default, and confined to explicitly created owner-approved **temporary test roots**. No real Desktop, Documents, Downloads or `~/Chute` history mutation. Provide a documented sample corpus with images, video/PDF/text fixtures when license/size allows; seeded generated trees containing Unicode, deep nesting, long names, empty files, duplicate names, large files (sparse fixtures), permission-denied cases, symlinks/junctions/reparse points, locked files, missing drives, invalid paths, repeated drops and destination conflicts. Support randomized *bounded* state-machine generation and replayable seeds; maintain an extensible operation registry.

Every operation's test declares:
- Preconditions, allowed states and transitions.
- Independent expected outcome (reference filesystem model / oracle), not the production API's own receipt as proof.
- Before/after tree snapshots, forbidden side effects, source and target identity/metadata, byte-stream SHA-256 or real decoder checks.
- Error/timeout/interruption/recovery behavior and honest `PASS`, `FAIL`, `BLOCKED`, `UNSUPPORTED`, `UNKNOWN` classifications.
- A durable journal (intent/operation ID/receipt/verdict), `results.csv`, `summary.json`, `before.json`, `after.json`, `diff.json`, `journal.jsonl` and concise human report.

**No automatic retry after an uncertain filesystem mutation.** Never call a pass because `mkdir` returned HTTP 200 or the UI displayed an animation; verify the actual directory, file contents, source survival/deletion and allowed-root boundaries.

Test adapters should allow every newly implemented operation to be registered without rewriting the harness. Track contract coverage, branches, transitions, failure cases and scenario seeds. "All possible situations" means exhaustive coverage only of *declared bounded state models*, plus targeted/property/fuzz scenarios for unbounded real filesystem conditions; report coverage gaps honestly.

Acceptance suites:
1. Python direct import/unit tests of real filesystem core.
2. Lab end-to-end runs in ephemeral authorized roots, with independently verified before/after snapshots.
3. Local HTTP adapter origin/auth/security tests.
4. Real installed Windows companion, native startup/service-worker recovery and no regression to History/Recall.
5. Real Chrome GUI, preview OVERLAY geometry, nested context menus and both drag directions. Per-site Google/ChatGPT/Yandex results verified, not simulated.
6. Existing Chutey regression tests (image previews, tabs, mascot, boot, card layout, packaging).

## 9. Future transformations and SKIN API boundaries

**Do not conflate "rename extension" with file conversion.** The next iteration will allow images resized to explicit width × height (with preserve-aspect, fit, crop, stretch and quality modes) and converted among **real supported formats**. The architecture should reserve a transformation operator family and independent test oracle, but shipping arbitrary conversion is *not required to call this Explorer MVP complete*. See `In_Progress/LOCAL_EXPLORER_AND_IMAGE_TRANSFORMS_API.md`. Limit dimensions/resources realistically; leave original intact by default.

Similarly, create a sane scoped CSS custom-property token foundation for eventual component-local **SKIN API**, but don't introduce arbitrary executable themes or write access from skins. An alternate theme must not change API behavior.

## 10. Codex execution order, hard gates and proof

1. Audit existing APIs/drag mechanics/security and document findings succinctly.
2. Implement **real scoped Python Explorer engine**, headless commands and independent tests.
3. Add secure loopback adapter to existing companion — *do not create a second worker or daemon*.
4. Build navigation/tree/list UI into existing tab with independent styling; connect real operations.
5. Implement preview bottom **overlay** and independently scrollable Explorer/document, real video/PDF/image previews; test geometry.
6. Implement in-Explorer right-click menu and unified action router.
7. Implement both drag directions and distinguish verified installed-Chrome results from emulated tests.
8. Build and run Python scenario game against real core. Include security/error/failure/restart cases.
9. Re-run all existing boot/native/Shelf/history/image-preview regressions; build/test updated Windows EXE and Chrome ZIP in CI **without replacing the known-good public release**.
10. Produce PR with source audit, architecture map, user walkthrough, screenshot(s) at narrow/wide Shelf widths, tests + commands, scenario report, coverage/gaps, and an exact list of unverified live-site or installed-Windows behaviors.

**Hard stop:** if security for arbitrary directory writes or reliable actual byte transfer is not proven, do **not** ship that endpoint as writable and do not fabricate results. Still deliver tested read-only Explorer, preview and Python harness with clear `BLOCKED` entries, and include the next specific work needed.

**Definition of success:** A real local PNG can be discovered through the Python API, displayed in Chutey's premium Explorer, previewed by a bottom OVERLAY without shrinking the tree, transferred with a legitimate user interaction to a supported web uploader, and a user-approved image drop can be written to an exact local folder with a verified byte hash. The identical filesystem API can be invoked by independent Python scripts on disposable fixtures, and Chutey's pre-existing Shelf and native boot remain intact.
