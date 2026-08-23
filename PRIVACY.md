# Chute Privacy Policy

Effective: August 22, 2026

Chute is a local browser handoff tool. Its single purpose is to let you place files, images, links, and selected text into one local Chute basket and drag or recall those items later.

## Data Chute handles

Chute may handle the following information only as needed to provide that user-facing purpose:

- files and images you explicitly drag, drop, attach, or send to Chute
- links and selected text you explicitly send to Chute
- the source page URL and source image URL associated with a browser-image capture, for local provenance and recall
- Chute preferences such as auto-hide, access mode, thumbnail settings, image-copy dimensions, history display limits, and drag-out mode

Chute does not intentionally collect passwords, authentication cookies, financial information, health information, or form contents.

## Where the data goes

Chute sends user-chosen basket content from the browser extension to the Chute companion running on the same computer at `127.0.0.1:17891` / `localhost:17891`.

Chute does not operate a developer-controlled cloud service for the basket and does not send basket contents, browsing activity, captured files, or provenance records to the Chute developer.

Extension preferences are stored with Chrome's extension storage API. If Chrome Sync is enabled, Chrome may sync those preferences through the user's Google account under Google's own terms and privacy practices. Chute does not receive a copy of that synced settings data.

## Local storage and retention

The Chute companion preserves basket files and history on the user's own computer. On Windows, the default data location is the user's `Chute` folder. On Linux, the default is `~/Chute/`. The location can be changed where supported by the companion.

Chute keeps dated recall history locally. Clearing the live basket does not automatically destroy preserved history. Users can remove local Chute data by deleting the corresponding local Chute files/history or uninstalling and removing the Chute data directory.

## Sharing and selling data

Chute does not sell user data.

Chute does not share basket contents, website content, browsing activity, or provenance data with advertisers, data brokers, analytics providers, or other third parties.

Chute contains optional links that the user may choose to open, such as the project/release page or a creator-support page. Opening those external websites is an explicit navigation by the user and is governed by the destination site's privacy practices.

## Permissions

Chute requests access to ordinary HTTP and HTTPS pages because its core feature is a persistent drag-and-drop Chute surface that can be available on the webpages the user visits, and because a user may explicitly choose to capture an image, link, selection, or page from those sites.

Chute uses the context-menu permission for its optional Send to Chute menu, the side-panel permission for the Chute Shelf, and the storage permission for Chute settings.

## Security

The browser extension communicates with the native Chute companion over the computer's loopback interface rather than exposing the basket as an internet service. Chute does not intentionally transmit basket contents to developer-controlled remote servers.

## Chrome Web Store Limited Use

Chute's use of information obtained through Chrome extension APIs is limited to providing and improving Chute's disclosed single purpose. Chute's use of information complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

Questions or privacy concerns can be raised through the Chute project issue tracker:

https://github.com/thanks-cohn/chute/issues
