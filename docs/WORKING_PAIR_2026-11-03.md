# Chute — Working Windows EXE and Chrome worker pair (November 3, 2026)

This is the owner's user-confirmed, working Chute pairing. It is **not** the older public v2.6.1 RC1.

| Item | Exact origin |
| --- | --- |
| Git annotated tag | `chute-v2.6.1-main-upgrades-2026-11-03-working` |
| Matching source commit | `8fc7a3f698632ffa42f2f14db59fa5be7d271e86` |
| Windows setup EXE | [Actions run 41770688623](https://github.com/thanks-cohn/chute/actions/runs/41770688623) artifact `Chute-2.6.1-Main-Upgrades-Windows-TEST` |
| Chrome worker/extension | [Actions run 41770688602](https://github.com/thanks-cohn/chute/actions/runs/41770688602) artifact `Chute-Chrome-Web-Store-v2.6.1` |
| Platform, API, boot tests | [Actions run 41770688697](https://github.com/thanks-cohn/chute/actions/runs/41770688697), passed |
| Development branch | `chute-main-2.6.1-upgrades-2026-11-03` |

The owner installed and verified the paired development build on Windows. Its `/health` includes `build: main-2.6.1-upgrades-2026-11-03`.

**Maintaining compatibility:** `main` received a subsequent Chrome-Shelf-only correction: quiet Open success, visible thumbnail interception, and consistent vector file icons. These are frontend changes; the Windows executable that previously passed remains the same build. To use the updated Shelf, load the extension from current `main`.

The latest GitHub Release is published by `.github/workflows/publish-known-good-release.yml` using the exact previously verified Windows + Chrome artifacts and their pinned source tag, not by rebuilding a different binary behind the same name. This release contains the older pinned Shelf UI; current `main` contains the follow-up visual patch.

Protect the tag from forced retargeting, retain the source commit, and preserve the user's pre-upgrade local data.
