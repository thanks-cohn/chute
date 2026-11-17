# Chutey Desktop / Chutey OS — experimental concept backlog

**Status:** FUTURE EXPERIMENT / NOT AUTHORIZED FOR IMPLEMENTATION
**Location:** `experimental/` on branch `experimental/chutey-desktop-sdk`
**Source branch:** `main` (documentation-only branch split)
**Public Chutey:** NO CLI/CMD/PowerShell execution; existing file-only product remains unchanged.

## Motivation

Chutey could grow from a browser-to-desktop file bridge into a *minimal desktop shell* controlled through persistent Chutey windows. The goal is to let users keep Chrome as the primary workspace while retaining immediate access to essential local tools, even after voluntarily closing Windows Explorer. This is a UI shell **on top of Windows**, not a standalone operating system.

## Owner vision: a Chutey can become a terminal

- On an explicitly authorized **developer/desktop build**, right-click a persistent Chutey Explorer window → **Turn into Terminal** (then **CMD** or **PowerShell**). “CLI” means *command-line interface*, while CMD and PowerShell are specific shells.
- Transform only the selected Chutey window; other persistent Explorers continue unaffected.
- Terminal begins in the Explorer's current, approved local directory.
- **Turn into Explorer** returns to the same folder and view state. Decide whether to retain, detach, or close active shell sessions explicitly; never silently terminate a process.
- Persistent windows stay on screen, support resize and minimize, and are not governed by the ordinary mascot's 10-second hide behavior.
- Explorer sessions remain persistent and can be restored regardless of whether the mascot is auto-hidden.
- Initial prototype could simply launch Windows `cmd.exe`/PowerShell through an explicit local helper action, before attempting an embedded PTY-style terminal. A functional embedded terminal requires interactive input/output, process lifecycle, backpressure, cancellation, focus, resize, and crash handling.

## Later idea: tiny Chutey taskbar / Debug Mode

**Deferred; not part of the initial CLI experiment.**

- Opt-in **Debug Mode → Show Chutey Taskbar**, default OFF.
- Lightweight bottom-of-screen native taskbar independent of Windows `explorer.exe`, ideally independent of the primary Chutey worker as well.
- Compact actions: **CMD / PowerShell**, **Explorer**, **RAM / Process Monitor**, **Restore Windows Desktop**.
- Optional shortcut such as `Ctrl+Alt+T`, configurable to avoid keyboard conflicts.
- Fast single-click terminal access without restarting Windows Explorer; minimize/restore existing terminal session.
- Must work when Windows Explorer is stopped and must provide a clear escape/recovery path.
- Optional Minimal Desktop Mode closes only a narrowly selected, reversible set of nonessential applications, **never** indiscriminately kills Windows services, the Windows compositor, security systems, or Chutey dependencies.

## Edition and legal boundaries

- **Chutey Public / consumer edition**: no arbitrary shell execution, no concealed terminal privilege or developer unlock. Keep file tools, native bridge, history, Shelf, mascot, and Explorer as established.
- **Chutey Developer SDK / Desktop experimental edition**: separate branch, distribution, and optional native control component. Require developer enrollment and conspicuous end-user opt-in; do not rely on signup or terms to provide security.
- Future developer terms should prohibit deceptive installation, unauthorized command execution, exfiltration, credential theft, and impersonation, with legal review before release.
- Never assume contractual prohibitions stop abuse. Code-level boundaries, signed packages, capability checks, auditability and end-user consent are necessary.

## Required architecture and security principles

1. Do **not** add arbitrary command execution to the existing public Chutey worker or web-accessible HTTP file API.
2. Separate optional native terminal broker/process from the stable Chutey file worker, with independent crash isolation.
3. Only a verified, explicitly enrolled local extension and local user may request a terminal. Reject untrusted origins, websites, frames, remote connections, and silent privilege escalation.
4. Bind any local listener to loopback if absolutely needed; prefer scoped native messaging with authenticated requests and narrowly defined capabilities. No open CORS or publicly exposed remote shell.
5. Use current-user privileges by default; elevation requires an explicit OS-approved user action. Do not bypass Windows/UAC/security protections.
6. Ensure commands and their output aren't passed to arbitrary pages; prevent accidental leakage of files, credentials, command history, and environment secrets.
7. Clear session state and errors; confirmed termination, explicit close, bounded output, limits, and emergency rollback. No orphaned shells on uninstall.
8. Protect working installation, production Chrome profile, native registration, port 17891, history/data, saved files and the current known-good worker baseline.
9. Because the owner's machine has ~4 GB RAM, set a strict native-memory budget and compare actual system RAM/commit with and without this feature. A browser-based terminal can consume more than it saves.
10. Keep CLI prototype behind a build-time edition/capability boundary, not a mere UI toggle in the public product.

## Proposed order (do not start without owner approval)

**Experiment A — terminal launch:** One developer-only Chutey Explorer transforms into a terminal launcher; CMD/PowerShell can open from Chrome without Windows Explorer; safe return to Explorer.

**Experiment B — embedded terminal:** Implement scoped native terminal sessions with controlled lifecycle, I/O, authorization and process supervision. Preserve persistent Explorer navigation and Chutey state.

**Experiment C — debug taskbar:** Native bottom bar with CMD, files, monitor, and emergency desktop restore; independent of main worker and Windows Explorer.

**Experiment D — desktop mode:** Optional Chrome-first mode, minimalist reversible background app controls and measured resource savings. Windows remains the underlying OS.

## Acceptance criteria for eventual prototype

- Public Chutey build and official worker behavior unchanged, including worker wake/reconnect and file operations.
- No terminal reachable from normal websites, public extension, existing file API, or an unauthenticated local caller.
- Authorized user can launch CMD without `explorer.exe`, type commands, view output, exit and restore the Chutey Explorer.
- Multiple Chutey Explorers remain distinct; one can transform without collapsing the others.
- Close, minimize, restart, worker crash, helper crash and Windows logoff do not strand the user or silently run unintended commands.
- Measured CPU/RAM/commit baseline and stress testing on low-memory Windows hardware.
- CLI capability installed only with informed, explicit local user consent; disabled by default.
- Rollback procedure documented and verified on an isolated Windows VM before any owner-host test.

**HOLD:** This file is a product-direction note only. Do not initiate development, merge into `main`, install companion software, or alter the existing Development 1 acceptance candidate without new owner authorization.
