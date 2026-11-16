# CODEX REQUEST 1 OF 2 — DEVELOPMENT 1: REPAIR, TEST, AND STOP
Date: 2026-11-16
Repository: `thanks-cohn/chute`
Working branch **already exists**: `codex/2026-11-16-phase1-repairs`

> **HARD STOP — OWNER APPROVAL REQUIRED.** This request authorizes ONLY Development 1 repair work. After your code is committed and pushed, report what changed and hand over an isolated Windows test plan. **STOP. Do not create, check out, implement, queue, or start Development 2.** Passing automated tests, reporting success, a green CI job, a code review, or the assistant saying it looks ready does **not** count as the owner's explicit approval. The owner must personally test Chutey on their Windows machine and send an explicit instruction to proceed later, in a separate request.

## Start from concrete existing evidence, not zero
Read these existing files in order:
1. `codex-11.16.2026/DEVELOPMENT1-SOURCE-AUDIT-CRASHES-POLLING-ANIMATION.md` (source-backed audit with exact paths, known findings, risk assessment).
2. `codex-11.16.2026/DEVELOPMENT1-IMPLEMENTATION-AND-VALIDATION.md` (earlier repair candidate and unexecuted Windows checks).
3. `codex-11.16.2026/OWNER-PHASE1-CODEX-REQUEST.md` (full owner's initial requirements and newly observed problems).
4. This file, as the **exclusive execution/gating instruction** for Development 1.

The implemented repair candidate is commit `f5cefb5`; the user pushed the annotated checkpoint tag `chutey-dev1-2026-11-16-audited-candidate-windows-pending`. The tag marks an audited, **NOT accepted**, candidate. Do not overwrite or move it. Continue the same Development 1 branch with new fixes.

## A. Fix confirmed efficiency problems
- **Excessive full-list polling:** `extension/bin.js` has `setInterval(refreshCount, 1200)` and `refreshCount()` performs `GET /api/files` only to calculate a counter. Inspect actual active iframes/tabs. Replace redundant rapid full-file-list polling with efficient event/change-driven or bounded, deduplicated, visibility-aware updates; preserve accurate counts and immediate UI refresh after confirmed saves.
- **Oversized logs:** User measured `%LOCALAPPDATA%\Chute\logs\chute.log` at **373,125,474 bytes** (~356 MiB). `src/chute/server.py` logs routine successful requests; `src/chute/windows_app.py` continuously appends to an unrestricted log. Quiet repetitive successful polling, preserve meaningful errors, add bounded and Windows-safe log rotation/retention, verify memory/disk use. Do **not** automatically truncate the live production log or modify the protected installed worker.
- Benchmark idle/background/multi-tab request rates and verify crash/error logging survives log rotation. Never claim the log's entire 356 MiB was polling unless independently established.

## B. Restore the ORIGINAL file-received animation
- User says the familiar success reaction disappeared. It is still in source: `extension/bin.js` has `animate("success")`, `showSuccessFeedback()`, `YUMMY`, happy face and count bounce; `extension/bin.css` includes `.bin.success` / `@keyframes happy`. Do not redesign its art or invent new animations.
- Trace actual webpage drag/drop -> content/iframe message -> upload -> confirmed receipt -> callback -> DOM/CSS animation visibility, including multi-file operations, refresh races, error/reconnect paths and mascot auto-hide.
- Restore an observable success reaction **only on verified success**. Failed/blocked saves must not animate as successful. Test with actual interactive browser drop, not only synthetic CSS assertions.

## C. Diagnose crash/disappearance with safe, autonomous recovery
- User saw Chutey disappear requiring a notification click and separately saw their temporary Chrome window crash. Determine which layer fails: Chromium process/profile, enabled extension/MV3 worker, content-script mascot, native host, or Chute.exe. Record privacy-safe diagnostics, distinguishing normal 10-second auto-hide, disabled floating mode, service-worker sleep, and actual loss.
- Windows host has suffered **very low disk and RAM headroom** (one measurement ~0.25 GiB free C: and 283 MB available RAM); remeasure current resources. Resource pressure could explain some behavior but isn't a proven Chutey cause.
- Existing wake/reconnect: `extension/background-native.js`, `extension/native-wake-page.js`, `extension/bridge-reconnect.js`, `src/chute/native_host.py`. Reuse and harmonize rather than stacking multiple watchdogs. Investigate `native_host.terminate_stale_bridge()`, which uses `taskkill /IM Chute.exe /F` and can kill **all** same-named processes after short health probes; avoid broad process kills and restart storms.
- Add bounded, rate-limited self-recovery where possible **without mandatory notification clicks**, with precise process identity, backoff/circuit breaker and honest visible status when Chrome requires user action. An extension cannot reenable itself when Chrome has disabled it; cannot force toolbar pinning. Do not loop Chrome reloads or interrupt pending file transfers.
- Test failure modes only in **disposable Windows VM/test profile and isolated candidate worker**. Never run a self-installing new Windows build against owner's installed Chute.exe.

## D. Preserve and re-test the original Development 1 goals
Confirm previously coded repairs remain functional:
1. All dashboard Chutey image cards keep full dimensions past first 4×4/5×5, tested with at least 120 items; no saved-image changes.
2. File Explorer thumbnails default to real images; Settings persist generic icon option.
3. Preview/gallery Left/Right selects neighboring files; Up/Down scrolls current document; visible controls, stable preview overlay and no underlying grid reflow.
4. Authorized Windows profile paths and explicitly selected USB roots; no blanket security bypass.
5. Native messaging explicit Chrome extension IDs retained across regeneration, including production ID.
6. MP3 and large media streaming candidate; preserve working small MP4 and distinguish unsupported codecs/old worker.
7. Original mascot right-click doesn't hide it or break normal drop actions.
8. **Reveal/GO TO:** default inside Chutey at containing folder/file selected; preserve and repair existing Windows Reveal as Settings alternative. **Open:** default inside Chutey; system default-app option in Settings. Preview remains separate.

## Protected baseline and acceptance reporting
- Preserve installed `Chute.exe` SHA-256 `C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`, historical release/tag/archive, native host/registrations, saved images/history, production Chrome profile and existing extension.
- Source edits, regression tests and documentation only in the Development 1 branch. Do not replace installed worker, delete logs/data or modify production profile as a shortcut. No new mascot aesthetic, always-on-top window, folder Assign or other Development 2 work.
- Deliver exact root causes **confirmed vs hypotheses**, changed files, test commands/results, any skips, runtime/resource measurements, commit SHA and pushed branch, Windows isolated-test instructions and clear outstanding owner test checklist.
- Explain exactly what cannot be safely validated on cloud/Linux.
- **Final line in your report:** `DEVELOPMENT 1 CANDIDATE READY FOR OWNER WINDOWS TESTING — STOPPED. DEVELOPMENT 2 NOT AUTHORIZED.`
- Once handed over, **stop completely**. Never interpret "finished," "passed," or "validated" from your own tests as permission to start the next branch.
