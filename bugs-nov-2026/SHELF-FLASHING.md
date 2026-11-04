# BUG-2026-11-03-001 — Chute Shelf flashes repeatedly

**Repository:** `thanks-cohn/chute`  
**Branch:** `development-2026-11-03`  
**Surface:** Chrome extension side-panel Shelf (`extension/shelf.html`)  
**Priority:** P1 — persistent visible UI instability  
**Status:** Source cause identified; fix applied; live Chrome/Windows and Linux sign-off outstanding.

## User symptom

Opening the Shelf makes its contents flash, as though the page were reloading over and over again. The problem is noticeable without interacting with the Shelf.

## Source investigation — confirmed deterministic redraw trigger

In `extension/shelf.js`, the bottom-of-file polling timer previously ran:

```js
setInterval(() => {
  if (!dragOutActive && !selectedDay && window.scrollY < 8) resetHistory();
}, 5000);
```

The interval unconditionally invoked `resetHistory()` every **5 seconds** whenever the Shelf was on the latest-history view and near the top of the page, even if no files or history state had changed.

`resetHistory()` then:
1. Called `generatedThumbs.clear()` and `thumbObserver.disconnect()`.
2. Called `listElement.replaceChildren()`, removing all visible file rows.
3. Fetched `/api/history`.
4. Recreated every row through `createRow()`, reinserting images and triggering thumbnail observers.

This repeated DOM teardown is a direct, code-proven source of the reported flashing and thumbnail re-entry. It does **not** establish that the whole Chrome side-panel document itself navigates or reloads; that needs runtime instrumentation if the symptom persists after the change.

## Corrective change

- Keep the 5-second lightweight check for new history, but query the latest-history metadata without first clearing the DOM.
- Track a stable signature of latest-day file IDs and active/archive flags.
- Call `resetHistory()` only when that signature has genuinely changed.
- On a temporary local companion failure, retain the existing file list instead of repeatedly blanking it.
- Preserve date navigation, history limit, Recall, explicit Refresh, and regular thumbnail generation.

## Acceptance tests (manual browser/OS)

1. Open Shelf on **Latest**, with some archived and active items, remain near the top for 30+ seconds. **No flashing or row reconstruction** should occur without a data change.
2. Verify thumbnails do not restart loading every five seconds.
3. Save a new file from any browser; the latest view should refresh to include it (within the existing polling cadence).
4. Remove or Recall a file; active/archive indicators update correctly.
5. Choose a past history day; it remains stable until navigation or an explicit user action.
6. Disconnect the companion temporarily; visible history is not continuously erased; reconnect and confirm the view recovers.
7. Verify Popup and Shelf independently; the popup has a separate compatibility-layer initial-render path in `extension/workflow-fixes.js`.
8. Check Windows Chrome and Linux Chromium with the real companion service. Note any Wayland/X11 differences separately.

## Suggested instrumentation if symptoms persist

Record `performance.getEntriesByType("navigation")` and a monotonic in-document counter to distinguish real document reloads from DOM repaint/reconstruction. Trace all callers of `resetHistory()`, Chrome storage events, sidebar openings, and image load events. Capture each call's timestamp and reason, not the contents of private files.

**Do not close as fully resolved until real browser verification.**
