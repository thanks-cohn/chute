# Chutey grab assets

This directory contains the artwork used by the floating Chutey mascot and the Grab interaction.

## Current bundled states

Use these exact filenames in `extension/assets/grab/`:

- `default.png` — normal resting Chutey when nothing special is happening.
- `hover.png` — shown when the pointer is directly over Chutey.
- `grab.png` — shown immediately when a dragged file is directly over Chutey and can be dropped. This image is also used as the small Grab button icon.

When a bundled state image loads successfully, it replaces the old CSS-drawn Chutey completely. The live count badge remains above the artwork. If an image is missing or cannot be decoded, Chute falls back to the built-in CSS mascot.

## Holding expression deck

`holding` is a randomized multi-image state for when somebody keeps a file directly over Chutey without releasing it.

Create this folder:

```text
extension/assets/grab/holding/
```

Then add consecutively numbered images beginning with `1`:

```text
holding/
  1.png
  2.png
  3.png
  4.png
  ...
```

Supported holding formats are `.png`, `.webp`, and `.gif`. A deck may contain up to 32 images.

Keep the numbering continuous. For example, if `1.png` and `2.png` exist but `3.png` does not, discovery stops at `2`.

Holding behavior:

1. A file enters Chutey's drop target -> `grab.png` appears immediately.
2. If the file remains there without being released, Chutey waits a randomized 2-3 seconds.
3. The `holding/` deck then activates.
4. Chutey randomly chooses an image from the deck.
5. While the file remains over Chutey, another expression is chosen after a randomized roughly 0.65-1.8 seconds.
6. Chutey avoids intentionally choosing the same holding expression twice in a row.
7. If the file leaves or is dropped, the holding timers stop immediately.

The irregular start and swap timing is intentional so the mascot does not feel like a mechanical repeating GIF.

## Future/static state names

These names are reserved for the expanding Chutey state system. They may be added as the corresponding behavior is wired:

```text
underneath-drop.png
right-after-meal.png
satiated.png
lonely.png
really-lonely.png
desperate.png
```

Intended meanings:

- `underneath-drop.png` — a dragged file is near/below Chutey but not yet directly over the drop target.
- `right-after-meal.png` — temporary expression immediately after a successful drop/chomp.
- `satiated.png` — Chutey has eaten a large number of files recently.
- `lonely.png` — Chute has not been used for a few weeks.
- `really-lonely.png` — Chute has not been used for a few months.
- `desperate.png` — Chute has been unused for a very long time.

Interaction states should always override long-term mood states so Chutey remains responsive while the user is actually interacting with him.

## Optional local overrides

Chute Settings can optionally override the normal `default`, `hover`, and `grab` images on a browser. User-selected images are stored locally in `chrome.storage.local`; the bundled assets remain the defaults and no mascot image is uploaded to a Chute server.

## Pull the latest Chute changes on Windows

From Windows Command Prompt:

```bat
cd C:\Users\mahan\dev\debug
git checkout fix/store-v2.5-reconnect
git pull --ff-only origin fix/store-v2.5-reconnect
git log -1 --oneline
```

Then open:

```text
chrome://extensions
```

Click **Reload** on the unpacked Chute extension, then refresh any ordinary webpage that already had Chutey injected. Existing page content scripts do not update until that tab is refreshed.

The unpacked extension folder is:

```text
C:\Users\mahan\dev\debug\extension
```

For the holding deck on this Windows checkout, place artwork in:

```text
C:\Users\mahan\dev\debug\extension\assets\grab\holding\
```
