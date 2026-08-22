# Chute

**One Chute. Every browser.**

Chute is a tiny local browser basket for files, images, links, and text.

Drag something into Chute. Drag it back out wherever you need it. No upload ritual, no hunting through folders, no cloud account.

## Why Chute is different

- **Pick up and drop anywhere** — drag files and images into the floating Chute, then drag them straight back into websites, chats, upload boxes, and other supported targets.
- **One basket across browsers** — Chrome, Chromium, Brave, Opera, and Edge can share the same local Chute.
- **Keep the original** — Chute can preserve a full local copy of a browser image.
- **Make custom-size copies too** — optionally create a separate image copy at the width × height you choose while preserving aspect ratio. Keep the original, the resized copy, or both.
- **Tiny generated thumbnails** — Chute can create lightweight 48px recognition thumbnails for the interface. They never replace the real file you drag back out.
- **Recallable history** — removing something from the live basket does not mean losing it forever. Chute keeps local history so preserved items can be recalled later.
- **Auto-hide mascot** — Chute can stay visible or tuck itself away until your mouse returns to the edge.
- **Google + Yandex image search** — drag an image directly onto their search area and Chute routes it into image search.
- **Local-first** — your Chute data lives under `~/Chute/` and the bridge runs on your own computer.

## Linux install

### 1. Turn on Developer Mode

In every browser where you want Chute, open the Extensions page and enable **Developer mode**:

```text
Google Chrome / Chromium: chrome://extensions
Brave:                    brave://extensions
Opera:                    opera://extensions
Microsoft Edge:           edge://extensions
```

### 2. Install Chute

Extract Chute, open a terminal in the Chute folder, and run:

```bash
sh install.sh
```

Chute installs its local service and prints the exact `extension/` folder you need.

### 3. Load the extension

1. Click **Load unpacked**
2. Select the `extension/` folder printed by Chute
3. Done

Repeat step 3 in any other Chromium browser where you want Chute.

## License

Chute is **not MIT licensed**. It uses the Chute Source-Available Non-Commercial License v1.0. See [`LICENSE`](LICENSE).
