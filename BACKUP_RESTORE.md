# Backup & Restore — Design Spec

## Why

All Kids Learning Space progress lives in the browser's `localStorage`. That
data is fragile: clearing site data, switching browsers, moving to a new
device, or shipping a breaking change to the storage schema can wipe a kid's
hard-won stars, stickers, and journey progress.

This spec defines a **manual backup and restore** flow so a parent can:

1. Export every profile and all per-game progress to a single JSON file
   **before** the app is updated with new features or schema changes.
2. Import that file later (after updates ship, or on a new device/browser)
   and have every profile resume exactly where they left off.

This is the safety net that makes it OK to keep iterating on the app.

## Non-negotiable rule

> **Before any change that could invalidate stored data — a schema version
> bump, a slug rename, removal of a game, a breaking change to a
> profile-scoped key — the previous version of the app must still be able to
> Export, and the new version must still be able to Import the resulting
> file.**

In practice: never delete the previous import path. When the envelope format
itself needs to change, bump `BACKUP_VERSION` and add a migration step from
the old version up — never the other way around.

## What's in a backup

| Source | Included? | Notes |
|---|---|---|
| `kls.progress.v2` (hub blob: profiles, per-game stars/stickers/levels) | ✅ | The core of the backup. |
| Per-game profile-scoped keys (e.g. `wordProblemAdventure_v1__<pid>`) | ✅ | All known games' state, for every profile id present. |
| Active profile id | ✅ | Already lives inside `kls.progress.v2`; falls out for free. |
| Device-level preferences (mute, volume, theme) | ❌ | These belong to the device, not the account. |
| Un-scoped legacy keys (pre-multi-profile) | ❌ | Including them would let restore silently re-introduce the "first profile inherits legacy data" bug fixed in [[CLAUDE.md → Per-profile state]]. |

## File format

A backup is a single JSON file the parent downloads. Filename pattern:
`kls-backup-YYYYMMDD-HHmm.json`.

```json
{
  "type": "kls.backup",
  "version": 1,
  "exportedAt": "2026-05-21T20:14:09.000Z",
  "exportedBy": "Kids Learning Space",
  "hubVersion": 2,
  "hub": {
    "version": 2,
    "profiles": [ /* full kls.progress.v2 contents */ ],
    "activeProfileId": "..."
  },
  "games": {
    "word-problem-adventure": {
      "<profileId-A>": "<opaque JSON string from wordProblemAdventure_v1__<A>>",
      "<profileId-B>": "<opaque JSON string from wordProblemAdventure_v1__<B>>"
    },
    "cosmic-math-quest":   { /* ... when CMQ becomes profile-scoped ... */ },
    "lets-learn-fractions":{ /* ... */ },
    "long-division-coach": { /* ... */ }
  }
}
```

Why structure `games` by slug → profileId:

- Self-describing: an importer running on a future version that has dropped
  or renamed a game can ignore unknown slugs without losing the rest.
- Per-game payload stays opaque to the backup layer — each game owns its own
  internal schema and migrations.
- Slug renames can be handled with a future slug-alias table inside the
  importer; the file format doesn't need to change.

`hubVersion` is recorded separately from `version` so the envelope shape and
the hub-data shape can evolve independently.

## Restore semantics — REPLACE

Restore **replaces everything** on this device with the contents of the
backup. This is the chosen mode (over merge / per-profile picker) because:

- A backup represents "the snapshot I want to return to", not "additions to
  blend in". Replace is the only mode that makes that guarantee.
- Predictable: kids on this device end up identical to the kids who exported
  the file.
- No merge-conflict UI to build, design, or explain.

Restore flow (reliable-save update, 2026-10-08):

1. Parse and validate the complete v1 envelope, v2 hub/profile shape, and
   JSON text for all game payloads. Reject unsupported or malformed data.
2. Show a preview with profile names, saved games, and unknown-game warnings.
   Require a separate **Replace all profiles and progress** button before
   applying any backup. File, browser, and folder restores share this preview;
   Undo/Redo also require a separate confirmation.
3. Flush/detach active games. Serialize restores, using Web Locks when
   available and a prepared-journal guard for profile writers.
4. Persist and read back `kls.restore.journal.v1`, containing exact current
   progress values and staged replacement values. If the browser cannot
   retain this mandatory safety copy, cancel without changing progress.
5. Replace only hub progress keys and registered profile-scoped game keys.
   Preserve preferences, folder handles, backup history, and standalone saves.
   Verify every resulting key/value before marking the journal committed.
6. On application failure, replay the prior values. If recovery cannot write,
   keep the journal and block gameplay/profile creation until recovery succeeds.
   Startup recovers expired interrupted journals before reading progress.
7. Retain the committed journal for Undo last restore (and Redo), then reload.
   This undo copy works even without IndexedDB. A separate Before restore
   timeline snapshot is attempted, but never replaces the mandatory journal.

localStorage has no multi-key database transaction. The journal provides
verified replacement, rollback, and crash recovery; it does not claim that
individual physical writes are atomic as a group. The safety copy temporarily
uses additional browser quota. Insufficient space cancels before mutation.

## UI surface

The **Parent page** (`#/parent`) has one **Progress & backups** card:

- Browser saving and the last confirmed folder backup have separate status.
- **Restore progress** lists the latest available backup, **Earlier backups**,
  and **Choose a backup file…**. Browser snapshots and launcher folder backups
  use the same read-only preview and explicit replacement confirmation.
- **Backup settings** contains **Download backup** and optional folder setup.
- **Undo restore** / **Redo restore** use the persistent safety journal.

The launcher is the recommended entry point. There is no manual save button
on the hub. The local server exposes a same-origin, read-only backup catalog
(`GET /__kls_backups__`) and allowlisted backup reads
(`GET /__kls_backups__/<id>`). IDs are `latest` or recognized history filenames;
client paths are never accepted. Catalogs skip unreadable files with a warning
and deduplicate identical payloads. Reading a backup does not apply it.

Before profile setup or snapshot scheduling, startup checks for missing browser
profiles and existing backups. If found (or folder listing fails), it shows
recovery with automatic writes paused. Only restoring or explicitly choosing
**Start fresh → Create new profiles** continues. Existing profiles open normally.
Direct HTML opening remains supported; old JSON backups remain importable.

## Failure modes & messages

| Situation | Behavior |
|---|---|
| Selected file isn't valid JSON | "Couldn't read this file. Is it the JSON backup we exported?" — no state change. |
| JSON is missing `type: 'kls.backup'` | "This file doesn't look like a Kids Learning Space backup." — no state change. |
| `version` is newer than this build supports | "This backup was made on a newer version. Please update the app first." — no state change. |
| `version` is older but known | Run the registered migration in `BACKUP_MIGRATIONS[fromVersion]` to reach current, then proceed. |
| `hub.version` is newer than current | Same handling as envelope version. |
| `games.<slug>` references a slug no longer in `GAMES` | Skip silently; log to console. The rest of the restore proceeds. |
| `games.<slug>` references a slug whose schema has changed | Pass through as-is; that game's own loader handles its internal migration on next open. |
| Backup contains profile ids that collide with existing ones | Not applicable — REPLACE wipes everything before writing. |

Validation and staging failures leave progress untouched. Application
failures roll back; a persistent storage failure retains the recovery copy
and blocks use of partial data. UI errors distinguish these outcomes instead
of claiming that nothing changed after every possible failure.

## Versioning rules

- `BACKUP_VERSION = 1` for the first shipping format.
- Bump when the **envelope** shape changes (new top-level field that
  importers need, restructuring of `games`, etc.).
- **Do not** bump when a game's own state shape changes — the backup layer
  treats game payloads as opaque strings, and each game handles its own
  migration the next time it loads.
- Bump `hubVersion` when `kls.progress.vN` itself changes; the importer
  needs to know which hub schema it's restoring.
- Every bump adds a one-way migration in `BACKUP_MIGRATIONS` from the
  previous version. Never remove an older migration.

## Implementation (shipped)

- `shared/scripts/backup.js` owns v1 envelopes, portable downloads, browser
  snapshots, folder mirroring, read-only restore catalogs/preflight, and the
  persistent restore journal. Older public save/import helpers are retained.
- `shared/scripts/hub.js` exposes the registered `GAMES[].storageBase` values
  and checks startup recovery before profile setup. Automatic snapshots start
  only after an active profile is ready.
- `shared/scripts/profile-ui.js` renders the unified Parent restore flow,
  inline Undo/Redo, backup settings, and first-time backup-file entry point.
- `tools/kls_server.py` writes the newest 30 folder backups and exposes
  same-origin catalog/read APIs. Launchers use `--open` for browser startup.
- `index.html` loads `backup.js` after `profile-ui.js` and before `hub.js`.

No changes were needed inside any individual game: the bridge already
exposes `getProfileId()`, and games read their own profile-scoped keys.
Restore writes those keys directly to `localStorage`; the game picks them
up on its next load.

All four current games register profile-scoped storage bases in GAMES,
including their mistakes stores. Arrays of bases are exported as maps of base
name to raw JSON for each profile; legacy single-base string payloads still
import. Their exact session checkpoint versions remain owned by the games.

## Out of scope (intentionally)

- **Cloud sync.** This is a local file the parent manages. No accounts, no
  servers — keeps the project file://-friendly.
- **Merge / per-profile import.** Considered and rejected (see "Restore
  semantics" above).
- **Encrypted backups.** The data is non-sensitive (a kid's star counts).
- **Auto-export before updates.** Tempting, but the app has no way to know
  when "an update" is happening — it's a static site loaded fresh every
  visit. Manual export is the contract.
- **Selective export** (one profile, one game). v1 is all-or-nothing.

## Test plan (when implemented)

1. Single profile, some stars, some stickers → export → wipe localStorage
   → import → all stars/stickers/journey state present, active profile is
   the same one.
2. Two profiles A and B → export → on a fresh browser, import → both
   profiles present, journey state intact for each.
3. Export → modify the JSON to set `version: 99` → import → friendly error,
   no state change.
4. Export → corrupt the JSON (truncate mid-string) → import → friendly
   error, no state change.
5. Export from app with games X, Y, Z → import on a future build that
   removed game Z → games X, Y restored; Z silently skipped; no error.
6. Open Word Problem Adventure on profile A → play and earn stars → switch
   to profile B → export → import the file back → profile A's stars in WPA
   are present, profile B's empty WPA state is also restored (i.e. B still
   shows zero, not A's data).
