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

# Addendum: Source-aware saved-item history and a permissioned CHUTE API

**Status:** Proposal only. Extend the calendar/history idea into an intuitive *memory of saved discoveries* while preserving Chute's small, fast basket. The goal is not to monitor general browsing or to turn Chute into a cloud file manager.

## The user experience: remember a discovery, not just a filename

When a person **explicitly saves an item through Chute**, retain, when available:

1. **The saved item:** stable Chute item ID, original filename, kind/MIME, size, save timestamp, availability of the locally preserved original, and thumbnail reference when available.
2. **The resource URL:** the direct URL from which the image, file, or other resource was obtained, if reliably known.
3. **The page URL:** the URL shown in the active/source browser tab when the item was saved; also retain the page title and hostname where available. The resource URL and page URL are *different fields* and may point to different domains.
4. **The relationship:** a stable reference linking an item to its source page/site and capture event, plus capture method and confidence/availability of the source data. An unknown source must remain `null`, never an inferred fact.

The saved original is the durable item. Source URLs are *context*, not a promise that the remote resource will still exist, be public, or be fetchable later. `blob:`, `data:`, signed/expiring URLs, redirects, local files, browser-internal pages, and cross-origin images need explicit missing/temporary-source handling; avoid preserving secrets in URL queries or fragments.

A user should be able to open Chute's calendar, select an active date, see the saved items for that local day, and then:

- **Open saved item** or drag its preserved copy back out.
- **Visit source webpage**, when a safe usable page URL is available; show clearly that this opens an external site.
- **Copy source URL** or **copy resource URL** individually if present.
- **Show more from this webpage/site**, grouping and searching by shared source page/domain.
- Search by filename, date range, file type, page title, domain, and known source URL; surface clear filters instead of requiring database syntax.

For an item with no trustworthy URL (for example one dragged from the desktop), show “Source not recorded,” not a fake or misleading link. Display the captured date, hostname, and human-readable title when possible, rather than exposing opaque IDs or raw URL strings as the primary UI. Keep these options within a simple item detail or context menu so the everyday basket remains uncluttered.

## Data model: a tiny local, searchable relationship index

Use an embedded **local SQLite index** if appropriate for the current runtime, or an equally lightweight embedded store after measuring integration and footprint. *No hosted database or Chute account is necessary for the initial feature.* Keep preserved file bytes in Chute's existing local storage; the index holds metadata and references, **not duplicate file blobs**. Existing `HISTORY_FORMAT.md` v1 event/UTC-day TSV data remains frozen and readable independently; do not silently change its eight-column contract. A derived index should be rebuildable from trusted history plus any additional backward-compatible provenance sidecar/event records.

Suggested conceptual entities (names and exact schema are implementation choices):

| Entity | Representative fields | Purpose |
| --- | --- | --- |
| `items` | `item_id`, `name`, `mime`, `size_bytes`, `saved_at_utc`, `saved_kind`, `preserved_available` | Stable saved-item metadata; separately mark whether an event qualifies as a successfully saved *download* for the calendar. |
| `sources` | `source_id`, `page_url`, `page_title`, `hostname` | Reuse a source record for multiple items; allow website/page grouping. |
| `item_provenance` | `item_id`, `source_id` (nullable), `resource_url` (nullable), `captured_at_utc`, `capture_method`, `source_status` | Connect an item to what was actually known when saved. Permit multiple origins/events only when genuinely recorded; do not invent relationships. |

Give `item_id` a stable identifier across the basket, historical view, and API. Index saved date, saved kind, name, normalized hostname, and source references; lazily compute or cache per-day download counts. The displayed calendar uses the user's chosen **IANA timezone**, not an accidental UTC-file boundary. Deduplicate history `add`/`recall` events by actual successful-save identity; don't count removal, recall, or failed saves as new downloads. If older entries lack reliable provenance or download classification, leave it unknown, and do not synthesize it from unrelated browser history.

## An API for applications and AI agents — human intent, machine clarity

**Propose** a documented, versioned `/v1` local API, surfaced through the existing companion via authenticated loopback/IPC and a carefully permissioned browser-extension bridge where needed. The implementation should determine the safest transport for each platform; these routes are illustrative *future contracts*, not statements about endpoints that already exist.

| Proposed capability | Example API surface | Meaning |
| --- | --- | --- |
| Discover supported operations | `GET /v1/capabilities` | Returns supported features, schema version, and granted scopes. |
| Find saved items | `GET /v1/items?query=...&kind=image&site=...&from=...&to=...&limit=...&cursor=...` | Paginated, stable IDs; explicit filters and structured results. Date-range bounds include timezone semantics. |
| Read one item's metadata | `GET /v1/items/{item_id}` | Name, MIME, timestamps, availability, and structured provenance fields permitted to the caller. |
| Get calendar activity | `GET /v1/calendar/days?month=2026-09&timezone=America/Chicago` | Per-local-day qualifying download counts and a machine-readable `activity_band` of `none|red|yellow|light_green|deep_green`. Human UI applies theme-appropriate actual colors. |
| Filter history by day or source | `GET /v1/items?date=2026-09-22&timezone=America/Chicago` or `?source_id=...` | Enables the calendar, website grouping, external clients, and agents to use the same query semantics. |
| Add a saved item | `POST /v1/items` | **Optional later write scope:** user-approved file/byte handoff with validated origin metadata. Never silently import arbitrary filesystem paths or spoof browser-observed provenance. |
| Obtain the original or initiate handoff | `GET /v1/items/{item_id}/content` or a short-lived handoff operation | Requires a separate, explicit content-read permission and may return a scoped stream/handle rather than exposing unrestricted local paths. |
| Subscribe to changes | `GET /v1/events` (optional later) | Opt-in notifications for newly saved items or updated day counts; bounded and authorized, never a general browsing log. |

Treat the route names and request shapes above as a proposed design to validate against Chute's current architecture. Keep a stable **JSON schema/OpenAPI description**, field definitions, examples, error codes (`permission_denied`, `not_found`, `source_unavailable`, `content_unavailable`), pagination limits, and clear nullability. Represent dates as ISO-8601 timestamps in UTC for storage, with explicit IANA timezone for day-based queries. Provide file-kind vocabularies and distinguish `saved_kind=download` from a desktop import or clipboard/link capture. Never fabricate a resource URL from the page URL or vice versa.

Sample *proposed* item response for agents and other programs:

```json
{
  "item_id": "item_example_123",
  "name": "mountain.webp",
  "kind": "image",
  "saved_kind": "download",
  "saved_at_utc": "2026-09-22T15:15:00Z",
  "preserved_available": true,
  "provenance": {
    "page_url": "https://example.com/gallery",
    "page_title": "Landscape gallery",
    "hostname": "example.com",
    "resource_url": "https://cdn.example.com/mountain.webp",
    "source_status": "observed_at_save"
  }
}
```

An agent should be able to map a request such as **“Find the images I saved from that architecture site sometime in July”** into an authorized structured query, show the matching files with the relevant source and date, and let the person choose what to retrieve or open. A human gets the *same data* via a simple calendar, search, thumbnails, and “more from this site” actions; neither interface needs a special proprietary export or direct access to database internals.

## Trust and resource boundaries

- **Local-first by default:** no cloud sync, telemetry, remote index, or account requirement; local metadata and originals remain under the user's control. If a future cloud option exists, make it a distinct explicit opt-in.
- **Capture only on user-directed save:** do not record continuous browsing, other tabs, or unselected site visits. Capture only the source tab applicable to the saved item, when available; do not request broad browser permissions solely for convenience.
- **URL minimization:** prefer safe canonical page URL/hostname when sufficient; omit credentials, fragments, and known sensitive query parameters. Allow disabling source capture, excluding sites/private windows, editing or deleting individual source records, and clearing the provenance index without necessarily deleting preserved files. Exclude private/incognito contexts by default unless the user explicitly opts in and the browser permits it.
- **Authorization:** a loopback listener is *not* authentication. Bind locally; require per-client/app authorization, scoped tokens or OS-level IPC permissions, origin checks/CSRF protections for browser callers, and explicit consent for content reads/writes. Search/list metadata and read original content should be separate scopes. Deny access by default; never permit arbitrary external webpages or untrusted agents to enumerate the whole history.
- **Safe handling:** redact secrets from logs and error messages; avoid exposing unrestricted filesystem paths, auto-fetching historical URLs, or automatically sending saved file contents to a remote agent. Respect deletion/retention choices and report when a preserved original or source has become unavailable.
- **Lean operation:** bounded pagination, indexed day/source queries, background-safe incremental index updates, and predictable performance on modest Windows/Linux hardware. Keep API and indexing optional when feasible so core drag-and-drop remains fast and reliable.

## Suggested staged delivery

1. **Human-first provenance:** capture safe page/resource source fields only for newly saved items where available; show an unobtrusive “Where this came from” detail and “more from this website” filter.
2. **Local relational index:** add fast searching and calendar source/day grouping without breaking the v1 history format or requiring cloud services.
3. **Read-only local API:** document capabilities, scoped item search/details and calendar counts with stable IDs and schemas; test consent, null provenance, timezone edges, and long histories.
4. **Permissioned handoff and agent clients:** add explicit content and optional write/event scopes, SDK examples, and integration with CHUTE-compatible programs (including SUBSTRATE) after the read-only model is safe and stable.

## Acceptance criteria

- Save an image from a webpage: the item retains its file plus distinct observed source-page URL and direct resource URL where available; selecting “more from this website” finds related saved items.
- Save a desktop file or a browser item with an unavailable/temporary URL: no invented origin is shown; the saved original remains usable.
- Save 100 qualifying downloads on a displayed local date: the existing calendar's **deep green** rule applies; querying the API for that date returns count `100` and `activity_band=deep_green`.
- Search/filter through the UI and authorized API yields the same item identities and date/source semantics. A disallowed app cannot list metadata or read file contents.
- Existing v1 histories remain readable. Indexed data can be rebuilt without changing the meaning of historical events; unsupported old fields remain unknown.

**Combined outcome:** CHUTE stays a small intuitive basket while becoming a private, searchable memory of saved discoveries for humans — and a well-documented, consent-based file/provenance interface for applications and agents.
