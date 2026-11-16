# Development 1 final repair candidate — owner Windows testing pending

Date: November 16, 2026. Branch: `codex/2026-11-16-phase1-repairs`.
Execution authority: [Request 1 — fix and stop](CODEX-REQUEST-1-DEVELOPMENT1-FIX-AND-STOP.md).
Continued from `a257db0`, using the existing source audit and `f5cefb5` repairs.
The audited checkpoint tag has not been changed. Final source SHA and artifact
hashes accompany the push/review bundle; no Windows executable is claimed here.

## Confirmed causes versus unresolved hypotheses

**Confirmed source defects:** every mascot iframe fetched and parsed the full
`/api/files` list every 1.2 seconds, successful requests were logged, and the
Windows wrapper appended without a retention limit. Native wake used broad
`taskkill /IM Chute.exe /F` after two short failed probes. Background fetch
recovery replayed writes, including uploads whose receipt might have been lost.
These defects can waste resources or disrupt work. The supplied 20 log lines
show successful polling, not a crash trace. The composition of the entire
373,125,474-byte legacy log has not been established.

**Receipt reaction:** the original CSS, artwork and `animate('success')` source
were present. The prior flow waited for a count request before reacting; two
count refreshes surrounded the result, and drag completion/blur could hide the
host before feedback became visible. Capture-normalization rejection could also
escape the provenance wrapper before intake cleanup. These are demonstrated
ordering/visibility/error-path defects, not proof of precisely which one the
owner encountered on Windows. The new interactive browser test confirms the
original reaction is visible through the full input/HTTP/receipt path.

**Still unknown:** whether the reported disappearance was auto-hide, disabled
floating mode, lost content DOM, MV3 sleep, native authorization, Chute.exe death,
or Chrome/profile failure. No current Windows Event Viewer, Reliability Monitor,
Chrome crash record, or memory/disk measurement was available in this Linux
session. Old readings (283 MB available RAM and very low C: free space) are
historical evidence of pressure, not a proven cause of either reported crash.

## Changes

### Shared count refresh and lower idle traffic

- `background-status.js` owns one in-flight count request and a 30-second cache
  for the extension profile. `bin.js` no longer downloads `/api/files` every
  1.2 seconds. Visible clients use the shared broker; hidden clients stop timers.
- Candidate `GET /api/status` returns only `{service:'chute', count:N}` from the
  authoritative Store. It still computes the current Store count; this is a
  small response, not a claim of constant-time backend enumeration.
- Old workers fall back to the existing list endpoint at the same shared rate;
  an unavailable status endpoint is probed at most once per five minutes.
- Confirmed mutations trigger a 250 ms coalesced refresh and count propagation.
  A save arriving while a count response is in flight triggers another snapshot.
  Count I/O cannot delay the save's success reaction or hold up the intake queue.
- Shelf's separate history probe is now visibility-aware, at 15-second fallback
  intervals, with count-change events prompting refresh. That probe is not
  included in the mascot-only count benchmark below.
- Recent-client and request diagnostics are bounded counters. They expose counts,
  not browsing URLs, file names, tokens or tab IDs. This deduplication is within
  one extension/profile; independent browser profiles have independent brokers.

### Bounded runtime logging, legacy log untouched

- Candidate Windows wrapper writes **`chute-runtime.log`**, not `chute.log`.
  Active file: at most 2 MiB; two backups: at most 6 MiB total, plus a byte lock.
  Existing oversized `chute.log` is never opened, truncated, moved or deleted by
  the new logger. Git source does not change the installed binary's log behavior.
- Each append closes its handle before rotation. A Windows byte lock coordinates
  cooperating processes; rotation never falls back to truncating an open file.
  Lock/disk errors are counted and reported on a later successful write, rather
  than recursively logging or crashing the server. An already oversized file at
  the *new* managed name is preserved/refused, not silently destroyed.
- Successful read/poll access records and ordinary client cancellations are quiet. Mutations and failed requests
  keep method, route category, status and timestamp, without URL query text,
  private filenames or stream tickets. Exceptions retain class, numeric OS error
  when available, and up to 12 code frames without raw private exception text.
- Startup records numeric resource measurements. Main/server errors use bounded
  logs; native diagnostics and browser recovery events have bounded retention.

### Original received-file reaction, verified receipts only

- Preserved original `happy` CSS animation, YUMMY, happy face and count bounce.
  The reaction starts immediately after all batch upload receipts are verified;
  intake activity pins the existing mascot through blur/drag and feedback.
- A receipt requires a real saved-item ID and matching byte size. Failed, blocked,
  incomplete or uncertain receipts never play the successful reaction. A partial
  batch keeps its confirmed files and reports failure/uncertainty honestly.
- Lost responses are never automatically resubmitted. The widget retains CHECK
  feedback and asks the user to inspect the basket before retrying. Ordinary
  count refresh cannot clear an uncertain receipt or erase an active reaction.
- Custom-image compatibility fallback is limited to an actually missing old
  endpoint (404/405/501); a network loss or 500 is not permission to create a
  second copy in a different store. Metadata finalization remains additive.

### Bounded recovery, no broad process kills

- The existing MV3 native-wake owner handles reconnect; no second watchdog,
  browser reload loop or mandatory notification click was added. Visible count
  activity supplies a low-frequency independent trigger if the native process
  genuinely died. Background/suspended pages recover on ordinary visibility/use.
- Native automatic wake checks exact canonical executable image identity under
  a per-target Windows mutex. A live but unresponsive process, unknown identity,
  full/unwritable recovery-state storage or another recovery attempt is a reason
  to stop and report, never to kill processes or interrupt uncertain saves.
- Launch rate metadata survives helper restarts: at most three launches per ten
  minutes, with cooldown/backoff. Browser wake is single-flight, uses bounded
  health probes, exponential backoff and a 120-second circuit cooldown after
  repeated failures. An already healthy bridge can be recognized immediately.
- **Legacy helper protection:** automatic wake requires the new native
  `safe_recovery:1` capability. A stopped bridge paired with the old broad-kill
  helper does not receive automatic ensure/resume calls. The working old pairing
  remains usable when healthy; an unavailable old pairing needs normal manual
  startup or a separately tested matching candidate. No old helper was patched
  or replaced here. A new extension cannot make an old binary's code safe.
- A separate lifetime startup mutex excludes duplicate serving candidates within
  the Windows desktop session; it is distinct from the helper launch mutex, so
  waiting for health does not deadlock startup. Duplicate starts exit before
  spawning discovery/server threads.
- Installer code also refuses to replace a live/unknown installed target instead
  of killing every process named Chute.exe. No installer was run in this session.
- Missing host DOM is remounted using one retained host/frame, with a three-per-
  minute limit and cooldown. It never reloads Chrome or replays intake. If a
  save is pending, recovery does not reset that iframe; external DOM destruction
  may leave an uncertain receipt requiring basket inspection. That case is not
  falsely called completed or transparently recoverable.
- UI state distinguishes normal auto-hide, disabled floating mode, saving,
  disconnected native transport and remount cooldown. Privacy-safe recovery
  diagnostics contain reason enums/times and counters. MV3 sleep is not a crash.
  Disabled/unloaded extensions cannot reenable themselves; toolbar pinning and a
  crashed whole Chrome process require Chrome/user action. No claim otherwise.

## Executed tests and measurements

All application writes and fault injection used synthetic data in this isolated
Linux cloud machine, not the owner's Windows installation.

- **106 Python tests passed; 12 skipped; 37 subtests passed.** The added real
  Windows process-enumeration check and prior Windows tests are skipped here.
- JavaScript syntax, worker cold boot/native recovery, thumbnail/icon, mascot/
  context/auto-hide, drag, API compatibility, popup, package and settings-boundary
  checks passed. Legacy unsafe helper gating, one-flight/backoff/circuit behavior,
  no POST replay, and custom-save uncertainty are exercised.
- **Interactive Chromium receipts:** trusted Chromium input supplies real local
  File objects through page content routing and the iframe; real mouse HTML5
  webpage-text drag is also exercised. Store bytes/receipts, the real CSS happy
  reaction, YUMMY/face/count and visible host are checked. Single and multi-file
  drops pass. Rejected and partial saves do not play happy; a deliberately lost
  receipt causes exactly one POST/one backend commit, CHECK feedback and no
  automatic replay. Missing idle host is restored without duplication/data loss.
  This is real browser interaction with simulated extension enrollment/runtime,
  not physical Windows OS drag or installed Chrome acceptance.
- Original repair fixtures passed: 120 full-sized popup cards at every density,
  bottom-image decode, thumbnail/icon persistence, gallery scrolling/navigation,
  unchanged overlay/list geometry, real small MP4 and large MP3 source playback,
  legacy small-video fallback, and Open/Reveal preference routing.
- **Count benchmark:** production bin/broker code under a deterministic clock:

| Visible clients | Three-minute reads, including startup | Full-list reads | All hidden for 60 sec | Confirmed save burst |
| --- | --- | --- | --- | --- |
| 1 | 7 status | 0 | 0 reads | 1 shared refresh |
| 4 | 7 status | 0 | 0 reads | 1 shared refresh |
| 16 | 7 status | 0 | 0 reads | 1 shared refresh |
| 16, old worker | 1 missing-status probe + 7 lists | 7 | 0 reads | 1 shared refresh |

  Old nominal polling alone was 50 full-list reads/minute/**per iframe**. The
  new steady-state mascot rate is two shared reads/minute/profile. These are
  controlled-clock request counts, not owner Windows wall-clock performance.
  Additional tests cover a mutation during an in-flight count, 50 concurrent
  wake requests collapsing to one initial helper attempt, a three-failure circuit,
  no replay of a lost POST, and bounded event retention.
- **Linux log measurement:** 8,192 synthetic writes / 16,629,760 input bytes in
  0.931 sec; peak traced Python allocation 424,340 bytes; three retained files
  totaling 6,144,925 bytes; zero dropped writes; the final error remained present.
  Legacy fixture content was unchanged. Separate tests cover restarts, a locked
  rotation, later error retention, large Unicode writes and private-data omission.
  Timing and allocator figures describe this Linux run only, not Windows I/O.
- **Cloud resource snapshot:** about 33,341 MiB available of 34,087 MiB RAM;
  63,885,123,584 bytes free workspace disk during measurement. This is entirely
  different hardware from the owner's machine and does not update their C:/RAM
  measurements or explain their Chrome crash.

Commands:

```sh
.venv/bin/python -m pytest -q
node scripts/verify-runtime-efficiency.cjs
node scripts/verify-worker-boot.cjs
node scripts/verify-chutey-tabs-and-mascot.cjs
node scripts/verify-explorer-api.cjs
.venv/bin/python scripts/verify-receipt-browser.py
.venv/bin/python scripts/verify-phase1-browser.py
.venv/bin/python scripts/verify-explorer-browser.py --fixture /tmp/chutey-final-overlay
.venv/bin/python scripts/verify-development1-browser.py
.venv/bin/python scripts/build-chrome-store.py
```


## Changed file map

| Files | Purpose |
| --- | --- |
| `extension/background-status.js`, `background-entry.js`, `background.js`, `bin.js`, `shelf.js`, `popup.js` | Shared counts, lightweight reads, mutation notifications, visibility and receipt feedback |
| `extension/bin-provenance.js`, `content.js`, `content-auto-hide.js` | No duplicate fallback after uncertain save; receipt visibility and guarded remount |
| `extension/background-native.js`, `native-wake-page.js`, `bridge-reconnect.js`, `explorer-api.js` | Single-owner bounded recovery, legacy safety gate, no write replay or recovery on user cancellation |
| `src/chute/runtime_log.py`, `server.py`, `windows_app.py` | Bounded logging, private-data-safe errors, resource snapshots, lightweight status |
| `src/chute/windows_processes.py`, `native_host.py` | Exact image identity, exclusion/rate metadata, removal of broad termination |
| `tests/test_runtime_efficiency.py`, `scripts/verify-runtime-efficiency.cjs`, `verify-receipt-browser.py` | Log/API/native guard tests, shared-count/recovery clock tests and interactive input/receipt tests |
| Existing worker/API/mascot regression scripts; API/handoff docs; `collect-chutey-resource-diagnostics.ps1` | Retained regression coverage, documented contract and read-only Windows diagnostics |

## Isolated owner Windows handoff

Use a disposable VM/test machine and its own Chrome profile with sufficient
headroom. Do not run the self-installing candidate against the protected host,
replace its helper/registration, or stop its working Chute.exe. The standalone
`scripts/phase1-isolated-worker-check.py` uses only temporary data and an ephemeral
port; the normal packaged Windows installer is not an isolated checker.

Update a **separate test checkout**, Windows CMD:

```bat
git fetch origin && git switch codex/2026-11-16-phase1-repairs && git pull --ff-only origin codex/2026-11-16-phase1-repairs
```

Read-only resource/error snapshot (no process termination or log deletion):

```bat
powershell -NoProfile -File scripts\collect-chutey-resource-diagnostics.ps1
```

Record current C: space, physical/virtual memory, Chrome/Chute PIDs/working sets,
Application event IDs/times and candidate hashes. Inspect Reliability Monitor,
Event Viewer and `chrome://crashes` for the affected Chrome/test profile. The
resource script deliberately excludes raw event messages, paths and command
lines. Do not share private logs/tokens or infer a crash cause from free space
alone. Do not add simultaneous builds/test windows on a resource-starved host.

Required owner checklist:

1. Old protected pairing remains unchanged. Candidate worker/helper/source in
   the VM match; native capability is safe_recovery:1 and enrollment IDs persist.
2. Check real idle/background/multi-tab request counts and counter updates after
   confirmed single/batch saves; old-worker fallback stays bounded.
3. Candidate runtime log stays within its 2 MiB + two backups limit through
   restart/rotation; errors/crash evidence survive. The legacy log is untouched.
4. Real webpage images/text and local-file drag/drop show the exact original
   reaction; rejected/partial/uncertain saves do not. Count refresh, blur,
   right-click, auto-hide and reconnection do not hide a valid receipt reaction.
5. Only in the disposable VM, record the exact candidate PID, image path and
   creation time before fault injection. Test owned process death/relaunch,
   unresponsive health, repeated crashes, MV3 suspension, content DOM removal,
   background/focus/resume, native denial and intentionally hidden/disabled UI.
   Verify no name-based kills, no duplicate instances/restart storm, no write
   replay, no mandatory notification click, and actionable platform limits.
   Never terminate by image name or target the production host.
6. Repeat the original eight repair goals: 120-card geometry; real thumbnails/
   persisted icons; gallery keys/scroll/overlay; real profile and USB access with
   guarded errors; native enrollment; audio/large media plus small MP4; mascot
   right-click; default Chutey Open/Reveal and actual Windows alternatives.

### Existing large production log — no cleanup executed

Do not truncate/rename/delete the active legacy log to test these fixes. First
review its metadata and preserve relevant tail/error evidence to an owner-chosen
external location. Any later archival/removal is a separate reviewed maintenance
operation after confirming which exact process owns the handle and safely
closing it. That maintenance is not authorized or performed by this candidate.
No saved files/history, security software or pagefile were changed to reclaim
space. Installing source changes does not shrink the old installed worker's log.

## Stop and preserved references

Original installed worker reference:
`C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`.
Original extension, images/history, Chrome profile, native registrations,
archived source/release and audited tag remain untouched by this work.

The candidate is handed over for the owner's personal Windows validation.
No automated result, CI status, source review, or this report authorizes the
next development. No Development 2 branch, mascot redesign, portable Explorer,
folder Assign, legal-pad UI or other Development 2 implementation was created,
queued or started. Only a later separate explicit owner instruction can do so.
