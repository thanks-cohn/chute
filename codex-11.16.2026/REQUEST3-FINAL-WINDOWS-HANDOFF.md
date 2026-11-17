# Request 3 — final Development 1 candidate and Windows package

**Owner acceptance pending. Development 2 is not authorized.**

Runtime source: **1cca0406c9a81c658feabc0d7aa57aad4028247f** on
`codex/2026-11-16-phase1-repairs`. Later handoff-only documentation commits do not
change the worker/extension source in this matching package.

- [Successful Windows run 43996443418](https://github.com/thanks-cohn/chute/actions/runs/43996443418)
- [Download matching Windows/helper/extension artifact](https://github.com/thanks-cohn/chute/actions/runs/43996443418/artifacts/14290646466)
- Artifact: `Chutey-Dev1-Request3-TEST-1cca0406c9a81c658feabc0d7aa57aad4028247f-43996443418-1`
- [Installation and complete owner test checklist](REQUEST3-WINDOWS-OWNER-TEST.md)
- [Root causes, per-stage evidence and failed-gate corrections](REQUEST3-REPAIR-EVIDENCE.md)

Extract in a disposable Windows VM/Sandbox. **Chutey-Setup-Development1-Request3-TEST.exe
is the self-installing setup**, only for that isolated VM. The separate
Chutey-Phase1-Isolated-Check.exe is a temporary self-test, not an installer.
START-HERE.md in the artifact explains both. Use the extension and helper from
this same package; preserve production worker/profile/data and all recovery refs.
No production installation or promotion was performed.

## Verified hashes

| File | SHA-256 |
|---|---|
| Chutey-Setup-Development1-Request3-TEST.exe | `79b44cfd9fefe05205697058d98faf855d9c0996cf770f2e3afe0bc08b10a12d` |
| Chute-NativeHost.exe | `562b5d32158b937ffbc1960f2bd2cd2112675ddf76977db3836372570ff8f89e` |
| Chutey-Phase1-Isolated-Check.exe | `231ba4c3f20fad6d3ea6d052fd612fa2af8ae69eb3689eb4286398bbb9c29e99` |
| Chutey-Extension-Development1-Request3-TEST.zip | `b4745483a4f036540efbddbecc91a293d1534ce895d7ed83ca62f3de6ee26d1b` |

All **30** files were downloaded and independently checked against the included
SHA256SUMS.txt. Three executable PE headers confirm x64. Extension ZIP integrity,
new modules/Downloads permission and matching SOURCE-COMMIT were also checked.
Build dependency and OS records are in the package. Exact PyInstaller binary
identity is specific to this build; reproduce using pinned build procedures and
record fresh hashes rather than assuming identical timestamps/toolchain output.

## Completed in the required order

1. **3A:** one document scrollbar in the small popup, stacked normal-flow Settings,
   square tiles throughout all 120-item/density checks, direct image expansion
   without X/Expand, scoped Trash It!, and unbroken Shelf History state labels.
2. **3C:** Shelf-only History export, exactly one verified ZIP64 archive containing
   CSV + JSON + manifest, local/DST-correct scopes, bounded memory, read-only source,
   safe CSV, cancel/errors, native download completion and retained job identity.
3. **3D:** daily UTF-8 highlights, worker received-at timestamp first in every entry,
   exactly two empty lines between entries, durable per-capture identities/recovery,
   paged literal popup text reader, archived GO TO, and Shelf-only decoration opt-in
   defaulting/migrating OFF. Original YUMMY art/sequence preserved.
4. **3B last:** native asynchronous verified copy jobs, bounded actual File intake,
   disk checks and retained receipts, concurrent browsing/streaming, and direct
   authorized-directory MP4/WebM/MP3 playback in both viewers. Same engine and
   authentication; no competing media server. Fresh enrolled Store-only sessions
   permit export/highlights/saved-file actions before external-folder approval.

## Final executed evidence

- **Linux:** 130 passed, 12 skipped, 37 subtests. Targeted JS, packaging, popup,
  export, highlights, overlays, trusted drag/drop/YUMMY and real-media checks passed.
- **Windows CI:** **128 passed, 14 skipped, 27 subtests**, no failures/errors.
  The 14 skips are POSIX-only cases with an old decorator message; separate Windows
  native filesystem/consent tests ran. They are not counted as passes.
- **Real Chrome on Windows:** 156.0.8078.80, **12/12 media viewer cases**: small and
  large MP4/WebM/MP3 in Shelf and popup. Playback, pause, seek, close and release.
  Large MP3 seek to 850 seconds. Damaged MP4 produces an available-source decoder
  error, distinct from expiry/revocation/disconnection diagnostics.
- Six real destination copies and a 36,003,047-byte browser File import matched
  SHA-256. Windows large samples: MP4 **45,679,203**, WebM **67,075,612**, MP3
  **36,003,047** bytes. Actual encoded frames/audio, not sparse decoder stand-ins.
- Thirteen concurrent samples exercised an active verified movie copy, playback,
  206 ranges, directory listing and health. Maximum sampled concurrent listing
  latency **47 ms**; other directory command maximum **16 ms**. Large copy observed
  completion: MP4 **0.875 s**, WebM **1.297 s**, MP3 **0.468 s**, including client
  polling. These are fixture measurements, not sustained hardware guarantees.
- Windows traced Python peak **5,201,279 bytes**, not total worker/Chrome RSS.
  Runner had roughly **16 GiB RAM**, unlike the owner's 4-GB machine. Exact hashes,
  sizes, times, resource snapshot and screenshots are in package media-evidence and
  [Windows JSON evidence](evidence/request3-windows/media-results.json).
- Packaged EXE passed guarded thumbnail, HEAD/range/release, single ZIP/timezone,
  daily text, bounded page, asynchronous copy and first-use Store-only checks.
  Packaged helper passed native framed protocol and independent byte-hash matching.

The browser media tests use genuine Chrome and Windows filesystem guards through
an HTTP fixture with **simulated native enrollment**. They do not establish an
installed extension, physical USB, production Chrome profile or real Shell flow on
the owner's machine. Original YUMMY was interactively tested in Linux Chromium;
owner-installed Windows behavior remains in the checklist.

## Remaining limits and owner checks

- Owner must test actual installation/native enrollment, popup/menus/OS gestures,
  USB/profile paths, YUMMY, disk/RAM/commit behavior and prolonged operation on the
  real 4-GB Windows hardware. No owner acceptance or production promotion claimed.
- Media ticket max ten minutes, session max fifteen. Full-length automatic lease
  renewal, Movie Mode/adapters/transcoding and 4K soak are later gated work.
- Website File/DataTransfer fallback stays at 32 MiB. Larger website files require
  that website's native picker. Use Chutey native Copy/Paste for approved local
  destinations. Opaque local-reference mascot drops are rejected with a supported
  Copy selected to Chutey alternative. Universal OS/website drag is not claimed.
- Upload default 8 GiB remains bounded by real free disk. Native copies serialize
  per session; mass-batch/pause/resume is not added. Crash publication may need
  destination review and owned-stage cleanup; no blind replay or source deletion.
- Actual >4-GiB History ZIP and FAT32/full-destination behavior need sufficient
  isolated test disk. ZIP64 structures, bounded processing, cancellation, snapshot
  growth and no-space failures are tested; splitting/truncation is never a fallback.
- Current Windows artifact retention is 90 days; save this candidate if needed.
  Historical releases/tags/archive and the protected original EXE remain untouched.

No Development 2 branch, mascot redesign, portable/sticky Explorer or other
repository work was started.

DEVELOPMENT 1 CANDIDATE READY FOR OWNER WINDOWS TESTING — STOPPED. DEVELOPMENT 2 NOT AUTHORIZED.
