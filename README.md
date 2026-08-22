# Chute — Cross-platform Chromium

> **LICENSE NOTICE — NOT MIT. NON-COMMERCIAL SOURCE-AVAILABLE SOFTWARE.**
>
> This branch is provided under the **Chute Source-Available Non-Commercial License v1.0** in [`LICENSE`](LICENSE). Personal, educational, research, evaluation, hobby, and other genuinely non-commercial use is permitted. **Commercial use is prohibited without prior written permission.** You may not sell, monetize, commercially redistribute, bundle into a paid product or service, publish a paid fork or clone, or use this repository or a substantial derivative to create a product or service for financial gain.

`cross-platform-chromium` is the branch intended to carry the shared Chromium extension and desktop-companion model across Windows and Linux without rewriting the frozen original Chute baseline.

## Architecture

```text
Chrome / Opera / Edge / Brave / Chromium
                    │
                    ▼
              Chute extension
                    │
                    ▼
             127.0.0.1:17891
                    │
                    ▼
               Local Chute
```

The browser extension is a surface over one local basket. Multiple browsers on the same machine can therefore use the same Chute state.

## Product principles represented here

- local-first storage
- no required Chute cloud account for the local basket
- small browser extension as the primary visible UI
- lightweight desktop companion that disappears into the background
- one queue/history shared across compatible browsers
- preserved local originals
- append-only local history and recall
- browser-generated thumbnails rather than heavyweight image dependencies in Python
- explicit Windows and Linux packaging paths rather than Electron

## Browser development

Load this branch's `extension` directory as an unpacked Chromium extension:

```text
Chrome: chrome://extensions
Edge:   edge://extensions
Brave:  brave://extensions
Opera:  opera://extensions
```

Enable Developer mode and choose **Load unpacked**.

## Local data

Chute derives storage from the user's home/profile rather than a hard-coded username. On Windows this resolves to the user's profile Chute directory; on Linux it resolves to `~/Chute` unless explicitly overridden.

Representative data includes:

```text
queue.json
files/
thumbs/
custom-thumbnails/
history/
image-provenance.jsonl
image-provenance.txt
```

## Branch lineage

Later product experiments were kept isolated from this branch:

- `direct-drop-google-yandex` — direct Google/Yandex image-search dropping and Opera transparency compatibility.
- `paid-installer-onboarding` — paid Windows product candidate with a bundled extension and assisted first-run setup.

This separation makes it possible to inspect or return to a cross-platform milestone without disturbing the known-good branches around it.

## License

**This branch is not MIT licensed.** It is distributed under the **Chute Source-Available Non-Commercial License v1.0**. See [`LICENSE`](LICENSE).

Commercial use, resale, paid redistribution, commercial forks/clones, commercial derivatives, or using this source/repository to create a revenue-generating product or service requires separate written permission from the applicable Chute rights holder.

Historical snapshots that were validly distributed under an earlier license are not retroactively relicensed; the license in this branch applies to the branch state distributed with it to the extent the applicable rights holders have authority over the material.
