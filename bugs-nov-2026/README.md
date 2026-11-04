# Chute — November 2026 bug investigations

Scope: extension branch work on \`development-2026-11-03\`, derived from \`chrome_extension_windows_version\`. Never apply these fixes directly to \`main\`.

| Bug | Status | Evidence |
| --- | --- | --- |
| [Shelf repeatedly flashes / appears to reload](./SHELF-FLASHING.md) | Root cause located; code change committed; real-browser regression check outstanding | \`extension/shelf.js\` polling and full DOM replacement |

Record the reproducer, observed behavior, offending call path, bounded fix, and Windows/Linux verification results in the individual issue file. Do not mark a visual bug closed solely because a patch was committed.
