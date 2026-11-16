# EXPERIMENTAL — Changes to existing Chutey mascot (2026-11-16)
**Scope:** Owner's proposed changes to the existing mascot and its File Explorer. This is NOT an instruction to implement during Phase 1 repair. Keep artwork and existing mascot logic; do not create a replacement character or introduce unrelated speculative features.

## Existing mascot: right-click and Expand
- Fix immediate current defect: RIGHT-CLICK makes mascot disappear. Mascot must remain visible during a menu interaction and active drag/drop.
- Add right-click menu action **Expand**. It turns/opens this **same existing Chutey** into its own persistent **native Windows always-on-top sticky File Explorer**, remaining available regardless of website or application. Chrome's ordinary action popup is not sufficient for cross-app always-on-top.
- Collapse/minimize returns to mascot; re-expand resumes same Explorer context, without duplicate windows.
- Expanded Explorer should allow drag/drop of supported webpage content or local files onto a folder visible inside it. Destination is that chosen folder; save must be verified and errors honest.

## Remember exactly where the user was
- Default on re-expansion during same session: open last visited directory with the last opened/previewed file selected (do NOT automatically launch/play it).
- Optional setting: persist this location, selected file and useful Explorer state across Chutey/Windows restarts, subject to renewed permission when needed.
- User-requested Reveal preference is in immediate owner requirements: keep Windows Explorer default and offer Chutey Explorer alternative at containing directory/file selection.

## Mascot location, hide/reveal and interactions
- Mascot currently at bottom left; requested initial activation hotspot is **bottom right**.
- Let user drag existing mascot into preferred on-screen resting/dock position and remember it.
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
2. Prototype existing mascot -> Expand -> single sticky Explorer -> Collapse, as separately approved work.
3. Implement safe destination drops and last-directory/last-selected file behavior, and optional restart persistence.
4. Implement customizable hotspot/drag placement and 10s hide without interfering with interaction.
5. Add multiple destination-linked Chuteys only after single instance is stable and resource-bounded.
6. Add requested tongue-out/laugh and stealth-reaching social interactions later via Mascot API.
7. Provide test evidence and owner approval gates. Never alter installed protected worker in place.

No unrequested Open action, new mascots or speculative extra behaviors.
