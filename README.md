# How to install this fixed version of Chute!

> **Important Windows fix:** use **Chute for Windows v2.6.1 RC1** with the current Chute extension. This is the Windows companion build that fixes the previous sleep/disconnect problem and has been tested to wake Chute again after `Chute.exe` is killed.

## If you installed Chute from the Chrome Web Store

The Chrome Web Store extension still needs the Windows companion in order to keep Chute available locally and wake it again when the local worker stops responding.

1. Keep or install the **Chrome Web Store version of Chute**: https://chromewebstore.google.com/detail/chute/hpcpnigfadojjmnbflfhkfkallfafajb
2. Download **Chute for Windows v2.6.1 RC1** from the release page: https://github.com/thanks-cohn/chute/releases/tag/chute-windows-v2.6.1-rc1
3. Or download the Windows setup EXE directly: https://github.com/thanks-cohn/chute/releases/download/chute-windows-v2.6.1-rc1/Chute-Setup.exe
4. Double-click `Chute-Setup.exe` once. No Python installation, administrator account, or Windows Service is required.
5. Open Chute in Chrome and use it normally.

**Which EXE fixes the previous issue?** **Chute for Windows v2.6.1 RC1**. If you already downloaded Chute from the Chrome Web Store, this is the companion EXE you should install.

## If you want the current fixed GitHub version

The extension in this repository is the current **Chute 2.6.1** build. It is specifically designed not to leave you stranded if the local Chute worker sleeps, crashes, is killed, or disconnects.

On Windows, the current GitHub extension can:

- notice that the local bridge on `127.0.0.1:17891` is unavailable;
- ask its Manifest V3 background worker to reconnect;
- contact the installed Chute native helper;
- wake or relaunch `Chute.exe`;
- reconnect the browser UI when the local bridge returns;
- show a **Reconnect** control instead of remaining forever on a "waking up" message if automatic recovery genuinely fails.

The **v2.6.1 RC1 Windows companion also recognizes loaded unpacked copies of Chute even when Chrome gives them a different extension ID**. It keeps the official Chrome Web Store ID authorized too. That means the same Windows companion is intended to work with the Store installation and with the current `extension/` folder loaded through Developer mode.

To load the current GitHub extension:

1. Clone or pull the current `main` branch.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository's `extension/` folder.
6. Install **Chute for Windows v2.6.1 RC1** using the release link above.

This recovery path has been tested by killing `Chute.exe` and confirming that the extension/native helper can bring the local Chute bridge back automatically.

---

# Chute

**Drag it in. Drag it back out.**

Chute is a small basket that sits between your **desktop and your browser**.

Drop a file, image, link, or bit of text into Chute. Then drag it back out wherever you actually need it.

That is the whole idea.

Instead of repeatedly opening file pickers, digging through Downloads, copying things to the desktop, or uploading the same image again and again, you get one temporary place to put things while you work.

```text
Desktop ──┐
          ├──> Chute ───> ChatGPT
Browser ──┤             ├──> Google image search
          │             ├──> Yandex image search
          │             ├──> upload boxes
          │             └──> another browser
          └──<────────────── drag it back out
```

## Why Chute exists

The desktop has drag and drop. The browser has drag and drop. Somehow, moving things **between the two** can still feel more awkward than it should.

You find an image in one place, save it, remember where it went, open another site, click Upload, browse back to the file, select it, and repeat.

Chute turns that into:

1. Drag it into Chute.
2. Go where you want it.
3. Drag it back out.

It is especially useful when you are moving the same handful of files and images through several websites, search engines, chats, browsers, or workspaces during one session.

## What can I do with it?

- **Desktop → browser:** drop a file from your computer into Chute, then drag it into a website later.
- **Browser → browser:** collect an image, link, or selection from one page and use it somewhere else without hunting for it again.
- **Browser → search:** drag an image from Chute into supported image-search flows.
- **Browser → ChatGPT:** drag a Chute file or image back into ChatGPT's drop area.
- **Browser → another Chromium browser:** Chrome, Edge, Brave, Opera, and other supported Chromium browsers can use the same local basket on the same computer.
- **Keep something nearby:** remove items from the live basket without immediately losing them. Chute keeps local history so preserved items can be recalled.

## Supported web destinations

As of **August 2026**, Chute has special compatibility handling for:

- **ChatGPT** for file and image drop workflows
- **Google** image search / Google Lens flows
- **Yandex** image search flows

Normal upload areas on many other websites can work too. The sites above are the ones Chute currently goes out of its way to support when ordinary browser drag-and-drop behavior is not enough.

## What makes Chute different?

Chute is not trying to become a cloud drive, a file manager, or a giant productivity suite.

It is trying to make one very common action feel obvious:

> **I have this thing here. I want it over there.**

### One basket for the browser

You do not need a separate temporary folder for every browser window. Chute gives supported Chromium browsers on the same computer one shared place to hand things off.

### Real files come back out

Chute is not just a list of filenames or copied links. When you preserve a file or image, you can drag the actual item back into supported destinations.

### It remembers what you removed

The live basket can stay small without becoming disposable. Preserved items move into local history and can be recalled later.

### It stays local

Chute does not require a Chute cloud account just to hold your basket. The companion keeps Chute's working files and history on your own computer.

### It can get out of the way

The floating Chute can remain visible, auto-hide near the edge of the screen, or be replaced by right-click access if you prefer a quieter browser.

### It can preserve images intelligently

For browser images, Chute can keep the full original and, if you want, create a separate custom-size copy. Small interface thumbnails are only for recognition and never replace the real file.

### It is designed to recover, not strand you

On Windows, Chute can start with your computer and wake its companion again when the browser needs it. If Chute has gone to sleep, the current extension is designed to ask the native helper to wake or relaunch the local companion and reconnect automatically. If automatic recovery fails, Chute offers **Reconnect** instead of expecting you to understand local servers or port numbers.

## How Chute compares

Chute overlaps with several useful tools, but its target is a little different.

| Tool | What it is great at | Where Chute is different |
| --- | --- | --- |
| [Dropover](https://dropoverapp.com/) | A polished macOS drag-and-drop shelf with file actions and sharing tools | Chute is centered on the handoff between Chromium browsers and the local computer, including web drop targets such as ChatGPT and image search |
| [LocalSend](https://localsend.org/) | Sending files between nearby computers and phones over the local network | Chute is mainly about moving things around **one computer** while you browse, rather than choosing another device and transferring to it |
| AirDrop / Quick Share | Fast device-to-device transfer | Chute is a temporary browser/desktop basket, not a nearby-device transfer system |
| Clipboard managers | Keeping copied text and images handy | Chute is built around files, drag targets, browser images, links, and drag-back-out workflows rather than only copy/paste |
| Google Drive / Dropbox / OneDrive | Long-term storage, syncing, and sharing | Chute is for immediate handoff. There is no need to upload something to a cloud folder just because you want to use it on another webpage |

The closest mental model is probably a **drag-and-drop shelf for the browser**, but Chute is deliberately narrower than a full file utility. Its job is to shorten the distance between finding something and using it somewhere else.

## A few everyday examples

### Search an image you found online

You find an image on a webpage and want to reverse-search it.

**Without Chute:** save image → find Downloads → open image search → choose upload → find the file again.

**With Chute:** drag image into Chute → open Google or Yandex → drag image out.

### Move a desktop file into ChatGPT later

You have a PDF, image, or document on your desktop, but you are not ready to use it yet.

Drop it into Chute. Keep browsing. When you reach ChatGPT, drag it back out into the conversation.

### Work across browsers

You found something in Chrome but need it in an Opera or Edge workflow.

Put it in Chute once. Open the other browser. Take it back out.

## Chute + FrameChute

Chute also works well with [FrameChute](https://github.com/thanks-cohn/framechute), a persistent spatial workspace.

A simple way to think about the pair is:

**Chute catches things. FrameChute arranges them.**

Chute handles the quick handoff. FrameChute is where you can move, resize, layer, save, and return to material later.

> **FrameChute compatibility note:** The Chute version currently published in the Chrome Web Store may not support dragging Chute images directly into FrameChute. The **current fixed Chute extension in this GitHub repository does**, including with the **Chrome Web Store version of FrameChute**. If you specifically want Chute → FrameChute image dragging, use the current GitHub Chute extension until the Store build catches up.

Neither requires the other.

## Install

### Windows

For the fixed Windows setup, use **Chute for Windows v2.6.1 RC1**:

- Release page: https://github.com/thanks-cohn/chute/releases/tag/chute-windows-v2.6.1-rc1
- Direct EXE: https://github.com/thanks-cohn/chute/releases/download/chute-windows-v2.6.1-rc1/Chute-Setup.exe

For Windows, Chute has two small pieces: the browser extension and the Windows companion.

1. **[Install Chute from the Chrome Web Store](https://chromewebstore.google.com/detail/chute/hpcpnigfadojjmnbflfhkfkallfafajb)** for the normal Store installation, or load the current GitHub `extension/` folder for the newest fixes.
2. Download and run **Chute for Windows v2.6.1 RC1** once on that computer.
3. Open Chute in the browser and start dragging.

**If you already installed the Store version:** install the v2.6.1 RC1 companion EXE above. It keeps the official Store extension ID authorized and provides the native wake/reconnect path used by the fixed extension.

Why is there a companion at all? Browsers deliberately limit how extensions can work with files on your computer. The companion gives Chute a local place to keep the things you choose to drop into it.

After the first setup, Chute is designed to start and reconnect itself without making you think about that plumbing again.

### Linux

Linux currently uses the repository installer.

```bash
sh install.sh
```

The installer sets up Chute locally and prints the `extension/` folder to load in your Chromium browser.

Then open your browser's Extensions page, enable **Developer mode**, choose **Load unpacked**, and select that `extension/` folder.

## Privacy in one sentence

**Your Chute basket is local to your computer unless you deliberately drag or upload something into another service yourself.**

See [`PRIVACY.md`](PRIVACY.md) for the full policy.

## License

Chute is **not MIT licensed**. It uses the Chute Source-Available Non-Commercial License v1.0. See [`LICENSE`](LICENSE).
