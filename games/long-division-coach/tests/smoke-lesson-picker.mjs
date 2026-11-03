/** Selectable lessons preserve their own watch and written-practice state. */
import assert from 'node:assert/strict';
import { boot, copy, active, currentEngine, finishWork, assertCompleted } from './learning-harness.mjs';

const lessons = {
  equal: { watched: [84, 4], similar: [96, 3] },
  exchange: { watched: [96, 4], similar: [84, 3] },
  regroup: { watched: [432, 3], similar: [528, 3] },
  zero: { watched: [804, 4], similar: [816, 4] },
  remainder: { watched: [553, 4], similar: [565, 4] }
};
const equation = pair => pair[0] + ' ÷ ' + pair[1];
function goToLesson(env, id) { env.mode('sharing'); env.selectLesson(id); }
function completeWatch(env) {
  const plan = env.context.window.DivisionSharingPlayer.createPlan(...lessons[env.state().selectedLesson].watched);
  let steps = 0;
  while (env.sharingPlayer.getStep() < plan.stages.length - 1) {
    env.button('Next step').fire('click'); assert(++steps < 12);
  }
}
function guided(env, id) { env.button('Solve ' + equation(lessons[id].watched) + ' with help →').fire('click'); }
function lessonCard(env, id) { return env.view.querySelectorAll('[data-lesson-id]').find(el => el.getAttribute('data-lesson-id') === id); }

const fresh = boot();
assert.equal(fresh.state().selectedLesson, 'equal');
assert.equal(fresh.saves.length, 0, 'Showing choices cannot overwrite progress');
fresh.mode('sharing');
assert.equal(fresh.view.querySelectorAll('[data-lesson]').length, 5);
assert.equal(fresh.view.querySelectorAll('[aria-pressed="true"]').length, 1);

for (const [id, lesson] of Object.entries(lessons)) {
  const env = boot(); goToLesson(env, id); completeWatch(env);
  assert.equal(env.state().lessonWatch[id].seen, true);
  assert.equal(env.completions.length, 0, 'Watching ' + id + ' cannot award solving credit');
  assert(!env.state().records['lesson-' + id + '-guided']);
  assert(!env.state().records['lesson-' + id + '-similar']);
  const settled = env.state().lessonWatch[id].step;
  const saved = copy(env.state()), reopened = boot(saved);
  assert.equal(reopened.saves.length, 0); assert.equal(reopened.completions.length, 0);
  assert.equal(reopened.state().lessonWatch[id].step, settled);
  assert.equal(reopened.state().lessonWatch[id].seen, true);
  assert.equal(reopened.timers.size, 0);

  guided(env, id);
  assert.deepEqual(env.state().lessonContext, { lessonId: id, kind: 'guided' });
  assert.equal(active(env).id, 'lesson-' + id + '-guided');
  assert.equal(currentEngine(env).dividend, lesson.watched[0]);
  assert.equal(currentEngine(env).divisor, lesson.watched[1]);
  finishWork(env); assertCompleted(env);
  assert.equal(env.completions.length, 1); assert.equal(env.completions[0].mode, 'guided');
  assert.equal(env.state().records['lesson-' + id + '-similar'], undefined, 'Coaching does not complete the independent transfer');
  const coachedRestore = boot(env.state());
  assert.equal(coachedRestore.saves.length, 0); assert.equal(coachedRestore.completions.length, 0);
  assert.equal(coachedRestore.timers.size, 0, 'A restored coached completion stays paused');
  coachedRestore.advance(5000); assert.equal(coachedRestore.state().lessonContext.kind, 'guided');
  assertCompleted(coachedRestore);
  const beforeProof = copy(active(env));
  env.button('Why does my answer fit?').fire('click');
  assert.equal(active(env).divisionHelpUsed, beforeProof.divisionHelpUsed);
  assert.equal(active(env).wrong, beforeProof.wrong); assert.equal(env.completions.length, 1);
  env.button('Try a similar problem →').fire('click');
  assert.deepEqual(env.state().lessonContext, { lessonId: id, kind: 'similar' });
  assert.equal(currentEngine(env).dividend, lesson.similar[0]);
  assert.equal(currentEngine(env).divisor, lesson.similar[1]);
  assert.notDeepEqual(lesson.similar, lesson.watched, 'A transfer problem uses a fresh equation');
  finishWork(env); assertCompleted(env);
  assert.equal(env.completions.length, 2); assert.equal(env.completions[1].mode, 'solo');
  assert.equal(env.completions[1].usedHelp, false);
  assert.equal(currentEngine(env).remainder, lesson.similar[0] % lesson.similar[1]);
  assert(env.state().records['lesson-' + id + '-similar']);
  assert.equal(env.timers.size, 0, 'Completing one transfer must not start an unrelated lesson');
  goToLesson(env, id);
  const card = lessonCard(env, id);
  assert(card); assert.equal(card.getAttribute('data-watched'), 'true'); assert.equal(card.getAttribute('data-solved'), 'true');
}

// Coaching moves to its own transfer after the celebration, unless paused.
const automatic = boot(); goToLesson(automatic, 'zero'); completeWatch(automatic); guided(automatic, 'zero');
finishWork(automatic); automatic.advance(1999);
assert.equal(automatic.state().lessonContext.kind, 'guided');
automatic.advance(1); assert.equal(automatic.state().lessonContext.kind, 'similar');
assert.equal(active(automatic).id, 'lesson-zero-similar');

// Each selected example retains settled watch position and its written drafts.
const drafts = boot(); goToLesson(drafts, 'equal'); drafts.button('Next step').fire('click');
const equalStep = drafts.state().lessonWatch.equal.step;
goToLesson(drafts, 'exchange'); drafts.button('Next step').fire('click'); drafts.button('Next step').fire('click');
const exchangeStep = drafts.state().lessonWatch.exchange.step;
goToLesson(drafts, 'equal'); assert.equal(drafts.sharingPlayer.getStep(), equalStep);
completeWatch(drafts); guided(drafts, 'equal'); drafts.input('2');
const equalDraft = copy(active(drafts));
goToLesson(drafts, 'exchange'); assert.equal(drafts.sharingPlayer.getStep(), exchangeStep);
completeWatch(drafts); guided(drafts, 'exchange'); drafts.submit('3'); drafts.button('Hint').fire('click'); drafts.input('2');
const exchangeDraft = copy(active(drafts));
goToLesson(drafts, 'equal'); guided(drafts, 'equal'); assert.deepEqual(active(drafts), equalDraft);
drafts.journey.goHome();
const retained = copy(drafts.state()), retainedBoot = boot(retained);
assert.equal(retainedBoot.saves.length, 0); assert.equal(retainedBoot.completions.length, 0);
goToLesson(retainedBoot, 'exchange'); guided(retainedBoot, 'exchange');
assert.deepEqual(active(retainedBoot), exchangeDraft, 'Hints, mistakes and drafts survive another lesson and a reload');

// The top navigation stays in the selected lesson, even from its transfer or
// independent retry. Returning to either workspace retains its own draft.
const navigation = boot(); goToLesson(navigation, 'zero'); completeWatch(navigation); guided(navigation, 'zero');
navigation.input('2'); const coachedZeroDraft = copy(active(navigation));
navigation.mode('solo'); navigation.input('7'); const similarZeroDraft = copy(active(navigation));
assert.equal(currentEngine(navigation).dividend, 816);
navigation.mode('guided');
assert.deepEqual(navigation.state().lessonContext, { lessonId: 'zero', kind: 'guided' });
assert.equal(currentEngine(navigation).dividend, 804); assert.deepEqual(active(navigation), coachedZeroDraft);
navigation.mode('solo');
assert.deepEqual(navigation.state().lessonContext, { lessonId: 'zero', kind: 'similar' });
assert.equal(currentEngine(navigation).dividend, 816); assert.deepEqual(active(navigation), similarZeroDraft);
goToLesson(navigation, 'zero'); navigation.mode('solo');
assert.equal(currentEngine(navigation).dividend, 816); assert.deepEqual(active(navigation), similarZeroDraft, 'Watch → Try solo uses the selected lesson');
navigation.mode('guided'); assert.equal(currentEngine(navigation).dividend, 804); assert.deepEqual(active(navigation), coachedZeroDraft);
navigation.mode('solo'); assert.deepEqual(active(navigation), similarZeroDraft);
const retryNavigation = boot(undefined, { mountOptions: { getWrongs: () => [{ questionShape: { dividend: 84, divisor: 4 } }] } });
retryNavigation.button('Tricky practice (1)').fire('click');
assert.deepEqual(retryNavigation.state().lessonContext, { lessonId: 'equal', kind: 'retry' });
retryNavigation.input('2'); const retryEqualDraft = copy(active(retryNavigation));
retryNavigation.mode('guided');
assert.deepEqual(retryNavigation.state().lessonContext, { lessonId: 'equal', kind: 'guided' });
assert.equal(currentEngine(retryNavigation).dividend, 84);
assert.deepEqual(retryNavigation.state().lessonWork['lesson-equal-retry'], retryEqualDraft);

// Old saved watch state describes only the old 432/3 demonstration. Existing
// written work stays intact; migration is read-only and creates no awards.
const old = boot(); old.mode('guided'); old.submit('1'); old.input('3');
const legacy = old.state();
for (const key of ['selectedLesson', 'lessonWatch', 'lessonWork', 'lessonContext']) delete legacy[key];
legacy.mode = 'sharing'; legacy.shareStep = 3; legacy.shareSeen = true;
const migrated = boot(legacy);
assert.equal(migrated.state().selectedLesson, 'regroup');
assert.equal(migrated.state().lessonWatch.regroup.step, 3); assert.equal(migrated.state().lessonWatch.regroup.seen, true);
for (const id of ['equal', 'exchange', 'zero', 'remainder']) assert.equal(migrated.state().lessonWatch[id].seen, false);
assert.deepEqual(migrated.state().guided, legacy.guided);
assert.equal(migrated.saves.length, 0); assert.equal(migrated.completions.length, 0);

const corrupt = copy(retained);
corrupt.lessonWork['lesson-equal-guided'].answers = [9];
corrupt.lessonWork['lesson-equal-guided'].checked = true;
corrupt.records['lesson-equal-guided'] = copy(corrupt.lessonWork['lesson-equal-guided']);
corrupt.lessonWatch.equal.step = 999;
const sanitized = boot(corrupt);
assert.deepEqual(sanitized.state().lessonWork['lesson-equal-guided'].answers, []);
assert.equal(sanitized.state().lessonWork['lesson-equal-guided'].checked, false);
assert.equal(sanitized.state().records['lesson-equal-guided'], undefined, 'Invalid answer history cannot fabricate solved status');
assert.equal(sanitized.state().lessonWatch.equal.step, 0);
assert.equal(sanitized.saves.length, 0); assert.equal(sanitized.completions.length, 0);

// Selecting a new example invalidates in-flight work before it can commit.
const moving = boot(undefined, { realSharing: true, reducedMotion: false }); goToLesson(moving, 'equal');
moving.button('Next step').fire('click');
assert.equal(moving.view.querySelector('#dp-sharing-mount').getAttribute('aria-busy'), 'true');
const stale = [...moving.frames.values()], before = copy(moving.state().lessonWatch.equal);
moving.selectLesson('remainder'); const savedCount = moving.saves.length;
moving.flushFrames(); // The new lesson may schedule a read-only picker layout.
assert.equal(moving.frames.size, 0);
stale.forEach(fn => fn(10000)); await Promise.resolve(); await Promise.resolve();
assert.equal(moving.state().selectedLesson, 'remainder');
assert.deepEqual(moving.state().lessonWatch.equal, before, 'Switching retains only a settled stage');
assert.equal(moving.saves.length, savedCount, 'A stale animation cannot write the newly selected lesson');
assert.equal(moving.completions.length, 0);

// A fifth-card checkpoint can mount while its host is hidden. Its single
// layout frame brings the selected card into view after the host is visible,
// without moving the document, changing progress or emitting completion.
const phoneSeed = boot(); goToLesson(phoneSeed, 'remainder');
let shown = false;
const phone = boot(phoneSeed.state(), { layoutFor: el => {
  if (el.classList.contains('dp-lesson-grid')) return { clientWidth: shown ? 280 : 0, scrollWidth: 1480, left: 20, right: 300, x: 20, y: 0, width: shown ? 280 : 0, height: 200 };
  if (el.classList.contains('dp-lesson-card')) {
    const ids = Object.keys(lessons), index = ids.indexOf(el.getAttribute('data-lesson-id'));
    const left = 20 + index * 300 - (el.parentNode?.scrollLeft || 0);
    return { left, right: left + 280, x: left, y: 0, width: 280, height: 200 };
  }
  return null;
} });
let strip = phone.view.querySelector('.dp-lesson-grid'); assert.equal(strip.scrollLeft, 0);
shown = true; phone.flushFrames();
let selected = lessonCard(phone, 'remainder').getBoundingClientRect(), stripBounds = strip.getBoundingClientRect();
assert(selected.left >= stripBounds.left && selected.right <= stripBounds.right, 'The selected fifth card becomes visible');
assert.equal(phone.saves.length, 0); assert.equal(phone.completions.length, 0);
const retainedScroll = strip.scrollLeft;
phone.journey.suspend(); phone.journey.resume(); phone.flushFrames();
strip = phone.view.querySelector('.dp-lesson-grid'); assert.equal(strip.scrollLeft, retainedScroll, 'Rebuilding retains the mobile strip position');
assert.equal(phone.saves.length, 0); assert.equal(phone.completions.length, 0);
console.log('Lesson picker: five choices, matched practice, transfer, independent drafts, legacy watch migration and animation fences passed.');
