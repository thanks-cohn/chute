# Chutey historical working and stability candidates

These are **distinct references**. Do not substitute one release's Chrome ZIP, Windows installer, or executable for another without an explicit compatibility/restore test.

## November 3, 2026 confirmed working pair

- Tag: `chute-v2.6.1-main-upgrades-2026-11-03-working`
- Source commit: `8fc7a3f698632ffa42f2f14db59fa5be7d271e86`
- Release: https://github.com/thanks-cohn/chute/releases/tag/chute-v2.6.1-main-upgrades-2026-11-03-working
- GitHub Actions: Windows `41770688623`; Chrome `41770688602`; test `41770688697`.
- The repository's `docs/WORKING_PAIR_2026-11-03.md` identifies a user-confirmed working Windows+Chrome pair and reports `/health` build `main-2.6.1-upgrades-2026-11-03`.
- Published `Chute-Setup.exe` digest: `B61C083D8A637B129526410807B2A20441F2A1D1E2EB8527132F7B41ADC98726` — **installer digest**, not installed `Chute.exe` digest.
- Does **not** prove three months of continuous use.

## Older Windows v2.6.1 RC1

- Tag: `chute-windows-v2.6.1-rc1`
- Release date: August 31, 2026.
- Release: https://github.com/thanks-cohn/chute/releases/tag/chute-windows-v2.6.1-rc1
- Original README describes Chrome Native Messaging helper waking/relaunching `Chute.exe` after process termination, and returning `127.0.0.1:17891` to service.
- Published `Chute-Setup.exe` digest: `8A6A534982401E76719C05E57CB75C78CF20E27F977D2A7C75AC9D2C85C831EE` — installer digest.
- **Candidate for historical reliability**, not evidence that it personally ran for three months on the user's Windows machine.

## November 4 TEST — exact match to installed worker on November 16

- Release tag: `chute-test-20261104-0529-CST`
- Release: https://github.com/thanks-cohn/chute/releases/tag/chute-test-20261104-0529-CST
- `Chute-Windows-Explorer-TEST.exe` digest `C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`; exact match to installed `Chute.exe`.
- `/health` reports `main-2.6.1-upgrades-2026-11-03`, which is a build label and **not proof** that every Nov 3 binary is byte-identical.
- Currently observed operational pair uses Chrome source commit `45dc8f0`, not the release's older Chrome ZIP.

## v2.4.0 Linux mainline

- Repository file: `RELEASE-v2.4.0.md`.
- Describes Linux mainline and local-first drag/drop, provenance and history features.
- This is not the identified Windows worker and should not be substituted as such.

## Compare before any rollback

Inspect build source, native host registration, health bridge, on-disk user data compatibility, recovery launch paths, extension permissions and APIs. Back up all user data; never silently change the installed executable or its paired Chrome extension.
