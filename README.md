# Chute — Direct Google/Yandex Drop

> **LICENSE NOTICE — NOT MIT. NON-COMMERCIAL SOURCE-AVAILABLE SOFTWARE.**
>
> This branch is provided under the **Chute Source-Available Non-Commercial License v1.0** in [`LICENSE`](LICENSE). Personal, educational, research, evaluation, hobby, and other genuinely non-commercial use is permitted. **Commercial use is prohibited without prior written permission.** You may not sell, monetize, commercially redistribute, bundle into a paid product or service, publish a paid fork or clone, or use this repository or a substantial derivative to create a product or service for financial gain.

`direct-drop-google-yandex` preserves the working Windows v2.3/Chromium behavior and adds the image-search compatibility work that lets Chute images be dragged more directly into Google and Yandex image-search flows.

## What Chute is

Chute is a lightweight local browser file basket backed by a loopback desktop companion:

```text
Chrome / Opera / Edge / Brave
            │
            ▼
      Chute extension
            │
            ▼
     127.0.0.1:17891
            │
            ▼
      Local Chute data
```

The same local basket is shared by the Chute extension in each supported browser on the computer.

## Direct Google/Yandex image dropping

Earlier Chute builds could deliver an image after the site's image-upload UI had already been expanded. This branch adds an isolated Google/Yandex adapter intended to make the flow closer to:

```text
image in Chute
      ↓ drag
Google / Yandex image-search area
      ↓
Chute finds or opens the site's image uploader
      ↓
real image File is delivered
```

The special adapter is isolated from Chute's general drag path so sites that already accept Chute normally do not need site-specific behavior.

## Opera transparency compatibility

This branch also contains the transparency hardening added after normal Opera could render a white rectangular extension canvas behind the floating Chute while a private Opera window composited it correctly.

The intended result is the Chute mascot floating by itself with a transparent surrounding frame.

## Windows/local behavior inherited by this branch

- standalone Windows companion direction
- per-user installation
- loopback bridge on `127.0.0.1:17891`
- shared local basket/history
- floating browser mascot
- popup and side shelf
- preserved local originals
- recallable history
- tiny UI thumbnails
- optional custom-size image derivatives
- local browser-image provenance
- Chrome/Opera/Edge/Brave-compatible extension architecture

## Development extension setup

Load this branch's `extension` folder as an unpacked extension:

```text
Chrome: chrome://extensions
Edge:   edge://extensions
Brave:  brave://extensions
Opera:  opera://extensions
```

Enable Developer mode, choose **Load unpacked**, and select the branch's `extension` directory. After pulling code changes, reload Chute from the browser's extension-management page and refresh the test page.

## Branch relationship

This branch was intentionally created from the working Windows baseline so that the known-good `windows-v2.3-chromium` state remained untouched while Google/Yandex direct-drop behavior was developed.

The later `paid-installer-onboarding` branch builds on this work and adds the bundled extension plus assisted Windows first-run onboarding for the product that is intended to be sold.

## License

**This branch is not MIT licensed.** It is distributed under the **Chute Source-Available Non-Commercial License v1.0**. See [`LICENSE`](LICENSE).

Commercial use, resale, paid redistribution, commercial forks/clones, commercial derivatives, or using this source/repository to create a revenue-generating product or service requires separate written permission from the applicable Chute rights holder.

Historical snapshots that were validly distributed under an earlier license are not retroactively relicensed; the license in this branch applies to the branch state distributed with it to the extent the applicable rights holders have authority over the material.
