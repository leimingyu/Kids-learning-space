# "Save my game" → saved_status file (no launcher) — decision + design

**Date:** 2026-07-03
**Status:** Implemented (best-judgment while user away)
**Backup restore point:** tag `backup-pre-saved-status` / branch
`backup/pre-saved-status` (main @ 4236323).

## The constraint (why the literal ask can't be met)

Double-clicking `index.html` runs the page as `file://`. The browser sandbox
**forbids** a page from writing to a folder on disk: the File System Access API
is blocked on `file://`, and the only file a `file://` page can emit is a
**download**, which the browser places in its **Downloads** folder (a page cannot
target a folder next to the game, and cannot write automatically/silently).

So "double-click index.html" + "silent write to a saved_status folder next to the
game" cannot both hold. User's overriding preference is **no launcher / just
index.html**, so we honor that and produce the best file a `file://` page can:
a download into a `saved_status` folder.

## Design

- **"💾 Save my game" button** (hub account row + Parent page). On click,
  `KLS.backup.saveToDownload()` builds the existing backup envelope and downloads
  it as **`saved_status/kls-save-<YYYYMMDD-HHmmss>.json`**.
  - In **Chrome/Edge**, a `download` attribute containing `saved_status/…` creates
    a `saved_status` subfolder inside Downloads → `Downloads/saved_status/…`.
  - In Firefox/Safari the slash is sanitized → the file lands directly in
    Downloads as `saved_status-…json`. Either way it is clearly named and is a
    complete backup.
- **Everyday progress still auto-saves** in the browser (localStorage +
  IndexedDB) — unchanged source of truth. The download is the portable copy.
- **Restore:** unchanged — Parent page → **Import a file…** reads any
  `saved_status` file back (REPLACE, with the type-REPLACE confirm).
- **Consistency:** the local-server and File-System-Access folder paths (used
  only if someone runs the launcher) now also write into **`saved_status/`**
  instead of `saves/`, so the folder name matches everywhere.

## Honest limitations (told to the user)

- The file goes to **Downloads** (Chrome: `Downloads/saved_status/`), not a folder
  next to the game — a `file://` page cannot choose that.
- Only the **button** produces a file; autosave cannot silently download (browsers
  block repeated programmatic downloads). Autosave still persists in the browser.
- A true `saved_status/` folder **next to the game**, written automatically, is
  only possible via the launcher's local server (kept available, folder renamed
  to `saved_status/`).

## Nothing breaks

Additive: a new download action + a folder rename (the folder is gitignored and
has no shipped data). Envelope format + `BACKUP_VERSION` unchanged; localStorage /
IndexedDB autosave untouched; existing Import/Export and the server/FS-Access
paths keep working.

## Verification

- **Node:** `savedStatusFilename(date)` format; existing prune/summary tests.
- **Browser:** monkeypatch `URL.createObjectURL` + anchor click to capture the
  download without a real file → assert filename `saved_status/kls-save-<ts>.json`
  and that the blob is a valid `kls.backup` envelope containing the profile's
  stars. Confirm the hub + Parent buttons call it; autosave still works.
- **Server:** `python3 tools/test_kls_server.py` updated for the `saved_status`
  dir name.
