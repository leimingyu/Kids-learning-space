/** Run the complete scripts, in HTML load order, rather than extracting the
 * checkpoint function. A startup exception must not silently remove Save/Home.
 * The DOM and parent transport are isolated fakes; no real saves are touched.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const htmlURL = new URL('../index.html', import.meta.url);
const html = readFileSync(htmlURL, 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(([, attrs, source]) => {
  const src = attrs.match(/\bsrc="([^"]+)"/);
  const scriptURL = src ? new URL(src[1], htmlURL) : null;
  if (scriptURL) scriptURL.search = '';
  return { name: src ? src[1].split('?')[0] : 'inline CMQ', source: scriptURL ? readFileSync(scriptURL, 'utf8') : source };
});
const plain = value => JSON.parse(JSON.stringify(value));

function boot(seed = {}, { embedded = true, failStorage = false, earlyProfile = false, deferDOMContentLoaded = false } = {}) {
  const elements = [], ids = new Map(), windowEvents = new Map(), sent = [], errors = [];
  const documentEvents = new Map();
  const storage = new Map(Object.entries(seed));
  const timers = new Map(); let timerId = 0;
  function element(tag, attrs = '') {
    const attributes = new Map([...attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k, v ?? '']));
    const classes = new Set((attributes.get('class') || '').split(/\s+/).filter(Boolean)), events = new Map();
    const node = {
      tagName: tag.toUpperCase(), id: attributes.get('id') || '', style: {}, value: '', textContent: '', children: [],
      hidden: attributes.has('hidden'), disabled: attributes.has('disabled'), innerHTML: '',
      get className() { return [...classes].join(' '); },
      set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(x => classes.add(x)); },
      classList: { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)),
        contains: x => classes.has(x), toggle(x, force) { const on = force ?? !classes.has(x); if (on) classes.add(x); else classes.delete(x); return on; } },
      getAttribute: k => attributes.get(k) ?? null, hasAttribute: k => attributes.has(k),
      setAttribute(k, v) { attributes.set(k, String(v)); if (k === 'hidden') this.hidden = true; },
      removeAttribute(k) { attributes.delete(k); if (k === 'hidden') this.hidden = false; },
      addEventListener(name, fn, capture) { if (!events.has(name)) events.set(name, []); events.get(name).push({ fn, capture: !!capture }); },
      dispatch(name, event = {}) { (events.get(name) || []).slice().sort((a, b) => b.capture - a.capture).forEach(({ fn }) => fn.call(this, { target: this, preventDefault() {}, ...event })); },
      click() { this.dispatch('click'); }, focus() {}, select() {}, remove() {}, scrollIntoView() {},
      appendChild(child) { this.children.push(child); return child; }, removeChild(child) { this.children = this.children.filter(x => x !== child); },
      querySelectorAll: selector => queryAll(selector), querySelector: selector => queryAll(selector)[0] || null,
    };
    elements.push(node); if (node.id) ids.set(node.id, node); return node;
  }
  for (const [, tag, attrs] of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) element(tag, attrs);
  function queryAll(selector) {
    const id = selector.match(/^#([\w-]+)/), classes = [...selector.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
    return elements.filter(el => (!id || el.id === id[1]) && classes.every(c => el.classList.contains(c)));
  }
  const body = elements.find(el => el.tagName === 'BODY');
  const document = {
    body, documentElement: elements.find(el => el.tagName === 'HTML'), readyState: 'loading',
    getElementById: id => ids.get(id) || null, querySelectorAll: queryAll, querySelector: selector => queryAll(selector)[0] || null,
    createElement: tag => element(tag), addEventListener(name, fn) {
      if (!documentEvents.has(name)) documentEvents.set(name, []);
      documentEvents.get(name).push(fn);
    },
  };
  const parent = { postMessage: data => sent.push(plain(data)) };
  const context = vm.createContext({ document, location: { pathname: '/games/cosmic-math-quest/index.html' },
    console: { log() {}, error: (...args) => errors.push(args.map(String).join(' ')), warn() {} },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem(k, v) { if (failStorage) throw new Error('quota'); storage.set(k, String(v)); }, removeItem: k => storage.delete(k) },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    setInterval(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id),
    MutationObserver: class { observe() {} disconnect() {} }, getComputedStyle: el => ({ display: el.hidden ? 'none' : 'block', visibility: 'visible', opacity: '1' }),
    confirm: () => false, alert() {}, addEventListener(name, fn) { if (!windowEvents.has(name)) windowEvents.set(name, []); windowEvents.get(name).push(fn); },
    URL, Blob, Map, Set,
  });
  context.window = context; context.parent = embedded ? parent : context;
  function hub(event, payload = {}) {
    const data = { type: 'kls:hub', event, slug: 'cosmic-math-quest', profileId: 'dad', sessionId: 'session-dad', ...payload };
    (windowEvents.get('message') || []).forEach(fn => fn({ source: context.parent, data }));
  }
  for (const script of scripts) {
    vm.runInContext(script.source, context, { filename: script.name });
    // Model the parent binding the profile before the last game's wiring
    // script has registered its checkpoint. That must not publish readiness.
    if (earlyProfile && script.name.endsWith('game-bridge.js')) hub('setProfile');
  }
  function finishDOMContentLoaded() {
    document.readyState = 'interactive';
    (documentEvents.get('DOMContentLoaded') || []).slice().forEach(fn => fn());
    document.readyState = 'complete';
  }
  if (!deferDOMContentLoaded) finishDOMContentLoaded();
  function save(requestId) { hub('requestState', { requestId }); return sent.findLast(msg => msg.event === 'saveState' && msg.requestId === requestId); }
  return { context, storage, sent, errors, timers, hub, save, finishDOMContentLoaded, node: id => ids.get(id) };
}

const wrong = { key: 'multiply_6_7', prompt: '6 × 7 = ?', correctAnswer: 42, childAnswer: 41, resolved: false,
  masteryStage: 'practicing', successCountInPractice: 1, consecutiveCorrect: 1, missCount: 2,
  questionSnapshot: { key: 'multiply_6_7', prompt: '6 × 7 = ?', answer: 42, operation: 'multiply', type: 'recall', level: 'easy', mode: 'multiply', operands: { a: 6, b: 7 } } };
const seed = {
  cosmicMathQuest_v1__dad: JSON.stringify({ grade: 4, totalStars: 35, roundsPlayed: 12, badges: ['first', 'star10'], stats: { mistakesFixed: 7 } }),
  cosmicMathQuest_wrongs_v1__dad: JSON.stringify({ schemaVersion: 1, wrongAnswersHistory: [wrong], recentWrongAnswers: [wrong] }),
  cosmicMathQuest_v1__bmoney: JSON.stringify({ grade: 2, totalStars: 9 }),
  cosmicMathQuest_v1: JSON.stringify({ grade: 5, totalStars: 999 }),
};

{
  const h = boot(seed, { earlyProfile: true, deferDOMContentLoaded: true });
  assert.equal(h.context.KLS.bridge.getProfileId(), 'dad', 'early profile identity may be cached');
  assert.equal(h.sent.some(msg => msg.event === 'profileReady'), false, 'no profile-ready acknowledgement before all game scripts load');
  assert.equal(h.sent.some(msg => msg.event === 'bridgeReady'), false, 'bridge readiness waits for DOMContentLoaded');
  assert.equal(h.context.__cmq_captureState().grade, null, 'profile storage callbacks wait until game wiring exists');
  assert.equal(h.save('too-early'), undefined, 'premature requests do not invoke partially wired checkpoint');
  h.hub('resumeState', { state: { v: 2, screen: 'screen-menu', grade: 3, playMode: 'boss' } });
  assert.equal(h.node('cmq-resume-row').hidden, true, 'premature resume does not interrupt initialization');
  h.finishDOMContentLoaded();
  assert.ok(h.sent.some(msg => msg.event === 'profileReady'), 'bound profile becomes ready after game scripts load');
  assert.ok(h.sent.some(msg => msg.event === 'bridgeReady'));
  assert.equal(h.node('grade-chip').textContent, '🌌 Grade 4 · change');
  assert.equal(h.save('ready')?.ok, true, 'early parent handshake still produces a confirmed Save after startup');
  assert.deepEqual(h.errors, []);
}

{
  const h = boot(seed);
  assert.equal(typeof h.context.__cmq_captureState, 'function', 'complete startup exposes checkpoint');
  assert.ok(h.sent.some(msg => msg.event === 'bridgeReady'), 'bridge startup announces readiness');
  h.hub('setProfile');
  assert.equal(h.node('grade-chip').textContent, '🌌 Grade 4 · change');
  assert.ok(h.sent.some(msg => msg.event === 'profileReady'));
  const menu = h.save('menu');
  assert.equal(menu?.ok, true, 'older Dad progress saves after full startup');
  assert.equal(menu.state.grade, 4);
  assert.equal(menu.state.screen, 'screen-menu');
  h.node('btn-tile-mission').click();
  assert.equal(h.context.__cmq_captureState().screen, 'screen-game');
  h.node('answer-input').value = '17';
  const live = h.save('live');
  assert.equal(live?.ok, true, 'in-game checkpoint confirms Save');
  assert.equal(live.state.input, '17');
  assert.ok(live.state.session.currentQuestion, 'real generators created question');
  h.hub('goHome');
  assert.ok(h.node('screen-menu').classList.contains('active'), 'Home leaves active mission');
  assert.equal(h.save('home')?.ok, true, 'Home retains a saveable continuation');
  assert.equal(h.save('home-again').state.input, '17');
  assert.equal(JSON.parse(h.storage.get('cosmicMathQuest_v1__dad')).totalStars, 35, 'existing rewards preserved');
  assert.equal(JSON.parse(h.storage.get('cosmicMathQuest_wrongs_v1__dad')).wrongAnswersHistory.length, 1, 'existing mistakes preserved');
  assert.equal(h.storage.get('cosmicMathQuest_v1__bmoney'), seed.cosmicMathQuest_v1__bmoney, 'other profile untouched');
  assert.equal(h.storage.get('cosmicMathQuest_v1'), seed.cosmicMathQuest_v1, 'standalone progress untouched');
  assert.deepEqual(h.errors, [], 'no startup or profile callback errors');

  const reopened = boot(Object.fromEntries(h.storage)); reopened.hub('setProfile');
  reopened.hub('resumeState', { state: live.state });
  assert.equal(reopened.node('cmq-resume-row').hidden, false);
  assert.equal(reopened.save('pending').state.input, '17', 'Save before Continue retains older checkpoint');
  reopened.node('btn-cmq-resume').click();
  assert.equal(reopened.node('answer-input').value, '17', 'Continue restores draft');
  assert.equal(reopened.save('continued')?.ok, true, 'continued mission remains saveable');
  assert.deepEqual(reopened.errors, []);
}

{
  const h = boot(seed, { failStorage: true }); h.hub('setProfile');
  const result = h.save('quota');
  assert.equal(result?.ok, false, 'storage failure gives explicit reply, never timeout');
  assert.match(result.error, /quota/);
  assert.equal(h.storage.get('cosmicMathQuest_v1__dad'), seed.cosmicMathQuest_v1__dad);
}

for (const grade of [2, 3, 4, 5]) {
  for (const mode of ['mission', 'boss', 'lightning']) {
    const h = boot({ cosmicMathQuest_v1__dad: JSON.stringify({ grade, totalStars: 3 }) });
    h.hub('setProfile'); h.node('btn-tile-' + mode).click();
    const before = h.save('playing');
    assert.equal(before?.ok, true, 'Save works in ' + mode + ', grade ' + grade);
    const q = before.state.session.currentQuestion;
    h.node('answer-input').value = String(q.answer);
    h.node('answer-input-r').value = q.answerR == null ? '' : String(q.answerR);
    h.node('btn-submit-answer').click();
    const answered = h.save('answered');
    assert.equal(answered?.ok, true, 'answered checkpoint confirms ' + mode + ', grade ' + grade);
    assert.equal(answered.state.session.correctCount, 1);
    assert.equal(answered.state.session.answered, true);
    h.hub('suspendSession');
    assert.equal(h.context.__cmq_captureState().session.lightningTimerId, undefined, 'timer handles never persisted');
    assert.deepEqual(h.errors, []);
  }
}

{
  const h = boot(seed, { embedded: false });
  assert.equal(h.context.__cmq_captureState().grade, 5, 'standalone still uses standalone progress');
  h.node('btn-tile-mission').click();
  assert.equal(h.context.__cmq_captureState().screen, 'screen-game');
  assert.deepEqual(h.errors, []);
}

console.log('smoke-startup-save: OK — full CMQ startup, older Dad data, handshake, Save/Home/Continue, storage failure, and standalone');
