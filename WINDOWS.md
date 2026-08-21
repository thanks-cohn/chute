# Chute for Windows

Chute is primarily a Chromium browser extension. The Windows companion is a tiny local bridge that gives Chrome, Opera, Brave, Edge, and other compatible Chromium browsers one shared local Chute.

## Customer experience

The intended normal-user setup is deliberately short:

1. Install the Chute browser extension.
2. Download `Chute.exe`.
3. Double-click `Chute.exe` once.

That is it.

The downloaded executable installs itself for the current user under:

```text
%LOCALAPPDATA%\Programs\Chute\Chute.exe
```

It registers itself in the current user's normal Windows startup key and immediately starts the local bridge on:

```text
127.0.0.1:17891
```

No Python installation is required. No PowerShell command is required. No administrator privilege is required. Chute does not install a Windows Service and does not modify system-wide service configuration.

## Shared browser model

```text
Chrome ─┐
Opera  ─┤
Brave  ─┼── Chute extension ── 127.0.0.1:17891 ── Chute.exe
Edge   ─┘                                      │
                                                └── %USERPROFILE%\Chute\
```

All installed Chromium browsers communicate with the same per-user Chute data directory.

## Data

The normal Windows data tree is human-readable and matches the Linux model:

```text
%USERPROFILE%\Chute\
├── queue.json
├── files\
├── thumbs\
├── custom-thumbnails\
├── history\
├── image-provenance.jsonl
└── image-provenance.txt
```

Updates must preserve this directory. User content is not browser cache and is not stored inside the extension package.

## Building the customer executable

A Windows build machine can run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

The result is:

```text
dist\windows\Chute.exe
```

PyInstaller is a build-time dependency only. It is bundled into the resulting executable; customers do not need Python or PyInstaller.

## Browser package

The same extension source is intended for Chrome, Opera, Brave, and Edge. Build the Chromium package with:

```powershell
py -3 scripts\build-chrome-store.py
```

The generated ZIP is under `dist\chrome-store\`.

## Distribution note

For the smoothest experience for strangers, release builds should eventually be Authenticode code-signed. An unsigned executable can trigger Windows SmartScreen/Unknown Publisher warnings even when the program itself requires no administrator privileges.
