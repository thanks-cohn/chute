# Chutey grab assets

This directory contains the artwork used by the floating Chutey mascot and its interaction states.

## Static fallbacks

These files live directly in `extension/assets/grab/`:

- `default.png` — fallback idle Chutey when no default deck is present.
- `hover.png` — fallback pointer-over state when no hover deck is present.
- `grab.png` — shown immediately when a dragged item is directly over Chutey's normal drop target. This image is also used as the small Grab button icon.

When a bundled state image loads successfully, it replaces the old CSS-drawn Chutey completely. The live count badge remains above the artwork. If an image is missing or cannot be decoded, Chute falls back to the built-in CSS mascot.

## Expression deck format

`default`, `hover`, and `holding` can each be randomized multi-image decks.

Use numbered images beginning with `1`:

```text
1.png
2.png
3.png
4.png
...
```

Supported formats are `.png`, `.webp`, and `.gif`. Each deck may contain up to 32 images.

Keep numbering continuous. Discovery stops at the first missing number. For example, if `1.png` and `2.png` exist but `3.png` does not, Chute treats the deck as containing two images.

Chutey avoids intentionally choosing the same expression twice in a row.

## Default / idle deck

Create:

```text
extension/assets/grab/default/
```

Example:

```text
default/
  1.png
  2.png
  3.png
  4.png
```

Behavior:

1. When nothing else is happening, Chutey shows one expression from the default deck.
2. By default, he changes to another idle expression about every 5 minutes.
3. The idle interval is configurable in Chute Settings.
4. A normal single-click on Chutey immediately selects a different idle expression.
5. Double-click Chutey to open the Shelf.
6. `hover`, `holding`, and `grab` states temporarily override idle without destroying the current default choice.
7. If no default deck exists, Chutey uses `default.png`.

A locally selected custom Default image in Settings overrides the bundled default deck on that browser.

## Hover deck

Create:

```text
extension/assets/grab/hover/
```

Behavior:

1. The normal mouse pointer enters Chutey while no drag is active.
2. Chutey immediately chooses a random hover expression.
3. While the pointer remains over him, he chooses another expression at an irregular interval centered on the configured Hover expression timing.
4. Pointer leave stops the hover deck immediately.
5. If no hover deck exists, Chutey uses `hover.png`.

A locally selected custom Hover image in Settings overrides the bundled hover deck on that browser.

## Holding deck: carrying something anywhere

Create:

```text
extension/assets/grab/holding/
```

`holding` no longer means the dragged item must sit on top of Chutey. It means the user is actively carrying/dragging something in the browser.

Behavior:

1. A drag begins anywhere on the page, or a desktop/file drag enters the page.
2. Chutey knows that something is being carried even if the cursor is nowhere near him.
3. After the configurable Holding reaction delay (2.5 seconds by default, with slight timing randomization), the `holding/` deck activates.
4. Chutey chooses randomized holding expressions while the drag continues.
5. The Holding expression timing is configurable in Settings.
6. If the dragged cursor moves directly over Chutey, `grab.png` overrides the holding deck immediately.
7. If the cursor leaves Chutey without dropping, the holding deck resumes while the drag is still active.
8. Drop, drag cancel, or leaving the active drag context ends holding and Chutey returns to the appropriate hover/default state.

This makes `holding/` the "Oooo, you're carrying something" personality state rather than a right-edge proximity gesture.

## State priority

The visual priority is:

```text
grab
  > holding
  > hover
  > default
```

In plain language:

- Directly over Chutey with a dragged item: `grab.png`.
- Carrying something elsewhere: `holding/` after its delay.
- Not dragging, pointer over Chutey: `hover/`.
- Otherwise: `default/`.

## Reaction timing settings

Chute Settings exposes these timings:

- **Idle expression change** — default 5 minutes.
- **Hover expression change** — default 1.4 seconds.
- **Holding reaction delay** — default 2.5 seconds before Chutey notices what you are carrying.
- **Holding expression change** — default 1.2 seconds while the holding deck is active.

Actual swaps are randomized slightly around the chosen values so Chutey does not behave like a mechanical slideshow.

## Future/static state names

These names are reserved for the expanding Chutey state system and may be wired later:

```text
underneath-drop.png
right-after-meal.png
satiated.png
lonely.png
really-lonely.png
desperate.png
```

Intended meanings:

- `underneath-drop.png` — a dragged file is near/below Chutey but not directly over the drop target.
- `right-after-meal.png` — temporary expression immediately after a successful drop/chomp.
- `satiated.png` — Chutey has eaten a large number of files recently.
- `lonely.png` — Chute has not been used for a few weeks.
- `really-lonely.png` — Chute has not been used for a few months.
- `desperate.png` — Chute has been unused for a very long time.

Interaction states should override long-term mood states so Chutey remains responsive while the user is actively interacting with him.

## Optional local overrides

Chute Settings can optionally override the normal `default`, `hover`, and `grab` images on a browser. User-selected images are stored locally in `chrome.storage.local`; bundled assets remain the defaults and no mascot image is uploaded to a Chute server.

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

Deck folders on this Windows checkout:

```text
C:\Users\mahan\dev\debug\extension\assets\grab\default\
C:\Users\mahan\dev\debug\extension\assets\grab\hover\
C:\Users\mahan\dev\debug\extension\assets\grab\holding\
```
