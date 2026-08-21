# Chrome Web Store review notes

## Single purpose

Chute's single purpose is local handoff of user-chosen files, images, links, and selected text between webpages and the user's local Chute companion.

Every major feature supports that purpose: the floating drop target and context menu send chosen items into the local basket; the popup and side-panel Shelf display and recall that basket; thumbnails identify those items; provenance helps trace user-captured browser images; Attach/drag delivers a chosen Chute item back into a webpage.

## Permission justifications

- `activeTab`: used when the user explicitly invokes an action against the active page.
- `contextMenus`: provides user-invoked Send to Chute actions.
- `scripting`: used for the user-facing Attach workflow.
- `sidePanel`: provides the full Shelf/history UI.
- `storage`: stores small Chute preference values; file contents/history are not stored in `chrome.storage`.
- `127.0.0.1` / `localhost`: communicates with the user's local Chute companion.
- HTTP/HTTPS page access: required for the persistent drop target and user-initiated browser image/file handoff on ordinary webpages.

## Companion requirement and platform setup

Core basket/storage behavior requires the local Chute desktop companion. When the bridge is unavailable, the popup uses `chrome.runtime.getPlatformInfo()` to offer the matching Windows or Linux companion. The companion listens only on loopback by default (`127.0.0.1:17891`).

Windows setup is per-user and does not install a Windows Service or require administrator privileges. Linux desktop setup uses normal per-user XDG autostart rather than requiring systemd configuration.

## Data behavior

Files/images are handled only as part of user-facing Chute actions. Basket contents go to the local companion, not to a Chute cloud storage service. Chute preferences may use Chrome Sync through `chrome.storage.sync`. The extension package does not use remotely hosted JavaScript.

## Reviewer smoke test

1. Install the extension with no Chute companion running and open the popup.
2. Confirm the setup card detects the current desktop OS and shows the matching companion.
3. Start the companion and reopen the popup; confirm the setup card disappears.
4. Open a normal HTTPS webpage and confirm the floating Chute appears when enabled.
5. Drag a local file or webpage image into Chute.
6. Open the popup/Shelf and confirm the item appears.
7. Drag or attach the item into a webpage upload target.
8. Confirm the same local basket remains available across normal tabs and compatible Chromium browsers using the same machine.
9. Stop the companion and confirm Chute returns to a local-offline/setup state rather than sending basket data to a remote fallback service.
