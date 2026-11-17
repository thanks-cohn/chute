# Chutey Experimental

**Status: ideas and specifications only. Nothing in this folder is automatically enabled or shipping.**

This folder records owner-directed experiments without changing the current Chrome extension, Windows worker, historical GOLD tags, saved files, or active release.

- [Chutey Experimental Roadmap — November 17, 2026](CHUTEY_EXPERIMENTAL_ROADMAP_2026-11-17.md): Scientist Chutey skin; optional GraphMarks-style New Tab home; user-created tags, collections and graph relationships; export/import; Screenshot API without dependence on explorer.exe; persistent floating window; cross-extension integrations and concurrency safety.
- [Adaptive Icon Renditions & Smart Cache](ADAPTIVE_ICON_RENDITIONS.md): opt-in quality small icons from landing-page candidates displayed for over 60 seconds; batch-size options of 16 or 25, bounded caching and Settings-based deletion of generated renditions only.

## Experiment rules

1. Everything **off by default** unless the owner expressly changes that policy after testing.
2. Prefer a coherent **Settings → Experimental** feature registry with clear names, scopes, compatibility notes, reset/disable switches and versioned feature flags. That UI is *proposed*, not currently implemented.
3. Do not add blanket file access, new-tab takeover, desktop shell replacement, screenshot capture or cross-extension data exchange without explicit opt-in and an appropriate permission path.
4. Prototype on reviewable branches with isolated tests; preserve the existing working paired Windows/Chrome build, History and data.
5. No claim of compatibility or reliability without actual Windows + Chrome acceptance tests.
6. This is a product backlog, **not authorization to start implementation or change another repository**.
