import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../store.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(seed = {}) {
  const values = new Map(Object.entries(seed));
  const calls = [];
  let failure = null;
  const storage = {
    getItem(key) { calls.push(['get', key]); if (failure?.('get', key)) throw new Error('read-denied'); return values.get(key) ?? null; },
    setItem(key, value) { calls.push(['set', key]); if (failure?.('set', key)) throw new Error('quota-denied'); values.set(key, String(value)); },
    removeItem(key) { calls.push(['remove', key]); if (failure?.('remove', key)) throw new Error('remove-denied'); values.delete(key); }
  };
  const reports = [], events = [];
  let profile = null, embedded = true, session = 'test-session', writable = true;
  const bridge = {
    isEmbedded: () => embedded, getProfileId: () => profile, getSessionId: () => session,
    assertCanWrite() { if (!writable) throw new Error('suspended'); return true; },
    reportStorageError(message, key) { reports.push(['error', message, key]); },
    clearStorageError(key) { reports.push(['recovered', key]); }
  };
  const context = vm.createContext({ window: {} }); vm.runInContext(source, context);
  const API = context.window.LogicDetectivesStore;
  const create = () => API.create({ storage, bridge, onError: message => events.push(['error', message]), onRecovered: () => events.push(['recovered']) });
  return { values, calls, reports, events, bridge, API, create, setProfile: value => { profile = value; }, setEmbedded: value => { embedded = value; }, setSession: value => { session = value; }, setWritable: value => { writable = value; }, fail: fn => { failure = fn; } };
}
const MAIN = 'logicDetectives_v1', WRONGS = 'logicDetectives_wrongs_v1', JOURNAL = 'kls.restore.journal.v1';
function payload(api, grade = 2) {
  const main = plain(api.freshMain());
  main.grade = grade;
  main.cases['g' + grade + '-case-1'] = { id: 'g' + grade + '-case-1', grade, mode: 'case', ids: ['q1'], index: 0, drafts: [{ answers: { c0: '14' }, selected: 2, sticks: null, history: [], hints: 1, mistakes: 2, solved: false }], complete: false };
  main.completed['g' + grade + '-case-2'] = { stars: 3, independent: 5, completedAt: '2026-11-01T12:00:00.000Z' };
  main.mastery.q0 = true; main.badges = ['first-case']; main.lastRun = { id: 'g' + grade + '-case-1', mode: 'case' };
  main.futureField = { preserve: ['unknown', 'additive', 7] };
  const wrongs = { q1: { questionId: 'q1', grade, questionShape: { type: 'table', rows: [9], cols: [14], blanks: ['c0'] }, yourAnswer: { c0: '12' }, correctAnswer: { c0: 14 }, timestamp: '2026-11-01T12:00:00.000Z', attempts: 2, resolved: false, futureMetadata: { reason: 'missing-header' } } };
  return { main, wrongs };
}

// No browser-storage access at all before an embedded document is bound.
{
  const f = fixture(), store = f.create();
  assert.equal(store.ready(), false);
  assert.deepEqual(plain(store.keys()), { main: null, wrongs: null });
  assert.equal(store.load().main.grade, 2);
  assert.equal(store.write(f.API.freshMain(), {}).ok, false);
  assert.equal(store.flush().ok, false); assert.equal(store.reset().ok, false);
  assert.equal(f.calls.length, 0); assert.equal(f.reports.length, 0);
  f.setProfile('A'); f.setSession(null); assert.equal(store.ready(), false); store.load(); assert.equal(f.calls.length, 0);
}

// Standalone saves, A's saves, and a new clean B are separate, including both grades.
{
  const f = fixture(); f.setEmbedded(false);
  const standalone = f.create(), old = payload(f.API, 3);
  assert.equal(standalone.write(old.main, old.wrongs).ok, true);
  assert.equal(f.values.has(MAIN), true);
  f.setEmbedded(true); f.setProfile('A');
  const a = f.create(); assert.deepEqual(plain(a.load().main), plain(f.API.freshMain())); assert.deepEqual(plain(a.load().wrongs), {});
  const saved = payload(f.API); saved.main.cases['g3-case-1'] = old.main.cases['g3-case-1'];
  assert.equal(a.write(saved.main, saved.wrongs).ok, true);
  assert.deepEqual(plain(a.load()), saved);
  f.setProfile('B'); const b = f.create(); assert.deepEqual(plain(b.load()), { main: plain(f.API.freshMain()), wrongs: {} });
  assert.equal(b.write(f.API.freshMain(), {}).ok, true);
  f.setProfile('A'); assert.deepEqual(plain(f.create().load()), saved);
  assert.deepEqual(JSON.parse(f.values.get(MAIN)), old.main);
}

// The exact two registered payloads survive an opaque backup/export/import round-trip.
{
  const f = fixture(); f.setProfile('A'); const saved = payload(f.API, 3), store = f.create();
  store.write(saved.main, saved.wrongs);
  const envelope = JSON.parse(JSON.stringify({ [MAIN + '__A']: f.values.get(MAIN + '__A'), [WRONGS + '__A']: f.values.get(WRONGS + '__A') }));
  const other = fixture(envelope); other.setProfile('A'); assert.deepEqual(plain(other.create().load()), saved);
}

// A second-key failure rolls back the first and a scoped pending copy can retry.
{
  const f = fixture(); f.setProfile('A'); const store = f.create(), initial = payload(f.API), next = payload(f.API, 3);
  assert.equal(store.write(initial.main, initial.wrongs).ok, true);
  const before = new Map(f.values); let failOnce = true;
  f.fail((op, key) => op === 'set' && key === WRONGS + '__A' && failOnce && (failOnce = false, true));
  next.wrongs.q1.attempts = 4;
  assert.equal(store.write(next.main, next.wrongs).ok, false);
  assert.deepEqual(f.values, before); assert.equal(store.status().ok, false);
  assert.deepEqual(plain(store.load()), next, 'pending data stays available in this document');
  f.setProfile('B'); assert.deepEqual(plain(store.load().wrongs), {}); assert.equal(store.flush().ok, true); assert.equal(f.values.has(MAIN + '__B'), false);
  f.setProfile('A'); f.fail(null); assert.equal(store.flush().ok, true); assert.deepEqual(plain(f.create().load()), next);
  assert.equal(f.events.some(event => event[0] === 'recovered'), true);
}

// Quota denial preserves old data; a caller-supplied checkpoint flush can recover.
{
  const f = fixture(); f.setProfile('A'); const store = f.create(), saved = payload(f.API);
  f.fail(op => op === 'set'); assert.equal(store.write(saved.main, saved.wrongs).ok, false); assert.equal(f.values.size, 0);
  f.fail(null); assert.equal(store.flush(saved.main, saved.wrongs).ok, true); assert.deepEqual(plain(f.create().load()), saved);
  f.setWritable(false); saved.main.grade = 3; assert.equal(store.write(saved.main, saved.wrongs).ok, false); assert.equal(JSON.parse(f.values.get(MAIN + '__A')).grade, 2);
}

// Prepared and malformed restore journals block every mutation, including reset.
for (const raw of ['{"phase":"prepared"}', '{not JSON']) {
  const f = fixture({ [JOURNAL]: raw }); f.setProfile('A'); const store = f.create(), saved = payload(f.API);
  assert.equal(store.write(saved.main, saved.wrongs).ok, false); assert.equal(store.reset().ok, false);
  assert.equal(f.calls.some(([op]) => op !== 'get'), false);
  f.values.set(JOURNAL, '{"phase":"committed"}'); assert.equal(store.flush().ok, true);
}

// Malformed or future saved data is never silently replaced by clean defaults.
for (const [key, raw] of [[MAIN, '{broken'], [MAIN, '{"version":2,"grade":2}'], [MAIN, '{"version":1,"cases":[]}'], [WRONGS, '[]'], [WRONGS, '{"q1":null}']]) {
  const target = key + '__A', f = fixture({ [target]: raw }); f.setProfile('A'); const store = f.create();
  store.load(); assert.equal(store.status().ok, false);
  assert.equal(store.write(f.API.freshMain(), {}).ok, false); assert.equal(store.flush().ok, false); assert.equal(f.values.get(target), raw);
  assert.equal(store.reset().ok, true); assert.equal(f.values.has(target), false);
  assert.equal(store.write(f.API.freshMain(), {}).ok, true);
}

// Reset deletes only the active profile, and a failed deletion restores both values.
{
  const f = fixture(); f.setProfile('A'); const store = f.create(), saved = payload(f.API); store.write(saved.main, saved.wrongs);
  f.values.set(MAIN + '__B', 'keep-B'); f.values.set(MAIN, 'keep-standalone');
  const before = new Map(f.values); let failOnce = true;
  f.fail((op, key) => op === 'remove' && key === WRONGS + '__A' && failOnce && (failOnce = false, true));
  assert.equal(store.reset().ok, false); assert.deepEqual(f.values, before);
  f.fail(null); assert.equal(store.reset().ok, true);
  assert.equal(f.values.has(MAIN + '__A'), false); assert.equal(f.values.has(WRONGS + '__A'), false);
  assert.equal(f.values.get(MAIN + '__B'), 'keep-B'); assert.equal(f.values.get(MAIN), 'keep-standalone');
  assert.equal(f.reports.some(event => event[0] === 'resetProgress'), false);
}

// A read outage is recoverable; callback failures cannot make a good save fail.
{
  const f = fixture(); f.setProfile('A'); const saved = payload(f.API, 3), initial = f.create();
  initial.write(saved.main, saved.wrongs);
  const before = new Map(f.values), store = f.create();
  f.fail(op => op === 'get'); store.load(); assert.equal(store.status().ok, false);
  f.fail(null); assert.equal(store.write(f.API.freshMain(), {}).ok, false); assert.deepEqual(f.values, before);
  assert.equal(store.load().main.grade, 3); assert.equal(store.status().ok, true); assert.deepEqual(plain(store.load()), saved);
  const troublesome = f.API.create({ storage: f.bridge ? { getItem: key => f.values.get(key) ?? null, setItem: (key, value) => f.values.set(key, value), removeItem: key => f.values.delete(key) } : null, bridge: { ...f.bridge, clearStorageError() { throw new Error('callback'); } }, onError() { throw new Error('callback'); }, onRecovered() { throw new Error('callback'); } });
  assert.equal(troublesome.write(f.API.freshMain(), {}).ok, true);
}

// A failed rollback is reported and the pending intended snapshot can repair it.
{
  const f = fixture(); f.setProfile('A'); const store = f.create(), saved = payload(f.API, 3);
  f.fail((op, key) => (op === 'set' && key === WRONGS + '__A') || (op === 'remove' && key === MAIN + '__A'));
  const failed = store.write(saved.main, saved.wrongs);
  assert.equal(failed.ok, false); assert.match(failed.error, /could not be saved completely/);
  assert.equal(f.values.has(MAIN + '__A'), true); assert.equal(f.values.has(WRONGS + '__A'), false);
  f.fail(null); assert.equal(store.flush().ok, true); assert.deepEqual(plain(f.create().load()), saved);
}

console.log('Logic Detectives storage: profile isolation, protected loads, rollback/retry, restore guards, reset, and opaque backup round-trips passed.');
