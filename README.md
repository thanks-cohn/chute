# Chute

**One Chute. Every browser.**

Chute is a lightweight local file basket for the browser. Drop files, images, links, or text into the floating Chute, keep them locally, then drag or attach them somewhere else later.

Chute is intentionally local-first:

- no Chute cloud account
- no remote Chute storage
- one local basket shared across supported Chromium browsers
- preserved local copies and recallable history
- a tiny Windows companion listening only on `127.0.0.1:17891`
- a Chromium extension that provides the browser UI

This README describes the **`paid-installer-onboarding`** branch.

> This branch is the Windows paid-product/onboarding candidate. It includes the Google/Yandex direct-drop work, Opera transparency hardening, the self-installing Windows companion, the bundled browser extension, and first-run browser setup assistance. A fresh EXE from this exact branch still needs final physical-machine release testing before it should be treated as a final production build.

---

## The product in one picture

```text
Chrome / Opera / Edge / Brave
            │
            ▼
      Chute extension
            │
            ▼
     127.0.0.1:17891
            │
            ▼
      Local Chute data
```

Every installed Chute extension talks to the same local Windows companion, so the basket is shared across browsers.

Example:

```text
Opera → Chute → Chrome
Chrome → Chute → Brave
Edge → Chute → Opera
```

The extension is a browser surface over one shared local Chute, not a separate basket for each browser.

---

# Windows customer install

## Before running Chute

For the current pre-Web-Store version, turn on **Developer mode** in the browser first.

### Chrome

Open:

```text
chrome://extensions
```

Turn on **Developer mode**.

### Edge

Open:

```text
edge://extensions
```

Turn on **Developer mode**.

### Brave

Open:

```text
brave://extensions
```

Turn on **Developer mode**.

### Opera

Open:

```text
opera://extensions
```

Turn on **Developer mode**.

Then run:

```text
Chute-Setup.exe
```

---

## What the EXE does automatically

The Windows build is designed to make the unpacked-extension stage as painless as Chromium allows.

When the customer runs the downloaded EXE, Chute:

1. installs itself for the current Windows user;
2. does not require administrator privileges;
3. creates the local Chute data layout;
4. installs `Chute.exe` under the current user's Local AppData program directory;
5. registers Chute to start automatically when that user signs in;
6. launches the local Chute bridge quietly in the background;
7. installs the bundled browser extension files beside the application;
8. detects supported Chromium browsers installed on the machine;
9. opens the Extensions page for the detected browsers;
10. opens the exact Chute extension directory in Windows Explorer;
11. copies that extension directory path to the clipboard;
12. displays a small Windows setup message explaining the final browser step.

Default installed application path:

```text
%LOCALAPPDATA%\Programs\Chute\Chute.exe
```

Bundled extension path:

```text
%LOCALAPPDATA%\Programs\Chute\extension
```

The only remaining browser-required action is:

```text
Load unpacked
      ↓
select the opened Chute extension folder
      ↓
done
```

Browsers intentionally require user approval for unpacked extensions. Chute does not fake clicks, modify enterprise policy, or try to silently bypass that security boundary.

Once Chute is distributed through a browser extension store, the intended customer flow becomes even simpler and Developer mode should no longer be part of normal customer onboarding.

---

# The desired paid-software experience

The intended commercial flow is:

```text
Buy Chute
    ↓
Stripe payment succeeds
    ↓
customer receives access to Chute-Setup.exe
    ↓
Developer mode already enabled
    ↓
double-click Chute-Setup.exe
    ↓
Chute installs itself and opens browser setup
    ↓
Load unpacked → Chute extension folder
    ↓
Chute is ready
```

Stripe is the payment/delivery layer, not part of Chute's local file transport. A simple first launch can redirect successful Stripe buyers to a protected download page. For stronger paid delivery later, the download can be issued through a temporary token or signed URL after payment verification.

Do not rely on a permanently public GitHub Release URL if payment enforcement matters, because a public release asset can be shared directly.

---

# What Chute does

From the browser, Chute can accept:

- local files
- images
- webpage images
- links
- selected text

The floating Chute mascot acts as a physical landing point on normal web pages.

Items placed into Chute appear in the extension popup and side shelf and are available to the other Chute-enabled browsers on the same computer.

Chute can also preserve items after they are removed from the current live basket so they can be recalled later from history.

---

# Dragging out of Chute

Chute supports dragging stored files back out toward browser destinations.

The current browser delivery system builds an in-memory browser `File` from the preserved local Chute copy and delivers it to compatible targets.

This includes the already-tested general drag workflow used with sites such as ChatGPT.

## Google and Yandex direct image drop

This branch includes a dedicated Google/Yandex direct-drop compatibility layer.

The goal is:

```text
image in Chute
      ↓ drag
Google / Yandex image-search area
      ↓
Chute identifies or opens the site's image uploader
      ↓
Chute feeds the real image file into it
```

This removes the previous need to manually open the small image-upload expansion box before dropping the image.

The Google/Yandex adapter is isolated from the normal drag path so special-case search-engine behavior does not unnecessarily disturb sites whose native Chute drag behavior already works.

---

# Opera appearance compatibility

This branch includes a transparency compatibility layer for the floating browser Chute.

Some Opera profile/rendering combinations could paint the otherwise transparent extension iframe as a white rectangle around Chute. The branch hardens transparency at the extension document level so the floating mascot can composite cleanly over the page.

The intended appearance is the mascot by itself, not a white rectangular iframe background.

---

# Browser access modes

The extension supports browser-side access modes including:

```text
Floating mascot
Mascot + right-click
Right-click only
```

The floating mascot remains anchored near the lower-right corner of normal webpages.

The support card appears on hover and contains:

**Please donate, anything helps!**

with the support action:

**Buy the Creator a Coffee**

---

# Supported browsers

The current Chromium extension is intended for:

- Google Chrome
- Microsoft Edge
- Brave
- Opera
- other compatible Chromium browsers

The Windows installer currently has explicit browser detection/onboarding paths for Chrome, Edge, Brave, and Opera.

Protected browser pages such as `chrome://...`, `edge://...`, and equivalent internal pages do not allow ordinary extension content scripts. That is normal browser behavior.

---

# Local Windows architecture

The Windows companion is deliberately small and quiet.

It does **not** use:

- Electron
- a Windows Service
- administrator installation
- a cloud Chute backend
- a required Python installation on the customer's machine

The distributed build is packaged as a standalone PyInstaller executable.

The customer downloads one EXE and double-clicks it.

The installed copy runs in the background and serves the local bridge at:

```text
http://127.0.0.1:17891
```

Health check:

```text
http://127.0.0.1:17891/health
```

---

# Windows startup behavior

Chute installs per user and registers:

```text
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
```

The startup entry launches the installed Chute executable with:

```text
--background
```

This avoids administrator privileges and avoids installing a machine-wide Windows Service.

---

# Local data

By default, Windows Chute data lives at:

```text
C:\Users\<you>\Chute
```

Internally this is derived from the user's home directory. No Windows username is hard-coded.

If `CHUTE_HOME` is explicitly defined, that location can override the default.

Current layout:

```text
Chute\
├── queue.json
├── files\
├── thumbs\
├── custom-thumbnails\
├── image-provenance.jsonl
├── image-provenance.txt
├── .update-safety\
└── history\
    ├── YYYY-MM-DD.tsv
    └── ...
```

### `queue.json`

The current live basket.

### `files/`

Preserved originals stored by Chute.

### `thumbs/`

Tiny UI thumbnails. These are recognition aids only and are never substituted for the actual payload being dragged or uploaded.

### `custom-thumbnails/`

Optional user-sized browser-generated image derivatives.

### `history/`

Append-only daily history files.

### provenance files

Image capture provenance is stored in both machine-friendly JSONL and a human-readable text companion.

---

# History and Recall

Removing something from the live basket does not automatically destroy its preserved Chute copy or erase history.

History records events such as:

```text
add
remove
clear
recall
```

History files are split by UTC day and use a stable UTF-8 TSV format.

A removed historical item can be recalled into the live basket when the preserved file still exists.

Clear empties the live basket. It does not silently wipe the entire preserved history system.

---

# Thumbnails

Chute keeps image thumbnails intentionally tiny.

The normal UI thumbnail is approximately 48px and exists only to help recognize an item in the interface.

The original file remains the original file.

The thumbnail is never used as the outgoing attachment payload.

Optional custom-size derivatives are stored separately under `custom-thumbnails/` so they do not overwrite the preserved original.

---

# Image provenance

Chute records browser image-capture provenance locally.

Canonical machine-readable file:

```text
image-provenance.jsonl
```

Human-readable companion:

```text
image-provenance.txt
```

The text format uses the capture marker:

```text
# CHUTE-IMAGE-CAPTURE\t1
```

This is intended to make it possible to understand where a captured browser image came from without relying on a remote service.

---

# Privacy model

Chute is local-first.

Core behavior:

- the bridge binds to loopback by default;
- Chute does not run a remote Chute storage server;
- preserved files live on the user's computer;
- browser captures are handed to the local companion;
- browser access exists so user-selected webpage images/files can be captured and moved through Chute;
- the same local basket can be exposed through multiple browsers on the same computer.

The extension requires normal `http://` and `https://` access because the floating browser interface and webpage-image capture are core product features.

---

# Windows logs

The Windows companion writes its local log under Local AppData:

```text
%LOCALAPPDATA%\Chute\logs\chute.log
```

If the mascot says `OFF` or the browser cannot reach Chute, check:

```text
http://127.0.0.1:17891/health
```

and then inspect the log.

---

# Building the Windows executable

From a Windows checkout of this branch:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

The build script:

- creates an isolated build virtual environment;
- installs PyInstaller and this package into that environment;
- verifies the extension contains `manifest.json`;
- embeds the entire `extension` directory into the executable;
- produces the standalone Windows executable under `dist\windows`.

Expected build output:

```text
dist\windows\Chute-Windows.exe
```

For customer-facing distribution it can be renamed to:

```text
Chute-Setup.exe
```

The EXE is intended to require neither Python nor administrator privileges on the customer machine.

---

# Development checkout on Windows

Example:

```bat
mkdir C:\Users\YOURNAME\dev
cd C:\Users\YOURNAME\dev
git clone https://github.com/thanks-cohn/chute.git
cd chute
git switch paid-installer-onboarding
```

If you are testing the extension directly from the checkout, load:

```text
C:\Users\YOURNAME\dev\chute\extension
```

Do not accidentally keep testing an old extracted copy from Downloads while editing the Git checkout.

After changing extension code:

1. open the browser's Extensions page;
2. press Reload on Chute;
3. refresh the webpage being tested.

---

# Linux

Chute also has Linux history and installation work in earlier branches.

The Linux installer uses a private Python virtual environment and a user-level systemd service rather than modifying the system Python environment.

Typical Linux install from a compatible branch:

```bash
sh scripts/install-user.sh
```

The Windows paid-product branch documented here is focused on the standalone Windows customer experience. Do not assume Windows installation instructions apply to Linux or vice versa.

---

# Branch map

The repository intentionally keeps major product milestones isolated instead of rewriting old working states.

| Branch / tag | Purpose |
| --- | --- |
| `main` / `v1` | Frozen original baseline. Do not use as the active paid-product branch. |
| `premium-v2` | Premium local-history/browser work and Linux-oriented development lineage. |
| `windows-v2.3-chromium` | Known-good Windows/Chromium packaging baseline. |
| `direct-drop-google-yandex` | Adds the tested direct Google/Yandex image-drop behavior and Opera transparency work while keeping the previous Windows branch intact. |
| `paid-installer-onboarding` | Current paid-product candidate. Adds the bundled extension and assisted first-run Windows browser onboarding on top of the direct-drop branch. |

Because Git branches contain their own file snapshots, **each branch has its own `README.md` state**. Documentation can therefore describe that exact milestone without rewriting older branch history.

---

# Current paid-product branch status

Branch:

```text
paid-installer-onboarding
```

Included in this branch:

- shared local Chute basket
- Chromium extension
- browser floating mascot
- popup and side shelf
- preserved local files
- recallable history
- tiny UI thumbnails
- image provenance
- direct Google image-search drop compatibility
- direct Yandex image-search drop compatibility
- Opera transparent floating-frame compatibility
- standalone Windows packaging
- per-user self-install
- Windows autostart registration
- bundled extension files inside the EXE
- Chrome / Edge / Brave / Opera detection
- automatic opening of browser Extensions pages
- automatic opening of the exact bundled extension folder
- automatic clipboard copy of that folder path
- first-run setup message

Still required before calling a build final production software:

- build a fresh EXE from **this exact branch**;
- test that EXE on a normal Windows machine from download through first launch;
- verify browser onboarding in each supported browser intended for sale;
- verify the Opera transparency fix in the normal Opera profile;
- verify Google/Yandex direct drop remains intact in the packaged build;
- decide final signing/reputation strategy for Windows SmartScreen;
- decide final paid-download delivery method behind Stripe;
- eventually replace unpacked-extension onboarding with browser-store distribution where practical.

---

# Product philosophy

Chute is intentionally small.

**Linux has the power. The problem is making the power feel effortless.**

**Keep Linux underneath. Replace the friction on top.**

**Good defaults. Maximum optional control.**

And for the browser side:

**One Chute. Every browser.**
