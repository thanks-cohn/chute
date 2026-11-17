# CODEX P0 — Chutey 30-minute media playback, concurrent Explorer, first-run UX and Windows clipboard

**Created:** 2026-11-17  
**Repository:** `thanks-cohn/chute`  
**Status:** Implementation specification only — **not coded, merged, built or user-tested**  
**Pinned user-tested candidate:** Development 1 Request 3, source `1cca0406c9a81c658feabc0d7aa57aad4028247f`, Actions run `43996443418`. Confirm the checked-out code and installed exact worker + Chrome extension before diagnosing.
**Issues:** [#20 Open/Reveal onboarding](https://github.com/thanks-cohn/chute/issues/20), [#21 obsolete preview warning](https://github.com/thanks-cohn/chute/issues/21), [#22 P0 media 403](https://github.com/thanks-cohn/chute/issues/22), [#23 Settings/toolbar](https://github.com/thanks-cohn/chute/issues/23), [#24 Folder Access stacking](https://github.com/thanks-cohn/chute/issues/24), [#25 preview arrow-key focus](https://github.com/thanks-cohn/chute/issues/25), [#26 native clipboard](https://github.com/thanks-cohn/chute/issues/26).

## Release goal

A person who has already approved a folder on D: can start a **30-minute MP4 or WebM**, keep watching and seeking while traversing/searching/scrolling through their approved directory, and reach the end **without interruption, spurious authorization errors, picker prompts, UI flicker or excessive resource consumption**. Chutey's Open, Reveal, preview arrows, Folder Access and clipboard must be understandable and functional without confusing the user.

## 0. Important branch and safety rules

- **Request 3 is not the old `main` preview implementation**. The candidate contains `media_source` tickets, streaming HTTP ranges, `file-actions.js`, native `open/reveal` and extra session code. Inspect `git show 1cca0406c9a81c658feabc0d7aa57aad4028247f` and branch topology before editing. Work on a fresh reviewable repair branch using the correct candidate and merge/reconcile changes deliberately; never replace newer files with old `main`.
- Preserve all user files, History, approved D: scope, extension identity/native registration, the old installed-worker rollback, Request 3 tester, and GOLD tags. No forced new folder selection or unapproved changes to other repos.
- Keep exact origin binding, worker-only filesystem resolution, reparse-point/path protections, user intent, source identity checks and safe extension allowlists. No public local HTTP media server, no raw token or ticket leak, no blanket filesystem permissions.
- GUI-to-API parity; automated tests and actual Windows + Chrome playback/copy tests. Passing `/health` does not prove streaming success.
- Performance on low-memory Windows devices: bounded streaming buffers, reasonable semaphore/concurrency, independent control/metadata lane, no massive video/image Blobs in Chrome.

## 1. P0 — Fix the video that **starts** then says access was revoked (#22)

**Observed:** After the user approves D:, MP4 and WebM **start playing successfully**, then the player says `Media access was revoked or the authorized session expired. Reconnect and select the file again.` This is not proof that the user failed to approve D:.

Request 3 sources:
- `extension/explorer-view.js` creates `<video>/<audio>`, requests `api.mediaSource(meta)` and gives a ticket URL to the media element; `closePreview` releases the ticket.
- `extension/media-playback.js` issues a diagnostic HEAD and currently maps any 403 to a misleading "revoked" message.
- `src/chute/explorer/api.py` media tickets, Range/206/HEAD, `media_slots=BoundedSemaphore(2)`, origin verification and **authorization on each streaming chunk**.
- `src/chute/explorer/security.py` sessions have 900-second TTL; media tickets can expire within 600 seconds.
- `src/chute/explorer/native.py` handles resume/renewal and may replace adapters/sessions.
- `src/chute/server.py` selects a per-Origin adapter before routing media requests.

Required:
1. Reproduce with small MP4/WebM, seek-heavy footage and 30-minute browser-compatible MP4/WebM. Capture redacted status/headers from the **original media GET/Range GET** and subsequent HEAD, Origin presence, response code, session/ticket lifetime and release/reconnect events. Never log user paths, files, raw Origins, tokens or ticket IDs.
2. Distinguish actual `UNAUTHORIZED`, `STREAM_EXPIRED`, `EXPLORER_DISABLED`, `INVALID_HOST`, `FILE_CHANGED`, `BUSY`, codec unsupported, browser aborted playback and worker disconnect. Do not let HEAD overwrite the real media error.
3. Inspect browser Origin/CORS behavior on embedded media vs fetch, repeated range GETs, token expiry, adapter replacement, too-early `release_media`, concurrent popup/Shelf and user navigation.
4. Implement secure, purpose-limited media continuation / ticket renewal for full video duration **without repeated folder consent**. Explicit access revocation must still stop streaming. Do not simply extend the public lifetime of a bearer or remove Origin validation.
5. Implement real range/206/HEAD correctness, seek, cancel, deadline and backpressure; ensure metadata/list/search remains responsive while streaming.

## 2. P0 — Playback persists during ordinary directory browsing

**Separate confirmed blocker in Request 3:** `extension/explorer-view.js` `load(handle)` calls `closePreview()` on folder change, which aborts video and releases its media ticket. Fixing HTTP 403 alone cannot pass the 30-minute-while-browsing goal.

- Decouple **active/pinned media player and its authorization** from ephemeral folder list, preview thumbnails, selection, search, tree navigation, pagination and rerenders. Don't recreate/close the player when navigating.
- Provide clear Play/Pause, seek, Stop/Close and optionally compact/pinned player controls; require intentional user action to replace an existing playing media item. Other image/document previews should not unexpectedly kill it.
- Navigation inside an approved root should not invalidate a playing file; if user explicitly **revokes** the grant, all dependent streams terminate safely.
- Test 30 minutes of continuous playback **with active folder traversal, repeated back/forward, search, scroll, preview, resize and Folder Access interactions**. Test a second independent stream under the actual 2-stream budget and heavy thumbnail/copy load without blocking browsing. Track p50/p95 control latency, CPU/RAM, player error and continuity; targets based on measurement, not invented numbers.

## 3. P1 — Folder Access: movie-media opt-in, no repeating picker

- At original folder approval show **Allow movie media playback** checkbox, and later make it editable in an obvious **Settings → Folder Access** section for already-approved D: without reselecting it.
- Checkbox is a **product-level feature consent**, NOT an extra Chrome streaming permission or a fix for broken origin/ticket authorization. Make capability limitations clear; default policy must be explicit and migration of prior approvals handled without silent changes.
- Preserve configured read/write scope and safe handling of existing user grants; provide accurate status for missing/expired permissions.

## 4. P1 — Native Open/Reveal fallback even before Explorer enrollment (#20, #21)

- **Open** safely opens approved passive files in the associated Windows application; **Reveal / GO TO** opens the system file manager and selects the saved file when supported. Saved Chutey items should not require a new arbitrary-folder grant.
- Request 3 `extension/file-actions.js` currently defaults both to `chutey`. Distinguish an unset first-run preference from an explicit user-selected Chutey preference; do not silently override user choices.
- Existing native `locate_saved`, `open`, `reveal` and file-type safelist are a starting point. Never launch arbitrary executables/scripts, URLs or untrusted command strings. OS associations and third-party file-manager behavior must be tested.
- Fix obsolete `Preview unavailable. Large media requires native streaming integration.` for unsupported/oversized non-video preview: there *is* Request 3 streaming for supported media. Show actual reason (format, size, codec, session/HTTP) and usable actions.

## 5. P1 — Folder Access popover overlays preview (#24)

**Pinned CSS cause:** `extension/explorer-view.css` gives `.ex-native` `position:relative;z-index:16`, `.ex-preview` `z-index:18`, and `.ex-advanced-actions` `z-index:30`; the child menu at 30 remains trapped in its ancestor stacking context 16, behind preview 18. `#chutey-explorer-view` also uses `overflow:hidden`.

- Create an intentional overlay layer/portal or fix stacking, clipping and placement. The Folder Access menu must remain completely visible and clickable on top of fullscreen/expanded preview even at compact 300×400 sizes. Preserve accessible focus/Escape/outside click and avoid global z-index inflation.
- Test while video is playing and Explorer list is actively changing.

## 6. P1 — Image preview left/right arrows after clicking image (#25)

**Observed:** With preview displayed, clicking image or noninteractive background means Left/Right keyboard navigation stops until user clicks a visual navigation arrow.

- Request 3 `extension/explorer-view.js` listens for keydown on Explorer `host`; clicked nonfocusable images might leave focus outside the host. Central `navigatePreview(delta)` already exists.
- When a preview is open, **clicking the displayed image** must establish/retain preview navigation focus so keyboard ArrowLeft/ArrowRight instantly move previous/next file. Likewise keep intuitive behavior after clicking passive Explorer background without hijacking controls.
- Never steal keys from search fields, dialogs, sliders, menus, media seeking, resize grips, Chrome or other apps. Accessible focus and no jump/flicker.
- Reproduce: preview image A → click center of image → Right twice → Left once, including after expanding and switching between grid/list; click on-screen previous/next and verify the same order and pagination.

## 7. P1 — **Separate Windows Clipboard module**; preserve working Chutey-internal Copy (#26)

**Owner clarification:** Current **Copy within Chutey probably works**. The missing capability is to copy **actual image pixels to Windows clipboard**, so the user can paste the image into Paint/graphics editors, messaging and other Windows applications; and, separately, copy **real files** for pasting into Windows File Explorer. Build a **distinct, reusable native Clipboard module**, not a change that breaks Chutey's internal copy.

- Request 3 `extension/explorer-view.js:272-280` internal `Copy` only sets `clipboardFile={handle,identity,name}`; internal Paste performs `local_copy` to an approved writable destination. Preserve this working behavior as **Copy inside Chutey**.
- Add explicit separate actions:
  - **Copy image to Windows clipboard** → decode/convert supported authorized image to native clipboard formats suitable for Paste into Paint (e.g. CF_DIB/CF_DIBV5 and optionally PNG/registered formats); preserve transparency where supported, choose verified format paths. Never copy only the filename or a private loopback URL and claim image pixels were copied.
  - **Copy file(s) to Windows clipboard** → native file-list clipboard semantics (e.g. CF_HDROP for verified existing files) compatible with Explorer Paste where supported. This is different from image-pixel copy. Don't dump huge entire files into browser RAM.
  - **Copy inside Chutey** → existing internal reference and safe `local_copy`, clearly labeled.
- Module has a versioned, scoped native API with explicit user gesture, guarded resolved file handles, source identity, supported MIME/format validation, consent and correct Win32 clipboard ownership/lifetime. Never execute scripts or accept arbitrary browser-supplied local paths; do not send data to outside apps without user action.
- Clipboard writes return truthfully verified native operation outcome. Differentiate "copied image pixels", "file path copied for Explorer paste", "internal Chutey copy", unavailable format/codec and clipboard busy/locked. Handle permission, Unicode, missing/revoked source, Chrome close, worker restart, and file deleted while clipboard holds reference.
- **Required real Windows tests:** right-click PNG/JPEG/WebP → Copy image to Windows clipboard → Ctrl+V into Paint and inspect actual pixels; right-click an approved file → Copy file to Windows clipboard → paste in Windows File Explorer and verify byte hash; `Copy inside Chutey` → internal paste remains functional. Test a large image safely and multi-file list if supported. On failure give one correct reason; never false success.

## 8. P1 — Settings priorities and toolbar button choice (#23)

- **Restore Defaults** at the **top** of Settings, with confirmation and explicit reset scope; **never erase History, saved content, D: grants, connection credentials, or deliberate files**. Revoke access is a separate action.
- Near the top provide **When I click Chutey's Chrome toolbar icon: [Popup | Shelf]**. Chrome currently uses action.default_popup; ensure choosing Shelf uses supported sidePanel behavior and selecting Popup restores it, with no duplicated panels, reliable persistence across restart, no unintended takeover after upgrade.
- Move **Folder Access** and **File actions** into easily discoverable places with current root and permission state, rather than a hard-to-find nested details control. Preserve explicit old settings and keep UI approachable.

## 9. Implementation and validation sequence

1. Freeze exact Request 3 source tree, establish new reviewable repair branch, capture permission/stream diagnostics and simple reproducible 403 case. Do not blindly raise TTL.
2. Fix media GET/HEAD/Origin/ticket problem **and** keep media-player lifetime independent from file list refresh/navigation. Include consent, safe renewal, range/seek, error display and regression tests.
3. Fix topmost Folder Access and preview keyboard focus as small low-risk UX commits.
4. Make system Open/Reveal fallback and first-run Settings discoverable, implement explicit playback checkbox and toolbar entry selection.
5. Implement **separate native Windows Clipboard module** without breaking Chutey-internal copy. Test image pixel paste into Paint and file paste into Explorer.
6. Run automated tests + actual paired Windows/Chrome acceptance: **30-minute active playback while browsing**, user-visible error fidelity, no flicker, bounded memory/CPU, keyboard image navigation, overlay order, setting migration, native clipboard paste, and existing History/save/reconnect. Record videos/logs/redacted diagnostics.
7. Produce tested Windows installer + matching unpacked Chrome ZIP + SHA256SUMS + source SHA + safe install/rollback steps; request user verification before calling it a released GOLD baseline.

## Final report to owner

Provide: exact branch/commit, root-cause analysis of the playing-then-403 bug (with evidence), list of changed files, test metrics, known limitations, download location for paired test artifacts, how to load unpacked and safely roll back. **Do not claim completion from CI alone.**
