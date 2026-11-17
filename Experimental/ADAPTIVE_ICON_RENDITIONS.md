# Experimental — Adaptive Icon Renditions & Smart Cache

**Recorded:** 2026-11-17  
**Status:** Future idea / proposal only; **not implemented or enabled**  
**Surface:** Chutey landing page / extension gallery and other compact icon presentation views

## Owner's idea

Down the line, Chutey should be able to replace small on-screen preview icons with **properly generated, presentation-quality small image renditions**. Do **not** convert every image in the collection. Let the landing page naturally identify the pictures that are worth preparing: a picture that has remained on Chutey's landing extension surface for **more than one minute** can become a candidate for a refined mini-rendition.

Keep the processing footprint deliberately small: **about 16 or 25 small icon renditions per batch** rather than an expensive full-gallery rebuild. The user can opt into this presentation enhancement and control deletion of the renditions in Settings.

## Proposed behavior

1. **Opt-in adaptive renditions.** Default OFF under Settings → Experimental. When disabled, retain the current lightweight thumbnail behavior, with no migration or wholesale regeneration.
2. **Candidate identification.** Track which image cards actually spend **at least 60 seconds** on the landing/gallery surface. Prefer *visible, actively displayed* cards; do not accrue dwell time for hidden/background tabs or offscreen cards merely left in a data array. Resume counters if reasonable without repeatedly selecting the same image.
3. **Small batch budget.** Allow an experimental batch-size choice of **16 or 25** candidate images. This is the number of renditions selected per batch, **not** 16–25 parallel expensive decode jobs. Keep decoding and rendering concurrency low and capped, and pause on low-memory/low-disk or active user interaction.
4. **Purpose-made compact art.** Create correctly oriented, sharp, consistently sized small preview renditions with sensible aspect-ratio handling, crop/fit behavior, transparency and color management. Avoid awkward stretching, distorted subjects, unnecessary upscaling, or mixing poor source thumbnails into a polished presentation. Maintain the original full-size image for opening/zooming.
5. **Reuse on later visits.** Save only derived mini-renditions in a bounded local cache with stable source identity plus rendition-version/size. Use cached results when available, and invalidate when the source actually changes. Don't regenerate on each visit.
6. **Deletion/settings.** Provide **Delete generated icon renditions** as an explicit action, with confirmation and an estimate of reclaimed space. Also consider optional retention age, max cache size and automatic least-recently-used pruning. Deleting renditions **must never delete originals, Chutey History, tags, collection metadata or downloaded files**.
7. **Safe fallback.** If an image is unsupported, inaccessible, corrupt or too costly to process, show its existing/default icon immediately and skip it without blocking the gallery. Work is low-priority and cancelable.
8. **Privacy & separation.** Generate locally where feasible; no upload to a third-party image service without separate permission. Do not borrow permission from REDOWN, Click2Cloud or a cloud connection. Do not silently scan local drives; candidates come from Chutey's already-permitted landing-view content.

## Suggested experimental Settings

| Control | Suggested default | Meaning |
| --- | --- | --- |
| `adaptive_icon_renditions` | OFF | Enable refined small images for eligible landing-view candidates |
| Candidate dwell threshold | 60 seconds | Minimum visible/active time before selection |
| Batch size | 16 (option: 25) | Maximum new renditions selected in one batch, not concurrent jobs |
| Cache budget | Bounded, tune after tests | Prevent runaway disk or memory consumption |
| Automatic cleanup | OFF until tested | Optional age- or budget-based generated-rendition pruning |
| Delete generated renditions | Manual action | Clear this derivative cache without touching originals |

These are conceptual controls, **not existing implementation settings**.

## Acceptance criteria for a future experiment

- A newly displayed image does not trigger rendition generation before its 60-second eligibility threshold; hidden/inactive items do not quietly fill the queue.
- A gallery of hundreds or thousands of images converts **only eligible candidates** in bounded batches of 16 or 25, never the entire library automatically.
- Results look meaningfully better at small dimensions, with no distorted aspect ratio or visibly broken orientation.
- Reopening the view reuses generated icons; a changed source invalidates the right cache entry.
- Manual delete removes cached renditions, recovers storage, and leaves original files, History, tags and gallery entries intact.
- Tests cover Chrome restart, extension worker sleep, reduced memory, critically low disk, corrupted formats, and an interrupted batch; presentation continues with fallback icons.
- No regression to the stable Chutey worker or current landing/gallery responsiveness.

**Guardrail:** This document records an experiment only. No present worker, extension UI, feature flag, file conversion, or release is changed by recording it.
