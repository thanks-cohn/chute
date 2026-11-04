# P0 Windows Explorer review pair

Development branch: `codex/chutey-explorer-windows-usable-asap-2026-11-04`. No release/tag is replaced, and nothing is merged or deployed.

## Install and debug milestone A

Download the single **Chutey-Windows-Chrome-Explorer-TEST-<source SHA>** artifact from this branch's **Chutey P0 paired Windows Explorer TEST build** Actions run. It contains the matching `Chute-Windows-Explorer-TEST.exe`, `chute-chrome-2.6.1.zip`, source SHA, SHA256SUMS and these instructions. Compare checksums before installing. A missing/failed Actions artifact is a BLOCKED build, not a working pair.

1. Preserve the known-working installer/extension pairing (release `chute-v2.6.1-main-upgrades-2026-11-03-working`, source `8fc7a3f`). Do not remove your existing Chute History. The separately pinned checkpoint tag remains unchanged.
2. Run the test Windows EXE once; it uses the existing per-user installer/native-host registration and companion port 17891. No second service/worker is installed.
3. Unzip the paired Chrome ZIP into a dedicated directory and load that directory unpacked via Chrome's Extensions developer mode. Avoid running two Chutey extensions simultaneously. The existing companion learns this Chutey installation's ID from Chrome profile state; if first use says unenrolled, wait for registration refresh, then retry.
4. Open the Chutey Shelf, select File Explorer, click **Select folder**, and approve a small disposable directory in the native dialog. The dialog explicitly grants read-only browsing. No manual token is required on Windows. Empty/cancel/error are distinct from a successful folder list.
5. Browse nested folders, go back/parent, select an image/text file, and verify the bottom preview overlays the list. Try History and return. Close/reopen Shelf and click **Reconnect folder** if automatic reconnect is unavailable. Companion restart intentionally requires folder selection again; grants are not persisted globally.
6. If native actions are unavailable, install the matched companion rather than weakening authentication. Do not paste paths into an arbitrary webpage. Reparse/junction/network/device/system roots are deliberately unavailable. A busy/locked Windows directory may fail safely rather than following a substituted path.

Rollback: disable/remove the unpacked test extension and reinstall the known-working paired Windows EXE + extension. Keep the existing History data directory. Never move the checkpoint/release tags to achieve rollback.

## Source and security changes

Same `Explorer.execute`, `ChuteServer`, native host, worker, and Shelf; no copied engine. `windows_fs.py` wraps CreateFileW + OPEN_REPARSE_POINT + real handle metadata/final-path validation. Ancestor directories remain open with write/delete sharing denied throughout path use; final file reads also deny concurrent writes/deletes. Root identity is checked on every operation. Windows directory enumeration lives behind the same grant interface as POSIX enumeration. File reads use bounded descriptors; image/text/media preview limits remain explicit.

Native messaging uses Chrome's actual caller-origin command-line argument, not a message-provided origin/path. The existing enrolled-ID list is checked by native host and companion. A native-only control token is rotated on companion startup and stored in an owner+SYSTEM-only DACL file under LocalAppData; it never enters Chrome or a URL. The authenticated native control request alone can open the OS picker. The chosen root never comes from browser JSON. Browser read sessions are origin-bound, expiring and in-memory; new consent/reconnect replaces the old session. No filesystem write capability is enabled by this milestone.

The Chrome CSP remains unchanged: string `wait_for_function` polling was replaced with locator/property assertions. The packaging filename bug (`2.6.zip` instead of `2.6.1.zip`) is fixed so the pair has an unambiguous matching filename. Windows packaging now includes Pillow for actual thumbnails and Tk for the folder dialog via PyInstaller's normal hooks.

## Evidence classes and next milestones

- **A / PYTHON_LOGICAL:** production dispatch, native caller rejection, cancelled selection, root-scoped reconnect, Linux regressions and Chromium geometry are run locally on tiny fixtures. Exact final counts are in the accompanying task report.
- **A / WINDOWS_REAL_FS:** five tiny tests cover real Windows handles, nested enumeration/bytes, junction denial, root replacement, owner-only control-file creation and image decode. These execute only on Windows CI; Linux reports explicit skips. Native picker UI itself requires owner acceptance.
- **A / INSTALLED_CHROME:** automated installed-extension test is configured in CI with unchanged CSP. Real owner-installed Windows selection, reopening and previews remain NOT_TESTED until owner/CI evidence exists. No Linux pass is substituted for Windows proof.
- **B:** filesystem mutations and whole-directory Copy/Cut/Paste remain gated. Real Windows clipboard is NOT_TESTED. Do not interpret the browser API as granting writes.
- **C:** byte-range reads and bounded preview decoders are implemented; no durable write queue/recovery is advertised. Queue admission and restart-safe mutation jobs remain BLOCKED pending B safety implementation.
- **D:** existing registry/oracle/lab remains extensible; the small native/Windows tests are the first Windows golden cases. No attempt to pad 500 scenarios. No big transfers, stress tests or provider uploads were run. Total fixture payloads remain well below 32 MiB/job.
- **E:** external website/REDOWN/provider handoffs remain deferred; no credentials or cloud uploads.

This pair is a **milestone A candidate**, not a certificate of installed Windows acceptance and not completion of B–E. Report exact native/preview errors when debugging; do not share control/session secrets or private file contents.

## This cloud instance's result

Linux Python: **61 PASS, 5 Windows skips, 34 subtests PASS**. Worker boot, thumbnail/card/tab/mascot, package invariants and JS syntax PASS. Chromium 155 fixture: Select folder control with simulated native reply, real production browse/thumbnail/overlay/History and menu keys PASS at 390/900px. No `unsafe-eval` or string `wait_for_function` remains. `p0-evidence/` contains screenshots, geometry metrics and the local Chrome ZIP hash.

A real Windows executable cannot be built/run on this Linux instance (no Windows toolchain/runtime). The added Windows Actions workflow is the supported build path; its exact artifact is only available after the Windows tests and build succeed. GitHub Actions API access returns a proxy `Forbidden`; the allowed GitHub web page separately confirms the Windows test and regression steps passed for `768309f`. Full step logs/artifact retrieval still require access. The paired build and new installed-EXE startup gate are tracked on the branch Actions page. Do not describe this local result as WINDOWS_REAL_FS or installed-Windows PASS. The native OS picker, ACL and HANDLE checks are real code with real-Windows tests ready for CI, real Windows CI source tests passed; native dialog interaction and final compiled-startup results remain separately tracked.

## Verified downloadable pair (milestone A candidate)

**[Download matched Windows + Chrome artifact](https://github.com/thanks-cohn/chute/actions/runs/41795692460/artifacts/13304873647)** (GitHub sign-in may be required).

- Source: `a6214d494e4db89f765717b85ac03f69391b454a`.
- [Windows pair run](https://github.com/thanks-cohn/chute/actions/runs/41795692460): **Success**. Tiny real-Windows filesystem/native source tests, existing regressions, EXE + ZIP build, compiled installer startup in an isolated CI home, checksum staging and artifact upload all succeeded.
- [API + browser run](https://github.com/thanks-cohn/chute/actions/runs/41795692239): **Success** on Linux/Windows and installed Chromium with simulated native-selection reply, unchanged CSP and real production API/overlay geometry.
- Artifact: `Chutey-Windows-Chrome-Explorer-TEST-a6214d494e4db89f765717b85ac03f69391b454a`, 35.3 MB. GitHub artifact digest: `sha256:718dc58c14cda3d1a1daffeb8050f742d3defdc8691c2dded608a61e8ebcb8c9`. Internal SHA256SUMS binds individual files; SOURCE-COMMIT identifies the matching build.
- Evidence was retrieved from allowed GitHub web pages; API/log downloads remain blocked. Step success is confirmed, but no exact Windows test count is invented.
- Earlier build attempts exposed checksum self-inclusion and a smoke harness waiting for the long-lived companion process tree. Both harness defects were corrected before this successful pair. Earlier failed/in-progress runs are not release candidates.

This is the first usable Windows browse candidate for owner debugging, **not** completion of the full Explorer roadmap. Install using the steps above and select a disposable folder. Actual Windows native dialog usability and owner-installed paired-extension operation remain NOT_TESTED by an interactive user. B directory operations, OS clipboard and C durable write queue remain gated for the next milestone; no unsafe writes were enabled to make A appear complete. D has small production-engine tests and extensible scenario contracts, not a fabricated 500-case claim. No source/release merge or deployment occurred.
