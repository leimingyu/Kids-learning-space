# Feature Request: Quiet Backup ("The Quiet Combo")

**Status:** Shipped (Phase 1 + Phase 2) — see "Implemented" below. Tracks GitHub issue #1.
**Date:** 2026-07-03
**Builds on:** `BACKUP_RESTORE.md` (envelope format, REPLACE semantics, versioning rules — all unchanged)
**Replaces:** the hub's 💾 chip + popover menu, the "back up your data" nudge banner, and the habit of manually exporting `kls-backup-*.json` files.

## Implemented

All hub/shared-layer only; no game file was touched. `BACKUP_VERSION` stays `1`.

- `shared/scripts/backup.js` — the `kls-backup` IndexedDB is bumped to v2 with a
  `snapshots` object store (keyed by ISO `ts`). A debounced (~10 s) scheduler
  (`initSnapshots`) wires `KLS.progress.subscribe` + `storage` + `pagehide` /
  `visibilitychange:hidden`, dedupes identical payloads (`envelopePayloadEqual`),
  and thins with the Time-Machine policy (`thinSnapshots`: <24 h all / 24 h–30 d
  daily / monthly beyond / hard cap 60). `restoreSnapshot(ts)` writes a
  **"Before restore"** safety snapshot first, so timeline restore is undoable.
  Phase 2: `connectBackupFolder` / `getFolderStatus` / `mirrorAfterSnapshot`
  mirror `kls-backup-latest.json` + daily `kls-backup-YYYYMMDD.json` (pruned to
  14) to a chosen folder, throttled to ≤ 1 write/hour + one on `pagehide`;
  permission loss sets a silent reconnect flag.
- `shared/scripts/hub.js` — the 💾 chip/popover and the nudge banner are removed;
  the account-actions row is now just a quiet **👨‍👧 Parent page** link. `boot()`
  calls `KLS.backup.initSnapshots()`.
- `shared/scripts/profile-ui.js` — the Parent page renders a **Backups** status
  card, a **Restore from a moment…** timeline (Today / Yesterday / This week /
  Older, per-profile ⭐/🏆 from the snapshot), the Phase-2 folder row, and quiet
  Export / Import links (import keeps the type-REPLACE confirmation).
- `shared/styles/components.css` — dead `.hub__nudge*` / `.hub__quick-*` popover
  styles removed; `.parent-backup*` / `.timeline*` / `.hub__parent-link` added.
- Pure helpers are unit-tested in `tests/smoke-backup-snapshots.mjs`; the full
  snapshot → dedupe → restore → undo pipeline was verified in a browser.

## One-sentence pitch

Backup stops being a feature the parent operates and becomes a property the
app has: versioned snapshots happen silently in the background, an optional
backup folder mirrors them to disk, and the only visible surface is a calm
restore timeline on the Parent page — the Time Machine model.

## Problem

The current backup flow works but is an engineer's backup:

1. **It's manual.** A parent must remember to click "Save now". Forgetting
   for a week triggers a nag banner — the app outsources its own job.
2. **It's a file dance.** Timestamped JSON files, save-file pickers,
   choose-a-folder dialogs. Files pile up in Downloads (and, historically,
   in this repo).
3. **The UI is busy.** A persistent "💾 Saved 2m ago ▾" chip with a
   four-item popover, plus a dismissable nudge banner, on a hub whose
   primary users are children.
4. **No history.** Only "latest export" exists. There is no way to answer
   "restore Emma to how she was yesterday, before her brother reset her
   journey."

## Design principle

> The user should see backup UI at exactly one moment: when they want
> the past back. Everything else is silent.

macOS is the reference: Time Machine backs up hourly with zero interaction;
System Settings shows one status line; the browsing UI appears only when you
enter Time Machine to restore.

---

## Phase 1 — Silent snapshots + restore timeline (shippable on its own)

### What the user experiences

- Nothing on the hub. The 💾 chip, its popover, and the nudge banner are
  **removed**.
- The Parent page (`#/parent`) gets one calm status card:

  > **Backups · On**
  > Last snapshot 2 minutes ago · 14 moments kept
  > [ Restore from a moment… ]

- "Restore from a moment…" opens a timeline grouped **Today / Yesterday /
  This week / Older**. Each entry is a *moment*:

  > **4:12 PM** — Emma ⭐ 34 🏆 3 · Leo ⭐ 12 🏆 1

  Per-profile star/sticker counts come from the snapshot itself, so the
  timeline doubles as each kid's progress history at a glance.
- Tapping a moment shows its detail and a single **Restore** button with a
  plain-language dialog: *"Go back to Tuesday 4:12 PM? Everything will look
  exactly as it did then."* Confirm is a distinct destructive-styled button
  ("Replace everything"), not a type-REPLACE prompt (see Safety below —
  restore becomes undoable, so the heavyweight confirmation is no longer
  earning its friction).

### Behavior

- **Trigger.** A snapshot is scheduled whenever persisted state changes:
  - `KLS.progress` write events (the hub already has a subscribe hook), and
  - `storage` events from game iframes writing their profile-scoped keys
    (same-origin iframes fire `storage` on the parent window), and
  - `pagehide` / `visibilitychange: hidden` as a final catch-all.
  Writes are debounced (~10 s after the last change) so a play session
  produces a handful of moments, not hundreds.
- **Dedupe.** If the new snapshot's payload is identical to the most recent
  one, skip it. No-op churn never creates moments.
- **Payload.** Exactly the existing `kls.backup` v1 envelope from
  `backup.js` (`buildEnvelope()` — hub blob + every game's profile-scoped
  keys). One envelope per snapshot. No new format, no `BACKUP_VERSION`
  bump.
- **Storage.** IndexedDB — the `kls-backup` database `backup.js` already
  opens (currently stores only the directory handle) gains a `snapshots`
  object store keyed by ISO timestamp.
- **Retention (Time Machine thinning).** On every write, prune to:
  - all snapshots from the last 24 hours (bounded by the debounce),
  - the last snapshot of each day for 30 days,
  - the last snapshot of each month beyond that,
  - hard cap: 60 snapshots total (oldest thinned first).
- **Safety snapshot before restore.** Restoring first writes a snapshot of
  the *current* state labelled "Before restore". Restore is therefore
  always undoable via the same timeline — this is what lets the
  confirmation dialog relax.
- **Restore mechanics.** Unchanged from `BACKUP_RESTORE.md`: validate →
  wipe → write hub → write game keys → full reload. The importer is the
  existing one; a snapshot is just an envelope that never became a file.

### What is kept from the old surface

- **Export a file… / Import a file…** remain as two quiet text links at the
  bottom of the Parent page card. They are the escape hatch for moving to a
  new device and the only off-device path on Safari/Firefox. The import
  path keeps its stronger confirmation (it can come from anywhere).

### Degradation

- No IndexedDB (rare; some `file://` contexts, private mode) → the status
  card says "Automatic backups aren't available in this browser" and the
  Export/Import links remain. Nothing else breaks.

---

## Phase 2 — Optional backup folder mirror (Chrome/Edge only)

### What the user experiences

One additional row on the same Parent page card, shown only when
`showDirectoryPicker` exists:

> **Keep backup files in a folder** — for surviving a browser wipe or
> moving to a new Mac. [ Choose folder… ]

After choosing once:

> **Folder connected** · `~/Backups/Kids Learning Space` · updated today

No other UI, ever. If the browser revokes permission (it sometimes does
after a restart), mirroring pauses silently and this row — only this row —
shows "Reconnect folder…". Never a popup, never anything on the hub.

### Behavior

> **Update (2026-07-03, save-history-to-folder):** the mirror now writes a
> versioned **save history** instead of coarse daily files, and gains a manual
> **💾 Save to folder now** button. See
> `docs/superpowers/specs/2026-07-03-save-history-to-folder-design.md`.
>
> **Update (2026-07-03, auto-save-server):** the **primary** save-to-folder
> mechanism is now the launcher's local server (`tools/kls_server.py`), which
> writes into the app folder automatically in any browser with no folder-picker.
> The File System Access folder mirror below is the **fallback** when no server
> is running. See `docs/superpowers/specs/2026-07-03-auto-save-server-decision.md`.
>
> **Update (2026-07-03, save-my-game):** the on-disk folder is renamed
> `saves/` → **`saved_status/`**, and a **💾 Save my game** button (`saveMyGame()`)
> writes into a `saved_status` folder using the best method the browser allows —
> save server → File System Access folder (picked once) → download — so the
> double-click (`file://`) case gets a real folder where the browser permits it,
> and a download otherwise. See
> `docs/superpowers/specs/2026-07-03-save-my-game-download-design.md`.

- After each autosave snapshot (throttled to at most one folder write / 3 min,
  plus one on `pagehide`), and immediately on manual **Save to folder now**
  (`saveHistoryNow()`, no throttle), write to the connected folder:
  - `kls-backup-latest.json` — always the newest envelope (stable name).
  - `saves/kls-save-<YYYYMMDD-HHmmss>.json` — one file per save; newest **30**
    kept, older pruned (`MIRROR_HISTORY_KEEP`).
- Reuses the persisted directory handle + `connectBackupFolder()` from
  `backup.js`; permission is re-checked with `queryPermission` before each
  write and failure is silent (status row shows "Reconnect folder…").
- Restoring from a mirrored file uses the existing Import path — a mirror
  file *is* a normal backup file.

---

## What gets deleted

| Surface | Fate |
|---|---|
| Hub 💾 "Saved Nm ago ▾" chip + popover (Save now / Import / Choose folder / Parent) | **Removed** — hub renders no backup UI at all |
| Nudge banner ("back up your data") + its dismissal key | **Removed** |
| `kls.backup.lastExportedAt` nudge bookkeeping | Kept internally (shown as "last snapshot / last export" on Parent page), no longer drives any banner |
| Manual Export / Import | Kept, demoted to quiet links on the Parent page |
| Type-REPLACE confirmation | Kept for **file import**; replaced by dialog + auto safety-snapshot for **timeline restore** |

## Non-goals (unchanged from BACKUP_RESTORE.md, plus)

- No cloud sync, no accounts, no encryption.
- No merge restore — REPLACE only.
- No auto-download fallback on Safari/Firefox (that re-creates the file
  dance; manual export covers those browsers).
- No per-profile "passport" export in this feature (noted as a possible
  future companion; the snapshot envelope already contains per-profile
  data, so nothing here blocks it).

## Compatibility notes

- Envelope format is untouched → `BACKUP_VERSION` stays 1; old exported
  files import fine; new mirror files import fine on old builds.
- `hub.js` `GAMES[].storageBase` registration remains the discovery
  mechanism for per-game keys — unchanged contract for adding games.
- Games are untouched. This is entirely hub/shared-layer work
  (`backup.js`, `hub.js`, `profile-ui.js`, `components.css`).

## Acceptance criteria

1. Fresh profile plays a game → within ~10 s of the last change a snapshot
   exists; hub shows no backup UI anywhere.
2. Timeline lists moments with correct per-profile ⭐/🏆 summaries; restoring
   a moment reproduces that exact state after reload.
3. Restoring creates a "Before restore" moment that can itself be restored
   (round-trip undo).
4. 100 rapid progress changes produce ≤ a handful of moments (debounce +
   dedupe), and retention never exceeds 60 snapshots.
5. With a folder connected (Chrome): `kls-backup-latest.json` updates
   within the throttle window; revoking permission produces no popup and
   the Parent page shows "Reconnect folder…".
6. Safari: everything in 1–4 works; the folder row is absent; Export/Import
   links work.
7. A pre-feature `kls-backup-*.json` file still imports successfully.

## Test plan additions

Extend the `BACKUP_RESTORE.md` test plan with: snapshot-after-change,
thinning boundaries (24 h / 30 d / cap), dedupe on no-op, safety-snapshot
round-trip, permission-revoked mirroring, and Safari degradation.

## Rollout

Phase 1 ships alone and is complete on its own terms. Phase 2 follows once
Phase 1 has survived a week of family use. If Phase 2 is never built, the
manual Export link remains the off-device path — no dead ends.
