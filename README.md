# Chute

**One Chute. Every browser.**

A local browser basket for files, images, links, and text. Chute runs on your computer and is shared across supported Chromium browsers.

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

Chute installs its local service and then prints the exact `extension/` folder you need.

### 3. Load the extension

Go back to the browser Extensions page:

1. Click **Load unpacked**
2. Select the `extension/` folder printed by Chute
3. Done

Repeat step 3 in any other Chromium browser where you want Chute.

## Included

- local shared Chute across browsers
- drag files and images in and out
- recallable local history
- floating mascot with auto-hide or always-visible mode
- direct image drop support for Google and Yandex
- local storage under `~/Chute/`

## License

Chute is **not MIT licensed**. It uses the Chute Source-Available Non-Commercial License v1.0. See [`LICENSE`](LICENSE).
