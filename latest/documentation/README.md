# Chutey — latest archive and recovery references (2026-11-16)

This directory is an **evidence-bound recovery index**. It records the user's observed working combination and keeps alternative historical worker candidates discoverable if a component fails.

**Do not interpret "working" as a certified three-month uninterrupted endurance test.** The owner reports a former Chutey worker working reliably for approximately three months; the exact source revision or executable for that historical period is **still unidentified**.

## Primary: current observed working pairing (2026-11-16)

- Chrome unpacked extension directory: `C:\Users\jg202\Desktop\Chute-November-3-Upgraded\extension`
- Git branch at inspection: `feat/chutey-faces-gallery-2026-11-10`
- Extension commit: `45dc8f034045c8807f5b712f7e8915c7ba76313a` (2026-11-10 20:26:06 -0600)
- Archive branch created at exactly that commit: `archive-chutey-11.16.2026` (this documentation adds subsequent commits only)
- Manifest version: `2.6.1`; reload reported unchanged appearance.
- Windows executable: `C:\Users\jg202\AppData\Local\Programs\Chute\Chute.exe`
- Observed command line: `Chute.exe --background`; two instances observed, PIDs 14492 and 7204 (no inference of fault).
- `curl.exe -s http://127.0.0.1:17891/health` returned `{"ok": true, "service": "chute", "build": "main-2.6.1-upgrades-2026-11-03", "features": ["browse", "calendar", "reveal"]}`.
- Installed EXE SHA-256: `C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`
- **Exact byte identity:** the checksum matches the published release asset `Chute-Windows-Explorer-TEST.exe` at [chute-test-20261104-0529-CST](https://github.com/thanks-cohn/chute/releases/tag/chute-test-20261104-0529-CST).
- [Direct recovery EXE](https://github.com/thanks-cohn/chute/releases/download/chute-test-20261104-0529-CST/Chute-Windows-Explorer-TEST.exe). This is a released executable, not necessarily a replacement installer; inspect its packaging before attempting a reinstall.
- The matching release's Chrome ZIP is **not** the same as the later November 10 extension checkout.

See [CURRENT-WORKING-PAIR.md](CURRENT-WORKING-PAIR.md) and [WORKER-SHA256.txt](WORKER-SHA256.txt).

## Other candidates — preserve separately

- [November 3 matched working pair](HISTORICAL-CANDIDATES.md#november-3-2026-confirmed-working-pair): source `8fc7a3f698632ffa42f2f14db59fa5be7d271e86`; tag `chute-v2.6.1-main-upgrades-2026-11-03-working`. Documented user-confirmed working pairing; do not confuse its Setup EXE's hash with the November 4 TEST worker.
- [August 31 Windows 2.6.1 RC1](HISTORICAL-CANDIDATES.md#older-windows-v261-rc1): documented kill/restart/reconnect test; **candidate**, not verified as the three-month worker.
- [Chute 2.4.0](HISTORICAL-CANDIDATES.md#v240-linux-mainline): documented Linux mainline milestone; **not an identified Windows executable**.

See [HISTORICAL-CANDIDATES.md](HISTORICAL-CANDIDATES.md) and [THREE-MONTH-WORKER-INVESTIGATION.md](THREE-MONTH-WORKER-INVESTIGATION.md).

## Recovery / archival policy

1. Never overwrite, move, or retarget the historical release tags or source baseline branch.
2. Archive release binaries by their existing GitHub Releases URL and SHA-256; avoid duplicating binaries in Git history. The exact currently installed EXE is already published.
3. Before changing local installation, back up user data, native host configuration, browser extension directory, and the installed EXE.
4. A Git branch only preserves committed source, **not** a running Windows binary, native registration, browser storage, or user data.
5. Restore the browser and Windows worker as a compatible pair, confirm the executable's SHA-256, check `/health`, and test actual drag/drop and worker recovery before calling it functional.
6. Do not treat a momentary `/health` OK or a passing CI run as proof of months of uninterrupted stability.

This archive is read-only historical evidence for future REDOWN / Universal File API integration, not permission to silently switch current installs.

## November 16 API-first and adapter addenda

- [API-first architecture and implementation boundary](API-FIRST-ARCHITECTURE-2026-11-16.md)
- [Implemented local API and compatibility](LOCAL-API.md)
- [Machine-readable HTTP definitions](local-api.openapi.json)
- [Versioned media adapter design requirement](MEDIA-ADAPTER-CONTRACT.md)
- [Phase 1 evidence and isolated Windows handoff](PHASE1-WINDOWS-HANDOFF.md)
