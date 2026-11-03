/* Visible-clue guidance for addition tables. Never supplies a missing answer. */
(function (root) {
  'use strict';

  const roles = ['start', 'add', 'total'];
  const labels = ['Starting number', 'Adding number', 'Total'];
  function isTable(puzzle) {
    return puzzle?.type === 'table' && Array.isArray(puzzle.rows) && Array.isArray(puzzle.cols) && Array.isArray(puzzle.blanks);
  }
  function relation(row, col) {
    const rowKey = 'r' + row, colKey = 'c' + col, totalKey = `v${row}_${col}`;
    return { row, col, rowKey, colKey, totalKey, keys: [rowKey, colKey, totalKey] };
  }
  function candidates(puzzle, key) {
    if (!isTable(puzzle) || typeof key !== 'string') return [];
    let match = key.match(/^r(\d+)$/);
    if (match && Number(match[1]) < puzzle.rows.length) return puzzle.cols.map((_, col) => relation(Number(match[1]), col));
    match = key.match(/^c(\d+)$/);
    if (match && Number(match[1]) < puzzle.cols.length) return puzzle.rows.map((_, row) => relation(row, Number(match[1])));
    match = key.match(/^v(\d+)_(\d+)$/);
    if (match && Number(match[1]) < puzzle.rows.length && Number(match[2]) < puzzle.cols.length) return [relation(Number(match[1]), Number(match[2]))];
    return [];
  }
  function chooseRelation(puzzle, key) {
    const options = candidates(puzzle, key);
    // Prefer a relation supported by printed clues. For a missing label,
    // a printed total gives a useful target even when another label is needed.
    options.sort((a, b) => {
      const blanks = option => option.keys.filter(other => other !== key && puzzle.blanks.includes(other)).length;
      return blanks(a) - blanks(b) || Number(puzzle.blanks.includes(a.totalKey)) - Number(puzzle.blanks.includes(b.totalKey)) || a.row - b.row || a.col - b.col;
    });
    return options[0] || null;
  }
  function visibleValue(puzzle, key, answers) {
    if (puzzle.blanks.includes(key)) {
      const entered = String(answers?.[key] ?? '').trim();
      return /^\d{1,4}$/.test(entered) ? entered : '';
    }
    const option = candidates(puzzle, key)[0];
    if (!option) return '';
    const value = key[0] === 'r' ? puzzle.rows[option.row] : key[0] === 'c' ? puzzle.cols[option.col] : puzzle.rows[option.row] + puzzle.cols[option.col];
    return Number.isFinite(value) ? String(value) : '';
  }
  function getExample(puzzle) {
    if (!isTable(puzzle)) return null;
    for (let row = 0; row < puzzle.rows.length; row++) for (let col = 0; col < puzzle.cols.length; col++) {
      const example = relation(row, col);
      if (example.keys.every(key => !puzzle.blanks.includes(key))) return example;
    }
    return null;
  }
  function getRowExamples(puzzle) {
    if (!isTable(puzzle)) return [];
    let examples = [];
    for (let row = 0; row < puzzle.rows.length; row++) {
      if (!Number.isFinite(puzzle.rows[row])) continue;
      const printed = [];
      for (let col = 0; col < puzzle.cols.length; col++) {
        if (!Number.isFinite(puzzle.cols[col]) || !Number.isFinite(puzzle.rows[row] + puzzle.cols[col])) continue;
        const example = relation(row, col);
        if (example.keys.every(key => !puzzle.blanks.includes(key))) printed.push(example);
      }
      // Keep one starting number throughout the demonstration. Missing labels
      // and missing totals stay unknown even after the child has typed in them.
      if (printed.length > examples.length) examples = printed;
    }
    return examples;
  }
  function describe(puzzle, key, answers = {}) {
    const chosen = chooseRelation(puzzle, key);
    if (!chosen) return null;
    const terms = chosen.keys.map((termKey, index) => ({ key: termKey, value: visibleValue(puzzle, termKey, answers), role: roles[index], label: labels[index], selected: termKey === key }));
    const prerequisites = terms.filter(term => !term.selected && term.value === '').map(term => term.key);
    let prompt;
    if (prerequisites.length > 1) prompt = 'Fill the other outlined boxes first. Then come back to this number.';
    else if (prerequisites.length) {
      const role = terms.find(term => term.key === prerequisites[0]).role;
      prompt = role === 'start' ? 'First find the outlined starting number on the left. Then come back here.' : role === 'add' ? 'First find the outlined adding number at the top. Then come back here.' : 'First find the outlined total inside the board. Then come back here.';
    } else if (key === chosen.totalKey) prompt = `Add ${terms[0].value} and ${terms[1].value}. Type the total in the outlined box.`;
    else if (key === chosen.colKey) prompt = `${terms[0].value} + what number makes ${terms[2].value}?`;
    else prompt = `What number + ${terms[1].value} makes ${terms[2].value}?`;
    return { relation: chosen, terms, prompt, prerequisites };
  }

  root.LogicDetectivesTableGuide = Object.freeze({ chooseRelation, getExample, getRowExamples, describe });
})(typeof window === 'undefined' ? globalThis : window);
