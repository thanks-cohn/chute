# Chute

> **LICENSE NOTICE — NOT MIT. NON-COMMERCIAL SOURCE-AVAILABLE SOFTWARE.**
>
> This branch is provided under the **Chute Source-Available Non-Commercial License v1.0** in [`LICENSE`](LICENSE). Personal, educational, research, evaluation, hobby, and other genuinely non-commercial use is permitted. **Commercial use is prohibited without prior written permission.** You may not sell, monetize, commercially redistribute, bundle into a paid product or service, publish a paid fork or clone, or use this repository or a substantial derivative to create a product or service for financial gain.

**One Chute. Every browser.**

Chute is a lightweight local file basket for the browser. Drop files, images, links, or text into the floating Chute, preserve them locally, then drag or attach them somewhere else later.

This README describes the **`paid-installer-onboarding`** branch, the current Windows paid-product/onboarding candidate.

## Product architecture

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

Every installed Chute extension talks to the same local Windows companion, so one local basket/history can be shared across browsers.

Chute is intentionally local-first:

- no required Chute cloud account for the local basket
- no remote Chute storage backend for normal queue/history behavior
- preserved local originals and recallable history
- browser-generated thumbnails
- a small Windows companion listening only on loopback by default
- a Chromium extension providing the browser UI

## Windows customer install plan

### Before running Chute

For the current pre-Web-Store version, the customer should first open the Extensions page in the browser they want to use and turn on **Developer mode**.

```text
Chrome: chrome://extensions
Edge:   edge://extensions
Brave:  brave://extensions
Opera:  opera://extensions
```

Then run:

```text
Chute-Setup.exe
```

### What the EXE is designed to do automatically

The Windows build bundles the browser extension and automates everything around Chromium's required unpacked-extension approval step:

1. install Chute for the current Windows user;
2. require no administrator privileges;
3. create the local Chute data layout;
4. install `Chute.exe` under Local AppData;
5. register Chute to start for that user at sign-in;
6. launch the loopback bridge quietly in the background;
7. extract/install the bundled extension beside the application;
8. detect Chrome, Edge, Brave, and Opera when installed;
9. open the Extensions page for detected browsers;
10. open the exact installed Chute extension directory in Windows Explorer;
11. copy that extension directory path to the clipboard;
12. display a short Windows setup message describing the final browser step.

Default application path:

```text
%LOCALAPPDATA%\Programs\Chute\Chute.exe
```

Bundled extension path:

```text
%LOCALAPPDATA%\Programs\Chute\extension
```

The remaining browser-required action is:

```text
Load unpacked
      ↓
select the opened Chute extension folder
      ↓
done
```

Chute intentionally does not fake browser clicks, force enterprise policies, or silently bypass the browser's extension-approval boundary.

## Intended paid-software delivery

The desired commercial flow is:

```text
Buy Chute
    ↓
Stripe confirms payment
    ↓
protected download access
    ↓
Chute-Setup.exe
    ↓
customer already enabled Developer mode
    ↓
double-click
    ↓
Chute installs and opens browser setup
    ↓
Load unpacked → opened Chute folder
    ↓
Chute is ready
```

The planned distribution architecture is to keep the customer EXE private in object storage such as Cloudflare R2 and let a Cloudflare Worker verify the paid-session/download entitlement before returning the file or a short-lived download path. A permanently public GitHub Release URL should not be treated as payment enforcement.

## What Chute accepts

The browser Chute can ingest:

- local files
- images
- webpage images
- links
- selected text

Items appear in the popup/side shelf and are shared through the local Chute service with the other Chute-enabled browsers on the same computer.

## Dragging out

Chute builds a browser `File` from the preserved local item and delivers it to compatible browser destinations.

The general drag workflow is designed to coexist with sites such as ChatGPT and other file-drop targets without exposing Chute's private drag token as ordinary text.

### Google and Yandex direct image drop

This branch inherits the dedicated direct-drop adapter developed in `direct-drop-google-yandex`:

```text
image in Chute
      ↓ drag
Google / Yandex image-search area
      ↓
Chute identifies or opens the site's image uploader
      ↓
real image File is delivered
```

That adapter is isolated from the general drag path so Google/Yandex special handling does not unnecessarily disturb sites that already work normally.

## Opera transparency compatibility

The branch also inherits transparency hardening added after normal Opera could paint a white rectangle behind the otherwise transparent floating extension frame while private Opera rendered it correctly.

The intended appearance is the mascot by itself, with the surrounding iframe/document canvas transparent.

## Browser access modes

The extension lineage supports browser-side access such as:

```text
Floating mascot
Mascot + right-click
Right-click only
```

The floating mascot remains anchored near the lower-right corner of ordinary web pages.

## Windows companion

The Windows companion deliberately avoids heavyweight desktop architecture.

It does **not** require:

- Electron
- a machine-wide Windows Service
- administrator installation
- a customer-installed Python runtime
- a remote Chute cloud backend for the local basket

The customer-facing build is a standalone PyInstaller executable.

Local health endpoint:

```text
http://127.0.0.1:17891/health
```

Windows startup registration uses the current-user Run key and launches the installed executable with `--background`.

## Local data

Default Windows data root:

```text
C:\Users\<you>\Chute
```

Representative layout:

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
    └── YYYY-MM-DD.tsv
```

### Originals

`files/` contains preserved Chute copies. Chute does not replace the preserved original with a thumbnail.

### UI thumbnails

`thumbs/` contains tiny recognition thumbnails (approximately 48px). They are UI aids only and are never substituted for the outgoing original attachment payload.

### Custom derivatives

`custom-thumbnails/` stores optional user-sized derivatives separately from the original.

### History

History is append-only and split by UTC day. Events include `add`, `remove`, `clear`, and `recall`. Clearing the live basket does not silently erase the preserved history system.

### Provenance

Browser image captures can record provenance in:

```text
image-provenance.jsonl
image-provenance.txt
```

The human-readable capture marker is:

```text
# CHUTE-IMAGE-CAPTURE\t1
```

## Privacy/security model

- localhost bridge binds to loopback by default
- browser-selected content is handed to the local Chute companion
- no Chute cloud account is necessary for local queue/history operation
- preserved files remain on the user's machine
- browser access exists because page-level drag/drop and webpage-image capture are core features
- item IDs are used rather than exposing arbitrary filesystem paths to pages

## Logs

Windows log:

```text
%LOCALAPPDATA%\Chute\logs\chute.log
```

If Chute appears offline, first check:

```text
http://127.0.0.1:17891/health
```

## Building the Windows EXE

From a Windows checkout of this branch:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

The build script creates an isolated build environment, installs PyInstaller, verifies the extension bundle, embeds the entire extension directory, and produces the standalone Windows executable under:

```text
dist\windows\Chute-Windows.exe
```

The customer-facing file can be named:

```text
Chute-Setup.exe
```

## Development checkout

```bat
mkdir C:\Users\YOURNAME\dev
cd C:\Users\YOURNAME\dev
git clone https://github.com/thanks-cohn/chute.git
cd chute
git switch paid-installer-onboarding
```

For live extension development, load:

```text
C:\Users\YOURNAME\dev\chute\extension
```

Do not accidentally keep testing an old extracted Downloads copy while modifying the Git checkout. After extension changes, reload Chute from the browser Extensions page and refresh the page being tested.

## Branch map

| Branch / tag | Purpose |
| --- | --- |
| `main` / `v1` | Frozen original historical baseline. |
| `agent/love-chute-layer-systemd` | Earlier browser sticky/support-layer/systemd milestone. |
| `premium-v2` | Local history/browser/Linux milestone. |
| `windows-chrome-store` | Earlier Windows and browser-store packaging milestone. |
| `windows-v2.3-chromium` | Known-good Windows/Chromium baseline. |
| `cross-platform-chromium` | Cross-platform Chromium/companion work. |
| `direct-drop-google-yandex` | Google/Yandex direct-drop plus Opera transparency milestone. |
| `paid-installer-onboarding` | Current paid Windows installer/onboarding candidate. |

## Current status

Included in this branch:

- shared local Chute basket
- Chromium extension
- floating mascot
- popup and side shelf
- preserved files and recallable history
- tiny UI thumbnails
- image provenance
- Google/Yandex direct-drop compatibility
- Opera transparency compatibility
- standalone Windows packaging
- per-user self-install
- Windows autostart registration
- extension bundled inside the EXE
- Chrome / Edge / Brave / Opera detection
- automatic opening of browser Extensions pages
- automatic opening of the installed extension folder
- clipboard copy of that folder path
- first-run setup message

Before treating a build as final production software, build a fresh EXE from this exact branch and test the complete download → installation → browser-onboarding → direct-drop flow on normal Windows/browser profiles.

## License

**This branch is not MIT licensed.** It is distributed under the **Chute Source-Available Non-Commercial License v1.0**. See [`LICENSE`](LICENSE) for the complete terms.

Commercial use, resale, paid redistribution, commercial forks/clones, commercial derivatives, or using this source/repository to create a revenue-generating product or service requires separate written permission from the applicable Chute rights holder.

Historical snapshots that were validly distributed under an earlier license are not retroactively relicensed; the license in this branch applies to the branch state distributed with it to the extent the applicable rights holders have authority over the material.

**One Chute. Every browser.**
