# Chutey Experimental Roadmap — Your Everything

**Recorded:** 2026-11-17  
**Repository:** `thanks-cohn/chute`  
**Category:** Experimental / future proposals, **not implemented**  
**Owner direction:** Make Chutey an optional, visually inviting home for collecting, exploring, organizing, and exporting personal files, while keeping Windows and Chrome usable without it.

## 1. Scientist Chutey — goofy experimental skin

Create an optional whimsical **Scientist Chutey** mascot appearance using the planned Skin/Mascot API. Art direction: mischievous little research scientist; playful, expressive, unmistakably Chutey. Possible elements: oversized goggles, tiny lab coat, ridiculous laboratory props, experimental animations and reactions. These are creative suggestions, **not final art approval**.

- Cosmetic skin only; no additional filesystem, screenshot, native-worker or cloud permissions from installing it.
- Preserve recognizability, foreground/background separation, animation preferences, and accessibility/reduced-motion.
- Reuse declarative, validated skin tokens/assets; **no arbitrary scripts in skins**.
- Allow disable and return to original mascot immediately; no duplicate mascots or notifications when REDOWN and Click2Cloud are also installed.
- Future mascot reactions may show **verified** screenshot/save results from family apps, only with user opt-in.

**Acceptance:** Skin can be enabled/disabled without changing any file, History, save receipt, worker behavior, or Chrome permission.

## 2. Chutey Home — GraphMarks-style optional Chrome New Tab replacement

The owner clarified the inspiration is a **browser New Tab takeover** similar in concept to GraphMarks, **not automatically replacing the Windows desktop or `explorer.exe`**. Chutey could be the first thing users see when opening a new Chrome tab, with a beautiful visual workspace:

- File Explorer / My Files, Chutey History, image gallery, screenshots, downloads, recent items, collections, graph mode, and connected cloud destinations.
- Distinct visual organization modes: traditional list/tree, gallery, timeline, tag board, graph, search.
- Chutey character as an optional visual guide; restrained visual polish and fast boot even on low-RAM machines.
- Use Chrome's supported `chrome_url_overrides.newtab` mechanism in a **dedicated opt-in distribution/manifest choice**. It is **not a simple runtime setting toggle in an already-loaded manifest**; design the enrollment/reversal realistically. Chrome may present its own override confirmation and competing extensions can conflict.
- First-run explanation and an easy way to return to the normal New Tab page / disable override. Never silently replace an existing New Tab setup. No forced feature.
- The page is a **UI/client**. Access to real Windows files remains through an explicitly authorized, narrowly scoped native Chutey API. Never claim `newtab` gives unrestricted filesystem privileges.

**Acceptance:** Chutey Home opens by user choice, works with native companion connected/disconnected, and restores ordinary browser New Tab behavior after it is turned off/uninstalled; existing browsing, tabs and data are unchanged.

### Possible distant future: optional Chutey desktop workspace

A separate native always-on desktop-style **Chutey workspace** may launch at sign-in as an ordinary app, showing a visually elegant Explorer and persistent controls. Do **not** confuse this with replacing the Windows shell. A genuine shell replacement is a far more invasive, platform-dependent experiment and **not authorized for current development**. Always leave a safe return to Windows and recovery route.

## 3. Tags and flexible organization — non-destructive by design

The owner wants a **multitude of ways to tag and organize their own files**, not just a folder hierarchy.

- Multiple tags per file, hierarchical tags, aliases/synonyms, colors/visual labels, favorites, saved searches, collections, dates and optional custom fields.
- The same file can be found in several collections without copying its bytes; Chutey must not move/delete/rename original files merely to change organization.
- An optional **graph mode** for relationships among files, concepts, tags and collections (e.g. `inspired-by`, `version-of`, `references`, `belongs-to`).
- Graph can switch to list/tree/gallery/timeline views on the **same metadata index**; relationships shouldn't be tied to one graphical renderer.
- Stable IDs for entries; handle moves, renames, disconnected volumes, missing external files, network/cloud objects, and duplicate names carefully. Disclose any uncertainty; no false matches.
- Use a local indexed metadata store with safe transactions and migrations, bounded memory, paginated query APIs and permissioned roots. No automatic indexing of all private files or entire drives without explicit user selection.
- User-defined tag namespace and display preferences remain private by default; separate metadata from original bytes.

**Acceptance:** User tags an existing file, explores it through list and graph, moves/renames the file, relinks with verified identity, and removes the tag without altering original bytes.

## 4. Portable export/import — first-class, not vendor lock-in

**Critical principle: users own their file organization.** Export should always be accessible, not buried or contingent on a premium feature.

- Export **tags, collections, relationships, saved searches, stable IDs, timestamps, schema version, portable path hints and optional hashes** as JSON.
- Offer CSV for flatter tabular data, **GraphML** (or other documented, broadly usable graph format) for graph relationships; optionally a ZIP bundle with manifest/checksums and a readable specification.
- Support import and **round-trip validation**: export → fresh profile → import → compare tags, collection membership and graph edges. Preserve duplicates/Unicode, quotes and line breaks.
- Full file contents are **not** included by default; distinguish metadata export from explicit optional file backup. Exclude tokens, private credentials, machine-local authorization keys, and sensitive URLs.
- Stable metadata identifiers should be portable but not enable unauthorized discovery of private files on another machine. Let users map/relink roots after import.
- Provide a straightforward user-facing **Export / Import / Backup** workflow and machine-readable versioned schema.

**Acceptance:** Without relying on Chutey-specific cloud services, a user can reconstitute the organization in a clean local setup or inspect it in standard tools.

## 5. Screenshot API — shell-independent, first shared capability

**Motivation:** The owner observed difficulty using regular screenshot actions while Windows `explorer.exe` was terminated. The experiment should capture screenshots **without relying on File Explorer or the taskbar**. This is NOT a claim that every Windows capture API always works without the shell.

- **Browser tab capture:** Chrome APIs such as `tabs.captureVisibleTab`, only with appropriate permission, user interaction and API throttling. A minimized Chrome window may not yield useful/valid pixels; never promise otherwise.
- **Windows desktop/window/region capture:** a native Chutey adapter (e.g. Windows Graphics Capture or DXGI Desktop Duplication, subject to Windows capabilities, restrictions and approvals). Keep capture independent of the UI/window that triggers it.
- **Trigger sources:** Chutey popup/Shelf, optional New Tab home, floating controller, approved keyboard shortcut, native UI.
- **Destination choices:** save as Chutey gallery item / History, chosen local folder, or explicit REDOWN/Click2Cloud destination. Saving is separate from capturing; no automatic upload.
- **Preview/verify:** capture once per user intent; show preview and only emit saved/success event after destination verifies actual bytes.
- **No File Explorer dependency:** file browsing/reveal can integrate optionally but screenshot capture can function with `explorer.exe` gone. Preserve accessible controls and a return-to-desktop recovery instruction.
- Never capture the lock screen or attempt to bypass secure desktop; no invisible/background surveillance.

**Acceptance:** With deliberate user opt-in, terminate/restart `explorer.exe` in a disposable test environment; capture an ordinary unlocked Windows desktop screenshot; inspect exact saved bytes/History and verify capture succeeds independent of Windows shell. Also test minimized Chrome, missing native companion, permission revocation and restored shell.

## 6. Persistent floating window / Screenshot control center

The owner proposes reusing Chutey's **experimental always-on-top floating window** as the screenshot control center, including a mode that remains visible when the main Chrome window is minimized.

- Modes: always-visible, compact/minimized (e.g. user-set 300×400 starting size), temporary mascot auto-hide/reappearance where preferred, manual close. The **Explorer view**, if explicitly opened as its own workspace, follows its own persistent visibility policy rather than the mascot's ten-second rules.
- Possible browser approach: Document Picture-in-Picture where supported, with lifecycle limits and a real live opener page. **A standard Chrome extension action popup will not persist after focus loss.**
- More durable option: native Chutey floating window, independent of Chrome window minimization (and potentially Chrome process lifetime).
- Experimental signal protocol: `WINDOW_READY`, periodic `WINDOW_HEARTBEAT`, `WINDOW_GONE`, separate `CAPTURE_READY`, `CAPTURE_REQUEST`, `CAPTURE_RESULT`. Window visibility is **not** proof of capture permission or engine health.
- Closing/minimizing the controller changes only its presentation; it must not unintentionally destroy screenshot queues or authorized ongoing saves. Loss of heartbeat expires UI ownership without leaving permanent resource locks.
- Native desktop screenshot may continue with Chrome minimized, if supported and verified; browser-only visible-tab capture should not promise it.

**Acceptance:** Open floating controller, minimize main browser, initiate an authorized screenshot, preview and save; then close floating controller and verify save queue/engine remain well-behaved. Test browser exit and missing explorer.exe separately.

## 7. Cross-extension family integration — only when another product is present

REDOWN / ReRE, Click2Cloud, and Chutey are separate products by the same creator. **Shared protocols** can let the trio cooperate, while each remains useful alone.

- **Conditional Chutey tab inside REDOWN:** after a safe, compatible, authenticated allowlisted extension-ID handshake, REDOWN could reveal an optional `Chutey` tab in its Shelf/Settings; hide/disconnect cleanly if Chutey is not installed or disabled.
- Chutey could expose safe capabilities such as `collection.open`, `capture.receive`, `mascot.notify`, `receipt.preview`, only where the user explicitly opted in.
- Mascot API interaction: REDOWN or Click2Cloud can ask Chutey to render one verified-save reaction; no duplicate mascots or false-green flashing. A mascot notification is **presentation**, not authority to mark a file saved.
- Use Chrome supported external extension messaging with sender allowlists/schema validation and explicit capability grants; **installation/discovery is not consent to access personal files, screenshots or History**.
- Different Chrome unpacked extension IDs and Chrome Store IDs need a tested explicit mapping; don't ask for broad installed-extension inventory permissions unless essential.

**Acceptance:** Install one, two or three products; integrations appear only for compatible and opted-in partners; revoking permission or uninstalling a partner doesn't break core functions or disclose data.

## 8. Shared concurrency, collision avoidance and efficiency

A shared **Screenshot API is a module**, and an eventual **Universal Coordination API** is the optional broader protocol. One creator can align all the systems but separate Chrome extensions do **not** share an in-memory mutex automatically.

- Unique `request_id`, owner app, target, consent scope, capture timestamp, operation status and verified receipt per user intent.
- Cross-extension coordinator is **explicitly authorized** and may be a native helper or supported external-messaging owner. The browser-only fallback has local queueing, not magically global arbitration.
- Lock *actual conflicting resources* only for short acquisitions. Independent tabs, file reads and unrelated uploads run concurrently where safe.
- Capture → encode → transfer → provider verify → notify use separate bounded queues; a slow cloud upload must not hold the capture lock.
- User-triggered capture precedes optional auto-capture with fairness/aging and per-app quotas. Throttle against actual Chrome browser API limits, native capture capacity and provider constraints.
- Retry by stable request ID. Distinguish two intentional similar screenshots from an accidental duplicate retry. Do not use global content hashes to leak cross-app information.
- Use leases/fencing tokens, idempotent commits, timeout/backoff and crash reconciliation; no unbounded screenshots queued in RAM/disk.
- Atomic destination naming and non-overwrite semantics. Each provider/local destination verifies its own bytes and status; no history/counter/success animation until confirmed.
- Preserve user privacy: screenshot pixels stay within the explicit capture/destination consent. No silent multi-product fanout.
- Especially test small RAM and low free disk; bounded buffers, streaming when supported, no storage pressure explosions.

**Acceptance:** Simultaneous capture requests from all three apps cannot double-save one request; unrelated captures can proceed subject to actual hardware/API limits; a killed coordinator does not strand requests; no false success after provider denial or worker crash.

## 9. Experimental Settings surface and release gates (proposed)

Suggested **Settings → Experimental** entries; all opt-in and disabled by default:

| Flag / label | Purpose | Extra requirements |
| --- | --- | --- |
| `scientist_chutey_skin` — Scientist Chutey | Goofy mascot look | Visual assets, reduced motion |
| `chutey_newtab_home` — Chutey Home | New Tab replacement experience | Dedicated manifest/edition and explicit browser override |
| `file_tags_collections` — Tags and Collections | Multi-tag non-destructive organization | Root-scoped indexing, migrations |
| `file_graph_mode` — Graph Explorer | Relationship navigation | Tag index, pagination, graph view |
| `portable_metadata_export` — Portable Export/Import | JSON/CSV/GraphML metadata portability | Validated round trip, no credentials |
| `shell_independent_screenshot` — Screenshot Engine | Browser and native capture | Capture permissions, verified saves |
| `persistent_screenshot_window` — Floating Capture | Always-on-top control surface | Explicit UI/window lifecycle |
| `family_integrations` — Connected Extensions | Conditional REDOWN/Click2Cloud tabs/actions | User consent, extension allowlists |
| `mascot_cross_app_events` — Mascot Events | Opt-in shared verified events | Notification dedupe, privacy |
| `shared_capture_coordination` — Coordinated Screenshots | Fair multi-app scheduling | Real cross-extension coordinator |
| `adaptive_icon_renditions` — Refined Small Icons | High-quality mini-renditions for landing-page images eligible after 60 seconds | 16/25 candidate batches, local cache, safe deletion; [full spec](ADAPTIVE_ICON_RENDITIONS.md) |

**Flags above are conceptual settings names. They do not exist in the current code.** Some changes, particularly New Tab override, may need a separate Chrome package/manifest and cannot be enabled by a runtime switch alone.

**Additional future experiment:** [Adaptive Icon Renditions & Smart Cache](ADAPTIVE_ICON_RENDITIONS.md). Keep conversion selective, cache deletion reversible by regeneration, and current gallery/worker untouched.

**Implementation order (proposed):**
1. Preserve and stabilize existing Chutey worker/Chrome functionality and backups; no new feature can excuse false saves or worker regressions.
2. Prototype Scientist Chutey as standalone skin, tag metadata schema + export round-trip with small disposable fixtures.
3. Prototype consented Screenshot API + optional floating UI independently from Windows shell and from cloud destinations.
4. Add optional graph browsing and Chutey Home in a dedicated experimental extension build.
5. Add cross-extension handshakes, collision prevention and opt-in Mascot API events; test all independent/pair/trio combinations.

**No work on any other repository is authorized by this document. No forced installation, browser New Tab override, Windows shell replacement, file-system indexing or autonomous screenshots.**

## Definition of done for future experiments

- Exact paired Windows worker + Chrome source/build identity pinned; no compatibility assumptions.
- Explicitly scoped user opt-in, disable/revoke, and rollback.
- Native/browser capability tests under Chrome minimized, explorer.exe terminated, worker asleep, Chrome restart, Windows sleep/resume.
- Capture and upload are separately verified; no false green counters, sounds or mascots.
- Tags/collections/graph/backup produce portable, inspectable outputs without altering original files.
- API/GUI parity and reproducible tests; bounded resource consumption on 4-GB Windows.
- Historical GOLD baselines and current user data unchanged.

**Overall:** Preserve these ideas under **Experimental** for later review. This record is not permission to implement or ship them now.
