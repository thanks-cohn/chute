# Current Chutey Windows/Chrome pair — observed November 16, 2026

## Chrome side

- Local unpacked directory: `C:\Users\jg202\Desktop\Chute-November-3-Upgraded\extension`
- Git checkout branch: `feat/chutey-faces-gallery-2026-11-10` (clean, reported up to date with origin at inspection).
- Git HEAD: `45dc8f034045c8807f5b712f7e8915c7ba76313a`.
- Commit timestamp: 2026-11-10 20:26:06 -0600.
- Commit subject: `style(popup): softly reveal progressively loaded thumbnails without resizing tiles`.
- Manifest declares Chutey v2.6.1, MV3.
- Owner reloaded Chrome extension and reported that it looked the same. This supports the source-directory match but does not prove complete runtime behavior or worker reliability.

## Native Windows side

- Executable path: `C:\Users\jg202\AppData\Local\Programs\Chute\Chute.exe`.
- Two `Chute.exe --background` process instances observed: PIDs `14492`, `7204`. No determination whether duplicate processes are normal or a bug.
- Health URL: `http://127.0.0.1:17891/health`.
- Observed response:
```json
{"ok": true, "service": "chute", "build": "main-2.6.1-upgrades-2026-11-03", "features": ["browse", "calendar", "reveal"]}
```
- Local EXE SHA-256: `C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`.
- GitHub Releases API metadata exposes exactly the same checksum for `Chute-Windows-Explorer-TEST.exe` in release `chute-test-20261104-0529-CST` (published 2026-11-04).
- Release: https://github.com/thanks-cohn/chute/releases/tag/chute-test-20261104-0529-CST
- Exact binary: https://github.com/thanks-cohn/chute/releases/download/chute-test-20261104-0529-CST/Chute-Windows-Explorer-TEST.exe
- Release also contains `SHA256SUMS.txt`, `SOURCE-COMMIT.txt`, `INSTALL-AND-EVIDENCE.md`, and `chute-chrome-2.6.1.zip`. The zipped Chrome extension is NOT presumed identical to the later Nov 10 checkout.

## Verification boundary

**Established:** source checkout commit, reported Chrome reload behavior, native executable path and checksum, live health response, matching published binary digest.

**Not established:** uninterrupted historical three-month stability, exact native runtime source commit inferred solely from the `build` string, whether native host recovery is consistently successful, user-data backup, or that the process duplication causes instability.

Keep the native binary in GitHub Releases; this source branch links to it rather than duplicating the EXE in Git.
