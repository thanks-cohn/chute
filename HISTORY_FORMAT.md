# Chute History Format v1

Chute history is designed to stay readable without Chute itself.

## Location

By default, Chute keeps all state under:

```text
~/Chute/
```

History is split by UTC calendar day:

```text
~/Chute/history/2026-08-21.tsv
~/Chute/history/2026-08-22.tsv
```

This keeps day lookup cheap and avoids one giant database file.

## Encoding and record format

Each history file is plain UTF-8 text. It is append-only.

The first two lines are:

```text
# CHUTE-HISTORY	1	UTF-8	TSV	PCT
# timestamp_utc	event	id	name	stored_name	size	mime	source_path
```

Every following line contains exactly eight tab-separated fields:

1. `timestamp_utc` — ISO-8601 UTC timestamp, normally with microseconds and a trailing `Z`.
2. `event` — `add`, `remove`, `clear`, or `recall`.
3. `id` — Chute item identifier.
4. `name` — original display filename.
5. `stored_name` — filename used under `~/Chute/files/`.
6. `size` — decimal byte count.
7. `mime` — MIME type.
8. `source_path` — original source path or browser source marker.

Every field is percent-encoded before it is written. Tabs, newlines, Unicode text, percent signs, and other arbitrary filename/source characters therefore cannot alter the column structure.

## Minimal parser contract

A reader can process the format without a JSON, SQL, or Chute-specific library:

1. Read UTF-8 lines.
2. Ignore lines beginning with `#`.
3. Split each remaining line on the tab byte (`0x09`).
4. Require exactly eight fields.
5. Percent-decode each field as UTF-8.
6. Parse `size` as an unsigned decimal integer.

This is intentionally straightforward to implement using ordinary C file I/O (`fopen`, `fgets`, delimiter scanning, and a small percent-decoder).

## Compatibility rule

`CHUTE-HISTORY 1` is frozen. New optional behavior may be added around it, but the meaning, ordering, and encoding of these eight columns must not change.

If Chute ever needs an incompatible history representation, it must use a new magic/version header rather than silently changing v1.

## Related storage

```text
~/Chute/queue.json     current live basket only
~/Chute/files/         preserved original Chute copies
~/Chute/thumbs/        generated tiny WebP thumbnails
~/Chute/history/       append-only daily TSV history
```

Removing or clearing an item removes it from the live basket; it does not erase its history or preserved Chute copy. A historical item can therefore be recalled later while that preserved copy remains available.
