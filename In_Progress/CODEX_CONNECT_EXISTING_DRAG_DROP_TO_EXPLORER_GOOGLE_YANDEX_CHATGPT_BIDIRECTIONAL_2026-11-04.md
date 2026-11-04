# CODEX — Connect Chutey's EXISTING drag-and-drop to the real File Explorer
## Google · Yandex · ChatGPT ↔ Chutey's authorized local folders

**Repository:** `thanks-cohn/chute`  
**Implementation branch:** `codex/chutey-explorer-windows-usable-asap-2026-11-04` (read latest branch HEAD, do not overwrite concurrent work)  
**Priority:** **P1 focused integration, as soon as the Windows Explorer browse milestone is usable.**  
**Owner's direction:** “The drag-and-drop code to move things into Google, Yandex and ChatGPT, and vice versa, already exists. Make it work with the File Explorer.”  
**Deliverable:** Actual code, reusable tests, real Chrome interaction/transfer evidence and a matched extension test package; not another implementation proposal. Do not auto-merge or deploy.  
**Scope:** Chutey local folders ↔ supported browser pages. REDOWN cloud adapters are a **separate** later interoperability contract.

## 0. Immediate goal — reuse, don't rebuild

Chutey's existing Live basket/History already implements browser drag routing, Chute-token relay, real `File` construction, Google/Yandex image-upload adaptations, ChatGPT-specific drag lifecycle, local image-byte intake and native companion wake. The new Explorer should participate in those existing workflows **as another authorized source and destination**.

Expected user behavior:

1. **Explorer → website:** Drag an image from a real local folder shown in Chutey's **File Explorer** tab to an eligible image-upload surface on Google Images/Lens, Yandex Images or ChatGPT. Where legitimately supported, the receiving page receives the **actual file bytes, filename and MIME**, not a local path, a preview JPEG, a `.url` shortcut or an internal text token.
2. **Website → Explorer:** Drag an actual file, webpage image or supported browser item onto a *specific authorized target folder* in Chutey's Explorer (tree, folder row, or current-folder background). Actual bytes are written in that folder, and only a **verified** resulting file is shown as saved.
3. **Explorer ↔ Live Chutey:** Optionally drop/copy an explicitly selected file into the existing Live basket and use its well-established outward delivery as a controlled interoperability fallback. Don't silently turn an Explorer folder into a different basket target; copy vs move must be explicit.
4. **Explorer ↔ Explorer:** Reuse the same Python operation API for permitted within-Explorer copy/move; never invent a parallel JS filesystem engine. This may remain gated until the scoped write API is independently proven.

**Do not delay this narrow integration waiting for an expansive redesign, heavy transfer benchmarks, all 500 golden cases, new mascot animations or a replacement Chrome worker.**

## 1. Source audit already performed — confirm before coding

| Existing file | What the code actually does | Implication for the new Explorer |
|---|---|---|
| `extension/shelf.js` | Live/History items with `file.id` become draggable; `chuteToken(file)` uses `CHUTE_ITEM:` + encoded {id,name,mime}; drag event uses `application/x-chute-item`. | Source IDs mean **Chute Store IDs**, not arbitrary Windows Explorer file handles. |
| `extension/drag-relay.js` | Relays the Chute Store token across extension drag boundaries; adds image `text/uri-list`, HTML and `DownloadURL` fallbacks pointing to `/api/files/{id}`, and signals `chute-drag-out-start`. | Reuse transport logic, but do **not** put raw Explorer handles, root paths or read-session bearer tokens in public drag text/URLs. |
| `extension/background.js` | Routes `chute-drag-out-start` to the active webpage's content script. | Reuse dispatch/routing; verify sender/window/tab identity and avoid stale-active-tab delivery. |
| `extension/content.js` | Can recognize the Chute Store token or drag-start notice, retrieve bytes from `/api/files/{id}`, construct a real browser `File`, and route it to a file input or synthetic `DragEvent`. ChatGPT-origin pages receive special native drag lifecycle preservation. | A **permission-aware Explorer source adapter** is needed. Site acceptance of synthetic events is not guaranteed; actual user-initiated acceptance must be tested. |
| `extension/direct-drop-google-yandex.js` | Attempts image-upload input selection/activation on Google/Yandex for Chute-origin image files while preserving the usual route when it cannot locate a suitable input. | Reuse the site adapter for eligible image files; retain real-site variation and unsupported explanations. No generic site automation. |
| `extension/drop-lifecycle.js` | Cleans up synthetic drag overlays and stuck drag state in supported conditions. | Retain cleanup for source Explorer drags, success/failure and interruption. |
| `extension/bin.js` + image resolvers | Converts dropped File/Blob/image data into Live Chute stored bytes; resolves some Google image/source candidates, and sometimes saves a `.url` shortcut as an explicit older fallback. | Reuse actual byte acquisition where applicable, but the Explorer destination MUST be exact selected folder; a URL shortcut is not proof of an image. |
| `extension/explorer-view.js` | Has real authorized folder navigation/preview, but explicitly sets drag `dropEffect="none"` and rejects Explorer workspace drops. Rows are not implemented as the same draggable Source type as Live basket. | Wire drag start, enter, over, leave, drop and row/folder hover into the new adapters without disturbing tree/list/preview layout. |
| `extension/explorer-api.js`, `src/chute/explorer/{core,api,security,windows_fs,protocol}.py` | The Explorer Python API accepts opaque handles tied to an authorized root; reads are authenticated, write commands deliberately BLOCKED. | Implement separate explicitly authorized write grants and safe byte receive before permitting browser→Explorer writes; never bypass this via unauthenticated URLs or the older Chute Store API. |
| `src/chute/server.py` | Existing `/api/upload` adds items to the Chute basket; `/api/files/{id}` retrieves Chute Store bytes. | **Not** an arbitrary-folder Explorer receive endpoint. Calling it cannot satisfy “drop into this selected local folder.” |

**Existing proofs are separate.** The presence of site adapters does NOT establish successful current live deliveries for every Google, Yandex or ChatGPT version. The first task is to inspect and preserve whichever exact browser flows are currently genuinely working on the owner's installed pair; independently identify each working and failing direction.

Read `worker/README.md`, `In_Progress/CODEX_P0_WINDOWS_EXPLORER_FAST_FIRST_PROGRAMMATIC_CORE.md`, `In_Progress/CODEX_DRAG_DROP_LOCAL_EXPLORER_IMPLEMENTATION.md`, and `docs/explorer/WINDOWS_P0.md`; they define the single-worker, Python-first, authorized-filesystem constraints.

## 2. Explorer → Google, Yandex, ChatGPT — real-file drag source

**P1-A: earliest shippable win.** Leverage the already **read-authorized** Explorer to make a local file draggable without requiring arbitrary directory-write permission.

- Add `draggable` affordances to **files in** `#chutey-explorer-view .ex-row` (and consistent previews) in supported view modes. Directory drags may be deferred until typed recursive multi-file transport is genuinely available; show clear capability states.
- On actual user `dragstart`, create a **short-lived, narrowly scoped opaque transfer intent**, bound to origin/extension, exact file handle+identity, allowed read scope, specific operation and expiry. It should not be a raw filesystem path, permanent token, or Chrome-page-readable permission grant.
- Extend the existing relay to understand the approved Explorer source type **alongside** the existing Chute Store source, preserving the old `CHUTE_ITEM` behavior for Live basket/History. Don't send an Explorer handle as if it were a basket ID: `/api/files/{explorer-handle}` is not valid.
- The extension-owned authorized transport fetches **original file bytes** via the same protected Python Explorer engine and its verified handle. Build a real named `File` in a content script only when the receiving browser workflow legitimately allows it. For non-image file types, use generic accepted upload surfaces when supported; Google/Yandex image-search paths should accept only supported images.
- The current Explorer `/api/explorer/v1/content` endpoint is **preview-limited and MIME-limited**. Do **not** use it as a universal arbitrary-file export endpoint or enlarge preview caps without a separate security review. Add an explicitly granted, bounded streaming source adapter when necessary and verify file identity and bytes.
- Preserve `drag-relay.js`, `content.js`, `direct-drop-google-yandex.js`, `drop-lifecycle.js` and `background.js` behavior. Prefer a narrow shared transfer-dispatch layer; avoid site-specific logic inside the Python filesystem engine or duplicating the whole content script.
- **Receiver semantics:** `input.files` assignment + `change` is only one possible delivery path; an untrusted/synthetic `DragEvent` may be ignored by the site. Never report transfer success because a DOM event fired, a drag overlay closed or a token was consumed. Distinguish `FILE_BYTES_READ`, `DELIVERY_ATTEMPTED`, `PAGE_ACCEPTED_IF_OBSERVABLE`, `UNVERIFIED` and `UNSUPPORTED`.
- If the site forbids synthetic or cross-window browser delivery, offer a clear user-initiated supported fallback (e.g., Copy to Live Chute then use an existing proven delivery route, native file picker or Save As/Open-in-folder) rather than bypassing browser trust or silently faking upload.
- Keep original filename/extension, MIME and byte identity; render a helpful status if the source file changed, vanished, got locked or its root permission expired. Never reuse stale handles.

**P1-A acceptance:** From real installed Chutey Shelf Explorer, drag a small authentic test PNG into each eligible receiving website separately. Show exactly which path was attempted, whether actual bytes were delivered, and whether the site's own UI acknowledged the attachment. Report `VERIFIED`, `ATTEMPTED`, `BLOCKED` or `UNKNOWN` for Google, Yandex and ChatGPT **individually**. Networked tests require the owner's separately authorized manual interaction—CI must not upload to their personal accounts.

## 3. Google, Yandex, ChatGPT → Explorer — exact folder intake

**P1-B.** This direction needs a **trusted write capability**, not just drag event plumbing. The Windows Explorer browsing milestone deliberately authorizes **read-only** folder grants; do not turn those into silent arbitrary-write access.

- Add a user-facing, explicit **Allow writing to this folder** native approval flow or a scoped destination consent mechanism controlled by the trusted Windows companion. Select target by the Explorer's previously authorized, current, opaque folder handle + verified identity, **not by a path string supplied by a webpage**.
- Support drops into: (1) current directory background, (2) specific folder row, (3) tree child/parent folder. Distinguish file rows and non-directory targets. Show accurate hover destination, dropEffect, pointer/touch/keyboard fallback, reject illegal/offline/reparse targets and prevent drag overlay from obscuring folder navigation. Allow users to choose another folder intentionally.
- Integrate capture of actual `DataTransfer.files`, `DataTransfer.items`/user-granted directory entries where available, image URLs, Google/Yandex image candidate metadata and webpage text/link with explicit **type-dependent** handling. Prefer true file bytes; respect Chrome/Windows restrictions on cross-extension, cross-origin and desktop drags. URL/source metadata is not an authority for a local destination.
- Reuse the existing Chute capture's image URL candidate prioritization, MIME checking and real image-byte fetching only within legitimate permissions. If the bytes cannot be fetched, expose **“Cannot save image bytes”** with an optional explicitly labeled **Save link/shortcut** action, never a fake successful image.
- For the actual write, route the payload to a new protected Explorer **receive/stream** operation in the **production Python engine**, with bounded buffer/chunks, exact authorized destination and staging + verified final commit; default KEEP BOTH, offer SKIP and explicitly confirmed REPLACE only once safe and tested.
- No automatic deletion of source, no arbitrary remote-page upload, no execution of saved content. Browsing-only grants remain read-only until a deliberate write grant. Check file identity/permissions again at execution. Protect against traversal, reserved names, junctions/reparse points, races, conflicts, cancellation and file-system exhaustion.
- For multiple drops, show accurate per-file receipt and total success/partial/failure state. User can continue browsing and viewing while the transfer is underway; queue bounded work if permitted by the P0 queue contract, never claim a new durable queue was finished if it isn't.
- After **independent destination readback/byte hash**, refresh the specific affected directory and highlight the new object. If write fails, keep the old folder listing and don't display an invented saved image.

**P1-B acceptance:** User drags a legitimate small image from a Google/Yandex results page or ChatGPT-visible allowed source onto an approved Chutey Explorer folder. **The file is actually present in the intended Windows folder**, not merely added to Live Chute. Independent Python or OS inspection confirms exact byte content and resolved filename. Explicitly verify that a different unapproved directory was NOT written.

## 4. Cross-product drag boundaries and user-facing fallback

- Browser tabs, content scripts, extension `chrome-extension://` Shelf and Windows native files are different security surfaces. Document which drag combinations are fully trusted, which pass `DataTransfer` bytes, and which require an explicit user gesture or native chooser.
- Do not rely on `DataTransfer` carrying a live Python handle, private session token or authenticated localhost URL to a website. An opaque reference only works if the extension verifies and resolves it through the authorized transport.
- ChatGPT's full-page drop overlays and other site drag/drop depth counters must be restored on aborted, failed and successful attempts; preserve `drop-lifecycle.js` behavior without swallowing unrelated trusted webpage drops.
- Avoid global interception of Google/Yandex normal dragging/searching or general browser gesture routes. Only act on a verified Chutey transfer intent and valid target. No hidden click or site script injection to bypass trust mechanisms.
- If a path cannot be made genuinely drag-compatible, display a direct, understandable fallback with precise action and proof. Do not spend the run trying to force impossible synthetic events to appear trusted.
- A directory is a **collection/tree** with potentially multiple files and relative paths, not a magical single `File`. Support folder drops only after actual directory-tree receive/grant safety is implemented; otherwise show “Folder drops coming later” rather than flattening, skipping children or inventing a success.

## 5. Preserve the fully programmatic Python foundation

Every real Explorer file read, destination selection and write/verify must be independently invocable through `src/chute/explorer/` by a trusted Python script, **without Chrome**. The browser/drag adapters can handle UI/user gesture and site-specific quirks, but must not implement a competing filesystem engine.

Add versioned, machine-readable transfer-intent schemas, source/destination identity, expiry, cancel/reconcile semantics, and reason-coded states. No arbitrary path injection, long-lived bearer in page, extension-wide wildcard write privileges or hidden native host action.

Make lightweight tests with meaningful independent oracles:
- `EXPLORER_TO_WEB`: authorized file read from selected root yields exactly original bytes/name/MIME to a controlled fixture uploader.
- `WEB_TO_EXPLORER`: approved dest writes true file bytes, verified by independent disk readback/hash; unapproved dest rejects without writes.
- Two roles `Chute Store ID` and `Explorer file handle` remain impossible to confuse; expired/change/revoked handles reject.
- Image bytes vs thumbnail vs URL shortcut are distinguished. Missing image bytes never count as successful image.
- Exact destination row/tree/background; empty/nonempty folder; conflict KEEP BOTH; duplicate name; symlink/reparse denial; root switched mid-drop; huge-size request rejected/bounded in quick tests.
- Cross-window owner gesture, dropped/closed Shelf, cancelled operation, pending source metadata, stale tab, rapid repeated drags, partial multi-file failure, reverse source page to folder.
- Google/Yandex and ChatGPT fixture adapters with DOM changes and untrusted event rejection; preserve baseline Live basket→site behavior and native worker boot regression.

**Resource policy:** Use only small generated disposable source files and tiny browser fixtures; never download large repositories or media, run stress tests or perform cloud uploads as part of automated testing. No real third-party upload without explicit owner consent. Log PASS / FAIL / BLOCKED / NOT_TESTED per proof class `PYTHON_ACTUAL_FILESYSTEM`, `CHROME_FIXTURE`, `INSTALLED_CHROME`, `LIVE_GOOGLE`, `LIVE_YANDEX`, `LIVE_CHATGPT`. A green fixture result is not live-site confirmation.

## 6. Plan of attack and deliverables

**Step 1 — measure baseline quickly.** On a separate focused branch/worktree, run cheap existing Chutey boot, History, drag relay and browser image fixture tests. Confirm known-working Live basket→site mechanics and identify precise unsupported site behavior. No massive corpus generation.

**Step 2 — Explorer as outbound source first.** Implement actual dragstart/source bridge and reused site adapters with minimal edits and real file bytes. Produce a Chrome-only update if the companion API already supports the necessary secure file export; otherwise build a matched test companion and extension package. Give the owner a testable milestone immediately.

**Step 3 — explicitly authorized Explorer destination.** Implement trusted native write-grant and real Python receive/commit/verify, then wire folder-hover/highlight and browser→Explorer drops. Build a **matched Windows companion + Chrome test pair** when companion code changes. Do not route drops to generic Live Chute by accident.

**Step 4 — controls and proof.** Run cross-browser/installed-Chrome visual tests, independent file-content oracle, provider/site matrix, and original Chute drag/basket/History regressions. Distinguish real site acceptance from synthetic DOM delivery.

**Step 5 — report precisely.** Include commit hashes, files reused and modified, actual test cases, screenshot/video evidence as available, explicit installed instructions, test package, known limits, and any site-specific blockers. No vague “it should work.” Never auto-merge to main or replace the owner's installed pair without approval.

**Keep separate outstanding requests separate:** the half-height Explorer + scalable preview + Left/Right gallery fix has its own spec at `bugs/CHUTEY_EXPLORER_HALF_HEIGHT_BROWSING_EXPANDING_PREVIEW_AND_ARROW_GALLERY_2026-11-04.md`; do not regress or silently overwrite that work. Gallery/mascot yearbook ideas are deferred. Do not rebuild the Chrome worker or drag system unless source-backed failures prove an unavoidable need.

## 7. Explicit acceptance matrix

| Direction | Target | What constitutes success | What is NOT enough |
|---|---|---|---|
| Explorer → Google | Image upload/Lens | Real source bytes accepted by Google's UI for the user-approved image workflow | File icon moved / synthetic drop fired |
| Explorer → Yandex | Image upload/search | Image accepted by actual Yandex UI | Generic console log |
| Explorer → ChatGPT | Attachment / eligible drop target | Visible genuine attached local file with actual bytes (and supported type) in the target conversation | “Drop anything” overlay disappeared |
| Google → Explorer | Authorized Chutey folder | Independently verified real image/file in exact intended Windows folder | Chute basket count changed |
| Yandex → Explorer | Authorized Chutey folder | Same exact folder / byte oracle | Saved image is just a URL shortcut |
| ChatGPT → Explorer | Available user-permitted browser file/image | Actual bytes delivered by valid browser gesture and written to approved Windows target | Fabricated `File` where browser yielded no bytes |
| Live Chute → sites | Existing baseline | No regression in already verified Chute Store-id-based flows | Explorer-only functionality works but old Chute breaks |

At the end, present a **tested, usable integration**, not another design document. If any particular site prevents it, preserve the engine and give an actionable user-facing fallback with honest `BLOCKED` evidence.

---

### Lightweight Codex starter

> In `thanks-cohn/chute`, read `In_Progress/CODEX_CONNECT_EXISTING_DRAG_DROP_TO_EXPLORER_GOOGLE_YANDEX_CHATGPT_BIDIRECTIONAL_2026-11-04.md` and IMPLEMENT it on a focused branch. Reuse `content.js`, `drag-relay.js`, `direct-drop-google-yandex.js`, `drop-lifecycle.js`, `bin.js` and Chutey's existing Python Explorer. First make Explorer files draggable into Google/Yandex/ChatGPT through the existing routes, then implement approved browser→Explorer folder intake using a secure native write grant and independent file-byte verification. Don't confuse Store IDs with Explorer handles, don't expose local paths/tokens to web pages, don't simulate success from synthetic drops, and don't break the current working Windows Explorer or Live Chute drag. Test small fixtures and installed Chrome; report per-site verified/blocked evidence, build matched test artifacts, no auto-merge or deployments.
