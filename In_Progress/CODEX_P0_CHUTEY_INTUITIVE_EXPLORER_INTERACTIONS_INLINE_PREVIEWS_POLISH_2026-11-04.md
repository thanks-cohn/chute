# CODEX P0 — CHUTEY: stop repeated folder prompts, intuitive Explorer, Copy/Paste, inline previews & professional polish

**Repository:** `thanks-cohn/chute`  
**Date:** 2026-11-04  
**Priority:** P0 stop recurring native folder picker and stabilize Windows pairing; P0 basic UX/selection/preview; P1 cross-application/premium bulk.  
**Execution:** From latest main, inspect concurrent branches/PRs, implement in a focused `codex/chutey-intuitive-explorer-ux-2026-11-04` branch (suffix if occupied), provide a reviewable PR and **matched** Windows EXE + Chrome extension TEST artifacts. **Do not auto-merge, deploy or publish a release.**
**Owner's directive:** “Simple. Intuitive. Functional.” **The user must NEVER struggle with drag-and-drop.** Match the dependable, familiar feel of normal Windows Explorer and standard file drag-and-drop: one natural gesture, obvious feedback, dependable completion or a clear truthful reason why a destination cannot accept it. This is an **implementation request**, not a request to create another plan. Do not rebuild existing engines.

## 0. FIRST: Diagnose and stop recurrent directory-picker / reconnect prompts BEFORE all cosmetic work (P0)

**Owner report after installing the matched TEST release:** A small directory-selector window bearing the `Chute.exe` icon repeatedly appears, accompanied by recurring folder selection/reconnect messaging. This feels like malware and blocks normal use. The owner does **not** want a recurring authentication ceremony for browsing local files. **Stop pestering the user.**

Expected behavior:
1. A real first-time Windows folder selection is explicit, user-initiated, familiar and quick. Use the standard modern Windows picker where feasible (searchable native `IFileOpenDialog(FOS_PICKFOLDERS)`), not an odd-looking legacy dialog or helper-window cascade.
2. After the user approves one folder, persist the **scoped protected per-user authorization** and last browsed subfolder. On Shelf/pop-out reopens, worker wake, service restarts, session TTL renewals and Chrome restarts, **resume silently**. **No popup** while an existing grant remains valid.
3. Don't implement a timer to reprompt **once per day**: the user says “once a day AT MOST,” not “ask daily.” Ideally ask once per explicit folder grant, with no expiry-based user prompts. If Windows/security invalidates the grant or the user revokes it, recover clearly with **one** intentional, contextual gesture. Never silently bypass consent or elevate read access to write.
4. Avoid repeated “Reconnect” and “Select folder” warnings for transient bridge startup, 15-minute session token renewal, losing process-local in-memory state, or a temporary service-worker race. Handle transient errors with bounded silent retry, then a stable inline error/retry action in Settings—not repeated Windows dialog.
5. If the picker was cancelled, **preserve prior authorized grant and last folder**. No cascading “select again” loop.
6. Only the explicit `Browse`/“Choose folder” button or a genuinely required, clearly communicated permission decision may invoke the native picker; make accidental invocation impossible.
7. If the EXE itself opens UI on launch, analyze separately from an Explorer selection gesture. Record the owning process/window class/title and exact trigger; do not guess.

**Existing code findings to verify against latest commits:**
- `extension/explorer-view.js` currently calls `api.nativeSession(false)` on initialization and has explicit `select`, `write`, `resume` actions. Initialization *should* request `explorer_resume`, not picker. Yet the real-world repeated dialog is owner-reported—trace all callers/automatic retries, companion lifetimes and packaging.
- `extension/explorer-api.js` maps `nativeSession(false)` → `explorer_resume`; `nativeSession(true)` → `explorer_select_folder` or `explorer_select_write_folder`. Token renewal should not need any picker.
- `src/chute/explorer/native.py` `NativeExplorer.action` restores protected `GrantStore` when available and uses `choose_folder` only for explicit `select`; `choose_folder` currently uses **legacy `SHBrowseForFolderW`**, title “Remember approval…”/“Allow… READ AND WRITE”; audit this actual UI and whether it appears unexpectedly. A successful `GrantStore` restore must truly survive process restart and origin/enrollment changes. Test stale roots and app upgrades.
- `src/chute/native_host.py` calls `ensure_bridge()`, then routes resume/select. Its catch-all error emits “Select a folder using the matching Chutey companion. Selection may have been cancelled.” **This message is misleading when `explorer_resume` failed**. Preserve specific actionable error categories, do not imply missing approval when bridge startup failed.
- `extension/explorer-api.js` exposes fallback error “Select a folder using the matching Windows companion.” Distinguish missing permission, outdated pairing, host unavailable and resume errors; no recurrent prompts for any of these.
- Existing critical doc: `CRITICAL/P0_NATIVE_WINDOWS_FOLDER_PICKER_REGRESSION_2026-11-04.md`.

**Mandatory root cause report**: reproduce with owner-reported released pair `chute-test-20261104-0529-CST` at source `b0727d56f89484d110fe7b1d24e12ba9bf476611`; compare to latest main. Gather redacted window screenshot, user steps, request sequence, native action names, state of grant store, process restart timeline, error code and exact reason picker was invoked. Do not log secrets or private folder paths. If couldn't reproduce, state that and instrument a bounded trace; **do not claim fixed on code inspection alone**.

**P0 tests**: first consent, open Shelf 20x, close/reopen popup 20x, new Chrome tab, browser restart, EXE quit/restart, companion autostart, 15-minute session expiry renewal, sleeping/waking Windows, outdated matched pair, cancelled picker, revoked grant, genuinely moved/inaccessible folder, fresh profile. For valid consent expect **ZERO spontaneous picker dialogs**, zero repeated “reconnect” prompts and last-folder restoration. Hard gate on P0 before polishing.

## 1. Put ordinary UX first; remove engineer dashboard clutter

Main Explorer: streamlined **Browse**, back/forward/up, breadcrumbs, search/sort, file/tree panes and grid/list when needed. “Approve writes”, “Copy to Live”, “Check last copy”, “Revoke access”, reconnect/diagnostics and cryptic implementation commands **do not belong in top toolbar or ordinary context menu**. Organize advanced **Folder Access**, **Permissions** and **Troubleshooting** once in Settings; show contextual, understandable consent if a real write needs new authorization, not a constant banner.

**Keep Copy/Paste on right-click menus and keyboard—not in Settings.** Avoid duplicating History inside Settings. Present brief human-readable errors; retain diagnostics and explicit revoke controls discoverably in Settings.

## 2. Native-feeling folder / file splitter

Left folder tree and right file-list separated by **resizable middle vertical wall**. Hover shows col-resize cursor, click/drag continuously changes relative widths, both panes remain useful, long names scroll independently, arrow-key splitter accessibility, ratio persists without storing paths or secrets. Reinspect the recently pushed `extension/explorer-view.js` + `extension/explorer-view.css` implementation and test *real Chrome*, including narrow Shelf, large pop-out, zoom and long directory names. A code-defined splitter is not sufficient if pointer capture or layout fails.

## 3. File selection and keyboard contract

- Hover = subtle visual response only.
- **Single left-click = select ONLY**, no preview, no navigation, no copy.
- **Double-click file = expand inline preview**, double-click folder = enter directory.
- **Ctrl+click** toggles independent files; **Shift+click** selects continuous range with a stable anchor; **Ctrl+A** selects all eligible currently loaded files (truthfully communicate partial pagination). Right-click a file already in selection **preserves all selected files**; right-click unselected file selects only it. Click empty area clears as expected.
- Selection navigation with **Up/Down arrows** after focusing/selecting a card; move selection and focus predictably, scroll it into view. **If inline preview is CLOSED, arrows change only selection and must not open preview. If preview is OPEN, arrows change selected file AND update the existing inline preview to that new file automatically, with no extra click.** The expanded preview follows the selected card/row, pushing content after it. On non-previewable file, show sensible unsupported state without closing selection or mislabeling image bytes. Grid arrow navigation should move geometrically (up/down row by column count), list by adjacent row. Handle first/last file, wrap/no-wrap rule consistently, pending async renders, focus returning from preview, and Shift+Up/Down range extension without opening a closed preview.
- Enter explicitly opens preview; Escape closes; keyboard navigation must not hijack typing into search, filename editing or settings.
- Keep selected count subtle and readable. Free maintains normal selection mechanics and one-file operations; Premium gates **bulk actions/throughput**, not Ctrl/Shift functionality itself.

## 4. Non-negotiable: Drag-and-drop must be STANDARD, DEPENDABLE and EFFORTLESS (P0)

**Owner's acceptance standard: “The user should NEVER struggle with drag and drop.”** Drag-and-drop is CHUTE's core interaction, not an optional flourish. A user should be able to bring any supported item from a CHUTE card to a supported destination **in the same instinctive way they drag a file from Windows Explorer**, every time. The user should not need to learn Chutey internals, retry mysterious failures, wait for a hidden pre-copy, or distinguish extension panels from the native companion.

### Exact gesture contract

1. **Hover:** only subtly highlight the card and show it can be dragged.
2. **Press and hold anywhere on the card/row:** preserve selected items; do NOT preview, navigate, modify selection unexpectedly, or activate another button.
3. **Move beyond a conventional movement threshold:** begin real drag **on the FIRST attempt** with a visible thumbnail/ghost, copy cursor and selected-item count when multiple files are selected. No icon-only hitbox, hidden first-stage “Copy to Live”, second drag, extra modifier, or copy-before-drag prerequisite.
4. **Cross a panel/window boundary:** continue the gesture without losing drag state, selection, bytes, focus or intended destination. No interfering custom overlay, swallowed pointer, preview, ghost thumbnail blocking pointer events, or stuck drag after leaving the Shelf.
5. **Hover a valid target:** show a calm, obvious eligible drop state. For unsupported target, indicate that before release where possible; never misleadingly show a green success state.
6. **Release once:** the receiver gets the original requested bytes, filename, extension and MIME where supported; verified result appears only after the destination confirms it. Default to copy/KEEP BOTH, never silently move/delete the source.
7. **Cancel or fail:** Escape/cancel/invalid drop leaves the original untouched, resets ghost/hover/selection state cleanly and permits another drag immediately. Provide a short, useful explanation without technical codes or alarming dialogs.

### Implementation: repair the existing pipeline, do not hide defects

- Reuse the existing Python permissioned Explorer engine, CHUTE Live basket, `drag-relay.js`, `content.js`, `direct-drop-google-yandex.js`, `drop-lifecycle.js`, and native bridge. Audit dragstart/dragenter/dragover/drop/dragend/pointer lifecycle and timing across popup, Shelf and real website. Resolve first-drag rejection and “copy to Live, then drag again” behavior at its origin; do not merely relabel it or add an alternate top-level command.
- **Eliminate race conditions:** expired native token, cold companion, service worker suspension, thumbnail fetch, asynchronous source export, extension popup closure, receiver registration and document focus must not cause silent first-attempt failure. Prepare permitted transfer capability or cached source before it is needed without pre-copying files into Live or leaking content, and ensure bounded legitimate recovery. Never fake a native/OS drag carrying real local files if Chrome disallows it.
- **Do not promise impossible universal behavior:** browser and website security may prevent native cross-window file drops or programmatic file injection. Identify those boundaries explicitly via real testing. Preserve ordinary drag for real supported targets; offer the simplest honest, user-initiated alternative (e.g. Copy/Paste with real bytes where supported or file-picker handoff) for unsupported ones. Do not brand fallback as successful drag.
- Selection must work naturally for **one** file, selected multiple files (Premium bulk transfer only), long filenames, thumbnail and non-thumbnail rows, grids and list layouts. Dragging a selected file drags the selected group; dragging an unselected item uses the familiar Windows-style selection behavior.
- Performance and feedback: no perceptible “dead first drag,” phantom upload, retry button required for ordinary supported drag, spurious double-open, card teleport, hover flicker, popup overlay or long silent stall. Progress is unobtrusive for larger transfers. Source metadata/provenance stays local except bytes + minimal necessary receiver metadata.
- **Do not weaken permissions** to make drag feel fast: an unapproved local destination may require one contextual explicit authorization; browsing alone must not start recurrent folder prompts.

### P0 drag/drop acceptance matrix (demonstrate rather than assert)

Test with real installed matched Windows EXE + Chrome extension, including **fresh install and after restart**, on at least:
- Local Explorer → Chutey Live, Live → authorized Explorer, Explorer → permitted Explorer folder, website → authorized Explorer, and selected multi-file batch when Premium is legitimately enabled.
- Existing browser flows: CHUTE Live/Explorer → ChatGPT attachment surface, Google/Lens and Yandex **only where the sites actually accept real files**, plus REDOWN after its own secure adapter is implemented.
- First drag immediately after Shelf opens, cold native worker, warm worker, service-worker suspension/resumption, tab switch, narrow Shelf, Chrome popup closure constraints, 125%/150% browser zoom, and prolonged session.
- Single left-click then drag, direct mouse-down+drag, Ctrl/Shift multi-select then drag, interrupted drag, Escape, invalid destination, cancelled consent, slow large file, rapid repeated drags, and source missing mid-transfer.
- Show timestamps/metrics **pointerdown → dragstart → target dragover → drop → verified receiver receipt**, plus a small redacted screen recording or equivalent actual-user interaction evidence. Measure first-attempt supported drop success across repeated runs; report **counts and failures**, not invented percentages.
- **Pass/fail: for a supported destination and valid permission, the first natural drag gesture works and the correct file is delivered.** A successful second attempt after a failed first attempt is a failure. A visually responsive ghost without delivered bytes is a failure. Cross-browser unsupported flows must be clearly documented, not claimed complete.

## 5. Proper context menu: Copy & Paste are mandatory

Replace nonsensical developer menus with familiar **Copy**, **Paste**, Open/Preview, Rename and Properties where genuinely supported. Disable impossible actions truthfully instead of showing internal “native consent required” entries.

- **Ctrl+C** and right-click **Copy** work with the full selection, respecting Premium bulk entitlement and retaining source file bytes.
- **Ctrl+V** and right-click **Paste** place files into exact current/targeted folder with scoped permission, collision-safe **KEEP BOTH** default, provider/local confirmed receipts. No preview opening as side effect.
- Clipboard functionality should be aligned with real user clipboard behavior. Distinguish internal CHUTE transfer intent from genuine OS file clipboard. Explore safe Windows native clipboard handoff with real file payloads and verified browser/site compatibility; arbitrary sites (ChatGPT, Yandex, Google/Lens) may not accept synthetic paste or multiple image files. Explicitly test each; do not claim universal cross-app Ctrl+V before demonstrated.
- Target interop with ChatGPT, Yandex, Google/Lens and REDOWN. CHUTE owns local grants; REDOWN owns cloud auth/provider adapters; respect security boundaries. No browsing provenance sent to providers, no background clipboard surveillance and no downloads to an arbitrary folder.
- Multi-file select, copy and paste = Premium convenience, with a useful Free one-file path. Do not invent subscription/billing authority or imply UI-only flags are secure.
- Existing transfer Codex brief to build upon rather than duplicate: `In_Progress/CODEX_CONNECT_EXISTING_DRAG_DROP_TO_EXPLORER_GOOGLE_YANDEX_CHATGPT_BIDIRECTIONAL_2026-11-04.md` and `In_Progress/CODEX_P0_PERSISTENT_PERMISSIONED_EXPLORER_DRAG_DROP_REDOWNS_BRIDGE_2026-11-04.md`.

## 6. Two different inline preview surfaces; no top-of-list teleportation

**A. Local File Explorer:** SINGLE click selects. DOUBLE click expands preview immediately **under the selected card** (list) or **directly below the grid row containing it** (grid), in real document flow. All following cards shift DOWN. Arrow keys with preview open update content and reposition preview beneath newly selected row automatically. Arrow keys with preview closed navigate selection only. Closing restores layout. No fixed bottom overlay, pop-up obscuring other files or top viewer. No jumps on async file decode, narrow widths, or quick selection changes.

**B. Shelf History / popup History cards:** Clicking a saved History image card should expand the image **right beneath the clicked card**, pushing all later History cards down. In grid, expansion goes after the clicked grid row and spans available width. **Do not insert preview above History cards or beneath calendar** as currently done by `extension/shelf-gallery-preview.js` (currently `gallery.querySelector("#files")?.before(viewer)`). This differs intentionally from local Explorer two-click preview. Preserve popup lightbox only on explicit separate action, History pagination, 4x4–6x5 gallery densities, card selection, cross-Shelf interactions, non-overlap, object URL cleanup and stale request cancellation.

## 7. Exact labels and branding

- In History, change **“Drag original” → “DRAG ME!”** for actual draggable saved files; preserve truthful behavior for archived/URL-only entries. Keep capitalization and exclamation.
- Under **Chutey** title, subtitle **“Your Everything”** instead of **“Pick up. Drop anywhere.”**, in popup and Shelf branding where rendered. Avoid excessive duplicate headings.
- Keep Chrome right-click action **“Feed Chutey!”**, not “Send to Chute”.

## 8. Visual polish / padding / spacing / organization — deliverable, not optional

Elevate the existing functional UI to a **decent professional, uniform, elegant, presentable** standard. Audit every screen state and fix:
- uneven or excessive padding, inconsistent spacing between headings/cards/buttons, broken alignment/vertical centering, inconsistent corner radii/borders/typography/line heights, cramped tree width, duplicated separators, icon inconsistency, text truncation without accessible full names, clipping, overlapped pop-out/Shelf, inconsistent selected/hover/focus states.
- Create restrained spacing tokens (e.g., 4/8/12/16/24 px as appropriate); coherent information hierarchy with enough breathing room, not a sterile giant toolbar or enormous Settings panel.
- Appropriate usable hit targets and keyboard focus treatment, legible contrast, restrained transitions, reduced-motion support; consistent appearance at 390px Chrome popup, narrow/wide Shelf, 125%/150% zoom, long filenames, zero/one/many files, loading/failure/empty states, grid/list and 4×4 through 6×5.
- Preserve existing Chutey personality; do not obscure core functionality with animations. All styling follows stable behavior. No meaningless controls or extra screens.

## 9. Implementation audit and acceptance evidence

Audit existing `extension/explorer-view.js`, `extension/explorer-view.css`, `extension/explorer-api.js`, `extension/shelf.js`, `extension/shelf-gallery-preview.js`, `extension/popup-gallery.js`, native Python Explorer, native-host bridge, popup/shelf CSS and JS, drag integration and existing regression scripts. Avoid rewriting tested core APIs or refactoring unrelated code.

Required automated + **real Windows/Chrome interactive** tests:
1. **First**: previous approved folder resumes across restarts with zero spontaneous pickers, no daily reconnection ritual, and only explicit Browse invokes picker; reproduce/report exact original dialog/error cause.
2. Click selects, double-click previews, Up/Down changes selection, open preview tracks keyboard selection, closed preview stays closed; Shift/Ctrl/arrow selection, Ctrl+A and right-click selection preservation.
3. Context Copy/Paste and Ctrl+C/V with real bytes, single and Premium bulk, destination-specific limits and honest receipts.
4. **Critical gate:** first-gesture, real-byte drag/drop succeeds reliably on each actually supported target across cold/warm/restarted Windows+Chrome conditions; test single and entitled multi-select, drop across panel/window boundaries, unsupported sites, cancellation, recovery and verified receipts. Record per-scenario first-attempt success counts and failure causes. No pre-copy, second attempt, fake success or stuck ghost.
5. Inline preview appears beneath clicked file or History card, following cards push down and grid rows don't overlap.
6. Divider drag/keyboard resizing, persistence and independent scrolling.
7. Branding “Your Everything”, History “DRAG ME!”, Chrome “Feed Chutey!”.
8. UI screenshots/measurements at multiple viewport sizes, visual spacing/alignment/padding consistency.
9. Preserve history calendar/pagination, pop-out, native owner-grants, verified transfers, no unauthorized writes and existing worker boot regression tests.

Deliver: focused implementation PR; concise root-cause report of repeated picker, actual before/after screenshots, test list, known limitations, locally verifiable receipts, SHA-pinned paired Windows EXE+Chrome artifacts with install and rollback steps. **No self-declared success based solely on CI; actual Windows interaction verification is mandatory.**

## 10. Execution order

1. STOP repeated folder picker/reconnect annoyance and prove root cause.
2. Make selection, keyboard arrows, preview behavior and native Copy/Paste correct.
3. Treat dependable first-gesture drag/drop as a P0 stop-ship gate: diagnose and repair event/bridge races, run the Windows/Chrome matrix, then validate entitled bulk and external destinations.
4. Finish per-card inline preview, resizable tree divider and History labels/branding.
5. Professional spacing/padding/aesthetic QA and regression sweep.
6. Hand back evidence-backed PR + paired test artifacts for user approval. **Do not merge automatically.**

**The core principle:** An unfamiliar person should recognize how to select, browse, preview, copy, paste and drag immediately, with no understanding of permissions, sessions, endpoints, transport adapters or backend recovery mechanics.

## ADDENDUM — Owner's final drag-and-drop standard (binding, 2026-11-04)

> **“Drag and drop must always be dependable and just as standardized as regular drag and droppers. The user should NEVER struggle with drag and drop.”**

Codex must design every implementation choice and acceptance test around this promise. The intuitive mental model is **hover → click/hold → drag → drop → file actually arrives**. If any supported workflow forces a second attempt, an unexplained Copy-to-Live intermediary, guessing where to drop, or wondering whether a save actually happened, **that workflow is not finished**. This standard overrides shortcuts that merely make the UI look interactive. Confirm with real Windows user-gesture testing, provider/target-specific evidence and truthful constraints; do not ship deceptive fake parity for destinations the browser cannot support.


## ADDENDUM — P0: ONE native Windows folder-picker, absolutely NO Python/debug/installer-looking popup (2026-11-04)

**Owner's observed regression:** Choosing a location appears to launch an additional Python or debug-looking `Chutey.exe`/helper window, displaying a little installer-style icon on the Windows taskbar/Start interface. This is confusing, alarming, and unacceptable. The user wants **one single standard Windows File Explorer folder-selection dialog** after an intentional Browse/Choose Folder action—nothing else. The owner does **not** consent to a second visible helper, console, debug window or separate faux-folder explorer.

### Required exact user experience

1. **User explicitly chooses Browse/Choose Folder in CHUTE.** Open only the recognizable Windows Shell folder picker—prefer modern native `IFileOpenDialog` with `FOS_PICKFOLDERS`, search/navigation, expected Windows look and correct owner/focus behavior. Return the selected directory to the already-open CHUTE Explorer.
2. **NO extra visible Python/Chutey helper process window**, console, black command prompt, debug UI, separate window, “setup/installer” shell, surprise app icon or extra taskbar/window switcher entry. The user should see CHUTE plus the **single requested standard OS picker**—not an additional app launch.
3. Native companion, Python backend, native-messaging bridge and process startup may continue **quietly in the background** when required. Do not remove or break them; make the packaging/startup mode genuinely non-console and non-UI where appropriate. Do not use stealth techniques, security bypasses or interfere with genuine Windows security prompts.
4. **Never create a new Start Menu entry/desktop shortcut during folder selection.** Existing explicitly installed app shortcuts are separate from picker UI; audit whether the reported “little install icon” is an actual taskbar window/button, startup notification, an installer invocation, or a Start Menu entry. Avoid pretending they are the same without evidence.
5. Valid prior authorization must resume silently, across extension reopen, Python companion restart and Windows login; **no picker unless the user actively selects a different folder or must genuinely reauthorize an invalid/revoked grant**. No repeating once a day, every few minutes, on token refresh, or on navigation.
6. On cancel, return silently to the existing Explorer and preserve the last approved folder. No repeating popups, broken Shelf, or browser tab redirects.

### Diagnose the executable/window, rather than only hiding an icon

Before changing code, capture redacted process name/path/build SHA, parent-child tree, window class/title, taskbar/window-switcher behavior, OS dialog modality, Chrome message action and actual trigger sequence using the installed matching pair. Distinguish **`Chute.exe` installer/launcher**, installed companion **`Chute-NativeHost.exe`**, a Python console host, legacy **`SHBrowseForFolderW`**, and genuine Windows security UI. Identify which one the owner sees; don't merely hide a real permission/security warning or rename an EXE.

Inspect Windows packaging/PyInstaller boot mode, `scripts/build-windows.ps1`, `src/chute/native_host.py`, `src/chute/explorer/native.py::choose_folder`, Chrome `explorer_resume` and explicit `explorer_select_folder` dispatch, process wake, window ownership and single-instance handling. Ensure COM/apartment/threading and foreground focus for a proper dialog. Do not trigger the app's installer each time a directory is selected.

### Stop-ship acceptance tests

- On Windows 11, after explicit Browse, **exactly one expected OS folder-selection dialog**, no extra visible Python/debug/Chute window and no new taskbar/Start Menu icon/shortcut due to the picker.
- Browse, search, choose, cancel, rapidly repeat and switch windows; picker stays correctly modal/foreground, without duplicate windows or orphaned processes.
- With a valid saved grant, **20 Shelf reopens, popup reopens, companion restarts and token refreshes produce zero spontaneous pickers and zero visible helper windows**.
- Report before/after short screen recordings or screenshots **including the Windows taskbar**, actual window/process evidence and paired Windows/Chrome build verification. No “fixed” claim without observing it on the installed Windows system.

**Priority:** Execute alongside section 0 (recurrent picker), **before** aesthetic changes or transfer features. This addendum overrides any interpretation that merely reducing prompts while keeping a visible extra Python/debug window is acceptable.
