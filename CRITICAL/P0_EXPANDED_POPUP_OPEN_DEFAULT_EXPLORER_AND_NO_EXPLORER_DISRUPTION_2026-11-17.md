# CRITICAL P0 — Expanded Chutey popup "Open" must use the user's file explorer; stop disrupting Explorer

**Reported:** 2026-11-17  
**Repository:** `thanks-cohn/chute`  
**Priority:** **P0 critical UX / interoperability regression (owner-classified)**  
**Status:** Owner-reported, **not yet independently reproduced or fixed**. No production code changed.

## Direct owner request

> "the open button [in] the expanded [popup] of Chutey should lead to the default file explorer of the user ... Chutey seems to kick people out of the file explorer all the time ... this needs to change!"

This is **not experimental**. It is a correctness requirement for the current expanded Chutey popup / Shelf: clicking **Open** when the control means "open/reveal this saved item in an explorer" must hand off to the user's **normal system file-explorer experience**, rather than diverting into Chutey's embedded Explorer or unexpectedly dismissing/disrupting their file browsing.

The owner also reports recurring unwanted exits/disruption from File Explorer while using Chutey. The precise meaning/cause (external Windows Explorer closing, Chrome extension Shelf losing focus, Chutey internal Explorer navigating away, an unexpectedly launched alternate viewer, etc.) is **not confirmed**. Reproduce and distinguish these behaviors before deciding on a fix.

## Required UX

1. **Expanded popup — Open / Open in Explorer.** For an item with a verified local saved-file path, route the explorer-specific action to the user's configured/default file manager **where safely supported**. On Windows, use the appropriate native shell folder/reveal integration (typically File Explorer), opening the containing directory and preferably selecting the item, without enrolling a new root or changing app defaults. If Windows/another file-manager preference cannot be reliably discovered, be explicit and use a safe OS-standard fallback; don't falsely promise arbitrary third-party file-manager support.
2. **No forced Chutey internal Explorer.** The user's ordinary file explorer takes precedence by default. If Chutey's own Explorer remains an option, it must be an **explicit user-selected alternative**, not a surprise override. Respect any recorded explicit choice, but do not treat an old implicit default as genuine consent.
3. **Keep semantics distinct.** `Open in Explorer` reveals/navigates to the saved item in a file manager; `Open file` (if separately provided) launches the OS-associated application for a safe, permitted file type. Rename an ambiguous `Open` control if needed so the action is predictable. `Reveal / GO TO` must not unexpectedly launch the embedded Explorer.
4. **Do not kick users out.** An explorer window must remain open and usable; Chutey must never close/restart/steal a user's file-manager instance or replace the Windows desktop shell as a side effect of opening/revealing a file. If the reported problem is Chutey's *own* Explorer leaving its current view, preserve path, scroll, selection and browsing state across preview/popout/return. Do not navigate the main Shelf away without deliberate intent.
5. **No repeated permissions.** For a saved file already managed by Chutey, do not repeatedly force folder-selection or a new root approval solely to locate/reveal it. Access must remain limited to verified saved entries or explicitly authorized roots; browser input must not directly supply arbitrary paths to the native worker.
6. **Graceful failures.** Missing file, disconnected native companion, revoked permissions, unavailable external file manager, stopped `explorer.exe`, or unsupported platform should yield an accurate explanation and recovery action. Never claim an external window opened unless the launch is actually acknowledged; don't restart `explorer.exe` or change file-manager defaults silently.

## Investigation checklist (no assumed root cause)

- Pin exact installed Chrome extension + Windows worker build/version/hash. Reproduce the **expanded popup** Open click and capture *actual* resulting window, target path, focus/active window, and sequence.
- Trace popup markup/event handler through extension bridge, native messaging, native `open`/`reveal` implementation and Windows shell integration. Inspect the existing implicit `chuteyOpenTarget` / `chuteyRevealTarget` routing logic cited in [issue #20](https://github.com/thanks-cohn/chute/issues/20), but do not assume the installed pair matches that revision.
- Determine precisely what "kicks people out" means: Windows File Explorer process/window closing; Explorer focus/minimize; Chutey Shelf auto-closing on focus loss (normal Chrome action-popup lifecycle); unexpected route change/reset inside embedded Chutey Explorer; or forced reauthorization. Instrument each separately.
- Verify Windows file manager behavior for existing windows, fresh opens, folders vs files, spaces/Unicode paths, renamed/moved files, network/symlink boundaries and multiple simultaneous Chrome windows/profiles.
- Keep safety rules: never use untrusted browser-provided executable paths, launch arbitrary scripts/programs or bypass OS file associations/security permissions.

## Acceptance — critical fix

- Click **Open / Open in Explorer** on an expanded popup saved item: ordinary default/system file explorer opens the right containing folder (ideally with item selected); Chutey's internal Explorer does not hijack it.
- Chutey does **not** close or evict the user from an existing file-manager window. Existing Explorer window and Chutey browsing state remain intact.
- An intentional **Open file** action remains separate, predictable and safely scoped.
- Repeated actions, worker asleep/offline, missing file and explicit internal-Explorer preference all have stable behavior without loops or unexpected folder prompts.
- No regression to Chutey History, saved file identities, existing permissions, image previews, worker lifetime, or baseline Windows+Chrome pair. Automated routing tests **and** real Windows desktop acceptance required before closing.

## Related / precedence

- [Issue #20 — existing Open / Reveal fallback](https://github.com/thanks-cohn/chute/issues/20): related but this P0 additionally covers the **expanded popup Open control** and **Explorer eviction/disruption**.
- [Earlier P0 native Windows folder picker regression](P0_NATIVE_WINDOWS_FOLDER_PICKER_REGRESSION_2026-11-04.md): separate "Select folder" UX, not an excuse to replace the file manager.
- **This P0 takes priority over future Experimental Explorer proposals.** No speculative New Tab/shell changes are authorized.
