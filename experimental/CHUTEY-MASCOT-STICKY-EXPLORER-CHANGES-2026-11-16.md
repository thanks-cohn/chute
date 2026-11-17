# EXPERIMENTAL — Changes to existing Chutey mascot (2026-11-16)
**Scope:** Owner's proposed changes to the existing mascot and its File Explorer. This is NOT an instruction to implement during Phase 1 repair. Keep artwork and existing mascot logic; do not create a replacement character or introduce unrelated speculative features.

## Existing mascot: modular right-click menu and sticky Explorer
- Fix immediate defect: right-click currently hides the mascot. The mascot must remain visible while the menu is open and during drag/drop.
- Create a **separate reusable mascot context-menu module**, not tangled with current gallery/worker logic. Style: **brownish backing panel, yellow note-card menu tiles, black text with a subtle bluish outline**; playful notepad appearance, NOT metallic gold. The menu is its own reusable module. Initial options: **Expand**, **Assign**, **Pick Me Up** / **Drop Off** (state-dependent). Further choices only after owner approval.
- **Portable Explorer visual identity:** The **expanded, always-on-top Chutey File Explorer window itself** must feel like a **nostalgic yellow legal pad**—soft warm yellow paper coloration, complementary brown accents, and a tasteful stationery-like appearance without sacrificing thumbnail clarity, readability, or usability. This applies to the Explorer window, not merely the smaller right-click menu.
- **Expand:** turn/open this same mascot into a movable, **persistent native Windows always-on-top File Explorer / gallery / lightbox window**, above other websites and normal applications. It must have visible functional **X (close Explorer and return to mascot), – (shrink to smaller always-on-top Explorer window), and □ (expand/maximize/restore the prior Explorer size)** window controls. Users can **grab and drag its edges/corners to resize** it (including height and width), drag its titlebar to reposition it, and the file list and lightbox reflow correctly *within* the window while preserving navigation, scroll, and selection. The topmost property survives ordinary focus changes; close behavior must not destroy user's files, **X returns to existing mascot at saved Drop Off position, while – MINIMIZE MUST NOT collapse to mascot: it shrinks the Explorer to a small, still-visible, still-topmost, drag-and-droppable window; □ restores its previous larger dimensions**. No duplicate sticky windows and no replacement mascot.
- **Assign:** open compact Chutey File Explorer/folder chooser and select the location where files dropped onto THIS mascot are saved. Default prior to assignment remains the mascot's **existing working destination**.
- **Make Chutey Location!:** add this exact action to folders' right-click menu inside Chutey File Explorer, assigning the chosen folder to the current mascot (with appropriate authorization). It must not be an arbitrary global path grant.
- **Pick Me Up:** initiate deliberate repositioning of this mascot; **Drop Off** completes placement and saves resting position. Distinguish deliberate mascot movement from dragging a file onto it. The user may use the shortcut and menu; don't invent a new gesture that breaks current drop interactions.
- Expanded Explorer supports dropping supported webpage content/local files **onto a directory to save in that directory**. If a **large image preview is open**, dropping an image onto that preview saves the dropped image as a **sibling file in the same directory as the previewed image**, not as a replacement or nested child; preserve unique filenames and verify completion.
- Opening a destination respects permissions; unsuccessful drops are surfaced and do not trigger false success.

## Remember exactly where the user was
- Default on re-expansion during same session: open last visited directory with the last opened/previewed file selected (do NOT automatically launch/play it).
- Optional setting: persist this location, selected file and useful Explorer state across Chutey/Windows restarts, subject to renewed permission when needed.
- User-requested Reveal preference: **Chutey Explorer is default**, with **the current working Windows Reveal/GO TO retained as a Settings alternative** and repaired if any part is incomplete. Opening a file defaults to Chutey, with system application selectable in Settings. Preview remains distinct.

## Mascot location, hide/reveal and interactions
- Mascot currently at bottom left; requested initial activation hotspot is **bottom right**.
- Let user deliberately relocate the existing mascot using **Pick Me Up** and **Drop Off**, save chosen resting/dock position, and maintain a clear distinction from a file drop.
- Collapsed mascot hides after **10 seconds of inactivity**, including after **X closes the Explorer and returns to the mascot**. **– Minimize does NOT activate the mascot timer because it leaves a smaller always-on-top Explorer open.** **Only hovering the bottom-right activation hotspot summons it again**, even if the mascot's saved on-screen position is elsewhere; hovering casually anywhere else must not summon it. An active mascot menu/drop interaction pauses the countdown.
- Auto-hide is suspended during right-click menu, active drag/drop, ongoing interaction; both expanded and compact minimized Explorer windows remain visible and topmost indefinitely; the mascot timer NEVER hides them.

## Codex boundaries / execution order
1. Fix the current right-click hiding regression in Phase 1.
2. Prototype modular brown-backed/yellow-card/black-text/blue-outline right-click menu for the EXISTING mascot, then Expand -> single movable, edge-resizable always-on-top Explorer with X/compact-minimize/expand-restore controls; X returns to mascot, – shrinks the persistent Explorer, □ restores it, as separately approved work.
3. Implement Assign picker, folder menu **Make Chutey Location!**, safe destination drops including sibling-image drop, and last-directory/last-selected file behavior with optional restart persistence.
4. Implement **Pick Me Up / Drop Off** relocation, configurable activation/hotspot and 10s idle hide without interrupting interaction.
5. Provide test evidence and owner approval gates. Never alter installed protected worker in place.

Do not create new mascot artwork; do not add unspecified context-menu options or unrelated features. Preserve the existing mascot and functioning Windows Reveal. The owner's specified Open setting (Chutey default, system optional) is approved, but broader system integration is not.
