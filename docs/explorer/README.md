# Explorer v1 read-only checkpoint — historical foundation

**Current Windows milestone:** see [WINDOWS_P0.md](WINDOWS_P0.md) for native consent, Windows guards and paired test builds. The remainder records the earlier POSIX checkpoint.

Based on current main `6b53747184b1d32e9c2d4933c7e7dd3d1d473ff1`. The implementation follows the hard stop in `In_Progress/CODEX_DRAG_DROP_LOCAL_EXPLORER_IMPLEMENTATION.md`: unproven native consent/write safety must not become a writable endpoint. The known-working release and existing History/native/drag routes remain intact. **This branch is a review checkpoint, not a claim that the requested full drag-and-drop product is finished.**

## Architecture and usage

```
Shelf explorer-api.js → existing ChuteServer → ExplorerAPI → Explorer.execute
Scenario lab / Python script ─────────────────────────────→ Explorer.execute
RootGrant → descriptor-relative no-follow POSIX access
```

`protocol.py` owns the capability catalog/error vocabulary; `security.py` owns process-local root grants, opaque handles and exact-origin expiring sessions; `core.py` owns list/stat/search/preview semantics; `preview.py` owns bounded decoding/range parsing; `api.py` is the authenticated loopback adapter. No extra daemon, service worker, native host, History database or provider engine is introduced. File thumbnails use optional Pillow; text safely renders with `textContent`; active HTML/SVG cannot be previewed. Video uses native controls on bounded Blobs (64 MiB GUI ceiling), with authenticated HTTP byte ranges independently tested. Large seekable native streaming is unfinished. PDF has a sandboxed browser frame but rendering is browser-dependent and unverified.

Headless example (POSIX, explicit disposable owner-selected root):

```python
from pathlib import Path
from chute.explorer import Explorer, RootGrant
engine = Explorer([RootGrant(Path('/tmp/owner-created-fixture'))])
try:
    roots = engine.execute('roots')['result']['roots']
    print(engine.execute('list', handle=roots[0]['handle'], limit=100))
finally:
    engine.close()
```

To use the experimental read-only Shelf on POSIX, explicitly start the **existing** companion with an owner-selected folder and the exact origin of your installed Chutey extension:

```
PYTHONPATH=src python -m chute serve --explorer-root /tmp/owner-created-fixture --explorer-origin chrome-extension://YOUR_32_LETTER_EXTENSION_ID
```

Replace the origin with the real ID from your own Chutey installation. The local console displays a fresh 15-minute read-session token. Paste it into the Shelf's Local read session field; it stays in memory, is not persisted in Chrome storage, and expires on the server. This is manual owner approval, **not** a verified native enrollment protocol; never hand it to another extension/page. Restart/reconnect for a new session. Do not run a second companion if the existing port is occupied. The Windows executable/native GUI has no Explorer consent/startup integration yet; it deliberately cannot grant a Windows root through this API.

The GUI provides lazy/paginated folder navigation, back/forward/parent/root, folder-local search, sorting, list/grid, selection, Enter/Space/arrows/Home/End, scoped custom Preview/Open-folder/Properties/Refresh menu and bottom preview. The tree/list/selection/scroll remain mounted across tabs; grid preference is separate from the unchanged active-tab key. Handles/selection/expanded paths are not restored after closing the Shelf. Unsupported writes/OS actions are visibly gated; incoming drops are rejected without writing or creating shortcuts. No new external-drag token is emitted.

## Source audit

| Existing source | Actual behavior / reuse | Evidence boundary |
| --- | --- | --- |
| `manifest.json`, `background-entry.js` | One MV3 import chain; existing nativeMessaging/sidePanel permissions unchanged | Node cold-boot/reconnect regression passed; no second worker |
| `background-native.js`, `native-wake-page.js`, `bridge-reconnect.js` | Existing health check, native wake/reconnect and failure UX preserved | Local boot fixtures passed; installed Windows sleep/resume remains unverified |
| `server.py`, `store.py` | Store retains History/Recall/thumbnails/upload authority; old `allowed_origin` is broad and unsuitable for Explorer privileges | Full Python suite passed; new namespace defaults disabled and never inherits broad CORS/auth |
| `windows_app.py`, `native_host.py`, `browser_extensions.py`, `reveal.py` | Existing Windows install/origin discovery/native registration and safe Store-ID reveal remain authoritative | Existing discovery/native/reveal tests passed; OS launch tests use controlled substitutes |
| `shelf.html/js`, `workspace-tabs.js/css`, `workflow-fixes.js`, `shared.css` | Existing History DOM, tab preference/leftmost active tab, original-image rebuild, cards and gutters retained | Node regressions and real Chromium fixture History rendering passed |
| `content.js`, `drag-relay.js`, `bin.js` | Saved History ID token → localhost bytes → real File → file input or synthetic DragEvent; intake prefers actual bytes | Source audit only for live cross-window delivery. Synthetic events are untrusted and do not prove a site accepted upload |
| `direct-drop-google-yandex.js`, `content-image-resolver.js`, `bin-image-resolver.js`, `drop-lifecycle.js` | Site-specific capture, image candidate fallback, drag cleanup retained | No real Google/ChatGPT/Yandex drag acceptance tested |
| `bin.js` URL fallback | Existing basket can save InternetShortcut when URL image fetch fails | Not reused for Explorer intake; no `.url` is called an image |
| REDOWN `docs/beta/EXPLORER.md`, `extension/beta/explorer.mjs`, destination menus/report | Single dispatcher, lazy target trees, clear clipboard intent and uncertainty inspired boundaries | Inspected reference HEAD `8665e8b`; no provider/auth code copied |
| REDOWN lab/README, universal corpus pipeline | Owner plans, independent hashes, journals, bounded seeds and honest classifications informed lab | Chutey lab calls real `Explorer`; REDOWN live providers were not exercised |

## Security boundary and remaining gates

The HTTP API is opt-in, IPv4 loopback-only in `serve`, requires exact Host, owner-approved exact extension Origin, a 256-bit session bearer with at most 15-minute lifetime, bounded JSON, four concurrent requests, and opaque root-derived handles. No browser command accepts an absolute path. Descriptor-relative `O_NOFOLLOW` traversal rejects symlinks, special files and swapped-link ancestors. Directory listing is limited to 20,000 entries/200 per page; thumbnails to 16 MiB/24 MP/256px; GUI previews to 64 MiB, text to 256 KiB. Session tokens never appear in URLs or persisted GUI state. Receipts omit absolute paths. Capability discovery truthfully declares read-only operations.

These POSIX guards cannot simply be assumed to work on Windows. Before enabling writes or Windows roots: implement/review native directory picker and enrolled extension identity proof, native Windows directory/file handles with reparse-point protection, immutable operation identity, staged bounded streams, flush/readback hashes, conflict policy, atomic publication and durable recovery/reconciliation. Add real Windows tests for junction swaps, locked files, full disk and interrupted transfers. Then implement writes in this same engine and enable menu/keyboard/drag commands through it. Current blocked operations never mutate and cannot have uncertain-write replay.

REDOWN interop interface is designed in [INTEROP.md](INTEROP.md) and typed/validated in `interop.py`; the transport remains disabled. Implement/verify both adapters with explicit identities/consent, streaming and independent destination hashes before real handoff. No cloud credentials were requested or accessed. R2, Drive, Dropbox and OneDrive remain BLOCKED. Google, ChatGPT and Yandex local drag acceptance remains BLOCKED. There is no fake success fallback.

## Verified results and reproduction

Run from the checkout with Python 3.12, Pillow 13.0, pytest 9.2 and Playwright 1.62. HTTP/browser tests require permission to bind loopback sockets; the default sandbox forbids sockets, so those checks used the approved execution path. No TLS/signature verification was disabled. Filesystem tests use disposable fixtures, never owner History.

| Check | Verified result |
| --- | --- |
| `PYTHONPATH=src CHUTE_QUIET=1 .venv/bin/python -m pytest -q` | 58 passed; 34 subtests passed. One external anyio pytest deprecation warning |
| `PYTHONPATH=src python -m unittest discover -s tests -v` | 45 tests passed before adding the two interop contract tests; pytest includes all final tests |
| Lab `run --plan tools/explorer_lab/sample-plan.json --out /tmp/chutey-lab-evidence` | 9 PASS, 8 BLOCKED, 0 FAIL; 40 seeded navigation transitions; before/after SHA-256 tree diff empty |
| All extension JS `node --check` | Passed |
| `verify-worker-boot.cjs` | Cold MV3 import, native reconnect/menu/Shelf fixtures passed |
| `verify-thumbnail-icons.cjs` | Four lazy thumbnail/type-icon scenarios passed |
| `verify-chutey-tabs-and-mascot.cjs` | Tab restoration/reordering, mascot, card/gutter invariants passed |
| `verify-upgrades-package.py` | Existing companion/package invariants passed |
| `build-chrome-store.py` | ZIP built; legacy builder names it `dist/chrome-store/chute-chrome-2.6.zip` despite 2.6.1 manifest (pre-existing naming defect) |
| `CHUTE_QUIET=1 python scripts/verify-explorer-browser.py /tmp/chutey-explorer-browser --fixture` | Real Chromium 155: 390px list and 900px five-column grid; viewport exactly unchanged on preview; overlap, independent document scroll, menu keyboard, original-image decode and History/tab scroll retention passed |
| `verify-real-image-browser.py` legacy CLI runner | Timed out after 75 seconds with system launcher and direct binary. Final Playwright fixture separately confirms real History PNG decoding/thumbnail display; this does not turn the legacy timeout into a pass |
| Installed-extension browser mode | BLOCKED: system Chromium did not load the unpacked extension; official Playwright browser download denied by current network policy |
| Windows EXE / paired CI / real native startup | Not executed locally; branch triggers existing Windows test-build workflow and a new cross-platform API workflow. Await actual CI results |

Visual inspection also caught collapsed grid labels; fixed-height compact grid rows and a label-height assertion now preserve filename visibility. The geometry test reproduced a real scroll-loss defect across hidden flex tabs; Explorer now captures/restores its scroll without changing tab ownership. The fixture test uses real production Shelf files/core/HTTP adapter, but test-only Origin forwarding and Chrome storage stubs. It is **not installed-extension enrollment or cross-extension drag proof**. No executable or ZIP is committed and no release/version/tag is changed.

Screenshots are synthetic disposable fixture files rendered by real Chromium, not real user folders: [390px](evidence/explorer-390.png), [900px](evidence/explorer-900.png). Machine-readable browser metrics, lab before/after hash inventories, journal, plan, results/summary and empty diff are in `evidence/`. Full run artifacts remain in the temporary output directories and can be regenerated with the same seed.
