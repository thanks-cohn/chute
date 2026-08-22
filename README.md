# Chute — Windows / Chrome Store milestone

> **LICENSE NOTICE — NOT MIT. NON-COMMERCIAL SOURCE-AVAILABLE SOFTWARE.**
>
> This branch is provided under the **Chute Source-Available Non-Commercial License v1.0** in [`LICENSE`](LICENSE). Personal, educational, research, evaluation, hobby, and other genuinely non-commercial use is permitted. **Commercial use is prohibited without prior written permission.** You may not sell, monetize, commercially redistribute, bundle into a paid product or service, publish a paid fork or clone, or use this repository or a substantial derivative to create a product or service for financial gain.

`windows-chrome-store` is an older Windows packaging and Chrome Web Store preparation branch in Chute's product history.

## Product model represented here

Chute is a local file basket shared between a small desktop companion and compatible Chromium browsers:

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
       Local files
```

No Chute cloud account is required for the core local basket.

## Windows direction in this branch

This milestone explored the consumer Windows companion and store packaging, including:

- standalone Windows packaging
- quiet localhost companion
- per-user installation rather than a machine-wide service
- Windows startup registration
- local Chute data under the user's profile
- Chrome Web Store packaging/listing material
- Chromium extension distribution planning
- shared basket behavior across supported Chromium browsers

Later branches contain newer Windows behavior and should be used for current product work.

## Browser development setup

For unpacked development:

```text
Chrome: chrome://extensions
Edge:   edge://extensions
Brave:  brave://extensions
Opera:  opera://extensions
```

Enable Developer mode, click **Load unpacked**, and select this branch's `extension` folder.

## Local data and privacy

Chute's desktop side binds to loopback by default and stores queue/history artifacts locally. Browser-selected files or images are handed to the local service rather than to a remote Chute storage server.

## Branch lineage

This branch is historical. Newer milestones include:

- `windows-v2.3-chromium` — later Windows/Chromium baseline
- `cross-platform-chromium` — cross-platform Chromium work
- `direct-drop-google-yandex` — direct Google/Yandex image-drop compatibility
- `paid-installer-onboarding` — current paid Windows installer/onboarding candidate

Use the branch appropriate to the milestone you are inspecting rather than assuming every branch has identical packaging or browser behavior.

## License

**This branch is not MIT licensed.** It is distributed under the **Chute Source-Available Non-Commercial License v1.0**. See [`LICENSE`](LICENSE).

Commercial use, resale, paid redistribution, commercial forks/clones, commercial derivatives, or using this source/repository to create a revenue-generating product or service requires separate written permission from the applicable Chute rights holder.

Historical snapshots that were validly distributed under an earlier license are not retroactively relicensed; the license in this branch applies to the branch state distributed with it to the extent the applicable rights holders have authority over the material.
