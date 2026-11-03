/** Row-pattern demonstration checks through real controls, timers and storage.
 * Run: node games/logic-detectives/tests/smoke-table-interface.mjs */
import assert from 'node:assert/strict';
import {harness,plain} from './harness.mjs';

const MAIN='logicDetectives_v1__profile-a',WRONGS='logicDetectives_wrongs_v1__profile-a';
const main=h=>JSON.parse(h.data.get(MAIN)||'{}');
const wrongs=h=>JSON.parse(h.data.get(WRONGS)||'{}');
const status=h=>plain(h.context.LogicDetectives.getStatus());
const question=h=>h.context.LogicDetectivesEngine.puzzles.find(p=>p.id===status(h).currentQuestion);
const draft=h=>main(h).cases[status(h).caseId].drafts[main(h).cases[status(h).caseId].index];
const demoDelays=new Set([1000,1300,2200]);
const demoTimers=h=>[...h.timers.entries()].filter(([,timer])=>demoDelays.has(timer.delay));
function tickDemo(h){
  const timers=demoTimers(h);assert.equal(timers.length,1,'Exactly one row demonstration step is scheduled');
  const [id,timer]=timers[0];h.timers.delete(id);timer.fn();return timer;
}
function openCase(number){
  const h=harness();h.click(`[data-case="g2-case-${number}"]`);
  assert.equal(question(h).type,'table');return h;
}
function values(h){
  return ['start','add','total'].map(role=>h.query(`.table-term.${role} .table-term-value`).textContent.trim());
}
function quiet(h,selected){
  assert.equal(h.node('table-equation').hidden,true,'Ordinary play does not display a large unknown equation');
  assert.equal(h.node('table-example-controls').hidden,true);
  assert.equal(h.all('.path-selected').length,1);
  assert.equal(h.query('.path-selected').dataset.tableKey,selected);
  for(const role of ['start','add','total'])assert.equal(h.all('.path-'+role).length,0,'Ordinary play has no '+role+' demonstration highlight');
  assert.equal(demoTimers(h).length,0);
}
function demoPhase(h,example,phase){
  assert.equal(h.node('table-equation').hidden,false);
  const terms=h.context.LogicDetectivesTableGuide.describe(question(h),example.totalKey).terms;
  assert.deepEqual(values(h),plain(terms.map((term,index)=>index<=phase?term.value:'·')));
  for(const [index,role]of ['start','add','total'].entries()){
    const cells=h.all('.path-'+role);assert.equal(cells.length,index<=phase?1:0);
    if(index<=phase)assert.equal(cells[0].dataset.tableKey,example.keys[index]);
  }
  assert(example.keys.every(key=>!question(h).blanks.includes(key)),'Demonstrated values are all printed clues');
}

// Default play is deliberately quiet; physical keyboard work and exact selected
// blank survive checkpoints and reloads without exposing an authored answer.
{
  const h=openCase(2);
  assert.deepEqual(plain(question(h).blanks),['c1','v1_2']);quiet(h,'c1');
  assert.equal(h.query('[data-answer="c1"]').value,'');
  assert.equal(h.query('[data-answer="v1_2"]').value,'');
  assert.equal(h.node('table-guide-prompt').getAttribute('aria-live'),'polite');
  assert.equal(h.query('[data-answer="v1_2"]').getAttribute('aria-describedby'),'table-guide-prompt');
  h.click('[data-answer="v1_2"]');quiet(h,'v1_2');
  h.input('[data-answer="v1_2"]','19');assert.equal(h.query('[data-answer="v1_2"]').value,'19');
  h.input('[data-answer="v1_2"]','2x0');assert.equal(h.query('[data-answer="v1_2"]').value,'20');quiet(h,'v1_2');
  assert.deepEqual(wrongs(h),{});assert.equal(draft(h).hints,0);
  h.checkpoint();assert.equal(draft(h).selected,'v1_2');
  h.send('goHome');h.click('[data-case="g2-case-2"]');quiet(h,'v1_2');
  const reopened=harness({initialData:new Map(h.data)});reopened.click('[data-case="g2-case-2"]');quiet(reopened,'v1_2');
  assert.equal(reopened.query('[data-answer="v1_2"]').value,'20');
  reopened.query('[data-answer="c1"]').focus();quiet(reopened,'c1');
  assert.deepEqual(h.errors,[]);assert.deepEqual(reopened.errors,[]);
}

// Every example starts at the same printed row number and visits only printed
// columns/totals. Manual stepping pauses autoplay and does not change the draft.
{
  const h=openCase(2),examples=plain(h.context.LogicDetectivesTableGuide.getRowExamples(question(h)));
  assert.equal(examples.length,2);
  h.click('[data-answer="v1_2"]');h.input('[data-answer="v1_2"]','2');
  const before=plain(draft(h));
  h.click('#table-example-toggle');
  assert.equal(h.node('table-guide-label').textContent,'Same start. A new top number.');
  assert.equal(h.node('table-example-toggle').textContent,'Back to my puzzle');
  for(let index=0;index<examples.length;index++){
    assert.equal(h.node('table-example-step').textContent,`Example ${index+1} of ${examples.length}`);
    for(let phase=0;phase<3;phase++){
      demoPhase(h,examples[index],phase);
      assert.equal(values(h)[0],'9','Each calculation restarts at the same row start');
      h.click('#table-example-next');
      assert.equal(demoTimers(h).length,0,'Manual Next pauses automatic transitions');
    }
  }
  quiet(h,'v1_2');assert.equal(h.document.activeElement.id,'answer-v1_2');
  h.checkpoint();assert.deepEqual(draft(h),before);assert.deepEqual(wrongs(h),{});
  h.click('#table-example-toggle');h.click('#table-example-toggle');quiet(h,'v1_2');
  assert.deepEqual(draft(h),before);
  assert.deepEqual(h.errors,[]);
}

// Autoplay is finite, pause/resume is explicit, completion offers Replay, and
// stale callbacks cannot advance a closed or newly reopened demonstration.
{
  const h=openCase(2),examples=plain(h.context.LogicDetectivesTableGuide.getRowExamples(question(h)));
  const before=plain(draft(h));h.click('#table-example-toggle');demoPhase(h,examples[0],0);
  assert.equal(demoTimers(h).length,1);
  const oldPaused=demoTimers(h)[0][1];h.click('#table-example-play');assert.equal(demoTimers(h).length,0);
  const paused=values(h);h.click('#table-example-play');assert.deepEqual(values(h),paused);assert.equal(demoTimers(h).length,1);
  oldPaused.fn();assert.deepEqual(values(h),paused,'An old clock cannot advance a resumed demonstration');
  assert.equal(demoTimers(h).length,1,'Pause/resume leaves one authoritative clock');
  let count=0;while(demoTimers(h).length&&count++<20)tickDemo(h);
  assert(count<20,'Autoplay stops at the final printed example');
  demoPhase(h,examples.at(-1),2);assert.match(h.node('table-example-play').textContent,/Replay/i);
  assert.deepEqual(draft(h),before);assert.deepEqual(wrongs(h),{});
  h.click('#table-example-play');demoPhase(h,examples[0],0);assert.equal(demoTimers(h).length,1);
  const stale=demoTimers(h)[0][1];h.click('#table-example-toggle');quiet(h,question(h).blanks[0]);
  h.click('#table-example-toggle');stale.fn();demoPhase(h,examples[0],0);
  assert.equal(demoTimers(h).length,1,'An old callback cannot create another clock for a new run');
  h.click('#table-example-toggle');quiet(h,question(h).blanks[0]);
  for(let index=0;index<4;index++){h.click('#table-example-toggle');const old=demoTimers(h)[0][1];h.click('#table-example-toggle');old.fn();quiet(h,question(h).blanks[0]);}
  assert.deepEqual(h.errors,[]);
}

// Returning to typing, resetting, hiding, or leaving home stops the clock and
// preserves the child's work. Visibility does not silently replay hidden steps.
{
  const h=openCase(2);h.click('[data-answer="v1_2"]');h.input('[data-answer="v1_2"]','2');
  h.click('#table-example-toggle');h.click('[data-answer="v1_2"]');quiet(h,'v1_2');assert.equal(h.query('[data-answer="v1_2"]').value,'2');
  h.click('#table-example-toggle');h.input('[data-answer="v1_2"]','20');quiet(h,'v1_2');
  h.click('#table-example-toggle');const oldReset=demoTimers(h)[0][1];h.click('#reset-answer');oldReset.fn();quiet(h,'c1');
  assert(h.all('[data-answer]').every(input=>input.value===''));assert.equal(draft(h).hints,0);assert.deepEqual(wrongs(h),{});
  h.click('#table-example-toggle');const oldHidden=demoTimers(h)[0][1],beforeHide=values(h);
  h.document.hidden=true;h.document.visibilityState='hidden';h.document.dispatchEvent({type:'visibilitychange'});
  assert.equal(demoTimers(h).length,0,'A hidden document has no active demonstration clock');oldHidden.fn();assert.deepEqual(values(h),beforeHide);
  h.document.hidden=false;h.document.visibilityState='visible';h.document.dispatchEvent({type:'visibilitychange'});
  oldHidden.fn();assert.deepEqual(values(h),beforeHide,'Returning to visibility cannot revive a canceled clock');
  h.click('#table-example-toggle');quiet(h,'c1');
  h.click('#table-example-toggle');const oldHome=demoTimers(h)[0][1];h.send('goHome');
  assert.equal(h.node('home-screen').hidden,false);assert.equal(demoTimers(h).length,0);oldHome.fn();assert.equal(demoTimers(h).length,0);
  h.click('[data-case="g2-case-2"]');quiet(h,'c1');
  h.click('#table-example-toggle');const oldPageHide=demoTimers(h)[0][1],beforePageHide=values(h);h.fire('pagehide');
  assert.equal(demoTimers(h).length,0);oldPageHide.fn();assert.deepEqual(values(h),beforePageHide);
  h.click('[data-answer="c1"]');h.input('[data-answer="c1"]','11');quiet(h,'c1');
  assert.equal(h.query('[data-answer="c1"]').value,'11','A cached page remains interactive after pagehide pauses playback');
  assert.deepEqual(h.errors,[]);
}

// Reduced-motion readers start with manual control. Play remains an explicit
// choice; opening or stepping an example never forces timed motion.
{
  const h=openCase(2);h.context.matchMedia=()=>({matches:true});
  const examples=plain(h.context.LogicDetectivesTableGuide.getRowExamples(question(h)));
  h.click('#table-example-toggle');demoPhase(h,examples[0],0);
  assert.equal(demoTimers(h).length,0);assert.equal(h.node('table-example-play').textContent,'Play');
  h.click('#table-example-next');demoPhase(h,examples[0],1);assert.equal(demoTimers(h).length,0);
  h.click('#table-example-toggle');quiet(h,question(h).blanks[0]);assert.deepEqual(h.errors,[]);
}

// Linked blanks remain unknown. Enter still distinguishes incomplete work,
// committed mistakes and successful solutions, with useful focus after popup.
{
  const h=openCase(5),p=question(h);h.click('[data-answer="c0"]');quiet(h,'c0');
  h.key('[data-answer="c0"]','Enter');assert.equal(h.node('answer-dialog').open,true);
  assert(h.node('answer-dialog').classList.contains('incomplete'));assert.deepEqual(wrongs(h),{});
  h.click('#answer-dialog-dismiss');assert.equal(h.document.activeElement.id,'answer-c0');quiet(h,'c0');
  h.input('[data-answer="r0"]','19');h.click('[data-answer="c0"]');quiet(h,'c0');
  for(const key of p.blanks)h.input(`[data-answer="${key}"]`,h.context.LogicDetectivesEngine.tableAnswer(p,key)+(key==='c0'?1:0));
  h.key('[data-answer="c0"]','Enter');assert(h.node('answer-dialog').classList.contains('retry'));assert.equal(wrongs(h)[p.id].attempts,1);
  h.click('#answer-dialog-dismiss');assert.equal(h.document.activeElement.id,'answer-c0');quiet(h,'c0');
  h.input('[data-answer="c0"]',h.context.LogicDetectivesEngine.tableAnswer(p,'c0'));
  h.key('[data-answer="c0"]','Enter');assert(h.node('answer-dialog').classList.contains('success'));assert.equal(status(h).solved,true);
  h.click('#popup-why');assert.equal(h.document.activeElement.id,'visual-explanation');assert.deepEqual(h.errors,[]);
}

// Later Grade3 tables can have only one fully printed example. That fallback
// stays finite and never incorporates a missing label or missing total.
{
  const h=harness();h.click('[data-grade="3"]');h.click('[data-case="g3-case-1"]');
  const first=question(h);assert.equal(first.type,'pattern');
  for(const index of first.blanks){h.click(`[data-cell="${index}"]`);for(const feature of ['outer',...(first.kind==='flags'?[]:['inner']),'fill'])h.click(`[data-feature="${feature}"][data-value="${first.cells[index][feature]}"]`);}
  h.click('#check-answer');h.click('#answer-dialog-dismiss');assert.equal(question(h).type,'table');
  const examples=plain(h.context.LogicDetectivesTableGuide.getRowExamples(question(h)));assert.equal(examples.length,1);
  const before=plain(draft(h));h.click('#table-example-toggle');
  for(let phase=0;phase<3;phase++){demoPhase(h,examples[0],phase);h.click('#table-example-next');}
  quiet(h,question(h).blanks[0]);assert.deepEqual(draft(h),before);assert.deepEqual(wrongs(h),{});assert.deepEqual(h.errors,[]);
}

console.log('Logic Detectives row interface: quiet blanks, fixed-start printed examples, manual and automatic controls, pause/replay, stale timer protection, visibility/Home/reset safety, exact drafts, Enter/popups, and single-example fallback passed.');
