# CODEX — Owner requests only (2026-11-16)
**Authority:** Only requirements the owner actually expressed. Do not implement separate assistant suggestions as if they were requested.
**Repo:** thanks-cohn/chute; baseline branch fix/chutey-popup-stable-first-paint-2026-11-16 (verified abe7418). Continue on YOUR CURRENT Codex working branch. Never reset or overwrite concurrent work. Protect installed Chute.exe, working Chrome extension, existing saved images/history and archived release. No installer or original worker replacement.

## P0 — Dashboard popup images: restore previously working display
The version immediately before current Phase 1 correctly showed ALL image-bearing saved Chuteys. New candidate renders the first 4×4 normally but cards below collapse to thin slivers and only expand on clicking. This is a NEW REGRESSION. Density choices 4×4, 5×4, 5×5, 6×5 mean initially visible grid density, NOT maximum number of full-sized cards. Diff against immediately prior working implementation (baseline source 45dc8f034045c8807f5b712f7e8915c7ba76313a), identify precise cause, restore consistent card dimensions throughout scrolling collection with lazy-loaded bytes but stable full-sized placeholders. Don't alter saved content or unrelated prior behavior. Reproduce with 100+ cards and measure cards below viewport.

## P0 — Ordinary Windows profile and drive-root access
Previously accessible selected Windows user profile now says "The item is unavailable or cannot be accessed safely." Investigate actual failed filesystem operation and restore explicitly authorized access to ordinary profile/child directories without disabling legitimate protections.
Selected USB drive root produces "Select a folder rather than an entire drive." Owner wants explicit full-drive-root browse selection, like a genuine file manager, not an arbitrary subfolder requirement.
During test File Explorer initially displayed "Access to the specified native messaging host is forbidden." Host manifest regeneration lost a test Chrome ID; preserve expressly authorized IDs and original production ID, differentiate native connection from HTTP worker health. Do not bypass enrollment security. Report precise errors.

## P1 — File Explorer thumbnail-first
Real thumbnails of image files, **not generic icons**, must be default Grid View presentation, without clicking each image. Settings switch restores the existing generic file icons and persists selection. This is specifically File Explorer, NOT dashboard History. Lazy-load and cancel offscreen images, reserve full tile geometry; keep sensible fallback icons for unsupported types.

## P1 — Preview becomes a gallery
Preview overlay OPEN: visible left/right buttons and keyboard Left/Right select previous/next file in current directory, keeping overlay open and selected item synced; keyboard Up/Down scroll within the current TXT/document/file content and NEVER switch files; mouse wheel scrolls; Escape/X closes. Keep same overlay height and position while switching, with no reflow of underlying file list/grid. When closed, standard Explorer navigation resumes. Respect inputs and video-player controls; no automatic next-file at end of document.

## P1 — Audio/video observed limitations
Large MP3 reports "Preview unavailable. Large media requires native streaming integration." Add proper playable audio preview, investigate limits. **Small MP4 DOES play**, preserve it; larger MP4 support needs range streaming rather than full-file memory. Diagnose codec versus size versus worker capability. Broader MKV/AVI/WebM Movie Mode was discussed for future, not asserted implemented. Preserve original worker, validate candidate independently.

## P1 — Mascot right-click immediate regression
Right-clicking existing mascot currently makes it hide. Fix handler/auto-hide interaction so right-click and any open menu leave the original mascot visible. Don't remake its appearance or break established click and drop actions.

## Owner-requested settings and navigation direction
**Reveal / GO TO (owner's revised preference):** Default should navigate inside **Chutey File Explorer** to the containing directory and select the target file. **Keep the CURRENT working Windows Reveal/GO TO functionality** as an explicit, persistent Settings alternative; verify it end-to-end and repair anything incomplete rather than deleting or replacing it. Do not regress existing Windows-location behavior.
**Open (owner's revised preference):** Default opens supported files **inside Chutey**. Settings can switch Open to the system's default associated application. **Preview is already covered** as a separate action: preserve its agreed gallery behavior and avoid conflating Open, Preview and Reveal.
**Existing mascot Expand and desktop sticky behavior** plus drag/drop destination and docking are documented separately in `/experimental/CHUTEY-MASCOT-STICKY-EXPLORER-CHANGES-2026-11-16.md`. Do not merge that major expansion into the Phase 1 hotfix; immediate right-click *hides mascot* regression should be fixed now.

## Codex execution and acceptance
- Trace root causes rather than speculate, compare against last successful version, preserve all existing image/history assets.
- Fix prioritized Phase 1 problems above with focused regression tests; real Windows Chrome checks for file system, USB and native messaging. Explicitly mark unexecuted Windows checks pending.
- Record successes and limitations honestly (including small MP4 success), protect worker SHA256 C193FE77CC3E7DB9FA1B661F98FC3416AD42067B9B86BD496E2F00ED0CC4944B.
- Do not begin Phase 2/3 without completing current repairs; no unapproved assistant feature insertion.
- Deliver exact changes, tests, commit SHA, branch, and a Windows CMD pull command with `&&`.
