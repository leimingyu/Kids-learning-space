/* Desktop interaction study. All notes stay in memory; no hub or browser saves. */
(function () {
  'use strict';
  const E = window.LogicDetectivesEngine;
  const $ = id => document.getElementById(id);
  const state = { grade: 2, run: null, cases: new Map(), notes: new Map(), svgId: 0 };
  const cases = {
    2: { title: 'The Mixed-Up Parade', description: 'The flags are mixed up and the parade gate is stuck. Can you put the clues together?', finish: 'The pictures are sorted, the number machine works, and the parade gate is open. The town is ready to celebrate!' },
    3: { title: 'The Clocktower Code', description: 'The clocktower workshop has gone quiet. Follow the patterns and bring its clever machines back to life.', finish: 'The workshop is working again! You connected the clues, found the hidden numbers, and repaired the clocktower code.' }
  };
  const names = { circle: 'Circle', triangle: 'Triangle', square: 'Square', rectangle: 'Rectangle', notch: 'Notched flag', pennant: 'Triangle flag', empty: 'Empty', stripe: 'Striped', solid: 'Solid' };
  const typeNames = { pattern: 'Pattern clues', table: 'Number machine', sticks: 'Stick repair' };
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
  function puzzle() { return E.puzzles.find(p => p.id === state.run.ids[state.run.index]); }
  function current() { return state.run.drafts[state.run.index]; }
  function makeDraft(p) { return { answers: {}, piece: {}, selected: p.blanks?.[0] ?? null, sticks: p.type === 'sticks' ? E.makeStickState(p) : null, selectedStick: null, history: [], hints: 0, mistakes: 0, solved: false, reason: false, reasonAttempts: 0 }; }
  function unresolved() { return [...state.notes.values()].filter(note => !note.resolved && note.grade === state.grade); }
  function screen(name) {
    for (const s of ['home', 'play', 'complete']) $(s + '-screen').hidden = s !== name;
    $('home-button').hidden = name === 'home';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function home() {
    screen('home');
    for (const button of document.querySelectorAll('[data-grade]')) {
      const active = Number(button.dataset.grade) === state.grade;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    const c = cases[state.grade];
    $('case-label').textContent = 'CASE FILE 00' + state.grade;
    $('case-title').textContent = c.title; $('case-description').textContent = c.description;
    $('stick-quick-label').innerHTML = (state.grade === 2 ? 'Remove one stick' : 'Move one stick') + ' <span aria-hidden="true">↗</span>';
    const canContinue = state.cases.has(state.grade) && !state.cases.get(state.grade).complete;
    $('start-case').innerHTML = (canContinue ? 'Continue the case' : 'Open the case') + ' <span aria-hidden="true">→</span>';
    const n = unresolved().length;
    $('practice-count').textContent = String(n); $('practice-button').disabled = n === 0;
    $('practice-summary').textContent = n ? `${n} tricky ${n === 1 ? 'puzzle is' : 'puzzles are'} ready for another look in Grade ${state.grade}.` : 'Tricky puzzles will collect here while you play.';
  }
  function start(mode, type) {
    const ids = mode === 'practice' ? unresolved().map(note => note.questionId) : E.puzzles.filter(p => p.grade === state.grade && (!type || p.type === type)).map(p => p.id);
    if (!ids.length) return;
    if (mode === 'case' && state.cases.has(state.grade) && !state.cases.get(state.grade).complete) { state.run = state.cases.get(state.grade); renderPuzzle(); return; }
    state.run = { mode, grade: state.grade, ids, index: 0, drafts: ids.map(id => makeDraft(E.puzzles.find(p => p.id === id))), complete: false };
    if (mode === 'case') state.cases.set(state.grade, state.run);
    renderPuzzle();
  }
  function say(message, status = 'neutral') { $('feedback').textContent = message; $('feedback').className = 'feedback ' + status; }
  function renderPuzzle(focus = true) {
    const p = puzzle(), d = current();
    screen('play');
    $('run-label').textContent = `Grade ${state.grade} / ${state.run.mode === 'case' ? cases[state.grade].title : state.run.mode === 'practice' ? 'Practice tricky puzzles' : 'Try a puzzle'}`;
    $('mission-track').innerHTML = state.run.ids.map((id, i) => `<span class="track-step ${i === state.run.index ? 'current' : ''} ${state.run.drafts[i].solved ? 'done' : ''}" aria-label="Clue ${i + 1}${state.run.drafts[i].solved ? ', solved' : i === state.run.index ? ', current' : ''}">${state.run.drafts[i].solved ? '✓' : i + 1}</span>`).join('');
    $('puzzle-type').textContent = typeNames[p.type] + (p.kind === 'flags' ? ' · Flags' : p.kind === 'shapes' ? ' · Shapes' : '');
    $('step-count').textContent = `Clue ${state.run.index + 1} of ${state.run.ids.length}`;
    $('puzzle-title').textContent = p.title; $('scene-text').textContent = p.scene;
    $('instruction').textContent = p.type === 'pattern' ? (p.grade === 2 ? 'Choose the piece that completes the grid.' : 'Build both missing pictures. Check each feature.') : p.type === 'table' ? 'Fill the missing labels and totals. You choose where to start.' : 'Repair this false equation. Try an idea, then check it.';
    $('rule-banner').textContent = p.type === 'pattern' ? (p.kind === 'flags' ? 'Each row AND column needs one of each flag shape and one of each filling.' : 'Each row AND column needs one of each outside shape, inside shape, and filling.') : p.type === 'table' ? 'Left row number + top column number = the number where they meet.' : (p.action === 'remove' ? 'Remove exactly ONE stick. Keep every digit valid and keep the equals sign.' : 'Move exactly ONE stick to an empty position. Keep every digit valid and keep the equals sign.');
    $('partner-text').textContent = p.type === 'pattern' ? 'Look at the shape and the filling separately. They each have a job to do.' : p.type === 'table' ? 'Start with a blank that has two useful clues. You choose the order.' : 'The numbers and the operation sign are both clues. Undo is always here.';
    renderBody(); renderHint();
    $('reason-panel').hidden = !d.solved;
    $('check-answer').hidden = d.solved; $('reset-answer').hidden = d.solved;
    $('next-puzzle').hidden = !d.solved; $('next-puzzle').disabled = !d.reason;
    const finishLabel = state.run.mode === 'case' ? 'Finish the case' : state.run.mode === 'practice' ? 'Finish practice' : 'Finish try-out';
    $('next-puzzle').innerHTML = (state.run.index === state.run.ids.length - 1 ? finishLabel : 'Next clue') + ' <span aria-hidden="true">→</span>';
    if (d.solved) { renderReason(); say(p.explanation, 'success'); }
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
    if (p.type === 'pattern') renderPattern(); else if (p.type === 'table') renderTable(); else renderSticks();
  }
  function renderPattern() {
    const p = puzzle(), d = current();
    $('puzzle-area').innerHTML = `<div class="pattern-layout"><div><div class="pattern-grid" role="group" aria-label="Picture grid">${p.cells.map((cell, i) => {
      const blank = p.blanks.includes(i), piece = blank ? d.answers[i] : cell;
      const content = shapeSVG(piece, p.kind) + (blank ? `<span class="cell-label">${i === d.selected ? 'Building here' : piece ? 'Your piece' : 'Click to build'}</span>` : '');
      const label = `Row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1}: ${pieceName(piece, p.kind)}`;
      return blank ? `<button class="pattern-cell blank ${i === d.selected ? 'selected' : ''} ${piece ? 'filled' : ''}" data-cell="${i}" aria-label="${escapeHTML(label)}" aria-pressed="${i === d.selected}" ${d.solved ? 'disabled' : ''}>${content}</button>` : `<div class="pattern-cell" role="img" aria-label="${escapeHTML(label)}">${content}</div>`;
    }).join('')}</div><p class="palette-note">${p.blanks.length > 1 ? 'Click either missing picture to work on it.' : 'Check both the row and the column.'}</p></div><div class="piece-builder" id="piece-builder"></div></div>`;
    for (const button of document.querySelectorAll('[data-cell]')) button.addEventListener('click', () => { d.selected = Number(button.dataset.cell); renderPattern(); document.querySelector(`[data-cell="${d.selected}"]`)?.focus(); });
    renderBuilder();
    if (d.hints) markPatternClues();
  }
  function renderBuilder() {
    const p = puzzle(), d = current(), index = d.selected;
    const answer = d.answers[index] || {};
    if (d.solved) { $('piece-builder').innerHTML = '<h3 class="builder-heading">Every clue fits.</h3><p>Look at your completed grid. Then tell Pip how you knew.</p>'; return; }
    if (p.grade === 2) {
      const right = p.cells[index];
      const outers = p.kind === 'flags' ? ['rectangle', 'notch', 'pennant'] : ['circle', 'triangle', 'square'];
      const candidates = [copy(right), { ...right, fill: ['empty', 'stripe', 'solid'][(['empty', 'stripe', 'solid'].indexOf(right.fill) + 1) % 3] }, { ...right, outer: outers[(outers.indexOf(right.outer) + 1) % 3] }];
      const shift = index % 3; const choices = candidates.slice(shift).concat(candidates.slice(0, shift));
      $('piece-builder').innerHTML = `<h3 class="builder-heading">Which piece belongs?</h3><p class="palette-note">Click a piece, then check your idea.</p><div class="complete-pieces">${choices.map((candidate, i) => `<button class="choice-button whole-piece" data-piece="${i}" aria-label="${escapeHTML(pieceName(candidate, p.kind))}" aria-pressed="${same(answer, candidate)}">${shapeSVG(candidate, p.kind)}<span>Piece ${String.fromCharCode(65 + i)}</span></button>`).join('')}</div>`;
      for (const button of document.querySelectorAll('[data-piece]')) button.addEventListener('click', () => { d.answers[index] = copy(choices[Number(button.dataset.piece)]); renderPattern(); document.querySelector(`[data-piece="${button.dataset.piece}"]`)?.focus(); say('Your piece is in the grid. Check whether all its features fit.'); });
    } else {
      const groups = [{ key: 'outer', label: p.kind === 'flags' ? '1. Flag shape' : '1. Outside shape', options: p.kind === 'flags' ? ['rectangle', 'notch', 'pennant'] : ['circle', 'triangle', 'square'] }];
      if (p.kind !== 'flags') groups.push({ key: 'inner', label: '2. Inside shape', options: ['circle', 'triangle', 'square'] });
      groups.push({ key: 'fill', label: p.kind === 'flags' ? '2. Filling' : '3. Inside filling', options: ['empty', 'stripe', 'solid'] });
      $('piece-builder').innerHTML = `<h3 class="builder-heading">Build your missing picture</h3><p class="palette-note">Row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}</p>${groups.map(group => `<div class="builder-group"><strong>${group.label}</strong><div class="builder-options" role="group" aria-label="${group.label}">${group.options.map(option => `<button class="choice-button" data-feature="${group.key}" data-value="${option}" aria-pressed="${answer[group.key] === option}">${group.key === 'fill' ? `<span class="choice-swatch ${option}" aria-hidden="true"></span>` : ''}${names[option]}</button>`).join('')}</div></div>`).join('')}<div class="preview-piece"><span class="preview-title">Your picture</span>${Object.keys(answer).length ? shapeSVG(answer, p.kind) : '<span class="missing-mark">?</span>'}</div>`;
      for (const button of document.querySelectorAll('[data-feature]')) {
        if (button.dataset.feature !== 'fill') button.insertAdjacentHTML('afterbegin', shapeSVG({ outer: button.dataset.value, fill: 'empty' }, button.dataset.feature === 'outer' ? p.kind : 'shapes'));
        button.addEventListener('click', () => { d.answers[index] = { ...answer, [button.dataset.feature]: button.dataset.value }; renderPattern(); document.querySelector(`[data-feature="${button.dataset.feature}"][data-value="${button.dataset.value}"]`)?.focus(); });
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
    function cell(key, value, tag) {
      const blank = p.blanks.includes(key);
      return `<${tag} ${tag === 'th' ? (key.startsWith('c') ? 'scope="col"' : 'scope="row"') : ''} data-table-key="${key}" class="${blank ? 'needs-answer' : ''}">${blank ? `<label class="sr-only" for="answer-${key}">${key.startsWith('r') ? `Missing row ${Number(key.slice(1)) + 1} header` : key.startsWith('c') ? `Missing column ${Number(key.slice(1)) + 1} header` : `Row ${Number(key.slice(1).split('_')[0]) + 1}, column ${Number(key.split('_')[1]) + 1}`}</label><input id="answer-${key}" class="table-input" type="text" inputmode="numeric" autocomplete="off" maxlength="4" data-answer="${key}" value="${escapeHTML(d.answers[key] ?? '')}" placeholder="?" ${d.solved ? 'disabled' : ''}>` : value}</${tag}>`;
    }
    $('puzzle-area').innerHTML = `<div class="table-wrap"><table class="number-table"><caption class="sr-only">Addition table: add the left header and the top header to fill each intersection.</caption><thead><tr><th scope="col" class="operation-cell">+</th>${p.cols.map((value, col) => cell('c' + col, value, 'th')).join('')}</tr></thead><tbody>${p.rows.map((value, row) => `<tr>${cell('r' + row, value, 'th')}${p.cols.map((_, col) => cell(`v${row}_${col}`, E.tableAnswer(p, `v${row}_${col}`), 'td')).join('')}</tr>`).join('')}</tbody></table><p class="table-caption">Click a ? and type. <kbd>Tab</kbd> moves to the next blank. <kbd>Enter</kbd> checks your answers.</p></div>`;
    for (const input of document.querySelectorAll('[data-answer]')) {
      input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, ''); d.answers[input.dataset.answer] = input.value; input.closest('th,td').classList.remove('cell-error', 'cell-correct'); });
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); check(); } });
      input.addEventListener('focus', () => highlightTable(input.dataset.answer));
    }
  }
  function highlightTable(key) {
    const p = puzzle();
    let keys = [key];
    if (key.startsWith('v')) { const [row, col] = key.slice(1).split('_'); keys.push('r' + row, 'c' + col); }
    else if (key.startsWith('r')) { const row = Number(key.slice(1)); p.cols.forEach((_, col) => keys.push(`v${row}_${col}`, 'c' + col)); }
    else { const col = Number(key.slice(1)); p.rows.forEach((_, row) => keys.push(`v${row}_${col}`, 'r' + row)); }
    for (const cell of document.querySelectorAll('[data-table-key]')) cell.classList.toggle('linked-cell', keys.includes(cell.dataset.tableKey));
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
    $('undo-stick').addEventListener('click', () => { d.sticks = d.history.pop(); d.selectedStick = null; renderSticks(); say('Your last change is undone. Try another idea.'); });
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
    renderSticks();
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
    state.notes.set(p.id, { questionId: p.id, questionShape: copy(p), grade: p.grade, skill: p.type + (p.kind ? ':' + p.kind : ''), yourAnswer: copy(p.type === 'sticks' ? d.sticks : d.answers), correctAnswer: copy(p.type === 'pattern' ? Object.fromEntries(p.blanks.map(i => [i, p.cells[i]])) : p.type === 'table' ? Object.fromEntries(p.blanks.map(key => [key, E.tableAnswer(p, key)])) : E.getStickSolutions(p)), timestamp: new Date().toISOString(), attempts: (previous?.attempts || 0) + 1, resolved: false });
  }
  let popupReturnFocus = null;
  function retryFocus() {
    if (puzzle().type === 'table') return document.querySelector('.cell-error input') || [...document.querySelectorAll('[data-answer]')].find(input => !input.value) || document.querySelector('[data-answer]');
    if (puzzle().type === 'pattern') return document.querySelector('[data-piece][aria-pressed="true"]') || document.querySelector(`[data-cell="${current().selected}"]`);
    return $('undo-stick')?.disabled === false ? $('undo-stick') : document.querySelector('.stick-segment.on:not(:disabled)');
  }
  function showAnswerPopup(kind, message) {
    const success = kind === 'success', incomplete = kind === 'incomplete';
    const dialog = $('answer-dialog');
    popupReturnFocus = success ? document.querySelector('[data-reason]') : retryFocus();
    dialog.className = 'answer-dialog ' + kind;
    $('answer-dialog-symbol').textContent = success ? '✓' : incomplete ? '?' : '↶';
    $('answer-dialog-eyebrow').textContent = success ? 'CLUE CRACKED' : incomplete ? 'ONE MORE STEP' : 'KEEP INVESTIGATING';
    $('answer-dialog-title').textContent = success ? 'You cracked the clue!' : incomplete ? 'Add your answer first' : 'Try again, detective!';
    $('answer-dialog-message').textContent = message;
    $('answer-dialog-dismiss').textContent = success ? 'Show my reasoning →' : incomplete ? 'Back to the puzzle' : 'Try again →';
    // The native modal keeps background controls out of the keyboard focus order.
    dialog.showModal();
    $('answer-dialog-dismiss').focus({ preventScroll: true });
  }
  function incompleteAnswer(message) { say(message); showAnswerPopup('incomplete', message); }
  function check() {
    const p = puzzle(), d = current(); if (d.solved || $('answer-dialog').open) return;
    if (p.type === 'pattern' && p.blanks.some(i => !d.answers[i] || !d.answers[i].outer || !d.answers[i].fill || (p.kind !== 'flags' && !d.answers[i].inner))) { incompleteAnswer('Build each missing picture before checking. Choose all its features.'); return; }
    if (p.type === 'table' && p.blanks.some(key => String(d.answers[key] ?? '').trim() === '')) { incompleteAnswer('Fill each ? before checking. You can solve the blanks in any order.'); return; }
    if (p.type === 'sticks') { const delta = changes(); if (!delta.removed && !delta.added) { incompleteAnswer(`Try ${p.action === 'remove' ? 'removing' : 'moving'} one stick first.`); return; } }
    const result = p.type === 'pattern' ? E.validatePattern(p, d.answers) : p.type === 'table' ? E.validateTable(p, d.answers) : E.evaluateSticks(p, d.sticks);
    if (!result.correct) {
      d.mistakes++; recordMistake(p, d); say(result.message || 'One clue does not fit yet. Take another look, or ask Pip for a clue.', 'error');
      if (p.type === 'table') for (const key of p.blanks) { const cell = document.querySelector(`[data-table-key="${key}"]`); const right = Number(d.answers[key]) === E.tableAnswer(p, key); cell.classList.toggle('cell-correct', right); cell.classList.toggle('cell-error', !right); }
      showAnswerPopup('retry', result.message || 'One clue does not fit yet. Take another look. You can ask Pip for a clue.');
      return;
    }
    d.solved = true;
    // Only an unassisted later replay clears a tricky question. Hints remain welcome.
    const note = state.notes.get(p.id);
    if (note && d.mistakes === 0 && d.hints === 0) note.resolved = true;
    renderPuzzle(false); renderReason();
    const celebration = p.type === 'pattern' ? 'Great thinking! Your pictures complete the pattern. Now let’s share how you knew.' : p.type === 'table' ? 'Great thinking! Your numbers make the machine work. Now let’s share how you knew.' : `Great thinking! ${result.equation} is true. Now let’s share how you knew.`;
    showAnswerPopup('success', celebration);
  }
  function renderReason() {
    const p = puzzle(), d = current();
    const shift = [...p.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % p.reasonOptions.length;
    const options = p.reasonOptions.map((option, index) => ({ option, index }));
    const ordered = options.slice(shift).concat(options.slice(0, shift));
    $('reason-panel').hidden = false;
    $('reason-panel').innerHTML = `<p class="eyebrow">One last detective thought</p><h3>How did you know?</h3><div class="reason-options">${ordered.map(({ option, index }) => `<button class="reason-option ${d.reason && option.correct ? 'right selected' : ''}" data-reason="${index}" ${d.reason ? 'disabled' : ''}>${escapeHTML(option.text)}${d.reason && option.correct ? ' ✓' : ''}</button>`).join('')}</div><p class="palette-note" id="reason-feedback">${d.reason ? 'Exactly. You used a clue to explain your answer.' : 'Click the explanation that matches the rule.'}</p>`;
    for (const button of document.querySelectorAll('[data-reason]')) button.addEventListener('click', () => {
      const option = p.reasonOptions[Number(button.dataset.reason)];
      if (option.correct) { d.reason = true; renderReason(); $('next-puzzle').disabled = false; $('next-puzzle').focus({ preventScroll: true }); }
      else { d.reasonAttempts++; button.classList.add('wrong'); $('reason-feedback').textContent = 'Look at the rule again. Which explanation tells us why your answer fits?'; }
    });
  }
  function next() {
    if (!current().reason) return;
    if (state.run.index + 1 < state.run.ids.length) { state.run.index++; renderPuzzle(); }
    else complete();
  }
  function complete() {
    state.run.complete = true; screen('complete');
    const drafts = state.run.drafts, solved = drafts.filter(d => d.solved).length, independent = drafts.filter(d => d.solved && !d.mistakes && !d.hints).length;
    $('complete-eyebrow').textContent = state.run.mode === 'case' ? 'CASE CLOSED' : state.run.mode === 'practice' ? 'SECOND LOOK COMPLETE' : 'CLUES EXPLORED';
    $('complete-title').textContent = 'Good thinking, detective!';
    $('complete-copy').textContent = state.run.mode === 'case' ? cases[state.grade].finish : state.run.mode === 'practice' ? 'You gave those tricky clues another look. That is how a detective grows.' : 'You tried a detective tool. Open the full case to put the clues together.';
    $('summary-grid').innerHTML = `<div class="summary-item"><strong>${solved}</strong><span>puzzles solved</span></div><div class="summary-item"><strong>${drafts.filter(d => d.reason).length}</strong><span>reasons explained</span></div><div class="summary-item"><strong>${independent}</strong><span>solved independently</span></div>`;
    $('complete-practice').disabled = unresolved().length === 0;
    $('complete-title').focus({ preventScroll: true });
  }
  $('brand-home').addEventListener('click', event => { event.preventDefault(); home(); });
  $('home-button').addEventListener('click', home); $('complete-home').addEventListener('click', home);
  for (const button of document.querySelectorAll('[data-grade]')) button.addEventListener('click', () => { state.grade = Number(button.dataset.grade); home(); });
  for (const button of document.querySelectorAll('[data-quick]')) button.addEventListener('click', () => start('quick', button.dataset.quick));
  $('start-case').addEventListener('click', () => start('case')); $('practice-button').addEventListener('click', () => start('practice')); $('complete-practice').addEventListener('click', () => start('practice'));
  $('check-answer').addEventListener('click', check); $('next-puzzle').addEventListener('click', next);
  $('answer-dialog-dismiss').addEventListener('click', () => $('answer-dialog').close());
  $('answer-dialog-close').addEventListener('click', () => $('answer-dialog').close());
  $('answer-dialog').addEventListener('close', () => {
    const target = popupReturnFocus; popupReturnFocus = null;
    if (target?.isConnected && !target.disabled) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
  });
  $('hint-button').addEventListener('click', () => { const d = current(); if (d.solved || d.hints >= puzzle().hints.length) return; d.hints++; renderHint(); if (puzzle().type === 'pattern') markPatternClues(); });
  $('reset-answer').addEventListener('click', () => { const p = puzzle(), d = current(); d.answers = {}; d.selected = p.blanks?.[0] ?? null; d.selectedStick = null; d.history = []; if (p.type === 'sticks') d.sticks = E.makeStickState(p); renderBody(); say('A fresh workspace. Your clues are still here.'); });
  // This read-only status is for inspecting the prototype without touching game saves.
  window.LogicDetectivesPrototype = Object.freeze({ getStatus: () => ({ grade: state.grade, mode: state.run?.mode, currentQuestion: state.run ? puzzle()?.id : null, notes: copy([...state.notes.values()]), solved: state.run ? current().solved : false }) });
  home();
})();
