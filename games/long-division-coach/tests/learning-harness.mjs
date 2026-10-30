/** Small deterministic DOM/timer fixture. It never reads browser profiles or saves. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

export const copy = value => JSON.parse(JSON.stringify(value));
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

export class Element {
  constructor(tag = 'div', text = null) {
    this.tagName = tag.toUpperCase(); this.nodeType = text === null ? 1 : 3;
    this.ownText = text || ''; this.childNodes = []; this.parentNode = null;
    this.attributes = {}; this.listeners = {}; this.hidden = false; this.disabled = false;
    this.value = ''; this.namespaceURI = 'http://www.w3.org/1999/xhtml'; this.focused = false;
    this.style = { setProperty(k, v) { this[k] = String(v); }, removeProperty(k) { delete this[k]; } };
    this.classList = {
      contains: k => this.className.split(/\s+/).includes(k),
      add: (...ks) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...ks])].join(' '); },
      remove: (...ks) => { this.className = this.className.split(/\s+/).filter(k => !ks.includes(k)).join(' '); },
      toggle: (k, on) => { on = on ?? !this.classList.contains(k); on ? this.classList.add(k) : this.classList.remove(k); return on; }
    };
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes.at(-1) || null; }
  get textContent() { return this.ownText + this.childNodes.map(n => n.textContent).join(''); }
  set textContent(value) { this.ownText = String(value); this.childNodes = []; }
  set className(value) { this.attributes.class = value; }
  get className() { return this.attributes.class || ''; }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === 'value') this.value = String(value);
    if (key === 'hidden') this.hidden = true;
    if (key === 'disabled') this.disabled = true;
  }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; if (key === 'hidden') this.hidden = false; }
  append(...items) {
    for (let item of items) {
      if (typeof item === 'string') item = new Element('#text', item);
      if (item.parentNode) item.parentNode.childNodes = item.parentNode.childNodes.filter(n => n !== item);
      item.parentNode = this; this.childNodes.push(item);
    }
  }
  appendChild(item) { this.append(item); return item; }
  replaceChildren(...items) { this.childNodes.forEach(n => n.parentNode = null); this.childNodes = []; this.ownText = ''; this.append(...items); }
  remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter(n => n !== this); this.parentNode = null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
  fire(type, props = {}) {
    const event = { target: this, currentTarget: this, preventDefault() { this.defaultPrevented = true; }, ...props };
    for (const fn of this.listeners[type] || []) fn(event);
    return event;
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.getAttribute('id') === selector.slice(1);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) return attribute[2] === undefined ? this.getAttribute(attribute[1]) !== null : this.getAttribute(attribute[1]) === attribute[2];
    return this.tagName.toLowerCase() === selector;
  }
  querySelectorAll(selector) {
    const out = [];
    function walk(node) { for (const child of node.children) { if (child.matches(selector)) out.push(child); walk(child); } }
    walk(this); return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.focused = true; }
  getTotalLength() { return 100; }
  getPointAtLength(length) { return { x: length, y: length }; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 704, height: 300, bottom: 300, right: 704 }; }
}

export function boot(saved, options = {}) {
  const container = new Element();
  const saves = [], mistakes = [], completions = [], external = [], documentEvents = {}, windowEvents = {}, timers = new Map(), frames = new Map();
  let nextId = 0, now = 0, sharingPlayer = null, storageOK = true;
  const document = {
    hidden: false,
    getElementById: id => container.id === id ? container : container.querySelector('#' + id),
    createElement: tag => new Element(tag), createTextNode: text => new Element('#text', String(text)),
    createElementNS: (namespace, tag) => { const el = new Element(tag); el.namespaceURI = namespace; return el; },
    addEventListener: (name, fn) => (documentEvents[name] ||= []).push(fn),
    removeEventListener: (name, fn) => { documentEvents[name] = (documentEvents[name] || []).filter(f => f !== fn); }
  };
  const window = {
    document,
    matchMedia: () => ({ matches: options.reducedMotion !== false, addEventListener() {}, removeEventListener() {} }),
    ResizeObserver: class { observe() {} disconnect() {} },
    addEventListener: (name, fn) => (windowEvents[name] ||= []).push(fn),
    removeEventListener: (name, fn) => { windowEvents[name] = (windowEvents[name] || []).filter(f => f !== fn); },
    DivisionSharingPlayer: {
      mount(mount, options) {
        let index = options.initialStep, destroyed = false;
        const emit = () => options.onStep({ step: index, completedStep: index, title: 'Sharing step ' + index, quotient: index === 5 ? '144' : '—', busy: false, canPrevious: index > 0, canNext: index < 5, complete: index === 5 });
        sharingPlayer = {
          next() { if (index < 5) index++; emit(); }, previous() { if (index > 0) index--; emit(); },
          replay() { emit(); }, finish() { emit(); }, getStep() { return index; },
          destroy() { destroyed = true; }, get destroyed() { return destroyed; }
        };
        emit(); return sharingPlayer;
      }
    }
  };
  const context = vm.createContext({ document, window, console,
    setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, due: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id)
  });
  window.requestAnimationFrame = context.requestAnimationFrame;
  window.cancelAnimationFrame = context.cancelAnimationFrame;
  vm.runInContext(read('division-core.js'), context);
  if (options.realSharing) {
    vm.runInContext(read('sharing-player.js'), context);
    const mountSharing = window.DivisionSharingPlayer.mount;
    window.DivisionSharingPlayer.mount = (...args) => { sharingPlayer = mountSharing(...args); return sharingPlayer; };
  }
  vm.runInContext(read('learning-journey.js'), context);
  const journey = window.LDCLearningJourney.mount(container, {
    initialState: saved && copy(saved),
    onChange(snapshot) { saves.push(copy(snapshot)); return storageOK; },
    onMistake(event) { mistakes.push(copy(event)); },
    onCompleted(event) { completions.push(copy(event)); },
    onOpenClassic(mode) { external.push(mode); },
    onReset() { external.push('reset'); },
    ...(options.mountOptions || {})
  });
  function state() { return copy(journey.getState()); }
  function mode(next) {
    const b = container.querySelectorAll('[data-mode]').find(b => b.getAttribute('data-mode') === next);
    assert(b, 'Missing mode control: ' + next); b.fire('click');
  }
  function button(label) {
    const b = container.querySelectorAll('button').find(b => b.textContent === label);
    assert(b, 'Missing button: ' + label); return b;
  }
  function input(value) { const field = container.querySelector('#dp-answer'); assert(field, 'Missing answer field'); field.value = value; field.fire('input'); }
  function submit(value) {
    if (value !== undefined) input(value);
    const check = container.querySelector('#dp-check'); assert(check); check.fire('click');
  }
  function flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); }
  function advance(milliseconds) {
    now += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); }
    flushFrames();
  }
  function hide() { document.hidden = true; (documentEvents.visibilitychange || []).forEach(fn => fn()); }
  function show() { document.hidden = false; (documentEvents.visibilitychange || []).forEach(fn => fn()); }
  return {
    container, saves, mistakes, completions, external, timers, frames, context, journey, document,
    mode, button, input, submit, flushFrames, advance, hide, show, state,
    get root() { return container.querySelector('#division-play-lab'); },
    get view() { return container.querySelector('#dp-view'); },
    get sharingPlayer() { return sharingPlayer; },
    failStorage(on = true) { storageOK = !on; }
  };
}

export function active(env) { const state = env.state(); return state.mode === 'guided' ? state.guided : state.solo; }
export function currentEngine(env) {
  const p = active(env), problems = { together: [528, 3], solo1: [672, 4], solo2: [738, 3], solo3: [864, 4], zero: [804, 4], remainder: [553, 4], extra: [435, 3] };
  return env.context.window.DivisionPracticeCore.replay(...problems[p.id], p.answers);
}
export function finishWork(env) {
  let steps = 0;
  while (currentEngine(env).phase !== 'done') {
    env.submit(String(env.context.window.DivisionPracticeCore.expectation(currentEngine(env)).expected));
    env.flushFrames(); assert(++steps < 40, 'Work must finish');
  }
}
export function assertCompleted(env) {
  assert.equal(currentEngine(env).phase, 'done');
  assert.equal(active(env).checked, true, 'Valid final subtraction completes division immediately');
  assert.equal(env.view.querySelector('#dp-verify'), null, 'There is no required large multiplication input');
  assert(env.context.window.DivisionPracticeCore.checkFinal(currentEngine(env)));
}
