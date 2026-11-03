/** Complete-script regression checks: real bridge, engine, store, app, and backup.
 * Run: node games/logic-detectives/tests/smoke-game.mjs */
import assert from 'node:assert/strict';
import { harness, plain } from './harness.mjs';

const MAIN='logicDetectives_v1', WRONGS='logicDetectives_wrongs_v1';
const status=h=>plain(h.context.LogicDetectives.getStatus());
const main=(h,pid='profile-a')=>JSON.parse(h.data.get(MAIN+(pid?'__'+pid:''))||'null');
const wrongs=(h,pid='profile-a')=>JSON.parse(h.data.get(WRONGS+(pid?'__'+pid:''))||'{}');
const question=h=>h.context.LogicDetectivesEngine.puzzles.find(p=>p.id===status(h).currentQuestion);
const names={circle:'Circle',triangle:'Triangle',square:'Square',rectangle:'Rectangle',notch:'Notched flag',pennant:'Triangle flag',empty:'Empty',stripe:'Striped',solid:'Solid'};
function label(piece,kind) {
  return kind==='flags'?`${names[piece.fill]} ${names[piece.outer].toLowerCase()}`:`${names[piece.outer]} outside, ${names[piece.fill].toLowerCase()} ${names[piece.inner].toLowerCase()} inside`;
}
function fillPattern(h,p,{wrong=false}={}) {
  for(const index of p.blanks) {
    h.click(`[data-cell="${index}"]`);
    const correct=p.cells[index];
    if(p.inputMode==='choose') {
      const choices=h.all('[data-piece]');
      const choice=choices.find(node=>(node.getAttribute('aria-label')===label(correct,p.kind))!==wrong);
      assert.ok(choice,'A picture choice exists for '+p.id);choice.click();
    } else {
      const answer=wrong?{...correct,fill:['empty','stripe','solid'].find(fill=>fill!==correct.fill)}:correct;
      for(const feature of ['outer',...(p.kind==='flags'?[]:['inner']),'fill'])h.click(`[data-feature="${feature}"][data-value="${answer[feature]}"]`);
    }
  }
}
function fillTable(h,p,{wrong=false}={}) {
  for(const [i,key]of p.blanks.entries())h.input(`[data-answer="${key}"]`,h.context.LogicDetectivesEngine.tableAnswer(p,key)+(wrong&&i===0?1:0));
}
function fillSticks(h,p) {
  const E=h.context.LogicDetectivesEngine, initial=E.makeStickState(p), solution=E.getStickSolutions(p)[0];
  assert.ok(solution,'A legal stick solution exists for '+p.id);
  let from,to;
  initial.forEach((segments,i)=>{
    for(const segment of segments)if(!solution[i].includes(segment))from={i,segment};
    for(const segment of solution[i])if(!segments.includes(segment))to={i,segment};
  });
  assert.ok(from,'A real stick is changed');h.click(`[data-position="${from.i}"][data-segment="${from.segment}"]`);
  if(to)h.click(`[data-position="${to.i}"][data-segment="${to.segment}"]`);
}
function fillCorrect(h,p=question(h)) {
  if(p.type==='pattern')fillPattern(h,p);else if(p.type==='table')fillTable(h,p);else fillSticks(h,p);
}
function solve(h,{inspectWhy=false}={}) {
  const p=question(h);assert.ok(p,'There is an active question');fillCorrect(h,p);h.click('#check-answer');
  assert.equal(status(h).solved,true,p.id+' is accepted through the actual UI');
  assert.equal(h.node('answer-dialog').open,true,p.id+' opens feedback');
  assert.equal(h.node('answer-dialog').classList.contains('success'),true,p.id+' celebrates success');
  assert.equal(h.all('[data-reason]').length,0,'No mandatory reasoning quiz exists');
  assert.equal(h.node('next-puzzle').disabled,false,'Correct work can continue directly');
  assert.ok(h.node('popup-visual').textContent.trim(),'A brief visual explanation accompanies success');
  if(inspectWhy) {
    h.click('#popup-why');assert.equal(status(h).currentQuestion,p.id,'Optional why stays on this puzzle');
    assert.equal(h.node('visual-explanation').hidden,false);assert.equal(h.document.activeElement.id,'visual-explanation');
    h.click('#next-puzzle');
  } else h.click('#answer-dialog-dismiss');
  return p;
}
function openCase(h,c) {
  if(!h.node('home-screen').hidden&&status(h).grade!==c.grade)h.click(`[data-grade="${c.grade}"]`);
  if(h.node('home-screen').hidden)h.send('goHome');
  if(status(h).grade!==c.grade)h.click(`[data-grade="${c.grade}"]`);
  h.click(`[data-case="${c.id}"]`);
  assert.equal(status(h).caseId,c.id);assert.equal(status(h).currentQuestion,c.puzzleIds[0]);
}
function finishCase(h,c,{inspectWhy=false}={}) {
  openCase(h,c);
  for(let index=0;index<c.puzzleIds.length;index++) {
    assert.equal(status(h).currentQuestion,c.puzzleIds[index]);solve(h,{inspectWhy:inspectWhy&&index===0});
  }
  assert.equal(h.node('complete-screen').hidden,false,c.id+' reaches its ending');
  return main(h);
}

// No data can be read or written before the iframe belongs to a profile.
{
  const h=harness({autoBind:false,initialData:[[MAIN,'standalone must stay untouched'],[WRONGS,'standalone wrongs must stay untouched']]});
  assert.equal(status(h).ready,false);assert.deepEqual(h.access,[]);
  assert.equal(h.node('profile-wait').hidden,false);assert.equal(h.node('home-screen').hidden,true);
  h.click('#start-case');h.click('[data-grade="3"]');
  assert.deepEqual(h.access,[],'Hidden controls cannot start or save before binding');
  h.send('setProfile',{slug:'word-problem-adventure'});assert.deepEqual(h.access,[],'A profile for a different game is rejected');
  h.bind();assert.equal(status(h).ready,true);assert.equal(status(h).grade,2);
  h.checkpoint();assert.equal(h.data.get(MAIN),'standalone must stay untouched');
  assert.equal(h.data.get(WRONGS),'standalone wrongs must stay untouched');
  assert(!h.access.some(([,key])=>key===MAIN||key===WRONGS),'Embedded play never falls back to standalone keys');
  assert.deepEqual(h.errors,[]);
}
for(const earlyProfile of [false,true]) {
  const h=harness({earlyProfile});
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.accessBeforeDOMReady,[],'Early messages cannot initialize half-loaded scripts');
  assert.equal(h.readyStages.length,1);assert(h.readyStages.every(stage=>stage!=='loading'));
  assert.equal(h.all('.mission-card').length,6);assert.equal(status(h).grade,2);
  h.click('[data-grade="3"]');assert.equal(h.all('.mission-card').length,6);assert.equal(status(h).grade,3);
  assert.equal(h.checkpoint().grade,3);h.send('goHome');assert.equal(h.node('home-screen').hidden,false);
}
{
  const h=harness({standalone:true});assert.equal(status(h).ready,true);assert.deepEqual(h.errors,[]);
  h.click('#start-case');assert.ok(h.data.has(MAIN));assert.ok(h.data.has(WRONGS));
  assert(![...h.data.keys()].some(key=>key.startsWith(MAIN+'__')||key.startsWith(WRONGS+'__')));
  assert.equal(h.messages.length,0,'Standalone bridge posts no hub messages');
}

// Complete every case through real controls, covering all rendered puzzle forms.
const completed=harness();
for(const c of completed.context.LogicDetectivesEngine.cases) {
  const saved=finishCase(completed,c,{inspectWhy:c.number===1});
  assert.equal(saved.completed[c.id].stars,3,c.id+' receives three stars for five independent solutions');
  assert.equal(saved.completed[c.id].independent,5);
}
assert.equal(Object.keys(main(completed).completed).length,12);assert.equal(Object.keys(main(completed).mastery).length,60);
assert.equal(new Set(main(completed).badges).size,main(completed).badges.length);
const badgeAwards=completed.messages.filter(message=>message.event==='awardSticker');
assert.equal(new Set(badgeAwards.map(message=>message.stickerId)).size,badgeAwards.length,'Badge messages are unique');
assert.equal(completed.messages.filter(message=>message.event==='awardStars').length,12);
assert(completed.messages.filter(message=>message.event==='awardStars').every(message=>message.stars===3&&message.profileId==='profile-a'&&message.sessionId==='logic-test'));
const beforeRepeat=plain(main(completed));finishCase(completed,completed.context.LogicDetectivesEngine.cases[0]);
assert.equal(Object.keys(main(completed).mastery).length,60,'Replays cannot inflate independent clue totals');
assert.deepEqual(main(completed).badges,beforeRepeat.badges,'Replays cannot duplicate badges');
assert.equal(main(completed).completed['g2-case-1'].stars,3,'Replay retains the best case result');
assert.deepEqual(completed.errors,[]);

// Real persistence and profile separation, including unscoped legacy-looking data.
{
  const seed=new Map(completed.data),savedA=seed.get(MAIN+'__profile-a'),wrongsA=seed.get(WRONGS+'__profile-a');
  seed.set(MAIN,savedA);seed.set(WRONGS,wrongsA);
  const b=harness({initialData:seed,profileId:'profile-b'});b.checkpoint();
  assert.equal(status(b).grade,2);assert.deepEqual(main(b,'profile-b').cases,{});assert.deepEqual(main(b,'profile-b').completed,{});
  assert.deepEqual(main(b,'profile-b').mastery,{});assert.deepEqual(main(b,'profile-b').badges,[]);assert.deepEqual(wrongs(b,'profile-b'),{});
  assert.equal(b.data.get(MAIN+'__profile-a'),savedA);assert.equal(b.data.get(WRONGS+'__profile-a'),wrongsA);assert.equal(b.data.get(MAIN),savedA);
  assert(!b.messages.some(message=>['awardStars','awardSticker'].includes(message.event)),'New profile inherits no awards');
  assert.deepEqual(b.errors,[]);
}

// Checkpoint exact drafts, real wrongs, optional why, resume and Practice separation.
{
  const h=harness(),c=h.context.LogicDetectivesEngine.cases.find(c=>c.grade===2&&c.number===1);openCase(h,c);
  const p=question(h);assert.equal(p.type,'pattern');
  h.click('#check-answer');assert.equal(h.node('answer-dialog').classList.contains('incomplete'),true);h.click('#answer-dialog-dismiss');
  assert.deepEqual(wrongs(h),{},'An unfinished answer is not a mistake');
  fillPattern(h,p,{wrong:true});h.click('#check-answer');
  assert.equal(h.node('answer-dialog').classList.contains('retry'),true);assert.equal(wrongs(h)[p.id].attempts,1);
  assert.ok(wrongs(h)[p.id].questionShape&&wrongs(h)[p.id].yourAnswer&&wrongs(h)[p.id].correctAnswer);
  h.click('#check-answer');assert.equal(wrongs(h)[p.id].attempts,1,'Repeated checks while popup is open cannot duplicate the miss');
  h.click('#answer-dialog-dismiss');h.click('#hint-button');fillCorrect(h,p);
  const activeKey=MAIN+'__profile-a',beforeHome=plain(main(h).cases[c.id]);
  const descriptor=h.checkpoint();assert.equal(descriptor.caseId,c.id);h.send('goHome');assert.equal(h.node('home-screen').hidden,false);
  assert.deepEqual(main(h).cases[c.id],beforeHome,'Hub Home keeps every chosen feature, hint, and mistake');
  h.click(`[data-case="${c.id}"]`);assert.deepEqual(main(h).cases[c.id],beforeHome,'Continue keeps the exact workspace');
  const reopened=harness({initialData:new Map(h.data),initialResume:descriptor});
  assert.equal(reopened.node('home-screen').hidden,false,'Loading saved data presents an explicit case board');
  reopened.click(`[data-case="${c.id}"]`);assert.equal(status(reopened).currentQuestion,p.id);
  assert.deepEqual(main(reopened).cases[c.id].drafts[0],beforeHome.drafts[0]);
  reopened.click('#check-answer');assert.equal(status(reopened).solved,true);assert.equal(wrongs(reopened)[p.id].resolved,false,'A helped immediate correction remains available for later independent practice');
  reopened.click('#popup-why');assert.equal(reopened.node('visual-explanation').hidden,false);assert.equal(reopened.all('[data-reason]').length,0);
  reopened.send('goHome');const caseBeforePractice=plain(main(reopened).cases[c.id]),masteryBefore=plain(main(reopened).mastery);
  const awardsBefore=reopened.messages.filter(message=>['awardStars','awardSticker','session'].includes(message.event)).length;
  reopened.click('#practice-button');assert.equal(status(reopened).mode,'practice');assert.equal(status(reopened).currentQuestion,p.id);solve(reopened);
  assert.equal(wrongs(reopened)[p.id].resolved,true);assert.deepEqual(main(reopened).cases[c.id],caseBeforePractice,'Practice cannot overwrite a mission workspace');
  assert.deepEqual(main(reopened).mastery,masteryBefore,'Practice statistics stay separate from mission mastery');
  assert.equal(reopened.messages.filter(message=>['awardStars','awardSticker','session'].includes(message.event)).length,awardsBefore,'Practice cannot earn mission stars or duplicate mission sessions');
  assert.equal(main(reopened).practice.sessions,1);reopened.send('goHome');assert.equal(reopened.node('practice-button').disabled,true);
  // The same iframe is permanently suspended when the hub leaves it behind.
  const beforeSuspend=new Map(reopened.data),messagesBefore=reopened.messages.length;
  reopened.send('suspendSession');assert.equal(status(reopened).ready,false);reopened.click('#start-case');reopened.fire('pagehide');
  assert.deepEqual([...reopened.data],[...beforeSuspend]);assert.equal(reopened.messages.length,messagesBefore,'Suspended iframe cannot post delayed progress');
  assert.deepEqual([...h.errors,...reopened.errors],[]);assert.ok(h.data.has(activeKey));
}

// Failed checkpoints must remain failures until both keys are safely retried.
{
  const h=harness();h.click('#start-case');
  const key=MAIN+'__profile-a',wrongKey=WRONGS+'__profile-a',before=h.data.get(key);
  h.failedKeys.add(key);h.click('#hint-button');assert.equal(h.saveReply().ok,false);
  assert.equal(h.data.get(key),before);assert.equal(h.node('storage-notice').hidden,false);
  h.failedKeys.delete(key);assert.equal(h.saveReply().ok,true);assert.equal(main(h).cases['g2-case-1'].drafts[0].hints,1);
  h.failedKeys.add(wrongKey);const p=question(h);fillPattern(h,p,{wrong:true});h.click('#check-answer');assert.equal(h.saveReply().ok,false);
  h.failedKeys.delete(wrongKey);assert.equal(h.saveReply().ok,true);assert.equal(wrongs(h)[p.id].attempts,1);
  const priorMain=h.data.get(key),priorWrongs=h.data.get(wrongKey);h.data.set('kls.restore.journal.v1','{"phase":"prepared"}');
  assert.equal(h.saveReply().ok,false);assert.equal(h.data.get(key),priorMain);assert.equal(h.data.get(wrongKey),priorWrongs);
  h.data.delete('kls.restore.journal.v1');assert.equal(h.saveReply().ok,true);assert.deepEqual(h.errors,[]);
}

// Finishing while browser storage is unavailable must not announce rewards
// to the hub ahead of the durable game record.
{
  const h=harness(),c=h.context.LogicDetectivesEngine.cases.find(c=>c.grade===2&&c.number===1);
  openCase(h,c);
  for(let index=0;index<4;index++)solve(h);
  const awards=()=>h.messages.filter(message=>['awardStars','awardSticker'].includes(message.event));
  const before=awards().length;h.failedKeys.add(MAIN+'__profile-a');solve(h);
  assert.equal(h.node('complete-screen').hidden,false,'A failed save does not prevent finishing the puzzle');
  assert.equal(awards().length,before,'No case or milestone reward is sent before the main save succeeds');
  assert.equal(h.saveReply().ok,false);assert.equal(awards().length,before,'A failed checkpoint cannot release pending rewards');
  h.failedKeys.delete(MAIN+'__profile-a');assert.equal(h.saveReply().ok,true);
  const released=awards().slice(before);
  assert.equal(released.filter(message=>message.event==='awardStars').length,1,'Successful retry releases the earned case stars');
  assert.ok(released.some(message=>message.event==='awardSticker'),'Successful retry releases the earned milestone badges');
  assert.equal(main(h).completed[c.id].stars,3);
  const after=awards().length;assert.equal(h.saveReply().ok,true);assert.equal(awards().length,after,'Another checkpoint cannot duplicate released rewards');
  assert.deepEqual(h.errors,[]);
}

// A newer catalog may have added entries the current game cannot render. They
// must survive current-catalog play, without affecting current-catalog rewards.
{
  const futureCase={id:'g4-case-1',grade:4,mode:'case',ids:['future-clue'],index:0,drafts:[{answers:{v0_0:'14'},futureWork:{keep:true}}],complete:false,futureVersion:2};
  const futureCompleted={stars:3,independent:5,completedAt:'2027-01-01T00:00:00Z',futureField:{keep:'completed'}};
  const futureMastery=Object.fromEntries(Array.from({length:10},(_,index)=>['future-clue-'+index,true]));
  const futureWrong={questionId:'future-clue-0',grade:2,skill:'future-skill',questionShape:{futureLayout:{keep:true}},yourAnswer:'A',correctAnswer:'B',timestamp:'2027-01-01T00:00:00Z',attempts:2,resolved:false,futureNote:{keep:'wrong'}};
  const seed={version:1,grade:2,cases:{'g4-case-1':futureCase},completed:{'g4-case-1':futureCompleted},mastery:futureMastery,badges:[],lastRun:null,futureExtension:{keep:'main'}};
  const h=harness({initialData:[[MAIN+'__profile-a',JSON.stringify(seed)],[WRONGS+'__profile-a',JSON.stringify({'future-clue-0':futureWrong})]]});
  assert.equal(status(h).ready,true);assert.equal(h.all('.mission-card').length,6);
  assert.equal(h.node('practice-button').disabled,true,'A future puzzle is preserved without appearing as an unplayable current practice task');
  assert(!h.messages.some(message=>message.event==='awardSticker'),'Future entries do not create current-catalog awards at startup');
  const c=h.context.LogicDetectivesEngine.cases.find(c=>c.grade===2&&c.number===1);finishCase(h,c);h.checkpoint();
  const saved=main(h);
  assert.deepEqual(saved.cases['g4-case-1'],futureCase,'An unknown future case is retained opaquely');
  assert.deepEqual(saved.completed['g4-case-1'],futureCompleted,'An unknown future completion is retained opaquely');
  for(const [id,value]of Object.entries(futureMastery))assert.equal(saved.mastery[id],value,'An unknown future mastery entry is retained');
  assert.deepEqual(saved.futureExtension,seed.futureExtension);
  assert.deepEqual(wrongs(h)['future-clue-0'],futureWrong,'An unknown future mistake snapshot remains intact');
  assert(saved.badges.includes('clues-5'));assert(!saved.badges.includes('clues-15'),'Future clue totals do not inflate current-catalog mastery badges');
  h.send('goHome');assert.match(h.node('progress-overview').textContent,/1 of 6 cases closed/);assert.match(h.node('progress-overview').textContent,/3 \/ 18 stars/);
  const reopened=harness({initialData:new Map(h.data)});reopened.checkpoint();
  assert.deepEqual(main(reopened).cases['g4-case-1'],futureCase);assert.deepEqual(main(reopened).completed['g4-case-1'],futureCompleted);
  assert.deepEqual(wrongs(reopened)['future-clue-0'],futureWrong);
  for(const [id,value]of Object.entries(futureMastery))assert.equal(main(reopened).mastery[id],value);
  assert.deepEqual([...h.errors,...reopened.errors],[]);
}

// Corruption is visible and cannot be overwritten by background Save.
{
  const key=MAIN+'__profile-a',h=harness({initialData:[[key,'{broken JSON']]});
  assert.equal(status(h).ready,false);assert.equal(h.node('storage-notice').hidden,false);assert.equal(h.node('profile-wait').hidden,false);
  assert.equal(h.saveReply().ok,false);assert.equal(h.data.get(key),'{broken JSON');
  h.click('#reset-progress');assert.equal(h.node('reset-dialog').open,true);h.click('#cancel-reset');assert.equal(h.data.get(key),'{broken JSON');
  h.click('#reset-progress');h.click('#confirm-reset');assert.equal(status(h).ready,true);h.checkpoint();assert.deepEqual(main(h).completed,{});assert.deepEqual(h.errors,[]);
}

// Reset targets the active profile only and also clears the hub summary layer.
{
  const seed=new Map(completed.data);seed.set(MAIN+'__profile-b',seed.get(MAIN+'__profile-a'));seed.set(WRONGS+'__profile-b','{}');
  const h=harness({initialData:seed}),otherMain=h.data.get(MAIN+'__profile-b'),otherWrongs=h.data.get(WRONGS+'__profile-b');
  h.click('#reset-progress');h.click('#confirm-reset');h.checkpoint();
  assert.deepEqual(main(h).cases,{});assert.deepEqual(main(h).completed,{});assert.deepEqual(main(h).mastery,{});assert.deepEqual(wrongs(h),{});
  assert.equal(h.data.get(MAIN+'__profile-b'),otherMain);assert.equal(h.data.get(WRONGS+'__profile-b'),otherWrongs);
  assert.equal(h.messages.filter(message=>message.event==='resetProgress').length,1);assert.deepEqual(h.errors,[]);
}

// The actual registered backup module discovers both stores for every profile,
// restores them through its journal, and makes the replacement Undo-able.
{
  const h=harness({initialData:new Map(completed.data)});h.checkpoint();
  const rawA=h.data.get(MAIN+'__profile-a'),rawWrongsA=h.data.get(WRONGS+'__profile-a');
  h.data.set(MAIN+'__profile-b',rawA);h.data.set(WRONGS+'__profile-b',rawWrongsA);
  h.data.set('kls.progress.v2',JSON.stringify({version:2,activeProfileId:'profile-a',profiles:{'profile-a':{id:'profile-a',displayName:'A',avatar:'fox',games:{}},'profile-b':{id:'profile-b',displayName:'B',avatar:'owl',games:{}}}}));
  const B=h.loadBackup(),envelope=plain(B._internals.buildEnvelope()),payload=envelope.games['logic-detectives'];
  assert.ok(payload,'New game is in the real hub registry');assert.deepEqual(Object.keys(payload).sort(),['profile-a','profile-b']);
  for(const pid of ['profile-a','profile-b']){assert.equal(payload[pid][MAIN],rawA);assert.equal(payload[pid][WRONGS],rawWrongsA);}
  h.data.set(MAIN+'__profile-a',JSON.stringify({version:1,grade:2,cases:{},completed:{},mastery:{},badges:[],lastRun:null}));
  await B.restoreFromEnvelope(envelope);
  for(const pid of ['profile-a','profile-b']){assert.equal(h.data.get(MAIN+'__'+pid),rawA);assert.equal(h.data.get(WRONGS+'__'+pid),rawWrongsA);}
  assert.equal(B.getLastRestoreInfo().undoAvailable,true);assert.equal(h.reloadCount,1);
  const restored=harness({initialData:new Map(h.data)});assert.equal(Object.keys(main(restored).completed).length,12);assert.deepEqual(restored.errors,[]);
}

console.log('PASS Logic Detectives: complete HTML/bridge startup, early/late profile safety, standalone, all 60 puzzles through 12 missions, direct popup Next, optional explanations, exact drafts, isolated Practice, durable reward release, additive future-data preservation, honest failed checkpoints, restore guards, reset, and real backup round-trip.');
