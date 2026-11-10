/* Real hub + progress APIs, with an in-memory DOM/storage surface.
 * No child profile or browser data is read or written by this suite. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL('shared/scripts/' + name, root), 'utf8');

class TextNode {
  constructor(value) { this.nodeType = 3; this.textContent = String(value); }
}
class Element {
  constructor(tag, attrs = {}) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = { ...attrs };
    this.children = []; this.events = new Map(); this.dataset = {};
    this.hidden = false; this.offsetWidth = 1;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
    };
  }
  get className() { return this.attrs.class || ''; }
  set className(value) { this.attrs.class = String(value); }
  get textContent() { return this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.children = [new TextNode(value)]; }
  set innerHTML(html) {
    this.children = [];
    // Parse only the hub's trusted static shell. Dynamic card content is built
    // by the actual util.el implementation below, so its semantics stay real.
    const stack = [this];
    for (const token of String(html).matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)) {
      const value = token[0];
      if (value.startsWith('</')) { stack.pop(); continue; }
      if (!value.startsWith('<')) { stack.at(-1).append(new TextNode(value)); continue; }
      const tag = value.match(/^<([a-z][a-z0-9-]*)/i)[1];
      const attrs = {};
      for (const attr of value.matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/gi)) attrs[attr[1]] = attr[2];
      const child = new Element(tag, attrs); stack.at(-1).append(child);
      if (!/\/>$/.test(value) && !['input', 'img', 'br', 'hr', 'link', 'meta'].includes(tag)) stack.push(child);
    }
  }
  append(...children) {
    for (const child of children.flat()) {
      const node = child.nodeType ? child : new TextNode(child);
      node.ownerDocument = this.ownerDocument;
      node.parentNode = this;
      this.children.push(node);
    }
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(fn); }
  matches(selector) {
    const descendant = selector.match(/^(.*)\s+([^ ]+)$/);
    if (descendant) {
      if (!this.matches(descendant[2])) return false;
      for (let ancestor = this.parentNode; ancestor; ancestor = ancestor.parentNode) {
        if (ancestor.matches?.(descendant[1])) return true;
      }
      return false;
    }
    const attribute = selector.match(/^(.*?)\[([a-z][a-z0-9-]*)="([^"]*)"\]$/i);
    if (attribute) return (!attribute[1] || this.matches(attribute[1])) && this.getAttribute(attribute[2]) === attribute[3];
    if (selector.startsWith('#')) return this.attrs.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const [tag, klass] = selector.split('.');
    return this.tagName.toLowerCase() === tag.toLowerCase() && (!klass || this.classList.contains(klass));
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(s => s.trim());
    const found = [];
    const visit = node => {
      for (const child of node.children) {
        if (!(child instanceof Element)) continue;
        if (selectors.some(s => child.matches(s))) found.push(child);
        visit(child);
      }
    };
    visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  click() { for (const fn of this.events.get('click') || []) fn({ currentTarget: this, target: this }); }
  focus() { this.ownerDocument.activeElement = this; }
}

const profile = (id, games = {}) => ({ id, displayName: id, avatar: '🦊', games });
const game = (gameState = null, lastPlayedAt = null, extra = {}) => ({ levels: {}, stickers: [], gameState, lastPlayedAt, ...extra });
const checkpoint = () => ({ version: 1, question: 'kept exactly' });

function harness({ games = {}, profiles = null, activeProfileId = 'alice' } = {}) {
  const initial = { version: 2, activeProfileId, profiles: profiles || { alice: profile('alice', games) } };
  const values = new Map([['kls.progress.v2', JSON.stringify(initial)]]);
  const events = new Map(), errors = []; let writes = 0;
  const body = new Element('body');
  for (const id of ['hub-root', 'stage-root', 'stage-frame']) body.append(new Element(id === 'stage-frame' ? 'iframe' : 'div', { id }));
  const document = {
    readyState: 'complete', title: '',
    createElement: tag => Object.assign(new Element(tag), { ownerDocument: document }), createTextNode: value => new TextNode(value),
    querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector),
  };
  body.ownerDocument = document;
  for (const node of body.children) node.ownerDocument = document;
  const context = vm.createContext({ document, location: { hash: '' },
    console: { warn: (...args) => errors.push(args), error: (...args) => errors.push(args) },
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes++; values.set(key, String(value)); }, removeItem: key => { writes++; values.delete(key); } },
    addEventListener(name, fn) { if (!events.has(name)) events.set(name, []); events.get(name).push(fn); },
    KLS: { chrome: { registerSlugs() {}, unmount() {}, getSession: () => null }, profileUI: { ensureProfileOrPick: fn => fn() } },
  });
  context.window = context;
  for (const name of ['util.js', 'progress.js', 'hub.js']) vm.runInContext(source(name), context, { filename: name });
  assert.deepEqual(errors, [], 'real hub boot must complete without rendering errors');
  const find = selector => body.querySelector(selector);
  const library = () => find('#hub-tiles').querySelectorAll('a.hub-game');
  const featured = () => find('#hub-spotlight')?.querySelector('a.hub-spotlight') || null;
  const filter = label => {
    const chip = find('#hub-filter').querySelectorAll('button').find(node => node.textContent === label);
    assert.ok(chip, 'topic button exists: ' + label); chip.click();
  };
  const emit = (name, data) => { for (const fn of events.get(name) || []) fn(data); };
  return { context, P: context.KLS.progress, find, library, featured, filter, values, emit, errors, get writes() { return writes; } };
}

function href(node) { return node?.getAttribute('href') || null; }
function cardFor(h, slug) { return h.library().find(node => href(node) === '#/games/' + slug); }
function text(node) { return node.textContent.replace(/\s+/g, ' ').trim(); }

// Complete names, true rewards, empty-state labels, and one accessible target.
{
  const h = harness({ games: {
    'logic-detectives': game(checkpoint(), '2026-01-01', { levels: { a: { stars: 3 }, b: { stars: 1 } }, stickers: ['first', 'second'] }),
    'word-problem-adventure': game(null, '2026-02-01', { levels: { a: { stars: 1 } }, stickers: ['one'] }),
    'long-division-coach': game(checkpoint(), '2026-03-01'),
  } });
  assert.equal(h.library().length, 5);
  for (const meta of h.context.KLS.GAMES) {
    const card = cardFor(h, meta.slug);
    assert.ok(card, 'registered game has its exact route: ' + meta.slug);
    assert.equal(text(card.querySelector('.hub-game__title')), meta.title, 'full title is visible as text');
    assert.equal(card.getAttribute('aria-label'), (h.P.getGameState(meta.slug) != null ? 'Continue ' : 'Play ') + meta.title,
      'link names its action and full game title');
    assert.ok(h.find('#' + card.getAttribute('aria-describedby')), 'link reward description resolves');
    assert.equal(card.querySelectorAll('a,button,input,select,textarea').length, 0, 'card has no nested interactive controls');
  }
  const plural = text(cardFor(h, 'logic-detectives').querySelector('.hub-game__rewards'));
  assert.match(plural, /4 stars/); assert.match(plural, /2 stickers/);
  const singular = text(cardFor(h, 'word-problem-adventure').querySelector('.hub-game__rewards'));
  assert.match(singular, /1 star\b/); assert.match(singular, /1 sticker\b/);
  assert.doesNotMatch(singular, /1 stars|1 stickers/);
  assert.match(text(cardFor(h, 'long-division-coach')), /Saved adventure/);
  assert.match(text(cardFor(h, 'cosmic-math-quest')), /New adventure/);
  assert.match(text(cardFor(h, 'logic-detectives')), /Continue/);
  assert.match(text(cardFor(h, 'word-problem-adventure')), /Play/);
  assert.match(text(h.find('#hub-account-actions')), /Progress saves as you play/);
  assert.equal(h.find('#hub-account-actions').querySelector('a').getAttribute('href'), '#/parent');
  assert.equal(h.writes, 0, 'rendering is read-only');
  assert.deepEqual(h.errors, []);
}

// Spotlight ignores unsaved/newer games and unregistered imported game entries.
{
  const h = harness({ games: {
    'logic-detectives': game(checkpoint(), '2026-01-01'),
    'word-problem-adventure': game(checkpoint(), '2026-02-01'),
    'cosmic-math-quest': game(null, '2029-01-01'),
    'removed-game': game(checkpoint(), '2030-01-01'),
  } });
  assert.equal(href(h.featured()), '#/games/word-problem-adventure');
  assert.match(text(h.featured()), /Continue your adventure/);
  assert.match(text(h.featured()), /Word Problem Adventure/);
  assert.match(text(h.featured()), /Saved adventure/);
  assert.equal(h.featured().querySelectorAll('a,button,input,select,textarea').length, 0);
  const spotlightLink = h.featured(); spotlightLink.focus();
  h.filter('Long Division');
  assert.equal(h.library().length, 1);
  assert.equal(href(h.library()[0]), '#/games/long-division-coach');
  assert.equal(href(h.featured()), '#/games/word-problem-adventure', 'filter cannot replace or hide spotlight');
  assert.equal(h.featured(), spotlightLink, 'filter preserves the spotlight link and keyboard focus');
  assert.equal(h.context.document.activeElement, spotlightLink);
  assert.equal(h.find('#hub-filter').querySelectorAll('button').find(chip => chip.textContent === 'Long Division').getAttribute('aria-pressed'), 'true');
  h.filter('Mult & Div');
  assert.deepEqual(h.library().map(href), ['#/games/cosmic-math-quest', '#/games/long-division-coach']);
  h.P.saveGameState('long-division-coach', checkpoint());
  assert.equal(href(h.featured()), '#/games/long-division-coach', 'checkpoint write refreshes spotlight while filtered');
  assert.match(text(cardFor(h, 'long-division-coach')), /Saved adventure/);
  const focusedCard = cardFor(h, 'long-division-coach'); focusedCard.focus();
  h.P.awardStars('long-division-coach', 'together', 3);
  assert.equal(h.context.document.activeElement, cardFor(h, 'long-division-coach'), 'live card refresh retains keyboard focus');
  assert.match(text(cardFor(h, 'long-division-coach')), /3 stars/);
  assert.match(text(h.featured()), /3 stars/);
  h.P.reset('long-division-coach');
  assert.equal(href(h.featured()), '#/games/word-problem-adventure', 'reset selects next saved game');
  assert.match(text(cardFor(h, 'long-division-coach')), /New adventure/);
  h.P.clearGameState('word-problem-adventure');
  h.P.clearGameState('logic-detectives');
  assert.equal(h.featured(), null, 'no spotlight remains without any checkpoint');
}

// If a live update chooses a different featured game while its link is focused,
// keep the child's original target. A new spotlight must not hijack Enter.
for (const filtered of [false, true, 'filter-removed']) {
  const h = harness({ games: { 'logic-detectives': game(checkpoint(), '2026-01-01') } });
  if (filtered) h.filter('Word Problems');
  const original = h.featured(); original.focus();
  const activeFilter = h.find('#hub-filter').querySelectorAll('button').find(chip => chip.getAttribute('aria-pressed') === 'true');
  if (filtered === 'filter-removed') h.find('#hub-filter').innerHTML = '';
  h.P.saveGameState('word-problem-adventure', checkpoint());
  assert.equal(href(h.featured()), '#/games/word-problem-adventure', 'live update can feature a new game');
  const expected = filtered === 'filter-removed' ? h.find('#hub-profile-pill')
    : filtered ? activeFilter : cardFor(h, 'logic-detectives');
  assert.equal(h.context.document.activeElement, expected,
    filtered === 'filter-removed' ? 'profile button is the last safe focus fallback'
      : filtered ? 'pressed topic receives focus when the original game is filtered out'
        : 'original featured game retains focus in the library when the spotlight changes');
  assert.notEqual(h.context.document.activeElement, h.featured(), 'focus never jumps to the replacement game');
  assert.deepEqual(h.errors, []);
}

// Checkpoints are opaque: false and zero remain legitimate saved values, just
// as the existing route/resume API treats every non-null value as saved.
for (const saved of [false, 0]) {
  const h = harness({ games: { 'long-division-coach': game(saved, '2026-01-01') } });
  assert.equal(href(h.featured()), '#/games/long-division-coach');
  assert.equal(cardFor(h, 'long-division-coach').getAttribute('aria-label'), 'Continue Long Division Coach');
  assert.match(text(cardFor(h, 'long-division-coach')), /Saved adventure/);
}

// Date ties preserve registry order, including invalid/missing timestamps.
for (const [games, expected] of [
  [{ 'word-problem-adventure': game(checkpoint(), '2026-01-01'), 'logic-detectives': game(checkpoint(), '2026-01-01') }, 'logic-detectives'],
  [{ 'word-problem-adventure': game(checkpoint(), null), 'logic-detectives': game(checkpoint(), 'not a date') }, 'logic-detectives'],
  [{ 'logic-detectives': game(checkpoint(), 'invalid'), 'cosmic-math-quest': game(checkpoint(), '1970-01-01T00:00:00.000Z') }, 'cosmic-math-quest'],
  [{ 'logic-detectives': game(checkpoint(), 'invalid'), 'word-problem-adventure': game(checkpoint(), null), 'cosmic-math-quest': game(checkpoint(), '1960-01-01') }, 'cosmic-math-quest'],
]) {
  const h = harness({ games });
  assert.equal(href(h.featured()), '#/games/' + expected, 'stable timestamp ordering');
}

// A profile change never borrows another child's checkpoint/rewards. Replacing
// an export and cross-tab restore both notify and refresh the real hub render.
{
  const h = harness({ profiles: {
    alice: profile('alice', { 'logic-detectives': game(checkpoint(), '2026-01-01', { levels: { a: { stars: 2 } } }) }),
    bob: profile('bob', { 'cosmic-math-quest': game(checkpoint(), '2026-02-01', { stickers: ['bob-only'] }) }),
  } });
  const exported = h.P.exportAll();
  assert.equal(href(h.featured()), '#/games/logic-detectives');
  h.P.setActiveProfile('bob');
  assert.equal(href(h.featured()), '#/games/cosmic-math-quest');
  assert.equal(text(h.find('.hub__profile-name')), 'bob', 'account label refreshes with the active profile');
  assert.doesNotMatch(text(cardFor(h, 'logic-detectives')), /2 stars/);
  assert.match(text(cardFor(h, 'cosmic-math-quest')), /1 sticker/);
  const fresh = h.P.createProfile({ displayName: 'New learner' });
  assert.equal(h.P.get().activeProfileId, fresh.id);
  assert.equal(h.featured(), null);
  assert.ok(h.library().every(card => /New adventure/.test(text(card))));
  h.P.importJSON(exported, 'replace');
  assert.equal(href(h.featured()), '#/games/logic-detectives', 'replace restore refreshes checkpoint selection');
  assert.match(text(cardFor(h, 'logic-detectives')), /2 stars/);
  const replaced = { version: 2, activeProfileId: 'bob', profiles: { bob: profile('bob', { 'long-division-coach': game(checkpoint(), '2026-03-01') }) } };
  h.values.set('kls.progress.v2', JSON.stringify(replaced));
  h.emit('storage', { key: 'kls.progress.v2' });
  assert.equal(href(h.featured()), '#/games/long-division-coach', 'storage notification refreshes restored state');
  assert.doesNotMatch(text(cardFor(h, 'logic-detectives')), /2 stars/);
  assert.deepEqual(h.errors, []);
}

console.log('PASS: full dashboard titles and labeled rewards; one accessible card link; read-only rendering; registered checkpoint/date ranking and ties; filter-independent spotlight; safe focus when the featured game changes; live checkpoint/reward/reset refresh; isolated profiles/new accounts; replace import and cross-tab restore notifications.');
