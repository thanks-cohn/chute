# NECESSARY FIX — Generic unsupported/oversize message blocks many Explorer previews

**Reported by owner:** November 17, 2026 (active Windows TEST acceptance).
**Priority:** P1 preview usability / diagnosis; evaluate actual unsupported formats before changing safety limits.
**Scope:** Chutey Shelf File Explorer, TEST source 1e2b2bc6d5da0119e87bcbc0c52b86abe55dd122.
**Status:** Documentation and investigation request only; not fixed.

## Exact owner symptom

> "a bunch of the options say this 'This document/image preview is unsupported or exceeds its safe preview size. Use Open or Reveal; supported audio/video uses streaming.'"

Owner reports multiple files presenting the same generic message instead of useful preview results. Do not assume file corruption, memory exhaustion, file size, or unsupported format until actual file type/size/error cause is known. Reported during owner testing in which the native Browse picker has intermittently failed and later worked. The worker and native helper SHA-256 both matched the November 17 package; Chrome extension build/ID remains unconfirmed.

## Source-confirmed cause of this EXACT UI message

In extension/explorer-view.js, showPreview(row) receives preview metadata, then:

    if (meta.preview === "unavailable" || meta.size > 64 * 1024 * 1024) {
       body.textContent = "This document/image preview is unsupported or exceeds its safe preview size. Use Open or Reveal; supported audio/video uses streaming.";
       return;
    }

This conflates TWO distinct reasons:
- preview_kind(row) returned unavailable, including unknown/unrecognized format or unsupported content type
- any non-media preview metadata exceeds 64 MiB

Additional real limits in src/chute/explorer/api.py::content:
- Text preview is limited to **256 KiB**.
- Image original preview is limited to **32 MiB** (an image between 32 and 64 MiB passes the JS generic gate but API returns PREVIEW_LIMIT).
- Thumbnail generation in src/chute/explorer/preview.py is limited to **16 MiB** source file and **24 million decoded pixels**, with 256×256 image output.

preview.py::SAFE_IMAGES currently permits JPEG, PNG, GIF, WebP, BMP only. It does not currently recognize arbitrary image formats such as TIFF/HEIC/AVIF/SVG/RAW; document previews support PDF and selected text MIME, but Office/ZIP/etc. are not rendered by the embedded file viewer. Browser-supported audio/video uses a distinct streaming path; this does NOT authorize unlimited untrusted in-process decoding.

## Necessary behavior and technical investigation

1. Preserve first-click-to-Chutey-preview behavior documented in Necessary-fixes/FILE_EXPLORER_CLICK_PREVIEWS_HISTORY_CLICK_REVEALS_LOCATION_2026-11-17.md. Do NOT treat the generic warning as an excuse to launch Windows Explorer automatically on file click.
2. Distinguish specific outcomes with useful diagnostic categories and UI:
   - Unsupported file type: name only safe user-facing type/extension, say "Preview for [type] isn't supported yet"; offer explicit Open with system app / Reveal location buttons.
   - Image too large: identify actual file size and tested preview/thumbnail limit, optionally offer safe scaled preview; no assertion that the image is malformed.
   - Text exceeds bound: show specific bound and offer safe paged reading or first-N-KiB preview instead of ambiguous document/image warning.
   - Decoder can't handle valid format: state decode error without exposing private paths or content.
   - Worker capacity BUSY versus file unsupported versus source changed versus permissions: distinct messages with bounded retry guidance. Do not swallow codes into a generic error.
3. Inventory owner-reported file extensions, sizes, MIME resolution, preview_kind classifications, and exact API codes, excluding personal filenames/paths in shared logs. Inspect Windows MIME quirks (generic or misleading MIME) and safe extension fallbacks. Use actual owner file(s) where owner opts to supply them.
4. Evaluate more safe/common previews (e.g. AVIF, TIFF, SVG, HEIC, plain text, PDF) with real format-specific safety review and bounded decoding; don't promise any format without implementation/tests. Avoid loading unbounded entire files into browser Blob memory. Prefer bounded thumbnail/downsample or paged/ranged preview where feasible.
5. Verify that files which are *already safely supported* actually preview reliably and do not get false unsupported outcomes due to MIME classification. Keep the media pinned player separate per existing contract and preview layout Issue #30.
6. UI should always allow explicit context-menu Open in OS app / Reveal for unsupported files, but ordinary File Explorer primary click remains internal preview.
7. Add tests for formats/limits on Windows/Chrome: safe JPEG/PNG/WebP/BMP/GIF under cap; 32–64 MiB image; >64 MiB file; supported and unsupported PDFs/Office; text just above 256 KiB; genuine unsupported format; file changed; BUSY and permissions. Assert truthful reason codes and non-destructive behavior.

## Owner acceptance

Every file click must yield either a preview or a **specific reason** why it cannot be previewed, with separately named explicit Open/Reveal fallbacks. No generic multi-cause warning as the only available feedback for a multitude of files.

No modifications to installed owner worker, existing archives, GOLD tags, History, permissions or source files by documenting this report. Code fix requires a separately validated matching TEST candidate.
