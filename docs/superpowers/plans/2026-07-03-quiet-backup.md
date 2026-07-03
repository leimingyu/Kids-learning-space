# Quiet Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make backup a silent property of the app — versioned IndexedDB snapshots taken automatically on every real state change, surfaced only as a calm restore timeline on the Parent page, with an optional Chrome/Edge backup-folder mirror. Remove all backup UI from the hub.

**Architecture:** Extend `shared/scripts/backup.js` (which already owns the envelope + the `kls-backup` IndexedDB) with a `snapshots` object store (IDB v1→v2), a debounced snapshot scheduler wired to `progress.subscribe` + `storage` + `pagehide`, Time-Machine retention thinning, undoable snapshot-restore (auto "Before restore" safety snapshot), and a throttled folder mirror. The hub's 💾 chip/popover/nudge are deleted; the Parent page (`profile-ui.js`) gains a status card + restore timeline + folder row + quiet Export/Import links. Pure helpers are unit-tested in Node; IDB/DOM/folder paths are verified in a real browser.

**Tech Stack:** Vanilla ES5-style IIFE JS (no build), IndexedDB, File System Access API (`showDirectoryPicker`), Node's `assert` for the smoke test (matches the existing `games/cosmic-math-quest/tests/*.mjs` pattern: `eval` the source into a faked `window`).

## Global Constraints

- Envelope format is UNCHANGED. `BACKUP_VERSION` stays `1`. Old exported files must still import; new files must import on old builds. (`FEATURE_QUIET_BACKUP.md` Compatibility notes.)
- Snapshot payload = exactly the existing `buildEnvelope()` output. No new payload format.
- Browser baseline: Chrome 111+, Safari 15.4+, Firefox 113+. Phase-2 folder UI only appears when `typeof window.showDirectoryPicker === 'function'`.
- Every game opened directly from `games/<slug>/index.html` must still work — this feature is hub/shared-layer only; touch NO game file.
- Degrade gracefully: no IndexedDB → status card says automatic backups aren't available; Export/Import links still work; nothing throws.
- Device-level prefs (mute/volume/theme) are never in a snapshot (they're not in the envelope — nothing to do, just don't add them).
- Timeline restore uses a plain destructive confirm (NOT type-REPLACE) because it auto-writes a "Before restore" safety snapshot first. File **import** keeps the type-REPLACE prompt.
- No `Date.now()`/`Math.random()`/argless `new Date()` inside the Node test's pure-function assertions relying on determinism — pass `now` explicitly to the pure helpers so tests are deterministic. (Production code may use `new Date()`.)

## File Structure

- **Modify** `shared/scripts/backup.js` — add: IDB v2 `snapshots` store; pure helpers `summarizeEnvelope`, `envelopePayloadEqual`, `thinSnapshots`, `groupSnapshotsByPeriod`; snapshot store ops `putSnapshot`/`listSnapshots`/`deleteSnapshots`/`getSnapshot`; scheduler `initSnapshots`/`scheduleSnapshot`/`takeSnapshotNow`; `restoreFromEnvelope` + `restoreSnapshot`; Phase-2 `mirrorToFolder` + folder status helpers. Expose new API on `window.KLS.backup`, plus `window.KLS.backup._internals` for tests.
- **Modify** `shared/scripts/hub.js` — delete `shouldNudgeBackup`/`dismissNudgeForToday`/`renderBackupNudge` and its call; reduce `renderAccountActions` to a single quiet "Parent" link (no backup UI); call `KLS.backup.initSnapshots()` in `boot()`.
- **Modify** `shared/scripts/profile-ui.js` — replace the "Backup & Restore" card in `renderParent()` with: a Backups status card, an async-loaded restore timeline, a Phase-2 folder row, and quiet Export/Import links.
- **Modify** `shared/styles/components.css` — remove `.hub__nudge*` and the `.hub__quick-*` popover styles (verify no other users first); add `.parent-backup*` / `.timeline*` styles.
- **Create** `tests/smoke-backup-snapshots.mjs` — Node unit tests for the four pure helpers.
- **Modify** `FEATURE_QUIET_BACKUP.md` (status → Shipped + Implemented section) and `CLAUDE.md` (add the second test command).

---

### Task 1: Pure helpers + Node smoke test (TDD)

**Files:**
- Modify: `shared/scripts/backup.js` (add pure helpers + `_internals` export)
- Test: `tests/smoke-backup-snapshots.mjs` (create)

**Interfaces:**
- Produces (all pure, no IDB/DOM):
  - `summarizeEnvelope(envelope) → { profiles: [{id,name,avatar,stars,stickers}], totalStars, totalStickers }`
  - `envelopePayloadEqual(a, b) → boolean` (compares `{hub,games}`, ignores `exportedAt`/`exportedBy`)
  - `thinSnapshots(records, now) → string[]` (ts keys to DELETE). `records`: `[{ts:ISOstring, label?}]`. Rules: keep all < 24h old; 24h–30d keep last-of-local-day; >30d keep last-of-local-month; then hard-cap 60 (delete oldest surplus). Never returns the newest ts.
  - `groupSnapshotsByPeriod(records, now) → { today, yesterday, thisWeek, older }` each an array sorted newest-first.
- These are attached to `window.KLS.backup._internals`.

- [ ] **Step 1: Write the failing test** — create `tests/smoke-backup-snapshots.mjs`:

```js
/**
 * Smoke tests for backup.js snapshot pure helpers (no browser).
 * Run: node tests/smoke-backup-snapshots.mjs
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

globalThis.window = globalThis;
const code = readFileSync(join(root, 'shared/scripts/backup.js'), 'utf8');
eval(code);

const B = globalThis.window.KLS.backup._internals;

// 1) summarizeEnvelope: per-profile stars/stickers from hub blob
const env = {
  type: 'kls.backup', version: 1,
  hub: {
    version: 2,
    profiles: [
      { id: 'a', displayName: 'Emma', avatar: '🦊',
        games: { g1: { levels: { l1: { stars: 3 }, l2: { stars: 2 } }, stickers: ['s1', 's2'] } } },
      { id: 'b', displayName: 'Leo', avatar: '🐼',
        games: { g1: { levels: { l1: { stars: 1 } }, stickers: ['s3'] } } },
    ],
  },
  games: {},
};
const sum = B.summarizeEnvelope(env);
assert.strictEqual(sum.profiles.length, 2);
const emma = sum.profiles.find((p) => p.id === 'a');
assert.strictEqual(emma.stars, 5);
assert.strictEqual(emma.stickers, 2);
assert.strictEqual(emma.name, 'Emma');
assert.strictEqual(sum.totalStars, 6);
assert.strictEqual(sum.totalStickers, 3);

// summarizeEnvelope tolerates missing/empty hub
assert.deepStrictEqual(B.summarizeEnvelope({}), { profiles: [], totalStars: 0, totalStickers: 0 });

// 2) envelopePayloadEqual: ignores exportedAt, sees real diffs
const e1 = { exportedAt: '2026-01-01T00:00:00Z', hub: { a: 1 }, games: { g: { p: 'x' } } };
const e2 = { exportedAt: '2026-02-02T00:00:00Z', hub: { a: 1 }, games: { g: { p: 'x' } } };
const e3 = { exportedAt: '2026-01-01T00:00:00Z', hub: { a: 2 }, games: { g: { p: 'x' } } };
assert.strictEqual(B.envelopePayloadEqual(e1, e2), true);
assert.strictEqual(B.envelopePayloadEqual(e1, e3), false);

// 3) thinSnapshots retention
const now = new Date('2026-07-03T12:00:00Z').getTime();
const H = 3600 * 1000, D = 24 * H;
function rec(ms, label) { return { ts: new Date(now - ms).toISOString(), label: label }; }
// last 24h: all kept
const recent = [rec(1 * H), rec(2 * H), rec(3 * H)];
assert.deepStrictEqual(B.thinSnapshots(recent, now), []);
// two on same day, 5 days ago → keep only the last (newest) of that day
const sameDay = [rec(5 * D), rec(5 * D + 2 * H), rec(1 * H)];
const del = B.thinSnapshots(sameDay, now);
assert.strictEqual(del.length, 1);
assert.strictEqual(del[0], rec(5 * D + 2 * H).ts); // older-of-day deleted
// newest is never deleted
assert.ok(!del.includes(rec(1 * H).ts));
// hard cap 60: 70 daily snapshots (one per day) → 10 oldest deleted
const many = [];
for (let i = 0; i < 70; i++) many.push(rec(i * D + 1 * H));
const delMany = B.thinSnapshots(many, now);
assert.ok(delMany.length >= 10, 'expected >=10 deletions to reach cap 60, got ' + delMany.length);
assert.ok(many.length - delMany.length <= 60);

// 4) groupSnapshotsByPeriod buckets
const groups = B.groupSnapshotsByPeriod(
  [rec(1 * H), rec(28 * H), rec(3 * D), rec(20 * D)], now);
assert.strictEqual(groups.today.length, 1);
assert.strictEqual(groups.yesterday.length, 1);
assert.strictEqual(groups.thisWeek.length, 1);
assert.strictEqual(groups.older.length, 1);
// newest-first within a bucket
const twoToday = B.groupSnapshotsByPeriod([rec(1 * H), rec(2 * H)], now).today;
assert.ok(new Date(twoToday[0].ts).getTime() > new Date(twoToday[1].ts).getTime());

console.log('smoke-backup-snapshots: OK');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/smoke-backup-snapshots.mjs`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'summarizeEnvelope')` (`_internals` not defined yet).

- [ ] **Step 3: Implement the four pure helpers in `backup.js`**

Add these functions inside the IIFE (before the `window.KLS.backup = {...}` assignment). They must not reference IDB/DOM.

```js
  // ──────────────────────────────────────────────────────────────────────
  // Snapshot pure helpers (unit-tested in tests/smoke-backup-snapshots.mjs)
  // ──────────────────────────────────────────────────────────────────────

  /** Per-profile ⭐/🏆 rollup straight from an envelope's hub blob. */
  function summarizeEnvelope(envelope) {
    const hub = envelope && envelope.hub;
    const profiles = (hub && Array.isArray(hub.profiles)) ? hub.profiles : [];
    let totalStars = 0, totalStickers = 0;
    const out = profiles.map(function (p) {
      let stars = 0, stickers = 0;
      const games = (p && p.games) || {};
      Object.keys(games).forEach(function (slug) {
        const g = games[slug] || {};
        stickers += ((g.stickers || []).length);
        const levels = g.levels || {};
        Object.keys(levels).forEach(function (lv) { stars += (levels[lv].stars || 0); });
      });
      totalStars += stars; totalStickers += stickers;
      return { id: p.id, name: p.displayName || 'Friend', avatar: p.avatar || '🦊', stars: stars, stickers: stickers };
    });
    return { profiles: out, totalStars: totalStars, totalStickers: totalStickers };
  }

  /** Payload equality for dedupe — ignores volatile envelope metadata. */
  function envelopePayloadEqual(a, b) {
    if (!a || !b) return a === b;
    try {
      return JSON.stringify({ hub: a.hub, games: a.games }) === JSON.stringify({ hub: b.hub, games: b.games });
    } catch (e) { return false; }
  }

  function startOfLocalDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function localDayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function localMonthKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1); }

  /**
   * Time-Machine thinning. Input: records [{ts:ISO,...}] (any order).
   * Output: array of ts strings to DELETE. Keeps: all < 24h; last-of-day for
   * 24h–30d; last-of-month beyond; hard cap 60 (oldest surplus removed).
   * The single newest record is never deleted.
   */
  function thinSnapshots(records, now) {
    const HOUR = 3600 * 1000, DAY = 24 * HOUR;
    const sorted = records.slice().sort(function (a, b) {
      return new Date(a.ts).getTime() - new Date(b.ts).getTime();
    }); // ascending (oldest first)
    if (sorted.length === 0) return [];
    const newestTs = sorted[sorted.length - 1].ts;
    const keep = new Set();
    const lastByDay = {}, lastByMonth = {};
    sorted.forEach(function (r) {
      const t = new Date(r.ts).getTime();
      const age = now - t;
      if (age < DAY) { keep.add(r.ts); return; }
      if (age < 30 * DAY) { lastByDay[localDayKey(t)] = r.ts; return; }
      lastByMonth[localMonthKey(t)] = r.ts;
    });
    Object.keys(lastByDay).forEach(function (k) { keep.add(lastByDay[k]); });
    Object.keys(lastByMonth).forEach(function (k) { keep.add(lastByMonth[k]); });
    keep.add(newestTs);
    // Hard cap 60: keep the 60 newest of the survivors.
    let survivors = sorted.filter(function (r) { return keep.has(r.ts); });
    if (survivors.length > 60) {
      const capped = survivors.slice(survivors.length - 60); // newest 60
      const cappedSet = new Set(capped.map(function (r) { return r.ts; }));
      survivors.forEach(function (r) { if (!cappedSet.has(r.ts)) keep.delete(r.ts); });
    }
    return sorted.filter(function (r) { return !keep.has(r.ts); }).map(function (r) { return r.ts; });
  }

  /** Bucket records into Today / Yesterday / This week / Older (newest-first). */
  function groupSnapshotsByPeriod(records, now) {
    const DAY = 24 * 3600 * 1000;
    const todayStart = startOfLocalDay(now);
    const yesterdayStart = todayStart - DAY;
    const weekStart = todayStart - 6 * DAY; // last 7 calendar days incl today
    const out = { today: [], yesterday: [], thisWeek: [], older: [] };
    records.slice().sort(function (a, b) {
      return new Date(b.ts).getTime() - new Date(a.ts).getTime(); // newest-first
    }).forEach(function (r) {
      const t = new Date(r.ts).getTime();
      if (t >= todayStart) out.today.push(r);
      else if (t >= yesterdayStart) out.yesterday.push(r);
      else if (t >= weekStart) out.thisWeek.push(r);
      else out.older.push(r);
    });
    return out;
  }
```

Then extend the public API assignment to expose an `_internals` bag (add alongside the existing keys):

```js
  window.KLS.backup = {
    exportToFile: exportToFile,
    importFromFile: importFromFile,
    getLastExportedAt: getLastExportedAt,
    pickBackupFolder: pickBackupFolder,
    hasBackupFolder: hasBackupFolder,
    supportsDirectoryPicker: supportsDirectoryPicker,
    BACKUP_VERSION: BACKUP_VERSION,
    _internals: {
      summarizeEnvelope: summarizeEnvelope,
      envelopePayloadEqual: envelopePayloadEqual,
      thinSnapshots: thinSnapshots,
      groupSnapshotsByPeriod: groupSnapshotsByPeriod,
      buildEnvelope: buildEnvelope,
    },
  };
```

(Snapshot/scheduler/restore/mirror API keys are added in Tasks 2–5; keep this object and append to it.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/smoke-backup-snapshots.mjs`
Expected: `smoke-backup-snapshots: OK`

- [ ] **Step 5: Run the existing test to confirm no regression**

Run: `node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs`
Expected: `smoke-learning-intelligence: OK`

- [ ] **Step 6: Commit**

```bash
git add shared/scripts/backup.js tests/smoke-backup-snapshots.mjs
git commit -m "feat(backup): snapshot pure helpers (summarize/dedupe/thin/group) + node test"
```

---

### Task 2: IndexedDB `snapshots` store + store ops

**Files:**
- Modify: `shared/scripts/backup.js`

**Interfaces:**
- Consumes: `openHandleDB` (existing), `IDB_NAME` (existing).
- Produces (all Promises, best-effort/never-throw to callers):
  - `putSnapshot(record) → Promise<void>` — `record = { ts, label, envelope, summary }`, keyPath `ts`.
  - `listSnapshots() → Promise<[{ts,label,summary}]>` — metadata only (no envelope), newest-first.
  - `getSnapshot(ts) → Promise<record|null>` — full record incl. envelope.
  - `deleteSnapshots(tsArray) → Promise<void>`.
  - `snapshotsAvailable() → boolean` — `typeof indexedDB !== 'undefined'`.

- [ ] **Step 1: Bump the IDB schema to v2 and add the store constant**

Change the store constant block and `openHandleDB`:

```js
  const IDB_NAME = 'kls-backup';
  const IDB_STORE = 'handles';
  const IDB_SNAP_STORE = 'snapshots';
  const IDB_VERSION = 2;
```

```js
  function openHandleDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no IDB')); return; }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        if (!db.objectStoreNames.contains(IDB_SNAP_STORE)) db.createObjectStore(IDB_SNAP_STORE, { keyPath: 'ts' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
```

- [ ] **Step 2: Add the snapshot store ops** (after the existing `idbDelete`)

```js
  function snapshotsAvailable() { return typeof indexedDB !== 'undefined'; }

  async function putSnapshot(record) {
    try {
      const db = await openHandleDB();
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_SNAP_STORE, 'readwrite');
        tx.objectStore(IDB_SNAP_STORE).put(record);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    } catch (e) { /* best-effort */ }
  }

  /** List metadata only (ts, label, summary) — envelopes are heavy. */
  async function listSnapshots() {
    try {
      const db = await openHandleDB();
      return await new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_SNAP_STORE, 'readonly');
        const req = tx.objectStore(IDB_SNAP_STORE).getAll();
        req.onsuccess = function () {
          const list = (req.result || []).map(function (r) {
            return { ts: r.ts, label: r.label || null, summary: r.summary || null };
          });
          list.sort(function (a, b) { return new Date(b.ts).getTime() - new Date(a.ts).getTime(); });
          resolve(list);
        };
        req.onerror = function () { reject(req.error); };
      });
    } catch (e) { return []; }
  }

  async function getSnapshot(ts) {
    try {
      const db = await openHandleDB();
      return await new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_SNAP_STORE, 'readonly');
        const req = tx.objectStore(IDB_SNAP_STORE).get(ts);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    } catch (e) { return null; }
  }

  async function deleteSnapshots(tsArray) {
    if (!tsArray || !tsArray.length) return;
    try {
      const db = await openHandleDB();
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_SNAP_STORE, 'readwrite');
        const store = tx.objectStore(IDB_SNAP_STORE);
        tsArray.forEach(function (ts) { store.delete(ts); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    } catch (e) { /* best-effort */ }
  }
```

- [ ] **Step 3: Verify the Node test still passes** (store ops are IDB-guarded, not evaluated at load)

Run: `node tests/smoke-backup-snapshots.mjs`
Expected: `smoke-backup-snapshots: OK` (no regression — new code is function definitions only).

- [ ] **Step 4: Commit**

```bash
git add shared/scripts/backup.js
git commit -m "feat(backup): add IndexedDB snapshots object store (IDB v2) + store ops"
```

---

### Task 3: Snapshot scheduler + restore-from-snapshot

**Files:**
- Modify: `shared/scripts/backup.js`

**Interfaces:**
- Consumes: `buildEnvelope`, `summarizeEnvelope`, `envelopePayloadEqual`, `thinSnapshots`, `putSnapshot`, `listSnapshots`, `getSnapshot`, `deleteSnapshots`, `snapshotsAvailable`, `wipeAppKeys`, `writeFromEnvelope` (all existing/earlier).
- Produces (new public API):
  - `initSnapshots() → void` — idempotent; wires `progress.subscribe` + `storage` + `pagehide`/`visibilitychange`, and takes one catch-up snapshot if state is non-empty.
  - `takeSnapshotNow({ label }) → Promise<boolean>` — build → dedupe vs newest → put → thin → (Task 5) mirror. Returns true if a snapshot was written.
  - `restoreSnapshot(ts) → Promise<void>` — write "Before restore" safety snapshot of CURRENT state, then wipe+write+reload from the stored envelope.
  - `getSnapshotsMeta() → Promise<[{ts,label,summary}]>` — thin wrapper over `listSnapshots`.
  - `getLastSnapshotAt() → Promise<string|null>`.

- [ ] **Step 1: Add the scheduler + snapshot writer** (after the store ops)

```js
  // ──────────────────────────────────────────────────────────────────────
  // Auto-snapshot scheduler
  // ──────────────────────────────────────────────────────────────────────
  const SNAPSHOT_DEBOUNCE_MS = 10000;
  let snapTimer = null;
  let snapWiredUp = false;

  function envelopeIsEmpty(env) {
    return !env.hub && Object.keys(env.games || {}).length === 0;
  }

  function scheduleSnapshot() {
    if (!snapshotsAvailable()) return;
    if (snapTimer) clearTimeout(snapTimer);
    snapTimer = setTimeout(function () { snapTimer = null; takeSnapshotNow({}); }, SNAPSHOT_DEBOUNCE_MS);
  }

  async function takeSnapshotNow(opts) {
    if (!snapshotsAvailable()) return false;
    const label = (opts && opts.label) || null;
    const envelope = buildEnvelope();
    if (envelopeIsEmpty(envelope) && !label) return false; // nothing to back up
    // Dedupe against the newest existing snapshot (unless this is a labelled
    // safety snapshot, which we always want).
    if (!label) {
      const newest = (await listSnapshots())[0];
      if (newest) {
        const full = await getSnapshot(newest.ts);
        if (full && envelopePayloadEqual(full.envelope, envelope)) return false;
      }
    }
    const record = {
      ts: new Date().toISOString(),
      label: label,
      envelope: envelope,
      summary: summarizeEnvelope(envelope),
    };
    await putSnapshot(record);
    // Retention thinning.
    const all = await listSnapshots();
    const toDelete = thinSnapshots(all, Date.now());
    if (toDelete.length) await deleteSnapshots(toDelete);
    // Phase 2 mirror (defined in Task 5; guarded no-op until then).
    if (typeof mirrorAfterSnapshot === 'function') { mirrorAfterSnapshot(envelope, false); }
    return true;
  }

  function initSnapshots() {
    if (snapWiredUp) return;
    snapWiredUp = true;
    if (!snapshotsAvailable()) return;
    // Trigger 1: hub progress writes.
    try {
      if (window.KLS && window.KLS.progress && window.KLS.progress.subscribe) {
        window.KLS.progress.subscribe(function () { scheduleSnapshot(); });
      }
    } catch (e) { /* ignore */ }
    // Trigger 2: same-origin game iframes writing their profile-scoped keys.
    try {
      window.addEventListener('storage', function (ev) {
        if (ev.key === null || (typeof ev.key === 'string' && isAppKey(ev.key))) scheduleSnapshot();
      });
    } catch (e) { /* ignore */ }
    // Trigger 3: final catch-all when the tab is going away.
    function flushOnExit() {
      if (snapTimer) { clearTimeout(snapTimer); snapTimer = null; }
      takeSnapshotNow({});
      if (typeof mirrorAfterSnapshot === 'function') { mirrorAfterSnapshot(buildEnvelope(), true); }
    }
    try { window.addEventListener('pagehide', flushOnExit); } catch (e) { /* ignore */ }
    try {
      window.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flushOnExit();
      });
    } catch (e) { /* ignore */ }
    // Catch-up: ensure at least one snapshot exists for existing progress.
    scheduleSnapshot();
  }

  /** Is `key` owned by this app (hub key or a registered game base)? */
  function isAppKey(key) {
    if (key.startsWith('kls.')) return true;
    return gamesWithStorage().some(function (g) {
      return basesOf(g).some(function (b) { return key.startsWith(b + '__'); });
    });
  }
```

- [ ] **Step 2: Add restore-from-snapshot + extract a shared restore path**

Refactor `importFromFile` to reuse a new `restoreFromEnvelope`, and add `restoreSnapshot`:

```js
  /** Shared REPLACE restore: wipe → write → full reload. Envelope must be
   *  pre-validated by the caller. */
  function restoreFromEnvelope(envelope) {
    wipeAppKeys();
    writeFromEnvelope(envelope);
    location.hash = '';
    location.reload();
  }
```

Change `importFromFile` body to call it:

```js
  function importFromFile(file) {
    return parseFile(file).then(function (envelope) {
      restoreFromEnvelope(envelope);
    });
  }
```

Add:

```js
  /** Undoable timeline restore: snapshot current state as "Before restore",
   *  then REPLACE with the chosen snapshot's envelope. */
  async function restoreSnapshot(ts) {
    const record = await getSnapshot(ts);
    if (!record || !record.envelope) throw new Error("That moment couldn't be found.");
    validate(record.envelope); // defensive; snapshots are our own envelopes
    // Safety snapshot of the CURRENT state, awaited so it survives the reload.
    await takeSnapshotNow({ label: 'Before restore' });
    restoreFromEnvelope(record.envelope);
  }

  async function getSnapshotsMeta() { return listSnapshots(); }
  async function getLastSnapshotAt() {
    const list = await listSnapshots();
    return list.length ? list[0].ts : null;
  }
```

- [ ] **Step 3: Expose the new API** — append to the `window.KLS.backup = {...}` object:

```js
    initSnapshots: initSnapshots,
    takeSnapshotNow: takeSnapshotNow,
    restoreSnapshot: restoreSnapshot,
    getSnapshotsMeta: getSnapshotsMeta,
    getLastSnapshotAt: getLastSnapshotAt,
    snapshotsAvailable: snapshotsAvailable,
```

- [ ] **Step 4: Run both Node tests** (confirm nothing at load-time throws in the faked window)

Run: `node tests/smoke-backup-snapshots.mjs && node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs`
Expected: both print `... OK`. (`initSnapshots` is NOT called at load, so `window.addEventListener`/`document` are never touched by the eval.)

- [ ] **Step 5: Commit**

```bash
git add shared/scripts/backup.js
git commit -m "feat(backup): debounced auto-snapshot scheduler + undoable snapshot restore"
```

---

### Task 4: Remove hub backup UI + wire `initSnapshots()`

**Files:**
- Modify: `shared/scripts/hub.js`

**Interfaces:**
- Consumes: `KLS.backup.initSnapshots` (Task 3).
- Produces: hub renders zero backup UI; a single quiet "Parent" link remains in `#hub-account-actions`.

- [ ] **Step 1: Delete the nudge code** — remove `shouldNudgeBackup`, `dismissNudgeForToday`, `renderBackupNudge` (hub.js ~174–230) and the `renderBackupNudge(hub);` call in `renderHub` (~273).

- [ ] **Step 2: Replace `renderAccountActions`** (hub.js ~279–357) with a minimal quiet Parent link (no backup status, no popover, no file input):

```js
  /** The hub renders no backup UI (Quiet Backup). The only thing left in the
   *  account-actions row is a quiet link to the grown-ups Parent page, which
   *  now hosts the restore timeline. */
  function renderAccountActions() {
    const slot = qs('#hub-account-actions');
    if (!slot) return;
    slot.innerHTML = '';
    slot.append(
      el('a', { class: 'hub__parent-link', href: '#/parent' }, '👨‍👧 Parent page')
    );
  }
```

- [ ] **Step 3: Call `initSnapshots()` at boot** — find `boot()` (the function that runs `route()` / sets up listeners) and add, after `window.KLS.GAMES` is set and before/after `route()`:

```js
    if (window.KLS.backup && window.KLS.backup.initSnapshots) window.KLS.backup.initSnapshots();
```

(Locate `boot` via `grep -n "function boot\|registerSlugs\|route()" shared/scripts/hub.js`. GAMES must already be assigned to `window.KLS.GAMES` at that point — it is, since backup discovery already relies on it.)

- [ ] **Step 4: Verify no dangling references** — `grep -n "renderBackupNudge\|shouldNudgeBackup\|dismissNudgeForToday\|hub__quick\|doSaveNow\|doChooseFolder" shared/scripts/hub.js` returns nothing.

- [ ] **Step 5: Sanity-load in a browser** — `python3 -m http.server 8000`, open `http://localhost:8000`, confirm: hub shows the tiles + a quiet "Parent page" link, NO 💾 chip, NO nudge banner. (Playwright drive in Task 7; a manual open is fine here.)

- [ ] **Step 6: Commit**

```bash
git add shared/scripts/hub.js
git commit -m "feat(hub): remove 💾 chip/popover + nudge banner; wire auto-snapshots"
```

---

### Task 5: Phase 2 — backup-folder mirror

**Files:**
- Modify: `shared/scripts/backup.js`

**Interfaces:**
- Consumes: `getLastDirHandle`, `saveLastDirHandle`, `pickBackupFolder` (existing), `buildEnvelope`.
- Produces (new API):
  - `connectBackupFolder() → Promise<handle|null>` — picks a folder with `readwrite` and persists it.
  - `getFolderStatus() → Promise<{ supported, connected, name, needsReconnect, lastMirrorAt }>`.
  - `mirrorAfterSnapshot(envelope, force) → Promise<void>` — internal; throttled ≤1/hour unless `force`.

- [ ] **Step 1: Add folder-mirror constants + helpers**

```js
  const LAST_MIRROR_KEY = 'kls.backup.lastMirrorAt';
  const FOLDER_RECONNECT_KEY = 'kls.backup.folderNeedsReconnect';
  const MIRROR_THROTTLE_MS = 3600 * 1000;
  const MIRROR_DAILY_KEEP = 14;

  function ymd(d) { return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()); }

  async function verifyRWPermission(handle) {
    try {
      if (!handle || typeof handle.queryPermission !== 'function') return false;
      const q = await handle.queryPermission({ mode: 'readwrite' });
      return q === 'granted';
    } catch (e) { return false; }
  }

  /** Explicit connect: pick a folder with write access and remember it. */
  async function connectBackupFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('This browser can’t keep backup files in a folder. Use Chrome or Edge.');
    }
    try {
      const dh = await window.showDirectoryPicker({ id: 'kls-backup-dir', mode: 'readwrite' });
      // Ensure we actually have write permission (some flows return read).
      if (typeof dh.requestPermission === 'function') {
        await dh.requestPermission({ mode: 'readwrite' });
      }
      await saveLastDirHandle(dh);
      try { localStorage.removeItem(FOLDER_RECONNECT_KEY); } catch (e) { /* ignore */ }
      return dh;
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      throw e;
    }
  }

  async function getFolderStatus() {
    const supported = typeof window.showDirectoryPicker === 'function';
    const dh = await getLastDirHandle();
    let needsReconnect = false;
    try { needsReconnect = localStorage.getItem(FOLDER_RECONNECT_KEY) === '1'; } catch (e) { /* ignore */ }
    let lastMirrorAt = null;
    try { lastMirrorAt = localStorage.getItem(LAST_MIRROR_KEY) || null; } catch (e) { /* ignore */ }
    return {
      supported: supported,
      connected: !!dh,
      name: dh ? (dh.name || 'backup folder') : null,
      needsReconnect: needsReconnect,
      lastMirrorAt: lastMirrorAt,
    };
  }
```

- [ ] **Step 2: Add the mirror writer**

```js
  async function writeFileInDir(dh, name, text) {
    const fh = await dh.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }

  async function pruneDailyMirrors(dh) {
    const daily = [];
    try {
      for await (const [name, handle] of dh.entries()) {
        if (handle.kind === 'file' && /^kls-backup-\d{8}\.json$/.test(name)) daily.push(name);
      }
    } catch (e) { return; }
    daily.sort(); // lexical == chronological for YYYYMMDD
    const excess = daily.length - MIRROR_DAILY_KEEP;
    for (let i = 0; i < excess; i++) {
      try { await dh.removeEntry(daily[i]); } catch (e) { /* ignore */ }
    }
  }

  /** Mirror the newest envelope to the connected folder. Throttled to ≤1/hour
   *  unless `force` (pagehide). Silent on any failure; sets a reconnect flag
   *  when permission is missing. */
  async function mirrorAfterSnapshot(envelope, force) {
    if (envelopeIsEmpty(envelope)) return;
    const dh = await getLastDirHandle();
    if (!dh) return;
    if (!force) {
      try {
        const last = localStorage.getItem(LAST_MIRROR_KEY);
        if (last && Date.now() - new Date(last).getTime() < MIRROR_THROTTLE_MS) return;
      } catch (e) { /* ignore */ }
    }
    const ok = await verifyRWPermission(dh);
    if (!ok) { try { localStorage.setItem(FOLDER_RECONNECT_KEY, '1'); } catch (e) { /* ignore */ } return; }
    const text = JSON.stringify(envelope, null, 2);
    try {
      await writeFileInDir(dh, 'kls-backup-latest.json', text);
      await writeFileInDir(dh, 'kls-backup-' + ymd(new Date()) + '.json', text);
      await pruneDailyMirrors(dh);
      try {
        localStorage.setItem(LAST_MIRROR_KEY, new Date().toISOString());
        localStorage.removeItem(FOLDER_RECONNECT_KEY);
      } catch (e) { /* ignore */ }
    } catch (e) {
      try { localStorage.setItem(FOLDER_RECONNECT_KEY, '1'); } catch (e2) { /* ignore */ }
    }
  }
```

(`mirrorAfterSnapshot` is referenced by `takeSnapshotNow`/`flushOnExit` from Task 3 via `typeof mirrorAfterSnapshot === 'function'` guards — those become live now. Function declarations hoist, so ordering within the IIFE is safe.)

- [ ] **Step 3: Expose the folder API** — append to `window.KLS.backup`:

```js
    connectBackupFolder: connectBackupFolder,
    getFolderStatus: getFolderStatus,
```

- [ ] **Step 4: Run Node tests** (mirror code is folder-guarded; not evaluated at load)

Run: `node tests/smoke-backup-snapshots.mjs`
Expected: `smoke-backup-snapshots: OK`.

- [ ] **Step 5: Commit**

```bash
git add shared/scripts/backup.js
git commit -m "feat(backup): Phase 2 — throttled backup-folder mirror (Chrome/Edge)"
```

---

### Task 6: Parent-page status card + restore timeline + folder row + quiet links

**Files:**
- Modify: `shared/scripts/profile-ui.js` (replace the "Backup & Restore" card, ~411–465)
- Modify: `shared/styles/components.css` (add styles; remove dead nudge/quick styles)

**Interfaces:**
- Consumes: `KLS.backup.{snapshotsAvailable,getSnapshotsMeta,getLastSnapshotAt,restoreSnapshot,getFolderStatus,connectBackupFolder,exportToFile,importFromFile,supportsDirectoryPicker,_internals.groupSnapshotsByPeriod}`, `KLS.util.formatRelative`.
- Produces: a `.parent-backup` card region in `renderParent`.

- [ ] **Step 1: Replace the `eximCard` block** in `renderParent()` with a Backups card that renders synchronously (loading state) then hydrates from IDB. Full replacement code:

```js
    // ── Quiet Backup: status card + restore timeline + folder + quiet links ──
    const backup = window.KLS && window.KLS.backup;
    const fmtRel = (window.KLS.util && window.KLS.util.formatRelative) || function (x) { return new Date(x).toLocaleString(); };

    const backupCard = el('div', { class: 'card parent-page__card parent-backup' });
    root.append(backupCard);

    function renderBackupCard() {
      backupCard.innerHTML = '';
      const available = backup && backup.snapshotsAvailable && backup.snapshotsAvailable();

      backupCard.append(el('h2', { class: 'parent-page__section' }, 'Backups'));

      if (!backup) { backupCard.append(el('p', {}, 'Backup module not loaded.')); return; }

      if (!available) {
        backupCard.append(el('p', {}, 'Automatic backups aren’t available in this browser. You can still export and import a file below.'));
      } else {
        const statusLine = el('p', { class: 'parent-backup__status' }, 'On · loading…');
        backupCard.append(statusLine);
        const timelineWrap = el('div', { class: 'parent-backup__timeline', hidden: true });
        const restoreBtn = el('button', {
          type: 'button', class: 'btn btn-secondary',
          onclick: function () {
            timelineWrap.hidden = !timelineWrap.hidden;
            restoreBtn.textContent = timelineWrap.hidden ? 'Restore from a moment…' : 'Hide moments';
          },
        }, 'Restore from a moment…');
        backupCard.append(el('div', { class: 'btn-row' }, restoreBtn), timelineWrap);

        backup.getSnapshotsMeta().then(function (list) {
          statusLine.textContent = list.length
            ? 'On · last snapshot ' + fmtRel(list[0].ts) + ' · ' + list.length + ' moment' + (list.length === 1 ? '' : 's') + ' kept'
            : 'On · no snapshots yet — play a game and one appears within ~10 seconds';
          renderTimeline(timelineWrap, list);
        });
      }

      // Phase 2: folder row.
      const folderRow = el('div', { class: 'parent-backup__folder' });
      backupCard.append(folderRow);
      if (backup.getFolderStatus) backup.getFolderStatus().then(function (st) { renderFolderRow(folderRow, st); });

      // Quiet Export / Import links.
      const importInput = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
      importInput.addEventListener('change', function (ev) {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        const typed = window.prompt(
          "Importing will REPLACE all profiles and progress on this device with the file's contents.\n\nType REPLACE to continue:");
        if (typed !== 'REPLACE') { alert('Import cancelled. Nothing was changed.'); return; }
        backup.importFromFile(file).catch(function (e) {
          alert('Import failed: ' + (e && e.message ? e.message : e) + '\n\nNothing on this device was changed.');
        });
      });
      backupCard.append(
        el('p', { class: 'parent-backup__links' },
          el('a', { href: '#', class: 'parent-backup__link', onclick: function (e) {
            e.preventDefault();
            backup.exportToFile().catch(function (err) { alert('Export failed: ' + (err && err.message ? err.message : err)); });
          } }, 'Export a file…'),
          el('span', { 'aria-hidden': 'true' }, '  ·  '),
          el('a', { href: '#', class: 'parent-backup__link', onclick: function (e) { e.preventDefault(); importInput.click(); } }, 'Import a file…'),
          importInput,
        ),
        el('p', { class: 'parent-page__note' }, 'Snapshots and file backups use the same format — either can restore the other.')
      );
    }

    function renderTimeline(wrap, list) {
      wrap.innerHTML = '';
      if (!list.length) { wrap.append(el('p', { class: 'parent-page__note' }, 'No moments yet.')); return; }
      const groups = backup._internals.groupSnapshotsByPeriod(list, Date.now());
      const order = [['today', 'Today'], ['yesterday', 'Yesterday'], ['thisWeek', 'This week'], ['older', 'Older']];
      order.forEach(function (pair) {
        const items = groups[pair[0]];
        if (!items.length) return;
        wrap.append(el('h3', { class: 'timeline__heading' }, pair[1]));
        items.forEach(function (m) {
          const time = new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const who = (m.summary && m.summary.profiles || []).map(function (p) {
            return p.avatar + ' ' + p.name + ' ⭐ ' + p.stars + ' 🏆 ' + p.stickers;
          }).join('  ·  ') || 'no progress yet';
          const row = el('div', { class: 'timeline__moment' },
            el('div', { class: 'timeline__moment-main' },
              el('span', { class: 'timeline__time' }, time + (m.label ? ' — ' + m.label : '')),
              el('span', { class: 'timeline__who' }, who),
            ),
            el('button', {
              type: 'button', class: 'btn btn-secondary btn-tiny',
              onclick: function () {
                const when = new Date(m.ts).toLocaleString();
                if (!window.confirm('Go back to ' + when + '?\n\nEverything on this device will look exactly as it did then. A "Before restore" moment is saved first, so you can undo this.')) return;
                backup.restoreSnapshot(m.ts).catch(function (e) {
                  alert('Restore failed: ' + (e && e.message ? e.message : e));
                });
              },
            }, 'Replace everything'),
          );
          wrap.append(row);
        });
      });
    }

    function renderFolderRow(row, st) {
      row.innerHTML = '';
      if (!st || !st.supported) return; // Safari/Firefox: no folder UI at all
      if (!st.connected) {
        row.append(
          el('p', { class: 'parent-page__note' }, 'Keep backup files in a folder — survives a browser wipe or a move to a new computer.'),
          el('button', { type: 'button', class: 'btn btn-secondary btn-tiny', onclick: function () {
            backup.connectBackupFolder().then(function (dh) { if (dh) renderBackupCard(); })
              .catch(function (e) { alert('Could not connect folder: ' + (e && e.message ? e.message : e)); });
          } }, '📁 Choose folder…'),
        );
        return;
      }
      if (st.needsReconnect) {
        row.append(
          el('p', { class: 'parent-page__note' }, 'Backup folder “' + st.name + '” lost permission.'),
          el('button', { type: 'button', class: 'btn btn-secondary btn-tiny', onclick: function () {
            backup.connectBackupFolder().then(function (dh) { if (dh) renderBackupCard(); })
              .catch(function (e) { alert('Could not reconnect: ' + (e && e.message ? e.message : e)); });
          } }, 'Reconnect folder…'),
        );
        return;
      }
      row.append(el('p', { class: 'parent-page__note' },
        'Folder connected · ' + st.name + (st.lastMirrorAt ? ' · updated ' + fmtRel(st.lastMirrorAt) : '')));
    }

    renderBackupCard();
```

Remove the old `restoreInput`/`lastExport`/`eximCard`/`root.append(eximCard)` block entirely (it is fully replaced above). Keep the summary card and the Danger zone card unchanged.

- [ ] **Step 2: Add CSS** to `shared/styles/components.css` (append near the other `.parent-page*` rules). Match existing tokens:

```css
/* Quiet Backup — parent page timeline */
.parent-backup__status { font-weight: var(--kls-fw-semibold); color: var(--kls-ink); }
.parent-backup__timeline { margin-top: var(--kls-space-3); }
.parent-backup__folder { margin-top: var(--kls-space-3); }
.parent-backup__links { margin-top: var(--kls-space-3); font-size: var(--kls-fs-sm); }
.parent-backup__link { color: var(--kls-brand); text-decoration: underline; cursor: pointer; }
.timeline__heading {
  font-size: var(--kls-fs-sm); text-transform: uppercase; letter-spacing: .04em;
  color: var(--kls-ink-soft); margin: var(--kls-space-3) 0 var(--kls-space-1);
}
.timeline__moment {
  display: flex; align-items: center; justify-content: space-between; gap: var(--kls-space-3);
  padding: var(--kls-space-2) var(--kls-space-3); border-radius: var(--kls-radius-md);
  background: var(--kls-surface); margin-bottom: var(--kls-space-1); flex-wrap: wrap;
}
.timeline__moment-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.timeline__time { font-weight: var(--kls-fw-semibold); color: var(--kls-ink); }
.timeline__who { font-size: var(--kls-fs-sm); color: var(--kls-ink-soft); }
```

(If a referenced token doesn't exist, `grep -n "kls-ink-soft\|kls-brand\|kls-surface\|kls-radius-md" shared/styles/tokens.css` and substitute the nearest existing token. `--kls-brand` may be `--kls-primary` — verify.)

- [ ] **Step 3: Remove dead CSS** — after confirming no references remain (`grep -rn "hub__nudge\|hub__quick" shared/ index.html`), delete the `.hub__nudge*` rules (~933–948) and the `.hub__quick-menu/summary/pop/item/caret/icon/status` rules (~741–807). Keep `.hub__quick-row` only if `renderAccountActions` still uses it; the new code uses a `.hub__parent-link` inside `#hub-account-actions` (which keeps class `hub__quick-row` on the container div in the hub HTML). Add a minimal `.hub__parent-link` style:

```css
.hub__parent-link { font-size: var(--kls-fs-sm); color: var(--kls-ink-soft); text-decoration: none; }
.hub__parent-link:hover { text-decoration: underline; }
```

- [ ] **Step 4: Commit**

```bash
git add shared/scripts/profile-ui.js shared/styles/components.css
git commit -m "feat(parent): restore-timeline status card, folder row, quiet export/import links"
```

---

### Task 7: End-to-end browser verification + docs

**Files:**
- Modify: `FEATURE_QUIET_BACKUP.md`, `CLAUDE.md`

- [ ] **Step 1: Serve and drive with Playwright** — `python3 -m http.server 8000` (background), then via the browser tools:
  1. Load `http://localhost:8000`, create/enter a profile, open Word Problem Adventure, answer to earn a star.
  2. Return to hub → assert NO `.hub__nudge`, NO `.hub__quick-menu`/💾 chip (`document.querySelector('.hub__quick-menu')` is null).
  3. Wait ~11 s → in the page console assert a snapshot exists:
     `indexedDB.open('kls-backup',2)` → read `snapshots` store → `getAll()` length ≥ 1 and the newest `summary.totalStars ≥ 1`. (AC 1, 2)
  4. Go to `#/parent` → "Restore from a moment…" → a moment shows the profile's ⭐/🏆; click "Replace everything", confirm → page reloads → state matches. (AC 2, 3)
  5. Verify a "Before restore" moment now exists in the timeline. (AC 3)
  6. Rapid-fire: dispatch 30 progress writes in a loop, wait for debounce → assert snapshot count grew by ≤ 2. (AC 4)
- [ ] **Step 2: Record evidence** — capture the console assertions / screenshots into the scratchpad; if any AC fails, fix the offending task's code before proceeding (systematic-debugging).
- [ ] **Step 3: Run both Node tests one final time.**

Run: `node tests/smoke-backup-snapshots.mjs && node games/cosmic-math-quest/tests/smoke-learning-intelligence.mjs`
Expected: both `... OK`.

- [ ] **Step 4: Update docs** — in `FEATURE_QUIET_BACKUP.md` set `**Status:** Shipped` and add a short "Implemented" section pointing at `backup.js` (snapshots + mirror), `hub.js` (UI removed), `profile-ui.js` (timeline). In `CLAUDE.md`, add under Commands:

```bash
node tests/smoke-backup-snapshots.mjs
```

and note it tests the Quiet Backup snapshot helpers.

- [ ] **Step 5: Commit**

```bash
git add FEATURE_QUIET_BACKUP.md CLAUDE.md
git commit -m "docs: mark Quiet Backup shipped; add snapshot smoke-test command"
```

---

## Self-Review

**Spec coverage** (each `FEATURE_QUIET_BACKUP.md` requirement → task):
- Silent snapshots on progress/storage/pagehide, debounced 10s → Task 3. ✅
- Dedupe identical payloads → Task 1 (`envelopePayloadEqual`) + Task 3. ✅
- Payload = existing envelope, no version bump → Task 3 uses `buildEnvelope`; `BACKUP_VERSION` untouched. ✅
- IndexedDB `snapshots` store → Task 2. ✅
- Retention thinning (24h/30d/monthly/cap 60) → Task 1 (`thinSnapshots`) + Task 3. ✅
- Hub renders zero backup UI; chip/popover/nudge removed → Task 4. ✅
- Parent status card + timeline grouped Today/Yesterday/This week/Older, per-profile ⭐/🏆 → Task 6 + Task 1 (`groupSnapshotsByPeriod`, `summarizeEnvelope`). ✅
- "Before restore" safety snapshot; plain confirm for timeline restore → Task 3 (`restoreSnapshot`) + Task 6. ✅
- Manual Export/Import demoted to quiet links; import keeps type-REPLACE → Task 6. ✅
- No-IndexedDB degradation copy → Task 6. ✅
- Phase 2 folder row (hidden when unsupported), connect once, connected/reconnect states → Task 6 + Task 5. ✅
- Mirror `kls-backup-latest.json` + daily files, prune to 14, throttle ≤1/hr + pagehide → Task 5. ✅
- Permission revoked → silent pause + "Reconnect folder…" only → Task 5 (`FOLDER_RECONNECT_KEY`) + Task 6. ✅
- All 7 acceptance criteria → Task 7 verification. ✅

**Placeholder scan:** No TBD/"handle edge cases"/"similar to"—every code step is complete. ✅

**Type consistency:** `summarizeEnvelope` returns `{profiles:[{id,name,avatar,stars,stickers}],totalStars,totalStickers}` — consumed identically in Task 6's `renderTimeline`. `getSnapshotsMeta`/`listSnapshots` return `{ts,label,summary}` — matches `groupSnapshotsByPeriod` input and timeline rendering. `getFolderStatus` returns `{supported,connected,name,needsReconnect,lastMirrorAt}` — matches `renderFolderRow`. `mirrorAfterSnapshot(envelope,force)` signature matches both call sites in Task 3. ✅
