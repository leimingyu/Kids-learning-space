/** The production lesson's arithmetic is replayable, immutable and independent of the DOM. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL('../division-core.js', import.meta.url), 'utf8'), context);
const core = context.window.DivisionPracticeCore;

function solve(dividend, divisor) {
  let state = core.create(dividend, divisor);
  while (state.phase !== 'done') {
    const before = JSON.stringify(state);
    const expected = core.expectation(state).expected;
    const wrong = core.submit(state, expected + 1);
    assert.equal(wrong.correct, false);
    assert.equal(wrong.next, state);
    assert.equal(JSON.stringify(state), before);
    const correct = core.submit(state, expected);
    assert.equal(correct.correct, true);
    assert.notEqual(correct.next, state);
    assert.equal(JSON.stringify(state), before, 'submission must not mutate input');
    state = correct.next;
    assert.equal(core.validate(state).valid, true);
    assert.equal(JSON.stringify(core.replay(dividend, divisor, state.answerLog)), JSON.stringify(state));
  }
  assert.equal(core.checkFinal(state), true);
  assert.equal(state.quotient, Math.floor(dividend / divisor));
  assert.equal(state.remainder, dividend % divisor);
  assert.equal(state.answerLog.length, state.stepsCompleted);
  return state;
}

for (const [n, d, q, r] of [
  [528, 3, 176, 0], [672, 4, 168, 0], [435, 3, 145, 0], [804, 4, 201, 0],
  [553, 4, 138, 1], [96, 4, 24, 0], [432, 3, 144, 0], [1005, 5, 201, 0],
  [0, 3, 0, 0], [2, 3, 0, 2], [9999, 9, 1111, 0]
]) {
  const state = solve(n, d);
  assert.equal(core.answer(state).quotient, q);
  assert.equal(core.answer(state).remainder, r);
  assert.equal(core.submit(state, 0).correct, false);
  const rows = core.displayRows(state);
  assert.equal(rows.some(x => x.type === 'typedigit'), false);
  assert.equal(rows.filter(x => x.type === 'product').length, state.rows.filter(x => x.type === 'typedigit').length);
}

let state = core.create(528, 3);
for (let i = 0; i < 3; i++) state = core.submit(state, core.expectation(state).expected).next;
assert.equal(state.phase, 'bringDown');
assert.equal(state.remainder, 2);
assert.equal(core.submit(state, 22).correct, false, 'bring down accepts the next digit rather than the combined number');
assert.equal(core.submit(state, 2).next.currentValue, 22);
const zeroState = solve(804, 4);
assert.equal(zeroState.quotientDigits.join(''), '201');
assert.equal(zeroState.rows.filter(row => row.type === 'typedigit' && row.value === 0).length, 1);

for (const invalid of [NaN, Infinity, -1, 1.5, '1', null, undefined]) {
  assert.equal(core.submit(core.create(528, 3), invalid).correct, false);
}
assert.throws(() => core.create(20, 0));
assert.throws(() => core.create(-1, 3));
assert.throws(() => core.replay(528, 3, [2]));
assert.throws(() => core.replay(528, 3, Array(257).fill(1)));
const tampered = JSON.parse(JSON.stringify(solve(528, 3)));
tampered.quotient = 177;
assert.equal(core.validate(tampered).valid, false);
assert.equal(core.validate({ version: 2 }).valid, false);
console.log('Division core: exact/remainder/internal-zero arithmetic, immutable transitions, replay and tamper checks passed.');
