# In Progress — API-first local file explorer and file transformations

**Status:** PLANNED ONLY. This document does not implement, ship, or authorize broad filesystem writes.
**Owner request:** Chute should become a local file explorer built around a reusable, headless Python API that powers both its Shelf GUI and an external deterministic Python scenario-testing "game", building on REDOWN's existing `tools/lab/redown_lab.py` and agentic test-corpus principles.

## Preserve and reuse the current working foundation

- Keep the user-confirmed Windows companion and matched Chrome worker permanently pinned at `chute-v2.6.1-main-upgrades-2026-11-03-working`; preserve local Chute history, upload, drag-out, and native wake-up.
- Main currently has the image-first Shelf preview fixes and Chutey branding; neither are prerequisites for this future feature.
- Never build an Explorer by giving a webpage arbitrary filesystem access. The local Python companion enforces path scope, permission checks, operation limits, identity and transactions.
- Explorer functions must be regular Python services with typed input/output and structured errors. The loopback/extension UI invokes these services; Python tests use the exact same services without browser UI. Do not duplicate the engine in JavaScript.

## Suggested core modules and boundaries

1. `src/chute/explorer/core.py`: deterministic `list_dir`, `stat`, `search`, `get_preview`, `open`, `reveal`, `mkdir`, `copy`, `move`, `rename`, and carefully gated `delete` operations. Return versioned JSON-compatible records and reason-coded errors. Read-only MVP first.
2. `src/chute/explorer/transform.py`: non-destructive image transformation engine with explicit encoder capability discovery, dimension validation, alpha/metadata handling, aspect-ratio choices, quality, rotation, format selection and atomic write/verification. Reuse existing local files. Never reinterpret "change extension" as a successful format conversion.
3. `src/chute/explorer/api.py`: scoped adapter for the existing local service, with no new public unauthenticated mutation surface. Design a capability grant/session or explicitly selected root, defend against path traversal, symlinks/reparse points, TOCTOU, reserved paths and arbitrary cross-origin requests.
4. `extension/explorer.*`: Explorer view as another client of the API, while retaining Chute/History/Recall and native messaging boot behavior. Present folder/drive navigation, breadcrumbs, sorting, pagination, image previews, drag/drop, and clear success/failure statuses.
5. `tools/explorer_lab/chute_explorer_lab.py`: owner-run Python CLI controlling the production explorer API in a disposable, explicitly approved sandbox. Commands inspired by REDOWN: `doctor`, `inventory`, `preflight`, `snapshot`, `run --dry-run`, `run`, `status`, `diff`, `report`, `retry`, and verified `cleanup`.

## File resizing and format conversion (future requirement)

The interface should eventually let a user select image files and resize to **explicit width × height in pixels**, with options for preserving aspect ratio/fit, stretch, crop, transparent padding, interpolation, and output quality. Guard maximum pixel counts and resource use according to real encoder/device limits—"any dimension" is the UX intent, not a promise of unbounded memory/codec support.

Convert between *supported* actual image formats (initial candidates: PNG, JPEG, WebP, BMP, GIF and AVIF when installed encoders support them); use encoder capability discovery and clear unsupported-format errors. Preserve originals by default; generate named derivatives, resolve conflicts with explicit policy, write to a staging file then atomic rename, independently decode and validate dimensions/format/pixels or hashes, and record provenance for rollback. GIF animation / alpha and multiframe documents require explicit fidelity rules. General conversion to "any file extension" cannot be achieved by renaming; arbitrary content types require distinct converters, loss warnings and tests.

## Python scenario game / verification contract

- Generate reproducible filesystem trees with seeded names, deep nesting, Unicode, reserved Windows names, sparse and zero-byte files, real format fixtures, conflicting names, symlinks/reparse points and permission errors.
- Build model-based state transitions and deterministic invariants for list/stat/search/copy/rename/move/delete/resize/convert; include a reference filesystem model, before/after snapshots, independent SHA-256 and content decoding, and tests for cancellation, restarts, failures, race conditions and partial writes.
- Guard against destructive testing: every write must stay inside a unique temporary run root selected by the owner, never touch the user's regular home/Chute history, never silently retry uncertain writes, and cleanup only verified run-owned artifacts.
- Report machine-readable `results.csv`, `summary.json`, `journal.jsonl`, `before.json`, `after.json`, `diff.json` and a readable summary with explicit PASS / FAIL / BLOCKED / UNKNOWN states. A GUI icon changing is not evidence that a file was transformed.
- Run unit + property/fuzz + OS integration and installed-Chrome/E2E tests on Windows, including failure scenarios. Use the REDOWN test design as a pattern, not as evidence that Chute Explorer already passes.

**Implementation sequence:** audited API contract → isolated read-only explorer MVP → Python scenario laboratory → GUI as a thin client → mutation and transform operators behind safety gates → real Windows installed-product acceptance. No source/GUI rewrite to ship the initial tests.
