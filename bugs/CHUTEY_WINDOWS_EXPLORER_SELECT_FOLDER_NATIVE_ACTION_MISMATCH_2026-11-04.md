# BUG — Select folder returns “Unsupported Chute native action”

**Reported:** November 4, 2026 · owner using the newer Chutey Explorer Shelf on Windows  
**Priority:** P0 user-installed test-pair blocker  
**Observed symptom:** Clicking **Select folder** produces literal UI error **`Unsupported Chute native action`**, without opening usable Explorer folder selection.  
**Actual local installation state:** not yet independently inspected. Do not claim an old host has been proven installed.  
**Source-reproduced root-cause hypothesis:** newly packaged extension calls an old or mismatched native messaging host.

## Exact traced call path

1. `extension/explorer-view.js`: Select button calls `api.nativeSession(true)`.
2. `extension/explorer-api.js`: `chrome.runtime.sendNativeMessage("com.thankscohn.chute", {action:"explorer_select_folder"})`.
3. `src/chute/native_host.py`, current main `cf5a62b`: `native_main` recognizes `explorer_select_folder` and `explorer_resume`, otherwise responds with `{"ok":false,"error":"Unsupported Chute native action"}`.
4. Prior source `3fd27da` **has no** `explorer_select_folder` branch but **does** have the exact fallback error. This is direct evidence that mismatching old extension/native-host versions reproduces the observed message.
5. Windows native host registration: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.thankscohn.chute` points to an OS manifest JSON (usually `%LOCALAPPDATA%\Programs\Chute\com.thankscohn.chute.json`) whose `path` should resolve to `%LOCALAPPDATA%\Programs\Chute\Chute-NativeHost.exe`.
6. `src/chute/windows_app.py` refreshes registration and bundles native host when the new Windows EXE starts; `src/chute/native_host.py::install_bundled_native_host` performs byte comparison. **Important edge case:** on native-host `PermissionError`, it can silently preserve an old executable for this launch rather than fail, leaving an older helper registered. This needs a regression test and explicit mismatch reporting, not mere optimistic install success.

## First owner-directed remediation (non-destructive)

- Acquire the **same-pair** Windows EXE and Chrome ZIP from successful test-build run `41795692460`, artifact `13304873647` (source `a6214d4`), rather than mixing ZIP/EXE versions. Run new Windows EXE once to self-install, avoiding removal of Chute History.
- Reload only the matching unpacked Chrome extension, restart Chrome if needed, and retry Select folder.
- If the error persists, inspect the actual registered manifest and helper path, compare helper timestamp/hash before and after the new EXE, and verify no old Chute.exe/native-host process or other Chrome profile is routing to a mismatched helper. Do **not** paste bearer tokens or full private folder paths into public tickets.
- Windows PowerShell read-only diagnostics:
  ```powershell
  $key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.thankscohn.chute'
  $manifestPath = (Get-Item $key).GetValue('')
  $manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
  $hostPath = $manifest.path
  [pscustomobject]@{
    NativeManifest = $manifestPath
    NativeHostExists = Test-Path $hostPath
    NativeHostPath = $hostPath
    NativeHostSHA256 = if (Test-Path $hostPath) { (Get-FileHash $hostPath -Algorithm SHA256).Hash } else { '<missing>' }
    NativeHostModified = if (Test-Path $hostPath) { (Get-Item $hostPath).LastWriteTime } else { $null }
  }
  ```
- If registry path is absent, inspect HKLM registration as well. Never manually edit registration or uninstall Chute unless a trusted repair path has been established. Do not erase History.

## Required Codex hardening after baseline is restored

1. Add **`get_native_capabilities`** / version handshake with runtime source ID or protocol version. On Shelf startup/Select folder, report **“Your Windows companion needs updating”** and provide a safe pairing instruction instead of forwarding generic “Unsupported action.”
2. Guarantee installer **atomic/verified native host replacement**, or clearly fail the installer and preserve the known-good host when the existing binary is locked; no silent false success. Compare **actual installed bytes/hash** against the expected bundled native host after repair, not just file presence and companion `/health`.
3. Add a disposable Windows integration test: **old host installed + new extension + new EXE** → registration/host repair → actual `explorer_select_folder` response reaches new protocol (inject picker result in test-only native boundary); old helper must be detected before asserting success.
4. Test multiple unpacked extensions/profile IDs without ever authorizing arbitrary web pages; preserve exact Chrome native origin validation and protected file ACLs. Do not weaken CSP or native message authentication.
5. Keep this error separate from later issues: native picker cancellation, root grant expiry, session mismatch, permissions, and Windows reparse restrictions each need their own actionable reason codes.
6. Deliver a **matched updated pair** and simple owner instructions; classify installed owner acceptance as pending until observed.

**Do not rewrite the Chrome service worker, filesystem engine or native messaging security to work around an install/version mismatch.** Fix pairing and evidence first.
