# Windows clipboard adapter — version 1

This is distinct from the Chutey-internal reference clipboard. Normal Windows
file Copy/Paste uses real CF_HDROP, while the explicit image-pixel action uses
CF_DIB, CF_DIBV5 and registered PNG data. A filename or localhost URL is never
reported as copied image pixels.

The existing authenticated Explorer v1 command envelope carries these operations:

| Command | Arguments | Successful result |
|---|---|---|
| clipboard_copy_files | files: [{handle,identity}], user_gesture:true | version:1, state:COPIED, kind:windows_file_list, count, verified:true, sequence |
| clipboard_copy_image | handle, identity, user_gesture:true | version:1, state:COPIED, kind:windows_image_pixels, width, height, formats, verified:true, sequence |
| clipboard_read_files | user_gesture:true | version:1, snapshot, expires_in:300, sequence, files:[{index,name,size,identity,mime}] |
| clipboard_release | snapshot | released:true |

Optional `version:1` is accepted; unknown versions/extra arguments are rejected.
No command accepts an arbitrary browser-supplied path. Authentication and exact
Origin checks remain in the shared API. The explicit user_gesture flag records
client intent; it does not replace authentication or filesystem authority.

Copy resolves existing guarded handles and checks their canonical identities.
File-list COPY does not load the file contents or move/delete them. It publishes
native UTF-16 CF_HDROP and Preferred DropEffect=COPY, then reads back native bytes
before reporting COPIED. COPIED means the verified OS clipboard write, not that a
later Explorer Paste completed. Deleting/changing a source later can make OS Paste
fail; no completed transfer is invented.

Image copy decodes supported PNG/JPEG/WebP/BMP/first-frame GIF. Encoded input max
32 MiB and decoded dimensions max 8,500,000 pixels; a conservative available-RAM
check precedes conversion on Windows. CF_DIB is composited onto white for older
apps; CF_DIBV5 carries the alpha mask and PNG preserves exact RGBA where the target
supports it. An application may flatten transparency. Decode/budget failure
occurs before mutating the clipboard. The native driver preallocates formats,
opens the clipboard under a real hidden message-pumped owner HWND, transfers
HGLOBAL ownership correctly, and verifies supplied data while holding the lock.
No delayed rendering depends on worker survival. OS-owned data persists normally
when Chrome closes; clipboard contents may be replaced by other applications.

Explicit Paste reads the actual OS CF_HDROP list. These are user-mediated source
references, not website URL/path strings. Each exact selected source is opened
under the same RootGrant Windows parent/reparse/identity guards. Private temporary
read grants are never inserted into browseable engine roots, and no source path
is returned to the browser. Windows/system/device/UNC/reparse sources are denied
by existing guards; directories are not imported in version 1. Max 128 files,
1-MiB OS metadata and 65,536 aggregate path characters. Up to eight snapshots live
for five minutes; repeated reads revalidate identity, so changed/missing sources
fail. Release closes private grants. A snapshot may pin an already-started copy
until it completes; expiry prevents new reads. The transfer job API must use
`Clipboard.read(snapshot,index)` with the existing staged, verified receive engine
and a separately approved writable destination. No independent copy engine.

Expected error codes include USER_GESTURE_REQUIRED, INVALID_ARGUMENT,
UNSUPPORTED_VERSION, UNSUPPORTED_PLATFORM, FILE_CHANGED, CLIPBOARD_BUSY,
CLIPBOARD_UNCERTAIN, CLIPBOARD_UNAVAILABLE, CLIPBOARD_FORMAT_UNAVAILABLE,
CLIPBOARD_EXPIRED, CLIPBOARD_LIMIT, CLIPBOARD_IMAGE_LIMIT, INVALID_IMAGE and
RESOURCE_LIMIT. OS clipboard busy gets a short bounded retry. A native call that
has not returned in four seconds reports uncertainty, keeps a single active
operation and must not be replayed automatically. No queue of stale clipboard
writes is allowed.

## Verification boundaries

`tests/test_clipboard.py` exercises format bytes/pixels, UTF-16 paths, source
identity, no raw path commands, external OS-selected source snapshots, bounded
image rejection and explicit gestures. The Windows-only test writes/reads actual
Win32 clipboard formats and independently reads image pixels through Pillow.

`scripts/verify-windows-clipboard-ui.py [evidence-directory]` requires an unlocked
interactive Windows desktop with Paint and Explorer. It creates owned temporary
sources/windows, pastes Chutey CF_HDROP into Explorer and verifies file SHA-256,
uses Explorer Ctrl+C and imports through the guarded receive engine, then pastes
PNG/JPEG/WebP pixels into Paint, saves PNG evidence and checks actual canvas pixels.
Unavailable UI, inability to focus an owned window or failed paste/save is an
explicit FAILED result; a format round-trip does not substitute for this UI gate.
Run only in a disposable VM/test desktop. The script does not install, kill a
production worker, touch the real Chutey data directory or alter existing user
files/windows. Installed Chrome command wiring and owner-specific applications
still require the paired extension acceptance checks.
