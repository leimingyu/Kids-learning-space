/** Real backup reader/writer keeps old and new long-division progress opaque. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { boot, copy } from './learning-harness.mjs';

const root = new URL('../../../', import.meta.url);
const source = readFileSync(new URL('shared/scripts/backup.js', root), 'utf8');
const MAIN = 'longDivisionCoach_v1', WRONGS = 'longDivisionCoach_wrongs_v1', HUB = 'kls.progress.v2';
const registrySource = readFileSync(new URL('shared/scripts/hub.js', root), 'utf8');
assert(registrySource.includes('"' + MAIN + '"') || registrySource.includes("'" + MAIN + "'"));
assert(registrySource.includes('"' + WRONGS + '"') || registrySource.includes("'" + WRONGS + "'"));

function backupHarness(seed) {
  const data = new Map(seed), events = new Map();
  let reloads = 0;
  const localStorage = {
    get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k)
  };
  const window = {
    KLS: { GAMES: [{ slug: 'long-division-coach', storageBase: [MAIN, WRONGS] }], progress: { invalidateCache() {} } },
    addEventListener: (event, fn) => events.set(event, fn)
  };
  const context = vm.createContext({ window, localStorage, document: { visibilityState: 'visible' },
    location: { protocol: 'file:', hash: '', reload() { reloads++; } },
    console: { warn() {}, info() {}, error() {} }, setTimeout: () => 1, clearTimeout() {}, Date, Math });
  vm.runInContext(source, context);
  return { data, api: window.KLS.backup, get reloads() { return reloads; } };
}
const legacyClassic = { v: 1, topMode: 'practice', problem: { dividend: 936, divisor: 8 }, engine: { phase: 'multiply' }, inputValue: '8' };
const oldProgress = { version: 1, streak: 4, totalStars: 17, missionsCompleted: 6, calendar: { '2026-10-28': { stars: 3 } } };
const lesson = boot(); lesson.mode('guided'); lesson.submit('2'); lesson.button('Hint').fire('click'); lesson.input('7');
const learning = lesson.state();
const composite = { v: 2, module: 'learning', learningJourney: learning, classicSession: legacyClassic };
const profile = (id, gameState) => ({ id, displayName: id, avatar: '🦊', games: { 'long-division-coach': { levels: {}, stickers: [], gameState } } });
const hub = { version: 2, activeProfileId: 'dad', profiles: { dad: profile('dad', composite), child: profile('child', legacyClassic) } };
const newProgress = { ...oldProgress, learningJourney: learning };
const wrongs = { records: [{ questionId: '3/528', questionShape: { dividend: 528, divisor: 3 }, attempts: 1, hintsUsed: 1, resolved: false }] };
const seed = new Map([
  [HUB, JSON.stringify(hub)], [MAIN + '__dad', JSON.stringify(newProgress)], [WRONGS + '__dad', JSON.stringify(wrongs)],
  [MAIN + '__child', JSON.stringify(oldProgress)], [MAIN, '{"standalone":"keep"}'], ['kls.audio.muted.v1', '1']
]);
const h = backupHarness(seed), exported = copy(h.api._internals.buildEnvelope());
assert.equal(exported.version, 1, 'Individual game additions do not change the backup envelope');
assert.deepEqual(exported.hub.profiles.dad.games['long-division-coach'].gameState, composite);
assert.equal(exported.games['long-division-coach'].dad[MAIN], seed.get(MAIN + '__dad'));
assert.equal(exported.games['long-division-coach'].dad[WRONGS], seed.get(WRONGS + '__dad'));
assert.equal(exported.games['long-division-coach'].child[MAIN], seed.get(MAIN + '__child'));

// A REPLACE restore round-trips both forms while device/standalone keys stay outside ownership.
h.data.set(MAIN + '__temporary', '{"remove":true}');
h.data.set(MAIN + '__dad', '{"temporary":true}');
await h.api.restoreFromEnvelope(exported);
for (const key of [HUB, MAIN + '__dad', WRONGS + '__dad', MAIN + '__child', MAIN, 'kls.audio.muted.v1']) {
  assert.equal(h.data.get(key), seed.get(key), key + ' restored byte-for-byte');
}
assert.equal(h.data.has(MAIN + '__temporary'), false);
assert.equal(h.reloads, 1);
assert.equal(h.api.getLastRestoreInfo().undoAvailable, true);
await h.api.undoLastRestore();
assert.equal(h.data.get(MAIN + '__dad'), '{"temporary":true}');
assert.equal(h.data.get(MAIN + '__temporary'), '{"remove":true}');

// An older single-base backup remains readable without creating learning progress.
const oldEnvelope = { ...exported, hub: { version: 2, activeProfileId: 'child', profiles: { child: profile('child', legacyClassic) } },
  games: { 'long-division-coach': { child: JSON.stringify(oldProgress) } } };
await h.api.restoreFromEnvelope(oldEnvelope);
assert.equal(h.data.get(MAIN + '__child'), JSON.stringify(oldProgress));
assert.equal(JSON.parse(h.data.get(MAIN + '__child')).learningJourney, undefined);
assert.equal(h.data.has(MAIN + '__dad'), false);
assert.equal(h.data.has(WRONGS + '__dad'), false);
assert.deepEqual(JSON.parse(h.data.get(HUB)).profiles.child.games['long-division-coach'].gameState, legacyClassic);
console.log('Save compatibility: old/new profiles, classic/composite checkpoints, raw exports, REPLACE restore and Undo passed.');
