# Chutey workspace tabs, Codex Explorer, and planned SKIN API

This phase implements **only** the tab shell, last-active-tab restoration, compact Clear Live Chutey button, black-on-black pixel-art mascot logo, and floating mascot visibility fixes. The File Explorer itself is deliberately **not implemented**.

## Established visual and navigation contract
- Two tabs: **History** and **File Explorer**. History is the initial default. Whichever tab is active appears on the **left**, the inactive tab on the right.
- The Shelf remembers the last selected tab using `chrome.storage.local.chuteyShelfActiveTab`. Reopening the Shelf returns to that view, with no modifications to existing Chute History.
- The File Explorer tab displays a placeholder under `#chutey-explorer-view` until a later Codex task. All History functions stay within `#chutey-history-view`.
- `extension/workspace-tabs.js` owns tab state, keyboard controls and persistence; `extension/workspace-tabs.css` owns only tab visuals.
- `extension/explorer-shell.css` is separately scoped with `--chutey-explorer-*` CSS custom properties. This is a **foundation** for future skins, **not yet a SKIN API**.
- Header has pixelated Chutey centered on a matching black background, with no extra yellow top/bottom frame. Clear Live Chutey becomes an icon button, with hover title and accessible name exactly **Clear Live Chutey**. Existing clear semantics (archive retained) unchanged.
- Hide routine History counts such as `1–40 in all history · page 1`; preserve meaningful errors and the existing page navigation.
- Keep mascot on supported webpages when Floating/Both is enabled, with 10-second auto-hide when configured. Always visible must never be nullified by a stale right-click-only preference; explicit right-click-only selection remains available.
- Browser content scripts do not necessarily reinject into already-open pages after an unpacked extension reload. Refresh the webpage before diagnosing absence; Chrome internal pages do not permit content scripts.

## Future Codex scope
The future File Explorer will be **API-first** and tested with a deterministic Python scenario corpus. Read `In_Progress/LOCAL_EXPLORER_AND_IMAGE_TRANSFORMS_API.md` for its detailed design. It must not replace History, alter the original successful Windows companion tag, or introduce arbitrary filesystem access from browser JavaScript.

## Planned SKIN API (not implemented)
Versioned declarative skins should target the tab shell, History, File Explorer and Chutey mascot independently. Define validated theme tokens, background, accent, typography, icon assets, and motion presets; no scripts, unsandboxed user HTML, data/file permissions, or style leakage. Each component should be swappable without rewriting its behavior. Build tests proving compatibility across themes and browser lifecycle, then hand off to Codex.
