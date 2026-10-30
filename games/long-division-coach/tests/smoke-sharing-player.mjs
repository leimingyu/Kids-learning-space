/** Real SVG sharing player: place-value conservation, direction arrows and cancellation. */
import assert from 'node:assert/strict';
import { boot } from './learning-harness.mjs';

// Reduced motion reaches every meaningful state without requiring an animation.
const reduced = boot(undefined, { realSharing: true }); reduced.mode('sharing');
assert(reduced.view.querySelector('svg'));
for (let i = 1; i <= 5; i++) {
  reduced.button('Next step').fire('click');
  assert.equal(reduced.state().shareStep, i);
  assert(reduced.view.querySelectorAll('[marker-end]').length > 0, 'Each share/exchange has direction arrows');
}
assert.equal(reduced.state().shareSeen, true);
assert(reduced.view.textContent.includes('Three equal groups of 144'));
assert(reduced.view.querySelector('desc').textContent.includes('Group 1: 144. Group 2: 144. Group 3: 144.'));
assert.equal(reduced.completions.length, 0, 'Watching is not independent practice');

// Finishing a moving step settles the same value. Unmounting cancels every RAF.
const moving = boot(undefined, { realSharing: true, reducedMotion: false }); moving.mode('sharing');
moving.button('Next step').fire('click');
assert.equal(moving.view.querySelector('#dp-sharing-mount').getAttribute('aria-busy'), 'true');
assert(moving.view.querySelectorAll('[marker-end]').length > 0);
assert(moving.frames.size > 0);
moving.button('Finish step').fire('click');
assert.equal(moving.state().shareStep, 1);
assert.equal(moving.view.querySelector('#dp-sharing-mount').getAttribute('aria-busy'), 'false');
moving.button('Next step').fire('click');
assert(moving.frames.size > 0);
const staleFrames = [...moving.frames.values()], before = moving.saves.length;
moving.journey.suspend();
assert.equal(moving.frames.size, 0);
staleFrames.forEach(frame => frame(10000));
await Promise.resolve(); await Promise.resolve();
assert.equal(moving.saves.length, before, 'A cancelled animation cannot save after a profile/game change');
console.log('Sharing player: six conserved place-value stages, direction arrows, reduced motion and cancelled animations passed.');
