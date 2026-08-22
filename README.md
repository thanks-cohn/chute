# Chute — Windows v2.3 Chromium

> **LICENSE NOTICE — NOT MIT. NON-COMMERCIAL SOURCE-AVAILABLE SOFTWARE.**
>
> This branch is provided under the **Chute Source-Available Non-Commercial License v1.0** in [`LICENSE`](LICENSE). Personal, educational, research, evaluation, hobby, and other genuinely non-commercial use is permitted. **Commercial use is prohibited without prior written permission.** You may not sell, monetize, commercially redistribute, bundle into a paid product or service, publish a paid fork or clone, or use this repository or a substantial derivative to create a product or service for financial gain.

`windows-v2.3-chromium` is the known-good Windows/Chromium baseline that preceded the direct Google/Yandex drop and paid-installer branches.

## What Chute is

Chute is a lightweight local browser file basket. A small Windows companion serves one local queue over loopback, and compatible Chromium extensions expose that same queue in the browser.

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

One browser can add an item and another browser on the same computer can see it.

## Windows behavior represented by this branch

This branch includes the Windows companion direction built around:

- standalone PyInstaller EXE packaging
- no required Python installation on the customer machine
- per-user install under Local AppData
- no administrator requirement
- no Windows Service
- HKCU Run startup registration
- quiet background localhost bridge
- data stored under the current user's Chute directory
- Chromium extension for the browser UI
- shared local queue/history across installed Chute browser extensions

Default installed application location:

```text
%LOCALAPPDATA%\Programs\Chute\Chute.exe
```

Default data root:

```text
C:\Users\<you>\Chute
```

Health endpoint:

```text
http://127.0.0.1:17891/health
```

## Browser extension development

Load the branch's `extension` folder as an unpacked extension:

```text
Chrome: chrome://extensions
Edge:   edge://extensions
Brave:  brave://extensions
Opera:  opera://extensions
```

Enable Developer mode and choose **Load unpacked**.

## Local storage/history

Representative data layout:

```text
Chute\
├── queue.json
├── files\
├── thumbs\
├── custom-thumbnails\
├── image-provenance.jsonl
├── image-provenance.txt
└── history\
    └── YYYY-MM-DD.tsv
```

Preserved originals and history remain local. Tiny thumbnails exist for UI recognition and are not used as substitutes for outgoing original files.

## Later branches

This baseline was intentionally kept separate while newer behavior was developed:

- `direct-drop-google-yandex` adds direct image-search drop compatibility and Opera transparency work.
- `paid-installer-onboarding` adds the bundled extension and assisted Windows first-run onboarding intended for the paid product flow.

## License

**This branch is not MIT licensed.** It is distributed under the **Chute Source-Available Non-Commercial License v1.0**. See [`LICENSE`](LICENSE).

Commercial use, resale, paid redistribution, commercial forks/clones, commercial derivatives, or using this source/repository to create a revenue-generating product or service requires separate written permission from the applicable Chute rights holder.

Historical snapshots that were validly distributed under an earlier license are not retroactively relicensed; the license in this branch applies to the branch state distributed with it to the extent the applicable rights holders have authority over the material.
