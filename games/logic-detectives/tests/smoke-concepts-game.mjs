/** Grade 3 concept controls, checkpoints, profile isolation, and exact replay.
 * Run: node games/logic-detectives/tests/smoke-concepts-game.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, plain } from './harness.mjs';

const MAIN='logicDetectives_v1', WRONGS='logicDetectives_wrongs_v1';
const status=h=>plain(h.context.LogicDetectives.getStatus());
const main=(h,pid='profile-a')=>JSON.parse(h.data.get(MAIN+(pid?'__'+pid:''))||'null');
const wrongs=(h,pid='profile-a')=>JSON.parse(h.data.get(WRONGS+(pid?'__'+pid:''))||'{}');
const question=h=>h.context.LogicDetectivesEngine.conceptPuzzles.find(p=>p.id===status(h).currentQuestion);
const rewards=h=>h.messages.filter(message=>['awardStars','awardSticker','session'].includes(message.event));
function grade3(h) {
  if(h.node('home-screen').hidden)h.send('goHome');
  if(status(h).grade!==3)h.click('[data-grade="3"]');
}
function open(h,type) {
  grade3(h);h.click(`[data-concept="${type}"]`);
  assert.equal(status(h).mode,'concept');assert.equal(question(h)?.type,type);
}
function answer(h,key,value) {
  const control=h.query(`[data-concept-answer="${key}"]`);
  assert.ok(control,'Concept control exists: '+key);
  control.value=String(value);
  control.dispatchEvent({type:control.tagName==='SELECT'?'change':'input',target:control,bubbles:true});
}
function fill(h,p=question(h),{wrong=false}={}) {
  const E=h.context.LogicDetectivesEngine;
  for(const [i,key]of p.blanks.entries()) {
    let value=E.conceptAnswer(p,key);
    if(wrong&&i===0)value=key==='sign'?(value==='+'?'-':'+'):Number(value)+1;
    answer(h,key,value);
  }
}
function solve(h,{why=false}={}) {
  const p=question(h);assert.ok(p,'A concept puzzle is active');
  fill(h,p);h.click('#check-answer');
  assert.equal(status(h).solved,true,p.id+' accepts its answer through rendered controls');
  assert.equal(h.node('answer-dialog').classList.contains('success'),true);
  assert.ok(h.node('popup-visual').textContent.trim(),'Success contains an explanation');
  if(why) {
    h.click('#popup-why');assert.equal(status(h).currentQuestion,p.id);
    assert.equal(h.node('visual-explanation').hidden,false);
    assert.equal(h.document.activeElement.id,'visual-explanation');
    h.click('#next-puzzle');
  } else h.click('#answer-dialog-dismiss');
  return p.id;
}
function legacy(h) {
  const saved=main(h);
  return plain({cases:saved.cases,completed:saved.completed,mastery:saved.mastery,badges:saved.badges});
}

// The new cards belong to Grade 3, including when a hidden control is invoked.
{
  const h=harness();
  assert.equal(h.node('concept-section').hidden,true);
  assert.equal(h.all('[data-concept]').length,3);
  h.click('[data-concept="parentheses"]');
  assert.equal(status(h).mode,undefined,'Grade 2 cannot open a Grade 3 concept');
  h.click('[data-grade="3"]');assert.equal(h.node('concept-section').hidden,false);
  h.click('[data-grade="2"]');assert.equal(h.node('concept-section').hidden,true);
  assert.deepEqual(h.errors,[]);
}

// All 36 authored puzzles work through the actual input and feedback controls.
// Five-question concept runs keep their progress separate from case rewards.
const completed=harness();grade3(completed);completed.checkpoint();
const legacyBefore=legacy(completed),seen=new Set();
for(const type of ['magic','parentheses','rule']) {
  for(let pass=0;pass<3;pass++) {
    open(completed,type);
    assert.equal(main(completed).conceptRuns[type].ids.length,5);
    for(let index=0;index<5;index++) {
      const p=question(completed);
      assert.equal(p.grade,3);assert.equal(p.type,type);
      if(type==='parentheses') {
        assert.deepEqual(plain(p.blanks),['sign'],'The equation has exactly one answer blank');
        const select=completed.query('select[data-concept-answer="sign"]');
        assert.ok(select,'A native sign dropdown remains keyboard accessible');
        assert.equal(completed.all('[data-concept-answer]').length,1);
        assert.equal(select.querySelector('option[value=""]').textContent.trim(),'?');
        assert.deepEqual(select.querySelectorAll('option').map(option=>option.value),['','+','-']);
        assert.ok(select.getAttribute('aria-label'),'The sign has an accessible name');
      }
      seen.add(solve(completed,{why:pass===0&&index===0}));
    }
    assert.equal(completed.node('complete-screen').hidden,false);
    assert.equal(main(completed).conceptRuns[type].complete,true);
  }
}
assert.equal(seen.size,36,'Repeated concept runs eventually expose the complete bank');
assert.equal(Object.keys(main(completed).conceptMastery).length,36);
assert.deepEqual(legacy(completed),legacyBefore,'Concept work does not change legacy case progress');
assert.deepEqual(rewards(completed),[],'Concepts do not award case stars, badges, or sessions');
assert.deepEqual(completed.errors,[]);
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
assert.match(css,/\.concept-sign\s*\{[^}]*appearance\s*:\s*none/s,'The sign control hides the browser chevron');

// Incomplete work and edits are not wrong answers. Checkpoints preserve the
// exact workspace, including a miss and hints, until an explicit continuation.
for(const type of ['magic','parentheses','rule']) {
  const h=harness();open(h,type);const p=question(h);
  h.click('#check-answer');assert.equal(h.node('answer-dialog').classList.contains('incomplete'),true);
  assert.deepEqual(wrongs(h),{});h.click('#answer-dialog-dismiss');
  fill(h,p,{wrong:true});assert.deepEqual(wrongs(h),{},'Changing an answer is exploration');
  h.click('#check-answer');assert.equal(wrongs(h)[p.id].attempts,1);
  assert.deepEqual(wrongs(h)[p.id].questionShape,plain(p),'The original puzzle is captured for replay');
  const expected=Object.fromEntries(p.blanks.map(key=>[key,h.context.LogicDetectivesEngine.conceptAnswer(p,key)]));
  assert.deepEqual(wrongs(h)[p.id].correctAnswer,expected);
  h.click('#check-answer');assert.equal(wrongs(h)[p.id].attempts,1,'An open feedback popup blocks duplicate grading');
  h.click('#answer-dialog-dismiss');h.click('#hint-button');fill(h,p);
  const descriptor=h.checkpoint(),saved=plain(main(h).conceptRuns[type]);
  h.send('goHome');assert.deepEqual(main(h).conceptRuns[type],saved);
  const reopened=harness({initialData:new Map(h.data),initialResume:descriptor});
  assert.equal(reopened.node('home-screen').hidden,false,'Reload presents explicit Continue');
  open(reopened,type);assert.equal(status(reopened).currentQuestion,p.id);
  assert.deepEqual(main(reopened).conceptRuns[type],saved,'Draft answers, hints, and misses round-trip');
  reopened.click('#check-answer');assert.equal(status(reopened).solved,true);
  assert.equal(wrongs(reopened)[p.id].resolved,false,'A helped immediate correction stays tricky');
  reopened.click('#popup-why');reopened.send('goHome');
  const beforePractice=plain(main(reopened).conceptRuns),beforeMastery=plain(main(reopened).conceptMastery);
  reopened.click('#practice-button');assert.equal(status(reopened).mode,'practice');assert.equal(question(reopened).id,p.id);
  solve(reopened);assert.equal(wrongs(reopened)[p.id].resolved,true);
  assert.deepEqual(main(reopened).conceptRuns,beforePractice,'Tricky practice keeps concept workspaces');
  assert.deepEqual(main(reopened).conceptMastery,beforeMastery,'Tricky practice has separate mastery');
  assert.deepEqual(main(reopened).mastery,{});assert.deepEqual(rewards(reopened),[]);
  reopened.send('goHome');assert.equal(reopened.node('practice-button').disabled,true);
  assert.deepEqual([...h.errors,...reopened.errors],[]);
}

// An uncommitted sign selection survives reload without being graded or solved.
{
  const h=harness();open(h,'parentheses');const p=question(h);
  answer(h,'sign','+');const saved=plain(main(h).conceptRuns.parentheses);h.checkpoint();
  const reopened=harness({initialData:new Map(h.data)});open(reopened,'parentheses');
  assert.equal(reopened.query('[data-concept-answer="sign"]').value,'+');
  assert.equal(status(reopened).currentQuestion,p.id);assert.equal(status(reopened).solved,false);
  assert.deepEqual(main(reopened).conceptRuns.parentheses.drafts,saved.drafts);
  assert.deepEqual(wrongs(reopened),{});
}

// A new child inherits neither completed concepts nor standalone legacy data.
{
  const seed=new Map(completed.data),savedA=seed.get(MAIN+'__profile-a');seed.set(MAIN,savedA);
  seed.set(WRONGS,JSON.stringify({legacy:{questionId:'legacy',resolved:false}}));
  const b=harness({initialData:seed,profileId:'profile-b'});b.checkpoint();
  assert.deepEqual(main(b,'profile-b').conceptRuns,{});assert.deepEqual(main(b,'profile-b').conceptMastery,{});
  assert.deepEqual(wrongs(b,'profile-b'),{});assert.equal(b.data.get(MAIN+'__profile-a'),savedA);
  assert.equal(b.data.get(MAIN),savedA);assert.deepEqual(rewards(b),[]);
  const standalone=harness({standalone:true});open(standalone,'parentheses');fill(standalone);standalone.fire('pagehide');
  assert.equal(main(standalone,null).conceptRuns.parentheses.mode,'concept');
  assert(![...standalone.data.keys()].some(key=>key.startsWith(MAIN+'__')));
  assert.equal(standalone.messages.length,0);
  const a=harness({initialData:seed});a.click('#reset-progress');a.click('#confirm-reset');a.checkpoint();
  assert.deepEqual(main(a).conceptRuns,{});assert.deepEqual(main(a).conceptMastery,{});
  assert.equal(a.data.get(MAIN),savedA,'Reset preserves standalone data');
}

// Additive concept records survive older v1 saves and future catalog entries.
// Invalid known containers protect the entire save from silent replacement.
{
  const old={version:1,grade:3,cases:{},completed:{},mastery:{},badges:[],lastRun:null};
  const h=harness({initialData:[[MAIN+'__profile-a',JSON.stringify(old)]]});h.checkpoint();
  assert.deepEqual(main(h).conceptRuns,{});assert.deepEqual(main(h).conceptMastery,{});
  const future={...old,conceptRuns:{future:{mode:'future',opaque:{keep:true}}},conceptMastery:{'future-concept':true}};
  const f=harness({initialData:[[MAIN+'__profile-a',JSON.stringify(future)]]});open(f,'parentheses');solve(f);f.checkpoint();
  assert.deepEqual(main(f).conceptRuns.future,future.conceptRuns.future);
  assert.equal(main(f).conceptMastery['future-concept'],true);
  for(const field of ['conceptRuns','conceptMastery']) {
    const raw=JSON.stringify({...old,[field]:[]});
    const invalid=harness({initialData:[[MAIN+'__profile-a',raw]]});
    assert.equal(status(invalid).ready,false);assert.equal(invalid.saveReply().ok,false);
    assert.equal(invalid.data.get(MAIN+'__profile-a'),raw);
  }
}

// Real registered backup/export and journaled restore include concept work and
// mastery in the existing two storage bases, with no backup version change.
{
  const h=harness({initialData:new Map(completed.data)});h.checkpoint();
  const raw=h.data.get(MAIN+'__profile-a');
  h.data.set('kls.progress.v2',JSON.stringify({version:2,activeProfileId:'profile-a',profiles:{'profile-a':{id:'profile-a',displayName:'A',avatar:'fox',games:{}}}}));
  const B=h.loadBackup(),envelope=plain(B._internals.buildEnvelope());
  assert.equal(envelope.version,1);
  assert.equal(envelope.games['logic-detectives']['profile-a'][MAIN],raw);
  h.data.set(MAIN+'__profile-a',JSON.stringify(h.context.LogicDetectivesStore.freshMain()));
  await B.restoreFromEnvelope(envelope);
  assert.equal(h.data.get(MAIN+'__profile-a'),raw);
  assert.equal(B.getLastRestoreInfo().undoAvailable,true);
  const restored=harness({initialData:new Map(h.data)});
  assert.equal(Object.keys(main(restored).conceptMastery).length,36);
  assert.equal(Object.keys(main(restored).conceptRuns).length,3);
  assert.deepEqual(restored.errors,[]);
}

console.log('PASS RSM Grade 3 concepts: all 36 puzzles through real controls, one-blank sign dropdown, Grade 3 gating, exact checkpoints, committed mistakes, independent Tricky replay, isolated rewards/profiles, standalone, reset, and additive v1 save safety.');
