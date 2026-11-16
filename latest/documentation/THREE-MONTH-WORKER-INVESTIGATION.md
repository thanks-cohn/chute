# Investigation: which Chutey worker actually lasted approximately three months?

**Status: UNSOLVED.** The owner recalls a Chutey native worker that reportedly stayed reliable for approximately three months, followed by newer regressions. No recorded checksum, executable identity, exact dates, extension ID or verified telemetry has established which historical build that was.

## Relevant evidence

- Historical reference: `docs/GOLD_STANDARD_WORKER.md`, recorded 2026-11-10. Explicitly warns that the identity of the months-long running Windows binary remains unverified.
- Older Windows `chute-windows-v2.6.1-rc1`, released Aug 31, has documented kill-and-relaunch recovery tests. It is a **candidate**, not a proven three-month match.
- November 3 `chute-v2.6.1-main-upgrades-2026-11-03-working` is documented as a working Windows/Chrome pair. Its age by Nov 16 makes it impossible to independently prove three months of runtime since release.
- November 4 `chute-test-20261104-0529-CST` contains an EXE exactly matching the user's installed EXE on Nov 16, and the running health endpoint is OK at the time of inspection. This does not prove three months of usage.
- Chute `v2.4.0` is an earlier **Linux mainline** milestone, not the Windows executable identified by these tests.

## Future research tasks

1. Ask the owner for the approximate **start and end dates** of the reliable three-month interval, and whether it happened on Windows or Linux.
2. Search retained installers, Windows Downloads, historical Windows app folders, backup images, and package/installer logs for older `Chute.exe` instances or setup files. Preserve SHA-256 and path before modifying any file.
3. Compare saved Chrome extension directories and their Git source SHAs, Chrome IDs, and installed native-host registration.
4. Inspect GitHub release dates, source tags, release `SHA256SUMS.txt`, Actions artifact digests, and installed EXE file metadata.
5. If retained worker is found, compare it byte-for-byte by SHA-256 against published assets; keep a checksum inventory.
6. Run controlled fault injection on restored copies **without replacing the current working installation**. Include service-worker sleep, native-host disconnect, `Chute.exe` kill/relaunch, browser restart, Windows sleep/resume, multiple simultaneous copies, and user data integrity.
7. Record empirical outcomes and dates. Mark “three months verified” only if attributable logs or independent provenance substantiate the claim; otherwise preserve it as a user-reported historical success.

## Recommended reference order

1. Current observed Nov 16 extension+worker pair: exact checksum and source SHA.
2. Nov 3 confirmed working pair.
3. Aug 31 RC1 older recovery-tested candidate.
4. Further earlier builds if the three-month interval predates August 31.
5. v2.4.0 Linux reference only for Linux-related historical comparison.

**Never re-label speculation as verified longevity.**
