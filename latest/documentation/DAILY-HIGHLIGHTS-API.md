# Daily highlights and saved-text API, version 1

The existing enrolled, loopback Explorer session supplies authentication and
permission checks; no arbitrary client path is accepted. GUI context-menu text
capture uses this same API. Selection is always available with image context
menus, including floating-only mascot mode. Original image handling is unchanged.

`POST /api/explorer/v1/highlights`:
- Exact enrolled Origin, loopback Host, Bearer session token.
- Content-Type `text/plain;charset=utf-8`, Content-Length 1 through 4 MiB.
- `X-Chute-Capture-ID`: client-generated 32 lowercase hexadecimal ID, retained
  across an uncertain receipt. `X-Chute-Source`: percent-encoded page metadata.
- Body: exact selected UTF-8 text, no browser-added newline or HTML conversion.
- Reply 201: `state:COMMITTED`, capture_id, received_at (worker local offset),
  input_size, input_sha256, document_id, entry_offset and saved `file` metadata.
  Verify the ID, input byte length and digest; accepted is not enough. A lost
  response may safely be reconciled using the SAME ID and same bytes. Same ID
  with different bytes fails. Repetition never recalls an intentionally removed
  capture or produces a second historical add.

Worker acceptance time determines the local day. Each actual daily UTF-8 document
is `Chutey Highlights YYYY-MM-DD.txt` under Store-controlled storage (an opaque
prefix keeps its identity separate from all captures). Each entry starts with
`YYYY-MM-DD HH:MM:SS±HH:MM`, then a newline, then literal selected text. Only
trailing CR/LF at the entry boundary is normalized; internal Unicode, whitespace
and line breaks remain. Between entries exactly `\n\n\n` gives two empty lines.
First entry has no leading blanks. Source URLs are metadata, not visible text.

Each capture also retains immutable timestamped original bytes and a normal
QueueItem/history add ID. Its size and drag receipts remain valid as the daily
aggregate grows. A SQLite FULL-synchronous intent journal records ID, raw-input
digest, worker times, payload and byte offset BEFORE writing the aggregate.
Recovery checks known partial prefixes, appends missing suffixes, atomically
publishes capture bytes, and completes only a proven partial history append.
It never truncates an unexpected original. An inconsistency preserves bytes and
blocks highlight recovery with a meaningful error; ordinary Store startup and
other saved files remain available. Original history records stay unchanged.
Journal contains local private text; it is not exported or logged. Normal receipt
verification follows file and metadata fsync. No distributed exactly-once promise
is made across arbitrary external edits or filesystem failures.

`POST /api/explorer/v1/command`:
- `saved_text_page` args `{id,offset?:0,limit?:65536}`. ID must be a real saved
  text item; limit 4..65536 bytes. Returns text, offset, next (null at end), size,
  entry_offset, capture_id. Highlight IDs read their daily document; ordinary
  saved text reads its saved original. UTF-8 points stay whole across pages;
  legacy invalid UTF-8 is displayed with replacement characters. No HTML parsing.
- Existing `locate_saved {id}` resolves a highlight to its actual daily file,
  with guarded handle and identity plus `highlight {document_id,capture_id,
  entry_offset,received_at}`. No raw path is exposed. History GO TO works after
  removal from Live, without a Recall. Default Chutey navigation selects the file
  and opens a bounded page at the capture; explicit Windows Reveal also resolves
  that daily document. Open/Preview/system action preferences remain separate.

The small popup uses the same paged API, 64 KiB per page, literal `textContent`,
wrapped long lines, a scrollable reader and Previous/Next text-page controls.
Escape/backdrop closes and restores focus. It never reads a full daily file into
one browser Blob. Counter refresh occurs only after a verified receipt.

The extension retains an uncertain capture ID and digest in local extension
storage. Selecting that same passage/source reconciles safely; a different capture
is blocked with an explanation until reconciled. It does not silently discard or
resubmit a different operation. Worker-original bytes and dated History remain
accessible even if the browser lost its response.

## Presentation preference migration

`chuteyPresentation` version 2 defaults animation=false, animationOptIn=false.
Version 1 had no marker distinguishing default-on from deliberate consent, so
inherited true values migrate OFF; other image/color settings are preserved.
Only Shelf → Image and background settings exposes “Animate background behind
Chutey images”. A deliberate version-2 opt-in persists and broadcasts to popup
and Shelf. OS reduced motion always stops decoration. Off has no active CSS
background animation, including first paint. Original character/GIF playback,
real thumbnails and verified-save YUMMY art and animation are unchanged.
