/** Exercise the real checkpoint/storage functions in isolated VM contexts.
 * Rendering and timers are fakes; real browser profiles and disk saves are untouched.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const base = new URL('../', import.meta.url);
const sources = Object.fromEntries(['cosmic-math-quest/index.html','lets-learn-fractions/index.html',
  'long-division-coach/script.js','word-problem-adventure/index.html'].map(f => [f, readFileSync(new URL(f,base),'utf8')]));
for (const [file,src] of Object.entries(sources)) {
  if (file.endsWith('.js')) new vm.Script(src, { filename:file });
  else for (const match of src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], { filename:file });
}
function fn(src, name, indent = 2) {
  const match = src.match(new RegExp('^' + ' '.repeat(indent) + 'function ' + name + '\\([^\\n]*\\)\\s*\\{[\\s\\S]*?^' + ' '.repeat(indent) + '\\}', 'm'));
  assert.ok(match, 'real function exists: ' + name); return match[0];
}
function assignment(src, name) {
  const start = src.indexOf('window.' + name + ' = function');
  assert.ok(start >= 0, name);
  const end = src.indexOf('\n  };', start);
  return src.slice(start, end + '\n  };'.length);
}
function makeVM() {
  const nodes = new Map(), events = new Map(), storage = new Map(), errors = new Map();
  let fail = false, guard = false;
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { id, textContent:'', value:'', className:'', hidden:true, disabled:false, style:{},
        classList:{ add:x=>classes.add(x), remove:x=>classes.delete(x), contains:x=>classes.has(x), toggle:(x,on)=>on ? classes.add(x):classes.delete(x) },
        addEventListener:(name, handler)=>events.set(id+':'+name,handler), focus(){}, setAttribute(){},
        querySelectorAll:()=>[], appendChild(){}, innerHTML:'' });
    }
    return nodes.get(id);
  }
  const context = vm.createContext({ console, structuredClone, performance:{ now:()=>10000 },
    document:{ getElementById:node, querySelector:()=>({id:'screen-game'}), querySelectorAll:()=>[] },
    localStorage:{ setItem(k,v){ if(fail)throw new Error('quota');storage.set(k,String(v));}, getItem:k=>storage.get(k)||null },
    setInterval:()=>123, clearInterval(){}, setTimeout:()=>456, clearTimeout(){},
    KLS:{ bridge:{ assertCanWrite(){if(guard)throw new Error('restore pending');},
      reportStorageError:(e,k)=>errors.set(k,e.message),clearStorageError:k=>errors.delete(k),isEmbedded:()=>false } },
    nodes, Map, Set, events });
  context.window = context; context.parent = context;
  const run = code => vm.runInContext(code,context);
  return { context, run, node, events, storage, errors, fail:on=>{fail=on;}, guard:on=>{guard=on;} };
}
const plain = value => JSON.parse(JSON.stringify(value));

// Every game must retry the exact unsaved value, and a successful different key
// must not clear a failed mistake write. Recovery guards prevent any disk mutation.
for (const [file,src] of Object.entries(sources)) {
  const h=makeVM(), indent=file.startsWith('lets-')?4:2;
  h.run('var pendingWrites = new Map();\n' + fn(src,'writeGameStorage',indent) + '\n' + fn(src,'retryGameStorage',indent));
  h.fail(true); h.run("writeGameStorage('main__alice',{score:7});writeGameStorage('wrongs__alice',{records:[1]});");
  assert.equal(h.errors.size,2,file+' reports failures');
  h.fail(false); h.run("writeGameStorage('main__alice',{score:8});");
  assert.ok(h.errors.has('wrongs__alice'),file+' preserves independent error');
  h.run('retryGameStorage()');
  assert.equal(h.errors.size,0,file+' retries clear errors');
  assert.equal(JSON.parse(h.storage.get('main__alice')).score,8);
  assert.deepEqual(JSON.parse(h.storage.get('wrongs__alice')).records,[1]);
  h.guard(true); h.run("writeGameStorage('main__alice',{score:99})");
  assert.equal(JSON.parse(h.storage.get('main__alice')).score,8,file+' blocked restore write');
}

{
  const src=sources['cosmic-math-quest/index.html'], h=makeVM();
  h.run(`var progress={grade:4}; var sessionAskedKeys=new Set(['q1','q2']);
    var GameState={grade:4,playMode:'boss',score:30,questionIndex:2,roundQuestions:[{key:'q1'},{key:'q2'},{key:'q3'}],
      currentQuestion:{key:'q3',prompt:'36 ÷ 4 = ?',answer:9},answered:true,bossHp:6,hearts:2,
      adaptiveTier:1,recentAnswerHistory:[true,true],isReviewMode:false,isGameOver:false,
      lightningTimerId:99,lightningSecondsLeft:17,soundOn:false,reviewQueue:[],pendingReviewAdvance:false};
    var lastRenderedQuestion=GameState.currentQuestion; var __cmq_pendingResume=null;
    var screen='screen-game'; document.querySelector=()=>({id:screen});
    function renderQuestion(){GameState.answered=false;}
    function clearLightningTimer(){GameState.lightningTimerId=null;}
    function showScreen(name){screen='screen-'+name;}
    function setAnswerControlsEnabled(on){nodes.get('answer-input').disabled=!on;}
    function __cmq_showResumeRow(){}; function updateResultsExportButtons(){}; function renderProgressScreen(){};
    function setReviewBannerVisible(){};function setGameTitle(){}; function updateBossHpUI(){};
    function updateLightningTimerUI(){}; function setGameOverModalOpen(){}; function updateGameOverPracticeUi(){};
    function startLightningTimer(n){GameState.lightningSecondsLeft=n;GameState.lightningTimerId=123;}
    function renderGradeUi(){}; function isGradeSet(){return true;}
    ` + assignment(src,'__cmq_captureState') + '\n' + fn(src,'__cmq_doRestoreFromBlob') + '\n' + assignment(src,'__cmq_restoreState'));
  h.node('answer-input').value='9';h.node('answer-input-r').value='';h.node('feedback').textContent='Nice work!';
  h.node('feedback').className='feedback success';
  const saved=plain(h.run('__cmq_captureState()'));
  assert.equal(saved.session.lightningTimerId,undefined);assert.equal(saved.session.soundOn,undefined);
  h.context.saved=saved;
  h.run("GameState.score=0; GameState.answered=false; GameState.soundOn=true; __cmq_restoreState(saved); __cmq_restoreState(saved)");
  assert.equal(h.run('GameState.score'),0,'resume pushes do not start play');
  h.run("screen='screen-menu'");assert.deepEqual(plain(h.run('__cmq_captureState()')),saved,'Save before Continue keeps prior round');
  h.run('__cmq_doRestoreFromBlob(__cmq_pendingResume)');
  assert.equal(h.run('GameState.score'),30);assert.equal(h.run('GameState.bossHp'),6);
  assert.equal(h.run('GameState.answered'),true,'cannot score same answered question again');
  assert.equal(h.run('GameState.soundOn'),true,'device sound stays unchanged');
  assert.equal(h.node('answer-input').disabled,true);assert.equal(h.node('btn-next').hidden,false);
  assert.deepEqual(plain(h.run('GameState.roundQuestions')),saved.session.roundQuestions);
  // Lightning resumes remaining time, rather than granting a new full timer.
  saved.session.playMode='lightning';saved.session.answered=false;
  h.run('__cmq_doRestoreFromBlob(saved)');assert.equal(h.run('GameState.lightningSecondsLeft'),17);
  // A review success may have removed the displayed question and advanced the pointer.
  saved.session.isReviewMode=true;saved.session.answered=true;saved.session.pendingReviewAdvance=true;
  saved.displayedQuestion={key:'review-old',prompt:'7 × 8 = ?',answer:56};
  h.run('__cmq_doRestoreFromBlob(saved)');assert.equal(h.run('GameState.currentQuestion.key'),'q3');
  assert.equal(h.run('GameState.pendingReviewAdvance'),true);
}

{
  const src=sources['lets-learn-fractions/index.html'],h=makeVM();
  h.node('answer-input'); h.run(`var currentLevel='hard',sessionSize=10,currentQ={type:'spot',key:'spot 3/8',n:3,d:8,
    choices:[{n:2,d:8},{n:3,d:8},{n:4,d:8}],correctIndex:1,text:'What fraction is shaded?'};
    var isTrickyPractice=true,idx=3,answered=4,correct=3,wrong=1,streak=2,bestStreak=3,nextCelebrateAt=5;
    var heat=3,heatProgress=2,startHeat=1,selectedLen=10,selectedOven='hot',trickyQueueIdx=2,recentKeys=['old'];
    var qStartTime=8000,lastAnswerResult={correct:false,answer:'2/8'},locked=false,screen='gameScreen';
    var answerInput=document.getElementById('answer-input'),submitBtn=document.getElementById('submitBtn');
    var modalOverlay=document.getElementById('modalOverlay'),__llf_pendingResume=null;
    function findActiveScreen(){return screen;};function clearAutoAdvance(){};function hideResultChip(){};
    function updateScoreboard(){};function updateHeatUI(){};function updateLevelUI(){};
    function updateQuestionUI(){qStartTime=performance.now();};function showScreen(n){screen=n+'Screen';}
    function showResultChip(q){window.result=q.key;};function showWrongFeedback(q,a){window.feedback=[q.key,a];};
    function lockAnswerInputs(){answerInput.disabled=true;}; function showSummary(){showScreen('summary');}
    function showResumeButton(){};` + fn(src,'cloneQuestion',4) + '\n' + fn(src,'captureState',6) + '\n' + fn(src,'doRestoreFromBlob',6) + '\n' + fn(src,'restoreState',6));
  h.node('answer-input').value='2/8';const saved=plain(h.run('captureState()'));h.context.saved=saved;
  h.run('correct=0;idx=0;restoreState(saved);restoreState(saved)');assert.equal(h.run('correct'),0,'stash only');
  h.run("screen='homeScreen'");assert.deepEqual(plain(h.run('captureState()')),saved,'Save before Continue keeps prior pizza');
  h.run('doRestoreFromBlob(__llf_pendingResume)');
  assert.equal(h.run('idx'),3);assert.equal(h.run('correct'),3);assert.equal(h.run('heat'),3);
  assert.equal(h.run('trickyQueueIdx'),2);assert.equal(h.run('currentQ.correctIndex'),1);
  assert.deepEqual(plain(h.run('feedback')),['spot 3/8','2/8']);assert.equal(h.node('answer-input').disabled,true);
  assert.equal(h.run('qStartTime'),8000,'speed grading carries elapsed time');
  assert.equal(h.run("cloneQuestion({type:'compare',a:{n:3,d:4},b:{n:1,d:2}}).biggerSide"),'a','legacy practice shape repaired');
}

{
  const src=sources['word-problem-adventure/index.html'],h=makeVM();
  h.run(`var selectedLevel='medium',selectedSessionLabel='Hidden amounts',selectedSessionWasFull=false;
    var sessionQueue=[{id:'q1'},{id:'q2',sessionLevel:'hard'}],questionIndex=1,questionsCompleted=1,firstTryCorrect=0,
      correctCount=1,attemptedCount=3,streak=0,sessionBestStreak=1,wrongSubmitsOnQuestion=2,hintUsedOnQuestion=true,
      answerState='explain',pictureVisible=true,levelStats={medium:{attempted:1,correct:1}},typeCorrect={Unknown:1};
    var isPracticeMode=false,isDailyChallenge=true,practiceType=null,practiceMode=null,practiceInitialWrongs=0,
      dailyPracticeOnly=true,activeLesson=null,__wpa_pendingResume=null;
    var bank={q1:{id:'q1',answer:4},q2:{id:'q2',answer:7}},screen='screen-game';
    function findActiveScreenId(){return screen;};function showScreen(n){screen=n;}
    function getQuestionById(id){return bank[id];};function lessonById(id){return {id};}
    function leavePracticeMode(){isPracticeMode=false;};function leaveDailyMode(){isDailyChallenge=false;}
    function currentQuestion(){return sessionQueue[questionIndex];};function renderQuestion(){};
    function showFeedbackExplain(){answerState='explain';};function showFeedbackHint(){answerState='hint';};
    function showFeedbackCorrect(){answerState='correct';};function clearAdvanceTimer(){};
    function togglePicture(){pictureVisible=!pictureVisible;}; function showWelcomeResumeButton(){};` + assignment(src,'__wpa_captureState') + '\n' + fn(src,'doRestoreFromBlob') + '\n' + assignment(src,'__wpa_restoreState'));
  h.node('answer-input').value='6';const saved=plain(h.run('__wpa_captureState()'));h.context.saved=saved;
  h.run("questionIndex=0;wrongSubmitsOnQuestion=0;hintUsedOnQuestion=false;__wpa_restoreState(saved);__wpa_restoreState(saved)");
  assert.equal(h.run('questionIndex'),0,'stash only');
  h.run("screen='screen-welcome'");assert.deepEqual(plain(h.run('__wpa_captureState()')),saved,'Save before Continue keeps prior stories');
  h.run('doRestoreFromBlob(__wpa_pendingResume)');
  assert.equal(h.run('questionIndex'),1);assert.equal(h.run('currentQuestion().id'),'q2');
  assert.equal(h.run('currentQuestion().sessionLevel'),'hard');assert.equal(h.run('wrongSubmitsOnQuestion'),2);
  assert.equal(h.run('hintUsedOnQuestion'),true);assert.equal(h.run('dailyPracticeOnly'),true);
  assert.equal(h.run('answerState'),'explain');assert.equal(h.run('pictureVisible'),true);
  assert.equal(h.node('answer-input').value,'6');assert.equal(h.run('questionsCompleted'),1);
}

{
  const src=sources['long-division-coach/script.js'],h=makeVM();
  h.run(`var topMode='game',activeExperience='classic',learningJourney=null;var app={mode:'guided',difficulty:'hard',problem:{dividend:936,divisor:8},
    engine:{phase:'subtract',rows:[{product:8}],quotientDigits:[1,null,null]},inputValue:'3',attemptsThisStep:2,
    attemptsThisProblem:3,hintsUsedThisProblem:1,revealUsedThisProblem:false,history:[{phase:'multiply',rows:[]}],
    sessionStats:{problemsDone:1,stepsCorrect:8,streak:2,stars:3},progress:{},
    mission:{currentIndex:1,problems:[{problem:{dividend:24,divisor:3}},{problem:{dividend:936,divisor:8}}],starsPerProblem:[3]},
    replayProblem:{dividend:936,divisor:8},replayingQuestionId:'8/936',feedback:{kind:'error',message:'Check the subtraction.'}};
    var dom={completionOverlay:document.getElementById('completionOverlay'),missionSummary:document.getElementById('missionSummary'),
      missionStart:document.getElementById('missionStart'),missionProgress:document.getElementById('missionProgress'),
      missionSummaryStars:document.getElementById('missionSummaryStars'),missionSummaryText:document.getElementById('missionSummaryText')};
    var _pendingResumeBlob=null;function cloneEngineState(e){return JSON.parse(JSON.stringify(e));}
    function hideCompletionOverlay(){dom.completionOverlay.hidden=true;};function setTopMode(n){topMode=n;}
    function setInputValue(v){app.inputValue=v;};function showMissionInProgress(){dom.missionProgress.hidden=false;}
    function renderMissionPanel(){};function render(){};function hideResumeOverlay(){};
    function cancelClassicTimers(){};function syncExperienceVisibility(){};function persistActiveSession(){};function saveProgress(){};
    ` + fn(src,'captureClassicSessionBlob') + '\n' + fn(src,'captureSessionBlob') + '\n' + fn(src,'showResumeChoice') + '\n' + fn(src,'onResumeContinue') + '\n' + fn(src,'restoreSessionBlob'));
  const saved=plain(h.run('captureSessionBlob()'));h.context.saved=saved;
  h.run('app.history=[];app.mission=null;app.attemptsThisStep=0;showResumeChoice(saved);showResumeChoice(saved)');
  assert.equal(h.run('app.mission'),null,'stash only');
  assert.deepEqual(plain(h.run('captureSessionBlob()')),saved,'Save before Continue keeps prior division');
  h.run('onResumeContinue()');
  assert.deepEqual(plain(h.run('app.mission')),saved.mission);assert.deepEqual(plain(h.run('app.history')),saved.history);
  assert.equal(h.run('app.attemptsThisStep'),2);assert.equal(h.run('app.replayingQuestionId'),'8/936');
  assert.equal(h.run('app.inputValue'),'3');assert.equal(h.run('app.engine.phase'),'subtract');
  assert.equal(h.run('app.feedback.message'),'Check the subtraction.');assert.equal(h.node('missionProgress').hidden,false);
}
console.log('Session checkpoints: all four real capture/restore flows, guarded writes, retry and scoring flags passed.');
