/* Pure grade-adventure rules. No storage, DOM, timers, or network. */
(function () {
  'use strict';
  const bank = window.WPA_GRADES;
  const questions = Object.fromEntries(Object.values(bank).flatMap(g => g.questions).map(q => [q.id, q]));
  const milestones = [
    [5, '🌱', 'First steps'], [10, '🔎', 'Clue finder'], [25, '🧩', 'Puzzle solver'],
    [50, '🧭', 'Trail explorer'], [75, '💎', 'Deep thinker'], [100, '👑', 'Story champion'],
  ];
  const kingdomNames = [
    ['Sprout Meadow', '🌱'], ['Rainbow River', '🌈'], ['Puzzle Forest', '🌳'],
    ['Sparkle Village', '✨'], ['Coral Coast', '🐚'], ['Crystal Cavern', '💎'],
    ['Cloud Castle', '☁️'], ['Moon Mountain', '🌙'], ['Star Kingdom', '⭐'], ['Crown Palace', '👑'],
  ];
  const validGrade = g => [2, 3, 4, 5].includes(Number(g));
  const empty = () => ({ version: 1, selectedGrade: 2, grades: {}, resume: null });
  function gradeState(state, grade) {
    if (!state.grades[grade]) state.grades[grade] = { solved: [], completed: [], seen: [], questStars: {}, practiceSessions: 0 };
    if (!Array.isArray(state.grades[grade].completed)) state.grades[grade].completed = [];
    return state.grades[grade];
  }
  function normalize(raw) {
    const state = empty();
    if (!raw || typeof raw !== 'object') return state;
    if (validGrade(raw.selectedGrade)) state.selectedGrade = Number(raw.selectedGrade);
    for (const g of [2, 3, 4, 5]) {
      const src = raw.grades && raw.grades[g];
      if (!src) continue;
      const dst = gradeState(state, g);
      for (const name of ['solved', 'completed', 'seen']) {
        dst[name] = [...new Set((Array.isArray(src[name]) ? src[name] : []).filter(id => questions[id] && questions[id].grade === g))];
      }
      for (const quest of bank[g].quests) {
        const stars = src.questStars && src.questStars[quest.id];
        if (Number.isInteger(stars) && stars >= 0 && stars <= 3) {
          dst.questStars[quest.id] = stars;
          // Existing quest stars are only awarded after its final story. They
          // prove journey completion even when a child needed a worked example.
          if (stars > 0) dst.completed.push(...quest.ids);
        }
      }
      dst.completed = [...new Set(dst.completed.concat(dst.solved))];
      dst.practiceSessions = Number.isInteger(src.practiceSessions) && src.practiceSessions > 0 ? src.practiceSessions : 0;
    }
    state.resume = normalizeSession(raw.resume);
    if (state.resume && state.resume.mode === 'quest') {
      const saved = state.resume, dst = gradeState(state, saved.grade);
      // A past index means the child already chose to move on. A correct
      // current answer also counts, but revealing steps alone does not.
      const finished = saved.ids.slice(0, saved.index);
      if (saved.answered && !saved.revealed) finished.push(saved.ids[saved.index]);
      dst.completed = [...new Set(dst.completed.concat(finished))];
    }
    return state;
  }
  function normalizeSession(raw) {
    if (!raw || !validGrade(raw.grade) || !['quest', 'practice'].includes(raw.mode)) return null;
    const grade = Number(raw.grade);
    if (!Array.isArray(raw.ids) || raw.ids.length < 1 || raw.ids.length > 5) return null;
    if (raw.ids.some(id => !questions[id] || questions[id].grade !== grade) || new Set(raw.ids).size !== raw.ids.length) return null;
    if (!Number.isInteger(raw.index) || raw.index < 0 || raw.index >= raw.ids.length) return null;
    if (raw.mode === 'quest' && !bank[grade].quests.some(q => q.id === raw.questId && q.ids.join() === raw.ids.join())) return null;
    return {
      grade, mode: raw.mode, questId: raw.questId || null, ids: raw.ids.slice(), index: raw.index,
      clean: Math.max(0, Math.min(raw.ids.length, Number(raw.clean) || 0)),
      attempts: Math.max(0, Number(raw.attempts) || 0), helped: Boolean(raw.helped),
      answered: Boolean(raw.answered), revealed: Boolean(raw.revealed),
      replay: Boolean(raw.replay),
      rewarded: Boolean(raw.rewarded), stars: Math.max(0, Math.min(3, Math.trunc(Number(raw.stars) || 0))),
      stayForExplanation: Boolean(raw.stayForExplanation),
      draft: String(raw.draft || '').slice(0, 200), notes: String(raw.notes || '').slice(0, 10000),
      earned: Array.isArray(raw.earned) ? raw.earned.filter(n => milestones.some(m => m[0] === n)) : [],
    };
  }
  function kingdoms(grade) {
    if (!validGrade(grade)) return [];
    return kingdomNames.map(([name, icon], index) => {
      const quests = bank[Number(grade)].quests.slice(index * 2, index * 2 + 2);
      return { number: index + 1, name, icon, quests, ids: quests.flatMap(quest => quest.ids) };
    });
  }
  function journey(state, grade) {
    const groups = kingdoms(grade);
    if (!groups.length) return { kingdoms: [], current: null, completedCount: 0, complete: false };
    const g = gradeState(state, Number(grade));
    const completed = new Set(g.completed), solved = new Set(g.solved);
    let previousComplete = true;
    const entries = groups.map(group => {
      const completedCount = group.ids.filter(id => completed.has(id)).length;
      const complete = completedCount === group.ids.length;
      const entry = { ...group, completedCount,
        independentCount: group.ids.filter(id => solved.has(id)).length,
        stars: group.quests.reduce((total, quest) => total + Math.max(0, Math.min(3, Number(g.questStars[quest.id]) || 0)), 0),
        complete, unlocked: previousComplete };
      previousComplete = previousComplete && complete;
      return entry;
    });
    const current = entries.find(entry => !entry.complete) || null;
    return { kingdoms: entries, current,
      completedCount: entries.reduce((total, entry) => total + entry.completedCount, 0), complete: !current };
  }
  function recordCompleted(state, q) {
    if (!q || !questions[q.id] || questions[q.id].grade !== q.grade) return false;
    recordSeen(state, q);
    const g = gradeState(state, q.grade);
    if (g.completed.includes(q.id)) return false;
    g.completed.push(q.id);
    return true;
  }
  function nextQuest(state, grade) {
    const progress = journey(state, grade);
    if (!progress.current) return null;
    const completed = new Set(gradeState(state, Number(grade)).completed);
    return progress.current.quests.find(quest => quest.ids.some(id => !completed.has(id))) || null;
  }
  function questSession(state, grade, questId, { replay = false } = {}) {
    if (!validGrade(grade)) return null;
    grade = Number(grade);
    const quest = bank[grade].quests.find(q => q.id === questId);
    if (!quest) return null;
    const g = gradeState(state, grade), completed = new Set(g.completed), solved = new Set(g.solved);
    const firstUnfinished = quest.ids.findIndex(id => !completed.has(id));
    const saved = normalizeSession(state.resume);
    const matchesSaved = saved && saved.mode === 'quest' && saved.grade === grade && saved.questId === quest.id;
    // Older answered checkpoints can predate settlement of quest rewards. Keep
    // a pending answer so the UI can settle its stars instead of replaying the
    // whole quest. An explicit replay always starts a fresh attempt.
    if (!replay && matchesSaved && saved.answered && !saved.rewarded && !saved.replay) return saved;
    const isReplay = Boolean(replay) || firstUnfinished < 0;
    const skippedClean = quest.ids.filter(id => completed.has(id) && solved.has(id)).length;
    if (!isReplay && matchesSaved) {
      if (saved.replay || !completed.has(saved.ids[saved.index])) return saved;
      // The main progress ledger can be newer than a hub checkpoint. Do not
      // reopen an already finished story with its stale input or help flags.
      const next = quest.ids.findIndex((id, index) => index >= saved.index && !completed.has(id));
      return { ...saved, index: next < 0 ? firstUnfinished : next, clean: skippedClean,
        attempts: 0, helped: false, answered: false, revealed: false, replay: false,
        rewarded: false, stars: 0, stayForExplanation: false, draft: '', notes: '' };
    }
    return { grade, mode: 'quest', questId: quest.id, ids: quest.ids.slice(), index: isReplay ? 0 : firstUnfinished,
      clean: isReplay ? 0 : skippedClean,
      attempts: 0, helped: false, answered: false, revealed: false, replay: isReplay,
      rewarded: false, stars: 0,
      stayForExplanation: false, draft: '', notes: '', earned: [] };
  }
  function parseAnswer(raw) {
    const text = String(raw).trim();
    // Strict, whole-field matching: reject blank input, trailing words, zero
    // denominators, scientific notation, and ambiguous multi-slash entries.
    const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    const frac = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    let n;
    if (mixed) n = Number(mixed[3]) ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : NaN;
    else if (frac) n = Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : NaN;
    else if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) n = Number(text);
    else return null;
    return Number.isFinite(n) ? n : null;
  }
  const correct = (q, value) => value !== null && Math.abs(q.answer - value) < 1e-9;
  function recordSeen(state, q) {
    const g = gradeState(state, q.grade);
    if (!g.seen.includes(q.id)) g.seen.push(q.id);
  }
  function recordSolve(state, q, independent) {
    recordSeen(state, q);
    if (!independent) return [];
    const g = gradeState(state, q.grade);
    const before = g.solved.length;
    if (!g.solved.includes(q.id)) g.solved.push(q.id);
    return milestones.filter(m => m[0] > before && m[0] <= g.solved.length).map(m => m[0]);
  }
  function wrongKey(q) { return 'Grade ' + q.grade + ': ' + q.skill; }
  function recordWrong(store, q, answer, tag = 'try-again') {
    if (!store.byType || typeof store.byType !== 'object') store.byType = {};
    const key = wrongKey(q);
    const records = Array.isArray(store.byType[key]) ? store.byType[key] : (store.byType[key] = []);
    const now = new Date().toISOString();
    let rec = records.find(r => r && r.qid === q.id);
    if (!rec) {
      rec = { qid: q.id, grade: q.grade, missCount: 0, yourAnswers: [], errorTags: [], firstMissedAt: now };
      records.push(rec);
    }
    rec.missCount += 1;
    rec.lastMissedAt = now;
    rec.correctAnswer = q.answerText;
    rec.questionSnapshot = { text: q.text, answer: q.answerText, unit: q.unit, grade: q.grade };
    if (answer !== null) rec.yourAnswers = (rec.yourAnswers || []).concat(answer).slice(-5);
    rec.errorTags = [...new Set((rec.errorTags || []).concat(tag))].slice(-5);
    store.v = 2;
  }
  function resolveWrong(store, q) {
    const key = wrongKey(q);
    if (store.byType && Array.isArray(store.byType[key])) store.byType[key] = store.byType[key].filter(r => r.qid !== q.id);
  }
  function practiceIds(store, grade) {
    const records = Object.values(store.byType || {}).flat().filter(r => r && questions[r.qid] && questions[r.qid].grade === grade);
    records.sort((a, b) => String(a.lastMissedAt || '').localeCompare(String(b.lastMissedAt || '')));
    return [...new Set(records.map(r => r.qid))];
  }
  window.WPA_GradeCore = { bank, questions, milestones, empty, gradeState, normalize, normalizeSession,
    kingdoms, journey, recordCompleted, nextQuest, questSession,
    parseAnswer, correct, recordSeen, recordSolve, recordWrong, resolveWrong, practiceIds };
})();
