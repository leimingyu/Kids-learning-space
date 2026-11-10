/* Logic Detectives: offline missions, profile-scoped checkpoints, and exact replay practice. */
(function () {
  'use strict';
  const E = window.LogicDetectivesEngine;
  const catalog = E.puzzles.concat(E.conceptPuzzles || []);
  const conceptTypes = ['magic', 'parentheses', 'rule'];
  const $ = id => document.getElementById(id);
  const bridge = window.KLS && window.KLS.bridge;
  const state = { grade: 2, run: null, cases: new Map(), conceptRuns: new Map(), notes: new Map(), svgId: 0, ready: false, suspended: false, main: {}, error: '', sentStars: new Map(), sentBadges: new Set(), pendingSessions: [] };
  let tableView = null;
  const store = window.LogicDetectivesStore.create({
    storage: { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: key => window.localStorage.removeItem(key) },
    bridge, onError: storageError, onRecovered: () => storageError('')
  });
  const names = { circle: 'Circle', triangle: 'Triangle', square: 'Square', rectangle: 'Rectangle', notch: 'Notched flag', pennant: 'Triangle flag', empty: 'Empty', stripe: 'Striped', solid: 'Solid' };
  const typeNames = { pattern: 'Pattern clues', table: 'Number machine', sticks: 'Stick repair', magic: 'Magic Square Lab', parentheses: 'Parentheses Workshop', rule: 'Rule Detective' };
  const segmentGeometry = {
    a: { left: 18, top: 4, width: 48, height: 10 }, b: { left: 66, top: 16, width: 10, height: 43 },
    c: { left: 66, top: 71, width: 10, height: 43 }, d: { left: 18, top: 116, width: 48, height: 10 },
    e: { left: 7, top: 71, width: 10, height: 43 }, f: { left: 7, top: 16, width: 10, height: 43 },
    g: { left: 18, top: 60, width: 48, height: 10 }, h: { left: 13, top: 60, width: 48, height: 10 },
    v: { left: 32, top: 41, width: 10, height: 48 }, h1: { left: 13, top: 47, width: 48, height: 10 }, h2: { left: 13, top: 77, width: 48, height: 10 }
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const copy = value => JSON.parse(JSON.stringify(value));
  function escapeHTML(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function puzzle() { return catalog.find(p => p.id === state.run.ids[state.run.index]); }
  function isConcept(p) { return conceptTypes.includes(p.type); }
  function validate(p, d) {
    if (p.type === 'pattern') return E.validatePattern(p, d.answers);
    if (p.type === 'table') return E.validateTable(p, d.answers);
    if (p.type === 'sticks') return E.evaluateSticks(p, d.sticks);
    if (p.type === 'magic') return E.validateMagic(p, d.answers);
    if (p.type === 'parentheses') return E.validateParentheses(p, d.answers);
    if (p.type === 'rule') return E.validateRule(p, d.answers);
    return { correct: false, missing: true, message: 'Return to the case board to choose a puzzle.' };
  }
  function current() { return state.run.drafts[state.run.index]; }
  function makeDraft(p) { return { answers: {}, selected: p.blanks?.[0] ?? null, sticks: p.type === 'sticks' ? E.makeStickState(p) : null, selectedStick: null, history: [], hints: 0, mistakes: 0, solved: false }; }
  function storageError(message) {
    state.error = String(message || '');
    $('storage-notice').hidden = !message;
    $('storage-message').textContent = message ? 'Progress could not be saved. ' + message + ' Keep this page open and try saving again.' : '';
  }
  function descriptor() {
    const run = state.run;
    return { version: 1, grade: state.grade, caseId: run?.mode === 'case' && !run.complete ? run.id : state.main.lastRun?.caseId || null, ...(run?.mode === 'concept' && !run.complete ? { conceptType: run.type } : {}) };
  }
  function persist(checkpoint = false) {
    if (!state.ready || state.suspended) return { ok: false, error: 'Waiting for the active profile.' };
    state.main.grade = state.grade;
    state.main.cases = { ...(state.main.cases || {}), ...Object.fromEntries(state.cases) };
    state.main.conceptRuns = { ...(state.main.conceptRuns || {}), ...Object.fromEntries(state.conceptRuns) };
    if (state.run?.mode === 'case') state.main.lastRun = state.run.complete ? null : { caseId: state.run.id, grade: state.run.grade };
    const result = checkpoint ? store.flush(state.main, Object.fromEntries(state.notes)) : store.write(state.main, Object.fromEntries(state.notes));
    if (result.ok) syncHubRewards();
    if (!checkpoint) bridge?.saveState(descriptor(), result);
    return result;
  }
  function syncHubRewards() {
    for (const c of E.cases) {
      const stars = state.main.completed[c.id]?.stars || 0;
      if (stars > (state.sentStars.get(c.id) || 0)) { bridge?.stars(c.id, stars); state.sentStars.set(c.id, stars); }
    }
    for (const id of state.main.badges) if (!state.sentBadges.has(id)) { bridge?.sticker('logic-detectives-' + id); state.sentBadges.add(id); }
    for (const session of state.pendingSessions.splice(0)) bridge?.session(session.level, session.stats);
  }
  function unresolved() { return [...state.notes.entries()].filter(([id, note]) => { const p = catalog.find(q => q.id === id); return p && p.grade === state.grade && note.questionId === id && note.grade === p.grade && note.resolved !== true; }).map(([, note]) => note); }
  function screen(name) {
    if (name !== 'play') { tableView?.destroy(); tableView = null; }
    for (const s of ['home', 'play', 'complete']) $(s + '-screen').hidden = s !== name;
    $('home-button').hidden = name === 'home';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function home() {
    if (!state.ready || state.suspended) return;
    screen('home');
    for (const button of document.querySelectorAll('[data-grade]')) {
      const active = Number(button.dataset.grade) === state.grade;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    const gradeCases = E.cases.filter(c => c.grade === state.grade);
    const unfinished = gradeCases.find(c => c.id === state.main.lastRun?.caseId && state.cases.has(c.id) && !state.cases.get(c.id).complete) || gradeCases.find(c => state.cases.has(c.id) && !state.cases.get(c.id).complete);
    const recommended = unfinished || gradeCases.find(c => !state.main.completed[c.id]) || gradeCases[0];
    $('case-label').textContent = `GRADE ${state.grade} · CASE ${recommended.number} OF 6`;
    $('case-title').textContent = recommended.title; $('case-description').textContent = recommended.scene;
    $('stick-quick-label').innerHTML = 'Remove or move a stick <span aria-hidden="true">↗</span>';
    $('start-case').innerHTML = (unfinished ? 'Continue your case' : 'Open the next case') + ' <span aria-hidden="true">→</span>';
    $('start-case').dataset.caseId = recommended.id;
    const completed = gradeCases.filter(c => state.main.completed[c.id]).length;
    const stars = gradeCases.reduce((total, c) => total + (state.main.completed[c.id]?.stars || 0), 0);
    $('progress-overview').innerHTML = `<span class="progress-pill">${completed} of 6 cases closed</span><span class="progress-pill">${stars} / 18 stars</span><span class="progress-pill">${E.puzzles.filter(p => p.grade === state.grade && state.main.mastery[p.id]).length} clues solved independently</span>`;
    $('mission-grid').innerHTML = gradeCases.map(c => {
      const done = state.main.completed[c.id], run = state.cases.get(c.id), inProgress = run && !run.complete;
      return `<button class="mission-card ${done ? 'completed' : ''} ${inProgress ? 'current' : ''}" data-case="${c.id}"><span class="mission-number">${String(c.number).padStart(2, '0')}</span><span class="mission-name">${escapeHTML(c.title)}</span><span class="mission-scene">${escapeHTML(c.scene)}</span><span class="mission-meta">5 puzzles · ${c.number <= 2 ? 'Discover' : c.number <= 4 ? 'Connect' : 'Challenge'}</span><span class="mission-status">${inProgress ? `Continue at clue ${run.index + 1}` : done ? 'Case closed · Play again' : 'Open this case'} <span class="mission-stars" aria-label="${done?.stars || 0} of 3 stars">${'★'.repeat(done?.stars || 0)}${'☆'.repeat(3 - (done?.stars || 0))}</span></span></button>`;
    }).join('');
    for (const button of document.querySelectorAll('[data-case]')) button.addEventListener('click', () => start('case', null, button.dataset.case));
    $('skill-summary').innerHTML = ['pattern', 'table', 'sticks'].map(type => {
      const qs = E.puzzles.filter(p => p.grade === state.grade && p.type === type);
      return `<div class="skill-card"><strong>${qs.filter(p => state.main.mastery[p.id]).length} / ${qs.length}</strong><span>${typeNames[type]} solved independently</span></div>`;
    }).join('');
    $('badge-row').innerHTML = state.main.badges.length ? state.main.badges.map(id => `<span class="badge-chip earned">✦ ${escapeHTML(badgeName(id))}</span>`).join('') : '<span class="badge-chip">Your first case badge is waiting.</span>';
    $('concept-section').hidden = state.grade !== 3;
    for (const type of conceptTypes) {
      const qs = catalog.filter(p => p.grade === 3 && p.type === type);
      const run = state.conceptRuns.get(type);
      const summary = document.querySelector(`[data-concept-progress="${type}"]`);
      summary.textContent = run && !run.complete ? `Continue at puzzle ${run.index + 1} of ${run.ids.length}` : `${qs.filter(p => state.main.conceptMastery[p.id] === true).length} / ${qs.length} solved independently · 5 per practice`;
    }
    const n = unresolved().length;
    $('practice-count').textContent = String(n); $('practice-button').disabled = n === 0;
    $('practice-summary').textContent = n ? `${n} tricky ${n === 1 ? 'puzzle is' : 'puzzles are'} ready for another look in Grade ${state.grade}.` : 'Tricky puzzles will collect here while you play.';
  }
  function start(mode, type, caseId) {
    if (!state.ready || state.suspended) return;
    if (mode === 'concept' && (state.grade !== 3 || !conceptTypes.includes(type))) return;
    const c = mode === 'case' ? E.cases.find(item => item.id === caseId && item.grade === state.grade) : null;
    const mastery = mode === 'concept' ? state.main.conceptMastery : state.main.mastery;
    const ids = mode === 'case' ? (c?.puzzleIds || []) : mode === 'practice' ? unresolved().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp))).slice(0, 5).map(note => note.questionId).filter(id => catalog.some(p => p.id === id)) : catalog.filter(p => p.grade === state.grade && p.type === type).sort((a, b) => Number(!!mastery[a.id]) - Number(!!mastery[b.id])).map(p => p.id).slice(0, 5);
    if (!ids.length) return;
    if (mode === 'case' && state.cases.has(c.id) && !state.cases.get(c.id).complete) { state.run = state.cases.get(c.id); persist(); renderPuzzle(); return; }
    if (mode === 'concept' && state.conceptRuns.has(type) && !state.conceptRuns.get(type).complete) { state.run = state.conceptRuns.get(type); persist(); renderPuzzle(); return; }
    state.run = { id: c?.id || (mode === 'concept' ? `g3-concept-${type}` : `${mode}-${state.grade}`), mode, grade: state.grade, ...(mode === 'concept' ? { type } : {}), ids, index: 0, drafts: ids.map(id => makeDraft(catalog.find(p => p.id === id))), complete: false };
    if (mode === 'case') state.cases.set(c.id, state.run);
    if (mode === 'concept') state.conceptRuns.set(type, state.run);
    bridge?.played(); persist();
    renderPuzzle();
  }
  function say(message, status = 'neutral') { $('feedback').textContent = message; $('feedback').className = 'feedback ' + status; }
  function renderPuzzle(focus = true) {
    const p = puzzle(), d = current();
    screen('play');
    $('run-label').textContent = `Grade ${state.grade} / ${state.run.mode === 'case' ? E.cases.find(c => c.id === state.run.id).title : state.run.mode === 'practice' ? 'Practice tricky puzzles' : state.run.mode === 'concept' ? 'New concepts · ' + typeNames[p.type] : 'Quick practice'}`;
    $('mission-track').innerHTML = state.run.ids.map((id, i) => `<span class="track-step ${i === state.run.index ? 'current' : ''} ${state.run.drafts[i].solved ? 'done' : ''}" aria-label="Clue ${i + 1}${state.run.drafts[i].solved ? ', solved' : i === state.run.index ? ', current' : ''}">${state.run.drafts[i].solved ? '✓' : i + 1}</span>`).join('');
    $('puzzle-type').textContent = typeNames[p.type] + (p.kind === 'flags' ? ' · Flags' : p.kind === 'shapes' ? ' · Shapes' : '');
    $('step-count').textContent = `Clue ${state.run.index + 1} of ${state.run.ids.length}`;
    $('puzzle-title').textContent = p.title; $('scene-text').textContent = p.scene;
    $('instruction').textContent = p.type === 'pattern' ? (p.inputMode === 'choose' ? 'Choose the piece that completes the grid.' : `Build ${p.blanks.length === 1 ? 'the' : p.blanks.length === 2 ? 'both' : 'all ' + p.blanks.length} missing ${p.blanks.length === 1 ? 'picture' : 'pictures'}. Check each feature.`) : p.type === 'table' ? 'Find the missing numbers. Watch a row to see the rule.' : 'Repair this false equation. Try an idea, then check it.';
    $('rule-banner').textContent = p.type === 'pattern' ? (p.kind === 'flags' ? 'Each row AND column needs one of each flag shape and one of each filling.' : 'Each row AND column needs one of each outside shape, inside shape, and filling.') : p.type === 'table' ? 'Starting number + top adding number = sum.' : (p.action === 'remove' ? 'Remove exactly ONE stick. Keep every digit valid and keep the equals sign.' : 'Move exactly ONE stick to an empty position. Keep every digit valid and keep the equals sign.');
    $('partner-text').textContent = p.type === 'pattern' ? 'Look at the shape and the filling separately. They each have a job to do.' : p.type === 'table' ? 'Watch a row: the blue starting number stays the same. Add each pink top number to make its purple sum.' : 'The numbers and the operation sign are both clues. Undo is always here.';
    if (isConcept(p)) {
      $('instruction').textContent = p.instruction;
      $('rule-banner').textContent = p.rule;
      $('partner-text').textContent = p.type === 'magic' ? 'Look for a line with just one missing number. Remember both diagonals.' : p.type === 'parentheses' ? 'Open the parentheses without changing the value. Click ? to choose the missing sign.' : 'Test the same rule on every row. A missing input asks you to work backward.';
    }
    renderBody(); renderHint();
    $('visual-explanation').hidden = !d.solved;
    $('check-answer').hidden = d.solved; $('reset-answer').hidden = d.solved;
    $('next-puzzle').hidden = !d.solved; $('next-puzzle').disabled = false;
    const finishLabel = state.run.mode === 'case' ? 'Finish the case' : state.run.mode === 'practice' || state.run.mode === 'concept' ? 'Finish practice' : 'Finish try-out';
    $('next-puzzle').innerHTML = (state.run.index === state.run.ids.length - 1 ? finishLabel : 'Next clue') + ' <span aria-hidden="true">→</span>';
    if (d.solved) { renderExplanation(); say(p.explanationShort || p.explanation, 'success'); }
    else say('Take a look at the clues. You can change your answer before checking.');
    if (focus) $('puzzle-title').focus({ preventScroll: true });
  }
  function shapeSVG(piece, kind, extraClass = '') {
    if (!piece) return '<span class="missing-mark" aria-hidden="true">?</span>';
    const id = 'stripe-' + (++state.svgId);
    const ink = 'var(--piece-ink, #206676)';
    const fill = piece.fill === 'solid' ? ink : piece.fill === 'stripe' ? `url(#${id})` : 'transparent';
    const def = `<defs><pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(42)"><path d="M0 0V8" stroke="${ink}" stroke-width="3"/></pattern></defs>`;
    let graphic = '';
    if (kind === 'flags') {
      const flag = piece.outer === 'rectangle' ? '<rect x="23" y="15" width="65" height="47"' : piece.outer === 'notch' ? '<polygon points="23,15 88,15 66,39 88,62 23,62"' : '<polygon points="23,15 88,39 23,62"';
      graphic = `<path d="M20 9V91" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/>${piece.outer ? `${flag} fill="${fill}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>` : ''}`;
    } else {
      const outer = { circle: '<circle cx="50" cy="50" r="43"', triangle: '<polygon points="50,5 95,91 5,91"', square: '<rect x="9" y="9" width="82" height="82"' };
      const inner = { circle: '<circle cx="50" cy="53" r="17"', triangle: '<polygon points="50,32 68,67 32,67"', square: '<rect x="33" y="35" width="34" height="34"' };
      if (piece.outer) graphic += `${outer[piece.outer]} fill="none" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`;
      if (piece.inner) graphic += `<g${piece.outer === 'triangle' ? ' transform="translate(0,9)"' : ''}>${inner[piece.inner]} fill="${fill}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/></g>`;
    }
    return `<svg viewBox="0 0 100 100" class="pattern-svg ${extraClass}" aria-hidden="true">${def}${graphic}</svg>`;
  }
  function pieceName(piece, kind) {
    if (!piece) return 'Missing picture';
    if (kind === 'flags') return `${names[piece.fill] || 'Choose a filling'} ${names[piece.outer]?.toLowerCase() || 'flag'}`;
    return `${names[piece.outer] || 'Choose an outside shape'} outside, ${names[piece.fill]?.toLowerCase() || 'choose a filling for the'} ${names[piece.inner]?.toLowerCase() || 'inside shape'} inside`;
  }
  function renderBody() {
    const p = puzzle();
    tableView?.destroy(); tableView = null;
    if (p.type === 'pattern') renderPattern(); else if (p.type === 'table') renderTable(); else if (p.type === 'sticks') renderSticks(); else if (isConcept(p)) renderConcept();
  }
  function renderPattern() {
    const p = puzzle(), d = current();
    $('puzzle-area').innerHTML = `<div class="pattern-layout"><div><div class="pattern-grid" role="group" aria-label="Picture grid">${p.cells.map((cell, i) => {
      const blank = p.blanks.includes(i), piece = blank ? d.answers[i] : cell;
      const content = shapeSVG(piece, p.kind) + (blank ? `<span class="cell-label">${i === d.selected ? 'Building here' : piece ? 'Your piece' : 'Click to build'}</span>` : '');
      const label = `Row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1}: ${pieceName(piece, p.kind)}`;
      return blank ? `<button class="pattern-cell blank ${i === d.selected ? 'selected' : ''} ${piece ? 'filled' : ''}" data-cell="${i}" aria-label="${escapeHTML(label)}" aria-pressed="${i === d.selected}" ${d.solved ? 'disabled' : ''}>${content}</button>` : `<div class="pattern-cell" role="img" aria-label="${escapeHTML(label)}">${content}</div>`;
    }).join('')}</div><p class="palette-note">${p.blanks.length > 1 ? 'Click a missing picture to work on it.' : 'Check both the row and the column.'}</p></div><div class="piece-builder" id="piece-builder"></div></div>`;
    for (const button of document.querySelectorAll('[data-cell]')) button.addEventListener('click', () => { d.selected = Number(button.dataset.cell); persist(); renderPattern(); document.querySelector(`[data-cell="${d.selected}"]`)?.focus(); });
    renderBuilder();
    if (d.hints) markPatternClues();
  }
  function renderBuilder() {
    const p = puzzle(), d = current(), index = d.selected;
    const answer = d.answers[index] || {};
    if (d.solved) { $('piece-builder').innerHTML = '<h3 class="builder-heading">Every clue fits.</h3><p>Look at your completed grid. Each row and column follows the rule.</p>'; return; }
    if (p.inputMode === 'choose') {
      const right = p.cells[index];
      const outers = p.kind === 'flags' ? ['rectangle', 'notch', 'pennant'] : ['circle', 'triangle', 'square'];
      const candidates = [copy(right), { ...right, fill: ['empty', 'stripe', 'solid'][(['empty', 'stripe', 'solid'].indexOf(right.fill) + 1) % 3] }, { ...right, outer: outers[(outers.indexOf(right.outer) + 1) % 3] }];
      const shift = index % 3; const choices = candidates.slice(shift).concat(candidates.slice(0, shift));
      $('piece-builder').innerHTML = `<h3 class="builder-heading">Which piece belongs?</h3><p class="palette-note">Click a piece, then check your idea.</p><div class="complete-pieces">${choices.map((candidate, i) => `<button class="choice-button whole-piece" data-piece="${i}" aria-label="${escapeHTML(pieceName(candidate, p.kind))}" aria-pressed="${same(answer, candidate)}">${shapeSVG(candidate, p.kind)}<span>Piece ${String.fromCharCode(65 + i)}</span></button>`).join('')}</div>`;
      for (const button of document.querySelectorAll('[data-piece]')) button.addEventListener('click', () => { d.answers[index] = copy(choices[Number(button.dataset.piece)]); persist(); renderPattern(); document.querySelector(`[data-piece="${button.dataset.piece}"]`)?.focus(); say('Your piece is in the grid. Check whether all its features fit.'); });
    } else {
      const groups = [{ key: 'outer', label: p.kind === 'flags' ? '1. Flag shape' : '1. Outside shape', options: p.kind === 'flags' ? ['rectangle', 'notch', 'pennant'] : ['circle', 'triangle', 'square'] }];
      if (p.kind !== 'flags') groups.push({ key: 'inner', label: '2. Inside shape', options: ['circle', 'triangle', 'square'] });
      groups.push({ key: 'fill', label: p.kind === 'flags' ? '2. Filling' : '3. Inside filling', options: ['empty', 'stripe', 'solid'] });
      $('piece-builder').innerHTML = `<h3 class="builder-heading">Build your missing picture</h3><p class="palette-note">Row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}</p>${groups.map(group => `<div class="builder-group"><strong>${group.label}</strong><div class="builder-options" role="group" aria-label="${group.label}">${group.options.map(option => `<button class="choice-button" data-feature="${group.key}" data-value="${option}" aria-pressed="${answer[group.key] === option}">${group.key === 'fill' ? `<span class="choice-swatch ${option}" aria-hidden="true"></span>` : ''}${names[option]}</button>`).join('')}</div></div>`).join('')}<div class="preview-piece"><span class="preview-title">Your picture</span>${Object.keys(answer).length ? shapeSVG(answer, p.kind) : '<span class="missing-mark">?</span>'}</div>`;
      for (const button of document.querySelectorAll('[data-feature]')) {
        if (button.dataset.feature !== 'fill') button.insertAdjacentHTML('afterbegin', shapeSVG({ outer: button.dataset.value, fill: 'empty' }, button.dataset.feature === 'outer' ? p.kind : 'shapes'));
        button.addEventListener('click', () => { d.answers[index] = { ...answer, [button.dataset.feature]: button.dataset.value }; persist(); renderPattern(); document.querySelector(`[data-feature="${button.dataset.feature}"][data-value="${button.dataset.value}"]`)?.focus(); });
      }
    }
  }
  function markPatternClues() {
    const d = current();
    if (d.selected === null) return;
    const cells = [...document.querySelectorAll('.pattern-cell')];
    cells.forEach((cell, i) => cell.classList.toggle('hinted', i !== d.selected && (Math.floor(i / 3) === Math.floor(d.selected / 3) || i % 3 === d.selected % 3)));
  }
  function renderTable() {
    const p = puzzle(), d = current();
    tableView = window.LogicDetectivesRowDemo.mount({
      puzzle: p, draft: d, engine: E,
      onInput: (key, value) => { d.answers[key] = value; persist(); },
      onSelect: key => { if (d.selected !== key) { d.selected = key; persist(); } },
      onCheck: check,
      isActive: () => state.ready && !state.suspended && !$('play-screen').hidden
    });
  }
  function mathSign(value) { return value === '-' ? '−' : '+'; }
  function conceptField(p, key, label, classes = '') {
    const d = current(), value = String(d.answers[key] ?? '');
    if (key === 'sign') return `<select class="concept-sign ${classes}" data-concept-answer="${key}" aria-label="${escapeHTML(label)}" ${d.solved ? 'disabled' : ''}><option value="" disabled hidden>?</option><option value="+">+</option><option value="-">−</option></select>`;
    return `<input class="concept-number ${classes}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" data-concept-answer="${key}" aria-label="${escapeHTML(label)}" value="${escapeHTML(value)}" ${d.solved ? 'disabled' : ''}>`;
  }
  function renderConcept() {
    const p = puzzle(), d = current();
    const stage = ({ discover: 'Discover', connect: 'Connect', challenge: 'Challenge' })[p.conceptStage] || 'Practice';
    let body = '';
    if (p.type === 'magic') {
      body = `<div class="magic-layout"><div class="magic-grid" role="group" aria-label="Magic square">${p.cells.map((value, index) => {
        const label = `Row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}`;
        return p.blanks.includes('m' + index) ? `<div class="magic-cell">${conceptField(p, 'm' + index, label, 'magic-input')}</div>` : `<div class="magic-cell magic-given" aria-label="${label}: ${value}">${value}</div>`;
      }).join('')}</div><div class="magic-sum"><span>Magic sum</span>${p.blanks.includes('sum') ? conceptField(p, 'sum', 'Magic sum') : `<strong>${p.magicSum}</strong>`}<p>3 rows · 3 columns<br>2 diagonals</p></div></div>`;
    } else if (p.type === 'parentheses') {
      const sign = index => p.signIndex === index ? conceptField(p, 'sign', `Choose the sign before ${index === 0 ? p.b : p.c}`) : `<span>${mathSign(p.rewriteSigns[index])}</span>`;
      body = `<p class="concept-equation">${p.a} ${mathSign(p.outer)} (${p.b} ${mathSign(p.inner)} ${p.c})</p><div class="concept-equation" role="group" aria-label="Equivalent expression without parentheses"><span>= ${p.a}</span>${sign(0)}<span>${p.b}</span>${sign(1)}<span>${p.c}</span></div><p class="concept-progress">Click ? to choose + or −. Keep the value the same.</p>`;
    } else if (p.type === 'rule') {
      const field = (key, value, label) => p.blanks.includes(key) ? conceptField(p, key, label) : `<span>${value}</span>`;
      body = `<div class="rule-machine"><table class="concept-table"><caption>Use the same rule in every row.</caption><thead><tr><th scope="col">X · Input</th><th scope="col">Y · Output</th></tr></thead><tbody>${p.pairs.map((pair, index) => `<tr><td>${field('x' + index, pair.x, `Input in row ${index + 1}`)}</td><td>${field('y' + index, pair.y, `Output in row ${index + 1}`)}</td></tr>`).join('')}</tbody></table><div><p>My rule</p><div class="rule-formula"><span>Y = X</span>${p.blanks.includes('sign') ? conceptField(p, 'sign', 'Choose the rule sign') : `<span>${mathSign(p.ruleSign)}</span>`}${field('amount', p.ruleAmount, 'Rule amount')}</div><p class="concept-progress">One addition or subtraction rule, from X to Y.</p></div></div>`;
    }
    $('puzzle-area').innerHTML = `<div class="concept-workspace"><span class="concept-stage">${stage}</span>${body}</div>`;
    const fields = [...document.querySelectorAll('[data-concept-answer]')];
    for (const field of fields) {
      const key = field.dataset.conceptAnswer;
      field.value = String(d.answers[key] ?? '');
      field.addEventListener('focus', () => { if (!d.solved && d.selected !== key) { d.selected = key; persist(); } });
      const saveAnswer = () => {
        if (!state.ready || state.suspended || d.solved) return;
        if (key === 'sign') { if (!['', '+', '-'].includes(field.value)) return; }
        else field.value = field.value.replace(/[^0-9]/g, '').slice(0, 4);
        d.answers[key] = field.value; d.selected = key; persist();
      };
      field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', saveAnswer);
      field.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey || d.solved) return;
        if (key === 'sign' && ['+', '=', '-', '−'].includes(event.key)) { event.preventDefault(); field.value = event.key === '-' || event.key === '−' ? '-' : '+'; saveAnswer(); }
        else if (field.tagName !== 'SELECT' && event.key === 'Enter') { event.preventDefault(); check(); }
      });
    }
  }
  function allowedSegments(symbol) { return /^[0-9]$/.test(symbol) ? ['a', 'b', 'c', 'd', 'e', 'f', 'g'] : symbol === '=' ? ['h1', 'h2'] : ['h', 'v']; }
  function changes() {
    const initial = E.makeStickState(puzzle()), now = current().sticks;
    let removed = 0, added = 0;
    initial.forEach((segments, i) => { removed += segments.filter(s => !now[i].includes(s)).length; added += now[i].filter(s => !segments.includes(s)).length; });
    return { removed, added };
  }
  function renderSticks() {
    const p = puzzle(), d = current(), selected = d.selectedStick;
    const delta = changes();
    $('puzzle-area').innerHTML = `<div class="sticks-help">${p.action === 'remove' ? 'Click a colored stick to remove it. Click its outline to put it back.' : 'Click a colored stick, then an empty outline. Or drag the stick onto an empty outline.'}</div><div class="stick-board" role="group" aria-label="Interactive stick equation">${p.symbols.map((symbol, i) => `<div class="digit-unit ${symbol === '=' ? 'equals-unit' : ''}" aria-label="Equation position ${i + 1}">${allowedSegments(symbol).map(segment => {
      const geo = segmentGeometry[segment], on = d.sticks[i].includes(segment), isSelected = selected?.i === i && selected?.segment === segment;
      const original = E.makeStickState(p)[i].includes(segment), editable = symbol !== '=' && !d.solved;
      return `<button type="button" class="stick-segment ${on ? 'on' : 'off'} ${isSelected ? 'selected' : ''} ${original && !on ? 'removed' : ''} ${selected && !on && editable ? 'target' : ''}" style="left:${geo.left}px;top:${geo.top}px;width:${geo.width}px;height:${geo.height}px" data-position="${i}" data-segment="${segment}" aria-label="Position ${i + 1}, ${segmentName(segment)}, ${on ? 'stick present' : 'empty position'}" aria-pressed="${isSelected}" ${editable ? '' : 'disabled'} draggable="${editable && on && p.action === 'move'}"></button>`;
    }).join('')}</div>`).join('')}</div><div class="equation-preview" id="equation-preview" aria-live="polite"></div><p class="move-status" id="move-status">${p.action === 'remove' ? `${delta.removed} of 1 stick removed` : `${delta.removed} stick removed · ${delta.added} stick placed`}</p><div class="stick-controls"><button class="button secondary small" id="undo-stick" ${!d.history.length || d.solved ? 'disabled' : ''}>↶ Undo</button><button class="button ghost small" id="cancel-stick" ${!selected || d.solved ? 'disabled' : ''}>Cancel selection</button><span class="legend">${p.action === 'move' ? 'Empty outlines are possible destinations.' : 'The equals sign stays in place.'}</span></div>`;
    updateEquationPreview();
    for (const button of document.querySelectorAll('[data-segment]')) {
      button.addEventListener('click', () => stickClick(Number(button.dataset.position), button.dataset.segment));
      button.addEventListener('dragstart', event => { const changed = changes(); if (p.action !== 'move' || changed.removed || changed.added || d.solved || !d.sticks[Number(button.dataset.position)].includes(button.dataset.segment)) { event.preventDefault(); return; } d.selectedStick = { i: Number(button.dataset.position), segment: button.dataset.segment }; event.dataTransfer.setData('text/plain', JSON.stringify(d.selectedStick)); event.dataTransfer.effectAllowed = 'move'; button.classList.add('selected'); document.querySelectorAll('.stick-segment.off:not(:disabled)').forEach(target => target.classList.add('target')); });
      button.addEventListener('dragover', event => { if (d.selectedStick && !d.sticks[Number(button.dataset.position)].includes(button.dataset.segment) && !button.disabled) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } });
      button.addEventListener('drop', event => { event.preventDefault(); if (d.selectedStick) stickClick(Number(button.dataset.position), button.dataset.segment); });
      button.addEventListener('dragend', () => { if (d.selectedStick) { d.selectedStick = null; renderSticks(); } });
    }
    $('undo-stick').addEventListener('click', () => { d.sticks = d.history.pop(); d.selectedStick = null; persist(); renderSticks(); say('Your last change is undone. Try another idea.'); });
    $('cancel-stick').addEventListener('click', () => { d.selectedStick = null; renderSticks(); });
  }
  function segmentName(segment) { return ({ a: 'top', b: 'upper right', c: 'lower right', d: 'bottom', e: 'lower left', f: 'upper left', g: 'middle', h: 'horizontal operation stick', v: 'vertical operation stick', h1: 'upper equals stick', h2: 'lower equals stick' })[segment]; }
  function stickClick(i, segment) {
    const p = puzzle(), d = current();
    if (d.solved || p.symbols[i] === '=') return;
    const on = d.sticks[i].includes(segment), delta = changes();
    if (p.action === 'remove') {
      const original = E.makeStickState(p)[i].includes(segment);
      if (!original) { say('This case lets you remove a stick. Choose a colored stick.'); return; }
      if (on && delta.removed) { say('Exactly one stick can be removed. Use Undo to try a different one.'); return; }
      d.history.push(copy(d.sticks));
      d.sticks[i] = on ? d.sticks[i].filter(s => s !== segment) : [...d.sticks[i], segment];
    } else if (on) {
      if (delta.removed || delta.added) { say('You have moved one stick. Check your equation or use Undo.'); return; }
      d.selectedStick = d.selectedStick?.i === i && d.selectedStick?.segment === segment ? null : { i, segment };
    } else {
      if (!d.selectedStick) { say('First click a colored stick to pick it up.'); return; }
      if (delta.removed || delta.added) { say('Use Undo before trying a different move.'); d.selectedStick = null; renderSticks(); return; }
      d.history.push(copy(d.sticks));
      const from = d.selectedStick;
      d.sticks[from.i] = d.sticks[from.i].filter(s => s !== from.segment);
      d.sticks[i] = [...d.sticks[i], segment]; d.selectedStick = null;
    }
    d.history = d.history.slice(-20); persist(); renderSticks();
    if (p.action === 'move' && d.selectedStick) say('Now click an empty outline to place your stick.');
    else say('Read the equation you made. Does it balance?');
  }
  function updateEquationPreview() {
    const result = E.evaluateSticks(puzzle(), current().sticks);
    $('equation-preview').textContent = result.equation ? 'Your equation: ' + result.equation : 'Some sticks do not make a complete digit yet. You can undo and try another position.';
  }
  function renderHint() {
    const p = puzzle(), d = current();
    $('hint-level').textContent = d.hints ? `CLUE ${d.hints} OF ${p.hints.length}` : 'NEED A LITTLE CLUE?';
    $('hint-text').textContent = d.hints ? p.hints[d.hints - 1] : 'Try it your way first. I have three clues ready whenever you need them.';
    $('hint-button').disabled = d.hints >= p.hints.length || d.solved;
    $('hint-button').textContent = d.hints >= p.hints.length ? 'All clues opened' : d.hints ? 'Another clue' : 'Give me a clue';
  }
  function recordMistake(p, d) {
    const previous = state.notes.get(p.id);
    const correct = isConcept(p) ? Object.fromEntries(p.blanks.map(key => [key, E.conceptAnswer(p, key)])) : p.type === 'pattern' ? Object.fromEntries(p.blanks.map(i => [i, p.cells[i]])) : p.type === 'table' ? Object.fromEntries(p.blanks.map(key => [key, E.tableAnswer(p, key)])) : E.getStickSolutions(p);
    state.notes.set(p.id, { questionId: p.id, questionShape: copy(p), grade: p.grade, skill: p.type + (p.kind ? ':' + p.kind : ''), yourAnswer: copy(p.type === 'sticks' ? d.sticks : d.answers), correctAnswer: copy(correct), timestamp: new Date().toISOString(), attempts: Math.max(0, Number(previous?.attempts) || 0) + 1, resolved: false });
  }
  let popupReturnFocus = null, advanceAfterPopup = false;
  function retryFocus() {
    if (isConcept(puzzle())) return [...document.querySelectorAll('[data-concept-answer]')].find(input => !input.value) || document.querySelector(`[data-concept-answer="${current().selected}"]`) || document.querySelector('[data-concept-answer]');
    if (puzzle().type === 'table') return document.querySelector('.cell-error input') || [...document.querySelectorAll('[data-answer]')].find(input => !input.value) || document.querySelector('[data-answer]');
    if (puzzle().type === 'pattern') return document.querySelector('[data-piece][aria-pressed="true"]') || document.querySelector(`[data-cell="${current().selected}"]`);
    return $('undo-stick')?.disabled === false ? $('undo-stick') : document.querySelector('.stick-segment.on:not(:disabled)');
  }
  function showAnswerPopup(kind, message) {
    const success = kind === 'success', incomplete = kind === 'incomplete';
    const dialog = $('answer-dialog');
    advanceAfterPopup = false;
    popupReturnFocus = success ? $('visual-explanation') : retryFocus();
    dialog.className = 'answer-dialog ' + kind;
    $('answer-dialog-symbol').textContent = success ? '✓' : incomplete ? '?' : '↶';
    $('answer-dialog-eyebrow').textContent = success ? 'CLUE CRACKED' : incomplete ? 'ONE MORE STEP' : 'KEEP INVESTIGATING';
    $('answer-dialog-title').textContent = success ? 'You cracked the clue!' : incomplete ? 'Add your answer first' : 'Try again, detective!';
    $('answer-dialog-message').textContent = message;
    $('answer-dialog-dismiss').textContent = success ? (state.run.index === state.run.ids.length - 1 ? (state.run.mode === 'case' ? 'Close this case →' : 'Finish practice →') : 'Next clue →') : incomplete ? 'Back to the puzzle' : 'Try again →';
    $('popup-why').hidden = !success;
    $('popup-visual').hidden = !success;
    $('popup-visual').innerHTML = success ? explanationTrace(false) : '';
    // The native modal keeps background controls out of the keyboard focus order.
    dialog.showModal();
    $('answer-dialog-dismiss').focus({ preventScroll: true });
  }
  function incompleteAnswer(message) { say(message); showAnswerPopup('incomplete', message); }
  function check() {
    if (!state.ready || state.suspended) return;
    const p = puzzle(), d = current(); if (d.solved || $('answer-dialog').open) return;
    tableView?.pause();
    if (p.type === 'pattern' && p.blanks.some(i => !d.answers[i] || !d.answers[i].outer || !d.answers[i].fill || (p.kind !== 'flags' && !d.answers[i].inner))) { incompleteAnswer('Build each missing picture before checking. Choose all its features.'); return; }
    if (p.type === 'table' && p.blanks.some(key => String(d.answers[key] ?? '').trim() === '')) { incompleteAnswer('Fill each ? before checking. You can solve the blanks in any order.'); return; }
    if (p.type === 'sticks') { const delta = changes(); if (!delta.removed && !delta.added) { incompleteAnswer(`Try ${p.action === 'remove' ? 'removing' : 'moving'} one stick first.`); return; } }
    const result = validate(p, d);
    if (result.missing) { incompleteAnswer(result.message || 'Fill each blank before checking.'); return; }
    if (!result.correct) {
      d.mistakes++; recordMistake(p, d); say(result.message || 'One clue does not fit yet. Take another look, or ask Pip for a clue.', 'error');
      if (p.type === 'table') for (const key of p.blanks) { const cell = document.querySelector(`[data-table-key="${key}"]`); const right = Number(d.answers[key]) === E.tableAnswer(p, key); cell.classList.toggle('cell-correct', right); cell.classList.toggle('cell-error', !right); }
      persist(); showAnswerPopup('retry', result.message || 'One clue does not fit yet. Take another look. You can ask Pip for a clue.');
      return;
    }
    d.solved = true;
    // Only an unassisted later replay clears a tricky question. Hints remain welcome.
    const note = state.notes.get(p.id);
    if (note && d.mistakes === 0 && d.hints === 0) note.resolved = true;
    if (state.run.mode !== 'practice' && d.mistakes === 0 && d.hints === 0) {
      if (isConcept(p)) state.main.conceptMastery[p.id] = true;
      else { state.main.mastery[p.id] = true; awardBadges(); }
    }
    persist(); renderPuzzle(false);
    showAnswerPopup('success', p.type === 'sticks' ? `${result.equation}. Both sides have the same value!` : p.explanationShort || 'Great thinking! Every clue fits.');
  }
  function explanationTrace(detailed) {
    const p = puzzle(), d = current();
    if (p.type === 'magic') return `<div class="concept-explanation-grid" role="img" aria-label="Completed magic square. Every row, column and diagonal adds to ${p.magicSum}.">${p.cells.map(value => `<span>${value}</span>`).join('')}</div><div class="explanation-trace"><span class="explanation-chip">Magic sum = ${p.magicSum} · All 8 lines agree ✓</span></div>`;
    if (p.type === 'parentheses') return `<div class="explanation-trace"><span class="explanation-chip">${p.a} ${mathSign(p.outer)} (${p.b} ${mathSign(p.inner)} ${p.c})</span><span aria-hidden="true">=</span><span class="explanation-chip">${p.a} ${mathSign(p.rewriteSigns[0])} ${p.b} ${mathSign(p.rewriteSigns[1])} ${p.c}</span></div>`;
    if (p.type === 'rule') return `<div class="explanation-trace"><span class="explanation-chip">Y = X ${mathSign(p.ruleSign)} ${p.ruleAmount}</span>${p.pairs.slice(0, detailed ? p.pairs.length : 1).map(pair => `<span class="explanation-chip">${pair.x} ${mathSign(p.ruleSign)} ${p.ruleAmount} = ${pair.y}</span>`).join('')}</div>`;
    if (p.type === 'pattern') return `<div class="explanation-trace">${(detailed ? p.blanks : p.blanks.slice(0, 1)).map(i => `<span class="explanation-chip">${shapeSVG(d.answers[i], p.kind)}<span>Row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1} ✓</span></span>`).join('')}</div>`;
    if (p.type === 'sticks') return `<div class="explanation-trace"><span class="explanation-chip">Before: ${escapeHTML(p.symbols.join('').replace(/([+\-=])/g, ' $1 ').replace(/-/g, '−'))}</span><span aria-hidden="true">→</span><span class="explanation-chip explanation-equation">${escapeHTML(E.evaluateSticks(p, d.sticks).equation)} <span aria-label="true">✓</span></span></div>`;
    const equations = p.solutionSteps ? p.solutionSteps.map(step => step.equation) : p.blanks.map(key => {
      if (key.startsWith('r')) { const r = Number(key.slice(1)), c = p.cols.findIndex((_, i) => !p.blanks.includes(`v${r}_${i}`) && !p.blanks.includes('c' + i)); const col = c < 0 ? 0 : c; return `${p.rows[r] + p.cols[col]} − ${p.cols[col]} = ${p.rows[r]}`; }
      if (key.startsWith('c')) { const c = Number(key.slice(1)), r = p.rows.findIndex((_, i) => !p.blanks.includes(`v${i}_${c}`) && !p.blanks.includes('r' + i)); const row = r < 0 ? 0 : r; return `${p.rows[row] + p.cols[c]} − ${p.rows[row]} = ${p.cols[c]}`; }
      const [r, c] = key.slice(1).split('_').map(Number); return `${p.rows[r]} + ${p.cols[c]} = ${p.rows[r] + p.cols[c]}`;
    });
    return `<div class="explanation-trace">${equations.slice(0, detailed ? 5 : 2).map(eq => `<span class="explanation-chip">${eq}</span>`).join('')}</div>`;
  }
  function renderExplanation() {
    const p = puzzle();
    $('visual-explanation').hidden = false;
    const explanation = p.type === 'sticks' ? `You ${p.action === 'remove' ? 'removed' : 'moved'} exactly one stick, kept every digit and sign valid, and made both sides equal.` : p.explanation;
    $('visual-explanation').innerHTML = `<h3 class="explanation-heading">Here is why it works</h3>${explanationTrace(true)}<p>${escapeHTML(explanation)}</p>`;
    if (p.type === 'pattern') {
      const indices = p.visualTrace?.patternIndices || p.cells.map((_, i) => i).filter(i => Math.floor(i / 3) === Math.floor(p.blanks[0] / 3) || i % 3 === p.blanks[0] % 3);
      [...document.querySelectorAll('.pattern-cell')].forEach((cell, i) => cell.classList.toggle('explained', indices.includes(i)));
    } else if (p.type === 'table') {
      tableView?.refresh();
    }
  }
  function next() {
    if (!state.ready || state.suspended || !current().solved) return;
    if (state.run.index + 1 < state.run.ids.length) { state.run.index++; persist(); renderPuzzle(); }
    else complete();
  }
  function badgeName(id) {
    return ({ 'first-case': 'First case closed', 'grade-2': 'Grade 2 detective', 'grade-3': 'Grade 3 detective', 'clues-5': 'Clue spotter · 5', 'clues-15': 'Pattern finder · 15', 'clues-30': 'Super sleuth · 30', 'clues-60': 'Master detective · 60' })[id] || 'Detective badge';
  }
  function earnBadge(id) { if (!state.main.badges.includes(id)) state.main.badges.push(id); }
  function awardBadges() {
    const n = E.puzzles.filter(p => state.main.mastery[p.id] === true).length;
    for (const target of [5, 15, 30, 60]) if (n >= target) earnBadge('clues-' + target);
    if (E.cases.some(c => state.main.completed[c.id])) earnBadge('first-case');
    for (const grade of [2, 3]) if (E.cases.filter(c => c.grade === grade).every(c => state.main.completed[c.id])) earnBadge('grade-' + grade);
  }
  function complete() {
    state.run.complete = true; screen('complete');
    const drafts = state.run.drafts, solved = drafts.filter(d => d.solved).length, independent = drafts.filter(d => d.solved && !d.mistakes && !d.hints).length;
    $('complete-eyebrow').textContent = state.run.mode === 'case' ? 'CASE CLOSED' : state.run.mode === 'practice' ? 'SECOND LOOK COMPLETE' : state.run.mode === 'concept' ? 'CONCEPT PRACTICE COMPLETE' : 'CLUES EXPLORED';
    $('complete-title').textContent = 'Good thinking, detective!';
    const stars = independent === 5 ? 3 : independent >= 3 ? 2 : 1;
    if (state.run.mode === 'case') {
      const previous = state.main.completed[state.run.id] || {};
      state.main.completed[state.run.id] = { ...previous, stars: Math.max(previous.stars || 0, stars), independent: Math.max(previous.independent || 0, independent), completedAt: new Date().toISOString() };
      state.pendingSessions.push({ level: state.run.id, stats: { total: solved, correct: solved, independent, grade: state.grade, hints: drafts.reduce((n, d) => n + d.hints, 0) } });
      awardBadges();
    } else if (state.run.mode === 'practice') {
      const previous = state.main.practice || {};
      state.main.practice = { sessions: (previous.sessions || 0) + 1, solved: (previous.solved || 0) + solved, independent: (previous.independent || 0) + independent };
    }
    persist();
    $('complete-copy').textContent = state.run.mode === 'case' ? E.cases.find(c => c.id === state.run.id).finish : state.run.mode === 'practice' ? 'You gave those tricky clues another look. Independent solves clear them from your practice list.' : state.run.mode === 'concept' ? `You explored ${typeNames[state.run.type]}. Your independent solves are saved. Return to New concepts for more puzzles.` : 'You explored a detective tool. Open a case to put the clues together.';
    $('summary-grid').innerHTML = `<div class="summary-item"><strong>${solved}</strong><span>puzzles solved</span></div><div class="summary-item"><strong>${state.run.mode === 'case' ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '✓'}</strong><span>${state.run.mode === 'case' ? 'case stars' : 'practice complete'}</span></div><div class="summary-item"><strong>${independent}</strong><span>solved independently</span></div>`;
    $('complete-practice').disabled = unresolved().length === 0;
    $('complete-title').focus({ preventScroll: true });
  }
  $('brand-home').addEventListener('click', event => { event.preventDefault(); home(); });
  $('home-button').addEventListener('click', home); $('complete-home').addEventListener('click', home);
  for (const button of document.querySelectorAll('[data-grade]')) button.addEventListener('click', () => { state.grade = Number(button.dataset.grade); home(); persist(); });
  for (const button of document.querySelectorAll('[data-quick]')) button.addEventListener('click', () => start('quick', button.dataset.quick));
  for (const button of document.querySelectorAll('[data-concept]')) button.addEventListener('click', () => start('concept', button.dataset.concept));
  $('start-case').addEventListener('click', () => start('case', null, $('start-case').dataset.caseId)); $('practice-button').addEventListener('click', () => start('practice')); $('complete-practice').addEventListener('click', () => start('practice'));
  $('check-answer').addEventListener('click', check); $('next-puzzle').addEventListener('click', next);
  $('answer-dialog-dismiss').addEventListener('click', () => { advanceAfterPopup = $('answer-dialog').classList.contains('success'); $('answer-dialog').close(); });
  $('popup-why').addEventListener('click', () => { advanceAfterPopup = false; $('answer-dialog').close(); });
  $('answer-dialog-close').addEventListener('click', () => $('answer-dialog').close());
  $('answer-dialog').addEventListener('close', () => {
    if (advanceAfterPopup) { advanceAfterPopup = false; popupReturnFocus = null; next(); return; }
    const target = popupReturnFocus; popupReturnFocus = null;
    if (target?.isConnected && !target.disabled) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
  });
  $('hint-button').addEventListener('click', () => { const d = current(); if (d.solved || d.hints >= puzzle().hints.length) return; d.hints++; persist(); renderHint(); if (puzzle().type === 'pattern') markPatternClues(); });
  $('reset-answer').addEventListener('click', () => { const p = puzzle(), d = current(); d.answers = {}; d.selected = p.blanks?.[0] ?? null; d.selectedStick = null; d.history = []; if (p.type === 'sticks') d.sticks = E.makeStickState(p); persist(); renderBody(); say('A fresh workspace. Your clues are still here.'); });
  $('how-to-toggle').addEventListener('click', () => { const show = $('how-to-panel').hidden; $('how-to-panel').hidden = !show; $('how-to-toggle').setAttribute('aria-expanded', String(show)); });
  $('retry-save').addEventListener('click', () => { if (!state.ready && store.ready()) bootstrap(); else { const result = persist(true); bridge?.saveState(descriptor(), result); } });
  $('reset-progress').addEventListener('click', () => { if (store.ready() && !state.suspended) $('reset-dialog').showModal(); });
  $('cancel-reset').addEventListener('click', () => $('reset-dialog').close());
  $('confirm-reset').addEventListener('click', () => { const result = store.reset(); if (!result.ok) return; $('reset-dialog').close(); bridge?.resetProgress(); bootstrap(); });
  function hydrateRun(raw, c, mode = 'case') {
    if (!raw || raw.grade !== c.grade || !same(raw.ids, c.puzzleIds) || !Array.isArray(raw.drafts)) return null;
    const run = { id: c.id, grade: c.grade, mode, ...(mode === 'concept' ? { type: c.type } : {}), ids: [...c.puzzleIds], index: Math.min(c.puzzleIds.length - 1, Math.max(0, Math.floor(Number(raw.index) || 0))), complete: false, drafts: [] };
    run.drafts = c.puzzleIds.map((id, i) => {
      const p = catalog.find(q => q.id === id), source = raw.drafts[i] || {}, d = makeDraft(p);
      d.hints = Math.min(p.hints.length, Math.max(0, Math.floor(Number(source.hints) || 0)));
      d.mistakes = Math.max(0, Math.floor(Number(source.mistakes) || 0));
      if (p.type === 'table') {
        for (const key of p.blanks) if (/^\d{0,4}$/.test(String(source.answers?.[key] ?? ''))) d.answers[key] = String(source.answers?.[key] ?? '');
        if (p.blanks.includes(source.selected)) d.selected = source.selected;
      }
      if (p.type === 'pattern') {
        for (const key of p.blanks) { const a = source.answers?.[key]; if (!a || typeof a !== 'object') continue; const piece = {}; if ((p.kind === 'flags' ? E.FLAGS : E.SHAPES).includes(a.outer)) piece.outer = a.outer; if (E.SHAPES.includes(a.inner)) piece.inner = a.inner; if (E.FILLS.includes(a.fill)) piece.fill = a.fill; d.answers[key] = piece; }
        if (p.blanks.includes(source.selected)) d.selected = source.selected;
      }
      if (p.type === 'sticks') {
        const valid = value => Array.isArray(value) && value.length === p.symbols.length && value.every((segments, n) => Array.isArray(segments) && new Set(segments).size === segments.length && segments.every(segment => E.possibleSegments(p.symbols[n]).includes(segment)));
        if (valid(source.sticks)) d.sticks = copy(source.sticks);
        if (Array.isArray(source.history)) d.history = source.history.filter(valid).slice(-20).map(copy);
      }
      if (isConcept(p)) {
        for (const key of p.blanks) {
          const value = source.answers?.[key];
          if (key === 'sign') { if (['', '+', '-'].includes(value)) d.answers[key] = value; }
          else if (typeof value === 'string' && /^\d{0,4}$/.test(value)) d.answers[key] = value;
        }
        if (p.blanks.includes(source.selected)) d.selected = source.selected;
      }
      if (source.solved === true) d.solved = validate(p, d).correct;
      return d;
    });
    // Resume at the first unfinished clue; completed cases are replayable.
    const unfinished = run.drafts.findIndex(d => !d.solved);
    if (unfinished >= 0 && run.index > unfinished) run.index = unfinished;
    run.complete = raw.complete === true && unfinished < 0;
    return run;
  }
  function hydrateConceptRun(raw, type) {
    if (!raw || raw.mode !== 'concept' || raw.type !== type || raw.id !== `g3-concept-${type}` || raw.grade !== 3 || !Array.isArray(raw.ids) || raw.ids.length !== 5 || new Set(raw.ids).size !== raw.ids.length || raw.ids.some(id => !catalog.some(p => p.id === id && p.grade === 3 && p.type === type))) return null;
    return hydrateRun(raw, { id: raw.id, type, grade: 3, puzzleIds: raw.ids }, 'concept');
  }
  function bootstrap() {
    if (!store.ready()) return;
    const saved = store.load();
    $('reset-progress').disabled = false;
    if (!store.status().ok) { state.ready = false; $('home-screen').hidden = true; $('profile-wait').hidden = false; $('profile-wait-message').textContent = 'Your saved progress could not be opened. Try again below, or use Reset my progress to start this game over.'; return; }
    state.main = saved.main; state.main.completed = state.main.completed || {}; state.main.mastery = state.main.mastery || {}; state.main.conceptMastery = state.main.conceptMastery || {}; state.main.conceptRuns = state.main.conceptRuns || {}; state.main.badges = Array.isArray(state.main.badges) ? state.main.badges.filter(id => typeof id === 'string') : [];
    // Keep future catalog entries opaque when opening a backup with an older game.
    for (const c of E.cases) if (state.main.completed[c.id]) {
      const done = state.main.completed[c.id];
      if (!Number.isFinite(done.stars)) delete state.main.completed[c.id];
      else state.main.completed[c.id] = { ...done, stars: Math.max(0, Math.min(3, Math.floor(done.stars))) };
    }
    state.cases = new Map();
    for (const c of E.cases) { const run = hydrateRun(state.main.cases?.[c.id], c); if (run) state.cases.set(c.id, run); }
    state.conceptRuns = new Map();
    for (const type of conceptTypes) { const run = hydrateConceptRun(state.main.conceptRuns[type], type); if (run) state.conceptRuns.set(type, run); }
    state.notes = new Map(Object.entries(saved.wrongs || {}));
    state.grade = state.main.grade === 3 ? 3 : 2; state.run = null; state.ready = true; state.suspended = false; state.sentStars = new Map(); state.sentBadges = new Set(); state.pendingSessions = [];
    $('profile-wait').hidden = true; home();
  }
  if (bridge) {
    bridge.onHubMessage('goHome', () => { if ($('answer-dialog').open) { advanceAfterPopup = false; $('answer-dialog').close(); } if ($('reset-dialog').open) $('reset-dialog').close(); persist(); home(); });
    bridge.onHubMessage('requestState', () => { const result = persist(true); bridge.saveState(state.ready ? descriptor() : null, result); });
    bridge.onHubMessage('resumeState', () => { /* Own profile-scoped state is authoritative; Continue is explicit. */ });
    bridge.onHubMessage('suspendSession', () => { tableView?.destroy(); tableView = null; state.suspended = true; state.ready = false; advanceAfterPopup = false; if ($('answer-dialog').open) $('answer-dialog').close(); if ($('reset-dialog').open) $('reset-dialog').close(); for (const name of ['home','play','complete']) $(name + '-screen').hidden = true; $('profile-wait').hidden = false; $('profile-wait-message').textContent = 'This game session is closed. Return to the hub to continue.'; });
    bridge.onProfileReady(bootstrap);
  }
  window.addEventListener('pagehide', () => { tableView?.pause(); if (state.ready && !state.suspended) persist(); });
  window.LogicDetectives = Object.freeze({ getStatus: () => ({ ready: state.ready, grade: state.grade, mode: state.run?.mode, caseId: state.run?.id, currentQuestion: state.run ? puzzle()?.id : null, notes: copy([...state.notes.values()]), solved: state.run ? current().solved : false, checkpoint: descriptor() }) });
  if (!bridge || !bridge.isEmbedded()) bootstrap();
})();
