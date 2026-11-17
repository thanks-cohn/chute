# FUTURE DESIGN NOTE — Chutey → Explorer portal, preparing for multiple Chuteys

**Owner discussion:** November 16, 2026
**Status: CONCEPT / ARCHITECTURE PREPARATION ONLY. NOT EXECUTABLE CODEX AUTHORIZATION.**
**Repo:** thanks-cohn/chute
**Important:** Do not modify running Development 1 implementation or begin Development 2. The already-held Development 2 scope concerns ONE existing mascot. Adding future multi-instance implementation requires a separate owner approval. This note exists to prevent architectural rework when that later feature becomes authorized.

## Vision: a Chutey is a named doorway to its own Explorer

- On first install, **Original / Primary Chutey** is paired with the established default save destination; **every fresh Expand/open of its Explorer begins in that assigned default directory**, not the last visited folder.
- Chutey itself is the compact collapsed view; **Expand** opens its Explorer at **that Chutey's assigned default directory on every fresh open/restore**. **– Minimize shrinks its Explorer window into a smaller but still-visible always-on-top Explorer; X Close (not Minimize) returns it to its mascot.** Drop on the collapsed mascot saves to its assigned destination, not an arbitrary last-browsed folder. Navigating within an already-open Explorer never changes the assigned default.
- Inside Chutey Explorer, user right-clicks a *folder* and selects **"Make Me Chutey!"**. Alternatively, right-click an existing **Chutey mascot itself** and choose the same action to create a new Chutey initially assigned to that mascot's default destination. This *spawns a NEW independent Chutey visual instance with its own small, always-on-top Explorer window* bound to that chosen, explicitly authorized folder. The original remains present with its unchanged default destination, while the newly summoned Chutey appears as well; both Explorers can remain open and receive drops simultaneously.
- Each summoned Chutey can later be independently expanded, minimized, moved and assigned another destination (when implemented), with its own selected directory, placement and active preview state.
- Crucial command distinction: old **"Make Chutey Location!"** in the held Development 2 spec changes the destination of the existing Chutey. New **"Make Me Chutey!"** creates an additional mascot. Make these clearly distinct, so normal "Assign" never silently spawns an instance and spawning never silently reassigns the original.
- A user who never invokes "Make Me Chutey!" retains exactly the simple one-Chutey experience: one mascot, one usual location, one explorer.
- An initial new Chutey may use the same mascot artwork; different colors/names/skins later are optional presentation, not separate workers.

## OWNER RULE — INDEPENDENT MASCOT VISIBILITY MODES, EXPLORER NEVER AUTO-HIDES

**This is a strict distinction.** Each Chutey has two different visual surfaces: (a) its **collapsed mascot**, which may appear/disappear according to its visibility setting, and (b) its **expanded native miniature Explorer window**, which **stays open, visible and ALWAYS ON TOP in either full or compact minimized size** until the user explicitly clicks X to close **that specific window**. **– Minimize only shrinks the Explorer; it never collapses to the mascot.** The mascot's ten-second timer must NEVER hide, minimize, remove, move behind normal applications, or alter either a full or compact minimized Explorer. The Explorer must remain a usable drag-and-drop target indefinitely, including when other mascots are hidden.

**Per-Chutey mascot visibility preferences (the existing three-mode concept):**
1. **Auto-hide after 10 seconds (default):** When collapsed and idle, the mascot disappears after 10 seconds. A pointer approaching the **consistent bottom-right screen hotspot** reveals **all eligible hidden auto-hide mascots together**, at their saved Drop Off positions (not necessarily all stacked in that corner). They stay visible for 10 seconds of inactivity and then disappear again. Repeat on the next hotspot visit; never require relaunch. User interaction/hover, right-click menu, Pick Me Up/Drop Off and drag-and-drop pause/reset the idle timer; don't hide while actively interacting.
2. **Always visible:** The collapsed mascot remains visible continuously at its own saved screen position, including after 10 seconds. Hotspot interactions must not inadvertently hide it. Expanding still shows the Explorer on top.
3. **Right-click-controlled / manual visibility mode:** Preserve the owner's existing *right-click* visibility/context-menu concept rather than silently treating it as auto-hide or always visible. Right-click must still open the Chutey action menu and must not cause immediate accidental disappearance. Whether context-menu access is also offered through the hotspot should be resolved against actual established UX before implementation; do **not** invent a global desktop-right-click hook.

**Multiple-window behavior:** With four Chuteys, each can independently choose Auto-hide, Always visible or right-click/manual mode. The single bottom-right hotspot reveals eligible hidden mascots in the 10-second Auto-hide mode; it does **not** toggle, close, occlude or collapse any of the four expanded Explorer windows. Any Explorer already open stays visibly above ordinary apps and accepts drops. Expanding, compact-minimizing, restoring, or X-closing one Chutey never changes its siblings. Use one shared worker and one shared bounded scheduler.

**Acceptance:** Test four instances with mixed modes, 10s expiration, repeated bottom-right summon, visible placement, per-instance idle reset while mouse/drag/menu active, and expanded Explorers remaining on top and fully droppable for minutes/hours despite mascot timers. Simultaneous open windows don't auto-hide on hotspot leave; moving pointer to hotspot doesn't cause new Explorer windows to open or the old ones to vanish. Test multi-monitor and off-screen placement recovery. The 10s rule is **mascot-only**.

## OWNER RULE — EVERY CHUTEY OPENS IN ITS OWN ASSIGNED DIRECTORY BY DEFAULT

**Mandatory default:** Every Chutey's own miniature Explorer opens directly in **that instance's assigned default location** when expanded, opened anew, or restored from its mascot. **Not** a shared/global directory; **not** another Chutey's folder; **not** a previously browsed folder. This applies to Primary Chutey, clones created by right-clicking an existing Chutey, and new instances created from right-clicking a folder.

- If Chutey #1 is assigned `Pictures` and Chutey #2 is assigned `Music`, opening/expanding #1 shows `Pictures` and opening/expanding #2 shows `Music`, including after restarting the app.
- Users can browse elsewhere *while an Explorer is already open*, and each window has its own independent navigation. Browsing away must never silently reassign the drop destination.
- **Assign** or an explicit change of that specific Chutey's default location updates only that instance; its next opening starts at the newly assigned folder. Other Chuteys are unaffected.
- If a directory was deleted or its access grant expired, show an actionable reconnect/choose-folder error for that particular Chutey; **never silently save/open at an unrelated fallback folder**.
- The earlier proposal to restore each Explorer's last browsed directory is **superseded** as a default opening rule. Remembering a last-browsed position can be an optional separate convenience in the future, but only if explicitly configured; it must not supersede the assigned folder by default.

## OWNER CLARIFICATION — TWO RIGHT-CLICK WAYS TO SUMMON A NEW CHUTEY

**The exact visible action is `Make Me Chutey!`**, available in both these contexts when multi-Chutey support is eventually authorized:

1. **Right-click an actual folder INSIDE Chutey Explorer → `Make Me Chutey!`:** create a **new independent Chutey** assigned to the folder that was clicked, even if the source Explorer was browsing elsewhere. It has its own mini always-on-top Explorer and drop target. Never reassign or collapse the original Chutey.
2. **Right-click the existing Chutey mascot ITSELF → `Make Me Chutey!`:** summon/duplicate **another independent Chutey** directly from the mascot. This one **starts with the source Chutey's currently assigned default destination**, so the action works instantly without forcing a folder chooser. Its destination can then be **Assign**ed to a different authorized folder, independently of the original. It gets a new `instanceId`, its own placement and Explorer window, not a second worker. **Never copy active transfer jobs** or share mutable navigation/window state.

The original stays visible and functional. Both new and old can be **expanded at once as little independent ALWAYS-ON-TOP File Explorers**, both accepting drag-and-drop. Give the new instance a visible non-overlapping position, clear folder identity and drop-target feedback. Avoid spawning on simple left-click or plain right-click alone: only selecting **`Make Me Chutey!`** creates the new instance. Dismissing/removing a Chutey instance must never delete its folder contents or shared History.

This extends the held one-mascot right-click menu in concept, **but is future multi-instance scope**. Do not execute it or amend already-held Development 2 implementation authority without the owner's subsequent express approval.

## OWNER CLARIFICATION — MULTIPLE EXPLORER WINDOWS STAY EXPANDED SIMULTANEOUSLY

The central goal is **not just multiple little mascot sprites**. A user may want **two, three, or many small independent, movable, resizable Chutey Explorer windows open at once**, each optionally **ALWAYS ON TOP** of browser and normal desktop windows, and each a real **drag-and-drop destination**. They are small persistent windows onto distinct local directories, like multiple little portals to the filesystem.

- Original Chutey starts at the usual default destination, and one optional always-on-top Explorer window can be opened for it.
- Choose `Make Me Chutey!` on a different authorized folder in a Chutey Explorer → create another Chutey whose Explorer is bound to that folder. **The original Explorer/window is NOT closed, reassigned, hidden or replaced**. Both can stay expanded simultaneously on the desktop.
- Drag files from Windows Explorer, supported websites/browser surfaces, or another Chutey into **any individual open Chutey Explorer window**. Dropping on the window background targets that window's *current displayed directory*; dropping on a visible child folder targets that child folder; dropping on its collapsed mascot targets that mascot's *assigned default folder*. Transfers must be explicit, authenticated, scoped and byte-verified; source never deleted on copy. Support multi-file drops where the OS/browser payload and worker support them, without claiming that all websites allow file drags.
- Dragging from **one Chutey window to another** should copy between their independently authorized folder roots with clear copy/move semantics (default conservative copy unless user explicitly requests move). Maintain single worker transfer scheduling and correct receipts.
- Each Explorer window has its own title/identity, folder/navigation stack, position/size, topmost preference (default ON for the mini-window paradigm), **compact-minimized/full-expanded** state, preview selection and drag/drop hover feedback. **– shrinks window while retaining a usable always-on-top drag/drop Explorer; □ restores prior larger bounds; only X closes Explorer and returns to mascot**. Each window can be moved and resized independently.
- Allow more than one window visible and topmost at the same time; a window change must not force another Chutey to collapse. Windows OS z-order means one focused Chutey may temporarily stack above another, but all stay above normal apps while topmost.
- Distinguish **Make Me Chutey!** (spawn an additional doorway/window bound to that folder) from **Assign/Make Chutey Location!** (change only the existing Chutey). When new instance is created, show it promptly and position it next to rather than on top of the original as screen space permits.
- Maintain stable drop targets even while another Explorer is browsing or receiving files. Snapshot target capabilities at drop start. Never share raw arbitrary filesystem paths as access grants.
- All windows use **one service/worker, one local store/history and bounded shared resource scheduler**. Multiple windows must not mean duplicate `Chute.exe` processes, repeated decoding of the same file or unbounded polling. On the owner's ~4 GiB RAM PC, cap expensive work and prioritize focused interaction without arbitrarily prohibiting several windows.
- Test real always-on-top behavior with 2/3/5 simultaneous mini Explorer windows, drag/drop into each, folder-specific drop, Chutey-to-Chutey copy, file-name collision and disk-full, rapid minimize/restore, persistence and no data loss. Also verify display scaling, multi-monitor placement and offscreen restoration.

**Keep the current stage gate:** The approved/held Development 2 still implements the **ONE original Chutey portable Explorer** first, with a future-compatible instance architecture. It does NOT silently add spawning multiple windows. This is a clarified **future multi-instance phase** requiring separate owner authorization, after the single-window implementation is tested.

## Build the *single* Chutey to be instance-aware (only when Development 2 is explicitly authorized)

When implementing the approved ONE-mascot Development 2, reserve an `instanceId` in the runtime/UI interface, and store state in per-instance structures instead of process-global `currentFolder`/position/selection. A single primary instance `primary` exercises that contract initially. **Do not implement spawning/multiple Windows mascot windows as part of the existing held Dev2 without further explicit approval.**

Proposed conceptual state:
```text
ChuteyInstance {
  id: stable opaque identifier (primary, later UUIDs)
  displayName: string
  assignedDestination: authorized folder capability reference
  lastBrowsedFolder: optional guarded folder capability reference (navigation only; NEVER the default open destination)
  lastSelectedFile: optional guarded file identity
  mascotPosition: per-monitor screen position
  explorerWindowState: mascot | compactExplorer | fullExplorer // – keeps compact Explorer visible; X returns to mascot
  explorerWindowGeometry: optional position/size
  appearancePreference: optional instance-specific skin
  mascotVisibilityMode: autoHide10s | alwaysVisible | rightClickManual
  // Explorer topmost and visibility are NOT controlled by mascot auto-hide timers
}
```

Service-wide resources are shared:
- **ONE Windows native worker, ONE local data store, ONE streaming/transfer engine, ONE Chrome extension and ONE bounded recovery/logging subsystem.**
- Multiple Chuteys should be cheap *views/controllers* over the shared service—not copies of `Chute.exe`, duplicate local servers, duplicate import engines, or multiple complete histories.
- A history event can optionally record the `instanceId` or destination that initiated a save; preserve unified chronological History and existing data compatibility. Primary-only legacy items map to `primary`.
- File drops and preview requests are routed by explicit `instanceId` plus scoped authorized folder/file handles. Never allow a client-supplied arbitrary Windows filesystem path to act as authority.
- A long file transfer must remain bound to its original target instance/directory even if the mascot is reassigned or moved mid-transfer; use immutable per-transfer target snapshots, verified receipts and clear errors/revocation.
- Manage concurrency/resource budgets across **all** instances, so a 4-GB RAM PC does not spawn multiple browser/worker copies or starve playback.
- Store state persistently and atomically with schema/version migrations, including positions after monitor changes, and safe fallback if a previously authorized directory is missing or permission expired.

## Proposed user journey

1. User sees only **Primary Chutey**, bound to its default location. Expand -> its Explorer opens **at that assigned default directory every time**.
2. User can **right-click a folder inside Chutey Explorer → Make Me Chutey!** to spawn a Chutey bound to that folder; OR **right-click the mascot itself → Make Me Chutey!** to spawn an independent Chutey initially using the source mascot's assigned folder.
3. Chutey #2 appears at a sensible non-overlapping nearby screen position with its own Explorer, while **Chutey #1 and its Explorer can remain visible, expanded and always-on-top**. #2's drop destination is that chosen folder, #1's default destination unchanged. Both receive independent drag-and-drop.
4. Drop a file onto #1's mascot -> verified save to its assigned primary destination. Drop onto #2's mascot -> verified save to its assigned folder. Drop into either expanded Explorer background -> current browsed folder; on a child folder -> child folder. Copy from one Chutey Explorer to another when both roots are authorized.
5. **Minimize (–) one Explorer -> only that Explorer becomes a smaller still-open topmost Explorer; Restore (□) enlarges it again. Close (X) -> only that Explorer closes and its mascot appears at saved position.** Assign/reposition one -> other unaffected. In the Auto-hide mode, moving the pointer to the consistent bottom-right hotspot temporarily summons all eligible hidden mascots at their saved positions for 10 idle seconds. Full-sized and compact-minimized always-on-top Explorers NEVER auto-hide.
6. On restart, show intended primary/secondary instances without unprompted duplicate spawning; missing permissions show clear reconnect/reauthorize instead of silently writing elsewhere.
7. Later management actions, when requested: Rename Chutey; Open Explorer; Assign destination; Show All Chuteys; Hide/Remove this *instance only* (must not delete files/history); maybe change appearance. Don't build these unrequested controls prematurely.

## Risks and boundaries

- **Inside Chutey Explorer** right-clicking a folder is approachable in the app. Adding **"Make Me Chutey!" directly to Windows File Explorer's native OS right-click menu** is a distinct Windows shell-integration feature with packaging/security/registry requirements. Do not conflate them.
- A single Chrome extension normally exposes only its own toolbar action. Multiple Chuteys refers to multiple desktop/mascot instances, **not multiple copies of the toolbar extension**.
- Secure folder permissions must be explicit per assigned root; no escalation from one Chutey's access to arbitrary other directories. Keep original/history data when dismissing a Chutey.
- A new Chutey might be a bookmark to a folder or a fully independent Explorer state; start with a new instance with independent destination/state because owner expects them to appear simultaneously. Avoid defaulting #2 to same location after a successful folder selection.
- The held Development 2 currently has `Assign` and `Make Chutey Location!` for **one** existing mascot. Preserve those semantics; don't silently enlarge Dev2 scope based on this future architecture note.

## Separate approval gates

**Now:** finish Development 1 in order 3A, 3C, 3D, 3B (worker LAST); owner tests on Windows.

**After separate owner Dev2 approval:** implement single existing mascot's portable/always-on-top Explorer and modular per-instance-friendly foundations, without silently implementing multi-spawn.

**Later, after owner separately authorizes multi-instance:** implement `Make Me Chutey!`, multi-view/window lifecycle, persistence, group summon/selection, tests and gradual rollout.

**Product principle:** Build the first Chutey as if a second could exist, but never force the user to manage more than one.
