# Save History to the App Folder — Design Spec

**Date:** 2026-07-03
**Goal:** When the user clicks **Save** or when **autosave** fires, write the save
history as real files into the local folder where the app lives — without
breaking anything.

## Constraint (why the design is shaped this way)

A static web page cannot silently write to a fixed disk path; the browser sandbox
forbids it. The only web-native mechanism is the **File System Access API**
(`showDirectoryPicker`), which after a **one-time** folder grant can write into
that folder silently — but it is **Chrome/Edge only** and needs a **secure
context**, so it works over `http://localhost` (via the launcher's local server),
not over `file://` (plain double-click), and not in Safari/Firefox.

**Chosen approach (user):** the web-native folder mirror — extend the existing
Phase-2 mirror (`connectBackupFolder` / `getLastDirHandle` / `mirrorAfterSnapshot`)
rather than add a custom server. This keeps the app pure-static; the launcher is
upgraded to serve `http://localhost` so the API is reachable.

## On-disk layout (inside the folder the user picks — point it at the app folder)

- `kls-backup-latest.json` — always the newest full backup (stable name; imports
  cleanly; kept for compatibility).
- `saves/kls-save-<YYYYMMDD-HHmmss>.json` — **one file per save = the history**.
  Newest **30** kept; older auto-pruned. This replaces Phase-2's coarse
  `kls-backup-YYYYMMDD.json` daily scheme (Phase 2 shipped today; no existing
  folder data to migrate).

## Behavior

- **Autosave:** `takeSnapshotNow()` already calls `mirrorAfterSnapshot(envelope)`
  after each deduped snapshot. The mirror now writes `latest.json` + a `saves/`
  history file, pruned to 30, **throttled to ≤ 1 folder write / 3 min** (down from
  1 hour) so a session yields a readable handful of saves, plus one forced write
  on `pagehide`.
- **Manual save:** new `saveHistoryNow()` forces an immediate `latest.json` +
  history file, bypassing the throttle. Surfaced as a **💾 Save to folder now**
  button on the Parent-page folder row.
- **Permission loss:** unchanged — silent pause, sets the reconnect flag, the row
  shows "Reconnect folder…". Never a popup, never anything on the hub.

## Components / interfaces (all in `shared/scripts/backup.js`)

- Pure (unit-tested in Node):
  - `stampForFilename(date) → 'YYYYMMDD-HHmmss'`
  - `historyFilename(date) → 'kls-save-<stamp>.json'`
  - `selectHistoryToPrune(names, keep) → string[]` — of the `kls-save-*.json`
    names, the oldest beyond `keep` (lexical == chronological).
- FS worker (browser; exposed on `_internals` for a mock-handle integration test):
  - `writeHistoryToFolder(dirHandle, envelope, date) → Promise<historyName>` —
    writes `latest.json` to the root, ensures `saves/`, writes the history file,
    prunes `saves/` to 30. Takes the handle + date as args so it is testable with
    a mock filesystem.
- Wiring: `mirrorAfterSnapshot` and new `saveHistoryNow` both call
  `writeHistoryToFolder` after the throttle/permission checks.
- `getFolderStatus()` gains `historyCount` (count of `saves/*.json`, best-effort 0).
- Public API adds `saveHistoryNow`.

## UI (`shared/scripts/profile-ui.js`, Parent page only — hub stays backup-free)

- Folder connected → `Folder connected · <name> · saves/ has <N> files · updated
  <rel>` + a **💾 Save to folder now** button (calls `saveHistoryNow`, then
  re-renders; alerts on error).
- Supported but not connected → existing **Choose folder…**, copy nudged toward
  "pick this app's folder so saves sit next to index.html".
- Not supported (file:// / Safari / Firefox) → an honest muted note: "To keep save
  files in a folder, run the app with the launcher (local server) in Chrome or
  Edge. Progress and Export a file… still work here."

## Launchers (make the feature reachable)

`start-mac.command` / `start-windows.bat` become a **hybrid**: if Python is present
they start a plain static server (`python3 -m http.server 8000`) and open
`http://localhost:8000` (so folder-save + full auto-backup work); otherwise they
fall back to opening `index.html` via `file://` (app still works, minus
folder-save). The server is a plain static file server — it does **not** write
files; all folder writes go through the browser's FS Access API.

## Nothing breaks (guardrails)

- localStorage/IndexedDB autosave (source of truth) and the in-app restore
  timeline are untouched. Envelope format + `BACKUP_VERSION` unchanged.
- The mirror runs only when a folder is connected → default behavior for everyone
  else is identical.
- `file://` double-click still works (launcher fallback); the app never hard-
  depends on the server.

## Verification

- **Node** (`tests/smoke-backup-snapshots.mjs`): `stampForFilename` format;
  `selectHistoryToPrune` keeps newest 30, deletes the rest, ignores non-matching
  names.
- **Browser (mock filesystem):** call `_internals.writeHistoryToFolder(fakeDir,
  env, date)` where `fakeDir` records operations in memory; assert it writes
  `kls-backup-latest.json` + `saves/kls-save-<stamp>.json` with the envelope JSON,
  and that after 32 writes the `saves/` dir is pruned to 30. Also confirm
  `getFolderStatus()` returns `historyCount: 0` with no handle, and the hub +
  snapshots still work.
- **Honest limit:** the real OS folder-grant dialog and real disk writes can't be
  driven headlessly (same as Phase-2 AC5); those are covered by the mock-handle
  test + review, and called out rather than claimed.
