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

Restore flow:

1. **Confirm destructively.** The Import button opens a dialog: "This will
   replace ALL profiles and progress on this device. Profiles currently on
   this device that are NOT in the backup will be deleted. Type REPLACE to
   continue." Two-step confirmation keeps kids from triggering it.
2. **Validate the envelope.**
   - `type === 'kls.backup'` — else: friendly "this doesn't look like a
     Kids Learning Space backup file" message; abort, no state change.
   - `version` is known to this build — else: friendly "this backup was made
     on a newer version of Kids Learning Space; update the app first" or
     run a version-N → version-current migration. Abort on unknown.
   - `hub.version` is known — same handling.
3. **Wipe.** Delete all `kls.*` keys; delete all keys matching any
   registered game's `<base>__<anything>` prefix.
4. **Write hub.** Store `kls.progress.v2` from `backup.hub`.
5. **Write game state.** For each `games.<slug>.<pid>` entry, write
   `<storageKeyBase(slug)>__<pid>` with the opaque payload.
6. **Reload.** Force a full page reload so every iframe re-reads the new
   state from scratch and the active profile id is re-pushed.

## UI surface

**Parent / Data Page** (`#/parent`, already routed in `hub.js`) gets two
cards:

- **Export all progress** → downloads `kls-backup-…json`. No confirmation
  needed; export is always safe.
- **Restore from backup** → opens a file picker, then the confirmation
  dialog described above.

The Parent page is the right home because it's the "grown-ups" section, low
risk of a kid accidentally tapping Import. The profile manager
(`#/profiles`) deliberately does **not** get these buttons — too easy to
mis-tap.

Empty-state copy: if there's only one profile and no stars yet, the Export
card explains "There's nothing to back up yet — come back after some
practice!" but the button still works.

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

The cardinal rule: **on any failure, the device's state must be unchanged**.
Wipe-and-write only begins after all validation has passed.

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

Implemented files:

- `shared/scripts/backup.js` — `window.KLS.backup` with:
  - `exportToFile()` → builds the envelope, triggers a Blob download, stores
    `kls.backup.lastExportedAt`.
  - `importFromFile(file)` → returns a Promise; on success the page reloads
    so iframes re-read state. Validation happens before any state change.
  - `getLastExportedAt()` for the hub nudge banner.
  - `BACKUP_VERSION = 1`.
- `shared/scripts/hub.js` — `GAMES` registry gained a `storageBase` field
  (set to `'wordProblemAdventure_v1'` on WPA). The `GAMES` array is exposed
  as `window.KLS.GAMES` for `backup.js` to discover keys. A "back up your
  data" nudge banner renders on the hub when the active profile has earned
  stars/stickers AND no export has been recorded in the last 7 days (or
  ever). Dismissal is sticky for 1 day.
- `shared/scripts/profile-ui.js` — Parent page's Backup & Restore card uses
  `window.KLS.backup`. Restore requires typing `REPLACE` to confirm. The
  old partial per-profile Export button was removed because it produced an
  incomplete backup (no per-game state).
- `index.html` — `<script src="shared/scripts/backup.js">` loads after
  `profile-ui.js` and before `hub.js`.

No changes were needed inside any individual game: the bridge already
exposes `getProfileId()`, and games read their own profile-scoped keys.
Restore writes those keys directly to `localStorage`; the game picks them
up on its next load.

Other games (Cosmic Math Quest, Let's Learn Fractions, Long Division Coach)
are not yet profile-scoped — their state is excluded from the backup until
they adopt `KLS.bridge.getProfileId()` and a `storageBase` is added to
their `GAMES` entry. Adding the field is the trigger that pulls a game's
data into future backups.

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
