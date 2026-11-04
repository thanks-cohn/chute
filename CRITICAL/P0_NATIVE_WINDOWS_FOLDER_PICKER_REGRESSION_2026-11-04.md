# CRITICAL P0 — CHUTE folder selection must open the ordinary Windows File Explorer folder picker

**Date:** 2026-11-04  
**Repository:** `thanks-cohn/chute`  
**Severity:** P0 — immediate trust/usability regression  
**Status:** Owner-reported; exact installed Windows screen and trigger path still require reproduction. **Do not declare fixed without real Windows evidence.**

## Owner report (preserve the intent)

> “Ew, I wanted it to just open the fucking search file explorer. This is awful. It feels so virusy. This is an awful regression.”

The owner's expected interaction when choosing a local folder is **the familiar, trusted Windows File Explorer Browse / Select Folder dialog**. It should feel like normal Windows software, be immediate, let them navigate/search folders using standard OS controls, and return the chosen directory to CHUTE.

**Absolutely no custom suspicious-feeling intermediary:** no standalone mystery helper window, confusing authorization wizard, terminal/console flash, installer appearance, browser redirect, unrecognizable pseudo-explorer, multiple unexpected popups or repeated system prompts simply to pick a folder. If an OS-native consent step is genuinely essential, it should be clear, minimal, user-initiated and tied to the single requested operation.

This report follows a newly published matched Windows/Chrome TEST build `chute-test-20261104-0529-CST` based on commit `b0727d56f89484d110fe7b1d24e12ba9bf476611`. Investigate the behavior on that exact installed pair before attributing causality. The publisher did not independently observe the owner's Windows screen.

## Unambiguous acceptance UX

1. User clicks **Select Folder**, **Browse**, or its intended native-folder-opening affordance.
2. **Immediately present the normal Windows folder picker** with standard folder navigation/search (e.g. modern Common Item Dialog `IFileOpenDialog` with `FOS_PICKFOLDERS`; only adopt after Windows verification). It must be foreground and owned by the appropriate app window, not hidden behind Shelf/Chrome.
3. User picks folder and confirms. CHUTE resumes browsing in the existing Shelf Explorer, not a separate fake-looking Explorer application/window.
4. **Cancel** closes the picker cleanly and leaves prior folder access intact.
5. If a folder has already been approved and remains valid, reopening CHUTE **does not open a picker at all**. It resumes the last visited folder automatically; ask only when selecting *another* root or legitimately renewing invalid consent.
6. The native host and local Windows companion can wake in the background if needed, but must not show launch consoles, installation prompts, duplicate modal windows or permission scare screens.
7. Error/offline states are succinct, recognizable, actionable and remain inside the CHUTE Shelf, never a modal loop.

## Root-cause audit required

- Reproduce in actual Windows + Chrome with the released paired build and record the **exact window title, owning executable/process, screenshot, process startup timeline, and user gesture sequence**. Distinguish whether the owner clicked the CHUTE EXE/installer, **Select Folder**, extension toolbar icon, or in-Shelf browse command. Do not guess.
- Audit `src/chute/explorer/native.py::choose_folder` (currently Tkinter `filedialog.askdirectory`), `NativeExplorer.action`, `src/chute/native_host.py`, `extension/explorer-api.js`, `extension/explorer-view.js`, extension startup and Windows packaging/entrypoints.
- Determine whether the offending UI comes from Tkinter, native-host bootstrap, a custom app shell, a permission dialogue, Windows SmartScreen/UAC or the installed EXE launcher. Each requires a different solution. Do not bypass security warnings or suppress genuine Windows security protections.
- Measure click-to-visible-folder-picker latency, cold/warm companion startup, UI focus/foreground, multiple clicks, cancel, restart and offline conditions.
- Use modern genuine Windows folder picker with reliable owner/STA threading, no duplicate instances and no external-looking imitation. Ensure search/navigation is available through OS facilities.
- Ensure **persistent, protected permissioned root** logic never silently grants arbitrary new folder access; choosing a folder is still a user gesture.
- Regression test pop-out/Shelf visibility, explorer focus, read-only and write-grant boundaries, cleanup on cancel, and default no-prompt reopen. Keep REDOWN interop and old CHUTE drag flows unaffected.

## Stop-ship bar

**A tester must recognize the picker instantly as Windows' own standard folder-selection UI**, reach a folder using its normal navigation/search, and return seamlessly to CHUTE without mysterious windows. Repeated opening must be fast and reliable. Prior authorization should restore without re-picking.

Provide an implementation PR with a matched Windows companion + Chrome extension TEST package, redacted screenshots, real on-Windows acceptance receipt, before/after timings, and exact install/rollback instructions. Mark P0 until proven.

## Related

- `bugs/CHUTEY_WINDOWS_EXPLORER_SELECT_FOLDER_NATIVE_ACTION_MISMATCH_2026-11-04.md`
- `In_Progress/CODEX_P0_PERSISTENT_PERMISSIONED_EXPLORER_DRAG_DROP_REDOWNS_BRIDGE_2026-11-04.md`
- `docs/explorer/PERSISTENT_TRANSFERS_TEST.md`
- [Reported paired release](https://github.com/thanks-cohn/chute/releases/tag/chute-test-20261104-0529-CST)
