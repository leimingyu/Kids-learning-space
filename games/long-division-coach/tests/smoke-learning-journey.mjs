/** Exercise the real lesson controller with deterministic timers and isolated DOM. */
import assert from 'node:assert/strict';
import { boot, copy, active, currentEngine, finishWork, assertCompleted } from './learning-harness.mjs';

const lesson = boot();
assert.equal(lesson.saves.length, 0, 'Mount never overwrites an existing checkpoint');
assert.equal(lesson.state().screen, 'home');
lesson.mode('sharing');
for (let i = 0; i < 5; i++) lesson.button('Next step').fire('click');
assert.equal(lesson.state().shareStep, 5); assert.equal(lesson.state().shareSeen, true);
assert.equal(lesson.state().records.together, undefined, 'Watching cannot award practice completion');
assert.equal(lesson.completions.length, 0);
const oldPlayer = lesson.sharingPlayer;
lesson.button('Your turn: 528 ÷ 3 →').fire('click');
assert.equal(oldPlayer.destroyed, true); assert.equal(lesson.state().mode, 'guided');

// Invalid or unfinished entry is never scored; a genuine wrong answer is saved immediately.
const invalid = boot(); invalid.mode('guided');
for (const text of ['', '-1', '1.2', '1e2', 'abc']) {
  invalid.submit(text);
  assert.equal(active(invalid).answers.length, 0); assert.equal(active(invalid).wrong, 0);
  assert(invalid.view.querySelectorAll('[role="alert"]').length);
}
assert.equal(invalid.mistakes.length, 0);
invalid.submit('2'); assert.equal(active(invalid).wrong, 1);
assert.equal(invalid.mistakes.length, 1); assert.equal(invalid.mistakes[0].phase, 'divide');
invalid.submit('1'); assert.equal(currentEngine(invalid).phase, 'multiply');
invalid.button('Undo last step').fire('click'); assert.equal(currentEngine(invalid).phase, 'divide');
assert.equal(active(invalid).wrong, 1);

// Typing is not submission; Enter submits once and ignores a held key or composition.
const keyboard = boot(); keyboard.mode('guided');
assert.equal(keyboard.view.querySelector('#dp-check').getAttribute('type'), 'button');
keyboard.input('1'); assert.equal(currentEngine(keyboard).phase, 'divide');
const entered = keyboard.view.querySelector('#dp-answer').fire('keydown', { key: 'Enter', repeat: false, isComposing: false });
assert.equal(entered.defaultPrevented, true); assert.equal(currentEngine(keyboard).phase, 'multiply');
keyboard.input('3');
keyboard.view.querySelector('#dp-answer').fire('keydown', { key: 'Enter', repeat: true, isComposing: false });
assert.equal(currentEngine(keyboard).phase, 'multiply');
keyboard.view.querySelector('#dp-answer').fire('keydown', { key: 'Enter', repeat: false, isComposing: true });
assert.equal(currentEngine(keyboard).phase, 'multiply');
keyboard.view.querySelector('#dp-answer').fire('keydown', { key: 'Enter', repeat: false, isComposing: false });
assert.equal(currentEngine(keyboard).phase, 'subtract');
finishWork(keyboard); assertCompleted(keyboard);
assert.equal(keyboard.completions.length, 1);
assert(keyboard.view.textContent.includes('Completed with coaching'));
assert.equal(keyboard.state().records.together.verifiedValue, null, 'No fabricated multiplication verification');

const helped = boot(); helped.mode('guided');
helped.button('Hint').fire('click'); assert.equal(active(helped).helpDepth, 1); assert.equal(active(helped).draft, '');
helped.button('More help').fire('click'); assert.equal(active(helped).helpDepth, 2); assert.equal(active(helped).draft, '');
helped.button('Show this step').fire('click'); assert.equal(active(helped).helpDepth, 3); assert.equal(active(helped).draft, '1');
helped.submit(); assert.equal(active(helped).helpDepth, 0);
helped.button('Undo last step').fire('click'); assert.equal(active(helped).divisionHelpUsed, true);
finishWork(helped); assertCompleted(helped);
assert.equal(helped.state().records.together.divisionHelpUsed, true);

// Proof is optional and cannot become an answer, a mistake or a division hint.
const proof = boot(); proof.mode('guided'); finishWork(proof);
assert.equal(proof.timers.size, 1);
const staleProofCallback = [...proof.timers.values()][0].fn, beforeProof = copy(proof.state());
const mistakesBefore = proof.mistakes.length, completionsBefore = proof.completions.length;
proof.button('Why does my answer fit?').fire('click');
assert.equal(active(proof).explanationViewed, true); assert.equal(active(proof).explanationOpen, true);
assert.equal(active(proof).divisionHelpUsed, false); assert.equal(active(proof).usedHelp, false);
assert.equal(active(proof).wrong, beforeProof.guided.wrong);
assert.equal(proof.mistakes.length, mistakesBefore); assert.equal(proof.completions.length, completionsBefore);
assert.equal(proof.state().records.together.verifiedValue, null); assert.equal(proof.timers.size, 0);
const visualProof = proof.view.querySelector('[data-proof-total]'); assert(visualProof);
assert.equal(visualProof.getAttribute('data-proof-total'), '528');
assert.equal(visualProof.getAttribute('data-shared-total'), '528');
assert.equal(visualProof.getAttribute('data-remainder'), '0');
staleProofCallback(); proof.advance(5000); assert.equal(proof.state().mode, 'guided');
proof.button('Hide explanation').fire('click'); assert.equal(proof.timers.size, 0);
const retainedRecord = copy(proof.state().records.together);
proof.button('Try this one again').fire('click');
assert.equal(active(proof).answers.length, 0); assert.equal(active(proof).checked, false);
assert.deepEqual(proof.state().records.together, retainedRecord, 'Retry retains earlier completion history');

// Drafts, hint depth and mistakes survive an explicit host load with no write or award.
const draft = boot(); draft.mode('guided'); draft.submit('2'); draft.button('Hint').fire('click'); draft.input('7');
const draftSnapshot = copy(draft.state()), draftRestored = boot(draftSnapshot);
assert.equal(draftRestored.saves.length, 0); assert.equal(draftRestored.completions.length, 0); assert.equal(draftRestored.mistakes.length, 0);
assert.deepEqual(draftRestored.state(), draftSnapshot);
assert.equal(draftRestored.view.querySelector('#dp-answer').value, '7'); assert.equal(active(draftRestored).helpDepth, 1);
draftRestored.journey.load(draftSnapshot);
assert.equal(draftRestored.saves.length, 0); assert.deepEqual(draftRestored.state(), draftSnapshot);

const guided = boot(); guided.mode('guided'); finishWork(guided); assertCompleted(guided);
const completedSnapshot = copy(guided.state()), restored = boot(completedSnapshot);
assert.equal(restored.saves.length, 0); assert.equal(restored.completions.length, 0);
assert.equal(restored.timers.size, 0, 'Restoring completed work stays paused');
restored.advance(5000); assert.equal(restored.state().mode, 'guided');
guided.advance(1999); assert.equal(guided.state().mode, 'guided');
guided.advance(1); assert.equal(guided.state().mode, 'solo'); assert.equal(active(guided).id, 'solo1');

// Older work blocked on the removed multiplication gate becomes completed in memory.
const legacy = copy(completedSnapshot), legacyP = legacy.guided;
legacyP.checked = false; legacyP.verifiedValue = null; legacyP.verifyDraft = '527'; legacyP.usedHelp = true; legacyP.wrong = 7;
delete legacyP.divisionHelpUsed; delete legacyP.explanationViewed; delete legacyP.explanationOpen; delete legacy.records.together;
const migrated = boot(legacy);
assert.equal(migrated.saves.length, 0); assert.equal(migrated.completions.length, 0); assert.equal(migrated.timers.size, 0);
assertCompleted(migrated);
assert.deepEqual(active(migrated).answers, legacyP.answers); assert.equal(active(migrated).wrong, 7);
assert.equal(active(migrated).divisionHelpUsed, null); assert.equal(active(migrated).verifiedValue, null);
assert.equal(migrated.state().records.together.divisionHelpUsed, null);
const legacyVerified = copy(completedSnapshot);
legacyVerified.guided.verifiedValue = 528; legacyVerified.records.together.verifiedValue = 528;
assert.equal(active(boot(legacyVerified)).verifiedValue, 528, 'Real legacy verification remains real');

const stay = boot(); stay.mode('guided'); finishWork(stay);
stay.button('Stay & read').fire('click'); stay.advance(4000); assert.equal(stay.state().mode, 'guided'); assert.equal(stay.timers.size, 0);
stay.button('Next problem →').fire('click'); assert.equal(active(stay).id, 'solo1');
const hidden = boot(); hidden.mode('guided'); finishWork(hidden); hidden.hide(); hidden.advance(3000); hidden.show();
assert.equal(hidden.state().mode, 'guided'); assert.equal(hidden.timers.size, 0);
for (const action of ['suspend', 'goHome', 'load', 'destroy']) {
  const env = boot(); env.mode('guided'); finishWork(env);
  const stale = [...env.timers.values()][0].fn, before = env.saves.length;
  action === 'load' ? env.journey.load(copy(env.state())) : env.journey[action]();
  const after = env.saves.length;
  stale(); env.advance(5000);
  assert.equal(env.saves.length, after, action + ' fences stale callbacks');
  assert.equal(env.completions.length, 1, action + ' cannot award twice');
  if (action === 'suspend' || action === 'load' || action === 'destroy') assert.equal(after, before, action + ' is read-only');
}

// A completed three-equation round offers internal-zero, remainder and targeted replay.
const solo = boot(); solo.mode('solo');
for (let i = 0; i < 3; i++) {
  assert.equal(active(solo).id, 'solo' + (i + 1)); finishWork(solo); assertCompleted(solo);
  assert.equal(solo.state().records['solo' + (i + 1)].verifiedValue, null);
  if (i < 2) solo.advance(2000);
}
assert.equal(solo.timers.size, 0);
solo.button('See my round →').fire('click'); solo.button('Try a zero in the answer').fire('click');
finishWork(solo); assertCompleted(solo); assert.equal(currentEngine(solo).quotient, 201);
solo.button('See my round →').fire('click'); solo.button('Try a remainder').fire('click');
solo.submit('2'); finishWork(solo); assertCompleted(solo); assert.equal(currentEngine(solo).remainder, 1);
solo.button('Why does my answer fit?').fire('click');
const remainderProof = solo.view.querySelector('[data-proof-total]');
assert.equal(remainderProof.getAttribute('data-proof-total'), '553');
assert.equal(remainderProof.getAttribute('data-shared-total'), '552');
assert.equal(remainderProof.getAttribute('data-remainder'), '1');
solo.button('See my round →').fire('click'); solo.button('Practise a tricky problem (1)').fire('click');
assert.equal(active(solo).id, 'remainder'); assert.equal(active(solo).answers.length, 0);

const bad = copy(completedSnapshot); bad.guided.answers = [9];
const sanitized = boot(bad); assert(sanitized.view.querySelector('#dp-answer')); assert.equal(active(sanitized).checked, false);
const failed = boot(); failed.failStorage(); failed.mode('guided'); failed.input('7');
assert(failed.root.textContent.includes('Could not'), 'Host storage failure has an accurate visible status');
const advancedTricky = boot(undefined, { mountOptions: { getWrongs: () => [{ questionShape: { dividend: 936, divisor: 12 } }] } });
advancedTricky.button('Tricky practice (1)').fire('click');
assert.deepEqual(advancedTricky.external, ['tricky'], 'Saved advanced questions open their real classic replay queue');
console.log('Learning journey: completion, optional proof, hints, Enter, drafts, legacy saves, zero/remainder and timer fences passed.');
