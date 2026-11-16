# CODEX REQUEST 3C — DEVELOPMENT 1 ONLY: Shelf Settings -> Export History

**Owner request, 2026-11-16.** Issue [#17](https://github.com/thanks-cohn/chute/issues/17). This UI goes **in the Shelf settings**, NOT the small Chrome extension popup Settings. No Development 2 work.

## Required user flow
Within Shelf Settings add a clean **History Export** section, with three selectable scopes:
1. **From the beginning (All history):** earliest recorded history event through export time.
2. **Today:** one complete day according to the user's **local timezone**, not current live basket alone.
3. **Selected date range:** inclusive From/To date pickers, timezone-labeled, validation (start <= end), defined empty-result behavior.

Action button: **Export History**. **Every export always produces EXACTLY ONE downloadable .zip archive, regardless of how large the history is.** Never generate multiple ZIP volumes, multiple ZIP downloads, parts, shards, segmented archives, or separate CSV/JSON downloads to work around memory limits. Include **both CSV and JSON** history data *inside the same single ZIP* (plus an optional compact manifest with scope, UTC/local timezone, range, count, schema and snapshot cutoff). File name identifies Chutey, scope, date range and export timestamp, e.g. `chutey-history-2026-11-01_to_2026-11-16.zip`. The selected period determines the ZIP contents, not the number of ZIPs.

## Actual Chutey data/source code
- `src/chute/store.py` records append-only daily events in `<Chute data>/history/YYYY-MM-DD.tsv` using UTC timestamps, with add/remove/clear/recall history events.
- `history_dates`, `history_day`, `history_page` and `history_month_counts` exist. The existing `/api/browse?scope=history` displays saved items in pages and is not necessarily sufficient alone to export a complete event timeline.
- Never make "All history" mean the visible 30 card page, just the current live basket or only newest date.
- Export should preserve a useful **saved-item ledger** with UTC timestamp and local formatted date/time, event kind, ID, name, stored original name where appropriate, byte size, MIME/type and recorded source metadata. Clearly document whether the export is all chronological events, saved items, or both; events such as removal are not permission to erase prior adds.
- **Metadata export only by default.** Do not package full file contents, hidden tokens, credentials, raw Chrome native messaging secrets, private permission grants, or arbitrary unrelated filesystem paths. If source URL was stored as history data, handle deliberately and safely; avoid accidentally exporting local sensitive paths. No network upload.
- Dates are UTC-named files but **Today** and chosen date ranges must include events by local-day boundaries correctly (DST and midnight). CSV must escape formulas (spreadsheet injection) and quotes/newlines properly; JSON must remain valid/UTF-8, preserve non-ASCII filenames.

## Engineering and safety
- Read-only and copy-only. **Never mutate, truncate, delete, migrate or rewrite the original history logs** during export. Export must not alter queue, live-state flags or files; should not automatically trigger `clear` or `remove`.
- **SINGLE-ZIP SIZE RULE:** For potentially thousands/millions of events, use ZIP64-capable archive creation and bounded server-side/chunked processing so one ZIP can exceed classic ZIP's 4-GiB limits if storage allows. Stream individual CSV and JSON members into the archive using constant/bounded buffers; never build the full export or entire ZIP in JavaScript memory. Protect the ~4 GB RAM host through streaming/backpressure, not splitting into many ZIP files.
- A single ZIP may be constructed as one bounded on-disk temporary file and downloaded only after final ZIP integrity checks, or streamed as a single ZIP response with a reliable completion protocol. **One output ZIP only**. Do not leave completed shards/parts or partial downloads named as successes; remove safely scoped temporary artifacts after success/cancel/failure, without touching source history.
- If the destination has insufficient free space, filesystem size limits, access failures, or other unavoidable constraints, clearly report **the single export could not complete**; never quietly split into multiple archives or truncate history to make it fit. Offer retry/save elsewhere without changing the chosen scope. Make progress/cancel/error behavior clear; verify archive central directory and expected member count before declaring completion.
- Concurrent ongoing file saves/history append should remain safe; define consistent snapshot or cutoff time, and handle partial last lines. Path traversal and untrusted metadata must never become a filesystem read vector.
- Show a summary after successful completion with scope, count and destination or download, without claiming success before actually ready.

## Acceptance
- All time, Today, inclusive custom range (including spanning months and local/UTC midnight) produce correct events/counts **in exactly one .zip each**, containing both CSV and JSON metadata representations. Test empty history, malformed date input, duplicates, removed/cleared/recall items and long chronology.
- Round-trip UTF-8, quotes, newlines; CSV injection resistance; no secrets or out-of-root reads; no source-history mutation. Test ZIP64 and archive integrity, growing histories and low-memory stress: no multiple ZIP outputs, no failed partial output masquerading as success.
- No regressions to Shelf History view/navigation, popup Settings or popup gallery, YUMMY feedback, live transfers and memory usage.
- Native implementation only if needed; produce separately tested matching candidate and opt-in steps. Preserve installed worker and owner archive until approval.

**Commit/push only Development 1 work, report validations and wait for the owner's Windows acceptance. Development 2 remains locked.**
