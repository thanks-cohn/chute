# Proposal: Color-coded download calendar

**Status:** Proposal only — document the requested feature; do not change app behavior in this commit.

## Intent

In Chute's calendar view, color each date by the **number of downloads saved through Chute on that date**. A glance at the month should tell users which days contain many saved downloads and which dates are empty, so they can jump to the desired day's downloads without guessing or opening dates one by one. This is a count of saved downloads, **not price, file size, bandwidth, or a dollar amount**.

## Color legend (discrete ranges)

| Saved downloads on the date | Calendar date appearance |
| ---: | --- |
| 100 or more | Deep green |
| 50–99 | Light green |
| 25–49 | Yellow |
| 1–24 | Red |
| 0 | No activity color: retain the normal calendar day styling |

The ranges are nonoverlapping: exactly 25 is yellow, exactly 50 is light green, and exactly 100 is deep green. An empty day must not be painted red. Keep date numbers legible in both light and dark themes; provide a text count/accessible label as well as the color, rather than relying on color alone.

## User interaction

- Populate the calendar using the saved download records, updating a date's color when a new qualifying download is successfully saved.
- Selecting a colored day opens or filters the corresponding history/downloads for that date. Show the count on hover/focus or alongside the date when space permits.
- Empty dates remain normal and need no misleading activity indicator. Provide the same date navigation independently of color.
- If a saved download can be recalled from history, recalling it is not a new download and should not inflate the historical count.

## Data and implementation notes

- Prefer deriving daily totals from **existing persisted successful-save records**, rather than maintaining a second unsynchronized count. Only count downloads actually saved through Chute; do not count failed attempts, removals, clears, or history recall actions.
- The current v1 history format is append-only, has timestamps and event types, and is stored in UTC-day TSV files (see `HISTORY_FORMAT.md`). Group by the user's *displayed local calendar date* when showing a local-time calendar, including records from adjacent UTC files near midnight. Do not change the frozen v1 history schema merely to implement colors.
- If the current data cannot distinguish a saved download from another kind of basket addition, use an existing reliable provenance signal where available or introduce a backward-compatible classification/index for future saves. Do not silently label every historical `add` event a download if the app accepts non-download files, links, and text.
- Keep daily aggregation lightweight: cache/index counts if needed, and invalidate only affected dates after a new saved download. Keep calendar navigation responsive for long histories.

## Acceptance examples

- 0 qualifying downloads: unchanged day background.
- 1, 24: red; 25, 49: yellow; 50, 99: light green; 100, 120: deep green.
- A download saved just after local midnight appears on the new *local* day even if its history entry lives in the previous UTC-date file.
- Opening a green day shows that date's saved downloads; recalling/removing an item does not create a second saved-download count.

**Outcome:** The calendar doubles as an intuitive download-activity map and a fast date-based navigation tool.


---

# Addendum: JSONL provenance history, human discovery, and an agent-friendly API

**Storage decision: pure JSONL. NO SQLite, SQL, relational database server, or SQL-style schema/migration/permissions system.** Chute's canonical *new* saved-item metadata and provenance records should be ordinary UTF-8 JSON Lines files: one independently parseable JSON object per line. The original preserved files remain normal local files. Humans interact through an intuitive calendar, search, and item details; agents/programs consume the same structured metadata through a small local API or user-authorized JSONL export.

## Purpose: save the discovery as well as the file

For each item deliberately saved through CHUTE, capture what is actually known **at save time**:

- Stable \`item_id\`, file name/type/size, UTC timestamp, category (\`download\`, desktop import, link, etc.), and whether the preserved original remains available.
- **Resource URL** — the actual file/image URL, if known and suitable to retain.
- **Page URL** — the address shown in the source browser tab's URL bar at the time of save, if known and suitable to retain.
- Optional page title, hostname, acquisition method and provenance certainty. The page URL and resource URL must remain separate, nullable fields; never invent one from the other.
- Shared \`source_id\` or derived normalized hostname to link saved items to the same webpage/site. Plain IDs and fields are enough for relationships: **no SQL joins or separate relational engine**.

For desktop drops, temporary \`blob:\` URLs, expiring links, or unavailable browser context, record an honest null/unknown source rather than fabricating a website. A remote resource URL is historical context, not a guarantee that the resource can be fetched again. Preserve the local original.

## Human presentation

Keep the everyday basket minimal. In the calendar, a day is colored by **number of successfully saved downloads** (100+ deep green; 50–99 light green; 25–49 yellow; 1–24 red; zero uncolored). Selecting a date shows items from that **local calendar day**. An item detail or context menu can show **Where this came from**, **Open source webpage**, **Copy page URL**, **Copy resource URL**, and **Show more saved from this website** when those fields exist. Add an ordinary search/filter UI by name, source site/page, file type and date. Show the original saved file even if its links have expired. Date, website and thumbnail should be visible human cues; machine IDs should not clutter the interface.

## Storage: simple, durable JSONL files

Proposed layout (names are illustrative; implementation should fit Chute's existing directory):

\`\`\`text
~/Chute/
  files/                          # preserved originals, not duplicate JSON blobs
  metadata/
    items/
      2026-09-22.jsonl            # one saved-item or provenance event per line
      2026-09-23.jsonl
    index/
      days.jsonl                  # optional DERIVED cache; can always be rebuilt
      sources.jsonl               # optional DERIVED cache; can always be rebuilt
\`\`\`

Example **one line** in an \`items/*.jsonl\` file (displayed prettily here for readability; on disk it is a single line):

\`\`\`json
{"version":1,"event":"saved","item_id":"item_example_123","saved_kind":"download","saved_at_utc":"2026-09-22T15:15:00Z","name":"mountain.webp","mime":"image/webp","size_bytes":204800,"preserved_available":true,"source_id":"src_example_gallery","provenance":{"page_url":"https://example.com/gallery","page_title":"Landscape gallery","hostname":"example.com","resource_url":"https://cdn.example.com/mountain.webp","capture_method":"browser_save","source_status":"observed_at_save"}}
\`\`\`

**Contract:** UTF-8; each line is exactly one self-contained, versioned JSON object; stable item IDs; timestamps stored as ISO-8601 UTC; explicit \`null\` for unknown optional fields; append new immutable events rather than silently rewriting past events. A failed or partial trailing line after a crash must not destroy earlier valid records: write serialized complete lines safely, recover/skip an incomplete trailing record, and provide a deterministic repair/rebuild path. For edits/deletion, append a corresponding update/tombstone event or safely rebuild a compacted JSONL file atomically; ensure deletion also propagates to any derived index, and provide a real way to erase sensitive stored URLs on user request rather than leaving them in indefinite backups.

**Existing compatibility:** \`HISTORY_FORMAT.md\` documents Chute's *existing* frozen v1 UTC-day TSV event files. Do not corrupt them or relabel them JSONL. The proposed architecture makes **JSONL the canonical format for new provenance-aware metadata**, with a one-time or lazy, lossless import of relevant legacy records where possible; preserve the v1 TSV reader and old files for backward compatibility until an explicit migration strategy is implemented. Legacy source information that cannot be verified remains unknown. Avoid double-counting the same underlying save represented in old and new files. No SQL conversion at any stage.

**Quick lookup without SQL:** For a selected date, read the relevant JSONL day files, including neighboring UTC days where the displayed local timezone crosses midnight. For site/date search across long history, optionally maintain small derived JSONL summaries and in-memory lookup maps keyed by \`item_id\`, normalized hostname, or day. Rebuild those caches from the canonical event stream whenever needed; never make their presence necessary to recover data. Stream and paginate large files; cache only bounded information in RAM so it works on modest computers.

## API surface: same simple objects for people, programs and AI agents

Propose a small, versioned, local interface that **returns and accepts ordinary JSON objects representing the same JSONL records**. For stream/export endpoints, return \`application/x-ndjson\` (newline-delimited JSON; JSONL) so agents can process one record at a time. Individual record responses can use \`application/json\`. Do not expose SQL queries, a relational database interface, direct write access to internal index files, or require an ORM.

Illustrative future operations (adapt endpoint naming to Chute's existing companion/extension architecture):

| Capability | Proposed API | Behavior |
| --- | --- | --- |
| Describe format | \`GET /v1/capabilities\` | Reports schema version, supported actions and plain field definitions. |
| Search saved items | \`GET /v1/items?query=...&site=...&kind=...&date=...&timezone=...&limit=...&cursor=...\` | Returns JSON items with stable IDs and structured source fields; deterministic pagination. |
| Read one item | \`GET /v1/items/{item_id}\` | Returns a single JSON object, with explicit nulls for unknown provenance. |
| Calendar activity | \`GET /v1/calendar/days?month=2026-09&timezone=America/Chicago\` | Returns local-day download counts and \`none|red|yellow|light_green|deep_green\` band values, matching human UI. |
| Get items from a source | \`GET /v1/items?source_id=...\` or \`?site=...\` | Lets a person or agent discover related downloads from a webpage/site. |
| Stream/export history | \`GET /v1/items/export?from=...&to=...\` | Returns authorized records as **JSONL**, without exposing raw filesystem paths. |
| Save a new item (later) | \`POST /v1/items\` | Accepts a user-approved handoff and optional *observed*, validated provenance. Adds a proper JSONL save event. |
| Retrieve preserved content (later) | \`GET /v1/items/{item_id}/content\` | Explicitly authorized content handoff; the metadata API does not imply access to file bytes. |

The API should have short documentation, sample requests/responses, and a published **JSON Schema** for the JSONL record shape. Agents can map natural-language requests to structured filters; applications can stream/export records without needing to understand Chute's filesystem; humans get the same results through calendar, previews and search. A JSON Schema is only a documentation/validation contract for simple objects — **not a SQL schema or migration requirement**. Include clear error responses for unknown item, missing content, and denied access.

**Access without database-permission headaches:** no database accounts, SQL roles, or database administration. Keep metadata local. The application itself should still guard its API: local-only transport is not sufficient to stop a malicious webpage or unrelated process from reading a private download history. Use the platform's practical per-app/user approval and minimal read-metadata vs read-file controls; do not force the user through unnecessary permission prompts for CHUTE's own calendar and search. Never let an arbitrary browser origin call a localhost endpoint unrestricted. Source capture is tied to a deliberate save, not continuous browsing, and users can disable it or erase sensitive provenance.

## Delivery plan

1. Capture source-page and resource URLs when a user saves a file; append one clear versioned **JSONL** save record, with reliable null/unknown behavior.
2. Build the human-facing date/site navigation and calendar activity from JSONL records; add simple derived JSONL caches only if profiling shows they help.
3. Publish a read-only JSON/JSONL API with calendar, item detail, structured search, and streaming export; document examples that an agent can parse with no SQL dependency.
4. Add permissioned file handoff and writes for authorized programs/agents later, using the same simple JSONL event model. Keep CHUTE's core basket independent of the optional API.

**Acceptance:** exactly 100 successfully saved downloads on a local date colors the calendar deep green and yields count \`100\` from the API; a saved item can be found by date and original page hostname; a missing URL remains null; an agent can iterate a JSONL export line-by-line; legacy v1 TSV remains readable and does not duplicate records; no SQLite, SQL, server database, ORM, or SQL migration is introduced.

**Combined outcome:** an intuitive human calendar/history backed by small, portable, auditable JSONL records that programs and agents can understand directly — without making CHUTE a database administration project.
