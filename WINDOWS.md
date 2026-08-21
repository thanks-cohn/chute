# Chute for Windows

This branch contains the Windows companion and Chrome Web Store packaging work.

## Design

Chute for Windows deliberately does **not** use Windows Services.

It is a normal per-user application:

```text
Windows sign-in
    ↓
Chute.exe starts quietly
    ↓
127.0.0.1:17891
    ↓
Chrome / Edge / Brave / Opera → one shared local Chute
```

The installer registers `Chute.exe` under the current user's normal `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` startup entry. No administrator privileges are required for that per-user startup mechanism.

The local Chute data layout remains human-readable and compatible with the Linux design:

```text
%USERPROFILE%\Chute\
├── queue.json
├── files\
├── thumbs\
└── history\
```

## Build Chute.exe

Requirements for the build machine:

- Windows 10/11
- Python 3.10+

From PowerShell in the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

This creates:

```text
dist\windows\Chute.exe
```

PyInstaller is a **build dependency only**. The customer receives the resulting executable and does not need to install Python or PyInstaller.

## Install for the current user

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

The installer:

- copies Chute to `%LOCALAPPDATA%\Programs\Chute\Chute.exe`;
- adds a normal current-user startup entry;
- creates a Start Menu shortcut;
- starts Chute immediately;
- uses `%USERPROFILE%\Chute` for basket/history data;
- does not install a Windows Service.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uninstall-windows.ps1
```

By default, uninstall preserves the user's Chute basket/history directory.

To deliberately remove local Chute data too:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uninstall-windows.ps1 -RemoveData
```

## Chrome Web Store package

Run:

```powershell
py -3 scripts\build-chrome-store.py
```

The builder creates a clean extension ZIP with generated raster icons under `dist\chrome-store\`, plus Store icon/promo assets. The Chrome Web Store Developer Dashboard still requires at least one **real screenshot** of the working extension; capture that from Chrome rather than using a fabricated mock screenshot.

See `store/LISTING.md`, `store/PRIVACY_POLICY.md`, and `store/REVIEW_NOTES.md` before submission.

## Commercial Windows companion

The intended Windows product is **$2.99 one-time** for the packaged companion/installer experience. The Chrome Web Store listing must clearly disclose that the Windows companion is required for core local-basket functionality and is sold separately by the Chute publisher, not Google.
