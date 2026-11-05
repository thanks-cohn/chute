# P0 — Chute worker responsiveness and heavy-media resilience

**Captured:** November 4, 2026  
**Priority:** P0, fundamental usability  
**Status:** OPEN — owner-observed “busy” when clicking a folder; not yet diagnosed  
**Related integration:** REDOWN / Click2Cloud / Rcomplex OS

## Required user experience
Opening a folder, viewing a large image, playing an HD video, and opening many images in rapid succession must feel ordinary and effortless. An HD video playing while thumbnails load, folders enumerate, and drag-and-drop runs **must not freeze or monopolize Chute**. Clicking a folder must not be met with a generic “busy” dead end under normal workloads. The user should never need to wonder whether the worker has enough horsepower simply to open media.

This is a responsiveness and bounded-resource contract, **not** permission to assume the fix is a more powerful worker. Determine whether the observed “busy” reflects serial execution, lock contention, unbounded decode, over-eager previews, blocked IPC, dead worker, or a resource limit using diagnostics before modifying the architecture.

## Mandatory architecture and diagnostics
1. Keep UI, navigation, folder enumeration, worker IPC and user-facing drag/drop responsive independently of thumbnails, image decode, video playback/seek, downloads and background scans. Use bounded concurrent queues / pools, prioritize direct interactions, make expensive tasks cancellable, and apply backpressure instead of stalling all work.
2. Use progressive folder enumeration / pagination and virtualization where appropriate. Return first usable results rapidly; do not decode all media or traverse an entire tree before showing a folder. Cache/reuse metadata and thumbnails with bounded memory.
3. Large images: generate appropriately sized previews, decode off the UI-critical path, avoid unnecessary full-resolution bitmap copies, constrain memory usage, and permit fallback. HD video: rely on appropriate streaming/seek and hardware-accelerated/native playback where available rather than loading full files into RAM; verify software fallback and resource cleanup.
4. A “busy” indication must describe actual reason, affected operation and reasonable recovery (queued / currently rendering / permission / timeout / worker unavailable), while **unrelated** actions remain usable. Never fake success or silently drop an operation.
5. Protect user file integrity; no unexpected destructive operations. Support drag/drop while media is in flight. Respect constrained low-end hardware through adaptive concurrency and preview tiers, not a blanket heavy-RAM requirement.
6. Instrument end-to-end latency, UI responsiveness, queue wait, active jobs, thread/IPC contention, memory high-water, video decode behavior, error/timeout and cancellation. No sensitive local paths/contents in telemetry by default.
7. When implemented, make a reproducible regression harness for the actual owner-observed click-folder → “busy” symptom and preserve its root-cause evidence.

## Test matrix (real UI + bridge + worker, not just unit tests)
- [ ] Single ordinary folder opens without “busy” rejection.
- [ ] Folder with 1,000+ mixed files responds and scrolls while thumbnails populate.
- [ ] Large image opens/zooms while additional images and folders remain navigable.
- [ ] HD video 1080p plays/seeks as many images load and drag-and-drop continues; test higher resolutions where hardware supports.
- [ ] Bursts of file/folder operations under active video decode do not freeze input.
- [ ] Low-end / 4 GB RAM profile has graceful degradation, bounded peak resource consumption and no runaway memory.
- [ ] Worker disconnect, crash/restart, permissions, cancellation, corrupted media and temporary source unavailability recover without stuck “busy” state.
- [ ] Verify latency budgets empirically against baselines; establish measurable targets before declaring done. Log worst-case and p95 response latency, dropped frames and recovery time.
- [ ] Check no extra debug console, python popup or helper installer appears during normal user actions.

## REDOWN / Rcomplex cross-app launch criterion
Chute must reliably implement user-initiated **drag from REDOWN cloud Explorer into actual supported ChatGPT, Yandex and Google upload surfaces**. Maintain real file bytes and normal drag/drop interoperability, with live per-target attachment verification and no fake drag/URL-only shortcuts. Marketing may say “From your clouds to your AI tools. Just drag and drop” **only after** end-to-end destination tests pass. See REDOWN's `latest-1132026/IMPORTANT/MUST_HAVE_CHUTE_DRAG_FROM_REDOWN_TO_CHATGPT_YANDEX_GOOGLE.md`.

**Definition of done:** reproducibly responsive even during realistic concurrent media loads, with browser/desktop interoperability verified on the target Windows environment and retained automated stress/regression coverage. Do not mark complete from source review alone.
