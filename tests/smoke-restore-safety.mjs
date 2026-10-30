/* Restore validation, staging, rollback, recovery, Undo, and storage health.
 * Runs the real modules against isolated in-memory browser surfaces.
 * No browser profile, filesystem saves, or real IndexedDB are touched.
 * Run: node tests/smoke-restore-safety.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const backupSource = readFileSync(new URL('shared/scripts/backup.js', root), 'utf8');
const progressSource = readFileSync(new URL('shared/scripts/progress.js', root), 'utf8');
const HUB = 'kls.progress.v2';
const JOURNAL = 'kls.restore.journal.v1';
const NOW = Date.parse('2026-10-08T12:00:00.000Z');
const GAMES = [
  { slug: 'word', storageBase: ['word_v1', 'word_wrongs_v1'] },
  { slug: 'fractions', storageBase: 'fractions_wrongs_v1' },
  { slug: 'division', storageBase: ['division_v1', 'division_wrongs_v1'] },
];
const copy = value => JSON.parse(JSON.stringify(value));
const profile = (id, name = id) => ({
  id, displayName: name, avatar: '🦊', createdAt: '2026-01-01T00:00:00.000Z',
  lastActiveAt: '2026-01-01T00:00:00.000Z', games: {},
});
const originalHub = {
  version: 2, activeProfileId: 'alice',
  profiles: { alice: profile('alice', 'Alice'), bob: profile('bob', 'Bob') },
};
const initialValues = () => new Map([
  [HUB, JSON.stringify(originalHub)],
  ['kls.progress.v1', '{"version":1,"profile":{"displayName":"Legacy"},"games":{}}'],
  ['word_v1__alice', '{"version":1,"path":"old","stars":9}'],
  ['word_wrongs_v1__alice', '[{"id":"old-wrong"}]'],
  ['word_v1__bob', '{"version":1,"path":"bob"}'],
  ['division_v1__alice', '{"mission":3}'],
  ['kls.audio.muted.v1', '0'],
  ['kls.backup.lastExportedAt', '2026-01-02T00:00:00.000Z'],
  ['word_v1', '{"standalone":true}'],
  ['other.app', 'keep me'],
]);
const targetEnvelope = () => ({
  type: 'kls.backup', version: 1, hubVersion: 2,
  exportedAt: '2026-10-07T00:00:00.000Z', exportedBy: 'Kids Learning Space',
  hub: { version: 2, activeProfileId: 'target', profiles: { target: profile('target', 'Target') } },
  games: {
    word: { target: { word_v1: '{"version":1,"path":"new"}', word_wrongs_v1: '[]' } },
    fractions: { target: '[{"id":"fraction-wrong"}]' },
    division: { target: '{"mission":7}' },
  },
});
const isProgress = key => key === HUB || key === 'kls.progress.v1'
  || GAMES.some(game => [game.storageBase].flat().some(base => key.startsWith(base + '__')));
const valuesObject = values => Object.fromEntries([...values].filter(([key]) => isProgress(key)));
const sortedValues = values => [...values].sort(([a], [b]) => a.localeCompare(b));
const assertSameStorage = (actual, expected, message) => assert.deepEqual(sortedValues(actual), sortedValues(expected), message);
const errorNamed = (name, message) => Object.assign(new Error(message), { name });

class MemoryStorage {
  constructor(values) { this.values = values; this.hook = null; this.operations = []; }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) {
    const response = this.hook?.({ op: 'get', key });
    if (response && Object.hasOwn(response, 'value')) return response.value;
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    value = String(value);
    const response = this.hook?.({ op: 'set', key, value });
    this.operations.push({ op: 'set', key, value });
    if (!response?.ignore) this.values.set(key, response && Object.hasOwn(response, 'value') ? response.value : value);
  }
  removeItem(key) {
    const response = this.hook?.({ op: 'remove', key });
    this.operations.push({ op: 'remove', key });
    if (!response?.ignore) this.values.delete(key);
  }
}

function fakeIDB({ openError = false, writeError = false, writeAbort = false, readError = false } = {}) {
  const stores = new Map([['handles', new Map()], ['snapshots', new Map()]]);
  const stats = { opens: 0, writes: 0, reads: 0 };
  const database = {
    objectStoreNames: { contains: key => stores.has(key) },
    createObjectStore(key) { stores.set(key, new Map()); },
    transaction(storeName) {
      const transaction = {};
      const store = stores.get(storeName);
      const read = value => {
        stats.reads++;
        const request = {};
        queueMicrotask(() => {
          if (readError) { request.error = errorNamed('UnknownError', 'IndexedDB read failed'); request.onerror?.(); }
          else { request.result = value(); request.onsuccess?.(); }
        });
        return request;
      };
      const write = action => {
        stats.writes++;
        queueMicrotask(() => {
          if (writeAbort) { transaction.error = errorNamed('AbortError', 'Snapshot transaction aborted'); transaction.onabort?.(); }
          else if (writeError) { transaction.error = errorNamed('QuotaExceededError', 'IndexedDB snapshot quota exceeded'); transaction.onerror?.(); }
          else { action(); transaction.oncomplete?.(); }
        });
        return {};
      };
      transaction.objectStore = () => ({
        get: key => read(() => store.get(key)),
        getAll: () => read(() => [...store.values()]),
        add: record => write(() => {
          if (store.has(record.ts)) throw new Error('Duplicate snapshot timestamp');
          store.set(record.ts, copy(record));
        }),
        put: (record, key = record.ts) => write(() => store.set(key, copy(record))),
        delete: key => write(() => store.delete(key)),
      });
      return transaction;
    },
  };
  return {
    stats, stores,
    api: { open() {
      stats.opens++;
      const request = {};
      queueMicrotask(() => {
        if (openError) { request.error = errorNamed('UnknownError', 'IndexedDB is unavailable'); request.onerror?.(); }
        else { request.result = database; request.onsuccess?.(); }
      });
      return request;
    } },
  };
}

function harness({ values = initialValues(), idb = null } = {}) {
  const storage = new MemoryStorage(values);
  const messages = [], events = new Map(), timers = new Map();
  let now = NOW, nextTimer = 0, reloads = 0;
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    localStorage: storage, Date: TestDate, navigator: {},
    console: { info: (...args) => messages.push(args), warn: (...args) => messages.push(args), error: (...args) => messages.push(args) },
    KLS: { GAMES: copy(GAMES) },
    location: { protocol: 'file:', hash: '#/parent', reload() { reloads++; } },
    document: { visibilityState: 'visible' },
    FileReader: class {
      readAsText(file) {
        queueMicrotask(() => {
          if (file.readError) { this.onerror?.(); return; }
          this.result = file.body;
          this.onload?.();
        });
      }
    },
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(event, fn) { if (!events.has(event)) events.set(event, []); events.get(event).push(fn); },
  });
  context.window = context;
  if (idb) context.indexedDB = idb.api;
  vm.runInContext(progressSource, context, { filename: 'progress.js' });
  vm.runInContext(backupSource, context, { filename: 'backup.js' });
  return {
    context, storage, values, messages, idb, backup: context.KLS.backup,
    get reloads() { return reloads; },
    tick(ms) { now += ms; },
    import(envelope) {
      const body = typeof envelope === 'string' ? envelope : JSON.stringify(envelope);
      return context.KLS.backup.importFromFile({ body, size: Buffer.byteLength(body) });
    },
  };
}

let count = 0;
async function test(name, work) {
  await work(); count++;
  console.log('OK ' + name);
}

await test('invalid files and schemas reject before any storage mutation', async () => {
  const cases = [
    ['broken JSON', '{"type":"kls.backup"'],
    ['wrong type', { ...targetEnvelope(), type: 'other' }],
    ['future envelope', { ...targetEnvelope(), version: 99 }],
    ['fractional envelope version', { ...targetEnvelope(), version: 1.5 }],
    ['future hubVersion', { ...targetEnvelope(), hubVersion: 99 }],
    ['future hub version', { ...targetEnvelope(), hub: { ...targetEnvelope().hub, version: 99 } }],
    ['missing profile map', { ...targetEnvelope(), hub: { version: 2 } }],
    ['array profile map', { ...targetEnvelope(), hub: { version: 2, profiles: [] } }],
    ['unknown active profile', { ...targetEnvelope(), hub: { ...targetEnvelope().hub, activeProfileId: 'missing' } }],
    ['profile id mismatch', { ...targetEnvelope(), hub: { version: 2, profiles: { a: profile('b') } } }],
    ['invalid stars', { ...targetEnvelope(), hub: { version: 2, profiles: { a: { ...profile('a'), games: { word: { levels: { q: { stars: 4 } } } } } } } }],
    ['invalid game JSON', { ...targetEnvelope(), games: { word: { target: '{not JSON' } } }],
    ['nonstring game payload', { ...targetEnvelope(), games: { word: { target: { word_v1: {} } } } }],
    ['empty game payload', { ...targetEnvelope(), games: { word: { target: {} } } }],
    ['nonfinite game number', { ...targetEnvelope(), games: { word: { target: '{"value":1e999}' } } }],
    ['inherited constructor slug', { ...targetEnvelope(), games: { constructor: { target: '{}' } } }],
    ['prototype map key', '{"type":"kls.backup","version":1,"games":{"__proto__":{"target":"{}"}}}'],
  ];
  for (const [name, envelope] of cases) {
    const h = harness(), before = new Map(h.values);
    await assert.rejects(h.import(envelope), undefined, name);
    assertSameStorage(h.values, before, name);
    assert.equal(h.storage.operations.length, 0, name + ' must not stage a journal');
    assert.equal(h.reloads, 0, name);
  }
  const h = harness();
  await assert.rejects(h.backup.prepareImport({ body: '{}', size: 8 * 1024 * 1024 + 1 }), /too large/);
  await assert.rejects(h.backup.prepareImport({ readError: true, size: 1 }), /read this file/);
  assert.equal(h.storage.operations.length, 0);
});

await test('legacy single-base and current multi-base exports round-trip', async () => {
  const h = harness(), original = new Map(h.values);
  const envelope = h.backup._internals.buildEnvelope();
  // Registry has two bases, while older files still store a raw string.
  envelope.games.division = { alice: original.get('division_v1__alice') };
  envelope.games.fractions = { alice: '[{"id":"one"}]' };
  await h.import(envelope);
  assert.equal(h.values.get('word_v1__alice'), original.get('word_v1__alice'));
  assert.equal(h.values.get('word_wrongs_v1__alice'), original.get('word_wrongs_v1__alice'));
  assert.equal(h.values.get('word_v1__bob'), original.get('word_v1__bob'));
  assert.equal(h.values.get('division_v1__alice'), original.get('division_v1__alice'));
  assert.equal(h.values.get('fractions_wrongs_v1__alice'), '[{"id":"one"}]');
  assert.equal(h.values.has('kls.progress.v1'), false, 'obsolete hub key is removed on replace');
  assert.equal(h.reloads, 1);
  assert.equal(h.backup.getLastRestoreInfo().undoAvailable, true);
});

await test('successful replace preserves device preferences and standalone data', async () => {
  const h = harness(), before = new Map(h.values);
  // Prime the real progress module cache; restore must invalidate it.
  assert.equal(h.context.KLS.progress.get().profile.id, 'alice');
  await h.import(targetEnvelope());
  assert.equal(h.context.KLS.progress.get().profile.id, 'target');
  assert.equal(h.values.has('word_v1__alice'), false);
  assert.equal(h.values.has('word_v1__bob'), false);
  for (const [key, value] of before) if (!isProgress(key)) assert.equal(h.values.get(key), value, key);
  assert.equal(h.values.get('division_v1__target'), '{"mission":7}');
  assert.equal(h.values.get('word_wrongs_v1__target'), '[]');
});

await test('one-time quota failure after partial apply rolls back exact storage', async () => {
  const h = harness(), before = new Map(h.values);
  let failed = false;
  h.storage.hook = ({ op, key }) => {
    if (!failed && op === 'set' && key === 'word_v1__target') {
      failed = true; throw errorNamed('QuotaExceededError', 'LocalStorage quota exceeded');
    }
  };
  await assert.rejects(h.import(targetEnvelope()), /previous progress was restored/);
  assert.equal(failed, true);
  assertSameStorage(h.values, before);
  assert.equal(h.reloads, 0);
  assert.equal(h.values.has(JOURNAL), false);
});

await test('one-time removal failure rolls back exact storage', async () => {
  const h = harness(), before = new Map(h.values);
  let failed = false;
  h.storage.hook = ({ op, key }) => {
    if (!failed && op === 'remove' && key === 'word_wrongs_v1__alice') {
      failed = true; throw errorNamed('SecurityError', 'Removal permission lost');
    }
  };
  await assert.rejects(h.import(targetEnvelope()), /previous progress was restored/);
  assertSameStorage(h.values, before);
  assert.equal(h.reloads, 0);
});

await test('journal quota failure cancels before touching progress', async () => {
  const h = harness(), before = new Map(h.values);
  h.storage.hook = ({ op, key }) => {
    if (op === 'set' && key === JOURNAL) throw errorNamed('QuotaExceededError', 'Safety copy does not fit');
  };
  await assert.rejects(h.import(targetEnvelope()), /safety copy/);
  assertSameStorage(h.values, before);
  assert.equal(h.storage.operations.length, 0);
  assert.equal(h.reloads, 0);
});

await test('silent journal staging loss cancels before touching progress', async () => {
  const h = harness(), before = new Map(h.values);
  h.storage.hook = ({ op, key }) => op === 'set' && key === JOURNAL ? { ignore: true } : undefined;
  await assert.rejects(h.import(targetEnvelope()), /retain the safety copy/);
  assertSameStorage(h.values, before);
  assert.equal(h.reloads, 0);
});

await test('silent game write loss fails verification and rolls back exact storage', async () => {
  const h = harness(), before = new Map(h.values);
  h.storage.hook = ({ op, key }) => op === 'set' && key === 'word_v1__target' ? { ignore: true } : undefined;
  await assert.rejects(h.import(targetEnvelope()), /previous progress was restored/);
  assertSameStorage(h.values, before);
  assert.equal(h.reloads, 0);
});

for (const failure of ['mismatch', 'throw']) {
  await test('committed-marker readback ' + failure + ' rolls back exact storage', async () => {
    const h = harness(), before = new Map(h.values);
    let committed = false, failed = false;
    h.storage.hook = ({ op, key, value }) => {
      if (op === 'set' && key === JOURNAL && JSON.parse(value).phase === 'committed') committed = true;
      if (op === 'get' && key === JOURNAL && committed && !failed) {
        failed = true;
        if (failure === 'throw') throw errorNamed('SecurityError', 'Readback became unavailable');
        return { value: h.values.get(JOURNAL) + ' ' };
      }
    };
    await assert.rejects(h.import(targetEnvelope()), /previous progress was restored/);
    assert.equal(failed, true);
    assertSameStorage(h.values, before);
    assert.equal(h.reloads, 0);
  });
}

await test('failed committed-marker reset retains previous data and Undo', async () => {
  const h = harness(), before = new Map(h.values);
  let committed = false, readbackFailed = false;
  h.storage.hook = ({ op, key, value }) => {
    if (op === 'set' && key === JOURNAL && JSON.parse(value).phase === 'committed') committed = true;
    if (op === 'get' && key === JOURNAL && committed && !readbackFailed) {
      readbackFailed = true; return { value: h.values.get(JOURNAL) + ' ' };
    }
    if (op === 'set' && key === JOURNAL && committed && JSON.parse(value).phase === 'prepared') {
      throw errorNamed('SecurityError', 'Cannot reset recovery marker');
    }
  };
  await assert.rejects(h.import(targetEnvelope()), error => error.undoAvailable === true);
  const retained = JSON.parse(h.values.get(JOURNAL));
  assert.deepEqual(retained.before, valuesObject(before));
  assert.equal(h.values.get(HUB), JSON.stringify(targetEnvelope().hub));
  assert.equal(h.reloads, 0);
  h.storage.hook = null;
  // Since the data did commit, boot must preserve it and offer the retained Undo.
  const fresh = harness({ values: h.values });
  assert.equal(fresh.backup.recoverInterruptedRestore(), false);
  assert.equal(fresh.backup.getLastRestoreInfo().undoAvailable, true);
  await fresh.backup.undoLastRestore();
  assert.deepEqual(valuesObject(fresh.values), valuesObject(before));
});

await test('persistent apply and rollback failure retains journal and blocks restore', async () => {
  const h = harness(), before = new Map(h.values);
  h.storage.hook = ({ op, key }) => {
    if (op === 'set' && (key === 'word_v1__target' || key === HUB && h.values.has(JOURNAL))) {
      throw errorNamed('SecurityError', 'Persistent storage failure');
    }
  };
  await assert.rejects(h.import(targetEnvelope()), error => error.recoveryRequired === true);
  const retained = JSON.parse(h.values.get(JOURNAL));
  assert.equal(retained.phase, 'prepared');
  assert.deepEqual(retained.before, valuesObject(before));
  assert.equal(h.reloads, 0);
  await assert.rejects(h.import(targetEnvelope()), /Persistent storage failure/);
  assert.deepEqual(JSON.parse(h.values.get(JOURNAL)).before, valuesObject(before));
  assert.equal(h.reloads, 0);
  const blockedValues = new Map(h.values);
  assert.throws(() => h.context.KLS.progress.createProfile({ displayName: 'Blocked' }), /restore is in progress/);
  assertSameStorage(h.values, blockedValues, 'prepared journal must also block ordinary progress writes');
  h.storage.hook = null;
  assert.equal(h.backup.recoverInterruptedRestore(), true);
  assertSameStorage(h.values, before);
});

await test('expired prepared journal recovers interrupted apply on a new boot', async () => {
  const before = initialValues(), during = new Map(before);
  during.set(HUB, JSON.stringify(targetEnvelope().hub));
  during.delete('word_v1__alice');
  during.set('word_v1__target', '{"partial":true}');
  during.set(JOURNAL, JSON.stringify({
    version: 1, phase: 'prepared', ownerId: 'closed-browser-owner', createdAt: NOW - 6000,
    before: valuesObject(before), after: { [HUB]: JSON.stringify(targetEnvelope().hub) },
  }));
  const h = harness({ values: during });
  assert.equal(h.backup.recoverInterruptedRestore(), true);
  assertSameStorage(h.values, before);
  assert.equal(h.backup.recoverInterruptedRestore(), false);
  assert.equal(h.context.KLS.progress.get().profile.id, 'alice');
});

await test('another live restore lease blocks recovery without touching data', async () => {
  const values = initialValues();
  values.set(JOURNAL, JSON.stringify({ version: 1, phase: 'prepared', ownerId: 'active-other-tab',
    createdAt: NOW, before: valuesObject(values), after: {} }));
  const before = new Map(values), h = harness({ values });
  assert.throws(() => h.backup.recoverInterruptedRestore(), /Another restore/);
  assertSameStorage(h.values, before);
  assert.equal(h.storage.operations.length, 0);
  h.tick(6000);
  assert.equal(h.backup.recoverInterruptedRestore(), true);
});

await test('committed journal supplies Undo and redo across fresh module boots', async () => {
  const h = harness(), before = new Map(h.values);
  await h.import(targetEnvelope());
  const restored = new Map(h.values);
  const undo = harness({ values: h.values });
  assert.equal(undo.backup.recoverInterruptedRestore(), false);
  assert.equal(undo.backup.getLastRestoreInfo().undoAvailable, true);
  await undo.backup.undoLastRestore();
  assert.deepEqual(valuesObject(undo.values), valuesObject(before));
  assert.equal(undo.backup.getLastRestoreInfo().kind, 'undo');
  const redo = harness({ values: undo.values });
  await redo.backup.undoLastRestore();
  assert.deepEqual(valuesObject(redo.values), valuesObject(restored));
  assert.equal(redo.backup.getLastRestoreInfo().kind, 'restore');
  assert.equal(undo.reloads, 1);
  assert.equal(redo.reloads, 1);
  for (const [key, value] of before) if (!isProgress(key)) assert.equal(redo.values.get(key), value);
});

await test('unknown slugs and storage bases are skipped without arbitrary writes', async () => {
  const h = harness(), envelope = targetEnvelope();
  envelope.games.removed = { target: '{"old":true}' };
  envelope.games.word.target.unregistered_base = '{"hidden":true}';
  const prepared = await h.backup.prepareImport({ body: JSON.stringify(envelope), size: 100 });
  assert.equal(prepared.warnings.length, 1);
  assert.match(prepared.warnings[0], /removed/);
  await h.import(envelope);
  assert.equal(h.values.has('unregistered_base__target'), false);
  assert.equal(h.values.has('undefined__target'), false);
  assert.equal(h.values.get('word_v1__target'), envelope.games.word.target.word_v1);
});

await test('IDB open failure reports real health and restore retains journal Undo', async () => {
  const idb = fakeIDB({ openError: true }), h = harness({ idb });
  const status = await h.backup.getBackupHealth();
  assert.equal(status.snapshotState, 'error');
  assert.match(status.snapshotError, /IndexedDB is unavailable/);
  assert.equal(await h.backup.takeSnapshotNow({ label: 'Manual', mirror: false }), false);
  await h.import(targetEnvelope());
  assert.equal(h.backup.getLastRestoreInfo().undoAvailable, true);
  assert.equal(h.reloads, 1);
  await h.backup.undoLastRestore();
  assert.deepEqual(valuesObject(h.values), valuesObject(initialValues()));
});

for (const failure of ['writeError', 'writeAbort']) {
  await test('IDB ' + failure + ' returns false and exposes snapshot error', async () => {
    const idb = fakeIDB({ [failure]: true }), h = harness({ idb });
    assert.equal(await h.backup.takeSnapshotNow({ label: 'Manual', mirror: false }), false);
    const status = await h.backup.getBackupHealth();
    assert.equal(status.snapshotState, 'error');
    assert.match(status.snapshotError, /quota exceeded|aborted/);
    assert.equal(status.momentCount, 0);
    assert.equal(idb.stats.writes, 1);
    await h.import(targetEnvelope());
    assert.equal(h.backup.getLastRestoreInfo().undoAvailable, true);
  });
}

await test('successful IDB snapshot writes acknowledged data and timeline restore works', async () => {
  const idb = fakeIDB(), h = harness({ idb });
  assert.equal(await h.backup.takeSnapshotNow({ label: 'Original', mirror: false }), true);
  const moments = await h.backup.getSnapshotsMeta();
  assert.equal(moments.length, 1);
  assert.equal(moments[0].label, 'Original');
  const status = await h.backup.getBackupHealth();
  assert.equal(status.snapshotState, 'ready');
  assert.equal(status.momentCount, 1);
  await h.import(targetEnvelope());
  await h.backup.restoreSnapshot(moments[0].ts);
  const expected = initialValues(); expected.delete('kls.progress.v1');
  assert.deepEqual(valuesObject(h.values), valuesObject(expected));
  assert.equal(h.reloads, 2);
  const times = [...idb.stores.get('snapshots').keys()];
  assert.equal(new Set(times).size, times.length, 'same clock tick must not overwrite snapshots');
});

console.log('smoke-restore-safety: OK (' + count + ' scenarios)');
