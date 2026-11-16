# CODEX REQUEST 3C — DEVELOPMENT 1 ONLY: Shelf Settings -> Export History

**Owner request, 2026-11-16.** Issue [#17](https://github.com/thanks-cohn/chute/issues/17). This UI goes **in the Shelf settings**, NOT the small Chrome extension popup Settings. No Development 2 work.

## Required user flow
Within Shelf Settings add a clean **History Export** section, with three selectable scopes:
1. **From the beginning (All history):** earliest recorded history event through export time.
2. **Today:** one complete day according to the user's **local timezone**, not current live basket alone.
3. **Selected date range:** inclusive From/To date pickers, timezone-labeled, validation (start <= end), defined empty-result behavior.

Action button: **Export History**. User picks at least CSV or JSON. File name should identify Chutey, scope, date range and export timestamp, e.g. `chutey-history-2026-11-01_to_2026-11-16.csv`.

## Actual Chutey data/source code
- `src/chute/store.py` records append-only daily events in `<Chute data>/history/YYYY-MM-DD.tsv` using UTC timestamps, with add/remove/clear/recall history events.
- `history_dates`, `history_day`, `history_page` and `history_month_counts` exist. The existing `/api/browse?scope=history` displays saved items in pages and is not necessarily sufficient alone to export a complete event timeline.
- Never make "All history" mean the visible 30 card page, just the current live basket or only newest date.
- Export should preserve a useful **saved-item ledger** with UTC timestamp and local formatted date/time, event kind, ID, name, stored original name where appropriate, byte size, MIME/type and recorded source metadata. Clearly document whether the export is all chronological events, saved items, or both; events such as removal are not permission to erase prior adds.
- **Metadata export only by default.** Do not package full file contents, hidden tokens, credentials, raw Chrome native messaging secrets, private permission grants, or arbitrary unrelated filesystem paths. If source URL was stored as history data, handle deliberately and safely; avoid accidentally exporting local sensitive paths. No network upload.
- Dates are UTC-named files but **Today** and chosen date ranges must include events by local-day boundaries correctly (DST and midnight). CSV must escape formulas (spreadsheet injection) and quotes/newlines properly; JSON must remain valid/UTF-8, preserve non-ASCII filenames.

## Engineering and safety
- Read-only and copy-only. **Never mutate, truncate, delete, migrate or rewrite the original history logs** during export. Export must not alter queue, live-state flags or files; should not automatically trigger `clear` or `remove`.
- For potentially thousands/millions of events, use bounded server-side streaming or bounded cursor-based pagination/temporary export and response download; avoid full-history JavaScript JSON blobs or memory exhaustion on 4 GB Windows. Make progress/cancel/error behavior clear and don't confuse incomplete files with complete successful exports.
- Concurrent ongoing file saves/history append should remain safe; define consistent snapshot or cutoff time, and handle partial last lines. Path traversal and untrusted metadata must never become a filesystem read vector.
- Show a summary after successful completion with scope, count and destination or download, without claiming success before actually ready.

## Acceptance
- All time, Today, inclusive custom range (including spanning months and local/UTC midnight) produce correct events/counts. Test empty history, malformed date input, duplicates, removed/cleared/recall items and long chronology.
- Round-trip UTF-8, quotes, newlines; CSV injection resistance; no secrets or out-of-root reads; no source-history mutation.
- No regressions to Shelf History view/navigation, popup Settings or popup gallery, YUMMY feedback, live transfers and memory usage.
- Native implementation only if needed; produce separately tested matching candidate and opt-in steps. Preserve installed worker and owner archive until approval.

**Commit/push only Development 1 work, report validations and wait for the owner's Windows acceptance. Development 2 remains locked.**
