# Chute — Chrome Web Store Submission Sheet

Target extension version: **2.5.0**

This file is the copy-and-paste checklist for the Chrome Web Store Developer Dashboard.

## Store listing

### Name

Chute

### Summary / short description

Drag files, images, links, and text through one local Chute basket with recallable history.

### Detailed description

Chute is a persistent local handoff basket for the browser.

Pick something up once and drop it where you need it.

- Drag files and images into Chute and drag the real file back out later.
- Capture webpage images, links, and selected text.
- Keep one local basket across supported Chromium browsers.
- Preserve the full original image, create an optional custom-size WebP copy, or keep both.
- Use separate 48px recognition thumbnails that never replace the real outgoing file.
- Browse dated local history and Recall preserved items.
- Choose a floating Chute, right-click access, or both.
- Auto-hide the floating Chute after 10 seconds or keep it always visible.
- Drop Chute images directly into supported Google and Yandex image-search flows.

Chute is local-first. Basket files and history are held by the Chute companion on your own computer rather than a Chute cloud account.

**Windows companion required:** Install and run the Chute Windows companion so the extension can reach the local basket at `127.0.0.1:17891`. The extension shows a setup link if the companion is not running.

Single purpose: make moving and recalling user-chosen files, images, links, and text between webpages and a local computer basket fast and direct.

### Category

Recommended: **Productivity**

### Language

English

## Single-purpose statement

Chute's single purpose is to provide a persistent local browser handoff basket so users can explicitly capture, carry, drag, drop, and recall files, images, links, and selected text across webpages and supported browsers.

## Permission justifications

### `contextMenus`

Used only to provide the optional **Send to Chute** context-menu action for a user-selected image, link, text selection, or page.

### `sidePanel`

Used to display the Chute Shelf, where the user can browse the current basket and dated recall history.

### `storage`

Used to store Chute preferences such as floating/context access mode, auto-hide behavior, image-copy settings, thumbnail preference, history display limit, and drag-out mode.

### Host access: `http://*/*` and `https://*/*`

Broad webpage access is core to Chute's disclosed purpose: the floating Chute must be available on ordinary webpages where the user wants to drag or drop items. Chute also needs to inspect a user-initiated drag/drop or context-menu capture and, when explicitly requested by the user, retrieve a selected webpage image for the local basket.

Chute does not use broad host access for advertising, analytics, profiling, or background collection of browsing history.

## Privacy practices / data disclosure

Use the wording available in the current Developer Dashboard, but disclose the following accurately.

### Data handled

Chute handles **website content / user-provided content** when the user explicitly drags, drops, attaches, selects, or sends files, images, links, or selected text to Chute.

Chute handles **web browsing activity / URLs** only to the extent necessary to preserve the source page URL and image URL for a user-initiated browser-image capture or link/page capture.

Chute stores extension preferences through Chrome extension storage.

### Data use

All handled content is used only to provide Chute's local capture, handoff, thumbnail, provenance, history, and recall features.

### Data transfer

Basket content and provenance are sent only to the Chute companion on the same computer through the loopback address `127.0.0.1:17891` / `localhost:17891`.

Chute does **not** send this data to a developer-controlled cloud server.

### Sale / advertising

- Data sold: **No**
- Data used for personalized advertising: **No**
- Data transferred to advertisers or data brokers: **No**
- Developer analytics/telemetry on basket contents or browsing activity: **No**

### Human access

The developer does not receive or read the user's basket contents or captured browsing data because those records remain on the user's computer.

### Limited Use certification

Certify that the extension's use of user data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Privacy policy URL

After this branch is public, use:

`https://github.com/thanks-cohn/chute/blob/chrome_extension_windows_version/PRIVACY.md`

For a long-lived published listing, prefer changing this to a stable privacy page on the project/site or to the privacy file on the eventual release/default branch so the URL will not disappear if the development branch is removed.

## Reviewer test instructions

Chute requires its localhost companion.

1. Install and start the Chute Windows companion.
2. Confirm `http://127.0.0.1:17891/health` responds locally.
3. Install the Chrome extension package.
4. Open a normal HTTP/HTTPS webpage.
5. The floating Chute appears at the lower-right edge.
6. Drag a webpage image or local file onto Chute.
7. Open the extension popup or Shelf and confirm the item appears.
8. Drag the item from Chute onto a file-capable webpage target.
9. Open Settings to test full-original capture, optional custom-size image copy, thumbnail display, access mode, and auto-hide.

If the companion is absent, the popup/Shelf displays a **Get the Windows companion** link instead of failing silently.

## Store assets

Run from the repository root:

```bash
python scripts/build-chrome-store.py
```

This creates:

- `dist/chrome-store/chute-chrome-2.5.0.zip` — upload this package
- `dist/chrome-store/store-assets/store-icon-128.png`
- `dist/chrome-store/store-assets/small-promo-440x280.png`
- `dist/chrome-store/store-assets/marquee-1400x560.png`

You still need at least one **real screenshot of the working extension** for the Store listing. Use a clean screenshot that visibly shows the floating Chute and/or the Shelf with real sample items.

## Final pre-submit checklist

- Google developer account has 2-Step Verification enabled.
- Upload `chute-chrome-2.5.0.zip`.
- Fill in Store listing.
- Upload real screenshots.
- Fill in Privacy practices accurately.
- Add the privacy-policy URL.
- Add reviewer test instructions explaining the Windows companion.
- Save draft and resolve every dashboard warning.
- Submit for review.
