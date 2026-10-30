(function () {
  'use strict';
  const core = window.WPA_GradeCore;
  const bridge = window.KLS.bridge;
  const MAIN = 'wordProblemAdventure_v1';
  const WRONGS = 'wordProblemAdventure_wrongs_v1';
  const EARLIER_CHECKPOINT = 'earlierAdventureCheckpoint';
  const root = document.getElementById('grade-adventure');
  const names = { 2: 'Meadow explorers', 3: 'Trail detectives', 4: 'Summit solvers', 5: 'Thinking champions' };
  const descriptions = { 2: 'Parts, patterns & fair shares', 3: 'Groups, clues & two-step plans', 4: 'Fractions, shapes & hidden amounts', 5: 'Decimals, fractions & deeper puzzles' };
  let state = core.empty(), session = null, boundProfile, ready = false, storageError = false;
  let lastSummary = null, earlierResume = null;
  const AUTO_ADVANCE_MS = 2000;
  const cheers = ['Great thinking! High five!', 'You cracked the story. Way to go!', 'Your careful thinking paid off!', 'Another story solved. Keep shining!', 'Fantastic work, story explorer!'];
  let advanceTimer = null, advanceToken = 0, suspended = false;
  const pendingWrites = new Map();

  function key(base) {
    const pid = bridge.getProfileId();
    if (bridge.isEmbedded() && !pid) return null;
    return pid ? base + '__' + pid : base;
  }
  function read(base) {
    const k = key(base);
    if (!k) return {};
    try { return JSON.parse(pendingWrites.get(k) || localStorage.getItem(k) || '{}') || {}; }
    catch (e) { storageError = true; return {}; }
  }
  function write(base, value) {
    const k = key(base);
    if (!k) return false;
    const raw = JSON.stringify(value);
    try {
      if (bridge.assertCanWrite) bridge.assertCanWrite();
      localStorage.setItem(k, raw); pendingWrites.delete(k);
      if (bridge.clearStorageError) bridge.clearStorageError(k);
      storageError = pendingWrites.size > 0; return true;
    } catch (e) {
      pendingWrites.set(k, raw); storageError = true;
      if (bridge.reportStorageError) bridge.reportStorageError(e, k);
      showStorageError(); return false;
    }
  }
  function persist() {
    if (!ready) return;
    // Read-modify-write retains legacy journey, daily, and practice fields.
    const main = read(MAIN);
    main.gradeAdventure = state;
    write(MAIN, main);
    bridge.saveState(capture());
  }
  function checkpoint() {
    state.resume = session ? JSON.parse(JSON.stringify(session)) : null;
    persist();
  }
  function capture() {
    if (!active()) captureEarlier();
    // The hub must receive the live question too, even if a browser write failed.
    if (session) {
      const live = JSON.parse(JSON.stringify(session));
      if (JSON.stringify(state.resume) !== JSON.stringify(live)) {
        state.resume = live;
        const main = read(MAIN); main.gradeAdventure = state; write(MAIN, main);
      }
    }
    for (const [k, raw] of pendingWrites) {
      try { if (bridge.assertCanWrite) bridge.assertCanWrite(); localStorage.setItem(k, raw); pendingWrites.delete(k); if (bridge.clearStorageError) bridge.clearStorageError(k); }
      catch (e) { if (bridge.reportStorageError) bridge.reportStorageError(e, k); }
    }
    return { v: 2, mode: 'grade-adventure', grade: state.selectedGrade,
      session: session ? JSON.parse(JSON.stringify(session)) : state.resume,
      summary: lastSummary ? JSON.parse(JSON.stringify(lastSummary)) : null,
      earlierAdventure: earlierResume ? JSON.parse(JSON.stringify(earlierResume)) : null };
  }
  function copyEarlier(blob) {
    if (!blob || (blob.v !== 1 && blob.v !== 2) || blob.mode === 'grade-adventure') return null;
    return JSON.parse(JSON.stringify(blob));
  }
  function rememberEarlier(blob) {
    const saved = copyEarlier(blob);
    if (!saved || !ready) return;
    earlierResume = saved;
    const main = read(MAIN);
    if (JSON.stringify(main[EARLIER_CHECKPOINT]) !== JSON.stringify(saved)) {
      main[EARLIER_CHECKPOINT] = saved; write(MAIN, main);
    }
  }
  function captureEarlier() {
    if (!ready || !window.__wpa_captureState) return;
    const pending = window.__wpa_getPendingResume && window.__wpa_getPendingResume();
    const live = window.__wpa_captureState();
    const saved = live && live.screen !== 'screen-welcome' ? live : pending;
    if (saved && (pending || saved.screen !== 'screen-welcome')) rememberEarlier(saved);
  }
  function clearEarlierResume() {
    earlierResume = null;
    if (window.__wpa_setPendingResume) window.__wpa_setPendingResume(null);
    if (!ready) return;
    const main = read(MAIN);
    if (Object.prototype.hasOwnProperty.call(main, EARLIER_CHECKPOINT)) {
      delete main[EARLIER_CHECKPOINT]; write(MAIN, main);
    }
  }
  function active() { return document.body.classList.contains('grade-mode'); }
  function clearAutoAdvance() {
    clearTimeout(advanceTimer);
    advanceTimer = null;
    advanceToken += 1;
  }
  function scheduleAutoAdvance() {
    clearAutoAdvance();
    if (!session || !session.answered || session.revealed || session.stayForExplanation || !active() || document.hidden || suspended) return;
    // Timer handles are never saved. Continue gives the child a fresh, visible
    // celebration, and stale callbacks cannot move a replacement question/profile.
    const current = session, index = session.index, profile = boundProfile, token = advanceToken;
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      if (token !== advanceToken || session !== current || session.index !== index || boundProfile !== profile || bridge.getProfileId() !== profile || !active() || document.hidden || suspended) return;
      try { if (bridge.assertCanWrite) bridge.assertCanWrite(); } catch (e) { return; }
      advance();
    }, AUTO_ADVANCE_MS);
  }
  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function button(text, handler, primary = false) {
    const b = el('button', text, primary ? 'ga-primary' : '');
    b.type = 'button';
    b.addEventListener('click', handler);
    return b;
  }
  function showStorageError() {
    if (storageError && !root.querySelector('.ga-error')) {
      const warning = el('p', 'Your browser could not save progress. Keep this page open and use the hub’s Save or Export option if available.', 'ga-error');
      warning.setAttribute('role', 'alert');
      root.prepend(warning);
    }
  }
  function screen(title, subtitle) {
    clearAutoAdvance();
    root.hidden = false;
    document.body.classList.add('grade-mode');
    root.replaceChildren();
    const nav = el('div', undefined, 'ga-nav');
    nav.append(el('span', '🦊 WORD PROBLEM ADVENTURE', 'ga-eyebrow'));
    if (session || lastSummary) nav.append(button('🏠 Home', home));
    root.append(nav);
    const heading = el('h1', title);
    heading.tabIndex = -1;
    root.append(heading);
    if (subtitle) root.append(el('p', subtitle, 'ga-intro'));
    showStorageError();
    heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function home() {
    if (ready && !active()) {
      captureEarlier();
      if (window.__wpa_goHome) window.__wpa_goHome();
    }
    // A Home trip retains the checkpoint, including help/attempt flags.
    if (session && ready) checkpoint();
    session = null;
    lastSummary = null;
    if (!ready) { screen('Getting your adventure ready…', 'Your profile will be ready in a moment.'); return; }
    state = core.normalize(read(MAIN).gradeAdventure);
    renderHome();
  }
  function segments(grade, kingdom) {
    const finished = core.gradeState(state, grade).completed;
    const bar = el('div', undefined, 'ga-segments');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Level ' + kingdom.number + ': stories finished');
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '10');
    bar.setAttribute('aria-valuenow', String(kingdom.completedCount));
    for (const id of kingdom.ids) {
      const piece = el('span', undefined, 'ga-segment' + (finished.includes(id) ? ' filled' : ''));
      piece.setAttribute('aria-hidden', 'true'); bar.append(piece);
    }
    return bar;
  }
  function status(grade, journey) {
    const g = core.gradeState(state, grade);
    const kingdom = journey.current || journey.kingdoms[journey.kingdoms.length - 1];
    const panel = el('section', undefined, 'ga-panel ga-status');
    const top = el('div', undefined, 'ga-status-top');
    top.append(el('span', kingdom.icon, 'ga-kingdom-icon'));
    const title = el('div');
    title.append(el('p', journey.complete ? 'ALL 10 KINGDOMS COMPLETE' : 'YOUR JOURNEY · LEVEL ' + kingdom.number + ' OF 10', 'ga-status-label'), el('h2', kingdom.name, 'ga-status-title'));
    top.append(title, el('strong', kingdom.completedCount + ' / 10', 'ga-status-count'));
    panel.append(top, segments(grade, kingdom));
    panel.append(el('p', journey.complete ? 'You explored every kingdom! Choose a quest to replay, practice, or try another grade.' : (10 - kingdom.completedCount) + ' more ' + (10 - kingdom.completedCount === 1 ? 'story' : 'stories') + ' to finish this kingdom.', 'ga-help'));
    const totalStars = Object.values(g.questStars).reduce((sum, n) => sum + n, 0);
    const badgeCount = core.milestones.filter(m => g.solved.length >= m[0]).length;
    const stats = el('div', undefined, 'ga-status-stats');
    for (const [icon, count, label] of [['★', totalStars + ' / 60', 'Quest stars'], ['🏅', badgeCount + ' / 6', 'Mastery badges']]) {
      const item = el('div', undefined, 'ga-stat');
      item.append(el('b', icon, 'ga-stat-icon'), el('strong', count), el('span', label)); stats.append(item);
    }
    panel.append(stats);
    const label = el('div', undefined, 'ga-progress-label');
    label.append(el('strong', g.solved.length + ' / 100 solved on your own'), el('span', journey.completedCount + ' / 100 stories finished · ' + journey.kingdoms.filter(k => k.complete).length + ' / 10 kingdoms complete'));
    panel.append(label);
    const nextBadge = core.milestones.find(m => m[0] > g.solved.length);
    const needed = nextBadge ? nextBadge[0] - g.solved.length : 0;
    panel.append(el('p', nextBadge ? needed + (needed === 1 ? ' more independent solve to earn ' : ' more independent solves to earn ') + nextBadge[2] + ' ' + nextBadge[1] : 'All 100 solved on your own. You are a Story champion!', 'ga-help'));
    return panel;
  }
  function continueAdventure(grade) {
    const saved = core.normalizeSession(state.resume);
    const progress = core.gradeState(state, grade);
    if (saved && saved.mode === 'quest' && saved.grade === grade && (saved.ids.some(id => !progress.completed.includes(id)) || saved.answered && !saved.rewarded && !saved.replay)) return startQuest(grade, saved.questId);
    const next = core.nextQuest(state, grade);
    if (next) startQuest(grade, next.id);
  }
  function renderHome() {
    const grade = state.selectedGrade;
    const g = core.gradeState(state, grade);
    const journey = core.journey(state, grade);
    const wrongIds = core.practiceIds(read(WRONGS), grade);
    screen('Small stories. Big thinking.', 'Ten kingdoms. One hundred stories. Pick your grade and watch your adventure grow.');
    const grades = el('div', undefined, 'ga-grades');
    grades.setAttribute('aria-label', 'Choose your grade');
    for (const n of [2, 3, 4, 5]) {
      const b = button('', () => { state.selectedGrade = n; persist(); renderHome(); });
      b.className = 'ga-grade';
      b.setAttribute('aria-pressed', String(n === grade));
      b.append(el('strong', 'Grade ' + n), el('span', descriptions[n]));
      grades.append(b);
    }
    root.append(grades);
    const panel = status(grade, journey);
    panel.prepend(el('div', 'GRADE ' + grade + ' · ' + names[grade], 'ga-eyebrow'));
    const questPicker = el('details');
    questPicker.append(el('summary', 'Choose or replay a quest'));
    const saved = core.normalizeSession(state.resume);
    const pendingReward = saved && saved.grade === grade && saved.mode === 'quest' && saved.answered && !saved.rewarded && !saved.replay;
    const canContinue = !journey.complete || pendingReward;
    const hasStarted = g.seen.length || journey.completedCount || saved && saved.grade === grade;
    const actions = el('div', undefined, 'ga-actions');
    actions.append(button(!canContinue ? 'Practice & replay' : hasStarted ? '▶ Next quest' : '▶ Start my first quest', () => {
      if (canContinue) return continueAdventure(grade);
      questPicker.open = true; questPicker.scrollIntoView({ block: 'start' });
    }, true));
    if (state.resume) actions.append(button('Continue saved Grade ' + state.resume.grade + ' session', resume));
    if (earlierResume) actions.append(button('Continue earlier adventure', () => {
      classic();
      if (window.__wpa_continueSaved) window.__wpa_continueSaved();
    }));
    const practice = button('🎯 Practice tricky stories (' + wrongIds.length + ')', () => startPractice(grade));
    practice.disabled = wrongIds.length === 0;
    actions.append(practice);
    panel.append(actions);
    if (!wrongIds.length) panel.append(el('p', 'No tricky stories waiting. Keep exploring!', 'ga-help'));
    root.append(panel);
    root.append(el('h2', 'Your badge collection'));
    const badges = el('div', undefined, 'ga-badges');
    for (const [count, icon, name] of core.milestones) {
      const earned = g.solved.length >= count;
      const item = el('div', undefined, 'ga-badge' + (earned ? ' earned' : ''));
      item.append(el('b', earned ? icon : '◇'), el('span', name), el('small', earned ? '✓ Earned · ' + count + ' solves' : count + ' solves'));
      badges.append(item);
    }
    root.append(badges, el('h2', 'Your 10 kingdoms'));
    root.append(el('p', 'Ten stories in each kingdom, split into two short quests. Finish a kingdom to unlock the next. Each bar shows stories finished; mastery badges count independent solves.', 'ga-help'));
    const map = el('div', undefined, 'ga-journey');
    for (const kingdom of journey.kingdoms) {
      const b = button('', () => {
        const quest = kingdom.quests.find(q => q.ids.some(id => !g.completed.includes(id))) || kingdom.quests[0];
        startQuest(grade, quest.id);
      });
      b.className = 'ga-kingdom' + (kingdom.complete ? ' complete' : journey.current && kingdom.number === journey.current.number ? ' current' : !kingdom.unlocked ? ' locked' : '');
      b.disabled = !kingdom.unlocked;
      const top = el('span', 'Level ' + kingdom.number + ' · ' + kingdom.name, 'ga-kingdom-top');
      b.append(top, el('span', kingdom.icon, 'ga-kingdom-icon'), el('strong', kingdom.completedCount + ' / 10 stories', 'ga-kingdom-count'));
      const bar = el('progress', undefined, 'ga-progress'); bar.max = 10; bar.value = kingdom.completedCount;
      bar.setAttribute('aria-label', 'Level ' + kingdom.number + ' stories finished');
      b.append(bar, el('span', '★'.repeat(kingdom.stars) + '☆'.repeat(6 - kingdom.stars), 'ga-kingdom-stars'), el('small', kingdom.complete ? '✓ Kingdom badge earned' : kingdom.unlocked ? 'You are here · keep exploring!' : 'Finish Level ' + (kingdom.number - 1) + ' to unlock'));
      map.append(b);
    }
    root.append(map);
    questPicker.append(el('p', 'Unfinished quests continue where you left off. Completed quests can be replayed to practice or improve stars.', 'ga-help'));
    const quests = el('div', undefined, 'ga-quests');
    core.bank[grade].quests.forEach((q, index) => {
      const b = button('', () => startQuest(grade, q.id)); b.className = 'ga-quest';
      b.disabled = !journey.kingdoms[Math.floor(index / 2)].unlocked;
      const body = el('span');
      const solved = q.ids.filter(id => g.solved.includes(id)).length;
      const completed = q.ids.filter(id => g.completed.includes(id)).length;
      const stars = g.questStars[q.id] || 0;
      body.append(el('span', q.title), el('span', '★'.repeat(stars) + '☆'.repeat(3 - stars), 'ga-quest-stars'), el('span', completed + '/5 finished · ' + solved + '/5 independent · Level ' + (Math.floor(index / 2) + 1), 'ga-quest-progress'));
      b.append(el('span', String(index + 1).padStart(2, '0'), 'ga-quest-number'), body);
      quests.append(b);
    });
    questPicker.append(quests); root.append(questPicker);
    const details = el('details'); details.append(el('summary', 'Grown-up notes & more adventures'));
    details.append(el('p', 'These original stories build reasoning through patterns, comparisons, drawings, and working backward. Start with the child’s grade and change it any time. Hints are welcome. Badges count different stories solved correctly on the first try without a hint or a shown solution. A fresh, independent retry can earn the solve later. No timer or lost lives.', 'ga-help'));
    const more = el('div', undefined, 'ga-actions');
    more.append(button('Open earlier adventures', classic), button('Reset my progress', confirmReset));
    details.append(more); root.append(details);
  }
  function begin(grade, ids, mode, questId) {
    state.selectedGrade = grade;
    session = { grade, ids, mode, questId, index: 0, clean: 0, attempts: 0, helped: false, answered: false, revealed: false, stayForExplanation: false, earned: [] };
    lastSummary = null;
    checkpoint(); bridge.played(); renderQuestion();
  }
  function startQuest(grade, questId) {
    const next = core.questSession(state, grade, questId);
    if (!next) return;
    session = next; state.selectedGrade = grade; lastSummary = null;
    checkpoint(); bridge.played();
    // Next quest moves past a finished answer. The explicit Continue control
    // still lets the child revisit its saved celebration or worked steps.
    if (!session.replay && session.answered) advance();
    else renderQuestion();
  }
  function startPractice(grade) {
    const ids = core.practiceIds(read(WRONGS), grade).slice(0, 5);
    if (ids.length) begin(grade, ids, 'practice', null);
  }
  function resume() {
    session = core.normalizeSession(state.resume);
    if (!session) return home();
    state.selectedGrade = session.grade; lastSummary = null;
    renderQuestion();
  }
  function renderQuestion() {
    const q = core.questions[session.ids[session.index]];
    const title = session.mode === 'practice' ? 'Practice tricky stories' : q.skill;
    screen(title, 'Grade ' + session.grade + ' · Story ' + (session.index + 1) + ' of ' + session.ids.length + ' · No rush');
    const kingdom = core.journey(state, session.grade).kingdoms.find(k => k.ids.includes(q.id));
    const journeyStatus = el('section', undefined, 'ga-session-progress');
    journeyStatus.append(el('strong', kingdom.icon + ' Level ' + kingdom.number + ' of 10 · ' + kingdom.name), el('span', kingdom.completedCount + ' / 10 stories finished'), segments(session.grade, kingdom));
    root.append(journeyStatus);
    const panel = el('section', undefined, 'ga-panel');
    panel.append(el('p', 'READ → PLAN → SOLVE → CHECK', 'ga-eyebrow'), el('p', q.text, 'ga-story'));
    const form = el('form', undefined, 'ga-answer');
    const label = el('label', 'Your answer'); label.htmlFor = 'ga-answer';
    const input = el('input'); input.id = 'ga-answer'; input.type = 'text';
    input.inputMode = session.grade >= 4 ? 'text' : 'numeric'; input.autocomplete = 'off';
    input.setAttribute('aria-describedby', 'ga-unit ga-format');
    input.disabled = session.answered;
    input.value = session.draft || '';
    input.addEventListener('input', () => { session.draft = input.value; });
    const unit = el('span', q.unit, 'ga-help'); unit.id = 'ga-unit';
    const submit = button('Check answer', () => {}, true); submit.type = 'submit'; submit.disabled = session.answered;
    form.append(label, input, unit, submit);
    const format = el('p', session.grade >= 4 ? 'You can type a number, a decimal, a fraction like 3/4, or a mixed number like 1 1/2.' : 'Type a whole number. Press Enter or choose Check answer.', 'ga-help'); format.id = 'ga-format';
    const feedback = el('div', undefined, 'ga-feedback'); feedback.id = 'ga-feedback'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    const actions = el('div', undefined, 'ga-actions');
    const hint = button('💡 A clue, please', () => {
      if (session.answered) return;
      session.helped = true; checkpoint();
      feedback.className = 'ga-feedback';
      feedback.replaceChildren(el('b', 'Try this plan'), el('span', q.hint), el('p', 'It is good to ask for help. You can try this story on your own another time.', 'ga-help'));
    });
    const reveal = button('Show me the steps', () => {
      if (session.answered) return;
      session.helped = true; session.answered = true; session.revealed = true;
      const wrongs = read(WRONGS); core.recordWrong(wrongs, q, null, 'worked-example'); write(WRONGS, wrongs);
      core.recordSeen(state, q); checkpoint(); renderQuestion();
    });
    hint.disabled = reveal.disabled = session.answered;
    if (!session.answered) actions.append(hint, reveal);
    if (session.answered) actions.append(button(session.index === session.ids.length - 1 ? 'See my progress →' : 'Next story →', advance, true));
    panel.append(form, format, feedback, actions);
    root.append(panel);
    if (session.answered) {
      feedback.className = 'ga-feedback ' + (session.revealed ? '' : 'success' + (session.stayForExplanation ? '' : ' ga-celebration'));
      const math = q.check.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/\+/g, ' + ').replace(/-/g, ' − ');
      const answerLabel = ['number', 'first coordinate'].includes(q.unit) ? q.answerText
        : ['day', 'place'].includes(q.unit) ? q.unit + ' ' + q.answerText : q.answerText + ' ' + q.unit;
      feedback.append(el('b', session.revealed ? 'Let’s work it out together' : '🎉 You solved it!', 'ga-feedback-title'));
      if (!session.revealed) {
        feedback.append(el('p', cheers[session.index % cheers.length], 'ga-cheer'));
        if (!session.stayForExplanation) {
          const next = session.index === session.ids.length - 1 ? 'Your ' + (session.mode === 'practice' ? 'practice' : 'quest') + ' progress' : 'Next story';
          feedback.append(el('p', next + ' in 2 seconds… Choose Stay & read for more time.', 'ga-auto-next'));
          feedback.append(button('Stay & read', () => {
            session.stayForExplanation = true; checkpoint(); renderQuestion();
          }));
        }
      }
      feedback.append(el('p', q.explain), el('p', math + ' = ' + q.answerText, 'ga-help'), el('b', 'Answer: ' + answerLabel));
      if (session.revealed || session.helped || session.attempts) feedback.append(el('p', 'Saved for a fresh try in Practice tricky stories.', 'ga-help'));
      feedback.tabIndex = -1;
      feedback.focus({ preventScroll: true });
      feedback.scrollIntoView({ block: 'nearest' });
      scheduleAutoAdvance();
    } else input.focus({ preventScroll: true });
    form.addEventListener('submit', e => {
      e.preventDefault(); if (session.answered) return;
      const answer = core.parseAnswer(input.value);
      if (answer === null) { feedback.className = 'ga-feedback try'; feedback.textContent = 'Please type a number' + (session.grade >= 4 ? ', decimal, or fraction such as 3/4.' : ', such as 12.'); input.focus(); return; }
      if (!core.correct(q, answer)) {
        session.attempts += 1; core.recordSeen(state, q);
        const wrongs = read(WRONGS); core.recordWrong(wrongs, q, answer); write(WRONGS, wrongs); checkpoint();
        feedback.className = 'ga-feedback try';
        feedback.replaceChildren(el('b', 'Good effort. Try another plan.'), el('span', q.hint));
        input.select(); input.focus(); return;
      }
      const independent = session.attempts === 0 && !session.helped;
      if (independent) session.clean += 1;
      const earned = core.recordSolve(state, q, independent); session.earned.push(...earned);
      core.recordCompleted(state, q);
      const wrongs = read(WRONGS);
      if (independent) core.resolveWrong(wrongs, q);
      else if (session.attempts === 0) core.recordWrong(wrongs, q, null, 'used-clue');
      write(WRONGS, wrongs);
      for (const n of earned) bridge.sticker('wpa-grade-' + q.grade + '-solved-' + n);
      bridge.celebrate();
      session.answered = true; settleQuest(); checkpoint(); renderQuestion();
    });
  }
  function settleQuest() {
    if (!session || session.mode !== 'quest' || !session.answered) return 0;
    if (session.rewarded) return session.stars;
    const g = core.gradeState(state, session.grade);
    const remaining = session.ids.slice(session.index + 1);
    if (session.replay ? remaining.length > 0 : remaining.some(id => !g.completed.includes(id))) return 0;
    const stars = session.clean >= 4 ? 3 : session.clean >= 2 ? 2 : 1;
    session.stars = stars; session.rewarded = true;
    g.questStars[session.questId] = Math.max(g.questStars[session.questId] || 0, stars);
    bridge.stars('grade-' + session.grade + '-' + session.questId, stars);
    bridge.session('grade-' + session.grade + '-' + session.questId, { questionsAnswered: session.ids.length, accuracy: Math.round(100 * session.clean / session.ids.length), bestStreak: 0 });
    return stars;
  }
  function advance() {
    clearAutoAdvance();
    if (!session || !session.answered) return;
    if (session.revealed) core.recordCompleted(state, core.questions[session.ids[session.index]]);
    const g = core.gradeState(state, session.grade);
    let nextIndex = session.index + 1;
    if (session.mode === 'quest' && !session.replay) {
      while (nextIndex < session.ids.length && g.completed.includes(session.ids[nextIndex])) nextIndex += 1;
    }
    if (nextIndex < session.ids.length) {
      session.index = nextIndex; session.attempts = 0; session.helped = false; session.answered = false; session.revealed = false; session.stayForExplanation = false; session.draft = ''; session.notes = '';
      checkpoint(); renderQuestion(); return;
    }
    let stars = 0;
    if (session.mode === 'quest') {
      stars = settleQuest();
    } else g.practiceSessions += 1;
    lastSummary = { ...session, stars };
    session = null; state.resume = null; persist();
    renderSummary();
  }
  function renderSummary() {
    const result = lastSummary;
    const g = core.gradeState(state, result.grade);
    screen(result.mode === 'practice' ? 'Practice complete!' : 'Quest complete!', 'You made time to think. That is how you grow.');
    const panel = el('section', undefined, 'ga-panel');
    if (result.stars) panel.append(el('div', '★'.repeat(result.stars), 'ga-summary-stars'), el('h2', result.stars + ' Quest stars'));
    panel.append(el('p', result.clean + ' of ' + result.ids.length + ' solved on your own in this ' + (result.mode === 'practice' ? 'practice session.' : 'quest.')));
    panel.append(el('p', 'Grade ' + result.grade + ': ' + g.solved.length + ' of 100 different stories solved independently.'));
    const journey = core.journey(state, result.grade);
    const kingdom = journey.kingdoms.find(k => k.ids.includes(result.ids[result.index]));
    if (kingdom.complete && result.mode === 'quest' && !result.replay) {
      const reward = el('div', undefined, 'ga-level-reward');
      reward.append(el('b', kingdom.icon + ' Level ' + kingdom.number + ' complete!'), el('p', kingdom.name + ' kingdom badge earned. ' + (journey.current ? 'Next stop: ' + journey.current.icon + ' ' + journey.current.name + '!' : 'All 10 kingdoms complete. You are an adventure champion!')));
      panel.append(reward);
    } else panel.append(el('p', kingdom.icon + ' Level ' + kingdom.number + ' · ' + kingdom.completedCount + ' / 10 stories finished', 'ga-status-label'), segments(result.grade, kingdom));
    for (const n of result.earned) {
      const badge = core.milestones.find(m => m[0] === n);
      panel.append(el('div', badge[1] + ' New badge: ' + badge[2] + ' — ' + n + ' independent solves!', 'ga-reward'));
    }
    const remaining = core.practiceIds(read(WRONGS), result.grade).length;
    panel.append(el('p', remaining ? remaining + (remaining === 1 ? ' tricky story is ready' : ' tricky stories are ready') + ' for a fresh try. Every retry is a chance to learn.' : 'No tricky stories waiting. Well done!', 'ga-help'));
    const actions = el('div', undefined, 'ga-actions');
    const next = core.nextQuest(state, result.grade);
    if (next) actions.append(button(journey.current.number !== kingdom.number ? 'Next kingdom →' : 'Next quest →', () => continueAdventure(result.grade), true));
    else actions.append(button('See all my kingdoms', home, true));
    if (remaining) actions.append(button('Practice tricky stories', () => startPractice(result.grade), result.mode === 'practice'));
    actions.append(button('🏠 Home & badges', home));
    panel.append(actions); root.append(panel);
  }
  function classic() {
    clearAutoAdvance();
    session = null; lastSummary = null;
    root.hidden = true; document.body.classList.remove('grade-mode');
    window.__wpa_goHome();
  }
  function confirmReset() {
    screen('Start fresh?', 'This clears all Word Problem Adventure progress, including earlier adventures, badges, and tricky stories, for this profile only.');
    const actions = el('div', undefined, 'ga-actions');
    actions.append(button('Keep my progress', home, true), button('Yes, reset my progress', () => {
      try {
        if (bridge.assertCanWrite) bridge.assertCanWrite();
        localStorage.removeItem(key(MAIN)); localStorage.removeItem(key(WRONGS));
        pendingWrites.clear();
        if (bridge.clearStorageError) { bridge.clearStorageError(key(MAIN)); bridge.clearStorageError(key(WRONGS)); }
      }
      catch (e) { storageError = true; if (bridge.reportStorageError) bridge.reportStorageError(e, key(MAIN)); showStorageError(); return; }
      state = core.empty(); session = null; lastSummary = null;
      earlierResume = null;
      if (window.__wpa_resetForProfile) window.__wpa_resetForProfile();
      else if (window.__wpa_setPendingResume) window.__wpa_setPendingResume(null);
      bridge.resetProgress(); renderHome();
    }));
    root.append(actions);
  }
  function bindProfile() {
    const pid = bridge.getProfileId();
    if (bridge.isEmbedded() && !pid) return;
    if (ready && boundProfile === pid) return;
    // A profile change must never checkpoint the previous child's live session
    // under the newly bound key. The hub flushes the old session before switching.
    clearAutoAdvance(); suspended = false;
    session = null; lastSummary = null;
    boundProfile = pid; ready = true; storageError = false;
    if (window.__wpa_resetForProfile) window.__wpa_resetForProfile();
    earlierResume = copyEarlier(read(MAIN)[EARLIER_CHECKPOINT]);
    if (window.__wpa_setPendingResume) window.__wpa_setPendingResume(earlierResume);
    state = core.normalize(read(MAIN).gradeAdventure);
    renderHome();
  }
  window.WPA_GradeAdventure = { active, home, capture, clearEarlierResume };
  bridge.onHubMessage('goHome', home);
  bridge.onHubMessage('suspendSession', () => { suspended = true; clearAutoAdvance(); });
  bridge.onHubMessage('setProfile', bindProfile);
  bridge.onProfileReady(bindProfile);
  bridge.onHubMessage('resumeState', msg => {
    // The registered main store is authoritative for exact checkpoints.
    // Repeated hub pushes must never interrupt a session already in progress.
    if (msg.state && msg.state.mode === 'grade-adventure' && ready && !session && !lastSummary) {
      if (msg.state.earlierAdventure) rememberEarlier(msg.state.earlierAdventure);
      if (window.__wpa_setPendingResume) window.__wpa_setPendingResume(earlierResume);
      home();
      if (msg.state.v === 2 && msg.state.session) {
        const restored = core.normalizeSession(msg.state.session);
        if (restored) {
          restored.draft = String(msg.state.session.draft || '');
          restored.notes = String(msg.state.session.notes || '');
          state.resume = restored; state.selectedGrade = restored.grade;
          renderHome();
        }
      } else if (msg.state.v === 2 && msg.state.summary) {
        const restored = core.normalizeSession(msg.state.summary);
        if (restored) root.append(button('Continue saved quest summary', () => {
          lastSummary = { ...restored, stars: Math.max(0, Math.min(3, Number(msg.state.summary.stars) || 0)) };
          renderSummary();
        }, true));
      }
    } else if (msg.state && msg.state.mode !== 'grade-adventure' && ready && !session && !lastSummary) {
      // Saved progress may belong to the earlier engine, but the account's
      // checkpoint must never choose which app interface it opens.
      rememberEarlier(msg.state);
      if (window.__wpa_setPendingResume) window.__wpa_setPendingResume(earlierResume);
      if (active()) renderHome();
    }
  });
  document.getElementById('btn-grade-home').addEventListener('click', home);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearAutoAdvance();
    else scheduleAutoAdvance();
  });
  window.addEventListener('pagehide', clearAutoAdvance);
  window.addEventListener('pageshow', scheduleAutoAdvance);
  bindProfile();
  if (!ready) home();
})();
