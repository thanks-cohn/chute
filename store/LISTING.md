# Chrome Web Store listing — Chute

## Name

Chute

## Single purpose

Move user-chosen files, images, links, and text between webpages and the user's local Chute companion, with one shared local basket across installed Chromium browsers.

## Short description

Drop files and images into one local Chute, then pick them up in Chrome or another Chromium browser.

## Detailed description

Chute is a local browser-to-desktop handoff tool.

Drop an image, file, link, or selected text into the little Chute mascot and it is copied into your local Chute basket. Open the Chute popup or shelf to recall recent items and attach or drag them into another webpage.

### One Chute, many browsers

The basket belongs to the local Chute companion, not to one browser profile. If you install Chute in Chrome and another compatible Chromium browser on the same computer, both can use the same local basket and history.

Examples:

- Chrome → Chute → another browser
- desktop/CLI → Chute → Chrome
- webpage image → Chute → later upload

### Local-first

Chute talks to a companion app on `127.0.0.1:17891`. Files and captured webpage images are stored on your own computer under your Chute data directory. Chute does not upload your basket to a Chute cloud service and does not sell your data.

### Windows companion

On Windows, Chute requires the Chute for Windows companion for its core local-basket functionality. **Chute for Windows is sold separately for $2.99 one-time by the Chute publisher, not by Google.** The companion runs for the signed-in user and does not install a Windows Service.

Linux users can run the compatible local Chute companion separately.

### Features

- sticky browser drop target
- actual full-image capture by default
- optional custom-size saved image copies
- tiny local recognition thumbnails
- recallable local history
- optional right-click “Send to Chute”
- drag/attach items from Chute into webpages
- one local basket shared across compatible browsers
- no Chute cloud account required

## Category

Productivity

## Language

English

## Support notes

The extension requires a local Chute companion listening on loopback (`127.0.0.1:17891`) for basket/storage operations. If the companion is not running, Chute displays an offline state instead of transmitting files elsewhere.
