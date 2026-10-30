/* Exercise the actual Parent UI, util, progress, and backup modules together.
 * DOM, files, localStorage, and IndexedDB are isolated in memory.
 * Run: node tests/smoke-parent-restore-ui.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL('shared/scripts/' + name, root), 'utf8');
const copy = x => JSON.parse(JSON.stringify(x));
const HUB = 'kls.progress.v2';
const NOW = Date.parse('2026-10-08T12:00:00Z');
const GAMES = [{ slug: 'word-problem-adventure', storageBase: ['wordProblemAdventure_v1', 'wordProblemAdventure_wrongs_v1'] }];
const profile = (id, name) => ({ id, displayName: name, avatar: '🦊', createdAt: '2026-01-01T00:00:00Z', lastActiveAt: '2026-01-01T00:00:00Z', games: {} });
const hub = (id, name) => ({ version: 2, activeProfileId: id, profiles: { [id]: profile(id, name) } });
const envelope = () => ({ type: 'kls.backup', version: 1, hubVersion: 2, exportedBy: 'Kids Learning Space', exportedAt: '2026-10-07T12:00:00Z',
  hub: hub('bob', 'Bob'), games: { 'word-problem-adventure': { bob: {
    wordProblemAdventure_v1: '{"journey":{"lesson":7}}', wordProblemAdventure_wrongs_v1: '{"byType":{}}',
  } } } });
const initial = () => new Map([
  [HUB, JSON.stringify(hub('alice', 'Alice'))],
  ['wordProblemAdventure_v1__alice', '{"journey":{"lesson":2}}'],
  ['wordProblemAdventure_wrongs_v1__alice', '{"byType":{"old":[{"qid":"old"}]}}'],
  ['kls.audio.muted.v1', '1'], ['wordProblemAdventure_muted', '1'],
  ['wordProblemAdventure_v1', '{"standalone":true}'], ['other.app', 'preserve'],
]);

class Element {
  constructor(tag, doc, text = null) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.nodeType = text === null ? 1 : 3;
    this.attrs = {}; this.dataset = {}; this.childNodes = []; this.parentElement = null;
    this.events = new Map(); this.disabled = false; this.hidden = false; this.value = ''; this.files = [];
    this._text = text;
    this.classList = {
      contains: x => this.className.split(/\s+/).includes(x),
      add: x => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), x])].join(' '); },
      remove: x => { this.className = this.className.split(/\s+/).filter(v => v !== x).join(' '); },
    };
  }
  get children() { return this.childNodes.filter(x => x.nodeType === 1); }
  get className() { return this.attrs.class || ''; }
  set className(x) { this.attrs.class = String(x); }
  get id() { return this.attrs.id || ''; }
  get textContent() { return this.nodeType === 3 ? this._text : this.childNodes.map(x => x.textContent).join(''); }
  set textContent(x) { this.clear(); this.append(this.ownerDocument.createTextNode(String(x))); }
  clear() { for (const child of this.childNodes) child.parentElement = null; this.childNodes = []; }
  set innerHTML(x) { assert.equal(x, '', 'this fake DOM deliberately supports clearing only'); this.clear(); }
  get innerHTML() { return this.textContent; }
  get isConnected() { return this === this.ownerDocument.body || !!this.parentElement?.isConnected; }
  append(...xs) { for (const x of xs.flat()) { const node = x?.nodeType ? x : this.ownerDocument.createTextNode(String(x)); node.parentElement = this; this.childNodes.push(node); } }
  appendChild(x) { this.append(x); return x; }
  remove() { if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter(x => x !== this); this.parentElement = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'disabled') this.disabled = true; if (k === 'hidden') this.hidden = true; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  hasAttribute(k) { return Object.hasOwn(this.attrs, k); }
  addEventListener(k, fn) { if (!this.events.has(k)) this.events.set(k, []); this.events.get(k).push(fn); }
  focus() { this.ownerDocument.activeElement = this; }
  emit(k) { const event = { target: this, preventDefault() {} }; return (this.events.get(k) || []).map(fn => fn.call(this, event)); }
  click() { if (!this.disabled) return this.emit('click'); return []; }
  matches(selector) {
    if (selector[0] === '#') return this.id === selector.slice(1);
    if (selector[0] === '.') return this.classList.contains(selector.slice(1));
    const match = selector.match(/^([\w-]+)(?:\[([\w-]+)="([^"]*)"\])?$/);
    return !!match && this.tagName === match[1].toUpperCase() && (!match[2] || this.getAttribute(match[2]) === match[3]);
  }
  querySelectorAll(selector) { const found = []; for (const child of this.children) { if (child.matches(selector)) found.push(child); found.push(...child.querySelectorAll(selector)); } return found; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function fakeIDB({ openError = false, writeError = false } = {}) {
  const stores = new Map([['handles', new Map()], ['snapshots', new Map()]]);
  const db = { objectStoreNames: { contains: k => stores.has(k) }, createObjectStore(k) { stores.set(k, new Map()); }, transaction(name) {
    const tx = {}, store = stores.get(name);
    const read = get => { const req = {}; queueMicrotask(() => { req.result = get(); req.onsuccess?.(); }); return req; };
    const write = action => { const req = {}; queueMicrotask(() => {
      if (writeError) { tx.error = new Error('Snapshot quota exceeded'); tx.onerror?.(); }
      else { action(); tx.oncomplete?.(); }
    }); return req; };
    tx.objectStore = () => ({ get: k => read(() => store.get(k)), getAll: () => read(() => [...store.values()]),
      add: v => write(() => store.set(v.ts, copy(v))), put: (v, k = v.ts) => write(() => store.set(k, copy(v))), delete: k => write(() => store.delete(k)) });
    return tx;
  } };
  return { stores, api: { open() { const req = {}; queueMicrotask(() => {
    if (openError) { req.error = new Error('IndexedDB is blocked'); req.onerror?.(); }
    else { req.result = db; req.onsuccess?.(); }
  }); return req; } } };
}

function harness({ idb = null, server = null, empty = false } = {}) {
  const values = initial(), operations = [], alerts = [], timers = new Map(); let reloads = 0, timerId = 0;
  if (empty) values.clear();
  const requests = [];
  const storage = { get length() { return values.size; }, key: n => [...values.keys()][n] ?? null,
    getItem: k => values.get(k) ?? null,
    setItem(k, v) { operations.push(['set', k, String(v)]); values.set(k, String(v)); },
    removeItem(k) { operations.push(['remove', k]); values.delete(k); } };
  const doc = { activeElement: null, visibilityState: 'visible',
    createElement: tag => new Element(tag, doc), createTextNode: x => new Element('#text', doc, String(x)),
    querySelector: sel => doc.body.querySelector(sel), querySelectorAll: sel => doc.body.querySelectorAll(sel) };
  doc.body = new Element('body', doc);
  for (const id of ['hub-root', 'stage-root']) { const n = doc.createElement('div'); n.setAttribute('id', id); doc.body.append(n); }
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } }
  const ctx = vm.createContext({ document: doc, localStorage: storage, Date: TestDate,
    navigator: {}, location: { protocol: server ? 'http:' : 'file:', hash: '#/parent', reload() { reloads++; } },
    console: { warn() {}, error() {}, info() {} }, alert: msg => alerts.push(msg),
    confirm() { throw new Error('Native confirm must not be used by restore UI.'); },
    prompt() { throw new Error('Native prompt must not be used by restore UI.'); },
    addEventListener() {}, setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    fetch: async (url, init = {}) => {
      requests.push({ url, method: init.method || 'GET' });
      if (url === '/__kls_ping__') return { ok: !!server, json: async () => ({ kls: true, folder: 'Test app', count: 1, lastSavedAt: envelope().exportedAt }) };
      if (url === '/__kls_backups__') return { ok: !server.failCatalog, json: async () => ({ points: server.points || [
        { id: 'latest', ts: envelope().exportedAt, summary: { profiles: [{ name: 'Bob', avatar: 'Fox', stars: 0, stickers: 0 }] } }
      ], warnings: server.warnings || [] }) };
      if (url === '/__kls_backups__/latest') return { ok: true, json: async () => server.envelope || envelope() };
      throw new Error('Unexpected request: ' + url);
    },
    FileReader: class { readAsText(file) { queueMicrotask(() => { this.result = file.body; this.onload?.(); }); } },
    KLS: { GAMES: copy(GAMES), chrome: { registerSlugs() {}, unmount() {}, async flushSession() { return { ok: true }; }, detachSession() {} } },
  }); ctx.window = ctx;
  if (idb) ctx.indexedDB = idb.api;
  for (const file of ['util.js', 'progress.js', 'backup.js', 'profile-ui.js']) vm.runInContext(source(file), ctx, { filename: file });
  const root = doc.querySelector('#hub-root');
  const button = label => {
    const found = root.querySelectorAll('button').find(x => x.textContent === label);
    assert.ok(found, 'button should exist: ' + label); return found;
  };
  const render = async () => { ctx.KLS.profileUI.renderParent(); await settle(); };
  const upload = async data => {
    const input = root.querySelector('input[type="file"]'); assert.ok(input);
    input.files = [{ body: typeof data === 'string' ? data : JSON.stringify(data) }]; input.emit('change');
    await settle();
  };
  return { ctx, root, values, operations, alerts, requests, timers, doc, button, render, upload, get reloads() { return reloads; } };
}
// Promise jobs include actual FileReader, IDB, health refresh, and restore queues.
async function settle() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
const sameStorage = (h, old, message) => assert.deepEqual([...h.values].sort(), [...old].sort(), message);
const preferences = h => Object.fromEntries([...h.values].filter(([k]) => ['kls.audio.muted.v1', 'wordProblemAdventure_muted', 'wordProblemAdventure_v1', 'other.app'].includes(k)));
// File selection opens a read-only preview; a separate explicit button applies.
{
  const h = harness(); await h.render(); const before = new Map(h.values);
  const input = h.root.querySelector('input[type="file"]'); input.files = [{ body: JSON.stringify(envelope()) }];
  input.emit('change');
  assert.match(h.root.querySelector('.parent-backup__preview').textContent, /Checking the backup/);
  sameStorage(h, before, 'preflight starts before any write');
  await settle();
  assert.match(h.root.querySelector('.parent-backup__preview').textContent, /Profiles in this backup: .*Bob/);
  assert.match(h.root.querySelector('.parent-backup__preview').textContent, /Device preferences and standalone saves are preserved/);
  assert.equal(h.root.querySelector('#restore-confirmation'), null, 'no typed confirmation');
  assert.ok(h.button('Replace all profiles and progress'));
  sameStorage(h, before, 'preview is read-only');
  h.button('Cancel restore').click();
  assert.equal(h.root.querySelector('.parent-backup__preview').hidden, true);
  sameStorage(h, before, 'cancelling is safe'); assert.equal(h.operations.length, 0);
  assert.doesNotMatch(h.root.textContent, /Save my game|Save to folder now|Export a file/);
}
const badStars = envelope();
badStars.hub.profiles.bob.games.bad = { levels: { one: { stars: 4 } } };
for (const invalid of ['{bad JSON', { type: 'kls.backup', version: 1, hub: { ...hub('bob', 'Bob'), activeProfileId: 'missing' }, games: {} }, badStars]) {
  const h = harness(); await h.render(); const before = new Map(h.values);
  await h.upload(invalid);
  assert.match(h.root.querySelector('.parent-backup__preview').textContent, /Progress is unchanged/);
  assert.equal(h.root.querySelectorAll('button').some(b => b.textContent === 'Replace all profiles and progress'), false);
  sameStorage(h, before, 'invalid backup must be strictly rejected'); assert.equal(h.operations.length, 0);
}
// Successful old-format file import and persistent Undo/Redo without IndexedDB.
{
  const h = harness(); await h.render(); const pref = preferences(h), before = new Map(h.values);
  await h.upload(envelope()); h.button('Replace all profiles and progress').click(); await settle();
  assert.equal(h.reloads, 1); assert.equal(JSON.parse(h.values.get(HUB)).activeProfileId, 'bob');
  assert.equal(h.values.has('wordProblemAdventure_v1__alice'), false);
  assert.equal(h.values.get('wordProblemAdventure_v1__bob'), '{"journey":{"lesson":7}}');
  assert.deepEqual(preferences(h), pref);
  await h.render(); const restored = new Map(h.values);
  h.button('Undo restore').click(); sameStorage(h, restored, 'first undo click never mutates');
  h.button('Cancel restore').click(); sameStorage(h, restored, 'undo cancel preserves import');
  h.button('Undo restore').click(); h.button('Confirm undo').click(); await settle();
  assert.equal(h.reloads, 2); assert.equal(h.values.get(HUB), before.get(HUB));
  assert.equal(h.values.get('wordProblemAdventure_v1__alice'), before.get('wordProblemAdventure_v1__alice'));
  assert.equal(h.values.has('wordProblemAdventure_v1__bob'), false); assert.deepEqual(preferences(h), pref);
  await h.render(); const undone = new Map(h.values);
  h.button('Redo restore').click(); sameStorage(h, undone, 'first redo click never mutates');
  h.button('Cancel restore').click(); sameStorage(h, undone, 'redo cancel preserves undo');
  h.button('Redo restore').click(); h.button('Confirm redo').click(); await settle();
  assert.equal(h.reloads, 3); assert.equal(h.values.get(HUB), restored.get(HUB));
  assert.deepEqual(preferences(h), pref); assert.deepEqual(h.alerts, []);
}
// Browser and launcher backups share the same preview / confirm flow.
for (const fromServer of [false, true]) {
  const idb = fakeIDB(); const ts = new Date(NOW - 60 * 60 * 1000).toISOString();
  if (!fromServer) idb.stores.get('snapshots').set(ts, { ts, envelope: envelope(), summary: { profiles: [{ name: 'Bob', avatar: 'Fox', stars: 0, stickers: 0 }] } });
  const h = harness({ idb, server: fromServer ? {} : null }); await h.render();
  const before = new Map(h.values), pref = preferences(h);
  h.button('Restore progress').click(); await settle();
  assert.match(h.root.textContent, fromServer ? /Folder backup/ : /Browser backup/);
  h.button('Review latest backup').click(); await settle();
  sameStorage(h, before, 'review never mutates');
  h.button('Cancel restore').click(); sameStorage(h, before, 'cancel never mutates');
  h.button('Review latest backup').click(); await settle();
  h.button('Replace all profiles and progress').click(); await settle();
  assert.equal(h.reloads, 1); assert.equal(JSON.parse(h.values.get(HUB)).activeProfileId, 'bob');
  assert.equal(h.ctx.KLS.backup.getLastRestoreInfo().undoAvailable, true);
  assert.deepEqual(preferences(h), pref); assert.deepEqual(h.alerts, []);
}
// Folder failure leaves file selection and browser history available.
{
  const h = harness({ server: { failCatalog: true } }); await h.render(); const before = new Map(h.values);
  h.button('Restore progress').click(); await settle();
  assert.match(h.root.textContent, /Folder backups could not be read/);
  assert.ok(h.button('Choose a backup file…')); sameStorage(h, before, 'catalog failure is read-only');
}
// No current profiles: the ACTUAL hub boot checks recovery before profile setup
// or automatic backups. Even refresh/cancel stay read-only; Start fresh is explicit.
for (const failCatalog of [false, true]) {
  const h = harness({ server: { failCatalog }, empty: true });
  let wired = 0, created = 0;
  h.ctx.KLS.backup.initSnapshots = () => { wired++; };
  h.ctx.KLS.profileUI.ensureProfileOrPick = () => { created++; };
  vm.runInContext(source('hub.js'), h.ctx, { filename: 'hub.js' }); await settle();
  assert.match(h.root.textContent, /Restore your saved progress/);
  assert.equal(wired, 0); assert.equal(created, 0); assert.equal(h.operations.length, 0);
  assert.ok(h.requests.every(r => r.method === 'GET'));
  assert.equal(h.timers.size, 0, 'no snapshot/mirror timers while recovery is pending');
  if (!failCatalog) {
    h.button('Review latest backup').click(); await settle(); h.button('Cancel restore').click();
    assert.equal(wired, 0); assert.equal(h.operations.length, 0);
  }
  h.button('Start fresh').click(); assert.equal(created, 0);
  h.button('Create new profiles').click(); assert.equal(created, 1); assert.equal(wired, 0, 'autosave waits for profile creation');
}
// Existing profiles skip the recovery gate and launch normally.
{
  const h = harness({ server: {} }); let wired = 0, created = 0;
  h.ctx.KLS.backup.initSnapshots = () => { wired++; };
  h.ctx.KLS.profileUI.ensureProfileOrPick = () => { created++; };
  vm.runInContext(source('hub.js'), h.ctx); await settle();
  assert.equal(wired, 0); assert.equal(created, 1); assert.equal(h.requests.length, 0);
}
// A fresh device can import a portable backup without making a throwaway profile.
{
  const h = harness({ empty: true });
  h.ctx.KLS.profileUI.ensureProfileOrPick(() => {}); await settle();
  h.button('Already played? Restore a backup…').click(); await settle();
  assert.ok(h.button('Choose a backup file…'));
  assert.equal(h.operations.length, 0);
  await h.upload(envelope());
  h.button('Replace all profiles and progress').click(); await settle();
  assert.equal(h.reloads, 1);
  assert.equal(JSON.parse(h.values.get(HUB)).activeProfileId, 'bob');
}
// Unavailable browser history doesn't claim folder backups are unavailable.
{
  const h = harness({ server: {} }); await h.render();
  assert.match(h.root.textContent, /Folder backup updated/);
  assert.match(h.root.textContent, /Browser backup history is unavailable/);
  assert.equal((await h.ctx.KLS.backup.getBackupHealth()).snapshotState, 'unavailable');
}
for (const idb of [fakeIDB({ openError: true }), fakeIDB({ writeError: true })]) {
  const h = harness({ idb }); await h.render();
  await h.ctx.KLS.backup.takeSnapshotNow({ mirror: false }); await settle();
  assert.match(h.root.textContent, /Browser backup history needs attention/);
  assert.equal(h.button('Retry browser backups').hidden, false);
}
console.log('PASS: unified file/browser/folder preview, confirmation and cancel; invalid rejection; Undo/Redo; actual hub recovery-before-autosave gate and explicit Start fresh; folder errors; truthful backup status.');
