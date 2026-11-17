# NECESSARY FIX — Turbo mode makes Folder Access movie playback checkbox unresponsive

**Owner field report:** November 17, 2026, installed Windows Chrome/Chutey TEST candidate.
**Priority:** P0/P1 owner-device usability and control-plane responsiveness; investigate alongside worker P0 media stalls and resource growth.
**Status:** OBSERVED; not reproduced independently, no runtime fix performed.
**Verified installation:** Windows worker SHA-256 e17cf38642f0ba82d8bc405a6f1f97756228a510579df1f2a7b2a2e2dbea8a11; installed native helper SHA-256 9b7035e2efa1a314e8d7e5547b475af517bbd1f9556370689d65a260bc4bf72a. Chrome loaded extension source/ID **not yet independently verified**. Tested package source 1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122.

## Exact owner symptom

In Settings > Folder Access the UI shows:
> Checking approved folder…
>
> Allow movie media playback
>
> Optional playback for the approved folder. This does not grant another folder or change read/write access.

**Observed:** The owner cannot check the **Allow movie media playback** checkbox in **Turbo**; it seems to lag/freeze. Switching from **Turbo to Balanced** allows checking/enabling the checkbox. Do not assert a permanent permission defect, memory leak or direct Turbo root cause without a controlled same-session comparison. Related owner-device failures include stuck 10-second MP4 at "Loading media…", BUSY resource messages and documented worker memory growth.

## Inspected source and plausible mechanisms (tested version)

- extension/settings.js creates **the movie checkbox initially disabled** and shows "Checking approved folder…" until an asynchronous refresh completes.
- refresh(force) calls transport.nativeSession(false), then Promise.allSettled([performance_get, media_policy_get, roots]). The UI enables the checkbox **only when media_policy_get resolves with a boolean and native session scope is not saved_store**. It sets disabled if the lookup fails or the companion hasn't returned usable policy.
- The control's onchange disables it while waiting for media_policy_set acknowledgement, then re-enables it in finally. A timed-out/stalled control request or repeated refresh can produce a grey/unresponsive control.
- **Potential UI race:** Forced refresh calls may supersede earlier requests via refreshGeneration; investigate whether ongoing simultaneous native-session/refresh events and stale responses leave UI marked disabled without final state being applied. Do NOT describe this as proven root cause.
- src/chute/explorer/api.py uses a control lane for media_policy_get/set and performance_get/set, normally with capacity 4. The native state handler src/chute/explorer/native.py::state executes under both self.lock and adapter.engine.lock; a blocked lock-holder can affect policy acknowledgments. Need timestamped request/lock metrics.
- src/chute/explorer/performance.py defines Efficiency/Balanced/Turbo as different navigation/thumbnail/prefetch admissions, but preserves **control capacity of four** and **media capacity of two** across modes. Turbo does not intentionally disable media-policy permission. Turbo allows more thumbnail/navigation work and might increase contention on constrained hardware, but this is a **hypothesis**, not established causation.
- Existing media approval state for an explicitly approved folder should persist independently of mode; saved_store scope intentionally disables external-folder playback choice. Owner switching to Balanced and then succeeding suggests a transient mode/load/timing issue, not evidence that a new folder grant was intended.

## Required diagnosis

1. Capture the exact state on Turbo: checkbox DOM disabled/checked, folderStatus, movieStatus, session.scope, media_policy_get/set receipt and completion/latency, and whether any request is pending indefinitely. No secret bearer, folder path, file name or consent token in shared logs.
2. Compare Turbo → Balanced → Turbo in one stable session with the **same approved folder** and no new grants. Collect control lane active/busy/latencies, navigation/thumbnail workloads, worker RSS/private bytes, threading and processor utilization. Include an idle Turbo check to distinguish mode from load.
3. Reproduce with video pinning, thumbnails, active scroll/search and a previously opened movie; also test a quiet idle folder with no media active.
4. Verify the checkbox is never disabled merely due to a performance mode, and that accessibility, focus and UI updates remain responsive. If real owner-approved external folder scope is absent, the checkbox **must truthfully explain saved-store fallback**, not misleadingly show endless "Checking approved folder…".
5. Instrument policy command stages and lock wait, including nativeSession(false), roots, get/set and refreshGeneration cancellation/supersession. Preserve private path/token protections.
6. Make the control-plane independent of thumbnail/video/nav saturation. Do not increase global thread pool or remove safe admission caps to mask starvation. Use bounded backpressure/priorities or lock-scope improvements supported by traces.
7. Ensure completion/error states settle the spinner and checkbox within a defined timeout/retry path. No optimistic "enabled" label without worker acknowledgement; no silent loss of the user's approval choice if request is pending.
8. Add actual Windows Chrome regression: movie checkbox responds and persists in each Efficiency/Balanced/Turbo mode, across repeated switches, with 1 pinned video + 1 image active; validate on low-RAM ~4GB class device and compare throughput/memory.
9. Preserve existing external-folder read/write grants; changing performance mode must never grant/revoke access. Do not use Restore Defaults or uninstall as a workaround.

## Owner-available safe workaround pending engineering fix

Remain in **Balanced** while enabling the checkbox and testing a single short MP4, and use Settings > Folder Access > Refresh connection status if needed. This is diagnostic mitigation only; don't claim Turbo or playback is repaired. Avoid repeated approval clicks while UI is unresponsive or memory pressure is high.

## Acceptance

Playback consent can be checked/unchecked normally in Turbo as well as Balanced/Efficiency, with prompt acknowledged status, even when browsing images and playing a short MP4. Mode changes preserve both saved playback policy and approved-folder identity. Stalled requests show a specific error and offer a bounded retry. No unbounded memory/requests or BUSY storm.

**Links:** Issue #23 settings, Issue #28 worker stalls; Owner viewport preview Issue #30; next Codex P0 owner-acceptance request. This file is a diagnosis/handoff specification; no code fix, merge, installation or GOLD promotion is authorized.
