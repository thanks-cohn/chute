# Chute — Premium v2

> **LICENSE NOTICE — NOT MIT. NON-COMMERCIAL SOURCE-AVAILABLE SOFTWARE.**
>
> This branch is provided under the **Chute Source-Available Non-Commercial License v1.0** in [`LICENSE`](LICENSE). Personal, educational, research, evaluation, hobby, and other genuinely non-commercial use is permitted. **Commercial use is prohibited without prior written permission.** You may not sell, monetize, commercially redistribute, bundle into a paid product or service, publish a paid fork or clone, or use this repository or a substantial derivative to create a product or service for financial gain.

**One local Chute, recallable history, browser drag-and-drop.**

`premium-v2` is the major local-history/browser milestone in Chute's development lineage. It combines a lightweight localhost service with a Chromium extension and keeps the basket and preserved history on the user's own computer.

## Core idea

```text
Desktop / CLI
      │
      ▼
127.0.0.1:17891
      │
      ├── Chrome
      ├── Opera
      ├── Edge
      ├── Brave
      └── Chromium
```

Compatible browsers talk to the same local Chute service, so one browser can place something into Chute and another can use it.

## Linux quick install

The intended Linux setup is deliberately simple and stays entirely in the terminal. Chute does not unexpectedly open browser or file-manager windows during installation.

### 1. Before installing: enable Developer mode

In every Chromium browser where you want Chute to work, go to its Extensions page and turn on **Developer mode**.

```text
Google Chrome / Chromium: chrome://extensions
Brave:                    brave://extensions
Opera:                    opera://extensions
Microsoft Edge:           edge://extensions
```

If your terminal does not make these internal browser addresses clickable, copy the appropriate address into the browser address bar.

### 2. Run Chute

From the extracted Chute folder:

```bash
sh install.sh
```

The installer:

- creates Chute's private Python runtime
- installs the local bridge
- enables and starts Chute as a user service
- preserves existing Chute data during updates
- prints the browser Extensions addresses in the terminal
- prints the exact local `extension/` folder to select

### 3. Load unpacked

In each browser where you want Chute:

1. Return to the Extensions page.
2. Click **Load unpacked**.
3. Select the exact Chute `extension/` folder printed by the installer.

That's it. The same local Chute is then available to every browser in which you loaded the extension.

## What this branch represents

Premium v2 introduced or stabilized:

- floating browser Chute mascot
- local files, webpage images, links, and selected-text intake
- shared local basket across compatible Chromium browsers
- side shelf and extension popup
- preserved Chute copies after live-basket removal
- recallable append-only history
- daily UTC TSV history files
- 48px browser-generated thumbnails
- optional custom-size image derivatives stored separately from originals
- browser image provenance in JSONL and human-readable text
- right-click browser access
- support/donation UI
- drag-out and attach behavior for browser destinations
- local-only bridge architecture

This experimental Linux branch also includes the floating-mascot auto-hide option and the Google/Yandex direct image-drop helper.

## Local storage

Default data root:

```text
~/Chute/
```

unless `CHUTE_HOME` is set.

Representative layout:

```text
~/Chute/
├── queue.json
├── files/
├── thumbs/
├── custom-thumbnails/
├── image-provenance.jsonl
├── image-provenance.txt
├── .update-safety/
└── history/
    └── YYYY-MM-DD.tsv
```

`files/` contains preserved originals. `thumbs/` contains tiny UI-only derivatives. `custom-thumbnails/` contains optional user-sized derivatives and does not replace the original.

## History and Recall

History is append-only and split by UTC day. Events include:

```text
add
remove
clear
recall
```

Removing or clearing the live basket does not silently erase the entire preserved-history system. Historical items can be recalled when their preserved file remains available.

## Linux runtime

The Linux installation path uses a private Python virtual environment and a user-level systemd service rather than modifying the system Python installation. The service binds to loopback and starts for the current user.

The underlying installer remains available directly as:

```bash
sh scripts/install-user.sh
```

but normal users should use:

```bash
sh install.sh
```

## Security/privacy model

- bridge binds to `127.0.0.1` by default
- no Chute cloud account is required for the local basket
- preserved files remain on the local computer
- browser image capture is sent to the local Chute service
- tiny thumbnails are recognition aids and are never substituted for outgoing original payloads
- file reads use Chute item identifiers rather than exposing arbitrary filesystem paths

## Branch lineage

This branch descends from the Linux-oriented `premium-v2` line. Later Windows/product work lives separately in:

- `windows-v2.3-chromium`
- `cross-platform-chromium`
- `direct-drop-google-yandex`
- `paid-installer-onboarding`

The frozen original baseline remains separately addressable in the repository's earlier history/tag lineage.

## License

**This branch is not MIT licensed.** It is distributed under the **Chute Source-Available Non-Commercial License v1.0**. See [`LICENSE`](LICENSE).

Commercial use, resale, paid redistribution, commercial forks/clones, commercial derivatives, or use of this code as the basis of a revenue-generating product or service requires separate written permission from the applicable Chute rights holder.

Historical snapshots that were validly distributed under an earlier license are not retroactively relicensed; the license in this branch applies to the branch state distributed with it to the extent the applicable rights holders have authority over the material.
