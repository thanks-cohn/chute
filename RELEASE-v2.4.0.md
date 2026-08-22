# Chute v2.4.0 — Linux Mainline Milestone

**One Chute. Every browser.**

**Pick up. Drop anywhere.**

This release freezes the Linux mainline at the point where Chute becomes a deliberately low-friction local browser basket: fast to install, easy to understand, local-first, and designed around direct drag-and-drop rather than upload dialogs and repetitive file hunting.

## The core idea

Chute is a persistent local basket that sits between your desktop and your Chromium browsers.

Drop something into Chute once, then pull it back out wherever you need it.

The same Chute is shared by Chrome, Chromium, Brave, Opera, Edge, and other compatible Chromium browsers through a localhost bridge on `127.0.0.1:17891`.

No separate basket per browser. No cloud account for the basket. No re-uploading the same thing from scratch just because you changed tabs or browsers.

## Drag in, drag back out

Chute is built around the simplest possible interaction:

- drag files into Chute
- drag webpage images into Chute
- capture links
- capture selected text
- use the floating mascot, right-click access, popup, or Shelf
- drag an item back out as the real file/image
- optionally drag out its served source address instead

The default drag-out mode is the actual file/image, so Chute behaves like a little local handoff tray rather than a bookmark manager.

## One shared Chute across browsers

Compatible Chromium browsers all talk to the same local Chute service and the same local basket.

That means you can place something into Chute from one browser and use it from another without duplicating the workflow.

Supported browser access modes include:

- floating mascot
- floating mascot + right-click
- right-click only

## Floating mascot that gets out of the way

The floating Chute mascot now supports two behaviors:

- **Auto-hide after 10 seconds** — the default
- **Always visible**

In auto-hide mode, Chute starts visible, then tucks itself almost entirely into the lower-right edge. Move the pointer back into the small reveal area and it comes back out.

The auto-hide behavior cooperates with hovering, support UI, and drag activity so Chute does not disappear while you are actively using it.

## Direct Google and Yandex image drops

Google and Yandex image search normally make users open their image-upload UI before dropping a file.

Chute v2.4.0 includes direct image-drop routing for Google and Yandex. Drag a Chute image toward the normal search area and Chute routes the real file into the site's image-search uploader, opening the site's upload flow internally when required.

This keeps the interaction closer to the Chute philosophy: pick it up, move it, drop it.

## Full original image capture

Browser image capture can preserve the full downloaded image as a real local Chute item.

Saving the full browser image is enabled by default.

The preserved original lives independently of any small UI preview, so the thing you later drag back out is the real captured artifact rather than a tiny thumbnail.

## Custom-size image copies

Chute can also create a separate custom-size WebP derivative while capturing a browser image.

You choose the maximum width and height.

The custom copy:

- preserves aspect ratio
- fits inside the requested width × height box
- can downscale
- can upscale when the requested box is larger
- is stored separately from the preserved original
- can be enabled at the same time as full-original capture

This means one browser drag can preserve the original **and** create a practical clone sized for another workflow.

If both full-original capture and custom-copy capture are disabled, Chute falls back to preserving the source link rather than silently losing the capture.

## Tiny recognition thumbnails that never replace your file

Chute can generate a separate **48px WebP recognition thumbnail** for captured images.

These mini thumbnails are deliberately UI-only:

- lightweight
- quick to scan in menus/history
- stored under `~/Chute/thumbs/`
- generated independently of the real file
- never substituted for the outgoing dragged image/file

So Chute can stay visually useful without corrupting the meaning of the original artifact.

## Separate original, custom-copy, and thumbnail storage

Chute keeps the roles distinct:

- `~/Chute/files/` — preserved originals and ordinary files
- `~/Chute/custom-thumbnails/` — user-requested custom-size derivatives
- `~/Chute/thumbs/` — tiny recognition previews

The custom copy is not the mini thumbnail, and the mini thumbnail is not the original.

Each exists for a different reason.

## Image provenance

Browser image capture records provenance alongside the artifacts.

The capture pipeline tracks:

- capture ID
- source page URL
- original image URL
- preserved downloaded-image item ID
- generated mini-thumbnail item ID
- custom-size derivative item ID
- source-link fallback item ID when applicable

Provenance finalization is additive: if metadata or thumbnail finalization has a problem after the real file has already been accepted, Chute does not pretend the original capture failed.

## Local, recallable history

Chute is not only a temporary basket.

It keeps append-only dated history under:

`~/Chute/history/`

History is split into daily UTC TSV files and records events such as:

- add
- remove
- clear
- recall

The live basket can therefore stay lightweight while historical items remain discoverable.

## Clear does not mean destroy

Clearing Chute empties the current working basket.

It does **not** silently erase the preserved-history system.

Removing an item or clearing the live basket records the event in history. If the preserved artifact still exists, a historical item can be recalled back into the live Chute.

This makes Chute useful as a working tray without making every cleanup action destructive.

## Browse history by date

The extension popup and Shelf can move through dated history, including previous/next dates and a return to the latest live basket.

The amount of history shown can be limited to a chosen number or set to effectively bottomless display.

## Local-first storage

By default Chute keeps its data under:

`~/Chute/`

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

`CHUTE_HOME` can override the default data root.

## Localhost bridge, not a cloud basket

The browser extension talks to the local Chute service over loopback.

The normal bridge binds to `127.0.0.1`, so the working basket and preserved artifacts remain on the user's own computer.

Chute does not require a Chute cloud account to hold the local basket.

## Files are addressed by Chute IDs

Browser delivery uses Chute item identifiers rather than exposing arbitrary filesystem paths to webpage code.

This keeps the browser workflow centered on known Chute items rather than general-purpose filesystem access.

## Directories can become portable Chute items

On the local/CLI side, adding a directory prepares it as a ZIP archive before placing it into Chute.

That means a folder can become one portable basket item instead of requiring a separate manual archive step first.

## Update safety

The Linux installer creates pre-update safety checkpoints when an existing Chute data set is present.

Immutable artifact trees can be checkpointed with hard links so an update does not needlessly duplicate large preserved files, while mutable metadata/history is copied by value.

The safety area lives under:

`~/Chute/.update-safety/`

## Simple Linux installation

The intended install experience is deliberately short and terminal-only.

Before installing, enable Developer Mode in every Chromium browser where you want Chute:

```text
Google Chrome / Chromium: chrome://extensions
Brave:                    brave://extensions
Opera:                    opera://extensions
Microsoft Edge:           edge://extensions
```

Then from the extracted Chute directory run:

```bash
sh install.sh
```

The installer:

- creates a private Python virtual environment for Chute
- avoids modifying the system Python installation
- installs the Chute local runtime
- installs/enables a user-level systemd service
- starts the local bridge
- preserves existing Chute data during updates
- stays in the terminal rather than unexpectedly opening browser/file-manager windows
- prints the browser extension addresses
- prints the exact local `extension/` directory to choose

Then the user clicks **Load unpacked**, chooses the printed `extension/` folder, and is done.

## Automatic local startup

The Linux service is installed as a user-level systemd service and is enabled to start with the user's session.

The user does not need to activate Chute's private Python environment manually every time.

## Browser compatibility baseline

The extension is Manifest V3 and currently declares Chromium 116 as its minimum Chrome-version baseline.

The main workflow is intended for Chromium-family browsers, including:

- Google Chrome
- Chromium
- Brave
- Opera
- Microsoft Edge

## Chute's design philosophy in this release

Chute v2.4.0 is deliberately not a giant file manager.

Its job is to remove the stupid little interruption between **"I have this thing"** and **"I need this thing over there."**

The distinctive combination in this release is:

- one shared local basket across browsers
- physical-feeling drag-in / drag-out workflow
- actual file delivery rather than thumbnail substitution
- optional source-address drag-out
- preserved originals
- user-sized image clones
- tiny independent recognition thumbnails
- image provenance
- recallable append-only history
- non-destructive clear/remove semantics
- floating, right-click, popup, and Shelf access
- default 10-second auto-hide with edge reveal
- always-visible alternative
- direct Google/Yandex image-search routing
- local-only data model
- simple terminal-first Linux install
- user-level automatic startup
- update safety checkpoints

## Release boundary

This tag freezes the Linux mainline **before the planned multi-select pickup/batch-drop feature**. Multi-select is intentionally future work and is not represented as part of v2.4.0.

## License

This release is **not MIT licensed**.

It uses the **Chute Source-Available Non-Commercial License v1.0** in `LICENSE`.

Personal, educational, research, evaluation, hobby, and other genuinely non-commercial use are permitted under that license. Commercial use requires separate permission under the license terms.
