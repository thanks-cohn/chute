# Chute

**Pick up a file from your terminal, or feed one to the little bin following you around the browser.**

Chute is a localhost file queue plus a Chrome/Chromium extension.

From a terminal:

```bash
chute ./report.pdf
chute ./screenshot.png
chute ./whole-directory
```

From the browser, drop a file, a link, or selected text into the sticky Chute bin floating above the current webpage. Everything appears in the extension popup and side shelf, ready to attach or drag elsewhere.

Directories sent from the CLI are zipped automatically. Files remain on your computer until you deliberately attach or drag them to a website.

## What is included

- dependency-free Python CLI and localhost server
- persistent sticky-note Chute bin on normal HTTP and HTTPS pages
- streamed browser-to-local file ingestion
- Downloads-style extension popup
- persistent Chrome side shelf
- generic **Attach** fallback for pages with file inputs
- Chrome virtual-file drag support through `DownloadURL`
- automatic directory ZIP creation
- queue listing, removal, clearing, and badge counts
- default list cap of 20, optional 50, or Unlimited

## Install the computer side

Chute requires Python 3.10 or newer.

```bash
cd chute
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e .
```

On Windows PowerShell:

```powershell
cd chute
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e .
```

Confirm it works:

```bash
chute --version
chute ./README.md
```

Sending a file starts the localhost bridge automatically. You can also run it in the foreground:

```bash
chute serve
```

## Install the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository's `extension` directory.
5. Pin **Chute** to the toolbar.

Now run:

```bash
chute ./anything.pdf
```

Reload an ordinary webpage. The little taped Chute bin appears in the lower-right corner. Drop a file into it to send the file back into the local Chute queue. Click the bin to open the persistent side shelf.

Chrome does not allow extensions to run on internal pages such as `chrome://extensions`, and some protected browser pages may also suppress extensions.

## Upgrade from v0.1

Pull the new code and reinstall the editable package:

```bash
cd ~/dev/chute
git pull
source .venv/bin/activate
python -m pip install -e .
```

The old v0.1 daemon does not have the browser-ingest endpoint, so restart it. On Linux:

```bash
pkill -f 'python.*-m chute serve' || true
chute ./README.md
```

Then open `chrome://extensions`, press the reload button on Chute, and reload the webpage where you are testing it.

## Browser-bin behavior

- Dropped files are copied into Chute's local queue using a streamed upload.
- Multiple dropped files are accepted sequentially.
- Dropped links become portable `.url` Internet Shortcut files.
- Dropped text becomes a timestamped `.txt` note.
- The bin displays the current queue count.
- The bin can be hidden from the extension popup.

The bin is hosted in an isolated extension iframe and mounted at the maximum practical CSS z-index. This prevents ordinary page styles from deforming or covering it.

## List size

The popup and shelf show the newest 20 items by default. The popup setting can switch this to:

- Latest 20
- Latest 50
- Unlimited

Unlimited changes the visible metadata list, but Chute still eagerly prepares only the first 20 small files. Older rows prepare when hovered or clicked, preventing a very large queue from consuming all browser memory at once.

## Commands

```text
chute FILE [FILE ...]      shorthand for chute send
chute send PATH [...]      queue files or directories
chute list                 list queued files
chute remove ID            remove one item by full or unique short ID
chute clear                empty the queue
chute path                 print Chute's data directory
chute serve                run the localhost bridge
```

The server binds only to `127.0.0.1:17891` by default. Set `CHUTE_HOME` to move the queue and copied files elsewhere. Browser drops are limited to 8 GiB by default; set `CHUTE_MAX_UPLOAD_BYTES` to change that limit.

## How drag-out works

Chute uses two drag representations:

1. A browser `File` object for permissive and same-document targets.
2. Chrome's `DownloadURL` virtual-file drag format for crossing out of an extension page.

The earlier v0.1 implementation included a `text/plain` filename fallback. Chrome preserved that text while stripping the scripted file, causing ChatGPT to receive only the filename. v0.2 removes that fallback and adds the localhost-backed virtual-file representation.

The **Attach** button remains available for sites such as ChatGPT that expose a usable file input.

## Multiple browsers

The queue belongs to the local Chute daemon, not to one browser profile. Therefore, Chrome, Edge, Brave, and other compatible Chromium browsers on the same computer can see the same queue when the extension is installed in each browser.

The synchronized Chrome settings currently cover preferences such as list size and bin visibility, not file contents.

Planned later work:

- Firefox/WebExtension package
- encrypted device pairing
- cross-device queue synchronization
- selective expiration and storage quotas
- conflict-free queue IDs across devices

## Development

```bash
python -m unittest discover -s tests -v
python -m compileall src
node --check extension/background.js
node --check extension/content.js
node --check extension/bin.js
node --check extension/shelf.js
node --check extension/popup.js
```

After editing extension files, open `chrome://extensions` and click the reload button on Chute.

## Security model

- The bridge listens on loopback only by default.
- Queue listings, browser ingestion, and destructive operations accept only Chrome-extension or local-service origins.
- Individual file reads use unguessable queue IDs and allow cross-origin GET so the injected **Attach** fallback and virtual-file drag can read the selected item.
- Browser uploads are written incrementally instead of being buffered fully in Python memory.
- Chute copies files into its private queue rather than exposing arbitrary filesystem paths.
- The Python service does not upload files to the internet.
- Removing an item deletes Chute's copy, never the original file.

## Status

Version `0.2.0` adds the persistent sticky browser bin, streamed browser ingestion, configurable list limits, and the Chrome virtual-file drag fix. Physical drag-and-drop behavior still needs testing across individual Chromium builds and target websites because each target can implement its drop zone differently.
