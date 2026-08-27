# Chutey grab assets

This directory contains the artwork used by the floating Chutey mascot and the Grab interaction.

## Current bundled states

Use these exact filenames in `extension/assets/grab/`:

- `default.png` — normal resting Chutey when nothing special is happening.
- `hover.png` — fallback pointer-over state when no randomized hover deck is present.
- `grab.png` — shown immediately when a dragged file is directly over Chutey's normal drop target. This image is also used as the small Grab button icon.

When a bundled state image loads successfully, it replaces the old CSS-drawn Chutey completely. The live count badge remains above the artwork. If an image is missing or cannot be decoded, Chute falls back to the built-in CSS mascot.

## Hover expression deck

`hover` can be a randomized multi-image state instead of one fixed image.

Create this folder:

```text
extension/assets/grab/hover/
```

Then add consecutively numbered images beginning with `1`:

```text
hover/
  1.png
  2.png
  3.png
  4.png
  ...
```

Supported formats are `.png`, `.webp`, and `.gif`. A deck may contain up to 32 images.

Keep the numbering continuous. Discovery stops at the first missing number.

Hover behavior:

1. Pointer enters Chutey.
2. If a local custom hover image is configured in Settings, that custom image wins for the normal hover state.
3. Otherwise, if `hover/` contains a deck, Chutey immediately chooses a random expression.
4. While the pointer stays over Chutey, another expression is chosen after a randomized roughly 0.8-2.2 seconds.
5. Chutey avoids intentionally choosing the same hover expression twice in a row.
6. When the pointer leaves, the hover deck stops immediately.
7. If no hover deck exists, Chutey falls back to `hover.png`.

## Linger expression deck

The old drag-and-hold reaction has been repurposed into a prolonged-hover personality reaction called `linger`.

Preferred folder:

```text
extension/assets/grab/linger/
```

Number images consecutively:

```text
linger/
  1.png
  2.png
  3.png
  4.png
  ...
```

Supported formats are `.png`, `.webp`, and `.gif`, up to 32 images. Keep numbering continuous.

Linger behavior:

1. Pointer enters Chutey and the normal hover state/deck begins.
2. If the pointer stays on Chutey, he waits a randomized 2-3 seconds.
3. The `linger/` deck activates.
4. Chutey randomly chooses an expression from the deck.
5. While the pointer continues hovering, another linger expression is chosen after a randomized roughly 0.65-1.8 seconds.
6. Chutey avoids intentionally choosing the same linger expression twice in a row.
7. Pointer leave or a drag directly over Chutey cancels the linger state immediately.

### Existing `holding/` artwork still works

To avoid wasting or renaming existing artwork, Chute treats this older folder as a fallback:

```text
extension/assets/grab/holding/
```

If `linger/` is empty or absent, the numbered images already inside `holding/` automatically become the linger deck.

This means existing `holding/1.png`, `holding/2.png`, etc. can stay exactly where they are for now.

## Drag behavior

Chutey is again using his normal exact drop target. The experimental 160px invisible catch area to his left was removed because Chromium can still reveal right-edge browser UI during a dragged image gesture.

Chutey has also been nudged closer to the right edge visually. Dragging directly over him still shows `grab.png`, but prolonged drag-hover is no longer used for a special expression deck.

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

Hover deck:

```text
C:\Users\mahan\dev\debug\extension\assets\grab\hover\
```

Preferred linger deck:

```text
C:\Users\mahan\dev\debug\extension\assets\grab\linger\
```

Existing holding artwork may remain here and will be used automatically when `linger/` is absent:

```text
C:\Users\mahan\dev\debug\extension\assets\grab\holding\
```
