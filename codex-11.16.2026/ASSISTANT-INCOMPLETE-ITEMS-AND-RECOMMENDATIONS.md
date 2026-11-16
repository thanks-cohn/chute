# Assistant review — incomplete work and suggestions (2026-11-16)
**ADVISORY, NOT OWNER APPROVAL.** Read separately from `OWNER-PHASE1-CODEX-REQUEST.md`. Do not implement this list automatically. This file identifies handoff gaps, suggestions and questions for owner review.

## Open versus Preview versus Reveal/GO TO — especially important
- **Preview** displays file *inside Chutey*. Owner explicitly requested Left/Right preview navigation, with Up/Down scrolling within documents.
- **Reveal / GO TO** navigates to the location of a file. Owner likes an EXISTING working feature that opens the Windows location; this MUST be preserved as the default. Owner explicitly requested a Settings alternative: open **Chutey File Explorer** at containing directory with file selected. Verify which current UI/actions already do this, including History/Shelf GO TO, rather than replacing or renaming working behavior casually.
- **Open** (launch in default Windows app, e.g. MP3 in player, TXT in editor) is a *different* possible native action. **The assistant suggested adding/completing this; the owner did not ask for it.**
- Phase 1 handoff notes the candidate Explorer's new native **Open/Reveal** dispatcher and consent/API support were incomplete. This does NOT mean the owner's existing Reveal/GO TO feature is absent or should be removed. Review actual action paths and offer a scoped proposal *before* adding a new Open behavior.
- If future Open is approved: explicit action and consent, default app launch, correct file identity, error handling and distinguish from Preview/Reveal; otherwise defer.

## Current Phase 1 test and compatibility gaps
- Handoff reported 84 Python tests passed, 9 skipped, 37 subtests passed and Chromium fixtures, but real Windows/Chrome acceptance incomplete. Skips are not successes. Original Windows installation must remain protected.
- Original worker health and preserved hash were verified, but that does not establish candidate media streaming capability. Old worker may support small video fallback and not new streaming endpoint; do not claim universal MP4 failure.
- Test extension enrollment authorization must persist through manifest regeneration. Restore only explicitly granted IDs, never blanket wildcard access.
- Candidate filesystem guards may reject authorized profile folders, USB roots and links; trace exact Windows API errors, enforce explicitly consented root and safe handle boundaries.

## Optional technical recommendations (not owner requirements)
- Native topmost desktop companion needs native window surface (Chrome popup alone cannot reliably stay above all apps). Prefer shared backend and bounded per-mascot resource costs. Design safe multi-monitor placement/escape for offscreen windows, opt-in unpin/close.
- Low-memory Windows test machine observed 3911 MB usable RAM, 293 MB free and approximately 96 MB disk free; resource pressure may complicate testing but is not proof of a particular UI/security failure. Avoid full-file movies, constrain thumbnail workers and memory, cancel stale requests.
- For large audio/video: distinguish container, codec and file size; range 206/HEAD, seeking, bounded buffers, cleanup, cancellation, graceful unsupported codec response, no false "played" claims.
- Webpage drag/drop may provide URL, HTML or bytes; validate sources and URLs, keep destination confined to approved root, verify completed saves before celebrating. Cloud provider transfers need explicit auth, progress, rollback/retry and cost/quotas.
- Preserve API-first parity as an existing project principle, but don't rewrite unrelated APIs merely to fix the immediate popup regression.
- Potential UX additions NOT asked for: new "Open in default app" command, new context-menu commands, new debug overlays, new character artwork, generalized media-library features and more advanced window options. Seek approval before any such development.

## Suggested audit checklist — no automatic implementation
1. Inventory working old Reveal and History/Shelf GO TO behavior and check which should use Windows versus Chutey destination setting.
2. List what candidate Explorer Open/Reveal dispatcher currently lacks; decide whether it actually blocks owner-requested goals.
3. Distinguish confirmed owner-visible regressions from merely incomplete planned work, and from new suggestions.
4. Verify exact Windows/Chrome behavior in disposable environment. No production worker replacement or blanket permission changes.
5. Present any extra feature for explicit review before coding.

**Status note:** This document is a review inventory, not an instruction to change the product.
