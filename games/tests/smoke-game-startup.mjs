/** Run complete game scripts in their HTML order, with the real hub bridge.
 * Rendering uses an isolated DOM; no browser account or real save is read.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const games = new URL('../', import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
function attributes(text) {
  const attrs = {};
  for (const m of text.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  return attrs;
}
function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
function matches(node, selector) {
  selector = selector.trim();
  if (!selector) return false;
  const parts = selector.split(/\s+(?![^\[]*\])/);
  if (parts.length > 1) {
    if (!matches(node, parts.at(-1))) return false;
    let parent = node.parentNode;
    while (parent) { if (matches(parent, parts.slice(0,-1).join(' '))) return true; parent = parent.parentNode; }
    return false;
  }
  const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
  if (tag && node.tagName !== tag.toUpperCase()) return false;
  for (const id of selector.matchAll(/#([\w-]+)/g)) if (node.id !== id[1]) return false;
  for (const cls of selector.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(cls[1])) return false;
  for (const a of selector.matchAll(/\[([\w-]+)(?:(\^?=)["']?([^\]"']*)["']?)?\]/g)) {
    const value = node.getAttribute(a[1]);
    if (value === null || (a[2] === '=' && value !== a[3]) || (a[2] === '^=' && !value.startsWith(a[3]))) return false;
  }
  return true;
}
class Node {
  constructor(tag='div') {
    this.tagName=tag.toUpperCase(); this.children=[]; this.attrs={}; this.events={}; this.parentNode=null;
    this.style={setProperty(k,v){this[k]=String(v);},removeProperty(k){delete this[k];}};
    this.value='';this.disabled=false;this.hidden=false;this.checked=false;this.text='';
    this.dataset=new Proxy({}, {get:(_,k)=>this.getAttribute('data-'+String(k).replace(/[A-Z]/g,m=>'-'+m.toLowerCase())),set:(_,k,v)=>{this.setAttribute('data-'+String(k).replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),v);return true;}});
    this.classList={contains:k=>this.className.split(/\s+/).includes(k),add:(...ks)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...ks])].join(' ');},remove:(...ks)=>{this.className=this.className.split(/\s+/).filter(k=>!ks.includes(k)).join(' ');},toggle:(k,on)=>{on=on??!this.classList.contains(k);on?this.classList.add(k):this.classList.remove(k);return on;}};
  }
  get children(){return this._children;}
  set children(value){this._children=value;Object.defineProperty(value,'item',{value:index=>value[index]??null,configurable:true});}
  get id(){return this.attrs.id||'';} set id(v){this.attrs.id=String(v);}
  get className(){return this.attrs.class||'';} set className(v){this.attrs.class=String(v);}
  get textContent(){return this.text+this.children.map(n=>n.textContent).join(' ');} set textContent(v){this.text=String(v);this.children=[];}
  get innerHTML(){return this.html||'';} set innerHTML(v){this.html=String(v);this.text='';this.children=[];parseHTML(this.html,this);}
  get firstChild(){return this.children[0]||null;} get lastChild(){return this.children.at(-1)||null;}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='hidden')this.hidden=true;if(k==='value')this.value=String(v);if(k==='disabled')this.disabled=true;}
  getAttribute(k){return Object.hasOwn(this.attrs,k)?this.attrs[k]:null;}
  hasAttribute(k){return k==='hidden'?this.hidden:Object.hasOwn(this.attrs,k);}
  removeAttribute(k){delete this.attrs[k];if(k==='hidden')this.hidden=false;if(k==='disabled')this.disabled=false;}
  appendChild(n){n.parentNode=this;this.children.push(n);return n;} append(...ns){for(const n of ns)this.appendChild(n);}
  prepend(n){n.parentNode=this;this.children.unshift(n);} replaceChildren(...ns){this.children=[];this.text='';this.append(...ns);}
  removeChild(n){this.children=this.children.filter(x=>x!==n);n.parentNode=null;return n;} remove(){this.parentNode?.removeChild(this);}
  querySelectorAll(s){return descendants(this).filter(n=>s.split(',').some(sel=>matches(n,sel)));} querySelector(s){return this.querySelectorAll(s)[0]||null;}
  closest(s){let n=this;while(n){if(matches(n,s))return n;n=n.parentNode;}return null;}
  addEventListener(k,fn){(this.events[k]||=[]).push(fn);} dispatchEvent(e){e.target||=this;for(const fn of this.events[e.type]||[])fn(e);return true;}
  removeEventListener(k,fn){this.events[k]=(this.events[k]||[]).filter(x=>x!==fn);}
  focus(){} select(){} scrollIntoView(){} scrollTo(){} click(){this.dispatchEvent({type:'click',target:this,preventDefault(){}});}
  getBoundingClientRect(){return {left:0,top:0,right:100,bottom:100,width:100,height:100};}
  getTotalLength(){return 100;} getPointAtLength(n){return {x:n,y:n};}
}
function parseHTML(html, root) {
  const stack=[root];
  for(const m of html.matchAll(/<!--[^]*?-->|<\/?([a-z][\w-]*)([^>]*?)>|([^<]+)/gi)) {
    if(m[3]) {stack.at(-1).text+=m[3];continue;}
    if(!m[1])continue;
    const tag=m[1].toLowerCase();
    if(m[0].startsWith('</')) {const index=stack.findLastIndex(n=>n.tagName===tag.toUpperCase());if(index>0)stack.length=index;continue;}
    const n=new Node(tag);for(const [k,v] of Object.entries(attributes(m[2])))n.setAttribute(k,v);
    stack.at(-1).appendChild(n);if(!voidTags.has(tag)&&!m[0].endsWith('/>'))stack.push(n);
  }
}
function harness(slug,{earlyProfile=false,standalone=false,initialResume=null,initialData=[],profileId='dad-test'}={}) {
  const url=new URL(slug+'/index.html',games),html=readFileSync(url,'utf8');
  const domRoot=new Node('root');parseHTML(html.replace(/<script\b[^>]*>[^]*?<\/script>/gi,'').replace(/<style\b[^>]*>[^]*?<\/style>/gi,''),domRoot);
  const document={body:domRoot.querySelector('body'),documentElement:domRoot.querySelector('html'),readyState:'loading',hidden:false,visibilityState:'visible',events:{},
    getElementById:id=>domRoot.querySelector('#'+id),querySelector:s=>domRoot.querySelector(s),querySelectorAll:s=>domRoot.querySelectorAll(s),
    createElement:t=>new Node(t),createElementNS:(_,t)=>new Node(t),createTextNode:t=>{const n=new Node('#text');n.textContent=t;return n;},
    addEventListener(k,fn){(this.events[k]||=[]).push(fn);},removeEventListener(k,fn){this.events[k]=(this.events[k]||[]).filter(x=>x!==fn);},dispatchEvent(e){for(const fn of this.events[e.type]||[])fn(e);}};
  const data=new Map(initialData),messages=[],errors=[],events={},timers=new Map(),pendingHub=[],readyStages=[],failedKeys=new Set();let timerId=0;
  const storage={getItem:k=>data.get(k)??null,setItem(k,v){if(failedKeys.has(k))throw new Error('Test storage quota for '+k);data.set(k,String(v));},removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]??null,get length(){return data.size;}};
  // postMessage crosses a task boundary. Respond immediately at the next
  // boundary, including between external scripts while the HTML is loading.
  const parent={postMessage(m){
    messages.push(plain(m));
    if(m.event==='profileReady'){
      readyStages.push(document.readyState);
      if(initialResume)pendingHub.push(['resumeState',{state:plain(initialResume)}]);
    }
  }};
  const context=vm.createContext({document,localStorage:storage,performance:{now:()=>10000},console:{log(){},warn(){},error:(...args)=>errors.push(args.map(a=>a?.message||String(a)).join(' '))},
    HTMLElement:Node,Node,Map,Set,Date,Math,JSON,Blob:class{},URL,FileReader:class{},MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}},
    location:{pathname:'/games/'+slug+'/index.html',hash:'',reload(){}},navigator:{},getComputedStyle:n=>({display:n.hidden?'none':(n.style.display||'block'),visibility:'visible',opacity:'1'}),
    addEventListener(k,fn){(events[k]||=[]).push(fn);},removeEventListener(k,fn){events[k]=(events[k]||[]).filter(x=>x!==fn);},
    setTimeout(fn,delay){timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),setInterval:()=>++timerId,clearInterval(){},requestAnimationFrame:()=>++timerId,cancelAnimationFrame(){},
    scrollTo(){},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),confirm:()=>false,alert(){},parent});
  context.window=context;if(standalone)context.parent=context;
  const run=code=>vm.runInContext(code,context);
  const send=(event,payload={})=>{for(const fn of events.message||[])fn({source:parent,data:{type:'kls:hub',event,slug,profileId,sessionId:'startup-test',...payload}});};
  const flushHub=()=>{while(pendingHub.length){const [event,payload]=pendingHub.shift();send(event,payload);}};
  let scriptIndex=0;
  for(const m of html.matchAll(/<script\b([^>]*)>([^]*?)<\/script>/gi)) {
    const src=attributes(m[1]).src;
    const source=src?readFileSync(new URL(src,url),'utf8'):m[2];
    vm.runInContext(source,context,{filename:slug+'/'+(src||'inline-'+scriptIndex++)});
    if(earlyProfile&&src?.split('?')[0].endsWith('game-bridge.js'))send('setProfile');
    flushHub();
  }
  document.readyState='interactive';document.dispatchEvent({type:'DOMContentLoaded'});flushHub();
  document.readyState='complete';
  if(!standalone&&!earlyProfile)send('setProfile');
  flushHub();
  return {context,run,send,document,data,messages,errors,timers,readyStages,failedKeys,node:id=>document.getElementById(id),
    saveReply(){const prior=messages.length;send('requestState',{requestId:'save-'+prior});const save=messages.slice(prior).find(m=>m.event==='saveState');assert.ok(save,slug+' replies to Save');return save;},
    checkpoint(){const prior=messages.length;send('requestState',{requestId:'save-'+prior});const save=messages.slice(prior).find(m=>m.event==='saveState');assert.ok(save,slug+' replies to Save');assert.equal(save.ok,true,slug+' Save confirms: '+save.error);return save.state;}};
}

function clickText(h, pattern) {
  const button=h.document.querySelectorAll('button').find(n=>pattern.test(n.textContent));
  assert.ok(button,'button exists: '+pattern);button.click();
}
function startAndDraft(h,slug) {
  if(slug==='lets-learn-fractions') {
    h.node('startBtn').click();h.node('answerInput').value='27';
    const blob=h.checkpoint();assert.equal(blob.screen,'gameScreen');assert.equal(blob.input,'27');assert.ok(blob.currentQ);
    return blob;
  }
  if(slug==='long-division-coach') {
    clickText(h,/^Solve with my coach$/);h.node('dp-answer').value='7';
    h.node('dp-answer').dispatchEvent({type:'input',target:h.node('dp-answer'),preventDefault(){}});
    const blob=h.checkpoint();assert.equal(blob.module,'learning');assert.equal(blob.learningJourney.guided.draft,'7');
    return blob;
  }
  clickText(h,/Start my first quest|Next quest/);h.node('ga-answer').value='27';
  h.node('ga-answer').dispatchEvent({type:'input',target:h.node('ga-answer'),preventDefault(){}});
  const blob=h.checkpoint();assert.equal(blob.mode,'grade-adventure');assert.equal(blob.session.draft,'27');
  return blob;
}
function continueSaved(h,slug) {
  if(slug==='lets-learn-fractions')h.node('resumeBtn').click();
  else if(slug==='long-division-coach')h.node('resumeContinueBtn').click();
  else clickText(h,/Continue saved Grade/);
}

for(const slug of ['lets-learn-fractions','long-division-coach','word-problem-adventure']) {
  for(const earlyProfile of [false,true]) {
    const h=harness(slug,{earlyProfile});
    assert.deepEqual(h.errors,[],slug+' has no startup/profile exception');
    assert.equal(h.readyStages.length,1,slug+' announces one ready game');
    assert.ok(h.readyStages.every(stage=>stage!=='loading'),slug+' never acknowledges a profile before all HTML scripts load');
    const menu=h.checkpoint();assert.ok(menu&&[1,2].includes(menu.v),slug+' menu checkpoint');
    h.send('resumeState',{state:menu});assert.deepEqual(h.checkpoint(),menu,slug+' saves staged Continue without losing it');
    h.send('goHome');h.checkpoint();
    assert.deepEqual(h.errors,[],slug+' Home/Save has no exception');
    // Reopen through an entirely fresh document, retaining the actual active
    // checkpoint instead of relying on extracted capture/restore functions.
    const activeHarness=harness(slug,{earlyProfile});
    const active=startAndDraft(activeHarness,slug);
    activeHarness.send('goHome');
    const home=activeHarness.checkpoint();
    if(slug==='word-problem-adventure')assert.deepEqual(home.session,active.session,'grade Home retains active draft');
    else if(slug==='long-division-coach') {
      assert.equal(home.learningJourney.screen,'home');
      assert.deepEqual(home.learningJourney.guided,active.learningJourney.guided,'division Home retains active draft');
      assert.deepEqual(home.learningJourney.records,active.learningJourney.records,'division Home retains completion history');
    }
    else assert.deepEqual(home,active,slug+' Home preserves a Continue checkpoint');
    const reopened=harness(slug,{earlyProfile,initialResume:active});
    assert.deepEqual(reopened.checkpoint(),active,slug+' Save before Continue retains active checkpoint');
    continueSaved(reopened,slug);
    const restored=reopened.checkpoint();
    if(slug==='word-problem-adventure')assert.deepEqual(restored.session,active.session,'grade Continue restores exact draft');
    else assert.deepEqual(restored,active,slug+' Continue restores exact draft');
    assert.deepEqual([...activeHarness.errors,...reopened.errors],[],slug+' active/Home/Continue has no exception');
  }
  assert.deepEqual(harness(slug,{standalone:true}).errors,[],slug+' standalone loads without an exception');
}

// Full Long Division scripts, bridge and registered storage work together.
// A new iframe represents each profile, just as the real hub creates one.
{
  const slug='long-division-coach',MAIN='longDivisionCoach_v1',WRONGS='longDivisionCoach_wrongs_v1';
  const main=MAIN+'__dad-test',wrongs=WRONGS+'__dad-test';
  const enter=(h,value)=>{h.node('dp-answer').value=String(value);h.node('dp-answer').dispatchEvent({type:'input',preventDefault(){}});};
  const submit=(h,value)=>{enter(h,value);h.node('dp-check').click();};
  const h=harness(slug);clickText(h,/^Solve with my coach$/);
  submit(h,2);clickText(h,/^Hint$/);submit(h,1);enter(h,7);
  const saved=h.checkpoint();
  assert.deepEqual(saved.learningJourney.guided.answers,[1]);
  assert.equal(saved.learningJourney.guided.draft,'7');assert.equal(saved.learningJourney.guided.usedHelp,true);
  assert.equal(saved.learningJourney.guided.wrong,1);
  assert.equal(JSON.parse(h.data.get(wrongs)).records[0].questionId,'3/528','Mistakes persist immediately before completing an equation');
  assert.equal(JSON.parse(h.data.get(wrongs)).records[0].attempts,1);
  assert.equal(JSON.parse(h.data.get(wrongs)).records[0].hintsUsed,1);
  const savedMain=h.data.get(main),savedWrongs=h.data.get(wrongs);
  const seed=new Map(h.data);seed.set(MAIN,savedMain);seed.set(WRONGS,savedWrongs);
  const child=harness(slug,{initialData:seed,profileId:'brand-new-child'}),fresh=child.checkpoint();
  assert.deepEqual(fresh.learningJourney.guided.answers,[]);assert.equal(fresh.learningJourney.guided.draft,'');
  assert.equal(fresh.learningJourney.guided.wrong,0);assert.deepEqual(fresh.learningJourney.records,{});
  assert.deepEqual(fresh.learningJourney.mistakes,{});assert.equal(fresh.classicSession,null);
  assert.equal(child.data.get(main),savedMain);assert.equal(child.data.get(wrongs),savedWrongs);
  assert.equal(child.data.get(MAIN),savedMain,'No automatic standalone migration or mutation');
  assert(!child.messages.some(m=>m.event==='awardStars'||m.event==='awardSticker'),'A fresh profile receives no inherited awards');
  const reopened=harness(slug,{initialData:seed,initialResume:saved});
  assert.deepEqual(reopened.checkpoint(),saved,'A staged saved lesson survives initial local loading');
  continueSaved(reopened,slug);
  assert.deepEqual(reopened.checkpoint(),saved);
  assert.equal(reopened.node('dp-answer').value,'7');
  assert.equal(reopened.data.get(wrongs),savedWrongs,'Restoring cannot duplicate mistakes');
  assert(!reopened.messages.some(m=>m.event==='awardStars'),'Restoring cannot award stars');

  // A failed main key or wrongs key cannot be acknowledged as Saved. Retrying
  // writes the newest draft without losing the independent failed mistake.
  h.failedKeys.add(main);enter(h,8);
  assert.equal(h.saveReply().ok,false);assert.equal(h.data.get(main),savedMain);
  assert(h.node('dp-save-note').textContent.includes('Could not save'));
  h.failedKeys.delete(main);
  assert.equal(h.saveReply().ok,true);assert.equal(JSON.parse(h.data.get(main)).learningJourney.guided.draft,'8');
  h.failedKeys.add(wrongs);submit(h,9);
  assert.equal(h.saveReply().ok,false,'A saved main key cannot conceal a failed wrongs write');
  h.failedKeys.delete(wrongs);
  assert.equal(h.saveReply().ok,true);assert.equal(JSON.parse(h.data.get(wrongs)).records[0].attempts,2);
  assert.equal(JSON.parse(h.data.get(wrongs)).records[0].hintsUsed,1);
  const beforeGuard=new Map(h.data);h.data.set('kls.restore.journal.v1','{"phase":"prepared"}');
  enter(h,6);assert.equal(h.saveReply().ok,false);
  for(const key of [main,wrongs])assert.equal(h.data.get(key),beforeGuard.get(key),'Restore guard blocks '+key);
  h.data.delete('kls.restore.journal.v1');assert.equal(h.saveReply().ok,true);
  assert.equal(JSON.parse(h.data.get(main)).learningJourney.guided.draft,'6');

  h.send('goHome');clickText(h,/^Tricky practice \(1\)$/);
  const practiceCore=h.context.DivisionPracticeCore;
  let replay=h.checkpoint().learningJourney.guided;
  assert.equal(replay.replay,true);
  while(practiceCore.replay(528,3,replay.answers).phase!=='done') {
    submit(h,practiceCore.expectation(practiceCore.replay(528,3,replay.answers)).expected);
    replay=h.checkpoint().learningJourney.guided;
  }
  assert.equal(JSON.parse(h.data.get(wrongs)).records.length,0,'A clean targeted replay clears its active mistake');
  assert.deepEqual(h.checkpoint().learningJourney.mistakes,{});

  const resetSeed=new Map(seed),childMain=MAIN+'__brand-new-child';resetSeed.set(childMain,child.data.get(childMain));
  const reset=harness(slug,{initialData:resetSeed});reset.context.confirm=()=>true;
  reset.send('goHome');clickText(reset,/^Reset my progress$/);
  const clean=reset.checkpoint();assert.deepEqual(clean.learningJourney.guided.answers,[]);
  assert.deepEqual(clean.learningJourney.records,{});assert.deepEqual(clean.learningJourney.mistakes,{});
  assert.equal(JSON.parse(reset.data.get(main)).totalStars,0);
  assert(!reset.data.has(wrongs)||JSON.parse(reset.data.get(wrongs)).records.length===0);
  assert.equal(reset.data.get(childMain),resetSeed.get(childMain),'Reset preserves the other profile');
  assert.equal(reset.data.get(MAIN),savedMain,'Reset preserves standalone progress');
  assert(reset.messages.some(m=>m.event==='resetProgress'),'Reset clears the hub summary as well');

  // Suspending an outgoing iframe fences animation/celebration callbacks and
  // direct stale input events even before the replacement document is loaded.
  const solved=harness(slug);clickText(solved,/^Solve with my coach$/);
  let work=solved.checkpoint().learningJourney.guided;
  const core=solved.context.DivisionPracticeCore;
  while(core.replay(528,3,work.answers).phase!=='done') {
    const engine=core.replay(528,3,work.answers);submit(solved,core.expectation(engine).expected);
    work=solved.checkpoint().learningJourney.guided;
  }
  assert.equal(solved.messages.filter(m=>m.event==='awardStars').length,1);
  const callbacks=[...solved.timers.values()].map(t=>t.fn),beforeSuspend=new Map(solved.data),messageCount=solved.messages.length;
  assert(callbacks.length>0);solved.send('suspendSession');callbacks.forEach(fn=>fn());
  assert.deepEqual(solved.data,beforeSuspend,'Outgoing celebration callbacks cannot write');
  assert.equal(solved.messages.length,messageCount,'Outgoing callbacks cannot send a later progress award');

  // The old advanced checkpoint shape still stages, restores and returns to
  // the new Home without losing its typed answer or any classic session data.
  const classic=harness(slug);clickText(classic,/^More practice/);
  classic.document.dispatchEvent({type:'keydown',key:'7',target:classic.document.body,preventDefault(){}});
  const old=classic.checkpoint();assert.equal(old.inputValue,'7');assert(old.problem&&old.engine);
  classic.send('goHome');const home=classic.checkpoint();
  assert.equal(home.module,'learning');assert.deepEqual(home.classicSession,old);
  const v1={...old,v:1},oldReopened=harness(slug,{initialResume:v1});
  assert.deepEqual(oldReopened.checkpoint(),v1,'Old checkpoints remain opaque until Continue');
  continueSaved(oldReopened,slug);
  const resumed=oldReopened.checkpoint();assert.equal(resumed.inputValue,'7');assert.deepEqual(resumed.engine,old.engine);
  assert.equal(oldReopened.node('ldc-classic-root').hidden,false);
  const custom=harness(slug,{initialData:[[wrongs,JSON.stringify({records:[{questionId:'12/936',questionShape:{dividend:936,divisor:12,difficulty:'hard'},attempts:1,hintsUsed:0}]})]]});
  clickText(custom,/^Tricky practice \(1\)$/);const customReplay=custom.checkpoint();
  assert.equal(customReplay.problem.dividend,936);assert.equal(customReplay.problem.divisor,12);
  assert.equal(customReplay.replayingQuestionId,'12/936','Advanced tricky entry replays the saved equation');
  assert.equal(custom.node('ldc-classic-root').hidden,false);

  // The mission updates its index before the 700 ms celebration loads the
  // next board. Saving in that interval must not reopen the finished board.
  const mission=harness(slug);clickText(mission,/^Daily mission$/);
  mission.document.dispatchEvent({type:'click',target:mission.document.querySelector('[data-mission-difficulty="easy"]'),preventDefault(){}});
  let transition=mission.checkpoint(),missionSteps=0;
  assert.equal(transition.mission.currentIndex,0);
  while(transition.engine.phase!=='done') {
    const e=transition.engine;
    const expected=e.phase==='divide'?Math.floor(e.currentValue/e.divisor):
      e.phase==='multiply'?e.qDigit*e.divisor:
      e.phase==='subtract'?e.currentValue-(e.product??0):e.dividendDigits[e.cursorIndex];
    if(expected!==undefined)for(const digit of String(expected))mission.document.dispatchEvent({type:'keydown',key:digit,target:mission.document.body,preventDefault(){}});
    mission.node('checkBtn').click();transition=mission.checkpoint();
    assert(++missionSteps<60,'Warm-up can finish');
  }
  assert.equal(transition.mission.currentIndex,1);assert.equal(transition.mission.starsPerProblem.length,1);
  assert.equal(transition.sessionStats.problemsDone,1);
  assert.equal(mission.messages.filter(m=>m.event==='awardStars').length,1);
  const nextProblem=transition.mission.problems[1].problem;
  const assertNextMission=(blob,label)=>{
    assert.equal(blob.engine.phase,'divide',label+' restores an unfinished board');
    assert.deepEqual(blob.problem,nextProblem,label+' restores the next equation');
    assert.equal(blob.mission.currentIndex,1);assert.deepEqual(blob.mission.starsPerProblem,transition.mission.starsPerProblem);
    assert.equal(blob.sessionStats.problemsDone,1,label+' retains credit exactly once');
    assert.equal(blob.inputValue,'');assert.deepEqual(blob.history,[]);
    assert.equal(blob.attemptsThisStep,0);assert.equal(blob.attemptsThisProblem,0);
  };
  mission.send('goHome');const missionHome=mission.checkpoint();
  assert.deepEqual(missionHome.classicSession,transition,'Home retains the transition checkpoint');
  mission.node('ldc-continue-classic').click();assertNextMission(mission.checkpoint(),'Home Continue');
  assert.equal(mission.messages.filter(m=>m.event==='awardStars').length,1,'Home Continue cannot award the warm-up again');
  const missionReopened=harness(slug,{initialResume:transition});
  assert.deepEqual(missionReopened.checkpoint(),transition,'Save before Continue retains the transition checkpoint');
  continueSaved(missionReopened,slug);assertNextMission(missionReopened.checkpoint(),'Reopen Continue');
  assert(!missionReopened.messages.some(m=>m.event==='awardStars'),'Reopen cannot award the warm-up again');
  const missionHomeReopened=harness(slug,{initialResume:missionHome});
  continueSaved(missionHomeReopened,slug);missionHomeReopened.node('ldc-continue-classic').click();
  assertNextMission(missionHomeReopened.checkpoint(),'Reopened Home Continue');
  assert(!missionHomeReopened.messages.some(m=>m.event==='awardStars'),'Restored Home cannot award the warm-up again');
  assert.deepEqual([...h.errors,...child.errors,...reopened.errors,...reset.errors,...solved.errors,...classic.errors,...oldReopened.errors,...custom.errors,...mission.errors,...missionReopened.errors,...missionHomeReopened.errors],[]);
}
console.log('PASS complete startup, early/late profile binding, menu and active Save, staged Continue, exact draft reopening, Home, and standalone load for all three games.');
console.log('PASS Long Division actual-script profile isolation, draft/hint/mistake restore, accurate failed Save and retry, restore/suspend guards, and legacy classic compatibility.');
