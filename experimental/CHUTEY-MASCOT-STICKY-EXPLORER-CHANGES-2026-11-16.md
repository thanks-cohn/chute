# EXPERIMENTAL — Changes to existing Chutey mascot (2026-11-16)
**Scope:** Owner's proposed changes to the existing mascot and its File Explorer. This is NOT an instruction to implement during Phase 1 repair. Keep artwork and existing mascot logic; do not create a replacement character or introduce unrelated speculative features.

## Existing mascot: modular right-click menu and sticky Explorer
- Fix immediate defect: right-click currently hides the mascot. The mascot must remain visible while the menu is open and during drag/drop.
- Create a **separate reusable mascot context-menu module**, not tangled with current gallery/worker logic. Style: **little brown background with gold menu cards**. Initial options: **Expand**, **Assign**, **Pick Me Up** / **Drop Off** (state-dependent). Further choices only after owner approval.
- **Expand:** turn/open this same mascot into a movable, **permanent native always-on-top File Explorer / gallery / lightbox window** that stays above ordinary applications and websites. User can move window, collapse to the mascot and expand it again. Don't duplicate windows or replace the mascot.
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
- Collapsed mascot hides after **10 seconds of inactivity**, and is intentionally revealed by hover over **bottom-right hotspot**; random hovering elsewhere on a webpage must not trigger it.
- Auto-hide is suspended during right-click menu, active drag/drop, ongoing interaction; expanded sticky Explorer does not disappear due to mascot timer.

## Multiple destination-linked mascots (later stage)
- Eventually allow user to set the number of active Chutey mascots, each with distinct assigned destination and remembered placement.
- Drop a file ON a particular mascot: it is saved to THAT mascot's assigned folder/cloud destination (once supported). Expanding it opens Chutey File Explorer at that assigned location.
- Each instance independent; shared native services where possible. Decide precedence between assigned default folder and last-opened directory before implementation, rather than guessing.
- This extends existing Chutey mascot identities; no redesign.

## Optional Mascot API interactions requested for future
- Two neighboring mascots can playfully notice each other and reach/touch.
- **New interaction:** one Chutey sticks its tongue out at a neighboring Chutey, and the other Chutey laughs/reacts.
- Earlier requested stealth interaction: one reaches toward its neighbor, but when the mouse approaches, it hides its hand and pretends it was not doing anything.
- These are **owner-requested future interaction examples**, not instructions to build a full personality simulator now.
- Animations must be optional and must not interrupt file dropping, menu clicks or the primary File Explorer.

## Codex boundaries / execution order
1. Fix the current right-click hiding regression in Phase 1.
2. Prototype modular brown/gold right-click menu for the EXISTING mascot, then Expand -> single movable sticky Explorer -> Collapse, as separately approved work.
3. Implement Assign picker, folder menu **Make Chutey Location!**, safe destination drops including sibling-image drop, and last-directory/last-selected file behavior with optional restart persistence.
4. Implement **Pick Me Up / Drop Off** relocation, configurable activation/hotspot and 10s idle hide without interrupting interaction.
5. Add multiple destination-linked Chuteys only after single instance is stable and resource-bounded.
6. Add requested tongue-out/laugh and stealth-reaching social interactions later via Mascot API.
7. Provide test evidence and owner approval gates. Never alter installed protected worker in place.

Do not create new mascot artwork or multiple mascots now; do not add unspecified context-menu options or unrelated features. Preserve the existing mascot and functioning Windows Reveal. The owner's specified Open setting (Chutey default, system optional) is approved, but broader system integration is not.
