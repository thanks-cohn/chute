# Chute

**Pick up a file from your terminal and drop it into your browser.**

Chute is a tiny localhost bridge plus a Chrome extension. Send a file from any terminal:

```bash
chute ./report.pdf
chute ./screenshot.png
chute ./whole-directory
```

Click the Chute extension. Your files appear in a Downloads-style list. Pick one up and drag it into ChatGPT, Claude, Gmail, GitHub, or any webpage that accepts file drops.

Directories are zipped automatically. Files never leave your computer until you deliberately drop or attach them to a website.

## What is included

- `src/chute/`: dependency-free Python CLI and localhost server
- `extension/`: unpacked Chrome Manifest V3 extension
- persistent Chrome side shelf for reliable drag-and-drop
- Downloads-style extension popup
- generic **Attach** fallback for pages with a file input
- queue, remove, clear, and automatic local-server startup

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

Click Chute and drag the file row into the page. The popup attempts direct dragging. **Open shelf** launches the persistent Chrome side panel, which is more reliable because it stays open while the pointer crosses into the webpage.

## Commands

```text
chute FILE [FILE ...]      shorthand for chute send
chute send PATH [...]      queue files or directories
chute list                 list queued files
chute remove ID            remove one item by full or unique short ID
chute clear                empty the queue
chute path                 print Chute's local data directory
chute serve                run the localhost bridge
```

The server binds only to `127.0.0.1:17891` by default. Set `CHUTE_HOME` to move the queue and copied files elsewhere.

## How drag-out works

A webpage cannot drag a disk path it was never given. Chute therefore copies the queued file into its local store. The extension fetches the bytes from localhost, creates a browser `File` object, and places that object into the drag data during the user's real `dragstart` gesture.

Files up to 24 MB are prepared automatically. For larger files, click the row once, wait for **Drag me**, then drag it. This prevents the extension from loading every large queued file into memory at once.

Chrome's native Downloads bubble has privileged browser access that ordinary extensions do not. Chute gets as close as an extension can: a compact popup plus a persistent side shelf. The **Attach** button is provided as a fallback when a site rejects cross-document file dragging.

## Development

```bash
python -m unittest discover -s tests -v
python -m compileall src
```

After editing extension files, open `chrome://extensions` and click the reload button on Chute.

## Security model

- The bridge listens on loopback only by default.
- CORS responses are limited to Chrome-extension origins and the local service origin.
- Chute copies files into its private queue rather than exposing arbitrary filesystem paths.
- Nothing is uploaded by the Python service.
- Removing an item deletes Chute's copy, never the original file.

## Status

This is the first working implementation, version `0.1.0`. The most important real-world validation is testing drag-out behavior across current Chrome builds and common targets such as ChatGPT, Claude, Gmail, and GitHub.
