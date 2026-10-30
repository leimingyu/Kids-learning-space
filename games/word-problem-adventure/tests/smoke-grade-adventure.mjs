/** Behavioral tests of the actual grade engine with an in-memory DOM/storage.
 * No browser profile or real save file is read or changed.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');
// Direct-file portability: every script/stylesheet is a resolvable local URL,
// with no module loader or runtime network operation in the new engine.
const html = source('index.html');
for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) {
  assert.ok(!/^(?:https?:|\/\/)/.test(match[1]), 'local dependency: ' + match[1]);
  assert.ok(existsSync(new URL(match[1], root)), 'asset exists: ' + match[1]);
}
for (const f of ['grade-bank.js','grade-core.js','grade-adventure.js']) {
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(source(f)), f + ' has no runtime network call');
}
class Node {
  constructor(tag, doc) { this.tag = tag; this.doc = doc; this.children = []; this.events = {}; this.attrs = {}; this.className = ''; this.disabled = false; }
  set textContent(t) { this.text = String(t); this.children = []; }
  get textContent() { return (this.text || '') + this.children.map(n => n.textContent).join(' '); }
  append(...nodes) { this.children.push(...nodes); }
  prepend(n) { this.children.unshift(n); }
  replaceChildren(...nodes) { this.text = ''; this.children = nodes; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, fn) { this.events[k] = fn; }
  focus() {} select() {} scrollIntoView() {}
  querySelector(selector) { return flatten(this).find(n => n.className.split(' ').includes(selector.slice(1))) || null; }
  fire(event) { assert.ok(!this.disabled, 'control is enabled'); this.events[event]?.({ preventDefault() {} }); }
}
function flatten(n) { return [n, ...n.children.flatMap(flatten)]; }
const plain = value => JSON.parse(JSON.stringify(value));
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function harness({ embedded = false, pid = null, seed = new Map() } = {}) {
  const data = new Map(seed), messages = [], handlers = {}, reads = [];
  const documentHandlers = {}, windowHandlers = {}, timers = new Map();
  let now = Date.UTC(2026, 9, 11, 12), nextTimer = 0;
  function setTimer(fn, delay = 0) {
    const id = ++nextTimer; timers.set(id, { at: now + Math.max(0, Number(delay) || 0), fn }); return id;
  }
  function tick(ms) {
    const end = now + ms;
    let iterations = 0;
    while (true) {
      const next = [...timers].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      assert.ok(++iterations < 10000, 'timer queue settles');
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = end;
  }
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  let profile = pid;
  let writeFailure = false;
  const storageErrors = new Map();
  const classes = new Set(['grade-mode']);
  const rootNode = new Node('main');
  const legacyButton = new Node('button');
  let legacyPending = null, legacyCurrent = null, legacyScreen = 'screen-welcome';
  let legacyContinues = 0, legacyHomeCalls = 0, legacyTimerActive = false;
  const legacy = {
    pending: () => legacyPending && plain(legacyPending),
    current: () => legacyCurrent && plain(legacyCurrent),
    get continues() { return legacyContinues; },
    get homeCalls() { return legacyHomeCalls; },
    get timerActive() { return legacyTimerActive; },
    setLive(blob, timerActive = false) {
      legacyPending = null; legacyCurrent = plain(blob); legacyScreen = blob.screen || 'screen-welcome';
      legacyTimerActive = timerActive;
    },
  };
  const doc = { hidden: false, visibilityState: 'visible',
    addEventListener(event, fn) { (documentHandlers[event] ||= []).push(fn); },
    body: { classList: { contains: n => classes.has(n), add: n => classes.add(n), remove: n => classes.delete(n) } },
    createElement: tag => new Node(tag), getElementById: id => id === 'grade-adventure' ? rootNode : id === 'btn-grade-home' ? legacyButton : flatten(rootNode).find(n => n.id === id) };
  const storage = { getItem(k) { reads.push(k); return data.get(k) ?? null; }, setItem(k,v) { if (writeFailure) throw new Error('quota'); data.set(k,String(v)); }, removeItem(k) { data.delete(k); }, key(i) { return [...data.keys()][i] ?? null; }, get length() { return data.size; } };
  const bridge = { getProfileId: () => profile, isEmbedded: () => embedded,
    assertCanWrite() {
      const journal = data.get('kls.restore.journal.v1');
      if (journal && JSON.parse(journal).phase === 'prepared') throw new Error('A restore is in progress.');
    },
    reportStorageError(e,k) { storageErrors.set(k,e.message); }, clearStorageError(k) { storageErrors.delete(k); },
    onProfileReady(fn) { if (profile) fn(profile); else (handlers.ready ||= []).push(fn); },
    onHubMessage(event, fn) { (handlers[event] ||= []).push(fn); },
    ...Object.fromEntries(['saveState', 'sticker', 'celebrate', 'played', 'session', 'stars', 'resetProgress'].map(k => [k, (...args) => messages.push([k,...args])])) };
  const context = vm.createContext({ console, document: doc, localStorage: storage, location: { reload() {}, hash: '' },
    KLS: { bridge, GAMES: [{ slug: 'word-problem-adventure', storageBase: ['wordProblemAdventure_v1','wordProblemAdventure_wrongs_v1'] }] },
    scrollTo() {},
    __wpa_resetForProfile() {
      legacyPending = null; legacyCurrent = null; legacyScreen = 'screen-welcome'; legacyTimerActive = false;
    },
    __wpa_getPendingResume() { return legacyPending && plain(legacyPending); },
    __wpa_setPendingResume(blob) { legacyPending = blob && plain(blob); },
    __wpa_captureState() {
      if (legacyPending && legacyScreen === 'screen-welcome') return plain(legacyPending);
      return legacyCurrent ? plain(legacyCurrent) : { v: 2, mode: 'journey', screen: 'screen-welcome', queue: [] };
    },
    __wpa_continueSaved() {
      if (!legacyPending) return;
      legacyContinues += 1; legacyCurrent = plain(legacyPending);
      legacyScreen = legacyCurrent.screen || 'screen-welcome'; legacyPending = null;
    },
    __wpa_goHome() {
      legacyHomeCalls += 1;
      if (legacyCurrent && legacyScreen === 'screen-game') legacyPending = plain(legacyCurrent);
      legacyScreen = 'screen-welcome'; legacyTimerActive = false;
    },
    addEventListener(event, fn) { (windowHandlers[event] ||= []).push(fn); },
    Date: ClockDate, setTimeout: setTimer, clearTimeout(id) { timers.delete(id); },
    FileReader: class { readAsText(f) { this.result = f.text; this.onload(); } } });
  context.window = context;
  for (const f of ['grade-bank.js','grade-core.js','grade-adventure.js']) vm.runInContext(source(f), context, { filename: f });
  const items = () => flatten(rootNode);
  const click = text => {
    const node = items().find(n => n.tag === 'button' && (typeof text === 'string' ? n.textContent === text : text.test(n.textContent)));
    assert.ok(node, 'button exists: ' + text); node.fire('click');
  };
  return { context, core: context.WPA_GradeCore, data, messages, reads, root: rootNode, items, click, tick, legacy,
    clickQuest(grade, number) {
      const quest = context.WPA_GradeCore.bank[grade].quests[number - 1];
      click(new RegExp(escapePattern(quest.title)));
    },
    setHidden(hidden) {
      doc.hidden = hidden; doc.visibilityState = hidden ? 'hidden' : 'visible';
      for (const fn of documentHandlers.visibilitychange || []) fn();
    },
    pagehide() { for (const fn of windowHandlers.pagehide || []) fn(); },
    pageshow() { for (const fn of windowHandlers.pageshow || []) fn(); },
    storageErrors, failWrites(on) { writeFailure = on; },
    submit(answer) { doc.getElementById('ga-answer').value = String(answer); items().find(n => n.tag === 'form').fire('submit'); },
    bind(id) { profile = id; for (const fn of handlers.ready || []) fn(id); for (const fn of handlers.setProfile || []) fn({profileId:id}); },
    event(name, payload) { for (const fn of handlers[name] || []) fn(payload); },
    main(id = profile) { return JSON.parse(data.get('wordProblemAdventure_v1' + (id ? '__' + id : '')) || '{}'); },
    wrongs(id = profile) { return JSON.parse(data.get('wordProblemAdventure_wrongs_v1' + (id ? '__' + id : '')) || '{}'); },
  };
}

function liveSession(h) { return h.context.WPA_GradeAdventure.capture().session; }
function answerCurrent(h) {
  const current = liveSession(h);
  h.submit(h.core.questions[current.ids[current.index]].answerText);
  h.tick(2000);
}
function completeQuest(h) {
  const current = liveSession(h);
  for (let index = current.index; index < current.ids.length; index++) answerCurrent(h);
}

const h = harness();
const C = h.core;
assert.equal(Object.keys(C.questions).length, 400);
for (const g of [2,3,4,5]) {
  assert.equal(C.bank[g].questions.length, 100);
  assert.equal(C.bank[g].quests.length, 20);
  assert.equal(new Set(C.bank[g].quests.flatMap(q => q.ids)).size, 100);
  for (const q of C.bank[g].questions) assert.ok(C.correct(q, C.parseAnswer(q.answerText)), q.id + ' answer accepted');
}
for (const raw of ['', ' ', '1/0','2 cats','1/2/3','1e3','Infinity','-2']) assert.equal(C.parseAnswer(raw), null, raw);
assert.equal(C.parseAnswer('1 3/4'), 1.75);
assert.equal(C.parseAnswer(' 6 / 8 '), .75);
assert.equal(C.parseAnswer('.5'), .5);
assert.ok(C.correct(C.questions['wpa-g5-011'], C.parseAnswer('10/12')), 'equivalent fraction');
assert.ok(!C.correct(C.questions['wpa-g5-011'], .83), 'rounded guess is not exact');

// Ten consecutive kingdoms explain the whole 100-story path. Completion and
// independent mastery are different: exploring or missing a story cannot unlock
// a kingdom, while a corrected answer can finish the story without earning a star.
for (const grade of [2,3,4,5]) {
  const kingdoms = C.kingdoms(grade);
  assert.equal(kingdoms.length,10,'ten kingdoms in Grade ' + grade);
  assert.equal(new Set(kingdoms.map(k=>k.name)).size,10,'kingdom names distinguish the levels');
  assert.equal(new Set(kingdoms.flatMap(k=>k.ids)).size,100,'all 100 stories belong to one kingdom');
  kingdoms.forEach((k,index)=>{
    assert.equal(k.number,index+1);
    assert.ok(k.name && k.icon,'kingdom has a child-readable identity');
    assert.equal(k.ids.length,10,'each level has ten visible story steps');
    assert.equal(k.quests.length,2,'each level contains two five-story quests');
    assert.deepEqual(plain(k.ids),plain(C.bank[grade].quests.slice(index*2,index*2+2).flatMap(q=>q.ids)),'consecutive quests stay in story order');
  });
  const emptyJourney = C.journey(C.empty(),grade);
  assert.equal(emptyJourney.completedCount,0);
  assert.equal(emptyJourney.current.number,1);
  assert.equal(emptyJourney.complete,false);
  assert.ok(emptyJourney.kingdoms[0].unlocked);
  assert.ok(emptyJourney.kingdoms.slice(1).every(k=>!k.unlocked),'future kingdoms start locked');
  assert.ok(emptyJourney.kingdoms.every(k=>k.stars===0 && k.independentCount===0));
  const seen = C.normalize({grades:{[grade]:{seen:C.bank[grade].questions.map(q=>q.id)}}});
  assert.equal(C.journey(seen,grade).completedCount,0,'seen alone never completes a story');
  assert.equal(C.nextQuest(seen,grade).id,C.bank[grade].quests[0].id,'missed stories are still next');
  for (const finished of [10,20,100]) {
    const completed = kingdoms.flatMap(k=>k.ids).slice(0,finished);
    const state = C.normalize({grades:{[grade]:{completed,solved:completed.slice(0,3)}}});
    const journey = C.journey(state,grade);
    assert.equal(journey.completedCount,finished,'unique completed story count');
    assert.equal(journey.kingdoms.filter(k=>k.complete).length,finished/10,'a level completes at ten stories');
    assert.equal(journey.kingdoms[0].independentCount,3,'corrected work does not inflate independent mastery');
    if (finished<100) {
      assert.equal(journey.current.number,finished/10+1);
      assert.ok(journey.current.unlocked,'the next kingdom unlocks immediately');
      assert.ok(journey.kingdoms.slice(finished/10+1).every(k=>!k.unlocked));
      assert.equal(C.nextQuest(state,grade).id,C.bank[grade].quests[finished/5].id,'next quest stays in the current kingdom');
    } else {
      assert.equal(journey.current,null);
      assert.ok(journey.complete);
      assert.equal(C.nextQuest(state,grade),null,'finishing 100 stories never silently restarts the first quest');
    }
  }
}

// Additive normalization preserves old progress, deduplicates completed IDs, and
// treats an unfinished legacy checkpoint as evidence only for its passed prefix.
const firstGradeIds = C.bank[2].quests.flatMap(q=>q.ids);
const inferredSolved = C.normalize({grades:{2:{solved:[firstGradeIds[0]],seen:firstGradeIds}}});
assert.equal(C.journey(inferredSolved,2).completedCount,1,'old independent solves retain completion');
const inferredQuest = C.normalize({grades:{2:{questStars:{[C.bank[2].quests[0].id]:1}}}});
assert.equal(C.journey(inferredQuest,2).completedCount,5,'old positive quest stars retain a finished quest');
const zeroQuest = C.normalize({grades:{2:{questStars:{[C.bank[2].quests[0].id]:0}}}});
assert.equal(C.journey(zeroQuest,2).completedCount,0,'zero stars alone are not completion evidence');
const prefix = C.normalize({resume:{grade:2,mode:'quest',questId:C.bank[2].quests[0].id,ids:C.bank[2].quests[0].ids,index:2,attempts:1,helped:true,draft:'7'}});
assert.equal(C.journey(prefix,2).completedCount,2,'an old in-progress quest keeps its finished prefix');
assert.equal(C.journey(prefix,2).kingdoms[0].independentCount,0,'old prefix does not invent independent stars');
const oldAnswered = C.normalize({resume:{...prefix.resume,answered:true}});
assert.equal(C.journey(oldAnswered,2).completedCount,3,'an old correct answered checkpoint retains the current completion');
const oldRevealed = C.normalize({resume:{...prefix.resume,answered:true,revealed:true}});
assert.equal(C.journey(oldRevealed,2).completedCount,2,'an old revealed checkpoint does not invent an unconfirmed completion');
const duplicateCompletion = C.normalize({grades:{2:{completed:[firstGradeIds[0],firstGradeIds[0],'missing',C.bank[3].quests[0].ids[0]]}}});
assert.equal(C.journey(duplicateCompletion,2).completedCount,1,'invalid and duplicate completion IDs are discarded');
const resumeQuest = C.questSession(prefix,2,C.bank[2].quests[0].id);
assert.deepEqual(plain(resumeQuest),plain(prefix.resume),'same unfinished quest preserves the exact saved question and flags');
const incompleteWithoutCheckpoint = C.normalize({grades:{2:{completed:firstGradeIds.slice(0,2),solved:[firstGradeIds[0]]}},resume:{grade:2,mode:'practice',ids:[firstGradeIds[2]],index:0}});
const resumedPrefix = C.questSession(incompleteWithoutCheckpoint,2,C.bank[2].quests[0].id);
assert.equal(resumedPrefix.index,2,'practice replacement never sends the child back through completed questions');
assert.equal(resumedPrefix.clean,1,'continued summary retains earlier independent work');
assert.deepEqual(plain(resumedPrefix.ids),plain(C.bank[2].quests[0].ids),'continuation retains the full stable quest IDs');
const replayQuest = C.questSession(inferredQuest,2,C.bank[2].quests[0].id);
assert.equal(replayQuest.index,0,'explicitly selecting a finished quest allows replay');
assert.equal(replayQuest.clean,0,'replay starts a fresh scoring attempt');
assert.equal(C.questSession(prefix,2,'missing'),null,'unrecognized quest cannot start');
const allStars = C.normalize({grades:{2:{completed:firstGradeIds.slice(0,10),questStars:{[C.bank[2].quests[0].id]:3,[C.bank[2].quests[1].id]:2}}}});
assert.equal(C.journey(allStars,2).kingdoms[0].stars,5,'kingdom status sums the two quest rewards out of six');

// The home map shows all ten levels, one ten-step current-level meter, and the
// star/badge totals. The active story retains that level meter while solving.
const map = harness();
const hasClass = (node,cls) => node.className.split(' ').includes(cls);
for (const grade of [2,3,4,5]) {
  map.click(new RegExp('^Grade ' + grade + ' '));
  const cards = map.items().filter(n=>hasClass(n,'ga-kingdom'));
  assert.equal(cards.length,10,'ten visible level cards for Grade ' + grade);
  cards.forEach((card,index)=>{
    assert.ok(card.textContent.startsWith('Level ' + (index+1) + ' · '),'each card names its level');
    const meter = flatten(card).find(n=>n.tag==='progress');
    assert.ok(meter,'each level shows a status bar');
    assert.equal(meter.max,10); assert.equal(meter.value,0);
    assert.equal(card.disabled,index!==0,'only the first level starts unlocked');
  });
  const currentStatus = map.items().find(n=>hasClass(n,'ga-status'));
  assert.ok(currentStatus,'large current-level status is present');
  assert.equal(flatten(currentStatus).filter(n=>hasClass(n,'ga-segment')).length,10,'current level has ten visible story steps');
  assert.ok(map.items().some(n=>hasClass(n,'ga-status-count')),'current progress has a prominent count');
  assert.ok(map.items().some(n=>hasClass(n,'ga-status-stats')),'star and badge totals are present');
  const questCards = map.items().filter(n=>hasClass(n,'ga-quest'));
  assert.equal(questCards.length,20,'the replay picker preserves all twenty quests');
  assert.ok(questCards.every((card,index)=>card.disabled===(index>1)),'only the two quests of an unlocked level can be selected');
}
map.click(/^Grade 2 /); map.click('▶ Start my first quest');
const questionStatus = map.items().find(n=>hasClass(n,'ga-session-progress'));
assert.ok(questionStatus,'question screen keeps the kingdom progress visible');
assert.equal(flatten(questionStatus).filter(n=>hasClass(n,'ga-segment')).length,10);

// Every account enters the current edition. An old journey/practice/daily hub
// checkpoint must remain an explicit option, never choose the visible edition.
function assertLatestEntry(account, label) {
  assert.ok(account.context.WPA_GradeAdventure.active(), label + ': current edition is active');
  assert.equal(account.root.hidden,false,label + ': current homepage is visible');
  assert.ok(account.root.textContent.includes('Small stories. Big thinking.'),label + ': latest homepage opens');
  assert.equal(account.items().filter(n=>hasClass(n,'ga-kingdom')).length,10,label + ': all ten kingdom levels are present');
}
function earlierCheckpoint(version, mode) {
  return {
    v: version, mode, screen: 'screen-game', selectedLevel: 'medium',
    selectedSessionLabel: 'Dad unfinished stories', selectedSessionWasFull: false,
    queue: [{id:'m001'},{id:'m002',sessionLevel:'medium'},{id:'m003'}],
    questionIndex:1, questionsCompleted:1, firstTryCorrect:0, correctCount:1,
    attemptedCount:3, wrongSubmitsOnQuestion:2, hintUsedOnQuestion:true,
    answerState:'hint', draft:'6', pictureVisible:true, practiceType:'Compare',
    dailyPracticeOnly:true, ui:{'sum-score':{text:'1 / 3',display:''}},
    opaqueEarlierField:{neverRewrite:['older data',null,{extra:true}]},
  };
}
const freshEdition = harness({embedded:true,pid:'fresh-account'});
assertLatestEntry(freshEdition,'fresh account');
assert.equal(freshEdition.legacy.pending(),null,'fresh account has no inherited earlier checkpoint');
assert.equal(freshEdition.legacy.continues,0,'fresh account never auto-continues an earlier game');
const freshEditionBefore = plain(freshEdition.context.WPA_GradeAdventure.capture());
assert.equal(freshEditionBefore.earlierAdventure,null,'fresh Save has no earlier adventure');

for (const version of [1,2]) for (const mode of ['journey','practice','daily']) {
  const id = 'dad-' + version + '-' + mode, blob = earlierCheckpoint(version,mode);
  const main = {journey:{lessons:{old:{stars:3,completedAt:'2026-09-28T12:00:00.000Z'}}},bestStreakEver:17};
  const account = harness({embedded:true,pid:id,seed:new Map([['wordProblemAdventure_v1__'+id,JSON.stringify(main)]])});
  account.event('resumeState',{state:plain(blob)});
  assertLatestEntry(account,id + ' old checkpoint');
  assert.equal(account.legacy.continues,0,'old hub push never starts play: ' + id);
  assert.deepEqual(account.legacy.pending(),blob,'older checkpoint is offered unchanged: ' + id);
  assert.ok(account.items().some(n=>n.tag==='button' && n.textContent==='Continue earlier adventure'),'latest home offers the old session: ' + id);
  const saved = plain(account.context.WPA_GradeAdventure.capture());
  assert.equal(saved.mode,'grade-adventure','Save uses the edition-neutral current wrapper: ' + id);
  assert.equal(saved.v,2,'checkpoint wrapper remains version 2: ' + id);
  assert.deepEqual(saved.earlierAdventure,blob,'Save before Continue retains every opaque old field: ' + id);
  assert.deepEqual(account.main().earlierAdventureCheckpoint,blob,'old checkpoint is in the registered profile store: ' + id);
  assert.deepEqual(account.main().journey,main.journey,'old lessons remain intact: ' + id);
  assert.equal(account.main().bestStreakEver,17,'old personal best remains intact: ' + id);
  account.context.WPA_GradeAdventure.home();
  assertLatestEntry(account,id + ' Home');
  assert.deepEqual(plain(account.context.WPA_GradeAdventure.capture()).earlierAdventure,blob,'Home + Save cannot replace old draft: ' + id);

  const fromMain = harness({embedded:true,pid:id,seed:account.data});
  assertLatestEntry(fromMain,id + ' profile-store reload');
  assert.deepEqual(fromMain.legacy.pending(),blob,'main-store reload restores the same pending older session: ' + id);
  const fromHub = harness({embedded:true,pid:id});
  fromHub.event('resumeState',{state:saved});
  assertLatestEntry(fromHub,id + ' combined hub reload');
  assert.deepEqual(plain(fromHub.context.WPA_GradeAdventure.capture()).earlierAdventure,blob,'new wrapper reload preserves the earlier session: ' + id);
  fromHub.click('Continue earlier adventure');
  assert.equal(fromHub.context.WPA_GradeAdventure.active(),false,'only an explicit click opens the earlier edition: ' + id);
  assert.equal(fromHub.legacy.continues,1,'explicit Continue restores exactly once: ' + id);
  assert.deepEqual(fromHub.legacy.current(),blob,'explicit Continue restores all checkpoint values: ' + id);
  const advanced = {...plain(blob),questionIndex:2,questionsCompleted:2,draft:'14',opaqueEarlierField:{advanced:true}};
  fromHub.legacy.setLive(advanced,true);
  assert.deepEqual(plain(fromHub.context.WPA_GradeAdventure.capture()).earlierAdventure,advanced,'Save in the earlier game captures the live session: ' + id);
  fromHub.context.WPA_GradeAdventure.home();
  assertLatestEntry(fromHub,id + ' return from earlier game');
  assert.equal(fromHub.legacy.timerActive,false,'returning to current home stops earlier-game timers: ' + id);
  assert.deepEqual(plain(fromHub.context.WPA_GradeAdventure.capture()).earlierAdventure,advanced,'current Home keeps the advanced older draft: ' + id);
  const again = harness({embedded:true,pid:id,seed:fromHub.data});
  assertLatestEntry(again,id + ' reopen after earlier play');
  assert.deepEqual(again.legacy.pending(),advanced,'reopening preserves advanced old progress: ' + id);
}

// A profile can have both editions' unfinished sessions. Latest grade progress
// and older opaque checkpoints survive Save/reload independently.
const twoEditions = harness({embedded:true,pid:'both-editions'});
const twoEarlier = earlierCheckpoint(2,'journey');
twoEditions.event('resumeState',{state:twoEarlier});
twoEditions.click('▶ Start my first quest');
twoEditions.submit('11'); twoEditions.click('💡 A clue, please');
const twoInput = twoEditions.items().find(n=>n.id==='ga-answer'); twoInput.value='7'; twoInput.fire('input');
const twoGrade = plain(liveSession(twoEditions));
twoEditions.click('🏠 Home');
const combined = plain(twoEditions.context.WPA_GradeAdventure.capture());
assert.deepEqual(combined.session,twoGrade,'grade checkpoint retains draft and fairness flags');
assert.deepEqual(combined.earlierAdventure,twoEarlier,'playing the grade edition does not replace the earlier checkpoint');
const bmoney = harness({embedded:true,pid:'both-editions',seed:twoEditions.data});
bmoney.event('resumeState',{state:combined});
assertLatestEntry(bmoney,'B money grade checkpoint');
assert.deepEqual(plain(bmoney.context.WPA_GradeAdventure.capture()).session,twoGrade,'grade hub push keeps the unfinished current-edition story');
assert.deepEqual(plain(bmoney.context.WPA_GradeAdventure.capture()).earlierAdventure,twoEarlier,'grade hub push keeps the older unfinished session');
bmoney.click('Continue earlier adventure');
bmoney.context.WPA_GradeAdventure.home();
bmoney.click('Continue saved Grade 2 session');
assert.deepEqual(plain(liveSession(bmoney)),twoGrade,'playing the earlier edition does not replace the grade draft or help flags');
bmoney.context.WPA_GradeAdventure.home();
bmoney.click('Continue earlier adventure');
bmoney.legacy.setLive(twoEarlier,true);
bmoney.context.WPA_GradeAdventure.capture(); // The real hub flushes before switching profiles.
const bmoneyBefore = bmoney.data.get('wordProblemAdventure_v1__both-editions');
bmoney.bind('new-account');
assertLatestEntry(bmoney,'new profile after older profile');
assert.equal(bmoney.legacy.pending(),null,'profile switching clears the previous profile in-memory checkpoint');
assert.equal(bmoney.legacy.current(),null,'profile switching clears the previous live earlier session');
assert.equal(bmoney.legacy.timerActive,false,'profile switching stops the earlier game timer');
assert.equal(plain(bmoney.context.WPA_GradeAdventure.capture()).earlierAdventure,null,'fresh profile does not inherit older sessions');
assert.equal(plain(bmoney.context.WPA_GradeAdventure.capture()).session,null,'fresh profile does not inherit grade sessions');
assert.equal(bmoney.data.get('wordProblemAdventure_v1__both-editions'),bmoneyBefore,'switching does not overwrite the previous profile');
bmoney.bind('both-editions');
assertLatestEntry(bmoney,'returning profile');
assert.deepEqual(bmoney.legacy.pending(),twoEarlier,'returning to the same profile restores its own older checkpoint');
bmoney.click('Reset my progress'); bmoney.click('Yes, reset my progress');
assertLatestEntry(bmoney,'reset profile');
assert.equal(bmoney.legacy.pending(),null,'reset clears runtime earlier session');
assert.equal(bmoney.legacy.current(),null,'reset clears hidden live earlier session');
assert.equal(plain(bmoney.context.WPA_GradeAdventure.capture()).earlierAdventure,null,'Save after reset cannot recreate the old checkpoint');
assert.ok(!bmoney.items().some(n=>n.tag==='button' && n.textContent==='Continue earlier adventure'),'reset removes the earlier Continue offer');
assert.equal(bmoney.data.has('wordProblemAdventure_v1__both-editions'),false,'reset clears the registered profile store');

// Next quest resumes the actual unfinished question. It keeps drafts, failed
// attempts, and hints, including after reload and when selecting the same card.
const nextResume = harness({embedded:true,pid:'journey-child'});
nextResume.click('▶ Start my first quest'); answerCurrent(nextResume);
nextResume.submit('999'); nextResume.click('💡 A clue, please');
const nextInput = nextResume.items().find(n=>n.id==='ga-answer');
nextInput.value='7'; nextInput.fire('input');
const nextExpected = plain(liveSession(nextResume));
assert.equal(nextExpected.index,1); assert.equal(nextExpected.attempts,1); assert.ok(nextExpected.helped);
nextResume.click('🏠 Home'); nextResume.click('▶ Next quest');
assert.deepEqual(plain(liveSession(nextResume)),nextExpected,'Home → Next quest preserves exact draft and fairness flags');
assert.equal(nextResume.items().find(n=>n.id==='ga-answer').value,'7');
nextResume.click('🏠 Home'); nextResume.clickQuest(2,1);
assert.deepEqual(plain(liveSession(nextResume)),nextExpected,'choosing the same unfinished quest continues it');
nextResume.click('🏠 Home');
const nextReload = harness({embedded:true,pid:'journey-child',seed:nextResume.data});
nextReload.click('▶ Next quest');
assert.deepEqual(plain(liveSession(nextReload)),nextExpected,'reload → Next quest preserves exact checkpoint');
nextReload.submit(nextReload.core.questions[nextExpected.ids[1]].answerText);
assert.equal(nextReload.main().gradeAdventure.grades[2].completed.length,2,'corrected answer finishes its story');
assert.equal(nextReload.main().gradeAdventure.grades[2].solved.length,1,'resume cannot erase prior help to earn a mastery solve');

// Practice can replace the single live checkpoint. The persistent completion
// ledger still skips passed story IDs instead of repeating the quest beginning.
const afterPractice = harness(); afterPractice.click('▶ Start my first quest');
answerCurrent(afterPractice); answerCurrent(afterPractice); afterPractice.submit('999');
afterPractice.click('🏠 Home'); afterPractice.click('🎯 Practice tricky stories (1)');
assert.equal(liveSession(afterPractice).mode,'practice');
afterPractice.click('🏠 Home'); afterPractice.click('▶ Next quest');
assert.equal(liveSession(afterPractice).index,2,'Next quest finds the unfinished story after practice replaces the checkpoint');
assert.equal(liveSession(afterPractice).ids.length,5,'continued quest retains stable five-story scoring context');
assert.equal(afterPractice.main().gradeAdventure.grades[2].completed.length,2);

// Home during a success celebration already has a completed story. Next quest
// moves on from it once without grading it again or running a stale timer.
const answeredNext = harness(); answeredNext.click('▶ Start my first quest');
answeredNext.submit('12'); answeredNext.tick(500); answeredNext.click('🏠 Home');
const answeredAwards = answeredNext.messages.filter(m=>['sticker','celebrate'].includes(m[0])).length;
answeredNext.click('▶ Next quest');
assert.equal(liveSession(answeredNext).index,1,'Next quest moves beyond the already-correct answer');
answeredNext.tick(10000);
assert.equal(liveSession(answeredNext).index,1,'old celebration cannot skip the next unanswered story');
assert.equal(answeredNext.messages.filter(m=>['sticker','celebrate'].includes(m[0])).length,answeredAwards,'Next quest does not re-award or re-celebrate an answered story');
assert.equal(answeredNext.main().gradeAdventure.grades[2].completed.length,1);

// The final correct answer finishes its story before the celebration timer
// settles the quest reward. Home → Next must retain those earned stars once.
const pendingReward = harness(); pendingReward.click('▶ Start my first quest');
for (let i=0;i<4;i++) answerCurrent(pendingReward);
pendingReward.submit(pendingReward.core.questions[liveSession(pendingReward).ids[4]].answerText);
assert.equal(pendingReward.main().gradeAdventure.grades[2].questStars[C.bank[2].quests[0].id],3,'last correct answer settles quest stars before the celebration timer');
const pendingRewardCheckpoint = plain(liveSession(pendingReward));
assert.ok(pendingRewardCheckpoint.rewarded); assert.equal(pendingRewardCheckpoint.stars,3);
const rewardedReload = harness({seed:pendingReward.data});
rewardedReload.click('Continue saved Grade 2 session'); rewardedReload.tick(2000);
assert.equal(rewardedReload.messages.filter(m=>m[0]==='stars').length,0,'Continue of a rewarded final answer does not repeat stars');
assert.equal(rewardedReload.messages.filter(m=>m[0]==='session').length,0,'Continue of a rewarded final answer does not repeat statistics');
pendingReward.click('🏠 Home'); pendingReward.click('▶ Next quest');
assert.equal(pendingReward.main().gradeAdventure.grades[2].questStars[C.bank[2].quests[0].id],3,'Home → Next settles the finished quest reward before replacing its checkpoint');
assert.equal(pendingReward.messages.filter(m=>m[0]==='stars').length,1,'pending quest stars are awarded once');
assert.equal(pendingReward.messages.filter(m=>m[0]==='session').length,1,'pending quest summary statistics are recorded once');
pendingReward.tick(10000);
assert.equal(pendingReward.messages.filter(m=>m[0]==='stars').length,1,'the cancelled old timer cannot award pending stars twice');
const finalGradeSeed = C.normalize({grades:{2:{completed:firstGradeIds.slice(0,99),solved:firstGradeIds.slice(0,99),questStars:Object.fromEntries(C.bank[2].quests.slice(0,19).map(q=>[q.id,3]))}}});
const pendingFinal = harness({seed:new Map([['wordProblemAdventure_v1',JSON.stringify({gradeAdventure:finalGradeSeed})]])});
pendingFinal.clickQuest(2,20);
assert.equal(liveSession(pendingFinal).index,4,'old progress continues at the final unfinished story');
pendingFinal.submit(pendingFinal.core.questions[firstGradeIds[99]].answerText);
pendingFinal.click('🏠 Home'); pendingFinal.click('Practice & replay');
assert.equal(pendingFinal.main().gradeAdventure.grades[2].questStars[C.bank[2].quests[19].id],3,'final-grade Home settles earned stars even when there is no next quest');
assert.ok(pendingFinal.root.textContent.includes('Small stories. Big thinking.'),'finishing the last grade story keeps Home visible instead of auto-replaying it');
assert.ok(!pendingFinal.items().some(n=>n.tag==='form'),'Practice & replay opens choices without starting an answer form');
assert.equal(pendingFinal.messages.filter(m=>m[0]==='stars').length,1);

// An earlier-version checkpoint can contain the correct final answer while its
// quest reward is still waiting on the old timer. Next retains that earned work.
const legacyPending = {...pendingRewardCheckpoint}; delete legacyPending.rewarded; delete legacyPending.stars;
const legacyPendingState = {selectedGrade:2,grades:{2:{solved:firstGradeIds.slice(0,5),seen:firstGradeIds.slice(0,5)}},resume:legacyPending};
const legacyPendingReload = harness({seed:new Map([['wordProblemAdventure_v1',JSON.stringify({gradeAdventure:legacyPendingState})]])});
legacyPendingReload.click('▶ Next quest');
assert.equal(legacyPendingReload.main().gradeAdventure.grades[2].questStars[C.bank[2].quests[0].id],3,'Next quest settles an earlier-version answered final checkpoint');
assert.equal(legacyPendingReload.messages.filter(m=>m[0]==='stars').length,1);

// Level boundaries are explicit: the first quest leads to the second quest,
// then ten completed stories unlock the next kingdom and retain all progress.
const boundaries = harness(); boundaries.click('▶ Start my first quest'); completeQuest(boundaries);
assert.ok(boundaries.items().some(n=>n.tag==='button' && n.textContent==='Next quest →'));
boundaries.click('Next quest →');
assert.equal(liveSession(boundaries).questId,C.bank[2].quests[1].id);
completeQuest(boundaries);
assert.ok(boundaries.items().some(n=>n.tag==='button' && n.textContent==='Next kingdom →'),'level completion calls out the next kingdom');
boundaries.click('Next kingdom →');
assert.equal(liveSession(boundaries).questId,C.bank[2].quests[2].id,'new kingdom begins at the next unseen quest');
assert.equal(liveSession(boundaries).index,0);
boundaries.click('🏠 Home');
const boundaryCards = boundaries.items().filter(n=>hasClass(n,'ga-kingdom'));
assert.equal(boundaryCards[0].disabled,false); assert.equal(boundaryCards[1].disabled,false); assert.equal(boundaryCards[2].disabled,true);
assert.equal(flatten(boundaryCards[0]).find(n=>n.tag==='progress').value,10,'completed level retains a full status bar');
assert.equal(flatten(boundaryCards[1]).find(n=>n.tag==='progress').value,0,'next level starts with its own clear status bar');

// Complete every real quest through form handlers. Every question is reachable;
// all 24 milestone IDs are unique, and hub stars never exceed 3 per quest.
for (const grade of [2,3,4,5]) {
  h.click(new RegExp('^Grade ' + grade + ' '));
  for (const quest of C.bank[grade].quests) {
    h.clickQuest(grade,C.bank[grade].quests.indexOf(quest)+1);
    for (let i = 0; i < quest.ids.length; i++) {
      const q = C.questions[quest.ids[i]];
      assert.ok(h.root.textContent.includes(q.text));
      h.submit(q.answerText);
      assert.ok(h.root.textContent.includes('🎉 You solved it!'), q.id);
      assert.ok(!h.items().some(n => n.tag === 'textarea'), 'no thinking-space textarea: ' + q.id);
      h.tick(2000);
    }
    h.click('🏠 Home & badges');
  }
  assert.equal(h.main().gradeAdventure.grades[grade].solved.length, 100);
  assert.equal(h.main().gradeAdventure.grades[grade].completed.length,100);
  assert.ok(h.root.textContent.includes('All 100 solved on your own'));
  assert.ok(h.items().some(n=>n.tag==='button' && n.textContent==='Practice & replay'),'completed grade offers an explicit replay choice');
  assert.ok(!h.items().some(n=>n.tag==='button' && n.textContent==='▶ Next quest'),'completed grade does not offer an automatic restart');
  h.click('Practice & replay');
  assert.equal(liveSession(h),null,'Practice & replay opens the picker without silently starting a solved story');
}
assert.equal(h.messages.filter(m => m[0] === 'sticker').length, 24);
assert.equal(new Set(h.messages.filter(m => m[0] === 'sticker').map(m => m[1])).size, 24);
assert.equal(h.messages.filter(m => m[0] === 'stars').length, 80);
assert.ok(h.messages.filter(m => m[0] === 'stars').every(m => m[2] === 3));
assert.ok(h.messages.filter(m => m[0] === 'session').every(m => m[2].accuracy === 100), 'hub accuracy uses percentages');
h.clickQuest(5,1); h.submit('1640');
assert.equal(h.main().gradeAdventure.grades[5].solved.length, 100, 'repeat cannot inflate solved count');
assert.equal(h.main().gradeAdventure.grades[5].completed.length,100,'intentional replay cannot inflate completed count');
assert.equal(h.messages.filter(m => m[0] === 'sticker').length, 24, 'no repeat badges');

// Profile gate, legacy preservation, wrong/correct/remediation, and saved help.
const seed = new Map([['wordProblemAdventure_v1', JSON.stringify({gradeAdventure:h.main().gradeAdventure})],
  ['wordProblemAdventure_v1__alice', JSON.stringify({journey:{lessons:{old:{stars:3}}},bestStreakEver:17})]]);
const a = harness({ embedded:true, seed });
assert.equal(a.reads.length, 0, 'no standalone reads before profile handshake');
a.bind('alice');
assert.ok(a.root.textContent.includes('0 / 100 solved'), 'no inherited standalone progress');
a.click('▶ Start my first quest');
a.submit(''); assert.equal(a.core.practiceIds(a.wrongs(),2).length,0,'invalid input is not a miss');
a.submit('11'); a.submit('10');
assert.equal(a.core.practiceIds(a.wrongs(),2).length,1,'deduplicated mistake');
assert.equal(Object.values(a.wrongs().byType)[0][0].missCount,2);
a.submit('12');
assert.equal(a.main().gradeAdventure.grades[2].solved.length,0,'corrected answer is not independent');
assert.equal(a.main().journey.lessons.old.stars,3,'legacy fields preserved');
a.tick(2000);
assert.equal(a.main().gradeAdventure.resume.index,1,'correcting a miss also moves automatically');
a.click('🏠 Home'); a.click('🎯 Practice tricky stories (1)'); a.submit('12');
assert.ok(a.root.textContent.includes('Your practice progress in 2 seconds…'));
a.tick(1999); assert.ok(!a.main().gradeAdventure.grades[2].practiceSessions,'practice waits for the full celebration');
a.tick(1);
assert.equal(a.main().gradeAdventure.grades[2].solved.length,1);
assert.equal(a.main().gradeAdventure.grades[2].practiceSessions,1);
assert.equal(a.core.practiceIds(a.wrongs(),2).length,0);
assert.equal(a.messages.filter(m=>m[0]==='stars').length,0,'practice does not award quest stars');
a.click('🏠 Home & badges'); a.clickQuest(2,2); a.click('💡 A clue, please');
const reloaded = harness({embedded:true,pid:'alice',seed:a.data});
reloaded.click('Continue saved Grade 2 session'); reloaded.submit('8');
assert.equal(reloaded.main().gradeAdventure.grades[2].solved.length,1,'hint status survives reload');
assert.equal(reloaded.core.practiceIds(reloaded.wrongs(),2).length,1,'helped story available for practice');
reloaded.tick(2000); reloaded.click('Show me the steps');
assert.equal(reloaded.main().gradeAdventure.grades[2].solved.length,1,'reveal cannot earn mastery');
assert.ok(reloaded.main().gradeAdventure.resume.revealed);
const aliceBefore = reloaded.data.get('wordProblemAdventure_v1__alice');
reloaded.bind('bob');
assert.ok(reloaded.root.textContent.includes('0 / 100 solved'));
assert.equal(reloaded.core.practiceIds(reloaded.wrongs(),2).length,0);
reloaded.click('▶ Start my first quest'); reloaded.submit('12'); reloaded.click('🏠 Home');
reloaded.click('Reset my progress'); reloaded.click('Yes, reset my progress');
assert.equal(reloaded.data.has('wordProblemAdventure_v1__bob'),false);
assert.equal(reloaded.data.get('wordProblemAdventure_v1__alice'),aliceBefore,'reset leaves other profile intact');
assert.equal(reloaded.data.get('wordProblemAdventure_v1'),seed.get('wordProblemAdventure_v1'),'standalone untouched');
assert.ok(reloaded.messages.some(m=>m[0]==='resetProgress'));

// A hub checkpoint carries the exact live draft. Earlier notes-containing
// checkpoints still load, without rendering the removed thinking-space UI.
// Resume pushes only offer Continue, and a quota error stays visible until retry.
const live = harness({embedded:true,pid:'checkpoint-child'});
live.click('▶ Start my first quest');
const liveInput = live.items().find(n=>n.id==='ga-answer');
liveInput.value='1'; liveInput.fire('input');
const checkpoint = live.context.WPA_GradeAdventure.capture();
assert.equal(checkpoint.v,2);assert.equal(checkpoint.session.draft,'1');
checkpoint.session.notes='Draw 7 dots and 5 dots'; // A checkpoint from the previous UI.
const restoredLive = harness({embedded:true,pid:'checkpoint-child',seed:live.data});
restoredLive.event('resumeState',{state:checkpoint});
assert.ok(restoredLive.root.textContent.includes('Small stories. Big thinking.'),'hub push does not auto-start');
restoredLive.click('Continue saved Grade 2 session');
assert.equal(restoredLive.items().find(n=>n.id==='ga-answer').value,'1');
assert.ok(!restoredLive.items().some(n=>n.tag==='textarea'));
assert.ok(!restoredLive.root.textContent.includes('My thinking space'));
assert.equal(restoredLive.context.WPA_GradeAdventure.capture().session.notes,'Draw 7 dots and 5 dots','old notes remain compatible');
live.failWrites(true);live.submit('11');
assert.ok(live.storageErrors.has('wordProblemAdventure_v1__checkpoint-child'));
assert.ok(live.storageErrors.has('wordProblemAdventure_wrongs_v1__checkpoint-child'));
live.failWrites(false);live.context.WPA_GradeAdventure.capture();
assert.equal(live.storageErrors.size,0,'Save retries both failed values');
assert.equal(live.main().gradeAdventure.resume.attempts,1);

// Correct submitted answers celebrate before a deterministic two-second move.
// Typing alone does not grade, and Save observes the live timer without restarting it.
const timed = harness({embedded:true,pid:'timer-child'});
timed.click('▶ Start my first quest');
const typed = timed.items().find(n=>n.id==='ga-answer');
typed.value='12'; typed.fire('input'); timed.tick(3000);
assert.equal(timed.main().gradeAdventure.grades[2].solved.length,0,'typing does not grade');
assert.ok(!timed.context.WPA_GradeAdventure.capture().session.answered);
timed.submit('12');
assert.ok(timed.root.textContent.includes('🎉 You solved it!'));
assert.ok(timed.root.textContent.includes('Next story in 2 seconds…'));
assert.equal(timed.messages.filter(m=>m[0]==='celebrate').length,1,'every correct answer celebrates');
timed.submit('12');
assert.equal(timed.messages.filter(m=>m[0]==='celebrate').length,1,'repeated submit cannot celebrate or grade twice');
assert.ok(timed.items().find(n=>n.id==='ga-answer').disabled,'answered input is locked');
timed.tick(1000);
const successCheckpoint = timed.context.WPA_GradeAdventure.capture();
assert.ok(successCheckpoint.session.answered); assert.equal(successCheckpoint.session.index,0);
timed.tick(999);
assert.equal(timed.context.WPA_GradeAdventure.capture().session.index,0,'feedback stays for 1999 milliseconds');
timed.tick(1);
assert.equal(timed.context.WPA_GradeAdventure.capture().session.index,1,'Save does not reset the 2000 millisecond countdown');
timed.tick(10000);
assert.equal(timed.context.WPA_GradeAdventure.capture().session.index,1,'automatic move happens once');
assert.equal(timed.main().gradeAdventure.grades[2].solved.length,1);

// An answered save offers Continue and then a fresh visible celebration delay,
// without grading again or changing the already-earned solve or badge count.
const savedSuccess = harness({embedded:true,pid:'timer-child',seed:timed.data});
savedSuccess.event('resumeState',{state:successCheckpoint});
savedSuccess.tick(10000);
assert.ok(savedSuccess.root.textContent.includes('Small stories. Big thinking.'),'answered hub push does not auto-start');
savedSuccess.click('Continue saved Grade 2 session');
assert.ok(savedSuccess.root.textContent.includes('🎉 You solved it!'));
savedSuccess.tick(1999);
assert.equal(savedSuccess.context.WPA_GradeAdventure.capture().session.index,0);
savedSuccess.tick(1);
assert.equal(savedSuccess.context.WPA_GradeAdventure.capture().session.index,1);
assert.equal(savedSuccess.main().gradeAdventure.grades[2].solved.length,1,'resuming success does not re-award mastery');
assert.equal(savedSuccess.messages.filter(m=>m[0]==='sticker').length,0,'resuming success does not re-award badges');
assert.equal(savedSuccess.messages.filter(m=>m[0]==='celebrate').length,0,'resume does not repeat the solve event');

const noMove = harness(); noMove.click('▶ Start my first quest');
noMove.submit(''); noMove.tick(5000);
assert.equal(noMove.context.WPA_GradeAdventure.capture().session.index,0,'invalid input never moves');
assert.equal(C.journey(C.normalize(noMove.main().gradeAdventure),2).completedCount,0,'invalid input does not complete a story');
noMove.submit('11'); noMove.tick(5000);
assert.equal(noMove.context.WPA_GradeAdventure.capture().session.index,0,'wrong answer never moves');
assert.equal(C.journey(C.normalize(noMove.main().gradeAdventure),2).completedCount,0,'wrong answer does not complete a story');
assert.equal(noMove.messages.filter(m=>m[0]==='celebrate').length,0);
noMove.click('💡 A clue, please');
assert.equal(C.journey(C.normalize(noMove.main().gradeAdventure),2).completedCount,0,'a hint alone does not complete a story');
noMove.click('Show me the steps'); noMove.tick(5000);
assert.equal(noMove.context.WPA_GradeAdventure.capture().session.index,0,'revealed steps wait for explicit Next');
assert.ok(noMove.context.WPA_GradeAdventure.capture().session.revealed);
assert.equal(C.journey(C.normalize(noMove.main().gradeAdventure),2).completedCount,0,'reading a worked example does not complete it before explicit Next');
noMove.click('Next story →');
assert.equal(noMove.context.WPA_GradeAdventure.capture().session.index,1);
assert.equal(C.journey(C.normalize(noMove.main().gradeAdventure),2).completedCount,1,'explicit Next completes a worked example');
assert.equal(noMove.main().gradeAdventure.grades[2].solved.length,0,'worked example does not earn independent mastery');

const manual = harness(); manual.click('▶ Start my first quest'); manual.submit('12');
manual.tick(500); manual.click('Next story →'); manual.tick(10000);
assert.equal(manual.context.WPA_GradeAdventure.capture().session.index,1,'manual Next cancels the old timer and never skips');

const reading = harness({embedded:true,pid:'reader'});
reading.click('▶ Start my first quest'); reading.submit('12'); reading.tick(500); reading.click('Stay & read');
assert.ok(reading.context.WPA_GradeAdventure.capture().session.stayForExplanation);
reading.tick(10000);
assert.equal(reading.context.WPA_GradeAdventure.capture().session.index,0,'Stay & read pauses progression');
const readingCheckpoint = reading.context.WPA_GradeAdventure.capture();
const readingReload = harness({embedded:true,pid:'reader',seed:reading.data});
readingReload.event('resumeState',{state:readingCheckpoint}); readingReload.click('Continue saved Grade 2 session');
readingReload.tick(10000);
assert.equal(readingReload.context.WPA_GradeAdventure.capture().session.index,0,'Continue respects the saved reading pause');
assert.ok(readingReload.context.WPA_GradeAdventure.capture().session.stayForExplanation);
readingReload.click('Next story →');
readingReload.submit(readingReload.core.questions[readingReload.context.WPA_GradeAdventure.capture().session.ids[1]].answerText);
readingReload.tick(2000);
assert.equal(readingReload.context.WPA_GradeAdventure.capture().session.index,2,'new story clears the previous reading pause');

const visibility = harness(); visibility.click('▶ Start my first quest'); visibility.submit('12');
visibility.tick(1000); visibility.setHidden(true); visibility.tick(10000);
assert.equal(visibility.context.WPA_GradeAdventure.capture().session.index,0,'background tab does not advance');
visibility.setHidden(false); visibility.tick(1999);
assert.equal(visibility.context.WPA_GradeAdventure.capture().session.index,0,'returning tab gets a full visible delay');
visibility.tick(1);
assert.equal(visibility.context.WPA_GradeAdventure.capture().session.index,1);

const leaving = harness(); leaving.click('▶ Start my first quest'); leaving.submit('12');
leaving.pagehide(); leaving.tick(10000);
assert.equal(leaving.context.WPA_GradeAdventure.capture().session.index,0,'pagehide cancels automatic progression');
leaving.pageshow(); leaving.tick(1999);
assert.equal(leaving.context.WPA_GradeAdventure.capture().session.index,0,'page restore gets a full fresh delay');
leaving.tick(1);
assert.equal(leaving.context.WPA_GradeAdventure.capture().session.index,1,'page restore resumes once visible');
const suspended = harness({embedded:true,pid:'suspended'});
suspended.click('▶ Start my first quest'); suspended.submit('12');
suspended.event('suspendSession',{}); suspended.tick(10000);
assert.equal(suspended.context.WPA_GradeAdventure.capture().session.index,0,'hub suspension cancels automatic progression');
suspended.setHidden(true); suspended.setHidden(false); suspended.tick(10000);
assert.equal(suspended.context.WPA_GradeAdventure.capture().session.index,0,'visibility cannot restart a suspended session');

const restoreGuard = harness(); restoreGuard.click('▶ Start my first quest'); restoreGuard.submit('12');
restoreGuard.data.set('kls.restore.journal.v1',JSON.stringify({phase:'prepared'})); restoreGuard.tick(2000);
assert.equal(restoreGuard.context.WPA_GradeAdventure.capture().session.index,0,'a restore guard blocks timer writes');
restoreGuard.data.delete('kls.restore.journal.v1');

const homeCancel = harness(); homeCancel.click('▶ Start my first quest'); homeCancel.submit('12');
homeCancel.tick(500); homeCancel.click('🏠 Home'); homeCancel.tick(10000);
assert.ok(homeCancel.root.textContent.includes('Small stories. Big thinking.'),'Home remains visible after the old timer');
assert.equal(homeCancel.main().gradeAdventure.resume.index,0,'Home retains the answered checkpoint');
homeCancel.clickQuest(2,2); homeCancel.tick(10000);
assert.equal(homeCancel.context.WPA_GradeAdventure.capture().session.index,0,'old quest timer cannot move a new quest');
homeCancel.click('🏠 Home'); homeCancel.click('Open earlier adventures'); homeCancel.tick(10000);
assert.equal(homeCancel.context.WPA_GradeAdventure.active(),false,'classic adventures remain active');

const profileCancel = harness({embedded:true,pid:'first'});
profileCancel.click('▶ Start my first quest'); profileCancel.submit('12');
const firstSave = profileCancel.data.get('wordProblemAdventure_v1__first');
profileCancel.bind('second'); profileCancel.click('▶ Start my first quest'); profileCancel.tick(10000);
assert.equal(profileCancel.context.WPA_GradeAdventure.capture().session.index,0,'previous child timer cannot advance another profile');
assert.equal(profileCancel.main().gradeAdventure.grades[2].solved.length,0,'new profile starts empty');
assert.equal(profileCancel.data.get('wordProblemAdventure_v1__first'),firstSave,'timer cannot change previous profile');
profileCancel.submit('12'); profileCancel.click('🏠 Home'); profileCancel.click('Reset my progress'); profileCancel.click('Yes, reset my progress');
profileCancel.tick(10000);
assert.equal(profileCancel.data.has('wordProblemAdventure_v1__second'),false,'cancelled timer cannot recreate a reset save');

const finish = harness(); finish.click('▶ Start my first quest');
for (let i=0;i<5;i++) {
  const question = finish.core.questions[finish.context.WPA_GradeAdventure.capture().session.ids[i]];
  finish.submit(question.answerText);
  if (i===4) assert.ok(finish.root.textContent.includes('Your quest progress in 2 seconds…'));
  finish.tick(2000);
}
assert.ok(finish.root.textContent.includes('Quest complete!'));
assert.equal(finish.messages.filter(m=>m[0]==='sticker').length,1);
assert.equal(finish.messages.filter(m=>m[0]==='stars').length,1);
assert.equal(finish.messages.filter(m=>m[0]==='session').length,1);
finish.tick(10000);
assert.equal(finish.messages.filter(m=>m[0]==='stars').length,1,'quest completes once');
assert.equal(finish.messages.filter(m=>m[0]==='session').length,1,'summary does not repeat session statistics');

// Actual backup envelope export/import (new additive data + old journey data).
reloaded.data.set('kls.progress.v2', JSON.stringify({version:2,activeProfileId:'alice',profiles:{alice:{id:'alice',displayName:'Test',avatar:'🦊',games:{}}}}));
vm.runInContext(readFileSync(new URL('../../shared/scripts/backup.js', root),'utf8'),reloaded.context);
const B = reloaded.context.KLS.backup;
const envelope = B._internals.buildEnvelope();
assert.equal(envelope.version,1,'envelope version unchanged');
assert.equal(envelope.games['word-problem-adventure'].alice.wordProblemAdventure_v1,aliceBefore);
const wrongsBefore = reloaded.data.get('wordProblemAdventure_wrongs_v1__alice');
await B.importFromFile({text:JSON.stringify(envelope)});
assert.equal(reloaded.data.get('wordProblemAdventure_v1__alice'),aliceBefore);
assert.equal(reloaded.data.get('wordProblemAdventure_wrongs_v1__alice'),wrongsBefore);
// Older backup containing only legacy game fields still imports; grade starts clean.
envelope.games['word-problem-adventure'].alice = JSON.stringify({journey:{lessons:{old:{stars:2}}}});
await B.importFromFile({text:JSON.stringify(envelope)});
const oldReload = harness({embedded:true,pid:'alice',seed:reloaded.data});
assert.ok(oldReload.root.textContent.includes('0 / 100 solved'));
assert.equal(oldReload.main().journey.lessons.old.stars,2);
// The additive earlier checkpoint lives in an already registered key, so the
// unchanged backup envelope retains the exact stored bytes of both editions.
const backupBoth = harness({embedded:true,pid:'both-editions',seed:new Map([
  ['wordProblemAdventure_v1__both-editions',bmoneyBefore],
  ['kls.progress.v2',JSON.stringify({version:2,activeProfileId:'both-editions',profiles:{'both-editions':{id:'both-editions',displayName:'Both editions',avatar:'🦊',games:{}}}})],
])});
vm.runInContext(readFileSync(new URL('../../shared/scripts/backup.js',root),'utf8'),backupBoth.context);
const backupEnvelope = backupBoth.context.KLS.backup._internals.buildEnvelope();
assert.equal(backupEnvelope.version,1,'preserving both editions needs no envelope version change');
assert.equal(backupEnvelope.games['word-problem-adventure']['both-editions'].wordProblemAdventure_v1,bmoneyBefore,'backup exports exact existing bytes');
await backupBoth.context.KLS.backup.importFromFile({text:JSON.stringify(backupEnvelope)});
assert.equal(backupBoth.data.get('wordProblemAdventure_v1__both-editions'),bmoneyBefore,'restore preserves both editions byte for byte');
const backupBothReload = harness({embedded:true,pid:'both-editions',seed:backupBoth.data});
assertLatestEntry(backupBothReload,'restored profile with both editions');
assert.deepEqual(backupBothReload.legacy.pending(),twoEarlier,'restored earlier session remains an explicit option');
assert.deepEqual(plain(backupBothReload.context.WPA_GradeAdventure.capture()).session,twoGrade,'restored grade session retains its draft and fairness flags');
console.log('PASS: all 400 stories auto-advance; 80 quests; 40 kingdoms with ten-step status; all profiles open the current edition; older v1/v2 journey/practice/daily checkpoints remain explicit and exact across Save/Home/reload/profile changes/reset/backup; independent grade and earlier sessions; completion/mastery separation; exact Next quest continuation; locked level boundaries; 24 unique badges; two-second celebration and pause/manual/visibility/Home/profile/timer safety; retry/help/reveal/resume; old-save compatibility; real backup import/export.');
