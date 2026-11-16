# Chutey Windows worker archive — 2026-11-16

**Archive branch:** `archive/chutey-11.16-worker`

This directory is reserved for an archival copy of the **currently installed old Windows worker and native messaging helper**, uploaded by the owner from their Windows machine. Its purpose is to preserve the *actual binaries currently installed* before attempting a new Development 1 candidate.

Expected files after the owner runs their local archival commands:

- `Chute.exe` — copied from `%LOCALAPPDATA%\Programs\Chute\Chute.exe`.
- `Chute-NativeHost.exe` — copied from the same installed folder.
- `Chute.exe.sha256.txt` and `Chute-NativeHost.exe.sha256.txt` — locally computed SHA-256 hashes.

**Do not overwrite the old binaries until both copies are pushed and verifiable.** The legacy installed worker previously had SHA-256 `C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B`, but verify the current installed file before assuming it is the same build.

Do not archive private user content or configuration: Chutey stored files/history, profile tokens, Chrome profiles, and native registration secrets must remain outside GitHub. Only executable binaries and public checksums belong in this folder.

Development 1 source branch: `codex/2026-11-16-phase1-repairs`. Latest repair source commit when this archive was created: `62694d6f821481c7857d134a8ddd1ba6e6aded83`. Source update alone **does not** build a new Windows EXE. No new matching Windows worker release has been verified for that commit.

**This is an archival checkpoint, not permission to delete/replace an installed worker or begin Development 2.**
