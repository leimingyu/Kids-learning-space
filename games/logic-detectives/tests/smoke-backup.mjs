/* Exercise the real hub registry, shared backup module, and Logic Detectives
 * store against isolated memory storage. No user browser or backup file is read.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../', import.meta.url);
const backupSource = readFileSync(new URL('shared/scripts/backup.js', root), 'utf8');
const storeSource = readFileSync(new URL('games/logic-detectives/store.js', root), 'utf8');
const hubSource = readFileSync(new URL('shared/scripts/hub.js', root), 'utf8');
const registryText = hubSource.match(/const GAMES = (\[[\s\S]*?\n  \]);/);
assert.ok(registryText, 'The hub must have a readable GAMES registry.');
const registry = vm.runInNewContext('(' + registryText[1] + ')');
const game = registry.find(item => item.slug === 'logic-detectives');
assert.ok(game, 'Logic Detectives must be registered in the main hub.');
assert.deepEqual(JSON.parse(JSON.stringify(game.storageBase)), ['logicDetectives_v1', 'logicDetectives_wrongs_v1']);
assert.ok(game.topics.includes('logic'), 'The hub tile must include the Logic topic.');

const HUB = 'kls.progress.v2', MAIN = 'logicDetectives_v1', WRONGS = 'logicDetectives_wrongs_v1', JOURNAL = 'kls.restore.journal.v1';
const copy = value => JSON.parse(JSON.stringify(value));
const profile = (id, stars) => ({ id, displayName: id === 'A' ? 'Detective A' : 'Detective B', avatar: '🦊', games: { 'logic-detectives': { levels: { 'g2-case-1': { stars, questionsAnswered: 5, accuracy: 100 } }, stickers: ['logic-first-case'] } } });
const hub = { version: 2, activeProfileId: 'A', profiles: { A: profile('A', 2), B: profile('B', 1) } };
function main(grade, marker) {
  return { version: 1, grade, cases: { case1: { id: 'case1', grade, mode: 'case', ids: ['question1'], index: 0, drafts: [{ answers: { c1: '11' }, selected: 2, hints: 1, mistakes: 1, solved: false }], complete: false } }, completed: { case0: { stars: 2, independent: 3, completedAt: '2026-11-01T12:00:00.000Z' } }, mastery: { question0: true }, badges: ['first-case'], lastRun: { caseId: 'case1', grade }, futureMetadata: { marker } };
}
function wrongs(grade, marker) {
  return { question1: { questionId: 'question1', questionShape: { id: 'question1', grade, type: 'table', rows: [9, 6], cols: [7, 11, 14], blanks: ['c1'] }, grade, skill: 'table', yourAnswer: { c1: '12' }, correctAnswer: { c1: 11 }, timestamp: '2026-11-01T12:00:00.000Z', attempts: 2, resolved: false, futureMetadata: { marker } } };
}
const seed = () => new Map([
  [HUB, JSON.stringify(hub)],
  [MAIN + '__A', JSON.stringify(main(2, 'A-original'))], [WRONGS + '__A', JSON.stringify(wrongs(2, 'A-original'))],
  [MAIN + '__B', JSON.stringify(main(3, 'B-original'))], [WRONGS + '__B', JSON.stringify(wrongs(3, 'B-original'))],
  [MAIN, JSON.stringify(main(3, 'standalone'))], [WRONGS, JSON.stringify(wrongs(3, 'standalone'))],
  ['kls.audio.muted.v1', '1'], ['some.other.app', 'untouched']
]);
function harness(values = seed()) {
  const mutations = [], logs = [], timers = new Map();
  let timerId = 0, reloads = 0, flushes = 0, detaches = 0;
  const storage = {
    get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, String(value)); mutations.push(['set', key]); },
    removeItem(key) { values.delete(key); mutations.push(['remove', key]); }
  };
  const bridge = { isEmbedded: () => true, getProfileId: () => 'A', getSessionId: () => 'backup-test', assertCanWrite: () => true, reportStorageError() {}, clearStorageError() {} };
  const context = vm.createContext({
    localStorage: storage, navigator: {}, document: { visibilityState: 'visible' },
    console: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    KLS: { GAMES: copy(registry), chrome: { async flushSession() { flushes++; return { ok: true }; }, detachSession() { detaches++; } } },
    location: { protocol: 'file:', hash: '#/parent', reload() { reloads++; } },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    FileReader: class { readAsText(file) { queueMicrotask(() => { this.result = file.body; this.onload?.(); }); } }
  });
  context.window = context;
  vm.runInContext(storeSource, context, { filename: 'store.js' });
  vm.runInContext(backupSource, context, { filename: 'backup.js' });
  return { values, mutations, logs, backup: context.KLS.backup, store: context.LogicDetectivesStore.create({ storage, bridge }), get reloads() { return reloads; }, get flushes() { return flushes; }, get detaches() { return detaches; } };
}
const owned = values => Object.fromEntries([...values].filter(([key]) => key === HUB || registry.some(item => [item.storageBase].flat().filter(Boolean).some(base => key.startsWith(base + '__')))));

// Actual registry-driven collection captures both bases for A and B, with no
// standalone saves, preferences, or unrelated app keys in the envelope.
{
  const h = harness(), before = new Map(h.values), envelope = h.backup._internals.buildEnvelope();
  assert.equal(envelope.type, 'kls.backup'); assert.equal(envelope.version, 1);
  assert.deepEqual(Object.keys(envelope.games['logic-detectives']).sort(), ['A', 'B']);
  for (const id of ['A', 'B']) {
    const payload = envelope.games['logic-detectives'][id];
    assert.deepEqual(Object.keys(payload).sort(), [MAIN, WRONGS].sort());
    assert.equal(payload[MAIN], before.get(MAIN + '__' + id));
    assert.equal(payload[WRONGS], before.get(WRONGS + '__' + id));
  }
  assert.equal(JSON.stringify(envelope.games).includes('standalone'), false);
  assert.deepEqual(h.values, before); assert.equal(h.mutations.length, 0);

  const prepared = await h.backup.prepareImport({ body: JSON.stringify(envelope), size: 1000 });
  assert.equal(prepared.summary.profiles.length, 2); assert.equal(prepared.summary.totalStars, 3);
  assert.equal(prepared.warnings.length, 0); assert.equal(h.mutations.length, 0, 'Read-only restore preview must not write.');
}

// Real REPLACE restore round-trips opaque main/wrongs records, stages a journal,
// preserves standalone/preferences, and can undo back to the previous two stores.
{
  const h = harness(), original = new Map(h.values), target = copy(h.backup._internals.buildEnvelope());
  for (const id of ['A', 'B']) {
    target.games['logic-detectives'][id][MAIN] = JSON.stringify(main(id === 'A' ? 3 : 2, id + '-restored'));
    target.games['logic-detectives'][id][WRONGS] = JSON.stringify(wrongs(id === 'A' ? 3 : 2, id + '-restored'));
  }
  target.games['logic-detectives'].A.unknown_storage_base = '{"ignored":true}';
  await h.backup.restoreFromEnvelope(target);
  assert.equal(h.reloads, 1); assert.equal(h.flushes, 1); assert.equal(h.detaches, 1);
  for (const id of ['A', 'B']) for (const base of [MAIN, WRONGS]) assert.equal(h.values.get(base + '__' + id), target.games['logic-detectives'][id][base]);
  assert.equal(h.values.has('unknown_storage_base__A'), false);
  for (const key of [MAIN, WRONGS, 'kls.audio.muted.v1', 'some.other.app']) assert.equal(h.values.get(key), original.get(key));
  const journal = JSON.parse(h.values.get(JOURNAL));
  assert.equal(journal.phase, 'committed'); assert.equal(journal.before[MAIN + '__A'], original.get(MAIN + '__A'));
  assert.equal(journal.after[WRONGS + '__B'], target.games['logic-detectives'].B[WRONGS]);
  assert.equal(h.store.load().main.grade, 3); assert.equal(h.store.load().wrongs.question1.grade, 3);
  await h.backup.undoLastRestore();
  assert.deepEqual(owned(h.values), owned(original)); assert.equal(h.reloads, 2);
  assert.equal(JSON.parse(h.values.get(JOURNAL)).phase, 'committed');
}

// A prepared shared restore journal blocks the game's own writer. Actual shared
// recovery restores both profile payloads from an expired interrupted journal.
{
  const h = harness(), originalOwned = owned(h.values);
  h.values.set(JOURNAL, JSON.stringify({ version: 1, phase: 'prepared', ownerId: 'abandoned-test', createdAt: Date.now() - 10000, before: originalOwned, after: originalOwned }));
  const before = new Map(h.values), writes = h.mutations.length;
  assert.equal(h.store.write(main(3, 'must-wait'), wrongs(3, 'must-wait')).ok, false);
  assert.deepEqual(h.values, before); assert.equal(h.mutations.length, writes);
  h.values.set(MAIN + '__A', JSON.stringify(main(3, 'partial-replacement')));
  assert.equal(h.backup.recoverInterruptedRestore(), true);
  assert.deepEqual(owned(h.values), originalOwned); assert.equal(h.values.has(JOURNAL), false);
}

// Invalid game JSON rejects before journal staging or any existing progress write.
{
  const h = harness(), before = new Map(h.values), target = copy(h.backup._internals.buildEnvelope());
  target.games['logic-detectives'].A[WRONGS] = '{broken';
  await assert.rejects(h.backup.restoreFromEnvelope(target));
  assert.deepEqual(h.values, before); assert.equal(h.mutations.length, 0); assert.equal(h.reloads, 0);
}

console.log('Logic Detectives shared backup: real registry, both profile stores, preview, REPLACE/Undo, standalone exclusion, restore guards, and recovery passed.');
