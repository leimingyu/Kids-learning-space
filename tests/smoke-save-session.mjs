/* Save acknowledgement, write failures, restore locks, and iframe lifecycle.
 * All storage and browser surfaces below are in memory. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL('shared/scripts/' + name, root), 'utf8');

class Node {
  constructor(tag = 'div', attrs = {}, children = []) {
    this.tag = tag; this.attrs = { ...attrs }; this.children = []; this.events = new Map();
    this.parentNode = null; this._connectedRoot = false; this.frameState = null;
    if (tag === 'iframe') this.contentWindow = { postMessage() {} };
    this.hidden = false; this.disabled = false; this.offsetWidth = 1;
    const classes = new Set((attrs.class || '').split(' ').filter(Boolean));
    this.classList = { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), contains: x => classes.has(x) };
    this.append(...children);
  }
  append(...xs) {
    for (const x of xs.flat()) if (x != null) {
      if (x instanceof Node) { x.remove(); x.parentNode = this; }
      this.children.push(x);
    }
  }
  appendChild(x) { this.append(x); }
  get isConnected() { return this._connectedRoot || !!this.parentNode?.isConnected; }
  remove() {
    if (!this.parentNode) return;
    const children = this.parentNode.children;
    const index = children.indexOf(this);
    if (index !== -1) children.splice(index, 1);
    this.parentNode = null;
  }
  replaceWith(node) {
    const parent = this.parentNode;
    assert.ok(parent, 'only an attached iframe can be replaced');
    const index = parent.children.indexOf(this);
    node.remove(); parent.children[index] = node; node.parentNode = parent;
    this.parentNode = null;
  }
  cloneNode(deep = false) {
    const clone = new Node(this.tag, this.attrs);
    clone.frameState = this.frameState;
    if (clone.tag === 'iframe' && clone.frameState) {
      clone.contentWindow.postMessage = data => clone.frameState.sent.push(data);
    }
    if (deep) clone.append(...this.children.map(child => child instanceof Node ? child.cloneNode(true) : child));
    return clone;
  }
  clearChildren() {
    for (const child of this.children) if (child instanceof Node) child.parentNode = null;
    this.children = [];
  }
  get textContent() { return this.children.map(x => typeof x === 'string' ? x : x.textContent || '').join(''); }
  set textContent(x) { this.clearChildren(); this.children = [String(x)]; }
  set innerHTML(x) {
    this.clearChildren(); this.html = x;
    // Only id/class lookup is needed for the hub's static shell. Keep the
    // markup flat so these tests can exercise the real recovery navigation.
    for (const match of String(x).matchAll(/<([a-z][a-z0-9-]*)([^>]*)>/gi)) {
      const attrs = {};
      for (const a of match[2].matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/gi)) attrs[a[1]] = a[2];
      if (attrs.id || attrs.class) this.append(new Node(match[1], attrs));
    }
  }
  get innerHTML() { return this.html || ''; }
  setAttribute(k, v) {
    if (this.tag === 'iframe' && k === 'src' && this.frameState) {
      this.frameState.srcAssignments.push({ frame: this, value: String(v), connected: this.isConnected });
    }
    this.attrs[k] = String(v);
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(k, fn) { if (!this.events.has(k)) this.events.set(k, new Set()); this.events.get(k).add(fn); }
  removeEventListener(k, fn) { this.events.get(k)?.delete(fn); }
  emit(k, ev) { return [...(this.events.get(k) || [])].map(fn => fn(ev)); }
  querySelector(selector) {
    for (const child of this.children) {
      if (!(child instanceof Node)) continue;
      if (selector[0] === '.' && child.classList.contains(selector.slice(1))) return child;
      if (selector[0] === '#' && child.attrs.id === selector.slice(1)) return child;
      const found = child.querySelector(selector); if (found) return found;
    }
    return null;
  }
}

function harness({ bootHub = false, initialSlug = 'cosmic-math-quest', journal = null, recover = () => {} } = {}) {
  const values = new Map(); const failures = new Set(); const events = new Map(); const timers = new Map();
  const warnings = []; let now = 0, nextTimer = 0, id = 0;
  const a = { id: 'alice', displayName: 'Alice', avatar: '🦊', games: {}, lastActiveAt: '2026-01-01T00:00:00Z' };
  const b = { id: 'bob', displayName: 'Bob', avatar: '🐻', games: {}, lastActiveAt: '2026-01-01T00:00:00Z' };
  values.set('kls.progress.v2', JSON.stringify({ version: 2, activeProfileId: a.id, profiles: { alice: a, bob: b } }));
  if (journal) values.set('kls.restore.journal.v1', JSON.stringify(journal));
  const storage = {
    getItem: k => values.get(k) ?? null,
    setItem(k, v) { if (failures.has(k)) throw new Error('Storage quota exceeded'); values.set(k, String(v)); },
    removeItem(k) { if (failures.has(k)) throw new Error('Storage blocked'); values.delete(k); },
  };
  const nodes = new Map(['chrome-root', 'stage-root', 'hub-root'].map(k => [k, new Node('div', { id: k })]));
  for (const node of nodes.values()) node._connectedRoot = true;
  const sent = [], srcAssignments = [];
  const frame = new Node('iframe', { id: 'stage-frame', title: 'Game', allow: 'autoplay' });
  frame.frameState = { sent, srcAssignments };
  frame.setAttribute('src', 'games/' + initialSlug + '/index.html');
  frame.contentWindow = { postMessage: data => sent.push(data) };
  nodes.get('stage-root').append(frame);
  const doc = { readyState: 'complete', title: '', querySelector: s => {
    const rootNode = s[0] === '#' ? nodes.get(s.slice(1)) : null;
    if (rootNode) return rootNode;
    for (const rootNode of nodes.values()) { const found = rootNode.querySelector(s); if (found) return found; }
    return null;
  } };
  const location = { hash: '#/games/' + initialSlug, reload() { this.reloaded = true; } };
  const ctx = vm.createContext({ document: doc, location, localStorage: storage,
    console: { warn: (...x) => warnings.push(x), error: (...x) => warnings.push(x) },
    crypto: { randomUUID: () => String(++id) },
    setTimeout(fn, ms) { const tid = ++nextTimer; timers.set(tid, { fn, at: now + ms }); return tid; },
    clearTimeout: tid => timers.delete(tid),
    addEventListener(k, fn) { if (!events.has(k)) events.set(k, []); events.get(k).push(fn); },
    alert: s => warnings.push(s),
    KLS: { util: { qs: (s, n) => n ? n.querySelector(s) : doc.querySelector(s), el: (tag, attrs, ...children) => new Node(tag, attrs, children) } },
  });
  ctx.window = ctx;
  const emit = (event, data) => (events.get(event) || []).map(fn => fn(data));
  const tick = ms => { now += ms; for (const [tid, t] of [...timers]) if (t.at <= now) { timers.delete(tid); t.fn(); } };
  vm.runInContext(source('progress.js'), ctx);
  vm.runInContext(source('chrome.js'), ctx);
  const C = ctx.KLS.chrome, P = ctx.KLS.progress;
  let managerShown = false, initSnapshots = 0, picked = 0;
  if (bootHub) {
    ctx.KLS.profileUI = {
      ensureProfileOrPick(fn) { picked++; fn(); },
      renderManager() { managerShown = true; }, renderParent() {}, renderCreateNew() {},
    };
    ctx.KLS.backup = { recoverInterruptedRestore: recover, initSnapshots() { initSnapshots++; } };
    vm.runInContext(source('hub.js'), ctx);
  } else {
    C.registerSlugs(['cosmic-math-quest']); C.mount(); C.startSession('cosmic-math-quest', 'alice', { v: 7, mark: 'saved' });
  }
  const message = (data, origin = doc.querySelector('#stage-frame').contentWindow) => emit('message', { source: origin, data });
  const bound = (event, extra = {}) => ({ type: 'kls:progress', event, ...C.getSession(), ...extra });
  const status = () => nodes.get('chrome-root').querySelector('.chrome__saved')?.textContent || '';
  return { ctx, C, P, nodes, values, failures, storage, sent, srcAssignments, events, tick, emit, message, bound, status, warnings,
    get frame() { return doc.querySelector('#stage-frame'); },
    get managerShown() { return managerShown; }, get initSnapshots() { return initSnapshots; }, get picked() { return picked; } };
}

function buttons(h) {
  const result = [];
  const visit = node => {
    if (!(node instanceof Node)) return;
    if (node.tag === 'button') result.push(node);
    node.children.forEach(visit);
  };
  for (const node of h.nodes.values()) visit(node);
  return result;
}
function clickButton(h, text) {
  const button = buttons(h).find(node => node.textContent === text);
  assert.ok(button, 'button is visible: ' + text);
  assert.equal(button.disabled, false, 'button is enabled: ' + text);
  return button.attrs.onclick ? button.attrs.onclick() : button.emit('click', {});
}

// The hub, chrome, CSS, and games have independent cache versions. A navigation
// release must refresh its scripts while preserving unchanged game/CSS assets.
// Exercise the actual startup route, not a URL copy.
{
  const h = harness({ bootHub: true, initialSlug: 'logic-detectives' });
  const meta = h.ctx.KLS.GAMES.find(game => game.slug === 'logic-detectives');
  assert.ok(meta.assetVersion, 'Logic Detectives declares a release asset version');
  const iframe = new URL(h.frame.getAttribute('src'), 'http://kls.test/');
  assert.equal(iframe.pathname, '/games/logic-detectives/index.html');
  assert.equal(iframe.searchParams.get('v'), meta.assetVersion, 'The main hub loads the current game document');
  assert.equal(h.C.getSession().slug, meta.slug, 'The versioned route retains the correct game session');
  assert.equal(h.frame.getAttribute('title'), 'Game', 'Replacing an iframe preserves its accessibility attributes');
  assert.equal(h.frame.getAttribute('allow'), 'autoplay', 'Replacing an iframe preserves its existing permissions');
  assert.ok(h.srcAssignments.every(write => !write.connected), 'Startup sets iframe URLs before attachment');

  const gameHTML = readFileSync(new URL('games/logic-detectives/index.html', root), 'utf8');
  const assets = [...gameHTML.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(match => new URL(match[1], 'http://kls.test/games/logic-detectives/index.html'));
  for (const name of ['styles.css', 'engine.js', 'store.js', 'app.js', 'table-guide.js', 'row-demo.js']) {
    const matches = assets.filter(url => url.pathname === '/games/logic-detectives/' + name);
    assert.equal(matches.length, 1, name + ' loads exactly once');
    assert.equal(matches[0].searchParams.get('v'), meta.assetVersion, name + ' matches the iframe release in embedded and standalone play');
  }
  const hubHTML = readFileSync(new URL('index.html', root), 'utf8');
  const loader = hubHTML.match(/<script\b[^>]*src="(shared\/scripts\/hub\.js[^\"]*)"/);
  assert.ok(loader, 'The main page loads the hub router');
  const hubVersion = '20261109-g3-concepts-r1';
  assert.equal(new URL(loader[1], 'http://kls.test/').searchParams.get('v'), hubVersion,
    'The main page refreshes its router with the Grade 3 concepts release');
  const chromeLoader = hubHTML.match(/<script\b[^>]*src="(shared\/scripts\/chrome\.js[^\"]*)"/);
  assert.ok(chromeLoader, 'The main page loads the iframe session controller');
  assert.equal(new URL(chromeLoader[1], 'http://kls.test/').searchParams.get('v'), '20261107-browser-history-r1',
    'The name change preserves the iframe navigation fix version');
  const styles = hubHTML.match(/<link\b[^>]*href="(shared\/styles\/components\.css[^\"]*)"/);
  assert.ok(styles, 'The main page loads shared components');
  assert.equal(new URL(styles[1], 'http://kls.test/').searchParams.get('v'), '20261103-hub-spotlight-r1',
    'The navigation release preserves the dashboard CSS version');
  assert.equal(meta.assetVersion, '20261109-g3-concepts-r1',
    'The Grade 3 concepts release refreshes the game document and its versioned assets');

  for (const slug of ['cosmic-math-quest', 'long-division-coach']) {
    const other = harness({ bootHub: true, initialSlug: slug });
    const url = new URL(other.frame.getAttribute('src'), 'http://kls.test/');
    assert.equal(url.pathname, '/games/' + slug + '/index.html');
    assert.equal(url.searchParams.get('v'), '20261030-division-lessons-r3', 'Existing game asset versions remain unchanged');
    assert.equal(other.C.getSession().slug, slug);
  }
}

// These fake DOM checks cover the cause of the blank Back/Forward screen:
// changing a connected iframe's src creates nested browser-history entries.
// Each session must instead attach a new, already-configured document. Real
// browser history traversal is checked separately in browser QA.
{
  const h = harness({ bootHub: true, initialSlug: 'logic-detectives' });
  h.message(h.bound('profileReady'));
  const firstFrame = h.frame;
  const firstIdentity = h.C.getSession();
  h.ctx.location.hash = '';
  const leaving = h.emit('hashchange');
  const request = h.sent.findLast(message => message.event === 'requestState');
  assert.equal(h.frame, firstFrame, 'A live game remains mounted until its checkpoint is acknowledged');
  assert.equal(firstFrame.isConnected, true);
  h.message(h.bound('saveState', { requestId: request.requestId, state: { clue: 3, draft: ['11', ''] }, ok: true }));
  await Promise.all(leaving);
  const placeholder = h.frame;
  assert.notEqual(placeholder, firstFrame, 'Leaving discards the old browsing context');
  assert.notEqual(placeholder.contentWindow, firstFrame.contentWindow);
  assert.equal(firstFrame.isConnected, false);
  assert.equal(placeholder.isConnected, true);
  assert.equal(placeholder.getAttribute('src'), 'about:blank');
  assert.equal(firstFrame.getAttribute('src').includes('logic-detectives'), true,
    'The discarded game itself is never navigated to a blank document');
  assert.equal(h.C.hasSession(), false);
  assert.equal(h.nodes.get('stage-root').hidden, true);
  const afterDetach = h.sent.length;
  firstFrame.emit('load');
  assert.equal(h.sent.length, afterDetach, 'The removed document no longer has a profile-binding load listener');

  // The same route is reached when the browser goes Back from Hub to game.
  h.ctx.location.hash = '#/games/logic-detectives';
  await Promise.all(h.emit('hashchange'));
  const returned = h.frame;
  assert.notEqual(returned, placeholder, 'Returning mounts a new game context');
  assert.notEqual(returned.contentWindow, firstFrame.contentWindow);
  assert.equal(placeholder.isConnected, false);
  assert.equal(returned.isConnected, true);
  assert.equal(h.nodes.get('stage-root').hidden, false);
  assert.equal(h.nodes.get('hub-root').hidden, true);
  assert.notEqual(h.C.getSession().sessionId, firstIdentity.sessionId);
  assert.match(returned.getAttribute('src'), /^games\/logic-detectives\/index\.html\?v=/);
  const beforeReady = h.sent.filter(message => message.event === 'resumeState').length;
  h.message(h.bound('profileReady'), firstFrame.contentWindow);
  assert.equal(h.sent.filter(message => message.event === 'resumeState').length, beforeReady,
    'A removed document cannot acknowledge the new session, even with its current identity');
  h.message(h.bound('profileReady'));
  const resumed = h.sent.findLast(message => message.event === 'resumeState');
  assert.equal(resumed.state.clue, 3);
  assert.deepEqual(Array.from(resumed.state.draft), ['11', ''], 'The returned game receives its saved unfinished answer');
  h.message(h.bound('awardStars', { level: 'stale-frame', stars: 3 }), firstFrame.contentWindow);
  assert.equal(h.P.getGame('logic-detectives').levels['stale-frame'], undefined);

  // A browser Forward traversal can leave that restored game again. A later
  // different game likewise gets a new context, not a reused WindowProxy.
  h.ctx.location.hash = '';
  const forward = h.emit('hashchange');
  const forwardRequest = h.sent.findLast(message => message.event === 'requestState');
  h.message(h.bound('saveState', { requestId: forwardRequest.requestId, state: resumed.state, ok: true }));
  await Promise.all(forward);
  assert.equal(returned.isConnected, false);
  h.ctx.location.hash = '#/games/long-division-coach';
  await Promise.all(h.emit('hashchange'));
  assert.notEqual(h.frame.contentWindow, returned.contentWindow);
  assert.equal(h.C.getSession().slug, 'long-division-coach');
  assert.match(h.frame.getAttribute('src'), /^games\/long-division-coach\/index\.html\?v=/);
  assert.ok(h.srcAssignments.every(write => !write.connected),
    'Opening, leaving, returning, and switching games never navigate a connected iframe');
}

// A quick Back then Forward while Save is pending must retain the final route
// and its exact live document; a completed older route cannot replace it.
{
  const h = harness({ bootHub: true });
  h.message(h.bound('profileReady'));
  const frame = h.frame, identity = h.C.getSession();
  h.ctx.location.hash = '';
  const older = h.emit('hashchange');
  const request = h.sent.findLast(message => message.event === 'requestState');
  h.ctx.location.hash = '#/games/cosmic-math-quest';
  await Promise.all(h.emit('hashchange'));
  h.message(h.bound('saveState', { requestId: request.requestId, state: { question: 5 }, ok: true }));
  await Promise.all(older);
  assert.equal(h.frame, frame);
  assert.equal(frame.isConnected, true);
  assert.equal(h.C.getSession().sessionId, identity.sessionId);
  assert.equal(h.nodes.get('stage-root').hidden, false);
  assert.equal(h.ctx.location.hash, '#/games/cosmic-math-quest');
  assert.equal(h.P.getGameState('cosmic-math-quest').question, 5);
  assert.ok(h.srcAssignments.every(write => !write.connected));
}

// Acknowledgement must be bound to this request, sender, profile, and session.
{
  const h = harness();
  h.message(h.bound('profileReady'));
  h.message(h.bound('profileReady'));
  assert.equal(h.sent.filter(x => x.event === 'resumeState').length, 1, 'resume is delivered once');
  const saving = h.C.requestSave();
  assert.equal(h.status(), 'Saving…');
  const req = h.sent.findLast(x => x.event === 'requestState');
  const reply = h.bound('saveState', { requestId: req.requestId, state: { question: 3 }, ok: true });
  h.message(reply, {});
  h.message({ ...reply, profileId: 'bob' });
  h.message({ ...reply, sessionId: 'older' });
  h.message({ ...reply, slug: 'word-problem-adventure' });
  h.message({ ...reply, requestId: 'old-request' });
  assert.equal(h.P.getGameState('cosmic-math-quest'), null);
  assert.equal(h.status(), 'Saving…');
  h.message(reply);
  assert.equal((await saving).ok, true);
  assert.equal(h.status(), 'Saved in this browser ✓');
  assert.equal(h.P.getGameState('cosmic-math-quest').question, 3);
  h.message({ ...reply, state: { question: 0 } });
  assert.equal(h.P.getGameState('cosmic-math-quest').question, 3, 'a late duplicate cannot overwrite');
}

// Quota failures do not retain mutated in-memory progress or claim success.
{
  const h = harness(); h.message(h.bound('profileReady'));
  assert.equal(h.P.awardStars('cosmic-math-quest', 'level', 1), true);
  const before = h.values.get('kls.progress.v2');
  h.failures.add('kls.progress.v2');
  assert.equal(h.P.awardStars('cosmic-math-quest', 'level', 3), false);
  assert.equal(h.P.getGame('cosmic-math-quest').levels.level.stars, 1, 'failed cache mutation is discarded');
  const saving = h.C.requestSave(); const req = h.sent.findLast(x => x.event === 'requestState');
  h.message(h.bound('saveState', { requestId: req.requestId, state: { question: 4 }, ok: true }));
  assert.equal((await saving).ok, false);
  assert.match(h.status(), /Save failed/);
  assert.equal(h.values.get('kls.progress.v2'), before);
  h.failures.clear(); assert.equal(h.P.awardStars('cosmic-math-quest', 'level', 2), true);
  assert.equal(h.P.getGameState('cosmic-math-quest'), null);
}

// Timeout retains the game; an expired reply cannot change the checkpoint.
{
  const h = harness(); h.message(h.bound('profileReady'));
  const saving = h.C.requestSave(); const req = h.sent.findLast(x => x.event === 'requestState');
  h.tick(1500); assert.equal((await saving).ok, false);
  assert.match(h.status(), /did not confirm/); assert.equal(h.C.hasSession(), true);
  h.message(h.bound('saveState', { requestId: req.requestId, state: { late: true }, ok: true }));
  assert.equal(h.P.getGameState('cosmic-math-quest'), null);
}

// Failed reward and additive session events survive a successful retry exactly once.
{
  const h = harness(); h.message(h.bound('profileReady'));
  h.failures.add('kls.progress.v2');
  h.message(h.bound('awardStars', { level: 'level', stars: 3 }));
  h.message(h.bound('session', { level: 'level', stats: { questionsAnswered: 5, accuracy: 80 } }));
  assert.equal(h.P.getGame('cosmic-math-quest').levels.level, undefined);
  h.failures.clear();
  const save = h.C.requestSave(); const req = h.sent.findLast(x => x.event === 'requestState');
  h.message(h.bound('saveState', { requestId: req.requestId, state: { question: 5 }, ok: true }));
  assert.equal((await save).ok, true);
  assert.equal(h.P.getGame('cosmic-math-quest').levels.level.stars, 3);
  assert.equal(h.P.getGame('cosmic-math-quest').levels.level.questionsAnswered, 5);
  const again = h.C.requestSave(); const req2 = h.sent.findLast(x => x.event === 'requestState');
  h.message(h.bound('saveState', { requestId: req2.requestId, state: { question: 5 }, ok: true }));
  assert.equal((await again).ok, true);
  assert.equal(h.P.getGame('cosmic-math-quest').levels.level.questionsAnswered, 5);
}

// Local game errors cannot be cleared by a successful hub reward write.
{
  const h = harness(); h.message(h.bound('profileReady'));
  h.message(h.bound('storageError', { error: 'Mistake list could not be saved.' }));
  h.message(h.bound('awardStars', { level: 'level', stars: 2 }));
  assert.match(h.status(), /Mistake list/);
  const saving = h.C.requestSave(); const req = h.sent.findLast(x => x.event === 'requestState');
  h.message(h.bound('saveState', { requestId: req.requestId, state: { question: 2 }, ok: false, error: 'Mistake list could not be saved.' }));
  assert.equal((await saving).ok, false);
  h.message(h.bound('storageRecovered', { error: '' }));
  const retry = h.C.requestSave(); const req2 = h.sent.findLast(x => x.event === 'requestState');
  h.message(h.bound('saveState', { requestId: req2.requestId, state: { question: 2 }, ok: true }));
  assert.equal((await retry).ok, true);
}

// A profile picker cannot appear while its old iframe still has a live document.
{
  const h = harness({ bootHub: true }); h.message(h.bound('profileReady'));
  const oldFrame = h.frame;
  h.ctx.location.hash = '#/profiles';
  const routes = h.emit('hashchange');
  assert.equal(h.managerShown, false); assert.match(h.frame.getAttribute('src'), /cosmic-math/);
  const req = h.sent.findLast(x => x.event === 'requestState');
  h.message(h.bound('saveState', { requestId: req.requestId, state: { question: 8 }, ok: true }));
  await Promise.all(routes);
  assert.equal(h.managerShown, true); assert.equal(h.frame.getAttribute('src'), 'about:blank');
  assert.notEqual(h.frame, oldFrame); assert.equal(oldFrame.isConnected, false);
  assert.equal(h.C.hasSession(), false);
  h.P.setActiveProfile('bob');
  h.message({ type: 'kls:progress', event: 'awardStars', slug: 'cosmic-math-quest', profileId: 'alice', sessionId: req.sessionId, level: 'wrong-owner', stars: 3 });
  assert.equal(h.P.getGame('cosmic-math-quest').levels['wrong-owner'], undefined);
}
{
  const h = harness({ bootHub: true }); h.message(h.bound('profileReady'));
  const oldFrame = h.frame;
  h.ctx.location.hash = '#/profiles'; const routes = h.emit('hashchange');
  h.tick(1500); await Promise.all(routes);
  assert.equal(h.managerShown, false); assert.equal(h.C.hasSession(), true);
  assert.equal(h.frame, oldFrame, 'A failed save keeps the original browsing context alive');
  assert.equal(oldFrame.isConnected, true);
  assert.equal(h.ctx.location.hash, '#/games/cosmic-math-quest');
  assert.equal(h.warnings.filter(x => typeof x === 'string').length, 0, 'failed navigation uses inline recovery, not a native alert');
  assert.match(h.status(), /did not confirm/);
  assert.ok(buttons(h).some(x => x.textContent === 'Retry Save'));
  assert.ok(buttons(h).some(x => x.textContent === 'Return to Hub using last save'));
}

// A blank or still-loading document cannot erase the last good checkpoint.
// Waiting for connection has a larger budget than a ready game's capture.
{
  const h = harness();
  h.P.saveGameState('cosmic-math-quest', { question: 6, mark: 'last-good' });
  const before = h.values.get('kls.progress.v2');
  const saving = h.C.requestSave();
  h.tick(1500);
  assert.equal(h.status(), 'Saving…', 'loading does not claim a checkpoint failure at 1.5 seconds');
  assert.equal(h.sent.filter(x => x.event === 'requestState').length, 0);
  h.tick(8500);
  const failed = await saving;
  assert.equal(failed.ok, false);
  assert.match(failed.error, /not finished loading or connecting to this account/);
  assert.equal(h.values.get('kls.progress.v2'), before);
  clickButton(h, 'Return to Hub using last save');
  assert.ok(buttons(h).some(x => x.textContent === 'Keep game open'));
  clickButton(h, 'Keep game open');
  clickButton(h, 'Retry Save');
  assert.equal(buttons(h).some(x => x.textContent === 'Keep game open'), false, 'Retry clears the exit confirmation');
  const retry = h.C.requestSave();
  h.tick(9000);
  h.message(h.bound('profileReady'));
  const req = h.sent.findLast(x => x.event === 'requestState');
  assert.ok(req, 'late connection sends a fresh checkpoint request');
  h.tick(1499);
  assert.equal(h.status(), 'Saving…', 'ready capture receives a full 1.5 second budget');
  h.message(h.bound('saveState', { requestId: req.requestId, state: { question: 7 }, ok: true }));
  assert.equal((await retry).ok, true);
  assert.equal(h.P.getGameState('cosmic-math-quest').question, 7);
}

// An explicit, two-step escape always leaves the child able to use the hub.
// It retains prior checkpoint, scoped game progress, and the other account.
{
  const h = harness({ bootHub: true });
  h.message(h.bound('profileReady'));
  h.P.saveGameState('cosmic-math-quest', { question: 9, mark: 'last-good' });
  h.values.set('cosmicMathQuest_v1__alice', JSON.stringify({ grade: 4, stars: 12 }));
  h.values.set('cosmicMathQuest_wrongs_v1__alice', JSON.stringify({ records: [{ key: '3*7' }] }));
  h.values.set('cosmicMathQuest_v1__bob', JSON.stringify({ grade: 2, stars: 2 }));
  const before = [...h.values.entries()];
  h.ctx.location.hash = ''; const routes = h.emit('hashchange');
  const abandonedRequest = h.sent.findLast(x => x.event === 'requestState');
  const abandonedIdentity = h.C.getSession();
  h.tick(1500); await Promise.all(routes);
  assert.equal(h.C.hasSession(), true); assert.match(h.frame.getAttribute('src'), /cosmic-math/);
  clickButton(h, 'Return to Hub using last save');
  assert.match(h.status(), /last save|last saved/i);
  clickButton(h, 'Keep game open');
  assert.equal(h.C.hasSession(), true); assert.deepEqual([...h.values.entries()], before);
  clickButton(h, 'Return to Hub using last save');
  await clickButton(h, 'Return to Hub');
  await Promise.all(h.emit('hashchange'));
  assert.equal(h.C.hasSession(), false);
  assert.equal(h.frame.getAttribute('src'), 'about:blank');
  assert.equal(h.nodes.get('stage-root').hidden, true);
  assert.equal(h.nodes.get('hub-root').hidden, false);
  assert.equal(h.ctx.location.hash, '');
  assert.deepEqual([...h.values.entries()], before, 'escape does not write a null or partial checkpoint');
  h.message({ type: 'kls:progress', event: 'saveState', ...abandonedIdentity,
    requestId: abandonedRequest.requestId, state: null, ok: true });
  assert.deepEqual([...h.values.entries()], before, 'late abandoned replies remain rejected');
}

// The escape invalidates an older route that is still awaiting a reply.
{
  const h = harness({ bootHub: true }); h.message(h.bound('profileReady'));
  h.P.saveGameState('cosmic-math-quest', { question: 4 });
  const before = [...h.values.entries()];
  h.ctx.location.hash = '#/profiles'; const routes = h.emit('hashchange');
  h.ctx.KLS.hub.returnToHubUsingLastSave();
  await Promise.all(routes);
  assert.equal(h.ctx.location.hash, ''); assert.equal(h.managerShown, false);
  assert.equal(h.C.hasSession(), false); assert.deepEqual([...h.values.entries()], before);
}

// A different tab/account switch while a route awaits Save cannot reopen the
// old account's game URL, show its picker, or write the stale checkpoint.
{
  const h = harness({ bootHub: true }); h.message(h.bound('profileReady'));
  h.ctx.location.hash = '#/profiles'; const routes = h.emit('hashchange');
  const req = h.sent.findLast(x => x.event === 'requestState');
  const old = h.C.getSession();
  assert.equal(h.P.setActiveProfile('bob'), true);
  await Promise.all(routes);
  assert.equal(h.ctx.location.hash, '', 'old failed route does not replace the new account URL');
  assert.equal(h.managerShown, false); assert.equal(h.C.hasSession(), false);
  const before = h.values.get('kls.progress.v2');
  h.message({ type: 'kls:progress', event: 'saveState', ...old,
    requestId: req.requestId, state: { question: 99 }, ok: true });
  assert.equal(h.P.get().activeProfileId, 'bob'); assert.equal(h.values.get('kls.progress.v2'), before);
}

// Recovery blocks all startup routes, profile creation, and automatic snapshots.
{
  const h = harness({ bootHub: true, recover() { throw new Error('Another tab is restoring.'); } });
  assert.equal(h.picked, 0); assert.equal(h.initSnapshots, 0); assert.equal(h.C.hasSession(), false);
  h.ctx.location.hash = '#/profiles'; await Promise.all(h.emit('hashchange'));
  assert.equal(h.managerShown, false);
  assert.match(h.nodes.get('hub-root').textContent, /Another tab is restoring/);
}
{
  const h = harness({ journal: { phase: 'prepared' } });
  const before = h.values.get('kls.progress.v2');
  assert.equal(h.P.awardStars('cosmic-math-quest', 'blocked', 3), false);
  assert.equal(h.values.get('kls.progress.v2'), before);
  h.values.delete('kls.restore.journal.v1');
  assert.equal(h.P.awardStars('cosmic-math-quest', 'allowed', 2), true);
  assert.equal(h.P.getGame('cosmic-math-quest').levels.blocked, undefined);
}

// Bridge rejects forged parents, attaches identity, keeps errors per storage key,
// and suspends outgoing messages when the session ends.
{
  const sent = [], handlers = new Map(), data = new Map();
  const parent = { postMessage: x => sent.push(x) };
  const body = new Node('body');
  const ctx = vm.createContext({ parent, document: { body }, location: { pathname: '/games/cosmic-math-quest/index.html' },
    localStorage: { getItem: k => data.get(k) || null }, console,
    addEventListener(k, fn) { handlers.set(k, fn); }, KLS: {} }); ctx.window = ctx;
  vm.runInContext(source('game-bridge.js'), ctx);
  const B = ctx.KLS.bridge;
  const send = (event, extra = {}, sender = parent) => handlers.get('message')({ source: sender,
    data: { type: 'kls:hub', event, slug: 'cosmic-math-quest', profileId: 'alice', sessionId: 'session-one', ...extra } });
  send('setProfile', {}, {}); assert.equal(B.getProfileId(), null);
  send('setProfile'); assert.equal(B.getProfileId(), 'alice');
  send('setProfile', { profileId: 'bob', sessionId: 'session-two' }); assert.equal(B.getProfileId(), 'alice');
  B.reportStorageError(new Error('Wrongs failed'), 'wrongs');
  B.reportStorageError(new Error('Main failed'), 'main'); B.clearStorageError('main');
  B.onHubMessage('requestState', () => B.saveState({ question: 9 }));
  send('requestState', { requestId: 'req1' });
  const failed = sent.findLast(x => x.event === 'saveState');
  assert.equal(failed.requestId, 'req1'); assert.equal(failed.ok, false); assert.match(failed.error, /Wrongs failed/);
  assert.equal(failed.profileId, 'alice'); assert.equal(failed.sessionId, 'session-one');
  B.clearStorageError('wrongs'); send('requestState', { requestId: 'req2' });
  assert.equal(sent.findLast(x => x.event === 'saveState').ok, true);
  data.set('kls.restore.journal.v1', JSON.stringify({ phase: 'prepared' }));
  assert.throws(() => B.assertCanWrite(), /restore is in progress/);
  data.delete('kls.restore.journal.v1'); assert.equal(B.assertCanWrite(), true);
  send('suspendSession'); const count = sent.length; B.stars('late', 3);
  assert.equal(sent.length, count); assert.throws(() => B.assertCanWrite(), /not ready/);
}

// The bridge may load near the start of HTML, before the game checkpoint and
// resume adapters exist. Cache account identity early, but acknowledge only
// after the full document and its DOMContentLoaded adapters are available.
{
  const h = harness(), queue = [], listeners = new Map(), docListeners = new Map();
  let profileCallbacks = 0, profileMessages = 0, resumeCount = 0, captureCount = 0;
  const gameWindow = { postMessage: data => queue.push(() => listeners.get('message')({ source: parent, data })) };
  const parent = { postMessage: data => queue.push(() => h.message(data, gameWindow)) };
  h.frame.contentWindow = gameWindow;
  const doc = { body: new Node('body'), readyState: 'loading',
    addEventListener(k, fn) { if (!docListeners.has(k)) docListeners.set(k, []); docListeners.get(k).push(fn); } };
  const game = vm.createContext({ parent, document: doc, location: { pathname: '/games/cosmic-math-quest/index.html' },
    localStorage: h.storage, console, addEventListener(k, fn) { listeners.set(k, fn); }, KLS: {} });
  game.window = game;
  vm.runInContext(source('game-bridge.js'), game);
  const B = game.KLS.bridge;
  const pump = () => {
    let limit = 50;
    while (queue.length && limit--) queue.shift()();
    assert.ok(limit > 0, 'loading handshake terminates');
  };
  assert.equal(queue.length, 0, 'bridgeReady is deferred until game initialization finishes');
  h.C.pushProfileToIframe('cosmic-math-quest'); pump();
  assert.equal(B.getProfileId(), 'alice', 'early identity is available to scope startup reads');
  assert.equal(h.sent.filter(x => x.event === 'resumeState').length, 0);
  B.onProfileReady(() => profileCallbacks++);
  B.onHubMessage('setProfile', () => profileMessages++);
  assert.equal(profileCallbacks, 0, 'profile callback must wait for complete game initialization');
  const saving = h.C.requestSave(); pump();
  assert.equal(h.sent.filter(x => x.event === 'requestState').length, 0);
  assert.equal(profileCallbacks, 0); assert.equal(profileMessages, 0);
  // Long Division and similar external scripts can install adapters in a
  // listener registered after the bridge's own DOMContentLoaded listener.
  doc.addEventListener('DOMContentLoaded', () => {
    B.registerCheckpoint(() => { captureCount++; return { question: 13, phase: 'answer' }; });
    B.onHubMessage('resumeState', () => resumeCount++);
  });
  doc.readyState = 'interactive';
  for (const fn of docListeners.get('DOMContentLoaded') || []) fn();
  pump();
  assert.equal((await saving).ok, true);
  assert.equal(profileCallbacks, 1); assert.equal(profileMessages, 1);
  assert.equal(resumeCount, 1, 'the retained checkpoint reaches the later-installed resume handler');
  assert.equal(captureCount, 1, 'one registered handler captures one request');
  assert.equal(h.P.getGameState('cosmic-math-quest').question, 13);
  h.C.pushProfileToIframe('cosmic-math-quest'); pump();
  assert.equal(profileCallbacks, 1); assert.equal(profileMessages, 1);
  assert.equal(resumeCount, 1, 'duplicate load/ready signals cannot consume the checkpoint twice');
}

// Run the actual bridge and chrome in separate VM windows with queued messages.
// Saving before a slow game's ready handshake still confirms exactly one reply.
{
  const h = harness(), queue = [], listeners = new Map(); let resumeCount = 0;
  const gameWindow = { postMessage: data => queue.push(() => listeners.get('message')({ source: parent, data })) };
  const parent = { postMessage: data => queue.push(() => h.message(data, gameWindow)) };
  h.frame.contentWindow = gameWindow;
  const game = vm.createContext({ parent, location: { pathname: '/games/cosmic-math-quest/index.html' },
    document: { body: new Node('body') }, localStorage: h.storage, console,
    addEventListener(k, fn) { listeners.set(k, fn); }, KLS: {} }); game.window = game;
  vm.runInContext(source('game-bridge.js'), game);
  game.KLS.bridge.registerCheckpoint(() => ({ question: 12, phase: 'answer' }));
  game.KLS.bridge.onHubMessage('resumeState', () => resumeCount++);
  const saving = h.C.requestSave(); assert.equal(h.status(), 'Saving…');
  let limit = 30;
  while (queue.length && limit--) queue.shift()();
  assert.ok(limit > 0, 'handshake terminates');
  assert.equal((await saving).ok, true); assert.equal(resumeCount, 1);
  assert.equal(h.P.getGameState('cosmic-math-quest').question, 12);
  h.C.detachSession(); while (queue.length) queue.shift()();
  assert.throws(() => game.KLS.bridge.assertCanWrite(), /not ready/);
}

console.log('PASS: versioned navigation/game assets; fresh iframe contexts and detached-only URL assignment; saved draft resume and stale-frame rejection on return; rapid Back/Forward route cancellation; confirmed browser Save; request/source/profile/session validation; write failure rollback; loading/capture timeout and retry; deferred game initialization handshake; safe two-step Hub recovery; stale route/account cancellation; single resume delivery; flush-before-detach navigation; restore lock/recovery gate; keyed game errors.');
