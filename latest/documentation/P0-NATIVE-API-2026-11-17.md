# P0 native API changes — 2026-11-17 TEST candidate

These are implemented additions to `/api/explorer/v1/command`, not a second file engine. Native messaging stays protocol `1.1`; the command envelope stays `{command,args}` with a completed/failed dispatch receipt. Each request needs the exact enrolled extension Origin, `Host: 127.0.0.1:17891`, current session Bearer, JSON content type, and at most 16 KiB. There is no new independent scripting-client enrollment or website filesystem authority. Existing approved-session scripts and GUI clients use the same engine.

See [OpenAPI](local-api.openapi.json), [clipboard v1](WINDOWS-CLIPBOARD-API.md), [copy recovery](PENDING-COPY-RECOVERY-2026-11-17.md), and [safe test installation](P0-2026-11-17-HANDOFF.md). Never log session tokens, media tickets/URLs, private paths or original bytes.

## Commands

| Command | Arguments | Implemented result |
|---|---|---|
| performance_get | `{}` | mode, effective_limits, hardware, resources, metrics, queue_policy |
| performance_set | `{mode:"efficiency"\|"balanced"\|"turbo"}` | acknowledged persisted mode and current limits; invalid mode fails |
| media_policy_get | `{}` | allowed, scope, migrated |
| media_policy_set | `{allowed:boolean}` | persisted playback product consent for the existing native-approved root; does not broaden read/write access |
| media_source | `{handle,identity}` | file-specific url, ticket, expires_in, MIME, size and range=true; playback consent required |
| renew_media | `{ticket}` | renewed=true, expires_in=120; expired/released/revoked leases cannot be resurrected |
| release_media | `{ticket}` | released=true, idempotent; active reads stop at chunk boundaries |
| media_status | `{ticket}` | available, original_get:{status,code,origin_present} or null, lease_seconds |
| media_diagnostics | `{}` | last 128 redacted issue/renew/release/error events and active lease count |
| transfer_verify | `{id,destination?}` | original job result with verification: VERIFYING, VERIFIED or REVIEW_REQUIRED; destination is an approved directory handle, never a path |
| transfer_dismiss | `{id,reviewed?:boolean}` | acknowledge committed result or explicitly dismiss reviewed terminal uncertainty/failure; journal evidence is retained |
| clipboard_copy_files | `{files:[{handle,identity}],user_gesture:true,version?:1}` | verified OS file-list clipboard write; not a completed paste |
| clipboard_copy_image | `{handle,identity,user_gesture:true,version?:1}` | verified native pixel clipboard formats and dimensions |
| clipboard_read_files | `{user_gesture:true,version?:1}` | paste-only snapshot, expires_in=300, metadata/indexes for at most 128 OS-selected files; no paths |
| clipboard_release | `{snapshot,version?:1}` | close the private snapshot; not a general permission revocation |

Native `media_policy_set` is available only through the enrolled permission context. Newly approved external folders start OFF, existing pre-policy approvals migrate to ON to retain prior behavior, with `media_policy_migrated:true` recorded and returned. Settings makes that migration visible. Turning playback OFF marks existing streams revoked while retaining folder read/write access. Saved-store scope is distinct from an external folder approval.

`transfer_start` retains existing forms and adds `{id,kind:"clipboard_to_local",snapshot,index,destination}`. Snapshot indexes resolve through the native clipboard module, and copying uses the existing staged, no-clobber, independently hashed receive engine. A successful dispatch/accepted state is not completion. Poll `transfer_status`; only a valid COMMITTED digest receipt proves that tested copy completed. Progress byte counts cover copying, with explicit source/destination verification phases. No move/delete, pause/resume or automatic uncertain replay was added.

An accepted asynchronous copy holds only its fixed source/destination authority, checks explicit root revocation/cancellation on each chunk, and has a 24-hour hard deadline. Ordinary broad session expiry does not abort that accepted operation. New commands still require a current bearer. Worker restart does not replay a running copy; its durable state becomes UNCERTAIN for review/verification. Verification is asynchronous when hashing is needed and shares the single-copy budget. Retained private journal identity allows fast same-artifact reconciliation; legacy results need a destination-scoped hash check.

## Scheduling and resource diagnostics

| Preset | Navigation | Thumbnails | Thumbnail prefetch budget |
|---|---:|---:|---:|
| Efficiency | 2 | 1 | 1 |
| Balanced (new-user default) | 4 | 2 | 2 |
| Turbo | 6 | 3 | 3 |

These are ceilings, not promised parallel speedups. Available RAM below 1.5 GiB caps navigation at 3 and thumbnails at 2. Below 512 MiB available, navigation/thumbnails cap at 1 and prefetch at 0. Thumbnail work also caps at half the logical CPU count, minimum 1. All modes preserve separate control=4, preview=2, media=2, receive/highlight intake=1 and 256-KiB file blocks. Server request threads cap globally at 32. One copy/verification per enrolled-origin job manager remains deliberate. Already admitted work is not killed when switching modes.

Mode changes are atomically persisted in the worker store, acknowledged through the API, and reflected in both surfaces through a sync-storage change notification. The worker is authoritative: an old or unavailable worker produces a visible unsupported/error state rather than a cosmetic Turbo label. History, grants, original bytes and credentials are not settings-reset targets.

`metrics` contains per-lane completed, active and rejected BUSY counts plus p50/p95/p99/worst service time over the last 512 completed requests. Client benchmarks separately measure end-to-end latency. `resources` contains current-process CPU seconds, resident/peak/private memory where supported, Python thread count, and numeric system/disk counters. Windows process CPU percentage can be computed from successive CPU-second and wall-time samples; values exceeding 100% can indicate multiple cores. No directory/file names are included. No claim of lock-wait or disk-bandwidth instrumentation is made.

Excess lane requests return 429 BUSY immediately; no long queue executes stale clicks. OPTIONS validates Host/Origin but is not charged to a heavy lane. Global thread exhaustion yields 503. Back off on BUSY; do not select a new root or assume disconnection. Abort stale list/search/content requests. Control, media and thumbnail admission are independent. The browser thumbnail queue applies the acknowledged thumbnail limit.

## Streaming protocol and lifecycle

MP4/WebM/MP3 (and already previewable passive audio/video) use the same format-independent file bytes path. Chrome handles decoding; container suffix does not guarantee codec support. No new Movie Mode, codec adapter implementation or transcoder is introduced in Development 1.

A media lease lasts 120 seconds; the active player obtains authenticated renewal every 45 seconds, resuming/renewing the broad native session without a picker. Adapter renewal shares the existing file-specific lease registry. GET/HEAD require the exact enrolled Origin and loopback Host; no Authorization header is required for that one scoped URL. An omitted/other Origin is rejected. A website cannot use this interface. Lease renewal cannot grant a different file or extend a revoked grant. On Chrome close the player stops renewing, so abandoned authority expires promptly; Stop/Close sends release explicitly.

GET supports 200 or a single 206 range with correct Content-Length, Content-Range and Accept-Ranges. Suffix/open-ended ranges work; invalid/multiple ranges return 416 with `Content-Range: bytes */size`. HEAD returns full metadata without bytes and ignores Range. Source identity is revalidated before access; per-chunk lease/revocation checks and bounded socket writes close stale reads. Seek reuses the established streaming API.

Shelf keeps one active pinned player independent of list refresh, parent/back/forward, selection, search, ordinary image/text preview and resizing. Explicit selection of another media item replaces it. Ordinary row selection does not replace it. The popup owns its own stream. Two simultaneous media requests are supported across surfaces; a third active read receives BUSY. Browser buffering can finish an individual GET before playback ends; stream-slot occupancy is not the number of visible players.

`media_status.original_get` takes priority over a subsequent HEAD when diagnosing a player error. It records only status, safe error code and whether Origin was present. A 403 does not alone prove that the folder was revoked. Known categories include UNAUTHORIZED, INVALID_HOST, STREAM_EXPIRED, FILE_CHANGED, EXPLORER_DISABLED, BUSY, decode failure, browser cancellation and disconnect. After headers have been sent, stream truncation cannot change the prior HTTP status; authenticated diagnostics distinguish late lease/revocation failure.

## Approved-session examples

The caller must already have an enrolled session, securely injected into its process environment; these examples do not bypass native consent or introduce independent client enrollment.

PowerShell:

```powershell
$origin=$env:CHUTE_ENROLLED_ORIGIN
$headers=@{Origin=$origin;Authorization="Bearer $env:CHUTE_SESSION_TOKEN"}
function Chutey($name,$arguments) {
  $r=Invoke-RestMethod 'http://127.0.0.1:17891/api/explorer/v1/command' -Method Post -Headers $headers -ContentType 'application/json' -Body (@{command=$name;args=$arguments}|ConvertTo-Json -Depth 8)
  if ($r.state -ne 'completed') { throw 'Operation failed; inspect the safe error code' }
  $r.result
}
Chutey 'performance_set' @{mode='balanced'}
$roots=Chutey 'roots' @{}
Chutey 'list' @{handle=$roots.roots[0].handle;limit=100;offset=0}
# Query original pending ID, never invent a replacement ID to retry uncertainty.
$j=Chutey 'transfer_status' @{id=$pendingId}
if ($j.state -in @('COMMITTED','UNCERTAIN')) { Chutey 'transfer_verify' @{id=$pendingId} }
```

Python (standard library, with already-authorized handles):

```python
import json, os, urllib.request
base='http://127.0.0.1:17891/api/explorer/v1/'
headers={'Origin':os.environ['CHUTE_ENROLLED_ORIGIN'],
         'Authorization':'Bearer '+os.environ['CHUTE_SESSION_TOKEN'],
         'Content-Type':'application/json'}
def command(name, args):
    request=urllib.request.Request(base+'command',
        data=json.dumps({'command':name,'args':args}).encode(),headers=headers)
    with urllib.request.urlopen(request, timeout=15) as response:
        value=json.load(response)
    if value['state']!='completed': raise RuntimeError(value['error']['code'])
    return value['result']
source=command('media_source', {'handle':approved_handle,'identity':identity})
try:
    request=urllib.request.Request('http://127.0.0.1:17891'+source['url'],
        headers={'Origin':headers['Origin'],'Range':'bytes=0-4095'})
    with urllib.request.urlopen(request, timeout=15) as response:
        assert response.status==206
        prefix=response.read(4096)  # bounded, not a whole-movie download
finally:
    command('release_media', {'ticket':source['ticket']})
```
