# FUTURE DESIGN NOTE — Chutey → Explorer portal, preparing for multiple Chuteys

**Owner discussion:** November 16, 2026
**Status: CONCEPT / ARCHITECTURE PREPARATION ONLY. NOT EXECUTABLE CODEX AUTHORIZATION.**
**Repo:** thanks-cohn/chute
**Important:** Do not modify running Development 1 implementation or begin Development 2. The already-held Development 2 scope concerns ONE existing mascot. Adding future multi-instance implementation requires a separate owner approval. This note exists to prevent architectural rework when that later feature becomes authorized.

## Vision: a Chutey is a named doorway to its own Explorer

- On first install, **Original / Primary Chutey** is paired with the established default save destination; its Expanded Explorer opens there initially (or honors last-browsed location separately once chosen).
- Chutey itself is the compact collapsed view; **Expand** reveals a real persistent Explorer for that Chutey; minimize returns it to its own mascot. Drop on collapsed mascot saves to **assigned destination**, not an arbitrary last-browsed folder.
- Inside Chutey Explorer, user right-clicks a *folder* and selects **"Make Me Chutey!"**. This *spawns a NEW independent Chutey visual instance with its own small, always-on-top Explorer window* bound to that chosen, explicitly authorized folder. The original remains present with its unchanged default destination, while the newly summoned Chutey appears as well; both Explorers can remain open and receive drops simultaneously.
- Each summoned Chutey can later be independently expanded, minimized, moved and assigned another destination (when implemented), with its own selected directory, placement and active preview state.
- Crucial command distinction: old **"Make Chutey Location!"** in the held Development 2 spec changes the destination of the existing Chutey. New **"Make Me Chutey!"** creates an additional mascot. Make these clearly distinct, so normal "Assign" never silently spawns an instance and spawning never silently reassigns the original.
- A user who never invokes "Make Me Chutey!" retains exactly the simple one-Chutey experience: one mascot, one usual location, one explorer.
- An initial new Chutey may use the same mascot artwork; different colors/names/skins later are optional presentation, not separate workers.

## OWNER CLARIFICATION — MULTIPLE EXPLORER WINDOWS STAY EXPANDED SIMULTANEOUSLY

The central goal is **not just multiple little mascot sprites**. A user may want **two, three, or many small independent, movable, resizable Chutey Explorer windows open at once**, each optionally **ALWAYS ON TOP** of browser and normal desktop windows, and each a real **drag-and-drop destination**. They are small persistent windows onto distinct local directories, like multiple little portals to the filesystem.

- Original Chutey starts at the usual default destination, and one optional always-on-top Explorer window can be opened for it.
- Choose `Make Me Chutey!` on a different authorized folder in a Chutey Explorer → create another Chutey whose Explorer is bound to that folder. **The original Explorer/window is NOT closed, reassigned, hidden or replaced**. Both can stay expanded simultaneously on the desktop.
- Drag files from Windows Explorer, supported websites/browser surfaces, or another Chutey into **any individual open Chutey Explorer window**. Dropping on the window background targets that window's *current displayed directory*; dropping on a visible child folder targets that child folder; dropping on its collapsed mascot targets that mascot's *assigned default folder*. Transfers must be explicit, authenticated, scoped and byte-verified; source never deleted on copy. Support multi-file drops where the OS/browser payload and worker support them, without claiming that all websites allow file drags.
- Dragging from **one Chutey window to another** should copy between their independently authorized folder roots with clear copy/move semantics (default conservative copy unless user explicitly requests move). Maintain single worker transfer scheduling and correct receipts.
- Each Explorer window has its own title/identity, folder/navigation stack, position/size, topmost preference (default ON for the mini-window paradigm), minimized/expanded state, preview selection and drag/drop hover feedback. Each window can be moved and resized independently.
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
  lastBrowsedFolder: optional guarded folder capability reference
  lastSelectedFile: optional guarded file identity
  mascotPosition: per-monitor screen position
  explorerWindowState: collapsed | expanded | minimized
  explorerWindowGeometry: optional position/size
  appearancePreference: optional instance-specific skin
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

1. User sees only **Primary Chutey**, bound to default location. Expand -> original Explorer.
2. In its Explorer, user opens another folder, right-clicks folder -> **Make Me Chutey!**.
3. Chutey #2 appears at a sensible non-overlapping nearby screen position with its own Explorer, while **Chutey #1 and its Explorer can remain visible, expanded and always-on-top**. #2's drop destination is that chosen folder, #1's default destination unchanged. Both receive independent drag-and-drop.
4. Drop a file onto #1's mascot -> verified save to its assigned primary destination. Drop onto #2's mascot -> verified save to its assigned folder. Drop into either expanded Explorer background -> current browsed folder; on a child folder -> child folder. Copy from one Chutey Explorer to another when both roots are authorized.
5. Close/minimize one Explorer -> only that Explorer collapses into its mascot. Assign/reposition one -> other unaffected. Hotspot/group-summon semantics (show all vs primary plus chooser) require owner UX approval before implementation.
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
