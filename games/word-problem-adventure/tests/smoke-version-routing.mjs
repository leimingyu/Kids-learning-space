/** Verify shared-version routing using the real legacy checkpoint and bridge code.
 * These VM profiles never touch browser profiles, localStorage, or disk backups.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = source.indexOf('  window.__wpa_captureState = function');
const end = source.indexOf('  // Hook the Continue button', start);
assert.ok(start >= 0 && end > start, 'real legacy checkpoint helpers exist');
const checkpoints = source.slice(start, end);
const bridgeScript = [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('onHubMessage("requestState"'));
assert.ok(bridgeScript, 'real inline bridge registration exists');
const plain = value => JSON.parse(JSON.stringify(value));

function harness() {
  const nodes = new Map(), callbacks = new Map(), saves = [];
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { id, value: '', textContent: '', hidden: true, style: {} });
    return nodes.get(id);
  }
  const context = vm.createContext({
    console, nodes, callbacks, saves,
    document: { getElementById: node, querySelectorAll: () => [] },
    KLS: { bridge: {
      onHubMessage(name, callback) { callbacks.set(name, callback); },
      saveState(blob, result) { saves.push({ blob: blob === null ? null : plain(blob), result }); },
      clearState() { context.clears += 1; },
    } },
    clears: 0, flushes: 0, flushFailure: false, restores: 0,
  });
  context.window = context;
  const run = code => vm.runInContext(code, context);
  run(`
    var selectedLevel='medium',selectedSessionLabel='Hidden amounts',selectedSessionWasFull=false;
    var sessionQueue=[{id:'q1'},{id:'q2',sessionLevel:'hard'}],questionIndex=1,questionsCompleted=1,
      firstTryCorrect=0,correctCount=1,attemptedCount=3,streak=0,sessionBestStreak=1,
      wrongSubmitsOnQuestion=2,hintUsedOnQuestion=true,answerState='explain',pictureVisible=true,
      levelStats={medium:{attempted:1,correct:1}},typeCorrect={Unknown:1};
    var isPracticeMode=false,isDailyChallenge=true,practiceType=null,practiceMode=null,
      practiceInitialWrongs=0,dailyPracticeOnly=true,activeLesson=null;
    var bank={q1:{id:'q1',answer:4},q2:{id:'q2',answer:7}},screen='screen-game';
    function findActiveScreenId(){return screen;}
    function showScreen(name){screen=name;}
    function getQuestionById(id){return bank[id];}
    function lessonById(id){return {id};}
    function leavePracticeMode(){isPracticeMode=false;}
    function leaveDailyMode(){isDailyChallenge=false;}
    function currentQuestion(){return sessionQueue[questionIndex];}
    function renderQuestion(){restores+=1;}
    function showFeedbackExplain(){answerState='explain';}
    function showFeedbackHint(){answerState='hint';}
    function showFeedbackCorrect(){answerState='correct';}
    function clearAdvanceTimer(){}
    function togglePicture(){pictureVisible=!pictureVisible;}
    function retryGameStorage(){flushes+=1;if(flushFailure)throw new Error('quota');}
    function __wpa_goHome(){showScreen('screen-welcome');}
  ` + checkpoints);
  node('answer-input').value = '6';
  return { context, run, node, callbacks, saves };
}

{
  const h = harness();
  const saved = plain(h.run('__wpa_captureState()'));
  h.context.saved = saved;
  h.run("screen='screen-welcome';questionIndex=0;__wpa_restoreState(saved)");
  assert.equal(h.run('screen'), 'screen-welcome', 'old checkpoint offers Continue without opening the old layout');
  assert.equal(h.run('questionIndex'), 0, 'staging never starts the old question');
  assert.equal(h.node('welcome-resume-row').hidden, false);
  assert.deepEqual(plain(h.run('__wpa_getPendingResume()')), saved, 'opaque v2 checkpoint retained');
  const isolated = h.run('__wpa_getPendingResume()');
  isolated.queue[0].id = 'changed-by-caller';
  assert.equal(h.run('__wpa_getPendingResume().queue[0].id'), 'q1', 'returned checkpoint is a copy');
  h.run('__wpa_setPendingResume(saved)');
  saved.queue[0].id = 'changed-input';
  assert.equal(h.run('__wpa_getPendingResume().queue[0].id'), 'q1', 'profile staging copies the input');

  const nextProfile = { v: 1, screen: 'screen-daily', mode: 'daily', marker: 'Dad' };
  h.context.nextProfile = nextProfile;
  h.run('__wpa_setPendingResume(nextProfile)');
  assert.deepEqual(plain(h.run('__wpa_getPendingResume()')), nextProfile, 'binding a different account replaces the old offer');
  assert.equal(h.run('screen'), 'screen-welcome');
  h.run('__wpa_setPendingResume(null)');
  assert.equal(h.run('__wpa_getPendingResume()'), null, 'empty account has no prior-account checkpoint');
  assert.equal(h.node('welcome-resume-row').hidden, true);
  assert.equal(h.run('clears'), 0, 'clearing runtime staging does not wipe saved profile progress');
  h.run("__wpa_setPendingResume({v:2,mode:'grade-adventure',session:{ids:['grade4-01']}})");
  assert.equal(h.run('__wpa_getPendingResume()'), null, 'grade checkpoints cannot be mistaken for earlier-engine checkpoints');
  h.run("__wpa_setPendingResume({v:99,mode:'journey'})");
  assert.equal(h.run('__wpa_getPendingResume()'), null, 'unsupported checkpoint versions are not staged');

  h.context.saved = { ...saved, queue: [{ id: 'q1' }, { id: 'q2', sessionLevel: 'hard' }] };
  h.run('__wpa_setPendingResume(saved);__wpa_continueSaved()');
  assert.equal(h.run('screen'), 'screen-game', 'old game opens only after explicit Continue');
  assert.equal(h.run('questionIndex'), 1);
  assert.equal(h.run('currentQuestion().id'), 'q2');
  assert.equal(h.node('answer-input').value, '6');
  assert.equal(h.run('wrongSubmitsOnQuestion'), 2);
  assert.equal(h.run('__wpa_getPendingResume()'), null, 'Continue consumes its checkpoint');
  h.run('__wpa_continueSaved()');
  assert.equal(h.run('restores'), 1, 'repeated Continue does not replay the old question');

  const gradeCheckpoint = { v: 2, mode: 'grade-adventure', grade: 4, session: { ids: ['grade4-01'] }, earlierAdventure: null };
  h.context.WPA_GradeAdventure = {
    clearEarlierResume() { h.context.earlierClears = (h.context.earlierClears || 0) + 1; },
    capture() { return gradeCheckpoint; },
  };
  h.run('__wpa_setPendingResume(saved);clearPendingResume()');
  assert.equal(h.run('earlierClears'), 1, 'fresh earlier entry clears the combined earlier offer');
  assert.equal(h.run('__wpa_getPendingResume()'), null);
  assert.equal(h.run('clears'), 0, 'fresh earlier entry preserves the combined grade checkpoint');
  assert.deepEqual(h.saves.at(-1).blob, gradeCheckpoint);
  h.run('__wpa_setPendingResume(saved);__wpa_resetForProfile()');
  assert.equal(h.run('__wpa_getPendingResume()'), null, 'profile reset clears an old account offer');
  assert.equal(h.run('screen'), 'screen-welcome');
  assert.deepEqual(plain(h.run('sessionQueue')), [], 'profile reset clears the old account question queue');
  assert.equal(h.run('questionIndex'), 0);
  assert.equal(h.run('isDailyChallenge'), false);
  assert.equal(h.run('isPracticeMode'), false);
  assert.equal(h.run('clears'), 0, 'profile runtime reset does not wipe stored progress');
}

{
  const h = harness(), combined = {
    v: 2, mode: 'grade-adventure', grade: 3, session: { grade: 3, ids: ['g3-q1'], index: 0 },
    earlierAdventure: { v: 2, screen: 'screen-game', mode: 'journey', queue: [{ id: 'q1' }], draft: '4' },
  };
  let isActive = true, gradeCaptures = 0;
  h.context.WPA_GradeAdventure = {
    active: () => isActive,
    capture() { gradeCaptures += 1; return combined; },
  };
  h.run(bridgeScript);
  const resume = h.callbacks.get('resumeState'), request = h.callbacks.get('requestState');
  assert.equal(typeof resume, 'function');
  assert.equal(typeof request, 'function');

  h.run("screen='screen-welcome'");
  resume({ state: combined });
  assert.deepEqual(plain(h.run('__wpa_getPendingResume()')), combined.earlierAdventure, 'combined save stages its earlier checkpoint');
  assert.equal(h.run('screen'), 'screen-welcome', 'combined restore does not force earlier layout');
  resume({ state: { v: 2, mode: 'grade-adventure', grade: 4, session: null } });
  assert.equal(h.run('screen'), 'screen-welcome', 'grade checkpoint without an earlier field never activates earlier layout');

  for (const v of [1, 2]) {
    h.run('__wpa_setPendingResume(null)');
    const old = { v, screen: 'screen-game', mode: 'journey', queue: [{ id: 'q1' }], draft: '4' };
    resume({ state: old });
    assert.deepEqual(plain(h.run('__wpa_getPendingResume()')), old, 'old v' + v + ' save stays compatible');
    assert.equal(h.run('screen'), 'screen-welcome');
  }

  request();
  assert.deepEqual(h.saves.at(-1).blob, combined, 'grade layout saves the combined checkpoint');
  isActive = false;
  request();
  assert.deepEqual(h.saves.at(-1).blob, combined, 'earlier layout also saves the combined checkpoint');
  assert.equal(gradeCaptures, 2);
  assert.equal(h.run('flushes'), 2, 'both layouts flush earlier storage before confirming save');

  h.context.flushFailure = true;
  request();
  assert.equal(h.saves.at(-1).blob, null);
  assert.equal(h.saves.at(-1).result.ok, false, 'failed earlier write prevents a success acknowledgement');
  assert.equal(h.saves.at(-1).result.error, 'quota');
  assert.equal(gradeCaptures, 2, 'failed flush stops capture');

  h.context.flushFailure = false;
  delete h.context.WPA_GradeAdventure;
  request();
  assert.equal(h.saves.at(-1).blob.v, 2);
  assert.notEqual(h.saves.at(-1).blob.mode, 'grade-adventure', 'standalone earlier-only compatibility remains');
}

console.log('Word Problem Adventure version routing: shared latest layout, preserved old checkpoints, profile isolation and combined save acknowledgements passed.');
