/** Disk-write regressions for backup.js. No browser, network, or real save files.
 * Run: node tests/smoke-backup-writes.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { Blob } from 'node:buffer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'shared/scripts/backup.js'), 'utf8');
const LAST_MIRROR = 'kls.backup.lastMirrorAt';
const THROTTLE = 180000;
const drain = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

function harness(options = {}) {
  let now = Date.UTC(2026, 9, 8, 12), nextTimer = 1, random = 0;
  const timers = new Map(), events = [], files = new Map(), downloads = [], fetches = [], posts = [], beacons = [];
  const storage = new Map(), listeners = new Map(), subscriptions = [];
  const config = { server: true, postFailure: false, permission: 'granted', ...options };
  const handles = new Map(), snapshots = new Map();
  let activeWriters = 0, maxWriters = 0;
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const clock = {
    setTimeout(fn, delay = 0) { const id = nextTimer++; timers.set(id, { at: now + Number(delay), fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async tick(amount) {
      const target = now + amount;
      await drain();
      for (let count = 0; count < 1000; count++) {
        const due = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
        if (!due.length) { now = target; await drain(); return; }
        const [id, timer] = due[0]; timers.delete(id); now = timer.at; timer.fn(); await drain();
      }
      throw new Error('Fake timer did not settle.');
    },
  };
  const localStorage = {
    get length() { return storage.size; }, key(i) { return [...storage.keys()][i] ?? null; },
    getItem(k) { return storage.get(k) ?? null; }, setItem(k, v) { storage.set(k, String(v)); }, removeItem(k) { storage.delete(k); },
  };
  function directory(prefix = '') {
    return {
      name: prefix ? 'saved_status' : 'Test folder', kind: 'directory',
      queryPermission: async () => config.permission, requestPermission: async () => config.permission,
      async getDirectoryHandle(name) { events.push(['directory', prefix + name]); return directory(prefix + name + '/'); },
      async getFileHandle(name, opts = {}) {
        const path = prefix + name;
        events.push(['handle', path]);
        if (!files.has(path)) {
          if (!opts.create) {
            const error = new Error('File not found: ' + path); error.name = 'NotFoundError'; throw error;
          }
          files.set(path, '');
        }
        return {
          kind: 'file', name,
          getFile: async () => ({ text: async () => files.get(path), lastModified: now, size: files.get(path).length }),
          async createWritable() {
            let text, active = true;
            activeWriters++; maxWriters = Math.max(maxWriters, activeWriters);
            return {
              async write(value) {
                events.push(['write', path]);
                if (config.onWrite) await config.onWrite(path, value);
                text = value;
              },
              async close() {
                events.push(['close', path]);
                try {
                  if (config.onClose) await config.onClose(path, text);
                  files.set(path, config.corruptHistory && path.startsWith('saved_status/') ? 'truncated' : text);
                } finally { if (active) { activeWriters--; active = false; } }
              },
              async abort() { if (active) { activeWriters--; active = false; } },
            };
          },
        };
      },
      async *entries() {
        for (const path of files.keys()) {
          if (path.startsWith(prefix) && !path.slice(prefix.length).includes('/')) yield [path.slice(prefix.length), await this.getFileHandle(path.slice(prefix.length))];
        }
      },
      async removeEntry(name) { files.delete(prefix + name); events.push(['remove', prefix + name]); },
    };
  }
  const folder = directory();
  if (config.folder) handles.set('lastDirHandle', folder);
  const indexedDB = {
    open() {
      const req = {};
      queueMicrotask(() => {
        if (config.idbFailure) { req.error = new Error('IndexedDB unavailable'); req.onerror?.(); return; }
        req.result = {
          objectStoreNames: { contains: () => true },
          transaction(name) {
            const map = name === 'handles' ? handles : snapshots;
            const tx = {};
            const request = operation => {
              const result = {};
              queueMicrotask(() => {
                try { result.result = operation(); result.onsuccess?.(); tx.oncomplete?.(); }
                catch (e) { result.error = tx.error = e; result.onerror?.(); tx.onerror?.(); }
              });
              return result;
            };
            tx.objectStore = () => ({
              get: key => request(() => map.get(key)), getAll: () => request(() => [...map.values()]),
              put: (value, key) => request(() => map.set(key ?? value.ts, value)),
              add: value => request(() => {
                if (map.has(value.ts)) throw new Error('Duplicate snapshot');
                return map.set(value.ts, value);
              }),
              delete: key => request(() => map.delete(key)),
            });
            return tx;
          },
        };
        req.onsuccess?.();
      });
      return req;
    },
  };
  const response = (ok, obj, status = ok ? 200 : 503) => ({ ok, status, json: async () => obj });
  const fetch = async (url, init = {}) => {
    fetches.push({ url, at: now });
    if (url === '/__kls_ping__') return response(config.server, { kls: true, folder: 'Test folder', count: posts.length });
    assert.equal(url, '/__kls_save__');
    const env = JSON.parse(init.body), marker = JSON.parse(env.games.demo.p_a).marker;
    posts.push(marker); events.push(['post-start', marker]);
    if (config.onPost) await config.onPost(env);
    events.push(['post-end', marker]);
    return response(!config.postFailure, { ok: !config.postFailure, file: 'saved_status/test.json', count: posts.length });
  };
  const fakeMath = Object.create(Math);
  fakeMath.random = () => config.fixedRandom ?? (++random % 99991) / 99991;
  const window = {
    KLS: { GAMES: [{ slug: 'demo', storageBase: 'demo_v1' }], progress: {
      subscribe(fn) { subscriptions.push(fn); return () => {}; },
    } },
    confirm: () => true,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
  };
  if (config.folder || config.picker) window.showDirectoryPicker = async () => folder;
  const document = {
    visibilityState: 'visible', body: { append() {} },
    createElement() { return { click() { downloads.push(this.download); }, remove() {} }; },
  };
  const navigator = { sendBeacon(url, blob) { beacons.push({ url, blob }); return config.beacon ?? false; } };
  const context = { window, document, navigator, localStorage, location: { protocol: config.protocol ?? 'http:' },
    FileReader: class { readAsText(file) { file.text().then(text => { this.result = text; this.onload?.(); }); } },
    fetch, Date: FakeDate, Math: fakeMath, Blob, console, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} } };
  if (!config.noIDB) context.indexedDB = indexedDB;
  runInNewContext(source, context);
  const api = window.KLS.backup;
  localStorage.setItem('kls.progress.v2', JSON.stringify({ version: 2, activeProfileId: 'p_a', profiles: {
    p_a: { id: 'p_a', displayName: 'Ana', avatar: 'ðŸ¦Š', games: {} },
  } }));
  const setMarker = marker => localStorage.setItem('demo_v1__p_a', JSON.stringify({ marker }));
  setMarker(1);
  return { api, folder, files, events, posts, fetches, downloads, beacons, storage, config, clock, timers,
    now: () => now, maxWriters: () => maxWriters, setMarker,
    change(marker) { setMarker(marker); subscriptions.forEach(fn => fn()); },
    dispatch(type) { (listeners.get(type) ?? []).forEach(fn => fn({ key: 'demo_v1__p_a' })); },
    latestMarker() { return JSON.parse(JSON.parse(files.get('kls-backup-latest.json')).games.demo.p_a).marker; },
    historyMarkers() { return [...files].filter(([p, text]) => p.startsWith('saved_status/') && text)
      .map(([, text]) => JSON.parse(JSON.parse(text).games.demo.p_a).marker); },
  };
}

let tests = 0;
async function test(name, action) {
  await action(); tests++; console.log('ok ' + tests + ' - ' + name);
}

await test('same-instant folder histories are distinct and history closes before latest', async () => {
  const h = harness({ folder: true });
  const date = new Date(h.now());
  const first = await h.api._internals.writeHistoryToFolder(h.folder, h.api._internals.buildEnvelope(), date);
  h.setMarker(2);
  const second = await h.api._internals.writeHistoryToFolder(h.folder, h.api._internals.buildEnvelope(), date);
  assert.notEqual(first, second);
  assert.deepEqual(h.historyMarkers(), [1, 2]);
  assert.equal(h.latestMarker(), 2);
  const closes = h.events.filter(([kind]) => kind === 'close').map(([, path]) => path);
  assert.deepEqual(closes, ['saved_status/' + first, 'kls-backup-latest.json', 'saved_status/' + second, 'kls-backup-latest.json']);
});

await test('repeated randomness cannot overwrite a same-instant history', async () => {
  const h = harness({ folder: true, fixedRandom: 0.125 });
  const date = new Date(h.now());
  const first = await h.api._internals.writeHistoryToFolder(h.folder, h.api._internals.buildEnvelope(), date);
  h.setMarker(2);
  const second = await h.api._internals.writeHistoryToFolder(h.folder, h.api._internals.buildEnvelope(), date);
  assert.notEqual(first, second, 'a repeated suffix must not overwrite committed history');
  assert.deepEqual(h.historyMarkers(), [1, 2]);
});

await test('failed or unverified history cannot replace current latest', async () => {
  for (const corrupt of [false, true]) {
    const h = harness({ folder: true });
    await h.api._internals.writeHistoryToFolder(h.folder, h.api._internals.buildEnvelope(), new Date(h.now()));
    const previous = h.files.get('kls-backup-latest.json'), start = h.events.length;
    h.setMarker(2);
    if (corrupt) h.config.corruptHistory = true;
    else h.config.onWrite = async path => { if (path.startsWith('saved_status/')) throw new Error('History write failed'); };
    await assert.rejects(h.api._internals.writeHistoryToFolder(h.folder, h.api._internals.buildEnvelope(), new Date(h.now())));
    assert.equal(h.files.get('kls-backup-latest.json'), previous);
    assert.ok(!h.events.slice(start).some(([kind, path]) => kind === 'handle' && path === 'kls-backup-latest.json'));
    assert.equal(h.files.size, 2, 'failed history entries must not count toward retention or evict valid backups later');
    assert.deepEqual(h.historyMarkers(), [1]);
  }
});

await test('latest close failure leaves previous latest and complete new history', async () => {
  const h = harness({ folder: true });
  await h.api._internals.writeHistoryToFolder(h.folder, h.api._internals.buildEnvelope(), new Date(h.now()));
  const previous = h.files.get('kls-backup-latest.json');
  h.setMarker(2);
  h.config.onClose = async path => { if (path === 'kls-backup-latest.json') throw new Error('Latest close failed'); };
  await assert.rejects(h.api._internals.writeHistoryToFolder(h.folder, h.api._internals.buildEnvelope(), new Date(h.now())));
  assert.equal(h.files.get('kls-backup-latest.json'), previous);
  assert.deepEqual(h.historyMarkers(), [1, 2]);
});

await test('negative server detection is cached briefly and re-probed after recovery', async () => {
  const h = harness({ server: false, noIDB: true });
  assert.equal((await h.api.getSaveTargetStatus()).mode, 'none');
  const initial = h.fetches.length;
  h.config.server = true;
  assert.equal((await h.api.getSaveTargetStatus()).mode, 'none');
  assert.equal(h.fetches.length, initial);
  await h.clock.tick(2001);
  assert.equal((await h.api.getSaveTargetStatus()).mode, 'server');
  assert.ok(h.fetches.length > initial);
});

await test('failed positive server autosave falls back to the connected folder', async () => {
  const h = harness({ folder: true, server: true, postFailure: true });
  h.api.initSnapshots(); await h.clock.tick(10000);
  assert.deepEqual(h.posts, [1]);
  assert.equal(h.latestMarker(), 1);
  const health = await h.api.getBackupHealth();
  assert.equal(health.diskState, 'saved'); assert.equal(health.diskError, null);
  assert.ok(health.lastDiskAt);
});

await test('throttled newest revision eventually flushes without another progress event', async () => {
  const h = harness({ noIDB: true });
  h.api.initSnapshots(); await h.clock.tick(10000);
  assert.deepEqual(h.posts, [1]);
  h.change(2); await h.clock.tick(10000);
  assert.equal((await h.api.getBackupHealth()).diskState, 'pending');
  h.change(3); await h.clock.tick(10000);
  assert.deepEqual(h.posts, [1]);
  await h.clock.tick(THROTTLE - 20000);
  assert.deepEqual(h.posts, [1, 3]);
  assert.equal((await h.api.getBackupHealth()).diskState, 'saved');
});

await test('manual and automatic folder writes serialize and old pending revisions cannot overwrite newer manual data', async () => {
  const gate = deferred(); let blocked = false;
  const h = harness({ folder: true, server: false, onWrite: async path => {
    if (!blocked && path.startsWith('saved_status/')) { blocked = true; await gate.promise; }
  } });
  h.api.initSnapshots(); await h.clock.tick(10000);
  assert.ok(blocked);
  h.setMarker(2); const manual = h.api.saveMyGame();
  h.change(2); await h.clock.tick(10000);
  h.setMarker(3); gate.resolve();
  assert.equal((await manual).mode, 'folder'); await drain();
  assert.equal(h.maxWriters(), 1);
  assert.deepEqual(h.historyMarkers(), [1, 3]);
  assert.equal(h.latestMarker(), 3);
  await h.clock.tick(THROTTLE * 2);
  assert.equal(h.latestMarker(), 3);
  assert.deepEqual(h.historyMarkers(), [1, 3]);
});

await test('missing IndexedDB still schedules external autosaves and reports unavailable local snapshots', async () => {
  const h = harness({ noIDB: true });
  h.api.initSnapshots(); await h.clock.tick(10000);
  assert.deepEqual(h.posts, [1]);
  const health = await h.api.getBackupHealth();
  assert.equal(health.snapshotState, 'unavailable'); assert.equal(health.diskState, 'saved');
});

await test('failed IndexedDB does not prevent acknowledged external autosaves', async () => {
  const h = harness({ idbFailure: true });
  h.api.initSnapshots(); await h.clock.tick(10000);
  assert.deepEqual(h.posts, [1]);
  const health = await h.api.getBackupHealth();
  assert.equal(health.snapshotState, 'error'); assert.match(health.snapshotError, /IndexedDB/);
  assert.equal(health.diskState, 'saved');
});

await test('sendBeacon false uses the forced normal-save fallback', async () => {
  const h = harness({ noIDB: true, beacon: false });
  h.api.initSnapshots(); await h.clock.tick(10000);
  h.setMarker(2); h.dispatch('pagehide'); await drain();
  assert.equal(h.beacons.length, 1);
  assert.deepEqual(h.posts, [1, 2]);
  assert.equal(JSON.parse(JSON.parse(await h.beacons[0].blob.text()).games.demo.p_a).marker, 2);
});

await test('queued beacon does not claim an acknowledged newer disk save', async () => {
  const h = harness({ noIDB: true, beacon: true });
  h.api.initSnapshots(); await h.clock.tick(10000);
  const confirmed = (await h.api.getBackupHealth()).lastDiskAt;
  await h.clock.tick(1000); h.setMarker(2); h.dispatch('pagehide'); await drain();
  assert.deepEqual(h.posts, [1]);
  assert.equal(h.beacons.length, 1);
  assert.equal((await h.api.getBackupHealth()).lastDiskAt, confirmed);
});

await test('download request is distinct from confirmed disk persistence', async () => {
  const h = harness({ protocol: 'file:', noIDB: true });
  assert.equal((await h.api.saveMyGame()).mode, 'download');
  const health = await h.api.getBackupHealth();
  assert.equal(health.diskState, 'download-requested');
  assert.equal(health.lastDiskAt, null);
  assert.equal(h.storage.get(LAST_MIRROR), undefined);
  assert.equal(h.downloads.length, 1);
});

await test('server save is confirmed only after its response arrives', async () => {
  const gate = deferred(); const h = harness({ noIDB: true, onPost: () => gate.promise });
  const save = h.api.saveMyGame(); await drain();
  assert.deepEqual(h.posts, [1]);
  assert.notEqual((await h.api.getBackupHealth()).diskState, 'saved');
  assert.equal((await h.api.getBackupHealth()).lastDiskAt, null);
  gate.resolve(); assert.equal((await save).mode, 'server');
  assert.equal((await h.api.getBackupHealth()).diskState, 'saved');
  assert.ok(h.storage.get(LAST_MIRROR));
});

await test('folder permission loss is visible and cannot claim a confirmed write', async () => {
  const h = harness({ server: false, folder: true, permission: 'denied' });
  h.api.initSnapshots(); await h.clock.tick(10000);
  const health = await h.api.getBackupHealth();
  assert.equal(health.diskState, 'error'); assert.match(health.diskError, /Reconnect/);
  assert.equal(health.lastDiskAt, null);
  assert.equal(h.files.size, 0);
});

await test('corrupt automatic source data cannot replace a valid disk backup or become a recovery snapshot', async () => {
  const h = harness({ folder: true, server: false });
  h.api.initSnapshots(); await h.clock.tick(10000);
  const previous = h.files.get('kls-backup-latest.json');
  const before = (await h.api.getSnapshotsMeta()).length;
  h.storage.set('demo_v1__p_a', 'not JSON');
  h.dispatch('pagehide'); await drain();
  assert.equal(h.files.get('kls-backup-latest.json'), previous, 'invalid automatic envelope must preserve the confirmed backup');
  const health = await h.api.getBackupHealth();
  assert.equal(health.diskState, 'error');
  assert.equal(health.snapshotState, 'error');
  assert.equal((await h.api.getSnapshotsMeta()).length, before, 'invalid source data must not become a recovery moment');
});

await test('connected folder history is listed and previewed without writing or prompting', async () => {
  const h = harness({ server: false, folder: true });
  await h.api.saveMyGame();
  const before = [...h.files];
  const catalog = await h.api.getRestorePoints();
  assert.equal(catalog.points.length, 1);
  assert.equal(catalog.points[0].source, 'folder');
  const prepared = await h.api.prepareRestorePoint(catalog.points[0]);
  assert.equal(JSON.parse(prepared.envelope.games.demo.p_a).marker, 1);
  assert.equal(prepared.summary.profiles[0].name, 'Ana');
  assert.deepEqual([...h.files], before);
  h.storage.delete('kls.progress.v2');
  assert.equal((await h.api.checkStartupRecovery()).points.length, 1);
  assert.deepEqual([...h.files], before);
});

await test('permission loss is a recoverable read warning before new profile setup', async () => {
  const h = harness({ server: false, folder: true, permission: 'denied' });
  h.storage.delete('kls.progress.v2');
  const recovery = await h.api.checkStartupRecovery();
  assert.equal(recovery.points.length, 0);
  assert.match(recovery.warnings[0], /needs permission/);
  assert.equal(h.files.size, 0);
});

console.log(`smoke-backup-writes: ${tests} checks passed`);
