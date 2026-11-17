# Chutey — Installed Development 1 Windows Pair: Fingerprint and Branch Provenance

**Record date:** November 17, 2026  
**Classification:** **IDENTIFIED INSTALLED WINDOWS BINARIES / MATCHING CHROME BUILD ARTIFACT**  
**Owner's observation window:** **less than one day** (user-reported; no independent endurance telemetry).  
**Do not call this GOLD, long-term stable, three-month proven, or the newer Request 3 build.**

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
| Chrome companion package | `chute-chrome-2.6.1.zip` built in same workflow | Workflow stages package together with Windows binaries. |

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

## Matching Chrome extension evidence and limitation

The **same** Actions workflow created and staged `chute-chrome-2.6.1.zip`. Its printed SHA-256 was:

`71ece412e756130303776200177ea2b98820a655cffcdec6674d13253c482c9a`

This establishes a **matching produced Chrome package** for the two verified Windows executables. **It does not prove that the Chrome extension currently installed/enabled in the owner's browser is this zip.** To establish the installed Chrome side, inspect the active Chrome extension's actual path/ID and compare a reproducible directory manifest or an original retained zip with the build artifact. Do not infer identity from the displayed extension version `2.6.1` alone.

## Short-window working claim — evidence grade

Owner reports having reinstalled and observed this Development 1 worker, but **less than one day of operation is supported**. Treat as **short-observation / provisional working candidate** pending actual liveness and reconnection acceptance evidence.

- **Proven:** exact Windows EXE identities and GitHub build run; paired Chrome *build output* produced from same workflow; CI regression/build jobs passed; local backup hash verified.
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

**Overall status:** Source/build provenance and Windows executable pairing verified. Chrome installed identity and operational endurance remain unverified.
