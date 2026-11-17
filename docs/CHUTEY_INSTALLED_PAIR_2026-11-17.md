# Chutey — Development 1 Windows Fingerprint and SPECULATIVE Chrome Compatibility

**Record date:** November 17, 2026  
**Classification:** **WINDOWS BINARY IDENTITY VERIFIED ON NOV 17; INSTALLED CHROME PAIRING AND BRANCH COMPATIBILITY SPECULATIVE / UNVERIFIED**  
**Owner's observation window:** **less than one day** (user-reported; no independent endurance telemetry).  
**Do not call this a verified installed Chrome/Windows pair, GOLD, long-term stable, three-month proven, or the newer Request 3 build.**

> **Owner correction (Nov 17, 2026):** The owner believes they may have accidentally deleted the browser build that was paired with these Windows executables. Accordingly, a *locally installed / working Chrome pairing* is **NOT VERIFIED**. The owner suggests that the worker may have been paired with a branch **after the aesthetic-focused work**; if none of those builds remains, the owner **believes** the aesthetic branch may work as a fallback. These are owner hypotheses to test, **not facts confirmed by hashes, CI, or runtime compatibility tests**. This correction does **not** retract the separately verified historical hashes of the Windows binaries.

## Provenance with direct evidence

| Fact | Value | Evidence |
| --- | --- | --- |
| Repository | `thanks-cohn/chute` | GitHub repository |
| **GitHub Actions build branch** | **`build/chutey-phase1-worker-2026-11-16`** | [Run 43975395351](https://github.com/thanks-cohn/chute/actions/runs/43975395351), head_branch; [pinned workflow](https://github.com/thanks-cohn/chute/blob/b62c2a989bd9f8b0771e27e7c36750b6e8b02f9c/.github/workflows/build-chutey-phase1-worker-2026-11-16.yml) |
| **Build commit** | **`b62c2a989bd9f8b0771e27e7c36750b6e8b02f9c`** | GitHub Actions head_sha; [commit](https://github.com/thanks-cohn/chute/commit/b62c2a989bd9f8b0771e27e7c36750b6e8b02f9c) |
| **Development source branch at build preparation** | **`codex/2026-11-16-phase1-repairs`** | [Archived worker's provenance README](https://github.com/thanks-cohn/chute/blob/archive/chutey-11.16-worker/chutey/archive/11.16_worker/README.md) names it. This is the development-line context, NOT the Actions head branch. |
| **Pinned application source commit** | **`62694d6f821481c7857d134a8ddd1ba6e6aded83`** | [Workflow](https://github.com/thanks-cohn/chute/blob/b62c2a989bd9f8b0771e27e7c36750b6e8b02f9c/.github/workflows/build-chutey-phase1-worker-2026-11-16.yml) asserts `HEAD^` matches this SHA and only the workflow file changed; [source commit](https://github.com/thanks-cohn/chute/commit/62694d6f821481c7857d134a8ddd1ba6e6aded83). |
| CI result | **success** | [Actions run 43975395351](https://github.com/thanks-cohn/chute/actions/runs/43975395351), completed November 16, 2026 (UTC). |
| Artifacts | `Chutey-Development1-Windows-TEST-b62c2a989bd9f8b0771e27e7c36750b6e8b02f9c`; artifact ID **14279313964** | Actions run artifact listing. |
| Chrome companion **produced by build** (NOT verified installed/compatible) | `chute-chrome-2.6.1.zip` was generated in the same workflow | Proof of *produced artifact only*, not identity of Chrome extension currently installed, actual usage, or runtime compatibility. Owner may have deleted a local build. |

### Three identities that must not be confused

1. **Source branch:** `codex/2026-11-16-phase1-repairs` — source-development line identified by the archival record.
2. **Actual build/run branch:** `build/chutey-phase1-worker-2026-11-16` — the specific Actions run's `head_branch`.
3. **Immutable source/build identities:** source `62694d6f...`, build `b62c2a98...`. Branch tips may advance; use the commit SHAs as the historical truth.

The CI workflow proves its checked-out build commit's **parent** was the pinned Development 1 source SHA, and the only diff was the new workflow file. This is stronger evidence than merely inferring a branch from file similarity.

## Local installed Windows binary evidence

On November 17, the owner ran `certutil -hashfile` against the actual per-user installation:

`%LOCALAPPDATA%\Programs\Chute\Chute.exe`
- SHA-256: **`a01b86398c20f5cf568f68e1543474da741d31b336fd096eb7741b0423526cc3`**

`%LOCALAPPDATA%\Programs\Chute\Chute-NativeHost.exe`
- SHA-256: **`31e75465410116d36be356f8d97d272b7a792e9c6e54f3c48e65e266a6b46848`**

The [Actions job log](https://github.com/thanks-cohn/chute/actions/runs/43975395351) printed the exact same SHA-256 fingerprints for its `Chute-Windows-Dev1-TEST.exe` and `Chute-NativeHost-Dev1-TEST.exe` respectively. **Both are exact content matches** between recorded installed binaries and the November 16 produced Windows artifacts.

The user also made a read-only local backup:
`%USERPROFILE%\Desktop\Chutey-Installed-Before-Phase1-Nov17\`

Both backup files were rehashed and matched the installed pair byte for byte. This is a **locally verified rollback pair**. The backup itself has **not** been added to GitHub and should not be uploaded casually.

The November 17 `tasklist /FI "IMAGENAME eq Chute.exe"` result reported **no running Chute.exe process** at that moment. Matching binaries do not demonstrate the worker was running or stable.

## Chrome build-time package evidence — NOT an installed or functioning pair

The **same** Actions workflow created and staged `chute-chrome-2.6.1.zip`. Its printed SHA-256 was:

`71ece412e756130303776200177ea2b98820a655cffcdec6674d13253c482c9a`

This establishes only a **Chrome package produced alongside** the two verified Windows executables. **It does not prove that the Chrome extension currently installed/enabled in the owner's browser is this zip.** To establish the installed Chrome side, inspect the active Chrome extension's actual path/ID and compare a reproducible directory manifest or an original retained zip with the build artifact. Do not infer identity from the displayed extension version `2.6.1` alone.

## Owner's speculative post-aesthetic pairing theory (November 17, 2026)

**HYPOTHESIS ONLY; not an observed or hash-verified pairing.**

- The owner thinks the Chrome build used with this worker may have been accidentally deleted. **Which local ZIP/folder, if any, remains is not established**; this is not a claim that the original GitHub Actions artifact was deleted.
- The owner's suggested compatibility order: **(1)** identify any Chrome extension branches/builds that came **after the aesthetic-focused branch**, and test those as possible companions for the fingerprinted Development 1 Windows worker; **(2)** if no suitable later branch/build can be found, test the **aesthetic branch** as the fallback candidate; **(3)** if neither is verifiable, remain **unpaired/unverified**, not automatically working.
- This recommendation is a **creator's theory**, not a historical record of which extension was installed and not a compatibility guarantee.
- A search of current repository branch *names* found no branch containing the literal substring `aesthetic` or `aesthet`. This does **not** prove no aesthetic-focused changes exist: they may be located under an unrelated name or an earlier commit.
- Existing branch names potentially relevant to popup/visual work include `fix/popup-minimal-deterministic-2026-11-10` and `fix/chutey-popup-stable-first-paint-2026-11-16`; **neither is confirmed to be the intended aesthetic branch or to be newer than that intended work** for purposes of compatibility. The Dev1 source branch `codex/2026-11-16-phase1-repairs` also exists. A branch name/date is insufficient to establish ancestry or compatibility.
- No current browser extension ID, contents hash, zip hash, or on-device running-pair confirmation has been supplied for these candidate branches.
- The Actions workflow did produce `chute-chrome-2.6.1.zip` (SHA-256 `71ece412e756130303776200177ea2b98820a655cffcdec6674d13253c482c9a`); that build-time relationship is **direct evidence**. The assumption it was *installed* is **speculation**.

**Acceptance to upgrade status from speculative to verified:** identify the extension folder/ZIP and installed Chrome extension ID, compare its bytes or reproducible manifest with a specific source/artifact, run native bridge/health/wake/reconnect and ordinary browser acceptance tests, and record timestamps. Until then, never call the installed pair "verified," "fully paired," "known working pair," or "stable." The Windows EXE hashes remain independently verified historical observations.

## Short-window working claim — evidence grade

Owner reports reinstalling this Development 1 worker, but **less than one day of reported observation is supported, and observed Chrome pairing is unconfirmed**. Treat as **fingerprint-identified Windows candidate / speculative Chrome pairing**, pending actual liveness and reconnection acceptance evidence.

- **Proven:** exact historical Windows EXE identities and GitHub build run; Chrome *build artifact* produced in same workflow; CI regression/build jobs passed; local backup hash verified. **A produced archive is not proof of a successfully paired installation.**
- **Not proven:** current installed Chrome is that exact package; sustained stability (>1 day, 1 week, or 3 months); resilience through browser sleep/restart, process kill/relaunch, Windows suspend/resume; successful production test after the latest reinstall.
- **Reported symptoms in broader Chutey investigation:** occasional crashes and worker reconnect issues. Do **not** silently upgrade this candidate to GOLD.
- **Not this build:** later Request 3 runs [43995127246](https://github.com/thanks-cohn/chute/actions/runs/43995127246) (source `c5da2b3...`) and [43996443418](https://github.com/thanks-cohn/chute/actions/runs/43996443418) (source `1cca0406...`) were created later and must be separately tested.

## Preserve before new installation

1. Retain the November 16 Github archive and this user's separate November 17 local backup.
2. Fingerprint the next candidate installer/helper/Chrome archive BEFORE installing.
3. Verify active Chrome extension ID and actual source files. A same-version label is inadequate.
4. Do not uninstall/delete old worker files or user data just to prove identity.
5. Conduct isolated tests; then intentional worker replacement only after recovery plan and owner's instruction.
6. Log launch, local HTTP `127.0.0.1:17891`, native messaging wake, reconnection, clean browser restart, Windows sleep/resume and sustained health.
7. For longer-term status, maintain timestamps and actual uptime/restart/recovery evidence; **do not count CI success as a day of field operation**.

## Historical distinction

The older `archive/chutey-11.16-worker` binary pair has DIFFERENT SHA-256 hashes and is not this installed Development 1 pair. Older `v2.6.1` GOLD behavioral reference tags remain independent of this candidate. See [GOLD_STANDARD_WORKER.md](GOLD_STANDARD_WORKER.md).

**Overall status:** The Windows executables' historical build/source provenance is verified by SHA-256; Chrome installation, pairing, compatibility with aesthetic or post-aesthetic branches, runtime operation, and endurance are all unverified. The owner's fallback compatibility proposal remains **speculative**.
