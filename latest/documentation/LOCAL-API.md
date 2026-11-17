# Local Explorer API — implemented Phase 1 interface

See `local-api.openapi.json` for machine-readable HTTP envelopes. This documents
implemented behavior, including limitations; proposed batch jobs and the media
adapter registry are in `API-FIRST-ARCHITECTURE-2026-11-16.md` and
`MEDIA-ADAPTER-CONTRACT.md` and are not current endpoints.

## Authentication and scope

Default service: loopback `127.0.0.1:17891`. Explorer is disabled until a native
approved root/session is attached. Native messaging host `com.thankscohn.chute`
provides `get_native_capabilities`, explicit folder picker actions
`explorer_select_folder` / `explorer_select_write_folder`, and `explorer_resume`.
Messages are UTF-8 JSON prefixed by a four-byte little-endian byte length. Native
protocol parity is `1.1`; HTTP envelopes retain version `1.0` when supplied by
the Explorer dispatcher. Resume never silently opens a picker.

Every HTTP command requires exact enrolled `chrome-extension://[a-p]{32}` Origin,
loopback Host and `Authorization: Bearer <session>`. Sessions expire in at most
900 seconds. Scripts may exercise an explicitly provided approved session;
independent script enrollment/authentication remains unimplemented. Do not put
tokens in commands, logs, documentation or URLs. Do not disable Origin checks.
Read sessions cannot authorize writes; writes require native approved scopes.
Opaque handles expire when their grants/session are replaced. A handle is not a
path, Chute saved-item ID, URL, preview token or native OS HANDLE. Identity must
come from the same engine record. Refresh on FILE_CHANGED or invalid handles;
never silently target another file. No arbitrary paths are accepted.

## Commands and receipts

POST `/api/explorer/v1/command`, `Content-Type: application/json`:

```json
{"command":"list","args":{"handle":"opaque-folder","offset":0,"limit":100,"sort":"name","query":""}}
```

Success: `{"state":"completed","result":{...}}` (the dispatcher also supplies
`version` and `operation_id`). Failure: `{"state":"failed","error":{"code":
"...","message":"..."}}`, normally HTTP 400; authorization errors HTTP 403,
capacity HTTP 429. Always check receipt state and HTTP status. Unsupported
operations do not return fake success. Existing transfer commands return
synchronous receipts, not accepted asynchronous job IDs.

| Command | Parameters | Result / scope |
| --- | --- | --- |
| capabilities | none | command/blocked catalogs, limits; newer worker advertises media |
| roots | none | approved root handles, names, kind; never all unrestricted drives |
| list / search | handle; offset=0; limit=100 (1–200); sort=name/type/date/size; descending=false; query="" | entries, total, next_offset, parent, name, consistency; max 20,000 enumerated items |
| stat / preview | handle | file record; preview adds image/video/text/pdf/unavailable |
| resume_location | none | remembered approved location/view, native adapter required |
| remember_location | handle, view | save approved location and nonsensitive view state |
| revoke_access | none | revoke native persisted folder consent |
| prepare_export | handle, identity | short-lived one-use source capability, original file max 32 MiB |
| export_to_live | capability | verified copy receipt in Live basket |
| receive_from_live | id, destination, operation_id | approved destination copy; native state reconciles receipts |
| recent_transfers | none | retained native copy receipts, not a task queue |
| reconcile_transfer | operation_id | confirmed destination result or uncertain state |
| media_source (new test worker only) | handle, identity | scoped URL/ticket, expires_in, MIME, size, range=true |
| release_media (new test worker only) | ticket | idempotent released=true; ends authority and active reads |

Records include handle, name, kind, size, modified_ns, MIME and canonical
identity. Page entries must be followed using `next_offset`; an empty page is
not permission to scan another root. File/folder replacement and links are
checked by RootGrant. No client-side path resolution.

`mkdir`, `rename`, `copy`, `move`, `trash`, and `receive` in the core command
dispatcher remain gated; HTTP uploads use the separate receive endpoint.
There is no batch job creation/progress/pause/resume API.

Development 1 candidate additions (separate worker; not the installed baseline):

| Command | Parameters | Result / scope |
| --- | --- | --- |
| locate_saved | id (32 hex characters, no path) | Store-resolved file metadata, parent and scoped read handles for existing saved-file/custom-derivative storage only |
| open | handle, identity | Windows only; dispatch to associated application, result action=open/status=accepted; this does not claim the application displayed the file |
| reveal | handle, identity | Windows only; preserve the existing Shell selection/reveal helper; result action=reveal/status=selected or folder |

Open/Reveal require the exact enrolled session/origin and current identity.
They resolve the path only inside the guarded grant, never from an HTTP path.
System Open is restricted to known passive image/audio/video/text/PDF suffixes
and previewable types; executables, scripts and shortcuts are rejected even
if their MIME registration says text/plain. The core engine's generic open/
reveal commands remain gated; the authenticated HTTP adapter explicitly owns
these checked actions. Capabilities advertises them separately. Older workers
return UNSUPPORTED_COMMAND or NATIVE_CONSENT_REQUIRED truthfully.

The GUI defaults to Chutey for Reveal (containing folder + exact file selected)
and Open (inside Chutey). Explicit Preview always stays inside Chutey regardless
of the Open preference. Preferences `chuteyRevealTarget` and `chuteyOpenTarget`
accept `chutey`/`system` in extension sync storage. Saved-file Windows Reveal
continues to use the unchanged `/api/reveal/{id}` endpoint, including on the
old worker. New saved-file Chutey navigation uses locate_saved in the candidate;
it does not fabricate a native handle from a saved item ID. These source/API
changes require Windows validation before promotion.

## Content, thumbnails and compatibility

POST `/api/explorer/v1/content` with authenticated JSON:

```json
{"handle":"opaque-file","identity":"canonical-identity","thumbnail":true}
```

Returns actual JPEG thumbnail bytes (up to 256×256), or guarded preview bytes.
Thumbnail input is bounded to 16 MiB / 24 million pixels; decoder failures and
unsupported formats are explicit. PNG/JPEG/GIF/WebP/BMP are current image
formats; SVG/AVIF/HEIC are not promised. Audio previews include MP3/M4A/WAV/FLAC/Ogg/WebM where the browser supports their codecs. Video containers MP4/WebM/Ogg depend on
browser codecs, not universal decoding. Images cap at 32 MiB; text at 256 KiB;
HTML/JavaScript previews are not executable. Content supports single byte ranges.
Cancel the request to stop unnecessary work; browser workers cap thumbnail
requests at three concurrently and abort obsolete folder jobs.

**November 4 migration:** source `b0727d56f89484d110fe7b1d24e12ba9bf476611`
rejects unknown envelope fields with `Expected a file handle.` Never include
`original:false` with this worker. The shared adapter now omits that field.
Newer workers optionally allow `original:true` for bounded original-file
exports; do not send it to the archived worker or reinterpret a failed export
as completed. Updating the extension does not require replacing the installed
worker for image previews or thumbnails.

## Optional Phase 1 video source (separate candidate worker)

`media_source` validates the current authorized audio/video identity and issues one
origin-bound random read ticket for a single file; no general session token or
filesystem path is placed in its URL. At most 32 tickets per adapter; lifetime
is min(600 seconds, session lifetime). GET and HEAD the returned URL using the
exact enrolled Origin; a cross-origin browser `<video crossorigin="anonymous">`
provides that Origin. The read ticket replaces the Authorization header only
for that one media URL. Other routes still require the bearer. Session expiry,
file identity and authority are checked during access. Tickets are redacted in
server request logs. Do not print returned media URLs in application logs.

GET: 200 full body or 206 single range, correct Content-Length, Content-Range
and Accept-Ranges: bytes. Suffix/open-ended ranges are supported; invalid or
multiple ranges yield 416 and `Content-Range: bytes */size`. HEAD returns full
metadata without bytes and ignores Range. Reads are 256 KiB chunks and are not
whole-file Blobs. release_media is idempotent and stops active reads at chunk
boundaries; disconnects close file contexts. Session expiry also stops reads.

This is an Explorer preview interface, with the existing four-request adapter
limit. It is not yet the format-independent Phase 2 media engine, has no codec
probe/adapter registry, and cannot claim fair sustained movie workloads. A
future Phase 2 registry will use shared scoped source/output abstractions.
The old worker returns UNSUPPORTED_COMMAND for media_source: previously supported small video clips use a
bounded 32 MiB fallback; large files report the required separate test worker.
No installed executable is replaced automatically.

## Guarded receives

POST `/api/explorer/v1/receive`, bearer + enrolled Origin, raw octet-stream,
known Content-Length; X-Chute-Destination (approved opaque folder handle),
X-Chute-Filename (percent-encoded filename), X-Chute-Operation (unique hex ID).
The existing transfer engine stages, checks integrity and commits. Check its
`state: COMMITTED` receipt; network failure may leave an uncertain result and
must be reconciled before retrying. Existing implementation supports bounded
individual transfers, not general bulk/move jobs. See source transfer limits.

## Errors and cancellation

Common codes: UNAUTHORIZED, INVALID_HOST, INVALID_ARGUMENT, INVALID_HANDLE,
NOT_FOUND, FILE_CHANGED, DIRECTORY_CHANGED, PERMISSION_DENIED, PREVIEW_LIMIT,
PREVIEW_UNAVAILABLE, INVALID_IMAGE, DECODER_UNAVAILABLE, INVALID_RANGE,
STREAM_EXPIRED, BUSY, NATIVE_CONSENT_REQUIRED, UNSUPPORTED_COMMAND. Error
messages must remain actionable and must not expose private paths. HTTP
connectivity failure is distinct from format/decode failure. No result is
successful solely because a button was pressed or a job was accepted.

## Script examples (approved session only)

`tools/chutey_api.py` uses the same authenticated API as Explorer, with no GUI
simulation and no enrollment bypass. Set CHUTE_SESSION_TOKEN securely in the
process environment; do not paste it into shell history. Example invocations:

```sh
python tools/chutey_api.py --origin chrome-extension://YOUR_ENROLLED_ID roots
python tools/chutey_api.py --origin chrome-extension://YOUR_ENROLLED_ID list --handle APPROVED_FOLDER
python tools/chutey_api.py --origin chrome-extension://YOUR_ENROLLED_ID preview --handle APPROVED_FILE
python tools/chutey_api.py --origin chrome-extension://YOUR_ENROLLED_ID thumbnail --handle APPROVED_FILE --output /tmp/thumb.jpg
python tools/chutey_api.py --origin chrome-extension://YOUR_ENROLLED_ID range --handle APPROVED_VIDEO --range bytes=0-4095 --output /tmp/chunk.bin
```

The sample stream command releases its ticket in a finally block. It requests
bounded bytes and never downloads a whole movie. A 2,000-file job or interrupted
job recovery example cannot be implemented truthfully until Phase 2 jobs exist.
Future examples must distinguish accepted jobs from completed verified files.

PowerShell equivalent for current browse/thumbnail operations:

```powershell
# CHUTE_SESSION_TOKEN must already be injected securely, never pasted here.
$headers = @{ Origin = 'chrome-extension://YOUR_ENROLLED_ID'; Authorization = "Bearer $env:CHUTE_SESSION_TOKEN" }
$base = 'http://127.0.0.1:17891/api/explorer/v1'
$roots = Invoke-RestMethod "$base/command" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"command":"roots","args":{}}'
if ($roots.state -ne 'completed') { throw 'Browse failed' }
$folder = $roots.result.roots[0].handle
$body = @{command='list';args=@{handle=$folder;limit=100;offset=0}} | ConvertTo-Json -Depth 6
$listing = Invoke-RestMethod "$base/command" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
```

Native Windows authorization, installed-extension parity, default application
opening and Explorer revealing still require real Windows integration tests.
Linux fixture success is not that evidence.

## Development 1 repair acceptance

See [Development 1 results and Windows gate](../../codex-11.16.2026/DEVELOPMENT1-IMPLEMENTATION-AND-VALIDATION.md). The new Windows-specific tests are unrun on Linux. Do not treat mock Shell calls as real Windows application/reveal evidence.

## Development 1 count and recovery update

GET `/api/status` returns `{ "service": "chute", "count": N }` with the existing basket CORS policy. It does not grant filesystem access or replace scoped Explorer authentication. The extension background worker shares/cache-coalesces count reads for 30 seconds and uses mutation events for immediate refresh. Old servers without this route use the existing list endpoint at the shared fallback rate.

Native `get_native_capabilities` now advertises `safe_recovery:1`. Automatic ensure/resume on an unavailable bridge requires that capability; old helpers may kill by image name and are not automatically invoked. A healthy old pairing remains supported. Candidate recovery never terminates live/unknown processes and rate-limits exact-target launches. Browser `chute-diagnostics` returns bounded recovery reason/timing and count counters, not tokens, paths or browsing data. No arbitrary process control API was introduced. See [final repair handoff](../../codex-11.16.2026/DEVELOPMENT1-FINAL-REPAIR-HANDOFF.md).

## Development 1 Request 3 additions

Implemented extensions: [single ZIP64 History export](HISTORY-EXPORT-API.md),
[daily highlight capture and paged text](DAILY-HIGHLIGHTS-API.md),
[asynchronous copy, import receipts and shared media](DEVELOPMENT1-TRANSFER-MEDIA-API.md).
All use the existing permission-checked engine. Export and copy dispatch receipts
are not completed work; poll the documented inner job states. Earlier synchronous
commands remain compatible. See the updated OpenAPI enum and endpoint definitions.
