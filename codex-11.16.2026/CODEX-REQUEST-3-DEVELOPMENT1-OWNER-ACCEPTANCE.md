# CODEX REQUEST 3 — DEVELOPMENT 1 OWNER FEEDBACK / FINAL ACCEPTANCE BUNDLE

**Date:** November 16, 2026
**Repository:** `thanks-cohn/chute`
**Authorized working branch:** `codex/2026-11-16-phase1-repairs`
**Working binary source baseline:** `62694d6f821481c7857d134a8ddd1ba6e6aded83` (installed Windows Development 1 test candidate; this addendum commits **documents only**, not a changed worker).
**Status:** OWNER WINDOWS TEST IN PROGRESS. **Development 1 is not approved**; user says worker now runs, but large-file reliability, local MP4/WebM/MP3 streaming, popup/Shelf UX, daily highlighted-text capture and decoration defaults need repairs.

## STOP RULE — BINDING

This is an **addendum** to [Development 1 Request 1](CODEX-REQUEST-1-DEVELOPMENT1-FIX-AND-STOP.md) and [two sequential developments gate](TWO-SEQUENTIAL-DEVELOPMENTS.md). Work **only** in Development 1, then give the owner a new Windows test candidate, evidence and a clear report; **STOP**. Do not start, implement, open, create, queue, or touch the Development 2 branch `codex/2026-11-16-sticky-mascot`, nor implement native always-on-top Explorer, mascot Assign/Pick Me Up/Drop Off or its new visual design. The owner must separately, explicitly approve Development 1 on their own Windows machine.

**Do not interpret this document as permission to run any existing self-installing executable or overwrite a running worker.** Owner installed a matching new candidate. The original Windows worker and native helper have been archived and checked on GitHub on branch `archive/chutey-11.16-worker`, commit `d0939d5`, path `chutey/archive/11.16_worker/`. Preserve them. Preserve installed user files, original history, Chrome production profile, recovery/tag/checkpoints. Build new **test** binaries separately only after source changes; owner explicitly chooses when to install.

## MANDATORY ORDER — UI AND HISTORY FIRST, WORKER LAST

The owner explicitly requires the **rest of the functionality to be finished before large-file/worker streaming work**. Complete and validate each stage in order. Preserve working source and functionality, and run relevant regressions before moving to the next stage. An initial source-level audit of media interfaces is permitted, but **do not start the invasive worker streaming implementation, Windows rebuild, or replacement until Stage 4**. All four are **Development 1**, not Development 2.

### Stage 1 — Popup + Shelf UI (Request 3A)
**[Request 3A — Mini-popup + Shelf UI](CODEX-REQUEST-3A-POPUP-AND-SHELF-UX.md)**. Issues [#15](https://github.com/thanks-cohn/chute/issues/15), [#16](https://github.com/thanks-cohn/chute/issues/16).
- The **little Chrome extension popup** is a separate surface from Shelf. Its Settings must fit vertically and share **ONE up/down scrollbar across the complete popup**, with **ZERO lateral/horizontal scrollbars and ZERO nested competing scrollbars**. Settings open in normal document flow, not a floating internally-scrollable overlay; controls remain reachable at 390px.
- Clicking a popup image tile expands it immediately, without a separate Expand or X control; use Escape/click-away to close. Right click shows a small, temporary trash-can icon and **exactly `Trash It!`**. Trash removes only the *live* item/presentation and **never** deletes permanent dated History or original bytes; archived item handling is safe.
- Shelf History cards keep **`DRAG ME!`** on a single legible aligned line, with buttons not colliding.

### Stage 2 — Shelf History export (Request 3C)
**[Request 3C — Shelf Settings History Export](CODEX-REQUEST-3C-SHELF-HISTORY-EXPORT.md)**. Issue [#17](https://github.com/thanks-cohn/chute/issues/17).
- **Shelf settings**, not little popup Settings: **Export History** with From Beginning/All History, Today, inclusive custom date range; CSV/JSON, correct local timezone boundaries, read-only, metadata not full original files, and bounded memory across all dates/pages.
- Finish and test complete exports, record immutability and original History preservation before Stage 3.

### Stage 3 — Daily highlighted text, popup text reader and decoration default (Request 3D)
**[Request 3D — Daily text highlights and background animation OFF](CODEX-REQUEST-3D-TEXT-HIGHLIGHTS-AND-ANIMATION.md)**. Issue [#19](https://github.com/thanks-cohn/chute/issues/19).
- Highlight webpage text -> right-click Chutey -> persist each timestamped passage in a **daily UTF-8 text file**, one file per local day, with recoverable per-capture History identity. Don't overwrite, misdate, duplicate or lose original captures.
- In the small popup, clicking a text file expands a **vertically scrollable text reader** preserving literal saved text. In Shelf History, GO TO/Reveal locates the real daily text file and ideally its correct timestamped passage. Preserve other file GO TO behavior.
- Turn **decorative spinning background behind Chutey images OFF by default**, with an explicit persistent opt-in under **Shelf → Image and background settings**, not little popup Settings. Apply across popup and Shelf; keep YUMMY success animation unchanged.
- Finish UI/backend-as-needed for these features and tests before Stage 4; do not combine this step with the streaming worker rewrite.

### Stage 4 — LAST: large-file transfer and robust LOCAL media streaming (Request 3B)
**[Request 3B — Large files + local MP4/WebM/MP3 streaming](CODEX-REQUEST-3B-LARGE-FILES-MP4-WEBM-MP3.md)**. Issue [#18](https://github.com/thanks-cohn/chute/issues/18).
- **Only after Stages 1–3 are implemented and tested**, investigate and repair supported large-file transfer paths: distinguish actual 32 MiB browser Explorer drag limit, 8 GiB streamed upload server limit, experimental disabled 300 MB cap, browser restrictions, and available disk space. Avoid giant base64/Blob copies and use bounded verified streams.
- Worker must stream actual **MP4, WebM and MP3 files directly from authorized local directories** in BOTH **Shelf → File Explorer preview pane** AND **the little Chrome extension popup's expanded preview**. The popup currently shows Chutey live/history; add a securely authorized source bridge/navigation, not arbitrary path access or a false claim that local files are already in the popup.
- Both players support play/pause/seek and resource-efficient HTTP byte-range streaming with cancellation and scoped permission; never load whole movies/music into memory. Test genuine playable codecs and report unsupported codecs honestly. Capture distinct real-Chrome evidence for each surface and format on constrained Windows hardware. Leave folder navigation and thumbnails responsive.
- Protect verifiable receipts, original saved files, original YUMMY animation, safe recovery, history and low-resource performance.
- **Worker/browser matching build and Windows package comes after Stage 4**. Do not auto-install/replace the owner's working worker.

## TEST SCOPE AND PRE-EXISTING REQUIREMENTS

Before editing, read:
- [Development 1 Request 1](CODEX-REQUEST-1-DEVELOPMENT1-FIX-AND-STOP.md), [source audit](DEVELOPMENT1-SOURCE-AUDIT-CRASHES-POLLING-ANIMATION.md), [final repair handoff](DEVELOPMENT1-FINAL-REPAIR-HANDOFF.md), [owner Phase1 original requirements](OWNER-PHASE1-CODEX-REQUEST.md).
- Existing tests, including popup/gallery first paint, `verify-popup-gallery.cjs`, `verify-popup-settings-boundary.py`, `verify-chutey-tabs-and-mascot.cjs`, `verify-worker-boot.cjs`, `verify-runtime-efficiency.cjs`, native/history/media/transfer Python tests.
- The baseline Windows package was built separately on `build/chutey-phase1-worker-2026-11-16` (GitHub Actions run 43975395351). **Do not overwrite that artifact or published old releases**. Produce a new uniquely named test artifact + SHA-256 + matched extension when native source changes are made.

**Required regressions:**
- Popup at 390px: Settings opened/closed, horizontal scrollWidth never exceeds clientWidth; precisely one intended vertical scroll viewport; keyboard/wheel reaches every setting and history tile; no duplicate scrollbar or covered gallery; 120 items across density levels unaffected.
- Click one thumbnail opens correct image; no X/Expand; Escape/click-away close; right-click `Trash It!` scoped only to live, History unchanged and Recall works; keyboard and touch alternatives tested.
- Shelf History `DRAG ME!` legible without wrap/split or button collisions across narrow normal widths; `Drag address` and archived state unaffected.
- Export Today/local timezone across UTC midnight and DST, from beginning, date range inclusive, large histories streaming/bounded, UTF-8/CSV injection protection, read-only/non-destructive, original data unchanged.
- MP4, WebM, MP3 actual browser playback/seek and byte-preserving copy, large file handling, fail/abort/space-exhaustion and verified receipts; correct errors for unsupported container/codec or browser restrictions.
- Original YUMMY confirmed-save animation, mascot auto-hide, counts, right-click and native wake, file explorer navigation, existing previews, images, log rotation, history and Chrome user data all preserved.

## OUTPUT EXPECTED OF CODEX

1. Investigate and report confirmed causes vs hypotheses with exact file paths and current behavior, then implement focused fixes **only on Development 1**.
2. For each 3A/3B/3C: changed files, precise tests executed/results, supported/unsupported paths and before/after screenshots where visual.
3. Run full relevant regression suite and Windows isolated build, **do not call a test "pass" unless executed**, don't claim owner's installation was remotely tested. New native changes require a *fresh* uniquely identified matching worker, native helper and Chrome test package.
4. Commit and push Development 1 work (keep tagged/archived snapshots untouched). Report branch, commit SHA and download/build location, instructions for the user to test in their temporary Chrome profile and manually install an approved candidate. Document remaining manual acceptance tests.
5. **HARD STOP** until owner personally verifies the changes in Windows and separately approves moving on.

**Required final status line:**
`DEVELOPMENT 1 CANDIDATE READY FOR OWNER WINDOWS TESTING — STOPPED. DEVELOPMENT 2 NOT AUTHORIZED.`

## Lightweight Codex starter prompt
```text
In thanks-cohn/chute, work ONLY on Development 1 branch codex/2026-11-16-phase1-repairs. First read codex-11.16.2026/CODEX-REQUEST-3-DEVELOPMENT1-OWNER-ACCEPTANCE.md and all four linked 3A/3C/3D/3B task documents in that exact implementation order, plus existing CODEX-REQUEST-1-DEVELOPMENT1-FIX-AND-STOP.md. Implement and test the entire owner-feedback repair bundle: FIRST popup ONE vertical scrollbar and NO lateral/nested scrollbars, popup image click enlargement and right-click Trash It! without History deletion, Shelf DRAG ME! alignment; SECOND Shelf Settings History Export; THIRD daily highlighted-text file, expanded popup text reader, History GO TO, default-off image backdrop animation via Shelf Settings; LAST worker/large-file repairs including direct local-directory MP4/WebM/MP3 streaming in both Shelf preview and little Chrome popup expanded preview. Preserve running installed worker, backups, file data, YUMMY and history. Build matching isolated Windows test worker ONLY in final worker stage if needed; never silently install or replace. Push fixes with exact evidence and owner test steps; STOP. Do not start or create Development 2.
```
