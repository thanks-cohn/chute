# CHUTE GOLD STANDARD — Windows Worker Reliability Baseline

**Status:** Historical reference / regression benchmark, NOT a certification of the current Chutey worker.  
**Recorded:** 2026-11-10  
**Policy:** Never move or overwrite historical tags. Never claim a months-long endurance test without time-stamped machine evidence.

## Why this exists

The owner reports severe Chutey regressions: intermittent Windows worker disconnections and failed automatic reconnects, plus inconsistent shelf tile expansion. The previous Chute implementation was reported by the owner to operate reliably for an extended period. Preserve exact historical implementations as references rather than replacing the current code blindly.

## Two distinct historical references — DO NOT CONFUSE

### A. Older public Windows companion: v2.6.1 RC1

- **Tag:** `chute-windows-v2.6.1-rc1`
- **Release:** https://github.com/thanks-cohn/chute/releases/tag/chute-windows-v2.6.1-rc1
- **Installation/behavior evidence:** The repository README describes a tested recovery path: deliberately kill `Chute.exe`, have the Chrome extension ask the native helper to wake/relaunch it, and reconnect to `127.0.0.1:17891`.
- **Architecture:** Chrome MV3 background → Windows Native Messaging host → Chute companion executable → local HTTP bridge.
- **Evidence boundary:** The README describes successful fault injection/recovery. It is *not*, by itself, timestamped telemetry proving continuous uptime for three months on the owner's machine.

### B. Later user-confirmed matched Windows/Chrome pair (November 3, 2026)

- **Tag:** `chute-v2.6.1-main-upgrades-2026-11-03-working`
- **Exact source commit:** `8fc7a3f698632ffa42f2f14db59fa5be7d271e86`
- **Workflow:** `.github/workflows/tag-working-pair.yml` on branch `chute-main-2.6.1-upgrades-2026-11-03`
- **Recorded run IDs:** Windows EXE `41770688623`; Chrome extension `41770688602`; Windows/Linux/worker boot tests `41770688697`.
- **Verification designed into workflow:** Require successful outcomes and exact matching `head_sha` for all three runs before tagging, then check tag resolution.
- **Important:** The tag and workflow exist; run outcomes and installed-binary identity should be independently checked before claiming stronger proof. The workflow explicitly warns that this is **not the older public v2.6.1 RC1**.

## What was proved vs. what remains unproved

| Assertion | Evidence status |
|---|---|
| v2.6.1 RC1 has a documented kill/restart/reconnect test | Documented in README |
| The November 3 working pair has an exact source SHA and recorded build/test run IDs | Verified in GitHub |
| Both named historical tags are resolvable | Verified in GitHub |
| The exact binary running on the owner's Windows machine for months matches either reference | **Not independently established** |
| Current Chutey worker is inferior due to insufficient computational power | **Hypothesis, not established** |
| Current Chutey worker has lifecycle/recovery regression | Reported symptoms; needs instrumented reproduction |

## Required GOLD regression gates for any replacement worker

1. **Worker lifecycle:** On clean boot, Chrome restart, popup close/open, browser MV3 service-worker suspension, helper kill, `Chute.exe` kill, network transitions, Windows sleep/resume, and user sign-out/sign-in, preserve correct lifecycle state and recover if permitted.
2. **Liveness distinctions:** Separate *Chrome background asleep*, *native messaging unavailable*, *Windows companion process absent*, *HTTP port unavailable*, *health endpoint unresponsive*, *API failure*, and *authorization/policy block*. Never collapse everything into generic “Chute is asleep.”
3. **Reconnection:** One accountable owner for reconnection state, bounded retries/backoff, idempotent process launch, no overlapping storms, observable attempts/errors, and a manual Reconnect control that reports a precise result.
4. **State preservation:** No silent loss of basket items, history, metadata, ongoing recoverable operations, or drag/drop ability because the popup closed or bridge briefly disconnected.
5. **Shelf determinism:** For identical tile/click/input state, expansion is the same every time; prevent nested click propagation, competing animations, double toggles, stale height calculations, and conflicting collapse/expand handlers.
6. **Parity and evidence:** Programmatic API/diagnostics for all UI recovery controls and worker states; automated fault-injection plus interactive Windows tests and logs before any claim of parity.
7. **Endurance:** Capture exact installer SHA-256, extension version/ID, Windows build, process restarts, timestamps, reconnect attempt durations, and multi-day/long-running observations. Do not substitute CI success for real-world longevity.
8. **No destructive replacement:** Back up local Chute data and preserve the reference installers. Compare historical and current source before choosing a transplant or architecture change.

## Immediate investigation order

1. Verify the owner's historical Windows installed EXE/version/hash against retained artifacts, if accessible.
2. Review historical tags and Native Messaging installer/launcher, service-worker wakeup, host registration, health polling, and bridge start.
3. Compare current worker lifecycle and protocol semantics to both tags with a line-by-line regression matrix.
4. Reproduce “Chute is asleep. Automatic reconnect failed” with timestamped diagnostic traces; locate the first failing boundary.
5. Independently reproduce inconsistent Shelf tile expansion with click-event and layout-state traces.
6. Restore behaviors and prove them with fault injection, usability checks, and endurance testing. Do not automatically downgrade or replace the worker.

**Release principle:** The historical Chute worker is the GOLD *behavioral benchmark*. “GOLD” is a target for recovery behavior and robustness, not a claim that every feature in an old build is perfect or that three-month uptime has already been independently verified.
