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
