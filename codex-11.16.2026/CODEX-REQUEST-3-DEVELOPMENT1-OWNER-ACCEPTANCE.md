# CODEX REQUEST 3 — DEVELOPMENT 1 OWNER FEEDBACK / FINAL ACCEPTANCE BUNDLE

**Date:** November 16, 2026
**Repository:** `thanks-cohn/chute`
**Authorized working branch:** `codex/2026-11-16-phase1-repairs`
**Working binary source baseline:** `62694d6f821481c7857d134a8ddd1ba6e6aded83` (installed Windows Development 1 test candidate; this addendum commits **documents only**, not a changed worker).
**Status:** OWNER WINDOWS TEST IN PROGRESS. **Development 1 is not approved**; user says worker now runs, but large-file reliability, MP4/WebM/MP3 acceptance and popup/Shelf UX need repairs.

## STOP RULE — BINDING

This is an **addendum** to [Development 1 Request 1](CODEX-REQUEST-1-DEVELOPMENT1-FIX-AND-STOP.md) and [two sequential developments gate](TWO-SEQUENTIAL-DEVELOPMENTS.md). Work **only** in Development 1, then give the owner a new Windows test candidate, evidence and a clear report; **STOP**. Do not start, implement, open, create, queue, or touch the Development 2 branch `codex/2026-11-16-sticky-mascot`, nor implement native always-on-top Explorer, mascot Assign/Pick Me Up/Drop Off or its new visual design. The owner must separately, explicitly approve Development 1 on their own Windows machine.

**Do not interpret this document as permission to run any existing self-installing executable or overwrite a running worker.** Owner installed a matching new candidate. The original Windows worker and native helper have been archived and checked on GitHub on branch `archive/chutey-11.16-worker`, commit `d0939d5`, path `chutey/archive/11.16_worker/`. Preserve them. Preserve installed user files, original history, Chrome production profile, recovery/tag/checkpoints. Build new **test** binaries separately only after source changes; owner explicitly chooses when to install.

## EXECUTE ALL THREE Development 1 REPAIR DOCUMENTS

Read in this order, then implement systematically, keeping changes small and independently testable:

1. **[Request 3A — Mini-popup + Shelf UI](CODEX-REQUEST-3A-POPUP-AND-SHELF-UX.md)**. GitHub issues [#15](https://github.com/thanks-cohn/chute/issues/15) and [#16](https://github.com/thanks-cohn/chute/issues/16).
   - The **tiny Chrome extension popup** is NOT Shelf. Popup `Settings` must show **ONE single vertical, top-to-bottom scrollbar for the entire popup**: **NO horizontal/lateral scrollbar** and **NO nested separate Settings/gallery scrollbars**. Reflow all controls and keep images/history reachable; don't merely hide overflow. Test at actual 390x590px Chrome popup, opened and closed Settings.
   - Popup image tile **click -> enlarge** immediately. No Expand button, no X close button; preserve Escape/click-away closure and navigation. Right-click a tile or its enlarged image for a small temporary trash-can icon and **exactly `Trash It!`** (not Remove from Chutey). Remove only the live presentation/basket, NEVER the dated History or original bytes; archived items remain available and recallable.
   - On **Shelf History cards**, show `DRAG ME!` **together on one readable aligned line**, even at narrow widths. Avoid lonely `ME!` and action-button collisions.

2. **[Request 3B — Reliable big files and media](CODEX-REQUEST-3B-LARGE-FILES-MP4-WEBM-MP3.md)**. GitHub issue [#18](https://github.com/thanks-cohn/chute/issues/18).
   - Reproduce user failures by gesture/path before inferring root cause. Known source path rejects Explorer drag >32 MiB; separate browser base64 path can inflate memory. Differentiate from the normal streamed 8-GiB backend limit, destination free space, and disabled 300-MB experimental interop limit.
   - Add safe bounded large-file transport on supported paths with accurate receipts. Real `MP4`, `WebM`, `MP3` import, browser-preview playback, pause, seek, outbound copy and byte verification; differentiate codec unsupported from app error. Test on a 4 GB RAM-class Windows environment and with full/damaged/unknown-size input; avoid large in-memory `Blob` or base64 transfers. Never claim unsupported cross-app drag works.
   - Protect verified YUMMY animation from false success, retain all data and runtime safety.

3. **[Request 3C — Shelf Settings History Export](CODEX-REQUEST-3C-SHELF-HISTORY-EXPORT.md)**. GitHub issue [#17](https://github.com/thanks-cohn/chute/issues/17).
   - The **Shelf's Settings**, **NOT the little popup's Settings**, need an **Export History** section with "From the beginning / All history", "Today", and inclusive "Selected date range". CSV and JSON with well-defined history metadata/events, clear timezone boundaries, non-destructive bounded export, not only current live 30 items. Preserve History files and original content.

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
In thanks-cohn/chute, work ONLY on Development 1 branch codex/2026-11-16-phase1-repairs. First read codex-11.16.2026/CODEX-REQUEST-3-DEVELOPMENT1-OWNER-ACCEPTANCE.md and ALL three linked 3A/3B/3C task documents, plus existing CODEX-REQUEST-1-DEVELOPMENT1-FIX-AND-STOP.md. Implement and test the entire owner-feedback repair bundle: mini Chrome popup ONE vertical scrollbar and NO horizontal/nested scrollbars, popup tile click to enlarge and right-click temporary trash icon labeled exactly "Trash It!" (never delete History), Shelf "DRAG ME!" wrap, large-file and MP4/WebM/MP3 integrity/playback, and Shelf Settings History Export (all/today/date range). Preserve running installed worker, backups, file data, YUMMY and history. Build matching isolated Windows test worker only if needed; never silently install or replace. Push fixes with exact evidence and owner test steps; STOP. Do not start or create Development 2.
```
