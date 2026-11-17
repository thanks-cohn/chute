# CODEX REQUEST 2 OF 2 — DEVELOPMENT 2: PORTABLE STICKY MASCOT FILE EXPLORER
Date: 2026-11-16
Repository: `thanks-cohn/chute`
**STATUS: DRAFT/HELD. NOT AUTHORIZED FOR EXECUTION.**

> **HARD START GATE:** This document is a future request, **not permission to do anything now**. Codex must not create, fetch/checkout as a working branch, or implement `codex/2026-11-16-sticky-mascot` merely because this file exists, because Development 1 CI is green, or because the assistant produced a summary. Only begin after the USER PERSONALLY tests Development 1 on their Windows computer and gives a **new, explicit approval** to commence Development 2. That future instruction must name or clearly authorize Development 2. Until then, do nothing described below. Do not proactively create the branch.

## When—and only when—the owner expressly authorizes this phase
1. Confirm the owner has approved the latest **actual Windows-tested** Development 1 commit, and record that exact SHA. If there were further repairs after the original candidate, use the FINAL accepted SHA, not `f5cefb5`, `f059cb8`, the checkpoint tag, `main`, or the old Phase 1 source branch.
2. Then create `codex/2026-11-16-sticky-mascot` **directly from the owner's approved Development 1 SHA**. All approved repairs are inherited unchanged.
3. Read `experimental/CHUTEY-MASCOT-STICKY-EXPLORER-CHANGES-2026-11-16.md` for owner's detailed scope. Use this file as the exclusive phase-2 execution brief. The assistant-only incomplete-items document is not authorization to add features.
4. Preserve original installed Windows worker, extension, data and authorized native bridge. Prototype isolated native Windows window separately.

## EXACT USER-REQUESTED MASCOT FEATURES (existing mascot only)
### 1. Modular right-click menu
- Extend the **existing Chutey mascot**; do not replace/repaint its art.
- Give it a **separate, reusable right-click menu module**: **brownish background**, **yellow notepad-like menu cards**, **black text with subtle bluish outline/accent**. Not metallic gold.
- Initial state-appropriate actions: **Expand**, **Assign**, **Pick Me Up**, then **Drop Off** while carrying. A right click must not hide the mascot. Do not invent more actions.

### 2. Expand = persistent native, ALWAYS-ON-TOP Windows File Explorer
- **Expand** opens/activates one window showing the actual File Explorer, gallery, lightbox, image thumbnails and supported file previews—not merely a generic drop surface and not a Chrome popup.
- The window remains **ALWAYS ON TOP of websites and ordinary desktop applications** after focus changes.
- Visible **X (close)**, **– (shrink to compact always-on-top Explorer)** and **□ (maximize/restore)** controls. Users can drag the titlebar to MOVE the window and drag its **edges and corners** to RESIZE height and width. Maintain selection, scroll and functional layouts across sizes. No duplicate windows.
- **THE ENTIRE PORTABLE EXPLORER WINDOW** (not just the right-click menu) needs the **nostalgic yellow legal-pad aesthetic**: warm yellow paper surfaces, soft brown complementary accents, stationery feel and readable filenames, thumbnails, controls and previews. Preserve familiar file manager capabilities.

### 3. Compact minimize, X close to mascot, three mascot visibility modes and bottom-right summon
- **OWNER-SELECTED COMPACT SIZE:** Default compact Explorer dimensions approximately **300 px wide × 400 px tall** in Windows logical/device-independent pixels, with an editable **Chutey Settings → Explorer → Compact window size** setting (width and height). Treat 300×400 as a starting preset, not a hard-coded limit. Validate practical bounds and screen fit for Windows DPI scaling and smaller displays. Persist the chosen size across restarts. The **– Minimize** button applies this saved compact preset, while **□ Restore** brings back that Explorer's *own previous larger window size and position*. Keep the compact Explorer functional and always-on-top for drag-and-drop; reflow controls, allow vertical scrolling, and don't clip essential navigation. User manual resizing of the full window must not silently overwrite the compact preset.
- **OWNER CORRECTION — MINIMIZE NEVER MEANS MASCOT:** Clicking **– Minimize** shrinks the currently open Chutey Explorer to a smaller **still-visible, movable, always-on-top miniature Explorer window**; it does not close the Explorer or replace it with the mascot. Preserve a functional drag-and-drop target, readable assigned folder identity and basic navigation in compact mode. Compact dimensions must remain usable and be constrained to the screen; remember prior full-window bounds so **□ Restore/Expand** returns to the previous larger size. No arbitrary fixed size required without actual UI testing.
- **X CLOSE is different:** Clicking X closes/dismisses this Explorer window and returns control to its corresponding mascot at its last saved **Drop Off** screen position. The mascot then follows its configured 10-second auto-hide, always-visible or manual visibility rule. X never deletes the Chutey, destination folder or History.
- Maintain the original **mascot-only visibility modes**: **Auto-hide after 10 seconds (default)**; **Always visible** (collapsed mascot never times out); and the existing **right-click-controlled/manual visibility** concept (preserve right-click menu functionality and don't invent global desktop context-menu hooks). The auto-hide mode hides the **collapsed mascot only** after 10 seconds of inactivity, not an Explorer.
- With **Auto-hide after 10 seconds**, moving the mouse to the consistent **bottom-right screen hotspot** reveals the hidden mascot again at its saved Drop Off position, even if that position is elsewhere. The mascot remains available for **another 10 seconds of inactivity** and then hides again; subsequent hotspot visits repeat this. Avoid accidental summoning from ordinary webpage hover.
- In the future multi-Chutey phase, this visibility preference belongs to **each individual Chutey**. One visit to the bottom-right hotspot reveals **all eligible hidden auto-hide mascots** together for 10 idle seconds, with independent safe positions; Always visible mascots remain visible. This sentence is **future design clarification only** and does **not** authorize multi-instance implementation in held Development 2.
- Right-click menus, drag/drop, hover, Pick Me Up/Drop Off, and other active interactions prevent/refresh the mascot idle hide. Right-click must not itself cause mascot disappearance.
- **ABSOLUTE EXPLORER RULE:** If the native Explorer is expanded **OR minimized into its compact window**, it remains **visible, movable, drag-and-droppable and ALWAYS ON TOP indefinitely**. The 10-second mascot timer and bottom-right hotspot NEVER hide, close or move either Explorer size. **– only resizes into compact mode; □ restores the prior larger size; X explicitly closes the Explorer and summons its mascot.** Only X changes the Explorer back into a mascot; no sibling window is affected.

### 4. Assign and Make Chutey Location!
- **Assign** opens compact Chutey Explorer folder chooser to select where drops on the collapsed mascot should save. Until explicitly changed, existing working destination remains.
- Right-click a folder in the Explorer -> **Make Chutey Location!** assigns that folder to the existing mascot. Preserve scoped folder authorization.

### 5. Real per-directory drop targets and lightbox sibling saves
- The expanded Explorer is a **real directory navigator**. On supported website/local-file drag and drop: dropping **ON any displayed folder** saves inside THAT folder, not merely the currently open one.
- Dropping in current directory's empty space saves in current directory.
- Dropping ON the collapsed mascot uses its assigned destination.
- Dropping a new image onto a **large image preview/lightbox** saves it as a separate **sibling in the previewed image's containing folder**, never replaces the previewed original. Avoid filename collisions and verify saves before reporting success.
- Respect website payload limitations, security and file authorization; do not fake successful drops.

### 6. Pick Me Up, Drop Off and memory
- Deliberately **Pick Me Up** then **Drop Off** moves existing mascot and remembers screen placement; distinguish mascot repositioning from file drag/drop.
- **Owner-corrected opening default:** Every time the existing Chutey is freshly expanded or restored from its collapsed mascot, open its Explorer in **its currently assigned default destination directory**, not the last browsed directory. Inside an already expanded Explorer, ordinary folder navigation is independent and must not silently reassign the mascot's saved drop destination. Do not auto-play media.
- A last-browsed folder/selection may be tracked as separate optional session information but **must not override the assigned destination as the default opening folder**, including across restarts. The assigned default is persistent and changes only through explicit Assign / Make Chutey Location! action, subject to permissions.

## Scope boundary, test and delivery
- The scope is the **one existing mascot**, its reusable menu, its movable/resizable always-on-top legal-pad Explorer and verified drop destinations. No unrelated future features.
- Test real Windows always-on-top across Chrome + other apps, titlebar drag, edge/corner resize, X/minimize/maximize/restore, the three mascot-only visibility modes, repeated bottom-right 10s reveals, drag/menu pausing idle hide, **both full-size AND compact Explorer NEVER auto-hiding or losing topmost when mascot timer expires; – shrinks window without collapsing into mascot; □ restores prior bounds; X returns to mascot**, folder assignment and individual folder/background/lightbox drops, duplicate avoidance and resource use.
- Do not overwrite protected Chute.exe, Chrome extension, files, history, stored images or native registrations. Deliver commit SHA, tests, Windows handoff, limitations.
- **Even after Development 2 implementation**, owner decides whether it is accepted or deployed.
