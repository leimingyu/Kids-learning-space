/** Real sharing player with deterministic animation frames and isolated SVG DOM. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { Element } from './learning-harness.mjs';

export function sharingHarness(dividend = 432, divisor = 3, options = {}) {
  const container = new Element(), frames = new Map(), updates = [], completions = [], events = {};
  let id = 0, time = 0;
  container.getBoundingClientRect = () => ({ width: options.width || 704, x: 0, y: 0, height: 400 });
  const document = {
    hidden: false,
    createElement: tag => new Element(tag),
    createElementNS: (ns, tag) => { const el = new Element(tag); el.namespaceURI = ns; return el; },
    addEventListener: (name, fn) => (events[name] ||= []).push(fn),
    removeEventListener: (name, fn) => { events[name] = (events[name] || []).filter(f => f !== fn); }
  };
  let resizeCallback = null;
  const window = {
    document,
    matchMedia: () => ({ matches: options.reducedMotion !== false, addEventListener() {}, removeEventListener() {} }),
    ResizeObserver: class { constructor(callback) { resizeCallback = callback; } observe() {} disconnect() {} },
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: key => frames.delete(key)
  };
  const context = vm.createContext({ window, console });
  vm.runInContext(fs.readFileSync(new URL('../sharing-player.js', import.meta.url), 'utf8'), context);
  const api = window.DivisionSharingPlayer;
  const player = api.mount(container, { dividend, divisor, initialStep: options.initialStep || 0,
    onStep: state => updates.push(JSON.parse(JSON.stringify(state))),
    onComplete: state => completions.push(JSON.parse(JSON.stringify(state))) });
  async function animate(promise) {
    let finished = false, failure;
    Promise.resolve(promise).then(() => { finished = true; }, e => { failure = e; finished = true; });
    for (let i = 0; !finished && i < 1000; i++) {
      time += 200;
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(fn => fn(time));
      await Promise.resolve(); await Promise.resolve();
    }
    if (failure) throw failure;
    assert(finished, 'Sharing animation completes within its bounded frame budget');
  }
  return { api, player, container, frames, updates, completions, document, events, animate,
    resize: () => resizeCallback?.(), get state() { return updates.at(-1); } };
}
