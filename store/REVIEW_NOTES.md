# Chrome Web Store review notes

## Single purpose

Chute's single purpose is local handoff of user-chosen files, images, links, and selected text between webpages and the user's local Chute companion.

Every major feature supports that purpose:

- sticky drop target: send a chosen item into the local basket;
- popup/shelf: view and recall the same local basket/history;
- context menu: alternate user-initiated send path;
- attach/drag: deliver a chosen Chute item back into a webpage;
- thumbnails: identify items in that basket;
- history: recall previously handed-off items.

## Permission justifications

### `activeTab`

Used when the user explicitly chooses Attach/Open behavior against the currently active page.

### `contextMenus`

Provides the optional user-invoked **Send to Chute** menu for selected text, links, pages, and images.

### `scripting`

Used only for the user-facing Attach workflow that places a chosen Chute file into an available file input on the active page.

### `sidePanel`

Provides the full Chute shelf/history UI in supporting Chrome versions.

### `storage`

Stores Chute preferences such as access mode, thumbnail display, history count, drag mode, and image-capture choices. File contents and Chute history are not stored in `chrome.storage`.

### `http://127.0.0.1:17891/*` and `http://localhost:17891/*`

Required to communicate with the local Chute companion. Basket contents are stored locally on the user's computer.

### HTTP/HTTPS page access

Required because the user can choose to keep a persistent Chute drop target on ordinary webpages and can explicitly drag/send webpage images into Chute. The extension does not use this access for ads, unrelated analytics, or sale of browsing activity.

## Companion requirement

The extension depends on a local Chute companion for its core basket/storage functionality. On Windows, the companion is sold separately for $2.99 one-time by the Chute publisher, not Google. This requirement must remain prominently disclosed in the Store listing.

The companion listens only on loopback by default (`127.0.0.1:17891`). It is a normal per-user startup application, not a Windows Service.

## Data behavior

- files/images are handled only as part of user-facing Chute actions;
- basket contents are sent to the user's local companion, not a Chute cloud storage service;
- Chute preferences may use Chrome Sync through `chrome.storage.sync`;
- Chute does not sell user data or browsing histories;
- no remote hosted JavaScript is used by the extension package.

## Reviewer smoke test

1. Start the local Chute companion.
2. Install/load the extension.
3. Open a normal HTTPS webpage.
4. Verify the sticky Chute appears when Floating mascot mode is enabled.
5. Drag a local file or webpage image into Chute.
6. Open the popup/shelf and confirm the item appears.
7. Open another normal page with a file-upload target and use Attach or drag the item from Chute.
8. Confirm the local basket remains available after moving between normal tabs/pages.
9. Stop the companion and confirm Chute displays an offline state instead of sending data to a remote fallback service.
