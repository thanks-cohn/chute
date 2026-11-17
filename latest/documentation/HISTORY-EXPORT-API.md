# History export API, version 1

Available through the existing authenticated `POST /api/explorer/v1/command`
envelope, exact enrolled Origin, loopback Host and Bearer session. GUI and API
use the same implementation; no folder selection is needed to export the user's
Chutey metadata. Native enrollment is still required. No files are exported.

- `history_export_create`: args `{scope:"all"|"today"|"range",timezone:"America/Chicago",from?:"YYYY-MM-DD",to?:"YYYY-MM-DD"}`.
  Range dates are inclusive local calendar days. Today uses export acceptance
  time. IANA timezone data is packaged for Windows. Invalid/reversed dates fail.
  Returns a unique job `id`, `state`, `phase`, `count`, scope, timezone, dates,
  snapshot `cutoff` UTC, filename. Accepted/running is not completion.
- `history_export_status`: `{id}`. Same originating authenticated session only.
  States accepted → running → ready, failed or cancelled. Ready adds `size`,
  `sha256`, and relative `url`. Count is CSV events processed, not live cards.
- `history_export_cancel`: `{id}`. Signals running work or removes the ready
  temporary ZIP; never changes source history. Idempotent while job retained.
- `GET /api/explorer/v1/history-download/{capability}`: a one-hour, random 256-bit
  download capability. No general session token in URL. Exact loopback Host;
  rejects a foreign Origin; absent Origin supports Chrome's native downloader.
  Attachment is one verified ZIP, Content-Length and no-store. Keep URL private.
  Cancellation may interrupt a download; Chrome must report completion separately.

One job builds at a time across clients; at most four undownloaded ready ZIPs.
Jobs expire after one hour and temporary files are removed by bounded periodic
cleanup. Normal process exit removes owned files; an OS crash may leave a
`chutey-history-export-*` temp directory (never treat it as a completed export).
No splitting, sharding, per-file downloads or JS Blob of the ZIP. Browser Downloads
permission provides Save As, destination choice, progress and verified download
completion. Cancel, insufficient space, interruption or access errors never
produce a success message or alter original files. Retry starts a fresh snapshot.

ZIP64 is enabled and CSV/JSON members force ZIP64 streaming. Archive members are
`history.csv`, `history.json`, `manifest.json`, including for zero events. CSV
formula-leading strings are apostrophe-prefixed; JSON retains original metadata.
Schema `chutey.history.events/1`: timestamp_utc, timestamp_local (offset included),
event, id, name, stored_name (basename), size, mime, source, source_kind. Includes
all recorded add/remove/clear/recall events in append order within UTC daily logs,
not just saves or current basket. Local paths are redacted; HTTP(S) source URLs
omit userinfo/query/fragment to avoid exporting credentials. No grants or tokens.

Snapshot captures per-log byte lengths under Store's append lock; reads only those
complete lines, excluding a partial last line and later appends. CRC-checks every
archive member and computes SHA-256 before ready. It never repairs malformed
source logs: malformed complete records or a truncated/replaced log fail explicitly.
Memory is bounded by one metadata record (maximum 1 MiB) and ZIP buffers. Extremely
large metadata records fail explicitly; neither history nor output is truncated.

Example (an already enrolled client):
```python
import requests,time
headers={"Origin":enrolled_origin,"Authorization":"Bearer "+session_token}
endpoint="http://127.0.0.1:17891/api/explorer/v1/command"
def command(name,args):
    r=requests.post(endpoint,headers=headers,json={"command":name,"args":args});r.raise_for_status();return r.json()["result"]
j=command("history_export_create",{"scope":"all","timezone":"America/Chicago"})
while j["state"] in ("accepted","running"):
    time.sleep(1);j=command("history_export_status",{"id":j["id"]})
assert j["state"]=="ready",j
with requests.get("http://127.0.0.1:17891"+j["url"],headers=headers,stream=True) as r:
    r.raise_for_status()
    with open(j["filename"],"wb") as out:
        for block in r.iter_content(262144):out.write(block)
```
