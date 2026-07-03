# Automatic save-to-folder via a local server — decision + design

**Date:** 2026-07-03
**Status:** Implemented
**Supersedes (as the primary mechanism):**
`2026-07-03-save-history-to-folder-design.md` (File System Access folder mirror,
now the fallback).

## Why (root-cause of "no files in my folder")

The File System Access folder mirror can only write after a **manual, per-browser
"Choose folder…" grant**, is **Chrome/Edge only**, needs a **secure context**
(`http://localhost`, not `file://`), and the grant often reverts to "ask again"
after a browser restart. So with nothing connected, the folder stayed empty — and
the approach fundamentally **cannot** be automatic. That is an architecture
mismatch with the goal ("autosave → files in the app folder automatically"), not a
code bug (the writer itself tested correct).

## Fix: the launcher's local server writes the files

`tools/kls_server.py` is a tiny local HTTP server (stdlib only) that the launchers
start. It serves the app statically **and** exposes:

- `GET /__kls_ping__` → `{ kls:true, folder, count }` so the page can detect it.
- `POST /__kls_save__` ← a `kls.backup` envelope → writes
  `<app folder>/kls-backup-latest.json` and
  `<app folder>/saves/kls-save-<YYYYMMDD-HHmmss>.json` (newest 30 kept).

Because the *server* (not the browser) writes, this works in **any** browser, with
**no folder-picker**, **no permission to re-grant**, and the files land in the app
folder automatically. Binds to `127.0.0.1` only; the write endpoint accepts only a
valid `kls.backup` envelope, caps body size, and uses server-chosen filenames (no
client path → no traversal).

## Client wiring (`shared/scripts/backup.js`)

- `detectSaveServer()` pings once per session (cached). `postSaveToServer()` POSTs
  the envelope.
- `mirrorAfterSnapshot()` (autosave, throttled ≤1/3 min) and `saveHistoryNow()`
  (manual, immediate) **prefer the save server**, and **fall back** to the File
  System Access folder mirror when it isn't present. `pagehide` uses
  `navigator.sendBeacon` for a reliable exit write.
- `getSaveTargetStatus()` → `{mode:'server'|'folder'|'none', …}` drives the Parent
  page: server = "Saving to this app's folder · saves/ has N files" + a **Save
  now** button; folder = the existing pick/reconnect flow; none = an honest note to
  launch via the launcher.

## Launchers

`start-mac.command` / `start-windows.bat` now run `python3 tools/kls_server.py 8000`
and open `http://localhost:8000`. If Python is missing they fall back to opening
`index.html` (`file://`) — the app still works; only automatic folder-saving needs
the server.

## Guardrails / nothing breaks

- Browser storage (localStorage + IndexedDB snapshots) stays the source of truth;
  the folder is an additional on-disk copy. Envelope format + `BACKUP_VERSION`
  unchanged.
- No server present → `detectSaveServer()` is false → behavior falls back to the
  prior File System Access path (or a friendly note); autosave to IndexedDB is
  unaffected. `saves/` + `kls-backup-latest.json` are gitignored (user data).

## Verification (end-to-end, real filesystem)

- **Server unit test (curl):** ping; POST writes `latest.json` + `saves/…`
  (content matches); invalid body → 400; 33 writes → pruned to 30; static
  serving intact.
- **Browser → server → disk:** app under the server reports `mode:'server'`;
  autosave + manual save produced real files on disk holding the profile's stars
  (⭐3 🏆1); the two history files differ (before/after the sticker) — real history.
- **Fallback:** on a plain server / `file://`, `mode:'folder'`/`'none'`, autosave
  to IndexedDB still works, manual save gives a friendly error, one benign probe.
- Node smoke tests unchanged and passing.
