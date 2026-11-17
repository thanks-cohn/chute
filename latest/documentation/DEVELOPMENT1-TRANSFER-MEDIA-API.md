# Development 1 transfer and media API extensions

Status: Request 3B contract with [P0 repair updates](P0-NATIVE-API-2026-11-17.md); owner acceptance pending.
Uses the SAME guarded RootGrant/Transfers/Store engine as Shelf and popup.
No Movie Mode tab, transcoding, independent server, public automation enrollment,
cloud/REDOWN authority, move/delete operation or premium bulk feature was added.

## Native copy jobs (existing authenticated command endpoint)

`transfer_start` args:
- `{id,kind:"local_to_live",handle,identity}`
- `{id,kind:"local_copy",handle,identity,destination}`
- `{id,kind:"live_to_local",live_id,destination}`

ID is a client-generated 32 lowercase hex idempotency identity. Source handle
and canonical identity come from an authorized listing. Destination is a directory
handle with explicit native WRITE consent. No client paths are accepted. Reusing
an ID queries its existing result, never repeats the copy. HTTP 200 outer command
`state:completed` means dispatch completed; inspect the **inner** job state.
`accepted`/`running` never mean a transfer succeeded.

`transfer_status {id}` returns id, state, phase, kind, size, bytes, error, receipt.
Progress counts bytes copied, not source/target verification passes; phase shows
verification versus copying. Source and destination are hashed independently;
COMMITTED receipt includes SHA-256, size and destination/name or genuine Store ID.
Only one native COPY job per session runs; competing starts get BUSY. Control
requests and two bounded media requests have independent slots. No full-copy I/O
holds the Explorer global lock. Browser File receive has a separate single slot.

`transfer_cancel {id}` signals cancellation. Check subsequent status: cancellation
is not complete until state is cancelled, failed, UNCERTAIN or COMMITTED. Per-chunk
checks cover source verification, copying and destination verification. A copy
already published may finish COMMITTED or UNCERTAIN; cancellation never deletes
a published original. Source files are never removed.

`transfer_dismiss {id}` acknowledges a final COMMITTED/failed/cancelled receipt.
It deletes only that job metadata, never a file or History. API retains at most
64 undismissed receipts; scripts must record and acknowledge final results. GUI
keeps its last verified receipt in extension session storage before acknowledging
native metadata, avoiding a 64-copy usability limit. Pending/uncertain operation
IDs remain visible and cannot be silently overwritten by a new GUI operation.

Jobs journal intent/results atomically with fsync in Store/transfer-jobs. On
worker restart accepted/running becomes UNCERTAIN; old handles never auto-replay.
Committed receipts remain queryable in a new authenticated session with the same
enrolled extension origin. Crash between filesystem publication and receipt commit
requires destination inspection; automatic resume/pause is unsupported. Failed
copies retain their source and status. Normal failure/cancellation removes the
owned staging file. Abrupt process/OS death may leave `.chute-stage-*` in the
approved destination or `.ID-name.part` under Store; inspect scoped originals
and job IDs before an explicit retry. No broad temp-directory deletion or orphan
file replacement occurs. This is safe recovery visibility, not crash-atomic
filesystem/metadata transactions or arbitrary resumable transfer support.

## Actual browser File intake

Popup and Shelf History expose Add files and accept actual OS File drops. The
existing `/api/upload` accepts one known Content-Length (default 8 GiB maximum,
CHUTE_MAX_UPLOAD_BYTES configurable); destination free space is checked before
stage. JS passes the disk-backed File directly to fetch, without arrayBuffer,
base64, byte JSON or a full-file Blob copy. Sequential selection limits pressure.
Input stage is hashed, fsynced and independently read back before publication.

New optional `X-Chute-Operation` gives the intake its stable 32-hex Store ID. A
repeat of an already saved ID returns conflict, never a duplicate. Existing
headers and `{file}` response remain compatible; successful response also includes
`receipt {id,state:COMMITTED,size,sha256,mtime_ns}`. An authenticated
`upload_receipt {id}` command returns the persisted verified result; changed
size/mtime or missing receipt is UNCERTAIN, absent saved item is NOT_FOUND.
Neither means permission to blindly replay an upload. GUI retains pending ID,
provides Check import and Cancel, and offers explicit dismissal after destination
review. Worker receipt verification does not prove website delivery or source
disk identity for a browser File whose expected digest is unknown.

Disk exhaustion, incomplete/unknown-size bodies, revoked scopes, changed source,
expired session and broken sockets fail honestly. Existing deployed upload
security is unchanged; new native job/receipt operations require the enrolled
session. Local website clients gain no filesystem paths/grants. No full input
is retained in RAM. Available disk may be smaller than a movie even when RAM
usage is bounded; an 8-GiB cap is not a promise of 8-GiB free space.

## Same local media API in both viewers

Shelf preview and popup Local media use nativeSession → roots/list → media_source
with `{handle,identity}`. The popup's explicit Choose authorized folder invokes
the same native picker; merely opening it grants no path. Its media references
are not Store IDs and don't import/copy original bytes. Saved media resolves
through locate_saved. Local-original preview has no Trash It! or silent import.

`media_source` → `{url,ticket,mime,size,range,expires_in}`. Short-lived ticket is
scoped to exact extension Origin, renewable file-specific authority, guarded handle
and canonical file identity. GET/HEAD preserve existing 206, Content-Range,
Content-Length, Accept-Ranges and 416 semantics. Shared format-independent byte
transport reads at most 256 KiB per block; codec decoding belongs to Chrome.
Only previewable passive media receives a direct-play ticket. No automatic
transcoding or claim of support for every MP4/WebM codec. Current eligible MP4,
WebM and MP3 are exercised with actual decoders. `canPlayType` is a hint; decoder,
network and expired-session errors remain possible and visible.

Players use `<video>`/`<audio>`, preload=metadata and normal browser seek. Shelf
playback is pinned independently of ordinary folder navigation and image/text
previews. Stop/Close or deliberately replacing media releases its lease; popup
unload also releases. Each lease lasts 120 seconds and authenticated renewal
occurs every 45 seconds. Ordinary broad-session expiry preserves a continuing
file-specific lease; explicit revocation or lease expiry stops reads. The same
Origin/Host/guarded-file rules remain enforced. Two bounded media reads have
independent control, navigation, preview, thumbnail and intake lanes. Writes time
out after 15 seconds; no whole-movie Blob is created. See the P0 API document for
actual limits, diagnostics, mode persistence and verification boundaries.

## Gesture matrix and explicit boundaries

| Gesture | Repair behavior / limit |
|---|---|
| OS file picker/drop → popup or Shelf History | Native browser File → streaming upload, verified receipt; default 8 GiB backend ceiling plus actual free disk |
| OS actual File → approved Explorer directory | Existing 256-KiB guarded receive, independent SHA verification, explicit WRITE consent |
| Chutey Explorer → Live | Copy selected to Chutey → native asynchronous job; original bytes and source retained |
| Chutey Explorer → another approved local directory | Copy/Paste or internal reference drop → native job; no whole-file base64; 32-MiB cap removed from this path |
| Live/History item → approved local Explorer | Native job via saved ID, same RootGrant destination checks |
| Chutey item → supported website input | Legacy bounded File/DataTransfer relay only up to 32 MiB; larger files explicitly require website's native file picker with original local file |
| Chutey item → normal Windows file target | Chrome/OS DownloadURL behavior varies; opaque Chutey token is not a Windows file path. Use explicit native Copy/Paste to an approved folder; no universal OS drag claim |
| Browser image right-click / page drag into mascot | Existing image/link/text capture and original verified YUMMY preserved; not arbitrary protected-site movie download |
| External cloud/REDOWN/unknown byte-only drag | Not enabled / no cloud authority granted |

OS/native drag acceptance still requires owner Chrome/Windows validation. API and
browser fixture bytes/receipts are evidence for tested paths, not universal drag
compatibility. Transfer counts and YUMMY never treat dispatch/uncertain results
as verified completion.

Example PowerShell with an existing enrolled session:
```powershell
$headers=@{Origin=$origin;Authorization="Bearer $sessionToken"}
function Invoke-Chutey($command,$arguments) {
  (Invoke-RestMethod 'http://127.0.0.1:17891/api/explorer/v1/command' -Method Post -Headers $headers -ContentType 'application/json' -Body (@{command=$command;args=$arguments}|ConvertTo-Json -Depth 6)).result
}
$id=[guid]::NewGuid().ToString('N')
$j=Invoke-Chutey 'transfer_start' @{id=$id;kind='local_copy';handle=$sourceHandle;identity=$identity;destination=$writeApprovedDirectory}
while($j.state -in @('accepted','running')) { Start-Sleep -Milliseconds 500; $j=Invoke-Chutey 'transfer_status' @{id=$id} }
if($j.state -ne 'COMMITTED') { throw "Inspect destination: $($j.state) $($j.error)" }
$j.receipt | ConvertTo-Json
# Record the receipt before acknowledging:
Invoke-Chutey 'transfer_dismiss' @{id=$id}
```
