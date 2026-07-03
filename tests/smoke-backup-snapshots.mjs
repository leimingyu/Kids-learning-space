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

// 1) summarizeEnvelope: per-profile stars/stickers from hub blob.
//    kls.progress.v2 stores `profiles` as an OBJECT MAP keyed by id.
const env = {
  type: 'kls.backup', version: 1,
  hub: {
    version: 2,
    profiles: {
      a: { id: 'a', displayName: 'Emma', avatar: '🦊',
        games: { g1: { levels: { l1: { stars: 3 }, l2: { stars: 2 } }, stickers: ['s1', 's2'] } } },
      b: { id: 'b', displayName: 'Leo', avatar: '🐼',
        games: { g1: { levels: { l1: { stars: 1 } }, stickers: ['s3'] } } },
    },
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

// tolerates an array shape too (older/hand-made envelopes)
const arrSum = B.summarizeEnvelope({ hub: { profiles: [{ id: 'x', displayName: 'X', games: { g: { levels: { a: { stars: 2 } }, stickers: [] } } }] } });
assert.strictEqual(arrSum.totalStars, 2);

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

// 5) Save-history filename + pruning (folder mirror)
const stamp = B.stampForFilename(new Date('2026-07-03T04:09:07'));
assert.strictEqual(stamp, '20260703-040907');
assert.strictEqual(B.historyFilename(new Date('2026-07-03T04:09:07')), 'kls-save-20260703-040907.json');

// selectHistoryToPrune: keep newest 30, delete the rest, ignore non-matching
const names = [];
for (let i = 0; i < 32; i++) {
  const hh = String(i).padStart(2, '0');
  names.push('kls-save-20260703-' + hh + '0000.json');
}
names.push('kls-backup-latest.json'); // must be ignored
names.push('notes.txt');              // must be ignored
const prune = B.selectHistoryToPrune(names, 30);
assert.strictEqual(prune.length, 2, 'should delete the 2 oldest of 32');
assert.strictEqual(prune[0], 'kls-save-20260703-000000.json');
assert.strictEqual(prune[1], 'kls-save-20260703-010000.json');
assert.ok(!prune.includes('kls-backup-latest.json'));
assert.ok(!prune.includes('notes.txt'));
// under the cap → nothing to prune
assert.deepStrictEqual(B.selectHistoryToPrune(['kls-save-20260703-000000.json'], 30), []);

console.log('smoke-backup-snapshots: OK');
