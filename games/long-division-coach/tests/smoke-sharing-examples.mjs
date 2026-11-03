/** All curated sharing plans and real SVG motion, including multi-unit exchanges. */
import assert from 'node:assert/strict';
import { sharingHarness } from './sharing-harness.mjs';

const examples = [[84, 4, 21, 0], [96, 4, 24, 0], [432, 3, 144, 0], [804, 4, 201, 0], [553, 4, 138, 1]];
const placeValue = counts => counts.reduce((sum, count, unit) => sum + count * [100, 10, 1][unit], 0);

for (const [dividend, divisor, quotient, remainder] of examples) {
  const h = sharingHarness(dividend, divisor), plan = h.api.createPlan(dividend, divisor);
  assert.equal(plan.dividend, dividend); assert.equal(plan.divisor, divisor);
  assert.equal(plan.quotient, quotient); assert.equal(plan.remainder, remainder);
  for (const stage of plan.stages) {
    assert.equal(placeValue(stage.left) + divisor * placeValue(stage.each), dividend, stage.title + ' conserves all blocks');
    assert(stage.left.every(n => Number.isInteger(n) && n >= 0));
    assert(stage.each.every(n => Number.isInteger(n) && n >= 0));
  }
  assert.equal(h.state.stageCount, plan.stages.length);
  assert.equal(h.completions.length, 0, 'Mount is read-only');
  while (h.state.canNext) await h.animate(h.player.next());
  assert.equal(h.state.complete, true);
  assert.equal(Number(h.state.quotient.replace(/\s/g, '')), quotient);
  assert.equal(h.state.remainder, remainder);
  const description = h.container.querySelector('desc').textContent;
  for (let group = 1; group <= divisor; group++) assert(description.includes('Group ' + group + ': ' + quotient), 'Every group has the right final value');
  assert.equal(h.completions.length, 1);
  assert.equal(h.completions[0].dividend, dividend); assert.equal(h.completions[0].divisor, divisor);
  assert.equal(h.completions[0].quotient, quotient); assert.equal(h.completions[0].remainder, remainder);
  const restored = sharingHarness(dividend, divisor, { initialStep: plan.stages.length - 1 });
  assert.equal(restored.state.complete, true); assert.equal(restored.completions.length, 0, 'A restored watched lesson cannot complete again');
  const final = plan.stages.at(-1);
  assert.equal(placeValue(final.left), remainder); assert.equal(placeValue(final.each), quotient);
  if (dividend === 84) assert(!plan.stages.some(s => s.share === 0 || s.exchange === 0), 'Two-digit lesson omits the empty hundreds stage');
  if (dividend === 804) assert(plan.stages.some(s => s.share === 1 && s.each[1] === 0), 'Zero tens is an explicit share stage');
  if (dividend === 553) assert(plan.stages.some(s => s.exchange === 1 && s.exchangeCount === 3 && s.left[2] === 33), 'All three remaining tens become thirty ones');
}

// Animate every flight, instead of jumping directly to its final stage. The
// production player checks conservation whenever blocks leave or settle.
for (const [dividend, divisor] of examples) {
  const h = sharingHarness(dividend, divisor, { reducedMotion: false, width: 320 });
  while (h.state.canNext) {
    const previousQuotient = h.state.quotient;
    const animation = h.player.next();
    assert.equal(h.state.busy, true);
    assert.equal(h.state.quotient, previousQuotient, 'Quotient waits for the sharing motion to settle');
    await h.animate(animation);
    assert.equal(h.state.busy, false); assert.equal(h.frames.size, 0);
  }
  assert.equal(h.state.complete, true); assert.equal(h.completions.length, 1);
  assert(!/NaN|undefined/.test(h.container.querySelector('svg').getAttribute('viewBox')));
}

// Broader plan coverage catches hard-coded group counts and place limits.
const api = sharingHarness().api;
for (let divisor = 2; divisor <= 9; divisor++) for (let dividend = 0; dividend <= 999; dividend++) {
  const plan = api.createPlan(dividend, divisor), final = plan.stages.at(-1);
  assert.equal(plan.quotient, Math.floor(dividend / divisor));
  assert.equal(plan.remainder, dividend % divisor);
  assert.equal(placeValue(final.each), plan.quotient);
  assert.equal(placeValue(final.left), plan.remainder);
  for (const stage of plan.stages) assert.equal(placeValue(stage.left) + divisor * placeValue(stage.each), dividend);
}
for (const args of [[-1, 3], [1000, 3], [84, 0], [84, 10], [84.5, 4], [84, 3.5]]) assert.throws(() => api.createPlan(...args));
const moving = sharingHarness(553, 4, { reducedMotion: false });
moving.player.next(); const stale = [...moving.frames.values()], count = moving.updates.length;
moving.player.destroy(); assert.equal(moving.frames.size, 0);
stale.forEach(fn => fn(10000)); await Promise.resolve(); await Promise.resolve();
assert.equal(moving.updates.length, count, 'Destroyed motion cannot commit to another lesson');
console.log('Sharing examples: five plans, every animated flight, multi-ten exchanges, zero shares, remainders and cancellation passed.');
