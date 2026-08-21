# Chrome Web Store asset checklist

Run:

```powershell
py -3 scripts\build-chrome-store.py
```

The builder generates:

```text
dist\chrome-store\chute-chrome-2.2.0.zip
dist\chrome-store\store-assets\store-icon-128.png
dist\chrome-store\store-assets\small-promo-440x280.png
dist\chrome-store\store-assets\marquee-1400x560.png
```

The ZIP has `manifest.json` at its root and includes generated 16, 32, 48, and 128 pixel raster icons.

## Real screenshot required

Capture at least one real 1280×800 screenshot from a working Chrome installation. Do not use a fabricated browser screenshot.

Recommended screenshot:

1. Run Chute for Windows.
2. Open a normal HTTPS page.
3. Open the Chute extension popup with several image/file rows visible.
4. Keep the small sticky mascot visible on the page if possible.
5. Capture the Chrome window at 1280×800.
6. Make sure no private filenames, account details, or sensitive webpage content are visible.

Up to five screenshots can be supplied. Useful additional screenshots:

- webpage image being dropped into the sticky;
- Chute shelf/history with generated thumbnails;
- Settings showing full-image/custom-copy choices;
- the same local basket visible from another Chromium browser, if the listing text explains the cross-browser companion workflow.

## Developer Dashboard fields

Before submitting, complete:

- Store listing title and descriptions from `LISTING.md`;
- category and language;
- privacy disclosures consistent with `PRIVACY_POLICY.md`;
- permission justifications consistent with `REVIEW_NOTES.md`;
- support/contact information;
- privacy-policy URL hosted on a public site controlled by the publisher;
- distribution regions;
- paid-companion disclosure.

Publishing/updating a Chrome Web Store item requires the publisher account's required verification/security setup, including 2-Step Verification where required by Chrome Web Store.
