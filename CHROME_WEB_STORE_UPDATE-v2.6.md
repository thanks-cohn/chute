# Chute 2.6 — Chrome Web Store update notes

## What changed

Chute 2.6 adds the `nativeMessaging` permission solely to make the already-disclosed Windows companion reliable after sleep, resume, or a companion-process crash, and to support an explicit user-requested complete uninstall.

The extension still uses the existing loopback bridge at `127.0.0.1:17891` for the actual Chute basket, files, thumbnails, history, and provenance. Native Messaging is **not** used to transport basket files or browsing data.

## `nativeMessaging` permission justification

Chute requires a local Windows companion to provide its disclosed local file basket. Windows may terminate or leave that companion unavailable after sleep/resume or a process failure. Chute uses Chrome's Native Messaging API as a narrow recovery channel so Chrome can launch a registered per-user Chute native host when the user next interacts with Chute.

The native host accepts only these actions:

1. `ensure_bridge` — check whether the local Chute bridge is healthy and, if necessary, launch the installed Chute companion in the background.
2. `ping` — report whether the local bridge is healthy.
3. `uninstall` — only after an explicit user action in Chute Settings, remove Chute's per-user startup/native-host/uninstall registrations and schedule removal of the Windows companion. Local Chute history is preserved unless the user explicitly selects deletion.

The native host does not inspect webpage content, does not receive Chute basket files, does not perform analytics, does not communicate with a developer-controlled server, and does not remain running as a Windows service.

## Native host scope

Host name: `com.thankscohn.chute`

Windows registration is per-user under:

`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.thankscohn.chute`

The host manifest uses an explicit `allowed_origins` list. The production origin is restricted to the published Chute Chrome Web Store extension ID:

`chrome-extension://hpcpnigfadojjmnbflfhkfkallfafajb/`

No wildcard extension origins are used.

## Why no Windows Service

Chute intentionally does not install a Windows Service and does not require administrator privileges. The native host is launched on demand by Chrome only when recovery or explicit uninstall is requested. The ordinary Chute companion remains a per-user process and the user can also remove it from the normal Windows installed-app/uninstall list.

## Reviewer test instructions

1. Install the Chute Windows companion.
2. Install Chute 2.6 from the submitted extension package.
3. Confirm `http://127.0.0.1:17891/health` responds locally.
4. Open a normal HTTP/HTTPS page and use the floating Chute or Shelf.
5. Terminate `Chute.exe` in Task Manager.
6. Reopen Chute or perform a Chute action. The extension calls its registered Native Messaging host, which restarts the local companion. The Shelf should recover without reinstalling the extension or manually restarting Windows.
7. In Chute Settings, choose **Always visible** and confirm the floating mascot remains visible on supported HTTP/HTTPS pages.
8. Confirm the mascot supports separate Default, Hover, and Grab artwork states and user-selectable box/text colors.
9. Confirm the Shelf action previously labeled **Attach** is now **Grab**.
10. Optional uninstall test: use **Uninstall Chute completely**. The extension sends the explicit uninstall action to the native host and then calls Chrome's self-uninstall API. Chute history remains unless the user selected **Delete local Chute history**.

## Privacy / data disclosure impact

No new category of user data is collected or transferred by this update. Native Messaging is used only as a local process-control channel between the Chute extension and the installed Chute companion on the same Windows computer.

The existing disclosure remains accurate: user-chosen Chute content is kept on the user's computer and is not sent to a Chute cloud server.
