# Chute

**Pick up a file from your terminal, or feed one to the little bin following you around the browser.**

Chute is a lightweight localhost file bridge plus a Chrome/Chromium extension. Premium v2 adds a recallable, bottomless local history without adding a database or image-processing dependency to Python.

The original working release is preserved by the Git tag `v1`. Current v2 work lives on the `premium-v2` branch.

## What Chute does

From a terminal:

```bash
chute ./report.pdf
chute ./screenshot.png
chute ./whole-directory
```

From the browser, drop a file, link, or selected text into the sticky Chute mascot. Items appear in the extension popup and side shelf, ready to attach or drag elsewhere.

Directories sent from the CLI are zipped automatically. The Python service never uploads your files to the internet.

## Premium v2

Premium v2 adds:

- default history view of 50 entries
- any positive history count you choose
- `∞` bottomless history that lazily loads older days
- direct browsing by calendar day
- generated 48px image thumbnails
- thumbnail generation in the browser, so Python stays dependency-free
- recall of removed historical items
- preserved local Chute copies after Remove or Clear
- a mascot supporter popout on hover
- a **Buy the Creator a Coffee** entry in Settings
- a frozen, C-friendly history format documented in `HISTORY_FORMAT.md`

## Local storage

Everything lives under:

```text
~/Chute/
```

unless `CHUTE_HOME` is explicitly set.

```text
~/Chute/
├── queue.json          current live basket
├── files/              preserved Chute copies
├── thumbs/             tiny generated WebP thumbnails
└── history/
    ├── 2026-08-21.tsv
    ├── 2026-08-22.tsv
    └── ...
```

History is split by UTC day instead of being stored in one ever-growing database. Each daily file is append-only UTF-8 TSV with percent-encoded fields. See `HISTORY_FORMAT.md` for the frozen v1 format.

## History and Recall

Removing an item now means **remove it from the live Chute basket**. It does not erase the preserved Chute copy or its history record.

Historical entries therefore show a **Recall** action. Recall puts the preserved item back into the live basket so it can be attached or dragged again.

The history records `add`, `remove`, `clear`, and `recall` events with UTC timestamps.

## Generated thumbnails

Chute does not ask Python to decode images and does not require Pillow, ImageMagick, SQLite, or another heavyweight runtime dependency.

When an image row approaches the visible extension area:

1. the extension looks for an existing tiny thumbnail under `~/Chute/thumbs/`;
2. if none exists, Chromium decodes the original image once;
3. Chute draws it into a 48px canvas;
4. Chromium compresses that derivative as a small WebP;
5. the derivative is stored locally and reused thereafter.

The thumbnail is a recognition aid, not a full preview. The original is never recompressed or replaced.

## Bottomless history

Settings allow:

```text
History shown
[ 50 ] [ ∞ ]
```

The number field accepts any positive integer. `∞` does not load every historical item into the browser at once. The extension loads history by day as the user approaches the bottom of the list.

A date picker also allows jumping directly to a specific day.

## Install the computer side

Chute requires Python 3.10 or newer and systemd for automatic startup.

Run the user installer from the repository root or from anywhere inside the checkout:

```bash
sh scripts/install-user.sh
```

The installer:

- creates a private runtime under `${XDG_DATA_HOME:-$HOME/.local/share}/chute-runtime/venv`;
- exposes the `chute` command through `$HOME/.local/bin/chute`;
- creates the user service under `${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/chute.service`;
- enables and starts the service immediately;
- keeps Chute data under `$HOME/Chute` by default.

No virtual-environment activation is required after installation. Chute does **not** install packages into the system Python environment.

Confirm it works:

```bash
chute --version
chute path
systemctl --user status chute.service
```

The service starts automatically with the user's systemd session. For startup at machine boot even before login, enable lingering once:

```bash
sudo loginctl enable-linger "$USER"
```

Useful service commands:

```bash
systemctl --user restart chute.service
systemctl --user stop chute.service
systemctl --user start chute.service
journalctl --user -u chute.service -f
```

To upgrade after pulling a new Chute version, rerun:

```bash
sh scripts/install-user.sh
```

### Arch / Garuda and `externally-managed-environment`

Modern Arch-family systems protect the system Python installation through PEP 668. If an **older Chute installer** prints:

```text
error: externally-managed-environment
```

**Do not use `--break-system-packages`.** Premium v2's current installer creates its own private virtual environment and therefore does not need to modify the system Python installation.

If `git pull` refuses to update `scripts/install-user.sh` because an earlier `chmod` or local edit changed it, restore that one file and pull again:

```bash
cd /path/to/chute
git restore scripts/install-user.sh
git pull --ff-only
sh scripts/install-user.sh
```

On Arch/Garuda the package named `pip` does not exist as such (`python-pip` is the distro package), but the normal Chute Premium v2 installation should not require installing system pip at all.

## Portability

Chute does not contain a hard-coded username or a hard-coded clone location.

The installer discovers its own repository location from the script path and derives per-user locations from standard environment variables:

```text
$HOME
$XDG_DATA_HOME
$XDG_CONFIG_HOME
```

Therefore all of these are valid examples without modifying Chute:

```text
/home/alice/dev/chute
/home/bob/Downloads/chute
/home/someone/projects/chute
```

Each user receives their own corresponding data and runtime directories. Nothing depends on `/home/emmadoku` or another specific account name.

The current automatic installer is portable across **Linux distributions that provide Python 3.10+ with `venv` support and systemd user services**. A distribution may package the Python `venv` component separately; if `python3 -m venv` is unavailable, install that distribution's Python-venv package first.

The browser extension targets Chromium-family browsers such as Chrome, Opera, Brave, Edge, and Chromium. Browser-specific side-panel behavior can vary, but the localhost queue/history is browser-independent and shared by all installed Chute extensions for that user.

Windows and macOS use different background-service systems, so the current `install-user.sh` is not their installer. The Python storage code already avoids embedding a Linux username, but proper native Windows/macOS installers would be separate future work.

If `$HOME/.local/bin` is not already on a user's `PATH`, add it once in the shell configuration or invoke the installed command by its full path. Most modern Linux desktop distributions include it automatically.

## Install the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository's `extension` directory.
5. Pin **Chute** to the toolbar.

For Opera, open `opera://extensions`, enable developer mode, and load the same `extension` directory as an unpacked extension.

Reload a normal webpage. The taped Chute mascot appears near the lower-right corner. Drop something onto it to add it to Chute. Click it to open the shelf.

Chrome and Opera do not allow ordinary content scripts on their protected internal browser pages.

## Commands

```text
chute FILE [FILE ...]      shorthand for chute send
chute send PATH [...]      queue files or directories
chute list                 list live queued files
chute remove ID            remove one item from the live basket
chute clear                empty the live basket
chute path                 print Chute's data directory
chute serve                run the localhost bridge manually
```

Normal installs do not need `chute serve`; the systemd user service runs the bridge automatically.

The server binds only to `127.0.0.1:17891` by default. Browser drops are limited to 8 GiB by default; set `CHUTE_MAX_UPLOAD_BYTES` to change that limit.

## Drag-out behavior

Chute uses two drag representations:

1. a browser `File` object for permissive and same-document targets;
2. Chrome's `DownloadURL` virtual-file drag format for crossing out of an extension page.

The **Attach** button remains available for sites that expose a usable file input.

Only the first small live items are prepared eagerly. Older or larger rows prepare when hovered or clicked so bottomless history does not become bottomless RAM usage.

## Multiple browsers

The queue and history belong to the local Chute daemon, not to one browser profile. Chrome, Edge, Brave, Opera, and compatible Chromium browsers on the same computer can therefore see the same local state when the extension is installed in each browser.

Chrome-synced settings cover preferences such as history count, thumbnail visibility, and mascot visibility. File contents and history stay local.

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

After editing extension files, open the browser's extension-management page and reload Chute.

## Security model

- the bridge listens on loopback only by default;
- queue listings, browser ingestion, recall, thumbnail writes, and live-basket changes accept only Chrome-extension or local-service origins;
- individual preserved-file reads use unguessable Chute IDs;
- browser uploads are streamed to disk rather than buffered fully in Python memory;
- Chute copies files into its private local store instead of exposing arbitrary filesystem paths;
- the Python service does not upload files to the internet;
- Remove and Clear affect the live basket, while preserved copies remain available for history/Recall.

## Status

`premium-v2` is the active development branch. The storage/history core is versioned as `2.0.0`, while the original pre-history implementation remains permanently addressable through tag `v1`.
